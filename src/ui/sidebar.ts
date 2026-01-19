import { ChangeDetectorRef, Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MustangService } from "../mustang_service";

@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [CommonModule],
  template: `
    <header>
      <h1>ReFUSE</h1>
      <div class="connection">
        <button
          *ngIf="!api.isConnected"
          (click)="api.connect()"
          class="success"
        >
          Connect Amp
        </button>
        <button
          *ngIf="api.isConnected"
          (click)="api.disconnect()"
          class="danger"
        >
          Disconnect
        </button>
      </div>
    </header>

    <div class="presets">
      <h3>Presets ({{ api.currentPresetSlot }})</h3>
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
  `,
})
export class SidebarComponent {
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly api = inject(MustangService);

  protected presetSaveName: string = "";

  ngOnInit() {
    this.api.on("connected", () => {
      if (this.api.currentPresetSlot !== null) {
        this.presetSaveName =
          this.api.presets.get(this.api.currentPresetSlot)?.name || "";
      }
    });

    this.api.on("preset-loaded", (slot, name) => {
      this.presetSaveName = name;
      console.log(slot, this.api.currentPresetSlot);
      this.changeDetector.detectChanges();
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
    await this.api.loadPresetFile(text);
  }

  range(n: number) {
    return Array.from({ length: n }, (_, i) => i);
  }
}
