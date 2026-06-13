/**
 * ttsCache.ts
 * Natural voice TTS using expo-speech.
 * Falls back gracefully if voice unavailable.
 */
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';

export async function speak(text: string): Promise<void> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const maleVoice = voices.find(v =>
      v.language.startsWith('en') &&
      (v.identifier.includes('Daniel') ||
       v.identifier.includes('Aaron') ||
       v.identifier.includes('Fred') ||
       v.identifier.includes('Alex') ||
       v.identifier.includes('Tom'))
    ) || voices.find(v => v.language.startsWith('en'));

    Speech.speak(text, {
      language: 'en-US',
      pitch: 0.92,
      rate: 0.85,
      voice: maleVoice?.identifier,
    });
  } catch {
    Speech.speak(text, { language: 'en-US', pitch: 0.92, rate: 0.85 });
  }
}

export async function stopSpeech() {
  Speech.stop();
}

export function buildExerciseAnnouncement(ex: any): string {
  let text = ex.name;
  if (ex.type === 'sets' && ex.sets && ex.reps) {
    const weightStr = ex.weight > 0 ? `, ${ex.weight} pounds` : ', bodyweight';
    text += `. ${ex.sets} sets of ${ex.reps} reps${weightStr}.`;
  } else if (ex.type === 'time' && ex.duration) {
    const mins = Math.floor(ex.duration / 60);
    const secs = ex.duration % 60;
    if (mins > 0 && secs > 0) text += `. ${mins} minute${mins > 1 ? 's' : ''} ${secs} seconds.`;
    else if (mins > 0) text += `. ${mins} minute${mins > 1 ? 's' : ''}.`;
    else text += `. ${secs} seconds.`;
  }
  return text;
}

export function buildIntervalAnnouncement(round: number, total: number, isWork: boolean, label: string): string {
  if (isWork) return `Interval ${round} of ${total}. ${label}.`;
  return `Rest. ${label}.`;
}
