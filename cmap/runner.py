import time
import subprocess

PYTHON_PATH = "/root/cmap-project/cmap/venv/bin/python"
SCRIPT_PATH = "/root/cmap-project/cmap/update_map.py"

while True:
    try:
        subprocess.run([PYTHON_PATH, SCRIPT_PATH], check=True)
    except Exception as e:
        print(f"Update failed: {e}")
    
    time.sleep(10)