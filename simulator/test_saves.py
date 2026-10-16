import copy
import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import Client, TestCase
from django.urls import reverse

from .models import SavedGame
from .save_format import validate_snapshot


def fixture():
    return json.loads((Path(settings.BASE_DIR) / 'tests/fixtures/save-v1.json').read_text())


class SavedGameTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('owner')
        self.other = get_user_model().objects.create_user('other')
        self.client.force_login(self.user)
        self.snapshot = fixture()

    def save_request(self, autosave=False, name='Evening approach', snapshot=None, client=None):
        return (client or self.client).post(reverse('save_game'),
            json.dumps({'name': name, 'autosave': autosave, 'snapshot': snapshot or self.snapshot}),
            content_type='application/json')

    def create_save(self, owner=None):
        return SavedGame.objects.create(owner=owner or self.user, name='Test save',
            airport='egll', snapshot=self.snapshot)

    def test_real_engine_fixture_is_valid(self):
        self.assertEqual(validate_snapshot(self.snapshot), self.snapshot)

    def test_manual_save_and_load_exact_snapshot(self):
        response = self.save_request()
        self.assertEqual(response.status_code, 200)
        save = SavedGame.objects.get(pk=response.json()['id'])
        self.assertEqual(save.owner_id, self.user.pk)
        self.assertEqual(save.airport, 'egll')
        self.assertFalse(save.is_autosave)
        self.assertEqual(save.snapshot, self.snapshot)
        self.assertIsNotNone(save.saved_at)
        response = self.client.get(reverse('load_game', args=[save.pk]))
        self.assertEqual(response.json()['snapshot'], self.snapshot)
        self.assertContains(self.client.get(reverse('index'), {'save': save.pk}), 'data-load-url=')

    def test_autosave_replaces_only_its_own_slot(self):
        self.save_request()
        first = self.save_request(autosave=True).json()['id']
        updated = copy.deepcopy(self.snapshot); updated['state']['score'] = 123
        second = self.save_request(autosave=True, snapshot=updated).json()['id']
        self.assertEqual(first, second)
        self.assertEqual(SavedGame.objects.count(), 2)
        self.assertEqual(SavedGame.objects.get(pk=first).snapshot['state']['score'], 123)
        self.assertEqual(SavedGame.objects.get(is_autosave=False).snapshot, self.snapshot)
        self.client.force_login(self.other)
        self.assertNotEqual(self.save_request(autosave=True).json()['id'], first)

    def test_every_existing_save_action_enforces_ownership(self):
        foreign = self.create_save(self.other)
        for name in ['load_game', 'rename_save', 'delete_save']:
            for method in ['get', 'post']:
                if name == 'load_game' and method == 'post':
                    continue
                response = getattr(self.client, method)(reverse(name, args=[foreign.pk]), {})
                self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get(reverse('index'), {'save': foreign.pk}).status_code, 404)
        self.assertEqual(SavedGame.objects.count(), 1)
        self.assertNotContains(self.client.get(reverse('saved_games')), 'Test save')

    def test_signed_out_api_and_guest_play(self):
        self.client.logout()
        self.assertEqual(self.save_request().status_code, 401)
        self.assertEqual(self.client.get(reverse('load_game', args=[1])).status_code, 401)
        self.assertEqual(self.client.get(reverse('saved_games')).status_code, 302)
        self.assertEqual(self.client.get(reverse('index')).status_code, 200)
        self.assertNotContains(self.client.get(reverse('index')), 'id="saveBtn"')

    def test_rename_delete_confirmation_and_cancel(self):
        save = self.create_save(); saved_at = save.saved_at
        response = self.client.post(reverse('rename_save', args=[save.pk]), {'name': '  New name  '})
        self.assertRedirects(response, reverse('saved_games'))
        save.refresh_from_db(); self.assertEqual(save.name, 'New name')
        self.assertEqual(save.saved_at, saved_at)
        for name in ['', '   ', 'x' * 81]:
            response = self.client.post(reverse('rename_save', args=[save.pk]), {'name': name})
            self.assertTrue(response.context['form'].errors)
        self.assertContains(self.client.get(reverse('delete_save', args=[save.pk])), 'Cancel')
        self.client.get(reverse('saved_games'))
        self.assertTrue(SavedGame.objects.filter(pk=save.pk).exists(), 'GET/cancel never deletes')
        self.assertRedirects(self.client.post(reverse('delete_save', args=[save.pk])), reverse('saved_games'))
        self.assertFalse(SavedGame.objects.filter(pk=save.pk).exists())

    def test_empty_list_and_escaped_save_names(self):
        self.assertContains(self.client.get(reverse('saved_games')), 'No saved games yet')
        self.save_request(name='<script>bad</script>')
        response = self.client.get(reverse('saved_games'))
        self.assertContains(response, '&lt;script&gt;bad&lt;/script&gt;')
        self.assertNotContains(response, '<script>bad</script>')

    def test_invalid_json_and_options_do_not_create_saves(self):
        for body in ['null', '{bad', '{}', '{"name": "X", "autosave": "false", "snapshot": {}}']:
            self.assertEqual(self.client.post(reverse('save_game'), body, content_type='application/json').status_code, 400)
        self.assertEqual(self.save_request(name=' ').status_code, 400)
        self.assertEqual(self.save_request(name='x' * 81).status_code, 400)
        self.assertFalse(SavedGame.objects.exists())

    def test_invalid_snapshots_do_not_overwrite_autosave(self):
        save_id = self.save_request(autosave=True).json()['id']
        mutations = [lambda s: s.update(version=99), lambda s: s.update(airport='unknown'),
            lambda s: s['state']['aircraft'][0].update(nav='INVALID'),
            lambda s: s['state']['aircraft'][0].update(callsign='<script>'),
            lambda s: s['state']['aircraft'][0].update(x=float('nan')),
            lambda s: s['state'].update(conflicts=['1-999']),
            lambda s: s['state']['aircraft'][1].update(phase='takeoff', runway=None),
            lambda s: s['state']['aircraft'][1].update(id=1),
            lambda s: s['state']['upcoming'][0].update(dueAt='soon')]
        for mutate in mutations:
            bad = copy.deepcopy(self.snapshot); mutate(bad)
            self.assertEqual(self.save_request(autosave=True, snapshot=bad).status_code, 400)
        self.assertEqual(SavedGame.objects.get(pk=save_id).snapshot, self.snapshot)

    def test_corrupt_or_missing_saves_return_useful_errors(self):
        save = self.create_save(); save.snapshot = {'version': 999}; save.save()
        response = self.client.get(reverse('load_game', args=[save.pk]))
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())
        self.assertEqual(self.client.get(reverse('load_game', args=[999])).status_code, 404)
        self.assertEqual(self.client.get(reverse('index'), {'save': 'bad'}).status_code, 404)

    def test_mutations_require_csrf(self):
        csrf = Client(enforce_csrf_checks=True); csrf.force_login(self.user)
        save = self.create_save()
        self.assertEqual(self.save_request(client=csrf).status_code, 403)
        for name in ['rename_save', 'delete_save']:
            self.assertEqual(csrf.post(reverse(name, args=[save.pk]), {'name': 'Blocked'}).status_code, 403)
        save.refresh_from_db(); self.assertEqual(save.name, 'Test save')

    def test_payload_limit(self):
        response = self.client.post(reverse('save_game'), ' ' * (1024 * 1024 + 1), content_type='application/json')
        self.assertEqual(response.status_code, 413)
        self.assertFalse(SavedGame.objects.exists())


    def test_database_failure_has_useful_feedback(self):
        from unittest.mock import patch
        from django.db import DatabaseError
        with patch('simulator.save_views.SavedGame.objects.filter', side_effect=DatabaseError):
            response = self.client.get(reverse('saved_games'))
        self.assertEqual(response.status_code, 503)
        self.assertContains(response, 'Saved games could not be loaded', status_code=503)
        with patch('simulator.save_views.SavedGame.objects.create', side_effect=DatabaseError):
            response = self.save_request()
        self.assertEqual(response.status_code, 503)
        self.assertIn('unchanged', response.json()['error'])

    def test_autosave_name_is_fixed_and_delete_recreates_only_on_next_save(self):
        pk = self.save_request(autosave=True).json()['id']
        self.client.post(reverse('rename_save', args=[pk]), {'name': 'Changed'})
        self.assertEqual(SavedGame.objects.get(pk=pk).name, 'Autosave')
        self.client.post(reverse('delete_save', args=[pk]))
        self.assertFalse(SavedGame.objects.filter(pk=pk).exists())
        new_pk = self.save_request(autosave=True).json()['id']
        self.assertNotEqual(pk, new_pk)
        self.assertEqual(SavedGame.objects.filter(is_autosave=True, owner=self.user).count(), 1)
