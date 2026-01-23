import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EffectController } from '../controllers/effect_controller';
import { Store } from '../store';
import { DspType, EFFECT_MODELS } from '../models';

const mockProtocol = {
  sendPacket: vi.fn(),
  getNextSequenceId: vi.fn().mockReturnValue(1),
};

describe('EffectController', () => {
  let store: Store;
  let controller: EffectController;

  beforeEach(() => {
    store = new Store();
    vi.clearAllMocks();
    controller = new EffectController(store, mockProtocol as any);
  });

  describe('Command Processing', () => {
    it('should process KNOB_CHANGE for Effects', () => {
      // Setup effect in slot 1
      store.updateSlotState(1, {
        type: DspType.STOMP,
        slot: 1,
        modelId: 0,
        enabled: true,
        knobs: new Array(32).fill(0),
      });

      const command = {
        type: 'KNOB_CHANGE',
        slot: 1,
        knobIndex: 2,
        value: 200,
      } as any;

      expect(controller.handleKnobChange(command)).toBe(true);
      expect(store.getState().slots[1]?.knobs[2]).toBe(200);
    });

    it('should process EFFECT_UPDATE', () => {
      const command = {
        type: 'EFFECT_UPDATE',
        slot: 3,
        dspType: DspType.DELAY,
        modelId: 0x1234,
        enabled: false,
        knobs: new Array(32).fill(50),
      } as any;

      expect(controller.handleEffectUpdate(command)).toBe(true);

      const effect = store.getState().slots[3];
      expect(effect).not.toBeNull();
      expect(effect?.type).toBe(DspType.DELAY);
      expect(effect?.enabled).toBe(false);
      expect(effect?.knobs[0]).toBe(50);
    });

    it('should handle singleton migration (clearing old slot)', () => {
      // Setup DELAY in slot 2
      store.updateSlotState(2, {
        type: DspType.DELAY,
        slot: 2,
        modelId: 0x1234,
        enabled: true,
        knobs: [],
      });

      // API reports DELAY moving to slot 4
      const command = {
        type: 'EFFECT_UPDATE',
        slot: 4,
        dspType: DspType.DELAY,
        modelId: 0x1234,
        enabled: true,
        knobs: [],
      } as any;

      controller.handleEffectUpdate(command);

      // Slot 4 should be populated
      expect(store.getState().slots[4]?.type).toBe(DspType.DELAY);
      // Slot 2 should be CLEARED
      expect(store.getState().slots[2]).toBeNull();
    });

    it('should process BYPASS_STATE', () => {
      store.updateSlotState(1, {
        type: DspType.STOMP,
        slot: 1,
        modelId: 0,
        enabled: true,
        knobs: [],
      });

      const command = {
        type: 'BYPASS_STATE',
        slot: 1,
        enabled: false,
      } as any;

      expect(controller.handleBypassState(command)).toBe(true);
      expect(store.getState().slots[1]?.enabled).toBe(false);
    });
  });

  describe('Effect Management', () => {
    it('should set effect by ID', async () => {
      const model = EFFECT_MODELS.OVERDRIVE;
      await controller.setEffectById(0, model.id);

      expect(store.getState().slots[0]?.modelId).toBe(model.id);
      expect(mockProtocol.sendPacket).toHaveBeenCalled();
    });

    it('should throw error if effect type already exists', async () => {
      const model = EFFECT_MODELS.OVERDRIVE; // Stomp
      await controller.setEffectById(0, model.id);

      // Try adding another Stomp to slot 1
      await expect(controller.setEffectById(1, model.id)).rejects.toThrow(/already exists/);
    });

    it('should clear effect', async () => {
      const model = EFFECT_MODELS.OVERDRIVE;
      await controller.setEffectById(0, model.id);
      expect(store.getState().slots[0]).not.toBeNull();

      await controller.clearEffect(0);
      expect(store.getState().slots[0]).toBeNull();
      expect(mockProtocol.sendPacket).toHaveBeenCalled();
    });

    it('should swap effects', async () => {
      await controller.setEffectById(0, EFFECT_MODELS.OVERDRIVE.id);
      await controller.setEffectById(1, EFFECT_MODELS.SINE_FLANGER.id);

      await controller.swapEffects(0, 1);

      expect(store.getState().slots[0]?.modelId).toBe(EFFECT_MODELS.SINE_FLANGER.id);
      expect(store.getState().slots[1]?.modelId).toBe(EFFECT_MODELS.OVERDRIVE.id);
    });

    it('should swap effect with empty slot', async () => {
      await controller.setEffectById(0, EFFECT_MODELS.OVERDRIVE.id);

      await controller.swapEffects(0, 5);

      expect(store.getState().slots[0]).toBeNull();
      expect(store.getState().slots[5]?.modelId).toBe(EFFECT_MODELS.OVERDRIVE.id);
    });
  });
});
