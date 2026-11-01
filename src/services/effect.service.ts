import { computed, inject, Injectable } from '@angular/core';
import { FuseService } from './fuse.service';
import type { SetEffectOptions } from '../lib';

@Injectable({ providedIn: 'root' })
export class EffectService {
  private readonly fuse = inject(FuseService);

  readonly allSettings = computed(() => {
    this.fuse.effects();
    return Array.from({ length: 8 }, (_, i) => this.controller.getSettings(i));
  });

  get controller() {
    return this.fuse.api.effects;
  }

  setEffectById(slot: number, modelId: number) {
    return this.controller.setEffectById(slot, modelId);
  }

  setEffect(slot: number, modelId: number, options?: SetEffectOptions) {
    return this.controller.setEffect(slot, modelId, options);
  }

  setEffectEnabled(slot: number, enabled: boolean) {
    return this.controller.setEffectEnabled(slot, enabled);
  }

  moveEffect(fromSlot: number, toSlot: number) {
    return this.controller.moveEffect(fromSlot, toSlot);
  }

  swapEffects(slotA: number, slotB: number) {
    return this.controller.swapEffects(slotA, slotB);
  }

  replaceAllEffects(
    effects: ReadonlyArray<{
      slot: number;
      modelId: number;
      enabled?: boolean;
      knobs?: ReadonlyArray<{ index: number; value: number }>;
    }>,
  ) {
    return this.controller.replaceAllEffects(effects);
  }

  clearEffect(slot: number) {
    return this.controller.clearEffect(slot);
  }

  setEffectKnob(slot: number, index: number, value: number) {
    return this.controller.setEffectKnob(slot, index, value);
  }

  setDelayTempoBpm(bpm: number) {
    return this.controller.setDelayTempoBpm(bpm);
  }

  getEffectModel(slot: number) {
    return this.controller.getEffectModel(slot);
  }

  getSettings(slot: number) {
    return this.controller.getSettings(slot);
  }

  getEffectKnobs(slot: number) {
    return this.controller.getEffectKnobs(slot);
  }

  getEffectModelId(slot: number) {
    return this.controller.getEffectModelId(slot);
  }
}
