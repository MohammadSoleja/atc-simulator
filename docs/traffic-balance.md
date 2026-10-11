# G04 — Traffic balance across a simulated day

Run `node tests/traffic.cjs`. No frontend build or new dependency is required.

## Current rules

Normal (2×) is the default and restart restores it. Airport time starts at
06:00 and advances two airport minutes per real minute at Normal. Pause,
Help and Info freeze the clock, aircraft and traffic timers.

| Airport time | Density | Intended arrival share |
| --- | --- | --- |
| 00:00–05:05 | No scheduled traffic | — |
| 05:05–06:00 | 60% | 100% |
| 06:00–07:00 | Normal | 75% |
| 07:00–22:40 | Normal | 50% |
| 22:40–22:55 | 40% | 100% |
| 22:55–24:00 | No scheduled traffic | — |

The boundaries follow Heathrow's [night operations information](https://www.heathrow.com/company/local-community/noise/operations/night-flights),
with the morning emphasis informed by [runway alternation information](https://www.heathrow.com/company/local-community/noise/operations/runway-alternation).
Density and shares are gameplay approximations, not measured hourly demand.
Each offered aircraft's kind is randomly drawn; short sessions can vary.

A new session has one arrival and no departures or previews. The base traffic
interval gradually decreases from 60 to 30 Normal playing seconds over the
first five Normal playing minutes. Because the interval is recalculated as
buildup progresses, the first new aircraft appears roughly one minute into play.
Lower density lengthens the interval. Once fully built up, normal daytime
traffic offers one flight every 30 Normal playing seconds if capacity permits.

Only one upcoming flight is reserved at a time. Its notice lasts 30 Normal
playing seconds, preserves its callsign/type and arrival altitude or departure
fix, and uses the time of activation to choose the traffic band. Previews
do not count as active aircraft or enter separation checks.

| Selected pace | Real seconds for a 30-second notice | Real minutes for buildup | Airport minutes per real minute |
| --- | --- | --- | --- |
| 1× | 60 | 10 | 1 |
| Normal (2×) | 30 | 5 | 2 |
| 4× | 15 | 2.5 | 4 |
| 8× | 7.5 | 1.25 | 8 |

Changing pace retains progress rather than restarting the countdown. The
countdown displays remaining Normal playing seconds. Aircraft dynamics have
the existing 20% adjustment, while the clock and scheduler do not.

Automatic traffic stops offering arrivals when five are active and departures
when two are waiting for takeoff. An unavailable kind is skipped for that
interval, rather than replaced with the other kind. Airborne departures do
not occupy waiting slots. Manual Add traffic remains an override; a previously
reserved preview still activates even if manual additions fill its slots.
Night periods prevent new scheduled traffic; existing flights continue.

## Automated review result

The repeatable full-day run recorded the following offered traffic:

| Airport time | Arrivals | Departures |
| --- | --- | --- |
| 00:00–05:05 | 0 | 0 |
| 05:05–06:00 | 33 | 0 |
| 06:00–07:00 | 50 | 10 |
| 07:00–22:40 | 449 | 491 |
| 22:40–22:55 | 6 | 0 |
| 22:55–24:00 | 0 | 0 |

The seeded run removes aircraft after recording activation to measure offered
demand independently of controller throughput and caps. It starts at midnight
with buildup already complete, and does not count the usual initial arrival.
These counts are test results, not expected totals for a real play session.

Additional scenarios check exact schedule boundaries and preview crossings,
gentle startup, mature intervals, both preview types, preservation of attributes,
single activation, countdown rendering, pause, Help/Info, pace switching, restart,
clock wrap, and capacity with no controller intervention. Both traffic kinds
continue when only the opposite kind is at capacity.

The review found a floating-point countdown rounding issue: an exact remaining
second could be displayed one second too high. This is corrected. Traffic shares,
density, caps, buildup and aircraft dynamics remain as before this ticket.

## Product-owner playtest

1. Start at Normal. Check the single initial arrival, the first 30-second notice
   and gentle buildup during the first five playing minutes.
2. Play through 07:00 (30 real minutes from the 06:00 start at Normal). Check
   that the arrival-heavy opening gives way to a workable mixed flow. Departures
   are intentionally less frequent before 07:00.
3. Change pace during a preview. Check that its callsign stays the same, the
   countdown speeds up/slows down, and the aircraft activates once.
4. Pause and open Help/Info with a notice pending. Check that timers freeze
   and return to their previous pause state afterward.
5. Judge whether workload remains manageable while actively landing arrivals
   and clearing departures. Record the airport time, pace and active counts
   if traffic feels too heavy or too quiet.

G04 is ready for Review after automated checks. Move it to Done after the
product owner approves the resulting difficulty. Balance changes should follow
that feedback rather than silently changing the default difficulty.
