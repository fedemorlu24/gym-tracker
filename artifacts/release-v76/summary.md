# Gym Tracker v76 — published and verified

On 19 October 2026 Luca confirmed resetting a forgotten chat identity. The locked-chat inbox now replaces “Sblocca la chat” with “Crea una nuova chat senza password”. A confirmation explains that the old identity, contacts, saved messages and chat photos on this phone are removed. Workouts and other photos stay. Cancelling preserves the old state. The new identity stays unlocked after reload and has no chat password.

GitHub Pages build passed for application commit `1b591c2e794fde0832aa2df3d4ff877975dde483`; all 17 public assets returned HTTP 200 and matched their SHA-256 hashes. Playwright passed locally and on the live site at 390×844, including ordinary and whole-archive-protected storage. Console/pageerror/request/HTTP/external HTTP errors: zero. Nostr WebSockets were intercepted and closed; no real relay traffic or messages.

Limitations: no physical phone tested. The old identity cannot be recovered without its forgotten password. Evidence: `local-verification.json`, `live-smoke.json`, `locked-chat-mobile.png`, `live-locked-button.png`.
