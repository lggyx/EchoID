"""
EchoID hackathon roadshow deck — 3 minutes, 9 slides.

Layout: 16:9 · 1920×1080 EMU-equivalent. Uses python-pptx to draw a dark
canvas matching the app's reactbits-inspired theme, then places screenshots
with soft rounded frames.

Slides:
  1. Cover — big headline + subtitle
  2. Problem — what you can't see about yourself
  3. Solution — 20s → role card
  4. Product demo — landing page shot
  5. Product demo — record page shot
  6. Product demo — reveal moment
  7. Product demo — full card with radar
  8. Model — 6 dimensions × 12 roles (with role gallery shot)
  9. Tech / closing — stack + call to action

Timing target: ~20s per slide averages 3 min.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Emu, Inches, Pt

# ---------- constants ----------
SHOTS = Path("/tmp/echoid-deck/shots")
OUT_PATH = Path("/tmp/echoid-deck/EchoID-roadshow.pptx")

# 1920x1080
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

# theme
CANVAS = RGBColor(0x12, 0x0F, 0x17)
SURFACE = RGBColor(0x1A, 0x16, 0x22)
INK = RGBColor(0xF5, 0xF1, 0xFF)
MUTED = RGBColor(0x8B, 0x83, 0x9F)
SUBTLE = RGBColor(0x5B, 0x54, 0x70)
ACCENT = RGBColor(0xB3, 0x7C, 0xFF)
ACCENT2 = RGBColor(0x5E, 0xE7, 0xFF)
ACCENT3 = RGBColor(0xFF, 0xA1, 0xE0)

FONT_DISPLAY = "PingFang SC"       # falls back cleanly across macOS + Windows
FONT_MONO = "SF Mono"

# ---------- helpers ----------
def add_fill(shape, color: RGBColor):
    fill = shape.fill
    fill.solid()
    fill.fore_color.rgb = color
    shape.line.fill.background()


def add_solid_bg(slide, color: RGBColor):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H)
    add_fill(shape, color)
    return shape


def add_orb(slide, x, y, size, color: RGBColor, alpha=0.35):
    """Blurred colored orb — approximated with a translucent circle."""
    shape = slide.shapes.add_shape(MSO_SHAPE.OVAL, x, y, size, size)
    fill = shape.fill
    fill.solid()
    fill.fore_color.rgb = color
    shape.line.fill.background()
    # Translucency via <a:alpha> on the fill.
    from pptx.oxml.ns import qn
    from lxml import etree
    fillNode = shape.fill._xPr.find(qn("a:solidFill"))
    srgb = fillNode.find(qn("a:srgbClr"))
    alpha_el = etree.SubElement(srgb, qn("a:alpha"))
    alpha_el.set("val", str(int(alpha * 100000)))
    return shape


def add_bg_orbs(slide):
    """Three drifting orbs behind hero-type slides."""
    add_orb(slide, Emu(-1_500_000), Emu(-1_200_000), Inches(6), ACCENT, 0.25)
    add_orb(slide, Emu(8_200_000), Emu(1_400_000), Inches(5.4), ACCENT2, 0.18)
    add_orb(slide, Emu(3_800_000), Emu(4_500_000), Inches(4.6), ACCENT3, 0.12)


def add_text(
    slide,
    text: str,
    *,
    x: int, y: int, w: int, h: int,
    size: int = 32,
    color: RGBColor = INK,
    bold: bool = False,
    font: str = FONT_DISPLAY,
    align: PP_ALIGN = PP_ALIGN.LEFT,
    anchor: MSO_ANCHOR = MSO_ANCHOR.TOP,
    tracking: int | None = None,
):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    # Support multi-line text.
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if i > 0:
            p = tf.add_paragraph()
            p.alignment = align
        run = p.add_run()
        run.text = line
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        if tracking is not None:
            # spc is in 1/100 pt.
            rPr = run.font._rPr
            rPr.set("spc", str(tracking))
    return tb


def add_pill(slide, text: str, x: int, y: int, color: RGBColor = ACCENT):
    """A small rounded label like the on-app 'YOU SOUND LIKE' pill."""
    w, h = Inches(2.2), Inches(0.35)
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    shape.adjustments[0] = 0.5
    fill = shape.fill
    fill.solid()
    fill.fore_color.rgb = SURFACE
    shape.line.color.rgb = color
    shape.line.width = Pt(0.75)
    tf = shape.text_frame
    tf.margin_top = Emu(20_000)
    tf.margin_bottom = Emu(20_000)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.name = FONT_MONO
    run.font.size = Pt(9)
    run.font.color.rgb = color
    rPr = run.font._rPr
    rPr.set("spc", "300")
    return shape


def add_image_framed(slide, img_path: Path, x: int, y: int, target_w: int, target_h: int):
    """Fits an image into the box, letterboxing as needed, centered.
    Returns the actual placed rect (x, y, w, h)."""
    if not img_path.exists():
        print(f"missing: {img_path}", file=sys.stderr)
        return
    with Image.open(img_path) as im:
        iw, ih = im.size
    box_ar = target_w / target_h
    img_ar = iw / ih
    if img_ar > box_ar:
        # wider than box → letterbox top/bottom
        actual_w = target_w
        actual_h = int(target_w / img_ar)
    else:
        actual_h = target_h
        actual_w = int(target_h * img_ar)
    px = x + (target_w - actual_w) // 2
    py = y + (target_h - actual_h) // 2
    # Subtle glow behind the image.
    glow_pad = Inches(0.12)
    glow = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        px - glow_pad, py - glow_pad, actual_w + 2 * glow_pad, actual_h + 2 * glow_pad
    )
    glow.adjustments[0] = 0.03
    glow.fill.solid()
    glow.fill.fore_color.rgb = ACCENT
    glow.line.fill.background()
    # translucency
    from pptx.oxml.ns import qn
    from lxml import etree
    fillNode = glow.fill._xPr.find(qn("a:solidFill"))
    srgb = fillNode.find(qn("a:srgbClr"))
    alpha_el = etree.SubElement(srgb, qn("a:alpha"))
    alpha_el.set("val", str(20_000))
    slide.shapes.add_picture(str(img_path), px, py, width=actual_w, height=actual_h)
    return px, py, actual_w, actual_h


def add_footer(slide, page: int, total: int, title: str):
    add_text(
        slide, "ECHOID · 3-MIN ROADSHOW",
        x=Inches(0.5), y=Inches(7.05), w=Inches(6), h=Inches(0.3),
        size=9, color=SUBTLE, font=FONT_MONO, tracking=300,
    )
    add_text(
        slide, f"{page:02d} / {total:02d}   {title}",
        x=Inches(7), y=Inches(7.05), w=Inches(6), h=Inches(0.3),
        size=9, color=SUBTLE, font=FONT_MONO, align=PP_ALIGN.RIGHT, tracking=200,
    )


# ---------- slides ----------
def build(prs: Presentation):
    total = 9

    # ============ 01 COVER ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_bg_orbs(s)
    add_pill(s, "ECHOID · v0.1 MVP", Inches(5.55), Inches(1.4))
    add_text(
        s, "你说话",
        x=Inches(1), y=Inches(2.3), w=Inches(11.3), h=Inches(1.8),
        size=90, color=INK, bold=True, align=PP_ALIGN.CENTER,
    )
    add_text(
        s, "像谁?",
        x=Inches(1), y=Inches(3.4), w=Inches(11.3), h=Inches(1.8),
        size=110, color=ACCENT, bold=True, align=PP_ALIGN.CENTER,
    )
    add_text(
        s,
        "对着麦克风说 20–30 秒 · 用真实声学特征画出你的说话风格卡片",
        x=Inches(1), y=Inches(5.35), w=Inches(11.3), h=Inches(0.6),
        size=18, color=MUTED, align=PP_ALIGN.CENTER,
    )
    add_text(
        s,
        "faster-whisper · YIN pitch · 6-D scoring · 12 roles",
        x=Inches(1), y=Inches(5.95), w=Inches(11.3), h=Inches(0.4),
        size=11, color=SUBTLE, align=PP_ALIGN.CENTER, font=FONT_MONO, tracking=350,
    )
    add_footer(s, 1, total, "COVER")

    # ============ 02 PROBLEM ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_pill(s, "THE PROBLEM", Inches(0.6), Inches(0.7))
    add_text(
        s,
        "你每天都在说话,\n却从没听见\n自己怎么说。",
        x=Inches(0.6), y=Inches(1.6), w=Inches(8), h=Inches(4.5),
        size=64, color=INK, bold=True,
    )
    # Right side stats-ish list.
    stats = [
        ("2M+", "小时被听\n每人平均一年"),
        ("0", "分钟被回放\n给自己"),
        ("?", "别人听你\n的印象"),
    ]
    for i, (n, label) in enumerate(stats):
        y = Inches(1.6 + i * 1.55)
        add_text(s, n,
            x=Inches(8.8), y=y, w=Inches(2), h=Inches(1),
            size=54, color=ACCENT2, bold=True)
        add_text(s, label,
            x=Inches(10.8), y=y + Inches(0.15), w=Inches(2.4), h=Inches(1.2),
            size=13, color=MUTED, font=FONT_MONO)
    add_footer(s, 2, total, "PROBLEM")

    # ============ 03 SOLUTION ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_bg_orbs(s)
    add_pill(s, "THE FLOW", Inches(0.6), Inches(0.7))
    add_text(
        s, "20 秒 · 出一张卡片",
        x=Inches(0.6), y=Inches(1.4), w=Inches(12), h=Inches(1.2),
        size=48, color=INK, bold=True,
    )
    # 4-step horizontal timeline.
    steps = [
        ("01", "录音", "MediaRecorder\n20–30 s"),
        ("02", "ASR", "faster-whisper\n词级时间戳"),
        ("03", "特征", "YIN F0 · RMS · VAD\n14 维声学"),
        ("04", "画像", "六维打分 → 12 角色\n生成分享卡"),
    ]
    step_w = Inches(2.8)
    gap = Inches(0.35)
    total_w = 4 * step_w + 3 * gap
    start_x = (SLIDE_W - total_w) // 2
    for i, (num, title, sub) in enumerate(steps):
        x = start_x + i * (step_w + gap)
        y = Inches(3.2)
        # Card.
        card = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, step_w, Inches(2.7))
        card.adjustments[0] = 0.08
        card.fill.solid()
        card.fill.fore_color.rgb = SURFACE
        card.line.color.rgb = ACCENT
        card.line.width = Pt(0.5)
        add_text(s, num,
            x=x + Inches(0.3), y=y + Inches(0.25), w=Inches(2), h=Inches(0.3),
            size=10, color=ACCENT, font=FONT_MONO, tracking=350)
        add_text(s, title,
            x=x + Inches(0.3), y=y + Inches(0.6), w=step_w - Inches(0.6), h=Inches(0.7),
            size=26, color=INK, bold=True)
        add_text(s, sub,
            x=x + Inches(0.3), y=y + Inches(1.55), w=step_w - Inches(0.6), h=Inches(1.2),
            size=12, color=MUTED, font=FONT_MONO)
        if i < 3:
            arrow_x = x + step_w + Emu(80_000)
            arrow_y = y + Inches(1.25)
            add_text(s, "→",
                x=arrow_x, y=arrow_y, w=Inches(0.3), h=Inches(0.4),
                size=22, color=ACCENT2, align=PP_ALIGN.CENTER)
    add_footer(s, 3, total, "SOLUTION")

    # ============ 04 DEMO — Landing ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_pill(s, "DEMO · LANDING", Inches(0.6), Inches(0.7))
    add_text(s, "落地页 · 一屏说明",
        x=Inches(0.6), y=Inches(1.3), w=Inches(6), h=Inches(0.9),
        size=32, color=INK, bold=True)
    add_text(s, "深紫黑画布 + 流光渐变标题\n下拉即讲隐私承诺",
        x=Inches(0.6), y=Inches(2.3), w=Inches(6), h=Inches(1.4),
        size=14, color=MUTED, font=FONT_MONO)
    add_image_framed(s, SHOTS / "01-landing.png",
        Inches(4.6), Inches(1.4), Inches(8.4), Inches(5.3))
    add_footer(s, 4, total, "DEMO — LANDING")

    # ============ 05 DEMO — Record ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_pill(s, "DEMO · RECORD", Inches(0.6), Inches(0.7))
    add_text(s, "录音 · 实时波形",
        x=Inches(0.6), y=Inches(1.3), w=Inches(6), h=Inches(0.9),
        size=32, color=INK, bold=True)
    bullets = [
        "话题卡自动分配",
        "AnalyserNode 波形",
        "30s 倒计时环",
        "10s 内变色警示",
    ]
    for i, b in enumerate(bullets):
        add_text(s, f"·  {b}",
            x=Inches(0.6), y=Inches(2.3 + i * 0.55), w=Inches(4), h=Inches(0.5),
            size=15, color=INK)
    add_image_framed(s, SHOTS / "02-record-idle.png",
        Inches(4.6), Inches(1.4), Inches(8.4), Inches(5.3))
    add_footer(s, 5, total, "DEMO — RECORD")

    # ============ 06 DEMO — Reveal ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_pill(s, "DEMO · REVEAL", Inches(0.6), Inches(0.7))
    add_text(s, "揭晓瞬间",
        x=Inches(0.6), y=Inches(1.3), w=Inches(6), h=Inches(0.9),
        size=32, color=INK, bold=True)
    add_text(s, "3 s 呼吸动画 · 铺垫悬念\n角色名用流光渐变文字\n信任制解锁完整卡片",
        x=Inches(0.6), y=Inches(2.3), w=Inches(4), h=Inches(2.2),
        size=14, color=MUTED, font=FONT_MONO)
    add_image_framed(s, SHOTS / "03-reveal.png",
        Inches(4.6), Inches(1.4), Inches(8.4), Inches(5.3))
    add_footer(s, 6, total, "DEMO — REVEAL")

    # ============ 07 DEMO — FullCard ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_pill(s, "DEMO · FULL CARD", Inches(0.6), Inches(0.7))
    add_text(s, "完整卡片 · 可展开的证据",
        x=Inches(0.6), y=Inches(1.3), w=Inches(6.5), h=Inches(0.9),
        size=28, color=INK, bold=True)
    add_text(s,
        "MBTI-style 角色海报\n六维雷达图 · 渐变描边\n每一维展开看真实声学数据\n分享图 · 二维码回流",
        x=Inches(0.6), y=Inches(2.3), w=Inches(4), h=Inches(3),
        size=13, color=MUTED, font=FONT_MONO)
    add_image_framed(s, SHOTS / "04-fullcard.png",
        Inches(4.8), Inches(1.4), Inches(8.2), Inches(5.5))
    add_footer(s, 7, total, "DEMO — FULL CARD")

    # ============ 08 MODEL — 6 dims × 12 roles ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_pill(s, "THE MODEL", Inches(0.6), Inches(0.7))
    add_text(s, "6 个维度 · 12 个角色",
        x=Inches(0.6), y=Inches(1.3), w=Inches(6), h=Inches(0.9),
        size=32, color=INK, bold=True)
    dims = [
        "思维节奏", "情绪外显度", "气场",
        "决策模式", "沟通风格", "思维深度",
    ]
    for i, d in enumerate(dims):
        col, row = i % 2, i // 2
        y = Inches(2.4 + row * 1.15)
        x = Inches(0.6 + col * 2.3)
        card = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(2.1), Inches(0.95))
        card.adjustments[0] = 0.15
        card.fill.solid()
        card.fill.fore_color.rgb = SURFACE
        card.line.color.rgb = ACCENT
        card.line.width = Pt(0.5)
        add_text(s, f"0{i+1}",
            x=x + Inches(0.2), y=y + Inches(0.1), w=Inches(0.8), h=Inches(0.3),
            size=9, color=ACCENT, font=FONT_MONO, tracking=300)
        add_text(s, d,
            x=x + Inches(0.2), y=y + Inches(0.4), w=Inches(1.8), h=Inches(0.5),
            size=18, color=INK, bold=True)
    add_image_framed(s, SHOTS / "05-roles.png",
        Inches(5.5), Inches(1.4), Inches(7.5), Inches(5.5))
    add_footer(s, 8, total, "MODEL")

    # ============ 09 TECH + CLOSING ============
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_solid_bg(s, CANVAS)
    add_bg_orbs(s)
    add_pill(s, "STACK · WHAT'S NEXT", Inches(0.6), Inches(0.7))

    add_text(s, "Try it.",
        x=Inches(0.6), y=Inches(1.4), w=Inches(12), h=Inches(1.8),
        size=90, color=INK, bold=True, align=PP_ALIGN.CENTER)
    add_text(s, "github.com/lggyx/EchoID",
        x=Inches(0.6), y=Inches(3.3), w=Inches(12), h=Inches(0.7),
        size=22, color=ACCENT, align=PP_ALIGN.CENTER, font=FONT_MONO, tracking=200)

    # Tech row.
    tech = [
        ("Next.js 14", "App Router · TS"),
        ("faster-whisper", "int8 CPU · 2s / 8s"),
        ("YIN F0 · Meyda", "Node-only DSP"),
        ("Prisma · SQLite", "local-first MVP"),
    ]
    tech_w = Inches(2.7)
    tech_gap = Inches(0.25)
    tech_total_w = 4 * tech_w + 3 * tech_gap
    tech_start = (SLIDE_W - tech_total_w) // 2
    for i, (title, sub) in enumerate(tech):
        x = tech_start + i * (tech_w + tech_gap)
        y = Inches(4.7)
        card = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, tech_w, Inches(1.3))
        card.adjustments[0] = 0.15
        card.fill.solid()
        card.fill.fore_color.rgb = SURFACE
        card.line.color.rgb = ACCENT
        card.line.width = Pt(0.5)
        add_text(s, title,
            x=x + Inches(0.2), y=y + Inches(0.2), w=tech_w - Inches(0.4), h=Inches(0.4),
            size=15, color=INK, bold=True)
        add_text(s, sub,
            x=x + Inches(0.2), y=y + Inches(0.7), w=tech_w - Inches(0.4), h=Inches(0.4),
            size=10, color=MUTED, font=FONT_MONO)
    add_footer(s, 9, total, "CLOSING")


# ---------- main ----------
def main():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    build(prs)
    prs.save(OUT_PATH)
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
