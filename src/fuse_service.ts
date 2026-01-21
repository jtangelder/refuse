import { computed, Injectable, signal } from '@angular/core';
import { FuseAPI } from './lib/api';

@Injectable({ providedIn: 'root' })
export class FuseService {
  public api = new FuseAPI();
  private _state = signal(this.api.store.getState());

  public connected = computed(() => this._state().connected);
  public amp = computed(() => this._state().amp);
  public effects = computed(() => this._state().slots);
  public presets = computed(() => this._state().presets);
  public currentPresetSlot = computed(() => this._state().currentPresetSlot);

  constructor() {
    this.api.store.subscribe(state => {
      this._state.set({ ...state });
    });
  }

  loadPresetFile(xmlString: string) {
    return this.api.presets.loadXml(xmlString);
  }
}
