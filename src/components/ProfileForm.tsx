import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../theme';
import {
  Profile, Gender, WorkoutType, SessionLength,
  GENDER_OPTIONS, WORKOUT_TYPE_OPTIONS, SESSION_LENGTH_OPTIONS,
} from '../store/settingsStore';

const MIN_AGE = 13;
const MAX_AGE = 100;

function Chips<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.chipWrap}>
      {options.map(o => (
        <TouchableOpacity
          key={String(o.value)}
          style={[s.chip, value === o.value && s.chipActive]}
          onPress={() => onChange(o.value)}
        >
          <Text style={[s.chipText, value === o.value && s.chipTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Shared by Settings and the first-launch screen.
export default function ProfileForm({ initial, onSave, saveLabel = 'Save profile' }: {
  initial: Profile | null;
  onSave: (profile: Profile) => void | Promise<void>;
  saveLabel?: string;
}) {
  const [age, setAge] = useState(initial ? String(initial.age) : '');
  const [gender, setGender] = useState<Gender | null>(initial?.gender ?? null);
  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(initial?.workoutType ?? null);
  const [sessionLength, setSessionLength] = useState<SessionLength | null>(initial?.sessionLength ?? null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  const ageNum = parseInt(age, 10);
  const ageValid = ageNum >= MIN_AGE && ageNum <= MAX_AGE;
  const complete = ageValid && !!gender && !!workoutType && !!sessionLength;
  const dirty = !initial || initial.age !== ageNum || initial.gender !== gender ||
    initial.workoutType !== workoutType || initial.sessionLength !== sessionLength;

  async function handleSave() {
    if (!complete) return;
    await onSave({ age: ageNum, gender: gender!, workoutType: workoutType!, sessionLength: sessionLength! });
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 2000);
  }

  return (
    <View>
      <Text style={s.label}>Age</Text>
      <TextInput
        style={[s.input, age !== '' && !ageValid && s.inputInvalid]}
        value={age}
        onChangeText={t => setAge(t.replace(/[^0-9]/g, '').slice(0, 3))}
        placeholder="e.g. 53"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
      />
      {age !== '' && !ageValid && <Text style={s.hint}>Enter an age from {MIN_AGE} to {MAX_AGE}.</Text>}

      <Text style={s.label}>Gender</Text>
      <Chips options={GENDER_OPTIONS} value={gender} onChange={setGender} />

      <Text style={s.label}>Workout preference</Text>
      <Chips options={WORKOUT_TYPE_OPTIONS} value={workoutType} onChange={setWorkoutType} />

      <Text style={s.label}>Session length</Text>
      <Chips options={SESSION_LENGTH_OPTIONS} value={sessionLength} onChange={setSessionLength} />

      {savedJustNow && !dirty ? (
        <Text style={s.savedText}>Saved ✓</Text>
      ) : (
        <TouchableOpacity
          style={[s.saveBtn, !(complete && dirty) && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!(complete && dirty)}
        >
          <Text style={s.saveBtnText}>{saveLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  input: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14 },
  inputInvalid: { borderColor: colors.danger },
  hint: { fontSize: 12, color: colors.danger, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.accent },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: spacing.lg },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
  savedText: { color: colors.success, fontWeight: '600', fontSize: 13, textAlign: 'center', marginTop: spacing.lg },
});
