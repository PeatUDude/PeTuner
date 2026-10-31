import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative paths so the app works from any folder, e.g. https://<user>.github.io/<repo>/
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    VitePWA({
      // The app registers the service worker itself and only activates updates when asked to.
      registerType: 'prompt',
      injectRegister: false,
      // Everything (icons included) is precached via workbox.globPatterns below.
      includeManifestIcons: false,
      manifest: {
        name: 'PeTuner',
        short_name: 'PeTuner',
        description: 'Offline guitar tuner',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1220',
        theme_color: '#0f1220',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The plugin adds manifest.webmanifest itself.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
