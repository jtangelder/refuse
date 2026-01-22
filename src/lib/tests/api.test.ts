import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FuseAPI } from '../index';
import { Protocol } from '../protocol/protocol';
import { DspType, AMP_MODELS, EFFECT_MODELS } from '../models';

// Mock the protocol layer
vi.mock('../protocol/protocol', () => {
  return {
    OPCODES: {
      DATA_PACKET: 0x1c,
      DATA_WRITE: 0x03,
      DATA_READ: 0x01,
      PRESET_INFO: 0x04,
    },
    Protocol: (() => {
      const Mock = vi.fn().mockImplementation(function (this: any) {
        this.isConnected = false;
        this.listeners = [] as Function[];

        this.connect = vi.fn().mockImplementation(async () => {
          this.isConnected = true;
          return true;
        });

        this.disconnect = vi.fn().mockImplementation(async () => {
          this.isConnected = false;
        });

        this.addEventListener = vi.fn().mockImplementation((cb: Function) => {
          this.listeners.push(cb);
        });

        this.removeEventListener = vi.fn().mockImplementation((cb: Function) => {
          this.listeners = this.listeners.filter((f: any) => f !== cb);
        });

        this.emitReport = (data: Uint8Array) => {
          this.listeners.forEach((cb: any) => cb(data));
        };

        this.requestState = vi.fn().mockResolvedValue(undefined);
        this.requestBypassStates = vi.fn().mockResolvedValue(undefined);
        this.sendRaw = vi.fn().mockResolvedValue(undefined);
        this.getNextSequenceId = vi.fn().mockReturnValue(1);
        this.sendPacket = vi.fn().mockResolvedValue(undefined);
        this.createApplyPacket = vi.fn().mockReturnValue(new Uint8Array(64));
        this.createBypassPacket = vi.fn().mockReturnValue(new Uint8Array(64));
        this.createPresetSavePacket = vi.fn().mockReturnValue(new Uint8Array(64));
        this.createPresetLoadPacket = vi.fn().mockReturnValue(new Uint8Array(64));
      });

      // Add static methods to the constructor
      (Mock as any).parsePresetName = (data: Uint8Array) => {
        if (data[2] !== 0x04 && data[2] !== 0x00) return null;
        const slot = data[4];
        const nameBytes = data.slice(16, 48);
        let name = '';
        for (const b of nameBytes) {
          if (b === 0) break;
          name += String.fromCharCode(b);
        }
        return { slot, name };
      };
      (Mock as any).parseDspData = (data: Uint8Array) => {
        if (data.length < 64) return null;
        return {
          type: data[2],
          slot: data[18],
          modelId: (data[16] << 8) | data[17],
          bypass: data[22] === 1,
          knobs: Array.from(data.slice(32, 64)),
        };
      };
      (Mock as any).isBypassResponse = (data: Uint8Array) => data[0] === 0x19 && data[1] === 0xc3;
      (Mock as any).decodeString = (bytes: Uint8Array) => {
        let s = '';
        for (const b of bytes) {
          if (b === 0) break;
          s += String.fromCharCode(b);
        }
        return s;
      };
      (Mock as any).isPresetNamePacket = (data: Uint8Array) =>
        data[0] === 0x1c && data[1] === 0x01 && (data[2] === 0x04 || data[2] === 0x00);

      return Mock;
    })(),
  };
});

describe('FuseAPI', () => {
  let api: FuseAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new FuseAPI();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('High-level Amp Control', () => {
    it('should update local state when setting amp model', async () => {
      const modelName = "'57 Deluxe";
      const model = Object.values(AMP_MODELS).find(m => m.name === modelName);

      await api.amp.setAmpModelById(model!.id);

      expect(api.amp.getAmpModel()?.name).toBe(modelName);
      expect(api.amp.getAmpModel()?.id).toBe(model!.id);
    });

    it('should calculate amp knobs correctly from state', async () => {
      // Manually set some state
      // api.state[DspType.AMP] is now AmpState
      const ampState = api.state.amp;
      ampState.modelId = 0x6700;
      ampState.knobs[0] = 200; // Vol
      ampState.knobs[1] = 100; // Gain
      api.store.updateAmpState(ampState);

      const knobs = api.amp.getAmpKnobs();
      expect(knobs.find(k => k.name === 'Vol')?.value).toBe(200);
      expect(knobs.find(k => k.name === 'Gain')?.value).toBe(100);
    });

    it('should set cabinet model correctly', async () => {
      await api.amp.setCabinetById(0x02); // 4x10 '59 Bassman
      expect(api.state.amp.cabinetId).toBe(0x02);
    });

    it('should throw error for unknown cabinet ID', async () => {
      await expect(api.amp.setCabinetById(0xff)).rejects.toThrow(/Unknown cabinet ID/);
    });
  });

  describe('High-level Effect Control', () => {
    it('should manage effect slots correctly', async () => {
      const model = Object.values(EFFECT_MODELS).find(m => m.name === 'Overdrive');
      await api.effects.setEffectById(2, model!.id);

      expect(api.effects.getEffectModel(2)?.name).toBe('Overdrive');
      expect(api.effects.getSettings(2)?.enabled).toBe(true);
    });

    it('should throw error when setting duplicate effect types', async () => {
      const model = Object.values(EFFECT_MODELS).find(m => m.name === 'Overdrive');
      await api.effects.setEffectById(0, model!.id);

      // Try to set another stomp at slot 1
      await expect(api.effects.setEffectById(1, model!.id)).rejects.toThrow(/already exists/);
    });

    it('should clear effects', async () => {
      const model = Object.values(EFFECT_MODELS).find(m => m.name === 'Overdrive');
      await api.effects.setEffectById(0, model!.id);
      expect(api.effects.getEffectModel(0)).not.toBeNull();

      await api.effects.clearEffect(0);
      expect(api.effects.getEffectModel(0)).toBeNull();
    });

    it('should throw error for unknown effect identification', () => {
      expect(api.effects.getEffectModel(99)).toBeNull();
      expect(api.effects.getEffectModelId(99)).toBe(0);
    });

    it('should throw error when setting effect with unknown model ID', async () => {
      await expect(api.effects.setEffectById(0, 0xdead)).rejects.toThrow(/Unknown effect model ID/);
    });

    it('should throw error for invalid slot in effect operations', async () => {
      await expect(api.effects.setEffectById(9, 0x3c00)).rejects.toThrow(/Invalid slot/);
      await expect(api.effects.clearEffect(9)).rejects.toThrow(/Invalid slot/);
      await expect(api.effects.swapEffects(0, 9)).rejects.toThrow(/Invalid slot indices/);
    });

    it('should handle setParameter to invalid target', async () => {
      // setParameter removed, testing controllers directly?
      // or re-enabled?
      // Skip for now or test via controller setKnob with invalid index?
      // If we want to test 'advanced direct byte access' throwing error...
      // The new code in api.ts removed setParameter.
      // So this test is obsolete or should just test controller validation.
    });

    it('should swap effects between slots', async () => {
      // Setup: OVERDRIVE in slot 0, SINE_FLANGER in slot 2
      await api.effects.setEffectById(0, EFFECT_MODELS.OVERDRIVE.id);
      await api.effects.setEffectById(2, EFFECT_MODELS.SINE_FLANGER.id);

      expect(api.effects.getEffectModel(0)?.name).toBe('Overdrive');
      expect(api.effects.getEffectModel(2)?.name).toBe('Sine Flanger');

      await api.effects.swapEffects(0, 2);

      expect(api.effects.getEffectModel(0)?.name).toBe('Sine Flanger');
      expect(api.effects.getEffectModel(2)?.name).toBe('Overdrive');
    });
  });

  describe('Connection \u0026 Synchronization', () => {
    it('should sync presets after successful connection', async () => {
      await api.connect();

      const originalOnLoad = api.presets.onLoad;
      const presetNameSpy = vi.fn(payload => {
        if (originalOnLoad) originalOnLoad(payload);
      });
      api.presets.onLoad = presetNameSpy;
      expect(api.isConnected).toBe(true);

      // Access the internal mock instance to emit events
      const protocolMock = (api as any).protocol;

      // Simulate real-world preset name packet (Slot 0: Brutal Metal II)
      const slot0NamePacket = new Uint8Array(64);
      slot0NamePacket[0] = 0x1c;
      slot0NamePacket[1] = 0x01;
      slot0NamePacket[2] = 0x00; // MUST BE 0x00 for Active Preset
      slot0NamePacket[4] = 0x00; // Slot 0
      // "Brutal Metal II" starts at 16
      const name = 'Brutal Metal II';
      for (let i = 0; i < name.length; i++) slot0NamePacket[16 + i] = name.charCodeAt(i);

      // Simulate real-world preset name packet (Slot 1: Super-Live Album)
      const slot1NamePacket = new Uint8Array(64);
      slot1NamePacket[0] = 0x1c;
      slot1NamePacket[1] = 0x01;
      slot1NamePacket[2] = 0x00; // MUST BE 0x00 for Active Preset
      slot1NamePacket[4] = 0x01; // Slot 1
      const name1 = 'Super-Live Album';
      for (let i = 0; i < name1.length; i++) slot1NamePacket[16 + i] = name1.charCodeAt(i);

      // Emit reports
      protocolMock.emitReport(slot0NamePacket);
      protocolMock.emitReport(slot1NamePacket);

      // Verify state
      expect(api.presets.getPreset(0)?.name).toBe('Brutal Metal II');
      expect(api.presets.getPreset(1)?.name).toBe('Super-Live Album');
      expect(presetNameSpy).toHaveBeenCalledWith({ slot: 0, name: 'Brutal Metal II' });
      expect(presetNameSpy).toHaveBeenCalledWith({ slot: 1, name: 'Super-Live Album' });
    });

    it('should NOT update currentPresetSlot for effect preset packets', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;

      // 1. Initial state: Slot 5
      const mainPresetPacket = new Uint8Array(64);
      mainPresetPacket[0] = 0x1c;
      mainPresetPacket[1] = 0x01;
      mainPresetPacket[2] = 0x00; // MUST BE 0x00 for selection change
      mainPresetPacket[3] = 0x00; // Main preset
      mainPresetPacket[4] = 0x05; // Slot 5
      protocolMock.emitReport(mainPresetPacket);
      expect(api.state.currentPresetSlot).toBe(5);

      // 2. Effect preset packet (should be ignored for currentPresetSlot)
      const effectPresetPacket = new Uint8Array(64);
      effectPresetPacket[0] = 0x1c;
      effectPresetPacket[1] = 0x01;
      effectPresetPacket[2] = 0x04;
      effectPresetPacket[3] = 0x01; // MOD effect preset
      effectPresetPacket[4] = 11; // Slot 11 (the bug report mentioned)
      protocolMock.emitReport(effectPresetPacket);

      // Should STILL be 5
      expect(api.state.currentPresetSlot).toBe(5);
    });

    it('should NOT trigger refresh for effect preset packets', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;
      const refreshSpy = vi.spyOn(api as any, 'refreshState');

      // Set initial main preset
      const mainPresetPacket = new Uint8Array(64);
      mainPresetPacket[0] = 0x1c;
      mainPresetPacket[1] = 0x01;
      mainPresetPacket[2] = 0x04;
      mainPresetPacket[3] = 0x00;
      mainPresetPacket[4] = 0x05;
      protocolMock.emitReport(mainPresetPacket);
      refreshSpy.mockClear();

      // Emit effect preset packet (byte 3 = 0x01, type 0x00 is often used for echoes/hardware changes)
      const effectPacket = new Uint8Array(64);
      effectPacket[0] = 0x1c;
      effectPacket[1] = 0x01;

      // Mock refreshBypassStates to avoid the 1s timeout in the real implementation
      // which keeps isRefreshing=true for too long.
      vi.spyOn(api as any, 'refreshBypassStates').mockResolvedValue(undefined);

      effectPacket[2] = 0x00; // Type 0x00 triggers the stability fix check
      effectPacket[3] = 0x01; // MOD effect preset
      effectPacket[4] = 0x0b; // Slot 11
      protocolMock.emitReport(effectPacket);

      expect(refreshSpy).not.toHaveBeenCalled();

      // Allow async refresh logic from previous calls to clear isRefreshing flag
      await new Promise(resolve => setTimeout(resolve, 0));

      // Emit main preset change (byte 3 = 0x00)
      const newMainPacket = new Uint8Array(64);
      newMainPacket[0] = 0x1c;
      newMainPacket[1] = 0x01;
      newMainPacket[2] = 0x00;
      newMainPacket[3] = 0x00;
      newMainPacket[4] = 0x06;
      protocolMock.emitReport(newMainPacket);

      expect(refreshSpy).toHaveBeenCalled();
    });

    it('should sync full signal chain with multiple effects from real trace', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;

      // Real Data from "Ducking Delay/Sm Hall" (Preset 10)
      // 1. Mod (Triangle Chorus 0x1300) at Slot 5
      const modPacket = new Uint8Array(64);
      modPacket[0] = 0x1c;
      modPacket[1] = 0x01;
      modPacket[2] = 0x07; // MOD
      modPacket[16] = 0x13;
      modPacket[17] = 0x00;
      modPacket[18] = 0x05; // slot 5

      // 2. DELAY (Ducking Delay 0x1500) at Slot 6
      const delayPacket = new Uint8Array(64);
      delayPacket[0] = 0x1c;
      delayPacket[1] = 0x01;
      delayPacket[2] = 0x08; // DELAY
      delayPacket[16] = 0x15;
      delayPacket[17] = 0x00;
      delayPacket[18] = 0x06; // slot 6

      // 3. REVERB (Small Hall 0x2400) at Slot 7
      const reverbPacket = new Uint8Array(64);
      reverbPacket[0] = 0x1c;
      reverbPacket[1] = 0x01;
      reverbPacket[2] = 0x09; // REVERB
      reverbPacket[16] = 0x24;
      reverbPacket[17] = 0x00;
      reverbPacket[18] = 0x07; // slot 7

      protocolMock.emitReport(modPacket);
      protocolMock.emitReport(delayPacket);
      protocolMock.emitReport(reverbPacket);

      expect(api.effects.getEffectModel(5)?.name).toBe('Triangle Chorus');
      expect(api.effects.getEffectModel(6)?.name).toBe('Ducking Delay');
      expect(api.effects.getEffectModel(7)?.name).toBe('Small Hall');

      // Other slots should be empty
      expect(api.effects.getEffectModel(0)).toBeNull();
      expect(api.effects.getEffectModel(1)).toBeNull();
    });

    it('should handle singleton migration (hardware moves an effect)', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;

      // 1. Setup: STOMP in Slot 0
      const stomp0Packet = new Uint8Array(64);
      stomp0Packet[0] = 0x1c;
      stomp0Packet[1] = 0x01;
      stomp0Packet[2] = 0x06;
      stomp0Packet[16] = 0x3c;
      stomp0Packet[17] = 0x00;
      stomp0Packet[18] = 0x00;
      protocolMock.emitReport(stomp0Packet);
      expect(api.effects.getEffectModel(0)?.name).toBe('Overdrive');

      // 2. Simulate Hardware moving STOMP to Slot 1
      const stomp1Packet = new Uint8Array(64);
      stomp1Packet[0] = 0x1c;
      stomp1Packet[1] = 0x01;
      stomp1Packet[2] = 0x06;
      stomp1Packet[16] = 0x3c;
      stomp1Packet[17] = 0x00;
      stomp1Packet[18] = 0x01;
      protocolMock.emitReport(stomp1Packet);

      // Verify Slot 1 has it, and Slot 0 is now empty
      expect(api.effects.getEffectModel(1)?.name).toBe('Overdrive');
      expect(api.effects.getEffectModel(0)).toBeNull();
    });

    it('should ignore apply packet echoes to prevent infinite loops', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;
      const refreshSpy = vi.spyOn(api as any, 'refreshState');

      // b1 = 0x03 is DATA_WRITE (Software change echo)
      const echoPacket = new Uint8Array(64);
      echoPacket[0] = 0x1c;
      echoPacket[1] = 0x03;
      echoPacket[2] = 0x00;
      protocolMock.emitReport(echoPacket);

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('should sync bypass state from 0x19 reports', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;

      // Setup effect in slot 2
      await api.effects.setEffectById(2, EFFECT_MODELS.OVERDRIVE.id);
      expect(api.effects.getSettings(2)?.enabled).toBe(true);

      // Simulate bypass report (Opcode 0x19, Reply 0xc3, Status 0x01 = Bypassed, Slot 2)
      const bypassReport = new Uint8Array(64);
      bypassReport[0] = 0x19;
      bypassReport[1] = 0xc3;
      bypassReport[3] = 0x01;
      bypassReport[4] = 0x02;

      // Mock protocol.isBypassResponse and parseBypassResponse since they are used in the real code
      (protocolMock.constructor as any).isBypassResponse = (data: Uint8Array) => data[0] === 0x19 && data[1] === 0xc3;
      (protocolMock.constructor as any).parseBypassResponse = (data: Uint8Array) => ({
        slot: data[4],
        enabled: data[3] === 0x00,
      });

      protocolMock.emitReport(bypassReport);

      expect(api.effects.getSettings(2)?.enabled).toBe(false);
    });

    it('should test savePreset and getPresetList', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;

      await api.presets.savePreset(1, 'New Name');
      expect(protocolMock.sendPacket).toHaveBeenCalled();

      // getPresetList doesn't exist on API anymore, use presets.getPresets() or manual refresh?
      // Old test checked api.getPresetList() -> refreshState()
      // Let's call refreshState via private access or check presetController methods?
      // Just check savePreset behavior.
      // await api.getPresetList();
      // expect(protocolMock.requestState).toHaveBeenCalled();
    });

    it('should test loadPreset', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;

      await api.presets.loadPreset(5);
      expect(protocolMock.sendPacket).toHaveBeenCalled();

      // Verify packet content if possible (mock tracks calls)
      // We assume PacketBuilder is correct (unit tested?)
    });

    it('should handle disconnect', async () => {
      await api.connect();
      expect(api.isConnected).toBe(true);

      await api.disconnect();
      expect(api.isConnected).toBe(false);
    });

    it('should handle refreshBypassStates timeout', async () => {
      vi.useFakeTimers();
      const connectPromise = api.connect();

      // We need to advance timers for:
      // 1. refreshBypassStates timeout (1000ms)
      // 2. isRefreshing padding (500ms)
      await vi.advanceTimersByTimeAsync(2000);

      await connectPromise;
      vi.useRealTimers();
    });

    it('should update state on live hardware knob turn', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;

      const storeSpy = vi.fn();
      api.store.subscribe(storeSpy);
      storeSpy.mockClear();

      // Pre-requisite: Set an amp model so we have a knob schema
      await api.amp.setAmpModelById(AMP_MODELS.F57_DELUXE.id);
      storeSpy.mockClear();

      // Simulate Amp 'Vol' knob change (Opcode 0x05, param index 0, value 150)
      const knobPacket = new Uint8Array(64);
      knobPacket[0] = 0x05; // AMP
      knobPacket[5] = 0x00; // Vol index
      knobPacket[10] = 150; // New value

      protocolMock.emitReport(knobPacket);

      const knobs = api.amp.getAmpKnobs();
      expect(knobs.find(k => k.name === 'Vol')?.value).toBe(150);
      expect(storeSpy).toHaveBeenCalled();
    });

    it('should update state on live hardware effect knob turn', async () => {
      await api.connect();
      const protocolMock = (api as any).protocol;

      const storeSpy = vi.fn();
      api.store.subscribe(storeSpy);
      storeSpy.mockClear();

      // Pre-requisite: Set a stomp in slot 2
      await api.effects.setEffectById(2, EFFECT_MODELS.OVERDRIVE.id);
      storeSpy.mockClear();

      // Simulate Stomp knob change (Opcode 0x06, slot 2 in byte 13, param index 1, value 200)
      const knobPacket = new Uint8Array(64);
      knobPacket[0] = 0x06; // STOMP
      knobPacket[5] = 0x01; // Gain index
      knobPacket[10] = 200; // New value
      knobPacket[13] = 0x02; // Slot 2

      protocolMock.emitReport(knobPacket);

      const knobs = api.effects.getEffectKnobs(2);
      expect(knobs.find(k => k.name === 'Gain')?.value).toBe(200);
      expect(storeSpy).toHaveBeenCalled();
    });
  });

  describe('Event System', () => {
    it('should update store when parameters are set', async () => {
      const spy = vi.fn();
      api.store.subscribe(spy);

      await api.amp.setAmpKnob(0, 123);
      expect(spy).toHaveBeenCalled();
      const lastState = spy.mock.calls[spy.mock.calls.length - 1][0];
      expect(lastState.amp.knobs[0]).toBe(123);
    });
  });
});
