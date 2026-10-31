import { noteName, pitchClassName } from './notes';

export const STRING_COUNT = 6;

/** Standard tuning as MIDI notes, index 0 = low E string (thickest) ... 5 = high E string. */
export const STANDARD_NOTES: readonly number[] = [40, 45, 50, 55, 59, 64];

/** What players call each string, regardless of what it is currently tuned to. */
export const STRING_NAMES: readonly string[] = ['low E', 'A', 'D', 'G', 'B', 'high E'];

/** How far a string may be retuned relative to its standard pitch, in semitones. */
export const MIN_OFFSET = -5;
export const MAX_OFFSET = 2;

export interface Tuning {
  id: string;
  name: string;
  notes: number[];
  /** Spell accidentals as flats (E♭) instead of sharps (D♯). */
  flats: boolean;
  custom: boolean;
}

function preset(id: string, name: string, notes: number[], flats = false): Tuning {
  return { id, name, notes, flats, custom: false };
}

export const PRESETS: readonly Tuning[] = [
  preset('standard', 'Standard', [40, 45, 50, 55, 59, 64]),
  preset('drop-d', 'Drop D', [38, 45, 50, 55, 59, 64]),
  preset('half-step-down', 'Half-step down', [39, 44, 49, 54, 58, 63], true),
  preset('full-step-down', 'Full-step down', [38, 43, 48, 53, 57, 62]),
  preset('drop-c', 'Drop C', [36, 43, 48, 53, 57, 62]),
  preset('dadgad', 'DADGAD', [38, 45, 50, 55, 57, 62]),
  preset('open-g', 'Open G', [38, 43, 50, 55, 59, 62]),
  preset('open-d', 'Open D', [38, 45, 50, 54, 57, 62]),
  preset('open-e', 'Open E', [40, 47, 52, 56, 59, 64]),
];

export const DEFAULT_TUNING = PRESETS[0];

/** All notes a given string may be tuned to, lowest first. */
export function allowedNotes(stringIndex: number): number[] {
  const base = STANDARD_NOTES[stringIndex];
  const notes: number[] = [];
  for (let offset = MIN_OFFSET; offset <= MAX_OFFSET; offset++) notes.push(base + offset);
  return notes;
}

export function isAllowedNote(stringIndex: number, midi: number): boolean {
  const offset = midi - STANDARD_NOTES[stringIndex];
  return Number.isInteger(midi) && offset >= MIN_OFFSET && offset <= MAX_OFFSET;
}

export function isValidNoteSet(notes: unknown): notes is number[] {
  return (
    Array.isArray(notes) &&
    notes.length === STRING_COUNT &&
    notes.every((n, i) => typeof n === 'number' && isAllowedNote(i, n))
  );
}

export function sameNotes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/** Short summary like "D A D G B E". */
export function describeNotes(notes: readonly number[], flats = false): string {
  return notes.map((n) => pitchClassName(n, flats)).join(' ');
}

/** Long summary like "D2 A2 D3 G3 B3 E4". */
export function describeNotesWithOctaves(notes: readonly number[], flats = false): string {
  return notes.map((n) => noteName(n, flats)).join(' ');
}

export function findTuning(id: string, customTunings: readonly Tuning[]): Tuning | undefined {
  return PRESETS.find((t) => t.id === id) ?? customTunings.find((t) => t.id === id);
}

// --- Custom tunings ---------------------------------------------------------

export const MAX_NAME_LENGTH = 30;

/** Returns an error message, or null if `name` can be used. */
export function validateTuningName(
  rawName: string,
  customTunings: readonly Tuning[],
  ignoreId?: string,
): string | null {
  const name = rawName.trim();
  if (!name) return 'Please enter a name.';
  if (name.length > MAX_NAME_LENGTH) return `Names can be at most ${MAX_NAME_LENGTH} characters.`;
  const key = name.toLocaleLowerCase();
  if (PRESETS.some((t) => t.name.toLocaleLowerCase() === key)) return 'That name is already used by a preset.';
  if (customTunings.some((t) => t.id !== ignoreId && t.name.toLocaleLowerCase() === key)) {
    return 'You already have a tuning with that name.';
  }
  return null;
}

export function createCustomTuning(name: string, notes: readonly number[], flats: boolean): Tuning {
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, name: name.trim(), notes: [...notes], flats, custom: true };
}
