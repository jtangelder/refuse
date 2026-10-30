type Task = () => Promise<void> | void;

interface Waiter {
  resolve: () => void;
  reject: (err: unknown) => void;
}

interface Pending {
  task: Task;
  waiters: Waiter[];
}

/**
 * Backpressure-aware leading + trailing task conflator, keyed per parameter.
 *
 * - The first call when a key is idle runs immediately (instant leading-edge feedback).
 * - While an async task is in flight (or within an optional minimum window `delayMs`),
 *   subsequent calls for the same key are coalesced so only the *latest* task runs
 *   as soon as the in-flight execution finishes (and any minimum window has elapsed).
 * - Guarantees at-most-one in-flight execution per key (preventing overlapping async writes).
 */
export class ThrottledDispatcher {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastExecTime = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly defaultDelayMs = 0) {}

  dispatch(key: string, task: Task, delayMs = this.defaultDelayMs): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const entry = this.pending.get(key) ?? { task, waiters: [] };
      entry.task = task;
      entry.waiters.push({ resolve, reject });
      this.pending.set(key, entry);

      this.schedule(key, delayMs);
    });
  }

  private schedule(key: string, delayMs: number): void {
    // If an execution for this key is currently in flight or a timer is already armed,
    // the completion handler or timer will pick up the latest coalesced entry.
    if (this.inFlight.has(key) || this.timers.has(key)) return;

    const last = this.lastExecTime.get(key);
    const elapsed = last === undefined ? Infinity : Date.now() - last;
    if (elapsed >= delayMs) {
      this.execute(key, delayMs);
      return;
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      if (!this.inFlight.has(key)) {
        this.execute(key, delayMs);
      }
    }, delayMs - elapsed);
    this.timers.set(key, timer);
  }

  private execute(key: string, delayMs: number): void {
    const entry = this.pending.get(key);
    if (!entry) return;
    this.pending.delete(key);
    this.lastExecTime.set(key, Date.now());
    this.inFlight.add(key);

    let result: Promise<void> | void;
    try {
      result = entry.task(); // run synchronously so leading-edge feedback is immediate
    } catch (err) {
      this.inFlight.delete(key);
      entry.waiters.forEach(w => w.reject(err));
      if (this.pending.has(key)) {
        this.schedule(key, delayMs);
      }
      return;
    }

    Promise.resolve(result).then(
      () => {
        this.inFlight.delete(key);
        entry.waiters.forEach(w => w.resolve());
        if (this.pending.has(key)) {
          this.schedule(key, delayMs);
        }
      },
      err => {
        this.inFlight.delete(key);
        entry.waiters.forEach(w => w.reject(err));
        if (this.pending.has(key)) {
          this.schedule(key, delayMs);
        }
      },
    );
  }

  /** Drop pending work. Waiters of dropped tasks resolve (the value was superseded). */
  cancel(key?: string): void {
    const keys = key ? [key] : [...new Set([...this.timers.keys(), ...this.pending.keys()])];
    for (const k of keys) {
      const timer = this.timers.get(k);
      if (timer) clearTimeout(timer);
      this.timers.delete(k);
      this.pending.get(k)?.waiters.forEach(w => w.resolve());
      this.pending.delete(k);
    }
  }
}
