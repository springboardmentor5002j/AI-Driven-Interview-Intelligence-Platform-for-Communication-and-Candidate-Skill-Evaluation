# Speech transcription and communication analysis

Voice answers use `faster-whisper` on the FastAPI server with the local `tiny` model, CPU device, and `int8` compute. The model is cached for the lifetime of the worker. Typed answers remain supported and do not require microphone access. No browser SpeechRecognition API is used.

The first server transcription can download the model weights if they are not already in the local Hugging Face cache. Uploaded recordings are limited to 15 MB and 10 minutes. Audio files are stored under `backend/uploads/audio`, which is ignored by Git, and files older than 30 days are removed when the backend starts. Transcript and analysis records remain in PostgreSQL.

## Run the backend

In PowerShell:

```powershell
Set-Location E:\smarthire-ai\backend
.\venv312\Scripts\python.exe -m pip install -r requirements.txt
.\venv312\Scripts\python.exe -m app.database.migrations
.\venv312\Scripts\python.exe -m uvicorn app.main:app --reload
```

`Base.metadata.create_all()` and the idempotent migration create the new `answer_recordings` table on an existing PostgreSQL database. No columns are added to the existing interview tables. Run the migration command once before starting the server when you want schema setup separate from app startup; startup also runs the same safe migration.

## Run the frontend

In a second PowerShell window:

```powershell
Set-Location E:\smarthire-ai\frontend
npm run dev
```

## API

- `POST /interviews/{interview_id}/questions/{question_id}/audio` accepts authenticated multipart form data with the `audio` file and optional `duration_seconds`. It verifies ownership and active interview state, stores the file under a generated name, transcribes it, and returns the transcript and rule-based indicators.
- `GET /interviews/{interview_id}/questions` includes saved communication analysis for the interview owner.
- `GET /interviews/{interview_id}/result` returns speech transcripts and aggregated communication indicators for the interview owner.
- The existing typed endpoint, `POST /interviews/{interview_id}/questions/{question_id}/answer`, remains available and replaces any voice submission for that question.

Communication indicators include word and sentence counts, filler phrase counts/rate, duration, words per minute, pace band, a simple clarity/content indicator, and a heuristic communication score. They do not measure confidence, emotion, personality, or mental health. The existing overall score weights remain Communication 30%, Confidence 25%, Technical 30%, Professionalism 15%.

## Tests

```powershell
Set-Location E:\smarthire-ai\backend
.\venv312\Scripts\python.exe -m unittest discover -s tests -v
```
