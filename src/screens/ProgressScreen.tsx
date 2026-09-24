/**
 * ProgressScreen.tsx  
 * Four tabs: Weekly / Monthly / Exercises / Garmin
 */
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { getWeeklyStats, getMonthlyStats, getExerciseProgression, getGarminToken, getAllLogs, isPerformed, logVolume } from '../store/workoutStore';
import { connectGarminAccount, getGarminClientId } from '../utils/garminSync';

const MAX_TRACKED_EXERCISES = 4;
const DAY_LABELS = ['Su', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatVolume(lb: number): string {
  return lb >= 1000 ? `${(lb / 1000).toFixed(1)}k lb` : `${Math.round(lb)} lb`;
}

function pctChange(now: number, prev: number): string | null {
  if (!prev) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}
const TABS = ['Weekly', 'Monthly', 'Exercises', 'Garmin'];

export default function ProgressScreen() {
  const [activeTab, setActiveTab] = useState(0);
  const [weekStats, setWeekStats] = useState<any>(null);
  const [lastWeekStats, setLastWeekStats] = useState<any>(null);
  const [monthStats, setMonthStats] = useState<any>(null);
  const [exProgress, setExProgress] = useState<Record<string, any[]>>({});
  const [garminConnected, setGarminConnected] = useState(false);
  const [garminConnecting, setGarminConnecting] = useState(false);

  // Reload on focus so a session saved moments ago shows up without a restart.
  useFocusEffect(useCallback(() => {
    getWeeklyStats().then(setWeekStats);
    getWeeklyStats(1).then(setLastWeekStats);
    getMonthlyStats().then(setMonthStats);
    getGarminToken().then(token => setGarminConnected(!!token));
    // Track the weighted exercises that show up most often in real logs.
    getAllLogs().then(all => {
      const freq: Record<string, number> = {};
      for (const log of Object.values(all)) {
        for (const ex of log.exercises) {
          if (ex.sets.some(st => isPerformed(st) && st.weight > 0)) freq[ex.exerciseName] = (freq[ex.exerciseName] || 0) + 1;
        }
      }
      const names = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, MAX_TRACKED_EXERCISES).map(([n]) => n);
      return Promise.all(names.map(async name => ({ name, data: await getExerciseProgression(name) })));
    }).then(results => {
      const map: Record<string, any[]> = {};
      results.forEach(r => { map[r.name] = r.data; });
      setExProgress(map);
    });
  }, []));

  // Week runs Sunday–Saturday, matching getWeeklyStats.
  const weeklyBars = DAY_LABELS.map((day, i) => ({
    day,
    vol: (weekStats?.weekLogs || [])
      .filter((l: any) => new Date(l.completedAt).getDay() === i)
      .reduce((sum: number, l: any) => sum + logVolume(l), 0),
  }));
  const maxVol = Math.max(...weeklyBars.map(b => b.vol), 1);
  const weekSessions = weekStats?.weekLogs?.length || 0;
  const weekChange = pctChange(weekStats?.totalVolume || 0, lastWeekStats?.totalVolume || 0);

  const now = new Date();
  const monthlyBars = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { mo: MONTH_LABELS[d.getMonth()], vol: monthStats?.[key]?.volume || 0, count: monthStats?.[key]?.count || 0 };
  });
  const maxMo = Math.max(...monthlyBars.map(b => b.vol), 1);
  const thisMonth = monthlyBars[5];
  const lastMonth = monthlyBars[4];
  const monthChange = pctChange(thisMonth.vol, lastMonth.vol);
  const exProgressList = Object.entries(exProgress).filter(([, data]) => data.length > 0);

  async function handleConnectGarmin() {
    const clientId = await getGarminClientId();
    if (!clientId) {
      Alert.alert(
        'Garmin not set up yet',
        'Add your Garmin Client ID in Settings first (once your Garmin Developer Program application is approved).'
      );
      return;
    }
    setGarminConnecting(true);
    try {
      const ok = await connectGarminAccount();
      setGarminConnected(ok);
      if (!ok) Alert.alert('Connection cancelled', 'Garmin authorization did not complete.');
    } catch (e: any) {
      Alert.alert('Garmin connection failed', e?.message || 'Something went wrong.');
    } finally {
      setGarminConnecting(false);
    }
  }


  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.title}>Progress</Text></View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        {TABS.map((tab, i) => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === i && styles.tabActive]} onPress={() => setActiveTab(i)}>
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* WEEKLY */}
        {activeTab === 0 && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>VOLUME BY DAY (LBS)</Text>
            <View style={styles.barChart}>
              {weeklyBars.map((b, i) => (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.bar, { height: b.vol ? Math.round((b.vol / maxVol) * 80) : 4, backgroundColor: b.vol ? colors.accent : colors.bgElevated }]} />
                  <Text style={styles.barLabel}>{b.day}</Text>
                </View>
              ))}
            </View>
            <View style={styles.statsGrid}>
              {[
                { label: 'Workouts completed', value: String(weekStats?.workoutsCompleted || 0) },
                { label: 'Partial sessions', value: String(weekStats?.workoutsPartial || 0) },
                { label: 'Total volume', value: formatVolume(weekStats?.totalVolume || 0) },
                { label: 'vs last week', value: weekChange ?? '—', positive: !!weekChange && !weekChange.startsWith('-') },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={[styles.statValue, s.positive && { color: colors.success }]}>{s.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* MONTHLY */}
        {activeTab === 1 && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>MONTHLY VOLUME TREND</Text>
            <View style={styles.barChart}>
              {monthlyBars.map((b, i) => (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.bar, { height: b.vol ? Math.round((b.vol / maxMo) * 80) : 4, backgroundColor: b.vol ? colors.accent : colors.bgElevated, opacity: 0.4 + 0.6 * (i / 5) }]} />
                  <Text style={styles.barLabel}>{b.mo}</Text>
                </View>
              ))}
            </View>
            <View style={styles.statsGrid}>
              {[
                { label: 'Sessions this month', value: String(thisMonth.count) },
                { label: 'Volume this month', value: formatVolume(thisMonth.vol) },
                { label: 'Avg per session', value: formatVolume(thisMonth.count ? thisMonth.vol / thisMonth.count : 0) },
                { label: 'vs last month', value: monthChange ?? '—', positive: !!monthChange && !monthChange.startsWith('-') },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={[styles.statValue, s.positive && { color: colors.success }]}>{s.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* EXERCISES */}
        {activeTab === 2 && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>PER-EXERCISE PROGRESSION</Text>
            {exProgressList.length === 0 && (
              <Text style={styles.exChartUnit}>No weighted sets logged yet. Progression shows up here after your first sessions.</Text>
            )}
            {exProgressList.map(([name, points]) => {
              // Last 6 sessions, max weight lifted in each.
              const recent = points.slice(-6);
              const data = recent.map((pt: any) => pt.maxWeight);
              const maxV = Math.max(...data, 1);
              return (
                <View key={name} style={styles.exChart}>
                  <Text style={styles.exChartName}>{name} <Text style={styles.exChartUnit}>(lbs)</Text></Text>
                  <View style={styles.exBars}>
                    {data.map((v: number, i: number) => (
                      <View key={i} style={[styles.exBar, { height: Math.round((v / maxV) * 48) + 8, opacity: 0.5 + 0.5 * (i / Math.max(data.length - 1, 1)) }]} />
                    ))}
                  </View>
                  <View style={styles.exBarLabels}>
                    {recent.map((pt: any, i: number) => <Text key={i} style={styles.exBarLabel}>{pt.date.slice(5)}</Text>)}
                  </View>
                  <Text style={styles.exRange}>
                    {data[0]} → <Text style={{ color: colors.success, fontWeight: '700' }}>{data[data.length - 1]} lbs</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* GARMIN */}
        {activeTab === 3 && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>LATEST WORKOUT · GARMIN DATA</Text>
            <Text style={styles.exChartUnit}>Sample data — Garmin sync isn't live yet.</Text>
            <View style={styles.garminCard}>
              <Text style={styles.garminWorkoutName}>TRX + Sandbag Circuit</Text>
              {[
                { metric: 'Avg Heart Rate', value: '138 bpm' },
                { metric: 'Max Heart Rate', value: '162 bpm' },
                { metric: 'VO2 Max (est.)', value: '46.2 ml/kg/min' },
                { metric: 'Intensity Minutes', value: '28 vigorous' },
                { metric: 'Calories', value: '387 kcal' },
                { metric: 'Training Effect', value: '3.8 — Improving' },
              ].map(row => (
                <View key={row.metric} style={styles.garminRow}>
                  <Text style={styles.garminMetric}>{row.metric}</Text>
                  <Text style={styles.garminValue}>{row.value}</Text>
                </View>
              ))}
              <Text style={styles.sectionLabel}>HR ZONES</Text>
              <View style={styles.hrZones}>
                {[
                  { pct: 5, color: '#67e8f9' },
                  { pct: 15, color: '#22d3ee' },
                  { pct: 35, color: '#fb923c' },
                  { pct: 35, color: '#ef4444' },
                  { pct: 10, color: '#991b1b' },
                ].map((z, i) => (
                  <View key={i} style={[styles.hrZone, { flex: z.pct, backgroundColor: z.color }]}>
                    <Text style={styles.hrZoneLabel}>Z{i + 1}</Text>
                  </View>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.connectBtn, garminConnected && styles.connectBtnConnected]}
              onPress={handleConnectGarmin}
              disabled={garminConnecting}
            >
              <Text style={styles.connectBtnText}>
                {garminConnecting ? 'Connecting…' : garminConnected ? '✓  Garmin Connected' : '⟳  Connect Garmin Account'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.garminNote}>
              {garminConnected
                ? 'Auto-syncs via Garmin Connect API after each workout'
                : 'Requires an approved Garmin Developer Program application — see Settings'}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  tabScroll: { paddingHorizontal: spacing.md, marginBottom: 4, flexGrow: 0 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, marginRight: 8, marginBottom: 8 },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: colors.bg, fontWeight: '700' },
  scroll: { flex: 1 },
  tabContent: { padding: spacing.md },
  sectionLabel: { fontSize: 10, fontWeight: '600', color: colors.textDim, letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, marginBottom: spacing.md, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3, minHeight: 4 },
  barLabel: { fontSize: 9, color: colors.textDim },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '47%', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  statLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  exChart: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  exChartName: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  exChartUnit: { fontSize: 12, color: colors.textMuted, fontWeight: '400' },
  exBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 60, marginBottom: 4 },
  exBar: { flex: 1, borderRadius: 2, backgroundColor: colors.success },
  exBarLabels: { flexDirection: 'row', gap: 4 },
  exBarLabel: { flex: 1, fontSize: 9, color: colors.textDim, textAlign: 'center' },
  exRange: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  garminCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  garminWorkoutName: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  garminRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  garminMetric: { fontSize: 13, color: colors.textMuted },
  garminValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  hrZones: { flexDirection: 'row', height: 24, borderRadius: radius.sm, overflow: 'hidden', marginTop: 6 },
  hrZone: { alignItems: 'center', justifyContent: 'center' },
  hrZoneLabel: { fontSize: 9, color: '#fff', fontWeight: '700' },
  connectBtn: { marginTop: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  connectBtnConnected: { borderColor: colors.success, backgroundColor: colors.success + '15' },
  connectBtnText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  garminNote: { fontSize: 11, color: colors.textDim, textAlign: 'center', marginTop: 8 },
});
