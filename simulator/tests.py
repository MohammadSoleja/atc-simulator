from django.test import SimpleTestCase
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
