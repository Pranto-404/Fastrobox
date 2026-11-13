#!/usr/bin/env python3
"""Build a level write-up PDF from docs/writeups/<LEVEL>/{template.html, values.json, screens/}.

Usage:  python3 tools/writeup/build.py L01
Output: docs/writeups/<LEVEL>/build/<TeamID>_<LEVEL>_writeup.{html,pdf}

- $name placeholders in the template are filled from values.json.
  An empty value prints as a yellow "____", so a missing measurement is easy to spot.
- $img_<key> is replaced by the screenshot named in values.json "screens", embedded as base64.
  A missing screenshot prints as a dashed placeholder box.
- Diagrams in docs/img/ can be embedded with $docimg_<filename-without-.png>.
"""
import base64
import html
import json
import pathlib
import string
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def data_uri(path: pathlib.Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def main(level: str) -> None:
    folder = ROOT / "docs" / "writeups" / level
    values = json.loads((folder / "values.json").read_text())
    subs = {}
    for key, val in values.items():
        if key.startswith("_") or isinstance(val, dict):
            continue
        subs[key] = html.escape(str(val)) if str(val).strip() else '<span class="fill">____</span>'
    for key, name in values.get("screens", {}).items():
        p = folder / "screens" / name
        subs["img_" + key] = (
            f'<img class="shot" src="{data_uri(p)}" alt="{key}">'
            if p.exists()
            else f'<div class="shot missing">Screenshot missing: screens/{html.escape(name)}</div>'
        )
    for p in (ROOT / "docs" / "img").glob("*.png"):
        subs["docimg_" + p.stem] = data_uri(p)

    page = string.Template((folder / "template.html").read_text()).safe_substitute(subs)
    team = values.get("team_id") or "TXX"
    out = folder / "build"
    out.mkdir(exist_ok=True)
    html_path = out / f"{team}_{level}_writeup.html"
    pdf_path = out / f"{team}_{level}_writeup.pdf"
    html_path.write_text(page)
    subprocess.run(["node", str(ROOT / "tools" / "writeup" / "pdf.js"), str(html_path), str(pdf_path)], check=True)
    missing = [k for k, v in values.items() if not k.startswith("_") and isinstance(v, str) and not v.strip()]
    if missing:
        print("Still empty in values.json:", ", ".join(missing))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "L01")
