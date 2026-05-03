from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import datetime as dt
import json
import sqlite3
import uuid


BASE_DIR = Path(__file__).resolve().parent
DB_DIR = BASE_DIR / "data"
DB_PATH = DB_DIR / "casa_mia.sqlite3"
SECTIONS = {"todo", "shopping", "notes"}


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def get_db():
    DB_DIR.mkdir(exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                section TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def row_to_item(row):
    return {
        "id": row["id"],
        "section": row["section"],
        "title": row["title"],
        "body": row["body"],
        "done": bool(row["done"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


class CasaMiaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/items":
            self.list_items()
            return

        if parsed.path.startswith("/api/"):
            self.send_json({"error": "Endpoint non trovato"}, status=404)
            return

        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/items":
            self.create_item()
            return

        self.send_json({"error": "Endpoint non trovato"}, status=404)

    def do_PATCH(self):
        parsed = urlparse(self.path)
        prefix = "/api/items/"

        if parsed.path.startswith(prefix):
            self.update_item(parsed.path[len(prefix) :])
            return

        self.send_json({"error": "Endpoint non trovato"}, status=404)

    def do_DELETE(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/items":
            self.clear_done(parsed.query)
            return

        prefix = "/api/items/"
        if parsed.path.startswith(prefix):
            self.delete_item(parsed.path[len(prefix) :])
            return

        self.send_json({"error": "Endpoint non trovato"}, status=404)

    def list_items(self):
        with get_db() as db:
            rows = db.execute(
                """
                SELECT id, section, title, body, done, created_at, updated_at
                FROM items
                ORDER BY datetime(created_at) DESC
                """
            ).fetchall()
        self.send_json([row_to_item(row) for row in rows])

    def create_item(self):
        payload = self.read_json()
        title = str(payload.get("title", "")).strip()
        section = str(payload.get("section", "todo")).strip()
        body = str(payload.get("body", "")).strip()

        if section not in SECTIONS:
            self.send_json({"error": "Sezione non valida"}, status=400)
            return

        if not title:
            self.send_json({"error": "Titolo obbligatorio"}, status=400)
            return

        item_id = str(uuid.uuid4())
        timestamp = now_iso()
        done = 1 if payload.get("done") else 0

        with get_db() as db:
            db.execute(
                """
                INSERT INTO items (id, section, title, body, done, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (item_id, section, title, body, done, timestamp, timestamp),
            )
            row = db.execute(
                """
                SELECT id, section, title, body, done, created_at, updated_at
                FROM items
                WHERE id = ?
                """,
                (item_id,),
            ).fetchone()

        self.send_json(row_to_item(row), status=201)

    def update_item(self, item_id):
        payload = self.read_json()
        allowed = {}

        if "title" in payload:
            title = str(payload["title"]).strip()
            if not title:
                self.send_json({"error": "Titolo obbligatorio"}, status=400)
                return
            allowed["title"] = title

        if "body" in payload:
            allowed["body"] = str(payload["body"]).strip()

        if "done" in payload:
            allowed["done"] = 1 if payload["done"] else 0

        if "section" in payload:
            section = str(payload["section"]).strip()
            if section not in SECTIONS:
                self.send_json({"error": "Sezione non valida"}, status=400)
                return
            allowed["section"] = section

        if not allowed:
            self.send_json({"error": "Nessuna modifica valida"}, status=400)
            return

        allowed["updated_at"] = now_iso()
        assignments = ", ".join(f"{key} = ?" for key in allowed)
        values = list(allowed.values()) + [item_id]

        with get_db() as db:
            cursor = db.execute(f"UPDATE items SET {assignments} WHERE id = ?", values)
            if cursor.rowcount == 0:
                self.send_json({"error": "Elemento non trovato"}, status=404)
                return

            row = db.execute(
                """
                SELECT id, section, title, body, done, created_at, updated_at
                FROM items
                WHERE id = ?
                """,
                (item_id,),
            ).fetchone()

        self.send_json(row_to_item(row))

    def delete_item(self, item_id):
        with get_db() as db:
            cursor = db.execute("DELETE FROM items WHERE id = ?", (item_id,))

        if cursor.rowcount == 0:
            self.send_json({"error": "Elemento non trovato"}, status=404)
            return

        self.send_json({"ok": True})

    def clear_done(self, query):
        params = parse_qs(query)
        section = params.get("section", [""])[0]

        if section not in SECTIONS:
            self.send_json({"error": "Sezione non valida"}, status=400)
            return

        with get_db() as db:
            db.execute("DELETE FROM items WHERE section = ? AND done = 1", (section,))

        self.send_json({"ok": True})

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}

        raw = self.rfile.read(length).decode("utf-8")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            self.send_json({"error": "JSON non valido"}, status=400)
            return {}

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def run():
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), CasaMiaHandler)
    print("Casa Mia avviata: http://127.0.0.1:8000")
    print(f"Database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    run()
