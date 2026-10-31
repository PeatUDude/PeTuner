import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  allowedNotes,
  createCustomTuning,
  describeNotes,
  isValidNoteSet,
  validateTuningName,
} from './tunings';

describe('presets', () => {
  it('only use notes inside the allowed per-string range', () => {
    for (const tuning of PRESETS) {
      expect(isValidNoteSet(tuning.notes), tuning.name).toBe(true);
    }
  });

  it('have unique ids and names', () => {
    expect(new Set(PRESETS.map((t) => t.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((t) => t.name)).size).toBe(PRESETS.length);
  });

  it('describe themselves', () => {
    expect(describeNotes(PRESETS.find((t) => t.id === 'dadgad')!.notes)).toBe('D A D G A D');
    expect(describeNotes(PRESETS.find((t) => t.id === 'half-step-down')!.notes, true)).toBe('E♭ A♭ D♭ G♭ B♭ E♭');
  });
});

describe('allowedNotes', () => {
  it('spans 5 semitones down to 2 up from standard', () => {
    expect(allowedNotes(0)).toEqual([35, 36, 37, 38, 39, 40, 41, 42]);
  });
});

describe('isValidNoteSet', () => {
  it('rejects wrong lengths and out-of-range notes', () => {
    expect(isValidNoteSet([40, 45, 50, 55, 59])).toBe(false);
    expect(isValidNoteSet([40, 45, 50, 55, 59, 67])).toBe(false);
    expect(isValidNoteSet('nope')).toBe(false);
  });
});

describe('validateTuningName', () => {
  const mine = [createCustomTuning('My Slide', [38, 43, 50, 55, 59, 62], false)];

  it('accepts a fresh name', () => {
    expect(validateTuningName('Gig tuning', mine)).toBeNull();
  });

  it('rejects empty, too long, preset and duplicate names', () => {
    expect(validateTuningName('   ', mine)).toMatch(/enter a name/);
    expect(validateTuningName('x'.repeat(31), mine)).toMatch(/at most/);
    expect(validateTuningName('drop d', mine)).toMatch(/preset/);
    expect(validateTuningName(' my slide ', mine)).toMatch(/already have/);
  });

  it('allows keeping the same name when renaming', () => {
    expect(validateTuningName('My Slide', mine, mine[0].id)).toBeNull();
  });
});
