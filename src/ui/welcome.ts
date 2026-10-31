import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FuseService } from '../services/fuse.service';

@Component({
  selector: 'fuse-welcome',
  imports: [NgOptimizedImage, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome.ng.html',
  styleUrl: './welcome.scss',
})
export class WelcomeComponent {
  protected readonly service = inject(FuseService);
}
