# Combine tiles into one review image: python3 sheet.py out/sheet.png cols tile1.png tile2.png ...
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
scale = min(1, 1560 / (w * cols))
cw, ch = int(w * scale), int(h * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw + (cols - 1) * 6, rows * ch + (rows - 1) * 6), (40, 40, 40))
for i, im in enumerate(ims):
    x, y = (i % cols) * (cw + 6), (i // cols) * (ch + 6)
    sheet.paste(im.resize((cw, ch)), (x, y))
    ImageDraw.Draw(sheet).text((x + 4, y + 4), files[i].split('/')[-1], fill=(255, 0, 0))
sheet.save(out); print(out, sheet.size)
