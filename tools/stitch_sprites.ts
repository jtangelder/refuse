import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUTPUT_SIZE = 500;
const INNER_MAX_SIZE = 450; // Max size for device inside 500x500 canvas (guarantees >= 25px transparent safety padding on all sides)
const COLS_PER_SHEET = 5;

const SRC_DIR = 'src/assets/generated_batches';
const DEST_DIR = 'src/assets/sprites';

interface DeviceItem {
  id: string;
  name: string;
}

interface ComponentBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Detects isolated hardware device components from a master sheet.
 * Returns sorted components in top-to-bottom, left-to-right reading order.
 */
async function detectDeviceBoxes(
  imgPath: string,
  minPixelCount = 800,
  minHeight = 25
): Promise<{ boxes: ComponentBox[]; rawBuffer: Buffer; imgWidth: number; imgHeight: number; bg: [number, number, number] }> {
  const img = sharp(imgPath);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // Sample outer perimeter for median background color
  const borderR: number[] = [];
  const borderG: number[] = [];
  const borderB: number[] = [];
  for (let x = 0; x < w; x += 10) {
    const iT = (0 * w + x) * 3;
    const iB = ((h - 1) * w + x) * 3;
    borderR.push(data[iT], data[iB]);
    borderG.push(data[iT + 1], data[iB + 1]);
    borderB.push(data[iT + 2], data[iB + 2]);
  }
  for (let y = 0; y < h; y += 10) {
    const iL = (y * w + 0) * 3;
    const iR = (y * w + (w - 1)) * 3;
    borderR.push(data[iL], data[iR]);
    borderG.push(data[iL + 1], data[iR + 1]);
    borderB.push(data[iL + 2], data[iR + 2]);
  }
  borderR.sort((a, b) => a - b);
  borderG.sort((a, b) => a - b);
  borderB.sort((a, b) => a - b);
  const bgR = borderR[Math.floor(borderR.length / 2)];
  const bgG = borderG[Math.floor(borderG.length / 2)];
  const bgB = borderB[Math.floor(borderB.length / 2)];

  // Flood fill background from all 4 borders
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  for (let x = 0; x < w; x++) {
    queue.push(0 * w + x);
    queue.push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    queue.push(y * w + 0);
    queue.push(y * w + (w - 1));
  }

  while (queue.length > 0) {
    const curr = queue.pop()!;
    if (visited[curr]) continue;
    visited[curr] = 1;

    const r = data[curr * 3];
    const g = data[curr * 3 + 1];
    const b = data[curr * 3 + 2];
    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);

    if (dist <= 13) {
      const cx = curr % w;
      const cy = Math.floor(curr / w);
      if (cx > 0 && !visited[curr - 1]) queue.push(curr - 1);
      if (cx < w - 1 && !visited[curr + 1]) queue.push(curr + 1);
      if (cy > 0 && !visited[curr - w]) queue.push(curr - w);
      if (cy < h - 1 && !visited[curr + w]) queue.push(curr + w);
    }
  }

  // Connected components of foreground pixels
  const compVisited = new Uint8Array(w * h);
  const boxes: ComponentBox[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx] === 0 && compVisited[idx] === 0) {
        let minX = x,
          maxX = x,
          minY = y,
          maxY = y,
          count = 0;
        const cQueue = [idx];
        compVisited[idx] = 1;

        while (cQueue.length > 0) {
          const cCurr = cQueue.pop()!;
          count++;
          const cx = cCurr % w;
          const cy = Math.floor(cCurr / w);
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]) {
            const nx = cx + dx,
              ny = cy + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nIdx = ny * w + nx;
              if (visited[nIdx] === 0 && compVisited[nIdx] === 0) {
                compVisited[nIdx] = 1;
                cQueue.push(nIdx);
              }
            }
          }
        }

        if (count >= minPixelCount && maxY - minY >= minHeight) {
          boxes.push({
            minX,
            maxX,
            minY,
            maxY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
          });
        }
      }
    }
  }

  // Sort components into rows (top to bottom), then left to right
  boxes.sort((a, b) => {
    if (Math.abs(a.centerY - b.centerY) > 80) {
      return a.centerY - b.centerY;
    }
    return a.centerX - b.centerX;
  });

  return { boxes, rawBuffer: data, imgWidth: w, imgHeight: h, bg: [bgR, bgG, bgB] };
}

/**
 * Extracts a device using its exact bounding box, flood-fills local background to alpha,
 * and centers it perfectly inside a 500x500 square canvas with safety padding.
 */
async function extractAndCenterDevice(
  rawBuffer: Buffer,
  imgWidth: number,
  imgHeight: number,
  box: ComponentBox,
  bg: [number, number, number]
): Promise<Buffer> {
  // Add a 4px margin around bounding box (clamped to image bounds)
  const pad = 4;
  const cropLeft = Math.max(0, box.minX - pad);
  const cropTop = Math.max(0, box.minY - pad);
  const cropRight = Math.min(imgWidth - 1, box.maxX + pad);
  const cropBottom = Math.min(imgHeight - 1, box.maxY + pad);
  const cropW = cropRight - cropLeft + 1;
  const cropH = cropBottom - cropTop + 1;

  // Build RGBA for cropped device
  const rgba = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcIdx = ((cropTop + y) * imgWidth + (cropLeft + x)) * 3;
      const dstIdx = (y * cropW + x) * 4;
      rgba[dstIdx] = rawBuffer[srcIdx];
      rgba[dstIdx + 1] = rawBuffer[srcIdx + 1];
      rgba[dstIdx + 2] = rawBuffer[srcIdx + 2];
      rgba[dstIdx + 3] = 255;
    }
  }

  // Flood fill background to transparent strictly from borders of this cropped box
  const visited = new Uint8Array(cropW * cropH);
  const queue: number[] = [];
  for (let x = 0; x < cropW; x++) {
    queue.push(0 * cropW + x);
    queue.push((cropH - 1) * cropW + x);
  }
  for (let y = 0; y < cropH; y++) {
    queue.push(y * cropW + 0);
    queue.push(y * cropW + (cropW - 1));
  }

  const [bgR, bgG, bgB] = bg;
  while (queue.length > 0) {
    const curr = queue.pop()!;
    if (visited[curr]) continue;
    visited[curr] = 1;

    const r = rgba[curr * 4];
    const g = rgba[curr * 4 + 1];
    const b = rgba[curr * 4 + 2];
    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);

    if (dist <= 11) {
      if (dist <= 7) {
        rgba[curr * 4 + 3] = 0;
      } else {
        rgba[curr * 4 + 3] = Math.round(255 * ((dist - 7) / 4));
      }

      const cx = curr % cropW;
      const cy = Math.floor(curr / cropW);
      if (cx > 0 && !visited[curr - 1]) queue.push(curr - 1);
      if (cx < cropW - 1 && !visited[curr + 1]) queue.push(curr + 1);
      if (cy > 0 && !visited[curr - cropW]) queue.push(curr - cropW);
      if (cy < cropH - 1 && !visited[curr + cropW]) queue.push(curr + cropW);
    }
  }

  // Scale device proportionally to fit within INNER_MAX_SIZE (e.g. 450x450)
  const resizedDeviceBuffer = await sharp(rgba, {
    raw: { width: cropW, height: cropH, channels: 4 },
  })
    .resize(INNER_MAX_SIZE, INNER_MAX_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resizedDeviceBuffer).metadata();
  const rw = resizedMeta.width || INNER_MAX_SIZE;
  const rh = resizedMeta.height || INNER_MAX_SIZE;

  // Center mathematically inside 500x500 canvas
  const leftPad = Math.round((OUTPUT_SIZE - rw) / 2);
  const topPad = Math.round((OUTPUT_SIZE - rh) / 2);

  return sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedDeviceBuffer, left: leftPad, top: topPad }])
    .png()
    .toBuffer();
}

async function process() {
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  const spritesMapping: Record<string, any> = {};

  // ---------------------------------------------------------------------------
  // 1. Single-sheet Effects Categories (stomp, mod, delay, reverb)
  // ---------------------------------------------------------------------------
  const EFFECT_CATEGORIES: Array<{
    name: string;
    file: string;
    minCount?: number;
    minH?: number;
    models: DeviceItem[];
  }> = [
    {
      name: 'stomp',
      file: 'stomp_master.jpg',
      models: [
        { id: '0x3C00', name: 'Overdrive (SD-1)' },
        { id: '0x4900', name: 'Fixed Wah (Cry Baby)' },
        { id: '0x4A00', name: 'Touch Wah (Auto-Wah)' },
        { id: '0x1A00', name: 'Fuzz (Red Fuzz Face)' },
        { id: '0x1C00', name: 'Fuzz Touch Wah (Blue Fuzz)' },
        { id: '0x8800', name: 'Simple Comp (Dyna Comp)' },
        { id: '0x0700', name: 'Compressor (CS-3)' },
        { id: '0x0301', name: 'Ranger Boost (Rangemaster)' },
        { id: '0xBA00', name: 'Green Box (Tube Screamer)' },
        { id: '0x0101', name: 'Orange Box (DS-1)' },
        { id: '0x1101', name: 'Black Box (ProCo RAT)' },
        { id: '0x0F01', name: 'Big Fuzz (Big Muff)' },
      ],
    },
    {
      name: 'mod',
      file: 'mod_master.jpg',
      models: [
        { id: '0x1200', name: 'Sine Chorus (CE-2)' },
        { id: '0x1300', name: 'Triangle Chorus (CH-1)' },
        { id: '0x1800', name: 'Sine Flanger (BF-2)' },
        { id: '0x1900', name: 'Triangle Flanger (MXR Flanger)' },
        { id: '0x2D00', name: 'Vibratone (Leslie)' },
        { id: '0x4000', name: 'Vintage Tremolo (TR-2)' },
        { id: '0x4100', name: 'Sine Tremolo (Brownface)' },
        { id: '0x2200', name: 'Ring Modulator (Moogerfooger)' },
        { id: '0x2900', name: 'Step Filter (Maestro)' },
        { id: '0x4F00', name: 'Phaser (Phase 90)' },
        { id: '0x1F00', name: 'Pitch Shifter (Whammy)' },
        // 12th is spare
      ],
    },
    {
      name: 'delay',
      file: 'delay_master.jpg',
      minH: 25,
      models: [
        { id: '0x1600', name: 'Mono Delay (DD-3)' },
        { id: '0x2B00', name: 'Tape Delay (Space Echo)' },
        { id: '0x2A00', name: 'Stereo Tape Delay (Echoplex)' },
        { id: '0x4300', name: 'Mono Echo Filter (DL4)' },
        { id: '0x4800', name: 'Stereo Echo Filter (DL4 Stereo)' },
        { id: '0x1500', name: 'Ducking Delay (TC 2290)' },
        { id: '0x4600', name: 'Reverse Delay (Memory Man)' },
        { id: '0x4400', name: 'Multitap Delay (Lexicon PCM42)' },
        { id: '0x4500', name: 'Ping Pong Delay (TimeFactor)' },
      ],
    },
    {
      name: 'reverb',
      file: 'reverb_master.jpg',
      models: [
        { id: '0x2100', name: "'63 Spring (6G15 Tank)" },
        { id: '0x0B00', name: "'65 Spring (Blackface)" },
        { id: '0x2400', name: 'Small Hall (Lexicon 224)' },
        { id: '0x3A00', name: 'Large Hall (Lexicon 480L)' },
        { id: '0x2600', name: 'Small Room (Holy Grail)' },
        { id: '0x3B00', name: 'Large Room (RV-5)' },
        { id: '0x4E00', name: 'Small Plate (EMT 140)' },
        { id: '0x4B00', name: 'Large Plate (EMT 250)' },
        { id: '0x4C00', name: 'Ambient (BigSky)' },
        { id: '0x4D00', name: 'Arena (Hall of Fame)' },
        // 11th & 12th are spares
      ],
    },
  ];

  for (const cat of EFFECT_CATEGORIES) {
    const imgPath = path.join(SRC_DIR, cat.file);
    console.log(`Processing ${cat.name} from ${cat.file}...`);
    const { boxes, rawBuffer, imgWidth, imgHeight, bg } = await detectDeviceBoxes(
      imgPath,
      cat.minCount || 800,
      cat.minH || 25
    );

    console.log(`  Detected ${boxes.length} components for ${cat.models.length} models.`);
    const validModels = cat.models;
    const rows = Math.ceil(validModels.length / COLS_PER_SHEET);
    const sheetWidth = COLS_PER_SHEET * OUTPUT_SIZE;
    const sheetHeight = rows * OUTPUT_SIZE;
    const composites: Array<{ input: Buffer; top: number; left: number }> = [];

    for (let i = 0; i < validModels.length; i++) {
      const model = validModels[i];
      const box = boxes[i];
      if (!box) {
        console.warn(`  Missing detected box for [${model.id}] ${model.name}`);
        continue;
      }

      console.log(
        `  Extracting [${model.id}] ${model.name} from box [${box.minX}..${box.maxX}, ${box.minY}..${box.maxY}] (${box.width}x${box.height})...`
      );

      const cellPngBuffer = await extractAndCenterDevice(
        rawBuffer,
        imgWidth,
        imgHeight,
        box,
        bg
      );

      const dstCol = i % COLS_PER_SHEET;
      const dstRow = Math.floor(i / COLS_PER_SHEET);
      const dstLeft = dstCol * OUTPUT_SIZE;
      const dstTop = dstRow * OUTPUT_SIZE;

      composites.push({
        input: cellPngBuffer,
        left: dstLeft,
        top: dstTop,
      });

      spritesMapping[model.id] = {
        sheet: cat.name,
        x: dstLeft,
        y: dstTop,
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
      };
    }

    const outputPath = path.join(DEST_DIR, `${cat.name}.webp`);
    console.log(`  Writing sprite sheet: ${outputPath} (${sheetWidth}x${sheetHeight})...`);
    await sharp({
      create: {
        width: sheetWidth,
        height: sheetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .webp({ quality: 92, lossless: false })
      .toFile(outputPath);
  }

  // ---------------------------------------------------------------------------
  // 2. High-Resolution Amps from the 4 batches
  // ---------------------------------------------------------------------------
  console.log(`\nProcessing high-resolution amplifiers from 4 batches...`);
  const AMP_BATCH_DEFS: Array<{
    file: string;
    models: DeviceItem[];
  }> = [
    {
      file: 'amps_batch_a.jpg',
      models: [
        { id: '0x6700', name: "'57 Deluxe" },
        { id: '0x6400', name: "'59 Bassman" },
        { id: '0x7C00', name: "'57 Champ" },
        { id: '0xF600', name: "'57 Twin" },
      ],
    },
    {
      file: 'amps_batch_b.jpg',
      models: [
        { id: '0x5300', name: "'65 Deluxe Reverb" },
        { id: '0x6A00', name: "'65 Princeton" },
        { id: '0x7500', name: "'65 Twin Reverb" },
        { id: '0x7200', name: 'Super-Sonic' },
      ],
    },
    {
      file: 'amps_batch_c.jpg',
      models: [
        { id: '0xFF00', name: 'British Watts (Hiwatt)' },
        { id: '0x7900', name: "British '70s (Plexi)" },
        { id: '0x5E00', name: "British '80s (JCM800)" },
        { id: '0x6100', name: "British '60s (AC30)" },
        { id: '0xFC00', name: 'British Colour (Orange)' },
      ],
    },
    {
      file: 'amps_batch_d.jpg',
      models: [
        { id: '0x5D00', name: "American '90s (Dual Rectifier)" },
        { id: '0x6D00', name: 'Metal 2000 (Peavey 5150)' },
        { id: '0xF900', name: "'60s Thrift (Silvertone)" },
        { id: '0xF100', name: 'Studio Preamp' },
      ],
    },
  ];

  const ampExtractedList: Array<{ id: string; name: string; buffer: Buffer }> = [];

  for (const b of AMP_BATCH_DEFS) {
    const imgPath = path.join(SRC_DIR, b.file);
    console.log(`  Processing ${b.file}...`);
    const { boxes, rawBuffer, imgWidth, imgHeight, bg } = await detectDeviceBoxes(
      imgPath,
      2000,
      40
    );

    for (let i = 0; i < b.models.length; i++) {
      const model = b.models[i];
      const box = boxes[i];
      if (!box) {
        console.warn(`    Missing detected box for amp [${model.id}] ${model.name}`);
        continue;
      }

      console.log(
        `    Extracting [${model.id}] ${model.name} from box [${box.minX}..${box.maxX}, ${box.minY}..${box.maxY}] (${box.width}x${box.height})...`
      );

      const cellPngBuffer = await extractAndCenterDevice(
        rawBuffer,
        imgWidth,
        imgHeight,
        box,
        bg
      );

      ampExtractedList.push({
        id: model.id,
        name: model.name,
        buffer: cellPngBuffer,
      });
    }
  }

  // Canonical order for amps in sprites.json / CSS:
  const AMP_ORDER = [
    '0x6700',
    '0x6400',
    '0x7C00',
    '0x5300',
    '0x6A00',
    '0x7500',
    '0x7200',
    '0x6100',
    '0x7900',
    '0x5E00',
    '0x5D00',
    '0x6D00',
    '0xF100',
    '0xF600',
    '0xF900',
    '0xFF00',
    '0xFC00',
  ];

  const ampRows = Math.ceil(AMP_ORDER.length / COLS_PER_SHEET);
  const ampSheetWidth = COLS_PER_SHEET * OUTPUT_SIZE;
  const ampSheetHeight = ampRows * OUTPUT_SIZE;
  const ampComposites: Array<{ input: Buffer; top: number; left: number }> = [];

  for (let i = 0; i < AMP_ORDER.length; i++) {
    const id = AMP_ORDER[i];
    const found = ampExtractedList.find(a => a.id === id);
    if (!found) {
      console.warn(`Amp ID ${id} not found in extracted items!`);
      continue;
    }

    const dstCol = i % COLS_PER_SHEET;
    const dstRow = Math.floor(i / COLS_PER_SHEET);
    const dstLeft = dstCol * OUTPUT_SIZE;
    const dstTop = dstRow * OUTPUT_SIZE;

    ampComposites.push({
      input: found.buffer,
      left: dstLeft,
      top: dstTop,
    });

    spritesMapping[id] = {
      sheet: 'amps',
      x: dstLeft,
      y: dstTop,
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
    };
  }

  const ampsOutputPath = path.join(DEST_DIR, 'amps.webp');
  console.log(`  Writing high-res amps sprite sheet: ${ampsOutputPath} (${ampSheetWidth}x${ampSheetHeight})...`);
  await sharp({
    create: {
      width: ampSheetWidth,
      height: ampSheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(ampComposites)
    .webp({ quality: 92, lossless: false })
    .toFile(ampsOutputPath);

  // Write sprites.json
  const jsonPath = path.join(DEST_DIR, 'sprites.json');
  fs.writeFileSync(jsonPath, JSON.stringify(spritesMapping, null, 2));
  console.log(`Wrote ${jsonPath}`);
}

process().catch(console.error);
