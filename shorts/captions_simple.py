"""Fallback caption timing when Whisper isn't available.

Estimates word-level timestamps by distributing script across audio duration,
weighted by syllable/character count so longer words hold longer.
"""
import re


def estimate_word_times(script: str, total_duration: float) -> list[dict]:
    words = re.findall(r"\S+", script)
    weights = [max(1, len(re.sub(r"[^A-Za-z]", "", w)) + (1 if w.endswith((",", ".", "!", "?", ":", ";")) else 0)) for w in words]
    total_w = sum(weights)
    out = []
    t = 0.0
    pause = 0.0
    for w, weight in zip(words, weights):
        dur = (weight / total_w) * total_duration
        # Hold a touch on commas/periods
        if w.endswith(("." , "!", "?")):
            extra = min(0.18, dur * 0.4)
        elif w.endswith((",", ":", ";")):
            extra = min(0.10, dur * 0.25)
        else:
            extra = 0.0
        start = t
        end = t + dur
        out.append({"word": w.strip(".,!?;:\"'"), "start": start, "end": end})
        t = end + extra
    # Renormalize so end == total_duration
    if out and t > 0:
        scale = total_duration / t
        for w in out:
            w["start"] *= scale
            w["end"] *= scale
    return out
