# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

This is a React Native/Expo SDK 56 app (bundle com.sjadallah.forge54, EAS project d167183b-1d95-4219-ba06-e872b4ce47c2).

## Status (2026-09-26)

- **Installs:** `.npmrc` sets `legacy-peer-deps=true` (React 19.2.x peer conflicts), so a plain `npm install` works locally. `eas.json` also sets `NPM_CONFIG_LEGACY_PEER_DEPS` for both `preview` and `production`.
- **Audio:** `expo-av` is gone, but `expo-audio` **is** used — `src/utils/ttsService.ts` plays bundled TTS clips (`assets/tts/`, manifest `ttsManifest.generated.ts`) and the bell via `createAudioPlayer`. Countdown cues ("3", "2", "1") use preloaded long-lived players (`preloadCues`/`speakCue`) playing onset-aligned WAVs in `assets/tts/cues/` — rerun `python3 scripts/alignCountdownCues.py` after regenerating those clips. Audio mode is `mixWithOthers`: never duck the user's music. Regenerate clips with `scripts/generateTtsAssets.ts` whenever announcement text changes (key in gitignored `.secrets/elevenlabs.key`).
- **Player** (`src/screens/WorkoutPlayerScreen.tsx`): one deadline-driven phase timer (`startPhase`/`pausePhase`/`resumePhase`); no side effects inside state updaters. Unilateral exercises are authored as `(Right)`/`(Left)` pairs in `workouts.json` and merged into one exercise with `sides` by `flattenExercises` — never infer unilateral from the name.
- **Logging:** sessions save planned vs performed sets (`workoutStore.ts`, schema v2); volume counts only `completed && !skipped` sets.
- There is no error boundary in `app/_layout.tsx`.
- **Local simulator:** this Mac's Xcode 27 install has no `Simulator.app`, so `expo start --ios` fails. Run `npx expo start`, then `xcrun simctl openurl booted exp://127.0.0.1:8081`.
- **Repo location:** `~/Desktop` is iCloud-synced and has produced duplicate files inside `.git` (e.g. `refs/heads/main 2`). If git reports "bad object … 2", move that duplicate out of `.git`.
- The untracked `forge54/` directory is a pre-fix backup snapshot (old `expo-av` code), not part of the live app.
