// Run: npx tsx scripts/testSpeechFragments.ts
// Every announcement a generated plan can make must split into recorded
// pieces, or the player falls back to the phone's voice for it.
import { generatePlan, generateTravelWorkouts, parseEquipment, noGear, travelGear } from '../src/utils/planGenerator';
import type { PlanInputs } from '../src/utils/planGenerator';
import { flattenExercises, buildExerciseAnnouncementText, emomMinuteText } from '../src/utils/workoutAnnouncements';
import { speechFragments, fragmentVocabulary } from '../src/utils/speechFragments';
import * as fs from 'fs';
import * as path from 'path';

// The manifest require()s MP3s, which Node can't load: read its keys as text.
const manifestSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'ttsManifest.generated.ts'), 'utf8');
const RECORDED = new Set([...manifestSrc.matchAll(/^  ("(?:[^"\\]|\\.)*"): require/gm)].map(m => JSON.parse(m[1]) as string));

const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };

assert(speechFragments('DB Front Squat. 4 sets of 10 reps, 15 pounds.').join('|') === 'DB Front Squat|4 sets of 10 reps|15 pounds', 'splits sentences and commas');
assert(speechFragments('Pigeon Pose, each side. 45 seconds.').join('|') === 'Pigeon Pose|each side|45 seconds', 'each side');
assert(speechFragments('Easy Row. 2 minutes 30 seconds.').join('|') === 'Easy Row|2 minutes|30 seconds', 'minutes and seconds');
assert(speechFragments('Minute 3 of 24. KB Swing. 15 reps.').join('|') === 'Minute 3|of 24|KB Swing|15 reps', 'EMOM minute');

const HOME = ['Bench', '5lb DB', '8lb DB', '10lb DB', '15lb DB', '20lb DB', '25lb DB', '20lb KB', '35lb KB', '50lb KB',
  'Pull-Up Bar', 'TRX Straps', '50lb Sandbag', '25lb Weighted Vest', 'Ruck Sack', 'Rowing Machine', 'Plyo Box',
  'Kickboxing Bag', 'Resistance Bands', 'Jump Rope', 'Bike Trainer', 'Treadmill'];
const vocab = new Set(fragmentVocabulary());
const missing = new Map<string, string>();
const texts = new Set<string>();
const collect = (workouts: any[]) => {
  for (const wo of workouts) for (const ex of flattenExercises(wo)) {
    texts.add(buildExerciseAnnouncementText(ex));
    if (ex.restAfter > 0) texts.add(`Rest. ${ex.restAfter} seconds.`);
    if (ex.type === 'block' && ex.blockKind === 'emom') {
      const n = Math.round(ex.totalSec / ex.intervalSec);
      for (let m = 0; m < n; m++) texts.add(emomMinuteText(m + 1, n, ex.movements[m % ex.movements.length]));
    }
  }
};
const types = [['strength'], ['hiit'], ['crossfit'], ['cardio'], ['mixed'], ['bodyweight'], ['strength', 'cardio']] as any[];
for (const gear of [parseEquipment(HOME), noGear(), parseEquipment(['Dumbbells', 'Kettlebell'])]) {
  for (const sessionMinutes of [15, 20, 30, 45, 60, 75]) {
    for (const workoutTypes of types) {
      for (const age of [40, 65]) {
        const inputs: PlanInputs = { age, workoutTypes, sessionMinutes, programLengthWeeks: 6, gear };
        for (const seed of [1, 2, 3]) collect(generatePlan(inputs, seed).weeks.flatMap(w => w.workouts));
      }
    }
  }
}
for (const setup of ['gym', 'room', 'bodyweight'] as const) {
  collect(generateTravelWorkouts({ age: 50, workoutTypes: ['mixed'], sessionMinutes: 30, programLengthWeeks: 6, gear: travelGear(setup, ['bands', 'trx', 'jumprope']) }, 5));
}
for (const t of texts) {
  if (RECORDED.has(t)) continue;
  for (const f of speechFragments(t)) if (!vocab.has(f)) missing.set(f, t);
}
assert(missing.size === 0, `every generated announcement splits into recorded pieces (${texts.size} phrases)` +
  [...missing].slice(0, 15).map(([f, t]) => `\n   missing "${f}" in "${t}"`).join(''));

// Recording coverage (only meaningful after scripts/generateTtsAssets.ts runs).
const unrecorded = [...vocab].filter(v => !RECORDED.has(v));
assert(unrecorded.length === 0, `every piece has a recording (${unrecorded.length} of ${vocab.size} missing)`);
