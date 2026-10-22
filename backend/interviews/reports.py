"""
SmartHire AI - downloadable candidate interview report (PDF).
Duck-typed on the session/score objects; no Django imports.
"""
import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .scoring_rules import WEIGHTS, rating_for

COMPONENTS = [
    ("Communication", "communication_score", "communication"),
    ("Confidence indicators", "confidence_score", "confidence"),
    ("Technical relevance", "technical_score", "technical"),
    ("Professionalism", "professionalism_score", "professionalism"),
]


def _p(text, style):
    return Paragraph(escape(str(text)), style)


def _fmt(value, suffix=""):
    return "Unavailable" if value is None else f"{value:g}{suffix}"


def _resource_text(item):
    if isinstance(item, str):
        return item
    parts = [item.get("title") or item.get("topic") or ""]
    if item.get("type"):
        parts.append(f"({item['type']})")
    if item.get("search_query"):
        parts.append(f"- search: {item['search_query']}")
    return " ".join(p for p in parts if p)


def build_interview_report_pdf(session, score):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm, title="SmartHire AI Interview Report",
    )
    base = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=base["Heading1"], fontSize=20, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=base["Heading2"], fontSize=13, spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle("body", parent=base["BodyText"], fontSize=10, leading=14)
    small = ParagraphStyle("small", parent=body, fontSize=8, textColor=colors.grey)

    story = [_p("SmartHire AI - Interview Report", h1)]

    meta = [
        ["Candidate", session.candidate.username],
        ["Interview", f"{session.get_interview_type_display()} / {session.get_difficulty_display()}"
                      + (f" / {session.domain}" if session.domain else "")],
        ["Completed", session.completed_at.strftime("%d %b %Y %H:%M") if session.completed_at else "-"],
    ]
    t = Table([[_p(k, body), _p(v, body)] for k, v in meta], colWidths=[3.5 * cm, 13 * cm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [t, Spacer(1, 10)]

    overall = score.overall_score
    rating = rating_for(overall)
    story.append(_p(
        f"Overall score: {_fmt(overall)}" + (f" / 100 - {rating}" if overall is not None else ""), h2))
    if score.is_partial:
        missing = ", ".join(score.unavailable_components)
        story.append(_p(
            f"Partial result: {missing} could not be measured, so the overall score is "
            "calculated from the remaining components.", body))

    rows = [["Component", "Weight", "Score"]]
    for label, attr, key in COMPONENTS:
        rows.append([label, f"{int(WEIGHTS[key] * 100)}%", _fmt(getattr(score, attr))])
    table = Table(rows, colWidths=[8 * cm, 3 * cm, 5 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF1F5")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9CED6")),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [Spacer(1, 6), table]

    for title, items in (
        ("Strengths", score.strengths),
        ("Areas to improve", score.weaknesses),
        ("Improvement suggestions", score.improvement_suggestions),
        ("Practice recommendations", score.practice_recommendations),
    ):
        if items:
            story.append(_p(title, h2))
            story += [_p(f"• {i}", body) for i in items]

    if score.learning_resources:
        story.append(_p("Learning resources", h2))
        story += [_p(f"• {_resource_text(r)}", body) for r in score.learning_resources]

    story.append(_p("Speech metrics", h2))
    metrics = [
        ["Words spoken", _fmt(session.word_count)],
        ["Filler words", _fmt(session.filler_word_count)],
        ["Speaking pace (during speech)", _fmt(session.speaking_pace_wpm, " wpm")],
        ["Long pauses (2s+)", _fmt(session.long_pause_count)],
        ["Clarity estimate (speech recognition confidence)", _fmt(session.pronunciation_estimate, "%")],
    ]
    mt = Table([[_p(k, body), _p(v, body)] for k, v in metrics], colWidths=[10 * cm, 6.5 * cm])
    story.append(mt)

    story += [
        Spacer(1, 14),
        _p("This report is generated automatically from the interview audio and transcript. "
           "Scores are indicative practice feedback, not a hiring decision. Confidence is "
           "estimated from speech signals only unless video analysis is listed.", small),
    ]
    doc.build(story)
    return buf.getvalue()
