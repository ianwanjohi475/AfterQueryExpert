"""Extract B-roll search keywords from a script using Claude."""
import os
import json
from anthropic import Anthropic

def extract_keywords(script: str, n: int = 8) -> list[str]:
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    msg = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=400,
        system="You extract visual B-roll search keywords for stock video sites. Return ONLY a JSON array of short search phrases (1-3 words each), no prose.",
        messages=[{
            "role": "user",
            "content": f"Script:\n{script}\n\nReturn {n} visual keywords that match the script themes. JSON array only.",
        }],
    )
    txt = msg.content[0].text.strip()
    start = txt.find("[")
    end = txt.rfind("]")
    if start >= 0 and end > start:
        return json.loads(txt[start:end + 1])
    return ["money", "success", "city", "business", "lifestyle", "wealth"]
