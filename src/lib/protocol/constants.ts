/**
 * USB Vendor ID for Fender devices
 */
export const FENDER_VID = 0x1ed8;

/**
 * Protocol opcodes used in USB HID communication
 */
export const OPCODES = {
  // Connection
  HANDSHAKE_1: 0xc3,
  HANDSHAKE_2_BYTE1: 0x1a,
  HANDSHAKE_2_BYTE2: 0x03,

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
 * Protocol byte offsets used in USB HID communication
 */
export const OFFSETS = {
  // Parsing Keys
  COMMAND: 0,
  SUB_COMMAND: 1,

  // Common Packet Structure
  TYPE: 2, // Amp/Effect Type (DspType)

  // Settings / Presets
  PRESET_SLOT: 4,
  PRESET_NAME: 16,

  // Device State / Models
  MODEL_ID_MSB: 16,
  MODEL_ID_LSB: 17,
  SLOT_INDEX: 18, // Which slot the effect is in
  BYPASS: 22,

  // Controls
  KNOB_START: 32,
  KNOB_END: 64,
  KNOB_COUNT: 32, // 64 - 32

  // Specific
  CABINET_ID: 49,

  // Live Knob Changes
  LIVE_KNOB_INDEX: 5,
  LIVE_KNOB_VALUE: 10,
  LIVE_SLOT_INDEX: 13,
} as const;

/**
 * Protocol byte values used in USB HID communication
 */
export const VALUES = {
  BYPASSED: 1,
  ENABLED: 0,
} as const;

/**
 * Hardware limits of the Mustang DSP chain.
 */
export const LIMITS = {
  /** Total number of effect slots (0-3 pre-amp, 4-7 post-amp / FX loop). */
  SLOT_COUNT: 8,
  /** Number of slots on each side of the amp. */
  GROUP_SIZE: 4,
  /** Number of parameter bytes per DSP block (packet bytes 32-63). */
  KNOB_COUNT: 32,
  /** Maximum value of a single parameter byte. */
  MAX_VALUE: 0xff,
  /** Highest preset slot addressable by the protocol. */
  MAX_PRESET_SLOT: 99,
  /** Maximum number of bytes in a preset name. */
  PRESET_NAME_BYTES: 32,
} as const;

/**
 * Index into the 32-byte amp parameter block (packet byte = 32 + index).
 * Single source of truth shared by settings readers and writers.
 */
export const AMP_KNOB_INDEX = {
  volume: 0,
  gain: 1,
  gain2: 2,
  master: 3,
  treble: 4,
  mid: 5,
  bass: 6,
  presence: 7,
  depth: 9,
  bias: 10,
  noiseGate: 15,
  threshold: 16,
  cabinet: 17, // byte 49 (OFFSETS.CABINET_ID)
  sag: 19,
  brightness: 20,
} as const;

/** Amp parameters exposed as "advanced" settings in the UI. */
export type AdvancedAmpParam = 'depth' | 'bias' | 'noiseGate' | 'threshold' | 'sag' | 'brightness';

/** Clamp an arbitrary number to a valid unsigned byte (NaN -> 0). */
export function toByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(LIMITS.MAX_VALUE, Math.round(value)));
}

export function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < LIMITS.SLOT_COUNT;
}

export function isValidKnobIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < LIMITS.KNOB_COUNT;
}
