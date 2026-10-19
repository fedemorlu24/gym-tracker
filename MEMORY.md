## Password chat facoltativa e rilascio v75 — 19 ottobre 2026

Luca ha chiesto che la password chat resti facoltativa, con accesso semplice da telefono, poi ha richiesto la pubblicazione v75. Il setup offre “Continua senza password”; si può aggiungere la password in seguito o rimuoverla dopo unlock mantenendo la stessa identità. L’import di backup raw può proseguire senza password; esportare un backup senza password chat richiede una password distinta per il file. La protezione opzionale dell’intero archivio resta separata e protegge anche la chiave chat. Senza entrambe le protezioni, la chiave è nei dati locali dell’app.

Pubblicata su GitHub Pages il 19 ottobre 2026, commit `8e9d195596afbca74b7f4493a7c7b843a473cc7e`. Build Pages riuscito; tutti i 17 asset pubblici hanno HTTP 200 e SHA-256 corrispondente. Playwright locale: skip nel viewport 390×844 senza tastiera, aggiunta password, reload/unlock, rimozione, reload senza prompt e creazione messaggio; identità invariata. Playwright live: v75, accesso senza password e reload mantiene l’identità; scheda chat disponibile. Console, pageerror, richieste fallite, HTTP error e richieste HTTP esterne: zero. I WebSocket verso i relay Nostr sono stati intercettati e chiusi dal test; non sono stati inviati messaggi. Limiti: nessun dispositivo fisico né messaggistica reale verificati.

Primo test live tentava il selettore della schermata conversazione senza un contatto: il routing torna alla home quando manca un amico. Corretto il test usando la scheda Chat dell’interfaccia e verificata l’inbox. I relay aperti all’ingresso nella chat sono attesi; il test li ha chiusi esplicitamente.

Ricevute: `artifacts/release-v75/`. Pubblicazione e cronologia: `DEVELOPMENT.md`.


## Password dimenticata: reset chat v76 — 19 ottobre 2026

Luca ha confermato la creazione di una nuova identità perché non ricorda la password chat. v76 sostituisce nello stato locked il pulsante “Sblocca la chat” con “Crea una nuova chat senza password” e una conferma che specifica la perdita di identità, contatti, messaggi e foto-chat locali. Il reset genera chiave raw/identità nuova, azzera amici, messaggi, sync/seen/bloccati e rimuove le foto chat collegate; conserva allenamenti, impostazioni e foto non-chat. La vecchia chiave cifrata non è recuperabile senza password.

Commit app `1b591c2e794fde0832aa2df3d4ff877975dde483`, v76 pubblicata su GitHub Pages. Build PASS e 17/17 asset pubblici SHA-256 corrispondenti. Playwright locale e live (390×844): conferma annullabile senza cambi, reset effettivo, vecchia chat/foto rimosse, allenamento e foto allenamento preservati, nuova identità senza password stabile dopo reload; test sia con archivio normale sia con archivio interamente cifrato. Diagnostica live: console/pageerror/fail/HTTP/external 0; relay WebSocket intercettati e chiusi, nessun messaggio inviato. Screenshot e report in `artifacts/release-v76/`, test `tests/chat-reset.cjs`. Nessun dispositivo fisico.


## Etichetta nuova chat v77 — 19 ottobre 2026

Luca ha chiesto di cambiare il pulsante “Crea una nuova chat senza password” in “Crea una nuova chat”. Aggiornate le etichette equivalenti EN/ES/FR/DE, senza modificare la conferma né il reset (la nuova identità resta senza password). App commit `542cb54a618444861dcacc15b7501c2d71097d29`, v77 pubblicata. Playwright locale normale e archivio protetto PASS; live mobile PASS, console/pageerror/fail/HTTP/external 0, relay WebSocket intercettati. Tutti i 17 asset pubblici SHA-256 corrispondono. Nessun dispositivo fisico. Ricevute `artifacts/release-v77/`.
