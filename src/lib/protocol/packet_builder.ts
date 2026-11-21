import {
  DspType,
  clampEffectKnob,
  findAmpModel,
  getClearEffectWireMeta,
  getEffectWireMeta,
} from '../models';
import {
  AMP_KNOB_INDEX,
  LIMITS,
  OFFSETS,
  OPCODES,
  VALUES,
  clampAmpKnob,
  clampRange,
  toByte,
} from './constants';

const UTF8_ENCODER = new TextEncoder();

/** Fixed HID report size used by all Mustang packets. */
export const PACKET_SIZE = 64;

/**
 * Truncate a string so its UTF-8 byte encoding fits within `maxBytes`
 * without ever splitting a multi-byte Unicode code point.
 */
export function truncateUtf8String(value: string, maxBytes: number): string {
  if (maxBytes <= 0 || !value) return '';
  let result = '';
  let byteCount = 0;
  for (const char of value) {
    const charBytes = UTF8_ENCODER.encode(char).length;
    if (byteCount + charBytes > maxBytes) break;
    result += char;
    byteCount += charBytes;
  }
  return result;
}

export class PacketBuilder {
  private buffer: Uint8Array;

  constructor() {
    this.buffer = new Uint8Array(64);
  }

  public setCommand(command: number): this {
    this.buffer[0] = command;
    return this;
  }

  public setSubCommand(subCommand: number): this {
    this.buffer[1] = subCommand;
    return this;
  }

  public setType(type: number): this {
    this.buffer[2] = type;
    return this;
  }

  /**
   * Write a single byte. Out-of-range indices are ignored and values are clamped
   * to 0-255, so callers can never produce a wrapped (e.g. 300 -> 44) value.
   */
  public setByte(index: number, value: number): this {
    if (Number.isInteger(index) && index >= 0 && index < PACKET_SIZE) {
      this.buffer[index] = toByte(value);
    }
    return this;
  }

  public addBytes(startIndex: number, values: ArrayLike<number>): this {
    for (let i = 0; i < values.length; i++) {
      this.setByte(startIndex + i, values[i]);
    }
    return this;
  }

  public setSequenceId(id: number): this {
    this.buffer[6] = toByte(id);
    this.buffer[7] = 0x01;
    return this;
  }

  /**
   * Standard DSP Write Packet (`0x1c 0x03 <type> 0x00 0x00 0x00 0x01 0x01 ...`).
   * Both offa/plug and snhirsch/mustang-midi-bridge always transmit `[0x01, 0x01]`
   * in bytes 6-7 for single-frame DSP writes.
   */
  public static dspWrite(type: DspType, _sequenceId?: number): PacketBuilder {
    return new PacketBuilder()
      .setCommand(OPCODES.DATA_PACKET)
      .setSubCommand(OPCODES.DATA_WRITE)
      .setType(type)
      .setByte(6, 0x01)
      .setByte(7, 0x01);
  }

  /**
   * Standard Execute/Apply Packet (`0x1c 0x03 0x00 ...` with all remaining bytes zeroed).
   * Matches both offa/plug `serializeApplyCommand()` and mustang-midi-bridge `execute`.
   */
  public static applyChange(_dspType?: DspType, _sequenceId?: number): PacketBuilder {
    return new PacketBuilder()
      .setCommand(OPCODES.DATA_PACKET)
      .setSubCommand(OPCODES.DATA_WRITE)
      .setType(0x00);
  }

  public static bypass(slot: number, enabled: boolean, dspType: DspType): PacketBuilder {
    if (dspType < DspType.STOMP || dspType > DspType.REVERB) {
      throw new Error(`Invalid effect DSP type for bypass: 0x${dspType.toString(16)}`);
    }
    // Map DspType to family: 0x06 (STOMP) -> 3, 0x07 (MOD) -> 4, 0x08 (DELAY) -> 5, 0x09 (REVERB) -> 6
    const family = dspType - 3;

    return new PacketBuilder()
      .setCommand(OPCODES.BYPASS_PACKET)
      .setSubCommand(OPCODES.BYPASS_SET)
      .setByte(2, family)
      .setByte(3, enabled ? VALUES.ENABLED : VALUES.BYPASSED)
      .setByte(4, slot);
  }

  public static savePreset(slot: number, name: string): PacketBuilder {
    const builder = new PacketBuilder()
      .setCommand(OPCODES.DATA_PACKET)
      .setSubCommand(OPCODES.DATA_READ)
      .setType(0x03) // Save type
      .setByte(3, 0x00)
      .setByte(OFFSETS.PRESET_SLOT, slot) // 4
      .setByte(5, 0x00)
      .setByte(6, 0x01)
      .setByte(7, 0x01);

    // Truncate on UTF-8 code-point boundaries so multi-byte characters are never split.
    const safeName = truncateUtf8String(name, LIMITS.PRESET_NAME_BYTES);
    const nameBytes = UTF8_ENCODER.encode(safeName);
    builder.addBytes(OFFSETS.PRESET_NAME, nameBytes); // 16

    return builder;
  }

  public static loadPreset(slot: number): PacketBuilder {
    return new PacketBuilder()
      .setCommand(OPCODES.DATA_PACKET)
      .setSubCommand(OPCODES.DATA_READ)
      .setType(0x01)
      .setByte(3, 0x00)
      .setByte(OFFSETS.PRESET_SLOT, slot)
      .setByte(5, 0x00)
      .setByte(6, 0x01);
  }

  // State Serializers
  public static fromAmpState(
    state: { modelId: number; knobs: number[]; cabinetId: number },
    _sequenceId?: number,
  ): PacketBuilder {
    const builder = PacketBuilder.dspWrite(DspType.AMP);
    builder.setByte(OFFSETS.MODEL_ID_MSB, (state.modelId >> 8) & 0xff);
    builder.setByte(OFFSETS.MODEL_ID_LSB, state.modelId & 0xff);

    const normalizedKnobs = Array.from({ length: LIMITS.KNOB_COUNT }, (_, i) =>
      clampAmpKnob(i, state.knobs[i] ?? 0),
    );
    const cabinetId = clampRange(state.cabinetId, 0, LIMITS.MAX_CABINET_ID);
    normalizedKnobs[AMP_KNOB_INDEX.cabinet] = cabinetId;

    // Match offa/plug noise gate contract: custom threshold/depth only apply when noiseGate === 5 (Custom)
    if (normalizedKnobs[AMP_KNOB_INDEX.noiseGate] !== 0x05) {
      normalizedKnobs[AMP_KNOB_INDEX.threshold] = 0x00;
      normalizedKnobs[AMP_KNOB_INDEX.depth] = 0x80;
    }

    // Enforce required per-amp firmware metadata bytes (bytes 40, 43, 44-46, 50, 53, 54)
    const ampMeta = findAmpModel(state.modelId)?.ampMeta;
    if (ampMeta) {
      normalizedKnobs[8] = ampMeta.b40; // byte 40
      normalizedKnobs[11] = ampMeta.b43; // byte 43
      normalizedKnobs[12] = ampMeta.num; // byte 44
      normalizedKnobs[13] = ampMeta.num; // byte 45
      normalizedKnobs[14] = ampMeta.num; // byte 46
      normalizedKnobs[18] = ampMeta.num; // byte 50
      normalizedKnobs[21] = 0x01; // byte 53
      normalizedKnobs[22] = ampMeta.b54; // byte 54
    }

    builder.addBytes(OFFSETS.KNOB_START, normalizedKnobs);
    builder.setByte(OFFSETS.CABINET_ID, cabinetId);
    return builder;
  }

  public static fromEffectState(
    state: { type: DspType; slot: number; modelId: number; enabled: boolean; knobs: number[] },
    _sequenceId?: number,
  ): PacketBuilder {
    const builder = PacketBuilder.dspWrite(state.type);
    builder.setByte(OFFSETS.MODEL_ID_MSB, (state.modelId >> 8) & 0xff);
    builder.setByte(OFFSETS.MODEL_ID_LSB, state.modelId & 0xff);
    builder.setByte(OFFSETS.SLOT_INDEX, state.slot);

    const [m0, m1, m2] = getEffectWireMeta(state.modelId, state.type);
    builder.setByte(OFFSETS.EFFECT_META_0, m0);
    builder.setByte(OFFSETS.EFFECT_META_1, m1);
    builder.setByte(OFFSETS.EFFECT_META_2, m2);
    builder.setByte(OFFSETS.BYPASS, state.enabled ? VALUES.ENABLED : VALUES.BYPASSED);

    const clampedKnobs = state.knobs.map((val, i) => clampEffectKnob(state.modelId, i, val));
    builder.addBytes(OFFSETS.KNOB_START, clampedKnobs);
    return builder;
  }

  /**
   * Build an effect-clear DSP packet (`modelId = 0x0000`) with family metadata bytes 19-21.
   */
  public static clearEffect(type: DspType, slot: number): PacketBuilder {
    const [m0, m1, m2] = getClearEffectWireMeta(type);
    return PacketBuilder.dspWrite(type)
      .setByte(OFFSETS.SLOT_INDEX, slot)
      .setByte(OFFSETS.EFFECT_META_0, m0)
      .setByte(OFFSETS.EFFECT_META_1, m1)
      .setByte(OFFSETS.EFFECT_META_2, m2);
  }

  /** Handshake packet 1: `[0x00, 0xc3, 0x00, ...]` (64 bytes). */
  public static handshake1(): Uint8Array {
    return new PacketBuilder()
      .setCommand(OPCODES.HANDSHAKE_1_BYTE1)
      .setSubCommand(OPCODES.HANDSHAKE_1_BYTE2)
      .build();
  }

  /**
   * Handshake packet 2: `[0x1a, 0x03 | 0xc1, 0x00, ...]` (64 bytes).
   * Defaults to `0xc1` (V2 & Mustang III/IV/V); pass `0x03` for Mustang I/II V1, Bronco, Mini, Floor.
   */
  public static handshake2(subCommand: number = OPCODES.HANDSHAKE_2_BYTE2_V2): Uint8Array {
    return new PacketBuilder().setCommand(OPCODES.HANDSHAKE_2_BYTE1).setSubCommand(subCommand).build();
  }

  public static requestState(): Uint8Array {
    return new PacketBuilder().setCommand(OPCODES.REQUEST_STATE).setSubCommand(OPCODES.REQUEST_STATE_BYTE2).build();
  }

  /** @deprecated Not part of the Fender Mustang USB protocol; bypass states are in `EFFECT_UPDATE` byte 22. */
  public static requestBypassStates(): Uint8Array {
    return new PacketBuilder().setCommand(OPCODES.REQUEST_BYPASS).setSubCommand(OPCODES.REQUEST_BYPASS_BYTE2).build();
  }

  public build(): Uint8Array {
    return this.buffer;
  }
}
