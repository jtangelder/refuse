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
