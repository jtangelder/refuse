/**
 * FENDER MUSTANG API (v11 - Layered Architecture)
 * 
 * High-level API for controlling Fender Mustang amplifiers.
 * Built on top of the MustangProtocol layer for clean separation of concerns.
 * 
 * Features:
 * - Event-driven architecture for UI synchronization
 * - Automatic state management and hardware sync
 * - High-level methods with model lookups
 * - Preset management (save/load/list)
 * - Complete amp, effect, and cabinet control
 */

import { MustangProtocol, OPCODES } from './protocol';
import type { ModelDef } from './models';
import {
  DspType,
  AMP_MODELS,
  EFFECT_MODELS,
  CABINET_MODELS,
} from './models';

// --- TYPE DEFINITIONS ---

// Re-export types
export type { ModelDef } from './models';

// Re-export values (enums, constants, objects)
export { DspType, AMP_MODELS, EFFECT_MODELS, CABINET_MODELS, FENDER_VID } from './models';

export interface PresetMetadata {
  slot: number;
  name: string;
}

export interface AmpSettings {
  model: string;
  modelId: number;
  volume: number;
  gain: number;
  gain2: number;
  master: number;
  treble: number;
  mid: number;
  bass: number;
  presence: number;
  depth: number;
  bias: number;
  noiseGate: number;
  threshold: number;
  cabinet: number;
  sag: number;
  brightness: number;
}

export interface EffectSettings {
  slot: number;
  type: DspType;
  model: string;
  modelId: number;
  enabled: boolean;
  knobs: Record<string, number>;
}

export interface Preset {
  slot: number;
  name: string;
  amp: AmpSettings;
  effects: EffectSettings[];
}

// --- EVENT SYSTEM ---

type EventCallback = (...args: any[]) => void;

export type MustangEvents = {
  'connected': () => void;
  'disconnected': () => void;
  'preset-loaded': (slot: number, name: string) => void;
  'amp-changed': (model: string, knobs: Record<string, number>) => void;
  'effect-changed': (slot: number, model: string, knobs: Record<string, number>) => void;
  'bypass-toggled': (slot: number, enabled: boolean) => void;
  'knob-changed': (type: 'amp' | 'effect', slot: number, knob: string, value: number) => void;
  'cabinet-changed': (cabinetName: string) => void;
  'state-changed': () => void;
};

class EventEmitter {
  private events: Map<string, EventCallback[]> = new Map();

  on<K extends keyof MustangEvents>(event: K, callback: MustangEvents[K]): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(callback as EventCallback);
  }

  off<K extends keyof MustangEvents>(event: K, callback: MustangEvents[K]): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback as EventCallback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit<K extends keyof MustangEvents>(event: K, ...args: Parameters<MustangEvents[K]>): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(...args));
    }
  }

  removeAllListeners(): void {
    this.events.clear();
  }
}

// --- MAIN API CLASS ---

export class MustangAPI extends EventEmitter {
  private protocol: MustangProtocol;

  /**
   * SINGLE SOURCE OF TRUTH (Reactive State)
   * UI components should read directly from here.
   * Hardware changes write directly to here.
   */
  public state = {
    [DspType.AMP]: new Uint8Array(64),
    [DspType.MOD]: new Uint8Array(64),
    [DspType.DELAY]: new Uint8Array(64),
    [DspType.REVERB]: new Uint8Array(64),
    // Stomp slots 0-3
    stomps: [
      new Uint8Array(64),
      new Uint8Array(64),
      new Uint8Array(64),
      new Uint8Array(64),
    ],
  };

  /**
   * Tracks the Active/Bypass status of effects (True = Active/On)
   * Indices 0-7 correspond to effect slots.
   */
  public effectEnabled: boolean[] = [
    true, true, true, true,
    true, true, true, true,
  ];

  /**
   * Current loaded preset slot (0-23) or null if unsaved state
   */
  public currentPresetSlot: number | null = null;

  /**
   * Cached preset metadata
   */
  public presets: Map<number, PresetMetadata> = new Map();

  constructor() {
    super();
    this.protocol = new MustangProtocol();
  }

  public get isConnected(): boolean {
    return this.protocol.isConnected;
  }

  public get device(): any {
    return (this.protocol as any).device;
  }

  // ==========================================
  // CONNECTION & SYNC
  // ==========================================

  async connect(): Promise<boolean> {
    const connected = await this.protocol.connect();
    if (!connected) return false;

    // Automatically start monitoring and sync state
    this.startMonitoring();
    await this.refreshState();
    await this.refreshBypassStates();

    this.emit('connected');
    return true;
  }

  async disconnect(): Promise<void> {
    await this.protocol.disconnect();
    this.emit('disconnected');
  }

  /**
   * PRIVATE: Starts the reactive listener automatically after connection.
   * It keeps 'this.state' and 'this.effectEnabled' perfectly in sync with hardware.
   * This is called automatically by connect() - you don't need to call it manually.
   */
  private startMonitoring() {
    this.protocol.addEventListener((data: Uint8Array) => {
      const b0 = data[0];
      const b1 = data[1];

      console.log('HID Input:', data);

      // 1. LIVE KNOB CHANGES (Physical knob turned on amp)
      // Opcode: 0x05 [Type] ... (from physical hardware)
      if (b0 === OPCODES.LIVE_CHANGE) {
        const type = data[1] as DspType;
        const slot = data[13] || 0;

        // Update the correct buffer in 'this.state'
        if (type === DspType.STOMP) {
          if (slot >= 0 && slot < 4) this.state.stomps[slot].set(data);
        } else if (this.state[type]) {
          this.state[type].set(data);
        }

        // Emit appropriate event
        if (type === DspType.AMP) {
          const model = this.getAmpModel();
          const knobs = this.getAmpKnobs();
          this.emit('amp-changed', model?.name || 'Unknown', knobs);
        } else {
          const effectModel = this.getEffectModel(slot);
          const knobs = this.getEffectKnobs(slot);
          this.emit('effect-changed', slot, effectModel?.name || 'Unknown', knobs);
        }

        this.emit('state-changed');
      }

      // 2. DATA UPDATES (Software changes & state dumps)
      // 0x1c 0x03 (Param Change) OR 0x1c 0x01 (Preset Load/State Response)
      else if (b0 === OPCODES.DATA_PACKET && (b1 === OPCODES.DATA_WRITE || b1 === OPCODES.DATA_READ)) {
        const type = data[2];
        const slot = data[18];

        // Handle preset name packets
        if (type === OPCODES.PRESET_INFO) {
          const presetInfo = MustangProtocol.parsePresetName(data);
          if (presetInfo) {
            const { slot: presetSlot, name } = presetInfo;
            this.currentPresetSlot = presetSlot;
            this.presets.set(presetSlot, { slot: presetSlot, name });
            this.emit('preset-loaded', presetSlot, name);
          }
          return;
        }

        // Update the correct buffer in 'this.state' (cast type back to DspType)
        const dspType = type as DspType;
        if (dspType === DspType.STOMP) {
          if (slot >= 0 && slot < 4) this.state.stomps[slot].set(data);
        } else if (this.state[dspType]) {
          this.state[dspType].set(data);
        }

        // Update Bypass Tracker from Byte 22 (Standard Protocol)
        // 1 = Bypassed, 0 = Active
        if (type !== DspType.AMP && type !== OPCODES.PRESET_INFO) {
          this.effectEnabled[slot] = data[22] === 0;
        }

        // Emit appropriate event (only for 0x03 param changes, not state dumps)
        if (b1 === OPCODES.DATA_WRITE && type !== OPCODES.PRESET_INFO) {
          if (type === DspType.AMP) {
            const model = this.getAmpModel();
            const knobs = this.getAmpKnobs();
            this.emit('amp-changed', model?.name || 'Unknown', knobs);
          } else {
            const effectModel = this.getEffectModel(slot);
            const knobs = this.getEffectKnobs(slot);
            this.emit('effect-changed', slot, effectModel?.name || 'Unknown', knobs);
          }

          this.emit('state-changed');
        }
      }

      // 3. BYPASS TOGGLES (Footswitch / Button Press)
      else if (MustangProtocol.isBypassResponse(data)) {
        const bypassInfo = MustangProtocol.parseBypassResponse(data);
        if (bypassInfo) {
          const { slot, enabled } = bypassInfo;
          this.effectEnabled[slot] = enabled;
          this.emit('bypass-toggled', slot, enabled);
          this.emit('state-changed');
        }
      }
    });
  }

  /**
   * PRIVATE: Request DSP Dump (Knobs).
   * Called automatically by connect() - you don't need to call it manually.
   */
  private async refreshState() {
    await this.protocol.requestState();
  }

  /**
   * PRIVATE: Request Bypass Flags (On/Off lights).
   * Called automatically by connect() - you don't need to call it manually.
   */
  private async refreshBypassStates(): Promise<void> {
    return new Promise<void>(async (resolve) => {
      const pending = new Set([0, 1, 2, 3, 4, 5, 6, 7]); // All effect slots
      const listener = (data: Uint8Array) => {
        if (MustangProtocol.isBypassResponse(data)) {
          const bypassInfo = MustangProtocol.parseBypassResponse(data);
          if (bypassInfo) {
            pending.delete(bypassInfo.slot);
            if (pending.size === 0) {
              this.protocol.removeEventListener(listener);
              resolve();
            }
          }
        }
      };
      this.protocol.addEventListener(listener);

      // Send Request
      await this.protocol.requestBypassStates();

      // Timeout fallback
      setTimeout(() => {
        this.protocol.removeEventListener(listener);
        resolve();
      }, 1000);
    });
  }

  // ==========================================
  // PRESET MANAGEMENT
  // ==========================================

  async savePreset(slot: number, name: string): Promise<void> {
    const packet = this.protocol.createPresetSavePacket(slot, name);
    await this.protocol.sendPacket(packet);

    // Update cache
    this.currentPresetSlot = slot;
    this.presets.set(slot, { slot, name });
  }

  async loadPreset(slot: number): Promise<void> {
    const packet = this.protocol.createPresetLoadPacket(slot);
    await this.protocol.sendPacket(packet);
  }

  async getPresetList(): Promise<void> {
    await this.refreshState();
  }

  // ==========================================
  // HIGH-LEVEL AMP CONTROL
  // ==========================================

  async setAmpModelById(modelId: number): Promise<void> {
    const model = Object.values(AMP_MODELS).find(m => m.id === modelId);
    if (!model) throw new Error(`Unknown amp model ID: 0x${modelId.toString(16).padStart(4, '0')}`);

    const buffer = this.state[DspType.AMP];
    buffer[16] = (modelId >> 8) & 0xff;
    buffer[17] = modelId & 0xff;

    await this.sendFullBuffer(DspType.AMP, 0, buffer);
  }

  async setAmpModel(name: string): Promise<void> {
    const model = Object.values(AMP_MODELS).find(m => m.name === name);
    if (!model) {
      const available = Object.values(AMP_MODELS).map(m => m.name).join(', ');
      throw new Error(`Unknown amp model: "${name}". Available: ${available}`);
    }
    await this.setAmpModelById(model.id);
  }

  getAmpModel(): ModelDef | null {
    const buffer = this.state[DspType.AMP];
    const modelId = (buffer[16] << 8) | buffer[17];
    return Object.values(AMP_MODELS).find(m => m.id === modelId) || null;
  }

  getAmpModelId(): number {
    const buffer = this.state[DspType.AMP];
    return (buffer[16] << 8) | buffer[17];
  }

  async setAmpKnob(knobName: string, value: number): Promise<void> {
    const model = this.getAmpModel();
    if (!model) throw new Error("No amp model set");

    const knobIndex = model.knobs.indexOf(knobName);
    if (knobIndex === -1) throw new Error(`Unknown knob: ${knobName}`);

    await this.setParameter(DspType.AMP, 0, 32 + knobIndex, value);
  }

  getAmpKnob(knobName: string): number {
    const model = this.getAmpModel();
    if (!model) throw new Error("No amp model set");

    const knobIndex = model.knobs.indexOf(knobName);
    if (knobIndex === -1) throw new Error(`Unknown knob: ${knobName}`);

    return this.state[DspType.AMP][32 + knobIndex];
  }

  getAmpKnobs(): Record<string, number> {
    const model = this.getAmpModel();
    if (!model) return {};

    const knobs: Record<string, number> = {};
    model.knobs.forEach((name, index) => {
      if (name) knobs[name] = this.state[DspType.AMP][32 + index];
    });
    return knobs;
  }

  getAmpSettings(): AmpSettings | null {
    const model = this.getAmpModel();
    if (!model) return null;

    const buf = this.state[DspType.AMP];
    return {
      model: model.name,
      modelId: model.id,
      volume: buf[32],
      gain: buf[33],
      gain2: buf[34],
      master: buf[35],
      treble: buf[36],
      mid: buf[37],
      bass: buf[38],
      presence: buf[39],
      depth: buf[41],
      bias: buf[42],
      noiseGate: buf[47],
      threshold: buf[48],
      cabinet: buf[49],
      sag: buf[51],
      brightness: buf[52],
    };
  }

  // ==========================================
  // HIGH-LEVEL EFFECT CONTROL
  // ==========================================

  private getBufferForSlot(slot: number): { buffer: Uint8Array; type: DspType } | null {
    if (slot >= 0 && slot <= 3) {
      return { buffer: this.state.stomps[slot], type: DspType.STOMP };
    } else if (slot === 4) {
      return { buffer: this.state[DspType.MOD], type: DspType.MOD };
    } else if (slot === 5 || slot === 6) {
      return { buffer: this.state[DspType.DELAY], type: DspType.DELAY };
    } else if (slot === 7) {
      return { buffer: this.state[DspType.REVERB], type: DspType.REVERB };
    }
    return null;
  }

  async setEffectById(slot: number, modelId: number): Promise<void> {
    const model = Object.values(EFFECT_MODELS).find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Unknown effect model ID: 0x${modelId.toString(16).padStart(4, '0')}`);
    }

    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo) throw new Error(`Invalid slot: ${slot}`);

    const { buffer, type } = slotInfo;

    // Validate slot type matches effect type
    if (type === DspType.STOMP && model.type !== DspType.STOMP) {
      throw new Error(`Slot ${slot} is for stomps, but effect is ${DspType[model.type]}`);
    } else if (type !== DspType.STOMP && model.type !== type) {
      throw new Error(`Slot ${slot} is for ${DspType[type]}, but effect is ${DspType[model.type]}`);
    }

    buffer[16] = (modelId >> 8) & 0xff;
    buffer[17] = modelId & 0xff;
    buffer[18] = slot;
    buffer[22] = 0; // Enable by default

    await this.sendFullBuffer(type, slot, buffer);
  }

  async setEffect(slot: number, name: string): Promise<void> {
    const model = Object.values(EFFECT_MODELS).find(m => m.name === name);
    if (!model) {
      const available = Object.values(EFFECT_MODELS).map(m => m.name).join(', ');
      throw new Error(`Unknown effect: "${name}". Available: ${available}`);
    }
    await this.setEffectById(slot, model.id);
  }

  async clearEffect(slot: number): Promise<void> {
    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo) throw new Error(`Invalid slot: ${slot}`);

    const buffer = new Uint8Array(64);
    buffer[18] = slot;
    buffer[22] = 1; // Bypass

    await this.sendFullBuffer(slotInfo.type, slot, buffer);
  }

  getEffectModel(slot: number): ModelDef | null {
    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo) return null;

    const modelId = (slotInfo.buffer[16] << 8) | slotInfo.buffer[17];
    if (modelId === 0) return null;

    return Object.values(EFFECT_MODELS).find(m => m.id === modelId) || null;
  }

  getEffectModelId(slot: number): number {
    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo) return 0;
    return (slotInfo.buffer[16] << 8) | slotInfo.buffer[17];
  }

  async setEffectKnob(slot: number, knobName: string, value: number): Promise<void> {
    const model = this.getEffectModel(slot);
    if (!model) throw new Error(`No effect in slot ${slot}`);

    const knobIndex = model.knobs.indexOf(knobName);
    if (knobIndex === -1) throw new Error(`Unknown knob: ${knobName}`);

    await this.setParameter(model.type, slot, 32 + knobIndex, value);
  }

  getEffectKnob(slot: number, knobName: string): number {
    const model = this.getEffectModel(slot);
    if (!model) throw new Error(`No effect in slot ${slot}`);

    const knobIndex = model.knobs.indexOf(knobName);
    if (knobIndex === -1) throw new Error(`Unknown knob: ${knobName}`);

    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo) throw new Error(`Invalid slot: ${slot}`);

    return slotInfo.buffer[32 + knobIndex];
  }

  getEffectKnobs(slot: number): Record<string, number> {
    const model = this.getEffectModel(slot);
    if (!model) return {};

    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo) return {};

    const knobs: Record<string, number> = {};
    model.knobs.forEach((name, index) => {
      if (name) knobs[name] = slotInfo.buffer[32 + index];
    });
    return knobs;
  }

  getEffectSettings(slot: number): EffectSettings | null {
    const model = this.getEffectModel(slot);
    if (!model) return null;

    return {
      slot,
      type: model.type,
      model: model.name,
      modelId: model.id,
      enabled: this.effectEnabled[slot],
      knobs: this.getEffectKnobs(slot),
    };
  }

  // ==========================================
  // CABINET CONTROL
  // ==========================================

  async setCabinetById(id: number): Promise<void> {
    const cabinet = CABINET_MODELS.find(c => c.id === id);
    if (!cabinet) {
      throw new Error(`Unknown cabinet ID: 0x${id.toString(16).padStart(2, '0')}`);
    }

    const buffer = this.state[DspType.AMP];
    buffer[49] = id;

    await this.sendFullBuffer(DspType.AMP, 0, buffer);
    this.emit('cabinet-changed', cabinet.name);
  }

  async setCabinet(name: string): Promise<void> {
    const cabinet = CABINET_MODELS.find(c => c.name === name);
    if (!cabinet) {
      const available = CABINET_MODELS.map(c => c.name).join(', ');
      throw new Error(`Unknown cabinet: "${name}". Available: ${available}`);
    }
    await this.setCabinetById(cabinet.id);
  }

  getCabinet(): { id: number; name: string } | null {
    const id = this.state[DspType.AMP][49];
    return CABINET_MODELS.find(c => c.id === id) || null;
  }

  getCabinetId(): number {
    return this.state[DspType.AMP][49];
  }

  // ==========================================
  // LOWER-LEVEL METHODS (Buffer-First)
  // ==========================================

  async sendFullBuffer(type: DspType, slot: number, buffer: Uint8Array) {
    // 1. Optimistic Update (UI updates instantly)
    if (type === DspType.STOMP && slot < 4) {
      this.state.stomps[slot].set(buffer);
    } else if ((this.state as any)[type]) {
      (this.state as any)[type].set(buffer);
    }

    // 2. Sync Bypass Tracker (Byte 22)
    if (type !== DspType.AMP) {
      this.effectEnabled[slot] = buffer[22] === 0;
    }

    // 3. Send packet using protocol layer
    await this.protocol.sendPacket(buffer);

    // 4. Send apply packet
    const applyPacket = this.protocol.createApplyPacket(type);
    await this.protocol.sendPacket(applyPacket);

    this.emit('state-changed');
  }

  async setParameter(type: DspType, slot: number, byteIndex: number, value: number) {
    let buffer: Uint8Array;
    if (type === DspType.STOMP) {
      buffer = this.state.stomps[slot];
    } else {
      buffer = this.state[type];
    }

    buffer[byteIndex] = value;
    await this.sendFullBuffer(type, slot, buffer);
  }

  async setEffectEnabled(slot: number, enabled: boolean) {
    const packet = this.protocol.createBypassPacket(slot, enabled);
    await this.protocol.sendPacket(packet);
    // We rely on the hardware echo (0x19 0xc3) to update our local tracker
  }
}
