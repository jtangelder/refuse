import { debug } from '../helpers';
import {
  FENDER_VID,
  MUSTANG_DEVICE_SPECS,
  OPCODES,
  findMustangDeviceSpec,
  type MustangDeviceSpec,
} from './constants';
import { PacketBuilder } from './packet_builder';
import { type IProtocol, type ProtocolEventListenerFn } from './protocol_interface';

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 150;

export interface ProtocolOptions {
  /** Max time (ms) to wait for the amp's 64-byte HID reply to each handshake packet. */
  handshakeTimeoutMs?: number;
}

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
  private cancelHandshakeWait?: () => void;
  private _lastError: string | null = null;
  public onDisconnect?: () => void;

  constructor(private readonly options: ProtocolOptions = {}) {}

  public get isConnected(): boolean {
    return !!this.device;
  }

  public get deviceName(): string | undefined {
    return this.device?.productName || undefined;
  }

  public get productId(): number | undefined {
    return this.device?.productId;
  }

  public get deviceSpec(): MustangDeviceSpec | undefined {
    return findMustangDeviceSpec(this.device?.productId);
  }

  public get lastError(): string | null {
    return this._lastError;
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
    this._lastError = null;
    if (!this.isSupported) {
      this._lastError = 'WebHID is not supported in this browser';
      console.error('Connection failed: WebHID is not supported');
      return false;
    }

    if (this.device) {
      await this.disconnect();
    }

    let openedDevice: HIDDevice | null = null;
    try {
      const devices = await navigator.hid.requestDevice({
        filters: MUSTANG_DEVICE_SPECS.map(spec => ({ vendorId: FENDER_VID, productId: spec.pid })),
      });
      if (devices.length === 0) return false;

      const device =
        devices.find(d =>
          d.collections?.some(c => (c.inputReports?.length ?? 0) > 0 && (c.outputReports?.length ?? 0) > 0),
        ) ?? devices[0];
      if (!device.opened) {
        await device.open();
      }
      openedDevice = device;
      this.device = device;

      // Bind any listeners registered prior to connect()
      this.listeners.forEach(listener => device.addEventListener('inputreport', listener));

      debug(`Connected: ${this.device?.productName}`);

      // Setup hot-unplug / disconnect listener
      this.setupDisconnectListener();

      // 2-step Mustang USB HID handshake (PID-aware: 0x03 for early V1, 0xc1 for MIII-V V1 & all V2)
      const handshake2Sub = this.deviceSpec?.handshake2SubCommand ?? OPCODES.HANDSHAKE_2_BYTE2_V2;
      await this.sendHandshakePacket(device, PacketBuilder.handshake1());
      await this.sendHandshakePacket(device, PacketBuilder.handshake2(handshake2Sub));

      return true;
    } catch (err) {
      this._lastError = err instanceof Error ? err.message : String(err);
      console.error('Connection failed', err);
      if (openedDevice) {
        await this.disconnect();
      } else {
        this.device = null;
      }
      return false;
    }
  }

  private async sendHandshakePacket(device: HIDDevice, packet: Uint8Array): Promise<void> {
    const timeoutMs = this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    let replied = false;
    let resolveWait: (() => void) | undefined;

    const onReport: EventListener = () => {
      replied = true;
      resolveWait?.();
    };

    device.addEventListener('inputreport', onReport);
    try {
      await this.sendPacket(packet);
      if (replied || !this.device || timeoutMs <= 0) return;

      await new Promise<void>(resolve => {
        const finish = () => {
          clearTimeout(timer);
          if (this.cancelHandshakeWait === finish) {
            this.cancelHandshakeWait = undefined;
          }
          resolveWait = undefined;
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        resolveWait = finish;
        this.cancelHandshakeWait = finish;
      });
    } finally {
      device.removeEventListener('inputreport', onReport);
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
    this.cancelHandshakeWait?.();
    this.cancelHandshakeWait = undefined;
    if (this.disconnectHandler && this.isSupported) {
      if (navigator.hid?.removeEventListener) {
        navigator.hid.removeEventListener('disconnect', this.disconnectHandler);
      }
      this.disconnectHandler = undefined;
    }
    if (this.device) {
      const device = this.device;
      this.listeners.forEach(listener => device.removeEventListener('inputreport', listener));
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
