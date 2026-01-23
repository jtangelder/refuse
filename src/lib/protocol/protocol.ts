import { debug } from '../helpers';

/**
 * USB Vendor ID for Fender devices
 */
export const FENDER_VID = 0x1ed8;

/**
 * Protocol opcodes used in USB HID communication
 */
export const OPCODES = {
  // Connection
  INIT_1: 0xc3,
  INIT_2_BYTE1: 0x1a,
  INIT_2_BYTE2: 0x03,

  // State requests
  REQUEST_STATE: 0xff,
  REQUEST_STATE_BYTE2: 0xc1,
  REQUEST_BYPASS: 0x19,
  REQUEST_BYPASS_BYTE2: 0x00,

  // Data operations
  DATA_PACKET: 0x1c,
  DATA_WRITE: 0x03,
  DATA_READ: 0x01,
  PRESET_INFO: 0x04,

  // Bypass control
  BYPASS_PACKET: 0x19,
  BYPASS_SET: 0xc3,
  BYPASS_RESPONSE: 0xc3,

  // Live hardware changes
  LIVE_CHANGE: 0x05,
} as const;

/**
 * Low-level protocol handler for Fender Mustang USB HID communication
 */
export class Protocol {
  private device: HIDDevice | null = null;
  private sequenceId = 0;
  private listeners = new Map<Function, EventListener>();

  public get isConnected(): boolean {
    return !!this.device;
  }

  public get isSupported(): boolean {
    return !!navigator.hid;
  }

  /**
   * Connect to the amplifier via WebHID
   */
  async connect(): Promise<boolean> {
    if (!this.isSupported) {
      console.error('Connection failed: WebHID is not supported');
      return false;
    }

    try {
      const devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: FENDER_VID }],
      });
      if (devices.length === 0) return false;

      const device = devices[0];
      await device.open();
      this.device = device;

      debug(`Connected: ${this.device?.productName}`);

      // Handshake
      await this.sendRaw(new Uint8Array([OPCODES.INIT_1]));
      await this.sendRaw(new Uint8Array([OPCODES.INIT_2_BYTE1, OPCODES.INIT_2_BYTE2]));

      return true;
    } catch (err) {
      console.error('Connection failed', err);
      this.device = null;
      return false;
    }
  }

  /**
   * Disconnect from the amplifier
   */
  async disconnect(): Promise<void> {
    if (this.device) {
      await this.device!.close();
      this.device = null;
    }
  }

  /**
   * Add event listener for incoming HID reports
   */
  addEventListener(callback: (data: Uint8Array) => void): void {
    if (!this.device) return;

    if (this.listeners.has(callback)) return; // Prevent duplicate registration

    const listener = (ev: Event) => {
      const event = ev as HIDInputReportEvent;
      const data = new Uint8Array(event.data.buffer);
      debug(
        `HID RECV [raw]: [${Array.from(data)
          .map(b => '0x' + b.toString(16).padStart(2, '0'))
          .join(', ')}]`,
      );
      callback(data);
    };

    this.listeners.set(callback, listener);
    this.device.addEventListener('inputreport', listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: (data: Uint8Array) => void): void {
    if (!this.device) return;

    const listener = this.listeners.get(callback);
    if (listener) {
      this.device.removeEventListener('inputreport', listener);
      this.listeners.delete(callback);
    }
  }

  /**
   * Get the next sequence ID and increment it
   */
  public getNextSequenceId(): number {
    this.sequenceId = (this.sequenceId + 1) & 0xff;
    return this.sequenceId;
  }

  /**
   * Send a packet to the amplifier
   */
  async sendPacket(packet: Uint8Array): Promise<void> {
    await this.sendRaw(packet);
  }

  /**
   * Send raw data to the amplifier
   */
  private async sendRaw(data: Uint8Array): Promise<void> {
    if (!this.device) throw new Error('Not connected');

    try {
      debug(
        `HID SEND [raw]: [${Array.from(data)
          .map(b => '0x' + b.toString(16).padStart(2, '0'))
          .join(', ')}]`,
      );
      await this.device.sendReport(0, data as unknown as BufferSource);
    } catch (e) {
      console.error('HID Send Error:', e);
      throw e;
    }
  }
}
