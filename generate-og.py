"""Generate og-image.png (1200x630) matching Geopuesto's mission-control aesthetic.
Uses PIL with locally-available Windows fonts. Run once after editing; commit the PNG.
"""
from PIL import Image, ImageDraw, ImageFont
import os
import math

W, H = 1200, 630
BG = (10, 18, 24)
BG2 = (14, 24, 32)
ORANGE = (242, 101, 34)
TEAL = (0, 191, 165)
TEXT = (245, 248, 250)
DIM = (108, 130, 148)
GREEN = (74, 222, 128)
BORDER = (44, 68, 89)

fonts_dir = os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts")

def font(name, size):
    path = os.path.join(fonts_dir, name)
    return ImageFont.truetype(path, size)

# Use Arial for sans, Consolas for mono — closest stand-ins for Plex on Windows
F_BIG = font("arialbd.ttf", 156)
F_TAG = font("consola.ttf", 22)
F_STATUS = font("consola.ttf", 14)
F_LABEL = font("consola.ttf", 16)
F_COORD = font("consolab.ttf", 22)
F_FOOTER = font("consola.ttf", 14)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img, "RGBA")

# Diagonal gradient background (simulated with many bands)
for y in range(H):
    t = y / H
    r = int(BG[0] + (BG2[0] - BG[0]) * t)
    g = int(BG[1] + (BG2[1] - BG[1]) * t)
    b = int(BG[2] + (BG2[2] - BG[2]) * t)
    d.line([(0, y), (W, y)], fill=(r, g, b))

# Radial orange glow on left
def radial_glow(cx, cy, radius, color, opacity):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    steps = 60
    for i in range(steps, 0, -1):
        r = int(radius * i / steps)
        alpha = int(opacity * 255 * (1 - i / steps) ** 1.6)
        od.ellipse([cx - r, cy - r, cx + r, cy + r],
                   fill=color + (alpha,))
    img.alpha_composite(overlay) if img.mode == "RGBA" else None
    # Workaround: blend with image
    base = img.convert("RGBA")
    base = Image.alpha_composite(base, overlay)
    return base.convert("RGB")

img = radial_glow(300, 315, 280, ORANGE, 0.45)
img = radial_glow(900, 315, 280, TEAL, 0.40)
d = ImageDraw.Draw(img, "RGBA")

# Subtle scanlines
for y in range(0, H, 3):
    d.line([(0, y), (W, y)], fill=(255, 255, 255, 6))

# Corner brackets
def bracket(x, y, dx, dy):
    L = 40
    d.line([(x, y), (x + L * dx, y)], fill=BORDER, width=2)
    d.line([(x, y), (x, y + L * dy)], fill=BORDER, width=2)

bracket(40, 40, 1, 1)
bracket(W - 40, 40, -1, 1)
bracket(40, H - 40, 1, -1)
bracket(W - 40, H - 40, -1, -1)

# Status LED + label
cx, cy = 80, 80
d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=GREEN)
d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=GREEN + (40,))
d.text((100, cy - 8), "SYS · OK · ANTIPODAL OBSERVATION SYSTEM", font=F_STATUS, fill=DIM)

# Wordmark: "Geopuesto" centered, with the "o" gradient-tinted
# Approximate by drawing three pieces in sequence, the "o" with a 50/50 split

word_pre = "Ge"
word_pivot = "o"
word_post = "puesto"

# Measure widths
def w_of(text, fnt):
    bbox = d.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0]

w_pre = w_of(word_pre, F_BIG)
w_pivot = w_of(word_pivot, F_BIG)
w_post = w_of(word_post, F_BIG)
total = w_pre + w_pivot + w_post

start_x = (W - total) // 2
y_baseline = H // 2 - 60

d.text((start_x, y_baseline), word_pre, font=F_BIG, fill=TEXT)

# Pivot "o" — draw twice with masked halves to fake gradient
pivot_x = start_x + w_pre
pivot_layer = Image.new("RGBA", (w_pivot + 20, 200), (0, 0, 0, 0))
pl = ImageDraw.Draw(pivot_layer)
pl.text((0, 0), word_pivot, font=F_BIG, fill=ORANGE + (255,))
# Right half — teal overlay with vertical stripe gradient
overlay = Image.new("RGBA", (w_pivot + 20, 200), (0, 0, 0, 0))
ol = ImageDraw.Draw(overlay)
ol.text((0, 0), word_pivot, font=F_BIG, fill=TEAL + (255,))
# Mask: gradient left to right (orange on left, teal on right)
mask = Image.new("L", (w_pivot + 20, 200), 0)
mk = ImageDraw.Draw(mask)
for i in range(w_pivot + 20):
    a = int(255 * (i / (w_pivot + 20)) ** 1.4)
    mk.line([(i, 0), (i, 200)], fill=a)
pivot_layer.paste(overlay, (0, 0), mask)
img.paste(pivot_layer, (pivot_x, y_baseline), pivot_layer)

d.text((pivot_x + w_pivot, y_baseline), word_post, font=F_BIG, fill=TEXT)

# Tagline
tag = "WHAT'S ON THE OPPOSITE SIDE OF EARTH?"
w_tag = w_of(tag, F_TAG)
d.text(((W - w_tag) // 2, H // 2 + 90), tag, font=F_TAG, fill=DIM)

# Coords readout
d.text((160, 480), "ORIGIN", font=F_LABEL, fill=ORANGE)
d.text((160, 508), "41.29°N · 174.78°E", font=F_COORD, fill=TEXT)
target = "TARGET"
w_target = w_of(target, F_LABEL)
d.text((W - 160 - w_target, 480), target, font=F_LABEL, fill=TEAL)
coord_r = "41.29°S · 5.22°W"
w_coord = w_of(coord_r, F_COORD)
d.text((W - 160 - w_coord, 508), coord_r, font=F_COORD, fill=TEXT)

# Center connector
d.line([(W // 2, 470), (W // 2, 540)], fill=ORANGE, width=1)
d.ellipse([W // 2 - 4, 466, W // 2 + 4, 474], fill=ORANGE)
d.ellipse([W // 2 - 4, 536, W // 2 + 4, 544], fill=TEAL)

# Footer URL
url = "maxwellhowegis.com/geopuesto"
w_url = w_of(url, F_FOOTER)
d.text(((W - w_url) // 2, 590), url, font=F_FOOTER, fill=DIM)

out = "D:/maxwellhowegis/geopuesto/og-image.png"
img.save(out, "PNG", optimize=True)
print("Wrote", out, os.path.getsize(out), "bytes")
