import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { Aes128 } from '../js/aes.js';
import {
  KEY, hexToBytes, buildCommand, commands, encrypt, decrypt,
  encodeImage, splitIntoPackets, replyName, encodeTextBitmap,
} from '../js/protocol.js';

const nodeEcb = (key, block) => {
  const c = createCipheriv('aes-128-ecb', key, null);
  c.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([c.update(block), c.final()]));
};

test('AES matches the FIPS-197 example', () => {
  const aes = new Aes128(hexToBytes('000102030405060708090a0b0c0d0e0f'));
  const plain = hexToBytes('00112233445566778899aabbccddeeff');
  const expected = hexToBytes('69c4e0d86a7b0430d8cdb78070b4c55a');
  assert.deepEqual(aes.encryptBlock(plain), expected);
  assert.deepEqual(aes.decryptBlock(expected), plain);
});

test('AES matches Node crypto on random blocks with the mask key', () => {
  for (let i = 0; i < 200; i++) {
    const block = new Uint8Array(randomBytes(16));
    const ours = encrypt(block);
    assert.deepEqual(ours, nodeEcb(KEY, block));
    assert.deepEqual(decrypt(ours), block);
  }
});

test('command blocks are length-prefixed and zero padded', () => {
  assert.deepEqual(
    commands.light(200),
    Uint8Array.from([6, ...Buffer.from('LIGHT'), 200, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  );
  assert.deepEqual(
    commands.startUpload(8004, 3).slice(0, 10),
    Uint8Array.from([9, ...Buffer.from('DATS'), 0x1f, 0x44, 0, 3, 1]),
  );
  assert.deepEqual(commands.play([1, 2]).slice(0, 8), Uint8Array.from([7, ...Buffer.from('PLAY'), 2, 1, 2]));
  assert.deepEqual(commands.finishUpload(0x01020304).slice(0, 10), Uint8Array.from([9, ...Buffer.from('DATCP'), 1, 2, 3, 4]));
  assert.throws(() => buildCommand('X'.repeat(16)));
});

test('images are encoded column by column', () => {
  // 2x2 RGBA: (0,0)=1 (1,0)=2 (0,1)=3 (1,1)=4, using the red channel as a marker.
  const rgba = Uint8Array.from([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255]);
  assert.deepEqual(encodeImage(rgba, 2, 2), Uint8Array.from([1, 0, 0, 3, 0, 0, 2, 0, 0, 4, 0, 0]));
});

test('a full frame splits into 100-byte packets', () => {
  const data = new Uint8Array(46 * 58 * 3).map((_, i) => i & 0xff);
  const packets = splitIntoPackets(data);
  assert.equal(packets.length, Math.ceil(8004 / 98));
  assert.ok(packets.every((p) => p.length === 100));
  assert.deepEqual([packets[0][0], packets[0][1], packets[0][2]], [99, 0, 0]);
  const last = packets.at(-1);
  assert.equal(last[0], (8004 % 98) + 1);
  assert.equal(last[1], packets.length - 1);
  const rebuilt = packets.flatMap((p) => [...p.slice(2, 2 + p[0] - 1)]);
  assert.deepEqual(Uint8Array.from(rebuilt), data);
});

test('reply names are read from decrypted blocks', () => {
  const reply = buildCommand('DATSOK');
  assert.equal(replyName(decrypt(encrypt(reply))), 'DATSOK');
  assert.equal(replyName(buildCommand('REOK', [0x01])), 'REOK');
});

test('text bitmaps put the top row of each half in the high bit', () => {
  // Column 0 lights rows 0 and 8, column 1 lights rows 7 and 15.
  const lit = new Set(['0,0', '0,8', '1,7', '1,15']);
  const bitmap = encodeTextBitmap(2, (x, y) => lit.has(`${x},${y}`));
  assert.deepEqual(bitmap, Uint8Array.from([0x80, 0x80, 0x01, 0x01]));
  assert.deepEqual(
    commands.startTextUpload(10, 4).slice(0, 10),
    Uint8Array.from([9, ...Buffer.from('DATS'), 0, 10, 0, 4, 0]),
  );
});
