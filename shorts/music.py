"""Generate or load a background music bed and duck it under voice.

For local runs you can drop royalty-free tracks into music/*.mp3 and they will
be picked at random. As a fallback for offline/sandbox use we synthesize a
chord-progression bed with ffmpeg sine waves (lo-fi, not pro but functional).
"""
import os
import random
import subprocess
from pathlib import Path


def pick_or_synthesize(duration: float, work_dir: str, music_dir: str = "music") -> str:
    os.makedirs(work_dir, exist_ok=True)
    mdir = Path(music_dir)
    if mdir.exists():
        tracks = list(mdir.glob("*.mp3")) + list(mdir.glob("*.wav"))
        if tracks:
            src = str(random.choice(tracks))
            out = os.path.join(work_dir, "music.mp3")
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-stream_loop", "-1", "-i", src,
                "-t", f"{duration:.2f}",
                "-af", "afade=in:st=0:d=0.6,afade=out:st=" + f"{max(0.1, duration-0.8):.2f}" + ":d=0.8",
                "-c:a", "libmp3lame", "-b:a", "192k",
                out,
            ], check=True)
            return out
    return _synthesize_bed(duration, work_dir)


def _synthesize_bed(duration: float, work_dir: str) -> str:
    """Build a simple lo-fi chord pad with ffmpeg sine waves."""
    out = os.path.join(work_dir, "music.mp3")
    # Am - F - C - G progression (i - VI - III - VII), 4 bars at 90 BPM = ~10.67s/loop
    # Use multiple sines layered for chord pad.
    chords = [
        (220.0, 261.63, 329.63),   # A minor: A C E
        (174.61, 220.0, 261.63),   # F major: F A C
        (130.81, 164.81, 196.0),   # C major: C E G
        (196.0, 246.94, 293.66),   # G major: G B D
    ]
    bar = 2.5
    parts = []
    for i, (f1, f2, f3) in enumerate(chords):
        seg = os.path.join(work_dir, f"chord_{i}.wav")
        # Three sines + a softer high octave
        f_complex = (
            f"sine=frequency={f1}:duration={bar}[s1];"
            f"sine=frequency={f2}:duration={bar}[s2];"
            f"sine=frequency={f3}:duration={bar}[s3];"
            f"sine=frequency={f3*2}:duration={bar}[s4];"
            f"[s1][s2][s3][s4]amix=inputs=4:duration=longest,"
            f"volume=0.18,aformat=channel_layouts=stereo,"
            f"highpass=f=80,lowpass=f=2400,"
            f"areverse,afade=in:st=0:d=0.05,areverse"
        )
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", f_complex,
            seg,
        ], check=True)
        parts.append(seg)

    listfile = os.path.join(work_dir, "music_concat.txt")
    total = 0.0
    lines = []
    idx = 0
    while total < duration + 0.5:
        c = parts[idx % len(parts)]
        lines.append(f"file '{os.path.abspath(c)}'")
        total += bar
        idx += 1
    with open(listfile, "w") as f:
        f.write("\n".join(lines))

    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listfile,
        "-t", f"{duration:.2f}",
        "-af", f"afade=in:st=0:d=0.6,afade=out:st={max(0.1, duration-0.8):.2f}:d=0.8",
        "-c:a", "libmp3lame", "-b:a", "192k",
        out,
    ], check=True)
    return out


def duck_under_voice(voice_path: str, music_path: str, out_path: str) -> str:
    """Sidechain-compress music under voice so dialogue stays clear."""
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", voice_path,
        "-i", music_path,
        "-filter_complex",
        # Voice: normalize + warmth EQ + light compression + light reverb tail
        "[0:a]highpass=f=85,lowpass=f=9000,"
        "acompressor=threshold=-18dB:ratio=3:attack=5:release=80,"
        "equalizer=f=200:t=q:w=1:g=2,"
        "equalizer=f=3500:t=q:w=1:g=3,"
        "asplit=2[v1][v2];"
        "[1:a]volume=0.30[mp];"
        "[mp][v2]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=250[md];"
        "[v1][md]amix=inputs=2:duration=first:dropout_transition=0:weights=1.0 0.55[mx];"
        "[mx]loudnorm=I=-14:TP=-1.5:LRA=11[out]",
        "-map", "[out]",
        "-c:a", "aac", "-b:a", "192k",
        out_path,
    ], check=True)
    return out_path
