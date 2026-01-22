import { AMP_MODELS, EFFECT_MODELS, DspType } from './models';
import { PacketBuilder } from './packet_builder';
import { FuseProtocol, OPCODES } from './protocol';
import { debug } from './helpers';

// ID Mapping from Fuse XML to Firmware IDs
// prettier-ignore
const ID_MAP: Record<number, number> = {
  // Standard Amps
  0: 0x6700, 1: 0x6400, 2: 0x7c00, 3: 0x5300, 4: 0x6a00, 5: 0x7500,
  6: 0x7200, 7: 0x6100, 8: 0x7900, 9: 0x5e00, 10: 0x5d00, 11: 0x6d00,
  // V2 Amps
  100: 0xf100, 101: 0xf600, 102: 0xf900, 103: 0xff00, 104: 0xfc00,
  105: 0x5300, 106: 0x6a00, 107: 0x7500, 108: 0x7200,
  // Stomps (Legacy)
  19: 0x3c00, 20: 0x4900, 21: 0x4a00, 22: 0x1a00, 23: 0x1c00, 24: 0x0700, 25: 0x8800,
  // V2 Stomps
  109: 0x0301, 110: 0xba00, 111: 0x1001, 112: 0x1101, 113: 0x0f01,
  // Mods, Delays, Reverbs
  26: 0x1200, 27: 0x1300, 28: 0x1800, 29: 0x1900, 30: 0x2d00, 31: 0x4000,
  32: 0x4100, 33: 0x2200, 34: 0x2900, 35: 0x4f00, 36: 0x1f00,
  37: 0x1600, 38: 0x2b00, 39: 0x1500, 40: 0x4600, 41: 0x4800,
  42: 0x2400, 43: 0x3a00, 44: 0x2600, 45: 0x3b00, 46: 0x4e00, 47: 0x4b00,
  48: 0x4c00, 49: 0x4d00, 50: 0x2100, 51: 0x0b00
};

export class PresetImporter {
  private protocol: FuseProtocol;

  constructor(protocol: FuseProtocol) {
    this.protocol = protocol;
  }

  async loadXml(xmlString: string): Promise<void> {
    debug(`[PresetImporter] loadXml (Length: ${xmlString.length})`);

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // We process modules and send raw buffers.
    await this.processModule(doc, 'Amplifier', DspType.AMP);
    await this.processModule(doc, 'FX Stompbox', DspType.STOMP);
    await this.processModule(doc, 'FX Modulation', DspType.MOD);
    await this.processModule(doc, 'FX Delay', DspType.DELAY);
    await this.processModule(doc, 'FX Reverb', DspType.REVERB);
  }

  private async processModule(doc: Document, selector: string, type: DspType) {
    const container = doc.querySelector(selector);
    if (!container) return;

    const modules = container.querySelectorAll('Module');
    for (let i = 0; i < 8; i++) {
      const m = modules[i];
      if (!m) continue;
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
      const fullPacket = new Uint8Array(64);
      fullPacket[0] = OPCODES.DATA_PACKET;
      fullPacket[1] = OPCODES.DATA_WRITE;
      fullPacket[2] = type;
      fullPacket[6] = this.protocol.getNextSequenceId();
      fullPacket[7] = 0x01;

      // Copy our data payload (bytes 16..63)
      for (let k = 16; k < 64; k++) fullPacket[k] = buffer[k];

      await this.protocol.sendPacket(fullPacket);

      // Apply
      const applyPacket = PacketBuilder.applyChange(type, this.protocol.getNextSequenceId()).build();
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
}
