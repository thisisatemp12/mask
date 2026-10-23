// End-to-end check of the page in headless Chromium against a fake mask.
// Run with: node tests/browser-smoke.mjs  (needs Playwright and a local server on :8000)
import { chromium } from 'playwright';

const fakeMask = () => {
  const received = { commands: [], packets: 0 };
  window.__fakeMask = received;
  const listeners = [];
  const proto = () => import('/js/protocol.js');
  const reply = async (name) => {
    const p = await proto();
    const value = p.encrypt(p.buildCommand(name));
    setTimeout(() => listeners.forEach((l) => l({ target: { value: new DataView(value.buffer) } })), 5);
  };
  const char = (uuid) => ({
    uuid,
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse(bytes) {
      const p = await proto();
      if (uuid === p.UPLOAD_CHAR) { received.packets++; return reply('REOK'); }
      const name = p.replyName(p.decrypt(new Uint8Array(bytes)));
      received.commands.push(name);
      if (name === 'DATS') reply('DATSOK');
      if (name === 'DATCP') reply('DATCPOK');
    },
    addEventListener: (_, l) => listeners.push(l),
    startNotifications: async () => {},
    getDescriptor: async () => ({ readValue: async () => new DataView(new TextEncoder().encode('TR-FAKE').buffer) }),
  });
  const device = {
    name: 'MASK-FAKE',
    addEventListener() {},
    gatt: {
      connected: false,
      async connect() { this.connected = true; return this; },
      disconnect() { this.connected = false; },
      getPrimaryService: async () => ({ getCharacteristic: async (u) => char(u) }),
    },
  };
  Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device } });
};

const outDir = process.argv[2] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(fakeMask);
await page.goto('http://localhost:8000/');
await page.click('#connect');
await page.waitForSelector('#status.ok');
const waitShowing = (prefix) => page.waitForFunction(
  (p) => document.querySelector('#status').textContent.startsWith(p), prefix, { timeout: 15000 });
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });

// Picture: generate a test photo in the page and feed it to the file input.
const photo = await page.evaluate(async () => {
  const c = new OffscreenCanvas(300, 400);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 300, 400);
  grad.addColorStop(0, '#ff0066'); grad.addColorStop(1, '#00ccff');
  g.fillStyle = grad; g.fillRect(0, 0, 300, 400);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(150, 170, 80, 0, 7); g.fill();
  const blob = await c.convertToBlob({ type: 'image/png' });
  return [...new Uint8Array(await blob.arrayBuffer())];
});
await page.setInputFiles('#pic-file', { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(photo) });
await page.waitForTimeout(300);
const box = await page.locator('#pic-canvas').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
await page.mouse.up();
await shot('picture');
await page.click('#pic-send');
await waitShowing('Showing slot 1');

// Scrolling text.
await page.click('[data-tab=text]');
await page.fill('#text-input', 'HELLO Hello mask!');
await page.check('#text-rainbow');
await page.waitForTimeout(100);
await shot('text-scroll');
await page.click('#text-send');
await waitShowing('Showing text');

// Still text.
await page.check('input[name=text-kind][value=still]');
await page.fill('#text-input', 'BOO! happy halloween');
await shot('text-still');
await page.click('#still-send');
await waitShowing('Showing slot 2');

// Faces: pick one, send it, then open another in Draw and add to it.
await page.click('[data-tab=faces]');
await page.click('.face:nth-child(2)');
await shot('faces');
await page.click('#face-send');
await waitShowing('Showing slot 4');
await page.click('.face:nth-child(12)');
await page.click('#face-edit');
const pad = await page.locator('#draw-canvas').boundingBox();
await page.click('.swatch:nth-child(5)');
await page.mouse.move(pad.x + 30, pad.y + pad.height - 40);
await page.mouse.down();
await page.mouse.move(pad.x + pad.width - 30, pad.y + pad.height - 60, { steps: 10 });
await page.mouse.up();
await shot('draw');
await page.click('#draw-send');
await waitShowing('Showing slot 3');

// Animated face and hypno eyes.
await page.click('[data-tab=faces]');
await page.selectOption('#face-anim', 'blink');
await page.fill('#face-slot', '10');
await page.click('#face-send');
await waitShowing('Playing slots 10-11');
await page.click('[data-tab=hypno]');
await page.selectOption('#hypno-pattern', 'rainbow');
await page.selectOption('#hypno-mouth', 'grin');
await page.waitForTimeout(1100);
await shot('hypno');
await page.click('#hypno-send');
await waitShowing('Playing slots 20-25');

// Test pattern.
await page.click('[data-tab=test]');
await page.selectOption('#pattern', 'corners');
await shot('test');
await page.click('#pattern-send');
await waitShowing('Showing slot 34');

// Every ready-made face must stay off the eye holes and inside the oval.
const faceProblems = await page.evaluate(async () => {
  const v = document.querySelector('script[type=module]').src.split('?')[1];
  const { FACES, drawFace } = await import(`/js/faces.js?${v}`);
  const { hasLed } = await import(`/js/shape.js?${v}`);
  const problems = [];
  const c = document.createElement('canvas');
  for (const face of FACES) {
    drawFace(c, face, { w: 46, h: 58 });
    const d = c.getContext('2d').getImageData(0, 0, 46, 58).data;
    let off = 0;
    for (let y = 0; y < 58; y++) for (let x = 0; x < 46; x++) {
      const i = (y * 46 + x) * 4;
      if ((d[i] || d[i + 1] || d[i + 2]) && !hasLed(x, y, 46, 58)) off++;
    }
    if (off) problems.push(`${face.name}: ${off} pixels off the panel`);
  }
  return problems;
});
errors.push(...faceProblems);

const state = await page.evaluate(() => window.__fakeMask);
console.log(JSON.stringify({ state, errors, log: await page.textContent('#log') }, null, 1));
await browser.close();
const expected = ['DATS,DATCP,PLAY,DATS,DATCP,FC,BC,SPEED,MODE,DATS,DATCP,PLAY,DATS,DATCP,PLAY,DATS,DATCP,PLAY',
  'DATS,DATCP,'.repeat(2) + 'PLAY', 'DATS,DATCP,'.repeat(6) + 'PLAY', 'DATS,DATCP,PLAY'].join();
if (errors.length || state.commands.join() !== expected) process.exit(1);
