# Repository security review — 11 October 2026

Scope: project source, templates, static assets, tests, documentation, local
configuration, tracked file inventory, database schema, and Git hook inventory.
This is not a whole-device malware scan or a guarantee that all vulnerabilities
have been found. Third-party virtual-environment code was excluded from the
project credential scan; it is now excluded from Git.

## Findings and fixes

- Removed 62 virtual-environment, IDE, Python cache and local database files
  from Git tracking, retaining local copies. Ignore rules prevent recurrence.
  Git still contains earlier versions in history; history was not rewritten.
- Replaced the fixed development secret with a random process-local value.
  Disabling debug requires an explicit private environment secret.
- Restricted default allowed hosts to loopback names and disallowed wildcard
  host configuration. Local debugging remains enabled for development.
- Added CSRF and clickjacking middleware. Current forms use GET for map
  selection or client-side event handlers for simulator commands.
- Raised the Django minimum to 5.2.18, the security release announced on
  6 October 2026. Installed it in the ignored project virtual environment.
  System Python previously had Django 5.0.2; system packages were not modified.

No embedded private credentials, unexpected third-party script loads, or
application shell-execution paths were identified in reviewed project files.
The SQLite file has no tables. Git hooks contain only inactive sample files.
Flight-strip HTML interpolates internally generated aircraft data; command
feedback and airline information use textContent. Reassess strip rendering if
saved games or externally supplied aircraft data are introduced.

Speech recognition remains browser-managed and can process microphone audio
remotely. Voice diagnostics store text in tab memory and export only on request.
No Kokoro runtime or paid voice service is integrated.

Validation: all JavaScript gameplay/traffic/voice/readback/airline suites pass;
nine Django tests pass on 5.2.18, including untrusted-host rejection, frame
blocking, and CSRF checks. Missing production secrets and wildcard hosts fail
configuration checks. Full HTTPS/production configuration is deferred until
hosting work; the development server must remain bound to loopback.

Reference: https://www.djangoproject.com/weblog/2026/oct/06/security-releases/
