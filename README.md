# Faceless Shorts Pipeline

End-to-end automated YouTube Shorts / TikTok / Reels generator.

Two pipelines:
- `make_video.py` — basic version (script + voice + B-roll + captions).
- `make_video_pro.py` — pro version (beat-synced cuts, cinematic grade, vignette, film grain, animated hook overlay, multi-style word captions, sidechain-ducked music, whoosh SFX).

## Setup

```bash
sudo apt install -y ffmpeg
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your real keys (NEVER commit this file).
```

Required keys:
- `ANTHROPIC_API_KEY` — console.anthropic.com (script writing). Needs a few $ of credit.
- `ELEVENLABS_API_KEY` — elevenlabs.io (voice). Free tier = 10k chars/mo.
- `PEXELS_API_KEY` — pexels.com/api (B-roll). Free forever.
- `ELEVENLABS_VOICE_ID` (optional) — defaults to "Rachel".
- `FAL_KEY` (optional) — fal.ai (AI video gen via Kling/Veo). For the pro AI route.

## Run

```bash
# Basic
python make_video.py "3 money habits that quietly make you rich" "finance tips"
# Pro
python make_video_pro.py "3 money habits that quietly make you rich" "finance tips"
# Pro with AI video B-roll instead of stock
python make_video_pro.py "topic" "niche" --ai-video
```

Output: `output/short.mp4` or `output/short_pro.mp4`.

## Pro pipeline stages

1. **Script** — Claude writes a 130–170 word viral script (hook + body + CTA).
2. **Voice** — ElevenLabs `eleven_multilingual_v2`, tuned settings for emotion + clarity.
3. **Keywords** — Claude extracts B-roll search terms.
4. **B-roll** — Pexels vertical clips (or fal.ai Kling AI video).
5. **Captions** — Whisper word-level timing -> animated ASS:
   - Hook overlay (huge, centered, scale bounce + fade)
   - Per-chunk base text with shadow + bob entrance
   - Per-word highlight: cyan pop with scale punch
6. **Beat/onset detection** — librosa finds natural cut points in the voice.
7. **Background composition**:
   - 1080x1920 vertical, 30fps
   - Each B-roll segment trimmed to a cut interval
   - Alternating Ken Burns zoom (in/out)
   - Cinematic color grade (warm shadows, lifted contrast, color balance)
   - Vignette + film grain noise overlay
8. **Audio mix**:
   - Voice: highpass/lowpass, compressor, EQ presence boost, loudnorm
   - Music: lo-fi chord bed (or your own files in `music/*.mp3`) ducked under voice via sidechain compression
   - SFX: whoosh on every transition
   - Final loudness normalization to -14 LUFS (YouTube/TikTok target)
9. **Render**: H.264 CRF 19, AAC 192kbps, faststart.

## Bring your own music

Drop royalty-free tracks into `music/` (mp3 or wav). The pipeline will pick one at random per video. If empty, falls back to a synthesized chord bed.

Recommended royalty-free sources:
- pixabay.com/music (free, attribution-optional)
- uppbeat.io (generous free tier)
- soundstripe.com (paid, premium)

## Files

```
make_video.py             # basic orchestrator
make_video_pro.py         # pro orchestrator
shorts/
  script_writer.py        # Claude script writer
  voice.py                # ElevenLabs Turbo (basic)
  voice_pro.py            # ElevenLabs Multilingual v2 + voice list
  keywords.py             # Claude keyword extractor
  visuals.py              # Pexels (basic)
  visuals_pro.py          # Pexels + fal.ai AI video
  captions.py             # Whisper + ASS subtitle builder (basic)
  captions_pro.py         # ASS with hook + bounce + word pop
  captions_simple.py      # Fallback (no Whisper)
  beats.py                # librosa onset detection
  music.py                # Synth bed + sidechain duck
  editor.py               # Basic ffmpeg compose
  editor_pro.py           # Pro compose + grade + grain + SFX
```

## Realistic expectations

- Cost per video: ~$0.15–0.50 (ElevenLabs + Claude). Add ~$1–3 if using AI video.
- Quality: strong "faceless channel" tier; YouTube monetizable with consistent posting.
- Monetization: YouTube needs 1k subs + 4k hrs OR 10M Shorts views in 90 days. TikTok Creator Rewards needs 10k followers.
- The edge: post **volume + niche consistency**, not perfection.

## Caveats

- Sandbox/container environments often block `api.elevenlabs.io` and `api.pexels.com`. Run on your laptop or a real VPS for full results.
- Auto-posting to YouTube/TikTok is intentionally NOT included — add `google-api-python-client` (YouTube Data API) + `tiktok-uploader` once the videos look good.
- ElevenLabs voice quality scales with model + settings: `eleven_multilingual_v2` > `eleven_turbo_v2_5` > `eleven_turbo_v2`.
