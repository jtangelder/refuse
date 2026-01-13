/**
 * Type definitions for Mustang API
 * This file exports additional types and helper utilities
 */

import type { DspType, ModelDef } from './models';

/**
 * Amp parameter byte positions in the buffer
 */
export const AMP_BYTE_POSITIONS = {
    MODEL_HIGH: 16,
    MODEL_LOW: 17,
    SLOT: 18,
    BYPASS: 22,
    VOLUME: 32,
    GAIN: 33,
    GAIN2: 34,
    MASTER: 35,
    TREBLE: 36,
    MID: 37,
    BASS: 38,
    PRESENCE: 39,
    DEPTH: 41,
    BIAS: 42,
    NOISE_GATE: 47,
    THRESHOLD: 48,
    CABINET: 49,
    SAG: 51,
    BRIGHTNESS: 52,
} as const;

/**
 * Effect parameter byte positions in the buffer
 */
export const EFFECT_BYTE_POSITIONS = {
    MODEL_HIGH: 16,
    MODEL_LOW: 17,
    SLOT: 18,
    BYPASS: 22,
    KNOB1: 32,
    KNOB2: 33,
    KNOB3: 34,
    KNOB4: 35,
    KNOB5: 36,
    KNOB6: 37,
} as const;

/**
 * Preset slot range
 */
export const PRESET_SLOTS = {
    MIN: 0,
    MAX: 23,
    COUNT: 24,
} as const;

/**
 * Effect slot mapping
 */
export const EFFECT_SLOTS = {
    STOMP1: 0,
    STOMP2: 1,
    STOMP3: 2,
    STOMP4: 3,
    MOD: 4,
    DELAY: 5,
    DELAY2: 6,
    REVERB: 7,
} as const;

/**
 * Helper type to get slot type from slot number
 */
export type SlotType<T extends number> =
    T extends 0 | 1 | 2 | 3 ? DspType.STOMP :
    T extends 4 ? DspType.MOD :
    T extends 5 | 6 ? DspType.DELAY :
    T extends 7 ? DspType.REVERB :
    never;

/**
 * Value ranges for amp parameters (0-255)
 */
export interface AmpParameterRanges {
    volume: [number, number];
    gain: [number, number];
    treble: [number, number];
    mid: [number, number];
    bass: [number, number];
    presence: [number, number];
    noiseGate: [number, number];
    threshold: [number, number];
}

export const AMP_RANGES: AmpParameterRanges = {
    volume: [0, 255],
    gain: [0, 255],
    treble: [0, 255],
    mid: [0, 255],
    bass: [0, 255],
    presence: [0, 255],
    noiseGate: [0, 5],
    threshold: [0, 9],
};

/**
 * USB HID Protocol opcodes
 */
export const OPCODES = {
    // Connection
    INIT1: 0xc3,
    INIT2_BYTE1: 0x1a,
    INIT2_BYTE2: 0x03,

    // State requests
    REQUEST_STATE: 0xff,
    REQUEST_STATE_BYTE2: 0xc1,

    // Data operations
    DATA_WRITE: 0x1c,
    DATA_WRITE_PARAM: 0x03,
    DATA_LOAD_PRESET: 0x01,

    // Bypass control
    BYPASS_REQUEST: 0x19,
    BYPASS_REQUEST_BYTE2: 0x00,
    BYPASS_TOGGLE: 0x19,
    BYPASS_SET: 0x02,
    BYPASS_RESPONSE: 0xc3,
} as const;

/**
 * Helper to convert 0-100 percentage to 0-255 byte value
 */
export function percentToByte(percent: number): number {
    return Math.round((Math.max(0, Math.min(100, percent)) / 100) * 255);
}

/**
 * Helper to convert 0-255 byte value to 0-100 percentage
 */
export function byteToPercent(byte: number): number {
    return Math.round((byte / 255) * 100);
}

/**
 * Helper to create an empty effect buffer
 */
export function createEmptyEffectBuffer(slot: number): Uint8Array {
    const buffer = new Uint8Array(64);
    buffer[18] = slot;
    buffer[22] = 1; // Bypassed
    return buffer;
}

/**
 * Helper to create an amp buffer from settings
 */
export function createAmpBuffer(settings: {
    modelId: number;
    volume?: number;
    gain?: number;
    treble?: number;
    mid?: number;
    bass?: number;
    presence?: number;
    cabinet?: number;
}): Uint8Array {
    const buffer = new Uint8Array(64);

    buffer[16] = (settings.modelId >> 8) & 0xff;
    buffer[17] = settings.modelId & 0xff;

    if (settings.volume !== undefined) buffer[32] = settings.volume;
    if (settings.gain !== undefined) buffer[33] = settings.gain;
    if (settings.treble !== undefined) buffer[36] = settings.treble;
    if (settings.mid !== undefined) buffer[37] = settings.mid;
    if (settings.bass !== undefined) buffer[38] = settings.bass;
    if (settings.presence !== undefined) buffer[39] = settings.presence;
    if (settings.cabinet !== undefined) buffer[49] = settings.cabinet;

    return buffer;
}

/**
 * Helper to create an effect buffer from settings
 */
export function createEffectBuffer(settings: {
    modelId: number;
    slot: number;
    enabled?: boolean;
    knobs?: number[];
}): Uint8Array {
    const buffer = new Uint8Array(64);

    buffer[16] = (settings.modelId >> 8) & 0xff;
    buffer[17] = settings.modelId & 0xff;
    buffer[18] = settings.slot;
    buffer[22] = settings.enabled === false ? 1 : 0;

    if (settings.knobs) {
        settings.knobs.forEach((value, index) => {
            if (index < 6) {
                buffer[32 + index] = value;
            }
        });
    }

    return buffer;
}
