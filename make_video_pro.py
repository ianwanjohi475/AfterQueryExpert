"""Pro end-to-end short generator with:
- ElevenLabs multilingual v2 voice
- Pexels (or optional AI video) B-roll
- Whisper word-level captions with pro animated styles
- Beat/onset-synced cuts
- Cinematic color grade, vignette, film grain
- SFX whooshes at transitions
- Sidechain-ducked background music
"""
import os
import sys
import shutil
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from shorts.script_writer import write_script
from shorts.voice_pro import synthesize_pro
from shorts.keywords import extract_keywords
from shorts.visuals_pro import fetch_clips_pexels, fetch_ai_video_falai
from shorts.captions import transcribe_words
from shorts.captions_pro import write_ass_pro
from shorts.beats import beat_times
from shorts.music import pick_or_synthesize
from shorts.editor_pro import (
    probe_duration, build_background_pro, build_sfx_track,
    mix_audio, render_final_pro,
)


def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else "3 money habits that quietly make you rich"
    niche = sys.argv[2] if len(sys.argv) > 2 else "finance tips"
    use_ai_video = "--ai-video" in sys.argv

    work = Path("work")
    out = Path("output")
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    out.mkdir(exist_ok=True)

    print(f"[1/8] Script: {topic}")
    script = write_script(topic, niche)
    (work / "script.txt").write_text(script)
    print(f"      {len(script.split())} words")

    print("[2/8] Voice (ElevenLabs v2)")
    audio = synthesize_pro(script, str(work / "voice.mp3"))
    dur = probe_duration(audio)
    print(f"      {dur:.1f}s")

    print("[3/8] B-roll keywords")
    kws = extract_keywords(script, n=10)
    print(f"      {kws}")

    print("[4/8] Fetching B-roll")
    n_clips = max(6, int(dur / 3))
    if use_ai_video:
        clips = fetch_ai_video_falai(kws[:n_clips], str(work / "clips"))
    else:
        clips = []
    if len(clips) < n_clips:
        clips += fetch_clips_pexels(kws, str(work / "clips"), count=n_clips - len(clips))
    print(f"      {len(clips)} clips")
    if not clips:
        raise SystemExit("No clips fetched.")

    print("[5/8] Word-level captions (Whisper)")
    words = transcribe_words(audio)
    ass_path = write_ass_pro(words, str(work / "captions.ass"))

    print("[6/8] Beat/onset detection -> cut points")
    cuts = beat_times(audio, fallback_interval=dur / max(len(clips), 5), min_gap=1.4)
    print(f"      {len(cuts)} cuts")

    print("[7/8] Compose video (Ken Burns + grade + grain + vignette)")
    bg, sfx_times = build_background_pro(clips, audio, str(work / "bg"), cut_points=cuts)
    sfx = build_sfx_track(sfx_times, dur, str(work / "sfx"))
    music = pick_or_synthesize(dur, str(work / "music"))
    mixed = mix_audio(audio, music, sfx, str(work / "mixed.m4a"))

    print("[8/8] Render final")
    final = render_final_pro(bg, mixed, ass_path, str(out / "short_pro.mp4"))
    print(f"\nDONE: {final}")
    print(f"Duration: {probe_duration(final):.1f}s")


if __name__ == "__main__":
    main()
