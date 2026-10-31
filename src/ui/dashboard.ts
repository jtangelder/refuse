import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AMP_MODELS, CABINET_MODELS, EFFECT_MODELS, DspType, type AdvancedAmpParam } from '../lib';
import { SignalChainComponent } from './signal_chain';
import { AmpEditorComponent } from './amp_editor';
import { EffectEditorComponent } from './effect_editor';

import { FuseService } from '../services/fuse.service';
import { AmpService } from '../services/amp.service';
import { EffectService } from '../services/effect.service';
import { PresetService } from '../services/preset.service';
import { NotificationService } from '../services/notification.service';

const FUSE_GENRES: readonly string[] = [
  '',
  'Alternative',
  'Blues',
  'Classic Rock',
  'Country',
  'Folk',
  'Funk / R&B',
  'Grunge',
  'Heavy Metal',
  'Indie',
  'Jazz',
  'Pop',
  'Punk',
  'Reggae',
  'Rock',
  'Surf',
  'Worship',
];

@Component({
  selector: 'fuse-dashboard',
  imports: [MatButtonModule, MatIconModule, SignalChainComponent, AmpEditorComponent, EffectEditorComponent],
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

  private readonly saveAsDialogRef = viewChild<ElementRef<HTMLDialogElement>>('saveAsDialog');
  private readonly presetInfoDialogRef = viewChild<ElementRef<HTMLDialogElement>>('presetInfoDialog');

  protected readonly genres = FUSE_GENRES;

  protected readonly saveAsDraftName = signal('');
  protected readonly saveAsTargetSlot = signal(0);
  protected readonly infoAuthor = signal('');
  protected readonly infoDescription = signal('');
  protected readonly infoTags = signal('');
  protected readonly infoGenre1 = signal('');
  protected readonly infoGenre2 = signal('');
  protected readonly infoGenre3 = signal('');

  protected readonly currentPresetName = this.presetService.currentPresetName;
  protected readonly maxPresetSlot = this.presetService.maxSlot;

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

  async onPrevPreset() {
    const current = this.service.currentPresetSlot() ?? 0;
    const maxSlot = this.maxPresetSlot();
    const prev = current > 0 ? current - 1 : maxSlot;
    await this.presetService.loadPreset(prev);
  }

  async onNextPreset() {
    const current = this.service.currentPresetSlot() ?? 0;
    const maxSlot = this.maxPresetSlot();
    const next = current < maxSlot ? current + 1 : 0;
    await this.presetService.loadPreset(next);
  }

  openSaveAsDialog() {
    const slot = this.service.currentPresetSlot() ?? 0;
    this.saveAsTargetSlot.set(slot);
    this.saveAsDraftName.set(this.currentPresetName());
    const dialog = this.saveAsDialogRef()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
      dialog.showModal();
    }
  }

  onSaveAsSlotChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const targetSlot = Number(select.value);
    if (Number.isInteger(targetSlot) && targetSlot >= 0) {
      this.saveAsTargetSlot.set(targetSlot);
    }
  }

  onSaveAsNameInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.saveAsDraftName.set(input.value);
  }

  async onSaveAsDialogClosed() {
    const dialog = this.saveAsDialogRef()?.nativeElement;
    if (!dialog || dialog.returnValue !== 'confirm') {
      return;
    }
    const targetSlot = this.saveAsTargetSlot();
    const name = this.saveAsDraftName().trim();
    if (!name) return;
    await this.presetService.savePreset(targetSlot, name);
    this.notifications.info(`Saved preset "${name}" to slot ${targetSlot + 1}.`);
  }

  openPresetInfoDialog() {
    const details = this.service.presetDetails();
    this.infoAuthor.set(details.author ?? '');
    this.infoDescription.set(details.description ?? '');
    this.infoTags.set(details.tags ?? '');
    this.infoGenre1.set(details.genre1 ?? '');
    this.infoGenre2.set(details.genre2 ?? '');
    this.infoGenre3.set(details.genre3 ?? '');

    const dialog = this.presetInfoDialogRef()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
      dialog.showModal();
    }
  }

  onInfoFieldInput(field: 'author' | 'description' | 'tags' | 'genre1' | 'genre2' | 'genre3', event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const val = target.value;
    switch (field) {
      case 'author':
        this.infoAuthor.set(val);
        break;
      case 'description':
        this.infoDescription.set(val);
        break;
      case 'tags':
        this.infoTags.set(val);
        break;
      case 'genre1':
        this.infoGenre1.set(val);
        break;
      case 'genre2':
        this.infoGenre2.set(val);
        break;
      case 'genre3':
        this.infoGenre3.set(val);
        break;
    }
  }

  onPresetInfoDialogClosed() {
    const dialog = this.presetInfoDialogRef()?.nativeElement;
    if (!dialog || dialog.returnValue !== 'confirm') {
      return;
    }
    this.presetService.updatePresetDetails({
      author: this.infoAuthor().trim(),
      description: this.infoDescription().trim(),
      tags: this.infoTags().trim(),
      genre1: this.infoGenre1(),
      genre2: this.infoGenre2(),
      genre3: this.infoGenre3(),
    });
    this.notifications.info('Updated preset information.');
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

  onQuickAdd() {
    // Open first empty slot
    const effs = this.allEffectSettings();
    const emptySlot = effs.findIndex(e => !e);
    if (emptySlot !== -1) {
      this.activeSlot.set(emptySlot);
    }
  }

  protected isEffectSlot(slot: number | 'amp'): boolean {
    return typeof slot === 'number';
  }

  protected asNumber(slot: number | 'amp'): number | null {
    return typeof slot === 'number' ? slot : null;
  }
}
