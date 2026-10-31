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
          <span class="amp-tag">Amplifier</span>
          <h2 class="header-main-title">Tone Controls &amp; Cabinets</h2>
        </div>

        <div class="selectors-row">
          <!-- Amp Model Selector -->
          <div class="selector-group">
            <span class="selector-label">Amp Model</span>
            <button mat-button [matMenuTriggerFor]="ampRootMenu" class="model-select-btn">
              <span class="btn-text">{{ currentAmpName() }}</span>
              <mat-icon class="dropdown-icon" aria-hidden="true">arrow_drop_down</mat-icon>
            </button>
            <mat-menu #ampRootMenu="matMenu">
              <button mat-menu-item [matMenuTriggerFor]="fenderMenu">Fender Amps</button>
              <button mat-menu-item [matMenuTriggerFor]="britishMenu">British Amps</button>
              <button mat-menu-item [matMenuTriggerFor]="otherMenu">High Gain &amp; Studio</button>
            </mat-menu>

            <mat-menu #fenderMenu="matMenu">
              @for (model of ampGroups().fender; track model.id) {
                <button
                  mat-menu-item
                  (click)="onAmpChange(model.id)"
                  [class.selected-menu-item]="settings()?.modelId === model.id"
                >
                  <mat-icon aria-hidden="true">{{
                    settings()?.modelId === model.id ? 'check' : 'radio_button_unchecked'
                  }}</mat-icon>
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
                  <mat-icon aria-hidden="true">{{
                    settings()?.modelId === model.id ? 'check' : 'radio_button_unchecked'
                  }}</mat-icon>
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
                  <mat-icon aria-hidden="true">{{
                    settings()?.modelId === model.id ? 'check' : 'radio_button_unchecked'
                  }}</mat-icon>
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
              <mat-icon class="dropdown-icon" aria-hidden="true">arrow_drop_down</mat-icon>
            </button>
            <mat-menu #cabRootMenu="matMenu">
              <button mat-menu-item (click)="onCabinetChange(0)">
                <mat-icon aria-hidden="true">{{
                  settings()?.cabinetId === 0 ? 'check' : 'radio_button_unchecked'
                }}</mat-icon>
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
                  <mat-icon aria-hidden="true">{{
                    settings()?.cabinetId === cab.id ? 'check' : 'radio_button_unchecked'
                  }}</mat-icon>
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
                  <mat-icon aria-hidden="true">{{
                    settings()?.cabinetId === cab.id ? 'check' : 'radio_button_unchecked'
                  }}</mat-icon>
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
                  <mat-icon aria-hidden="true">{{
                    settings()?.cabinetId === cab.id ? 'check' : 'radio_button_unchecked'
                  }}</mat-icon>
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
          <mat-icon class="summary-icon" aria-hidden="true">tune</mat-icon>
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
      /* M3 Filled Card (Borderless Tonal Containment) */
      .card {
        background: var(--mat-sys-surface-container-low);
        border: none;
        border-radius: var(--md-corner-xl);
        padding: 24px;
        margin-bottom: 24px;
      }

      .amp-editor-header {
        display: flex;
        flex-direction: column;
        gap: 18px;
        margin-bottom: 20px;
      }

      .header-titles {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      /* M3 Assist/Filter Chip Badge (8px corner radius) */
      .amp-tag {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 12px;
        border-radius: var(--md-corner-sm);
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }

      .header-main-title {
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--mat-sys-on-surface);
        margin: 0;
      }

      .selectors-row {
        display: flex;
        gap: 16px;
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
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
        padding-left: 4px;
      }

      /* M3 Filled Tonal Selector Field (Borderless) */
      .model-select-btn {
        width: 100%;
        height: 44px;
        background: var(--mat-sys-surface-container-high);
        border: none;
        color: var(--mat-sys-on-surface);
        padding: 0 16px;
        border-radius: var(--md-corner-md);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 500;
        text-transform: none;
        transition: background-color 0.15s cubic-bezier(0.2, 0, 0, 1);

        &:hover {
          background: var(--mat-sys-surface-container-highest);
        }
      }

      .btn-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dropdown-icon {
        color: var(--mat-sys-on-surface-variant);
      }

      .selected-menu-item {
        color: var(--mat-sys-primary) !important;
      }

      .knobs-section {
        background: var(--mat-sys-surface-container);
        border-radius: 20px;
        padding: 24px 20px;
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
        margin-top: 16px;
        background: var(--mat-sys-surface-container);
        border-radius: var(--md-corner-lg);
        padding: 14px 20px;
      }

      summary {
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.875rem;
        font-weight: 500;
        user-select: none;
        transition: color 0.15s;
        list-style: none;

        &::-webkit-details-marker {
          display: none;
        }

        &:hover {
          color: var(--mat-sys-on-surface);
        }

        .summary-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--mat-sys-primary);
        }
      }

      .advanced-grid {
        margin-top: 16px;
        padding: 20px 12px;
        background: var(--mat-sys-surface-container-high);
        border-radius: var(--md-corner-md);
        border: none;
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
