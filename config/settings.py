import os
import secrets
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
BASE_DIR = Path(__file__).resolve().parent.parent
# Local development stays simple; production must supply its own secret.
DEBUG = os.environ.get('DJANGO_DEBUG', 'true').lower() == 'true'
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('Set DJANGO_SECRET_KEY when DJANGO_DEBUG=false.')
    SECRET_KEY = secrets.token_urlsafe(64)
ALLOWED_HOSTS = [host.strip() for host in
                 os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,[::1]').split(',')
                 if host.strip()]
if '*' in ALLOWED_HOSTS:
    raise ImproperlyConfigured('Use explicit DJANGO_ALLOWED_HOSTS rather than a wildcard.')
X_FRAME_OPTIONS = 'DENY'
INSTALLED_APPS=['django.contrib.staticfiles','simulator']
MIDDLEWARE=['django.middleware.security.SecurityMiddleware','django.middleware.common.CommonMiddleware','django.middleware.csrf.CsrfViewMiddleware','django.middleware.clickjacking.XFrameOptionsMiddleware']
ROOT_URLCONF='config.urls'
TEMPLATES=[{'BACKEND':'django.template.backends.django.DjangoTemplates','DIRS':[],'APP_DIRS':True,'OPTIONS':{'context_processors':[]}}]
WSGI_APPLICATION='config.wsgi.application'
DATABASES={'default':{'ENGINE':'django.db.backends.sqlite3','NAME':BASE_DIR/'db.sqlite3'}}
STATIC_URL='static/'
DEFAULT_AUTO_FIELD='django.db.models.BigAutoField'
