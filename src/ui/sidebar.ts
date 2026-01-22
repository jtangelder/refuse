import { ChangeDetectorRef, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FuseService } from '../services/fuse.service';
import { PresetService } from '../services/preset.service';

@Component({
  selector: 'fuse-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header>
      <h1>ReFUSE</h1>
      <div class="connection">
        <button *ngIf="!service.connected()" (click)="service.api.connect()" class="success">Connect Amp</button>
        <button *ngIf="service.connected()" (click)="service.api.disconnect()" class="danger">Disconnect</button>
      </div>
    </header>

    <div class="presets">
      <h3>Presets</h3>
      <ul>
        <li *ngFor="let i of range(24)">
          <button (click)="changePreset(i)" [class.active]="service.currentPresetSlot() === i">
            <span class="slot-num">{{ i + 1 | number: '2.0' }}:</span>
            <span>{{ service.presets().get(i)?.name || 'Preset ' + (i + 1) }}</span>
          </button>
        </li>
      </ul>
    </div>
    <div class="preset-controls">
      <button (click)="savePreset()" class="secondary">Save preset</button>
      <button class="secondary" (click)="fileInput.click()">Import preset</button>
      <input #fileInput type="file" (change)="importFusePreset($event)" style="display: none;" />
    </div>
  `,
})
export class SidebarComponent {
  protected readonly service = inject(FuseService);
  protected readonly presetService = inject(PresetService);

  private presetSaveName = computed(() => {
    const slot = this.service.currentPresetSlot();
    if (slot === null) return '';
    return this.service.presets().get(slot)?.name || '';
  });

  async changePreset(slot: number) {
    await this.presetService.loadPreset(slot);
  }

  async savePreset() {
    const slot = this.service.currentPresetSlot();
    if (slot === null || slot === undefined) return;

    // We can use the computed signal for default name
    const currentName = this.presetSaveName();

    const name = window.prompt('Enter a name for your preset', currentName);
    if (!name) return;

    await this.presetService.savePreset(slot, name);
  }

  async importFusePreset(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    await this.presetService.loadXml(text);
  }

  range(n: number) {
    return Array.from({ length: n }, (_, i) => i);
  }
}
