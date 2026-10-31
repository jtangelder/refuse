import { Component, ChangeDetectionStrategy, input, output, computed, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { KnobComponent } from './knob';
import type { KnobInfo, CabinetDef, ModelDef, AmpSettings, AdvancedAmpParam } from '../lib';

@Component({
  selector: 'fuse-amp-editor',
  imports: [MatMenuModule, MatButtonModule, MatIconModule, KnobComponent],
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

  protected advancedSettingsDefinition: { key: AdvancedAmpParam; label: string }[] = [
    { key: 'bias', label: 'Bias' },
    { key: 'noiseGate', label: 'Noise Gate' },
    { key: 'threshold', label: 'Gate Thresh' },
    { key: 'sag', label: 'Sag' },
    { key: 'brightness', label: 'Brightness' },
    { key: 'depth', label: 'Depth' },
  ];

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
