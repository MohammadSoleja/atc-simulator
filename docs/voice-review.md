# V01 and V02 — Voice regression and recognition feedback

Run `node tests/voice.cjs`.

`tests/voice-transcripts.json` holds reported playtest transcripts and adjacent
supported forms, grouped by callsign, numbers, altitude, heading, fix, runway
and clearance. Add new reports with their expected typed command. Explicit
rejections and recognition lifecycle/ambiguity tests live in `tests/voice.cjs`.

The suite covers 46 accepted transcripts, clause-specific rejection examples,
all existing airline aliases, duplicate and conflicting alternatives, partial
translation failure, listening/submission gating, manual editing, cancellation,
microphone errors and unsupported browsers. These test translation of text and
mocked recognition events; they do not measure speech-to-text accuracy.

## Feedback behaviour

- Hold Q/Mic to record. The command box shows live browser transcription.
- Release to create a draft. Enter/Go is still required to submit it.
- Live recognition stays inline. No details panel expands or resizes the map.
- Translation failures identify the clause and block submission. A new recording
  clears the latest feedback. Download voice log retains completed attempts.
- Unknown aircraft and conflicting valid alternatives remain blocked. A failed
  later clause never supplies the earlier portion as a command draft.
- Editing the command box updates the draft and permits ordinary
  typed submission. Original transcript/error evidence remains in the downloadable log.
  The simulator validates the submitted command and reports acceptance/rejection.
- Cancel/no speech restores the previous input. Microphone errors retain their
  diagnostic and restore the previous input without issuing a command.

## Product-owner playtest

1. Use an active aircraft's callsign with altitude, speed and heading/direct
   instructions. Review the transcript and translated command before pressing Enter.
2. Try airline names and phonetic callsigns, then a phonetic waypoint.
3. Try an unknown fix or invalid heading. Confirm the affected clause is
   identified, the map stays the same size and Enter does not issue the failed translation.
4. Correct the text into a typed command. Confirm its displayed draft updates
   and Enter submits normally. Try recording again to clear old evidence.
5. Check Q release, Escape cancellation and readability in your chosen theme.
   Report the exact Heard text and intended command for recognition failures.

Both tickets are ready for Review after checks; microphone/playtest approval
remains before Done. No recognition provider, automatic submission or paid
service has been introduced.

## Diagnostic log

Settings includes Download voice log. The JSON export contains the last
100 completed attempts: transcript, supplied alternatives, translated command,
matched alternative, error, UTC timestamp and the active callsign/fix/runway
vocabulary. It records translation outcomes, not clearance acceptance or audio.
The buffer is held in the current tab's memory and clears on reload. Nothing is
automatically uploaded or saved on the Django server. Share an export with the
intended phrase to turn reported failures into regression cases.
