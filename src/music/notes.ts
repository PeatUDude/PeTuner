/** Reference pitch for A4 (MIDI note 69). */
export const A4_HZ = 440;

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export function midiToFrequency(midi: number): number {
  return A4_HZ * 2 ** ((midi - 69) / 12);
}

export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / A4_HZ);
}

/** Distance from `reference` to `frequency` in cents (100 cents = 1 semitone). */
export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference);
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** Pitch class name without octave, e.g. "E" or "F♯". */
export function pitchClassName(midi: number, flats = false): string {
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  return names[((midi % 12) + 12) % 12];
}

/** Full note name with octave, e.g. "E2" or "E♭4". */
export function noteName(midi: number, flats = false): string {
  return `${pitchClassName(midi, flats)}${octaveOf(midi)}`;
}

/** Note name listing both spellings for accidentals, e.g. "D♯2 / E♭2". */
export function noteNameBothSpellings(midi: number): string {
  const sharp = noteName(midi, false);
  const flat = noteName(midi, true);
  return sharp === flat ? sharp : `${sharp} / ${flat}`;
}
