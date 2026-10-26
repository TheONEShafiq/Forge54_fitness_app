import { Alert } from 'react-native';
import { rebuildPlan } from '../store/planStore';

// Shared "Rebuild your plan?" flow (Settings saves, Home's out-of-date banner).
// `onDone(rebuilt)` runs either way so callers can refresh what they show.
export function confirmRebuildPlan(onDone: (rebuilt: boolean) => void, what = 'Your settings changed') {
  Alert.alert(
    'Rebuild your plan?',
    `${what}. Forge will build a new plan to match, starting week 1 today. Your logged sessions and benchmarks stay in Progress.`,
    [
      { text: 'Not now', style: 'cancel', onPress: () => onDone(false) },
      { text: 'Rebuild plan', onPress: async () => { await rebuildPlan(); onDone(true); } },
    ],
  );
}
