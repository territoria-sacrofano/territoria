# Territoria Sacrofano · I file del sito

| File | A cosa serve |
|---|---|
| `index.html` | La struttura della pagina |
| `stile.css` | Colori, caratteri e impaginazione |
| `app.js` | Il funzionamento: legge schede, annunci e servizi dal database |
| `config.js` | Indirizzo del database e chiave pubblica: **l'unico file da compilare** |
| `favicon.svg` | L'icona nella scheda del browser |

## I contenuti non stanno qui
Schede, annunci e servizi si cambiano nel database (Supabase → Table Editor, poi dal pannello amministratore nella Fase 2). Questi file si toccano solo per cambiare grafica o funzioni.

## Indirizzi speciali
- **QR in vetrina**: `https://INDIRIZZO-DEL-SITO/?qr=ID-SCHEDA#/a/ID-SCHEDA`
  Esempio: `?qr=lapino-miele#/a/lapino-miele`. Il pannello dati saprà quale vetrina porta visite.
- **Link da mandare su WhatsApp**: aggiungi `?da=whatsapp` prima del `#`.

## Sicurezza
- In `config.js` va solo la chiave **Publishable** (`sb_publishable_...`). Mai la chiave Secret.
- Se il sito dice "non riesce a caricare le informazioni": il piano gratuito di Supabase si mette in pausa dopo 7 giorni senza visite. Entra in Supabase e riattiva il progetto.
