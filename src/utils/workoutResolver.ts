import workoutData from '../../workouts.json';

type AnyWorkout = any;

function getAllWorkouts(): AnyWorkout[] {
  return (workoutData as any).weeks.flatMap((w: any) => w.workouts);
}

export function resolveWorkout(wo: any): any {
  if (!wo.inheritFrom) return wo;
  const all = getAllWorkouts();
  const base = all.find((w: any) => w.id === wo.inheritFrom);
  if (!base) return wo;
  const overrides: Record<string, any> = wo.progressionOverrides || {};
  const resolvedSections = (base as any).sections.map((section: any) => ({
    ...section,
    exercises: section.exercises.map((ex: any) => {
      const override = overrides[ex.name];
      return override ? { ...ex, ...override } : { ...ex };
    }),
  }));
  return {
    ...base,
    ...wo,
    title: wo.title || base.title,
    duration: wo.duration || base.duration,
    sections: resolvedSections,
    progressionNote: wo.progressionNote || null,
    benchmarkNote: wo.benchmarkNote || null,
  };
}

export function resolveAllWorkouts(maxWeek?: number): any[] {
  const weeks = maxWeek ? getActiveWeeks(maxWeek) : (workoutData as any).weeks;
  return weeks.flatMap((w: any) =>
    w.workouts.map((wo: any) => ({
      ...resolveWorkout(wo),
      weekNumber: w.week,
      weekLabel: w.label,
      phase: w.phase,
      weekProgressionNote: w.progressionNote || null,
    }))
  );
}

// The program author writes a full 6-week block; the athlete can choose to
// run a shorter 4- or 5-week cycle instead (see settingsStore.programLength).
export function getActiveWeeks(maxWeek: number = 6): any[] {
  return (workoutData as any).weeks.filter((w: any) => w.week <= maxWeek);
}

export function getWorkoutById(id: string): any | null {
  return resolveAllWorkouts().find((w: any) => w.id === id) || null;
}

export function flattenExercises(workout: any): any[] {
  if (!workout?.sections) return [];
  return workout.sections.flatMap((s: any) => {
    const phase =
      s.name.toLowerCase().includes('warm') ? 'warmup' :
      s.name.toLowerCase().includes('cool') || s.name.toLowerCase().includes('final') ? 'cooldown' :
      s.tabata ? 'core' : 'work';
    return s.exercises.map((ex: any) => ({
      ...ex,
      phase,
      sectionName: s.name,
      tabata: s.tabata || false,
      tabataNote: s.tabataNote || null,
      amrap: s.amrap || false,
      emom: s.emom || false,
      circuitRounds: s.circuitRounds || null,
    }));
  });
}
