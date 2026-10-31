import { centsBetween } from '../music/notes';

/** A string within this many cents of its target counts as in tune. */
export const IN_TUNE_CENTS = 5;
/** The meter shows ±this many cents; beyond that the string is "way off". */
export const METER_RANGE_CENTS = 50;
/** How far from the target note (in semitones) the detector listens. */
const SEARCH_SEMITONES = 7;
/** How long a string must stay in tune before it gets its ✓. */
export const TUNED_HOLD_MS = 1000;

export function searchBand(targetHz: number): { minHz: number; maxHz: number } {
  const factor = 2 ** (SEARCH_SEMITONES / 12);
  return { minHz: targetHz / factor, maxHz: targetHz * factor };
}

export type Direction = 'up' | 'down' | 'in-tune';

export interface Feedback {
  /** Negative = too low (flat), positive = too high (sharp). */
  cents: number;
  direction: Direction;
  inTune: boolean;
  /** More than the meter range away from the target. */
  wayOff: boolean;
  /** Distance rounded to whole semitones, for "way off" messages. */
  semitones: number;
}

export function evaluate(frequency: number, targetHz: number): Feedback {
  const cents = centsBetween(frequency, targetHz);
  const inTune = Math.abs(cents) <= IN_TUNE_CENTS;
  return {
    cents,
    inTune,
    direction: inTune ? 'in-tune' : cents < 0 ? 'up' : 'down',
    wayOff: Math.abs(cents) > METER_RANGE_CENTS,
    semitones: Math.round(Math.abs(cents) / 100),
  };
}

/** Steadies the raw detector output: median of the last few readings, held briefly through gaps. */
export class PitchSmoother {
  private recent: number[] = [];
  private lastHeard = -Infinity;

  constructor(
    private readonly size = 5,
    private readonly holdMs = 400,
  ) {}

  /** Feeds one detector result and returns the smoothed frequency, or null when nothing is being heard. */
  push(frequency: number | null, now: number): number | null {
    if (frequency !== null) {
      this.recent.push(frequency);
      if (this.recent.length > this.size) this.recent.shift();
      this.lastHeard = now;
    } else if (now - this.lastHeard > this.holdMs) {
      this.recent = [];
    }
    return this.recent.length ? median(this.recent) : null;
  }

  reset(): void {
    this.recent = [];
    this.lastHeard = -Infinity;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Decides when a string has been in tune long enough to be marked done. */
export class TunedTracker {
  private inTuneSince: number | null = null;

  constructor(private readonly holdMs = TUNED_HOLD_MS) {}

  /** `inTune` is null when nothing is being heard. Returns true once the hold time is reached. */
  update(inTune: boolean | null, now: number): boolean {
    if (!inTune) {
      this.inTuneSince = null;
      return false;
    }
    this.inTuneSince ??= now;
    return now - this.inTuneSince >= this.holdMs;
  }

  reset(): void {
    this.inTuneSince = null;
  }
}
