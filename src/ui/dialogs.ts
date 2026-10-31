export interface TextPrompt {
  title: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  maxLength?: number;
  /** Returns an error message to keep the dialog open, or null to accept. */
  validate?: (value: string) => string | null;
}

/** Asks for a line of text. Resolves to the trimmed text, or null if cancelled. */
export function askText(prompt: TextPrompt): Promise<string | null> {
  const dialog = document.querySelector<HTMLDialogElement>('#text-dialog')!;
  const form = dialog.querySelector('form')!;
  const input = dialog.querySelector<HTMLInputElement>('input')!;
  const error = dialog.querySelector<HTMLElement>('.dialog-error')!;

  dialog.querySelector('.dialog-title')!.textContent = prompt.title;
  dialog.querySelector('.dialog-label')!.textContent = prompt.label;
  dialog.querySelector('.dialog-confirm')!.textContent = prompt.confirmLabel;
  input.value = prompt.initial ?? '';
  input.maxLength = prompt.maxLength ?? 100;
  error.textContent = '';

  return new Promise((resolve) => {
    const onSubmit = (event: SubmitEvent) => {
      if ((event.submitter as HTMLButtonElement | null)?.value !== 'ok') return;
      const problem = prompt.validate?.(input.value) ?? null;
      if (problem) {
        event.preventDefault();
        error.textContent = problem;
        input.focus();
      }
    };
    const onInput = () => (error.textContent = '');
    form.addEventListener('submit', onSubmit);
    input.addEventListener('input', onInput);
    dialog.addEventListener(
      'close',
      () => {
        form.removeEventListener('submit', onSubmit);
        input.removeEventListener('input', onInput);
        resolve(dialog.returnValue === 'ok' ? input.value.trim() : null);
      },
      { once: true },
    );
    dialog.returnValue = '';
    dialog.showModal();
    input.focus();
    input.select();
  });
}

/** Asks a yes/no question. Resolves to true if confirmed. */
export function askConfirm(message: string, confirmLabel: string): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;
  dialog.querySelector('.dialog-message')!.textContent = message;
  dialog.querySelector('.dialog-confirm')!.textContent = confirmLabel;

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.returnValue = '';
    dialog.showModal();
  });
}
