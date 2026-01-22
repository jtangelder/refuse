import { Injectable } from '@angular/core';
import { FuseService } from './fuse.service';

@Injectable({ providedIn: 'root' })
export class PresetService {
  constructor(private fuse: FuseService) {}

  get controller() {
    return this.fuse.api.presets;
  }

  loadPreset(slot: number) {
    return this.controller.loadPreset(slot);
  }

  savePreset(slot: number, name: string) {
    return this.controller.savePreset(slot, name);
  }

  loadXml(xmlString: string) {
    return this.controller.loadXml(xmlString);
  }

  getPresets() {
    return this.controller.getPresets();
  }

  getPreset(slot: number) {
    return this.controller.getPreset(slot);
  }
}
