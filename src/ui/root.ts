import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { SidebarComponent } from './sidebar';
import { DashboardComponent } from './dashboard';
import { WelcomeComponent } from './welcome';
import { FuseService } from '../services/fuse.service';

@Component({
  selector: 'fuse-root',
  imports: [SidebarComponent, DashboardComponent, WelcomeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './root.ng.html',
})
export class RootComponent {
  protected readonly service = inject(FuseService);
}
