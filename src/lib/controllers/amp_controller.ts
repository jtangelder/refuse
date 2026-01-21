import { BaseController } from './base_controller';
import { DspType, AMP_MODELS, CABINET_MODELS, type ModelDef } from '../models';
import { getModelDefault } from '../defaults';
import type { KnobInfo, AmpSettings } from '../api';
import { debug } from '../helpers';
import { PacketBuilder } from '../packet_builder';
import type { AmpState } from '../state_types';
import { PacketParser } from '../parser';

export type AmpEvents = {
  change: AmpState;
};

export class AmpController extends BaseController<AmpEvents> {
  process(data: Uint8Array): boolean {
    const b0 = data[0];
    const b1 = data[1];

    // 1. Live Knob Change (type 0x05)
    if (b0 === DspType.AMP && b1 === 0x00) {
      const paramIndex = data[5];
      const paramValue = data[10];

      // Update Store
      const ampState = this.store.getState().amp;
      const newState = { ...ampState, knobs: [...ampState.knobs] };
      newState.knobs[paramIndex] = paramValue;
      this.store.updateAmpState(newState);

      this.emit('change', newState);
      return true;
    }

    // 2. Data Packet (0x1c) - State Update
    if (b0 === 0x1c && data[1] === 0x01) {
      const type = data[2];
      const instance = data[3];
      if (type === DspType.AMP && instance === 0x00) {
        const newState = PacketParser.parseAmpSettings(data);
        this.store.updateAmpState(newState);
        this.emit('change', this.store.getState().amp);
        return true;
      }
    }

    return false;
  }

  async setAmpModelById(modelId: number): Promise<void> {
    debug(`[AmpController] setAmpModelById(modelId: 0x${modelId.toString(16)})`);
    const model = Object.values(AMP_MODELS).find(m => m.id === modelId);
    if (!model) throw new Error(`Unknown amp model ID: 0x${modelId.toString(16).padStart(4, '0')}`);

    // Create new State based on defaults
    const defaultBuffer = getModelDefault(modelId) || new Uint8Array(64);

    // Construct AmpState from default buffer
    const newState: AmpState = {
      modelId: modelId,
      enabled: true,
      cabinetId: defaultBuffer[49],
      knobs: Array.from(defaultBuffer.slice(32, 64)),
    };

    // Update Store
    this.store.updateAmpState(newState);
    this.emit('change', newState); // Local Change

    // Send to hardware
    await this.sendAmpState(newState);
  }

  async setAmpKnob(index: number, value: number): Promise<void> {
    debug(`[AmpController] setAmpKnob(index: ${index}, value: ${value})`);
    const state = this.store.getState().amp;

    // Clone state
    const newState: AmpState = {
      ...state,
      knobs: [...state.knobs],
    };
    newState.knobs[index] = value;

    this.store.updateAmpState(newState);
    this.emit('change', newState); // Local Change

    await this.sendAmpState(newState);
  }

  getAmpModel(): ModelDef | null {
    const state = this.store.getState().amp;
    return Object.values(AMP_MODELS).find(m => m.id === state.modelId) || null;
  }

  getAmpKnobs(): KnobInfo[] {
    const model = this.getAmpModel();
    if (!model) return [];

    const state = this.store.getState().amp;

    const knobs: KnobInfo[] = [];
    model.knobs.forEach((name, index) => {
      if (name) {
        knobs.push({
          name,
          value: state.knobs[index],
          index,
        });
      }
    });
    return knobs;
  }

  getSettings(): AmpSettings | null {
    const model = this.getAmpModel();
    if (!model) return null;

    const state = this.store.getState().amp;
    const k = state.knobs;

    return {
      model: model.name,
      modelId: model.id,
      volume: k[0], // 32
      gain: k[1], // 33
      gain2: k[2],
      master: k[3],
      treble: k[4],
      mid: k[5],
      bass: k[6],
      presence: k[7],
      depth: k[9], // 41 -> index 9
      bias: k[10], // 42 -> 10
      noiseGate: k[15], // 47 -> 15
      threshold: k[16], // 48 -> 16
      cabinet: state.cabinetId, // 49
      sag: k[19], // 51 -> 19
      brightness: k[20], // 52 -> 20
      knobs: this.getAmpKnobs(),
    };
  }

  async setCabinetById(id: number): Promise<void> {
    debug(`[AmpController] setCabinetById(id: 0x${id.toString(16)})`);
    const cabinet = CABINET_MODELS.find(c => c.id === id);
    if (!cabinet) {
      throw new Error(`Unknown cabinet ID: 0x${id.toString(16).padStart(2, '0')}`);
    }

    // Update Store
    const currentAmp = this.store.getState().amp;
    const newAmp: AmpState = {
      ...currentAmp,
      cabinetId: id,
    };
    this.store.updateAmpState(newAmp);

    // Send to hardware
    // Cabinet changes are sent as part of the AMP packet (byte 49)
    await this.sendAmpState(newAmp);
  }

  getCabinet(): { id: number; name: string } | null {
    const id = this.store.getState().amp.cabinetId;
    return CABINET_MODELS.find(c => c.id === id) || null;
  }

  private async sendAmpState(state: AmpState) {
    const sequenceId = this.protocol.getNextSequenceId();
    const packet = PacketBuilder.fromAmpState(state, sequenceId).build();
    await this.protocol.sendPacket(packet);

    const applyPacket = PacketBuilder.applyChange(DspType.AMP, this.protocol.getNextSequenceId()).build();
    await this.protocol.sendPacket(applyPacket);
  }
}
