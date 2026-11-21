import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FuseAPI } from '../index';
import { Store } from '../store';
import { AMP_MODELS, EFFECT_MODELS } from '../models';
import type { IProtocol, ProtocolEventListenerFn } from '../protocol/protocol_interface';

class MockProtocol implements IProtocol {
  isConnected = false;
  isSupported = true;
  autoRespondDump = true;
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
    if (this.autoRespondDump && data[0] === 0xff && data[1] === 0xc1) {
      const done = new Uint8Array(64);
      done[0] = 0xff;
      done[1] = 0x01; // DUMP_COMPLETE
      this.emitReport(done);
    }
  });

  getNextSequenceId = vi.fn().mockReturnValue(1);

  emitReport(data: Uint8Array): void {
    this.listeners.forEach(cb => cb(data));
  }
}

async function connectWithFakeTimers(api: FuseAPI, ms = 300) {
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
    it('should resolve connect() immediately when DUMP_COMPLETE (0xff 0x01) arrives', async () => {
      await api.connect();
      expect(api.isConnected).toBe(true);
      expect(api.state.connected).toBe(true);
      expect(api.state.refreshing).toBe(false);
    });

    it('should send only 0xff 0xc1 (no non-existent 0x19 0x00 poll) when syncState() is called manually', async () => {
      await api.connect();
      protocol.sendPacket.mockClear();

      await api.syncState();

      expect(api.state.refreshing).toBe(false);
      expect(protocol.sendPacket).toHaveBeenCalledTimes(1);
      expect(protocol.sendPacket.mock.calls[0][0][0]).toBe(0xff);
      expect(protocol.sendPacket.mock.calls[0][0][1]).toBe(0xc1);
    });

    it('should coalesce concurrent syncState() calls without racing on refreshing state', async () => {
      await api.connect();
      protocol.autoRespondDump = false;
      protocol.sendPacket.mockClear();

      vi.useFakeTimers();
      const first = api.syncState();
      const second = api.syncState();
      expect(api.state.refreshing).toBe(true);

      await vi.advanceTimersByTimeAsync(300);
      await Promise.all([first, second]);
      vi.useRealTimers();

      expect(api.state.refreshing).toBe(false);
      // Only one 0xff 0xc1 requestState packet should have been sent
      expect(protocol.sendPacket).toHaveBeenCalledTimes(1);
    });

    it('should abort pending sync immediately on disconnect instead of hanging for quiescence timeout', async () => {
      await api.connect();
      protocol.autoRespondDump = false;

      vi.useFakeTimers();
      const syncPromise = api.syncState();
      await vi.advanceTimersByTimeAsync(25);
      expect(api.state.refreshing).toBe(true);

      // Simulate sudden unplug during state dump wait
      protocol.isConnected = false;
      protocol.onDisconnect?.();

      // Should settle immediately without advancing to timeout
      await syncPromise;
      vi.useRealTimers();

      expect(api.state.refreshing).toBe(false);
      expect(api.state.connected).toBe(false);
    });

    it('should preserve user-registered presets.onLoad callback across connect()', async () => {
      const onLoadSpy = vi.fn();
      api.presets.onLoad = onLoadSpy;

      await api.connect();

      const packet = new Uint8Array(64);
      packet[0] = 0x1c;
      packet[1] = 0x01;
      packet[2] = 0x00;
      packet[4] = 3;
      packet.set(new TextEncoder().encode('Jazz Clean'), 16);
      protocol.emitReport(packet);

      expect(onLoadSpy).toHaveBeenCalledWith({ slot: 3, name: 'Jazz Clean' });
    });

    it('should clean up connection state if initial syncState() throws inside connect()', async () => {
      protocol.sendPacket.mockRejectedValueOnce(new Error('USB write failed'));

      await expect(api.connect()).rejects.toThrow('USB write failed');
      expect(api.state.connected).toBe(false);
      expect(api.state.refreshing).toBe(false);
      expect(protocol.disconnect).toHaveBeenCalled();
    });

    it('should no-op syncState() when disconnected', async () => {
      await api.syncState();
      expect(protocol.sendPacket).not.toHaveBeenCalled();
      expect(api.state.refreshing).toBe(false);
    });

    it('should fall back gracefully on quiescence timeout when hardware does not emit DUMP_COMPLETE', async () => {
      protocol.autoRespondDump = false;
      await connectWithFakeTimers(api, 300);
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

    it('should update state on live 0x05 0xc3 hardware amp, discrete cabinet, and effect knob turns', async () => {
      await api.connect();
      await api.amp.setAmpModelById(AMP_MODELS.F57_DELUXE.id);
      await api.effects.setEffectById(2, EFFECT_MODELS.OVERDRIVE.id);
      await api.effects.setEffectById(5, EFFECT_MODELS.MULTITAP_DELAY.id);

      // Continuous Amp Volume via 0x05 0xc3 0x02
      const ampKnobPacket = new Uint8Array(64);
      ampKnobPacket.set([0x05, 0xc3, 0x02, 0x67, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 150]);
      protocol.emitReport(ampKnobPacket);
      expect(api.amp.getAmpKnobs().find(k => k.name === 'Vol')?.value).toBe(150);

      // Discrete Amp Cabinet via 0x05 0xc3 0x02 (typeFlag 0x8e -> value in byte[9])
      const cabPacket = new Uint8Array(64);
      cabPacket.set([0x05, 0xc3, 0x02, 0x67, 0x00, 17, 17, 0x8e, 0x00, 0x09, 0x00]);
      protocol.emitReport(cabPacket);
      expect(api.state.amp.cabinetId).toBe(0x09);

      // Continuous Stomp Gain via 0x05 0xc3 0x03
      const fxKnobPacket = new Uint8Array(64);
      fxKnobPacket.set([0x05, 0xc3, 0x03, 0x3c, 0x00, 0x01, 0x01, 0x03, 0x00, 0x00, 200]);
      protocol.emitReport(fxKnobPacket);
      expect(api.effects.getEffectKnobs(2).find(k => k.name === 'Gain')?.value).toBe(200);

      // Discrete Delay Multitap Mode via 0x05 0xc3 0x05 (typeFlag 0x8b -> value in byte[9])
      const modePacket = new Uint8Array(64);
      modePacket.set([0x05, 0xc3, 0x05, 0x44, 0x00, 0x04, 0x04, 0x8b, 0x00, 0x03, 0x00]);
      protocol.emitReport(modePacket);
      expect(api.effects.getEffectKnobs(5).find(k => k.name === 'Mode')?.value).toBe(3);
    });

    it('should sync full Mustang startup dump (preset pairs + active preset + 0xff 0x01) with zero bogus onLoad callbacks', async () => {
      const onLoadSpy = vi.fn();
      api.presets.onLoad = onLoadSpy;

      protocol.sendPacket.mockImplementation(async (data: Uint8Array) => {
        if (data[0] === 0xff && data[1] === 0xc1) {
          // 1. Hardware dumps preset names 0..23 each followed by an empty-name 0x00 confirmation ACK
          for (let s = 0; s < 24; s++) {
            const info = new Uint8Array(64);
            info[0] = 0x1c;
            info[1] = 0x01;
            info[2] = 0x04;
            info[4] = s;
            info.set(new TextEncoder().encode(`Preset ${s}`), 16);
            protocol.emitReport(info);

            const confirm = new Uint8Array(64);
            confirm[0] = 0x1c;
            confirm[1] = 0x01;
            confirm[2] = 0x00;
            confirm[4] = s;
            protocol.emitReport(confirm);
          }

          // 2. Active preset block for slot 7 (even when AMP_UPDATE byte 4 is zeroed)
          const activeHeader = new Uint8Array(64);
          activeHeader[0] = 0x1c;
          activeHeader[1] = 0x01;
          activeHeader[2] = 0x04;
          activeHeader[4] = 7;
          activeHeader.set(new TextEncoder().encode('Preset 7'), 16);
          protocol.emitReport(activeHeader);

          const activeAmp = new Uint8Array(64);
          activeAmp[0] = 0x1c;
          activeAmp[1] = 0x01;
          activeAmp[2] = 0x05; // DspType.AMP
          activeAmp[3] = 0x00;
          activeAmp[4] = 0x00; // Zeroed byte 4 -> falls back to preceding active 0x04 header (slot 7)
          activeAmp[16] = 0x67;
          activeAmp[17] = 0x00;
          protocol.emitReport(activeAmp);

          const activeAck = new Uint8Array(64);
          activeAck[0] = 0x1c;
          activeAck[1] = 0x01;
          activeAck[2] = 0x00;
          activeAck[4] = 7;
          protocol.emitReport(activeAck);

          // 3. End-of-dump ACK (0xff 0x01)
          const done = new Uint8Array(64);
          done[0] = 0xff;
          done[1] = 0x01;
          protocol.emitReport(done);
        }
      });

      await api.connect();
      expect(api.presets.getPresets()).toHaveLength(24);
      expect(api.state.currentPresetSlot).toBe(7);
      expect(api.amp.getAmpModel()?.id).toBe(0x6700);
      expect(onLoadSpy).not.toHaveBeenCalled();
    });

    it('should track manual hardware preset wheel turns (0x04 + AMP + 0x00 ACK) cleanly', async () => {
      await api.connect();
      const onLoadSpy = vi.fn();
      api.presets.onLoad = onLoadSpy;

      // Turning physical preset knob to slot 11 emits 0x04 name, 0x05 amp, 0x00 empty ACK
      const header = new Uint8Array(64);
      header[0] = 0x1c;
      header[1] = 0x01;
      header[2] = 0x04;
      header[4] = 11;
      header.set(new TextEncoder().encode('Surf Reverb'), 16);
      protocol.emitReport(header);

      const amp = new Uint8Array(64);
      amp[0] = 0x1c;
      amp[1] = 0x01;
      amp[2] = 0x05;
      amp[4] = 0x00;
      amp[16] = 0x75;
      amp[17] = 0x00;
      protocol.emitReport(amp);

      const ack = new Uint8Array(64);
      ack[0] = 0x1c;
      ack[1] = 0x01;
      ack[2] = 0x00;
      ack[4] = 0x00;
      protocol.emitReport(ack);

      expect(api.state.currentPresetSlot).toBe(11);
      expect(api.presets.getPreset(11)?.name).toBe('Surf Reverb');
      expect(onLoadSpy).toHaveBeenCalledTimes(1);
      expect(onLoadSpy).toHaveBeenCalledWith({ slot: 11, name: 'Surf Reverb' });
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
