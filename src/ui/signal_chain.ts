import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DspType } from '../lib/api';

@Component({
  selector: 'fuse-signal-chain',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="signal-chain-strip">
      <div class="amplifier">Amplifier</div>
      <div
        *ngFor="let i of range(8)"
        class="slot"
        [class.active]="activeSlot === i"
        [class.empty]="!effects[i]"
        [style.order]="i * 10"
        (click)="selectSlot(i)"
      >
        <span class="slot-num">{{ i }}</span>
        <div *ngIf="effects[i] as effect; else emptySlot">
          <div class="badge" [style.background]="getFamilyColor(effect.type)">
            {{ getFamilyLabel(effect.type) }}
          </div>
          <div>{{ effect.model }}</div>
          <div>{{ effect.enabled ? '● ACTIVE' : '○ BYPASSED' }}</div>
        </div>
        <ng-template #emptySlot>
          <div>Empty</div>
        </ng-template>
      </div>
    </div>
  `,
  styles: [
    `
      .signal-chain-strip {
        display: flex;
        gap: 10px;
        overflow-x: auto;
        padding: 10px;
        background: #222;
        border-bottom: 1px solid #444;
      }
      .amplifier {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100px;
        background: #444;
        color: #fff;
        font-weight: bold;
        border-radius: 4px;
        margin-right: 20px;
      }
      .slot {
        background: #333;
        border: 1px solid #555;
        padding: 10px;
        min-width: 120px;
        cursor: pointer;
        position: relative;
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .slot:hover {
        background: #3a3a3a;
      }
      .slot.active {
        border-color: #3498db;
        background: #2c3e50;
      }
      .slot.empty {
        opacity: 0.6;
      }
      .slot-num {
        position: absolute;
        top: 5px;
        right: 5px;
        font-size: 0.8rem;
        color: #777;
      }
      .badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.7rem;
        font-weight: bold;
        color: #fff;
      }
    `,
  ],
})
export class SignalChainComponent {
  @Input() activeSlot: number | null = null;
  @Input() effects: any[] = [];
  @Output() activeSlotChange = new EventEmitter<number>();

  selectSlot(index: number) {
    this.activeSlotChange.emit(index);
  }

  range(n: number) {
    return Array.from({ length: n }, (_, i) => i);
  }

  getFamilyLabel(type: DspType) {
    switch (type) {
      case DspType.STOMP:
        return 'STOMP';
      case DspType.MOD:
        return 'MOD';
      case DspType.DELAY:
        return 'DELAY';
      case DspType.REVERB:
        return 'REVERB';
      default:
        return 'UNKNOWN';
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
