import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from './sidebar';
import { DashboardComponent } from './dashboard';
import { WelcomeComponent } from './welcome';
import { FuseService } from '../services/fuse.service';

@Component({
  selector: 'fuse-root',
  standalone: true,
  imports: [CommonModule, SidebarComponent, DashboardComponent, WelcomeComponent],
  template: ` @if (service.connected()) {
      <div class="container">
        <fuse-sidebar></fuse-sidebar>
        <fuse-dashboard></fuse-dashboard>
      </div>
    } @else {
      <fuse-welcome></fuse-welcome>
    }`,
})
export class App {
  protected readonly service = inject(FuseService);
}
