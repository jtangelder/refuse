import type { PresetMetadata } from '.';
import { DspType } from './models';
import { isValidSlot } from './protocol/constants';

export interface EntityState {
  modelId: number;
  enabled: boolean;
  // We store the raw knob values (0-255) indexed by their parameter index.
  // This corresponds to bytes 32-63 in the raw packet.
  knobs: number[];
}

export interface AmpState extends EntityState {
  cabinetId: number;
}

export interface EffectState extends EntityState {
  type: DspType;
  slot: number;
}

export interface PresetDetails {
  author?: string;
  description?: string;
  tags?: string;
  genre1?: string;
  genre2?: string;
  genre3?: string;
}

export interface State {
  amp: AmpState;
  slots: (EffectState | null)[]; // 8 slots, null if empty

  currentPresetSlot: number | null;
  presets: Map<number, PresetMetadata>;
  presetDetails: PresetDetails;
  connected: boolean;
  refreshing: boolean;
}

type StateListener = (state: State) => void;

export class Store {
  private state: State;
  private listeners: Set<StateListener> = new Set();
  private batchDepth = 0;
  private dirty = false;

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
      presetDetails: {},
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
    if (this.batchDepth > 0) {
      this.dirty = true;
      return;
    }
    this.listeners.forEach(l => l(this.state));
  }

  /**
   * Group multiple state mutations into a single notification tick.
   * Nested `batch()` calls are supported; listeners fire once when the outermost batch completes.
   */
  public batch(fn: () => void): void {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.dirty) {
        this.dirty = false;
        this.listeners.forEach(l => l(this.state));
      }
    }
  }

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

  public setPresetActive(slot: number, name: string, force = false) {
    // Only update the active selection if:
    // 1. Caller explicitly forces it (e.g. active AMP_UPDATE state packet)
    // 2. We aren't in a bulk refresh (dump)
    // 3. OR we don't have a selection yet
    const shouldUpdateSelection = force || !this.state.refreshing || this.state.currentPresetSlot === null;
    const nextSlot = shouldUpdateSelection ? slot : this.state.currentPresetSlot;
    const selectionChanged = nextSlot !== this.state.currentPresetSlot;
    const slotChanged = this.state.currentPresetSlot !== null && selectionChanged;
    const nameChanged = !!name && this.state.presets.get(slot)?.name !== name;

    if (!selectionChanged && !nameChanged) return;

    const presets = nameChanged ? new Map(this.state.presets).set(slot, { slot, name }) : this.state.presets;

    this.state = {
      ...this.state,
      currentPresetSlot: nextSlot,
      presets,
      presetDetails: slotChanged ? {} : this.state.presetDetails,
    };
    this.notify();
  }

  public setPresetMetadata(slot: number, name: string) {
    if (!name) return;
    if (this.state.presets.get(slot)?.name === name) return;
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
    if (isValidSlot(slot)) {
      if (this.state.slots[slot] === state) return;
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
    if (isValidSlot(slot)) {
      const effect = this.state.slots[slot];
      if (!effect || effect.enabled === enabled) return;
      const newSlots = [...this.state.slots];
      newSlots[slot] = { ...effect, enabled };

      this.state = {
        ...this.state,
        slots: newSlots,
      };
      this.notify();
    }
  }

  public clearSlot(slot: number) {
    if (isValidSlot(slot)) {
      if (this.state.slots[slot] === null) return;
      const newSlots = [...this.state.slots];
      newSlots[slot] = null;

      this.state = {
        ...this.state,
        slots: newSlots,
      };
      this.notify();
    }
  }

  public clearAllSlots() {
    if (this.state.slots.every(s => s === null)) return;
    this.state = {
      ...this.state,
      slots: new Array(8).fill(null),
    };
    this.notify();
  }

  public updatePresetDetails(details: Partial<PresetDetails>) {
    this.state = {
      ...this.state,
      presetDetails: { ...this.state.presetDetails, ...details },
    };
    this.notify();
  }

  public replacePresetDetails(details: PresetDetails = {}) {
    this.state = {
      ...this.state,
      presetDetails: { ...details },
    };
    this.notify();
  }
}
