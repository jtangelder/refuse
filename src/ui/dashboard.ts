import { Component, ChangeDetectionStrategy, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import {
  AMP_MODELS,
  CABINET_MODELS,
  EFFECT_MODELS,
  DspType,
  getModelDefault,
  OFFSETS,
  type AdvancedAmpParam,
  type ModelDef,
} from '../lib';
import { SignalChainComponent } from './signal_chain';
import { AmpEditorComponent } from './amp_editor';
import { EffectEditorComponent } from './effect_editor';
import { WelcomeComponent } from './welcome';

import { FuseService } from '../services/fuse.service';
import { AmpService } from '../services/amp.service';
import { EffectService } from '../services/effect.service';
import { PresetService } from '../services/preset.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'fuse-dashboard',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
    SignalChainComponent,
    AmpEditorComponent,
    EffectEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.ng.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  protected readonly service = inject(FuseService);
  protected readonly ampService = inject(AmpService);
  protected readonly effectService = inject(EffectService);
  protected readonly presetService = inject(PresetService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  isMobile = input<boolean>(false);
  toggleSidebar = output<void>();

  protected readonly currentPresetName = this.presetService.currentPresetName;

  // Default to 'amp' on load, just like Fender FUSE startup screen
  protected activeSlot = signal<number | 'amp'>('amp');

  protected ampModels = Object.values(AMP_MODELS);
  protected cabModels = CABINET_MODELS;
  protected effectModels = Object.values(EFFECT_MODELS);

  // Reactive signals bridged from domain services
  protected readonly ampSettings = this.ampService.settings;
  protected readonly ampKnobs = this.ampService.knobs;
  protected readonly allEffectSettings = this.effectService.allSettings;

  selectedEffect = computed(() => {
    const slot = this.activeSlot();
    if (typeof slot !== 'number') return null;
    return this.allEffectSettings()[slot] || null;
  });

  emptyCategorySelection = signal<DspType | null>(null);

  selectedSlotCategory = computed<DspType | null>(() => {
    const slot = this.activeSlot();
    if (typeof slot !== 'number') return null;
    const effs = this.allEffectSettings();
    const eff = effs[slot];
    if (eff) return eff.type;

    const isPost = slot >= 4;
    const explicit = this.emptyCategorySelection();
    if (explicit !== null && !(isPost && explicit === DspType.STOMP)) {
      return explicit;
    }

    const usedTypes = new Set<DspType>();
    for (const item of effs) {
      if (item) usedTypes.add(item.type);
    }

    const allowed: readonly DspType[] = isPost
      ? [DspType.MOD, DspType.DELAY, DspType.REVERB]
      : [DspType.STOMP, DspType.MOD, DspType.DELAY, DspType.REVERB];

    return allowed.find(t => !usedTypes.has(t)) ?? (isPost ? DspType.MOD : DspType.STOMP);
  });

  onSelectSlot(slot: number | 'amp') {
    this.emptyCategorySelection.set(null);
    this.activeSlot.set(slot);
  }

  onSelectEmptyCategory(event: { slot: number; category: DspType }) {
    this.emptyCategorySelection.set(event.category);
    this.activeSlot.set(event.slot);
  }

  async clearSlot(slot: number) {
    await this.effectService.clearEffect(slot);
    this.activeSlot.set(slot);
  }

  async changeAmp(modelId: number) {
    await this.ampService.setAmpModelById(modelId);
  }

  async changeCabinet(id: number) {
    await this.ampService.setCabinetById(id);
  }

  async changeAmpKnob(index: number, value: number) {
    await this.ampService.setAmpKnob(index, value);
  }

  async changeAdvancedSetting(key: AdvancedAmpParam, value: number) {
    await this.ampService.setAdvancedSetting(key, value);
  }

  async assignEffect(slot: number, modelId: number) {
    this.emptyCategorySelection.set(null);
    if (modelId === 0) {
      await this.effectService.clearEffect(slot);
    } else {
      await this.effectService.setEffectById(slot, modelId);
    }
    this.activeSlot.set(slot);
  }

  async toggleEffect(slot: number, enabled: boolean) {
    await this.effectService.setEffectEnabled(slot, enabled);
  }

  async changeEffectKnob(slot: number, index: number, value: number) {
    await this.effectService.setEffectKnob(slot, index, value);
  }

  async moveEffectPosition(fromSlot: number, toSlot: number) {
    this.emptyCategorySelection.set(null);
    this.activeSlot.set(toSlot);
    await this.effectService.moveEffect(fromSlot, toSlot);
  }

  openAboutDialog() {
    this.dialog.open(WelcomeComponent, {
      width: '460px',
      maxWidth: '94dvw',
      autoFocus: 'first-tabbable',
    });
  }

  private isRandomizing = false;

  async randomizeSetup() {
    if (this.isRandomizing) return;
    this.isRandomizing = true;
    try {
      // 1. Pick a random amplifier model and musically randomize active knobs in one shot
      const amps = Object.values(AMP_MODELS);
      const randomAmp = amps[Math.floor(Math.random() * amps.length)];

      const knobOverrides: Array<{ index: number; value: number }> = [];
      for (let i = 0; i < randomAmp.knobs.length; i++) {
        if (randomAmp.knobs[i]) {
          const value = Math.floor(90 + Math.random() * 100);
          knobOverrides.push({ index: i, value });
        }
      }

      await this.ampService.setAmpModelById(randomAmp.id, knobOverrides);

      // 2. Select 1 to 3 random effects adhering to Mustang hardware rules
      // (At most 1 effect per DSP type; pre-amp slots 0-3, post-amp slots 4-7)
      const allTypes = [DspType.STOMP, DspType.MOD, DspType.DELAY, DspType.REVERB];
      const shuffledTypes = [...allTypes].sort(() => Math.random() - 0.5);
      const count = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3 effects
      const chosenTypes = shuffledTypes.slice(0, count);

      const preTypes: DspType[] = [];
      const postTypes: DspType[] = [];

      for (const type of chosenTypes) {
        if (type === DspType.STOMP) {
          preTypes.push(type);
        } else if (type === DspType.REVERB || type === DspType.DELAY) {
          postTypes.push(type);
        } else if (type === DspType.MOD) {
          if (preTypes.length === 0 && Math.random() > 0.5) {
            preTypes.push(type);
          } else {
            postTypes.push(type);
          }
        }
      }

      // Assign contiguous slots: pre-amp 0, 1... and post-amp 4, 5...
      const plannedEffects: Array<{
        slot: number;
        modelId: number;
        knobs: Array<{ index: number; value: number }>;
      }> = [];
      const chosenEffectNames: string[] = [];

      let preSlot = 0;
      for (const type of preTypes) {
        const matching = Object.values(EFFECT_MODELS).filter(m => m.type === type);
        if (matching.length === 0) continue;
        const effect = matching[Math.floor(Math.random() * matching.length)];
        plannedEffects.push({
          slot: preSlot++,
          modelId: effect.id,
          knobs: getAudibleDefaultEffectKnobs(effect),
        });
        chosenEffectNames.push(effect.name);
      }

      let postSlot = 4;
      for (const type of postTypes) {
        const matching = Object.values(EFFECT_MODELS).filter(m => m.type === type);
        if (matching.length === 0) continue;
        const effect = matching[Math.floor(Math.random() * matching.length)];
        plannedEffects.push({
          slot: postSlot++,
          modelId: effect.id,
          knobs: getAudibleDefaultEffectKnobs(effect),
        });
        chosenEffectNames.push(effect.name);
      }

      // 3. Atomically replace effects chain in one transaction without redundant clears or races
      await this.effectService.replaceAllEffects(plannedEffects);

      this.activeSlot.set('amp');
      const fxSummary = chosenEffectNames.length > 0 ? ` + ${chosenEffectNames.join(', ')}` : '';
      this.notifications.info(`Rolled new sound: ${randomAmp.name}${fxSummary}`);
    } finally {
      this.isRandomizing = false;
    }
  }

  async onTapTempoBpm(bpm: number) {
    const updated = await this.effectService.setDelayTempoBpm(bpm);
    if (updated) {
      this.notifications.info(`Synced Delay Time to ${bpm} BPM.`);
    }
  }

  async onDisconnect() {
    await this.service.disconnect();
  }

  protected isEffectSlot(slot: number | 'amp'): boolean {
    return typeof slot === 'number';
  }

  protected asNumber(slot: number | 'amp'): number | null {
    return typeof slot === 'number' ? slot : null;
  }
}

/**
 * Extracts default knob values for an effect model, ensuring audible output levels
 * for levels, mix, rates, and feedback.
 */
function getAudibleDefaultEffectKnobs(effect: ModelDef): Array<{ index: number; value: number }> {
  const defaults = getModelDefault(effect.id);
  const result: Array<{ index: number; value: number }> = [];

  effect.knobs.forEach((name, index) => {
    if (!name) return;
    let val = defaults ? defaults[OFFSETS.KNOB_START + index] : 128;
    const lower = name.toLowerCase();

    if (
      (lower.includes('level') || lower.includes('vol') || lower.includes('mix') || lower.includes('blend')) &&
      val < 100
    ) {
      val = 140;
    } else if ((lower.includes('rate') || lower.includes('speed')) && val === 0) {
      val = 60;
    } else if (lower.includes('fdbk') && val === 0) {
      val = 75;
    } else if (lower.includes('time') && val < 20) {
      val = 85;
    } else if ((lower.includes('decay') || lower.includes('dwell')) && val < 50) {
      val = 110;
    } else if ((lower === 'q' || lower === 'tone') && val === 0) {
      val = 128;
    }

    result.push({ index, value: val });
  });

  return result;
}
