import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmpController } from '../controllers/amp_controller';
import { Store } from '../store';
import { DspType, AMP_MODELS, CABINET_MODELS } from '../models';

// Mock Protocol
const mockProtocol = {
  sendPacket: vi.fn(),
  getNextSequenceId: vi.fn().mockReturnValue(1),
};

describe('AmpController', () => {
  let store: Store;
  let controller: AmpController;

  beforeEach(() => {
    store = new Store();
    vi.clearAllMocks();
    controller = new AmpController(store, mockProtocol as any);
  });

  describe('Command Processing', () => {
    it('should process KNOB_CHANGE for Amp', () => {
      // Setup initial state so we have knobs to update
      store.updateAmpState({
        modelId: 0x00,
        enabled: true,
        cabinetId: 0,
        knobs: new Array(32).fill(0),
      });

      const command = {
        type: 'KNOB_CHANGE',
        dspType: DspType.AMP,
        knobIndex: 5,
        value: 255,
      } as any;

      const handled = controller.process(command);
      expect(handled).toBe(true);
      expect(store.getState().amp.knobs[5]).toBe(255);
    });

    it('should ignore KNOB_CHANGE for other types', () => {
      const command = {
        type: 'KNOB_CHANGE',
        dspType: DspType.STOMP,
        knobIndex: 5,
        value: 255,
      } as any;

      const handled = controller.process(command);
      expect(handled).toBe(false);
    });

    it('should process AMP_UPDATE', () => {
      const command = {
        type: 'AMP_UPDATE',
        modelId: 0x1234,
        cabinetId: 0x05,
        knobs: new Array(32).fill(100),
      } as any;

      const handled = controller.process(command);
      expect(handled).toBe(true);
      expect(store.getState().amp.modelId).toBe(0x1234);
      expect(store.getState().amp.cabinetId).toBe(0x05);
      expect(store.getState().amp.knobs[0]).toBe(100);
    });
  });

  describe('API Methods', () => {
    it('should set amp model by ID', async () => {
      const model = AMP_MODELS.F57_DELUXE;
      await controller.setAmpModelById(model.id);

      expect(store.getState().amp.modelId).toBe(model.id);
      expect(mockProtocol.sendPacket).toHaveBeenCalledTimes(2); // State + Apply
    });

    it('should throw error for unknown amp model ID', async () => {
      await expect(controller.setAmpModelById(0x9999)).rejects.toThrow();
    });

    it('should set cabinet by ID', async () => {
      const cabinet = CABINET_MODELS[0];
      await controller.setCabinetById(cabinet.id);

      expect(store.getState().amp.cabinetId).toBe(cabinet.id);
      expect(mockProtocol.sendPacket).toHaveBeenCalledTimes(2);
    });

    it('should throw error for unknown cabinet ID', async () => {
      await expect(controller.setCabinetById(0xff)).rejects.toThrow();
    });

    it('should set amp knob', async () => {
      // Init
      await controller.setAmpModelById(AMP_MODELS.F57_DELUXE.id);
      mockProtocol.sendPacket.mockClear();

      await controller.setAmpKnob(0, 123);

      expect(store.getState().amp.knobs[0]).toBe(123);
      expect(mockProtocol.sendPacket).toHaveBeenCalled();
    });

    it('should get settings correctly', async () => {
      await controller.setAmpModelById(AMP_MODELS.F57_DELUXE.id);
      // '57 Deluxe: Vol(0), Gain(1), Master(3), Treble(4), Mid(5), Bass(6), Pres(7)
      await controller.setAmpKnob(0, 10); // Vol
      await controller.setAmpKnob(4, 50); // Treble

      const settings = controller.getSettings();
      expect(settings?.model).toBe(AMP_MODELS.F57_DELUXE.name);
      expect(settings?.volume).toBe(10);
      expect(settings?.treble).toBe(50);
    });
  });
});
