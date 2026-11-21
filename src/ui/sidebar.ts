import {
  Component,
  ChangeDetectionStrategy,
  type ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule, type MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { sanitizePresetName } from '../lib/controllers/preset_controller';
import { FuseService } from '../services/fuse.service';
import { PresetService } from '../services/preset.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'fuse-sidebar',
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.ng.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent {
  protected readonly service = inject(FuseService);
  protected readonly presetService = inject(PresetService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  private readonly saveDialogTpl = viewChild.required<TemplateRef<unknown>>('saveDialogTpl');
  private readonly presetNameInputRef = viewChild<ElementRef<HTMLInputElement>>('presetNameInput');
  private readonly listScrollRef = viewChild<ElementRef<HTMLElement>>('listScroll');
  private activeSaveDialogRef: MatDialogRef<unknown> | null = null;

  isMobile = input<boolean>(false);
  presetSelected = output<number>();
  closeDrawer = output<void>();

  protected readonly draftName = signal('');
  protected readonly nameError = signal<string | null>(null);
  protected readonly savingPreset = signal(false);
  protected readonly targetSlot = signal(0);
  protected readonly allPresetSlots = this.presetService.allSlots;
  private readonly presetSaveName = this.presetService.currentPresetName;

  constructor() {
    effect(() => {
      const slot = this.service.currentPresetSlot();
      const slots = this.allPresetSlots();
      if (slot !== null && slot !== undefined && slots.length > 0) {
        queueMicrotask(() => this.scrollSlotIntoView(slot, 'smooth'));
      }
    });
  }

  scrollActivePresetIntoView(behavior: ScrollBehavior = 'smooth') {
    const slot = this.service.currentPresetSlot();
    if (slot !== null && slot !== undefined) {
      this.scrollSlotIntoView(slot, behavior);
    }
  }

  private scrollSlotIntoView(slot: number, behavior: ScrollBehavior) {
    const prefersReducedMotion =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    const resolvedBehavior: ScrollBehavior = behavior === 'smooth' && prefersReducedMotion ? 'instant' : behavior;
    const container = this.listScrollRef()?.nativeElement;
    const btn = container?.querySelector<HTMLElement>(`button[data-slot="${slot}"]`);
    btn?.scrollIntoView({ block: 'nearest', behavior: resolvedBehavior });
  }

  onDraftNameInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.draftName.set(val);
    if (this.nameError() && sanitizePresetName(val)) {
      this.nameError.set(null);
    }
  }

  onDraftNameBlur() {
    if (!sanitizePresetName(this.draftName())) {
      this.nameError.set('Preset name is required.');
    }
  }

  async changePreset(slot: number) {
    this.scrollSlotIntoView(slot, 'smooth');
    await this.presetService.loadPreset(slot);
    this.presetSelected.emit(slot);
  }

  async onListKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const slots = this.allPresetSlots();
    if (slots.length === 0) return;

    event.preventDefault();
    const targetEl = event.target as HTMLElement | null;
    const currentAttr = targetEl?.closest('[data-slot]')?.getAttribute('data-slot');
    const currentSlot =
      currentAttr !== null && currentAttr !== undefined
        ? Number(currentAttr)
        : (this.service.currentPresetSlot() ?? slots[0]);

    const idx = slots.indexOf(currentSlot);
    const nextIdx =
      event.key === 'ArrowDown' ? (idx < slots.length - 1 ? idx + 1 : 0) : idx > 0 ? idx - 1 : slots.length - 1;

    const nextSlot = slots[nextIdx];
    const listContainer = event.currentTarget as HTMLElement;
    const nextBtn = listContainer.querySelector<HTMLButtonElement>(`button[data-slot="${nextSlot}"]`);
    nextBtn?.focus();
    await this.changePreset(nextSlot);
  }

  openSaveDialog() {
    const slot = this.service.currentPresetSlot() ?? 0;
    this.targetSlot.set(slot);
    this.draftName.set(this.presetSaveName());
    this.nameError.set(null);
    this.savingPreset.set(false);
    this.activeSaveDialogRef = this.dialog.open(this.saveDialogTpl(), {
      width: '420px',
      maxWidth: '94dvw',
    });
    this.activeSaveDialogRef.afterClosed().subscribe(() => {
      this.activeSaveDialogRef = null;
      this.savingPreset.set(false);
    });
  }

  async onSavePresetSubmit(event: Event) {
    event.preventDefault();
    if (this.savingPreset()) return;

    const cleanName = sanitizePresetName(this.draftName());
    if (!cleanName) {
      this.nameError.set('Preset name is required.');
      this.presetNameInputRef()?.nativeElement.focus();
      return;
    }

    this.savingPreset.set(true);
    try {
      const targetSlot = this.targetSlot();
      await this.presetService.savePreset(targetSlot, cleanName);
      this.activeSaveDialogRef?.close('save');
      this.notifications.info(`Saved preset "${cleanName}" to slot ${targetSlot + 1}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifications.error(`Failed to save preset: ${msg}`);
    } finally {
      this.savingPreset.set(false);
    }
  }

  async importFusePreset(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const xmlString = await file.text();
      await this.presetService.loadPresetFromXml(xmlString);
      this.notifications.info(`Imported preset from ${file.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifications.error(`Failed to import preset: ${msg}`);
    } finally {
      input.value = '';
    }
  }

  exportFusePreset() {
    try {
      const name = this.presetSaveName() || 'Custom Preset';
      const xml = this.presetService.exportPresetToXml(name);
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeFilename = name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'preset';
      a.download = `${safeFilename}.fuse`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.notifications.info(`Exported "${safeFilename}.fuse"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifications.error(`Failed to export preset: ${msg}`);
    }
  }
}
