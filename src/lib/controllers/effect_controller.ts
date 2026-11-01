import { BaseController } from './base_controller';
import { DspType, findEffectModel, getDelayTimeKnobIndex, type ModelDef } from '../models';
import { getModelDefault } from '../defaults';
import type { EffectState } from '../store';
import type { EffectSettings, KnobInfo } from '../index';
import { debug } from '../helpers';
import { PacketBuilder } from '../protocol/packet_builder';
import type { BypassStateCommand, EffectUpdateCommand, KnobChangeCommand } from '../protocol/protocol_decoder';
import { LIMITS, OFFSETS, VALUES, isValidKnobIndex, isValidSlot, toByte } from '../protocol/constants';
import type { PacketFactory } from '../protocol/write_queue';

/** Maximum delay time (ms) corresponding to parameter byte 255 on Mustang delay models. */
const MAX_DELAY_TIME_MS = 1500;

export interface SetEffectOptions {
  /** Knob overrides applied on top of the model defaults. */
  knobs?: ReadonlyArray<{ index: number; value: number }>;
  /** Bypass state. Defaults to enabled. */
  enabled?: boolean;
}

export class EffectController extends BaseController {
  // ---------------------------------------------------------------------------
  // Inbound (hardware -> store). These never transmit, which prevents echo loops.
  // ---------------------------------------------------------------------------

  handleKnobChange(command: KnobChangeCommand): boolean {
    const { slot, knobIndex, value } = command;
    if (!isValidSlot(slot) || !isValidKnobIndex(knobIndex)) return false;

    const effect = this.store.getState().slots[slot];
    if (!effect) return false;

    const knobs = [...effect.knobs];
    knobs[knobIndex] = toByte(value);
    this.store.updateSlotState(slot, { ...effect, knobs });
    return true;
  }

  handleEffectUpdate(command: EffectUpdateCommand): boolean {
    const { slot, dspType, modelId, enabled, knobs } = command;
    if (!isValidSlot(slot)) return false;

    this.store.batch(() => {
      // Hardware allows one effect per DSP type; if it moved, drop the stale copy.
      this.forEachOtherSlotOfType(slot, dspType, i => {
        debug(`[EffectController] ${DspType[dspType]} moved ${i} -> ${slot}`);
        this.store.clearSlot(i);
      });

      if (modelId === 0) {
        this.store.clearSlot(slot);
        return;
      }

      this.store.updateSlotState(slot, { slot, type: dspType, modelId, enabled, knobs: normalizeKnobs(knobs) });
    });
    return true;
  }

  handleBypassState(command: BypassStateCommand): boolean {
    if (!isValidSlot(command.slot)) return false;
    this.store.setEffectBypass(command.slot, command.enabled);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEffectModel(slot: number): ModelDef | null {
    const effect = this.store.getState().slots[slot];
    return effect ? findEffectModel(effect.modelId) : null;
  }

  getEffectModelId(slot: number): number {
    return this.getEffectModel(slot)?.id ?? 0;
  }

  getEffectKnobs(slot: number): KnobInfo[] {
    const model = this.getEffectModel(slot);
    const effect = this.store.getState().slots[slot];
    if (!model || !effect) return [];
    return model.knobs.flatMap((name, index) => (name ? [{ name, value: effect.knobs[index] ?? 0, index }] : []));
  }

  getSettings(slot: number): EffectSettings | null {
    const effect = this.store.getState().slots[slot];
    if (!effect) return null;

    const model = findEffectModel(effect.modelId);
    return {
      slot,
      type: effect.type,
      model: model?.name ?? `Unknown (0x${effect.modelId.toString(16)})`,
      modelId: effect.modelId,
      enabled: effect.enabled,
      knobs: this.getEffectKnobs(slot),
    };
  }

  // ---------------------------------------------------------------------------
  // Outbound (UI -> store -> hardware)
  // ---------------------------------------------------------------------------

  /** Assign a model with its factory defaults. */
  setEffectById(slot: number, modelId: number): Promise<void> {
    return this.setEffect(slot, modelId);
  }

  /**
   * Place a model in a slot. Any other slot holding the same DSP type is cleared
   * first (hardware limit: one effect per type) in a single atomic store batch
   * and USB transaction.
   */
  async setEffect(slot: number, modelId: number, options: SetEffectOptions = {}): Promise<void> {
    this.assertSlot(slot);
    const model = findEffectModel(modelId);
    if (!model) throw new Error(`Unknown effect model ID: 0x${modelId.toString(16).padStart(4, '0')}`);
    debug(`[EffectController] setEffect(slot ${slot}, 0x${modelId.toString(16)})`);

    const duplicateSlots = this.otherSlotsOfType(slot, model.type);
    const defaults = getModelDefault(modelId) ?? new Uint8Array(64);
    const knobs = normalizeKnobs(Array.from(defaults.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END)));
    for (const k of options.knobs ?? []) {
      if (isValidKnobIndex(k.index)) knobs[k.index] = toByte(k.value);
    }

    const newState: EffectState = { slot, type: model.type, modelId, enabled: options.enabled ?? true, knobs };
    const packets: PacketFactory[] = [];

    this.store.batch(() => {
      for (const i of duplicateSlots) {
        debug(`[EffectController] Auto-removing ${DspType[model.type]} from slot ${i}`);
        this.store.clearSlot(i);
        packets.push(...this.buildClearPackets(i, model.type));
      }
      this.store.updateSlotState(slot, newState);
    });

    packets.push(...this.buildEffectStatePackets(newState));
    await this.transmit(...packets);
  }

  async setEffectEnabled(slot: number, enabled: boolean): Promise<void> {
    this.assertSlot(slot);
    const effect = this.store.getState().slots[slot];
    if (!effect) return;

    this.store.setEffectBypass(slot, enabled);
    await this.transmit(() => PacketBuilder.bypass(slot, enabled, effect.type).build());
  }

  setEffectKnob(slot: number, index: number, value: number): Promise<void> {
    this.assertSlot(slot);
    if (!isValidKnobIndex(index)) return Promise.reject(new Error(`Invalid knob index: ${index}`));
    const effect = this.store.getState().slots[slot];
    if (!effect) return Promise.reject(new Error(`No effect in slot ${slot}`));

    const knobs = [...effect.knobs];
    knobs[index] = toByte(value);
    const newState: EffectState = { ...effect, knobs };
    this.store.updateSlotState(slot, newState);

    return this.transmit(
      () => PacketBuilder.fromEffectState(newState, this.protocol.getNextSequenceId()).build(),
      this.applyPacket(effect.type),
    );
  }

  /**
   * Synchronize active Delay effect's Time knob to a BPM tempo (quarter-note interval).
   * Returns true if an active Delay effect was updated.
   */
  async setDelayTempoBpm(bpm: number): Promise<boolean> {
    if (!Number.isFinite(bpm) || bpm <= 0) return false;
    const delayMs = 60000 / bpm;
    const knobValue = toByte((delayMs / MAX_DELAY_TIME_MS) * LIMITS.MAX_VALUE);

    const slots = this.store.getState().slots;
    for (let s = 0; s < LIMITS.SLOT_COUNT; s++) {
      const eff = slots[s];
      if (eff && eff.type === DspType.DELAY) {
        const timeIdx = getDelayTimeKnobIndex(eff.modelId);
        if (timeIdx !== null) {
          await this.setEffectKnob(s, timeIdx, knobValue);
          return true;
        }
      }
    }
    return false;
  }

  async moveEffect(fromSlot: number, toSlot: number): Promise<void> {
    if (!isValidSlot(fromSlot) || !isValidSlot(toSlot)) {
      throw new Error(`Invalid slot indices: ${fromSlot}, ${toSlot}`);
    }
    if (fromSlot === toSlot) return;

    const before = this.store.getState().slots;
    const slots = [...before];
    const size = LIMITS.GROUP_SIZE;
    const fromStart = groupStart(fromSlot);
    const toStart = groupStart(toSlot);

    if (fromStart === toStart) {
      const group = slots.slice(fromStart, fromStart + size);
      const [moved] = group.splice(fromSlot - fromStart, 1);
      group.splice(toSlot - fromStart, 0, moved);
      group.forEach((e, i) => (slots[fromStart + i] = e));
    } else {
      const source = slots.slice(fromStart, fromStart + size);
      const [moved] = source.splice(fromSlot - fromStart, 1);
      source.push(null);

      const target = slots.slice(toStart, toStart + size);
      target.splice(toSlot - toStart, 0, moved);
      target.pop(); // keep group size fixed

      for (let i = 0; i < size; i++) {
        slots[fromStart + i] = source[i];
        slots[toStart + i] = target[i];
      }
    }

    await this.syncSlots(before, slots);
  }

  /** @deprecated Use moveEffect instead */
  async swapEffects(slotA: number, slotB: number): Promise<void> {
    if (!isValidSlot(slotA) || !isValidSlot(slotB)) {
      throw new Error(`Invalid slot indices: ${slotA}, ${slotB}`);
    }
    if (slotA === slotB) return;

    const before = this.store.getState().slots;
    const slots = [...before];
    [slots[slotA], slots[slotB]] = [slots[slotB], slots[slotA]];
    await this.syncSlots(before, slots);
  }

  async clearEffect(slot: number): Promise<void> {
    this.assertSlot(slot);
    const type = this.store.getState().slots[slot]?.type ?? DspType.STOMP;
    this.store.clearSlot(slot);
    await this.transmit(...this.buildClearPackets(slot, type));
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async syncSlots(before: ReadonlyArray<EffectState | null>, after: ReadonlyArray<EffectState | null>) {
    const packets: PacketFactory[] = [];

    // 1. Synchronize in-memory store state in a single atomic batch
    this.store.batch(() => {
      for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
        const newEffect = after[i];
        const placed = newEffect ? { ...newEffect, slot: i } : null;
        this.store.updateSlotState(i, placed);
      }
    });

    // 2. Collect delta packets across all changed slots and transmit as one atomic transaction
    for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
      const oldEffect = before[i];
      const newEffect = after[i];
      if (newEffect === oldEffect && (!newEffect || newEffect.slot === i)) continue;

      if (newEffect) {
        const placed: EffectState = { ...newEffect, slot: i };
        packets.push(...this.buildEffectStatePackets(placed));
      } else if (oldEffect) {
        packets.push(...this.buildClearPackets(i, oldEffect.type));
      }
    }

    if (packets.length > 0) {
      await this.transmit(...packets);
    }
  }

  private buildClearPackets(slot: number, type: DspType): PacketFactory[] {
    return [
      () =>
        PacketBuilder.dspWrite(type, this.protocol.getNextSequenceId())
          .setByte(OFFSETS.SLOT_INDEX, slot)
          .setByte(OFFSETS.BYPASS, VALUES.BYPASSED)
          .build(),
      this.applyPacket(type),
    ];
  }

  private buildEffectStatePackets(state: EffectState): PacketFactory[] {
    return [
      () => PacketBuilder.fromEffectState(state, this.protocol.getNextSequenceId()).build(),
      this.applyPacket(state.type),
    ];
  }

  private otherSlotsOfType(slot: number, type: DspType): number[] {
    const result: number[] = [];
    this.forEachOtherSlotOfType(slot, type, i => result.push(i));
    return result;
  }

  private forEachOtherSlotOfType(slot: number, type: DspType, fn: (i: number) => void) {
    // Snapshot first: fn may mutate the store.
    const slots = [...this.store.getState().slots];
    slots.forEach((effect, i) => {
      if (i !== slot && effect?.type === type) fn(i);
    });
  }
}

function groupStart(slot: number): number {
  return slot < LIMITS.GROUP_SIZE ? 0 : LIMITS.GROUP_SIZE;
}

export function normalizeKnobs(knobs: ArrayLike<number>): number[] {
  return Array.from({ length: LIMITS.KNOB_COUNT }, (_, i) => toByte(knobs[i] ?? 0));
}
