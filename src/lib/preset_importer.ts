import {
  DspType,
  clampEffectKnob,
  findAmpModel,
  findEffectModel,
  getEffectKnobSpec,
  getFuseXmlId,
  resolveFuseModelId,
} from './models';
import { getModelDefault } from './defaults';
import { PacketBuilder } from './protocol/packet_builder';
import { type IProtocol } from './protocol/protocol_interface';
import { cancelCoalescedWrite, enqueueWrite, type PacketFactory } from './protocol/write_queue';
import { AMP_KNOB_INDEX, LIMITS, OFFSETS, clampAmpKnob, toByte } from './protocol/constants';
import { normalizeAmpState } from './controllers/amp_controller';
import { normalizeKnobs } from './controllers/effect_controller';
import { type EffectState, type PresetDetails, type Store } from './store';
import { debug } from './helpers';

/**
 * Amplifier `.fuse` XML ControlIndex values stored as unshifted raw integers
 * (bytes 44..53 in the amp packet: model metadata, noise gate, threshold, cabinet, sag, brightness).
 */
const AMP_RAW_XML_INDICES = new Set<number>([12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);

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

    if (typeof DOMParser === 'undefined') {
      throw new Error('XML parsing is not supported in this environment (DOMParser unavailable)');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML parsing failed: ${parserError.textContent?.slice(0, 100) || 'Malformed XML'}`);
    }

    const rootTag = doc.documentElement?.tagName;
    const hasRecognizedSection = Boolean(doc.querySelector('Amplifier, FX'));
    if (rootTag !== 'Preset' && rootTag !== 'FenderPreset' && !hasRecognizedSection) {
      throw new Error('Invalid preset XML: missing Fender FUSE Preset, Amplifier, or FX section');
    }

    const previousState = this.store ? this.store.getState() : null;
    const beforeSlots = previousState ? [...previousState.slots] : [];
    const importedTypes = new Set<DspType>();
    const usedSlots = new Set<number>();
    const modulePackets: PacketFactory[] = [];

    cancelCoalescedWrite(this.protocol);

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
        () => PacketBuilder.clearEffect(oldEff.type, oldEff.slot).build(),
        () => PacketBuilder.applyChange(oldEff.type, this.protocol.getNextSequenceId()).build(),
      );
    }

    const packets = [...clearPackets, ...modulePackets];
    if (packets.length > 0) {
      try {
        await enqueueWrite(this.protocol, ...packets);
      } catch (err) {
        if (this.store && previousState) {
          this.store.batch(() => {
            this.store!.updateAmpState(previousState.amp);
            for (let i = 0; i < LIMITS.SLOT_COUNT; i++) {
              this.store!.updateSlotState(i, beforeSlots[i]);
            }
            this.store!.replacePresetDetails(previousState.presetDetails);
          });
        }
        throw err;
      }
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
    const ampFuseId = ampModel ? getFuseXmlId(ampModel) : state.amp.modelId;

    const escapeXml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const ampKnobs = [...state.amp.knobs];
    ampKnobs[AMP_KNOB_INDEX.cabinet] = state.amp.cabinetId;
    if (ampModel?.ampMeta) {
      ampKnobs[8] = ampModel.ampMeta.b40;
      ampKnobs[11] = ampModel.ampMeta.b43;
      ampKnobs[12] = ampModel.ampMeta.num;
      ampKnobs[13] = ampModel.ampMeta.num;
      ampKnobs[14] = ampModel.ampMeta.num;
      ampKnobs[18] = ampModel.ampMeta.num;
      ampKnobs[21] = 0x01;
      ampKnobs[22] = ampModel.ampMeta.b54;
    }

    const formatAmpParams = (knobs: number[]) =>
      knobs
        .map((val, idx) => {
          const byte = toByte(val);
          const encoded = AMP_RAW_XML_INDICES.has(idx) ? byte : (byte << 8) | byte;
          return `      <Param ControlIndex="${idx}">${encoded}</Param>`;
        })
        .join('\n');

    const formatEffectParams = (knobs: number[]) =>
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
          const fuseId = model ? getFuseXmlId(model) : eff.modelId;
          const bypass = eff.enabled ? 0 : 1;
          return [
            `      <Module ID="${fuseId}" POS="${eff.slot}" BypassState="${bypass}">`,
            formatEffectParams(eff.knobs),
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
      formatAmpParams(ampKnobs),
      '    </Module>',
      '  </Amplifier>',
      '  <FX>',
      formatEffectGroup('Stompbox', DspType.STOMP),
      formatEffectGroup('Modulation', DspType.MOD),
      formatEffectGroup('Delay', DspType.DELAY),
      formatEffectGroup('Reverb', DspType.REVERB),
      '  </FX>',
      '  <FUSE>',
      `    <Info name="${escapeXml(presetName)}"${authorAttr}${tagsAttr}${g1Attr}${g2Attr}${g3Attr}>${descContent}</Info>`,
      '  </FUSE>',
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

      // Seed knobs from model defaults so omitted metadata / unused bytes match real hardware
      const defaults = getModelDefault(modelId);
      const knobs = defaults
        ? Array.from(defaults.slice(OFFSETS.KNOB_START, OFFSETS.KNOB_END))
        : new Array<number>(LIMITS.KNOB_COUNT).fill(0);

      const params = m.querySelectorAll('Param');
      for (let j = 0; j < params.length; j++) {
        const p = params[j];
        const rawIndex = parseInt(p.getAttribute('ControlIndex') || '0', 10);
        if (isNaN(rawIndex) || rawIndex < 0 || rawIndex >= LIMITS.KNOB_COUNT) continue;

        const val16 = parseInt(p.textContent || '0', 10);
        const safeVal16 = isNaN(val16) ? 0 : val16;

        let val8: number;
        if (type === DspType.AMP) {
          // Real Fender FUSE / offa/plug XML stores discrete/meta ControlIndex 12..21 as raw integers
          // (accept shifted values > 255 for backwards compatibility with older exports)
          const decoded = AMP_RAW_XML_INDICES.has(rawIndex) && safeVal16 <= 255 ? safeVal16 : safeVal16 >> 8;
          val8 = clampAmpKnob(rawIndex, decoded);
        } else {
          const spec = getEffectKnobSpec(modelId, rawIndex);
          const decoded = spec && safeVal16 >= (spec.min ?? 0) && safeVal16 <= spec.max ? safeVal16 : safeVal16 >> 8;
          val8 = clampEffectKnob(modelId, rawIndex, decoded);
        }

        knobs[rawIndex] = val8;
      }

      if (type === DspType.AMP) {
        const ampState = normalizeAmpState({
          modelId,
          // Amplifiers cannot be bypassed on Mustang hardware (FUSE / offa/plug even write BypassState="1")
          enabled: true,
          cabinetId: knobs[AMP_KNOB_INDEX.cabinet] ?? 0,
          knobs,
        });
        this.store?.updateAmpState(ampState);
        packets.push(
          () => PacketBuilder.fromAmpState(ampState, this.protocol.getNextSequenceId()).build(),
          () => PacketBuilder.applyChange(type, this.protocol.getNextSequenceId()).build(),
        );
      } else {
        const effectState: EffectState = {
          slot: pos,
          type,
          modelId,
          enabled: bypass === 0,
          knobs: normalizeKnobs(knobs, modelId),
        };
        this.store?.updateSlotState(pos, effectState);
        packets.push(
          () => PacketBuilder.fromEffectState(effectState, this.protocol.getNextSequenceId()).build(),
          () => PacketBuilder.applyChange(type, this.protocol.getNextSequenceId()).build(),
        );
      }
    }

    return packets;
  }
}
