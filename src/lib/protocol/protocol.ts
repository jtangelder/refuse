import { debug } from '../helpers';
import { FENDER_VID, OPCODES } from './constants';
import { PacketBuilder } from './packet_builder';

/**
 * Protocol event listener callback function.
 */
export type ProtocolEventListenerFn = (data: Uint8Array) => void;

/**
 * Low-level protocol handler for Fender Mustang USB HID communication
 */
export class Protocol {
  private device: HIDDevice | null = null;
  private sequenceId = 0;
  private listeners = new Map<ProtocolEventListenerFn, EventListener>();

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
      await this.sendPacket(PacketBuilder.handshake1());
      await this.sendPacket(PacketBuilder.handshake2());

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
  addEventListener(callback: ProtocolEventListenerFn): void {
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
  removeEventListener(callback: ProtocolEventListenerFn): void {
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
  async sendPacket(data: Uint8Array): Promise<void> {
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
