import AsyncStorage from '@react-native-async-storage/async-storage';

// `reps`/`weight` are what was actually performed; `planned*` is what the
// program prescribed. Metrics must only ever sum performed values.
export interface SetLog {
  setNumber: number;
  reps: number;
  weight: number;
  plannedReps: number;
  plannedWeight: number;
  completed: boolean;
  skipped: boolean;
  side?: 'left' | 'right';
  timestamp: string;
}

export interface ExerciseLog {
  exerciseName: string;
  type: 'sets' | 'time';
  sets: SetLog[];
  plannedSets: number;
  // Timed exercises have no set rows — this records whether the timer was run.
  completed: boolean;
  skipped: boolean;
  swappedFrom?: string;
}

export interface WorkoutLog {
  schemaVersion?: 2;
  id: string;
  startedAt?: string;
  completedAt: string;
  durationMinutes: number;
  exercises: ExerciseLog[];
  plannedExerciseCount?: number;
  completedExerciseCount?: number;
  status: 'complete' | 'partial' | 'skipped';
  garmin?: {
    avgHR: number;
    maxHR: number;
    vo2max: number;
    intensityMinutes: number;
    calories: number;
    trainingEffect: number;
    hrZones: number[];
    activityId: string;
  };
}

const KEYS = {
  logs: 'forge_workout_logs',
  garminToken: 'forge_garmin_token',
};

export async function saveWorkoutLog(log: WorkoutLog): Promise<void> {
  const existing = await getAllLogs();
  existing[log.id + '_' + log.completedAt] = log;
  await AsyncStorage.setItem(KEYS.logs, JSON.stringify(existing));
}

export async function getAllLogs(): Promise<Record<string, WorkoutLog>> {
  const raw = await AsyncStorage.getItem(KEYS.logs);
  return raw ? JSON.parse(raw) : {};
}

// A set counts toward volume only if it was actually performed. `skipped` is
// absent on pre-v2 logs, which never recorded sets anyway.
export function isPerformed(s: SetLog): boolean {
  return s.completed && !s.skipped;
}

export function logVolume(log: WorkoutLog): number {
  return log.exercises.reduce((sum, ex) =>
    sum + ex.sets.filter(isPerformed).reduce((sSum, s) => sSum + s.reps * s.weight, 0), 0);
}

export async function getLogsForWorkout(workoutId: string): Promise<WorkoutLog[]> {
  const all = await getAllLogs();
  return Object.values(all).filter(l => l.id === workoutId);
}

export async function getWeeklyStats(weekOffset = 0) {
  const all = Object.values(await getAllLogs());
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() - weekOffset * 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const weekLogs = all.filter(l => {
    const d = new Date(l.completedAt);
    return d >= weekStart && d < weekEnd;
  });
  const totalVolume = weekLogs.reduce((sum, log) => sum + logVolume(log), 0);
  const workoutsCompleted = weekLogs.filter(l => l.status === 'complete').length;
  const workoutsPartial = weekLogs.filter(l => l.status === 'partial').length;
  const avgHR = weekLogs.reduce((sum, l) => sum + (l.garmin?.avgHR || 0), 0) /
    (weekLogs.filter(l => l.garmin).length || 1);
  return { totalVolume, workoutsCompleted, workoutsPartial, avgHR: Math.round(avgHR), weekLogs };
}

export async function getExerciseProgression(exerciseName: string) {
  const all = Object.values(await getAllLogs());
  all.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  return all.reduce((acc, log) => {
    const ex = log.exercises.find(e => e.exerciseName === exerciseName);
    if (!ex) return acc;
    const done = ex.sets.filter(isPerformed);
    if (!done.length) return acc;
    acc.push({
      date: log.completedAt.split('T')[0],
      maxWeight: Math.max(...done.map(s => s.weight)),
      totalVolume: done.reduce((s, set) => s + set.reps * set.weight, 0),
    });
    return acc;
  }, [] as { date: string; maxWeight: number; totalVolume: number }[]);
}

export async function getMonthlyStats() {
  const all = Object.values(await getAllLogs());
  const months: Record<string, { volume: number; count: number; avgHR: number; hrCount: number }> = {};
  for (const log of all) {
    const month = log.completedAt.substring(0, 7);
    if (!months[month]) months[month] = { volume: 0, count: 0, avgHR: 0, hrCount: 0 };
    months[month].count++;
    months[month].volume += logVolume(log);
    if (log.garmin?.avgHR) { months[month].avgHR += log.garmin.avgHR; months[month].hrCount++; }
  }
  return months;
}

export async function saveGarminToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.garminToken, token);
}

export async function getGarminToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.garminToken);
}
