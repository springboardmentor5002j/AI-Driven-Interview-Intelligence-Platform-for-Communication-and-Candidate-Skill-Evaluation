from rest_framework import serializers
from .models import Resume

MAX_RESUME_BYTES = 10 * 1024 * 1024


class ResumeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        fields = [
            "id", "file", "uploaded_at", "processed",
            "extracted_skills", "extracted_experience",
            "extracted_education", "detected_technologies", "ai_summary",
        ]
        read_only_fields = [
            "uploaded_at", "processed", "extracted_skills",
            "extracted_experience", "extracted_education",
            "detected_technologies", "ai_summary",
        ]

    def validate_file(self, value):
        if value.size <= 0:
            raise serializers.ValidationError("The uploaded PDF is empty.")
        if value.size > MAX_RESUME_BYTES:
            raise serializers.ValidationError("Resume must be 10 MB or smaller.")
        if not (value.name or "").lower().endswith(".pdf"):
            raise serializers.ValidationError("Only PDF resumes are supported.")
        # Check the file signature rather than trusting the browser MIME type.
        current = value.tell() if hasattr(value, "tell") else 0
        try:
            header = value.read(5)
            if header != b"%PDF-":
                raise serializers.ValidationError("The uploaded file is not a valid PDF.")
        finally:
            try:
                value.seek(current)
            except (AttributeError, OSError):
                pass
        return value
