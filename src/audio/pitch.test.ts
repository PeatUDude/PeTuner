import { describe, expect, it } from 'vitest';
import { centsBetween, midiToFrequency } from '../music/notes';
import { STANDARD_NOTES } from '../music/tunings';
import { detectPitch } from './pitch';
import { searchBand } from '../tuner/feedback';

const SAMPLE_RATE = 48000;
const WINDOW = 4096;

/** A plucked-string-like tone: decaying harmonics with the given relative amplitudes. */
function pluck(frequency: number, harmonics = [1, 0.8, 0.5, 0.35, 0.2, 0.12], noise = 0, seed = 1): Float32Array {
  const out = new Float32Array(WINDOW);
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296 - 0.5;
  };
  for (let i = 0; i < WINDOW; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    harmonics.forEach((amp, h) => {
      v += amp * Math.exp(-t * (1 + h)) * Math.sin(2 * Math.PI * frequency * (h + 1) * t + h);
    });
    out[i] = 0.2 * v + noise * random();
  }
  return out;
}

function detectNear(samples: Float32Array, targetHz: number) {
  const { minHz, maxHz } = searchBand(targetHz);
  return detectPitch(samples, SAMPLE_RATE, minHz, maxHz);
}

describe('detectPitch', () => {
  it('finds every open string within 1 cent', () => {
    for (const midi of STANDARD_NOTES) {
      const target = midiToFrequency(midi);
      const result = detectNear(pluck(target), target);
      expect(result, `MIDI ${midi}`).not.toBeNull();
      expect(Math.abs(centsBetween(result!.frequency, target))).toBeLessThan(1);
    }
  });

  it('reports slightly detuned strings with the right sign and size', () => {
    const target = midiToFrequency(45); // A2
    for (const cents of [-37, -12, -4, 3, 9, 25]) {
      const actual = target * 2 ** (cents / 1200);
      const result = detectNear(pluck(actual), target)!;
      expect(centsBetween(result.frequency, target)).toBeCloseTo(cents, 0);
    }
  });

  it('does not jump an octave on a low E with a dominant second harmonic', () => {
    const target = midiToFrequency(40);
    const result = detectNear(pluck(target, [0.3, 1, 0.6, 0.4, 0.2]), target)!;
    expect(Math.abs(centsBetween(result.frequency, target))).toBeLessThan(1);
  });

  it('measures strings that are several semitones off', () => {
    const target = midiToFrequency(38); // Drop D target
    const actual = midiToFrequency(40); // string still at E
    const result = detectNear(pluck(actual), target)!;
    expect(centsBetween(result.frequency, target)).toBeCloseTo(200, 0);
  });

  it('copes with some background noise', () => {
    const target = midiToFrequency(55);
    const result = detectNear(pluck(target, undefined, 0.02), target)!;
    expect(Math.abs(centsBetween(result.frequency, target))).toBeLessThan(2);
  });

  it('returns nothing for silence or pure noise', () => {
    const target = midiToFrequency(50);
    expect(detectNear(new Float32Array(WINDOW), target)).toBeNull();
    expect(detectNear(pluck(target, [0], 0.3, 7), target)).toBeNull();
  });

  it('is fast enough for real time on the lowest allowed note', () => {
    const target = midiToFrequency(35); // low string tuned down to B1
    const samples = pluck(target);
    const start = performance.now();
    for (let i = 0; i < 10; i++) detectNear(samples, target);
    expect((performance.now() - start) / 10).toBeLessThan(25);
  });
});
