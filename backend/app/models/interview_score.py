from sqlalchemy import Column, Integer, Float, ForeignKey, Text
from app.database.database import Base


class InterviewScore(Base):
    __tablename__ = "interview_scores"

    id = Column(Integer, primary_key=True, index=True)

    interview_id = Column(
        Integer,
        ForeignKey("interviews.id"),
        nullable=False
    )

    communication_score = Column(
        Float,
        nullable=False
    )

    confidence_score = Column(
        Float,
        nullable=False
    )

    technical_score = Column(
        Float,
        nullable=False
    )

    professionalism_score = Column(
        Float,
        nullable=False
    )

    overall_score = Column(
        Float,
        nullable=False
    )

    feedback = Column(
        Text,
        nullable=True
    )