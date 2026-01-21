import { debug } from './helpers';

export class EventEmitter<T extends Record<string, any>> {
  private events: Map<keyof T, Array<any>> = new Map();

  /**
   * Register an event listener
   */
  on<K extends keyof T>(
    event: K,
    callback: T[K] extends (...args: any[]) => any ? T[K] : (payload: T[K]) => void,
  ): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(callback);
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof T>(
    event: K,
    callback: T[K] extends (...args: any[]) => any ? T[K] : (payload: T[K]) => void,
  ): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  emit<K extends keyof T>(event: K, ...args: T[K] extends (...args: infer P) => any ? P : [T[K]]): void {
    // Optional: add debug logging if needed
    // debug(`[EVENT] ${String(event)}:`, ...args);

    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(...args));
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.events.clear();
  }
}
