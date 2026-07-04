"""
Add slide transitions + auto-play fade-in animations to the roadshow deck.

python-pptx has no animation API, so we edit the underlying XML directly:
- Insert `<p:transition><p:fade/></p:transition>` after `<p:cSld>`.
- Append a `<p:timing>` block that fades every shape on the slide in sequence.

Play behavior: first shape fades in on slide load (withEffect + short delay),
subsequent shapes chain with `afterEffect`. Presenter can still click through
because `<p:seq>` is still a click-progression main sequence.
"""
from __future__ import annotations

from pathlib import Path

from lxml import etree
from pptx import Presentation

SRC = Path("/Users/ariakage/Downloads/oc1/docs/deck/EchoID-roadshow.pptx")
DST = Path("/Users/ariakage/Downloads/oc1/docs/deck/EchoID-roadshow-v2.pptx")

NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"


def p(tag: str) -> str:
    return f"{{{NS_P}}}{tag}"


def add_transition(slide_el) -> None:
    """Insert <p:transition><p:fade/></p:transition> after <p:cSld>/<p:clrMapOvr>.
    ECMA-376 order: cSld, clrMapOvr, transition, timing."""
    # Find the insertion anchor: after clrMapOvr if present, else after cSld.
    anchor = slide_el.find(p("clrMapOvr"))
    if anchor is None:
        anchor = slide_el.find(p("cSld"))
    if anchor is None:
        return
    # If a transition already exists, replace it.
    existing = slide_el.find(p("transition"))
    if existing is not None:
        slide_el.remove(existing)
    tr = etree.SubElement(anchor.getparent(), p("transition"))
    tr.set("spd", "med")
    etree.SubElement(tr, p("fade"))
    # Move tr to the correct position (SubElement appends).
    slide_el.remove(tr)
    anchor.addnext(tr)


def iter_animatable_shapes(slide_el):
    """Yield shape ids in z-order (sp + pic only)."""
    spTree = slide_el.find(f"{p('cSld')}/{p('spTree')}")
    for child in spTree:
        tag = etree.QName(child).localname
        if tag == "sp":
            cNvPr = child.find(f"./{p('nvSpPr')}/{p('cNvPr')}")
        elif tag == "pic":
            cNvPr = child.find(f"./{p('nvPicPr')}/{p('cNvPr')}")
        else:
            continue
        if cNvPr is None:
            continue
        yield cNvPr.get("id")


def make_fade_par(sp_id: str, cn_start: int, first: bool, delay_ms: int, duration_ms: int = 500):
    """Build a fade-in <p:par> for a single shape.

    first=True → nodeType=withEffect (kicks off with the sequence root)
    first=False → nodeType=afterEffect (chains after the previous par)
    """
    node_type = "withEffect" if first else "afterEffect"
    cn = cn_start
    xml = f"""
<p:par xmlns:p="{NS_P}">
  <p:cTn id="{cn}" fill="hold">
    <p:stCondLst><p:cond delay="{delay_ms}"/></p:stCondLst>
    <p:childTnLst>
      <p:par>
        <p:cTn id="{cn + 1}" fill="hold">
          <p:stCondLst><p:cond delay="0"/></p:stCondLst>
          <p:childTnLst>
            <p:par>
              <p:cTn id="{cn + 2}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="{node_type}">
                <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                <p:childTnLst>
                  <p:set>
                    <p:cBhvr>
                      <p:cTn id="{cn + 3}" dur="1" fill="hold">
                        <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                      </p:cTn>
                      <p:tgtEl><p:spTgt spid="{sp_id}"/></p:tgtEl>
                      <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
                    </p:cBhvr>
                    <p:to><p:strVal val="visible"/></p:to>
                  </p:set>
                  <p:anim calcmode="lin" valueType="num">
                    <p:cBhvr>
                      <p:cTn id="{cn + 4}" dur="{duration_ms}" fill="hold"/>
                      <p:tgtEl><p:spTgt spid="{sp_id}"/></p:tgtEl>
                      <p:attrNameLst><p:attrName>style.opacity</p:attrName></p:attrNameLst>
                    </p:cBhvr>
                    <p:tavLst>
                      <p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav>
                      <p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav>
                    </p:tavLst>
                  </p:anim>
                </p:childTnLst>
              </p:cTn>
            </p:par>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:childTnLst>
  </p:cTn>
</p:par>
""".strip()
    return etree.fromstring(xml), cn + 5


def build_timing(slide_el):
    shape_ids = list(iter_animatable_shapes(slide_el))
    if not shape_ids:
        return None
    scaffold = f"""
<p:timing xmlns:p="{NS_P}">
  <p:tnLst>
    <p:par>
      <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
        <p:childTnLst>
          <p:seq concurrent="1" nextAc="seek">
            <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
              <p:childTnLst/>
            </p:cTn>
            <p:prevCondLst>
              <p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond>
            </p:prevCondLst>
            <p:nextCondLst>
              <p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond>
            </p:nextCondLst>
          </p:seq>
        </p:childTnLst>
      </p:cTn>
    </p:par>
  </p:tnLst>
</p:timing>
""".strip()
    timing = etree.fromstring(scaffold)
    seq_ctn = timing.find(f".//{p('seq')}/{p('cTn')}")
    childTnLst = seq_ctn.find(p("childTnLst"))
    cn = 3
    # Stagger: first shape appears 300ms after slide start; each subsequent
    # shape chains 200ms after the previous. Small enough to feel snappy on a
    # ~20-second slide, big enough to read as intentional.
    for i, sp_id in enumerate(shape_ids):
        first = i == 0
        delay = 300 if first else 200
        par, cn = make_fade_par(sp_id, cn, first=first, delay_ms=delay)
        childTnLst.append(par)
    return timing


def process(slide) -> int:
    slide_el = slide.element
    add_transition(slide_el)
    # Remove any prior timing to avoid duplication if run twice.
    existing = slide_el.find(p("timing"))
    if existing is not None:
        slide_el.remove(existing)
    timing = build_timing(slide_el)
    if timing is None:
        return 0
    slide_el.append(timing)
    return len(list(timing.iterfind(f".//{p('spTgt')}"))) // 2  # each shape has 2 spTgt refs


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"source not found: {SRC}")
    prs = Presentation(str(SRC))
    total = 0
    for i, slide in enumerate(prs.slides, 1):
        n = process(slide)
        print(f"  slide {i}: {n} shape animations")
        total += n
    prs.save(str(DST))
    print(f"wrote {DST}  ({total} total animations)")


if __name__ == "__main__":
    main()
