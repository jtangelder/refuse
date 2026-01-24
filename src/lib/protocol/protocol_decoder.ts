import { DspType } from '../models';
import { OFFSETS, VALUES } from './constants';

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
    const command = data[OFFSETS.COMMAND];
    const subCommand = data[OFFSETS.SUB_COMMAND];

    // 1. Live Knob Change (Direct Type 0x05..0x09)
    // The "sniffing" logic from legacy: data[0] is DspType, data[1] is 0x00
    if (command >= DspType.AMP && command <= DspType.REVERB) {
      if (subCommand === 0x00) {
        // Logic from EffectController/AmpController
        const slot = data[OFFSETS.LIVE_SLOT_INDEX] || 0;
        const paramIndex = data[OFFSETS.LIVE_KNOB_INDEX];
        const paramValue = data[OFFSETS.LIVE_KNOB_VALUE];

        return {
          type: 'KNOB_CHANGE',
          dspType: command,
          slot,
          knobIndex: paramIndex,
          value: paramValue,
        };
      }
    }

    // 2. Data Packet (0x1c)
    if (command === 0x1c && subCommand === 0x01) {
      const type = data[OFFSETS.TYPE];

      // Preset Info / Change
      // Type 0x04 = Preset Info (when requesting list)
      // Type 0x00 = Preset Change (when selecting preset, also sent by amp)
      if (type === 0x04 || type === 0x00) {
        // PresetController checks data[3] === 0x00.
        // If data[3] !== 0x00, we ignore/treat as unknown to match legacy behavior
        if (data[3] !== 0x00) return { type: 'UNKNOWN', raw: data };

        const slot = data[OFFSETS.PRESET_SLOT];
        // Parse name
        const nameBytes = data.slice(OFFSETS.PRESET_NAME, OFFSETS.PRESET_NAME + 32);
        // Find the first null byte to correctly slice the buffer
        const nullIndex = nameBytes.indexOf(0);
        const slicedNameBytes = nullIndex !== -1 ? nameBytes.slice(0, nullIndex) : nameBytes;
        const name = new TextDecoder('utf-8').decode(slicedNameBytes);

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
        // data[3] seems to be 0x00 for active effects
        if (instance === 0x00) {
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
    if (command === 0x19 && subCommand === 0xc3) {
      return {
        type: 'BYPASS_STATE',
        slot: data[4],
        enabled: data[3] === VALUES.ENABLED,
      };
    }

    return { type: 'UNKNOWN', raw: data };
  }
}
