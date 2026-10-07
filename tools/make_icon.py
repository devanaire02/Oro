"""Draws the Ọrọ̀ app icon (a cowrie shell on the ledger tile) and writes launcher/oro.icns + launcher/icon.png."""
import struct, pathlib
import asyncio, math
from playwright.async_api import async_playwright

def lip_teeth(n=15):
    out = []
    for side in (-1, 1):
        for i in range(n):
            t = (i + 0.6) / (n + 0.2)
            y = 236 + (808 - 236) * t
            hw = 15 * math.sin(math.pi * t) ** 0.8 + 2.5   # slit half-width at y
            x0 = 560 + side * (hw - 2)
            x1 = 560 + side * (hw + 10 + 4 * math.sin(math.pi * t))
            out.append(f"<line x1='{x0:.1f}' y1='{y:.1f}' x2='{x1:.1f}' y2='{y + 1.5:.1f}'/>")
    return ''.join(out)

BODY = "M562 196 C 735 196 800 352 800 522 C 800 702 702 842 562 842 C 422 842 324 702 324 522 C 324 352 389 196 562 196 Z"
SHELL = f"""
<g transform='translate(578 520) scale(.8) rotate(-14) translate(-562 -519)'>
  <ellipse cx='585' cy='560' rx='232' ry='318' fill='#0B1F3D' opacity='.4' filter='url(#blur)'/>
  <path d='{BODY}' fill='url(#shell)'/>
  <path d='{BODY}' fill='none' stroke='#C9B78F' stroke-opacity='.55' stroke-width='5'/>
  <path d='M560 214 C 599 360 599 690 556 826 C 529 690 527 360 560 214 Z' fill='#C9B78F' opacity='.55'/>
  <path d='M560 226 C 593 360 593 690 556 814 C 534 690 532 360 560 226 Z' fill='#173866'/>
  <g stroke='#7D6A45' stroke-width='9' stroke-linecap='round' opacity='.45'>{lip_teeth()}</g>
  <ellipse cx='455' cy='370' rx='60' ry='118' fill='#fff' opacity='.6' transform='rotate(16 455 370)' filter='url(#soft)'/>
</g>"""

def icon_svg(size=1024):
    return f"""<svg xmlns='http://www.w3.org/2000/svg' width='{size}' height='{size}' viewBox='0 0 1024 1024'>
<defs>
 <linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3266AC'/><stop offset='1' stop-color='#173866'/></linearGradient>
 <radialGradient id='shell' cx='.38' cy='.3' r='.85'><stop offset='0' stop-color='#FFFDF6'/><stop offset='.55' stop-color='#F3EBD8'/><stop offset='1' stop-color='#D9CBAA'/></radialGradient>
 <filter id='blur' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='22'/></filter>
 <filter id='soft'><feGaussianBlur stdDeviation='18'/></filter>
 <clipPath id='c'><rect x='100' y='100' width='824' height='824' rx='185'/></clipPath>
</defs>
<rect x='100' y='100' width='824' height='824' rx='185' fill='url(#g)'/>
<g clip-path='url(#c)' stroke='#fff' stroke-opacity='.09' stroke-width='6'>
<line x1='100' y1='300' x2='924' y2='300'/><line x1='100' y1='420' x2='924' y2='420'/><line x1='100' y1='540' x2='924' y2='540'/><line x1='100' y1='660' x2='924' y2='660'/><line x1='100' y1='780' x2='924' y2='780'/></g>
<g clip-path='url(#c)'><rect x='218' y='100' width='7' height='824' fill='#E0705C' opacity='.85'/><rect x='236' y='100' width='7' height='824' fill='#E0705C' opacity='.85'/>
{SHELL}</g>
</svg>"""

# small mark: used for favicon and the sidebar brand tile (white shell on the ink tile)
SMALL = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
         "<g transform='rotate(-14 32 32)'>"
         "<path d='M32 11C42.5 11 46.5 20.5 46.5 31.5C46.5 43 40.5 52.5 32 52.5C23.5 52.5 17.5 43 17.5 31.5C17.5 20.5 21.5 11 32 11Z' fill='#fff'/>"
         "<path d='M32 14.5C34.8 23 34.8 40.5 31.7 49.5C29.8 40.5 29.6 23 32 14.5Z' fill='#24508C'/>"
         "</g></svg>")


async def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        out = {}
        for size in (1024, 512, 256, 128, 64, 32):
            await pg.set_viewport_size({'width': size, 'height': size})
            await pg.set_content(f"<html><body style='margin:0;background:transparent'>{icon_svg(size)}</body></html>")
            out[size] = await pg.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
        await b.close()
    entries = [(b'ic10', out[1024]), (b'ic09', out[512]), (b'ic08', out[256]), (b'ic07', out[128]), (b'ic12', out[64]), (b'ic11', out[32])]
    body = b''.join(t + struct.pack('>I', len(d) + 8) + d for t, d in entries)
    (root / 'launcher' / 'oro.icns').write_bytes(b'icns' + struct.pack('>I', len(body) + 8) + body)
    (root / 'launcher' / 'icon.png').write_bytes(out[256])
    print('icon written')

if __name__ == '__main__':
    asyncio.run(main())
