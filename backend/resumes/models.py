from django.conf import settings
from django.db import models


class Resume(models.Model):
    candidate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="resumes"
    )
    file = models.FileField(upload_to="resumes/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    extracted_skills = models.JSONField(default=list, blank=True)
    extracted_experience = models.JSONField(default=list, blank=True)
    extracted_education = models.JSONField(default=list, blank=True)
    detected_technologies = models.JSONField(default=list, blank=True)
    ai_summary = models.TextField(blank=True)
    processed = models.BooleanField(default=False)

    def __str__(self):
        return f"Resume({self.candidate.username}, {self.uploaded_at:%Y-%m-%d})"
