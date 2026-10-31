/**
 * Service worker handling. The service worker keeps a copy of the app on the
 * phone so it runs offline. A new version is only switched to when the user
 * presses "Check for updates" - never automatically.
 */

export type UpdateResult = 'unavailable' | 'offline' | 'up-to-date' | 'updating' | 'failed';

let registration: ServiceWorkerRegistration | null = null;

/** Registers the service worker; `onUpdateReady` fires if the browser already fetched a newer version. */
export function registerServiceWorker(onUpdateReady: () => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          // With no controller this is the very first install, not an update.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady();
        });
      });
    })
    .catch((error) => console.warn('Service worker registration failed', error));
}

/** Looks for a newer version online and, if there is one, installs it and reloads the app. */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (!registration) return 'unavailable';

  if (!registration.waiting) {
    if (!navigator.onLine) return 'offline';
    try {
      await registration.update();
    } catch {
      return 'offline';
    }
    const installing = registration.installing;
    if (installing && (await finishedInstalling(installing)) === 'redundant') return 'failed';
  }

  const waiting = registration.waiting;
  if (!waiting) return 'up-to-date';

  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return 'updating';
}

function finishedInstalling(worker: ServiceWorker): Promise<ServiceWorkerState> {
  return new Promise((resolve) => {
    if (worker.state !== 'installing') return resolve(worker.state);
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installing') resolve(worker.state);
    });
  });
}
