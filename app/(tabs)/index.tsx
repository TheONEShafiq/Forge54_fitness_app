import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '../../src/theme';
import { resolveAllWorkouts, getActiveWeeks } from '../../src/utils/workoutResolver';
import { getProgramLength, ProgramLength, shouldPromptForProfile } from '../../src/store/settingsStore';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const TYPE_COLORS: Record<string, string> = {
  strength: '#a3e635',
  power:    '#fb923c',
  cardio:   '#60a5fa',
  athletic: '#f472b6',
};

const PHASE_COLORS: Record<string, string> = {
  foundation: '#3b82f6',
  load:       '#f97316',
  peak:       '#ef4444',
  deload:     '#a78bfa',
};

function fmtDuration(d: any): string {
  if (d == null) return '';
  return typeof d === 'number' ? `${d} min` : String(d);
}

export default function HomeScreen() {
  const router = useRouter();
  const [expandedWeek, setExpandedWeek] = useState<number>(1);
  const [programLength, setProgramLength] = useState<ProgramLength>(6);

  useFocusEffect(
    useCallback(() => {
      getProgramLength().then(setProgramLength);
      // First launch with no profile: ask once (Save or "Not now" both stop it).
      shouldPromptForProfile().then(prompt => { if (prompt) router.push('/onboarding'); });
    }, [router])
  );

  const allWorkouts = resolveAllWorkouts(programLength);
  const activeWeeks = getActiveWeeks(programLength);
  const todayName = DAY_NAMES[new Date().getDay()];
  const todayWorkout = allWorkouts.find(
    (w: any) => w.day?.toLowerCase() === todayName.toLowerCase()
  );

  return (
    <SafeAreaView style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.greeting}>Forge</Text>
            <Text style={s.date}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long', month: 'short', day: 'numeric',
              })}
            </Text>
          </View>
        </View>

        {/* Today card */}
        {todayWorkout ? (
          <View style={s.todayCard}>
            <View style={s.todayCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.todayLabel}>TODAY</Text>
                <Text style={s.todayTitle}>{todayWorkout.title}</Text>
                <Text style={s.todayMeta}>
                  {fmtDuration(todayWorkout.duration)}
                  {todayWorkout.type
                    ? `  ·  ${todayWorkout.type.charAt(0).toUpperCase() + todayWorkout.type.slice(1)}`
                    : ''}
                </Text>
                {todayWorkout.equipment?.length > 0 && (
                  <Text style={s.todayEquip} numberOfLines={1}>
                    {todayWorkout.equipment.slice(0, 3).join('  ·  ')}
                    {todayWorkout.equipment.length > 3 ? '  +more' : ''}
                  </Text>
                )}
              </View>
              <View style={[s.typeDot, { backgroundColor: TYPE_COLORS[todayWorkout.type] || colors.accent }]} />
            </View>
            <TouchableOpacity
              style={s.startBtn}
              onPress={() => router.push({ pathname: '/player', params: { workoutId: todayWorkout.id } })}
            >
              <Text style={s.startBtnText}>Start Workout  ▶</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.restCard}>
            <Text style={s.restTitle}>Rest Day</Text>
            <Text style={s.restSub}>No workout today. Recovery is training too.</Text>
          </View>
        )}

        {/* Program strip */}
        <Text style={s.sectionTitle}>Program</Text>
        {activeWeeks.map((week: any) => {
          const isExpanded = expandedWeek === week.week;
          const phaseColor = PHASE_COLORS[week.phase] || colors.textMuted;
          const weekWorkouts = allWorkouts.filter((w: any) => w.weekNumber === week.week);

          return (
            <View key={week.week} style={s.weekCard}>
              <TouchableOpacity
                style={s.weekHeader}
                onPress={() => setExpandedWeek(isExpanded ? 0 : week.week)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.weekTitle}>{week.label}</Text>
                  <View style={[s.phasePill, { backgroundColor: phaseColor + '22', borderColor: phaseColor }]}>
                    <Text style={[s.phasePillText, { color: phaseColor }]}>
                      {week.phase.charAt(0).toUpperCase() + week.phase.slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={s.chevron}>{isExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {isExpanded && weekWorkouts.map((wo: any) => (
                <TouchableOpacity
                  key={wo.id}
                  style={[
                    s.woRow,
                    wo.day?.toLowerCase() === todayName.toLowerCase() && s.woRowToday,
                  ]}
                  onPress={() => router.push({ pathname: '/player', params: { workoutId: wo.id } })}
                  activeOpacity={0.7}
                >
                  <View style={[s.woDayBar, { backgroundColor: TYPE_COLORS[wo.type] || colors.textMuted }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.woDayLabel}>{wo.day}</Text>
                    <Text style={s.woName}>{wo.title}</Text>
                    <Text style={s.woMeta}>
                      {fmtDuration(wo.duration)}
                      {wo.equipment?.length > 0
                        ? `  ·  ${wo.equipment.slice(0, 2).join(', ')}`
                        : ''}
                    </Text>
                  </View>
                  {wo.benchmarkWorkout && <Text style={s.benchTag}>🏆</Text>}
                  <Text style={s.woArrow}>▶</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.text },
  date: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  todayCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  todayCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  todayLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, marginBottom: 4 },
  todayTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
  todayMeta: { fontSize: 13, color: colors.textMuted },
  todayEquip: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  typeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  startBtn: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  startBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  restCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  restTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  restSub: { fontSize: 13, color: colors.textMuted },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  weekCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: 'hidden' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  weekTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  phasePill: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  phasePillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  chevron: { color: colors.textMuted, fontSize: 13 },
  woRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: colors.border },
  woRowToday: { backgroundColor: colors.bgElevated },
  woDayBar: { width: 3, height: 32, borderRadius: 2, marginRight: 10 },
  woDayLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  woName: { fontSize: 13, fontWeight: '600', color: colors.text },
  woMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  benchTag: { fontSize: 14, marginRight: 6 },
  woArrow: { color: colors.accent, fontSize: 13 },
});
