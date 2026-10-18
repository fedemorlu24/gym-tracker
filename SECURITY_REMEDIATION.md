# Revisione sicurezza — v69

19 ottobre 2026. Candidato locale richiesto da Luca con «riesci a correggere?»
dopo la verifica dei rischi residui della v68. **Non ancora pubblicato.**
Gli esiti sotto riguardano le verifiche locali concluse; ricevute di pubblicazione
e verifiche live saranno aggiunte separatamente. La sezione v68 seguente
è storica e descrive il comportamento prima di queste modifiche.

## Protezione locale della stessa identità chat

`chat-vault.js` protegge la chiave privata secp256k1 esistente con Web Crypto:
AES-GCM 256 bit, PBKDF2-SHA256 con 600.000 iterazioni, salt casuale di 16 byte e
IV casuale di 12 byte. L'envelope ha schema e lunghezze rigorosi; i dati
autenticati aggiuntivi legano formato, parametri e chiave pubblica. La chiave
derivata è non estraibile. Prima di sostituire una copia legacy, il codice
verifica la decifratura e la corrispondenza della chiave pubblica.
Per il costo PBKDF2 e il rischio delle password deboli, riferimento:
[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

La configurazione richiede una password di almeno 12 caratteri, confermata
dall'utente, che non viene persistita. **È richiesta al primo uso della chat:**
il solo aggiornamento dell'app non può cifrare una chiave legacy senza una
password scelta dall'utente. La chat legacy non si collega ai relay prima del
completamento della configurazione. Dopo lo sblocco, i byte segreti restano
privati al modulo per la sessione; chiusura/ricaricamento e blocco manuale
richiedono un nuovo sblocco. Non è attivo un blocco automatico dopo cinque minuti.
Il modulo offre operazioni di messaggistica, non un getter della chiave privata.

La migrazione mantiene identità, amici, messaggi e foto. Cifra anche una chiave
legacy diversa presente in `restore-rollback`, usando la password scelta e
conservando la copia recuperabile. Dati correnti, rollback e nuova generazione
sono committati insieme in IndexedDB dopo il confronto delle copie di partenza.
La chat è sospesa e le scritture pendenti vengono attese. Annullamento prima del
commit e guasti di scrittura mantengono lo stato precedente; un commit già
avvenuto non viene annullato rimuovendo la chiave protetta.

localStorage è scritto come cache soltanto dopo il commit verificato. La vecchia
copia viene sostituita e riletta oppure rimossa: se entrambe le operazioni
falliscono, l'app segnala **protezione incompleta** e permette di riprovare con
la stessa password. Non presenta quella condizione come protezione completata.
Le nuove schede controllano la generazione prima delle scritture; una scheda
v68 già aperta può ancora scrivere la propria cache legacy prima del controllo
IndexedDB. Prima della migrazione occorre aggiornare o chiudere le vecchie schede.

Un envelope o una chiave malformati conservano archivio e stato d'errore tra
normalizzazioni e ricaricamenti: non diventano una richiesta di creare una nuova
identità. Un import valido può sostituire quello stato; il rollback danneggiato
privo di `sk` viene conservato senza generare chiavi. Una chiave raw ambigua non
viene ignorata per consentire il ripristino.

## Backup e recupero

Dopo la migrazione, anche un export senza password esterna contiene il vault
cifrato, mai il campo `chat.sk`. Per un'identità legacy non ancora migrata,
l'export è consentito soltanto con una password per l'intero backup. La UI
spiega come proteggere la chat o aggiungere quella password.

La cifratura esterna del backup resta AES-GCM/PBKDF2-SHA256 a 250.000 iterazioni;
è distinta dal vault a 600.000 iterazioni. Un import legacy chiede una password
per migrare la stessa identità prima del commit; un vault importato richiede la
sua password esistente e viene autenticato prima del ripristino. La password
del vault rimane necessaria anche quando il file JSON esterno non è cifrato.
Senza password e senza una copia recuperabile, l'accesso a quell'identità non
può essere ripristinato. I backup storici già salvati fuori dall'app possono
contenere la chiave in chiaro: l'aggiornamento non può eliminarli o cifrarli.

## Incorporamento in altre pagine

`bootstrap.js` controlla di essere nella finestra principale prima di caricare
gli script applicativi: dentro un frame mostra solo un messaggio, senza aprire
lo storage dell'app. Gli script sono caricati in sequenza e l'inizializzazione
finale usa `gym:boot`. Nelle navigazioni controllate dal service worker, la
risposta riceve `Content-Security-Policy: frame-ancestors 'none'` e
`X-Frame-Options: DENY`, anche nel percorso offline.

La prima risposta HTTP di GitHub Pages continua a non avere questi header:
in quel caso opera il controllo di avvio JavaScript, che non equivale a un
header imposto dall'hosting. La direttiva `frame-ancestors` non funziona in un
meta tag. Origine e URL dell'app restano invariati.
Riferimenti: [OWASP Clickjacking Defense Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html)
e [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

## Limiti che restano

- Il vault protegge la chiave a riposo, non tutto l'archivio: storico messaggi,
  allenamenti e foto locali restano in chiaro nello storage del browser.
- Un XSS attivo durante lo sblocco può intercettare la password, usare le
  operazioni crittografiche o rubare il segreto durante il suo utilizzo. Una
  chiave Web Crypto non estraibile non rende sicura una pagina compromessa.
  Cifrare con una seconda chiave raw salvata accanto al ciphertext non avrebbe
  risolto il rischio dello storage leggibile.
- NIP-44/NIP-59 e il bundle Nostr non sono stati sostituiti con un protocollo
  personalizzato. **La forward secrecy resta assente:** la compromissione della
  chiave può esporre conversazioni passate se le buste sono disponibili.
  [Limiti ufficiali NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md#limitations).
- Le foto degli amici restano consentite, visibili e condivisibili; i profili
  mostrano iniziali. La validazione raster non è un filtro pornografia e non è
  stato aggiunto un classificatore automatico. La chat bloccata richiede lo
  sblocco per decifrare nuovi messaggi; storico e foto già salvati restano accessibili.

## Verifiche locali prima del rilascio

Esiti locali; suite Playwright con dati sintetici:

| Verifica | Stato |
| --- | --- |
| `npm run test:security` | 10 gruppi PASS |
| `npm run test:backup-keys` | 13 gruppi PASS |
| `npm run test:framing` | 6 gruppi PASS |
| `npm run test:update` | 68 → 69 → 70 → 71 PASS |
| `npm run test:vault` | 12 gruppi PASS |
| `npm run test:donation` | Donazione/layout in cinque lingue, tutorial/condivisione e regressioni PASS |
| `npm run check:vendor` | PASS |
| `npm run check:vendor-inventory` | PASS |

Nelle suite vault, security e backup/key-use: zero console/pageerror, errori
HTTP, richieste fallite, uscite esterne e WebSocket reali. I probe di framing
registrano separatamente i rifiuti di policy attesi del browser. Screenshot del
setup e della chat ispezionati. Il ripristino dello stesso envelope conserva lo
sblocco già autenticato; un envelope o un'identità diversi lo invalidano.
Le ricevute sono in `artifacts/security/`, `artifacts/tutorials/verification/` e
`artifacts/donation/`. Le prove di rilascio hanno ricevute separate in `artifacts/release-v69/`.
Queste prove
non attestano una pubblicazione, un audit crittografico completo o una verifica
su iPhone fisico; nessun traffico a persone o relay reali è richiesto dai test.

# Storico: revisione sicurezza — v68

18 ottobre 2026. Correzione successiva alla v67 pubblicata (`8369f9b`), richiesta
da Luca con «correggilo» e verifica dell'uso delle chiavi. Prove locali sotto;
la ricevuta di pubblicazione e i controlli live sono conservati separatamente in
`artifacts/release-v68/`.

## Export concorrenti e condivisione

**V67-EXPORT-RACE, gravità media:** una preparazione in chiaro avviata prima
dell'inserimento della password poteva terminare dopo quella cifrata e sostituire
il file scaricabile. Riprodotto su v67 ritardando il completamento di una lettura
IndexedDB reale; file scaricato e analizzato con dati/identità sintetici. Non è
stata misurata la frequenza naturale né dimostrato un incidente con dati reali.
Il difetto riguarda la selezione del file, non l'algoritmo AES.

`prepareBackup` ora produce un file senza pubblicarlo nello stato condiviso.
Solo la richiesta corrente del dialogo può renderlo esportabile: controlla
password, numero richiesta, revisione dati e generazione dell'archivio. Modifica
della password, salvataggi, scritture foto, restore e chiusura invalidano il file;
il click ricontrolla tutto. Le vecchie risposte, inclusi gli errori, sono scartate.
La chiusura cancella i riferimenti al file/password e il timer pendente; questo
non promette la cancellazione fisica della memoria gestita da JavaScript.

La chiamata alla condivisione nativa resta nel gesto dell'utente. Un ticket
registra quale snapshot è stato condiviso e quando: il ritorno in foreground
può rigenerare il file senza perdere l'esito della condivisione già riuscita.
La registrazione attende lo storage, conserva un backup successivo e non passa
a un nuovo dialogo, archivio importato o identità chat.

## Uso delle chiavi: esito e limiti

- **Chat:** chiave secp256k1 generata da Nostr Tools tramite la casualità
  crittografica del browser. Il link invito contiene chiave pubblica, nome e token,
  non la privata. I messaggi usano NIP-44/NIP-59; firme e destinatario sono
  verificati nei percorsi applicativi. Nel test della busta in uscita non sono
  presenti né chiave privata né testo in chiaro.
- **Backup con password:** Web Crypto, AES-GCM 256 bit, PBKDF2-SHA256 con 250.000
  iterazioni, salt casuale di 16 byte e IV casuale di 12 byte per export. La chiave
  derivata è non estraibile dall'API Web Crypto. Password errata e modifica del
  ciphertext sono rifiutate. Una password debole resta attaccabile offline.
- **Limite locale aperto:** la chiave privata chat è una stringa in chiaro in
  localStorage/IndexedDB; anche la copia rollback può contenerla. Non c'è uno
  sblocco locale con password né un archivio hardware. Un XSS nell'origine o un
  dispositivo/browser compromesso può leggere o usare la chiave. Gli altri siti
  ordinari restano separati dalla same-origin policy. Cifrare con un'altra chiave
  conservata nello stesso storage non risolverebbe questo problema.
- **Limite del protocollo:** NIP-44 non offre forward secrecy: una chiave privata
  compromessa può permettere la lettura delle conversazioni passate se le buste
  cifrate sono disponibili. Non equivale alla sicurezza di un protocollo con
  ratchet. [Specifica NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md#limitations).
- **Inviti e backup in chiaro:** «Nuovo link d'invito» cambia il token, non la
  chiave privata. L'export senza password rimane facoltativo e contiene la chiave,
  come indicato dalla UI. Non è stata cambiata l'identità degli utenti esistenti.

La chiave Web Crypto non estraibile limita `exportKey`, ma non rende inoffensivo
codice malevolo eseguito nella stessa pagina.
[Documentazione Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).

## Verifiche della correzione

`npm run test:backup-keys`: **13 gruppi PASS**, Chromium/Playwright isolato,
console/pageerror/HTTP/richieste fallite/WebSocket/uscite esterne zero.
Include download reale dopo l'ordine di completamento che riproduceva il difetto,
password A→B→A, chiusura/riapertura, errore obsoleto, modifica dati/foto, controllo
finale della password e condivisione nativa simulata. La completion della share
è provata prima, durante e dopo il restore; un import impedisce di registrare
il vecchio export sul nuovo archivio. Screenshot del dialogo ispezionato.

Le prove sulle chiavi includono casualità del browser, identità persistente,
rotazione del solo invito, busta chat firmata/cifrata, vettore ufficiale NIP-44,
salt/IV differenti, chiave non estraibile, password errata e ciphertext alterato.
Il test verifica anche esplicitamente la presenza della chiave nello storage,
per evitare che quel limite venga nascosto da una valutazione generica positiva.
Prova: `artifacts/security/backup-keys-results.json`.

Regressione `npm run test:security`: **10 gruppi PASS**, incluse foto degli amici,
import atomico e protezioni XSS. `npm run test:update`: **67 → 68 → 69 → 70 PASS**,
dati/foto identici, identità chat e bozza conservate, foreground e offline;
console/pageerror/HTTP/richieste fallite zero. Sintassi JavaScript e diff PASS.

Nessun messaggio a persone/relay reali, nessun dato o segreto reale nei test.
La condivisione è simulata in Chromium: non è una prova su iPhone fisico.
Restano aperti il limite delle chiavi locali e l'header HTTP `frame-ancestors`
descritto sotto. I test mirati non costituiscono un audit completo crittografico.
Le foto degli amici rimangono disponibili e i profili mostrano solo iniziali.

# Storico: revisione sicurezza — v67

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
