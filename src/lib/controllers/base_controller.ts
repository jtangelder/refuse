import { Store } from '../store';
import { type IProtocol } from '../protocol/protocol_interface';
import { cancelCoalescedWrite, enqueueCoalescedWrite, enqueueWrite, type PacketFactory } from '../protocol/write_queue';
import { PacketBuilder } from '../protocol/packet_builder';
import { isValidSlot } from '../protocol/constants';
import type { DspType } from '../models';

export abstract class BaseController {
  protected store: Store;
  protected protocol: IProtocol;

  constructor(store: Store, protocol: IProtocol) {
    this.store = store;
    this.protocol = protocol;
  }

  /** Send packets as one atomic FIFO transaction on the shared, serialized write queue. */
  protected transmit(...packets: PacketFactory[]): Promise<void> {
    return enqueueWrite(this.protocol, ...packets);
  }

  /**
   * Send packets as a backpressure-coalesced atomic transaction keyed by `key`.
   * Executes immediately if the wire is idle; coalesces in-place if the wire is busy.
   */
  protected transmitCoalesced(key: string, ...packets: PacketFactory[]): Promise<void> {
    return enqueueCoalescedWrite(this.protocol, key, ...packets);
  }

  /** Cancel any pending unstarted coalesced transaction for `key` (or all keys if omitted). */
  protected cancelCoalesced(key?: string): void {
    cancelCoalescedWrite(this.protocol, key);
  }

  /** Factory for the "apply/commit" packet that must follow every DSP write. */
  protected applyPacket(type: DspType): PacketFactory {
    return () => PacketBuilder.applyChange(type, this.protocol.getNextSequenceId()).build();
  }

  protected assertSlot(slot: number): void {
    if (!isValidSlot(slot)) throw new Error(`Invalid slot: ${slot}`);
  }
}
