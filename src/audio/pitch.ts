export interface PitchResult {
  frequency: number;
  /** How periodic the signal is, 0..1. Clean guitar notes score above 0.9. */
  clarity: number;
}

export interface PitchOptions {
  /** Ignore signals quieter than this RMS level (full scale = 1). */
  minRms?: number;
  /** Ignore results less periodic than this. */
  minClarity?: number;
}

/** Fraction of the highest peak a candidate must reach to count as the pitch (McLeod's "k"). */
const PEAK_THRESHOLD = 0.9;
/** Rumble below this is removed before analysis; the lowest note PeTuner tunes to is ~62 Hz. */
const HIGH_PASS_HZ = 40;
/** The filter needs a moment to settle; its output from this first stretch is discarded. */
const FILTER_SETTLE_SECONDS = 0.02;

/**
 * Detects the fundamental frequency of `samples` using the McLeod Pitch Method,
 * searching only between `minFreq` and `maxFreq`.
 *
 * Restricting the search to a band around the expected note is what keeps the
 * detector from locking onto a harmonic (an octave too high) or a subharmonic
 * (an octave too low) - the classic failure of tuners on a guitar's low strings.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  minFreq: number,
  maxFreq: number,
  { minRms = 0.001, minClarity = 0.85 }: PitchOptions = {},
): PitchResult | null {
  samples = highPass(samples, sampleRate);
  const n = samples.length;

  let energy = 0;
  for (let i = 0; i < n; i++) energy += samples[i] * samples[i];
  if (Math.sqrt(energy / n) < minRms) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minFreq) + 1);
  if (minLag >= maxLag) return null;

  const nsdf = normalizedSquareDifference(samples, maxLag + 2, energy);
  const peaks = keyMaxima(nsdf, minLag, maxLag);
  if (peaks.length === 0) return null;

  let highest = 0;
  for (const p of peaks) highest = Math.max(highest, nsdf[p]);
  const chosen = peaks.find((p) => nsdf[p] >= PEAK_THRESHOLD * highest)!;

  const { lag, value } = refinePeak(nsdf, chosen);
  const frequency = sampleRate / lag;
  if (value < minClarity || frequency < minFreq || frequency > maxFreq) return null;
  return { frequency, clarity: Math.min(1, value) };
}

let filtered = new Float32Array(0);

/**
 * Removes DC offset and rumble (handling noise, a phone resting on the guitar body).
 * Left in, they keep the NSDF from dipping below zero, so no pitch peak is ever found.
 * Second-order Butterworth high-pass; reuses one buffer to avoid garbage every frame.
 * Returns only the settled part, so the result is shorter than the input.
 */
function highPass(input: Float32Array, sampleRate: number): Float32Array {
  const n = input.length;
  if (filtered.length !== n) filtered = new Float32Array(n);

  let mean = 0;
  for (let i = 0; i < n; i++) mean += input[i];
  mean /= n; // removing the mean first avoids a filter "kick" at the start of the window

  const w = (2 * Math.PI * HIGH_PASS_HZ) / sampleRate;
  const alpha = Math.sin(w) / Math.SQRT2;
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const x = input[i] - mean;
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    filtered[i] = y;
  }
  const settle = Math.min(Math.round(FILTER_SETTLE_SECONDS * sampleRate), n >> 2);
  return filtered.subarray(settle);
}

/** NSDF from the McLeod paper: 2·r(τ) / m(τ), ranging from -1 to 1. */
function normalizedSquareDifference(x: Float32Array, lags: number, energy: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(lags);
  let m = 2 * energy;
  for (let tau = 0; tau < lags; tau++) {
    if (tau > 0) m -= x[n - tau] * x[n - tau] + x[tau - 1] * x[tau - 1];
    let r = 0;
    for (let j = 0; j < n - tau; j++) r += x[j] * x[j + tau];
    out[tau] = m > 0 ? (2 * r) / m : 0;
  }
  return out;
}

/** Highest point of each positive lobe of the NSDF (after the one at lag 0) whose peak lies in range. */
function keyMaxima(nsdf: Float32Array, minLag: number, maxLag: number): number[] {
  const peaks: number[] = [];
  let tau = 1;
  while (tau < nsdf.length && nsdf[tau] > 0) tau++; // skip the lobe around lag 0

  let best = -1;
  for (; tau < nsdf.length - 1; tau++) {
    const value = nsdf[tau];
    if (value > 0) {
      if (best < 0 || value > nsdf[best]) best = tau;
    } else if (best >= 0) {
      if (best >= minLag && best <= maxLag) peaks.push(best);
      best = -1;
    }
  }
  // A lobe still rising at the end of the window peaks beyond maxLag, i.e. below the band.
  if (best >= minLag && best <= maxLag && nsdf[best + 1] < nsdf[best]) peaks.push(best);
  return peaks;
}

/** Fits a parabola through the peak and its neighbours for sub-sample accuracy. */
function refinePeak(nsdf: Float32Array, tau: number): { lag: number; value: number } {
  const a = nsdf[tau - 1];
  const b = nsdf[tau];
  const c = nsdf[tau + 1];
  const denominator = a - 2 * b + c;
  if (denominator === 0) return { lag: tau, value: b };
  const delta = (0.5 * (a - c)) / denominator;
  return { lag: tau + delta, value: b - 0.25 * (a - c) * delta };
}
