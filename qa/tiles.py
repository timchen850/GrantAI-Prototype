# Split a full-page screenshot into viewport-height tiles for review: python3 tiles.py out/x.png [tile_h]
import sys
from PIL import Image
src = sys.argv[1]; im = Image.open(src); w, h = im.size
th = int(sys.argv[2]) if len(sys.argv) > 2 else (900 if w > 600 else 1400)
n = 0
for y in range(0, h, th):
    t = im.crop((0, y, w, min(h, y + th)))
    if w > 1000: t = t.resize((1000, int(t.size[1] * 1000 / w)))
    t.save(src.replace('.png', f'.t{n}.png')); n += 1
print(src, (w, h), 'tiles:', n)
