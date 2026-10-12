from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User


class RegistrationForm(UserCreationForm):
    email = forms.EmailField(max_length=254, help_text='Enter your email address.')

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('username', 'email')


class DisplayNameForm(forms.ModelForm):
    first_name = forms.CharField(
        label='Display name', max_length=80,
        help_text='The name shown to you on the welcome page. Your login username stays the same.',
    )

    class Meta:
        model = User
        fields = ('first_name',)
