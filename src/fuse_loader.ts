import { FuseAPI } from "./api";
import { EFFECT_MODELS, AMP_MODELS, DspType } from "./constants";

export class FuseLoader {
  private api: FuseAPI;

  constructor(api: FuseAPI) {
    this.api = api;
  }

  public async loadPreset(xmlString: string) {
    if (!this.api.isConnected) throw new Error("Amp not connected");

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");

    console.log("FuseLoader: Parsing preset...");
    await this.parseAmp(doc);
    await this.parseEffects(doc);
    console.log("FuseLoader: Preset loaded.");
  }

  private async parseAmp(doc: Document) {
    const module = doc.querySelector("Amplifier Module");
    if (!module) return;

    const fuseId = parseInt(module.getAttribute("ID") || "0");
    const modelId = this.resolveAmpId(fuseId);

    if (modelId) {
      console.log(`FuseLoader: Amp ID ${fuseId} -> 0x${modelId.toString(16)}`);
      await this.api.setAmpModel(modelId);

      const params = module.querySelectorAll("Param");
      for (let i = 0; i < params.length; i++) {
        const p = params[i];
        const index = parseInt(p.getAttribute("ControlIndex") || "0");
        const val16 = parseInt(p.textContent || "0");
        const val8 = this.scaleValue(val16);

        if (index < FuseLoader.AMP_PARAM_MAP.length) {
          const offset = FuseLoader.AMP_PARAM_MAP[index];
          // Special handling for Bright Switch (52)
          if (offset === 52) {
            await this.api.setAmpParameter(offset, val8 > 127 ? 1 : 0);
          } else {
            await this.api.setAmpParameter(offset, val8);
          }
        }
      }
    } else {
      console.warn(`FuseLoader: Unknown Amp ID ${fuseId}`);
    }
  }

  private async parseEffects(doc: Document) {
    const categories = ["Stompbox", "Modulation", "Delay", "Reverb"];

    for (const cat of categories) {
      const module = doc.querySelector(`FX ${cat} Module`);
      if (module) {
        const fuseId = parseInt(module.getAttribute("ID") || "0");
        const pos = parseInt(module.getAttribute("POS") || "0");
        // XML: BypassState="1" -> Bypassed (Off). We want Enabled.
        const bypassState = parseInt(module.getAttribute("BypassState") || "0");
        const enabled = bypassState === 0;

        if (pos < 0 || pos > 7) continue;

        if (fuseId !== 0) {
          const modelId = this.resolveEffectId(fuseId);
          if (modelId) {
            console.log(
              `FuseLoader: ${cat} ID ${fuseId} -> 0x${modelId.toString(16)} (Slot ${pos})`
            );
            await this.api.setEffect(pos, modelId);

            const params = module.querySelectorAll("Param");
            for (let i = 0; i < params.length; i++) {
              const p = params[i];
              const index = parseInt(p.getAttribute("ControlIndex") || "0");
              const val16 = parseInt(p.textContent || "0");
              const val8 = this.scaleValue(val16);

              if (index < 7) {
                await this.api.setEffectKnob(pos, index, val8);
              }
            }

            await this.api.setEffectEnabled(pos, enabled);
          } else {
            console.warn(`FuseLoader: Unknown Effect ID ${fuseId}`);
          }
        } else {
          await this.api.removeEffect(pos);
        }
      }
    }
  }

  // --- ID Resolution Logic ---

  private resolveAmpId(fuseId: number): number | null {
    // 1. Check Standard Amp Map
    if (FuseLoader.AMP_ID_MAP[fuseId]) {
      return FuseLoader.AMP_ID_MAP[fuseId];
    }
    // 2. Check Direct Hex Match (High Byte strategy)
    // e.g. ID 117 -> 0x75 -> 0x7500
    const directId = fuseId << 8;
    const exists = Object.values(AMP_MODELS).some((m) => m.id === directId);
    if (exists) return directId;

    return null;
  }

  private resolveEffectId(fuseId: number): number | null {
    // 1. Check Standard Effect Map
    if (FuseLoader.FX_ID_MAP[fuseId]) {
      return FuseLoader.FX_ID_MAP[fuseId];
    }
    // 2. Check Direct Hex Match (High Byte strategy)
    // e.g. ID 7 -> 0x07 -> 0x0700 (Compressor)
    // e.g. ID 11 -> 0x0B -> 0x0B00 ('65 Spring)
    const directId = fuseId << 8;
    const exists = Object.values(EFFECT_MODELS).some((m) => m.id === directId);
    if (exists) return directId;

    return null;
  }

  private scaleValue(val16: number): number {
    return Math.floor(val16 / 256);
  }

  // --- Static Maps ---

  private static readonly AMP_PARAM_MAP: number[] = [
    32, 33, 34, 35, 36, 37, 38, 39, 41, 42, 45, 48, 49, 51, 52, 42, 45, 48, 49,
    51, 52,
  ];

  private static readonly AMP_ID_MAP: Record<number, number> = {
    // Standard V1 FUSE IDs
    0: 0x6700, 1: 0x6400, 2: 0x7c00, 3: 0x5300, 4: 0x6a00, 5: 0x7500,
    6: 0x7200, 7: 0x6100, 8: 0x7900, 9: 0x5e00, 10: 0x5d00, 11: 0x6d00,

    // V2 Expansion IDs (Standard FUSE numbering)
    100: 0xf100, // Studio Preamp
    101: 0xf600, // '57 Twin
    102: 0xf900, // '60s Thrift
    103: 0xff00, // British Watts
    104: 0xfc00, // British Colour

    // Alternate FUSE V2 re-mappings (Used in some factory presets)
    105: 0x5300, // '65 Deluxe
    106: 0x6a00, // '65 Princeton
    107: 0x7500, // '65 Twin
    108: 0x7200, // Super-Sonic

    // High-Byte / Decimal Format (ID 117 format)
    117: 0x7500, // '65 Twin
    241: 0xf100, // Studio Preamp
    246: 0xf600, // '57 Twin
    249: 0xf900, // '60s Thrift
    252: 0xfc00, // British Colour
    255: 0xff00  // British Watts
};

  // Standard FUSE Effect IDs (Legacy)
  private static readonly FX_ID_MAP: Record<number, number> = {
    // Stomps (Legacy IDs)
    19: 0x3c00,
    20: 0x4900,
    21: 0x4a00,
    22: 0x1a00,
    23: 0x1c00,
    24: 0x0700,
    25: 0x8800,
    // V2 Stomps
    109: 0x0301,
    110: 0xba00,
    111: 0x1001,
    112: 0x1101,
    113: 0x0f01,

    // Mods
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

    // Delays
    37: 0x1600,
    38: 0x2b00,
    39: 0x1500,
    40: 0x4600,
    41: 0x4800,

    // Reverbs
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

    // V2 Stomps (Decimal IDs found in FUSE XML)
    259: 0x0301, // Ranger Boost (0x0103 -> 259)
    272: 0x1001, // Orange Box   (0x0110 -> 272)
    273: 0x1101, // Black Box    (0x0111 -> 273)
    271: 0x0f01, // Big Fuzz     (0x010F -> 271)
    186: 0xba00, // Green Box    (0x00BA -> 186)

    // Standard FUSE V2 re-mappings
    105: 0x0301, 107: 0x1001,
  };
}
