import { DspType } from '../models';
import { OFFSETS, OPCODES, VALUES, isValidPresetSlot, isValidSlot } from './constants';

const UTF8_DECODER = new TextDecoder('utf-8');

export type CommandType =
  | 'KNOB_CHANGE'
  | 'AMP_UPDATE'
  | 'EFFECT_UPDATE'
  | 'PRESET_INFO'
  | 'PRESET_CHANGE'
  | 'PRESET_ACK'
  | 'BYPASS_STATE'
  | 'DUMP_COMPLETE'
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
  presetSlot?: number;
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

export interface PresetAckCommand extends BaseCommand {
  type: 'PRESET_ACK';
  slot: number;
}

export interface BypassStateCommand extends BaseCommand {
  type: 'BYPASS_STATE';
  slot: number;
  enabled: boolean;
}

export interface DumpCompleteCommand extends BaseCommand {
  type: 'DUMP_COMPLETE';
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
  | PresetAckCommand
  | BypassStateCommand
  | DumpCompleteCommand
  | UnknownCommand;

export class ProtocolDecoder {
  static decode(data: Uint8Array): Command {
    if (!data || data.length < 2) {
      return { type: 'UNKNOWN', raw: data || new Uint8Array(0) };
    }

    const command = data[OFFSETS.COMMAND];
    const subCommand = data[OFFSETS.SUB_COMMAND];

    // 0. End of full parameter dump ACK (`0xff 0x01 ...`)
    if (command === OPCODES.DUMP_COMPLETE && subCommand === OPCODES.DUMP_COMPLETE_BYTE2) {
      return { type: 'DUMP_COMPLETE' };
    }

    // 1. Live Hardware Parameter Change (`0x05 0xc3 <dsp 0x02..0x06> <model0> <model1> <idx> <idx2> <flags> 0x00 <valLo> <valHi>`)
    // Byte 2 encodes DSP family (0x02=AMP, 0x03=STOMP, 0x04=MOD, 0x05=DELAY, 0x06=REVERB).
    // Byte 7 bit 7 (0x80) flags discrete parameters whose value lives in byte 9 (with byte 10 = 0x00);
    // continuous parameters store a 16-bit LE value in bytes 9-10 (8-bit value in byte 10).
    if (command === OPCODES.LIVE_CHANGE && subCommand === OPCODES.LIVE_CHANGE_SUB) {
      if (data.length <= OFFSETS.LIVE_KNOB_VALUE) {
        return { type: 'UNKNOWN', raw: data };
      }

      const rawDsp = data[OFFSETS.LIVE_DSP];
      let dspType: DspType;
      if (rawDsp >= 0x02 && rawDsp <= 0x06) {
        dspType = (rawDsp + 3) as DspType;
      } else if (rawDsp === 0x00) {
        dspType = DspType.AMP;
      } else {
        return { type: 'UNKNOWN', raw: data };
      }

      const isDiscrete = (data[OFFSETS.LIVE_CONTROL_TYPE] & 0x80) !== 0;
      const paramIndex = data[OFFSETS.LIVE_KNOB_INDEX];
      const paramValue = isDiscrete ? data[OFFSETS.LIVE_KNOB_VALUE_LSB] : data[OFFSETS.LIVE_KNOB_VALUE];
      const slot = data.length > OFFSETS.LIVE_SLOT_INDEX ? data[OFFSETS.LIVE_SLOT_INDEX] || 0 : 0;

      return {
        type: 'KNOB_CHANGE',
        dspType,
        slot,
        knobIndex: paramIndex,
        value: paramValue,
      };
    }

    // 1b. Legacy / direct DSP knob change format (`0x05..0x09`, non-0xc3 subcommand)
    if (command >= DspType.AMP && command <= DspType.REVERB) {
      if (data.length <= OFFSETS.LIVE_SLOT_INDEX) {
        return { type: 'UNKNOWN', raw: data };
      }

      const slot = data[OFFSETS.LIVE_SLOT_INDEX] || 0;
      const paramIndex = data[OFFSETS.LIVE_KNOB_INDEX];
      const isDiscrete = (data[OFFSETS.LIVE_CONTROL_TYPE] & 0x80) !== 0;
      const paramValue = isDiscrete ? data[OFFSETS.LIVE_KNOB_VALUE_LSB] : data[OFFSETS.LIVE_KNOB_VALUE];

      return {
        type: 'KNOB_CHANGE',
        dspType: command,
        slot,
        knobIndex: paramIndex,
        value: paramValue,
      };
    }

    // 2. Data Packet (0x1c: 0x01 = Read/Dump/Notification, 0x03 = Write/Hardware Edit)
    if (command === OPCODES.DATA_PACKET && (subCommand === OPCODES.DATA_READ || subCommand === OPCODES.DATA_WRITE)) {
      if (data.length <= OFFSETS.TYPE) {
        return { type: 'UNKNOWN', raw: data };
      }

      const type = data[OFFSETS.TYPE];

      // Preset Info / Change / Ack (only valid on DATA_READ 0x01; 0x1c 0x03 0x00 is an Apply echo)
      // Type 0x04 = Preset Info (initial list OR active preset announcement on hardware wheel turn)
      // Type 0x00 = Confirmation ACK (empty name bytes) or named Preset Change
      // Type 0x01 = Explicit Preset Change
      if (subCommand === OPCODES.DATA_READ && (type === OPCODES.PRESET_INFO || type === 0x00 || type === 0x01)) {
        if (data.length < OFFSETS.PRESET_NAME) {
          return { type: 'UNKNOWN', raw: data };
        }
        // data[3] === 0x00 indicates main amp preset (0x01/0x02 is Mod/Delay knob bank metadata)
        if (data[3] !== 0x00) return { type: 'UNKNOWN', raw: data };

        const slot = data[OFFSETS.PRESET_SLOT];
        if (!isValidPresetSlot(slot)) return { type: 'UNKNOWN', raw: data };

        // Parse null-terminated UTF-8 name
        const nameBytes = data.slice(OFFSETS.PRESET_NAME, OFFSETS.PRESET_NAME + 32);
        const nullIndex = nameBytes.indexOf(0);
        const slicedNameBytes = nullIndex !== -1 ? nameBytes.slice(0, nullIndex) : nameBytes;
        const name = UTF8_DECODER.decode(slicedNameBytes);

        if (type === OPCODES.PRESET_INFO) {
          return { type: 'PRESET_INFO', slot, name };
        }
        if (type === 0x00 && name.length === 0) {
          return { type: 'PRESET_ACK', slot };
        }
        return { type: 'PRESET_CHANGE', slot, name };
      }

      // Amp Update
      if (type === DspType.AMP) {
        if (data.length < OFFSETS.KNOB_END) {
          return { type: 'UNKNOWN', raw: data };
        }
        const instance = data[3];
        if (instance !== 0x00) return { type: 'UNKNOWN', raw: data };

        const modelId = (data[OFFSETS.MODEL_ID_MSB] << 8) | data[OFFSETS.MODEL_ID_LSB];
        const cabinetId = data[OFFSETS.CABINET_ID];
        const knobs = Array.from(data.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END));
        const rawPresetSlot = data[OFFSETS.PRESET_SLOT];
        const presetSlot =
          subCommand === OPCODES.DATA_READ && isValidPresetSlot(rawPresetSlot) ? rawPresetSlot : undefined;
        return {
          type: 'AMP_UPDATE',
          modelId,
          cabinetId,
          knobs,
          ...(presetSlot !== undefined ? { presetSlot } : {}),
        };
      }

      // Effect Update
      if (type >= DspType.STOMP && type <= DspType.REVERB) {
        if (data.length < OFFSETS.KNOB_END) {
          return { type: 'UNKNOWN', raw: data };
        }
        const instance = data[3];
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
    if (command === OPCODES.BYPASS_PACKET && subCommand === OPCODES.BYPASS_RESPONSE) {
      if (data.length < 5 || !isValidSlot(data[4])) {
        return { type: 'UNKNOWN', raw: data };
      }
      return {
        type: 'BYPASS_STATE',
        slot: data[4],
        enabled: data[3] === VALUES.ENABLED,
      };
    }

    return { type: 'UNKNOWN', raw: data };
  }
}
