/**
 * Fender Mustang WebHID API - Type Definitions
 * State interfaces and data types
 */

import { DspType } from "./constants";

export interface AmpState {
  modelId: number;
  name: string;
  knobs: number[];
  bias: number;
  noiseGate: number;
  threshold: number;
  cabinetId: number;
  sag: number;
  bright: boolean;
}

export interface EffectState {
  slot: number;
  modelId: number;
  name: string;
  type: DspType;
  enabled: boolean;
  knobs: number[];
}

export interface Preset {
  slot: number;
  name: string;
  amp: AmpState;
  effects: (EffectState | null)[];
}

export interface UpdateEvent {
  type: "knob" | "preset" | "bypass" | "name";
  detail?: any;
}
