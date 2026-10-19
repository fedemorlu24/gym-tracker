# Gym Tracker — development notes

A free, offline-first workout diary for the gym, built as a Progressive Web App. It is made to answer one question: **am I getting stronger?**

**Live app:** https://fedemorlu24.github.io/gym-tracker/

The v74 revision uses a browser-only welcome on Android, with “Continue in browser” as its sole action. It removes Android installation prompts and the Settings installation entry, with browser-specific backup/update copy in all five languages. Release and live verification receipts are stored separately in `artifacts/release-v74/`. Earlier security evidence remains in `SECURITY_REMEDIATION.md` and previous release folders.

The local v75 candidate makes the chat password optional. New users can continue without one, and the same identity remains available after reload; they can add a password later in Chat settings. Existing protected users can remove the chat password after unlocking, preserving their identity. The key then stays in local app data, so anyone with access to the device and app storage may be able to use it. Optional Settings → Proteggi dati encrypts the whole archive, including the chat key, and requires its separate app password to reopen the app. Exporting a backup while the chat key has no password requires a separate password for the backup file. v75 is local and has not been published.

On Android, open it in your browser and choose *Continue in browser*. On iOS, the *Add to Home Screen* guide remains available. There is no Gym Tracker account, subscription or advertising. Workout data is stored on your device; optional chat, sharing and external links use the services described below.

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
| `archive-vault.js` | Optional password protection for local data, photos, rollback and cache |
| `security-data.js` | Normalization of shared, imported and stored records before rendering |
| `secure-media.js` | Offline validation and decoding of inline raster images |
| `external-links.js` | Fixed donation destination and native link privacy protections |
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

Android detection uses the user-agent string or `userAgentData.platform`. The `beforeinstallprompt` handler cancels and discards Android events, and the install action is guarded. The website cannot remove browser-owned menu entries; existing standalone installs retain normal startup. See [MDN beforeinstallprompt](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event) for browser event support.

V74 Playwright checks: 15 groups cover emulated Samsung/Chrome Android in all five languages, a 320×568 viewport, Android desktop user-agent hints, existing standalone startup, desktop prompt behavior and iOS WebKit guidance. Console/pageerror/network diagnostics are captured and screenshots inspected. The update fixture checks 73 → 74 → 75 → 76, preserving localStorage, IndexedDB, photos and an open draft, including offline reopening. No physical Samsung or Google Play Protect installation test was performed.

```sh
python3 -m http.server 8765      # then open http://localhost:8765
python3 lib/build.py             # validate lib/*.json and regenerate lib/data.js
```

Release rule: bump `VERSION` in `sw.js` and every `?v=` in `index.html`, including the script template and bootstrap, to the same number, otherwise phones keep the old cached files. Service workers cache by version, so clear caches when testing locally after editing.

`bootstrap.js` loads the application scripts in order only when `self === top`, then reveals the page and dispatches `gym:boot`. Application and import startup hooks use that event rather than `DOMContentLoaded`; `gymDataReady` still represents storage restoration. Keep `chat-vault.js` before `security-data.js` and `app.js`. A framed page displays an informational message without loading the application or opening its storage.

Keep `archive-vault.js` and `external-links.js` before `app.js` and in the service worker precache. The latter exposes the read-only `GymExternalLinks.donationURL` used by the app.

`update.js` checks the deployed release on opening, returning to the foreground and reconnecting. The worker precaches the complete matching release before activation. Automatic reload waits for open sheets, editing, rest timers and pending data writes. The Home Screen installation URL, localStorage, IndexedDB and photos stay in place; never ask users to remove/reinstall to update. A manual check remains in Settings.

UI verification uses Playwright with console/pageerror and network capture:

```sh
npm ci
npx playwright install chromium webkit
# With the local server on 8765:
npm run test:donation
npm run test:guides
npm run test:update   # starts its own isolated release fixture
npm run test:security # isolated origin, synthetic keys, no relay traffic
npm run test:backup-keys # concurrent exports, native share and crypto/key-use checks
npm run test:vault       # setup/unlock, identity preservation, migration/import and failures
npm run test:framing     # fresh/controlled frames, startup and offline navigation headers
npm run test:archive-vault # whole archive protection, recovery, ordering and lifecycle
npm run test:outbound     # isolated donation navigation, attributes, referrer/opener and network
npm run test:chat-queue   # bounded receives, replay deduplication and relay acknowledgements
npm run test:modal        # mobile focus, viewport changes and touch scrolling in Chromium/WebKit
```

The update fixture pins the released v72 commit and verifies v72 → v73 → two simulated future releases (v74/v75) with synthetic workouts/plans/photos, an open unsaved form, a foreground check and offline reopening. Guide tests sample 131 movements and 327 equipment combinations for finite joints, hand attachment and continuity. These numerical checks supplement visual review; they do not certify every exercise's technique. Tests use fresh browser contexts and do not access users' data. Run the guide suite separately from other CPU-heavy browser tests so animation timing measurements are meaningful.

V73 uses a shared chat minimum of eight characters in encryption, setup, legacy backup import and recovery. Existing chat passwords continue to unlock the same vault. The archive and outer backup retain their separate 12-character minimum; their hints are independent in all five languages. The 14-group chat vault suite checks seven-character rejection and eight-character setup/unlock, identity preservation, import and compatibility with longer passwords. The 14-group archive suite includes recovery of a legacy chat using eight characters followed by the separate archive password. Chromium passes both 14-group suites; a focused WebKit mobile test passes seven/eight-character validation, setup/unlock/reload, focus and five-language hints. The complete vault suite in WebKit stops during its synthetic photo fixture with `storage aborted` on both v72 and v73, so it is not counted as passing. Update 72 → 73 → 74 → 75 passes. Browser diagnostics are captured with Playwright. Publication and live upgrade receipts are separate.

In v72, sheets with an autofocus field open at their final position before synchronous `focus({preventScroll: true})`. They use the visual viewport's height and offset, and reveal the active field by scrolling the pane. Keep the opening transition disabled through paint: restoring it in the same turn can leave WebKit painting the old offscreen layer. Content scrolling never arms dismissal; a downward drag must start on the handle, while cancelled or horizontal gestures leave the sheet open. Closing restores the normal transition. References: [MDN focus](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus), [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

V72 local checks: nine modal groups across Chromium/WebKit, five languages and three mobile sizes; chat vault 12, whole archive 14 and backup/key use 14 groups PASS. Update 71 → 72 → 73 → 74 preserves data/photos, the unsaved draft and offline reopening. Donation/layout/tutorial/sharing checks pass against port 8872. Modal checks capture console errors, page errors, failed requests and relevant HTTP responses; all are empty. They check focus geometry before automation can scroll a field into view, exercise simulated visual-viewport changes and Chromium touch gestures, and include inspected screenshots. Native keyboard behaviour on a physical iPhone remains untested.

v69 pre-release checks: security 10 groups, backup/key use 13 groups, vault 12 groups, framing 6 groups and update 68 → 69 → 70 → 71 PASS. Donation/layout in five languages, tutorial/sharing regressions, `check:vendor` and `check:vendor-inventory` also PASS. Vault/security/backup suites report zero console/pageerror, HTTP failures, failed requests, external traffic and real WebSockets; framing records expected browser policy denials separately. Setup/chat screenshots were inspected. Publication and live verification have separate receipts.

V71 local checks: security 10 groups, backup/key use 14, chat vault 12, whole archive 14, receive queue 4 and framing 6 PASS. Update 70 → 71 → 72 → 73 preserves data/photos, unsaved draft and offline reopening. Outbound Playwright passes click, keyboard, tampered attributes and context-menu/auxclick handlers (`artifacts/security/outbound-results.json`); actual middle-click navigation crashed the Chromium target and remains unverified. Donation layout in five languages, tutorials and sharing pass against port 8871; the initial run on port 8765 reached an old v62 server and was not v71 evidence. Vendor build and inventory checks pass. Current app/vendor npm audits report zero known vulnerabilities in those inventories, which does not certify all application code or embedded assets. These are local checks, separate from publication and live receipts.

The v70 cache race was reproduced in `artifacts/security/cache-race-reproduced.json`: a delayed cache completion restored a raw legacy chat key after another tab protected it. Cache publication now checks current state within an IndexedDB read transaction. The regression passes with no raw key in localStorage or IndexedDB and a valid vault (`artifacts/security/cache-race-fixed.json`).

Whole-archive protection is optional in Settings → Proteggi dati. A separate app password (12–1,024 characters) protects a random AES-GCM-256 data key using PBKDF2-SHA256 with 600,000 iterations, random salt/IV and authenticated metadata. Data, photos, rollback and cache are encrypted; the rest timer is stored inside the protected archive. Activation requires the user's password and preserves the chat identity and existing photos. Protected archives require password-encrypted exports. Recovery retains the previous encrypted archive as an opaque rollback copy. Ordered photo operations prevent delayed encryption from undoing a subsequent delete.

Manual lock and reload require the app password. On `pagehide`, private UI is masked immediately, accepted saves drain before keys are closed, and `pageshow` returns through the password gate; save failure keeps a masked retry screen. Session checks prevent stale share conversions and chat image reads from repopulating private previews after lock/unlock. Lifecycle tests dispatch pagehide/pageshow events; reload is real, but arbitrary BFCache and OS suspension behaviour is not certified. Merely going into the background or becoming idle does not automatically lock. Passwords cannot be recovered by the app; keep a usable backup and update or close old tabs before migration.

Chat (`chat.js`, `chat-vault.js`, `nostr-tools.js`): no own server; end-to-end encrypted messages (NIP-17/44/59) over public Nostr relays. New chat setup can store the identity locally without a chat password, or use the existing AES-GCM-256/PBKDF2-SHA256 vault (600,000 iterations, random 16-byte salt and 12-byte IV). A raw identity is available on the phone without an unlock prompt; users can add a password later. Existing protected identities can remove their password after unlock, preserving the same key. The password-protected path stays unlocked for the session until close/reload or manual lock; there is no five-minute idle timer. With no chat password and no whole-archive protection, the private key is present in local app storage. Optional Settings → Proteggi dati encrypts it with the rest of the archive and requires an app password at reopen.

Setup pauses chat, drains pending writes and stages encryption before an atomic IndexedDB commit of the current archive, rollback and generation. A different legacy identity in the rollback is encrypted with the chosen password too. No contacts or photos are removed. Source comparisons and generation checks reject stale writes. localStorage is a verified cache written after the commit; a failed replacement attempts to remove the old copy. Failure of both operations leaves an explicit incomplete-protection state and retry. Old v68 tabs can still write their legacy cache, so users must update or close them before migration. Invalid identity/vault markers survive normalization and prevent accidental creation of a replacement identity. A valid recovery import can preserve a damaged previous archive without a raw key in its rollback.

Contacts display initials; profile photos, including legacy avatars, are no longer displayed, sent or accepted. Photos in messages from added contacts remain visible immediately and can be sent, enlarged and backed up. Normal messages from unknown or blocked keys are ignored; possession of your invite link can allow a new contact to join, so share it privately and rotate it if needed. Raster validation prevents malformed attachments; it does not classify sexual content. There is no automatic pornography detector or new photo restriction for known friends. Locking only the chat requires unlock to decrypt new messages; saved history and photos remain accessible while the whole archive is unlocked or unprotected. Locking a protected whole archive gates access to those local records as well.

The v71 chat receiver deduplicates work before media storage, accepts at most two active receive operations and 64 total outstanding envelopes with a 4,000,000-character queue budget, and freezes the synchronization cursor with relay backoff on overflow. ACK values must be boolean and events must use the expected subscription ID. These changes preserve NIP-44/NIP-59; all four receive-queue browser groups pass. The Node harness also reduced twenty concurrent replays to one media operation.

Exercise animations (`guide.js`): `A.<scheme>` functions give keyframes + scenery/props; `GMAP` maps every library base id to a scheme; the variant's equipment (`eq`) changes the prop. Shown the first time a library exercise is added (`db.guide`), always in the exercise guide.

3D guide (`guide3d.js`, `3d/moves.js`): when WebGL works, the SVG figure is replaced by a 3D body loaded on demand (three.js bundle + `3d/man.glb` ≈ 1.5 MB in all, cached by the service worker at first use). Every library base id has a movement in `MOVES3D.MAP` → `M.<scheme>(options)` with `pose(k, u)` (u = 0 start → 1 end, or a cycle when `cyc`) and optional `build(k, g)` for benches and machines. Poses are written in 3D from gym-manual checkpoints (for example bar over mid-foot, bar to mid-chest, forearms vertical) using the kit: `torso`, `leg`, `arm` (IK + palm direction + closed grip), `armDir`/`legDir`, `onBone` body landmarks. Worked muscles are painted on the skin from vertex colours (R = muscle group, G = proximity, B = shorts). The body model is derived from Z-Anatomy (CC BY-SA 4.0, credit shown under the 3D view, details in `3d/LICENSE.md`); it was built in Blender from the Z-Anatomy atlas (skin regions welded and smoothed, simple rig with finger bones). The bundle `3d/three.min.js` is three@0.160.0 + GLTFLoader + DRACOLoader + RoomEnvironment built with esbuild. Rebuild scripts: `3d/src/` (Blender script for the model, esbuild entry for three.js).

Backup: `gym-tracker-backup.json`, reminder after 7 days (`backupNudge`). After chat-key protection, exports contain the encrypted chat vault and referenced chat attachments, never `chat.sk`. An outer password is required for unmigrated legacy identities and for a protected whole archive. Historical v70 outer backup encryption uses AES-GCM/PBKDF2-SHA256 with 250,000 iterations. V71 writes v2 envelopes with 600,000 iterations, a password of 12–1,024 characters, and authenticated metadata (AAD), while preserving historical v1 decryption; compatibility, failure and concurrency tests pass in the 14-group backup/key suite. A legacy import requests a password to protect the same identity before committing. An imported vault is authenticated with its existing chat password; losing that password without a recoverable copy means losing access to the identity. Historical files outside the app are not automatically re-encrypted or deleted.

The entire import is parsed, normalized and decoded before confirmation/commit; remote image URLs are rejected without a fetch. A single IndexedDB transaction commits JSON and photos and retains the previous snapshot in `restore-rollback`. Restoring the same vault envelope preserves an already authenticated unlocked session; a different envelope or identity invalidates it. IndexedDB is authoritative after restore/protection; localStorage is a recoverable cache. See `SECURITY_REMEDIATION.md` for tested failure cases and remaining limits.

The CSP in `index.html` restricts scripts to this origin, blocks inline handlers, and allows the WebAssembly decoder and configured secure WebSocket relays. Service-worker-controlled navigation responses add `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`, including offline responses. The first GitHub Pages HTTP response still lacks these framing headers; the bootstrap gate is the protection for that first load and does not turn JavaScript into an HTTP hosting policy. `frame-ancestors` cannot be supplied by a meta tag. Do not change the origin without a separate data-migration plan. References: [OWASP clickjacking guidance](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html), [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

For dependency maintenance run `npm ci --prefix vendor`, `npm run check:vendor`, `npm audit`, and `npm audit --prefix vendor`. The exact inventory and build/update procedure are in `vendor/README.md`; npm audit alone does not certify the browser bundles or WASM.

The optional donation card remains at the bottom of Settings and once in the third recorded workout summary. `external-links.js` owns the exact HTTPS destination `https://buymeacoffee.com/fedemorlu24`; `app.js` reads it through `GymExternalLinks.donationURL`. Native link interactions restore that URL, `_blank`, `noopener noreferrer` and `no-referrer`, and remove `ping`, `attributionsrc` and `download`. There is no widget, payment SDK/API, preconnect or app-data query string. The earlier link already had HTTPS, opener isolation and no-referrer: this is preventive hardening, not a reproduced payment-data leak. The guard is not protection against active XSS.

The service worker adds `Referrer-Policy: no-referrer` and `X-DNS-Prefetch-Control: off` to controlled navigation responses; a DNS-prefetch meta is also present on first load. DNS prefetch control is nonstandard and browser dependent ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-DNS-Prefetch-Control)); link attributes are documented in [MDN's anchor reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a).

Gym Tracker does not collect card or IBAN fields or call payment APIs. Read-only inspection of the public Buy Me a Coffee page observed HTTP 200, TLS 1.3 with a valid certificate, HSTS (`max-age=31536000; includeSubDomains`) and a `js.stripe.com` iframe; no bank/card data, login or payment was submitted (`artifacts/security/banking/public-page.json`). The [Buy Me a Coffee privacy policy](https://buymeacoffee.com/privacy-policy) says supporter card details go directly to Stripe, with a token and limited card metadata returned to Buy Me a Coffee. Creator payout bank details are a distinct flow. [Stripe's security guide](https://docs.stripe.com/security/guide) states Stripe is a PCI Service Provider Level 1. These are provider statements and limited public observations, not an independent audit of Buy Me a Coffee servers, account access or transaction processing.

Deploy: push to the `main` branch; GitHub Pages serves the repository root.

## Limitations

- Muscle recovery is a model on top of small studies, not a medical measurement.
- Only library exercises count towards recovery and the strength level standards.
- iOS suspends web apps when the screen is off, so the rest timer cannot ring in the background.
- No cloud sync: use Export / Import to move data between devices.
- Whole-archive encryption requires activation through Settings with a user-chosen password. Without it, the chat vault protects the private identity key, while saved messages, workouts and photos remain readable in local storage. XSS during unlock can intercept the password, use the crypto operations or steal the secret during use; a non-extractable key is not an XSS defence. A raw wrapping key stored beside the ciphertext would not solve readable-storage exposure. Password cost reference: [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- NIP-44 has no forward secrecy; the protocol has not changed. A compromised identity key can expose past conversations when their encrypted envelopes are available. A future migration requires a vetted protocol, suitable browser implementation and support on both peers; it cannot retrospectively protect old envelopes. No custom cryptographic protocol is introduced. See the [official NIP-44 limitations](https://github.com/nostr-protocol/nips/blob/master/44.md#limitations).

## Author

Federico Morlupi — [@fedemorlu24](https://github.com/fedemorlu24)
