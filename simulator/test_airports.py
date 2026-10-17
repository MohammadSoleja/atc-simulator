import copy
import json
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.test import SimpleTestCase

from .airports import MAP_FILES, get_airport, validate_airport
from .save_format import validate_snapshot

TEST_FILE = Path(settings.BASE_DIR) / 'tests/fixtures/test-airport.json'


class AirportConfigurationTests(SimpleTestCase):
    def test_heathrow_definition_contains_existing_runways_and_fixes(self):
        airport = get_airport('egll')
        self.assertEqual({end for r in airport['runways'] for end in r['ends']}, {'09L','09R','27L','27R'})
        self.assertEqual(len(airport['fixes']), 13)
        self.assertEqual(airport['sector']['width'], 100)
        self.assertEqual(airport['traffic']['interval_seconds'], 30)
        self.assertNotIn('LON', airport['departure_fixes'])
        self.assertIn('Open Government Licence', airport['background']['sources'][0]['licence'])

    def test_only_approved_airports_are_available(self):
        self.assertEqual(set(MAP_FILES), {'egll'})
        for identifier in ['oerk', 'egkk', '../egll', '/tmp/egll', '']:
            self.assertEqual(self.client.get('/play/', {'map': identifier}).status_code, 404)

    def test_selection_drives_template_and_serialized_definition(self):
        with patch.dict(MAP_FILES, {'test': TEST_FILE}):
            response = self.client.get('/play/', {'map': 'test'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.context['airport']['id'], 'test')
            self.assertContains(response, 'TEST APPROACH')
            self.assertContains(response, '18 / 36')
            self.assertContains(response, 'Synthetic map used only by tests.')
            self.assertContains(response, 'id="airportDefinition"')
            self.assertNotContains(response, 'EGLL APPROACH')
            self.assertContains(self.client.get('/'), '<option value="test">Test Airport (TEST)</option>', html=True)

    def test_invalid_configuration_returns_useful_error_instead_of_game(self):
        with patch('simulator.views.get_airport', side_effect=ImproperlyConfigured('Invalid airport configuration: duplicate runway.')):
            response = self.client.get('/play/?map=egll')
        self.assertEqual(response.status_code, 503)
        self.assertContains(response, 'duplicate runway', status_code=503)
        self.assertNotContains(response, 'id="radar"', status_code=503)

    def test_configuration_validation_rejects_broken_maps(self):
        airport = get_airport('egll')
        mutations = [lambda a: a.update(version=99), lambda a: a['sector'].update(width=0),
            lambda a: a['runways'][0].update(ends=['09L','09L']),
            lambda a: a['runways'][0].update(headings=[90,90]),
            lambda a: a['runways'][0].update(start=['999999N','0000000W']),
            lambda a: a['fixes'].append(a['fixes'][0]),
            lambda a: a.update(departure_fixes=['MISSING']),
            lambda a: a['traffic']['patterns'][-1].update(until_minute=1400),
            lambda a: a['background'].update(attribution=''),
            lambda a: a['background'].update(asset='../../private.js')]
        for mutate in mutations:
            broken = copy.deepcopy(airport); mutate(broken)
            with self.assertRaises(ImproperlyConfigured):
                validate_airport(broken)

    def test_save_validation_uses_the_saved_airport(self):
        snapshot = json.loads((Path(settings.BASE_DIR) / 'tests/fixtures/save-v1.json').read_text())
        self.assertEqual(validate_snapshot(snapshot)['airport'], 'egll')
        snapshot['airport'] = 'test'
        with patch.dict(MAP_FILES, {'test': TEST_FILE}):
            with self.assertRaises(ValidationError):
                validate_snapshot(snapshot)  # Heathrow references are invalid on this map.
            for a in snapshot['state']['aircraft']:
                a['nav'] = 'TST1' if a['nav'] else None
                if a.get('runway'):
                    a['runway'] = '18'
                if a.get('exitFix'):
                    a['exitFix'] = 'TST2'
            for flight in snapshot['state']['upcoming']:
                if 'exitFix' in flight:
                    flight['exitFix'] = 'TST2'
            self.assertEqual(validate_snapshot(snapshot)['airport'], 'test')

    def test_missing_definition_and_wrong_registry_identity_are_rejected(self):
        with patch.dict(MAP_FILES, {'missing': TEST_FILE.with_name('missing.json'), 'other': TEST_FILE}):
            for identifier in ['missing', 'other']:
                with self.assertRaises(ImproperlyConfigured):
                    get_airport(identifier)
