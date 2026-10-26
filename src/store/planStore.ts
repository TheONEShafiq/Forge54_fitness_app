import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getGenerationProfile, getProgramLength, getTravel, setProgramStartDate, toDateKey,
} from './settingsStore';
import type { TravelState } from './settingsStore';
import {
  generatePlan, generateTravelWorkouts, parseEquipment, travelGear, planInputsKey, hashSeed,
  DEFAULT_SESSION_MINUTES,
} from '../utils/planGenerator';
import type { Plan, PlanInputs } from '../utils/planGenerator';
import { getActiveWeeks, resolveWorkout, resolveAllWorkouts } from '../utils/workoutResolver';
import { TRAVEL_WORKOUTS } from '../utils/travelLibrary';

// ── The user's plan ───────────────────────────────────────────────────────────
// A generated plan is stored once built (first profile save, or a confirmed
// rebuild after a settings change). Until then — every install from before
// generation existed — the authored Forge54 program in workouts.json is the
// plan, so nobody's program changes under them without asking.
const PLAN_KEY = 'forge_plan';
const TRAVEL_PLAN_KEY = 'forge_travel_plan';

export async function getPlanInputs(): Promise<PlanInputs> {
  const { profile, equipment, programLengthWeeks } = await getGenerationProfile();
  return {
    age: profile?.age ?? null,
    workoutTypes: profile?.workoutTypes ?? [],
    sessionMinutes: profile?.sessionMinutes || DEFAULT_SESSION_MINUTES,
    programLengthWeeks,
    gear: parseEquipment(equipment),
  };
}

async function getStoredPlan(): Promise<Plan | null> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function legacyPlan(): Promise<Plan> {
  const weeks = getActiveWeeks(await getProgramLength());
  return {
    id: 'forge54',
    createdAt: null,
    inputsKey: null,
    weeks: weeks.map((w: any) => ({
      week: w.week,
      label: w.label,
      phase: w.phase,
      progressionNote: w.progressionNote || '',
      workouts: w.workouts.map((wo: any) => resolveWorkout(wo)),
    })),
  };
}

export async function getPlan(): Promise<Plan> {
  return (await getStoredPlan()) ?? legacyPlan();
}

export function isGeneratedPlan(plan: Plan): boolean {
  return plan.inputsKey !== null;
}

// True when Settings no longer match what the stored plan was built from.
// The authored program has no inputs to compare, so it never reports stale.
export async function isPlanStale(): Promise<boolean> {
  const plan = await getStoredPlan();
  if (!plan) return false;
  return plan.inputsKey !== planInputsKey(await getPlanInputs());
}

// Builds a new plan from current settings (fresh seed, so a rebuild is a new
// plan, not the old one reshuffled) and starts it today. History is untouched:
// old sessions stay in Progress, and new workout ids never collide with them.
export async function rebuildPlan(): Promise<Plan> {
  const inputs = await getPlanInputs();
  const seed = hashSeed(`${Date.now()}:${Math.random()}`);
  const plan = generatePlan(inputs, seed);
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  await setProgramStartDate(toDateKey(new Date()));
  return plan;
}

// Every plan workout with its week attached — the shape Home and Program list.
export function planWorkouts(plan: Plan): any[] {
  return plan.weeks.flatMap(w => w.workouts.map(wo => ({
    ...wo,
    weekNumber: w.week,
    weekLabel: w.label,
    phase: w.phase,
    weekProgressionNote: w.progressionNote || null,
  })));
}

// ── Travel workouts ───────────────────────────────────────────────────────────
// Generated for the travel setup + packed gear and the user's profile, and
// rebuilt automatically whenever any of those change.
interface StoredTravelPlan { key: string; workouts: any[] }

async function travelInputs(travel: TravelState): Promise<PlanInputs> {
  return { ...(await getPlanInputs()), gear: travelGear(travel.setup, travel.packed) };
}

export async function getTravelWorkouts(travel?: TravelState): Promise<any[]> {
  const t = travel ?? await getTravel();
  const inputs = await travelInputs(t);
  const key = planInputsKey(inputs);
  try {
    const raw = await AsyncStorage.getItem(TRAVEL_PLAN_KEY);
    const stored: StoredTravelPlan | null = raw ? JSON.parse(raw) : null;
    if (stored?.key === key) return stored.workouts;
  } catch {}
  const workouts = generateTravelWorkouts(inputs, hashSeed(`${key}:${Date.now()}`));
  await AsyncStorage.setItem(TRAVEL_PLAN_KEY, JSON.stringify({ key, workouts }));
  return workouts;
}

// ── Lookup by id (player) ─────────────────────────────────────────────────────
// Current plan first, then travel, then anything older a log may point at.
export async function findWorkout(id: string | undefined): Promise<any | null> {
  if (!id) return null;
  const plan = await getPlan();
  for (const w of plan.weeks) {
    const found = w.workouts.find(wo => wo.id === id);
    if (found) return found;
  }
  try {
    const raw = await AsyncStorage.getItem(TRAVEL_PLAN_KEY);
    const stored: StoredTravelPlan | null = raw ? JSON.parse(raw) : null;
    const t = stored?.workouts.find(wo => wo.id === id);
    if (t) return t;
  } catch {}
  return TRAVEL_WORKOUTS.find(w => w.id === id) ?? resolveAllWorkouts().find((w: any) => w.id === id) ?? null;
}
