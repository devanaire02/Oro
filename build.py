#!/usr/bin/env python3
"""Build Ọrọ̀.
   dist/Oro.html             single self-contained file (portable)
   mac/Ọrọ̀/                  the Mac install: Ọrọ̀.html + Ọrọ̀.app + app/ (css, js, vendor, icon) + README
"""
import os, pathlib, shutil, unicodedata

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

size = sum(p.stat().st_size for p in app.rglob('*') if p.is_file()) / 1024
print(f"single: {(root/'dist'/'Oro.html').stat().st_size/1024:.0f} KB; mac app: {size:.0f} KB, js {len(js)//1024} KB")
