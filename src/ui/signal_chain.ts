import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { DspType, type EffectSettings, type AmpSettings, type CabinetDef } from '../lib';

@Component({
  selector: 'fuse-signal-chain',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  template: `
    <div class="signal-chain-strip" cdkDropListGroup>
      <!-- Pre-Amp Slots (0-3) -->
      <div class="group-container">
        <div class="background-layer">
          <div class="slot empty placeholder" *ngFor="let _ of [0, 1, 2, 3]">
            <div class="empty-label">Empty</div>
          </div>
        </div>
        <div
          class="slot-group"
          cdkDropList
          cdkDropListOrientation="horizontal"
          cdkDropListLockAxis="x"
          [cdkDropListData]="preAmpSlots"
          (cdkDropListDropped)="drop($event)"
        >
          <div
            *ngFor="let i of preAmpSlots; trackBy: trackByFn"
            class="slot"
            cdkDrag
            [cdkDragData]="i"
            [class.active]="activeSlot === i"
            [class.empty]="!effects[i]"
            (click)="selectSlot(i)"
          >
            <span class="slot-num">{{ i + 1 }}</span>
            <div *ngIf="effects[i] as effect; else emptySlot">
              <div class="badge" [style.background]="getFamilyColor(effect.type)">
                {{ getFamilyLabel(effect.type) }}
              </div>
              <div class="model-name">{{ effect.model }}</div>
              <div class="status">{{ effect.enabled ? '●' : '○' }}</div>
            </div>
            <ng-template #emptySlot>
              <div class="empty-label">Empty</div>
            </ng-template>
            <!-- Placeholder for drag preview -->
            <div *cdkDragPlaceholder class="slot-placeholder"></div>
          </div>
        </div>
      </div>

      <!-- Amplifier -->
      <div class="slot amplifier" [class.active]="activeSlot === 'amp'" (click)="selectAmp()">
        <ng-container *ngIf="ampSettings; else emptyAmp">
          <div class="badge" style="background: #e67e22; color: #fff; margin-bottom: 4px;">AMP</div>
          <div class="model-name">{{ ampSettings.model }}</div>
          <div class="cabinet-name">{{ getCabinetName(ampSettings.cabinetId) }}</div>
        </ng-container>
        <ng-template #emptyAmp>
          <span class="slot-label">AMP</span>
          <div class="amp-icon">⚡</div>
        </ng-template>
      </div>

      <!-- Post-Amp Slots (4-7) -->
      <div class="group-container">
        <div class="background-layer">
          <div class="slot empty placeholder" *ngFor="let _ of [0, 1, 2, 3]">
            <div class="empty-label">Empty</div>
          </div>
        </div>
        <div
          class="slot-group"
          cdkDropList
          cdkDropListOrientation="horizontal"
          cdkDropListLockAxis="x"
          [cdkDropListData]="postAmpSlots"
          (cdkDropListDropped)="drop($event)"
        >
          <div
            *ngFor="let i of postAmpSlots; trackBy: trackByFn"
            class="slot"
            cdkDrag
            [cdkDragData]="i"
            [class.active]="activeSlot === i"
            [class.empty]="!effects[i]"
            (click)="selectSlot(i)"
          >
            <span class="slot-num">{{ i + 1 }}</span>
            <div *ngIf="effects[i] as effect; else emptySlot">
              <div class="badge" [style.background]="getFamilyColor(effect.type)">
                {{ getFamilyLabel(effect.type) }}
              </div>
              <div class="model-name">{{ effect.model }}</div>
              <div class="status">{{ effect.enabled ? '●' : '○' }}</div>
            </div>
            <ng-template #emptySlot>
              <div class="empty-label">Empty</div>
            </ng-template>
            <!-- Placeholder for drag preview -->
            <div *cdkDragPlaceholder class="slot-placeholder"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .signal-chain-strip {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 15px;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
        align-items: center;
        justify-content: center;
        min-height: 110px;
      }
      .group-container {
        position: relative;
        min-width: 424px; /* 4 * 100 + 3 * 8 */
        height: 100px;
      }
      .background-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        gap: 8px;
        z-index: 0;
      }
      .slot-group {
        position: relative;
        z-index: 1;
        display: flex;
        gap: 8px;
        min-height: 100px; /* Ensure drop zone area */
      }
      /* Visual fix: Hide the 5th item if dragged in (list growth) */
      .slot-group .slot:nth-child(n + 5) {
        display: none !important;
      }
      .slot-placeholder,
      .slot {
        background: #2a2a2a;
        border: 2px solid #333;
        padding: 8px;
        width: 100px;
        height: 100px;
        cursor: grab;
        position: relative;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-shrink: 0;
      }
      .slot:active {
        cursor: grabbing;
      }
      .slot:hover {
        background: #333;
        border-color: #555;
        transform: translateY(-2px);
      }
      .slot.active {
        border-color: #3498db;
        background: #2c3e50;
        box-shadow: 0 0 10px rgba(52, 152, 219, 0.3);
      }
      .slot.empty {
        opacity: 0.5;
        border-style: dashed;
      }
      .amplifier {
        background: #333;
        border-color: #555;
        align-items: center;
        justify-content: center;
        width: 110px;
        height: 110px;
        z-index: 10;
        cursor: pointer;
        display: flex;
        flex-direction: column;
      }
      .amplifier.active {
        border-color: #e67e22;
        background: #5d4037;
        box-shadow: 0 0 15px rgba(230, 126, 34, 0.4);
      }
      .slot-num {
        position: absolute;
        top: 4px;
        right: 4px;
        font-size: 0.7rem;
        color: #666;
        font-weight: bold;
      }
      .slot-label {
        font-weight: bold;
        color: #aaa;
        letter-spacing: 1px;
      }
      .amp-icon {
        font-size: 2rem;
        margin-top: 5px;
      }
      .badge {
        display: inline-block;
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 0.6rem;
        font-weight: bold;
        color: #fff;
        text-transform: uppercase;
        align-self: flex-start;
      }
      .model-name {
        font-size: 0.75rem;
        line-height: 1.1;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        font-weight: 500;
        margin-top: 2px;
        flex-grow: 1;
      }
      .cabinet-name {
        font-size: 0.65rem;
        color: #aaa;
        margin-top: auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      .status {
        font-size: 0.7rem;
        color: #aaa;
        margin-top: auto;
      }
      .empty-label {
        color: #555;
        font-style: italic;
        margin: auto;
        font-size: 0.9rem;
      }
      /* Drag and Drop Styles */
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 6px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
        background: #2a2a2a;
        opacity: 0.9;
        width: 100px;
        height: 100px;
        display: flex;
        flex-direction: column;
        padding: 8px;
        border: 2px solid #3498db;
      }
      .cdk-drag-placeholder {
        opacity: 0.3;
        background: #444;
        border: 2px dashed #777;
      }
      .cdk-drag-animating {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
      }
      .slot-group.cdk-drop-list-dragging .slot:not(.cdk-drag-placeholder) {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
      }
    `,
  ],
})
export class SignalChainComponent {
  @Input() activeSlot: number | 'amp' | null = null;
  @Input() effects: (EffectSettings | null)[] = [];
  @Input() ampSettings: AmpSettings | null = null;
  @Input() cabinetModels: CabinetDef[] = [];
  @Output() activeSlotChange = new EventEmitter<number | 'amp'>();
  @Output() move = new EventEmitter<{ fromSlot: number; toSlot: number }>();

  preAmpSlots = this.range(0, 4);
  postAmpSlots = this.range(4, 8);

  selectSlot(index: number) {
    this.activeSlotChange.emit(index);
  }

  selectAmp() {
    this.activeSlotChange.emit('amp');
  }

  drop(event: CdkDragDrop<number[]>) {
    if (event.previousContainer === event.container) {
      // Same container move
      if (event.previousIndex !== event.currentIndex) {
        const fromSlot = event.item.data;
        // Clamp index to array bounds to avoid undefined
        const targetIndex = Math.min(event.currentIndex, event.container.data.length - 1);
        const toSlot = event.container.data[targetIndex];

        if (fromSlot !== undefined && toSlot !== undefined) {
          this.move.emit({ fromSlot, toSlot });
        }
      }
    } else {
      // Different container (Pre <-> Post)
      const fromSlot = event.item.data;
      // Clamp index
      const targetIndex = Math.min(event.currentIndex, event.container.data.length - 1);
      const toSlot = event.container.data[targetIndex];

      if (fromSlot !== undefined && toSlot !== undefined) {
        this.move.emit({ fromSlot, toSlot });
      }
    }
  }

  // Helper to generate range [start, end)
  range(start: number, end: number) {
    const result = [];
    for (let i = start; i < end; i++) {
      result.push(i);
    }
    return result;
  }

  trackByFn(index: number, item: number) {
    return item;
  }

  getCabinetName(id: number) {
    const cab = this.cabinetModels.find(c => c.id === id);
    return cab ? cab.name : `Cab ${id}`;
  }

  getFamilyLabel(type: DspType) {
    switch (type) {
      case DspType.STOMP:
        return 'Stomp';
      case DspType.MOD:
        return 'Mod';
      case DspType.DELAY:
        return 'Delay';
      case DspType.REVERB:
        return 'Reverb';
      default:
        return '?';
    }
  }

  getFamilyColor(type: DspType) {
    switch (type) {
      case DspType.STOMP:
        return '#e74c3c';
      case DspType.MOD:
        return '#3498db';
      case DspType.DELAY:
        return '#f1c40f';
      case DspType.REVERB:
        return '#2ecc71';
      default:
        return '#444';
    }
  }
}
