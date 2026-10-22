from uuid import uuid4
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from pydantic import BaseModel

from app.database.database import get_db

from app.models.interview import Interview
from app.models.resume import Resume
from app.models.user import User
from app.models.interview_question import InterviewQuestion
from app.models.interview_score import InterviewScore
from app.models.answer_recording import AnswerRecording

from app.core.dependencies import get_current_user

from app.services.question_generator import (
    generate_resume_based_questions,
    generate_hr_questions,
    generate_behavioral_questions,
    generate_aptitude_questions
)

from app.services.scoring_service import (
    calculate_communication_score,
    calculate_confidence_score,
    calculate_technical_score,
    calculate_professionalism_score,
    calculate_overall_score,
    generate_feedback,
    get_score_rating
)
from app.services.speech_analysis_service import (
    SpeechTranscriptionError,
    analyze_transcript,
    transcribe_audio,
)
from app.services.audio_storage import get_audio_directory, remove_audio_file


# --------------------------------------------------
# Router
# --------------------------------------------------

router = APIRouter(
    prefix="/interviews",
    tags=["Interviews"]
)
logger = logging.getLogger(__name__)


# --------------------------------------------------
# Request Schema for Answer
# --------------------------------------------------

class AnswerRequest(BaseModel):
    answer_text: str


def _question_analysis(question: InterviewQuestion, db: Session) -> dict:
    recording = (
        db.query(AnswerRecording)
        .filter(AnswerRecording.question_id == question.id)
        .order_by(AnswerRecording.created_at.desc())
        .first()
    )
    if recording:
        return {
            "source": "speech",
            "transcript": recording.transcript,
            "word_count": recording.word_count,
            "sentence_count": recording.sentence_count,
            "duration_seconds": recording.duration_seconds,
            "speaking_rate_wpm": recording.speaking_rate_wpm,
            "pace": recording.pace,
            "filler_count": recording.filler_count,
            "filler_words": recording.filler_words or {},
            "filler_rate_percent": recording.filler_rate_percent,
            "clarity_score": recording.clarity_score,
            "meaningful_content": bool(recording.meaningful_content),
            "communication_score": recording.communication_score,
            "feedback": recording.feedback,
        }
    if question.answer_text:
        analysis = analyze_transcript(question.answer_text)
        analysis["source"] = "typed"
        analysis["transcript"] = None
        return analysis
    return None


def _serialize_question(question: InterviewQuestion, db: Session) -> dict:
    return {
        "id": question.id,
        "question_number": question.question_number,
        "question_text": question.question_text,
        "answer_text": question.answer_text,
        "communication_analysis": _question_analysis(question, db),
    }


# --------------------------------------------------
# 1. Generate Interview
# --------------------------------------------------

@router.post("/generate")
def generate_interview(
    resume_id: int,
    interview_type: str = "Technical",
    difficulty: str = "Medium",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # Find the candidate's resume
    resume = (
        db.query(Resume)
        .filter(
            Resume.id == resume_id,
            Resume.user_id == current_user.id
        )
        .first()
    )

    if not resume:
        raise HTTPException(
            status_code=404,
            detail="Resume not found"
        )

    # Check that skills exist
    if not resume.skills:
        raise HTTPException(
            status_code=400,
            detail="No skills found in resume"
        )

    # Convert stored comma-separated skills into a list
    skills = [
        skill.strip()
        for skill in resume.skills.split(",")
        if skill.strip()
    ]

    # Generate questions
    if interview_type == "Technical":

        questions = generate_resume_based_questions(
            skills=skills,
            experience=resume.experience or "",
            difficulty=difficulty
        )

    elif interview_type == "HR":

        questions = generate_hr_questions()

    elif interview_type == "Behavioral":

        questions = generate_behavioral_questions()

    elif interview_type == "Aptitude":

        questions = generate_aptitude_questions()

    else:

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid interview type. "
                "Choose Technical, HR, Behavioral, or Aptitude."
            )
        )

    # Make sure questions were generated
    if not questions:
        raise HTTPException(
            status_code=400,
            detail="No questions could be generated for this interview"
        )

    # Store questions as text
    questions_text = "\n".join(
        f"{i}. {question}"
        for i, question in enumerate(questions, start=1)
    )

    # Create interview record
    interview = Interview(
        user_id=current_user.id,
        resume_id=resume.id,
        interview_type=interview_type,
        difficulty=difficulty,
        questions=questions_text
    )

    # Save interview first
    db.add(interview)
    db.commit()
    db.refresh(interview)

    # --------------------------------------------------
    # Save each generated question
    # --------------------------------------------------

    for index, question_text in enumerate(questions, start=1):

        question = InterviewQuestion(
            interview_id=interview.id,
            question_number=index,
            question_text=question_text
        )

        db.add(question)

    # Save all questions
    db.commit()

    return {
        "message": f"{interview_type} interview generated successfully",
        "interview_id": interview.id,
        "resume_id": resume.id,
        "interview_type": interview_type,
        "difficulty": difficulty,
        "skills": skills,
        "questions": questions
    }


# --------------------------------------------------
# 2. Start Interview
# --------------------------------------------------

@router.post("/{interview_id}/start")
def start_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.user_id == current_user.id
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=404,
            detail="Interview not found"
        )

    # Do not allow already completed interviews to restart
    if interview.status == "completed":
        raise HTTPException(
            status_code=400,
            detail="Interview has already been completed"
        )

    # ---------------------------------------------------------
    # Repair older interviews that have questions stored in
    # interviews.questions but not in interview_questions
    # ---------------------------------------------------------

    existing_questions = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.interview_id == interview.id
        )
        .order_by(InterviewQuestion.question_number)
        .all()
    )

    if not existing_questions and interview.questions:
        question_lines = [
            line.strip()
            for line in interview.questions.splitlines()
            if line.strip()
        ]

        for index, question_text in enumerate(
            question_lines,
            start=1
        ):
            # Remove "1. ", "2. ", etc.
            if ". " in question_text:
                prefix, remaining = question_text.split(
                    ". ",
                    1
                )

                if prefix.isdigit():
                    question_text = remaining

            question = InterviewQuestion(
                interview_id=interview.id,
                question_number=index,
                question_text=question_text
            )

            db.add(question)

        db.commit()

    # ---------------------------------------------------------
    # Start the interview
    # ---------------------------------------------------------

    interview.status = "started"
    if interview.started_at is None:
        interview.started_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(interview)

    # Get questions after repair
    questions = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.interview_id == interview.id
        )
        .order_by(InterviewQuestion.question_number)
        .all()
    )

    return {
        "interview_id": interview.id,
        "interview_type": interview.interview_type,
        "difficulty": interview.difficulty,
        "status": interview.status,
        "started_at": interview.started_at,
        "questions": [_serialize_question(question, db) for question in questions]
    }


# --------------------------------------------------
# 3. Get Interview Questions
# --------------------------------------------------

@router.get("/{interview_id}/questions")
def get_interview_questions(
    interview_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # Find interview
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.user_id == current_user.id
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=404,
            detail="Interview not found"
        )

    # Interview must be started
    if interview.status != "started":
        raise HTTPException(
            status_code=400,
            detail="Interview has not been started"
        )

    # Get questions
    questions = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.interview_id == interview_id
        )
        .order_by(
            InterviewQuestion.question_number
        )
        .all()
    )

    return {
        "interview_id": interview.id,
        "interview_type": interview.interview_type,
        "difficulty": interview.difficulty,
        "status": interview.status,
        "started_at": interview.started_at,

        "questions": [_serialize_question(question, db) for question in questions]
    }


# --------------------------------------------------
# 4. Submit Answer
# --------------------------------------------------

@router.post("/{interview_id}/questions/{question_id}/answer")
def submit_answer(
    interview_id: int,
    question_id: int,
    answer: AnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # Check whether the interview belongs to
    # the currently logged-in user
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.user_id == current_user.id
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=404,
            detail="Interview not found"
        )

    # Interview must be started
    if interview.status != "started":
        raise HTTPException(
            status_code=400,
            detail="Interview has not been started"
        )

    # Find the question
    question = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.id == question_id,
            InterviewQuestion.interview_id == interview_id
        )
        .first()
    )

    if not question:
        raise HTTPException(
            status_code=404,
            detail="Question not found"
        )

    # Typed answers remain a first-class fallback and replace any prior voice submission.
    old_recordings = db.query(AnswerRecording).filter(AnswerRecording.question_id == question.id).all()
    for old_recording in old_recordings:
        remove_audio_file(old_recording.audio_filename)
        db.delete(old_recording)

    # Save answer
    question.answer_text = answer.answer_text

    db.commit()
    db.refresh(question)

    return {
        "message": "Answer submitted successfully",
        "interview_id": interview_id,
        "question_id": question.id,
        "question_number": question.question_number,
        "answer_text": question.answer_text
    }


@router.post("/{interview_id}/questions/{question_id}/audio")
async def upload_answer_audio(
    interview_id: int,
    question_id: int,
    audio: UploadFile = File(...),
    duration_seconds: float | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store and transcribe one candidate-owned answer recording."""
    interview = db.query(Interview).filter(
        Interview.id == interview_id,
        Interview.user_id == current_user.id,
    ).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    if interview.status != "started":
        raise HTTPException(status_code=400, detail="Interview has not been started")

    question = db.query(InterviewQuestion).filter(
        InterviewQuestion.id == question_id,
        InterviewQuestion.interview_id == interview_id,
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    mime_type = (audio.content_type or "").split(";", 1)[0].strip().lower()
    extensions = {
        "audio/webm": ".webm", "video/webm": ".webm",
        "audio/ogg": ".ogg", "application/ogg": ".ogg",
        "audio/mp4": ".mp4", "video/mp4": ".mp4",
        "audio/wav": ".wav", "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
    }
    if mime_type not in extensions:
        raise HTTPException(status_code=415, detail="Unsupported audio format. Use WebM, Ogg, MP4, WAV, or MP3 audio.")

    max_bytes = 15 * 1024 * 1024
    payload = await audio.read(max_bytes + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded audio file is empty.")
    if len(payload) > max_bytes:
        raise HTTPException(status_code=413, detail="Audio files must be 15 MB or smaller.")
    if duration_seconds is not None and (duration_seconds <= 0 or duration_seconds > 600):
        raise HTTPException(status_code=422, detail="Recording duration must be between 0 and 600 seconds.")

    audio_dir = get_audio_directory()
    filename = f"{uuid4().hex}{extensions[mime_type]}"
    saved_path = audio_dir / filename
    saved_path.write_bytes(payload)

    try:
        transcript, detected_duration = await run_in_threadpool(transcribe_audio, saved_path)
        measured_duration = detected_duration or duration_seconds
        if measured_duration and measured_duration > 600:
            raise SpeechTranscriptionError("Recordings must be 10 minutes or shorter.")
        analysis = analyze_transcript(transcript, measured_duration)
        recording = AnswerRecording(
            interview_id=interview.id,
            question_id=question.id,
            user_id=current_user.id,
            audio_filename=filename,
            transcript=transcript,
            word_count=analysis["word_count"],
            sentence_count=analysis["sentence_count"],
            duration_seconds=analysis["duration_seconds"],
            speaking_rate_wpm=analysis["speaking_rate_wpm"],
            pace=analysis["pace"],
            filler_count=analysis["filler_count"],
            filler_words=analysis["filler_words"],
            filler_rate_percent=analysis["filler_rate_percent"],
            clarity_score=analysis["clarity_score"],
            meaningful_content=int(analysis["meaningful_content"]),
            communication_score=analysis["communication_score"],
            feedback=analysis["feedback"],
        )
        # One active answer per question; stale voice submissions are removed on replacement.
        for previous in db.query(AnswerRecording).filter(AnswerRecording.question_id == question.id).all():
            remove_audio_file(previous.audio_filename)
            db.delete(previous)
        question.answer_text = transcript
        db.add(recording)
        db.commit()
        db.refresh(recording)
    except SpeechTranscriptionError as exc:
        db.rollback()
        saved_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        saved_path.unlink(missing_ok=True)
        logger.exception("Audio answer could not be processed")
        raise HTTPException(status_code=500, detail="Audio answer could not be saved. Please try again or type your answer.") from exc

    return {
        "message": "Audio answer transcribed and saved successfully",
        "interview_id": interview.id,
        "question_id": question.id,
        "answer_text": transcript,
        "audio": {
            "recording_id": recording.id,
            "filename": recording.audio_filename,
            "created_at": recording.created_at,
        },
        "analysis": {"source": "speech", "transcript": transcript, **analysis},
    }


# --------------------------------------------------
# 5. Complete Interview
# --------------------------------------------------

@router.post("/{interview_id}/complete")
def complete_interview(
    interview_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # Find interview
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.user_id == current_user.id
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=404,
            detail="Interview not found"
        )

    # Interview must be started
    if interview.status != "started":
        raise HTTPException(
            status_code=400,
            detail="Interview is not currently active"
        )

    # Get all questions
    questions = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.interview_id == interview_id
        )
        .order_by(
            InterviewQuestion.question_number
        )
        .all()
    )

    # Check whether all questions have answers
    unanswered_questions = [
        question
        for question in questions
        if not question.answer_text
        or not question.answer_text.strip()
    ]

    if unanswered_questions:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{len(unanswered_questions)} "
                "question(s) are still unanswered"
            )
        )

    # Mark interview as completed
    interview.status = "completed"
    interview.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(interview)

    return {
        "message": "Interview completed successfully",
        "interview_id": interview.id,
        "status": interview.status,
        "started_at": interview.started_at,
        "completed_at": interview.completed_at,
        "total_questions": len(questions)
    }


# --------------------------------------------------
# 6. Evaluate Interview
# --------------------------------------------------

@router.post("/{interview_id}/evaluate")
def evaluate_interview(
    interview_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # Find interview
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.user_id == current_user.id
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=404,
            detail="Interview not found"
        )

    # Interview must be completed
    if interview.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Interview must be completed before evaluation"
        )

    # Get all questions
    questions = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.interview_id == interview_id
        )
        .order_by(
            InterviewQuestion.question_number
        )
        .all()
    )

    if not questions:
        raise HTTPException(
            status_code=400,
            detail="No questions found for this interview"
        )

    # Check answers
    unanswered_questions = [
        question
        for question in questions
        if not question.answer_text
        or not question.answer_text.strip()
    ]

    if unanswered_questions:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{len(unanswered_questions)} "
                "question(s) are unanswered"
            )
        )

    # Store individual scores
    communication_scores = []
    confidence_scores = []
    technical_scores = []
    professionalism_scores = []

    # Evaluate every question
    for question in questions:

        answer = question.answer_text

        speech_recording = (
            db.query(AnswerRecording)
            .filter(AnswerRecording.question_id == question.id)
            .order_by(AnswerRecording.created_at.desc())
            .first()
        )
        communication = (
            speech_recording.communication_score
            if speech_recording
            else calculate_communication_score(answer)
        )

        confidence = calculate_confidence_score(
            answer
        )

        technical = calculate_technical_score(
            question.question_text,
            answer
        )

        professionalism = calculate_professionalism_score(
            answer
        )

        communication_scores.append(communication)
        confidence_scores.append(confidence)
        technical_scores.append(technical)
        professionalism_scores.append(professionalism)

    # Calculate averages
    communication_score = round(
        sum(communication_scores)
        / len(communication_scores),
        2
    )

    confidence_score = round(
        sum(confidence_scores)
        / len(confidence_scores),
        2
    )

    technical_score = round(
        sum(technical_scores)
        / len(technical_scores),
        2
    )

    professionalism_score = round(
        sum(professionalism_scores)
        / len(professionalism_scores),
        2
    )

    # Calculate weighted overall score
    overall_score = calculate_overall_score(
        communication_score,
        confidence_score,
        technical_score,
        professionalism_score
    )

    # Rating
    rating = get_score_rating(overall_score)

    # Generate feedback
    feedback = generate_feedback(
        communication_score,
        confidence_score,
        technical_score,
        professionalism_score
    )

    # Check whether evaluation already exists
    existing_score = (
        db.query(InterviewScore)
        .filter(
            InterviewScore.interview_id == interview_id
        )
        .first()
    )

    if existing_score:

        existing_score.communication_score = communication_score
        existing_score.confidence_score = confidence_score
        existing_score.technical_score = technical_score
        existing_score.professionalism_score = professionalism_score
        existing_score.overall_score = overall_score
        existing_score.feedback = feedback

        score = existing_score

    else:

        score = InterviewScore(
            interview_id=interview_id,
            communication_score=communication_score,
            confidence_score=confidence_score,
            technical_score=technical_score,
            professionalism_score=professionalism_score,
            overall_score=overall_score,
            feedback=feedback
        )

        db.add(score)

    db.commit()
    db.refresh(score)

    return {
        "message": "Interview evaluated successfully",
        "interview_id": interview_id,
        "score_id": score.id,

        "scores": {
            "communication": communication_score,
            "confidence": confidence_score,
            "technical_relevance": technical_score,
            "professionalism": professionalism_score,
            "overall": overall_score,
            "rating": rating
        },

        "feedback": feedback
    }


# --------------------------------------------------
# 7. Get Interview Result
# --------------------------------------------------

@router.get("/{interview_id}/result")
def get_interview_result(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.user_id == current_user.id
        )
        .first()
    )

    if not interview:
        raise HTTPException(
            status_code=404,
            detail="Interview not found"
        )

    if interview.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Interview is not completed yet"
        )

    score = (
        db.query(InterviewScore)
        .filter(
            InterviewScore.interview_id == interview_id
        )
        .first()
    )

    if not score:
        raise HTTPException(
            status_code=404,
            detail="Interview has not been evaluated yet"
        )

    rating = get_score_rating(score.overall_score)

    questions = (
        db.query(InterviewQuestion)
        .filter(InterviewQuestion.interview_id == interview_id)
        .order_by(InterviewQuestion.question_number)
        .all()
    )
    recordings = []
    for question in questions:
        recording = (
            db.query(AnswerRecording)
            .filter(AnswerRecording.question_id == question.id)
            .order_by(AnswerRecording.created_at.desc())
            .first()
        )
        if recording:
            recordings.append(recording)
    speech_words = sum(recording.word_count for recording in recordings)
    speech_duration = sum(recording.duration_seconds or 0 for recording in recordings)
    combined_fillers = {}
    for recording in recordings:
        for phrase, count in (recording.filler_words or {}).items():
            combined_fillers[phrase] = combined_fillers.get(phrase, 0) + count
    speech_analyses = [
        {
            "question_number": question.question_number,
            "transcript": recording.transcript,
            "word_count": recording.word_count,
            "sentence_count": recording.sentence_count,
            "duration_seconds": recording.duration_seconds,
            "speaking_rate_wpm": recording.speaking_rate_wpm,
            "pace": recording.pace,
            "filler_count": recording.filler_count,
            "filler_words": recording.filler_words or {},
            "filler_rate_percent": recording.filler_rate_percent,
            "clarity_score": recording.clarity_score,
            "communication_score": recording.communication_score,
            "feedback": recording.feedback,
        }
        for question in questions
        for recording in recordings
        if recording.question_id == question.id
    ]
    speech_average_score = (
        round(sum(recording.communication_score for recording in recordings) / len(recordings), 1)
        if recordings else None
    )
    speech_feedback = (
        " ".join(dict.fromkeys(recording.feedback for recording in recordings if recording.feedback))
        if recordings else "No speech recordings were submitted; the communication score uses the existing answer-text heuristic."
    )

    return {
        "interview_id": interview.id,
        "status": interview.status,
        "score_id": score.id,

        "scores": {
            "communication": score.communication_score,
            "confidence": score.confidence_score,
            "technical_relevance": score.technical_score,
            "professionalism": score.professionalism_score,
            "overall": score.overall_score,
            "rating": rating
        },

        "feedback": score.feedback,
        "communication_analysis": {
            "available": bool(recordings),
            "answers": speech_analyses,
            "word_count": speech_words,
            "duration_seconds": round(speech_duration, 2) if speech_duration else None,
            "speaking_rate_wpm": round(speech_words * 60 / speech_duration, 1) if speech_duration else None,
            "filler_count": sum(combined_fillers.values()),
            "filler_words": combined_fillers,
            "communication_score": speech_average_score,
            "feedback": speech_feedback,
        }
    }


# --------------------------------------------------
# 8. Get My Interviews
# --------------------------------------------------

@router.get("/my-interviews")
def get_my_interviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    interviews = (
        db.query(Interview)
        .filter(
            Interview.user_id == current_user.id
        )
        .order_by(
            Interview.created_at.desc()
        )
        .all()
    )

    return [
        {
            "id": interview.id,
            "resume_id": interview.resume_id,
            "interview_type": interview.interview_type,
            "difficulty": interview.difficulty,
            "status": interview.status,
            "created_at": interview.created_at,
            "started_at": interview.started_at,
            "completed_at": interview.completed_at
        }
        for interview in interviews
    ]
