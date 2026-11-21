import { BaseController } from './base_controller';
import { DspType, findAmpModel, findCabinetModel, type ModelDef } from '../models';
import { getModelDefault } from '../defaults';
import type { KnobInfo, AmpSettings } from '../index';
import { debug } from '../helpers';
import { PacketBuilder } from '../protocol/packet_builder';
import type { AmpState } from '../store';
import type { AmpUpdateCommand, KnobChangeCommand } from '../protocol/protocol_decoder';
import {
  AMP_KNOB_INDEX,
  LIMITS,
  OFFSETS,
  clampAmpKnob,
  clampRange,
  isValidKnobIndex,
  isValidPresetSlot,
  type AdvancedAmpParam,
} from '../protocol/constants';

export class AmpController extends BaseController {
  // ---------------------------------------------------------------------------
  // Inbound (hardware -> store). These never transmit, which prevents echo loops.
  // ---------------------------------------------------------------------------

  handleKnobChange(command: KnobChangeCommand): boolean {
    if (command.dspType !== DspType.AMP) return false;
    if (!isValidKnobIndex(command.knobIndex)) {
      debug(`[AmpController] Ignoring live knob change with invalid index ${command.knobIndex}`);
      return true; // it *was* an amp packet, just malformed
    }
    this.commit(this.withKnob(this.store.getState().amp, command.knobIndex, command.value));
    return true;
  }

  handleAmpUpdate(command: AmpUpdateCommand, fallbackRefreshSlot?: number): boolean {
    this.store.batch(() => {
      this.store.updateAmpState(
        normalizeAmpState({
          modelId: command.modelId,
          enabled: true,
          cabinetId: command.cabinetId,
          knobs: command.knobs,
        }),
      );
      const state = this.store.getState();
      const resolvedSlot =
        command.presetSlot !== undefined && isValidPresetSlot(command.presetSlot) && command.presetSlot !== 0
          ? command.presetSlot
          : state.refreshing && fallbackRefreshSlot !== undefined && isValidPresetSlot(fallbackRefreshSlot)
            ? fallbackRefreshSlot
            : command.presetSlot;
      if (resolvedSlot !== undefined && isValidPresetSlot(resolvedSlot)) {
        // During bulk refresh or initial load, AMP_UPDATE (or the PRESET_INFO right before it) carries the active slot.
        // Outside refresh, ignore byte 4 === 0 so firmwares that zero byte 4 on DSP
        // updates never snap a non-zero active preset back to slot 0.
        if (state.refreshing || state.currentPresetSlot === null || resolvedSlot !== 0) {
          this.store.setPresetActive(resolvedSlot, '', true);
        }
      }
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Outbound (UI -> store -> hardware)
  // ---------------------------------------------------------------------------

  async setAmpModelById(
    modelId: number,
    knobOverrides?: ReadonlyArray<{ index: number; value: number }>,
  ): Promise<void> {
    debug(`[AmpController] setAmpModelById(0x${modelId.toString(16)})`);
    if (!findAmpModel(modelId)) {
      throw new Error(`Unknown amp model ID: 0x${modelId.toString(16).padStart(4, '0')}`);
    }

    const defaults = getModelDefault(modelId) ?? new Uint8Array(64);
    const knobs = Array.from(defaults.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END));
    if (knobOverrides) {
      for (const override of knobOverrides) {
        if (isValidKnobIndex(override.index)) {
          knobs[override.index] = clampAmpKnob(override.index, override.value);
        }
      }
    }

    const newState = normalizeAmpState({
      modelId,
      enabled: true,
      cabinetId: knobs[AMP_KNOB_INDEX.cabinet],
      knobs,
    });

    const previous = this.store.getState().amp;
    this.cancelCoalesced('amp');
    this.commit(newState);
    try {
      await this.sendAmpState(newState);
    } catch (err) {
      if (this.store.getState().amp === newState) {
        this.commit(previous);
      }
      throw err;
    }
  }

  /**
   * Update amp state from raw 32-byte array. Used when importing a full
   * preset so the in-memory store stays in sync with the hardware.
   */
  applyRawAmpState(modelId: number, cabinetId: number, knobs: ArrayLike<number>): void {
    this.commit(
      normalizeAmpState({
        modelId,
        enabled: true,
        cabinetId,
        knobs: Array.from(knobs),
      }),
    );
  }

  /**
   * Update one amp parameter and transmit to the hardware (coalesced for smooth knob drags).
   */
  async setAmpKnob(index: number, value: number): Promise<void> {
    if (!isValidKnobIndex(index)) {
      throw new Error(`Invalid amp knob index: ${index}`);
    }
    const previous = this.store.getState().amp;
    const newState = this.withKnob(previous, index, value);
    this.commit(newState);
    try {
      await this.transmitCoalesced(
        'amp',
        () => PacketBuilder.fromAmpState(newState, this.protocol.getNextSequenceId()).build(),
        this.applyPacket(DspType.AMP),
      );
    } catch (err) {
      if (this.store.getState().amp === newState) {
        this.commit(previous);
      }
      throw err;
    }
  }

  setAdvancedSetting(key: AdvancedAmpParam, value: number): Promise<void> {
    return this.setAmpKnob(AMP_KNOB_INDEX[key], value);
  }

  async setCabinetById(id: number): Promise<void> {
    debug(`[AmpController] setCabinetById(0x${id.toString(16)})`);
    if (!findCabinetModel(id)) {
      throw new Error(`Unknown cabinet ID: 0x${id.toString(16).padStart(2, '0')}`);
    }
    const previous = this.store.getState().amp;
    const newState = this.withKnob(previous, AMP_KNOB_INDEX.cabinet, id);
    this.cancelCoalesced('amp');
    this.commit(newState);
    try {
      await this.sendAmpState(newState);
    } catch (err) {
      if (this.store.getState().amp === newState) {
        this.commit(previous);
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getAmpModel(): ModelDef | null {
    return findAmpModel(this.store.getState().amp.modelId);
  }

  getAmpKnobs(): KnobInfo[] {
    const model = this.getAmpModel();
    if (!model) return [];
    const { knobs } = this.store.getState().amp;
    return model.knobs.flatMap((name, index) => (name ? [{ name, value: knobs[index] ?? 0, index }] : []));
  }

  getSettings(): AmpSettings | null {
    const model = this.getAmpModel();
    if (!model) return null;

    const state = this.store.getState().amp;
    const k = (i: number) => state.knobs[i] ?? 0;

    return {
      model: model.name,
      modelId: model.id,
      volume: k(AMP_KNOB_INDEX.volume),
      gain: k(AMP_KNOB_INDEX.gain),
      gain2: k(AMP_KNOB_INDEX.gain2),
      master: k(AMP_KNOB_INDEX.master),
      treble: k(AMP_KNOB_INDEX.treble),
      mid: k(AMP_KNOB_INDEX.mid),
      bass: k(AMP_KNOB_INDEX.bass),
      presence: k(AMP_KNOB_INDEX.presence),
      depth: k(AMP_KNOB_INDEX.depth),
      bias: k(AMP_KNOB_INDEX.bias),
      noiseGate: k(AMP_KNOB_INDEX.noiseGate),
      threshold: k(AMP_KNOB_INDEX.threshold),
      cabinetId: state.cabinetId,
      sag: k(AMP_KNOB_INDEX.sag),
      brightness: k(AMP_KNOB_INDEX.brightness),
      knobs: this.getAmpKnobs(),
    };
  }

  getCabinet(): { id: number; name: string } | null {
    const id = this.store.getState().amp.cabinetId;
    return findCabinetModel(id);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private withKnob(state: AmpState, index: number, value: number): AmpState {
    const knobs = [...state.knobs];
    const clamped = clampAmpKnob(index, value);
    knobs[index] = clamped;
    return normalizeAmpState({
      ...state,
      knobs,
      cabinetId: index === AMP_KNOB_INDEX.cabinet ? clamped : state.cabinetId,
    });
  }

  private commit(state: AmpState): void {
    this.store.updateAmpState(state);
  }

  private sendAmpState(state: AmpState): Promise<void> {
    return this.transmit(
      () => PacketBuilder.fromAmpState(state, this.protocol.getNextSequenceId()).build(),
      this.applyPacket(DspType.AMP),
    );
  }
}

/**
 * Enforce the AmpState invariants: exactly 32 clamped hardware parameter bytes,
 * and the cabinet byte (knob 17 / packet byte 49) always equal to `cabinetId`.
 */
export function normalizeAmpState(state: AmpState): AmpState {
  const knobs = Array.from({ length: LIMITS.KNOB_COUNT }, (_, i) => clampAmpKnob(i, state.knobs[i] ?? 0));
  const cabinetId = clampRange(state.cabinetId, 0, LIMITS.MAX_CABINET_ID);
  knobs[AMP_KNOB_INDEX.cabinet] = cabinetId;
  return { ...state, cabinetId, knobs };
}
