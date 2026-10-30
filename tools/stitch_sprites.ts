import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUTPUT_SIZE = 500;
const GRID_SIZE = 5; // 5x5 grid

const BATCHES = [
  {
    file: 'batch_amps_1.png',
    type: 'amps',
    ids: [
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
    ],
  },
  {
    file: 'batch_stomp_mod_1.png',
    type: 'stomp_mod', // Intermediate type, will split later
    ids: [
      '0x3C00',
      '0x4900',
      '0x4A00',
      '0x1A00',
      '0x1C00',
      '0x0700',
      '0x8800',
      '0x0301',
      '0xBA00',
      '0x0101',
      '0x1101',
      '0x0F01',
      '0x1200',
      '0x1300',
      '0x1800',
      '0x1900',
      '0x2D00',
      '0x4000',
      '0x4100',
      '0x2200',
      '0x2900',
      '0x4F00',
      '0x1F00',
    ],
  },
  {
    file: 'batch_delay_reverb_1.png',
    type: 'delay_reverb', // Intermediate type
    ids: [
      '0x1600',
      '0x4300',
      '0x4800',
      '0x2B00',
      '0x2A00',
      '0x1500',
      '0x4600',
      '0x4400',
      '0x4500',
      '0x2400',
      '0x3A00',
      '0x2600',
      '0x3B00',
      '0x4E00',
      '0x4B00',
      '0x4C00',
      '0x4D00',
      '0x2100',
      '0x0B00',
    ],
  },
];

// Define which IDs go to which final sprite sheet
// We'll stick to a single 'devices.webp' or split?
// PROTOCOL has Amps(05), Stomp(06), Mod(07), Delay(08), Reverb(09).
// Let's create `amps.webp`, `stomp.webp` (includes mod?), `delay.webp`, `reverb.webp`.
// Actually, the user just said "combine multiple images in one". Maybe one big sprite is best?
// "all in a single sprint image" -> "Please turn it into a CSS sprite".
// A single file `devices.webp` containing EVERYTHING might be HUGE (58 * 500x500 is big).
// 58 items. 5 columns -> 12 rows. 2500px wide, 6000px high. That's fine for modern web.
// But we can also split by category.
// Let's split by category to keep it manageable and logical.

const CATEGORIES = {
  amps: [
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
  ],
  stomp: [
    '0x3C00',
    '0x4900',
    '0x4A00',
    '0x1A00',
    '0x1C00',
    '0x0700',
    '0x8800',
    '0x0301',
    '0xBA00',
    '0x0101',
    '0x1101',
    '0x0F01',
  ],
  mod: ['0x1200', '0x1300', '0x1800', '0x1900', '0x2D00', '0x4000', '0x4100', '0x2200', '0x2900', '0x4F00', '0x1F00'],
  delay: ['0x1600', '0x4300', '0x4800', '0x2B00', '0x2A00', '0x1500', '0x4600', '0x4400', '0x4500'],
  reverb: ['0x2400', '0x3A00', '0x2600', '0x3B00', '0x4E00', '0x4B00', '0x4C00', '0x4D00', '0x2100', '0x0B00'],
};

const SRC_DIR = 'src/assets/generated_batches';
const DEST_DIR = 'src/assets/sprites';

async function process() {
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  const modelBufferMap: Record<string, Buffer> = {};

  // 1. Slice
  for (const batch of BATCHES) {
    const inputPath = path.join(SRC_DIR, batch.file);
    console.log(`Processing ${inputPath}...`);
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) throw new Error('No metadata');

    console.log(`Processing ${batch.file}: ${metadata.width}x${metadata.height}`);

    const cellWidth = Math.floor(metadata.width / GRID_SIZE);
    const cellHeight = Math.floor(metadata.height / GRID_SIZE);

    for (let i = 0; i < batch.ids.length; i++) {
      const id = batch.ids[i];
      const col = i % GRID_SIZE;
      const row = Math.floor(i / GRID_SIZE);

      const left = col * cellWidth;
      const top = row * cellHeight;

      // Ensure we don't exceed bounds due to rounding
      const extractWidth = Math.min(cellWidth, metadata.width - left);
      const extractHeight = Math.min(cellHeight, metadata.height - top);

      console.log(`Extracting ${id} at ${col},${row} (${left},${top} ${extractWidth}x${extractHeight})...`);

      const buffer = await image
        .clone()
        .extract({ left, top, width: extractWidth, height: extractHeight })
        .resize(OUTPUT_SIZE, OUTPUT_SIZE)
        .toBuffer();

      modelBufferMap[id] = buffer;
    }
  }

  // 2. Stitch & Map
  const mapping: Record<string, any> = {};

  for (const [category, ids] of Object.entries(CATEGORIES)) {
    console.log(`Stitching category: ${category} (${ids.length} items)...`);

    // Layout: 5 columns
    const cols = 5;
    const rows = Math.ceil(ids.length / cols);
    const width = cols * OUTPUT_SIZE;
    const height = rows * OUTPUT_SIZE;

    const composites = ids.map((id, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        input: modelBufferMap[id],
        top: row * OUTPUT_SIZE,
        left: col * OUTPUT_SIZE,
      };
    });

    const outputPath = path.join(DEST_DIR, `${category}.webp`);

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .webp({ quality: 90 })
      .toFile(outputPath);

    // Update mapping
    ids.forEach((id, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      mapping[id] = {
        sheet: category,
        x: col * OUTPUT_SIZE,
        y: row * OUTPUT_SIZE,
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
      };
    });
  }

  // 3. Save JSON
  fs.writeFileSync(path.join(DEST_DIR, 'sprites.json'), JSON.stringify(mapping, null, 2));
  console.log('Done!');
}

process().catch(console.error);
