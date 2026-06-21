"""Fetch vertical B-roll clips from Pexels."""
import os
import random
import requests

API = "https://api.pexels.com/videos/search"

def fetch_clips(queries: list[str], out_dir: str, count: int = 6) -> list[str]:
    key = os.environ["PEXELS_API_KEY"]
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    headers = {"Authorization": key}
    seen = set()

    for q in queries:
        if len(paths) >= count:
            break
        r = requests.get(
            API,
            params={"query": q, "orientation": "portrait", "per_page": 15, "size": "medium"},
            headers=headers,
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
            files.sort(key=lambda x: abs(x["height"] - 1280))
            url = files[0]["link"]
            path = os.path.join(out_dir, f"clip_{v['id']}.mp4")
            with requests.get(url, stream=True, timeout=120) as dl:
                dl.raise_for_status()
                with open(path, "wb") as f:
                    for chunk in dl.iter_content(1 << 16):
                        f.write(chunk)
            seen.add(v["id"])
            paths.append(path)
            if len(paths) >= count:
                break
    return paths
