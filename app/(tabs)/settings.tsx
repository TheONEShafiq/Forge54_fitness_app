import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Switch, Share,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { colors, spacing, radius } from '../../src/theme';
import {
  getProgramLength, setProgramLength as persistProgramLength, ProgramLength,
  getEquipment, addEquipment, removeEquipment,
  getAutoStart, setAutoStart,
} from '../../src/store/settingsStore';
import {
  getCloudVoiceEnabled, setCloudVoiceEnabled, getTtsApiKey, setTtsApiKey,
} from '../../src/utils/ttsService';
import { getGarminClientId, setGarminClientId } from '../../src/utils/garminSync';

const LENGTHS: ProgramLength[] = [4, 5, 6];

function readCrashLog(): string | null {
  try {
    const file = new File(Paths.document, 'last-crash.txt');
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

function clearCrashLog() {
  try {
    const file = new File(Paths.document, 'last-crash.txt');
    if (file.exists) file.delete();
  } catch {}
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export default function SettingsScreen() {
  // "programLength"/"equipment" are the pending, on-screen values; the
  // "original*" pair is what's actually persisted, used only to detect
  // unsaved changes and to compute the add/remove diff on Save.
  const [programLength, setProgramLengthState] = useState<ProgramLength>(6);
  const [originalProgramLength, setOriginalProgramLength] = useState<ProgramLength>(6);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [originalEquipment, setOriginalEquipment] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [programSavedJustNow, setProgramSavedJustNow] = useState(false);
  const [cloudVoiceEnabled, setCloudVoiceEnabledState] = useState(false);
  const [autoStart, setAutoStartState] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [crashLog, setCrashLog] = useState<string | null>(null);
  const [garminClientIdInput, setGarminClientIdInput] = useState('');
  const [hasGarminClientId, setHasGarminClientId] = useState(false);
  const [garminSavedJustNow, setGarminSavedJustNow] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getProgramLength().then(v => { setProgramLengthState(v); setOriginalProgramLength(v); });
      getEquipment().then(v => { setEquipment(v); setOriginalEquipment(v); });
      getCloudVoiceEnabled().then(setCloudVoiceEnabledState);
      getAutoStart().then(setAutoStartState);
      getTtsApiKey().then(k => setHasStoredKey(!!k));
      getGarminClientId().then(k => setHasGarminClientId(!!k));
      setCrashLog(readCrashLog());
    }, [])
  );

  function selectProgramLength(weeks: ProgramLength) {
    setProgramLengthState(weeks);
  }

  function handleAddEquipment() {
    const trimmed = newItem.trim();
    if (!trimmed || equipment.some(e => e.toLowerCase() === trimmed.toLowerCase())) return;
    setEquipment(prev => [...prev, trimmed]);
    setNewItem('');
  }

  function handleRemoveEquipment(item: string) {
    setEquipment(prev => prev.filter(e => e !== item));
  }

  const isProgramDirty = programLength !== originalProgramLength || !arraysEqual(equipment, originalEquipment);

  async function handleSaveProgramSettings() {
    if (programLength !== originalProgramLength) {
      await persistProgramLength(programLength);
    }
    const added = equipment.filter(e => !originalEquipment.includes(e));
    const removed = originalEquipment.filter(e => !equipment.includes(e));
    for (const item of added) await addEquipment(item);
    for (const item of removed) await removeEquipment(item);
    setOriginalProgramLength(programLength);
    setOriginalEquipment(equipment);
    setProgramSavedJustNow(true);
    setTimeout(() => setProgramSavedJustNow(false), 2000);
  }

  async function handleToggleAutoStart(value: boolean) {
    setAutoStartState(value);
    await setAutoStart(value);
  }

  async function handleToggleCloudVoice(value: boolean) {
    setCloudVoiceEnabledState(value);
    await setCloudVoiceEnabled(value);
  }

  async function handleSaveApiKey() {
    await setTtsApiKey(apiKeyInput.trim());
    setHasStoredKey(!!apiKeyInput.trim());
    setApiKeyInput('');
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 2000);
  }

  async function handleSaveGarminClientId() {
    await setGarminClientId(garminClientIdInput.trim());
    setHasGarminClientId(!!garminClientIdInput.trim());
    setGarminClientIdInput('');
    setGarminSavedJustNow(true);
    setTimeout(() => setGarminSavedJustNow(false), 2000);
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Settings</Text>

        {/* Program length */}
        <Text style={s.sectionTitle}>Program Length</Text>
        <Text style={s.sectionSub}>How many weeks of the program to run.</Text>
        <View style={s.lengthRow}>
          {LENGTHS.map(weeks => (
            <TouchableOpacity
              key={weeks}
              style={[s.lengthChip, programLength === weeks && s.lengthChipActive]}
              onPress={() => selectProgramLength(weeks)}
            >
              <Text style={[s.lengthChipText, programLength === weeks && s.lengthChipTextActive]}>
                {weeks} weeks
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Equipment */}
        <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Equipment</Text>
        <Text style={s.sectionSub}>What you have available at home.</Text>
        <View style={s.equipWrap}>
          {equipment.map(item => (
            <View key={item} style={s.equipTag}>
              <Text style={s.equipTagText}>{item}</Text>
              <TouchableOpacity onPress={() => handleRemoveEquipment(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.equipTagRemove}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          {equipment.length === 0 && <Text style={s.emptyText}>No equipment added yet.</Text>}
        </View>
        <View style={s.addRow}>
          <TextInput
            style={s.addInput}
            value={newItem}
            onChangeText={setNewItem}
            placeholder="Add equipment (e.g. 30lb KB)"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleAddEquipment}
            returnKeyType="done"
          />
          <TouchableOpacity style={s.addBtn} onPress={handleAddEquipment}>
            <Text style={s.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {isProgramDirty && (
          <TouchableOpacity style={s.saveChangesBtn} onPress={handleSaveProgramSettings}>
            <Text style={s.saveChangesBtnText}>Save Changes</Text>
          </TouchableOpacity>
        )}
        {!isProgramDirty && programSavedJustNow && (
          <Text style={s.savedConfirmText}>Saved ✓</Text>
        )}

        {/* Workout player */}
        <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Workout Player</Text>
        <Text style={s.sectionSub}>
          Timed exercises start on their own after a 3-2-1 countdown, and the rest before the
          next exercise counts straight into it. Turn off to tap Start yourself.
        </Text>
        <View style={s.voiceRow}>
          <Text style={s.voiceLabel}>Auto-start timed sets</Text>
          <Switch
            value={autoStart}
            onValueChange={handleToggleAutoStart}
            trackColor={{ false: colors.border, true: colors.accentDim }}
            thumbColor={autoStart ? colors.accent : '#888'}
          />
        </View>

        {/* Voice */}
        <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Voice</Text>
        <Text style={s.sectionSub}>
          Workout cues already speak in a natural pre-recorded voice built into the app —
          no key needed, works offline. This only matters for text that isn't pre-recorded
          yet, like a brand-new exercise added after the last voice update: turn it on and
          add your own ElevenLabs key to have that new content speak naturally too, instead
          of falling back to your phone's built-in voice.
        </Text>
        <View style={s.voiceRow}>
          <Text style={s.voiceLabel}>Cloud voice for new content</Text>
          <Switch
            value={cloudVoiceEnabled}
            onValueChange={handleToggleCloudVoice}
            trackColor={{ false: colors.border, true: colors.accentDim }}
            thumbColor={cloudVoiceEnabled ? colors.accent : '#888'}
          />
        </View>
        <Text style={s.keyStatus}>{hasStoredKey ? 'API key saved.' : 'No API key saved yet.'}</Text>
        <View style={s.addRow}>
          <TextInput
            style={s.addInput}
            value={apiKeyInput}
            onChangeText={setApiKeyInput}
            placeholder="ElevenLabs API key (optional)"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={s.addBtn} onPress={handleSaveApiKey}>
            <Text style={s.addBtnText}>{savedJustNow ? 'Saved ✓' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        {/* Garmin */}
        <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Garmin</Text>
        <Text style={s.sectionSub}>
          Syncs heart rate, VO2 max, and other metrics from your Garmin device after each
          workout. Requires an approved Garmin Connect Developer Program application — this
          only unlocks once you have a Client ID from Garmin.
        </Text>
        <Text style={s.keyStatus}>{hasGarminClientId ? 'Client ID saved.' : 'No Client ID saved yet.'}</Text>
        <View style={s.addRow}>
          <TextInput
            style={s.addInput}
            value={garminClientIdInput}
            onChangeText={setGarminClientIdInput}
            placeholder="Garmin Client ID"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={s.addBtn} onPress={handleSaveGarminClientId}>
            <Text style={s.addBtnText}>{garminSavedJustNow ? 'Saved ✓' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.sectionSub}>Connect your account itself from Progress → Garmin, once this is saved.</Text>

        {/* Diagnostics — only shows up after a crash the app caught */}
        {crashLog && (
          <>
            <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Last Crash</Text>
            <Text style={s.sectionSub}>
              The app hit an error last time it ran. This is the actual error message —
              share it if you're troubleshooting.
            </Text>
            <View style={s.crashBox}>
              <Text style={s.crashText}>{crashLog}</Text>
            </View>
            <View style={s.addRow}>
              <TouchableOpacity
                style={[s.addBtn, { flex: 1 }]}
                onPress={() => Share.share({ message: crashLog })}
              >
                <Text style={s.addBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.addBtn, { flex: 1, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => { clearCrashLog(); setCrashLog(null); }}
              >
                <Text style={[s.addBtnText, { color: colors.textMuted }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  sectionSub: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 17 },
  crashBox: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, padding: spacing.md, marginBottom: spacing.sm },
  crashText: { fontSize: 11, color: colors.text, fontFamily: 'Courier', lineHeight: 16 },
  lengthRow: { flexDirection: 'row', gap: 10 },
  lengthChip: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, alignItems: 'center' },
  lengthChipActive: { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
  lengthChipText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  lengthChipTextActive: { color: colors.accent },
  equipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  equipTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  equipTagText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  equipTagRemove: { fontSize: 15, color: colors.textMuted, fontWeight: '700' },
  emptyText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  addRow: { flexDirection: 'row', gap: 8 },
  addInput: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14 },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  saveChangesBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: spacing.md },
  saveChangesBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
  savedConfirmText: { color: colors.success, fontWeight: '600', fontSize: 13, textAlign: 'center', marginTop: spacing.md },
  voiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 8 },
  voiceLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  keyStatus: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
});
