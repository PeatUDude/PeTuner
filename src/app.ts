import {
  MicPermissionError,
  createSampleBuffer,
  openMicrophone,
  openSimulatedInput,
  type AudioInput,
} from './audio/listener';
import { detectPitch } from './audio/pitch';
import { midiToFrequency, noteName, noteNameBothSpellings } from './music/notes';
import {
  DEFAULT_TUNING,
  MAX_NAME_LENGTH,
  PRESETS,
  STANDARD_NOTES,
  STRING_COUNT,
  STRING_NAMES,
  allowedNotes,
  createCustomTuning,
  describeNotes,
  findTuning,
  sameNotes,
  validateTuningName,
  type Tuning,
} from './music/tunings';
import { loadCustomTunings, loadSettings, saveCustomTunings, saveSettings, type HeadstockLayout } from './storage';
import { PitchSmoother, TunedTracker, evaluate, searchBand } from './tuner/feedback';
import { askConfirm, askText } from './ui/dialogs';
import { onPegSelected, renderHeadstock } from './ui/headstock';
import { Meter } from './ui/meter';
import { SettingsDialog } from './ui/settings';

type MicState = 'off' | 'starting' | 'on' | 'denied' | 'error';

/** How often the microphone is analysed. */
const READ_INTERVAL_MS = 50;

/** Dev-only: `?sim=<cents>` replaces the microphone with a synthetic string that far off target. */
const simParam = import.meta.env.DEV ? new URLSearchParams(location.search).get('sim') : null;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;

export class App {
  private customTunings: Tuning[] = loadCustomTunings();
  /** The preset or saved tuning the current notes are based on. */
  private tuning: Tuning;
  /** Target note per string, including unsaved changes. */
  private notes: number[];
  private selected: number;
  private headstock: HeadstockLayout;
  private readonly tuned: boolean[] = new Array(STRING_COUNT).fill(false);

  private mic: MicState = 'off';
  private input: AudioInput | null = null;
  private timer = 0;
  private wakeLock: WakeLockSentinel | null = null;
  private readonly samples = createSampleBuffer();
  private readonly smoother = new PitchSmoother();
  private readonly tracker = new TunedTracker();
  private simulate: ((targetHz: number) => void) | null = null;
  private simCents = Number(simParam) || 0;

  private readonly tuningSelect = $<HTMLSelectElement>('#tuning-select');
  private readonly micButton = $<HTMLButtonElement>('#mic-button');
  private readonly settingsButton = $<HTMLButtonElement>('#settings-button');
  private readonly headstockView = $<HTMLElement>('#headstock');
  private readonly stringLabel = $<HTMLElement>('#string-label');
  private readonly targetSelect = $<HTMLSelectElement>('#target-select');
  private readonly actions = $<HTMLElement>('#tuning-actions');
  private readonly meter = new Meter($<HTMLElement>('#meter'));
  private readonly settings: SettingsDialog;

  constructor() {
    const saved = loadSettings();
    this.tuning = findTuning(saved.tuningId ?? '', this.customTunings) ?? DEFAULT_TUNING;
    this.notes = saved.notes ?? [...this.tuning.notes];
    this.selected = saved.selectedString ?? 0;
    this.headstock = saved.headstock ?? '3+3';

    this.settings = new SettingsDialog($<HTMLDialogElement>('#settings-dialog'), {
      headstock: () => this.headstock,
      setHeadstock: (layout) => {
        this.headstock = layout;
        this.persist();
        this.renderHeadstock();
      },
      customTunings: () => this.customTunings,
      renameTuning: (id) => this.renameTuning(id),
      deleteTuning: (id) => this.deleteTuning(id),
    });

    this.tuningSelect.addEventListener('change', () => this.chooseTuning(this.tuningSelect.value));
    this.targetSelect.addEventListener('change', () => this.setTarget(Number(this.targetSelect.value)));
    this.micButton.addEventListener('click', () => (this.isListening() ? this.stopListening() : this.startListening()));
    this.settingsButton.addEventListener('click', () => this.settings.open());
    onPegSelected(this.headstockView, (i) => this.selectString(i));
    this.actions.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
      if (action === 'reset') this.resetChanges();
      else if (action === 'save') this.saveChanges();
      else if (action === 'save-new') void this.saveAsNew();
    });
    // Release the microphone when the app is put in the background.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isListening()) this.stopListening();
    });

    if (simParam !== null) this.showSimulationNotice();
    this.render();
  }

  /** Makes test mode impossible to miss: it ignores the microphone entirely. */
  private showSimulationNotice(): void {
    const notice = document.createElement('p');
    notice.className = 'sim-notice';
    notice.textContent =
      'Test mode: listening to a simulated string, not the microphone. Remove “?sim=…” from the address to use the mic.';
    $('.topbar').after(notice);
  }

  /** The browser has downloaded a new version in the background. */
  updateReady(): void {
    this.settings.markUpdateReady();
    this.settingsButton.classList.add('has-badge');
  }

  // --- Actions -----------------------------------------------------------------

  private selectString(index: number): void {
    if (index !== this.selected) {
      this.selected = index;
      this.resetDetection();
      this.persist();
      this.render();
    }
    // Tapping a peg is the gesture that's allowed to start the microphone.
    if (!this.isListening()) void this.startListening();
  }

  private chooseTuning(id: string): void {
    this.tuning = findTuning(id, this.customTunings) ?? DEFAULT_TUNING;
    this.notes = [...this.tuning.notes];
    this.tuned.fill(false);
    this.resetDetection();
    this.persist();
    this.render();
  }

  private setTarget(midi: number): void {
    this.notes[this.selected] = midi;
    this.tuned[this.selected] = false;
    this.resetDetection();
    this.persist();
    this.render();
  }

  private resetChanges(): void {
    this.notes.forEach((note, i) => {
      if (note !== this.tuning.notes[i]) this.tuned[i] = false;
    });
    this.notes = [...this.tuning.notes];
    this.resetDetection();
    this.persist();
    this.render();
  }

  /** Overwrites the current custom tuning with the changed notes. */
  private saveChanges(): void {
    this.tuning.notes = [...this.notes];
    saveCustomTunings(this.customTunings);
    this.render();
  }

  private async saveAsNew(): Promise<void> {
    const name = await askText({
      title: 'Save custom tuning',
      label: 'Name',
      initial: describeNotes(this.notes, this.tuning.flats),
      confirmLabel: 'Save',
      maxLength: MAX_NAME_LENGTH,
      validate: (value) => validateTuningName(value, this.customTunings),
    });
    if (name === null) return;
    const tuning = createCustomTuning(name, this.notes, this.tuning.flats);
    this.customTunings.push(tuning);
    saveCustomTunings(this.customTunings);
    this.tuning = tuning;
    this.persist();
    this.render();
  }

  private async renameTuning(id: string): Promise<void> {
    const tuning = this.customTunings.find((t) => t.id === id);
    if (!tuning) return;
    const name = await askText({
      title: 'Rename tuning',
      label: 'Name',
      initial: tuning.name,
      confirmLabel: 'Rename',
      maxLength: MAX_NAME_LENGTH,
      validate: (value) => validateTuningName(value, this.customTunings, id),
    });
    if (name === null) return;
    tuning.name = name;
    saveCustomTunings(this.customTunings);
    this.render();
  }

  private async deleteTuning(id: string): Promise<void> {
    const tuning = this.customTunings.find((t) => t.id === id);
    if (!tuning || !(await askConfirm(`Delete the tuning “${tuning.name}”?`, 'Delete'))) return;
    this.customTunings = this.customTunings.filter((t) => t.id !== id);
    saveCustomTunings(this.customTunings);
    // Keep tuning to the same notes; they now count as changes to Standard.
    if (this.tuning.id === id) this.tuning = DEFAULT_TUNING;
    this.persist();
    this.render();
  }

  private persist(): void {
    saveSettings({
      tuningId: this.tuning.id,
      notes: this.notes,
      selectedString: this.selected,
      headstock: this.headstock,
    });
  }

  // --- Listening -----------------------------------------------------------------

  private isListening(): boolean {
    return this.mic === 'on' || this.mic === 'starting';
  }

  private async startListening(): Promise<void> {
    if (this.isListening()) return;
    this.setMic('starting');
    let input: AudioInput;
    try {
      input = simParam !== null ? await this.openSimulation() : await openMicrophone();
    } catch (error) {
      console.error(error);
      this.setMic(error instanceof MicPermissionError ? 'denied' : 'error');
      return;
    }
    if (this.mic !== 'starting') {
      input.stop(); // stopped again while the microphone was starting
      return;
    }
    this.input = input;
    this.resetDetection();
    this.timer = window.setInterval(() => this.tick(), READ_INTERVAL_MS);
    this.setMic('on');
    void this.keepScreenOn();
  }

  private stopListening(): void {
    window.clearInterval(this.timer);
    this.input?.stop();
    this.input = null;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
    this.setMic('off');
  }

  private async openSimulation(): Promise<AudioInput> {
    const sim = await openSimulatedInput();
    this.simulate = (targetHz) => sim.setFrequency(targetHz * 2 ** (this.simCents / 1200));
    Object.assign(window, { petunerSim: (cents: number) => (this.simCents = cents) });
    return sim;
  }

  private async keepScreenOn(): Promise<void> {
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      // Not supported or not allowed; the tuner works without it.
    }
  }

  private resetDetection(): void {
    this.smoother.reset();
    this.tracker.reset();
    if (this.mic === 'on') this.showMessage();
  }

  private tick(): void {
    if (!this.input) return;
    const now = performance.now();
    const targetHz = midiToFrequency(this.notes[this.selected]);
    this.simulate?.(targetHz);

    this.input.read(this.samples);
    const { minHz, maxHz } = searchBand(targetHz);
    const pitch = detectPitch(this.samples, this.input.sampleRate, minHz, maxHz);
    const frequency = this.smoother.push(pitch?.frequency ?? null, now);

    if (frequency === null) {
      this.tracker.update(null, now);
      this.showMessage();
      return;
    }
    const feedback = evaluate(frequency, targetHz);
    this.meter.showReading(feedback, frequency);
    if (this.tracker.update(feedback.inTune, now) && !this.tuned[this.selected]) {
      this.tuned[this.selected] = true;
      this.renderHeadstock();
    }
  }

  private setMic(state: MicState): void {
    this.mic = state;
    this.micButton.dataset.state = state;
    this.micButton.setAttribute('aria-pressed', String(this.isListening()));
    this.micButton.setAttribute('aria-label', this.isListening() ? 'Stop listening' : 'Start listening');
    this.showMessage();
  }

  /** The meter text whenever there is no pitch reading to show. */
  private showMessage(): void {
    const midi = this.notes[this.selected];
    const target = `Target ${noteName(midi, this.tuning.flats)} · ${midiToFrequency(midi).toFixed(1)} Hz`;
    switch (this.mic) {
      case 'off':
        return this.meter.showIdle('Tap a peg to start listening', target);
      case 'starting':
        return this.meter.showIdle('Starting microphone…', target);
      case 'denied':
        return this.meter.showIdle(
          'Microphone access is blocked',
          'Allow microphone access for PeTuner in your browser or phone settings, then tap the mic button.',
        );
      case 'error':
        return this.meter.showIdle('Could not start the microphone', 'Tap the mic button to try again.');
      case 'on':
        return this.meter.showIdle(`Play the ${STRING_NAMES[this.selected]} string`, target, 'waiting');
    }
  }

  // --- Rendering -------------------------------------------------------------------

  private render(): void {
    this.renderTuningSelect();
    this.renderHeadstock();
    this.renderTarget();
    this.renderActions();
    if (!this.input) this.showMessage();
  }

  private renderTuningSelect(): void {
    const group = (label: string, tunings: readonly Tuning[]) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = label;
      for (const t of tunings) {
        optgroup.append(new Option(`${t.name} · ${describeNotes(t.notes, t.flats)}`, t.id));
      }
      return optgroup;
    };
    this.tuningSelect.replaceChildren(group('Presets', PRESETS));
    if (this.customTunings.length) this.tuningSelect.append(group('My tunings', this.customTunings));
    this.tuningSelect.value = this.tuning.id;
  }

  private renderHeadstock(): void {
    renderHeadstock(this.headstockView, {
      layout: this.headstock,
      notes: this.notes,
      flats: this.tuning.flats,
      selected: this.selected,
      tuned: this.tuned,
    });
  }

  private renderTarget(): void {
    const name = STRING_NAMES[this.selected];
    this.stringLabel.textContent = `${name[0].toUpperCase()}${name.slice(1)} string`;
    this.targetSelect.replaceChildren(
      ...allowedNotes(this.selected).map((midi) => {
        const standard = midi === STANDARD_NOTES[this.selected] ? ' (standard)' : '';
        return new Option(`${noteNameBothSpellings(midi)}${standard}`, String(midi));
      }),
    );
    this.targetSelect.value = String(this.notes[this.selected]);
  }

  private renderActions(): void {
    if (sameNotes(this.notes, this.tuning.notes)) {
      this.actions.hidden = true;
      return;
    }
    this.actions.hidden = false;
    const save = this.tuning.custom
      ? '<button class="button primary small" data-action="save">Save</button>' +
        '<button class="button secondary small" data-action="save-new">Save as new…</button>'
      : '<button class="button primary small" data-action="save-new">Save as custom…</button>';
    this.actions.innerHTML = `
      <span class="muted changed-from"></span>
      <div class="action-buttons">
        <button class="button secondary small" data-action="reset">Reset</button>${save}
      </div>`;
    this.actions.querySelector('.changed-from')!.textContent = `Changed from ${this.tuning.name}`;
  }
}
