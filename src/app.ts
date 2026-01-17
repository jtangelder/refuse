import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, signal } from "@angular/core";
import { MustangAPI, AMP_MODELS, EFFECT_MODELS, CABINET_MODELS, DspType } from "./lib/api";
import { FuseLoader } from "./lib/loader";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div style="font-weight: bold; font-size: 1.2rem; margin-right: 20px;">MUSTANG TEST DASHBOARD</div>
      
      <button *ngIf="!api.isConnected" (click)="connect()" class="success">Connect Amp</button>
      <button *ngIf="api.isConnected" (click)="disconnect()" class="danger">Disconnect</button>
      
      <div *ngIf="api.isConnected" style="display: flex; gap: 15px; align-items: center; border-left: 1px solid #333; padding-left: 20px;">
        <label>Preset:</label>
        <select [ngModel]="api.currentPresetSlot" (ngModelChange)="changePreset($event)">
          <option *ngFor="let i of range(24)" [value]="i">
            {{ i | number:'2.0' }}: {{ api.presets.get(i)?.name || 'Preset ' + i }}
          </option>
        </select>
        
        <div style="display: flex; gap: 5px;">
          <input type="text" [(ngModel)]="presetSaveName" placeholder="New Name" style="width: 120px;" />
          <button (click)="savePreset()" class="secondary">Save</button>
        </div>

        <div style="border-left: 1px solid #333; padding-left: 15px; display: flex; gap: 10px; align-items: center;">
          <label class="secondary" style="font-size: 0.8rem; cursor: pointer;">
            Import .fusepreset
            <input type="file" (change)="importFusePreset($event)" style="display: none;" />
          </label>
          <button (click)="clearAllEffects()" class="danger" style="font-size: 0.8rem;">Clear All FX</button>
        </div>
      </div>
    </div>

    <main class="dashboard" *ngIf="api.isConnected">
      <!-- Signal Chain Status -->
      <section class="card" style="padding-bottom: 5px;">
        <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 10px;">HARDWARE SIGNAL CHAIN</h3>
        <div class="signal-chain-strip">
          <div *ngFor="let i of range(8)" class="slot" 
               [class.active]="activeSlot === i" 
               [class.empty]="!getEffectSettings(i)"
               (click)="activeSlot = i">
            <span class="slot-num">{{ i }}</span>
            <div *ngIf="getEffectSettings(i) as effect; else emptySlot">
              <div class="badge" [style.background]="getFamilyColor(effect.type)" style="margin-bottom: 5px;">{{ getFamilyLabel(effect.type) }}</div>
              <div style="font-size: 0.85rem; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ effect.model }}</div>
              <div style="font-size: 0.7rem; color: {{ effect.enabled ? '#2ecc71' : '#e74c3c' }}">{{ effect.enabled ? '● ACTIVE' : '○ BYPASSED' }}</div>
            </div>
            <ng-template #emptySlot>
              <div style="font-style: italic; color: #444; font-size: 0.8rem; margin-top: 15px;">Empty</div>
            </ng-template>
          </div>
        </div>
      </section>

      <div class="grid">
        <!-- Amp Control -->
        <section class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2>Amplifier</h2>
            <select [ngModel]="getAmpSettings()?.modelId" (ngModelChange)="changeAmp($event)">
              <option *ngFor="let model of ampModels" [value]="model.id">{{ model.name }}</option>
            </select>
          </div>

          <div class="knob-grid">
            <div *ngFor="let knob of getAmpKnobs()" class="knob-control">
              <label>{{ knob.name }}</label>
              <input type="range" min="0" max="255" [value]="knob.value" (input)="changeAmpKnob(knob.index, $event)" />
              <div class="val">{{ knob.value }}</div>
            </div>
          </div>

          <div style="margin-top: 25px; border-top: 1px solid var(--border); padding-top: 15px;">
            <label style="font-size: 0.8rem; color: var(--text-muted);">CABINET</label>
            <select [ngModel]="api.getCabinetId()" (ngModelChange)="changeCabinet($event)" style="width: 100%; margin-top: 5px;">
              <option *ngFor="let cab of cabModels" [value]="cab.id">{{ cab.name }}</option>
            </select>
          </div>

          <details style="margin-top: 20px;">
            <summary style="cursor: pointer; font-size: 0.85rem; color: var(--primary);">ADVANCED PARAMETERS</summary>
            <div class="knob-grid" style="margin-top: 15px;">
              <div *ngFor="let setting of advancedSettings" class="knob-control">
                <label>{{ setting.label }}</label>
                <input type="range" min="0" max="255" [value]="getAmpSettings()?.[setting.key]" (input)="changeAdvancedSetting(setting.key, $event)" />
                <div class="val">{{ getAmpSettings()?.[setting.key] }}</div>
              </div>
            </div>
          </details>
        </section>

        <!-- Slot Control -->
        <section class="card" [style.border-color]="activeSlot !== null ? 'var(--primary)' : 'var(--border)'">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2>Slot {{ activeSlot !== null ? activeSlot : '' }} Control</h2>
            <div *ngIf="activeSlot !== null" style="display: flex; gap: 10px;">
               <button (click)="clearSlot(activeSlot)" class="danger" style="font-size: 0.7rem; padding: 4px 8px;">Clear</button>
            </div>
          </div>

          <div *ngIf="activeSlot !== null; else noActiveSlot">
            <div style="margin-bottom: 20px;">
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 5px;">ASSIGN EFFECT</label>
              <select [ngModel]="getEffectSettings(activeSlot)?.modelId || 0" (ngModelChange)="assignEffect(activeSlot, $event)" style="width: 100%;">
                <option [value]="0">-- Empty --</option>
                <optgroup label="STOMP">
                   <option *ngFor="let m of getModelsForFamily(DspType.STOMP)" [value]="m.id">{{ m.name }}</option>
                </optgroup>
                <optgroup label="MOD">
                   <option *ngFor="let m of getModelsForFamily(DspType.MOD)" [value]="m.id">{{ m.name }}</option>
                </optgroup>
                <optgroup label="DELAY">
                   <option *ngFor="let m of getModelsForFamily(DspType.DELAY)" [value]="m.id">{{ m.name }}</option>
                </optgroup>
                <optgroup label="REVERB">
                   <option *ngFor="let m of getModelsForFamily(DspType.REVERB)" [value]="m.id">{{ m.name }}</option>
                </optgroup>
              </select>
            </div>

            <div *ngIf="getEffectSettings(activeSlot) as effect">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                  <input type="checkbox" [ngModel]="effect.enabled" (ngModelChange)="toggleEffect(activeSlot, $event)" />
                  <span style="font-weight: bold;">{{ effect.enabled ? 'ENABLED' : 'BYPASSED' }}</span>
                </label>
                <div style="font-size: 0.8rem; opacity: 0.6;">Type: 0x{{ effect.type.toString(16) }}</div>
              </div>

              <div class="knob-grid">
                <div *ngFor="let knob of effect.knobs" class="knob-control">
                  <label>{{ knob.name }}</label>
                  <input type="range" min="0" max="255" [value]="knob.value" (input)="changeEffectKnob(activeSlot, knob.index, $event)" />
                  <div class="val">{{ knob.value }}</div>
                </div>
              </div>

              <div style="margin-top: 30px; border-top: 1px solid var(--border); padding-top: 20px;">
                <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 10px;">MOVE/SWAP SLOT</label>
                <div style="display: flex; gap: 10px;">
                  <button *ngFor="let i of range(8)" 
                          (click)="swapSlots(activeSlot, i)" 
                          [disabled]="i === activeSlot"
                          class="secondary"
                          style="flex: 1; padding: 5px; font-size: 0.8rem;">
                    {{ i }}
                  </button>
                </div>
              </div>
            </div>
            
            <div *ngIf="!getEffectSettings(activeSlot)" style="text-align: center; padding: 40px; color: #444; border: 2px dashed #333; border-radius: 8px;">
              Select an effect model above to assign to this slot
            </div>
          </div>
          <ng-template #noActiveSlot>
            <div style="text-align: center; padding: 60px; color: #555;">
              Click a slot in the signal chain above to view and edit its settings.
            </div>
          </ng-template>
        </section>
      </div>
    </main>

    <div *ngIf="!api.isConnected" class="dashboard" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
      <h1 style="font-size: 3rem; margin-bottom: 10px; color: var(--primary);">MUSTANG TESTER</h1>
      <p style="color: var(--text-muted); margin-bottom: 30px;">High-fidelity feature validation toolkit for Fender Mustang USB HID</p>
      <button (click)="connect()" style="font-size: 1.5rem; padding: 15px 40px;">INITIALIZE HID INTERFACE</button>
    </div>
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

  protected activeSlot: number | null = null;
  protected presetSaveName: string = "";

  protected advancedSettings: { key: string, label: string }[] = [
    { key: 'bias', label: 'Bias' },
    { key: 'noiseGate', label: 'Noise Gate' },
    { key: 'threshold', label: 'Gate Thresh' },
    { key: 'sag', label: 'Sag' },
    { key: 'brightness', label: 'Brightness' },
    { key: 'depth', label: 'Depth' }
  ];

  constructor() {
    (window as any)["api"] = this.api;
    this.api.on('state-changed', () => {
      this.changeDetector.markForCheck();
    });
    this.api.on('preset-loaded', (slot, name) => {
      this.presetSaveName = name;
      this.changeDetector.markForCheck();
    });
  }

  // --- ACTIONS ---

  async connect() {
    await this.api.connect();
    if (this.api.isConnected && this.api.currentPresetSlot !== null) {
      this.presetSaveName = this.api.presets.get(this.api.currentPresetSlot)?.name || "";
    }
    this.changeDetector.markForCheck();
  }

  async disconnect() {
    await this.api.disconnect();
    this.changeDetector.markForCheck();
  }

  async changePreset(slot: number) {
    await this.api.loadPreset(Number(slot));
  }

  async savePreset() {
    if (this.api.currentPresetSlot === null) return;
    await this.api.savePreset(this.api.currentPresetSlot, this.presetSaveName);
  }

  async importFusePreset(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    await this.loader.loadPreset(text);
  }

  async clearAllEffects() {
    if (!confirm("Remove all effects?")) return;
    for (let i = 0; i < 8; i++) {
      await this.api.clearEffect(i);
    }
  }

  async clearSlot(slot: number) {
    await this.api.clearEffect(slot);
  }

  async changeAmp(modelId: any) {
    await this.api.setAmpModelById(Number(modelId));
  }

  async changeCabinet(id: any) {
    await this.api.setCabinetById(Number(id));
  }

  async changeAmpKnob(index: number, event: any) {
    await this.api.setAmpKnob(index, Number(event.target.value));
  }

  async changeAdvancedSetting(key: string, event: any) {
    const value = Number(event.target.value);
    const byteIndexMap: Record<string, number> = {
      'bias': 42, 'noiseGate': 47, 'threshold': 48, 'sag': 51, 'brightness': 52, 'depth': 41
    };
    const byteIndex = byteIndexMap[key];
    if (byteIndex) await this.api.setParameter(0x05, 0, byteIndex, value);
  }

  async assignEffect(slot: number, modelId: any) {
    const id = Number(modelId);
    if (id === 0) {
      await this.api.clearEffect(slot);
    } else {
      await this.api.setEffectById(slot, id);
    }
  }

  async toggleEffect(slot: number, enabled: any) {
    await this.api.setEffectEnabled(slot, enabled);
  }

  async changeEffectKnob(slot: number, index: number, event: any) {
    await this.api.setEffectKnob(slot, index, Number(event.target.value));
  }

  async swapSlots(slotA: number, slotB: number) {
    await this.api.swapEffects(slotA, slotB);
    this.activeSlot = slotB; // Follow the effect
  }

  // --- GETTERS ---

  getAmpSettings() { return this.api.getAmpSettings() as any; }
  getAmpKnobs() { return this.api.getAmpKnobs(); }
  getEffectSettings(slot: number) { return this.api.getEffectSettings(slot); }
  
  getModelsForFamily(type: DspType) {
    return this.effectModels.filter(m => m.type === type);
  }

  getFamilyLabel(type: DspType) {
    switch(type) {
      case DspType.STOMP: return 'STOMP';
      case DspType.MOD: return 'MOD';
      case DspType.DELAY: return 'DELAY';
      case DspType.REVERB: return 'REVERB';
      default: return 'UNKNOWN';
    }
  }

  getFamilyColor(type: DspType) {
    switch (type) {
      case DspType.STOMP: return '#e74c3c';
      case DspType.MOD: return '#3498db';
      case DspType.DELAY: return '#f1c40f';
      case DspType.REVERB: return '#2ecc71';
      default: return '#444';
    }
  }

  range(n: number) { return Array.from({ length: n }, (_, i) => i); }
}
