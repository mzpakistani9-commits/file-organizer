#!/usr/bin/env python3
"""Generate File Organizer brand icons: PNG, ICO (windows), ICNS (mac)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

SIZE = 1024

# 1024 canvas, rounded-rect background with gradient-ish layers
img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Background rounded rectangle (indigo -> purple)
d.rounded_rectangle([32, 32, 992, 992], radius=224, fill=(102, 126, 234, 255))
# Simulated gradient: overlay a translucent lighter arc
overlay = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
do = ImageDraw.Draw(overlay)
do.rounded_rectangle([32, 32, 992, 620], radius=224, fill=(255, 255, 255, 26))
img = Image.alpha_composite(img, overlay)
d = ImageDraw.Draw(img)

# White folder shape
fold = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
df = ImageDraw.Draw(fold)
# folder body
df.rounded_rectangle([220, 340, 812, 720], radius=40, fill=(255, 255, 255, 255))
# folder tab (top)
df.polygon([
    (250, 340), (500, 340), (540, 300), (420, 260), (250, 300)
], fill=(255, 255, 255, 255))

img = Image.alpha_composite(img, fold)
d = ImageDraw.Draw(img)

# Indigo accent stripe on the folder (like a highlighted file)
d.rounded_rectangle([300, 440, 720, 500], radius=30, fill=(102, 126, 234, 255))
d.rounded_rectangle([300, 540, 640, 600], radius=30, fill=(118, 75, 162, 255))

# sparkle dot top-right
img = Image.alpha_composite(img, sparkles := Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0)))
ds = ImageDraw.Draw(sparkles)
ds.ellipse([700, 180, 780, 260], fill=(255, 255, 255, 255))
ds.polygon([(820, 620), (860, 660), (820, 700), (780, 660)], fill=(255, 255, 255, 230))

# ---- Export PNG sizes ----
png_path = os.path.join(OUT, 'icon.png')
img.save(png_path, 'PNG')
img.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-512.png'), 'PNG')
img.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'icon-256.png'), 'PNG')

# ---- Windows .ico (multi-size, 256 max per ICO standard) ----
ico_sizes = [256, 128, 64, 48, 32, 16]
img.resize((256, 256), Image.LANCZOS).save(
    os.path.join(OUT, 'icon.ico'),
    format='ICO', sizes=[(s, s) for s in ico_sizes],
)

# ---- Mac .icns (iconutil-style manual: build iconset, then icns via sips-free path) ----
# Pillow can write pure CNG-based .icns with the 'icns' format.
icns_sizes = [(16, 'icp4'), (32, 'icp5'), (128, 'ic07'), (256, 'ic08'), (512, 'ic09'), (1024, 'ic10'),
              (32, 'ic11'), (64, 'ic12'), (256, 'ic13'), (512, 'ic14')]
icns_path = os.path.join(OUT, 'icon.icns')
img.resize((1024, 1024), Image.LANCZOS).save(
    icns_path,
    format='ICNS',
    append_images=[],
    sizes=icns_sizes,
)

print('Generated assets in', OUT)
print(' - icon.png (1024), icon-512.png, icon-256.png')
print(' - icon.ico (16..256)')
print(' - icon.icns')