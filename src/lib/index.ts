import { type IProtocol } from './protocol/protocol_interface';
import { DspType } from './models';
import { debug } from './helpers';
import { Store, type PresetDetails } from './store';
import { AmpController } from './controllers/amp_controller';
import { EffectController } from './controllers/effect_controller';
import { PresetController } from './controllers/preset_controller';
import { ProtocolDecoder } from './protocol/protocol_decoder';
import { PacketBuilder } from './protocol/packet_builder';
import { PresetImporter } from './preset_importer';
import { enqueueWrite } from './protocol/write_queue';

export {
  DspType,
  type CabinetDef,
  type ModelDef,
  type EffectFormFactor,
  AMP_MODELS,
  CABINET_MODELS,
  EFFECT_MODELS,
  WIDE_EFFECT_MODELS,
  RACK_EFFECT_MODELS,
  findAmpModel,
  findEffectModel,
  findCabinetModel,
  resolveFuseModelId,
  getDelayTimeKnobIndex,
  isWideEffect,
  isRackUnit,
  getEffectFormFactor,
} from './models';
export { type PresetDetails } from './store';
export {
  enqueueWrite,
  enqueueCoalescedWrite,
  cancelCoalescedWrite,
  flushWrites,
  type PacketFactory,
} from './protocol/write_queue';
export { ThrottledDispatcher } from './throttler';
export { LIMITS, AMP_KNOB_INDEX, type AdvancedAmpParam } from './protocol/constants';
export { type SetEffectOptions } from './controllers/effect_controller';

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
  public amp: AmpController;
  public effects: EffectController;
  public presets: PresetController;
  public presetImporter: PresetImporter;

  /** Invoked when the device disappears without the user disconnecting (unplug, sleep). */
  public onConnectionLost?: () => void;

  private monitoringListener?: (data: Uint8Array) => void;

  constructor(
    public store: Store,
    private protocol: IProtocol,
  ) {
    this.amp = new AmpController(this.store, this.protocol);
    this.effects = new EffectController(this.store, this.protocol);
    this.presets = new PresetController(this.store, this.protocol);
    this.presetImporter = new PresetImporter(this.protocol, this.store);

    this.protocol.onDisconnect = () => {
      debug('[API] Device disconnected by hardware or system');
      this.stopMonitoring();
      this.store.setConnected(false);
      this.onConnectionLost?.();
    };
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
    this.startMonitoring();
    try {
      await this.refreshState();
      await this.refreshBypassStates();
      // Wait for incoming dump packets to reach quiescence (up to 500ms cap)
      await this.waitForQuiescence(50, 500);
    } finally {
      this.store.setRefreshing(false);
    }

    return true;
  }

  async disconnect(): Promise<void> {
    debug('[API CALL] disconnect()');
    this.stopMonitoring();
    await this.protocol.disconnect();
    this.store.setConnected(false);
  }

  private stopMonitoring() {
    if (this.monitoringListener) {
      this.protocol.removeEventListener(this.monitoringListener);
      this.monitoringListener = undefined;
    }
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
    };
  }

  private async refreshState() {
    await enqueueWrite(this.protocol, () => PacketBuilder.requestState());
  }

  private async refreshBypassStates(): Promise<void> {
    return new Promise<void>(resolve => {
      const pending = new Set([0, 1, 2, 3, 4, 5, 6, 7]);

      const done = () => {
        clearTimeout(timeoutId);
        this.protocol.removeEventListener(listener);
        resolve();
      };

      const listener = (data: Uint8Array) => {
        const command = ProtocolDecoder.decode(data);
        if (command.type === 'BYPASS_STATE') {
          pending.delete(command.slot);
          if (pending.size === 0) {
            done();
          }
        }
      };

      const timeoutId = setTimeout(done, 1000);
      this.protocol.addEventListener(listener);
      enqueueWrite(this.protocol, () => PacketBuilder.requestBypassStates()).catch(done);
    });
  }

  /**
   * Resolves once no incoming packets have been received for `quietMs`,
   * bounded by an upper safety cap `maxWaitMs`.
   */
  private waitForQuiescence(quietMs = 50, maxWaitMs = 500): Promise<void> {
    return new Promise<void>(resolve => {
      let quietTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = () => {
        if (quietTimer !== undefined) clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        this.protocol.removeEventListener(onPacket);
        resolve();
      };

      const onPacket = () => {
        if (quietTimer !== undefined) clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      };

      const maxTimer = setTimeout(finish, maxWaitMs);
      this.protocol.addEventListener(onPacket);
      quietTimer = setTimeout(finish, quietMs);
    });
  }

  async loadPresetFromXml(xml: string): Promise<void> {
    await this.presetImporter.loadXml(xml);
  }

  exportPresetToXml(presetName?: string): string {
    return this.presetImporter.exportXml(presetName);
  }

  updatePresetDetails(details: Partial<PresetDetails>): void {
    this.store.updatePresetDetails(details);
  }
}
