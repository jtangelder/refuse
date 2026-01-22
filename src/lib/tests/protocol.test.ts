import { describe, it, expect } from 'vitest';
import { Protocol, OPCODES } from '../protocol/protocol';
import { DspType } from '../models';
import { PacketBuilder } from '../protocol/packet_builder';

describe('FuseProtocol', () => {
  const protocol = new Protocol();

  describe('Packet Creation', () => {
    it('should create a correct DSP packet for Amp settings', () => {
      // PacketBuilder.fromAmpState? or generic dspWrite?
      // The original test created a manual object.
      // Let's use PacketBuilder.dspWrite + manual knobs to simulate the old test behaviour or just use fromAmpState if compatible.
      // PacketBuilder.fromAmpState requires an AmpState object.
      const state = {
        modelId: 0x0067,
        enabled: true,
        cabinetId: 0, // Default
        knobs: [100, 150, 200, 50, 75], // Rest zero
      };
      // Fill knobs to 32?
      while (state.knobs.length < 32) state.knobs.push(0);

      const packet = PacketBuilder.fromAmpState(state, 0x01).build();

      expect(packet[0]).toBe(OPCODES.DATA_PACKET);
      expect(packet[1]).toBe(OPCODES.DATA_WRITE);
      expect(packet[2]).toBe(DspType.AMP);
      expect(packet[16]).toBe(0x00);
      expect(packet[17]).toBe(0x67);
      // PacketBuilder fromAmpState puts cabinet at 49
      // expect(packet[49]).toBe(0);

      expect(packet[32]).toBe(100);
      expect(packet[33]).toBe(150);
      expect(packet[34]).toBe(200);
      expect(packet[35]).toBe(50);
      expect(packet[36]).toBe(75);
    });

    it('should create a correct bypass toggle packet', () => {
      const packet = PacketBuilder.bypass(2, false, DspType.MOD).build();

      expect(packet[0]).toBe(OPCODES.BYPASS_PACKET);
      expect(packet[1]).toBe(OPCODES.BYPASS_SET);
      expect(packet[2]).toBe(DspType.MOD - 3); // Family mapping
      expect(packet[3]).toBe(0x01); // 1 = Off
      expect(packet[4]).toBe(2); // Slot
    });

    it('should create a correct preset load packet', () => {
      const packet = PacketBuilder.loadPreset(10).build();

      expect(packet[0]).toBe(OPCODES.DATA_PACKET);
      expect(packet[1]).toBe(OPCODES.DATA_READ);
      expect(packet[2]).toBe(0x01);
      expect(packet[4]).toBe(10); // Slot
    });

    it('should create a correct preset save packet', () => {
      const name = 'My Cool Preset';
      const packet = PacketBuilder.savePreset(5, name).build();

      expect(packet[0]).toBe(OPCODES.DATA_PACKET);
      expect(packet[1]).toBe(OPCODES.DATA_READ);
      expect(packet[2]).toBe(0x03);
      expect(packet[4]).toBe(5);

      // Name check
      const nameBytes = packet.slice(16, 48);
      const nullIndex = nameBytes.indexOf(0);
      const trimmed = nullIndex >= 0 ? nameBytes.slice(0, nullIndex) : nameBytes;
      const decodedName = new TextDecoder().decode(trimmed);
      expect(decodedName).toBe(name);
    });
  });
});
