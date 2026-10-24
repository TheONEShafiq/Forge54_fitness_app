// Travel library — standalone workouts for when you're away from the home gym.
// They use the same workout shape as workouts.json, so the player, logging and
// timed blocks (EMOM / AMRAP / For Time) work unchanged. While traveling, the
// program itself is paused (see settingsStore travel helpers); these sessions
// are logged with `travel: true` and never check off program workouts.

export type TravelSetup = 'gym' | 'room' | 'bodyweight';
export type TravelGear = 'bands' | 'trx' | 'jumprope';
type GymGear = 'dumbbells' | 'bench' | 'cardio';
export type GearTag = TravelGear | GymGear;

export const TRAVEL_SETUPS: { value: TravelSetup; label: string; sub: string }[] = [
  { value: 'gym', label: 'Hotel gym', sub: 'Dumbbells, a bench, treadmill or bike — plus anything you packed.' },
  { value: 'room', label: 'Hotel room + packed gear', sub: 'Floor, chair, wall, bed — plus the gear you packed.' },
  { value: 'bodyweight', label: 'Bodyweight only', sub: 'Nothing but you and a bit of floor. Quiet options included.' },
];

export const PACKABLE_GEAR: { value: TravelGear; label: string }[] = [
  { value: 'bands', label: 'Resistance bands' },
  { value: 'trx', label: 'TRX straps' },
  { value: 'jumprope', label: 'Jump rope' },
];

const GEAR_LABEL: Record<GearTag, string> = {
  bands: 'Bands', trx: 'TRX', jumprope: 'Jump rope',
  dumbbells: 'Dumbbells', bench: 'Bench', cardio: 'Treadmill / bike',
};
export function gearLabel(g: GearTag): string { return GEAR_LABEL[g]; }

const HOTEL_GYM: GymGear[] = ['dumbbells', 'bench', 'cardio'];

export function availableGear(setup: TravelSetup, packed: TravelGear[]): Set<GearTag> {
  if (setup === 'bodyweight') return new Set();
  if (setup === 'room') return new Set(packed);
  return new Set<GearTag>([...HOTEL_GYM, ...packed]);
}

export function fitsSetup(w: { requires: GearTag[] }, setup: TravelSetup, packed: TravelGear[]): boolean {
  const have = availableGear(setup, packed);
  return w.requires.every(g => have.has(g));
}

// ── Authoring helpers ────────────────────────────────────────────────────────
type Ex = Record<string, any>;
const S = (name: string, sets: number, reps: number, cue: string, o: { weight?: number; rest?: number } = {}): Ex =>
  ({ name, type: 'sets', sets, reps, weight: o.weight ?? 0, rest: o.rest ?? 0, cue });
const T = (name: string, duration: number, cue: string, o: { sets?: number; rest?: number } = {}): Ex =>
  ({ name, type: 'time', duration, sets: o.sets ?? 1, weight: 0, ...(o.rest != null ? { rest: o.rest } : {}), cue });
// Unilateral movements are authored as (Right)/(Left) pairs — the player merges them.
const pair = (name: string, make: (n: string) => Ex): Ex[] => [make(`${name} (Right)`), make(`${name} (Left)`)];

const WARMUP_BW = {
  name: 'Warm-Up', duration: 5,
  exercises: [
    T('March in Place + Arm Circles', 60, 'Easy pace. Big arm circles forward then back. Get warm.'),
    T("World's Greatest Stretch", 60, 'Lunge, elbow to instep, rotate and reach up. Alternate sides slowly.'),
    S('Bodyweight Squat', 1, 15, 'Slow and deep. Knees track over toes. Open the hips.'),
    T('Inchworm to Plank', 60, 'Walk hands out to plank, pause, walk back. Keep neck neutral.'),
  ],
};

const COOLDOWN = {
  name: 'Cool-Down', duration: 5,
  exercises: [
    ...pair('Hip Flexor Stretch', n => T(n, 45, 'Half-kneeling. Squeeze glute, shift forward gently.')),
    ...pair('Figure-Four Stretch', n => T(n, 45, 'On your back or seated on the bed edge. Ankle over knee, lean in.')),
    T("Child's Pose", 60, 'Knees wide, arms long. Breathe into your back.'),
  ],
};

const WARMUP_GYM = {
  name: 'Warm-Up', duration: 6,
  exercises: [
    T('Easy Bike or Treadmill', 240, 'Zone 2. Conversational pace. Treadmill, bike or rower — whatever the hotel has.'),
    T("World's Greatest Stretch", 60, 'Lunge, elbow to instep, rotate and reach up. Alternate sides slowly.'),
    S('Bodyweight Squat', 1, 15, 'Slow and deep. Open the hips before loading them.'),
  ],
};

export interface TravelWorkout {
  id: string;
  title: string;
  type: string;
  duration: number;
  setup: TravelSetup;       // what it was designed for
  requires: GearTag[];      // gear it can't be done without
  equipment: string[];
  summary: string;
  day: string;
  travel: true;
  sections: any[];
}

const W = (w: Omit<TravelWorkout, 'travel' | 'day' | 'equipment'>): TravelWorkout => ({
  ...w,
  day: 'Travel',
  travel: true,
  equipment: w.requires.length ? w.requires.map(gearLabel) : ['Bodyweight'],
});

export const TRAVEL_WORKOUTS: TravelWorkout[] = [
  // ── Bodyweight only ────────────────────────────────────────────────────────
  W({
    id: 't-bw-quiet-strength', title: 'Quiet Room Strength', type: 'strength', duration: 30,
    setup: 'bodyweight', requires: [],
    summary: 'No jumping — safe for a 6am hotel room with neighbours below. Slow tempo makes bodyweight hard.',
    sections: [
      WARMUP_BW,
      {
        name: 'Strength Circuit', duration: 18, circuitRounds: 4, restBetweenRounds: 60,
        exercises: [
          ...pair('Tempo Split Squat', n => S(n, 4, 10, '3 seconds down, 1 up. Back knee kisses the floor.')),
          S('Tempo Push-Up', 4, 12, '3 seconds down, pause, drive up. Feet on the bed to make it harder.'),
          S('Chair Dip', 4, 12, 'Hands on a sturdy chair or bed edge. Elbows straight back.'),
          ...pair('Single-Leg Glute Bridge', n => S(n, 4, 12, 'Drive through the heel. Squeeze 2 seconds at the top.')),
          T('Hollow Body Hold', 30, 'Low back pressed down. Arms by ears. Breathe.', { sets: 4 }),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-bw-amrap-20', title: 'Bodyweight AMRAP 20', type: 'athletic', duration: 32,
    setup: 'bodyweight', requires: [],
    summary: '20 minutes, as many rounds as possible. Same movements every trip — beat your last score.',
    sections: [
      WARMUP_BW,
      {
        name: '20-min AMRAP', duration: 20, amrap: true,
        amrapNote: 'As many rounds as possible in 20 minutes. Tap +1 ROUND after each full round. Steady pace beats sprint-and-die.',
        exercises: [
          S('Burpee', 1, 5, 'Chest to floor, jump at top. Step back instead of jumping if the room needs quiet.'),
          S('Push-Up', 1, 10, 'Full range. Body in one straight line.'),
          S('Air Squat', 1, 15, 'Hip crease below knee. Stand tall at the top.'),
          S('Mountain Climber', 1, 20, '20 total — 10 each leg. Hips level.'),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-bw-emom-16', title: 'Bodyweight EMOM 16', type: 'power', duration: 28,
    setup: 'bodyweight', requires: [],
    summary: 'Four movements, rotating every minute for 16 minutes. Work fast, rest whatever is left of the minute.',
    sections: [
      WARMUP_BW,
      {
        name: 'EMOM x16 min', duration: 16, emom: true,
        emomNote: 'Start each movement on the beep. Finish the reps, rest the remainder of the minute. If you can’t finish in ~40s, cut reps.',
        exercises: [
          S('Burpee', 4, 10, 'Smooth and steady. Step back for a quiet version.'),
          S('Alternating Reverse Lunge', 4, 16, '8 each leg. Long step back, chest tall.'),
          S('Push-Up', 4, 12, 'Full lockout at the top, chest to floor at the bottom.'),
          S('Plank Shoulder Tap', 4, 20, '10 each hand. Feet wide, hips still.'),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-bw-for-time', title: '3 Rounds For Time', type: 'athletic', duration: 30,
    setup: 'bodyweight', requires: [],
    summary: 'Three rounds as fast as you can with good form. 18-minute cap.',
    sections: [
      WARMUP_BW,
      {
        name: '3 Rounds For Time', forTime: true, rounds: 3, timeCap: 18,
        forTimeNote: 'Three rounds as fast as you can. Tap +1 ROUND after each — the clock stops itself after round 3. 18-minute cap.',
        exercises: [
          S('Air Squat', 1, 30, 'Fast but full depth.'),
          S('Push-Up', 1, 20, 'Break into sets early if needed — don’t grind to failure.'),
          S('Alternating Reverse Lunge', 1, 20, '10 each leg.'),
          S('Burpee', 1, 15, 'Keep moving. Step back if you need to.'),
          S('Sit-Up', 1, 20, 'Hands across chest. Feet under the bed if you need an anchor.'),
        ],
      },
      COOLDOWN,
    ],
  }),

  // ── Hotel room + packed gear ───────────────────────────────────────────────
  W({
    id: 't-room-bands', title: 'Band Strength Circuit', type: 'strength', duration: 32,
    setup: 'room', requires: ['bands'],
    summary: 'Full-body strength with a loop or tube band — pull, press, hinge, squat, anti-rotation.',
    sections: [
      WARMUP_BW,
      {
        name: 'Band Circuit', duration: 20, circuitRounds: 4, restBetweenRounds: 60,
        exercises: [
          S('Band Bent-Over Row', 4, 15, 'Stand on the band. Hinge, pull elbows to hips. Squeeze 1 second.'),
          S('Band Squat to Press', 4, 12, 'Band under feet, handles at shoulders. Squat, then drive overhead.'),
          S('Band Good Morning', 4, 15, 'Band under feet, over the back of the neck/shoulders. Push hips back, flat back.'),
          S('Band Floor Press', 4, 15, 'Band behind your back, lying on the floor. Press to lockout.'),
          ...pair('Band Pallof Press', n => S(n, 4, 10, 'Anchor band in the door hinge side. Press out, resist the twist.')),
          S('Band Pull-Apart', 4, 20, 'Arms straight. Pull to chest, squeeze shoulder blades.'),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-room-trx', title: 'TRX Door Anchor Full Body', type: 'strength', duration: 32,
    setup: 'room', requires: ['trx'],
    summary: 'Door-anchor TRX: rows, presses, single-leg work and a 12-minute EMOM finisher.',
    sections: [
      WARMUP_BW,
      {
        name: 'TRX Strength', duration: 12,
        exercises: [
          S('TRX Row', 3, 12, 'Walk feet forward to make it harder. Squeeze shoulder blades.', { rest: 45 }),
          S('TRX Chest Press', 3, 12, 'Facing away from the door. Body straight, elbows 45°.', { rest: 45 }),
          ...pair('TRX Single-Leg Squat', n => S(n, 3, 8, 'Hold handles for balance. Sit back to the bed edge and stand.', { rest: 45 })),
        ],
      },
      {
        name: 'EMOM x12 min', duration: 12, emom: true,
        emomNote: 'Three movements rotating every minute, four rounds. Rest is what remains of each minute.',
        exercises: [
          S('TRX Squat Jump', 4, 10, 'Light hands on the straps. Quiet landing — or squat to calf raise for no jumping.'),
          S('TRX Atomic Push-Up', 4, 8, 'Feet in the cradles. Push-up, then knees to chest.'),
          S('TRX Y-Raise', 4, 12, 'Arms straight into a Y. Slow down.'),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-room-rope', title: 'Rope Intervals + AMRAP 12', type: 'cardio', duration: 32,
    setup: 'room', requires: ['jumprope'],
    summary: 'Needs ceiling height or a parking lot. Intervals for the engine, then a short AMRAP.',
    sections: [
      WARMUP_BW,
      {
        name: 'Rope Intervals', duration: 10,
        exercises: [
          T('Jump Rope Intervals', 600, '5 rounds: 60 seconds fast, 60 seconds easy skip.'),
        ],
      },
      {
        name: '12-min AMRAP', duration: 12, amrap: true,
        amrapNote: 'As many rounds as possible in 12 minutes. Tap +1 ROUND after each full round.',
        exercises: [
          S('Jump Rope Singles', 1, 50, '50 skips. Wrists, not arms.'),
          S('Push-Up', 1, 10, 'Full range.'),
          S('Air Squat', 1, 15, 'Full depth, fast.'),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-room-bands-rope-for-time', title: 'Bands + Rope For Time', type: 'athletic', duration: 35,
    setup: 'room', requires: ['bands', 'jumprope'],
    summary: 'Five rounds for time, 25-minute cap. A real test with almost nothing in the bag.',
    sections: [
      WARMUP_BW,
      {
        name: '5 Rounds For Time', forTime: true, rounds: 5, timeCap: 25,
        forTimeNote: 'Five rounds as fast as you can. Tap +1 ROUND after each. 25-minute cap.',
        exercises: [
          S('Jump Rope Singles', 1, 100, '100 skips. Break it up early.'),
          S('Band Bent-Over Row', 1, 15, 'Stand on the band. Pull hard.'),
          S('Band Thruster', 1, 15, 'Squat, drive the band overhead in one motion.'),
          S('Push-Up', 1, 10, 'Chest to floor.'),
        ],
      },
      COOLDOWN,
    ],
  }),

  // ── Hotel gym ──────────────────────────────────────────────────────────────
  W({
    id: 't-gym-db-strength', title: 'Hotel Gym DB Strength', type: 'strength', duration: 38,
    setup: 'gym', requires: ['dumbbells', 'bench'],
    summary: 'Classic strength work with whatever dumbbells the hotel has. Log the weight you actually used.',
    sections: [
      WARMUP_GYM,
      {
        name: 'Strength', duration: 24,
        exercises: [
          S('DB Goblet Squat', 4, 10, 'Heaviest DB you can control. Elbows inside knees at the bottom.', { weight: 40, rest: 75 }),
          S('DB Bench Press', 4, 10, 'Weight is per hand. Shoulder blades pinned to the bench.', { weight: 35, rest: 75 }),
          ...pair('Single-Arm DB Row', n => S(n, 4, 10, 'Hand and knee on the bench. Pull to the hip.', { weight: 40, rest: 60 })),
          S('DB Romanian Deadlift', 3, 12, 'Weight per hand. Soft knees, hips back, flat back.', { weight: 35, rest: 60 }),
          ...pair('DB Bulgarian Split Squat', n => S(n, 3, 8, 'Rear foot on the bench. Torso tall.', { weight: 25, rest: 60 })),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-gym-intervals-amrap', title: 'Bike Intervals + DB AMRAP', type: 'cardio', duration: 38,
    setup: 'gym', requires: ['cardio', 'dumbbells'],
    summary: 'Hard intervals on whatever machine is there, then a 12-minute dumbbell AMRAP.',
    sections: [
      WARMUP_GYM,
      {
        name: 'Intervals', duration: 15,
        exercises: [
          T('Bike Intervals', 900, '5 rounds: 90 seconds hard, 90 seconds easy. Treadmill or rower works too.'),
        ],
      },
      {
        name: '12-min AMRAP', duration: 12, amrap: true,
        amrapNote: 'As many rounds as possible in 12 minutes. Tap +1 ROUND after each full round.',
        exercises: [
          S('DB Thruster', 1, 10, 'Weight per hand. Squat and press in one drive.', { weight: 25 }),
          S('DB Renegade Row', 1, 10, '5 each arm. Feet wide, no hip twist.', { weight: 25 }),
          S('DB Deadlift', 1, 12, 'Weight per hand. Push the floor away.', { weight: 35 }),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-gym-db-emom-20', title: 'Dumbbell EMOM 20', type: 'power', duration: 32,
    setup: 'gym', requires: ['dumbbells'],
    summary: 'Four dumbbell movements, five rounds, every minute on the minute.',
    sections: [
      WARMUP_GYM,
      {
        name: 'EMOM x20 min', duration: 20, emom: true,
        emomNote: 'Start on the beep, finish the reps, rest the remainder. Pick a weight you can finish in ~40 seconds every time.',
        exercises: [
          S('DB Thruster', 5, 10, 'Weight per hand. Full squat, full lockout.', { weight: 25 }),
          S('DB Renegade Row', 5, 12, '6 each arm. Hips square to the floor.', { weight: 25 }),
          S('DB Reverse Lunge', 5, 12, '6 each leg. Weight per hand.', { weight: 25 }),
          S('Burpee', 5, 8, 'Smooth and steady.'),
        ],
      },
      COOLDOWN,
    ],
  }),
  W({
    id: 't-gym-for-time', title: 'Hotel Gym Chipper For Time', type: 'athletic', duration: 38,
    setup: 'gym', requires: ['cardio', 'dumbbells'],
    summary: 'Four rounds for time mixing the machine with dumbbell work. 24-minute cap.',
    sections: [
      WARMUP_GYM,
      {
        name: '4 Rounds For Time', forTime: true, rounds: 4, timeCap: 24,
        forTimeNote: 'Four rounds as fast as you can. Watch the machine for the 2:00. Tap +1 ROUND after each. 24-minute cap.',
        exercises: [
          T('Bike or Treadmill — Hard', 120, '2 minutes hard on the machine. Use its display for time.'),
          S('DB Deadlift', 1, 15, 'Weight per hand.', { weight: 35 }),
          S('DB Push Press', 1, 10, 'Weight per hand. Dip and drive.', { weight: 25 }),
          S('Push-Up', 1, 10, 'Chest to floor.'),
        ],
      },
      COOLDOWN,
    ],
  }),
];

export function getTravelWorkout(id: string | undefined): TravelWorkout | null {
  if (!id) return null;
  return TRAVEL_WORKOUTS.find(w => w.id === id) || null;
}

// Workouts for this setup first (designed for it, then anything else that
// fits), and the ones that need gear you don't have last.
export function travelWorkoutsFor(setup: TravelSetup, packed: TravelGear[]) {
  const fits = TRAVEL_WORKOUTS.filter(w => fitsSetup(w, setup, packed));
  const rank = (w: TravelWorkout) => (w.setup === setup ? 0 : 1);
  fits.sort((a, b) => rank(a) - rank(b) || b.requires.length - a.requires.length);
  const others = TRAVEL_WORKOUTS.filter(w => !fits.includes(w));
  return { fits, others };
}

// Today's suggestion: the fitting workout done least recently (never-done first).
export function pickTravelWorkout(fits: TravelWorkout[], lastDone: Record<string, number>): TravelWorkout | null {
  if (!fits.length) return null;
  return [...fits].sort((a, b) => (lastDone[a.id] ?? 0) - (lastDone[b.id] ?? 0))[0];
}
