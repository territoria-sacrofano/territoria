# Territoria Sacrofano · I file del sito

| File | A cosa serve |
|---|---|
| `index.html` | La struttura della pagina |
| `stile.css` | Colori, caratteri e impaginazione |
| `app.js` | Il funzionamento: legge schede, annunci e servizi dal database |
| `config.js` | Indirizzo del database, chiave pubblica, titolare ed email di contatto: **l'unico file da compilare** |
| `favicon.svg` | L'icona nella scheda del browser |
| `admin.html`, `admin.css`, `admin.js` | Il pannello amministratore |
| `font/` | I caratteri del sito (Atkinson Hyperlegible e Bricolage Grotesque, licenza SIL OFL 1.1), così il sito non chiede nulla a Google |

## I contenuti non stanno qui
Schede, annunci, servizi e segnalazioni si gestiscono dal pannello: `admin.html` (per esempio https://territoria-sacrofano.github.io/territoria/admin.html). Questi file si toccano solo per cambiare grafica o funzioni.

## Indirizzi speciali
- **QR in vetrina**: `https://INDIRIZZO-DEL-SITO/?qr=ID-SCHEDA#/a/ID-SCHEDA`
  Esempio: `?qr=lapino-miele#/a/lapino-miele`. Il pannello dati saprà quale vetrina porta visite.
- **Link da mandare su WhatsApp**: aggiungi `?da=whatsapp` prima del `#`.

## Orari autobus e pulmini
- Si cambiano dal pannello: Altro → Orari autobus. Ogni tabella è una direzione in un tipo di giorno (Lun–Ven, sabato, festivi).
- Sul sito compaiono in «Servizi utili» (prossime partenze da Sacrofano) e nella pagina `#/orari`, che sceglie da sola il giorno di oggi e riconosce le feste nazionali.
- Cambio di stagione: apri ogni tabella e usa «Incolla molti orari insieme» con «Sostituisci le corse attuali». Per creare la versione del sabato di una tabella usa «Duplica».
- I dati stanno nella tabella `orari_trasporto` (aggiornamento del database n. 3). Fonte: avviso del Comune «Trasporto pubblico: aggiornamento orari invernali», a cura dell'Ufficio Trasporto Pubblico Locale.
- Le feste del paese senza corse (il patrono, San Biagio, 3 febbraio) stanno in `config.js`, alla voce `festeLocali`.

## Privacy
- L'informativa è la pagina `#/privacy` (link nel piè di pagina). Il testo sta in `app.js`, nella funzione `paginaPrivacy`; nome ed email arrivano da `config.js`.
- Se cambi il modo in cui il sito tratta i dati (un nuovo fornitore, un nuovo modulo, statistiche diverse), aggiorna il testo e la data `PRIVACY_AGGIORNATA`.
- Le segnalazioni gestite si cancellano da sole 12 mesi dopo la gestione, ogni volta che entri nel pannello.

## Sicurezza
- In `config.js` va solo la chiave **Publishable** (`sb_publishable_...`). Mai la chiave Secret.
- Se il sito dice "non riesce a caricare le informazioni": il piano gratuito di Supabase si mette in pausa dopo 7 giorni senza visite. Entra in Supabase e riattiva il progetto.

## Pannello amministratore
- Si entra con email, password e il codice dell'app di autenticazione. Senza codice il database rifiuta ogni modifica.
- **Telefono perso o app cancellata**: in Supabase apri SQL Editor ed esegui `delete from auth.mfa_factors;`. Al prossimo accesso il pannello ti farà collegare di nuovo l'app. Poi cambia la password.
- **Copia di sicurezza**: dal pannello, Altro → Copia di sicurezza, una volta al mese. Conservala in una cartella privata: contiene consensi e segnalazioni.
- **Controllo di sicurezza**: dal pannello, Altro → Controllo di sicurezza, una volta al mese e dopo ogni modifica al database. Prova come farebbe un estraneo tutto ciò che deve essere bloccato; deve dire «Tutti i 17 controlli superati».
