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

- `BAW123 C 3` — altitude 3,000 ft
- `BAW123 C 12` — altitude 12,000 ft
- `BAW123 C 4000` — altitude 4,000 ft
- `BAW123 C 270` — heading 270°
- `BAW123 C 010` — heading 10° (leading zeros required)
- `BAW123 S 180` — speed 180 kt
- `BAW123 C CPT` — direct CPT
- `BAW123 L 27L` — cleared to land runway 27L
- `BAW123 R 27L` — assign departure runway (required before takeoff)
- `BAW123 C 5 R 27L T` — altitude, runway and takeoff in one command
- `BAW123 T` — cleared for takeoff after altitude and runway assignment
- `BAW123 G` — go around
- `STATS` — current statistics

For `C`, one or two digits mean altitude in thousands of feet, exactly three
digits from `001` to `360` mean heading, and numbers above `360` mean altitude
in feet. Thus `C 1 C 010` assigns 1,000 ft and heading 10°.

Commands may be chained, e.g. `BAW123 C 3 C 270 S 180`.
The existing `H` (heading), `A` (altitude), and `D` (direct) commands also remain supported.
Arrivals hold their random initial altitude until given an altitude clearance;
landing and go-around clearances retain their existing automatic altitude behaviour.

This is an original implementation inspired by browser ATC games and does not reuse ATC-SIM source code or proprietary assets.

## Sector and runway data

The radar covers 100 × 70 NM around Heathrow with a uniform map scale.
Runway thresholds and the BPK, LAM, OCK, BIG, BNN, CPT, HEN, WOD and LON
navigation points use public NATS UK AIP coordinates (2026-10-01):
[ENR 4.1](https://www.aurora.nats.co.uk/htmlAIP/Publications/2026-10-01-AIRAC/html/eAIP/EG-ENR-4.1-en-GB.html)
and [EGLL AD 2.12](https://www.aurora.nats.co.uk/htmlAIP/Publications/2026-10-01-AIRAC/html/eAIP/EG-AD-2.EGLL-en-GB.html).
Runway lines and aircraft share the same geographic coordinates; labels alone
are offset for readability. Landing completion requires proximity to the selected
runway centreline and threshold. Headings remain simplified to 090/270.
Both ends accept landing clearances: northern 09L/27R and southern 09R/27L.
Departures require an explicit runway assignment with `R` (or `RWY`). Choose
27L/27R for the displayed westerly wind, or 09L/09R for eastbound testing. They
stay in the flight strips while waiting and appear on radar after takeoff clearance.

Sessions start with one arrival. Automatic traffic intervals gradually decrease
from three times the selected interval to the normal interval over five minutes.
Pause/Resume stays visible in the command console. Strips and desktop command
help scroll independently while the game fits the browser viewport.


RNAV fixes DONNA, DORKI, HILLY and NIGIT use coordinates from
[NATS ENR 4.4](https://www.aurora.nats.co.uk/htmlAIP/Publications/2026-10-01-AIRAC/html/eAIP/EG-ENR-4.4-en-GB.html).
RNAV fixes use triangles, radio aids circles, and NDBs double circles.
These are direct-to navigation points, without SID/STAR or fly-by route modelling.

## Speed and simulation pace

Pace defaults to 4×; choose 1×, 2×, 4× or 8×. Movement, turns, climbs, spawning,
clock and separation checks all advance at the same simulation rate. At 1×,
180 kt covers 3 NM per minute. Small update steps preserve checks at faster pace.

Speed commands use simplified type-specific game envelopes:

| Type | Command range (kt) | Final approach (kt) | Initial climb (kt) |
| --- | --- | --- | --- |
| A320 / A20N | 140–350 | 140 | 175 |
| A321 | 145–350 | 145 | 175 |
| B738 | 145–340 | 145 | 180 |
| B789 | 150–330 | 150 | 185 |
| B77W | 155–330 | 155 | 190 |

These are rounded gameplay approximations, informed by
[Airbus aircraft characteristics](https://aircraft.airbus.com/sites/g/files/jlcbta126/files/2023-12/ac_a320_1223.pdf),
[Boeing approach-speed data](https://www.boeing.com/content/dam/boeing/v2/airports/faq/arcandapproachspeeds.pdf),
and [EUROCONTROL performance summaries](https://contentzone.eurocontrol.int/aircraftperformance/default.aspx?ICAOFilter=a320).
They are not certified performance limits or configuration/weight-dependent stall
speeds. The simulation uses one speed value for command/display and movement;
it does not yet distinguish indicated, true and ground speed or model wind.
Out-of-range/non-numeric speed commands are rejected with the accepted range.
