import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { KnobComponent } from './knob';
import type { KnobInfo, CabinetDef, ModelDef, AmpSettings, AdvancedAmpParam } from '../lib';

@Component({
  selector: 'fuse-amp-editor',
  imports: [MatMenuModule, MatButtonModule, MatIconModule, KnobComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card">
      <header class="amp-editor-header">
        <div class="header-titles">
          <span class="amp-tag">AMPLIFIER</span>
          <span class="header-main-title">Tone Controls & Cabinets</span>
        </div>

        <div class="selectors-row">
          <!-- Amp Model Selector -->
          <div class="selector-group">
            <span class="selector-label">Amp Model</span>
            <button mat-button [matMenuTriggerFor]="ampRootMenu" class="model-select-btn">
              <span class="btn-text">{{ currentAmpName() }}</span>
              <mat-icon class="dropdown-icon">arrow_drop_down</mat-icon>
            </button>
            <mat-menu #ampRootMenu="matMenu">
              <button mat-menu-item [matMenuTriggerFor]="fenderMenu">Fender Amps</button>
              <button mat-menu-item [matMenuTriggerFor]="britishMenu">British Amps</button>
              <button mat-menu-item [matMenuTriggerFor]="otherMenu">High Gain & Studio</button>
            </mat-menu>

            <mat-menu #fenderMenu="matMenu">
              @for (model of ampGroups().fender; track model.id) {
                <button
                  mat-menu-item
                  (click)="onAmpChange(model.id)"
                  [class.selected-menu-item]="settings()?.modelId === model.id"
                >
                  <mat-icon>{{ settings()?.modelId === model.id ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                  <span>{{ model.name }}</span>
                </button>
              }
            </mat-menu>
            <mat-menu #britishMenu="matMenu">
              @for (model of ampGroups().british; track model.id) {
                <button
                  mat-menu-item
                  (click)="onAmpChange(model.id)"
                  [class.selected-menu-item]="settings()?.modelId === model.id"
                >
                  <mat-icon>{{ settings()?.modelId === model.id ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                  <span>{{ model.name }}</span>
                </button>
              }
            </mat-menu>
            <mat-menu #otherMenu="matMenu">
              @for (model of ampGroups().other; track model.id) {
                <button
                  mat-menu-item
                  (click)="onAmpChange(model.id)"
                  [class.selected-menu-item]="settings()?.modelId === model.id"
                >
                  <mat-icon>{{ settings()?.modelId === model.id ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                  <span>{{ model.name }}</span>
                </button>
              }
            </mat-menu>
          </div>

          <!-- Cabinet Selector -->
          <div class="selector-group">
            <span class="selector-label">Cabinet Simulation</span>
            <button mat-button [matMenuTriggerFor]="cabRootMenu" class="model-select-btn cab-btn">
              <span class="btn-text">{{ currentCabName() }}</span>
              <mat-icon class="dropdown-icon">arrow_drop_down</mat-icon>
            </button>
            <mat-menu #cabRootMenu="matMenu">
              <button mat-menu-item (click)="onCabinetChange(0)">
                <mat-icon>{{ settings()?.cabinetId === 0 ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                <span>Direct / Cab Simulation Off</span>
              </button>
              <button mat-menu-item [matMenuTriggerFor]="cab1xMenu">1 x Speaker Cabs</button>
              <button mat-menu-item [matMenuTriggerFor]="cab2xMenu">2 x Speaker Cabs</button>
              <button mat-menu-item [matMenuTriggerFor]="cab4xMenu">4 x Speaker Cabs</button>
            </mat-menu>

            <mat-menu #cab1xMenu="matMenu">
              @for (cab of cabGroups().single; track cab.id) {
                <button
                  mat-menu-item
                  (click)="onCabinetChange(cab.id)"
                  [class.selected-menu-item]="settings()?.cabinetId === cab.id"
                >
                  <mat-icon>{{ settings()?.cabinetId === cab.id ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                  <span>{{ cab.name }}</span>
                </button>
              }
            </mat-menu>
            <mat-menu #cab2xMenu="matMenu">
              @for (cab of cabGroups().double; track cab.id) {
                <button
                  mat-menu-item
                  (click)="onCabinetChange(cab.id)"
                  [class.selected-menu-item]="settings()?.cabinetId === cab.id"
                >
                  <mat-icon>{{ settings()?.cabinetId === cab.id ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                  <span>{{ cab.name }}</span>
                </button>
              }
            </mat-menu>
            <mat-menu #cab4xMenu="matMenu">
              @for (cab of cabGroups().quad; track cab.id) {
                <button
                  mat-menu-item
                  (click)="onCabinetChange(cab.id)"
                  [class.selected-menu-item]="settings()?.cabinetId === cab.id"
                >
                  <mat-icon>{{ settings()?.cabinetId === cab.id ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                  <span>{{ cab.name }}</span>
                </button>
              }
            </mat-menu>
          </div>
        </div>
      </header>

      <!-- Tone Stack Knobs -->
      <div class="knobs-section">
        <div class="knob-grid">
          @for (knob of knobs(); track knob.name) {
            <div class="knob-control">
              <fuse-knob
                [name]="knob.name"
                [value]="knob.value"
                (valueChange)="onKnobChange(knob.index, $event)"
              ></fuse-knob>
            </div>
          }
        </div>
      </div>

      <!-- Advanced Amp Parameters Collapsible -->
      <details class="advanced-section">
        <summary>
          <mat-icon class="summary-icon">tune</mat-icon>
          <span>Advanced Amplifier Parameters (Sag, Bias, Gate, Brightness, Depth)</span>
        </summary>
        <div class="knob-grid advanced-grid">
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
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      }

      .amp-editor-header {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-bottom: 20px;
        margin-bottom: 24px;
        border-bottom: 1px solid #27272a;
      }

      .header-titles {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .amp-tag {
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        padding: 3px 8px;
        border-radius: 4px;
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }

      .header-main-title {
        font-size: 1.15rem;
        font-weight: 700;
        color: #f4f4f5;
      }

      .selectors-row {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
      }

      .selector-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        min-width: 220px;
      }

      .selector-label {
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #a1a1aa;
      }

      .model-select-btn {
        width: 100%;
        background: #27272a;
        border: 1px solid #3f3f46;
        color: #f4f4f5;
        padding: 8px 14px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 600;
        text-transform: none;
        transition: all 0.15s;

        &:hover {
          border-color: #f59e0b;
          background: #333338;
        }
      }

      .cab-btn:hover {
        border-color: #38bdf8;
      }

      .btn-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dropdown-icon {
        color: #a1a1aa;
      }

      .selected-menu-item {
        color: #f59e0b !important;
      }

      .knobs-section {
        padding: 8px 0 16px;
      }

      .knob-grid {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 32px;
      }

      .knob-control {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .advanced-section {
        margin-top: 24px;
        border-top: 1px solid #27272a;
        padding-top: 16px;
      }

      summary {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        color: #a1a1aa;
        font-size: 0.85rem;
        font-weight: 600;
        margin-bottom: 20px;
        user-select: none;
        transition: color 0.15s;

        &:hover {
          color: #f4f4f5;
        }

        .summary-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          color: #f59e0b;
        }
      }

      .advanced-grid {
        padding: 8px 0;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }
    `,
  ],
})
export class AmpEditorComponent {
  settings = input<AmpSettings | null>(null);
  knobs = input<KnobInfo[]>([]);
  ampModels = input<ModelDef[]>([]);
  cabModels = input<CabinetDef[]>([]);

  ampChange = output<number>();
  cabinetChange = output<number>();
  knobChange = output<{ index: number; value: number }>();
  advancedSettingChange = output<{ key: AdvancedAmpParam; value: number }>();

  protected advancedSettingsDefinition: { key: AdvancedAmpParam; label: string }[] = [
    { key: 'bias', label: 'Bias' },
    { key: 'noiseGate', label: 'Noise Gate' },
    { key: 'threshold', label: 'Gate Thresh' },
    { key: 'sag', label: 'Sag' },
    { key: 'brightness', label: 'Brightness' },
    { key: 'depth', label: 'Depth' },
  ];

  currentAmpName = computed(() => {
    const s = this.settings();
    return s?.model || 'Unknown Amp';
  });

  currentCabName = computed(() => {
    const id = this.settings()?.cabinetId;
    const model = this.cabModels().find(c => c.id === id);
    return model ? model.name : 'Off';
  });

  ampGroups = computed(() => {
    const models = this.ampModels();
    return {
      fender: models.filter(m => m.name.startsWith("'") || m.name.includes('Super-Sonic')),
      british: models.filter(m => m.name.includes('British')),
      other: models.filter(
        m => !m.name.startsWith("'") && !m.name.includes('Super-Sonic') && !m.name.includes('British'),
      ),
    };
  });

  cabGroups = computed(() => {
    const models = this.cabModels();
    return {
      single: models.filter(m => m.name.startsWith('1x')),
      double: models.filter(m => m.name.startsWith('2x')),
      quad: models.filter(m => m.name.startsWith('4x')),
    };
  });

  onAmpChange(value: number | string) {
    this.ampChange.emit(Number(value));
  }

  onCabinetChange(value: number | string) {
    this.cabinetChange.emit(Number(value));
  }

  onKnobChange(index: number, value: number) {
    this.knobChange.emit({ index, value });
  }

  onAdvancedSettingChange(key: AdvancedAmpParam, value: number) {
    this.advancedSettingChange.emit({ key, value });
  }

  getAmpSetting(key: keyof AmpSettings) {
    return this.settings() ? this.settings()![key] : 0;
  }

  getAmpSettingNumberValue(key: keyof AmpSettings): number {
    return Number(this.getAmpSetting(key));
  }
}
