#!/usr/bin/env python3
"""Build Ọrọ̀.
   dist/Oro.html             single self-contained file (portable)
   mac/Ọrọ̀/                  the Mac install: Ọrọ̀.html + Ọrọ̀.app + app/ (css, js, vendor, icon) + README
   docs/                     the hosted copy for iPhone and iPad (GitHub Pages serves this folder)
"""
import base64, hashlib, json, os, pathlib, re, shutil, unicodedata, urllib.parse

NAME = unicodedata.normalize('NFC', 'Ọrọ̀')   # Ọrọ̀ (file names are written in NFC)
SLUG = 'oro'

root = pathlib.Path(__file__).parent
src = root / "src"
html = (src / "index.html").read_text()
css = (src / "styles.css").read_text()
js_files = sorted((src / "js").glob("*.js"))
js = "\n".join(p.read_text() for p in js_files)
vend = root / "vendor" / "package" / "build"
pdfjs = (vend / "pdf.min.js").read_text()
worker = (vend / "pdf.worker.min.js").read_text()
safe = lambda s: s.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")

# Inline the theme fonts (assets/fonts) and the Ọ mark (assets/mark.svg, drawn by tools/make_icon.py): nothing is fetched at run time
mark = "data:image/svg+xml," + urllib.parse.quote((root / "assets" / "mark.svg").read_text())
font = lambda m: "data:font/woff2;base64," + base64.b64encode((root / "assets" / "fonts" / f"{m.group(1)}.woff2").read_bytes()).decode()
css = re.sub(r"__FONT_([a-z0-9-]+)__", font, css).replace("__MARK_SVG__", mark)
html = html.replace("__MARK_SVG__", mark)
assert "__" + "FONT" not in css and "__MARK" not in css + html

# ---- single file ----
single = (html.replace("<!--__STYLES__-->", f"<style>\n{css}\n</style>")
              .replace("<!--__SCRIPTS__-->",
                       f'<script type="text/plain" id="vendor-pdfworker">{safe(worker)}</script>\n'
                       f'<script type="text/plain" id="vendor-pdfjs">{safe(pdfjs)}</script>\n'
                       f'<script>\n{safe(js)}\n</script>'))
(root / "dist").mkdir(exist_ok=True)
(root / "dist" / "Oro.html").write_text(single)

# ---- Mac folder ----
out = root / "mac" / NAME
if out.exists(): shutil.rmtree(out)
app = out / "app"
(app / "vendor").mkdir(parents=True)
(app / f"{SLUG}.css").write_text(css)
(app / f"{SLUG}.js").write_text(js)
(app / "vendor" / "pdf.min.js").write_text(pdfjs)
(app / "vendor" / "pdf.worker.min.js").write_text(worker)
shutil.copy(root / "launcher" / "icon.png", app / "icon.png")
multi = (html.replace("<!--__STYLES__-->", f'<link rel="stylesheet" href="app/{SLUG}.css">')
             .replace("<!--__SCRIPTS__-->", f'<script src="app/{SLUG}.js"></script>'))
(out / f"{NAME}.html").write_text(multi)
shutil.copy(root / "README.md", out / "README.md")

# Ọrọ̀.app: a tiny launcher bundle that opens Ọrọ̀.html in its own browser window
contents = out / f"{NAME}.app" / "Contents"
(contents / "MacOS").mkdir(parents=True)
(contents / "Resources").mkdir()
shutil.copy(root / "launcher" / "Info.plist", contents / "Info.plist")
shutil.copy(root / "launcher" / "Oro", contents / "MacOS" / "Oro")
os.chmod(contents / "MacOS" / "Oro", 0o755)
shutil.copy(root / "launcher" / "oro.icns", contents / "Resources" / "oro.icns")

# ---- hosted copy for the iPhone Home Screen (GitHub Pages: main branch, /docs) ----
web = root / "docs"
if web.exists(): shutil.rmtree(web)
(web / "app" / "vendor").mkdir(parents=True)
(web / "icons").mkdir()
(web / "app" / f"{SLUG}.css").write_text(css)
(web / "app" / f"{SLUG}.js").write_text(js)
(web / "app" / "vendor" / "pdf.min.js").write_text(pdfjs)
(web / "app" / "vendor" / "pdf.worker.min.js").write_text(worker)
for png in (root / "assets" / "web-icons").glob("*.png"): shutil.copy(png, web / "icons" / png.name)
csp_mac = html.split('content="default-src', 1)[1].split('"', 1)[0]
csp_web = ("'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
           "font-src data:; connect-src 'none'; manifest-src 'self'; worker-src 'self'; form-action 'none'; base-uri 'none'")
head = (f'<meta name="robots" content="noindex, nofollow">\n'
        f'<link rel="manifest" href="manifest.webmanifest">\n'
        f'<link rel="apple-touch-icon" href="icons/icon-180.png">\n'
        f'<meta name="apple-mobile-web-app-capable" content="yes">\n'
        f'<meta name="mobile-web-app-capable" content="yes">\n'
        f'<meta name="apple-mobile-web-app-title" content="{NAME}">\n'
        f'<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
        f'<meta name="theme-color" content="#F6F3EA" media="(prefers-color-scheme: light)">\n'
        f'<meta name="theme-color" content="#0C1713" media="(prefers-color-scheme: dark)">\n')
page = (html.replace('content="default-src' + csp_mac + '"', 'content="default-src ' + csp_web + '"')
            .replace("<!--__STYLES__-->", head + f'<link rel="stylesheet" href="app/{SLUG}.css">')
            .replace("<!--__SCRIPTS__-->", f'<script src="app/{SLUG}.js"></script>'))
assert csp_web in page
(web / "index.html").write_text(page)
(web / "manifest.webmanifest").write_text(json.dumps({
    "name": NAME, "short_name": NAME, "description": "Ọrọ̀ is Yoruba for wealth. Know your wealth. Keep it close.",
    "start_url": "./", "scope": "./", "display": "standalone", "background_color": "#F6F3EA", "theme_color": "#0B5D3B",
    "icons": [{"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"}]}, ensure_ascii=False, indent=1))
files = ["./", "index.html", f"app/{SLUG}.css", f"app/{SLUG}.js", "app/vendor/pdf.min.js", "app/vendor/pdf.worker.min.js",
         "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"]
version = hashlib.sha256((page + css + js).encode()).hexdigest()[:12]
(web / "sw.js").write_text(f"""/* Ọrọ̀ offline cache: always tries the network first, so updates show up right away; falls back to the cached copy offline. */
const CACHE = 'oro-{version}';
const FILES = {json.dumps(files)};
self.addEventListener('install', e => {{ e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', e => {{ e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {{ if (res.ok) {{ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }} return res; }})
    .catch(() => caches.match(req, {{ ignoreSearch: true }}).then(r => r || caches.match('index.html'))));
}});
""")
(web / ".nojekyll").write_text("")

size = sum(p.stat().st_size for p in app.rglob('*') if p.is_file()) / 1024
print(f"single: {(root/'dist'/'Oro.html').stat().st_size/1024:.0f} KB; mac app: {size:.0f} KB; web: {sum(p.stat().st_size for p in web.rglob('*') if p.is_file())/1024:.0f} KB; js {len(js)//1024} KB")
