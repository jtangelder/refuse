import { DspType } from './models';

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

export type CommandType =
  | 'KNOB_CHANGE'
  | 'AMP_UPDATE'
  | 'EFFECT_UPDATE'
  | 'PRESET_INFO'
  | 'PRESET_CHANGE'
  | 'BYPASS_STATE'
  | 'UNKNOWN';

export interface BaseCommand {
  type: CommandType;
}

export interface KnobChangeCommand extends BaseCommand {
  type: 'KNOB_CHANGE';
  dspType: DspType;
  slot: number;
  knobIndex: number;
  value: number;
}

export interface AmpUpdateCommand extends BaseCommand {
  type: 'AMP_UPDATE';
  modelId: number;
  cabinetId: number;
  knobs: number[];
}

export interface EffectUpdateCommand extends BaseCommand {
  type: 'EFFECT_UPDATE';
  slot: number;
  dspType: DspType;
  modelId: number;
  enabled: boolean;
  knobs: number[];
}

export interface PresetInfoCommand extends BaseCommand {
  type: 'PRESET_INFO';
  slot: number;
  name: string;
}

export interface PresetChangeCommand extends BaseCommand {
  type: 'PRESET_CHANGE';
  slot: number;
  name: string;
}

export interface BypassStateCommand extends BaseCommand {
  type: 'BYPASS_STATE';
  slot: number;
  enabled: boolean;
}

export interface UnknownCommand extends BaseCommand {
  type: 'UNKNOWN';
  raw: Uint8Array;
}

export type Command =
  | KnobChangeCommand
  | AmpUpdateCommand
  | EffectUpdateCommand
  | PresetInfoCommand
  | PresetChangeCommand
  | BypassStateCommand
  | UnknownCommand;

export class ProtocolDecoder {
  static decode(data: Uint8Array): Command {
    const b0 = data[0];
    const b1 = data[1];

    // 1. Live Knob Change (Direct Type 0x05..0x09)
    if (b0 >= DspType.AMP && b0 <= DspType.REVERB) {
      if (b1 === 0x00) {
        // Logic from EffectController
        const slot = data[13] || 0;
        const paramIndex = data[5];
        const paramValue = data[10];

        return {
          type: 'KNOB_CHANGE',
          dspType: b0,
          slot,
          knobIndex: paramIndex,
          value: paramValue,
        };
      }
    }

    // 2. Data Packet (0x1c)
    if (b0 === 0x1c && b1 === 0x01) {
      const type = data[2];

      // Preset Info / Change
      if (type === 0x04 || type === 0x00) {
        // PresetController checks data[3] === 0x00.
        // If data[3] !== 0x00, we ignore/treat as unknown to match legacy behavior
        if (data[3] !== 0x00) return { type: 'UNKNOWN', raw: data };

        const slot = data[OFFSETS.PRESET_SLOT];
        // Parse name
        const nameBytes = data.slice(OFFSETS.PRESET_NAME, OFFSETS.PRESET_NAME + 32);
        let name = '';
        for (const b of nameBytes) {
          if (b === 0) break;
          name += String.fromCharCode(b);
        }

        if (type === 0x00) {
          return { type: 'PRESET_CHANGE', slot, name };
        } else {
          return { type: 'PRESET_INFO', slot, name };
        }
      }

      // Amp Update
      if (type === DspType.AMP) {
        // Ensure instance is 0x00 (Active)
        const instance = data[3];
        if (instance !== 0x00) return { type: 'UNKNOWN', raw: data };

        const modelId = (data[OFFSETS.MODEL_ID_MSB] << 8) | data[OFFSETS.MODEL_ID_LSB];
        const cabinetId = data[OFFSETS.CABINET_ID];
        const knobs = Array.from(data.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END));
        return {
          type: 'AMP_UPDATE',
          modelId,
          cabinetId,
          knobs,
        };
      }

      // Effect Update
      if (type >= DspType.STOMP && type <= DspType.REVERB) {
        const instance = data[3];
        if (instance === 0x00) {
          // Active only
          const slot = data[OFFSETS.SLOT_INDEX];
          const modelId = (data[OFFSETS.MODEL_ID_MSB] << 8) | data[OFFSETS.MODEL_ID_LSB];
          const bypass = data[OFFSETS.BYPASS] === VALUES.BYPASSED;

          return {
            type: 'EFFECT_UPDATE',
            slot,
            dspType: type,
            modelId,
            enabled: !bypass,
            knobs: Array.from(data.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END)),
          };
        }
      }
    }

    // 3. Bypass Response (0x19 0xc3)
    if (b0 === 0x19 && b1 === 0xc3) {
      return {
        type: 'BYPASS_STATE',
        slot: data[4],
        enabled: data[3] === VALUES.ENABLED,
      };
    }

    return { type: 'UNKNOWN', raw: data };
  }
}
