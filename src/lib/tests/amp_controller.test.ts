import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmpController } from '../controllers/amp_controller';
import { Store } from '../store';
import { DspType, AMP_MODELS, CABINET_MODELS } from '../models';
import type { IProtocol } from '../protocol/protocol_interface';

describe('AmpController', () => {
  let store: Store;
  let mockProtocol: IProtocol;
  let controller: AmpController;

  beforeEach(() => {
    store = new Store();
    mockProtocol = {
      isConnected: true,
      isSupported: true,
      connect: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      sendPacket: vi.fn().mockResolvedValue(undefined),
      getNextSequenceId: vi.fn().mockReturnValue(1),
    };
    controller = new AmpController(store, mockProtocol);
  });

  describe('Command Processing', () => {
    it('should process KNOB_CHANGE for Amp', () => {
      store.updateAmpState({
        modelId: 0x00,
        enabled: true,
        cabinetId: 0,
        knobs: new Array(32).fill(0),
      });

      const handled = controller.handleKnobChange({
        type: 'KNOB_CHANGE',
        dspType: DspType.AMP,
        slot: 0,
        knobIndex: 5,
        value: 255,
      });
      expect(handled).toBe(true);
      expect(store.getState().amp.knobs[5]).toBe(255);
    });

    it('should ignore KNOB_CHANGE for other DSP types', () => {
      const handled = controller.handleKnobChange({
        type: 'KNOB_CHANGE',
        dspType: DspType.STOMP,
        slot: 0,
        knobIndex: 5,
        value: 255,
      });
      expect(handled).toBe(false);
    });

    it('should process AMP_UPDATE', () => {
      const handled = controller.handleAmpUpdate({
        type: 'AMP_UPDATE',
        modelId: 0x1234,
        cabinetId: 0x05,
        knobs: new Array(32).fill(100),
      });
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
      await expect(controller.setAmpModelById(0x9999)).rejects.toThrow(/Unknown amp model ID/);
    });

    it('should set cabinet by ID', async () => {
      const cabinet = CABINET_MODELS[0];
      await controller.setCabinetById(cabinet.id);

      expect(store.getState().amp.cabinetId).toBe(cabinet.id);
      expect(mockProtocol.sendPacket).toHaveBeenCalledTimes(2);
    });

    it('should throw error for unknown cabinet ID', async () => {
      await expect(controller.setCabinetById(0xff)).rejects.toThrow(/Unknown cabinet ID/);
    });

    it('should set amp knob and reject out-of-range knob indices', async () => {
      await controller.setAmpModelById(AMP_MODELS.F57_DELUXE.id);
      vi.mocked(mockProtocol.sendPacket).mockClear();

      await controller.setAmpKnob(0, 123);

      expect(store.getState().amp.knobs[0]).toBe(123);
      expect(mockProtocol.sendPacket).toHaveBeenCalledTimes(2);

      await expect(controller.setAmpKnob(-1, 50)).rejects.toThrow(/Invalid amp knob index/);
      await expect(controller.setAmpKnob(32, 50)).rejects.toThrow(/Invalid amp knob index/);
    });

    it('should preserve sparse hardware knob indices (e.g. skipping empty slot 2 on 57 Deluxe)', async () => {
      // '57 Deluxe: ["Vol", "Gain", "", "Master", "Treb", "Mid", "Bass", "Pres"]
      await controller.setAmpModelById(AMP_MODELS.F57_DELUXE.id);

      const knobs = controller.getAmpKnobs();
      const vol = knobs.find(k => k.name === 'Vol');
      const bass = knobs.find(k => k.name === 'Bass');

      expect(vol?.index).toBe(0);
      expect(bass?.index).toBe(6);
    });

    it('should set amp model by ID with knob overrides in a single transmit', async () => {
      const model = AMP_MODELS.F57_DELUXE;
      await controller.setAmpModelById(model.id, [
        { index: 0, value: 175 },
        { index: 4, value: 200 },
      ]);

      expect(store.getState().amp.modelId).toBe(model.id);
      expect(store.getState().amp.knobs[0]).toBe(175);
      expect(store.getState().amp.knobs[4]).toBe(200);
      expect(mockProtocol.sendPacket).toHaveBeenCalledTimes(2); // exactly 1 state packet + 1 apply packet
    });

    it('should get settings correctly', async () => {
      await controller.setAmpModelById(AMP_MODELS.F57_DELUXE.id);
      await controller.setAmpKnob(0, 10); // Vol
      await controller.setAmpKnob(4, 50); // Treble

      const settings = controller.getSettings();
      expect(settings?.model).toBe(AMP_MODELS.F57_DELUXE.name);
      expect(settings?.volume).toBe(10);
      expect(settings?.treble).toBe(50);
    });
  });
});
