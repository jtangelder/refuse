import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { FuseService } from '../services/fuse.service';

@Component({
  selector: 'fuse-welcome-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome.ng.html',
  styleUrl: './welcome.scss',
})
export class WelcomeComponent {
  protected readonly service = inject(FuseService);
  private readonly dialogRef = inject(MatDialogRef<WelcomeComponent>, { optional: true });

  async onConnect() {
    const success = await this.service.connect();
    if (success) {
      this.dialogRef?.close();
    }
  }

  onExploreDemo() {
    if (!this.service.connected() || !this.service.isDemo()) {
      void this.service.enableDemo();
    }
    this.dialogRef?.close();
  }
}
