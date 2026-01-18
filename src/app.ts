import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  signal,
  Input,
  Output,
  EventEmitter,
  viewChild,
} from "@angular/core";
import { MustangAPI } from "./lib/api";
import { CommonModule } from "@angular/common";
import { SidebarComponent } from "./ui/sidebar";
import { DashboardComponent } from "./ui/dashboard";
import { WelcomeComponent } from "./ui/welcome";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    DashboardComponent,
    WelcomeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` @if (api.isConnected) {
      <div class="container">
        @if (!isReady) {
          <div class="loading-overlay">
            <h1>Receiving data from the amplifier...</h1>
          </div>
        }
        <app-sidebar [api]="api"></app-sidebar>
        <app-dashboard [api]="api"></app-dashboard>
      </div>
    } @else {
      <app-welcome (connect)="connect()"></app-welcome>
    }`,
})
export class App {
  protected isReady = false;

  protected api = new MustangAPI();
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    (window as any)["api"] = this.api;

    this.api.on("connected", async () => {
      await sleep(1000);
      this.isReady = true;
      this.changeDetector.markForCheck();
    });
    this.api.on("disconnected", () => {
      this.isReady = false;
      this.changeDetector.markForCheck();
    });
    this.api.on("state-changed", () => {
      this.changeDetector.markForCheck();
    });
  }

  // --- ACTIONS ---

  async connect() {
    await this.api.connect();
    this.changeDetector.markForCheck();
  }

  async disconnect() {
    await this.api.disconnect();
    this.changeDetector.markForCheck();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
