import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
from unittest.mock import patch
import wave

from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import ALGORITHM, SECRET_KEY
from app.database.database import Base, get_db
from app.models.answer_recording import AnswerRecording
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.models.interview_score import InterviewScore
from app.models.resume import Resume
from app.models.user import User
from app.routers.interview import router
from app.services.speech_analysis_service import SpeechTranscriptionError, _decode_audio, analyze_transcript


class SpeechAnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.Session = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)

    def setUp(self):
        Base.metadata.create_all(bind=self.engine)
        self.db = self.Session()
        self.user = User(name="Candidate", email="candidate@example.test", password_hash="test")
        other = User(name="Other", email="other@example.test", password_hash="test")
        self.db.add_all([self.user, other])
        self.db.flush()
        self.other = other
        resume = Resume(
            user_id=self.user.id,
            original_filename="resume.pdf",
            stored_filename="resume.pdf",
            file_path="/not-used",
            skills="Python",
        )
        self.db.add(resume)
        self.db.flush()
        self.interview = Interview(
            user_id=self.user.id,
            resume_id=resume.id,
            interview_type="Technical",
            difficulty="Medium",
            status="started",
        )
        self.db.add(self.interview)
        self.db.flush()
        self.question = InterviewQuestion(
            interview_id=self.interview.id,
            question_number=1,
            question_text="Describe a project you built.",
        )
        self.db.add(self.question)
        self.db.commit()

        app = FastAPI()
        app.include_router(router)

        def override_db():
            session = self.Session()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        self.created_audio_paths = []

    def tearDown(self):
        self.client.close()
        self.db.close()
        for path in self.created_audio_paths:
            path.unlink(missing_ok=True)
        Base.metadata.drop_all(bind=self.engine)

    def token(self, user_id):
        return jwt.encode(
            {"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
            SECRET_KEY,
            algorithm=ALGORITHM,
        )

    def headers(self, user_id=None):
        return {"Authorization": f"Bearer {self.token(user_id or self.user.id)}"}

    def test_transcript_filler_and_rate_indicators(self):
        result = analyze_transcript("Um, I built a project, you know, and improved it. So we shipped it.", 30)
        self.assertEqual(result["word_count"], 14)
        self.assertEqual(result["filler_words"], {"you know": 1, "um": 1, "so": 1})
        self.assertEqual(result["speaking_rate_wpm"], 28.0)
        self.assertEqual(result["pace"], "slow")
        self.assertTrue(result["meaningful_content"])

    def test_current_pyav_audio_decode(self):
        with tempfile.TemporaryDirectory() as directory:
            sample = Path(directory) / "silence.wav"
            with wave.open(str(sample), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(b"\x00\x00" * 16000)
            decoded = _decode_audio(sample)
            self.assertEqual(len(decoded), 16000)

    def test_authentication_and_ownership_are_enforced(self):
        unauthorized = self.client.get(f"/interviews/{self.interview.id}/questions")
        self.assertEqual(unauthorized.status_code, 401)
        wrong_owner = self.client.get(
            f"/interviews/{self.interview.id}/questions",
            headers=self.headers(self.other.id),
        )
        self.assertEqual(wrong_owner.status_code, 404)

    def test_upload_transcribes_and_persists_analysis(self):
        with patch("app.routers.interview.transcribe_audio", return_value=("Um, I built a useful project with my team.", 6.0)):
            response = self.client.post(
                f"/interviews/{self.interview.id}/questions/{self.question.id}/audio",
                headers=self.headers(),
                files={"audio": ("answer.webm", b"test-audio-bytes", "audio/webm")},
                data={"duration_seconds": "6"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["analysis"]["transcript"], "Um, I built a useful project with my team.")
        self.assertEqual(body["analysis"]["filler_words"], {"um": 1})
        self.assertEqual(body["analysis"]["speaking_rate_wpm"], 90.0)
        self.assertNotIn("/uploads/", str(body["audio"]))
        self.assertNotIn("..", body["audio"]["filename"])

        recording = self.db.query(AnswerRecording).filter_by(question_id=self.question.id).one()
        self.created_audio_paths.append(Path(__file__).resolve().parents[1] / "uploads" / "audio" / recording.audio_filename)
        self.db.refresh(self.question)
        self.assertEqual(recording.user_id, self.user.id)
        self.assertEqual(recording.transcript, self.question.answer_text)
        questions = self.client.get(
            f"/interviews/{self.interview.id}/questions",
            headers=self.headers(),
        ).json()["questions"]
        self.assertEqual(questions[0]["communication_analysis"]["source"], "speech")
        self.assertEqual(questions[0]["communication_analysis"]["transcript"], recording.transcript)

    def test_started_status_question_ownership_and_invalid_audio(self):
        self.interview.status = "created"
        self.db.commit()
        blocked = self.client.post(
            f"/interviews/{self.interview.id}/questions/{self.question.id}/audio",
            headers=self.headers(),
            files={"audio": ("answer.webm", b"audio", "audio/webm")},
        )
        self.assertEqual(blocked.status_code, 400)

        self.interview.status = "started"
        self.db.commit()
        wrong_question = self.client.post(
            f"/interviews/{self.interview.id}/questions/{self.question.id + 100}/audio",
            headers=self.headers(),
            files={"audio": ("answer.webm", b"audio", "audio/webm")},
        )
        self.assertEqual(wrong_question.status_code, 404)
        invalid_type = self.client.post(
            f"/interviews/{self.interview.id}/questions/{self.question.id}/audio",
            headers=self.headers(),
            files={"audio": ("answer.exe", b"not audio", "application/octet-stream")},
        )
        self.assertEqual(invalid_type.status_code, 415)
        with patch("app.routers.interview.transcribe_audio", side_effect=SpeechTranscriptionError("No speech was detected.")):
            invalid_audio = self.client.post(
                f"/interviews/{self.interview.id}/questions/{self.question.id}/audio",
                headers=self.headers(),
                files={"audio": ("answer.webm", b"invalid audio", "audio/webm")},
            )
        self.assertEqual(invalid_audio.status_code, 422)

    def test_typed_answer_fallback_and_completion_require_every_answer(self):
        incomplete = self.client.post(
            f"/interviews/{self.interview.id}/complete",
            headers=self.headers(),
        )
        self.assertEqual(incomplete.status_code, 400)
        saved = self.client.post(
            f"/interviews/{self.interview.id}/questions/{self.question.id}/answer",
            headers=self.headers(),
            json={"answer_text": "I built a reporting tool with my team."},
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        completed = self.client.post(
            f"/interviews/{self.interview.id}/complete",
            headers=self.headers(),
        )
        self.assertEqual(completed.status_code, 200, completed.text)

    def test_evaluation_uses_saved_speech_communication_and_keeps_weights(self):
        self.interview.status = "completed"
        self.question.answer_text = "I built a useful project with my team and improved it."
        recording = AnswerRecording(
            interview_id=self.interview.id,
            question_id=self.question.id,
            user_id=self.user.id,
            audio_filename="unused.webm",
            transcript=self.question.answer_text,
            word_count=11,
            sentence_count=1,
            duration_seconds=8,
            speaking_rate_wpm=82.5,
            pace="slow",
            filler_count=0,
            filler_words={},
            filler_rate_percent=0,
            clarity_score=70,
            meaningful_content=1,
            communication_score=73.4,
            feedback="Clear content.",
        )
        self.db.add(recording)
        self.db.commit()
        response = self.client.post(
            f"/interviews/{self.interview.id}/evaluate",
            headers=self.headers(),
        )
        self.assertEqual(response.status_code, 200, response.text)
        scores = response.json()["scores"]
        self.assertEqual(scores["communication"], 73.4)
        expected = round(
            scores["communication"] * 0.30
            + scores["confidence"] * 0.25
            + scores["technical_relevance"] * 0.30
            + scores["professionalism"] * 0.15,
            2,
        )
        self.assertEqual(scores["overall"], expected)
        result = self.client.get(
            f"/interviews/{self.interview.id}/result",
            headers=self.headers(),
        )
        self.assertEqual(result.status_code, 200, result.text)
        analysis = result.json()["communication_analysis"]
        self.assertEqual(analysis["answers"][0]["transcript"], self.question.answer_text)
        self.assertEqual(analysis["speaking_rate_wpm"], 82.5)


if __name__ == "__main__":
    unittest.main()
