import { Mask } from './mask.js?v=20261023182506';
import { encodeImage, DEFAULT_WIDTH, DEFAULT_HEIGHT } from './protocol.js?v=20261023182506';
import { PictureEditor, loadImageFile } from './picture.js?v=20261023182506';
import { renderScrollingText, rainbow, drawStillText } from './text.js?v=20261023182506';
import { DrawingPad } from './drawing.js?v=20261023182506';
import { HYPNO_MOUTHS, PATTERNS, drawHypno, hypnoFrames } from './hypno.js?v=20261023182506';
import { FACES, FACE_ANIMATIONS, drawFace, EYE_TOP_MIN, EYE_TOP_MAX, EYE_TOP_DEFAULT } from './faces.js?v=20261023182506';
import { drawShapeGuide } from './shape.js?v=20261023182506';

const $ = (id) => document.getElementById(id);

// --- Log ---

const logEl = $('log');
function log(kind, text) {
  const time = new Date().toLocaleTimeString();
  const arrow = { out: '→', in: '←', error: '✖' }[kind] || '•';
  logEl.textContent += `${time} ${arrow} ${text}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

$('copy-log').addEventListener('click', () => run(async () => {
  await navigator.clipboard.writeText(logEl.textContent);
  setStatus('Log copied');
}));
$('clear-log').addEventListener('click', () => { logEl.textContent = ''; });

// --- Status and errors ---

const mask = new Mask(log);

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').className = `status ${kind}`;
}

const isBrave = !!navigator.brave;
const BRAVE_HELP = 'Brave turns Bluetooth off for web pages. Open this page in Chrome instead, or enable brave://flags/#brave-web-bluetooth-api and restart Brave.';

/** Turn the browser's terse Bluetooth errors into something actionable. */
function explain(err) {
  const msg = err.message || String(err);
  if (/globally disabled/i.test(msg)) {
    return isBrave ? BRAVE_HELP : 'Bluetooth for web pages is turned off in this browser. Open this page in Chrome.';
  }
  if (err.name === 'NotFoundError' && /cancel/i.test(msg)) return 'No mask picked. Tap Connect again and choose the MASK device.';
  if (/adapter not available|bluetooth adapter/i.test(msg)) return 'Bluetooth looks switched off on this device. Turn it on and try again.';
  return msg;
}

/** Run an action, logging and showing any error instead of failing silently. */
async function run(action) {
  try {
    await action();
  } catch (err) {
    log('error', err.message || String(err));
    setStatus(explain(err), 'error');
  }
}

// --- Connection ---

// Brave only fails when connecting, and explain() covers that, so only warn
// up front when the browser has no Web Bluetooth at all.
if (!navigator.bluetooth) $('no-bt').hidden = false;

function setConnected(connected) {
  $('connect').hidden = connected;
  $('disconnect').hidden = !connected;
  for (const el of document.querySelectorAll('.needs-connection')) {
    el.classList.toggle('disabled', !connected);
    if (el.tagName === 'BUTTON') el.disabled = !connected;
  }
}
setConnected(false);

mask.onDisconnect = () => {
  setConnected(false);
  setStatus('Disconnected. Tap Connect to reconnect.');
};

$('connect').addEventListener('click', () => run(async () => {
  setStatus('Connecting...');
  const name = await mask.connect();
  setConnected(true);
  setStatus(`Connected to ${name || 'mask'}`, 'ok');
}));

$('disconnect').addEventListener('click', () => mask.disconnect());

$('brightness').addEventListener('input', (e) => { $('brightness-value').textContent = e.target.value; });
$('brightness').addEventListener('change', (e) => run(() => mask.setBrightness(Number(e.target.value))));

// --- Tabs ---

function showTab(name) {
  for (const t of document.querySelectorAll('[role=tab]')) {
    const selected = t.dataset.tab === name;
    t.setAttribute('aria-selected', selected);
    $(`tab-${t.dataset.tab}`).hidden = !selected;
  }
}
for (const tab of document.querySelectorAll('[role=tab]')) {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
}

// --- Shared helpers ---

function size() {
  return {
    w: Number($('width').value) || DEFAULT_WIDTH,
    h: Number($('height').value) || DEFAULT_HEIGHT,
  };
}

const slotFrom = (id) => Math.max(1, Math.min(34, Number($(id).value) || 1));

// Put an oval guide over each mask-sized preview.
const guides = [];
for (const canvas of document.querySelectorAll('canvas.mask-preview')) {
  const frame = document.createElement('div');
  frame.className = 'mask-frame';
  canvas.replaceWith(frame);
  const guide = document.createElement('canvas');
  guide.className = 'shape-guide';
  frame.append(canvas, guide);
  guides.push(guide);
}
function drawGuides() {
  const { w, h } = size();
  for (const g of guides) drawShapeGuide(g, w, h);
}

/** Upload a mask-sized canvas into a slot and show it. */
async function sendCanvas(canvas, slot) {
  const { w, h } = size();
  const pixels = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  await withProgress(`Uploading to slot ${slot}...`, (onProgress) => mask.uploadImage(encodeImage(pixels, w, h), slot, onProgress));
  await mask.play([slot]);
  setStatus(`Showing slot ${slot}`, 'ok');
}

function canvasData(canvas) {
  const { w, h } = size();
  return encodeImage(canvas.getContext('2d').getImageData(0, 0, w, h).data, w, h);
}

/** Upload animation frames (canvases) into slots from `baseSlot` and loop them in `order`. */
async function sendAnimation(canvases, order, baseSlot) {
  const frames = canvases.map(canvasData);
  const last = baseSlot + frames.length - 1;
  await withProgress(`Uploading ${frames.length} frames...`, (onProgress) => mask.uploadAnimation(frames, order, baseSlot, (p, i) => {
    onProgress(p);
    setStatus(`Uploading frame ${i + 1} of ${frames.length} (slots ${baseSlot}-${last})...`);
  }));
  setStatus(`Playing slots ${baseSlot}-${last}`, 'ok');
}

const slotRange = (base, count) => (count === 1 ? `slot ${base}` : `slots ${base}-${base + count - 1}`);

// One shared clock for animated previews, at the mask's own rate of about one frame a second.
let tick = 0;
const previewers = [];
setInterval(() => {
  tick++;
  for (const draw of previewers) draw();
}, 1000);

/** Run an upload with the shared progress bar, locking the send buttons meanwhile. */
async function withProgress(message, upload) {
  const buttons = [...document.querySelectorAll('button.needs-connection')];
  buttons.forEach((b) => { b.disabled = true; });
  $('progress').hidden = false;
  $('progress').value = 0;
  setStatus(message);
  const started = performance.now();
  try {
    await upload((p) => { $('progress').value = p; });
    log('info', `Upload finished in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    buttons.forEach((b) => { b.disabled = !mask.connected; });
    $('progress').hidden = true;
  }
}

// --- Picture ---

const editor = new PictureEditor($('pic-canvas'), size);

$('pic-file').addEventListener('change', (e) => run(async () => {
  const file = e.target.files[0];
  if (!file) return;
  editor.setImage(await loadImageFile(file));
  $('pic-zoom').value = 1;
  $('pic-hint').textContent = 'Drag on the preview to move the photo. The dimmed area has no LEDs.';
}));

$('pic-fit').addEventListener('change', (e) => { editor.fit = e.target.value; editor.draw(); });
$('pic-zoom').addEventListener('input', (e) => { editor.zoom = Number(e.target.value); editor.draw(); });
$('pic-background').addEventListener('input', (e) => { editor.background = e.target.value; editor.draw(); });
for (const key of ['brightness', 'contrast', 'saturation']) {
  $(`pic-${key}`).addEventListener('input', (e) => { editor.adjust[key] = Number(e.target.value); editor.draw(); });
}

$('pic-reset').addEventListener('click', () => {
  editor.zoom = 1;
  editor.panX = 0;
  editor.panY = 0;
  editor.adjust = { brightness: 100, contrast: 100, saturation: 100 };
  $('pic-zoom').value = 1;
  for (const key of ['brightness', 'contrast', 'saturation']) $(`pic-${key}`).value = 100;
  editor.draw();
});

$('pic-send').addEventListener('click', () => run(async () => {
  if (!editor.image) throw new Error('Choose a photo first');
  await sendCanvas($('pic-canvas'), slotFrom('pic-slot'));
}));

// --- Text ---

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const textKind = () => document.querySelector('input[name=text-kind]:checked').value;
let scrollText = null;

function drawText() {
  const kind = textKind();
  $('text-scroll-opts').hidden = kind !== 'scroll';
  $('text-still-opts').hidden = kind !== 'still';
  const text = $('text-input').value;

  if (kind === 'scroll') {
    const colour = hexToRgb($('text-colour').value);
    const rainbowOn = $('text-rainbow').checked;
    scrollText = renderScrollingText(text || ' ', rainbowOn ? rainbow : () => colour);
    const strip = $('text-strip');
    strip.width = scrollText.width;
    strip.height = scrollText.canvas.height;
    const ctx = strip.getContext('2d');
    ctx.fillStyle = $('text-bg-on').checked ? $('text-bg').value : '#000';
    ctx.fillRect(0, 0, strip.width, strip.height);
    ctx.drawImage(scrollText.canvas, 0, 0);
    strip.style.width = `${scrollText.width * 4}px`;
    $('text-truncated').hidden = !scrollText.truncated;
  } else {
    const { w, h } = size();
    drawStillText($('text-canvas'), text, {
      w, h, colour: $('still-colour').value, background: $('still-bg').value,
    });
  }
}

for (const id of ['text-input', 'text-colour', 'text-rainbow', 'text-bg-on', 'text-bg', 'still-colour', 'still-bg']) {
  $(id).addEventListener('input', drawText);
}
for (const radio of document.querySelectorAll('input[name=text-kind]')) radio.addEventListener('change', drawText);

function textStyle() {
  return {
    mode: Number($('text-mode').value),
    speed: Number($('text-speed').value),
    // With rainbow on, leave the colour override off so the per-column colours show.
    colour: $('text-rainbow').checked ? null : hexToRgb($('text-colour').value),
    background: $('text-bg-on').checked ? hexToRgb($('text-bg').value) : null,
  };
}

$('text-send').addEventListener('click', () => run(async () => {
  if (!$('text-input').value.trim()) throw new Error('Type some text first');
  drawText();
  await withProgress('Uploading text...', (onProgress) => mask.uploadText(scrollText.bitmap, scrollText.colours, onProgress));
  await mask.setTextStyle(textStyle());
  setStatus('Showing text', 'ok');
}));

$('text-style').addEventListener('click', () => run(async () => {
  await mask.setTextStyle(textStyle());
  setStatus('Text style updated', 'ok');
}));

$('still-send').addEventListener('click', () => run(async () => {
  if (!$('text-input').value.trim()) throw new Error('Type some text first');
  drawText();
  await sendCanvas($('text-canvas'), slotFrom('still-slot'));
}));

// --- Draw ---

const pad = new DrawingPad($('draw-canvas'), size);
const PALETTE = ['#ffffff', '#ff2a2a', '#ff8a00', '#ffd400', '#39ff6a', '#3cf2ff', '#4f7bff', '#ff3cf0'];

function setDrawColour(colour) {
  pad.colour = colour;
  $('draw-colour').value = colour;
  for (const b of document.querySelectorAll('.swatch')) b.setAttribute('aria-pressed', b.dataset.colour === colour);
}
for (const colour of PALETTE) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.background = colour;
  b.dataset.colour = colour;
  b.setAttribute('aria-label', colour);
  b.addEventListener('click', () => setDrawColour(colour));
  $('draw-colour').before(b);
}
$('draw-colour').addEventListener('input', (e) => setDrawColour(e.target.value));
setDrawColour('#ffffff');

for (const radio of document.querySelectorAll('input[name=draw-tool]')) {
  radio.addEventListener('change', () => { pad.tool = radio.value; });
}
$('draw-size').addEventListener('change', (e) => { pad.brush = Number(e.target.value); });
$('draw-undo').addEventListener('click', () => pad.undo());
$('draw-clear').addEventListener('click', () => pad.clear());
$('draw-from-picture').addEventListener('click', () => pad.copyFrom($('pic-canvas')));
$('draw-send').addEventListener('click', () => run(() => sendCanvas($('draw-canvas'), slotFrom('draw-slot'))));

// --- Faces ---

let selectedFace = FACES[0];
const faceCanvas = $('face-canvas');
const thumbs = [];
// The slider's value is the eye band's top row on a 58-row mask.
const eyeTop = () => Number($('face-eyes').value);

for (const [key, anim] of Object.entries(FACE_ANIMATIONS)) {
  $('face-anim').append(new Option(anim.name, key));
}

/** The selected animation as frame variants plus play order (a still face is one frame). */
function faceAnimation() {
  const key = $('face-anim').value;
  return key ? FACE_ANIMATIONS[key].build(selectedFace) : { frames: [{}], order: [0] };
}

function drawFacePreview() {
  const { frames, order } = faceAnimation();
  drawFace(faceCanvas, selectedFace, size(), eyeTop(), frames[order[tick % order.length]]);
}
previewers.push(drawFacePreview);

function updateFaceHint() {
  const { frames } = faceAnimation();
  $('face-slot-hint').hidden = frames.length === 1;
  $('face-slot-hint').textContent = `This animation has ${frames.length} frames, so it uses ${slotRange(slotFrom('face-slot'), frames.length)}.`;
}

function drawFaces() {
  drawFacePreview();
  updateFaceHint();
  for (const { thumb, face } of thumbs) {
    drawFace(thumb, face, { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT }, eyeTop());
    const guide = document.createElement('canvas');
    drawShapeGuide(guide, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    thumb.getContext('2d').drawImage(guide, 0, 0);
  }
}

for (const face of FACES) {
  const b = document.createElement('button');
  b.className = 'face';
  const thumb = document.createElement('canvas');
  thumbs.push({ thumb, face });
  b.append(thumb, face.name);
  b.setAttribute('aria-pressed', face === selectedFace);
  b.addEventListener('click', () => {
    selectedFace = face;
    for (const other of document.querySelectorAll('.face')) other.setAttribute('aria-pressed', other === b);
    drawFacePreview();
    updateFaceHint();
  });
  $('face-grid').append(b);
}

$('face-eyes').min = EYE_TOP_MIN;
$('face-eyes').max = EYE_TOP_MAX;
$('face-eyes').value = EYE_TOP_DEFAULT;
$('face-eyes').addEventListener('input', drawFaces);
$('face-eyes-above').addEventListener('click', () => { $('face-eyes').value = 6; drawFaces(); });
$('face-eyes-below').addEventListener('click', () => { $('face-eyes').value = EYE_TOP_DEFAULT; drawFaces(); });
$('face-anim').addEventListener('change', () => { drawFacePreview(); updateFaceHint(); });
$('face-slot').addEventListener('input', updateFaceHint);

$('face-send').addEventListener('click', () => run(async () => {
  const { frames, order } = faceAnimation();
  const canvases = frames.map((variant) => {
    const c = document.createElement('canvas');
    drawFace(c, selectedFace, size(), eyeTop(), variant);
    return c;
  });
  if (canvases.length === 1) await sendCanvas(canvases[0], slotFrom('face-slot'));
  else await sendAnimation(canvases, order, slotFrom('face-slot'));
}));

$('face-edit').addEventListener('click', () => {
  drawFace(faceCanvas, selectedFace, size(), eyeTop());
  pad.copyFrom(faceCanvas);
  showTab('draw');
});

// --- Hypno ---

for (const [key, p] of Object.entries(PATTERNS)) $('hypno-pattern').append(new Option(p.name, key));
for (const [key, name] of Object.entries(HYPNO_MOUTHS)) $('hypno-mouth').append(new Option(name, key));

function hypnoOptions(phase) {
  return {
    pattern: $('hypno-pattern').value,
    colour: $('hypno-colour').value,
    mouth: $('hypno-mouth').value,
    counter: $('hypno-counter').checked,
    radius: Number($('hypno-size').value),
    eyeCentre: Number($('hypno-height').value),
    phase,
  };
}

const hypnoFrameCount = () => Number($('hypno-frames').value);

function drawHypnoPreview() {
  const phases = hypnoFrames(hypnoFrameCount());
  drawHypno($('hypno-canvas'), size(), hypnoOptions(phases[tick % phases.length]));
  $('hypno-slot-hint').textContent = `${phases.length} frames, using ${slotRange(slotFrom('hypno-slot'), phases.length)}.`;
}
previewers.push(drawHypnoPreview);

for (const id of ['hypno-pattern', 'hypno-colour', 'hypno-mouth', 'hypno-counter', 'hypno-size', 'hypno-height', 'hypno-frames', 'hypno-slot']) {
  $(id).addEventListener('input', drawHypnoPreview);
}

$('hypno-send').addEventListener('click', () => run(async () => {
  const phases = hypnoFrames(hypnoFrameCount());
  const canvases = phases.map((phase) => {
    const c = document.createElement('canvas');
    drawHypno(c, size(), hypnoOptions(phase));
    return c;
  });
  await sendAnimation(canvases, phases.map((_, i) => i), slotFrom('hypno-slot'));
}));

// --- Test ---

$('show-slot-btn').addEventListener('click', () => run(async () => {
  const slot = slotFrom('show-slot');
  await mask.play([slot]);
  setStatus(`Showing slot ${slot}`, 'ok');
}));

const builtinNumber = () => Number($('builtin-number').value) || 1;
$('builtin-image').addEventListener('click', () => run(() => mask.showBuiltInImage(builtinNumber())));
$('builtin-anim').addEventListener('click', () => run(() => mask.showBuiltInAnimation(builtinNumber())));

function drawPattern() {
  const { w, h } = size();
  const canvas = $('pattern-canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const pattern = $('pattern').value;
  $('colour').hidden = pattern !== 'solid';

  if (pattern === 'split') {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, Math.floor(w / 2), h);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(Math.floor(w / 2), 0, w - Math.floor(w / 2), h);
  } else if (pattern === 'corners') {
    // Markers placed inside the oval: red upper left, green upper right,
    // blue lower left. White lines across the middle show the side edges.
    const s = 6;
    const left = Math.round(w * 0.22);
    const right = w - left - s;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(left, Math.round(h * 0.2), s, s);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(right, Math.round(h * 0.2), s, s);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(left + 2, Math.round(h * 0.68), s, s);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, Math.floor(h * 0.42), w, 1);
    ctx.fillRect(Math.floor(w / 2), 0, 1, h);
  } else if (pattern === 'solid') {
    ctx.fillStyle = $('colour').value;
    ctx.fillRect(0, 0, w, h);
  }
}

for (const id of ['pattern', 'colour']) $(id).addEventListener('input', drawPattern);
for (const id of ['width', 'height']) {
  $(id).addEventListener('input', () => { drawGuides(); editor.draw(); pad.resize(); drawText(); drawPattern(); drawFaces(); drawHypnoPreview(); });
}

$('pattern-send').addEventListener('click', () => run(() => sendCanvas($('pattern-canvas'), slotFrom('pattern-slot'))));

// --- Start ---

drawGuides();
editor.draw();
drawText();
drawPattern();
drawFaces();
drawHypnoPreview();
log('info', `Ready. Web Bluetooth ${navigator.bluetooth ? 'available' : 'NOT available'}.`);
