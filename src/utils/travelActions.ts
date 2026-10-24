import { Alert } from 'react-native';
import { endTravel, getTravel, travelWeeksAway } from '../store/settingsStore';

// Shared "End travel" flow (Travel screen, Settings, Home). For a trip of a
// week or more, offers to push the program back so you resume where you left.
export async function confirmEndTravel(onDone: () => void) {
  const t = await getTravel();
  const weeks = travelWeeksAway(t.since);
  if (weeks === 0) {
    await endTravel(false);
    onDone();
    return;
  }
  Alert.alert(
    'Welcome back',
    `You were away about ${weeks} week${weeks > 1 ? 's' : ''}. Push your program back ${weeks} week${weeks > 1 ? 's' : ''} so you pick up where you left off?`,
    [
      { text: `Push back ${weeks} wk`, onPress: async () => { await endTravel(true); onDone(); } },
      { text: 'Keep schedule', onPress: async () => { await endTravel(false); onDone(); } },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
}
