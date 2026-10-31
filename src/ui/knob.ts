import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';

@Component({
  selector: 'fuse-knob',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="knob-container"
      [class.knob-dragging]="isDragging()"
      tabindex="0"
      role="slider"
      [attr.aria-label]="name()"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuemin]="min()"
      [attr.aria-valuemax]="max()"
      [attr.aria-valuetext]="displayValue()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerCancel($event)"
      (keydown)="onKeyDown($event)"
    >
      <div class="knob" [style.transform]="'rotate(' + rotation() + 'deg)'">
        <!-- SVG Knob Graphic (M3 Tonal Rotary Control) -->
        <svg viewBox="0 0 100 100" class="knob-svg" aria-hidden="true">
          <circle cx="50" cy="50" r="46" fill="#151c25" />
          <circle cx="50" cy="50" r="38" fill="#232e3c" />
          <!-- Indicator Line -->
          <line x1="50" y1="44" x2="50" y2="15" stroke="#8ccff9" stroke-width="4" stroke-linecap="round" />
        </svg>
      </div>

      @if (isDragging()) {
        <div class="tooltip" role="status" aria-live="polite">
          {{ displayValue() }}
        </div>
      }
    </div>

    <span class="name">{{ name() }}</span>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        width: 100%;
        user-select: none;
      }

      .knob-container {
        position: relative;
        width: 60px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        outline: none;
        touch-action: pan-x;
      }

      .knob-container:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 4px;
      }

      .knob {
        width: 100%;
        height: 100%;
        cursor: ns-resize;
        transition: transform 0.1s cubic-bezier(0.2, 0, 0, 1);

        @media (prefers-reduced-motion: reduce) {
          transition: none;
        }
      }

      /* Disable transition when dragging for instant response */
      .knob-dragging .knob {
        transition: none;
      }

      .knob-svg {
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
      }

      .tooltip {
        position: absolute;
        top: -34px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        padding: 3px 10px;
        border-radius: var(--md-corner-full);
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
        font-size: 0.75rem;
        font-weight: 600;
        pointer-events: none;
        z-index: 100;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
        white-space: nowrap;
      }

      .name {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
        text-align: center;
      }
    `,
  ],
})
export class KnobComponent {
  name = input.required<string>();
  value = input.required<number>();
  min = input(0);
  max = input(255);

  valueChange = output<number>();

  isDragging = signal(false);

  // Computed rotation: Map min-max to -135deg to +135deg (270deg range)
  rotation = computed(() => {
    const val = this.value();
    const min = this.min();
    const max = this.max();
    const range = max - min;
    const normalized = range > 0 ? (val - min) / range : 0;
    return -135 + normalized * 270;
  });

  // Display value: Map min-max to 0.0 - 10.0
  displayValue = computed(() => {
    const val = this.value();
    const min = this.min();
    const max = this.max();
    const range = max - min;
    const normalized = range > 0 ? ((val - min) / range) * 10 : 0;
    return normalized.toFixed(1);
  });

  private startY = 0;
  private startValue = 0;
  private activePointerId: number | null = null;

  onPointerDown(event: PointerEvent) {
    this.isDragging.set(true);
    this.startY = event.clientY;
    this.startValue = this.value();
    this.activePointerId = event.pointerId;

    const el = event.currentTarget as HTMLElement;
    if (el.setPointerCapture) {
      el.setPointerCapture(event.pointerId);
    }
  }

  onPointerMove(event: PointerEvent) {
    if (!this.isDragging() || this.activePointerId !== event.pointerId) return;

    const deltaY = this.startY - event.clientY; // Up is positive
    const min = this.min();
    const max = this.max();
    const range = max - min;

    // Sensitivity: 200 pixels for full range
    const pixelsForFullRange = 200;
    const change = (deltaY / pixelsForFullRange) * range;

    let newValue = this.startValue + change;
    newValue = Math.max(min, Math.min(max, newValue));

    const rounded = Math.round(newValue);
    if (rounded !== this.value()) {
      this.valueChange.emit(rounded);
    }
  }

  onPointerUp(event: PointerEvent) {
    if (this.activePointerId === event.pointerId) {
      this.isDragging.set(false);
      this.activePointerId = null;
      const el = event.currentTarget as HTMLElement;
      if (el.releasePointerCapture) {
        try {
          el.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore if pointer capture was already released
        }
      }
    }
  }

  onPointerCancel(event: PointerEvent) {
    this.onPointerUp(event);
  }

  onKeyDown(event: KeyboardEvent) {
    const min = this.min();
    const max = this.max();
    const current = this.value();
    const range = max - min;
    const unitStep = Math.max(1, Math.round(range / 100));
    const step = event.shiftKey ? unitStep * 5 : unitStep;
    const bigStep = Math.max(5, Math.round(range / 10));

    let nextValue: number | null = null;

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        nextValue = Math.min(max, current + step);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        nextValue = Math.max(min, current - step);
        break;
      case 'PageUp':
        nextValue = Math.min(max, current + bigStep);
        break;
      case 'PageDown':
        nextValue = Math.max(min, current - bigStep);
        break;
      case 'Home':
        nextValue = min;
        break;
      case 'End':
        nextValue = max;
        break;
    }

    if (nextValue !== null) {
      event.preventDefault();
      const rounded = Math.round(nextValue);
      if (rounded !== current) {
        this.valueChange.emit(rounded);
      }
    }
  }
}
