from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ImproperlyConfigured
from django.db import DatabaseError
from django.shortcuts import redirect, render
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_http_methods

from .forms import DisplayNameForm, RegistrationForm
from .models import SavedGame
from .airports import DEFAULT_AIRPORT, available_airports, get_airport, label_saves
from django.http import Http404




def welcome(request):
    try:
        maps = available_airports()
        context = {'maps': maps, 'default_map': get_airport(DEFAULT_AIRPORT)}
    except ImproperlyConfigured as error:
        return render(request, 'simulator/map_error.html', {'map_error': str(error)}, status=503)
    if request.user.is_authenticated:
        try:
            # Welcome needs only three checkpoints' metadata, never their snapshots.
            context['recent_saves'] = label_saves(list(SavedGame.objects.filter(owner=request.user)
                .only('name', 'airport', 'saved_at', 'is_autosave')[:3]))
        except DatabaseError:
            context['recent_saves_error'] = True
    return render(request, 'simulator/welcome.html', context)


def index(request):
    map_id = request.GET.get('map', DEFAULT_AIRPORT)
    try:
        airport = get_airport(map_id)
    except KeyError:
        raise Http404('This map is not available.')
    except ImproperlyConfigured as error:
        return render(request, 'simulator/map_error.html', {'map_error': str(error)}, status=503)
    save_id = request.GET.get('save')
    if save_id:
        if not request.user.is_authenticated:
            from django.contrib.auth.views import redirect_to_login
            return redirect_to_login(request.get_full_path())
        from .save_views import owned_save
        try:
            save_id = int(save_id)
        except ValueError:
            raise Http404('This save is not available.')
        save = owned_save(request, save_id)
        if save.airport != map_id:
            raise Http404('This save belongs to another airport.')
    return render(request, 'simulator/index.html', {'save_id': save_id, 'airport': airport,
        'start_time': f"{airport['traffic']['start_seconds']//3600:02d}:{airport['traffic']['start_seconds']%3600//60:02d}",
        'example_runway': airport['runways'][-1]['ends'][1]})


@sensitive_post_parameters('password1', 'password2')
@require_http_methods(['GET', 'POST'])
def register(request):
    if request.user.is_authenticated:
        return redirect('welcome')
    form = RegistrationForm(request.POST if request.method == 'POST' else None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        login(request, user)
        return redirect('welcome')
    return render(request, 'simulator/account.html', {
        'form': form, 'registering': True,
    })


@login_required
@require_http_methods(['GET', 'POST'])
def profile(request):
    # Bind only the authenticated user; never accept an account ID from input.
    form = DisplayNameForm(
        request.POST if request.method == 'POST' else None, instance=request.user,
    )
    if request.method == 'POST' and form.is_valid():
        user = form.save(commit=False)
        user.save(update_fields=['first_name'])
        return redirect('profile_saved')
    return render(request, 'simulator/profile.html', {'form': form})


@login_required
@require_http_methods(['GET'])
def profile_saved(request):
    form = DisplayNameForm(instance=request.user)
    return render(request, 'simulator/profile.html', {'form': form, 'saved': True})
