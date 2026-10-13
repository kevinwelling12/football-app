"""Club crests from ESPN, saved into web/logos/ so the page doesn't depend on ESPN's image server.

For each club in web/data/<league>.json: <id>-d.png (dark-background variant) and <id>.png (standard), 96px squares.
ESPN has some crests on a solid white square (Sacramento Republic among them). Those are detected (the border is
mostly opaque near-white) and cleared: near-white pixels connected to the edge become transparent, with a soft rim,
so white inside the crest stays.

    python3 scripts/logos.py            # fetch missing crests
    python3 scripts/logos.py --force    # fetch everything again
Needs Pillow (pip install pillow).
"""
import io, json, os, sys, urllib.request
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'web', 'logos')
SIZE = 96
FORCE = '--force' in sys.argv


def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return Image.open(io.BytesIO(r.read())).convert('RGBA')
    except Exception:
        return None


def white_square(im):
    """True when most of the border is opaque and near-white."""
    w, h = im.size
    px = im.load()
    pts = [(x, 0) for x in range(0, w, 4)] + [(x, h - 1) for x in range(0, w, 4)] + [(0, y) for y in range(0, h, 4)] + [(w - 1, y) for y in range(0, h, 4)]
    white = sum(1 for p in pts if px[p][3] > 200 and sum(px[p][:3]) > 720)
    return white > 0.6 * len(pts)


def clear(im):
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    while q:
        x, y = q.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        far = 765 - r - g - b  # 0 = pure white
        if a < 20 or far < 60:  # background: clear and keep spreading
            px[x, y] = (r, g, b, 0)
            if x > 0: q.append((x - 1, y))
            if x < w - 1: q.append((x + 1, y))
            if y > 0: q.append((x, y - 1))
            if y < h - 1: q.append((x, y + 1))
        elif far < 160:  # anti-aliased rim: fade
            px[x, y] = (r, g, b, round(a * (far - 60) / 100))
    return im


def square(im):
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    s = SIZE / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = {}
    for f in sorted(os.listdir(os.path.join(ROOT, 'web', 'data'))):
        if f == 'index.json' or not f.endswith('.json'):
            continue
        for t in json.load(open(os.path.join(ROOT, 'web', 'data', f)))['teams']:
            ids[t['id']] = t['n']
    cleared, missing = [], []
    for tid, name in sorted(ids.items()):
        for variant, suffix in (('500-dark', '-d'), ('500', '')):
            path = os.path.join(OUT, f'{tid}{suffix}.png')
            if os.path.exists(path) and not FORCE:
                continue
            im = fetch(f'https://a.espncdn.com/i/teamlogos/soccer/{variant}/{tid}.png')
            if im is None and variant == '500-dark':
                im = fetch(f'https://a.espncdn.com/i/teamlogos/soccer/500/{tid}.png')
            if im is None:
                missing.append(name)
                continue
            if white_square(im):
                im = clear(im)
                cleared.append(f'{name}{suffix}')
            square(im).save(path, optimize=True)
    print(f'{len(ids)} clubs; cleared white squares: {", ".join(cleared) or "none"}; missing: {", ".join(sorted(set(missing))) or "none"}')


if __name__ == '__main__':
    main()
