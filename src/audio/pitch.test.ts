import { describe, expect, it } from 'vitest';
import { centsBetween, midiToFrequency } from '../music/notes';
import { STANDARD_NOTES } from '../music/tunings';
import { detectPitch } from './pitch';
import { ACQUIRE_CLARITY, SUSTAIN_CLARITY, searchBand } from '../tuner/feedback';

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

/** Scales a signal to the given RMS level (full scale = 1). */
function atLevel(samples: Float32Array, rms: number): Float32Array {
  let energy = 0;
  for (const s of samples) energy += s * s;
  const gain = rms / Math.sqrt(energy / samples.length);
  return samples.map((s) => s * gain);
}

/**
 * What a phone hears from a low string: its tiny mic barely picks up the fundamental, wound
 * strings have slightly sharp overtones, and there's DC offset plus low rumble from handling.
 */
function phoneLowString(frequency: number): Float32Array {
  const harmonics = [0.12, 1, 0.8, 0.55, 0.35, 0.25, 0.15];
  const inharmonicity = 1e-4;
  const out = new Float32Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0.5 + 1.2 * Math.sin(2 * Math.PI * 12 * t);
    harmonics.forEach((amp, h) => {
      const n = h + 1;
      const partial = frequency * n * Math.sqrt(1 + inharmonicity * n * n);
      v += amp * Math.sin(2 * Math.PI * partial * t + n);
    });
    out[i] = 0.05 * v;
  }
  return out;
}

/** Another string that is still ringing: a steady tone with a few overtones. */
function ringing(frequency: number, amplitude: number): Float32Array {
  const harmonics = [1, 0.5, 0.3, 0.2, 0.1];
  return Float32Array.from({ length: WINDOW }, (_, i) =>
    harmonics.reduce((v, a, h) => v + amplitude * a * Math.sin(2 * Math.PI * frequency * (h + 1) * (i / SAMPLE_RATE) + 1.3 + h), 0),
  );
}

const mix = (...signals: Float32Array[]) => signals.reduce((sum, s) => sum.map((v, i) => v + s[i]));

/** Seeded noise generators: white hiss and rumbly "brown" room noise. */
function noiseSource(seed: number) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296 - 0.5;
  };
  let brown = 0;
  return {
    white: (amplitude: number) => Float32Array.from({ length: WINDOW }, () => amplitude * random()),
    brown: (amplitude: number) => Float32Array.from({ length: WINDOW }, () => (brown = 0.98 * brown + random()) * amplitude),
  };
}

function detectNear(samples: Float32Array, targetHz: number, minClarity?: number) {
  const { minHz, maxHz } = searchBand(targetHz);
  return detectPitch(samples, SAMPLE_RATE, minHz, maxHz, { minClarity });
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

  it('hears a quietly played or fading string (about -56 dBFS)', () => {
    for (const midi of STANDARD_NOTES) {
      const target = midiToFrequency(midi);
      const result = detectNear(atLevel(pluck(target), 0.0016), target);
      expect(result, `MIDI ${midi}`).not.toBeNull();
      expect(Math.abs(centsBetween(result!.frequency, target))).toBeLessThan(1);
    }
  });

  it('hears a low E the way a phone microphone picks it up', () => {
    const target = midiToFrequency(40);
    const result = detectNear(phoneLowString(target), target);
    expect(result).not.toBeNull();
    // Inharmonic overtones pull the perceived pitch up very slightly; stay well inside the ±5 cent window.
    expect(Math.abs(centsBetween(result!.frequency, target))).toBeLessThan(3);
  });

  describe('with other strings ringing along', () => {
    const highE = midiToFrequency(64);
    const [lowE, a, d, , b] = STANDARD_NOTES.map(midiToFrequency);
    const level = 0.03;

    it('reads the high E while the B string still rings at a quarter volume', () => {
      const result = detectNear(mix(ringing(highE, level), ringing(b, level / 4)), highE, SUSTAIN_CLARITY)!;
      expect(result.clarity).toBeGreaterThanOrEqual(ACQUIRE_CLARITY);
      expect(Math.abs(centsBetween(result.frequency, highE))).toBeLessThan(3);
    });

    it('reads the high E while a lower string rings as loud as it', () => {
      // These sit below the search band, so the high-pass filter removes most of them.
      for (const other of [lowE, a, d]) {
        const result = detectNear(mix(ringing(highE, level), ringing(other, level)), highE, SUSTAIN_CLARITY);
        expect(result, `${other.toFixed(0)} Hz`).not.toBeNull();
        expect(Math.abs(centsBetween(result!.frequency, highE)), `${other.toFixed(0)} Hz`).toBeLessThan(3.5);
      }
    });

    it('rather shows nothing than a wrong note when a louder string drowns out the target', () => {
      for (const other of [a, b]) {
        const result = detectNear(mix(ringing(highE, level), ringing(other, level * 2)), highE, SUSTAIN_CLARITY);
        const misread = result !== null && Math.abs(centsBetween(result.frequency, highE)) > 5;
        if (misread) expect(result.clarity, `${other.toFixed(0)} Hz`).toBeLessThan(ACQUIRE_CLARITY);
      }
    });
  });

  it('never mistakes room noise for a note', () => {
    const noise = noiseSource(42);
    for (const midi of STANDARD_NOTES) {
      const target = midiToFrequency(midi);
      for (let i = 0; i < 40; i++) {
        for (const samples of [noise.white(0.02), noise.brown(0.002)]) {
          const result = detectNear(samples, target, SUSTAIN_CLARITY);
          expect(result?.clarity ?? 0).toBeLessThan(ACQUIRE_CLARITY);
        }
      }
    }
  });

  it('is fast enough for real time on the lowest allowed note', () => {
    const target = midiToFrequency(35); // low string tuned down to B1
    const samples = pluck(target);
    const start = performance.now();
    for (let i = 0; i < 10; i++) detectNear(samples, target);
    expect((performance.now() - start) / 10).toBeLessThan(25);
  });
});
