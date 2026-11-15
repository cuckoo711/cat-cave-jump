import hashlib
import json
import os
import sqlite3
from contextlib import closing
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from uuid import UUID

ROOT = Path(os.getenv("GAME_STATIC_DIR", Path(__file__).parent))
DATA = Path(os.getenv("GAME_DATA_DIR", ".game-data"))
API_BASE = os.getenv("GAME_API_BASE_URL", "/api")
ORIGINS = {origin.strip() for origin in os.getenv("GAME_ALLOWED_ORIGINS", "").split(",") if origin.strip()}
ASSETS = {path.relative_to(ROOT).as_posix() for path in (ROOT / "assets").iterdir() if path.is_file()}
PUBLIC = ASSETS | {"index.html", "player.png", "audio-bank.js", "game-audio.js", "tunnel-mission.js", "online.js"}


def release_id():
    digest = hashlib.sha256()
    for name in sorted(PUBLIC):
        digest.update(name.encode())
        digest.update((ROOT / name).read_bytes())
    return digest.hexdigest()[:16]


VERSION = release_id()


def connect():
    return sqlite3.connect(DATA / "scores.sqlite3", timeout=5)


def init_db():
    DATA.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as db, db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("""CREATE TABLE IF NOT EXISTS scores (
            player TEXT PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL,
            distance_cm INTEGER NOT NULL, updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")


def leaderboard():
    with closing(connect()) as db:
        rows = db.execute("""SELECT name, score, distance_cm FROM scores
            ORDER BY score DESC, distance_cm DESC, updated ASC, player ASC LIMIT 20""")
        return [{"name": name, "score": score, "distanceCm": distance} for name, score, distance in rows]


def save_score(payload):
    if payload.get("usedAuto", False) is not False:
        raise ValueError("automatic_run")
    player = str(UUID(payload["player"]))
    name = payload["name"].strip()
    score, distance, jumps = (payload[key] for key in ("score", "distanceCm", "jumps"))
    if not name or len(name) > 16 or not name.isprintable():
        raise ValueError("name")
    if any(type(value) is not int for value in (score, distance, jumps)):
        raise ValueError("score")
    if not (1 <= jumps <= 30000 and 1 <= score <= 5 * jumps and 1 <= distance <= 5000 * jumps):
        raise ValueError("score")
    with closing(connect()) as db, db:
        db.execute("""INSERT INTO scores (player, name, score, distance_cm) VALUES (?, ?, ?, ?)
            ON CONFLICT(player) DO UPDATE SET name=excluded.name, score=excluded.score,
            distance_cm=excluded.distance_cm, updated=CURRENT_TIMESTAMP
            WHERE excluded.score > scores.score OR
                (excluded.score = scores.score AND excluded.distance_cm > scores.distance_cm)
        """, (player, name, score, distance))


class Handler(SimpleHTTPRequestHandler):
    timeout = 10

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-cache")
        if getattr(self, "static_etag", None):
            self.send_header("ETag", self.static_etag)
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_data(self, status, data, content_type="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def send_json(self, status, value):
        self.send_data(status, json.dumps(value, ensure_ascii=False).encode())

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path in ("/api/health", "/api/version"):
            self.send_json(200, {"version": VERSION})
        elif path == "/api/scores":
            self.send_json(200, {"scores": leaderboard()})
        elif path == "/runtime-config.js":
            value = json.dumps({"apiBase": API_BASE, "version": VERSION})
            self.send_data(200, f"window.CAT_CAVE_CONFIG = {value};".encode(), "application/javascript")
        elif path == "/" or path.removeprefix("/") in PUBLIC:
            self.static_etag = f'"{VERSION}"'
            if self.static_etag in (tag.strip() for tag in self.headers.get("If-None-Match", "").split(",")):
                self.send_response(304)
                self.end_headers()
                return
            del self.headers["If-Modified-Since"]
            if self.command == "HEAD":
                super().do_HEAD()
            else:
                super().do_GET()
        else:
            self.send_json(404, {"error": "not_found"})

    do_HEAD = do_GET

    def do_OPTIONS(self):
        if urlsplit(self.path).path != "/api/scores" or self.headers.get("Origin") not in ORIGINS:
            self.send_json(403, {"error": "origin"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/scores":
            self.send_json(404, {"error": "not_found"})
            return
        origin = self.headers.get("Origin")
        if origin and origin not in ORIGINS and urlsplit(origin).netloc != self.headers.get("Host"):
            self.send_json(403, {"error": "origin"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 4096:
                self.send_json(413, {"error": "size"})
                return
            if self.headers.get_content_type() != "application/json":
                self.send_json(415, {"error": "type"})
                return
            payload = json.loads(self.rfile.read(length))
            save_score(payload)
        except (ValueError, KeyError, TypeError, AttributeError, UnicodeError):
            self.send_json(400, {"error": "invalid_score"})
            return
        self.send_json(200, {"saved": True})


if __name__ == "__main__":
    init_db()
    with ThreadingHTTPServer((os.getenv("GAME_BIND", "127.0.0.1"), int(os.getenv("GAME_HTTP_PORT", "8080"))), Handler) as server:
        server.serve_forever()
