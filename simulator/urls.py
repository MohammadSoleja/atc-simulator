from django.contrib.auth import views as auth_views
from django.contrib.auth.views import LoginView, LogoutView
from django.urls import path
from . import views

urlpatterns = [
    path('accounts/profile/', views.profile, name='profile'),
    path('accounts/profile/saved/', views.profile_saved, name='profile_saved'),
    path('accounts/password-reset/', auth_views.PasswordResetView.as_view(
        template_name='simulator/password_reset_form.html',
        email_template_name='simulator/password_reset_email.txt',
        subject_template_name='simulator/password_reset_subject.txt',
    ), name='password_reset'),
    path('accounts/password-reset/sent/', auth_views.PasswordResetDoneView.as_view(
        template_name='simulator/password_reset_done.html',
    ), name='password_reset_done'),
    path('accounts/reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='simulator/password_reset_confirm.html',
    ), name='password_reset_confirm'),
    path('accounts/reset/complete/', auth_views.PasswordResetCompleteView.as_view(
        template_name='simulator/password_reset_complete.html',
    ), name='password_reset_complete'),
    path('accounts/register/', views.register, name='register'),
    path('accounts/login/', LoginView.as_view(
        template_name='simulator/account.html', redirect_authenticated_user=True,
    ), name='login'),
    path('accounts/logout/', LogoutView.as_view(), name='logout'),
    path('', views.welcome, name='welcome'),
    path('play/', views.index, name='index'),
]
