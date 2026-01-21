import { DspType } from './models';

export interface EntityState {
  modelId: number;
  enabled: boolean;
  // We store the raw knob values (0-255) indexed by their parameter index.
  // This corresponds to bytes 32-63 in the raw packet.
  knobs: number[];
}

export interface AmpState extends EntityState {
  cabinetId: number;
}

export interface EffectState extends EntityState {
  type: DspType;
  slot: number;
}
