from sqlalchemy import inspect, text

from app.database.database import engine


def migrate_answer_recordings() -> None:
    """Safely add the answer_recordings table to existing PostgreSQL installations."""
    inspector = inspect(engine)
    if not inspector.has_table("answer_recordings"):
        with engine.begin() as connection:
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS answer_recordings (
                id SERIAL PRIMARY KEY,
                interview_id INTEGER NOT NULL REFERENCES interviews(id),
                question_id INTEGER NOT NULL REFERENCES interview_questions(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                audio_filename VARCHAR(255) NOT NULL,
                transcript TEXT NOT NULL,
                word_count INTEGER NOT NULL DEFAULT 0,
                sentence_count INTEGER NOT NULL DEFAULT 0,
                duration_seconds DOUBLE PRECISION,
                speaking_rate_wpm DOUBLE PRECISION,
                pace VARCHAR(20) NOT NULL DEFAULT 'unavailable',
                filler_count INTEGER NOT NULL DEFAULT 0,
                filler_words JSON NOT NULL DEFAULT '{}'::json,
                filler_rate_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
                clarity_score DOUBLE PRECISION NOT NULL DEFAULT 0,
                meaningful_content INTEGER NOT NULL DEFAULT 0,
                communication_score DOUBLE PRECISION NOT NULL DEFAULT 0,
                feedback TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """))
    with engine.begin() as connection:
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_answer_recordings_interview_id ON answer_recordings (interview_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_answer_recordings_question_id ON answer_recordings (question_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_answer_recordings_user_id ON answer_recordings (user_id)"))


if __name__ == "__main__":
    migrate_answer_recordings()
