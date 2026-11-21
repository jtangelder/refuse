import { debug } from '../helpers';
import { type IProtocol, type ProtocolEventListenerFn } from './protocol_interface';
import { ProtocolDecoder } from './protocol_decoder';
import {
  AMP_MODELS,
  DspType,
  EFFECT_MODELS,
  getClearEffectWireMeta,
  getEffectKnobSpec,
  getEffectWireMeta,
} from '../models';
import { getModelDefault } from '../defaults';
import { AMP_KNOB_INDEX, LIMITS, OFFSETS, OPCODES, clampRange } from './constants';

interface SavedDemoPreset {
  name: string;
  amp: Uint8Array | null;
  effects: Map<DspType, Uint8Array | null>;
}

const UTF8_DECODER = new TextDecoder('utf-8');

const DEMO_PRESET_NAMES: readonly string[] = [
  'American Clean',
  '57 Deluxe Twang',
  '59 Bassman Crunch',
  '65 Twin Shimmer',
  '65 Princeton Blues',
  'British 60s Chime',
  'British 70s Plexi',
  'British 80s Lead',
  'American 90s Recto',
  'Metal 2000 Chug',
  'Super-Sonic Burn',
  'Studio Jazz Clean',
  '57 Champ Garage',
  '60s Thrift Fuzz',
  'British Watts Arena',
  'Orange Colour Doom',
  'Rockabilly Slapback',
  'Ambient Cathedral',
  'Surf Spring 63',
  'Texas SRV Overdrive',
  '80s Chorus Clean',
  'Vibratone Rotary',
  'Reverse Psychedelia',
  'Pitch Harmony Lead',
];

/**
 * Mock protocol implementation for Demo Mode
 */
export class DemoProtocol implements IProtocol {
  private _isConnected = false;
  private listeners = new Set<ProtocolEventListenerFn>();
  private liveAmpPacket: Uint8Array | null = null;
  private liveEffectPackets = new Map<DspType, Uint8Array | null>();
  private savedPresets = new Map<number, SavedDemoPreset>();
  public onDisconnect?: () => void;

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public get isSupported(): boolean {
    return true; // Always supported
  }

  async connect(): Promise<boolean> {
    debug('[Demo] Connect requested');
    this._isConnected = true;
    return true;
  }

  async disconnect(): Promise<void> {
    debug('[Demo] Disconnect requested');
    this._isConnected = false;
  }

  getNextSequenceId(): number {
    return 0;
  }

  addEventListener(callback: ProtocolEventListenerFn): void {
    this.listeners.add(callback);
  }

  removeEventListener(callback: ProtocolEventListenerFn): void {
    this.listeners.delete(callback);
  }

  async sendPacket(data: Uint8Array): Promise<void> {
    if (!this._isConnected) throw new Error('Not connected');

    const command = ProtocolDecoder.decode(data);
    debug(`[Demo] Received packet: ${command.type}`);

    // Simulate response delay
    await new Promise(resolve => setTimeout(resolve, 0));

    // Handle Request State (0xff 0xc1) — mirrors real Mustang firmware dump order:
    // 1. All preset name pairs (0x1c 0x01 0x04 + 0x1c 0x01 0x00 ACK)
    // 2. Active preset state (0x1c 0x01 0x04 + AMP + 4x FX + 0x1c 0x01 0x00 ACK)
    // 3. End-of-dump ACK (0xff 0x01)
    if (data[0] === 0xff && data[1] === 0xc1) {
      this.emitDemoPresetNames();
      const savedZero = this.savedPresets.get(0);
      if (savedZero) {
        this.emitSavedPreset(0, savedZero);
      } else {
        this.generateRandomConfiguration(0, DEMO_PRESET_NAMES[0]);
      }
      this.emitDumpComplete();
      return;
    }

    // Handle Request Bypass States (0x19 0x00)
    if (data[0] === 0x19 && data[1] === 0x00) {
      for (let slot = 0; slot < 8; slot++) {
        let bypassByte = 0x00;
        for (const pkt of this.liveEffectPackets.values()) {
          if (pkt && pkt[OFFSETS.SLOT_INDEX] === slot) {
            bypassByte = pkt[OFFSETS.BYPASS];
            break;
          }
        }
        const bp = new Uint8Array(64);
        bp[0] = 0x19;
        bp[1] = 0xc3;
        bp[3] = bypassByte;
        bp[4] = slot;
        this.emit(bp);
      }
      return;
    }

    // Track DSP Write (0x1c 0x03 <type>)
    if (data[0] === OPCODES.DATA_PACKET && data[1] === OPCODES.DATA_WRITE) {
      const type = data[OFFSETS.TYPE];
      if (type === DspType.AMP) {
        const snapshot = new Uint8Array(data);
        snapshot[1] = OPCODES.DATA_READ;
        this.liveAmpPacket = snapshot;
      } else if (type >= DspType.STOMP && type <= DspType.REVERB) {
        const modelId = (data[OFFSETS.MODEL_ID_MSB] << 8) | data[OFFSETS.MODEL_ID_LSB];
        if (modelId === 0) {
          this.liveEffectPackets.set(type, null);
        } else {
          const snapshot = new Uint8Array(data);
          snapshot[1] = OPCODES.DATA_READ;
          this.liveEffectPackets.set(type, snapshot);
        }
      }
      return;
    }

    // Track Bypass Set (0x19 0xc3)
    if (data[0] === OPCODES.BYPASS_PACKET && data[1] === OPCODES.BYPASS_SET) {
      const bypassByte = data[3];
      const slot = data[4];
      for (const pkt of this.liveEffectPackets.values()) {
        if (pkt && pkt[OFFSETS.SLOT_INDEX] === slot) {
          pkt[OFFSETS.BYPASS] = bypassByte;
        }
      }
      return;
    }

    // Handle Save Preset (0x1c 0x01 0x03 .. [slot @ byte 4])
    if (data[0] === 0x1c && data[1] === 0x01 && data[2] === 0x03) {
      const slot = data[OFFSETS.PRESET_SLOT];
      const rawName = data.slice(OFFSETS.PRESET_NAME, OFFSETS.PRESET_NAME + 32);
      const nullIdx = rawName.indexOf(0);
      const name = UTF8_DECODER.decode(nullIdx !== -1 ? rawName.slice(0, nullIdx) : rawName);

      const effectsCopy = new Map<DspType, Uint8Array | null>();
      for (const [type, pkt] of this.liveEffectPackets.entries()) {
        effectsCopy.set(type, pkt ? new Uint8Array(pkt) : null);
      }

      this.savedPresets.set(slot, {
        name: name || (DEMO_PRESET_NAMES[slot] ?? `Demo Preset ${slot + 1}`),
        amp: this.liveAmpPacket ? new Uint8Array(this.liveAmpPacket) : null,
        effects: effectsCopy,
      });
      return;
    }

    // Handle Load Preset (0x1c 0x01 0x01 .. [slot @ byte 4])
    if (data[0] === 0x1c && data[1] === 0x01 && data[2] === 0x01) {
      const slot = data[OFFSETS.PRESET_SLOT];
      const saved = this.savedPresets.get(slot);
      if (saved) {
        this.emitSavedPreset(slot, saved);
      } else {
        this.generateRandomConfiguration(slot, DEMO_PRESET_NAMES[slot] ?? `Demo Preset ${slot + 1}`);
      }
      return;
    }
  }

  private emitPresetInfoPacket(slot: number, name: string) {
    const infoPacket = new Uint8Array(64);
    infoPacket[0] = 0x1c;
    infoPacket[1] = 0x01;
    infoPacket[2] = 0x04; // PRESET_INFO
    infoPacket[3] = 0x00;
    infoPacket[OFFSETS.PRESET_SLOT] = slot;
    infoPacket.set(new TextEncoder().encode(name).slice(0, 32), OFFSETS.PRESET_NAME);
    this.emit(infoPacket);
  }

  private emitPresetAckPacket(slot: number) {
    const ackPacket = new Uint8Array(64);
    ackPacket[0] = 0x1c;
    ackPacket[1] = 0x01;
    ackPacket[2] = 0x00; // Empty-name confirmation ACK
    ackPacket[3] = 0x00;
    ackPacket[OFFSETS.PRESET_SLOT] = slot;
    this.emit(ackPacket);
  }

  private emitDumpComplete() {
    const donePacket = new Uint8Array(64);
    donePacket[0] = OPCODES.DUMP_COMPLETE;
    donePacket[1] = OPCODES.DUMP_COMPLETE_BYTE2;
    this.emit(donePacket);
  }

  private emitSavedPreset(slot: number, saved: SavedDemoPreset) {
    this.emitPresetInfoPacket(slot, saved.name);

    if (saved.amp) {
      const ampCopy = new Uint8Array(saved.amp);
      ampCopy[OFFSETS.PRESET_SLOT] = slot;
      this.liveAmpPacket = new Uint8Array(ampCopy);
      this.emit(ampCopy);
    }

    const allTypes = [DspType.STOMP, DspType.MOD, DspType.DELAY, DspType.REVERB];
    for (const type of allTypes) {
      const fx = saved.effects.get(type) ?? null;
      if (fx) {
        const fxCopy = new Uint8Array(fx);
        this.liveEffectPackets.set(type, new Uint8Array(fxCopy));
        this.emit(fxCopy);
      } else {
        this.liveEffectPackets.set(type, null);
        const emptyFxPacket = new Uint8Array(64);
        emptyFxPacket[0] = 0x1c;
        emptyFxPacket[1] = 0x01;
        emptyFxPacket[2] = type;
        emptyFxPacket[3] = 0x00;
        const [m0, m1, m2] = getClearEffectWireMeta(type);
        emptyFxPacket[OFFSETS.EFFECT_META_0] = m0;
        emptyFxPacket[OFFSETS.EFFECT_META_1] = m1;
        emptyFxPacket[OFFSETS.EFFECT_META_2] = m2;
        emptyFxPacket[OFFSETS.BYPASS] = 0x01;
        this.emit(emptyFxPacket);
      }
    }

    this.emitPresetAckPacket(slot);
  }

  private emitDemoPresetNames() {
    const maxSlot = Math.max(
      DEMO_PRESET_NAMES.length - 1,
      ...Array.from(this.savedPresets.keys()),
    );
    for (let slot = 0; slot <= maxSlot; slot++) {
      const presetName = this.savedPresets.get(slot)?.name ?? DEMO_PRESET_NAMES[slot];
      if (!presetName) continue;
      this.emitPresetInfoPacket(slot, presetName);
      this.emitPresetAckPacket(slot);
    }
  }

  private generateRandomConfiguration(slot = 0, name = 'Random Demo') {
    // 1. Emit active preset header (0x1c 0x01 0x04)
    this.emitPresetInfoPacket(slot, name);

    // 2. Select Random Amp (seeded from captured defaults so amp metadata bytes stay valid)
    const amps = Object.values(AMP_MODELS);
    const randomAmp = amps[Math.floor(Math.random() * amps.length)];
    const defaults = getModelDefault(randomAmp.id);
    const defaultCabId = defaults ? defaults[OFFSETS.CABINET_ID] : 0x01;

    debug(`[Demo] Random Amp: ${randomAmp.name}`);

    const ampPacket = defaults ? new Uint8Array(defaults) : new Uint8Array(64);
    ampPacket[0] = 0x1c;
    ampPacket[1] = 0x01;
    ampPacket[2] = DspType.AMP; // 0x05
    ampPacket[3] = 0x00;
    ampPacket[OFFSETS.PRESET_SLOT] = slot;
    ampPacket[OFFSETS.MODEL_ID_MSB] = (randomAmp.id >> 8) & 0xff;
    ampPacket[OFFSETS.MODEL_ID_LSB] = randomAmp.id & 0xff;

    // Randomize primary tone knobs (0..7) and bias (10)
    for (const idx of [0, 1, 2, 3, 4, 5, 6, 7, AMP_KNOB_INDEX.bias]) {
      ampPacket[OFFSETS.KNOB_START + idx] = Math.floor(Math.random() * 256);
    }
    // Keep discrete amp controls within valid Mustang hardware ranges
    const noiseGate = Math.floor(Math.random() * 6); // 0..5
    ampPacket[OFFSETS.KNOB_START + AMP_KNOB_INDEX.noiseGate] = noiseGate;
    ampPacket[OFFSETS.KNOB_START + AMP_KNOB_INDEX.threshold] = noiseGate === 5 ? Math.floor(Math.random() * 10) : 0;
    ampPacket[OFFSETS.KNOB_START + AMP_KNOB_INDEX.depth] = noiseGate === 5 ? Math.floor(Math.random() * 256) : 0x80;
    ampPacket[OFFSETS.KNOB_START + AMP_KNOB_INDEX.sag] = Math.floor(Math.random() * 3); // 0..2
    ampPacket[OFFSETS.KNOB_START + AMP_KNOB_INDEX.brightness] = Math.floor(Math.random() * 2); // 0..1

    // Default Cabinet for this amp (clamped to hardware range 0x00..0x0c)
    ampPacket[OFFSETS.CABINET_ID] = clampRange(defaultCabId !== 0 ? defaultCabId : 0x08, 0, LIMITS.MAX_CABINET_ID);

    this.liveAmpPacket = new Uint8Array(ampPacket);
    this.liveEffectPackets.clear();
    this.emit(ampPacket);

    // 3. Generate Random Effects (Max 1 of each DspType to adhere to hardware rules)
    const slotMapping: Record<number, number> = {
      [DspType.STOMP]: 0,
      [DspType.MOD]: Math.random() > 0.5 ? 1 : 4,
      [DspType.DELAY]: Math.random() > 0.5 ? 2 : 5,
      [DspType.REVERB]: Math.random() > 0.5 ? 3 : 6,
    };

    const availableTypes = [DspType.STOMP, DspType.MOD, DspType.DELAY, DspType.REVERB];
    const shuffledTypes = [...availableTypes].sort(() => Math.random() - 0.5);
    const numEffects = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < numEffects; i++) {
      const type = shuffledTypes[i];
      const fxSlot = slotMapping[type];
      const matchingEffects = Object.values(EFFECT_MODELS).filter(m => m.type === type);
      if (matchingEffects.length === 0) continue;
      const effect = matchingEffects[Math.floor(Math.random() * matchingEffects.length)];

      const fxDefaults = getModelDefault(effect.id);
      const fxPacket = fxDefaults ? new Uint8Array(fxDefaults) : new Uint8Array(64);
      fxPacket[0] = 0x1c;
      fxPacket[1] = 0x01;
      fxPacket[2] = effect.type;
      fxPacket[3] = 0x00;
      fxPacket[OFFSETS.MODEL_ID_MSB] = (effect.id >> 8) & 0xff;
      fxPacket[OFFSETS.MODEL_ID_LSB] = effect.id & 0xff;
      fxPacket[OFFSETS.SLOT_INDEX] = fxSlot;

      const [m0, m1, m2] = getEffectWireMeta(effect.id, effect.type);
      fxPacket[OFFSETS.EFFECT_META_0] = m0;
      fxPacket[OFFSETS.EFFECT_META_1] = m1;
      fxPacket[OFFSETS.EFFECT_META_2] = m2;
      fxPacket[OFFSETS.BYPASS] = Math.random() > 0.3 ? 0x00 : 0x01;

      // Randomize defined knobs within their hardware range (discrete specs or 0..255)
      for (let k = 0; k < effect.knobs.length; k++) {
        if (!effect.knobs[k]) continue;
        const spec = getEffectKnobSpec(effect.id, k);
        const min = spec?.min ?? 0;
        const max = spec?.max ?? LIMITS.MAX_VALUE;
        fxPacket[OFFSETS.KNOB_START + k] = min + Math.floor(Math.random() * (max - min + 1));
      }

      this.liveEffectPackets.set(effect.type, new Uint8Array(fxPacket));
      this.emit(fxPacket);
    }

    // Clear unselected DSP effect types (modelId = 0) just like physical Mustang preset loads
    for (let i = numEffects; i < shuffledTypes.length; i++) {
      const clearType = shuffledTypes[i];
      this.liveEffectPackets.set(clearType, null);
      const emptyFxPacket = new Uint8Array(64);
      emptyFxPacket[0] = 0x1c;
      emptyFxPacket[1] = 0x01;
      emptyFxPacket[2] = clearType;
      emptyFxPacket[3] = 0x00;
      const [m0, m1, m2] = getClearEffectWireMeta(clearType);
      emptyFxPacket[OFFSETS.EFFECT_META_0] = m0;
      emptyFxPacket[OFFSETS.EFFECT_META_1] = m1;
      emptyFxPacket[OFFSETS.EFFECT_META_2] = m2;
      emptyFxPacket[OFFSETS.BYPASS] = 0x01;
      this.emit(emptyFxPacket);
    }

    // 4. Emit end-of-preset confirmation ACK (0x1c 0x01 0x00)
    this.emitPresetAckPacket(slot);
  }

  private emit(data: Uint8Array) {
    this.listeners.forEach(l => l(data));
  }
}
