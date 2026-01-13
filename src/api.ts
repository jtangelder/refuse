/**
 * Fender Mustang WebHID API - Main API
 * High-level interface for preset and effect management
 */

import { DspType, AmpParam, AMP_MODELS, STOMP_MODELS, MOD_MODELS, DELAY_MODELS, REVERB_MODELS, findModelById } from "./constants";
import type { AmpState, EffectState, Preset, UpdateEvent } from "./types";
import { getAmpDefaults, getEffectDefaults } from "./defaults";
import { HIDProtocol } from "./protocol";

/**
 * Main API for controlling Fender Mustang amplifiers
 */
export class FuseAPI {
  private protocol: HIDProtocol;
  private cache: Map<DspType, Uint8Array> = new Map();
  private effectEnabled: boolean[] = new Array(8).fill(true);

  public presets: string[] = new Array(100).fill("");
  public activePresetSlot: number = 0;

  constructor() {
    this.protocol = new HIDProtocol();
  }

  get isConnected(): boolean {
    return this.protocol.isConnected;
  }

  // ==========================================
  // Connection Management
  // ==========================================

  async connect(): Promise<boolean> {
    const result = await this.protocol.connect();
    if (result) {
      await this.refreshState();
    }
    return result;
  }

  async disconnect(): Promise<void> {
    await this.protocol.disconnect();
  }

  // ==========================================
  // Preset Management
  // ==========================================

  /**
   * Get the current preset state
   */
  getPreset(): Preset | null {
    if (this.cache.size < 5) return null;

    const ampState = this.parseAmpState();
    const effectsChain = this.parseEffectsChain();

    return {
      slot: this.activePresetSlot,
      name: this.presets[this.activePresetSlot] || "Unknown",
      amp: ampState,
      effects: effectsChain,
    };
  }

  /**
   * Get list of all preset names
   */
  getPresetList(): string[] {
    return [...this.presets];
  }

  /**
   * Switch to a specific preset slot
   */
  async setPreset(slot: number): Promise<void> {
    if (slot < 0 || slot > 99) throw new Error("Invalid Slot");

    const buf = new Uint8Array(64);
    buf[0] = 0x1c;
    buf[1] = 0x01;
    buf[2] = 0x01; // Patch Change
    buf[4] = slot;
    buf[6] = 0x01; // Execute

    await this.protocol.send(buf);
    this.activePresetSlot = slot;
    await this.refreshState(true);
  }

  // ==========================================
  // Amp Parameter Control
  // ==========================================

  async setAmpModel(modelId: number): Promise<void> {
    const defaults = getAmpDefaults(modelId);
    await this.protocol.sendDspConfig(DspType.AMP, modelId, defaults);
    await this.protocol.sendApply();
  }

  async setAmpParameter(param: AmpParam, value: number): Promise<void> {
    await this.updateByte(DspType.AMP, param, value);
  }

  async setCabinet(cabId: number): Promise<void> {
    await this.updateByte(DspType.AMP, AmpParam.CABINET, cabId);
  }

  async setBright(on: boolean): Promise<void> {
    await this.updateByte(DspType.AMP, AmpParam.BRIGHT, on ? 1 : 0);
  }

  async setSag(value: number): Promise<void> {
    await this.updateByte(DspType.AMP, AmpParam.SAG, Math.min(value, 2));
  }

  async setNoiseGate(value: number): Promise<void> {
    await this.updateByte(DspType.AMP, AmpParam.NOISE_GATE, Math.min(value, 5));
  }

  async setGateThreshold(value: number): Promise<void> {
    await this.updateByte(DspType.AMP, AmpParam.THRESHOLD, Math.min(value, 9));
  }

  // ==========================================
  // Effect Chain Management
  // ==========================================

  async setEffect(slot: number, modelId: number): Promise<void> {
    if (slot < 0 || slot > 7) throw new Error("Slot 0-7");
    const meta = findModelById(modelId);
    if (!meta) throw new Error(`Unknown Effect ID ${modelId}`);

    const defaults = getEffectDefaults(meta.type, modelId);
    defaults[18] = slot;
    await this.protocol.sendDspConfig(meta.type, modelId, defaults);
    await this.protocol.sendApply();
    this.effectEnabled[slot] = true;
  }

  async setEffectKnob(slot: number, knobIndex: number, value: number): Promise<void> {
    const preset = this.getPreset();
    const effect = preset?.effects[slot];
    if (!effect) return;

    await this.updateByte(effect.type, 32 + knobIndex, value);
  }

  async setEffectEnabled(slot: number, enabled: boolean): Promise<void> {
    const preset = this.getPreset();
    const effect = preset?.effects[slot];
    if (!effect) return;

    // Map DSP Type to Bypass Family ID
    const family = effect.type - 3;
    const status = enabled ? 0x00 : 0x01;

    const buf = new Uint8Array(64);
    buf.set([0x19, 0xc3, family, status, slot]);
    await this.protocol.send(buf);

    this.effectEnabled[slot] = enabled;
    setTimeout(() => this.refreshState(true), 150);
  }

  async removeEffect(slot: number): Promise<void> {
    const preset = this.getPreset();
    const effect = preset?.effects[slot];
    if (effect) {
      const empty = new Uint8Array(64);
      empty.fill(0);
      empty[0] = 0x1c;
      empty[1] = 0x03;
      empty[2] = effect.type;
      empty[18] = slot;

      this.cache.set(effect.type, empty);
      await this.protocol.send(empty);
      await this.protocol.sendApply();
      this.effectEnabled[slot] = false;
    }
  }

  // ==========================================
  // Hardware Monitoring
  // ==========================================

  /**
   * Monitor hardware changes (knobs, switches, preset selection)
   */
  monitorHardwareChanges(onUpdate?: (event: UpdateEvent) => void): void {
    this.protocol.onHIDInput((data) => {
      this.handleHIDInput(data, onUpdate);
    });
  }

  // ==========================================
  // Internal State Management
  // ==========================================

  /**
   * Refresh state from hardware
   */
  async refreshState(fastMode = false): Promise<void> {
    await this.protocol.send(new Uint8Array([0xff, 0xc1]));

    const required = new Set([
      DspType.AMP,
      DspType.STOMP,
      DspType.MOD,
      DspType.DELAY,
      DspType.REVERB,
    ]);

    let silenceCount = 0;
    const maxReads = fastMode ? 50 : 150;

    if (!fastMode) {
      this.effectEnabled.fill(true);
    }

    for (let i = 0; i < maxReads; i++) {
      const data = await this.protocol.read(50);
      if (data.byteLength < 64) {
        silenceCount++;
        if (silenceCount > 5 && required.size === 0) break;
        continue;
      }
      silenceCount = 0;

      this.processPacket(data);

      const b2 = new DataView(data.buffer).getUint8(2);
      const type = b2 as DspType;
      if (required.has(type)) {
        required.delete(type);
      }
    }
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private async updateByte(type: DspType, offset: number, value: number): Promise<void> {
    let buf = this.cache.get(type);
    if (!buf) {
      await this.refreshState();
      buf = this.cache.get(type);
    }
    if (!buf) return;

    buf[offset] = value;
    const modelId = (buf[16] << 8) | buf[17];
    const slot = buf[18];
    await this.protocol.sendDspConfig(type, modelId, buf, slot);
    await this.protocol.sendApply();
  }

  private parseAmpState(): AmpState {
    const raw = this.cache.get(DspType.AMP)!;
    const view = new DataView(raw.buffer);
    const modelId = view.getUint16(16);
    const meta = findModelById(modelId);

    return {
      modelId,
      name: meta?.name || "Unknown Amp",
      knobs: Array.from(raw.slice(32, 42)),
      bias: raw[AmpParam.BIAS],
      noiseGate: raw[AmpParam.NOISE_GATE],
      threshold: raw[AmpParam.THRESHOLD],
      cabinetId: raw[AmpParam.CABINET],
      sag: raw[AmpParam.SAG],
      bright: raw[AmpParam.BRIGHT] === 0x01,
    };
  }

  private parseEffectsChain(): (EffectState | null)[] {
    const chain: (EffectState | null)[] = new Array(8).fill(null);

    [DspType.STOMP, DspType.MOD, DspType.DELAY, DspType.REVERB].forEach((type) => {
      const raw = this.cache.get(type);
      if (!raw) return;

      const view = new DataView(raw.buffer);
      const modelId = view.getUint16(16);
      const slotIndex = raw[18];

      if (modelId !== 0 && slotIndex >= 0 && slotIndex < 8) {
        const meta = findModelById(modelId);
        chain[slotIndex] = {
          slot: slotIndex,
          modelId,
          name: meta?.name || "Unknown Effect",
          type,
          enabled: this.effectEnabled[slotIndex],
          knobs: Array.from(raw.slice(32, 39)),
        };
      }
    });

    return chain;
  }

  private processPacket(data: DataView): void {
    const b0 = data.getUint8(0);
    const b1 = data.getUint8(1);
    const b2 = data.getUint8(2);

    if (b0 === 0x1c && b1 === 0x01) {
      // Preset Names
      if (b2 === 0x04) {
        const cat = data.getUint8(3);
        if (cat === 0x00) {
          const slot = data.getUint8(4);
          let name = "";
          for (let k = 16; k < 48; k++) {
            const c = data.getUint8(k);
            if (c === 0) break;
            name += String.fromCharCode(c);
          }
          this.presets[slot] = name;
          this.activePresetSlot = slot;
        }
      }
      // DSP Data
      else if (b2 >= 0x05 && b2 <= 0x09) {
        const type = b2 as DspType;
        this.cache.set(type, new Uint8Array(data.buffer));
      }
    }
  }

  private handleHIDInput(data: Uint8Array, onUpdate?: (event: UpdateEvent) => void): void {
    const b0 = data[0];
    const b1 = data[1];
    const b2 = data[2];

    // Knob/Parameter Updates
    if (b1 === 0x01 && b2 === 0x02) {
      const dspType = b0 as DspType;
      let cache = this.cache.get(dspType);

      if (cache) {
        if (dspType === DspType.AMP) {
          for (let i = 0; i < 15; i++) {
            cache[32 + i] = data[16 + i];
          }
        } else {
          for (let i = 0; i < 7; i++) {
            cache[32 + i] = data[16 + i];
          }
        }
        this.cache.set(dspType, cache);
      } else {
        this.cache.set(dspType, data);
      }

      if (onUpdate) onUpdate({ type: "knob", detail: dspType });
    }
    // Preset Selection
    else if (b0 === 0x1c && b1 === 0x01 && b2 === 0x01) {
      const newSlot = data[4];
      if (newSlot !== this.activePresetSlot) {
        this.activePresetSlot = newSlot;
        this.refreshState(true);
        if (onUpdate) onUpdate({ type: "preset", detail: newSlot });
      }
    }
    // Bypass/Footswitch
    else if (b0 === 0x19 && b1 === 0xc3) {
      const status = data[3];
      const slot = data[4];
      this.effectEnabled[slot] = status === 0x00;
      if (onUpdate) onUpdate({ type: "bypass", detail: { slot, enabled: status === 0x00 } });
    }
    // Preset Name
    else if (b0 === 0x1c && b1 === 0x04) {
      const slot = data[4];
      let name = "";
      for (let i = 16; i < 48; i++) {
        if (data[i] === 0) break;
        name += String.fromCharCode(data[i]);
      }
      this.presets[slot] = name;
      if (onUpdate) onUpdate({ type: "name", detail: { slot, name } });
    }
  }
}
