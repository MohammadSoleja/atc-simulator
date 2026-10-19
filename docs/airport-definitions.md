# Airport definitions (M01/M02)

`simulator/airports/egll.json` is the single source for Heathrow-specific data.
Django loads only IDs listed in `MAP_FILES` in `simulator/airports.py`. The
welcome selector, simulator header/help, save validation and saved-airport
labels all use that registry. Unknown identifiers return 404; a broken local
configuration returns a useful map-unavailable page instead of a partial game.
No external map API, new frontend framework or database table is introduced.

## Definition format, version 1

- `id`, `code`, `name`, `short_name`: identity and presentation labels.
- `sector`: width/height in nautical miles and latitude/longitude of the centre.
- `display`: Canvas map coordinates, zoom and approach-capture range in NM.
  Display and sector aspect ratios must agree to avoid distorting distances.
- `wind`: static heading and speed for the initial game, not live weather.
- `runways`: each physical runway has two `ends`, corresponding `headings`, and
  geographic `start`/`end` coordinates. Heading index 0 runs from start to end;
  index 1 runs from end to start. IDs must be reciprocal, including L/R swaps.
  Simulation headings are explicit; runway number/heading tolerance is checked.
- `fixes`: ID, navigation type, coordinate, and radar label offset. Supported
  types are RNAV, VOR/DME, DME and NDB. Coordinates use AIP-style DMS strings:
  latitude `DDMMSS.ssN/S`, longitude `DDDMMSS.ssE/W`.
- `departure_fixes`: explicit subset of the fixes eligible for successful exit.
- `traffic`: session start, spawn/notice intervals, buildup, optional staggered waves, arrival
  altitude/speed ranges and full-day density/arrival-share intervals. Intervals
  end exclusively at `until_minute`, increasing through minute 1440. Arrival
  altitude ranges retain the existing engine's hundreds-of-feet unit.
  Optional `arrival_interval_seconds` enables an independent arrival stream;
  departures retain their time-of-day rate. Both airports currently use 60 seconds throughout.
  Stream reservations are stored in optional version-1 `trafficSchedule` fields;
  older saves initialise these from their existing pending flights.
- `background`: bundled asset path, attribution and dataset/licence links.
- `aeronautical_sources`: references for independently transcribed facts.

`airport.js` validates the browser definition and projects it into simulation
positions. `game.js` retains generic movement, commands, approaches, separation,
scoring and rendering. Geographic backgrounds are loaded locally from the
selected definition's validated asset path. A missing/broken browser definition
or background stops initialization with a useful message.

Heathrow values were extracted without tuning the game: 100 × 70 NM sector,
1.4 zoom, 25 NM capture range, existing thresholds/fix order, traffic ratios,
speed settings. Traffic is uncapped, with optional waves temporarily disabled on both maps. Tests retain the exact version-1 save fixture,
existing arrivals/departures, and same-runway conflict protections.

## Selection, restart and saved games

`/play/?map=egll` passes a safely serialized definition via Django `json_script`.
Restart resets state within that same loaded map. Spoken/typed instructions use
the loaded fix/runway collections. Saves keep their existing version 1 and
airport identifier; only the airport's own IDs are valid when saving/loading.
A save from another airport cannot be restored into the current engine.
Existing Heathrow saves remain compatible.

## Adding a future playable map

1. Approve airport and scope (M03), then create a definition with independently
   verified geometry (M04), navigation/background (M05), and traffic (M06).
2. Keep it outside the selectable registry until product-owner playtesting.
3. Record dataset licences and bundle only original/appropriately licensed assets.
4. Recheck phase/altitude semantics for elevated airports before activating them.
   Existing Heathrow simulation uses zero as its simplified ground datum; this
   change intentionally preserves that behaviour.
5. Add the approved map to `MAP_FILES`. No URL-driven filesystem paths are used.
6. Verify selection, all runway directions, navigation, restart and save/load.

`tests/fixtures/test-airport.json` is synthetic test data only. It demonstrates
north/south runways and different fixes/traffic; it is never a selectable map
and does not represent Riyadh.

Checks: `python manage.py test simulator`, `node tests/airports.cjs`, all existing
engine/traffic/voice/save suites. M03's approved second-map scope is recorded in
[riyadh-scope.md](riyadh-scope.md).

## Elevated airports and preview release

Optional `elevation_ft` supplies the airport MSL datum (default zero for old
Heathrow saves). Each physical runway may supply two `threshold_elevations_ft`
values, corresponding to its ends. Departure ground position, approach glide
path and touchdown use the selected threshold; runway separation exceptions
use height above that local datum. Go-around and handoff levels are the airport
datum plus 3,000 / 4,000 ft, rounded up to the next thousand. Typed and spoken
altitudes remain MSL feet. `background.style: desert` changes the original map
palette independently of light/dark interface themes.

`preview: true` gates an unapproved airport to local DEBUG builds, with a
Playtest label in the selector. Production rejects direct access as well as
hiding the option. Riyadh uses this gate pending the M06 owner playtest.

Optional `display.view_width_nm` / `view_height_nm` set the camera's viewing
reference independently of the sector size. These default to sector dimensions.
Riyadh uses Heathrow's 100 × 70 NM reference and 1.4 zoom, preserving its own
100 × 100 NM simulation bounds while matching the displayed scale.

A fix may specify `position_offset_nm: {"east": 0, "north": -6}` for an
explicit gameplay adjustment (bounded to ±20 NM per axis). Published coordinates
remain recorded. The adjustment applies to the marker and navigation target
together, including restored direct-to references. Riyadh currently applies this
to MEPTU, LOTER, REXOV, RK734, RK538 and RK532, with changes recorded in its attribution and playtest notes.

`traffic.waves.enabled: false` retains wave tuning without generating new waves.
Already queued previews remain intact when loading an existing save.

Wave `arrivals` / `departures` configure exact counts (defaults 2 / 1); no random
variation is applied to wave size. Both maps currently disable these waves while retaining their counts.
