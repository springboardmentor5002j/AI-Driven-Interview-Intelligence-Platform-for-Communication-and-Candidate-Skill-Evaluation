from rest_framework.permissions import BasePermission


def _role(request):
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated or not user.is_active:
        return None
    return getattr(user, "role", None)


class IsCandidate(BasePermission):
    def has_permission(self, request, view):
        return _role(request) == "candidate"


class IsRecruiter(BasePermission):
    def has_permission(self, request, view):
        return _role(request) == "recruiter"


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return _role(request) == "admin"
