from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Resume
from .serializers import ResumeSerializer
from .utils import extract_text_from_pdf, extract_resume_data


class ResumeUploadView(generics.CreateAPIView):
    serializer_class = ResumeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(candidate=self.request.user)


class ResumeListView(generics.ListAPIView):
    serializer_class = ResumeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Resume.objects.filter(candidate=self.request.user).order_by("-uploaded_at")


class ResumeParseView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            resume = Resume.objects.get(pk=pk, candidate=request.user)
        except Resume.DoesNotExist:
            return Response({"detail": "Resume not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            text = extract_text_from_pdf(resume.file)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        data = extract_resume_data(text)

        resume.extracted_skills = data.get("skills", [])
        resume.detected_technologies = data.get("technologies", [])
        resume.extracted_experience = data.get("experience", [])
        resume.extracted_education = data.get("education", [])
        resume.ai_summary = data.get("summary", "")
        # Keep the parse action retryable when the AI provider is not configured/available.
        resume.processed = not resume.ai_summary.startswith("AI extraction is currently unavailable.")
        resume.save()

        return Response(ResumeSerializer(resume).data)
