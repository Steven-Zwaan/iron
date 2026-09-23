// Generates public/icons/*.png from an inline SVG using sharp (dev dependency only).
// Run: npm run icons
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public', 'icons');
await mkdir(out, { recursive: true });

/** A stylised lifter torso on the dark token background; gold "perfect" tier accent. */
function icon({ size, pad, rounded }) {
  const inner = size - pad * 2;
  const s = inner / 100; // design space 100x100
  const r = rounded ? size * 0.22 : 0;
  const bgRect = `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#0F1116"/>`;
  const g = `<g transform="translate(${pad},${pad}) scale(${s})">
    <!-- shoulders / traps -->
    <path d="M50 18 C38 18 28 24 22 34 L30 44 C36 36 42 32 50 32 Z" fill="#A371F7"/>
    <path d="M50 18 C62 18 72 24 78 34 L70 44 C64 36 58 32 50 32 Z" fill="#A371F7"/>
    <!-- delts -->
    <circle cx="20" cy="46" r="11" fill="#E3B341"/>
    <circle cx="80" cy="46" r="11" fill="#E3B341"/>
    <!-- chest -->
    <path d="M50 36 C40 34 33 38 31 46 C29 56 32 64 38 68 C44 70 48 68 50 62 Z" fill="#3D8BFD"/>
    <path d="M50 36 C60 34 67 38 69 46 C71 56 68 64 62 68 C56 70 52 68 50 62 Z" fill="#3D8BFD"/>
    <!-- abs -->
    <path d="M42 70 L58 70 L56 90 L44 90 Z" fill="#3FB950"/>
    <!-- arms -->
    <path d="M14 56 L10 82" stroke="#3FB950" stroke-width="11" stroke-linecap="round"/>
    <path d="M86 56 L90 82" stroke="#3FB950" stroke-width="11" stroke-linecap="round"/>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bgRect}${g}</svg>`;
}

const jobs = [
  ['192.png', icon({ size: 192, pad: 24, rounded: false })],
  ['512.png', icon({ size: 512, pad: 64, rounded: false })],
  ['512-maskable.png', icon({ size: 512, pad: 112, rounded: false })],
  ['apple-touch-icon.png', icon({ size: 180, pad: 24, rounded: false })],
];

for (const [name, svg] of jobs) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(join(out, name), png);
  console.log('wrote', name, png.length, 'bytes');
}
