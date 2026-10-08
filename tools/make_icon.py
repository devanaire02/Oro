"""Draws the Ọrọ̀ app icon: an ivory O (Charis SIL Bold) on a forest tile, with its Yoruba under-dot as a small brass coin.
   Writes launcher/oro.icns + launcher/icon.png (Mac), assets/web-icons/icon-*.png (iPhone Home Screen, web manifest)
   and assets/mark.svg (favicon and the sidebar tile; build.py inlines it)."""
import struct, pathlib, asyncio
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FOREST, FOREST_TOP, FOREST_BOTTOM = '#0B5D3B', '#0D6743', '#0A5334'
IVORY, BRASS, BRASS_RING = '#F6F3EA', '#C9A050', '#B8893A'

def glyph_O():
    font = TTFont(ROOT / 'assets' / 'fonts' / 'charis-sil-latin-700-normal.woff2')
    gs = font.getGlyphSet(); name = font.getBestCmap()[ord('O')]
    pen = SVGPathPen(gs, ntos=lambda v: ('%.0f' % v)); gs[name].draw(pen)
    bp = BoundsPen(gs); gs[name].draw(bp)
    return pen.getCommands(), bp.bounds

O_PATH, (X0, Y0, X1, Y1) = glyph_O()

def mark(x, y, size, o_h=.46, dot=.10, gap=.023):
    """The O and its brass dot, centred in the square (x, y, size). o_h, dot and gap are fractions of size."""
    h = o_h * size; s = h / (Y1 - Y0); d = dot * size; g = gap * size
    top = y + (size - (h + g + d)) / 2
    tx = x + size / 2 - (X0 + X1) / 2 * s; ty = top + Y1 * s
    cy = top + h + g + d / 2
    return (f"<path d='{O_PATH}' fill='{IVORY}' transform='translate({tx:.2f} {ty:.2f}) scale({s:.5f} {-s:.5f})'/>"
            f"<circle cx='{x + size / 2:.2f}' cy='{cy:.2f}' r='{d / 2:.2f}' fill='{BRASS}'/>")

def icon_svg(size=1024):
    return f"""<svg xmlns='http://www.w3.org/2000/svg' width='{size}' height='{size}' viewBox='0 0 1024 1024'>
<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='{FOREST_TOP}'/><stop offset='1' stop-color='{FOREST_BOTTOM}'/></linearGradient></defs>
<rect x='100' y='100' width='824' height='824' rx='185' fill='url(#g)'/>
<rect x='106' y='106' width='812' height='812' rx='179' fill='none' stroke='{BRASS_RING}' stroke-opacity='.5' stroke-width='12'/>
{mark(100, 100, 824)}
</svg>"""

def small_svg():
    """Favicon and sidebar tile: the mark grows a little and the dot gets bigger so both read at 16-22px."""
    return (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='{FOREST}'/>"
            f"<rect x='.75' y='.75' width='62.5' height='62.5' rx='13.25' fill='none' stroke='{BRASS_RING}' stroke-opacity='.55' stroke-width='1.5'/>"
            f"{mark(0, 0, 64, o_h=.5, dot=.13, gap=.03)}</svg>")

async def main():
    (ROOT / 'assets' / 'mark.svg').write_text(small_svg())
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        out = {}
        for size in (1024, 512, 256, 128, 64, 32):
            await pg.set_viewport_size({'width': size, 'height': size})
            await pg.set_content(f"<html><body style='margin:0;background:transparent'>{icon_svg(size)}</body></html>")
            out[size] = await pg.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
        # Full-bleed squares for the iPhone Home Screen and the web manifest (iOS rounds the corners itself)
        web = ROOT / 'assets' / 'web-icons'; web.mkdir(parents=True, exist_ok=True)
        for size in (180, 192, 512):
            await pg.set_viewport_size({'width': size, 'height': size})
            svg = icon_svg(size).replace("viewBox='0 0 1024 1024'", "viewBox='100 100 824 824'").replace("rx='185'", "rx='0'")
            await pg.set_content(f"<html><body style='margin:0;background:{FOREST}'>{svg}</body></html>")
            (web / f'icon-{size}.png').write_bytes(await pg.screenshot(clip={'x': 0, 'y': 0, 'width': size, 'height': size}))
        await b.close()
    entries = [(b'ic10', out[1024]), (b'ic09', out[512]), (b'ic08', out[256]), (b'ic07', out[128]), (b'ic12', out[64]), (b'ic11', out[32])]
    body = b''.join(t + struct.pack('>I', len(d) + 8) + d for t, d in entries)
    (ROOT / 'launcher' / 'oro.icns').write_bytes(b'icns' + struct.pack('>I', len(body) + 8) + body)
    (ROOT / 'launcher' / 'icon.png').write_bytes(out[256])
    print('icon written')

if __name__ == '__main__':
    asyncio.run(main())
