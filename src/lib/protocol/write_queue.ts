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
  packets: PacketFactory[];
  waiters: Waiter[];
}

/**
 * Serialized FIFO transaction queue for Mustang USB HID communication.
 *
 * Ensures all transactions and packets are sent to the amplifier in exact sequential order
 * without interleaving, throttling, or dropping messages.
 */
class ProtocolWriteQueue {
  private readonly queue: QueuedTransaction[] = [];
  private inFlight = false;
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly protocol: IProtocol) {}

  enqueue(packets: PacketFactory[]): Promise<void> {
    if (packets.length === 0) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        packets,
        waiters: [{ resolve, reject }],
      });

      if (!this.inFlight) {
        void this.drain();
      }
    });
  }

  /**
   * No-op: Dropping/cancelling writes is removed so all messages reach the amplifier.
   */
  cancel(_key?: string): void {
    // No-op
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
  return getQueue(protocol).enqueue(packets);
}

/**
 * Enqueue a transaction directly without throttling or coalescing.
 */
export function enqueueCoalescedWrite(protocol: IProtocol, _key: string, ...packets: PacketFactory[]): Promise<void> {
  return enqueueWrite(protocol, ...packets);
}

/**
 * No-op: Throttling / dropping writes is removed.
 */
export function cancelCoalescedWrite(_protocol: IProtocol, _key?: string): void {
  // No-op
}

/** Resolves once every write queued so far has settled. */
export function flushWrites(protocol: IProtocol): Promise<void> {
  return getQueue(protocol).flush();
}
