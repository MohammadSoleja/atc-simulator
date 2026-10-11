from django.shortcuts import render


def welcome(request):
    return render(request, 'simulator/welcome.html')


def index(request):
    return render(request, 'simulator/index.html')
