"""Compose final 9:16 short with ffmpeg: B-roll + voiceover + animated captions + zoom punches."""
import os
import subprocess
import json
import random

W, H = 1080, 1920


def probe_duration(path: str) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", path,
    ])
    return float(json.loads(out)["format"]["duration"])


def build_background(clips: list[str], audio_duration: float, work_dir: str) -> str:
    """Concatenate B-roll clips trimmed/looped to cover audio_duration, all 1080x1920, with zoom-pan."""
    os.makedirs(work_dir, exist_ok=True)
    per_clip = max(2.5, audio_duration / max(len(clips), 1))
    norm_clips = []

    for i, c in enumerate(clips):
        d = probe_duration(c)
        take = min(d, per_clip + 0.3)
        zoom_in = random.random() < 0.5
        if zoom_in:
            zoom_expr = "zoom+0.0010"
        else:
            zoom_expr = "if(eq(on,0),1.20,zoom-0.0010)"
        zoompan = (
            f"scale=8000:-1,"
            f"zoompan=z='{zoom_expr}':d=1:s={W}x{H}:fps=30"
        )
        out = os.path.join(work_dir, f"norm_{i}.mp4")
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", c,
            "-t", f"{take:.2f}",
            "-vf",
            f"crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H},{zoompan},setsar=1,fps=30",
            "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            out,
        ]
        subprocess.run(cmd, check=True)
        norm_clips.append(out)

    # Loop concat list until total covers audio duration
    listfile = os.path.join(work_dir, "concat.txt")
    total = 0.0
    lines = []
    idx = 0
    while total < audio_duration + 0.5:
        c = norm_clips[idx % len(norm_clips)]
        lines.append(f"file '{os.path.abspath(c)}'")
        total += probe_duration(c)
        idx += 1
    with open(listfile, "w") as f:
        f.write("\n".join(lines))

    bg = os.path.join(work_dir, "bg.mp4")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listfile,
        "-t", f"{audio_duration:.2f}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        bg,
    ], check=True)
    return bg


def render_final(bg_path: str, audio_path: str, ass_path: str, out_path: str):
    # Burn captions + add background music ducking optional. Keep simple: voice + bg + subs.
    ass_escaped = ass_path.replace(":", "\\:").replace("'", "\\'")
    vf = (
        f"subtitles='{ass_escaped}':fontsdir=/usr/share/fonts,"
        f"eq=contrast=1.05:saturation=1.15"
    )
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", bg_path,
        "-i", audio_path,
        "-vf", vf,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        out_path,
    ], check=True)
    return out_path
