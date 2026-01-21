export const OFFSETS = {
  // Common Packet Structure
  COMMAND: 1, // Read/Write
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
} as const;

export const VALUES = {
  BYPASSED: 1,
  ENABLED: 0,
} as const;
