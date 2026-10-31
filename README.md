# PeTuner

An offline guitar tuner that runs as an installable web app (PWA) on iPhone and Android.
Pick a string, pick the note you want, play it, and PeTuner tells you whether to tune up or down.

- Presets (Standard, Drop D, Half-step down, Full-step down, Drop C, DADGAD, Open G, Open D, Open E)
- Per-string target override (5 semitones down to 2 up) and named custom tunings
- Headstock picker for 3+3 and 6-in-line guitars
- ±50 cent meter, "in tune" within ±5 cents, ✓ once a string holds in tune for a second
- Works fully offline after the first visit; microphone audio never leaves the device
- Updates only when you press **Check for updates** in ⚙ Settings

## Development

Requires [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm run dev        # http://localhost:5173 - open in Chrome or Edge and allow the microphone
npm test           # unit tests (pitch detection is tested with synthesized guitar tones)
npm run build      # production build into dist/
npm run preview    # serve dist/ at http://localhost:4173 (service worker + offline mode active)
npm run icons      # regenerate the icons in public/ from scripts/icons.mjs
```

**No guitar at hand?** In dev mode, add `?sim=<cents>` to the URL (e.g. `http://localhost:5173/?sim=-20`)
to replace the microphone with a synthetic string that many cents off the selected target.
While it runs, `petunerSim(10)` in the browser console changes the offset.

## How it works

| Area | Files |
| --- | --- |
| Notes, presets, custom-tuning rules | `src/music/` |
| Pitch detection (McLeod Pitch Method, searched only near the target note to avoid octave errors) | `src/audio/pitch.ts` |
| Microphone access | `src/audio/listener.ts` |
| Tune up/down decisions, smoothing, ✓ timing | `src/tuner/feedback.ts` |
| Screen: headstock, meter, dialogs, settings, install banner | `src/ui/` |
| Offline caching and the update button | `src/pwa/updates.ts`, `vite.config.ts` |
| App state and wiring | `src/app.ts` |

## Publishing (not done yet)

The plan is a public GitHub repo deployed to GitHub Pages by a GitHub Actions workflow, so friends
can open one link and add PeTuner to their home screen.
