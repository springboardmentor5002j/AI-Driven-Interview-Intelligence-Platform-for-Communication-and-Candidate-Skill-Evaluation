from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import InterviewSession


class MotionMetricsAPITests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="motion-candidate", password="StrongPass123!")
        self.session = InterviewSession.objects.create(
            candidate=self.user, interview_type="technical", difficulty="medium",
            status=InterviewSession.Status.IN_PROGRESS,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_saves_aggregate_motion_only(self):
        response = self.client.post(
            f"/api/interviews/{self.session.pk}/motion-metrics/",
            {"sample_count": 20, "motion_frame_count": 8,
             "motion_ratio": 0.4, "mean_delta": 7.2},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.motion_metrics["sample_count"], 20)
        self.assertEqual(self.session.motion_metrics["motion_frame_count"], 8)
        self.assertIn("not used", self.session.motion_metrics["purpose"])

    def test_rejects_invalid_motion_values(self):
        response = self.client.post(
            f"/api/interviews/{self.session.pk}/motion-metrics/",
            {"sample_count": 5, "motion_frame_count": 9,
             "motion_ratio": 1.8, "mean_delta": 999},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
