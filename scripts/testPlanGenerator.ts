// Run: node --experimental-strip-types scripts/testPlanGenerator.ts
import {
  generatePlan, generateTravelWorkouts, parseEquipment, travelGear, noGear, planInputsKey,
  estimateMinutes, weekFocuses, isBodyweightMove, splitSession,
} from '../src/utils/planGenerator.ts';
import type { PlanInputs } from '../src/utils/planGenerator.ts';
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };

const HOME = [
  'Bench', '5lb DB', '8lb DB', '10lb DB', '15lb DB', '20lb DB', '25lb DB',
  '20lb KB', '35lb KB', '50lb KB', 'Pull-Up Bar', 'TRX Straps', '50lb Sandbag', '25lb Weighted Vest',
  'Ruck Sack', 'Rowing Machine', 'Plyo Box', 'Kickboxing Bag', 'Bosu Ball', 'Resistance Bands', 'Jump Rope', 'Bike Trainer',
];
const base: PlanInputs = { age: 53, workoutTypes: ['mixed'], sessionMinutes: 35, programLengthWeeks: 6, gear: parseEquipment(HOME) };
const allEx = (p: any) => p.weeks.flatMap((w: any) => w.workouts.flatMap((wo: any) => wo.sections.flatMap((s: any) => s.exercises)));
const mainEx = (wo: any) => wo.sections.filter((s: any) => !/warm|cool/i.test(s.name)).flatMap((s: any) => s.exercises);

// Equipment parsing
const g = parseEquipment(HOME);
assert(g.db.join() === '5,8,10,15,20,25', 'parses dumbbell weights');
assert(g.kb.join() === '20,35,50', 'parses kettlebell weights');
assert(g.sandbag.join() === '50' && g.kb.length === 3, 'sandbag is not a kettlebell or a punch bag');
assert(g.pullup && g.trx && g.rower && g.bike && g.box && g.bag && g.ruck && g.bands && g.rope && g.vest && g.bench, 'parses gear flags');
assert(parseEquipment(['Dumbbells']).db.length === 2, 'weightless dumbbells get a default pair');

// Shape
const p = generatePlan(base, 42);
assert(p.weeks.length === 6, '6-week plan');
assert(p.weeks.every(w => w.workouts.length === 5), '5 workouts a week');
assert(new Set(p.weeks.flatMap(w => w.workouts.map((x: any) => x.id))).size === 30, 'unique workout ids');
assert(p.weeks.map(w => w.phase).join() === 'foundation,foundation,load,load,peak,deload', 'phases');
assert(generatePlan({ ...base, programLengthWeeks: 4 }, 42).weeks.length === 4, '4-week plan');
assert(generatePlan({ ...base, programLengthWeeks: 5 }, 42).weeks.length === 5, '5-week plan');

// Determinism vs. rebuild variety
assert(JSON.stringify(generatePlan(base, 42, new Date(0)).weeks) === JSON.stringify(generatePlan(base, 42, new Date(0)).weeks), 'same seed, same plan');
const names = (pl: any) => allEx(pl).map((e: any) => e.name).join('|');
assert(names(generatePlan(base, 1)) !== names(generatePlan(base, 2)), 'new seed gives a different plan');

// Inputs change the plan
assert(planInputsKey(base) !== planInputsKey({ ...base, sessionMinutes: 45 }), 'key changes with session length');
assert(planInputsKey(base) !== planInputsKey({ ...base, gear: parseEquipment(HOME.slice(1)) }), 'key changes with equipment');
assert(planInputsKey(base) === planInputsKey({ ...base, workoutTypes: ['mixed'] }), 'key stable for same inputs');

// No equipment → bodyweight only
const bw = generatePlan({ ...base, gear: noGear() }, 7);
const bwMain = bw.weeks.flatMap(w => w.workouts.flatMap(mainEx));
const nonBw = bwMain.filter((e: any) => e.weight > 0);
assert(nonBw.length === 0, 'no equipment: no weights ' + nonBw.map((e: any) => e.name).join());
assert(bwMain.every((e: any) => isBodyweightMove(e.name) || /Cardio|Fast Feet|March/.test(e.name)), 'no equipment: only bodyweight moves');
assert(bw.weeks.every(w => w.workouts.every((wo: any) => wo.equipment.join() === 'Bodyweight')), 'no equipment: listed as Bodyweight');

// "Bodyweight" style ignores the equipment list
const bwStyle = generatePlan({ ...base, workoutTypes: ['bodyweight'] }, 7);
assert(allEx(bwStyle).every((e: any) => !e.weight), 'bodyweight style uses no weights');

// Styles drive the week
assert(weekFocuses(['cardio']).every(f => f.startsWith('cardio')), 'cardio only: all cardio days');
assert(weekFocuses(['strength']).every(f => f.startsWith('strength')), 'strength only: all strength days');
const sc = weekFocuses(['strength', 'cardio']);
assert(sc[0].startsWith('strength') && sc[1].startsWith('cardio') && sc[2].startsWith('strength'), 'strength + cardio alternate');
const many = weekFocuses(['hiit', 'strength', 'mixed', 'cardio']);
assert(new Set(many).size === many.length, 'several styles: no repeated day in a week ' + many.join());
const cf = generatePlan({ ...base, workoutTypes: ['crossfit'] }, 4).weeks[0].workouts;
const blockSig = (wo: any) => wo.sections.filter((x: any) => x.amrap || x.emom || x.forTime)[0].exercises.map((e: any) => e.name).join();
assert(blockSig(cf[0]) !== blockSig(cf[3]), 'crossfit only: repeated AMRAP day uses different movements');
const cardioPlan = generatePlan({ ...base, workoutTypes: ['cardio'] }, 3);
assert(cardioPlan.weeks[0].workouts.every((w: any) => w.type === 'cardio'), 'cardio plan is all cardio workouts');

// Session length is respected
for (const minutes of [15, 20, 35, 50, 75]) {
  for (const types of [['strength'], ['hiit'], ['crossfit'], ['cardio'], ['mixed'], ['bodyweight']] as any[]) {
    const pl = generatePlan({ ...base, sessionMinutes: minutes, workoutTypes: types }, 11);
    const est = pl.weeks.filter(w => w.phase !== 'deload').flatMap(w => w.workouts.map(estimateMinutes));
    const worst = est.reduce((m, e) => Math.max(m, Math.abs(e - minutes) / minutes), 0);
    assert(worst <= 0.25, `${types} ${minutes} min fits (worst off by ${(worst * 100).toFixed(0)}%)`);
    const deload = pl.weeks.filter(w => w.phase === 'deload').flatMap(w => w.workouts.map(estimateMinutes));
    assert(deload.every(e => e >= minutes * 0.5 && e <= minutes * 1.1), `${types} ${minutes} min deload is shorter, not tiny`);
  }
}
assert(splitSession(35).warmup + splitSession(35).main + splitSession(35).cooldown === 35, 'session split adds up');

// Unilateral pairs stay paired
const pairsOk = allEx(p).every((e: any, i: number, xs: any[]) =>
  !/ \(Right\)$/.test(e.name) || xs[i + 1]?.name === e.name.replace('(Right)', '(Left)'));
assert(pairsOk, 'every (Right) is followed by its (Left)');

// Progression: same moves across a slot, dose changes
const w1 = mainEx(p.weeks[0].workouts[0]).map((e: any) => e.name).join();
const w3 = mainEx(p.weeks[2].workouts[0]).map((e: any) => e.name).join();
assert(w1 === w3, 'week 3 repeats week 1 moves');
const r1 = mainEx(p.weeks[0].workouts[0])[0], r5 = mainEx(p.weeks[4].workouts[0])[0], r6 = mainEx(p.weeks[5].workouts[0])[0];
assert(r5.weight > r1.weight || r5.reps !== r1.reps, `peak week changes the dose (${r1.reps}@${r1.weight} → ${r5.reps}@${r5.weight})`);
assert(r6.sets < r5.sets, 'deload has fewer sets');

// Benchmarks
const bench = p.weeks.flatMap(w => w.workouts.filter((x: any) => x.benchmarkWorkout));
assert(bench.length === 2, 'benchmark in first and last week');
const blockNames = (wo: any) => wo.sections.filter((s: any) => s.amrap || s.emom || s.forTime)[0].exercises.map((e: any) => e.name + e.reps).join();
assert(blockNames(bench[0]) === blockNames(bench[1]), 'retest uses the same movements and reps');

// 60+ avoids jumping when there is an alternative
const older = generatePlan({ ...base, age: 65 }, 5);
const jumps = allEx(older).filter((e: any) => /Jump Squat|Broad Jump|Box Jump|Burpee|Jumping Jack|High Knees/.test(e.name));
assert(jumps.length === 0, '60+ gets no jumping moves: ' + [...new Set(jumps.map((e: any) => e.name))].join());

// Timed blocks are valid for the player
const blocks = p.weeks.flatMap(w => w.workouts.flatMap((wo: any) => wo.sections.filter((s: any) => s.amrap || s.emom || s.forTime)));
assert(blocks.length > 0 && blocks.every((s: any) => s.exercises.length > 0), 'blocks have movements');
assert(blocks.filter((s: any) => s.forTime).every((s: any) => s.rounds >= 2 && s.timeCap > 0), 'for-time blocks have rounds and a cap');

// Travel
const room = generateTravelWorkouts({ ...base, gear: travelGear('room', ['bands']) }, 9);
assert(room.length >= 3, 'travel: at least 3 workouts');
assert(room.every((w: any) => w.travel === true && w.id.startsWith('t')), 'travel workouts are flagged');
assert(allEx({ weeks: [{ workouts: room }] }).every((e: any) => !e.weight), 'hotel room + bands: no weights');
const roomNames = allEx({ weeks: [{ workouts: room }] }).map((e: any) => e.name);
assert(roomNames.some((n: string) => /^Band /.test(n) || n.startsWith('Pallof')), 'hotel room + bands: uses the bands');
const gym = generateTravelWorkouts({ ...base, gear: travelGear('gym', []) }, 9);
assert(allEx({ weeks: [{ workouts: gym }] }).some((e: any) => e.weight > 0), 'hotel gym uses dumbbells');
const short = generateTravelWorkouts({ ...base, sessionMinutes: 20, gear: travelGear('bodyweight', []) }, 9);
assert(short.every((w: any) => w.duration === 20 && Math.abs(estimateMinutes(w) - 20) / 20 <= 0.35), 'travel follows session length');
assert(JSON.stringify(generateTravelWorkouts({ ...base, gear: travelGear('gym', []) }, 9)) !== JSON.stringify(room), 'setup changes travel workouts');
