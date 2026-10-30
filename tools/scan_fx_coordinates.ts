import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.resolve(__dirname, '../src/assets');
// Output to tools/ directory as requested
const OUT_HTML = path.resolve(__dirname, 'fx-debug.html');

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function extractRegions(
  imagePath: string,
  filename: string,
): Promise<{ rect: Rect; id: string; imageFile: string }[]> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const visited = new Uint8Array(width * height);
  const regions: Rect[] = [];

  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];
  const bgA = data[3];

  const COLOR_THRESHOLD = 20;

  function getIdx(x: number, y: number) {
    return y * width + x;
  }

  function isBackground(x: number, y: number) {
    const idx = getIdx(x, y) * info.channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];

    if (a < 10) return true;
    return (
      Math.abs(r - bgR) < COLOR_THRESHOLD && Math.abs(g - bgG) < COLOR_THRESHOLD && Math.abs(b - bgB) < COLOR_THRESHOLD
    );
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (visited[getIdx(x, y)]) continue;

      if (!isBackground(x, y)) {
        let minX = x,
          maxX = x,
          minY = y,
          maxY = y;
        const stack = [[x, y]];
        visited[getIdx(x, y)] = 1;

        let pixelCount = 0;

        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          pixelCount++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (!visited[getIdx(nx, ny)] && !isBackground(nx, ny)) {
                visited[getIdx(nx, ny)] = 1;
                stack.push([nx, ny]);
              }
            }
          }
        }

        // Reduced pixel count threshold as effects might be smaller than amps,
        // but 1000 pixels is still reasonable for a large source image.
        if (pixelCount > 500 && maxX - minX > 30 && maxY - minY > 30) {
          regions.push({
            x: minX,
            y: minY,
            w: maxX - minX + 1,
            h: maxY - minY + 1,
          });
        }
      }
    }
  }

  let mergedRegions = regions;
  let changed = true;
  const DIST_THRESHOLD = 30;

  function isClose(r1: Rect, r2: Rect) {
    const r1x2 = r1.x + r1.w;
    const r1y2 = r1.y + r1.h;
    const r2x2 = r2.x + r2.w;
    const r2y2 = r2.y + r2.h;

    const x_overlap = Math.max(0, Math.min(r1x2, r2x2) - Math.max(r1.x, r2.x) + DIST_THRESHOLD);
    const y_overlap = Math.max(0, Math.min(r1y2, r2y2) - Math.max(r1.y, r2.y) + DIST_THRESHOLD);

    return x_overlap > 0 && y_overlap > 0;
  }

  function merge(r1: Rect, r2: Rect): Rect {
    const x = Math.min(r1.x, r2.x);
    const y = Math.min(r1.y, r2.y);
    const w = Math.max(r1.x + r1.w, r2.x + r2.w) - x;
    const h = Math.max(r1.y + r1.h, r2.y + r2.h) - y;
    return { x, y, w, h };
  }

  while (changed) {
    changed = false;
    const newRegions: Rect[] = [];
    const used = new Array(mergedRegions.length).fill(false);

    for (let i = 0; i < mergedRegions.length; i++) {
      if (used[i]) continue;
      let current = mergedRegions[i];
      used[i] = true;
      for (let j = i + 1; j < mergedRegions.length; j++) {
        if (!used[j] && isClose(current, mergedRegions[j])) {
          current = merge(current, mergedRegions[j]);
          used[j] = true;
          changed = true;
        }
      }
      newRegions.push(current);
    }
    mergedRegions = newRegions;
  }

  return mergedRegions.map((r, i) => ({
    rect: r,
    id: `${filename}_${i}`,
    imageFile: filename,
  }));
}

const EFFECT_NAMES = [
  // Stomps
  'Overdrive',
  'Fixed Wah',
  'Touch Wah',
  'Fuzz',
  'Fuzz Touch Wah',
  'Simple Comp',
  'Compressor',
  'Ranger Boost',
  'Green Box',
  'Orange Box',
  'Black Box',
  'Big Fuzz',
  // Mod
  'Sine Chorus',
  'Triangle Chorus',
  'Sine Flanger',
  'Triangle Flanger',
  'Vibratone',
  'Vintage Tremolo',
  'Sine Tremolo',
  'Ring Modulator',
  'Step Filter',
  'Phaser',
  'Pitch Shifter',
  // Delay
  'Mono Delay',
  'Mono Echo Filter',
  'Stereo Echo Filter',
  'Tape Delay',
  'Stereo Tape Delay',
  'Ducking Delay',
  'Reverse Delay',
  'Multitap Delay',
  'Ping Pong Delay',
  // Reverb
  'Small Hall',
  'Large Hall',
  'Small Room',
  'Large Room',
  'Small Plate',
  'Large Plate',
  'Ambient',
  'Arena',
  "'63 Spring",
  "'65 Spring",
];

async function main() {
  const regions: { rect: Rect; id: string; imageFile: string }[] = [];

  for (let i = 1; i <= 4; i++) {
    const file = `fx_${i}.webp`;
    console.log(`Scanning ${file}...`);
    const r = await extractRegions(path.join(ASSETS_DIR, file), file);
    regions.push(...r);
  }

  const SCALE = 0.375;

  let css = `
/* Auto-generated by tools/scan_fx_coordinates.ts */
.fx-icon {
  display: inline-block;
  background-repeat: no-repeat;
  transform-origin: top left;
}
`;

  regions.forEach(region => {
    const bgX = -region.rect.x * SCALE;
    const bgY = -region.rect.y * SCALE;
    const width = region.rect.w * SCALE;
    const height = region.rect.h * SCALE;
    const SOURCE_W = 2816;
    const SOURCE_H = 1536;

    css += `
.fx-icon.id-${region.id.replace(/\./g, '-')} {
  background-image: url('../assets/${region.imageFile}');
  background-position: ${bgX}px ${bgY}px;
  background-size: ${SOURCE_W * SCALE}px ${SOURCE_H * SCALE}px;
  width: ${width}px;
  height: ${height}px;
}
`;
  });

  const cssPath = path.resolve(__dirname, '../src/ui/fx-sprites.css');
  fs.writeFileSync(cssPath, css);
  console.log(`Generated CSS at ${cssPath}`);

  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { background: #333; color: white; font-family: sans-serif; padding: 20px; }
      .container { display: flex; flex-wrap: wrap; gap: 20px; }
      .item { border: 1px solid #666; padding: 15px; background: #222; border-radius: 8px; width: 320px; }
      .preview { 
         background-repeat: no-repeat; 
         display: block; 
         margin-bottom: 10px;
         background-size: initial; 
         zoom: 0.25; 
         border: 1px dashed #555;
      }
      .info { font-size: 12px; color: #aaa; margin-bottom: 10px; }
      select { width: 100%; padding: 8px; background: #444; color: white; border: 1px solid #666; margin-bottom: 10px; }
      button { background: #3498db; color: white; border: none; padding: 8px 16px; cursor: pointer; width: 100%; }
      button:hover { background: #2980b9; }
      .msg { font-size: 12px; color: #2ecc71; min-height: 1.2em; text-align: center; margin-top: 5px; }
    </style>
  </head>
  <body>
    <h1>FX Detection Debug</h1>
    <p>Open this file directly in your browser. If images are missing, ensure you are opening it from the project root.</p>
    <div class="container">
  `;

  const options = EFFECT_NAMES.map(n => `<option value="${n}">${n}</option>`).join('');

  for (const item of regions) {
    const bgPos = `-${item.rect.x}px -${item.rect.y}px`;
    // Path relative to tools/ (where this HTML will be)
    const imgPath = `../src/assets/${item.imageFile}`;

    html += `
      <div class="item">
        <h3>ID: ${item.id}</h3>
        <div class="preview" style="
          width: ${item.rect.w}px; 
          height: ${item.rect.h}px; 
          background-image: url('${imgPath}'); 
          background-position: ${bgPos};
        "></div>
        <div class="info">
          File: ${item.imageFile}<br>
          Rect: ${item.rect.x}, ${item.rect.y}, ${item.rect.w}, ${item.rect.h}
        </div>
        
        <select id="sel-${item.id}">
          <option value="">-- Guess Model --</option>
          ${options}
        </select>
        
        <button onclick="copy('${item.id}')">Copy ID + Guess</button>
        <div class="msg" id="msg-${item.id}"></div>
      </div>
    `;
  }

  html += `</div>
  <script>
    function copy(id) {
        const sel = document.getElementById('sel-' + id);
        const guess = sel.value;
        const text = id + ': ' + (guess || 'Unknown');
        navigator.clipboard.writeText(text).then(() => {
            document.getElementById('msg-' + id).textContent = 'Copied!';
            setTimeout(() => document.getElementById('msg-' + id).textContent = '', 2000);
        });
    }
  </script>
  </body></html>`;

  fs.writeFileSync(OUT_HTML, html);
  console.log(`Generated debug HTML at ${OUT_HTML}`);
}

main().catch(err => console.error(err));
