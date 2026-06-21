"""Pro visual fetcher: Pexels + AI video (Runway/Kling/fal.ai optional) + semantic matching.

Semantic matching: instead of one keyword per clip, each script sentence gets a
B-roll clip whose Pexels search query best matches that sentence (via Claude).
"""
import os
import random
import requests

PEXELS_VIDEO = "https://api.pexels.com/videos/search"
PEXELS_PHOTO = "https://api.pexels.com/v1/search"


def _download(url: str, dst: str) -> str:
    with requests.get(url, stream=True, timeout=120) as dl:
        dl.raise_for_status()
        with open(dst, "wb") as f:
            for chunk in dl.iter_content(1 << 16):
                f.write(chunk)
    return dst


def fetch_clips_pexels(queries: list[str], out_dir: str, count: int) -> list[str]:
    key = os.environ["PEXELS_API_KEY"]
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    seen = set()
    for q in queries:
        if len(paths) >= count:
            break
        r = requests.get(
            PEXELS_VIDEO,
            params={"query": q, "orientation": "portrait", "per_page": 20, "size": "medium"},
            headers={"Authorization": key},
            timeout=30,
        )
        r.raise_for_status()
        videos = r.json().get("videos", [])
        random.shuffle(videos)
        for v in videos:
            if v["id"] in seen:
                continue
            files = [f for f in v["video_files"] if f.get("width") and f["height"] >= f["width"]]
            if not files:
                continue
            files.sort(key=lambda x: abs(x["height"] - 1920))
            path = os.path.join(out_dir, f"clip_{v['id']}.mp4")
            try:
                _download(files[0]["link"], path)
            except Exception:
                continue
            seen.add(v["id"])
            paths.append(path)
            if len(paths) >= count:
                break
    return paths


def fetch_ai_video_falai(prompts: list[str], out_dir: str) -> list[str]:
    """Generate AI video clips via fal.ai (Kling / Luma / Veo).
    Requires FAL_KEY env var. Costs ~$0.20-1.00 per clip.
    """
    import time
    fal_key = os.environ.get("FAL_KEY")
    if not fal_key:
        return []
    try:
        import fal_client  # pip install fal-client
    except ImportError:
        return []

    os.environ["FAL_KEY"] = fal_key
    os.makedirs(out_dir, exist_ok=True)
    out = []
    for i, prompt in enumerate(prompts):
        try:
            result = fal_client.subscribe(
                "fal-ai/kling-video/v1/standard/text-to-video",
                arguments={"prompt": prompt, "duration": "5", "aspect_ratio": "9:16"},
            )
            url = result.get("video", {}).get("url")
            if url:
                path = os.path.join(out_dir, f"ai_{i}.mp4")
                _download(url, path)
                out.append(path)
        except Exception as e:
            print(f"AI video failed for '{prompt}': {e}")
    return out
