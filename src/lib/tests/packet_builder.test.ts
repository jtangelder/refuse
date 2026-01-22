import { describe, it, expect } from 'vitest';
import { PacketBuilder } from '../protocol/packet_builder';
import { OPCODES } from '../protocol/protocol';
import { DspType, AMP_MODELS, EFFECT_MODELS } from '../models';

describe('PacketBuilder', () => {
  describe('Basic Construction', () => {
    it('should initialize with a 64-byte buffer', () => {
      const builder = new PacketBuilder();
      const buffer = builder.build();
      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBe(64);
    });

    it('should set command and subcommand', () => {
      const builder = new PacketBuilder().setCommand(OPCODES.DATA_PACKET).setSubCommand(OPCODES.DATA_WRITE);

      const buffer = builder.build();
      expect(buffer[0]).toBe(OPCODES.DATA_PACKET);
      expect(buffer[1]).toBe(OPCODES.DATA_WRITE);
    });

    it('should set type and arbitrary bytes', () => {
      const builder = new PacketBuilder().setType(0x99).setByte(10, 0xaa).setByte(63, 0xff);

      const buffer = builder.build();
      expect(buffer[2]).toBe(0x99);
      expect(buffer[10]).toBe(0xaa);
      expect(buffer[63]).toBe(0xff);
    });

    it('should ignore out of bounds setByte', () => {
      const builder = new PacketBuilder();

      // Should not throw
      builder.setByte(64, 0xaa);
      builder.setByte(-1, 0xaa);
    });

    it('should add bytes from array or Uint8Array', () => {
      const builder = new PacketBuilder();
      builder.addBytes(5, [1, 2, 3]);
      builder.addBytes(10, new Uint8Array([4, 5, 6]));

      const buffer = builder.build();
      expect(buffer[5]).toBe(1);
      expect(buffer[6]).toBe(2);
      expect(buffer[7]).toBe(3);
      expect(buffer[10]).toBe(4);
      expect(buffer[11]).toBe(5);
      expect(buffer[12]).toBe(6);
    });

    it('should set sequence ID with validation byte', () => {
      const builder = new PacketBuilder().setSequenceId(123);
      const buffer = builder.build();
      expect(buffer[6]).toBe(123);
      expect(buffer[7]).toBe(0x01); // Verification byte
    });
  });

  describe('Static Factory Methods', () => {
    it('should create dspWrite packet', () => {
      const builder = PacketBuilder.dspWrite(DspType.AMP, 5);
      const buffer = builder.build();

      expect(buffer[0]).toBe(OPCODES.DATA_PACKET);
      expect(buffer[1]).toBe(OPCODES.DATA_WRITE);
      expect(buffer[2]).toBe(DspType.AMP);
      expect(buffer[6]).toBe(5); // Sequence ID
    });

    it('should create applyChange packet', () => {
      const builder = PacketBuilder.applyChange(DspType.AMP, 10);
      const buffer = builder.build();

      expect(buffer[0]).toBe(OPCODES.DATA_PACKET);
      expect(buffer[1]).toBe(OPCODES.DATA_WRITE);
      expect(buffer[2]).toBe(0x00); // Apply Type
      expect(buffer[6]).toBe(10); // Sequence ID
      expect(buffer[4]).toBe(0x02); // Other Family (Not MOD)
    });

    it('should create applyChange packet for MOD', () => {
      const builder = PacketBuilder.applyChange(DspType.MOD, 10);
      const buffer = builder.build();
      expect(buffer[4]).toBe(0x01); // MOD Family
    });

    it('should create bypass packet', () => {
      // Slot 2, Enabled=true (0x00), Stomp (6 -> 3) behavior
      // Family = 6 (STOMP) - 3 = 3
      const builder = PacketBuilder.bypass(2, true, DspType.STOMP);
      const buffer = builder.build();

      expect(buffer[0]).toBe(OPCODES.BYPASS_PACKET);
      expect(buffer[1]).toBe(OPCODES.BYPASS_SET);
      expect(buffer[2]).toBe(3); // Family
      expect(buffer[3]).toBe(0x00); // Enabled = 0
      expect(buffer[4]).toBe(2); // Slot
    });

    it('should create savePreset packet', () => {
      const name = 'Test';
      const builder = PacketBuilder.savePreset(1, name);
      const buffer = builder.build();

      expect(buffer[0]).toBe(OPCODES.DATA_PACKET);
      expect(buffer[1]).toBe(OPCODES.DATA_READ);
      expect(buffer[4]).toBe(1); // Slot

      const decoder = new TextDecoder();
      const extractedName = decoder.decode(buffer.slice(16, 16 + 4));
      expect(extractedName).toBe(name);
    });

    it('should create loadPreset packet', () => {
      const builder = PacketBuilder.loadPreset(5);
      const buffer = builder.build();

      expect(buffer[0]).toBe(OPCODES.DATA_PACKET);
      expect(buffer[1]).toBe(OPCODES.DATA_READ);
      expect(buffer[2]).toBe(0x01);
      expect(buffer[4]).toBe(5);
    });
  });

  describe('State Serializers', () => {
    it('should serialize Amp State', () => {
      const ampState = {
        modelId: AMP_MODELS.F57_DELUXE.id,
        knobs: [1, 2, 3],
        cabinetId: 4,
      };

      const builder = PacketBuilder.fromAmpState(ampState, 1);
      const buffer = builder.build();

      expect(buffer[2]).toBe(DspType.AMP);
      expect(buffer[16]).toBe((ampState.modelId >> 8) & 0xff);
      expect(buffer[17]).toBe(ampState.modelId & 0xff);
      expect(buffer[49]).toBe(4);
      expect(buffer[32]).toBe(1);
      expect(buffer[33]).toBe(2);
      expect(buffer[34]).toBe(3);
    });

    it('should serialize Effect State', () => {
      const effectState = {
        type: DspType.STOMP,
        slot: 1,
        modelId: EFFECT_MODELS.OVERDRIVE.id,
        enabled: false,
        knobs: [10, 20],
      };

      const builder = PacketBuilder.fromEffectState(effectState, 1);
      const buffer = builder.build();

      expect(buffer[2]).toBe(DspType.STOMP);
      expect(buffer[18]).toBe(1); // Slot
      expect(buffer[16]).toBe((effectState.modelId >> 8) & 0xff);
      expect(buffer[17]).toBe(effectState.modelId & 0xff);
      expect(buffer[22]).toBe(1); // Enabled false -> 1
      expect(buffer[32]).toBe(10);
      expect(buffer[33]).toBe(20);
    });
  });
});
