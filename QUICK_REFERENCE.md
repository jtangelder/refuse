# Quick Reference Card

## 🚀 Common Tasks

### Initialize & Connect
```typescript
import { FuseAPI } from './api';

const api = new FuseAPI();
await api.connect();

// Use api...

await api.disconnect();
```

### Get Current State
```typescript
const preset = api.getPreset();

console.log(preset.amp.name);           // "'57 Deluxe"
console.log(preset.amp.modelId);        // 0x6700
console.log(preset.amp.knobs);          // [170, 153, 128, ...]
console.log(preset.amp.cabinetId);      // Cabinet ID
console.log(preset.effects[0]?.name);   // Effect in slot 0
```

### Change Amp Model
```typescript
import { AMP_MODELS } from './api';

await api.setAmpModel(AMP_MODELS.F57_DELUXE.id);
await api.setAmpModel(AMP_MODELS.BRIT_70S.id);
```

### Control Amp Parameters
```typescript
import { AmpParam } from './api';

await api.setAmpParameter(AmpParam.VOLUME, 200);    // 0-255
await api.setAmpParameter(AmpParam.TREBLE, 180);
await api.setAmpParameter(AmpParam.BASS, 160);
await api.setAmpParameter(AmpParam.MIDDLE, 150);
```

### Control Amp Advanced
```typescript
await api.setBright(true);              // Toggle bright switch
await api.setSag(1);                    // 0=Match, 1=Low, 2=High
await api.setNoiseGate(3);              // 0-5
await api.setGateThreshold(5);          // 0-9
await api.setCabinet(0x01);             // Cabinet ID
```

### Add Effect to Slot
```typescript
import { STOMP_MODELS, MOD_MODELS } from './api';

// Stomp in slot 0
await api.setEffect(0, STOMP_MODELS.OVERDRIVE.id);

// Mod in slot 2
await api.setEffect(2, MOD_MODELS.SINE_CHORUS.id);
```

### Control Effects
```typescript
// Change knob 0 in slot 0 to value 200
await api.setEffectKnob(0, 0, 200);

// Enable/disable effect in slot 0
await api.setEffectEnabled(0, true);

// Remove effect from slot 0
await api.removeEffect(0);
```

### Switch Presets
```typescript
// Get available presets
const presets = api.getPresetList();
console.log(presets[5]);  // "My Tone"

// Switch to preset slot 5
await api.setPreset(5);
```

### Monitor Hardware
```typescript
api.monitorHardwareChanges((event) => {
  if (event.type === 'knob') {
    console.log('Knob turned on DSP:', event.detail);
  }
  if (event.type === 'preset') {
    console.log('Preset selected:', event.detail);
  }
  if (event.type === 'bypass') {
    console.log('Slot', event.detail.slot, 'toggled:', event.detail.enabled);
  }
  if (event.type === 'name') {
    console.log('Preset', event.detail.slot, ':', event.detail.name);
  }
});
```

---

## 📚 Model Registries

### Available Amps
```typescript
import { AMP_MODELS } from './api';

AMP_MODELS.F57_DELUXE     // 0x6700
AMP_MODELS.F59_BASSMAN    // 0x6400
AMP_MODELS.BRIT_70S       // 0x7900
AMP_MODELS.METAL_2000     // 0x6d00
// ... see constants.ts for all
```

### Available Stomp Effects
```typescript
import { STOMP_MODELS } from './api';

STOMP_MODELS.OVERDRIVE
STOMP_MODELS.FUZZ
STOMP_MODELS.COMPRESSOR
STOMP_MODELS.WAH
// ... see constants.ts for all
```

### Available Mod Effects
```typescript
import { MOD_MODELS } from './api';

MOD_MODELS.SINE_CHORUS
MOD_MODELS.SINE_FLANGER
MOD_MODELS.VIBRATONE
MOD_MODELS.PHASER
// ... see constants.ts for all
```

### Available Delay Effects
```typescript
import { DELAY_MODELS } from './api';

DELAY_MODELS.MONO_DELAY
DELAY_MODELS.TAPE_DELAY
DELAY_MODELS.PING_PONG_DELAY
// ... see constants.ts for all
```

### Available Reverb Effects
```typescript
import { REVERB_MODELS } from './api';

REVERB_MODELS.SMALL_HALL
REVERB_MODELS.LARGE_HALL
REVERB_MODELS.SMALL_ROOM
REVERB_MODELS.SPRING_63
// ... see constants.ts for all
```

### Cabinet Models
```typescript
import { CABINET_MODELS } from './api';

CABINET_MODELS[0x00]  // None
CABINET_MODELS[0x01]  // 1x12 '57 Deluxe
CABINET_MODELS[0x02]  // 4x10 '59 Bassman
// ... see constants.ts for all
```

---

## 🔍 Inspect Models

```typescript
import { getAllModels, findModelById } from './api';

// Find a specific model
const model = findModelById(0x6700);
console.log(model?.name);          // "'57 Deluxe"
console.log(model?.type);          // DspType.AMP
console.log(model?.knobs);         // ["Vol", "Gain", ...]

// Get all models
const all = getAllModels();
console.log(all.length);           // Total models
```

---

## 🎯 Type Hints

```typescript
import type { 
  Preset, 
  AmpState, 
  EffectState, 
  UpdateEvent 
} from './api';

const preset: Preset = api.getPreset()!;
const amp: AmpState = preset.amp;
const effect: EffectState | null = preset.effects[0];
```

---

## 🔌 Get Defaults

```typescript
import { getAmpDefaults, getEffectDefaults } from './api';
import { DspType } from './api';

// Get default parameters for a model
const ampDefaults = getAmpDefaults(0x6700);
const effectDefaults = getEffectDefaults(DspType.STOMP, 0x3c00);

// Defaults are Uint8Array (64 bytes)
console.log(ampDefaults.length);    // 64
```

---

## 📦 Module Exports

```typescript
// Import everything
import * from './api';

// Import specific
import { FuseAPI, AMP_MODELS, DspType } from './api';
import { getAmpDefaults } from './defaults';
import { HIDProtocol } from './protocol';
import type { Preset } from './types';

// Or use convenience export
import { FuseAPI, AMP_MODELS } from './index';
```

---

## ⚡ Performance Tips

- ✅ Methods are async - use `await`
- ✅ State is cached - reading is instant
- ✅ Refresh after major changes with `refreshState()`
- ✅ Hardware monitoring is event-driven (efficient)
- ✅ No polling needed for hardware changes

---

## 🐛 Common Issues

| Problem | Solution |
|---------|----------|
| "WebHID not supported" | Use Chrome/Edge with WebHID enabled |
| Preset not changing | Call `api.setPreset(slot)` then await |
| Effect stuck off | Try `setEffectEnabled(slot, true)` |
| Stale state | Call `api.refreshState()` |
| Device disconnected | Catch error from `connect()` |

---

## 📖 Documentation Files

- **CLEANUP_SUMMARY.md** - Overview of changes
- **REFACTORING.md** - Detailed migration guide
- **MODULE_GUIDE.md** - Design patterns & testing
- **ARCHITECTURE.md** - Visual diagrams
- **REFACTORING_CHECKLIST.md** - Verification checklist

---

**Version**: v2.0 (Refactored)
**Last Updated**: January 12, 2026
**Status**: Production Ready ✅
