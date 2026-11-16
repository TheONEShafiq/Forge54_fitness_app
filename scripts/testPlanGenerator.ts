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
const base1 = (wo: any) => [...new Set(mainEx(wo).map((e: any) => e.name.replace(/ \((Right|Left)\)$/, '')))];
const strengthDays = (pl: any, focus: string) => pl.weeks.map((w: any) => w.workouts.find((x: any) => x.focus === focus));
for (const focus of ['strength-a', 'strength-b']) {
  const days = strengthDays(p, focus).map(base1);
  assert(days.every((d: string[]) => d.slice(0, 2).join() === days[0].slice(0, 2).join()), `${focus}: anchor lifts are the same every week (${days[0].slice(0, 2).join(', ')})`);
  assert(days.slice(1).every((d: string[], i: number) => d.slice(2).join() !== days[i].slice(2).join()), `${focus}: accessories change week to week`);
}
const st1 = generatePlan({ ...base, workoutTypes: ['strength'] }, 42);
const lowerDays = strengthDays(st1, 'strength-lower').map(base1);
assert(lowerDays.every((d: string[]) => d.slice(0, 2).join() === lowerDays[0].slice(0, 2).join()) && lowerDays[0].join() !== lowerDays[1].join(),
  'strength style: anchors fixed, accessories rotate');
const r1 = mainEx(p.weeks[0].workouts[0])[0], r5 = mainEx(p.weeks[4].workouts[0])[0], r6 = mainEx(p.weeks[5].workouts[0])[0];
assert(r5.weight > r1.weight || r5.reps !== r1.reps, `peak week changes the dose (${r1.reps}@${r1.weight} → ${r5.reps}@${r5.weight})`);
assert(r6.sets < r5.sets, 'deload has fewer sets');

// Benchmarks
const bench = p.weeks.flatMap(w => w.workouts.filter((x: any) => x.benchmarkWorkout));
assert(bench.length === 2, 'benchmark in first and last week');
const blockNames = (wo: any) => wo.sections.filter((s: any) => s.amrap || s.emom || s.forTime)[0].exercises.map((e: any) => e.name + e.reps).join();
assert(blockNames(bench[0]) === blockNames(bench[1]), 'retest uses the same movements and reps');

// Week-to-week variety
const sec = (wo: any, re: RegExp) => wo.sections.find((x: any) => re.test(x.name)).exercises.map((e: any) => e.name).join();
// Mixed moves days around, so compare the benchmark focus wherever it falls;
// the crossfit plan keeps a fixed layout and checks the week-2 rule as before.
const benchFocus = bench[0].focus;
const midBench = p.weeks.slice(1, -1).flatMap((w: any) => w.workouts.filter((x: any) => x.focus === benchFocus));
assert(midBench.length > 0 && midBench.every((x: any) => blockNames(x) !== blockNames(bench[0])), 'benchmark-style day uses other movements between benchmark and retest');
const cfp = generatePlan({ ...base, workoutTypes: ['crossfit'] }, 42);
const cfBench = cfp.weeks[0].workouts.findIndex((x: any) => x.benchmarkWorkout);
assert(blockNames(cfp.weeks[1].workouts[cfBench]) !== blockNames(cfp.weeks[0].workouts[cfBench]), 'week 2 benchmark-style day uses different movements than week 1');
const w1all = p.weeks[0].workouts.map((wo: any) => wo.sections.map((x: any) => x.exercises.map((e: any) => e.name).join()).join('|'));
const w2all = p.weeks[1].workouts.map((wo: any) => wo.sections.map((x: any) => x.exercises.map((e: any) => e.name).join()).join('|'));
assert(w1all.every((x: string, i: number) => x !== w2all[i]), 'every day of week 2 differs from week 1');
const cardioDays = cardioPlan.weeks.slice(0, 2).flatMap(w => w.workouts.map((x: any) => x.title));
assert(new Set(cardioDays).size > 2, 'cardio rotates machines when there are several: ' + [...new Set(cardioDays)].join(' / '));

// Mixed (v17): a rotating 4-week program
const mx = generatePlan({ ...base, programLengthWeeks: 4 }, 42);
const fx = (w: any) => w.workouts.map((x: any) => x.focus);
assert(mx.weeks.every((w: any) => ['strength-a', 'strength-b', 'cardio-steady', 'functional'].every(f => fx(w).includes(f))),
  'mixed: every week has strength A and B, Zone 2 and a functional day');
assert(mx.weeks.every((w: any, i: number) => i === 0 || fx(w).join() !== fx(mx.weeks[i - 1]).join()), 'mixed: the day order changes every week');
const hardDay = mx.weeks.map((w: any) => fx(w).find((f: string) => f.startsWith('wod') || f === 'cardio-vo2'));
assert(new Set(hardDay).size >= 3, 'mixed: the hard day rotates formats: ' + hardDay.join(' / '));
assert(mx.weeks[0].workouts.some((x: any) => x.benchmarkWorkout) && mx.weeks[3].workouts.some((x: any) => x.benchmarkWorkout), 'mixed: benchmark in week 1, retest in week 4');
const hardIdx = (w: any) => w.workouts.map((x: any, i: number) => /^(wod|cardio-vo2|functional)/.test(x.focus) ? i : -1).filter((i: number) => i >= 0);
assert(mx.weeks.every((w: any) => hardIdx(w).every((i: number, k: number, xs: number[]) => k === 0 || i - xs[k - 1] > 1)),
  'mixed: conditioning-heavy days are never back to back');
const allMain = new Set(mx.weeks.flatMap((w: any) => w.workouts.flatMap(base1)));
assert(allMain.size >= 35, `mixed: wide movement variety over 4 weeks (${allMain.size} distinct)`);
const func = mx.weeks.map((w: any) => w.workouts.find((x: any) => x.focus === 'functional'));
assert(func.every((x: any) => x.sections.some((s: any) => s.name === 'Power') && x.sections.some((s: any) => s.name === 'Carry & Balance')), 'functional day: power, then carries and balance');
assert(func.filter((x: any) => x.sections.some((s: any) => /Finisher/.test(s.name))).length >= 3, 'functional day: finisher on most weeks at 35 min');
assert(new Set(func.map((x: any) => base1(x).join())).size === 4, 'functional day: different moves every week');
const vo2 = mx.weeks.flatMap((w: any) => w.workouts.filter((x: any) => x.focus === 'cardio-vo2'));
assert(vo2.length > 0 && vo2.every((x: any) => mainEx(x)[0].duration >= 180 && mainEx(x)[0].sets <= 4), '4x4 day: 3–4 minute efforts, at most 4');
const squatAnchor = mainEx(strengthDays(mx, 'strength-a')[0])[0];
assert(squatAnchor.weight === 50, `anchor lift uses the heaviest implement (${squatAnchor.name} @ ${squatAnchor.weight})`);
const overheadDays = mx.weeks.map((w: any) => w.workouts.filter((x: any) => mainEx(x).some((e: any) => /Shoulder Press|Overhead Press|Pike Push-Up|Push Press|Thruster|Snatch/.test(e.name))).length);
assert(overheadDays.every((n: number) => n <= 3), 'overhead pressing on at most 3 days a week: ' + overheadDays.join());
assert(weekFocuses(['mixed']).join() === 'strength-lower,wod-emom,cardio-intervals,strength-upper,wod-amrap', 'mixed travel rotation unchanged');

// Warm-up and cool-down follow the day's work
const st = generatePlan({ ...base, workoutTypes: ['strength'] }, 42).weeks[0].workouts;
const lower = st.find((x: any) => x.focus === 'strength-lower'), upper = st.find((x: any) => x.focus === 'strength-upper');
assert(sec(lower, /cool/i) !== sec(upper, /cool/i), 'lower and upper days get different cool-downs');
assert(sec(lower, /warm/i) !== sec(upper, /warm/i), 'lower and upper days get different warm-ups');
assert(/Hip|Quad|Hamstring|Pigeon|Figure-Four|Butterfly|Frog|Couch/.test(sec(lower, /cool/i)), 'lower day stretches the legs: ' + sec(lower, /cool/i));
assert(/Chest|Shoulder|Triceps|Lat|Trap|Thread|Forearm/.test(sec(upper, /cool/i)), 'upper day stretches the upper body: ' + sec(upper, /cool/i));
const coolDowns = new Set(p.weeks.flatMap(w => w.workouts.map((x: any) => sec(x, /cool/i))));
assert(coolDowns.size >= 20, `cool-downs vary across the plan (${coolDowns.size} distinct of 30)`);
for (const minutes of [15, 35, 75]) {
  const pl = generatePlan({ ...base, sessionMinutes: minutes }, 3);
  const ok = pl.weeks.every(w => w.workouts.every((wo: any) => {
    const [wu, cd] = [/warm/i, /cool/i].map(re => wo.sections.find((x: any) => re.test(x.name)));
    const t = (x: any) => x.exercises.reduce((a: number, e: any) => a + e.duration, 0);
    return cd.exercises.length > 0 && t(cd) <= cd.duration * 60 && t(wu) <= Math.max(wu.duration * 60, 60 + 60) ;
  }));
  assert(ok, `${minutes} min: warm-up and cool-down fit their minutes`);
}
const noBar = generatePlan({ ...base, gear: noGear() }, 3);
assert(!allEx(noBar).some((e: any) => /Dead Hang|Scap Pull-Up|Band Dislocates/.test(e.name)), 'no equipment: no bar or band drills');

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
