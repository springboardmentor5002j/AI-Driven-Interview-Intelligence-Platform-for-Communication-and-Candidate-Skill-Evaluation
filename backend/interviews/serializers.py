from rest_framework import serializers
from .models import InterviewSession, InterviewQuestion, InterviewScore


class InterviewQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = ["id", "question_text", "order", "candidate_answer_transcript"]


class InterviewScoreSerializer(serializers.ModelSerializer):
    rating = serializers.ReadOnlyField()

    class Meta:
        model = InterviewScore
        fields = [
            "communication_score", "confidence_score", "technical_score",
            "professionalism_score", "overall_score", "rating",
            "is_partial", "unavailable_components",
            "strengths", "weaknesses", "improvement_suggestions",
            "practice_recommendations", "learning_resources",
            "evidence", "scoring_version", "generated_at",
        ]


class InterviewSessionSerializer(serializers.ModelSerializer):
    questions = InterviewQuestionSerializer(many=True, read_only=True)
    score = InterviewScoreSerializer(read_only=True)

    class Meta:
        model = InterviewSession
        fields = [
            "id", "resume", "interview_type", "difficulty", "domain",
            "status", "started_at", "completed_at", "questions", "score",
            "full_transcript", "filler_word_count", "filler_words_found",
            "grammar_issues", "grammar_checked", "speaking_pace_wpm",
            "communication_notes", "word_count", "speaking_seconds",
            "long_pause_count", "pause_ratio", "pronunciation_estimate",
            "analysis_error", "motion_metrics",
        ]
        read_only_fields = [
            "status", "started_at", "completed_at", "full_transcript",
            "filler_word_count", "filler_words_found", "grammar_issues",
            "grammar_checked", "speaking_pace_wpm", "communication_notes",
            "word_count", "speaking_seconds", "long_pause_count",
            "pause_ratio", "pronunciation_estimate", "analysis_error", "motion_metrics",
        ]


class GenerateInterviewSerializer(serializers.Serializer):
    resume_id = serializers.IntegerField(required=False, allow_null=True)
    interview_type = serializers.ChoiceField(choices=InterviewSession.InterviewType.choices)
    difficulty = serializers.ChoiceField(choices=InterviewSession.Difficulty.choices, default="medium")
    domain = serializers.CharField(required=False, allow_blank=True, default="", max_length=100)
    question_count = serializers.IntegerField(default=5, min_value=1, max_value=15)


class SubmitAnswerSerializer(serializers.Serializer):
    transcript = serializers.CharField(
        allow_blank=True, required=False, default="", max_length=10000
    )
