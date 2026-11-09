import * as Speech from 'expo-speech';
import { Directory, File, Paths } from 'expo-file-system';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TTS_MANIFEST } from './ttsManifest.generated';
import { speechFragments } from './speechFragments';

// ── Voice settings (persisted) ────────────────────────────────────────────────
const CLOUD_ENABLED_KEY = 'forge_voice_cloud_enabled';
const SECURE_API_KEY = 'forge_tts_api_key';

// ElevenLabs "Adam" — a warm, natural-sounding male voice. Swappable later
// without touching call sites.
const VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
const MODEL_ID = 'eleven_turbo_v2_5';

export async function getCloudVoiceEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(CLOUD_ENABLED_KEY)) === 'true';
}

export async function setCloudVoiceEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CLOUD_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function getTtsApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_API_KEY);
  } catch {
    return null;
  }
}

export async function setTtsApiKey(key: string): Promise<void> {
  if (key) await SecureStore.setItemAsync(SECURE_API_KEY, key);
  else await SecureStore.deleteItemAsync(SECURE_API_KEY);
}

// ── Audio session ──────────────────────────────────────────────────────────────
let audioModeReady = false;
async function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  try {
    // Mix with, never duck, the user's music. The cue players stay loaded for
    // the whole workout, so 'duckOthers' kept Spotify/Apple Music softened
    // the entire time, not just while a cue was speaking.
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  } catch (e) {
    console.warn('setAudioModeAsync failed:', e);
  }
}

// One-off sounds (the bell) that may overlap speech.
function playSource(source: number | string) {
  ensureAudioMode();
  try {
    const player = createAudioPlayer(typeof source === 'string' ? { uri: source } : source);
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        sub.remove();
        player.remove();
      }
    });
    player.play();
  } catch (e) {
    console.warn('audio playback error:', e);
  }
}

// ── Announcement channel ──────────────────────────────────────────────────────
// Only one announcement speaks at a time. Each new one (recorded clip, chain
// of recorded pieces, cloud clip or the phone's voice) first silences the
// last; before this, a long device-voice announcement could still be talking
// when the next recorded cue started, so two voices spoke over each other.
type Player = ReturnType<typeof createAudioPlayer>;
let channelToken = 0;
let channelPlayers: Player[] = [];
let deviceSpeaking = false;
let cloudPending = false;

// True while an announcement is still being spoken (or fetched). The player
// holds a lead-in's 3-2-1 until this goes false, so the countdown follows
// the announcement instead of talking over it.
export function isAnnouncing(): boolean {
  return channelPlayers.length > 0 || deviceSpeaking || cloudPending;
}

function silenceChannel(): number {
  channelToken++;
  deviceSpeaking = false;
  cloudPending = false;
  for (const p of channelPlayers) {
    try { p.pause(); p.remove(); } catch {}
  }
  channelPlayers = [];
  try { Speech.stop(); } catch {}
  return channelToken;
}

// Plays sources back to back on the channel. All players are created up front
// so each piece is loaded by the time the one before it ends.
function playSequence(sources: (number | string)[], token: number) {
  ensureAudioMode();
  if (token !== channelToken) return;
  let players: Player[];
  try {
    players = sources.map(src => createAudioPlayer(typeof src === 'string' ? { uri: src } : src));
  } catch (e) {
    console.warn('audio playback error:', e);
    return;
  }
  channelPlayers = players;
  const playAt = (i: number) => {
    if (token !== channelToken) return;
    if (i >= players.length) {
      for (const p of players) { try { p.remove(); } catch {} }
      channelPlayers = [];
      return;
    }
    const sub = players[i].addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) { sub.remove(); playAt(i + 1); }
    });
    try { players[i].play(); } catch (e) { console.warn('audio playback error:', e); }
  };
  playAt(0);
}

// Short timing cues (the 3-2-1 countdown) keep one long-lived player each.
// Creating a player per call adds start-up latency that varies from clip to
// clip, which made the spoken countdown sound uneven.
//
// The cue clips are onset-aligned WAVs (scripts/alignCountdownCues.py): the raw
// TTS MP3s start speaking at different offsets, which made "1" land ~100ms
// early even with perfectly timed play() calls.
const CUE_ASSETS: Record<string, number> = {
  '3': require('../../assets/tts/cues/3.wav'),
  '2': require('../../assets/tts/cues/2.wav'),
  '1': require('../../assets/tts/cues/1.wav'),
};
const cuePlayers = new Map<string, ReturnType<typeof createAudioPlayer>>();

export function preloadCues(texts: string[]) {
  ensureAudioMode();
  for (const text of texts) {
    const asset = CUE_ASSETS[text] ?? TTS_MANIFEST[text];
    if (asset === undefined || cuePlayers.has(text)) continue;
    try {
      const player = createAudioPlayer(asset);
      // Rewind as soon as a cue finishes so the next play() starts instantly
      // (seekTo is async; seeking right before play() can race).
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) player.seekTo(0);
      });
      cuePlayers.set(text, player);
    } catch (e) {
      console.warn('cue preload failed:', e);
    }
  }
}

// A countdown cue is on the clock, so it wins: whatever announcement is still
// running stops rather than talking over "3, 2, 1".
export function speakCue(text: string) {
  const player = cuePlayers.get(text);
  if (!player) { speak(text); return; }
  silenceChannel();
  try {
    player.play();
  } catch (e) {
    console.warn('cue playback error:', e);
    speak(text);
  }
}

export function releaseCues() {
  for (const player of cuePlayers.values()) {
    try { player.remove(); } catch {}
  }
  cuePlayers.clear();
}

// Phrases pre-rendered at build time (scripts/generateTtsAssets.ts) ship inside
// the app itself — no network, no key, no per-user cost, works for anyone who
// downloads the app. Only text outside that fixed set (e.g. a newly added
// exercise before the next asset regeneration) falls through to cloud/device.
// Whole phrase recorded, or every piece of it recorded (generated workouts).
// A phrase with any piece missing is not spliced: half recorded voice, half
// phone voice in one sentence is worse than one consistent fallback voice.
function bundledSources(text: string): number[] | null {
  const whole = TTS_MANIFEST[text];
  if (whole !== undefined) return [whole];
  const parts = speechFragments(text);
  if (parts.length < 2) return null;
  const assets = parts.map(p => TTS_MANIFEST[p]);
  return assets.every(a => a !== undefined) ? assets : null;
}

// ── On-disk cache for spoken phrases ───────────────────────────────────────────
// Countdown numbers, "Rest.", etc. repeat constantly during a workout — cache
// them once instead of re-hitting the network every time.
//
// Constructed lazily (not at module load) — calling into expo-file-system at
// JS-bundle-evaluation time, before the app has finished launching, is a
// known way to crash a standalone build even when it's silently fine in
// Expo Go, since the two don't initialize native modules on the same timeline.
let _cacheDir: Directory | null = null;
function getCacheDir(): Directory {
  if (!_cacheDir) _cacheDir = new Directory(Paths.cache, 'forge-tts');
  return _cacheDir;
}

function ensureCacheDir(): Directory {
  const dir = getCacheDir();
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function cacheFileNameFor(key: string, ext: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return `${Math.abs(hash)}.${ext}`;
}

async function synthesizeToFile(text: string, apiKey: string): Promise<File> {
  const cacheDir = ensureCacheDir();
  const file = new File(cacheDir, cacheFileNameFor(text.toLowerCase().trim(), 'mp3'));
  if (file.exists) return file;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS request failed (${res.status})`);
  const buffer = await res.arrayBuffer();
  file.create();
  file.write(new Uint8Array(buffer));
  return file;
}

// Once a cloud call fails mid-workout (bad key, no network), stop retrying for
// the rest of the session so every subsequent cue doesn't stall on a timeout.
let cloudFailedThisSession = false;

async function speakCloud(text: string, token: number): Promise<boolean> {
  if (cloudFailedThisSession) return false;
  const [enabled, apiKey] = await Promise.all([getCloudVoiceEnabled(), getTtsApiKey()]);
  if (!enabled || !apiKey) return false;
  // Superseded while reading settings: a newer announcement owns the channel.
  if (token !== channelToken) return true;
  cloudPending = true;
  try {
    const file = await synthesizeToFile(text, apiKey);
    if (token === channelToken) cloudPending = false;
    // Superseded while downloading: drop it rather than speak late.
    playSequence([file.uri], token);
    return true;
  } catch (e) {
    if (token === channelToken) cloudPending = false;
    console.warn('Cloud voice failed, falling back to device voice for this session:', e);
    cloudFailedThisSession = true;
    return false;
  }
}

function speakDevice(text: string, token: number) {
  if (token !== channelToken) return;
  const done = () => { if (token === channelToken) deviceSpeaking = false; };
  try {
    deviceSpeaking = true;
    Speech.speak(text, {
      language: 'en-US', pitch: 0.95, rate: 0.9,
      onDone: done, onStopped: done, onError: done,
    });
  } catch (e) {
    console.warn('speak error:', e);
  }
}

export async function speak(text: string): Promise<void> {
  const token = silenceChannel();
  const bundled = bundledSources(text);
  if (bundled) { playSequence(bundled, token); return; }
  const usedCloud = await speakCloud(text, token);
  if (!usedCloud) speakDevice(text, token);
}

export async function stopSpeech() {
  silenceChannel();
}

export function buildExerciseAnnouncement(ex: any): string {
  let text = ex.name.replace(' — Left', ', left side').replace(' — Right', ', right side');
  if (ex.type === 'sets' && ex.sets && ex.reps) {
    const w = ex.weight > 0 ? `, ${ex.weight} pounds` : ', bodyweight';
    text += `. ${ex.sets} sets of ${ex.reps} reps${w}.`;
  } else if (ex.type === 'time' && ex.duration) {
    const m = Math.floor(ex.duration / 60);
    const s = ex.duration % 60;
    if (m > 0 && s > 0) text += `. ${m} minute${m > 1 ? 's' : ''} ${s} seconds.`;
    else if (m > 0) text += `. ${m} minute${m > 1 ? 's' : ''}.`;
    else text += `. ${s} seconds.`;
  }
  return text;
}

export function buildIntervalAnnouncement(round: number, total: number, isWork: boolean, label: string): string {
  return isWork ? `Interval ${round} of ${total}. ${label}.` : `Rest. ${label}.`;
}

export function buildAnnouncement(ex: any): string {
  let text = ex.name || '';
  if (ex.type === 'sets' && ex.sets && ex.reps) {
    const weightStr = ex.weight > 0 ? `, ${ex.weight} pounds` : ', bodyweight';
    text += `. ${ex.sets} sets of ${ex.reps} reps${weightStr}.`;
  } else if (ex.type === 'time' && ex.duration) {
    const mins = Math.floor(ex.duration / 60);
    const secs = ex.duration % 60;
    if (mins > 0 && secs > 0) text += `. ${mins} minute${mins !== 1 ? 's' : ''} ${secs} seconds.`;
    else if (mins > 0) text += `. ${mins} minute${mins !== 1 ? 's' : ''}.`;
    else text += `. ${secs} seconds.`;
  }
  if (ex.tabata) text += ' Tabata style.';
  return text;
}

// ── Bell ────────────────────────────────────────────────────────────────────
// Was a silent no-op pending an expo-audio migration (see AGENTS.md) — now
// that expo-audio is wired up for cloud voice playback, generate a short
// synthesized "ding" once and reuse it, no bundled sound asset needed.
function buildBeepWavBytes(freq = 880, durationMs = 220, sampleRate = 22050): Uint8Array {
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 0.01) * Math.exp(-t * 6);
    const sample = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * freq * t) * envelope * 0.6));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  return new Uint8Array(buffer);
}

let bellFile: File | null = null;
function ensureBellFile(): File {
  if (bellFile) return bellFile;
  const cacheDir = ensureCacheDir();
  const file = new File(cacheDir, 'bell.wav');
  if (!file.exists) {
    file.create();
    file.write(buildBeepWavBytes());
  }
  bellFile = file;
  return file;
}

export async function playBell(): Promise<void> {
  try {
    const file = ensureBellFile();
    playSource(file.uri);
  } catch (e) {
    console.warn('playBell error:', e);
  }
}
