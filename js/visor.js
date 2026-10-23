// Visor effects, in two kinds:
//
// - Smooth: a long, repeating 16-row strip sent through the mask's text mode,
//   which the mask scrolls smoothly by itself. Each column has one colour.
//   The band's position on the face is fixed by the firmware; from photos of
//   scrolling text it sits just below the eye holes (about rows 21-36).
// - Shaped: a visor drawn across the eyes as full-colour frames in slots,
//   looped at the mask's slot rate of about one frame a second.

import { TEXT_HEIGHT, encodeTextBitmap, encodeTextColours } from './protocol.js?v=20261023183327';
import { clipToPanel } from './faces.js?v=20261023183327';

export const TEXT_BAND_TOP = 21;

// The strip is 8 screens long (368 columns): every pattern period and colour
// cycle divides it, so it loops without a seam, and it stays well under the
// length that has locked masks up.
const STRIP_SCREENS = 8;
const STRIP_WIDTH = 46 * STRIP_SCREENS;

function hueRgb(h) {
  const k = (n) => (n + h / 30) % 12;
  const f = (n) => 0.5 - 0.5 * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Smooth patterns. `lit(x, y)` says whether a pixel is on (y: 0-15 down the
 * band) and `period` is how often the pattern repeats, so the strip length can
 * divide the strip length so the loop has no visible seam.
 */
export const SMOOTH_PATTERNS = {
  band: {
    name: 'Solid band',
    period: 46,
    lit: (x, y) => y >= 2 && y <= 13,
  },
  grid: {
    name: 'LED grid',
    period: 2,
    lit: (x, y) => y >= 2 && y <= 13 && (x + y) % 2 === 0,
  },
  chevrons: {
    name: 'Chevrons',
    period: 8,
    lit: (x, y) => mod(x - Math.abs(y - 7.5) / 2, 8) < 3,
  },
  wave: {
    name: 'Wave',
    period: 46,
    lit: (x, y) => Math.abs(y - (7.5 + 5.5 * Math.sin((x / 46) * Math.PI * 4))) < 1.6,
  },
  stripes: {
    name: 'Diagonal stripes',
    period: 8,
    lit: (x, y) => mod(x + y, 8) < 4,
  },
  equalizer: {
    name: 'Equalizer',
    period: 46,
    lit: (x, y) => {
      if (x % 4 === 3) return false;
      const bar = Math.floor(x / 4);
      const height = 3 + ((bar * 7 + (bar * bar) % 5) % 12);
      return y >= 15 - height;
    },
  },
  scanner: {
    name: 'Scanner',
    period: 46,
    lit: (x, y) => y >= 3 && y <= 12 && mod(x, 46) < 14,
  },
};

/** How bright a scanner column is: a bright head with a fading tail. */
function scannerLevel(x) {
  const p = mod(x, 46);
  return p < 14 ? Math.max(0.15, 1 - (13 - p) / 14) : 0;
}

/**
 * Build the strip for a smooth pattern. `colouring` is 'solid' (one colour),
 * 'rainbow' (hue flows along the strip) or 'fade' (dim to bright and back).
 * Returns the bitmap, colour array and a preview canvas.
 */
export function buildSmoothStrip(patternKey, colouring, colourHex) {
  const pattern = SMOOTH_PATTERNS[patternKey];
  const width = STRIP_WIDTH;
  const base = hexToRgb(colourHex);

  const colourAt = (x) => {
    let rgb = base;
    if (colouring === 'rainbow') rgb = hueRgb((x / width) * 360 * STRIP_SCREENS / 2);
    else if (colouring === 'fade') {
      const t = 0.5 + 0.5 * Math.cos((x / 46) * Math.PI * 2);
      rgb = base.map((c) => c * (0.2 + 0.8 * t));
    }
    if (patternKey === 'scanner') rgb = rgb.map((c) => c * scannerLevel(x));
    return rgb.map(Math.round);
  };

  const bitmap = encodeTextBitmap(width, pattern.lit);
  const colours = encodeTextColours(width, colourAt);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = TEXT_HEIGHT;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, TEXT_HEIGHT);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < TEXT_HEIGHT; y++) {
      if (pattern.lit(x, y)) img.data.set([colours[x * 3], colours[x * 3 + 1], colours[x * 3 + 2], 255], (y * width + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { bitmap, colours, canvas, width };
}

/** Draw the visible part of a scrolling strip into a mask-sized preview at `offset` columns. */
export function drawSmoothPreview(canvas, { w, h }, strip, offset) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const top = Math.round((TEXT_BAND_TOP * h) / 58);
  const x0 = mod(Math.floor(offset), strip.width);
  // Draw twice so the view wraps around the end of the strip.
  ctx.drawImage(strip.canvas, -x0, top);
  ctx.drawImage(strip.canvas, strip.width - x0, top);
  clipToPanel(ctx, w, h);
}

// --- Shaped visor ---

export const SHAPED_PATTERNS = {
  scan: { name: 'Scan line' },
  pulse: { name: 'Pulse' },
  rainbow: { name: 'Rainbow sweep' },
  sparkle: { name: 'Sparkle' },
};

/** Whether (x, y) on a 46 × 58 mask is inside the visor: a wide band over the eyes with a nose notch. */
function inVisor(x, y) {
  const top = 10;
  const bottom = 25;
  if (y < top || y > bottom) return false;
  // Taper the outer ends upward, like wraparound glasses.
  const edge = Math.min(x, 45 - x);
  if (edge < 6 && y > bottom - (6 - edge)) return false;
  // Nose bridge notch at the bottom centre.
  const fromCentre = Math.abs(x + 0.5 - 23);
  if (y > 19 && fromCentre < (y - 19) * 1.2 + 1) return false;
  return true;
}

/** Draw one frame of the shaped visor. `phase` runs 0-1 over the loop. */
export function drawShapedVisor(canvas, { w, h }, { pattern, colour, grid, phase }) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const base = hexToRgb(colour);
  const sx = w / 46;
  const sy = h / 58;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const vx = Math.floor(x / sx);
      const vy = Math.floor(y / sy);
      if (!inVisor(vx, vy)) continue;
      if (grid && (vx + vy) % 2) continue;
      let level = 0.5;
      let rgb = base;
      if (pattern === 'scan') {
        // A bright line sweeping left to right with a fading trail.
        const behind = mod(phase * 46 - vx, 46);
        level = Math.max(0.4, 1 - behind / 12);
      } else if (pattern === 'pulse') {
        level = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
      } else if (pattern === 'rainbow') {
        rgb = hueRgb(mod(vx / 46 - phase, 1) * 360);
        level = 1;
      } else if (pattern === 'sparkle') {
        const n = Math.sin(vx * 12.9898 + vy * 78.233 + Math.floor(phase * 97) * 37.719) * 43758.5453;
        level = n - Math.floor(n) > 0.8 ? 1 : 0.3;
      }
      ctx.fillStyle = `rgb(${rgb.map((c) => Math.round(c * level)).join(',')})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  clipToPanel(ctx, w, h);
}
