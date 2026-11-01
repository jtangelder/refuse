import { ErrorHandler, isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { RootComponent } from './ui/root';
import { GlobalErrorHandler } from './services/notification.service';
import { provideServiceWorker } from '@angular/service-worker';

bootstrapApplication(RootComponent, {
  providers: [
    provideAnimations(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // index.html loads "Material Symbols Outlined"; without this, <mat-icon> uses the
    // legacy "Material Icons" font (not loaded) and renders ligature text like "usb".
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
}).catch(err => console.error(err));
