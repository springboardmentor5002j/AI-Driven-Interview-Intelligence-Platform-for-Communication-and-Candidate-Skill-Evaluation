"""
SmartHire AI - pure speech metrics (no Django, no network).

Works on Deepgram-style word lists:
    [{"word": "hello", "start": 0.1, "end": 0.4, "confidence": 0.98}, ...]
"""
import re

LONG_PAUSE_SECONDS = 2.0

# Hesitation sounds are always fillers. Discourse fillers are only counted in
# the forms that are almost never meaningful. "like" is deliberately NOT
# counted as a bare word (it is a normal verb/preposition) - only the
# comma-delimited filler use: "so, like, I did X".
_HESITATION = r"(?:u+m+|u+h+|e+r+m*|a+h+|h+m+)"
_DISCOURSE = r"(?:you know|i mean|sort of|kind of|basically|literally|actually)"
_FILLER_RE = re.compile(
    rf"\b(?P<hes>{_HESITATION})\b|\b(?P<dis>{_DISCOURSE})\b|,\s*(?P<like>like)\s*(?=,)",
    re.IGNORECASE,
)


def count_filler_words(transcript):
    """Returns (total_count, sorted list of distinct fillers found)."""
    found = []
    for match in _FILLER_RE.finditer(transcript or ""):
        token = match.group("hes") or match.group("dis") or match.group("like")
        found.append(token.lower())
    return len(found), sorted(set(found))


def compute_timing_metrics(words):
    """
    Derive pace and hesitation metrics from word timestamps.

    * speaking_seconds: time spent actually speaking - gaps shorter than
      LONG_PAUSE_SECONDS count as speech (normal breathing/phrasing); longer
      gaps are treated as pauses and excluded.
    * speaking_pace_wpm: words per minute of speaking_seconds. This is an
      articulation rate, not an interview-wide average.
    * pause_ratio: share of the first-word..last-word span spent in long pauses.
    * pronunciation_estimate: mean ASR word confidence x 100. This is a
      PROXY for intelligibility, not phoneme-level pronunciation scoring, and
      can be lower for accents the ASR handles less well.
    """
    empty = {
        "word_count": 0,
        "speaking_seconds": None,
        "speaking_pace_wpm": None,
        "long_pause_count": None,
        "pause_ratio": None,
        "pronunciation_estimate": None,
    }
    clean = [
        w for w in (words or [])
        if isinstance(w, dict)
        and isinstance(w.get("start"), (int, float))
        and isinstance(w.get("end"), (int, float))
        and w["end"] >= w["start"]
    ]
    if not clean:
        return empty

    speaking = 0.0
    long_pauses = 0
    long_pause_time = 0.0
    for i, w in enumerate(clean):
        speaking += w["end"] - w["start"]
        if i + 1 < len(clean):
            gap = clean[i + 1]["start"] - w["end"]
            if gap < 0:
                continue
            if gap >= LONG_PAUSE_SECONDS:
                long_pauses += 1
                long_pause_time += gap
            else:
                speaking += gap

    span = clean[-1]["end"] - clean[0]["start"]
    n = len(clean)
    confidences = [
        w["confidence"] for w in clean
        if isinstance(w.get("confidence"), (int, float))
    ]
    return {
        "word_count": n,
        "speaking_seconds": round(speaking, 1) if speaking > 0 else None,
        "speaking_pace_wpm": round(n / (speaking / 60)) if speaking >= 5 else None,
        "long_pause_count": long_pauses,
        "pause_ratio": round(long_pause_time / span, 3) if span > 0 else None,
        "pronunciation_estimate": (
            round(sum(confidences) / len(confidences) * 100, 1) if confidences else None
        ),
    }
