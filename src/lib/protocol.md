# Fender Mustang USB HID Protocol

*Based on original reverse engineering by snhirsch/mustang-midi-bridge and updated with findings from the V11 TypeScript API implementation.*

## Overview

The Fender Mustang amplifier communicates via USB HID. The protocol relies on 64-byte packets sent and received over specific endpoints. It allows for real-time control of amplifier settings, effect parameters, and preset management.

**Vendor ID:** `0x1ed8`  
**Packet Size:** 64 bytes  

## 1. Connection & Initialization

To establish a valid session with the amp, a specific handshake sequence is required immediately after opening the device.

### Handshake Sequence
1. **Send Init 1:** `0xC3` (followed by zeros)
2. **Send Init 2:** `0x1A 0x03` (followed by zeros)

### State Request
To read the current state of the amp (knobs, active effects, etc.), send:
* **Request State:** `0xFF 0xC1` (followed by zeros)

The amp will respond with a series of reports containing the current preset name, amplifier settings, and effect settings.

---

## 2. DSP Architecture

The Mustang internal signal processing is divided into "Families" (DSP Types). Each family handles specific types of models.

| DSP Type | Value | Description |
| :--- | :--- | :--- |
| **AMP** | `0x05` | Amplifier Modeling |
| **STOMP** | `0x06` | Stompbox Effects (distortion, comp, wah) |
| **MOD** | `0x07` | Modulation (chorus, flanger, tremolo) |
| **DELAY** | `0x08` | Delay Effects |
| **REVERB** | `0x09` | Reverb Effects |

---

## 3. Packet Structures

### A. Set DSP Parameter (Amp/Effect Settings)
This is the primary packet used to change models, knobs, and active status for amps and effects.

**Header:** `0x1C 0x03 [DSP_TYPE]`  
**Length:** 64 bytes

| Byte(s) | Function | Description |
| :--- | :--- | :--- |
| 0 | Command | `0x1C` (Data Packet) |
| 1 | Sub-Cmd | `0x03` (Write) |
| 2 | DSP Type | `0x05`-`0x09` (See DSP Architecture) |
| 6 | Sequence | Rolling sequence ID (increments per packet) |
| 7 | Marker | `0x01` |
| 16-17 | Model ID | 16-bit Model Identifier (Big Endian) |
| 18 | Slot | Effect Slot Index (0-7) |
| 22 | Bypass | `0x01` = Bypassed (Off), `0x00` = Active (On) |
| 32-63 | Knobs | Parameter values for the model (see Knob Mappings) |

### B. Apply Changes (Commit)
After sending a DSP Parameter packet, an "Apply" packet is often required to commit the changes to the DSP.

**Header:** `0x1C 0x03 0x00`

| Byte(s) | Function | Description |
| :--- | :--- | :--- |
| 0-2 | Header | `0x1C 0x03 0x00` |
| 4 | Context | `0x01` if DSP was MOD (`0x07`), otherwise `0x02` |
| 6 | Sequence | Rolling sequence ID |
| 7 | Marker | `0x01` |

### C. Bypass Toggle (Fast Method)
To quickly toggle an effect on/off without resending all parameters.

**Header:** `0x19 0xC3`

| Byte(s) | Function | Description |
| :--- | :--- | :--- |
| 0 | Command | `0x19` (Bypass Packet) |
| 1 | Sub-Cmd | `0xC3` (Set) |
| 2 | Family ID | DSP Type - 3 (e.g., Stomp `0x06` becomes `0x03`) |
| 3 | State | `0x00` = On, `0x01` = Off |
| 4 | Slot | Effect Slot Index |

---

## 4. Preset Management

### Load Preset
Loads a saved preset from the amp's internal memory.

**Header:** `0x1C 0x01 0x01`

| Byte(s) | Description |
| :--- | :--- |
| 0-3 | `0x1C 0x01 0x01 0x00` |
| 4 | Slot Number (0-23) |
| 6 | `0x01` |

### Save Preset
Saves the current state to a specific memory slot.

**Header:** `0x1C 0x01 0x03`

| Byte(s) | Description |
| :--- | :--- |
| 0-3 | `0x1C 0x01 0x03 0x00` |
| 4 | Target Slot Number (0-23) |
| 6-7 | `0x01 0x01` |
| 16+ | Preset Name (ASCII encoded) |

---

## 5. Model Reference (Hex Codes)

### Amplifier Models (`0x05`)
| Name | Model ID |
| :--- | :--- |
| '57 Deluxe | `0x6700` |
| '59 Bassman | `0x6400` |
| '57 Champ | `0x7C00` |
| '65 Deluxe Reverb | `0x5300` |
| '65 Princeton | `0x6A00` |
| '65 Twin Reverb | `0x7500` |
| Super-Sonic | `0x7200` |
| British '60s | `0x6100` |
| British '70s | `0x7900` |
| British '80s | `0x5E00` |
| American '90s | `0x5D00` |
| Metal 2000 | `0x6D00` |

### Stompbox Effects (`0x06`)
| Name | Model ID |
| :--- | :--- |
| Overdrive | `0x3C00` |
| Fixed Wah | `0x4900` |
| Touch Wah | `0x4A00` |
| Fuzz | `0x1A00` |
| Compressor | `0x0700` |
| Simple Comp | `0x8800` |
| Ranger Boost (V2) | `0x0301` |
| Green Box (V2) | `0xBA00` |

### Modulation Effects (`0x07`)
| Name | Model ID |
| :--- | :--- |
| Sine Chorus | `0x1200` |
| Triangle Chorus | `0x1300` |
| Sine Flanger | `0x1800` |
| Vibratone | `0x2D00` |
| Vintage Tremolo | `0x4000` |
| Phaser | `0x4F00` |
| Pitch Shifter | `0x1F00` |

### Delay Effects (`0x08`)
| Name | Model ID |
| :--- | :--- |
| Mono Delay | `0x1600` |
| Tape Delay | `0x2B00` |
| Ducking Delay | `0x1500` |
| Reverse Delay | `0x4600` |
| Stereo Echo Filter | `0x4800` |

### Reverb Effects (`0x09`)
| Name | Model ID |
| :--- | :--- |
| Small Hall | `0x2400` |
| Large Hall | `0x3A00` |
| Small Room | `0x2600` |
| Large Plate | `0x4B00` |
| '63 Spring | `0x2100` |
| '65 Spring | `0x0B00` |

---

## 6. Knob Mapping

Knob values are 8-bit integers located at **byte 32** onwards in the DSP packet. The mapping varies by model but generally follows a standard order.

**Standard Amp Mapping:**
1. Volume (Gain)
2. Gain (Gain 2/Drive)
3. High (Treble)
4. Mid
5. Low (Bass)
6. Presence/Reverb Level

**Standard Stomp Mapping:**
1. Level
2. Gain/Parameter 1
3. Parameter 2
4. Parameter 3

*Note: Some complex models (like Pitch Shifter or Fuzz Touch Wah) use up to 6 parameters.*