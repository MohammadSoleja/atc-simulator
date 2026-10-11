# V04 / V06 review

Run `node tests/airlines.cjs`, `node tests/readbacks.cjs` and `node tests/voice.cjs`.

The airline catalogue remains the single source for generated traffic, voice
aliases, spoken radio names and Info. Tests cover every alias against all
Heathrow fixes, phonetic waypoint context, Info rendering and alias collisions.
Finnair's observed “thin air” variant remains callsign-only.

Pilot audio uses browser speech synthesis, without a paid service or Django
API. The existing simulator command handlers supply outcomes; speech does not
infer acceptance from the requested command. If a command applies altitude and
then rejects a speed, the pilot confirms the altitude and reports the rejected
speed. The engine's existing sequential command behaviour is preserved.

Responses queue in submission order. Mute cancels pending/current replies.
Volume and mute persist locally when storage works. Push-to-talk drops pending
and current replies before recognition starts; they are not replayed afterward.
Restart clears audio. Unknown aircraft never produce an invented pilot reply.
Untranslated speech addressed to a recognisable active aircraft produces
“say again” only on Enter/Go; it remains blocked from simulation execution.

Speech defaults to 1.2× the browser's normal speaking rate. Settings offers
0.9–1.6× and an English voice selector. Automatic selection prefers an available
enhanced/natural voice, then the browser default. Voice quality depends on
voices installed or exposed by the browser; this does not add a neural service.
Selections are remembered locally, with a fallback when a voice is unavailable.

Optional pilot calls include airport-clock morning/afternoon/evening greetings
on arrival entry and departure readiness, a report/request when reaching an
assigned fix, and farewell on successful departure handoff. Selected airline
callsigns occasionally use “marhaba”. These are simplified game flavour, not
required real aviation phraseology. Each state transition reports once; a
completed handoff suppresses a duplicate fix report. Optional calls have at
most three waiting audio slots. They appear as text even when muted and can
be disabled separately in Settings. Gameplay/scoring is unchanged.

## Playtest

1. Submit a chained altitude/speed/heading command to an active aircraft. Check
   the spoken callsign, digits and instructions against the text and strip.
2. Submit commands to two aircraft quickly. Check pilots speak one at a time.
3. Try a high-altitude landing clearance. Check the reply explains rejection.
   Try an unknown callsign: only system text should respond.
4. Record valid speech and release Q. Check there is no reply until Enter/Go.
   Record an invalid instruction with a known callsign: Enter should produce
   “say again” and keep the failed translation blocked.
5. Hold Q during a reply. Check audio stops immediately and does not resume
   after recording. Try mute, volume and restart from Settings/controls.
6. Check Info aliases including Finnair, American and phonetic callsigns.
7. Try available voices and speaking pace. Check entry greetings, a direct-to
   fix report/request and a farewell at handoff. Disable pilot calls and confirm
   command readbacks remain active.

Automated checks verify command integration and mocked synthesis/recognition.
Actual browser pronunciation, sound output and microphone feedback require
product-owner testing before these tickets move from Review to Done.

## Controller greetings
Hold Q to say “good morning”, “good afternoon”, “good evening”, “hello”,
“hi”, “marhaba”, “thank you”, “thanks”, or “goodbye”. These can precede the
callsign, follow a complete active callsign, or end the transmission.
Commands still require Enter. Greeting-only speech is acknowledged on Enter
without sending an instruction to the simulator or asking the pilot to repeat.
Unknown callsigns and invalid instructions remain errors. Conversation inside
an instruction value is not discarded.
