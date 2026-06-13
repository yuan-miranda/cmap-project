import subprocess
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "coordinates.db"

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
