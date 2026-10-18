# Revisione sicurezza — v67

18 ottobre 2026. Base: v66, commit
`f036e8dcfdd0000d04372691248caf6111833c15`. Correzioni del rapporto
`SECURITY_ASSESSMENT.md` fornito da Luca. Questo rapporto documenta le modifiche
e le verifiche locali completate prima del rilascio. Successivamente Luca ha
autorizzato esplicitamente la pubblicazione con «pubblica la v67».
L'esito della pubblicazione e le verifiche sul sito pubblico saranno registrati
separatamente: le prove riportate qui non attestano che la v67 sia già online.

## Comportamento della chat concordato

Le foto nei messaggi degli amici già aggiunti rimangono immediatamente visibili,
inviabili e apribili a schermo intero. Restano messaggi, reazioni, schede,
sfide e condivisioni. Non è stato introdotto un passaggio «Mostra foto».

I profili mostrano iniziali: eliminati caricamento, invio, ricezione e rendering
degli avatar, compresi quelli già salvati. Questo chiude il canale delle immagini
inappropriate nei profili. Le foto personali dei progressi restano disponibili.

I normali messaggi da chiavi sconosciute o bloccate vengono ignorati. Il link
d'invito contiene però un token che consente di aggiungersi: chi lo possiede non
è necessariamente una persona conosciuta nella vita reale. La rotazione del link
e il blocco del contatto restano disponibili. La validazione tecnica dei file
non riconosce pornografia: anche un contatto aggiunto può inviare una foto
inappropriata. Non è stata introdotta moderazione automatica del contenuto.

## Esito dei rilievi

| Rilievo | Modifica locale | Stato e limite |
| --- | --- | --- |
| R1 — HTML da schede, backup e storage | Schema condiviso prima del rendering e dopo lettura IndexedDB; identificatori validati/migrati; escape coerente di testo e attributi; mappe senza prototipo | Corretto nei percorsi verificati. Test includono link, incolla, import confermato, dati legacy e reload. |
| R2 — chat | Verifica schema, destinatario e hash canonico del rumor; firme esterne mantenute; reazioni limitate; immagini decodificate prima dello storage e assegnate via DOM | Corretto nei percorsi verificati. Nessuna firma aggiunta al rumor Nostr, che resta intenzionalmente non firmato. Foto valide degli amici conservate. |
| R3 — ripristino incompleto | Validazione completa e staging, niente fetch di URL fotografici; commit unico IndexedDB di dati e foto, copia di rollback, barriera scritture/chat e generazione | Corretto nei guasti simulati. localStorage diventa cache dopo il ripristino; un suo errore successivo al commit non viene presentato come import fallito. |
| R4 — restrizioni browser | CSP meta, blocco script/handler inline, object/base/form/frame limitati, referrer disabilitato | **Parziale:** manca la protezione dall'incorporamento tramite header HTTP `frame-ancestors`. Richiede intervento sull'hosting senza cambiare origine implicitamente. |
| R5 — librerie | Inventario upstream/hash/licenze, lock separato, build riproducibile, esbuild aggiornato a 0.28.2 | Processo e asset verificati. Restano i limiti di attribuzione Draco e dipendenze incorporate nel bundle Nostr descritti sotto. |

## Ripristino e conservazione dei dati

`security-data.js` conserva il testo come Unicode letterale e normalizza i campi
noti. Gli ID legacy non sicuri vengono migrati con riferimenti coerenti; dati
malformati possono essere scartati. L'escape è applicato anche al rendering.

Il ripristino accetta solo immagini raster inline supportate, con controlli su
base64, formato, dimensioni e decodifica. Limiti: file 96 MiB, 1.000 foto totali,
48 MiB di immagini decodificate; ogni foto progressi massimo 12 MiB. I messaggi
fotografici mantengono il limite JPEG di 49.000 byte e 2.048 × 2.048 pixel.
L'envelope cifrato è validato prima di eseguire PBKDF2/AES-GCM.

Il commit salva in `restore-rollback` il precedente JSON e tutte le foto nella
stessa transazione che sostituisce `kv` e `photos`. Non viene cancellato lo
storage del sito. La copia riguarda l'ultimo ripristino; non è una cronologia
illimitata né un nuovo comando di recupero nell'interfaccia.

I nuovi export includono gli allegati chat referenziati. Un backup storico che
non li contiene conserva solo gli allegati già presenti e referenziati della
medesima identità chat. Il backup contiene anche la chiave privata: la UI ora lo
spiega in tutte e cinque le lingue e invita a usare la password facoltativa.

La generazione blocca le scritture di un'altra scheda che esegue il nuovo codice
ma conserva una copia precedente al ripristino. **Una scheda v66 già aperta non
implementa questo protocollo**: prima di ripristinare un backup dopo il rilascio,
anche eventuali vecchie schede devono ricevere l'aggiornamento. Nessuna richiesta
di disinstallare la PWA o cancellare i dati del sito.

## Verifiche locali

Playwright Chromium, contesti nuovi e dati/chiavi sintetici. I test di sicurezza
intercettano tutte le richieste HTTP e i WebSocket; nessun messaggio è stato
inviato a relay o persone reali. Raccolti console, pageerror, richieste fallite e
risposte HTTP. DOM/stato JavaScript verificati con `page.evaluate`.

| Verifica | Esito | Prova locale |
| --- | --- | --- |
| `npm run test:security` | 10 gruppi PASS | `artifacts/security/results.json` |
| Foto amico | Ricezione immediata, invio attraverso input file, fullscreen, backup e reload PASS; sconosciuti/bloccati ignorati | `tests/security.cjs`, `artifacts/security/chat-friend-photos.png` |
| Backup non valido | Foto malformata, URL remoto, data impossibile, scrittura abortita e annullamento conservano dati/foto/identità | `tests/security.cjs` |
| Backup valido e guasti cache | Import in chiaro/cifrato e reload dopo errore localStorage PASS | `tests/security.cjs` |
| `npm run test:guides` | 131 movimenti, 327 combinazioni, 61 pose; controlli player, fallback e responsive PASS | `artifacts/tutorials/verification/browser.json`, `poses.json` |
| `npm run test:donation` | Cinque lingue, temi e viewport, donazione facoltativa e tutorial/condivisione liberi PASS | `artifacts/donation/browser.json` |
| `npm run test:update` | 66 → 67 → 68 → 69; localStorage, IndexedDB e foto identici, identità chat e bozza conservate; foreground/offline PASS | `artifacts/tutorials/verification/update.json` |
| `npm run check:vendor` | Quattro asset riprodotti e confrontati byte per byte | `vendor/inventory.json`, `tools/vendor-build.mjs` |
| Audit npm root/vendor | Zero avvisi nelle due dependency tree risolte | `artifacts/security/root-audit.json`, `vendor-audit-final.json` |

Console/pageerror/richieste fallite/HTTP error: zero nelle suite concluse; le
violazioni CSP dei due probe deliberati sono attese e registrate separatamente.
Screenshot di scheda sicura, profili con iniziali e chat ispezionati.

Durante la verifica, l'attesa fissa di 250 ms nel test donazione non copriva il
caricamento asincrono 3D: ora attende il progresso reale. Il test guide attende
bootstrap e mount effettivo; una precedente misura della velocità era fallita
con più suite Chromium pesanti in parallelo, mentre la suite isolata passa.
La normalizzazione iniziale eliminava il flag storico `tourSeen: 1`: corretto
per conservare `1`, `true` e le date valide. Nessun limite temporale dei tutorial
è stato aggiunto o rimosso durante questi aggiustamenti.

## Librerie e limiti residui

Three.js resta 0.160.0; Nostr Tools resta 2.10.3, bundle npm byte-identico. Draco
resta il decoder distribuito da Three 0.160.0, identificato da hash; non è stata
stabilita una sua versione semantica indipendente. Le dipendenze transitive
risolte oggi non provano quali versioni il publisher incorporò nel bundle Nostr.
Non è stata sostituita la crittografia con codice personalizzato.

La riproduzione storica di Three coincideva con v66 usando esbuild 0.20.2 e
`sourcefile: 'entry.cjs'`; poi il compilatore è passato a 0.28.2, eliminando
l'avviso noto sul vecchio development server. L'hash del nuovo bundle e tutte
le licenze sono in `vendor/`. Un audit npm pulito non certifica la sicurezza di
ogni byte dei bundle/WASM.

La CSP consente `wss:` per mantenere relay configurabili e `wasm-unsafe-eval`
per Draco; non consente script inline o `unsafe-eval` generico. Gli stili inline
restano necessari all'interfaccia. `frame-src 'none'` limita i frame caricati
dall'app, non chi incorpora l'app: per questo occorre un header HTTP
[`frame-ancestors`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

Non effettuati: prova su iPhone/Safari fisico, traffico relay reale, audit
completo della crittografia o delle infrastrutture terze, verifica degli account
GitHub privati. Questo documento attesta le correzioni e prove descritte, non
l'assenza assoluta di vulnerabilità.
