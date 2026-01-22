import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KnobComponent } from './knob';
import type { KnobInfo, CabinetDef, ModelDef, AmpSettings } from '../lib';

@Component({
  selector: 'fuse-amp-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  template: `
    <section class="card">
      <header>
        <h3>Amplifier</h3>
        <select [ngModel]="settings?.modelId" (ngModelChange)="onAmpChange($event)">
          @for (model of ampModels; track model.id) {
            <option [value]="model.id">{{ model.name }}</option>
          }
        </select>
      </header>

      <div class="knob-grid">
        @for (knob of knobs; track knob.name) {
          <div class="knob-control">
            <fuse-knob
              [name]="knob.name"
              [value]="knob.value"
              (valueChange)="onKnobChange(knob.index, $event)"
            ></fuse-knob>
          </div>
        }
      </div>

      <div>
        <label>Cabinet</label>
        <select [ngModel]="settings?.cabinetId" (ngModelChange)="onCabinetChange($event)">
          @for (cab of cabModels; track cab.id) {
            <option [value]="cab.id">{{ cab.name }}</option>
          }
        </select>
      </div>

      <details>
        <summary>Advanced parameters</summary>
        <div class="knob-grid">
          @for (setting of advancedSettingsDefinition; track setting.key) {
            <div class="knob-control">
              <fuse-knob
                [name]="setting.label"
                [value]="getAmpSettingNumberValue(setting.key)"
                (valueChange)="onAdvancedSettingChange(setting.key, $event)"
              ></fuse-knob>
            </div>
          }
        </div>
      </details>
    </section>
  `,
  styles: [
    `
      .card {
        background: #2b2b2b;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        border-bottom: 1px solid #444;
        padding-bottom: 10px;
      }
      h3 {
        margin: 0;
        color: #eee;
      }
      .knob-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }
      .knob-control {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      select {
        background: #444;
        color: #fff;
        border: 1px solid #555;
        padding: 5px 10px;
        border-radius: 4px;
      }
      details {
        margin-top: 20px;
        border-top: 1px solid #444;
        padding-top: 10px;
      }
      summary {
        cursor: pointer;
        color: #aaa;
        margin-bottom: 15px;
      }
      label {
        display: block;
        margin-bottom: 5px;
        color: #ddd;
      }
    `,
  ],
})
export class AmpEditorComponent {
  @Input() settings: AmpSettings | null = null;
  @Input() knobs: KnobInfo[] = [];
  @Input() ampModels: ModelDef[] = [];
  @Input() cabModels: CabinetDef[] = [];

  @Output() ampChange = new EventEmitter<number>();
  @Output() cabinetChange = new EventEmitter<number>();
  @Output() knobChange = new EventEmitter<{ index: number; value: number }>();
  @Output() advancedSettingChange = new EventEmitter<{ key: string; value: number }>();

  protected advancedSettingsDefinition: { key: keyof AmpSettings; label: string }[] = [
    { key: 'bias', label: 'Bias' },
    { key: 'noiseGate', label: 'Noise Gate' },
    { key: 'threshold', label: 'Gate Thresh' },
    { key: 'sag', label: 'Sag' },
    { key: 'brightness', label: 'Brightness' },
    { key: 'depth', label: 'Depth' },
  ];

  onAmpChange(value: number) {
    this.ampChange.emit(value);
  }

  onCabinetChange(value: number) {
    this.cabinetChange.emit(value);
  }

  onKnobChange(index: number, value: number) {
    this.knobChange.emit({ index, value });
  }

  onAdvancedSettingChange(key: keyof AmpSettings, value: number) {
    this.advancedSettingChange.emit({ key, value });
  }

  getAmpSetting(key: keyof AmpSettings) {
    return this.settings ? this.settings[key] : 0;
  }

  getAmpSettingNumberValue(key: keyof AmpSettings): number {
    return Number(this.getAmpSetting(key));
  }
}
