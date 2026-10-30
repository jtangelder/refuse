import { computed, inject, Injectable } from '@angular/core';
import { FuseService } from './fuse.service';
import type { AdvancedAmpParam } from '../lib';

@Injectable({ providedIn: 'root' })
export class AmpService {
  private readonly fuse = inject(FuseService);

  get controller() {
    return this.fuse.api.amp;
  }

  readonly settings = computed(() => {
    this.fuse.amp();
    return this.controller.getSettings();
  });

  readonly knobs = computed(() => {
    this.fuse.amp();
    return this.controller.getAmpKnobs();
  });

  setAmpModelById(modelId: number) {
    return this.controller.setAmpModelById(modelId);
  }

  setAmpKnob(index: number, value: number) {
    return this.controller.setAmpKnob(index, value);
  }

  setAdvancedSetting(key: AdvancedAmpParam, value: number) {
    return this.controller.setAdvancedSetting(key, value);
  }

  setCabinetById(id: number) {
    return this.controller.setCabinetById(id);
  }

  getAmpModel() {
    return this.controller.getAmpModel();
  }

  getAmpKnobs() {
    return this.controller.getAmpKnobs();
  }

  getSettings() {
    return this.controller.getSettings();
  }

  getCabinet() {
    return this.controller.getCabinet();
  }
}
