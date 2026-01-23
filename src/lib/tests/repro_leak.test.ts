import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Protocol, FENDER_VID } from '../protocol/protocol';

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

describe('Protocol Event Leak', () => {
  let protocol: Protocol;

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      hid: mockHid,
    });
    mockHid.requestDevice.mockResolvedValue([mockDevice]);

    // Reset mocks
    mockDevice.addEventListener.mockReset();
    mockDevice.removeEventListener.mockReset();

    protocol = new Protocol();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should remove the exact same listener function that was added', async () => {
    await protocol.connect();

    const cb = vi.fn();
    protocol.addEventListener(cb);

    // Capture the function passed to the device
    expect(mockDevice.addEventListener).toHaveBeenCalled();
    const addedListener = mockDevice.addEventListener.mock.calls[0][1];

    protocol.removeEventListener(cb);

    // Verify removeEventListener was called with the SAME function
    expect(mockDevice.removeEventListener).toHaveBeenCalledWith('inputreport', addedListener);
  });
});
