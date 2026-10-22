from fastapi import FastAPI

from app.database.database import engine, Base
from app.models.user import User
from app.models.resume import Resume
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.models.interview_score import InterviewScore
from app.models.answer_recording import AnswerRecording
from app.database.migrations import migrate_answer_recordings
from app.services.audio_storage import cleanup_expired_audio
from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.resume import router as resume_router
from app.routers.interview import router as interview_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="SmartHire AI",
    description="AI-Powered Mock Interview and Candidate Assessment Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
migrate_answer_recordings()
cleanup_expired_audio()

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(resume_router)
app.include_router(interview_router)

@app.get("/")
def root():
    return {
        "message": "SmartHire AI Backend is running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy"
    }
