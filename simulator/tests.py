from django.test import SimpleTestCase
from django.urls import reverse


class PageRoutingTests(SimpleTestCase):
    def test_welcome_links_to_simulator_without_loading_game(self):
        response = self.client.get(reverse('welcome'))
        self.assertEqual(reverse('welcome'), '/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'simulator/welcome.html')
        self.assertContains(response, 'href="/play/"')
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
