from django.contrib.auth.views import LoginView, LogoutView
from django.urls import path
from . import views

urlpatterns = [
    path('accounts/register/', views.register, name='register'),
    path('accounts/login/', LoginView.as_view(
        template_name='simulator/account.html', redirect_authenticated_user=True,
    ), name='login'),
    path('accounts/logout/', LogoutView.as_view(), name='logout'),
    path('', views.welcome, name='welcome'),
    path('play/', views.index, name='index'),
]
