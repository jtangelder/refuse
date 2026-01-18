import { Component, Input, Output, EventEmitter } from "@angular/core";

@Component({
  selector: "app-knob",
  standalone: true,
  template: `
    <label>
      <span class="name">{{ name }}</span>
      <span class="value">{{ toPercent(value) }}</span>
    </label>
    <input
      type="range"
      min="0"
      max="255"
      [value]="value"
      (input)="onInput($event)"
    />
  `,
})
export class KnobComponent {
  @Input() name!: string;
  @Input() value!: number;
  @Output() valueChange = new EventEmitter<number>();

  toPercent(value: number) {
    return Math.round(value / 2.55);
  }

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(Number(value));
  }
}
