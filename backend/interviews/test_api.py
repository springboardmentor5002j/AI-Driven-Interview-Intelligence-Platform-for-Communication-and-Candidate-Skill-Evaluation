"""
API tests for the candidate interview flow.

Run from your project root:   python manage.py test interviews

NOTE: URLs below assume the interviews app is mounted at /api/interviews/ - change
URL_PREFIX in url() if yours differs. These use get_user_model().objects.create_user(username=..., password=...).
If your custom user model needs extra required fields (email, role, ...), adjust
make_user() below.
"""
import tempfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import views
from .ai_client import AIUnavailable
from .models import InterviewQuestion, InterviewSession
from .scoring_rules import weighted_overall

LLM_OK = {
    "technical_relevance": {"score": 70, "reasoning": "ok"},
    "professionalism": {"score": 90, "reasoning": "ok"},
    "strengths": ["clear"], "weaknesses": ["short"], "improvement_suggestions": ["add examples"],
    "practice_recommendations": [], "learning_resources": [],
}

ANALYSIS_OK = {
    "transcript": "word " * 300, "filler_word_count": 2, "filler_words_found": ["um"],
    "grammar_issues": ["one issue"], "grammar_checked": True, "speaking_pace_wpm": 135,
    "speaking_seconds": 130.0, "word_count": 300, "long_pause_count": 0, "pause_ratio": 0.02,
    "pronunciation_estimate": 95.0, "communication_notes": "Good.", "analysis_success": True,
}


def make_user(name):
    return get_user_model().objects.create_user(username=name, password="pw-12345-xyz")


def audio(name="a.webm", content=b"\x1a\x45\xdf\xa3" + b"0" * 12, ctype="audio/webm"):
    return SimpleUploadedFile(name, content, content_type=ctype)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="smarthire_test_media_"))
class InterviewFlowTests(TestCase):
    def setUp(self):
        self.user = make_user("cand")
        self.other = make_user("other")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.session = InterviewSession.objects.create(
            candidate=self.user, interview_type="technical", difficulty="easy")
        InterviewQuestion.objects.create(session=self.session, question_text="Q1", order=0)

    def url(self, suffix):
        return f"/api/interviews/{self.session.pk}/{suffix}"  # URL_PREFIX

    # ---- generation
    def test_generate_falls_back_safely_when_ai_down(self):
        with mock.patch("interviews.utils.chat_json", side_effect=AIUnavailable("secret-detail")):
            r = self.client.post("/api/interviews/generate/",
                                 {"interview_type": "hr", "question_count": 3}, format="json")
        self.assertEqual(r.status_code, 201)
        texts = [q["question_text"] for q in r.data["questions"]]
        self.assertEqual(len(texts), 3)
        self.assertFalse(any("secret-detail" in t for t in texts))

    # ---- start
    def test_start_is_idempotent_and_keeps_started_at(self):
        first = self.client.post(self.url("start/"))
        self.assertEqual(first.status_code, 200)
        started = InterviewSession.objects.get(pk=self.session.pk).started_at
        second = self.client.post(self.url("start/"))
        self.assertEqual(second.status_code, 200)
        self.assertEqual(InterviewSession.objects.get(pk=self.session.pk).started_at, started)

    def test_start_missing_session_is_404_not_500(self):
        self.assertEqual(self.client.post("/api/interviews/99999/start/").status_code, 404)

    def test_other_user_cannot_touch_session(self):
        self.client.force_authenticate(self.other)
        for suffix in ("start/", "complete/", "upload-recording/"):
            self.assertEqual(self.client.post(self.url(suffix)).status_code, 404, suffix)
        self.assertEqual(self.client.get(self.url("report/")).status_code, 404)

    # ---- upload validation
    def test_upload_rejects_empty_wrong_type_and_oversize(self):
        r = self.client.post(self.url("upload-recording/"),
                             {"audio_recording": audio(content=b"")}, format="multipart")
        self.assertEqual(r.status_code, 400)
        r = self.client.post(self.url("upload-recording/"),
                             {"audio_recording": audio("x.exe", ctype="application/x-msdownload")},
                             format="multipart")
        self.assertEqual(r.status_code, 400)
        with mock.patch.object(views, "MAX_AUDIO_BYTES", 5):
            r = self.client.post(self.url("upload-recording/"),
                                 {"audio_recording": audio()}, format="multipart")
        self.assertEqual(r.status_code, 400)

    def test_upload_accepts_valid_audio(self):
        r = self.client.post(self.url("upload-recording/"),
                             {"audio_recording": audio(ctype="audio/webm;codecs=opus")},
                             format="multipart")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["audio_saved"])

    # ---- completion + scoring
    def test_complete_without_recording_reports_error_and_is_retryable(self):
        r = self.client.post(self.url("complete/"))
        self.assertEqual(r.status_code, 200)
        self.assertIn("analysis_error", r.data)
        self.assertEqual(InterviewSession.objects.get(pk=self.session.pk).status, "completed")

    def test_complete_scores_once_and_is_idempotent(self):
        self.session.audio_recording.save("a.webm", audio(), save=True)
        with mock.patch("interviews.views.analyze_interview_recording",
                        return_value=ANALYSIS_OK) as speech, \
             mock.patch("interviews.scoring.chat_json", return_value=LLM_OK):
            r1 = self.client.post(self.url("complete/"))
            r2 = self.client.post(self.url("complete/"))
        self.assertEqual(speech.call_count, 1)           # second call did not re-run analysis
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.data["score"]["overall_score"], r1.data["score"]["overall_score"])
        score = r1.data["score"]
        expected, _, _ = weighted_overall({
            "communication": score["communication_score"], "confidence": score["confidence_score"],
            "technical": score["technical_score"], "professionalism": score["professionalism_score"]})
        self.assertEqual(score["overall_score"], expected)
        self.assertFalse(score["is_partial"])
        self.assertEqual(r1.data["status"], "analyzed")

    def test_ai_down_gives_partial_score_not_zero(self):
        self.session.audio_recording.save("a.webm", audio(), save=True)
        with mock.patch("interviews.views.analyze_interview_recording", return_value=ANALYSIS_OK), \
             mock.patch("interviews.scoring.chat_json", side_effect=AIUnavailable("x")):
            r = self.client.post(self.url("complete/"))
        self.assertIsNone(r.data["score"]["technical_score"])
        self.assertTrue(r.data["score"]["is_partial"])
        self.assertIn("technical", r.data["score"]["unavailable_components"])

    def test_failed_transcription_does_not_mark_analyzed(self):
        self.session.audio_recording.save("a.webm", audio(), save=True)
        failed = {"transcript": "", "analysis_success": False, "communication_notes": "No speech was detected in the recording."}
        with mock.patch("interviews.views.analyze_interview_recording", return_value=failed):
            r = self.client.post(self.url("complete/"))
        self.assertEqual(r.data["status"], "completed")
        self.assertEqual(r.data["analysis_error"], failed["communication_notes"])

    def test_in_progress_analysis_returns_409(self):
        from django.utils import timezone
        InterviewSession.objects.filter(pk=self.session.pk).update(
            status="analyzing", analysis_started_at=timezone.now())
        self.assertEqual(self.client.post(self.url("complete/")).status_code, 409)

    # ---- report
    def test_report_pdf_after_scoring(self):
        self.session.audio_recording.save("a.webm", audio(), save=True)
        self.assertEqual(self.client.get(self.url("report/")).status_code, 409)   # no score yet
        with mock.patch("interviews.views.analyze_interview_recording", return_value=ANALYSIS_OK), \
             mock.patch("interviews.scoring.chat_json", return_value=LLM_OK):
            self.client.post(self.url("complete/"))
        r = self.client.get(self.url("report/"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/pdf")
        self.assertTrue(r.content.startswith(b"%PDF"))
