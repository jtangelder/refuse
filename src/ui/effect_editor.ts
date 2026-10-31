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
              {{ isPostAmp() ? 'Post-Amp Rack' : 'Pre-Amp Pedal' }}
            </span>
            <h2 class="slot-title">{{ slotCategoryName() }}</h2>
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
                  <mat-icon aria-hidden="true">delete_outline</mat-icon>
                  <span>Remove Effect</span>
                </button>
              }
              @for (m of categoryModels(); track m.id) {
                <button
                  mat-menu-item
                  (click)="onAssignEffect(m.id)"
                  [class.selected-model]="effect()?.modelId === m.id"
                >
                  <mat-icon aria-hidden="true">{{
                    effect()?.modelId === m.id ? 'check' : 'radio_button_unchecked'
                  }}</mat-icon>
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
                <mat-icon aria-hidden="true">{{ isPostAmp() ? 'reply' : 'forward' }}</mat-icon>
                <span>{{ isPostAmp() ? 'Move to Pedals' : 'Move to Rack' }}</span>
              </button>
            }

            @if (effect()) {
              <button type="button" class="clear-btn" (click)="onClearSlot()" title="Remove this effect from the slot">
                <mat-icon aria-hidden="true">delete_outline</mat-icon>
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
                  <mat-icon class="chip-icon" aria-hidden="true">add</mat-icon>
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
      /* M3 Filled Card (Borderless Tonal Containment) */
      .card {
        background: var(--mat-sys-surface-container-low);
        border: none;
        border-radius: var(--md-corner-xl);
        padding: 24px;
        margin-bottom: 24px;
      }

      .editor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        margin-bottom: 20px;
      }

      .slot-badge-group {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      /* M3 Chip Badge (8px corner radius) */
      .slot-pos-badge {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 12px;
        border-radius: var(--md-corner-sm);
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }

      .slot-pos-badge.rack {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }

      .slot-title {
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--mat-sys-on-surface);
        margin: 0;
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
        background: var(--mat-sys-error);
        margin-right: 6px;
        vertical-align: middle;
      }

      .status-indicator.active {
        background: #34d399;
      }

      .model-selector {
        flex: 1;
        min-width: 200px;
        max-width: 320px;
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

      .model-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* M3 Tonal Action Pills */
      .pos-switch-btn {
        height: 36px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
        border: none;
        padding: 0 14px;
        border-radius: var(--md-corner-full);
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        transition:
          background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
          color 0.15s cubic-bezier(0.2, 0, 0, 1);

        &:hover {
          background: var(--mat-sys-primary-container);
          color: var(--mat-sys-on-primary-container);
        }

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .clear-btn {
        height: 36px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--mat-sys-surface-container-high);
        color: var(--mat-sys-error);
        border: none;
        padding: 0 14px;
        border-radius: var(--md-corner-full);
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        transition:
          background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
          color 0.15s cubic-bezier(0.2, 0, 0, 1);

        &:hover {
          background: var(--mat-sys-error-container);
          color: var(--mat-sys-on-error-container);
        }

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .remove-menu-item {
        color: var(--mat-sys-error) !important;
      }

      .selected-model {
        color: var(--mat-sys-primary) !important;
      }

      .knob-grid {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 32px;
        background: var(--mat-sys-surface-container);
        border-radius: 20px;
        padding: 24px 20px;
      }

      .knob-control {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      /* Empty Slot Gallery (M3 Suggestion / Assist Chips per m3.material.io/components/chips/overview) */
      .empty-slot-gallery {
        text-align: center;
        background: var(--mat-sys-surface-container);
        border-radius: 20px;
        padding: 28px 20px;
      }

      .gallery-header h3 {
        font-size: 1.15rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
        margin: 0 0 6px 0;
      }

      .gallery-header p {
        font-size: 0.875rem;
        color: var(--mat-sys-on-surface-variant);
        margin: 0 0 20px 0;
      }

      .model-chip-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        max-width: 720px;
        margin: 0 auto 24px;
      }

      /* M3 Elevated / Tonal Assist Chip: 32px height, 8px corner radius, borderless tonal container */
      .model-chip {
        height: 34px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--mat-sys-surface-container-high);
        border: none;
        color: var(--mat-sys-on-surface);
        padding: 0 14px 0 10px;
        border-radius: var(--md-corner-sm);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition:
          background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
          color 0.15s cubic-bezier(0.2, 0, 0, 1);

        &:hover {
          background: var(--mat-sys-secondary-container);
          color: var(--mat-sys-on-secondary-container);

          .chip-icon {
            color: var(--mat-sys-on-secondary-container);
          }
        }

        .chip-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          color: var(--mat-sys-primary);
          transition: color 0.15s;
        }
      }

      .muted-note {
        font-size: 0.78rem;
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }

      .empty-state {
        text-align: center;
        padding: 40px 16px;
        background: var(--mat-sys-surface-container);
        border-radius: 20px;
        color: var(--mat-sys-on-surface-variant);
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
