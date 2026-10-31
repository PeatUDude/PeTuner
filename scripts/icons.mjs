// Generates the app icons in public/ from the SVG below. Run with `npm run icons`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const CENTER_X = 256;
const HUB_Y = 300;

/** Tick marks along the meter arc, -50..+50 cents. */
function ticks() {
  const marks = [];
  for (let cents = -50; cents <= 50; cents += 10) {
    const angle = (cents / 50) * 50 * (Math.PI / 180);
    const inner = cents === 0 ? 86 : cents % 50 === 0 ? 78 : 86;
    const outer = cents === 0 ? 116 : 102;
    const x = (r) => (CENTER_X + r * Math.sin(angle)).toFixed(1);
    const y = (r) => (HUB_Y - r * Math.cos(angle)).toFixed(1);
    const style = cents === 0 ? 'stroke="#22c96b" stroke-width="12"' : 'stroke="#3a2109" stroke-opacity="0.55" stroke-width="6"';
    marks.push(`<line x1="${x(inner)}" y1="${y(inner)}" x2="${x(outer)}" y2="${y(outer)}" ${style} stroke-linecap="round"/>`);
  }
  return marks.join('');
}

/**
 * A guitar pick with a tuner meter on it, needle dead centre (= in tune).
 * `rounded` gives the background rounded corners for browser/desktop icons;
 * home-screen icons are full-bleed because the OS applies its own mask.
 */
function icon({ rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#262c52"/>
      <stop offset="1" stop-color="#0c0f1d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.52" r="0.5">
      <stop offset="0" stop-color="#ffa53d" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ffa53d" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="pick" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffc75e"/>
      <stop offset="1" stop-color="#ff7a2f"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <circle cx="256" cy="262" r="230" fill="url(#glow)"/>
  <path d="M256 404 C232 404 150 312 148 222 C146 160 190 124 256 124 C322 124 366 160 364 222 C362 312 280 404 256 404 Z" fill="url(#pick)"/>
  <path d="M170 196 C178 156 210 140 256 140" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="8" stroke-linecap="round"/>
  ${ticks()}
  <line x1="${CENTER_X}" y1="${HUB_Y}" x2="${CENTER_X}" y2="${HUB_Y - 72}" stroke="#171b33" stroke-width="10" stroke-linecap="round"/>
  <circle cx="${CENTER_X}" cy="${HUB_Y}" r="15" fill="#171b33"/>
</svg>`;
}

const outDir = new URL('../public/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('icon.svg', outDir), icon({ rounded: true }));

const pngs = [
  ['pwa-192.png', 192, true],
  ['pwa-512.png', 512, true],
  ['maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
];
for (const [file, size, rounded] of pngs) {
  await sharp(Buffer.from(icon({ rounded })))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(file, outDir)));
}
console.log('Icons written to public/');
