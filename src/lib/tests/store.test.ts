import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Store, AmpState, EffectState } from '../store';
import { DspType } from '../models';

describe('Store', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store();
  });

  describe('Initialization', () => {
    it('should have correct default state', () => {
      const state = store.getState();
      expect(state.connected).toBe(false);
      expect(state.refreshing).toBe(false);
      expect(state.currentPresetSlot).toBeNull();
      expect(state.presets.size).toBe(0);
      expect(state.amp.knobs.length).toBe(32);
      expect(state.slots.length).toBe(8);
      expect(state.slots.every(s => s === null)).toBe(true);
    });
  });

  describe('Subscription', () => {
    it('should notify subscribers on state change', () => {
      const listener = vi.fn();
      store.subscribe(listener);

      // Initial call
      expect(listener).toHaveBeenCalledTimes(1);

      store.setConnected(true);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.lastCall?.[0].connected).toBe(true);
    });

    it('should unsubscribe correctly', () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.setConnected(true);

      // Should only be called once (initial subscribe)
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Amp State', () => {
    it('should update amp state', () => {
      const newAmpState: AmpState = {
        modelId: 123,
        enabled: false,
        cabinetId: 4,
        knobs: new Array(32).fill(10),
      };

      store.updateAmpState(newAmpState);
      const state = store.getState();

      expect(state.amp).toEqual(newAmpState);
      expect(state.amp).toEqual(newAmpState);
      // The state object itself is new.
    });
  });

  describe('Slot State', () => {
    it('should update slot state', () => {
      const effect: EffectState = {
        type: DspType.STOMP,
        slot: 2,
        modelId: 55,
        enabled: true,
        knobs: [1, 2, 3],
      };

      store.updateSlotState(2, effect);
      expect(store.getState().slots[2]).toEqual(effect);
    });

    it('should ignore invalid slot indices', () => {
      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.updateSlotState(99, null);
      expect(listener).not.toHaveBeenCalled();
    });

    it('should clear slot', () => {
      const effect: EffectState = {
        type: DspType.STOMP,
        slot: 2,
        modelId: 55,
        enabled: true,
        knobs: [],
      };
      store.updateSlotState(2, effect);
      expect(store.getState().slots[2]).not.toBeNull();

      store.clearSlot(2);
      expect(store.getState().slots[2]).toBeNull();
    });

    it('should toggle effect bypass', () => {
      const effect: EffectState = {
        type: DspType.STOMP,
        slot: 1,
        modelId: 55,
        enabled: true,
        knobs: [],
      };
      store.updateSlotState(1, effect);

      store.setEffectBypass(1, false);
      expect(store.getState().slots[1]?.enabled).toBe(false);

      store.setEffectBypass(1, true);
      expect(store.getState().slots[1]?.enabled).toBe(true);
    });

    it('should ignore bypass toggle on empty slot', () => {
      store.clearSlot(1);
      store.setEffectBypass(1, true);
      expect(store.getState().slots[1]).toBeNull();
    });
  });

  describe('Preset Management', () => {
    it('should update preset metadata', () => {
      store.setPresetMetadata(0, 'My Preset');
      expect(store.getState().presets.get(0)).toEqual({ slot: 0, name: 'My Preset' });
    });

    it('should set active preset', () => {
      store.setPresetActive(5, 'Active Preset');
      expect(store.getState().currentPresetSlot).toBe(5);
      expect(store.getState().presets.get(5)?.name).toBe('Active Preset');
    });

    it('should NOT update active selection if refreshing', () => {
      store.setRefreshing(true);
      store.setPresetActive(1, 'Ignored Selection');

      // Name should update
      expect(store.getState().presets.get(1)?.name).toBe('Ignored Selection');
      // Selection should NOT update (unless null)
    });

    it('should update active selection if refreshing BUT current is null', () => {
      expect(store.getState().currentPresetSlot).toBeNull();
      store.setRefreshing(true);

      store.setPresetActive(1, 'First Load');
      expect(store.getState().currentPresetSlot).toBe(1);
    });
  });
});
