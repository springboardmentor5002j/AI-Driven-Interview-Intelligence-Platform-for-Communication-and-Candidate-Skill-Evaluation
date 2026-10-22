from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.sql import func

from app.database.database import Base


class AnswerRecording(Base):
    __tablename__ = "answer_recordings"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("interview_questions.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    audio_filename = Column(String(255), nullable=False)
    transcript = Column(Text, nullable=False)
    word_count = Column(Integer, nullable=False, default=0)
    sentence_count = Column(Integer, nullable=False, default=0)
    duration_seconds = Column(Float, nullable=True)
    speaking_rate_wpm = Column(Float, nullable=True)
    pace = Column(String(20), nullable=False, default="unavailable")
    filler_count = Column(Integer, nullable=False, default=0)
    filler_words = Column(JSON, nullable=False, default=dict)
    filler_rate_percent = Column(Float, nullable=False, default=0)
    clarity_score = Column(Float, nullable=False, default=0)
    meaningful_content = Column(Integer, nullable=False, default=0)
    communication_score = Column(Float, nullable=False, default=0)
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
