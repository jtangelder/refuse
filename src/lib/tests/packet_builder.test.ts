import { describe, it, expect } from 'vitest';
import { PacketBuilder, PACKET_SIZE, truncateUtf8String } from '../protocol/packet_builder';
import { OPCODES } from '../protocol/constants';
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

      // Should not throw or corrupt buffer
      builder.setByte(64, 0xaa);
      builder.setByte(-1, 0xaa);
      expect(builder.build()).toEqual(new Uint8Array(64));
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
    it('should create dspWrite packet with fixed [0x01, 0x01] framing bytes', () => {
      const builder = PacketBuilder.dspWrite(DspType.AMP, 5);
      const buffer = builder.build();

      expect(buffer[0]).toBe(OPCODES.DATA_PACKET);
      expect(buffer[1]).toBe(OPCODES.DATA_WRITE);
      expect(buffer[2]).toBe(DspType.AMP);
      expect(buffer[6]).toBe(0x01);
      expect(buffer[7]).toBe(0x01);
    });

    it('should create pure execute/applyChange packet [0x1c, 0x03, 0x00, ...] with zeroed payload', () => {
      for (const dspType of [DspType.AMP, DspType.STOMP, DspType.MOD, DspType.DELAY, DspType.REVERB]) {
        const buffer = PacketBuilder.applyChange(dspType, 10).build();
        expect(buffer[0]).toBe(OPCODES.DATA_PACKET);
        expect(buffer[1]).toBe(OPCODES.DATA_WRITE);
        expect(Array.from(buffer.slice(2))).toEqual(new Array(62).fill(0));
      }
    });

    it('should build standard Mustang handshake packets (V1 0x03 and V2/MIII-V 0xc1)', () => {
      const hs1 = PacketBuilder.handshake1();
      expect(hs1.length).toBe(PACKET_SIZE);
      expect(hs1[0]).toBe(0x00);
      expect(hs1[1]).toBe(0xc3);
      expect(Array.from(hs1.slice(2))).toEqual(new Array(62).fill(0));

      const hs2V2 = PacketBuilder.handshake2();
      expect(hs2V2[0]).toBe(0x1a);
      expect(hs2V2[1]).toBe(0xc1);

      const hs2V1 = PacketBuilder.handshake2(OPCODES.HANDSHAKE_2_BYTE2_V1);
      expect(hs2V1[0]).toBe(0x1a);
      expect(hs2V1[1]).toBe(0x03);
    });

    it('should build clearEffect packet with family metadata bytes 19-21 and zero model ID', () => {
      const stompClear = PacketBuilder.clearEffect(DspType.STOMP, 0).build();
      expect(stompClear[2]).toBe(DspType.STOMP);
      expect(stompClear[6]).toBe(0x01);
      expect(stompClear[7]).toBe(0x01);
      expect(stompClear[16]).toBe(0x00);
      expect(stompClear[17]).toBe(0x00);
      expect(stompClear[18]).toBe(0);
      expect(Array.from(stompClear.slice(19, 22))).toEqual([0x00, 0x08, 0x01]);
      expect(stompClear[22]).toBe(0x00);

      const modClear = PacketBuilder.clearEffect(DspType.MOD, 4).build();
      expect(Array.from(modClear.slice(19, 22))).toEqual([0x00, 0x01, 0x01]);

      const delayClear = PacketBuilder.clearEffect(DspType.DELAY, 5).build();
      expect(Array.from(delayClear.slice(19, 22))).toEqual([0x02, 0x01, 0x01]);
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
    it('should serialize Amp State with per-amp metadata, discrete clamping, and noise-gate rules', () => {
      const knobs = new Array(32).fill(0);
      knobs[0] = 1;
      knobs[1] = 2;
      knobs[2] = 3;
      knobs[9] = 200; // Depth
      knobs[15] = 2; // Noise Gate (non-custom -> forces threshold=0, depth=0x80)
      knobs[16] = 7; // Threshold
      knobs[19] = 99; // Sag -> clamped to 2
      knobs[20] = 50; // Brightness -> clamped to 1

      const ampState = {
        modelId: AMP_MODELS.F57_DELUXE.id,
        knobs,
        cabinetId: 4,
      };

      const buffer = PacketBuilder.fromAmpState(ampState, 1).build();

      expect(buffer[2]).toBe(DspType.AMP);
      expect(buffer[16]).toBe((ampState.modelId >> 8) & 0xff);
      expect(buffer[17]).toBe(ampState.modelId & 0xff);
      expect(buffer[49]).toBe(4);
      expect(buffer[32]).toBe(1);
      expect(buffer[33]).toBe(2);
      expect(buffer[34]).toBe(3);
      // Non-custom noise gate enforces threshold=0x00 and depth=0x80
      expect(buffer[41]).toBe(0x80);
      expect(buffer[47]).toBe(2);
      expect(buffer[48]).toBe(0x00);
      // Discrete clamping
      expect(buffer[51]).toBe(2);
      expect(buffer[52]).toBe(1);
      // Per-amp '57 Deluxe firmware metadata bytes
      expect(buffer[40]).toBe(0x80);
      expect(buffer[43]).toBe(0x80);
      expect(Array.from(buffer.slice(44, 47))).toEqual([0x01, 0x01, 0x01]);
      expect(buffer[50]).toBe(0x01);
      expect(buffer[53]).toBe(0x01);
      expect(buffer[54]).toBe(0x53);

      // Custom noise gate (5) preserves depth and clamped threshold (0..9)
      const customKnobs = [...knobs];
      customKnobs[15] = 5;
      customKnobs[16] = 25; // clamped to 9
      const customBuf = PacketBuilder.fromAmpState(
        { modelId: AMP_MODELS.F65_DELUXE.id, knobs: customKnobs, cabinetId: 99 },
        1,
      ).build();
      expect(customBuf[41]).toBe(200);
      expect(customBuf[47]).toBe(5);
      expect(customBuf[48]).toBe(9);
      expect(customBuf[49]).toBe(0x0c); // Cabinet clamped to MAX_CABINET_ID
      // '65 Deluxe Reverb has b40=0x00, b43=0x00, num=0x03, b54=0x6a
      expect(customBuf[40]).toBe(0x00);
      expect(customBuf[43]).toBe(0x00);
      expect(Array.from(customBuf.slice(44, 47))).toEqual([0x03, 0x03, 0x03]);
      expect(customBuf[50]).toBe(0x03);
      expect(customBuf[54]).toBe(0x6a);
    });

    it('should serialize Effect State with wire metadata bytes 19-21 and discrete clamping', () => {
      const effectState = {
        type: DspType.STOMP,
        slot: 1,
        modelId: EFFECT_MODELS.ORANGE_BOX.id,
        enabled: false,
        knobs: [10, 20],
      };

      const buffer = PacketBuilder.fromEffectState(effectState, 1).build();

      expect(buffer[2]).toBe(DspType.STOMP);
      expect(buffer[16]).toBe(0x10);
      expect(buffer[17]).toBe(0x01);
      expect(buffer[18]).toBe(1); // Slot
      expect(Array.from(buffer.slice(19, 22))).toEqual([0x00, 0x08, 0x01]);
      expect(buffer[22]).toBe(1); // Enabled false -> 1
      expect(buffer[32]).toBe(10);
      expect(buffer[33]).toBe(20);

      // Mod & Delay wire metadata + discrete knob clamping (Multitap Mode max=3)
      const modBuf = PacketBuilder.fromEffectState({
        type: DspType.MOD,
        slot: 4,
        modelId: EFFECT_MODELS.TOUCH_WAH_MOD.id,
        enabled: true,
        knobs: [100, 100, 100, 100, 50], // High Q (idx 4) clamped to 0..1
      }).build();
      expect(Array.from(modBuf.slice(19, 22))).toEqual([0x01, 0x08, 0x01]);
      expect(modBuf[32 + 4]).toBe(1);

      const delayBuf = PacketBuilder.fromEffectState({
        type: DspType.DELAY,
        slot: 5,
        modelId: EFFECT_MODELS.MULTITAP_DELAY.id,
        enabled: true,
        knobs: [128, 128, 128, 128, 99], // Mode (idx 4) clamped to 0..3
      }).build();
      expect(Array.from(delayBuf.slice(19, 22))).toEqual([0x02, 0x01, 0x01]);
      expect(delayBuf[32 + 4]).toBe(3);
    });

    it('should pad control packets to full 64-byte HID report size', () => {
      expect(PacketBuilder.handshake1().length).toBe(PACKET_SIZE);
      expect(PacketBuilder.handshake2().length).toBe(PACKET_SIZE);
      expect(PacketBuilder.requestState().length).toBe(PACKET_SIZE);
      expect(PacketBuilder.requestBypassStates().length).toBe(PACKET_SIZE);
    });

    it('should truncate multi-byte UTF-8 preset names cleanly without splitting code points', () => {
      // 31 ASCII bytes + 1 two-byte UTF-8 char ('ü' = 0xc3 0xbc) = 33 bytes -> must drop 'ü', not emit 0xc3
      const name = 'a'.repeat(31) + 'ü';
      expect(truncateUtf8String(name, 32)).toBe('a'.repeat(31));

      const packet = PacketBuilder.savePreset(0, name).build();
      const rawName = packet.slice(16, 48);
      const nullIdx = rawName.indexOf(0);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
        nullIdx !== -1 ? rawName.slice(0, nullIdx) : rawName,
      );
      expect(decoded).toBe('a'.repeat(31));
    });

    it('should reject DspType.AMP in PacketBuilder.bypass()', () => {
      expect(() => PacketBuilder.bypass(0, true, DspType.AMP)).toThrow(/Invalid effect DSP type/);
    });
  });
});
