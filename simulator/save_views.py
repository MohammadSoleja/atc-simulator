"""Account-owned saves. JSON endpoints serve the browser simulation only."""
import json

from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.db import DatabaseError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .forms import SaveNameForm
from .models import SavedGame
from .save_format import validate_snapshot

MAX_SAVE_BYTES = 1024 * 1024


def owned_save(request, pk):
    return get_object_or_404(SavedGame, pk=pk, owner=request.user)


@require_POST
def save_game(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Log in again before saving. Your game is still running.'}, status=401)
    if request.content_type != 'application/json':
        return JsonResponse({'error': 'Expected a JSON save.'}, status=400)
    if len(request.body) > MAX_SAVE_BYTES:
        return JsonResponse({'error': 'This save is too large.'}, status=413)
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict) or set(data) != {'name', 'autosave', 'snapshot'}:
            raise ValidationError('Invalid save request.')
        if type(data['autosave']) is not bool or not isinstance(data['name'], str):
            raise ValidationError('Invalid save options.')
        form = SaveNameForm({'name': data['name']})
        if not form.is_valid():
            raise ValidationError('Choose a save name containing 1–80 characters.')
        snapshot = validate_snapshot(data['snapshot'])
        with transaction.atomic():
            if data['autosave']:
                save, _ = SavedGame.objects.update_or_create(
                    owner=request.user, is_autosave=True,
                    defaults={'name': 'Autosave', 'airport': snapshot['airport'], 'snapshot': snapshot},
                )
            else:
                save = SavedGame.objects.create(owner=request.user, name=form.cleaned_data['name'],
                    airport=snapshot['airport'], snapshot=snapshot)
        return JsonResponse({'id': save.pk, 'saved_at': save.saved_at.isoformat(), 'name': save.name})
    except (ValueError, UnicodeDecodeError, RecursionError, ValidationError) as error:
        message = '; '.join(error.messages) if isinstance(error, ValidationError) else 'Invalid save JSON.'
        return JsonResponse({'error': message}, status=400)
    except DatabaseError:
        return JsonResponse({'error': 'Saving is temporarily unavailable. Your game is unchanged.'}, status=503)


@require_GET
def load_game(request, pk):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Log in to load your saved game.'}, status=401)
    save = owned_save(request, pk)
    try:
        validate_snapshot(save.snapshot)
    except ValidationError as error:
        return JsonResponse({'error': '; '.join(error.messages)}, status=400)
    return JsonResponse({'snapshot': save.snapshot, 'name': save.name})


@login_required
@require_GET
def saved_games(request):
    try:
        saves = list(SavedGame.objects.only('name', 'airport', 'is_autosave', 'saved_at').filter(owner=request.user))
    except DatabaseError:
        return render(request, 'simulator/saved_games.html', {'load_error': True}, status=503)
    return render(request, 'simulator/saved_games.html', {'saves': saves})


@login_required
@require_http_methods(['GET', 'POST'])
def rename_save(request, pk):
    save = owned_save(request, pk)
    if save.is_autosave:
        return redirect('saved_games')
    form = SaveNameForm(request.POST if request.method == 'POST' else None, initial={'name': save.name})
    if request.method == 'POST' and form.is_valid():
        save.name = form.cleaned_data['name']
        save.save(update_fields=['name'])  # Renaming is not a new simulation checkpoint.
        return redirect('saved_games')
    return render(request, 'simulator/save_manage.html', {'save': save, 'form': form})


@login_required
@require_http_methods(['GET', 'POST'])
def delete_save(request, pk):
    save = owned_save(request, pk)
    if request.method == 'POST':
        save.delete()
        return redirect('saved_games')
    return render(request, 'simulator/save_manage.html', {'save': save, 'deleting': True})
