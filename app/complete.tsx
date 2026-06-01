import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing, radius } from '../src/theme';

export default function CompleteScreen() {
  const { workoutId, duration } = useLocalSearchParams<{ workoutId: string; duration: string }>();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a3a2a', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 40 }}>✓</Text>
        </View>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 8 }}>Workout Complete</Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl }}>{duration} min · Logged ✓</Text>
        <View style={{ width: '100%', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#1a3a2a', marginBottom: spacing.xl }}>
          <Text style={{ fontSize: 12, color: '#4ade80', marginBottom: 4 }}>⌚ Garmin sync</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#4ade80' }}>Synced · Avg HR 138 · Max HR 162</Text>
        </View>
        <TouchableOpacity style={{ width: '100%', padding: 16, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center' }} onPress={() => router.replace('/(tabs)')}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.bg }}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
