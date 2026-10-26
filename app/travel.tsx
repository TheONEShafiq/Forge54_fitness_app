import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '../src/theme';
import { getTravel, saveTravel, startTravel, TravelState } from '../src/store/settingsStore';
import { getAllLogs } from '../src/store/workoutStore';
import {
  TRAVEL_SETUPS, PACKABLE_GEAR, travelWorkoutsFor, gearLabel,
} from '../src/utils/travelLibrary';
import type { TravelSetup, TravelGear, TravelWorkout } from '../src/utils/travelLibrary';
import { confirmEndTravel } from '../src/utils/travelActions';
import { getTravelWorkouts } from '../src/store/planStore';

export default function TravelScreen() {
  const router = useRouter();
  const [travel, setTravel] = useState<TravelState | null>(null);
  const [lastDone, setLastDone] = useState<Record<string, number>>({});
  const [showOthers, setShowOthers] = useState(false);
  // Built for this setup + packed gear and the user's profile (session length,
  // styles); regenerated whenever the setup or gear changes.
  const [built, setBuilt] = useState<any[]>([]);

  const load = useCallback(() => {
    getTravel().then(t => { setTravel(t); getTravelWorkouts(t).then(setBuilt); });
    getAllLogs().then(all => {
      const m: Record<string, number> = {};
      for (const l of Object.values(all)) {
        if (l.status === 'skipped') continue;
        const t = new Date(l.completedAt).getTime();
        if (!m[l.id] || t > m[l.id]) m[l.id] = t;
      }
      setLastDone(m);
    });
  }, []);
  useFocusEffect(load);

  if (!travel) return <SafeAreaView style={s.container} />;

  // While active, edits save immediately; before that they're just a preview.
  async function update(patch: Partial<TravelState>) {
    const next = { ...travel!, ...patch };
    setTravel(next);
    await saveTravel(next);
    setBuilt(await getTravelWorkouts(next));
  }

  function chooseSetup(setup: TravelSetup) { update({ setup }); }
  function toggleGear(g: TravelGear) {
    const packed = travel!.packed.includes(g) ? travel!.packed.filter(x => x !== g) : [...travel!.packed, g];
    update({ packed });
  }

  const { fits, others } = travelWorkoutsFor(travel.setup, travel.packed);

  function row(w: TravelWorkout | any, dim = false) {
    const last = lastDone[w.id];
    return (
      <TouchableOpacity
        key={w.id}
        style={[s.woRow, dim && { opacity: 0.45 }]}
        onPress={() => router.push({ pathname: '/player', params: { workoutId: w.id } })}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.woName}>{w.title}</Text>
          <Text style={s.woMeta}>
            {w.duration} min  ·  {w.equipment.join(', ')}
            {last ? `  ·  last ${new Date(last).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
          </Text>
          <Text style={s.woSummary} numberOfLines={2}>{w.summary}</Text>
        </View>
        <Text style={s.arrow}>▶</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.title}>✈  Travel Mode</Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.close}>Done</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md }} showsVerticalScrollIndicator={false}>
        <View style={[s.statusCard, travel.active && { borderColor: colors.accent }]}>
          <Text style={s.statusTitle}>{travel.active ? 'You’re traveling' : 'Heading out of town?'}</Text>
          <Text style={s.statusSub}>
            {travel.active
              ? `Since ${travel.since}. Home shows a travel workout instead of the program. End it when you’re back.`
              : 'Turn this on and Home suggests a workout that fits where you’re training. Your program waits for you.'}
          </Text>
          {travel.active ? (
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => confirmEndTravel(load)}>
              <Text style={[s.btnText, { color: colors.text }]}>I’m back — end travel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.btn} onPress={async () => setTravel(await startTravel(travel.setup, travel.packed))}>
              <Text style={s.btnText}>Start travel mode</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.sectionTitle}>Where are you training?</Text>
        {TRAVEL_SETUPS.map(opt => {
          const on = travel.setup === opt.value;
          return (
            <TouchableOpacity key={opt.value} style={[s.setupCard, on && s.setupCardOn]} onPress={() => chooseSetup(opt.value)} activeOpacity={0.8}>
              <View style={[s.radio, on && s.radioOn]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.setupLabel, on && { color: colors.accent }]}>{opt.label}</Text>
                <Text style={s.setupSub}>{opt.sub}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {travel.setup !== 'bodyweight' && (
          <>
            <Text style={[s.sectionTitle, { marginTop: spacing.md }]}>What did you pack?</Text>
            <View style={s.chips}>
              {PACKABLE_GEAR.map(g => {
                const on = travel.packed.includes(g.value);
                return (
                  <TouchableOpacity key={g.value} style={[s.chip, on && s.chipOn]} onPress={() => toggleGear(g.value)}>
                    <Text style={[s.chipText, on && { color: colors.accent }]}>{on ? '✓ ' : ''}{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {travel.setup === 'gym' && (
              <Text style={s.note}>Hotel gym assumes {(['dumbbells', 'bench', 'cardio'] as const).map(gearLabel).join(', ').toLowerCase()}.</Text>
            )}
          </>
        )}

        <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Built for this setup  ·  {built.length}</Text>
        <Text style={[s.note, { marginBottom: spacing.sm }]}>Made from your profile and session length with the gear above. Change the setup and they rebuild.</Text>
        <View style={s.listCard}>{built.map(w => row(w))}</View>

        <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Classic travel workouts  ·  {fits.length}</Text>
        <View style={s.listCard}>{fits.map(w => row(w))}</View>

        {others.length > 0 && (
          <>
            <TouchableOpacity onPress={() => setShowOthers(v => !v)} style={{ paddingVertical: spacing.sm }}>
              <Text style={s.note}>{showOthers ? '▲' : '▼'}  {others.length} more that need other gear</Text>
            </TouchableOpacity>
            {showOthers && <View style={s.listCard}>{others.map(w => row(w, true))}</View>}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, fontWeight: '700', color: colors.accent },
  statusCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg },
  statusTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  statusSub: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.md },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.borderLight },
  btnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  setupCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 8 },
  setupCardOn: { borderColor: colors.accent, backgroundColor: colors.accent + '12' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.borderLight },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  setupLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  setupSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accent + '18' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  note: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  listCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  woRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  woName: { fontSize: 14, fontWeight: '700', color: colors.text },
  woMeta: { fontSize: 11, color: colors.accent, marginTop: 2, fontWeight: '600' },
  woSummary: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 16 },
  arrow: { color: colors.accent, fontSize: 13, marginLeft: 8 },
});
