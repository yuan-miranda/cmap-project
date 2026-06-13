import subprocess
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import json
import os
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TILES_DIR = os.path.join(BASE_DIR, "tiles")
DB_PATH = os.path.join(BASE_DIR, "coordinates.db")
PLAYERS_JSON_PATH = os.path.join(BASE_DIR, "tiles", "players.json")

conn = sqlite3.connect(DB_PATH)
conn.execute("""
    CREATE TABLE IF NOT EXISTS coordinates (
        player_name TEXT,
        x           INTEGER,
        z           INTEGER,
        dimension   TEXT,
        timestamp   INTEGER
    )
""")
conn.execute("PRAGMA journal_mode=WAL;")
conn.close()


@app.get("/api/sha")
def get_sha():
    try:
        result = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd="./tiles", text=True
        )
        return {"sha": result.strip()}
    except Exception:
        return {"sha": "main"}


def load_committed_players():
    try:
        result = subprocess.check_output(
            ["git", "show", "HEAD:players.json"], cwd=TILES_DIR, text=True
        )
        return json.loads(result)
    except Exception:
        try:
            with open(PLAYERS_JSON_PATH, "r", encoding="utf-8") as file:
                return json.load(file)
        except Exception:
            return []


@app.get("/api/players")
def get_players():
    return load_committed_players()

@app.get("/tiles/players.json")
def get_players_json():
    return load_committed_players()


@app.post("/api/coordinates")
async def receive_coordinates(request: Request):
    data = await request.json()
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cursor = conn.cursor()
    for entry in data:
        cursor.execute(
            "INSERT INTO coordinates (player_name, x, z, dimension, timestamp) VALUES (?, ?, ?, ?, ?)",
            (
                entry.get("player_name"),
                entry.get("x"),
                entry.get("z"),
                entry.get("dimension"),
                entry.get("timestamp"),
            ),
        )
    conn.commit()
    conn.close()
    return {"status": "success"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
