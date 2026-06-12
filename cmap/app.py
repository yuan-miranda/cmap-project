from fastapi import FastAPI, Request
import sqlite3
import uvicorn

app = FastAPI()
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


@app.post("/api/coordinates")
async def receive_coordinates(request: Request):
    data = await request.json()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for entry in data:
        cursor.execute(
            "INSERT INTO coordinates (player_name, x, z, dimension, timestamp) VALUES (?, ?, ?, ?, ?)",
            (
                entry["player_name"],
                entry["x"],
                entry["z"],
                entry["dimension"],
                entry.get("timestamp"),
            ),
        )
    conn.commit()
    conn.close()
    return {"status": "success"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
