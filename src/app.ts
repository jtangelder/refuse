import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject} from "@angular/core";
import { MustangAPI } from "./lib2/api";
import { FuseLoader } from "./lib2/loader";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button (click)="connect()">Connect to Mustang</button>
      <input type="file" (change)="loadPreset($event)" />
      <p>Connected: {{ api.isConnected }}</p>
    </div>
    <h2>Current Preset:</h2>
    <pre>{{ api.state | json }}</pre>
    <h2>Effect Chain:</h2>
    <div class="chain">

    </div>
  `,
})
export class App {
  protected api = new MustangAPI();
  protected loader = new FuseLoader(this.api);
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    (window as any)["api"] = this.api;

    setInterval(() => {
      this.changeDetector.markForCheck()
    }, 1000);
  }

  async connect() {
    await this.api.connect();
    this.api.monitorPhysicalChanges((...args) => {
      console.log("Physical change detected:", args);
      this.changeDetector.detectChanges();
    });
  }

  async loadPreset(event: any) {
    const file = event.target.files[0];
    const text = await file.text();
    try {
      await this.loader.loadPreset(text);
      alert("Preset loaded!");
    } catch (err) {
      console.error(err);
    }
  }
}
