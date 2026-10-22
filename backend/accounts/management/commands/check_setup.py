"""
Prints a plain-English health report so we can see exactly what is wrong.

Run:  python manage.py check_setup
"""
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Check database connection, tables, users, roles and API keys."

    def handle(self, *args, **options):
        out = self.stdout.write
        db = settings.DATABASES["default"]
        out("=== SmartHire setup check ===")
        out(f"Database engine : {db['ENGINE']}")
        out(f"Database name   : {db['NAME']}")

        # 1. Can we connect?
        try:
            connection.ensure_connection()
            out(self.style.SUCCESS("Database connection : OK"))
        except Exception as e:
            out(self.style.ERROR(f"Database connection : FAILED -> {e}"))
            out("FIX: open backend/.env. For a quick start set USE_SQLITE=True, "
                "save, then run this command again.")
            return

        # 2. Do the tables exist?
        try:
            from accounts.models import User
            total = User.objects.count()
            out(self.style.SUCCESS(f"Tables exist        : OK ({total} users)"))
        except Exception as e:
            out(self.style.ERROR(f"Tables exist        : NO -> {e}"))
            out("FIX: run  python manage.py makemigrations accounts resumes interviews")
            out("     then  python manage.py migrate")
            return

        # 3. Which roles exist?
        for role in ("admin", "recruiter", "candidate"):
            count = User.objects.filter(role=role).count()
            out(f"Users with role '{role}': {count}")
        if total == 0:
            out("FIX: run  python manage.py seed_demo_users")

        # 4. API keys (never prints the key itself)
        out(f"OPENROUTER_API_KEY set : {bool(settings.OPENROUTER_API_KEY)}")
        out(f"DEEPGRAM_API_KEY set   : {bool(settings.DEEPGRAM_API_KEY)}")
        out("=== done ===")
