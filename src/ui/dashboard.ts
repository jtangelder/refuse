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
  template: `
    <!-- Fender TONE Desktop Top Bar -->
    <header class="fender-top-bar">
      <div class="top-bar-left">
        <div class="preset-play-badge" title="Active Preset">
          <mat-icon aria-hidden="true">play_arrow</mat-icon>
        </div>
        <h1 class="top-preset-title">{{ currentPresetName().toUpperCase() }}</h1>
        @if (service.presetDetails().author) {
          <span class="top-preset-author">by {{ service.presetDetails().author }}</span>
        }
      </div>

      <div class="top-bar-right">
        <div class="top-connection">
          <span class="status-dot connected" [class.demo]="service.isDemo()"></span>
          <span class="status-label">{{ service.isDemo() ? 'Demo Mode' : 'Connected' }}</span>
        </div>
        <button
          type="button"
          class="top-save-btn"
          (click)="openPresetInfoDialog()"
          title="Edit Preset Metadata (Author, Genres, Tags, Description)"
        >
          Preset Info
        </button>
        <button type="button" class="top-save-btn primary" (click)="openSaveAsDialog()">Save As</button>
        <div class="preset-arrows-group">
          <button
            type="button"
            class="arrow-btn"
            aria-label="Previous Preset"
            title="Previous Preset"
            (click)="onPrevPreset()"
          >
            <mat-icon aria-hidden="true">keyboard_arrow_up</mat-icon>
          </button>
          <button type="button" class="arrow-btn" aria-label="Next Preset" title="Next Preset" (click)="onNextPreset()">
            <mat-icon aria-hidden="true">keyboard_arrow_down</mat-icon>
          </button>
        </div>
        <button
          type="button"
          class="disconnect-btn"
          [title]="service.isDemo() ? 'Exit Demo Mode' : 'Disconnect Amplifier'"
          [attr.aria-label]="service.isDemo() ? 'Exit Demo Mode' : 'Disconnect Amplifier'"
          (click)="onDisconnect()"
        >
          <mat-icon aria-hidden="true">power_settings_new</mat-icon>
        </button>
      </div>
    </header>

    <!-- Signal Chain on Audio Wire -->
    <fuse-signal-chain
      [activeSlot]="activeSlot()"
      [effects]="allEffectSettings()"
      [ampSettings]="ampSettings()"
      [cabinetModels]="cabModels"
      (activeSlotChange)="onSelectSlot($event)"
      (emptyCategorySelect)="onSelectEmptyCategory($event)"
      (toggleEffect)="toggleEffect($event.slot, $event.enabled)"
      (clearEffect)="clearSlot($event)"
      (movePosition)="moveEffectPosition($event.fromSlot, $event.toSlot)"
      (quickAdd)="onQuickAdd()"
      (openPresetInfo)="openPresetInfoDialog()"
      (tapTempoBpm)="onTapTempoBpm($event)"
    ></fuse-signal-chain>

    <main class="editor-container">
      <!-- Amp Control -->
      @if (activeSlot() === 'amp') {
        <fuse-amp-editor
          [settings]="ampSettings()"
          [knobs]="ampKnobs()"
          [ampModels]="ampModels"
          [cabModels]="cabModels"
          (ampChange)="changeAmp($event)"
          (cabinetChange)="changeCabinet($event)"
          (knobChange)="changeAmpKnob($event.index, $event.value)"
          (advancedSettingChange)="changeAdvancedSetting($event.key, $event.value)"
        ></fuse-amp-editor>
      }

      <!-- Effect Slot Control -->
      @if (isEffectSlot(activeSlot())) {
        <fuse-effect-editor
          [activeSlot]="asNumber(activeSlot())"
          [slotCategory]="selectedSlotCategory()"
          [effect]="selectedEffect()"
          [allEffects]="allEffectSettings()"
          [effectModels]="effectModels"
          (assignChange)="assignEffect(asNumber(activeSlot())!, $event)"
          (toggleChange)="toggleEffect(asNumber(activeSlot())!, $event)"
          (knobChange)="changeEffectKnob(asNumber(activeSlot())!, $event.index, $event.value)"
          (clearRequest)="clearSlot(asNumber(activeSlot())!)"
          (movePositionRequest)="moveEffectPosition($event.fromSlot, $event.toSlot)"
        ></fuse-effect-editor>
      }
    </main>

    <!-- Native Save As Dialog -->
    <dialog #saveAsDialog class="fuse-dialog" aria-labelledby="save-as-dialog-title" (close)="onSaveAsDialogClosed()">
      <form method="dialog" class="dialog-form">
        <h3 id="save-as-dialog-title">Save Active Preset</h3>
        <p class="dialog-subtitle">Choose a target slot and name on your amplifier</p>
        <label class="dialog-label" for="save-as-slot-select">Target Slot</label>
        <select
          id="save-as-slot-select"
          class="dialog-input"
          [value]="saveAsTargetSlot()"
          (change)="onSaveAsSlotChange($event)"
        >
          @for (slot of presetService.allSlots(); track slot) {
            <option [value]="slot" [selected]="slot === saveAsTargetSlot()">
              {{ (slot + 1).toString().padStart(2, '0') }} —
              {{ service.presets().get(slot)?.name || 'Preset ' + (slot + 1) }}
            </option>
          }
        </select>
        <label class="dialog-label" for="save-as-name-input">Preset Name</label>
        <input
          id="save-as-name-input"
          type="text"
          class="dialog-input"
          maxlength="31"
          [value]="saveAsDraftName()"
          (input)="onSaveAsNameInput($event)"
          autofocus
        />
        <div class="dialog-actions">
          <button type="submit" value="cancel" class="dialog-btn cancel">Cancel</button>
          <button type="submit" value="confirm" class="dialog-btn confirm">Save Preset</button>
        </div>
      </form>
    </dialog>

    <!-- Native Preset Info Dialog (Fender FUSE Manual p.6) -->
    <dialog
      #presetInfoDialog
      class="fuse-dialog info-dialog"
      aria-labelledby="preset-info-title"
      (close)="onPresetInfoDialogClosed()"
    >
      <form method="dialog" class="dialog-form">
        <h3 id="preset-info-title">Preset Information</h3>
        <p class="dialog-subtitle">
          Edit FUSE metadata stored when exporting or sharing presets ({{ currentPresetName() }})
        </p>

        <div class="dialog-grid">
          <div class="field-group">
            <label class="dialog-label" for="info-author">Author</label>
            <input
              id="info-author"
              type="text"
              class="dialog-input"
              placeholder="e.g. Fender Audio"
              [value]="infoAuthor()"
              (input)="onInfoFieldInput('author', $event)"
            />
          </div>

          <div class="field-group">
            <label class="dialog-label" for="info-tags">Search Tags</label>
            <input
              id="info-tags"
              type="text"
              class="dialog-input"
              placeholder="e.g. clean, vintage, slapback"
              [value]="infoTags()"
              (input)="onInfoFieldInput('tags', $event)"
            />
          </div>

          <div class="field-group">
            <label class="dialog-label" for="info-genre1">Main Genre</label>
            <select
              id="info-genre1"
              class="dialog-input"
              [value]="infoGenre1()"
              (change)="onInfoFieldInput('genre1', $event)"
            >
              @for (g of genres; track g) {
                <option [value]="g">{{ g || '-- None --' }}</option>
              }
            </select>
          </div>

          <div class="field-group">
            <label class="dialog-label" for="info-genre2">Sub-Genre 1</label>
            <select
              id="info-genre2"
              class="dialog-input"
              [value]="infoGenre2()"
              (change)="onInfoFieldInput('genre2', $event)"
            >
              @for (g of genres; track g) {
                <option [value]="g">{{ g || '-- None --' }}</option>
              }
            </select>
          </div>

          <div class="field-group full-width">
            <label class="dialog-label" for="info-genre3">Sub-Genre 2</label>
            <select
              id="info-genre3"
              class="dialog-input"
              [value]="infoGenre3()"
              (change)="onInfoFieldInput('genre3', $event)"
            >
              @for (g of genres; track g) {
                <option [value]="g">{{ g || '-- None --' }}</option>
              }
            </select>
          </div>

          <div class="field-group full-width">
            <label class="dialog-label" for="info-description">Description / Notes</label>
            <textarea
              id="info-description"
              class="dialog-input dialog-textarea"
              rows="3"
              placeholder="Describe pickup position, guitar type, or performance notes..."
              [value]="infoDescription()"
              (input)="onInfoFieldInput('description', $event)"
            ></textarea>
          </div>
        </div>

        <div class="dialog-actions">
          <button type="submit" value="cancel" class="dialog-btn cancel">Cancel</button>
          <button type="submit" value="confirm" class="dialog-btn confirm">Apply Info</button>
        </div>
      </form>
    </dialog>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow-y: auto;
        background: #18191c;
      }

      /* Fender TONE Top Bar */
      .fender-top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 50px;
        background: #1f2125;
        border-bottom: 1px solid #282a30;
        padding: 0 18px;
        user-select: none;
      }

      .top-bar-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .preset-play-badge {
        width: 26px;
        height: 26px;
        background: #353842;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .top-preset-title {
        font-size: 1.05rem;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: 0.04em;
        margin: 0;
      }

      .top-preset-author {
        font-size: 0.76rem;
        color: #8b92a5;
        font-weight: 500;
      }

      .top-bar-right {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .top-connection {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-right: 6px;
      }

      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #ef4444;

        &.connected {
          background: #00e676;
          box-shadow: 0 0 8px #00e676;
        }

        &.connected.demo {
          background: #f59e0b;
          box-shadow: 0 0 8px #f59e0b;
        }
      }

      .status-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #8b92a5;
      }

      .top-save-btn {
        background: #252830;
        border: 1px solid #353842;
        color: #c2c8d6;
        font-size: 0.78rem;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;

        &:hover {
          background: #2c303a;
          color: #ffffff;
          border-color: #4a4f5d;
        }

        &.primary {
          border-color: rgba(0, 176, 255, 0.4);
          color: #38bdf8;

          &:hover {
            background: rgba(0, 176, 255, 0.14);
            color: #ffffff;
          }
        }
      }

      .preset-arrows-group {
        display: flex;
        gap: 4px;
      }

      .arrow-btn,
      .disconnect-btn {
        width: 28px;
        height: 28px;
        background: #252830;
        border: 1px solid #353842;
        border-radius: 4px;
        color: #8e95a5;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }

        &:hover {
          color: #ffffff;
          border-color: #00b0ff;
          background: #2c303a;
        }
      }

      .disconnect-btn:hover {
        border-color: #ef4444;
        color: #f87171;
      }

      .editor-container {
        padding: 24px 20px 48px;
        max-width: 900px;
        width: 100%;
        margin: 0 auto;
        box-sizing: border-box;
      }

      /* Native <dialog> Modals */
      .fuse-dialog {
        background: #1f2125;
        color: #f4f4f5;
        border: 1px solid #353842;
        border-radius: 10px;
        padding: 20px 24px;
        width: min(380px, 90vw);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.65);
        overscroll-behavior: contain;

        &.info-dialog {
          width: min(520px, 92vw);
        }

        &::backdrop {
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(2px);
        }
      }

      .dialog-form {
        display: flex;
        flex-direction: column;
        gap: 12px;

        h3 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
        }
      }

      .dialog-subtitle {
        margin: 0;
        font-size: 0.8rem;
        color: #8b92a5;
      }

      .dialog-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .field-group {
        display: flex;
        flex-direction: column;
        gap: 5px;

        &.full-width {
          grid-column: 1 / -1;
        }
      }

      .dialog-label {
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #9ba1b0;
      }

      .dialog-input {
        background: #141619;
        border: 1px solid #353842;
        border-radius: 6px;
        padding: 8px 10px;
        color: #ffffff;
        font-size: 0.88rem;
        outline: none;
        font-family: inherit;

        &:focus {
          border-color: #00b0ff;
        }
      }

      .dialog-textarea {
        resize: vertical;
        min-height: 64px;
      }

      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }

      .dialog-btn {
        padding: 7px 14px;
        border-radius: 6px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;

        &.cancel {
          background: #2a2d35;
          color: #c2c8d6;
          border-color: #3a3f4b;
        }

        &.confirm {
          background: #00b0ff;
          color: #09131c;
          font-weight: 700;
        }
      }
    `,
  ],
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
