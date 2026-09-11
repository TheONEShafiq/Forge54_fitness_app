# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

This is a React Native/Expo SDK 56 app (bundle com.sjadallah.forge54, EAS project d167183b-1d95-4219-ba06-e872b4ce47c2).

## Status (2026-09-10)

The launch crash reported in earlier sessions was fixed by commit `0baada5` ("remove expo-audio/video, silent playBell noop, fix launch crash", 2026-06-13) — the crash traced to `expo-av`, which has since been fully removed. There is no error boundary in `app/_layout.tsx`; none was ever committed despite earlier notes claiming otherwise. Verified working (no crash, Home screen renders with real data) via `expo start` on an iOS simulator on 2026-09-10, against current `main` (`6a4c723`).

`playBell()` in `src/utils/ttsService.ts` is currently a silent no-op (bell sound disabled pending an expo-audio hooks migration).

Local installs require `NPM_CONFIG_LEGACY_PEER_DEPS=true npm install` (React 19.2.x peer conflicts) — `eas.json` only sets this for the `preview` build profile, not `production` or local dev.

The untracked `forge54/` directory at the repo root is a pre-fix snapshot kept as a backup for reference — it still contains the old `expo-av` code and is not part of the live app.
