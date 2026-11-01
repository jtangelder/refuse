import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DragDropModule, type CdkDrag, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  DspType,
  getDelayTimeKnobIndex,
  isWideEffect,
  isRackUnit,
  getEffectFormFactor,
  type EffectSettings,
  type AmpSettings,
  type CabinetDef,
} from '../lib';

export interface ChainEffectItem {
  slot: number;
  position: 'pre' | 'post';
  type: DspType;
  model: string;
  modelId: number;
  enabled: boolean;
  effect: EffectSettings;
  typeTitle: string;
  typeTag: string;
}

export interface EmptySlotPlaceholder {
  category: DspType;
  label: string;
  targetSlot: number;
}

@Component({
  selector: 'fuse-signal-chain',
  imports: [DragDropModule, MatButtonModule, MatIconModule, MatSlideToggleModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './signal_chain.ng.html',
  styleUrls: ['./sprites.css', './signal_chain.scss'],
})
export class SignalChainComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly toneCanvasRef = viewChild<ElementRef<HTMLElement>>('toneCanvas');

  isMobile = input<boolean>(false);
  activeSlot = input<number | 'amp' | null>(null);
  selectedCategory = input<DspType | null>(null);
  effects = input<(EffectSettings | null)[]>([]);
  ampSettings = input<AmpSettings | null>(null);
  cabinetModels = input<CabinetDef[]>([]);

  activeSlotChange = output<number | 'amp'>();
  emptyCategorySelect = output<{ slot: number; category: DspType }>();
  toggleEffect = output<{ slot: number; enabled: boolean }>();
  clearEffect = output<number>();
  movePosition = output<{ fromSlot: number; toSlot: number }>();
  tapTempoBpm = output<number>();
  openPresetInfo = output<void>();

  private readonly canvasWidth = signal<number>(0);
  private readonly canvasHeight = signal<number>(0);

  // Dynamic scale factor based on available canvas dimensions & active chain blocks
  chainScale = computed<number>(() => {
    const w = this.canvasWidth();
    const h = this.canvasHeight();
    if (w <= 0 || h <= 0) {
      return 1.3;
    }

    const preCount = this.preEffects().length;
    const preEmpty = this.preEmptySlots().length;
    const postCount = this.postEffects().length;
    const postEmpty = this.postEmptySlots().length;

    const preTotal = preCount + preEmpty;
    const postTotal = postCount + postEmpty;

    // Base horizontal width calculation taking into account wide pedals & rack units
    let preOccupiedW = 0;
    for (const eff of this.preEffects()) {
      const formFactor = getEffectFormFactor(eff.modelId);
      preOccupiedW += formFactor === 'rack' ? 210 : formFactor === 'wide' ? 176 : 136;
    }
    let postOccupiedW = 0;
    for (const eff of this.postEffects()) {
      const formFactor = getEffectFormFactor(eff.modelId);
      postOccupiedW += formFactor === 'rack' ? 210 : formFactor === 'wide' ? 176 : 136;
    }
    const baseOccupiedW = preOccupiedW + 220 + postOccupiedW;
    const baseEmptyW = (preEmpty + postEmpty) * 80 * 0.85;
    const totalSlots = preTotal + 1 + postTotal;
    const totalGaps = Math.max(0, totalSlots - 1);
    const baseSpacingW = totalGaps * 28;
    const totalBaseW = baseOccupiedW + baseEmptyW + baseSpacingW;

    const availW = Math.max(320, w - 48);
    const availH = Math.max(210, h - 50); // subtract bottom dock height + padding

    const scaleW = availW / totalBaseW;
    const scaleH = availH / 228; // 170px frame + 48px info + 10px margin

    const fitScale = Math.min(scaleW, scaleH);
    // Keep pedals & amp prominently sized on desktop viewports
    const minScale = w >= 720 ? Math.min(scaleH, 1.15) : 0.95;
    const clamped = Math.min(1.6, Math.max(minScale, fitScale));
    return Math.round(clamped * 100) / 100;
  });

  emptyScale = computed<number>(() => {
    const s = this.chainScale();
    return Math.round(Math.min(1.2, Math.max(0.9, s * 0.82)) * 100) / 100;
  });

  // Interactive Tap Tempo BPM
  bpm = signal<number>(120);
  private lastTapTime = 0;

  constructor() {
    afterNextRender(() => {
      const el = this.toneCanvasRef()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;

      const updateSize = (width: number, height: number) => {
        this.canvasWidth.set(Math.round(width));
        this.canvasHeight.set(Math.round(height));
      };

      const rect = el.getBoundingClientRect();
      updateSize(rect.width, rect.height);

      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          updateSize(entry.contentRect.width, entry.contentRect.height);
        }
      });
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  displayBpm = computed<number>(() => {
    for (const eff of this.effects()) {
      if (eff && eff.type === DspType.DELAY) {
        const timeIdx = getDelayTimeKnobIndex(eff.modelId);
        const timeKnob = timeIdx !== null ? eff.knobs.find(k => k.index === timeIdx) : undefined;
        if (timeKnob && timeKnob.value > 0) {
          const delayMs = (timeKnob.value / 255) * 1500;
          return Math.min(240, Math.max(40, Math.round(60000 / delayMs)));
        }
      }
    }
    return this.bpm();
  });

  ampModelName = computed(() => {
    const s = this.ampSettings();
    if (!s) return "American '90s";
    return s.model || "American '90s";
  });

  currentCabName = computed(() => {
    const id = this.ampSettings()?.cabinetId;
    const cab = this.cabinetModels().find(c => c.id === id);
    return cab ? cab.name : 'Cabinet Off';
  });

  protected readonly isWideEffect = isWideEffect;
  protected readonly isRackUnit = isRackUnit;

  // Active Pre-Amp effects ordered by slot index (slots 0..3)
  preEffects = computed<ChainEffectItem[]>(() => {
    const effs = this.effects();
    const items: ChainEffectItem[] = [];
    for (let s = 0; s < 4; s++) {
      const eff = effs[s];
      if (eff) {
        items.push({
          slot: s,
          position: 'pre',
          type: eff.type,
          model: eff.model,
          modelId: eff.modelId,
          enabled: eff.enabled,
          effect: eff,
          typeTitle: this.getTypeTitle(eff.type),
          typeTag: 'PRE-AMP',
        });
      }
    }
    return items;
  });

  // Active Post-Amp effects ordered by slot index (slots 4..7)
  postEffects = computed<ChainEffectItem[]>(() => {
    const effs = this.effects();
    const items: ChainEffectItem[] = [];
    for (let s = 4; s < 8; s++) {
      const eff = effs[s];
      if (eff) {
        items.push({
          slot: s,
          position: 'post',
          type: eff.type,
          model: eff.model,
          modelId: eff.modelId,
          enabled: eff.enabled,
          effect: eff,
          typeTitle: this.getTypeTitle(eff.type),
          typeTag: 'POST-AMP RACK',
        });
      }
    }
    return items;
  });

  // Empty slot cards for unassigned categories in Pre-Amp
  preEmptySlots = computed<EmptySlotPlaceholder[]>(() => {
    const effs = this.effects();
    const activePreCount = effs.slice(0, 4).filter(e => e !== null).length;
    if (activePreCount >= 4) return [];

    let nextSlot = -1;
    for (let i = 0; i < 4; i++) {
      if (effs[i] === null) {
        nextSlot = i;
        break;
      }
    }
    if (nextSlot === -1) return [];

    const usedTypes = new Set<DspType>();
    for (let i = 0; i < 8; i++) {
      const e = effs[i];
      if (e) usedTypes.add(e.type);
    }

    const placeholders: EmptySlotPlaceholder[] = [];
    const allPreTypes = [
      { type: DspType.STOMP, label: 'STOMP' },
      { type: DspType.MOD, label: 'MOD' },
      { type: DspType.DELAY, label: 'DELAY' },
      { type: DspType.REVERB, label: 'REVERB' },
    ];

    for (const t of allPreTypes) {
      if (!usedTypes.has(t.type)) {
        placeholders.push({
          category: t.type,
          label: t.label,
          targetSlot: nextSlot,
        });
      }
    }
    return placeholders;
  });

  // Empty slot cards for unassigned categories in Post-Amp (Stompbox excluded)
  postEmptySlots = computed<EmptySlotPlaceholder[]>(() => {
    const effs = this.effects();
    const activePostCount = effs.slice(4, 8).filter(e => e !== null).length;
    if (activePostCount >= 4) return [];

    let nextSlot = -1;
    for (let i = 4; i < 8; i++) {
      if (effs[i] === null) {
        nextSlot = i;
        break;
      }
    }
    if (nextSlot === -1) return [];

    const usedTypes = new Set<DspType>();
    for (let i = 0; i < 8; i++) {
      const e = effs[i];
      if (e) usedTypes.add(e.type);
    }

    const placeholders: EmptySlotPlaceholder[] = [];
    const allPostTypes = [
      { type: DspType.MOD, label: 'MOD' },
      { type: DspType.DELAY, label: 'DELAY' },
      { type: DspType.REVERB, label: 'REVERB' },
    ];

    for (const t of allPostTypes) {
      if (!usedTypes.has(t.type)) {
        placeholders.push({
          category: t.type,
          label: t.label,
          targetSlot: nextSlot,
        });
      }
    }
    return placeholders;
  });

  canDropInPost = (drag: CdkDrag<ChainEffectItem>): boolean => {
    // Hardware limitation: Stompbox can ONLY be in Pre-Amp!
    return drag.data.type !== DspType.STOMP;
  };

  onDropPre(event: CdkDragDrop<ChainEffectItem[]>) {
    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;
      const list = this.preEffects();
      if (!list[event.previousIndex] || !list[event.currentIndex]) return;
      const fromSlot = list[event.previousIndex].slot;
      const toSlot = list[event.currentIndex].slot;
      this.movePosition.emit({ fromSlot, toSlot });
    } else {
      // Cross-container: Post to Pre
      const draggedItem = event.item.data as ChainEffectItem;
      if (!draggedItem) return;
      const preList = this.preEffects();
      if (preList.length >= 4) return;
      let toSlot: number;
      if (preList.length === 0) {
        toSlot = 0;
      } else if (event.currentIndex < preList.length) {
        toSlot = preList[event.currentIndex].slot;
      } else {
        toSlot = Math.min(preList.length, 3);
      }
      this.movePosition.emit({ fromSlot: draggedItem.slot, toSlot });
    }
  }

  onDropPost(event: CdkDragDrop<ChainEffectItem[]>) {
    const draggedItem = event.item.data as ChainEffectItem;
    if (!draggedItem) return;

    // Hardware limitation: Stompbox can NEVER be in Post-Amp!
    if (draggedItem.type === DspType.STOMP) return;

    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;
      const list = this.postEffects();
      if (!list[event.previousIndex] || !list[event.currentIndex]) return;
      const fromSlot = list[event.previousIndex].slot;
      const toSlot = list[event.currentIndex].slot;
      this.movePosition.emit({ fromSlot, toSlot });
    } else {
      // Cross-container: Pre to Post
      const postList = this.postEffects();
      if (postList.length >= 4) return;
      let toSlot: number;
      if (postList.length === 0) {
        toSlot = 4;
      } else if (event.currentIndex < postList.length) {
        toSlot = postList[event.currentIndex].slot;
      } else {
        toSlot = Math.min(4 + postList.length, 7);
      }
      this.movePosition.emit({ fromSlot: draggedItem.slot, toSlot });
    }
  }

  onSelectSlot(slot: number) {
    this.activeSlotChange.emit(slot);
  }

  onSelectEmpty(slot: number, category: DspType) {
    this.emptyCategorySelect.emit({ slot, category });
  }

  onSelectAmp() {
    this.activeSlotChange.emit('amp');
  }

  onToggleBypass(event: Event, item: ChainEffectItem) {
    event.stopPropagation();
    this.toggleEffect.emit({
      slot: item.slot,
      enabled: !item.enabled,
    });
  }

  onToggleBypassSlide(item: ChainEffectItem, enabled: boolean) {
    this.toggleEffect.emit({
      slot: item.slot,
      enabled,
    });
  }

  getTypeTitle(type: DspType): string {
    switch (type) {
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
  }

  onOpenPresetInfo() {
    this.openPresetInfo.emit();
  }

  onTapTempo() {
    const now = performance.now();
    if (this.lastTapTime > 0) {
      const delta = now - this.lastTapTime;
      if (delta > 200 && delta < 3000) {
        const calculatedBpm = Math.min(240, Math.max(40, Math.round(60000 / delta)));
        this.bpm.set(calculatedBpm);
        this.tapTempoBpm.emit(calculatedBpm);
      }
    }
    this.lastTapTime = now;
  }

  getAmpClass(_modelName?: string, modelId?: number): string {
    if (modelId) {
      const idHex = modelId.toString(16).toUpperCase().padStart(4, '0');
      return `device-icon device-0x${idHex}`;
    }
    return 'device-icon device-0x6700';
  }

  getEffectClass(_modelName?: string, modelId?: number): string {
    if (modelId) {
      const idHex = modelId.toString(16).toUpperCase().padStart(4, '0');
      return `device-icon device-0x${idHex}`;
    }
    return 'device-icon device-0x3C00';
  }
}
