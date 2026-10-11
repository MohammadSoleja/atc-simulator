from django.contrib.auth import get_user_model
from django.test import Client, SimpleTestCase, TestCase
from django.urls import reverse


class PageRoutingTests(SimpleTestCase):
    def test_welcome_links_to_simulator_without_loading_game(self):
        response = self.client.get(reverse('welcome'))
        self.assertEqual(reverse('welcome'), '/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'simulator/welcome.html')
        self.assertContains(response, 'action="/play/"')
        self.assertContains(response, 'Start game')
        self.assertNotContains(response, 'id="radar"')
        self.assertNotContains(response, 'simulator/js/game.js')

    def test_simulator_remains_available_at_play(self):
        response = self.client.get(reverse('index'))
        self.assertEqual(reverse('index'), '/play/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'simulator/index.html')
        for control in ['radar', 'commandInput', 'pauseBtn', 'voiceBtn']:
            self.assertContains(response, f'id="{control}"')
        self.assertContains(response, 'simulator/js/game.js')

    def test_only_playable_maps_are_offered(self):
        response = self.client.get(reverse('welcome'))
        self.assertContains(response, '<option value="egll">London Heathrow (EGLL)</option>', html=True)
        self.assertContains(response, 'name="map"')
        self.assertContains(response, 'No account required.')

    def test_heathrow_selection_opens_simulator(self):
        response = self.client.get(reverse('index'), {'map': 'egll'})
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'simulator/index.html')

    def test_unavailable_maps_cannot_be_started(self):
        for map_id in ['unknown', 'egkk', '']:
            with self.subTest(map=map_id):
                response = self.client.get(reverse('index'), {'map': map_id})
                self.assertEqual(response.status_code, 404)

    def test_quick_start_is_available_without_starting_game(self):
        response = self.client.get(reverse('welcome'))
        self.assertContains(response, 'Quick-start guide &amp; command examples')
        for topic in ['Sequence an arrival', 'Release a departure', 'Keep aircraft separated', 'Control the pace', 'speak your instructions']:
            self.assertContains(response, topic)


class LocalSecurityTests(SimpleTestCase):
    def test_pages_cannot_be_embedded_in_another_site(self):
        response = self.client.get(reverse('index'))
        self.assertEqual(response.headers['X-Frame-Options'], 'DENY')
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')

    def test_untrusted_hostname_is_rejected(self):
        from django.test import override_settings
        with override_settings(ALLOWED_HOSTS=['localhost', '127.0.0.1']):
            response = self.client.get('/', HTTP_HOST='untrusted.example')
        self.assertEqual(response.status_code, 400)

    def test_post_requires_csrf_protection(self):
        from django.test import Client
        response = Client(enforce_csrf_checks=True).post(reverse('index'))
        self.assertEqual(response.status_code, 403)



class AccountTests(TestCase):
    password = 'Airspace-Sample-786!'

    def registration(self, **changes):
        data = {'username': 'controller', 'email': 'controller@example.com',
                'password1': self.password, 'password2': self.password}
        data.update(changes)
        return self.client.post(reverse('register'), data)

    def test_registration_hashes_password_and_signs_in(self):
        response = self.registration()
        self.assertRedirects(response, reverse('welcome'))
        user = get_user_model().objects.get(username='controller')
        self.assertEqual(user.email, 'controller@example.com')
        self.assertTrue(user.check_password(self.password))
        self.assertNotEqual(user.password, self.password)
        self.assertEqual(int(self.client.session['_auth_user_id']), user.pk)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_invalid_registration_creates_no_account(self):
        for changes in [{'email': 'invalid'}, {'password2': 'mismatch'},
                        {'password1': '12345678', 'password2': '12345678'},
                        {'password1': 'short', 'password2': 'short'}]:
            with self.subTest(changes=changes):
                response = self.registration(**changes)
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.context['form'].errors)
                self.assertFalse(get_user_model().objects.exists())

    def test_duplicate_username_shows_error(self):
        get_user_model().objects.create_user('controller', password=self.password)
        response = self.registration()
        self.assertIn('username', response.context['form'].errors)
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_login_logout_and_guest_play(self):
        user = get_user_model().objects.create_user('controller', password=self.password)
        response = self.client.post(reverse('login'), {
            'username': user.username, 'password': self.password})
        self.assertRedirects(response, reverse('welcome'))
        self.assertContains(self.client.get('/'), 'Log out')
        self.assertEqual(self.client.get(reverse('logout')).status_code, 405)
        self.assertIn('_auth_user_id', self.client.session)
        self.assertRedirects(self.client.post(reverse('logout')), reverse('welcome'))
        self.assertNotIn('_auth_user_id', self.client.session)
        self.assertContains(self.client.get('/'), 'Create account')
        self.assertEqual(self.client.get(reverse('index')).status_code, 200)

    def test_invalid_or_inactive_credentials_stay_signed_out(self):
        get_user_model().objects.create_user('active', password=self.password)
        get_user_model().objects.create_user('inactive', password=self.password, is_active=False)
        for username, password in [('missing', self.password), ('active', 'Wrong-password-123!'), ('inactive', self.password)]:
            response = self.client.post(reverse('login'), {'username': username, 'password': password})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.context['form'].non_field_errors())
            self.assertNotIn('_auth_user_id', self.client.session)

    def test_login_redirect_accepts_only_safe_destinations(self):
        get_user_model().objects.create_user('controller', password=self.password)
        for target, expected in [('https://untrusted.example/', '/'), ('/play/?map=egll', '/play/?map=egll')]:
            self.client.logout()
            response = self.client.post(reverse('login'), {
                'username': 'controller', 'password': self.password, 'next': target})
            self.assertEqual(response.url, expected)

    def test_account_forms_and_logout_require_csrf(self):
        client = Client(enforce_csrf_checks=True)
        for name in ['register', 'login', 'logout']:
            self.assertEqual(client.post(reverse(name), {}).status_code, 403)
        self.assertFalse(get_user_model().objects.exists())

    def test_signed_in_user_does_not_create_second_account(self):
        self.registration()
        self.assertRedirects(self.client.get(reverse('register')), '/')
        self.assertRedirects(self.client.get(reverse('login')), '/')


class AdminAccessTests(TestCase):
    def test_anonymous_and_regular_players_cannot_access_accounts(self):
        url = reverse('admin:auth_user_changelist')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith(reverse('admin:login')))
        user = get_user_model().objects.create_user('player', password='Test-Player-987!')
        self.client.force_login(user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith(reverse('admin:login')))

    def test_superuser_can_manage_accounts(self):
        user = get_user_model().objects.create_superuser(
            'admin_test', 'admin@example.com', 'Test-Admin-987!')
        self.client.force_login(user)
        response = self.client.get(reverse('admin:auth_user_changelist'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'admin_test')
