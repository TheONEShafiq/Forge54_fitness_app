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
