// Text rendering, both for the mask's own scrolling text mode and as a still picture.

import { TEXT_HEIGHT, encodeTextBitmap, encodeTextColours } from './protocol.js';

// Long bitmaps can lock up the mask until its battery is pulled, so stay well clear.
export const MAX_TEXT_COLUMNS = 512;

const FONT = 'bold 14px system-ui, Roboto, sans-serif';

/**
 * Render text as a 16-pixel-high on/off strip for the mask's text mode.
 * Returns the canvas (for previews) plus the encoded bitmap and colour array.
 * `colourAt(x, width)` gives the [r, g, b] for each column.
 */
export function renderScrollingText(text, colourAt) {
  const canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  ctx.font = FONT;
  const fullWidth = Math.ceil(ctx.measureText(text).width) + 2;
  const width = Math.max(1, Math.min(fullWidth, MAX_TEXT_COLUMNS));
  canvas.width = width;
  canvas.height = TEXT_HEIGHT;
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = FONT;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 1, 13);

  const alpha = ctx.getImageData(0, 0, width, TEXT_HEIGHT).data;
  const isLit = (x, y) => alpha[(y * width + x) * 4 + 3] >= 110;
  const bitmap = encodeTextBitmap(width, isLit);
  const colours = encodeTextColours(width, (x) => colourAt(x, width));

  // Redraw the preview exactly as the mask will show it: lit pixels in their column colour.
  const out = ctx.createImageData(width, TEXT_HEIGHT);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < TEXT_HEIGHT; y++) {
      if (!isLit(x, y)) continue;
      const i = (y * width + x) * 4;
      out.data.set([colours[x * 3], colours[x * 3 + 1], colours[x * 3 + 2], 255], i);
    }
  }
  ctx.putImageData(out, 0, 0);
  return { canvas, bitmap, colours, width, truncated: fullWidth > MAX_TEXT_COLUMNS };
}

/** A rainbow across the text, one hue step per column. */
export function rainbow(x, width) {
  return hslToRgb((x / Math.max(1, width)) * 360, 1, 0.5);
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * Draw text as a still picture filling the mask, word-wrapped and sized as
 * large as will fit.
 */
export function drawStillText(canvas, text, { w, h, colour, background }) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;

  for (let size = 40; size >= 6; size--) {
    ctx.font = `bold ${size}px system-ui, Roboto, sans-serif`;
    const lines = wrap(ctx, words, w - 2);
    const lineHeight = Math.ceil(size * 1.05);
    const fits = lines.every((l) => ctx.measureText(l).width <= w - 2) && lines.length * lineHeight <= h - 2;
    if (!fits && size > 6) continue;

    ctx.fillStyle = colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const top = (h - lines.length * lineHeight) / 2 + lineHeight / 2;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * lineHeight));
    return;
  }
}

function wrap(ctx, words, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
