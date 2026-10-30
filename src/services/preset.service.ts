import { computed, inject, Injectable } from '@angular/core';
import { FuseService } from './fuse.service';
import type { PresetDetails } from '../lib';

@Injectable({ providedIn: 'root' })
export class PresetService {
  private readonly fuse = inject(FuseService);

  readonly maxSlot = computed(() => {
    const presets = this.fuse.presets();
    let max = 23;
    for (const key of presets.keys()) {
      if (key > max) max = key;
    }
    return max;
  });

  readonly allSlots = computed(() => {
    return Array.from({ length: this.maxSlot() + 1 }, (_, i) => i);
  });

  readonly currentPresetName = computed(() => {
    const slot = this.fuse.currentPresetSlot();
    if (slot === null || slot === undefined) return "'65 Deluxe Reverb";
    return this.fuse.presets().get(slot)?.name || `Preset ${slot + 1}`;
  });

  get controller() {
    return this.fuse.api.presets;
  }

  loadPreset(slot: number) {
    return this.controller.loadPreset(slot);
  }

  savePreset(slot: number, name: string) {
    return this.controller.savePreset(slot, name);
  }

  loadPresetFromXml(xmlString: string) {
    return this.fuse.api.loadPresetFromXml(xmlString);
  }

  exportPresetToXml(presetName?: string) {
    return this.fuse.api.exportPresetToXml(presetName);
  }

  updatePresetDetails(details: Partial<PresetDetails>) {
    this.fuse.api.updatePresetDetails(details);
  }

  getPresets() {
    return this.controller.getPresets();
  }

  getPreset(slot: number) {
    return this.controller.getPreset(slot);
  }
}
