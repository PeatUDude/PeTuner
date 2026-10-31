import { describe, expect, it } from 'vitest';
import { centsBetween, frequencyToMidi, midiToFrequency, noteName, noteNameBothSpellings } from './notes';

describe('notes', () => {
  it('maps MIDI notes to frequencies at A4 = 440 Hz', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(40)).toBeCloseTo(82.407, 3); // low E
    expect(midiToFrequency(64)).toBeCloseTo(329.628, 3); // high E
  });

  it('round-trips frequency and MIDI', () => {
    expect(frequencyToMidi(midiToFrequency(45))).toBeCloseTo(45, 10);
  });

  it('measures cents', () => {
    expect(centsBetween(440, 440)).toBe(0);
    expect(centsBetween(midiToFrequency(70), midiToFrequency(69))).toBeCloseTo(100, 10);
    expect(centsBetween(220, 440)).toBeCloseTo(-1200, 10);
  });

  it('names notes with sharps or flats', () => {
    expect(noteName(40)).toBe('E2');
    expect(noteName(39)).toBe('D♯2');
    expect(noteName(39, true)).toBe('E♭2');
    expect(noteName(60)).toBe('C4');
    expect(noteNameBothSpellings(39)).toBe('D♯2 / E♭2');
    expect(noteNameBothSpellings(40)).toBe('E2');
  });
});
