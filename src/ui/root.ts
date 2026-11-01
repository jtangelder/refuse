import { Component, ChangeDetectionStrategy, inject, afterNextRender, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatDialog } from '@angular/material/dialog';
import { type MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { map } from 'rxjs';
import { SidebarComponent } from './sidebar';
import { DashboardComponent } from './dashboard';
import { WelcomeComponent } from './welcome';
import { FuseService } from '../services/fuse.service';

const MOBILE_MEDIA_QUERY = '(max-width: 850px)';

@Component({
  selector: 'fuse-root',
  imports: [MatSidenavModule, SidebarComponent, DashboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './root.ng.html',
})
export class RootComponent {
  protected readonly service = inject(FuseService);
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly sidenav = viewChild<MatSidenav>('sidenav');

  protected readonly isMobile = toSignal(
    this.breakpointObserver.observe(MOBILE_MEDIA_QUERY).pipe(map(state => state.matches)),
    {
      initialValue:
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
          : false,
    },
  );

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

  protected onPresetSelected() {
    if (this.isMobile()) {
      void this.sidenav()?.close();
    }
  }

  private openWelcomeDialog() {
    this.dialog.open(WelcomeComponent, {
      width: '460px',
      maxWidth: '92dvw',
      autoFocus: 'first-tabbable',
    });
  }
}
