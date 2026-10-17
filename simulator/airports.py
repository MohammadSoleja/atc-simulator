"""Local airport definitions shared by Django and the browser; no network lookup."""
import json
import math
import re
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

# Only product-owner-playtested airports belong in the selectable registry.
MAP_FILES = {'egll': Path(__file__).with_name('airports') / 'egll.json'}
DEFAULT_AIRPORT = 'egll'


def validate_airport(data):
    def require(condition, label):
        if not condition:
            raise ImproperlyConfigured(f'Invalid airport configuration: {label}.')

    def number(value, low, high):
        return type(value) in (int, float) and math.isfinite(value) and low <= value <= high

    def coordinate(value, latitude):
        pattern = r'\d{6}(?:\.\d+)?[NS]' if latitude else r'\d{7}(?:\.\d+)?[EW]'
        if not isinstance(value, str) or not re.fullmatch(pattern, value):
            return False
        digits = 2 if latitude else 3
        degrees, minutes, seconds = int(value[:digits]), int(value[digits:digits+2]), float(value[digits+2:-1])
        return minutes < 60 and seconds < 60 and degrees + minutes/60 + seconds/3600 <= (90 if latitude else 180)

    try:
        require(type(data['version']) is int and data['version'] == 1, 'unsupported format version')
        require(isinstance(data['id'], str) and re.fullmatch('[a-z0-9]{4}', data['id']), 'airport identifier')
        require(isinstance(data['code'], str) and re.fullmatch('[A-Z0-9]{4}', data['code']), 'airport code')
        for key in ['name', 'short_name']:
            require(isinstance(data[key], str) and 0 < len(data[key].strip()) <= 100, key)
        sector, display, traffic = data['sector'], data['display'], data['traffic']
        for key in ['width', 'height']:
            require(number(sector[key], 10, 500), 'sector bounds')
            require(number(display[key], 100, 5000), 'display dimensions')
        require(abs(display['width']/display['height'] - sector['width']/sector['height']) < .001, 'display/sector aspect ratio')
        require(number(sector['latitude'], -85, 85) and number(sector['longitude'], -180, 180), 'sector centre')
        require(number(display['zoom'], .5, 4) and number(display['approach_range_nm'], 1, 100), 'map zoom/approach range')
        require(number(data['wind']['heading'], 0, 360) and number(data['wind']['speed'], 0, 100), 'wind')
        require(isinstance(data['runways'], list) and 1 <= len(data['runways']) <= 8, 'runways')
        ends = set()
        for runway in data['runways']:
            require(len(runway['ends']) == len(runway['headings']) == 2, 'runway ends')
            for point in [runway['start'], runway['end']]:
                require(len(point) == 2 and coordinate(point[0], True) and coordinate(point[1], False), 'runway coordinates')
            require(runway['start'] != runway['end'], 'runway length')
            for name, heading in zip(runway['ends'], runway['headings']):
                require(isinstance(name, str) and re.fullmatch(r'(?:0[1-9]|[12][0-9]|3[0-6])[LRC]?', name) and name not in ends, 'duplicate/invalid runway identifier')
                require(number(heading, 0, 360), 'runway heading')
                require(abs((heading - (int(name[:2])*10)%360 + 180)%360 - 180) <= 10, 'runway number/heading mismatch')
                ends.add(name)
            first, second = runway['ends']
            require((int(first[:2]) - int(second[:2])) % 36 == 18, 'reciprocal runway numbers')
            require({'L':'R','R':'L','C':'C','':''}.get(first[2:]) == second[2:], 'reciprocal runway sides')
            require(abs((runway['headings'][1] - runway['headings'][0])%360 - 180) < .01, 'reciprocal runway headings')
        require(isinstance(data['fixes'], list) and 1 <= len(data['fixes']) <= 200, 'navigation fixes')
        fixes = set()
        for fix in data['fixes']:
            require(isinstance(fix['id'], str) and re.fullmatch('[A-Z0-9]{2,8}', fix['id']) and fix['id'] not in fixes, 'duplicate/invalid fix')
            require(fix['kind'] in ['RNAV','VOR/DME','DME','NDB'], 'fix type')
            require(coordinate(fix['latitude'], True) and coordinate(fix['longitude'], False), 'fix coordinates')
            require(len(fix['label_offset']) == 2 and all(number(n, -100, 100) for n in fix['label_offset']), 'fix label offset')
            fixes.add(fix['id'])
        require(isinstance(data['departure_fixes'], list) and bool(data['departure_fixes']) and len(set(data['departure_fixes'])) == len(data['departure_fixes']) and set(data['departure_fixes']) <= fixes, 'departure fixes')
        for key, low, high in [('start_seconds',0,86399),('interval_seconds',1,3600),('notice_seconds',1,3600),('buildup_seconds',1,3600),('initial_arrivals',0,100)]:
            require(type(traffic[key]) is int and low <= traffic[key] <= high, key)
        if 'waves' in traffic:
            waves = traffic['waves']
            for key, low, high in [('spacing_seconds',1,30),('interval_seconds',300,600),('jitter_seconds',0,150)]:
                require(type(waves[key]) is int and low <= waves[key] <= high, 'wave '+key)
            require(waves['jitter_seconds'] < waves['interval_seconds'], 'wave timing')
        for key, low, high in [('arrival_altitude_hundreds',1,999),('arrival_speed',140,350)]:
            values = traffic[key]
            require(len(values) == 2 and all(number(n, low, high) for n in values) and values[0] <= values[1], key)
        require(number(traffic['arrival_target_speed'], 140, 350), 'arrival target speed')
        previous = 0
        require(isinstance(traffic['patterns'], list) and bool(traffic['patterns']), 'traffic patterns')
        for pattern in traffic['patterns']:
            require(number(pattern['until_minute'], previous + 1e-9, 1440) and number(pattern['density'], 0, 5) and number(pattern['arrival_share'], 0, 1), 'traffic pattern interval')
            previous = pattern['until_minute']
        require(previous == 1440, 'traffic patterns must cover a full day')
        require(isinstance(traffic['description'], str) and bool(traffic['description'].strip()), 'traffic description')
        background = data['background']
        require(isinstance(background['asset'], str) and re.fullmatch(r'simulator/js/[a-z0-9-]+\.js', background['asset']), 'local background asset')
        require((Path(__file__).with_name('static') / background['asset']).is_file(), 'missing background asset')
        require(isinstance(background['attribution'], str) and bool(background['attribution'].strip()), 'background attribution')
        require(isinstance(background['sources'], list) and bool(background['sources']), 'background sources')
        for source in background['sources']:
            for key in ['name','url','licence','licence_url']:
                require(isinstance(source[key], str) and bool(source[key].strip()), 'source attribution/licence')
        require(isinstance(data['aeronautical_sources'], list) and bool(data['aeronautical_sources']), 'aeronautical sources')
        for source in data['aeronautical_sources']:
            require(bool(source['name']) and isinstance(source['url'], str) and source['url'].startswith('https://'), 'aeronautical source')
    except (KeyError, TypeError, ValueError, IndexError, AttributeError) as error:
        raise ImproperlyConfigured('Invalid airport configuration: missing or malformed fields.') from error
    return data


def get_airport(identifier):
    if identifier not in MAP_FILES:
        raise KeyError(identifier)
    try:
        data = json.loads(MAP_FILES[identifier].read_text())
    except (OSError, ValueError) as error:
        raise ImproperlyConfigured(f'Airport {identifier} configuration cannot be read.') from error
    validate_airport(data)
    if data['id'] != identifier:
        raise ImproperlyConfigured('Airport configuration does not match its registry identifier.')
    return data


def available_airports():
    return [get_airport(identifier) for identifier in MAP_FILES]


def label_saves(saves):
    """Attach registry names to metadata rows without accessing snapshot JSON."""
    labels = {}
    for identifier in MAP_FILES:
        try:
            airport = get_airport(identifier)
            labels[identifier] = f"{airport['name']} ({airport['code']})"
        except ImproperlyConfigured:
            continue  # Keep save management available if a map needs repairing.
    for save in saves:
        save.airport_label = labels.get(save.airport, save.airport.upper())
    return saves
