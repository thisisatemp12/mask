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
await page.fill('#text-input', 'Hello mask!');
await page.check('#text-rainbow');
await shot('text-scroll');
await page.click('#text-send');
await waitShowing('Showing text');

// Still text.
await page.check('input[name=text-kind][value=still]');
await page.fill('#text-input', 'BOO! happy halloween');
await shot('text-still');
await page.click('#still-send');
await waitShowing('Showing slot 2');

// Test pattern.
await page.click('[data-tab=test]');
await page.selectOption('#pattern', 'corners');
await shot('test');
await page.click('#pattern-send');
await waitShowing('Showing slot 34');

const state = await page.evaluate(() => window.__fakeMask);
console.log(JSON.stringify({ state, errors, log: await page.textContent('#log') }, null, 1));
await browser.close();
const expected = 'DATS,DATCP,PLAY,DATS,DATCP,FC,BC,SPEED,MODE,DATS,DATCP,PLAY,DATS,DATCP,PLAY';
if (errors.length || state.commands.join() !== expected) process.exit(1);
