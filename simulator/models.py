from django.conf import settings
from django.db import models
from django.db.models import Q


class SavedGame(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='saved_games')
    name = models.CharField(max_length=80)
    airport = models.CharField(max_length=8)
    snapshot = models.JSONField()
    is_autosave = models.BooleanField(default=False)
    saved_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-saved_at', '-pk']
        constraints = [models.UniqueConstraint(
            fields=['owner'], condition=Q(is_autosave=True), name='one_autosave_per_player',
        )]
