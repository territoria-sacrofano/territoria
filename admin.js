/* =====================================================================
   TERRITORIA SACROFANO · Pannello amministratore
   Accesso con password + codice dell'app di autenticazione.
   Tutto ciò che si vede e si modifica qui è protetto anche dal database:
   senza il codice, il database rifiuta ogni modifica.
   ===================================================================== */
(function () {
"use strict";

const CFG = window.TERRITORIA || {};
const app = document.getElementById("app");
const configurato = typeof CFG.supabaseUrl === "string" && /^https?:\/\//.test(CFG.supabaseUrl.trim())
  && typeof CFG.supabaseKey === "string" && CFG.supabaseKey.length > 20 && !/INCOLLA/.test(CFG.supabaseKey);
const BASE = configurato ? CFG.supabaseUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "") : "";
const KEY = CFG.supabaseKey;
const SITO = new URL("./", location.href).href;

/* =====================================================================
   PICCOLI AIUTI
   ===================================================================== */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
const slug = s => norm(s).replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
const righe = t => String(t || "").split("\n").map(s => s.trim()).filter(Boolean);
const paragrafi = t => String(t || "").split(/\n\s*\n/).map(s => s.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
const vuotoANull = v => { const s = String(v ?? "").trim(); return s ? s : null; };
const conHttps = u => {
  const s = String(u || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(s)) return "https://" + s;
  return s;
};
const numeroTel = t => {
  let s = String(t || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) s = "+39" + s;
  return s;
};
const soloCifre = t => String(t || "").replace(/\D/g, "");

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI_NOME = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const GIORNI_NOME = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

const oggiISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const giornoRoma = ts => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
const aggiungiGiorni = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dataBreve = iso => { if (!iso) return ""; const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${MESI[m - 1]} ${y}`; };
const dataLunga = iso => { if (!iso) return ""; const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${MESI_NOME[m - 1]} ${y}`; };
const quando = ts => ts ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)) : "";
const numero = n => new Intl.NumberFormat("it-IT").format(Math.round(n || 0));
const somma = (o, chiavi) => chiavi.reduce((t, k) => t + Number((o || {})[k] || 0), 0);
const CONTATTI = ["chiama", "whatsapp", "indicazioni", "email", "sito", "social"];

const toastEl = document.querySelector("[data-toast]");
function avvisa(t) { toastEl.textContent = t; toastEl.classList.add("visibile"); clearTimeout(avvisa.t); avvisa.t = setTimeout(() => toastEl.classList.remove("visibile"), 2600); }

function scarica(nome, contenuto, tipo) {
  const blob = new Blob([contenuto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function copia(testo) {
  try { await navigator.clipboard.writeText(testo); return true; } catch (e) { /* passo al metodo vecchio */ }
  try {
    const t = document.createElement("textarea");
    t.value = testo; t.setAttribute("readonly", ""); t.className = "sr";
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, testo.length);
    const ok = document.execCommand("copy"); t.remove(); return ok;
  } catch (e) { return false; }
}

/* =====================================================================
   SESSIONE E COLLEGAMENTO A SUPABASE
   ===================================================================== */
const CHIAVE_SESSIONE = "territoria-pannello";
let sessione = null;

function salvaSessione(s) {
  sessione = s;
  try { s ? localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(s)) : localStorage.removeItem(CHIAVE_SESSIONE); } catch (e) { /* niente */ }
}
function caricaSessione() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_SESSIONE) || "null"); } catch (e) { return null; }
}
function daRisposta(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600)
  };
}
function contenutoToken(t) {
  try { return JSON.parse(decodeURIComponent(escape(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { return {}; }
}
const livello = () => sessione ? contenutoToken(sessione.access_token).aal : null;
const emailUtente = () => sessione ? (contenutoToken(sessione.access_token).email || "") : "";

function erroreAuth(j, stato) {
  const codice = (j && (j.error_code || j.error)) || "";
  const testo = String((j && (j.msg || j.message || j.error_description)) || "").toLowerCase();
  if (stato === 429 || /rate|too many/.test(codice + testo)) return "Troppi tentativi di fila. Aspetta qualche minuto e riprova.";
  if (codice === "invalid_credentials" || /invalid login|invalid_grant/.test(codice + testo)) return "Email o password sbagliate.";
  if (/mfa.*(not_enabled|disabled)|enroll.*(not enabled|disabled)/.test(codice + testo)) return "In Supabase la verifica con codice (TOTP) è spenta: attivala in Authentication, nella sezione Multi-Factor.";
  if (/mfa_verification|totp|invalid.*code|challenge/.test(codice + testo)) return "Codice sbagliato o scaduto. Usa quello che compare adesso nell'app.";
  if (/email.*not.*confirmed/.test(testo)) return "L'account non è confermato: in Supabase spunta Auto Confirm User.";
    return "Accesso non riuscito. Riprova tra poco.";
}

async function auth(percorso, opz) {
  opz = opz || {};
  const h = { apikey: KEY, "Content-Type": "application/json" };
  if (opz.token) h.Authorization = "Bearer " + opz.token;
  let r;
  try {
    r = await fetch(BASE + "/auth/v1/" + percorso, { method: opz.method || "POST", headers: h, body: opz.body ? JSON.stringify(opz.body) : undefined });
  } catch (e) {
    throw new Error("Non riesco a collegarmi a Supabase. Controlla la connessione.");
  }
  const testo = await r.text();
  let j = null; try { j = testo ? JSON.parse(testo) : null; } catch (e) { /* niente */ }
  if (!r.ok) { const e = new Error(erroreAuth(j, r.status)); e.status = r.status; throw e; }
  return j;
}

class SessioneScaduta extends Error {}

async function token() {
  if (!sessione) throw new SessioneScaduta("sessione");
  if (sessione.expires_at - 60 < Date.now() / 1000) {
    try {
      const d = await auth("token?grant_type=refresh_token", { body: { refresh_token: sessione.refresh_token } });
      salvaSessione(daRisposta(d));
    } catch (e) {
      salvaSessione(null);
      throw new SessioneScaduta("sessione");
    }
  }
  return sessione.access_token;
}

function erroreDb(j, stato) {
  const c = j && j.code;
  if (c === "P0001") return String(j.message).replace("Registralo prima nella tabella consensi.", "Registralo nella sezione «Consenso firmato», più in basso.");
  if (c === "PGRST202" || c === "42883") return "Manca l'aggiornamento n. 2 del database: eseguilo in Supabase e riprova.";
  if (c === "23505") return "Esiste già un elemento con questo codice o indirizzo. Scegline un altro.";
  if (c === "23503") return "Non si può: questo elemento è collegato ad altri dati (per esempio attività in una categoria).";
  if (c === "23514") return "Un campo non è nel formato giusto. Controlla link (devono iniziare con https://), date e lunghezze dei testi.";
  if (c === "23502") return "Manca un campo obbligatorio.";
  if (c === "42501" || stato === 403) return (j && j.message && /amministratore/.test(j.message)) ? j.message : "Permesso negato. Esci e rientra con il codice dell'app.";
  return (j && j.message) ? "Errore del database: " + j.message : "Operazione non riuscita. Riprova.";
}

async function api(percorso, opz) {
  opz = opz || {};
  const t = await token();
  const h = Object.assign({ apikey: KEY, Authorization: "Bearer " + t }, opz.headers || {});
  if (opz.body !== undefined) h["Content-Type"] = "application/json";
  let r;
  try {
    r = await fetch(BASE + "/rest/v1/" + percorso, { method: opz.method || "GET", headers: h, body: opz.body !== undefined ? JSON.stringify(opz.body) : undefined });
  } catch (e) {
    throw new Error("Non riesco a collegarmi al database. Controlla la connessione.");
  }
  if (r.status === 401) { salvaSessione(null); throw new SessioneScaduta("sessione"); }
  const testo = await r.text();
  let j = null; try { j = testo ? JSON.parse(testo) : null; } catch (e) { /* niente */ }
  if (!r.ok) throw new Error(erroreDb(j, r.status));
  return j;
}
const leggi = p => api(p);
const rpc = (fn, args) => api("rpc/" + fn, { method: "POST", body: args || {} });
const inserisci = (tab, dati) => api(tab, { method: "POST", body: dati, headers: { Prefer: "return=representation" } });
const salvaOSostituisci = (tab, chiave, dati) => api(`${tab}?on_conflict=${chiave}`, { method: "POST", body: dati, headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
async function aggiorna(tab, filtro, dati) {
  const r = await api(`${tab}?${filtro}`, { method: "PATCH", body: dati, headers: { Prefer: "return=representation" } });
  if (!Array.isArray(r) || !r.length) throw new Error("Modifica non salvata: elemento non trovato o permesso negato.");
  return r[0];
}
const elimina = (tab, filtro) => api(`${tab}?${filtro}`, { method: "DELETE" });

/* ---------- Archivio foto ---------- */
const percorsoUrl = p => String(p).split("/").map(encodeURIComponent).join("/");
const urlFoto = f => f && f.url ? f.url : (f && f.percorso ? BASE + "/storage/v1/object/public/foto/" + percorsoUrl(f.percorso) : "");

async function chiamaArchivio(percorso, opz) {
  const t = await token();
  const h = Object.assign({ apikey: KEY, Authorization: "Bearer " + t }, opz.headers || {});
  const r = await fetch(BASE + "/storage/v1/" + percorso, { method: opz.method, headers: h, body: opz.body });
  if (r.status === 401) { salvaSessione(null); throw new SessioneScaduta("sessione"); }
  const testo = await r.text();
  let j = null; try { j = testo ? JSON.parse(testo) : null; } catch (e) { /* niente */ }
  if (!r.ok) throw new Error(opz.errore || "Operazione sull'archivio foto non riuscita.");
  return j;
}
const caricaFile = (percorso, blob) => chiamaArchivio("object/foto/" + percorsoUrl(percorso), {
  method: "POST", body: blob,
  headers: { "Content-Type": blob.type || "image/jpeg", "x-upsert": "false", "cache-control": "max-age=31536000" },
  errore: "Caricamento della foto non riuscito."
});
const cancellaFile = percorsi => percorsi.length ? chiamaArchivio("object/foto", {
  method: "DELETE", body: JSON.stringify({ prefixes: percorsi }), headers: { "Content-Type": "application/json" },
  errore: "Non sono riuscito a cancellare le foto dall'archivio."
}) : Promise.resolve();
const elencaFile = prefisso => chiamaArchivio("object/list/foto", {
  method: "POST", body: JSON.stringify({ prefix: prefisso, limit: 1000, offset: 0 }), headers: { "Content-Type": "application/json" }
});

async function caricaImmagine(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* provo l'altro modo */ }
    try { return await createImageBitmap(file); } catch (e) { /* provo l'altro modo */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
async function riduciFoto(file) {
  const img = await caricaImmagine(file);
  const larg = img.width, alt = img.height;
  const scala = Math.min(1, 1600 / Math.max(larg, alt));
  const w = Math.round(larg * scala), h = Math.round(alt * scala);
  const tela = document.createElement("canvas");
  tela.width = w; tela.height = h;
  tela.getContext("2d").drawImage(img, 0, 0, w, h);
  if (img.close) img.close();
  const blob = await new Promise((ok, ko) => tela.toBlob(b => b ? ok(b) : ko(new Error("Formato di foto non supportato.")), "image/jpeg", 0.82));
  return { blob, w, h };
}

/* =====================================================================
   SCHERMATE DI ACCESSO
   ===================================================================== */
function mostraNavigazione(si) {
  document.querySelectorAll("[data-solo-collegato]").forEach(el => { el.hidden = !si; });
  document.body.classList.toggle("collegato", si);
}

function schermataNonConfigurato() {
  mostraNavigazione(false);
  app.innerHTML = `<div class="accesso"><h1>Pannello</h1>
    <div class="errore-dati" role="alert"><h2>Manca il collegamento al database</h2>
    <p>Il file <strong>config.js</strong> non contiene ancora il Project URL e la chiave Publishable di Supabase.</p></div></div>`;
}

function schermataAccesso(messaggio) {
  mostraNavigazione(false);
  app.innerHTML = `<div class="accesso">
    <h1 tabindex="-1">Pannello</h1>
    <p class="intro">Accesso riservato all'amministratore di Territoria Sacrofano.</p>
    <form class="modulo" id="f-accesso" novalidate>
      <label class="campo"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
      <label class="campo"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit" class="invia">Accedi</button>
      <p class="esito-invio ${messaggio ? "ko" : ""}" id="esito-accesso" role="status" aria-live="polite">${esc(messaggio || "")}</p>
    </form>
    <p class="nota"><a href="${esc(SITO)}">Torna al sito</a></p>
  </div>`;
  const f = document.getElementById("f-accesso");
  f.email.focus();
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-accesso");
    const b = f.querySelector(".invia");
    if (!f.email.value.trim() || !f.password.value) { esito.className = "esito-invio ko"; esito.textContent = "Scrivi email e password."; return; }
    b.setAttribute("aria-busy", "true"); b.textContent = "Accesso in corso…";
    esito.className = "esito-invio"; esito.textContent = "";
    try {
      const d = await auth("token?grant_type=password", { body: { email: f.email.value.trim(), password: f.password.value } });
      salvaSessione(daRisposta(d));
      await dopoPassword();
    } catch (err) {
      if (!document.body.contains(esito)) return schermataAccesso(err.message);
      esito.className = "esito-invio ko"; esito.textContent = err.message;
      b.removeAttribute("aria-busy"); b.textContent = "Accedi";
    }
  });
}

async function dopoPassword() {
  const utente = await auth("user", { method: "GET", token: await token() });
  const fattori = (utente.factors || []).filter(f => f.factor_type === "totp");
  const buono = fattori.find(f => f.status === "verified");
  if (buono) return schermataCodice(buono.id);
  for (const f of fattori) {
    try { await auth("factors/" + f.id, { method: "DELETE", token: await token() }); } catch (e) { /* niente */ }
  }
  return schermataNuovoCodice();
}

function moduloCodice(id, testoBottone) {
  return `<form class="modulo" id="${id}" novalidate>
    <label class="campo"><span>Codice di 6 cifre</span>
      <input name="codice" class="codice-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" required>
    </label>
    <button type="submit" class="invia">${esc(testoBottone)}</button>
    <p class="esito-invio" id="esito-codice" role="status" aria-live="polite"></p>
  </form>`;
}

async function verificaCodice(idFattore, codice) {
  const sfida = await auth(`factors/${idFattore}/challenge`, { token: await token(), body: {} });
  const d = await auth(`factors/${idFattore}/verify`, { token: await token(), body: { challenge_id: sfida.id, code: codice } });
  salvaSessione(daRisposta(d));
}

function collegaModuloCodice(idModulo, idFattore, testoBottone) {
  const f = document.getElementById(idModulo);
  f.codice.focus();
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-codice");
    const b = f.querySelector(".invia");
    const codice = soloCifre(f.codice.value);
    if (codice.length !== 6) { esito.className = "esito-invio ko"; esito.textContent = "Il codice ha 6 cifre."; return; }
    b.setAttribute("aria-busy", "true"); b.textContent = "Verifica…";
    try {
      await verificaCodice(idFattore, codice);
      await entraSeAmministratore();
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("Sessione scaduta. Accedi di nuovo.");
      esito.className = "esito-invio ko"; esito.textContent = err.message;
      b.removeAttribute("aria-busy"); b.textContent = testoBottone;
      f.codice.select();
    }
  });
}

function schermataCodice(idFattore) {
  app.innerHTML = `<div class="accesso">
    <h1 tabindex="-1">Codice</h1>
    <p class="intro">Apri l'app di autenticazione sul telefono e scrivi il codice di Territoria.</p>
    ${moduloCodice("f-codice", "Entra")}
    <p class="nota"><button type="button" class="bottone piccolo" id="annulla">Annulla</button></p>
  </div>`;
  collegaModuloCodice("f-codice", idFattore, "Entra");
  document.getElementById("annulla").addEventListener("click", esci);
}

async function schermataNuovoCodice() {
  app.innerHTML = `<div class="accesso"><h1>Codice</h1><p class="caricamento">Preparo il codice…</p></div>`;
  const d = await auth("factors", { token: await token(), body: { factor_type: "totp", friendly_name: "Territoria " + oggiISO(), issuer: "Territoria Sacrofano" } });
  const qr = String(d.totp.qr_code || "");
  const qrUrl = qr.startsWith("data:") ? qr : "data:image/svg+xml;utf-8," + encodeURIComponent(qr);
  app.innerHTML = `<div class="accesso">
    <h1 tabindex="-1">Collega l'app</h1>
    <p class="intro">Primo accesso: collega l'app di autenticazione. Da ora in poi, oltre alla password, servirà il codice che compare lì.</p>
    <ol class="passi">
      <li>Nell'app premi <b>+</b> e scegli di inquadrare un codice QR.</li>
      <li>Inquadra questo codice.</li>
      <li>Scrivi qui sotto le 6 cifre che compaiono nell'app.</li>
    </ol>
    <div class="qr"><img id="qr-img" alt="Codice QR da inquadrare con l'app di autenticazione" width="200" height="200"></div>
    <p class="nota">Stai usando questo telefono e non puoi inquadrare? Nell'app scegli "Inserisci chiave" e copia questa:</p>
    <p class="segreto">${esc(d.totp.secret || "")}</p>
    ${moduloCodice("f-nuovo-codice", "Collega e entra")}
  </div>`;
  document.getElementById("qr-img").src = qrUrl;
  collegaModuloCodice("f-nuovo-codice", d.id, "Collega e entra");
}

async function entraSeAmministratore() {
  const io = await rpc("chi_sono");
  if (!io || !io.amministratore) {
    mostraNavigazione(false);
    app.innerHTML = `<div class="accesso"><h1 tabindex="-1">Accesso negato</h1>
      <div class="errore-dati" role="alert"><h2>Questo account non è amministratore</h2>
      <p>L'accesso è riuscito, ma il database non riconosce questo account come amministratore. Controlla di aver eseguito l'aggiornamento n. 2 del database.</p>
      <button type="button" class="bottone" id="esci-negato">Esci</button></div></div>`;
    document.getElementById("esci-negato").addEventListener("click", esci);
    return;
  }
  await entra();
}

async function esci() {
  try { if (sessione) await auth("logout", { token: sessione.access_token }); } catch (e) { /* niente */ }
  salvaSessione(null);
  sporco = false;
  history.replaceState(null, "", location.pathname);
  schermataAccesso();
}

/* =====================================================================
   DATI CONDIVISI DEL PANNELLO
   ===================================================================== */
let CATEGORIE = [];
let ETICHETTE = [];
async function caricaElenchi() {
  [CATEGORIE, ETICHETTE] = await Promise.all([
    leggi("categorie?select=*&order=ordine.asc,nome.asc"),
    leggi("etichette?select=*&order=ordine.asc,nome.asc")
  ]);
}
async function aggiornaPallino() {
  try {
    const s = await rpc("stato_sistema");
    document.querySelectorAll("[data-conta-segnalazioni]").forEach(el => {
      el.textContent = s.segnalazioni_nuove;
      el.hidden = !s.segnalazioni_nuove;
    });
  } catch (e) { /* non è grave */ }
}

/* =====================================================================
   NAVIGAZIONE
   ===================================================================== */
let sporco = false;
let hashCorrente = location.hash;
let ignoraProssimo = false;

function segnaSporco() { sporco = true; }

window.addEventListener("hashchange", () => {
  if (ignoraProssimo) { ignoraProssimo = false; return; }
  if (sporco && !confirm("Hai modifiche non salvate. Vuoi uscire senza salvare?")) {
    ignoraProssimo = true;
    location.hash = hashCorrente;
    return;
  }
  sporco = false;
  hashCorrente = location.hash;
  if (sessione && livello() === "aal2" && document.body.classList.contains("collegato")) mostra();
});
window.addEventListener("beforeunload", e => { if (sporco) { e.preventDefault(); e.returnValue = ""; } });

function vaiA(hash) {
  sporco = false;
  if (location.hash === hash) { mostra(); return; }
  hashCorrente = hash;
  ignoraProssimo = true;
  location.hash = hash;
  mostra();
}

function leggiHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [percorso, qs] = h.split("?");
  return { parti: percorso.split("/").filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || "") };
}

async function mostra() {
  const { parti, q } = leggiHash();
  const r = parti[0] || "";
  const sezioni = { "": "", attivita: "attivita", bacheca: "bacheca", segnalazioni: "segnalazioni", altro: "altro", servizi: "altro", categorie: "altro", etichette: "altro", esporta: "altro", sicurezza: "altro", orari: "altro" };
  const sez = sezioni[r] ?? "";
  document.querySelectorAll("[data-nav]").forEach(a => {
    if (a.dataset.nav === sez) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  app.innerHTML = `<p class="caricamento" role="status">Caricamento…</p>`;
  window.scrollTo(0, 0);
  if (r !== "") aggiornaPallino();
  try {
    if (r === "") await paginaRiepilogo(q);
    else if (r === "attivita" && parti[1]) await paginaModificaAttivita(parti[1]);
    else if (r === "attivita") await paginaAttivita(q);
    else if (r === "bacheca" && parti[1]) await paginaModificaAnnuncio(parti[1]);
    else if (r === "bacheca") await paginaBacheca(q);
    else if (r === "segnalazioni") await paginaSegnalazioni(q);
    else if (r === "servizi" && parti[1]) await paginaModificaServizio(parti[1]);
    else if (r === "servizi") await paginaServizi();
    else if (r === "orari" && parti[1]) await paginaModificaOrario(parti[1], q);
    else if (r === "orari") await paginaOrariAdmin();
    else if (r === "categorie" && parti[1]) await paginaModificaCategoria(parti[1]);
    else if (r === "etichette" && parti[1]) await paginaModificaEtichetta(parti[1]);
    else if (r === "categorie") await paginaCategorie();
    else if (r === "esporta") await paginaEsporta();
    else if (r === "sicurezza") await paginaSicurezza();
    else if (r === "altro") paginaAltro();
    else app.innerHTML = `<h1 class="titolo-pagina" tabindex="-1">Pagina non trovata</h1><p><a class="bottone" href="#/">Torna al riepilogo</a></p>`;
    document.title = (app.querySelector("h1")?.textContent || "Pannello") + " | Territoria";
    const h1 = app.querySelector("h1"); if (h1) h1.focus({ preventScroll: true });
  } catch (err) {
    if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
    app.innerHTML = `<div class="errore-dati" role="alert"><h2>Qualcosa non ha funzionato</h2><p>${esc(err.message)}</p>
      <button type="button" class="bottone" id="riprova">Riprova</button></div>`;
    document.getElementById("riprova").addEventListener("click", mostra);
  }
}

/* =====================================================================
   RIEPILOGO (pannello dati)
   ===================================================================== */
const NOMI_PROVENIENZA = { qr: "QR in vetrina", whatsapp: "WhatsApp", google: "Google", social: "Social", diretto: "Diretto o link salvato", altro: "Altri siti" };

function confronto(ora, prima, giorni) {
  if (!prima && !ora) return "come i " + giorni + " giorni prima";
  if (!prima) return "nei " + giorni + " giorni prima: 0";
  const p = Math.round((ora - prima) / prima * 100);
  return (p > 0 ? "+" : "") + p + "% sui " + giorni + " giorni prima";
}

function barre(valori, etichette, descrizione) {
  const max = Math.max(1, ...valori);
  return `<div class="barre" role="group" aria-label="${esc(descrizione)}">${valori.map((v, i) =>
    `<button type="button" class="barra" data-h="${(v / max * 100).toFixed(1)}" data-valore="${esc(etichette[i] + ": " + numero(v))}" aria-label="${esc(etichette[i] + ": " + numero(v))}"></button>`).join("")}</div>`;
}
function applicaMisure(radice) {
  radice.querySelectorAll("[data-h]").forEach(el => { el.style.height = Math.max(Number(el.dataset.h), 1.5) + "%"; });
  radice.querySelectorAll("[data-w]").forEach(el => { el.style.width = el.dataset.w + "%"; });
}
function quote(oggetto, nomi, totale) {
  const voci = Object.entries(oggetto || {}).sort((a, b) => b[1] - a[1]);
  if (!voci.length) return `<p class="nota">Ancora nessun dato in questo periodo.</p>`;
  return `<ul class="quote">${voci.map(([k, v]) => {
    const p = totale ? v / totale * 100 : 0;
    return `<li class="quota"><span>${esc(nomi(k))}</span><b>${numero(v)} · ${Math.round(p)}%</b><span class="quota-barra" aria-hidden="true"><span data-w="${p.toFixed(1)}"></span></span></li>`;
  }).join("")}</ul>`;
}

async function paginaRiepilogo(q) {
  const giorni = [7, 30, 90].includes(Number(q.get("giorni"))) ? Number(q.get("giorni")) : 30;
  const al = oggiISO(), dal = aggiungiGiorni(al, -(giorni - 1));
  const alPrima = aggiungiGiorni(dal, -1), dalPrima = aggiungiGiorni(alPrima, -(giorni - 1));
  const [r, rp, stato, att, ann, ctrl, orari] = await Promise.all([
    rpc("riepilogo_statistiche", { dal, al }),
    rpc("riepilogo_statistiche", { dal: dalPrima, al: alPrima }),
    rpc("stato_sistema"),
    leggi("attivita?select=id,nome,stato,esempio"),
    leggi(`annunci?select=id&pubblicato=is.true&scadenza=gte.${al}`),
    leggi("impostazioni?chiave=eq.ultimo_controllo&select=valore"),
    leggi("orari_trasporto?select=valido_al,pubblicato").catch(e => { if (e instanceof SessioneScaduta) throw e; return null; })
  ]);
  const orariScaduti = orari ? orari.filter(t => t.pubblicato && t.valido_al && t.valido_al < oggiISO()).length : 0;
  const vistiOrari = Number(r.eventi.orari || 0);
  const ultimoCtrl = ctrl[0] && ctrl[0].valore;
  const giorniCtrl = ultimoCtrl ? Math.floor((Date.now() - new Date(ultimoCtrl.quando).getTime()) / 86400000) : null;
  const nomeDi = id => (att.find(a => a.id === id) || {}).nome || id;
  const visite = Number(r.eventi.visita || 0), visitePrima = Number(rp.eventi.visita || 0);
  const contatti = somma(r.eventi, CONTATTI), contattiPrima = somma(rp.eventi, CONTATTI);
  const pubblicate = att.filter(a => a.stato === "pubblicata" && !a.esempio).length;
  const prova = att.filter(a => a.stato === "pubblicata" && a.esempio).length;

  const perGiorno = [1, 2, 3, 4, 5, 6, 7].map(g => Number(r.visite_per_giorno_settimana[g] || 0));
  const perOra = Array.from({ length: 24 }, (_, h) => Number(r.visite_per_ora[h] || 0));
  const giornoTop = perGiorno.some(v => v) ? GIORNI_NOME[perGiorno.indexOf(Math.max(...perGiorno))] : "";
  const oraTop = perOra.some(v => v) ? perOra.indexOf(Math.max(...perOra)) : -1;

  const schede = Object.entries(r.attivita || {}).map(([id, e]) => ({ id, visite: Number(e.scheda || 0), contatti: somma(e, CONTATTI) }))
    .sort((a, b) => b.visite - a.visite || b.contatti - a.contatti).slice(0, 10);
  const giorniCopia = stato.ultima_copia ? Math.floor((Date.now() - new Date(stato.ultima_copia).getTime()) / 86400000) : null;
  const mb = stato.spazio_usato / 1048576;

  const chip = n => `<a class="chip" href="#/?giorni=${n}"${n === giorni ? ' aria-current="true"' : ""}>Ultimi ${n} giorni</a>`;

  app.innerHTML = `
  <h1 class="titolo-pagina" tabindex="-1">Riepilogo</h1>
  <div class="filtri periodo" role="group" aria-label="Periodo">${chip(7)}${chip(30)}${chip(90)}</div>

  <div class="tessere">
    <div class="tessera"><p class="etichetta">Visite al sito</p><p class="numero">${numero(visite)}</p><p class="confronto">${esc(confronto(visite, visitePrima, giorni))}</p></div>
    <div class="tessera"><p class="etichetta">Contatti alle attività</p><p class="numero">${numero(contatti)}</p><p class="confronto">${esc(confronto(contatti, contattiPrima, giorni))}</p></div>
    <div class="tessera"><p class="etichetta">Attività pubblicate</p><p class="numero">${numero(pubblicate)}</p><p class="confronto">${prova ? `più ${prova} di prova` : "&nbsp;"}</p></div>
    <div class="tessera"><p class="etichetta">Annunci in bacheca</p><p class="numero">${numero(ann.length)}</p><p class="confronto">attivi oggi</p></div>
  </div>

  <div class="pannelli">
    <section class="pannello" aria-labelledby="p-da-fare">
      <h2 id="p-da-fare">Da fare</h2>
      <ul class="da-fare">
        <li><span>Segnalazioni da gestire</span>${stato.segnalazioni_nuove ? `<a href="#/segnalazioni">${numero(stato.segnalazioni_nuove)}</a>` : "<span>nessuna</span>"}</li>
        <li><span>Schede ferme da più di 90 giorni</span>${stato.schede_ferme ? `<a href="#/attivita?filtro=ferme">${numero(stato.schede_ferme)}</a>` : "<span>nessuna</span>"}</li>
        <li><span>Ultima copia di sicurezza</span>${giorniCopia === null ? `<a href="#/esporta">mai fatta</a>` : giorniCopia > 30 ? `<a href="#/esporta">${giorniCopia} giorni fa</a>` : `<span>${giorniCopia === 0 ? "oggi" : giorniCopia + " giorni fa"}</span>`}</li>
        <li><span>Controllo di sicurezza</span>${giorniCtrl === null ? `<a href="#/sicurezza">mai fatto</a>` : (giorniCtrl > 30 || ultimoCtrl.esito !== "tutto superato") ? `<a href="#/sicurezza">${giorniCtrl === 0 ? "oggi" : giorniCtrl + " giorni fa"}${ultimoCtrl.esito !== "tutto superato" ? ", da rivedere" : ""}</a>` : `<span>${giorniCtrl === 0 ? "oggi" : giorniCtrl + " giorni fa"}, superato</span>`}</li>
        <li><span>Orari autobus</span>${!orari ? `<a href="#/orari">da attivare</a>` : orariScaduti ? `<a href="#/orari">${orariScaduti} ${orariScaduti === 1 ? "tabella scaduta" : "tabelle scadute"}</a>` : !orari.length ? `<a href="#/orari">nessuna tabella</a>` : `<span>consultati ${numero(vistiOrari)} ${vistiOrari === 1 ? "volta" : "volte"}</span>`}</li>
        <li><span>Spazio usato nel database</span><span>${mb.toFixed(1).replace(".", ",")} MB di 500 MB</span></li>
      </ul>
    </section>

    <section class="pannello" aria-labelledby="p-quando">
      <h2 id="p-quando">Quando viene usato</h2>
      ${visite ? `${barre(perGiorno, GIORNI_NOME, "Visite per giorno della settimana")}
        <div class="assi" aria-hidden="true">${GIORNI.map(g => `<span>${g}</span>`).join("")}</div>
        <p class="nota">Giorno più frequentato: <b>${esc(giornoTop.toLowerCase())}</b>. Ora di punta: <b>${oraTop}–${oraTop + 1}</b>.</p>`
      : `<p class="nota">Ancora nessuna visita in questo periodo.</p>`}
    </section>

    <section class="pannello" aria-labelledby="p-ore">
      <h2 id="p-ore">Ore del giorno</h2>
      ${visite ? `${barre(perOra, perOra.map((_, h) => `Ore ${h}–${h + 1}`), "Visite per ora del giorno")}
        <div class="assi" aria-hidden="true">${perOra.map((_, h) => `<span>${h % 6 === 0 ? h : ""}</span>`).join("")}</div>`
      : `<p class="nota">Ancora nessuna visita in questo periodo.</p>`}
    </section>

    <section class="pannello" aria-labelledby="p-prov">
      <h2 id="p-prov">Da dove arrivano</h2>
      ${quote(r.provenienza, k => NOMI_PROVENIENZA[k] || k, visite)}
    </section>

    <section class="pannello" aria-labelledby="p-schede">
      <h2 id="p-schede">Schede più viste</h2>
      ${schede.length ? `<ul class="da-fare">${schede.map(s => `<li><a href="#/attivita/${encodeURIComponent(s.id)}">${esc(nomeDi(s.id))}</a><span>${numero(s.visite)} ${s.visite === 1 ? "visita" : "visite"} · ${numero(s.contatti)} ${s.contatti === 1 ? "contatto" : "contatti"}</span></li>`).join("")}</ul>`
      : `<p class="nota">Ancora nessuna scheda vista in questo periodo.</p>`}
    </section>

    <section class="pannello" aria-labelledby="p-qr">
      <h2 id="p-qr">QR in vetrina</h2>
      ${quote(r.qr, nomeDi, Number((r.provenienza || {}).qr || 0))}
    </section>

    <section class="pannello" aria-labelledby="p-ricerche">
      <h2 id="p-ricerche">Cercato ma non trovato</h2>
      ${r.ricerche_vuote.length ? `<ul class="da-fare">${r.ricerche_vuote.map(x => `<li><span>${esc(x.testo)}</span><span>${numero(x.volte)} ${x.volte === 1 ? "volta" : "volte"}</span></li>`).join("")}</ul>
        <p class="nota">Sono le cose che a Sacrofano qualcuno cerca e sul sito non trova.</p>`
      : `<p class="nota">Nessuna ricerca senza risultati in questo periodo.</p>`}
    </section>
  </div>`;
  applicaMisure(app);
  document.querySelectorAll("[data-conta-segnalazioni]").forEach(el => { el.textContent = stato.segnalazioni_nuove; el.hidden = !stato.segnalazioni_nuove; });
}

/* =====================================================================
   ATTIVITÀ: ELENCO
   ===================================================================== */
const STATI = { pubblicata: ["Pubblicata", "verde"], bozza: ["Bozza", "giallo"], nascosta: ["Nascosta", ""] };

async function paginaAttivita(q) {
  const [lista, consensi] = await Promise.all([
    leggi("attivita?select=id,nome,stato,esempio,categoria,sottocategoria,aggiornato_il,in_evidenza&order=nome.asc"),
    leggi("consensi?select=attivita_id,data_firma,pubblicazione,revocato_il")
  ]);
  const consensoDi = id => consensi.find(c => c.attivita_id === id);
  const consensoValido = a => { const c = consensoDi(a.id); return c && c.pubblicazione && !c.revocato_il; };
  const limite90 = Date.now() - 90 * 86400000;
  const FILTRI = {
    tutte: ["Tutte", () => true],
    pubblicate: ["Pubblicate", a => a.stato === "pubblicata"],
    bozze: ["Bozze", a => a.stato === "bozza"],
    nascoste: ["Nascoste", a => a.stato === "nascosta"],
    consenso: ["Senza consenso", a => !a.esempio && !consensoValido(a)],
    ferme: ["Ferme da 90 giorni", a => a.stato === "pubblicata" && !a.esempio && new Date(a.aggiornato_il).getTime() < limite90]
  };
  let filtro = FILTRI[q.get("filtro")] ? q.get("filtro") : "tutte";
  let cerca = "";

  app.innerHTML = `
  <div class="capo"><h1 class="titolo-pagina" tabindex="-1">Attività</h1>
    <div class="capo-azioni"><a class="primario" href="#/attivita/nuova">+ Nuova attività</a></div></div>
  <div class="cerca-admin"><label class="sr" for="cerca-att">Cerca per nome</label><input id="cerca-att" type="search" placeholder="Cerca per nome" autocomplete="off"></div>
  <div class="filtri" role="group" aria-label="Filtra">${Object.entries(FILTRI).map(([k, [t]]) => `<button type="button" class="chip" data-filtro="${k}" aria-pressed="${k === filtro}">${t}</button>`).join("")}</div>
  <p class="conteggio" id="conteggio" aria-live="polite"></p>
  <ul class="elenco" id="elenco-att"></ul>`;

  const disegna = () => {
    const parole = norm(cerca).split(/\s+/).filter(Boolean);
    const vis = lista.filter(FILTRI[filtro][1]).filter(a => parole.every(p => norm(a.nome + " " + a.id).includes(p)));
    document.getElementById("conteggio").textContent = vis.length === 1 ? "1 attività" : `${vis.length} attività`;
    document.getElementById("elenco-att").innerHTML = vis.length ? vis.map(a => {
      const [st, col] = STATI[a.stato] || [a.stato, ""];
      const cat = CATEGORIE.find(c => c.id === a.categoria);
      const c = consensoDi(a.id);
      const consenso = a.esempio ? `<span class="badge">Di prova</span>`
        : c && c.revocato_il ? `<span class="badge rosso">Consenso revocato</span>`
        : c && c.pubblicazione ? `<span class="badge verde">Consenso</span>`
        : `<span class="badge rosso">Manca consenso</span>`;
      return `<li><a class="riga" href="#/attivita/${encodeURIComponent(a.id)}">
        <span><strong>${esc(a.nome)}</strong><span class="sotto">${esc(a.sottocategoria || cat?.nome || a.categoria)} · aggiornata il ${dataBreve(giornoRoma(a.aggiornato_il))}</span></span>
        <span class="badges"><span class="badge ${col}">${st}</span>${consenso}${a.in_evidenza ? `<span class="badge giallo">In evidenza</span>` : ""}</span>
      </a></li>`;
    }).join("") : `<li class="vuoto-admin">Nessuna attività con questi filtri.</li>`;
  };
  disegna();
  document.getElementById("cerca-att").addEventListener("input", e => { cerca = e.target.value; disegna(); });
  app.querySelectorAll("[data-filtro]").forEach(b => b.addEventListener("click", () => {
    filtro = b.dataset.filtro;
    app.querySelectorAll("[data-filtro]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    disegna();
  }));
}

/* =====================================================================
   ATTIVITÀ: MODIFICA
   ===================================================================== */
const RETI = [["facebook", "Facebook"], ["instagram", "Instagram"], ["altro", "Altro"]];

function rigaProdotto(p) {
  return `<div class="ripetibile-riga" data-prodotto>
    <div class="campi">
      <label class="campo"><span>Prodotto o servizio</span><input data-p="nome" value="${esc(p.nome || "")}" maxlength="80"></label>
      <label class="campo"><span>Breve descrizione</span><input data-p="dettaglio" value="${esc(p.dettaglio || "")}" maxlength="200"></label>
    </div>
    <button type="button" class="togli" data-togli aria-label="Togli questo prodotto">Togli</button>
  </div>`;
}
function rigaSocial(s) {
  return `<div class="ripetibile-riga" data-social>
    <div class="campi">
      <label class="campo"><span>Rete</span><select data-s="rete">${RETI.map(([v, t]) => `<option value="${v}"${(s.rete || "facebook") === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="campo"><span>Link alla pagina</span><input data-s="url" value="${esc(s.url || "")}" placeholder="https://www.facebook.com/..." inputmode="url"></label>
    </div>
    <button type="button" class="togli" data-togli aria-label="Togli questo social">Togli</button>
  </div>`;
}
function editorOrari(orari) {
  return `<div class="orari-griglia">${GIORNI.map((g, i) => {
    const f = (orari && orari[g]) || [];
    const aperto = f.length > 0;
    const v = (k, j) => (f[k] && f[k][j]) || "";
    return `<div class="orario" data-giorno="${g}">
      <label class="spunta"><input type="checkbox" data-aperto${aperto ? " checked" : ""}><b>${GIORNI_NOME[i]}</b></label>
      <div class="orario-fasce"${aperto ? "" : " hidden"} data-fasce>
        <div class="fascia"><input type="time" data-o="0-0" value="${v(0, 0)}" aria-label="${GIORNI_NOME[i]}, apre"> – <input type="time" data-o="0-1" value="${v(0, 1)}" aria-label="${GIORNI_NOME[i]}, chiude"></div>
        <div class="fascia"><input type="time" data-o="1-0" value="${v(1, 0)}" aria-label="${GIORNI_NOME[i]}, riapre (facoltativo)"> – <input type="time" data-o="1-1" value="${v(1, 1)}" aria-label="${GIORNI_NOME[i]}, chiude di nuovo (facoltativo)"></div>
      </div>
    </div>`;
  }).join("")}</div>`;
}
function leggiOrari(radice) {
  const orari = {};
  let errore = "";
  radice.querySelectorAll("[data-giorno]").forEach(r => {
    const g = r.dataset.giorno;
    orari[g] = [];
    if (!r.querySelector("[data-aperto]").checked) return;
    [0, 1].forEach(k => {
      const a = r.querySelector(`[data-o="${k}-0"]`).value, c = r.querySelector(`[data-o="${k}-1"]`).value;
      if (!a && !c) return;
      if (!a || !c || a >= c) { errore = `Controlla gli orari di ${GIORNI_NOME[GIORNI.indexOf(g)].toLowerCase()}: ogni fascia deve avere apertura e chiusura, nell'ordine giusto.`; return; }
      orari[g].push([a, c]);
    });
  });
  return { orari, errore };
}

async function paginaModificaAttivita(id) {
  const nuova = id === "nuova";
  let a, consenso = null;
  if (nuova) {
    a = { id: "", nome: "", categoria: CATEGORIE[0]?.id || "", stato: "bozza", tipo: "interna", social: [], prodotti: [], acquisto: [], pagamenti: [], etichette: [], storia: [], riconoscimenti: [], galleria: [], orari: null };
  } else {
    const [righeA, righeC] = await Promise.all([
      leggi(`attivita?id=eq.${encodeURIComponent(id)}&select=*`),
      leggi(`consensi?attivita_id=eq.${encodeURIComponent(id)}&select=*`)
    ]);
    if (!righeA.length) { app.innerHTML = `<h1 class="titolo-pagina" tabindex="-1">Attività non trovata</h1><p><a class="bottone" href="#/attivita">Torna all'elenco</a></p>`; return; }
    a = righeA[0]; consenso = righeC[0] || null;
  }
  let galleria = (Array.isArray(a.galleria) ? a.galleria : []).map(f => Object.assign({}, f));
  const daCancellare = [];
  const cat = CATEGORIE.find(c => c.id === a.categoria);
  const telVisibile = a.telefono_visibile || a.telefono || "";

  app.innerHTML = `
  <a class="indietro-admin" href="#/attivita">‹ Attività</a>
  <div class="capo"><h1 class="titolo-pagina" tabindex="-1">${nuova ? "Nuova attività" : esc(a.nome)}</h1>
    ${nuova || a.esempio ? "" : `<div class="capo-azioni"><button type="button" class="bottone" id="apri-resoconto">Resoconto del mese</button></div>`}</div>
  ${nuova ? "" : `<p class="indirizzo-scheda">${esc(SITO)}#/a/${esc(a.id)}</p>`}

  <form class="modifica" id="f-att" novalidate>
    <section class="gruppo-campi" aria-labelledby="g-base"><h2 id="g-base">La scheda</h2>
      <div class="campi">
        <label class="campo"><span>Nome dell'attività</span><input name="nome" value="${esc(a.nome)}" maxlength="80" required></label>
        ${nuova ? `<label class="campo"><span>Indirizzo della scheda</span><small>Si crea dal nome. Dopo il salvataggio non si cambia più, perché finisce nei QR code.</small><input name="indirizzo_scheda" value="" maxlength="60" pattern="[a-z0-9-]+" autocapitalize="off" spellcheck="false"></label>` : ""}
        <div class="campi due">
          <label class="campo"><span>Categoria</span><select name="categoria">${CATEGORIE.map(c => `<option value="${esc(c.id)}"${c.id === a.categoria ? " selected" : ""}>${esc(c.icona)} ${esc(c.nome)}</option>`).join("")}</select></label>
          <label class="campo"><span>Tipo di attività</span><input name="sottocategoria" list="sottocat" value="${esc(a.sottocategoria || "")}" maxlength="60" placeholder="Es. Apicoltura"></label>
        </div>
        <datalist id="sottocat">${(cat?.sottocategorie || []).map(s => `<option value="${esc(s)}">`).join("")}</datalist>
        <div class="campi due">
          <label class="campo"><span>Zona</span><input name="zona" value="${esc(a.zona || "")}" maxlength="60" placeholder="Es. Centro"></label>
          <label class="campo"><span>Icona (facoltativa)</span><input name="icona" value="${esc(a.icona || "")}" maxlength="8" placeholder="Es. 🧀"></label>
        </div>
        <label class="campo"><span>Descrizione breve</span><small>Una frase, al massimo 200 caratteri. Compare negli elenchi.</small><textarea name="descrizione_breve" maxlength="200" rows="3">${esc(a.descrizione_breve || "")}</textarea></label>
      </div>
    </section>

    <section class="gruppo-campi" aria-labelledby="g-vis"><h2 id="g-vis">Visibilità</h2>
      <div class="campi">
        <label class="campo"><span>Stato</span><select name="stato">
          <option value="bozza"${a.stato === "bozza" ? " selected" : ""}>Bozza: la vedi solo tu</option>
          <option value="pubblicata"${a.stato === "pubblicata" ? " selected" : ""}>Pubblicata: visibile a tutti</option>
          <option value="nascosta"${a.stato === "nascosta" ? " selected" : ""}>Nascosta: tolta dal sito</option>
        </select><small>Per pubblicare serve il consenso firmato, più sotto.</small></label>
        <div class="spunte">
          <label class="spunta"><input type="checkbox" name="in_evidenza"${a.in_evidenza ? " checked" : ""}><span><b>In evidenza</b><small>Compare in grande nella pagina iniziale.</small></span></label>
          <label class="spunta"><input type="checkbox" name="esempio"${a.esempio ? " checked" : ""}><span><b>Scheda di prova</b><small>Inventata, per provare il sito: i contatti non funzionano.</small></span></label>
        </div>
      </div>
    </section>

    <section class="gruppo-campi" aria-labelledby="g-contatti"><h2 id="g-contatti">Contatti</h2>
      <div class="campi">
        <label class="campo"><span>Indirizzo</span><input name="indirizzo" value="${esc(a.indirizzo || "")}" maxlength="140" placeholder="Via, numero, 00060 Sacrofano (RM)"></label>
        <div class="campi due">
          <label class="campo"><span>Telefono</span><input name="telefono" value="${esc(telVisibile)}" inputmode="tel" maxlength="30" placeholder="329 123 4567"></label>
          <label class="campo"><span>WhatsApp</span><small>Solo se diverso o se lo usa</small><input name="whatsapp" value="${esc(a.whatsapp || "")}" inputmode="tel" maxlength="30"></label>
        </div>
        <div class="campi due">
          <label class="campo"><span>Email</span><input name="email" type="email" value="${esc(a.email || "")}" maxlength="120" autocapitalize="off"></label>
          <label class="campo"><span>Sito web</span><input name="sito" value="${esc(a.sito || "")}" inputmode="url" maxlength="200" placeholder="https://..."></label>
        </div>
        <div class="ripetibile" id="social">${(a.social || []).map(rigaSocial).join("")}</div>
        <button type="button" class="bottone piccolo aggiungi" id="aggiungi-social">+ Aggiungi pagina social</button>
        <label class="spunta"><input type="checkbox" name="esterna"${a.tipo === "esterna" ? " checked" : ""}><span><b>È un servizio esterno</b><small>La scheda rimanda a un altro sito (es. un servizio online).</small></span></label>
        <label class="campo" id="campo-esterno"${a.tipo === "esterna" ? "" : " hidden"}><span>Link del servizio esterno</span><input name="link_esterno" value="${esc(a.link_esterno || "")}" inputmode="url" placeholder="https://..."></label>
      </div>
    </section>

    <section class="gruppo-campi" aria-labelledby="g-orari"><h2 id="g-orari">Orari</h2>
      <p class="nota">Spunta i giorni di apertura. La seconda fascia serve solo se chiude a pranzo.</p>
      ${editorOrari(a.orari)}
      <label class="spunta"><input type="checkbox" name="senza_orari"${a.orari ? "" : " checked"}><span><b>Nessun orario fisso</b><small>Per chi lavora su appuntamento: il sito non mostra "aperto/chiuso".</small></span></label>
      <h3 class="sottotitolo">Chiusura straordinaria (ferie, lavori…)</h3>
      <div class="campi due">
        <label class="campo"><span>Chiuso dal</span><input type="date" name="chiusura_dal" value="${esc(a.chiusura_dal || "")}"></label>
        <label class="campo"><span>Fino al</span><input type="date" name="chiusura_al" value="${esc(a.chiusura_al || "")}"></label>
      </div>
      <label class="campo"><span>Motivo (facoltativo)</span><input name="chiusura_nota" value="${esc(a.chiusura_nota || "")}" maxlength="80" placeholder="Es. ferie"></label>
    </section>

    <section class="gruppo-campi" aria-labelledby="g-offre"><h2 id="g-offre">Cosa offre</h2>
      <div class="ripetibile" id="prodotti">${(a.prodotti || []).map(rigaProdotto).join("")}</div>
      <button type="button" class="bottone piccolo aggiungi" id="aggiungi-prodotto">+ Aggiungi prodotto o servizio</button>
      <div class="campi">
        <label class="campo"><span>Come si acquista</span><small>Una voce per riga. Es. "In bottega", "Consegna a domicilio".</small><textarea name="acquisto" rows="3">${esc((a.acquisto || []).join("\n"))}</textarea></label>
        <label class="campo"><span>Pagamenti accettati</span><small>Una voce per riga. Es. "Contanti", "Carta".</small><textarea name="pagamenti" rows="2">${esc((a.pagamenti || []).join("\n"))}</textarea></label>
        <fieldset class="campo"><legend><b>Caratteristiche</b></legend><div class="spunte">${ETICHETTE.map(e => `<label class="spunta"><input type="checkbox" name="etichetta" value="${esc(e.id)}"${(a.etichette || []).includes(e.id) ? " checked" : ""}><span>${esc(e.nome)}</span></label>`).join("")}</div></fieldset>
      </div>
    </section>

    <section class="gruppo-campi" aria-labelledby="g-racconto"><h2 id="g-racconto">Il racconto</h2>
      <div class="campi">
        <label class="campo"><span>Titolare</span><small>Compare sul sito solo con il consenso al nome.</small><input name="titolare" value="${esc(a.titolare || "")}" maxlength="80"></label>
        <label class="campo"><span>La storia</span><small>Lascia una riga vuota tra un paragrafo e l'altro.</small><textarea name="storia" rows="7">${esc((a.storia || []).join("\n\n"))}</textarea></label>
        <label class="campo"><span>Riconoscimenti</span><small>Uno per riga.</small><textarea name="riconoscimenti" rows="3">${esc((a.riconoscimenti || []).join("\n"))}</textarea></label>
      </div>
    </section>

    ${nuova ? "" : `<section class="gruppo-campi" aria-labelledby="g-foto"><h2 id="g-foto">Foto</h2>
      <p class="nota">Le foto vengono rimpicciolite in automatico prima del caricamento. Per pubblicarle serve il consenso alle foto.</p>
      <div class="foto-griglia" id="foto"></div>
      <label class="bottone carica-foto"><input type="file" id="nuove-foto" accept="image/*" multiple>+ Aggiungi foto</label>
      <p class="esito-invio" id="esito-foto" role="status" aria-live="polite"></p>
    </section>`}

    <div class="barra-salva">
      <button type="submit" class="primario" id="salva">${nuova ? "Crea la scheda" : "Salva le modifiche"}</button>
      ${!nuova && a.stato === "pubblicata" ? `<a class="bottone piccolo" href="${esc(SITO)}#/a/${esc(a.id)}" target="_blank" rel="noopener">Vedi sul sito</a>` : ""}
      <p class="esito-invio" id="esito-salva" role="status" aria-live="polite"></p>
    </div>
  </form>

  ${nuova ? "" : `<section class="gruppo-campi modifica" aria-labelledby="g-consenso" id="consenso">
    <h2 id="g-consenso">Consenso firmato</h2>
    <p class="nota">${a.esempio ? "Le schede di prova non hanno bisogno di consenso." : consenso ? (consenso.revocato_il ? `Revocato il ${dataLunga(consenso.revocato_il)}.` : `Firmato il ${dataLunga(consenso.data_firma)}.`) : "Non ancora registrato: la scheda non si può pubblicare."} Copia qui le caselle del modulo cartaceo.</p>
    <form id="f-consenso" class="campi" novalidate>
      <label class="campo"><span>Data della firma</span><input type="date" name="data_firma" value="${esc(consenso?.data_firma || "")}" required></label>
      <div class="spunte">
        ${[["pubblicazione", "Pubblicazione della scheda", "Necessaria per pubblicare"], ["nome_titolare", "Nome del titolare", ""], ["foto", "Foto", ""], ["persone_foto", "Persone nelle foto", ""], ["social", "Uso sui social di Territoria", ""], ["resoconto", "Resoconto mensile", "Vuole ricevere i numeri della scheda"], ["comunicazioni", "Comunicazioni", "Novità del sito e iniziative"]]
          .map(([k, t, s]) => `<label class="spunta"><input type="checkbox" name="${k}"${consenso && consenso[k] ? " checked" : ""}><span><b>${t}</b>${s ? `<small>${s}</small>` : ""}</span></label>`).join("")}
      </div>
      <label class="campo"><span>Revocato il</span><small>Solo se l'attività ha ritirato il consenso: la scheda si nasconde da sola.</small><input type="date" name="revocato_il" value="${esc(consenso?.revocato_il || "")}"></label>
      <label class="campo"><span>Note</span><textarea name="note" rows="2" maxlength="500">${esc(consenso?.note || "")}</textarea></label>
      <div><button type="submit" class="primario">Salva il consenso</button></div>
      <p class="esito-invio" id="esito-consenso" role="status" aria-live="polite"></p>
    </form>
  </section>

  <section class="gruppo-campi modifica" aria-labelledby="g-elimina">
    <h2 id="g-elimina">Eliminare la scheda</h2>
    <p class="nota">Per toglierla dal sito di solito basta lo stato "Nascosta". Eliminare cancella per sempre scheda, consenso registrato e foto.</p>
    <button type="button" class="bottone pericolo" id="elimina-att">Elimina definitivamente</button>
  </section>`}`;

  const f = document.getElementById("f-att");
  f.addEventListener("input", segnaSporco);
  f.addEventListener("change", segnaSporco);

  /* Indirizzo automatico dal nome, finché non lo tocchi */
  if (nuova) {
    let idToccato = false;
    f.indirizzo_scheda.addEventListener("input", () => { idToccato = true; });
    f.nome.addEventListener("input", () => { if (!idToccato) f.indirizzo_scheda.value = slug(f.nome.value); });
  }
  f.categoria.addEventListener("change", () => {
    const c = CATEGORIE.find(x => x.id === f.categoria.value);
    document.getElementById("sottocat").innerHTML = (c?.sottocategorie || []).map(s => `<option value="${esc(s)}">`).join("");
  });
  f.esterna.addEventListener("change", () => { document.getElementById("campo-esterno").hidden = !f.esterna.checked; });
  f.querySelectorAll("[data-aperto]").forEach(cb => cb.addEventListener("change", () => {
    cb.closest("[data-giorno]").querySelector("[data-fasce]").hidden = !cb.checked;
    if (cb.checked) f.senza_orari.checked = false;
  }));
  document.getElementById("aggiungi-prodotto").addEventListener("click", () => {
    document.getElementById("prodotti").insertAdjacentHTML("beforeend", rigaProdotto({}));
    document.querySelector("#prodotti [data-prodotto]:last-child input").focus(); segnaSporco();
  });
  document.getElementById("aggiungi-social").addEventListener("click", () => {
    document.getElementById("social").insertAdjacentHTML("beforeend", rigaSocial({}));
    document.querySelector("#social [data-social]:last-child input").focus(); segnaSporco();
  });
  f.addEventListener("click", e => {
    const t = e.target.closest("[data-togli]");
    if (t) { t.closest(".ripetibile-riga").remove(); segnaSporco(); }
  });

  /* ---------- Foto ---------- */
  const disegnaFoto = () => {
    const box = document.getElementById("foto");
    if (!box) return;
    box.innerHTML = galleria.length ? galleria.map((g, i) => `<div class="foto-scheda" data-i="${i}">
      <img src="${esc(urlFoto(g))}" alt="" loading="lazy">
      <input type="text" data-alt value="${esc(g.alt || "")}" placeholder="Descrizione (per chi non vede)" aria-label="Descrizione della foto ${i + 1}" maxlength="160">
      <label class="spunta"><input type="radio" name="copertina" data-copertina${(g.copertina || (!galleria.some(x => x.copertina) && i === 0)) ? " checked" : ""}><span>Copertina</span></label>
      <label class="spunta"><input type="checkbox" data-persone${g.persone ? " checked" : ""}><span>Ci sono persone riconoscibili</span></label>
      <button type="button" class="togli" data-togli-foto>Togli</button>
    </div>`).join("") : `<p class="nota">Nessuna foto. Senza foto la scheda mostra l'icona della categoria.</p>`;
  };
  disegnaFoto();
  const boxFoto = document.getElementById("foto");
  if (boxFoto) {
    boxFoto.addEventListener("input", e => {
      const i = Number(e.target.closest("[data-i]")?.dataset.i);
      if (e.target.matches("[data-alt]")) galleria[i].alt = e.target.value;
    });
    boxFoto.addEventListener("change", e => {
      const i = Number(e.target.closest("[data-i]")?.dataset.i);
      if (e.target.matches("[data-persone]")) galleria[i].persone = e.target.checked;
      if (e.target.matches("[data-copertina]")) galleria.forEach((g, j) => { g.copertina = j === i; });
    });
    boxFoto.addEventListener("click", e => {
      const b = e.target.closest("[data-togli-foto]");
      if (!b) return;
      const i = Number(b.closest("[data-i]").dataset.i);
      if (!confirm("Togliere questa foto dalla scheda? Verrà cancellata dall'archivio quando salvi.")) return;
      const [tolta] = galleria.splice(i, 1);
      if (tolta && tolta.percorso) daCancellare.push(tolta.percorso);
      disegnaFoto(); segnaSporco();
    });
    document.getElementById("nuove-foto").addEventListener("change", async e => {
      const file = Array.from(e.target.files || []);
      e.target.value = "";
      const esito = document.getElementById("esito-foto");
      for (let n = 0; n < file.length; n++) {
        esito.className = "esito-invio"; esito.textContent = `Carico la foto ${n + 1} di ${file.length}…`;
        try {
          const { blob, w, h } = await riduciFoto(file[n]);
          const percorso = `${a.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
          await caricaFile(percorso, blob);
          galleria.push({ percorso, alt: "", w, h, persone: false });
          disegnaFoto(); segnaSporco();
        } catch (err) {
          if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
          esito.className = "esito-invio ko"; esito.textContent = err.message; return;
        }
      }
      esito.className = "esito-invio ok"; esito.textContent = "Foto caricate. Scrivi una breve descrizione e premi Salva.";
    });
  }

  /* ---------- Salvataggio della scheda ---------- */
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-salva");
    const b = document.getElementById("salva");
    const errore = msg => { esito.className = "esito-invio ko"; esito.textContent = msg; };
    const nome = f.nome.value.trim();
    if (nome.length < 2) return errore("Scrivi il nome dell'attività.");
    const nuovoId = nuova ? slug(f.indirizzo_scheda.value || nome) : a.id;
    if (nuova && !nuovoId) return errore("L'indirizzo della scheda non è valido: usa lettere e numeri.");
    const { orari, errore: errOrari } = f.senza_orari.checked ? { orari: null, errore: "" } : leggiOrari(f);
    if (errOrari) return errore(errOrari);
    const tutteChiuse = orari && GIORNI.every(g => !orari[g].length);
    if (f.chiusura_dal.value && f.chiusura_al.value && f.chiusura_al.value < f.chiusura_dal.value) return errore("La chiusura straordinaria finisce prima di iniziare.");
    const sito = conHttps(f.sito.value), esterno = conHttps(f.link_esterno.value);
    if (sito && !/^https?:\/\//.test(sito)) return errore("Il sito web deve essere un indirizzo, tipo https://www.esempio.it");
    if (f.esterna.checked && !esterno) return errore("Scrivi il link del servizio esterno.");
    const social = Array.from(f.querySelectorAll("[data-social]")).map(r => ({ rete: r.querySelector('[data-s="rete"]').value, url: conHttps(r.querySelector('[data-s="url"]').value) })).filter(s => s.url);
    if (social.some(s => !/^https?:\/\//.test(s.url))) return errore("Un link social non è valido: deve iniziare con https://");
    const prodotti = Array.from(f.querySelectorAll("[data-prodotto]")).map(r => ({ nome: r.querySelector('[data-p="nome"]').value.trim(), dettaglio: r.querySelector('[data-p="dettaglio"]').value.trim() })).filter(p => p.nome);
    const tel = vuotoANull(f.telefono.value);

    const dati = {
      nome,
      categoria: f.categoria.value,
      sottocategoria: vuotoANull(f.sottocategoria.value),
      zona: vuotoANull(f.zona.value),
      icona: vuotoANull(f.icona.value),
      descrizione_breve: vuotoANull(f.descrizione_breve.value),
      stato: f.stato.value,
      in_evidenza: f.in_evidenza.checked,
      esempio: f.esempio.checked,
      tipo: f.esterna.checked ? "esterna" : "interna",
      link_esterno: f.esterna.checked ? esterno : null,
      indirizzo: vuotoANull(f.indirizzo.value),
      telefono: tel ? numeroTel(tel) : null,
      telefono_visibile: tel,
      whatsapp: vuotoANull(f.whatsapp.value) ? numeroTel(f.whatsapp.value) : null,
      email: vuotoANull(f.email.value),
      sito,
      social,
      orari: tutteChiuse ? null : orari,
      chiusura_dal: vuotoANull(f.chiusura_dal.value),
      chiusura_al: vuotoANull(f.chiusura_al.value),
      chiusura_nota: vuotoANull(f.chiusura_nota.value),
      prodotti,
      acquisto: righe(f.acquisto.value),
      pagamenti: righe(f.pagamenti.value),
      etichette: Array.from(f.querySelectorAll('[name="etichetta"]:checked')).map(x => x.value),
      titolare: vuotoANull(f.titolare.value),
      storia: paragrafi(f.storia.value),
      riconoscimenti: righe(f.riconoscimenti.value),
      galleria: galleria.map(g => ({ percorso: g.percorso, url: g.url, alt: (g.alt || "").trim(), w: g.w, h: g.h, persone: !!g.persone, copertina: !!g.copertina })).map(g => { Object.keys(g).forEach(k => g[k] === undefined && delete g[k]); return g; })
    };
    b.setAttribute("aria-busy", "true");
    esito.className = "esito-invio"; esito.textContent = "Salvataggio…";
    try {
      if (nuova) {
        await inserisci("attivita", Object.assign({ id: nuovoId }, dati));
        avvisa("Scheda creata. Ora puoi aggiungere foto e consenso.");
        vaiA("#/attivita/" + encodeURIComponent(nuovoId));
        return;
      }
      await aggiorna("attivita", `id=eq.${encodeURIComponent(a.id)}`, dati);
      sporco = false;
      if (daCancellare.length) {
        try { await cancellaFile(daCancellare.splice(0)); } catch (err) { avvisa(err.message); }
      }
      avvisa("Modifiche salvate");
      vaiA("#/attivita/" + encodeURIComponent(a.id));
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      errore(err.message);
    } finally {
      b.removeAttribute("aria-busy");
    }
  });

  if (nuova) { f.nome.focus(); return; }

  /* ---------- Consenso ---------- */
  const fc = document.getElementById("f-consenso");
  fc.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-consenso");
    if (!fc.data_firma.value) { esito.className = "esito-invio ko"; esito.textContent = "Scrivi la data della firma."; return; }
    if (sporco && !confirm("Hai modifiche alla scheda non ancora salvate: andranno perse. Continuare?")) return;
    const valori = { attivita_id: a.id, data_firma: fc.data_firma.value, revocato_il: vuotoANull(fc.revocato_il.value), note: vuotoANull(fc.note.value) };
    ["pubblicazione", "nome_titolare", "foto", "persone_foto", "social", "resoconto", "comunicazioni"].forEach(k => { valori[k] = fc[k].checked; });
    const avevaFoto = galleria.length > 0;
    try {
      await salvaOSostituisci("consensi", "attivita_id", valori);
      sporco = false;
      let msg = "Consenso salvato.";
      if (!valori.foto && avevaFoto && confirm("Senza consenso alle foto, le foto sono state tolte dalla scheda. Vuoi cancellarle anche dall'archivio?")) {
        const file = await elencaFile(a.id);
        await cancellaFile((file || []).map(x => `${a.id}/${x.name}`));
        msg += " Foto cancellate dall'archivio.";
      }
      if (valori.revocato_il || !valori.pubblicazione) msg += " La scheda non è più visibile sul sito.";
      avvisa(msg);
      vaiA("#/attivita/" + encodeURIComponent(a.id));
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      esito.className = "esito-invio ko"; esito.textContent = err.message;
    }
  });

  /* ---------- Eliminazione ---------- */
  document.getElementById("elimina-att").addEventListener("click", async () => {
    if (!confirm(`Eliminare per sempre «${a.nome}», con consenso registrato e foto? Non si può annullare.`)) return;
    try {
      let file = [];
      try { file = await elencaFile(a.id); } catch (e) { /* niente */ }
      await elimina("attivita", `id=eq.${encodeURIComponent(a.id)}`);
      if (file && file.length) { try { await cancellaFile(file.map(x => `${a.id}/${x.name}`)); } catch (e) { /* niente */ } }
      avvisa("Scheda eliminata");
      vaiA("#/attivita");
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      avvisa(err.message);
    }
  });

  /* ---------- Resoconto ---------- */
  const br = document.getElementById("apri-resoconto");
  if (br) br.addEventListener("click", () => apriResoconto(a, consenso));
}

/* =====================================================================
   RESOCONTO PER L'ATTIVITÀ
   ===================================================================== */
function periodo(tipo) {
  const oggi = oggiISO();
  const [y, m] = oggi.split("-").map(Number);
  if (tipo === "questo") return { dal: `${y}-${String(m).padStart(2, "0")}-01`, al: oggi, nome: `a ${MESI_NOME[m - 1]} (fino a oggi)` };
  if (tipo === "30") return { dal: aggiungiGiorni(oggi, -29), al: oggi, nome: "negli ultimi 30 giorni" };
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return { dal: `${py}-${String(pm).padStart(2, "0")}-01`, al: `${py}-${String(pm).padStart(2, "0")}-${ultimo}`, nome: `a ${MESI_NOME[pm - 1]} ${py}` };
}

function apriResoconto(a, consenso) {
  const d = document.createElement("dialog");
  d.className = "finestra";
  d.innerHTML = `<div class="finestra-corpo">
    <h2>Resoconto per ${esc(a.nome)}</h2>
    ${consenso && consenso.resoconto ? "" : `<p class="nota">Nel modulo non ha chiesto il resoconto mensile: mandalo solo se te lo chiede.</p>`}
    <label class="campo"><span>Periodo</span><select id="r-periodo"><option value="scorso">Il mese scorso</option><option value="questo">Questo mese</option><option value="30">Ultimi 30 giorni</option></select></label>
    <label class="campo"><span>Messaggio</span><textarea id="r-testo" aria-describedby="r-nota"></textarea></label>
    <p class="nota" id="r-nota">Puoi modificarlo prima di mandarlo.</p>
    <div class="finestra-azioni">
      <button type="button" class="bottone" id="r-chiudi">Chiudi</button>
      <button type="button" class="bottone" id="r-copia">Copia</button>
      ${(a.whatsapp || a.telefono) ? `<a class="primario" id="r-wa" href="#" target="_blank" rel="noopener">Apri WhatsApp</a>` : ""}
    </div>
  </div>`;
  document.body.appendChild(d);
  const testo = d.querySelector("#r-testo");
  const prepara = async () => {
    const p = periodo(d.querySelector("#r-periodo").value);
    testo.value = "Calcolo…";
    try {
      const r = await rpc("riepilogo_statistiche", { dal: p.dal, al: p.al });
      const e = (r.attivita || {})[a.id] || {};
      const qr = Number((r.qr || {})[a.id] || 0);
      const voci = [
        [e.scheda, "👀", "visita alla scheda", "visite alla scheda"], [qr, "📱", "arrivo dal QR in vetrina", "arrivi dal QR in vetrina"],
        [e.chiama, "📞", "chiamata dal sito", "chiamate dal sito"], [e.whatsapp, "💬", "messaggio WhatsApp", "messaggi WhatsApp"],
        [e.indicazioni, "🗺️", "richiesta di indicazioni", "richieste di indicazioni"], [e.sito, "🌐", "visita al vostro sito", "visite al vostro sito"],
        [e.social, "📣", "visita alle pagine social", "visite alle pagine social"], [e.email, "✉️", "email", "email"],
        [e.condividi, "🔁", "condivisione della scheda", "condivisioni della scheda"]
      ].filter((v, i) => i === 0 || Number(v[0]) > 0);
      testo.value = `Ciao! Ecco come è andata la scheda di ${a.nome} su Territoria Sacrofano ${p.nome}:\n\n`
        + voci.map(([n, ic, uno, tanti]) => `${ic} ${numero(n)} ${Number(n) === 1 ? uno : tanti}`).join("\n")
        + `\n\nSe qualcosa è cambiato (orari, prodotti, chiusure), scrivimi e aggiorno la scheda.\n${SITO}#/a/${a.id}`;
    } catch (err) {
      testo.value = "";
      avvisa(err.message);
    }
  };
  d.querySelector("#r-periodo").addEventListener("change", prepara);
  d.querySelector("#r-chiudi").addEventListener("click", () => d.close());
  d.querySelector("#r-copia").addEventListener("click", async () => avvisa(await copia(testo.value) ? "Messaggio copiato" : "Seleziona il testo e copialo"));
  const wa = d.querySelector("#r-wa");
  if (wa) wa.addEventListener("click", () => { wa.href = `https://wa.me/${soloCifre(a.whatsapp || a.telefono)}?text=${encodeURIComponent(testo.value)}`; });
  d.addEventListener("close", () => d.remove());
  d.showModal();
  prepara();
}

/* =====================================================================
   BACHECA
   ===================================================================== */
function testoWhatsapp(x) {
  const date = x.scadenza && x.scadenza !== x.inizio ? `dal ${dataLunga(x.inizio)} al ${dataLunga(x.scadenza)}` : dataLunga(x.inizio);
  return [
    `*${x.titolo}*`,
    `📅 ${date}`,
    x.luogo ? `📍 ${x.luogo}` : null,
    "",
    x.testo,
    "",
    x.fonte_nome ? `Fonte: ${x.fonte_nome}${x.fonte_url ? " " + x.fonte_url : ""}` : null,
    `Tutti gli eventi e gli avvisi di Sacrofano: ${SITO}?da=whatsapp#/bacheca`
  ].filter(r => r !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function paginaBacheca(q) {
  const lista = await leggi("annunci?select=*&order=inizio.desc");
  const oggi = oggiISO();
  const SCHEDE = {
    attivi: ["In corso e in arrivo", x => x.pubblicato && x.scadenza >= oggi],
    bozze: ["Bozze", x => !x.pubblicato && x.scadenza >= oggi],
    scaduti: ["Scaduti", x => x.scadenza < oggi]
  };
  let scheda = SCHEDE[q.get("vista")] ? q.get("vista") : "attivi";
  app.innerHTML = `
  <div class="capo"><h1 class="titolo-pagina" tabindex="-1">Bacheca</h1>
    <div class="capo-azioni"><a class="primario" href="#/bacheca/nuovo">+ Nuovo annuncio</a></div></div>
  <div class="filtri" role="group" aria-label="Mostra">${Object.entries(SCHEDE).map(([k, [t]]) => `<button type="button" class="chip" data-vista="${k}" aria-pressed="${k === scheda}">${t}</button>`).join("")}</div>
  <ul class="elenco" id="elenco-ann"></ul>`;
  const disegna = () => {
    const vis = lista.filter(SCHEDE[scheda][1]).sort((x, y) => scheda === "scaduti" ? y.inizio.localeCompare(x.inizio) : (y.fissato - x.fissato) || x.inizio.localeCompare(y.inizio));
    document.getElementById("elenco-ann").innerHTML = vis.length ? vis.map(x => `<li><a class="riga" href="#/bacheca/${x.id}">
      <span><strong>${esc(x.titolo)}</strong><span class="sotto">${x.tipo === "avviso" ? "Avviso" : "Evento"} · ${dataBreve(x.inizio)}${x.scadenza !== x.inizio ? " → " + dataBreve(x.scadenza) : ""}</span></span>
      <span class="badges">${x.fissato ? `<span class="badge giallo">Fissato in alto</span>` : ""}${x.esempio ? `<span class="badge">Esempio</span>` : ""}${x.pubblicato ? "" : `<span class="badge">Bozza</span>`}</span>
    </a></li>`).join("") : `<li class="vuoto-admin">Niente qui.</li>`;
  };
  disegna();
  app.querySelectorAll("[data-vista]").forEach(b => b.addEventListener("click", () => {
    scheda = b.dataset.vista;
    app.querySelectorAll("[data-vista]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    disegna();
  }));
}

async function paginaModificaAnnuncio(id) {
  const nuovo = id === "nuovo";
  const [righeAnn, attivita] = await Promise.all([
    nuovo ? Promise.resolve([]) : leggi(`annunci?id=eq.${encodeURIComponent(id)}&select=*`),
    leggi("attivita?select=id,nome&order=nome.asc")
  ]);
  if (!nuovo && !righeAnn.length) { app.innerHTML = `<h1 class="titolo-pagina" tabindex="-1">Annuncio non trovato</h1><p><a class="bottone" href="#/bacheca">Torna alla bacheca</a></p>`; return; }
  const x = nuovo ? { tipo: "evento", titolo: "", testo: "", luogo: "Sacrofano", inizio: oggiISO(), scadenza: oggiISO(), pubblicato: true, fissato: false } : righeAnn[0];

  app.innerHTML = `
  <a class="indietro-admin" href="#/bacheca">‹ Bacheca</a>
  <div class="capo"><h1 class="titolo-pagina" tabindex="-1">${nuovo ? "Nuovo annuncio" : esc(x.titolo)}</h1>
    ${nuovo ? "" : `<div class="capo-azioni"><button type="button" class="bottone" id="copia-wa">Copia per WhatsApp</button></div>`}</div>
  <form class="modifica" id="f-ann" novalidate>
    <section class="gruppo-campi"><div class="campi">
      <fieldset class="campo"><legend><b>Tipo</b></legend><div class="spunte">
        <label class="spunta"><input type="radio" name="tipo" value="evento"${x.tipo === "evento" ? " checked" : ""}><span><b>Evento</b><small>Sagra, mercato, concerto, corso…</small></span></label>
        <label class="spunta"><input type="radio" name="tipo" value="avviso"${x.tipo === "avviso" ? " checked" : ""}><span><b>Avviso</b><small>Chiusure, lavori, rifiuti, scadenze. Serve sempre la fonte.</small></span></label>
      </div></fieldset>
      <label class="campo"><span>Titolo</span><input name="titolo" value="${esc(x.titolo)}" maxlength="120" required></label>
      <label class="campo"><span>Testo</span><textarea name="testo" rows="6" maxlength="1500">${esc(x.testo)}</textarea></label>
      <label class="campo"><span>Luogo</span><input name="luogo" value="${esc(x.luogo || "")}" maxlength="120"></label>
      <div class="campi due">
        <label class="campo"><span>Data</span><input type="date" name="inizio" value="${esc(x.inizio)}" required></label>
        <label class="campo"><span>Visibile fino al</span><small>Il giorno dopo sparisce da solo.</small><input type="date" name="scadenza" value="${esc(x.scadenza)}" required></label>
      </div>
      <div class="campi due">
        <label class="campo"><span>Fonte</span><small>Chi lo comunica: obbligatoria per gli avvisi.</small><input name="fonte_nome" value="${esc(x.fonte_nome || "")}" maxlength="120" placeholder="Es. Comune di Sacrofano"></label>
        <label class="campo"><span>Link della fonte</span><input name="fonte_url" value="${esc(x.fonte_url || "")}" inputmode="url" placeholder="https://..."></label>
      </div>
      <label class="campo"><span>Organizzato da (facoltativo)</span><select name="attivita_id"><option value="">Nessuna attività del sito</option>${attivita.map(t => `<option value="${esc(t.id)}"${t.id === x.attivita_id ? " selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></label>
      <div class="spunte">
        <label class="spunta"><input type="checkbox" name="pubblicato"${x.pubblicato ? " checked" : ""}><span><b>Pubblicato</b><small>Visibile a tutti sul sito.</small></span></label>
        <label class="spunta"><input type="checkbox" name="fissato"${x.fissato ? " checked" : ""}><span><b>Fissato in alto</b><small>Per gli avvisi importanti.</small></span></label>
        ${x.esempio ? `<label class="spunta"><input type="checkbox" name="esempio" checked><span><b>Annuncio di esempio</b><small>Togli la spunta se diventa un annuncio vero.</small></span></label>` : ""}
      </div>
    </div></section>
    <div class="barra-salva">
      <button type="submit" class="primario" id="salva-ann">${nuovo ? "Pubblica" : "Salva le modifiche"}</button>
      ${nuovo ? "" : `<button type="button" class="bottone piccolo pericolo" id="elimina-ann">Elimina</button>`}
      <p class="esito-invio" id="esito-ann" role="status" aria-live="polite"></p>
    </div>
  </form>`;

  const f = document.getElementById("f-ann");
  f.addEventListener("input", segnaSporco);
  f.addEventListener("change", segnaSporco);
  let scadenzaToccata = !nuovo;
  f.scadenza.addEventListener("input", () => { scadenzaToccata = true; });
  f.inizio.addEventListener("input", () => { if (!scadenzaToccata || f.scadenza.value < f.inizio.value) f.scadenza.value = f.inizio.value; });
  f.pubblicato.addEventListener("change", () => { document.getElementById("salva-ann").textContent = nuovo ? (f.pubblicato.checked ? "Pubblica" : "Salva come bozza") : "Salva le modifiche"; });

  f.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-ann");
    const errore = m => { esito.className = "esito-invio ko"; esito.textContent = m; };
    const tipo = f.querySelector('[name="tipo"]:checked').value;
    const dati = {
      tipo,
      titolo: f.titolo.value.trim(),
      testo: f.testo.value.trim(),
      luogo: vuotoANull(f.luogo.value),
      inizio: f.inizio.value,
      scadenza: f.scadenza.value,
      fonte_nome: vuotoANull(f.fonte_nome.value),
      fonte_url: conHttps(f.fonte_url.value),
      attivita_id: f.attivita_id.value || null,
      pubblicato: f.pubblicato.checked,
      fissato: f.fissato.checked
    };
    if (f.esempio) dati.esempio = f.esempio.checked;
    if (dati.titolo.length < 3) return errore("Scrivi un titolo di almeno 3 caratteri.");
    if (!dati.testo) return errore("Scrivi il testo dell'annuncio.");
    if (!dati.inizio || !dati.scadenza) return errore("Scrivi le date.");
    if (dati.scadenza < dati.inizio) return errore("La data di fine visibilità è prima della data dell'annuncio.");
    if (tipo === "avviso" && !dati.fonte_nome) return errore("Gli avvisi devono indicare la fonte.");
    if (dati.fonte_url && !/^https?:\/\//.test(dati.fonte_url)) return errore("Il link della fonte deve iniziare con https://");
    try {
      if (nuovo) {
        const [creato] = await inserisci("annunci", dati);
        avvisa(dati.pubblicato ? "Annuncio pubblicato" : "Bozza salvata");
        vaiA("#/bacheca/" + creato.id);
      } else {
        await aggiorna("annunci", `id=eq.${x.id}`, dati);
        avvisa("Modifiche salvate");
        vaiA("#/bacheca/" + x.id);
      }
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      errore(err.message);
    }
  });

  const cw = document.getElementById("copia-wa");
  if (cw) cw.addEventListener("click", async () => avvisa(await copia(testoWhatsapp(x)) ? "Testo copiato: incollalo nel canale WhatsApp" : "Copia non riuscita"));
  const el = document.getElementById("elimina-ann");
  if (el) el.addEventListener("click", async () => {
    if (!confirm(`Eliminare «${x.titolo}»?`)) return;
    try { await elimina("annunci", `id=eq.${x.id}`); avvisa("Annuncio eliminato"); vaiA("#/bacheca"); }
    catch (err) { if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo."); avvisa(err.message); }
  });
  if (nuovo) f.titolo.focus();
}

/* =====================================================================
   SEGNALAZIONI
   ===================================================================== */
const TIPI_SEGN = { nuova_attivita: "Attività che manca", evento: "Evento o avviso", errore: "Errore in una scheda", modifica_scheda: "Richiesta del titolare", altro: "Altro" };

function linkContatto(c) {
  if (!c) return "";
  if (/@/.test(c)) return `<a href="mailto:${esc(c)}">${esc(c)}</a>`;
  const n = soloCifre(c);
  if (n.length >= 6) {
    const tel = numeroTel(c);
    return `${esc(c)} · <a href="tel:${esc(tel)}">Chiama</a> · <a href="https://wa.me/${soloCifre(tel)}" target="_blank" rel="noopener">WhatsApp</a>`;
  }
  return esc(c);
}

async function paginaSegnalazioni(q) {
  const [lista, attivita] = await Promise.all([
    leggi("segnalazioni?select=*&order=creato_il.desc&limit=300"),
    leggi("attivita?select=id,nome")
  ]);
  const nomeDi = id => (attivita.find(t => t.id === id) || {}).nome || id;
  let vista = q.get("vista") === "archivio" ? "archivio" : "da_gestire";
  app.innerHTML = `
  <h1 class="titolo-pagina" tabindex="-1">Segnalazioni</h1>
  <p class="intro">Arrivano dal modulo del sito. Quando una è gestita o scartata, il contatto di chi l'ha mandata viene cancellato, come promesso nel modulo.</p>
  <div class="filtri" role="group" aria-label="Mostra">
    <button type="button" class="chip" data-vista="da_gestire" aria-pressed="${vista === "da_gestire"}">Da gestire</button>
    <button type="button" class="chip" data-vista="archivio" aria-pressed="${vista === "archivio"}">Archivio</button>
  </div>
  <div id="elenco-segn"></div>`;
  const disegna = () => {
    const vis = lista.filter(s => vista === "archivio" ? ["approvata", "scartata"].includes(s.stato) : ["nuova", "in_corso"].includes(s.stato));
    document.getElementById("elenco-segn").innerHTML = vis.length ? vis.map(s => `<article class="segnalazione" data-id="${s.id}">
      <div class="segnalazione-testa">
        <span class="badges"><span class="badge ${s.stato === "nuova" ? "rosso" : s.stato === "in_corso" ? "giallo" : ""}">${{ nuova: "Nuova", in_corso: "In corso", approvata: "Fatta", scartata: "Scartata" }[s.stato]}</span><span class="badge">${esc(TIPI_SEGN[s.tipo] || s.tipo)}</span></span>
        <span class="nota">${esc(quando(s.creato_il))}</span>
      </div>
      ${s.attivita_id ? `<p class="nota">Scheda: <a href="#/attivita/${encodeURIComponent(s.attivita_id)}">${esc(nomeDi(s.attivita_id))}</a></p>` : ""}
      <p class="segnalazione-testo">${esc(s.messaggio)}</p>
      ${s.contatto ? `<p class="nota">Contatto: ${linkContatto(s.contatto)}</p>` : `<p class="nota">${s.gestita_il ? "Contatto cancellato dopo la gestione." : "Nessun contatto lasciato."}</p>`}
      <label class="sr" for="nota-${s.id}">Note per te</label>
      <textarea id="nota-${s.id}" data-nota placeholder="Note per te (non le vede nessuno)">${esc(s.note_admin || "")}</textarea>
      <div class="segnalazione-azioni">
        ${s.stato === "nuova" ? `<button type="button" class="bottone piccolo" data-azione="in_corso">Presa in carico</button>` : ""}
        ${["nuova", "in_corso"].includes(s.stato) ? `<button type="button" class="primario piccolo" data-azione="approvata">Fatto</button><button type="button" class="bottone piccolo" data-azione="scartata">Scarta</button>` : ""}
        <button type="button" class="bottone piccolo" data-azione="nota">Salva nota</button>
        <button type="button" class="bottone piccolo pericolo" data-azione="elimina">Elimina</button>
      </div>
    </article>`).join("") : `<p class="vuoto-admin">${vista === "archivio" ? "Archivio vuoto." : "Nessuna segnalazione da gestire."}</p>`;
  };
  disegna();
  app.querySelectorAll("[data-vista]").forEach(b => b.addEventListener("click", () => {
    vista = b.dataset.vista;
    app.querySelectorAll("[data-vista]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    disegna();
  }));
  document.getElementById("elenco-segn").addEventListener("click", async e => {
    const b = e.target.closest("[data-azione]");
    if (!b) return;
    const card = b.closest("[data-id]");
    const s = lista.find(x => x.id === card.dataset.id);
    const nota = vuotoANull(card.querySelector("[data-nota]").value);
    const azione = b.dataset.azione;
    try {
      if (azione === "elimina") {
        if (!confirm("Eliminare questa segnalazione?")) return;
        await elimina("segnalazioni", `id=eq.${s.id}`);
        lista.splice(lista.indexOf(s), 1);
      } else if (azione === "nota") {
        Object.assign(s, await aggiorna("segnalazioni", `id=eq.${s.id}`, { note_admin: nota }));
        avvisa("Nota salvata");
        return;
      } else {
        const chiude = azione === "approvata" || azione === "scartata";
        if (chiude && s.contatto && !confirm("Il contatto di chi l'ha mandata verrà cancellato. Gli hai già risposto, se serviva?")) return;
        const dati = { stato: azione, note_admin: nota };
        if (chiude) { dati.contatto = null; dati.gestita_il = new Date().toISOString(); }
        Object.assign(s, await aggiorna("segnalazioni", `id=eq.${s.id}`, dati));
      }
      disegna();
      aggiornaPallino();
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      avvisa(err.message);
    }
  });
}

/* =====================================================================
   SERVIZI UTILI
   ===================================================================== */
async function paginaServizi() {
  const lista = await leggi("servizi_utili?select=*&order=ordine.asc,nome.asc");
  app.innerHTML = `
  <a class="indietro-admin" href="#/altro">‹ Altro</a>
  <div class="capo"><h1 class="titolo-pagina" tabindex="-1">Servizi utili</h1>
    <div class="capo-azioni"><a class="primario" href="#/servizi/nuovo">+ Nuovo servizio</a></div></div>
  <p class="intro">Link ai servizi pubblici nella pagina "Servizi utili" del sito. Gli orari di autobus e pulmini si cambiano in <a href="#/orari">Orari autobus</a>.</p>
  <ul class="elenco">${lista.map(s => `<li><a class="riga" href="#/servizi/${s.id}">
    <span><strong>${esc(s.nome)}</strong><span class="sotto">${esc(s.gruppo)} · ${esc(s.link)}</span></span>
    <span class="badges">${s.attivo ? "" : `<span class="badge">Nascosto</span>`}${s.urgente ? `<span class="badge rosso">Emergenza</span>` : ""}</span>
  </a></li>`).join("") || `<li class="vuoto-admin">Nessun servizio.</li>`}</ul>`;
}

async function paginaModificaServizio(id) {
  const nuovo = id === "nuovo";
  const tutti = await leggi("servizi_utili?select=*&order=ordine.asc");
  const s = nuovo ? { gruppo: "", nome: "", descrizione: "", link: "", urgente: false, ordine: (tutti.length + 1) * 10, attivo: true } : tutti.find(x => x.id === id);
  if (!s) { app.innerHTML = `<h1 class="titolo-pagina" tabindex="-1">Servizio non trovato</h1>`; return; }
  const gruppi = [...new Set(tutti.map(x => x.gruppo))];
  app.innerHTML = `
  <a class="indietro-admin" href="#/servizi">‹ Servizi utili</a>
  <h1 class="titolo-pagina" tabindex="-1">${nuovo ? "Nuovo servizio" : esc(s.nome)}</h1>
  <form class="modifica" id="f-serv" novalidate><section class="gruppo-campi"><div class="campi">
    <label class="campo"><span>Gruppo</span><input name="gruppo" list="gruppi" value="${esc(s.gruppo)}" maxlength="40" placeholder="Es. Salute"></label>
    <datalist id="gruppi">${gruppi.map(g => `<option value="${esc(g)}">`).join("")}</datalist>
    <label class="campo"><span>Nome</span><input name="nome" value="${esc(s.nome)}" maxlength="80"></label>
    <label class="campo"><span>Descrizione</span><textarea name="descrizione" rows="2" maxlength="200">${esc(s.descrizione || "")}</textarea></label>
    <label class="campo"><span>Link</span><small>Un sito (https://...) oppure un numero da chiamare (tel:112).</small><input name="link" value="${esc(s.link)}" inputmode="url"></label>
    <label class="campo"><span>Ordine</span><small>I numeri più bassi vengono prima.</small><input name="ordine" type="number" value="${Number(s.ordine) || 0}"></label>
    <div class="spunte">
      <label class="spunta"><input type="checkbox" name="urgente"${s.urgente ? " checked" : ""}><span><b>Numero di emergenza</b><small>Mostrato in grande e in rosso.</small></span></label>
      <label class="spunta"><input type="checkbox" name="attivo"${s.attivo ? " checked" : ""}><span><b>Visibile sul sito</b></span></label>
    </div>
  </div></section>
  <div class="barra-salva"><button type="submit" class="primario">Salva</button>
    ${nuovo ? "" : `<button type="button" class="bottone piccolo pericolo" id="elimina-serv">Elimina</button>`}
    <p class="esito-invio" id="esito-serv" role="status" aria-live="polite"></p></div>
  </form>`;
  const f = document.getElementById("f-serv");
  f.addEventListener("input", segnaSporco);
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-serv");
    const link = /^tel:/i.test(f.link.value.trim()) ? "tel:" + soloCifre(f.link.value) : conHttps(f.link.value);
    const dati = { gruppo: f.gruppo.value.trim(), nome: f.nome.value.trim(), descrizione: vuotoANull(f.descrizione.value), link, ordine: Number(f.ordine.value) || 0, urgente: f.urgente.checked, attivo: f.attivo.checked };
    if (!dati.gruppo || !dati.nome) { esito.className = "esito-invio ko"; esito.textContent = "Scrivi gruppo e nome."; return; }
    if (!dati.link || !/^(https?:\/\/|tel:\d)/.test(dati.link)) { esito.className = "esito-invio ko"; esito.textContent = "Il link deve iniziare con https:// oppure tel:"; return; }
    try {
      if (nuovo) await inserisci("servizi_utili", dati); else await aggiorna("servizi_utili", `id=eq.${s.id}`, dati);
      avvisa("Servizio salvato"); vaiA("#/servizi");
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      esito.className = "esito-invio ko"; esito.textContent = err.message;
    }
  });
  const el = document.getElementById("elimina-serv");
  if (el) el.addEventListener("click", async () => {
    if (!confirm(`Eliminare «${s.nome}»?`)) return;
    try { await elimina("servizi_utili", `id=eq.${s.id}`); avvisa("Servizio eliminato"); vaiA("#/servizi"); }
    catch (err) { avvisa(err.message); }
  });
}

/* =====================================================================
   CATEGORIE ED ETICHETTE
   ===================================================================== */
async function paginaCategorie() {
  await caricaElenchi();
  const att = await leggi("attivita?select=categoria");
  const quante = id => att.filter(a => a.categoria === id).length;
  app.innerHTML = `
  <a class="indietro-admin" href="#/altro">‹ Altro</a>
  <div class="capo"><h1 class="titolo-pagina" tabindex="-1">Categorie</h1>
    <div class="capo-azioni"><a class="primario" href="#/categorie/nuova">+ Nuova categoria</a></div></div>
  <ul class="elenco">${CATEGORIE.map(c => `<li><a class="riga" href="#/categorie/${encodeURIComponent(c.id)}">
    <span><strong>${esc(c.icona)} ${esc(c.nome)}</strong><span class="sotto">${esc((c.sottocategorie || []).join(", "))}</span></span>
    <span class="badges"><span class="badge">${quante(c.id)} attività</span>${c.attiva ? "" : `<span class="badge">Nascosta</span>`}</span>
  </a></li>`).join("")}</ul>

  <div class="capo"><h2 class="titolo-pagina">Caratteristiche</h2>
    <div class="capo-azioni"><a class="bottone" href="#/etichette/nuova">+ Nuova caratteristica</a></div></div>
  <p class="intro">Le etichette filtrabili, come "Km zero" o "Consegna a domicilio".</p>
  <ul class="elenco">${ETICHETTE.map(e => `<li><a class="riga" href="#/etichette/${encodeURIComponent(e.id)}">
    <span><strong>${esc(e.nome)}</strong></span><span class="badges">${e.attiva ? "" : `<span class="badge">Nascosta</span>`}</span></a></li>`).join("")}</ul>`;
}

async function paginaModificaCategoria(id) {
  await caricaElenchi();
  const nuova = id === "nuova";
  const c = nuova ? { id: "", nome: "", icona: "📍", sottocategorie: [], ordine: (CATEGORIE.length + 1), attiva: true } : CATEGORIE.find(x => x.id === id);
  if (!c) { app.innerHTML = `<h1 class="titolo-pagina" tabindex="-1">Categoria non trovata</h1>`; return; }
  app.innerHTML = `
  <a class="indietro-admin" href="#/categorie">‹ Categorie</a>
  <h1 class="titolo-pagina" tabindex="-1">${nuova ? "Nuova categoria" : esc(c.nome)}</h1>
  <form class="modifica" id="f-cat" novalidate><section class="gruppo-campi"><div class="campi">
    <label class="campo"><span>Nome</span><input name="nome" value="${esc(c.nome)}" maxlength="60"></label>
    <label class="campo"><span>Icona</span><small>Un'emoji.</small><input name="icona" value="${esc(c.icona)}" maxlength="8"></label>
    <label class="campo"><span>Tipi di attività</span><small>Uno per riga. Compaiono sotto il nome e come suggerimenti nelle schede.</small><textarea name="sottocategorie" rows="6">${esc((c.sottocategorie || []).join("\n"))}</textarea></label>
    <label class="campo"><span>Ordine</span><input name="ordine" type="number" value="${Number(c.ordine) || 0}"></label>
    <label class="spunta"><input type="checkbox" name="attiva"${c.attiva ? " checked" : ""}><span><b>Visibile sul sito</b></span></label>
  </div></section>
  <div class="barra-salva"><button type="submit" class="primario">Salva</button>
    ${nuova ? "" : `<button type="button" class="bottone piccolo pericolo" id="elimina-cat">Elimina</button>`}
    <p class="esito-invio" id="esito-cat" role="status" aria-live="polite"></p></div>
  </form>`;
  const f = document.getElementById("f-cat");
  f.addEventListener("input", segnaSporco);
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-cat");
    const dati = { nome: f.nome.value.trim(), icona: f.icona.value.trim() || "📍", sottocategorie: righe(f.sottocategorie.value), ordine: Number(f.ordine.value) || 0, attiva: f.attiva.checked };
    if (dati.nome.length < 2) { esito.className = "esito-invio ko"; esito.textContent = "Scrivi il nome della categoria."; return; }
    try {
      if (nuova) await inserisci("categorie", Object.assign({ id: slug(dati.nome) }, dati)); else await aggiorna("categorie", `id=eq.${encodeURIComponent(c.id)}`, dati);
      await caricaElenchi();
      avvisa("Categoria salvata"); vaiA("#/categorie");
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      esito.className = "esito-invio ko"; esito.textContent = err.message;
    }
  });
  const el = document.getElementById("elimina-cat");
  if (el) el.addEventListener("click", async () => {
    if (!confirm(`Eliminare la categoria «${c.nome}»?`)) return;
    try { await elimina("categorie", `id=eq.${encodeURIComponent(c.id)}`); await caricaElenchi(); avvisa("Categoria eliminata"); vaiA("#/categorie"); }
    catch (err) { avvisa(/collegato/.test(err.message) ? "Non si può eliminare: ci sono attività in questa categoria. Spostale prima, oppure nascondila." : err.message); }
  });
}

async function paginaModificaEtichetta(id) {
  await caricaElenchi();
  const nuova = id === "nuova";
  const t = nuova ? { id: "", nome: "", ordine: ETICHETTE.length + 1, attiva: true } : ETICHETTE.find(x => x.id === id);
  if (!t) { app.innerHTML = `<h1 class="titolo-pagina" tabindex="-1">Caratteristica non trovata</h1>`; return; }
  app.innerHTML = `
  <a class="indietro-admin" href="#/categorie">‹ Categorie</a>
  <h1 class="titolo-pagina" tabindex="-1">${nuova ? "Nuova caratteristica" : esc(t.nome)}</h1>
  <form class="modifica" id="f-eti" novalidate><section class="gruppo-campi"><div class="campi">
    <label class="campo"><span>Nome</span><input name="nome" value="${esc(t.nome)}" maxlength="40"></label>
    <label class="campo"><span>Ordine</span><input name="ordine" type="number" value="${Number(t.ordine) || 0}"></label>
    <label class="spunta"><input type="checkbox" name="attiva"${t.attiva ? " checked" : ""}><span><b>Visibile sul sito</b></span></label>
  </div></section>
  <div class="barra-salva"><button type="submit" class="primario">Salva</button>
    ${nuova ? "" : `<button type="button" class="bottone piccolo pericolo" id="elimina-eti">Elimina</button>`}
    <p class="esito-invio" id="esito-eti" role="status" aria-live="polite"></p></div>
  </form>`;
  const f = document.getElementById("f-eti");
  f.addEventListener("input", segnaSporco);
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-eti");
    const dati = { nome: f.nome.value.trim(), ordine: Number(f.ordine.value) || 0, attiva: f.attiva.checked };
    if (dati.nome.length < 2) { esito.className = "esito-invio ko"; esito.textContent = "Scrivi il nome."; return; }
    try {
      if (nuova) await inserisci("etichette", Object.assign({ id: slug(dati.nome) }, dati)); else await aggiorna("etichette", `id=eq.${encodeURIComponent(t.id)}`, dati);
      await caricaElenchi();
      avvisa("Caratteristica salvata"); vaiA("#/categorie");
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      esito.className = "esito-invio ko"; esito.textContent = err.message;
    }
  });
  const el = document.getElementById("elimina-eti");
  if (el) el.addEventListener("click", async () => {
    if (!confirm(`Eliminare «${t.nome}»? Sparirà dalle schede che la usano.`)) return;
    try { await elimina("etichette", `id=eq.${encodeURIComponent(t.id)}`); await caricaElenchi(); avvisa("Caratteristica eliminata"); vaiA("#/categorie"); }
    catch (err) { avvisa(err.message); }
  });
}

/* =====================================================================
   ORARI AUTOBUS E PULMINI
   Ogni riga della tabella "orari_trasporto" è una direzione in un tipo
   di giorno. Le corse hanno un orario per ogni fermata.
   ===================================================================== */
const GIORNI_ORARI = { feriali: "Lun–Ven", sabato: "Sabato", festivi: "Domenica e festivi", tutti: "Tutti i giorni" };
const MEZZI = ["Pulmino", "COTRAL", "Treno"];
/* Accetta 7:16, 07.16, 7,16, 0716, 716 → "07:16" */
function normOra(v) {
  const m = String(v || "").trim().match(/^(\d{1,2})[:.,]?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? String(h).padStart(2, "0") + ":" + m[2] : null;
}
const primoOrario = c => (c.orari || []).find(Boolean) || "";

async function leggiOrari() {
  try { return await leggi("orari_trasporto?select=*&order=ordine.asc,direzione.asc,giorni.asc"); }
  catch (e) { if (e instanceof SessioneScaduta) throw e; return null; }
}
const mancaAggiornamento3 = () => `<div class="errore-dati" role="alert"><h2>Manca l'aggiornamento del database</h2>
  <p>In Supabase apri SQL Editor ed esegui lo script <b>territoria-aggiornamento-3.sql</b>, poi ricarica questa pagina.</p></div>`;

async function paginaOrariAdmin() {
  const lista = await leggiOrari();
  const testa = `<a class="indietro-admin" href="#/altro">‹ Altro</a>
  <div class="capo"><h1 class="titolo-pagina" tabindex="-1">Orari autobus</h1>
    ${lista ? `<div class="capo-azioni"><a class="primario" href="#/orari/nuova">+ Nuova tabella</a></div>` : ""}</div>`;
  if (!lista) { app.innerHTML = testa + mancaAggiornamento3(); return; }
  const oggi = oggiISO();
  const gruppi = [...new Set(lista.map(t => t.gruppo))];
  app.innerHTML = `${testa}
  <p class="intro">Ogni tabella è una direzione in un tipo di giorno. Sul sito compaiono in «Servizi utili», con le prossime partenze da Sacrofano.</p>
  ${gruppi.map(g => `<h2 class="sottotitolo">${esc(g)}</h2>
  <ul class="elenco">${lista.filter(t => t.gruppo === g).map(t => {
    const corse = (t.corse || []).filter(c => c && Array.isArray(c.orari));
    const ore = corse.map(primoOrario).filter(Boolean).sort();
    return `<li><a class="riga" href="#/orari/${t.id}">
      <span><strong>${esc(t.direzione)} · ${esc(GIORNI_ORARI[t.giorni] || t.giorni)}</strong>
      <span class="sotto">${corse.length} ${corse.length === 1 ? "corsa" : "corse"}${ore.length ? ` · dalle ${esc(ore[0])} alle ${esc(ore[ore.length - 1])}` : ""} · aggiornata il ${esc(dataBreve(t.aggiornato_il))}</span></span>
      <span class="badges">${t.pubblicato ? "" : `<span class="badge">Nascosta</span>`}${t.valido_al && t.valido_al < oggi ? `<span class="badge rosso">Scaduta</span>` : ""}</span>
    </a></li>`;
  }).join("")}</ul>`).join("") || `<p class="nota">Nessuna tabella. Crea la prima con «+ Nuova tabella».</p>`}
  <p class="nota">Al cambio di stagione (per esempio l'orario estivo) apri ogni tabella, usa «Incolla molti orari insieme» con «Sostituisci le corse attuali» e aggiorna il periodo. Per fare la versione del sabato di una tabella, aprila e premi «Duplica».</p>`;
}

function testaCorse(nomi) {
  const n = Math.max(1, nomi.length);
  return `<div class="corsa corsa-testa n${n}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<span>${esc(nomi[i] || "Ora")}</span>`).join("")}</div>`;
}
function rigaCorsa(c, nomi, k) {
  const n = Math.max(1, nomi.length);
  const mezzo = c.mezzo || "";
  const opzioni = ["", ...MEZZI].concat(mezzo && !MEZZI.includes(mezzo) ? [mezzo] : []);
  return `<div class="corsa n${n}" data-corsa>
    ${Array.from({ length: n }, (_, i) => `<input data-ora inputmode="decimal" maxlength="5" placeholder="00:00" value="${esc((c.orari || [])[i] || "")}" aria-label="${esc((nomi[i] || "Ora") + ", corsa " + (k + 1))}">`).join("")}
    <select data-mezzo aria-label="Mezzo, corsa ${k + 1}">${opzioni.map(m => `<option value="${esc(m)}"${m === mezzo ? " selected" : ""}>${esc(m || "Mezzo non indicato")}</option>`).join("")}</select>
    <button type="button" class="togli" data-togli-corsa aria-label="Togli la corsa ${k + 1}">✕</button>
    <input class="corsa-nota" data-nota maxlength="200" placeholder="Nota (facoltativa)" value="${esc(c.nota || "")}" aria-label="Nota, corsa ${k + 1}">
  </div>`;
}

function analizzaIncolla(testo, n, mezzoBase) {
  const corse = [], scartate = [];
  testo.split(/\r?\n/).forEach(riga => {
    const ore = [];
    const re = /(^|[^\d])(\d{1,2})[:.](\d{2})(?!\d)/g;
    let m;
    while ((m = re.exec(riga))) { const v = normOra(m[2] + ":" + m[3]); if (v) ore.push(v); }
    if (!ore.length) { if (riga.trim()) scartate.push(riga.trim()); return; }
    const mezzo = /cotral/i.test(riga) ? "COTRAL" : /unit[àa]\s+di\s+rete|pulmin|udr/i.test(riga) ? "Pulmino" : /treno|ferrovi/i.test(riga) ? "Treno" : mezzoBase;
    corse.push({ orari: ore.slice(0, n), mezzo, nota: "" });
  });
  return { corse, scartate };
}

async function paginaModificaOrario(id, q) {
  const lista = await leggiOrari();
  if (!lista) { app.innerHTML = `<a class="indietro-admin" href="#/orari">‹ Orari autobus</a>` + mancaAggiornamento3(); return; }
  const nuovo = id === "nuova";
  const copia = nuovo && q.get("copia") ? lista.find(x => x.id === q.get("copia")) : null;
  const vuota = { gruppo: "", sottotitolo: "", direzione: "", percorso: "", giorni: "feriali", fermate: ["Partenza da Sacrofano"], fermata_comune: 0,
    corse: [{ orari: [""], mezzo: "", nota: "" }], legenda: "", note: "", periodo: "", valido_dal: null, valido_al: null, fonte_nome: "", fonte_url: "", pubblicato: true, ordine: (lista.length + 1) * 10 };
  const t = nuovo ? (copia ? Object.assign({}, copia, { id: undefined }) : vuota) : lista.find(x => x.id === id);
  if (!t) { app.innerHTML = `<h1 class="titolo-pagina" tabindex="-1">Tabella non trovata</h1><p><a class="bottone" href="#/orari">Torna agli orari</a></p>`; return; }
  const gruppi = [...new Set(lista.map(x => x.gruppo))];
  const fermate = (Array.isArray(t.fermate) ? t.fermate : []).slice(0, 3);
  const titolo = nuovo ? (copia ? "Copia della tabella" : "Nuova tabella") : `${t.direzione} · ${GIORNI_ORARI[t.giorni] || t.giorni}`;
  app.innerHTML = `
  <a class="indietro-admin" href="#/orari">‹ Orari autobus</a>
  <h1 class="titolo-pagina" tabindex="-1">${esc(titolo)}</h1>
  ${copia ? `<p class="intro">È una copia di «${esc(copia.direzione)} · ${esc(GIORNI_ORARI[copia.giorni])}». Cambia i giorni e gli orari, poi salva.</p>` : ""}
  <form class="modifica" id="f-orario" novalidate>
    <section class="gruppo-campi" aria-labelledby="o-corse"><h2 id="o-corse">Corse</h2>
      <p class="nota">Una riga per corsa. Scrivi l'ora come 07:16 (va bene anche 7.16 o 716). Quando salvi, le righe si mettono in ordine da sole.</p>
      <div class="corse" id="corse"></div>
      <button type="button" class="bottone piccolo aggiungi" id="aggiungi-corsa">+ Aggiungi corsa</button>
      <details class="incolla">
        <summary>Incolla molti orari insieme</summary>
        <p class="nota">Una corsa per riga: l'ora (oppure le ore, una per fermata, nell'ordine delle fermate) e, se c'è, il mezzo. Esempi: «07:40 COTRAL», «06:50 07:16 07:30».</p>
        <label class="campo"><span>Orari</span><textarea id="incolla-testo" rows="6"></textarea></label>
        <label class="campo"><span>Mezzo per le righe che non lo dicono</span><select id="incolla-mezzo"><option value="">Non indicato</option>${MEZZI.map(m => `<option>${esc(m)}</option>`).join("")}</select></label>
        <label class="spunta"><input type="checkbox" id="incolla-sostituisci"><span><b>Sostituisci le corse attuali</b><small>Per il cambio di stagione. Se non lo spunti, le nuove corse si aggiungono.</small></span></label>
        <p><button type="button" class="bottone piccolo" id="incolla-aggiungi">Aggiungi queste corse</button></p>
        <p class="esito-invio" id="esito-incolla" role="status" aria-live="polite"></p>
      </details>
    </section>

    <section class="gruppo-campi" aria-labelledby="o-linea"><h2 id="o-linea">Linea e direzione</h2><div class="campi">
      <label class="campo"><span>Titolo del gruppo</span><small>Le direzioni con lo stesso titolo stanno insieme sul sito. Es. «Da e per Roma».</small>
        <input name="gruppo" list="o-gruppi" maxlength="60" value="${esc(t.gruppo || "")}"></label>
      <datalist id="o-gruppi">${gruppi.map(g => `<option value="${esc(g)}">`).join("")}</datalist>
      <label class="campo"><span>Sottotitolo (facoltativo)</span><small>Es. «Linea 13 · pulmino Unità di Rete 2 e autobus COTRAL».</small>
        <input name="sottotitolo" maxlength="120" value="${esc(t.sottotitolo || "")}"></label>
      <label class="campo"><span>Direzione</span><small>Il nome sul pulsante. Es. «Verso Roma».</small>
        <input name="direzione" maxlength="60" value="${esc(t.direzione || "")}"></label>
      <label class="campo"><span>Percorso (facoltativo)</span><small>Es. «Da Sacrofano (P.zza Ugo Serata) alla stazione di Montebello».</small>
        <input name="percorso" maxlength="200" value="${esc(t.percorso || "")}"></label>
      <label class="campo"><span>Giorni</span><select name="giorni">${Object.entries(GIORNI_ORARI).map(([v, nome]) => `<option value="${v}"${v === t.giorni ? " selected" : ""}>${esc(nome)}</option>`).join("")}</select></label>
      <label class="campo"><span>Ordine</span><small>I numeri più bassi vengono prima.</small><input name="ordine" type="number" value="${Number(t.ordine) || 0}"></label>
    </div></section>

    <section class="gruppo-campi" aria-labelledby="o-fermate"><h2 id="o-fermate">Fermate</h2>
      <p class="nota">Una colonna di orari per ogni fermata: ne basta una.</p>
      <div class="campi">
        ${[0, 1, 2].map(i => `<label class="campo"><span>Fermata ${i + 1}${i ? " (facoltativa)" : ""}</span><input name="fermata${i}" data-fermata maxlength="60" value="${esc(fermate[i] || "")}"></label>`).join("")}
        <label class="campo"><span>Quale fermata è a Sacrofano?</span><small>Serve per le «prossime partenze da Sacrofano». Se gli orari sono di un'altra fermata, scegli «Nessuna».</small>
          <select name="fermata_comune"></select></label>
      </div></section>

    <section class="gruppo-campi" aria-labelledby="o-info"><h2 id="o-info">Informazioni per chi legge</h2><div class="campi">
      <label class="campo"><span>Legenda (facoltativa)</span><small>Cosa significano i mezzi. Es. «Pulmino: Unità di Rete 2, da Sacrofano a Riano».</small>
        <textarea name="legenda" rows="3" maxlength="500">${esc(t.legenda || "")}</textarea></label>
      <label class="campo"><span>Note (facoltative)</span><small>Avvertenze per tutta la tabella. Es. «Orario stimato».</small>
        <textarea name="note" rows="3" maxlength="1000">${esc(t.note || "")}</textarea></label>
      <label class="campo"><span>Periodo</span><small>Es. «Orario invernale».</small><input name="periodo" maxlength="120" value="${esc(t.periodo || "")}"></label>
      <div class="campi due">
        <label class="campo"><span>Valido dal (facoltativo)</span><input type="date" name="valido_dal" value="${esc(t.valido_dal || "")}"></label>
        <label class="campo"><span>Fino al (facoltativo)</span><input type="date" name="valido_al" value="${esc(t.valido_al || "")}"></label>
      </div>
      <label class="campo"><span>Fonte (facoltativa)</span><small>Chi ha pubblicato questi orari. Es. «Comune di Sacrofano».</small><input name="fonte_nome" maxlength="120" value="${esc(t.fonte_nome || "")}"></label>
      <label class="campo"><span>Link alla fonte (facoltativo)</span><input name="fonte_url" inputmode="url" value="${esc(t.fonte_url || "")}" placeholder="https://"></label>
      <div class="spunte"><label class="spunta"><input type="checkbox" name="pubblicato"${t.pubblicato ? " checked" : ""}><span><b>Visibile sul sito</b></span></label></div>
    </div></section>

    <div class="barra-salva"><button type="submit" class="primario">Salva</button>
      ${nuovo ? "" : `<a class="bottone piccolo" href="#/orari/nuova?copia=${encodeURIComponent(t.id)}">Duplica</a>
      <button type="button" class="bottone piccolo pericolo" id="elimina-orario">Elimina</button>`}
      <p class="esito-invio" id="esito-orario" role="status" aria-live="polite"></p></div>
  </form>`;

  const f = document.getElementById("f-orario");
  const box = document.getElementById("corse");
  const leggiFermate = () => [0, 1, 2].map(i => f["fermata" + i].value.trim()).filter(Boolean);
  const leggiCorse = () => Array.from(box.querySelectorAll("[data-corsa]")).map(rg => ({
    orari: Array.from(rg.querySelectorAll("[data-ora]")).map(i => i.value.trim()),
    mezzo: rg.querySelector("[data-mezzo]").value,
    nota: rg.querySelector("[data-nota]").value.trim()
  }));
  const disegna = corse => {
    const nomi = leggiFermate();
    box.innerHTML = testaCorse(nomi) + corse.map((c, k) => rigaCorsa(c, nomi, k)).join("");
  };
  const scelteFermate = scelta => {
    const nomi = leggiFermate();
    f.fermata_comune.innerHTML = nomi.map((nome, i) => `<option value="${i}"${scelta === i ? " selected" : ""}>${esc(nome)}</option>`).join("")
      + `<option value=""${scelta === null || scelta >= nomi.length ? " selected" : ""}>Nessuna</option>`;
  };
  scelteFermate(Number.isInteger(t.fermata_comune) ? t.fermata_comune : null);
  disegna((t.corse || []).filter(c => c && Array.isArray(c.orari)));

  f.addEventListener("input", segnaSporco);
  f.addEventListener("change", e => {
    if (!e.target.matches("[data-fermata]")) return;
    const scelta = f.fermata_comune.value === "" ? null : Number(f.fermata_comune.value);
    scelteFermate(scelta);
    disegna(leggiCorse());
  });
  f.addEventListener("focusout", e => {
    if (!e.target.matches("[data-ora]")) return;
    const v = e.target.value.trim();
    if (!v) { e.target.removeAttribute("aria-invalid"); return; }
    const n = normOra(v);
    if (n) { e.target.value = n; e.target.removeAttribute("aria-invalid"); } else e.target.setAttribute("aria-invalid", "true");
  });
  f.addEventListener("click", e => {
    const tg = e.target.closest("[data-togli-corsa]");
    if (tg) { tg.closest("[data-corsa]").remove(); disegna(leggiCorse()); segnaSporco(); }
  });
  document.getElementById("aggiungi-corsa").addEventListener("click", () => {
    disegna(leggiCorse().concat([{ orari: [], mezzo: "", nota: "" }]));
    const righe = box.querySelectorAll("[data-corsa]");
    righe[righe.length - 1].querySelector("[data-ora]").focus();
    segnaSporco();
  });
  document.getElementById("incolla-aggiungi").addEventListener("click", () => {
    const esito = document.getElementById("esito-incolla");
    const n = Math.max(1, leggiFermate().length);
    const { corse, scartate } = analizzaIncolla(document.getElementById("incolla-testo").value, n, document.getElementById("incolla-mezzo").value);
    if (!corse.length) { esito.className = "esito-invio ko"; esito.textContent = "Non ho trovato orari: scrivili come 07:16, uno per riga."; return; }
    const sostituisci = document.getElementById("incolla-sostituisci").checked;
    const attuali = sostituisci ? [] : leggiCorse().filter(c => c.orari.some(Boolean));
    disegna(attuali.concat(corse));
    document.getElementById("incolla-testo").value = "";
    segnaSporco();
    esito.className = "esito-invio ok";
    esito.textContent = `${sostituisci ? "Corse sostituite" : "Corse aggiunte"}: ${corse.length}.${scartate.length ? ` Righe senza orario ignorate: ${scartate.length}.` : ""} Controlla e premi Salva.`;
  });

  f.addEventListener("submit", async e => {
    e.preventDefault();
    const esito = document.getElementById("esito-orario");
    const errore = m => { esito.className = "esito-invio ko"; esito.textContent = m; };
    const nomi = leggiFermate();
    if (!f.gruppo.value.trim() || !f.direzione.value.trim()) return errore("Scrivi il titolo del gruppo e la direzione.");
    if (!nomi.length) return errore("Scrivi almeno il nome della prima fermata.");
    const corse = [];
    const righe = leggiCorse();
    for (let k = 0; k < righe.length; k++) {
      const c = righe[k];
      if (c.orari.every(o => !o) && !c.nota) continue;
      const orari = [];
      for (const o of c.orari) {
        if (!o) { orari.push(""); continue; }
        const v = normOra(o);
        if (!v) return errore(`Corsa ${k + 1}: «${o}» non è un orario valido. Scrivilo come 07:16.`);
        orari.push(v);
      }
      if (orari.every(o => !o)) return errore(`Corsa ${k + 1}: manca l'orario.`);
      while (orari.length > 1 && !orari[orari.length - 1]) orari.pop();
      corse.push({ orari, mezzo: c.mezzo, nota: c.nota });
    }
    corse.sort((a, b) => primoOrario(a).localeCompare(primoOrario(b)) || (a.orari[0] || "").localeCompare(b.orari[0] || ""));
    const url = conHttps(f.fonte_url.value);
    if (url && !/^https:\/\//.test(url)) return errore("Il link alla fonte deve iniziare con https://");
    if (f.valido_dal.value && f.valido_al.value && f.valido_al.value < f.valido_dal.value) return errore("La data «fino al» viene prima di «valido dal».");
    const fc = f.fermata_comune.value === "" ? null : Number(f.fermata_comune.value);
    const dati = {
      gruppo: f.gruppo.value.trim(), sottotitolo: vuotoANull(f.sottotitolo.value),
      direzione: f.direzione.value.trim(), percorso: vuotoANull(f.percorso.value),
      giorni: f.giorni.value, fermate: nomi, fermata_comune: fc !== null && fc < nomi.length ? fc : null, corse,
      legenda: vuotoANull(f.legenda.value), note: vuotoANull(f.note.value), periodo: vuotoANull(f.periodo.value),
      valido_dal: f.valido_dal.value || null, valido_al: f.valido_al.value || null,
      fonte_nome: vuotoANull(f.fonte_nome.value), fonte_url: url,
      pubblicato: f.pubblicato.checked, ordine: Number(f.ordine.value) || 0
    };
    esito.className = "esito-invio"; esito.textContent = "Salvataggio…";
    try {
      if (nuovo) await inserisci("orari_trasporto", dati); else await aggiorna("orari_trasporto", `id=eq.${t.id}`, dati);
      avvisa(`Orari salvati: ${corse.length} ${corse.length === 1 ? "corsa" : "corse"}`); vaiA("#/orari");
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      errore(err.message);
    }
  });
  const el = document.getElementById("elimina-orario");
  if (el) el.addEventListener("click", async () => {
    if (!confirm(`Eliminare la tabella «${t.direzione} · ${GIORNI_ORARI[t.giorni]}»?`)) return;
    try { await elimina("orari_trasporto", `id=eq.${t.id}`); avvisa("Tabella eliminata"); vaiA("#/orari"); }
    catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      document.getElementById("esito-orario").className = "esito-invio ko"; document.getElementById("esito-orario").textContent = err.message;
    }
  });
}

/* =====================================================================
   ESPORTA (copia di sicurezza)
   ===================================================================== */
const TABELLE = [
  ["categorie", "id"], ["etichette", "id"], ["attivita", "id"], ["consensi", "attivita_id"], ["annunci", "id"],
  ["servizi_utili", "id"], ["orari_trasporto", "id"], ["segnalazioni", "creato_il"], ["statistiche", "giorno,ora,evento,attivita_id,sorgente,dettaglio"], ["impostazioni", "chiave"]
];
async function tuttaLaTabella(nome, ordine) {
  let righeTot = [];
  for (let da = 0; ; da += 1000) {
    const blocco = await leggi(`${nome}?select=*&order=${ordine}&limit=1000&offset=${da}`);
    righeTot = righeTot.concat(blocco);
    if (blocco.length < 1000) return righeTot;
  }
}
const cella = v => {
  const s = Array.isArray(v) ? v.join(" | ") : (v === null || v === undefined) ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function paginaEsporta() {
  const stato = await rpc("stato_sistema");
  app.innerHTML = `
  <a class="indietro-admin" href="#/altro">‹ Altro</a>
  <h1 class="titolo-pagina" tabindex="-1">Copia di sicurezza</h1>
  <p class="intro">Il piano gratuito di Supabase non fa copie automatiche: scaricane una al mese e conservala in una cartella privata. Contiene anche consensi e segnalazioni, quindi non condividerla.</p>
  <p class="nota">Ultima copia: <b>${stato.ultima_copia ? quando(stato.ultima_copia) : "mai fatta"}</b>.</p>
  <section class="gruppo-campi modifica">
    <h2>Copia completa</h2>
    <p class="nota">Tutte le tabelle in un unico file. Le foto restano nell'archivio di Supabase.</p>
    <button type="button" class="primario" id="scarica-json">Scarica la copia completa</button>
    <p class="esito-invio" id="esito-json" role="status" aria-live="polite"></p>
  </section>
  <section class="gruppo-campi modifica">
    <h2>Attività per Excel</h2>
    <p class="nota">Un file da aprire con Excel, utile per la mappa economica di Sacrofano.</p>
    <button type="button" class="bottone" id="scarica-csv">Scarica le attività</button>
  </section>`;
  document.getElementById("scarica-json").addEventListener("click", async e => {
    const b = e.currentTarget, esito = document.getElementById("esito-json");
    b.setAttribute("aria-busy", "true"); esito.className = "esito-invio"; esito.textContent = "Preparo la copia…";
    try {
      const tabelle = {};
      for (const [t, o] of TABELLE) {
        try { tabelle[t] = await tuttaLaTabella(t, o); }
        catch (err) { if (t !== "orari_trasporto" || err instanceof SessioneScaduta) throw err; }
      }
      const ora = new Date().toISOString();
      scarica(`territoria-copia-${oggiISO()}.json`, JSON.stringify({ progetto: "Territoria Sacrofano", versione: 1, esportato_il: ora, tabelle }, null, 1), "application/json");
      await salvaOSostituisci("impostazioni", "chiave", { chiave: "ultima_copia", valore: { quando: ora } });
      esito.className = "esito-invio ok"; esito.textContent = "Copia scaricata. Salvala in una cartella privata.";
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      esito.className = "esito-invio ko"; esito.textContent = err.message;
    } finally { b.removeAttribute("aria-busy"); }
  });
  document.getElementById("scarica-csv").addEventListener("click", async () => {
    try {
      const [att, cons] = await Promise.all([tuttaLaTabella("attivita", "nome"), tuttaLaTabella("consensi", "attivita_id")]);
      const intest = ["id", "nome", "stato", "categoria", "tipo di attività", "zona", "indirizzo", "telefono", "whatsapp", "email", "sito", "titolare", "caratteristiche", "consenso firmato il", "consenso revocato il", "aggiornata il"];
      const righeCsv = att.map(a => {
        const c = cons.find(x => x.attivita_id === a.id) || {};
        return [a.id, a.nome, a.stato, a.categoria, a.sottocategoria, a.zona, a.indirizzo, a.telefono_visibile || a.telefono, a.whatsapp, a.email, a.sito, a.titolare,
          (a.etichette || []).map(id => (ETICHETTE.find(e => e.id === id) || {}).nome || id), c.data_firma, c.revocato_il, giornoRoma(a.aggiornato_il)].map(cella).join(";");
      });
      scarica(`territoria-attivita-${oggiISO()}.csv`, "﻿" + [intest.join(";")].concat(righeCsv).join("\r\n"), "text/csv;charset=utf-8");
    } catch (err) {
      if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
      avvisa(err.message);
    }
  });
}

/* =====================================================================
   CONTROLLO DI SICUREZZA
   Prova dal tuo browser, come farebbe un estraneo con la sola chiave
   pubblica, tutto quello che deve essere bloccato.
   ===================================================================== */
const PNG_PROVA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function daEstraneo(percorso, opz) {
  opz = opz || {};
  const h = Object.assign({ apikey: KEY }, opz.headers || {});
  if (/^eyJ/.test(KEY)) h.Authorization = "Bearer " + KEY;
  try {
    const r = await fetch(BASE + percorso, { method: opz.method || "GET", headers: h, body: opz.body });
    let dati = null; try { dati = await r.json(); } catch (e) { /* niente */ }
    return { stato: r.status, dati };
  } catch (e) {
    return { stato: 0, dati: null };
  }
}
const bloccato = r => r.stato === 401 || r.stato === 403;
const json = d => ({ headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(d) });

const CONTROLLI = [
  { nome: "Il sito pubblico legge le informazioni", base: true,
    aiuto: "La chiave in config.js non funziona: gli altri controlli non sono affidabili.",
    prova: async () => { const r = await daEstraneo("/rest/v1/categorie?select=id&limit=1"); return r.stato === 200 && Array.isArray(r.dati) && r.dati.length > 0; } },
  { nome: "Un estraneo non vede le schede in bozza o nascoste",
    prova: async () => { const r = await daEstraneo("/rest/v1/attivita?select=id&stato=neq.pubblicata"); return r.stato === 200 && Array.isArray(r.dati) && r.dati.length === 0; } },
  { nome: "Non può modificare le schede",
    prova: async () => bloccato(await daEstraneo("/rest/v1/attivita?id=eq.controllo-inesistente", Object.assign({ method: "PATCH" }, json({ nome: "Prova" })))) },
  { nome: "Non può creare schede",
    aiuto: "Da sistemare subito. In Supabase, Table Editor, attivita, cancella la riga \"controllo-sicurezza\".",
    prova: async () => bloccato(await daEstraneo("/rest/v1/attivita", Object.assign({ method: "POST" }, json({ id: "controllo-sicurezza", nome: "Controllo di sicurezza", categoria: (CATEGORIE[0] || {}).id || "cibo-km0", stato: "bozza" })))) },
  { nome: "Non può pubblicare annunci in bacheca",
    prova: async () => bloccato(await daEstraneo("/rest/v1/annunci", Object.assign({ method: "POST" }, json({ tipo: "evento", titolo: "Controllo", testo: "Controllo di sicurezza", inizio: oggiISO(), scadenza: oggiISO(), pubblicato: false })))) },
  { nome: "Non può cancellare annunci",
    prova: async () => bloccato(await daEstraneo("/rest/v1/annunci?id=eq.00000000-0000-0000-0000-000000000000", { method: "DELETE" })) },
  { nome: "Non può modificare gli orari degli autobus",
    prova: async () => { const r = await daEstraneo("/rest/v1/orari_trasporto?id=eq.00000000-0000-0000-0000-000000000000", Object.assign({ method: "PATCH" }, json({ note: "Prova" }))); return bloccato(r) || r.stato === 404; } },
  { nome: "Non vede i consensi firmati",
    prova: async () => bloccato(await daEstraneo("/rest/v1/consensi?select=attivita_id&limit=1")) },
  { nome: "Non vede le segnalazioni né i contatti di chi le manda",
    prova: async () => bloccato(await daEstraneo("/rest/v1/segnalazioni?select=id&limit=1")) },
  { nome: "Non vede le statistiche",
    prova: async () => bloccato(await daEstraneo("/rest/v1/statistiche?select=giorno&limit=1")) },
  { nome: "Non può scrivere numeri a piacere nelle statistiche",
    prova: async () => bloccato(await daEstraneo("/rest/v1/statistiche", Object.assign({ method: "POST" }, json({ giorno: oggiISO(), ora: 0, evento: "visita", conteggio: 99999 })))) },
  { nome: "Non vede le impostazioni del pannello",
    prova: async () => bloccato(await daEstraneo("/rest/v1/impostazioni?select=chiave&limit=1")) },
  { nome: "Non può usare le funzioni del pannello",
    prova: async () => { const r = await daEstraneo("/rest/v1/rpc/stato_sistema", Object.assign({ method: "POST" }, json({}))); return bloccato(r) || r.stato === 404; } },
  { nome: "La lista degli amministratori non è raggiungibile",
    prova: async () => { const r = await daEstraneo("/rest/v1/amministratori?select=user_id"); return r.stato !== 0 && r.stato !== 200; } },
  { nome: "Non può caricare foto nell'archivio",
    aiuto: "Da sistemare subito. In Supabase, Storage, foto, cancella il file \"_controllo-sicurezza.png\".",
    prova: async () => {
      const bin = Uint8Array.from(atob(PNG_PROVA), c => c.charCodeAt(0));
      const r = await daEstraneo("/storage/v1/object/foto/_controllo-sicurezza.png", { method: "POST", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: new Blob([bin], { type: "image/png" }) });
      return r.stato !== 0 && r.stato !== 200 && r.stato !== 201;
    } },
  { nome: "Nessuno può crearsi un account",
    aiuto: "Come sistemarlo: in Supabase, Authentication, impostazioni di accesso, disattiva \"Allow new users to sign up\".",
    prova: async () => { const r = await daEstraneo("/auth/v1/settings"); return r.stato === 200 && r.dati && r.dati.disable_signup === true; } },
  { nome: "Il tuo accesso usa password e codice dell'app", base: true,
    prova: async () => { const io = await rpc("chi_sono"); return !!(io && io.amministratore && io.livello === "aal2"); } }
];

async function paginaSicurezza() {
  const precedente = await leggi("impostazioni?chiave=eq.ultimo_controllo&select=valore");
  const ultimo = precedente[0] && precedente[0].valore;
  app.innerHTML = `
  <a class="indietro-admin" href="#/altro">‹ Altro</a>
  <h1 class="titolo-pagina" tabindex="-1">Controllo di sicurezza</h1>
  <p class="intro">Il pannello prova, come farebbe un estraneo con la sola chiave pubblica del sito, tutto quello che deve essere bloccato. Non modifica nessun dato. Ripetilo una volta al mese e dopo ogni aggiornamento.</p>
  <p class="nota" id="ultimo-controllo">Ultimo controllo: <b>${ultimo ? `${esc(quando(ultimo.quando))}, ${esc(ultimo.esito)}` : "mai fatto"}</b>.</p>
  <p><button type="button" class="primario" id="avvia-controllo">Avvia il controllo</button></p>
  <p class="esito-invio" id="esito-controllo" role="status" aria-live="polite"></p>
  <ul class="controlli" id="controlli">${CONTROLLI.map((c, i) => `<li class="controllo" data-i="${i}">
    <span class="segno" aria-hidden="true">·</span>
    <span><strong>${esc(c.nome)}</strong><span class="sotto" data-esito>Da provare</span>${c.aiuto ? `<span class="sotto aiuto" hidden>${esc(c.aiuto)}</span>` : ""}</span>
  </li>`).join("")}</ul>`;

  document.getElementById("avvia-controllo").addEventListener("click", async e => {
    const b = e.currentTarget, esito = document.getElementById("esito-controllo");
    b.setAttribute("aria-busy", "true"); b.textContent = "Controllo in corso…";
    esito.className = "esito-invio"; esito.textContent = "";
    let superati = 0, falliti = 0, nonVerificati = 0, baseOk = true;
    for (let i = 0; i < CONTROLLI.length; i++) {
      const c = CONTROLLI[i];
      const riga = document.querySelector(`.controllo[data-i="${i}"]`);
      riga.querySelector("[data-esito]").textContent = "Provo…";
      let ok = null;
      try { ok = await c.prova(); } catch (err) {
        if (err instanceof SessioneScaduta) return schermataAccesso("La sessione è scaduta. Accedi di nuovo.");
        ok = null;
      }
      if (i === 0 && !ok) baseOk = false;
      if (ok === true) superati++; else if (ok === false) falliti++; else nonVerificati++;
      riga.classList.remove("ok", "ko", "boh");
      riga.classList.add(ok === true ? "ok" : ok === false ? "ko" : "boh");
      riga.querySelector(".segno").textContent = ok === true ? "✓" : ok === false ? "✗" : "?";
      riga.querySelector("[data-esito]").textContent = ok === true ? (c.base ? "Confermato" : "Bloccato, come deve essere") : ok === false ? "ATTENZIONE: non bloccato" : "Non verificabile (connessione?)";
      const aiuto = riga.querySelector(".aiuto"); if (aiuto) aiuto.hidden = ok !== false;
    }
    b.removeAttribute("aria-busy"); b.textContent = "Ripeti il controllo";
    if (!baseOk) {
      esito.className = "esito-invio ko"; esito.textContent = "Il sito non riesce a leggere i dati con la chiave pubblica: controlla config.js, poi ripeti.";
      return;
    }
    const tutto = falliti === 0 && nonVerificati === 0;
    esito.className = "esito-invio " + (tutto ? "ok" : "ko");
    esito.textContent = tutto ? `Tutti i ${superati} controlli superati.` : `${superati} superati, ${falliti} da sistemare, ${nonVerificati} non verificabili. Mandami uno screenshot.`;
    try {
      const valore = { quando: new Date().toISOString(), esito: tutto ? "tutto superato" : `${falliti + nonVerificati} da rivedere` };
      await salvaOSostituisci("impostazioni", "chiave", { chiave: "ultimo_controllo", valore });
      document.getElementById("ultimo-controllo").innerHTML = `Ultimo controllo: <b>${esc(quando(valore.quando))}, ${esc(valore.esito)}</b>.`;
    } catch (err) { /* non è grave */ }
  });
}

/* =====================================================================
   ALTRO
   ===================================================================== */
function paginaAltro() {
  app.innerHTML = `
  <h1 class="titolo-pagina" tabindex="-1">Altro</h1>
  <ul class="menu-altro">
    <li><a href="#/servizi"><span>Servizi utili<small>Link a Comune, ASL, trasporti, emergenze</small></span><span aria-hidden="true">›</span></a></li>
    <li><a href="#/orari"><span>Orari autobus e pulmini<small>Le corse mostrate in «Servizi utili»</small></span><span aria-hidden="true">›</span></a></li>
    <li><a href="#/categorie"><span>Categorie e caratteristiche<small>Come sono divise le attività</small></span><span aria-hidden="true">›</span></a></li>
    <li><a href="#/esporta"><span>Copia di sicurezza<small>Da scaricare una volta al mese</small></span><span aria-hidden="true">›</span></a></li>
    <li><a href="#/sicurezza"><span>Controllo di sicurezza<small>Prova che nessun estraneo possa modificare o leggere dati riservati</small></span><span aria-hidden="true">›</span></a></li>
    <li><a href="${esc(SITO)}" target="_blank" rel="noopener"><span>Apri il sito<small>Come lo vedono tutti</small></span><span aria-hidden="true">↗</span></a></li>
    <li><button type="button" id="esci"><span class="esci">Esci dal pannello<small>${esc(emailUtente())} · accesso con codice attivo</small></span></button></li>
  </ul>`;
  document.getElementById("esci").addEventListener("click", esci);
}

/* =====================================================================
   AVVIO
   ===================================================================== */
async function entra() {
  await caricaElenchi();
  mostraNavigazione(true);
  hashCorrente = location.hash;
  pulisciSegnalazioniVecchie().then(aggiornaPallino);
  await mostra();
}

/* Come promette l'informativa privacy: le segnalazioni già gestite
   si cancellano da sole 12 mesi dopo la gestione (ad ogni accesso). */
async function pulisciSegnalazioniVecchie() {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 12);
  try {
    await elimina("segnalazioni", `stato=in.(approvata,scartata)&gestita_il=lt.${encodeURIComponent(limite.toISOString())}`);
  } catch (e) { /* riprova al prossimo accesso */ }
}

document.querySelector("[data-salta]").addEventListener("click", e => { e.preventDefault(); app.focus(); });

async function avvio() {
  if (!configurato) return schermataNonConfigurato();
  sessione = caricaSessione();
  if (!sessione) return schermataAccesso();
  try {
    await token();
    if (livello() !== "aal2") return await dopoPassword();
    await entraSeAmministratore();
  } catch (err) {
    salvaSessione(null);
    schermataAccesso(err instanceof SessioneScaduta ? "La sessione è scaduta. Accedi di nuovo." : err.message);
  }
}
avvio();
})();
