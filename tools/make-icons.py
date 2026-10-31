"""Генерує PNG-іконки PWA (запуск: python3 tools/make-icons.py). Потрібен Pillow."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
PINK, CYAN, GOLD, BG = (255, 47, 146), (34, 230, 255), (255, 211, 77), (10, 7, 20)


def icon(size, pad=0.0):
    S = size * 4  # суперсемплінг
    im = Image.new('RGB', (S, S), BG)
    # фонове сяйво
    glow = Image.new('RGB', (S, S), BG)
    g = ImageDraw.Draw(glow)
    g.ellipse([S * .1, -S * .3, S * .9, S * .6], fill=(70, 14, 90))
    g.ellipse([S * .1, S * .55, S * .9, S * 1.3], fill=(6, 50, 64))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(S * .12)), 1)
    inset = S * (0.2 + pad)
    w = S - 2 * inset
    h = w * 1.3
    if h > S - 2 * inset * 0.7:
        h = S - 2 * inset * 0.7
    x0, y0 = inset, (S - h) / 2
    card = [x0, y0, x0 + w, y0 + h]
    # неонове світіння рамки
    neon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    n = ImageDraw.Draw(neon)
    n.rounded_rectangle(card, radius=w * .14, outline=PINK + (255,), width=int(S * .03))
    im.paste(neon.filter(ImageFilter.GaussianBlur(S * .025)), (0, 0), neon.filter(ImageFilter.GaussianBlur(S * .025)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(card, radius=w * .14, fill=(24, 14, 40), outline=PINK, width=int(S * .018))
    font = ImageFont.truetype(FONT, int(w * .42))
    txt = 'ВБ'
    tb = d.textbbox((0, 0), txt, font=font)
    tx = x0 + (w - (tb[2] - tb[0])) / 2 - tb[0]
    ty = y0 + h * .36 - (tb[3] - tb[1]) / 2 - tb[1]
    tl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(tl).text((tx, ty), txt, font=font, fill=CYAN + (255,))
    im.paste(tl.filter(ImageFilter.GaussianBlur(S * .02)), (0, 0), tl.filter(ImageFilter.GaussianBlur(S * .02)))
    d.text((tx, ty), txt, font=font, fill=(235, 252, 255))
    # фішка
    r = w * .2
    cx, cy = x0 + w / 2, y0 + h * .74
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    d.ellipse([cx - r * .72, cy - r * .72, cx + r * .72, cy + r * .72], outline=(150, 105, 10), width=int(r * .14))
    d.ellipse([cx - r * .35, cy - r * .35, cx + r * .35, cy + r * .35], fill=(255, 235, 150))
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, pad=0.08).save(os.path.join(OUT, 'icon-maskable-512.png'))
icon(180).save(os.path.join(OUT, 'apple-touch-icon.png'))
print('ok')
