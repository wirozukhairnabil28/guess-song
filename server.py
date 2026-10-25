"""Serve a curated song quiz with on-demand 30-second track previews."""

import json
import os
import re
import threading
import time
import unicodedata
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))

# Muat catalog dengan error yang jelas kalau file tidak ada
def _song_key(song):
    return re.sub(r"[^a-z0-9]", "", (song["artist"] + song["title"]).casefold())


def _level_from_rank(rank):
    """Search-catalog songs have no level; derive it from the same rank bands catalog.json uses."""
    if rank >= 896000:
        return 0
    if rank >= 809000:
        return 1
    if rank >= 718000:
        return 2
    return 3


def _load_catalog():
    catalog_path = ROOT / "catalog.json"
    search_path = ROOT / "catalog-search.json"
    if not catalog_path.exists():
        raise FileNotFoundError(f"File tidak ditemukan: {catalog_path}")
    songs = json.loads(catalog_path.read_text(encoding="utf-8"))
    seen = {_song_key(song) for song in songs}
    if search_path.exists():
        for song in json.loads(search_path.read_text(encoding="utf-8")):
            key = _song_key(song)
            if key in seen:  # lagu yang sama sudah ada di catalog.json -> jangan dobel
                continue
            seen.add(key)
            song["id"] = "search:" + key
            if song.get("level") is None:
                song["level"] = _level_from_rank(song["rank"])
            songs.append(song)
    else:
        print("[PERINGATAN] catalog-search.json tidak ditemukan, hanya catalog.json yang dimuat.")
    return songs


SONGS = _load_catalog()
SONGS_BY_ID = {song["id"]: song for song in SONGS}
GENRES = {song["genre"] for song in SONGS}
YEARS = {"all", "before-2000", "2000-2009", "2010-2019", "2020-now"}
PREVIEW_CACHE = {}
PREVIEW_LOCK = threading.Lock()


def year_matches(value, selection):
    if selection == "all":
        return True
    if selection == "before-2000":
        return value < 2000
    if selection == "2020-now":
        return 2020 <= value <= date.today().year
    start, end = (int(part) for part in selection.split("-"))
    return start <= value <= end


def curated_songs(region, genre, year):
    matches = [
        {
            "id": song["id"],
            "title": song["title"],
            "artist": song["artist"],
            "region": song["region"],
            "genre": song["genre"],
            "year": song["year"],
            "downloads": song["rank"],
            "level": song.get("level"),
            "deepCut": bool(song.get("deepCut")),
            "trackUrl": f"https://www.deezer.com/track/{song['id']}" if song["id"].isdigit() else f"https://www.deezer.com/search/{quote(song['artist'] + ' ' + song['title'])}",
        }
        for song in SONGS
        if (region == "all" or song["region"] == region)
        and (genre == "all" or song["genre"] == genre)
        and year_matches(song["year"], year)
    ]
    return sorted(matches, key=lambda song: song["downloads"], reverse=True)


def normalized_name(value):
    plain = unicodedata.normalize("NFKD", value.casefold())
    return re.sub(r"[^a-z0-9]", "", "".join(char for char in plain if not unicodedata.combining(char)))


def matching_preview(track, song):
    title = normalized_name(song["title"])
    track_short = normalized_name(track.get("title_short") or "")
    track_full = normalized_name(track.get("title") or "")
    track_artist = normalized_name((track.get("artist") or {}).get("name", ""))
    version = (track.get("title_version") or "").casefold()
    if not (track_short == title or track_full == title or track_full.startswith(title)) or track_artist != normalized_name(song["artist"]):
        return None
    if any(word in version for word in ("remix", "live", "karaoke", "sped up", "slowed")):
        return None
    preview = track.get("preview") or ""
    parsed = urlsplit(preview)
    if parsed.scheme != "https" or parsed.hostname != "cdnt-preview.dzcdn.net":
        return None
    return {"streamUrl": preview, "trackUrl": f"https://www.deezer.com/track/{track['id']}"}


def deezer_json(url):
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "TebakLagu/2.0"})
    with urlopen(request, timeout=5) as response:
        return json.load(response)


def preview_url(track_id):
    with PREVIEW_LOCK:
        cached = PREVIEW_CACHE.get(track_id)
        if cached and cached[0] > time.time():
            return cached[1]

    song = SONGS_BY_ID[track_id]
    preview = None
    resolved_rank = None
    if track_id.isdigit():
        try:
            track = deezer_json(f"https://api.deezer.com/track/{track_id}")
            preview = matching_preview(track, song)
            if preview:
                resolved_rank = track.get("rank")
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError):
            pass

    if not preview:
        query = urlencode({"q": f"{song['artist']} {song['title']}", "limit": 25})
        results = deezer_json(f"https://api.deezer.com/search?{query}").get("data", [])
        for track in sorted(results, key=lambda item: item.get("rank") or 0, reverse=True):
            preview = matching_preview(track, song)
            if preview:
                resolved_rank = track.get("rank")
                break

    if not preview:
        raise LookupError("preview-unavailable")
    with PREVIEW_LOCK:
        if isinstance(resolved_rank, int) and resolved_rank > 0:
            song["rank"] = resolved_rank
        PREVIEW_CACHE[track_id] = (time.time() + 60, preview)
    return preview


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = urlsplit(self.path)
        if path.path == "/api/songs":
            return self.send_songs(path.query)
        if path.path == "/api/preview":
            return self.send_preview(path.query)
        ALLOWED_STATIC = {
            "/", "/index.html", "/app.js", "/style.css",
            "/favicon.svg", "/favicon.ico", "/favicon.png",
            "/search_dictionary.json"
        }
        if path.path not in ALLOWED_STATIC:
            return self.send_error(404)
        # Override end_headers untuk paksa no-cache pada JS/CSS
        _orig_end_headers = self.end_headers
        def _no_cache_end_headers():
            if path.path in ("/app.js", "/style.css"):
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
            _orig_end_headers()
        self.end_headers = _no_cache_end_headers
        return super().do_GET()

    def send_songs(self, query):
        values = parse_qs(query)
        region = values.get("region", ["all"])[0]
        genre = values.get("genre", ["all"])[0]
        year = values.get("year", ["all"])[0]
        if region not in {"all", "indo", "west"} or genre not in {"all", *GENRES} or year not in YEARS:
            return self.send_json(400, {"error": "invalid-filter"})
        return self.send_json(200, {"tracks": curated_songs(region, genre, year)})

    def send_preview(self, query):
        track_id = parse_qs(query).get("id", [""])[0]
        if track_id not in SONGS_BY_ID:
            return self.send_json(404, {"error": "unknown-song"})
        try:
            return self.send_json(200, preview_url(track_id))
        except LookupError:
            song = SONGS_BY_ID[track_id]
            self.log_message("Preview tidak tersedia: %s — %s", song["artist"], song["title"])
            return self.send_json(404, {"error": "preview-unavailable"})
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            self.log_error("Preview lookup gagal (%s): %s", type(error).__name__, str(error))
            return self.send_json(502, {"error": "preview-unavailable"})

    def send_json(self, status, body):
        content = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    print(f"Memuat katalog…")
    print(f"  catalog.json      : {len([s for s in SONGS if s['id'].isdigit()])} lagu")
    print(f"  catalog-search.json: {len([s for s in SONGS if not s['id'].isdigit()])} lagu")
    print(f"  Total             : {len(SONGS)} lagu")
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        print(f"\nPort {PORT} sudah dipakai. Tutup server game lama dahulu, lalu coba lagi.")
        raise SystemExit(1)
    print(f"\nGame siap di http://127.0.0.1:{PORT}/")
    print("Tekan Ctrl+C untuk menghentikan server.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")
