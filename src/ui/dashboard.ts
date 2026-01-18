import { Component, inject } from "@angular/core";
import { AMP_MODELS, CABINET_MODELS, DspType, EFFECT_MODELS } from "../lib/api";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { KnobComponent } from "./knob";
import { MustangService } from "../mustang_service";

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  template: ` <!-- Signal Chain Status -->
    <div class="signal-chain-strip">
      <div class="amplifier">Amplifier</div>
      <div
        *ngFor="let i of range(8)"
        class="slot"
        [class.active]="activeSlot === i"
        [class.empty]="!getEffectSettings(i)"
        [style.order]="i * 10"
        (click)="activeSlot = i"
      >
        <span class="slot-num">{{ i }}</span>
        <div *ngIf="getEffectSettings(i) as effect; else emptySlot">
          <div class="badge" [style.background]="getFamilyColor(effect.type)">
            {{ getFamilyLabel(effect.type) }}
          </div>
          <div>{{ effect.model }}</div>
          <div>{{ effect.enabled ? "● ACTIVE" : "○ BYPASSED" }}</div>
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
          <select
            [ngModel]="getAmpSettings()?.modelId"
            (ngModelChange)="changeAmp($event)"
          >
            @for (model of ampModels; track model.id) {
              <option [value]="model.id">{{ model.name }}</option>
            }
          </select>
        </header>

        <div class="knob-grid">
          @for (knob of getAmpKnobs(); track knob.name) {
            <div class="knob-control">
              <app-knob
                [name]="knob.name"
                [value]="knob.value"
                (valueChange)="changeAmpKnob(knob.index, $event)"
              ></app-knob>
            </div>
          }
        </div>

        <div>
          <label>Cabinet</label>
          <select
            [ngModel]="api.getCabinetId()"
            (ngModelChange)="changeCabinet($event)"
          >
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
                <app-knob
                  [name]="setting.label"
                  [value]="getAmpSettings()?.[setting.key]"
                  (valueChange)="changeAdvancedSetting(setting.key, $event)"
                ></app-knob>
              </div>
            }
          </div>
        </details>
      </section>

      <!-- Slot Control -->
      <section class="card">
        <header>
          <h3>Slot {{ activeSlot !== null ? activeSlot : "" }}</h3>
          <div *ngIf="activeSlot !== null">
            <select
              [ngModel]="getEffectSettings(activeSlot)?.modelId || 0"
              (ngModelChange)="assignEffect(activeSlot, $event)"
            >
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
                <input
                  type="checkbox"
                  [ngModel]="effect.enabled"
                  (ngModelChange)="toggleEffect(activeSlot, $event)"
                />
                <span>{{ effect.enabled ? "Active" : "Bypassed" }}</span>
              </label>
              <div>Type: 0x{{ effect.type.toString(16) }}</div>
            </div>

            <div class="knob-grid">
              @for (knob of effect.knobs; track knob.index) {
                <div class="knob-control">
                  <app-knob
                    [name]="knob.name"
                    [value]="knob.value"
                    (valueChange)="
                      changeEffectKnob(activeSlot, knob.index, $event)
                    "
                  ></app-knob>
                </div>
              }
            </div>

            <div>
              <label>Slot</label>
              <div>
                @for (i of range(8); track i) {
                  <button
                    (click)="swapSlots(activeSlot, i)"
                    [disabled]="i === activeSlot"
                    class="secondary"
                    style="padding: 4px 8px; font-size: 0.8rem; margin-right: 5px;"
                  >
                    {{ i }}
                  </button>
                }
                <button
                  (click)="clearSlot(activeSlot)"
                  class="secondary"
                  style="padding: 4px 8px; font-size: 0.8rem;"
                >
                  Clear
                </button>
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
            Click a slot in the signal chain above to view and edit its
            settings.
          </div>
        </ng-template>
      </section>
    </div>`,
})
export class DashboardComponent {
  protected readonly api = inject(MustangService);

  protected activeSlot: number | null = null;

  protected ampModels = Object.values(AMP_MODELS);
  protected cabModels = CABINET_MODELS;
  protected effectModels = Object.values(EFFECT_MODELS);

  protected advancedSettings: { key: string; label: string }[] = [
    { key: "bias", label: "Bias" },
    { key: "noiseGate", label: "Noise Gate" },
    { key: "threshold", label: "Gate Thresh" },
    { key: "sag", label: "Sag" },
    { key: "brightness", label: "Brightness" },
    { key: "depth", label: "Depth" },
  ];

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
      bias: 42,
      noiseGate: 47,
      threshold: 48,
      sag: 51,
      brightness: 52,
      depth: 41,
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

  getAmpSettings() {
    return this.api.getAmpSettings() as any;
  }
  getAmpKnobs() {
    return this.api.getAmpKnobs();
  }
  getEffectSettings(slot: number) {
    return this.api.getEffectSettings(slot);
  }

  getModelsForFamily(type: DspType) {
    return this.effectModels.filter((m) => m.type === type);
  }

  getFamilyLabel(type: DspType) {
    switch (type) {
      case DspType.STOMP:
        return "STOMP";
      case DspType.MOD:
        return "MOD";
      case DspType.DELAY:
        return "DELAY";
      case DspType.REVERB:
        return "REVERB";
      default:
        return "UNKNOWN";
    }
  }

  getFamilyColor(type: DspType) {
    switch (type) {
      case DspType.STOMP:
        return "#e74c3c";
      case DspType.MOD:
        return "#3498db";
      case DspType.DELAY:
        return "#f1c40f";
      case DspType.REVERB:
        return "#2ecc71";
      default:
        return "#444";
    }
  }

  range(n: number) {
    return Array.from({ length: n }, (_, i) => i);
  }
}
