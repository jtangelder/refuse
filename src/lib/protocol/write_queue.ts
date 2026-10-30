import type { IProtocol } from './protocol_interface';

/**
 * Lazily builds a packet at transmit time. Building lazily guarantees that
 * sequence IDs are allocated in the exact order packets hit the wire.
 */
export type PacketFactory = () => Uint8Array;

interface Waiter {
  resolve: () => void;
  reject: (err: unknown) => void;
}

interface QueuedTransaction {
  key?: string;
  packets: PacketFactory[];
  waiters: Waiter[];
}

/**
 * Per-protocol serialized & coalescing transaction queue driven by USB HID backpressure.
 *
 * - Every Mustang operation is an atomic transaction of one or more packets
 *   (e.g. DSP write + apply).
 * - When the wire is idle, the first transaction begins immediately (0ms latency).
 * - While a transaction is in flight (`await protocol.sendPacket`), incoming
 *   coalesced transactions with the same `key` (e.g. `'amp'` or `'fx-2'`)
 *   overwrite the pending unstarted transaction for that key in-place so only
 *   the latest parameter state is transmitted when the wire becomes free.
 */
class ProtocolWriteQueue {
  private readonly queue: QueuedTransaction[] = [];
  private inFlight = false;
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly protocol: IProtocol) {}

  enqueue(key: string | undefined, packets: PacketFactory[]): Promise<void> {
    if (packets.length === 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      if (key !== undefined) {
        const existing = this.queue.find(entry => entry.key === key);
        if (existing) {
          existing.packets = packets;
          existing.waiters.push({ resolve, reject });
          return;
        }
      }

      this.queue.push({
        key,
        packets,
        waiters: [{ resolve, reject }],
      });

      if (!this.inFlight) {
        void this.drain();
      }
    });
  }

  /**
   * Drop pending unstarted coalesced transactions matching `key` (or all
   * coalesced transactions if `key` is omitted). Waiters resolve because their
   * state was superseded by a newer operation (e.g. model change or slot clear).
   */
  cancel(key?: string): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const entry = this.queue[i];
      if (entry.key !== undefined && (key === undefined || entry.key === key)) {
        this.queue.splice(i, 1);
        entry.waiters.forEach(w => w.resolve());
      }
    }
  }

  flush(): Promise<void> {
    if (!this.inFlight && this.queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.idleWaiters.push(resolve);
    });
  }

  private async drain(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;

    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift()!;
        try {
          for (const build of entry.packets) {
            await this.protocol.sendPacket(build());
          }
          entry.waiters.forEach(w => w.resolve());
        } catch (err) {
          entry.waiters.forEach(w => w.reject(err));
        }
      }
    } finally {
      this.inFlight = false;
      const waiters = this.idleWaiters.splice(0);
      waiters.forEach(resolve => resolve());
    }
  }
}

const queues = new WeakMap<IProtocol, ProtocolWriteQueue>();

function getQueue(protocol: IProtocol): ProtocolWriteQueue {
  let q = queues.get(protocol);
  if (!q) {
    q = new ProtocolWriteQueue(protocol);
    queues.set(protocol, q);
  }
  return q;
}

/**
 * Enqueue an atomic FIFO transaction of one or more packets.
 */
export function enqueueWrite(protocol: IProtocol, ...packets: PacketFactory[]): Promise<void> {
  return getQueue(protocol).enqueue(undefined, packets);
}

/**
 * Enqueue a backpressure-coalesced atomic transaction keyed by `key`.
 *
 * The first update in an idle period transmits immediately (leading edge).
 * Rapid updates arriving while the USB wire is busy replace the queued entry
 * for `key` in-place so only the most recent state is sent next.
 */
export function enqueueCoalescedWrite(protocol: IProtocol, key: string, ...packets: PacketFactory[]): Promise<void> {
  return getQueue(protocol).enqueue(key, packets);
}

/**
 * Cancel any pending (not yet transmitted) coalesced write for `key`
 * (or all keys if omitted).
 */
export function cancelCoalescedWrite(protocol: IProtocol, key?: string): void {
  queues.get(protocol)?.cancel(key);
}

/** Resolves once every write queued so far has settled. */
export function flushWrites(protocol: IProtocol): Promise<void> {
  return getQueue(protocol).flush();
}
