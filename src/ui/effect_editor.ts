import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KnobComponent } from './knob';
import { DspType, type EffectSettings, type ModelDef } from '../lib';

@Component({
  selector: 'fuse-effect-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  template: `
    <section class="card">
      <header>
        <h3>Slot {{ activeSlot !== null ? activeSlot : '' }}</h3>
        <div *ngIf="activeSlot !== null">
          <select [ngModel]="effect?.modelId || 0" (ngModelChange)="onAssignEffect($event)">
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
        <div *ngIf="effect; else emptySlot">
          <div>
            <label>
              <input type="checkbox" [ngModel]="effect.enabled" (ngModelChange)="onToggleEffect($event)" />
              <span>{{ effect.enabled ? 'Active' : 'Bypassed' }}</span>
            </label>
            <div>Type: 0x{{ effect.type.toString(16) }}</div>
          </div>

          <div class="knob-grid">
            @for (knob of effect.knobs; track knob.index) {
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
            <label>Slot</label>
            <div>
              @for (i of range(8); track i) {
                <button
                  (click)="onSwapSlots(activeSlot!, i)"
                  [disabled]="i === activeSlot"
                  class="secondary"
                  style="padding: 4px 8px; font-size: 0.8rem; margin-right: 5px;"
                >
                  {{ i }}
                </button>
              }
              <button (click)="onClearSlot()" class="secondary" style="padding: 4px 8px; font-size: 0.8rem;">
                Clear
              </button>
            </div>
          </div>
        </div>

        <ng-template #emptySlot>
          <div *ngIf="!effect">
            <p>Select an effect model above to assign to this slot.</p>
            <p>Note, an effect can only be assigned to one slot at a time.</p>
          </div>
        </ng-template>
      </div>

      <ng-template #noActiveSlot>
        <div>Click a slot in the signal chain above to view and edit its settings.</div>
      </ng-template>
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
      label {
        color: #ddd;
      }
      .secondary {
        background: #444;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: pointer;
      }
      .secondary:hover {
        background: #555;
      }
      .secondary:disabled {
        opacity: 0.5;
        cursor: default;
      }
    `,
  ],
})
export class EffectEditorComponent {
  @Input() activeSlot: number | null = null;
  @Input() effect: EffectSettings | null = null;
  @Input() effectModels: ModelDef[] = [];

  @Output() assignChange = new EventEmitter<number>();
  @Output() toggleChange = new EventEmitter<boolean>();
  @Output() knobChange = new EventEmitter<{ index: number; value: number }>();
  @Output() swapRequests = new EventEmitter<{ slotA: number; slotB: number }>();
  @Output() clearRequest = new EventEmitter<void>();

  protected DspType = DspType;

  onAssignEffect(modelId: number) {
    this.assignChange.emit(modelId);
  }

  onToggleEffect(enabled: boolean) {
    this.toggleChange.emit(enabled);
  }

  onKnobChange(index: number, value: number) {
    this.knobChange.emit({ index, value });
  }

  onSwapSlots(slotA: number, slotB: number) {
    this.swapRequests.emit({ slotA, slotB });
  }

  onClearSlot() {
    this.clearRequest.emit();
  }

  getModelsForFamily(type: DspType) {
    return this.effectModels.filter(m => m.type === type);
  }

  range(n: number) {
    return Array.from({ length: n }, (_, i) => i);
  }
}
