import { computed, Injectable, signal } from '@angular/core';
import { FuseAPI } from '../lib';

@Injectable({ providedIn: 'root' })
export class FuseService {
  public api = new FuseAPI();
  public state = signal(this.api.store.getState());

  public connected = computed(() => this.state().connected);
  public amp = computed(() => this.state().amp);
  public effects = computed(() => this.state().slots);
  public presets = computed(() => this.state().presets);
  public currentPresetSlot = computed(() => this.state().currentPresetSlot);

  constructor() {
    this.api.store.subscribe(state => {
      this.state.set({ ...state });
    });
  }

  connect() {
    return this.api.connect();
  }

  disconnect() {
    return this.api.disconnect();
  }

  isSupported() {
    return this.api.isSupported;
  }

  public loadPresetFile(xmlString: string) {
    return this.api.presets.loadXml(xmlString);
  }
}
