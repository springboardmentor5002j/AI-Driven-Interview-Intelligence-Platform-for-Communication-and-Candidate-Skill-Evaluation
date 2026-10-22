from django.urls import path
from .views import (
    GenerateInterviewView, InterviewSessionListView, InterviewSessionDetailView,
    StartInterviewView, SubmitAnswerView, UploadRecordingView, MotionMetricsView, CompleteInterviewView,
    InterviewReportView, DograhWebhookView, RecruiterCandidateListView,
    RecruiterCandidateReportView, RecruiterCompareView, AdminAllSessionsView,
)

urlpatterns = [
    path("generate/", GenerateInterviewView.as_view(), name="interview-generate"),
    path("", InterviewSessionListView.as_view(), name="interview-list"),
    path("<int:pk>/", InterviewSessionDetailView.as_view(), name="interview-detail"),
    path("<int:pk>/start/", StartInterviewView.as_view(), name="interview-start"),
    path("<int:pk>/questions/<int:question_id>/answer/", SubmitAnswerView.as_view(), name="interview-submit-answer"),
    path("<int:pk>/upload-recording/", UploadRecordingView.as_view(), name="interview-upload-recording"),
    path("<int:pk>/motion-metrics/", MotionMetricsView.as_view(), name="interview-motion-metrics"),
    path("<int:pk>/complete/", CompleteInterviewView.as_view(), name="interview-complete"),
    path("<int:pk>/report/", InterviewReportView.as_view(), name="interview-report"),
    path("<int:pk>/voice-webhook/", DograhWebhookView.as_view(), name="interview-voice-webhook"),
    path("recruiter/candidates/", RecruiterCandidateListView.as_view(), name="recruiter-candidates"),
    path("recruiter/candidates/<int:candidate_id>/", RecruiterCandidateReportView.as_view(), name="recruiter-candidate-report"),
    path("recruiter/compare/", RecruiterCompareView.as_view(), name="recruiter-compare"),
    path("admin/sessions/", AdminAllSessionsView.as_view(), name="admin-sessions"),
]
