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

// ── Unilateral pairs ──────────────────────────────────────────────────────────
// The program authors each unilateral movement as a "(Right)" entry and a
// "(Left)" entry. Whether an exercise is unilateral comes only from that data —
// never from keywords in the name (which also matched bilateral rows/carries).
export type Side = 'left' | 'right';
const SIDE_SUFFIX = /^(.*) \((Right|Left)\)$/;

// Merges each authored (Right)/(Left) pair into one exercise with `sides` in
// authored order. `perSide` keeps each side's own prescription, since
// progression overrides can differ by side. The second entry's rest is the
// rest after a full set of both sides; there is no rest between sides.
function mergeSidePairs(exercises: any[]): any[] {
  const used = new Set<number>();
  const out: any[] = [];
  exercises.forEach((ex, i) => {
    if (used.has(i)) return;
    const m = ex.name.match(SIDE_SUFFIX);
    if (!m) { out.push(ex); return; }
    const [, base, firstSide] = m;
    const otherName = `${base} (${firstSide === 'Right' ? 'Left' : 'Right'})`;
    const j = exercises.findIndex((o, k) => k > i && !used.has(k) && o.name === otherName && o.type === ex.type);
    if (j < 0) { out.push(ex); return; }
    used.add(j);
    const second = exercises[j];
    const sides: Side[] = firstSide === 'Right' ? ['right', 'left'] : ['left', 'right'];
    const pick = (e: any) => ({ reps: e.reps || 0, weight: e.weight || 0, duration: e.duration || 0 });
    out.push({
      ...ex,
      name: base,
      sets: Math.max(ex.sets || 1, second.sets || 1),
      rest: typeof second.rest === 'number' ? second.rest : ex.rest,
      sides,
      perSide: { [sides[0]]: pick(ex), [sides[1]]: pick(second) },
    });
  });
  return out;
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

// ── Flatten ───────────────────────────────────────────────────────────────────
// Circuit sections (`circuitRounds`, or `tabata` where every exercise has the
// same round count) are expanded into round order: A, B, C → rest → A, B, C.
// Tabata sections whose exercises have different counts ("Russian Twist x4 +
// Side Plank x2") are blocks instead; `"circuit": false` on a section forces
// that. Timed exercises outside circuits repeat once per set. Rep exercises
// outside circuits are unchanged — their sets are rows in the set logger.
function isCircuit(s: any, exercises: any[]): boolean {
  if (s.circuit === false) return false;
  if (s.circuitRounds) return true;
  if (!s.tabata || exercises.length < 2) return false;
  const counts = exercises.map(e => e.sets || 1);
  return counts[0] > 1 && counts.every(c => c === counts[0]);
}

export function flattenExercises(workout: any) {
  const exs: any[] = [];
  workout.sections.forEach((s: any) => {
    const phase = s.name.toLowerCase().includes('warm') ? 'warmup' :
                  s.name.toLowerCase().includes('cool') ? 'cooldown' : 'work';
    const fallbackRestSec = getRestDuration(s.name, workout.type);
    // Prefer the rest value the program author wrote for this exercise;
    // only fall back to the section/type heuristic when none was given.
    const restFor = (ex: any) => typeof ex.rest === 'number' ? ex.rest : fallbackRestSec;
    const base = (ex: any) => ({ ...ex, phase, sectionName: s.name, displayName: ex.name });
    const exercises = mergeSidePairs(s.exercises);

    if (isCircuit(s, exercises)) {
      const rounds = s.circuitRounds || exercises[0].sets || 1;
      const roundRest = s.restBetweenRounds || 0;
      for (let r = 1; r <= rounds; r++) {
        const inRound = exercises.filter(ex => (ex.sets || rounds) >= r);
        inRound.forEach((ex, i) => {
          const lastInRound = i === inRound.length - 1;
          const rest = lastInRound && r < rounds ? Math.max(restFor(ex), roundRest) : restFor(ex);
          // One set per round. `restAfterLast` is the rest after finishing this
          // item — rep exercises otherwise move on with no rest.
          exs.push({ ...base(ex), sets: 1, restAfter: rest, restAfterLast: rest, roundLabel: `Round ${r} of ${rounds}` });
        });
      }
      return;
    }

    exercises.forEach((ex: any) => {
      const sets = ex.sets || 1;
      if (ex.type === 'time' && sets > 1 && !INTERVAL_MAP[ex.name]) {
        for (let n = 1; n <= sets; n++) {
          exs.push({ ...base(ex), sets: 1, restAfter: restFor(ex), roundLabel: `Set ${n} of ${sets}` });
        }
      } else {
        exs.push({ ...base(ex), restAfter: restFor(ex) });
      }
    });
  });
  return exs;
}

// ── Pure text builder (no side effects — safe to call from a Node script) ────
export function buildExerciseAnnouncementText(ex: any): string {
  let text = ex.displayName || ex.name;
  if (ex.sides) text = ex.name + ', each side';
  if (ex.type === 'sets' && ex.sets && ex.reps) {
    const w = ex.weight > 0 ? `, ${ex.weight} pounds` : ', bodyweight';
    text += ex.sets === 1 ? `. ${ex.reps} reps${w}.` : `. ${ex.sets} sets of ${ex.reps} reps${w}.`;
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
  'Switch sides.',
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
