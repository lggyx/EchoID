"""
Add PowerPoint "Morph" transitions to the deck — the OOXML equivalent of
Keynote's Magic Move. Shapes with the same name across two adjacent slides
are smoothly interpolated (position, size, opacity, rotation).

We assign persistent, unique names to key recurring elements so they carry
across slides:

    !!bg          full-slide background rect (always shape 0)
    !!pill        the top badge / role-tag rounded rectangle
    !!pillText    text label on top of the pill
    !!footerL     bottom-left footer text
    !!footerR     bottom-right page-number footer text
    !!heroTitle   the biggest text block on the slide (title)

Everything else gets a unique name so morph doesn't accidentally interpolate
random pairs.

Slide transition is emitted as an mc:AlternateContent block containing
`p14:morph` with an `p:fade` fallback for older PowerPoints.
"""
from __future__ import annotations

import copy
import re
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.util import Emu

SRC = Path("/Users/ariakage/Downloads/oc1/docs/deck/EchoID-roadshow.pptx")
DST = Path("/Users/ariakage/Downloads/oc1/docs/deck/EchoID-roadshow-v3.pptx")

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "p14": "http://schemas.microsoft.com/office/powerpoint/2010/main",
}


def q(prefix: str, local: str) -> str:
    return f"{{{NS[prefix]}}}{local}"


# ---------- shape classification ----------

# 16:9 native size in EMU: 12192000 × 6858000
SLIDE_W_EMU = 12192000
SLIDE_H_EMU = 6858000


def get_shape_bbox(sp_el):
    """Return (x, y, cx, cy) in EMU, or None if no xfrm."""
    xfrm = sp_el.find(f".//{q('a','xfrm')}")
    if xfrm is None:
        return None
    off = xfrm.find(q("a", "off"))
    ext = xfrm.find(q("a", "ext"))
    if off is None or ext is None:
        return None
    return (
        int(off.get("x", 0)),
        int(off.get("y", 0)),
        int(ext.get("cx", 0)),
        int(ext.get("cy", 0)),
    )


def get_text(sp_el) -> str:
    """Concatenated text content of the shape."""
    # python-pptx wraps its own xpath; use a plain iteration to stay compatible.
    parts: list[str] = []
    for t in sp_el.iter(q("a", "t")):
        if t.text:
            parts.append(t.text)
    return "".join(parts).strip()


def get_shape_kind(sp_el) -> str:
    """Return 'rect' / 'roundrect' / 'oval' / 'textbox' / 'pic' / 'other'."""
    tag = etree.QName(sp_el).localname
    if tag == "pic":
        return "pic"
    prst = sp_el.find(f".//{q('a','prstGeom')}")
    if prst is not None:
        p = prst.get("prst")
        if p == "roundRect":
            return "roundrect"
        if p == "ellipse":
            return "oval"
        if p == "rect":
            return "rect"
        return f"other:{p}"
    # Check for textbox (a:xfrm no prstGeom = usually text box, or has txBox attr)
    return "textbox"


def find_cNvPr(sp_el):
    """Return the cNvPr element, whichever wrapper contains it."""
    return sp_el.find(f".//{q('p','cNvPr')}")


def set_name(sp_el, name: str):
    cn = find_cNvPr(sp_el)
    if cn is not None:
        cn.set("name", name)


# ---------- per-slide tagging ----------

def tag_slide(slide_el, slide_idx: int, unique_seed: int):
    """Walk shapes in z-order and assign names.

    Persistent names for elements we want to Magic-Move across slides.
    Everything else gets a unique-per-slide name to prevent bad matches.
    """
    spTree = slide_el.find(f"{q('p','cSld')}/{q('p','spTree')}")
    shapes = [
        el
        for el in spTree
        if etree.QName(el).localname in ("sp", "pic")
    ]

    # First pass: identify roles.
    roles: list[str | None] = [None] * len(shapes)

    # Background: first rect covering the whole slide (allow 1% edge tolerance).
    for i, sh in enumerate(shapes):
        kind = get_shape_kind(sh)
        bbox = get_shape_bbox(sh)
        if kind == "rect" and bbox and bbox[0] <= 1_000 and bbox[1] <= 1_000 \
                and bbox[2] >= SLIDE_W_EMU - 100_000 and bbox[3] >= SLIDE_H_EMU - 100_000:
            roles[i] = "!!bg"
            break

    # Footer text: the two textboxes at y >= 6.35" (Inches(7.05) → 6.35M EMU).
    # We only tag the first two candidates and keep left/right by x.
    # Note: python-pptx creates textboxes with a `prstGeom prst="rect"`, so we
    # treat both "textbox" and "rect" as candidate text containers here.
    footer_ys = 6_350_000  # ~6.35" in EMU
    footers = [
        (i, get_shape_bbox(sh)[0])
        for i, sh in enumerate(shapes)
        if roles[i] is None
        and get_shape_kind(sh) in ("textbox", "rect")
        and get_shape_bbox(sh)
        and get_shape_bbox(sh)[1] >= footer_ys
        # Only actual text-bearing rects, not the background.
        and get_text(sh)
    ]
    footers.sort(key=lambda p: p[1])  # by x
    if len(footers) >= 1:
        roles[footers[0][0]] = "!!footerL"
    if len(footers) >= 2:
        roles[footers[1][0]] = "!!footerR"

    # Pill: the first rounded rectangle from the top of the slide (small height).
    pill_candidates = []
    for i, sh in enumerate(shapes):
        if roles[i] is not None:
            continue
        if get_shape_kind(sh) != "roundrect":
            continue
        bbox = get_shape_bbox(sh)
        if not bbox:
            continue
        _, y, _, cy = bbox
        # Small height pill.
        if cy <= 700_000 and y <= 3_500_000:  # ≤ 0.76" tall, in top ~3.8"
            pill_candidates.append((y, i))
    pill_candidates.sort()
    if pill_candidates:
        roles[pill_candidates[0][1]] = "!!pill"

    # Hero title: the tallest+largest text box that is NOT a footer, NOT already tagged.
    # Heuristic: pick text box with the highest fontSize across its runs.
    def max_font_size(sp_el):
        sizes: list[int] = []
        for rpr in sp_el.iter(q("a", "rPr")):
            sz = rpr.get("sz")
            if sz and sz.isdigit():
                sizes.append(int(sz))
        return max(sizes) if sizes else 0

    hero_candidates = []
    for i, sh in enumerate(shapes):
        if roles[i] is not None:
            continue
        # Text can live in shapes tagged as "textbox" OR plain "rect" — both
        # can carry an a:txBody. Skip anything without a text body.
        if get_shape_kind(sh) not in ("textbox", "rect"):
            continue
        if not get_text(sh):
            continue
        ms = max_font_size(sh)
        if ms >= 2400:  # ≥ 24pt — big enough that it reads as a headline
            hero_candidates.append((ms, i))
    hero_candidates.sort(reverse=True)
    if hero_candidates:
        roles[hero_candidates[0][1]] = "!!heroTitle"
        # Second-largest becomes hero subtitle — also persistent so it slides too.
        if len(hero_candidates) >= 2 and hero_candidates[1][0] >= 3200:
            roles[hero_candidates[1][1]] = "!!heroSubtitle"

    # Apply.
    unique_counter = 0
    for i, sh in enumerate(shapes):
        role = roles[i]
        if role:
            set_name(sh, role)
        else:
            unique_counter += 1
            # unique-per-shape to ensure morph does NOT try to pair them.
            set_name(sh, f"~s{slide_idx:02d}_{unique_counter:03d}_{unique_seed:04d}")

    return roles


# ---------- transition rewriting ----------

MORPH_XML = """
<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14">
    <p:transition xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" spd="med">
      <p14:morph scaleType="whole"/>
    </p:transition>
  </mc:Choice>
  <mc:Fallback>
    <p:transition xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" spd="med">
      <p:fade/>
    </p:transition>
  </mc:Fallback>
</mc:AlternateContent>
""".strip()


def set_morph_transition(slide_el):
    """Replace any existing transition with morph (via mc:AlternateContent)."""
    for tr in slide_el.findall(q("p", "transition")):
        slide_el.remove(tr)
    for ac in slide_el.findall(q("mc", "AlternateContent")):
        # only remove ones that wrap a transition
        if ac.xpath(".//p:transition", namespaces=NS):
            slide_el.remove(ac)

    # Insert after clrMapOvr or cSld.
    anchor = slide_el.find(q("p", "clrMapOvr"))
    if anchor is None:
        anchor = slide_el.find(q("p", "cSld"))
    if anchor is None:
        return
    new_el = etree.fromstring(MORPH_XML)
    anchor.addnext(new_el)


def strip_timing(slide_el):
    """Remove any timing/animations left over from the v2 pass — morph handles
    entrance implicitly."""
    for tm in slide_el.findall(q("p", "timing")):
        slide_el.remove(tm)


# ---------- entry point ----------

def main():
    if not SRC.exists():
        raise SystemExit(f"source not found: {SRC}")
    prs = Presentation(str(SRC))

    role_report: list[tuple[int, dict[str, int]]] = []
    for idx, slide in enumerate(prs.slides, 1):
        slide_el = slide.element
        strip_timing(slide_el)
        roles = tag_slide(slide_el, slide_idx=idx, unique_seed=idx * 37)
        set_morph_transition(slide_el)
        # Count roles for reporting.
        counts: dict[str, int] = {}
        for r in roles:
            if r:
                counts[r] = counts.get(r, 0) + 1
        role_report.append((idx, counts))

    prs.save(str(DST))

    print(f"wrote {DST}")
    print("\nrole tagging per slide:")
    print("  slide | bg pill hero sub footerL footerR")
    for idx, counts in role_report:
        line = "  {:>5} | {:>2}  {:>4} {:>4} {:>3}  {:>7} {:>7}".format(
            idx,
            counts.get("!!bg", 0),
            counts.get("!!pill", 0),
            counts.get("!!heroTitle", 0),
            counts.get("!!heroSubtitle", 0),
            counts.get("!!footerL", 0),
            counts.get("!!footerR", 0),
        )
        print(line)


if __name__ == "__main__":
    main()
