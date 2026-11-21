import { describe, it, expect } from 'vitest';
import {
  AMP_MODELS,
  CABINET_MODELS,
  EFFECT_MODELS,
  DspType,
  findAmpModel,
  findCabinetModel,
  findEffectModel,
  getDelayTimeKnobIndex,
  resolveFuseModelId,
  isWideEffect,
  isRackUnit,
  getEffectFormFactor,
  WIDE_EFFECT_MODELS,
  RACK_EFFECT_MODELS,
} from '../models';
import { getModelDefault } from '../defaults';
import { OFFSETS } from '../protocol/constants';
import { PACKET_SIZE } from '../protocol/packet_builder';

describe('Model Registry & Hardware Defaults Integrity', () => {
  it('registers all AMP_MODELS with unique IDs, valid 64-byte defaults, and FUSE ID mappings', () => {
    const seenIds = new Set<number>();
    for (const model of Object.values(AMP_MODELS)) {
      expect(model.type).toBe(DspType.AMP);
      expect(seenIds.has(model.id)).toBe(false);
      seenIds.add(model.id);

      expect(findAmpModel(model.id)).toBe(model);

      const defaults = getModelDefault(model.id);
      expect(defaults).toBeDefined();
      expect(defaults?.length).toBe(PACKET_SIZE);

      expect(model.fuseIds?.length).toBeGreaterThan(0);
      for (const fuseId of model.fuseIds ?? []) {
        expect(resolveFuseModelId(fuseId, DspType.AMP)).toBe(model.id);
      }
    }
  });

  it('registers all EFFECT_MODELS with unique IDs, valid 64-byte defaults, and FUSE ID mappings', () => {
    const seenIds = new Set<number>();
    for (const model of Object.values(EFFECT_MODELS)) {
      expect(model.type).toBeGreaterThanOrEqual(DspType.STOMP);
      expect(model.type).toBeLessThanOrEqual(DspType.REVERB);
      expect(seenIds.has(model.id)).toBe(false);
      seenIds.add(model.id);

      expect(findEffectModel(model.id)).toBe(model);

      const defaults = getModelDefault(model.id);
      expect(defaults).toBeDefined();
      expect(defaults?.length).toBe(PACKET_SIZE);

      const exportedFuseId = model.fuseIds?.[0] ?? model.id;
      expect(resolveFuseModelId(exportedFuseId, model.type)).toBe(model.id);
      for (const fuseId of model.fuseIds ?? []) {
        expect(resolveFuseModelId(fuseId, model.type)).toBe(model.id);
      }
    }
  });

  it('resolves Delay Time knob index for every Delay effect model', () => {
    const delayModels = Object.values(EFFECT_MODELS).filter(m => m.type === DspType.DELAY);
    expect(delayModels.length).toBe(9);

    for (const model of delayModels) {
      const idx = getDelayTimeKnobIndex(model.id);
      expect(idx).not.toBeNull();
      expect(idx!).toBeGreaterThanOrEqual(0);
      expect(idx!).toBeLessThan(model.knobs.length);
    }
  });

  it('registers all CABINET_MODELS with unique IDs', () => {
    const seenIds = new Set<number>();
    for (const cab of CABINET_MODELS) {
      expect(seenIds.has(cab.id)).toBe(false);
      seenIds.add(cab.id);
      expect(findCabinetModel(cab.id)).toEqual(cab);
    }
    expect(findCabinetModel(0xff)).toBeNull();
  });

  it('correctly maps hardware cabinet IDs (0x00-0x0c) to expected names and default amplifier pairings', () => {
    expect(CABINET_MODELS.length).toBe(13);

    // Specific hardware ID mappings (0x00-0x0c)
    expect(findCabinetModel(0x00)?.name).toBe('Off');
    expect(findCabinetModel(0x01)?.name).toBe("1x12 '57 Deluxe");
    expect(findCabinetModel(0x02)?.name).toBe("4x10 '59 Bassman");
    expect(findCabinetModel(0x03)?.name).toBe("1x12 '65 Deluxe");
    expect(findCabinetModel(0x04)?.name).toBe("1x10 '65 Princeton");
    expect(findCabinetModel(0x05)?.name).toBe("1x8 '57 Champ");
    expect(findCabinetModel(0x06)?.name).toBe("4x12 British '80s");
    expect(findCabinetModel(0x07)?.name).toBe("2x12 British '60s");
    expect(findCabinetModel(0x08)?.name).toBe("4x12 British '70s");
    expect(findCabinetModel(0x09)?.name).toBe("2x12 '65 Twin");
    expect(findCabinetModel(0x0a)?.name).toBe("4x12 American '90s");
    expect(findCabinetModel(0x0b)?.name).toBe('2x12 Super-Sonic');
    expect(findCabinetModel(0x0c)?.name).toBe('1x12 Super-Sonic');

    // Out-of-range cabinet IDs (> 0x0c) do not exist in Mustang V1/V2 firmware
    expect(findCabinetModel(0x0d)).toBeNull();
    expect(findCabinetModel(0x0e)).toBeNull();
    expect(findCabinetModel(0x0f)).toBeNull();
    expect(findCabinetModel(0x10)).toBeNull();

    // Default cabinet pairings for all amplifiers (including V2 pcaps)
    const expectedPairings: Record<number, string> = {
      [AMP_MODELS.F57_DELUXE.id]: "1x12 '57 Deluxe",
      [AMP_MODELS.F59_BASSMAN.id]: "4x10 '59 Bassman",
      [AMP_MODELS.F57_CHAMP.id]: "1x8 '57 Champ",
      [AMP_MODELS.F65_DELUXE.id]: "1x12 '65 Deluxe",
      [AMP_MODELS.F65_PRINCETON.id]: "1x10 '65 Princeton",
      [AMP_MODELS.F65_TWIN.id]: "2x12 '65 Twin",
      [AMP_MODELS.SUPER_SONIC.id]: '1x12 Super-Sonic',
      [AMP_MODELS.BRIT_60S.id]: "2x12 British '60s",
      [AMP_MODELS.BRIT_70S.id]: "4x12 British '70s",
      [AMP_MODELS.BRIT_80S.id]: "4x12 British '80s",
      [AMP_MODELS.US_90S.id]: "4x12 American '90s",
      [AMP_MODELS.METAL_2000.id]: "4x12 British '70s",
      [AMP_MODELS.STUDIO_PREAMP.id]: 'Off',
      [AMP_MODELS.F57_TWIN.id]: "2x12 '65 Twin",
      [AMP_MODELS.THRIFT_60S.id]: "1x12 '57 Deluxe",
      [AMP_MODELS.BRIT_WATTS.id]: "4x12 American '90s",
      [AMP_MODELS.BRIT_COLOUR.id]: "4x12 British '70s",
    };

    for (const [ampIdStr, expectedCabName] of Object.entries(expectedPairings)) {
      const ampId = Number(ampIdStr);
      const defaults = getModelDefault(ampId);
      expect(defaults).toBeDefined();
      const cabId = defaults![OFFSETS.CABINET_ID];
      const cab = findCabinetModel(cabId);
      expect(cab?.name).toBe(expectedCabName);
    }
  });

  it('registers Orange Box (0x1001), Ranger Boost 4 knobs, and V2 Mod effects accurately', () => {
    expect(EFFECT_MODELS.ORANGE_BOX.id).toBe(0x1001);
    const orangeDefaults = getModelDefault(EFFECT_MODELS.ORANGE_BOX.id);
    expect(orangeDefaults?.[OFFSETS.MODEL_ID_MSB]).toBe(0x10);
    expect(orangeDefaults?.[OFFSETS.MODEL_ID_LSB]).toBe(0x01);

    expect(EFFECT_MODELS.RANGER_BOOST.knobs.filter(Boolean)).toEqual(['Level', 'Gain', 'Lo-Cut', 'Bright']);
    expect(EFFECT_MODELS.WAH_MOD.id).toBe(0xf400);
    expect(EFFECT_MODELS.TOUCH_WAH_MOD.id).toBe(0xf500);
    expect(EFFECT_MODELS.DIATONIC_PITCH_SHIFTER.id).toBe(0x1f10);
    expect(EFFECT_MODELS.DIATONIC_PITCH_SHIFTER.knobs.filter(Boolean)).toEqual(['Mix', 'Pitch', 'Key', 'Scale', 'Tone']);
  });

  it('correctly classifies hardware form factors from model references without magic bitcodes', () => {
    // Wide effects
    expect(WIDE_EFFECT_MODELS.length).toBe(5);
    for (const model of WIDE_EFFECT_MODELS) {
      expect(isWideEffect(model)).toBe(true);
      expect(isWideEffect(model.id)).toBe(true);
      expect(getEffectFormFactor(model)).toBe('wide');
      expect(getEffectFormFactor(model.id)).toBe('wide');
      expect(isRackUnit(model.id)).toBe(false);
    }

    // Rack units
    expect(RACK_EFFECT_MODELS.length).toBe(2);
    for (const model of RACK_EFFECT_MODELS) {
      expect(isRackUnit(model)).toBe(true);
      expect(isRackUnit(model.id)).toBe(true);
      expect(getEffectFormFactor(model)).toBe('rack');
      expect(getEffectFormFactor(model.id)).toBe('rack');
      expect(isWideEffect(model.id)).toBe(false);
    }

    // Standard pedals
    expect(isWideEffect(EFFECT_MODELS.OVERDRIVE)).toBe(false);
    expect(isWideEffect(EFFECT_MODELS.OVERDRIVE.id)).toBe(false);
    expect(isRackUnit(EFFECT_MODELS.GREEN_BOX.id)).toBe(false);
    expect(getEffectFormFactor(EFFECT_MODELS.ORANGE_BOX)).toBe('standard');
    expect(getEffectFormFactor(null)).toBe('standard');
    expect(isWideEffect(undefined)).toBe(false);
    expect(isRackUnit(undefined)).toBe(false);
  });

  it('prioritizes official Fender FUSE decimal IDs over legacy ordinals and scopes by DspType', () => {
    // Official Fender FUSE little-endian decimal IDs (regression: 100 was previously hijacked by Studio Preamp)
    expect(resolveFuseModelId(100, DspType.AMP)).toBe(AMP_MODELS.F59_BASSMAN.id);
    expect(resolveFuseModelId(103, DspType.AMP)).toBe(AMP_MODELS.F57_DELUXE.id);
    expect(resolveFuseModelId(241, DspType.AMP)).toBe(AMP_MODELS.STUDIO_PREAMP.id);
    expect(resolveFuseModelId(272, DspType.STOMP)).toBe(EFFECT_MODELS.ORANGE_BOX.id);
    expect(resolveFuseModelId(244, DspType.MOD)).toBe(EFFECT_MODELS.WAH_MOD.id);
    expect(resolveFuseModelId(245, DspType.MOD)).toBe(EFFECT_MODELS.TOUCH_WAH_MOD.id);
    expect(resolveFuseModelId(287, DspType.MOD)).toBe(EFFECT_MODELS.DIATONIC_PITCH_SHIFTER.id);

    // 42 is Small Hall in REVERB, whereas 0x2a (42 decimal) is Stereo Tape Delay in DELAY
    expect(resolveFuseModelId(42, DspType.REVERB)).toBe(EFFECT_MODELS.SMALL_HALL.id);
    expect(resolveFuseModelId(42, DspType.DELAY)).toBe(EFFECT_MODELS.STEREO_TAPE_DELAY.id);

    // Legacy FUSE IDs 67, 68, 69 resolve to Mono Echo Filter, Multitap Delay, Ping Pong Delay
    expect(resolveFuseModelId(67, DspType.DELAY)).toBe(EFFECT_MODELS.MONO_ECHO_FILTER.id);
    expect(resolveFuseModelId(68, DspType.DELAY)).toBe(EFFECT_MODELS.MULTITAP_DELAY.id);
    expect(resolveFuseModelId(69, DspType.DELAY)).toBe(EFFECT_MODELS.PING_PONG_DELAY.id);

    // Effect IDs must not resolve as AMP models (and vice-versa)
    expect(resolveFuseModelId(19, DspType.AMP)).toBeNull();
    expect(resolveFuseModelId(EFFECT_MODELS.OVERDRIVE.id, DspType.DELAY)).toBeNull();
  });
});
