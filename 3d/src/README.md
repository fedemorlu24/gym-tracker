# Ricostruire i file 3D

- `build_body.py`: crea `man.glb` dall'atlante Z-Anatomy (file `Startup.blend` dentro `Z-Anatomy.zip` di
  github.com/Z-Anatomy/Models-of-human-anatomy). Serve Blender 4.5:
  `Blender -b Startup.blend --python build_body.py -- /percorso/man.glb`
- `three-entry.js`: pacchetto `three.min.js` (three@0.160.0) con
  `npx esbuild three-entry.js --bundle --minify --format=iife --outfile=three.min.js`
