import { clampRange, toByte } from './protocol/constants';

export enum DspType {
  AMP = 0x05,
  STOMP = 0x06,
  MOD = 0x07,
  DELAY = 0x08,
  REVERB = 0x09,
}

export interface KnobSpec {
  readonly min?: number;
  readonly max: number;
  readonly labels?: readonly string[];
}

export interface AmpWireMeta {
  /** Bytes 40 and 43 (knobs[8] and knobs[11]): 0x00 for '65 Deluxe Reverb, 0x80 otherwise. */
  readonly b40: number;
  readonly b43: number;
  /** Amp-specific byte repeated at packet bytes 44, 45, 46, and 50 (knobs[12..14, 18]). */
  readonly num: number;
  /** Amp-specific trailing byte at packet byte 54 (knobs[22]). */
  readonly b54: number;
}

export interface ModelDef {
  id: number;
  name: string;
  type: DspType;
  knobs: string[];
  /** Official Fender FUSE XML decimal ID first, followed by any legacy ordinal aliases. */
  fuseIds?: readonly number[];
  /** Discrete range/label constraints for non-continuous knobs (indexed by knob position). */
  knobSpecs?: Readonly<Record<number, KnobSpec>>;
  /** Required hardware metadata bytes [19, 20, 21] for effect DSP write packets. */
  effectMeta?: readonly [number, number, number];
  /** Required hardware metadata bytes for amp DSP write packets. */
  ampMeta?: AmpWireMeta;
}

export interface CabinetDef {
  id: number;
  name: string;
}

interface ModelExtra {
  knobSpecs?: Readonly<Record<number, KnobSpec>>;
  effectMeta?: readonly [number, number, number];
  ampMeta?: AmpWireMeta;
}

const m = (
  id: number,
  name: string,
  type: DspType,
  knobs: string[],
  fuseIds?: readonly number[],
  extra?: ModelExtra,
): ModelDef => ({
  id,
  name,
  type,
  knobs,
  ...(fuseIds ? { fuseIds } : {}),
  ...(extra?.knobSpecs ? { knobSpecs: extra.knobSpecs } : {}),
  ...(extra?.effectMeta ? { effectMeta: extra.effectMeta } : {}),
  ...(extra?.ampMeta ? { ampMeta: extra.ampMeta } : {}),
});

const ampMeta = (num: number, b54: number, b40 = 0x80, b43 = 0x80): ModelExtra => ({
  ampMeta: { b40, b43, num, b54 },
});

const STOMP_META: readonly [number, number, number] = [0x00, 0x08, 0x01];
const WAH_META: readonly [number, number, number] = [0x01, 0x08, 0x01];
const SIMPLE_COMP_META: readonly [number, number, number] = [0x08, 0x08, 0x01];
const MOD_META: readonly [number, number, number] = [0x01, 0x01, 0x01];
const MOD_ALT_META: readonly [number, number, number] = [0x01, 0x08, 0x01];
const DIATONIC_META: readonly [number, number, number] = [0x00, 0x08, 0x01];
const DELAY_META: readonly [number, number, number] = [0x02, 0x01, 0x01];
const REVERB_META: readonly [number, number, number] = [0x00, 0x08, 0x01];

const HIGH_Q_SPEC: Readonly<Record<number, KnobSpec>> = {
  4: { max: 1, labels: ['Off', 'On'] },
};

// prettier-ignore
export const AMP_MODELS: Record<string, ModelDef> = {
  // Standard V1 (real Fender FUSE decimal ID first, legacy ordinal fallback second where non-colliding)
  F57_DELUXE: m(0x6700, "'57 Deluxe", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x67, 0], ampMeta(0x01, 0x53)),
  F59_BASSMAN: m(0x6400, "'59 Bassman", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x64, 1], ampMeta(0x02, 0x67)),
  F57_CHAMP: m(0x7c00, "'57 Champ", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x7c, 2], ampMeta(0x0c, 0xf1)),
  F65_DELUXE: m(0x5300, "'65 Deluxe Reverb", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x53, 3, 105], ampMeta(0x03, 0x6a, 0x00, 0x00)),
  F65_PRINCETON: m(0x6a00, "'65 Princeton", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x6a, 4], ampMeta(0x04, 0x61)),
  F65_TWIN: m(0x7500, "'65 Twin Reverb", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x75, 5, 107], ampMeta(0x05, 0x72)),
  SUPER_SONIC: m(0x7200, 'Super-Sonic', DspType.AMP, ['Vol', 'Gain', 'Gain2', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x72, 6, 108], ampMeta(0x06, 0x79)),
  BRIT_60S: m(0x6100, "British '60s", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x61, 7], ampMeta(0x07, 0x5e)),
  BRIT_70S: m(0x7900, "British '70s", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x79, 8], ampMeta(0x0b, 0x7c)),
  BRIT_80S: m(0x5e00, "British '80s", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x5e, 9], ampMeta(0x09, 0x5d)),
  US_90S: m(0x5d00, "American '90s", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x5d, 10], ampMeta(0x0a, 0x6d)),
  METAL_2000: m(0x6d00, 'Metal 2000', DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0x6d, 11], ampMeta(0x08, 0x75)),
  // V2 / Hidden
  STUDIO_PREAMP: m(0xf100, 'Studio Preamp', DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0xf1], ampMeta(0x0d, 0xf6)),
  F57_TWIN: m(0xf600, "'57 Twin", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0xf6, 101], ampMeta(0x0e, 0xf9)),
  THRIFT_60S: m(0xf900, "'60s Thrift", DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0xf9, 102], ampMeta(0x0f, 0xfc)),
  BRIT_WATTS: m(0xff00, 'British Watts', DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0xff], ampMeta(0x11, 0x00)),
  BRIT_COLOUR: m(0xfc00, 'British Colour', DspType.AMP, ['Vol', 'Gain', '', 'Master', 'Treb', 'Mid', 'Bass', 'Pres'], [0xfc, 104], ampMeta(0x10, 0xff)),
};

// prettier-ignore
export const EFFECT_MODELS: Record<string, ModelDef> = {
  // Stomps (FX1)
  OVERDRIVE: m(0x3c00, 'Overdrive', DspType.STOMP, ['Level', 'Gain', 'Low', 'Mid', 'High', ''], [0x3c, 19], { effectMeta: STOMP_META }),
  WAH: m(0x4900, 'Fixed Wah', DspType.STOMP, ['Level', 'Freq', 'Min', 'Max', 'High Q', ''], [0x49, 20], { effectMeta: WAH_META, knobSpecs: HIGH_Q_SPEC }),
  TOUCH_WAH: m(0x4a00, 'Touch Wah', DspType.STOMP, ['Level', 'Sens', 'Min', 'Max', 'High Q', ''], [0x4a, 21], { effectMeta: WAH_META, knobSpecs: HIGH_Q_SPEC }),
  FUZZ: m(0x1a00, 'Fuzz', DspType.STOMP, ['Level', 'Gain', 'Octave', 'Low', 'High', ''], [0x1a, 22], { effectMeta: STOMP_META }),
  FUZZ_TOUCH_WAH: m(0x1c00, 'Fuzz Touch Wah', DspType.STOMP, ['Level', 'Gain', 'Sens', 'Octave', 'Peak', ''], [0x1c, 23], { effectMeta: STOMP_META }),
  SIMPLE_COMP: m(0x8800, 'Simple Comp', DspType.STOMP, ['Type', '', '', '', '', ''], [0x88, 25], {
    effectMeta: SIMPLE_COMP_META,
    knobSpecs: { 0: { max: 3, labels: ['Super Low', 'Low', 'Mid', 'High'] } },
  }),
  COMPRESSOR: m(0x0700, 'Compressor', DspType.STOMP, ['Level', 'Thresh', 'Ratio', 'Attack', 'Release', ''], [0x07, 24], { effectMeta: STOMP_META }),
  // V2 Stomps (FX1 V2)
  RANGER_BOOST: m(0x0301, 'Ranger Boost', DspType.STOMP, ['Level', 'Gain', 'Lo-Cut', 'Bright', '', ''], [0x103, 109], { effectMeta: STOMP_META }),
  GREEN_BOX: m(0xba00, 'Green Box', DspType.STOMP, ['Level', 'Gain', 'Tone', 'Blend', '', ''], [0xba, 110], { effectMeta: STOMP_META }),
  ORANGE_BOX: m(0x1001, 'Orange Box', DspType.STOMP, ['Level', 'Dist', 'Tone', '', '', ''], [0x110, 111], { effectMeta: STOMP_META }),
  BLACK_BOX: m(0x1101, 'Black Box', DspType.STOMP, ['Level', 'Dist', 'Filter', '', '', ''], [0x111, 112], { effectMeta: STOMP_META }),
  BIG_FUZZ: m(0x0f01, 'Big Fuzz', DspType.STOMP, ['Level', 'Tone', 'Sustain', '', '', ''], [0x10f, 113], { effectMeta: STOMP_META }),
  // Mod (FX2)
  SINE_CHORUS: m(0x1200, 'Sine Chorus', DspType.MOD, ['Level', 'Rate', 'Depth', 'Avg Dly', 'LR Phase', ''], [0x12, 26], { effectMeta: MOD_META }),
  TRIANGLE_CHORUS: m(0x1300, 'Triangle Chorus', DspType.MOD, ['Level', 'Rate', 'Depth', 'Avg Dly', 'LR Phase', ''], [0x13, 27], { effectMeta: MOD_META }),
  SINE_FLANGER: m(0x1800, 'Sine Flanger', DspType.MOD, ['Level', 'Rate', 'Depth', 'Fdbk', 'LR Phase', ''], [0x18, 28], { effectMeta: MOD_META }),
  TRIANGLE_FLANGER: m(0x1900, 'Triangle Flanger', DspType.MOD, ['Level', 'Rate', 'Depth', 'Fdbk', 'LR Phase', ''], [0x19, 29], { effectMeta: MOD_META }),
  VIBRATONE: m(0x2d00, 'Vibratone', DspType.MOD, ['Level', 'Rotor', 'Depth', 'Fdbk', 'LR Phase', ''], [0x2d, 30], { effectMeta: MOD_META }),
  VINTAGE_TREMOLO: m(0x4000, 'Vintage Tremolo', DspType.MOD, ['Level', 'Rate', 'Duty', 'Attack', 'Release', ''], [0x40], { effectMeta: MOD_META }),
  SINE_TREMOLO: m(0x4100, 'Sine Tremolo', DspType.MOD, ['Level', 'Rate', 'Duty', 'LFO Clip', 'Tri Shape', ''], [0x41, 32], { effectMeta: MOD_META }),
  RING_MODULATOR: m(0x2200, 'Ring Modulator', DspType.MOD, ['Level', 'Freq', 'Depth', 'Shape', 'Phase', ''], [0x22, 33], {
    effectMeta: MOD_ALT_META,
    knobSpecs: { 3: { max: 1, labels: ['Sine', 'Square'] } },
  }),
  STEP_FILTER: m(0x2900, 'Step Filter', DspType.MOD, ['Level', 'Rate', 'Res', 'Min Freq', 'Max Freq', ''], [0x29], { effectMeta: MOD_META }),
  PHASER: m(0x4f00, 'Phaser', DspType.MOD, ['Level', 'Rate', 'Depth', 'Fdbk', 'Shape', ''], [0x4f, 35], {
    effectMeta: MOD_META,
    knobSpecs: { 4: { max: 1, labels: ['Sine', 'Triangle'] } },
  }),
  PITCH_SHIFTER: m(0x1f00, 'Pitch Shifter', DspType.MOD, ['Level', 'Pitch', 'Detune', 'Fdbk', 'PreDly', ''], [0x1f, 36], { effectMeta: MOD_ALT_META }),
  // V2 Mod (FX2 V2)
  WAH_MOD: m(0xf400, 'Mod Wah', DspType.MOD, ['Mix', 'Freq', 'Heel', 'Toe', 'High Q', ''], [0xf4], { effectMeta: MOD_ALT_META, knobSpecs: HIGH_Q_SPEC }),
  TOUCH_WAH_MOD: m(0xf500, 'Mod Touch Wah', DspType.MOD, ['Mix', 'Sens', 'Heel', 'Toe', 'High Q', ''], [0xf5], { effectMeta: MOD_ALT_META, knobSpecs: HIGH_Q_SPEC }),
  DIATONIC_PITCH_SHIFTER: m(0x1f10, 'Diatonic Pitch', DspType.MOD, ['Mix', 'Pitch', 'Key', 'Scale', 'Tone', ''], [0x11f, 0x101f], {
    effectMeta: DIATONIC_META,
    knobSpecs: {
      1: { max: 21 },
      2: { max: 11, labels: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] },
      3: { max: 8 },
    },
  }),
  // Delay (FX3)
  MONO_DELAY: m(0x1600, 'Mono Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Bright', 'Atten', ''], [0x16, 37], { effectMeta: DELAY_META }),
  MONO_ECHO_FILTER: m(0x4300, 'Mono Echo Filter', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Freq', 'Res', 'Input'], [0x43], { effectMeta: DELAY_META }),
  STEREO_ECHO_FILTER: m(0x4800, 'Stereo Echo Filter', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Freq', 'Res', 'Input'], [0x48, 41], { effectMeta: DELAY_META }),
  TAPE_DELAY: m(0x2b00, 'Tape Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Flutter', 'Bright', 'Stereo'], [0x2b, 38], { effectMeta: DELAY_META }),
  STEREO_TAPE_DELAY: m(0x2a00, 'Stereo Tape Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Flutter', 'Sep', 'Bright'], [0x2a], { effectMeta: DELAY_META }),
  DUCKING_DELAY: m(0x1500, 'Ducking Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Release', 'Thresh', ''], [0x15, 39], { effectMeta: DELAY_META }),
  REVERSE_DELAY: m(0x4600, 'Reverse Delay', DspType.DELAY, ['Level', 'Time', 'FFdbk', 'RFdbk', 'Tone', ''], [0x46, 40], { effectMeta: DELAY_META }),
  MULTITAP_DELAY: m(0x4400, 'Multitap Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Bright', 'Mode', ''], [0x44], {
    effectMeta: DELAY_META,
    knobSpecs: { 4: { max: 3, labels: ['Mode 1', 'Mode 2', 'Mode 3', 'Mode 4'] } },
  }),
  PING_PONG_DELAY: m(0x4500, 'Ping Pong Delay', DspType.DELAY, ['Level', 'Time', 'Fdbk', 'Bright', 'Stereo', ''], [0x45], { effectMeta: DELAY_META }),
  // Reverb (FX4)
  SMALL_HALL: m(0x2400, 'Small Hall', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x24, 42], { effectMeta: REVERB_META }),
  LARGE_HALL: m(0x3a00, 'Large Hall', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x3a, 43], { effectMeta: REVERB_META }),
  SMALL_ROOM: m(0x2600, 'Small Room', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x26, 44], { effectMeta: REVERB_META }),
  LARGE_ROOM: m(0x3b00, 'Large Room', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x3b, 45], { effectMeta: REVERB_META }),
  SMALL_PLATE: m(0x4e00, 'Small Plate', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x4e, 46], { effectMeta: REVERB_META }),
  LARGE_PLATE: m(0x4b00, 'Large Plate', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x4b, 47], { effectMeta: REVERB_META }),
  AMBIENT: m(0x4c00, 'Ambient', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x4c, 48], { effectMeta: REVERB_META }),
  ARENA: m(0x4d00, 'Arena', DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x4d, 49], { effectMeta: REVERB_META }),
  SPRING_63: m(0x2100, "'63 Spring", DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x21, 50], { effectMeta: REVERB_META }),
  SPRING_65: m(0x0b00, "'65 Spring", DspType.REVERB, ['Level', 'Decay', 'Dwell', 'Diff', 'Tone', ''], [0x0b, 51], { effectMeta: REVERB_META }),
};

/**
 * Hardware cabinet models supported by Mustang V1/V2 firmware (0x00-0x0c).
 */
// prettier-ignore
export const CABINET_MODELS: CabinetDef[] = [
  { id: 0x00, name: 'Off' },
  { id: 0x01, name: "1x12 '57 Deluxe" },
  { id: 0x02, name: "4x10 '59 Bassman" },
  { id: 0x03, name: "1x12 '65 Deluxe" },
  { id: 0x04, name: "1x10 '65 Princeton" },
  { id: 0x05, name: "1x8 '57 Champ" },
  { id: 0x06, name: "4x12 British '80s" },
  { id: 0x07, name: "2x12 British '60s" },
  { id: 0x08, name: "4x12 British '70s" },
  { id: 0x09, name: "2x12 '65 Twin" },
  { id: 0x0a, name: "4x12 American '90s" },
  { id: 0x0b, name: '2x12 Super-Sonic' },
  { id: 0x0c, name: '1x12 Super-Sonic' },
];

// -----------------------------------------------------------------------------
// Model Registry (Indexed O(1) Lookups)
// -----------------------------------------------------------------------------

const ampById = new Map<number, ModelDef>(Object.values(AMP_MODELS).map(model => [model.id, model]));
const effectById = new Map<number, ModelDef>(Object.values(EFFECT_MODELS).map(model => [model.id, model]));
const cabinetById = new Map<number, CabinetDef>(CABINET_MODELS.map(cab => [cab.id, cab]));

const fuseAliasByType = new Map<DspType, Map<number, number>>();
for (const model of [...Object.values(AMP_MODELS), ...Object.values(EFFECT_MODELS)]) {
  let typeMap = fuseAliasByType.get(model.type);
  if (!typeMap) {
    typeMap = new Map<number, number>();
    fuseAliasByType.set(model.type, typeMap);
  }
  for (const fuseId of model.fuseIds ?? []) {
    if (!typeMap.has(fuseId)) {
      typeMap.set(fuseId, model.id);
    }
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

/**
 * Return the official Fender FUSE XML decimal ID for a model (e.g. 0x67 = 103 for '57 Deluxe).
 */
export function getFuseXmlId(model: ModelDef): number {
  if (model.fuseIds && model.fuseIds.length > 0) {
    return model.fuseIds[0];
  }
  const msb = (model.id >> 8) & 0xff;
  const lsb = model.id & 0xff;
  return (lsb << 8) | msb;
}

/**
 * Return the required 3-byte effect metadata [byte19, byte20, byte21] for a given model/DSP type.
 */
export function getEffectWireMeta(modelId: number, type: DspType): readonly [number, number, number] {
  const model = findEffectModel(modelId);
  if (model?.effectMeta) return model.effectMeta;

  switch (type) {
    case DspType.MOD:
      return MOD_META;
    case DspType.DELAY:
      return DELAY_META;
    case DspType.REVERB:
      return REVERB_META;
    case DspType.STOMP:
    default:
      return STOMP_META;
  }
}

/**
 * Return the 3-byte metadata [byte19, byte20, byte21] used when clearing an effect DSP unit.
 */
export function getClearEffectWireMeta(type: DspType): readonly [number, number, number] {
  switch (type) {
    case DspType.MOD:
      return [0x00, 0x01, 0x01];
    case DspType.DELAY:
      return DELAY_META;
    case DspType.REVERB:
    case DspType.STOMP:
    default:
      return STOMP_META;
  }
}

/**
 * Return the discrete knob spec for a specific effect model and knob index, if any.
 */
export function getEffectKnobSpec(modelId: number, index: number): KnobSpec | undefined {
  return findEffectModel(modelId)?.knobSpecs?.[index];
}

/**
 * Clamp an effect knob value to its hardware range (discrete spec or 0..255).
 */
export function clampEffectKnob(modelId: number, index: number, value: number): number {
  const spec = getEffectKnobSpec(modelId, index);
  if (spec) return clampRange(value, spec.min ?? 0, spec.max);
  return toByte(value);
}

/**
 * Resolve a Fender FUSE `.fuse` XML `<Module ID="...">` integer to our internal wire model ID.
 * Official Fender FUSE decimal IDs (little-endian firmware IDs) take priority over legacy ordinal aliases.
 */
export function resolveFuseModelId(fuseId: number, type: DspType): number | null {
  const lookup = type === DspType.AMP ? ampById : effectById;
  const matchesType = (candidateId: number): boolean => lookup.get(candidateId)?.type === type;

  // 1. Official Fender FUSE little-endian decimal ID (e.g., 100 -> 0x6400 '59 Bassman, 272 -> 0x1001 Orange Box)
  const lowByte = fuseId & 0xff;
  const highByte = (fuseId >> 8) & 0xff;
  const swapped = (lowByte << 8) | highByte;
  if (matchesType(swapped)) return swapped;

  // 2. Direct internal wire ID match (e.g., 0x6700)
  if (matchesType(fuseId)) return fuseId;

  // 3. Explicit alias lookup (including Diatonic Pitch Shifter 0x11f and legacy ordinal IDs)
  const mapped = fuseAliasByType.get(type)?.get(fuseId);
  if (mapped !== undefined) return mapped;

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
