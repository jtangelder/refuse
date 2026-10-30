import { debug } from '../helpers';
import { FENDER_VID } from './constants';
import { PacketBuilder } from './packet_builder';
import { type IProtocol, type ProtocolEventListenerFn } from './protocol_interface';

function formatHexPacket(prefix: string, data: Uint8Array): string {
  return `${prefix}: [${Array.from(data)
    .map(b => '0x' + b.toString(16).padStart(2, '0'))
    .join(', ')}]`;
}

/**
 * Low-level protocol handler for Fender Mustang USB HID communication
 */
export class Protocol implements IProtocol {
  private device: HIDDevice | null = null;
  private sequenceId = 0;
  private listeners = new Map<ProtocolEventListenerFn, EventListener>();
  private disconnectHandler?: (ev: HIDConnectionEvent) => void;
  public onDisconnect?: () => void;

  public get isConnected(): boolean {
    return !!this.device;
  }

  public get isSupported(): boolean {
    return Protocol.isHidSupported();
  }

  public static isHidSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.hid;
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

      // Bind any listeners registered prior to connect()
      this.listeners.forEach(listener => device.addEventListener('inputreport', listener));

      debug(`Connected: ${this.device?.productName}`);

      // Setup hot-unplug / disconnect listener
      this.setupDisconnectListener();

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

  private setupDisconnectListener(): void {
    if (!this.isSupported || this.disconnectHandler) return;

    this.disconnectHandler = (ev: HIDConnectionEvent) => {
      if (this.device && ev.device === this.device) {
        debug('[Protocol] USB device disconnected unexpectedly');
        void this.disconnect();
        this.onDisconnect?.();
      }
    };

    if (navigator.hid?.addEventListener) {
      navigator.hid.addEventListener('disconnect', this.disconnectHandler);
    }
  }

  /**
   * Disconnect from the amplifier
   */
  async disconnect(): Promise<void> {
    if (this.disconnectHandler && this.isSupported) {
      if (navigator.hid?.removeEventListener) {
        navigator.hid.removeEventListener('disconnect', this.disconnectHandler);
      }
      this.disconnectHandler = undefined;
    }
    if (this.device) {
      const device = this.device;
      this.listeners.forEach(listener => device.removeEventListener('inputreport', listener));
      this.listeners.clear();
      this.device = null;
      try {
        await device.close();
      } catch (err) {
        debug('[Protocol] Error closing device:', err);
      }
    }
  }

  /**
   * Add event listener for incoming HID reports
   */
  addEventListener(callback: ProtocolEventListenerFn): void {
    if (this.listeners.has(callback)) return; // Prevent duplicate registration

    const listener = (ev: Event) => {
      const event = ev as HIDInputReportEvent;
      const view = event.data;
      const data =
        view.byteOffset !== undefined && view.byteLength !== undefined
          ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
          : new Uint8Array(view.buffer);
      debug(() => formatHexPacket('HID RECV [raw]', data));
      callback(data);
    };

    this.listeners.set(callback, listener);
    if (this.device) {
      this.device.addEventListener('inputreport', listener);
    }
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: ProtocolEventListenerFn): void {
    const listener = this.listeners.get(callback);
    if (listener) {
      this.device?.removeEventListener('inputreport', listener);
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
      debug(() => formatHexPacket('HID SEND [raw]', data));
      await this.device.sendReport(0, data as unknown as BufferSource);
    } catch (e) {
      console.error('HID Send Error:', e);
      throw e;
    }
  }
}
