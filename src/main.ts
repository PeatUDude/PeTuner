import './styles.css';
import { App } from './app';
import { registerServiceWorker } from './pwa/updates';
import { setupInstallBanner } from './ui/installBanner';

const app = new App();
setupInstallBanner(document.querySelector<HTMLElement>('#install-banner')!);
registerServiceWorker(() => app.updateReady());
