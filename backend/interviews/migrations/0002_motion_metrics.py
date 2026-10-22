from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("interviews", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="interviewsession",
            name="motion_metrics",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
