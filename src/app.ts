import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SidebarComponent } from "./ui/sidebar";
import { DashboardComponent } from "./ui/dashboard";
import { WelcomeComponent } from "./ui/welcome";
import { MustangService } from "./mustang_service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    DashboardComponent,
    WelcomeComponent,
  ],
  template: ` @if (api.isConnected) {
      <div class="container">
        @if (!isReady) {
          <div class="loading-overlay">
            <h1>Receiving data from the amplifier...</h1>
          </div>
        }
        <app-sidebar></app-sidebar>
        <app-dashboard></app-dashboard>
      </div>
    } @else {
      <app-welcome></app-welcome>
    }`,
})
export class App {
  protected isReady = false;
  protected readonly api = inject(MustangService);
  protected readonly changeDetectorRef = inject(ChangeDetectorRef);

  constructor() {
    (window as any)["api"] = this.api;

    this.api.on("connected", async () => {
      await sleep(1000);
      this.isReady = true;
      this.changeDetectorRef.detectChanges();
    });

    this.api.on("disconnected", () => {
      this.isReady = false;
      this.changeDetectorRef.detectChanges();
    });
    this.api.on("state-changed", () => {
      this.isReady = true;
      this.changeDetectorRef.detectChanges();
    });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
