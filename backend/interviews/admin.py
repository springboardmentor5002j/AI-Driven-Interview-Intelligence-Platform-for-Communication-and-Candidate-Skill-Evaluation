from django.contrib import admin
from .models import InterviewSession, InterviewQuestion, InterviewScore

admin.site.register(InterviewSession)
admin.site.register(InterviewQuestion)
admin.site.register(InterviewScore)
