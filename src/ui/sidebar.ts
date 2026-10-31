import { Component, ChangeDetectionStrategy, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FuseService } from '../services/fuse.service';
import { PresetService } from '../services/preset.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'fuse-sidebar',
  imports: [DecimalPipe, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.ng.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent {
  protected readonly service = inject(FuseService);
  protected readonly presetService = inject(PresetService);
  private readonly notifications = inject(NotificationService);

  private readonly saveDialog = viewChild<ElementRef<HTMLDialogElement>>('saveDialog');

  protected readonly searchQuery = signal('');
  protected readonly draftName = signal('');

  protected readonly allPresetSlots = this.presetService.allSlots;

  protected readonly filteredSlots = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const slots = this.allPresetSlots();
    if (!query) return slots;
    const presets = this.service.presets();
    return slots.filter(slot => {
      const name = (presets.get(slot)?.name || `Preset ${slot + 1}`).toLowerCase();
      const num = String(slot + 1).padStart(2, '0');
      return name.includes(query) || num.includes(query);
    });
  });

  private readonly presetSaveName = this.presetService.currentPresetName;

  onSearchInput(event: Event) {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onDraftNameInput(event: Event) {
    this.draftName.set((event.target as HTMLInputElement).value);
  }

  async changePreset(slot: number) {
    await this.presetService.loadPreset(slot);
  }

  async onListKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const slots = this.filteredSlots();
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
    const dialog = this.saveDialog()?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
      dialog.showModal();
    }
  }

  async onDialogClose() {
    const dialog = this.saveDialog()?.nativeElement;
    if (!dialog) return;
    const returnValue = dialog.returnValue;
    dialog.returnValue = '';

    if (returnValue === 'save') {
      const slot = this.service.currentPresetSlot();
      const name = this.draftName().trim();
      if (slot !== null && slot !== undefined && name) {
        await this.presetService.savePreset(slot, name);
        this.notifications.info(`Saved preset "${name}" to slot ${slot + 1}`);
      }
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
      URL.revokeObjectURL(url);
      this.notifications.info(`Exported "${name}.fuse"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifications.error(`Failed to export preset: ${msg}`);
    }
  }
}
