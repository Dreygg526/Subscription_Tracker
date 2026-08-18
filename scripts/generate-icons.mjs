// Generates the PWA icons with no image dependencies -- it writes the PNG
// bytes directly. Run with `npm run icons`.
//
// Swap BRAND/ACCENT below for your palette, or just drop your own PNGs into
// public/icons/ with the same filenames and never run this again.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BRAND = [18, 49, 79]; // #12314f -- background
const TRACK = [45, 78, 111]; // subtle ring behind the progress arc
const ACCENT = [122, 178, 232]; // #7ab2e8 -- the progress arc

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** rgba is a Uint8Array of size*size*4. */
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);

  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12: compression, filter, interlace -- all 0.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the mark --------------------------------------------------------------

/** Antialiased coverage: 1 inside the shape, 0 outside, soft over ~1px. */
function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance));
}

function blend(dst, i, colour, alpha) {
  if (alpha <= 0) return;
  for (let c = 0; c < 3; c++) {
    dst[i + c] = Math.round(dst[i + c] * (1 - alpha) + colour[c] * alpha);
  }
}

/**
 * A progress ring: a full faint track with a 78%-complete accent arc starting
 * at 12 o'clock. `inset` shrinks the mark for maskable icons, where the outer
 * ~10% of each edge can be cropped to a circle by the launcher.
 */
function drawIcon(size, inset) {
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * (0.32 - inset);
  const halfStroke = size * 0.075;
  const sweep = Math.PI * 2 * 0.78;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      rgba[i] = BRAND[0];
      rgba[i + 1] = BRAND[1];
      rgba[i + 2] = BRAND[2];
      rgba[i + 3] = 255;

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ringAlpha = coverage(Math.abs(Math.hypot(dx, dy) - radius) - halfStroke);
      if (ringAlpha <= 0) continue;

      blend(rgba, i, TRACK, ringAlpha);

      // Angle clockwise from 12 o'clock, in [0, 2pi).
      let angle = Math.atan2(dx, -dy);
      if (angle < 0) angle += Math.PI * 2;

      if (angle <= sweep) blend(rgba, i, ACCENT, ringAlpha);
    }
  }

  return encodePng(size, rgba);
}

mkdirSync(OUT, { recursive: true });

const files = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  // Maskable icons get cropped to a circle, so pull the mark in.
  ['icon-maskable-512.png', 512, 0.06],
];

for (const [name, size, inset] of files) {
  writeFileSync(join(OUT, name), drawIcon(size, inset));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
