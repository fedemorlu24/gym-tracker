# Gym Tracker v77

The locked-chat recovery button label is shortened to “Crea una nuova chat”. Equivalent concise wording is provided in English, Spanish, French and German. The confirmation still explains the local data removed by creating a new identity; behavior is unchanged.

Commit: `542cb54a618444861dcacc15b7501c2d71097d29`. Local Playwright tests passed in normal and whole-archive-protected mode (390×844): button text, cancellable reset, new passwordless identity, workout retention, chat-photo removal and identity after reload. Console/pageerror/network diagnostics were clear; relay WebSockets were intercepted. Published on 19 October 2026: GitHub Pages build passed and all 17 public asset SHA-256 hashes match. Live Playwright passed on mobile, including the shortened label and successful recovery flow; console/pageerror/network diagnostics were clear. No physical device was tested.
