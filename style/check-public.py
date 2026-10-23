#!/usr/bin/env python3
"""Fail if reference stills or retired styles leak into the public tree."""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
bad = []
for path in ROOT.rglob("*"):
    if not path.is_file():
        continue
    rel = path.relative_to(ROOT).as_posix()
    if rel.startswith(".git/"):
        continue
    if "ref-stills" in rel and path.suffix.lower() == ".png":
        bad.append(rel)
    if rel.startswith("design/references/"):
        bad.append(rel)
styles = (ROOT / "style" / "keys.js").read_text().split("BH.RETIRED", 1)[0]
for retired in ("cgi1993", "bauhaus", "pop"):
    if retired in styles:
        bad.append(f"retired key {retired} is in the rail table")
rail = (ROOT / "style" / "keys.js").read_text()
for key in ("realistic", "vangogh", "ukiyo", "blueprint", "constructivist", "ink"):
    if f'key: "{key}"' not in rail:
        bad.append(f"missing style {key}")
if bad:
    print("\n".join(bad))
    sys.exit(1)
print("public tree ok")
