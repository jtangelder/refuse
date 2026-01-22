import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from './ui/sidebar';
import { DashboardComponent } from './ui/dashboard';
import { WelcomeComponent } from './ui/welcome';
import { FuseService } from './services/fuse.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, SidebarComponent, DashboardComponent, WelcomeComponent],
  template: ` @if (service.connected()) {
      <div class="container">
        <app-sidebar></app-sidebar>
        <app-dashboard></app-dashboard>
      </div>
    } @else {
      <app-welcome></app-welcome>
    }`,
})
export class App {
  protected readonly service = inject(FuseService);
}
