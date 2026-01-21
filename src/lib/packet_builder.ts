import { OPCODES } from './protocol';
import { DspType } from './models';

export class PacketBuilder {
  private buffer: Uint8Array;
  private sequenceId: number = 0;

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

  public setByte(index: number, value: number): this {
    if (index >= 0 && index < 64) {
      this.buffer[index] = value;
    }
    return this;
  }

  public addBytes(startIndex: number, values: number[] | Uint8Array): this {
    for (let i = 0; i < values.length; i++) {
      if (startIndex + i < 64) {
        this.buffer[startIndex + i] = values[i];
      }
    }
    return this;
  }

  public setSequenceId(id: number): this {
    this.buffer[6] = id;
    this.buffer[7] = 0x01; // Always 0x01 for sequence validation
    return this;
  }

  // --- Specific Packet Types ---

  // Standard DSP Write Packet (0x1c 0x03)
  public static dspWrite(type: DspType, sequenceId: number): PacketBuilder {
    return new PacketBuilder()
      .setCommand(OPCODES.DATA_PACKET)
      .setSubCommand(OPCODES.DATA_WRITE)
      .setType(type)
      .setSequenceId(sequenceId);
  }

  // Apply Packet (0x1c 0x03 0x00 ...)
  public static applyChange(dspType: DspType, sequenceId: number): PacketBuilder {
    const builder = new PacketBuilder()
      .setCommand(OPCODES.DATA_PACKET)
      .setSubCommand(OPCODES.DATA_WRITE)
      .setType(0x00) // Type 0 for apply
      .setSequenceId(sequenceId);

    // PacketSerializer logic for Apply headers: Mod=0x01, Other=0x02
    builder.setByte(4, dspType === DspType.MOD ? 0x01 : 0x02);

    return builder;
  }

  public static bypass(slot: number, enabled: boolean, dspType: DspType): PacketBuilder {
    // Map DspType to family: 0x06 (STOMP) -> 3, 0x07 (MOD) -> 4, etc.
    const family = dspType - 3;

    return new PacketBuilder()
      .setCommand(OPCODES.BYPASS_PACKET)
      .setSubCommand(OPCODES.BYPASS_SET)
      .setByte(2, family)
      .setByte(3, enabled ? 0x00 : 0x01) // 0=On, 1=Off
      .setByte(4, slot);
  }

  public static savePreset(slot: number, name: string): PacketBuilder {
    const builder = new PacketBuilder()
      .setCommand(OPCODES.DATA_PACKET)
      .setSubCommand(OPCODES.DATA_READ)
      .setType(0x03) // Save type?
      .setByte(3, 0x00)
      .setByte(4, slot)
      .setByte(5, 0x00)
      .setByte(6, 0x01)
      .setByte(7, 0x01);

    const nameBytes = new TextEncoder().encode(name.substring(0, 32));
    builder.addBytes(16, nameBytes); // Name starts at 16

    return builder;
  }

  public static loadPreset(slot: number): PacketBuilder {
    return new PacketBuilder()
      .setCommand(OPCODES.DATA_PACKET)
      .setSubCommand(OPCODES.DATA_READ)
      .setType(0x01)
      .setByte(3, 0x00)
      .setByte(4, slot)
      .setByte(5, 0x00)
      .setByte(6, 0x01);
  }

  // State Serializers
  public static fromAmpState(
    state: { modelId: number; knobs: number[]; cabinetId: number },
    sequenceId: number,
  ): PacketBuilder {
    const builder = PacketBuilder.dspWrite(DspType.AMP, sequenceId);
    builder.setByte(16, (state.modelId >> 8) & 0xff);
    builder.setByte(17, state.modelId & 0xff);
    builder.setByte(49, state.cabinetId);

    builder.addBytes(32, state.knobs);
    return builder;
  }

  public static fromEffectState(
    state: { type: DspType; slot: number; modelId: number; enabled: boolean; knobs: number[] },
    sequenceId: number,
  ): PacketBuilder {
    const builder = PacketBuilder.dspWrite(state.type, sequenceId);
    builder.setByte(16, (state.modelId >> 8) & 0xff);
    builder.setByte(17, state.modelId & 0xff);
    builder.setByte(18, state.slot);
    builder.setByte(22, state.enabled ? 0 : 1);

    builder.addBytes(32, state.knobs);
    return builder;
  }

  public build(): Uint8Array {
    return this.buffer;
  }
}
