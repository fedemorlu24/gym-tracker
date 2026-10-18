# Revisione sicurezza — v71

19 ottobre 2026. Richiesta di Luca: «risolvi tutte le vulnerabilità. proteggi
anche la comunicazione con buymeacoffee», seguita dalla verifica dei dati bancari.
Le modifiche v71 sono implementate e le verifiche locali elencate sono concluse. Questo documento
riporta le prove locali e non attesta una pubblicazione: le ricevute di rilascio
e le verifiche live sono conservate separatamente quando disponibili in `artifacts/release-v71/`.
Gli esiti storici v69/v70 sotto non sono prove della v71; nessuna delle suite
equivale a un audit completo o all'assenza di ogni vulnerabilità.

## Buy Me a Coffee: collegamento e confine dei dati bancari

Il collegamento precedente usava già la destinazione HTTPS fissa
`https://buymeacoffee.com/fedemorlu24`, `target="_blank"`, `rel="noopener noreferrer"`
e una policy globale `no-referrer`. Non è stata riprodotta una fuga di dati
attraverso quel collegamento. `external-links.js` aggiunge protezioni preventive:
centralizza la destinazione immutabile, ripristina gli attributi prima delle
interazioni sul link e rimuove `ping`, `attributionsrc` e `download`. Il link
dichiara anche `referrerpolicy="no-referrer"`. Rimane una navigazione volontaria,
senza widget, SDK, API di pagamento, preconnect o parametri contenenti dati
dell'app. Tutorial e funzioni restano indipendenti dalle donazioni.

Le risposte di navigazione controllate dal service worker aggiungono
`Referrer-Policy: no-referrer` e `X-DNS-Prefetch-Control: off`; quest'ultimo è
presente anche come meta. Il controllo DNS è non standard e dipende dal browser,
quindi non è una garanzia universale contro ogni connessione anticipata.
Il ripristino degli attributi non è una difesa da JavaScript malevolo già in
esecuzione nella stessa pagina. Riferimenti: [MDN, attributi dei link](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a)
e [MDN, X-DNS-Prefetch-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-DNS-Prefetch-Control).

`tests/outbound.cjs` verifica con Playwright navigazione tramite click e tastiera,
attributi alterati, assenza di referrer/opener/dati applicativi e assenza di
traffico Buy Me a Coffee prima dell'interazione. Verifica inoltre i gestori di
menu contestuale e `auxclick`. Esito PASS in
`artifacts/security/outbound-results.json`, con destinazione intercettata e
senza pagamenti reali. **La navigazione reale tramite middle-click non è
verificata:** il tentativo ha causato un crash del target Chromium; la prova
del gestore `auxclick` non equivale a quella navigazione.

Separatamente, l'ispezione in sola lettura della pagina pubblica Buy Me a Coffee
ha osservato HTTP 200, TLS 1.3 con certificato valido, HSTS
`max-age=31536000; includeSubDomains` e un iframe da `js.stripe.com`.
Prova: `artifacts/security/banking/public-page.json`. Non sono stati inseriti
dati di carte, IBAN o credenziali, aperti account o eseguiti pagamenti.
Gym Tracker non contiene campi o API per acquisire/inviare carta o IBAN:
l'utente apre la pagina pubblica del provider. Dopo l'apertura, il browser
comunica con quel provider e con i servizi da esso caricati; i controlli locali
non attestano il trattamento interno dei dati né le successive transazioni.

Secondo la [privacy policy di Buy Me a Coffee](https://buymeacoffee.com/privacy-policy),
i dati della carta del sostenitore vengono trasmessi direttamente a Stripe;
Buy Me a Coffee riceve un token e informazioni limitate, fra cui tipo,
scadenza e ultime quattro cifre. I dati bancari per gli accrediti al creator
seguono un flusso distinto, con alcuni dati forniti direttamente a Stripe.
La [guida ufficiale di sicurezza Stripe](https://docs.stripe.com/security/guide)
dichiara per Stripe la certificazione PCI Service Provider Level 1.
Sono dichiarazioni dei provider: non certificano indipendentemente Buy Me a
Coffee, un account bancario o l'intero percorso di pagamento osservato.

## Backup e ricezione chat

I nuovi backup cifrati usano un envelope v2 con AES-GCM, PBKDF2-SHA256 a
600.000 iterazioni, password di 12–1.024 caratteri e metadati autenticati come
AAD. L'import conserva il supporto dei backup cifrati v1 storici; non aumenta
retroattivamente la protezione dei file già esportati. La suite Playwright
backup/chiavi passa 14 gruppi, inclusi compatibilità v1, password deboli rifiutate,
integrità, concorrenza e condivisione (`artifacts/security/backup-keys-results.json`).

La ricezione chat deduplica le buste in elaborazione e i messaggi
prima delle operazioni sulle foto. Limita il lavoro a due operazioni attive,
64 buste complessivamente in lavorazione/attesa e 4.000.000 caratteri di coda.
In caso di overflow ferma l'avanzamento del cursore di sincronizzazione e
applica attesa prima della riconnessione; accetta ACK booleani e l'identificatore
di sottoscrizione atteso. Il test Node ha ridotto venti replay concorrenti a una
sola operazione media (`artifacts/security/chat-receive-node/`). La suite
Playwright passa quattro gruppi: replay concorrenti, limiti/overflow/cursore,
annullamento al blocco e validazione di sottoscrizione/ACK
(`artifacts/security/chat-queue-results.json`).

## Scritture concorrenti e protezione dell'intero archivio

È stata riprodotta sulla v70 una race: una scrittura IndexedDB termina, la
completion della cache localStorage viene ritardata, un'altra scheda protegge
la chiave chat e la completion precedente riscrive la vecchia chiave in chiaro
nella cache. Prove: `artifacts/security/cache-race.cjs` e
`artifacts/security/cache-race-reproduced.json`. La scrittura della cache ora
confronta lo stato corrente sotto una transazione IndexedDB di lettura prima
di pubblicarlo. La regressione ripete l'interleaving e verifica chiave raw
assente in localStorage e IndexedDB e vault valido:
`artifacts/security/cache-race-fixed.json`.

In Impostazioni, **Proteggi dati** permette di cifrare l'intero archivio con una
password dell'app distinta da quella della chat. `archive-vault.js` genera una
chiave dati casuale AES-GCM 256 bit, protetta con una chiave derivata dalla
password mediante PBKDF2-SHA256 a 600.000 iterazioni; salt/IV sono casuali e i
metadati sono autenticati. La password non è persistita e la chiave dati non
viene salvata in chiaro. Sono cifrati dati, foto, copia di rollback e cache;
il timer di riposo è conservato dentro l'archivio protetto.

La configurazione richiede una password scelta dall'utente (12–1.024 caratteri):
il solo aggiornamento non abilita la protezione. La migrazione conserva identità
chat, amici e foto. Un archivio protetto richiede anche una password per il
backup esportato. Il recupero da backup conserva il precedente archivio cifrato
come copia opaca, senza doverne decifrare o scartare i dati. Le operazioni foto
mantengono l'ordine delle chiamate, così una cifratura ritardata non annulla una
cancellazione successiva.

Il blocco manuale e il ricaricamento richiedono un nuovo sblocco. Su `pagehide`
la UI viene mascherata subito, le scritture accettate vengono completate prima
di rilasciare le chiavi e il ritorno tramite `pageshow` mostra il gate password;
un errore di salvataggio mantiene la maschera con possibilità di riprovare.
I risultati di condivisioni o letture foto avviate nella sessione precedente
non possono ripristinare anteprime dopo un blocco. Le prove del ciclo di vita
usano eventi `pagehide`/`pageshow` simulati; il reload è reale, ma non è una
certificazione di ogni comportamento BFCache o sospensione del sistema operativo.

Quattordici gruppi archivio sono confermati PASS, inclusi letture foto ritardate,
uscita durante la cifratura e salvataggio fallito con recupero delle modifiche
tramite il pulsante di retry. Prove e screenshot sono in
`artifacts/security/archive-vault-results.json`, `artifacts/security/archive-setup.png`
e `artifacts/security/archive-locked.png`. Non è previsto un blocco automatico per semplice passaggio
in background o inattività. La password non è recuperabile dall'app: conservarla
e mantenere un backup utilizzabile. Aggiornare o chiudere le vecchie schede prima
della migrazione; le copie storiche esterne non vengono cifrate retroattivamente.

## Verifiche locali v71

| Verifica | Esito confermato |
| --- | --- |
| Sicurezza | 10 gruppi PASS |
| Backup e chiavi | 14 gruppi PASS |
| Vault identità chat | 12 gruppi PASS |
| Coda ricezione chat | 4 gruppi PASS |
| Framing | 6 gruppi PASS |
| Race cache tra schede | PASS, nessuna chiave raw nelle due copie |
| Archivio completo | 14 gruppi PASS |
| Aggiornamento | 70 → 71 → 72 → 73 PASS; dati/foto identici, bozza e offline preservati |
| Collegamento donazione | PASS nei percorsi specificati sopra; middle-click reale non verificato |
| Layout/regressioni donazioni | PASS su porta 8871, cinque lingue, layout, tutorial e condivisione |
| Vendor build e inventario | PASS |

La prima invocazione della regressione donazioni puntava alla porta 8765, già
occupata da un server che serviva la v62: non è una prova della v71. Il run
corretto sulla porta 8871 è terminato con PASS. Le prove locali non implicano
un deploy e non usano account o pagamenti reali.

## Dipendenze e limiti ancora aperti

Gli audit npm aggiornati dell'app e di `vendor` riportano zero vulnerabilità
note nei rispettivi inventari (`artifacts/security/npm-app-audit-latest.json`,
`artifacts/security/npm-vendor-audit-latest.json`). Questo risultato non è un
audit completo del codice, dei bundle browser o della crittografia.

NIP-44 resta senza forward secrecy: un cambio di protezione locale non può
rendere retroattivamente sicure vecchie buste cifrate dopo la compromissione
dell'identità. Una futura migrazione richiede un protocollo verificato, una
implementazione adatta al browser e compatibilità fra entrambi gli interlocutori;
non viene introdotta crittografia proprietaria. [Limiti ufficiali NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md#limitations).
Restano inoltre il rischio di XSS durante lo sblocco, i backup storici esterni
e l'assenza degli header anti-framing nella prima risposta HTTP dell'hosting.
Il gate di avvio e gli header aggiunti dal service worker mantengono i limiti
descritti nella sezione storica seguente.

# Storico: revisione sicurezza — v69 / v70 pubblicate

19 ottobre 2026. La v69 (`9897b4c`) e la v70 (`86f54f8`) sono state pubblicate
e verificate. Le ricevute separate sono in `artifacts/release-v69/` e
`artifacts/release-v70/`, con sintesi in `MEMORY.md`. Le sezioni seguenti
documentano le protezioni e le prove di quelle versioni; non sostituiscono
le verifiche della v71.

## v70: avvertenza del backup

La verifica visiva live della v69 ha rilevato un testo rimasto al comportamento
precedente: indicava che il backup JSON consentiva sempre di usare la chiave.
Nella v70 l'avvertenza distingue, in tutte e cinque le lingue, la password della
chat (chiave protetta) e la password del backup (intero file). Non cambia
crittografia, migrazione o messaggistica. La verifica Playwright dedicata
controlla testo, layout mobile, export utilizzabile e presenza del solo vault;
prove e ricevute di pubblicazione in `artifacts/release-v70/`.

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
