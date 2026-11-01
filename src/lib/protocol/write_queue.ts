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
  packets: PacketFactory[];
  waiters: Waiter[];
}

/**
 * Serialized FIFO transaction queue for Mustang USB HID communication.
 *
 * Ensures all transactions and packets are sent to the amplifier in exact sequential order
 * without interleaving or dropped messages, paced to avoid hardware buffer overflows.
 */
class ProtocolWriteQueue {
  private readonly queue: QueuedTransaction[] = [];
  private inFlight = false;
  private hasSentBefore = false;
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
          for (let i = 0; i < entry.packets.length; i++) {
            if (currentPacketDelayMs > 0 && (i > 0 || this.hasSentBefore)) {
              await new Promise(resolve => setTimeout(resolve, currentPacketDelayMs));
            }
            await this.protocol.sendPacket(entry.packets[i]());
            this.hasSentBefore = true;
          }
          entry.waiters.forEach(w => w.resolve());
        } catch (err) {
          entry.waiters.forEach(w => w.reject(err));
        }
      }
    } finally {
      this.inFlight = false;
      this.hasSentBefore = false;
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
