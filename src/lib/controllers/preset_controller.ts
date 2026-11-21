import { debug } from '../helpers';
import type { PresetMetadata } from '../index';
import { PacketBuilder, truncateUtf8String } from '../protocol/packet_builder';
import { LIMITS, isValidPresetSlot } from '../protocol/constants';
import {
  type PresetAckCommand,
  type PresetChangeCommand,
  type PresetInfoCommand,
} from '../protocol/protocol_decoder';

import { BaseController } from './base_controller';

export class PresetController extends BaseController {
  public onLoad?: (payload: { slot: number; name: string }) => void;
  private _lastRefreshPresetSlot?: number;

  public get lastRefreshPresetSlot(): number | undefined {
    return this._lastRefreshPresetSlot;
  }

  public resetRefreshTracking(): void {
    this._lastRefreshPresetSlot = undefined;
  }

  handlePresetChange(command: PresetChangeCommand): boolean {
    const { slot, name } = command;
    const effectiveName = name || this.store.getState().presets.get(slot)?.name || '';
    debug(`[PresetController] PRESET_CHANGE: ${slot} ${effectiveName}`);
    this.store.setPresetActive(slot, effectiveName);
    if (!this.store.getState().refreshing) {
      this.onLoad?.({ slot, name: effectiveName });
    }
    return true;
  }

  handlePresetInfo(command: PresetInfoCommand): boolean {
    const { slot, name } = command;
    debug(`[PresetController] PRESET_INFO: ${slot} ${name}`);
    this.store.setPresetMetadata(slot, name);
    if (this.store.getState().refreshing) {
      // During bulk dump (0xff 0xc1), record the latest slot without firing per-slot onLoad events;
      // the active preset's 0x04 header immediately precedes its AMP_UPDATE (0x05).
      this._lastRefreshPresetSlot = slot;
    } else {
      // Outside bulk refresh, hardware sends 0x1c 0x01 0x04 on manual preset wheel turns and loadPreset replies.
      this.store.setPresetActive(slot, name);
      this.onLoad?.({ slot, name });
    }
    return true;
  }

  handlePresetAck(command: PresetAckCommand): boolean {
    const { slot } = command;
    debug(`[PresetController] PRESET_ACK: ${slot}`);
    const state = this.store.getState();
    if (state.refreshing) {
      return true;
    }
    if (state.currentPresetSlot === null) {
      const existingName = state.presets.get(slot)?.name || '';
      this.store.setPresetActive(slot, existingName, true);
    }
    return true;
  }

  async loadPreset(slot: number): Promise<void> {
    assertPresetSlot(slot);
    debug(`[PresetController] loadPreset(${slot})`);
    // Drop pending knob drags from the previous preset so they never overwrite the newly loaded preset.
    this.cancelCoalesced();
    await this.transmit(() => PacketBuilder.loadPreset(slot).build());
  }

  async savePreset(slot: number, name: string): Promise<void> {
    assertPresetSlot(slot);
    const cleanName = truncateUtf8String(sanitizePresetName(name), LIMITS.PRESET_NAME_BYTES);
    if (!cleanName) throw new Error('Preset name must not be empty');
    debug(`[PresetController] savePreset(${slot}, "${cleanName}")`);

    // Match Fender FUSE & offa/plug: select the saved memory bank immediately after writing its name
    await this.transmit(
      () => PacketBuilder.savePreset(slot, cleanName).build(),
      () => PacketBuilder.loadPreset(slot).build(),
    );
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
  if (!isValidPresetSlot(slot)) {
    throw new Error(`Invalid preset slot: ${slot}`);
  }
}

/** Strip control characters and surrounding whitespace; the amp displays raw bytes. */
export function sanitizePresetName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
}
