#!/usr/bin/env python3
"""Inline CSS, app JS and the PDF.js vendor bundle into one self-contained HTML file."""
import pathlib, re, sys

root = pathlib.Path(__file__).parent
src = root / "src"
html = (src / "index.html").read_text()
css = (src / "styles.css").read_text()
js = "\n".join(p.read_text() for p in sorted((src / "js").glob("*.js")))
vend = root / "vendor" / "package" / "build"
pdfjs = (vend / "pdf.min.js").read_text()
worker = (vend / "pdf.worker.min.js").read_text()

def safe(s):
    # nothing may close the surrounding <script> element early
    return s.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")

for name, s in [("css", css), ("js", js), ("pdfjs", pdfjs), ("worker", worker)]:
    if re.search(r"</script", s, re.I) and name in ("js",):
        print(f"warning: {name} contains </script; escaping", file=sys.stderr)

out = (html.replace("/*__CSS__*/", css)
           .replace("/*__JS__*/", safe(js))
           .replace("/*__PDFJS__*/", safe(pdfjs))
           .replace("/*__PDFWORKER__*/", safe(worker)))
dest = root / "dist" / "Keel.html"
dest.write_text(out)
print(f"wrote {dest} ({dest.stat().st_size/1024:.0f} KB)")
