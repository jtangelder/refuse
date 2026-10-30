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
      <div class="sidebar-search-box">
        <mat-icon class="search-icon" aria-hidden="true">search</mat-icon>
        <input
          type="search"
          class="search-input"
          placeholder="Filter presets..."
          aria-label="Filter presets"
          [value]="searchQuery()"
          (input)="onSearchInput($event)"
        />
      </div>

      <div class="presets-list-scroll">
        <ul class="preset-items" role="list">
          @for (slot of filteredSlots(); track slot) {
            <li class="preset-row">
              <button
                type="button"
                (click)="changePreset(slot)"
                [class.active]="service.currentPresetSlot() === slot"
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
        background: #161719;
        border-right: 1px solid #23252b;
        width: 240px;
        height: 100%;
        overflow: hidden;
        user-select: none;
      }

      .sidebar-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .sidebar-search-box {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid #202227;
        background: #131416;

        .search-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          color: #64748b;
        }

        .search-input {
          flex: 1;
          background: #1c1d22;
          border: 1px solid #2d303a;
          color: #f1f5f9;
          padding: 5px 8px;
          border-radius: 4px;
          font-size: 0.78rem;
          outline: none;

          &:focus-visible {
            border-color: #00b0ff;
          }
        }
      }

      .presets-list-scroll {
        flex: 1;
        overflow-y: auto;
      }

      .preset-items {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .preset-row {
        border-bottom: 1px solid #202227;
      }

      .preset-item-btn {
        width: 100%;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: transparent;
        border: none;
        color: #8c92a4;
        cursor: pointer;
        font-size: 0.84rem;
        font-weight: 500;
        transition: all 0.12s;

        &:hover {
          color: #f1f5f9;
          background: #1d1e22;
        }

        &.active {
          color: #ffffff;
          background: #25272e;
          font-weight: 700;

          .slot-num {
            color: #ffffff;
          }
        }

        .slot-num {
          font-variant: tabular-nums;
          font-size: 0.85rem;
          font-weight: 800;
          color: #9da3b4;
          width: 24px;
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
        gap: 6px;
        padding: 10px 10px;
        border-top: 1px solid #202227;
        background: #131416;
      }

      .action-pill-btn {
        flex: 1;
        background: #1c1d22;
        border: 1px solid #2d303a;
        color: #a0a6b8;
        padding: 6px 6px;
        border-radius: 4px;
        font-size: 0.72rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.15s;

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }

        &:hover {
          border-color: #00b0ff;
          color: #00b0ff;
          background: #23252d;
        }
      }

      .fuse-modal-dialog {
        background: #18181b;
        color: #f4f4f5;
        border: 1px solid #3f3f46;
        border-radius: 12px;
        padding: 24px;
        min-width: 320px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.75);
      }

      .fuse-modal-dialog:modal {
        overscroll-behavior: contain;
      }

      .fuse-modal-dialog::backdrop {
        background: rgba(0, 0, 0, 0.65);
        overflow: hidden;
        overscroll-behavior: contain;
      }

      .modal-form {
        display: flex;
        flex-direction: column;
        gap: 16px;

        h2 {
          font-size: 1.15rem;
          margin: 0;
        }
      }

      .form-field {
        display: flex;
        flex-direction: column;
        gap: 6px;

        label {
          font-size: 0.78rem;
          font-weight: 600;
          color: #a1a1aa;
        }

        input {
          background: #27272a;
          border: 1px solid #3f3f46;
          color: #ffffff;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.9rem;
        }
      }

      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 8px;

        .btn-secondary {
          background: #27272a;
          border: 1px solid #3f3f46;
          color: #e4e4e7;
        }

        .btn-primary {
          background: #00b0ff;
          color: #000000;
          font-weight: 700;
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
