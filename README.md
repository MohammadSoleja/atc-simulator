# ATC Simulator

A from-scratch browser ATC simulator built with Django and vanilla JavaScript.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver
```

Then open `http://127.0.0.1:8000/`.

## Current playable features

- Heathrow-style radar sector with two runways
- Arrivals and departures
- Aircraft heading, altitude and speed simulation
- Clickable aircraft and flight strips
- Typed ATC commands
- Direct-to navigation fixes
- Takeoff and landing clearances
- Go-arounds
- Traffic spawning and traffic-rate controls
- 3 NM / 1,000 ft separation monitoring
- Conflict warnings
- Landing, handoff, violation and missed-arrival scoring
- Pause, restart and manual traffic generation

## Commands

- `BAW123 H 270` — heading 270
- `BAW123 A 4000` — altitude 4,000 ft
- `BAW123 S 180` — speed 180 kt
- `BAW123 D BPK` — direct BPK
- `BAW123 L 27L` — cleared to land runway 27L
- `BAW123 T` — cleared for takeoff
- `BAW123 G` — go around
- `STATS` — current statistics

Commands may be chained, e.g. `BAW123 H 270 A 4000 S 180`.

This is an original implementation inspired by browser ATC games and does not reuse ATC-SIM source code or proprietary assets.
