import os
from PIL import Image

TILE_SIZE = 512
MIN_TILE = -32
MAX_TILE = 32

def initialize_map():
    os.makedirs("tiles/overworld", exist_ok=True)
    os.makedirs("tiles/nether", exist_ok=True)
    os.makedirs("tiles/the_end", exist_ok=True)
    
    print("Initializing 3,969 blank region tiles... Please wait.")
    
    # Create a single blank transparent image in memory to copy from
    blank_tile = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    
    count = 0
    for x in range(MIN_TILE, MAX_TILE + 1):
        for z in range(MIN_TILE, MAX_TILE + 1):
            tile_name = f"tiles/overworld/tile_{x}_{z}.png"
            blank_tile.save(tile_name, "PNG")
            count += 1
            
    print(f"Success! Generated {count} blank tiles in 'tiles/overworld/'.")

if __name__ == "__main__":
    initialize_map()