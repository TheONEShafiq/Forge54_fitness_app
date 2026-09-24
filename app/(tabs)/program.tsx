import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '../../src/theme';
import { resolveAllWorkouts, getActiveWeeks } from '../../src/utils/workoutResolver';
import { getProgramLength, ProgramLength } from '../../src/store/settingsStore';

const PHASE_COLORS: Record<string, string> = {
  foundation: '#3b82f6', load: '#f97316', peak: '#ef4444', deload: '#a78bfa',
};
const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  strength: { label: 'Strength', color: '#a3e635' },
  power:    { label: 'Power',    color: '#fb923c' },
  cardio:   { label: 'Cardio',   color: '#60a5fa' },
  athletic: { label: 'Athletic', color: '#f472b6' },
};

export default function ProgramScreen() {
  const router = useRouter();
  const [expandedWeek, setExpandedWeek] = useState<number>(1);
  const [programLength, setProgramLength] = useState<ProgramLength>(6);

  useFocusEffect(
    useCallback(() => {
      getProgramLength().then(setProgramLength);
    }, [])
  );

  const allResolved = resolveAllWorkouts(programLength);
  const activeWeeks = getActiveWeeks(programLength);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Forge Program</Text>
        <Text style={s.subtitle}>{programLength} weeks · 5 days/week · {allResolved.length} workouts</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>
        {activeWeeks.map((week: any) => {
          const isExpanded = expandedWeek === week.week;
          const phaseColor = PHASE_COLORS[week.phase] || colors.textMuted;
          const weekWorkouts = allResolved.filter((w: any) => w.weekNumber === week.week);
          return (
            <View key={week.week} style={s.weekCard}>
              <TouchableOpacity style={s.weekHeader} onPress={() => setExpandedWeek(isExpanded ? 0 : week.week)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.weekTitle}>{week.label}</Text>
                    <View style={[s.phaseBadge, { backgroundColor: phaseColor + '22', borderColor: phaseColor }]}>
                      <Text style={[s.phaseBadgeText, { color: phaseColor }]}>{week.phase.charAt(0).toUpperCase() + week.phase.slice(1)}</Text>
                    </View>
                  </View>
                  {week.progressionNote && <Text style={s.progNote} numberOfLines={1}>{week.progressionNote}</Text>}
                </View>
                <Text style={s.chevron}>{isExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {isExpanded && weekWorkouts.map((wo: any) => {
                const badge = TYPE_BADGES[wo.type] || { label: wo.type, color: colors.textMuted };
                return (
                  <TouchableOpacity
                    key={wo.id}
                    style={s.workoutRow}
                    onPress={() => router.push({ pathname: '/player', params: { workoutId: wo.id } })}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={s.dayLabel}>{wo.day}</Text>
                      <Text style={s.workoutTitle}>{wo.title}</Text>
                      <Text style={s.workoutMeta}>{wo.duration} min</Text>
                      {wo.benchmarkWorkout && <Text style={s.benchmarkTag}>🏆 Benchmark</Text>}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={[s.typeBadge, { backgroundColor: badge.color + '22', borderColor: badge.color }]}>
                        <Text style={[s.typeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      <Text style={s.arrow}>▶</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  weekCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  weekTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  phaseBadge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  phaseBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  progNote: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  chevron: { color: colors.textMuted, fontSize: 14 },
  workoutRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  dayLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  workoutTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  workoutMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  benchmarkTag: { fontSize: 11, color: '#f59e0b', marginTop: 3, fontWeight: '600' },
  typeBadge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  arrow: { color: colors.accent, fontSize: 14 },
});
