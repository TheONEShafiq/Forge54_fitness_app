// Generated plans announce text that changes with every user ("DB Front Squat.
// 4 sets of 10 reps, 15 pounds."), so those phrases can't each be pre-recorded.
// Instead the phrase is split into short pieces from a fixed vocabulary (move
// names, "4 sets of 10 reps", "15 pounds", ...), each piece is recorded once
// in the app voice, and ttsService plays the pieces back to back. Before
// this, every such phrase fell through to the phone's own voice, which
// sounded like a second speaker next to the recorded cues.
//
// Pure (no React Native) so scripts/generateTtsAssets.ts records exactly the
// pieces the app will ask for.
import { spokenMoveNames } from './planGenerator';

// Splits on sentence and comma breaks, then breaks up the two shapes whose
// combinations are too many to record whole.
export function speechFragments(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[.!?]\s+|,\s+/)) {
    const part = raw.replace(/[.!?]+$/, '').trim();
    if (!part) continue;
    let m = part.match(/^(\d+) (minutes?) (\d+) seconds$/);
    if (m) { out.push(`${m[1]} ${m[2]}`, `${m[3]} seconds`); continue; }
    m = part.match(/^Minute (\d+) of (\d+)$/);
    if (m) { out.push(`Minute ${m[1]}`, `of ${m[2]}`); continue; }
    out.push(part);
  }
  return out;
}

const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

// Every piece a generated workout's announcements can split into. Numbers
// cover what the generator produces (2–6 sets, reps up to 40, weights a home
// gym or hotel rack would have, blocks up to 90 minutes).
export function fragmentVocabulary(): string[] {
  const v = new Set<string>([
    ...spokenMoveNames(),
    'each side', 'bodyweight', 'Rest',
    'Every minute on the minute', 'AMRAP', 'As many rounds as possible', 'For time',
  ]);
  for (const s of range(2, 6)) for (const r of range(1, 40)) v.add(`${s} sets of ${r} reps`);
  for (const r of range(1, 50)) v.add(`${r} reps`);
  for (const w of [...range(1, 100), ...range(105, 300, 5)]) v.add(`${w} pounds`);
  // Rests are said in seconds even past a minute ("Rest. 120 seconds.").
  for (const s of [...range(1, 59), ...range(60, 300, 5)]) v.add(`${s} seconds`);
  for (const m of range(1, 90)) {
    v.add(`${m} minute${m > 1 ? 's' : ''}`);
    v.add(`${m} minute cap`);
    v.add(`Minute ${m}`);
    v.add(`of ${m}`);
  }
  for (const r of range(2, 12)) v.add(`${r} rounds for time`);
  return [...v];
}
