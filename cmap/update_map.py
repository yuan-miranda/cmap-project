import sqlite3
import math
import os
import subprocess
import json
from PIL import Image

DB_PATH = "coordinates.db"
TILE_SIZE = 512
PLAYERS_JSON_PATH = "tiles/players.json"

HEATMAP_SCALES = [
    (210, 210, 210, 255),  # Lightest Gray
    (180, 180, 180, 255),
    (150, 150, 150, 255),
    (120, 120, 120, 255),
    (90,  90,  90,  255),
    (60,  60,  60,  255),
    (30,  30,  30,  255),
    (0,   0,   0,   255)   # Pure Black
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
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT rowid, player_name, x, z, dimension FROM coordinates")
    rows = cursor.fetchall()
    
    if not rows:
        conn.close()
        return

    player_data = {}
    if os.path.exists(PLAYERS_JSON_PATH):
        try:
            with open(PLAYERS_JSON_PATH, "r") as f:
                existing_players = json.load(f)
                for p in existing_players:
                    player_data[p["player_name"]] = p
        except json.JSONDecodeError:
            pass

    opened_tiles = {}
    mapped_row_ids = []
    
    local_updated_tiles = set()
    git_updated_tiles = set()

    for row_id, player_name, x, z, dimension in rows:
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
                opened_tiles[tile_key] = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
                
        img = opened_tiles[tile_key]
        current_pixel_color = img.getpixel((pixel_x, pixel_z))
        next_color = get_darker_color(current_pixel_color)
        img.putpixel((pixel_x, pixel_z), next_color)
        
        player_data[player_name] = {
            "player_name": player_name,
            "x": x,
            "z": z,
            "dimension": dimension
        }
        
        mapped_row_ids.append(row_id)
        local_updated_tiles.add(tile_path)
        git_updated_tiles.add(git_path)

    for tile_key, img in opened_tiles.items():
        dimension, tile_x, tile_z = tile_key
        img.save(f"tiles/{dimension}/tile_{tile_x}_{tile_z}.png", "PNG")

    with open(PLAYERS_JSON_PATH, "w") as f:
        json.dump(list(player_data.values()), f, indent=4)
        
    git_updated_tiles.add("players.json")

    cursor.execute(f"DELETE FROM coordinates WHERE rowid IN ({','.join(map(str, mapped_row_ids))})")
    conn.commit()
    conn.close()

    try:
        tiles_dir = os.path.abspath("tiles")
        
        for path in git_updated_tiles:
            subprocess.run(["git", "add", path], cwd=tiles_dir, check=True)
            
        subprocess.run(["git", "commit", "-m", f"Heatmap & Data Update: {len(git_updated_tiles)} files modified"], cwd=tiles_dir, check=True)
        subprocess.run(["git", "push", "origin", "main"], cwd=tiles_dir, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Git commit failed: {e}")

if __name__ == "__main__":
    update_heatmap_tiles()