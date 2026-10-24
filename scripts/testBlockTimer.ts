// Run: node --experimental-strip-types scripts/testBlockTimer.ts
import { eventsBetween, displayAt, eventsAt, formatBlockResult, compareResults, blockKey } from '../src/utils/blockTimer.ts';
const assert = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
// EMOM 16 x 60
const emom = { kind: 'emom' as const, totalSec: 960, intervalSec: 60 };
const all = eventsBetween(emom, -1, 960);
const intervals = all.filter(e => e.type === 'interval');
let ic = 0; for (let s = 0; s < 960; s++) ic += eventsAt(emom, s).filter(e => e.type === 'interval').length; assert(ic === 16, 'emom 16 interval starts');
assert((eventsAt(emom, 900).find(e => e.type === 'interval') as any).index === 15, 'emom index');
// countdown per minute: 3 per minute *16 = 48 when stepping 1s at a time
let cd = 0; for (let s = 0; s < 960; s++) cd += eventsAt(emom, s).filter(e => e.type === 'countdown').length;
assert(cd === 48, 'emom 3-2-1 every minute: ' + cd);
assert(eventsAt(emom, 960)[0].type === 'end', 'emom ends at 960');
assert(displayAt(emom, 0).mainSec === 60 && displayAt(emom, 59).mainSec === 1 && displayAt(emom, 60).mainSec === 60, 'emom display per minute');
assert(displayAt(emom, 61).intervalIdx === 1 && displayAt(emom, 960).intervalIdx === 15 && displayAt(emom, 960).totalLeft === 0, 'emom idx clamp');
assert(JSON.stringify(eventsAt(emom, 57)) === '[{"type":"countdown","n":3}]', 'emom 57 -> 3');
// late tick: from 55 to 59 => only last countdown kept
const late = eventsBetween(emom, 55, 59);
assert(late.length === 1 && (late[0] as any).n === 1, 'late batch keeps only latest countdown');
const late2 = eventsBetween(emom, 58, 61);
assert(late2.map(e => e.type).join() === 'interval', 'late across minute: ' + late2.map(e => e.type).join());
// AMRAP 20
const amrap = { kind: 'amrap' as const, totalSec: 1200, intervalSec: 60 };
const a = eventsBetween(amrap, -1, 1200).map(e => e.type);
assert(a[0] === 'start' && a.includes('halfway') && a.includes('oneMinute') && a[a.length - 1] === 'end', 'amrap events ' + a.join());
assert(a.filter(x => x === 'countdown').length === 0, 'amrap batch: stale countdown before end dropped');
let acd = 0; for (let s = 0; s < 1200; s++) acd += eventsAt(amrap, s).filter(e => e.type === 'countdown').length;
assert(acd === 3, 'amrap 3-2-1 only at end');
assert(displayAt(amrap, 0).mainSec === 1200 && displayAt(amrap, 1199).mainSec === 1, 'amrap countdown display');
assert(eventsAt(amrap, 600).some(e => e.type === 'halfway') && eventsAt(amrap, 1140).some(e => e.type === 'oneMinute'), 'amrap halfway/1min');
// short AMRAP 2 min: no halfway / oneMinute
const short = { kind: 'amrap' as const, totalSec: 120, intervalSec: 60 };
assert(!eventsBetween(short, -1, 120).some(e => e.type === 'halfway' || e.type === 'oneMinute'), 'short amrap no extras');
// For time uncapped
const ft = { kind: 'fortime' as const, totalSec: null, intervalSec: 60 };
assert(eventsBetween(ft, -1, 5000).filter(e => e.type !== 'start').length === 0, 'uncapped fortime silent');
assert(displayAt(ft, 754).mainSec === 754, 'fortime counts up');
const ftc = { kind: 'fortime' as const, totalSec: 1080, intervalSec: 60 };
assert(eventsAt(ftc, 1080)[0].type === 'end' && displayAt(ftc, 2000).mainSec === 1080, 'fortime cap');
// formatting / compare
assert(formatBlockResult({ kind: 'amrap', key: '', label: '', rounds: 7, extraReps: 5 }) === '7 rounds + 5 reps', 'fmt amrap');
assert(formatBlockResult({ kind: 'fortime', key: '', label: '', timeSec: 754 }) === '12:34', 'fmt fortime');
assert(formatBlockResult({ kind: 'emom', key: '', label: '', intervalsDone: 14, intervalsPlanned: 16 }) === '14/16 min', 'fmt emom');
assert(compareResults({ kind: 'amrap', key: '', label: '', rounds: 7, extraReps: 1 }, { kind: 'amrap', key: '', label: '', rounds: 6, extraReps: 30 }) > 0, 'amrap compare');
assert(compareResults({ kind: 'fortime', key: '', label: '', timeSec: 700 }, { kind: 'fortime', key: '', label: '', timeSec: 800 }) > 0, 'fortime faster wins');
assert(compareResults({ kind: 'fortime', key: '', label: '', timeSec: 2000 }, { kind: 'fortime', key: '', label: '', timeSec: 800, capped: true }) > 0, 'uncapped beats capped');
assert(blockKey('amrap', ['Pull-Up', 'KB Swing']) === blockKey('amrap', ['pull-up ', 'kb swing']), 'key normalisation');
const gap = eventsBetween(emom, 100, 290);
assert(gap.filter(e => e.type === 'interval').length === 1 && (gap.find(e => e.type === 'interval') as any).index === 4, 'backgrounded gap announces only latest minute');
