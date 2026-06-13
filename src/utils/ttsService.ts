import * as Speech from 'expo-speech';

export async function speak(text: string): Promise<void> {
  try {
    Speech.stop();
    Speech.speak(text, { language: 'en-US', pitch: 1.0, rate: 0.88 });
  } catch (e) { console.warn('speak error:', e); }
}

export async function stopSpeech() {
  try { Speech.stop(); } catch {}
}

export function buildExerciseAnnouncement(ex: any): string {
  let text = ex.name.replace(' — Left', ', left side').replace(' — Right', ', right side');
  if (ex.type === 'sets' && ex.sets && ex.reps) {
    const w = ex.weight > 0 ? `, ${ex.weight} pounds` : ', bodyweight';
    text += `. ${ex.sets} sets of ${ex.reps} reps${w}.`;
  } else if (ex.type === 'time' && ex.duration) {
    const m = Math.floor(ex.duration / 60);
    const s = ex.duration % 60;
    if (m > 0 && s > 0) text += `. ${m} minute${m > 1 ? 's' : ''} ${s} seconds.`;
    else if (m > 0) text += `. ${m} minute${m > 1 ? 's' : ''}.`;
    else text += `. ${s} seconds.`;
  }
  return text;
}

export function buildIntervalAnnouncement(round: number, total: number, isWork: boolean, label: string): string {
  return isWork ? `Interval ${round} of ${total}. ${label}.` : `Rest. ${label}.`;
}

export function buildAnnouncement(ex: any): string {
  let text = ex.name || '';
  if (ex.type === 'sets' && ex.sets && ex.reps) {
    const weightStr = ex.weight > 0 ? `, ${ex.weight} pounds` : ', bodyweight';
    text += `. ${ex.sets} sets of ${ex.reps} reps${weightStr}.`;
  } else if (ex.type === 'time' && ex.duration) {
    const mins = Math.floor(ex.duration / 60);
    const secs = ex.duration % 60;
    if (mins > 0 && secs > 0) text += `. ${mins} minute${mins !== 1 ? 's' : ''} ${secs} seconds.`;
    else if (mins > 0) text += `. ${mins} minute${mins !== 1 ? 's' : ''}.`;
    else text += `. ${secs} seconds.`;
  }
  if (ex.tabata) text += ' Tabata style.';
  return text;
}

// Bell sound disabled pending expo-audio hooks migration
// Will be re-enabled via a dedicated audio component in the workout player
export async function playBell(): Promise<void> {
  // no-op
}
