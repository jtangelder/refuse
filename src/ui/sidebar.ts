import { ChangeDetectorRef, Component, inject, Input } from "@angular/core";
import type { MustangAPI } from "../lib/api";
import { FuseLoader } from "../lib/loader";

@Component({
  selector: "app-sidebar",
  template: `
    <div class="sidebar">
      <header>
        <h1>ReFUSE</h1>
        <div class="connection">
          <button *ngIf="!api.isConnected" (click)="connect()" class="success">
            Connect Amp
          </button>
          <button *ngIf="api.isConnected" (click)="disconnect()" class="danger">
            Disconnect
          </button>
        </div>
      </header>

      <div class="presets">
        <h3>Presets</h3>
        <ul>
          <li *ngFor="let i of range(24)">
            <button
              (click)="changePreset(i)"
              [class.active]="api.currentPresetSlot === i"
            >
              <span class="slot-num">{{ i | number: "2.0" }}:</span>
              <span>{{ api.presets.get(i)?.name || "Preset " + i }}</span>
            </button>
          </li>
        </ul>
      </div>
      <hr />
      <div class="preset-controls">
        <button (click)="savePreset()" class="secondary">Save preset</button>
        <button class="secondary" (click)="fileInput.click()">
          Import preset
        </button>
        <input
          #fileInput
          type="file"
          (change)="importFusePreset($event)"
          style="display: none;"
        />
      </div>
    </div>
  `,
})
export class SidebarComponent {
  @Input() api!: MustangAPI;

  protected loader = new FuseLoader(this.api);
  private readonly changeDetector = inject(ChangeDetectorRef);

  protected presetSaveName: string = "";

  constructor() {
    this.api.on("connected", () => {
      if (this.api.currentPresetSlot !== null) {
        this.presetSaveName =
          this.api.presets.get(this.api.currentPresetSlot)?.name || "";
      }
    });

    this.api.on("preset-loaded", (slot, name) => {
      this.presetSaveName = name;
      this.changeDetector.markForCheck();
    });
  }

  async changePreset(slot: number) {
    await this.api.loadPreset(Number(slot));
  }

  async savePreset() {
    if (this.api.currentPresetSlot === null) return;
    const name = window.prompt(
      "Enter a name for your preset",
      this.presetSaveName,
    );
    if (!name) return;
    this.presetSaveName = name;
    await this.api.savePreset(this.api.currentPresetSlot, this.presetSaveName);
  }

  async importFusePreset(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    await this.loader.loadPreset(text);
  }

  range(n: number) {
    return Array.from({ length: n }, (_, i) => i);
  }
}
