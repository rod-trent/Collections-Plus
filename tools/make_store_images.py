#!/usr/bin/env python3
"""Generate Chrome Web Store listing images for Collections Plus.

Renders faithful mockups of the side-panel UI (using the real dark-theme palette
from sidepanel/panel.css) onto branded canvases:

  store-assets/screenshot-1-list.png      1280x800
  store-assets/screenshot-2-checklist.png 1280x800
  store-assets/screenshot-3-export.png     1280x800
  store-assets/promo-small-440x280.png     440x280
  store-assets/promo-marquee-1400x560.png  1400x560

Requires Pillow. Run:  python tools/make_store_images.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "store-assets")
ICON = os.path.join(HERE, "..", "icons", "icon128.png")
S = 2  # supersample for crisp downscaled output

# ---- Palette (from panel.css) ----------------------------------------------
BG = (31, 31, 31)
ELEV = (43, 43, 43)
ELEV2 = (51, 51, 51)
BORDER = (61, 61, 61)
TEXT = (243, 243, 243)
DIM = (176, 176, 176)
FAINT = (138, 138, 138)
ACCENT = (76, 194, 255)
ACCENT_STRONG = (15, 108, 189)
WHITE = (255, 255, 255)
COVER_HUES = [(38, 70, 110), (60, 48, 92), (33, 88, 80), (110, 70, 38)]


def font(size, weight="r"):
    files = {
        "r": ["segoeui.ttf", "arial.ttf"],
        "sb": ["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"],
        "b": ["segoeuib.ttf", "arialbd.ttf"],
    }[weight]
    for f in files:
        for base in (r"C:\Windows\Fonts", "/usr/share/fonts"):
            p = os.path.join(base, f)
            if os.path.exists(p):
                return ImageFont.truetype(p, size * S)
    return ImageFont.load_default()


def new_canvas(w, h):
    return Image.new("RGB", (w * S, h * S), BG), None


def grad(img, top, bottom):
    """Vertical gradient over the whole image."""
    w, h = img.size
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c


class Pen:
    def __init__(self, d):
        self.d = d

    def rrect(self, x0, y0, x1, y1, r, fill=None, outline=None, width=1):
        self.d.rounded_rectangle(
            [x0 * S, y0 * S, x1 * S, y1 * S], radius=r * S, fill=fill,
            outline=outline, width=max(1, width * S),
        )

    def rect(self, x0, y0, x1, y1, fill):
        self.d.rectangle([x0 * S, y0 * S, x1 * S, y1 * S], fill=fill)

    def text(self, x, y, s, fnt, fill, anchor=None):
        self.d.text((x * S, y * S), s, font=fnt, fill=fill, anchor=anchor)

    def textlen(self, s, fnt):
        return self.d.textlength(s, font=fnt) / S

    def line(self, x0, y0, x1, y1, fill, width=1):
        self.d.line([x0 * S, y0 * S, x1 * S, y1 * S], fill=fill, width=max(1, width * S))

    def poly(self, pts, fill):
        self.d.polygon([(x * S, y * S) for x, y in pts], fill=fill)

    def ellipse(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.ellipse([x0 * S, y0 * S, x1 * S, y1 * S], fill=fill, outline=outline,
                       width=max(1, width * S))


def cover(pen, x, y, sz, hue):
    """A small faux image thumbnail (diagonal two-tone)."""
    pen.rrect(x, y, x + sz, y + sz, 6, fill=hue)
    lighter = tuple(min(255, c + 28) for c in hue)
    pen.poly([(x, y + sz), (x + sz, y), (x + sz, y + sz)], fill=lighter)


def checkbox(pen, x, y, sz, checked):
    if checked:
        pen.rrect(x, y, x + sz, y + sz, 3, fill=ACCENT_STRONG)
        pen.line(x + sz * 0.22, y + sz * 0.52, x + sz * 0.42, y + sz * 0.72, WHITE, 2)
        pen.line(x + sz * 0.42, y + sz * 0.72, x + sz * 0.80, y + sz * 0.28, WHITE, 2)
    else:
        pen.rrect(x, y, x + sz, y + sz, 3, outline=FAINT, width=1)


def topbar(pen, x, y, w, title, f_brand):
    pen.text(x, y, title, f_brand, TEXT)
    # "+ New" pill
    bw = 60
    pen.rrect(x + w - bw - 44, y - 4, x + w - 44, y + 22, 6, fill=ACCENT_STRONG)
    pen.text(x + w - bw - 44 + 12, y + 1, "+ New", font(13, "sb"), WHITE)
    pen.text(x + w - 30, y - 2, "⋯", font(20), DIM)  # ⋯


def panel_frame(base, x, y, w, h):
    """Dark rounded panel with a soft shadow; returns a Pen drawing into base."""
    d = ImageDraw.Draw(base)
    pen = Pen(d)
    # shadow
    pen.rrect(x + 6, y + 10, x + w + 6, y + h + 10, 16, fill=(12, 12, 12))
    pen.rrect(x, y, x + w, y + h, 14, fill=BG, outline=BORDER, width=1)
    return pen


# ---- Panel content ---------------------------------------------------------

def draw_list(pen, x, y, w):
    pad = 16
    cx = x + pad
    cw = w - pad * 2
    topbar(pen, cx, y + 16, cw, "Collections Plus", font(17, "sb"))
    # search box
    sy = y + 50
    pen.rrect(cx, sy, cx + cw, sy + 32, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 10, sy + 8, "Search collections and items…", font(13), FAINT)

    def card(yy, title, meta, hue, tags=None, pinned=False):
        ch = 78
        pen.rrect(cx, yy, cx + cw, yy + ch, 8,
                  fill=ELEV, outline=ACCENT_STRONG if pinned else BORDER, width=1)
        pen.text(cx + 12, yy + ch / 2 - 7, "⠿", font(13), FAINT)  # ⠿ handle
        cover(pen, cx + 28, yy + 13, 52, hue)
        tx = cx + 92
        pen.text(tx, yy + 14, title, font(15, "sb"), TEXT)
        pen.text(tx, yy + 35, meta, font(12), DIM)
        if tags:
            txx = tx
            for t in tags:
                tw = pen.textlen(t, font(11)) + 16
                pen.rrect(txx, yy + 52, txx + tw, yy + 68, 8, fill=ELEV2, outline=BORDER, width=1)
                pen.text(txx + 8, yy + 54, t, font(11), DIM)
                txx += tw + 6
        if pinned:
            pen.ellipse(cx + cw - 30, yy + ch / 2 - 6, cx + cw - 18, yy + ch / 2 + 6, fill=ACCENT)
        return yy + ch + 10

    yy = sy + 46
    yy = card(yy, "Trip to Japan", "5 items", COVER_HUES[0], ["travel", "2026"], pinned=True)
    yy = card(yy, "Reading list", "12 items", COVER_HUES[1], ["read"])

    # folder header
    pen.line(cx, yy + 2, cx + cw, yy + 2, BORDER, 1)
    pen.text(cx, yy + 8, "▾", font(12), DIM)  # caret
    # folder glyph
    fx = cx + 20
    pen.rrect(fx, yy + 10, fx + 18, yy + 22, 2, fill=ACCENT_STRONG)
    pen.rrect(fx, yy + 8, fx + 9, yy + 13, 1, fill=ACCENT_STRONG)
    pen.text(fx + 24, yy + 8, "Work", font(13, "sb"), TEXT)
    pen.text(cx + cw - 14, yy + 9, "2", font(12), FAINT)
    yy += 30
    yy = card(yy, "Project parts", "8 items", COVER_HUES[2], ["diy"])
    yy = card(yy, "Invoices", "3 items", COVER_HUES[3])


def draw_detail(pen, x, y, w, menu=False):
    pad = 16
    cx = x + pad
    cw = w - pad * 2
    pen.text(cx, y + 14, "‹", font(22), DIM)  # ‹ back
    pen.text(cx + 26, y + 17, "Trip to Japan", font(17, "sb"), TEXT)
    pen.text(cx + cw - 14, y + 15, "⋯", font(20), DIM)

    # toolbar: cover chip + add button
    ty = y + 48
    cover(pen, cx, ty, 44, COVER_HUES[0])
    pen.rrect(cx + 54, ty + 8, cx + 150, ty + 36, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 64, ty + 15, "Change cover…", font(12), TEXT)
    ay = ty + 52
    pen.rrect(cx, ay, cx + cw, ay + 32, 6, fill=ACCENT_STRONG)
    pen.text(cx + cw / 2, ay + 8, "+ Add current page", font(13, "sb"), WHITE, anchor="ma")

    def item(yy, title, sub, checked, hue=None, field=None, note=False):
        ih = 56 if not field else 78
        pen.rrect(cx, yy, cx + cw, yy + ih, 8, fill=ELEV, outline=BORDER, width=1)
        pen.text(cx + 10, yy + ih / 2 - 7, "⠿", font(12), FAINT)
        checkbox(pen, cx + 26, yy + 11, 16, checked)
        if note:
            pen.rrect(cx + 50, yy + 10, cx + 70, yy + 30, 4, fill=ELEV2)
            pen.text(cx + 56, yy + 13, "\U0001f5d2", font(12), DIM)
        elif hue:
            cover(pen, cx + 50, yy + 8, 38, hue)
        tx = cx + 98
        tcol = FAINT if checked else TEXT
        pen.text(tx, yy + 12, title, font(14, "sb"), tcol)
        if checked:
            tw = pen.textlen(title, font(14, "sb"))
            pen.line(tx, yy + 20, tx + tw, yy + 20, FAINT, 1)
        pen.text(tx, yy + 32, sub, font(12), FAINT)
        if field:
            k, v = field
            pen.text(tx, yy + 52, k, font(12), DIM)
            pen.rrect(tx + 44, yy + 50, cx + cw - 14, yy + 70, 5, fill=ELEV2, outline=BORDER, width=1)
            pen.text(tx + 52, yy + 53, v, font(12), TEXT)
        return yy + ih + 8

    yy = ay + 48
    yy = item(yy, "Standing desk — model X", "example.com", True, hue=COVER_HUES[2],
              field=("Price", "549.00"))
    yy = item(yy, "Best ramen in Osaka", "example.com", False, hue=COVER_HUES[3])
    yy = item(yy, "Book the JR Pass before arriving", "note", False, note=True)
    yy = item(yy, "Tokyo neighborhood guide", "example.com", False, hue=COVER_HUES[1])

    if menu:
        mx = x + w - 232
        my = y + 36
        rows = ["Open all pages", "Add all open tabs", "Export to Excel (.xlsx)",
                "Export as CSV", "Export as Markdown", "Export as HTML", "Copy links"]
        mh = 16 + len(rows) * 30 + 8
        d = pen.d
        # shadow + menu
        pen.rrect(mx + 4, my + 6, mx + 4 + 216, my + 6 + mh, 8, fill=(10, 10, 10))
        pen.rrect(mx, my, mx + 216, my + mh, 8, fill=ELEV, outline=BORDER, width=1)
        ry = my + 8
        for r in rows:
            hl = ".xlsx" in r or "CSV" in r or "Markdown" in r or "HTML" in r or "links" in r
            pen.text(mx + 12, ry + 6, r, font(13, "sb" if hl else "r"),
                     ACCENT if hl else TEXT)
            ry += 30


# ---- Canvas composition ----------------------------------------------------

def screenshot(path, headline, sub, draw_panel):
    W, H = 1280, 800
    img = Image.new("RGB", (W * S, H * S), ACCENT_STRONG)
    grad(img, (16, 86, 150), (8, 52, 96))
    d = ImageDraw.Draw(img)
    pen = Pen(d)

    # Left: headline + subtext
    lx = 96
    ly = 250
    for i, line in enumerate(headline.split("\n")):
        pen.text(lx, ly + i * 60, line, font(46, "b"), WHITE)
    sy = ly + len(headline.split("\n")) * 60 + 18
    for i, line in enumerate(sub.split("\n")):
        pen.text(lx, sy + i * 32, line, font(20), (210, 226, 240))

    # icon chip
    try:
        ic = Image.open(ICON).convert("RGBA").resize((96 * S, 96 * S), Image.LANCZOS)
        img.paste(ic, (lx * S, (ly - 150) * S), ic)
    except Exception:
        pass
    pen.text(lx + 112, ly - 120, "Collections Plus", font(26, "sb"), WHITE)

    # Right: panel
    pw, ph = 396, 700
    px, py = W - pw - 110, (H - ph) // 2
    panel = panel_frame(img, px, py, pw, ph)
    draw_panel(panel, px, py, pw)

    img = img.resize((W, H), Image.LANCZOS)
    img.save(path)
    print("wrote", os.path.basename(path))


def promo_small(path):
    W, H = 440, 280
    img = Image.new("RGB", (W * S, H * S), ACCENT_STRONG)
    grad(img, (18, 96, 165), (9, 52, 96))
    pen = Pen(ImageDraw.Draw(img))
    try:
        ic = Image.open(ICON).convert("RGBA").resize((84 * S, 84 * S), Image.LANCZOS)
        img.paste(ic, (int((W / 2 - 42) * S), 40 * S), ic)
    except Exception:
        pass
    pen.text(W / 2, 140, "Collections Plus", font(30, "b"), WHITE, anchor="ma")
    pen.text(W / 2, 184, "Save the web into collections", font(15), (214, 230, 244), anchor="ma")
    pen.text(W / 2, 214, "Local-first · no account", font(13), (180, 205, 228), anchor="ma")
    img = img.resize((W, H), Image.LANCZOS)
    img.save(path)
    print("wrote", os.path.basename(path))


def marquee(path):
    W, H = 1400, 560
    img = Image.new("RGB", (W * S, H * S), ACCENT_STRONG)
    grad(img, (16, 90, 156), (8, 48, 90))
    pen = Pen(ImageDraw.Draw(img))
    try:
        ic = Image.open(ICON).convert("RGBA").resize((120 * S, 120 * S), Image.LANCZOS)
        img.paste(ic, (110 * S, 130 * S), ic)
    except Exception:
        pass
    pen.text(110, 270, "Collections Plus", font(58, "b"), WHITE)
    pen.text(112, 346, "An open, local-first replacement for", font(24), (214, 230, 244))
    pen.text(112, 380, "Microsoft Edge Collections.", font(24), (214, 230, 244))
    # floating mini panel on the right
    pw, ph = 360, 460
    px, py = W - pw - 120, (H - ph) // 2
    panel = panel_frame(img, px, py, pw, ph)
    draw_list(panel, px, py, pw)
    img = img.resize((W, H), Image.LANCZOS)
    img.save(path)
    print("wrote", os.path.basename(path))


def main():
    os.makedirs(OUT, exist_ok=True)
    screenshot(os.path.join(OUT, "screenshot-1-list.png"),
               "Organize the web\ninto collections",
               "Folders, tags, pins, covers, and search\nkeep your saved pages tidy.",
               draw_list)
    screenshot(os.path.join(OUT, "screenshot-2-checklist.png"),
               "Checklists, notes\n& custom fields",
               "Tick items off and attach data like\nprice or quantity to any item.",
               lambda p, x, y, w: draw_detail(p, x, y, w, menu=False))
    screenshot(os.path.join(OUT, "screenshot-3-export.png"),
               "Export to Excel,\nMarkdown & more",
               "Real .xlsx with clickable links, plus\nCSV, Markdown, HTML, and JSON.",
               lambda p, x, y, w: draw_detail(p, x, y, w, menu=True))
    promo_small(os.path.join(OUT, "promo-small-440x280.png"))
    marquee(os.path.join(OUT, "promo-marquee-1400x560.png"))


if __name__ == "__main__":
    main()
