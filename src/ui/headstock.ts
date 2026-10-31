import { noteName, octaveOf, pitchClassName } from '../music/notes';
import { STRING_COUNT, STRING_NAMES } from '../music/tunings';
import type { HeadstockLayout } from '../storage';

export interface HeadstockView {
  layout: HeadstockLayout;
  notes: readonly number[];
  flats: boolean;
  selected: number;
  tuned: readonly boolean[];
}

interface Point {
  x: number;
  y: number;
}

interface LayoutGeometry {
  /** Shifts the view so the drawing is centred. */
  offsetX: number;
  width: number;
  height: number;
  /** Outline of the headstock, drawn face-on with the neck pointing down. */
  outline: string;
  nutY: number;
  /** Tuning post position per string (index 0 = low E). */
  posts: Point[];
  /** Where each peg's button sits. */
  pegs: Point[];
  pegHeight: number;
}

const NECK_LEFT = 120;
const NECK_RIGHT = 200;
const PEG_WIDTH = 64;
const nutX = (i: number) => 128 + i * 12.8;

const GEOMETRY: Record<HeadstockLayout, LayoutGeometry> = {
  // Gibson-style: bass strings on the left (D, A, E from the top), treble strings on the right.
  '3+3': {
    offsetX: 0,
    width: 320,
    height: 330,
    outline: 'M120 262 L100 52 Q98 26 126 22 L160 32 L194 22 Q222 26 220 52 L200 262 Z',
    nutY: 262,
    posts: [
      { x: 132, y: 204 },
      { x: 128, y: 142 },
      { x: 124, y: 80 },
      { x: 196, y: 80 },
      { x: 192, y: 142 },
      { x: 188, y: 204 },
    ],
    pegs: [
      { x: 48, y: 204 },
      { x: 48, y: 142 },
      { x: 48, y: 80 },
      { x: 272, y: 80 },
      { x: 272, y: 142 },
      { x: 272, y: 204 },
    ],
    pegHeight: 46,
  },
  // Fender-style: all six pegs on the bass side, low E closest to the nut.
  '6-inline': {
    offsetX: -28,
    width: 320,
    height: 380,
    outline: 'M120 312 L114 64 Q112 24 150 22 Q204 18 226 46 Q242 70 222 96 Q202 120 202 170 L200 312 Z',
    nutY: 312,
    posts: Array.from({ length: STRING_COUNT }, (_, i) => ({ x: 136, y: 270 - i * 44 })),
    pegs: Array.from({ length: STRING_COUNT }, (_, i) => ({ x: 52, y: 270 - i * 44 })),
    pegHeight: 38,
  },
};

/** Draws the headstock with one tappable peg per string. */
export function renderHeadstock(container: HTMLElement, view: HeadstockView): void {
  const g = GEOMETRY[view.layout];
  const parts: string[] = [];

  parts.push(`<path class="hs-wood" d="${g.outline}"/>`);
  parts.push(`<rect class="hs-neck" x="${NECK_LEFT}" y="${g.nutY}" width="${NECK_RIGHT - NECK_LEFT}" height="${g.height - g.nutY}"/>`);
  parts.push(`<rect class="hs-nut" x="${NECK_LEFT - 2}" y="${g.nutY - 4}" width="${NECK_RIGHT - NECK_LEFT + 4}" height="8" rx="2"/>`);

  for (let i = 0; i < STRING_COUNT; i++) {
    const post = g.posts[i];
    const width = (2.4 - i * 0.32).toFixed(2);
    const selected = i === view.selected ? ' selected' : '';
    parts.push(
      `<path class="hs-string${selected}" stroke-width="${width}" d="M${post.x} ${post.y} L${nutX(i)} ${g.nutY} L${nutX(i)} ${g.height}"/>`,
    );
  }

  for (let i = 0; i < STRING_COUNT; i++) parts.push(peg(g, i, view));

  container.innerHTML = `<svg viewBox="${g.offsetX} 0 ${g.width} ${g.height}" role="group" aria-label="Strings">${parts.join('')}</svg>`;
}

function peg(g: LayoutGeometry, i: number, view: HeadstockView): string {
  const post = g.posts[i];
  const p = g.pegs[i];
  const h = g.pegHeight;
  const left = p.x - PEG_WIDTH / 2;
  const top = p.y - h / 2;
  const onLeft = p.x < post.x;
  const shaftEnd = onLeft ? p.x + PEG_WIDTH / 2 : p.x - PEG_WIDTH / 2;
  const note = view.notes[i];
  const selected = i === view.selected;
  const tuned = view.tuned[i];
  const hitLeft = Math.min(left, post.x);
  const hitWidth = Math.max(left + PEG_WIDTH, post.x) - hitLeft;
  const label = `${STRING_NAMES[i]} string, target ${noteName(note, view.flats)}${tuned ? ', in tune' : ''}`;

  return `
    <g class="hs-peg${selected ? ' selected' : ''}${tuned ? ' tuned' : ''}" data-string="${i}"
       role="button" tabindex="0" aria-pressed="${selected}" aria-label="${label}">
      <rect class="hs-hit" x="${hitLeft}" y="${top - 4}" width="${hitWidth}" height="${h + 8}"/>
      <line class="hs-shaft" x1="${post.x}" y1="${post.y}" x2="${shaftEnd}" y2="${p.y}"/>
      <circle class="hs-post" cx="${post.x}" cy="${post.y}" r="6"/>
      <rect class="hs-button" x="${left}" y="${top}" width="${PEG_WIDTH}" height="${h}" rx="${h / 2.6}"/>
      <text class="hs-note" x="${p.x}" y="${p.y}" dominant-baseline="central" text-anchor="middle">${pitchClassName(note, view.flats)}<tspan class="hs-octave" dy="5">${octaveOf(note)}</tspan></text>
      ${tuned ? badge(left + PEG_WIDTH - 4, top + 2) : ''}
    </g>`;
}

function badge(x: number, y: number): string {
  return `
    <g class="hs-badge" transform="translate(${x} ${y})">
      <circle r="10"/>
      <path d="M-4.5 0.5 L-1.2 3.8 L4.8 -3.2"/>
    </g>`;
}

/** Calls `onSelect` when a peg is tapped or activated from the keyboard. */
export function onPegSelected(container: HTMLElement, onSelect: (stringIndex: number) => void): void {
  const pick = (event: Event) => {
    const target = (event.target as Element).closest<SVGGElement>('[data-string]');
    if (target) onSelect(Number(target.dataset.string));
  };
  container.addEventListener('click', pick);
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(event);
    }
  });
}
