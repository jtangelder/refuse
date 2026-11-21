import { Component, ChangeDetectionStrategy, input, output, computed, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KnobComponent } from './knob';
import {
  AMP_DISCRETE_PARAMS,
  type AdvancedAmpParam,
  type AmpSettings,
  type CabinetDef,
  type KnobInfo,
  type ModelDef,
} from '../lib';

interface AdvancedSettingDef {
  key: AdvancedAmpParam;
  label: string;
  max?: number;
  labels?: readonly string[];
  requiresCustomGate?: boolean;
}

@Component({
  selector: 'fuse-amp-editor',
  imports: [MatMenuModule, MatButtonModule, MatIconModule, MatTooltipModule, KnobComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amp_editor.ng.html',
  styleUrl: './amp_editor.scss',
})
export class AmpEditorComponent {
  settings = input<AmpSettings | null>(null);
  knobs = input<KnobInfo[]>([]);
  ampModels = input<ModelDef[]>([]);
  cabModels = input<CabinetDef[]>([]);

  ampChange = output<number>();
  cabinetChange = output<number>();
  knobChange = output<{ index: number; value: number }>();
  advancedSettingChange = output<{ key: AdvancedAmpParam; value: number }>();

  showAdvanced = signal(false);

  toggleAdvanced() {
    this.showAdvanced.update(v => !v);
  }

  protected advancedSettingsDefinition: readonly AdvancedSettingDef[] = [
    { key: 'bias', label: 'Bias' },
    {
      key: 'noiseGate',
      label: 'Noise Gate',
      max: AMP_DISCRETE_PARAMS['noiseGate'].max,
      labels: AMP_DISCRETE_PARAMS['noiseGate'].labels,
    },
    {
      key: 'threshold',
      label: 'Gate Thresh',
      max: AMP_DISCRETE_PARAMS['threshold'].max,
      requiresCustomGate: true,
    },
    {
      key: 'sag',
      label: 'Sag',
      max: AMP_DISCRETE_PARAMS['sag'].max,
      labels: AMP_DISCRETE_PARAMS['sag'].labels,
    },
    {
      key: 'brightness',
      label: 'Brightness',
      max: AMP_DISCRETE_PARAMS['brightness'].max,
      labels: AMP_DISCRETE_PARAMS['brightness'].labels,
    },
    { key: 'depth', label: 'Depth', requiresCustomGate: true },
  ];

  isAdvancedSettingDisabled(setting: AdvancedSettingDef): boolean {
    if (!setting.requiresCustomGate) return false;
    return (this.settings()?.noiseGate ?? 0) !== 5;
  }

  currentAmpName = computed(() => {
    const s = this.settings();
    return s?.model || 'Unknown Amp';
  });

  currentCabName = computed(() => {
    const id = this.settings()?.cabinetId;
    const model = this.cabModels().find(c => c.id === id);
    return model ? model.name : 'Off';
  });

  ampGroups = computed(() => {
    const models = this.ampModels();
    return {
      fender: models.filter(m => m.name.startsWith("'") || m.name.includes('Super-Sonic')),
      british: models.filter(m => m.name.includes('British')),
      other: models.filter(
        m => !m.name.startsWith("'") && !m.name.includes('Super-Sonic') && !m.name.includes('British'),
      ),
    };
  });

  cabGroups = computed(() => {
    const models = this.cabModels();
    return {
      single: models.filter(m => m.name.startsWith('1x')),
      double: models.filter(m => m.name.startsWith('2x')),
      quad: models.filter(m => m.name.startsWith('4x')),
    };
  });

  activeAmpGroup = computed<'fender' | 'british' | 'other' | null>(() => {
    const id = this.settings()?.modelId;
    if (id === undefined) return null;
    const groups = this.ampGroups();
    if (groups.fender.some(m => m.id === id)) return 'fender';
    if (groups.british.some(m => m.id === id)) return 'british';
    if (groups.other.some(m => m.id === id)) return 'other';
    return null;
  });

  activeCabGroup = computed<'off' | 'single' | 'double' | 'quad' | null>(() => {
    const id = this.settings()?.cabinetId;
    if (id === undefined) return null;
    if (id === 0) return 'off';
    const groups = this.cabGroups();
    if (groups.single.some(c => c.id === id)) return 'single';
    if (groups.double.some(c => c.id === id)) return 'double';
    if (groups.quad.some(c => c.id === id)) return 'quad';
    return null;
  });

  onAmpChange(value: number | string) {
    this.ampChange.emit(Number(value));
  }

  onCabinetChange(value: number | string) {
    this.cabinetChange.emit(Number(value));
  }

  onKnobChange(index: number, value: number) {
    this.knobChange.emit({ index, value });
  }

  onAdvancedSettingChange(key: AdvancedAmpParam, value: number) {
    this.advancedSettingChange.emit({ key, value });
  }

  getAmpSetting(key: keyof AmpSettings) {
    return this.settings() ? this.settings()![key] : 0;
  }

  getAmpSettingNumberValue(key: keyof AmpSettings): number {
    return Number(this.getAmpSetting(key));
  }
}
