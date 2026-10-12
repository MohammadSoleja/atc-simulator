from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_http_methods

from .forms import DisplayNameForm, RegistrationForm
from django.http import Http404


# Only maps implemented by the simulator belong in this list.
AVAILABLE_MAPS = [
    {'id': 'egll', 'name': 'London Heathrow', 'code': 'EGLL'},
]


def welcome(request):
    return render(request, 'simulator/welcome.html', {'maps': AVAILABLE_MAPS})


def index(request):
    map_id = request.GET.get('map', 'egll')
    if map_id not in {airport['id'] for airport in AVAILABLE_MAPS}:
        raise Http404('This map is not available.')
    return render(request, 'simulator/index.html')


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
