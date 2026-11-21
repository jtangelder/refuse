import type { IProtocol } from './protocol_interface';

/**
 * Lazily builds a packet at transmit time. Building lazily guarantees that
 * sequence IDs are allocated in the exact order packets hit the wire.
 */
export type PacketFactory = () => Uint8Array;

/**
 * Pacing delay (ms) between consecutive USB HID packets.
 * Gives the Mustang microcontroller time to process each packet and reply without buffer overrun.
 */
export const DEFAULT_PACKET_DELAY_MS = 20;

let currentPacketDelayMs = DEFAULT_PACKET_DELAY_MS;

export function setInterPacketDelay(ms: number): void {
  currentPacketDelayMs = ms;
}

export function resetInterPacketDelay(): void {
  currentPacketDelayMs = DEFAULT_PACKET_DELAY_MS;
}

interface Waiter {
  resolve: () => void;
  reject: (err: unknown) => void;
}

interface QueuedTransaction {
  coalesceKey?: string;
  packets: PacketFactory[];
  waiters: Waiter[];
}

/**
 * Serialized FIFO transaction queue for Mustang USB HID communication.
 *
 * Ensures all transactions and packets are sent to the amplifier in exact sequential order
 * without interleaving, enforces timestamp-based inter-packet pacing across awaited calls,
 * and supports latest-wins coalescing for high-frequency knob drags so hardware tracks
 * controls smoothly without multi-second backlog lag.
 */
class ProtocolWriteQueue {
  private readonly queue: QueuedTransaction[] = [];
  private inFlight = false;
  private lastSentAt = 0;
  private packetDelayOverrideMs: number | null = null;
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly protocol: IProtocol) {}

  setDelayMs(ms: number | null): void {
    this.packetDelayOverrideMs = ms;
  }

  private getEffectiveDelayMs(): number {
    return this.packetDelayOverrideMs ?? currentPacketDelayMs;
  }

  enqueue(packets: PacketFactory[], coalesceKey?: string): Promise<void> {
    if (packets.length === 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      if (coalesceKey !== undefined) {
        const existing = this.queue.find(entry => entry.coalesceKey === coalesceKey);
        if (existing) {
          existing.packets = packets;
          existing.waiters.push({ resolve, reject });
          return;
        }
      }

      this.queue.push({
        coalesceKey,
        packets,
        waiters: [{ resolve, reject }],
      });

      if (!this.inFlight) {
        void this.drain();
      }
    });
  }

  /**
   * Drop pending coalesced entries (matching `key`, or all coalesced entries if omitted)
   * without disrupting non-coalesced structural transactions. Superseded waiters resolve cleanly.
   */
  cancel(key?: string): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const entry = this.queue[i];
      if (entry.coalesceKey !== undefined && (key === undefined || entry.coalesceKey === key)) {
        this.queue.splice(i, 1);
        entry.waiters.forEach(w => w.resolve());
      }
    }
  }

  /**
   * Immediately reject all queued pending transactions (e.g., on USB unplug/disconnect)
   * without waiting through inter-packet pacing delays.
   */
  abort(error: Error = new Error('Not connected')): void {
    const pending = this.queue.splice(0);
    for (const entry of pending) {
      entry.waiters.forEach(w => w.reject(error));
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
          for (let i = 0; i < entry.packets.length; i++) {
            const delayMs = this.getEffectiveDelayMs();
            if (delayMs > 0 && this.lastSentAt > 0) {
              const elapsed = Date.now() - this.lastSentAt;
              if (elapsed >= 0 && elapsed < delayMs) {
                await new Promise(resolve => setTimeout(resolve, delayMs - elapsed));
              }
            }
            await this.protocol.sendPacket(entry.packets[i]());
            this.lastSentAt = Date.now();
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
 * Override inter-packet delay for a specific protocol instance (null resets to global default).
 */
export function setProtocolPacketDelay(protocol: IProtocol, ms: number | null): void {
  getQueue(protocol).setDelayMs(ms);
}

/**
 * Enqueue an atomic FIFO transaction of one or more packets.
 */
export function enqueueWrite(protocol: IProtocol, ...packets: PacketFactory[]): Promise<void> {
  return getQueue(protocol).enqueue(packets);
}

/**
 * Enqueue a latest-wins coalesced transaction under `key`.
 * While an earlier write is in flight, repeated updates for the same key collapse into
 * the latest payload so rapid knob drags stay responsive without queuing multi-second lag.
 */
export function enqueueCoalescedWrite(protocol: IProtocol, key: string, ...packets: PacketFactory[]): Promise<void> {
  return getQueue(protocol).enqueue(packets, key);
}

/**
 * Cancel pending coalesced writes matching `key` (or all coalesced writes if `key` is omitted).
 */
export function cancelCoalescedWrite(protocol: IProtocol, key?: string): void {
  getQueue(protocol).cancel(key);
}

/**
 * Immediately reject all pending queued writes for `protocol` (e.g., on disconnect).
 */
export function abortWrites(protocol: IProtocol, error?: Error): void {
  getQueue(protocol).abort(error);
}

/** Resolves once every write queued so far has settled. */
export function flushWrites(protocol: IProtocol): Promise<void> {
  return getQueue(protocol).flush();
}
