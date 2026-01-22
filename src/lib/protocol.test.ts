import { describe, it, expect } from 'vitest';
import { FuseProtocol, OPCODES } from './protocol';
import { PacketParser } from './parser';
import { DspType } from './models';

describe('FuseProtocol', () => {
  const protocol = new FuseProtocol();

  describe('Packet Creation', () => {
    it('should create a correct DSP packet for Amp settings', () => {
      const packet = protocol.createDspPacket({
        type: DspType.AMP,
        slot: 0,
        modelId: 0x0067, // '57 Deluxe
        knobs: [100, 150, 200, 50, 75],
        bypass: false,
      });

      expect(packet[0]).toBe(OPCODES.DATA_PACKET);
      expect(packet[1]).toBe(OPCODES.DATA_WRITE);
      expect(packet[2]).toBe(DspType.AMP);
      expect(packet[16]).toBe(0x00);
      expect(packet[17]).toBe(0x67);
      expect(packet[18]).toBe(0); // Slot
      expect(packet[22]).toBe(0); // Active (not bypassed)
      expect(packet[32]).toBe(100);
      expect(packet[33]).toBe(150);
      expect(packet[34]).toBe(200);
      expect(packet[35]).toBe(50);
      expect(packet[36]).toBe(75);
    });

    it('should create a correct bypass toggle packet', () => {
      const packet = protocol.createBypassPacket(2, false, DspType.MOD);

      expect(packet[0]).toBe(OPCODES.BYPASS_PACKET);
      expect(packet[1]).toBe(OPCODES.BYPASS_SET);
      expect(packet[2]).toBe(DspType.MOD - 3); // Family mapping
      expect(packet[3]).toBe(0x01); // 1 = Off
      expect(packet[4]).toBe(2); // Slot
    });

    it('should create a correct preset load packet', () => {
      const packet = protocol.createPresetLoadPacket(10);

      expect(packet[0]).toBe(OPCODES.DATA_PACKET);
      expect(packet[1]).toBe(OPCODES.DATA_READ);
      expect(packet[2]).toBe(0x01);
      expect(packet[4]).toBe(10); // Slot
    });

    it('should create a correct preset save packet', () => {
      const name = 'My Cool Preset';
      const packet = protocol.createPresetSavePacket(5, name);

      expect(packet[0]).toBe(OPCODES.DATA_PACKET);
      expect(packet[1]).toBe(OPCODES.DATA_READ);
      expect(packet[2]).toBe(0x03);
      expect(packet[4]).toBe(5);

      // Name check
      // Name check
      const nameBytes = packet.slice(16, 48);
      const nullIndex = nameBytes.indexOf(0);
      const trimmed = nullIndex >= 0 ? nameBytes.slice(0, nullIndex) : nameBytes;
      const decodedName = new TextDecoder().decode(trimmed);
      expect(decodedName).toBe(name);
    });
  });

  describe('Static Parsing Methods', () => {
    it('should parse DSP data correctly', () => {
      const data = new Uint8Array(64);
      data[2] = DspType.STOMP;
      data[16] = 0x01;
      data[17] = 0x2a;
      data[18] = 3;
      data[22] = 1; // Bypassed
      data[32] = 128;
      data[33] = 64;

      const parsed = PacketParser.parseEffectSettings(data, 3);
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe(DspType.STOMP);
      expect(parsed?.modelId).toBe(0x012a);
      expect(parsed?.slot).toBe(3);
      expect(parsed?.enabled).toBe(false); // Bypassed=1 means Enabled=false
      expect(parsed?.knobs[0]).toBe(128);
      expect(parsed?.knobs[1]).toBe(64);
    });

    it('should detect and parse bypass response', () => {
      const data = new Uint8Array(64);
      data[0] = OPCODES.BYPASS_PACKET;
      data[1] = OPCODES.BYPASS_RESPONSE;
      data[3] = 0x00; // On
      data[4] = 1; // Slot

      expect(PacketParser.isBypassResponse(data)).toBe(true);
      const parsed = PacketParser.parseBypassResponse(data);
      expect(parsed?.slot).toBe(1);
      expect(parsed?.enabled).toBe(true);
    });

    it('should parse preset name from real hardware trace', () => {
      const rawData = [
        0x1c, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x42, 0x72,
        0x75, 0x74, 0x61, 0x6c, 0x20, 0x4d, 0x65, 0x74, 0x61, 0x6c, 0x20, 0x49, 0x49, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ];
      const data = new Uint8Array(rawData);

      const parsed = PacketParser.parsePresetInfo(data);
      expect(parsed).not.toBeNull();
      expect(parsed?.slot).toBe(0);
      expect(parsed?.name).toBe('Brutal Metal II');
    });

    it('should parse special character preset name from real hardware trace', () => {
      const rawData = [
        0x1c, 0x01, 0x04, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x57, 0x68,
        0x61, 0x74, 0x20, 0x74, 0x68, 0x65, 0x20, 0x23, 0x5e, 0x5b, 0x21, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ];
      const data = new Uint8Array(rawData);

      const parsed = PacketParser.parsePresetInfo(data);
      expect(parsed).not.toBeNull();
      expect(parsed?.slot).toBe(0x13); // 19
      expect(parsed?.name).toBe('What the #^[!');
    });
  });
});
