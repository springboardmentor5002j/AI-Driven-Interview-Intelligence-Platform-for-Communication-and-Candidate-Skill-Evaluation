from django.urls import path
from .views import ResumeUploadView, ResumeListView, ResumeParseView

urlpatterns = [
    path("upload/", ResumeUploadView.as_view(), name="resume-upload"),
    path("", ResumeListView.as_view(), name="resume-list"),
    path("<int:pk>/parse/", ResumeParseView.as_view(), name="resume-parse"),
]
