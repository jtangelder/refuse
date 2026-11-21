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

    it('should decode DUMP_COMPLETE end-of-dump ACK (0xff 0x01)', () => {
      const data = new Uint8Array(64);
      data[0] = 0xff;
      data[1] = 0x01;
      expect(ProtocolDecoder.decode(data)).toEqual({ type: 'DUMP_COMPLETE' });
    });

    it('should decode empty-name 0x1c 0x01 0x00 confirmation packet as PRESET_ACK', () => {
      const data = new Uint8Array(64);
      data[0] = 0x1c;
      data[1] = 0x01;
      data[2] = 0x00;
      data[3] = 0x00;
      data[OFFSETS.PRESET_SLOT] = 5;

      expect(ProtocolDecoder.decode(data)).toEqual({ type: 'PRESET_ACK', slot: 5 });
    });

    it('should decode real 0x05 0xc3 live hardware packets across all 5 DSP families (continuous & discrete)', () => {
      // AMP continuous Gain: 0x05 0xc3 0x02 <model> <idx=1> <idx2=1> <type=0x03> 0x00 <lo> <hi=180>
      const ampGain = new Uint8Array(64);
      ampGain.set([0x05, 0xc3, 0x02, 0x67, 0x00, 0x01, 0x01, 0x03, 0x00, 0x42, 180]);
      expect(ProtocolDecoder.decode(ampGain)).toEqual({
        type: 'KNOB_CHANGE',
        dspType: DspType.AMP,
        slot: 0,
        knobIndex: 1,
        value: 180,
      });

      // AMP discrete Cabinet (typeFlag 0x8e has bit 7 set -> value in byte[9], byte[10]=0x00)
      const ampCab = new Uint8Array(64);
      ampCab.set([0x05, 0xc3, 0x02, 0x67, 0x00, 0x11, 0x11, 0x8e, 0x00, 0x09, 0x00]);
      expect(ProtocolDecoder.decode(ampCab)).toEqual({
        type: 'KNOB_CHANGE',
        dspType: DspType.AMP,
        slot: 0,
        knobIndex: 17,
        value: 9,
      });

      // STOMP discrete Simple Comp Type (dsp=0x03 -> STOMP, typeFlag 0x92 -> value in byte[9])
      const simpleComp = new Uint8Array(64);
      simpleComp.set([0x05, 0xc3, 0x03, 0x07, 0x00, 0x00, 0x00, 0x92, 0x00, 0x02, 0x00]);
      expect(ProtocolDecoder.decode(simpleComp)).toEqual({
        type: 'KNOB_CHANGE',
        dspType: DspType.STOMP,
        slot: 0,
        knobIndex: 0,
        value: 2,
      });

      // MOD discrete Phaser Shape (dsp=0x04 -> MOD, typeFlag 0x8c -> value in byte[9])
      const phaserShape = new Uint8Array(64);
      phaserShape.set([0x05, 0xc3, 0x04, 0x4f, 0x00, 0x04, 0x04, 0x8c, 0x00, 0x01, 0x00]);
      expect(ProtocolDecoder.decode(phaserShape)).toEqual({
        type: 'KNOB_CHANGE',
        dspType: DspType.MOD,
        slot: 0,
        knobIndex: 4,
        value: 1,
      });

      // DELAY discrete Multitap Mode (dsp=0x05 -> DELAY, typeFlag 0x8b -> value in byte[9])
      const multitapMode = new Uint8Array(64);
      multitapMode.set([0x05, 0xc3, 0x05, 0x44, 0x00, 0x04, 0x04, 0x8b, 0x00, 0x03, 0x00]);
      expect(ProtocolDecoder.decode(multitapMode)).toEqual({
        type: 'KNOB_CHANGE',
        dspType: DspType.DELAY,
        slot: 0,
        knobIndex: 4,
        value: 3,
      });

      // REVERB continuous Level (dsp=0x06 -> REVERB, value in byte[10])
      const reverbLevel = new Uint8Array(64);
      reverbLevel.set([0x05, 0xc3, 0x06, 0x24, 0x00, 0x00, 0x00, 0x03, 0x00, 0x10, 145]);
      expect(ProtocolDecoder.decode(reverbLevel)).toEqual({
        type: 'KNOB_CHANGE',
        dspType: DspType.REVERB,
        slot: 0,
        knobIndex: 0,
        value: 145,
      });
    });

    it('should decode live hardware KnobChange when byte 1 is non-zero (e.g. 0x01 or 0xc3)', () => {
      const data = new Uint8Array(64);
      data[0] = DspType.AMP; // 0x05
      data[1] = 0xc3; // Non-zero hardware sub-byte
      data[OFFSETS.LIVE_KNOB_INDEX] = 1; // Gain
      data[OFFSETS.LIVE_KNOB_VALUE] = 180;

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('KNOB_CHANGE');
      if (command.type === 'KNOB_CHANGE') {
        expect(command.dspType).toBe(DspType.AMP);
        expect(command.knobIndex).toBe(1);
        expect(command.value).toBe(180);
      }
    });

    it('should reject truncated live KnobChange packets safely as UNKNOWN', () => {
      const data = new Uint8Array([DspType.AMP, 0xc3, 0x00, 0x00]);
      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('UNKNOWN');
    });

    it('should decode 0x1c 0x03 hardware DSP write packets for Amp and Effects while ignoring 0x1c 0x03 0x00 apply echoes', () => {
      const ampWrite = new Uint8Array(64);
      ampWrite[0] = 0x1c;
      ampWrite[1] = 0x03;
      ampWrite[2] = DspType.AMP;
      ampWrite[3] = 0x00;
      ampWrite[OFFSETS.MODEL_ID_MSB] = 0x67;
      ampWrite[OFFSETS.MODEL_ID_LSB] = 0x00;
      ampWrite[OFFSETS.CABINET_ID] = 0x01;
      ampWrite[OFFSETS.KNOB_START] = 140;

      const ampCmd = ProtocolDecoder.decode(ampWrite);
      expect(ampCmd.type).toBe('AMP_UPDATE');
      if (ampCmd.type === 'AMP_UPDATE') {
        expect(ampCmd.modelId).toBe(0x6700);
        expect(ampCmd.presetSlot).toBeUndefined();
      }

      const applyEcho = new Uint8Array(64);
      applyEcho[0] = 0x1c;
      applyEcho[1] = 0x03;
      applyEcho[2] = 0x00;
      expect(ProtocolDecoder.decode(applyEcho).type).toBe('UNKNOWN');
    });

    it('should decode 0x1c 0x01 0x01 preset selection notification as PRESET_CHANGE', () => {
      const data = new Uint8Array(64);
      data[0] = 0x1c;
      data[1] = 0x01;
      data[2] = 0x01;
      data[3] = 0x00;
      data[OFFSETS.PRESET_SLOT] = 9;

      const command = ProtocolDecoder.decode(data);
      expect(command.type).toBe('PRESET_CHANGE');
      if (command.type === 'PRESET_CHANGE') {
        expect(command.slot).toBe(9);
      }
    });

    it('should reject truncated 0x1c data packets and short/invalid 0x19 bypass responses as UNKNOWN', () => {
      expect(ProtocolDecoder.decode(new Uint8Array([0x1c, 0x01, DspType.AMP, 0x00])).type).toBe('UNKNOWN');
      expect(ProtocolDecoder.decode(new Uint8Array([0x1c, 0x01, DspType.STOMP, 0x00])).type).toBe('UNKNOWN');
      expect(ProtocolDecoder.decode(new Uint8Array([0x1c, 0x01, 0x04, 0x00, 0x01])).type).toBe('UNKNOWN');
      expect(ProtocolDecoder.decode(new Uint8Array([0x19, 0xc3, 0x00, 0x00])).type).toBe('UNKNOWN');
      // Out-of-range bypass slot (>= 8)
      expect(ProtocolDecoder.decode(new Uint8Array([0x19, 0xc3, 0x00, 0x00, 8])).type).toBe('UNKNOWN');
      // Out-of-range preset slot (> 99)
      const invalidPreset = new Uint8Array(64);
      invalidPreset[0] = 0x1c;
      invalidPreset[1] = 0x01;
      invalidPreset[2] = 0x04;
      invalidPreset[4] = 100;
      expect(ProtocolDecoder.decode(invalidPreset).type).toBe('UNKNOWN');
    });
  });
});
