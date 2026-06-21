# Faceless Shorts Pipeline

End-to-end automated YouTube Shorts / TikTok / Reels generator.

`topic` -> Claude script -> ElevenLabs voice -> Pexels B-roll -> Whisper word-timed captions -> 9:16 MP4 with zoom punches and animated captions.

## Setup

```bash
# 1. System deps
sudo apt install -y ffmpeg
# 2. Python deps
pip install -r requirements.txt
# 3. Keys
cp .env.example .env
# Edit .env with your real keys (NEVER commit this file).
```

Required keys:
- `ANTHROPIC_API_KEY` — console.anthropic.com (script writing). Needs a few $ of credit.
- `ELEVENLABS_API_KEY` — elevenlabs.io (voice). Free tier = 10k chars/mo.
- `PEXELS_API_KEY` — pexels.com/api (B-roll). Free forever.
- `ELEVENLABS_VOICE_ID` (optional) — defaults to "Rachel".

## Run

```bash
python make_video.py "3 money habits that quietly make you rich" "finance tips"
# Outputs: output/short.mp4
```

## What it does

1. **Script** — Claude writes a 130–170 word viral script (hook + body + CTA).
2. **Voice** — ElevenLabs Turbo v2.5, natural-sounding TTS.
3. **Keywords** — Claude extracts B-roll search terms from the script.
4. **B-roll** — Pexels vertical clips fetched and downloaded.
5. **Captions** — Whisper transcribes the voice with **word-level timestamps**.
6. **Edit** — ffmpeg composes:
   - 1080x1920 vertical
   - Slow zoom-in/zoom-out on each clip ("Ken Burns")
   - CapCut-style animated captions (white base + yellow word highlight)
   - Audio + video sync via shortest stream
   - H.264 + AAC, faststart for instant playback

## Files

- `make_video.py` — orchestrator
- `shorts/script_writer.py` — Claude script writer
- `shorts/voice.py` — ElevenLabs TTS
- `shorts/keywords.py` — Claude keyword extractor
- `shorts/visuals.py` — Pexels fetcher
- `shorts/captions.py` — Whisper + ASS subtitle builder
- `shorts/captions_simple.py` — Fallback time-based captions (no Whisper needed)
- `shorts/editor.py` — ffmpeg compose pipeline

## Realistic expectations

- Cost per video: ~$0.10–0.40 (ElevenLabs + Claude).
- Quality: good "faceless channel" level, not Mr. Beast.
- Monetization: YouTube needs 1k subs + 4k hrs OR 10M Shorts views in 90 days.
- The edge: post **volume + niche consistency**, not perfection.

## Caveats

- This sandbox blocks `api.elevenlabs.io` and `api.pexels.com`, so the pipeline must be **run locally or on a VPS** where outbound HTTPS works.
- Auto-posting to YouTube/TikTok is intentionally NOT included — add `youtube-data-api` + `tiktok-uploader` once the videos look good.
