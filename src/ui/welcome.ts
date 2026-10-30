import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FuseService } from '../services/fuse.service';

@Component({
  selector: 'fuse-welcome',
  imports: [NgOptimizedImage, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="illustration">
      <img ngSrc="assets/mustang-intro.webp" width="350" height="260" priority alt="Fender Mustang amplifier" />
    </div>
    <div class="message">
      <h1>Unofficial Fender FUSE replacement</h1>

      @if (!service.isSupported()) {
        <div class="browser-warning" role="alert">
          <mat-icon class="warning-icon">warning</mat-icon>
          <div class="warning-content">
            <strong>WebHID Not Supported in This Browser</strong>
            <p>
              Safari and Firefox currently do not support the WebHID API required to communicate with your amplifier via
              USB.
            </p>
            <p>
              Please use <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, or <strong>Opera</strong> to
              connect your amplifier. You can still test all controls right now in <strong>Demo Mode</strong> below!
            </p>
          </div>
        </div>
      }

      <p>
        This tool restores the editing functionality lost when Fender
        <a
          href="https://support.fender.com/en-us/knowledgebase/article/KA-01924"
          target="_blank"
          rel="noopener noreferrer"
          >discontinued</a
        >
        their FUSE application.
      </p>

      <p>
        It provides a simple interface to manage your presets, configure signal chains, and access the "hidden" amp
        models that require software control. No installation is needed; it runs entirely via your browser's USB
        connection.
      </p>

      <p>
        <strong>Get started by connecting your amplifier to your computer via USB.</strong>
      </p>
      <div class="connect">
        <button
          mat-raised-button
          color="primary"
          [disabled]="!service.isSupported() || service.connecting()"
          (click)="service.connect()"
        >
          <mat-icon>usb</mat-icon>
          {{ service.connecting() ? 'Connecting...' : 'Connect your amp' }}
        </button>
        <button mat-stroked-button [disabled]="service.connecting()" (click)="service.enableDemo()">
          <mat-icon>play_arrow</mat-icon>
          Try Demo
        </button>
      </div>

      <p class="disclaimer">
        <em>
          This is a hobby project, not affiliated with Fender in any way. Please
          <a href="https://github.com/jtangelder/mustang" target="_blank" rel="noopener noreferrer"
            >contribute on GitHub</a
          >
          if you find it useful.
        </em>
      </p>
    </div>
  `,
  styles: [
    `
      :host {
        flex: 1;
        overflow: auto;
        padding: 40px 20px;
        font-size: 1.1em;
        display: flex;
        justify-content: center;
        gap: 40px;
        margin: 0 auto;
        max-width: 1000px;
      }

      a {
        color: var(--primary, #3498db);
      }

      .illustration {
        flex: 0.35;
        padding-top: 60px;
        display: flex;
        justify-content: center;

        img {
          width: 100%;
          max-width: 350px;
          height: auto;
          border-radius: 8px;
        }
      }

      .message {
        flex: 0.65;
      }

      h1 {
        font-size: 1.8rem;
        margin-bottom: 16px;
      }

      .browser-warning {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background: rgba(231, 76, 60, 0.15);
        border: 1px solid var(--accent, #e74c3c);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 20px;
        color: #ffb8b8;

        .warning-icon {
          color: #ff6b6b;
          font-size: 28px;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
        }

        .warning-content {
          font-size: 0.9em;

          strong {
            display: block;
            margin-bottom: 4px;
            font-size: 1.05em;
            color: #fff;
          }

          p {
            margin: 4px 0;
          }
        }
      }

      .connect {
        margin: 1.5em auto;
        font-size: 1.2em;
        display: flex;
        gap: 16px;
        align-items: center;
      }

      .disclaimer {
        color: var(--text-muted, #888);
        font-size: 0.85em;
        margin-top: 30px;
      }
    `,
  ],
})
export class WelcomeComponent {
  protected readonly service = inject(FuseService);
}
