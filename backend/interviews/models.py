from django.conf import settings
from django.db import models

from .scoring_rules import rating_for, weighted_overall


class InterviewSession(models.Model):
    class InterviewType(models.TextChoices):
        TECHNICAL = "technical", "Technical"
        HR = "hr", "HR"
        BEHAVIORAL = "behavioral", "Behavioral"
        APTITUDE = "aptitude", "Aptitude"

    class Difficulty(models.TextChoices):
        EASY = "easy", "Easy"
        MEDIUM = "medium", "Medium"
        HARD = "hard", "Hard"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        ANALYZING = "analyzing", "Analyzing"
        ANALYZED = "analyzed", "Analyzed"

    candidate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="interview_sessions"
    )
    resume = models.ForeignKey("resumes.Resume", on_delete=models.SET_NULL, null=True, blank=True)
    interview_type = models.CharField(max_length=20, choices=InterviewType.choices)
    difficulty = models.CharField(max_length=10, choices=Difficulty.choices, default=Difficulty.MEDIUM)
    domain = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    video_recording = models.FileField(upload_to="recordings/video/", null=True, blank=True)
    audio_recording = models.FileField(upload_to="recordings/audio/", null=True, blank=True)

    # Speech analysis results
    full_transcript = models.TextField(blank=True)
    filler_word_count = models.IntegerField(null=True, blank=True)
    filler_words_found = models.JSONField(default=list, blank=True)
    grammar_issues = models.JSONField(default=list, blank=True)
    grammar_checked = models.BooleanField(default=False)
    speaking_pace_wpm = models.IntegerField(null=True, blank=True)
    communication_notes = models.TextField(blank=True)
    # Browser-side frame-difference motion summary; observational only, never an emotion/confidence score.
    motion_metrics = models.JSONField(default=dict, blank=True)

    # Extra speech metrics (all nullable = "unavailable")
    word_count = models.IntegerField(null=True, blank=True)
    speaking_seconds = models.FloatField(null=True, blank=True)
    long_pause_count = models.IntegerField(null=True, blank=True)
    pause_ratio = models.FloatField(null=True, blank=True)
    # ASR-confidence proxy for intelligibility, NOT phoneme-level pronunciation scoring.
    pronunciation_estimate = models.FloatField(null=True, blank=True)

    # Analysis lifecycle
    analysis_started_at = models.DateTimeField(null=True, blank=True)
    analysis_error = models.CharField(max_length=300, blank=True)

    def __str__(self):
        return f"{self.candidate.username} — {self.interview_type} ({self.status})"


class InterviewQuestion(models.Model):
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE, related_name="questions")
    question_text = models.TextField()
    order = models.PositiveIntegerField(default=0)
    candidate_answer_transcript = models.TextField(blank=True)

    class Meta:
        ordering = ["order"]


class InterviewScore(models.Model):
    """
    Component scores are 0-100 or NULL. NULL means the signal was unavailable
    (e.g. no usable speech); it is never stored as a fake zero.
    overall_score is the 30/25/30/15 weighted result over the available
    components; is_partial=True when any component was unavailable.
    """
    session = models.OneToOneField(InterviewSession, on_delete=models.CASCADE, related_name="score")
    communication_score = models.FloatField(null=True, blank=True)
    confidence_score = models.FloatField(null=True, blank=True)
    technical_score = models.FloatField(null=True, blank=True)
    professionalism_score = models.FloatField(null=True, blank=True)
    overall_score = models.FloatField(null=True, blank=True)

    is_partial = models.BooleanField(default=False)
    unavailable_components = models.JSONField(default=list, blank=True)

    strengths = models.JSONField(default=list, blank=True)
    weaknesses = models.JSONField(default=list, blank=True)
    improvement_suggestions = models.JSONField(default=list, blank=True)
    practice_recommendations = models.JSONField(default=list, blank=True)
    learning_resources = models.JSONField(default=list, blank=True)
    evidence = models.JSONField(default=dict, blank=True)
    scoring_version = models.CharField(max_length=10, blank=True)
    generated_at = models.DateTimeField(auto_now=True)

    def compute_overall(self):
        overall, unavailable, partial = weighted_overall({
            "communication": self.communication_score,
            "confidence": self.confidence_score,
            "technical": self.technical_score,
            "professionalism": self.professionalism_score,
        })
        self.overall_score = overall
        self.unavailable_components = unavailable
        self.is_partial = partial
        return self.overall_score

    @property
    def rating(self):
        return rating_for(self.overall_score)
