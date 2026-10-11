# Core gameplay reliability — G01, G02 and G03

These describe the current simplified simulator, rather than real-world ATC
procedures. This ticket group preserves the existing gameplay thresholds.

## Run the checks

```bash
node tests/core.cjs
node tests/simulation.cjs
node tests/voice.cjs
python manage.py test simulator
python manage.py check
```

The focused suite can also be run one ticket at a time:

- G01: `node tests/core/landing.cjs`
- G02: `node tests/core/separation.cjs`
- G03: `node tests/core/departure.cjs`

All engine suites share `tests/harness.cjs`. It loads the actual game code in an
isolated VM, uses reproducible random values and adds test-only access without
exposing controls in the browser. Focused scenarios suppress new traffic and
advance movement in the same 0.05-second steps used during play.

## G01 — Landing

- Runway 09L/09R approaches use heading 090; 27L/27R use 270.
- Landing clearance requires an airborne arrival at or below 3,000 ft and a
  current heading within 60 degrees of the runway direction, inclusive.
- Invalid runway, altitude or heading produces a specific rejection message.
- Clearance holds the current interception heading. It does not automatically
  vector the aircraft from any position onto final.
- Capture requires an intersecting approach ahead of the threshold within the
  25 NM approach range. A near-aligned aircraft can capture within 0.2 NM.
- Once captured, the aircraft follows the runway centreline and descends on
  the approximate glide path; it never climbs merely to join that path.
- Touchdown requires capture, alignment, proximity to the runway centreline,
  altitude below 100 ft and position in the usable touchdown area. It awards
  100 points and one landing, once, then removes the target after 2.5 seconds.
- A captured aircraft that passes the usable runway without touching down
  cancels its clearance and goes around to 3,000 ft on runway heading.
- Manual `G` cancels approach/navigation, sets a target of at least 3,000 ft and
  190 kt, and turns 30 degrees from the current heading. It applies only to an
  airborne arrival; it cannot launch a departure or reactivate a landed target.

Coverage: aligned and angled approaches from both sides of every runway end;
heading/altitude acceptance boundaries; specific rejections; parallel paths,
late interception and clearance behind the threshold; automatic/manual
missed approaches; removal and single scoring.

## G02 — Separation

A conflict requires **both** horizontal distance below 3 NM and vertical
separation below 1,000 ft. Exactly 3 NM or exactly 1,000 ft meets the target.
Waiting departures, landed targets and targets already marked for removal are
not active separation participants.

Each conflicting pair costs 10 points and increments violations once on entry.
Remaining in the same conflict does not repeat the penalty. Resolving a pair
clears its alert; entering a new conflict later counts again. All active aircraft
pairs are still evaluated even when another pair has a runway exception.

### Established parallel finals

Two arrivals can be exempt only on different physical parallel runways in the
same direction. Each must be airborne, captured and cleared, within 0.1 NM of
its own centreline and within 10 degrees of runway heading (both strict limits).
Each must be inside the approach/usable-runway corridor. Same-runway, opposing,
uncaptured, crossing and go-around traffic do not qualify.

### Parallel arrival and departure

An arrival established on final can be exempt with a takeoff or low initial
climb on the other physical parallel runway in the same direction:

- Arrival: at/below 1,000 ft, zero to 3 NM before its threshold, within 0.1 NM
  cross-track and within 10 degrees of runway heading.
- Departure: at/below 1,000 ft, within 0.1 NM cross-track and within 10 degrees
  of runway heading, on its runway corridor or up to 3 NM beyond its runway end.

Moving outside those conditions restores normal pairwise checks. These are
narrow gameplay exceptions, not a general airport-area exclusion.

Coverage: standard lateral/vertical boundaries; single/re-entered penalties;
alert clearing; target removal; parallel arrival/departure cases on both strips
and directions, independent of pair order; same-runway, crossing, turning,
altitude and go-around exclusions; a third aircraft near parallel finals.

## G03 — Departures and handoff

- A waiting departure needs a target altitude of at least 1,000 ft and a runway
  assignment before `T`. Example: `CALLSIGN C 5 R 27L T`.
- Runway assignment positions the aircraft at that runway's threshold and
  heading. A runway cannot be reassigned once takeoff has begun.
- The ground roll accelerates at 3 kt per simulation second and follows its
  assigned runway. Liftoff happens above the aircraft profile's minimum speed.
- Airborne speed changes, turn rate and climb rate retain their existing limits.
- Route the aircraft toward its requested `FIX`, shown on the strip, using
  `C FIX` or `D FIX`. An aircraft cannot earn handoff credit at another fix.
- Successful handoff requires an airborne departure at/above 4,000 ft within
  1.3 NM of its requested fix. It awards 80 points and one handoff, once, and
  marks the target inactive immediately. Assigning only 1,000–3,000 ft is enough
  for takeoff but not enough for handoff.
- Leaving the outer sector boundary without satisfying handoff conditions
  removes the departure without awarding a successful handoff or points.

Coverage: missing altitude/runway and invalid runway; misuse of go-around;
all six aircraft types on all four runway ends; ground alignment, liftoff,
repeat takeoff and airborne runway reassignment; complete commanded routing
and handoff in both directions; altitude/proximity boundaries, wrong fixes and
uncontrolled sector exit; single scoring and cleanup.

## Product-owner playtest

1. Start a new Heathrow session at Normal. Check that high-altitude or badly
   headed arrivals explain why a landing clearance is rejected.
2. Vector an arrival onto final, clear landing and confirm one landing/100 points.
   Repeat on the other strip, and test a go-around before touchdown.
3. Run an established arrival and low, aligned departure on separate parallel
   runways. They should not create a pairwise alert; turning/crossing aircraft
   should still be monitored.
4. Try `T` without altitude/runway, then `G` on a waiting departure. Both must
   reject without launching it. Give `C 5 R 27L T`, then direct it to its requested
   fix after liftoff. Confirm one handoff/80 points and target removal.
5. Repeat with 09-direction operations when convenient. Their geometry and
   clearance behaviour should match the tested 27-direction cases.

Automated checks pass before delivery; these tickets still need product-owner
playtest approval before being closed.
