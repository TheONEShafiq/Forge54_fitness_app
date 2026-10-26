// Program generator — builds a user's training plan from their profile,
// equipment, program length and session length. Pure TypeScript (no React, no
// storage) so it runs in the app and in plain Node tests
// (node --experimental-strip-types scripts/testPlanGenerator.ts).
//
// Output uses the same workout shape as workouts.json, so the player, logging,
// timed blocks (EMOM / AMRAP / For Time) and Progress work unchanged.
// Persistence and "when to rebuild" live in src/store/planStore.ts.

import type { WorkoutType } from '../store/settingsStore';

// ── Gear ──────────────────────────────────────────────────────────────────────
// Free-text equipment ("35lb KB", "Pull-Up Bar") parsed into what the catalog needs.
export interface Gear {
  db: number[]; kb: number[]; sandbag: number[];
  vest: boolean; bench: boolean; pullup: boolean; trx: boolean; bands: boolean;
  rope: boolean; rower: boolean; bike: boolean; treadmill: boolean; box: boolean;
  bag: boolean; ruck: boolean;
}
type GearFlag = Exclude<keyof Gear, 'db' | 'kb' | 'sandbag'>;

export function noGear(): Gear {
  return {
    db: [], kb: [], sandbag: [], vest: false, bench: false, pullup: false, trx: false, bands: false,
    rope: false, rower: false, bike: false, treadmill: false, box: false, bag: false, ruck: false,
  };
}

// Implements listed without a weight ("Dumbbells") get a sensible pair.
const DEFAULT_WEIGHTS = { db: [15, 25], kb: [25, 35], sandbag: [40] };

export function parseEquipment(items: string[]): Gear {
  const g = noGear();
  const add = (list: number[], text: string, fallback: number[]) => {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|#|pound)?/i);
    for (const w of m ? [Math.round(parseFloat(m[1]))] : fallback) if (!list.includes(w)) list.push(w);
  };
  for (const raw of items) {
    const t = raw.toLowerCase();
    if (/sand\s*bag/.test(t)) add(g.sandbag, t, DEFAULT_WEIGHTS.sandbag);
    else if (/\bdbs?\b|dumbbell/.test(t)) add(g.db, t, DEFAULT_WEIGHTS.db);
    else if (/\bkbs?\b|kettlebell/.test(t)) add(g.kb, t, DEFAULT_WEIGHTS.kb);
    else if (/vest/.test(t)) g.vest = true;
    else if (/bench/.test(t)) g.bench = true;
    else if (/pull-?\s?up|chin-?\s?up/.test(t)) g.pullup = true;
    else if (/trx|suspension/.test(t)) g.trx = true;
    else if (/band/.test(t)) g.bands = true;
    else if (/jump\s*rope|skipping/.test(t)) g.rope = true;
    else if (/row(ing|er)/.test(t)) g.rower = true;
    else if (/bike|cycle|spin/.test(t)) g.bike = true;
    else if (/treadmill/.test(t)) g.treadmill = true;
    // Before "box": "kickboxing bag" is a bag, not a plyo box.
    else if (/punch|boxing|heavy bag/.test(t)) g.bag = true;
    else if (/\bbox\b|plyo|step/.test(t)) g.box = true;
    else if (/ruck|backpack/.test(t)) g.ruck = true;
  }
  g.db.sort((a, b) => a - b);
  g.kb.sort((a, b) => a - b);
  g.sandbag.sort((a, b) => a - b);
  return g;
}

// ── Travel gear ───────────────────────────────────────────────────────────────
// Mirrors travelLibrary's setups: a hotel gym is assumed to have a dumbbell
// rack, a bench and a treadmill or bike; a room has only what was packed.
export type TravelSetup = 'gym' | 'room' | 'bodyweight';
export type TravelGear = 'bands' | 'trx' | 'jumprope';

export function travelGear(setup: TravelSetup, packed: TravelGear[]): Gear {
  const g = noGear();
  if (setup === 'bodyweight') return g;
  if (packed.includes('bands')) g.bands = true;
  if (packed.includes('trx')) g.trx = true;
  if (packed.includes('jumprope')) g.rope = true;
  if (setup === 'gym') {
    g.db = [10, 15, 20, 25, 30, 35, 40, 45, 50];
    g.bench = true;
    g.treadmill = true;
    g.bike = true;
  }
  return g;
}

// ── Exercise catalog ──────────────────────────────────────────────────────────
type Pattern = 'squat' | 'hinge' | 'lunge' | 'push' | 'pull' | 'core' | 'carry' | 'power' | 'conditioning';
type Load = 'db' | 'kb' | 'sandbag' | 'vest';
type Role = 'heavy' | 'medium' | 'light';

interface CatalogEx {
  name: string;
  pattern: Pattern;
  kind: 'sets' | 'time';
  load?: Load[];          // any one of these implements (first available wins)
  role?: Role;            // which weight to pick from the user's set
  needs?: GearFlag[];     // all required
  sides?: boolean;        // authored as (Right)/(Left) pairs
  impact?: boolean;       // jumping — left out for 60+ unless nothing else fits
  reps?: number;          // strength reps (foundation)
  blockReps?: number;     // reps inside an EMOM / AMRAP / For Time
  seconds?: number;       // time exercises
  cue: string;
}

const CATALOG: CatalogEx[] = [
  // Squat
  { name: 'KB Goblet Squat', pattern: 'squat', kind: 'sets', load: ['kb'], role: 'heavy', reps: 10, blockReps: 12, cue: 'Slow 3-second descent. Pause at the bottom. Drive knees out, chest tall.' },
  { name: 'DB Goblet Squat', pattern: 'squat', kind: 'sets', load: ['db'], role: 'heavy', reps: 10, blockReps: 12, cue: 'Hold one dumbbell at the chest. Sit between the heels. Chest tall.' },
  { name: 'DB Front Squat', pattern: 'squat', kind: 'sets', load: ['db'], role: 'medium', reps: 10, blockReps: 10, cue: 'Dumbbells on the shoulders, elbows high. Full depth, drive up.' },
  { name: 'Sandbag Front Squat', pattern: 'squat', kind: 'sets', load: ['sandbag'], role: 'heavy', reps: 8, blockReps: 10, cue: 'Bag hugged high on the chest. Brace hard. Knees out.' },
  { name: 'Weighted Vest Squat', pattern: 'squat', kind: 'sets', load: ['vest'], reps: 15, blockReps: 15, cue: 'Vest snug. Hips below knees. Stand tall and squeeze.' },
  { name: 'Air Squat', pattern: 'squat', kind: 'sets', reps: 20, blockReps: 15, cue: 'Hip crease below the knee. Heels down. Stand all the way up.' },
  { name: 'Tempo Squat', pattern: 'squat', kind: 'sets', reps: 12, blockReps: 10, cue: '3 seconds down, 1-second pause, drive up. Makes bodyweight hard.' },
  { name: 'Wall Sit', pattern: 'squat', kind: 'time', seconds: 45, cue: 'Thighs parallel, back flat on the wall. Breathe through it.' },
  // Hinge
  { name: 'KB Deadlift', pattern: 'hinge', kind: 'sets', load: ['kb'], role: 'heavy', reps: 10, blockReps: 12, cue: 'Hips back, flat back. Push the floor away. Squeeze glutes at the top.' },
  { name: 'DB Romanian Deadlift', pattern: 'hinge', kind: 'sets', load: ['db'], role: 'heavy', reps: 10, blockReps: 12, cue: 'Soft knees, hinge until you feel the hamstrings. Dumbbells close to the legs.' },
  { name: 'Single-Leg DB Romanian Deadlift', pattern: 'hinge', kind: 'sets', load: ['db', 'kb'], role: 'medium', sides: true, reps: 8, cue: 'Hinge from the hip, back leg long. Control the lowering. Hips square.' },
  { name: 'Sandbag Deadlift', pattern: 'hinge', kind: 'sets', load: ['sandbag'], role: 'heavy', reps: 10, blockReps: 10, cue: 'Bag between the feet. Flat back, stand tall, squeeze.' },
  { name: 'Band Good Morning', pattern: 'hinge', kind: 'sets', needs: ['bands'], reps: 15, blockReps: 15, cue: 'Band under the feet, behind the neck. Hinge, flat back, stand tall.' },
  { name: 'Glute Bridge', pattern: 'hinge', kind: 'sets', reps: 15, blockReps: 15, cue: 'Drive through the heels. 2-second squeeze at the top.' },
  { name: 'Single-Leg Glute Bridge', pattern: 'hinge', kind: 'sets', sides: true, reps: 12, cue: 'One foot planted, other knee to chest. Hips level as you drive up.' },
  // Lunge
  { name: 'DB Reverse Lunge', pattern: 'lunge', kind: 'sets', load: ['db'], role: 'medium', sides: true, reps: 8, cue: 'Step back, back knee to the floor. Front shin vertical.' },
  { name: 'KB Goblet Reverse Lunge', pattern: 'lunge', kind: 'sets', load: ['kb'], role: 'medium', sides: true, reps: 8, cue: 'Bell at the chest. Long step back, soft knee touch.' },
  { name: 'DB Step-Up', pattern: 'lunge', kind: 'sets', load: ['db'], role: 'light', needs: ['box'], sides: true, reps: 10, cue: 'Whole foot on the box. Drive through the heel, no push off the back leg.' },
  { name: 'Box Step-Up', pattern: 'lunge', kind: 'sets', needs: ['box'], sides: true, reps: 12, cue: 'Drive through the top foot. Stand tall at the top. Control down.' },
  { name: 'TRX Split Squat', pattern: 'lunge', kind: 'sets', needs: ['trx'], sides: true, reps: 10, cue: 'Rear foot in the strap. Knee tracks over the toe. Full depth.' },
  { name: 'Bulgarian Split Squat', pattern: 'lunge', kind: 'sets', sides: true, reps: 10, cue: 'Rear foot on a bench, chair or bed. Drop straight down. Front heel planted.' },
  { name: 'Reverse Lunge', pattern: 'lunge', kind: 'sets', sides: true, reps: 12, blockReps: 10, cue: 'Long step back, back knee kisses the floor. Push through the front heel.' },
  { name: 'Lateral Lunge', pattern: 'lunge', kind: 'sets', sides: true, reps: 10, cue: 'Big step to the side, sit into that hip. Other leg straight.' },
  // Push
  { name: 'DB Bench Press', pattern: 'push', kind: 'sets', load: ['db'], role: 'heavy', needs: ['bench'], reps: 10, cue: 'Shoulder blades pinned. Lower to the chest, press up and slightly in.' },
  { name: 'DB Floor Press', pattern: 'push', kind: 'sets', load: ['db'], role: 'heavy', reps: 10, blockReps: 10, cue: 'Elbows touch the floor at 45 degrees. Pause, press.' },
  { name: 'DB Shoulder Press', pattern: 'push', kind: 'sets', load: ['db'], role: 'light', reps: 10, blockReps: 10, cue: 'Ribs down, glutes tight. Press straight overhead, biceps by the ears.' },
  { name: 'KB Overhead Press', pattern: 'push', kind: 'sets', load: ['kb'], role: 'light', sides: true, reps: 8, cue: 'Bell in the rack. Brace and press. Lock out with the bicep by the ear.' },
  { name: 'Band Chest Press', pattern: 'push', kind: 'sets', needs: ['bands'], reps: 15, blockReps: 15, cue: 'Band behind the back. Press forward, squeeze the chest.' },
  { name: 'Push-Up', pattern: 'push', kind: 'sets', reps: 12, blockReps: 10, cue: 'Body in one straight line. Chest to the floor, full lockout.' },
  { name: 'Incline Push-Up', pattern: 'push', kind: 'sets', reps: 15, blockReps: 12, cue: 'Hands on a bench, chair or bed. Straight line, chest to the edge.' },
  { name: 'Pike Push-Up', pattern: 'push', kind: 'sets', reps: 10, blockReps: 8, cue: 'Hips high. Lower the head between the hands, press back up.' },
  { name: 'Chair Dip', pattern: 'push', kind: 'sets', reps: 12, blockReps: 10, cue: 'Hands on a sturdy chair or bench. Elbows straight back.' },
  // Pull
  { name: 'Pull-Up', pattern: 'pull', kind: 'sets', needs: ['pullup'], reps: 6, blockReps: 5, cue: 'Dead hang to chin over the bar. Use a band or jump if you need it.' },
  { name: 'TRX Row', pattern: 'pull', kind: 'sets', needs: ['trx'], reps: 12, blockReps: 10, cue: 'Body straight. Pull chest to the handles, squeeze shoulder blades.' },
  { name: 'Single-Arm DB Row', pattern: 'pull', kind: 'sets', load: ['db', 'kb'], role: 'heavy', sides: true, reps: 10, cue: 'Hand on a bench or knee. Pull the elbow to the hip. No twisting.' },
  { name: 'DB Bent-Over Row', pattern: 'pull', kind: 'sets', load: ['db'], role: 'medium', reps: 12, blockReps: 10, cue: 'Hinge to 45 degrees, flat back. Row to the ribs, squeeze.' },
  { name: 'Band Row', pattern: 'pull', kind: 'sets', needs: ['bands'], reps: 15, blockReps: 15, cue: 'Band anchored at chest height. Pull to the ribs, pause, control back.' },
  { name: 'Band Pull-Apart', pattern: 'pull', kind: 'sets', needs: ['bands'], reps: 20, blockReps: 15, cue: 'Arms straight. Pull the band to the chest, squeeze the blades.' },
  { name: 'Prone Y-T-W Raise', pattern: 'pull', kind: 'sets', reps: 10, cue: 'Face down. Raise arms in a Y, then T, then W. Thumbs up, slow.' },
  { name: 'Superman Hold', pattern: 'pull', kind: 'time', seconds: 30, cue: 'Face down. Lift arms, chest and legs. Squeeze the back.' },
  // Core
  { name: 'Plank', pattern: 'core', kind: 'time', seconds: 45, cue: 'Forearms down, body straight. Squeeze glutes and quads.' },
  { name: 'Side Plank', pattern: 'core', kind: 'time', sides: true, seconds: 30, cue: 'Elbow under the shoulder. Hips high, body in one line.' },
  { name: 'Dead Bug', pattern: 'core', kind: 'sets', reps: 12, blockReps: 12, cue: 'Low back pressed down. Lower opposite arm and leg slowly.' },
  { name: 'Hollow Body Hold', pattern: 'core', kind: 'time', seconds: 30, cue: 'Low back pressed down. Arms by the ears. Breathe.' },
  { name: 'Bird Dog', pattern: 'core', kind: 'sets', sides: true, reps: 10, cue: 'Opposite arm and leg long. Hips level. Pause at full reach.' },
  { name: 'Russian Twist', pattern: 'core', kind: 'sets', reps: 20, blockReps: 20, cue: '20 total. Lean back, chest tall, rotate from the ribs.' },
  { name: 'Pallof Press', pattern: 'core', kind: 'sets', needs: ['bands'], sides: true, reps: 10, cue: 'Band anchored to the side. Press out and resist the rotation.' },
  { name: 'Hanging Knee Raise', pattern: 'core', kind: 'sets', needs: ['pullup'], reps: 10, blockReps: 8, cue: 'Dead hang. Knees to chest without swinging.' },
  { name: 'KB Halo', pattern: 'core', kind: 'sets', load: ['kb'], role: 'light', reps: 10, cue: 'Circle the bell around the head. Ribs down, 5 each direction.' },
  // Carry
  { name: 'Farmer Carry', pattern: 'carry', kind: 'time', load: ['kb', 'db'], role: 'heavy', seconds: 40, cue: 'Heavy in both hands. Tall posture, short quick steps.' },
  { name: 'Suitcase Carry', pattern: 'carry', kind: 'time', load: ['kb', 'db'], role: 'heavy', sides: true, seconds: 40, cue: 'One side only. Resist leaning. Shoulders level.' },
  { name: 'Sandbag Bear-Hug Carry', pattern: 'carry', kind: 'time', load: ['sandbag'], role: 'heavy', seconds: 45, cue: 'Hug the bag high. Brace and walk.' },
  { name: 'Ruck March', pattern: 'carry', kind: 'time', needs: ['ruck'], seconds: 120, cue: 'Loaded pack, brisk walk. Tall posture.' },
  // Power
  { name: 'KB Swing', pattern: 'power', kind: 'sets', load: ['kb'], role: 'medium', reps: 15, blockReps: 15, cue: 'Hike, snap the hips. Bell floats to chest height. Arms are just hooks.' },
  { name: 'DB Snatch', pattern: 'power', kind: 'sets', load: ['db'], role: 'light', sides: true, reps: 6, blockReps: 6, cue: 'Hinge, explode, punch the dumbbell overhead in one move.' },
  { name: 'DB Thruster', pattern: 'power', kind: 'sets', load: ['db'], role: 'light', reps: 10, blockReps: 10, cue: 'Front squat into a press. Use the hips to drive the weight up.' },
  { name: 'DB Push Press', pattern: 'power', kind: 'sets', load: ['db'], role: 'medium', reps: 8, blockReps: 10, cue: 'Short dip, drive with the legs, press overhead.' },
  { name: 'Sandbag Clean', pattern: 'power', kind: 'sets', load: ['sandbag'], role: 'heavy', reps: 8, blockReps: 8, cue: 'Pull from the floor, pop the hips, catch the bag at the chest.' },
  { name: 'Box Jump', pattern: 'power', kind: 'sets', needs: ['box'], impact: true, reps: 8, blockReps: 10, cue: 'Swing the arms, jump, land soft. Step down.' },
  { name: 'Jump Squat', pattern: 'power', kind: 'sets', impact: true, reps: 10, blockReps: 10, cue: 'Squat down, explode up. Land soft and go again.' },
  { name: 'Broad Jump', pattern: 'power', kind: 'sets', impact: true, reps: 6, blockReps: 6, cue: 'Swing and jump forward as far as you can. Stick the landing.' },
  { name: 'Speed Squat', pattern: 'power', kind: 'sets', reps: 20, blockReps: 20, cue: 'No jump. Fast down, fast up, full depth.' },
  // Conditioning
  { name: 'Burpee', pattern: 'conditioning', kind: 'sets', impact: true, reps: 10, blockReps: 8, cue: 'Chest to the floor, jump at the top. Step back instead of jumping if you need quiet.' },
  { name: 'Squat Thrust', pattern: 'conditioning', kind: 'sets', reps: 10, blockReps: 10, cue: 'Hands down, step or hop back to plank, back in, stand. No jump.' },
  { name: 'Mountain Climber', pattern: 'conditioning', kind: 'sets', reps: 30, blockReps: 20, cue: 'Count every leg. Hips level, drive the knees.' },
  { name: 'Jumping Jack', pattern: 'conditioning', kind: 'time', impact: true, seconds: 40, cue: 'Light on the toes. Full arm swing.' },
  { name: 'High Knees', pattern: 'conditioning', kind: 'time', impact: true, seconds: 30, cue: 'Knees to hip height. Pump the arms.' },
  { name: 'Shadow Boxing', pattern: 'conditioning', kind: 'time', seconds: 45, cue: 'Jab, cross, hook. Stay on the balls of the feet.' },
  { name: 'Bear Crawl', pattern: 'conditioning', kind: 'time', seconds: 30, cue: 'Knees an inch off the floor. Opposite hand and foot. Back flat.' },
  { name: 'Heavy Bag Rounds', pattern: 'conditioning', kind: 'time', needs: ['bag'], seconds: 60, cue: 'Combos on the bag. Breathe out on every strike.' },
  { name: 'Jump Rope', pattern: 'conditioning', kind: 'time', needs: ['rope'], seconds: 60, cue: 'Light, quick skips. Wrists turn the rope.' },
  // Not "Row Sprint": that name is a fixed interval in INTERVAL_MAP.
  { name: 'Rower Sprint', pattern: 'conditioning', kind: 'time', needs: ['rower'], seconds: 45, cue: 'Legs, then body, then arms. Hard.' },
  { name: 'Bike Sprint', pattern: 'conditioning', kind: 'time', needs: ['bike'], seconds: 45, cue: 'All out. High cadence.' },
];

// Cardio machines in order of preference, with their steady and interval names.
const CARDIO_MODES: { needs: GearFlag | null; steady: string; hard: string; easy: string; label: string }[] = [
  { needs: 'rower', steady: 'Steady Row', hard: 'Row — Hard', easy: 'Easy Row', label: 'Row' },
  { needs: 'bike', steady: 'Steady Bike', hard: 'Bike — Hard', easy: 'Easy Bike', label: 'Bike' },
  { needs: 'treadmill', steady: 'Steady Run', hard: 'Run — Hard', easy: 'Easy Run', label: 'Run' },
  { needs: 'ruck', steady: 'Ruck Walk', hard: 'Ruck — Fast', easy: 'Ruck Walk', label: 'Ruck' },
  { needs: 'rope', steady: 'Jump Rope Steady', hard: 'Jump Rope — Fast', easy: 'Jump Rope Easy', label: 'Jump Rope' },
  { needs: null, steady: 'Low-Impact Cardio Flow', hard: 'Fast Feet', easy: 'March in Place', label: 'Bodyweight' },
];

// ── Inputs & output ───────────────────────────────────────────────────────────
export interface PlanInputs {
  age: number | null;
  workoutTypes: WorkoutType[];
  sessionMinutes: number;
  programLengthWeeks: number;
  gear: Gear;
}

export const DEFAULT_SESSION_MINUTES = 35;
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export type Phase = 'foundation' | 'load' | 'peak' | 'deload';

export interface PlanWeek {
  week: number;
  label: string;
  phase: Phase;
  progressionNote: string;
  workouts: any[];
}

export interface Plan {
  id: string;
  createdAt: string | null;
  // Fingerprint of the inputs it was built from; null for the authored program.
  inputsKey: string | null;
  weeks: PlanWeek[];
}

// Stable string of everything that changes the plan. A stored plan whose key
// no longer matches the user's settings is out of date.
export function planInputsKey(i: PlanInputs): string {
  const g = i.gear;
  const flags = (Object.keys(g) as (keyof Gear)[]).filter(k => !Array.isArray(g[k]) && g[k]).sort();
  return JSON.stringify({
    a: i.age ?? null,
    t: [...i.workoutTypes].sort(),
    m: i.sessionMinutes,
    w: i.programLengthWeeks,
    g: { db: g.db, kb: g.kb, sb: g.sandbag, f: flags },
  });
}

// ── Seeded randomness ─────────────────────────────────────────────────────────
// Same seed + same inputs = same plan; a rebuild uses a new seed for variety.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ── Phases ────────────────────────────────────────────────────────────────────
const PHASE_LABEL: Record<Phase, string> = { foundation: 'Foundation', load: 'Load', peak: 'Peak', deload: 'Deload' };
const PHASE_NOTE: Record<Phase, string> = {
  foundation: 'Moderate effort. Own the movements before adding load.',
  load: 'More reps at the same weights — more total work.',
  peak: 'Heavier and harder. Push your numbers.',
  deload: 'Lighter week to recover. Retest the benchmark.',
};

export function phasesFor(weeks: number): Phase[] {
  if (weeks <= 4) return ['foundation', 'load', 'peak', 'deload'].slice(0, Math.max(1, weeks)) as Phase[];
  if (weeks === 5) return ['foundation', 'foundation', 'load', 'peak', 'deload'];
  return ['foundation', 'foundation', 'load', 'load', 'peak', 'deload'];
}

interface Dose { repsDelta: number; bwRepsDelta: number; weightStep: number; rest: number }
const DOSE: Record<Phase, Dose> = {
  foundation: { repsDelta: 0, bwRepsDelta: 0, weightStep: 0, rest: 45 },
  load: { repsDelta: 2, bwRepsDelta: 3, weightStep: 0, rest: 60 },
  peak: { repsDelta: -3, bwRepsDelta: 4, weightStep: 1, rest: 60 },
  deload: { repsDelta: -2, bwRepsDelta: -2, weightStep: -1, rest: 45 },
};
// Strength blocks are sized for the load/peak weeks, so those fill the
// session; foundation runs a little short and deload clearly shorter.
const BUDGET_DOSE = { sets: 4, rest: 60 };
const SET_WORK_SEC = 40;

// ── Day focuses ───────────────────────────────────────────────────────────────
type Focus =
  | 'strength-lower' | 'strength-upper' | 'strength-full'
  | 'hiit-circuit' | 'hiit-emom'
  | 'wod-amrap' | 'wod-emom' | 'wod-fortime'
  | 'cardio-steady' | 'cardio-intervals'
  | 'bw-circuit';

const FOCUS_QUEUE: Record<WorkoutType, Focus[]> = {
  strength: ['strength-lower', 'strength-upper', 'strength-full'],
  hiit: ['hiit-circuit', 'hiit-emom'],
  crossfit: ['wod-amrap', 'wod-emom', 'wod-fortime'],
  cardio: ['cardio-steady', 'cardio-intervals'],
  bodyweight: ['bw-circuit', 'wod-amrap', 'hiit-circuit'],
  mixed: ['strength-lower', 'wod-emom', 'cardio-intervals', 'strength-upper', 'wod-amrap'],
};

// One focus per training day: the chosen styles take turns, each cycling
// through its own focuses, so "strength + cardio" alternates the two. A focus
// another style already put in the week is skipped while that style has
// something else to offer ("mixed" + "strength" shouldn't give two leg days).
export function weekFocuses(types: WorkoutType[]): Focus[] {
  const list: WorkoutType[] = types.length ? types : ['mixed'];
  const next: Partial<Record<WorkoutType, number>> = {};
  const week: Focus[] = [];
  for (let i = 0; i < DAYS.length; i++) {
    const t = list[i % list.length];
    const q = FOCUS_QUEUE[t];
    let n = next[t] ?? 0;
    for (let tries = 0; tries < q.length && week.includes(q[n % q.length]); tries++) n++;
    week.push(q[n % q.length]);
    next[t] = n + 1;
  }
  return week;
}

const FOCUS_TYPE: Record<Focus, string> = {
  'strength-lower': 'strength', 'strength-upper': 'strength', 'strength-full': 'strength',
  'hiit-circuit': 'athletic', 'hiit-emom': 'athletic',
  'wod-amrap': 'power', 'wod-emom': 'power', 'wod-fortime': 'power',
  'cardio-steady': 'cardio', 'cardio-intervals': 'cardio',
  'bw-circuit': 'strength',
};

// ── Exercise selection ────────────────────────────────────────────────────────
interface Ctx {
  gear: Gear;
  lowImpact: boolean;
  rand: () => number;
  // Shuffled order per pattern, fixed for the whole plan so weeks line up.
  order: Map<Pattern, CatalogEx[]>;
}

function loadAvailable(ex: CatalogEx, g: Gear): Load | null {
  if (!ex.load) return null;
  for (const l of ex.load) {
    if (l === 'vest' ? g.vest : g[l].length > 0) return l;
  }
  return null;
}

function fits(ex: CatalogEx, ctx: Ctx): boolean {
  if (ex.load && !loadAvailable(ex, ctx.gear)) return false;
  return (ex.needs ?? []).every(n => ctx.gear[n]);
}

function shuffled<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Loaded and gear-specific moves first (they're why you own the gear), then
// bodyweight; impact moves last for 60+. Ties are shuffled per plan.
function buildOrder(ctx: Omit<Ctx, 'order'>): Map<Pattern, CatalogEx[]> {
  const order = new Map<Pattern, CatalogEx[]>();
  const c = { ...ctx, order } as Ctx;
  const score = (ex: CatalogEx) => (ex.load ? 0 : ex.needs?.length ? 1 : 2) + (ctx.lowImpact && ex.impact ? 10 : 0);
  for (const pattern of new Set(CATALOG.map(e => e.pattern))) {
    const options = shuffled(CATALOG.filter(e => e.pattern === pattern && fits(e, c)), ctx.rand);
    options.sort((a, b) => score(a) - score(b));
    order.set(pattern, options);
  }
  return order;
}

interface PickOpts { kind?: 'sets' | 'time'; noSides?: boolean; bodyweight?: boolean }

// The `variant`-th suitable option for a pattern, skipping moves already in
// this workout. Variant 0 and 1 give the A/B weeks their different exercises.
function pick(ctx: Ctx, pattern: Pattern, used: Set<string>, variant = 0, o: PickOpts = {}): CatalogEx | null {
  const options = (ctx.order.get(pattern) ?? []).filter(e =>
    !used.has(e.name) &&
    (!o.kind || e.kind === o.kind) &&
    (!o.noSides || !e.sides) &&
    (!o.bodyweight || (!e.load && !e.needs?.length)));
  if (!options.length) return null;
  const ex = options[variant % options.length];
  used.add(ex.name);
  return ex;
}

function weightFor(ex: CatalogEx, g: Gear, step: number): number {
  const l = loadAvailable(ex, g);
  if (!l || l === 'vest') return 0;
  const ws = g[l];
  // "Light" is the low end of the rack, not the very lightest pair.
  const base = ex.role === 'heavy' ? ws.length - 1 : ex.role === 'light' ? Math.round((ws.length - 1) / 4) : Math.floor((ws.length - 1) / 2);
  return ws[Math.max(0, Math.min(ws.length - 1, base + step))];
}

const IMPLEMENT_LABEL: Record<Exclude<Load, 'vest'>, string> = { db: 'DB', kb: 'KB', sandbag: 'Sandbag' };

const NEED_LABEL: Record<GearFlag, string> = {
  vest: 'Weighted Vest', bench: 'Bench', pullup: 'Pull-Up Bar', trx: 'TRX', bands: 'Bands',
  rope: 'Jump Rope', rower: 'Rower', bike: 'Bike', treadmill: 'Treadmill', box: 'Plyo Box',
  bag: 'Heavy Bag', ruck: 'Ruck',
};

// workouts.json shape. Unilateral moves become a (Right)/(Left) pair.
function toExercises(ex: CatalogEx, rx: { sets: number; reps?: number; seconds?: number; weight: number; rest?: number }): any[] {
  const make = (name: string, rest?: number) => ex.kind === 'time'
    ? { name, type: 'time', duration: rx.seconds ?? ex.seconds ?? 30, sets: rx.sets, weight: rx.weight, ...(rest != null ? { rest } : {}), cue: ex.cue }
    : { name, type: 'sets', sets: rx.sets, reps: rx.reps ?? ex.reps ?? 10, weight: rx.weight, ...(rest != null ? { rest } : {}), cue: ex.cue };
  if (!ex.sides) return [make(ex.name, rx.rest)];
  // No rest between sides; the set's rest comes after the second side.
  return [make(`${ex.name} (Right)`, rx.rest != null ? 0 : undefined), make(`${ex.name} (Left)`, rx.rest)];
}

// ── Time budget ───────────────────────────────────────────────────────────────
export function splitSession(minutes: number) {
  const total = Math.max(10, minutes || DEFAULT_SESSION_MINUTES);
  const warmup = total <= 15 ? 3 : total <= 30 ? 5 : 6;
  const cooldown = total <= 15 ? 2 : total <= 30 ? 4 : 5;
  return { total, warmup, main: total - warmup - cooldown, cooldown };
}

function cardioMode(g: Gear) {
  return CARDIO_MODES.find(m => !m.needs || g[m.needs])!;
}

function warmupSection(minutes: number, g: Gear) {
  const mode = cardioMode(g);
  const mobility = [
    { name: "World's Greatest Stretch", type: 'time', duration: 60, sets: 1, weight: 0, cue: 'Lunge, elbow to instep, rotate and reach up. Alternate sides slowly.' },
    { name: 'Hip Circle + Leg Swing', type: 'time', duration: 60, sets: 1, weight: 0, cue: '10 hip circles each direction, then 10 leg swings each side.' },
    { name: 'Inchworm to Plank', type: 'time', duration: 60, sets: 1, weight: 0, cue: 'Walk the hands out to plank, pause, walk back.' },
  ];
  const drills = mobility.slice(0, minutes <= 3 ? 1 : minutes <= 5 ? 2 : 3);
  const easySec = Math.max(60, minutes * 60 - drills.length * 60);
  return {
    name: 'Warm-Up', duration: minutes,
    exercises: [
      { name: mode.easy, type: 'time', duration: easySec, sets: 1, weight: 0, cue: 'Easy pace. Get warm and breathing.' },
      ...drills,
    ],
  };
}

function cooldownSection(minutes: number) {
  const stretches = [
    { name: "Child's Pose", type: 'time', duration: 60, sets: 1, weight: 0, cue: 'Knees wide, arms long. Breathe into your back.' },
    { name: 'Hip Flexor Stretch (Right)', type: 'time', duration: 45, sets: 1, weight: 0, cue: 'Half-kneeling. Squeeze the glute, shift forward gently.' },
    { name: 'Hip Flexor Stretch (Left)', type: 'time', duration: 45, sets: 1, weight: 0, cue: 'Half-kneeling. Squeeze the glute, shift forward gently.' },
    { name: 'Hamstring Stretch', type: 'time', duration: 60, sets: 1, weight: 0, cue: 'Long legs, hinge forward. Breathe, no bouncing.' },
    { name: 'Doorway Chest Stretch', type: 'time', duration: 45, sets: 1, weight: 0, cue: 'Forearm on a door frame, step through. Open the chest.' },
  ];
  let left = minutes * 60;
  const out: any[] = [];
  for (const s of stretches) {
    if (left < s.duration) break;
    out.push(s);
    left -= s.duration;
  }
  // Keep (Right)/(Left) pairs whole.
  if (out.length && out[out.length - 1].name.endsWith('(Right)')) out.pop();
  return { name: 'Cool-Down', duration: minutes, exercises: out };
}

// ── Main blocks ───────────────────────────────────────────────────────────────
const STRENGTH_PATTERNS: Partial<Record<Focus, Pattern[]>> = {
  'strength-lower': ['squat', 'hinge', 'lunge', 'carry', 'core', 'power'],
  'strength-upper': ['push', 'pull', 'push', 'pull', 'core', 'carry'],
  'strength-full': ['squat', 'push', 'hinge', 'pull', 'lunge', 'core'],
};

function exSeconds(ex: CatalogEx, sets: number, rest: number): number {
  const work = ex.kind === 'time' ? ex.seconds ?? 30 : SET_WORK_SEC;
  return sets * ((ex.sides ? 2 : 1) * work + rest);
}

// Moves chosen once per (focus, variant) so every week of a slot uses the same
// exercises and only the dose changes — progression you can compare.
function chooseStrength(ctx: Ctx, focus: Focus, mainMin: number, variant: number, bodyweight: boolean): CatalogEx[] {
  const patterns = STRENGTH_PATTERNS[focus] ?? STRENGTH_PATTERNS['strength-full']!;
  const used = new Set<string>();
  const chosen: CatalogEx[] = [];
  let budget = mainMin * 60;
  for (let round = 0; round < 3; round++) {
    for (const p of patterns) {
      const ex = pick(ctx, p, used, variant, { bodyweight });
      if (!ex) continue;
      const cost = exSeconds(ex, BUDGET_DOSE.sets, BUDGET_DOSE.rest);
      // Short sessions may get a single move rather than run long.
      if (chosen.length >= (mainMin >= 15 ? 2 : 1) && cost > budget + 60) { used.delete(ex.name); continue; }
      chosen.push(ex);
      budget -= cost;
      if (budget < 120) return chosen;
    }
  }
  return chosen;
}

// Sets fill the session: as many as the chosen moves need to reach the main
// block's minutes at load-week rest (2–6), one fewer on deload.
function strengthSection(moves: CatalogEx[], phase: Phase, g: Gear, mainMin: number) {
  const d = DOSE[phase];
  const perSet = moves.reduce((t, ex) => t + exSeconds(ex, 1, BUDGET_DOSE.rest), 0);
  const fill = Math.max(2, Math.min(6, Math.round((mainMin * 60) / Math.max(perSet, 1))));
  const sets = phase === 'deload' ? Math.max(2, fill - 1) : fill;
  const exercises = moves.flatMap(ex => {
    const weight = weightFor(ex, g, d.weightStep);
    const loaded = weight > 0;
    const reps = ex.kind === 'sets' ? Math.max(4, (ex.reps ?? 10) + (loaded ? d.repsDelta : d.bwRepsDelta)) : undefined;
    const seconds = ex.kind === 'time' ? Math.max(20, (ex.seconds ?? 30) + (phase === 'peak' ? 10 : phase === 'deload' ? -10 : 0)) : undefined;
    return toExercises(ex, { sets, reps, seconds, weight, rest: d.rest });
  });
  return { name: 'Main Block', duration: mainMin, exercises };
}

// Bodyweight circuit: the same moves done round-robin.
function circuitSection(moves: CatalogEx[], phase: Phase, mainMin: number) {
  const d = DOSE[phase];
  const perRound = moves.reduce((t, ex) => t + exSeconds(ex, 1, 15), 0) + 60;
  const rounds = Math.max(2, Math.min(10, Math.round((mainMin * 60) / perRound) + (phase === 'deload' ? -1 : 0)));
  const exercises = moves.flatMap(ex => toExercises(ex, {
    sets: rounds,
    reps: ex.kind === 'sets' ? Math.max(5, (ex.reps ?? 10) + d.bwRepsDelta) : undefined,
    seconds: ex.seconds,
    weight: 0,
    rest: 15,
  }));
  return { name: 'Bodyweight Circuit', duration: mainMin, circuitRounds: rounds, restBetweenRounds: 60, exercises };
}

const HIIT_WORK: Record<Phase, [number, number]> = {
  foundation: [30, 30], load: [40, 20], peak: [45, 15], deload: [30, 30],
};

function hiitMoves(ctx: Ctx, variant: number): CatalogEx[] {
  const used = new Set<string>();
  return (['conditioning', 'squat', 'push', 'power', 'core', 'conditioning'] as Pattern[])
    .map(p => pick(ctx, p, used, variant, { noSides: true }))
    .filter((e): e is CatalogEx => !!e);
}

function hiitCircuit(moves: CatalogEx[], phase: Phase, mainMin: number, g: Gear) {
  const [work, rest] = HIIT_WORK[phase];
  const n = mainMin < 15 ? 3 : mainMin < 25 ? 4 : moves.length;
  const list = moves.slice(0, n);
  const rounds = Math.max(2, Math.round((mainMin * 60 + 60) / (list.length * (work + rest) + 60)));
  const exercises = list.map(ex => ({
    name: ex.name, type: 'time', duration: work, sets: rounds,
    weight: weightFor(ex, g, -1), rest, cue: ex.cue,
  }));
  return {
    name: `HIIT ${work}/${rest}`, duration: mainMin, circuitRounds: rounds, restBetweenRounds: 60,
    exercises,
  };
}

function blockMovement(ex: CatalogEx, g: Gear) {
  const weight = weightFor(ex, g, -1);
  return ex.kind === 'time'
    ? { name: ex.name, type: 'time', duration: Math.min(ex.seconds ?? 30, 40), sets: 1, weight, cue: ex.cue }
    : { name: ex.name, type: 'sets', sets: 1, reps: ex.blockReps ?? ex.reps ?? 10, weight, cue: ex.cue };
}

// Benchmark blocks (AMRAP / EMOM / For Time) keep the same movements and reps
// every week, so results line up against the first week's score.
function wodMoves(ctx: Ctx, focus: Focus, bodyweight: boolean, variant: number): CatalogEx[] {
  const used = new Set<string>();
  const patterns: Pattern[] = focus === 'wod-emom' || focus === 'hiit-emom'
    ? ['power', 'push', 'squat', 'core']
    : ['conditioning', 'push', 'squat', 'pull', 'core'];
  const opts: PickOpts = { noSides: true, bodyweight };
  return patterns
    .map(p => pick(ctx, p, used, variant, { ...opts, kind: 'sets' }) ?? pick(ctx, p, used, variant, opts))
    .filter((e): e is CatalogEx => !!e)
    .slice(0, focus === 'wod-fortime' ? 3 : 4);
}

function wodSections(focus: Focus, moves: CatalogEx[], mainMin: number, g: Gear, phase: Phase): any[] {
  const movements = moves.map(ex => blockMovement(ex, g));
  // One block past ~30 minutes is a slog: long sessions split into parts of
  // about 25 minutes, with 2 minutes' rest between them.
  const count = mainMin > 32 ? Math.ceil((mainMin + 2) / 27) : 1;
  const each = Math.floor((mainMin - 2 * (count - 1)) / count);
  const parts = Array.from({ length: count }, (_, i) => i === 0 ? mainMin - 2 * (count - 1) - each * (count - 1) : each);
  const first = parts[0];
  const sections: any[] = [];
  if (focus === 'wod-amrap') {
    sections.push({
      name: `${first}-min AMRAP`, duration: first, amrap: true, restAfter: 120,
      amrapNote: `As many rounds as possible in ${first} minutes. Tap +1 ROUND after each full round.`,
      exercises: movements,
    });
  } else if (focus === 'wod-emom' || focus === 'hiit-emom') {
    const mins = Math.max(movements.length, Math.floor(first / movements.length) * movements.length);
    sections.push({
      name: `EMOM ${mins}`, duration: mins, emom: true, restAfter: 120,
      emomNote: 'Start each movement at the top of the minute. Rest whatever is left.',
      exercises: movements,
    });
  } else {
    const roundSec = movements.reduce((t, m: any) => t + (m.type === 'time' ? m.duration : (m.reps ?? 10) * 3.5), 0) + 20;
    const rounds = Math.max(2, Math.min(10, Math.round((first * 60 * 0.8) / roundSec)));
    sections.push({
      name: `${rounds} Rounds For Time`, forTime: true, rounds, timeCap: first, restAfter: 120,
      forTimeNote: `${rounds} rounds as fast as you can, ${first}-minute cap. Tap +1 ROUND after each.`,
      exercises: movements,
    });
  }
  // Later parts: timed EMOMs on two movements at a time, rotating through the
  // list so each part works something different. Work time follows the phase.
  const [work] = HIIT_WORK[phase];
  parts.slice(1).forEach((mins, i) => {
    const pair = [0, 1].map(k => movements[(2 * (i + 1) + k) % movements.length]);
    sections.push({
      name: `Part ${i + 2} — EMOM ${mins}`, duration: mins, emom: true, restAfter: 120,
      emomNote: `${work} seconds of work at the top of each minute, alternating movements.`,
      exercises: pair.map((m: any) => ({ ...m, type: 'time', duration: work, reps: undefined })),
    });
  });
  return sections;
}

const INTERVALS: Record<Phase, [number, number]> = {
  foundation: [60, 60], load: [90, 60], peak: [60, 30], deload: [45, 90],
};

function cardioSections(focus: Focus, mainMin: number, g: Gear, phase: Phase): any[] {
  const mode = cardioMode(g);
  if (focus === 'cardio-steady') {
    const zone = phase === 'peak' ? 'Upper Zone 2 — you can talk, just.' : phase === 'deload' ? 'Easy — fully conversational.' : 'Zone 2 — conversational pace.';
    return [{
      name: 'Steady State', duration: mainMin,
      exercises: [{ name: mode.steady, type: 'time', duration: mainMin * 60, sets: 1, weight: 0, cue: zone }],
    }];
  }
  const [work, rest] = INTERVALS[phase];
  const rounds = Math.max(3, Math.floor((mainMin * 60) / (work + rest)));
  return [{
    name: 'Intervals', duration: mainMin,
    exercises: [{
      name: mode.hard, type: 'time', duration: work, sets: rounds, weight: 0, rest,
      cue: `${rounds} rounds: ${work} seconds hard, ${rest} seconds easy.`,
    }],
  }];
}

// ── Workout assembly ──────────────────────────────────────────────────────────
interface SlotMoves { strength?: CatalogEx[][]; hiit?: CatalogEx[][]; wod?: CatalogEx[] }

function titleFor(focus: Focus, sections: any[], g: Gear): string {
  const mode = cardioMode(g);
  switch (focus) {
    case 'strength-lower': return 'Lower Body Strength';
    case 'strength-upper': return 'Upper Body Strength';
    case 'strength-full': return 'Full-Body Strength';
    case 'bw-circuit': return 'Bodyweight Strength Circuit';
    case 'hiit-circuit': return 'HIIT Circuit';
    case 'hiit-emom': return 'HIIT EMOM';
    case 'cardio-steady': return `Steady Cardio — ${mode.label}`;
    case 'cardio-intervals': return `Cardio Intervals — ${mode.label}`;
    default: return sections.find(s => s.amrap || s.emom || s.forTime)?.name ?? 'Conditioning';
  }
}

// "25lb DB" for one weight, "10–45lb DB" for a range; then other gear.
function equipmentOf(sections: any[], movesUsed: CatalogEx[], g: Gear): string[] {
  const out = new Set<string>();
  const weights: Partial<Record<Load, Set<number>>> = {};
  const byName = new Map(movesUsed.map(m => [m.name, m]));
  for (const s of sections) {
    for (const e of s.exercises) {
      const base = String(e.name).replace(/ \((Right|Left)\)$/, '');
      const ex = byName.get(base);
      if (!ex) continue;
      const l = loadAvailable(ex, g);
      if (l === 'vest') out.add('Weighted Vest');
      else if (l && e.weight > 0) (weights[l] ??= new Set()).add(e.weight);
      for (const n of ex.needs ?? []) out.add(NEED_LABEL[n]);
    }
  }
  const loads: string[] = [];
  for (const l of ['kb', 'db', 'sandbag'] as const) {
    const ws = [...(weights[l] ?? [])].sort((a, b) => a - b);
    if (!ws.length) continue;
    const range = ws.length === 1 ? `${ws[0]}` : `${ws[0]}–${ws[ws.length - 1]}`;
    loads.push(`${range}lb ${IMPLEMENT_LABEL[l]}`);
  }
  const mode = cardioMode(g);
  if (sections.some(s => s.exercises.some((e: any) => e.name === mode.steady || e.name === mode.hard || e.name === mode.easy)) && mode.needs) {
    out.add(NEED_LABEL[mode.needs]);
  }
  const all = [...loads, ...out];
  return all.length ? all : ['Bodyweight'];
}

function buildWorkout(
  ctx: Ctx, focus: Focus, phase: Phase, variant: number, minutes: number, slot: SlotMoves,
): { sections: any[]; moves: CatalogEx[] } {
  const split = splitSession(minutes);
  const g = ctx.gear;
  let main: any[];
  let moves: CatalogEx[] = [];
  if (focus.startsWith('strength')) {
    moves = slot.strength![variant];
    main = [strengthSection(moves, phase, g, split.main)];
  } else if (focus === 'bw-circuit') {
    moves = slot.strength![variant];
    main = [circuitSection(moves, phase, split.main)];
  } else if (focus === 'hiit-circuit') {
    moves = slot.hiit![variant];
    main = [hiitCircuit(moves, phase, split.main, g)];
  } else if (focus === 'cardio-steady' || focus === 'cardio-intervals') {
    main = cardioSections(focus, split.main, g, phase);
  } else {
    moves = slot.wod!;
    main = wodSections(focus, moves, split.main, g, phase);
  }
  return {
    sections: [warmupSection(split.warmup, g), ...main, cooldownSection(split.cooldown)],
    moves,
  };
}

function prepareSlots(ctx: Ctx, focuses: Focus[], minutes: number): SlotMoves[] {
  const { main } = splitSession(minutes);
  // A block type that comes up twice in a week gets different movements the
  // second time (the first stays the benchmark).
  const seen: Partial<Record<Focus, number>> = {};
  return focuses.map(f => {
    const nth = seen[f] ?? 0;
    seen[f] = nth + 1;
    if (f.startsWith('strength')) return { strength: [0, 1].map(v => chooseStrength(ctx, f, main, v, false)) };
    if (f === 'bw-circuit') return { strength: [0, 1].map(v => chooseStrength(ctx, 'strength-full', Math.max(main, 20), v, true).slice(0, 6)) };
    if (f === 'hiit-circuit') return { hiit: [0, 1].map(v => hiitMoves(ctx, v)) };
    if (f.startsWith('wod') || f === 'hiit-emom') return { wod: wodMoves(ctx, f, false, nth) };
    return {};
  });
}

function makeCtx(inputs: PlanInputs, seed: number, gear: Gear): Ctx {
  const base = { gear, lowImpact: (inputs.age ?? 0) >= 60, rand: rng(seed) };
  return { ...base, order: buildOrder(base) };
}

// "Bodyweight" as the only style means bodyweight training, whatever the
// equipment list says.
function effectiveGear(inputs: PlanInputs): Gear {
  const onlyBw = inputs.workoutTypes.length > 0 && inputs.workoutTypes.every(t => t === 'bodyweight');
  return onlyBw ? noGear() : inputs.gear;
}

export function generatePlan(inputs: PlanInputs, seed: number, now = new Date()): Plan {
  const id = `p${seed.toString(36)}`;
  const gear = effectiveGear(inputs);
  const ctx = makeCtx(inputs, seed, gear);
  const minutes = inputs.sessionMinutes || DEFAULT_SESSION_MINUTES;
  const focuses = weekFocuses(inputs.workoutTypes);
  const slots = prepareSlots(ctx, focuses, minutes);
  const phases = phasesFor(inputs.programLengthWeeks);
  // The first benchmark-style day is retested in the last week.
  const benchDay = focuses.findIndex(f => f.startsWith('wod'));

  const weeks: PlanWeek[] = phases.map((phase, wi) => {
    const week = wi + 1;
    const variant = phase === 'deload' ? 0 : wi % 2;
    return {
      week,
      label: `Week ${week} — ${PHASE_LABEL[phase]}`,
      phase,
      progressionNote: PHASE_NOTE[phase],
      workouts: focuses.map((focus, di) => {
        const { sections, moves } = buildWorkout(ctx, focus, phase, variant, minutes, slots[di]);
        const bench = di === benchDay && (week === 1 || week === phases.length);
        return {
          id: `${id}-w${week}d${di + 1}`,
          day: DAYS[di],
          title: titleFor(focus, sections, gear),
          type: FOCUS_TYPE[focus],
          focus,
          duration: splitSession(minutes).total,
          equipment: equipmentOf(sections, moves, gear),
          sections,
          ...(bench ? { benchmarkWorkout: true, benchmarkNote: week === 1 ? 'Benchmark — note your score.' : 'Retest — beat week 1.' } : {}),
        };
      }),
    };
  });

  return { id, createdAt: now.toISOString(), inputsKey: planInputsKey(inputs), weeks };
}

// ── Travel ────────────────────────────────────────────────────────────────────
const FOCUS_SUMMARY: Record<Focus, string> = {
  'strength-lower': 'Legs and hips with what you have on hand.',
  'strength-upper': 'Push and pull strength — chest, back, shoulders.',
  'strength-full': 'Whole-body strength, one move per pattern.',
  'bw-circuit': 'Bodyweight strength moves done as a circuit. Just floor space.',
  'hiit-circuit': 'Work / rest intervals. Short, sweaty, done.',
  'hiit-emom': 'Every minute on the minute — rest is whatever you earn.',
  'wod-amrap': 'As many rounds as possible. Beat your last score.',
  'wod-emom': 'Every minute on the minute. Steady and honest.',
  'wod-fortime': 'Set rounds, as fast as you can.',
  'cardio-steady': 'Easy aerobic work to keep the engine running.',
  'cardio-intervals': 'Hard / easy intervals on whatever the hotel has.',
};

// Travel workouts: one per focus in the user's weekly rotation, built for the
// travel setup's gear and the user's session length.
export function generateTravelWorkouts(inputs: PlanInputs, seed: number): any[] {
  const gear = effectiveGear(inputs);
  const ctx = makeCtx(inputs, seed, gear);
  const minutes = inputs.sessionMinutes || DEFAULT_SESSION_MINUTES;
  const focuses = [...new Set(weekFocuses(inputs.workoutTypes))];
  // A rotation with one focus (e.g. cardio only on a cardio-less room) still
  // gives a few choices.
  for (const extra of ['bw-circuit', 'wod-amrap', 'hiit-circuit'] as Focus[]) {
    if (focuses.length >= 3) break;
    if (!focuses.includes(extra)) focuses.push(extra);
  }
  const slots = prepareSlots(ctx, focuses, minutes);
  return focuses.map((focus, i) => {
    const { sections, moves } = buildWorkout(ctx, focus, 'load', 0, minutes, slots[i]);
    return {
      id: `t${seed.toString(36)}-${i + 1}`,
      day: 'Travel',
      travel: true,
      title: titleFor(focus, sections, gear),
      type: FOCUS_TYPE[focus],
      focus,
      duration: splitSession(minutes).total,
      equipment: equipmentOf(sections, moves, gear),
      summary: FOCUS_SUMMARY[focus],
      setup: null,
      requires: [],
      sections,
    };
  });
}

// ── Estimates (tests and UI sanity) ───────────────────────────────────────────
// Rough wall-clock minutes for a generated workout, using the same per-set
// assumptions the generator budgets with.
export function estimateMinutes(workout: any): number {
  let sec = 0;
  for (const s of workout.sections) {
    if (s.amrap || s.emom) { sec += s.duration * 60 + (s.restAfter ?? 0); continue; }
    if (s.forTime) { sec += s.timeCap * 60 * 0.85 + (s.restAfter ?? 0); continue; }
    const rounds = s.circuitRounds ?? 1;
    for (const e of s.exercises) {
      const work = e.type === 'time' ? e.duration : SET_WORK_SEC;
      const sets = s.circuitRounds ? rounds : e.sets || 1;
      sec += sets * (work + (e.rest ?? 0));
    }
    if (s.circuitRounds) sec += (rounds - 1) * (s.restBetweenRounds ?? 0);
  }
  return sec / 60;
}

export function catalogNames(): string[] {
  return CATALOG.map(e => e.name);
}

export function isBodyweightMove(name: string): boolean {
  const ex = CATALOG.find(e => e.name === name.replace(/ \((Right|Left)\)$/, ''));
  return !!ex && !ex.load && !ex.needs?.length;
}
