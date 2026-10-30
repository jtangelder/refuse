import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresetController, sanitizePresetName } from '../controllers/preset_controller';
import { Store } from '../store';
import { OFFSETS, OPCODES } from '../protocol/constants';
import type { IProtocol } from '../protocol/protocol_interface';

describe('PresetController', () => {
  let store: Store;
  let sentPackets: Uint8Array[];
  let mockProtocol: IProtocol;
  let controller: PresetController;

  beforeEach(() => {
    store = new Store();
    sentPackets = [];
    mockProtocol = {
      isConnected: true,
      isSupported: true,
      connect: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getNextSequenceId: vi.fn().mockReturnValue(1),
      sendPacket: vi.fn().mockImplementation(async (data: Uint8Array) => {
        sentPackets.push(new Uint8Array(data));
      }),
    };
    controller = new PresetController(store, mockProtocol);
  });

  describe('sanitizePresetName', () => {
    it('strips ASCII control characters and trims surrounding whitespace', () => {
      expect(sanitizePresetName('  \u0000Clean\u0007\u001f Twin\u007f  ')).toBe('Clean Twin');
    });

    it('returns empty string when input contains only whitespace and control characters', () => {
      expect(sanitizePresetName(' \t\n\u0000\u001b ')).toBe('');
    });
  });

  describe('Inbound Commands', () => {
    it('handles PRESET_CHANGE by updating active preset and firing onLoad', () => {
      const onLoadSpy = vi.fn();
      controller.onLoad = onLoadSpy;

      const handled = controller.handlePresetChange({
        type: 'PRESET_CHANGE',
        slot: 3,
        name: 'Texas Blues',
      });

      expect(handled).toBe(true);
      expect(store.getState().currentPresetSlot).toBe(3);
      expect(controller.getPreset(3)?.name).toBe('Texas Blues');
      expect(onLoadSpy).toHaveBeenCalledWith({ slot: 3, name: 'Texas Blues' });
    });

    it('handles PRESET_INFO by storing metadata without changing currentPresetSlot', () => {
      store.setPresetActive(0, 'Initial');
      controller.handlePresetInfo({
        type: 'PRESET_INFO',
        slot: 12,
        name: 'Surf Reverb',
      });

      expect(store.getState().currentPresetSlot).toBe(0);
      expect(controller.getPreset(12)?.name).toBe('Surf Reverb');
    });
  });

  describe('Outbound Operations & Validation', () => {
    it('loads a valid preset slot and sends a loadPreset packet', async () => {
      await controller.loadPreset(7);

      expect(sentPackets).toHaveLength(1);
      expect(sentPackets[0][0]).toBe(OPCODES.DATA_PACKET);
      expect(sentPackets[0][1]).toBe(OPCODES.DATA_READ);
      expect(sentPackets[0][2]).toBe(0x01);
      expect(sentPackets[0][OFFSETS.PRESET_SLOT]).toBe(7);
    });

    it('rejects out-of-range or non-integer preset slots on loadPreset', async () => {
      await expect(controller.loadPreset(-1)).rejects.toThrow(/Invalid preset slot/);
      await expect(controller.loadPreset(100)).rejects.toThrow(/Invalid preset slot/);
      await expect(controller.loadPreset(2.5)).rejects.toThrow(/Invalid preset slot/);
    });

    it('saves a sanitized preset name, transmits savePreset packet, and updates Store', async () => {
      const onLoadSpy = vi.fn();
      controller.onLoad = onLoadSpy;

      await controller.savePreset(4, '  \u0000 Plexi Lead \u0007 ');

      expect(sentPackets).toHaveLength(1);
      const packet = sentPackets[0];
      expect(packet[0]).toBe(OPCODES.DATA_PACKET);
      expect(packet[1]).toBe(OPCODES.DATA_READ);
      expect(packet[2]).toBe(0x03);
      expect(packet[OFFSETS.PRESET_SLOT]).toBe(4);

      const decodedName = new TextDecoder().decode(packet.slice(OFFSETS.PRESET_NAME, OFFSETS.PRESET_NAME + 10));
      expect(decodedName).toBe('Plexi Lead');

      expect(store.getState().currentPresetSlot).toBe(4);
      expect(controller.getPreset(4)?.name).toBe('Plexi Lead');
      expect(onLoadSpy).toHaveBeenCalledWith({ slot: 4, name: 'Plexi Lead' });
    });

    it('rejects empty or control-char-only preset names on savePreset', async () => {
      await expect(controller.savePreset(0, '   \u0000\u0007  ')).rejects.toThrow(/Preset name must not be empty/);
      expect(sentPackets).toHaveLength(0);
    });

    it('returns presets sorted by slot ascending from getPresets()', () => {
      store.setPresetMetadata(15, 'Fifteen');
      store.setPresetMetadata(2, 'Two');
      store.setPresetMetadata(9, 'Nine');

      expect(controller.getPresets()).toEqual([
        { slot: 2, name: 'Two' },
        { slot: 9, name: 'Nine' },
        { slot: 15, name: 'Fifteen' },
      ]);
    });
  });
});
