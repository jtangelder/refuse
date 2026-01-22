import { Injectable } from '@angular/core';
import { FuseService } from './fuse.service';

@Injectable({ providedIn: 'root' })
export class AmpService {
  constructor(private fuse: FuseService) {}

  get controller() {
    return this.fuse.api.amp;
  }

  setAmpModelById(modelId: number) {
    return this.controller.setAmpModelById(modelId);
  }

  setAmpKnob(index: number, value: number) {
    return this.controller.setAmpKnob(index, value);
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
