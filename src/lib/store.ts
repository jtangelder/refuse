import type { PresetMetadata } from './api';
import type { AmpState, EffectState } from './state_types';

export interface State {
  amp: AmpState;
  slots: (EffectState | null)[]; // 8 slots, null if empty

  currentPresetSlot: number | null;
  presets: Map<number, PresetMetadata>;
  connected: boolean;
  refreshing: boolean;
}

type StateListener = (state: State) => void;

export class Store {
  private state: State;
  private listeners: Set<StateListener> = new Set();

  constructor() {
    this.state = {
      amp: {
        modelId: 0,
        enabled: true,
        cabinetId: 0,
        knobs: new Array(32).fill(0),
      },
      slots: new Array(8).fill(null),

      currentPresetSlot: null,
      presets: new Map(),
      connected: false,
      refreshing: false,
    };
  }

  public getState(): State {
    return this.state;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Immediate callback
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public notify() {
    this.listeners.forEach(l => l(this.state));
  }

  // --- State Setters ---

  public setConnected(connected: boolean) {
    if (this.state.connected !== connected) {
      this.state = { ...this.state, connected };
      this.notify();
    }
  }

  public setRefreshing(refreshing: boolean) {
    if (this.state.refreshing !== refreshing) {
      this.state = { ...this.state, refreshing };
      this.notify();
    }
  }

  public setPresetActive(slot: number, name: string) {
    const newPresets = new Map(this.state.presets);
    if (name) {
      newPresets.set(slot, { slot, name });
    }

    // Only update the active selection if:
    // 1. We aren't in a bulk refresh (dump)
    // 2. OR we don't have a selection yet
    const shouldUpdateSelection = !this.state.refreshing || this.state.currentPresetSlot === null;

    this.state = {
      ...this.state,
      currentPresetSlot: shouldUpdateSelection ? slot : this.state.currentPresetSlot,
      presets: newPresets,
    };
    this.notify();
  }

  public setPresetMetadata(slot: number, name: string) {
    if (!name) return;
    const newPresets = new Map(this.state.presets);
    newPresets.set(slot, { slot, name });
    this.state = {
      ...this.state,
      presets: newPresets,
    };
    this.notify();
  }

  public updateAmpState(state: AmpState) {
    this.state = { ...this.state, amp: state };
    this.notify();
  }

  public updateSlotState(slot: number, state: EffectState | null) {
    if (slot >= 0 && slot < 8) {
      const newSlots = [...this.state.slots];
      newSlots[slot] = state;

      this.state = {
        ...this.state,
        slots: newSlots,
      };
      this.notify();
    }
  }

  public setEffectBypass(slot: number, enabled: boolean) {
    if (slot >= 0 && slot < 8) {
      const effect = this.state.slots[slot];
      const newSlots = [...this.state.slots];
      if (effect) {
        newSlots[slot] = { ...effect, enabled };
      }

      this.state = {
        ...this.state,
        slots: newSlots,
      };
      this.notify();
    }
  }

  public clearSlot(slot: number) {
    if (slot >= 0 && slot < 8) {
      const newSlots = [...this.state.slots];
      newSlots[slot] = null;

      this.state = {
        ...this.state,
        slots: newSlots,
      };
      this.notify();
    }
  }
}
