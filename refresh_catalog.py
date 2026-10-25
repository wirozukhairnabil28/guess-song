"""Resolve curated song titles to Deezer track IDs with playable previews.

Run this manually when catalog-seeds.json changes. Audio URLs are deliberately
not saved because Deezer's preview URLs expire.
"""

import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
RATE_LOCK = threading.Lock()
NEXT_REQUEST = 0.0


def normalize(value):
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def resolve(seed):
    global NEXT_REQUEST
    query = f"{seed['artist']} {seed['title']}"
    url = "https://api.deezer.com/search?" + urlencode({"q": query, "limit": 25})
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "TebakLagu/2.0"})
    with RATE_LOCK:
        delay = max(0.0, NEXT_REQUEST - time.monotonic())
        if delay:
            time.sleep(delay)
        NEXT_REQUEST = time.monotonic() + 0.22
    with urlopen(request, timeout=12) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(f"Deezer: {payload['error'].get('message', 'unknown error')}")
    tracks = payload.get("data", [])

    artist = normalize(seed["artist"])
    title = normalize(seed["title"])
    candidates = []
    for track in tracks:
        if not track.get("preview") or normalize(track.get("artist", {}).get("name", "")) != artist:
            continue
        short = normalize(track.get("title_short") or track.get("title") or "")
        full = normalize(track.get("title") or "")
        if short != title and full != title and not full.startswith(title):
            continue
        score = 2 if short == title or full == title else 1
        if track.get("title_version"):
            score -= 1
        candidates.append((score, track.get("rank", 0), track))
    if not candidates:
        return None
    track = max(candidates, key=lambda item: (item[0], item[1]))[2]
    return {
        "id": str(track["id"]),
        "title": seed["title"],
        "artist": seed["artist"],
        "year": seed["year"],
        "genre": seed["genre"],
        "region": seed["region"],
        "rank": int(track.get("rank") or 0),
    }


def main():
    seeds = json.loads((ROOT / "catalog-seeds.json").read_text(encoding="utf-8"))
    resolved = [None] * len(seeds)
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(resolve, seed): index for index, seed in enumerate(seeds)}
        for future in as_completed(futures):
            index = futures[future]
            try:
                resolved[index] = future.result()
            except Exception as error:
                print(f"Failed: {seeds[index]['artist']} — {seeds[index]['title']}: {type(error).__name__}")
    missing = [seed for seed, track in zip(seeds, resolved) if track is None]
    found = [track for track in resolved if track is not None]
    (ROOT / "catalog.json").write_text(json.dumps(found, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Resolved {len(found)}/{len(seeds)} songs with preview URLs.")
    for seed in missing:
        print(f"No match: {seed['artist']} — {seed['title']}")


if __name__ == "__main__":
    main()
