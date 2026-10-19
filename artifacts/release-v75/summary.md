# Gym Tracker v75 release

Published 19 October 2026. Commit `8e9d195596afbca74b7f4493a7c7b843a473cc7e`; GitHub Pages build succeeded. All 17 public files returned HTTP 200 and matched the candidate SHA-256 hashes.

Playwright mobile live smoke (390×844, clean browser profile): v75 loaded; chat tab opened; “Continua senza password” was visible without keyboard focus; selecting it created an unlocked raw identity; reload preserved the same public identity and chat tab remained available. No console errors, page errors, failed requests, HTTP errors or external HTTP requests. Public Nostr relay WebSockets were intercepted and closed, so no real relay connection or message was made.

Local release candidate UI flow had previously passed setup without password, add password, reload and unlock, remove password, reload without prompt, and create message while preserving identity. Static syntax and `git diff --check` passed.

Limits: browser/device emulation rather than physical Android/iPhone; no real peer or relay messaging tested.
