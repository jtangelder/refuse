import { Component, ChangeDetectionStrategy, computed, input, output } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KnobComponent } from './knob';
import { DspType, type EffectSettings, type ModelDef } from '../lib';

@Component({
  selector: 'fuse-effect-editor',
  imports: [MatMenuModule, MatButtonModule, MatIconModule, MatSlideToggleModule, MatTooltipModule, KnobComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './effect_editor.ng.html',
  styleUrl: './effect_editor.scss',
})
export class EffectEditorComponent {
  activeSlot = input<number | null>(null);
  slotCategory = input<DspType | null>(null);
  effect = input<EffectSettings | null>(null);
  allEffects = input<(EffectSettings | null)[]>([]);
  effectModels = input<ModelDef[]>([]);

  assignChange = output<number>();
  toggleChange = output<boolean>();
  knobChange = output<{ index: number; value: number }>();
  clearRequest = output<void>();
  movePositionRequest = output<{ fromSlot: number; toSlot: number }>();

  protected DspType = DspType;

  isPostAmp = computed(() => {
    const slot = this.activeSlot();
    return slot !== null && slot >= 4;
  });

  currentCategory = computed<DspType>(() => {
    return this.effect()?.type ?? this.slotCategory() ?? (this.isPostAmp() ? DspType.MOD : DspType.STOMP);
  });

  slotCategoryName = computed(() => {
    switch (this.currentCategory()) {
      case DspType.STOMP:
        return 'Stompbox';
      case DspType.MOD:
        return 'Modulation';
      case DspType.DELAY:
        return 'Delay';
      case DspType.REVERB:
        return 'Reverb';
      default:
        return 'Effect';
    }
  });

  categoryModels = computed(() => {
    const cat = this.currentCategory();
    return this.effectModels().filter(m => m.type === cat);
  });

  currentModelName = computed(() => {
    const eff = this.effect();
    if (!eff || !eff.modelId) {
      return `-- Select ${this.slotCategoryName()} Model --`;
    }
    return eff.model || 'Unknown';
  });

  canMovePosition = computed(() => {
    const cat = this.currentCategory();
    return !!this.effect() && cat !== DspType.STOMP;
  });

  onAssignEffect(modelId: number | string) {
    this.assignChange.emit(Number(modelId));
  }

  onToggleEffect(enabled: boolean) {
    this.toggleChange.emit(enabled);
  }

  onKnobChange(index: number, value: number) {
    this.knobChange.emit({ index, value });
  }

  onClearSlot() {
    this.clearRequest.emit();
  }

  onMovePosition() {
    const slot = this.activeSlot();
    if (slot === null) return;
    const effs = this.allEffects();
    const toStart = slot < 4 ? 4 : 0;
    let targetSlot = toStart;
    for (let s = toStart; s < toStart + 4; s++) {
      if (!effs[s]) {
        targetSlot = s;
        break;
      }
    }
    this.movePositionRequest.emit({ fromSlot: slot, toSlot: targetSlot });
  }
}
