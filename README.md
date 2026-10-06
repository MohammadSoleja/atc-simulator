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
- Gradual traffic spawning
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
from twice the Normal interval (30 seconds) to the normal interval over five unpaused playing minutes, independent of simulation pace. The arrival/departure mix follows the airport clock; automatic arrivals are capped at five active aircraft, with at most two waiting departures.
The Add traffic button remains a manual override.
Pause/Resume stays visible in the command console. Flight strips scroll independently while the game fits the browser viewport. Help opens a dialog and pauses play.


RNAV fixes DONNA, DORKI, HILLY and NIGIT use coordinates from
[NATS ENR 4.4](https://www.aurora.nats.co.uk/htmlAIP/Publications/2026-10-01-AIRAC/html/eAIP/EG-ENR-4.4-en-GB.html).
RNAV fixes use triangles, radio aids circles, and NDBs double circles.
These are direct-to navigation points, without SID/STAR or fly-by route modelling.

## Speed and simulation pace

Normal (2×) remains the default gameplay baseline. Header buttons select 1×,
Normal (2×), 4× or 8×; restart restores Normal. Aircraft movement, turns, climbs
and separation checks scale together. Traffic timing also scales relative to
Normal, preserving its previous buildup and caps. At 1×, 180 kt covers 3 NM per
real minute. Small update steps preserve checks at faster pace.

The airport clock starts at 06:00 local airport time, shows HH:MM and wraps daily.
It advances two seconds per real second at Normal, one second at 1×, four at
4× and eight at 8×. It is intentionally separate from aircraft simulation time;
pause and Help freeze both. This is a repeatable simulated day, not the computer's
current time or a date/DST model.

Heathrow-inspired traffic patterns follow
[Heathrow's night schedule](https://www.heathrow.com/company/local-community/noise/operations/night-flights)
and its documented [06:00–07:00 arrival peak](https://www.heathrow.com/company/local-community/noise/operations/runway-alternation).
05:05–06:00 has quieter arrival-only traffic; 06:00–07:00 is arrival-heavy;
07:00–22:40 is mixed; 22:40–22:55 has quieter arrival-only traffic; overnight
has no automatic scheduled traffic. Ratios (75% arrivals in the morning, 50%
during daytime) and reduced density are gameplay approximations, not measured
hourly traffic or a live flight schedule. Existing airborne traffic continues
and manual Add traffic still overrides spawning. Runway assignments remain
under controller control.

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

Airborne speed changes are limited to 0.6 kt per simulation second. A 240→180 kt
clearance takes 100 simulation seconds (50 playing seconds at 2×). Takeoff-roll
acceleration uses 3 kt per simulation second. These are simplified gameplay rates.


## Landing clearances and readbacks

Landing clearance requires an airborne arrival at or below 3,000 ft, heading
within 60° of the runway direction. Position is not an acceptance condition.
Vector the aircraft to intercept the extended centreline, then issue `L 27L`
(or another runway end). Clearance does not automatically route an aircraft
from any arbitrary position. The strip shows AWAITING INTERCEPT, then FINAL.
A turn-radius allowance helps capture an angled interception; captured traffic
follows an approximate 3° glide path with type-specific final approach speed.
Nearly aligned aircraft can capture within a 0.2 NM centreline corridor; final guidance tracks a point ahead on the centreline instead of chasing the threshold. Touchdown can occur along the usable runway, with position, heading and altitude checks.
If the aircraft never intercepts the approach centreline, it continues on its
interception heading without automatic descent or go-around, including when
clearance was issued after crossing the centreline. A captured approach that reaches the far end of the runway without landing goes around to 3,000 ft.

Commands read back their actual instructions, for example:
`SVA111 C 3 C NIGIT S 180` →
“SVA111: descend and maintain 3,000 ft, head direct to NIGIT, speed 180 kt.”
Climb/descend/maintain depends on the current altitude. Landing feedback reports
clearance, centreline capture, touchdown, or the reason a clearance is rejected.

## Map presentation

The Thames now uses an extracted local subset of [OS Open Rivers](https://www.ordnancesurvey.co.uk/products/os-open-rivers), April 2026, transformed from British National Grid into the same geographic projection as the airport and navigation aids. Contains OS data © Crown copyright and database right 2026, supplied under the [Open Government Licence v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
Urban outlines remain coarse public-domain [Natural Earth](https://www.naturalearthdata.com/) data (`ne_10m_urban_areas.geojson`). These are simplified geographic context, not detailed terrain or an aviation chart. Regional vectors are bundled in `simulator/static/simulator/js/map-data.js`; gameplay requires no map service or GIS library.

The map is fixed at Close (1.4×), with Normal (2×) as the default simulation pace.
The uniform projection is preserved: airport, fixes and aircraft share coordinates;
zoom never changes speeds or separation distances. Place names are omitted.
Aircraft labels show callsign plus altitude in hundreds of feet, climb/descent/level
indicator, and speed in tens of knots; strips retain full values.
Dashed extended centrelines show the 25 NM approach capture range.

Instructions are accessed through Help. Opening it pauses simulation and closing
it (including Escape) restores the previous pause state. UI theme remains selectable
and does not change the map colours.

Heading changes use a simplified coordinated-turn model limited to 25° bank or
3°/s, whichever gives the slower turn, with gradual roll-in and rollout. This uses
one simplified airspeed value and is not a full flight dynamics model. Based on
[FAA Instrument Flying Handbook](https://www.faa.gov/sites/faa.gov/files/pilots/FAA-H-8083-15B.pdf)
and [FAA turn guidance](https://www.faa.gov/air_traffic/publications/aim_html/chap5_section_3.html).


The desktop traffic panel is 200 px wide (190 px on narrower desktop screens),
with compact counters and scrollable strips. Runways are intentionally enlarged
chart symbols for readability; their centres remain geographic, while takeoff,
landing and approach capture continue to use the original runway coordinates.
The unfilled wind compass is drawn in the map's lower-right corner before aircraft
and labels, at low opacity, and never intercepts selection clicks.

## Simulation regression checks

If Node.js is available, run `node tests/simulation.cjs`. This isolated test harness
checks command readbacks, all four runway approaches, near-aligned localizer
capture, touchdown beyond the threshold, missed interceptions, scoring, gradual
turns, pause and speed/clock/traffic behaviour. It does not add a frontend build
step or expose test controls in the game.


Normal aircraft dynamics now run 20% faster, uniformly scaling movement, turns,
altitude and speed changes; indicated speeds and aircraft envelopes are unchanged.
The airport clock advances two minutes per real minute at Normal. Automatic traffic has a 30-second
base interval, with the existing gradual buildup, time-of-day mix and caps.
A narrow separation exception applies only to an established final within 3 NM,
at/below 1,000 ft and within 0.1 NM of its centreline, paired with a ground takeoff
roll on a different parallel runway in the same direction. It stops at liftoff.
Same-runway conflicts, go-arounds, overhead and other airborne aircraft remain
subject to the normal separation checks. This is a gameplay rule, not a complete
real-world parallel runway separation model.


Scheduled traffic appears in dashed preview strips 30 Normal playing seconds
before activation. The same callsign, type and planned arrival altitude or
requested departure fix are retained. Pending traffic is not selectable, is not
counted as active and does not move or trigger separation alerts. Countdown time
pauses with the simulation, scales with selected speed, and resets on restart.
Manual Add traffic remains immediate. Departure trails and radar labels use blue;
arrival targets use white. Selection and conflict highlights retain amber/red.

Two arrivals established on final to different parallel runways in the same
 direction are also exempt from pairwise separation alerts. Both must have
captured the approach, remain within 0.1 NM of their own centreline and within
10 degrees of runway heading, and be inside the approach/runway corridor.
Clearance alone does not qualify. Same-runway, opposite-direction, crossing
traffic and go-arounds retain normal checks. This is a simplified gameplay
exception; real simultaneous approaches have procedure-specific requirements
(FAA AIM, section 5-4).

### Voice command prototype

Hold Q (including when the command input is focused), or hold the Mic button,
to speak. Live transcription is shown in the input. Release to finish recognition
and translate it into an editable command draft. Enter/Go remains the only way
to issue the command; recognition never submits automatically. Escape cancels,
and leaving the window stops listening. Unknown callsigns, fixes or instructions
block submission until manually corrected or recorded again.

Examples: “Speedbird one two three, descend and maintain three thousand, reduce
speed to two five zero, direct Whiskey Oscar Delta” and “Sierra Victor Alpha one
one one, increase speed two five zero, heading zero nine zero”. Callsigns must
match active aircraft; upcoming strips do not qualify. Airline names, NATO
phonetics, spelled letters, digit-by-digit numbers and common number words are
supported. Flight level thirty becomes 3,000 ft; the informal “flight level three
thousand” is accepted as 3,000 ft for this simulator.

Uses browser SpeechRecognition with en-GB and interim results, with no added
backend or API key. Browser support and recognition accuracy vary. Microphone
permission is needed; the browser's recognition service may process audio
remotely. Unsupported browsers retain typed commands and show a voice status.
Run `node tests/voice.cjs` for translator and mocked recognition lifecycle tests.
Actual microphone accuracy must be tested manually in a supported browser.

Voice regression cases include AAL798 spoken as “Alpha Alpha Lima 798”,
comma-formatted 3,000, joined “Lima798”, and the observed NIGIT transcription
“niner indigo golf indigo tango”. Indigo is accepted as I and niner/nine as N
only when the complete identifier matches a known navigation fix. Niner remains
9 in numeric instructions and callsigns. The standard spelling for NIGIT is
“November India Golf India Tango”. These are translator corrections; browser
speech-to-text accuracy still depends on actual microphone testing.
