"""Generate natural voiceover with ElevenLabs."""
import os
import requests

DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"  # Rachel - warm, clear

def synthesize(text: str, out_path: str, voice_id: str | None = None) -> str:
    voice_id = voice_id or os.environ.get("ELEVENLABS_VOICE_ID", DEFAULT_VOICE)
    api_key = os.environ["ELEVENLABS_API_KEY"]

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.75,
            "style": 0.35,
            "use_speaker_boost": True,
        },
    }
    r = requests.post(url, json=payload, headers=headers, timeout=120)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        f.write(r.content)
    return out_path
