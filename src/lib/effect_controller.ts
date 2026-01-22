import { BaseController } from './base_controller';
import { DspType, EFFECT_MODELS, type ModelDef } from './models';
import { getModelDefault } from './defaults';
import type { EffectState } from './state_types';
import type { EffectSettings } from './api';
import { debug } from './helpers';
import { PacketBuilder } from './packet_builder';
import type { KnobInfo } from './api';
import type { Command } from './protocol_decoder';

export class EffectController extends BaseController {
  process(command: Command): boolean {
    // 1. Live Knob Change
    if (command.type === 'KNOB_CHANGE') {
      const { slot, knobIndex, value } = command;

      if (slot >= 0 && slot < 8) {
        const effect = this.store.getState().slots[slot];
        if (effect) {
          const newState = { ...effect, knobs: [...effect.knobs] };
          newState.knobs[knobIndex] = value;
          this.store.updateSlotState(slot, newState);

          return true;
        }
      }
    }

    // 2. State Update
    if (command.type === 'EFFECT_UPDATE') {
      const { slot, dspType, modelId, enabled, knobs } = command;

      if (slot >= 0 && slot < 8) {
        // Singleton Migration Logic
        // If hardware sends an effect to a new slot, ensure it's removed from old slot
        for (let i = 0; i < 8; i++) {
          if (i === slot) continue;
          const otherEffect = this.store.getState().slots[i];
          if (otherEffect && otherEffect.type === dspType) {
            debug(
              `[EffectController] Singleton migration: Clearing slot ${i} because ${DspType[dspType]} moved to ${slot}`,
            );
            this.store.clearSlot(i);
          }
        }

        const newState: EffectState = {
          slot,
          type: dspType,
          modelId,
          enabled,
          knobs,
        };

        this.store.updateSlotState(slot, newState);

        return true;
      }
    }

    // 3. Bypass Response
    if (command.type === 'BYPASS_STATE') {
      const { slot, enabled } = command;
      if (slot >= 0 && slot < 8) {
        this.store.setEffectBypass(slot, enabled);

        return true;
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
    const effect = this.store.getState().slots[slot];

    if (!model || !effect) return null;
    return {
      slot,
      type: model.type,
      model: model.name,
      modelId: model.id,
      enabled: effect.enabled,
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
    } else {
      await this.clearEffectOnHardware(slotB);
    }

    if (effectB) {
      const newA: EffectState = { ...effectB, slot: slotA };
      this.store.updateSlotState(slotA, newA);
      await this.sendEffectState(newA);
    } else {
      await this.clearEffectOnHardware(slotA);
    }
  }

  async clearEffect(slot: number): Promise<void> {
    if (slot < 0 || slot > 7) throw new Error(`Invalid slot: ${slot}`);

    const effect = this.store.getState().slots[slot];
    const type = effect ? effect.type : DspType.STOMP;

    this.store.clearSlot(slot); // Updates store to null

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
