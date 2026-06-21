"""Generate a viral 60s short script with Claude."""
import os
from anthropic import Anthropic

SYSTEM = """You write viral 60-second vertical short-form video scripts (YouTube Shorts / TikTok / Reels).

Rules:
- Strong HOOK in first 3 seconds (question, shocking stat, bold claim).
- 130-170 words total (about 55-70 seconds when narrated).
- Conversational, punchy, short sentences. No filler.
- Build curiosity, deliver value, end with a CTA ("follow for more", "save this").
- Do NOT include stage directions, scene labels, or "[music]" markers.
- Output ONLY the spoken narration text. Nothing else. No quotes, no headers."""

def write_script(topic: str, niche: str = "finance tips") -> str:
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    msg = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=600,
        system=SYSTEM,
        messages=[{
            "role": "user",
            "content": f"Niche: {niche}\nTopic: {topic}\n\nWrite the script now.",
        }],
    )
    return msg.content[0].text.strip()


if __name__ == "__main__":
    import sys
    topic = sys.argv[1] if len(sys.argv) > 1 else "3 money habits that quietly make you rich"
    print(write_script(topic))
