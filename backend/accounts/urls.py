from django.urls import path
from .views import (
    SignupView, LoginView, ResumeUploadView, MeView,
    GenerateInterviewView, TranscribeAnswerView, NextQuestionView,InterviewFeedbackView,CandidateReportsView,SpeakView, MyHistoryView
)

urlpatterns = [
    path('signup/', SignupView.as_view()),
    path('login/', LoginView.as_view()),
    path('resume/upload/', ResumeUploadView.as_view()),
    path('me/', MeView.as_view()),
    path('interview/generate/', GenerateInterviewView.as_view()),
    path('interview/transcribe/', TranscribeAnswerView.as_view()),
    path('interview/next-question/', NextQuestionView.as_view()),
    path('interview/feedback/', InterviewFeedbackView.as_view()),
    path('reports/', CandidateReportsView.as_view()),
    path('interview/speak/', SpeakView.as_view()),
    path('history/', MyHistoryView.as_view()),
]