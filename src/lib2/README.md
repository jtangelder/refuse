# Fender Mustang API (lib2)

A comprehensive TypeScript API for controlling Fender Mustang amplifiers via WebHID. This implementation includes all features from the original FENDER FUSE application with modern event-driven architecture for UI synchronization.

## Features

✅ **Event System** - Real-time UI synchronization with amp state changes  
✅ **Preset Management** - Save, load, and manage 24 presets  
✅ **High-Level Control** - Friendly methods using model/knob names  
✅ **Complete Model Registry** - All amps, effects, and cabinets from protocol  
✅ **Hardware Sync** - Auto-sync with physical knob changes and footswitch presses  
✅ **TypeScript Types** - Full type safety and autocomplete  
✅ **Buffer-First Architecture** - Efficient state management  

## Quick Start

```typescript
import { MustangAPI } from './lib2/api';

const api = new MustangAPI();

// Connect (automatically starts monitoring and syncs state)
await api.connect();

// Set up event listeners
api.on('amp-changed', (model, knobs) => {
  console.log(`Amp: ${model}`, knobs);
});

// Set some tone
await api.setAmpModel("British '70s");
await api.setAmpKnob('Gain', 200);
await api.setEffect(0, 'Overdrive');
await api.setCabinet("4x12 British '70s");

// Save as preset
await api.savePreset(0, 'My Tone');
```

## API Reference

### Connection

```typescript
await api.connect(): Promise<boolean>
await api.disconnect(): Promise<void>
api.isConnected: boolean
```

**Note:** `connect()` automatically starts monitoring physical changes and syncs the initial state. You don't need to call any additional setup methods.

### Event System

```typescript
api.on(event, callback)
api.off(event, callback)
api.emit(event, ...args)
```

**Available Events:**
- `connected` - Amp connected
- `disconnected` - Amp disconnected
- `preset-loaded` - Preset loaded (slot, name)
- `amp-changed` - Amp model/knobs changed (model, knobs)
- `effect-changed` - Effect changed (slot, model, knobs)
- `bypass-toggled` - Effect bypassed/enabled (slot, enabled)
- `cabinet-changed` - Cabinet changed (name)
- `state-changed` - Any state change

### Amp Control

```typescript
// Set amp by name
await api.setAmpModel(name: string)

// Get current amp
api.getAmpModel(): ModelDef | null

// Control knobs by name
await api.setAmpKnob(knobName: string, value: number)
api.getAmpKnob(knobName: string): number
api.getAmpKnobs(): Record<string, number>

// Get complete settings
api.getAmpSettings(): AmpSettings | null
```

**Available Amps:**
- '57 Deluxe, '59 Bassman, '57 Champ
- '65 Deluxe Reverb, '65 Princeton, '65 Twin Reverb
- Super-Sonic
- British '60s, British '70s, British '80s
- American '90s, Metal 2000
- Studio Preamp, '57 Twin, '60s Thrift
- British Watts, British Colour

### Effect Control

```typescript
// Set effect by name
await api.setEffect(slot: number, name: string)

// Clear effect
await api.clearEffect(slot: number)

// Get effect info
api.getEffectModel(slot: number): ModelDef | null
api.getEffectSettings(slot: number): EffectSettings | null

// Control knobs
await api.setEffectKnob(slot: number, knobName: string, value: number)
api.getEffectKnob(slot: number, knobName: string): number
api.getEffectKnobs(slot: number): Record<string, number>

// Bypass control
await api.setEffectEnabled(slot: number, enabled: boolean)
```

**Effect Slots:**
- 0-3: Stomps
- 4: Modulation
- 5-6: Delay
- 7: Reverb

**Available Effects:**

*Stomps:* Overdrive, Fixed Wah, Touch Wah, Fuzz, Fuzz Touch Wah, Simple Comp, Compressor, Ranger Boost, Green Box, Orange Box, Black Box, Big Fuzz

*Modulation:* Sine Chorus, Triangle Chorus, Sine Flanger, Triangle Flanger, Vibratone, Vintage Tremolo, Sine Tremolo, Ring Modulator, Step Filter, Phaser, Pitch Shifter

*Delay:* Mono Delay, Mono Echo Filter, Stereo Echo Filter, Tape Delay, Stereo Tape Delay, Ducking Delay, Reverse Delay, Multitap Delay, Ping Pong Delay

*Reverb:* Small Hall, Large Hall, Small Room, Large Room, Small Plate, Large Plate, Ambient, Arena, '63 Spring, '65 Spring

### Cabinet Control

```typescript
await api.setCabinet(name: string)
await api.setCabinetById(id: number)
api.getCabinet(): { id: number; name: string } | null
```

**Available Cabinets:**
Off, 1x12 '57 Deluxe, 4x10 '59 Bassman, 1x8 '57 Champ, 1x12 '65 Deluxe, 1x10 '65 Princeton, 4x12 Metal 2000, 2x12 British '60s, 4x12 British '70s, 2x12 '65 Twin, 4x12 British '80s, 2x12 Super-Sonic, 1x12 Super-Sonic, 2x12 '57 Twin, 2x12 '60s Thrift, 4x12 British Watts, 4x12 British Colour

### Preset Management

```typescript
await api.savePreset(slot: number, name: string)
await api.loadPreset(slot: number)
await api.getPresetList(): Promise<void>

// Access cache
api.presets: Map<number, PresetMetadata>
api.currentPresetSlot: number | null
```

**Preset Slots:** 0-23 (24 total)

### Automatic State Sync

The API automatically keeps itself in sync with the amplifier:

- **On Connection**: Automatically requests full state and bypass flags
- **Physical Changes**: Live knob turns and footswitch presses are detected and synced
- **Event Emission**: All changes trigger appropriate events for UI updates

```typescript
// Just connect - everything happens automatically!
await api.connect();

// The API is now:
// ✓ Monitoring physical changes
// ✓ Synced with current amp state
// ✓ Emitting events for all changes
```

### Direct Buffer Access (Advanced)

```typescript
// Access raw state buffers
api.state[DspType.AMP]: Uint8Array
api.state[DspType.MOD]: Uint8Array
api.state[DspType.DELAY]: Uint8Array
api.state[DspType.REVERB]: Uint8Array
api.state.stomps[0-3]: Uint8Array

// Send custom buffer
await api.sendFullBuffer(type: DspType, slot: number, buffer: Uint8Array)

// Set single parameter
await api.setParameter(type: DspType, slot: number, byteIndex: number, value: number)
```

## Complete Example

See `examples.ts` for comprehensive usage examples including:
- Event system setup
- Building complete tones
- Preset management workflows
- Exploring available models
- UI integration patterns

## Architecture

**Buffer-First Design**: All state is stored in raw 64-byte buffers (single source of truth). High-level methods provide friendly access while maintaining full protocol compatibility.

**Event-Driven**: EventEmitter pattern enables reactive UI updates. Physical amp changes automatically update internal state and emit events.

**TypeScript**: Full type safety with comprehensive interfaces for all models, settings, and events.

## Protocol Reference

Based on the Fender Mustang USB protocol documented at:
https://github.com/snhirsch/mustang-midi-bridge/blob/master/doc/fender_mustang_protocol.txt

### Key Protocol Details

- **USB VID:** `0x1ed8`
- **Packet Size:** 64 bytes
- **DSP Types:** AMP (0x05), STOMP (0x06), MOD (0x07), DELAY (0x08), REVERB (0x09)
- **Opcodes:** See `types.ts` for complete list

## Files

- `api.ts` - Main API class with all functionality
- `types.ts` - TypeScript types and helper utilities
- `examples.ts` - Comprehensive usage examples
- `loader.ts` - FUSE preset XML loader (legacy compatibility)

## Browser Requirements

- WebHID API support (Chrome 89+, Edge 89+)
- HTTPS (required for WebHID)

## License

Part of the Mustang project
