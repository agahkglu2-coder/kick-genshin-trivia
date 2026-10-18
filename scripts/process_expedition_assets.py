import os
from PIL import Image
from collections import deque

output_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'expeditions')
os.makedirs(output_dir, exist_ok=True)

brain_dir = r"C:\Users\pc\.gemini\antigravity\brain\f2e38c3d-3a0d-4222-bb15-4b495f3b2ee0"

assets = {
    'fishing_dock.png': os.path.join(brain_dir, 'fishing_dock_1792291859200.jpg'),
    'mining_cave.png': os.path.join(brain_dir, 'mining_cave_1792291872894.jpg'),
    'cat_fisherman.png': os.path.join(brain_dir, 'cat_fisherman_1792291886506.jpg'),
    'cat_miner.png': os.path.join(brain_dir, 'cat_miner_1792291901338.jpg')
}

def remove_outer_background(input_path, output_path, tolerance=240):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    pixels = img.load()
    
    # BFS flood-fill from all 4 borders
    visited = set()
    queue = deque()
    
    def is_bg(x, y):
        r, g, b, a = pixels[x, y]
        return r >= tolerance and g >= tolerance and b >= tolerance
    
    for x in range(width):
        if is_bg(x, 0):
            queue.append((x, 0))
            visited.add((x, 0))
        if is_bg(x, height - 1):
            queue.append((x, height - 1))
            visited.add((x, height - 1))
            
    for y in range(height):
        if is_bg(0, y) and (0, y) not in visited:
            queue.append((0, y))
            visited.add((0, y))
        if is_bg(width - 1, y) and (width - 1, y) not in visited:
            queue.append((width - 1, y))
            visited.add((width - 1, y))
            
    while queue:
        cx, cy = queue.popleft()
        pixels[cx, cy] = (255, 255, 255, 0)
        
        for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                if is_bg(nx, ny):
                    visited.add((nx, ny))
                    queue.append((nx, ny))
                    
    # Auto-crop non-transparent bounding box with small padding
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    img.save(output_path, "PNG")
    print(f"Saved: {output_path} ({img.size})")

for name, in_path in assets.items():
    if os.path.exists(in_path):
        out_path = os.path.join(output_dir, name)
        remove_outer_background(in_path, out_path)
    else:
        print(f"Not found: {in_path}")
