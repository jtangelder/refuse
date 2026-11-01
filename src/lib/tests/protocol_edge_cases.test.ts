import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolDecoder } from '../protocol/protocol_decoder';
import { PacketBuilder } from '../protocol/packet_builder';
import { DspType, AMP_MODELS, EFFECT_MODELS } from '../models';
import { enqueueCoalescedWrite, flushWrites } from '../protocol/write_queue';
import { Store, type AmpState, type EffectState } from '../store';
import { AmpController } from '../controllers/amp_controller';
import { EffectController } from '../controllers/effect_controller';
import { PresetImporter } from '../preset_importer';
import type { IProtocol } from '../protocol/protocol_interface';

describe('Protocol Edge Cases & Defensive Parsing', () => {
  describe('Incomplete Transfers & Malformed Packet Lengths', () => {
    it('handles empty buffers without crashing', () => {
      const decoded = ProtocolDecoder.decode(new Uint8Array(0));
      expect(decoded.type).toBe('UNKNOWN');
    });

    it('handles single-byte buffers without crashing', () => {
      const decoded = ProtocolDecoder.decode(new Uint8Array([0x1c]));
      expect(decoded.type).toBe('UNKNOWN');
    });

    it('handles truncated data packets safely', () => {
      // 0x1c 0x01 indicates a data packet, but truncate to only 4 bytes
      const truncated = new Uint8Array([0x1c, 0x01, DspType.AMP, 0x00]);
      const decoded = ProtocolDecoder.decode(truncated);
      // Should decode or handle safely without out-of-bounds error
      expect(decoded).toBeDefined();
    });

    it('handles arbitrary garbage bytes safely', () => {
      const garbage = new Uint8Array([0xfe, 0xed, 0xfa, 0xce, 0x12, 0x34]);
      const decoded = ProtocolDecoder.decode(garbage);
      expect(decoded.type).toBe('UNKNOWN');
    });
  });

  describe('Serialization and Deserialization Round-trips', () => {
    it('round-trips AmpState through PacketBuilder and ProtocolDecoder', () => {
      const knobs = Array.from({ length: 32 }, (_, i) => (i * 7) % 256);
      knobs[17] = 3; // Byte 49 is Cabinet ID in the 32-64 knob range
      const ampState: AmpState = {
        modelId: AMP_MODELS.F57_DELUXE.id,
        enabled: true,
        cabinetId: 3,
        knobs,
      };


      const packet = PacketBuilder.fromAmpState(ampState, 42).build();
      // Packet is 64 bytes
      expect(packet.length).toBe(64);

      // Simulate sending as an AMP_UPDATE packet from amp: 0x1c 0x01 0x05 0x00
      const ampReport = new Uint8Array(packet);
      ampReport[0] = 0x1c;
      ampReport[1] = 0x01;
      ampReport[2] = DspType.AMP;
      ampReport[3] = 0x00;

      const decoded = ProtocolDecoder.decode(ampReport);
      expect(decoded.type).toBe('AMP_UPDATE');
      if (decoded.type === 'AMP_UPDATE') {
        expect(decoded.modelId).toBe(ampState.modelId);
        expect(decoded.cabinetId).toBe(ampState.cabinetId);
        expect(decoded.knobs).toEqual(ampState.knobs);
      }
    });

    it('round-trips EffectState through PacketBuilder and ProtocolDecoder', () => {
      const effectState: EffectState = {
        slot: 2,
        type: DspType.DELAY,
        modelId: EFFECT_MODELS.TAPE_DELAY.id,
        enabled: true,
        knobs: Array.from({ length: 32 }, (_, i) => (i * 11) % 256),
      };

      const packet = PacketBuilder.fromEffectState(effectState, 12).build();
      expect(packet.length).toBe(64);

      // Simulate as EFFECT_UPDATE report: 0x1c 0x01 [type] 0x00
      const fxReport = new Uint8Array(packet);
      fxReport[0] = 0x1c;
      fxReport[1] = 0x01;
      fxReport[2] = effectState.type;
      fxReport[3] = 0x00;

      const decoded = ProtocolDecoder.decode(fxReport);
      expect(decoded.type).toBe('EFFECT_UPDATE');
      if (decoded.type === 'EFFECT_UPDATE') {
        expect(decoded.slot).toBe(2);
        expect(decoded.dspType).toBe(DspType.DELAY);
        expect(decoded.modelId).toBe(effectState.modelId);
        expect(decoded.enabled).toBe(true);
        expect(decoded.knobs).toEqual(effectState.knobs);
      }
    });
  });

  describe('Boundary Values & Parameter Clamping', () => {
    let store: Store;
    let mockProtocol: IProtocol;
    let ampController: AmpController;
    let effectController: EffectController;

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
      ampController = new AmpController(store, mockProtocol);
      effectController = new EffectController(store, mockProtocol);
    });

    it('clamps amp knobs to [0, 255]', async () => {
      await ampController.setAmpKnob(0, -50);
      expect(store.getState().amp.knobs[0]).toBe(0);

      await ampController.setAmpKnob(0, 500);
      expect(store.getState().amp.knobs[0]).toBe(255);
    });

    it('clamps advanced amp settings to [0, 255]', async () => {
      await ampController.setAdvancedSetting('bias', -10);
      expect(store.getState().amp.knobs[10]).toBe(0);

      await ampController.setAdvancedSetting('bias', 300);
      expect(store.getState().amp.knobs[10]).toBe(255);
    });

    it('clamps effect knobs to [0, 255]', async () => {
      // Set an initial effect in slot 0
      store.updateSlotState(0, {
        slot: 0,
        type: DspType.STOMP,
        modelId: EFFECT_MODELS.OVERDRIVE.id,
        enabled: true,
        knobs: new Array(32).fill(100),
      });


      await effectController.setEffectKnob(0, 0, -20);
      expect(store.getState().slots[0]?.knobs[0]).toBe(0);

      await effectController.setEffectKnob(0, 0, 999);
      expect(store.getState().slots[0]?.knobs[0]).toBe(255);
    });
  });

  describe('Protocol Write Queue (Unthrottled Sequential Delivery)', () => {
    it('transmits all rapid updates sequentially without throttling or dropping messages', async () => {
      const sentValues: number[] = [];
      const mockProtocol: IProtocol = {
        isConnected: true,
        isSupported: true,
        connect: vi.fn(),
        disconnect: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getNextSequenceId: vi.fn().mockReturnValue(1),
        sendPacket: vi.fn().mockImplementation(async (packet: Uint8Array) => {
          await Promise.resolve();
          sentValues.push(packet[0]);
        }),
      };

      // Dispatch 5 rapid updates without awaiting between them
      const promises = [10, 20, 30, 40, 50].map(val =>
        enqueueCoalescedWrite(mockProtocol, 'amp', () => new Uint8Array([val])),
      );

      await Promise.all(promises);
      await flushWrites(mockProtocol);

      // All updates must have been transmitted in FIFO order (no messages dropped/throttled)
      expect(sentValues).toEqual([10, 20, 30, 40, 50]);
    });
  });

  describe('Defensive Preset XML Import', () => {
    it('rejects malformed XML strings with an error', async () => {
      const mockProtocol: IProtocol = {
        isConnected: true,
        isSupported: true,
        connect: vi.fn(),
        disconnect: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        sendPacket: vi.fn(),
        getNextSequenceId: vi.fn().mockReturnValue(1),
      };
      const importer = new PresetImporter(mockProtocol);

      await expect(importer.loadXml('<UnclosedTag>Not closed')).rejects.toThrow();
    });

    it('clamps imported 16-bit parameter values to valid 8-bit [0, 255]', async () => {
      const sentPackets: Uint8Array[] = [];
      const mockProtocol: IProtocol = {
        isConnected: true,
        isSupported: true,
        connect: vi.fn(),
        disconnect: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        sendPacket: vi.fn().mockImplementation((data: Uint8Array) => {
          sentPackets.push(new Uint8Array(data));
          return Promise.resolve();
        }),
        getNextSequenceId: vi.fn().mockReturnValue(1),
      };
      const importer = new PresetImporter(mockProtocol);

      // FUSE XML with a 16-bit param value that is out of bounds or negative
      const xml = `
        <Preset>
          <Amplifier>
            <Module ID="0" POS="0" BypassState="0">
              <Param ControlIndex="0">65535</Param>
              <Param ControlIndex="1">-500</Param>
            </Module>
          </Amplifier>
        </Preset>
      `;

      await importer.loadXml(xml);
      expect(sentPackets.length).toBeGreaterThan(0);
      // The dspWrite packet is the first packet
      const dspPacket = sentPackets[0];
      // 65535 >> 8 = 255
      expect(dspPacket[32 + 0]).toBe(255);
      // -500 clamped to 0
      expect(dspPacket[32 + 1]).toBe(0);
    });
  });
});
