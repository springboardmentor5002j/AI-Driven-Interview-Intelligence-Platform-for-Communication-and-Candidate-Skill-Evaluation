from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()

class SignupSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'full_name', 'role']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user
from .models import Resume

class ResumeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        fields = ['id', 'file', 'uploaded_at', 'extracted_skills', 'summary']
        read_only_fields = ['id', 'uploaded_at', 'extracted_skills', 'summary']

from .models import Interview

class InterviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interview
        fields = ['id', 'resume', 'questions', 'created_at']
        read_only_fields = ['id', 'questions', 'created_at']

from .models import InterviewResult

class InterviewResultSerializer(serializers.ModelSerializer):
    candidate_name = serializers.SerializerMethodField()
    candidate_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = InterviewResult
        fields = [
            'id', 'candidate_name', 'candidate_email', 'overall_score',
            'communication', 'confidence', 'technical', 'professionalism',
            'strengths', 'improvements', 'history', 'created_at','difficulty',
        ]

    def get_candidate_name(self, obj):
        return obj.user.full_name or obj.user.email