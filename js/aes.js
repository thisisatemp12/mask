// Minimal AES-128 in ECB mode, encrypting and decrypting single 16-byte blocks.
// WebCrypto has no ECB mode, and the mask only ever exchanges one block at a
// time, so a small plain implementation is the simplest thing that works.

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);

// Multiply in GF(2^8) modulo the AES polynomial x^8 + x^4 + x^3 + x + 1.
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

(function buildSbox() {
  // Walk p over all non-zero field elements with p *= 3 and q over their
  // inverses with q /= 3, then apply the affine transform.
  let p = 1;
  let q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const rot = (x, n) => ((x << n) | (x >> (8 - n))) & 0xff;
    const s = q ^ rot(q, 1) ^ rot(q, 2) ^ rot(q, 3) ^ rot(q, 4) ^ 0x63;
    SBOX[p] = s;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
})();

/** Expand a 16-byte key into 11 round keys (176 bytes). */
function expandKey(key) {
  if (key.length !== 16) throw new Error('AES-128 needs a 16-byte key');
  const w = new Uint8Array(176);
  w.set(key);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
    if (i % 16 === 0) {
      [t0, t1, t2, t3] = [SBOX[t1] ^ rcon, SBOX[t2], SBOX[t3], SBOX[t0]];
      rcon = gmul(rcon, 2);
    }
    w[i] = w[i - 16] ^ t0;
    w[i + 1] = w[i - 15] ^ t1;
    w[i + 2] = w[i - 14] ^ t2;
    w[i + 3] = w[i - 13] ^ t3;
  }
  return w;
}

function addRoundKey(s, w, round) {
  for (let i = 0; i < 16; i++) s[i] ^= w[round * 16 + i];
}

// The state is stored column by column, so byte (row r, column c) is s[c * 4 + r].
function shiftRows(s, inverse) {
  const t = s.slice();
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const from = inverse ? (c - r + 4) % 4 : (c + r) % 4;
      s[c * 4 + r] = t[from * 4 + r];
    }
  }
}

function mixColumns(s, inverse) {
  const m = inverse ? [14, 11, 13, 9] : [2, 3, 1, 1];
  for (let c = 0; c < 4; c++) {
    const a = s.slice(c * 4, c * 4 + 4);
    for (let r = 0; r < 4; r++) {
      s[c * 4 + r] =
        gmul(a[0], m[(4 - r) % 4]) ^
        gmul(a[1], m[(5 - r) % 4]) ^
        gmul(a[2], m[(6 - r) % 4]) ^
        gmul(a[3], m[(7 - r) % 4]);
    }
  }
}

export class Aes128 {
  constructor(key) {
    this.w = expandKey(key);
  }

  encryptBlock(block) {
    if (block.length !== 16) throw new Error('AES block must be 16 bytes');
    const s = Uint8Array.from(block);
    addRoundKey(s, this.w, 0);
    for (let round = 1; round <= 10; round++) {
      for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
      shiftRows(s, false);
      if (round !== 10) mixColumns(s, false);
      addRoundKey(s, this.w, round);
    }
    return s;
  }

  decryptBlock(block) {
    if (block.length !== 16) throw new Error('AES block must be 16 bytes');
    const s = Uint8Array.from(block);
    addRoundKey(s, this.w, 10);
    for (let round = 9; round >= 0; round--) {
      shiftRows(s, true);
      for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
      addRoundKey(s, this.w, round);
      if (round !== 0) mixColumns(s, true);
    }
    return s;
  }
}
