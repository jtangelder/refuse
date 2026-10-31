import { computed, inject, Injectable, signal } from '@angular/core';
import { FuseAPI } from '../lib';
import { Store } from '../lib/store';
import { Protocol } from '../lib/protocol/protocol';
import { DemoProtocol } from '../lib/protocol/demo_protocol';
import { type IProtocol } from '../lib/protocol/protocol_interface';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class FuseService {
  private readonly notifications = inject(NotificationService);
  private store = new Store();
  private protocol: IProtocol = new Protocol();

  public api = this.createApi(this.protocol);
  public state = signal(this.store.getState());
  public isDemo = signal(false);
  public connecting = signal(false);

  public connected = computed(() => this.state().connected);
  public refreshing = computed(() => this.state().refreshing);
  public amp = computed(() => this.state().amp);
  public effects = computed(() => this.state().slots);
  public presets = computed(() => this.state().presets);
  public presetDetails = computed(() => this.state().presetDetails);
  public currentPresetSlot = computed(() => this.state().currentPresetSlot);

  constructor() {
    this.store.subscribe(state => {
      this.state.set({ ...state });
    });
  }

  private createApi(protocol: IProtocol): FuseAPI {
    const api = new FuseAPI(this.store, protocol);
    api.onConnectionLost = () => {
      this.notifications.error('Amplifier disconnected');
    };
    return api;
  }

  async connect(): Promise<boolean> {
    if (this.connecting()) return false;
    this.connecting.set(true);
    const wasDemo = this.isDemo();
    try {
      const physicalProtocol = new Protocol();
      const physicalApi = this.createApi(physicalProtocol);
      const connected = await physicalApi.connect();

      if (!connected) {
        // User canceled or no device selected.
        // If we were in Demo mode, keep Demo mode active!
        return false;
      }

      // Real physical amp connected successfully!
      if (wasDemo) {
        await this.api.disconnect();
      }
      this.protocol = physicalProtocol;
      this.api = physicalApi;
      this.isDemo.set(false);
      return true;
    } catch (err) {
      console.error('[FuseService] Connection failed:', err);
      return false;
    } finally {
      this.connecting.set(false);
    }
  }

  async disconnect(): Promise<void> {
    await this.api.disconnect();
    this.isDemo.set(false);
  }

  async enableDemo(): Promise<boolean> {
    if (this.connecting()) return false;
    this.connecting.set(true);
    try {
      await this.api.disconnect();
      this.protocol = new DemoProtocol();
      this.api = this.createApi(this.protocol);
      this.isDemo.set(true);
      return await this.api.connect();
    } finally {
      this.connecting.set(false);
    }
  }

  isSupported(): boolean {
    return Protocol.isHidSupported();
  }
}
