"""Pro voice: ElevenLabs v3 with emotion/style tags, optional voice cloning."""
import os
import requests

DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"  # Rachel


def synthesize_pro(
    text: str,
    out_path: str,
    voice_id: str | None = None,
    model: str = "eleven_multilingual_v2",
    stability: float = 0.4,
    similarity: float = 0.8,
    style: float = 0.45,
    speaker_boost: bool = True,
) -> str:
    voice_id = voice_id or os.environ.get("ELEVENLABS_VOICE_ID", DEFAULT_VOICE)
    api_key = os.environ["ELEVENLABS_API_KEY"]
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    payload = {
        "text": text,
        "model_id": model,
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity,
            "style": style,
            "use_speaker_boost": speaker_boost,
        },
    }
    r = requests.post(url, json=payload, headers=headers, timeout=180)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        f.write(r.content)
    return out_path


def list_voices() -> list[dict]:
    api_key = os.environ["ELEVENLABS_API_KEY"]
    r = requests.get(
        "https://api.elevenlabs.io/v1/voices",
        headers={"xi-api-key": api_key},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("voices", [])
