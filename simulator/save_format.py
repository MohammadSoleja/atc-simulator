"""Validate version 1 snapshots before storing or returning browser game state."""
import math
import re
from uuid import UUID

from django.core.exceptions import ImproperlyConfigured, ValidationError

from .airports import get_airport

VERSION = 1
TYPES = {'A320', 'A321', 'B738', 'B789', 'A20N', 'B77W'}
TIMERS = {'elapsed', 'clockElapsed', 'trafficElapsed', 'lastSpawn'}
COUNTERS = {'landings', 'handoffs', 'violations', 'missed', 'nextId'}
AIRCRAFT_REQUIRED = {'id', 'callsign', 'type', 'kind', 'x', 'y', 'heading', 'targetHeading',
                     'altitude', 'targetAltitude', 'speed', 'targetSpeed', 'verticalSpeed',
                     'trail', 'clearedToLand', 'landed', 'nav', 'phase'}
AIRCRAFT_OPTIONAL = {'runway', 'exitFix', 'bank', 'approachCaptured', 'removeAt'}


def fail(message):
    raise ValidationError(message)


def fields(value, required, optional=set()):
    if not isinstance(value, dict) or not required <= value.keys() or value.keys() - required - optional:
        fail('Save contains missing or unexpected fields.')


def number(value, label, low=0, high=1e9, integer=False):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        fail(f'Invalid {label}.')
    if integer and (type(value) is not int):
        fail(f'{label} must be an integer.')


def choice(value, choices, label, nullable=False):
    if nullable and value is None:
        return
    if not isinstance(value, str) or value not in choices:
        fail(f'Unknown {label}.')


def identity(flight):
    if not isinstance(flight['callsign'], str) or not re.fullmatch(r'[A-Z]{3}[0-9]{1,7}', flight['callsign']):
        fail('Invalid aircraft callsign.')
    choice(flight['type'], TYPES, 'aircraft type')
    choice(flight['kind'], {'arrival', 'departure'}, 'traffic kind')


def validate_snapshot(snapshot):
    fields(snapshot, {'version', 'airport', 'session_id', 'pace', 'state'})
    if type(snapshot['version']) is not int or snapshot['version'] != VERSION:
        fail('Unsupported save version. This game supports version 1.')
    if not isinstance(snapshot['airport'], str):
        fail('Unknown airport.')
    try:
        airport = get_airport(snapshot['airport'])
    except (KeyError, ImproperlyConfigured):
        fail('This airport is not available or its configuration is invalid.')
    fixes = {fix['id'] for fix in airport['fixes']}
    runways = {end for runway in airport['runways'] for end in runway['ends']}
    departure_fixes = set(airport['departure_fixes'])
    try:
        UUID(snapshot['session_id'])
    except (ValueError, TypeError, AttributeError):
        fail('Invalid game session identifier.')
    if type(snapshot['pace']) is not int or snapshot['pace'] not in {1, 2, 4, 8}:
        fail('Invalid simulation pace.')
    state = snapshot['state']
    fields(state, TIMERS | COUNTERS | {'score', 'aircraft', 'upcoming', 'conflicts'}, {'trafficSchedule'})
    if 'trafficSchedule' in state:
        fields(state['trafficSchedule'], {'arrival', 'departure'})
        for value in state['trafficSchedule'].values():
            number(value, 'traffic schedule')
    for key in TIMERS:
        number(state[key], key)
    for key in COUNTERS:
        number(state[key], key, low=1 if key == 'nextId' else 0, integer=True)
    number(state['score'], 'score', low=-1e9, integer=True)
    if state['lastSpawn'] > state['trafficElapsed']:
        fail('Traffic timer is inconsistent.')
    if not isinstance(state['aircraft'], list) or len(state['aircraft']) > 100:
        fail('A save may contain at most 100 active aircraft.')
    ids, callsigns = set(), set()
    for a in state['aircraft']:
        fields(a, AIRCRAFT_REQUIRED, AIRCRAFT_OPTIONAL)
        identity(a)
        number(a['id'], 'aircraft ID', low=1, integer=True)
        if a['id'] in ids or a['callsign'] in callsigns or a['id'] >= state['nextId']:
            fail('Aircraft identifiers must be unique and below nextId.')
        ids.add(a['id']); callsigns.add(a['callsign'])
        for key in ['x', 'y']:
            number(a[key], key, low=-2, high=3)
        for key in ['heading', 'targetHeading']:
            number(a[key], key, high=360)
        for key in ['altitude', 'targetAltitude']:
            number(a[key], key, high=100000)
        for key in ['speed', 'targetSpeed']:
            number(a[key], key, high=350)
        number(a['verticalSpeed'], 'vertical speed', low=-10000, high=10000)
        if 'bank' in a:
            number(a['bank'], 'bank', low=-30, high=30)
        for key in ['landed', 'approachCaptured']:
            if key in a and type(a[key]) is not bool:
                fail(f'Invalid {key}.')
        if 'removeAt' in a:
            number(a['removeAt'], 'removal timer')
        choice(a['phase'], {'holding', 'takeoff', 'airborne', 'landed'}, 'aircraft phase')
        choice(a['nav'], fixes, 'navigation fix', nullable=True)
        choice(a['clearedToLand'], runways, 'landing runway', nullable=True)
        choice(a.get('runway'), runways, 'departure runway', nullable=True)
        if a['kind'] == 'departure':
            choice(a.get('exitFix'), departure_fixes, 'departure exit fix')
            if a['phase'] not in {'holding', 'takeoff', 'airborne'} or a['clearedToLand'] or a['landed']:
                fail('Invalid departure state.')
            if a['phase'] == 'takeoff' and not a.get('runway'):
                fail('A takeoff requires a runway.')
        elif a['phase'] not in {'airborne', 'landed'}:
            fail('Invalid arrival state.')
        if bool(a.get('approachCaptured')) and not a['clearedToLand']:
            fail('A captured approach requires a landing runway.')
        if a['landed'] != (a['phase'] == 'landed') or (a['landed'] and 'removeAt' not in a):
            fail('Invalid completed landing state.')
        if not isinstance(a['trail'], list) or len(a['trail']) > 8:
            fail('Invalid aircraft trail.')
        for point in a['trail']:
            fields(point, {'x', 'y', 't'})
            number(point['x'], 'trail x', low=-2, high=3)
            number(point['y'], 'trail y', low=-2, high=3)
            number(point['t'], 'trail timestamp', high=state['elapsed'])
    if not isinstance(state['upcoming'], list) or len(state['upcoming']) > 10:
        fail('A save may contain at most ten pending flights.')
    for flight in state['upcoming']:
        fields(flight, {'callsign', 'kind', 'type', 'dueAt'}, {'exitFix', 'altitude', 'targetAltitude', 'speed'})
        identity(flight)
        if flight['callsign'] in callsigns:
            fail('Pending callsign is already active.')
        number(flight['dueAt'], 'activation time')
        if flight['kind'] == 'departure':
            choice(flight.get('exitFix'), departure_fixes, 'pending exit fix')
        else:
            for key in ['altitude', 'targetAltitude', 'speed']:
                number(flight.get(key), f'pending {key}', high=350 if key == 'speed' else 100000)
    if not isinstance(state['conflicts'], list) or len(state['conflicts']) > 4950:
        fail('Invalid conflict list.')
    seen = set()
    for pair in state['conflicts']:
        if not isinstance(pair, str) or not re.fullmatch(r'[0-9]+-[0-9]+', pair):
            fail('Invalid conflict pair.')
        first, second = map(int, pair.split('-'))
        if first >= second or first not in ids or second not in ids or pair in seen:
            fail('Invalid conflict identifiers.')
        seen.add(pair)
    return snapshot
