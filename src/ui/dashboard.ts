import { Component, computed, inject } from '@angular/core';
import { AMP_MODELS, CABINET_MODELS, EFFECT_MODELS } from '../lib';
import { CommonModule } from '@angular/common';
import { SignalChainComponent } from './signal_chain';
import { AmpEditorComponent } from './amp_editor';
import { EffectEditorComponent } from './effect_editor';

import { FuseService } from '../services/fuse.service';
import { AmpService } from '../services/amp.service';
import { EffectService } from '../services/effect.service';

@Component({
  selector: 'fuse-dashboard',
  standalone: true,
  imports: [CommonModule, SignalChainComponent, AmpEditorComponent, EffectEditorComponent],
  template: `
    <!-- Signal Chain Status -->
    <fuse-signal-chain
      [activeSlot]="activeSlot"
      [effects]="allEffectSettings()"
      (activeSlotChange)="activeSlot = $event"
      (swap)="swapSlots($event.slotA, $event.slotB)"
    ></fuse-signal-chain>

    <div class="editor-container">
      <!-- Amp Control -->
      <fuse-amp-editor
        *ngIf="activeSlot === 'amp'"
        [settings]="ampSettings()"
        [knobs]="ampKnobs()"
        [ampModels]="ampModels"
        [cabModels]="cabModels"
        (ampChange)="changeAmp($event)"
        (cabinetChange)="changeCabinet($event)"
        (knobChange)="changeAmpKnob($event.index, $event.value)"
        (advancedSettingChange)="changeAdvancedSetting($event.key, $event.value)"
      ></fuse-amp-editor>

      <!-- Slot Control -->
      <fuse-effect-editor
        *ngIf="isEffectSlot(activeSlot)"
        [activeSlot]="asNumber(activeSlot)"
        [effect]="asNumber(activeSlot) !== null ? allEffectSettings()[asNumber(activeSlot)!] : null"
        [effectModels]="effectModels"
        (assignChange)="assignEffect(asNumber(activeSlot)!, $event)"
        (toggleChange)="toggleEffect(asNumber(activeSlot)!, $event)"
        (knobChange)="changeEffectKnob(asNumber(activeSlot)!, $event.index, $event.value)"
        (swapRequests)="swapSlots($event.slotA, $event.slotB)"
        (clearRequest)="clearSlot(asNumber(activeSlot)!)"
      ></fuse-effect-editor>

      <div *ngIf="activeSlot === null" class="empty-state">
        <p>Select an item in the signal chain to edit its settings.</p>
      </div>
    </div>
  `,
  styles: [
    `
      .editor-container {
        padding: 20px;
        max-width: 800px;
        margin: 0 auto;
      }
      .empty-state {
        text-align: center;
        padding: 50px;
        color: #666;
        font-style: italic;
      }
    `,
  ],
})
export class DashboardComponent {
  protected readonly service = inject(FuseService);
  protected readonly ampService = inject(AmpService);
  protected readonly effectService = inject(EffectService);

  protected activeSlot: number | 'amp' | null = null;

  protected ampModels = Object.values(AMP_MODELS);
  protected cabModels = CABINET_MODELS;
  protected effectModels = Object.values(EFFECT_MODELS);

  // Computed signals
  ampSettings = computed(() => {
    // We access ampState to register dependency
    this.service.amp();
    return this.ampService.getSettings();
  });

  ampKnobs = computed(() => {
    this.service.amp();
    return this.ampService.getAmpKnobs();
  });

  allEffectSettings = computed(() => {
    this.service.effects(); // Dependency
    // We map over 0..7
    return Array.from({ length: 8 }, (_, i) => i).map(i => this.effectService.getSettings(i));
  });

  async clearSlot(slot: number) {
    await this.effectService.clearEffect(slot);
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

  async changeAdvancedSetting(key: string, value: number) {
    const byteIndexMap: Record<string, number> = {
      bias: 42,
      noiseGate: 47,
      threshold: 48,
      sag: 51,
      brightness: 52,
      depth: 41,
    };
    const byteIndex = byteIndexMap[key];
    if (byteIndex) {
      // Map byte index to knob index (assuming offset 32)
      const knobIndex = byteIndex - 32;
      await this.ampService.setAmpKnob(knobIndex, value);
    }
  }

  async assignEffect(slot: number, modelId: number) {
    if (modelId === 0) {
      await this.effectService.clearEffect(slot);
    } else {
      await this.effectService.setEffectById(slot, modelId);
    }
  }

  async toggleEffect(slot: number, enabled: boolean) {
    await this.effectService.setEffectEnabled(slot, enabled);
  }

  async changeEffectKnob(slot: number, index: number, value: number) {
    await this.effectService.setEffectKnob(slot, index, value);
  }

  async swapSlots(slotA: number, slotB: number) {
    await this.effectService.swapEffects(slotA, slotB);
    this.activeSlot = slotB; // Follow the effect
  }

  protected isEffectSlot(slot: number | 'amp' | null): boolean {
    return typeof slot === 'number';
  }

  protected asNumber(slot: number | 'amp' | null): number | null {
    return typeof slot === 'number' ? slot : null;
  }
}
