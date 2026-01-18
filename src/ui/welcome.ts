import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "app-welcome",
  standalone: true,
  template: `
    <div class="welcome">
      <div class="illustration">
        <img src="assets/mustang-intro.webp" />
      </div>
      <div class="message">
        <h1>Unofficial Fender FUSE replacement</h1>

        <p>
          This tool restores the editing functionality lost when Fender
          <a
            href="https://support.fender.com/en-us/knowledgebase/article/KA-01924"
            target="_blank"
            >discontinued</a
          >
          their FUSE application.
        </p>

        <p>
          It provides a simple interface to manage your presets, configure
          signal chains, and access the "hidden" amp models that require
          software control. No installation is needed; it runs entirely via your
          browser's USB connection.
        </p>

        <p>
          <strong
            >Get started by connecting your amplifier to your computer via
            USB.</strong
          >
        </p>
        <div class="connect">
          <button (click)="connect.emit()" class="success">
            <span class="icon">usb</span>
            Connect your amp
          </button>
        </div>

        <p *ngIf="!isSupported" class="unsupported">
          ⚠️ WebHID not detected. This application requires a browser with
          WebHID support (<a href="https://caniuse.com/webhid" target="_blank"
            >like Chrome, Edge or Opera</a
          >).
        </p>

        <p class="disclaimer">
          <em
            >This is a hobby project, not affiliated with Fender in any way.
            Please
            <a href="https://github.com/jtangelder/mustang" target="_blank"
              >contribute on GitHub</a
            >
            if you find it useful.</em
          >
        </p>
      </div>
    </div>
  `,
})
export class WelcomeComponent {
  @Output() connect = new EventEmitter<void>();

  protected isSupported = !!(navigator as any).hid;
}
