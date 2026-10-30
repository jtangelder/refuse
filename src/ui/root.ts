import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { SidebarComponent } from './sidebar';
import { DashboardComponent } from './dashboard';
import { WelcomeComponent } from './welcome';
import { FuseService } from '../services/fuse.service';

@Component({
  selector: 'fuse-root',
  imports: [SidebarComponent, DashboardComponent, WelcomeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` @if (service.connected()) {
      <div class="container">
        <fuse-sidebar></fuse-sidebar>
        <fuse-dashboard></fuse-dashboard>
      </div>
    } @else {
      <fuse-welcome></fuse-welcome>
    }`,
})
export class RootComponent {
  protected readonly service = inject(FuseService);
}
