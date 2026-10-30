import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FuseAPI } from '../index';
import { Store } from '../store';
import { AMP_MODELS, EFFECT_MODELS } from '../models';
import type { IProtocol, ProtocolEventListenerFn } from '../protocol/protocol_interface';

class MockProtocol implements IProtocol {
  isConnected = false;
  isSupported = true;
  autoRespondBypass = true;
  onDisconnect?: () => void;
  private listeners = new Set<ProtocolEventListenerFn>();

  connect = vi.fn().mockImplementation(async () => {
    this.isConnected = true;
    return true;
  });

  disconnect = vi.fn().mockImplementation(async () => {
    this.isConnected = false;
  });

  addEventListener = vi.fn().mockImplementation((cb: ProtocolEventListenerFn) => {
    this.listeners.add(cb);
  });

  removeEventListener = vi.fn().mockImplementation((cb: ProtocolEventListenerFn) => {
    this.listeners.delete(cb);
  });

  sendPacket = vi.fn().mockImplementation(async (data: Uint8Array) => {
    if (this.autoRespondBypass && data[0] === 0x19 && data[1] === 0x00) {
      for (let slot = 0; slot < 8; slot++) {
        const bp = new Uint8Array(64);
        bp[0] = 0x19;
        bp[1] = 0xc3;
        bp[3] = 0x00;
        bp[4] = slot;
        this.emitReport(bp);
      }
    }
  });

  getNextSequenceId = vi.fn().mockReturnValue(1);

  emitReport(data: Uint8Array): void {
    this.listeners.forEach(cb => cb(data));
  }
}

async function connectWithFakeTimers(api: FuseAPI, ms = 100) {
  vi.useFakeTimers();
  const connectPromise = api.connect();
  await vi.advanceTimersByTimeAsync(ms);
  await connectPromise;
  vi.useRealTimers();
}

describe('FuseAPI', () => {
  let api: FuseAPI;
  let protocol: MockProtocol;

  beforeEach(() => {
    const store = new Store();
    protocol = new MockProtocol();
    api = new FuseAPI(store, protocol);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('High-level Amp Control', () => {
    it('should update local state when setting amp model', async () => {
      const model = AMP_MODELS.F57_DELUXE;
      await api.amp.setAmpModelById(model.id);

      expect(api.amp.getAmpModel()?.name).toBe(model.name);
      expect(api.amp.getAmpModel()?.id).toBe(model.id);
    });

    it('should calculate amp knobs correctly from state', () => {
      const ampState = { ...api.state.amp, modelId: AMP_MODELS.F57_DELUXE.id, knobs: [...api.state.amp.knobs] };
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
      const model = EFFECT_MODELS.OVERDRIVE;
      await api.effects.setEffectById(2, model.id);

      expect(api.effects.getEffectModel(2)?.name).toBe('Overdrive');
      expect(api.effects.getSettings(2)?.enabled).toBe(true);
    });

    it('should clear existing effect when setting duplicate effect types', async () => {
      const model = EFFECT_MODELS.OVERDRIVE;
      await api.effects.setEffectById(0, model.id);
      await api.effects.setEffectById(1, model.id);

      expect(api.effects.getEffectModel(1)?.name).toBe('Overdrive');
      expect(api.effects.getEffectModel(0)).toBeNull();
    });

    it('should clear effects', async () => {
      await api.effects.setEffectById(0, EFFECT_MODELS.OVERDRIVE.id);
      expect(api.effects.getEffectModel(0)).not.toBeNull();

      await api.effects.clearEffect(0);
      expect(api.effects.getEffectModel(0)).toBeNull();
    });

    it('should return null / 0 for out-of-range effect queries', () => {
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
      await expect(api.effects.setEffectKnob(0, 0, 100)).rejects.toThrow(/No effect in slot 0/);
    });

    it('should swap effects between slots', async () => {
      await api.effects.setEffectById(0, EFFECT_MODELS.OVERDRIVE.id);
      await api.effects.setEffectById(2, EFFECT_MODELS.SINE_FLANGER.id);

      await api.effects.swapEffects(0, 2);

      expect(api.effects.getEffectModel(0)?.name).toBe('Sine Flanger');
      expect(api.effects.getEffectModel(2)?.name).toBe('Overdrive');
    });
  });

  describe('Connection & Synchronization', () => {
    it('should resolve connect() quickly when all 8 bypass packets arrive and quiescence is reached', async () => {
      await connectWithFakeTimers(api, 60);
      expect(api.isConnected).toBe(true);
      expect(api.state.connected).toBe(true);
      expect(api.state.refreshing).toBe(false);
    });

    it('should fall back gracefully on refreshBypassStates timeout when hardware does not reply', async () => {
      protocol.autoRespondBypass = false;
      await connectWithFakeTimers(api, 1100);
      expect(api.isConnected).toBe(true);
      expect(api.state.refreshing).toBe(false);
    });

    it('should handle disconnect and unexpected USB connection loss', async () => {
      await connectWithFakeTimers(api);
      expect(api.isConnected).toBe(true);

      const lostSpy = vi.fn();
      api.onConnectionLost = lostSpy;

      // Simulate unexpected hardware unplug
      protocol.isConnected = false;
      protocol.onDisconnect?.();

      expect(api.state.connected).toBe(false);
      expect(lostSpy).toHaveBeenCalledTimes(1);

      await api.disconnect();
      expect(api.isConnected).toBe(false);
    });

    it('should NOT send any state refresh packet when a PRESET_CHANGE report arrives (infinite loop regression)', async () => {
      await connectWithFakeTimers(api);
      protocol.sendPacket.mockClear();

      const packet = new Uint8Array(64);
      packet[0] = 0x1c;
      packet[1] = 0x01;
      packet[2] = 0x00; // PRESET_CHANGE
      packet[3] = 0x00;
      packet[4] = 0x04;
      packet.set(new TextEncoder().encode('British Invasion'), 16);

      protocol.emitReport(packet);

      expect(api.state.currentPresetSlot).toBe(4);
      expect(api.presets.getPreset(4)?.name).toBe('British Invasion');
      expect(protocol.sendPacket).not.toHaveBeenCalled();
    });

    it('should ignore apply packet echoes (0x1c 0x03)', async () => {
      await connectWithFakeTimers(api);
      protocol.sendPacket.mockClear();

      const echoPacket = new Uint8Array(64);
      echoPacket[0] = 0x1c;
      echoPacket[1] = 0x03;
      echoPacket[2] = 0x00;
      protocol.emitReport(echoPacket);

      expect(protocol.sendPacket).not.toHaveBeenCalled();
    });

    it('should sync full signal chain with multiple effects from hardware packets', async () => {
      await connectWithFakeTimers(api);

      const modPacket = new Uint8Array(64);
      modPacket[0] = 0x1c;
      modPacket[1] = 0x01;
      modPacket[2] = 0x07; // MOD
      modPacket[16] = 0x13;
      modPacket[17] = 0x00;
      modPacket[18] = 0x05;

      const delayPacket = new Uint8Array(64);
      delayPacket[0] = 0x1c;
      delayPacket[1] = 0x01;
      delayPacket[2] = 0x08; // DELAY
      delayPacket[16] = 0x15;
      delayPacket[17] = 0x00;
      delayPacket[18] = 0x06;

      const reverbPacket = new Uint8Array(64);
      reverbPacket[0] = 0x1c;
      reverbPacket[1] = 0x01;
      reverbPacket[2] = 0x09; // REVERB
      reverbPacket[16] = 0x24;
      reverbPacket[17] = 0x00;
      reverbPacket[18] = 0x07;

      protocol.emitReport(modPacket);
      protocol.emitReport(delayPacket);
      protocol.emitReport(reverbPacket);

      expect(api.effects.getEffectModel(5)?.name).toBe('Triangle Chorus');
      expect(api.effects.getEffectModel(6)?.name).toBe('Ducking Delay');
      expect(api.effects.getEffectModel(7)?.name).toBe('Small Hall');
      expect(api.effects.getEffectModel(0)).toBeNull();
    });

    it('should sync bypass state from 0x19 0xc3 reports', async () => {
      await connectWithFakeTimers(api);
      await api.effects.setEffectById(2, EFFECT_MODELS.OVERDRIVE.id);
      expect(api.effects.getSettings(2)?.enabled).toBe(true);

      const bypassReport = new Uint8Array(64);
      bypassReport[0] = 0x19;
      bypassReport[1] = 0xc3;
      bypassReport[3] = 0x01; // Bypassed
      bypassReport[4] = 0x02; // Slot 2
      protocol.emitReport(bypassReport);

      expect(api.effects.getSettings(2)?.enabled).toBe(false);
    });

    it('should update state on live hardware amp and effect knob turns', async () => {
      await connectWithFakeTimers(api);
      await api.amp.setAmpModelById(AMP_MODELS.F57_DELUXE.id);
      await api.effects.setEffectById(2, EFFECT_MODELS.OVERDRIVE.id);

      const ampKnobPacket = new Uint8Array(64);
      ampKnobPacket[0] = 0x05; // AMP
      ampKnobPacket[5] = 0x00; // Vol index
      ampKnobPacket[10] = 150;
      protocol.emitReport(ampKnobPacket);

      expect(api.amp.getAmpKnobs().find(k => k.name === 'Vol')?.value).toBe(150);

      const fxKnobPacket = new Uint8Array(64);
      fxKnobPacket[0] = 0x06; // STOMP
      fxKnobPacket[5] = 0x01; // Gain index
      fxKnobPacket[10] = 200;
      fxKnobPacket[13] = 0x02; // Slot 2
      protocol.emitReport(fxKnobPacket);

      expect(api.effects.getEffectKnobs(2).find(k => k.name === 'Gain')?.value).toBe(200);
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
