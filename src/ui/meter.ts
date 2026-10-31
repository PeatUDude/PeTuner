import { METER_RANGE_CENTS, type Feedback } from '../tuner/feedback';

export type MeterState = 'idle' | 'waiting' | 'flat' | 'sharp' | 'in-tune';

/** The cents meter: a needle on a ±50 cent scale plus a big instruction and a detail line. */
export class Meter {
  private readonly needle: HTMLElement;
  private readonly message: HTMLElement;
  private readonly detail: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.needle = root.querySelector('.meter-needle')!;
    this.message = root.querySelector('.meter-message')!;
    this.detail = root.querySelector('.meter-detail')!;

    const ticks = root.querySelector('.meter-ticks')!;
    for (let cents = -METER_RANGE_CENTS; cents <= METER_RANGE_CENTS; cents += 10) {
      const tick = document.createElement('span');
      tick.className = cents % 50 === 0 ? 'tick major' : 'tick';
      tick.style.left = `${50 + (cents / METER_RANGE_CENTS) * 50}%`;
      ticks.append(tick);
    }
  }

  /** No reading: show a prompt with the needle parked in the middle. */
  showIdle(message: string, detail = '', state: 'idle' | 'waiting' = 'idle'): void {
    this.setState(state);
    this.setNeedle(0);
    this.message.textContent = message;
    this.detail.textContent = detail;
  }

  showReading(feedback: Feedback, frequency: number): void {
    const { cents, direction, wayOff, semitones } = feedback;
    this.setState(direction === 'in-tune' ? 'in-tune' : direction === 'up' ? 'flat' : 'sharp');
    this.setNeedle(cents);

    if (direction === 'in-tune') {
      this.message.textContent = '✓ In tune';
    } else if (wayOff) {
      const amount = `≈${semitones} semitone${semitones === 1 ? '' : 's'}`;
      this.message.textContent =
        direction === 'up' ? `↑ Way too low – tune up (${amount})` : `↓ Way too high – tune down (${amount})`;
    } else {
      this.message.textContent = direction === 'up' ? '↑ Tune up' : '↓ Tune down';
    }
    const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
    this.detail.textContent = `${sign}${Math.abs(Math.round(cents))} cents · hearing ${frequency.toFixed(1)} Hz`;
  }

  /** The note has faded: keep the last reading visible but dimmed. */
  markStale(): void {
    this.root.dataset.stale = '';
  }

  private setState(state: MeterState): void {
    this.root.dataset.state = state;
    delete this.root.dataset.stale;
  }

  private setNeedle(cents: number): void {
    const clamped = Math.max(-METER_RANGE_CENTS, Math.min(METER_RANGE_CENTS, cents));
    this.needle.style.left = `${50 + (clamped / METER_RANGE_CENTS) * 50}%`;
  }
}
