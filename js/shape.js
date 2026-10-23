// Approximate outline of the mask's oval LED panel. The grid is 46 × 58, but
// the corners have no LEDs: from a photo of a test pattern, the top row has
// about 10 LEDs and the bottom row about 4, and the face is widest about 40%
// of the way down. Used only for preview guides, never to change uploads.

const WIDEST_ROW = 0.42;

/** Half the lit width of row y, in LEDs, for a w × h grid. */
function halfWidth(y, w, h) {
  const cy = (h - 1) * WIDEST_ROW;
  const ry = y < cy ? cy + 0.6 : (h - 1 - cy) + 0.2;
  const t = (y - cy) / ry;
  return (w / 2) * Math.sqrt(Math.max(0, 1 - t * t));
}

/** Whether the LED at (x, y) is likely to exist on the panel. */
export function hasLed(x, y, w, h) {
  return Math.abs(x + 0.5 - w / 2) <= halfWidth(y, w, h) + 0.5;
}

/**
 * Draw a guide over a preview: dims everything outside the oval so you can
 * see what the mask will actually show.
 */
export function drawShapeGuide(overlay, w, h) {
  overlay.width = w;
  overlay.height = h;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(52, 57, 70, 0.88)';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!hasLed(x, y, w, h)) ctx.fillRect(x, y, 1, 1);
    }
  }
}
