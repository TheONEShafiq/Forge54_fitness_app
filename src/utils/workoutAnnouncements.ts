// Single source of truth for every string the app can ever hand to the voice
// layer. WorkoutPlayerScreen.tsx uses these at runtime; scripts/generateTtsAssets.ts
// uses the same functions to pre-render audio for every possible phrase, so the
// two can never drift out of sync.
import workoutData from '../../workouts.json';
import { resolveWorkout } from './workoutResolver';

// ── Rest durations by block type (seconds) — fallback only ───────────────────
export const REST_BY_TYPE: Record<string, number> = {
  tabata: 10,        // Tabata: strict 10s rest
  hiit: 20,          // HIIT: short rest
  conditioning: 30,  // Conditioning circuits
  strength: 60,      // Strength blocks
  functional: 45,    // Functional circuits
  warmup: 0,         // No rest in warmup
  cooldown: 0,       // No rest in cooldown
};

export function getRestDuration(sectionName: string, workoutType: string): number {
  const s = sectionName.toLowerCase();
  if (s.includes('tabata')) return REST_BY_TYPE.tabata;
  if (s.includes('hiit') || s.includes('emom') || s.includes('amrap')) return REST_BY_TYPE.hiit;
  if (s.includes('warm') || s.includes('cool')) return 0;
  if (workoutType === 'conditioning') return REST_BY_TYPE.conditioning;
  if (workoutType === 'functional') return REST_BY_TYPE.functional;
  return REST_BY_TYPE.strength;
}

// ── Tabata & Interval definitions ─────────────────────────────────────────────
export interface IntervalDef {
  rounds: number; workSec: number; restSec: number;
  workLabel: string; restLabel: string; isTabata?: boolean;
}
export const INTERVAL_MAP: Record<string, IntervalDef> = {
  // True Tabata — 20s work / 10s rest / 8 rounds
  'Row Sprints (Tabata)':  { rounds:8, workSec:20, restSec:10, workLabel:'Max effort — all out', restLabel:'10 seconds rest', isTabata:true },
  'Box Jumps (Tabata)':    { rounds:8, workSec:20, restSec:10, workLabel:'Explode — max height', restLabel:'10 seconds rest', isTabata:true },
  'Bag Strikes (Tabata)':  { rounds:8, workSec:20, restSec:10, workLabel:'Max combos', restLabel:'10 seconds rest', isTabata:true },
  'Jump Rope (Tabata)':    { rounds:8, workSec:20, restSec:10, workLabel:'Max speed', restLabel:'10 seconds rest', isTabata:true },
  // HIIT intervals
  'Bike Intervals':        { rounds:5, workSec:90, restSec:90, workLabel:'Go hard — Zone 4', restLabel:'Easy spin, recover' },
  'Row Intervals':         { rounds:5, workSec:90, restSec:90, workLabel:'Max effort row', restLabel:'Easy row, recover' },
  'Run Intervals':         { rounds:5, workSec:90, restSec:90, workLabel:'Hard run', restLabel:'Walk or easy jog' },
  'Row Sprint':            { rounds:4, workSec:45, restSec:75, workLabel:'Sprint', restLabel:'Rest' },
  'Jump Rope Fast':        { rounds:4, workSec:30, restSec:30, workLabel:'Max speed', restLabel:'Rest' },
  'Jump Rope Intervals':   { rounds:5, workSec:60, restSec:60, workLabel:'Fast skip', restLabel:'Easy skip' },
  'Row Pyramid':           { rounds:5, workSec:60, restSec:30, workLabel:'Hard effort', restLabel:'Easy recovery' },
  'Sprint Run':            { rounds:6, workSec:20, restSec:40, workLabel:'All-out sprint', restLabel:'Walk back' },
};

// ── Unilateral detection ──────────────────────────────────────────────────────
export const UNI_KEYWORDS = [
  'single-arm','single arm','single-leg','single leg','rdl','lunge',
  'step-up','step up','hip flexor','pigeon','figure-4','figure 4',
  'hamstring stretch','quad stretch','lizard','90/90','band shoulder',
  'leg swing','doorway','couch stretch','carry','row',
];
export function isUnilateral(name: string) {
  const n = name.toLowerCase();
  return UNI_KEYWORDS.some(u => n.includes(u));
}

// ── Substitutions ─────────────────────────────────────────────────────────────
export const SUBS: Record<string, any[]> = {
  'Easy Bike': [
    { name:'Easy Row', type:'time', duration:180, phase:'warmup', cue:'Easy Zone 2 row. Long strokes, breathe.' },
    { name:'Easy Run', type:'time', duration:180, phase:'warmup', cue:'Easy jog warm-up. Conversational pace.' },
    { name:'Jump Rope Easy', type:'time', duration:180, phase:'warmup', cue:'Easy skip. Get blood moving.' },
  ],
  'Bike Intervals': [
    { name:'Row Intervals', type:'time', duration:900, phase:'work', cue:'5 rounds: 90 sec hard row, 90 sec easy.' },
    { name:'Run Intervals', type:'time', duration:900, phase:'work', cue:'5 rounds: 90 sec hard run, 90 sec walk.' },
    { name:'Jump Rope Intervals', type:'time', duration:900, phase:'work', cue:'5 rounds: 60 sec fast, 60 sec rest.' },
  ],
  'Row Sprint': [
    { name:'Bike Sprint', type:'time', duration:45, phase:'work', cue:'Max effort bike 45 sec.' },
    { name:'Sprint Run', type:'time', duration:45, phase:'work', cue:'All-out sprint 45 sec. Drive arms.' },
    { name:'Jump Rope Sprint', type:'time', duration:45, phase:'work', cue:'Max speed jump rope 45 sec.' },
  ],
  'Easy Row': [
    { name:'Easy Bike', type:'time', duration:120, phase:'warmup', cue:'Easy Zone 2 bike. Spin loose.' },
    { name:'Easy Run', type:'time', duration:120, phase:'warmup', cue:'Easy jog warm-up. Relax.' },
  ],
  'Box Jump': [
    { name:'Box Step-Up Fast', type:'sets', sets:4, reps:12, weight:0, phase:'work', cue:'Fast alternating step-ups. High knees.' },
    { name:'Jump Squat', type:'sets', sets:4, reps:10, weight:0, phase:'work', cue:'Squat down, explode up. Land soft.' },
  ],
  'default': [
    { name:'Band Pull-Apart', type:'sets', sets:3, reps:15, weight:0, phase:'work', cue:'Pull band apart to chest. Squeeze blades.' },
    { name:'Dead Bug', type:'sets', sets:3, reps:10, weight:0, phase:'work', cue:'On back. Lower opposite arm/leg. Press low back down.' },
    { name:'Easy Run', type:'time', duration:300, phase:'work', cue:'5 min easy run as substitute.' },
  ],
};
export function getSubs(name: string) { return SUBS[name] || SUBS['default']; }

// ── Flatten — unilateral cooldown stretches split L/R ─────────────────────────
export function flattenExercises(workout: any) {
  const exs: any[] = [];
  workout.sections.forEach((s: any) => {
    const phase = s.name.toLowerCase().includes('warm') ? 'warmup' :
                  s.name.toLowerCase().includes('cool') ? 'cooldown' : 'work';
    const fallbackRestSec = getRestDuration(s.name, workout.type);
    s.exercises.forEach((ex: any) => {
      // Prefer the rest value the program author wrote for this exercise;
      // only fall back to the section/type heuristic when none was given.
      const restSec = typeof ex.rest === 'number' ? ex.rest : fallbackRestSec;
      if (phase === 'cooldown' && isUnilateral(ex.name) && ex.type === 'time') {
        exs.push({ ...ex, phase, sectionName: s.name, restAfter: 0, side: 'Left', displayName: ex.name + ' — Left' });
        exs.push({ ...ex, phase, sectionName: s.name, restAfter: 0, side: 'Right', displayName: ex.name + ' — Right' });
      } else {
        exs.push({ ...ex, phase, sectionName: s.name, restAfter: restSec, displayName: ex.name });
      }
    });
  });
  return exs;
}

// ── Pure text builder (no side effects — safe to call from a Node script) ────
export function buildExerciseAnnouncementText(ex: any): string {
  let text = ex.displayName || ex.name;
  if (ex.side) text = ex.name + ', ' + ex.side + ' side';
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

// Fixed phrases spoken outside of any per-exercise announcement.
export const FIXED_PHRASES = [
  '3', '2', '1',
  'Skipping rest.',
  'Next set.',
  'All intervals complete. Great work.',
  'Workout complete. Great job today.',
];

// Every string the live app can ever pass to speak(), across every workout in
// the current program plus every swap alternative and interval/rest variant.
// Used both to pre-render audio and to sanity-check coverage.
export function getAllAnnouncementTexts(): string[] {
  const texts = new Set<string>();
  const restSecondsSeen = new Set<number>();

  for (const wo of FIXED_PHRASES) texts.add(wo);

  for (const week of (workoutData as any).weeks) {
    for (const rawWorkout of week.workouts) {
      const workout = resolveWorkout(rawWorkout);
      for (const ex of flattenExercises(workout)) {
        texts.add(buildExerciseAnnouncementText(ex));
        if (ex.restAfter > 0) restSecondsSeen.add(ex.restAfter);
      }
    }
  }

  for (const key of Object.keys(SUBS)) {
    for (const sub of SUBS[key]) {
      texts.add(buildExerciseAnnouncementText(sub));
    }
  }

  for (const seconds of restSecondsSeen) {
    texts.add(`Rest. ${seconds} seconds.`);
  }

  for (const def of Object.values(INTERVAL_MAP)) {
    for (let round = 1; round <= def.rounds; round++) {
      texts.add(`Interval ${round} of ${def.rounds}. ${def.workLabel}.`);
    }
    texts.add(`Rest. ${def.restLabel}.`);
  }

  return Array.from(texts);
}
