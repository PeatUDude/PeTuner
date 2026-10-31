/** Samples analysed per pitch reading: ~85 ms at 48 kHz, enough for two periods of the lowest note. */
const WINDOW_SIZE = 4096;

export class MicPermissionError extends Error {}

export interface AudioInput {
  readonly sampleRate: number;
  /** Short description of the input and its processing, for the ?debug readout. */
  readonly description: string;
  /** Fills `buffer` (length WINDOW_SIZE) with the most recent audio. */
  read(buffer: Float32Array): void;
  stop(): void;
}

export function createSampleBuffer(): Float32Array {
  return new Float32Array(WINDOW_SIZE);
}

/**
 * Opens the microphone. Must be called from a tap/click handler: browsers (iOS
 * Safari in particular) only allow audio to start in response to a user gesture.
 */
export async function openMicrophone(): Promise<AudioInput> {
  // Create and resume the context before the first await, while we are still inside the gesture.
  const context = new AudioContext();
  const resumed = context.resume();

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Voice processing smears or removes sustained tones, which is exactly what a tuner listens to.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (error) {
    await context.close();
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicPermissionError('Microphone access denied');
    throw error;
  }
  await resumed;

  const analyser = context.createAnalyser();
  analyser.fftSize = WINDOW_SIZE;
  context.createMediaStreamSource(stream).connect(analyser);

  // Browsers may ignore the constraints above; report what was actually applied.
  const settings = stream.getAudioTracks()[0]?.getSettings() ?? {};
  const flag = (value: unknown) => (value === true ? 'on' : value === false ? 'off' : String(value ?? '?'));
  const description =
    `${context.sampleRate} Hz · echo cancel ${flag(settings.echoCancellation)}` +
    ` · noise suppr ${flag(settings.noiseSuppression)} · auto gain ${flag(settings.autoGainControl)}`;

  return {
    sampleRate: context.sampleRate,
    description,
    read: (buffer) => analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>),
    stop: () => {
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
    },
  };
}

/**
 * Development aid: a synthetic plucked-string tone instead of the microphone,
 * so the app can be exercised without a guitar. Enabled with `?sim` in dev builds.
 */
export async function openSimulatedInput(): Promise<AudioInput & { setFrequency(hz: number): void }> {
  const context = new AudioContext();
  await context.resume();

  const harmonics = [0, 1, 0.8, 0.5, 0.35, 0.2, 0.12];
  const wave = context.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics));
  const oscillator = context.createOscillator();
  oscillator.setPeriodicWave(wave);
  const gain = context.createGain();
  gain.gain.value = 0.2;
  const analyser = context.createAnalyser();
  analyser.fftSize = WINDOW_SIZE;
  oscillator.connect(gain).connect(analyser);
  oscillator.start();

  return {
    sampleRate: context.sampleRate,
    description: `${context.sampleRate} Hz · simulated string`,
    read: (buffer) => analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>),
    stop: () => void context.close(),
    setFrequency: (hz) => oscillator.frequency.setValueAtTime(hz, context.currentTime),
  };
}
