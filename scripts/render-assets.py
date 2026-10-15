"""Render first-party bitmap assets for the local product, without network access."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent / "public"
root.mkdir(exist_ok=True)
icon = Image.new("RGBA", (128, 128), (255, 255, 255, 0))
d = ImageDraw.Draw(icon)
for n in range(4):
    inset = 14 + n * 12
    d.arc((inset, inset, 128-inset, 128-inset), 125, 420, fill="#226b54", width=7)
d.line((64, 63, 64, 100), fill="#226b54", width=7)
icon.save(root / "origin-mark.png")
icon.save(root / "favicon.ico", sizes=[(16,16),(32,32),(64,64)])

image = Image.new("RGB", (1440, 240), "#f9fbfa")
draw = ImageDraw.Draw(image)
font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
title = ImageFont.truetype(font_path, 26)
subtitle = ImageFont.truetype(font_path, 19)
labels = [("Private project", "Encrypted storage", "#2b7058"), ("Disclosure review", "Exact request approval", "#786299"), ("Selected model", "Provider terms apply", "#7c6b3f"), ("Evidence trail", "Request + contribution", "#427982")]
for index, (heading, detail, color) in enumerate(labels):
    x = 60 + index * 355
    draw.ellipse((x, 68, x+48, 116), outline=color, width=3)
    draw.text((x+18, 78), str(index+1), font=subtitle, fill=color)
    draw.text((x, 133), heading, font=title, fill="#36413b")
    draw.text((x, 169), detail, font=subtitle, fill="#78837e")
    if index < 3:
        draw.line((x+72, 92, x+320, 92), fill="#cad5ce", width=2)
        draw.line((x+312, 84, x+320, 92, x+312, 100), fill="#cad5ce", width=2)
image.save(root / "privacy-flow.png")
