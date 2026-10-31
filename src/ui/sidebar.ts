import { Component, ChangeDetectionStrategy, inject, signal, viewChild, type TemplateRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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

  protected readonly draftName = signal('');
  protected readonly allPresetSlots = this.presetService.allSlots;
  private readonly presetSaveName = this.presetService.currentPresetName;

  onDraftNameInput(event: Event) {
    this.draftName.set((event.target as HTMLInputElement).value);
  }

  async changePreset(slot: number) {
    await this.presetService.loadPreset(slot);
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
    const slot = this.service.currentPresetSlot();
    if (slot === null || slot === undefined) return;
    this.draftName.set(this.presetSaveName());
    const dialogRef = this.dialog.open(this.saveDialogTpl(), {
      width: '380px',
    });
    dialogRef.afterClosed().subscribe(async result => {
      if (result === 'save') {
        const name = this.draftName().trim();
        if (slot !== null && slot !== undefined && name) {
          await this.presetService.savePreset(slot, name);
          this.notifications.info(`Saved preset "${name}" to slot ${slot + 1}`);
        }
      }
    });
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
      URL.revokeObjectURL(url);
      this.notifications.info(`Exported "${name}.fuse"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifications.error(`Failed to export preset: ${msg}`);
    }
  }
}
