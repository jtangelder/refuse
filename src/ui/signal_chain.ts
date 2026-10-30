import { Component, ChangeDetectionStrategy, computed, input, output, signal } from '@angular/core';
import { DragDropModule, type CdkDrag, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DspType, getDelayTimeKnobIndex, type EffectSettings, type AmpSettings, type CabinetDef } from '../lib';

export interface ChainEffectItem {
  slot: number;
  position: 'pre' | 'post';
  type: DspType;
  model: string;
  modelId: number;
  enabled: boolean;
  effect: EffectSettings;
  typeTitle: string;
  typeTag: string;
}

export interface EmptySlotPlaceholder {
  category: DspType;
  label: string;
  targetSlot: number;
}

@Component({
  selector: 'fuse-signal-chain',
  imports: [DragDropModule, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tone-canvas">
      <!-- Main Audio Cable Track with Drag & Drop Group -->
      <div class="chain-track" cdkDropListGroup>
        <!-- Continuous Audio Cable running through center -->
        <div class="audio-cable-line" aria-hidden="true">
          <div class="cable-start-arrow"></div>
          <div class="cable-end-dot"></div>
        </div>

        <!-- PRE-AMP DROP LIST -->
        <div
          class="zone-drop-list pre-drop-list"
          cdkDropList
          id="pre-drop-list"
          cdkDropListOrientation="horizontal"
          [cdkDropListData]="preEffects()"
          (cdkDropListDropped)="onDropPre($event)"
        >
          @for (item of preEffects(); track item.type) {
            <!-- Occupied Pedal on Wire (Draggable) -->
            <div
              class="pedal-node"
              cdkDrag
              [cdkDragData]="item"
              [class.selected]="activeSlot() === item.slot"
              [class.bypassed]="!item.enabled"
              (click)="onSelectSlot(item.slot)"
            >
              <!-- Drag Placeholder on Wire -->
              <div class="pedal-drag-placeholder" *cdkDragPlaceholder>
                <div class="placeholder-wire-circle">
                  <mat-icon>add</mat-icon>
                </div>
                <span class="placeholder-label">{{ item.typeTitle }}</span>
              </div>

              <!-- Drag Preview (Floating pedal with aura) -->
              <div class="pedal-drag-preview" *cdkDragPreview>
                <div class="pedal-sprite-frame">
                  <div class="fx-icon {{ getEffectClass(item.model, item.modelId) }}"></div>
                </div>
                <span class="preview-title">{{ item.model }}</span>
              </div>

              <!-- Wire Jack connectors -->
              <div class="jack-socket jack-in"></div>
              <div class="jack-socket jack-out"></div>

              <!-- Bypass LED button -->
              <button
                type="button"
                class="pedal-led-btn"
                [matTooltip]="item.enabled ? 'Click to bypass' : 'Click to enable'"
                (click)="onToggleBypass($event, item)"
              >
                <span class="led-dot" [class.active]="item.enabled"></span>
              </button>

              <!-- Pedal Sprite Frame -->
              <div class="pedal-sprite-frame">
                <div class="fx-icon {{ getEffectClass(item.model, item.modelId) }}"></div>
              </div>

              <!-- Pedal Label & Actions Bar -->
              <div class="pedal-info-bar">
                <span class="pedal-title" [title]="item.model">{{ item.model }}</span>
                <span class="pedal-tag">{{ item.typeTitle }}</span>

                <!-- Hover Action Buttons -->
                <div class="pedal-hover-actions">
                  @if (canMoveToPartner(item)) {
                    <button
                      type="button"
                      class="action-btn"
                      matTooltip="Move to Post-Amp Loop"
                      (click)="onMoveToPartner($event, item)"
                    >
                      <mat-icon>arrow_forward</mat-icon>
                    </button>
                  }
                  <button
                    type="button"
                    class="action-btn remove-btn"
                    matTooltip="Remove pedal"
                    (click)="onClearEffect($event, item.slot)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Empty Slot Nodes on Wire (+ CATEGORY) -->
          @for (empty of preEmptySlots(); track empty.category) {
            <div
              class="wire-empty-node"
              [class.selected]="activeSlot() === empty.targetSlot"
              (click)="onSelectEmpty(empty.targetSlot, empty.category)"
            >
              <div class="empty-slot-card">
                <span class="empty-plus">+</span>
                <span class="empty-label">{{ empty.label }}</span>
              </div>
            </div>
          }
        </div>

        <!-- CENTER: AMPLIFIER (Directly on wire) -->
        <div class="amp-node" [class.selected]="activeSlot() === 'amp'" (click)="onSelectAmp()">
          <!-- Wire Jack connectors -->
          <div class="jack-socket jack-in"></div>
          <div class="jack-socket jack-out"></div>

          <!-- Amp Sprite Frame -->
          <div class="amp-sprite-frame">
            <div class="amp-icon {{ getAmpClass(ampModelName(), ampSettings()?.modelId) }}"></div>
          </div>

          <!-- Amp Info Bar -->
          <div class="amp-info-bar">
            <span class="amp-title">{{ ampModelName() }}</span>
            <span class="cab-title">{{ currentCabName() }}</span>
          </div>
        </div>

        <!-- POST-AMP DROP LIST -->
        <div
          class="zone-drop-list post-drop-list"
          cdkDropList
          id="post-drop-list"
          cdkDropListOrientation="horizontal"
          [cdkDropListData]="postEffects()"
          [cdkDropListEnterPredicate]="canDropInPost"
          (cdkDropListDropped)="onDropPost($event)"
        >
          @for (item of postEffects(); track item.type) {
            <!-- Occupied Post Pedal / Rack on Wire (Draggable) -->
            <div
              class="pedal-node post-node"
              cdkDrag
              [cdkDragData]="item"
              [class.selected]="activeSlot() === item.slot"
              [class.bypassed]="!item.enabled"
              (click)="onSelectSlot(item.slot)"
            >
              <!-- Drag Placeholder on Wire -->
              <div class="pedal-drag-placeholder" *cdkDragPlaceholder>
                <div class="placeholder-wire-circle">
                  <mat-icon>add</mat-icon>
                </div>
                <span class="placeholder-label">{{ item.typeTitle }}</span>
              </div>

              <!-- Drag Preview -->
              <div class="pedal-drag-preview" *cdkDragPreview>
                <div class="pedal-sprite-frame">
                  <div class="fx-icon {{ getEffectClass(item.model, item.modelId) }}"></div>
                </div>
                <span class="preview-title">{{ item.model }}</span>
              </div>

              <div class="jack-socket jack-in"></div>
              <div class="jack-socket jack-out"></div>

              <!-- Bypass LED button -->
              <button
                type="button"
                class="pedal-led-btn"
                [matTooltip]="item.enabled ? 'Click to bypass' : 'Click to enable'"
                (click)="onToggleBypass($event, item)"
              >
                <span class="led-dot" [class.active]="item.enabled"></span>
              </button>

              <div class="pedal-sprite-frame">
                <div class="fx-icon {{ getEffectClass(item.model, item.modelId) }}"></div>
              </div>

              <div class="pedal-info-bar">
                <span class="pedal-title" [title]="item.model">{{ item.model }}</span>
                <span class="pedal-tag">{{ item.typeTitle }}</span>

                <div class="pedal-hover-actions">
                  @if (canMoveToPartner(item)) {
                    <button
                      type="button"
                      class="action-btn"
                      matTooltip="Move to Pre-Amp"
                      (click)="onMoveToPartner($event, item)"
                    >
                      <mat-icon>arrow_back</mat-icon>
                    </button>
                  }
                  <button
                    type="button"
                    class="action-btn remove-btn"
                    matTooltip="Remove effect"
                    (click)="onClearEffect($event, item.slot)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Empty Slot Nodes on Wire (+ CATEGORY) -->
          @for (empty of postEmptySlots(); track empty.category) {
            <div
              class="wire-empty-node"
              [class.selected]="activeSlot() === empty.targetSlot"
              (click)="onSelectEmpty(empty.targetSlot, empty.category)"
            >
              <div class="empty-slot-card">
                <span class="empty-plus">+</span>
                <span class="empty-label">{{ empty.label }}</span>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Fender TONE Bottom Dock Bar -->
      <div class="tone-dock">
        <button type="button" class="dock-btn" (click)="onOpenPresetInfo()">
          <mat-icon aria-hidden="true">info_outline</mat-icon>
          <span>Preset Info</span>
        </button>
        <button type="button" class="dock-btn add-btn" (click)="onQuickAddBlock()">
          <mat-icon aria-hidden="true">add_circle_outline</mat-icon>
          <span>Add Block</span>
        </button>
        <div class="dock-spacer"></div>
        <div class="dock-tap">
          <button
            type="button"
            class="tap-pill"
            (click)="onTapTempo()"
            aria-label="Tap tempo to synchronize active delay time"
          >
            <span class="bpm-value">{{ displayBpm() }} BPM</span>
            <span class="tap-badge">Tap</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./sprites.css'],
  styles: [
    `
      .tone-canvas {
        background: #17181c;
        border-bottom: 1px solid #1f2127;
        padding: 20px 24px 14px;
        position: relative;
        overflow-x: auto;
        user-select: none;
      }

      /* Continuous Track & Audio Cable */
      .chain-track {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 100%;
        padding: 24px 20px;
        min-height: 260px;
      }

      /* The continuous line across the entire track */
      .audio-cable-line {
        position: absolute;
        left: 20px;
        right: 20px;
        top: 50%;
        height: 2px;
        background: #474a56;
        transform: translateY(-50%);
        z-index: 1;
      }

      .cable-start-arrow {
        position: absolute;
        left: -6px;
        top: 50%;
        transform: translateY(-50%);
        width: 0;
        height: 0;
        border-top: 5px solid transparent;
        border-bottom: 5px solid transparent;
        border-left: 8px solid #6b7082;
      }

      .cable-end-dot {
        position: absolute;
        right: -4px;
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #6b7082;
      }

      /* Drop Lists (Pre and Post) */
      .zone-drop-list {
        display: flex;
        align-items: center;
        gap: 16px;
        position: relative;
        z-index: 2;
        margin: 0 12px;
        min-height: 230px;
      }

      /* Jack socket graphics on devices touching the audio wire */
      .jack-socket {
        position: absolute;
        top: 50%;
        width: 6px;
        height: 12px;
        background: #4e515d;
        border: 1px solid #6b7080;
        transform: translateY(-50%);
        z-index: 3;
      }

      .jack-in {
        left: -6px;
        border-radius: 2px 0 0 2px;
      }

      .jack-out {
        right: -6px;
        border-radius: 0 2px 2px 0;
      }

      /* PEDAL NODE (Directly on wire, no box background!) */
      .pedal-node {
        position: relative;
        z-index: 2;
        width: 120px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: grab;
        user-select: none;
        touch-action: none;
        background: transparent;
        border: none;
        outline: none;
        padding: 4px 0;
        flex-shrink: 0;

        &:hover {
          .pedal-hover-actions {
            opacity: 1;
            pointer-events: auto;
          }
        }

        &:active {
          cursor: grabbing;
        }

        &.selected .pedal-sprite-frame {
          filter: drop-shadow(0 0 16px rgba(0, 176, 255, 0.9)) drop-shadow(0 14px 22px rgba(0, 0, 0, 0.95));
        }

        &.bypassed {
          .pedal-sprite-frame {
            opacity: 0.35;
            filter: grayscale(0.7) drop-shadow(0 8px 14px rgba(0, 0, 0, 0.6));
          }

          .pedal-title {
            color: #64748b;
          }
        }
      }

      /* Smooth hover lift ONLY when not dragging in the list */
      :not(.cdk-drop-list-dragging) > .pedal-node:not(.cdk-drag-dragging):not(.cdk-drag-animating) {
        transition: transform 0.2s cubic-bezier(0.2, 0, 0.2, 1);

        &:hover {
          transform: translateY(-4px);
        }
      }

      /* Active element being dragged: hide original in place while placeholder shows */
      .pedal-node.cdk-drag-dragging {
        transition: none !important;
        opacity: 0;
        pointer-events: none;
      }

      /* Sibling pedals in the drop list smoothly slide out of the way when dragging */
      .zone-drop-list.cdk-drop-list-dragging .pedal-node:not(.cdk-drag-placeholder) {
        transition: transform 220ms cubic-bezier(0.2, 0, 0.2, 1) !important;
      }

      /* Bypass LED indicator button above pedal */
      .pedal-led-btn {
        background: transparent;
        border: none;
        padding: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 2px;
      }

      .led-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 4px #ef4444;
        transition: all 0.2s;
      }

      .led-dot.active {
        background: #00e676;
        box-shadow:
          0 0 8px #00e676,
          0 0 12px rgba(0, 230, 118, 0.6);
      }

      /* Pedal Sprite Viewport */
      .pedal-sprite-frame {
        position: relative;
        width: 120px;
        height: 175px;
        overflow: visible;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.85));
        transition:
          filter 0.25s,
          opacity 0.25s;
      }

      .pedal-sprite-frame .device-icon {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.3);
        transform-origin: center center;
        pointer-events: none;
      }

      /* Pedal Info & Hover Actions Bar */
      .pedal-info-bar {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 4px;
        width: 100%;
        position: relative;
      }

      .pedal-title {
        font-size: 0.72rem;
        font-weight: 700;
        color: #f1f5f9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        text-align: center;
      }

      .pedal-tag {
        font-size: 0.6rem;
        font-weight: 700;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.05em;
      }

      .pedal-hover-actions {
        position: absolute;
        top: -2px;
        display: flex;
        align-items: center;
        gap: 3px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
        background: rgba(18, 19, 23, 0.9);
        border: 1px solid #333646;
        border-radius: 4px;
        padding: 2px 4px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.7);
        z-index: 10;
      }

      .action-btn {
        background: transparent;
        border: none;
        color: #cbd5e1;
        cursor: pointer;
        padding: 1px 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;

        &:hover {
          background: #2b2e3c;
          color: #00b0ff;
        }

        mat-icon {
          font-size: 13px;
          width: 13px;
          height: 13px;
        }
      }

      .action-btn.remove-btn:hover {
        color: #f87171;
      }

      /* Drag Preview & Placeholder */
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 8px;
        box-shadow:
          0 20px 30px rgba(0, 0, 0, 0.9),
          0 0 20px rgba(0, 176, 255, 0.8);
        z-index: 9999 !important;
        cursor: grabbing !important;
        pointer-events: none;
      }

      /* Drop animation: smoothly flies the dropped preview to the placeholder */
      .cdk-drag-animating {
        transition: transform 220ms cubic-bezier(0.2, 0, 0.2, 1) !important;
      }

      .pedal-drag-preview {
        display: flex;
        flex-direction: column;
        align-items: center;

        .preview-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #fff;
          background: rgba(0, 0, 0, 0.8);
          padding: 2px 8px;
          border-radius: 4px;
          margin-top: 4px;
        }
      }

      .pedal-drag-placeholder {
        box-sizing: border-box;
        width: 120px;
        height: 175px;
        border: 2px dashed #00b0ff;
        border-radius: 8px;
        background: rgba(0, 176, 255, 0.08);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 0 16px rgba(0, 176, 255, 0.3);
        transition: transform 220ms cubic-bezier(0.2, 0, 0.2, 1);
        flex-shrink: 0;
      }

      .placeholder-wire-circle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #00b0ff;
        color: #000;
        display: flex;
        align-items: center;
        justify-content: center;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .placeholder-label {
        font-size: 0.65rem;
        font-weight: 800;
        color: #00b0ff;
        text-transform: uppercase;
      }

      /* EMPTY WIRE NODE (Matching Fender Tone Empty Slot Card) */
      .wire-empty-node {
        width: 66px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        z-index: 2;
        padding: 4px 2px;
        flex-shrink: 0;

        &:hover {
          .empty-slot-card {
            border-color: #00b0ff;
            background: rgba(0, 176, 255, 0.08);
            box-shadow: 0 0 14px rgba(0, 176, 255, 0.4);

            .empty-plus {
              color: #00b0ff;
            }

            .empty-label {
              color: #00b0ff;
            }
          }
        }

        &.selected .empty-slot-card {
          border-color: #00b0ff;
          box-shadow: 0 0 16px rgba(0, 176, 255, 0.5);
        }
      }

      .empty-slot-card {
        width: 60px;
        height: 110px;
        border: 1px solid #2e313a;
        border-radius: 6px;
        background: rgba(18, 19, 24, 0.7);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .empty-plus {
        font-size: 2rem;
        font-weight: 300;
        color: #434756;
        line-height: 1;
        transition: color 0.2s;
      }

      .empty-label {
        font-size: 0.62rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #4e5364;
        transition: color 0.2s;
        text-align: center;
      }

      /* CENTER AMPLIFIER NODE (Directly on wire) */
      .amp-node {
        position: relative;
        z-index: 2;
        width: 250px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        margin: 0 12px;
        flex-shrink: 0;
        transition: transform 0.2s cubic-bezier(0.2, 0, 0.2, 1);

        &:hover {
          transform: translateY(-4px);
        }

        &.selected .amp-sprite-frame {
          filter: drop-shadow(0 0 20px rgba(0, 176, 255, 0.9)) drop-shadow(0 16px 24px rgba(0, 0, 0, 0.95));
        }
      }

      .amp-sprite-frame {
        position: relative;
        width: 240px;
        height: 180px;
        overflow: visible;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        filter: drop-shadow(0 14px 22px rgba(0, 0, 0, 0.9));
        transition: filter 0.25s;
      }

      .amp-sprite-frame .device-icon {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.36);
        transform-origin: center center;
        pointer-events: none;
      }

      .amp-info-bar {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 6px;
        width: 100%;
      }

      .amp-title {
        font-size: 0.78rem;
        font-weight: 800;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .cab-title {
        font-size: 0.65rem;
        color: #8b92a5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      /* Fender TONE Bottom Dock Bar */
      .tone-dock {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px solid #14151c;
      }

      .dock-btn {
        background: transparent;
        border: none;
        color: #7d8396;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 6px 12px;
        border-radius: 4px;
        transition: all 0.15s;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }

        &:hover {
          color: #f1f5f9;
          background: #121318;
        }

        &.add-btn {
          color: #00b0ff;

          &:hover {
            background: rgba(0, 176, 255, 0.12);
          }
        }
      }

      .dock-spacer {
        flex: 1;
      }

      .dock-tap {
        display: flex;
        align-items: center;
      }

      .tap-pill {
        background: #111216;
        border: 1px solid #282a36;
        color: #f1f5f9;
        border-radius: 16px;
        padding: 4px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        font-weight: 800;
        transition: all 0.15s;

        &:hover {
          border-color: #00b0ff;
          box-shadow: 0 0 10px rgba(0, 176, 255, 0.4);
        }

        &:active {
          transform: scale(0.96);
        }

        .tap-badge {
          background: #232532;
          color: #00b0ff;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 0.65rem;
        }
      }
    `,
  ],
})
export class SignalChainComponent {
  activeSlot = input<number | 'amp' | null>(null);
  effects = input<(EffectSettings | null)[]>([]);
  ampSettings = input<AmpSettings | null>(null);
  cabinetModels = input<CabinetDef[]>([]);

  activeSlotChange = output<number | 'amp'>();
  emptyCategorySelect = output<{ slot: number; category: DspType }>();
  toggleEffect = output<{ slot: number; enabled: boolean }>();
  clearEffect = output<number>();
  movePosition = output<{ fromSlot: number; toSlot: number }>();
  quickAdd = output<void>();
  tapTempoBpm = output<number>();
  openPresetInfo = output<void>();

  // Interactive Tap Tempo BPM
  bpm = signal<number>(120);
  private lastTapTime = 0;

  displayBpm = computed<number>(() => {
    for (const eff of this.effects()) {
      if (eff && eff.type === DspType.DELAY) {
        const timeIdx = getDelayTimeKnobIndex(eff.modelId);
        const timeKnob = timeIdx !== null ? eff.knobs.find(k => k.index === timeIdx) : undefined;
        if (timeKnob && timeKnob.value > 0) {
          const delayMs = (timeKnob.value / 255) * 1500;
          return Math.min(240, Math.max(40, Math.round(60000 / delayMs)));
        }
      }
    }
    return this.bpm();
  });

  ampModelName = computed(() => {
    const s = this.ampSettings();
    if (!s) return "American '90s";
    return s.model || "American '90s";
  });

  currentCabName = computed(() => {
    const id = this.ampSettings()?.cabinetId;
    const cab = this.cabinetModels().find(c => c.id === id);
    return cab ? cab.name : 'Cabinet Off';
  });

  // Active Pre-Amp effects ordered by slot index (slots 0..3)
  preEffects = computed<ChainEffectItem[]>(() => {
    const effs = this.effects();
    const items: ChainEffectItem[] = [];
    for (let s = 0; s < 4; s++) {
      const eff = effs[s];
      if (eff) {
        items.push({
          slot: s,
          position: 'pre',
          type: eff.type,
          model: eff.model,
          modelId: eff.modelId,
          enabled: eff.enabled,
          effect: eff,
          typeTitle: this.getTypeTitle(eff.type),
          typeTag: 'PRE-AMP',
        });
      }
    }
    return items;
  });

  // Active Post-Amp effects ordered by slot index (slots 4..7)
  postEffects = computed<ChainEffectItem[]>(() => {
    const effs = this.effects();
    const items: ChainEffectItem[] = [];
    for (let s = 4; s < 8; s++) {
      const eff = effs[s];
      if (eff) {
        items.push({
          slot: s,
          position: 'post',
          type: eff.type,
          model: eff.model,
          modelId: eff.modelId,
          enabled: eff.enabled,
          effect: eff,
          typeTitle: this.getTypeTitle(eff.type),
          typeTag: 'POST-AMP RACK',
        });
      }
    }
    return items;
  });

  // Empty slot cards for unassigned categories in Pre-Amp
  preEmptySlots = computed<EmptySlotPlaceholder[]>(() => {
    const effs = this.effects();
    const activePreCount = effs.slice(0, 4).filter(e => e !== null).length;
    if (activePreCount >= 4) return [];

    let nextSlot = -1;
    for (let i = 0; i < 4; i++) {
      if (effs[i] === null) {
        nextSlot = i;
        break;
      }
    }
    if (nextSlot === -1) return [];

    const usedTypes = new Set<DspType>();
    for (let i = 0; i < 8; i++) {
      const e = effs[i];
      if (e) usedTypes.add(e.type);
    }

    const placeholders: EmptySlotPlaceholder[] = [];
    const allPreTypes = [
      { type: DspType.STOMP, label: 'STOMP' },
      { type: DspType.MOD, label: 'MOD' },
      { type: DspType.DELAY, label: 'DELAY' },
      { type: DspType.REVERB, label: 'REVERB' },
    ];

    for (const t of allPreTypes) {
      if (!usedTypes.has(t.type)) {
        placeholders.push({
          category: t.type,
          label: t.label,
          targetSlot: nextSlot,
        });
      }
    }
    return placeholders;
  });

  // Empty slot cards for unassigned categories in Post-Amp (Stompbox excluded)
  postEmptySlots = computed<EmptySlotPlaceholder[]>(() => {
    const effs = this.effects();
    const activePostCount = effs.slice(4, 8).filter(e => e !== null).length;
    if (activePostCount >= 4) return [];

    let nextSlot = -1;
    for (let i = 4; i < 8; i++) {
      if (effs[i] === null) {
        nextSlot = i;
        break;
      }
    }
    if (nextSlot === -1) return [];

    const usedTypes = new Set<DspType>();
    for (let i = 0; i < 8; i++) {
      const e = effs[i];
      if (e) usedTypes.add(e.type);
    }

    const placeholders: EmptySlotPlaceholder[] = [];
    const allPostTypes = [
      { type: DspType.MOD, label: 'MOD' },
      { type: DspType.DELAY, label: 'DELAY' },
      { type: DspType.REVERB, label: 'REVERB' },
    ];

    for (const t of allPostTypes) {
      if (!usedTypes.has(t.type)) {
        placeholders.push({
          category: t.type,
          label: t.label,
          targetSlot: nextSlot,
        });
      }
    }
    return placeholders;
  });

  canDropInPost = (drag: CdkDrag<ChainEffectItem>): boolean => {
    // Hardware limitation: Stompbox can ONLY be in Pre-Amp!
    return drag.data.type !== DspType.STOMP;
  };

  onDropPre(event: CdkDragDrop<ChainEffectItem[]>) {
    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;
      const list = this.preEffects();
      if (!list[event.previousIndex] || !list[event.currentIndex]) return;
      const fromSlot = list[event.previousIndex].slot;
      const toSlot = list[event.currentIndex].slot;
      this.movePosition.emit({ fromSlot, toSlot });
    } else {
      // Cross-container: Post to Pre
      const draggedItem = event.item.data as ChainEffectItem;
      if (!draggedItem) return;
      const preList = this.preEffects();
      if (preList.length >= 4) return;
      let toSlot: number;
      if (preList.length === 0) {
        toSlot = 0;
      } else if (event.currentIndex < preList.length) {
        toSlot = preList[event.currentIndex].slot;
      } else {
        toSlot = Math.min(preList.length, 3);
      }
      this.movePosition.emit({ fromSlot: draggedItem.slot, toSlot });
    }
  }

  onDropPost(event: CdkDragDrop<ChainEffectItem[]>) {
    const draggedItem = event.item.data as ChainEffectItem;
    if (!draggedItem) return;

    // Hardware limitation: Stompbox can NEVER be in Post-Amp!
    if (draggedItem.type === DspType.STOMP) return;

    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;
      const list = this.postEffects();
      if (!list[event.previousIndex] || !list[event.currentIndex]) return;
      const fromSlot = list[event.previousIndex].slot;
      const toSlot = list[event.currentIndex].slot;
      this.movePosition.emit({ fromSlot, toSlot });
    } else {
      // Cross-container: Pre to Post
      const postList = this.postEffects();
      if (postList.length >= 4) return;
      let toSlot: number;
      if (postList.length === 0) {
        toSlot = 4;
      } else if (event.currentIndex < postList.length) {
        toSlot = postList[event.currentIndex].slot;
      } else {
        toSlot = Math.min(4 + postList.length, 7);
      }
      this.movePosition.emit({ fromSlot: draggedItem.slot, toSlot });
    }
  }

  onSelectSlot(slot: number) {
    this.activeSlotChange.emit(slot);
  }

  onSelectEmpty(slot: number, category: DspType) {
    this.emptyCategorySelect.emit({ slot, category });
  }

  onSelectAmp() {
    this.activeSlotChange.emit('amp');
  }

  onToggleBypass(event: Event, item: ChainEffectItem) {
    event.stopPropagation();
    this.toggleEffect.emit({
      slot: item.slot,
      enabled: !item.enabled,
    });
  }

  onClearEffect(event: Event, slot: number) {
    event.stopPropagation();
    this.clearEffect.emit(slot);
  }

  canMoveToPartner(item: ChainEffectItem): boolean {
    if (item.type === DspType.STOMP) return false;
    return item.position === 'pre' ? this.postEffects().length < 4 : this.preEffects().length < 4;
  }

  onMoveToPartner(event: Event, item: ChainEffectItem) {
    event.stopPropagation();
    const effs = this.effects();
    if (item.position === 'pre') {
      let target = 4;
      for (let s = 4; s < 8; s++) {
        if (effs[s] === null) {
          target = s;
          break;
        }
      }
      this.movePosition.emit({ fromSlot: item.slot, toSlot: target });
    } else {
      let target = 0;
      for (let s = 0; s < 4; s++) {
        if (effs[s] === null) {
          target = s;
          break;
        }
      }
      this.movePosition.emit({ fromSlot: item.slot, toSlot: target });
    }
  }

  onQuickAddBlock() {
    const preEmpty = this.preEmptySlots();
    if (preEmpty.length > 0) {
      this.onSelectEmpty(preEmpty[0].targetSlot, preEmpty[0].category);
      return;
    }
    const postEmpty = this.postEmptySlots();
    if (postEmpty.length > 0) {
      this.onSelectEmpty(postEmpty[0].targetSlot, postEmpty[0].category);
      return;
    }
    this.quickAdd.emit();
  }

  getTypeTitle(type: DspType): string {
    switch (type) {
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
  }

  onOpenPresetInfo() {
    this.openPresetInfo.emit();
  }

  onTapTempo() {
    const now = performance.now();
    if (this.lastTapTime > 0) {
      const delta = now - this.lastTapTime;
      if (delta > 200 && delta < 3000) {
        const calculatedBpm = Math.min(240, Math.max(40, Math.round(60000 / delta)));
        this.bpm.set(calculatedBpm);
        this.tapTempoBpm.emit(calculatedBpm);
      }
    }
    this.lastTapTime = now;
  }

  getAmpClass(_modelName?: string, modelId?: number): string {
    if (modelId) {
      const idHex = modelId.toString(16).toUpperCase().padStart(4, '0');
      return `device-icon device-0x${idHex}`;
    }
    return 'device-icon device-0x6700';
  }

  getEffectClass(_modelName?: string, modelId?: number): string {
    if (modelId) {
      const idHex = modelId.toString(16).toUpperCase().padStart(4, '0');
      return `device-icon device-0x${idHex}`;
    }
    return 'device-icon device-0x3C00';
  }
}
