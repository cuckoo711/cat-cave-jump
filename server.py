import hashlib
import json
import os
import sqlite3
import unicodedata
from contextlib import closing
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from uuid import UUID

ROOT = Path(os.getenv("GAME_STATIC_DIR", Path(__file__).parent))
DATA = Path(os.getenv("GAME_DATA_DIR", ".game-data"))
API_BASE = os.getenv("GAME_API_BASE_URL", "/api")
STATIC_CDN = os.getenv("GAME_STATIC_CDN_URL", "").strip()
ORIGINS = {origin.strip() for origin in os.getenv("GAME_ALLOWED_ORIGINS", "").split(",") if origin.strip()}
ASSETS = {path.relative_to(ROOT).as_posix() for path in (ROOT / "assets").iterdir() if path.is_file()}
PUBLIC = ASSETS | {"index.html", "player.png", "audio-bank.js", "game-assets.js", "game-audio.js", "tunnel-mission.js", "online.js"}


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
        db.execute("""CREATE TABLE IF NOT EXISTS players (
            player TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE
        )""")
        db.execute("CREATE INDEX IF NOT EXISTS scores_rank ON scores(score DESC)")
        rows = db.execute("""SELECT s.player, s.name FROM scores s
            LEFT JOIN players p ON p.player = s.player WHERE p.player IS NULL
            ORDER BY s.updated, s.player""").fetchall()
        for player, name in rows:
            try:
                profile(db, player, None, name)
            except (NameTaken, ValueError):
                profile(db, player, None)


class NameTaken(ValueError):
    pass


def name_key(name):
    return unicodedata.normalize("NFKC", name).casefold().strip()


def profile(db, player, suffix, name=None):
    if suffix is not None and (type(suffix) is not int or not 0 <= suffix < 1000000):
        raise ValueError("fingerprint")
    previous = db.execute("SELECT name FROM players WHERE player=?", (player,)).fetchone()
    if name is None and previous:
        return previous[0]
    if name is None:
        seed = suffix if suffix is not None else int(hashlib.sha256(player.encode()).hexdigest(), 16) % 1000000
        for offset in range(1000000):
            name = f"执行者{(seed + offset) % 1000000:06d}"
            if not db.execute("SELECT 1 FROM players WHERE name_key=?", (name_key(name),)).fetchone():
                break
        else:
            raise NameTaken("default_names_exhausted")
    name = name.strip()
    if not name_key(name) or len(name) > 16 or not name.isprintable():
        raise ValueError("name")
    try:
        db.execute("""INSERT INTO players (player, name, name_key) VALUES (?, ?, ?)
            ON CONFLICT(player) DO UPDATE SET name=excluded.name, name_key=excluded.name_key
        """, (player, name, name_key(name)))
    except sqlite3.IntegrityError as error:
        raise NameTaken("name_taken") from error
    db.execute("UPDATE scores SET name=? WHERE player=?", (name, player))
    return name


def leaderboard():
    with closing(connect()) as db:
        rows = db.execute("""WITH ranked AS (
            SELECT *, RANK() OVER (ORDER BY score DESC) AS placement FROM scores
        ) SELECT name, score, distance_cm, placement FROM ranked WHERE placement <= 100
            ORDER BY score DESC, distance_cm DESC, updated ASC, player ASC""")
        return [{"name": name, "score": score, "distanceCm": distance, "rank": rank}
                for name, score, distance, rank in rows]


def standing(score):
    with closing(connect()) as db:
        higher, previous = db.execute(
            "SELECT COUNT(*), MIN(score) FROM scores WHERE score > ?", (score,)
        ).fetchone()
        return {"rank": higher + 1, "gap": None if previous is None else previous - score}


def save_score(payload):
    if payload.get("usedAuto", False) is not False:
        raise ValueError("automatic_run")
    player = str(UUID(payload["player"]))
    score, distance, jumps = (payload[key] for key in ("score", "distanceCm", "jumps"))
    if any(type(value) is not int for value in (score, distance, jumps)):
        raise ValueError("score")
    if not (1 <= jumps <= 30000 and 1 <= score <= 5 * jumps and 1 <= distance <= 5000 * jumps):
        raise ValueError("score")
    with closing(connect()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        name = profile(db, player, payload.get("suffix"), payload.get("name"))
        db.execute("""INSERT INTO scores (player, name, score, distance_cm) VALUES (?, ?, ?, ?)
            ON CONFLICT(player) DO UPDATE SET name=excluded.name, score=excluded.score,
            distance_cm=excluded.distance_cm, updated=CURRENT_TIMESTAMP
            WHERE excluded.score > scores.score OR
                (excluded.score = scores.score AND excluded.distance_cm > scores.distance_cm)
        """, (player, name, score, distance))
        return name


class Handler(SimpleHTTPRequestHandler):
    timeout = 10

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        origin = self.headers.get("Origin")
        if getattr(self, "cdn_asset", False):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "public, max-age=604800, immutable")
        elif origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        if not getattr(self, "cdn_asset", False):
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

    def send_static(self, path):
        self.path = "/" + path.lstrip("/")
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

    def do_GET(self):
        url = urlsplit(self.path)
        path = unquote(url.path)
        if path in ("/api/health", "/api/version"):
            self.send_json(200, {"version": VERSION})
        elif path == "/api/scores":
            self.send_json(200, {"scores": leaderboard()})
        elif path == "/api/rank":
            try:
                score = int(parse_qs(url.query)["score"][0])
                if not 0 <= score <= 150000:
                    raise ValueError("score")
            except (ValueError, KeyError, IndexError):
                self.send_json(400, {"error": "invalid_score"})
                return
            self.send_json(200, standing(score))
        elif path == "/runtime-config.js":
            value = json.dumps({"apiBase": API_BASE, "version": VERSION, "staticCdn": STATIC_CDN})
            self.send_data(200, f"window.CAT_CAVE_CONFIG = {value};".encode(), "application/javascript")
        elif path.startswith("/assets/cdn/"):
            name = path.removeprefix("/assets/cdn/")
            asset = name if name in {"player.png", "audio-bank.js"} else "assets/" + name
            if (asset not in ASSETS and asset not in {"player.png", "audio-bank.js"}) or parse_qs(url.query).get("v") != [VERSION]:
                self.send_json(404, {"error": "asset_not_found"})
                return
            self.cdn_asset = True
            self.send_static(asset)
        elif path == "/" or path.removeprefix("/") in PUBLIC:
            self.send_static(path)
        else:
            self.send_json(404, {"error": "not_found"})

    do_HEAD = do_GET

    def do_OPTIONS(self):
        if urlsplit(self.path).path not in ("/api/scores", "/api/player") or self.headers.get("Origin") not in ORIGINS:
            self.send_json(403, {"error": "origin"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ("/api/scores", "/api/player"):
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
            if path == "/api/scores":
                name = save_score(payload)
            else:
                player = str(UUID(payload["player"]))
                with closing(connect()) as db, db:
                    db.execute("BEGIN IMMEDIATE")
                    name = profile(db, player, payload.get("suffix"), payload.get("name"))
        except NameTaken:
            self.send_json(409, {"error": "name_taken"})
            return
        except (ValueError, KeyError, TypeError, AttributeError, UnicodeError):
            self.send_json(400, {"error": "invalid_score"})
            return
        self.send_json(200, {"saved": True, "name": name})


if __name__ == "__main__":
    init_db()
    with ThreadingHTTPServer((os.getenv("GAME_BIND", "127.0.0.1"), int(os.getenv("GAME_HTTP_PORT", "8080"))), Handler) as server:
        server.serve_forever()
