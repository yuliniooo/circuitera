# Circuitera examples password update

Opening a bundled example through the toolbar, sidebar, library example, project starter, challenge or public example link now requires the exact lowercase password `trading`. Unlock lasts only for the current IDE mount; reload or leaving and returning relocks example opening. Successful opening creates a new sketch. Incorrect passwords and cancellation preserve current source and saved sketches.

This is a local classroom UI prompt, not secure access control. Example source and the password are bundled in the static application. Previously saved sketches, the existing first-run Blink starter, import/export, compiler and optional hardware self-test remain accessible. No accounts, server, network password checks or persisted unlock were added.

## Validation (2026-09-13)

- Production static build: PASS.
- 52 existing unit/protocol/storage/autocomplete/worker tests: PASS.
- Real React/CodeMirror DOM route tests: PASS, including password entry, link gating, refresh relock, preserved IndexedDB data and cancellation.
- UI regressions with actual WASM worker: PASS; wrong password, uppercase/space variants and empty input rejected; exact password creates only the requested new sketch.
- Real WASM compile/link and Intel HEX parsing: Blink 1064 bytes; Button 954 bytes; Servo 2520 bytes; Ultrasonic 4550 bytes. All PASS. Source changes produce different firmware; error-line and selective library-loading tests PASS.
- Uno and both Nano bootloader UI/protocol checks: PASS with software serial ports. No physical Uno/Nano test performed during this revision.
- Protected runtime/worker/uploader/library/core files unchanged; Google verification remains byte-identical at deployment root. No authentication dependency added.

## Deployment

Production publication could not be performed: the previously linked Circuitera site is not available to the connected Netlify account. The Netlify-ready ZIP is the deliverable; do not treat these local build tests as a live production deployment test.
