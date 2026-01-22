import { FuseProtocol, OPCODES } from './protocol';
import type { ModelDef } from './models';
import { DspType, AMP_MODELS, EFFECT_MODELS, CABINET_MODELS } from './models';
import { debug } from './helpers';
import { Store, type State } from './store';
import { AmpController } from './amp_controller';
import { EffectController } from './effect_controller';
import { PresetController } from './preset_controller';
import { ProtocolDecoder } from './protocol_decoder';

export type { ModelDef } from './models';
export { DspType, AMP_MODELS, EFFECT_MODELS, CABINET_MODELS } from './models';

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

export class FuseAPI {
  private protocol: FuseProtocol;
  public store: Store;

  public amp: AmpController;
  public effects: EffectController;
  public presets: PresetController;

  private isRefreshing = false;

  constructor() {
    this.protocol = new FuseProtocol();
    this.store = new Store();

    this.amp = new AmpController(this.store, this.protocol);
    this.effects = new EffectController(this.store, this.protocol);
    this.presets = new PresetController(this.store, this.protocol);
  }

  // Facade for State
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
    }

    return true;
  }

  async disconnect(): Promise<void> {
    debug('[API CALL] disconnect()');
    await this.protocol.disconnect();
    this.store.setConnected(false);
  }

  private startMonitoring() {
    this.protocol.addEventListener((data: Uint8Array) => {
      const command = ProtocolDecoder.decode(data);
      if (command.type === 'UNKNOWN') return;
      if (this.amp.process(command)) return;
      if (this.effects.process(command)) return;
      if (this.presets.process(command)) return;
    });

    // Subscribe to Preset changes to trigger refresh
    this.presets.onLoad = payload => {
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
          });
      }
    };
  }

  private async refreshState() {
    await this.protocol.requestState();
  }

  private async refreshBypassStates(): Promise<void> {
    return new Promise<void>(async resolve => {
      const pending = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
      const listener = (data: Uint8Array) => {
        const command = ProtocolDecoder.decode(data);
        if (command.type === 'BYPASS_STATE') {
          const { slot, enabled } = command;
          pending.delete(slot);
          if (pending.size === 0) {
            this.protocol.removeEventListener(listener);
            resolve();
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
