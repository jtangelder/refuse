# API Module Structure - Quick Reference

## File Organization

```
src/
├── constants.ts        # Enums, model registries, cabinet data
├── types.ts            # TypeScript interfaces (AmpState, EffectState, Preset)
├── defaults.ts         # Default parameter sets (getAmpDefaults, getEffectDefaults)
├── protocol.ts         # Low-level HID communication (HIDProtocol class)
└── api.ts              # High-level public API (FuseAPI class)
```

## Module Dependencies

```
api.ts
├── imports: constants, types, defaults, protocol
├── exports: FuseAPI + re-exports from constants & types
│
protocol.ts (no dependencies on other modules)
├── imports: constants (FENDER_VID, DspType)
│
defaults.ts (no dependencies except constants)
├── imports: constants (DspType, AmpParam)
│
types.ts (minimal dependencies)
├── imports: constants (DspType only)
│
constants.ts (no dependencies)
```

## Quick API Usage

```typescript
import { FuseAPI, AMP_MODELS, DspType } from './api';

// Initialize
const api = new FuseAPI();
await api.connect();

// Get current state
const preset = api.getPreset();
console.log(preset.amp.name, preset.amp.modelId);

// Change amp
await api.setAmpModel(AMP_MODELS.F57_DELUXE.id);

// Change effect
await api.setEffect(0, 0x3c00); // Stomp slot 0 → Overdrive

// Monitor hardware changes
api.monitorHardwareChanges((event) => {
  if (event.type === 'knob') console.log('Knob turned:', event.detail);
  if (event.type === 'preset') console.log('Preset changed:', event.detail);
});

// Cleanup
await api.disconnect();
```

## When to Use Each Module

| Need | Import From |
|------|------------|
| Model info, knob labels | `constants` |
| Type definitions for your code | `types` |
| Amp/effect defaults | `defaults` |
| Direct HID communication | `protocol` |
| Complete preset control | `api` (main entry point) |

## Section Organization in api.ts

The `FuseAPI` class is organized into logical sections:

```typescript
export class FuseAPI {
  // Connection Management
  // - connect()
  // - disconnect()

  // Preset Management
  // - getPreset()
  // - getPresetList()
  // - setPreset()

  // Amp Parameter Control
  // - setAmpModel()
  // - setAmpParameter()
  // - setCabinet()
  // - setBright()
  // - setSag()
  // - setNoiseGate()
  // - setGateThreshold()

  // Effect Chain Management
  // - setEffect()
  // - setEffectKnob()
  // - setEffectEnabled()
  // - removeEffect()

  // Hardware Monitoring
  // - monitorHardwareChanges()

  // Internal State Management
  // - refreshState()
  // - parseAmpState()
  // - parseEffectsChain()
  // - processPacket()
  // - handleHIDInput()
}
```

## Key Design Patterns

### 1. Abstraction Layers
- **UI Layer** → FuseAPI (business logic)
- **Business Logic** → Constants, Types, Defaults, Protocol
- **Hardware Layer** → HIDProtocol (device communication)

### 2. Data vs. Logic
- **Data** is in `constants.ts`, `defaults.ts` (easy to update)
- **Logic** is in `api.ts`, `protocol.ts` (keeps methods focused)

### 3. Type Safety
- All public methods have full TypeScript signatures
- State objects use strong types from `types.ts`
- Model IDs are validated with `findModelById()`

### 4. Error Handling
- Connection errors thrown in `protocol.ts`
- Invalid parameters checked early in `api.ts`
- Graceful fallbacks (e.g., "Unknown Amp" if model not found)

## Testing Strategy

```typescript
// Test constants independently
import { AMP_MODELS, findModelById } from './constants';
expect(findModelById(0x6700).name).toBe("'57 Deluxe");

// Test defaults independently  
import { getAmpDefaults } from './defaults';
const defaults = getAmpDefaults(0x6700);
expect(defaults.length).toBe(64);

// Test protocol in isolation
import { HIDProtocol } from './protocol';
const proto = new HIDProtocol();
// Mock navigator.hid for testing

// Test API with mocked protocol
import { FuseAPI } from './api';
const api = new FuseAPI();
// api.protocol = mockProtocol
```

## Adding New Features

### Add a new amp model
1. Edit `constants.ts` - add entry to `AMP_MODELS`
2. Edit `defaults.ts` - add case to `getAmpDefaults()`
3. No changes needed to `api.ts`

### Add a new hardware command
1. Edit `protocol.ts` - add method if needed
2. Edit `api.ts` - add public method using protocol
3. Implement in the appropriate section

### Add effect type monitoring
1. Edit `types.ts` - extend `UpdateEvent` type
2. Edit `api.ts` - add case to `handleHIDInput()`
3. Document the event in comments
