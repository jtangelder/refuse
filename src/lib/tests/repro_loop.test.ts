import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FuseAPI } from '../index';

// Minimal mock of the protocol layer
async function fastConnect(api: FuseAPI) {
  vi.useFakeTimers();
  const connectPromise = api.connect();
  // Advance enough to cover refreshBypassStates (1000ms) and padding (500ms)
  await vi.advanceTimersByTimeAsync(2000);
  await connectPromise;
  vi.useRealTimers();
}

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
      });

      return Mock;
    })(),
  };
});

describe('Infinite Loop Reproduction', () => {
  let api: FuseAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new FuseAPI();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT request state refresh when a preset changes', async () => {
    await fastConnect(api);
    const protocolMock = (api as any).protocol;
    const requestStateSpy = protocolMock.requestState; // This is a spy because we mocked it in the factory

    // Clear the spy because connect() calls requestState()
    requestStateSpy.mockClear();

    // verify spy is clean
    expect(requestStateSpy).not.toHaveBeenCalled();

    // Simulate "Preset Change" packet (Opcode 0x1c, Type 0x00, Slot 4)
    // 0x1c 0x01 0x00 0x00 0x04 ...
    const packet = new Uint8Array(64);
    packet[0] = 0x1c;
    packet[1] = 0x01;
    packet[2] = 0x00; // PRESET_CHANGE type (not PRESET_INFO 0x04)
    packet[3] = 0x00; // Main Preset
    packet[4] = 0x04; // Slot 4

    // Simulate preset name 'British Invasion'
    const name = 'British Invasion';
    for (let i = 0; i < name.length; i++) packet[16 + i] = name.charCodeAt(i);

    // Emit the packet
    protocolMock.emitReport(packet);

    // Ideally, we want this to be 0 (fail if > 0)
    // In current buggy code, this should be called because onLoad() triggers refreshState()
    // We expect this expectation to FAIL before the fix.
    expect(requestStateSpy).not.toHaveBeenCalled();
  });
});
