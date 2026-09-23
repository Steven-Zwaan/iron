// Traces the reference figures in design/reference/ into shared/data/bodymap.json.
//
//   node scripts/trace-bodymap.mjs                 # write shared/data/bodymap.json + design/bodymap-preview.svg
//   node scripts/trace-bodymap.mjs --stats front   # list the front image's regions (class, bbox, centroid, area, kind)
//   node scripts/trace-bodymap.mjs --stats back    # same for design/reference/body-back.png
//
// Pipeline per image: quantise pixels to the flat palette -> connected components per colour ->
// classify each component into a muscle id (colour + position rules) -> trace it with potrace ->
// scale into a shared body frame (200 wide, body height 384) -> emit JSON.
// The colours of the references only separate regions; the app fills muscles by score tier.
//
// Both figures are required: design/reference/body-front.png and design/reference/body-back.png.
import sharp from 'sharp';
import potrace from 'potrace';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FRONT_SRC = join(root, 'design', 'reference', 'body-front.png');
const BACK_SRC = join(root, 'design', 'reference', 'body-back.png');
const OUT = join(root, 'shared', 'data', 'bodymap.json');
const PREVIEW = join(root, 'design', 'bodymap-preview.svg');
const statsArg = process.argv.indexOf('--stats');
const STATS = statsArg >= 0 ? process.argv[statsArg + 1] ?? 'front' : null;

// Shared frame: one body is 200 units wide; every body is scaled to the same height.
const FRAME_W = 200;
const MARGIN = 4;
const BODY_H = 384;
const FRAME_H = BODY_H + MARGIN * 2;
const GAP = 12;

// Palette classes (measured from the reference images).
const PALETTE = {
  bg: [248, 248, 248],
  dark: [56, 56, 56],
  grey: [184, 184, 184],
  green: [16, 176, 120],
  purple: [128, 80, 248],
  blue: [56, 120, 248],
  orange: [240, 160, 40],
};
const CLASSES = Object.keys(PALETTE);

function nearest(r, g, b) {
  let best = 'bg';
  let bestD = Infinity;
  for (const k of CLASSES) {
    const [pr, pg, pb] = PALETTE[k];
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Image analysis: palette classes, connected components, body frame transform
// ---------------------------------------------------------------------------
async function analyse(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const cls = new Uint8Array(W * H); // index into CLASSES; 0 = bg
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    cls[p] = data[i + 3] < 128 ? 0 : CLASSES.indexOf(nearest(data[i], data[i + 1], data[i + 2]));
  }

  const components = (classIndex) => {
    const seen = new Uint8Array(W * H);
    const out = [];
    const stack = [];
    for (let start = 0; start < W * H; start++) {
      if (seen[start] || cls[start] !== classIndex) continue;
      const comp = { pixels: [], minX: W, minY: H, maxX: 0, maxY: 0, sumX: 0, sumY: 0 };
      stack.push(start);
      seen[start] = 1;
      while (stack.length) {
        const p = stack.pop();
        const x = p % W;
        const y = (p - x) / W;
        comp.pixels.push(p);
        comp.sumX += x;
        comp.sumY += y;
        if (x < comp.minX) comp.minX = x;
        if (x > comp.maxX) comp.maxX = x;
        if (y < comp.minY) comp.minY = y;
        if (y > comp.maxY) comp.maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const x2 = x + dx;
            const y2 = y + dy;
            if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) continue;
            const q = y2 * W + x2;
            if (!seen[q] && cls[q] === classIndex) {
              seen[q] = 1;
              stack.push(q);
            }
          }
        }
      }
      comp.area = comp.pixels.length;
      comp.cx = comp.sumX / comp.area;
      comp.cy = comp.sumY / comp.area;
      comp.cls = CLASSES[classIndex];
      out.push(comp);
    }
    return out.sort((a, b) => b.area - a.area);
  };

  const all = [];
  for (let c = 1; c < CLASSES.length; c++) all.push(...components(c));
  // Grey below 400 px is the figure's thin outline / anti-aliasing, not a region.
  const comps = all.filter((c) => c.area >= (c.cls === 'grey' ? 400 : c.cls === 'dark' ? 18 : 12));

  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  for (let p = 0; p < W * H; p++) {
    if (!cls[p]) continue;
    const x = p % W;
    const y = (p - x) / W;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const midX = (minX + maxX) / 2;
  const scale = BODY_H / (maxY - minY);
  return {
    src,
    W,
    H,
    cls,
    comps,
    midX,
    ny: (y) => (y - minY) / (maxY - minY), // 0 = top of head, 1 = feet
    nx: (x) => (x - midX) / ((maxX - minX) / 2), // -1 left edge .. 1 right edge
    tx: (x) => (x - midX) * scale + FRAME_W / 2,
    ty: (y) => (y - minY) * scale + MARGIN,
    rowOf: (p) => (p - (p % W)) / W,
  };
}

// ---------------------------------------------------------------------------
// Classification rules: colour + normalised position -> muscle id (null = silhouette part)
// ---------------------------------------------------------------------------
function classifyFront(img, c) {
  const y = img.ny(c.cy);
  const ax = Math.abs(img.nx(c.cx));
  switch (c.cls) {
    case 'blue':
      if (y < 0.24) return 'delt'; // shoulder cap: split later into side / front
      if (y < 0.33 && ax > 0.45) return 'delts_side'; // deltoid running down the outer arm
      return ax > 0.16 ? 'obliques' : 'abs';
    case 'green':
      return y < 0.36 ? 'chest' : 'forearms';
    case 'orange':
      return 'biceps';
    case 'purple':
      return y < 0.72 ? 'quads' : 'calves';
    case 'dark':
      if (y > 0.12 && y < 0.2 && ax < 0.15) return 'traps';
      return null;
    default:
      return null;
  }
}

// Verified against `--stats back` for design/reference/body-back.png.
function classifyBack(img, c) {
  const y = img.ny(c.cy);
  const ax = Math.abs(img.nx(c.cx));
  switch (c.cls) {
    case 'blue':
      return 'delts_rear';
    case 'orange':
      return 'triceps'; // three heads per arm
    case 'purple':
      return y < 0.5 ? 'lower_back' : 'calves'; // erector strips (+ the small waist pieces) / gastrocnemius + soleus
    case 'green':
      if (ax > 0.45) return 'forearms';
      if (y < 0.23 && ax < 0.2) return 'traps'; // the diamond either side of the spine
      if (y < 0.28) return 'upper_back'; // the scapular shapes between traps and rear delt
      if (y < 0.4) return 'lats'; // the wings from the armpit to the waist
      if (y < 0.55) return 'glutes'; // incl. the small glute-medius pieces at the hip
      if (y < 0.72) return 'hamstrings'; // incl. the outer-thigh strip
      return 'calves';
    default:
      return null; // head, neck, hands, inner thigh, feet
  }
}

function printStats(img, classify) {
  console.log(`image ${img.W}x${img.H}; frame ${FRAME_W}x${FRAME_H}`);
  console.log('cls'.padEnd(7), 'area'.padStart(6), 'bbox'.padEnd(22), 'centroid'.padEnd(14), 'nx'.padStart(6), 'ny'.padStart(6), ' kind');
  for (const c of img.comps) {
    console.log(
      c.cls.padEnd(7),
      String(c.area).padStart(6),
      `${c.minX},${c.minY}-${c.maxX},${c.maxY}`.padEnd(22),
      `${c.cx.toFixed(1)},${c.cy.toFixed(1)}`.padEnd(14),
      img.nx(c.cx).toFixed(2).padStart(6),
      img.ny(c.cy).toFixed(2).padStart(6),
      ' ',
      classify(img, c) ?? '-',
    );
  }
}

// ---------------------------------------------------------------------------
// Tracing helpers
// ---------------------------------------------------------------------------
function trace(img, pixels) {
  const buf = Buffer.alloc(img.W * img.H, 255);
  for (const p of pixels) buf[p] = 0;
  return sharp(buf, { raw: { width: img.W, height: img.H, channels: 1 } })
    .png()
    .toBuffer()
    .then(
      (png) =>
        new Promise((resolve, reject) => {
          const tracer = new potrace.Potrace({ threshold: 128, turdSize: 2, optCurve: true, alphaMax: 1, optTolerance: 0.2 });
          tracer.loadImage(png, (err) => {
            if (err) return reject(err);
            const m = /d="([^"]+)"/.exec(tracer.getPathTag());
            resolve(transformPath(img, m ? m[1] : ''));
          });
        }),
    );
}

/** potrace emits absolute commands (M x y, C x1 y1 x2 y2 x y, L x y, Z); rescale into the frame and close every subpath. */
function transformPath(img, d) {
  const tokens = d.replace(/([MLCZ])/g, ' $1 ').trim().split(/[\s,]+/);
  const pt = (x, y) => `${img.tx(x).toFixed(1)},${img.ty(y).toFixed(1)}`;
  let out = '';
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'M' || t === 'L') {
      out += `${t}${pt(+tokens[i + 1], +tokens[i + 2])}`;
      i += 3;
    } else if (t === 'C') {
      const n = tokens.slice(i + 1, i + 7).map(Number);
      out += `C${pt(n[0], n[1])} ${pt(n[2], n[3])} ${pt(n[4], n[5])}`;
      i += 7;
    } else if (t === 'Z') {
      out += 'Z';
      i += 1;
    } else i += 1;
  }
  return out.replace(/([^Z])(?=M)/g, '$1Z').replace(/([^Z])$/, '$1Z');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
for (const src of [FRONT_SRC, BACK_SRC]) {
  if (!existsSync(src)) {
    console.error(`Missing reference image: ${src}`);
    process.exit(1);
  }
}
const frontImg = await analyse(FRONT_SRC);
const backImg = await analyse(BACK_SRC);

if (STATS) {
  if (STATS === 'back') printStats(backImg, classifyBack);
  else printStats(frontImg, classifyFront);
  process.exit(0);
}

async function traceView(img, classify, { splitDelt }) {
  const shapes = [];
  for (const c of img.comps) {
    const kind = classify(img, c);
    if (kind === 'delt' && splitDelt) {
      // The front figure draws one shoulder cap; split it vertically at its centroid —
      // outer half = side delts, inner half = front delts — so both muscles stay visible.
      const outer = [];
      const inner = [];
      const sign = c.cx < img.midX ? -1 : 1;
      for (const p of c.pixels) {
        const x = p % img.W;
        if (sign < 0 ? x < c.cx - 1 : x > c.cx + 1) outer.push(p);
        else if (sign < 0 ? x > c.cx + 1 : x < c.cx - 1) inner.push(p);
      }
      shapes.push({ cls: 'mf', m: 'delts_side', d: await trace(img, outer) });
      shapes.push({ cls: 'mf', m: 'delts_front', d: await trace(img, inner) });
      continue;
    }
    const d = await trace(img, c.pixels);
    if (d) shapes.push(kind ? { cls: 'mf', m: kind, d } : { cls: 'base', d });
  }
  return shapes;
}

const front = await traceView(frontImg, classifyFront, { splitDelt: true });
const back = await traceView(backImg, classifyBack, { splitDelt: false });

const out = {
  _comment:
    'Body map geometry traced by scripts/trace-bodymap.mjs from design/reference/body-front.png and body-back.png. ' +
    'Each body is frame.width units wide and scaled to the same height; the back view is drawn at translate(frame.width + gap, 0). ' +
    'Paths use only absolute M/L/C/Z commands so any platform can parse them. cls: base = silhouette part, mf = filled muscle carrying data-m. ' +
    'No colours are stored: the app fills each muscle by its score tier.',
  frame: { width: FRAME_W, height: FRAME_H },
  gap: GAP,
  front,
  back,
};
writeFileSync(OUT, JSON.stringify(out, null, 1).replace(/\n\s+"d": /g, ' "d": '));
console.log(`wrote ${OUT}: ${front.length} front shapes, ${back.length} back shapes`);

// Debug preview: one distinct colour per muscle id, both views, with a legend.
const colours = {
  traps: '#e6194b', delts_front: '#3cb44b', delts_side: '#ffe119', delts_rear: '#4363d8', chest: '#f58231', lats: '#911eb4',
  upper_back: '#46f0f0', lower_back: '#f032e6', biceps: '#bcf60c', triceps: '#fabebe', forearms: '#008080', abs: '#e6beff',
  obliques: '#9a6324', glutes: '#fffac8', quads: '#800000', hamstrings: '#aaffc3', calves: '#808000',
};
const view = (shapes, dx) =>
  `<g transform="translate(${dx},0)">` +
  shapes.map((s) => `<path d="${s.d}" fill="${s.m ? colours[s.m] : '#3a3f4c'}" stroke="#111" stroke-width="0.5"${s.m ? ` data-m="${s.m}"` : ''}/>`).join('') +
  '</g>';
const legendX = 2 * FRAME_W + GAP + 10;
const legend = Object.entries(colours)
  .map(([m, c], i) => `<rect x="${legendX}" y="${10 + i * 20}" width="14" height="14" fill="${c}"/><text x="${legendX + 20}" y="${22 + i * 20}" font-size="11" fill="#ddd" font-family="sans-serif">${m}</text>`)
  .join('');
const totalW = 2 * FRAME_W + GAP + 130;
writeFileSync(
  PREVIEW,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${FRAME_H}" width="${totalW * 2}" height="${FRAME_H * 2}"><rect width="100%" height="100%" fill="#0f1116"/>${view(front, 0)}${view(back, FRAME_W + GAP)}${legend}</svg>`,
);
console.log(`wrote ${PREVIEW}`);
