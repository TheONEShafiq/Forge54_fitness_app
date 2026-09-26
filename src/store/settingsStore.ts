import AsyncStorage from '@react-native-async-storage/async-storage';

export type ProgramLength = 4 | 5 | 6;

const KEYS = {
  programLength: 'forge_program_length_weeks',
  equipment: 'forge_equipment',
  autoStart: 'forge_auto_start_sets',
};

// Seeded from the athlete's home-gym inventory (see ASSISTANT_CONTEXT.md).
export const DEFAULT_EQUIPMENT = [
  'Bench',
  '5lb DB', '8lb DB', '10lb DB', '15lb DB', '20lb DB', '25lb DB',
  '20lb KB', '35lb KB', '50lb KB',
  'Pull-Up Bar', 'TRX Straps', '50lb Sandbag', '25lb Weighted Vest',
  'Ruck Sack', 'Rowing Machine', 'Plyo Box', 'Kickboxing Bag',
  'Bosu Ball', 'Resistance Bands', 'Jump Rope', 'Bike Trainer',
];

export async function getProgramLength(): Promise<ProgramLength> {
  const raw = await AsyncStorage.getItem(KEYS.programLength);
  const n = raw ? parseInt(raw, 10) : 6;
  return n === 4 || n === 5 ? n : 6;
}

export async function setProgramLength(weeks: ProgramLength): Promise<void> {
  await AsyncStorage.setItem(KEYS.programLength, String(weeks));
}

export async function getEquipment(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEYS.equipment);
  return raw ? JSON.parse(raw) : DEFAULT_EQUIPMENT;
}

export async function addEquipment(item: string): Promise<string[]> {
  const trimmed = item.trim();
  const current = await getEquipment();
  if (!trimmed || current.some(e => e.toLowerCase() === trimmed.toLowerCase())) return current;
  const updated = [...current, trimmed];
  await AsyncStorage.setItem(KEYS.equipment, JSON.stringify(updated));
  return updated;
}

export async function removeEquipment(item: string): Promise<string[]> {
  const current = await getEquipment();
  const updated = current.filter(e => e !== item);
  await AsyncStorage.setItem(KEYS.equipment, JSON.stringify(updated));
  return updated;
}

// Opt-out: timed sets start on their own when the lead-in countdown ends.
export async function getAutoStart(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.autoStart)) !== 'false';
}

export async function setAutoStart(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.autoStart, enabled ? 'true' : 'false');
}

// ── Athlete profile ───────────────────────────────────────────────────────────
// Captured once (first-launch screen, editable in Settings). Program generation
// (#5, v12) reads it together with equipment and program length.
export type Gender = 'male' | 'female' | 'other' | 'unspecified';
export type WorkoutType = 'crossfit' | 'hiit' | 'strength' | 'cardio' | 'mixed' | 'bodyweight';

export interface Profile {
  age: number;
  gender: Gender;
  // One or more; order is the order they were picked.
  workoutTypes: WorkoutType[];
  // Target session length, 5-minute steps up to SESSION_MAX_MINUTES.
  sessionMinutes: number;
}

export const SESSION_MAX_MINUTES = 90;
export const SESSION_STEP_MINUTES = 5;

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

export const WORKOUT_TYPE_OPTIONS: { value: WorkoutType; label: string }[] = [
  { value: 'crossfit', label: 'CrossFit' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'strength', label: 'Pure strength' },
  { value: 'cardio', label: 'Pure cardio' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'bodyweight', label: 'Bodyweight' },
];


const PROFILE_KEY = 'forge_profile';
const PROFILE_PROMPTED_KEY = 'forge_profile_prompted';

export async function getProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  const p = JSON.parse(raw);
  // Pre-release shape stored a single workoutType and sessionLength bucket.
  return {
    age: p.age,
    gender: p.gender,
    workoutTypes: p.workoutTypes ?? (p.workoutType ? [p.workoutType] : []),
    sessionMinutes: p.sessionMinutes ?? p.sessionLength ?? 0,
  };
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  await AsyncStorage.setItem(PROFILE_PROMPTED_KEY, 'true');
}

// True only on a launch where no profile exists and the first-launch screen
// hasn't been shown yet ("Not now" also counts as shown).
export async function shouldPromptForProfile(): Promise<boolean> {
  const [profile, prompted] = await Promise.all([getProfile(), AsyncStorage.getItem(PROFILE_PROMPTED_KEY)]);
  return !profile && prompted !== 'true';
}

export async function markProfilePrompted(): Promise<void> {
  await AsyncStorage.setItem(PROFILE_PROMPTED_KEY, 'true');
}

// Everything program generation needs, as one object.
export async function getGenerationProfile() {
  const [profile, equipment, programLengthWeeks] = await Promise.all([getProfile(), getEquipment(), getProgramLength()]);
  return { profile, equipment, programLengthWeeks };
}
