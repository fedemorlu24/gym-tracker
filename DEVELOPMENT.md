# Gym Tracker — development notes

A free, offline-first workout diary for the gym, built as a Progressive Web App. It is made to answer one question: **am I getting stronger?**

**Live app:** https://fedemorlu24.github.io/gym-tracker/

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
- Body weight, calories and protein with trend and forecast; progress photos (stored on the device) with side-by-side comparison.

### Exercise library
- 131 movements and 485 variants in 5 languages, with target muscles, a muscle map, execution tips and suggested rep ranges.
- The same library exercise stays the same across languages, so history is never split.

### Social, without a server
- Share image cards (session, progress, comparison), challenge links and a friends board — all through links and images, no backend.
- Friends are reached on WhatsApp **one by one**, in private chats (never a group): save each friend's name and number (or pick from your contacts on Android) and send challenges and plans to the one you choose. Numbers stay on the phone and in the backup file.

### Other
- 5 languages: Italian, English, Spanish, French, German.
- Light, dark or automatic theme.
- Works fully offline (service worker).
- Beginner-friendly tutorial.
- Backup: export / import everything as a JSON file.

## Privacy and data

All data lives in your browser (`localStorage` + `IndexedDB`; photos only in `IndexedDB`). Nothing is uploaded. Data is bound to the app's origin, so **never change the URL or the repository name**, and always *Export* before removing the app from the Home Screen.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Page shell |
| `app.js` | Application logic and views |
| `import.js` | Plan import (via the user's own AI app) and CSV history import |
| `i18n.js` | Translations (all 5 languages must stay in sync) |
| `style.css` | Styles |
| `exlib.js` | Exercise library labels |
| `lib/*.json`, `lib/data.js` | Exercise library sources and the generated bundle |
| `lib/BRIEF.md`, `lib/build.py` | Library schema and validator/builder |
| `sw.js` | Service worker (offline copy) |
| `manifest.json`, `icons/` | PWA manifest and icons |

No build step and no dependencies: plain HTML, CSS and JavaScript.

## Development

```sh
python3 -m http.server 8765      # then open http://localhost:8765
python3 lib/build.py             # validate lib/*.json and regenerate lib/data.js
```

Release rule: bump `VERSION` in `sw.js` and every `?v=` in `index.html` to the same number, otherwise phones keep the old cached files. Service workers cache by version, so clear caches when testing locally after editing.

Deploy: push to the `main` branch; GitHub Pages serves the repository root.

## Limitations

- Muscle recovery is a model on top of small studies, not a medical measurement.
- Only library exercises count towards recovery and the strength level standards.
- iOS suspends web apps when the screen is off, so the rest timer cannot ring in the background.
- No cloud sync: use Export / Import to move data between devices.

## Author

Federico Morlupi — [@fedemorlu24](https://github.com/fedemorlu24)
