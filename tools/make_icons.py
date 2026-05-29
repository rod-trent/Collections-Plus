#!/usr/bin/env python3
"""Generate Collections extension icons (no third-party deps).

Draws a rounded blue tile with a stacked-cards glyph (the "collection"
motif) and writes PNGs at 16/32/48/128 px into ../icons.

Rendering is supersampled 4x and box-downsampled for anti-aliasing.
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
SS = 4  # supersample factor

BLUE = (15, 108, 189)       # #0F6CBD  (Edge-collections blue)
BLUE_DK = (11, 86, 153)     # subtle edge shade
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect_cov(x, y, x0, y0, x1, y1, r):
    """Return 1.0 if (x,y) inside rounded rect [x0,x1]x[y0,y1] radius r, else 0."""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return 0.0
    # corner circles
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    dx = x - cx
    dy = y - cy
    return 1.0 if (dx * dx + dy * dy) <= r * r else 0.0


def render(size):
    n = size * SS
    px = [[(0, 0, 0, 0) for _ in range(n)] for _ in range(n)]

    # geometry in supersampled space
    pad = n * 0.02
    bg = (pad, pad, n - pad, n - pad)
    bg_r = n * 0.22

    # back card (offset up-right), front card (offset down-left)
    cw = n * 0.46
    ch = n * 0.56
    card_r = n * 0.06
    cx_back = n * 0.30
    cy_back = n * 0.20
    cx_front = n * 0.22
    cy_front = n * 0.28

    for y in range(n):
        for x in range(n):
            # background tile with a faint top-to-bottom shade
            if rounded_rect_cov(x, y, bg[0], bg[1], bg[2], bg[3], bg_r):
                t = y / n
                px[y][x] = (*lerp(BLUE, BLUE_DK, t * 0.6), 255)

    def paint_card(ox, oy, color, alpha):
        for y in range(n):
            for x in range(n):
                if rounded_rect_cov(x, y, ox, oy, ox + cw, oy + ch, card_r):
                    base = px[y][x]
                    r = round(color[0] * alpha + base[0] * (1 - alpha))
                    g = round(color[1] * alpha + base[1] * (1 - alpha))
                    b = round(color[2] * alpha + base[2] * (1 - alpha))
                    px[y][x] = (r, g, b, 255)

    paint_card(cx_back, cy_back, WHITE, 0.55)
    paint_card(cx_front, cy_front, WHITE, 1.0)

    # blue "content lines" on the front card
    line_x0 = cx_front + cw * 0.16
    line_x1 = cx_front + cw * 0.84
    for i, fy in enumerate((0.26, 0.46, 0.66)):
        ly = cy_front + ch * fy
        lh = n * 0.025
        lw = (line_x1 - line_x0) * (1.0 if i < 2 else 0.6)
        for y in range(n):
            for x in range(n):
                if line_x0 <= x <= line_x0 + lw and ly <= y <= ly + lh:
                    if px[y][x][3] == 255 and px[y][x][:3] != BLUE:
                        px[y][x] = (*BLUE, 255)

    # downsample box filter
    out = bytearray()
    for sy in range(size):
        out.append(0)  # PNG filter byte (none)
        for sx in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                for dx in range(SS):
                    pr, pg, pb, pa = px[sy * SS + dy][sx * SS + dx]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
            cnt = SS * SS
            if a == 0:
                out += bytes((0, 0, 0, 0))
            else:
                out += bytes((round(r / a), round(g / a), round(b / a), round(a / cnt)))
    return bytes(out)


def write_png(path, size, raw):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(raw, 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (16, 32, 48, 128):
        raw = render(size)
        write_png(os.path.join(OUT, f"icon{size}.png"), size, raw)
        print(f"wrote icon{size}.png")


if __name__ == "__main__":
    main()
