import fs from 'fs';
import path from 'path';

const JSON_PATH = 'src/assets/sprites/sprites.json';
const CSS_PATH = 'src/ui/sprites.css';

// Inteface for the JSON structure
interface SpriteData {
  sheet: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const mapping: Record<string, SpriteData> = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

let cssContent = `/* Generated from sprites.json */
.device-icon {
    display: inline-block;
    background-size: 2500px; /* 5 columns * 500px */
    background-repeat: no-repeat;
}
`;

// Helper to sanitize class names if needed (though hex IDs are likely used as is with escaping or just appended)
// CSS classes starting with numbers need escaping, but "device-0x..." is safe.

for (const [id, data] of Object.entries(mapping)) {
  // Path relative from src/ui/sprites.css to src/assets/sprites/
  const imageUrl = `../assets/sprites/${data.sheet}.webp`;

  // background-position is negative x, negative y
  const bgX = data.x === 0 ? '0' : `-${data.x}px`;
  const bgY = data.y === 0 ? '0' : `-${data.y}px`;

  // We can default width/height in a common class if they vary,
  // but here they are all 500x500.
  // Including them for specificity is fine.

  cssContent += `
.device-${id} {
    background-image: url('${imageUrl}');
    background-position: ${bgX} ${bgY};
    width: ${data.width}px;
    height: ${data.height}px;
}
`;
}

// Write CSS
const outDir = path.dirname(CSS_PATH);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(CSS_PATH, cssContent);
console.log(`Generated ${CSS_PATH}`);
