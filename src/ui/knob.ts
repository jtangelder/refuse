import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';

@Component({
  selector: 'fuse-knob',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './knob.ng.html',
  styleUrl: './knob.scss',
})
export class KnobComponent {
  name = input.required<string>();
  value = input.required<number>();
  min = input(0);
  max = input(255);
  labels = input<readonly string[] | undefined>(undefined);
  disabled = input(false);

  valueChange = output<number>();

  isDragging = signal(false);

  isDiscrete = computed(() => {
    const lbls = this.labels();
    return (lbls !== undefined && lbls.length > 0) || this.max() < 255;
  });

  // Computed rotation: Map min-max to -135deg to +135deg (270deg range)
  rotation = computed(() => {
    const min = this.min();
    const max = this.max();
    const val = Math.max(min, Math.min(max, this.value()));
    const range = max - min;
    const normalized = range > 0 ? (val - min) / range : 0;
    return -135 + normalized * 270;
  });

  // Display value: Discrete label/integer when discrete, otherwise 0.0 - 10.0
  displayValue = computed(() => {
    const min = this.min();
    const max = this.max();
    const val = Math.max(min, Math.min(max, Math.round(this.value())));
    const lbls = this.labels();
    if (lbls && lbls.length > 0) {
      const idx = Math.max(0, Math.min(lbls.length - 1, val - min));
      return lbls[idx];
    }
    if (max < 255) {
      return String(val);
    }
    const range = max - min;
    const normalized = range > 0 ? ((val - min) / range) * 10 : 0;
    return normalized.toFixed(1);
  });

  private startY = 0;
  private startValue = 0;
  private activePointerId: number | null = null;

  onPointerDown(event: PointerEvent) {
    if (this.disabled()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
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
    if (this.disabled() || !this.isDragging() || this.activePointerId !== event.pointerId) return;

    const deltaY = this.startY - event.clientY; // Up is positive
    const min = this.min();
    const max = this.max();
    const range = max - min;

    // Sensitivity: compact drag distance for small discrete ranges, 200px for continuous 0..255
    const pixelsForFullRange = range <= 25 ? Math.min(200, Math.max(60, range * 24)) : 200;
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
    if (this.disabled()) return;
    const min = this.min();
    const max = this.max();
    const current = this.value();
    const range = max - min;
    const unitStep = Math.max(1, Math.round(range / 100));
    const step = event.shiftKey ? (range <= 25 ? Math.min(range, 2) : unitStep * 5) : unitStep;
    const bigStep = range <= 25 ? Math.max(1, Math.round(range / 4)) : Math.max(5, Math.round(range / 10));

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
