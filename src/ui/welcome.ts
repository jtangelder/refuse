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
          <mat-icon class="warning-icon" aria-hidden="true">warning</mat-icon>
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
          mat-flat-button
          color="primary"
          [disabled]="!service.isSupported() || service.connecting()"
          (click)="service.connect()"
        >
          <mat-icon aria-hidden="true">usb</mat-icon>
          {{ service.connecting() ? 'Connecting...' : 'Connect your amp' }}
        </button>
        <button mat-tonal-button [disabled]="service.connecting()" (click)="service.enableDemo()">
          <mat-icon aria-hidden="true">play_arrow</mat-icon>
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
        padding: 48px 24px;
        font-size: 1.02rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 48px;
        margin: 0 auto;
        max-width: 1040px;
      }

      a {
        color: var(--mat-sys-primary);
        text-decoration: none;

        &:hover {
          text-decoration: underline;
        }
      }

      .illustration {
        flex: 0.38;
        display: flex;
        justify-content: center;
        background: var(--mat-sys-surface-container-low);
        padding: 32px;
        border-radius: var(--md-corner-2xl);

        img {
          width: 100%;
          max-width: 340px;
          height: auto;
          border-radius: var(--md-corner-lg);
        }
      }

      .message {
        flex: 0.62;
        background: var(--mat-sys-surface-container-low);
        padding: 36px 40px;
        border-radius: var(--md-corner-2xl);
      }

      h1 {
        font-size: 1.85rem;
        font-weight: 600;
        letter-spacing: -0.02em;
        margin: 0 0 18px 0;
        color: var(--mat-sys-on-surface);
      }

      .browser-warning {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        background: var(--mat-sys-error-container);
        border: none;
        border-radius: var(--md-corner-lg);
        padding: 16px 20px;
        margin-bottom: 20px;
        color: var(--mat-sys-on-error-container);

        .warning-icon {
          color: var(--mat-sys-on-error-container);
          font-size: 24px;
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .warning-content {
          font-size: 0.9rem;

          strong {
            display: block;
            margin-bottom: 4px;
            font-size: 1rem;
          }

          p {
            margin: 4px 0;
          }
        }
      }

      .connect {
        margin: 1.5em auto;
        display: flex;
        gap: 16px;
        align-items: center;
      }

      .disclaimer {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.85em;
        margin-top: 30px;
      }

      @media (max-width: 850px) {
        :host {
          flex-direction: column;
          align-items: center;
        }

        .illustration {
          padding-top: 0;
        }
      }
    `,
  ],
})
export class WelcomeComponent {
  protected readonly service = inject(FuseService);
}
