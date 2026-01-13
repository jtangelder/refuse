/**
 * Fender Mustang WebHID API - Constants & Enums
 * Model registries and enumerated types
 */

export const FENDER_VID = 0x1ed8;

// --- Enums ---

export enum DspType {
  AMP = 0x05,
  STOMP = 0x06,
  MOD = 0x07,
  DELAY = 0x08,
  REVERB = 0x09,
}

// Precise byte offsets for Amp parameter control
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

// --- Model Registry Interface ---

export interface ModelDef {
  id: number;
  name: string;
  type: DspType;
  knobs: string[];
}

const m = (id: number, name: string, type: DspType, knobs: string[]): ModelDef => ({
  id,
  name,
  type,
  knobs,
});

// --- Amp Models ---

// prettier-ignore
export const AMP_MODELS: Record<string, ModelDef> = {
  // --- Standard V1 Amps ---
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

  // --- V2 / Hidden Expansion Amps ---
  STUDIO_PREAMP: m(0xf100, "Studio Preamp", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
  F57_TWIN:      m(0xf600, "'57 Twin", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
  THRIFT_60S:    m(0xf900, "'60s Thrift", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
  BRIT_WATTS:    m(0xff00, "British Watts", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
  BRIT_COLOUR:   m(0xfc00, "British Colour", DspType.AMP, ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]),
};

// --- Effect Models ---

// prettier-ignore
export const STOMP_MODELS: Record<string, ModelDef> = {
  OVERDRIVE: m(0x3c00, "Overdrive", DspType.STOMP, ["Level", "Gain", "Low", "Mid", "High", ""]),
  WAH: m(0x4900, "Fixed Wah", DspType.STOMP, ["Level", "Freq", "Min", "Max", "Q", ""]),
  TOUCH_WAH: m(0x4a00, "Touch Wah", DspType.STOMP, ["Level", "Sens", "Min", "Max", "Q", ""]),
  FUZZ: m(0x1a00, "Fuzz", DspType.STOMP, ["Level", "Gain", "Octave", "Low", "High", ""]),
  FUZZ_TOUCH_WAH: m(0x1c00, "Fuzz Touch Wah", DspType.STOMP, ["Level", "Gain", "Sens", "Octave", "Peak", ""]),
  SIMPLE_COMP: m(0x8800, "Simple Comp", DspType.STOMP, ["Type", "", "", "", "", ""]),
  COMPRESSOR: m(0x0700, "Compressor", DspType.STOMP, ["Level", "Thresh", "Ratio", "Attack", "Release", ""]),
  // V2 Stomps
  RANGER_BOOST: m(0x0301, "Ranger Boost", DspType.STOMP, ["Level", "Gain", "Tone", "", "", ""]),
  GREEN_BOX: m(0xba00, "Green Box", DspType.STOMP, ["Level", "Gain", "Tone", "Blend", "", ""]),
  ORANGE_BOX: m(0x0101, "Orange Box", DspType.STOMP, ["Level", "Gain", "Tone", "", "", ""]),
  BLACK_BOX: m(0x1101, "Black Box", DspType.STOMP, ["Level", "Gain", "Tone", "", "", ""]),
  BIG_FUZZ: m(0x0f01, "Big Fuzz", DspType.STOMP, ["Level", "Tone", "Sustain", "", "", ""]),
};

// prettier-ignore
export const MOD_MODELS: Record<string, ModelDef> = {
  SINE_CHORUS: m(0x1200, "Sine Chorus", DspType.MOD, ["Level", "Rate", "Depth", "Avg Dly", "LR Phase", ""]),
  TRI_CHORUS: m(0x1300, "Triangle Chorus", DspType.MOD, ["Level", "Rate", "Depth", "Avg Dly", "LR Phase", ""]),
  SINE_FLANGER: m(0x1800, "Sine Flanger", DspType.MOD, ["Level", "Rate", "Depth", "Fdbk", "LR Phase", ""]),
  TRI_FLANGER: m(0x1900, "Triangle Flanger", DspType.MOD, ["Level", "Rate", "Depth", "Fdbk", "LR Phase", ""]),
  VIBRATONE: m(0x2d00, "Vibratone", DspType.MOD, ["Level", "Rotor", "Depth", "Fdbk", "LR Phase", ""]),
  VINTAGE_TREMOLO: m(0x4000, "Vintage Tremolo", DspType.MOD, ["Level", "Rate", "Duty", "Attack", "Release", ""]),
  SINE_TREMOLO: m(0x4100, "Sine Tremolo", DspType.MOD, ["Level", "Rate", "Duty", "LFO Clip", "Tri Shape", ""]),
  RING_MODULATOR: m(0x2200, "Ring Modulator", DspType.MOD, ["Level", "Freq", "Depth", "Shape", "Phase", ""]),
  STEP_FILTER: m(0x2900, "Step Filter", DspType.MOD, ["Level", "Rate", "Res", "Min Freq", "Max Freq", ""]),
  PHASER: m(0x4f00, "Phaser", DspType.MOD, ["Level", "Rate", "Depth", "Fdbk", "Shape", ""]),
  PITCH_SHIFTER: m(0x1f00, "Pitch Shifter", DspType.MOD, ["Level", "Pitch", "Detune", "Fdbk", "PreDly", ""]),
};

// prettier-ignore
export const DELAY_MODELS: Record<string, ModelDef> = {
  MONO_DELAY: m(0x1600, "Mono Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Bright", "Atten", ""]),
  MONO_ECHO_FILTER: m(0x4300, "Mono Echo Filter", DspType.DELAY, ["Level", "Time", "Fdbk", "Freq", "Res", "In Level"]),
  STEREO_ECHO_FILTER: m(0x4800, "Stereo Echo Filter", DspType.DELAY, ["Level", "Time", "Fdbk", "Freq", "Res", "In Level"]),
  MULTITAP_DELAY: m(0x4400, "Multitap Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Bright", "Atten", ""]),
  PING_PONG_DELAY: m(0x4500, "Ping Pong Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Bright", "Atten", ""]),
  DUCKING_DELAY: m(0x1500, "Ducking Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Release", "Thresh", ""]),
  REVERSE_DELAY: m(0x4600, "Reverse Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Bright", "Atten", ""]),
  TAPE_DELAY: m(0x2b00, "Tape Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Flutter", "Bright", "Stereo"]),
  STEREO_TAPE_DELAY: m(0x2a00, "Stereo Tape Delay", DspType.DELAY, ["Level", "Time", "Fdbk", "Flutter", "Sep", "Bright"]),
};

// prettier-ignore
export const REVERB_MODELS: Record<string, ModelDef> = {
  SMALL_HALL: m(0x2400, "Small Hall", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  LARGE_HALL: m(0x3a00, "Large Hall", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  SMALL_ROOM: m(0x2600, "Small Room", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  LARGE_ROOM: m(0x3b00, "Large Room", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  SMALL_PLATE: m(0x4e00, "Small Plate", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  LARGE_PLATE: m(0x4b00, "Large Plate", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  AMBIENT: m(0x4c00, "Ambient", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  ARENA: m(0x4d00, "Arena", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  SPRING_63: m(0x2100, "'63 Spring", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
  SPRING_65: m(0x0b00, "'65 Spring", DspType.REVERB, ["Level", "Decay", "Dwell", "Diff", "Tone", ""]),
};

// --- Cabinet Models ---

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
    { id: 0x0A, name: "4x12 British '80s" },
    { id: 0x0B, name: "4x12 American '90s" },
    { id: 0x0C, name: "4x12 Metal 2000" },
    // V2 Expansion Cabinets
    { id: 0x0D, name: "2x12 '57 Twin" },
    { id: 0x0E, name: "2x12 '60s Thrift" },
    { id: 0x0F, name: "4x12 British Watts" },
    { id: 0x10, name: "4x12 British Colour" }
] as const;

// --- Lookup Helpers ---

export const EFFECT_MODELS: Record<string, ModelDef> = {
  ...STOMP_MODELS,
  ...MOD_MODELS,
  ...DELAY_MODELS,
  ...REVERB_MODELS,
};

export function getAllModels(): ModelDef[] {
  return [
    ...Object.values(AMP_MODELS),
    ...Object.values(STOMP_MODELS),
    ...Object.values(MOD_MODELS),
    ...Object.values(DELAY_MODELS),
    ...Object.values(REVERB_MODELS),
  ];
}

export function findModelById(id: number): ModelDef | undefined {
  return getAllModels().find((m) => m.id === id);
}
