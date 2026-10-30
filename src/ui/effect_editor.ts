import { Component, ChangeDetectionStrategy, computed, input, output } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { KnobComponent } from './knob';
import { DspType, type EffectSettings, type ModelDef } from '../lib';

@Component({
  selector: 'fuse-effect-editor',
  imports: [MatMenuModule, MatButtonModule, MatIconModule, MatCheckboxModule, KnobComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card">
      @if (activeSlot() !== null) {
        <header class="editor-header">
          <!-- Position & Category Tag -->
          <div class="slot-badge-group">
            <span class="slot-pos-badge" [class.rack]="isPostAmp()">
              {{ isPostAmp() ? 'POST-AMP RACK' : 'PRE-AMP PEDAL' }}
            </span>
            <span class="slot-title">{{ slotCategoryName() }}</span>
          </div>

          <!-- Bypass Checkbox with indicator -->
          <div class="bypass-control">
            @if (effect()) {
              <mat-checkbox
                [checked]="effect()!.enabled"
                (change)="onToggleEffect($event.checked)"
                color="primary"
                class="bypass-checkbox"
              >
                <span class="status-indicator" [class.active]="effect()!.enabled"></span>
                <span>{{ effect()!.enabled ? 'Active' : 'Bypassed' }}</span>
              </mat-checkbox>
            }
          </div>

          <!-- Model Dropdown -->
          <div class="model-selector">
            <button mat-button [matMenuTriggerFor]="typeMenu" class="model-select-btn">
              <span class="model-label">{{ currentModelName() }}</span>
              <mat-icon class="dropdown-icon" aria-hidden="true">arrow_drop_down</mat-icon>
            </button>

            <mat-menu #typeMenu="matMenu">
              @if (effect()) {
                <button mat-menu-item class="remove-menu-item" (click)="onClearSlot()">
                  <mat-icon>delete_outline</mat-icon>
                  <span>Remove Effect</span>
                </button>
              }
              @for (m of categoryModels(); track m.id) {
                <button
                  mat-menu-item
                  (click)="onAssignEffect(m.id)"
                  [class.selected-model]="effect()?.modelId === m.id"
                >
                  <mat-icon>{{ effect()?.modelId === m.id ? 'check' : 'radio_button_unchecked' }}</mat-icon>
                  <span>{{ m.name }}</span>
                </button>
              }
            </mat-menu>
          </div>

          <!-- Quick Actions: Move Pre/Post & Clear -->
          <div class="header-actions">
            @if (canMovePosition()) {
              <button
                type="button"
                class="pos-switch-btn"
                (click)="onMovePosition()"
                [title]="isPostAmp() ? 'Move this effect to Pre-Amp Pedalboard' : 'Move this effect to Post-Amp Rack'"
              >
                <mat-icon>{{ isPostAmp() ? 'reply' : 'forward' }}</mat-icon>
                <span>{{ isPostAmp() ? 'Move to Pedals' : 'Move to Rack' }}</span>
              </button>
            }

            @if (effect()) {
              <button type="button" class="clear-btn" (click)="onClearSlot()" title="Remove this effect from the slot">
                <mat-icon>delete_outline</mat-icon>
                <span>Remove</span>
              </button>
            }
          </div>
        </header>

        <!-- Knobs Grid -->
        @if (effect() && effect()!.knobs.length > 0) {
          <div class="knob-grid">
            @for (knob of effect()!.knobs; track knob.index) {
              <div class="knob-control">
                <fuse-knob
                  [name]="knob.name"
                  [value]="knob.value"
                  (valueChange)="onKnobChange(knob.index, $event)"
                ></fuse-knob>
              </div>
            }
          </div>
        } @else if (effect()) {
          <div class="empty-state">
            <p>No parameter knobs available for this model.</p>
          </div>
        } @else {
          <!-- Empty Slot Model Gallery -->
          <div class="empty-slot-gallery">
            <div class="gallery-header">
              <h3>Assign {{ slotCategoryName() }}</h3>
              <p>Choose an effect model below to assign to this {{ isPostAmp() ? 'rack' : 'pedal' }} slot:</p>
            </div>

            <div class="model-chip-grid">
              @for (m of categoryModels(); track m.id) {
                <button
                  type="button"
                  class="model-chip"
                  (click)="onAssignEffect(m.id)"
                  [attr.aria-label]="'Assign ' + m.name"
                >
                  <mat-icon class="chip-icon">add</mat-icon>
                  <span class="chip-name">{{ m.name }}</span>
                </button>
              }
            </div>

            <p class="muted-note">
              Amp hardware rule: each category (Stomp, Mod, Delay, Reverb) can only be active once in the preset.
            </p>
          </div>
        }
      } @else {
        <div class="empty-state">
          <p>Click a slot in the signal chain above to view and edit its settings.</p>
        </div>
      }
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

      .editor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        padding-bottom: 20px;
        margin-bottom: 28px;
        border-bottom: 1px solid #27272a;
      }

      .slot-badge-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .slot-pos-badge {
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        padding: 3px 8px;
        border-radius: 4px;
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }

      .slot-pos-badge.rack {
        background: rgba(14, 165, 233, 0.15);
        color: #38bdf8;
        border-color: rgba(56, 189, 248, 0.3);
      }

      .slot-title {
        font-size: 1.15rem;
        font-weight: 700;
        color: #f4f4f5;
      }

      .bypass-control {
        display: flex;
        align-items: center;
      }

      .status-indicator {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 6px #ef4444;
        margin-right: 6px;
        vertical-align: middle;
      }

      .status-indicator.active {
        background: #10b981;
        box-shadow: 0 0 8px #10b981;
      }

      .model-selector {
        flex: 1;
        min-width: 200px;
        max-width: 320px;
      }

      .model-select-btn {
        width: 100%;
        background: #27272a;
        border: 1px solid #3f3f46;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 500;
        text-transform: none;
        transition: all 0.15s;

        &:hover {
          border-color: #71717a;
          background: #333338;
        }
      }

      .model-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .pos-switch-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(14, 165, 233, 0.12);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.3);
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;

        &:hover {
          background: rgba(14, 165, 233, 0.25);
          border-color: #38bdf8;
        }

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .clear-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: rgba(239, 68, 68, 0.1);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.25);
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;

        &:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #f87171;
        }

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .remove-menu-item {
        color: #f87171 !important;
      }

      .selected-model {
        color: #38bdf8 !important;
      }

      .knob-grid {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 32px;
        padding: 10px 0;
      }

      .knob-control {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      /* Empty Slot Gallery */
      .empty-slot-gallery {
        text-align: center;
        padding: 24px 16px;
      }

      .gallery-header h3 {
        font-size: 1.25rem;
        font-weight: 700;
        color: #f4f4f5;
        margin-bottom: 6px;
      }

      .gallery-header p {
        font-size: 0.9rem;
        color: #a1a1aa;
        margin: 0 0 20px 0;
      }

      .model-chip-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: center;
        max-width: 700px;
        margin: 0 auto 24px;
      }

      .model-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #202024;
        border: 1px solid #3f3f46;
        color: #e4e4e7;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;

        &:hover {
          background: #2e2e34;
          border-color: #38bdf8;
          color: #fff;
          transform: translateY(-1px);
        }

        .chip-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          color: #38bdf8;
        }
      }

      .muted-note {
        font-size: 0.8rem;
        color: #71717a;
        margin: 0;
      }

      .empty-state {
        text-align: center;
        padding: 40px 10px;
        color: #71717a;
      }

      .icon {
        font-family: 'Material Symbols Outlined';
      }
    `,
  ],
})
export class EffectEditorComponent {
  activeSlot = input<number | null>(null);
  slotCategory = input<DspType | null>(null);
  effect = input<EffectSettings | null>(null);
  allEffects = input<(EffectSettings | null)[]>([]);
  effectModels = input<ModelDef[]>([]);

  assignChange = output<number>();
  toggleChange = output<boolean>();
  knobChange = output<{ index: number; value: number }>();
  clearRequest = output<void>();
  movePositionRequest = output<{ fromSlot: number; toSlot: number }>();

  protected DspType = DspType;

  isPostAmp = computed(() => {
    const slot = this.activeSlot();
    return slot !== null && slot >= 4;
  });

  currentCategory = computed<DspType>(() => {
    return this.effect()?.type ?? this.slotCategory() ?? (this.isPostAmp() ? DspType.MOD : DspType.STOMP);
  });

  slotCategoryName = computed(() => {
    switch (this.currentCategory()) {
      case DspType.STOMP:
        return 'Stompbox';
      case DspType.MOD:
        return 'Modulation';
      case DspType.DELAY:
        return 'Delay';
      case DspType.REVERB:
        return 'Reverb';
      default:
        return 'Effect';
    }
  });

  categoryModels = computed(() => {
    const cat = this.currentCategory();
    return this.effectModels().filter(m => m.type === cat);
  });

  currentModelName = computed(() => {
    const eff = this.effect();
    if (!eff || !eff.modelId) {
      return `-- Select ${this.slotCategoryName()} Model --`;
    }
    return eff.model || 'Unknown';
  });

  canMovePosition = computed(() => {
    const cat = this.currentCategory();
    return !!this.effect() && cat !== DspType.STOMP;
  });

  onAssignEffect(modelId: number | string) {
    this.assignChange.emit(Number(modelId));
  }

  onToggleEffect(enabled: boolean) {
    this.toggleChange.emit(enabled);
  }

  onKnobChange(index: number, value: number) {
    this.knobChange.emit({ index, value });
  }

  onClearSlot() {
    this.clearRequest.emit();
  }

  onMovePosition() {
    const slot = this.activeSlot();
    if (slot === null) return;
    const effs = this.allEffects();
    const toStart = slot < 4 ? 4 : 0;
    let targetSlot = toStart;
    for (let s = toStart; s < toStart + 4; s++) {
      if (!effs[s]) {
        targetSlot = s;
        break;
      }
    }
    this.movePositionRequest.emit({ fromSlot: slot, toSlot: targetSlot });
  }
}
