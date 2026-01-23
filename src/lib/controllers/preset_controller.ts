import { BaseController } from './base_controller';
import { debug } from '../helpers';
import type { PresetMetadata } from '../index';
import { PacketBuilder } from '../protocol/packet_builder';
import { Protocol } from '../protocol/protocol';
import type { PresetChangeCommand, PresetInfoCommand } from '../protocol/protocol_decoder';
import { PresetImporter } from '../preset_importer';
import type { Store } from '../store';

export class PresetController extends BaseController {
  public onLoad?: (payload: { slot: number; name: string }) => void;
  private importer: PresetImporter;

  constructor(store: Store, protocol: Protocol) {
    super(store, protocol);
    this.importer = new PresetImporter(protocol);
  }

  handlePresetChange(command: PresetChangeCommand): boolean {
    const { slot, name } = command;
    debug(`[DEBUG] PresetController PRESET_CHANGE: ${slot} ${name}`);
    this.store.setPresetActive(slot, name);
    this.onLoad?.({ slot, name });
    return true;
  }

  handlePresetInfo(command: PresetInfoCommand): boolean {
    const { slot, name } = command;
    debug(`[DEBUG] PresetController PRESET_INFO: ${slot} ${name}`);
    this.store.setPresetMetadata(slot, name);
    return true;
  }

  async loadPreset(slot: number): Promise<void> {
    debug(`[PresetController] loadPreset(slot: ${slot})`);
    const packet = PacketBuilder.loadPreset(slot).build();
    await this.protocol.sendPacket(packet);
  }

  async savePreset(slot: number, name: string): Promise<void> {
    debug(`[PresetController] savePreset(slot: ${slot}, name: "${name}")`);
    const packet = PacketBuilder.savePreset(slot, name).build();
    await this.protocol.sendPacket(packet);

    this.store.setPresetActive(slot, name);
    this.onLoad?.({ slot, name });
  }

  async loadXml(xmlString: string): Promise<void> {
    await this.importer.loadXml(xmlString);

    // Trigger state refresh/UI update
    this.onLoad?.({ slot: this.store.getState().currentPresetSlot || 0, name: 'Imported Preset' });
  }

  getPresets(): PresetMetadata[] {
    return Array.from(this.store.getState().presets.values()).sort((a, b) => a.slot - b.slot);
  }

  getPreset(slot: number): PresetMetadata | undefined {
    return this.store.getState().presets.get(slot);
  }
}
