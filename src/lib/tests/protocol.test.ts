import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Protocol } from '../protocol/protocol';
import { FENDER_VID, MUSTANG_DEVICE_SPECS, OPCODES } from '../protocol/constants';
import { PacketBuilder } from '../protocol/packet_builder';

// Mock objects
const mockDevice = {
  productId: 0x0016, // Mustang III/IV/V V2
  vendorId: FENDER_VID,
  productName: 'Mustang III V2',
  open: vi.fn(),
  close: vi.fn(),
  sendReport: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const mockHid = {
  requestDevice: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

describe('Protocol', () => {
  let protocol: Protocol;

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      hid: mockHid,
    });

    mockHid.requestDevice.mockReset();
    mockHid.addEventListener.mockReset();
    mockHid.removeEventListener.mockReset();
    mockDevice.open.mockReset();
    mockDevice.close.mockReset();
    mockDevice.sendReport.mockReset();
    mockDevice.addEventListener.mockReset();
    mockDevice.removeEventListener.mockReset();

    protocol = new Protocol({ handshakeTimeoutMs: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Support & Connection', () => {
    it('should report supported if navigator.hid exists', () => {
      expect(protocol.isSupported).toBe(true);
      expect(Protocol.isHidSupported()).toBe(true);
    });

    it('should report not supported if navigator.hid is missing', () => {
      vi.stubGlobal('navigator', {});
      expect(protocol.isSupported).toBe(false);
      expect(Protocol.isHidSupported()).toBe(false);
    });

    it('should connect successfully when a Mustang V2 device is selected', async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);

      const success = await protocol.connect();

      expect(success).toBe(true);
      expect(protocol.isConnected).toBe(true);
      expect(protocol.deviceName).toBe('Mustang III V2');
      expect(protocol.productId).toBe(0x0016);
      expect(protocol.deviceSpec?.generation).toBe('v2');
      expect(mockHid.requestDevice).toHaveBeenCalledWith({
        filters: MUSTANG_DEVICE_SPECS.map(spec => ({ vendorId: FENDER_VID, productId: spec.pid })),
      });
      expect(mockDevice.open).toHaveBeenCalled();

      // Should perform 2-step Mustang handshake: [0x00, 0xc3] then [0x1a, 0xc1]
      expect(mockDevice.sendReport).toHaveBeenCalledTimes(2);
      expect(mockDevice.sendReport).toHaveBeenCalledWith(0, expect.any(Uint8Array));

      const handshake1 = mockDevice.sendReport.mock.calls[0][1];
      expect(handshake1[0]).toBe(OPCODES.HANDSHAKE_1_BYTE1);
      expect(handshake1[1]).toBe(OPCODES.HANDSHAKE_1_BYTE2);

      const handshake2 = mockDevice.sendReport.mock.calls[1][1];
      expect(handshake2[0]).toBe(OPCODES.HANDSHAKE_2_BYTE1);
      expect(handshake2[1]).toBe(OPCODES.HANDSHAKE_2_BYTE2_V2);
    });

    it('should send V1 handshake2 subcommand 0x03 for Mustang I/II V1 (PID 0x0004)', async () => {
      const v1Device = { ...mockDevice, productId: 0x0004, productName: 'Mustang I' };
      mockHid.requestDevice.mockResolvedValue([v1Device]);

      const success = await protocol.connect();
      expect(success).toBe(true);
      expect(protocol.deviceSpec?.generation).toBe('v1');
      expect(protocol.deviceSpec?.presetCount).toBe(24);

      const handshake2 = v1Device.sendReport.mock.calls[1][1];
      expect(handshake2[0]).toBe(OPCODES.HANDSHAKE_2_BYTE1);
      expect(handshake2[1]).toBe(OPCODES.HANDSHAKE_2_BYTE2_V1);
    });

    it('should wait for an HID inputreport reply to each handshake packet before proceeding', async () => {
      const waitProtocol = new Protocol({ handshakeTimeoutMs: 5000 });
      const activeListeners = new Set<EventListener>();
      const replyingDevice = {
        ...mockDevice,
        addEventListener: vi.fn((_type: string, fn: EventListener) => activeListeners.add(fn)),
        removeEventListener: vi.fn((_type: string, fn: EventListener) => activeListeners.delete(fn)),
        sendReport: vi.fn().mockImplementation(async () => {
          setTimeout(() => {
            const ack = new DataView(new Uint8Array(64).buffer);
            activeListeners.forEach(fn => fn({ data: ack } as unknown as Event));
          }, 0);
        }),
      };
      mockHid.requestDevice.mockResolvedValue([replyingDevice]);

      const success = await waitProtocol.connect();
      expect(success).toBe(true);
      expect(replyingDevice.sendReport).toHaveBeenCalledTimes(2);
      expect(activeListeners.size).toBe(0); // Temporary handshake listeners cleaned up
    });

    it('should not call device.open() again if the selected HIDDevice is already opened', async () => {
      const alreadyOpenDevice = { ...mockDevice, opened: true };
      mockHid.requestDevice.mockResolvedValue([alreadyOpenDevice]);

      const success = await protocol.connect();

      expect(success).toBe(true);
      expect(alreadyOpenDevice.open).not.toHaveBeenCalled();
    });

    it('should fail connection if user cancels selection', async () => {
      mockHid.requestDevice.mockResolvedValue([]);

      const success = await protocol.connect();

      expect(success).toBe(false);
      expect(protocol.isConnected).toBe(false);
      expect(protocol.lastError).toBeNull();
      expect(mockDevice.open).not.toHaveBeenCalled();
    });

    it('should disconnect and cleanup', async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      await protocol.connect();

      await protocol.disconnect();

      expect(mockDevice.close).toHaveBeenCalled();
      expect(protocol.isConnected).toBe(false);
      expect(protocol.deviceName).toBeUndefined();
    });

    it('should handle disconnect when not connected', async () => {
      await protocol.disconnect();
      expect(mockDevice.close).not.toHaveBeenCalled();
    });

    it('should invoke onDisconnect and close device on unexpected USB unplug', async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      const onDisconnectSpy = vi.fn();
      protocol.onDisconnect = onDisconnectSpy;

      await protocol.connect();
      expect(mockHid.addEventListener).toHaveBeenCalledWith('disconnect', expect.any(Function));

      const disconnectHandler = mockHid.addEventListener.mock.calls[0][1];
      disconnectHandler({ device: mockDevice });

      expect(onDisconnectSpy).toHaveBeenCalledTimes(1);
      expect(protocol.isConnected).toBe(false);
    });

    it('should close device and remove listeners if handshake fails during connect()', async () => {
      const cb = vi.fn();
      protocol.addEventListener(cb);
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      mockDevice.sendReport.mockRejectedValueOnce(new Error('Handshake failed'));

      const success = await protocol.connect();

      expect(success).toBe(false);
      expect(protocol.isConnected).toBe(false);
      expect(protocol.lastError).toBe('Handshake failed');
      expect(mockDevice.close).toHaveBeenCalled();
      expect(mockDevice.removeEventListener).toHaveBeenCalledWith('inputreport', expect.any(Function));
      expect(mockHid.removeEventListener).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should preserve registered listeners across disconnect() and subsequent connect()', async () => {
      const cb = vi.fn();
      protocol.addEventListener(cb);
      mockHid.requestDevice.mockResolvedValue([mockDevice]);

      await protocol.connect();
      await protocol.disconnect();
      mockDevice.addEventListener.mockClear();

      await protocol.connect();
      expect(mockDevice.addEventListener).toHaveBeenCalledWith('inputreport', expect.any(Function));
    });
  });

  describe('Communication', () => {
    beforeEach(async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      await protocol.connect();
      mockDevice.sendReport.mockReset();
    });

    it('should send packet to device', async () => {
      const packet = new Uint8Array([1, 2, 3]);
      await protocol.sendPacket(packet);

      expect(mockDevice.sendReport).toHaveBeenCalledWith(0, packet);
    });

    it('should request state', async () => {
      await protocol.sendPacket(PacketBuilder.requestState());

      expect(mockDevice.sendReport).toHaveBeenCalled();
      const sent = mockDevice.sendReport.mock.calls[0][1];
      expect(sent[0]).toBe(OPCODES.REQUEST_STATE);
      expect(sent[1]).toBe(OPCODES.REQUEST_STATE_BYTE2);
    });

    it('should request bypass states', async () => {
      await protocol.sendPacket(PacketBuilder.requestBypassStates());

      expect(mockDevice.sendReport).toHaveBeenCalled();
      const sent = mockDevice.sendReport.mock.calls[0][1];
      expect(sent[0]).toBe(OPCODES.REQUEST_BYPASS);
      expect(sent[1]).toBe(OPCODES.REQUEST_BYPASS_BYTE2);
    });

    it('should increment sequence ID modulo 256', () => {
      const seq1 = protocol.getNextSequenceId();
      const seq2 = protocol.getNextSequenceId();
      expect(seq2).toBe((seq1 + 1) & 0xff);
    });
  });

  describe('Events', () => {
    it('should bind listeners registered before connect() once connected', async () => {
      const cb = vi.fn();
      protocol.addEventListener(cb);
      expect(mockDevice.addEventListener).not.toHaveBeenCalled();

      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      await protocol.connect();

      expect(mockDevice.addEventListener).toHaveBeenCalledWith('inputreport', expect.any(Function));
    });

    it('should handle incoming inputreport events with DataView byteOffset and byteLength', async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      await protocol.connect();
      mockDevice.addEventListener.mockClear();

      const cb = vi.fn();
      protocol.addEventListener(cb);

      const handler = mockDevice.addEventListener.mock.calls[0][1];

      // Create a larger backing ArrayBuffer and a sub-view at offset 4, length 2
      const backing = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0xaa, 0xbb, 0xff, 0xff]);
      const view = new DataView(backing.buffer, 4, 2);
      handler({ data: view });

      expect(cb).toHaveBeenCalledTimes(1);
      const received: Uint8Array = cb.mock.calls[0][0];
      expect(Array.from(received)).toEqual([0xaa, 0xbb]);
    });

    it('should remove the exact same event listener function that was added', async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      await protocol.connect();
      mockDevice.addEventListener.mockClear();
      mockDevice.removeEventListener.mockClear();

      const cb = vi.fn();
      protocol.addEventListener(cb);

      const addedListener = mockDevice.addEventListener.mock.calls[0][1];
      protocol.removeEventListener(cb);

      expect(mockDevice.removeEventListener).toHaveBeenCalledWith('inputreport', addedListener);
    });
  });
});
