/**
 * Custom entry point — installs a global JS error handler before anything
 * else runs, then hands off to Expo Router's normal entry.
 *
 * Standalone/TestFlight builds turn any uncaught JS exception into a hard
 * native crash (SIGABRT) with no JS-level message in the resulting .ips
 * report — only the native delivery mechanism. This writes the real
 * error message + stack to disk *synchronously* (so it lands before the
 * process can abort) so it can be read back from Settings after the fact.
 */
import { File, Paths } from 'expo-file-system';

declare const ErrorUtils: {
  getGlobalHandler: () => (error: any, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: any, isFatal?: boolean) => void) => void;
};

try {
  const defaultHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      const file = new File(Paths.document, 'last-crash.txt');
      const text =
        `${new Date().toISOString()} isFatal=${String(isFatal)}\n` +
        `${error?.name || 'Error'}: ${error?.message || String(error)}\n` +
        `${error?.stack || '(no stack)'}\n`;
      file.write(text);
    } catch {
      // Nothing more we can do if even this fails.
    }
    defaultHandler(error, isFatal);
  });
} catch {
  // ErrorUtils not available for some reason — proceed without the safety net
  // rather than block app boot over a diagnostic feature.
}

require('expo-router/entry');
