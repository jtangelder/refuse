import { describe, it, expect, vi, beforeEach } from "vitest";
import { MustangAPI } from "./api";
import { AMP_MODELS } from "./models";

vi.mock("./protocol", () => {
  return {
    OPCODES: {
      DATA_PACKET: 0x1c,
      DATA_WRITE: 0x03,
      DATA_READ: 0x01,
      PRESET_INFO: 0x04,
    },
    MustangProtocol: class MockProtocol {
      isConnected = false;
      listeners: Function[] = [];
      connect = vi.fn().mockImplementation(async () => {
        this.isConnected = true;
        return true;
      });
      disconnect = vi.fn().mockImplementation(async () => {
        this.isConnected = false;
      });
      addEventListener = vi
        .fn()
        .mockImplementation((cb: Function) => this.listeners.push(cb));
      removeEventListener = vi.fn();
      emitReport = (data: Uint8Array) =>
        this.listeners.forEach((cb: any) => cb(data));
      requestState = vi.fn().mockResolvedValue(undefined);
      requestBypassStates = vi.fn().mockResolvedValue(undefined);
      sendRaw = vi.fn().mockResolvedValue(undefined);

      // Static methods
      static parsePresetName(data: Uint8Array) {
        // Real implementation allows 0x00 and 0x04
        if (data[2] !== 0x04 && data[2] !== 0x00) return null;
        const slot = data[4];
        let name = "";
        for (let i = 16; i < 48; i++) {
          if (data[i] === 0) break;
          name += String.fromCharCode(data[i]);
        }
        console.log(`[MOCK] Parsed Preset Name: Slot ${slot}, Name "${name}"`);
        return { slot, name };
      }
      static isBypassResponse(data: Uint8Array) {
        return data[0] === 0x19 && data[1] === 0xc3;
      }
      static parseBypassResponse(data: Uint8Array) {
        return { slot: data[4], enabled: data[3] === 0x00 };
      }
      static isPresetNamePacket(data: Uint8Array) {
        return (
          data[0] === 0x1c &&
          data[1] === 0x01 &&
          (data[2] === 0x04 || data[2] === 0x00)
        );
      }
    },
  };
});

describe("MustangAPI basic functionality", () => {
  let api: MustangAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new MustangAPI();
  });

  it("should handle disconnect event", async () => {
    await api.connect();
    expect(api.isConnected).toBe(true);

    await api.disconnect();
    expect(api.isConnected).toBe(false);
  });

  it("should verify knob index logic (Control Mapping Regression)", async () => {
    // Regression test for "Bass changing Volume" bug
    // '57 Deluxe: ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]
    // Indices: 0, 1, (2), 3, 4, 5, 6, 7

    // 1. Set Amp Model to '57 Deluxe (0x6700)
    api.state[0x05][16] = 0x67;
    api.state[0x05][17] = 0x00;

    const knobs = api.getAmpKnobs();

    const vol = knobs.find((k) => k.name === "Vol");
    const bass = knobs.find((k) => k.name === "Bass");

    expect(vol).toBeDefined();
    expect(bass).toBeDefined();

    // Critical Assertion: Different indices
    expect(vol?.index).toBe(0);
    expect(bass?.index).toBe(6);
    expect(vol?.index).not.toBe(bass?.index);
  });

  it("should preserve preset name when receiving generic updates (Reproduction of Missing Name Bug)", async () => {
    await api.connect();
    const protocol = (api as any).protocol;

    // 1. Send Preset Name (Type 0x04)
    // 0x1c 0x01 0x04 ... [Slot] ... [Name]
    const slot = 5;
    const name = "Sensitive Data";
    const namePacket = new Uint8Array(64);
    namePacket[0] = 0x1c;
    namePacket[1] = 0x01;
    namePacket[2] = 0x04;
    namePacket[4] = slot;
    for (let i = 0; i < name.length; i++)
      namePacket[16 + i] = name.charCodeAt(i);

    protocol.emitReport(namePacket);

    expect(api.presets.get(slot)?.name).toBe(name);

    // 2. Send Generic "Ack" / State Packet (Type 0x00) for same slot
    // Often sent by amp to confirm slot change or other state
    // 0x1c 0x01 0x00 ... [Slot] ...
    const genericPacket = new Uint8Array(64);
    genericPacket[0] = 0x1c;
    genericPacket[1] = 0x01;
    genericPacket[2] = 0x00;
    genericPacket[18] = slot;
    genericPacket[4] = slot;

    protocol.emitReport(genericPacket);

    // This assertion fails if the bug exists (name gets overwritten with empty string)
    expect(api.presets.get(slot)?.name).toBe(name);
    expect(api.presets.get(slot)?.name).not.toBe("");
  });

  it("should ignore Effect Info packets (Byte 3 != 0x00) for main preset list", async () => {
    await api.connect();
    const protocol = (api as any).protocol;

    // Simulate an "Effect Preset" name packet.
    // Bytes: 1c 01 04 [01] [Slot] ...
    // Byte 3 = 0x01 indicates it's for the MOD knob, not the main amp preset.
    const slot = 10;
    const effectName = "Phaser Sine";
    const packet = new Uint8Array(64);
    packet[0] = 0x1c;
    packet[1] = 0x01;
    packet[2] = 0x04;
    packet[3] = 0x01; // <--- The culprit. 0x01 = Mod, 0x02 = Delay. 0x00 = Main Preset.
    packet[4] = slot;
    for (let i = 0; i < effectName.length; i++)
      packet[16 + i] = effectName.charCodeAt(i);

    protocol.emitReport(packet);

    // If bug exists, this will be "Phaser Sine".
    // If fixed, it should be undefined (ignored).
    const savedPreset = api.presets.get(slot);
    expect(savedPreset).toBeUndefined();
  });
});

describe("Integration: Real World Log Simulation", () => {
  let api: MustangAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new MustangAPI();
  });

  it("should handle full preset sync sequence from logs", async () => {
    await api.connect();
    const protocol = (api as any).protocol;

    const presetNames = [
      { slot: 0, name: "Brutal Metal II" },
      { slot: 1, name: "Super-Live Album" },
      { slot: 2, name: "Mono Delay Long" }, // From the end of log
    ];

    // Simulate bulk preset name arrival
    presetNames.forEach((p) => {
      // 0x1c 0x01 0x04 (Name)
      const packet = new Uint8Array(64);
      packet[0] = 0x1c;
      packet[1] = 0x01;
      packet[2] = 0x04;
      packet[4] = p.slot;
      for (let i = 0; i < p.name.length; i++)
        packet[16 + i] = p.name.charCodeAt(i);
      protocol.emitReport(packet);
    });

    expect(api.presets.get(0)?.name).toBe("Brutal Metal II");
    expect(api.presets.get(1)?.name).toBe("Super-Live Album");
    expect(api.presets.get(2)?.name).toBe("Mono Delay Long");
  });
});
