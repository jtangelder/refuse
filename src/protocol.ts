/**
 * Fender Mustang WebHID API - Protocol Layer
 * Low-level HID communication abstraction
 */

import { DspType, FENDER_VID } from "./constants";

export class HIDProtocol {
  private device: any = null;
  private initVal: number = 0x03;
  private sequenceId: number = 0;

  public isConnected = false;

  /**
   * Initialize connection to Mustang device
   */
  async connect(): Promise<boolean> {
    if (!(navigator as any).hid) throw new Error("WebHID not supported");
    const devices = await (navigator as any).hid.requestDevice({
      filters: [{ vendorId: FENDER_VID }],
    });
    if (!devices.length) return false;

    this.device = devices[0];
    // V2 detection
    if ([0x05, 0x14, 0x16].includes(this.device.productId)) this.initVal = 0xc1;

    await this.device.open();
    this.isConnected = true;
    await this.handshake();
    return true;
  }

  /**
   * Close the connection
   */
  async disconnect(): Promise<void> {
    if (this.device?.opened) await this.device.close();
    this.isConnected = false;
    this.device = null;
  }

  /**
   * Send raw HID packet
   */
  async send(data: Uint8Array): Promise<void> {
    await this.device.sendReport(0, data);
  }

  /**
   * Send DSP configuration with sequence counter
   */
  async sendDspConfig(
    type: DspType,
    modelId: number,
    params: Uint8Array,
    slot?: number
  ): Promise<void> {
    const buf = new Uint8Array(64);
    buf.set(params);

    buf[0] = 0x1c;
    buf[1] = 0x03;
    buf[2] = type;
    this.sequenceId = (this.sequenceId + 1) & 0xff;
    buf[6] = this.sequenceId;
    buf[7] = 0x01;

    buf[16] = (modelId >> 8) & 0xff;
    buf[17] = modelId & 0xff;
    if (slot !== undefined) buf[18] = slot;

    await this.send(buf);
  }

  /**
   * Send apply/commit signal to hardware
   */
  async sendApply(): Promise<void> {
    const buf = new Uint8Array(64);
    buf[0] = 0x1c;
    buf[1] = 0x03;
    buf[2] = 0x00; // DSP_NONE

    this.sequenceId = (this.sequenceId + 1) & 0xff;
    buf[6] = this.sequenceId;
    buf[7] = 0x01;

    await this.send(buf);
  }

  /**
   * Read with timeout
   */
  async read(timeout = 500): Promise<DataView> {
    return new Promise((resolve) => {
      const handler = (event: any) => {
        this.device.removeEventListener("inputreport", handler);
        resolve(event.data);
      };
      this.device.addEventListener("inputreport", handler);
      setTimeout(() => {
        this.device.removeEventListener("inputreport", handler);
        resolve(new DataView(new ArrayBuffer(0)));
      }, timeout);
    });
  }

  /**
   * Register listener for hardware-initiated changes
   */
  onHIDInput(callback: (data: Uint8Array) => void): void {
    if (!this.device) return;
    this.device.addEventListener("inputreport", (event: any) => {
      callback(new Uint8Array(event.data.buffer));
    });
  }

  /**
   * Handshake sequence
   */
  private async handshake(): Promise<void> {
    await this.send(new Uint8Array([0x00, 0xc3]));
    await this.read();
    await this.send(new Uint8Array([0x1a, this.initVal]));
    await this.read();
  }
}
