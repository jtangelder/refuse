import { Protocol } from './protocol/protocol';
import { DspType } from './models';
import { debug } from './helpers';
import { Store } from './store';
import { AmpController } from './controllers/amp_controller';
import { EffectController } from './controllers/effect_controller';
import { PresetController } from './controllers/preset_controller';
import { ProtocolDecoder } from './protocol/protocol_decoder';
import { PacketBuilder } from './protocol/packet_builder';

export { DspType, type CabinetDef, type ModelDef, AMP_MODELS, CABINET_MODELS, EFFECT_MODELS } from './models';

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
  cabinetId: number;
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
  private protocol: Protocol;
  public store: Store;

  public amp: AmpController;
  public effects: EffectController;
  public presets: PresetController;

  private isRefreshing = false;
  private monitoringListener?: (data: Uint8Array) => void;

  constructor() {
    this.protocol = new Protocol();
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
    if (this.monitoringListener) {
      this.protocol.removeEventListener(this.monitoringListener);
      this.monitoringListener = undefined;
    }
    await this.protocol.disconnect();
    this.store.setConnected(false);
  }

  private startMonitoring() {
    if (this.monitoringListener) return;

    this.monitoringListener = (data: Uint8Array) => {
      const command = ProtocolDecoder.decode(data);

      switch (command.type) {
        case 'KNOB_CHANGE':
          if (!this.amp.handleKnobChange(command)) {
            this.effects.handleKnobChange(command);
          }
          break;
        case 'AMP_UPDATE':
          this.amp.handleAmpUpdate(command);
          break;
        case 'EFFECT_UPDATE':
          this.effects.handleEffectUpdate(command);
          break;
        case 'BYPASS_STATE':
          this.effects.handleBypassState(command);
          break;
        case 'PRESET_CHANGE':
          this.presets.handlePresetChange(command);
          break;
        case 'PRESET_INFO':
          this.presets.handlePresetInfo(command);
          break;
        case 'UNKNOWN':
        default:
          // Ignore
          break;
      }
    };
    this.protocol.addEventListener(this.monitoringListener);

    // Subscribe to Preset changes to trigger refresh
    this.presets.onLoad = payload => {
      debug(`[API DEBUG] Preset loaded event received: ${JSON.stringify(payload)}`);
      // We do NOT trigger a full refresh here anymore.
      // The amp automatically sends PRESET_INFO, AMP_UPDATE, and EFFECT_UPDATE packets
      // when the preset changes. Requesting state explicitly (0xff 0xc1) causes it
      // to re-send PRESET_CHANGE or other packets that trigger this handler again,
      // leading to an infinite loop.
    };
  }

  private async refreshState() {
    await this.protocol.sendPacket(PacketBuilder.requestState());
  }

  private async refreshBypassStates(): Promise<void> {
    return new Promise<void>(resolve => {
      const pending = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
      const listener = (data: Uint8Array) => {
        const command = ProtocolDecoder.decode(data);
        if (command.type === 'BYPASS_STATE') {
          pending.delete(command.slot);
          if (pending.size === 0) {
            this.protocol.removeEventListener(listener);
            resolve();
          }
        }
      };
      this.protocol.addEventListener(listener);
      void this.protocol.sendPacket(PacketBuilder.requestBypassStates());
      setTimeout(() => {
        this.protocol.removeEventListener(listener);
        resolve();
      }, 1000);
    });
  }
}
