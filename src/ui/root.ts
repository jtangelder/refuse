import { Component, ChangeDetectionStrategy, inject, afterNextRender } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SidebarComponent } from './sidebar';
import { DashboardComponent } from './dashboard';
import { WelcomeComponent } from './welcome';
import { FuseService } from '../services/fuse.service';

@Component({
  selector: 'fuse-root',
  imports: [SidebarComponent, DashboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './root.ng.html',
})
export class RootComponent {
  protected readonly service = inject(FuseService);
  private readonly dialog = inject(MatDialog);

  constructor() {
    if (!this.service.connected()) {
      void this.service.enableDemo();
    }

    afterNextRender(() => {
      if (!this.service.connected() || this.service.isDemo()) {
        this.openWelcomeDialog();
      }
    });
  }

  private openWelcomeDialog() {
    this.dialog.open(WelcomeComponent, {
      width: '460px',
      autoFocus: 'first-tabbable',
    });
  }
}
