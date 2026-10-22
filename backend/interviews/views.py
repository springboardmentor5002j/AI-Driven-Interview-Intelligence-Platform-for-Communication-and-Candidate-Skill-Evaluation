import hmac
import logging
import math
import os
import tempfile
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import RecruiterCandidateAccess
from accounts.permissions import IsAdminRole, IsRecruiter
from resumes.models import Resume

from .models import InterviewQuestion, InterviewScore, InterviewSession
from .reports import build_interview_report_pdf
from .scoring import assess_session
from .serializers import (
    GenerateInterviewSerializer,
    InterviewSessionSerializer,
    SubmitAnswerSerializer,
)
from .speech_analysis import analyze_interview_recording
from .utils import generate_interview_questions

logger = logging.getLogger(__name__)

Status = InterviewSession.Status
DONE_STATUSES = [Status.COMPLETED, Status.ANALYZING, Status.ANALYZED]
ANALYSIS_STALE_AFTER = timedelta(minutes=10)

# Upload limits (override in settings.py if needed).
MAX_VIDEO_BYTES = getattr(settings, "MAX_VIDEO_UPLOAD_BYTES", 200 * 1024 * 1024)
MAX_AUDIO_BYTES = getattr(settings, "MAX_AUDIO_UPLOAD_BYTES", 50 * 1024 * 1024)
ALLOWED_VIDEO_TYPES = {"video/webm", "video/mp4", "video/x-matroska", "video/quicktime"}
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav",
    "audio/x-wav", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/flac",
    # MediaRecorder sometimes labels audio-only WebM as video/webm.
    "video/webm",
}
ALLOWED_EXTENSIONS = {
    ".webm", ".mp4", ".mkv", ".mov", ".ogg", ".opus", ".mp3", ".wav", ".m4a", ".flac",
}


def _own_session(user, pk):
    return InterviewSession.objects.filter(pk=pk, candidate=user).first()


def _not_found():
    return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)


def _validate_upload(file, allowed_types, max_bytes, label):
    """Returns an error string, or None if the file is acceptable."""
    if file.size == 0:
        return f"The {label} file is empty."
    if file.size > max_bytes:
        return f"The {label} file is too large (limit {max_bytes // (1024 * 1024)} MB)."
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in allowed_types:
        return f"Unsupported {label} file type."
    name = (file.name or "").lower()
    if not any(name.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        return f"Unsupported {label} file extension."

    # MIME type and extension are client-controlled; verify a lightweight file signature.
    try:
        position = file.tell()
        header = file.read(16)
        file.seek(position)
    except (AttributeError, OSError):
        return f"Could not validate the {label} file. Please try again."
    is_ebml = header.startswith(b"\x1a\x45\xdf\xa3")  # WebM / Matroska
    is_mp4 = len(header) >= 8 and header[4:8] == b"ftyp"
    is_ogg = header.startswith(b"OggS")
    is_wav = header.startswith(b"RIFF") and header[8:12] == b"WAVE"
    is_flac = header.startswith(b"fLaC")
    is_mp3 = header.startswith(b"ID3") or (len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0)
    valid_signature = (
        (content_type in {"video/webm", "audio/webm", "video/x-matroska"} and is_ebml)
        or (content_type in {"video/mp4", "video/quicktime", "audio/mp4", "audio/m4a", "audio/x-m4a"} and is_mp4)
        or (content_type in {"audio/ogg"} and is_ogg)
        or (content_type in {"audio/wav", "audio/x-wav"} and is_wav)
        or (content_type == "audio/flac" and is_flac)
        or (content_type in {"audio/mpeg", "audio/mp3"} and is_mp3)
        or (content_type == "audio/opus" and is_ogg)
    )
    if not valid_signature:
        return f"The {label} file content does not match its declared format."
    return None


def _analyse_recording_from_storage(recording):
    """FFmpeg needs a local path; this also supports S3-backed FileFields on Windows."""
    suffix = os.path.splitext(recording.name or "")[1] or ".webm"
    fd, local_path = tempfile.mkstemp(suffix=suffix, prefix="smarthire-audio-")
    os.close(fd)
    try:
        recording.open("rb")
        try:
            with open(local_path, "wb") as temp:
                for chunk in recording.chunks():
                    temp.write(chunk)
        finally:
            recording.close()
        return analyze_interview_recording(local_path)
    finally:
        try:
            os.remove(local_path)
        except OSError:
            logger.warning("Could not remove temporary recording file %s", local_path)


# ----------------------------------------------------------- candidate flow
class GenerateInterviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = GenerateInterviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data

        resume = None
        if v.get("resume_id"):
            resume = Resume.objects.filter(pk=v["resume_id"], candidate=request.user).first()

        # Generate first so a slow/failed AI call never leaves an empty session behind.
        questions = generate_interview_questions(
            interview_type=v["interview_type"], difficulty=v["difficulty"],
            domain=v.get("domain", ""), resume=resume, count=v["question_count"],
        )

        with transaction.atomic():
            session = InterviewSession.objects.create(
                candidate=request.user, resume=resume,
                interview_type=v["interview_type"], difficulty=v["difficulty"],
                domain=v.get("domain", ""),
            )
            InterviewQuestion.objects.bulk_create([
                InterviewQuestion(session=session, question_text=q, order=i)
                for i, q in enumerate(questions)
            ])

        return Response(InterviewSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class InterviewSessionListView(generics.ListAPIView):
    serializer_class = InterviewSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            InterviewSession.objects.filter(candidate=self.request.user)
            .select_related("score").prefetch_related("questions").order_by("-id")
        )


class InterviewSessionDetailView(generics.RetrieveAPIView):
    serializer_class = InterviewSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            InterviewSession.objects.filter(candidate=self.request.user)
            .select_related("score").prefetch_related("questions")
        )


class StartInterviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        with transaction.atomic():
            session = (
                InterviewSession.objects.select_for_update()
                .filter(pk=pk, candidate=request.user).first()
            )
            if session is None:
                return _not_found()
            if session.status == Status.SCHEDULED:
                session.status = Status.IN_PROGRESS
                session.started_at = timezone.now()
                session.save(update_fields=["status", "started_at"])
            elif session.status != Status.IN_PROGRESS:
                return Response(
                    {"detail": "This interview has already been completed."},
                    status=status.HTTP_409_CONFLICT,
                )
            # A repeated start on an in-progress session is a no-op: started_at is kept.
        return Response(InterviewSessionSerializer(session).data)


class SubmitAnswerView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, question_id):
        serializer = SubmitAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question = (
            InterviewQuestion.objects.select_related("session")
            .filter(pk=question_id, session_id=pk, session__candidate=request.user).first()
        )
        if question is None:
            return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)
        if question.session.status in (Status.ANALYZING, Status.ANALYZED):
            return Response(
                {"detail": "This interview has already been analysed."},
                status=status.HTTP_409_CONFLICT,
            )

        question.candidate_answer_transcript = serializer.validated_data["transcript"]
        question.save(update_fields=["candidate_answer_transcript"])
        return Response({"detail": "saved"})


class UploadRecordingView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        session = _own_session(request.user, pk)
        if session is None:
            return _not_found()
        if session.status in (Status.ANALYZING, Status.ANALYZED):
            return Response(
                {"detail": "This interview has already been analysed."},
                status=status.HTTP_409_CONFLICT,
            )

        video = request.FILES.get("recording")
        audio = request.FILES.get("audio_recording")
        if not video and not audio:
            return Response(
                {"detail": "No recording files were provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        errors = {}
        if video:
            err = _validate_upload(video, ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, "video")
            if err:
                errors["recording"] = err
        if audio:
            err = _validate_upload(audio, ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES, "audio")
            if err:
                errors["audio_recording"] = err
        if errors:
            return Response(
                {"detail": "Invalid recording upload.", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if video:
            session.video_recording = video
        if audio:
            session.audio_recording = audio
        session.save()

        return Response({
            "detail": "Recording files saved.",
            "video_saved": bool(video),
            "audio_saved": bool(audio),
        })


class MotionMetricsView(APIView):
    """Accept low-resolution frame-difference counts; no frames or facial inferences are uploaded."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        session = _own_session(request.user, pk)
        if session is None:
            return _not_found()
        if session.status not in (Status.IN_PROGRESS, Status.COMPLETED):
            return Response({"detail": "Motion metrics can only be saved during an active interview."},
                            status=status.HTTP_409_CONFLICT)
        payload = request.data
        try:
            sample_count = int(payload.get("sample_count", 0))
            motion_frame_count = int(payload.get("motion_frame_count", 0))
            motion_ratio = float(payload.get("motion_ratio", 0))
            mean_delta = float(payload.get("mean_delta", 0))
        except (TypeError, ValueError):
            return Response({"detail": "Motion metrics must be numeric."}, status=400)
        if not (0 <= sample_count <= 100000 and 0 <= motion_frame_count <= sample_count
                and math.isfinite(motion_ratio) and 0 <= motion_ratio <= 1
                and math.isfinite(mean_delta) and 0 <= mean_delta <= 255):
            return Response({"detail": "Motion metrics are outside accepted limits."}, status=400)
        session.motion_metrics = {
            "sample_count": sample_count,
            "motion_frame_count": motion_frame_count,
            "motion_ratio": round(motion_ratio, 4),
            "mean_delta": round(mean_delta, 3),
            "method": "client-side frame-difference",
            "purpose": "observational only; not used for confidence, emotion, or hiring decisions",
        }
        session.save(update_fields=["motion_metrics"])
        return Response({"detail": "Motion summary saved.", "motion_metrics": session.motion_metrics})


class CompleteInterviewView(APIView):
    """
    Finish an interview: transcribe, compute communication metrics, score.

    Safe to call more than once:
      * already analysed + scored  -> returns the stored result, no re-run
      * analysis running elsewhere -> 409
      * transcript stored, no score -> only the scoring step is retried
      * earlier failure            -> full retry
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        now = timezone.now()

        with transaction.atomic():
            interview = (
                InterviewSession.objects.select_for_update()
                .filter(pk=pk, candidate=request.user).first()
            )
            if interview is None:
                return _not_found()

            if interview.status == Status.ANALYZED and \
                    InterviewScore.objects.filter(session=interview).exists():
                return Response(InterviewSessionSerializer(interview).data)

            if interview.status == Status.ANALYZING and interview.analysis_started_at \
                    and now - interview.analysis_started_at < ANALYSIS_STALE_AFTER:
                return Response(
                    {"detail": "Analysis is already in progress. Please wait."},
                    status=status.HTTP_409_CONFLICT,
                )

            # completed_at is set once so retries do not change the duration.
            interview.completed_at = interview.completed_at or now
            interview.status = Status.ANALYZING
            interview.analysis_started_at = now
            interview.analysis_error = ""
            interview.save(update_fields=[
                "completed_at", "status", "analysis_started_at", "analysis_error"])

        error = None

        if not interview.full_transcript:
            recording = interview.audio_recording or interview.video_recording
            if not recording:
                error = ("No audio or video recording was uploaded. "
                         "Check the frontend recording upload.")
            else:
                logger.info("Speech analysis starting for interview %s", interview.pk)
                analysis = _analyse_recording_from_storage(recording)
                interview.communication_notes = analysis.get("communication_notes", "")
                if analysis.get("analysis_success"):
                    interview.full_transcript = analysis["transcript"]
                    interview.filler_word_count = analysis.get("filler_word_count")
                    interview.filler_words_found = analysis.get("filler_words_found", [])
                    interview.grammar_issues = analysis.get("grammar_issues", [])
                    interview.grammar_checked = analysis.get("grammar_checked", False)
                    interview.speaking_pace_wpm = analysis.get("speaking_pace_wpm")
                    interview.speaking_seconds = analysis.get("speaking_seconds")
                    interview.word_count = analysis.get("word_count")
                    interview.long_pause_count = analysis.get("long_pause_count")
                    interview.pause_ratio = analysis.get("pause_ratio")
                    interview.pronunciation_estimate = analysis.get("pronunciation_estimate")
                else:
                    error = analysis.get("communication_notes") or \
                        "Speech analysis could not be completed."

        if error is None:
            try:
                assess_session(interview)
                interview.status = Status.ANALYZED
            except Exception:
                logger.exception("Scoring failed for interview %s", interview.pk)
                # Transcript is kept, so the next call retries scoring only.
                # Do not mark the session analysed unless scoring actually succeeded.
                interview.status = Status.COMPLETED
                error = "Scoring could not be completed. Please try again."
        else:
            interview.status = Status.COMPLETED

        interview.analysis_error = error or ""
        interview.save()

        if not error and getattr(settings, "EMAIL_NOTIFICATIONS_ENABLED", False) and interview.candidate.email:
            try:
                score = InterviewScore.objects.filter(session=interview).first()
                score_line = f" Overall score: {score.overall_score}/100." if score and score.overall_score is not None else ""
                send_mail(
                    subject="Your SmartHire interview report is ready",
                    message=f"Your {interview.interview_type} mock interview has been analysed.{score_line} Sign in to SmartHire to review feedback and download your report.",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[interview.candidate.email],
                    fail_silently=False,
                )
            except Exception:
                logger.exception("Interview notification email failed for session %s", interview.pk)

        interview = InterviewSession.objects.select_related("score").get(pk=interview.pk)
        data = InterviewSessionSerializer(interview).data
        if error:
            data["analysis_error"] = error
        return Response(data, status=status.HTTP_200_OK)


class InterviewReportView(APIView):
    """GET /api/interviews/<pk>/report/ -> PDF of the candidate's own report."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        session = (
            InterviewSession.objects.select_related("score", "candidate")
            .filter(pk=pk, candidate=request.user).first()
        )
        if session is None:
            return _not_found()
        score = getattr(session, "score", None)
        if score is None:
            return Response(
                {"detail": "No score is available for this interview yet."},
                status=status.HTTP_409_CONFLICT,
            )
        pdf = build_interview_report_pdf(session, score)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="interview-{session.pk}-report.pdf"'
        return response


class DograhWebhookView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        secret = getattr(settings, "DOGRAH_WEBHOOK_SECRET", "") or ""
        supplied = request.headers.get("X-Webhook-Secret", "")
        if not secret or not hmac.compare_digest(supplied, secret):
            return Response({"detail": "Invalid webhook secret."}, status=status.HTTP_401_UNAUTHORIZED)

        session = InterviewSession.objects.filter(pk=pk).first()
        if session is None:
            return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)
        if session.status in (Status.ANALYZING, Status.ANALYZED):
            return Response({"detail": "Session already analysed."}, status=status.HTTP_409_CONFLICT)

        answers = request.data.get("answers", [])
        if isinstance(answers, list):
            for ans in answers[:30]:
                if isinstance(ans, dict):
                    try:
                        order = int(ans.get("question_order"))
                    except (TypeError, ValueError):
                        continue
                    transcript = ans.get("transcript", "")
                    if isinstance(transcript, str):
                        InterviewQuestion.objects.filter(
                            session=session, order=order
                        ).update(candidate_answer_transcript=transcript[:10000])

        session.status = Status.COMPLETED
        session.completed_at = session.completed_at or timezone.now()
        session.save()
        return Response(InterviewSessionSerializer(session).data)


# ------------------------------------------------------------- recruiter
def recruiter_visible_sessions(user):
    """
    SINGLE CHOKE POINT for recruiter data access.

    A recruiter sees only completed sessions of candidates who have a
    RecruiterCandidateAccess row for them (candidate shared, or admin assigned).
    No rows -> no candidates. (accounts.RecruiterCandidateAccess has a unique
    constraint per pair, so this join cannot duplicate sessions.)
    """
    return InterviewSession.objects.filter(
        status__in=DONE_STATUSES,
        candidate__recruiter_access__recruiter=user,
    )


class RecruiterCandidateListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsRecruiter]

    def get(self, request):
        sessions = (
            recruiter_visible_sessions(request.user)
            .select_related("candidate", "score")
            .order_by("candidate__username", "-completed_at")
        )
        candidates = {}
        for s in sessions:
            uid = s.candidate.id
            if uid not in candidates:
                candidates[uid] = {
                    "candidate_id": uid, "username": s.candidate.username,
                    "email": s.candidate.email, "completed_interviews": 0,
                    "latest_overall_score": None,
                }
            candidates[uid]["completed_interviews"] += 1
            score = getattr(s, "score", None)
            if candidates[uid]["latest_overall_score"] is None and score is not None:
                candidates[uid]["latest_overall_score"] = score.overall_score
        return Response(list(candidates.values()))


class RecruiterCandidateReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsRecruiter]

    def get(self, request, candidate_id):
        # 404 (not an empty list) when there is no grant, so a recruiter cannot
        # tell which candidate ids exist.
        if not RecruiterCandidateAccess.objects.filter(
            recruiter=request.user, candidate_id=candidate_id
        ).exists():
            return Response({"detail": "Candidate not found."}, status=status.HTTP_404_NOT_FOUND)

        sessions = (
            recruiter_visible_sessions(request.user)
            .filter(candidate_id=candidate_id)
            .select_related("score").prefetch_related("questions")
            .order_by("-completed_at")
        )
        return Response(InterviewSessionSerializer(sessions, many=True).data)


class RecruiterCompareView(APIView):
    """
    GET /recruiter/compare/?candidate_ids=1,2,3[&interview_type=technical&difficulty=medium&domain=...]

    Only like-for-like results are returned: each candidate's most recent
    scored session of the SAME interview type (and difficulty/domain when
    given). If interview_type is omitted, the most common type among the
    candidates' latest scored sessions is used. Candidates without a
    comparable scored session - or that this recruiter has no access to -
    are silently omitted. Response stays a list.
    """
    permission_classes = [permissions.IsAuthenticated, IsRecruiter]
    MAX_CANDIDATES = 10

    def get(self, request):
        raw = request.query_params.get("candidate_ids", "")
        try:
            ids = list(dict.fromkeys(int(i) for i in raw.split(",") if i.strip()))
        except ValueError:
            return Response({"detail": "candidate_ids must be comma-separated integers."},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(ids) > self.MAX_CANDIDATES:
            return Response({"detail": f"Compare at most {self.MAX_CANDIDATES} candidates."},
                            status=status.HTTP_400_BAD_REQUEST)

        qs = (
            recruiter_visible_sessions(request.user)
            .filter(candidate_id__in=ids, score__isnull=False)
            .select_related("score", "candidate")
            .order_by("-completed_at")
        )
        interview_type = request.query_params.get("interview_type")
        difficulty = request.query_params.get("difficulty")
        domain = request.query_params.get("domain")
        if interview_type:
            qs = qs.filter(interview_type=interview_type)
        if difficulty:
            qs = qs.filter(difficulty=difficulty)
        if domain:
            qs = qs.filter(domain__iexact=domain)

        sessions = list(qs)

        if not interview_type and sessions:
            latest_by_candidate = {}
            for s in sessions:
                latest_by_candidate.setdefault(s.candidate_id, s)
            types = [s.interview_type for s in latest_by_candidate.values()]
            interview_type = max(set(types), key=types.count)
            sessions = [s for s in sessions if s.interview_type == interview_type]

        results, seen = [], set()
        for s in sessions:  # newest first, so first hit per candidate is the latest
            if s.candidate_id in seen:
                continue
            seen.add(s.candidate_id)
            sc = s.score
            results.append({
                "candidate_id": s.candidate_id, "username": s.candidate.username,
                "session_id": s.id, "interview_type": s.interview_type,
                "difficulty": s.difficulty, "domain": s.domain,
                "overall_score": sc.overall_score, "rating": sc.rating,
                "is_partial": sc.is_partial,
                "unavailable_components": sc.unavailable_components,
                "communication_score": sc.communication_score,
                "confidence_score": sc.confidence_score,
                "technical_score": sc.technical_score,
                "professionalism_score": sc.professionalism_score,
            })
        results.sort(key=lambda r: (r["overall_score"] is None, -(r["overall_score"] or 0)))
        return Response(results)


class AdminAllSessionsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        sessions = (
            InterviewSession.objects.select_related("candidate", "score").order_by("-id")[:100]
        )
        data = []
        for s in sessions:
            score = getattr(s, "score", None)
            data.append({
                "id": s.id, "candidate_username": s.candidate.username,
                "interview_type": s.interview_type, "difficulty": s.difficulty,
                "status": s.status,
                "overall_score": score.overall_score if score else None,
            })
        return Response(data)
