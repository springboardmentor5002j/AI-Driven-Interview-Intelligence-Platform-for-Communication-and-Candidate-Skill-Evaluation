from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        CANDIDATE = "candidate", "Candidate"
        RECRUITER = "recruiter", "Recruiter"
        ADMIN = "admin", "Admin"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CANDIDATE)
    phone_number = models.CharField(max_length=20, blank=True)
    # Free text typed by the user at signup. It is a display label ONLY and is
    # never used for authorisation (anyone can type any organisation name).
    organization = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.username} ({self.role})"


class RecruiterCandidateAccess(models.Model):
    """
    Grants one recruiter access to one candidate's completed interview results.

    Rows are created by:
      * the candidate sharing their results with a recruiter, or
      * an admin assigning a candidate to a recruiter.
    A recruiter with no rows sees no candidates.
    """

    class Source(models.TextChoices):
        CANDIDATE = "candidate", "Shared by candidate"
        ADMIN = "admin", "Assigned by admin"

    recruiter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="candidate_access"
    )
    candidate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recruiter_access"
    )
    source = models.CharField(max_length=20, choices=Source.choices)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["recruiter", "candidate"], name="unique_recruiter_candidate_access"
            )
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.recruiter_id} -> {self.candidate_id} ({self.source})"
