import { DspType, resolveFuseModelId, findAmpModel, findEffectModel } from './models';
import { PacketBuilder } from './protocol/packet_builder';
import { type IProtocol } from './protocol/protocol_interface';
import { enqueueWrite, type PacketFactory } from './protocol/write_queue';
import { AMP_KNOB_INDEX, LIMITS, OFFSETS, VALUES, toByte } from './protocol/constants';
import { normalizeAmpState } from './controllers/amp_controller';
import { normalizeKnobs } from './controllers/effect_controller';
import { type Store, type PresetDetails } from './store';
import { debug } from './helpers';

export class PresetImporter {
  private protocol: IProtocol;
  private store?: Store;

  constructor(protocol: IProtocol, store?: Store) {
    this.protocol = protocol;
    this.store = store;
  }

  async loadXml(xmlString: string): Promise<void> {
    if (!xmlString || typeof xmlString !== 'string') {
      throw new Error('Invalid preset content: empty or not a string');
    }

    debug(`[PresetImporter] loadXml (Length: ${xmlString.length})`);

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML parsing failed: ${parserError.textContent?.slice(0, 100) || 'Malformed XML'}`);
    }

    const beforeSlots = this.store ? [...this.store.getState().slots] : [];
    const importedTypes = new Set<DspType>();
    const usedSlots = new Set<number>();
    const modulePackets: PacketFactory[] = [];

    const applyStoreAndCollectPackets = () => {
      this.store?.clearAllSlots();

      // Parse preset info / metadata if present in the FUSE XML (resetting stale metadata if absent)
      const infoNode = doc.querySelector('Info');
      if (this.store) {
        const details: PresetDetails = infoNode
          ? {
              author: infoNode.getAttribute('author') || undefined,
              description: infoNode.textContent?.trim() || undefined,
              tags: infoNode.getAttribute('tags') || undefined,
              genre1: infoNode.getAttribute('genre1') || undefined,
              genre2: infoNode.getAttribute('genre2') || undefined,
              genre3: infoNode.getAttribute('genre3') || undefined,
            }
          : {};
        this.store.replacePresetDetails(details);
      }

      modulePackets.push(
        ...this.collectModulePackets(doc, 'Amplifier', DspType.AMP, importedTypes, usedSlots),
        ...this.collectModulePackets(doc, 'FX Stompbox', DspType.STOMP, importedTypes, usedSlots),
        ...this.collectModulePackets(doc, 'FX Modulation', DspType.MOD, importedTypes, usedSlots),
        ...this.collectModulePackets(doc, 'FX Delay', DspType.DELAY, importedTypes, usedSlots),
        ...this.collectModulePackets(doc, 'FX Reverb', DspType.REVERB, importedTypes, usedSlots),
      );
    };

    if (this.store) {
      this.store.batch(applyStoreAndCollectPackets);
    } else {
      applyStoreAndCollectPackets();
    }

    const clearPackets: PacketFactory[] = [];
    for (const oldEff of beforeSlots) {
      if (!oldEff || importedTypes.has(oldEff.type)) continue;
      clearPackets.push(
        () =>
          PacketBuilder.dspWrite(oldEff.type, this.protocol.getNextSequenceId())
            .setByte(OFFSETS.SLOT_INDEX, oldEff.slot)
            .setByte(OFFSETS.BYPASS, VALUES.BYPASSED)
            .build(),
        () => PacketBuilder.applyChange(oldEff.type, this.protocol.getNextSequenceId()).build(),
      );
    }

    const packets = [...clearPackets, ...modulePackets];
    if (packets.length > 0) {
      await enqueueWrite(this.protocol, ...packets);
    }
  }

  /**
   * Export current in-memory Store state into a FUSE-compatible XML string (.fuse).
   */
  exportXml(presetName = 'Custom Preset'): string {
    if (!this.store) {
      throw new Error('Store is required to export preset XML');
    }
    const state = this.store.getState();
    const ampModel = findAmpModel(state.amp.modelId);
    const ampFuseId = ampModel?.fuseIds?.[0] ?? state.amp.modelId;

    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const formatParams = (knobs: number[]) =>
      knobs
        .map((val, idx) => `      <Param ControlIndex="${idx}">${(toByte(val) << 8) | toByte(val)}</Param>`)
        .join('\n');

    const formatEffectGroup = (tagName: string, dspType: DspType) => {
      const matching = state.slots.filter((s): s is NonNullable<typeof s> => s !== null && s.type === dspType);
      if (matching.length === 0) {
        return `    <${tagName} />`;
      }
      const modulesXml = matching
        .map(eff => {
          const model = findEffectModel(eff.modelId);
          const fuseId = model?.fuseIds?.[0] ?? eff.modelId;
          const bypass = eff.enabled ? 0 : 1;
          return [
            `      <Module ID="${fuseId}" POS="${eff.slot}" BypassState="${bypass}">`,
            formatParams(eff.knobs),
            '      </Module>',
          ].join('\n');
        })
        .join('\n');
      return `    <${tagName}>\n${modulesXml}\n    </${tagName}>`;
    };

    const details = state.presetDetails;
    const authorAttr = details.author ? ` author="${escapeXml(details.author)}"` : '';
    const tagsAttr = details.tags ? ` tags="${escapeXml(details.tags)}"` : '';
    const g1Attr = details.genre1 ? ` genre1="${escapeXml(details.genre1)}"` : '';
    const g2Attr = details.genre2 ? ` genre2="${escapeXml(details.genre2)}"` : '';
    const g3Attr = details.genre3 ? ` genre3="${escapeXml(details.genre3)}"` : '';
    const descContent = details.description ? escapeXml(details.description) : '';

    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<Preset name="${escapeXml(presetName)}" amplifier="Mustang" productId="1">`,
      '  <Amplifier>',
      `    <Module ID="${ampFuseId}" POS="0" BypassState="0">`,
      formatParams(state.amp.knobs),
      '    </Module>',
      '  </Amplifier>',
      '  <FX>',
      formatEffectGroup('Stompbox', DspType.STOMP),
      formatEffectGroup('Modulation', DspType.MOD),
      formatEffectGroup('Delay', DspType.DELAY),
      formatEffectGroup('Reverb', DspType.REVERB),
      '  </FX>',
      `  <Info name="${escapeXml(presetName)}"${authorAttr}${tagsAttr}${g1Attr}${g2Attr}${g3Attr}>${descContent}</Info>`,
      '</Preset>',
    ].join('\n');
  }

  private collectModulePackets(
    doc: Document,
    selector: string,
    type: DspType,
    importedTypes: Set<DspType>,
    usedSlots: Set<number>,
  ): PacketFactory[] {
    const container = doc.querySelector(selector);
    if (!container) return [];

    const packets: PacketFactory[] = [];
    const modules = container.querySelectorAll('Module');
    for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
      const m = modules[i];
      if (!m) continue;
      if (importedTypes.has(type)) break;

      const parsedFuseId = parseInt(m.getAttribute('ID') || '0', 10);
      const fuseId = isNaN(parsedFuseId) ? 0 : parsedFuseId;

      const rawPos = parseInt(m.getAttribute('POS') || '0', 10);
      const maxPos = type === DspType.STOMP ? LIMITS.GROUP_SIZE - 1 : LIMITS.SLOT_COUNT - 1;
      let pos = isNaN(rawPos) ? 0 : Math.max(0, Math.min(maxPos, rawPos));

      const rawBypass = parseInt(m.getAttribute('BypassState') || '0', 10);
      const bypass = rawBypass === 1 ? 1 : 0; // 1=Off, 0=On

      let modelId = 0;
      if (fuseId !== 0 || type === DspType.AMP) {
        modelId = resolveFuseModelId(fuseId, type) || 0;
        if (!modelId) continue;
      } else {
        continue;
      }

      if (type !== DspType.AMP) {
        if (usedSlots.has(pos)) {
          const groupBase = pos < LIMITS.GROUP_SIZE ? 0 : LIMITS.GROUP_SIZE;
          for (let offset = 0; offset < LIMITS.GROUP_SIZE; offset++) {
            const candidate = groupBase + offset;
            if (!usedSlots.has(candidate)) {
              pos = candidate;
              break;
            }
          }
        }
        usedSlots.add(pos);
      }
      importedTypes.add(type);

      const buffer = new Uint8Array(64);
      buffer[16] = (modelId >> 8) & 0xff;
      buffer[17] = modelId & 0xff;
      buffer[18] = pos;
      buffer[22] = bypass;

      const knobs = new Array<number>(LIMITS.KNOB_COUNT).fill(0);
      const params = m.querySelectorAll('Param');
      for (let j = 0; j < params.length; j++) {
        const p = params[j];
        const rawIndex = parseInt(p.getAttribute('ControlIndex') || '0', 10);
        if (isNaN(rawIndex) || rawIndex < 0 || rawIndex >= LIMITS.KNOB_COUNT) continue;

        const val16 = parseInt(p.textContent || '0', 10);
        const safeVal16 = isNaN(val16) ? 0 : val16;
        const val8 = Math.max(0, Math.min(255, safeVal16 >> 8));

        knobs[rawIndex] = val8;
        if (32 + rawIndex < 64) {
          buffer[32 + rawIndex] = val8;
        }
      }

      // Synchronize local Store state so the UI reflects imported settings immediately
      if (this.store) {
        if (type === DspType.AMP) {
          this.store.updateAmpState(
            normalizeAmpState({
              modelId,
              enabled: bypass === 0,
              cabinetId: knobs[AMP_KNOB_INDEX.cabinet] ?? 0,
              knobs,
            }),
          );
        } else {
          this.store.updateSlotState(pos, {
            slot: pos,
            type,
            modelId,
            enabled: bypass === 0,
            knobs: normalizeKnobs(knobs),
          });
        }
      }

      packets.push(
        () =>
          PacketBuilder.dspWrite(type, this.protocol.getNextSequenceId()).addBytes(16, buffer.slice(16, 64)).build(),
        () => PacketBuilder.applyChange(type, this.protocol.getNextSequenceId()).build(),
      );
    }

    return packets;
  }
}
