"""
SmartHire AI - one small OpenRouter client shared by question generation,
communication feedback and scoring.

Callers get either a parsed dict or AIUnavailable. The exception message is
safe to log but is never meant to be shown to end users.
"""
import json
import logging
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class AIUnavailable(Exception):
    """The AI provider could not produce a usable JSON answer."""


def chat_json(prompt, *, temperature=0.2, timeout=(15, 90)):
    api_key = (getattr(settings, "OPENROUTER_API_KEY", "") or "").strip()
    if not api_key:
        raise AIUnavailable("OPENROUTER_API_KEY is not configured")

    model = getattr(settings, "OPENROUTER_MODEL", "openai/gpt-4o-mini")
    referer = getattr(settings, "FRONTEND_URL", "http://localhost:5173")

    try:
        response = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": referer,
                "X-Title": "SmartHire AI",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": temperature,
            },
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise AIUnavailable(f"request failed: {type(exc).__name__}") from exc

    if not response.ok:
        raise AIUnavailable(f"HTTP {response.status_code}: {response.text[:300]}")

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise AIUnavailable("unexpected response shape") from exc

    return parse_json_object(content)


def parse_json_object(content):
    """Parse a JSON object, tolerating ```json fences some models add."""
    if not isinstance(content, str):
        raise AIUnavailable("empty model output")
    text = content.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1)
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise AIUnavailable("model output was not valid JSON") from exc
    if not isinstance(data, dict):
        raise AIUnavailable("model output was not a JSON object")
    return data
