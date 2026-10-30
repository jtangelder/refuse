import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FuseAPI } from '../index';
import { Store } from '../store';
import type { IProtocol, ProtocolEventListenerFn } from '../protocol/protocol_interface';

class TraceMockProtocol implements IProtocol {
  isConnected = false;
  isSupported = true;
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
    if (data[0] === 0x19 && data[1] === 0x00) {
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

describe('Data-Driven Hardware Trace Verification', () => {
  let api: FuseAPI;
  let protocol: TraceMockProtocol;

  beforeEach(async () => {
    vi.useFakeTimers();
    const store = new Store();
    protocol = new TraceMockProtocol();
    api = new FuseAPI(store, protocol);
    const connectPromise = api.connect();
    await vi.advanceTimersByTimeAsync(100);
    await connectPromise;
    vi.useRealTimers();
  });

  const replay = (hexString: string) => {
    const cleaned = hexString.replace(/[[\]]/g, '').trim();
    const parts = cleaned.split(',').map(s => parseInt(s.trim(), 16));
    const fullBuffer = new Uint8Array(64);
    for (let i = 0; i < 64 && i < parts.length; i++) {
      fullBuffer[i] = parts[i];
    }
    protocol.emitReport(fullBuffer);
  };

  it('Scenario 1: Preset Loading Sequence from USB Capture', () => {
    // "Brutal Metal II" at slot 0
    replay(
      '[0x1c, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x42, 0x72, 0x75, 0x74, 0x61, 0x6c, 0x20, 0x4d, 0x65, 0x74, 0x61, 0x6c, 0x20, 0x49, 0x49, 0x00]',
    );
    expect(api.presets.getPreset(0)?.name).toBe('Brutal Metal II');

    // "Super-Live Album" at slot 1
    replay(
      '[0x1c, 0x01, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x53, 0x75, 0x70, 0x65, 0x72, 0x2d, 0x4c, 0x69, 0x76, 0x65, 0x20, 0x41, 0x6c, 0x62, 0x75, 0x6d, 0x00]',
    );
    expect(api.presets.getPreset(1)?.name).toBe('Super-Live Album');
  });

  it('Scenario 2: Singleton Effect Migration in Hardware Trace', () => {
    // Step A: Set MOD (Sine Tremolo 0x4000) at Slot 5
    replay(
      '[0x1c, 0x01, 0x07, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x05, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe1, 0xad, 0x2b, 0x78, 0xb0, 0x80, 0x80, 0x80]',
    );
    expect(api.effects.getEffectModelId(5)).toBe(0x4000);

    // Step B: Hardware moves MOD (Touch Wah 0xf500) to Slot 0
    replay(
      '[0x1c, 0x01, 0x07, 0x00, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf5, 0x00, 0x00, 0x01, 0x08, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xed, 0x81, 0x07, 0xff, 0x00, 0x81, 0x81, 0x81]',
    );

    // Slot 5 must be cleared and Slot 0 populated
    expect(api.effects.getEffectModel(5)).toBeNull();
    expect(api.state.slots[0]?.modelId).toBe(0xf500);
  });

  it('Scenario 3: Model/Effect Info Packets (Byte 3 != 0x00) Do Not Overwrite Preset Names', () => {
    const validNamePacket = new Uint8Array(64);
    validNamePacket[0] = 0x1c;
    validNamePacket[1] = 0x01;
    validNamePacket[2] = 0x04;
    validNamePacket[3] = 0x00; // Main Preset
    validNamePacket[4] = 0x06; // Slot 6
    validNamePacket.set(new TextEncoder().encode('Bassman Drive'), 16);
    protocol.emitReport(validNamePacket);

    expect(api.presets.getPreset(6)?.name).toBe('Bassman Drive');

    // Replay "Fender '65 Spring" packet where byte[3] = 0x02 (Reverb/Amp category metadata, not preset name)
    replay(
      '[0x1c, 0x01, 0x04, 0x02, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46, 0x65, 0x6e, 0x64, 0x65, 0x72, 0x20, 0x27, 0x36, 0x35, 0x20, 0x53, 0x70, 0x72, 0x69, 0x6e, 0x67, 0x00]',
    );

    expect(api.presets.getPreset(6)?.name).toBe('Bassman Drive');
  });

  it('Scenario 4: Generic Preset Change Ack (Type 0x00 with Empty Name) Preserves Existing Preset Name', () => {
    const slot = 5;
    const namePacket = new Uint8Array(64);
    namePacket[0] = 0x1c;
    namePacket[1] = 0x01;
    namePacket[2] = 0x04;
    namePacket[4] = slot;
    namePacket.set(new TextEncoder().encode('Sensitive Data'), 16);
    protocol.emitReport(namePacket);

    expect(api.presets.getPreset(slot)?.name).toBe('Sensitive Data');

    // Generic 0x00 packet with all-zero name bytes
    const genericAck = new Uint8Array(64);
    genericAck[0] = 0x1c;
    genericAck[1] = 0x01;
    genericAck[2] = 0x00;
    genericAck[4] = slot;
    protocol.emitReport(genericAck);

    expect(api.presets.getPreset(slot)?.name).toBe('Sensitive Data');
    expect(api.state.currentPresetSlot).toBe(slot);
  });
});
