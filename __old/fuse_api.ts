export const FENDER_VID = 0x1ed8;

// --- 1. Constants & Enums ---

export enum DspType {
  AMP = 0x05,
  STOMP = 0x06,
  MOD = 0x07,
  DELAY = 0x08,
  REVERB = 0x09,
}

// Precise byte offsets
export enum AmpParam {
  VOLUME = 32,
  GAIN = 33,
  GAIN2 = 34,
  MASTER_VOL = 35,
  TREBLE = 36,
  MIDDLE = 37,
  BASS = 38,
  PRESENCE = 39,
  DEPTH = 41, // Used in some models
  BIAS = 42,
  NOISE_GATE = 45, // 0x00-0x05
  THRESHOLD = 48, // 0x00-0x09 (Only active if Gate >= 0x05?)
  CABINET = 49,
  SAG = 51, // 0x00-0x02
  BRIGHT = 52, // Bool
}

// --- 2. Model Registries ---

export interface ModelDef {
  id: number;
  name: string;
  type: DspType;
  knobs: string[];
}

const m = (id: number, name: string, type: DspType, knobs: string[]) => ({
  id,
  name,
  type,
  knobs,
});

export const AMP_MODELS: Record<string, ModelDef> = {
  F57_DELUXE: m(0x6700, "'57 Deluxe", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  F59_BASSMAN: m(0x6400, "'59 Bassman", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  F57_CHAMP: m(0x7c00, "'57 Champ", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  F65_DELUXE: m(0x5300, "'65 Deluxe Reverb", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  F65_PRINCETON: m(0x6a00, "'65 Princeton", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  F65_TWIN: m(0x7500, "'65 Twin Reverb", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  SUPER_SONIC: m(0x7200, "Super-Sonic", DspType.AMP, [
    "Vol",
    "Gain",
    "Gain2",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  BRIT_60S: m(0x6100, "British '60s", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  BRIT_70S: m(0x7900, "British '70s", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  BRIT_80S: m(0x5e00, "British '80s", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  US_90S: m(0x5d00, "American '90s", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  METAL_2000: m(0x6d00, "Metal 2000", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
  STUDIO_PREAMP: m(0xf100, "Studio Preamp", DspType.AMP, [
    "Vol",
    "Gain",
    "",
    "Master",
    "Treb",
    "Mid",
    "Bass",
    "Pres",
  ]),
};

export const CABINET_MODELS = [
  { id: 0x00, name: "None" },
  { id: 0x01, name: "1x12 '57 Deluxe" },
  { id: 0x02, name: "4x10 '59 Bassman" },
  { id: 0x03, name: "1x8 '57 Champ" },
  { id: 0x04, name: "1x12 '65 Deluxe" },
  { id: 0x05, name: "1x10 '65 Princeton" },
  { id: 0x06, name: "2x12 '65 Twin" },
  { id: 0x07, name: "1x12 Super-Sonic" },
  { id: 0x08, name: "2x12 British '60s" },
  { id: 0x09, name: "4x12 British '70s" },
  { id: 0x0a, name: "4x12 British '80s" },
  { id: 0x0b, name: "4x12 American '90s" },
  { id: 0x0c, name: "4x12 Metal 2000" },
];

// COMPLETE EFFECT REGISTRY
// Maps Model IDs to their required DSP Resource (Stomp, Mod, Delay, Reverb)
export const EFFECT_MODELS: Record<string, ModelDef> = {
  // --- STOMP (0x06) ---
  OVERDRIVE: m(0x3c00, "Overdrive", DspType.STOMP, [
    "Level",
    "Gain",
    "Low",
    "Mid",
    "High",
    "",
  ]),
  WAH: m(0x4900, "Fixed Wah", DspType.STOMP, [
    "Level",
    "Freq",
    "Min",
    "Max",
    "Q",
    "",
  ]),
  TOUCH_WAH: m(0x4a00, "Touch Wah", DspType.STOMP, [
    "Level",
    "Sens",
    "Min",
    "Max",
    "Q",
    "",
  ]),
  FUZZ: m(0x1a00, "Fuzz", DspType.STOMP, [
    "Level",
    "Gain",
    "Octave",
    "Low",
    "High",
    "",
  ]),
  FUZZ_TOUCH_WAH: m(0x1c00, "Fuzz Touch Wah", DspType.STOMP, [
    "Level",
    "Gain",
    "Sens",
    "Octave",
    "Peak",
    "",
  ]),
  SIMPLE_COMP: m(0x8800, "Simple Comp", DspType.STOMP, [
    "Type",
    "",
    "",
    "",
    "",
    "",
  ]),
  COMPRESSOR: m(0x0700, "Compressor", DspType.STOMP, [
    "Level",
    "Thresh",
    "Ratio",
    "Attack",
    "Release",
    "",
  ]),
  RANGER_BOOST: m(0x0301, "Ranger Boost", DspType.STOMP, [
    "Level",
    "Gain",
    "Tone",
    "",
    "",
    "",
  ]),
  GREEN_BOX: m(0xba00, "Green Box", DspType.STOMP, [
    "Level",
    "Gain",
    "Tone",
    "Blend",
    "",
    "",
  ]),
  ORANGE_BOX: m(0x1001, "Orange Box", DspType.STOMP, [
    "Level",
    "Gain",
    "Tone",
    "",
    "",
    "",
  ]),
  BLACK_BOX: m(0x1101, "Black Box", DspType.STOMP, [
    "Level",
    "Gain",
    "Tone",
    "",
    "",
    "",
  ]),
  BIG_FUZZ: m(0x0f01, "Big Fuzz", DspType.STOMP, [
    "Level",
    "Tone",
    "Sustain",
    "",
    "",
    "",
  ]),

  // --- MOD (0x07) ---
  SINE_CHORUS: m(0x1200, "Sine Chorus", DspType.MOD, [
    "Level",
    "Rate",
    "Depth",
    "Avg Dly",
    "LR Phase",
    "",
  ]),
  TRI_CHORUS: m(0x1300, "Triangle Chorus", DspType.MOD, [
    "Level",
    "Rate",
    "Depth",
    "Avg Dly",
    "LR Phase",
    "",
  ]),
  SINE_FLANGER: m(0x1800, "Sine Flanger", DspType.MOD, [
    "Level",
    "Rate",
    "Depth",
    "Fdbk",
    "LR Phase",
    "",
  ]),
  TRI_FLANGER: m(0x1900, "Triangle Flanger", DspType.MOD, [
    "Level",
    "Rate",
    "Depth",
    "Fdbk",
    "LR Phase",
    "",
  ]),
  VIBRATONE: m(0x2d00, "Vibratone", DspType.MOD, [
    "Level",
    "Rotor",
    "Depth",
    "Fdbk",
    "LR Phase",
    "",
  ]),
  VINTAGE_TREMOLO: m(0x4000, "Vintage Tremolo", DspType.MOD, [
    "Level",
    "Rate",
    "Duty",
    "Attack",
    "Release",
    "",
  ]),
  SINE_TREMOLO: m(0x4100, "Sine Tremolo", DspType.MOD, [
    "Level",
    "Rate",
    "Duty",
    "LFO Clip",
    "Tri Shape",
    "",
  ]),
  RING_MODULATOR: m(0x2200, "Ring Modulator", DspType.MOD, [
    "Level",
    "Freq",
    "Depth",
    "Shape",
    "Phase",
    "",
  ]),
  STEP_FILTER: m(0x2900, "Step Filter", DspType.MOD, [
    "Level",
    "Rate",
    "Res",
    "Min Freq",
    "Max Freq",
    "",
  ]),
  PHASER: m(0x4f00, "Phaser", DspType.MOD, [
    "Level",
    "Rate",
    "Depth",
    "Fdbk",
    "Shape",
    "",
  ]),
  PITCH_SHIFTER: m(0x1f00, "Pitch Shifter", DspType.MOD, [
    "Level",
    "Pitch",
    "Detune",
    "Fdbk",
    "PreDly",
    "",
  ]),
  MOD_WAH: m(0xf400, "Wah (Mod)", DspType.MOD, [
    "Level",
    "Freq",
    "Min",
    "Max",
    "Q",
    "",
  ]),
  MOD_TOUCH_WAH: m(0xf500, "Touch Wah (Mod)", DspType.MOD, [
    "Level",
    "Sens",
    "Min",
    "Max",
    "Q",
    "",
  ]),
  DIATONIC_PITCH: m(0x1f10, "Diatonic Pitch", DspType.MOD, [
    "Level",
    "Pitch",
    "Detune",
    "Fdbk",
    "PreDly",
    "",
  ]),

  // --- DELAY (0x08) ---
  MONO_DELAY: m(0x1600, "Mono Delay", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Bright",
    "Atten",
    "",
  ]),
  MONO_ECHO_FLTR: m(0x4300, "Mono Echo Filter", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Freq",
    "Res",
    "In Level",
  ]),
  STEREO_ECHO_FLTR: m(0x4800, "Stereo Echo Filter", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Freq",
    "Res",
    "In Level",
  ]),
  MULTITAP_DELAY: m(0x4400, "Multitap Delay", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Bright",
    "Atten",
    "",
  ]),
  PING_PONG_DELAY: m(0x4500, "Ping Pong Delay", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Bright",
    "Atten",
    "",
  ]),
  DUCKING_DELAY: m(0x1500, "Ducking Delay", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Release",
    "Thresh",
    "",
  ]),
  REVERSE_DELAY: m(0x4600, "Reverse Delay", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Bright",
    "Atten",
    "",
  ]),
  TAPE_DELAY: m(0x2b00, "Tape Delay", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Flutter",
    "Bright",
    "Stereo",
  ]),
  STEREO_TAPE_DLY: m(0x2a00, "Stereo Tape Delay", DspType.DELAY, [
    "Level",
    "Time",
    "Fdbk",
    "Flutter",
    "Sep",
    "Bright",
  ]),

  // --- REVERB (0x09) ---
  SMALL_HALL: m(0x2400, "Small Hall", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  LARGE_HALL: m(0x3a00, "Large Hall", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  SMALL_ROOM: m(0x2600, "Small Room", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  LARGE_ROOM: m(0x3b00, "Large Room", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  SMALL_PLATE: m(0x4e00, "Small Plate", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  LARGE_PLATE: m(0x4b00, "Large Plate", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  AMBIENT: m(0x4c00, "Ambient", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  ARENA: m(0x4d00, "Arena", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  SPRING_63: m(0x2100, "'63 Spring", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
  SPRING_65: m(0x0b00, "'65 Spring", DspType.REVERB, [
    "Level",
    "Decay",
    "Dwell",
    "Diff",
    "Tone",
    "",
  ]),
};

// --- 3. State Interfaces ---

export interface AmpState {
  modelId: number;
  name: string;
  knobs: number[];
  cabinetId: number;
  bright: boolean;
  noiseGate: number;
  threshold: number;
  sag: number;
  bias: number;
}

export interface EffectState {
  slot: number; // 0-7
  modelId: number;
  name: string;
  type: DspType;
  enabled: boolean;
  knobs: number[];
}

export interface Preset {
  slot: number;
  name: string;
  amp: AmpState;
  effects: (EffectState | null)[];
}

// --- 4. Main API Class ---

export class FuseAPI {
  private device: any = null;
  private initVal: number = 0x03;
  private sequenceId: number = 0;

  private effectEnabled: boolean[] = new Array(8).fill(true);
  private cache: Map<DspType, Uint8Array> = new Map();
  public presets: string[] = new Array(100).fill("");
  public activePresetSlot: number = 0;
  public isConnected = false;

  // ==========================================
  // Connectivity
  // ==========================================

  async connect() {
    if (!(navigator as any).hid) throw new Error("WebHID not supported");
    const devices = await (navigator as any).hid.requestDevice({
      filters: [{ vendorId: FENDER_VID }],
    });
    if (!devices.length) return false;
    this.device = devices[0];
    if ([0x05, 0x14, 0x16].includes(this.device.productId)) this.initVal = 0xc1;
    await this.device.open();
    this.isConnected = true;
    await this.handshake();
    await this.refreshState();
    return true;
  }

  async disconnect() {
    if (this.device?.opened) await this.device.close();
    this.isConnected = false;
    this.device = null;
  }

  // ==========================================
  // State Access
  // ==========================================

  getPreset(): Preset | null {
    if (this.cache.size < 5) return null;

    // 1. Parse Amp
    const ampRaw = this.cache.get(DspType.AMP)!;
    const ampView = new DataView(ampRaw.buffer);
    const ampId = ampView.getUint16(16);
    const ampMeta = Object.values(AMP_MODELS).find((m) => m.id === ampId);

    const amp: AmpState = {
      modelId: ampId,
      name: ampMeta ? ampMeta.name : "Unknown Amp",
      knobs: Array.from(ampRaw.slice(32, 42)),
      bias: ampRaw[AmpParam.BIAS],
      noiseGate: ampRaw[AmpParam.NOISE_GATE],
      threshold: ampRaw[AmpParam.THRESHOLD],
      cabinetId: ampRaw[AmpParam.CABINET],
      sag: ampRaw[AmpParam.SAG],
      bright: ampRaw[AmpParam.BRIGHT] === 0x01,
    };

    // 2. Parse Effects (8 Slots)
    const effectsChain = new Array(8).fill(null);
    [DspType.STOMP, DspType.MOD, DspType.DELAY, DspType.REVERB].forEach(
      (type) => {
        const raw = this.cache.get(type);
        if (!raw) return;
        const view = new DataView(raw.buffer);
        const modelId = view.getUint16(16);
        const slotIndex = raw[18];

        if (modelId !== 0 && slotIndex >= 0 && slotIndex < 8) {
          const meta = Object.values(EFFECT_MODELS).find(
            (m) => m.id === modelId
          );
          effectsChain[slotIndex] = {
            slot: slotIndex,
            modelId: modelId,
            name: meta ? meta.name : "Unknown Effect",
            type: type,
            enabled: this.effectEnabled[slotIndex],
            knobs: Array.from(raw.slice(32, 39)),
          };
        }
      }
    );

    return {
      slot: this.activePresetSlot,
      name: this.presets[this.activePresetSlot] || "Unknown",
      amp: amp,
      effects: effectsChain,
    };
  }

  getPresetList(): string[] {
    // Return a copy to prevent external mutation
    return [...this.presets];
  }

  async setPreset(slot: number) {
    if (slot < 0 || slot > 99) throw new Error("Invalid Slot");

    const buf = new Uint8Array(64);
    buf[0] = 0x1c;
    buf[1] = 0x01;
    buf[2] = 0x01; // Patch Change
    buf[4] = slot;
    buf[6] = 0x01; // Execute

    await this.send(buf);
    this.activePresetSlot = slot;
    await this.refreshState(true);
  }

  // ==========================================
  // Amp Management
  // ==========================================

  async setAmpModel(modelId: number) {
    const defaults = this.getAmpDefaults(modelId);
    // Preserve current Cabinet? Standard behavior is usually reset,
    // but we can read the old cab if we wanted. For now, full default load.
    await this.sendDspConfig(DspType.AMP, modelId, defaults);
    await this.sendApply();
  }

  async setAmpParameter(param: AmpParam, value: number) {
    await this.updateByte(DspType.AMP, param, value);
  }

  async setCabinet(cabId: number) {
    await this.updateByte(DspType.AMP, AmpParam.CABINET, cabId);
  }

  async setBright(on: boolean) {
    await this.updateByte(DspType.AMP, AmpParam.BRIGHT, on ? 1 : 0);
  }

  async setSag(value: number) {
    // Range 0-2
    if (value > 2) value = 2;
    await this.updateByte(DspType.AMP, AmpParam.SAG, value);
  }

  async setNoiseGate(value: number) {
    // Range 0-5
    if (value > 5) value = 5;
    await this.updateByte(DspType.AMP, AmpParam.NOISE_GATE, value);
  }

  async setGateThreshold(value: number) {
    // Range 0-9
    if (value > 9) value = 9;
    await this.updateByte(DspType.AMP, AmpParam.THRESHOLD, value);
  }

  // ==========================================
  // Effect Management
  // ==========================================

  async setEffect(slot: number, modelId: number) {
    if (slot < 0 || slot > 7) throw new Error("Slot 0-7");
    const meta = Object.values(EFFECT_MODELS).find((m) => m.id === modelId);
    if (!meta) throw new Error(`Unknown Effect ID ${modelId}`);

    const defaults = this.getEffectDefaults(meta.type, modelId);
    defaults[18] = slot;
    await this.sendDspConfig(meta.type, modelId, defaults);
    await this.sendApply();
    this.effectEnabled[slot] = true;
  }

  async setEffectKnob(slot: number, knobIndex: number, value: number) {
    const preset = this.getPreset();
    const effect = preset?.effects[slot];
    if (!effect) return;

    await this.updateByte(effect.type, 32 + knobIndex, value);
  }

  async setEffectEnabled(slot: number, enabled: boolean) {
    const preset = this.getPreset();
    const effect = preset?.effects[slot];
    if (!effect) return;

    // Map DSP Type to Bypass Family ID:
    // Stomp(6)->3, Mod(7)->4, Delay(8)->5, Reverb(9)->6
    // Formula: Type - 3
    const family = effect.type - 3;
    const status = enabled ? 0x00 : 0x01; // 0=On, 1=Bypass

    const buf = new Uint8Array(64);
    buf.set([0x19, 0xc3, family, status, slot]);
    await this.send(buf);

    this.effectEnabled[slot] = enabled;

    // Allow amp time to process before next read
    setTimeout(() => this.refreshState(true), 150);
  }

  async removeEffect(slot: number) {
    const preset = this.getPreset();
    const effect = preset?.effects[slot];
    if (effect) {
      const empty = new Uint8Array(64);
      empty.fill(0);
      empty[0] = 0x1c;
      empty[1] = 0x03;
      empty[2] = effect.type;
      empty[18] = slot;

      this.sequenceId = (this.sequenceId + 1) & 0xff;
      empty[6] = this.sequenceId;
      empty[7] = 0x01;

      this.cache.set(effect.type, empty);
      await this.send(empty);
      await this.sendApply();
      this.effectEnabled[slot] = false;
    }
  }

  // ==========================================
  // Internals
  // ==========================================

  private async updateByte(type: DspType, offset: number, value: number) {
    let buf = this.cache.get(type);
    if (!buf) {
      await this.refreshState();
      buf = this.cache.get(type);
    }
    if (!buf) return;

    buf[offset] = value;
    const modelId = (buf[16] << 8) | buf[17];
    // Ensure we pass the existing slot index so it doesn't get reset to 0
    const slot = buf[18];
    await this.sendDspConfig(type, modelId, buf, slot);
  }

  private async sendDspConfig(
    type: DspType,
    modelId: number,
    params: Uint8Array,
    slot?: number
  ) {
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

    this.cache.set(type, buf);
    await this.send(buf);
  }

  private async sendApply() {
    const buf = new Uint8Array(64);

    // Header: 0x1c 0x03 0x00 (DSP_NONE)
    buf[0] = 0x1c;
    buf[1] = 0x03;
    buf[2] = 0x00; // DSP_NONE

    // Sequence Counter
    this.sequenceId = (this.sequenceId + 1) & 0xff;
    buf[6] = this.sequenceId;
    buf[7] = 0x01;

    await this.send(buf);
  }

  private async send(data: Uint8Array) {
    await this.device.sendReport(0, data);
  }

  private getAmpDefaults(modelId: number): Uint8Array {
    const d = new Uint8Array(64);
    d.set(
      [
        0x1c, 0x03, 0x05, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
      0
    );
    d[16] = (modelId >> 8) & 0xff;
    d[17] = modelId & 0xff;

    let params: number[] = new Array(20).fill(0x80); // Fallback

    switch (modelId) {
      case 0x6700:
        params = [
          0xaa, 0x99, 0x80, 0x80, 0xbe, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x01,
        ];
        break; // F57_DELUXE
      case 0x6400:
        params = [
          0xaa, 0xa2, 0x80, 0x80, 0x80, 0x7a, 0xa2, 0x91, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x02,
        ];
        break; // F59_BASSMAN
      case 0x7c00:
        params = [
          0xaa, 0xb3, 0x00, 0xff, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x0c, 0x0c,
        ];
        break; // F57_CHAMP
      case 0x5300:
        params = [
          0xaa, 0x71, 0x00, 0xff, 0x91, 0xcf, 0x38, 0x00, 0x00, 0x00, 0x80,
          0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x03, 0x03,
        ];
        break; // F65_DELUXE
      case 0x6a00:
        params = [
          0xaa, 0x55, 0x00, 0xff, 0x99, 0xcc, 0x4c, 0x80, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x00, 0x04, 0x00, 0x04, 0x04,
        ];
        break; // F65_PRINCETON
      case 0x7500:
        params = [
          0xaa, 0x55, 0x80, 0x63, 0xb3, 0xbb, 0xaa, 0x80, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x00, 0x05, 0x00, 0x05, 0x05,
        ];
        break; // F65_TWIN
      case 0x7200:
        params = [
          0xaa, 0xbb, 0x82, 0x55, 0x99, 0xa2, 0x99, 0x80, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x02, 0x06, 0x00, 0x06, 0x06,
        ];
        break; // SUPER_SONIC
      case 0x6100:
        params = [
          0xaa, 0xa2, 0x80, 0x63, 0x99, 0x80, 0xb0, 0x00, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x00, 0x07, 0x00, 0x07, 0x07,
        ];
        break; // BRIT_60S
      case 0x7900:
        params = [
          0xaa, 0xff, 0x80, 0x7d, 0xaa, 0x5b, 0xc4, 0x80, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x01, 0x0b, 0x00, 0x0b, 0x0b,
        ];
        break; // BRIT_70S
      case 0x5e00:
        params = [
          0xaa, 0xff, 0x80, 0x7d, 0xaa, 0x5b, 0xc4, 0x80, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x01, 0x09, 0x00, 0x09, 0x09,
        ];
        break; // BRIT_80S
      case 0x5d00:
        params = [
          0xaa, 0x8e, 0x80, 0x66, 0xa4, 0x19, 0xc7, 0x71, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x03, 0x0a, 0x00, 0x0a, 0x0a,
        ];
        break; // US_90S
      case 0x6d00:
        params = [
          0xaa, 0xa4, 0x80, 0x55, 0x99, 0x4c, 0x91, 0x8e, 0x80, 0x80, 0x80,
          0x80, 0x00, 0x00, 0x02, 0x08, 0x00, 0x08, 0x08,
        ];
        break; // METAL_2000
      case 0xf100:
        params = [
          0xff, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81,
          0x81, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0d, 0x0d,
        ];
        break; // STUDIO_PREAMP
    }
    d.set(params, 32);
    return d;
  }

  private getEffectDefaults(type: DspType, modelId: number): Uint8Array {
    const d = new Uint8Array(64);
    d.set([0x1c, 0x03, type, 0x00, 0x00, 0x00, 0x01, 0x01], 0);
    d[16] = (modelId >> 8) & 0xff;
    d[17] = modelId & 0xff;
    d[20] = 0x08;
    d[21] = 0x01; // Common Flags

    let knobs: number[] = [0x80, 0x80, 0x80, 0x80, 0x80, 0x00];

    switch (modelId) {
      case 0x3c00:
        knobs = [0x80, 0x80, 0x80, 0x80, 0x80];
        break; // Overdrive
      case 0x4900:
        knobs = [0xff, 0x80, 0x00, 0xff];
        break; // Wah
      case 0x4a00:
        knobs = [0xff, 0x80, 0x00, 0xff];
        break; // Touch Wah
      case 0x8800:
        knobs = [0x01];
        d[19] = 0x08;
        d[20] = 0x08;
        break; // Simple Comp
      case 0x0700:
        knobs = [0x8d, 0x0f, 0x4f, 0x7f, 0x7f];
        break; // Compressor
      case 0x1200:
        knobs = [0xff, 0x0e, 0x19, 0x19, 0x80];
        break; // Sine Chorus
      case 0x1300:
        knobs = [0x5d, 0x0e, 0x19, 0x19, 0x80];
        break; // Tri Chorus
      case 0x2d00:
        knobs = [0xf4, 0xff, 0x27, 0xad, 0x82];
        d[20] = 0x01;
        break; // Vibratone
      case 0x4000:
        knobs = [0xdb, 0xad, 0x63, 0xf4, 0xf1];
        d[20] = 0x01;
        break; // Vintage Trem
      case 0x4100:
        knobs = [0xdb, 0x99, 0x7d];
        d[20] = 0x01;
        break; // Sine Trem
      case 0x2200:
        knobs = [0xff, 0x80, 0x80, 0x00, 0x80];
        d[20] = 0x08;
        break; // Ring Mod
      case 0x1f00:
        knobs = [0xc7, 0x3e, 0x80];
        d[20] = 0x08;
        break; // Pitch Shift
      case 0x1600:
        knobs = [0xff, 0x80, 0x80, 0x80, 0x80];
        break; // Mono Delay
      case 0x2b00:
        knobs = [0x7d, 0x1c, 0x00, 0x63, 0x80];
        break; // Tape Delay
      case 0x2a00:
        knobs = [0x7d, 0x88, 0x1c, 0x63, 0xff, 0x80];
        break; // Stereo Tape
      case 0x2400:
        knobs = [0x6e, 0x5d, 0x6e, 0x80, 0x91];
        break; // Small Hall
      case 0x3a00:
        knobs = [0x4f, 0x3e, 0x80, 0x05, 0xb0];
        break; // Large Hall
      case 0x4b00:
        knobs = [0x38, 0x80, 0x91, 0x80, 0xb6];
        break; // Large Plate
      case 0x0b00:
        knobs = [0x80, 0x8b, 0x49, 0xff, 0x80];
        break; // 65 Spring
    }
    d.set(knobs, 32);
    return d;
  }

  private async handshake() {
    await this.send(new Uint8Array([0x00, 0xc3]));
    await this.read();
    await this.send(new Uint8Array([0x1a, this.initVal]));
    await this.read();
  }

  public async refreshState(fastMode = false) {
    await this.send(new Uint8Array([0xff, 0xc1]));
    const required = new Set([
      DspType.AMP,
      DspType.STOMP,
      DspType.MOD,
      DspType.DELAY,
      DspType.REVERB,
    ]);
    let silenceCount = 0;
    const maxReads = fastMode ? 50 : 150;

    // Reset local trackers to true (Default assumption for new preset)
    if (!fastMode) {
      this.effectEnabled.fill(true);
    }

    for (let i = 0; i < maxReads; i++) {
      const data = await this.read(50);
      if (data.byteLength < 64) {
        silenceCount++;
        if (silenceCount > 5 && required.size === 0) break;
        continue;
      }
      silenceCount = 0;

      const view = new DataView(data.buffer);
      const b0 = view.getUint8(0);
      const b1 = view.getUint8(1);
      const b2 = view.getUint8(2);

      if (b0 === 0x1c && b1 === 0x01) {
        // Preset Names
        if (b2 === 0x04) {
          const cat = view.getUint8(3);
          if (cat === 0x00) {
            const slot = view.getUint8(4);
            let name = "";
            for (let k = 16; k < 48; k++) {
              const c = view.getUint8(k);
              if (c === 0) break;
              name += String.fromCharCode(c);
            }
            this.presets[slot] = name;
            this.activePresetSlot = slot;
          }
        }
        // DSP Data
        else if (b2 >= 0x05 && b2 <= 0x09) {
          const type = b2 as DspType;
          if (required.has(type)) {
            this.cache.set(type, new Uint8Array(data.buffer));
            required.delete(type);
          }
        }
      }
    }
  }

  /**
   * Monitors the HID input stream for all hardware-initiated changes.
   */
  public monitorPhysicalChanges(
    onUpdate?: (type: string, detail?: any) => void
  ) {
    if (!this.device) return;

    this.device.addEventListener("inputreport", async (event: any) => {
      const data = new Uint8Array(event.data.buffer);
      if (data.length < 64) return;

      const b0 = data[0];
      const b1 = data[1];
      const b2 = data[2];

      // --- 1. CONTINUOUS DATA UPDATES (e.g., Knob Turns) ---
      // Format: [DSP] [Type::Data] [Stage::Ready]
      // Example: 05 01 02 (Amp Data Ready)
      if (b1 === 0x01 && b2 === 0x02) {
        const dspType = b0 as DspType;
        let currentCache = this.cache.get(dspType);

        if (currentCache) {
          console.log(`Hardware: Syncing ${DspType[dspType]} live update...`);

          // --- THE MERGE STRATEGY ---
          // Instead of overwriting the whole buffer, we copy the knob
          // values from the Live Update into the Cache at the correct offsets.

          if (dspType === DspType.AMP) {
            // Amp Knobs: Hardware sends them at byte 16,
            // but our API expects them at byte 32 in the cache.
            for (let i = 0; i < 15; i++) {
              currentCache[32 + i] = data[16 + i];
            }
          } else {
            // Effect Knobs: Hardware sends at byte 16,
            // API expects them at byte 32 in the cache.
            for (let i = 0; i < 7; i++) {
              currentCache[32 + i] = data[16 + i];
            }
          }

          // Save the updated/merged buffer back to cache
          this.cache.set(dspType, currentCache);
        } else {
          // Fallback: If cache is empty, just save the whole packet
          this.cache.set(dspType, data);
        }

        if (onUpdate) onUpdate("knob", dspType);
      }

      // --- 2. PRESET SELECTION CHANGES ---
      // Opcode: 1c 01 01 [x] [Slot]
      else if (b0 === 0x1c && b1 === 0x01 && b2 === 0x01) {
        const newSlot = data[4];
        if (newSlot !== this.activePresetSlot) {
          this.activePresetSlot = newSlot;
          console.log(`Hardware: Preset knob turned to slot ${newSlot}`);
          // Pull new settings for the new preset
          await this.refreshState(true);
          if (onUpdate) onUpdate("preset", newSlot);
        }
      }

      // --- 3. BYPASS / FOOTSWITCH CHANGES ---
      // Opcode: 19 c3 [Family] [Status] [Slot]
      else if (b0 === 0x19 && b1 === 0xc3) {
        const status = data[3]; // 0=On, 1=Off
        const slot = data[4];

        this.effectEnabled[slot] = status === 0x00;
        console.log(`Hardware: Slot ${slot} toggled via button/footswitch`);
        if (onUpdate) onUpdate("bypass", { slot, enabled: status === 0x00 });
      }

      // --- 4. PRESET NAME BROADCAST ---
      // Opcode: 1c 04
      else if (b0 === 0x1c && b1 === 0x04) {
        // This arrives when the preset name is changed or broadcast
        const slot = data[4];
        let name = "";
        for (let i = 16; i < 48; i++) {
          if (data[i] === 0) break;
          name += String.fromCharCode(data[i]);
        }
        this.presets[slot] = name;
        if (onUpdate) onUpdate("name", { slot, name });
      }
    });
  }

  private async read(t = 200): Promise<DataView> {
    return new Promise((r) => {
      const h = (e: any) => {
        this.device.removeEventListener("inputreport", h);
        r(e.data);
      };
      this.device.addEventListener("inputreport", h);
      setTimeout(() => {
        this.device.removeEventListener("inputreport", h);
        r(new DataView(new ArrayBuffer(0)));
      }, t);
    });
  }
}
