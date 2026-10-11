from django.shortcuts import render
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
