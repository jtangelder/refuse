# Fender Mustang USB HID Protocol

This document serves as the canonical reference for the Fender Mustang USB HID protocol (`Fuse`). It is derived from the TypeScript implementation and reverse-engineering efforts.

Special thanks to the projects https://github.com/offa/plug and https://github.com/snhirsch/mustang-midi-bridge for their reverse-engineering efforts and documentation!

## 1. Device Identification & Transport

The communication happens via USB HID (Human Interface Device).

- **Vendor ID (VID):** `0x1ed8` (Fender)
- **Product ID (PID):** Varies by specific Mustang model (e.g., Mustang I, II, III, IV, V).
- **Packet Size:** 64 bytes (Fixed)
- **Report ID:** `0` (Used in `sendReport`)

All multi-byte integer values are **Little Endian** unless specified otherwise (Note: Model IDs are typically handled as Big Endian in the codebase for display/lookup, e.g., `0x6700`).

---

## 2. Connection Lifecycle

To establish a valid control session, the host must perform a handshake immediately after connecting.

### 2.1 Handshake Sequence

The host sends two specific packets to initialize communication.

**Handshake 1:**

```
[0xc3, 0x00, ...zeros...]
```

**Handshake 2:**

```
[0x1a, 0x03, ...zeros...]
```

_(OpCodes derived from `HANDSHAKE_1`, `HANDSHAKE_2_BYTE1`, `HANDSHAKE_2_BYTE2`)_

### 2.2 Initial State Request

After the handshake, the host requests the current amplifier state (presets, knobs, etc.).

**Request State:**

```
[0xff, 0xc1, ...zeros...]
```

_(OpCodes: `REQUEST_STATE`, `REQUEST_STATE_BYTE2`)_

**Request Bypass States:**

```
[0x19, 0x00, ...zeros...]
```

_(OpCodes: `REQUEST_BYPASS`, `REQUEST_BYPASS_BYTE2`)_

---

## 3. Protocol Architecture

The protocol distinguishes between different "DSP Types" (Families) which determine how parameters are mapped.

### 3.1 DSP Types

| Type Name  | Value  | Description                              |
| :--------- | :----- | :--------------------------------------- |
| **AMP**    | `0x05` | Amplifier Models                         |
| **STOMP**  | `0x06` | Stompboxes (Distortion, Compressor, Wah) |
| **MOD**    | `0x07` | Modulation (Chorus, Flanger, Phaser)     |
| **DELAY**  | `0x08` | Delay Effects                            |
| **REVERB** | `0x09` | Reverb Effects                           |

### 3.2 Packet Structure (Common)

Most command packets follow a standard 64-byte layout.

| Offset | Field           | Description                                                  |
| :----- | :-------------- | :----------------------------------------------------------- |
| `0`    | **Command**     | Primary OpCode (e.g., `0x1c` for Data, `0x19` for Bypass)    |
| `1`    | **SubCommand**  | Secondary OpCode (e.g., `0x03` for Write, `0x01` for Read)   |
| `2`    | **Type**        | DSP Type associated with the command (or `0x00` for generic) |
| `3`    | **Context/Var** | Often used for specific flags or context variables           |
| `6`    | **Sequence ID** | Rolling counter (0-255) to track packet order                |
| `7`    | **Marker**      | Always `0x01` in valid command packets                       |

---

## 4. Commands Reference

### 4.1 Data Packets (`0x1c`)

Used for sending parameter updates, changing presets, or querying specific data.

#### A. DSP Parameter Write (`0x1c 0x03`)

Updates the parameters (knobs, model, active state) for a specific effect or amp slot.

| Byte  | Field      | Value / Note                            |
| :---- | :--------- | :-------------------------------------- |
| 0     | Command    | `0x1c` (`DATA_PACKET`)                  |
| 1     | Sub-Cmd    | `0x03` (`DATA_WRITE`)                   |
| 2     | DSP Type   | `0x05` - `0x09`                         |
| 6     | Seq ID     | Rolling ID                              |
| 16-17 | Model ID   | 16-bit Model Identifier (Split MSB/LSB) |
| 18    | Slot Index | Position in chain (0-7 for effects)     |
| 22    | Bypass     | `0x01` (Bypassed) or `0x00` (Enabled)   |
| 32-63 | Knobs      | Array of 8-bit knob values (0-255)      |
| 49    | Cabinet ID | (Amp Only) Cabinet Model ID             |

_Note: For Amp models (`0x05`), byte `49` specifies the Cabinet ID._

#### B. Apply Change (`0x1c 0x03 0x00`)

Commits changes to the DSP. Sent after parameter updates.

| Byte | Field   | Value / Note                                |
| :--- | :------ | :------------------------------------------ |
| 0    | Command | `0x1c`                                      |
| 1    | Sub-Cmd | `0x03`                                      |
| 2    | Type    | `0x00`                                      |
| 4    | Family  | `0x01` if DSP was MOD (`0x07`), else `0x02` |

#### C. Preset Operations (`0x1c 0x01`)

**Load Preset:**

```
CMD: 0x1c | SUB: 0x01 | TYPE: 0x01 | SLOT: [0-99]
```

**Save Preset:**

```
CMD: 0x1c | SUB: 0x01 | TYPE: 0x03 | SLOT: [0-99]
...
Bytes 16-47: Preset Name (ASCII)
```

### 4.2 Bypass Control (`0x19`)

Fast toggling of effect states without sending full parameter sets.

**Set Bypass:**

```
CMD: 0x19 | SUB: 0xc3 | FAMILY: [Type-3] | STATE: [0/1] | SLOT: [Index]
```

- **Family**: Calculated as `DSP_TYPE - 3` (e.g., Stomp `0x06` -> `0x03`).
- **State**: `0x01` = Off (Bypassed), `0x00` = On.
- **Slot**: The effect slot index.

---

## 5. Live Updates & Decoding

When the amp knobs are turned physically, or state changes internally, the amp sends reports to the host.

### 5.1 Live Knob Change

Packets starting directly with a DSP Type (`0x05`-`0x09`) indicate a real-time parameter change.

| Offset | Field       | Value                             |
| :----- | :---------- | :-------------------------------- |
| 0      | DSP Type    | `0x05` - `0x09`                   |
| 1      | Sub-Cmd     | `0x00`                            |
| 5      | Param Index | Which knob changed (index)        |
| 10     | Value       | New value (0-255)                 |
| 13     | Slot        | Effect slot index (if applicable) |

### 5.2 Preset Change Notification

Received when the user selects a preset on the amp.

```
0x1c 0x01 0x00 ... [Slot Index at byte 4]
```

---

## 6. Model Reference

### 6.1 Amplifiers (`0x05`)

| ID (Hex) | Name              | Based On                     |
| :------- | :---------------- | :--------------------------- |
| `0x6700` | '57 Deluxe        | 1957 Fender Deluxe           |
| `0x6400` | '59 Bassman       | 1959 Fender Bassman          |
| `0x7C00` | '57 Champ         | 1957 Fender Champ            |
| `0x5300` | '65 Deluxe Reverb | 1965 Fender Deluxe Reverb    |
| `0x6A00` | '65 Princeton     | 1965 Fender Princeton Reverb |
| `0x7500` | '65 Twin Reverb   | 1965 Fender Twin Reverb      |
| `0x7200` | Super-Sonic       | Fender Super-Sonic 22        |
| `0x6100` | British '60s      | VOX AC30                     |
| `0x7900` | British '70s      | Marshall 1959SLP             |
| `0x5E00` | British '80s      | Marshall JCM 800             |
| `0x5D00` | American '90s     | Mesa/Boogie Dual Rectifier   |
| `0x6D00` | Metal 2000        | Peavey 5150                  |
| `0xF100` | Studio Preamp     | Direct Signal (No Modeling)  |
| `0xF600` | '57 Twin          | 1957 Fender Twin             |
| `0xF900` | '60s Thrift       | Sears 1964 Silvertone        |
| `0xFF00` | British Watts     | HiWatt 100 DR103             |
| `0xFC00` | British Colour    | Orange Custom Shop           |

### 6.2 Cabinets

| ID     | Name                | Based On                     |
| :----- | :------------------ | :--------------------------- |
| `0x00` | Off                 | -                            |
| `0x01` | 1x12 '57 Deluxe     | Fender '57 Deluxe            |
| `0x02` | 4x10 '59 Bassman    | Fender '59 Bassman           |
| `0x03` | 1x8 '57 Champ       | Fender '57 Champion          |
| `0x04` | 1x12 '65 Deluxe     | Fender '65 Deluxe            |
| `0x05` | 1x10 '65 Princeton  | Fender '65 Princeton         |
| `0x06` | 4x12 Metal 2000     | Peavey 5150 4x12 (Sheffield) |
| `0x07` | 2x12 British '60s   | VOX AC30                     |
| `0x08` | 4x12 British '70s   | Marshall 1960TV              |
| `0x09` | 2x12 '65 Twin       | Fender '65 Twin              |
| `0x0a` | 4x12 British '80s   | Marshall 1960A               |
| `0x0b` | 2x12 Super-Sonic    | Fender Super-Sonic 60        |
| `0x0c` | 1x12 Super-Sonic    | Fender Super-Sonic 22        |
| `0x0d` | 2x12 '57 Twin       | Fender '57 Twin              |
| `0x0e` | 2x12 '60s Thrift    | Sears Silvertone Twin        |
| `0x0f` | 4x12 British Watts  | HiWatt 4x12                  |
| `0x10` | 4x12 British Colour | Orange 4x12                  |

### 6.3 Stomp Effects (`0x06`)

| ID (Hex) | Name           | Based On                                |
| :------- | :------------- | :-------------------------------------- |
| `0x3C00` | Overdrive      | Ibanez Tube Screamer                    |
| `0x4900` | Fixed Wah      | VOX V847A Wah-Wah                       |
| `0x4A00` | Touch Wah      | VOX V847A Wah-Wah (Envelope Controlled) |
| `0x1A00` | Fuzz           | Vox Tone Bender                         |
| `0x1C00` | Fuzz Touch Wah | Fuzz Face + Envelope Filter             |
| `0x0700` | Compressor     | Boss CS-3 Compressor Sustainer          |
| `0x8800` | Simple Comp    | MXR Dyna Comp                           |
| `0x0301` | Ranger Boost   | Dallas RangeMaster Treble Booster       |
| `0xBA00` | Green Box      | Ibanez Tube Screamer TS808              |
| `0x0101` | Orange Box     | Boss DS-1 Distortion                    |
| `0x1101` | Black Box      | ProCo RAT                               |
| `0x0F01` | Big Fuzz       | Electro-Harmonix Big Muff Pi            |

### 6.4 Modulation (`0x07`)

| ID (Hex) | Name             | Based On                   |
| :------- | :--------------- | :------------------------- |
| `0x1200` | Sine Chorus      | Boss CE-2 Chorus           |
| `0x1300` | Triangle Chorus  | MXR Stereo Chorus          |
| `0x1800` | Sine Flanger     | MXR M117 Flanger           |
| `0x1900` | Triangle Flanger | Boss BF-2 Flanger          |
| `0x2D00` | Vibratone        | Fender Vibratone           |
| `0x4000` | Vintage Tremolo  | Fender Tube Amp Tremolo    |
| `0x4100` | Sine Tremolo     | Fender Bias Tremolo        |
| `0x2200` | Ring Modulator   | Moog MF-102 Ring Modulator |
| `0x2900` | Step Filter      | ZVex Seek Wah              |
| `0x4F00` | Phaser           | MXR Phase 90               |
| `0x1F00` | Pitch Shifter    | Boss PS-6 Harmonist        |

### 6.5 Delay (`0x08`)

| ID (Hex) | Name               | Based On                             |
| :------- | :----------------- | :----------------------------------- |
| `0x1600` | Mono Delay         | Boss DD-3 Digital Delay              |
| `0x4300` | Mono Echo Filter   | Generic Delay with Filter            |
| `0x4800` | Stereo Echo Filter | Generic Stereo Delay with Filter     |
| `0x2B00` | Tape Delay         | Maestro Echoplex / Roland Space Echo |
| `0x2A00` | Stereo Tape Delay  | Maestro Echoplex / Roland Space Echo |
| `0x1500` | Ducking Delay      | TC Electronic 2290 (Dynamic)         |
| `0x4600` | Reverse Delay      | Boss DD-7 Reverse Mode               |
| `0x4400` | Multitap Delay     | Korg SDD-3000 / Generic Multitap     |
| `0x4500` | Ping Pong Delay    | Generic Ping Pong                    |

### 6.6 Reverb (`0x09`)

| ID (Hex) | Name        | Based On                           |
| :------- | :---------- | :--------------------------------- |
| `0x2400` | Small Hall  | Standard Hall Algorithm            |
| `0x3A00` | Large Hall  | Standard Hall Algorithm            |
| `0x2600` | Small Room  | Standard Room Algorithm            |
| `0x3B00` | Large Room  | Standard Room Algorithm            |
| `0x4E00` | Small Plate | EMT 140 Plate (Short Decay)        |
| `0x4B00` | Large Plate | EMT 140 Plate (Long Decay)         |
| `0x4C00` | Ambient     | Generic Ambient / Shimmer          |
| `0x4D00` | Arena       | Generic Arena / Stadium            |
| `0x2100` | '63 Spring  | 1963 Fender Spring Reverb Unit     |
| `0x0B00` | '65 Spring  | 1965 Fender Spring Reverb (In-Amp) |
