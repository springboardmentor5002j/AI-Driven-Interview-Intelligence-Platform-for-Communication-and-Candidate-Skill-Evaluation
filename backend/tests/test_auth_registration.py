import unittest

from pydantic import ValidationError

from app.schemas.user import UserCreate


class PublicRegistrationRoleTests(unittest.TestCase):
    def test_candidate_and_recruiter_roles_are_allowed(self):
        for role in ("Candidate", "Recruiter"):
            with self.subTest(role=role):
                user = UserCreate(
                    name="Test User",
                    email="test@example.com",
                    password="pass",
                    role=role,
                )
                self.assertEqual(user.role, role)

    def test_admin_role_is_rejected(self):
        with self.assertRaises(ValidationError):
            UserCreate(
                name="Test User",
                email="test@example.com",
                password="pass",
                role="Admin",
            )


if __name__ == "__main__":
    unittest.main()
