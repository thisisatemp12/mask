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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(fakeMask);
await page.goto('http://localhost:8000/');
await page.click('#connect');
await page.waitForSelector('#status.ok');
await page.selectOption('#pattern', 'corners');
await page.click('#upload');
await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Showing'), null, { timeout: 15000 });
const state = await page.evaluate(() => window.__fakeMask);
await page.screenshot({ path: process.argv[2] || 'smoke.png', fullPage: true });
console.log(JSON.stringify({ state, errors, log: await page.textContent('#log') }, null, 1));
await browser.close();
if (errors.length || state.packets !== 82 || state.commands.join() !== 'DATS,DATCP,PLAY') process.exit(1);
