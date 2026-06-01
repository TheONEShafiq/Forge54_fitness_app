import { useState, useEffect, useRef, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { speak, playBell, stopSpeech, buildAnnouncement } from '../utils/ttsService';

export interface Exercise {
  name: string;
  phase: 'warmup' | 'work' | 'core' | 'cooldown';
  type: 'time' | 'sets';
  duration?: number;
  sets?: number;
  reps?: number;
  weight?: number;
  cue: string;
  sectionName?: string;
  tabata?: boolean;
  tabataNote?: string;
  amrap?: boolean;
  emom?: boolean;
  circuitRounds?: number | null;
}

export interface SetEntry {
  reps: number;
  weight: number;
  completed: boolean;
}

const EQUIPMENT_SUBS: Record<string, Exercise[]> = {
  'Cardio Warm-Up': [
    { name: 'Jump Rope Warm-Up', phase: 'warmup', type: 'time', duration: 300, weight: 0, cue: 'Easy jump rope pace. Get blood moving. Relaxed.' },
    { name: 'Easy Row Warm-Up', phase: 'warmup', type: 'time', duration: 300, weight: 0, cue: 'Rate 18. Smooth long strokes. Easy effort.' },
  ],
  'Main Cardio Intervals': [
    { name: 'Row 8x500m Intervals', phase: 'work', type: 'time', duration: 1800, weight: 0, cue: '8 rounds: 500m hard row at rate 26-28, 90 sec rest between each.' },
    { name: 'Run 4x5min Tempo', phase: 'work', type: 'time', duration: 1800, weight: 0, cue: '4 rounds: 5 min hard run at 7/10 effort, 90 sec walk between each.' },
    { name: 'Bike 5x4min Intervals', phase: 'work', type: 'time', duration: 1800, weight: 0, cue: '5 rounds: 4 min hard bike at RPE 8, 2 min easy spin between each.' },
  ],
  'Steady-State Cardio': [
    { name: 'Row Steady State 25min', phase: 'work', type: 'time', duration: 1500, weight: 0, cue: 'Row 25 min at rate 22-24. Target 2:05-2:15/500m split.' },
    { name: 'Run Negative Split 20min', phase: 'work', type: 'time', duration: 1200, weight: 0, cue: 'Run 20 min. First 10 steady, second 10 progressively faster.' },
    { name: 'Bike Zone 3 Steady', phase: 'work', type: 'time', duration: 1500, weight: 0, cue: 'Bike 25 min Zone 3. Moderate effort.' },
  ],
  'Rowing Machine Easy': [
    { name: 'Bike Easy Warm-Up', phase: 'warmup', type: 'time', duration: 180, weight: 0, cue: 'Easy spin. 80-90 rpm. Low resistance. Get loose.' },
    { name: 'Jump Rope Easy', phase: 'warmup', type: 'time', duration: 180, weight: 0, cue: 'Easy skip. Light bounce. Warm the joints.' },
  ],
  'Plyo Box Jump': [
    { name: 'Jump Squat', phase: 'work', type: 'sets', sets: 4, reps: 8, weight: 0, cue: 'Squat deep, explode up, land soft. Same hip drive as box jump.' },
    { name: 'Plyo Box Step-Up Fast', phase: 'work', type: 'sets', sets: 4, reps: 8, weight: 0, cue: 'Step up quickly with power drive. Alternate legs each set.' },
  ],
  'Kickboxing Bag — Cross-Hook Combo': [
    { name: 'Shadow Boxing Cross-Hook', phase: 'work', type: 'time', duration: 45, weight: 0, cue: 'No bag needed. Rotate through hips. Stay light on feet. Full power.' },
  ],
  'Kickboxing Bag — 3 min Round': [
    { name: 'Shadow Boxing 3min Round', phase: 'work', type: 'time', duration: 180, weight: 0, cue: 'Full combos in the air. Jab-cross-hook-uppercut. Work angles. Move feet.' },
  ],
  'Kickboxing Bag — Jab-Cross-Kick': [
    { name: 'Shadow Boxing Jab-Cross-Kick', phase: 'work', type: 'time', duration: 45, weight: 0, cue: 'Throw full combos in air. Rotate hips on kick. Stay aggressive.' },
  ],
};

const SWAP_ALTS: Record<string, Exercise> = {
  pull: { name: 'TRX Inverted Row', phase: 'work', type: 'sets', sets: 3, reps: 12, weight: 0, cue: 'Body straight. Pull elbows back hard. Pause at top. Neck neutral.' },
  press: { name: 'DB Floor Press', phase: 'work', type: 'sets', sets: 3, reps: 10, weight: 25, cue: 'Flat on floor. Press through full ROM. Neutral wrist.' },
  hinge: { name: 'Resistance Band Deadlift', phase: 'work', type: 'sets', sets: 3, reps: 12, weight: 0, cue: 'Stand on band. Hinge and pull to standing. Same pattern as KB deadlift.' },
  squat: { name: 'TRX Squat', phase: 'work', type: 'sets', sets: 3, reps: 15, weight: 0, cue: 'Hands in TRX for balance assist. Deep squat. Controlled.' },
  core: { name: 'Dead Bug', phase: 'core', type: 'sets', sets: 3, reps: 10, weight: 0, cue: 'On back, arms up, knees 90. Lower opposite arm/leg. Back flat.' },
  carry: { name: 'Farmer Walk Light DBs', phase: 'work', type: 'time', duration: 40, weight: 15, cue: 'Packed shoulders. Tall spine. Strong grip. Walk controlled.' },
};

function getSwapFor(ex: Exercise): Exercise {
  const n = ex.name.toLowerCase();
  if (n.includes('pull-up') || n.includes('pull up') || n.includes('row')) return SWAP_ALTS.pull;
  if (n.includes('press') || n.includes('push')) return SWAP_ALTS.press;
  if (n.includes('deadlift') || n.includes('swing') || n.includes('clean') || n.includes('snatch')) return SWAP_ALTS.hinge;
  if (n.includes('squat') || n.includes('lunge') || n.includes('step-up')) return SWAP_ALTS.squat;
  if (n.includes('carry') || n.includes('farmer') || n.includes('ruck')) return SWAP_ALTS.carry;
  return SWAP_ALTS.core;
}

export function getSubstitutesFor(ex: Exercise): Exercise[] {
  return EQUIPMENT_SUBS[ex.name] || [];
}

export function useWorkoutPlayer(exercises: Exercise[]) {
  const [exIdx, setExIdx] = useState(0);
  const [exerciseList, setExerciseList] = useState<Exercise[]>(exercises);
  const [timerValue, setTimerValue] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [intervalCount, setIntervalCount] = useState(1);
  const [setEntries, setSetEntries] = useState<SetEntry[]>([]);
  const [sessionLog, setSessionLog] = useState<Array<{ exercise: Exercise; sets: SetEntry[]; swappedFrom?: string }>>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentExercise = exerciseList[exIdx];

  useEffect(() => {
    activateKeepAwakeAsync();
    elapsedRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => {
      deactivateKeepAwake();
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const ex = exerciseList[exIdx];
    if (!ex) return;
    if (ex.type === 'sets' && ex.sets) {
      setSetEntries(Array.from({ length: ex.sets }, () => ({
        reps: ex.reps || 0,
        weight: ex.weight || 0,
        completed: false,
      })));
    } else {
      setSetEntries([]);
    }
    setIntervalCount(1);
    speak(buildAnnouncement(ex));
  }, [exIdx, exerciseList]);

  const startTimer = useCallback((duration: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerValue(duration);
    setTimerRunning(true);
    timerRef.current = setInterval(() => {
      setTimerValue(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setTimerRunning(false);
          playBell();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        if (prev <= 4) speak(String(prev - 1));
        return prev - 1;
      });
    }, 1000);
  }, []);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
  }, []);

  const resumeTimer = useCallback(() => {
    if (timerValue <= 0) return;
    setTimerRunning(true);
    timerRef.current = setInterval(() => {
      setTimerValue(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setTimerRunning(false);
          playBell();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        if (prev <= 4) speak(String(prev - 1));
        return prev - 1;
      });
    }, 1000);
  }, [timerValue]);

  const updateSet = useCallback((idx: number, field: 'reps' | 'weight', value: number) => {
    setSetEntries(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }, []);

  const completeSet = useCallback((idx: number) => {
    setSetEntries(prev => {
      const updated = prev.map((s, i) => i === idx ? { ...s, completed: !s.completed } : s);
      const allDone = updated.every(s => s.completed);
      if (allDone) { playBell(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return updated;
    });
  }, []);

  const nextInterval = useCallback(() => {
    const ex = exerciseList[exIdx];
    const total = ex?.sets || 1;
    if (intervalCount < total) {
      playBell();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIntervalCount(c => c + 1);
      if (ex?.duration) startTimer(ex.duration);
      speak(`Interval ${intervalCount + 1} of ${total}. Go.`);
    }
  }, [exIdx, exerciseList, intervalCount, startTimer]);

  const nextExercise = useCallback(() => {
    const ex = exerciseList[exIdx];
    setSessionLog(prev => [...prev, { exercise: ex, sets: setEntries }]);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerValue(0);
    if (exIdx < exerciseList.length - 1) setExIdx(i => i + 1);
  }, [exIdx, exerciseList, setEntries]);

  const jumpToExercise = useCallback((idx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerValue(0);
    setExIdx(idx);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const skipExercise = useCallback(() => {
    const ex = exerciseList[exIdx];
    setSessionLog(prev => [...prev, { exercise: ex, sets: [], swappedFrom: 'skipped' }]);
    if (exIdx < exerciseList.length - 1) setExIdx(i => i + 1);
  }, [exIdx, exerciseList]);

  const swapExercise = useCallback((replacement: Exercise, swappedFrom?: string) => {
    setExerciseList(prev => prev.map((ex, i) => i === exIdx ? replacement : ex));
    setSessionLog(prev => [...prev, { exercise: replacement, sets: [], swappedFrom: swappedFrom || exerciseList[exIdx]?.name }]);
    speak(buildAnnouncement(replacement));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [exIdx, exerciseList]);

  const getEquipmentSubs = useCallback(() => getSubstitutesFor(currentExercise), [currentExercise]);
  const getSwapAlternative = useCallback(() => getSwapFor(currentExercise), [currentExercise]);

  const isComplete = exIdx >= exerciseList.length - 1;

  return {
    currentExercise, exIdx, totalExercises: exerciseList.length, exerciseList,
    timerValue, timerRunning, intervalCount,
    setEntries, sessionLog, elapsedSeconds, isComplete,
    startTimer, pauseTimer, resumeTimer,
    updateSet, completeSet, nextInterval,
    nextExercise, jumpToExercise, skipExercise,
    swapExercise, getEquipmentSubs, getSwapAlternative,
  };
}
