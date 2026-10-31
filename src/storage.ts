import { STRING_COUNT, isValidNoteSet, type Tuning } from './music/tunings';

export type HeadstockLayout = '3+3' | '6-inline';

/** What the app remembers between launches. */
export interface SavedSettings {
  tuningId: string;
  /** The notes currently being tuned to, including unsaved per-string changes. */
  notes: number[];
  selectedString: number;
  headstock: HeadstockLayout;
}

const SETTINGS_KEY = 'petuner.settings.v1';
const TUNINGS_KEY = 'petuner.tunings.v1';

// Storage can be unavailable (private browsing, blocked site data), so every access is guarded.
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing useful to do; the app keeps working for this session.
  }
}

export function loadSettings(): Partial<SavedSettings> {
  const data = read(SETTINGS_KEY);
  if (!data || typeof data !== 'object') return {};
  const raw = data as Record<string, unknown>;
  const settings: Partial<SavedSettings> = {};
  if (typeof raw.tuningId === 'string') settings.tuningId = raw.tuningId;
  if (isValidNoteSet(raw.notes)) settings.notes = raw.notes;
  if (Number.isInteger(raw.selectedString) && (raw.selectedString as number) >= 0 && (raw.selectedString as number) < STRING_COUNT) {
    settings.selectedString = raw.selectedString as number;
  }
  if (raw.headstock === '3+3' || raw.headstock === '6-inline') settings.headstock = raw.headstock;
  return settings;
}

export function saveSettings(settings: SavedSettings): void {
  write(SETTINGS_KEY, settings);
}

export function loadCustomTunings(): Tuning[] {
  const data = read(TUNINGS_KEY);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item): Tuning[] => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !isValidNoteSet(item.notes)) return [];
    return [{ id: item.id, name: item.name, notes: item.notes, flats: item.flats === true, custom: true }];
  });
}

export function saveCustomTunings(tunings: readonly Tuning[]): void {
  write(
    TUNINGS_KEY,
    tunings.map(({ id, name, notes, flats }) => ({ id, name, notes, flats })),
  );
}
