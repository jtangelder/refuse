import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.resolve(__dirname, '../src/assets');
const OUT_HTML = path.resolve(__dirname, 'amp-debug.html');

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

  // Convert to raw RGB (drop alpha if exists, or just ignore it)
  // We'll use ensureAlpha just to have consistent 4 channels, but we look at RGB distance.
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const visited = new Uint8Array(width * height);
  const regions: Rect[] = [];

  // Get background color from (0,0)
  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];
  const bgA = data[3];

  // Threshold for color difference
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

    // If fully transparent, it's background
    if (a < 10) return true;

    // If close to background color
    return (
      Math.abs(r - bgR) < COLOR_THRESHOLD && Math.abs(g - bgG) < COLOR_THRESHOLD && Math.abs(b - bgB) < COLOR_THRESHOLD
    );
  }

  /* 
     Simple detailed scan:
     Iterate pixels. If NOT background and not visited, start a flood fill.
  */

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (visited[getIdx(x, y)]) continue;

      if (!isBackground(x, y)) {
        // Start new region
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

          // Check neighbors
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

        // Filter out tiny noise (e.g. compression artifacts)
        // Amps are likely significant in size.
        if (pixelCount > 1000 && maxX - minX > 50 && maxY - minY > 50) {
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

  /* 
     Merge regions that are close together.
     Iterative greedy merge.
  */
  let mergedRegions = regions;
  let changed = true;
  const DIST_THRESHOLD = 30;

  function isClose(r1: Rect, r2: Rect) {
    // Check if they overlap or are within distance
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

      // Try to merge with any subsequent
      // We restart the inner loop if we merge, to capture transitive merges effectively in next main pass?
      // Or just greedy merge all possible in one pass.

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

async function main() {
  console.log('Scanning amps1.webp...');
  const regions1 = await extractRegions(path.join(ASSETS_DIR, 'amps1.webp'), 'amps1.webp');

  console.log('Scanning amps2.webp...');
  const regions2 = await extractRegions(path.join(ASSETS_DIR, 'amps2.webp'), 'amps2.webp');

  const allRegions = [...regions1, ...regions2];

  // Mapping based on visual identification
  const mapping: Record<string, string> = {
    // amps1
    'amps1.webp_0': 'brit-60s',
    'amps1.webp_1': 'thrift-60s',
    'amps1.webp_2': 'us-90s',
    'amps1.webp_3': 'brit-70s',
    'amps1.webp_4': 'brit-80s',
    'amps1.webp_5': 'unknown-jcm800',
    'amps1.webp_6': 'f57-deluxe',
    'amps1.webp_7': 'f57-champ',
    'amps1.webp_8': 'brit-colour',
    'amps1.webp_9': 'brit-watts',

    // amps2
    'amps2.webp_0': 'f57-twin',
    'amps2.webp_1': 'f59-bassman',
    'amps2.webp_2': 'f65-deluxe',
    'amps2.webp_3': 'f65-princeton',
    'amps2.webp_4': 'f65-twin',
    'amps2.webp_5': 'super-sonic',
    'amps2.webp_6': 'metal-2000', // Head
    'amps2.webp_7': 'metal-2000-cab',
    'amps2.webp_8': 'studio-preamp',
  };

  let css = `
/* Auto-generated by tools/scan_amp_coordinates.ts */
.amp-icon {
  display: inline-block;
  background-repeat: no-repeat;
  /* Use a fixed height/width or scaling factor? 
     The original images are huge (2816x1536).
     We likely want to scale them down for the UI.
     Let's assume we want them to fit in approx 100px width or so.
     We'll use background-size to scale the whole sprite.
  */
  transform-origin: top left;
}
`;

  // Scale factor to reduce checking size.
  // Original is ~2816 wide. If we display at 10% scale?
  const SCALE = 0.375;

  Object.entries(mapping).forEach(([id, name]) => {
    const region = allRegions.find(r => r.id === id);
    if (region) {
      // coordinates
      // background-position: -x -y
      // background-size: width height (of the whole image)

      const bgX = -region.rect.x * SCALE;
      const bgY = -region.rect.y * SCALE;
      const width = region.rect.w * SCALE;
      const height = region.rect.h * SCALE;

      const file = region.imageFile; // 'amps1.webp'

      css += `
.amp-icon.model-${name} {
  background-image: url('../assets/${file}');
  background-position: ${bgX}px ${bgY}px;
  background-size: ${2816 * SCALE}px ${1536 * SCALE}px;
  width: ${width}px;
  height: ${height}px;
}
`;
    }
  });

  const cssPath = path.resolve(__dirname, '../src/ui/amp-sprites.css');
  fs.writeFileSync(cssPath, css);
  console.log(`Generated CSS at ${cssPath}`);

  // Sort vaguely by position to make manual mapping easier if needed,
  // but flood scan usually does top-left to bottom-right anyway.

  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { background: #333; color: white; font-family: sans-serif; }
      .container { display: flex; flex-wrap: wrap; gap: 20px; }
      .item { border: 1px solid #666; padding: 10px; background: #222; }
      .preview { 
         background-repeat: no-repeat; 
         display: block; 
         margin-bottom: 10px;
         background-size: initial; /* Ensure 1:1 scale of source image */
         zoom: 0.25; /* Zoom visual only */
      }
      .info { font-size: 14px; }
      input { width: 300px; padding: 5px; }
    </style>
  </head>
  <body>
    <h1>Amp Detection Debug</h1>
    <p>Please check which model corresponds to which image.</p>
    <div class="container">
  `;

  for (const item of allRegions) {
    // We set the background image to the source file
    // And position it so the crop is visible
    const bgPos = `-${item.rect.x}px -${item.rect.y}px`;
    const dims = `${item.rect.w}px ${item.rect.h}px`;

    // We need absolute path for local html to work, or relative if served.
    // Assuming we open this file in 'tools', assets is '../src/assets'
    const imgPath = `../src/assets/${item.imageFile}`;

    html += `
      <div class="item">
        <h3>ID: ${item.id}</h3>
        <div class="preview" style="
          width: ${dims}; 
          height: ${dims}; 
          background-image: url('${imgPath}'); 
          background-position: ${bgPos};
        "></div>
        <div class="info">
          Rect: x=${item.rect.x}, y=${item.rect.y}, w=${item.rect.w}, h=${item.rect.h}<br>
          File: ${item.imageFile}
        </div>
        <label>
           Model Name: <input type="text" placeholder="e.g. '57 Deluxe" data-id="${item.id}">
        </label>
      </div>
    `;
  }

  html += `
    </div>
  </body>
  </html>
  `;

  fs.writeFileSync(OUT_HTML, html);
  console.log(`Generated debug HTML at ${OUT_HTML}`);
}

main().catch(err => console.error(err));
