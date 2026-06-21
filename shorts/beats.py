"""Detect onsets/beats in voice or music to drive transient-synced cuts."""
import librosa
import numpy as np


def beat_times(audio_path: str, fallback_interval: float = 2.0, min_gap: float = 1.6) -> list[float]:
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    # Use voice energy onsets as proxy for "natural cut points"
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
    onsets = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, hop_length=512, units="time",
        backtrack=False, delta=0.4, wait=10,
    )
    onsets = list(onsets)
    # Enforce min_gap between cuts so we don't strobe
    filtered = []
    last = -1e9
    for t in onsets:
        if t - last >= min_gap:
            filtered.append(float(t))
            last = t
    if not filtered:
        # Fallback: evenly spaced
        total = librosa.get_duration(y=y, sr=sr)
        t = fallback_interval
        while t < total:
            filtered.append(t)
            t += fallback_interval
    return filtered
