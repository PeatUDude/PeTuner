import { describeNotes, type Tuning } from '../music/tunings';
import { checkForUpdate, type UpdateResult } from '../pwa/updates';
import type { HeadstockLayout } from '../storage';

export interface SettingsActions {
  headstock(): HeadstockLayout;
  setHeadstock(layout: HeadstockLayout): void;
  customTunings(): readonly Tuning[];
  renameTuning(id: string): Promise<void>;
  deleteTuning(id: string): Promise<void>;
}

const UPDATE_MESSAGES: Record<UpdateResult, string> = {
  unavailable: 'Updates work in the installed app (not in development mode).',
  offline: 'No internet connection. Try again when you are online.',
  'up-to-date': 'You have the latest version.',
  updating: 'Installing the new version…',
  failed: 'The update could not be downloaded. Please try again.',
};

/** The ⚙ sheet: headstock layout, custom tunings, updates and about. */
export class SettingsDialog {
  private readonly list: HTMLElement;
  private readonly updateButton: HTMLButtonElement;
  private readonly updateStatus: HTMLElement;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly actions: SettingsActions,
  ) {
    this.list = dialog.querySelector('#custom-tunings')!;
    this.updateButton = dialog.querySelector('#update-button')!;
    this.updateStatus = dialog.querySelector('#update-status')!;
    dialog.querySelector('#app-version')!.textContent = `${__APP_VERSION__} (${__BUILD_DATE__})`;

    dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
    // Tapping the dimmed backdrop closes the sheet.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });

    dialog.querySelectorAll<HTMLInputElement>('input[name="headstock"]').forEach((radio) => {
      radio.addEventListener('change', () => radio.checked && actions.setHeadstock(radio.value as HeadstockLayout));
    });

    this.list.addEventListener('click', async (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      const id = button.closest<HTMLElement>('[data-id]')!.dataset.id!;
      if (button.dataset.action === 'rename') await actions.renameTuning(id);
      else await actions.deleteTuning(id);
      this.renderTunings();
    });

    this.updateButton.addEventListener('click', () => this.runUpdate());
  }

  open(): void {
    const layout = this.actions.headstock();
    this.dialog.querySelectorAll<HTMLInputElement>('input[name="headstock"]').forEach((radio) => {
      radio.checked = radio.value === layout;
    });
    this.renderTunings();
    this.dialog.showModal();
  }

  /** Called when the browser has already downloaded a newer version in the background. */
  markUpdateReady(): void {
    this.updateButton.textContent = 'Install update';
    this.updateStatus.textContent = 'A new version is ready to install.';
  }

  private async runUpdate(): Promise<void> {
    this.updateButton.disabled = true;
    this.updateStatus.textContent = 'Checking…';
    const result = await checkForUpdate();
    this.updateStatus.textContent = UPDATE_MESSAGES[result];
    if (result !== 'updating') this.updateButton.disabled = false;
  }

  private renderTunings(): void {
    const tunings = this.actions.customTunings();
    if (tunings.length === 0) {
      this.list.innerHTML =
        '<li class="muted empty">No custom tunings yet. Change a string’s target note, then tap “Save as custom…”.</li>';
      return;
    }
    this.list.replaceChildren(
      ...tunings.map((tuning) => {
        const item = document.createElement('li');
        item.dataset.id = tuning.id;
        item.innerHTML = `
          <div class="tuning-info"><span class="tuning-name"></span><span class="tuning-notes muted"></span></div>
          <button class="button secondary small" data-action="rename">Rename</button>
          <button class="button danger small" data-action="delete">Delete</button>`;
        item.querySelector('.tuning-name')!.textContent = tuning.name;
        item.querySelector('.tuning-notes')!.textContent = describeNotes(tuning.notes, tuning.flats);
        return item;
      }),
    );
  }
}
