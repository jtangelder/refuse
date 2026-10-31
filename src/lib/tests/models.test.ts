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
