"""
Creates (or resets) one demo account for each role so you can log in
immediately, without using the signup form.

Run:  python manage.py seed_demo_users
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

DEMO_USERS = [
    # username,   role,        password,           is_admin_panel_user
    ("admin1",     "admin",     "Admin#Pass2026",     True),
    ("recruiter1", "recruiter", "Recruiter#Pass2026", False),
    ("candidate1", "candidate", "Candidate#Pass2026", False),
]


class Command(BaseCommand):
    help = "Create or reset demo users for Admin, Recruiter and Candidate roles."

    def handle(self, *args, **options):
        User = get_user_model()
        for username, role, password, is_admin in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@example.com"},
            )
            user.role = role
            user.is_staff = is_admin
            user.is_superuser = is_admin
            user.is_active = True
            user.set_password(password)
            user.save()
            action = "Created" if created else "Reset"
            self.stdout.write(self.style.SUCCESS(
                f"{action}: username={username}  password={password}  role={role}"
            ))
        self.stdout.write("")
        self.stdout.write("Log in at http://localhost:5173/login with any of the above.")
