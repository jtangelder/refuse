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
  isValidKnobIndex,
  toByte,
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

  handleAmpUpdate(command: AmpUpdateCommand): boolean {
    this.store.updateAmpState(
      normalizeAmpState({
        modelId: command.modelId,
        enabled: true,
        cabinetId: command.cabinetId,
        knobs: command.knobs,
      }),
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Outbound (UI -> store -> hardware)
  // ---------------------------------------------------------------------------

  async setAmpModelById(modelId: number): Promise<void> {
    debug(`[AmpController] setAmpModelById(0x${modelId.toString(16)})`);
    if (!findAmpModel(modelId)) {
      throw new Error(`Unknown amp model ID: 0x${modelId.toString(16).padStart(4, '0')}`);
    }

    const defaults = getModelDefault(modelId) ?? new Uint8Array(64);
    const newState = normalizeAmpState({
      modelId,
      enabled: true,
      cabinetId: defaults[OFFSETS.CABINET_ID],
      knobs: Array.from(defaults.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END)),
    });

    this.commit(newState);
    await this.sendAmpState(newState);
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
   * Update one amp parameter and transmit to the hardware.
   */
  setAmpKnob(index: number, value: number): Promise<void> {
    if (!isValidKnobIndex(index)) {
      return Promise.reject(new Error(`Invalid amp knob index: ${index}`));
    }
    const newState = this.withKnob(this.store.getState().amp, index, value);
    this.commit(newState);
    return this.sendAmpState(newState);
  }

  setAdvancedSetting(key: AdvancedAmpParam, value: number): Promise<void> {
    return this.setAmpKnob(AMP_KNOB_INDEX[key], value);
  }

  async setCabinetById(id: number): Promise<void> {
    debug(`[AmpController] setCabinetById(0x${id.toString(16)})`);
    if (!findCabinetModel(id)) {
      throw new Error(`Unknown cabinet ID: 0x${id.toString(16).padStart(2, '0')}`);
    }
    const newState = this.withKnob(this.store.getState().amp, AMP_KNOB_INDEX.cabinet, id);
    this.commit(newState);
    await this.sendAmpState(newState);
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
    knobs[index] = toByte(value);
    return normalizeAmpState({
      ...state,
      knobs,
      cabinetId: index === AMP_KNOB_INDEX.cabinet ? toByte(value) : state.cabinetId,
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
 * Enforce the AmpState invariants: exactly 32 byte-sized knobs, and the cabinet
 * byte (knob 17 / packet byte 49) always equal to `cabinetId`.
 */
export function normalizeAmpState(state: AmpState): AmpState {
  const knobs = Array.from({ length: LIMITS.KNOB_COUNT }, (_, i) => toByte(state.knobs[i] ?? 0));
  const cabinetId = toByte(state.cabinetId);
  knobs[AMP_KNOB_INDEX.cabinet] = cabinetId;
  return { ...state, cabinetId, knobs };
}
