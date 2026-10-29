# Generates res/drawable/icon.png (neon crosshair) without any image libraries.
import math, struct, zlib, sys
N = 192
def px(x, y):
    cx = cy = N / 2
    dx, dy = x - cx + 0.5, y - cy + 0.5
    r = math.hypot(dx, dy)
    # rounded-square dark background with a pink-to-cyan diagonal glow
    t = (x + y) / (2 * N)
    bg = (int(20 + 40 * t), int(14 + 10 * t), int(42 + 30 * t))
    m = 26
    if (x < m or x >= N - m) and (y < m or y >= N - m):
        ex, ey = (m if x < m else N - m - 1), (m if y < m else N - m - 1)
        if math.hypot(x - ex, y - ey) > m: return (0, 0, 0, 0)
    pink, cyan = (255, 46, 136), (0, 229, 255)
    ring = abs(r - 58) < 7
    cross = (abs(dx) < 5 and 22 < abs(dy) < 80) or (abs(dy) < 5 and 22 < abs(dx) < 80)
    dot = r < 9
    if dot: return (*pink, 255)
    if cross: return (*cyan, 255)
    if ring: return (*pink, 255)
    glow = max(0, 1 - abs(r - 58) / 26) * 0.35
    return (int(bg[0] + (pink[0] - bg[0]) * glow), int(bg[1] + (pink[1] - bg[1]) * glow), int(bg[2] + (pink[2] - bg[2]) * glow), 255)
raw = b''.join(b'\x00' + b''.join(bytes(px(x, y)) for x in range(N)) for y in range(N))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
open(sys.argv[1], 'wb').write(png)
