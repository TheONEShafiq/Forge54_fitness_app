import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing, radius } from '../src/theme';

type Params = {
  workoutId: string;
  status: 'complete' | 'partial' | 'skipped';
  duration: string;
  setsDone: string;
  setsPlanned: string;
  exercisesDone: string;
  exercisesPlanned: string;
  volume: string;
};

function formatVolume(lb: number): string {
  return lb >= 1000 ? `${(lb / 1000).toFixed(1)}k lb` : `${lb} lb`;
}

export default function CompleteScreen() {
  const p = useLocalSearchParams<Params>();
  const router = useRouter();
  const partial = p.status === 'partial';
  const skipped = p.status === 'skipped';
  const accent = skipped ? colors.textMuted : partial ? colors.warning : colors.success;

  const stats = [
    { label: 'Duration', value: `${p.duration ?? 0} min` },
    { label: 'Exercises', value: `${p.exercisesDone ?? 0} / ${p.exercisesPlanned ?? 0}` },
    { label: 'Sets', value: `${p.setsDone ?? 0} / ${p.setsPlanned ?? 0}` },
    { label: 'Volume', value: formatVolume(Number(p.volume) || 0) },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 40, color: accent }}>{skipped ? '–' : partial ? '◐' : '✓'}</Text>
        </View>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
          {skipped ? 'Workout Skipped' : partial ? 'Partial Workout Saved' : 'Workout Complete'}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl }}>Logged ✓</Text>
        <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.xl }}>
          {stats.map(s => (
            <View key={s.label} style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md }}>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>{s.label}</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{s.value}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={{ width: '100%', padding: 16, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center' }} onPress={() => router.replace('/(tabs)')}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.bg }}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
