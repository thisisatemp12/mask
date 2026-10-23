// Picture editor: fits a photo onto the mask's LED grid with zoom, drag to pan
// and simple colour adjustments, drawing the result into a mask-sized canvas.

export class PictureEditor {
  /**
   * @param {HTMLCanvasElement} canvas  Canvas at the mask's resolution, shown scaled up.
   * @param {() => {w: number, h: number}} size
   */
  constructor(canvas, size) {
    this.canvas = canvas;
    this.size = size;
    this.image = null;
    this.zoom = 1;
    this.panX = 0; // offset of the image centre from the canvas centre, in LEDs
    this.panY = 0;
    this.fit = 'fill';
    this.background = '#000000';
    this.adjust = { brightness: 100, contrast: 100, saturation: 100 };
    this.enableDragging();
  }

  setImage(image) {
    this.image = image;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.draw();
  }

  draw() {
    const { w, h } = this.size();
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, w, h);
    if (!this.image) return;

    const base = this.fit === 'fill'
      ? Math.max(w / this.image.width, h / this.image.height)
      : Math.min(w / this.image.width, h / this.image.height);
    const scale = base * this.zoom;
    const dw = this.image.width * scale;
    const dh = this.image.height * scale;
    const { brightness, contrast, saturation } = this.adjust;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.image, (w - dw) / 2 + this.panX, (h - dh) / 2 + this.panY, dw, dh);
    ctx.filter = 'none';
  }

  enableDragging() {
    let last = null;
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      if (!this.image) return;
      last = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!last) return;
      // Convert screen pixels to LEDs using the canvas's displayed size.
      const ledsPerPixel = c.width / c.getBoundingClientRect().width;
      this.panX += (e.clientX - last.x) * ledsPerPixel;
      this.panY += (e.clientY - last.y) * ledsPerPixel;
      last = { x: e.clientX, y: e.clientY };
      this.draw();
    });
    const stop = () => { last = null; };
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);
  }
}

/** Load an image file picked by the user, respecting phone photo rotation. */
export function loadImageFile(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}
