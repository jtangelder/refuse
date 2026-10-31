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
              tabindex="0"
              role="button"
              [attr.aria-label]="item.typeTitle + ': ' + item.model"
              (click)="onSelectSlot(item.slot)"
              (keydown.enter)="onSelectSlot(item.slot)"
              (keydown.space)="$event.preventDefault(); onSelectSlot(item.slot)"
            >
              <!-- Drag Placeholder on Wire -->
              <div class="pedal-drag-placeholder" *cdkDragPlaceholder>
                <div class="placeholder-wire-circle">
                  <mat-icon aria-hidden="true">add</mat-icon>
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
              <div class="jack-socket jack-in" aria-hidden="true"></div>
              <div class="jack-socket jack-out" aria-hidden="true"></div>

              <!-- Bypass LED button -->
              <button
                type="button"
                class="pedal-led-btn"
                [attr.aria-pressed]="item.enabled"
                [attr.aria-label]="(item.enabled ? 'Bypass ' : 'Enable ') + item.model"
                [matTooltip]="item.enabled ? 'Click to bypass' : 'Click to enable'"
                (click)="onToggleBypass($event, item)"
              >
                <span class="led-dot" [class.active]="item.enabled" aria-hidden="true"></span>
              </button>

              <!-- Pedal Sprite Frame -->
              <div class="pedal-sprite-frame" aria-hidden="true">
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
                      [attr.aria-label]="'Move ' + item.model + ' to Post-Amp Loop'"
                      matTooltip="Move to Post-Amp Loop"
                      (click)="onMoveToPartner($event, item)"
                    >
                      <mat-icon aria-hidden="true">arrow_forward</mat-icon>
                    </button>
                  }
                  <button
                    type="button"
                    class="action-btn remove-btn"
                    [attr.aria-label]="'Remove ' + item.model"
                    matTooltip="Remove pedal"
                    (click)="onClearEffect($event, item.slot)"
                  >
                    <mat-icon aria-hidden="true">close</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Empty Slot Nodes on Wire (+ CATEGORY) -->
          @for (empty of preEmptySlots(); track empty.category) {
            <button
              type="button"
              class="wire-empty-node"
              [class.selected]="activeSlot() === empty.targetSlot"
              [attr.aria-label]="'Add ' + empty.label"
              (click)="onSelectEmpty(empty.targetSlot, empty.category)"
            >
              <span class="empty-slot-card">
                <span class="empty-plus" aria-hidden="true">+</span>
                <span class="empty-label">{{ empty.label }}</span>
              </span>
            </button>
          }
        </div>

        <!-- CENTER: AMPLIFIER (Directly on wire) -->
        <div
          class="amp-node"
          [class.selected]="activeSlot() === 'amp'"
          tabindex="0"
          role="button"
          [attr.aria-label]="'Amplifier: ' + ampModelName() + ', ' + currentCabName()"
          (click)="onSelectAmp()"
          (keydown.enter)="onSelectAmp()"
          (keydown.space)="$event.preventDefault(); onSelectAmp()"
        >
          <!-- Wire Jack connectors -->
          <div class="jack-socket jack-in" aria-hidden="true"></div>
          <div class="jack-socket jack-out" aria-hidden="true"></div>

          <!-- Amp Sprite Frame -->
          <div class="amp-sprite-frame" aria-hidden="true">
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
              tabindex="0"
              role="button"
              [attr.aria-label]="item.typeTitle + ': ' + item.model"
              (click)="onSelectSlot(item.slot)"
              (keydown.enter)="onSelectSlot(item.slot)"
              (keydown.space)="$event.preventDefault(); onSelectSlot(item.slot)"
            >
              <!-- Drag Placeholder on Wire -->
              <div class="pedal-drag-placeholder" *cdkDragPlaceholder>
                <div class="placeholder-wire-circle">
                  <mat-icon aria-hidden="true">add</mat-icon>
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

              <div class="jack-socket jack-in" aria-hidden="true"></div>
              <div class="jack-socket jack-out" aria-hidden="true"></div>

              <!-- Bypass LED button -->
              <button
                type="button"
                class="pedal-led-btn"
                [attr.aria-pressed]="item.enabled"
                [attr.aria-label]="(item.enabled ? 'Bypass ' : 'Enable ') + item.model"
                [matTooltip]="item.enabled ? 'Click to bypass' : 'Click to enable'"
                (click)="onToggleBypass($event, item)"
              >
                <span class="led-dot" [class.active]="item.enabled" aria-hidden="true"></span>
              </button>

              <div class="pedal-sprite-frame" aria-hidden="true">
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
                      [attr.aria-label]="'Move ' + item.model + ' to Pre-Amp'"
                      matTooltip="Move to Pre-Amp"
                      (click)="onMoveToPartner($event, item)"
                    >
                      <mat-icon aria-hidden="true">arrow_back</mat-icon>
                    </button>
                  }
                  <button
                    type="button"
                    class="action-btn remove-btn"
                    [attr.aria-label]="'Remove ' + item.model"
                    matTooltip="Remove effect"
                    (click)="onClearEffect($event, item.slot)"
                  >
                    <mat-icon aria-hidden="true">close</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Empty Slot Nodes on Wire (+ CATEGORY) -->
          @for (empty of postEmptySlots(); track empty.category) {
            <button
              type="button"
              class="wire-empty-node"
              [class.selected]="activeSlot() === empty.targetSlot"
              [attr.aria-label]="'Add ' + empty.label"
              (click)="onSelectEmpty(empty.targetSlot, empty.category)"
            >
              <span class="empty-slot-card">
                <span class="empty-plus" aria-hidden="true">+</span>
                <span class="empty-label">{{ empty.label }}</span>
              </span>
            </button>
          }
        </div>
      </div>

      <!-- Bottom Dock Bar -->
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
        background: var(--mat-sys-surface-container-low);
        border: none;
        border-radius: var(--md-corner-xl);
        margin: 0 24px;
        padding: 20px 24px 16px;
        position: relative;
        overflow-x: auto;
        user-select: none;
      }

      @media (max-width: 850px) {
        .tone-canvas {
          margin: 0 12px;
          padding: 16px;
        }
      }

      /* Continuous Track & Audio Cable */
      .chain-track {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 100%;
        box-sizing: border-box;
        padding: 24px 20px;
        min-height: 260px;
      }

      /* The continuous line across the entire track */
      .audio-cable-line {
        position: absolute;
        left: 20px;
        right: 20px;
        top: 50%;
        height: 3px;
        background: var(--mat-sys-surface-container-highest);
        border-radius: 999px;
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
        border-left: 8px solid var(--mat-sys-outline);
      }

      .cable-end-dot {
        position: absolute;
        right: -4px;
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--mat-sys-outline);
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
        background: var(--mat-sys-surface-container-highest);
        border: none;
        transform: translateY(-50%);
        z-index: 3;
      }

      .jack-in {
        left: -6px;
        border-radius: 3px 0 0 3px;
      }

      .jack-out {
        right: -6px;
        border-radius: 0 3px 3px 0;
      }

      /* PEDAL NODE */
      .pedal-node {
        position: relative;
        z-index: 2;
        width: 120px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: grab;
        user-select: none;
        touch-action: pan-y;
        background: transparent;
        border: none;
        border-radius: var(--md-corner-md);
        padding: 4px 0;
        flex-shrink: 0;

        &:hover,
        &:focus-within {
          .pedal-hover-actions {
            opacity: 1;
            pointer-events: auto;
          }
        }

        &:focus-visible {
          outline: 2px solid var(--mat-sys-primary);
          outline-offset: 2px;
        }

        &:active {
          cursor: grabbing;
        }

        &.selected .pedal-sprite-frame {
          filter: drop-shadow(0 0 14px rgba(140, 207, 249, 0.7)) drop-shadow(0 12px 20px rgba(0, 0, 0, 0.85));
        }

        &.bypassed {
          .pedal-sprite-frame {
            opacity: 0.35;
            filter: grayscale(0.7) drop-shadow(0 8px 14px rgba(0, 0, 0, 0.6));
          }

          .pedal-title {
            color: var(--mat-sys-on-surface-variant);
          }
        }
      }

      /* Smooth hover lift ONLY when not dragging in the list */
      :not(.cdk-drop-list-dragging) > .pedal-node:not(.cdk-drag-dragging):not(.cdk-drag-animating) {
        transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);

        @media (prefers-reduced-motion: no-preference) {
          &:hover {
            transform: translateY(-4px);
          }
        }
      }

      .pedal-node.cdk-drag-dragging {
        transition: none !important;
        opacity: 0;
        pointer-events: none;
      }

      .zone-drop-list.cdk-drop-list-dragging .pedal-node:not(.cdk-drag-placeholder) {
        transition: transform 200ms cubic-bezier(0.2, 0, 0, 1) !important;
      }

      /* Bypass LED indicator button above pedal */
      .pedal-led-btn {
        background: transparent;
        border: none;
        padding: 4px;
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
        background: var(--mat-sys-error);
        transition:
          background-color 0.2s,
          box-shadow 0.2s;
      }

      .led-dot.active {
        background: #34d399;
        box-shadow: 0 0 8px rgba(52, 211, 153, 0.65);
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
        filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.8));
        transition:
          filter 0.2s,
          opacity 0.2s;
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
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        text-align: center;
      }

      .pedal-tag {
        font-size: 0.65rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
      }

      .pedal-hover-actions {
        position: absolute;
        top: -2px;
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
        background: var(--mat-sys-surface-container-highest);
        border: none;
        border-radius: var(--md-corner-full);
        padding: 3px 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
        z-index: 10;
      }

      .action-btn {
        background: transparent;
        border: none;
        color: var(--mat-sys-on-surface);
        cursor: pointer;
        padding: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;

        &:hover {
          background: var(--mat-sys-secondary-container);
          color: var(--mat-sys-on-secondary-container);
        }

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }

      .action-btn.remove-btn:hover {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }

      /* Drag Preview & Placeholder */
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: var(--md-corner-md);
        box-shadow:
          0 20px 30px rgba(0, 0, 0, 0.8),
          0 0 16px rgba(140, 207, 249, 0.5);
        z-index: 9999 !important;
        cursor: grabbing !important;
        pointer-events: none;
      }

      .cdk-drag-animating {
        transition: transform 200ms cubic-bezier(0.2, 0, 0, 1) !important;
      }

      .pedal-drag-preview {
        display: flex;
        flex-direction: column;
        align-items: center;

        .preview-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--mat-sys-on-surface);
          background: var(--mat-sys-surface-container-high);
          padding: 3px 10px;
          border-radius: var(--md-corner-sm);
          margin-top: 4px;
        }
      }

      .pedal-drag-placeholder {
        box-sizing: border-box;
        width: 120px;
        height: 175px;
        border: none;
        border-radius: var(--md-corner-lg);
        background: var(--mat-sys-surface-container-high);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .placeholder-wire-circle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
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
        font-size: 0.68rem;
        font-weight: 600;
        color: var(--mat-sys-primary);
      }

      /* EMPTY WIRE NODE (Borderless M3 Tonal Surface Card) */
      .wire-empty-node {
        width: 68px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        z-index: 2;
        padding: 4px 2px;
        background: transparent;
        border: none;
        flex-shrink: 0;

        &:hover {
          .empty-slot-card {
            background: var(--mat-sys-surface-container-highest);

            .empty-plus,
            .empty-label {
              color: var(--mat-sys-primary);
            }
          }
        }

        &.selected .empty-slot-card {
          background: var(--mat-sys-secondary-container);

          .empty-plus,
          .empty-label {
            color: var(--mat-sys-on-secondary-container);
          }
        }
      }

      .empty-slot-card {
        width: 62px;
        height: 112px;
        border: none;
        border-radius: var(--md-corner-lg);
        background: var(--mat-sys-surface-container-high);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: background-color 0.15s cubic-bezier(0.2, 0, 0, 1);
      }

      .empty-plus {
        font-size: 1.75rem;
        font-weight: 300;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1;
        transition: color 0.15s;
      }

      .empty-label {
        font-size: 0.62rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--mat-sys-on-surface-variant);
        transition: color 0.15s;
        text-align: center;
      }

      /* CENTER AMPLIFIER NODE */
      .amp-node {
        position: relative;
        z-index: 2;
        width: 250px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        margin: 0 12px;
        border-radius: var(--md-corner-md);
        flex-shrink: 0;
        transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);

        @media (prefers-reduced-motion: no-preference) {
          &:hover {
            transform: translateY(-4px);
          }
        }

        &:focus-visible {
          outline: 2px solid var(--mat-sys-primary);
          outline-offset: 2px;
        }

        &.selected .amp-sprite-frame {
          filter: drop-shadow(0 0 16px rgba(140, 207, 249, 0.7)) drop-shadow(0 16px 24px rgba(0, 0, 0, 0.9));
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
        filter: drop-shadow(0 14px 22px rgba(0, 0, 0, 0.85));
        transition: filter 0.2s;
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
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .cab-title {
        font-size: 0.68rem;
        color: var(--mat-sys-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      /* Bottom Dock Bar — M3 Assist Chips (32px height, 8px radius, tonal surface-container-high) */
      .tone-dock {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        padding-top: 6px;
        border-top: none;
      }

      .dock-btn {
        height: 32px;
        background: var(--mat-sys-surface-container-high);
        border: none;
        color: var(--mat-sys-on-surface);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
        font-weight: 500;
        padding: 0 12px;
        border-radius: var(--md-corner-sm);
        transition:
          color 0.15s cubic-bezier(0.2, 0, 0, 1),
          background-color 0.15s cubic-bezier(0.2, 0, 0, 1);

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          color: var(--mat-sys-primary);
        }

        &:hover {
          background: var(--mat-sys-surface-container-highest);
        }

        &.add-btn {
          background: var(--mat-sys-secondary-container);
          color: var(--mat-sys-on-secondary-container);

          mat-icon {
            color: var(--mat-sys-on-secondary-container);
          }

          &:hover {
            background: var(--mat-sys-primary-container);
            color: var(--mat-sys-on-primary-container);
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
        height: 32px;
        background: var(--mat-sys-surface-container-high);
        border: none;
        color: var(--mat-sys-on-surface);
        border-radius: var(--md-corner-sm);
        padding: 0 10px 0 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
        font-size: 0.75rem;
        font-weight: 600;
        transition: background-color 0.15s cubic-bezier(0.2, 0, 0, 1);

        &:hover {
          background: var(--mat-sys-surface-container-highest);
        }

        .tap-badge {
          background: var(--mat-sys-secondary-container);
          color: var(--mat-sys-on-secondary-container);
          padding: 2px 8px;
          border-radius: 6px;
          font-family: var(--font-sans);
          font-size: 0.6875rem;
          font-weight: 600;
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
