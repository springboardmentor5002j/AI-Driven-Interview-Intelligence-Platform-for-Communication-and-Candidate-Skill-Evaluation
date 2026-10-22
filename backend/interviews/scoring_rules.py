"""
SmartHire AI - pure scoring rules (no Django, no network).

Everything here is deterministic and unit-testable. The Django-facing
orchestration lives in scoring.py.

Design rules:
  * Every component score is 0-100 or None. None means "unavailable"
    (never a silent zero).
  * Overall = weighted average using the required weights
    (Communication 30, Confidence 25, Technical 30, Professionalism 15).
    If a component is unavailable the remaining weights are re-normalised
    and the result is flagged partial.
  * Thresholds below are starting heuristics. Tune them against real
    recordings before relying on the numbers for hiring decisions.
"""

WEIGHTS = {
    "communication": 0.30,
    "confidence": 0.25,
    "technical": 0.30,
    "professionalism": 0.15,
}

SCORING_VERSION = "1.0"

MIN_WORDS_FOR_RATES = 20      # below this, per-100-word rates are noise
MIN_WORDS_FOR_LLM = 15        # below this, don't ask an LLM to judge answers
LONG_PAUSE_SECONDS = 2.0


# ---------------------------------------------------------------- helpers
def clamp(value, lo=0.0, hi=100.0):
    return max(lo, min(hi, value))


def scale(x, zero_at, full_at):
    """Linear map: zero_at -> 0, full_at -> 100, clamped. Works either way round."""
    if zero_at == full_at:
        return 100.0 if x >= full_at else 0.0
    return clamp((x - zero_at) / (full_at - zero_at) * 100.0)


def rating_for(score):
    """Rating rubric from the requirements document."""
    if score is None:
        return None
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Good"
    if score >= 60:
        return "Average"
    if score >= 40:
        return "Needs Improvement"
    return "Poor"


def _weighted_average(parts):
    """parts: {name: (score_or_None, weight)} -> (score_or_None, used_parts)."""
    used = {k: v for k, v in parts.items() if v[0] is not None}
    total_weight = sum(w for _, w in used.values())
    if not used or total_weight <= 0:
        return None, {}
    score = sum(s * w for s, w in used.values()) / total_weight
    return round(score, 1), used


def _breakdown(parts):
    return {
        name: {"score": None if s is None else round(s, 1), "weight": w}
        for name, (s, w) in parts.items()
    }


# -------------------------------------------------------- overall formula
def weighted_overall(components):
    """
    components: {"communication": x, "confidence": x, "technical": x,
                 "professionalism": x} where x is 0-100 or None.
    Returns (overall_or_None, unavailable_list, is_partial).
    """
    available = {
        k: components.get(k) for k in WEIGHTS if components.get(k) is not None
    }
    unavailable = [k for k in WEIGHTS if components.get(k) is None]
    if not available:
        return None, unavailable, True
    total_weight = sum(WEIGHTS[k] for k in available)
    overall = sum(available[k] * WEIGHTS[k] for k in available) / total_weight
    return round(overall, 2), unavailable, bool(unavailable)


# --------------------------------------------------- individual measures
def pace_score(wpm):
    """Comfortable interview pace is roughly 110-160 words/minute."""
    if wpm is None:
        return None
    if 110 <= wpm <= 160:
        return 100.0
    if wpm < 110:
        return scale(wpm, 60, 110)
    return scale(wpm, 220, 160)


def filler_rate_per_100(filler_count, word_count):
    if filler_count is None or not word_count or word_count < MIN_WORDS_FOR_RATES:
        return None
    return filler_count / word_count * 100.0


# ------------------------------------------------------- communication
def compute_communication(m):
    """
    m keys (all optional): word_count, question_count, filler_word_count,
    grammar_issue_count, grammar_checked, speaking_pace_wpm,
    pronunciation_estimate.
    Returns (score_or_None, breakdown_dict).
    """
    wc = m.get("word_count") or 0
    if wc <= 0:
        return None, {}

    qcount = max(1, m.get("question_count") or 1)
    parts = {}

    pron = m.get("pronunciation_estimate")
    parts["clarity"] = (scale(pron, 60, 95) if pron is not None else None, 0.25)

    grammar = None
    if m.get("grammar_checked") and wc >= MIN_WORDS_FOR_RATES:
        issues = m.get("grammar_issue_count") or 0
        grammar = scale(issues / wc * 100.0, 8, 0)
    parts["grammar"] = (grammar, 0.25)

    rate = filler_rate_per_100(m.get("filler_word_count"), wc)
    parts["filler_words"] = (scale(rate, 8, 1) if rate is not None else None, 0.20)

    wpm = m.get("speaking_pace_wpm") if wc >= MIN_WORDS_FOR_RATES else None
    parts["pace"] = (pace_score(wpm), 0.15)

    parts["completeness"] = (scale(wc / qcount, 10, 80), 0.15)

    score, _ = _weighted_average(parts)
    return score, _breakdown(parts)


# ---------------------------------------------------------- confidence
def compute_confidence(m, vision=None):
    """
    Speech-based confidence signals (hesitation, filler use, vocal clarity),
    optionally blended 50/50 with vision signals when those exist.

    vision (optional): {"eye_contact": 0-100, "engagement": 0-100,
                        "attention": 0-100} - any may be None.
    Returns (score_or_None, breakdown_dict).
    """
    wc = m.get("word_count") or 0
    speech_parts = {}
    if wc >= MIN_WORDS_FOR_RATES:
        pause_ratio = m.get("pause_ratio")
        speech_parts["hesitation"] = (
            scale(pause_ratio, 0.40, 0.05) if pause_ratio is not None else None, 0.5)
        rate = filler_rate_per_100(m.get("filler_word_count"), wc)
        speech_parts["fluency"] = (scale(rate, 8, 1) if rate is not None else None, 0.3)
        pron = m.get("pronunciation_estimate")
        speech_parts["vocal_clarity"] = (
            scale(pron, 60, 95) if pron is not None else None, 0.2)
    speech_score, _ = _weighted_average(speech_parts) if speech_parts else (None, {})

    vision_vals = [v for v in (vision or {}).values() if v is not None]
    vision_score = round(sum(vision_vals) / len(vision_vals), 1) if vision_vals else None

    if speech_score is not None and vision_score is not None:
        score, basis = round(0.5 * speech_score + 0.5 * vision_score, 1), "speech+vision"
    elif speech_score is not None:
        score, basis = speech_score, "speech_only"
    elif vision_score is not None:
        score, basis = vision_score, "vision_only"
    else:
        return None, {}

    breakdown = {"basis": basis, "speech": _breakdown(speech_parts) if speech_parts else {}}
    if vision_score is not None:
        breakdown["vision"] = {k: v for k, v in (vision or {}).items()}
    return score, breakdown


# -------------------------------------------------------- professionalism
def compute_time_management(duration_seconds, question_count):
    """
    Session length vs ~105 s per question. Within 0.5x-1.5x of that is full
    marks. This is a rough proxy: wall-clock time includes idle time.
    """
    if not duration_seconds or duration_seconds <= 0 or not question_count:
        return None
    ratio = duration_seconds / (question_count * 105.0)
    if 0.5 <= ratio <= 1.5:
        return 100.0
    if ratio < 0.5:
        return scale(ratio, 0.1, 0.5)
    return scale(ratio, 3.0, 1.5)


def compute_professionalism(llm_professionalism, time_management):
    """80% LLM judgement (organisation, professional language, etiquette),
    20% time management. Either may be missing."""
    parts = {
        "answer_quality_and_etiquette": (llm_professionalism, 0.8),
        "time_management": (time_management, 0.2),
    }
    score, _ = _weighted_average(parts)
    return score, _breakdown(parts)


# --------------------------------------------- LLM output normalisation
def _score_or_none(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        return round(clamp(float(value)), 1)
    except (TypeError, ValueError):
        return None


def _text_list(value, limit=8, max_len=400):
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        if isinstance(item, str) and item.strip():
            out.append(item.strip()[:max_len])
        if len(out) >= limit:
            break
    return out


def _resource_list(value, limit=6):
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        if isinstance(item, str) and item.strip():
            out.append({"topic": item.strip()[:200]})
        elif isinstance(item, dict):
            clean = {
                k: str(item[k]).strip()[:200]
                for k in ("topic", "title", "type", "search_query")
                if item.get(k)
            }
            # Never keep model-supplied URLs: they are often invented.
            if clean:
                out.append(clean)
        if len(out) >= limit:
            break
    return out


def normalize_llm_assessment(raw):
    """Validate/clamp the model's JSON. Never raises; bad input -> empty result."""
    if not isinstance(raw, dict):
        raw = {}

    def block(key):
        b = raw.get(key)
        if isinstance(b, dict):
            reasoning = b.get("reasoning")
            return _score_or_none(b.get("score")), (
                reasoning.strip()[:600] if isinstance(reasoning, str) else "")
        return _score_or_none(b), ""

    tech, tech_reason = block("technical_relevance")
    prof, prof_reason = block("professionalism")
    return {
        "technical": tech,
        "technical_reasoning": tech_reason,
        "professionalism": prof,
        "professionalism_reasoning": prof_reason,
        "strengths": _text_list(raw.get("strengths")),
        "weaknesses": _text_list(raw.get("weaknesses")),
        "improvement_suggestions": _text_list(raw.get("improvement_suggestions")),
        "practice_recommendations": _text_list(raw.get("practice_recommendations")),
        "learning_resources": _resource_list(raw.get("learning_resources")),
    }


# ----------------------------------------------- rule-based feedback
def rule_based_feedback(breakdown):
    """Fallback strengths/weaknesses/suggestions from communication sub-scores
    when the LLM is unavailable. breakdown = compute_communication()[1]."""
    messages = {
        "clarity": ("Speech was clearly recognised.",
                    "Some words were hard to recognise.",
                    "Speak a little slower and enunciate; record yourself in a quiet room."),
        "grammar": ("Grammar was generally accurate.",
                    "Several grammar issues were found.",
                    "Review the flagged grammar issues and rehearse corrected versions aloud."),
        "filler_words": ("Few filler words.",
                         "Frequent filler words.",
                         "Replace fillers with a short pause; practise answers aloud."),
        "pace": ("Comfortable speaking pace.",
                 "Speaking pace was outside the comfortable range.",
                 "Aim for roughly 110-160 words per minute."),
        "completeness": ("Answers were reasonably complete.",
                         "Answers were very short.",
                         "Develop each answer with context, action and result."),
    }
    strengths, weaknesses, suggestions = [], [], []
    for name, (good, bad, tip) in messages.items():
        s = (breakdown.get(name) or {}).get("score")
        if s is None:
            continue
        if s >= 80:
            strengths.append(good)
        elif s < 50:
            weaknesses.append(bad)
            suggestions.append(tip)
    return strengths, weaknesses, suggestions
