"""Word-level captions with Whisper + ASS subtitle generation (CapCut-style)."""
import os
import whisper

def transcribe_words(audio_path: str) -> list[dict]:
    model = whisper.load_model("base")
    result = model.transcribe(audio_path, word_timestamps=True, language="en", fp16=False)
    words = []
    for seg in result["segments"]:
        for w in seg.get("words", []):
            words.append({
                "word": w["word"].strip(),
                "start": w["start"],
                "end": w["end"],
            })
    return words


def _fmt(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


def write_ass(words: list[dict], out_path: str, video_w: int = 1080, video_h: int = 1920) -> str:
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {video_w}
PlayResY: {video_h}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,Montserrat,82,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,3,2,80,80,520,1
Style: Pop,Montserrat,96,&H0000F0FF,&H0000F0FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,8,4,2,80,80,520,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    # Group 2-3 words per visible chunk for readability.
    chunks = []
    i = 0
    while i < len(words):
        group = words[i:i + 3]
        if not group:
            break
        chunks.append(group)
        i += 3

    lines = []
    for group in chunks:
        start = group[0]["start"]
        end = group[-1]["end"]
        full_text = " ".join(w["word"] for w in group).upper()
        # Base line (white, full chunk visible)
        lines.append(
            f"Dialogue: 0,{_fmt(start)},{_fmt(end)},Base,,0,0,0,,{{\\fad(80,80)}}{full_text}"
        )
        # Per-word pop highlight (yellow, scaling)
        for w in group:
            ws, we = w["start"], w["end"]
            word_up = w["word"].upper()
            # Highlight overlay: same chunk but recolor active word
            colored = []
            for ww in group:
                token = ww["word"].upper()
                if ww is w:
                    colored.append(f"{{\\c&H0000F0FF&\\fs104}}{token}{{\\r}}")
                else:
                    colored.append(f"{{\\alpha&H00&}}{token}")
            text = " ".join(colored)
            lines.append(
                f"Dialogue: 1,{_fmt(ws)},{_fmt(we)},Base,,0,0,0,,{text}"
            )

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header + "\n".join(lines) + "\n")
    return out_path
