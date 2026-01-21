import { BaseController } from './base_controller';
import { DspType, EFFECT_MODELS, type ModelDef } from '../models';
import { getModelDefault } from '../defaults';
import type { EffectState } from '../state_types';
import type { EffectSettings } from '../api';
import { debug } from '../helpers';
import { PacketBuilder } from '../packet_builder';
import type { KnobInfo } from '../api';
import { PacketParser } from '../parser';

export type EffectChangePayload = {
  slot: number;
  modelId: number;
  knobs: KnobInfo[];
};

export type EffectEvents = {
  change: EffectChangePayload;
};

export class EffectController extends BaseController<EffectEvents> {
  // Methods to expose helper logic for API if needed, or API calls methods directly?
  // We need to implement process(data)

  process(data: Uint8Array): boolean {
    const b0 = data[0];

    // 1. Live Knob Change (Direct Type 0x06..0x09)
    if (b0 >= DspType.STOMP && b0 <= DspType.REVERB) {
      if (data[1] === 0x00) {
        const slot = data[13] || 0;
        const paramIndex = data[5];
        const paramValue = data[10];

        if (slot >= 0 && slot < 8) {
          const effect = this.store.getState().slots[slot];
          if (effect) {
            const newState = { ...effect, knobs: [...effect.knobs] };
            newState.knobs[paramIndex] = paramValue;
            this.store.updateSlotState(slot, newState);

            this.emit('change', { slot, modelId: this.getEffectModelId(slot), knobs: this.getEffectKnobs(slot) });
            return true;
          }
        }
      }
    }

    // 2. Data Packet (0x1c) - State Update (e.g. from refreshState or preset load)
    if (b0 === 0x1c && data[1] === 0x01) {
      const type = data[2];
      const instance = data[3];
      const isValidEffectType = type >= DspType.STOMP && type <= DspType.REVERB;

      // We ONLY process Active state (Instance 0x00)
      // Instance 0x01+ is for Library/Component discovery and should be ignored here
      if (isValidEffectType && instance === 0x00) {
        const slot = data[18];
        if (slot >= 0 && slot < 8) {
          // Singleton Migration Logic
          // If hardware sends an effect to a new slot, ensure it's removed from old slot
          const currentType = type as DspType;
          for (let i = 0; i < 8; i++) {
            if (i === slot) continue;
            const otherEffect = this.store.getState().slots[i];
            if (otherEffect && otherEffect.type === currentType) {
              debug(
                `[EffectController] Singleton migration: Clearing slot ${i} because ${DspType[currentType]} moved to ${slot}`,
              );
              this.store.clearSlot(i);
              this.emit('change', { slot: i, modelId: 0, knobs: [] });
            }
          }

          const newState = PacketParser.parseEffectSettings(data, slot);
          this.store.updateSlotState(slot, newState);
          this.emit('change', { slot, modelId: this.getEffectModelId(slot), knobs: this.getEffectKnobs(slot) });
          return true;
        }
      }
    }

    // 3. Bypass Response (0x19)
    if (PacketParser.isBypassResponse(data)) {
      const bypassInfo = PacketParser.parseBypassResponse(data);
      if (bypassInfo) {
        const { slot, enabled } = bypassInfo;
        if (slot >= 0 && slot < 8) {
          this.store.setEffectBypass(slot, enabled);
          this.emit('change', {
            slot,
            modelId: this.getEffectModelId(slot),
            knobs: this.getEffectKnobs(slot),
          });
          return true;
        }
      }
    }

    return false;
  }

  // Need helper to extract knobs for event emission
  private getBufferKnobs(slot: number): KnobInfo[] {
    const model = this.getEffectModel(slot);
    if (!model) return [];

    const effect = this.store.getState().slots[slot];
    if (!effect) return [];

    const knobs: KnobInfo[] = [];
    model.knobs.forEach((name, index) => {
      if (name) {
        knobs.push({
          name,
          value: effect.knobs[index],
          index,
        });
      }
    });
    return knobs;
  }

  // Public for API convenience
  getEffectKnobs(slot: number) {
    return this.getBufferKnobs(slot);
  }

  getEffectModelId(slot: number) {
    return this.getEffectModel(slot)?.id || 0;
  }

  getSettings(slot: number): EffectSettings | null {
    const model = this.getEffectModel(slot);
    if (!model) return null;
    return {
      slot,
      type: model.type,
      model: model.name,
      modelId: model.id,
      enabled: this.store.getState().effectEnabled[slot],
      knobs: this.getBufferKnobs(slot),
    };
  }

  async setEffectById(slot: number, modelId: number): Promise<void> {
    debug(`[EffectController] setEffectById(slot: ${slot}, modelId: 0x${modelId.toString(16)})`);
    const model = Object.values(EFFECT_MODELS).find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Unknown effect model ID: 0x${modelId.toString(16).padStart(4, '0')}`);
    }

    if (slot < 0 || slot > 7) throw new Error(`Invalid slot: ${slot}`);

    // HARDWARE LIMIT: Only one effect of each type allowed in the chain
    // We check the store state
    for (let i = 0; i < 8; i++) {
      if (i === slot) continue;
      const otherEffect = this.store.getState().slots[i];
      if (otherEffect && otherEffect.type === model.type) {
        // Auto-clear logic handled by UI or throw?
        // Throws error per original implementation
        throw new Error(`Effect of type ${DspType[model.type]} already exists in slot ${i}`);
      }
    }

    const buffer = getModelDefault(modelId) || new Uint8Array(64);

    // Construct EffectState
    const newState: EffectState = {
      type: model.type,
      modelId: modelId,
      slot: slot,
      enabled: true, // Default enabled?
      knobs: Array.from(buffer.slice(32, 64)),
    };

    this.store.updateSlotState(slot, newState);
    this.emit('change', { slot, modelId, knobs: this.getEffectKnobs(slot) }); // Local

    await this.sendEffectState(newState);
  }

  async setEffectEnabled(slot: number, enabled: boolean) {
    debug(`[EffectController] setEffectEnabled(slot: ${slot}, enabled: ${enabled})`);
    const effect = this.store.getState().slots[slot];
    if (!effect) return;

    // Update Store
    this.store.setEffectBypass(slot, enabled);
    // Emit change? Enabled state isn't in 'change' payload (just knobs), but maybe expected.
    // We'll emit general state change in API.

    // Send Packet
    const packet = PacketBuilder.bypass(slot, enabled, effect.type).build();
    await this.protocol.sendPacket(packet);
  }

  async swapEffects(slotA: number, slotB: number): Promise<void> {
    if (slotA < 0 || slotA > 7 || slotB < 0 || slotB > 7) throw new Error(`Invalid slot indices: ${slotA}, ${slotB}`);
    if (slotA === slotB) return;

    const state = this.store.getState();
    const effectA = state.slots[slotA];
    const effectB = state.slots[slotB];

    // Clear both locally first
    this.store.updateSlotState(slotA, null);
    this.store.updateSlotState(slotB, null);

    if (effectA) {
      const newB: EffectState = { ...effectA, slot: slotB };
      this.store.updateSlotState(slotB, newB);
      await this.sendEffectState(newB);
      this.emit('change', { slot: slotB, modelId: newB.modelId, knobs: this.getBufferKnobs(slotB) });
    } else {
      await this.clearEffectOnHardware(slotB);
      this.emit('change', { slot: slotB, modelId: 0, knobs: [] });
    }

    if (effectB) {
      const newA: EffectState = { ...effectB, slot: slotA };
      this.store.updateSlotState(slotA, newA);
      await this.sendEffectState(newA);
      this.emit('change', { slot: slotA, modelId: newA.modelId, knobs: this.getBufferKnobs(slotA) });
    } else {
      await this.clearEffectOnHardware(slotA);
      this.emit('change', { slot: slotA, modelId: 0, knobs: [] });
    }
  }

  async clearEffect(slot: number): Promise<void> {
    if (slot < 0 || slot > 7) throw new Error(`Invalid slot: ${slot}`);

    const effect = this.store.getState().slots[slot];
    const type = effect ? effect.type : DspType.STOMP;

    this.store.clearSlot(slot); // Updates store to null
    this.emit('change', { slot, modelId: 0, knobs: [] });

    await this.sendClearPacket(slot, type);
  }

  private async clearEffectOnHardware(slot: number) {
    await this.sendClearPacket(slot, DspType.STOMP);
  }

  private async sendClearPacket(slot: number, type: DspType) {
    // Construct packet manually as before
    const seq = this.protocol.getNextSequenceId();
    const builder = PacketBuilder.dspWrite(type, seq);
    builder.setByte(18, slot);
    builder.setByte(22, 1); // Bypass/Empty

    await this.protocol.sendPacket(builder.build());
    await this.protocol.sendPacket(PacketBuilder.applyChange(type, this.protocol.getNextSequenceId()).build());
  }

  getEffectModel(slot: number): ModelDef | null {
    const effect = this.store.getState().slots[slot];
    if (!effect) return null;
    return Object.values(EFFECT_MODELS).find(m => m.id === effect.modelId) || null;
  }

  async setEffectKnob(slot: number, index: number, value: number): Promise<void> {
    const effect = this.store.getState().slots[slot];
    if (!effect) throw new Error(`No effect in slot ${slot}`);

    const newState = { ...effect, knobs: [...effect.knobs] };
    newState.knobs[index] = value;

    this.store.updateSlotState(slot, newState);
    this.emit('change', { slot, modelId: newState.modelId, knobs: this.getBufferKnobs(slot) }); // Local

    await this.sendEffectState(newState);
  }

  private async sendEffectState(state: EffectState) {
    const sequenceId = this.protocol.getNextSequenceId();
    const packet = PacketBuilder.fromEffectState(state, sequenceId).build();
    await this.protocol.sendPacket(packet);

    const applyPacket = PacketBuilder.applyChange(state.type, this.protocol.getNextSequenceId()).build();
    await this.protocol.sendPacket(applyPacket);
  }
}
