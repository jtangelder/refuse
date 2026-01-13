/**
 * FENDER MUSTANG WEBHID API (v9)
 * Features:
 * - Buffer-First Architecture (Single Source of Truth)
 * - Full V1 & V2 Model Support (Hidden Amps/Stomps)
 * - Reactive Hardware Sync (Knobs & Bypass)
 * - Two-Phase Initialization (DSP + Bypass Flags)
 */

export const FENDER_VID = 0x1ed8;

export enum DspType {
  AMP = 0x05,
  STOMP = 0x06,
  MOD = 0x07,
  DELAY = 0x08,
  REVERB = 0x09,
}

// --- DATA REGISTRIES ---

export interface ModelDef {
  id: number;
  name: string;
  type: DspType;
  knobs: string[];
}

const m = (
  id: number,
  name: string,
  type: DspType,
  knobs: string[]
): ModelDef => ({ id, name, type, knobs });

// prettier-ignore
export const AMP_MODELS: Record<string, ModelDef> = {
    // Standard V1
    F57_DELUXE:    m(0x6700, "'57 Deluxe", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    F59_BASSMAN:   m(0x6400, "'59 Bassman", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    F57_CHAMP:     m(0x7c00, "'57 Champ", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    F65_DELUXE:    m(0x5300, "'65 Deluxe Reverb", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    F65_PRINCETON: m(0x6a00, "'65 Princeton", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    F65_TWIN:      m(0x7500, "'65 Twin Reverb", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    SUPER_SONIC:   m(0x7200, "Super-Sonic", DspType.AMP, ["Vol", "Gain", "Gain2", "Master", "Treb", "Mid", "Bass", "Pres"]),
    BRIT_60S:      m(0x6100, "British '60s", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    BRIT_70S:      m(0x7900, "British '70s", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    BRIT_80S:      m(0x5e00, "British '80s", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    US_90S:        m(0x5d00, "American '90s", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    METAL_2000:    m(0x6d00, "Metal 2000", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    // V2 / Hidden
    STUDIO_PREAMP: m(0xf100, "Studio Preamp", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    F57_TWIN:      m(0xf600, "'57 Twin", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    THRIFT_60S:    m(0xf900, "'60s Thrift", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    BRIT_WATTS:    m(0xff00, "British Watts", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
    BRIT_COLOUR:   m(0xfc00, "British Colour", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
};

// prettier-ignore
export const EFFECT_MODELS: Record<string, ModelDef> = {
    // Stomps
    OVERDRIVE:      m(0x3c00, "Overdrive", DspType.STOMP, ["Level", "Gain", "Low", "Mid", "High", ""]),
    WAH:            m(0x4900, "Fixed Wah", DspType.STOMP, ["Level", "Freq", "Min", "Max", "Q", ""]),
    TOUCH_WAH:      m(0x4a00, "Touch Wah", DspType.STOMP, ["Level", "Sens", "Min", "Max", "Q", ""]),
    FUZZ:           m(0x1a00, "Fuzz", DspType.STOMP, ["Level", "Gain", "Octave", "Low", "High", ""]),
    FUZZ_TOUCH_WAH: m(0x1c00, "Fuzz Touch Wah", DspType.STOMP, ["Level", "Gain", "Sens", "Octave", "Peak", ""]),
    SIMPLE_COMP:    m(0x8800, "Simple Comp", DspType.STOMP, ["Type", "", "", "", "", ""]),
    COMPRESSOR:     m(0x0700, "Compressor", DspType.STOMP, ["Level", "Thresh", "Ratio", "Attack", "Release", ""]),
    // V2 Stomps
    RANGER_BOOST:   m(0x0301, "Ranger Boost", DspType.STOMP, ["Level", "Gain", "Tone", "", "", ""]),
    GREEN_BOX:      m(0xba00, "Green Box", DspType.STOMP, ["Level", "Gain", "Tone", "Blend", "", ""]),
    ORANGE_BOX:     m(0x0101, "Orange Box", DspType.STOMP, ["Level", "Gain", "Tone", "", "", ""]),
    BLACK_BOX:      m(0x1101, "Black Box", DspType.STOMP, ["Level", "Gain", "Tone", "", "", ""]),
    BIG_FUZZ:       m(0x0f01, "Big Fuzz", DspType.STOMP, ["Level", "Tone", "Sustain", "", "", ""]),
    // Mod
    SINE_CHORUS:    m(0x1200, "Sine Chorus", DspType.MOD, ["Level", "Rate", "Depth", "Avg Dly", "LR Phase", ""]),
    TRIANGLE_CHORUS:m(0x1300, "Triangle Chorus", DspType.MOD, ["Level", "Rate", "Depth", "Avg Dly", "LR Phase", ""]),
    SINE_FLANGER:   m(0x1800, "Sine Flanger", DspType.MOD, ["Level", "Rate", "Depth", "Fdbk", "LR Phase", ""]),
    TRIANGLE_FLANGER:m(0x1900, "Triangle Flanger", DspType.MOD, ["Level", "Rate", "Depth", "Fdbk", "LR Phase", ""]),
    VIBRATONE:      m(0x2d00, "Vibratone", DspType.MOD, ["Level", "Rotor", "Depth", "Fdbk", "LR Phase", ""]),
    VINTAGE_TREMOLO:m(0x4000, "Vintage Tremolo", DspType.MOD, ["Level", "Rate", "Duty", "Attack", "Release", ""]),
    SINE_TREMOLO:   m(0x4100, "Sine Tremolo", DspType.MOD, ["Level", "Rate", "Duty", "LFO Clip", "Tri Shape", ""]),
    RING_MODULATOR: m(0x2200, "Ring Modulator", DspType.MOD, ["Level", "Freq", "Depth", "Shape", "Phase", ""]),
    STEP_FILTER:    m(0x2900, "Step Filter", DspType.MOD, ["Level", "Rate", "Res", "Min Freq", "Max Freq", ""]),
    PHASER:         m(0x4f00, "Phaser", DspType.MOD, ["Level", "Rate", "Depth", "Fdbk", "Shape", ""]),
    PITCH_SHIFTER:  m(0x1f00, "Pitch Shifter", DspType.MOD, ["Level", "Pitch", "Detune", "Fdbk", "PreDly", ""]),
    // Delay
    MONO_DELAY:     m(0x1600, "Mono Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Bright", "Atten", ""]),
    TAPE_DELAY:     m(0x2b00, "Tape Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Flutter", "Bright", "Stereo"]),
    DUCKING_DELAY:  m(0x1500, "Ducking Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Release", "Thresh", ""]),
    REVERSE_DELAY:  m(0x4600, "Reverse Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Bright", "Atten", ""]),
    // Reverb
    SMALL_HALL:     m(0x2400, "Small Hall", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
    LARGE_HALL:     m(0x3a00, "Large Hall", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
    SPRING_63:      m(0x2100, "'63 Spring", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
    SPRING_65:      m(0x0b00, "'65 Spring", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
};

// prettier-ignore
export const CABINET_MODELS = [
    { id: 0x00, name: "None" },
    { id: 0x01, name: "1x12 '57 Deluxe" },
    { id: 0x02, name: "4x10 '59 Bassman" },
    { id: 0x03, name: "1x8 '57 Champ" },
    { id: 0x04, name: "1x12 '65 Deluxe" },
    { id: 0x05, name: "1x10 '65 Princeton" },
    { id: 0x06, name: "4x12 Metal 2000" },
    { id: 0x07, name: "2x12 British '60s" },
    { id: 0x08, name: "4x12 British '70s" },
    { id: 0x09, name: "2x12 '65 Twin" },
    { id: 0x0a, name: "4x12 British '80s" },
    { id: 0x0b, name: "2x12 Super-Sonic" },
    { id: 0x0c, name: "1x12 Super-Sonic" },
    { id: 0x0D, name: "2x12 '57 Twin" },
    { id: 0x0E, name: "2x12 '60s Thrift" },
    { id: 0x0F, name: "4x12 British Watts" },
    { id: 0x10, name: "4x12 British Colour" }
];

// --- MAIN API CLASS ---

export class MustangAPI {
  public device: any | null = null;
  private sequenceId = 0;

  /**
   * SINGLE SOURCE OF TRUTH (Reactive State)
   * UI components should read directly from here.
   * Hardware changes write directly to here.
   */
  public state = {
    [DspType.AMP]: new Uint8Array(64),
    [DspType.MOD]: new Uint8Array(64),
    [DspType.DELAY]: new Uint8Array(64),
    [DspType.REVERB]: new Uint8Array(64),
    // Stomp slots 0-3
    stomps: [
      new Uint8Array(64),
      new Uint8Array(64),
      new Uint8Array(64),
      new Uint8Array(64),
    ],
  };

  /**
   * Tracks the Active/Bypass status of effects (True = Active/On)
   * Indices 0-7 correspond to effect slots.
   */
  public effectEnabled: boolean[] = [
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ];

  public get isConnected(): boolean {
    return !!this.device;
  }

  // ==========================================
  // CONNECTION & SYNC
  // ==========================================

  async connect(): Promise<boolean> {
    try {
      const devices = await (navigator as any).hid.requestDevice({
        filters: [{ vendorId: FENDER_VID }],
      });
      if (devices.length === 0) return false;

      this.device = devices[0];
      await this.device.open();

      console.log(`Connected: ${this.device.productName}`);

      // Handshake
      await this.send(new Uint8Array([0xc3]));
      await this.send(new Uint8Array([0x1a, 0x03]));

      return true;
    } catch (err) {
      console.error("Connection failed", err);
      return false;
    }
  }

  /**
   * Starts the reactive listener. Call this ONCE after connecting.
   * It keeps 'this.state' and 'this.effectEnabled' perfectly in sync with hardware.
   */
  public monitorPhysicalChanges(
    onUpdate?: (type: string, detail?: any) => void
  ) {
    if (!this.device) return;

    this.device.addEventListener("inputreport", (e: any) => {
      const data = new Uint8Array(e.data.buffer);
      const b0 = data[0];
      const b1 = data[1];

console.log(data)

      // 1. DATA UPDATES (Knobs/Models)
      // 0x1c 0x03 (Param Change) OR 0x1c 0x01 (Preset Load) OR 0x05... (Live Knob)
      // We treat them all as valid state updates if they contain 64 bytes.
      if (b0 === 0x1c && (b1 === 0x03 || b1 === 0x01)) {
        const type = data[2] as DspType;
        const slot = data[18];

        // Update the correct buffer in 'this.state'
        if (type === DspType.STOMP) {
          if (slot >= 0 && slot < 4) this.state.stomps[slot].set(data);
        } else if (this.state[type]) {
          this.state[type].set(data);
        }

        // Update Bypass Tracker from Byte 22 (Standard Protocol)
        // 1 = Bypassed, 0 = Active
        if (type !== DspType.AMP) {
          this.effectEnabled[slot] = data[22] === 0;
        }

        if (onUpdate) onUpdate("dsp_change", type);
      }

      // 2. BYPASS TOGGLES (Footswitch / Button Press)
      // Opcode: 19 c3 [Type] [Status] [Slot]
      else if (b0 === 0x19 && b1 === 0xc3) {
        const status = data[3]; // 0=On, 1=Off
        const slot = data[4];
        const isActive = status === 0;

        this.effectEnabled[slot] = isActive;
        if (onUpdate) onUpdate("bypass_toggle", { slot, isActive });
      }
    });
  }

  /**
   * Request DSP Dump (Knobs).
   * Does NOT return bypass states.
   */
  public async refreshState() {
    if (!this.device) return;
    await this.send(new Uint8Array([0xff, 0xc1]));
  }

  /**
   * Request Bypass Flags (On/Off lights).
   * Waits for 0x19 0xc3 responses to populate 'this.effectEnabled'.
   */
  public async refreshBypassStates(): Promise<void> {
    if (!this.device) return;

    return new Promise<void>(async (resolve) => {
      const pending = new Set([0, 1, 2, 3, 4]); // Common slots
      const listener = (e: any) => {
        const d = new Uint8Array(e.data.buffer);
        if (d[0] === 0x19 && d[1] === 0xc3) {
          pending.delete(d[4]);
          if (pending.size === 0) {
            this.device?.removeEventListener("inputreport", listener);
            resolve();
          }
        }
      };
      this.device.addEventListener("inputreport", listener);

      // Send Request
      await this.send(new Uint8Array([0x19, 0x00]));

      // Timeout fallback
      setTimeout(() => {
        this.device?.removeEventListener("inputreport", listener);
        resolve();
      }, 500);
    });
  }

  // ==========================================
  // CONTROLS (BUFFER-FIRST)
  // ==========================================

  /**
   * BULK UPDATE: Sends a full 64-byte buffer to the amp.
   * Used by Preset Loaders.
   */
  public async sendFullBuffer(type: DspType, slot: number, buffer: Uint8Array) {
    if (!this.device) return;

    // 1. Optimistic Update (UI updates instantly)
    if (type === DspType.STOMP && slot < 4) {
      this.state.stomps[slot].set(buffer);
    } else if ((this.state as any)[type]) {
      (this.state as any)[type].set(buffer);
    }

    // 2. Sync Bypass Tracker (Byte 22)
    if (type !== DspType.AMP) {
      this.effectEnabled[slot] = buffer[22] === 0;
    }

    // 3. Prepare Packet
    const packet = new Uint8Array(64);
    packet.set(buffer);

    // Ensure Header is Write Command
    packet[0] = 0x1c;
    packet[1] = 0x03;
    packet[2] = type;
    packet[18] = slot;

    this.sequenceId = (this.sequenceId + 1) & 0xff;
    packet[6] = this.sequenceId;
    packet[7] = 0x01;

    // 4. Send & Apply
    await this.send(packet);
    await this.sendApply(type);
  }

  /**
   * Changes a single knob parameter.
   */
  public async setParameter(
    type: DspType,
    slot: number,
    byteIndex: number,
    value: number
  ) {
    // 1. Get current buffer reference
    let buffer: Uint8Array;
    if (type === DspType.STOMP) {
      buffer = this.state.stomps[slot];
    } else {
      buffer = this.state[type];
    }

    // 2. Update Local State
    buffer[byteIndex] = value;

    // 3. Send to Hardware
    await this.sendFullBuffer(type, slot, buffer);
  }

  public async setEffectEnabled(slot: number, enabled: boolean) {
    if (!this.device) return;
    // 0x19 0x02 = Set Bypass
    const buf = new Uint8Array(64);
    buf[0] = 0x19;
    buf[1] = 0x02;
    buf[2] = 0x02; // Type (02 generic?)
    buf[3] = enabled ? 0x00 : 0x01; // 0=On, 1=Off
    buf[4] = slot;

    await this.send(buf);
    // We rely on the hardware echo (0x19 0xc3) to update our local tracker
  }

  // ==========================================
  // INTERNALS
  // ==========================================

  private async sendApply(dspType: DspType) {
    const buf = new Uint8Array(64);
    buf[0] = 0x1c;
    buf[1] = 0x03;
    buf[2] = 0x00;
    this.sequenceId = (this.sequenceId + 1) & 0xff;
    buf[6] = this.sequenceId;
    buf[7] = 0x01;

    // PacketSerializer logic for Apply headers
    buf[4] = dspType === DspType.MOD ? 0x01 : 0x02;

    await this.send(buf);
  }

  private async send(data: Uint8Array) {
    if (!this.device) return;
    try {
      await this.device.sendReport(0, data);
    } catch (e) {
      console.error("HID Send Error:", e);
    }
  }
}
