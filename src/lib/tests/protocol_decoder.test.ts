import { describe, it, expect } from 'vitest';
import { ProtocolDecoder } from '../protocol/protocol_decoder';
import { OFFSETS, VALUES } from '../protocol/constants';
import { DspType } from '../models';

describe('ProtocolDecoder', () => {
  describe('decode', () => {
    it('should decode a KnobChange command', () => {
      const data = new Uint8Array(64);
      data[0] = DspType.STOMP; // 6
      data[1] = 0x00;
      data[13] = 2; // Slot
      data[5] = 1; // Param Index
      data[10] = 50; // Value

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('KNOB_CHANGE');
      if (command.type === 'KNOB_CHANGE') {
        expect(command.slot).toBe(2);
        expect(command.knobIndex).toBe(1);
        expect(command.value).toBe(50);
        expect(command.dspType).toBe(DspType.STOMP);
      }
    });

    it('should decode an Amp KnobChange command', () => {
      const data = new Uint8Array(64);
      data[0] = DspType.AMP; // 5
      data[1] = 0x00;
      data[5] = 4; // Treble?
      data[10] = 80;

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('KNOB_CHANGE');
      if (command.type === 'KNOB_CHANGE') {
        expect(command.dspType).toBe(DspType.AMP);
        expect(command.knobIndex).toBe(4);
        expect(command.value).toBe(80);
      }
    });

    it('should decode an Amp Update command', () => {
      const data = new Uint8Array(64);
      data[0] = 0x1c;
      data[1] = 0x01;
      data[2] = DspType.AMP;
      data[3] = 0x00; // Instance must be 0x00
      data[OFFSETS.MODEL_ID_MSB] = 0x00;
      data[OFFSETS.MODEL_ID_LSB] = 0x67;
      data[OFFSETS.CABINET_ID] = 5;
      data[32] = 100; // Knob 1

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('AMP_UPDATE');
      if (command.type === 'AMP_UPDATE') {
        expect(command.modelId).toBe(0x0067);
        expect(command.cabinetId).toBe(5);
        expect(command.knobs[0]).toBe(100);
      }
    });

    it('should ignore Amp Update with non-zero instance', () => {
      const data = new Uint8Array(64);
      data[0] = 0x1c;
      data[1] = 0x01;
      data[2] = DspType.AMP;
      data[3] = 0x01; // Instance 1

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('UNKNOWN');
    });

    it('should decode an Effect Update command', () => {
      const data = new Uint8Array(64);
      // Header: 1c 01 [type] [instance]
      data[0] = 0x1c;
      data[1] = 0x01;
      data[2] = DspType.DELAY;
      data[3] = 0x00; // Active instance

      data[OFFSETS.SLOT_INDEX] = 3;
      data[OFFSETS.MODEL_ID_MSB] = 0x01;
      data[OFFSETS.MODEL_ID_LSB] = 0x10;
      data[OFFSETS.BYPASS] = VALUES.BYPASSED; // 1
      data[32] = 255;

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('EFFECT_UPDATE');
      if (command.type === 'EFFECT_UPDATE') {
        expect(command.slot).toBe(3);
        expect(command.dspType).toBe(DspType.DELAY);
        expect(command.modelId).toBe(0x0110);
        expect(command.enabled).toBe(false);
        expect(command.knobs[0]).toBe(255);
      }
    });

    it('should decode Preset Info', () => {
      const data = new Uint8Array(64);
      data[0] = 0x1c;
      data[1] = 0x01;
      data[2] = 0x04; // Preset Info
      data[3] = 0x00;
      data[OFFSETS.PRESET_SLOT] = 10;

      const name = 'Müstang!';
      const nameBytes = new TextEncoder().encode(name);
      data.set(nameBytes, OFFSETS.PRESET_NAME);

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('PRESET_INFO');
      if (command.type === 'PRESET_INFO') {
        expect(command.slot).toBe(10);
        expect(command.name).toBe(name);
      }
    });

    it('should decode Preset Info (Simple ASCII)', () => {
      const data = new Uint8Array(64);
      data[0] = 0x1c;
      data[1] = 0x01;
      data[2] = 0x04; // Preset Info
      data[3] = 0x00;
      data[OFFSETS.PRESET_SLOT] = 10;

      const name = 'Test Preset';
      const nameBytes = new TextEncoder().encode(name);
      data.set(nameBytes, OFFSETS.PRESET_NAME);

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('PRESET_INFO');
      if (command.type === 'PRESET_INFO') {
        expect(command.slot).toBe(10);
        expect(command.name).toBe(name);
      }
    });

    it('should decode Preset Change', () => {
      const data = new Uint8Array(64);
      data[0] = 0x1c;
      data[1] = 0x01;
      data[2] = 0x00; // Preset Change
      data[3] = 0x00;
      data[OFFSETS.PRESET_SLOT] = 5;

      const name = 'Changed Preset';
      const nameBytes = new TextEncoder().encode(name);
      data.set(nameBytes, OFFSETS.PRESET_NAME);

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('PRESET_CHANGE');
      if (command.type === 'PRESET_CHANGE') {
        expect(command.slot).toBe(5);
        expect(command.name).toBe(name);
      }
    });

    it('should decode Bypass State response', () => {
      const data = new Uint8Array(64);
      data[0] = 0x19;
      data[1] = 0xc3;
      data[3] = VALUES.ENABLED; // 0
      data[4] = 7; // Slot

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('BYPASS_STATE');
      if (command.type === 'BYPASS_STATE') {
        expect(command.slot).toBe(7);
        expect(command.enabled).toBe(true);
      }
    });
  });
});
