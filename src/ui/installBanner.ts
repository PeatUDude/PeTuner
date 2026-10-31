/** Chrome's install prompt event; not in TypeScript's DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const SHARE_ICON =
  '<svg class="inline-icon" viewBox="0 0 24 24" aria-label="Share"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1"/></svg>';

function isInstalled(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPads report themselves as Macs, but Macs have no touch screen.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** Shows how to install the app when it is opened in a normal browser tab. */
export function setupInstallBanner(banner: HTMLElement): void {
  if (isInstalled()) return;

  const show = (html: string) => {
    banner.innerHTML = `<div class="banner-text">${html}</div><button class="icon-button banner-close" aria-label="Dismiss">✕</button>`;
    banner.querySelector('.banner-close')!.addEventListener('click', () => (banner.hidden = true));
    banner.hidden = false;
  };

  if (isIos()) {
    show(
      `<strong>Install PeTuner:</strong> tap Share ${SHARE_ICON} and choose <strong>“Add to Home Screen”</strong>. ` +
        'Then open it once from your Home Screen while online, and it works offline from then on.',
    );
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    const installEvent = event as BeforeInstallPromptEvent;
    show('<strong>Install PeTuner</strong> to use it offline, like a normal app. <button class="button primary small banner-install">Install</button>');
    banner.querySelector('.banner-install')!.addEventListener('click', async () => {
      banner.hidden = true;
      await installEvent.prompt();
    });
  });
  window.addEventListener('appinstalled', () => (banner.hidden = true));
}
