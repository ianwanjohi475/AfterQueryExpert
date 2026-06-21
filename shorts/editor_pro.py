"""Pro 9:16 video composer:
- Beat/onset-synced clip cuts
- Ken Burns zoom (alternating in/out) per clip
- Color grading (warm cinematic LUT-style EQ)
- Film grain overlay + vignette
- SFX whoosh at each transition
- Animated multi-layer captions burned in
- Sidechain-ducked music under voiceover
"""
import os
import random
import subprocess
import json
from pathlib import Path

W, H = 1080, 1920


def probe_duration(path: str) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", path,
    ])
    return float(json.loads(out)["format"]["duration"])


def _normalize_clip(src: str, out: str, seconds: float, zoom_in: bool):
    """Crop to 9:16, scale, apply Ken Burns zoompan, color grade, film grain, vignette."""
    if zoom_in:
        zoom_expr = "min(zoom+0.0015,1.45)"
        start_z = "1.00"
    else:
        zoom_expr = "max(zoom-0.0015,1.00)"
        start_z = "1.45"

    n_frames = max(1, int(seconds * 30))
    # Pre-scale, then zoompan with proper output size
    vf = (
        # 9:16 frame
        f"crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',"
        f"scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H},setsar=1,fps=30,"
        # Ken Burns
        f"scale=4000:-1,"
        f"zoompan=z='if(eq(on,0),{start_z},{zoom_expr})':"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d=1:s={W}x{H}:fps=30,"
        # Cinematic color grade: contrast + saturation + warm cast + slight shadow lift
        f"eq=contrast=1.12:saturation=1.22:gamma=0.96,"
        f"curves=preset=increase_contrast,"
        f"colorbalance=rs=0.05:gs=-0.02:bs=-0.05:rm=0.04:gm=0:bm=-0.04:rh=0.05:gh=0:bh=-0.06,"
        # Vignette
        f"vignette=PI/4.5,"
        # Subtle film grain via noise
        f"noise=alls=8:allf=t+u"
    )
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", src,
        "-t", f"{seconds:.2f}",
        "-vf", vf,
        "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "veryfast", "-crf", "20",
        out,
    ], check=True)


def _whoosh(path: str, duration: float = 0.45):
    """Synthesize a transition whoosh: noise burst with bandpass + envelope."""
    src = f"anoisesrc=color=brown:duration={duration}:sample_rate=44100:amplitude=0.7"
    af = (
        f"highpass=f=300,lowpass=f=4000,"
        f"afade=t=in:st=0:d=0.05,"
        f"afade=t=out:st={duration-0.20:.2f}:d=0.20,"
        f"volume=0.7"
    )
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", src,
        "-af", af,
        path,
    ], check=True)


def build_background_pro(
    clips: list[str],
    audio_path: str,
    work_dir: str,
    cut_points: list[float] | None = None,
) -> tuple[str, list[float]]:
    """Compose a 9:16 background with transient-synced cuts.

    cut_points: optional list of absolute timestamps where cuts happen.
                if None, even-time slicing is used.
    Returns (bg_video_path, sfx_timestamps)
    """
    os.makedirs(work_dir, exist_ok=True)
    total = probe_duration(audio_path)

    if cut_points is None or len(cut_points) < 2:
        n = max(len(clips), 5)
        per = total / n
        cut_points = [i * per for i in range(n)]
    cut_points = [0.0] + [t for t in cut_points if 0.4 < t < total - 0.4]
    cut_points = sorted(set([round(c, 2) for c in cut_points]))
    cut_points.append(total)

    # Build clip durations
    norm_paths = []
    for i in range(len(cut_points) - 1):
        seg_dur = max(1.0, cut_points[i + 1] - cut_points[i])
        src = clips[i % len(clips)]
        out = os.path.join(work_dir, f"norm_{i:03d}.mp4")
        _normalize_clip(src, out, seg_dur, zoom_in=(i % 2 == 0))
        norm_paths.append(out)

    # Concat
    listfile = os.path.join(work_dir, "concat.txt")
    with open(listfile, "w") as f:
        f.write("\n".join(f"file '{os.path.abspath(p)}'" for p in norm_paths))
    bg = os.path.join(work_dir, "bg.mp4")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listfile,
        "-t", f"{total:.2f}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
        bg,
    ], check=True)

    return bg, cut_points[1:-1]


def build_sfx_track(sfx_times: list[float], total_duration: float, work_dir: str) -> str:
    """Build a single audio track containing whooshes at each cut timestamp."""
    os.makedirs(work_dir, exist_ok=True)
    whoosh_path = os.path.join(work_dir, "whoosh.wav")
    _whoosh(whoosh_path, duration=0.45)

    if not sfx_times:
        # Silent track
        out = os.path.join(work_dir, "sfx.m4a")
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={total_duration}",
            "-c:a", "aac", "-b:a", "96k", out,
        ], check=True)
        return out

    # Build with multiple amix inputs delayed
    inputs = []
    filters = []
    for i, t in enumerate(sfx_times):
        inputs += ["-i", whoosh_path]
        delay_ms = int(max(0, t - 0.10) * 1000)
        filters.append(f"[{i + 1}:a]adelay={delay_ms}|{delay_ms},volume=0.55[w{i}]")
    n = len(sfx_times)
    mix_inputs = "".join(f"[w{i}]" for i in range(n))
    filter_complex = (
        f"anullsrc=r=44100:cl=stereo:d={total_duration}[base];"
        + ";".join(filters) + ";"
        + f"[base]{mix_inputs}amix=inputs={n + 1}:duration=first:dropout_transition=0[out]"
    )
    out = os.path.join(work_dir, "sfx.m4a")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={total_duration}",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-c:a", "aac", "-b:a", "128k",
        out,
    ], check=True)
    return out


def mix_audio(voice: str, music: str, sfx: str, out_path: str) -> str:
    """Final master: voice (clear) + ducked music + sfx, loudness-normalized."""
    fc = (
        "[0:a]highpass=f=85,lowpass=f=9000,"
        "acompressor=threshold=-18dB:ratio=3:attack=5:release=80,"
        "equalizer=f=200:t=q:w=1:g=2,equalizer=f=3500:t=q:w=1:g=3,"
        "asplit=2[vmix][vside];"
        "[1:a]volume=0.32[mpre];"
        "[mpre][vside]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=250[md];"
        "[2:a]volume=0.9[sfxa];"
        "[vmix][md][sfxa]amix=inputs=3:duration=first:dropout_transition=0:weights=1.0 0.55 0.85[mx];"
        "[mx]loudnorm=I=-14:TP=-1.5:LRA=11[out]"
    )
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", voice, "-i", music, "-i", sfx,
        "-filter_complex", fc,
        "-map", "[out]",
        "-c:a", "aac", "-b:a", "192k",
        out_path,
    ], check=True)
    return out_path


def render_final_pro(bg_path: str, mixed_audio: str, ass_path: str, out_path: str) -> str:
    ass_escaped = ass_path.replace(":", "\\:").replace("'", "\\'")
    vf = f"subtitles='{ass_escaped}':fontsdir=/usr/share/fonts"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", bg_path, "-i", mixed_audio,
        "-vf", vf,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "19",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest", "-movflags", "+faststart",
        out_path,
    ], check=True)
    return out_path
