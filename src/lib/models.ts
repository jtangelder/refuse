export enum DspType {
  AMP = 0x05,
  STOMP = 0x06,
  MOD = 0x07,
  DELAY = 0x08,
  REVERB = 0x09,
}

export interface ModelDef {
  id: number;
  name: string;
  type: DspType;
  knobs: string[];
  /** Legacy FUSE XML integer ID(s) that map to this firmware model ID. */
  fuseIds?: readonly number[];
}

export interface CabinetDef {
  id: number;
  name: string;
}

const m = (id: number, name: string, type: DspType, knobs: string[], fuseIds?: readonly number[]): ModelDef => ({
  id,
  name,
  type,
  knobs,
  ...(fuseIds ? { fuseIds } : {}),
});

// prettier-ignore
export const AMP_MODELS: Record<string, ModelDef> = {
  // Standard V1
  F57_DELUXE: m(0x6700, "'57 Deluxe", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0]),
  F59_BASSMAN: m(0x6400, "'59 Bassman", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [1]),
  F57_CHAMP: m(0x7c00, "'57 Champ", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [2]),
  F65_DELUXE: m(0x5300, "'65 Deluxe Reverb", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [3, 105]),
  F65_PRINCETON: m(0x6a00, "'65 Princeton", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [4, 106]),
  F65_TWIN: m(0x7500, "'65 Twin Reverb", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [5, 107]),
  SUPER_SONIC: m(0x7200, 'Super-Sonic', DspType.AMP, ['Vol', 'Gain', 'Gain2', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [6, 108]),
  BRIT_60S: m(0x6100, "British '60s", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [7]),
  BRIT_70S: m(0x7900, "British '70s", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [8]),
  BRIT_80S: m(0x5e00, "British '80s", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [9]),
  US_90S: m(0x5d00, "American '90s", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [10]),
  METAL_2000: m(0x6d00, 'Metal 2000', DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [11]),
  // V2 / Hidden
  STUDIO_PREAMP: m(0xf100, 'Studio Preamp', DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [100]),
  F57_TWIN: m(0xf600, "'57 Twin", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [101]),
  THRIFT_60S: m(0xf900, "'60s Thrift", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [102]),
  BRIT_WATTS: m(0xff00, 'British Watts', DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [103]),
  BRIT_COLOUR: m(0xfc00, 'British Colour', DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [104]),
};

// prettier-ignore
export const EFFECT_MODELS: Record<string, ModelDef> = {
  // Stomps (FX1)
  OVERDRIVE: m(0x3c00, 'Overdrive', DspType.STOMP, ['Level', 'Gain', 'Low', 'Mid', 'High', ''], [19]),
  WAH: m(0x4900, 'Fixed Wah', DspType.STOMP, ['Level', 'Freq', 'Min', 'Max', 'Q', ''], [20]),
  TOUCH_WAH: m(0x4a00, 'Touch Wah', DspType.STOMP, ['Level', 'Sens', 'Min', 'Max', 'Q', ''], [21]),
  FUZZ: m(0x1a00, 'Fuzz', DspType.STOMP, ['Level', 'Gain', 'Octave', 'Low', 'High', ''], [22]),
  FUZZ_TOUCH_WAH: m(0x1c00, 'Fuzz Touch Wah', DspType.STOMP, ['Level', 'Gain', 'Sens', 'Octave', 'Peak', ''], [23]),
  SIMPLE_COMP: m(0x8800, 'Simple Comp', DspType.STOMP, ['Type', '', '', '', '', ''], [25]),
  COMPRESSOR: m(0x0700, 'Compressor', DspType.STOMP, ['Level', 'Thresh', 'Ratio', 'Attack', 'Release', ''], [24]),
  // V2 Stomps (FX1 V2)
  RANGER_BOOST: m(0x0301, 'Ranger Boost', DspType.STOMP, ['Level', 'Gain', 'Tone', '', '', ''], [109]),
  GREEN_BOX: m(0xba00, 'Green Box', DspType.STOMP, ['Level', 'Gain', 'Tone', 'Blend', '', ''], [110]),
  ORANGE_BOX: m(0x0101, 'Orange Box', DspType.STOMP, ['Level', 'Gain', 'Tone', '', '', ''], [111]),
  BLACK_BOX: m(0x1101, 'Black Box', DspType.STOMP, ['Level', 'Gain', 'Tone', '', '', ''], [112]),
  BIG_FUZZ: m(0x0f01, 'Big Fuzz', DspType.STOMP, ['Level', 'Tone', 'Sustain', '', '', ''], [113]),
  // Mod (FX2)
  SINE_CHORUS: m(0x1200, 'Sine Chorus', DspType.MOD, ['Level', 'Rate', 'Depth', 'Avg Dly', 'LR Phase', ''], [26]),
  TRIANGLE_CHORUS: m(0x1300, 'Triangle Chorus', DspType.MOD, ['Level', 'Rate', 'Depth', 'Avg Dly', 'LR Phase', ''], [27]),
  SINE_FLANGER: m(0x1800, 'Sine Flanger', DspType.MOD, ['Level', 'Rate', 'Depth', 'Fdbk', 'LR Phase', ''], [28]),
  TRIANGLE_FLANGER: m(0x1900, 'Triangle Flanger', DspType.MOD, ['Level', 'Rate', 'Depth', 'Fdbk', 'LR Phase', ''], [29]),
  VIBRATONE: m(0x2d00, 'Vibratone', DspType.MOD, ['Level', 'Rotor', 'Depth', 'Fdbk', 'LR Phase', ''], [30]),
  VINTAGE_TREMOLO: m(0x4000, 'Vintage Tremolo', DspType.MOD, ['Level', 'Rate', 'Duty', 'Attack', 'Release', ''], [31]),
  SINE_TREMOLO: m(0x4100, 'Sine Tremolo', DspType.MOD, ['Level', 'Rate', 'Duty', 'LFO Clip', 'Tri Shape', ''], [32]),
  RING_MODULATOR: m(0x2200, 'Ring Modulator', DspType.MOD, ['Level', 'Freq', 'Depth', 'Shape', 'Phase', ''], [33]),
  STEP_FILTER: m(0x2900, 'Step Filter', DspType.MOD, ['Level', 'Rate', 'Res', 'Min Freq', 'Max Freq', ''], [34]),
  PHASER: m(0x4f00, 'Phaser', DspType.MOD, ['Level', 'Rate', 'Depth', 'Fdbk', 'Shape', ''], [35]),
  PITCH_SHIFTER: m(0x1f00, 'Pitch Shifter', DspType.MOD, ['Level', 'Pitch', 'Detune', 'Fdbk', 'PreDly', ''], [36]),
  // Delay (FX3)
  MONO_DELAY: m(0x1600, 'Mono Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Bright', 'Atten', ''], [37]),
  MONO_ECHO_FILTER: m(0x4300, 'Mono Echo Filter', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Freq', 'Res', 'Input']),
  STEREO_ECHO_FILTER: m(0x4800, 'Stereo Echo Filter', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Freq', 'Res', 'Input'], [41]),
  TAPE_DELAY: m(0x2b00, 'Tape Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Flutter', 'Bright', 'Stereo'], [38]),
  STEREO_TAPE_DELAY: m(0x2a00, 'Stereo Tape Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Flutter', 'Sep', 'Bright']),
  DUCKING_DELAY: m(0x1500, 'Ducking Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Release', 'Thresh', ''], [39]),
  REVERSE_DELAY: m(0x4600, 'Reverse Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Bright', 'Atten', ''], [40]),
  MULTITAP_DELAY: m(0x4400, 'Multitap Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Bright', 'Atten', '']),
  PING_PONG_DELAY: m(0x4500, 'Ping Pong Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Bright', 'Atten', '']),
  // Reverb (FX4)
  SMALL_HALL: m(0x2400, 'Small Hall', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [42]),
  LARGE_HALL: m(0x3a00, 'Large Hall', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [43]),
  SMALL_ROOM: m(0x2600, 'Small Room', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [44]),
  LARGE_ROOM: m(0x3b00, 'Large Room', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [45]),
  SMALL_PLATE: m(0x4e00, 'Small Plate', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [46]),
  LARGE_PLATE: m(0x4b00, 'Large Plate', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [47]),
  AMBIENT: m(0x4c00, 'Ambient', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [48]),
  ARENA: m(0x4d00, 'Arena', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [49]),
  SPRING_63: m(0x2100, "'63 Spring", DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [50]),
  SPRING_65: m(0x0b00, "'65 Spring", DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [51]),
};

// prettier-ignore
export const CABINET_MODELS: CabinetDef[] = [
  { id: 0x00, name: 'Off' },
  { id: 0x01, name: "1x12 '57 Deluxe" },
  { id: 0x02, name: "4x10 '59 Bassman" },
  { id: 0x03, name: "1x8 '57 Champ" },
  { id: 0x04, name: "1x12 '65 Deluxe" },
  { id: 0x05, name: "1x10 '65 Princeton" },
  { id: 0x06, name: '4x12 Metal 2000' },
  { id: 0x07, name: "2x12 British '60s" },
  { id: 0x08, name: "4x12 British '70s" },
  { id: 0x09, name: "2x12 '65 Twin" },
  { id: 0x0a, name: "4x12 British '80s" },
  { id: 0x0b, name: '2x12 Super-Sonic' },
  { id: 0x0c, name: '1x12 Super-Sonic' },
  { id: 0x0D, name: "2x12 '57 Twin" },
  { id: 0x0E, name: "2x12 '60s Thrift" },
  { id: 0x0F, name: '4x12 British Watts' },
  { id: 0x10, name: '4x12 British Colour' }
];

// -----------------------------------------------------------------------------
// Model Registry (Indexed O(1) Lookups)
// -----------------------------------------------------------------------------

const ampById = new Map<number, ModelDef>(Object.values(AMP_MODELS).map(model => [model.id, model]));
const effectById = new Map<number, ModelDef>(Object.values(EFFECT_MODELS).map(model => [model.id, model]));
const cabinetById = new Map<number, CabinetDef>(CABINET_MODELS.map(cab => [cab.id, cab]));

const fuseIdToModelId = new Map<number, number>();
for (const model of [...Object.values(AMP_MODELS), ...Object.values(EFFECT_MODELS)]) {
  for (const fuseId of model.fuseIds ?? []) {
    fuseIdToModelId.set(fuseId, model.id);
  }
}

export function findAmpModel(id: number): ModelDef | null {
  return ampById.get(id) ?? null;
}

export function findEffectModel(id: number): ModelDef | null {
  return effectById.get(id) ?? null;
}

export function findCabinetModel(id: number): CabinetDef | null {
  return cabinetById.get(id) ?? null;
}

export function resolveFuseModelId(fuseId: number, type: DspType): number | null {
  const mapped = fuseIdToModelId.get(fuseId);
  if (mapped !== undefined) return mapped;

  const lookup = type === DspType.AMP ? ampById : effectById;
  const high = (fuseId & 0xff) << 8;
  if (lookup.has(high)) return high;

  const lowByte = fuseId & 0xff;
  const highByte = (fuseId >> 8) & 0xff;
  const swapped = (lowByte << 8) | highByte;
  if (lookup.has(swapped)) return swapped;

  if (lookup.has(fuseId)) return fuseId;
  return null;
}

/**
 * Find the delay-time parameter index on a Delay model, if present.
 * Delay time in Mustang DSP is stored in byte index 1 (0..255 maps to 0..1500ms).
 */
export function getDelayTimeKnobIndex(modelId: number): number | null {
  const model = findEffectModel(modelId);
  if (!model || model.type !== DspType.DELAY) return null;
  const idx = model.knobs.indexOf('Time');
  return idx !== -1 ? idx : null;
}

// -----------------------------------------------------------------------------
// Hardware Form Factors (Signal Chain & Graphic Layout)
// -----------------------------------------------------------------------------

export type EffectFormFactor = 'standard' | 'wide' | 'rack';

/**
 * Effects with a wide chassis or cabinet footprint:
 * - Fender Vibratone (Leslie rotary cabinet)
 * - Fender '63 Spring Reverb (standalone outboard reverb tank)
 * - Line 6 DL4 & DL4 Stereo (Mono & Stereo Echo Filter dual-footswitch stompboxes)
 * - Eventide TimeFactor (Ping Pong Delay dual stompbox)
 */
export const WIDE_EFFECT_MODELS: readonly ModelDef[] = [
  EFFECT_MODELS.VIBRATONE,
  EFFECT_MODELS.SPRING_63,
  EFFECT_MODELS.MONO_ECHO_FILTER,
  EFFECT_MODELS.STEREO_ECHO_FILTER,
  EFFECT_MODELS.PING_PONG_DELAY,
];

/**
 * 1U 19-inch rackmount units:
 * - TC Electronic 2290 Dynamic Digital Delay (Ducking Delay)
 * - Lexicon PCM-42 / Multitap Delay
 */
export const RACK_EFFECT_MODELS: readonly ModelDef[] = [EFFECT_MODELS.DUCKING_DELAY, EFFECT_MODELS.MULTITAP_DELAY];

const wideEffectIds = new Set<number>(WIDE_EFFECT_MODELS.map(m => m.id));
const rackEffectIds = new Set<number>(RACK_EFFECT_MODELS.map(m => m.id));

export function isWideEffect(model?: number | ModelDef | null): boolean {
  if (model === null || model === undefined) return false;
  const id = typeof model === 'number' ? model : model.id;
  return wideEffectIds.has(id);
}

export function isRackUnit(model?: number | ModelDef | null): boolean {
  if (model === null || model === undefined) return false;
  const id = typeof model === 'number' ? model : model.id;
  return rackEffectIds.has(id);
}

export function getEffectFormFactor(model?: number | ModelDef | null): EffectFormFactor {
  if (isRackUnit(model)) return 'rack';
  if (isWideEffect(model)) return 'wide';
  return 'standard';
}
