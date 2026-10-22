from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import RecruiterCandidateAccess

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    # Required and unique (case-insensitive): recruiters share/lookup by email.
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "role", "organization", "phone_number"]

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_role(self, value):
        # Public signup may only create Candidate or Recruiter accounts.
        # Admin accounts are created by an existing admin only.
        if value not in ("candidate", "recruiter"):
            raise serializers.ValidationError("Role must be 'candidate' or 'recruiter'.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "role",
            "organization", "phone_number", "is_active", "created_at",
        ]
        read_only_fields = fields


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """What a user may change about themselves. Role, email and username are
    deliberately not editable here."""

    class Meta:
        model = User
        fields = ["first_name", "last_name", "phone_number", "organization"]


class RecruiterShareSerializer(serializers.Serializer):
    recruiter = serializers.CharField(max_length=254, help_text="Recruiter username or email")


class RecruiterAccessEntrySerializer(serializers.ModelSerializer):
    """Candidate's view of who can see their results."""
    recruiter_id = serializers.IntegerField(source="recruiter.id", read_only=True)
    username = serializers.CharField(source="recruiter.username", read_only=True)
    email = serializers.CharField(source="recruiter.email", read_only=True)
    organization = serializers.CharField(source="recruiter.organization", read_only=True)

    class Meta:
        model = RecruiterCandidateAccess
        fields = ["id", "recruiter_id", "username", "email", "organization", "source", "created_at"]


class AdminAccessSerializer(serializers.ModelSerializer):
    recruiter_username = serializers.CharField(source="recruiter.username", read_only=True)
    candidate_username = serializers.CharField(source="candidate.username", read_only=True)

    class Meta:
        model = RecruiterCandidateAccess
        fields = [
            "id", "recruiter", "recruiter_username", "candidate", "candidate_username",
            "source", "created_at",
        ]
        read_only_fields = fields


class AdminAccessCreateSerializer(serializers.Serializer):
    recruiter_id = serializers.IntegerField()
    candidate_id = serializers.IntegerField()
