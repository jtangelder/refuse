import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-knob',
  standalone: true,
  template: `
    <label>
      <span class="name">{{ name }}</span>
      <span class="value">{{ toPercent(value) }}</span>
    </label>
    <input type="range" min="0" max="255" [value]="value" (input)="onInput($event)" />
  `,
})
export class KnobComponent {
  @Input() name!: string;
  @Input() value!: number;
  @Output() valueChange = new EventEmitter<number>();

  toPercent(value: number) {
    return Math.round(value / 2.55);
  }

  // Don't flood the API with knob changes
  onInput = throttle(this.emitValueChange.bind(this), 50);

  private emitValueChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(Number(value));
  }
}

function throttle<T extends (...args: any[]) => any>(func: T, ms: number) {
  let inThrottle: boolean;
  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, ms);
    }
  };
}
