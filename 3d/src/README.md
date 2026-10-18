# Ricostruire i file 3D

## Bundle JavaScript e decoder

La versione sorgente è `three@0.160.0`; GLTFLoader, DRACOLoader e RoomEnvironment
provengono dalla stessa distribuzione. Il compilatore corrente è
`esbuild@0.28.2`. Versioni e integrità npm sono fissate in
[`../../vendor/package.json`](../../vendor/package.json) e nel relativo lockfile.

Dalla radice del repository, con Node.js 20 o successivo:

```sh
npm ci --prefix vendor --ignore-scripts --no-audit --no-fund
node tools/vendor-build.mjs --check
node tools/vendor-build.mjs
```

Il controllo ricostruisce il bundle come IIFE minificata usando `three-entry.js`
e `sourcefile: 'entry.cjs'`, necessario per conservare il wrapper CommonJS del
build originale. Confronta byte e SHA-256 di tutti i quattro asset runtime con
l'inventario. L'ultimo comando genera candidati verificati sotto
`artifacts/vendor-build/`; `--write` li copia nei percorsi runtime soltanto dopo
aver verificato tutti i candidati. I comandi di ricostruzione non usano la rete.

I decoder Draco JavaScript/WASM vengono copiati da
`three@0.160.0/examples/jsm/libs/draco/gltf/`. Sono identificati tramite questa
distribuzione e gli hash; la loro versione Draco indipendente non è stata
stabilita. Licenze, provenienza e procedura di aggiornamento sono in
[`../../vendor/README.md`](../../vendor/README.md).

Il bundle v66 è stato prima riprodotto byte-identico con esbuild 0.20.2. Il
successivo passaggio a esbuild 0.28.2 rimuove l'advisory del server di sviluppo
GHSA-67mh-4wv8-2f99 e ricompila gli stessi sorgenti Three.js. Il bundle corrente
ha SHA-256 `6685cc7c5a1fa3cfa6c663564345d7e53dc6a25ee1867141d2f7037ae63cc6c4`.
La verifica del root del 18 ottobre 2026 riproduce tutti i quattro asset;
gli audit npm root/vendor riportano zero vulnerabilità note nei rispettivi
alberi risolti. Questo non certifica tutte le dipendenze incorporate nei binari.

## Modello del corpo

`build_body.py` crea `man.glb` dall'atlante Z-Anatomy: file `Startup.blend` dentro
`Z-Anatomy.zip` da <https://github.com/Z-Anatomy/Models-of-human-anatomy>.
Serve Blender 4.5:

```sh
Blender -b Startup.blend --python build_body.py -- /percorso/man.glb
```

Attribuzione e licenza CC BY-SA 4.0 del modello sono in
[`../LICENSE.md`](../LICENSE.md).
