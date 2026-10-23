import { Mask } from './mask.js';
import { encodeImage, DEFAULT_WIDTH, DEFAULT_HEIGHT } from './protocol.js';

const $ = (id) => document.getElementById(id);

const logEl = $('log');
function log(kind, text) {
  const time = new Date().toLocaleTimeString();
  const arrow = { out: '→', in: '←', error: '✖' }[kind] || '•';
  logEl.textContent += `${time} ${arrow} ${text}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

const mask = new Mask(log);

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').className = `status ${kind}`;
}

function setConnected(connected) {
  $('connect').disabled = connected;
  $('disconnect').disabled = !connected;
  for (const el of document.querySelectorAll('.needs-connection')) {
    el.classList.toggle('disabled', !connected);
  }
}

/** Run an action, logging and showing any error instead of failing silently. */
async function run(action) {
  try {
    await action();
  } catch (err) {
    log('error', err.message || String(err));
    setStatus(err.message || String(err), 'error');
  }
}

// --- Connection ---

if (!navigator.bluetooth) $('no-bt').hidden = false;
setConnected(false);

mask.onDisconnect = () => {
  setConnected(false);
  setStatus('Disconnected');
};

$('connect').addEventListener('click', () => run(async () => {
  setStatus('Connecting...');
  const name = await mask.connect();
  setConnected(true);
  setStatus(`Connected to ${name || 'mask'}`, 'ok');
}));

$('disconnect').addEventListener('click', () => mask.disconnect());

// --- Brightness ---

$('brightness').addEventListener('input', (e) => { $('brightness-value').textContent = e.target.value; });
$('brightness').addEventListener('change', (e) => run(() => mask.setBrightness(Number(e.target.value))));

// --- Built-in pictures ---

const builtinNumber = () => Number($('builtin-number').value) || 1;
$('builtin-image').addEventListener('click', () => run(() => mask.showBuiltInImage(builtinNumber())));
$('builtin-anim').addEventListener('click', () => run(() => mask.showBuiltInAnimation(builtinNumber())));

// --- Test image ---

const preview = $('preview');
let photo = null;

function size() {
  return {
    w: Number($('width').value) || DEFAULT_WIDTH,
    h: Number($('height').value) || DEFAULT_HEIGHT,
  };
}

function drawPattern() {
  const { w, h } = size();
  preview.width = w;
  preview.height = h;
  const ctx = preview.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const pattern = $('pattern').value;
  $('colour').hidden = pattern !== 'solid';
  $('photo').hidden = pattern !== 'photo';

  if (pattern === 'split') {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, Math.floor(w / 2), h);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(Math.floor(w / 2), 0, w - Math.floor(w / 2), h);
  } else if (pattern === 'corners') {
    // White border to show whether the edges fit, plus coloured corners to
    // show orientation: red top left, green top right, blue bottom left.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    const s = 6;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(1, 1, s, s);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(w - 1 - s, 1, s, s);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(1, h - 1 - s, s, s);
  } else if (pattern === 'solid') {
    ctx.fillStyle = $('colour').value;
    ctx.fillRect(0, 0, w, h);
  } else if (pattern === 'photo' && photo) {
    // Crop to fill the whole mask, keeping the centre of the photo.
    const scale = Math.max(w / photo.width, h / photo.height);
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
}

for (const id of ['pattern', 'colour', 'width', 'height']) {
  $(id).addEventListener('input', drawPattern);
}

$('photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  photo = await createImageBitmap(file);
  drawPattern();
});

$('upload').addEventListener('click', () => run(async () => {
  const { w, h } = size();
  const slot = Math.max(1, Math.min(34, Number($('slot').value) || 1));
  const pixels = preview.getContext('2d').getImageData(0, 0, w, h).data;
  const data = encodeImage(pixels, w, h);

  $('upload').disabled = true;
  $('progress').hidden = false;
  $('progress').value = 0;
  setStatus(`Uploading to slot ${slot}...`);
  const started = performance.now();
  try {
    await mask.uploadImage(data, slot, (p) => { $('progress').value = p; });
    await mask.play([slot]);
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    log('info', `Upload finished in ${secs}s`);
    setStatus(`Showing slot ${slot}`, 'ok');
  } finally {
    $('upload').disabled = false;
    $('progress').hidden = true;
  }
}));

// --- Log ---

$('copy-log').addEventListener('click', () => run(async () => {
  await navigator.clipboard.writeText(logEl.textContent);
  setStatus('Log copied');
}));
$('clear-log').addEventListener('click', () => { logEl.textContent = ''; });

drawPattern();
log('info', `Ready. Web Bluetooth ${navigator.bluetooth ? 'available' : 'NOT available'}.`);
