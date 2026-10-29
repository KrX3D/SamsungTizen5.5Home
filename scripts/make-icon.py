"""Renders app/icon.png: a full-bleed landscape (sky, sun, three mountain ridges).

Full-bleed on purpose: the TV draws its own rounded frame around app icons,
so transparent or black corners show up as a black border.

    python scripts/make-icon.py app/icon.png
"""
import math
import sys

from PIL import Image, ImageDraw, ImageFilter

S = 512
SS = 4                      # supersampling for smooth edges
W = S * SS

img = Image.new("RGB", (W, W))
px = img.load()
top, bottom = (58, 92, 168), (247, 178, 120)   # dusk blue -> warm horizon
for y in range(W):
    f = y / (W - 1)
    c = tuple(int(top[i] + (bottom[i] - top[i]) * f) for i in range(3))
    for x in range(W):
        px[x, y] = c

d = ImageDraw.Draw(img)

# Sun with a soft glow
glow = Image.new("L", (W, W), 0)
gd = ImageDraw.Draw(glow)
cx, cy, r = int(W * 0.66), int(W * 0.42), int(W * 0.11)
gd.ellipse([cx - r * 2, cy - r * 2, cx + r * 2, cy + r * 2], fill=120)
glow = glow.filter(ImageFilter.GaussianBlur(W * 0.05))
img.paste((255, 226, 170), (0, 0), glow)
d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 240, 205))


def ridge(base, amp, waves, phase, color):
    pts = [(0, W)]
    for x in range(0, W + 1, 8):
        t = x / W
        y = base - amp * (0.6 * math.sin(t * math.pi * waves + phase) + 0.4 * math.sin(t * math.pi * waves * 2.3 + phase * 1.7))
        pts.append((x, y))
    pts.append((W, W))
    d.polygon(pts, fill=color)


ridge(W * 0.60, W * 0.10, 1.6, 0.4, (96, 104, 150))
ridge(W * 0.72, W * 0.09, 2.2, 2.1, (58, 70, 112))
ridge(W * 0.85, W * 0.07, 1.4, 4.0, (30, 40, 70))

img.resize((S, S), Image.LANCZOS).save(sys.argv[1], "PNG")
print("wrote", sys.argv[1])
