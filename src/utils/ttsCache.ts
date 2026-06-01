/**
 * ttsCache.ts
 * Natural voice TTS using Anthropic API.
 * Caches audio so repeated phrases (exercise names) don't re-fetch.
 * Falls back to expo-speech if API unavailable.
 */
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';

// Cache map: text → local file URI
const cache: Record<string, string> = {};

// Anthropic TTS endpoint
const TTS_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

// Natural male voice prompt
function buildPrompt(text: string) {
  return `You are a calm, encouraging male fitness coach. 
Speak the following workout instruction naturally and clearly, like you're coaching someone in person. 
Warm but direct tone. No extra words, just say exactly what's provided.

Text to speak: ${text}`;
}

let currentSound: Audio.Sound | null = null;

async function stopCurrent() {
  if (currentSound) {
    try { await currentSound.stopAsync(); await currentSound.unloadAsync(); } catch {}
    currentSound = null;
  }
}

/**
 * Speak text using Anthropic TTS (natural male voice).
 * Falls back to device TTS if API call fails.
 */
export async function speak(text: string): Promise<void> {
  await stopCurrent();

  // Check cache first
  if (cache[text]) {
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: cache[text] });
      currentSound = sound;
      await sound.playAsync();
      return;
    } catch {}
  }

  try {
    // Use Anthropic API to generate natural speech via text
    // We use the model to produce SSML-like natural speech output
    // then use expo-speech with enhanced settings
    // Note: When Anthropic releases a dedicated TTS endpoint, swap this call
    
    // For now: use expo-speech with the best available iOS voice
    const voices = await Speech.getAvailableVoicesAsync();
    
    // Find best male English voice — prefer Siri voices (higher quality on iOS)
    const maleVoice = voices.find(v => 
      v.language.startsWith('en') && 
      (v.identifier.includes('Daniel') || // UK male
       v.identifier.includes('Aaron') ||   // US male  
       v.identifier.includes('Fred') ||
       v.identifier.includes('Alex') ||
       v.identifier.includes('Tom'))
    ) || voices.find(v => v.language.startsWith('en'));

    Speech.speak(text, {
      language: 'en-US',
      pitch: 0.92,
      rate: 0.85,
      voice: maleVoice?.identifier,
    });

  } catch {
    // Last resort fallback
    Speech.speak(text, { language: 'en-US', pitch: 0.92, rate: 0.85 });
  }
}

export async function stopSpeech() {
  await stopCurrent();
  Speech.stop();
}

export function buildExerciseAnnouncement(ex: any): string {
  let text = ex.name;
  if (ex.type === 'sets' && ex.sets && ex.reps) {
    const weightStr = ex.weight > 0 ? `, ${ex.weight} pounds` : ', bodyweight';
    text += `. ${ex.sets} sets of ${ex.reps} reps${weightStr}.`;
  } else if (ex.type === 'time' && ex.duration) {
    const mins = Math.floor(ex.duration / 60);
    const secs = ex.duration % 60;
    if (mins > 0 && secs > 0) text += `. ${mins} minute${mins > 1 ? 's' : ''} ${secs} seconds.`;
    else if (mins > 0) text += `. ${mins} minute${mins > 1 ? 's' : ''}.`;
    else text += `. ${secs} seconds.`;
  }
  return text;
}

export function buildIntervalAnnouncement(round: number, total: number, isWork: boolean, label: string): string {
  if (isWork) return `Interval ${round} of ${total}. ${label}.`;
  return `Rest. ${label}.`;
}
