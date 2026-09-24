#!/usr/bin/env python3
"""Store screenshot for the 2.8.0 nested-collections feature.

Reuses the mockup helpers in make_store_images.py (same palette, frame and
layout) and draws a subcollection's detail view: the path back to its parent,
the Collections section of child cards, then its items.

  store-assets/screenshot-8-nested.png  1280x800

Requires Pillow. Run:  python tools/make_store_image_nested.py
"""
import os

from make_store_images import (
    ACCENT, ACCENT_STRONG, BORDER, COVER_HUES, DIM, ELEV, FAINT, OUT, TEXT, WHITE,
    cover, font, screenshot,
)


def draw_nested(pen, x, y, w):
    pad = 16
    cx = x + pad
    cw = w - pad * 2
    # topbar: back, title, overflow
    pen.text(cx, y + 14, "‹", font(22), DIM)
    pen.text(cx + 26, y + 17, "Japan 2026", font(17, "sb"), TEXT)
    pen.text(cx + cw - 14, y + 15, "⋯", font(20), DIM)

    # breadcrumb to the parent collection
    by = y + 50
    pen.text(cx, by, "Travel", font(12), ACCENT)
    tw = pen.textlen("Travel", font(12))
    pen.text(cx + tw + 6, by, "›", font(12), FAINT)

    # toolbar: cover chip + add button
    ty = by + 26
    cover(pen, cx, ty, 44, COVER_HUES[0])
    pen.rrect(cx + 54, ty + 8, cx + 150, ty + 36, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 64, ty + 15, "Change cover…", font(12), TEXT)
    ay = ty + 52
    pen.rrect(cx, ay, cx + cw, ay + 32, 6, fill=ACCENT_STRONG)
    pen.text(cx + cw / 2, ay + 8, "+ Add current page", font(13, "sb"), WHITE, anchor="ma")

    # Collections section header
    sy = ay + 48
    pen.line(x + 1, sy - 8, x + w - 1, sy - 8, BORDER, 1)
    pen.text(cx, sy + 4, "COLLECTIONS", font(11, "sb"), DIM)
    pen.rrect(cx + cw - 58, sy, cx + cw, sy + 22, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + cw - 29, sy + 4, "+ New", font(11), TEXT, anchor="ma")

    def sub_card(yy, title, meta, hue, highlight=False):
        ch = 66
        pen.rrect(cx, yy, cx + cw, yy + ch, 8, fill=ELEV,
                  outline=ACCENT_STRONG if highlight else BORDER, width=1)
        cover(pen, cx + 12, yy + 10, 46, hue)
        pen.text(cx + 70, yy + 14, title, font(15, "sb"), TEXT)
        pen.text(cx + 70, yy + 36, meta, font(12), DIM)
        return yy + ch + 8

    yy = sy + 32
    yy = sub_card(yy, "Tokyo", "6 items · 2 collections", COVER_HUES[1], highlight=True)
    yy = sub_card(yy, "Kyoto", "4 items", COVER_HUES[2])
    yy = sub_card(yy, "Osaka food", "9 items", COVER_HUES[3])

    # items below the section
    pen.line(x + 1, yy + 2, x + w - 1, yy + 2, BORDER, 1)
    yy += 14

    def item(yy, title, sub, hue):
        ih = 56
        pen.rrect(cx, yy, cx + cw, yy + ih, 8, fill=ELEV, outline=BORDER, width=1)
        pen.text(cx + 10, yy + ih / 2 - 7, "⠿", font(12), FAINT)
        pen.rrect(cx + 26, yy + 11, cx + 42, yy + 27, 3, outline=FAINT, width=1)
        cover(pen, cx + 50, yy + 8, 38, hue)
        pen.text(cx + 98, yy + 12, title, font(14, "sb"), TEXT)
        pen.text(cx + 98, yy + 32, sub, font(12), FAINT)
        return yy + ih + 8

    yy = item(yy, "JR Pass — which one to buy", "example.com", COVER_HUES[0])
    item(yy, "Packing list for two weeks", "example.com", COVER_HUES[2])


def main():
    os.makedirs(OUT, exist_ok=True)
    screenshot(os.path.join(OUT, "screenshot-8-nested.png"),
               "Collections inside\ncollections",
               "Nest collections as deep as you like.\nMove, archive or restore a whole tree at once.",
               draw_nested)


if __name__ == "__main__":
    main()
