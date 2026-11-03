"""Moonlit 風のドット絵の夜空 PNG を作る（標準ライブラリのみ）。

低解像度で描いてから整数倍に拡大して、ドット絵っぽく見せる。
使い方: python3 -I moonlit.py <出力パス> [拡大率]
"""
import random, struct, sys, zlib

W, H = 400, 250
TOP, BOTTOM = (8, 12, 34), (26, 38, 86)
MOON = (246, 240, 205)
CLOUD = (44, 60, 118)
random.seed(7)


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def sky():
    """上が濃い紺、下が少し明るい紺のグラデーション"""
    return [[mix(TOP, BOTTOM, y / (H - 1)) for _ in range(W)] for y in range(H)]


def stars(px):
    """明るさの違う星。大きめの星は十字に光らせる"""
    for _ in range(170):
        x, y = random.randrange(W), random.randrange(int(H * 0.85))
        px[y][x] = mix(px[y][x], (255, 255, 255), random.uniform(0.35, 1.0))
    for _ in range(9):
        x, y = random.randrange(2, W - 2), random.randrange(2, int(H * 0.6))
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            px[y + dy][x + dx] = mix(px[y + dy][x + dx], (255, 255, 255), 0.9 if dx == dy == 0 else 0.45)


def moon(px, cx=320, cy=52, r=20):
    """ぼんやりした光と、円から少しずらした円を引いた三日月"""
    for y in range(H):
        for x in range(W):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            glow = max(0.0, 1 - d2 ** 0.5 / (r * 3.2))
            if glow:
                px[y][x] = mix(px[y][x], (120, 140, 210), glow * 0.28)
            if d2 <= r * r and (x - cx + 9) ** 2 + (y - cy - 6) ** 2 > (r - 2) ** 2:
                px[y][x] = MOON


def cloud(px, x0, y0, w, h):
    """角ばった雲。横長の長方形を段々に重ねる"""
    rows = [(0.25, 0.55), (0.1, 0.8), (0.0, 1.0)]
    for i, (s, e) in enumerate(rows):
        for y in range(y0 + i * h // 3, y0 + (i + 1) * h // 3):
            for x in range(x0 + int(w * s), x0 + int(w * e)):
                if 0 <= x < W and 0 <= y < H:
                    px[y][x] = mix(px[y][x], CLOUD, 0.85)


def write_png(path, px, scale):
    raw = bytearray()
    for row in px:
        line = b"".join(bytes(c) * scale for c in row)
        for _ in range(scale):
            raw += b"\x00" + line
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    ihdr = struct.pack(">IIBBBBB", W * scale, H * scale, 8, 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def main():
    px = sky()
    stars(px)
    moon(px)
    for args in ((30, 60, 70, 12), (200, 30, 56, 9), (260, 150, 90, 15), (60, 190, 80, 12), (340, 210, 60, 9)):
        cloud(px, *args)
    write_png(sys.argv[1], px, int(sys.argv[2]) if len(sys.argv) > 2 else 4)


main()
