"""End-to-end short generator: topic -> finished 9:16 MP4."""
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
from shorts.voice import synthesize
from shorts.keywords import extract_keywords
from shorts.visuals import fetch_clips
from shorts.captions import transcribe_words, write_ass
from shorts.editor import build_background, probe_duration, render_final


def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else "3 money habits that quietly make you rich"
    niche = sys.argv[2] if len(sys.argv) > 2 else "finance tips"

    work = Path("work")
    out = Path("output")
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    out.mkdir(exist_ok=True)

    print(f"[1/6] Writing script for: {topic}")
    script = write_script(topic, niche)
    (work / "script.txt").write_text(script)
    print(f"     Script ({len(script.split())} words):\n{script}\n")

    print("[2/6] Synthesizing voiceover (ElevenLabs)...")
    audio = synthesize(script, str(work / "voice.mp3"))
    dur = probe_duration(audio)
    print(f"     Voice duration: {dur:.1f}s")

    print("[3/6] Extracting B-roll keywords...")
    kws = extract_keywords(script, n=8)
    print(f"     Keywords: {kws}")

    print("[4/6] Fetching vertical B-roll from Pexels...")
    n_clips = max(5, int(dur / 4))
    clips = fetch_clips(kws, str(work / "clips"), count=n_clips)
    print(f"     Got {len(clips)} clips")
    if not clips:
        raise SystemExit("No clips fetched; aborting.")

    print("[5/6] Transcribing for word-level captions (Whisper)...")
    words = transcribe_words(audio)
    ass_path = write_ass(words, str(work / "captions.ass"))
    print(f"     {len(words)} words timed")

    print("[6/6] Composing final video...")
    bg = build_background(clips, dur, str(work / "bg"))
    final = render_final(bg, audio, ass_path, str(out / "short.mp4"))
    print(f"\nDONE: {final}")
    print(f"Duration: {probe_duration(final):.1f}s")


if __name__ == "__main__":
    main()
