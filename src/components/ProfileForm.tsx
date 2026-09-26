import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, spacing, radius } from '../theme';
import {
  Profile, Gender, WorkoutType,
  GENDER_OPTIONS, WORKOUT_TYPE_OPTIONS, SESSION_MAX_MINUTES, SESSION_STEP_MINUTES,
} from '../store/settingsStore';

const MIN_AGE = 13;
const MAX_AGE = 100;

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function sameTypes(a: WorkoutType[], b: WorkoutType[]) {
  return a.length === b.length && a.every(t => b.includes(t));
}

// Shared by Settings and the first-launch screen.
export default function ProfileForm({ initial, onSave, saveLabel = 'Save profile' }: {
  initial: Profile | null;
  onSave: (profile: Profile) => void | Promise<void>;
  saveLabel?: string;
}) {
  const [age, setAge] = useState(initial ? String(initial.age) : '');
  const [gender, setGender] = useState<Gender | null>(initial?.gender ?? null);
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutType[]>(initial?.workoutTypes ?? []);
  const [sessionMinutes, setSessionMinutes] = useState(initial?.sessionMinutes ?? 0);
  const [savedJustNow, setSavedJustNow] = useState(false);

  const ageNum = parseInt(age, 10);
  const ageValid = ageNum >= MIN_AGE && ageNum <= MAX_AGE;
  // 0 minutes is on the slider but isn't a session, so it can't be saved.
  const complete = ageValid && !!gender && workoutTypes.length > 0 && sessionMinutes > 0;
  const dirty = !initial || initial.age !== ageNum || initial.gender !== gender ||
    !sameTypes(initial.workoutTypes, workoutTypes) || initial.sessionMinutes !== sessionMinutes;

  function toggleType(t: WorkoutType) {
    setWorkoutTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function handleSave() {
    if (!complete) return;
    await onSave({ age: ageNum, gender: gender!, workoutTypes, sessionMinutes });
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
      <View style={s.chipWrap}>
        {GENDER_OPTIONS.map(o => (
          <Chip key={o.value} label={o.label} active={gender === o.value} onPress={() => setGender(o.value)} />
        ))}
      </View>

      <Text style={s.label}>Workout preferences <Text style={s.labelNote}>— pick any</Text></Text>
      <View style={s.chipWrap}>
        {WORKOUT_TYPE_OPTIONS.map(o => (
          <Chip key={o.value} label={o.label} active={workoutTypes.includes(o.value)} onPress={() => toggleType(o.value)} />
        ))}
      </View>

      <View style={s.sliderHeader}>
        <Text style={[s.label, { marginBottom: 0 }]}>Session length</Text>
        <Text style={[s.sliderValue, sessionMinutes === 0 && { color: colors.textMuted }]}>
          {sessionMinutes === 0 ? 'Slide to set' : `${sessionMinutes} min`}
        </Text>
      </View>
      <Slider
        style={s.slider}
        minimumValue={0}
        maximumValue={SESSION_MAX_MINUTES}
        step={SESSION_STEP_MINUTES}
        value={sessionMinutes}
        onValueChange={v => setSessionMinutes(Math.round(v))}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
      />
      <View style={s.sliderScale}>
        <Text style={s.scaleText}>0</Text>
        <Text style={s.scaleText}>45</Text>
        <Text style={s.scaleText}>{SESSION_MAX_MINUTES} min</Text>
      </View>

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
  labelNote: { fontWeight: '400', color: colors.textMuted },
  input: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14 },
  inputInvalid: { borderColor: colors.danger },
  hint: { fontSize: 12, color: colors.danger, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.accent },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.md, marginBottom: spacing.xs },
  sliderValue: { fontSize: 20, fontWeight: '700', color: colors.accent },
  slider: { width: '100%', height: 40 },
  sliderScale: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { fontSize: 11, color: colors.textMuted },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: spacing.lg },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
  savedText: { color: colors.success, fontWeight: '600', fontSize: 13, textAlign: 'center', marginTop: spacing.lg },
});
