import { BaseController } from './base_controller';
import { DspType, clampEffectKnob, findEffectModel, getDelayTimeKnobIndex, type ModelDef } from '../models';
import { getModelDefault } from '../defaults';
import type { EffectState } from '../store';
import type { EffectSettings, KnobInfo } from '../index';
import { debug } from '../helpers';
import { PacketBuilder } from '../protocol/packet_builder';
import type { BypassStateCommand, EffectUpdateCommand, KnobChangeCommand } from '../protocol/protocol_decoder';
import { LIMITS, OFFSETS, isValidKnobIndex, isValidSlot, toByte } from '../protocol/constants';
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
    const { dspType, slot, knobIndex, value } = command;
    if (dspType === DspType.AMP || !isValidKnobIndex(knobIndex)) return false;

    const slots = this.store.getState().slots;
    let targetSlot = -1;

    if (isValidSlot(slot)) {
      const candidate = slots[slot];
      if (candidate && (dspType === undefined || candidate.type === dspType)) {
        targetSlot = slot;
      }
    }

    // Physical Mustang firmware often leaves byte[13] (slot) as 0 on live effect knob packets;
    // since each DSP type (STOMP, MOD, DELAY, REVERB) is a singleton, match by dspType.
    if (targetSlot === -1 && dspType !== undefined) {
      targetSlot = slots.findIndex(eff => eff?.type === dspType);
    }

    if (targetSlot === -1) return false;

    const effect = slots[targetSlot]!;
    const knobs = [...effect.knobs];
    knobs[knobIndex] = clampEffectKnob(effect.modelId, knobIndex, value);
    this.store.updateSlotState(targetSlot, { ...effect, knobs });
    return true;
  }

  handleEffectUpdate(command: EffectUpdateCommand): boolean {
    const { slot, dspType, modelId, enabled, knobs } = command;

    if (modelId === 0) {
      this.store.batch(() => {
        if (slot === 0 || !isValidSlot(slot)) {
          // Hardware empty-DSP report (modelId = 0, slot = 0 or 0xff): clear whichever slot held this DSP type
          const slots = [...this.store.getState().slots];
          slots.forEach((effect, i) => {
            if (effect?.type === dspType) {
              this.store.clearSlot(i);
            }
          });
        } else {
          // Explicit non-zero slot clear: only clear if empty or matching DSP type
          const existing = this.store.getState().slots[slot];
          if (!existing || existing.type === dspType) {
            this.store.clearSlot(slot);
          }
        }
      });
      return true;
    }

    if (!isValidSlot(slot)) return false;

    this.store.batch(() => {
      // Hardware allows one effect per DSP type; if it moved, drop the stale copy.
      this.forEachOtherSlotOfType(slot, dspType, i => {
        debug(`[EffectController] ${DspType[dspType]} moved ${i} -> ${slot}`);
        this.store.clearSlot(i);
      });

      this.store.updateSlotState(slot, {
        slot,
        type: dspType,
        modelId,
        enabled,
        knobs: normalizeKnobs(knobs, modelId),
      });
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
    return model.knobs.flatMap((name, index) => {
      if (!name) return [];
      const spec = model.knobSpecs?.[index];
      return [
        {
          name,
          value: effect.knobs[index] ?? 0,
          index,
          ...(spec ? { max: spec.max, ...(spec.labels ? { labels: spec.labels } : {}) } : {}),
        },
      ];
    });
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

    const previousSlots = [...this.store.getState().slots];
    const existingAtSlot = previousSlots[slot];
    const duplicateSlots = this.otherSlotsOfType(slot, model.type);
    const defaults = getModelDefault(modelId) ?? new Uint8Array(64);
    const knobs = normalizeKnobs(Array.from(defaults.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END)), modelId);
    for (const k of options.knobs ?? []) {
      if (isValidKnobIndex(k.index)) knobs[k.index] = clampEffectKnob(modelId, k.index, k.value);
    }

    const newState: EffectState = { slot, type: model.type, modelId, enabled: options.enabled ?? true, knobs };
    const packets: PacketFactory[] = [];

    this.cancelCoalesced(`effect:${slot}`);
    if (existingAtSlot && existingAtSlot.type !== model.type) {
      packets.push(...this.buildClearPackets(slot, existingAtSlot.type));
    }

    this.store.batch(() => {
      for (const i of duplicateSlots) {
        debug(`[EffectController] Auto-removing ${DspType[model.type]} from slot ${i}`);
        this.cancelCoalesced(`effect:${i}`);
        this.store.clearSlot(i);
        packets.push(...this.buildClearPackets(i, model.type));
      }
      this.store.updateSlotState(slot, newState);
    });

    packets.push(...this.buildEffectStatePackets(newState));
    try {
      await this.transmit(...packets);
    } catch (err) {
      if (this.store.getState().slots[slot] === newState) {
        this.restoreSlots(previousSlots);
      }
      throw err;
    }
  }

  async setEffectEnabled(slot: number, enabled: boolean): Promise<void> {
    this.assertSlot(slot);
    const effect = this.store.getState().slots[slot];
    if (!effect) return;

    const previousEnabled = effect.enabled;
    this.store.setEffectBypass(slot, enabled);
    try {
      await this.transmit(() => PacketBuilder.bypass(slot, enabled, effect.type).build());
    } catch (err) {
      const current = this.store.getState().slots[slot];
      if (current && current.modelId === effect.modelId && current.enabled === enabled) {
        this.store.setEffectBypass(slot, previousEnabled);
      }
      throw err;
    }
  }

  async setEffectKnob(slot: number, index: number, value: number): Promise<void> {
    this.assertSlot(slot);
    if (!isValidKnobIndex(index)) throw new Error(`Invalid knob index: ${index}`);
    const effect = this.store.getState().slots[slot];
    if (!effect) throw new Error(`No effect in slot ${slot}`);

    const knobs = [...effect.knobs];
    knobs[index] = clampEffectKnob(effect.modelId, index, value);
    const newState: EffectState = { ...effect, knobs };
    this.store.updateSlotState(slot, newState);

    try {
      await this.transmitCoalesced(
        `effect:${slot}`,
        () => PacketBuilder.fromEffectState(newState, this.protocol.getNextSequenceId()).build(),
        this.applyPacket(effect.type),
      );
    } catch (err) {
      if (this.store.getState().slots[slot] === newState) {
        this.store.updateSlotState(slot, effect);
      }
      throw err;
    }
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

  async moveEffect(fromSlot: number, toSlot: number, options?: { appendToGroup?: boolean }): Promise<number> {
    if (!isValidSlot(fromSlot) || !isValidSlot(toSlot)) {
      throw new Error(`Invalid slot indices: ${fromSlot}, ${toSlot}`);
    }
    const before = this.store.getState().slots;
    if (!before[fromSlot]) return fromSlot;
    if (fromSlot === toSlot && !options?.appendToGroup) return toSlot;

    const slots = [...before];
    const size = LIMITS.GROUP_SIZE;
    const fromStart = groupStart(fromSlot);
    const toStart = groupStart(toSlot);
    let landedSlot = toSlot;

    if (fromStart === toStart) {
      const group = slots.slice(fromStart, fromStart + size);
      const [moved] = group.splice(fromSlot - fromStart, 1);
      group.splice(toSlot - fromStart, 0, moved);
      group.forEach((e, i) => (slots[fromStart + i] = e));
      landedSlot = toSlot;
    } else {
      const source = slots.slice(fromStart, fromStart + size);
      const [moved] = source.splice(fromSlot - fromStart, 1);
      source.push(null);

      const target = slots.slice(toStart, toStart + size);
      let insertIdx = toSlot - toStart;
      if (options?.appendToGroup) {
        let lastNonNullIdx = -1;
        for (let i = size - 1; i >= 0; i--) {
          if (target[i] !== null) {
            lastNonNullIdx = i;
            break;
          }
        }
        insertIdx = lastNonNullIdx + 1;
      }

      target.splice(insertIdx, 0, moved);
      // Remove an empty hole rather than evicting an occupied pedal whenever space exists
      const nullAfter = target.indexOf(null, insertIdx + 1);
      if (nullAfter !== -1) {
        target.splice(nullAfter, 1);
        landedSlot = toStart + insertIdx;
      } else {
        const nullBefore = insertIdx > 0 ? target.lastIndexOf(null, insertIdx - 1) : -1;
        if (nullBefore !== -1) {
          target.splice(nullBefore, 1);
          landedSlot = toStart + insertIdx - 1;
        } else {
          target.pop();
          landedSlot = toStart + Math.min(insertIdx, size - 1);
        }
      }

      for (let i = 0; i < size; i++) {
        slots[fromStart + i] = source[i];
        slots[toStart + i] = target[i];
      }
    }

    await this.syncSlots(before, slots);
    return landedSlot;
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

  /**
   * Replace all effect slots in a single atomic transaction.
   * Clears slots that are no longer present, and writes new or updated effects
   * directly without redundant intermediate clears or race conditions.
   */
  async replaceAllEffects(
    effects: ReadonlyArray<{
      slot: number;
      modelId: number;
      enabled?: boolean;
      knobs?: ReadonlyArray<{ index: number; value: number }>;
    }>,
  ): Promise<void> {
    const before = this.store.getState().slots;
    const after: Array<EffectState | null> = new Array(LIMITS.SLOT_COUNT).fill(null);

    for (const item of effects) {
      this.assertSlot(item.slot);
      const model = findEffectModel(item.modelId);
      if (!model) {
        throw new Error(`Unknown effect model ID: 0x${item.modelId.toString(16).padStart(4, '0')}`);
      }
      const defaults = getModelDefault(item.modelId) ?? new Uint8Array(64);
      const knobs = normalizeKnobs(Array.from(defaults.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END)), item.modelId);
      if (item.knobs) {
        for (const k of item.knobs) {
          if (isValidKnobIndex(k.index)) knobs[k.index] = clampEffectKnob(item.modelId, k.index, k.value);
        }
      }
      // Enforce Mustang hardware rule: at most one effect per DSP type.
      for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
        if (i !== item.slot && after[i]?.type === model.type) {
          after[i] = null;
        }
      }

      after[item.slot] = {
        slot: item.slot,
        type: model.type,
        modelId: item.modelId,
        enabled: item.enabled ?? true,
        knobs,
      };
    }

    await this.syncSlots(before, after);
  }

  async clearEffect(slot: number): Promise<void> {
    this.assertSlot(slot);
    const existing = this.store.getState().slots[slot];
    if (!existing) return;

    this.cancelCoalesced(`effect:${slot}`);
    this.store.clearSlot(slot);
    try {
      await this.transmit(...this.buildClearPackets(slot, existing.type));
    } catch (err) {
      if (this.store.getState().slots[slot] === null) {
        this.store.updateSlotState(slot, existing);
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async syncSlots(before: ReadonlyArray<EffectState | null>, after: ReadonlyArray<EffectState | null>) {
    const packets: PacketFactory[] = [];
    const snapshotBefore = [...before];

    for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
      this.cancelCoalesced(`effect:${i}`);
    }

    // 1. Clear any active effect whose slot is now empty OR whose slot is replaced by a different DSP type.
    // Each DSP type (Stomp, Mod, Delay, Reverb) is an independent hardware DSP unit.
    // Overwriting a slot with a different DSP type does not disable the old DSP unit on the Mustang.
    // An explicit clear packet must be sent for the vacated or replaced DSP block.
    for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
      const oldEff = snapshotBefore[i];
      if (!oldEff) continue;

      const newEff = after[i];
      if (!newEff || newEff.type !== oldEff.type) {
        packets.push(...this.buildClearPackets(i, oldEff.type));
      }
    }

    // 2. Transmit state updates for all new or changed effects in the target chain
    for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
      const newEff = after[i];
      if (!newEff) continue;

      const oldEff = snapshotBefore[i];
      if (isSameEffect(oldEff, newEff, i)) continue;

      const placed: EffectState = { ...newEff, slot: i };
      packets.push(...this.buildEffectStatePackets(placed));
    }

    // 3. Synchronize in-memory store state in a single atomic batch
    const placedSlots: Array<EffectState | null> = new Array(LIMITS.SLOT_COUNT).fill(null);
    this.store.batch(() => {
      for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
        const newEffect = after[i];
        const placed = newEffect ? { ...newEffect, slot: i } : null;
        placedSlots[i] = placed;
        this.store.updateSlotState(i, placed);
      }
    });

    // 4. Transmit all packets as one atomic FIFO transaction
    if (packets.length > 0) {
      try {
        await this.transmit(...packets);
      } catch (err) {
        const currentSlots = this.store.getState().slots;
        const stillMatches = placedSlots.every((p, idx) => currentSlots[idx] === p);
        if (stillMatches) {
          this.restoreSlots(snapshotBefore);
        }
        throw err;
      }
    }
  }

  private restoreSlots(slots: ReadonlyArray<EffectState | null>): void {
    this.store.batch(() => {
      for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
        this.store.updateSlotState(i, slots[i]);
      }
    });
  }

  private buildClearPackets(slot: number, type: DspType): PacketFactory[] {
    return [() => PacketBuilder.clearEffect(type, slot).build(), this.applyPacket(type)];
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

export function normalizeKnobs(knobs: ArrayLike<number>, modelId?: number): number[] {
  return Array.from({ length: LIMITS.KNOB_COUNT }, (_, i) =>
    modelId !== undefined ? clampEffectKnob(modelId, i, knobs[i] ?? 0) : toByte(knobs[i] ?? 0),
  );
}

function isSameEffect(oldEff: EffectState | null, newEff: EffectState, targetSlot: number): boolean {
  if (!oldEff) return false;
  if (
    oldEff.slot !== targetSlot ||
    oldEff.type !== newEff.type ||
    oldEff.modelId !== newEff.modelId ||
    oldEff.enabled !== newEff.enabled
  ) {
    return false;
  }
  if (oldEff.knobs.length !== newEff.knobs.length) return false;
  for (let i = 0; i < oldEff.knobs.length; i++) {
    if (oldEff.knobs[i] !== newEff.knobs[i]) return false;
  }
  return true;
}
