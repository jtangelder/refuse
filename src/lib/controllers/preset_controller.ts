import { debug } from '../helpers';
import type { PresetMetadata } from '../index';
import { PacketBuilder } from '../protocol/packet_builder';
import { LIMITS } from '../protocol/constants';
import { type PresetChangeCommand, type PresetInfoCommand } from '../protocol/protocol_decoder';

import { BaseController } from './base_controller';

export class PresetController extends BaseController {
  public onLoad?: (payload: { slot: number; name: string }) => void;

  handlePresetChange(command: PresetChangeCommand): boolean {
    const { slot, name } = command;
    debug(`[PresetController] PRESET_CHANGE: ${slot} ${name}`);
    this.store.setPresetActive(slot, name);
    this.onLoad?.({ slot, name });
    return true;
  }

  handlePresetInfo(command: PresetInfoCommand): boolean {
    const { slot, name } = command;
    debug(`[PresetController] PRESET_INFO: ${slot} ${name}`);
    this.store.setPresetMetadata(slot, name);
    return true;
  }

  async loadPreset(slot: number): Promise<void> {
    assertPresetSlot(slot);
    debug(`[PresetController] loadPreset(${slot})`);
    await this.transmit(() => PacketBuilder.loadPreset(slot).build());
  }

  async savePreset(slot: number, name: string): Promise<void> {
    assertPresetSlot(slot);
    const cleanName = sanitizePresetName(name);
    if (!cleanName) throw new Error('Preset name must not be empty');
    debug(`[PresetController] savePreset(${slot}, "${cleanName}")`);

    await this.transmit(() => PacketBuilder.savePreset(slot, cleanName).build());
    this.store.setPresetActive(slot, cleanName);
    this.onLoad?.({ slot, name: cleanName });
  }

  getPresets(): PresetMetadata[] {
    return Array.from(this.store.getState().presets.values()).sort((a, b) => a.slot - b.slot);
  }

  getPreset(slot: number): PresetMetadata | undefined {
    return this.store.getState().presets.get(slot);
  }
}

function assertPresetSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot > LIMITS.MAX_PRESET_SLOT) {
    throw new Error(`Invalid preset slot: ${slot}`);
  }
}

/** Strip control characters and surrounding whitespace; the amp displays raw bytes. */
export function sanitizePresetName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
}
