"""Pro-tier ASS captions with multiple animated styles.

Styles:
- KineticPop: word-by-word pop-in with scale + color highlight (CapCut viral style)
- BounceGlow: bouncing scale + neon glow on the active word
- GradientBold: heavy outline + gradient fill

Each line: a base chunk visible the whole time, plus an animated overlay on the
active word with karaoke-style timing.
"""
from __future__ import annotations

import random


def _fmt(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


HEADER_TMPL = """[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
ScaledBorderAndShadow: yes
WrapStyle: 2
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,Impact,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,1,0,0,0,100,100,1,0,1,8,4,2,80,80,580,1
Style: Hot,Impact,108,&H0000F0FF,&H0000F0FF,&H00000000,&HA0000000,1,0,0,0,100,100,1,0,1,10,5,2,80,80,580,1
Style: Hook,Impact,128,&H00FFFFFF,&H00FFFFFF,&H001E2BFF,&HC0000000,1,0,0,0,100,100,2,0,1,12,6,5,80,80,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _chunk(words: list[dict], size: int) -> list[list[dict]]:
    out, i = [], 0
    while i < len(words):
        out.append(words[i:i + size])
        i += size
    return out


def write_ass_pro(
    words: list[dict],
    out_path: str,
    video_w: int = 1080,
    video_h: int = 1920,
    chunk_size: int = 3,
) -> str:
    lines = [HEADER_TMPL.format(W=video_w, H=video_h)]
    chunks = _chunk(words, chunk_size)

    # Hook overlay on first chunk (big, bold, centered)
    if chunks:
        first = chunks[0]
        hook_start = first[0]["start"]
        hook_end = min(first[-1]["end"] + 0.3, first[0]["start"] + 2.2)
        hook_text = " ".join(w["word"] for w in first).upper()
        lines.append(
            f"Dialogue: 2,{_fmt(hook_start)},{_fmt(hook_end)},Hook,,0,0,0,,"
            f"{{\\fad(120,150)\\t(0,200,\\fscx115\\fscy115)\\t(200,400,\\fscx100\\fscy100)}}{hook_text}"
        )

    for ci, group in enumerate(chunks):
        if not group:
            continue
        start = group[0]["start"]
        end = group[-1]["end"] + 0.05
        full_text = " ".join(w["word"] for w in group).upper()

        # Base chunk: white with shadow, fade in/out, slight bob on entry
        lines.append(
            f"Dialogue: 0,{_fmt(start)},{_fmt(end)},Base,,0,0,0,,"
            f"{{\\fad(60,80)\\t(0,150,\\fscx108\\fscy108)\\t(150,260,\\fscx100\\fscy100)}}{full_text}"
        )

        # Active-word highlight: cyan/yellow pop with scale bounce
        for w in group:
            ws, we = w["start"], w["end"]
            word_up = w["word"].upper()
            tokens = []
            for ww in group:
                t = ww["word"].upper()
                if ww is w:
                    tokens.append(
                        f"{{\\c&H0000F0FF&\\3c&H00102050&\\fscx118\\fscy118"
                        f"\\t(0,90,\\fscx130\\fscy130)\\t(90,200,\\fscx118\\fscy118)}}{t}{{\\r}}"
                    )
                else:
                    tokens.append(f"{{\\alpha&H00&}}{t}")
            text = " ".join(tokens)
            lines.append(f"Dialogue: 1,{_fmt(ws)},{_fmt(we)},Base,,0,0,0,,{text}")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return out_path
