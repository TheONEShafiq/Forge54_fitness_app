/**
 * HomeScreen.tsx
 * Today's workout card + weekly stats.
 * Safe against new workouts.json schema where duration is a number.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '../theme';
import { resolveAllWorkouts } from '../utils/workoutResolver';
import { getWorkoutStats } from '../store/workoutStore';
import workoutData from '../../workouts.json';

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

export default function HomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [expandedWeek, setExpandedWeek] = useState<number>(1);

  useEffect(() => {
    getWorkoutStats().then(setStats).catch(() => setStats(null));
  }, []);

  const allWorkouts = resolveAllWorkouts();
  const todayName = DAY_NAMES[new Date().getDay()];

  // Find today's workout — match by day name, prefer lowest incomplete week
  const todayWorkout = allWorkouts.find((w: any) =>
    w.day === todayName || w.day?.toLowerCase() === todayName.toLowerCase()
  );

  // Helper: safely format duration
  function fmtDuration(d: any): string {
    if (d === undefined || d === null) return '';
    return typeof d === 'number' ? `${d} min` : String(d);
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md }}>

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.greeting}>Forge54</Text>
            <Text style={s.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
          </View>
          {stats && (
            <View style={s.streakBadge}>
              <Text style={s.streakNum}>{stats.weeklyCount ?? 0}</Text>
              <Text style={s.streakLabel}>this week</Text>
            </View>
          )}
        </View>

        {/* Today's workout card */}
        {todayWorkout ? (
          <View style={s.todayCard}>
            <View style={s.todayCardTop}>
              <View>
                <Text style={s.todayLabel}>TODAY</Text>
                <Text style={s.todayTitle}>{todayWorkout.title}</Text>
                <Text style={s.todayMeta}>
                  {fmtDuration(todayWorkout.duration)}
                  {todayWorkout.type ? `  ·  ${todayWorkout.type.charAt(0).toUpperCase() + todayWorkout.type.slice(1)}` : ''}
                </Text>
                {todayWorkout.equipment && todayWorkout.equipment.length > 0 && (
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
            <Text style={s.restSub}>No workout scheduled today. Recovery is training too.</Text>
          </View>
        )}

        {/* Stats row */}
        {stats && (
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statVal}>{stats.totalCompleted ?? 0}</Text>
              <Text style={s.statLabel}>Total done</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{stats.weeklyCount ?? 0}</Text>
              <Text style={s.statLabel}>This week</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{stats.currentStreak ?? 0}</Text>
              <Text style={s.statLabel}>Day streak</Text>
            </View>
          </View>
        )}

        {/* Weekly program strip */}
        <Text style={s.sectionTitle}>This Week</Text>
        {(workoutData as any).weeks.map((week: any) => {
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
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.weekTitle}>{week.label}</Text>
                    <View style={[s.phasePill, { backgroundColor: phaseColor + '22', borderColor: phaseColor }]}>
                      <Text style={[s.phasePillText, { color: phaseColor }]}>
                        {week.phase.charAt(0).toUpperCase() + week.phase.slice(1)}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={s.chevron}>{isExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {isExpanded && weekWorkouts.map((wo: any) => (
                <TouchableOpacity
                  key={wo.id}
                  style={[s.woRow, wo.day === todayName && s.woRowToday]}
                  onPress={() => router.push({ pathname: '/player', params: { workoutId: wo.id } })}
                  activeOpacity={0.7}
                >
                  <View style={[s.woDayBar, { backgroundColor: TYPE_COLORS[wo.type] || colors.textMuted }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.woDayLabel}>{wo.day}</Text>
                    <Text style={s.woName}>{wo.title}</Text>
                    <Text style={s.woMeta}>{fmtDuration(wo.duration)}</Text>
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
  streakBadge: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.sm, alignItems: 'center', minWidth: 60, borderWidth: 1, borderColor: colors.border },
  streakNum: { fontSize: 22, fontWeight: '700', color: colors.accent },
  streakLabel: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
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
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statVal: { fontSize: 24, fontWeight: '700', color: colors.accent },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
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
