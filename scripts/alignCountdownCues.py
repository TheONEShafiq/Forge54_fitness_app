#!/usr/bin/env python3
"""
Builds the 3-2-1 countdown clips with identical speech onset.

The ElevenLabs MP3s for "3", "2" and "1" start speaking at different offsets
(~135ms, ~108ms, ~13ms), so even with perfectly timed play() calls the "1"
lands ~100ms early and the countdown sounds like it speeds up. This decodes
each clip, trims the leading silence, pads every clip to the same fixed
onset and writes uncompressed WAVs (WAV has no encoder delay, unlike MP3).

Re-run after regenerating TTS assets:  python3 scripts/alignCountdownCues.py
Requires macOS (uses afconvert to decode the MP3s).
"""
import os
import struct
import subprocess
import tempfile
import wave

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT_DIR = os.path.join(ROOT, 'assets', 'tts', 'cues')
ONSET_MS = 20       # every clip starts speaking exactly this long after play()
THRESHOLD = 0.08    # fraction of peak amplitude that counts as speech


def hash_text(key: str) -> str:
    # Mirrors hashText() in scripts/generateTtsAssets.ts (32-bit Java-style hash).
    h = 0
    for ch in key:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    if h >= 0x80000000:
        h -= 0x100000000
    return str(abs(h))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for text in ['3', '2', '1']:
        src = os.path.join(ROOT, 'assets', 'tts', f'{hash_text(text)}.mp3')
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = os.path.join(tmp, 'clip.wav')
            subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16', src, wav_path], check=True)
            with wave.open(wav_path) as w:
                rate, channels = w.getframerate(), w.getnchannels()
                raw = w.readframes(w.getnframes())
        samples = list(struct.unpack(f'<{len(raw) // 2}h', raw))[::channels]
        peak = max(abs(s) for s in samples)
        onset = next(i for i, s in enumerate(samples) if abs(s) > peak * THRESHOLD)
        # Keep a few ms before the threshold crossing so the consonant attack survives.
        start = max(0, onset - int(rate * 0.005))
        pad = [0] * int(rate * ONSET_MS / 1000)
        out = pad + samples[start:]
        dest = os.path.join(OUT_DIR, f'{text}.wav')
        with wave.open(dest, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(struct.pack(f'<{len(out)}h', *out))
        print(f'"{text}": onset {onset / rate * 1000:.0f}ms -> {ONSET_MS}ms  ({dest})')


if __name__ == '__main__':
    main()
