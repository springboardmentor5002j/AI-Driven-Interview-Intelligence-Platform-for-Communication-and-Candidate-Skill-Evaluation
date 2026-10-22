import unittest
from datetime import datetime
from types import SimpleNamespace

from .reports import build_interview_report_pdf


def fake_session():
    return SimpleNamespace(
        candidate=SimpleNamespace(username="asha <b>&"),   # must be escaped, not crash
        get_interview_type_display=lambda: "Technical",
        get_difficulty_display=lambda: "Medium",
        domain="Backend",
        completed_at=datetime(2026, 10, 10, 18, 30),
        word_count=250, filler_word_count=4, speaking_pace_wpm=128,
        long_pause_count=1, pronunciation_estimate=94.2,
    )


def fake_score(**kw):
    base = dict(
        overall_score=73.5, is_partial=False, unavailable_components=[],
        communication_score=80, confidence_score=60,
        technical_score=70, professionalism_score=90,
        strengths=["Clear structure"], weaknesses=["Few examples"],
        improvement_suggestions=["Use STAR"], practice_recommendations=["Mock interview"],
        learning_resources=[{"topic": "System design", "type": "course", "search_query": "system design basics"}],
    )
    base.update(kw)
    return SimpleNamespace(**base)


class ReportTests(unittest.TestCase):
    def test_pdf_is_generated(self):
        pdf = build_interview_report_pdf(fake_session(), fake_score())
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertGreater(len(pdf), 1500)

    def test_partial_and_unavailable_scores(self):
        pdf = build_interview_report_pdf(
            fake_session(),
            fake_score(overall_score=78.0, is_partial=True,
                       unavailable_components=["confidence"], confidence_score=None,
                       learning_resources=[], strengths=[]))
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_no_overall_score(self):
        pdf = build_interview_report_pdf(
            fake_session(),
            fake_score(overall_score=None, is_partial=True, communication_score=None,
                       confidence_score=None, technical_score=None, professionalism_score=None,
                       unavailable_components=["communication", "confidence", "technical", "professionalism"]))
        self.assertTrue(pdf.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
