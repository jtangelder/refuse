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
