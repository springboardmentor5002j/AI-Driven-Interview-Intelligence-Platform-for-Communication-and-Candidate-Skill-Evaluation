"""
Tests for registration, recruiter data scoping, candidate sharing and admin guards.

Run from your project root:   python manage.py test accounts

URLs are resolved with reverse() from the route names, so they work whatever
prefix you mounted the apps under.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from interviews.models import InterviewScore, InterviewSession

from .models import RecruiterCandidateAccess

User = get_user_model()
PW = "pw-12345-Xyz!"


def make_user(username, role="candidate", **extra):
    return User.objects.create_user(
        username=username, password=PW, role=role,
        email=extra.pop("email", f"{username}@example.com"), **extra)


def scored_session(candidate, interview_type="technical", overall=70.0):
    s = InterviewSession.objects.create(
        candidate=candidate, interview_type=interview_type, difficulty="medium",
        status="analyzed", completed_at=timezone.now())
    InterviewScore.objects.create(
        session=s, communication_score=overall, confidence_score=overall,
        technical_score=overall, professionalism_score=overall, overall_score=overall)
    return s


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class RegisterTests(TestCase):
    def post(self, **over):
        data = {"username": "newuser", "email": "New@Example.com", "password": PW}
        data.update(over)
        return APIClient().post(reverse("register"), data, format="json")

    def test_register_candidate_and_email_is_normalised(self):
        r = self.post()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(User.objects.get(username="newuser").email, "new@example.com")
        self.assertNotIn("password", r.data)

    def test_cannot_self_register_as_admin(self):
        self.assertEqual(self.post(role="admin").status_code, 400)

    def test_email_required(self):
        self.assertEqual(self.post(email="").status_code, 400)

    def test_duplicate_email_rejected_case_insensitively(self):
        make_user("existing", email="dupe@example.com")
        self.assertEqual(self.post(email="DUPE@example.com").status_code, 400)

    def test_weak_password_rejected(self):
        self.assertEqual(self.post(password="123").status_code, 400)


class RecruiterScopingTests(TestCase):
    def setUp(self):
        self.recruiter = make_user("rec", "recruiter")
        self.other_recruiter = make_user("rec2", "recruiter")
        self.alice = make_user("alice")
        self.bob = make_user("bob")
        scored_session(self.alice, overall=80)
        scored_session(self.bob, overall=60)
        self.c = client_for(self.recruiter)

    def grant(self, recruiter, candidate):
        RecruiterCandidateAccess.objects.create(
            recruiter=recruiter, candidate=candidate, source="admin")

    def test_recruiter_without_grants_sees_nothing(self):
        self.assertEqual(self.c.get(reverse("recruiter-candidates")).data, [])
        for cand in (self.alice, self.bob):
            r = self.c.get(reverse("recruiter-candidate-report", args=[cand.id]))
            self.assertEqual(r.status_code, 404)
        r = self.c.get(reverse("recruiter-compare"), {"candidate_ids": f"{self.alice.id},{self.bob.id}"})
        self.assertEqual(r.data, [])

    def test_recruiter_sees_only_granted_candidates(self):
        self.grant(self.recruiter, self.alice)
        rows = self.c.get(reverse("recruiter-candidates")).data
        self.assertEqual([r["username"] for r in rows], ["alice"])
        self.assertEqual(
            self.c.get(reverse("recruiter-candidate-report", args=[self.alice.id])).status_code, 200)
        self.assertEqual(
            self.c.get(reverse("recruiter-candidate-report", args=[self.bob.id])).status_code, 404)

    def test_other_recruiters_grant_does_not_leak(self):
        self.grant(self.other_recruiter, self.alice)
        self.assertEqual(self.c.get(reverse("recruiter-candidates")).data, [])

    def test_compare_omits_candidates_without_access(self):
        self.grant(self.recruiter, self.alice)
        r = self.c.get(reverse("recruiter-compare"), {"candidate_ids": f"{self.alice.id},{self.bob.id}"})
        self.assertEqual([x["username"] for x in r.data], ["alice"])

    def test_no_duplicate_rows_when_one_candidate_has_several_sessions(self):
        self.grant(self.recruiter, self.alice)
        scored_session(self.alice, overall=90)
        rows = self.c.get(reverse("recruiter-candidates")).data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["completed_interviews"], 2)

    def test_compare_is_like_for_like_and_ranked(self):
        carol = make_user("carol")
        scored_session(carol, interview_type="hr", overall=99)
        scored_session(self.alice, interview_type="technical", overall=80)
        for cand in (self.alice, self.bob, carol):
            self.grant(self.recruiter, cand)
        r = self.c.get(reverse("recruiter-compare"),
                       {"candidate_ids": f"{self.alice.id},{self.bob.id},{carol.id}"})
        # technical is the most common type, carol's HR result is excluded
        self.assertEqual([x["username"] for x in r.data], ["alice", "bob"])
        self.assertTrue(all(x["interview_type"] == "technical" for x in r.data))
        self.assertGreaterEqual(r.data[0]["overall_score"], r.data[1]["overall_score"])

    def test_candidates_and_anonymous_cannot_use_recruiter_endpoints(self):
        self.assertEqual(client_for(self.alice).get(reverse("recruiter-candidates")).status_code, 403)
        self.assertIn(APIClient().get(reverse("recruiter-candidates")).status_code, (401, 403))

    def test_inactive_recruiter_is_refused(self):
        self.recruiter.is_active = False
        self.recruiter.save()
        self.assertIn(self.c.get(reverse("recruiter-candidates")).status_code, (401, 403))


class CandidateSharingTests(TestCase):
    def setUp(self):
        self.alice = make_user("alice")
        self.rec = make_user("rec", "recruiter", email="rec@corp.com")
        self.c = client_for(self.alice)

    def test_share_by_username_and_email_is_idempotent(self):
        r1 = self.c.post(reverse("share-list-create"), {"recruiter": "rec"}, format="json")
        r2 = self.c.post(reverse("share-list-create"), {"recruiter": "REC@corp.com"}, format="json")
        self.assertEqual((r1.status_code, r2.status_code), (201, 200))
        self.assertEqual(RecruiterCandidateAccess.objects.count(), 1)
        row = RecruiterCandidateAccess.objects.get()
        self.assertEqual((row.source, row.granted_by_id), ("candidate", self.alice.id))
        self.assertEqual(len(self.c.get(reverse("share-list-create")).data), 1)

    def test_shared_results_become_visible_to_recruiter(self):
        scored_session(self.alice)
        self.c.post(reverse("share-list-create"), {"recruiter": "rec"}, format="json")
        rows = client_for(self.rec).get(reverse("recruiter-candidates")).data
        self.assertEqual([r["username"] for r in rows], ["alice"])

    def test_revoke_removes_access(self):
        scored_session(self.alice)
        self.c.post(reverse("share-list-create"), {"recruiter": "rec"}, format="json")
        r = self.c.delete(reverse("share-revoke", args=[self.rec.id]))
        self.assertEqual(r.status_code, 204)
        self.assertEqual(client_for(self.rec).get(reverse("recruiter-candidates")).data, [])
        self.assertEqual(self.c.delete(reverse("share-revoke", args=[self.rec.id])).status_code, 404)

    def test_same_404_for_unknown_user_and_non_recruiter(self):
        make_user("bob")  # a candidate, not a recruiter
        for ident in ("nobody", "bob", "bob@example.com"):
            r = self.c.post(reverse("share-list-create"), {"recruiter": ident}, format="json")
            self.assertEqual(r.status_code, 404, ident)
        self.assertEqual(RecruiterCandidateAccess.objects.count(), 0)

    def test_inactive_recruiter_cannot_be_shared_with(self):
        self.rec.is_active = False
        self.rec.save()
        r = self.c.post(reverse("share-list-create"), {"recruiter": "rec"}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_recruiters_cannot_use_candidate_sharing(self):
        r = client_for(self.rec).post(reverse("share-list-create"), {"recruiter": "rec"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_candidate_cannot_revoke_someone_elses_grant(self):
        bob = make_user("bob")
        RecruiterCandidateAccess.objects.create(recruiter=self.rec, candidate=bob, source="candidate")
        self.assertEqual(self.c.delete(reverse("share-revoke", args=[self.rec.id])).status_code, 404)
        self.assertEqual(RecruiterCandidateAccess.objects.count(), 1)


class AdminTests(TestCase):
    def setUp(self):
        self.admin = make_user("admin1", "admin")
        self.admin2 = make_user("admin2", "admin")
        self.rec = make_user("rec", "recruiter")
        self.alice = make_user("alice")
        self.c = client_for(self.admin)

    def test_non_admins_blocked(self):
        for user in (self.rec, self.alice):
            c = client_for(user)
            self.assertEqual(c.get(reverse("admin-users")).status_code, 403)
            self.assertEqual(c.get(reverse("admin-stats")).status_code, 403)
            self.assertEqual(c.get(reverse("admin-access")).status_code, 403)
            self.assertEqual(c.get(reverse("admin-sessions")).status_code, 403)

    def test_cannot_change_own_role(self):
        r = self.c.patch(reverse("admin-user-role", args=[self.admin.id]), {"role": "candidate"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, "admin")

    def test_change_other_users_role_and_invalid_role(self):
        r = self.c.patch(reverse("admin-user-role", args=[self.alice.id]), {"role": "recruiter"}, format="json")
        self.assertEqual((r.status_code, r.data["role"]), (200, "recruiter"))
        r = self.c.patch(reverse("admin-user-role", args=[self.alice.id]), {"role": "root"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.c.patch(reverse("admin-user-role", args=[99999]), {"role": "candidate"}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_role_change_drops_now_meaningless_access_rows(self):
        RecruiterCandidateAccess.objects.create(recruiter=self.rec, candidate=self.alice, source="admin")
        self.c.patch(reverse("admin-user-role", args=[self.rec.id]), {"role": "candidate"}, format="json")
        self.assertEqual(RecruiterCandidateAccess.objects.count(), 0)

    def test_deactivate_and_reactivate(self):
        url = reverse("admin-user-active", args=[self.alice.id])
        self.assertEqual(self.c.patch(url, {"is_active": False}, format="json").status_code, 200)
        self.alice.refresh_from_db()
        self.assertFalse(self.alice.is_active)
        login = APIClient().post(reverse("login"), {"username": "alice", "password": PW}, format="json")
        self.assertEqual(login.status_code, 401)
        self.c.patch(url, {"is_active": True}, format="json")
        login = APIClient().post(reverse("login"), {"username": "alice", "password": PW}, format="json")
        self.assertEqual(login.status_code, 200)

    def test_cannot_deactivate_self_or_send_non_bool(self):
        self_url = reverse("admin-user-active", args=[self.admin.id])
        self.assertEqual(self.c.patch(self_url, {"is_active": False}, format="json").status_code, 400)
        url = reverse("admin-user-active", args=[self.alice.id])
        self.assertEqual(self.c.patch(url, {"is_active": "false"}, format="json").status_code, 400)

    def test_user_list_filters(self):
        r = self.c.get(reverse("admin-users"), {"role": "recruiter"})
        self.assertEqual([u["username"] for u in r.data], ["rec"])
        r = self.c.get(reverse("admin-users"), {"q": "ALI"})
        self.assertEqual([u["username"] for u in r.data], ["alice"])
        self.assertEqual(self.c.get(reverse("admin-users"), {"role": "x"}).status_code, 400)
        self.assertNotIn("password", self.c.get(reverse("admin-users")).data[0])

    def test_admin_can_assign_and_remove_access(self):
        r = self.c.post(reverse("admin-access"),
                        {"recruiter_id": self.rec.id, "candidate_id": self.alice.id}, format="json")
        self.assertEqual(r.status_code, 201)
        again = self.c.post(reverse("admin-access"),
                            {"recruiter_id": self.rec.id, "candidate_id": self.alice.id}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(len(self.c.get(reverse("admin-access"), {"recruiter_id": self.rec.id}).data), 1)
        self.assertEqual(self.c.delete(reverse("admin-access-delete", args=[r.data["id"]])).status_code, 204)
        self.assertEqual(self.c.delete(reverse("admin-access-delete", args=[r.data["id"]])).status_code, 404)

    def test_admin_access_rejects_wrong_roles(self):
        r = self.c.post(reverse("admin-access"),
                        {"recruiter_id": self.alice.id, "candidate_id": self.alice.id}, format="json")
        self.assertEqual(r.status_code, 404)
        r = self.c.post(reverse("admin-access"),
                        {"recruiter_id": self.rec.id, "candidate_id": self.rec.id}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_stats_include_new_fields_and_scored_data(self):
        scored_session(self.alice, overall=80)
        data = self.c.get(reverse("admin-stats")).data
        for key in ("total_users", "completed_interviews", "interviews_by_type",
                    "average_overall_score", "new_users_last_30_days"):
            self.assertIn(key, data)
        self.assertEqual(data["completed_interviews"], 1)
        self.assertEqual(data["average_overall_score"], 80)
        self.assertEqual(data["interviews_by_type"], {"technical": 1})


class ProfileTests(TestCase):
    def test_me_patch_cannot_change_role_or_username(self):
        user = make_user("alice")
        c = client_for(user)
        r = c.patch(reverse("me"), {"role": "admin", "username": "root", "phone_number": "999",
                                    "organization": "Acme"}, format="json")
        self.assertEqual(r.status_code, 200)
        user.refresh_from_db()
        self.assertEqual((user.role, user.username), ("candidate", "alice"))
        self.assertEqual((user.phone_number, user.organization), ("999", "Acme"))
