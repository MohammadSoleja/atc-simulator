# Game saves, version 1 (S01–S06)

## Snapshot

The root object contains only:

- `version`: integer 1. Unsupported versions are rejected, never silently migrated.
- `airport`: `egll`; only implemented airports can load.
- `session_id`: UUID identifying the game independently of the save row or player.
  Restart creates a new UUID. Loading preserves it for future statistics work.
- `pace`: 1, 2, 4 or 8.
- `state`: simulation fields below.

`state` includes `aircraft`, `upcoming`, `conflicts`, `nextId`, `elapsed`,
`clockElapsed`, `trafficElapsed`, `lastSpawn`, `score`, `landings`, `handoffs`,
`violations`, and `missed`. Time units match the engine: elapsed is gameplay
seconds; clockElapsed is airport-clock seconds; trafficElapsed/lastSpawn/dueAt
are traffic seconds. `removeAt` and trail timestamps use elapsed seconds.

Each aircraft includes its ID, callsign, type, kind, position, current and target
heading/altitude/speed, vertical speed, phase, landed flag, trail, landing runway,
and navigation target. Optional fields are departure runway/exit fix, bank,
approachCaptured and removeAt. Navigation targets serialize as fix IDs and are
resolved back to airport references on load. Runways serialize as runway IDs.
Captured approaches, go-arounds, takeoffs, waiting departures and completed
landings awaiting cleanup therefore retain their progress.

Pending traffic keeps its callsign, kind, type, dueAt and arrival parameters or
departure exit fix. Aircraft not yet scheduled remain random after resuming;
version 1 does not promise deterministic future random traffic.

Conflicts serialize as sorted `id-id` strings so an existing violation episode
is not counted again when resumed. References to aircraft already cleaned up
are omitted. No account totals are updated by these tickets.

## Validation

The server checks exact field names, required fields, finite numbers, supported
IDs/types/airport/pace, unique callsigns and IDs, nextId ordering, phase/runway
relationships and valid conflict references. Maximums: 1 MiB request, 100 active
aircraft, one pending flight, eight trail points per aircraft, 1–80 characters
for a trimmed save name. Positions must be between -2 and 3 in normalized sector
coordinates, headings 0–360, altitudes 0–100,000 ft, speeds 0–350 kt; timers and
counters are bounded at 1 billion, with signed score. Values outside this save
envelope produce a useful error without modifying the running game or stored
autosave. Browser validation constructs a replacement state before assigning it.

## Presentation and lifecycle

Themes, voice settings, command drafts, selected aircraft, Canvas geometry,
dialogs and audio queues are not simulation data and are not saved. Aircraft
trails are saved as radar history. Loading always starts paused, clears selection
and stale radio audio, and preserves pace. Starting a new game creates fresh state.

Saves use the authenticated account's permanent user ID, not username/display
name. All reads and edits require ownership. Mutations are CSRF-protected.
Manual saves create new named rows; saving never replaces an existing manual
save. Renaming changes only the name, not the saved timestamp or game state.
Delete first opens a confirmation page; GET and Cancel do not delete.

Autosave updates exactly one separate slot per player every 60 seconds of active
frame time, independent of selected pace. Pause/dialog time, loading and pending
network requests are excluded. It does not create an entry on every interval.
Manual saves remain separate. Autosave failure is shown in Settings, retries on
the next interval, and does not pause the game. Autosave can be deleted and is
recreated on the next interval. Only named manual saves can be renamed.

Loading failures keep the initial session paused and prevent autosave from
overwriting the saved game until the player deliberately chooses Restart.
Network requests time out after 15 seconds. Page unload is not a guaranteed save;
use Save game before leaving. Future S06 enhancements may add preferences or
multiple autosave slots; version 1 intentionally keeps one slot.

## Endpoints and pages

- `POST /saves/create/`: JSON `{name, autosave, snapshot}`; returns save metadata.
- `GET /saves/<id>/snapshot/`: validates and returns the owner's snapshot.
- `/saves/`: saved-games list, including empty state and Continue links.
- `/saves/<id>/rename/`: form with POST submission.
- `/saves/<id>/delete/`: confirmation with POST deletion.
- `/play/?map=egll&save=<id>`: owner-checked page; fetches then restores paused.

Errors never disclose another owner's save. Guests can play but cannot save.

## Playtest

1. Sign in, issue several commands, create a departure and wait for a traffic preview.
2. Save a named checkpoint. Check the saved-games list and Continue it.
3. Verify clock, score, aircraft and targets; it must load paused.
4. Resume, then wait 60 seconds of active play. Settings shows autosave status.
5. Verify another interval updates one autosave row and preserves the manual row.
6. Rename the manual row, cancel a deletion, then explicitly confirm deletion.
7. Disconnect networking: manual failure stays in its dialog and the game resumes
   on Cancel; autosave failure does not interrupt motion.
8. A different account must not see or load the first account's saves.

Automated checks: `node tests/saves.cjs`, `node tests/saves-ui.cjs`, and
`python manage.py test simulator`. The compatibility fixture is produced by the
real engine and validated by Django tests. All prior engine suites still apply.
