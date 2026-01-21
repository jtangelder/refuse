import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FuseAPI } from './api';
import { EFFECT_MODELS } from './models';

// Mock Protocol to inject raw packets
vi.mock('./protocol', () => {
  return {
    OPCODES: {
      DATA_PACKET: 0x1c,
      DATA_WRITE: 0x03,
      DATA_READ: 0x01,
      PRESET_INFO: 0x04,
    },
    FuseProtocol: class MockProtocol {
      listeners: Function[] = [];
      connect = vi.fn().mockResolvedValue(true);
      disconnect = vi.fn();
      addEventListener = vi.fn(cb => this.listeners.push(cb));
      removeEventListener = vi.fn();
      emitReport = (data: Uint8Array) => this.listeners.forEach(cb => cb(data));
      requestState = vi.fn().mockResolvedValue(undefined);
      requestBypassStates = vi.fn().mockResolvedValue(undefined);
      sendPacket = vi.fn().mockResolvedValue(undefined);
      createApplyPacket = vi.fn().mockReturnValue(new Uint8Array(64));
      getNextSequenceId = vi.fn().mockReturnValue(1);

      // Static helpers used by API
      static parsePresetName(data: Uint8Array) {
        if (data[2] !== 0x04 && data[2] !== 0x00) return null;
        const slot = data[4];
        let name = '';
        for (let i = 16; i < 48; i++) {
          if (data[i] === 0) break;
          name += String.fromCharCode(data[i]);
        }
        return { slot, name };
      }
      static isBypassResponse(data: Uint8Array) {
        return false;
      }
      static parseBypassResponse(data: Uint8Array) {
        return { slot: 0, enabled: true };
      }
      static isPresetNamePacket(data: Uint8Array) {
        return data[0] === 0x1c && data[1] === 0x01 && (data[2] === 0x04 || data[2] === 0x00);
      }
    },
  };
});

describe('Data-Driven Verification', () => {
  let api: FuseAPI;
  let protocol: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    api = new FuseAPI();
    await api.connect();
    protocol = (api as any).protocol;
  });

  const replay = (hexString: string) => {
    // Parse "[0x1c, 0x01 ...]" format
    // Remove brackets and split
    const cleaned = hexString.replace(/[\[\]]/g, '').trim();
    const parts = cleaned.split(',').map(s => parseInt(s.trim(), 16));
    const buffer = new Uint8Array(parts);
    // Pad or Truncate to 64
    const fullBuffer = new Uint8Array(64);
    for (let i = 0; i < 64 && i < buffer.length; i++) {
      fullBuffer[i] = buffer[i];
    }
    protocol.emitReport(fullBuffer);
  };

  it('Scenario 1: Preset Loading Sequence', () => {
    // "Brutal Metal II" at slot 0
    replay(
      '[0x1c, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x42, 0x72, 0x75, 0x74, 0x61, 0x6c, 0x20, 0x4d, 0x65, 0x74, 0x61, 0x6c, 0x20, 0x49, 0x49, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]',
    );

    expect(api.presets.getPreset(0)?.name).toBe('Brutal Metal II');

    // "Super-Live Album" at slot 1
    replay(
      '[0x1c, 0x01, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x53, 0x75, 0x70, 0x65, 0x72, 0x2d, 0x4c, 0x69, 0x76, 0x65, 0x20, 0x41, 0x6c, 0x62, 0x75, 0x6d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]',
    );

    expect(api.presets.getPreset(1)?.name).toBe('Super-Live Album');
  });

  it('Scenario 2: Complex Effect Chain (Ducking Delay/Sm Hall)', () => {
    // This sequence establishes a complex chain for Preset 10

    // 1. MOD: Triangle Chorus (0x1300) at Slot 5
    // Log Ref: HID RECV [raw]: [0x1c, 0x01, 0x07, 0x01, 0x00, ... 0x12, 0x00, 0x05 ... ]?
    // Wait, let's use the exact log lines for "Triangle Chorus" if found, or infer from log.
    // Searching log for "Triangle Chorus":
    // Found: "Triangle Chorus" not explicit in text, but let's look at ID 0x1300.

    // LOG LINE: HID RECV [raw]: [0x1c, 0x01, 0x07, 0x01, 0x00 ... 0x12, 0x00, 0x05, ...]
    // 0x1c 0x01 0x07 (MOD) 0x01?
    // Actually let's look at the "Singleton migration" part.
    // "Clearing slot 5 because MOD moved to 0"

    // Let's replay the "Touch Wah" sequence which seemed to trigger migration.
    // Preset: "Touch Wah" (Slot 3)
    replay('[0x1c, 0x01, 0x04, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, ...]'); // Name

    // Packet triggering migration:
    // HID RECV [raw]: [0x1c, 0x01, 0x07, 0x01, 0x03, ... 0xf5, 0x00, 0x00, 0x01, 0x08, 0x01 ...]
    // 0: 1c, 1: 01, 2: 07 (MOD)
    // 16: f5, 17: 00 (Model ID 0xF500 = Touch Wah?)
    // 18: 00 (Slot 0)

    // If previous state had MOD at Slot 5, this should clear Slot 5.

    // Setup: Put something in Slot 5 first (e.g. from previous log context)
    // Log context for Slot 5: "Vintage Tremolo Fast" put MOD 0x4000 at Slot 5.
    // Let's set that up manually first to verify migration.

    // Step A: Set MOD at Slot 5
    const packetA =
      '[0x1c, 0x01, 0x07, 0x01, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x05, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe1, 0xad, 0x2b, 0x78, 0xb0, 0x80, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]';
    replay(packetA);

    // Verify Slot 5 has effect
    expect(api.effects.getEffectModelId(5)).toBe(0x4000); // Sine Tremolo?

    // Step B: Send Touch Wah packet (MOD at Slot 0)
    const packetB =
      '[0x1c, 0x01, 0x07, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf5, 0x00, 0x00, 0x01, 0x08, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xed, 0x81, 0x07, 0xff, 0x00, 0x81, 0x81, 0x81, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]';
    replay(packetB);

    // Verify Slot 5 is CLEARED
    expect(api.effects.getEffectModelId(5)).toBe(0);
    expect(api.effects.getEffectModel(5)).toBeNull();

    // Verify Slot 0 has the unkown effect (0xF500)
    // getEffectModelId() returns 0 if model not found in dictionary, so we check state directly
    expect(api.state.slots[0]?.modelId).toBe(0xf500);
  });

  it('Scenario 3: Verify Model Info packets (Byte 3 != 0x00) are IGNORED for Preset Names', () => {
    // Log showed: [0x1c, 0x01, 0x04, 0x02, 0x06 ...] -> "Fender '65 Spring"
    // This looks like an Amp Model name, NOT the user preset name "Bassman Drive".
    // We should ensure this specific packet does NOT overwrite the preset name.

    // 1. Set a valid name first (simulating previous packet)
    // [0x1c, 0x01, 0x04, 0x00, 0x06 ...] -> "Bassman Drive"
    const validNamePacket = new Uint8Array(64);
    validNamePacket[0] = 0x1c;
    validNamePacket[1] = 0x01;
    validNamePacket[2] = 0x04;
    validNamePacket[3] = 0x00; // Main Preset
    validNamePacket[4] = 0x06; // Slot 6
    const name = 'Bassman Drive';
    for (let i = 0; i < name.length; i++) validNamePacket[16 + i] = name.charCodeAt(i);
    protocol.emitReport(validNamePacket);

    expect(api.presets.getPreset(6)?.name).toBe('Bassman Drive');

    // 2. Replay the "Amp Name" packet (Byte 3 = 0x02)
    replay(
      '[0x1c, 0x01, 0x04, 0x02, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46, 0x65, 0x6e, 0x64, 0x65, 0x72, 0x20, 0x27, 0x36, 0x35, 0x20, 0x53, 0x70, 0x72, 0x69, 0x6e, 0x67, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]',
    );

    // 3. Assert name is UNCHANGED
    expect(api.presets.getPreset(6)?.name).toBe('Bassman Drive');
    expect(api.presets.getPreset(6)?.name).not.toBe("Fender '65 Spring");
  });
});
