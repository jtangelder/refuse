import { MustangProtocol, OPCODES } from './protocol';
import type { ModelDef } from './models';
import {
  DspType,
  AMP_MODELS,
  EFFECT_MODELS,
  CABINET_MODELS,
} from './models';
import { getModelDefault } from './defaults';

// --- TYPE DEFINITIONS ---

// Re-export types
export type { ModelDef } from './models';

// Re-export values (enums, constants, objects)
export { DspType, AMP_MODELS, EFFECT_MODELS, CABINET_MODELS, FENDER_VID } from './models';

export interface PresetMetadata {
  slot: number;
  name: string;
}

export interface KnobInfo {
  name: string;
  value: number;
  index: number;
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
  knobs: KnobInfo[];
}

export interface EffectSettings {
  slot: number;
  type: DspType;
  model: string;
  modelId: number;
  enabled: boolean;
  knobs: KnobInfo[];
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
  'amp-changed': (modelId: number, knobs: KnobInfo[]) => void;
  'effect-changed': (slot: number, modelId: number, knobs: KnobInfo[]) => void;
  'bypass-toggled': (slot: number, enabled: boolean) => void;
  'knob-changed': (type: 'amp' | 'effect', slot: number, knobName: string, value: number) => void;
  'cabinet-changed': (cabinetId: number) => void;
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
    console.debug(`[EVENT] ${String(event)}:`, ...args);
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
  /**
   * SINGLE SOURCE OF TRUTH (Reactive State)
   * UI components should read directly from here.
   * Hardware changes write directly to here.
   */
  public state = {
    [DspType.AMP]: new Uint8Array(64),
    // All effect slots 0-7, can contain any DspType
    slots: Array.from({ length: 8 }, () => new Uint8Array(64)),
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

  private isRefreshing = false;

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
    console.debug('[API CALL] connect()');
    const connected = await this.protocol.connect();
    if (!connected) {
      console.debug('[API] Connection failed');
      return false;
    }

    console.debug('[API] Connected. Initiating state sync...');
    // Automatically start monitoring and sync state
    this.startMonitoring();
    await this.refreshState();
    await this.refreshBypassStates();

    this.emit('connected');
    return true;
  }

  async disconnect(): Promise<void> {
    console.debug('[API CALL] disconnect()');
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

      // console.debug('HID Input:', data); // Already logged in protocol layer

      // 1. LIVE KNOB CHANGES (Physical knob turned on amp)
      // Format: [DSP_TYPE] ... where DSP_TYPE is 0x05-0x09
      // byte[0] itself IS the DSP type for live hardware changes
      if (b0 >= DspType.AMP && b0 <= DspType.REVERB) {
        const type = data[0] as DspType;  // byte[0] is the DSP type
        const slot = data[13] || 0;

        // Update the correct buffer in 'this.state'
        const paramIndex = data[5];
        const paramValue = data[10];
        
        if (type === DspType.AMP) {
          this.state[DspType.AMP][32 + paramIndex] = paramValue;
          const modelId = this.getAmpModelId();
          const knobs = this.getAmpKnobs();
          this.emit('amp-changed', modelId, knobs);
        } else {
          // Hardware changes for effects use slot mapping
          if (slot >= 0 && slot < 8) {
            this.state.slots[slot][32 + paramIndex] = paramValue;
            const modelId = this.getEffectModelId(slot);
            const knobs = this.getEffectKnobs(slot);
            this.emit('effect-changed', slot, modelId, knobs);
          }
        }

        this.emit('state-changed');
      }

      // 2. DATA UPDATES (Software changes & state dumps)
      // 0x1c 0x03 (Param Change) OR 0x1c 0x01 (Preset Load/State Response)
      else if (b0 === OPCODES.DATA_PACKET && (b1 === OPCODES.DATA_WRITE || b1 === OPCODES.DATA_READ)) {
        const type = data[2];
        const slot = data[18];

        // 2a. Handle preset name/selection packets
        // type 0x04 = Preset Info (software triggered or knob turn)
        // type 0x00 = Mandatory Header / "Apply" Echo if b1=0x03, 
        //             OR Hardware Preset Change if b1=0x01.
        if (type === OPCODES.PRESET_INFO || type === 0x00) {
          const presetInfo = MustangProtocol.parsePresetName(data);
          if (presetInfo) {
            const { slot: presetSlot, name } = presetInfo;
            const changed = this.currentPresetSlot !== presetSlot;
            
            this.currentPresetSlot = presetSlot;

            // FIX: Only update name if it's non-empty, OR if it's an explicit Name packet (Type 0x04)
            // If it's Type 0x00 (generic), it might have an empty name which we should ignore.
            // ADDED FIX: Also ensure byte 3 is 0x00. Non-zero values (0x01/0x02) indicate Effect Presets (Mod/Delay knobs)
            // which should NOT be added to the main preset list.
            if ((type === OPCODES.PRESET_INFO || name.length > 0) && data[3] === 0x00) {
              this.presets.set(presetSlot, { slot: presetSlot, name });
              this.emit('preset-loaded', presetSlot, name);
            }

            // STABILITY FIX: ONLY refresh if this is a READ (0x01) packet from the hardware knob,
            // and we aren't already in a refresh cycle.
            // This prevents "Apply" echos (b1=0x03) from triggering infinite refresh loops.
            if (type === 0x00 && b1 === OPCODES.DATA_READ && changed && !this.isRefreshing) {
              console.debug(`Hardware Preset Change to ${presetSlot} detected via Read Packet. Refreshing...`);
              this.isRefreshing = true;
              this.refreshState()
                .then(() => this.refreshBypassStates())
                .finally(() => {
                  this.isRefreshing = false;
                  this.emit('state-changed');
                });
            }
            this.emit('state-changed');
          }
          
          if (type === 0x00) return; // Never route Type 0x00 to effect slots (Protects Slot 0)
        }

        // 2b. Handle DSP/Effect Data
        // Valid effect types only: 0x06 (STOMP) to 0x09 (REVERB)
        const isValidEffectType = type >= DspType.STOMP && type <= DspType.REVERB;
        if (type === DspType.AMP) {
          this.state[DspType.AMP].set(data);
        } else if (isValidEffectType && slot >= 0 && slot < 8) {
          // ENSURE SINGLETON (Move existing if duplicate type)
          for (let i = 0; i < 8; i++) {
            if (i !== slot && this.state.slots[i][2] === type) {
              this.state.slots[i].fill(0);
              this.effectEnabled[i] = true;
            }
          }
          this.state.slots[slot].set(data);
        }

        // Update the correct buffer in 'this.state' (Already handled in 2b above)

        // NOTE: We no longer update effectEnabled from Byte 22 here,
        // as the amplifier sends inconsistent values in 0x1c packets
        // after toggles. We trust the 0x19 response instead.

        // Emit appropriate event (only for 0x03 param changes, not state dumps)
        if (b1 === OPCODES.DATA_WRITE && type !== OPCODES.PRESET_INFO) {
          if (type === DspType.AMP) {
            const modelId = this.getAmpModelId();
            const knobs = this.getAmpKnobs();
            this.emit('amp-changed', modelId, knobs);
          } else {
            const modelId = this.getEffectModelId(slot);
            const knobs = this.getEffectKnobs(slot);
            this.emit('effect-changed', slot, modelId, knobs);
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
          // Sync Byte 22 in the buffer so future knob changes don't re-activate it
          if (slot >= 0 && slot < 8) {
            this.state.slots[slot][22] = enabled ? 0 : 1;
          }
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
    console.debug('[API] Requesting full state dump...');
    await this.protocol.requestState();
  }

  /**
   * PRIVATE: Request Bypass Flags (On/Off lights).
   * Called automatically by connect() - you don't need to call it manually.
   */
  private async refreshBypassStates(): Promise<void> {
    console.debug('[API] Requesting bypass states...');
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
    console.debug(`[API CALL] savePreset(slot: ${slot}, name: "${name}")`);
    const packet = this.protocol.createPresetSavePacket(slot, name);
    await this.protocol.sendPacket(packet);

    // Update cache
    this.currentPresetSlot = slot;
    this.presets.set(slot, { slot, name });
  }

  async loadPreset(slot: number): Promise<void> {
    console.debug(`[API CALL] loadPreset(slot: ${slot})`);
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
    console.debug(`[API CALL] setAmpModelById(modelId: 0x${modelId.toString(16)})`);
    const model = Object.values(AMP_MODELS).find(m => m.id === modelId);
    if (!model) throw new Error(`Unknown amp model ID: 0x${modelId.toString(16).padStart(4, '0')}`);

    let buffer = getModelDefault(modelId);
    if (!buffer) {
      // Fallback: Use existing buffer but change ID
      buffer = new Uint8Array(this.state[DspType.AMP]);
      buffer[16] = (modelId >> 8) & 0xff;
      buffer[17] = modelId & 0xff;
    }

    await this.sendFullBuffer(DspType.AMP, 0, buffer);
  }

  getAmpModel(): ModelDef | null {
    const modelId = this.getAmpModelId();
    return Object.values(AMP_MODELS).find(m => m.id === modelId) || null;
  }

  getAmpModelId(): number {
    const buffer = this.state[DspType.AMP];
    return (buffer[16] << 8) | buffer[17];
  }

  async setAmpKnob(index: number, value: number): Promise<void> {
    console.debug(`[API CALL] setAmpKnob(index: ${index}, value: ${value})`);
    await this.setParameter(DspType.AMP, 0, 32 + index, value);
  }

  getAmpKnobs(): KnobInfo[] {
    const model = this.getAmpModel();
    if (!model) return [];

    const knobs: KnobInfo[] = [];
    model.knobs.forEach((name, index) => {
      if (name) {
        knobs.push({
          name,
          value: this.state[DspType.AMP][32 + index],
          index
        });
      }
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
      knobs: this.getAmpKnobs()
    };
  }

  // ==========================================
  // HIGH-LEVEL EFFECT CONTROL
  // ==========================================

  private getBufferForSlot(slot: number): { buffer: Uint8Array; type: DspType } | null {
    if (slot < 0 || slot > 7) return null;
    const buffer = this.state.slots[slot];
    const type = buffer[2] as DspType;
    return { buffer, type };
  }

  async setEffectById(slot: number, modelId: number): Promise<void> {
    console.debug(`[API CALL] setEffectById(slot: ${slot}, modelId: 0x${modelId.toString(16)})`);
    const model = Object.values(EFFECT_MODELS).find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Unknown effect model ID: 0x${modelId.toString(16).padStart(4, '0')}`);
    }

    if (slot < 0 || slot > 7) throw new Error(`Invalid slot: ${slot}`);

    // HARDWARE LIMIT: Only one effect of each type allowed in the chain
    for (let i = 0; i < 8; i++) {
      if (i === slot) continue; // Skip the slot we're currently setting
      const otherModel = this.getEffectModel(i);
      if (otherModel && otherModel.type === model.type) {
        throw new Error(`Effect of type ${DspType[model.type]} already exists in slot ${i}`);
      }
    }

    const buffer = getModelDefault(modelId) || new Uint8Array(64);
    buffer[2] = model.type;
    buffer[16] = (modelId >> 8) & 0xff;
    buffer[17] = modelId & 0xff;
    buffer[18] = slot;
    this.effectEnabled[slot] = true; // Enable by default
    buffer[22] = 0; 
    
    await this.sendFullBuffer(model.type, slot, buffer);
  }

  async setEffectEnabled(slot: number, enabled: boolean) {
    console.debug(`[API CALL] setEffectEnabled(slot: ${slot}, enabled: ${enabled})`);
    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo) return;
    
    // Update local state and buffer immediately
    this.effectEnabled[slot] = enabled;
    slotInfo.buffer[22] = enabled ? 0 : 1;
    
    const packet = this.protocol.createBypassPacket(slot, enabled, slotInfo.type);
    await this.protocol.sendPacket(packet);
    this.emit('state-changed');
  }

  async swapEffects(slotA: number, slotB: number): Promise<void> {
    console.debug(`[API CALL] swapEffects(slotA: ${slotA}, slotB: ${slotB})`);
    if (slotA === slotB) return;
    if (slotA < 0 || slotA > 7 || slotB < 0 || slotB > 7) {
      throw new Error("Invalid slot indices for swap");
    }

    // 1. Clone buffers/states to preserve settings
    const bufA = new Uint8Array(this.state.slots[slotA]);
    const bufB = new Uint8Array(this.state.slots[slotB]);
    const enabledA = this.effectEnabled[slotA];
    const enabledB = this.effectEnabled[slotB];
    const typeA = bufA[2];
    const typeB = bufB[2];

    console.debug(`[API] Swapping effects: Slot ${slotA} (Type 0x${typeA.toString(16)}) <-> Slot ${slotB} (Type 0x${typeB.toString(16)})`);

    // 2. Clear both slots first (Safe handling to avoid singleton collisions)
    // We do this by sending "Empty" buffers to both.
    await this.clearEffect(slotA);
    await this.clearEffect(slotB);

    // 3. Prepare Buffer A for Slot B
    if (typeA !== 0) { // If A was not empty
      bufA[18] = slotB; // Update slot index
      bufA[22] = enabledA ? 0 : 1; // Sync bypass
      this.effectEnabled[slotB] = enabledA; // Swap enablement
      await this.sendFullBuffer(typeA, slotB, bufA);
    } else {
      // If A was empty, B ends up empty (already done by clear)
      this.effectEnabled[slotB] = true;
    }

    // 4. Prepare Buffer B for Slot A
    if (typeB !== 0) { // If B was not empty
      bufB[18] = slotA; // Update slot index
      bufB[22] = enabledB ? 0 : 1; // Sync bypass
      this.effectEnabled[slotA] = enabledB; // Swap enablement
      await this.sendFullBuffer(typeB, slotA, bufB);
    } else {
      // If B was empty, A ends up empty (already done by clear)
      this.effectEnabled[slotA] = true;
    }
  }

  async clearEffect(slot: number): Promise<void> {
    console.debug(`[API CALL] clearEffect(slot: ${slot})`);
    if (slot < 0 || slot > 7) throw new Error(`Invalid slot: ${slot}`);
    let currentType = this.state.slots[slot][2];
    
    // If type is 0 (already empty), defaulting to STOMP (0x06) is usually safe for clearing
    if (currentType === 0) currentType = DspType.STOMP;

    const buffer = new Uint8Array(64);
    buffer[18] = slot;
    buffer[22] = 1; // Bypass
    this.effectEnabled[slot] = false;

    await this.sendFullBuffer(currentType, slot, buffer);
    // Explicitly zero out the local buffer type after send
    this.state.slots[slot][2] = 0;
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

  async setEffectKnob(slot: number, index: number, value: number): Promise<void> {
    console.debug(`[API CALL] setEffectKnob(slot: ${slot}, index: ${index}, value: ${value})`);
    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo || (slotInfo.type as number) === 0) throw new Error(`No effect in slot ${slot}`);
    await this.setParameter(slotInfo.type, slot, 32 + index, value);
  }



  getEffectKnobs(slot: number): KnobInfo[] {
    const model = this.getEffectModel(slot);
    if (!model) return [];

    const slotInfo = this.getBufferForSlot(slot);
    if (!slotInfo) return [];

    const knobs: KnobInfo[] = [];
    model.knobs.forEach((name, index) => {
      if (name) {
        knobs.push({
          name,
          value: slotInfo.buffer[32 + index],
          index
        });
      }
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
    console.debug(`[API CALL] setCabinetById(id: 0x${id.toString(16)})`);
    const cabinet = CABINET_MODELS.find(c => c.id === id);
    if (!cabinet) {
      throw new Error(`Unknown cabinet ID: 0x${id.toString(16).padStart(2, '0')}`);
    }

    const buffer = this.state[DspType.AMP];
    buffer[49] = id;

    await this.sendFullBuffer(DspType.AMP, 0, buffer);
    this.emit('cabinet-changed', id);
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
    // 1. Ensure mandatory protocol headers are set
    // This is critical for new buffers (like from FuseLoader)
    buffer[0] = OPCODES.DATA_PACKET;
    buffer[1] = OPCODES.DATA_WRITE;
    buffer[2] = type;
    buffer[6] = this.protocol.getNextSequenceId();
    buffer[7] = 0x01;

    // 2. Optimistic Update (UI updates instantly)
    if (type === DspType.AMP) {
      this.state[DspType.AMP].set(buffer);
    } else if (slot >= 0 && slot < 8) {
      this.state.slots[slot].set(buffer);
    }

    // 3. Sync Bypass Tracker (Byte 22)
    // We ensure the buffer we're about to send matches our known bypass state.
    // This prevents "drift" where a knob change re-activates a bypassed effect.
    if (type !== DspType.AMP && slot >= 0 && slot < 8) {
      buffer[22] = this.effectEnabled[slot] ? 0 : 1;
    }

    // 4. Send packet using protocol layer
    await this.protocol.sendPacket(buffer);

    // 5. Send apply packet
    const applyPacket = this.protocol.createApplyPacket(type);
    await this.protocol.sendPacket(applyPacket);

    this.emit('state-changed');
  }

  async setParameter(type: DspType, slot: number, byteIndex: number, value: number) {
    console.debug(`[API CALL] setParameter(type: 0x${type.toString(16)}, slot: ${slot}, byteIndex: ${byteIndex}, value: ${value})`);
    let buffer: Uint8Array;
    if (type === DspType.AMP) {
      buffer = this.state[DspType.AMP];
    } else if (slot >= 0 && slot < 8) {
      buffer = this.state.slots[slot];
    } else {
      throw new Error(`Invalid parameter target: type ${type}, slot ${slot}`);
    }

    buffer[byteIndex] = value;
    await this.sendFullBuffer(type, slot, buffer);
  }


}
