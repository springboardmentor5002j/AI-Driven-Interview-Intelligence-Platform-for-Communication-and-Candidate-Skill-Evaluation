import requests
from rest_framework import generics
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth import authenticate, get_user_model
from django.http import HttpResponse
from django.conf import settings
from .serializers import (
    SignupSerializer, ResumeSerializer, InterviewSerializer, InterviewResultSerializer,
)
from .models import Resume, Interview, InterviewResult
from .ai_utils import (
    extract_text_from_pdf,
    extract_skills_and_summary,
    generate_interview_questions,
    generate_followup_question,
    transcribe_audio,
    generate_feedback,
)

User = get_user_model()


class SignupView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = SignupSerializer


class LoginView(APIView):
    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')
        user = authenticate(username=email, password=password)
        if user is None:
            return Response({'detail': 'Invalid email or password'}, status=401)
        refresh = RefreshToken.for_user(user)
        return Response({'token': str(refresh.access_token)})


class IsCandidate(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'candidate'


class IsRecruiter(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('recruiter', 'admin')


class ResumeUploadView(generics.CreateAPIView):
    serializer_class = ResumeSerializer
    permission_classes = [IsCandidate]
    parser_classes = [MultiPartParser, FormParser]

    def perform_create(self, serializer):
        resume = serializer.save(user=self.request.user)
        text = extract_text_from_pdf(resume.file.path)
        skills, summary = extract_skills_and_summary(text)
        resume.extracted_skills = skills
        resume.summary = summary
        resume.save()


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'email': request.user.email,
            'full_name': request.user.full_name,
            'role': request.user.role,
        })


class GenerateInterviewView(generics.CreateAPIView):
    serializer_class = InterviewSerializer
    permission_classes = [IsCandidate]

    def perform_create(self, serializer):
        resume_id = self.request.data.get('resume')
        difficulty = self.request.data.get('difficulty', 'medium')
        resume = Resume.objects.get(id=resume_id, user=self.request.user)
        round_type = self.request.data.get('round_type', 'technical')
        questions = generate_interview_questions(resume.extracted_skills, difficulty, round_type)
        serializer.save(user=self.request.user, resume=resume, questions=questions)


class TranscribeAnswerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        audio_file = request.FILES.get('audio')
        if not audio_file:
            return Response({'detail': 'No audio file provided'}, status=400)
        text = transcribe_audio(audio_file)
        return Response({'transcript': text})


class NextQuestionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        previous_question = request.data.get('previous_question')
        candidate_answer = request.data.get('candidate_answer')
        skills = request.data.get('skills')
        difficulty = request.data.get('difficulty', 'medium')
        round_type = request.data.get('round_type', 'technical')
        next_q = generate_followup_question(previous_question, candidate_answer, skills, difficulty, round_type)

        return Response({'question': next_q})


class InterviewFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        qa_history = request.data.get('history', [])
        skills = request.data.get('skills', '')
        difficulty = request.data.get('difficulty', 'medium')
        confidence_scores = request.data.get('confidence_scores', [])

        try:
            feedback = generate_feedback(qa_history, skills, confidence_scores)
        except Exception as e:
            return Response({'detail': f'Feedback generation failed: {e}'}, status=500)

        try:
            InterviewResult.objects.create(
                user=request.user,
                history=qa_history,
                difficulty=difficulty,
                overall_score=feedback['overall_score'],
                communication=feedback['communication'],
                confidence=feedback['confidence'],
                technical=feedback['technical'],
                professionalism=feedback['professionalism'],
                strengths=feedback['strengths'],
                improvements=feedback['improvements'],
            )
        except Exception as e:
            print("COULD NOT SAVE InterviewResult:", e)

        return Response(feedback)


class CandidateReportsView(generics.ListAPIView):
    serializer_class = InterviewResultSerializer
    permission_classes = [IsRecruiter]
    queryset = InterviewResult.objects.select_related('user').order_by('-overall_score')

class MyHistoryView(generics.ListAPIView):
    serializer_class = InterviewResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return InterviewResult.objects.filter(user=self.request.user).order_by('created_at')


class SpeakView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'detail': 'No text provided'}, status=400)
        r = requests.post(
            f"https://api.deepgram.com/v1/speak?model={settings.DEEPGRAM_VOICE}&encoding=mp3",
            headers={
                "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"text": text[:1000]},
            timeout=30,
        )
        if r.status_code != 200:
            return Response({'detail': f'Deepgram error {r.status_code}: {r.text[:200]}'}, status=502)
        return HttpResponse(r.content, content_type='audio/mpeg')