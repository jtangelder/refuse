import { FuseProtocol, OPCODES } from './protocol';
import type { ModelDef } from './models';
import { DspType, AMP_MODELS, EFFECT_MODELS, CABINET_MODELS, FENDER_VID } from './models';
import { debug } from './helpers';
import { Store, type State } from './store';
import { AmpController } from './controllers/amp_controller';
import { EffectController } from './controllers/effect_controller';
import { PresetController } from './controllers/preset_controller';
import { PacketParser } from './parser';

// --- TYPE DEFINITIONS ---
export type { ModelDef } from './models';
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
  connecting: () => void;
  connected: () => void;
  disconnected: () => void;
  'preset-loaded': (slot: number, name: string) => void;
  'amp-changed': (modelId: number, knobs: KnobInfo[]) => void;
  'effect-changed': (slot: number, modelId: number, knobs: KnobInfo[]) => void;
  'bypass-toggled': (slot: number, enabled: boolean) => void;
  'knob-changed': (type: 'amp' | 'effect', slot: number, knobName: string, value: number) => void;
  'cabinet-changed': (cabinetId: number) => void;
  'state-changed': () => void;
};

import { EventEmitter } from './event_emitter';

// --- MAIN API CLASS ---

// --- MAIN API CLASS ---

export class FuseAPI extends EventEmitter<{
  connected: void;
  disconnected: void;
  'state-changed': void;
  // Re-emit controller events for legacy support or convenience?
}> {
  private protocol: FuseProtocol;
  public store: Store;

  public amp: AmpController;
  public effects: EffectController;
  public presets: PresetController;

  private isRefreshing = false;

  constructor() {
    super();
    this.protocol = new FuseProtocol();
    this.store = new Store();

    this.amp = new AmpController(this.store, this.protocol);
    this.effects = new EffectController(this.store, this.protocol);
    this.presets = new PresetController(this.store, this.protocol);

    this.setupControllerEvents();
  }

  private setupControllerEvents() {
    this.amp.on('change', () => this.emit('state-changed'));
    this.effects.on('change', () => this.emit('state-changed'));
    this.presets.on('loaded', () => this.emit('state-changed'));
    // Cabinet doesn't have events yet but probably should?
  }

  /**
   * Facade for State
   */
  public get state() {
    return this.store.getState();
  }

  public get isSupported(): boolean {
    return this.protocol.isSupported;
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
    debug('[API CALL] connect()');
    const connected = await this.protocol.connect();
    if (!connected) {
      debug('[API] Connection failed');
      return false;
    }

    debug('[API] Connected. Initiating state sync...');
    this.store.setConnected(true);

    this.store.setRefreshing(true);
    this.isRefreshing = true;
    this.startMonitoring();
    try {
      await this.refreshState();
      await this.refreshBypassStates();
      // Padding to ensure packets from the dump are processed before we allow re-triggers
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      this.isRefreshing = false;
      this.store.setRefreshing(false);
      this.emit('state-changed');
    }

    this.emit('connected');
    return true;
  }

  async disconnect(): Promise<void> {
    debug('[API CALL] disconnect()');
    await this.protocol.disconnect();
    this.store.setConnected(false);
    this.emit('disconnected');
  }

  private startMonitoring() {
    this.protocol.addEventListener((data: Uint8Array) => {
      // Delegate to controllers
      // We try each controller. If one handles it, good.
      // Order matters? Not really for distinct types.

      if (this.amp.process(data)) {
        this.emit('state-changed');
        return;
      }

      if (this.effects.process(data)) {
        this.emit('state-changed');
        return;
      }

      if (this.presets.process(data)) {
        this.emit('state-changed');
        return;
      }

      // 4. Cabinet? (Not explicitly handled, but could be)
    });

    // Subscribe to Preset changes to trigger refresh
    this.presets.on('loaded', payload => {
      console.log('[API DEBUG] Preset loaded event received:', payload, 'isRefreshing:', this.isRefreshing);
      if (!this.isRefreshing) {
        debug(`[API] Preset loaded (${payload.slot}). Refreshing state...`);
        this.isRefreshing = true;
        this.store.setRefreshing(true);
        this.refreshState()
          .then(() => this.refreshBypassStates())
          .finally(() => {
            this.isRefreshing = false;
            this.store.setRefreshing(false);
            this.emit('state-changed');
          });
      }
    });
  }

  private async refreshState() {
    await this.protocol.requestState();
  }

  private async refreshBypassStates(): Promise<void> {
    return new Promise<void>(async resolve => {
      const pending = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
      const listener = (data: Uint8Array) => {
        if (PacketParser.isBypassResponse(data)) {
          const bypassInfo = PacketParser.parseBypassResponse(data);
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
      await this.protocol.requestBypassStates();
      setTimeout(() => {
        this.protocol.removeEventListener(listener);
        resolve();
      }, 1000);
    });
  }
}
