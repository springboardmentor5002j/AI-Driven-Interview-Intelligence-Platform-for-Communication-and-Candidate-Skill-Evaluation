from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.utils import timezone
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .permissions import IsAdminRole
from .serializers import (
    RegisterSerializer, UserSerializer, ProfileUpdateSerializer,
    RecruiterShareSerializer, RecruiterAccessEntrySerializer,
    AdminAccessSerializer, AdminAccessCreateSerializer,
)
from .models import User, RecruiterCandidateAccess


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token


class LoginView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer


class GoogleLoginView(APIView):
    """Optional Google Identity Services login; new accounts are candidates by default."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        client_id = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "")
        credential = request.data.get("credential")
        if not client_id:
            return Response({"detail": "Google sign-in is not configured on this server."}, status=503)
        if not isinstance(credential, str) or not credential:
            return Response({"detail": "A Google credential is required."}, status=400)
        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token
            claims = id_token.verify_oauth2_token(
                credential, google_requests.Request(), audience=client_id
            )
            if not claims.get("email_verified") or not claims.get("email"):
                raise ValueError("Google account email is not verified.")
        except Exception:
            return Response({"detail": "Google sign-in token is invalid or expired."}, status=401)

        User = get_user_model()
        email = claims["email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            base = (email.split("@", 1)[0] or "candidate")[:120]
            username = base
            suffix = 1
            while User.objects.filter(username__iexact=username).exists():
                suffix += 1
                username = f"{base[:110]}{suffix}"
            user = User.objects.create_user(
                username=username, email=email, first_name=(claims.get("given_name") or "")[:150],
                last_name=(claims.get("family_name") or "")[:150], role=User.Role.CANDIDATE,
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])
        if not user.is_active:
            return Response({"detail": "This account is disabled."}, status=403)
        refresh = RefreshToken.for_user(user)
        refresh["role"] = user.role
        refresh["username"] = user.username
        return Response({"access": str(refresh.access_token), "refresh": str(refresh), "user": UserSerializer(user).data})


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class AdminUserListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        users = User.objects.all().order_by("-created_at")
        role = request.query_params.get("role")
        query = request.query_params.get("q", "").strip()
        if role:
            if role not in dict(User.Role.choices):
                return Response({"detail": "Invalid role filter."}, status=status.HTTP_400_BAD_REQUEST)
            users = users.filter(role=role)
        if query:
            users = users.filter(Q(username__icontains=query) | Q(email__icontains=query))
        return Response(UserSerializer(users, many=True).data)


class AdminUpdateUserRoleView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def patch(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=404)

        if user.pk == request.user.pk:
            return Response({"detail": "You cannot change your own role."}, status=400)
        new_role = request.data.get("role")
        if new_role not in dict(User.Role.choices):
            return Response({"detail": "Invalid role."}, status=400)

        user.role = new_role
        user.save(update_fields=["role", "updated_at"])
        if new_role != User.Role.RECRUITER:
            RecruiterCandidateAccess.objects.filter(recruiter=user).delete()
        if new_role != User.Role.CANDIDATE:
            RecruiterCandidateAccess.objects.filter(candidate=user).delete()
        return Response(UserSerializer(user).data)


class AdminStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        from resumes.models import Resume
        from interviews.models import InterviewSession

        from interviews.models import InterviewScore
        completed = InterviewSession.objects.filter(status__in=["completed", "analyzed"])
        by_type = {row["interview_type"]: row["total"] for row in completed.values("interview_type").annotate(total=Count("id"))}
        average = InterviewScore.objects.filter(overall_score__isnull=False).aggregate(value=Avg("overall_score"))["value"]
        since = timezone.now() - timedelta(days=30)
        return Response({
            "total_users": User.objects.count(),
            "total_candidates": User.objects.filter(role="candidate").count(),
            "total_recruiters": User.objects.filter(role="recruiter").count(),
            "total_admins": User.objects.filter(role="admin").count(),
            "total_resumes": Resume.objects.count(),
            "total_interviews": InterviewSession.objects.count(),
            "completed_interviews": completed.count(),
            "interviews_by_type": by_type,
            "average_overall_score": round(average, 2) if average is not None else None,
            "new_users_last_30_days": User.objects.filter(date_joined__gte=since).count(),
        })


class AdminSetUserActiveView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def patch(self, request, user_id):
        if user_id == request.user.id:
            return Response({"detail": "You cannot deactivate your own account."}, status=400)
        value = request.data.get("is_active")
        if not isinstance(value, bool):
            return Response({"detail": "is_active must be a boolean."}, status=400)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=404)
        user.is_active = value
        user.save(update_fields=["is_active"])
        return Response(UserSerializer(user).data)


class MyRecruiterAccessView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.CANDIDATE:
            return Response({"detail": "Candidate accounts only."}, status=403)
        rows = RecruiterCandidateAccess.objects.filter(candidate=request.user).select_related("recruiter")
        return Response(RecruiterAccessEntrySerializer(rows, many=True).data)

    def post(self, request):
        if request.user.role != User.Role.CANDIDATE:
            return Response({"detail": "Candidate accounts only."}, status=403)
        serializer = RecruiterShareSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identity = serializer.validated_data["recruiter"].strip()
        recruiter = User.objects.filter(is_active=True, role=User.Role.RECRUITER).filter(
            Q(username__iexact=identity) | Q(email__iexact=identity)
        ).first()
        if recruiter is None:
            return Response({"detail": "Recruiter not found."}, status=404)
        row, created = RecruiterCandidateAccess.objects.get_or_create(
            recruiter=recruiter, candidate=request.user,
            defaults={"source": RecruiterCandidateAccess.Source.CANDIDATE, "granted_by": request.user},
        )
        if not created and row.source != RecruiterCandidateAccess.Source.CANDIDATE:
            return Response({"detail": "This access is managed by an administrator."}, status=409)
        payload = RecruiterAccessEntrySerializer(row).data
        return Response(payload, status=201 if created else 200)


class RevokeRecruiterAccessView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, recruiter_id):
        if request.user.role != User.Role.CANDIDATE:
            return Response({"detail": "Candidate accounts only."}, status=403)
        row = RecruiterCandidateAccess.objects.filter(candidate=request.user, recruiter_id=recruiter_id,
                                                       source=RecruiterCandidateAccess.Source.CANDIDATE).first()
        if row is None:
            return Response({"detail": "Access not found."}, status=404)
        row.delete()
        return Response(status=204)


class AdminAccessListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        rows = RecruiterCandidateAccess.objects.select_related("recruiter", "candidate")
        recruiter_id = request.query_params.get("recruiter_id")
        candidate_id = request.query_params.get("candidate_id")
        if recruiter_id:
            rows = rows.filter(recruiter_id=recruiter_id)
        if candidate_id:
            rows = rows.filter(candidate_id=candidate_id)
        return Response(AdminAccessSerializer(rows, many=True).data)

    def post(self, request):
        serializer = AdminAccessCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            recruiter = User.objects.get(pk=serializer.validated_data["recruiter_id"], role=User.Role.RECRUITER, is_active=True)
            candidate = User.objects.get(pk=serializer.validated_data["candidate_id"], role=User.Role.CANDIDATE, is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "Recruiter or candidate not found."}, status=404)
        row, created = RecruiterCandidateAccess.objects.get_or_create(
            recruiter=recruiter, candidate=candidate,
            defaults={"source": RecruiterCandidateAccess.Source.ADMIN, "granted_by": request.user},
        )
        return Response(AdminAccessSerializer(row).data, status=201 if created else 200)


class AdminAccessDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def delete(self, request, access_id):
        row = RecruiterCandidateAccess.objects.filter(pk=access_id).first()
        if row is None:
            return Response({"detail": "Access not found."}, status=404)
        row.delete()
        return Response(status=204)
