# Riyadh playtest (M04–M06)

Implementation is ready for owner playtesting. M06 approval is still pending.
In a local DEBUG build, choose **Riyadh King Khalid (OERK) — Playtest** on the
welcome page, or open `/play/?map=oerk`. Production (`DEBUG=False`) continues to
hide/reject this preview. Remove `preview: true` from `oerk.json` only after the
owner approves the map; no second implementation or save migration is needed.

## Airport and controls

The sector is 100 × 100 NM, north up, centred at N245746 E0464229.
The default camera uses Heathrow’s 100 × 70 NM viewing reference and 1.4 zoom,
so aircraft, trails and distances have the same apparent scale. The closer view
can crop distant fixes; their coordinates and direct-to commands stay unchanged.
Runways are 15L/33R and 15R/33L, with independently positioned thresholds and
published threshold elevations. Both directions are available. Heading geometry
uses geographic bearings 150°/330°, matching the north-up engine; this initial
simulator does not model the 3° magnetic variation or altimeter settings.

Altitudes are feet above mean sea level. Airport elevation is 2,053 ft.

- Use `CALLSIGN C 5 S 180` to descend an arrival to 5,000 ft.
- Vector it to intercept an extended runway centreline, then `CALLSIGN L 33L`
  (or any other end). Clearance requires heading within ±60° and height within
  3,000 ft above that threshold. An established approach descends to the
  selected threshold's elevation, rather than sea level.
- Use `CALLSIGN C 7 R 33R T` for departure, then `CALLSIGN C LOTER` if LOTER is
  its requested fix. Successful handoff requires the requested fix and 7,000 ft.
- A go-around targets at least 6,000 ft. Altitude commands below the airport
  elevation are rejected. Ground roll and low parallel-runway exceptions use
  local runway height; ordinary airborne separation stays 3 NM / 1,000 ft.

The 16 points are KSA (DVOR/DME), LOTER, NOSGI, REXOV, MEPTU, SISIR, RK734,
RK507, ORLUD, RK538, RK532, KIRUL, RK762, RK783, RK579 and RK565. All are within the approved sector.
MEPTU has an explicit 6 NM southward gameplay offset to keep its symbol and
label inside the closer default view. Its published coordinates remain recorded;
both its marker and direct-to target use the adjusted position. The four added
RK points use their published positions.
They are direct-to/vectoring destinations, not implemented SID/STAR procedures.
Each point records its source URL in the airport definition. KSA is deliberately
excluded from departure handoff destinations, since it is beside the airport.

The default desktop view now contains every selectable fix and departure target.
LOTER, REXOV, RK734, RK538 and RK532 also have explicit gameplay offsets (all
within 20 NM per axis), recorded alongside their published coordinates. No
existing fix identifiers were removed, preserving saved navigation references.

Tested game vectors, starting level at 5,000 ft and 180 kt:

- For 15L/15R: direct RK734, turn heading 120°, then clear to land once turned.
- For 33L/33R: direct RK538, turn heading 300°, then clear to land once turned.

These staging fixes give room to intercept the extended centreline and descend.
They are game vectors, not SID/STAR implementations or real-world instructions.

Traffic starts at 08:00 with one arrival, builds for five Normal playing minutes,
then offers arrivals every 45 Normal seconds and departures about every 60.
Both streams have 30-second advance notices, pause/resume and speed scaling. This is a
balanced, all-day gameplay mix, not a claim about actual Riyadh airline banks.
Waves are temporarily disabled on both maps. Retained settings are two arrivals
and one departure, staggered 20 seconds apart, for later retuning.
Heathrow also uses 45-second regular arrivals; its zero-ground model remains intact.

## Source verification and asset provenance

Checked on 18 October 2026 against the public SANS publication index:
<https://aimss.sans.com.sa/assets/FileManagerFiles/92c82534-1489-4e04-902e-3904fb66441e.html>

The effective edition is **AIRAC AIP AMDT 10/26, 1 October 2026**. The next
published cycle, 29 October, was not used. October pages use `en-US` URLs; the
older August baseline used `en-GB`.

- OERK AD 2.2 / 2.12 / 2.19: ARP, airport/threshold elevations, runway positions,
  true bearings and KSA aid coordinates.
- ENR 4.4: LOTER and NOSGI.
- AD 2 OERK-93: north-side waypoint coordinates (RNAV 15L/15R table 4).
- AD 2 OERK-105: south-side waypoint coordinates (RNAV 33L/33R table 4).
- The history index's Riyadh UVR expansion (SUP 36/26) and remote apron layout
  (SUP 37/26) concern features outside this phase. No UVR, apron, taxi or live
  NOTAM simulation is claimed.

Full document URLs are in `simulator/airports/oerk.json`. Facts were transcribed
into our original data definition and renderer; no chart image, source PDF,
website code or proprietary graphics are shipped.

The background uses **Natural Earth v5.1.2, 1:10m urban areas**, public domain:
<https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_urban_areas.geojson>

Three regional urban polygons are bundled, rounded to five decimal places with
consecutive duplicates removed. The asset records the source SHA-256. Regenerate
with `python scripts/build_riyadh_background.py /path/to/ne_10m_urban_areas.geojson`.
The plain desert colour is original styling; no invented river, terrain or wadi
geometry is added. This is coarse geographic context, not a current city map.

## Verification and owner checklist

Automated checks: `node tests/riyadh.cjs` and
`python manage.py test simulator.test_riyadh`, plus existing Heathrow regression
suites. Scenarios cover all runway ends, angled/aligned captures, threshold
heights, go-arounds, takeoff origins, climb and completed handoffs, separation,
direct-to/voice vocabulary, restart, background presence and map-specific saves.

Owner playtest still required:

- [ ] Runway scale, labels, fix spacing and background feel readable.
- [ ] Sequence arrivals and land on each physical strip.
- [ ] Depart from both strips; follow requested fixes through successful handoff.
- [ ] Try both 150° and 330° operation directions.
- [ ] Confirm initial traffic buildup feels manageable.
- [ ] Save, reload and resume a Riyadh game; also reopen a Heathrow checkpoint.
- [ ] Approve M06 and enable Riyadh for the normal production selector.
