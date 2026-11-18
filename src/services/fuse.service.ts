import { computed, inject, Injectable, NgZone, signal } from '@angular/core';
import { FuseAPI } from '../lib';
import { Store } from '../lib/store';
import { Protocol } from '../lib/protocol/protocol';
import { DemoProtocol } from '../lib/protocol/demo_protocol';
import { type IProtocol } from '../lib/protocol/protocol_interface';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class FuseService {
  private readonly notifications = inject(NotificationService);
  private readonly zone = inject(NgZone);
  private store = new Store();
  private storeUnsubscribe?: () => void;
  private protocol: IProtocol = new Protocol();

  public api = this.createApi(this.store, this.protocol);
  public state = signal(this.store.getState());
  public isDemo = signal(false);
  public connecting = signal(false);
  public deviceName = signal<string | null>(null);

  public connected = computed(() => this.state().connected);
  public refreshing = computed(() => this.state().refreshing);
  public amp = computed(() => this.state().amp);
  public effects = computed(() => this.state().slots);
  public presets = computed(() => this.state().presets);
  public presetDetails = computed(() => this.state().presetDetails);
  public currentPresetSlot = computed(() => this.state().currentPresetSlot);

  constructor() {
    this.attachStore(this.store);
  }

  private attachStore(nextStore: Store): void {
    this.storeUnsubscribe?.();
    this.store = nextStore;
    this.storeUnsubscribe = this.store.subscribe(state => {
      if (NgZone.isInAngularZone()) {
        this.state.set({ ...state });
      } else {
        this.zone.run(() => {
          this.state.set({ ...state });
        });
      }
    });
  }

  private createApi(store: Store, protocol: IProtocol): FuseAPI {
    const api = new FuseAPI(store, protocol);
    api.onConnectionLost = () => {
      this.zone.run(() => {
        this.deviceName.set(null);
      });
      this.notifications.error('Amplifier disconnected');
    };
    return api;
  }

  async connect(): Promise<boolean> {
    if (this.connecting()) return false;
    this.connecting.set(true);
    try {
      const nextStore = new Store();
      const physicalProtocol = new Protocol();
      const physicalApi = this.createApi(nextStore, physicalProtocol);
      const connected = await physicalApi.connect();

      if (!connected) {
        // User canceled or no device selected.
        // If we were in Demo mode, keep Demo mode active!
        return false;
      }

      // Real physical amp connected successfully — tear down previous session without
      // clobbering the newly synced Store, then swap API + Store atomically.
      const previousApi = this.api;
      this.protocol = physicalProtocol;
      this.api = physicalApi;
      this.isDemo.set(false);
      this.deviceName.set(physicalProtocol.deviceName?.trim() || null);
      this.attachStore(nextStore);
      await previousApi.disconnect();
      return true;
    } catch (err) {
      console.error('[FuseService] Connection failed:', err);
      return false;
    } finally {
      this.connecting.set(false);
    }
  }

  async resync(): Promise<void> {
    if (!this.connected() || this.connecting() || this.refreshing()) return;
    await this.api.syncState();
    this.notifications.info('Synced state from amplifier.');
  }

  async disconnect(): Promise<void> {
    await this.api.disconnect();
    this.isDemo.set(false);
    this.deviceName.set(null);
  }

  async enableDemo(): Promise<boolean> {
    if (this.connecting()) return false;
    this.connecting.set(true);
    try {
      const nextStore = new Store();
      const demoProtocol = new DemoProtocol();
      const demoApi = this.createApi(nextStore, demoProtocol);
      const connected = await demoApi.connect();

      const previousApi = this.api;
      this.protocol = demoProtocol;
      this.api = demoApi;
      this.isDemo.set(true);
      this.deviceName.set(null);
      this.attachStore(nextStore);
      await previousApi.disconnect();
      return connected;
    } finally {
      this.connecting.set(false);
    }
  }

  isSupported(): boolean {
    return Protocol.isHidSupported();
  }
}
