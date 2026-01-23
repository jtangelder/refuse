import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Protocol, FENDER_VID, OPCODES } from '../protocol/protocol';

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
};

describe('Protocol', () => {
  let protocol: Protocol;

  beforeEach(() => {
    // Setup generic global navigator mock
    vi.stubGlobal('navigator', {
      hid: mockHid,
    });

    // Reset mocks
    mockHid.requestDevice.mockReset();
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
    });

    it('should report not supported if navigator.hid is missing', () => {
      vi.stubGlobal('navigator', {});
      expect(protocol.isSupported).toBe(false);
    });

    it('should connect successfully when device is selected', async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);

      const success = await protocol.connect();

      expect(success).toBe(true);
      expect(protocol.isConnected).toBe(true);
      expect(mockHid.requestDevice).toHaveBeenCalledWith({ filters: [{ vendorId: FENDER_VID }] });
      expect(mockDevice.open).toHaveBeenCalled();

      // Should perform handshake
      expect(mockDevice.sendReport).toHaveBeenCalledTimes(2);
      expect(mockDevice.sendReport).toHaveBeenCalledWith(0, expect.any(Uint8Array));

      const handshake1 = mockDevice.sendReport.mock.calls[0][1];
      expect(handshake1[0]).toBe(OPCODES.INIT_1);
    });

    it('should fail connection if user cancels selection', async () => {
      mockHid.requestDevice.mockResolvedValue([]);

      const success = await protocol.connect();

      expect(success).toBe(false);
      expect(protocol.isConnected).toBe(false);
      expect(mockDevice.open).not.toHaveBeenCalled();
    });

    it('should disconnect and cleanup', async () => {
      // Connect first
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
  });

  describe('Communication', () => {
    beforeEach(async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      await protocol.connect();
      mockDevice.sendReport.mockReset(); // Clear handshake calls
    });

    it('should send packet to device', async () => {
      const packet = new Uint8Array([1, 2, 3]);
      await protocol.sendPacket(packet);

      expect(mockDevice.sendReport).toHaveBeenCalledWith(0, packet);
    });

    it('should request state', async () => {
      await protocol.requestState();

      expect(mockDevice.sendReport).toHaveBeenCalled();
      const sent = mockDevice.sendReport.mock.calls[0][1];
      expect(sent[0]).toBe(OPCODES.REQUEST_STATE);
      expect(sent[1]).toBe(OPCODES.REQUEST_STATE_BYTE2);
    });

    it('should request bypass states', async () => {
      await protocol.requestBypassStates();

      expect(mockDevice.sendReport).toHaveBeenCalled();
      const sent = mockDevice.sendReport.mock.calls[0][1];
      expect(sent[0]).toBe(OPCODES.REQUEST_BYPASS);
      expect(sent[1]).toBe(OPCODES.REQUEST_BYPASS_BYTE2);
    });

    it('should increment sequence ID', () => {
      const seq1 = protocol.getNextSequenceId();
      const seq2 = protocol.getNextSequenceId();
      expect(seq2).toBe((seq1 + 1) & 0xff);
    });
  });

  describe('Events', () => {
    beforeEach(async () => {
      mockHid.requestDevice.mockResolvedValue([mockDevice]);
      await protocol.connect();
    });

    it('should add event listener to device', () => {
      const cb = vi.fn();
      protocol.addEventListener(cb);

      expect(mockDevice.addEventListener).toHaveBeenCalledWith('inputreport', expect.any(Function));
    });

    it('should handle incoming inputreport events', () => {
      const cb = vi.fn();
      protocol.addEventListener(cb);

      // Extract the event handler registered with the mock
      const handler = mockDevice.addEventListener.mock.calls[0][1];

      // Simulate event
      const eventData = new Uint8Array([0xaa, 0xbb]);
      const mockEvent = { data: { buffer: eventData.buffer } };
      handler(mockEvent);

      expect(cb).toHaveBeenCalledWith(expect.any(Uint8Array));
      const received = cb.mock.calls[0][0];
      expect(received[0]).toBe(0xaa);
      expect(received[1]).toBe(0xbb);
    });

    it('should remove event listener', () => {
      const cb = vi.fn();
      protocol.addEventListener(cb);

      // Capture the actual listener added to the device
      const addedListener = mockDevice.addEventListener.mock.calls[0][1];

      protocol.removeEventListener(cb);

      expect(mockDevice.removeEventListener).toHaveBeenCalledWith('inputreport', addedListener);
    });
  });
});
