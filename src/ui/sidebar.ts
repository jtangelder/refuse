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
  template: `
    <nav class="sidebar-container" aria-label="Preset list">
      <div class="sidebar-search-wrapper">
        <div class="sidebar-search-box">
          <mat-icon class="search-icon" aria-hidden="true">search</mat-icon>
          <input
            type="search"
            class="search-input"
            placeholder="Filter presets"
            aria-label="Filter presets"
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
          />
        </div>
      </div>

      <div class="presets-list-scroll">
        <ul class="preset-items" role="list" (keydown)="onListKeyDown($event)">
          @for (slot of filteredSlots(); track slot) {
            <li class="preset-row">
              <button
                type="button"
                [attr.data-slot]="slot"
                (click)="changePreset(slot)"
                [class.active]="service.currentPresetSlot() === slot"
                [attr.aria-current]="service.currentPresetSlot() === slot ? 'true' : null"
                class="preset-item-btn"
                [attr.aria-label]="
                  'Select preset ' + (slot + 1) + ': ' + (service.presets().get(slot)?.name || 'Preset ' + (slot + 1))
                "
              >
                <span class="slot-num">{{ slot + 1 | number: '2.0' }}</span>
                <span class="preset-name">{{ service.presets().get(slot)?.name || 'Preset ' + (slot + 1) }}</span>
              </button>
            </li>
          }
        </ul>
      </div>

      <!-- Bottom Actions -->
      <div class="sidebar-bottom-controls">
        <button type="button" class="action-pill-btn" (click)="openSaveDialog()" title="Save preset to amplifier">
          <mat-icon aria-hidden="true">save</mat-icon>
          <span>Save</span>
        </button>
        <button type="button" class="action-pill-btn" (click)="fileInput.click()" title="Import .fuse or .xml preset">
          <mat-icon aria-hidden="true">file_upload</mat-icon>
          <span>Import</span>
        </button>
        <button type="button" class="action-pill-btn" (click)="exportFusePreset()" title="Export .fuse preset">
          <mat-icon aria-hidden="true">file_download</mat-icon>
          <span>Export</span>
        </button>
        <input #fileInput type="file" accept=".fuse,.xml" (change)="importFusePreset($event)" style="display: none;" />
      </div>
    </nav>

    <dialog #saveDialog class="fuse-modal-dialog" aria-labelledby="sidebar-save-title" (close)="onDialogClose()">
      <form method="dialog" class="modal-form">
        <h2 id="sidebar-save-title">Save Preset</h2>
        <div class="form-field">
          <label for="sidebar-preset-name-input">Preset Name</label>
          <input
            #presetNameInput
            id="sidebar-preset-name-input"
            type="text"
            maxlength="32"
            required
            autofocus
            [value]="draftName()"
            (input)="onDraftNameInput($event)"
          />
        </div>
        <div class="modal-actions">
          <button type="submit" value="cancel" formnovalidate class="btn-secondary">Cancel</button>
          <button type="submit" value="save" class="btn-primary">Save</button>
        </div>
      </form>
    </dialog>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        background: var(--mat-sys-surface-dim);
        width: 264px;
        height: 100%;
        overflow: hidden;
        user-select: none;
        flex-shrink: 0;
      }

      .sidebar-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .sidebar-search-wrapper {
        padding: 12px 12px 8px;
      }

      /* M3 Search Bar Pill */
      .sidebar-search-box {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 44px;
        padding: 0 16px;
        border-radius: var(--md-corner-full);
        background: var(--mat-sys-surface-container-high);
        transition: background-color 0.15s;

        &:focus-within {
          background: var(--mat-sys-surface-container-highest);
          outline: 2px solid var(--mat-sys-primary);
          outline-offset: -2px;
        }

        .search-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          color: var(--mat-sys-on-surface-variant);
        }

        .search-input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--mat-sys-on-surface);
          padding: 0;
          font-size: 0.875rem;
          outline: none;

          &::placeholder {
            color: var(--mat-sys-on-surface-variant);
          }

          &:focus-visible {
            outline: none;
          }
        }
      }

      .presets-list-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 4px 12px;
      }

      .preset-items {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .preset-row {
        margin: 0;
      }

      /* M3 Navigation Drawer Item Pill */
      .preset-item-btn {
        width: 100%;
        height: 44px;
        text-align: start;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 16px;
        background: transparent;
        border: none;
        border-radius: var(--md-corner-full);
        color: var(--mat-sys-on-surface-variant);
        cursor: pointer;
        font-family: var(--font-sans);
        font-size: 0.875rem;
        font-weight: 500;
        transition:
          background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
          color 0.15s cubic-bezier(0.2, 0, 0, 1);

        &:hover {
          color: var(--mat-sys-on-surface);
          background: var(--mat-sys-surface-container);
        }

        &.active {
          color: var(--mat-sys-on-secondary-container);
          background: var(--mat-sys-secondary-container);
          font-weight: 600;

          .slot-num {
            color: var(--mat-sys-primary);
            background: rgba(140, 207, 249, 0.14);
          }
        }

        .slot-num {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--mat-sys-on-surface-variant);
          padding: 2px 7px;
          border-radius: var(--md-corner-full);
          background: var(--mat-sys-surface-container-low);
          flex-shrink: 0;
        }

        .preset-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .sidebar-bottom-controls {
        display: flex;
        gap: 8px;
        padding: 12px;
      }

      /* M3 Tonal Action Pills */
      .action-pill-btn {
        flex: 1;
        height: 36px;
        background: var(--mat-sys-surface-container-high);
        border: none;
        color: var(--mat-sys-on-surface);
        padding: 0 10px;
        border-radius: var(--md-corner-full);
        font-family: var(--font-sans);
        font-size: 0.78rem;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition:
          background-color 0.15s,
          color 0.15s;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          color: var(--mat-sys-primary);
        }

        &:hover {
          background: var(--mat-sys-secondary-container);
          color: var(--mat-sys-on-secondary-container);
        }
      }

      /* M3 Dialog */
      .fuse-modal-dialog {
        background: var(--mat-sys-surface-container-high);
        color: var(--mat-sys-on-surface);
        border: none;
        border-radius: var(--md-corner-2xl);
        padding: 24px;
        min-width: 320px;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
      }

      .fuse-modal-dialog:modal {
        overscroll-behavior: contain;
      }

      .fuse-modal-dialog::backdrop {
        background: rgba(0, 0, 0, 0.55);
        overflow: hidden;
        overscroll-behavior: contain;
      }

      .modal-form {
        display: flex;
        flex-direction: column;
        gap: 16px;

        h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
        }
      }

      .form-field {
        display: flex;
        flex-direction: column;
        gap: 8px;

        label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--mat-sys-on-surface-variant);
        }

        input {
          background: var(--mat-sys-surface-container-highest);
          border: none;
          color: var(--mat-sys-on-surface);
          padding: 12px 14px;
          border-radius: var(--md-corner-md);
          font-size: 0.9375rem;
        }
      }

      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;

        .btn-secondary {
          background: transparent;
          border: none;
          color: var(--mat-sys-primary);
          font-weight: 500;
          padding: 10px 18px;
          border-radius: var(--md-corner-full);
          cursor: pointer;

          &:hover {
            background: rgba(140, 207, 249, 0.08);
          }
        }

        .btn-primary {
          background: var(--mat-sys-primary);
          border: none;
          color: var(--mat-sys-on-primary);
          font-weight: 600;
          padding: 10px 20px;
          border-radius: var(--md-corner-full);
          cursor: pointer;
        }
      }

      @media (max-width: 850px) {
        :host {
          width: 100%;
          height: 190px;
        }
      }
    `,
  ],
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
