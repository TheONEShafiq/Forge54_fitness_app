import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Modal, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { saveWorkoutLog } from '../store/workoutStore';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import workoutData from '../../workouts.json';

const C = {
  bg: '#0a0a0a', card: '#141414', elevated: '#1c1c1c',
  text: '#f5f5f5', textMid: '#aaaaaa', textDim: '#666666',
  border: '#2a2a2a', borderLight: '#333333',
  lime: '#a3e635', cooldown: '#a78bfa', success: '#4ade80',
  rest: '#3b82f6',
};
const PHASE_COLOR: Record<string, string> = {
  warmup: C.lime, work: C.lime, cooldown: C.cooldown, rest: C.rest,
};

// ── Rest durations by block type (seconds) ───────────────────────────────────
const REST_BY_TYPE: Record<string, number> = {
  tabata: 10,        // Tabata: strict 10s rest
  hiit: 20,          // HIIT: short rest
  conditioning: 30,  // Conditioning circuits
  strength: 60,      // Strength blocks
  functional: 45,    // Functional circuits
  warmup: 0,         // No rest in warmup
  cooldown: 0,       // No rest in cooldown
};

function getRestDuration(sectionName: string, workoutType: string): number {
  const s = sectionName.toLowerCase();
  if (s.includes('tabata')) return REST_BY_TYPE.tabata;
  if (s.includes('hiit') || s.includes('emom') || s.includes('amrap')) return REST_BY_TYPE.hiit;
  if (s.includes('warm') || s.includes('cool')) return 0;
  if (workoutType === 'conditioning') return REST_BY_TYPE.conditioning;
  if (workoutType === 'functional') return REST_BY_TYPE.functional;
  return REST_BY_TYPE.strength;
}

// ── Tabata & Interval definitions ─────────────────────────────────────────────
interface IntervalDef {
  rounds: number; workSec: number; restSec: number;
  workLabel: string; restLabel: string; isTabata?: boolean;
}
const INTERVAL_MAP: Record<string, IntervalDef> = {
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
const UNI_KEYWORDS = [
  'single-arm','single arm','single-leg','single leg','rdl','lunge',
  'step-up','step up','hip flexor','pigeon','figure-4','figure 4',
  'hamstring stretch','quad stretch','lizard','90/90','band shoulder',
  'leg swing','doorway','couch stretch','carry','row',
];
function isUnilateral(name: string) {
  const n = name.toLowerCase();
  return UNI_KEYWORDS.some(u => n.includes(u));
}

// ── Substitutions ─────────────────────────────────────────────────────────────
const SUBS: Record<string, any[]> = {
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
function getSubs(name: string) { return SUBS[name] || SUBS['default']; }

// ── Flatten — unilateral cooldown stretches split L/R ─────────────────────────
function flattenExercises(workout: any) {
  const exs: any[] = [];
  workout.sections.forEach((s: any) => {
    const phase = s.name.toLowerCase().includes('warm') ? 'warmup' :
                  s.name.toLowerCase().includes('cool') ? 'cooldown' : 'work';
    const restSec = getRestDuration(s.name, workout.type);
    s.exercises.forEach((ex: any) => {
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

// ── Speech helper ─────────────────────────────────────────────────────────────
function safeSpeak(text: string) {
  try {
    Speech.stop();
    Speech.speak(text, { language: 'en-US', pitch: 1.0, rate: 0.88 });
  } catch {}
}

function announceExercise(ex: any) {
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
  safeSpeak(text);
}

// ── Main component ────────────────────────────────────────────────────────────
type TimerMode = 'exercise' | 'rest' | 'interval_work' | 'interval_rest' | 'countdown';

export default function WorkoutPlayerScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();
  const [view, setView] = useState<'list'|'exercise'>('list');
  const [exIdx, setExIdx] = useState(0);
  const [exerciseList, setExerciseList] = useState<any[]>([]);

  // Set logging — stores all sets for all exercises
  const [allSetLogs, setAllSetLogs] = useState<Record<number, any[]>>({});

  // Timer state
  const [timerValue, setTimerValue] = useState(0);
  const [timerMode, setTimerMode] = useState<TimerMode>('exercise');
  const [timerRunning, setTimerRunning] = useState(false);
  const [countdown, setCountdown] = useState<number|null>(null);

  // Interval state
  const [intervalRound, setIntervalRound] = useState(1);
  const [intervalIsWork, setIntervalIsWork] = useState(true);

  const [showSwap, setShowSwap] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentSetIdx, setCurrentSetIdx] = useState(0);

  const timerRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const autoAdvanceRef = useRef<any>(null);

  const workout = useMemo(() => {
    for (const week of workoutData.weeks) {
      const found = (week.workouts as any[]).find((w: any) => w.id === workoutId);
      if (found) return found;
    }
    return workoutData.weeks[0].workouts[0];
  }, [workoutId]);

  useEffect(() => {
    const exs = flattenExercises(workout);
    setExerciseList(exs);
    activateKeepAwakeAsync();
    sessionRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => {
      deactivateKeepAwake();
      clearInterval(sessionRef.current);
      clearInterval(timerRef.current);
      clearTimeout(autoAdvanceRef.current);
      Speech.stop();
    };
  }, [workout]);

  // Initialize exercise
  useEffect(() => {
    const ex = exerciseList[exIdx];
    if (!ex) return;
    clearInterval(timerRef.current);
    clearTimeout(autoAdvanceRef.current);
    setTimerRunning(false);
    setCountdown(null);
    setIntervalRound(1);
    setIntervalIsWork(true);
    setTimerMode('exercise');

    if (ex.type === 'sets') {
      // Build alternating L/R set entries for unilateral non-split exercises
      const uni = isUnilateral(ex.name) && !ex.side;
      const totalRows = uni ? (ex.sets || 3) * 2 : (ex.sets || 3);
      if (!allSetLogs[exIdx]) {
        const entries = Array.from({ length: totalRows }, (_, i) => ({
          reps: ex.reps || 0,
          weight: ex.weight || 0,
          completed: false,
          label: uni
            ? (i % 2 === 0 ? `Set ${Math.floor(i/2)+1} — Left` : `Set ${Math.floor(i/2)+1} — Right`)
            : `Set ${i+1}`,
        }));
        setAllSetLogs(prev => ({ ...prev, [exIdx]: entries }));
      }
    } else {
      const intDef = INTERVAL_MAP[ex.name];
      setTimerValue(intDef ? intDef.workSec : (ex.duration || 0));
    }

    setTimeout(() => announceExercise(ex), 300);
  }, [exIdx, exerciseList]);

  const currentEx = exerciseList[exIdx];
  const setEntries = allSetLogs[exIdx] || [];
  const intDef = currentEx ? INTERVAL_MAP[currentEx.name] : null;

  // ── Timer engine ─────────────────────────────────────────────────────────────
  function startCountdownThen(onDone: () => void) {
    let c = 3;
    setCountdown(c);
    safeSpeak('3');
    const cd = setInterval(() => {
      c--;
      if (c > 0) { setCountdown(c); safeSpeak(String(c)); }
      else {
        clearInterval(cd);
        setCountdown(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onDone();
      }
    }, 1000);
    timerRef.current = cd;
  }

  function startRestTimer(seconds: number, onDone: () => void) {
    setTimerMode('rest');
    setTimerValue(seconds);
    setTimerRunning(true);
    safeSpeak(`Rest. ${seconds} seconds.`);
    timerRef.current = setInterval(() => {
      setTimerValue(v => {
        if (v <= 4 && v > 1) { }
        if (v <= 1) {
          clearInterval(timerRef.current);
          setTimerRunning(false);
          startCountdownThen(onDone);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  function startExerciseTimer() {
    const ex = currentEx;
    if (!ex || ex.type !== 'time') return;

    if (intDef) {
      // Interval / Tabata mode
      setTimerMode('interval_work');
      setTimerValue(intDef.workSec);
      setTimerRunning(true);
      safeSpeak(`Interval 1 of ${intDef.rounds}. ${intDef.workLabel}.`);
      runIntervalTick(intDef, 1, true);
    } else {
      // Simple timed exercise
      setTimerMode('exercise');
      setTimerValue(ex.duration || 0);
      setTimerRunning(true);
      timerRef.current = setInterval(() => {
        setTimerValue(v => {
          if (v === 4) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            startCountdownThen(() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // Auto-advance to rest or next exercise
              const restSec = ex.restAfter || 0;
              if (restSec > 0) {
                startRestTimer(restSec, () => advanceExercise());
              } else {
                advanceExercise();
              }
            });
            return 3;
          }
          return v - 1;
        });
      }, 1000);
    }
  }

  function runIntervalTick(def: IntervalDef, round: number, isWork: boolean) {
    clearInterval(timerRef.current);
    const duration = isWork ? def.workSec : def.restSec;
    setIntervalRound(round);
    setIntervalIsWork(isWork);
    setTimerMode(isWork ? 'interval_work' : 'interval_rest');
    setTimerValue(duration);
    setTimerRunning(true);

    timerRef.current = setInterval(() => {
      setTimerValue(v => {
        if (v === 4) {
          clearInterval(timerRef.current);
          setTimerRunning(false);
          startCountdownThen(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const nextIsWork = !isWork;
            const nextRound = nextIsWork ? round : round + 1;
            if (!isWork && round >= def.rounds) {
              // All intervals done
              safeSpeak('All intervals complete. Great work.');
              const restSec = currentEx?.restAfter || 0;
              if (restSec > 0) startRestTimer(restSec, () => advanceExercise());
              else advanceExercise();
              return 0;
            }
            const label = nextIsWork ? def.workLabel : def.restLabel;
            const announcement = nextIsWork
              ? `Interval ${nextRound} of ${def.rounds}. ${label}.`
              : `Rest. ${label}.`;
            safeSpeak(announcement);
            runIntervalTick(def, nextIsWork ? nextRound : round, nextIsWork);
          });
          return 3;
        }
        return v - 1;
      });
    }, 1000);
  }

  function toggleTimer() {
    if (timerRunning) {
      clearInterval(timerRef.current);
      setTimerRunning(false);
    } else {
      if (timerMode === 'rest') {
        // Resume rest timer
        startRestTimer(timerValue, () => advanceExercise());
      } else {
        startExerciseTimer();
      }
    }
  }

  function advanceExercise() {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    setCountdown(null);
    if (exIdx < exerciseList.length - 1) {
      setExIdx(i => i + 1);
    } else {
      handleComplete();
    }
  }

  function goNext() {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    setCountdown(null);
    Speech.stop();

    const ex = currentEx;
    if (!ex) return;

    if (ex.type === 'sets' && ex.restAfter > 0) {
      const entries = allSetLogs[exIdx] || [];
      const completedSets = entries.filter((e: any) => e.completed).length;
      const totalSets = entries.length;
      const isLastSet = completedSets >= totalSets;

      if (isLastSet) {
        // All sets done — move to next exercise
        advanceExercise();
      } else {
        // More sets remain — rest then return to same exercise
        startRestTimer(ex.restAfter, () => {
          // Stay on same exercise, just announce it again
          safeSpeak('Next set.');
          setTimerMode('exercise');
        });
      }
    } else {
      advanceExercise();
    }
  }

  function skipRest() {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerMode('exercise');
    setCountdown(null);
    safeSpeak('Skipping rest.');
    const ex = currentEx;
    if (!ex) return;
    const entries = allSetLogs[exIdx] || [];
    const completedSets = entries.filter((e: any) => e.completed).length;
    const totalSets = entries.length;
    if (completedSets >= totalSets) {
      advanceExercise();
    }
  }

  function handleComplete() {
    safeSpeak('Workout complete. Great job today.');
    saveWorkoutLog({ id: workout.id, completedAt: new Date().toISOString(), durationMinutes: Math.round(elapsed / 60), exercises: [], status: 'complete' });
    router.replace({ pathname: '/complete', params: { workoutId: workout.id, duration: String(Math.round(elapsed / 60)) } });
  }

  function updateSetEntry(idx: number, field: 'reps' | 'weight', value: number) {
    setAllSetLogs(prev => ({
      ...prev,
      [exIdx]: (prev[exIdx] || []).map((e: any, i: number) =>
        i === idx ? { ...e, [field]: value } : e
      )
    }));
  }

  function toggleSetComplete(idx: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAllSetLogs(prev => ({
      ...prev,
      [exIdx]: (prev[exIdx] || []).map((e: any, i: number) =>
        i === idx ? { ...e, completed: !e.completed } : e
      )
    }));
  }

  function doSwap(sub: any) {
    setExerciseList(prev => prev.map((ex, i) => i === exIdx ? { ...sub, sectionName: ex.sectionName, restAfter: ex.restAfter, displayName: sub.name } : ex));
    setAllSetLogs(prev => { const n = { ...prev }; delete n[exIdx]; return n; });
    setShowSwap(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const elapsedStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const isResting = timerMode === 'rest';
  const phaseColor = isResting ? C.rest : PHASE_COLOR[currentEx?.phase || 'work'];

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  if (view === 'list') {
    const sections: Record<string, any[]> = {};
    exerciseList.forEach((ex, i) => {
      if (!sections[ex.sectionName]) sections[ex.sectionName] = [];
      sections[ex.sectionName].push({ ...ex, idx: i });
    });
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={s.backBtn}>← Back</Text></TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{workout.title}</Text>
          <Text style={s.elapsedText}>{elapsedStr}</Text>
        </View>
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          {Object.entries(sections).map(([sectionName, exs]) => (
            <View key={sectionName} style={s.section}>
              <Text style={s.sectionLabel}>{sectionName.toUpperCase()}</Text>
              {exs.map((ex) => {
                const isDone = ex.idx < exIdx;
                const isCurrent = ex.idx === exIdx;
                const def = INTERVAL_MAP[ex.name];
                return (
                  <TouchableOpacity key={ex.idx} style={[s.exRow, isCurrent && s.exRowCurrent, isDone && s.exRowDone]} onPress={() => { setExIdx(ex.idx); setView('exercise'); }}>
                    <View style={[s.exDot, { backgroundColor: isCurrent ? C.lime : isDone ? C.success : C.elevated }]}>
                      <Text style={[s.exDotText, { color: (isCurrent || isDone) ? C.bg : C.textMid }]}>{isDone ? '✓' : ex.idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.exRowName, isDone && { color: C.textDim }]}>{ex.displayName || ex.name}</Text>
                      <Text style={s.exRowMeta}>
                        {ex.type === 'sets'
                          ? `${ex.sets} sets × ${ex.reps} reps${ex.weight > 0 ? ` · ${ex.weight} lb` : ''}${isUnilateral(ex.name) && !ex.side ? ' (L+R)' : ''}`
                          : def
                            ? `${def.isTabata ? 'Tabata · ' : ''}${def.rounds} rounds · ${def.workSec}s on / ${def.restSec}s off`
                            : `${Math.floor((ex.duration||0)/60)}:${String((ex.duration||0)%60).padStart(2,'0')}`}
                        {ex.restAfter > 0 && !def ? ` · ${ex.restAfter}s rest` : ''}
                      </Text>
                    </View>
                    {isCurrent && <Text style={s.currentTag}>Current ▶</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
        <View style={s.controls}>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: C.lime }]} onPress={() => setView('exercise')}>
            <Text style={s.nextBtnText}>▶  Resume Current Exercise</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── EXERCISE VIEW ────────────────────────────────────────────────────────────
  if (!currentEx) return null;
  const progress = (exIdx / exerciseList.length) * 100;
  const timerMins = Math.floor(timerValue / 60);
  const timerSecs = timerValue % 60;
  const timerDisplay = timerMins > 0
    ? `${timerMins}:${String(timerSecs).padStart(2, '0')}`
    : `${timerSecs}`;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setView('list')}><Text style={s.backBtn}>≡  All Exercises</Text></TouchableOpacity>
        <Text style={s.elapsedText}>{elapsedStr}</Text>
      </View>
      <View style={s.progressWrap}>
        <View style={[s.progressFill, { width: `${progress}%`, backgroundColor: phaseColor }]} />
      </View>
      <Text style={s.progressText}>{exIdx + 1} of {exerciseList.length}  ·  {currentEx.sectionName}</Text>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Phase / Rest badge */}
        <View style={[s.phaseBadge, { backgroundColor: phaseColor + '22', borderColor: phaseColor + '55' }]}>
          <Text style={[s.phaseBadgeText, { color: phaseColor }]}>
            {isResting ? 'REST' :
             currentEx.side ? currentEx.side.toUpperCase() :
             currentEx.phase === 'warmup' ? 'Warm-up' :
             currentEx.phase === 'cooldown' ? 'Cool-down' : 'Work'}
          </Text>
        </View>

        <Text style={s.exName}>{isResting ? 'Rest' : (currentEx.displayName || currentEx.name)}</Text>

        {!isResting && <View style={s.cueBox}><Text style={s.cueText}>{currentEx.cue}</Text></View>}

        {/* Timer display */}
        {(currentEx.type === 'time' || isResting) ? (
          <View style={s.timerBlock}>
            {/* Tabata / Interval counter */}
            {intDef && !isResting && (
              <View style={s.intervalRow}>
                <View style={[s.intervalPill, { backgroundColor: intervalIsWork ? C.lime + '33' : C.rest + '33' }]}>
                  <Text style={[s.intervalPillText, { color: intervalIsWork ? C.lime : C.rest }]}>
                    {intDef.isTabata ? 'TABATA · ' : ''}{intervalIsWork ? 'WORK' : 'REST'}
                  </Text>
                </View>
                <Text style={s.intervalCount}>{intervalRound} / {intDef.rounds}</Text>
              </View>
            )}

            {/* Countdown overlay */}
            {countdown !== null ? (
              <Text style={[s.timerNum, { color: C.lime, fontSize: 100 }]}>{countdown}</Text>
            ) : (
              <Text style={[s.timerNum, isResting && { color: C.rest }]}>{timerDisplay}</Text>
            )}

            <Text style={[s.timerLabel, isResting && { color: C.rest }]}>
              {isResting ? 'REST' : (intDef ? (intervalIsWork ? 'WORK' : 'REST') : 'remaining')}
            </Text>

            {isResting ? (
        <View style={s.controls}>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: C.rest, flex: 1 }]} onPress={skipRest}>
            <Text style={s.nextBtnText}>Skip Rest ▶</Text>
          </TouchableOpacity>
        </View>
      ) : (
              <TouchableOpacity style={[s.timerBtn, { backgroundColor: phaseColor }]} onPress={toggleTimer}>
                <Text style={s.timerBtnText}>{timerRunning ? '⏸  Pause' : '▶  Start'}</Text>
              </TouchableOpacity>
            )}

            {isResting && (
              <View style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
                <Text style={s.restLabel}>
                  {(() => {
                    const entries = allSetLogs[exIdx] || [];
                    const done = entries.filter((e: any) => e.completed).length;
                    const total = entries.length;
                    return done >= total
                      ? `Next: ${exerciseList[exIdx + 1]?.displayName || exerciseList[exIdx + 1]?.name || 'Done'}`
                      : `Set ${done + 1} of ${total} up next`;
                  })()}
                </Text>
                <TouchableOpacity
                  style={[s.timerBtn, { backgroundColor: C.rest, paddingHorizontal: 32, marginTop: 4 }]}
                  onPress={skipRest}
                >
                  <Text style={s.timerBtnText}>Skip Rest ▶</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          /* Set logger */
          <View style={s.setLogBlock}>
            <Text style={s.setLogTitle}>
              Log your sets{isUnilateral(currentEx.name) && !currentEx.side ? ' — alternating L/R' : ''}
            </Text>
            <View style={s.setHeader}>
              <Text style={[s.setHeaderText, { flex: 1.6 }]}>Set</Text>
              <Text style={[s.setHeaderText, { flex: 1 }]}>Reps</Text>
              <Text style={[s.setHeaderText, { flex: 1 }]}>lbs</Text>
              <Text style={[s.setHeaderText, { width: 44 }]}>✓</Text>
            </View>
            {setEntries.map((entry: any, i: number) => (
              <View key={i} style={[s.setRow, entry.completed && s.setRowDone]}>
                <Text style={[s.setLabel, { flex: 1.6 }]}>{entry.label}</Text>
                <TextInput
                  style={[s.setInput, { flex: 1 }]}
                  value={String(entry.reps)}
                  onChangeText={v => updateSetEntry(i, 'reps', parseInt(v) || 0)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <TextInput
                  style={[s.setInput, { flex: 1, marginLeft: 8 }]}
                  value={entry.weight > 0 ? String(entry.weight) : ''}
                  placeholder="BW"
                  placeholderTextColor={C.textDim}
                  onChangeText={v => updateSetEntry(i, 'weight', parseInt(v) || 0)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={[s.setCheckBtn, { width: 44 }, entry.completed && { backgroundColor: C.success, borderColor: C.success }]}
                  onPress={() => toggleSetComplete(i)}
                >
                  <Text style={[s.setCheckText, entry.completed && { color: C.bg }]}>{entry.completed ? '✓' : '○'}</Text>
                </TouchableOpacity>
              </View>
            ))}
            {/* Rest indicator */}
            {currentEx.restAfter > 0 && (
              <View style={s.restHint}>
                <Text style={s.restHintText}>Rest between sets: {currentEx.restAfter}s — tap Next to start rest timer</Text>
              </View>
            )}
          </View>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Controls */}
      {isResting ? (
        <View style={s.controls}>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: C.rest, flex: 1 }]} onPress={skipRest}>
            <Text style={s.nextBtnText}>Skip Rest ▶</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.controls}>
          <TouchableOpacity style={s.swapBtn} onPress={() => setShowSwap(true)}>
            <Text style={s.swapBtnText}>⟳  Swap</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: phaseColor }]} onPress={goNext}>
            <Text style={s.nextBtnText}>{exIdx >= exerciseList.length - 1 ? 'Finish ✓' : currentEx.restAfter > 0 && currentEx.type === 'sets' ? 'Rest ▶' : 'Next ▶'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Swap modal */}
      <Modal visible={showSwap} transparent animationType="slide" onRequestClose={() => setShowSwap(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Substitute Exercise</Text>
            <Text style={s.modalSubtitle}>Replacing: {currentEx.displayName || currentEx.name}</Text>
            <ScrollView>
              {getSubs(currentEx.name).map((sub: any, i: number) => (
                <TouchableOpacity key={i} style={s.subOption} onPress={() => doSwap(sub)}>
                  <Text style={s.subName}>{sub.name}</Text>
                  <Text style={s.subCue} numberOfLines={2}>{sub.cue}</Text>
                  <Text style={s.subMeta}>
                    {sub.type === 'sets' ? `${sub.sets} × ${sub.reps} reps` : `${Math.floor((sub.duration||0)/60)}:${String((sub.duration||0)%60).padStart(2,'0')}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.modalCancel} onPress={() => setShowSwap(false)}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { fontSize: 14, color: C.textMid, fontWeight: '500' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  elapsedText: { fontSize: 13, color: C.textDim, minWidth: 40, textAlign: 'right' },
  progressWrap: { height: 3, backgroundColor: C.elevated, marginHorizontal: 16 },
  progressFill: { height: 3, borderRadius: 2 },
  progressText: { fontSize: 11, color: C.textDim, paddingHorizontal: 16, paddingTop: 4, marginBottom: 4 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: C.textMid, letterSpacing: 1.2, marginBottom: 8, marginTop: 8 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: C.card, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  exRowCurrent: { borderColor: C.lime + '88', backgroundColor: '#151a0a' },
  exRowDone: { opacity: 0.4 },
  exDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  exDotText: { fontSize: 11, fontWeight: '700' },
  exRowName: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 3 },
  exRowMeta: { fontSize: 12, color: C.textMid },
  currentTag: { fontSize: 11, fontWeight: '700', color: C.lime },
  phaseBadge: { alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, marginTop: 16, marginBottom: 8 },
  phaseBadgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  exName: { fontSize: 28, fontWeight: '700', color: C.text, lineHeight: 34, marginBottom: 10 },
  cueBox: { backgroundColor: C.card, borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: C.lime + '66', marginBottom: 14 },
  cueText: { fontSize: 14, color: C.textMid, lineHeight: 22 },
  timerBlock: { alignItems: 'center', paddingVertical: 24 },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  intervalPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  intervalPillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  intervalCount: { fontSize: 20, fontWeight: '700', color: C.text },
  timerNum: { fontSize: 88, fontWeight: '700', color: C.text, letterSpacing: -4 },
  timerLabel: { fontSize: 12, color: C.textMid, marginBottom: 20, letterSpacing: 1 },
  timerBtn: { paddingHorizontal: 44, paddingVertical: 14, borderRadius: 999 },
  timerBtnText: { fontSize: 16, fontWeight: '700', color: C.bg },
  restLabel: { fontSize: 13, color: C.rest, marginTop: 12 },
  setLogBlock: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  setLogTitle: { fontSize: 13, fontWeight: '600', color: C.textMid, marginBottom: 10 },
  setHeader: { flexDirection: 'row', marginBottom: 6, alignItems: 'center' },
  setHeaderText: { fontSize: 11, color: C.textDim, fontWeight: '600' },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.elevated },
  setRowDone: { opacity: 0.45 },
  setLabel: { fontSize: 12, color: C.textMid, fontWeight: '600' },
  setInput: { backgroundColor: C.elevated, borderRadius: 8, padding: 8, fontSize: 16, fontWeight: '600', color: C.text, textAlign: 'center', borderWidth: 1, borderColor: C.border },
  setCheckBtn: { alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: 8, borderWidth: 1, borderColor: C.borderLight },
  setCheckText: { fontSize: 16, color: C.textDim },
  restHint: { marginTop: 10, padding: 10, backgroundColor: C.rest + '15', borderRadius: 8, borderWidth: 1, borderColor: C.rest + '33' },
  restHintText: { fontSize: 12, color: C.rest },
  controls: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.elevated },
  swapBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center' },
  swapBtnText: { fontSize: 14, color: C.textMid, fontWeight: '600' },
  nextBtn: { flex: 2, padding: 14, borderRadius: 10, alignItems: 'center' },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: C.bg },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '75%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: C.textMid, marginBottom: 16 },
  subOption: { backgroundColor: C.elevated, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  subName: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  subCue: { fontSize: 12, color: C.textMid, lineHeight: 18, marginBottom: 6 },
  subMeta: { fontSize: 11, color: C.lime, fontWeight: '600' },
  modalCancel: { padding: 14, alignItems: 'center', marginTop: 4 },
  modalCancelText: { fontSize: 15, color: C.textMid },
});
