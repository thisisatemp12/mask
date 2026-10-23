// Pixel drawing pad at the mask's resolution: pen, eraser and fill, with undo.

const MAX_UNDO = 40;

export class DrawingPad {
  /**
   * @param {HTMLCanvasElement} canvas  Canvas at the mask's resolution, shown scaled up.
   * @param {() => {w: number, h: number}} size
   * @param {() => void} onStroke  Called after each finished stroke or fill.
   */
  constructor(canvas, size, onStroke = () => {}) {
    this.canvas = canvas;
    this.size = size;
    this.onStroke = onStroke;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.tool = 'pen';
    this.colour = '#ffffff';
    this.brush = 1;
    this.background = '#000000';
    this.undoStack = [];
    this.resize();
    this.enablePointer();
  }

  /** Match the canvas to the mask size, keeping what fits of the drawing. */
  resize() {
    const { w, h } = this.size();
    if (this.canvas.width === w && this.canvas.height === h) return;
    const old = this.canvas.width ? this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height) : null;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, w, h);
    if (old) this.ctx.putImageData(old, 0, 0);
    this.undoStack = [];
  }

  saveUndo() {
    this.undoStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.ctx.putImageData(prev, 0, 0);
    this.onStroke();
    return true;
  }

  clear() {
    this.saveUndo();
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.onStroke();
  }

  /** Replace the drawing with another mask-sized canvas, such as the picture editor's. */
  copyFrom(source) {
    this.saveUndo();
    this.ctx.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
    this.onStroke();
  }

  dot(x, y) {
    const r = this.brush;
    const off = Math.floor((r - 1) / 2);
    this.ctx.fillStyle = this.tool === 'eraser' ? this.background : this.colour;
    this.ctx.fillRect(x - off, y - off, r, r);
  }

  /** Draw a line of dots between two LED positions so fast strokes have no gaps. */
  line(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.dot(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Flood fill the area of matching colour around (x, y). */
  fill(x, y) {
    const { width: w, height: h } = this.canvas;
    const img = this.ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const at = (px, py) => (py * w + px) * 4;
    const target = d.slice(at(x, y), at(x, y) + 3);
    const [r, g, b] = hexToRgb(this.colour);
    if (target[0] === r && target[1] === g && target[2] === b) return;
    const same = (i) => d[i] === target[0] && d[i + 1] === target[1] && d[i + 2] === target[2];
    const stack = [[x, y]];
    while (stack.length) {
      const [px, py] = stack.pop();
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = at(px, py);
      if (!same(i)) continue;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    this.ctx.putImageData(img, 0, 0);
  }

  /** Convert a pointer event to the LED it is over. */
  ledAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [
      Math.floor(((e.clientX - rect.left) / rect.width) * this.canvas.width),
      Math.floor(((e.clientY - rect.top) / rect.height) * this.canvas.height),
    ];
  }

  enablePointer() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    let last = null;
    c.addEventListener('pointerdown', (e) => {
      const [x, y] = this.ledAt(e);
      this.saveUndo();
      if (this.tool === 'fill') {
        this.fill(x, y);
        this.onStroke();
        return;
      }
      c.setPointerCapture(e.pointerId);
      last = [x, y];
      this.dot(x, y);
    });
    c.addEventListener('pointermove', (e) => {
      if (!last) return;
      const [x, y] = this.ledAt(e);
      this.line(last[0], last[1], x, y);
      last = [x, y];
    });
    const end = () => {
      if (!last) return;
      last = null;
      this.onStroke();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }
}

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
