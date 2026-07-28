/**
 * Generates the PWA icon set with no image dependencies.
 *
 * The mark is two overlapping circles — one amber, one rose — on a warm dark
 * ground. Where they overlap they blend into a third colour, which is the
 * whole idea of the app in one shape.
 *
 *   node scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BG = [20, 17, 15];
const AMBER = [232, 163, 61];
const ROSE = [232, 128, 159];

// --- PNG encoding ----------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of size * size * 4 */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const dst = y * (size * 4 + 1);
    raw[dst] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, dst + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- drawing ---------------------------------------------------------------
/** Signed coverage of a circle at a pixel, antialiased over ~1px. */
function circleCoverage(px, py, cx, cy, r) {
  const d = Math.hypot(px - cx, py - cy);
  return Math.min(1, Math.max(0, r - d + 0.5));
}

/** Rounded-square mask, used so the non-maskable icon has its own shape. */
function squircleCoverage(px, py, size, radius) {
  const inset = 0;
  const x = Math.min(px - inset, size - inset - px);
  const y = Math.min(py - inset, size - inset - py);
  if (x > radius && y > radius) return 1;
  const dx = Math.max(0, radius - x);
  const dy = Math.max(0, radius - y);
  const d = Math.hypot(dx, dy);
  return Math.min(1, Math.max(0, radius - d + 0.5));
}

function blend(base, over, alpha) {
  return [
    Math.round(base[0] + (over[0] - base[0]) * alpha),
    Math.round(base[1] + (over[1] - base[1]) * alpha),
    Math.round(base[2] + (over[2] - base[2]) * alpha),
  ];
}

function render(size, { maskable }) {
  const rgba = new Uint8Array(size * size * 4);

  // Maskable icons must keep their content inside the safe zone (the inner
  // 80%), because the launcher is free to crop to any shape it likes.
  const scale = maskable ? 0.62 : 0.78;
  const r = (size * scale) / 4;
  const gap = r * 0.62;
  const cx = size / 2;
  const cy = size / 2;

  const cornerRadius = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      let color = BG;
      const a = circleCoverage(px, py, cx - gap, cy, r);
      const b = circleCoverage(px, py, cx + gap, cy, r);

      if (a > 0) color = blend(color, AMBER, a);
      if (b > 0) {
        // In the overlap the two mix evenly rather than one covering the other.
        color = blend(color, ROSE, a > 0 ? b * 0.5 : b);
      }

      const alpha = maskable ? 1 : squircleCoverage(px, py, size, cornerRadius);

      const i = (y * size + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, rgba);
}

mkdirSync(OUT, { recursive: true });

const targets = [
  ["icon-192.png", 192, { maskable: false }],
  ["icon-512.png", 512, { maskable: false }],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, { maskable: true }],
  ["badge.png", 96, { maskable: false }],
];

for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT, name), render(size, opts));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
