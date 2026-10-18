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
        self.assertEqual(set(MAP_FILES), {'egll', 'oerk'})
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

    def test_independent_traffic_schedule_save_compatibility(self):
        snapshot = json.loads((Path(settings.BASE_DIR) / 'tests/fixtures/save-v1.json').read_text())
        # Existing version-1 saves remain valid; new saves add the stream reservations.
        validate_snapshot(snapshot)
        snapshot['state']['trafficSchedule'] = {'arrival': 60, 'departure': 120}
        pending = snapshot['state']['upcoming']
        for index in range(1, 8):
            flight = copy.deepcopy(pending[0])
            flight.update(callsign=f'BAW{1000 + index}', dueAt=60 + index * 15)
            pending.append(flight)
        validate_snapshot(snapshot)
        snapshot['state']['trafficSchedule']['arrival'] = -1
        with self.assertRaises(ValidationError):
            validate_snapshot(snapshot)


    def test_pending_callsigns_are_unique_across_the_snapshot(self):
        original = json.loads((Path(settings.BASE_DIR) / 'tests/fixtures/save-v1.json').read_text())
        for duplicate in [original['state']['upcoming'][0]['callsign'], original['state']['aircraft'][0]['callsign']]:
            snapshot = copy.deepcopy(original)
            flight = copy.deepcopy(snapshot['state']['upcoming'][0])
            flight['callsign'] = duplicate
            snapshot['state']['upcoming'].append(flight)
            with self.assertRaisesMessage(ValidationError, 'Pending callsigns must be unique'):
                validate_snapshot(snapshot)
        snapshot = copy.deepcopy(original)
        flight = copy.deepcopy(snapshot['state']['upcoming'][0])
        flight['callsign'] = 'BAW9999'
        snapshot['state']['upcoming'].append(flight)
        validate_snapshot(snapshot)
