import { BaseController } from './base_controller';
import { debug } from '../helpers';
import type { PresetMetadata } from '../api';
import { PacketBuilder } from '../packet_builder';

import { FuseProtocol, OPCODES } from '../protocol';
import { AMP_MODELS, EFFECT_MODELS, DspType } from '../models';
import { PacketParser } from '../parser';

export type PresetEvents = {
  loaded: { slot: number; name: string };
};

// ID Mapping from Fuse XML to Firmware IDs
const ID_MAP: Record<number, number> = {
  0: 0x6700,
  1: 0x6400,
  2: 0x7c00,
  3: 0x5300,
  4: 0x6a00,
  5: 0x7500,
  6: 0x7200,
  7: 0x6100,
  8: 0x7900,
  9: 0x5e00,
  10: 0x5d00,
  11: 0x6d00,
  100: 0xf100,
  101: 0xf600,
  102: 0xf900,
  103: 0xff00,
  104: 0xfc00,
  105: 0x5300,
  106: 0x6a00,
  107: 0x7500,
  108: 0x7200,
  19: 0x3c00,
  20: 0x4900,
  21: 0x4a00,
  22: 0x1a00,
  23: 0x1c00,
  24: 0x0700,
  25: 0x8800,
  109: 0x0301,
  110: 0xba00,
  111: 0x1001,
  112: 0x1101,
  113: 0x0f01,
  26: 0x1200,
  27: 0x1300,
  28: 0x1800,
  29: 0x1900,
  30: 0x2d00,
  31: 0x4000,
  32: 0x4100,
  33: 0x2200,
  34: 0x2900,
  35: 0x4f00,
  36: 0x1f00,
  37: 0x1600,
  38: 0x2b00,
  39: 0x1500,
  40: 0x4600,
  41: 0x4800,
  42: 0x2400,
  43: 0x3a00,
  44: 0x2600,
  45: 0x3b00,
  46: 0x4e00,
  47: 0x4b00,
  48: 0x4c00,
  49: 0x4d00,
  50: 0x2100,
  51: 0x0b00,
};

export class PresetController extends BaseController<PresetEvents> {
  process(data: Uint8Array): boolean {
    const b0 = data[0];
    const b1 = data[1];

    // Check for Data Packet (0x1c)
    // Only process READ (Input) packets to avoid echoes from our own writes
    if (b0 === OPCODES.DATA_PACKET && b1 === OPCODES.DATA_READ) {
      const type = data[2];
      console.log('[DEBUG] PresetController packet:', b0, b1, type);

      if (type === OPCODES.PRESET_INFO || type === 0x00) {
        const presetInfo = PacketParser.parsePresetInfo(data);
        console.log('[DEBUG] PresetInfo:', presetInfo);

        if (presetInfo) {
          const { slot, name } = presetInfo;

          // Should we update store?
          // Only if generic? Or always?
          // Old logic: if (data[3] === 0x00) -> setPreset
          if (data[3] === 0x00) {
            if (type === 0x00) {
              this.store.setPresetActive(slot, name);
              this.emit('loaded', { slot, name });
            } else if (type === OPCODES.PRESET_INFO) {
              // 0x04
              this.store.setPresetMetadata(slot, name);
            }
          }
          return true;
        }
      }
    }
    return false;
  }

  async loadPreset(slot: number): Promise<void> {
    debug(`[PresetController] loadPreset(slot: ${slot})`);
    const packet = PacketBuilder.loadPreset(slot).build();
    await this.protocol.sendPacket(packet);

    // We rely on the hardware response to update the store and emit events?
    // Usually the hardware replies with the preset name packet which triggers 'loaded'.
  }

  async savePreset(slot: number, name: string): Promise<void> {
    debug(`[PresetController] savePreset(slot: ${slot}, name: "${name}")`);
    const packet = PacketBuilder.savePreset(slot, name).build();
    await this.protocol.sendPacket(packet);

    // Update Store
    this.store.setPresetActive(slot, name);
    this.emit('loaded', { slot, name });
  }

  async loadXml(xmlString: string): Promise<void> {
    debug(`[PresetController] loadXml (Length: ${xmlString.length})`);

    // Safety check: clear current effects to avoid ghosting
    // We access other controllers via `api`? No, BaseController doesn't have reference to sibling controllers.
    // BUT we have access to Protocol + Store.
    // To clear effects, we need to send clear packets.
    // Ideally we should use the EffectController for this, but we don't have it here.
    // We can replicate the logic: Send 0x1C 0x03 [Type] ... 0x00 modelId?

    // Or we leave "clearing" to the caller? The original FuseLoader called `api.clearEffect(i)`.
    // Let's assume WE are responsible for sending the raw clear packets.
    for (let i = 0; i < 8; i++) {
      // Clear effect at slot i (Model ID 0)
      // Effect packet with Model 0?
      // Actually, let's just use empty buffer writes for now or skip clearing if not essential?
      // FuseLoader did: `api.clearEffect(i)`.
      // We can manually clear:
      // const clearPacket = this.protocol.createDspPacket({ type: DspType.STOMP /* unknown */, slot: i, modelId: 0 });
      // But we don't know the type at slot i easily without checking store.
      // Let's try to just overwrite.
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // We process modules and send raw buffers.
    await this.processModule(doc, 'Amplifier', DspType.AMP);
    await this.processModule(doc, 'FX Stompbox', DspType.STOMP);
    await this.processModule(doc, 'FX Modulation', DspType.MOD);
    await this.processModule(doc, 'FX Delay', DspType.DELAY);
    await this.processModule(doc, 'FX Reverb', DspType.REVERB);

    // Trigger state refresh/UI update
    // The previous loader emitted 'state-changed' on api.
    // We can emit 'loaded'?
    this.emit('loaded', { slot: this.store.getState().currentPresetSlot || 0, name: 'Imported Preset' });
  }

  private async processModule(doc: Document, selector: string, type: DspType) {
    const container = doc.querySelector(selector);
    if (!container) return;

    const modules = container.querySelectorAll('Module');
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i];
      const fuseId = parseInt(m.getAttribute('ID') || '0');
      const pos = parseInt(m.getAttribute('POS') || '0');
      const bypass = parseInt(m.getAttribute('BypassState') || '0'); // 1=Off

      let modelId = 0;
      if (fuseId !== 0) {
        modelId = this.resolveId(fuseId, type)!;
        if (!modelId) continue;
      }

      const buffer = new Uint8Array(64);
      buffer[16] = (modelId >> 8) & 0xff;
      buffer[17] = modelId & 0xff;
      buffer[18] = pos;
      buffer[22] = bypass;

      const params = m.querySelectorAll('Param');
      for (let j = 0; j < params.length; j++) {
        const p = params[j];
        const index = parseInt(p.getAttribute('ControlIndex') || '0');
        const val16 = parseInt(p.textContent || '0');
        const val8 = val16 >> 8;

        if (32 + index < 64) {
          buffer[32 + index] = val8;
        }
      }

      // Send Buffer via Protocol
      // We need to construct the Header ourselves since we are bypassing specific Controllers
      // Header: 0x1c 0x03 [Type]
      // We can use protocol.createDspPacket but we built the buffer manually above.

      const fullPacket = new Uint8Array(64);
      fullPacket[0] = OPCODES.DATA_PACKET;
      fullPacket[1] = OPCODES.DATA_WRITE;
      fullPacket[2] = type;
      fullPacket[6] = this.protocol.getNextSequenceId();
      fullPacket[7] = 0x01;

      // Copy our data payload (bytes 16..63)
      for (let k = 16; k < 64; k++) fullPacket[k] = buffer[k];

      await this.protocol.sendPacket(fullPacket);

      // Apply?
      const applyPacket = this.protocol.createApplyPacket(type);
      await this.protocol.sendPacket(applyPacket);
    }
  }

  private resolveId(fuseId: number, type: DspType): number | null {
    if (ID_MAP[fuseId]) return ID_MAP[fuseId];

    // Check repos
    const high = fuseId << 8;
    const repo = type === DspType.AMP ? AMP_MODELS : EFFECT_MODELS;
    if (Object.values(repo).some(m => m.id === high)) return high;

    const lowByte = fuseId & 0xff;
    const highByte = (fuseId >> 8) & 0xff;
    const swapped = (lowByte << 8) | highByte;
    if (Object.values(repo).some(m => m.id === swapped)) return swapped;

    return null;
  }

  getPresets(): PresetMetadata[] {
    return Array.from(this.store.getState().presets.values()).sort((a, b) => a.slot - b.slot);
  }

  getPreset(slot: number): PresetMetadata | undefined {
    return this.store.getState().presets.get(slot);
  }
}
