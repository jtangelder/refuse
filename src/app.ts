import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, signal } from "@angular/core";
import { MustangAPI, AMP_MODELS, EFFECT_MODELS, CABINET_MODELS, DspType } from "./lib2/api";
import { FuseLoader } from "./lib2/loader";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar" style="padding: 10px; border-bottom: 2px solid #333; margin-bottom: 20px;">
      <button (click)="connect()">Connect to Mustang</button>
      <input type="file" (change)="loadPreset($event)" />
      <span>Connected: {{ api.isConnected }}</span>
      
      <span *ngIf="api.isConnected" style="margin-left: 20px;">
        <label>Preset Slot: </label>
        <select [ngModel]="api.currentPresetSlot" (ngModelChange)="changePreset($event)">
          <option *ngFor="let i of range(24)" [value]="i">
            {{ i }}: {{ api.presets.get(i)?.name || 'Preset ' + i }}
          </option>
        </select>
      </span>
    </div>

    <section *ngIf="api.isConnected" style="max-width: 1200px; margin: 0 auto;">
      <div *ngIf="getAmpSettings() as amp" style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h2 style="margin: 0;">Amp: 
            <select [ngModel]="amp.model" (ngModelChange)="changeAmp($event)">
              <option *ngFor="let model of ampModels" [value]="model.name">{{ model.name }}</option>
            </select>
          </h2>
          <div>
            <label>Cabinet: </label>
            <select [ngModel]="api.getCabinet()?.name" (ngModelChange)="changeCabinet($event)">
              <option *ngFor="let cab of cabModels" [value]="cab.name">{{ cab.name }}</option>
            </select>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px;">
          <div *ngFor="let knob of (getAmpKnobs() | keyvalue)" style="display: flex; flex-direction: column;">
            <label style="font-size: 0.8em; color: #666;">{{ knob.key }}</label>
            <input type="range" min="0" max="255" [value]="knob.value" (input)="changeAmpKnob(knob.key, $event)" />
            <span style="font-size: 0.7em; text-align: center;">{{ knob.value }}</span>
          </div>
        </div>

        <details style="margin-top: 15px; border-top: 1px solid #ddd; padding-top: 10px;">
          <summary style="font-size: 0.9em; cursor: pointer; color: #555;">Advanced Amp Settings</summary>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-top: 10px;">
            <div *ngFor="let setting of advancedSettings" style="display: flex; flex-direction: column;">
              <label style="font-size: 0.75em; color: #777;">{{ setting.label }}</label>
              <input type="range" min="0" max="255" [value]="amp[setting.key]" (input)="changeAdvancedSetting(setting.key, $event)" />
              <span style="font-size: 0.7em; text-align: center;">{{ amp[setting.key] }}</span>
            </div>
          </div>
        </details>
      </div>

      <h3>Effects Chain:</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;">
        <div *ngFor="let family of effectFamilies" 
             style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: white;"
             [style.border-left]="'10px solid ' + getFamilyColor(family.type)">
          
          <div style="margin-bottom: 12px;">
            <strong style="display: block; font-size: 0.9em; text-transform: uppercase; color: #666; margin-bottom: 5px;">
              {{ family.label }} ({{ getModelsForFamily(family.type).length }} models found)
            </strong>
            
            <div style="display: flex; gap: 10px; align-items: center;">
              <select [ngModel]="getEffectForFamily(family.type)?.model || 'None'" 
                      (ngModelChange)="changeEffectByFamily(family.type, $event)"
                      style="flex: 1; padding: 5px;">
                <option value="None">-- Empty slot --</option>
                <option *ngFor="let model of getModelsForFamily(family.type)" [value]="model.name">{{ model.name }}</option>
              </select>

              <div *ngIf="getEffectForFamily(family.type)" style="display: flex; align-items: center; gap: 5px;">
                <label style="font-size: 0.8em; white-space: nowrap;">Slot: </label>
                <select [ngModel]="getSlotForFamily(family.type)" 
                        (ngModelChange)="moveEffect(family.type, $event)"
                        style="padding: 2px;">
                  <option *ngFor="let i of range(8)" [value]="i">{{ i }}</option>
                </select>
              </div>
            </div>
          </div>

          <div *ngIf="getEffectForFamily(family.type) as effect">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
              <label style="font-size: 0.9em; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" [ngModel]="effect.enabled" (ngModelChange)="toggleEffect(effect.slot, $event)" />
                <span>{{ effect.enabled ? 'Active' : 'Bypassed' }}</span>
              </label>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div *ngFor="let knob of (effect.knobs | keyvalue)" style="display: flex; flex-direction: column;">
                <label style="font-size: 0.7em; color: #777;">{{ knob.key }}</label>
                <input type="range" min="0" max="255" [value]="knob.value" (input)="changeEffectKnob(effect.slot, knob.key, $event)" />
                <span style="font-size: 0.7em; text-align: center; color: #999;">{{ knob.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div *ngIf="!api.isConnected" style="text-align: center; padding: 50px;">
      <h2>Mustang Controller</h2>
      <p>Connect your Fender Mustang amp via USB to start.</p>
      <button (click)="connect()" style="padding: 10px 20px; font-size: 1.2em; cursor: pointer;">Connect Now</button>
    </div>
    <section *ngIf="api.isConnected" style="margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px;">
      <h3>Raw Signal Chain (Hardware View)</h3>
      <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 20px;">
        <div *ngFor="let i of range(8)" 
             style="min-width: 120px; border: 1px solid #ddd; padding: 10px; border-radius: 4px; background: white;"
             [style.background-color]="i === 4 ? '#fff3e0' : 'white'"
             [style.border-color]="i === 4 ? '#ff9800' : '#ddd'">
          <div style="font-size: 0.7em; color: #999; margin-bottom: 5px;">Slot {{ i }} {{ i === 4 ? '(Pre-amp)' : '' }}</div>
          <div *ngIf="getEffectSettings(i) as effect; else emptySlot">
            <div style="font-weight: bold; font-size: 0.85em; margin-bottom: 3px;">{{ effect.model }}</div>
            <div [style.color]="getFamilyColor(effect.type)" style="font-size: 0.7em; text-transform: uppercase;">Type: {{ effect.type }}</div>
          </div>
          <ng-template #emptySlot>
            <div style="font-style: italic; color: #ccc; font-size: 0.85em;">-- Empty --</div>
          </ng-template>
        </div>
      </div>
    </section>
  `,
})
export class App {
  protected DspType = DspType;
  protected api = new MustangAPI();
  protected loader = new FuseLoader(this.api);
  private readonly changeDetector = inject(ChangeDetectorRef);

  protected ampModels = Object.values(AMP_MODELS);
  protected cabModels = CABINET_MODELS;
  protected effectModels = Object.values(EFFECT_MODELS);

  protected effectFamilies = [
    { type: DspType.STOMP, label: 'Stompbox' },
    { type: DspType.MOD, label: 'Modulation' },
    { type: DspType.DELAY, label: 'Delay' },
    { type: DspType.REVERB, label: 'Reverb' }
  ];

  protected advancedSettings: { key: string, label: string }[] = [
    { key: 'bias', label: 'Bias' },
    { key: 'noiseGate', label: 'Noise Gate' },
    { key: 'threshold', label: 'Gate Thresh' },
    { key: 'sag', label: 'Sag' },
    { key: 'brightness', label: 'Brightness' },
    { key: 'depth', label: 'Depth' }
  ];

  protected state = signal(this.api.state);

  constructor() {
    (window as any)["api"] = this.api;
    this.api.on('state-changed', () => {
      this.state.set({ ...this.api.state }); // Trigger signal change
      this.changeDetector.markForCheck();
    });
  }

  getAmpSettings() {
    return this.api.getAmpSettings();
  }

  getAmpKnobs() {
    return this.api.getAmpKnobs();
  }

  getEffectSettings(slot: number) {
    return this.api.getEffectSettings(slot);
  }

  getEffectForFamily(type: number) {
    for (let i = 0; i < 8; i++) {
      const effect = this.getEffectSettings(i);
      if (effect && effect.type === type) return effect;
    }
    return null;
  }

  getSlotForFamily(type: number) {
    for (let i = 0; i < 8; i++) {
      const effect = this.getEffectSettings(i);
      if (effect && effect.type === type) return i;
    }
    return null; // Return null instead of 0
  }

  getModelsForFamily(type: DspType) {
    const models = this.effectModels.filter(m => m.type === type);
    return models;
  }

  getAvailableSlots() {
    const usedSlots = new Set(this.range(8).filter(i => this.getEffectSettings(i) !== null));
    return this.range(8).filter(i => !usedSlots.has(i));
  }

  getFamilyColor(type: DspType) {
    switch (type) {
      case DspType.STOMP: return '#e74c3c'; // Stomp - Red
      case DspType.MOD: return '#3498db'; // Mod - Blue
      case DspType.DELAY: return '#f1c40f'; // Delay - Yellow
      case DspType.REVERB: return '#2ecc71'; // Reverb - Green
      default: return '#ccc';
    }
  }

  async changeEffectByFamily(type: DspType, name: string) {
    const currentSlot = this.getSlotForFamily(type);
    const existingEffect = this.getEffectForFamily(type);

    if (name === 'None') {
      if (existingEffect) await this.api.clearEffect(existingEffect.slot);
      return;
    }

    // If already exists, just change the model in the same slot
    if (existingEffect) {
      await this.api.setEffect(existingEffect.slot, name);
    } else {
      // Find first available slot
      const available = this.getAvailableSlots();
      if (available.length > 0) {
        await this.api.setEffect(available[0], name);
      } else {
        alert("No free slots available! Every slot is occupied.");
      }
    }
  }

  async moveEffect(type: DspType, newSlot: string) {
    const slot = Number(newSlot);
    const effect = this.getEffectForFamily(type);
    if (!effect) return;
    
    // Use the robust swap logic in API which handles settings, enabling, and clearing
    await this.api.swapEffects(effect.slot, slot);
  }

  async connect() {
    await this.api.connect();
    this.changeDetector.markForCheck();
  }

  async changePreset(slot: number) {
    await this.api.loadPreset(Number(slot));
  }

  async changeAmp(name: string) {
    await this.api.setAmpModel(name);
  }

  async changeCabinet(name: string) {
    await this.api.setCabinet(name);
  }

  async changeAmpKnob(name: string, event: any) {
    const value = Number(event.target.value);
    await this.api.setAmpKnob(name, value);
  }

  async changeAdvancedSetting(key: string, event: any) {
    const value = Number(event.target.value);
    const byteIndexMap: Record<string, number> = {
      'bias': 42,
      'noiseGate': 47,
      'threshold': 48,
      'sag': 51,
      'brightness': 52,
      'depth': 41
    };
    const byteIndex = byteIndexMap[key];
    if (byteIndex) {
      await this.api.setParameter(0x05, 0, byteIndex, value);
    }
  }

  async changeEffect(slot: number, name: string) {
    if (name === 'None') {
      await this.api.clearEffect(slot);
    } else {
      await this.api.setEffect(slot, name);
    }
  }

  async toggleEffect(slot: number, enabled: boolean) {
    await this.api.setEffectEnabled(slot, enabled);
  }

  async changeEffectKnob(slot: number, name: string, event: any) {
    const value = Number(event.target.value);
    await this.api.setEffectKnob(slot, name, value);
  }

  async loadPreset(event: any) {
    const file = event.target.files[0];
    const text = await file.text();
    try {
      await this.loader.loadPreset(text);
      this.changeDetector.markForCheck();
    } catch (err) {
      console.error(err);
    }
  }

  range(n: number) {
    return Array.from({ length: n }, (_, i) => i);
  }
}
