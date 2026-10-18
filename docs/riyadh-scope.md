# Riyadh map scope (M03)

Status: airport and initial scope approved by the product owner in chat on
16 October 2026. M04–M06 now provide a local playable preview; owner approval is pending.
See [riyadh-playtest.md](riyadh-playtest.md) for current sources, controls,
verification and the remaining acceptance checklist.

## Approved initial scope

- Airport: Riyadh King Khalid International, RUH / OERK.
- Both existing runway pairs: 15L/33R and 15R/33L, with both directions available.
- A north-up 100 × 100 NM sector centred on the airport reference point.
- Existing mechanics: vectors, altitude, speed, direct-to fixes, landing,
  go-around, departures, parallel-runway handling and successful fix handoff.
- Gradual traffic buildup and a manageable mix, tuned and approved in M06.
- Original, restrained geographic rendering. No invented Heathrow-like river.

No taxiing, gates, procedure following, airspace restrictions, terrain avoidance,
emergencies or new avionics systems are required. RNAV fixes may serve as
vectoring destinations without implementing SID/STAR procedures.

## Geographic baseline and usable sources

The following August material records the M03 research baseline. Implementation
was rechecked against AIRAC 10/26, effective 1 October 2026; source URLs and
verification are recorded in the playtest document and airport definition.

[OERK AD 2](https://aimss.sans.com.sa/assets/FileManagerFiles/AIRAC%20AIP%20AMDT%2008_26_2026_08_06/eAIP/AD%202%20OERK%20RIYADH%20-%20KING%20KHALED%20INTERNATIONAL-en-GB.html)
gives the reference point N245746 E0464229 and elevation 2,053 ft. AD 2.12 lists
the two 4,205 m runways and bearings 150°/330°. Baseline threshold positions:

| End | Latitude | Longitude |
| --- | --- | --- |
| 15L | 245836.69N | 0464207.25E |
| 33R | 245638.30N | 0464322.12E |
| 15R | 245815.40N | 0464029.60E |
| 33L | 245616.99N | 0464144.51E |

These facts support a rotated parallel-runway layout in the current engine.
M04 must handle airport/threshold elevation correctly: the current simplified
Heathrow ground is zero. Landing capture, glide path, touchdown, takeoff and
low-level runway exceptions must use height above the relevant ground datum
rather than incorrectly taking Riyadh aircraft down to sea level. Preserve the
existing command meaning of altitude in feet; no altimeter-setting UI is needed.

Navigation sources:

- [Saudi ENR 4.1](https://aimss.sans.com.sa/assets/FileManagerFiles/AIRAC%20AIP%20AMDT%2008_26_2026_08_06/eAIP/ENR%204.1-en-GB.html): published navaid positions/types; includes Riyadh KSA DVOR/DME.
- [Saudi ENR 4.4](https://aimss.sans.com.sa/assets/FileManagerFiles/AIRAC%20AIP%20AMDT%2008_26_2026_08_06/eAIP/ENR%204.4-en-GB.html): named significant-point coordinates.
- OERK AD 2.19/2.24: local aid data and approach-chart references, for cross-checking geometry/fix locations.

M05 should select a small useful set of verified points in the approved bounds,
record each source/cycle, and keep central labels readable. Do not reuse old
KIA labels without rechecking: [the February 2026 amendment](https://aimss.sans.com.sa/assets/FileManagerFiles/AIRAC%20AIP%20AMDT%2002_26_2026_02_19/Cover%20Page-en-GB.html)
records deletion of OERK KIA TACAN and KSA VOR coverage changes.

## Background data and licensing

Use bundled Natural Earth urban-area/context vectors plus original Canvas land
styling. Natural Earth's [terms](https://www.naturalearthdata.com/about/terms-of-use/)
place its map datasets in the public domain and allow modification and reuse.
Record the downloaded dataset/version in the final definition. Regional detail
may be coarse; do not invent geographic features to fill gaps.

SANS eAIP is a source of aeronautical facts, not an assumed open licence for its
charts or website assets. No chart image, proprietary artwork, tiles, code or
bulk dataset is copied into this branch. Use independently written definitions
and our own rendering. Any additional data source must have its own licence
record before bundling; no paid map service is required by this scope.

## Follow-on acceptance

M04 verifies reciprocal labels, all four threshold origins, angled interception,
and ground-elevation handling. M05 verifies fixes/background and attribution.
M06 verifies gradual traffic, landings and handoffs, then obtains the owner's
playtest approval before adding `oerk` to the selectable registry. Existing
Heathrow controls, play feel, guest access and saves must remain intact.
