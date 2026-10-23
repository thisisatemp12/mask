// Hypnotic eyes: spirals and patterns drawn per LED from polar coordinates,
// animated by advancing a phase from frame to frame.

import { clipToPanel } from './faces.js?v=20261023185432';

const TAU = Math.PI * 2;

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `rgb(${Math.round(f(0) * 255)}, ${Math.round(f(8) * 255)}, ${Math.round(f(4) * 255)})`;
}

/**
 * Patterns. Each takes polar coordinates inside the eye (r from 0 at the
 * centre to 1 at the edge, angle a in radians), the animation phase (0 to 1)
 * and the chosen colour, and returns a CSS colour or null for off.
 */
export const PATTERNS = {
  spiral: {
    name: 'Spiral',
    pixel: (r, a, phase, colour) => (((a / TAU) * 2 + r * 2.2 - phase) % 1 + 1) % 1 < 0.5 ? colour : null,
  },
  rainbow: {
    name: 'Rainbow spiral',
    pixel: (r, a, phase) => {
      const t = (((a / TAU) + r * 1.6 - phase) % 1 + 1) % 1;
      return hsl(t * 360, 1, 0.5);
    },
  },
  hypno: {
    name: 'Red and black',
    pixel: (r, a, phase) => (((a / TAU) * 3 + r * 3 - phase) % 1 + 1) % 1 < 0.5 ? '#ff1030' : null,
  },
  rings: {
    name: 'Rings',
    pixel: (r, a, phase, colour) => ((r * 3 - phase) % 1 + 1) % 1 < 0.45 ? colour : null,
  },
  pinwheel: {
    name: 'Pinwheel',
    pixel: (r, a, phase, colour) => ((((a / TAU) * 6 - phase) % 1 + 1) % 1 < 0.5 && r > 0.15 ? colour : null),
  },
  vortex: {
    name: 'Vortex',
    pixel: (r, a, phase) => {
      const t = (((a / TAU) * 4 + Math.sqrt(r) * 3 - phase) % 1 + 1) % 1;
      return t < 0.5 ? hsl(260 + r * 100, 1, 0.3 + 0.35 * (1 - r)) : null;
    },
  },
};

const MOUTH_ROWS = {
  none: null,
  grin: [
    '##...................##',
    '.##.................##.',
    '..###.............###..',
    '....###############....',
    '......###########......',
  ],
  flat: ['.....#############.....', '.....#############.....'],
  o: [
    '........#######........',
    '.......##.....##.......',
    '.......##.....##.......',
    '........#######........',
  ],
};
export const HYPNO_MOUTHS = { none: 'No mouth', grin: 'Grin', flat: 'Flat', o: 'O' };

/**
 * Draw one frame of hypnotic eyes into a mask-sized canvas.
 * Options: pattern, phase (0-1), colour, radius (in LEDs on a 46-wide mask),
 * eyeCentre (row on a 58-row mask), mouth, counter (right eye spins the other way).
 */
export function drawHypno(canvas, { w, h }, opts) {
  const { pattern, phase, colour, radius, eyeCentre, mouth, counter } = opts;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const R = (radius * w) / 46;
  const cy = (eyeCentre * h) / 58;
  // Eye centres line up with the eye holes' columns.
  const centres = [(10.5 * w) / 46, (35.5 * w) / 46];
  const draw = PATTERNS[pattern].pixel;

  centres.forEach((cx, i) => {
    const mirror = counter && i === 1;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const r = Math.hypot(dx, dy) / R;
        if (r > 1) continue;
        let a = Math.atan2(dy, mirror ? -dx : dx);
        if (a < 0) a += TAU;
        const c = draw(r, a, phase, colour);
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  });

  const rows = MOUTH_ROWS[mouth];
  if (rows) {
    const top = Math.max(Math.round(h * 0.7), Math.ceil(cy + R) + 3);
    const left = Math.round((w - rows[0].length) / 2);
    ctx.fillStyle = pattern === 'rainbow' || pattern === 'vortex' || pattern === 'hypno' ? '#ffffff' : colour;
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '#') ctx.fillRect(left + x, top + y, 1, 1);
    }));
  }

  clipToPanel(ctx, w, h);
}

/** Frames for a looping hypno animation: `count` evenly spaced phases. */
export function hypnoFrames(count) {
  return Array.from({ length: count }, (_, i) => i / count);
}
