/* =====================================================================
   TERRITORIA SACROFANO · Funzionamento del sito
   I contenuti (schede, annunci, servizi) arrivano dal database Supabase.
   Per aggiungere o cambiare contenuti non serve toccare questo file.
   ===================================================================== */
(function () {
"use strict";

const CFG = window.TERRITORIA || {};
const main = document.getElementById("contenuto");

/* Dati caricati dal database */
let CATEGORIE = [];
let ETICHETTE = {};
let ATTIVITA = [];
let ANNUNCI = [];
let SERVIZI = [];
let ORARI = [];

const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const GIORNI_NOME = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI_NOME = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
const catDi = id => CATEGORIE.find(c => c.id === id);
const urlSicuro = u => (typeof u === "string" && /^https?:\/\//i.test(u)) ? u : "";
const soloNumero = t => String(t || "").replace(/[^\d+]/g, "");

/* =====================================================================
   COLLEGAMENTO AL DATABASE
   ===================================================================== */
const configurato = typeof CFG.supabaseUrl === "string" && /^https?:\/\//.test(CFG.supabaseUrl)
  && typeof CFG.supabaseKey === "string" && CFG.supabaseKey.length > 20 && !/INCOLLA/.test(CFG.supabaseKey);
const BASE = configurato ? CFG.supabaseUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "") : "";
const COMUNE = CFG.comune || "sacrofano";

function intestazioni(extra) {
  const h = Object.assign({ apikey: CFG.supabaseKey }, extra || {});
  /* Le vecchie chiavi "anon" (che iniziano con eyJ) vanno anche qui; le nuove "publishable" no. */
  if (/^eyJ/.test(CFG.supabaseKey)) h.Authorization = "Bearer " + CFG.supabaseKey;
  return h;
}

async function leggi(percorso) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(BASE + "/rest/v1/" + percorso, { headers: intestazioni(), signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function scrivi(tabella, dati, opzioni) {
  const r = await fetch(BASE + "/rest/v1/" + tabella, Object.assign({
    method: "POST",
    headers: intestazioni({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(dati)
  }, opzioni || {}));
  if (!r.ok) {
    let msg = "";
    try { const j = await r.json(); msg = j && j.code === "P0001" ? j.message : ""; } catch (e) { /* niente */ }
    const err = new Error(msg || ("HTTP " + r.status));
    err.daMostrare = !!msg;
    throw err;
  }
}

async function caricaDati() {
  const c = encodeURIComponent(COMUNE);
  const [cat, eti, att, ann, ser, ora] = await Promise.all([
    leggi("categorie?select=id,nome,icona,sottocategorie,ordine&order=ordine.asc,nome.asc"),
    leggi("etichette?select=id,nome,ordine&order=ordine.asc"),
    leggi("attivita?select=*&comune=eq." + c + "&order=nome.asc"),
    leggi("annunci?select=*&comune=eq." + c + "&order=fissato.desc,inizio.asc"),
    leggi("servizi_utili?select=*&comune=eq." + c + "&order=ordine.asc,nome.asc"),
    /* Se gli orari non sono ancora nel database, il resto del sito funziona lo stesso */
    leggi("orari_trasporto?select=*&comune=eq." + c + "&order=ordine.asc,direzione.asc").catch(() => [])
  ]);
  CATEGORIE = cat;
  ETICHETTE = Object.fromEntries(eti.map(e => [e.id, e.nome]));
  ATTIVITA = att;
  ANNUNCI = ann;
  SERVIZI = ser;
  ORARI = Array.isArray(ora) ? ora : [];
}

/* =====================================================================
   STATISTICHE ANONIME
   Il sito manda solo "cosa è successo" (es. una visita, un clic su Chiama).
   Niente cookie, niente dati su chi visita.
   ===================================================================== */
function conta(evento, extra) {
  if (!configurato) return;
  try {
    scrivi("registro_eventi", Object.assign({ evento }, extra || {}), { keepalive: true }).catch(() => {});
  } catch (e) { /* le statistiche non devono mai bloccare il sito */ }
}

function registraVisita() {
  let sorgente = "diretto", dettaglio = "";
  const p = new URLSearchParams(location.search);
  if (p.get("qr")) {
    sorgente = "qr";
    dettaglio = p.get("qr").slice(0, 80);
  } else if (p.get("da")) {
    const d = p.get("da").toLowerCase();
    sorgente = ["whatsapp", "google", "social"].includes(d) ? d : "altro";
  } else if (document.referrer) {
    try {
      const h = new URL(document.referrer).hostname;
      if (h !== location.hostname) {
        if (/(^|\.)google\./.test(h)) sorgente = "google";
        else if (/facebook|instagram|fb\.|tiktok|twitter|(^|\.)x\.com$|t\.co$/.test(h)) sorgente = "social";
        else if (/whatsapp/.test(h)) sorgente = "whatsapp";
        else sorgente = "altro";
      }
    } catch (e) { /* niente */ }
  }
  conta("visita", { sorgente, dettaglio });
  if (p.has("qr") || p.has("da")) {
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* niente */ }
  }
}

/* =====================================================================
   ORARI E DATE (sempre ora di Sacrofano)
   ===================================================================== */
function adessoRoma() {
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  const g = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday];
  const h = Number(p.hour) % 24, m = Number(p.minute);
  return { g, min: h * 60 + m, hhmm: String(h).padStart(2, "0") + ":" + p.minute, data: p.year + "-" + p.month + "-" + p.day };
}
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmtOra = t => t.replace(/^0(\d)/, "$1");
const parti = iso => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return { y, m, d }; };
const dataLunga = iso => { const p = parti(iso); return `${p.d} ${MESI_NOME[p.m - 1]} ${p.y}`; };
const giornoRoma = ts => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));

function inChiusura(a) {
  if (!a.chiusura_dal && !a.chiusura_al) return false;
  const oggi = adessoRoma().data;
  return (!a.chiusura_dal || oggi >= a.chiusura_dal) && (!a.chiusura_al || oggi <= a.chiusura_al);
}

function stato(a) {
  if (inChiusura(a)) {
    return { aperto: false, testo: "Chiuso" + (a.chiusura_al ? " fino al " + dataLunga(a.chiusura_al) : "") + (a.chiusura_nota ? ": " + a.chiusura_nota : "") };
  }
  const orari = a.orari;
  if (!orari) return null;
  const now = adessoRoma();
  const oggi = orari[GIORNI[now.g]] || [];
  for (const [x, y] of oggi) if (now.min >= toMin(x) && now.min < toMin(y)) return { aperto: true, testo: "Aperto ora, chiude alle " + fmtOra(y) };
  for (const [x] of oggi) if (toMin(x) > now.min) return { aperto: false, testo: "Chiuso, apre oggi alle " + fmtOra(x) };
  for (let i = 1; i <= 7; i++) {
    const g = (now.g + i) % 7, f = orari[GIORNI[g]] || [];
    if (f.length) return { aperto: false, testo: "Chiuso, apre " + (i === 1 ? "domani" : GIORNI_NOME[g]) + " alle " + fmtOra(f[0][0]) };
  }
  return { aperto: false, testo: "Orari non disponibili" };
}
function statoHTML(a, extra) {
  const s = stato(a);
  if (!s) return "";
  return `<p class="stato ${s.aperto ? "aperto" : "chiuso"} ${extra || ""}" data-stato-id="${esc(a.id)}"><span class="dot" aria-hidden="true"></span><span>${esc(s.testo)}</span></p>`;
}
function testoAdesso() {
  const now = adessoRoma();
  const aperte = ATTIVITA.filter(a => stato(a)?.aperto).length;
  return { vivo: aperte > 0, html: `<span class="dot" aria-hidden="true"></span><span>${cap(GIORNI_NOME[now.g])}, ${now.hhmm}. Aperte adesso: ${aperte} su ${ATTIVITA.length}</span>` };
}
function aggiornaStati() {
  document.querySelectorAll("[data-stato-id]").forEach(el => {
    const a = ATTIVITA.find(x => x.id === el.dataset.statoId);
    const s = a && stato(a);
    if (!s) return;
    el.classList.toggle("aperto", s.aperto);
    el.classList.toggle("chiuso", !s.aperto);
    el.lastElementChild.textContent = s.testo;
  });
  const ad = document.querySelector("[data-adesso]");
  if (ad) { const t = testoAdesso(); ad.innerHTML = t.html; ad.classList.toggle("vivo", t.vivo); }
}

function prossimi(tipo) {
  const oggi = adessoRoma().data;
  return ANNUNCI.filter(e => e.scadenza >= oggi && (!tipo || e.tipo === tipo))
    .sort((x, y) => (y.fissato - x.fissato) || x.inizio.localeCompare(y.inizio));
}

/* =====================================================================
   FOTO
   Nel database ogni foto ha "percorso" (file nell'archivio foto di
   Supabase) oppure "url" (indirizzo completo).
   ===================================================================== */
function urlFoto(f) {
  if (!f) return "";
  if (f.url) return urlSicuro(f.url);
  if (f.percorso) return BASE + "/storage/v1/object/public/foto/" + String(f.percorso).split("/").map(encodeURIComponent).join("/");
  return "";
}
function copertina(a) {
  const g = Array.isArray(a.galleria) ? a.galleria : [];
  return g.find(f => f && f.copertina) || g[0] || null;
}

/* =====================================================================
   PEZZI RIUTILIZZABILI
   ===================================================================== */
const CURVE = `<svg class="curve" viewBox="0 0 560 460" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
  <path d="M60 250c0-120 110-205 240-205s210 70 210 180-95 200-230 200S60 370 60 250z"/>
  <path d="M105 252c0-95 88-162 192-162s168 56 168 142-76 158-184 158-176-43-176-138z"/>
  <path d="M150 255c0-70 66-120 146-120s126 42 126 104-58 116-140 116-132-32-132-100z"/>
  <path d="M195 258c0-46 44-80 100-80s86 28 86 68-40 76-96 76-90-20-90-64z"/>
  <path d="M238 262c0-24 24-42 56-42s48 16 48 38-22 40-54 40-50-12-50-36z"/>
</svg>`;

const ICONE = {
  tel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.5h3.5l2 5-2.4 1.6a11 11 0 0 0 5.8 5.8l1.6-2.4 5 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z"/></svg>`,
  mappa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.2a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>`,
  fb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 3H13a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h2.6l.9-4H13V7.6c0-.4.3-.6.6-.6h1.9z"/></svg>`,
  ig: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17 7h.01"/></svg>`,
  condividi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M8 7l4-4 4 4"/></svg>`,
  web: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>`,
  wa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/></svg>`
};
const NOMI_SOCIAL = { facebook: ["Facebook", "fb"], instagram: ["Instagram", "ig"] };

function voceCategoria(c) {
  const n = ATTIVITA.filter(a => a.categoria === c.id).length;
  return `<li><a href="#/attivita?cat=${esc(c.id)}">
    <span class="cat-icona" aria-hidden="true">${esc(c.icona)}</span>
    <span class="cat-testo"><span class="cat-nome">${esc(c.nome)}</span><span class="cat-sotto">${esc((c.sottocategorie || []).join(", "))}</span></span>
    <span class="cat-conta ${n ? "piena" : ""}">${n ? n : "in arrivo"}</span>
  </a></li>`;
}
function etichetteHTML(a) {
  if (!a.etichette?.length) return "";
  return `<ul class="etichette" aria-label="Caratteristiche">${a.etichette.map(t => `<li>${esc(ETICHETTE[t] || t)}</li>`).join("")}</ul>`;
}
function fotoVoce(a) {
  const f = copertina(a), u = urlFoto(f);
  if (u) return `<img class="voce-foto" src="${esc(u)}" alt="" loading="lazy">`;
  return `<span class="voce-foto voce-segnaposto" aria-hidden="true">${esc(a.icona || catDi(a.categoria)?.icona || "📍")}</span>`;
}
function voceAttivita(a) {
  return `<li><a class="voce" href="#/a/${esc(a.id)}">
    ${fotoVoce(a)}
    <span>
      <h3>${esc(a.nome)}</h3>
      <p class="voce-cat">${esc(a.sottocategoria || catDi(a.categoria)?.nome || "")}${a.zona ? ", " + esc(a.zona) : ""}${a.esempio ? `<span class="esempio">Esempio</span>` : ""}</p>
      ${statoHTML(a)}
      ${etichetteHTML(a)}
    </span>
  </a></li>`;
}
function voceAvviso(e) {
  const p = parti(e.inizio);
  const fu = urlSicuro(e.fonte_url);
  const fonte = e.fonte_nome ? `<p class="fonte">Fonte: ${fu ? `<a href="${esc(fu)}" target="_blank" rel="noopener">${esc(e.fonte_nome)}</a>` : esc(e.fonte_nome)}</p>` : "";
  const att = e.attivita_id && ATTIVITA.find(a => a.id === e.attivita_id);
  return `<li class="avviso tipo-${esc(e.tipo)}">
    <span class="data" aria-hidden="true"><span class="data-giorno">${p.d}</span><span class="data-mese">${MESI[p.m - 1]}</span></span>
    <div>
      <span class="tipo">${e.tipo === "avviso" ? "Avviso" : "Evento"}${e.esempio ? `<span class="esempio">Esempio</span>` : ""}</span>
      <h3>${esc(e.titolo)}</h3>
      <p class="sr">${dataLunga(e.inizio)}</p>
      <p>${esc(e.testo)}</p>
      <p class="fonte">${esc(e.luogo || "")}${e.scadenza && e.scadenza !== e.inizio ? `${e.luogo ? ", " : ""}fino al ${dataLunga(e.scadenza)}` : ""}</p>
      ${att ? `<p class="fonte">Organizza: <a href="#/a/${esc(att.id)}">${esc(att.nome)}</a></p>` : ""}
      ${fonte}
    </div>
  </li>`;
}
function listaAvvisi(lista) {
  if (!lista.length) return `<div class="vuoto"><p>Nessun evento o avviso in corso.</p></div>`;
  return `<ul class="avvisi">${lista.map(voceAvviso).join("")}</ul>`;
}

/* =====================================================================
   PAGINE
   ===================================================================== */
function paginaHome() {
  const t = testoAdesso();
  const inEvidenza = ATTIVITA.filter(a => a.in_evidenza);
  return `
  <section class="hero">
    ${CURVE}
    <h1 class="hero-titolo" tabindex="-1">${esc(CFG.nomeComune || "Sacrofano")}</h1>
    <p class="hero-sotto">Botteghe, produttori e servizi del paese, in un posto solo.</p>
    <form class="cerca" role="search" data-cerca-home>
      <label class="sr" for="q-home">Cerca un'attività, un prodotto o un servizio</label>
      <input id="q-home" name="q" type="search" placeholder="Cerca: miele, idraulico…" autocomplete="off" enterkeyhint="search">
      <button type="submit">Cerca</button>
    </form>
    <a class="adesso ${t.vivo ? "vivo" : ""}" href="#/attivita?aperte=1" data-adesso>${t.html}</a>
  </section>

  <section class="sezione" aria-labelledby="h-cat">
    <h2 id="h-cat">Cosa ti serve?</h2>
    <ul class="categorie">${CATEGORIE.map(voceCategoria).join("")}</ul>
    <p class="nota">Cerchi il Comune, la ASL, ${ORARI.length ? `gli <a href="#/orari">orari degli autobus</a>` : "gli autobus"} o i numeri di emergenza? Sono in <a href="#/servizi">Servizi utili</a>.</p>
  </section>

  ${inEvidenza.length ? `<section class="sezione" aria-labelledby="h-ev">
    <h2 id="h-ev">In evidenza</h2>
    ${inEvidenza.map(a => {
      const f = copertina(a), u = urlFoto(f);
      return `<a class="evidenza" href="#/a/${esc(a.id)}">
      ${u ? `<img src="${esc(u)}" alt="${esc(f.alt || "")}">` : ""}
      <div class="evidenza-testo">
        <h3>${esc(a.nome)}</h3>
        <p>${esc(a.descrizione_breve || "")}</p>
        ${statoHTML(a)}
        ${etichetteHTML(a)}
      </div>
    </a>`;
    }).join("")}
  </section>` : ""}

  <section class="sezione" aria-labelledby="h-bac">
    <h2 id="h-bac">Dalla bacheca</h2>
    ${listaAvvisi(prossimi().slice(0, 2))}
    <p class="nota"><a href="#/bacheca">Tutti gli eventi e gli avvisi</a></p>
  </section>`;
}

let filtro = { q: "", cat: "", tag: "", aperte: false };
function paginaAttivita(q) {
  filtro = { q: q.get("q") || "", cat: q.get("cat") || "", tag: q.get("tag") || "", aperte: q.get("aperte") === "1" };
  const chipCat = [`<button type="button" class="chip" data-cat="" aria-pressed="${!filtro.cat}">Tutte</button>`]
    .concat(CATEGORIE.map(c => `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="${filtro.cat === c.id}">${esc(c.icona)} ${esc(c.nome)}</button>`)).join("");
  const chipTag = [`<button type="button" class="chip" data-aperte aria-pressed="${filtro.aperte}">Aperte ora</button>`]
    .concat(Object.entries(ETICHETTE).map(([k, v]) => `<button type="button" class="chip" data-tag="${esc(k)}" aria-pressed="${filtro.tag === k}">${esc(v)}</button>`)).join("");
  return `
  <h1 class="titolo-pagina" tabindex="-1">Attività</h1>
  <p class="intro">Botteghe, produttori e professionisti di Sacrofano. Scegli una categoria o cerca per nome e prodotto.</p>
  <div class="cerca cerca-pagina" role="search">
    <label class="sr" for="q">Cerca per nome o prodotto</label>
    <input id="q" type="search" value="${esc(filtro.q)}" placeholder="Cerca per nome o prodotto" autocomplete="off" enterkeyhint="search">
  </div>
  <div class="filtri" role="group" aria-label="Categorie">${chipCat}</div>
  <div class="filtri" role="group" aria-label="Caratteristiche">${chipTag}</div>
  <p class="conteggio" id="conteggio" aria-live="polite"></p>
  <div id="risultati"></div>`;
}
function testoRicerca(a) {
  const c = catDi(a.categoria);
  return [a.nome, a.sottocategoria, a.zona, a.titolare, a.descrizione_breve, c?.nome,
    (a.prodotti || []).map(p => (p.nome || "") + " " + (p.dettaglio || "")).join(" "),
    (a.etichette || []).map(t => ETICHETTE[t]).join(" ")].join(" ");
}

/* Ricerche senza risultati: contate una volta per parola, dopo una breve pausa */
const ricercheContate = new Set();
let timerRicerca = null;
function annotaRicercaVuota(testo) {
  clearTimeout(timerRicerca);
  const t = norm(testo).trim().replace(/\s+/g, " ");
  if (t.length < 3 || ricercheContate.has(t)) return;
  timerRicerca = setTimeout(() => {
    if (norm(filtro.q).trim().replace(/\s+/g, " ") !== t) return;
    ricercheContate.add(t);
    conta("ricerca_vuota", { dettaglio: t.slice(0, 40) });
  }, 1500);
}

function aggiornaRisultati() {
  const parole = norm(filtro.q).split(/\s+/).filter(Boolean);
  const lista = ATTIVITA.filter(a =>
    (!filtro.cat || a.categoria === filtro.cat) &&
    (!filtro.tag || (a.etichette || []).includes(filtro.tag)) &&
    (!filtro.aperte || stato(a)?.aperto) &&
    parole.every(p => norm(testoRicerca(a)).includes(p)));
  const box = document.getElementById("risultati");
  const cont = document.getElementById("conteggio");
  if (!box) return;
  cont.textContent = lista.length === 1 ? "1 attività" : `${lista.length} attività`;
  if (lista.length) {
    box.innerHTML = `<ul class="voci">${lista.map(voceAttivita).join("")}</ul>`;
  } else {
    const c = catDi(filtro.cat);
    const soloCat = c && !filtro.q && !filtro.tag && !filtro.aperte;
    box.innerHTML = `<div class="vuoto">
      <p><strong>${soloCat ? `Nessuna attività in «${esc(c.nome)}», per ora.` : filtro.aperte && !filtro.q ? "In questo momento non c'è nulla di aperto con questi filtri." : "Nessun risultato con questi filtri."}</strong></p>
      <p>${soloCat ? `Ne conosci una a Sacrofano? <a href="#/info?sez=segnala&tipo=nuova_attivita">Segnalala</a> e la aggiungiamo dopo averla verificata.` : `Prova con un'altra parola oppure togli un filtro.${filtro.q ? ` Se a Sacrofano esiste, <a href="#/info?sez=segnala&tipo=nuova_attivita">segnalacela</a>.` : ""}`}</p>
      ${soloCat ? "" : `<p><button type="button" class="bottone" data-azzera>Mostra tutte le attività</button></p>`}
    </div>`;
    if (filtro.q && !filtro.cat && !filtro.tag && !filtro.aperte) annotaRicercaVuota(filtro.q);
  }
  document.querySelectorAll("[data-cat]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cat === filtro.cat)));
  document.querySelectorAll("[data-tag]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tag === filtro.tag)));
  const ap = document.querySelector("[data-aperte]"); if (ap) ap.setAttribute("aria-pressed", String(filtro.aperte));
  const qs = new URLSearchParams();
  if (filtro.q) qs.set("q", filtro.q);
  if (filtro.cat) qs.set("cat", filtro.cat);
  if (filtro.tag) qs.set("tag", filtro.tag);
  if (filtro.aperte) qs.set("aperte", "1");
  const s = qs.toString();
  try { history.replaceState(null, "", location.pathname + "#/attivita" + (s ? "?" + s : "")); } catch (e) { /* niente */ }
}

function paginaScheda(id) {
  const a = ATTIVITA.find(x => x.id === id);
  if (!a) return paginaNonDisponibile();
  const c = catDi(a.categoria);
  const mappa = a.indirizzo ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(a.indirizzo) : "";
  const now = adessoRoma();
  const fasce = f => f && f.length ? f.map(([x, y]) => `${fmtOra(x)}–${fmtOra(y)}`).join(" e ") : "Chiuso";
  const orari = a.orari ? `<section class="blocco" aria-labelledby="h-orari"><h2 id="h-orari">Orari</h2>
    <table class="orari"><tbody>${GIORNI.map((k, i) => `<tr class="${i === now.g ? "oggi" : ""}"><th scope="row">${cap(GIORNI_NOME[i])}${i === now.g ? `<span class="oggi-badge">oggi</span>` : ""}</th><td>${fasce(a.orari[k])}</td></tr>`).join("")}</tbody></table>
  </section>` : "";
  const contatto = (href, tipo, icona, testo, cls, esterno) =>
    `<a class="azione ${cls || ""}" href="${esc(href)}" data-conta="${tipo}" data-att="${esc(a.id)}"${esterno ? ` target="_blank" rel="noopener"` : ""}>${icona}${esc(testo)}</a>`;
  const finto = (icona, testo, cls) => `<button type="button" class="azione ${cls || ""}" data-esempio>${icona}${esc(testo)}</button>`;
  const social = (Array.isArray(a.social) ? a.social : []).map(s => {
    const u = urlSicuro(s && s.url); if (!u) return "";
    const [nome, ic] = NOMI_SOCIAL[String(s.rete || "").toLowerCase()] || [s.nome || "Social", "web"];
    return contatto(u, "social", ICONE[ic], nome, "", true);
  }).join("");
  const sito = urlSicuro(a.sito), esterno = urlSicuro(a.link_esterno);
  const azioni = a.esempio ? [
    finto(ICONE.tel, "Chiama", "principale"), finto(ICONE.mappa, "Indicazioni"), finto(ICONE.wa, "WhatsApp"),
    `<button type="button" class="azione" data-condividi data-att="${esc(a.id)}">${ICONE.condividi}Condividi</button>`
  ].join("") : [
    a.tipo === "esterna" && esterno ? contatto(esterno, "sito", ICONE.web, "Vai al servizio", "principale", true) : "",
    a.telefono ? contatto("tel:" + soloNumero(a.telefono), "chiama", ICONE.tel, "Chiama " + (a.telefono_visibile || a.telefono), a.tipo === "esterna" ? "" : "principale") : "",
    a.whatsapp ? contatto("https://wa.me/" + soloNumero(a.whatsapp).replace(/\D/g, ""), "whatsapp", ICONE.wa, "WhatsApp", "", true) : "",
    mappa ? contatto(mappa, "indicazioni", ICONE.mappa, "Indicazioni", "", true) : "",
    sito ? contatto(sito, "sito", ICONE.web, "Sito web", "", true) : "",
    a.email ? contatto("mailto:" + a.email, "email", ICONE.mail, "Email") : "",
    social,
    `<button type="button" class="azione" data-condividi data-att="${esc(a.id)}">${ICONE.condividi}Condividi</button>`
  ].join("");
  const gal = (Array.isArray(a.galleria) ? a.galleria : []).filter(f => urlFoto(f));
  const fotoHTML = gal.length > 1
    ? `<div class="galleria" role="group" aria-label="Foto di ${esc(a.nome)}" tabindex="0">${gal.map(g => `<img src="${esc(urlFoto(g))}"${g.w && g.h ? ` width="${Number(g.w)}" height="${Number(g.h)}"` : ""} alt="${esc(g.alt || "")}" loading="lazy">`).join("")}</div>
      <p class="galleria-nota">${gal.length} foto: scorri di lato per vederle tutte.</p>`
    : gal.length === 1
      ? `<img class="scheda-foto" src="${esc(urlFoto(gal[0]))}" alt="${esc(gal[0].alt || "")}">`
      : `<div class="scheda-segnaposto" aria-hidden="true">${esc(a.icona || c?.icona || "📍")}</div>`;
  return `<article class="scheda">
    <a class="indietro" href="#/attivita?cat=${esc(a.categoria)}">‹ ${esc(c?.nome || "Attività")}</a>
    ${fotoHTML}
    <h1 tabindex="-1">${esc(a.nome)}</h1>
    ${a.esempio ? `<p class="scheda-esempio">Scheda di esempio: il negozio non esiste e i contatti non sono attivi.</p>` : ""}
    <p class="scheda-sotto">${esc(a.sottocategoria || c?.nome || "")}, ${esc(CFG.nomeComune || "Sacrofano")}${a.zona ? ` (${esc(a.zona.toLowerCase())})` : ""}</p>
    ${statoHTML(a, "stato-grande")}
    ${etichetteHTML(a)}
    <div class="azioni">${azioni}</div>

    ${a.prodotti?.length ? `<section class="blocco" aria-labelledby="h-prod"><h2 id="h-prod">Cosa trovi</h2>
      <ul class="prodotti">${a.prodotti.map(p => `<li><strong>${esc(p.nome)}</strong><span>${esc(p.dettaglio || "")}</span></li>`).join("")}</ul>
    </section>` : ""}

    ${orari}

    ${(a.acquisto?.length || a.pagamenti?.length || a.indirizzo || a.titolare) ? `<section class="blocco" aria-labelledby="h-come"><h2 id="h-come">Come acquistare</h2>
      <dl class="fatti">
        ${a.acquisto?.length ? `<dt>Dove e come</dt><dd>${a.acquisto.map(esc).join("<br>")}</dd>` : ""}
        ${a.pagamenti?.length ? `<dt>Pagamento</dt><dd>${esc(cap(a.pagamenti.map(x => x.toLowerCase()).join(" e ")))}</dd>` : ""}
        ${a.indirizzo ? `<dt>Indirizzo</dt><dd>${esc(a.indirizzo)}</dd>` : ""}
        ${a.titolare ? `<dt>Titolare</dt><dd>${esc(a.titolare)}</dd>` : ""}
      </dl>
    </section>` : ""}

    ${a.storia?.length ? `<section class="blocco" aria-labelledby="h-storia"><h2 id="h-storia">La storia</h2>
      ${a.storia.map(p => `<p class="storia">${esc(p)}</p>`).join("")}
    </section>` : ""}

    ${a.riconoscimenti?.length ? `<section class="blocco" aria-labelledby="h-ric"><h2 id="h-ric">Riconoscimenti</h2>
      <ul class="prodotti">${a.riconoscimenti.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
    </section>` : ""}

    <p class="aggiornato">Scheda aggiornata il ${dataLunga(giornoRoma(a.aggiornato_il))}. Hai notato un'informazione sbagliata? <a href="#/info?sez=segnala&tipo=errore&attivita=${esc(a.id)}">Segnalacelo</a>.</p>
  </article>`;
}

let filtroBacheca = "";
function paginaBacheca(q) {
  filtroBacheca = q.get("tipo") || "";
  const chip = (v, t) => `<button type="button" class="chip" data-tipo="${v}" aria-pressed="${filtroBacheca === v}">${t}</button>`;
  return `<h1 class="titolo-pagina" tabindex="-1">Bacheca</h1>
  <p class="intro">Eventi e avvisi di Sacrofano. Ogni avviso indica da dove arriva, e sparisce da solo quando è scaduto.</p>
  <div class="filtri" role="group" aria-label="Mostra">${chip("", "Tutto")}${chip("evento", "Eventi")}${chip("avviso", "Avvisi")}</div>
  <div id="lista-bacheca">${listaAvvisi(prossimi(filtroBacheca))}</div>
  <p class="nota">Conosci un evento in arrivo? <a href="#/info?sez=segnala&tipo=evento">Segnalalo</a>.</p>
  <p class="nota">Per le emergenze fanno fede solo i canali ufficiali: in caso di pericolo chiama il <a href="tel:112">112</a>.</p>`;
}

function voceServizio(v) {
  const tel = /^tel:/.test(v.link);
  const link = tel ? "tel:" + soloNumero(v.link.slice(4)) : urlSicuro(v.link);
  if (!link) return "";
  return `<li><a class="servizio ${v.urgente ? "urgente" : ""}" href="${esc(link)}" ${tel ? "" : `target="_blank" rel="noopener"`}>
    <span><strong>${esc(v.nome)}</strong><span class="desc">${esc(v.descrizione || "")}</span></span>
    <span class="dove">${tel ? "Chiama" : "Sito ufficiale ↗"}</span>
  </a></li>`;
}

function paginaServizi() {
  const gruppi = [];
  SERVIZI.forEach(s => {
    let g = gruppi.find(x => x.nome === s.gruppo);
    if (!g) { g = { nome: s.gruppo, voci: [] }; gruppi.push(g); }
    g.voci.push(s);
  });
  return `<h1 class="titolo-pagina" tabindex="-1">Servizi utili</h1>
  <p class="intro">Link diretti ai servizi pubblici che servono più spesso. Si aprono sui siti ufficiali: Territoria non li gestisce.</p>
  ${boxAutobus()}
  ${gruppi.map((g, i) => `<section class="gruppo" aria-labelledby="g-${i}">
    <h2 id="g-${i}">${esc(g.nome)}</h2>
    <ul class="servizi">${g.voci.map(voceServizio).join("")}</ul>
  </section>`).join("")}`;
}

/* =====================================================================
   AUTOBUS E PULMINI
   Gli orari arrivano dalla tabella "orari_trasporto" e si cambiano dal
   pannello. Il giorno (feriale, sabato, festivo) si capisce da solo.
   ===================================================================== */
const TIPI_GIORNO = [["feriali", "Lun–Ven"], ["sabato", "Sabato"], ["festivi", "Domenica e festivi"]];
const NOMI_GIORNO = { feriali: "dal lunedì al venerdì", sabato: "il sabato", festivi: "la domenica e nei festivi", tutti: "tutti i giorni" };

function pasqua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(Date.UTC(y, Math.floor(n / 31) - 1, (n % 31) + 1));
}
function festivoNazionale(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const md = iso.slice(5);
  const fisse = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"];
  if (y >= 2026) fisse.push("10-04"); /* San Francesco, di nuovo festa nazionale dal 2026 */
  if (Array.isArray(CFG.festeLocali)) fisse.push(...CFG.festeLocali); /* patrono e feste del paese, da config.js */
  if (fisse.includes(md)) return true;
  const pasquetta = pasqua(y); pasquetta.setUTCDate(pasquetta.getUTCDate() + 1);
  return pasquetta.getUTCMonth() + 1 === m && pasquetta.getUTCDate() === d;
}
const tipoGiorno = (iso, g) => (g === 6 || festivoNazionale(iso)) ? "festivi" : g === 5 ? "sabato" : "feriali";
const tabelleDel = tipo => ORARI.filter(t => t.giorni === tipo || t.giorni === "tutti");
const corseDi = t => Array.isArray(t.corse) ? t.corse.filter(c => c && Array.isArray(c.orari)) : [];
const fermateDi = t => Array.isArray(t.fermate) && t.fermate.length ? t.fermate : ["Ora"];
const colonnaPrincipale = t => (Number.isInteger(t.fermata_comune) && t.fermata_comune < fermateDi(t).length) ? t.fermata_comune : 0;
const oraValida = x => typeof x === "string" && /^\d{2}:\d{2}$/.test(x);
const minutiDi = (c, col) => oraValida(c.orari[col]) ? toMin(c.orari[col]) : null;
function traQuanto(min) {
  if (min < 1) return "adesso";
  if (min < 60) return `tra ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return min < 180 ? `tra ${h} h${m ? " " + m + " min" : ""}` : "";
}
const classeMezzo = m => /cotral/i.test(m || "") ? "cotral" : /pulmin|unit/i.test(m || "") ? "pulmino" : "altro";
const badgeMezzo = m => m ? `<span class="mezzo ${classeMezzo(m)}">${esc(m)}</span>` : "";

/* Gruppi nell'ordine scelto dal pannello: { nome, sottotitolo, tabelle[] } */
function gruppiDi(tabelle) {
  const gruppi = [];
  tabelle.forEach(t => {
    let g = gruppi.find(x => x.nome === t.gruppo);
    if (!g) { g = { nome: t.gruppo, sottotitolo: t.sottotitolo, tabelle: [] }; gruppi.push(g); }
    g.tabelle.push(t);
  });
  return gruppi;
}

/* Le prossime corse da Sacrofano, per ogni direzione che parte da qui */
function htmlProssime() {
  const ora = adessoRoma(), tipo = tipoGiorno(ora.data, ora.g);
  const tabelle = tabelleDel(tipo).filter(t => Number.isInteger(t.fermata_comune));
  if (!tabelle.length) {
    return tipo === "festivi" && tabelleDel("feriali").length
      ? `<p class="bus-vuoto">Oggi è festivo: non ci sono corse in programma.</p>`
      : `<p class="bus-vuoto">Oggi non ci sono corse in programma.</p>`;
  }
  const righe = tabelle.map(t => {
    const col = t.fermata_comune;
    const dopo = corseDi(t).map(c => ({ c, min: minutiDi(c, col) })).filter(x => x.min !== null && x.min >= ora.min)
      .sort((a, b) => a.min - b.min).slice(0, 2);
    const prima = dopo[0];
    return `<li>
      <span class="bus-verso">${esc(t.direzione)}</span>
      ${prima ? `<span class="bus-ora"><b>${esc(fmtOra(prima.c.orari[col]))}</b>${badgeMezzo(prima.c.mezzo)}<span class="tra">${esc(traQuanto(prima.min - ora.min))}</span></span>
        ${dopo[1] ? `<span class="bus-poi">poi ${esc(fmtOra(dopo[1].c.orari[col]))}${dopo[1].c.mezzo ? " · " + esc(dopo[1].c.mezzo) : ""}</span>` : `<span class="bus-poi">ultima corsa di oggi</span>`}`
      : `<span class="bus-poi">Per oggi le corse sono finite</span>`}
    </li>`;
  }).join("");
  return `<ul class="bus-prossime">${righe}</ul>`;
}

function boxAutobus() {
  if (!ORARI.length) return "";
  return `<section class="bus-box" aria-labelledby="h-bus">
    <div class="bus-capo"><h2 id="h-bus">Autobus e pulmini</h2><a href="#/orari">Tutti gli orari ›</a></div>
    <p class="bus-sotto">Prossime partenze da Sacrofano</p>
    <div data-bus-prossime>${htmlProssime()}</div>
  </section>`;
}

function righeTabella(t, oggiAttivo, adesso) {
  const fermate = fermateDi(t), col = colonnaPrincipale(t);
  const corse = corseDi(t);
  const mezzi = [...new Set(corse.map(c => c.mezzo || ""))];
  const conMezzo = mezzi.length > 1 || (mezzi[0] && fermate.length === 1);
  const testa = `<thead><tr>${fermate.map((f, i) => `<th scope="col"${i === col ? ' class="principale"' : ""}>${esc(f)}</th>`).join("")}${conMezzo ? `<th scope="col">Mezzo</th>` : ""}</tr></thead>`;
  let prossimaTrovata = false;
  const corpo = corse.map(c => {
    const min = minutiDi(c, col);
    let classe = "";
    if (oggiAttivo && min !== null) {
      if (min < adesso) classe = "passata";
      else if (!prossimaTrovata) { classe = "prossima"; prossimaTrovata = true; }
    }
    const celle = fermate.map((_, i) => {
      const o = c.orari[i];
      const testo = oraValida(o) ? esc(fmtOra(o)) : "–";
      return i === col
        ? `<td class="principale"><b>${testo}</b>${classe === "prossima" ? ` <span class="tra" data-tra>${esc(traQuanto(min - adesso))}</span>` : ""}</td>`
        : `<td>${testo}</td>`;
    }).join("");
    const nota = c.nota ? `<tr class="bus-nota-riga${classe ? " " + classe : ""}"><td colspan="${fermate.length + (conMezzo ? 1 : 0)}">${esc(c.nota)}</td></tr>` : "";
    return `<tr class="${classe}"${min !== null ? ` data-min="${min}"` : ""}>${celle}${conMezzo ? `<td>${badgeMezzo(c.mezzo)}</td>` : ""}</tr>${nota}`;
  }).join("");
  return `<table class="bus-tabella"${oggiAttivo ? " data-bus-oggi" : ""}>${testa}<tbody>${corpo}</tbody></table>`;
}

function paginaOrari(q) {
  const ora = adessoRoma(), oggi = tipoGiorno(ora.data, ora.g);
  const scelto = TIPI_GIORNO.some(x => x[0] === q.get("giorno")) ? q.get("giorno") : oggi;
  const oggiAttivo = scelto === oggi;
  if (!ORARI.length) {
    return `<h1 class="titolo-pagina" tabindex="-1">Autobus e pulmini</h1>
    <p class="intro">Gli orari non sono ancora disponibili.</p>`;
  }
  const periodi = [...new Set(ORARI.map(t => t.periodo).filter(Boolean))];
  const trasporti = SERVIZI.filter(v => /trasport/i.test(v.gruppo || ""));
  const chip = ([v, nome]) => `<a class="chip" href="#/orari?giorno=${v}"${v === scelto ? ' aria-current="true"' : ""}>${esc(nome)}${v === oggi ? " · oggi" : ""}</a>`;
  const gruppi = gruppiDi(tabelleDel(scelto));
  const corpo = gruppi.length ? gruppi.map((g, gi) => {
    const pulsanti = g.tabelle.length > 1
      ? `<div class="bus-direzioni" role="group" aria-label="Direzione">${g.tabelle.map((t, ti) => `<button type="button" class="chip" data-bus-dir="${gi}-${ti}" aria-pressed="${ti === 0}">${esc(t.direzione)}</button>`).join("")}</div>`
      : "";
    const pannelli = g.tabelle.map((t, ti) => {
      const scaduto = t.valido_al && t.valido_al < ora.data;
      const futuro = t.valido_dal && t.valido_dal > ora.data;
      return `<div class="bus-pannello" data-bus-pannello="${gi}-${ti}"${ti === 0 ? "" : " hidden"}>
        ${g.tabelle.length > 1 ? "" : `<p class="bus-direzione-unica">${esc(t.direzione)}</p>`}
        ${t.percorso ? `<p class="bus-percorso">${esc(t.percorso)}</p>` : ""}
        ${scaduto ? `<p class="chiusura">Questo orario valeva fino al ${esc(dataLunga(t.valido_al))}: potrebbe essere cambiato.</p>` : ""}
        ${futuro ? `<p class="chiusura">Questo orario entra in vigore il ${esc(dataLunga(t.valido_dal))}.</p>` : ""}
        ${corseDi(t).length ? righeTabella(t, oggiAttivo, ora.min) : `<p class="nota">Nessuna corsa in questa direzione.</p>`}
        ${t.legenda ? `<p class="nota">${esc(t.legenda)}</p>` : ""}
        ${t.note ? `<p class="nota">${esc(t.note)}</p>` : ""}
        ${t.fonte_nome ? `<p class="nota">Fonte: ${urlSicuro(t.fonte_url) ? `<a href="${esc(t.fonte_url)}" target="_blank" rel="noopener">${esc(t.fonte_nome)}</a>` : esc(t.fonte_nome)}.${t.aggiornato_il ? ` Aggiornato su Territoria il ${esc(dataLunga(giornoRoma(t.aggiornato_il)))}.` : ""}</p>` : ""}
      </div>`;
    }).join("");
    return `<section class="sezione bus-gruppo" aria-labelledby="bus-g-${gi}">
      <h2 id="bus-g-${gi}">${esc(g.nome)}</h2>
      ${g.sottotitolo ? `<p class="bus-sotto">${esc(g.sottotitolo)}</p>` : ""}
      ${pulsanti}${pannelli}
    </section>`;
  }).join("")
  : `<div class="riquadro bus-niente"><p><strong>${scelto === "festivi" ? "La domenica e nei giorni festivi non ci sono corse." : "Per questo giorno non ci sono corse in programma."}</strong></p></div>`;

  return `<h1 class="titolo-pagina" tabindex="-1">Autobus e pulmini</h1>
  <p class="intro">Le corse ${esc(NOMI_GIORNO[scelto])}${oggiAttivo ? ". In grigio quelle già passate, evidenziata la prossima" : ""}.${periodi.length ? " " + esc(periodi.join(" · ")) + "." : ""}</p>
  <div class="bus-giorni" role="group" aria-label="Giorno">${TIPI_GIORNO.map(chip).join("")}</div>
  ${corpo}
  <section class="sezione" aria-labelledby="h-bus-info">
    <h2 id="h-bus-info">Variazioni e informazioni</h2>
    <p class="intro">Gli orari cambiano spesso, anche per scioperi o lavori: come raccomanda il Comune, prima di partire controlla i siti di Astral e COTRAL.</p>
    ${trasporti.length ? `<ul class="servizi">${trasporti.map(voceServizio).join("")}</ul>` : ""}
    <p class="nota">Hai visto un orario sbagliato? <a href="#/info?tipo=altro&sez=segnala">Segnalacelo</a>.</p>
  </section>`;
}

/* Ogni minuto: aggiorna "prossima corsa" senza ridisegnare la pagina */
function aggiornaBus() {
  const ora = adessoRoma();
  const box = document.querySelector("[data-bus-prossime]");
  if (box) box.innerHTML = htmlProssime();
  document.querySelectorAll("[data-bus-oggi] tbody").forEach(tb => {
    let trovata = false;
    tb.querySelectorAll("tr[data-min]").forEach(tr => {
      const min = Number(tr.dataset.min);
      const passata = min < ora.min, prossima = !passata && !trovata;
      if (prossima) trovata = true;
      const nota = tr.nextElementSibling && tr.nextElementSibling.classList.contains("bus-nota-riga") ? tr.nextElementSibling : null;
      [tr, nota].forEach(x => { if (x) { x.classList.toggle("passata", passata); x.classList.toggle("prossima", prossima); } });
      const cella = tr.querySelector("td.principale");
      let tra = cella.querySelector("[data-tra]");
      if (prossima) {
        if (!tra) { tra = document.createElement("span"); tra.className = "tra"; tra.setAttribute("data-tra", ""); cella.append(" ", tra); }
        tra.textContent = traQuanto(min - ora.min);
      } else if (tra) tra.remove();
    });
  });
}

const TIPI_SEGNALAZIONE = [
  ["nuova_attivita", "Un'attività che manca"],
  ["evento", "Un evento o un avviso"],
  ["errore", "Un errore in una scheda"],
  ["modifica_scheda", "Voglio modificare la mia scheda"],
  ["altro", "Altro"]
];
function paginaInfo(q) {
  const tipo = TIPI_SEGNALAZIONE.some(t => t[0] === q.get("tipo")) ? q.get("tipo") : "nuova_attivita";
  const att = q.get("attivita") || "";
  const conScheda = ["errore", "modifica_scheda"].includes(tipo);
  return `<h1 class="titolo-pagina" tabindex="-1">Cos'è questo sito</h1>
  <div class="testo">
    <p>È una guida pratica a Sacrofano: chi produce e vende in paese, dove trovare un servizio, cosa succede nei prossimi giorni. L'idea è semplice: far conoscere a chi vive qui quello che il paese già offre, e aiutare le attività locali a farsi trovare.</p>
    <p>È un progetto di <strong>Territoria</strong>, un'iniziativa privata e indipendente nata a Sacrofano. Non è il sito del Comune e non pubblica atti ufficiali.</p>
  </div>

  <section class="sezione" aria-labelledby="h-come-f">
    <h2 id="h-come-f">Come vengono raccolte le informazioni</h2>
    <ol class="passi testo">
      <li>Parliamo direttamente con chi gestisce l'attività.</li>
      <li>Pubblichiamo la scheda solo con il suo consenso firmato.</li>
      <li>Aggiorniamo orari e prodotti quando cambiano, e indichiamo sempre la data dell'ultimo aggiornamento.</li>
    </ol>
  </section>

  <section class="sezione" id="segnala" aria-labelledby="h-segnala">
    <h2 id="h-segnala">Segnala un'attività, un evento o un errore</h2>
    <div class="riquadro testo" id="box-segnala">
      <form class="modulo" id="modulo-segnala" novalidate>
        <label class="campo"><span>Cosa vuoi segnalare?</span>
          <select name="tipo" id="seg-tipo">${TIPI_SEGNALAZIONE.map(([v, t]) => `<option value="${v}"${v === tipo ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
        </label>
        <label class="campo" id="seg-campo-att"${conScheda ? "" : " hidden"}><span>Quale scheda?</span>
          <select name="attivita_id"><option value="">Nessuna in particolare</option>${ATTIVITA.filter(a => !a.esempio).map(a => `<option value="${esc(a.id)}"${a.id === att ? " selected" : ""}>${esc(a.nome)}</option>`).join("")}</select>
        </label>
        <label class="campo"><span>Scrivi qui</span>
          <small id="seg-aiuto">Più dettagli ci dai, prima possiamo verificare. Non scrivere dati sensibili.</small>
          <textarea name="messaggio" id="seg-messaggio" maxlength="2000" aria-describedby="seg-aiuto seg-errore"></textarea>
          <span class="errore-campo" id="seg-errore"></span>
        </label>
        <label class="campo"><span>Il tuo contatto (facoltativo)</span>
          <small>Email o telefono, solo se vuoi una risposta. Lo cancelliamo dopo aver gestito la segnalazione.</small>
          <input name="contatto" maxlength="200" autocomplete="off">
        </label>
        <div class="trappola" aria-hidden="true"><label>Lascia vuoto questo campo<input name="sito_web" tabindex="-1" autocomplete="off"></label></div>
        <p class="nota">Useremo il messaggio, e il contatto se lo lasci, solo per gestire la segnalazione. <a href="#/privacy">Informativa privacy</a>.</p>
        <button type="submit" class="invia">Invia la segnalazione</button>
        <p class="esito-invio" id="seg-esito" role="status" aria-live="polite"></p>
      </form>
    </div>
  </section>

  <section class="sezione" aria-labelledby="h-priv">
    <h2 id="h-priv">Privacy</h2>
    <div class="testo">
      <p>Il sito non usa cookie e non ti chiede di registrarti. Conta in forma anonima le visite e i clic sui pulsanti, per capire cosa è utile: non sappiamo chi sei.</p>
      <p><a href="#/privacy">Leggi l'informativa completa e le note legali</a>.</p>
    </div>
  </section>`;
}

/* =====================================================================
   PRIVACY E NOTE LEGALI
   Titolare ed email arrivano da config.js. Se cambia qualcosa nel modo
   in cui il sito tratta i dati, aggiorna questo testo e la data.
   ===================================================================== */
const PRIVACY_AGGIORNATA = "12 novembre 2026";
function paginaPrivacy() {
  const titolare = esc(CFG.titolare || "Boris Kim Kekulawala Cutipa");
  const email = esc(CFG.emailContatto || "territoria.sacrofano@gmail.com");
  const mail = `<a href="mailto:${email}">${email}</a>`;
  return `<h1 class="titolo-pagina" tabindex="-1">Privacy e note legali</h1>
  <p class="intro">Informativa ai sensi degli articoli 13 e 14 del Regolamento UE 2016/679 (GDPR). Ultimo aggiornamento: ${PRIVACY_AGGIORNATA}.</p>

  <div class="riquadro testo">
    <h2 class="titoletto">In breve</h2>
    <ul class="passi">
      <li>Il sito non usa cookie e non ti chiede di registrarti.</li>
      <li>Non sappiamo chi sei: le visite si contano in forma anonima.</li>
      <li>A parte i registri tecnici di sicurezza dei fornitori, trattiamo dati personali solo se ce li mandi tu con il modulo di segnalazione, o se un'attività firma il consenso per la propria scheda.</li>
      <li>Non vendiamo dati e non li usiamo per pubblicità.</li>
    </ul>
  </div>

  <section class="sezione testo" aria-labelledby="h-p-titolare">
    <h2 id="h-p-titolare">Chi è il titolare</h2>
    <p>Il titolare del trattamento è <strong>${titolare}</strong>, promotore di Territoria ${esc(CFG.nomeComune || "Sacrofano")}. Per qualsiasi domanda o richiesta sui tuoi dati scrivi a ${mail}.</p>
  </section>

  <section class="sezione testo" aria-labelledby="h-p-visita">
    <h2 id="h-p-visita">Quando visiti il sito</h2>
    <p><strong>Niente cookie e niente tracciamento.</strong> Il sito non usa cookie, non crea profili e non contiene strumenti pubblicitari o di analisi di altre aziende. Anche i caratteri tipografici sono ospitati qui: il tuo browser non contatta Google o altri servizi per mostrarli.</p>
    <p><strong>Statistiche anonime.</strong> Contiamo quante volte succede qualcosa: una visita, l'apertura di una scheda, un clic su Chiama o Indicazioni. Per ogni conteggio salviamo solo il giorno, l'ora, la scheda interessata e una provenienza generica (per esempio QR code o WhatsApp). Quando una ricerca non trova risultati salviamo il testo cercato, per capire cosa manca in paese. Non salviamo indirizzi IP né altri dati che permettano di riconoscerti.</p>
    <p><strong>Registri tecnici dei fornitori.</strong> Come per ogni sito, le richieste passano dai server dei fornitori che ospitano le pagine (GitHub) e il database (Supabase). Per motivi di sicurezza questi registrano dati tecnici come l'indirizzo IP e il tipo di browser, e li conservano per il tempo previsto dalle loro regole. Base giuridica: il legittimo interesse a mantenere il sito sicuro e funzionante (art. 6.1.f GDPR).</p>
  </section>

  <section class="sezione testo" aria-labelledby="h-p-segnala">
    <h2 id="h-p-segnala">Quando ci mandi una segnalazione</h2>
    <p><strong>Quali dati.</strong> Il tipo di segnalazione, il messaggio, l'eventuale scheda a cui si riferisce e il tuo contatto (email o telefono), solo se scegli di lasciarlo.</p>
    <p><strong>Perché.</strong> Per verificare la segnalazione, aggiornare il sito e, se hai lasciato un contatto, risponderti.</p>
    <p><strong>Base giuridica.</strong> Il tuo consenso, che dai inviando il modulo (art. 6.1.a GDPR). Puoi ritirarlo quando vuoi scrivendo a ${mail}.</p>
    <p><strong>Per quanto tempo.</strong> Il contatto viene cancellato appena la segnalazione è gestita. Il messaggio resta in archivio per 12 mesi dalla gestione, poi viene cancellato automaticamente. Le segnalazioni le legge solo il titolare.</p>
    <p>Ti chiediamo di non scrivere nel messaggio dati sensibili, come informazioni sulla salute.</p>
  </section>

  <section class="sezione testo" aria-labelledby="h-p-attivita">
    <h2 id="h-p-attivita">Se gestisci un'attività presente sul sito</h2>
    <p>La scheda pubblica solo i dati scelti nel modulo di adesione firmato: nome dell'attività, contatti, orari, prodotti, foto e, se autorizzato, il nome del titolare.</p>
    <p><strong>Base giuridica.</strong> Il consenso dato nel modulo (art. 6.1.a GDPR), che puoi ritirare in qualsiasi momento, del tutto o in parte, con un messaggio scritto.</p>
    <p><strong>Per quanto tempo.</strong> Finché la scheda è attiva. Dopo la revoca, la scheda o l'elemento revocato vengono tolti dal sito entro 7 giorni e cancellati dagli archivi entro 30 giorni. Il modulo firmato non viene mai pubblicato: lo conserviamo fuori dal sito come prova del consenso.</p>
  </section>

  <section class="sezione testo" aria-labelledby="h-p-fornitori">
    <h2 id="h-p-fornitori">Chi tratta i dati per nostro conto</h2>
    <ul class="passi">
      <li><strong>GitHub Inc.</strong> (Stati Uniti) ospita le pagine del sito.</li>
      <li><strong>Supabase Inc.</strong> (Stati Uniti) ospita il database e le foto.</li>
      <li><strong>Google</strong> gestisce la casella Gmail a cui arrivano le email che ci scrivi.</li>
    </ul>
    <p>Quando i dati escono dall'Unione Europea, il trasferimento avviene con le garanzie previste dal GDPR, come le clausole contrattuali standard approvate dalla Commissione europea o il Data Privacy Framework UE-USA. Non comunichiamo i dati ad altri.</p>
  </section>

  <section class="sezione testo" aria-labelledby="h-p-link">
    <h2 id="h-p-link">Link verso altri servizi</h2>
    <p>I pulsanti WhatsApp, Indicazioni, i profili social e i siti delle attività aprono servizi esterni, che hanno le proprie regole sulla privacy. Il sito non comunica loro nulla finché non li apri tu.</p>
  </section>

  <section class="sezione testo" aria-labelledby="h-p-diritti">
    <h2 id="h-p-diritti">I tuoi diritti</h2>
    <p>Puoi chiedere in qualsiasi momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne l'uso, opporti al trattamento, riceverli in un formato leggibile e ritirare il consenso dato, scrivendo a ${mail}. Rispondiamo entro un mese.</p>
    <p>Se ritieni che i tuoi dati siano trattati in modo non corretto, puoi presentare reclamo al <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">Garante per la protezione dei dati personali</a>.</p>
    <p>Il sito non prende decisioni automatiche sulle persone e non fa profilazione.</p>
  </section>

  <section class="sezione testo" aria-labelledby="h-p-note">
    <h2 id="h-p-note">Note legali</h2>
    <p>Territoria ${esc(CFG.nomeComune || "Sacrofano")} è un progetto privato e indipendente, gestito da ${titolare}. È gratuito per chi lo consulta e per le attività presenti. Non è il sito del Comune e non lo rappresenta.</p>
    <p>Le informazioni sulle attività sono fornite dai titolari, che ne sono responsabili. Le verifichiamo e le aggiorniamo, ma orari e prodotti possono cambiare: nel dubbio, contatta direttamente l'attività. Avvisi ed eventi riportano sempre la fonte.</p>
    <p>Il sito non vende nulla e non gestisce acquisti o pagamenti: ogni acquisto avviene direttamente con l'attività.</p>
    <p>Il sito non è una testata giornalistica, perché è aggiornato senza una periodicità fissa (legge 7 marzo 2001, n. 62).</p>
    <p>Foto e testi delle schede appartengono alle attività o ai loro autori e sono pubblicati con il loro permesso: per riutilizzarli serve il loro consenso.</p>
    <p>I caratteri tipografici Atkinson Hyperlegible (Braille Institute) e Bricolage Grotesque sono distribuiti con licenza SIL Open Font License 1.1.</p>
    <p>Per segnalare un errore o un contenuto da correggere usa il <a href="#/info?sez=segnala">modulo di segnalazione</a> o scrivi a ${mail}.</p>
  </section>`;
}

function paginaNonDisponibile() {
  return `<h1 class="titolo-pagina" tabindex="-1">Scheda non disponibile</h1>
  <p class="intro">Questa attività non è presente sul sito, oppure non è più pubblicata.</p>
  <p><a class="bottone" href="#/attivita">Vedi tutte le attività</a></p>`;
}
function pagina404() {
  return `<h1 class="titolo-pagina" tabindex="-1">Pagina non trovata</h1>
  <p class="intro">Questo indirizzo non corrisponde a nessuna pagina del sito.</p>
  <p><a class="bottone" href="#/">Torna all'inizio</a></p>`;
}

function paginaErrore() {
  return `<section class="hero">${CURVE}<h1 class="hero-titolo" tabindex="-1">${esc(CFG.nomeComune || "Sacrofano")}</h1></section>
  <div class="errore-dati" role="alert">
    <h2>Il sito non riesce a caricare le informazioni</h2>
    <p>Può dipendere dalla connessione o da una pausa del servizio. Riprova tra qualche minuto.</p>
    <button type="button" class="bottone" data-riprova>Riprova</button>
  </div>`;
}
function paginaDaConfigurare() {
  return `<section class="hero">${CURVE}<h1 class="hero-titolo" tabindex="-1">${esc(CFG.nomeComune || "Sacrofano")}</h1></section>
  <div class="errore-dati" role="alert">
    <h2>Manca il collegamento al database</h2>
    <p>Apri il file <strong>config.js</strong> e incolla il Project URL e la chiave Publishable di Supabase al posto delle scritte INCOLLA_QUI.</p>
  </div>`;
}

/* =====================================================================
   NAVIGAZIONE
   ===================================================================== */
const TITOLI = { "": "Sacrofano", attivita: "Attività", bacheca: "Bacheca", servizi: "Servizi utili", info: "Info" };
const TITOLI_PAGINE = { privacy: "Privacy e note legali", orari: "Orari autobus e pulmini" };
let pronto = false;

function leggiHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  return { parti: path.split("/").filter(Boolean), q: new URLSearchParams(qs || "") };
}

function mostra(primo) {
  if (!pronto) return;
  const { parti: p, q } = leggiHash();
  const r = p[0] || "";
  let html, sezione = r;
  if (r === "") html = paginaHome();
  else if (r === "attivita") html = paginaAttivita(q);
  else if (r === "a") { html = paginaScheda(p[1]); sezione = "attivita"; }
  else if (r === "bacheca") html = paginaBacheca(q);
  else if (r === "servizi") html = paginaServizi();
  else if (r === "info") html = paginaInfo(q);
  else if (r === "privacy") { html = paginaPrivacy(); sezione = "info"; }
  else if (r === "orari") { html = paginaOrari(q); sezione = "servizi"; }
  else html = pagina404();
  main.innerHTML = html;
  document.querySelectorAll("[data-nav]").forEach(a => {
    if (a.dataset.nav === sezione) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (r === "attivita") {
    aggiornaRisultati();
    main.querySelectorAll('.filtri [aria-pressed="true"]').forEach(b => b.scrollIntoView({ inline: "center", block: "nearest" }));
  }
  const scheda = r === "a" ? ATTIVITA.find(x => x.id === p[1]) : null;
  if (scheda) conta("scheda", { attivita_id: scheda.id });
  if (r === "orari" && !q.get("giorno")) conta("orari");
  document.title = (scheda ? scheda.nome : (TITOLI_PAGINE[r] || TITOLI[sezione] || "Sacrofano")) + " | Territoria";
  const sez = q.get("sez");
  if (sez && document.getElementById(sez)) document.getElementById(sez).scrollIntoView();
  else window.scrollTo(0, 0);
  if (!primo) { const h1 = main.querySelector("h1"); if (h1) h1.focus({ preventScroll: true }); }
}

/* =====================================================================
   INTERAZIONI
   ===================================================================== */
const toast = document.querySelector("[data-toast]");
function avvisa(t) { toast.textContent = t; toast.classList.add("visibile"); clearTimeout(avvisa.t); avvisa.t = setTimeout(() => toast.classList.remove("visibile"), 2200); }

main.addEventListener("submit", e => {
  if (e.target.matches("[data-cerca-home]")) {
    e.preventDefault();
    const v = e.target.q.value.trim();
    location.hash = "#/attivita" + (v ? "?q=" + encodeURIComponent(v) : "");
  } else if (e.target.id === "modulo-segnala") {
    e.preventDefault();
    inviaSegnalazione(e.target);
  }
});

main.addEventListener("input", e => {
  if (e.target.id === "q") { filtro.q = e.target.value; aggiornaRisultati(); }
  if (e.target.id === "seg-messaggio") {
    e.target.removeAttribute("aria-invalid");
    document.getElementById("seg-errore").textContent = "";
  }
});

main.addEventListener("change", e => {
  if (e.target.id === "seg-tipo") {
    const campo = document.getElementById("seg-campo-att");
    if (campo) campo.hidden = !["errore", "modifica_scheda"].includes(e.target.value);
  }
});

main.addEventListener("click", async e => {
  const link = e.target.closest("a[data-conta]");
  if (link) { conta(link.dataset.conta, { attivita_id: link.dataset.att }); return; }

  const b = e.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-cat")) { filtro.cat = b.dataset.cat; aggiornaRisultati(); }
  else if (b.hasAttribute("data-tag")) { filtro.tag = filtro.tag === b.dataset.tag ? "" : b.dataset.tag; aggiornaRisultati(); }
  else if (b.hasAttribute("data-aperte")) { filtro.aperte = !filtro.aperte; aggiornaRisultati(); }
  else if (b.hasAttribute("data-azzera")) { filtro = { q: "", cat: "", tag: "", aperte: false }; const i = document.getElementById("q"); if (i) i.value = ""; aggiornaRisultati(); }
  else if (b.hasAttribute("data-tipo")) {
    filtroBacheca = b.dataset.tipo;
    document.getElementById("lista-bacheca").innerHTML = listaAvvisi(prossimi(filtroBacheca));
    document.querySelectorAll("[data-tipo]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.tipo === filtroBacheca)));
    try { history.replaceState(null, "", location.pathname + "#/bacheca" + (filtroBacheca ? "?tipo=" + filtroBacheca : "")); } catch (err) { /* niente */ }
  }
  else if (b.hasAttribute("data-bus-dir")) {
    const [g] = b.dataset.busDir.split("-");
    document.querySelectorAll(`[data-bus-dir^="${g}-"]`).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    document.querySelectorAll(`[data-bus-pannello^="${g}-"]`).forEach(x => { x.hidden = x.dataset.busPannello !== b.dataset.busDir; });
  }
  else if (b.hasAttribute("data-esempio")) { avvisa("Scheda di esempio: contatti non attivi"); }
  else if (b.hasAttribute("data-condividi")) {
    if (b.dataset.att) conta("condividi", { attivita_id: b.dataset.att });
    const dati = { title: document.title, url: location.href };
    try {
      if (navigator.share) await navigator.share(dati);
      else { await navigator.clipboard.writeText(location.href); avvisa("Link copiato"); }
    } catch (err) { if (err && err.name !== "AbortError") avvisa("Copia il link dalla barra degli indirizzi"); }
  }
  else if (b.hasAttribute("data-riprova")) { avvia(); }
});

async function inviaSegnalazione(form) {
  const esito = document.getElementById("seg-esito");
  const errore = document.getElementById("seg-errore");
  const msg = form.messaggio.value.trim();
  const bottone = form.querySelector(".invia");
  esito.textContent = ""; esito.className = "esito-invio";
  if (msg.length < 5) {
    errore.textContent = "Scrivi almeno qualche parola.";
    form.messaggio.setAttribute("aria-invalid", "true");
    form.messaggio.focus();
    return;
  }
  /* Campo trappola: se è pieno l'ha compilato un programma automatico */
  if (form.sito_web.value) { mostraGrazie(); return; }
  if (bottone.getAttribute("aria-busy") === "true") return;
  bottone.setAttribute("aria-busy", "true");
  bottone.textContent = "Invio in corso…";
  const tipo = form.tipo.value;
  const dati = {
    tipo,
    messaggio: msg,
    contatto: form.contatto.value.trim() || null,
    attivita_id: ["errore", "modifica_scheda"].includes(tipo) && form.attivita_id.value ? form.attivita_id.value : null
  };
  try {
    await scrivi("segnalazioni", dati);
    mostraGrazie();
  } catch (err) {
    esito.className = "esito-invio ko";
    esito.textContent = err.daMostrare ? err.message : "Non è stato possibile inviare la segnalazione. Controlla la connessione e riprova.";
    bottone.removeAttribute("aria-busy");
    bottone.textContent = "Invia la segnalazione";
  }
}
function mostraGrazie() {
  const box = document.getElementById("box-segnala");
  if (!box) return;
  box.innerHTML = `<div class="grazie" tabindex="-1" id="seg-grazie">
    <h3>Segnalazione inviata</h3>
    <p>Grazie. La controlliamo e, se serve, ti ricontattiamo.</p>
  </div>`;
  document.getElementById("seg-grazie").focus();
}

document.querySelector("[data-salta]").addEventListener("click", e => { e.preventDefault(); main.focus(); });
window.addEventListener("hashchange", () => mostra(false));

/* =====================================================================
   AVVIO
   ===================================================================== */
async function avvia() {
  if (!configurato) { main.innerHTML = paginaDaConfigurare(); return; }
  main.innerHTML = `<section class="hero">${CURVE}<h1 class="hero-titolo">${esc(CFG.nomeComune || "Sacrofano")}</h1>
    <p class="hero-sotto">Botteghe, produttori e servizi del paese, in un posto solo.</p><p class="caricamento" role="status">Caricamento…</p></section>`;
  try {
    await caricaDati();
  } catch (e) {
    main.innerHTML = paginaErrore();
    return;
  }
  pronto = true;
  const date = ATTIVITA.map(a => a.aggiornato_il).concat(ANNUNCI.map(x => x.aggiornato_il)).filter(Boolean).sort();
  if (date.length) document.querySelector("[data-aggiornato]").textContent = "Informazioni aggiornate al " + dataLunga(giornoRoma(date[date.length - 1])) + ".";
  mostra(true);
}

registraVisita();
avvia();
setInterval(() => { if (pronto) { aggiornaStati(); aggiornaBus(); } }, 60000);
})();
