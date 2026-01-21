import { OFFSETS, VALUES } from './constants';
import { DspType } from './models';
import type { AmpState, EffectState } from './state_types';

export class PacketParser {
  static parseAmpSettings(data: Uint8Array): AmpState {
    const modelId = (data[OFFSETS.MODEL_ID_MSB] << 8) | data[OFFSETS.MODEL_ID_LSB];
    const cabinetId = data[OFFSETS.CABINET_ID];
    const knobs = Array.from(data.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END));

    return {
      modelId,
      enabled: true, // Amp is always enabled
      cabinetId,
      knobs,
    };
  }

  static parseEffectSettings(data: Uint8Array, slot: number): EffectState | null {
    const type = data[OFFSETS.TYPE] as DspType;
    const modelId = (data[OFFSETS.MODEL_ID_MSB] << 8) | data[OFFSETS.MODEL_ID_LSB];
    const bypass = data[OFFSETS.BYPASS] === VALUES.BYPASSED;

    if (modelId === 0) {
      return null;
    }

    return {
      slot,
      type,
      modelId,
      enabled: !bypass,
      knobs: Array.from(data.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END)),
    };
  }

  static parsePresetInfo(data: Uint8Array): { slot: number; name: string } | null {
    if (data[0] !== 0x1c || data[1] !== 0x01) return null;
    if (data[2] !== 0x04 && data[2] !== 0x00) return null;

    const slot = data[OFFSETS.PRESET_SLOT];
    const nameBytes = data.slice(OFFSETS.PRESET_NAME, OFFSETS.PRESET_NAME + 32);
    let name = '';
    for (const b of nameBytes) {
      if (b === 0) break;
      name += String.fromCharCode(b);
    }
    return { slot, name };
  }

  static isBypassResponse(data: Uint8Array): boolean {
    return data[0] === 0x19 && data[1] === 0xc3;
  }

  static parseBypassResponse(data: Uint8Array): { slot: number; enabled: boolean } | null {
    if (!this.isBypassResponse(data)) return null;
    return {
      slot: data[4],
      enabled: data[3] === VALUES.ENABLED,
    };
  }
}
