#!/usr/bin/env python3
"""Build Keel.
   dist/Keel.html          single self-contained file (portable)
   mac/Keel/               multi-file install for the Mac: Keel.html + app/ (css, js, vendor) + README
"""
import pathlib, re, shutil

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
(root / "dist" / "Keel.html").write_text(single)

# ---- Mac folder ----
out = root / "mac" / "Keel"
app = out / "app"
if app.exists(): shutil.rmtree(app)
(app / "vendor").mkdir(parents=True)
(app / "keel.css").write_text(css)
(app / "keel.js").write_text(js)
(app / "vendor" / "pdf.min.js").write_text(pdfjs)
(app / "vendor" / "pdf.worker.min.js").write_text(worker)
multi = (html.replace("<!--__STYLES__-->", '<link rel="stylesheet" href="app/keel.css">')
             .replace("<!--__SCRIPTS__-->", '<script src="app/keel.js"></script>'))
(out / "Keel.html").write_text(multi)
for f in ["README.md"]:
    if (root / f).exists(): shutil.copy(root / f, out / f)
print(f"single: {(root/'dist'/'Keel.html').stat().st_size/1024:.0f} KB; mac app: {sum(p.stat().st_size for p in app.rglob('*') if p.is_file())/1024:.0f} KB, js {len(js)//1024} KB")
