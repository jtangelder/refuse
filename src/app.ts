import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, signal, Input, Output, EventEmitter, viewChild } from "@angular/core";
import { MustangAPI, AMP_MODELS, EFFECT_MODELS, CABINET_MODELS, DspType } from "./lib/api";
import { FuseLoader } from "./lib/loader";
import { CommonModule } from "@angular/common";
import { FormsModule, NgModel } from "@angular/forms";

@Component({
  selector: "app-knob",
  standalone: true,
  imports: [FormsModule],
  template: `
    <label>
      <span class="name">{{ name }}</span> 
      <span class="value">{{ toPercent(value) }}</span>
    </label>
    <input type="range" 
      min="0" max="255" 
      [value]="value" 
      (input)="onInput($event)">
  `,
})
export class KnobComponent {
  @Input() name!: string;
  @Input() value!: number;
  @Output() valueChange = new EventEmitter<number>();

  toPercent(value: number) {
    return Math.round(value / 2.55);
  }

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(Number(value));
  }
}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container">
      @if (api.isConnected) {
        @if (!isReady) {
          <div class="loading-overlay"><h1>Receiving data from the amplifier...</h1></div>
        }
      <div class="sidebar">
        <header>
          <h1>ReFUSE</h1>
          <div class="connection">
            <button *ngIf="!api.isConnected" (click)="connect()" class="success">Connect Amp</button>
            <button *ngIf="api.isConnected" (click)="disconnect()" class="danger">Disconnect</button>
          </div>  
        </header>

        <div class="presets">
          <h3>Presets</h3>
          <ul>
            <li *ngFor="let i of range(24)">
              <button (click)="changePreset(i)" [class.active]="api.currentPresetSlot === i">
                <span class="slot-num">{{ i | number:'2.0' }}:</span> 
                <span>{{ api.presets.get(i)?.name || 'Preset ' + i }}</span>
              </button>
            </li>
          </ul>
        </div>
        <hr>
        <div class="preset-controls">
          <button (click)="savePreset()" class="secondary">Save preset</button>
          <button class="secondary" (click)="fileInput.click()">Import preset</button>
          <input #fileInput type="file" (change)="importFusePreset($event)" style="display: none;" />
        </div>
    </div>
    <main class="dashboard">
      <!-- Signal Chain Status -->
      <div class="signal-chain-strip">
        <div class="amplifier">
          Amplifier
        </div>
        <div *ngFor="let i of range(8)" class="slot" 
              [class.active]="activeSlot === i" 
              [class.empty]="!getEffectSettings(i)"
              [style.order]="i * 10"
              (click)="activeSlot = i">
          <span class="slot-num">{{ i }}</span>
          <div *ngIf="getEffectSettings(i) as effect; else emptySlot">
            <div class="badge" [style.background]="getFamilyColor(effect.type)">{{ getFamilyLabel(effect.type) }}</div>
            <div>{{ effect.model }}</div>
            <div>{{ effect.enabled ? '● ACTIVE' : '○ BYPASSED' }}</div>
          </div>
          <ng-template #emptySlot>
            <div>Empty</div>
          </ng-template>
        </div>
      </div>

      <div class="grid">
        <!-- Amp Control -->
        <section class="card">
          <header>
            <h3>Amplifier</h3>
            <select [ngModel]="getAmpSettings()?.modelId" (ngModelChange)="changeAmp($event)">
              @for (model of ampModels; track model.id) {
                <option [value]="model.id">{{ model.name }}</option>
              }
            </select>
          </header>

          <div class="knob-grid">
            @for (knob of getAmpKnobs(); track knob.name) {
              <div class="knob-control"> 
                <app-knob [name]="knob.name" [value]="knob.value" (valueChange)="changeAmpKnob(knob.index, $event);"></app-knob>
              </div>
            }
          </div>

          <div>
            <label>Cabinet</label>
            <select [ngModel]="api.getCabinetId()" (ngModelChange)="changeCabinet($event)">
              @for (cab of cabModels; track cab.id) {
                <option [value]="cab.id">{{ cab.name }}</option>
              }
            </select>
          </div>

          <details>
            <summary>Advanced parameters</summary>
            <div class="knob-grid">
              @for (setting of advancedSettings; track setting.key) {
                <div class="knob-control"> 
                  <app-knob [name]="setting.label" [value]="getAmpSettings()?.[setting.key]" (valueChange)="changeAdvancedSetting(setting.key, $event)"></app-knob>
                </div>
              }
            </div>
          </details>
        </section>

        <!-- Slot Control -->
        <section class="card">
          <header>
            <h3>Slot {{ activeSlot !== null ? activeSlot : '' }}</h3>
            <div *ngIf="activeSlot !== null">
              <select [ngModel]="getEffectSettings(activeSlot)?.modelId || 0" (ngModelChange)="assignEffect(activeSlot, $event)">
                  <option [value]="0">-- Empty --</option>
                  <optgroup label="Stompbox">
                    @for (m of getModelsForFamily(DspType.STOMP); track m.id) {
                      <option [value]="m.id">{{ m.name }}</option>
                    }
                  </optgroup>
                  <optgroup label="Modulation">
                    @for (m of getModelsForFamily(DspType.MOD); track m.id) {
                      <option [value]="m.id">{{ m.name }}</option>
                    }
                  </optgroup>
                  <optgroup label="Delay">
                    @for (m of getModelsForFamily(DspType.DELAY); track m.id) {
                      <option [value]="m.id">{{ m.name }}</option>
                    }
                  </optgroup>
                  <optgroup label="Reverb">
                    @for (m of getModelsForFamily(DspType.REVERB); track m.id) {
                      <option [value]="m.id">{{ m.name }}</option>
                    }
                  </optgroup>
                </select>
            </div>
          </header>

          <div *ngIf="activeSlot !== null; else noActiveSlot">
            <div *ngIf="getEffectSettings(activeSlot) as effect">
              <div>
                <label>
                  <input type="checkbox" [ngModel]="effect.enabled" (ngModelChange)="toggleEffect(activeSlot, $event)" />
                  <span>{{ effect.enabled ? 'Active' : 'Bypassed' }}</span>
                </label>
                <div>Type: 0x{{ effect.type.toString(16) }}</div>
              </div>

              <div class="knob-grid">
                @for (knob of effect.knobs; track knob.index) {
                  <div class="knob-control">
                    <app-knob [name]="knob.name" [value]="knob.value" (valueChange)="changeEffectKnob(activeSlot, knob.index, $event)"></app-knob>
                  </div>
                }
              </div>

              <div>
                <label>Slot</label>
                <div>
                  @for (i of range(8); track i) {
                    <button (click)="swapSlots(activeSlot, i)" 
                            [disabled]="i === activeSlot"
                            class="secondary"
                            style="padding: 4px 8px; font-size: 0.8rem; margin-right: 5px;">
                      {{ i }}
                    </button>
                  }
                  <button (click)="clearSlot(activeSlot)"
                          class="secondary" style="padding: 4px 8px; font-size: 0.8rem;">Clear</button>
                </div>
              </div>
            </div>
            
            <div *ngIf="!getEffectSettings(activeSlot)">
              <p>Select an effect model above to assign to this slot.</p>
              <p>Note, an effect can only be assigned to one slot at a time.</p>
            </div>
          </div>
          <ng-template #noActiveSlot>
            <div>
              Click a slot in the signal chain above to view and edit its settings.
            </div>
          </ng-template>
        </section>
      </div>
    </main>
    }
    @else {
    <div class="welcome">
      <div class="illustration">
        <img src="assets/mustang-intro.webp" />
      </div>
      <div class="message">
        <h1>Unofficial Fender FUSE replacement</h1>

        <p>This tool restores the editing functionality lost when Fender 
          <a href="https://support.fender.com/en-us/knowledgebase/article/KA-01924" target="_blank">discontinued</a> their FUSE application.</p>

        <p>It provides a simple interface to manage your presets, configure signal chains, and 
          access the "hidden" amp models that require software control. No installation is needed; 
          it runs entirely via your browser's USB connection.</p>

        <p><strong>Get started by connecting your amplifier to your computer via USB.</strong></p>
        <div class="connect">
            <button (click)="connect()" class="success">
              <span class="icon">usb</span>
              Connect your amp
            </button>
        </div>

        <p *ngIf="!isSupported" class="unsupported">
          ⚠️ WebHID not detected. This application requires a browser with WebHID support 
          (<a href="https://caniuse.com/webhid" target="_blank">like Chrome, Edge or Opera</a>).
        </p>

        <p class="disclaimer">
          <em>This is a hobby project, not affiliated with Fender in any way. Please 
          <a href="https://github.com/jtangelder/mustang" target="_blank">contribute on GitHub</a> 
          if you find it useful.</em>
        </p>
      </div>

    </div>
    }
    `,
})
export class App {
  protected isSupported = !!(navigator as any).hid;
  protected isReady = false;

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

    this.api.on('connected', async () => {
      await sleep(1000);
      this.isReady = true;
      this.changeDetector.markForCheck();
    });
    this.api.on('disconnected', () => {
      this.isReady = false;
      this.changeDetector.markForCheck();
    });
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
    const name = window.prompt('Enter a name for your preset', this.presetSaveName);
    if (!name) return;
    this.presetSaveName = name;
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

  async changeAmpKnob(index: number, value: number) {
    await this.api.setAmpKnob(index, value);
  }

  async changeAdvancedSetting(key: string, value: number) {
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

  async changeEffectKnob(slot: number, index: number, value: number) {
    await this.api.setEffectKnob(slot, index, value);
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
    switch (type) {
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
