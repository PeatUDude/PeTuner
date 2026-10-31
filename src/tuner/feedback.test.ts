import { describe, expect, it } from 'vitest';
import { PitchSmoother, TunedTracker, evaluate } from './feedback';

const A2 = 110;
const at = (cents: number) => A2 * 2 ** (cents / 1200);

describe('evaluate', () => {
  it('says tune up when flat and tune down when sharp', () => {
    expect(evaluate(at(-20), A2).direction).toBe('up');
    expect(evaluate(at(20), A2).direction).toBe('down');
  });

  it('counts ±5 cents as in tune', () => {
    expect(evaluate(at(4.9), A2)).toMatchObject({ inTune: true, direction: 'in-tune' });
    expect(evaluate(at(-4.9), A2).inTune).toBe(true);
    expect(evaluate(at(5.5), A2).inTune).toBe(false);
  });

  it('flags readings beyond the meter as way off, in whole semitones', () => {
    expect(evaluate(at(-45), A2).wayOff).toBe(false);
    expect(evaluate(at(-310), A2)).toMatchObject({ wayOff: true, semitones: 3, direction: 'up' });
    expect(evaluate(at(140), A2)).toMatchObject({ wayOff: true, semitones: 1, direction: 'down' });
  });
});

describe('PitchSmoother', () => {
  it('ignores a single glitch', () => {
    const s = new PitchSmoother();
    [110, 110.2, 220, 110.1, 109.9].forEach((f, i) => s.push(f, i * 50));
    expect(s.push(110, 250)).toBeCloseTo(110.1, 5);
  });

  it('holds the reading through short gaps, then lets go', () => {
    const s = new PitchSmoother(5, 400);
    s.push(110, 0);
    expect(s.push(null, 300)).toBe(110);
    expect(s.push(null, 500)).toBeNull();
  });
});

describe('TunedTracker', () => {
  it('needs one continuous second in tune', () => {
    const t = new TunedTracker(1000);
    expect(t.update(true, 0)).toBe(false);
    expect(t.update(true, 600)).toBe(false);
    expect(t.update(false, 700)).toBe(false);
    expect(t.update(true, 800)).toBe(false);
    expect(t.update(true, 1799)).toBe(false);
    expect(t.update(true, 1800)).toBe(true);
  });

  it('restarts when the note stops', () => {
    const t = new TunedTracker(1000);
    t.update(true, 0);
    t.update(null, 900);
    expect(t.update(true, 1000)).toBe(false);
  });
});
