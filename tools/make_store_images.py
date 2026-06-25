#!/usr/bin/env python3
"""Generate Chrome Web Store listing images for Collections Plus.

Renders faithful mockups of the side-panel UI (using the real dark-theme palette
from sidepanel/panel.css) onto branded canvases:

  store-assets/screenshot-1-list.png      1280x800
  store-assets/screenshot-2-checklist.png 1280x800
  store-assets/screenshot-3-export.png     1280x800
  store-assets/screenshot-4-trash.png      1280x800
  store-assets/screenshot-5-ai.png         1280x800
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
DANGER = (255, 107, 107)
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
    # search box + AI-search button
    sy = y + 50
    pen.rrect(cx, sy, cx + cw - 40, sy + 32, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 10, sy + 8, "Search collections and items…", font(13), FAINT)
    pen.rrect(cx + cw - 34, sy, cx + cw, sy + 32, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + cw - 17, sy + 9, "AI", font(12, "sb"), ACCENT, anchor="ma")

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


def draw_trash(pen, x, y, w):
    pad = 16
    cx = x + pad
    cw = w - pad * 2
    # topbar: back, title, Empty Trash
    pen.text(cx, y + 14, "‹", font(22), DIM)
    pen.text(cx + 26, y + 17, "Trash", font(17, "sb"), TEXT)
    bw = 96
    pen.rrect(cx + cw - bw, y + 14, cx + cw, y + 38, 6, outline=BORDER, width=1)
    pen.text(cx + cw - bw + 11, y + 20, "Empty Trash", font(12, "sb"), DANGER)

    # explanatory note
    ny = y + 52
    pen.text(cx, ny, "Items are deleted for good 30 days", font(12), DIM)
    pen.text(cx, ny + 18, "after they're trashed.", font(12), DIM)

    def bin_row(yy, title, meta, hue=None, folder=False):
        ch = 70
        pen.rrect(cx, yy, cx + cw, yy + ch, 8, fill=ELEV, outline=BORDER, width=1)
        if folder:
            fx = cx + 14
            fy = yy + 18
            pen.rrect(fx, fy + 8, fx + 44, fy + 34, 3, fill=ACCENT_STRONG)  # body
            pen.rrect(fx, fy, fx + 22, fy + 12, 2, fill=ACCENT_STRONG)      # tab
        else:
            cover(pen, cx + 14, yy + 13, 44, hue)
        tx = cx + 70
        pen.text(tx, yy + 16, title, font(14, "sb"), TEXT)
        pen.text(tx, yy + 38, meta, font(12), FAINT)
        # Restore pill + ✕ delete-forever
        bw2 = 62
        rx = cx + cw - 28 - bw2
        pen.rrect(rx, yy + ch / 2 - 13, rx + bw2, yy + ch / 2 + 13, 6,
                  fill=ELEV2, outline=BORDER, width=1)
        pen.text(rx + 10, yy + ch / 2 - 7, "Restore", font(12, "sb"), TEXT)
        # ✕ (delete forever) drawn as crossed lines — the glyph isn't in Segoe UI
        ex, ey, es = cx + cw - 16, yy + ch / 2, 5
        pen.line(ex - es, ey - es, ex + es, ey + es, FAINT, 2)
        pen.line(ex - es, ey + es, ex + es, ey - es, FAINT, 2)
        return yy + ch + 10

    yy = ny + 44
    yy = bin_row(yy, "Old receipts", "6 items · deleted 2d ago", COVER_HUES[3])
    yy = bin_row(yy, "Q2 research", "2 collections · deleted 5d ago", folder=True)
    yy = bin_row(yy, "Holiday gift ideas", "9 items · deleted 1w ago", COVER_HUES[1])
    yy = bin_row(yy, "Bookmarks dump", "21 items · deleted 3w ago", COVER_HUES[2])


def draw_chat(pen, x, y, w):
    """AI chat over collections: scope, a question bubble, a formatted reply."""
    pad = 16
    cx = x + pad
    cw = w - pad * 2
    PH = 700  # this mockup is only used in the 700px-tall screenshot canvas

    # header: back, title
    pen.text(cx, y + 14, "‹", font(22), DIM)
    pen.text(cx + 26, y + 17, "AI Chat", font(17, "sb"), TEXT)

    # context/scope line with a divider under it
    sy = y + 50
    pen.text(cx, sy, "Context: all collections", font(12), DIM)
    pen.line(cx, sy + 22, cx + cw, sy + 22, BORDER, 1)

    line_h = 19
    msg_top = sy + 42

    # user bubble (right-aligned, accent fill)
    u_lines = ["Summarize my Trip to Japan", "collection and suggest a next step."]
    uw = max(pen.textlen(l, font(13)) for l in u_lines) + 24
    ux1 = cx + cw
    ux0 = ux1 - uw
    uh = 10 * 2 + len(u_lines) * line_h
    pen.rrect(ux0, msg_top, ux1, msg_top + uh, 12, fill=ACCENT_STRONG)
    ty = msg_top + 10
    for l in u_lines:
        pen.text(ux0 + 12, ty, l, font(13), WHITE)
        ty += line_h

    # assistant bubble (left-aligned, formatted "report")
    ay0 = msg_top + uh + 14
    a_lines = [
        ("Trip to Japan — summary", "h"),
        ("You've saved 5 items:", ""),
        ("•  Standing desk — model X  ($549)", "li"),
        ("•  Best ramen in Osaka", "li"),
        ("•  JR Pass reminder (note)", "li"),
        ("•  Tokyo neighborhood guide", "li"),
        ("", ""),
        ("Next step: buy the JR Pass before you", ""),
        ("fly — it must be purchased abroad.", ""),
    ]
    aw = cw - 36
    ah = 12 * 2 + len(a_lines) * line_h
    pen.rrect(cx, ay0, cx + aw, ay0 + ah, 12, fill=ELEV, outline=BORDER, width=1)
    ty = ay0 + 12
    for txt, kind in a_lines:
        if kind == "h":
            pen.text(cx + 12, ty, txt, font(14, "sb"), TEXT)
        elif kind == "li":
            pen.text(cx + 12, ty, txt, font(13), DIM)
        else:
            pen.text(cx + 12, ty, txt, font(13), TEXT)
        ty += line_h

    # input bar pinned near the bottom: textarea + Send
    iy0 = y + PH - 56
    pen.rrect(cx, iy0, cx + cw - 66, iy0 + 36, 8, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 10, iy0 + 10, "Ask about your collections…", font(12), FAINT)
    pen.rrect(cx + cw - 56, iy0, cx + cw, iy0 + 36, 8, fill=ACCENT_STRONG)
    pen.text(cx + cw - 28, iy0 + 10, "Send", font(12, "sb"), WHITE, anchor="ma")


def draw_ai_search(pen, x, y, w):
    """List view with the AI-search results overlay."""
    pad = 16
    cx = x + pad
    cw = w - pad * 2
    topbar(pen, cx, y + 16, cw, "Collections Plus", font(17, "sb"))

    # search box + AI button + sort
    sy = y + 50
    pen.rrect(cx, sy, cx + cw - 86, sy + 32, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 10, sy + 8, "where to eat in Japan", font(13), TEXT)
    pen.rrect(cx + cw - 82, sy, cx + cw - 46, sy + 32, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + cw - 64, sy + 9, "AI", font(12, "sb"), ACCENT, anchor="ma")
    pen.rrect(cx + cw - 42, sy, cx + cw, sy + 32, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + cw - 21, sy + 10, "A–Z", font(11), DIM, anchor="ma")

    # faded card behind, to hint at the list
    pen.rrect(cx, sy + 46, cx + cw, sy + 46 + 60, 8, fill=ELEV, outline=BORDER, width=1)
    cover(pen, cx + 28, sy + 56, 40, COVER_HUES[0])
    pen.text(cx + 84, sy + 56, "Trip to Japan", font(15, "sb"), DIM)
    pen.text(cx + 84, sy + 76, "12 items", font(12), FAINT)

    # results overlay
    oy = sy + 92
    oh = 270
    pen.rrect(cx - 4, oy + 6, cx + cw + 4, oy + oh + 6, 12, fill=(10, 10, 10))  # shadow
    pen.rrect(cx - 4, oy, cx + cw + 4, oy + oh, 12, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 8, oy + 12, "AI search", font(15, "sb"), TEXT)
    pen.text(cx + 8, oy + 34, "3 results for “where to eat in Japan”", font(12), FAINT)
    pen.line(cx + 8, oy + 56, cx + cw - 8, oy + 56, BORDER, 1)
    results = [
        ("Best ramen in Osaka", "top food stop in Japan", "Trip to Japan"),
        ("Tokyo neighborhood guide", "covers dining districts", "Trip to Japan"),
        ("Izakaya hopping in Shinjuku", "where locals eat & drink", "Foodie reads"),
    ]
    ry = oy + 66
    for title, why, coll in results:
        pen.text(cx + 10, ry, title, font(13, "sb"), TEXT)
        pen.text(cx + 10, ry + 19, why, font(12), FAINT)
        pen.text(cx + cw - 10, ry + 4, "in “%s” ›" % coll, font(11), ACCENT, anchor="ra")
        ry += 44
        if title != results[-1][0]:
            pen.line(cx + 8, ry - 8, cx + cw - 8, ry - 8, BORDER, 1)


def draw_link_rot(pen, x, y, w):
    """Detail view: dead-link badges + a saved snapshot reader."""
    pad = 16
    cx = x + pad
    cw = w - pad * 2
    pen.text(cx, y + 14, "‹", font(22), DIM)
    pen.text(cx + 26, y + 17, "Research", font(17, "sb"), TEXT)
    pen.text(cx + cw - 14, y + 15, "⋯", font(20), DIM)

    def page_item(yy, title, host, hue, dead=False, snap=False):
        ih = 60
        pen.rrect(cx, yy, cx + cw, yy + ih, 8, fill=ELEV, outline=BORDER, width=1)
        cover(pen, cx + 12, yy + 11, 38, hue)
        tx = cx + 60
        pen.text(tx, yy + 9, title, font(14, "sb"), TEXT)
        pen.text(tx, yy + 30, host, font(12), FAINT)
        if dead:
            hw = pen.textlen(host, font(12))
            bx = tx + hw + 10
            pen.poly([(bx, yy + 41), (bx + 12, yy + 41), (bx + 6, yy + 30)], DANGER)  # ⚠ triangle
            pen.rrect(bx + 16, yy + 29, bx + 84, yy + 45, 4, fill=(60, 32, 32))
            pen.text(bx + 22, yy + 31, "dead link", font(11, "sb"), DANGER)
        if snap:
            pen.text(cx + cw - 12, yy + 9, "Saved snapshot", font(11, "sb"), ACCENT, anchor="ra")
        return yy + ih + 8

    yy = y + 52
    yy = page_item(yy, "Foundational paper (2019)", "old-domain.org", COVER_HUES[1], dead=True, snap=True)
    yy = page_item(yy, "Survey of recent methods", "arxiv.org", COVER_HUES[2])
    yy = page_item(yy, "Lessons learned (blog)", "defunct-blog.com", COVER_HUES[3], dead=True, snap=True)

    # snapshot reader card
    ry = yy + 6
    rh = (y + 700) - ry - 16
    pen.rrect(cx, ry, cx + cw, ry + rh, 10, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 12, ry + 12, "Foundational paper (2019)", font(13, "sb"), TEXT)
    pen.text(cx + 12, ry + 32, "Saved snapshot · captured 3 days ago", font(11), FAINT)
    pen.line(cx + 12, ry + 52, cx + cw - 12, ry + 52, BORDER, 1)
    body = [
        "The method reframes the task as a ranking",
        "problem and shows a lightweight model can",
        "match far larger ones on the benchmark.",
        "",
        "This is the saved copy — still readable even",
        "though the original page is now gone.",
    ]
    by = ry + 62
    for line in body:
        pen.text(cx + 12, by, line, font(12), DIM)
        by += 19


def draw_reading(pen, x, y, w):
    """The Reading list (read-it-later) view."""
    pad = 16
    cx = x + pad
    cw = w - pad * 2
    pen.text(cx, y + 14, "‹", font(22), DIM)
    pen.text(cx + 26, y + 17, "Reading list", font(17, "sb"), TEXT)
    bw = 108
    pen.rrect(cx + cw - bw, y + 14, cx + cw, y + 38, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + cw - bw + 11, y + 20, "Mark all read", font(12, "sb"), TEXT)
    pen.text(cx, y + 52, "Pages you save start here as unread.", font(12), DIM)

    def row(yy, title, host, coll, hue):
        ch = 64
        pen.rrect(cx, yy, cx + cw, yy + ch, 8, fill=ELEV, outline=BORDER, width=1)
        cover(pen, cx + 12, yy + 13, 38, hue)
        tx = cx + 60
        pen.text(tx, yy + 13, title, font(14, "sb"), TEXT)
        pen.text(tx, yy + 34, host + " · " + coll, font(12), FAINT)
        bw2 = 60
        rx = cx + cw - 12 - bw2
        pen.rrect(rx, yy + ch / 2 - 12, rx + bw2, yy + ch / 2 + 12, 6, fill=ELEV2, outline=BORDER, width=1)
        pen.line(rx + 12, yy + ch / 2 + 1, rx + 17, yy + ch / 2 + 6, ACCENT, 2)
        pen.line(rx + 17, yy + ch / 2 + 6, rx + 26, yy + ch / 2 - 5, ACCENT, 2)
        pen.text(rx + 32, yy + ch / 2 - 7, "Read", font(12, "sb"), TEXT)
        return yy + ch + 10

    yy = y + 78
    yy = row(yy, "Standing desk review", "example.com", "Home Office", COVER_HUES[2])
    yy = row(yy, "Best ramen in Osaka", "example.com", "Trip to Japan", COVER_HUES[3])
    yy = row(yy, "Tokyo neighborhood guide", "example.com", "Trip to Japan", COVER_HUES[0])
    yy = row(yy, "RAG pipelines, explained", "blog.dev", "AI reading", COVER_HUES[1])
    yy = row(yy, "The case for note-taking", "example.com", "Productivity", COVER_HUES[2])


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
    # Refreshed set for the 2.0 listing — the headline new features first.
    screenshot(os.path.join(OUT, "screenshot-1-collections.png"),
               "Organize the web\ninto collections",
               "Folders, tags, pins, covers, sort,\nand search keep big libraries tidy.",
               draw_list)
    screenshot(os.path.join(OUT, "screenshot-2-ai-search.png"),
               "Find anything\nby meaning",
               "AI search surfaces the right item\neven when the words don't match.",
               draw_ai_search)
    screenshot(os.path.join(OUT, "screenshot-3-link-rot.png"),
               "Beat link rot",
               "Dead pages get flagged — and a saved\nsnapshot keeps the content for good.",
               draw_link_rot)
    screenshot(os.path.join(OUT, "screenshot-4-reading.png"),
               "A reading list,\nbuilt in",
               "Saved pages start unread and gather\nin one place. Open one to mark it read.",
               draw_reading)
    screenshot(os.path.join(OUT, "screenshot-5-ai-tools.png"),
               "Put your AI\nto work",
               "Summarize, tag, organize, search and\ndigest — with your own AI key.",
               draw_chat)
    # Extras the listing can swap in (core utility features).
    screenshot(os.path.join(OUT, "screenshot-6-checklist.png"),
               "Checklists, notes\n& custom fields",
               "Tick items off and attach data like\nprice or quantity to any item.",
               lambda p, x, y, w: draw_detail(p, x, y, w, menu=False))
    screenshot(os.path.join(OUT, "screenshot-7-export.png"),
               "Export to Excel,\nMarkdown & more",
               "Real .xlsx with clickable links, plus\nCSV, Markdown, HTML, and JSON.",
               lambda p, x, y, w: draw_detail(p, x, y, w, menu=True))
    promo_small(os.path.join(OUT, "promo-small-440x280.png"))
    marquee(os.path.join(OUT, "promo-marquee-1400x560.png"))


if __name__ == "__main__":
    main()
