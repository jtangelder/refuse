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

  it('correctly maps hardware cabinet IDs to expected names and default amplifier pairings', () => {
    // Specific hardware ID mappings
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
    expect(findCabinetModel(0x0d)?.name).toBe("2x12 '57 Twin");
    expect(findCabinetModel(0x0e)?.name).toBe("2x12 '60s Thrift");
    expect(findCabinetModel(0x0f)?.name).toBe('4x12 British Watts');
    expect(findCabinetModel(0x10)?.name).toBe('4x12 British Colour');

    // Default cabinet pairings for all amplifiers
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
      [AMP_MODELS.F57_TWIN.id]: "2x12 '57 Twin",
      [AMP_MODELS.THRIFT_60S.id]: "2x12 '60s Thrift",
      [AMP_MODELS.BRIT_WATTS.id]: '4x12 British Watts',
      [AMP_MODELS.BRIT_COLOUR.id]: '4x12 British Colour',
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
});
