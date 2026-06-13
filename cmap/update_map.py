import sqlite3
import math
import os
import subprocess
import json
import time
from PIL import Image

DB_PATH = "coordinates.db"
TILE_SIZE = 512
PLAYERS_JSON_PATH = "tiles/players.json"

HEATMAP_SCALES = [
    (210, 210, 210, 255),  # Lightest Gray
    (180, 180, 180, 255),
    (150, 150, 150, 255),
    (120, 120, 120, 255),
    (90, 90, 90, 255),
    (60, 60, 60, 255),
    (30, 30, 30, 255),
    (0, 0, 0, 255),  # Pure Black
]


def get_darker_color(current_rgba):
    if current_rgba[3] == 0:
        return HEATMAP_SCALES[0]
    current_rgb = current_rgba[:3]
    for i in range(len(HEATMAP_SCALES) - 1):
        if current_rgb == HEATMAP_SCALES[i][:3]:
            return HEATMAP_SCALES[i + 1]
    return HEATMAP_SCALES[-1]


def update_heatmap_tiles():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    cursor = conn.cursor()

    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='coordinates'"
    )
    if not cursor.fetchone():
        conn.close()
        return

    cursor.execute(
        "SELECT rowid, player_name, x, z, dimension, timestamp FROM coordinates"
    )
    rows = cursor.fetchall()

    if not rows:
        conn.close()
        return

    player_data = {}
    if os.path.exists(PLAYERS_JSON_PATH):
        try:
            with open(PLAYERS_JSON_PATH, "r") as f:
                for p in json.load(f):
                    player_data[p["player_name"]] = p
        except json.JSONDecodeError:
            pass

    opened_tiles = {}
    mapped_row_ids = []
    git_updated_tiles = set()

    for row_id, player_name, x, z, dimension, timestamp in rows:
        os.makedirs(f"tiles/{dimension}", exist_ok=True)

        tile_x = math.floor(x / TILE_SIZE)
        tile_z = math.floor(z / TILE_SIZE)
        pixel_x = x % TILE_SIZE
        pixel_z = z % TILE_SIZE
        tile_key = (dimension, tile_x, tile_z)
        tile_path = f"tiles/{dimension}/tile_{tile_x}_{tile_z}.png"
        git_path = f"{dimension}/tile_{tile_x}_{tile_z}.png"

        if tile_key not in opened_tiles:
            if os.path.exists(tile_path):
                opened_tiles[tile_key] = Image.open(tile_path).convert("RGBA")
            else:
                opened_tiles[tile_key] = Image.new(
                    "RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0)
                )

        img = opened_tiles[tile_key]
        img.putpixel(
            (pixel_x, pixel_z), get_darker_color(img.getpixel((pixel_x, pixel_z)))
        )

        existing = player_data.get(player_name, {})
        player_data[player_name] = {
            "player_name": player_name,
            "x": x,
            "z": z,
            "dimension": dimension,
            "last_seen": max(timestamp or 0, existing.get("last_seen", 0)),
        }

        mapped_row_ids.append(row_id)
        git_updated_tiles.add(git_path)

    for (dimension, tile_x, tile_z), img in opened_tiles.items():
        img.save(f"tiles/{dimension}/tile_{tile_x}_{tile_z}.png", "PNG")

    with open(PLAYERS_JSON_PATH, "w") as f:
        json.dump(list(player_data.values()), f, indent=4)

    git_updated_tiles.add("players.json")

    cursor.execute(
        f"DELETE FROM coordinates WHERE rowid IN ({','.join(map(str, mapped_row_ids))})"
    )
    conn.commit()
    conn.close()

    try:
        tiles_dir = os.path.abspath("tiles")
        for path in git_updated_tiles:
            subprocess.run(["git", "add", path], cwd=tiles_dir, check=True)

        commit_res = subprocess.run(
            ["git", "commit", "--amend", "-m", "update map tiles"],
            cwd=tiles_dir,
            capture_output=True,
            text=True,
        )

        if commit_res.returncode != 0:
            subprocess.run(
                ["git", "commit", "-m", "update map tiles"],
                cwd=tiles_dir,
                check=True,
            )

        subprocess.run(
            ["git", "push", "-f", "origin", "main"], cwd=tiles_dir, check=True
        )

    except subprocess.CalledProcessError as e:
        print(f"Git routine failed: {e}")


if __name__ == "__main__":
    update_heatmap_tiles()
