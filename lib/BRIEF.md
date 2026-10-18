# Exercise library brief (shared by all agents)

You are writing part of the exercise library for a weight-room tracking PWA (iPhone). Users pick exercises from it
to add to a workout. They want EVERYTHING a real gym offers: every common movement and every realistic variant
(barbell, dumbbell, Smith machine, different machines, cables, bodyweight, kettlebell, bands, EZ bar, trap bar,
landmine, suspension trainer, plate...). Aim for completeness a personal trainer would recognise; skip obscure
circus moves. Typical size per muscle group: 8–15 base movements, each with 1–8 variants.

Write ONE JSON file (UTF-8, no comments, no trailing commas) at the path given in your task: an array of base movements.

## Schema
```json
{
  "id": "chest.benchPress",                 // "<group>.<camelCase>", unique
  "g": "chest",                             // one of the groups assigned to you
  "pri": ["chest"], "sec": ["frontDelt", "triceps"],   // muscle keys, ONLY from the list below
  "lvl": 1,                                 // 0 easy, 1 medium, 2 advanced (typical, for the base movement)
  "reps": "6–10",                           // suggested range, en dash; time-based: "30–60 s"
  "name": {"it": "...", "en": "...", "es": "...", "fr": "...", "de": "..."},   // base movement name
  "why":  {"it": "...", ...},               // what it is for, one short sentence, max ~90 chars
  "tip":  {"it": "...", ...},               // key execution cue(s), max ~160 chars
  "variants": [
    {
      "id": "chest.benchPress.barbell",     // "<base id>.<camelCase>", unique
      "eq": "barbell",                      // equipment key, ONLY from the list below
      "name": {"it": "Panca piana con bilanciere", "en": "Barbell bench press", "es": "...", "fr": "...", "de": "..."},
      "note": {"it": "...", ...}            // OPTIONAL: what changes vs the base (max ~80 chars). Omit if nothing useful.
    }
  ]
}
```
Every text object must have all 5 languages: it, en, es, fr, de.

## Allowed muscle keys
chest, upperChest, frontDelt, sideDelt, rearDelt, triceps, biceps, forearms, brachialis, lats, upperBack, traps,
lowerBack, quads, hams, glutes, adductors, abductors, calves, abs, obliques, hipFlexors

## Allowed equipment keys
barbell, dumbbell, machine, smith, cable, bodyweight, kettlebell, band, ezbar, trapbar, landmine, suspension, plate

## Language and quality rules
- Names: the term people actually use in gyms in that country. Italian gym usage is welcome where it is the norm
  (e.g. "Lat machine", "Pulley basso", "Leg press", "Hip thrust", "Chest press", "Shoulder press", "French press").
  Variant names must be full names that read well alone in a list (e.g. "Panca piana con manubri", not "manubri").
- Accurate anatomy and safe, correct technique. Plain, encouraging, concise language; second person singular
  (it "tu", es "tú", fr "vous", de "du").
- For bodyweight variants where the user logs added weight, end the tip/note with the equivalent of
  "Log the added weight (0 if none)." For time-based ones: "Log seconds as reps and 0 kg."
- Correct typography per language: French uses « » and a space before : ; ? !, German „ “, en dash in ranges.
- No duplicates within your file. Do not write movements owned by other groups (see your task).
- Validate before finishing: `python3 -c "import json;d=json.load(open('<your file>'));print(len(d), sum(len(b['variants']) for b in d))"`
  and fix any error. Report back only the two counts and any doubts, not the content.
