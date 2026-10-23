// Web Bluetooth connection to a Shining Mask.

import {
  SERVICE, CMD_CHAR, NOTIFY_CHAR, UPLOAD_CHAR,
  commands, encrypt, decrypt, splitIntoPackets, replyName, toHex,
} from './protocol.js?v=20261023183425';

const REPLY_TIMEOUT_MS = 5000;

export class Mask {
  /** @param {(kind: string, text: string) => void} log */
  constructor(log = () => {}) {
    this.log = log;
    this.device = null;
    this.cmdChar = null;
    this.uploadChar = null;
    this.waiters = [];
    this.uploading = false;
    this.onDisconnect = () => {};
  }

  get connected() {
    return !!this.device?.gatt?.connected;
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('This browser has no Web Bluetooth. Use Chrome on Android or Windows.');
    }
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }, { namePrefix: 'MASK' }],
      optionalServices: [SERVICE],
    });
    this.device.addEventListener('gattserverdisconnected', () => {
      this.log('info', 'Mask disconnected');
      this.rejectWaiters(new Error('Mask disconnected'));
      this.onDisconnect();
    });
    this.log('info', `Connecting to ${this.device.name || 'mask'}...`);
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE);
    this.cmdChar = await service.getCharacteristic(CMD_CHAR);
    this.uploadChar = await service.getCharacteristic(UPLOAD_CHAR);
    const notifyChar = await service.getCharacteristic(NOTIFY_CHAR);
    notifyChar.addEventListener('characteristicvaluechanged', (e) => this.handleReply(e.target.value));
    await notifyChar.startNotifications();
    this.log('info', `Connected to ${this.device.name || 'mask'}`);
    await this.logModel();
    return this.device.name;
  }

  disconnect() {
    if (this.connected) this.device.gatt.disconnect();
  }

  /** The command characteristic's description holds the hardware model, such as TR2111R004-01. */
  async logModel() {
    try {
      const desc = await this.cmdChar.getDescriptor(0x2901);
      const text = new TextDecoder().decode(await desc.readValue()).replace(/\0/g, '').trim();
      if (text) this.log('info', `Hardware model: ${text}`);
    } catch {
      // Not every revision exposes it, and it is only informational.
    }
  }

  handleReply(view) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let name = '?';
    if (bytes.length === 16) {
      const plain = decrypt(bytes);
      name = replyName(plain);
      // One REOK arrives per upload packet, which would flood the log.
      if (!name.startsWith('REOK')) this.log('in', `${name || '(unknown)'}  [${toHex(plain)}]`);
    } else {
      this.log('in', `raw [${toHex(bytes)}]`);
    }
    const i = this.waiters.findIndex((w) => name.startsWith(w.prefix));
    if (i >= 0) {
      const [w] = this.waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(name);
    }
  }

  waitForReply(prefix) {
    return new Promise((resolve, reject) => {
      const w = { prefix, resolve, reject };
      w.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new Error(`No ${prefix} reply from the mask within ${REPLY_TIMEOUT_MS / 1000}s`));
      }, REPLY_TIMEOUT_MS);
      this.waiters.push(w);
    });
  }

  rejectWaiters(err) {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.reject(err);
    }
    this.waiters = [];
  }

  async write(char, bytes) {
    if (char.properties.writeWithoutResponse) await char.writeValueWithoutResponse(bytes);
    else await char.writeValueWithResponse(bytes);
  }

  /** Encrypt and send a plaintext command block. */
  async send(block, label = '', duringUpload = false) {
    if (!this.connected) throw new Error('Not connected');
    if (this.uploading && !duringUpload) throw new Error('Wait for the upload to finish first');
    this.log('out', `${label}  [${toHex(block)}]`);
    await this.write(this.cmdChar, encrypt(block));
  }

  async sendAndWait(block, label, replyPrefix, duringUpload = false) {
    const reply = this.waitForReply(replyPrefix);
    await this.send(block, label, duringUpload);
    return reply;
  }

  setBrightness(level) {
    return this.send(commands.light(level), `LIGHT ${level}`);
  }

  showBuiltInImage(n) {
    return this.send(commands.image(n), `IMAG ${n}`);
  }

  showBuiltInAnimation(n) {
    return this.send(commands.animation(n), `ANIM ${n}`);
  }

  /** Set how uploaded text is shown. Colours are [r, g, b]; a null colour turns that override off. */
  async setTextStyle({ mode, speed, colour, background }) {
    await this.send(commands.textColour(!!colour, colour || [255, 255, 255]), `FC ${colour || 'off'}`);
    await this.send(commands.textBackground(!!background, background || [0, 0, 0]), `BC ${background || 'off'}`);
    await this.send(commands.textSpeed(speed), `SPEED ${speed}`);
    await this.send(commands.textMode(mode), `MODE ${mode}`);
  }

  play(slots) {
    return this.send(commands.play(slots), `PLAY ${slots.join(',')}`);
  }

  /**
   * Upload encoded image bytes into a slot. The mask shows its own download
   * animation while this runs, and any other command sent meanwhile corrupts
   * the stored image, so nothing else may be sent until it finishes.
   */
  uploadImage(data, slot, onProgress) {
    return this.upload(commands.startUpload(data.length, slot), `DATS ${data.length} bytes, slot ${slot}`, data, onProgress);
  }

  /**
   * Upload animation frames into consecutive slots starting at `baseSlot`,
   * then loop them on the mask in `order` (indexes into frames, at most 10).
   */
  async uploadAnimation(frames, order, baseSlot, onProgress = () => {}) {
    if (order.length > 10) throw new Error('The mask can only loop up to 10 frames');
    if (baseSlot + frames.length - 1 > 34) {
      throw new Error(`This needs ${frames.length} slots, so start at slot ${35 - frames.length} or lower`);
    }
    for (let i = 0; i < frames.length; i++) {
      await this.uploadImage(frames[i], baseSlot + i, (p) => onProgress((i + p) / frames.length, i));
    }
    await this.play(order.map((i) => baseSlot + i));
  }

  /** Upload a text bitmap and its colour array for the mask's own text mode. */
  uploadText(bitmap, colours, onProgress) {
    const data = new Uint8Array(bitmap.length + colours.length);
    data.set(bitmap);
    data.set(colours, bitmap.length);
    const label = `DATS text, ${bitmap.length / 2} columns`;
    return this.upload(commands.startTextUpload(data.length, bitmap.length), label, data, onProgress);
  }

  async upload(startBlock, label, data, onProgress = () => {}) {
    if (this.uploading) throw new Error('An upload is already running');
    this.uploading = true;
    try {
      await this.sendAndWait(startBlock, label, 'DATSOK', true);
      const packets = splitIntoPackets(data);
      for (let i = 0; i < packets.length; i++) {
        // The mask drops packets unless each one is acknowledged before the next.
        const ack = this.waitForReply('REOK');
        await this.write(this.uploadChar, packets[i]);
        await ack;
        onProgress((i + 1) / packets.length);
      }
      this.log('out', `Sent ${packets.length} packets`);
      const now = Math.floor(Date.now() / 1000);
      await this.sendAndWait(commands.finishUpload(now), 'DATCP', 'DATCPOK', true);
    } finally {
      this.uploading = false;
    }
  }
}
