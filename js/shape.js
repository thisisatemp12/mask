// Approximate outline of the mask's oval LED panel. The grid is 46 × 58, but
// the corners have no LEDs: from a photo of a test pattern, the top row has
// about 10 LEDs and the bottom row about 4, and the face is widest about 40%
// of the way down. It also has two eye holes. Used for preview guides and for
// placing the ready-made faces, never to change uploads.

const WIDEST_ROW = 0.42;

/** Half the lit width of row y, in LEDs, for a w × h grid. */
function halfWidth(y, w, h) {
  const cy = (h - 1) * WIDEST_ROW;
  const ry = y < cy ? cy + 0.6 : (h - 1 - cy) + 1.5;
  const t = (y - cy) / ry;
  return (w / 2) * Math.sqrt(Math.max(0, 1 - t * t));
}

// Eye holes (no LEDs, so the wearer can see out), measured from a photo of a
// solid white upload on a 46 × 58 mask: lens shapes over columns 4-17 and
// 28-41, rows 15-20. Stored as fractions so they scale with other sizes.
export const EYE_HOLES = [
  { cx: 10.5 / 46, cy: 17.7 / 58, rx: 7.2 / 46, ry: 2.9 / 58 },
  { cx: 35.5 / 46, cy: 17.7 / 58, rx: 7.2 / 46, ry: 2.9 / 58 },
];

function inEyeHole(x, y, w, h) {
  return EYE_HOLES.some(({ cx, cy, rx, ry }) => {
    const dx = (x + 0.5 - cx * w) / (rx * w);
    const dy = (y + 0.5 - cy * h) / (ry * h);
    return dx * dx + dy * dy <= 1;
  });
}

/** Whether the LED at (x, y) is likely to exist on the panel. */
export function hasLed(x, y, w, h) {
  return Math.abs(x + 0.5 - w / 2) <= halfWidth(y, w, h) + 0.5 && !inEyeHole(x, y, w, h);
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
