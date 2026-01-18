import { FENDER_VID, DspType } from "./models";
import { debug } from "./helpers";

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
export class MustangProtocol {
  private device: any | null = null;
  private sequenceId = 0;

  public get isConnected(): boolean {
    return !!this.device;
  }

  public get isSupported(): boolean {
    return !!(navigator as any).hid;
  }

  /**
   * Connect to the amplifier via WebHID
   */
  async connect(): Promise<boolean> {
    if (!this.isSupported) {
      console.error("Connection failed: WebHID is not supported");
      return false;
    }

    try {
      const devices = await (navigator as any).hid.requestDevice({
        filters: [{ vendorId: FENDER_VID }],
      });
      if (devices.length === 0) return false;

      this.device = devices[0];
      await this.device.open();

      debug(`Connected: ${this.device.productName}`);

      // Handshake
      await this.sendRaw(new Uint8Array([OPCODES.INIT_1]));
      await this.sendRaw(
        new Uint8Array([OPCODES.INIT_2_BYTE1, OPCODES.INIT_2_BYTE2]),
      );

      return true;
    } catch (err) {
      console.error("Connection failed", err);
      return false;
    }
  }

  /**
   * Disconnect from the amplifier
   */
  async disconnect(): Promise<void> {
    if (this.device) {
      await this.device.close();
      this.device = null;
    }
  }

  /**
   * Add event listener for incoming HID reports
   */
  addEventListener(callback: (data: Uint8Array) => void): void {
    if (!this.device) return;

    this.device.addEventListener("inputreport", (e: any) => {
      const data = new Uint8Array(e.data.buffer);
      debug(
        `HID RECV [raw]: [${Array.from(data)
          .map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(", ")}]`,
      );
      callback(data);
    });
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: (data: Uint8Array) => void): void {
    if (!this.device) return;
    this.device.removeEventListener("inputreport", callback);
  }

  /**
   * Request full state dump from amplifier
   */
  async requestState(): Promise<void> {
    await this.sendRaw(
      new Uint8Array([OPCODES.REQUEST_STATE, OPCODES.REQUEST_STATE_BYTE2]),
    );
  }

  /**
   * Request bypass states for all effect slots
   */
  async requestBypassStates(): Promise<void> {
    await this.sendRaw(
      new Uint8Array([OPCODES.REQUEST_BYPASS, OPCODES.REQUEST_BYPASS_BYTE2]),
    );
  }

  /**
   * Get the next sequence ID and increment it
   */
  public getNextSequenceId(): number {
    this.sequenceId = (this.sequenceId + 1) & 0xff;
    return this.sequenceId;
  }

  /**
   * Create a DSP parameter packet (amp/effect settings)
   */
  createDspPacket(options: {
    type: DspType;
    slot: number;
    modelId: number;
    knobs?: number[];
    bypass?: boolean;
  }): Uint8Array {
    const packet = new Uint8Array(64);

    // Header
    packet[0] = OPCODES.DATA_PACKET;
    packet[1] = OPCODES.DATA_WRITE;
    packet[2] = options.type;

    // Sequence ID
    packet[6] = this.getNextSequenceId();
    packet[7] = 0x01;

    // Model ID
    packet[16] = (options.modelId >> 8) & 0xff;
    packet[17] = options.modelId & 0xff;

    // Slot
    packet[18] = options.slot;

    // Bypass (1 = bypassed, 0 = active)
    packet[22] = options.bypass === true ? 1 : 0;

    // Knobs (starting at byte 32)
    if (options.knobs) {
      options.knobs.forEach((value, index) => {
        if (index < 32) {
          packet[32 + index] = value;
        }
      });
    }

    debug(
      `[PROTOCOL] Created DSP Packet (Type: 0x${options.type.toString(16)}, Slot: ${options.slot}, Model: 0x${options.modelId.toString(16)})`,
    );
    return packet;
  }

  /**
   * Create apply command packet (required after DSP changes)
   */
  createApplyPacket(dspType: DspType): Uint8Array {
    const packet = new Uint8Array(64);

    packet[0] = OPCODES.DATA_PACKET;
    packet[1] = OPCODES.DATA_WRITE;
    packet[2] = 0x00;

    this.sequenceId = (this.sequenceId + 1) & 0xff;
    packet[6] = this.sequenceId;
    packet[7] = 0x01;

    // PacketSerializer logic for Apply headers
    packet[4] = dspType === DspType.MOD ? 0x01 : 0x02;

    debug(`[PROTOCOL] Created Apply Packet (Type: 0x${dspType.toString(16)})`);
    return packet;
  }

  /**
   * Create bypass toggle packet
   */
  createBypassPacket(
    slot: number,
    enabled: boolean,
    dspType: DspType,
  ): Uint8Array {
    const packet = new Uint8Array(64);

    // Map DspType to family: 0x06 (STOMP) -> 3, 0x07 (MOD) -> 4, etc.
    const family = dspType - 3;

    packet[0] = OPCODES.BYPASS_PACKET;
    packet[1] = OPCODES.BYPASS_SET;
    packet[2] = family;
    packet[3] = enabled ? 0x00 : 0x01; // 0=On, 1=Off
    packet[4] = slot;

    debug(
      `[PROTOCOL] Created Bypass Packet (Slot: ${slot}, Enabled: ${enabled}, Family: ${family})`,
    );
    return packet;
  }

  /**
   * Create preset save packet
   */
  createPresetSavePacket(slot: number, name: string): Uint8Array {
    if (slot < 0 || slot > 23) throw new Error("Slot must be 0-23");
    if (name.length > 32) throw new Error("Name too long (max 32 chars)");

    const packet = new Uint8Array(64);

    packet[0] = OPCODES.DATA_PACKET;
    packet[1] = OPCODES.DATA_READ;
    packet[2] = 0x03;
    packet[3] = 0x00;
    packet[4] = slot;
    packet[5] = 0x00;
    packet[6] = 0x01;
    packet[7] = 0x01;

    // Encode name starting at byte 16
    const nameBytes = new TextEncoder().encode(name);
    packet.set(nameBytes, 16);

    debug(
      `[PROTOCOL] Created Preset Save Packet (Slot: ${slot}, Name: "${name}")`,
    );
    return packet;
  }

  /**
   * Create preset load packet
   */
  createPresetLoadPacket(slot: number): Uint8Array {
    if (slot < 0 || slot > 23) throw new Error("Slot must be 0-23");

    const packet = new Uint8Array(64);

    packet[0] = OPCODES.DATA_PACKET;
    packet[1] = OPCODES.DATA_READ;
    packet[2] = 0x01;
    packet[3] = 0x00;
    packet[4] = slot;
    packet[5] = 0x00;
    packet[6] = 0x01;

    debug(`[PROTOCOL] Created Preset Load Packet (Slot: ${slot})`);
    return packet;
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
    if (!this.device) throw new Error("Not connected");

    try {
      debug(
        `HID SEND [raw]: [${Array.from(data)
          .map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(", ")}]`,
      );
      await this.device.sendReport(0, data);
    } catch (e) {
      console.error("HID Send Error:", e);
      throw e;
    }
  }

  /**
   * Decode string from byte array (null-terminated)
   */
  static decodeString(bytes: Uint8Array): string {
    const nullIndex = bytes.indexOf(0);
    const trimmed = nullIndex >= 0 ? bytes.slice(0, nullIndex) : bytes;
    return new TextDecoder().decode(trimmed);
  }

  /**
   * Parse DSP data from incoming packet
   */
  static parseDspData(data: Uint8Array): {
    type: number;
    slot: number;
    modelId: number;
    bypass: boolean;
    knobs: number[];
  } | null {
    if (data.length < 64) return null;

    const type = data[2];
    const slot = data[18];
    const modelId = (data[16] << 8) | data[17];
    const bypass = data[22] === 1;

    // Extract knobs (bytes 32-63)
    const knobs: number[] = [];
    for (let i = 32; i < 64; i++) {
      knobs.push(data[i]);
    }

    const result = { type, slot, modelId, bypass, knobs };
    debug(`[PROTOCOL] Parsed DSP Data:`, result);
    return result;
  }

  /**
   * Check if packet is a bypass response
   */
  static isBypassResponse(data: Uint8Array): boolean {
    return (
      data[0] === OPCODES.BYPASS_PACKET && data[1] === OPCODES.BYPASS_RESPONSE
    );
  }

  /**
   * Parse bypass response
   */
  static parseBypassResponse(
    data: Uint8Array,
  ): { slot: number; enabled: boolean } | null {
    if (!this.isBypassResponse(data)) return null;

    const status = data[3]; // 0=On, 1=Off
    const slot = data[4];
    const enabled = status === 0;

    const result = { slot, enabled };
    debug(`[PROTOCOL] Parsed Bypass Response:`, result);
    return result;
  }

  /**
   * Check if packet is a preset name packet
   */
  static isPresetNamePacket(data: Uint8Array): boolean {
    return (
      data[0] === OPCODES.DATA_PACKET &&
      data[1] === OPCODES.DATA_READ &&
      (data[2] === OPCODES.PRESET_INFO || data[2] === 0x00)
    );
  }

  /**
   * Parse preset name from packet
   */
  static parsePresetName(
    data: Uint8Array,
  ): { slot: number; name: string } | null {
    if (!this.isPresetNamePacket(data)) return null;

    const slot = data[4];
    const nameBytes = data.slice(16, 48);
    const name = this.decodeString(nameBytes);

    const result = { slot, name };
    debug(`[PROTOCOL] Parsed Preset Name:`, result);
    return result;
  }
}
