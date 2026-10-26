import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing } from '../src/theme';
import ProfileForm from '../src/components/ProfileForm';
import { saveProfile, markProfilePrompted } from '../src/store/settingsStore';
import { rebuildPlan } from '../src/store/planStore';

// Shown once, from Home, when no profile has been saved yet. Saving builds the
// user's first plan from the profile and their equipment.
export default function OnboardingScreen() {
  const router = useRouter();

  async function notNow() {
    await markProfilePrompted();
    router.back();
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={s.title}>Set up your profile</Text>
        <Text style={s.sub}>
          A few details so Forge can build your training program around you. It uses the
          equipment list in Settings too — change any of it later and Forge rebuilds the plan.
        </Text>
        <ProfileForm
          initial={null}
          saveLabel="Save and continue"
          onSave={async p => { await saveProfile(p); await rebuildPlan(); router.back(); }}
        />
        <TouchableOpacity style={s.skip} onPress={notNow}>
          <Text style={s.skipText}>Not now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  sub: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  skip: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  skipText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
});
