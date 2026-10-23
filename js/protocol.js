// Shining Mask Bluetooth protocol. Pure functions only, so they can be tested in Node.
//
// Sources: community reverse engineering (GoneUp/mask-go, BrickCraftDream's notes,
// Bishop Fox, levavakian/mask), which agree on the following:
//
// - Commands are written to CMD_CHAR as one 16-byte block encrypted with
//   AES-128-ECB and a fixed key. Plaintext layout: [length, ASCII name, args, zero padding],
//   where length counts the name and args.
// - The mask replies on NOTIFY_CHAR with 16-byte blocks encrypted the same way.
// - Image bytes go to UPLOAD_CHAR unencrypted in 100-byte packets:
//   [chunk length + 1, packet index, up to 98 data bytes, zero padding].

import { Aes128 } from './aes.js?v=20261023182506';

export const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
export const CMD_CHAR = 'd44bc439-abfd-45a2-b575-925416129600';
export const NOTIFY_CHAR = 'd44bc439-abfd-45a2-b575-925416129601';
export const UPLOAD_CHAR = 'd44bc439-abfd-45a2-b575-92541612960a';

export const KEY = hexToBytes('32672f7974ad43451d9c6c894a0e8764');

// Reported for hardware TR2111R004-01. Other hardware revisions may differ,
// which is why the test page lets you change it.
export const DEFAULT_WIDTH = 46;
export const DEFAULT_HEIGHT = 58;
export const SLOT_COUNT = 34;

const PACKET_SIZE = 100;
const PACKET_DATA = 98;

const cipher = new Aes128(KEY);

export function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

/** Build the plaintext 16-byte block for a command. */
export function buildCommand(name, args = []) {
  const body = [...new TextEncoder().encode(name), ...args];
  if (body.length > 15) throw new Error(`Command ${name} is too long`);
  const block = new Uint8Array(16);
  block[0] = body.length;
  block.set(body, 1);
  return block;
}

export const encrypt = (block) => cipher.encryptBlock(block);
export const decrypt = (block) => cipher.decryptBlock(block);

const byte = (v) => Math.max(0, Math.min(255, Math.round(v)));
const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

export const commands = {
  /** Brightness, 0 to 255. */
  light: (level) => buildCommand('LIGHT', [byte(level)]),
  /** Show one of the mask's built-in images. */
  image: (n) => buildCommand('IMAG', [byte(n)]),
  /** Show one of the mask's built-in animations. */
  animation: (n) => buildCommand('ANIM', [byte(n)]),
  /** Show uploaded slots, cycling through them if there is more than one (up to 10). */
  play: (slots) => buildCommand('PLAY', [slots.length, ...slots]),
  /** Start uploading `size` bytes of image data into `slot`. */
  startUpload: (size, slot) => buildCommand('DATS', [...u16(size), ...u16(slot), 1]),
  /** Start uploading scrolling text: a 16-pixel-high bitmap followed by its colour array. */
  startTextUpload: (totalSize, bitmapSize) => buildCommand('DATS', [...u16(totalSize), ...u16(bitmapSize), 0]),
  /** Text animation: 1 steady, 2 blink, 3 scroll right to left, 4 scroll left to right. */
  textMode: (mode) => buildCommand('MODE', [byte(mode)]),
  textSpeed: (speed) => buildCommand('SPEED', [byte(speed)]),
  /** Text colour for the whole text. When disabled, the per-column colour array is used. */
  textColour: (enabled, [r, g, b]) => buildCommand('FC', [enabled ? 1 : 0, byte(r), byte(g), byte(b)]),
  textBackground: (enabled, [r, g, b]) => buildCommand('BC', [enabled ? 1 : 0, byte(r), byte(g), byte(b)]),
  /** Finish an upload. The official app sends the current Unix time. */
  finishUpload: (unixSeconds) => buildCommand('DATCP', u32(unixSeconds)),
};

/**
 * Convert canvas RGBA pixels (row by row) into the mask's image format:
 * column by column, top to bottom, 3 bytes of RGB per LED.
 */
export function encodeImage(rgba, width, height) {
  const out = new Uint8Array(width * height * 3);
  let o = 0;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      out[o++] = rgba[i];
      out[o++] = rgba[i + 1];
      out[o++] = rgba[i + 2];
    }
  }
  return out;
}

export const TEXT_HEIGHT = 16;

/**
 * Encode a text bitmap for the mask's text mode. `isLit(x, y)` says whether the
 * pixel at column x, row y (0 = top, 15 = bottom) is on. Each column becomes two
 * bytes: rows 0-7 then rows 8-15, with the top row of each half in the high bit.
 */
export function encodeTextBitmap(width, isLit) {
  const out = new Uint8Array(width * 2);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < TEXT_HEIGHT; y++) {
      if (isLit(x, y)) out[x * 2 + (y >> 3)] |= 0x80 >> (y & 7);
    }
  }
  return out;
}

/** Colour array for text mode: 3 bytes of RGB per column. */
export function encodeTextColours(width, colourAt) {
  const out = new Uint8Array(width * 3);
  for (let x = 0; x < width; x++) out.set(colourAt(x).map(byte), x * 3);
  return out;
}

/** Split image bytes into upload packets. */
export function splitIntoPackets(data) {
  const packets = [];
  for (let offset = 0, index = 0; offset < data.length; offset += PACKET_DATA, index++) {
    const chunk = data.subarray(offset, offset + PACKET_DATA);
    const packet = new Uint8Array(PACKET_SIZE);
    packet[0] = chunk.length + 1;
    packet[1] = index & 0xff;
    packet.set(chunk, 2);
    packets.push(packet);
  }
  return packets;
}

/** Read the uppercase ASCII name out of a decrypted reply, such as "DATSOK" or "REOK". */
export function replyName(plain) {
  const len = Math.min(plain[0], 15);
  let name = '';
  for (let i = 1; i <= len; i++) {
    const c = plain[i];
    if (c < 0x41 || c > 0x5a) break;
    name += String.fromCharCode(c);
  }
  return name;
}
