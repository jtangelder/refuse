import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly zone = inject(NgZone);

  info(message: string): void {
    this.open(message, 3000);
  }

  error(message: string): void {
    this.open(message, 6000, 'Dismiss');
  }

  private open(message: string, duration: number, action?: string): void {
    // Errors may originate outside Angular (e.g. WebHID callbacks).
    this.zone.run(() => this.snackBar.open(message, action, { duration, politeness: 'assertive' }));
  }
}

/**
 * Surfaces uncaught errors and unhandled promise rejections (e.g. a failed USB
 * write from a knob turn) to the user instead of only logging them.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notifications = inject(NotificationService);

  handleError(error: unknown): void {
    console.error(error);
    const unwrapped = (error as { rejection?: unknown })?.rejection ?? error;
    const message = unwrapped instanceof Error ? unwrapped.message : String(unwrapped);
    this.notifications.error(`Something went wrong: ${message}`);
  }
}
