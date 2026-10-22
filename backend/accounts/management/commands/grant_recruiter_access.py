from django.core.management.base import BaseCommand, CommandError

from accounts.models import RecruiterCandidateAccess, User


class Command(BaseCommand):
    help = (
        "Give a recruiter access to candidates' interview results.\n"
        "  python manage.py grant_recruiter_access --recruiter bob --all-candidates\n"
        "  python manage.py grant_recruiter_access --recruiter bob --candidate asha --candidate ravi"
    )

    def add_arguments(self, parser):
        parser.add_argument("--recruiter", required=True, help="Recruiter username")
        parser.add_argument("--candidate", action="append", default=[], help="Candidate username (repeatable)")
        parser.add_argument("--all-candidates", action="store_true", help="Every active candidate")

    def handle(self, *args, **opts):
        recruiter = User.objects.filter(username=opts["recruiter"], role=User.Role.RECRUITER).first()
        if recruiter is None:
            raise CommandError(f"No recruiter with username '{opts['recruiter']}'.")

        candidates = User.objects.filter(role=User.Role.CANDIDATE, is_active=True)
        if opts["all_candidates"]:
            pass
        elif opts["candidate"]:
            candidates = candidates.filter(username__in=opts["candidate"])
            missing = set(opts["candidate"]) - set(candidates.values_list("username", flat=True))
            if missing:
                raise CommandError(f"Not active candidates: {', '.join(sorted(missing))}")
        else:
            raise CommandError("Pass --candidate <username> (repeatable) or --all-candidates.")

        created = 0
        for candidate in candidates:
            _, was_created = RecruiterCandidateAccess.objects.get_or_create(
                recruiter=recruiter, candidate=candidate,
                defaults={"source": RecruiterCandidateAccess.Source.ADMIN},
            )
            created += was_created
        self.stdout.write(self.style.SUCCESS(
            f"{created} new grant(s); {candidates.count() - created} already existed."))
