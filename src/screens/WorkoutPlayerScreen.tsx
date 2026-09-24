import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Modal, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { saveWorkoutLog, isPerformed } from '../store/workoutStore';
import type { WorkoutLog, ExerciseLog } from '../store/workoutStore';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { speak, stopSpeech, playBell } from '../utils/ttsService';
import {
  INTERVAL_MAP, SUBS, getSubs,
  flattenExercises, buildExerciseAnnouncementText,
} from '../utils/workoutAnnouncements';
import type { IntervalDef } from '../utils/workoutAnnouncements';
import { resolveWorkout } from '../utils/workoutResolver';
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

// ── Speech helper ─────────────────────────────────────────────────────────────
function safeSpeak(text: string) {
  speak(text);
}

function announceExercise(ex: any) {
  safeSpeak(buildExerciseAnnouncementText(ex));
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
  // How each exercise ended; unset means it was never reached.
  const [exerciseOutcome, setExerciseOutcome] = useState<Record<number, 'done' | 'skipped'>>({});
  const [swappedFrom, setSwappedFrom] = useState<Record<number, string>>({});

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
  // Which of `sides` a timed unilateral exercise is on.
  const [sideIdx, setSideIdx] = useState(0);

  const timerRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const autoAdvanceRef = useRef<any>(null);
  const startedAtRef = useRef(new Date().toISOString());
  // Set once the session has been saved or discarded, so the beforeRemove
  // guard lets the navigation through.
  const allowLeaveRef = useRef(false);
  const navigation = useNavigation();

  const workout = useMemo(() => {
    for (const week of workoutData.weeks) {
      const found = (week.workouts as any[]).find((w: any) => w.id === workoutId);
      // Weeks 3+ mostly reference a week-1/2 workout via inheritFrom and carry
      // no `sections` of their own — resolveWorkout merges the base sections
      // with this workout's progressionOverrides before we ever flatten them.
      if (found) return resolveWorkout(found);
    }
    return resolveWorkout(workoutData.weeks[0].workouts[0]);
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
      stopSpeech();
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
    setSideIdx(0);

    if (ex.type === 'sets') {
      // Unilateral exercises get one row per side per set, in authored side order.
      const sides: string[] | undefined = ex.sides;
      const totalRows = (ex.sets || 3) * (sides ? sides.length : 1);
      if (!allSetLogs[exIdx]) {
        const entries = Array.from({ length: totalRows }, (_, i) => {
          const side = sides ? sides[i % sides.length] : undefined;
          const plan = side ? ex.perSide[side] : { reps: ex.reps || 0, weight: ex.weight || 0 };
          const setNum = sides ? Math.floor(i / sides.length) + 1 : i + 1;
          return {
            reps: plan.reps,
            weight: plan.weight,
            plannedReps: plan.reps,
            plannedWeight: plan.weight,
            side,
            completed: false,
            completedAt: null as string | null,
            label: side ? `Set ${setNum} — ${side === 'left' ? 'Left' : 'Right'}` : `Set ${setNum}`,
          };
        });
        setAllSetLogs(prev => ({ ...prev, [exIdx]: entries }));
      }
    } else {
      const intDef = INTERVAL_MAP[ex.name];
      setTimerValue(intDef ? intDef.workSec : (ex.duration || 0));
    }

    setTimeout(() => announceExercise(ex), 300);
  }, [exIdx, exerciseList]);

  // Timer callbacks close over the render that started them, so anything that
  // builds the session log reads through these instead of stale state.
  const liveRef = useRef({ exIdx, exerciseList, allSetLogs, exerciseOutcome, swappedFrom, elapsed });
  liveRef.current = { exIdx, exerciseList, allSetLogs, exerciseOutcome, swappedFrom, elapsed };

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
        playBell();
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

  function sideDuration(ex: any, side: number): number {
    return (ex.sides && ex.perSide[ex.sides[side]]?.duration) || ex.duration || 0;
  }

  function startExerciseTimer(side = sideIdx) {
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
      setTimerValue(sideDuration(ex, side));
      setTimerRunning(true);
      timerRef.current = setInterval(() => {
        setTimerValue(v => {
          if (v === 4) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            startCountdownThen(() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // Unilateral holds run the next side straight away — no rest between sides.
              if (ex.sides && side < ex.sides.length - 1) {
                setSideIdx(side + 1);
                safeSpeak('Switch sides.');
                startExerciseTimer(side + 1);
                return;
              }
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

  function advanceExercise(outcome: 'done' | 'skipped' = 'done') {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    setCountdown(null);
    const { exIdx: idx, exerciseList: list } = liveRef.current;
    const outcomes = { ...liveRef.current.exerciseOutcome, [idx]: outcome };
    liveRef.current.exerciseOutcome = outcomes;
    setExerciseOutcome(outcomes);
    if (idx < list.length - 1) {
      setExIdx(i => i + 1);
    } else {
      handleComplete();
    }
  }

  // After a set is completed (or skipped), rest and progression happen on
  // their own — no separate "Next/Rest" tap needed.
  function progressAfterSetChange(updatedEntries: any[], idx: number) {
    const ex = currentEx;
    const completedSets = updatedEntries.filter((e: any) => e.completed).length;
    const nextRow = updatedEntries[idx + 1];
    if (completedSets >= updatedEntries.length) {
      advanceExercise();
    } else if (ex?.sides && nextRow && !nextRow.completed && nextRow.side !== updatedEntries[idx].side
               && Math.floor((idx + 1) / ex.sides.length) === Math.floor(idx / ex.sides.length)) {
      // Other side of the same set is next: no rest in between.
      safeSpeak('Switch sides.');
    } else if (ex?.restAfter > 0) {
      startRestTimer(ex.restAfter, () => {
        safeSpeak('Next set.');
        setTimerMode('exercise');
      });
    }
  }

  function skipExercise() {
    clearInterval(timerRef.current);
    clearTimeout(autoAdvanceRef.current);
    setTimerRunning(false);
    setCountdown(null);
    stopSpeech();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    advanceExercise('skipped');
  }

  function skipSet(idx: number) {
    const entries = allSetLogs[exIdx] || [];
    if (entries[idx]?.completed) return;
    const updated = entries.map((e: any, i: number) => i === idx ? { ...e, completed: true, skipped: true } : e);
    setAllSetLogs(prev => ({ ...prev, [exIdx]: updated }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    progressAfterSetChange(updated, idx);
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

  function buildSessionLog(status: WorkoutLog['status']): WorkoutLog {
    const { exerciseList: list, allSetLogs: sets, exerciseOutcome: outcomes, swappedFrom: swaps, elapsed: secs } = liveRef.current;
    const exercises = list.map((ex, i): ExerciseLog => {
      const entries = sets[i] || [];
      const outcome = outcomes[i];
      const setLogs = entries.map((e: any, n: number) => ({
        setNumber: n + 1,
        reps: e.reps,
        weight: e.weight,
        plannedReps: e.plannedReps ?? ex.reps ?? 0,
        plannedWeight: e.plannedWeight ?? ex.weight ?? 0,
        completed: !!e.completed,
        skipped: !!e.skipped,
        ...(e.side ? { side: e.side } : {}),
        timestamp: e.completedAt || '',
      }));
      const anyPerformed = setLogs.some(isPerformed);
      return {
        exerciseName: ex.displayName || ex.name,
        type: ex.type === 'sets' ? 'sets' : 'time',
        sets: setLogs,
        plannedSets: ex.type === 'sets' ? entries.length || (ex.sets || 0) : 0,
        completed: ex.type === 'sets' ? anyPerformed : outcome === 'done',
        skipped: outcome === 'skipped' || (ex.type === 'sets' && !!outcome && !anyPerformed),
        ...(swaps[i] ? { swappedFrom: swaps[i] } : {}),
      };
    });
    return {
      schemaVersion: 2,
      id: workout.id,
      startedAt: startedAtRef.current,
      completedAt: new Date().toISOString(),
      durationMinutes: Math.round(secs / 60),
      exercises,
      plannedExerciseCount: list.length,
      completedExerciseCount: exercises.filter(e => e.completed).length,
      status,
    };
  }

  async function finishSession(requested: 'complete' | 'partial') {
    let log = buildSessionLog(requested);
    // Reaching the end by skipping everything isn't a completed workout.
    if (log.completedExerciseCount === 0) log = { ...log, status: 'skipped' };
    const status = log.status;
    allowLeaveRef.current = true;
    try {
      await saveWorkoutLog(log);
    } catch (e) {
      console.warn('saveWorkoutLog failed:', e);
    }
    const setsDone = log.exercises.reduce((n, ex) => n + ex.sets.filter(isPerformed).length, 0);
    const setsPlanned = log.exercises.reduce((n, ex) => n + ex.plannedSets, 0);
    const volume = log.exercises.reduce((v, ex) =>
      v + ex.sets.filter(isPerformed).reduce((sv, st) => sv + st.reps * st.weight, 0), 0);
    router.replace({
      pathname: '/complete',
      params: {
        workoutId: workout.id,
        status,
        duration: String(log.durationMinutes),
        setsDone: String(setsDone),
        setsPlanned: String(setsPlanned),
        exercisesDone: String(log.completedExerciseCount),
        exercisesPlanned: String(log.plannedExerciseCount),
        volume: String(volume),
      },
    });
  }

  function handleComplete() {
    safeSpeak('Workout complete. Great job today.');
    finishSession('complete');
  }

  // Leaving mid-workout must never silently discard what was logged.
  function confirmExit(onDiscard: () => void) {
    const { allSetLogs: sets, exerciseOutcome: outcomes } = liveRef.current;
    const anyProgress = Object.keys(outcomes).length > 0 ||
      Object.values(sets).some(entries => entries.some((e: any) => e.completed));
    if (!anyProgress) {
      allowLeaveRef.current = true;
      stopSpeech();
      onDiscard();
      return;
    }
    // Timers keep running under the alert so "Keep going" resumes seamlessly.
    Alert.alert(
      'End workout?',
      'Save what you have done so far as a partial session, or discard it.',
      [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { allowLeaveRef.current = true; stopSpeech(); onDiscard(); } },
        { text: 'Save as partial', onPress: () => { stopSpeech(); finishSession('partial'); } },
      ],
    );
  }

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e: any) => {
      if (allowLeaveRef.current) return;
      e.preventDefault();
      confirmExit(() => navigation.dispatch(e.data.action));
    });
  }, [navigation]);

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
    const entries = allSetLogs[exIdx] || [];
    const wasCompleted = !!entries[idx]?.completed;
    const updated = entries.map((e: any, i: number) =>
      i === idx ? { ...e, completed: !e.completed, completedAt: e.completed ? null : new Date().toISOString() } : e
    );
    setAllSetLogs(prev => ({ ...prev, [exIdx]: updated }));
    // Only auto-progress on the completing tap, not on un-checking a set.
    if (!wasCompleted) progressAfterSetChange(updated, idx);
  }

  function doSwap(sub: any) {
    const original = exerciseList[exIdx];
    setSwappedFrom(prev => ({ ...prev, [exIdx]: prev[exIdx] || original?.displayName || original?.name }));
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
          <TouchableOpacity onPress={() => router.back()}><Text style={s.backBtn}>✕  End</Text></TouchableOpacity>
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
                          ? `${ex.sets} sets × ${ex.reps} reps${ex.weight > 0 ? ` · ${ex.weight} lb` : ''}${ex.sides ? ' · each side' : ''}`
                          : def
                            ? `${def.isTabata ? 'Tabata · ' : ''}${def.rounds} rounds · ${def.workSec}s on / ${def.restSec}s off`
                            : `${Math.floor((ex.duration||0)/60)}:${String((ex.duration||0)%60).padStart(2,'0')}${ex.sides ? ' each side' : ''}`}
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
        <TouchableOpacity onPress={skipExercise}><Text style={s.skipExerciseBtn}>Skip ▶</Text></TouchableOpacity>
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
             currentEx.sides && currentEx.type === 'time' ? `${currentEx.sides[sideIdx].toUpperCase()} SIDE` :
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

            {!isResting && (
              <TouchableOpacity style={[s.timerBtn, { backgroundColor: phaseColor }]} onPress={toggleTimer}>
                <Text style={s.timerBtnText}>{timerRunning ? '⏸  Pause' : '▶  Start'}</Text>
              </TouchableOpacity>
            )}

            {isResting && (
              <Text style={s.restLabel}>
                {(() => {
                  const entries = allSetLogs[exIdx] || [];
                  const done = entries.filter((e: any) => e.completed).length;
                  const total = entries.length;
                  if (done >= total) return `Next: ${exerciseList[exIdx + 1]?.displayName || exerciseList[exIdx + 1]?.name || 'Done'}`;
                  // Unilateral rows are "Set N — Side"; a plain row count would read "Set 3 of 6".
                  if (currentEx.sides) return `${entries.find((e: any) => !e.completed)?.label} up next`;
                  return `Set ${done + 1} of ${total} up next`;
                })()}
              </Text>
            )}
          </View>
        ) : (
          /* Set logger */
          <View style={s.setLogBlock}>
            <Text style={s.setLogTitle}>
              Log your sets{currentEx.sides ? ' — alternating sides' : ''}
            </Text>
            <View style={s.setHeader}>
              <Text style={[s.setHeaderText, { flex: 1.6 }]}>Set</Text>
              <Text style={[s.setHeaderText, { flex: 1 }]}>Reps</Text>
              <Text style={[s.setHeaderText, { flex: 1 }]}>lbs</Text>
              <Text style={[s.setHeaderText, { width: 44 }]}>✓</Text>
            </View>
            {setEntries.map((entry: any, i: number) => (
              <View key={i} style={[s.setRow, entry.completed && s.setRowDone]}>
                <Text style={[s.setLabel, { flex: 1.6 }]}>{entry.label}{entry.skipped ? ' (skipped)' : ''}</Text>
                <TextInput
                  style={[s.setInput, { flex: 1 }]}
                  value={entry.skipped ? '—' : String(entry.reps)}
                  editable={!entry.skipped}
                  onChangeText={v => updateSetEntry(i, 'reps', parseInt(v) || 0)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <TextInput
                  style={[s.setInput, { flex: 1, marginLeft: 8 }]}
                  value={entry.skipped ? '—' : (entry.weight > 0 ? String(entry.weight) : '')}
                  editable={!entry.skipped}
                  placeholder="BW"
                  placeholderTextColor={C.textDim}
                  onChangeText={v => updateSetEntry(i, 'weight', parseInt(v) || 0)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={[s.setCheckBtn, { width: 44 }, entry.completed && { backgroundColor: entry.skipped ? C.textDim : C.success, borderColor: entry.skipped ? C.textDim : C.success }]}
                  onPress={() => toggleSetComplete(i)}
                >
                  <Text style={[s.setCheckText, entry.completed && { color: C.bg }]}>{entry.completed ? '✓' : '○'}</Text>
                </TouchableOpacity>
              </View>
            ))}
            {/* Skip the next set that hasn't been done yet */}
            {setEntries.some((e: any) => !e.completed) && (
              <TouchableOpacity
                style={s.skipSetLink}
                onPress={() => skipSet(setEntries.findIndex((e: any) => !e.completed))}
              >
                <Text style={s.skipSetLinkText}>Skip this set ▶</Text>
              </TouchableOpacity>
            )}
            {/* Rest indicator */}
            {currentEx.restAfter > 0 && (
              <View style={s.restHint}>
                <Text style={s.restHintText}>Rest between sets: {currentEx.restAfter}s — starts automatically when you check off a set</Text>
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
          <TouchableOpacity style={[s.swapBtn, { flex: 1 }]} onPress={() => setShowSwap(true)}>
            <Text style={s.swapBtnText}>⟳  Swap</Text>
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
  skipExerciseBtn: { fontSize: 13, color: C.textMid, fontWeight: '600' },
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
  skipSetLink: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  skipSetLinkText: { fontSize: 13, color: C.textMid, fontWeight: '600' },
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
