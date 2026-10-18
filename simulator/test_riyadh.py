"""Local-preview routing, airport facts and save compatibility for OERK."""
import copy
import json
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.test import SimpleTestCase, override_settings

from .airports import available_airports, get_airport, validate_airport
from .save_format import validate_snapshot


@override_settings(DEBUG=True)
class RiyadhTests(SimpleTestCase):
    def test_local_preview_selection_and_help(self):
        response = self.client.get('/play/?map=oerk')
        self.assertEqual(response.status_code, 200)
        for text in ['OERK APPROACH', 'PLAYTEST', '15L / 33R', '15R / 33L', 'map-oerk.js', '2053', '7000 ft']:
            self.assertContains(response, text)
        welcome = self.client.get('/')
        self.assertContains(welcome, 'value="oerk"')
        self.assertContains(welcome, 'Playtest')

    @override_settings(DEBUG=False)
    def test_unapproved_map_stays_out_of_production(self):
        self.assertEqual([a['id'] for a in available_airports()], ['egll'])
        self.assertEqual(self.client.get('/play/?map=oerk').status_code, 404)
        self.assertNotContains(self.client.get('/'), 'value="oerk"')

    def test_published_geometry_and_fix_sources(self):
        data = get_airport('oerk')
        self.assertEqual(data['elevation_ft'], 2053)
        self.assertEqual((data['sector']['width'], data['sector']['height']), (100, 100))
        self.assertEqual(data['runways'][0]['start'], ['245836.69N', '0464207.25E'])
        self.assertEqual(data['runways'][1]['threshold_elevations_ft'], [2052.8, 2036.7])
        self.assertEqual(len(data['fixes']), 16)
        self.assertTrue(all('10_26_2026_10_01' in f['source'] for f in data['fixes']))
        self.assertNotIn('KIA', [f['id'] for f in data['fixes']])

    def test_elevation_configuration_is_validated(self):
        data = get_airport('oerk')
        for change in [lambda a: a.update(elevation_ft='2053'),
                       lambda a: a['runways'][0].update(threshold_elevations_ft=[0, 0]),
                       lambda a: a['background'].update(style='unknown'),
                       lambda a: a['fixes'][0].update(position_offset_nm={'east': 0, 'north': 999})]:
            broken = copy.deepcopy(data)
            change(broken)
            with self.assertRaises(ImproperlyConfigured):
                validate_airport(broken)

    def test_map_specific_saves_keep_altitudes_and_identifiers(self):
        snapshot = json.loads((Path(settings.BASE_DIR) / 'tests/fixtures/save-v1.json').read_text())
        snapshot['airport'] = 'oerk'
        with self.assertRaises(ValidationError):
            validate_snapshot(snapshot)
        for a in snapshot['state']['aircraft']:
            a['altitude'] += 2053
            a['targetAltitude'] += 2053
            a['nav'] = 'KSA' if a['nav'] else None
            if 'runway' in a:
                a['runway'] = '33L'
            if 'exitFix' in a:
                a['exitFix'] = 'LOTER'
        self.assertEqual(validate_snapshot(snapshot), snapshot)
        snapshot['airport'] = 'egll'
        with self.assertRaises(ValidationError):
            validate_snapshot(snapshot)
