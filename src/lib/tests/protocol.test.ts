import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Protocol } from '../protocol/protocol';
import { FENDER_VID, OPCODES } from '../protocol/constants';
import { PacketBuilder } from '../protocol/packet_builder';

// Mock objects
const mockDevice = {
  productId: 0,
  vendorId: FENDER_VID,
  productName: 'Mustang GT',
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

    protocol = new Protocol();
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

    it('should connect successfully when device is selected', async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);

      const success = await protocol.connect();

      expect(success).toBe(true);
      expect(protocol.isConnected).toBe(true);
      expect(mockHid.requestDevice).toHaveBeenCalledWith({ filters: [{ vendorId: FENDER_VID }] });
      expect(mockDevice.open).toHaveBeenCalled();

      // Should perform 2-step handshake
      expect(mockDevice.sendReport).toHaveBeenCalledTimes(2);
      expect(mockDevice.sendReport).toHaveBeenCalledWith(0, expect.any(Uint8Array));

      const handshake1 = mockDevice.sendReport.mock.calls[0][1];
      expect(handshake1[0]).toBe(OPCODES.HANDSHAKE_1);
    });

    it('should fail connection if user cancels selection', async () => {
      mockHid.requestDevice.mockResolvedValue([]);

      const success = await protocol.connect();

      expect(success).toBe(false);
      expect(protocol.isConnected).toBe(false);
      expect(mockDevice.open).not.toHaveBeenCalled();
    });

    it('should disconnect and cleanup', async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      await protocol.connect();

      await protocol.disconnect();

      expect(mockDevice.close).toHaveBeenCalled();
      expect(protocol.isConnected).toBe(false);
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

      const cb = vi.fn();
      protocol.addEventListener(cb);

      const addedListener = mockDevice.addEventListener.mock.calls[0][1];
      protocol.removeEventListener(cb);

      expect(mockDevice.removeEventListener).toHaveBeenCalledWith('inputreport', addedListener);
    });
  });
});
