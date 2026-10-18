# Gym Tracker — development notes

A free, offline-first workout diary for the gym, built as a Progressive Web App. It is made to answer one question: **am I getting stronger?**

**Live app:** https://fedemorlu24.github.io/gym-tracker/

For the v69 vault and framing changes, see `SECURITY_REMEDIATION.md`. Local pre-release checks are documented there; publication and live upgrade receipts are kept separately in `artifacts/release-v69/`.

Open it on your phone and use *Add to Home Screen*. There is no account, no server, no subscription and no ads: everything stays on your device.

## What it does

### Log workouts fast
- Sessions → exercises → sets (reps × kg), with `−` / `+` steppers and no keyboard needed.
- Shows what you did last time and suggests the next step (one more rep, or a little more weight).
- Rest timer that starts after each set, beeps and keeps the screen awake. Rest time is configurable **per exercise** (or off for that exercise), the default is set in Settings, and the whole timer can be switched off there.
- Records ("PR") detected on estimated strength (Epley e1RM), so one more rep at the same weight counts.
- Undo for deletions, end-of-session summary.

### Follow your program
- **My program** card on the *Today* tab: every day of your plan, the next one highlighted, each exercise prefilled with its target and your progress.
- Build your own plan, receive one from a coach through a link, or start from the built-in **beginner full-body plan**.
- Add an exercise during a session and the app offers to keep it in the program.
- **Import an existing plan** from a photo or PDF, with no extra cost: copy the instructions, paste them in the free version of any AI app together with your file, paste the answer back, review the preview. Already-done workouts are imported as history too.
- **Import history from other apps** (Strong, Hevy, FitNotes… any CSV/TSV with date, exercise, weight, reps).

### See your progress
- Per exercise: **estimated strength**, top weight and reps-at-top-weight charts, records, forecast and mini sparkline in every exercise card.
- *Weeks* view: exercises × weeks, green/grey against the last week you trained them.
- Goals with progress bar and ETA, weekly streak, badges, strength level (sex/age/body weight standards).
- A decrease is shown in grey, not red: lighter days and deloads are normal.

### Muscle recovery
- Body figure (male/female, front and back) coloured by how recovered each muscle is, with a recovery percentage and time-to-ready per muscle group.
- Based on sets per muscle, how close each set was to failure, and age. It is an **estimate, not a measurement**, built on:
  - MacDougall et al. 1995 — muscle protein synthesis stays elevated ~24 h and is near baseline by ~36 h.
  - Morán-Navarro et al. 2017 — training to failure delays recovery by 24–48 h compared with stopping short.
  - Large multi-joint lifts typically need 48–72 h, small muscles ~36–48 h.

### Body
- Body weight and calories with trend and forecast; progress photos (stored on the device) with side-by-side comparison.

### Exercise library
- 131 movements and 485 variants in 5 languages, with target muscles, a muscle map, execution tips and suggested rep ranges.
- The same library exercise stays the same across languages, so history is never split.
- Animated tutorials and their sharing are free for everyone. The share button opens the phone's share sheet or copies a public `#tutorial=<base-id>&eq=<equipment>` link. It contains no workout data.
- Tutorials are selected by movement and equipment (131 movements, 327 combinations). Named variants with the same equipment share the movement guide; the library's variant-specific notes still apply. The SVG fallback is a simplified schematic, not the same visual model as WebGL.
- Optional support: the “☕ Buy me a coffee” link at the bottom of Settings opens the existing Buy Me a Coffee page. A quieter “Buy me a coffee” card appears once in the third recorded workout’s summary (empty sessions do not count). Its seen flag is saved with the data/backup. No payment verification, account, entitlement or tutorial time limit.

### Social, without a server
- Share image cards (session, progress, comparison), challenge links and a friends board — all through links and images, no backend.
- Friends are reached on WhatsApp **one by one**, in private chats (never a group): save each friend's name and number (or pick from your contacts on Android) and send challenges and plans to the one you choose. Numbers stay on the phone and in the backup file.

### Other
- 5 languages: Italian, English, Spanish, French, German.
- Dark theme by default; light and automatic remain available. Existing explicit preferences are preserved.
- Works fully offline (service worker).
- Beginner-friendly tutorial.
- Backup: export / import everything as a JSON file.

## Privacy and data

Workout data lives in your browser (`localStorage` + `IndexedDB`; photos only in `IndexedDB`). Chat sends encrypted messages and selected attachments through public Nostr relays after you activate it. Sharing and exports send only what you choose. Data is bound to the app's origin, so **never change the URL or the repository name**, and always *Export* before removing the app from the Home Screen.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Page shell |
| `bootstrap.js` | Top-level startup gate, sequential script loading and `gym:boot` event |
| `app.js` | Application logic and views |
| `chat-vault.js` | Password-protected local chat identity and private in-memory message operations |
| `security-data.js` | Normalization of shared, imported and stored records before rendering |
| `secure-media.js` | Offline validation and decoding of inline raster images |
| `chat.js`, `nostr-tools.js` | Encrypted contact chat and the pinned upstream crypto bundle |
| `import.js` | Plan import (via the user's own AI app) and CSV history import |
| `i18n.js` | Translations (all 5 languages must stay in sync) |
| `style.css` | Styles |
| `exlib.js` | Exercise library labels |
| `lib/*.json`, `lib/data.js` | Exercise library sources and the generated bundle |
| `lib/BRIEF.md`, `lib/build.py` | Library schema and validator/builder |
| `guide3d.js`, `3d/` | 3D exercise guide: renderer and kit (`guide3d.js`), movements (`3d/moves.js`), body model, three.js, Draco decoder |
| `sw.js` | Service worker (offline copy) |
| `manifest.json`, `icons/` | PWA manifest and icons |
| `vendor/`, `tools/vendor-build.mjs` | Pinned upstream packages, licenses, asset hashes and reproducible build |

No build step for the app: plain HTML, CSS and JavaScript. The 3D files in `3d/` are prebuilt (see below).

## Development

```sh
python3 -m http.server 8765      # then open http://localhost:8765
python3 lib/build.py             # validate lib/*.json and regenerate lib/data.js
```

Release rule: bump `VERSION` in `sw.js` and every `?v=` in `index.html`, including the script template and bootstrap, to the same number, otherwise phones keep the old cached files. Service workers cache by version, so clear caches when testing locally after editing.

`bootstrap.js` loads the application scripts in order only when `self === top`, then reveals the page and dispatches `gym:boot`. Application and import startup hooks use that event rather than `DOMContentLoaded`; `gymDataReady` still represents storage restoration. Keep `chat-vault.js` before `security-data.js` and `app.js`. A framed page displays an informational message without loading the application or opening its storage.

`update.js` checks the deployed release on opening, returning to the foreground and reconnecting. The worker precaches the complete matching release before activation. Automatic reload waits for open sheets, editing, rest timers and pending data writes. The Home Screen installation URL, localStorage, IndexedDB and photos stay in place; never ask users to remove/reinstall to update. A manual check remains in Settings.

UI verification uses Playwright with console/pageerror and network capture:

```sh
npm ci
npx playwright install chromium
# With the local server on 8765:
npm run test:donation
npm run test:guides
npm run test:update   # starts its own isolated release fixture
npm run test:security # isolated origin, synthetic keys, no relay traffic
npm run test:backup-keys # concurrent exports, native share and crypto/key-use checks
npm run test:vault       # setup/unlock, identity preservation, migration/import and failures
npm run test:framing     # fresh/controlled frames, startup and offline navigation headers
```

The update fixture pins the released v68 commit and verifies v68 → current candidate → two simulated future releases with synthetic workouts/plans/photos, an open unsaved form, a foreground check and offline reopening. Guide tests sample 131 movements and 327 equipment combinations for finite joints, hand attachment and continuity. These numerical checks supplement visual review; they do not certify every exercise's technique. Tests use fresh browser contexts and do not access users' data. Run the guide suite separately from other CPU-heavy browser tests so animation timing measurements are meaningful.

v69 pre-release checks: security 10 groups, backup/key use 13 groups, vault 12 groups, framing 6 groups and update 68 → 69 → 70 → 71 PASS. Donation/layout in five languages, tutorial/sharing regressions, `check:vendor` and `check:vendor-inventory` also PASS. Vault/security/backup suites report zero console/pageerror, HTTP failures, failed requests, external traffic and real WebSockets; framing records expected browser policy denials separately. Setup/chat screenshots were inspected. Publication and live verification have separate receipts.

Chat (`chat.js`, `chat-vault.js`, `nostr-tools.js`): no own server; end-to-end encrypted messages (NIP-17/44/59) over public Nostr relays. Chat requires local setup/unlock before connecting. Setup asks the user for a password of at least 12 characters and encrypts the same existing secp256k1 identity; it generates an identity only for a genuinely new chat. Merely installing the update cannot protect an existing legacy key before the user chooses a password. The vault uses AES-GCM-256 and PBKDF2-SHA256 with 600,000 iterations, random 16-byte salt and 12-byte IV, and authenticated data binding its version/parameters to its public key. The derived Web Crypto key is non-extractable. Passwords are never persisted; unlocked secret bytes stay private to the module, whose API exposes message operations. It stays unlocked for the session until close/reload or manual lock; there is no five-minute idle timer.

Setup pauses chat, drains pending writes and stages encryption before an atomic IndexedDB commit of the current archive, rollback and generation. A different legacy identity in the rollback is encrypted with the chosen password too. No contacts or photos are removed. Source comparisons and generation checks reject stale writes. localStorage is a verified cache written after the commit; a failed replacement attempts to remove the old copy. Failure of both operations leaves an explicit incomplete-protection state and retry. Old v68 tabs can still write their legacy cache, so users must update or close them before migration. Invalid identity/vault markers survive normalization and prevent accidental creation of a replacement identity. A valid recovery import can preserve a damaged previous archive without a raw key in its rollback.

Contacts display initials; profile photos, including legacy avatars, are no longer displayed, sent or accepted. Photos in messages from added contacts remain visible immediately and can be sent, enlarged and backed up. Normal messages from unknown or blocked keys are ignored; possession of your invite link can allow a new contact to join, so share it privately and rotate it if needed. Raster validation prevents malformed attachments; it does not classify sexual content. There is no automatic pornography detector or new photo restriction for known friends. Locked chat requires unlock to decrypt new messages; saved history and photos remain accessible.

Exercise animations (`guide.js`): `A.<scheme>` functions give keyframes + scenery/props; `GMAP` maps every library base id to a scheme; the variant's equipment (`eq`) changes the prop. Shown the first time a library exercise is added (`db.guide`), always in the exercise guide.

3D guide (`guide3d.js`, `3d/moves.js`): when WebGL works, the SVG figure is replaced by a 3D body loaded on demand (three.js bundle + `3d/man.glb` ≈ 1.5 MB in all, cached by the service worker at first use). Every library base id has a movement in `MOVES3D.MAP` → `M.<scheme>(options)` with `pose(k, u)` (u = 0 start → 1 end, or a cycle when `cyc`) and optional `build(k, g)` for benches and machines. Poses are written in 3D from gym-manual checkpoints (for example bar over mid-foot, bar to mid-chest, forearms vertical) using the kit: `torso`, `leg`, `arm` (IK + palm direction + closed grip), `armDir`/`legDir`, `onBone` body landmarks. Worked muscles are painted on the skin from vertex colours (R = muscle group, G = proximity, B = shorts). The body model is derived from Z-Anatomy (CC BY-SA 4.0, credit shown under the 3D view, details in `3d/LICENSE.md`); it was built in Blender from the Z-Anatomy atlas (skin regions welded and smoothed, simple rig with finger bones). The bundle `3d/three.min.js` is three@0.160.0 + GLTFLoader + DRACOLoader + RoomEnvironment built with esbuild. Rebuild scripts: `3d/src/` (Blender script for the model, esbuild entry for three.js).

Backup: `gym-tracker-backup.json`, reminder after 7 days (`backupNudge`). After protection, exports contain the encrypted chat vault and referenced chat attachments, never `chat.sk`, even without an outer backup password. Export of an unmigrated legacy identity requires an outer password; the UI explains the setup alternative. Outer backup encryption (`encryptBackup`) remains AES-GCM/PBKDF2-SHA256 with 250,000 iterations, separate from the vault's 600,000. A legacy import requests a password to protect the same identity before committing. An imported vault is authenticated with its existing chat password; losing that password without a recoverable copy means losing access to the identity. Historical files outside the app are not automatically re-encrypted or deleted.

The entire import is parsed, normalized and decoded before confirmation/commit; remote image URLs are rejected without a fetch. A single IndexedDB transaction commits JSON and photos and retains the previous snapshot in `restore-rollback`. Restoring the same vault envelope preserves an already authenticated unlocked session; a different envelope or identity invalidates it. IndexedDB is authoritative after restore/protection; localStorage is a recoverable cache. See `SECURITY_REMEDIATION.md` for tested failure cases and remaining limits.

The CSP in `index.html` restricts scripts to this origin, blocks inline handlers, and allows the WebAssembly decoder and configured secure WebSocket relays. Service-worker-controlled navigation responses add `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`, including offline responses. The first GitHub Pages HTTP response still lacks these framing headers; the bootstrap gate is the protection for that first load and does not turn JavaScript into an HTTP hosting policy. `frame-ancestors` cannot be supplied by a meta tag. Do not change the origin without a separate data-migration plan. References: [OWASP clickjacking guidance](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html), [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

For dependency maintenance run `npm ci --prefix vendor`, `npm run check:vendor`, `npm audit`, and `npm audit --prefix vendor`. The exact inventory and build/update procedure are in `vendor/README.md`; npm audit alone does not certify the browser bundles or WASM.

`DONATE_URL` in `app.js` enables the optional donation card at the bottom of Settings and once in the third recorded workout summary (empty = hidden).

Deploy: push to the `main` branch; GitHub Pages serves the repository root.

## Limitations

- Muscle recovery is a model on top of small studies, not a medical measurement.
- Only library exercises count towards recovery and the strength level standards.
- iOS suspends web apps when the screen is off, so the rest timer cannot ring in the background.
- No cloud sync: use Export / Import to move data between devices.
- The vault protects the private chat key at rest, not saved messages, workouts or photos. XSS during unlock can intercept the password, use the crypto operations or steal the secret during use; a non-extractable key is not an XSS defence. A raw wrapping key stored beside the ciphertext would not solve readable-storage exposure. Password cost reference: [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- NIP-44 has no forward secrecy; the protocol has not changed. A compromised identity key can expose past conversations when their encrypted envelopes are available. See the [official NIP-44 limitations](https://github.com/nostr-protocol/nips/blob/master/44.md#limitations).

## Author

Federico Morlupi — [@fedemorlu24](https://github.com/fedemorlu24)
