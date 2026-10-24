from django.contrib.auth.models import AbstractUser
from django.db import models
class User(AbstractUser):
    ROLE_CHOICES = (
        ('candidate', 'Candidate'),
        ('recruiter', 'Recruiter'),
        ('admin', 'Admin'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='candidate')
    full_name = models.CharField(max_length=255, blank=True)
    def __str__(self):
        return self.email
    #resume upload
class Resume(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='resumes')
    file = models.FileField(upload_to='resumes/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    extracted_skills = models.TextField(blank=True)
    summary = models.TextField(blank=True)

class Interview(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='interviews')
    resume = models.ForeignKey(Resume, on_delete=models.CASCADE, related_name='interviews')
    questions = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Interview for {self.user.email} ({self.created_at})"

    def __str__(self):
        return f"{self.user.email} - {self.file.name}"

class InterviewResult(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='interview_results')
    history = models.JSONField(default=list)
    overall_score = models.FloatField(default=0)
    communication = models.IntegerField(default=0)
    confidence = models.IntegerField(default=0)
    technical = models.IntegerField(default=0)
    professionalism = models.IntegerField(default=0)
    strengths = models.TextField(blank=True)
    improvements = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    difficulty = models.CharField(max_length=10, default='medium')
    round_type = models.CharField(max_length=20, default='technical')

    def __str__(self):
        return f"{self.user.email} - {self.overall_score}"