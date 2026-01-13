# Architecture Diagram

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Application Layer                      │
│                    (UI, Controllers, etc.)                      │
└────────────────────────┬────────────────────────────────────────┘
                         │ imports
                         ▼
        ┌────────────────────────────────────────┐
        │      PUBLIC API LAYER (api.ts)         │
        │                                        │
        │   FuseAPI class with methods for:      │
        │   • Preset management                  │
        │   • Amp control                        │
        │   • Effect chain                       │
        │   • Hardware monitoring                │
        └────────┬─────────────┬────────────────┘
                 │ uses        │ uses
        ┌────────▼─────┐  ┌───▼──────────┐
        │ protocol.ts  │  │ constants.ts │
        │ (HIDProtocol)│  │   (enums,    │
        │              │  │   models)    │
        │ • connect()  │  │              │
        │ • send()     │  │ • DspType    │
        │ • read()     │  │ • AmpParam   │
        │ • sendApply()│  │ • AMP_MODELS │
        └────┬────────┘  └───┬──────────┘
             │               │
             │ uses          │ uses
             │               ▼
             │        ┌──────────────────┐
             │        │  defaults.ts     │
             │        │                  │
             │        │ • getAmpDefaults │
             │        │ • getEffectDef.  │
             │        └──────────────────┘
             │
             │
             ▼
      ┌────────────────────┐
      │   HARDWARE LAYER   │
      │                    │
      │  Fender Mustang    │
      │  via WebHID        │
      └────────────────────┘
```

## Data Flow: Setting an Amp Model

```
UI Layer
  │
  ├─→ api.setAmpModel(0x6700)
       │
       ├─→ defaults.getAmpDefaults(0x6700)
       │    └─→ returns Uint8Array with default params
       │
       ├─→ protocol.sendDspConfig(DspType.AMP, 0x6700, defaults)
       │    ├─→ wraps in HID packet format
       │    ├─→ increments sequence ID
       │    └─→ device.sendReport(0, packet)
       │
       └─→ protocol.sendApply()
            └─→ sends commit packet

Hardware receives and applies settings
```

## Code Organization in api.ts

```typescript
┌─────────────────────────────────────────────────────┐
│              FuseAPI Class                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Connection Management                        │  │
│  │ • connect()                                  │  │
│  │ • disconnect()                               │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Preset Management                            │  │
│  │ • getPreset()                                │  │
│  │ • getPresetList()                            │  │
│  │ • setPreset()                                │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Amp Parameter Control                        │  │
│  │ • setAmpModel()                              │  │
│  │ • setAmpParameter()                          │  │
│  │ • setCabinet()                               │  │
│  │ • setBright() / setSag() / setNoiseGate()   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Effect Chain Management                      │  │
│  │ • setEffect()                                │  │
│  │ • setEffectKnob()                            │  │
│  │ • setEffectEnabled()                         │  │
│  │ • removeEffect()                             │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Hardware Monitoring                          │  │
│  │ • monitorHardwareChanges()                   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Internal State Management (private)          │  │
│  │ • refreshState()                             │  │
│  │ • parseAmpState() / parseEffectsChain()     │  │
│  │ • processPacket() / handleHIDInput()        │  │
│  │ • updateByte()                               │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Module Import Relationships

```
index.ts (Convenience re-exports)
  └─ Exports from: api.ts, types.ts, defaults.ts, protocol.ts, constants.ts

api.ts
  ├─ imports types from: types.ts
  ├─ imports from: constants.ts, defaults.ts, protocol.ts
  └─ exports: FuseAPI + re-exports all from constants.ts & types.ts

protocol.ts
  ├─ imports from: constants.ts (FENDER_VID, DspType)
  └─ exports: HIDProtocol class

constants.ts
  ├─ no imports
  └─ exports: DspType, AmpParam, all model registries, helpers

types.ts
  ├─ imports from: constants.ts (DspType only)
  └─ exports: AmpState, EffectState, Preset, UpdateEvent

defaults.ts
  ├─ imports from: constants.ts (DspType, AmpParam)
  └─ exports: getAmpDefaults(), getEffectDefaults()
```

## Abstraction Layers

```
┌──────────────────────────────────────────────────┐
│  Presentation Layer                              │
│  (React, Vue, Angular, etc.)                     │
└─────────────────┬────────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────────┐
│  FuseAPI                                         │
│  (Business Logic / High-level Commands)          │
│  • Semantic methods (setAmpModel, setEffect)    │
│  • State management (getPreset)                  │
│  • Hardware monitoring                           │
└────┬─────────────────────────────────────────────┘
     │
┌────▼──────────────────────────────────────────────┐
│  Support Modules                                  │
│  • Constants (metadata)                           │
│  • Types (interfaces)                             │
│  • Defaults (parameter sets)                      │
│  • Protocol (HID communication)                   │
└────┬──────────────────────────────────────────────┘
     │
┌────▼──────────────────────────────────────────────┐
│  WebHID API                                       │
│  (Browser's hardware interface)                   │
└────┬──────────────────────────────────────────────┘
     │
┌────▼──────────────────────────────────────────────┐
│  Fender Mustang USB Device                        │
│  (Physical Hardware)                              │
└───────────────────────────────────────────────────┘
```

## Suggested File Structure

```
src/
├── index.ts              ← Start here (convenience re-export)
├── api.ts                ← Main FuseAPI class
├── protocol.ts           ← HID communication layer
├── constants.ts          ← Enums & model registries
├── defaults.ts           ← Default parameter sets
├── types.ts              ← TypeScript interfaces
└── (tests would go here)
    ├── api.test.ts
    ├── protocol.test.ts
    ├── defaults.test.ts
    └── ...
```

## Summary

```
What Before: 1 big file (1,240 lines)
What Now:   5 focused files (~975 lines total)
            + Clear separation of concerns
            + Organized by responsibility
            + Easy to extend
            + Testable in isolation
```
