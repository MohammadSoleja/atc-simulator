from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY='dev-only-atc-simulator'
DEBUG=True
ALLOWED_HOSTS=['*']
INSTALLED_APPS=['django.contrib.staticfiles','simulator']
MIDDLEWARE=['django.middleware.security.SecurityMiddleware','django.middleware.common.CommonMiddleware']
ROOT_URLCONF='config.urls'
TEMPLATES=[{'BACKEND':'django.template.backends.django.DjangoTemplates','DIRS':[],'APP_DIRS':True,'OPTIONS':{'context_processors':[]}}]
WSGI_APPLICATION='config.wsgi.application'
DATABASES={'default':{'ENGINE':'django.db.backends.sqlite3','NAME':BASE_DIR/'db.sqlite3'}}
STATIC_URL='static/'
DEFAULT_AUTO_FIELD='django.db.models.BigAutoField'
