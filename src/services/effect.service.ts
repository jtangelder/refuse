import { Injectable } from '@angular/core';
import { FuseService } from './fuse.service';

@Injectable({ providedIn: 'root' })
export class EffectService {
  constructor(private fuse: FuseService) {}

  get controller() {
    return this.fuse.api.effects;
  }

  setEffectById(slot: number, modelId: number) {
    return this.controller.setEffectById(slot, modelId);
  }

  setEffectEnabled(slot: number, enabled: boolean) {
    return this.controller.setEffectEnabled(slot, enabled);
  }

  swapEffects(slotA: number, slotB: number) {
    return this.controller.swapEffects(slotA, slotB);
  }

  clearEffect(slot: number) {
    return this.controller.clearEffect(slot);
  }

  setEffectKnob(slot: number, index: number, value: number) {
    return this.controller.setEffectKnob(slot, index, value);
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
