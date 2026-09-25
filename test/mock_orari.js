/**
 * Banco di prova per Orari.gs
 *
 *   node test/mock_orari.js [DatiOrari.gs]
 *
 * Simula MailApp, GmailApp, CalendarApp, PropertiesService, LockService,
 * ScriptApp e Session e verifica che l'anteprima, l'invio (tutto a se'
 * stessi), la ripresa dopo il tempo massimo o con il lock occupato, la quota
 * giornaliera, gli orari delle classi, l'etichetta con il prefisso della
 * Posta e il calendario si comportino bene. Il finto calendario fa quello
 * che Google fa davvero (provato dal vivo: il fuso, setRecurrence che non
 * cambia niente, deleteEvent su una lezione sola; vedi piu' sotto). Del
 * calendario prova anche il fuso orario, i giorni senza lezione (una serie
 * per ogni tratto di settimane), la ripresa per il tempo massimo e per i
 * limiti di Google senza doppioni, l'impronta del piano, il cambio d'orario
 * (ORARI_5_cambioOrario, che rifa' le serie fino al giorno prima, anche con
 * lezioni spostate o cancellate a mano, e interrotto in ogni punto), i
 * colori delle classi (dati da ORARI_4 e ORARI_5 alle serie che creano, da
 * ORARI_6_coloraLezioni a quelle gia' messe, con la sua ripresa), i
 * colloqui con le famiglie (messi da ORARI_4_calendario a tratti, come le
 * lezioni, con il link del Meet come luogo; aggiornati da oggi da
 * ORARI_7_colloqui senza toccare le lezioni; rifatti dal cambio d'orario,
 * colorati da ORARI_6_coloraLezioni, tolti da ORARI_ANNULLA_calendario) e
 * l'annullamento di un lavoro a meta'. Di partenza usa i dati inventati
 * di DatiOrari_esempio.gs; si puo' passare un altro file, per esempio quello
 * che test/prova_orario.ps1 genera con il generatore vero.
 *
 * Ogni sezione e' obbligatoria: se i dati non hanno le classi o il
 * calendario, la prova fallisce invece di saltarle.
 *
 *   node test/mock_orari.js --solo-calendario Calendario.gs DatiOrari.gs
 *
 * fa girare le sezioni del calendario su Calendario.gs, la versione solo
 * calendario di Orari.gs per un altro account (test/solo_calendario.js), con
 * il DatiOrari.gs del solo docente: nel progetto non ci sono ne' MailApp ne'
 * GmailApp, e Session da' soltanto il fuso orario. Al posto delle sezioni
 * delle email e della Posta ci sono l'anteprima di Calendario.gs e le sue
 * prove da solo. Lo lanciano test/prova_solo_calendario.js e, con i file
 * dell'applicazione, test/prova_orario.ps1.
 */

'use strict';
// Il fuso degli script della scuola: con l'ora legale. Nella CI (e su molti
// computer) il fuso sarebbe UTC, senza ora legale, e un passo settimanale in
// millisecondi invece che in giorni del calendario passerebbe inosservato.
// Va fissato prima di qualunque data.
process.env.TZ = 'Europe/Rome';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const radice = path.join(__dirname, '..');
// con --solo-calendario: Calendario.gs e il DatiOrari.gs del solo docente
const SOLO_CALENDARIO = process.argv[2] === '--solo-calendario';
if (SOLO_CALENDARIO && !(process.argv[3] && process.argv[4])) {
  console.log('Uso: node test/mock_orari.js --solo-calendario Calendario.gs DatiOrari.gs');
  process.exit(1);
}
const codice = fs.readFileSync(SOLO_CALENDARIO ? process.argv[3] : path.join(radice, 'src', 'risorse', 'Orari.gs'), 'utf8');
const percorsoDati = (SOLO_CALENDARIO ? process.argv[4] : process.argv[2]) || path.join(__dirname, 'DatiOrari_esempio.gs');
const dati = fs.readFileSync(percorsoDati, 'utf8');
const IO = 'io@scuola-esempio.edu.it';

// ---------------------------------------------------------------------------
//  FINTE API
//  test/collaudo/prova_locale.js prende questa parte cosi' com'e', da qui a
//  "const contesto = vm.createContext(": qui solo definizioni, niente
//  require, niente file letti e niente prove (di quello che sta sopra serve
//  solo IO, che prova_locale.js le passa).
// ---------------------------------------------------------------------------
let quota = 100;
let orologio = 0;
let sogliaInterruzione = Infinity;

const mandate = [];
const registro = [];
const proprieta = new Map();
const trigger = [];

const MailApp = {
  getRemainingDailyQuota: () => quota,
  sendEmail(opzioni) {
    if (quota <= 0) throw new Error('quota esaurita');
    quota--;
    mandate.push(opzioni);
    if (mandate.length >= sogliaInterruzione) orologio += 10 * 60 * 1000;
  }
};

// le etichette: registra quali nomi vengono cercati e a quali vengono messe
const etichetteEsistenti = new Set(['Orari', 'Scuola/Orari']);
const etichetteCercate = [];
const etichetteMesse = [];
const ricerche = [];
const GmailApp = {
  getUserLabelByName: nome => {
    etichetteCercate.push(nome);
    if (!etichetteEsistenti.has(nome)) return null;
    return {
      getName: () => nome,
      addToThreads: conversazioni => { etichetteMesse.push({ nome, quante: conversazioni.length }); }
    };
  },
  search: q => { ricerche.push(q); return [{ id: 'conversazione' }]; }
};

const PropertiesService = {
  getUserProperties: () => ({
    getProperty: k => (proprieta.has(k) ? proprieta.get(k) : null),
    setProperty: (k, v) => proprieta.set(k, v),
    deleteProperty: k => proprieta.delete(k)
  })
};

let lockOccupato = false;
const LockService = {
  getUserLock: () => ({
    tryLock: () => !lockOccupato,
    releaseLock: () => {}
  })
};

const ScriptApp = {
  newTrigger: fn => ({
    timeBased: () => ({
      after: ms => ({ create: () => trigger.push({ fn, ms }) })
    })
  }),
  getProjectTriggers: () => trigger.map(t => ({ getHandlerFunction: () => t.fn, _rif: t })),
  deleteTrigger: t => { const i = trigger.indexOf(t._rif); if (i >= 0) trigger.splice(i, 1); }
};

// --- il finto calendario ------------------------------------------------------
// Fa quello che Google fa davvero, provato dal vivo il 25/09/2026 (script e
// calendario principale nel fuso Europe/Rome):
//  - createCalendar senza timeZone crea un calendario UTC, con { timeZone }
//    quel fuso; getTimeZone lo dice, setTimeZone lo cambia;
//  - una serie si ripete nel fuso che il calendario ha quando la si crea: in
//    UTC alla stessa ora UTC ogni settimana (una lezione delle 8 dal 26/10,
//    finita l'ora legale, compare alle 7), in Europe/Rome alla stessa ora di
//    Roma. Con until all'ultimo giorno alle 23:59:59 l'ultima lezione c'e';
//    le opzioni di createEventSeries portano la descrizione;
//  - setRecurrence NON cambia niente (provata con until al 25/10 23:59:59 e
//    al 26/10 00:00, in un calendario UTC e in uno Europe/Rome): qui la
//    chiamata si ricorda e basta. Uno script che la usasse per accorciare
//    una serie lascerebbe le lezioni vecchie, e le prove lo vedrebbero;
//  - deleteEvent su una lezione di una serie, presa da getEvents, toglie solo
//    quella: la serie resta con le altre. isRecurringEvent e' vero, e
//    getEventSeries().getId() e' l'id della serie. deleteEventSeries toglie
//    la serie;
//  - getEventSeries di un evento singolo non e' null: la "serie" di
//    quell'evento.
// Supposizioni, non provate dal vivo: setTimeZone non cambia le serie gia'
// create, che restano nel fuso in cui sono nate; le serie create dopo
// setTimeZone, anche nella stessa esecuzione e con lo stesso oggetto,
// prendono il fuso nuovo (su questa si regge il rimedio per i calendari UTC
// della 1.5: ORARI_ANNULLA_calendario e poi ORARI_4_calendario sullo stesso
// calendario). Per non dipenderne lo script riprende il calendario dopo
// setTimeZone e ne controlla il fuso, e prova la prima serie che passa un
// cambio dell'ora; fusoDiGoogle simula gli altri due casi: 'setTimeZone
// senza effetto' (per Google il fuso resta quello di prima: lo dicono il
// calendario ripreso e le serie nuove; solo l'oggetto su cui e' stato
// chiamato setTimeZone dice quello nuovo, come se se lo ricordasse) e 'serie
// nel fuso di nascita' (getTimeZone dice il fuso nuovo, ma le serie nuove si
// ripetono ancora in quello con cui il calendario e' nato). Come Google,
// getOwnedCalendarsByName da' ogni volta un oggetto nuovo (involucro) che
// legge e cambia lo stesso calendario. setTime su una lezione di una serie sposta solo quella,
// come dall'interfaccia di Google, e setColor su una lezione di una serie
// colora solo quella (come colora, qui sotto): tutte e due supposizioni, che
// test/collaudo prova dal vivo. deleteCalendar toglie il calendario (lo usa
// il collaudo per pulire). Gli eventi singoli (createEvent) hanno la
// descrizione e il luogo delle opzioni, un id e i contrassegni.
// Una lezione di una serie si puo' spostare o cancellare a mano (sposta,
// cancella), come dall'interfaccia di Google: getEvents la da' all'ora
// nuova, o non la da'. Le si possono cambiare solo per lei anche il titolo
// (rinomina), la descrizione o il luogo (annota), come con "Solo questo
// evento": getEvents la da' con i suoi, le altre con quelli della serie
// (getDescription, getLocation). I calendari sono tuoi o condivisi con te (iscritto):
// getCalendarsByName li da' tutti, getOwnedCalendarsByName solo i tuoi, e
// tutti e due senza badare alle maiuscole. I limiti di Google si simulano con
// guasti(): alla n-esima chiamata di un'operazione parte l'errore scelto. Il
// tempo che passa si simula con sogliaCalendario: ogni tante scritture
// l'orologio va avanti di dieci minuti, oltre il tempo massimo di
// un'esecuzione (setTag e setColor non contano: per i colori c'e'
// sogliaColori). scritture conta tutte le modifiche al calendario, per le
// prove che vogliono che non si tocchi niente.
// I colori degli eventi (non provati dal vivo): setColor su una serie o su un
// evento singolo da' quel colore (da "1" a "11") e getColor lo dice ("" se ha
// quello del calendario); una lezione di una serie ha il colore della serie,
// o il suo se colorata a mano solo lei (colora). Anche questo non e' provato
// dal vivo: coloreDiGoogle simula l'altro caso, 'la serie colora anche le
// lezioni cambiate' (setColor su una serie da' il colore anche alle lezioni
// colorate a mano solo loro, che tornano come le altre).
const calendari = [];
let prossimoId = 1;
let sogliaCalendario = Infinity;
let scrittureDallUltimoSalto = 0;
let sogliaColori = Infinity;         // come sogliaCalendario, ma contando solo setColor
let coloriDallUltimoSalto = 0;
let scritture = 0;                   // tutte le modifiche al calendario, dall'inizio delle prove
const chiamate = {};                 // operazione -> quante volte e' stata chiamata
let guastiPrevisti = [];             // { op, alla, messaggio }
const conSetRecurrence = [];         // le serie su cui e' stato chiamato setRecurrence (che non fa niente)
let fusoDiGoogle = 'come supposto'; // o 'setTimeZone senza effetto', 'serie nel fuso di nascita' (vedi sopra)
let coloreDiGoogle = 'come supposto'; // o 'la serie colora anche le lezioni cambiate' (vedi sopra)
const occorrenzeTolte = [];          // deleteEvent su una sola lezione di una serie

function guasti(elenco) {
  // con "su" il guasto parte alla n-esima chiamata su un oggetto che va bene a su (una serie, un evento singolo)
  guastiPrevisti = elenco.map(g => Object.assign({ viste: 0 }, g));
  for (const k of Object.keys(chiamate)) delete chiamate[k];
}
function operazione(op, chi) {
  chiamate[op] = (chiamate[op] || 0) + 1;
  const g = guastiPrevisti.find(x => x.op === op && (x.su ? (x.su(chi) && ++x.viste === x.alla) : x.alla === chiamate[op]));
  if (g) throw new Error(g.messaggio);
  scritture++;
  if (op === 'setColor') {
    if (++coloriDallUltimoSalto >= sogliaColori) {
      orologio += 10 * 60 * 1000;
      coloriDallUltimoSalto = 0;
    }
  } else if (op !== 'setTag' && ++scrittureDallUltimoSalto >= sogliaCalendario) {
    orologio += 10 * 60 * 1000;
    scrittureDallUltimoSalto = 0;
  }
}
/** Un colore degli eventi di Google Calendar (CalendarApp.EventColor): da "1" a "11". */
function coloreEvento(c) {
  const s = String(c);
  if (!/^(?:[1-9]|1[01])$/.test(s)) throw new Error('Colore non valido: ' + s);
  return s;
}
/** Stessa ora, n settimane dopo: con le date del calendario, non con i millisecondi. */
function settimaneDopo(t, n) {
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7 * n, t.getHours(), t.getMinutes(), t.getSeconds());
}
const FUSO_BANCO = 'Europe/Rome';            // quello di process.env.TZ, qui sopra

class Serie {
  constructor(cal, titolo, inizio, fine, ricorrenza, opzioni) {
    this.id = 'serie' + (prossimoId++);
    this.cal = cal; this.titolo = titolo;
    // il fuso del calendario quando la serie nasce: resta questo
    this.fuso = (fusoDiGoogle === 'serie nel fuso di nascita') ? cal.fusoDiNascita : cal.fuso;
    this.inizio = new Date(inizio.getTime()); this.fine = new Date(fine.getTime());
    this.ricorrenza = ricorrenza; this.opzioni = opzioni || {};
    this.tag = {}; this.descrizione = (opzioni && opzioni.description) || ''; this.cancellata = false;
    this.luogo = (opzioni && opzioni.location) || '';
    this.inizioOriginale = new Date(inizio.getTime());
    this.eccezioni = new Map();      // inizio originale (ms) -> { inizio, fine } spostata, o null cancellata
    this.colore = '';                // quello del calendario
  }
  getId() { return this.id; }
  getTitle() { return this.titolo; }
  setTag(k, v) { operazione('setTag', this); this.tag[k] = v; return this; }
  getTag(k) { return this.tag[k] || null; }
  setColor(c) {
    operazione('setColor', this);
    this.colore = coloreEvento(c);
    // l'altra supposizione: anche le lezioni colorate a mano solo loro prendono il colore della serie
    if (coloreDiGoogle === 'la serie colora anche le lezioni cambiate') {
      for (const x of this.eccezioni.values()) if (x && x.colore !== undefined) delete x.colore;
    }
    return this;
  }
  getColor() { return this.colore; }
  setDescription(d) { this.descrizione = d; return this; }
  getDescription() { return this.descrizione; }
  getLocation() { return this.luogo; }
  isRecurringEvent() { return true; }
  deleteEventSeries() { operazione('deleteEventSeries', this); this.cancellata = true; }
  /** come in Google (provato dal vivo): non cambia niente */
  setRecurrence(ricorrenza, inizio, fine) {
    operazione('setRecurrence');
    conSetRecurrence.push(this);
    return this;
  }
  /** l'inizio della lezione n della regola (0 = la prima), nel fuso in cui la serie e' nata */
  passo(n) {
    if (this.fuso === 'UTC') return new Date(this.inizio.getTime() + n * 7 * 24 * 3600 * 1000);
    if (this.fuso === FUSO_BANCO) return settimaneDopo(this.inizio, n);
    throw new Error('il finto calendario ripete le serie solo in UTC e in ' + FUSO_BANCO + ', non in ' + this.fuso);
  }
  /** gli inizi delle lezioni della regola, dalla prima all'ultima (fino a "until" o al limite dato) */
  inizi(limite) {
    const fuori = [];
    const fino = (this.ricorrenza && this.ricorrenza.until) ? this.ricorrenza.until : limite;
    for (let n = 0; n < 1000; n++) {
      const t = this.passo(n);
      if (t > fino || (limite && t > limite)) break;
      fuori.push(t);
    }
    return fuori;
  }
  /** a mano, dall'interfaccia di Google: la lezione n (0 = la prima) spostata, o cancellata */
  sposta(n, inizio, fine) { this.eccezioni.set(this.passo(n).getTime(), { inizio, fine }); }
  cancella(n) { this.eccezioni.set(this.passo(n).getTime(), null); }
  /** a mano: la lezione n rinominata (solo lei), alla sua ora */
  rinomina(n, titolo) {
    const t = this.passo(n);
    this.eccezioni.set(t.getTime(), { inizio: t, fine: new Date(t.getTime() + (this.fine - this.inizio)), titolo });
  }
  /** a mano: la descrizione o il luogo della lezione n cambiati (solo lei, "solo questo evento"), alla sua ora */
  annota(n, cosa) {
    const t = this.passo(n);
    this.eccezioni.set(t.getTime(), { inizio: t, fine: new Date(t.getTime() + (this.fine - this.inizio)),
                                      descrizione: cosa.descrizione, luogo: cosa.luogo });
  }
  /** a mano: la lezione n colorata solo lei, alla sua ora */
  colora(n, colore) {
    const t = this.passo(n);
    this.eccezioni.set(t.getTime(), { inizio: t, fine: new Date(t.getTime() + (this.fine - this.inizio)),
                                      colore: coloreEvento(colore) });
  }
  /**
   * le lezioni come le vede chi guarda il calendario: con quelle spostate,
   * senza quelle cancellate; chiave e' l'inizio che la lezione ha nella regola
   */
  lezioni(limite) {
    const durata = this.fine - this.inizio;
    const fuori = [];
    for (const t of this.inizi(limite)) {
      const chiave = t.getTime();
      if (!this.eccezioni.has(chiave)) { fuori.push({ inizio: t, fine: new Date(t.getTime() + durata), chiave }); continue; }
      const x = this.eccezioni.get(chiave);
      if (x) fuori.push({ inizio: new Date(x.inizio.getTime()), fine: new Date(x.fine.getTime()), chiave, titolo: x.titolo,
                          descrizione: x.descrizione, luogo: x.luogo, colore: x.colore });
    }
    return fuori;
  }
}

class Evento {                                   // un evento singolo
  constructor(cal, titolo, inizio, fine, opzioni) {
    this.id = 'evento' + (prossimoId++);
    this.cal = cal; this.titolo = titolo; this.inizio = inizio; this.fine = fine;
    this.tag = {}; this.cancellato = false;
    // quelli delle prove, senza opzioni, sono riunioni: non di Campanella
    this.descrizione = (opzioni && opzioni.description !== undefined) ? opzioni.description : 'riunione';
    this.luogo = (opzioni && opzioni.location) || '';
    this.colore = '';
  }
  getId() { return this.id; }
  getTag(k) { return this.tag[k] || null; }
  setTag(k, v) { operazione('setTag', this); this.tag[k] = v; return this; }
  setColor(c) { operazione('setColor', this); this.colore = coloreEvento(c); return this; }
  getColor() { return this.colore; }
  getDescription() { return this.descrizione; }
  getLocation() { return this.luogo; }
  /** come in Google: anche un evento singolo ha la sua "serie", che non e' mai null */
  getEventSeries() {
    const ev = this;
    return {
      getId: () => ev.id,
      getTag: k => ev.getTag(k),
      getDescription: () => ev.getDescription(),
      isRecurringEvent: () => false,
      deleteEventSeries: () => { operazione('deleteEventSeries'); ev.cancellato = true; },
      setRecurrence: () => { operazione('setRecurrence'); }
    };
  }
  isRecurringEvent() { return false; }
  getStartTime() { return new Date(this.inizio.getTime()); }
  getEndTime() { return new Date(this.fine.getTime()); }
  getTitle() { return this.titolo; }
  deleteEvent() { operazione('deleteEvent'); this.cancellato = true; }
}

class Calendario {
  constructor(nome, opzioni) {
    this.nome = nome; this.opzioni = opzioni || {}; this.serie = []; this.eventi = []; this.colore = '';
    this.proprio = true;             // false: un calendario di altri a cui sei iscritto
    this.fuso = this.opzioni.timeZone || 'UTC';     // come Google: senza timeZone, UTC
    this.fusoDiNascita = this.fuso;
  }
  getName() { return this.nome; }
  setColor(c) { this.colore = c; return this; }
  /** come Google: il calendario sparisce, con i suoi eventi */
  deleteCalendar() {
    operazione('deleteCalendar');
    const i = calendari.indexOf(this);
    if (i >= 0) calendari.splice(i, 1);
  }
  getTimeZone() { return this.fuso; }
  setTimeZone(f) {
    operazione('setTimeZone');
    // senza effetto: per Google resta il fuso di prima (l'oggetto dello
    // script, un involucro, si ricorda quello nuovo)
    if (fusoDiGoogle !== 'setTimeZone senza effetto') this.fuso = f;
    return this;
  }
  createEventSeries(titolo, inizio, fine, ricorrenza, opzioni) {
    operazione('createEventSeries');
    const s = new Serie(this, titolo, inizio, fine, ricorrenza, opzioni);
    this.serie.push(s);
    return s;
  }
  createEvent(titolo, inizio, fine, opzioni) {
    operazione('createEvent');
    const e = new Evento(this, titolo, new Date(inizio.getTime()), new Date(fine.getTime()), opzioni);
    this.eventi.push(e);
    return e;
  }
  /** le lezioni che cominciano nel periodo, come le da' Google: anche quelle spostate a mano, all'ora nuova */
  getEvents(da, a) {
    const fuori = [];
    // una lezione di dopo il periodo spostata a mano dentro il periodo c'e' anche lei
    const limite = new Date(a.getTime() + 60 * 24 * 3600 * 1000);
    for (const s of this.serie) {
      if (s.cancellata) continue;
      for (const l of s.lezioni(limite)) {
        if (l.inizio < da || l.inizio > a) continue;
        const inizio = new Date(l.inizio.getTime()), fine = new Date(l.fine.getTime()), chiave = l.chiave;
        const titolo = l.titolo || s.titolo;
        // la descrizione, il luogo e il colore della lezione: i suoi, se cambiati solo per lei, se no quelli della serie
        const descrizione = l.descrizione, luogo = l.luogo, colore = l.colore;
        fuori.push({
          getId: () => s.getId(),
          getTag: k => s.getTag(k),
          getDescription: () => (descrizione !== undefined ? descrizione : s.getDescription()),
          getLocation: () => (luogo !== undefined ? luogo : s.getLocation()),
          getColor: () => (colore !== undefined ? colore : s.getColor()),
          getEventSeries: () => s,
          isRecurringEvent: () => true,
          // come in Google: toglie solo questa lezione, la serie resta
          deleteEvent: () => { operazione('deleteEvent'); s.eccezioni.set(chiave, null); occorrenzeTolte.push({ serie: s, inizio }); },
          // supposizione: sposta solo questa lezione
          setTime: (i, f) => { operazione('setTime'); s.eccezioni.set(chiave, { inizio: new Date(i.getTime()), fine: new Date(f.getTime()) }); },
          // supposizione: colora solo questa lezione, dove sta adesso (come colora)
          setColor: c => {
            operazione('setColor', s);
            const x = s.eccezioni.get(chiave);
            s.eccezioni.set(chiave, Object.assign({ inizio: new Date(inizio.getTime()), fine: new Date(fine.getTime()) },
                                                  x || {}, { colore: coloreEvento(c) }));
          },
          getStartTime: () => new Date(inizio.getTime()),
          getEndTime: () => new Date(fine.getTime()),
          getTitle: () => titolo
        });
      }
    }
    for (const e of this.eventi) if (!e.cancellato && e.inizio >= da && e.inizio <= a) fuori.push(e);
    return fuori;
  }
}

/**
 * Un calendario come lo da' getOwnedCalendarsByName: ogni volta un oggetto
 * nuovo, che legge e cambia il calendario vero (cal, uno di calendari). Con
 * fusoDiGoogle 'setTimeZone senza effetto' Google tiene il fuso di prima, e
 * solo questo oggetto, dopo setTimeZone, dice quello nuovo: lo script vede
 * il fuso vero solo se riprende il calendario.
 */
function involucro(cal) {
  let fusoRicordato = '';
  const o = {
    getName: () => cal.getName(),
    setColor: c => { cal.setColor(c); return o; },
    getTimeZone: () => fusoRicordato || cal.getTimeZone(),
    setTimeZone: f => {
      cal.setTimeZone(f);
      if (fusoDiGoogle === 'setTimeZone senza effetto') fusoRicordato = f;
      return o;
    },
    createEventSeries: (titolo, inizio, fine, ricorrenza, opzioni) =>
      cal.createEventSeries(titolo, inizio, fine, ricorrenza, opzioni),
    createEvent: (titolo, inizio, fine, opzioni) => cal.createEvent(titolo, inizio, fine, opzioni),
    getEvents: (da, a) => cal.getEvents(da, a),
    deleteCalendar: () => cal.deleteCalendar()
  };
  return o;
}

const stessoNome = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const CalendarApp = {
  Color: { BLUE: '#4285f4', GREEN: '#0f9d58', RED: '#db4437' },
  // come Google: senza badare alle maiuscole, e anche i calendari a cui sei iscritto
  getCalendarsByName: nome => calendari.filter(c => stessoNome(c.nome, nome)).map(involucro),
  getOwnedCalendarsByName: nome => calendari.filter(c => c.proprio && stessoNome(c.nome, nome)).map(involucro),
  createCalendar: (nome, opzioni) => { const c = new Calendario(nome, opzioni); calendari.push(c); return c; },
  newRecurrence: () => ({
    addWeeklyRule: () => ({ until: d => ({ weekly: true, until: new Date(d.getTime()) }) })
  })
};

// getActiveUser puo' tornare vuoto nei trigger: le prove lo svuotano apposta
let indirizzoAttivo = IO;
let indirizzoEffettivo = IO;
let fusoScript = FUSO_BANCO;         // Impostazioni progetto -> Fuso orario: le prove lo cambiano apposta
const Session = {
  getActiveUser: () => ({ getEmail: () => indirizzoAttivo }),
  getEffectiveUser: () => ({ getEmail: () => indirizzoEffettivo }),
  getScriptTimeZone: () => fusoScript
};
const Logger = { log: t => registro.push(String(t)) };
let pause = 0;
/** Utilities.formatDate, per i pezzi dei modelli che usano gli script: yyyy MM dd HH mm ss e u (1 = lunedi'). */
function formatta(data, fuso, modello) {
  const parti = {};
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: fuso, hourCycle: 'h23', weekday: 'short', year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  for (const p of f.formatToParts(data)) parti[p.type] = p.value;
  const u = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parti.weekday];
  const valori = { yyyy: parti.year, MM: parti.month, dd: parti.day, HH: parti.hour, mm: parti.minute, ss: parti.second,
                   u: String(u) };
  return String(modello).replace(/yyyy|MM|dd|HH|mm|ss|u/g, t => valori[t]);
}
const Utilities = { sleep: () => { pause++; }, formatDate: formatta };

// il giorno di oggi per new Date() senza argomenti (ORARI_7_colloqui aggiorna
// i colloqui da oggi): null e' quello vero, una data lo fissa per le prove
let oggiFinto = null;
const DateFinta = new Proxy(Date, {
  get(target, prop) {
    if (prop === 'now') return () => target.now() + orologio;
    return Reflect.get(target, prop);
  },
  construct(target, args) {
    if (!args.length && oggiFinto) return new target(oggiFinto.getTime());
    return new target(...args);
  }
});

const contesto = vm.createContext(SOLO_CALENDARIO ? {
  // Calendario.gs, da solo nel progetto dell'altro account: niente email, e
  // di Session solo il fuso orario (un altro uso fallirebbe)
  CalendarApp, PropertiesService, LockService, ScriptApp, Session: { getScriptTimeZone: Session.getScriptTimeZone },
  Logger, Utilities, Date: DateFinta, JSON, Math, String, Number, Object, Array, RegExp, Error,
  isNaN, console
} : {
  MailApp, GmailApp, CalendarApp, PropertiesService, LockService, ScriptApp, Session, Logger,
  Utilities, Date: DateFinta, JSON, Math, String, Number, Object, Array, RegExp, Error,
  isNaN, console
});
vm.runInContext(dati, contesto, { filename: 'DatiOrari.gs' });
vm.runInContext(codice, contesto, { filename: SOLO_CALENDARIO ? 'Calendario.gs' : 'Orari.gs' });

// ---------------------------------------------------------------------------
//  PROVE
// ---------------------------------------------------------------------------
let fallimenti = 0;
function verifica(descrizione, condizione) {
  console.log((condizione ? '  OK      ' : '  FALLITO ') + descrizione);
  if (!condizione) fallimenti++;
}
const sezioniFatte = [];
function intestazione(t) {
  sezioniFatte.push(t);
  console.log('\n' + '='.repeat(70) + '\n  ' + t + '\n' + '='.repeat(70));
}
const SEZIONI_EMAIL = [
  'ANTEPRIMA', 'INVIO: tutto a me stesso', 'ETICHETTA DEGLI ORARI E PREFISSO DELLA POSTA',
  'QUOTA GIORNALIERA', 'TEMPO MASSIMO DI ESECUZIONE', 'BLOCCO DI ESECUZIONE', 'ANNULLA INVIO',
  'ORARI DELLE CLASSI', 'CLASSI: QUOTA E RIPRESA', 'INDIRIZZO: RIPIEGO SULL\'UTENTE EFFETTIVO'
];
const SEZIONI_CALENDARIO = [
  'GOOGLE CALENDAR', 'CALENDARIO: dati mancanti o sbagliati', 'CALENDARIO: SOLO I TUOI, CON IL NOME ESATTO',
  'CALENDARIO: IL FUSO ORARIO', 'GIORNI SENZA LEZIONE',
  'CALENDARIO: RIPRESA PER IL TEMPO MASSIMO', 'CALENDARIO: RIPRESA PER I LIMITI DI GOOGLE',
  'CALENDARIO: BLOCCO DI ESECUZIONE', 'CALENDARIO: DATIORARI.GS CAMBIATO A META\'',
  'CAMBIO D\'ORARIO', 'CAMBIO D\'ORARIO: RIPRESA E CASI LIMITE',
  'CAMBIO D\'ORARIO: DATA PRIMA DELL\'INIZIO, ANNO PRIMA NELLO STESSO CALENDARIO',
  'CAMBIO D\'ORARIO: LEZIONI SPOSTATE O CANCELLATE A MANO',
  'COLORI DELLE CLASSI', 'COLORI NEL CAMBIO D\'ORARIO', 'ORARI_6_COLORALEZIONI',
  'ORARI_6_COLORALEZIONI: RIPRESA, LIMITI DI GOOGLE E BLOCCO',
  'ORARI_6_COLORALEZIONI CON UN LAVORO DEL CALENDARIO A META\'',
  'COLLOQUI CON LE FAMIGLIE', 'COLLOQUI: ORARI_7_COLLOQUI', 'COLLOQUI: CAMBIO D\'ORARIO E COLORI',
  'ANNULLA CALENDARIO DOPO UN LAVORO A META\'', 'ANNULLA CALENDARIO: TEMPO MASSIMO E LIMITI DI GOOGLE'
];
// con --solo-calendario, al posto delle email e della Posta, le prove di Calendario.gs
const SEZIONI = SOLO_CALENDARIO
  ? ['ANTEPRIMA DI CALENDARIO.GS'].concat(SEZIONI_CALENDARIO, ['CALENDARIO.GS DA SOLO, SENZA LA POSTA'])
  : SEZIONI_EMAIL.concat(SEZIONI_CALENDARIO,
      ['CONVIVENZA CON LA POSTA', 'ANNULLA_AUTOMAZIONE E UNA RIPRESA DEL CALENDARIO GIA\' PARTITA']);
// gli attrezzi del calendario, per le prove che stanno dopo la Posta
let attrezziCalendario = null;
const PROGRESSO_CALENDARIO = 'CAMPANELLA_ORARI_CALENDARIO_PROGRESSO';
const PROGRESSO_COLORI = 'CAMPANELLA_ORARI_COLORI_PROGRESSO';
const PROGRESSO = 'CAMPANELLA_ORARI_PROGRESSO';
const PROGRESSO_CLASSI = 'CAMPANELLA_ORARI_CLASSI_PROGRESSO';

// il fuso fissato in cima deve avere davvero l'ora legale (se Node non lo
// cambiasse, le prove del calendario non vedrebbero piu' i salti di un'ora)
verifica('le prove girano nel fuso di Roma, con l\'ora legale (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')',
  new Date(2027, 0, 15).getTimezoneOffset() === -60 && new Date(2027, 6, 15).getTimezoneOffset() === -120);

const D = contesto.ORARI;
// i colloqui con le famiglie, se i dati li hanno (quelli che test/prova_orario.ps1
// genera con Campanella): li provano le loro sezioni, alla fine del calendario.
// Le altre contano le lezioni, e partono senza
const colloquiDeiDati = (D.calendario && D.calendario.colloqui) ? D.calendario.colloqui : null;
const coloreColloquiDeiDati = D.calendario ? D.calendario.coloreColloqui : undefined;
if (D.calendario) { delete D.calendario.colloqui; delete D.calendario.coloreColloqui; }
const conOre = D.docenti.filter(d => d.celle.some(c => c)).length;
console.log('Dati: ' + D.docenti.length + ' docenti (' + conOre + ' con ore), ' +
            (D.classi ? D.classi.length : 0) + ' classi, ' +
            D.giorni.length + ' giorni x ' + D.ore + ' ore');

if (!SOLO_CALENDARIO) {
  intestazione('ANTEPRIMA');
  const anteprima = contesto.ORARI_1_anteprima();
  console.log(anteprima.split('\n').slice(0, 20).join('\n'));
  verifica('l\'anteprima non manda niente', mandate.length === 0);
  verifica('mostra un esempio di messaggio', anteprima.indexOf('Oggetto:') > 0);
  verifica('la tabella ha i giorni', anteprima.indexOf(D.giorni[0]) > 0);
  verifica('dice che il destinatario sei tu', anteprima.indexOf(IO) > 0);
  verifica('dice la versione dello script', /Orari\.gs versione \d+\.\d+\.\d+/.test(anteprima));
  verifica('dice il fuso orario dello script, e con Europe/Rome non avvisa di niente',
    /Fuso orario dello script: Europe\/Rome\n/.test(anteprima) && !/ATTENZIONE/.test(anteprima));
  fusoScript = 'UTC';
  const anteprimaUtc = contesto.ORARI_1_anteprima();
  fusoScript = FUSO_BANCO;
  verifica('con lo script in un altro fuso (UTC) avvisa, e dice dove cambiarlo',
    /Fuso orario dello script: UTC\n/.test(anteprimaUtc) && /ATTENZIONE: il fuso orario dello script non e' quello dell'Italia/.test(anteprimaUtc) &&
    /Impostazioni progetto/.test(anteprimaUtc) && /Fuso orario -> quello con Roma/.test(anteprimaUtc));
  verifica('senza la Posta nel progetto l\'etichetta e\' "Orari"', anteprima.indexOf('"Orari"') > 0);
  verifica('parla del calendario', !!D.calendario && anteprima.indexOf(D.calendario.nome) > 0);
  {
    // solo quelli che toccano il periodo
    const quanteSosp = ((D.calendario && D.calendario.sospensioni) || [])
      .filter(s => (s.al || s.dal) >= D.calendario.inizio && s.dal <= D.calendario.fine).length;
    verifica('dice quanti giorni o periodi senza lezione ci sono nel periodo (' + quanteSosp + ')',
      new RegExp('Giorni senza lezione: ' + quanteSosp + ' ').test(anteprima));
    verifica('dice quante serie mettera\' ORARI_4_calendario e quante lezioni salta',
      /Serie settimanali da creare con ORARI_4_calendario: \d+/.test(anteprima) &&
      /Lezioni saltate nei giorni senza lezione: \d+/.test(anteprima));
    verifica('con una data di cambio dice che il cambio si fa con ORARI_5_cambioOrario',
      !!D.calendario && !!D.calendario.validoDal && anteprima.indexOf('dal ' + D.calendario.validoDal) > 0 &&
      /ORARI_5_cambioOrario/.test(anteprima));
  }

  intestazione('INVIO: tutto a me stesso');
  quota = 1000;
  console.log(contesto.ORARI_2_invia());
  verifica('manda un messaggio per docente con almeno una casella (' + conOre + ')',
    mandate.length === conOre);
  verifica('arrivano tutti a me', mandate.every(m => m.to === IO));
  verifica('nessuna copia ad altri', mandate.every(m => !m.cc && !m.bcc));
  verifica('l\'oggetto contiene il cognome',
    mandate.every(m => D.docenti.some(d => m.subject.indexOf(d.nome) >= 0)));
  verifica('il corpo html ha una tabella', mandate[0].htmlBody.indexOf('<table') > 0);
  verifica('le ore "D" diventano leggibili',
    !mandate.some(m => /<td[^>]*>D<\/td>/.test(m.htmlBody)));
  verifica('un docente senza ore non genera email',
    !mandate.some(m => m.subject.indexOf('GIALLI') >= 0));
  verifica('il progresso e\' stato azzerato', !proprieta.has(PROGRESSO));
  verifica('cerca i messaggi appena mandati a me', ricerche.some(q => /^to:me from:me subject:"Orario"/.test(q)));
  verifica('e ci mette l\'etichetta "Orari"', etichetteMesse.length === 1 && etichetteMesse[0].nome === 'Orari');

  intestazione('ETICHETTA DEGLI ORARI E PREFISSO DELLA POSTA');
  // Posta e Orari stanno nello stesso progetto: la Configurazione.gs d'esempio,
  // con il prefisso "Scuola", va nello stesso contesto
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'Configurazione_esempio.gs'), 'utf8'),
    contesto, { filename: 'Configurazione.gs' });
  function inviaPerEtichetta() {
    mandate.length = 0; proprieta.clear(); quota = 1000;
    etichetteCercate.length = 0; etichetteMesse.length = 0;
    contesto.ORARI_2_invia();
  }
  verifica('la configurazione d\'esempio ha il prefisso "Scuola"',
    !!contesto.CONFIG && contesto.CONFIG.prefissoEtichette === 'Scuola');
  inviaPerEtichetta();
  verifica('con il prefisso "Scuola" l\'etichetta e\' "Scuola/Orari"',
    etichetteMesse.length === 1 && etichetteMesse[0].nome === 'Scuola/Orari');
  verifica('e l\'anteprima lo dice', contesto.ORARI_1_anteprima().indexOf('"Scuola/Orari"') > 0);
  contesto.CONFIG.prefissoEtichette = '';
  inviaPerEtichetta();
  verifica('con il prefisso vuoto l\'etichetta e\' "Orari"',
    etichetteMesse.length === 1 && etichetteMesse[0].nome === 'Orari');
  contesto.CONFIG.prefissoEtichette = 'Scuola/';
  inviaPerEtichetta();
  verifica('una barra in fondo al prefisso non conta', etichetteCercate[0] === 'Scuola/Orari');
  etichetteEsistenti.clear();
  registro.length = 0;
  inviaPerEtichetta();
  verifica('se l\'etichetta non c\'e\' non la crea, e lo scrive nel registro',
    etichetteMesse.length === 0 && registro.some(r => /Non c'e' l'etichetta "Scuola\/Orari"/.test(r)));
  etichetteEsistenti.add('Orari');
  etichetteEsistenti.add('Scuola/Orari');
  contesto.CONFIG.prefissoEtichette = 'Scuola';

  intestazione('QUOTA GIORNALIERA');
  mandate.length = 0;
  proprieta.clear();
  quota = 2;
  const parziale = contesto.ORARI_2_invia();
  verifica('si ferma quando finisce la quota', mandate.length === 2);
  verifica('lo dice chiaramente', /quota/i.test(parziale) && /ORARI_2_invia domani/.test(parziale));
  verifica('si ricorda dove era arrivato', proprieta.has(PROGRESSO));
  quota = 1000;
  contesto.ORARI_2_invia();
  verifica('il giorno dopo finisce il lavoro', mandate.length === conOre);
  verifica('nessun doppione', new Set(mandate.map(m => m.subject)).size === mandate.length);

  intestazione('TEMPO MASSIMO DI ESECUZIONE');
  mandate.length = 0;
  proprieta.clear();
  trigger.length = 0;
  quota = 1000;
  orologio = 0;
  sogliaInterruzione = 2;
  contesto.ORARI_2_invia();
  verifica('si ferma dopo il tempo massimo', mandate.length < conOre);
  verifica('programma la ripresa automatica', trigger.some(t => t.fn === 'ORARI_2_invia'));
  sogliaInterruzione = Infinity;
  orologio = 0;
  let giri = 0;
  while (proprieta.has(PROGRESSO) && giri < 30) { contesto.ORARI_2_invia({ triggerUid: 'ripresa' }); giri++; }
  verifica('riprendendo arriva in fondo (' + giri + ' riprese)', mandate.length === conOre);
  verifica('toglie il trigger a lavoro finito', !trigger.some(t => t.fn === 'ORARI_2_invia'));
  // una ripresa rimasta programmata dopo la fine non deve ricominciare da capo
  const primaDelTriggerRimasto = mandate.length;
  trigger.push({ fn: 'ORARI_2_invia', ms: 60000 });
  const niente = contesto.ORARI_2_invia({ triggerUid: 'rimasto' });
  verifica('una ripresa che non trova niente da riprendere non manda niente',
    mandate.length === primaDelTriggerRimasto && /Niente da riprendere/.test(niente));
  verifica('e toglie il trigger rimasto', !trigger.some(t => t.fn === 'ORARI_2_invia'));

  intestazione('BLOCCO DI ESECUZIONE');
  mandate.length = 0;
  proprieta.clear();
  trigger.length = 0;
  lockOccupato = true;
  const occupato = contesto.ORARI_2_invia();
  verifica('se un\'altra esecuzione e\' in corso non manda niente', mandate.length === 0);
  verifica('e lo dice, nominando anche il calendario fra chi puo\' tenere il blocco',
    /in corso/i.test(occupato) && /calendario/.test(occupato));
  verifica('senza un invio a meta\' non programma riprese', trigger.length === 0);
  // una ripresa che trova il lock preso (per esempio dal riordino della posta)
  proprieta.set(PROGRESSO, '{"i":2,"mandati":2}');
  const rinviata = contesto.ORARI_2_invia({ triggerUid: 'ripresa' });
  verifica('una ripresa con il lock occupato si riprogramma invece di fermarsi',
    mandate.length === 0 && trigger.filter(t => t.fn === 'ORARI_2_invia').length === 1);
  verifica('e lo dice', /fra un minuto/.test(rinviata));
  verifica('il punto a cui era arrivato resta', proprieta.get(PROGRESSO) === '{"i":2,"mandati":2}');
  const annullaOccupato = contesto.ORARI_ANNULLA_invio();
  verifica('con il lock occupato ORARI_ANNULLA_invio non dimentica niente, e lo dice (anche del calendario)',
    proprieta.has(PROGRESSO) && /in corso/.test(annullaOccupato) && /calendario/.test(annullaOccupato));
  lockOccupato = false;
  contesto.ORARI_2_invia({ triggerUid: 'ripresa' });
  verifica('liberato il lock, la ripresa finisce da dove era arrivata (' + mandate.length + ' email)',
    mandate.length === Math.max(0, conOre - 2) && !proprieta.has(PROGRESSO));
  verifica('e toglie il trigger', !trigger.some(t => t.fn === 'ORARI_2_invia'));

  intestazione('ANNULLA INVIO');
  proprieta.set(PROGRESSO, '{"i":3,"mandati":3}');
  proprieta.set(PROGRESSO_CLASSI, '{"i":1,"mandati":1}');
  trigger.length = 0;
  proprieta.set(PROGRESSO_CALENDARIO, '{"funzione":"ORARI_4_calendario"}');
  trigger.push({ fn: 'ORARI_2_invia' }, { fn: 'ORARI_3_inviaOrariClassi' }, { fn: 'PASSO_4_automatico' },
               { fn: 'ORARI_4_calendario' });
  contesto.ORARI_ANNULLA_invio();
  verifica('dimentica il punto dei docenti e quello delle classi',
    !proprieta.has(PROGRESSO) && !proprieta.has(PROGRESSO_CLASSI));
  verifica('toglie le riprese degli invii e lascia gli altri trigger, anche quello del calendario',
    trigger.length === 2 && trigger[0].fn === 'PASSO_4_automatico' && trigger[1].fn === 'ORARI_4_calendario');
  verifica('e non tocca il lavoro a meta\' del calendario', proprieta.has(PROGRESSO_CALENDARIO));
  proprieta.delete(PROGRESSO_CALENDARIO);
  trigger.length = 0;

  intestazione('ORARI DELLE CLASSI');
  const conClassi = !!(D.classi && D.classi.length);
  verifica('i dati hanno gli orari delle classi (servono a questa sezione e alla prossima)', conClassi);
  if (conClassi) {
    mandate.length = 0;
    quota = 1000;
    etichetteMesse.length = 0;
    console.log(contesto.ORARI_3_inviaOrariClassi());
    verifica('un messaggio per classe', mandate.length === D.classi.length);
    verifica('arrivano solo a me', mandate.every(m => m.to === IO && !m.cc && !m.bcc));
    verifica('l\'oggetto contiene la classe', mandate[0].subject.indexOf(D.classi[0].nome) >= 0);
    verifica('nel corpo ci sono i cognomi dei docenti',
      D.classi[0].celle.filter(Boolean).every(c =>
        mandate[0].htmlBody.indexOf(c.split(' + ')[0]) > 0));
    verifica('anche questi prendono l\'etichetta degli orari',
      etichetteMesse.length === 1 && etichetteMesse[0].nome === 'Scuola/Orari');
    verifica('il progresso delle classi e\' azzerato', !proprieta.has(PROGRESSO_CLASSI));

    intestazione('CLASSI: QUOTA E RIPRESA');
    mandate.length = 0;
    proprieta.clear();
    trigger.length = 0;
    quota = 1;
    const fermo = contesto.ORARI_3_inviaOrariClassi();
    verifica('a quota finita si ferma e dice di rieseguire domani',
      mandate.length === 1 && /ORARI_3_inviaOrariClassi domani/.test(fermo));
    verifica('si ricorda dove era arrivato', proprieta.has(PROGRESSO_CLASSI));
    verifica('senza toccare il punto dei docenti', !proprieta.has(PROGRESSO));
    quota = 1000;
    orologio = 0;
    sogliaInterruzione = 2;
    contesto.ORARI_3_inviaOrariClassi();
    verifica('a tempo finito programma la ripresa delle classi',
      trigger.some(t => t.fn === 'ORARI_3_inviaOrariClassi') && !trigger.some(t => t.fn === 'ORARI_2_invia'));
    sogliaInterruzione = Infinity;
    orologio = 0;
    let giriClassi = 0;
    while (proprieta.has(PROGRESSO_CLASSI) && giriClassi < 30) {
      contesto.ORARI_3_inviaOrariClassi({ triggerUid: 'classi' });
      giriClassi++;
    }
    verifica('riprendendo arriva in fondo, senza doppioni (' + giriClassi + ' riprese)',
      mandate.length === D.classi.length && new Set(mandate.map(m => m.subject)).size === mandate.length);
    verifica('e toglie il trigger', !trigger.some(t => t.fn === 'ORARI_3_inviaOrariClassi'));
  }

  intestazione('INDIRIZZO: RIPIEGO SULL\'UTENTE EFFETTIVO');
  indirizzoAttivo = '';
  mandate.length = 0;
  proprieta.clear();
  quota = 1000;
  verifica('se getActiveUser e\' vuoto, il destinatario e\' l\'utente effettivo',
    contesto.ORARI_1_anteprima().indexOf(IO) > 0);
  contesto.ORARI_2_invia();
  verifica('e le email arrivano comunque solo a me', mandate.length === conOre && mandate.every(m => m.to === IO));
  indirizzoEffettivo = '';
  let senzaIndirizzo = '';
  try { contesto.ORARI_1_anteprima(); } catch (e) { senzaIndirizzo = e.message; }
  verifica('senza nessun indirizzo si ferma e lo dice', /indirizzo/.test(senzaIndirizzo));
  indirizzoAttivo = IO;
  indirizzoEffettivo = IO;
} else {
  // Calendario.gs: l'anteprima dice il calendario, e niente delle email
  intestazione('ANTEPRIMA DI CALENDARIO.GS');
  const anteprima = contesto.ORARI_1_anteprima();
  console.log(anteprima.split('\n').slice(0, 20).join('\n'));
  verifica('dice che sul calendario non mette niente, e la versione di Calendario.gs',
    /^ANTEPRIMA - sul calendario non viene messo niente\.$/m.test(anteprima) &&
    /^Calendario\.gs versione \d+\.\d+\.\d+$/m.test(anteprima) && !/Orari\.gs versione/.test(anteprima));
  verifica('non parla di email, destinatari, etichette o quote, e non dice il tuo indirizzo',
    !/Destinatario|Email da mandare|Etichetta|disponibili oggi|Esempio del primo messaggio|Oggetto:/.test(anteprima) &&
    anteprima.indexOf(IO) < 0 && anteprima.indexOf('@') < 0 && mandate.length === 0);
  verifica('dice il fuso orario dello script, e con Europe/Rome non avvisa di niente',
    /Fuso orario dello script: Europe\/Rome\n/.test(anteprima) && !/ATTENZIONE/.test(anteprima));
  fusoScript = 'UTC';
  const anteprimaUtc = contesto.ORARI_1_anteprima();
  fusoScript = FUSO_BANCO;
  verifica('con lo script in un altro fuso (UTC) avvisa, e dice dove cambiarlo',
    /ATTENZIONE: il fuso orario dello script non e' quello dell'Italia/.test(anteprimaUtc) &&
    /Impostazioni progetto/.test(anteprimaUtc) && /Fuso orario -> quello con Roma/.test(anteprimaUtc));
  verifica('i dati hanno un docente solo, quello del calendario (' + D.docenti.map(x => x.nome).join(', ') + ')',
    !!D.calendario && D.docenti.length === 1 && D.docenti[0].nome === D.calendario.docente &&
    /Docenti nel file: 1\n/.test(anteprima));
  verifica('e niente orari delle classi, oggetti o nota delle email, titolo del tabellone',
    !('classi' in D) && !('oggettoDocente' in D) && !('oggettoClasse' in D) && !('nota' in D) && !('titolo' in D));
  verifica('parla del calendario', anteprima.indexOf(D.calendario.nome) > 0 &&
    /Serie settimanali da creare con ORARI_4_calendario: \d+/.test(anteprima) &&
    /Lezioni saltate nei giorni senza lezione: \d+/.test(anteprima));
  verifica('con una data di cambio dice che il cambio si fa con ORARI_5_cambioOrario',
    !!D.calendario.validoDal && anteprima.indexOf('dal ' + D.calendario.validoDal) > 0 && /ORARI_5_cambioOrario/.test(anteprima));
  verifica('le funzioni delle email non ci sono',
    ['ORARI_2_invia', 'ORARI_3_inviaOrariClassi', 'ORARI_ANNULLA_invio', '_daMandare_', '_mioIndirizzoOrari_',
     '_etichettaInviati_', '_orariInvia_'].every(n => typeof contesto[n] === 'undefined'));
  const senzaCal = contesto.ORARI.calendario;
  contesto.ORARI.calendario = null;
  const anteprimaSenza = contesto.ORARI_1_anteprima();
  contesto.ORARI.calendario = senzaCal;
  verifica('senza la parte del calendario lo dice, e dice dove si sceglie il tuo nome',
    /Calendario: nessuno\. Per mettere il tuo orario su Google Calendar/.test(anteprimaSenza) && /passo 4/.test(anteprimaSenza));
}

intestazione('GOOGLE CALENDAR');
const conCalendario = !!(D.calendario && D.calendario.docente);
verifica('i dati hanno la parte del calendario (serve a questa sezione e alle prossime)', conCalendario);
if (conCalendario) {
  const c = D.calendario;
  const docOriginale = D.docenti.find(d => d.nome === c.docente);
  const celleOriginali = docOriginale.celle.slice();

  // --- gli attrezzi: il piano atteso, ricavato qui senza guardare lo script ---
  // i blocchi: ore consecutive della stessa classe nello stesso giorno
  const leggibile = v => {
    const s = String(v || '').trim();
    return /^(D|DISP\.?|DISPOSIZIONE)$/i.test(s) ? 'A disposizione' : s;
  };
  function blocchiDi(celle) {
    const fuori = [];
    for (let g = 0; g < D.giorni.length; g++) {
      let aperto = null;
      for (let o = 0; o < D.ore; o++) {
        const v = leggibile(celle[g * D.ore + o]);
        if (aperto && v && v === aperto.testo && aperto.oraA === o) { aperto.oraA = o + 1; continue; }
        if (!v) { aperto = null; continue; }
        aperto = { giorno: g, oraDa: o + 1, oraA: o + 1, testo: v };
        fuori.push(aperto);
      }
    }
    return fuori;
  }
  const giornoSettimana = nome => {
    const n = String(nome).toLowerCase().replace(/[^a-z]/g, '');
    return ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato']
      .findIndex(x => n.startsWith(x));
  };
  const inizioOre = c.inizioOre || ['08:00'];
  const minuti = Number(c.minutiOra) || 60;
  const minutiDellOra = n => {                      // minuti dalla mezzanotte in cui comincia l'ora n
    const scritta = inizioOre[Math.min(n, inizioOre.length) - 1];
    const [h, m] = scritta.split(':').map(Number);
    return h * 60 + m + (n > inizioOre.length ? (n - inizioOre.length) * minuti : 0);
  };
  const minutiDi = d => d.getHours() * 60 + d.getMinutes();
  const due = n => String(n).padStart(2, '0');
  const ora = m => due(Math.floor(m / 60)) + ':' + due(m % 60);
  const chiave = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const dataDa = s => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  const giorniDopo = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const sospensioni = (c.sospensioni || []).map(s => ({ dal: s.dal, al: s.al || s.dal, nome: s.nome || '' }));
  const sospeso = k => sospensioni.some(s => s.dal <= k && k <= s.al);
  const primoGiorno = dataDa(c.inizio);
  const ultimoGiorno = dataDa(c.fine);
  const uguali = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const nostro = e => e.getTag('campanella') === 'orario' || String(e.getDescription() || '').indexOf('[Campanella]') === 0;

  /**
   * Per ogni blocco le settimane dal primo giorno utile alla fine, a tratti
   * fra un giorno senza lezione e l'altro. Le lezioni come testo
   * "aaaa-mm-gg hh:mm-hh:mm classe", in ordine.
   */
  function pianoAtteso(celle, dal) {
    const tratti = [];
    const lezioni = [];
    let saltate = 0;
    for (const b of blocchiDi(celle)) {
      const gs = giornoSettimana(D.giorni[b.giorno]);
      if (gs < 0) continue;
      let t = new Date(dal.getFullYear(), dal.getMonth(), dal.getDate());
      while (t.getDay() !== gs) t = giorniDopo(t, 1);
      let aperto = null;
      for (; t <= ultimoGiorno; t = giorniDopo(t, 7)) {
        const k = chiave(t);
        if (sospeso(k)) { saltate++; aperto = null; continue; }
        if (!aperto) { aperto = { blocco: b, dal: k, al: k, n: 0 }; tratti.push(aperto); }
        aperto.al = k;
        aperto.n++;
        lezioni.push(k + ' ' + ora(minutiDellOra(b.oraDa)) + '-' + ora(minutiDellOra(b.oraA) + minuti) + ' ' + b.testo);
      }
    }
    return { tratti, saltate, lezioni: lezioni.sort() };
  }
  /** Le lezioni messe da Campanella sul calendario, dal giorno al giorno compresi, nella stessa forma. */
  function lezioniSul(cal, da, a) {
    const fine = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59, 59);
    return cal.getEvents(da, fine).filter(nostro)
      .map(e => chiave(e.getStartTime()) + ' ' + ora(minutiDi(e.getStartTime())) + '-' +
                ora(minutiDi(e.getEndTime())) + ' ' + e.getTitle())
      .sort();
  }
  const vive = cal => cal.serie.filter(s => !s.cancellata);
  function senzaDoppioni(cal) {
    const k = vive(cal).map(s => s.titolo + '|' + s.inizio.getTime());
    return new Set(k).size === k.length;
  }
  /** Lo stesso orario spostato di un giorno: il "nuovo orario" del cambio. */
  function ruotata(celle) {
    const G = D.giorni.length, O = D.ore, fuori = new Array(celle.length).fill('');
    for (let g = 0; g < G; g++) for (let o = 0; o < O; o++) fuori[((g + 1) % G) * O + o] = celle[g * O + o] || '';
    return fuori;
  }
  function azzeraCalendario() {
    calendari.length = 0;
    proprieta.delete(PROGRESSO_CALENDARIO);
    trigger.length = 0;
    sogliaCalendario = Infinity;
    scrittureDallUltimoSalto = 0;
    sogliaColori = Infinity;
    coloriDallUltimoSalto = 0;
    proprieta.delete(PROGRESSO_COLORI);
    guasti([]);
    orologio = 0;
    occorrenzeTolte.length = 0;
    lockOccupato = false;
    fusoDiGoogle = 'come supposto';
    coloreDiGoogle = 'come supposto';
    docOriginale.celle = celleOriginali.slice();
  }
  /** Fa scattare la ripresa programmata finche' c'e' un lavoro a meta' (e una ripresa). */
  function riprendiFinoInFondo(fn) {
    let giri = 0;
    while (proprieta.has(PROGRESSO_CALENDARIO) && giri < 80 && trigger.some(t => t.fn === fn)) {
      contesto[fn]({ triggerUid: 'ripresa' + giri });
      giri++;
    }
    return giri;
  }
  const salvato = () => JSON.parse(proprieta.get(PROGRESSO_CALENDARIO) || 'null');
  const ripresaDi = fn => trigger.filter(t => t.fn === fn);
  const errore = f => { try { f(); return ''; } catch (e) { return e.message; } };
  const numero = (re, testo) => { const m = re.exec(testo); return m ? Number(m[1]) : -1; };

  const attesi = blocchiDi(celleOriginali);
  const piano = pianoAtteso(celleOriginali, primoGiorno);

  // --- la prima volta --------------------------------------------------------
  pause = 0;
  const esito = contesto.ORARI_4_calendario();
  console.log(esito);
  const cal = calendari.find(x => x.nome === c.nome);
  verifica('crea il calendario con il nome scelto', !!cal);
  verifica('un solo calendario', calendari.length === 1);
  const saltateScritte = numero(/Lezioni saltate nei giorni senza lezione: (\d+)/, esito);
  // test/prova_orario.ps1 confronta questi numeri con quelli di Campanella
  console.log('  PIANO: ' + attesi.length + ' blocchi, ' + cal.serie.length + ' serie, ' + saltateScritte + ' lezioni saltate');
  verifica('una serie per ogni tratto di settimane senza giorni senza lezione (' + piano.tratti.length + ' serie da ' +
    attesi.length + ' blocchi)', cal.serie.length === piano.tratti.length);
  verifica('ci sono blocchi spezzati in piu\' serie dai giorni senza lezione, quindi i tratti sono stati provati',
    piano.tratti.length > attesi.length && piano.saltate > 0);
  const abbinati = piano.tratti.filter(tr => cal.serie.filter(s =>
    s.titolo === tr.blocco.testo && chiave(s.inizio) === tr.dal &&
    minutiDi(s.inizio) === minutiDellOra(tr.blocco.oraDa) &&
    minutiDi(s.fine) === minutiDellOra(tr.blocco.oraA) + minuti &&
    !!s.ricorrenza && s.ricorrenza.weekly && chiave(s.ricorrenza.until) === tr.al &&
    s.ricorrenza.until.getHours() === 23 && s.ricorrenza.until.getMinutes() === 59 &&
    s.ricorrenza.until.getSeconds() === 59).length === 1);
  verifica('ogni tratto ha la sua serie: classe, giorno, ora di inizio e di fine, fino all\'ultimo giorno del tratto (' +
    abbinati.length + ' su ' + piano.tratti.length + ')', abbinati.length === piano.tratti.length);
  verifica('sul calendario ci sono proprio le lezioni del piano (' + piano.lezioni.length + '), non una di piu\'',
    uguali(lezioniSul(cal, primoGiorno, ultimoGiorno), piano.lezioni));
  const multipli = attesi.filter(b => b.oraA > b.oraDa).length;
  verifica('ci sono blocchi di piu\' ore consecutive, quindi la fusione e\' stata provata (' + multipli + ')', multipli > 0);
  verifica('tutti gli eventi portano il contrassegno', cal.serie.every(s => s.getTag('campanella') === 'orario'));
  verifica('la descrizione arriva con le opzioni di createEventSeries e dice da dove vengono',
    cal.serie.every(s => String(s.opzioni.description || '').indexOf('[Campanella]') === 0));
  verifica('nessuna serie comincia prima della data di inizio', cal.serie.every(s => s.inizio >= primoGiorno));
  verifica('fra una serie e l\'altra una pausa (' + pause + ' Utilities.sleep)', pause >= cal.serie.length - 1);
  verifica('il messaggio dice quante serie e quante lezioni saltate (' + piano.saltate + ')',
    numero(/(\d+) serie settimanali/, esito) === piano.tratti.length && saltateScritte === piano.saltate);
  if (c.colore) verifica('il colore viene applicato', cal.colore === CalendarApp.Color[c.colore]);
  verifica('finito il lavoro non resta niente a meta\', e nessuna ripresa',
    !proprieta.has(PROGRESSO_CALENDARIO) && ripresaDi('ORARI_4_calendario').length === 0);

  // una seconda esecuzione trova le serie gia' messe e si ferma, invece di raddoppiarle
  const secondaVolta = errore(() => contesto.ORARI_4_calendario());
  verifica('la seconda volta si ferma e dice di annullare prima, o di usare il cambio d\'orario',
    /gia' \d+ serie/.test(secondaVolta) && /ORARI_ANNULLA_calendario/.test(secondaVolta) &&
    /ORARI_5_cambioOrario/.test(secondaVolta));
  verifica('  ...e per primo, per chi ha solo aggiunto o cambiato i colloqui, ORARI_7_colloqui, che non tocca le lezioni',
    /Se hai solo aggiunto o cambiato i colloqui con le famiglie, esegui ORARI_7_colloqui: li mette da oggi senza toccare le lezioni\./.test(secondaVolta) &&
    secondaVolta.indexOf('ORARI_7_colloqui') < secondaVolta.indexOf('ORARI_5_cambioOrario') &&
    secondaVolta.indexOf('ORARI_7_colloqui') < secondaVolta.indexOf('ORARI_ANNULLA_calendario'));
  verifica('senza raddoppiare le lezioni (' + cal.serie.length + ' serie)', cal.serie.length === piano.tratti.length);
  verifica('e senza creare un altro calendario', calendari.length === 1);

  // un evento che non e' nostro deve sopravvivere all'annullamento
  cal.createEvent('Collegio docenti', new Date(2026, 9, 5, 15, 0), new Date(2026, 9, 5, 17, 0));
  console.log(contesto.ORARI_ANNULLA_calendario());
  verifica('l\'annullamento toglie tutti gli eventi messi da Campanella', cal.serie.every(s => s.cancellata));
  verifica('e lascia stare gli altri eventi', cal.eventi.every(e => !e.cancellato));
  verifica('il calendario resta', calendari.length === 1);

  // dopo l'annullamento l'orario si rimette, una volta sola, e l'evento altrui non lo blocca
  contesto.ORARI_4_calendario();
  verifica('dopo l\'annullamento l\'orario si rimette, una volta sola (' + vive(cal).length + ' serie)',
    vive(cal).length === piano.tratti.length);
  contesto.ORARI_ANNULLA_calendario();

  intestazione('CALENDARIO: dati mancanti o sbagliati');
  const salva = contesto.ORARI.calendario;
  contesto.ORARI.calendario = null;
  let sbaglio = errore(() => contesto.ORARI_4_calendario());
  verifica('senza la parte "calendario" si ferma e spiega', /calendario/i.test(sbaglio));
  verifica('e chiede il tuo nome', /il tuo nome/.test(sbaglio));
  contesto.ORARI.calendario = Object.assign({}, salva, { docente: 'NESSUNO' });
  sbaglio = errore(() => contesto.ORARI_4_calendario());
  verifica('con un nome che non c\'e\' si ferma', /non trovo/i.test(sbaglio));
  // due omonimi: il solo inizio del nome non sceglie un collega
  {
    const omonimi = { docenti: [{ nome: 'BIANCHI' }, { nome: 'ROSSI A.' }, { nome: 'ROSSI M.' }, { nome: 'VERDI' }] };
    const due = errore(() => contesto._orariDocente_(omonimi, 'ROSSI'));
    verifica('con due omonimi ("ROSSI A." e "ROSSI M.") "ROSSI" non sceglie nessuno dei due: si ferma e dice di scegliere ' +
      'il nome esatto (' + due + ')', /"ROSSI" puo' essere ROSSI A\. o ROSSI M\./.test(due) && /nome esatto/.test(due));
    verifica('  ...mentre il nome esatto, o l\'inizio di un nome solo, vale',
      contesto._orariDocente_(omonimi, 'rossi m').nome === 'ROSSI M.' &&
      contesto._orariDocente_(omonimi, 'ROSSI A.').nome === 'ROSSI A.' && contesto._orariDocente_(omonimi, 'VER').nome === 'VERDI');
    const docenti = contesto.ORARI.docenti;
    contesto.ORARI.docenti = docenti.concat([{ nome: salva.docente + ' BIS', celle: docOriginale.celle.slice() }]);
    contesto.ORARI.calendario = Object.assign({}, salva, { docente: salva.docente.slice(0, -1) });
    azzeraCalendario();
    sbaglio = errore(() => contesto.ORARI_4_calendario());
    contesto.ORARI.docenti = docenti;
    verifica('  ...e ORARI_4_calendario con quel nome si ferma prima di toccare il calendario',
      /puo' essere/.test(sbaglio) && calendari.length === 0);
  }
  contesto.ORARI.calendario = Object.assign({}, salva, { fine: '2026-09-01' });
  sbaglio = errore(() => contesto.ORARI_4_calendario());
  verifica('con la fine prima dell\'inizio si ferma', /prima/i.test(sbaglio));
  azzeraCalendario();
  contesto.ORARI.calendario = Object.assign({}, salva,
    { sospensioni: [{ dal: '2027-01-06', al: '2026-12-23', nome: 'al contrario' }] });
  sbaglio = errore(() => contesto.ORARI_4_calendario());
  verifica('con un giorno senza lezione che non si capisce si ferma, lo dice e non tocca il calendario',
    /giorno senza lezione/.test(sbaglio) && /rigenera/i.test(sbaglio) && calendari.length === 0);
  contesto.ORARI.calendario = salva;

  // --- quale calendario: solo uno tuo, con il nome scritto proprio cosi' ------
  intestazione('CALENDARIO: SOLO I TUOI, CON IL NOME ESATTO');
  azzeraCalendario();
  // un calendario di un collega a cui sei iscritto, con lo stesso nome, e uno
  // tuo con il nome in minuscolo: Google li darebbe tutti e due a getCalendarsByName
  const iscritto = CalendarApp.createCalendar(c.nome);
  iscritto.proprio = false;
  const minuscolo = CalendarApp.createCalendar(c.nome.toLowerCase());
  contesto.ORARI_4_calendario();
  const tuo = calendari.find(x => x.proprio && x.nome === c.nome);
  verifica('non usa un calendario a cui sei solo iscritto, ne\' uno tuo con le maiuscole diverse: crea il suo',
    !!tuo && tuo !== iscritto && tuo !== minuscolo && iscritto.serie.length === 0 && minuscolo.serie.length === 0 &&
    vive(tuo).length === piano.tratti.length);
  // due calendari tuoi con lo stesso nome esatto: non ne sceglie uno a caso
  const gemello = CalendarApp.createCalendar(c.nome);
  for (const [fn, come] of [['ORARI_ANNULLA_calendario', 'toglie'], ['ORARI_5_cambioOrario', 'cambia'],
                            ['ORARI_4_calendario', 'mette']]) {
    const primaDue = scritture;
    const due = errore(() => contesto[fn]());
    verifica('con due tuoi calendari chiamati "' + c.nome + '" ' + fn + ' si ferma, lo dice e non ' + come + ' niente',
      /2 calendari/.test(due) && vive(tuo).length === piano.tratti.length && gemello.serie.length === 0 &&
      scritture === primaDue && !proprieta.has(PROGRESSO_CALENDARIO));
  }

  // --- il fuso: Google ripete le serie alla stessa ora del fuso del calendario --
  intestazione('CALENDARIO: IL FUSO ORARIO');
  azzeraCalendario();
  contesto.ORARI_4_calendario();
  const calFuso = calendari[0];
  verifica('il calendario nasce con il fuso dello script (' + FUSO_BANCO + '), non in UTC come senza fuso',
    calFuso.opzioni.timeZone === FUSO_BANCO && calFuso.getTimeZone() === FUSO_BANCO);
  // una serie che passa la fine dell'ora legale, domenica 25/10/2026
  const finisceLegale = new Date(2026, 9, 25);
  const aCavallo = vive(calFuso).filter(s => s.inizio < finisceLegale && s.inizi(ultimoGiorno).some(t => t > finisceLegale));
  const oreDi = s => [...new Set(s.lezioni(ultimoGiorno).map(l => ora(minutiDi(l.inizio))))];
  verifica('le serie che passano il 25/10 (' + aCavallo.length + ') tengono la stessa ora prima e dopo la fine dell\'ora legale',
    aCavallo.length > 0 && aCavallo.every(s => oreDi(s).length === 1 && oreDi(s)[0] === ora(minutiDi(s.inizio))));
  verifica('  ...e l\'anteprima non dice che il calendario e\' da sistemare',
    !/Calendario da sistemare/.test(contesto.ORARI_1_anteprima()));
  // la forma di una lezione si guarda nel fuso del calendario: in UTC le
  // lezioni dopo il 25/10, un'ora prima a Roma, non sono spostate
  {
    const lez = (mese, giorno, ora0) => ({ inizio: new Date(2026, mese, giorno, ora0, 0), fine: new Date(2026, mese, giorno, ora0 + 1, 0) });
    const inUtc = () => ({ lezioni: [lez(9, 12, 8), lez(9, 19, 8), lez(9, 26, 7), lez(10, 2, 7), lez(10, 9, 7)] });
    const vUtc = inUtc(), vRoma = inUtc();
    contesto._orariPrimaLezione_(vUtc, null, 'UTC');
    contesto._orariPrimaLezione_(vRoma, null, FUSO_BANCO);
    verifica('nel fuso del calendario (UTC) le lezioni dopo il 25/10 non sembrano spostate: la serie comincia il 12/10 ' +
      'alle 8, regolare', vUtc.inizio.getTime() === new Date(2026, 9, 12, 8, 0).getTime() && vUtc.irregolare === false);
    verifica('  ...mentre guardate nel fuso di Roma sembrerebbero tutte spostate',
      vRoma.irregolare === true && vRoma.inizio.getTime() !== vUtc.inizio.getTime());
  }

  // un calendario messo da Campanella 1.5: creato senza fuso (UTC), con le
  // serie dell'orario alla stessa ora UTC. Dal 26/10 le lezioni sono un'ora prima
  function calendarioDella15() {
    const calX = CalendarApp.createCalendar(c.nome);
    for (const tr of piano.tratti) {
      const d0 = dataDa(tr.dal), d1 = dataDa(tr.al);
      const s15 = calX.createEventSeries(tr.blocco.testo,
        new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 0, minutiDellOra(tr.blocco.oraDa)),
        new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 0, minutiDellOra(tr.blocco.oraA) + minuti),
        CalendarApp.newRecurrence().addWeeklyRule().until(new Date(d1.getFullYear(), d1.getMonth(), d1.getDate(), 23, 59, 59)),
        { description: '[Campanella] Orario di ' + c.docente + ' (messo con la 1.5)' });
      s15.setTag('campanella', 'orario');
    }
    return calX;
  }
  azzeraCalendario();
  const cal15 = calendarioDella15();
  const sbagliate = lezioniSul(cal15, primoGiorno, ultimoGiorno);
  const primaDel25 = l => l.slice(0, 10) < '2026-10-25';
  verifica('in un calendario UTC le lezioni sono giuste fino al 25/10 e poi un\'ora prima: il finto calendario fa come Google',
    cal15.getTimeZone() === 'UTC' && uguali(sbagliate.filter(primaDel25), piano.lezioni.filter(primaDel25)) &&
    !uguali(sbagliate, piano.lezioni) && sbagliate.length === piano.lezioni.length);
  const serie15 = vive(cal15).length;
  for (const [fn, come] of [['ORARI_4_calendario', 'mette'], ['ORARI_5_cambioOrario', 'cambia']]) {
    if (fn === 'ORARI_5_cambioOrario' && !c.validoDal) continue;
    const primaDel15 = scritture;
    const e = errore(() => contesto[fn]());
    verifica(fn + ' in quel calendario si ferma, spiega (un\'ora prima; ORARI_ANNULLA_calendario e poi ORARI_4_calendario; ' +
      'le modifiche fatte a mano si perdono) e non ' + come + ' niente' + (e ? '' : ' (invece nessun errore)'),
      /fuso orario UTC/.test(e) && /un'ora prima/.test(e) && /ORARI_ANNULLA_calendario/.test(e) &&
      /poi ORARI_4_calendario/.test(e) && /modifiche fatte a mano/.test(e) && /Non ho aggiunto/.test(e) &&
      vive(cal15).length === serie15 && cal15.getTimeZone() === 'UTC' && scritture === primaDel15 &&
      !proprieta.has(PROGRESSO_CALENDARIO) && uguali(lezioniSul(cal15, primoGiorno, ultimoGiorno), sbagliate));
  }
  verifica('ORARI_1_anteprima lo dice, con il rimedio',
    /Calendario da sistemare\. Il calendario "[^"]+" ha il fuso orario UTC/.test(contesto.ORARI_1_anteprima()));
  contesto.ORARI_ANNULLA_calendario();
  const rimesso = contesto.ORARI_4_calendario();
  verifica('dopo ORARI_ANNULLA_calendario, ORARI_4_calendario da\' al calendario il fuso dello script, e lo dice',
    calendari.length === 1 && cal15.getTimeZone() === FUSO_BANCO && /aveva il fuso orario UTC/.test(rimesso));
  verifica('  ...e le lezioni restano alla loro ora anche dopo il 25/10, e il messaggio dice che l\'ha controllato ' +
    'su una serie che passa il cambio dell\'ora',
    uguali(lezioniSul(cal15, primoGiorno, ultimoGiorno), piano.lezioni) && /controllato: in una serie che lo passa/.test(rimesso));

  // lo stesso calendario della 1.5, ma il docente, letto che ha il fuso UTC,
  // gliel'ha cambiato dalle impostazioni di Google Calendar: il calendario
  // dice Europe/Rome, ma le serie gia' messe restano nel fuso in cui sono
  // nate (la supposizione del finto, vedi sopra), e dal 26/10 le lezioni
  // sono ancora un'ora prima. Lo script guarda le serie, non solo il fuso del
  // calendario: l'anteprima lo dice, ORARI_4 e ORARI_5 si fermano, con il rimedio
  azzeraCalendario();
  const calCambiato = calendarioDella15();
  calCambiato.setTimeZone(FUSO_BANCO);
  const serieCambiato = vive(calCambiato).length;
  verifica('il fuso cambiato a mano non sposta le lezioni gia\' messe: dal 26/10 sono ancora un\'ora prima',
    calCambiato.getTimeZone() === FUSO_BANCO && uguali(lezioniSul(calCambiato, primoGiorno, ultimoGiorno), sbagliate));
  const antCambiato = contesto.ORARI_1_anteprima();
  verifica('ORARI_1_anteprima dice che il calendario e\' da sistemare anche se ha gia\' il fuso ' + FUSO_BANCO +
    ': le serie di prima restano nel loro fuso, un\'ora prima, e cambiarlo a mano non basta; con il rimedio',
    /Calendario da sistemare\. Il calendario "[^"]+" ha il fuso orario Europe\/Rome, come lo script, ma \d+ serie messe da Campanella [^\n]* ripetono le lezioni/.test(antCambiato) &&
    /un'ora prima/.test(antCambiato) && /non basta/.test(antCambiato) && /ORARI_ANNULLA_calendario/.test(antCambiato) &&
    /poi ORARI_4_calendario/.test(antCambiato) && /invece che alle/.test(antCambiato));
  for (const [fn, come] of [['ORARI_4_calendario', 'mette'], ['ORARI_5_cambioOrario', 'cambia']]) {
    if (fn === 'ORARI_5_cambioOrario' && !c.validoDal) continue;
    const primaDelCambiato = scritture;
    const e = errore(() => contesto[fn]());
    verifica('  ...' + fn + ' si ferma con la stessa spiegazione e non ' + come + ' niente' + (e ? '' : ' (invece nessun errore)'),
      /ha il fuso orario Europe\/Rome, come lo script, ma/.test(e) && /un'ora prima/.test(e) && /non basta/.test(e) &&
      /ORARI_ANNULLA_calendario/.test(e) && /poi ORARI_4_calendario/.test(e) && /modifiche fatte a mano/.test(e) &&
      /Non ho aggiunto/.test(e) && vive(calCambiato).length === serieCambiato && scritture === primaDelCambiato &&
      !proprieta.has(PROGRESSO_CALENDARIO) && uguali(lezioniSul(calCambiato, primoGiorno, ultimoGiorno), sbagliate));
  }
  contesto.ORARI_ANNULLA_calendario();
  const rimessoCambiato = contesto.ORARI_4_calendario();
  verifica('  ...e con il rimedio (ORARI_ANNULLA_calendario, poi ORARI_4_calendario) nello stesso calendario le lezioni ' +
    'sono alla loro ora anche dopo il 25/10',
    calendari.length === 1 && /Uso il calendario/.test(rimessoCambiato) &&
    uguali(lezioniSul(calCambiato, primoGiorno, ultimoGiorno), piano.lezioni) &&
    !/Calendario da sistemare/.test(contesto.ORARI_1_anteprima()));
  // quale serie e' nata in un altro fuso: conta l'ora piu' frequente fra le
  // lezioni dopo il cambio dell'ora, non una lezione spostata a mano
  {
    const lez = (mese, giorno, ora0) => ({ inizio: new Date(2026, mese, giorno, ora0, 0), fine: new Date(2026, mese, giorno, ora0 + 1, 0) });
    const nataInUtc = { lezioni: [lez(9, 12, 8), lez(9, 19, 8), lez(9, 26, 7), lez(10, 2, 7), lez(10, 9, 7)] };
    const provaUtc = contesto._orariSerieNataInUnAltroFuso_(nataInUtc, FUSO_BANCO);
    verifica('una serie alla stessa ora UTC prima e dopo il 25/10 e\' nata in un altro fuso: la lezione del 26/10 e\' alle ' +
      '7 invece che alle 8', !!provaUtc && provaUtc.sbagliata === nataInUtc.lezioni[2] && provaUtc.attesa === '08:00');
    const spostataUnOra = { lezioni: [lez(9, 12, 8), lez(9, 19, 8), lez(9, 26, 7), lez(10, 2, 8), lez(10, 9, 8)] };
    verifica('  ...mentre una serie di Roma con una lezione dopo il 25/10 spostata a mano un\'ora prima no',
      contesto._orariSerieNataInUnAltroFuso_(spostataUnOra, FUSO_BANCO) === null);
    const senzaCambio = { lezioni: [lez(9, 5, 8), lez(9, 12, 8), lez(9, 19, 8)] };
    verifica('  ...e una che non passa un cambio dell\'ora nemmeno',
      contesto._orariSerieNataInUnAltroFuso_(senzaCambio, FUSO_BANCO) === null);
  }
  // un calendario UTC senza lezioni di Campanella (creato a mano): prende il
  // fuso dello script prima di ricevere le lezioni. L'anteprima lo dice prima
  azzeraCalendario();
  const calAMano = CalendarApp.createCalendar(c.nome);
  calAMano.createEvent('Collegio docenti', new Date(2026, 9, 5, 15, 0), new Date(2026, 9, 5, 17, 0));
  const antAMano = contesto.ORARI_1_anteprima();
  verifica('l\'anteprima dice che il calendario ha un altro fuso e che ORARI_4_calendario gli mettera\' quello dello script',
    /ha il fuso orario UTC, non Europe\/Rome: ORARI_4_calendario \(o ORARI_5_cambioOrario\) gli mette Europe\/Rome/.test(antAMano) &&
    !/Calendario da sistemare/.test(antAMano));
  const conFuso = contesto.ORARI_4_calendario();
  verifica('un calendario UTC senza lezioni di Campanella prende il fuso dello script, e le lezioni sono alla loro ora',
    calendari.length === 1 && calAMano.getTimeZone() === FUSO_BANCO && /aveva il fuso orario UTC/.test(conFuso) &&
    uguali(lezioniSul(calAMano, primoGiorno, ultimoGiorno), piano.lezioni) && calAMano.eventi.every(e => !e.cancellato));

  // la prova si fa solo su un tratto che passa un cambio dell'ora (25/10/2026, 28/03/2027)
  {
    const passa = (dal, al) => contesto._orariPassaUnCambioDellOra_({ dal, al });
    verifica('un tratto passa un cambio dell\'ora solo se una sua settimana cade dopo il 25/10 o il 28/03 e la prima no',
      !passa('2026-09-14', '2026-10-19') && passa('2026-09-14', '2026-10-26') && !passa('2026-11-02', '2027-03-22') &&
      passa('2026-11-02', '2027-03-29') && !passa('2026-10-26', '2026-10-26'));
  }
  // e se Google facesse altrimenti (setTimeZone non e' provato dal vivo):
  // (1) setTimeZone senza effetto: l'oggetto su cui lo script l'ha chiamato
  // dice Europe/Rome, ma il calendario ripreso da Google dice ancora UTC, e
  // lo script si ferma prima di mettere lezioni, con il rimedio. Uno script
  // che guardasse lo stesso oggetto invece di riprendere il calendario
  // metterebbe le lezioni in UTC, e questa prova fallirebbe
  azzeraCalendario();
  fusoDiGoogle = 'setTimeZone senza effetto';
  const calFermo = CalendarApp.createCalendar(c.nome);
  const fermoFuso = errore(() => contesto.ORARI_4_calendario());
  verifica('se Google non cambiasse il fuso del calendario, ORARI_4_calendario se ne accorge riprendendolo, si ferma ' +
    'prima di mettere lezioni e dice di usare un calendario nuovo',
    /dice che ha ancora UTC/.test(fermoFuso) && /Non ho messo, cambiato ne' tolto lezioni/.test(fermoFuso) &&
    /cambia il nome del calendario/.test(fermoFuso) && /crea un calendario nuovo/.test(fermoFuso) &&
    calFermo.serie.length === 0 && !proprieta.has(PROGRESSO_CALENDARIO));
  // (2) getTimeZone dice il fuso nuovo, ma le serie nuove restano nel fuso di
  // prima: la prova sulla prima serie che passa il 25/10 lo vede, e lo script
  // si ferma, e resta fermo (anche rieseguito, o in una ripresa) finche'
  // ORARI_ANNULLA_calendario non dimentica il lavoro
  azzeraCalendario();
  fusoDiGoogle = 'serie nel fuso di nascita';
  const calNascita = CalendarApp.createCalendar(c.nome);
  const nascita = errore(() => contesto.ORARI_4_calendario());
  const dopoNascita = vive(calNascita).length;
  verifica('se le serie nuove restassero nel fuso di prima, ORARI_4_calendario se ne accorge dalla prima serie che ' +
    'passa il 25/10, si ferma subito (' + dopoNascita + ' serie) e dice l\'ora sbagliata e il rimedio',
    /Google non ripete le lezioni del calendario/.test(nascita) && /invece che alle/.test(nascita) &&
    /ORARI_ANNULLA_calendario/.test(nascita) && /crea un calendario nuovo/.test(nascita) &&
    dopoNascita >= 1 && dopoNascita < piano.tratti.length && !!salvato() && !!salvato().fusoSbagliato &&
    ripresaDi('ORARI_4_calendario').length === 0);
  const primaDiRieseguire = scritture;
  const ancora = errore(() => contesto.ORARI_4_calendario());
  trigger.push({ fn: 'ORARI_4_calendario', ms: 60000 });
  const ancoraRipresa = errore(() => contesto.ORARI_4_calendario({ triggerUid: 'ripresa' }));
  const ancoraCambio = c.validoDal ? errore(() => contesto.ORARI_5_cambioOrario()) : nascita;
  verifica('  ...rieseguito, ripreso o con ORARI_5_cambioOrario dice la stessa cosa e non mette altro',
    ancora === nascita && ancoraRipresa === nascita && ancoraCambio === nascita && scritture === primaDiRieseguire &&
    vive(calNascita).length === dopoNascita && ripresaDi('ORARI_4_calendario').length === 0);
  contesto.ORARI_ANNULLA_calendario();
  // senza cambiare il nome: il calendario dice gia' il fuso dello script, ma
  // la prova lo ferma lo stesso
  const senzaNome = errore(() => contesto.ORARI_4_calendario());
  verifica('  ...dopo ORARI_ANNULLA_calendario, sullo stesso calendario (che ora dice ' + calNascita.getTimeZone() +
    ') si ferma ancora', /Google non ripete le lezioni del calendario/.test(senzaNome));
  contesto.ORARI_ANNULLA_calendario();
  calNascita.nome = c.nome + ' (vecchio)';
  const nuovoCal = contesto.ORARI_4_calendario();
  const calNuovo = calendari.find(x => x !== calNascita && x.nome === c.nome);
  verifica('  ...e con il rimedio (ORARI_ANNULLA_calendario, il nome cambiato, ORARI_4_calendario) c\'e\' un calendario ' +
    'nuovo con il fuso dello script, e le lezioni sono alla loro ora',
    !!calNuovo && calNuovo.getTimeZone() === FUSO_BANCO && /Creato il calendario/.test(nuovoCal) &&
    uguali(lezioniSul(calNuovo, primoGiorno, ultimoGiorno), piano.lezioni) && vive(calNascita).length === 0);
  azzeraCalendario();

  // --- i giorni senza lezione, uno per uno -------------------------------------
  intestazione('GIORNI SENZA LEZIONE');
  azzeraCalendario();
  verifica('i dati hanno giorni senza lezione (' + sospensioni.length + ')', sospensioni.length > 0);
  contesto.ORARI_4_calendario();
  const calG = calendari[0];
  const lezioniG = lezioniSul(calG, primoGiorno, ultimoGiorno);
  verifica('nessuna lezione in un giorno senza lezione (' + lezioniG.length + ' lezioni guardate)',
    lezioniG.length > 0 && lezioniG.every(l => !sospeso(l.slice(0, 10))));
  // per un blocco: data -> serie di ogni sua lezione
  function serieDelBlocco(calX, b) {
    const fuori = {};
    const fine = new Date(ultimoGiorno.getFullYear(), ultimoGiorno.getMonth(), ultimoGiorno.getDate(), 23, 59, 59);
    for (const e of calX.getEvents(primoGiorno, fine)) {
      if (!nostro(e) || e.getTitle() !== b.testo || minutiDi(e.getStartTime()) !== minutiDellOra(b.oraDa)) continue;
      if (e.getStartTime().getDay() !== giornoSettimana(D.giorni[b.giorno])) continue;
      fuori[chiave(e.getStartTime())] = e.getEventSeries().getId();
    }
    return fuori;
  }
  const dentroPeriodo = d => d >= primoGiorno && d <= ultimoGiorno;
  /** Un blocco nel giorno della settimana dato con lezione la settimana prima e quella dopo del giorno k. */
  function bloccoAttorno(k, gs, sospesoIlGiorno) {
    const d = dataDa(k), prima = giorniDopo(d, -7), dopo = giorniDopo(d, 7);
    if (!dentroPeriodo(prima) || !dentroPeriodo(dopo) || sospeso(chiave(prima)) || sospeso(chiave(dopo))) return null;
    if (sospesoIlGiorno !== sospeso(k)) return null;
    return attesi.find(b => giornoSettimana(D.giorni[b.giorno]) === gs) || null;
  }
  // una festa isolata: un giorno solo, con lezione la settimana prima e quella dopo
  const isolate = sospensioni.filter(s => s.dal === s.al)
    .map(s => ({ s, b: bloccoAttorno(s.dal, dataDa(s.dal).getDay(), true) })).filter(x => x.b);
  verifica('i dati hanno una festa isolata in un giorno con lezione (' +
    isolate.map(x => x.s.nome || x.s.dal).join(', ') + ')', isolate.length > 0);
  if (isolate.length) {
    const { s, b } = isolate[0];
    const serie = serieDelBlocco(calG, b);
    const prima = chiave(giorniDopo(dataDa(s.dal), -7)), dopo = chiave(giorniDopo(dataDa(s.dal), 7));
    verifica('una festa isolata (' + (s.nome || s.dal) + '): niente lezione quel giorno, e la settimana prima e ' +
      'quella dopo stanno in due serie diverse', !serie[s.dal] && !!serie[prima] && !!serie[dopo] && serie[prima] !== serie[dopo]);
  }
  // le vacanze lunghe: almeno una settimana intera senza lezione
  const lunghe = sospensioni.filter(s => (dataDa(s.al) - dataDa(s.dal)) >= 7 * 24 * 3600 * 1000);
  verifica('i dati hanno vacanze lunghe (' + lunghe.map(s => s.nome || s.dal).join(', ') + ')', lunghe.length > 0);
  if (lunghe.length) {
    const v = lunghe[0];
    verifica('nelle vacanze lunghe (' + (v.nome || v.dal) + ') nessuna lezione',
      lezioniG.every(l => l.slice(0, 10) < v.dal || l.slice(0, 10) > v.al));
    const b = attesi[0];
    const serie = serieDelBlocco(calG, b);
    const date = Object.keys(serie).sort();
    const ultimaPrima = date.filter(k => k < v.dal).pop(), primaDopo = date.find(k => k > v.al);
    verifica('e l\'ultima lezione prima e la prima dopo stanno in due serie diverse',
      !!ultimaPrima && !!primaDopo && serie[ultimaPrima] !== serie[primaDopo]);
  }
  // Pasquetta: spezza i blocchi del lunedi' e non quelli del mercoledi'
  const pasqua = anno => {                        // Gauss, nella forma di Meeus: scritta qui una seconda volta
    const a = anno % 19, b = Math.floor(anno / 100), cc = anno % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(cc / 4), k = cc % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(anno, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  };
  const pasquetta = chiave(giorniDopo(pasqua(ultimoGiorno.getFullYear()), 1));
  const lunedi = bloccoAttorno(pasquetta, 1, true);
  const mercoledi = bloccoAttorno(chiave(giorniDopo(dataDa(pasquetta), 2)), 3, false);
  verifica('i dati hanno Pasquetta (' + pasquetta + ') fra i giorni senza lezione, da sola, e blocchi il lunedi\' ' +
    'e il mercoledi\'', sospensioni.some(s => s.dal === pasquetta && s.al === pasquetta) && !!lunedi && !!mercoledi);
  if (lunedi && mercoledi) {
    const sl = serieDelBlocco(calG, lunedi), sm = serieDelBlocco(calG, mercoledi);
    const lPrima = chiave(giorniDopo(dataDa(pasquetta), -7)), lDopo = chiave(giorniDopo(dataDa(pasquetta), 7));
    verifica('Pasquetta spezza il blocco del lunedi\' (' + lunedi.testo + '): niente lezione, e due serie attorno',
      !sl[pasquetta] && !!sl[lPrima] && !!sl[lDopo] && sl[lPrima] !== sl[lDopo]);
    const mPrima = chiave(giorniDopo(dataDa(pasquetta), -5)), mDopo = chiave(giorniDopo(dataDa(pasquetta), 2));
    verifica('e lascia intero quello del mercoledi\' (' + mercoledi.testo + '): la stessa serie prima e dopo',
      !!sm[mPrima] && !!sm[mDopo] && sm[mPrima] === sm[mDopo]);
  }
  const anteprimaG = contesto.ORARI_1_anteprima();
  verifica('l\'anteprima dice le stesse serie e le stesse lezioni saltate',
    numero(/Serie settimanali da creare con ORARI_4_calendario: (\d+)/, anteprimaG) === piano.tratti.length &&
    numero(/Lezioni saltate nei giorni senza lezione: (\d+)/, anteprimaG) === piano.saltate);
  if (c.validoDal) {
    const dalCambio = pianoAtteso(celleOriginali, dataDa(c.validoDal) > primoGiorno ? dataDa(c.validoDal) : primoGiorno);
    const serieCambio = numero(/ORARI_5_cambioOrario: (\d+) serie nuove/, anteprimaG);
    const saltateCambio = numero(/serie nuove da quel giorno, (\d+) lezioni saltate/, anteprimaG);
    console.log('  PIANO DAL CAMBIO: ' + serieCambio + ' serie, ' + saltateCambio + ' lezioni saltate');
    verifica('e quante serie creerebbe dal ' + c.validoDal + ' (' + dalCambio.tratti.length + ')',
      serieCambio === dalCambio.tratti.length && saltateCambio === dalCambio.saltate);
  }
  // un giorno senza lezione fuori dal periodo (un anno sbagliato) non si conta
  {
    const nelPeriodo = sospensioni.filter(s => s.al >= c.inizio && s.dal <= c.fine).length;
    const salvaSosp = contesto.ORARI.calendario;
    contesto.ORARI.calendario = Object.assign({}, salvaSosp, { sospensioni: (salvaSosp.sospensioni || []).concat([
      { dal: '2025-11-01', al: '2025-11-01', nome: 'anno sbagliato' }, { dal: '2027-06-20', al: '2027-06-30', nome: 'dopo la fine' }]) });
    const conti = new RegExp('Giorni senza lezione: ' + nelPeriodo + ' ');
    verifica('l\'anteprima non conta i giorni senza lezione fuori dal periodo (' + nelPeriodo + ')',
      conti.test(contesto.ORARI_1_anteprima()));
    azzeraCalendario();
    verifica('e neanche il messaggio finale di ORARI_4_calendario', conti.test(contesto.ORARI_4_calendario()));
    contesto.ORARI.calendario = salvaSosp;
  }

  // --- la ripresa --------------------------------------------------------------
  intestazione('CALENDARIO: RIPRESA PER IL TEMPO MASSIMO');
  azzeraCalendario();
  sogliaCalendario = 5;
  const primaVolta = contesto.ORARI_4_calendario();
  const calT = calendari[0];
  verifica('si ferma al tempo massimo e lo dice (' + vive(calT).length + ' serie su ' + piano.tratti.length + ')',
    vive(calT).length === 5 && /Tempo massimo/.test(primaVolta));
  verifica('si ricorda a che punto e\', con la sua funzione e l\'impronta del piano',
    !!salvato() && salvato().funzione === 'ORARI_4_calendario' && salvato().fatti === 5 && !!salvato().impronta);
  verifica('programma la ripresa fra un minuto, sulla stessa funzione',
    ripresaDi('ORARI_4_calendario').length === 1 && ripresaDi('ORARI_4_calendario')[0].ms === 60000);
  const aMano = contesto.ORARI_4_calendario();
  verifica('rieseguito a mano a meta\' riprende, senza fermarsi per le serie che ha messo lui',
    vive(calT).length === 10 && !/gia'/.test(aMano));
  const giriT = riprendiFinoInFondo('ORARI_4_calendario');
  verifica('riprendendo arriva in fondo (' + giriT + ' riprese)',
    vive(calT).length === piano.tratti.length && !proprieta.has(PROGRESSO_CALENDARIO));
  verifica('senza doppioni, con proprio le lezioni del piano',
    senzaDoppioni(calT) && uguali(lezioniSul(calT, primoGiorno, ultimoGiorno), piano.lezioni));
  verifica('e toglie il trigger', ripresaDi('ORARI_4_calendario').length === 0);
  sogliaCalendario = Infinity;
  trigger.push({ fn: 'ORARI_4_calendario', ms: 60000 });
  const nienteCal = contesto.ORARI_4_calendario({ triggerUid: 'rimasto' });
  verifica('una ripresa che non trova niente da riprendere non crea niente, e toglie il trigger',
    /Niente da riprendere/.test(nienteCal) && vive(calT).length === piano.tratti.length &&
    ripresaDi('ORARI_4_calendario').length === 0);

  intestazione('CALENDARIO: RIPRESA PER I LIMITI DI GOOGLE');
  const LIMITI = [
    ['createEventSeries', 'Service invoked too many times in a short time: calendar. Try Utilities.sleep(1000) between calls.'],
    ['setTag', 'You have been creating or deleting too many calendars or calendar events in a short time. Please try again later.'],
    ['createEventSeries', 'Servizio richiamato troppe volte in poco tempo: calendar.'],
    ['createEventSeries', 'Rate Limit Exceeded']
  ];
  for (const [op, messaggio] of LIMITI) {
    azzeraCalendario();
    guasti([{ op, alla: 4, messaggio }]);
    const r = contesto.ORARI_4_calendario();
    const calL = calendari[0];
    const giaFatte = (op === 'setTag') ? 4 : 3;     // con setTag la serie c'e' gia': niente doppione
    verifica('"' + messaggio.slice(0, 48) + '..." (' + op + '): si ferma, lo dice e riprende fra un minuto',
      /Google/.test(r) && /fra un minuto/.test(r) && vive(calL).length === giaFatte && !!salvato() &&
      salvato().fatti === giaFatte && ripresaDi('ORARI_4_calendario').length === 1 &&
      ripresaDi('ORARI_4_calendario')[0].ms === 60000);
    riprendiFinoInFondo('ORARI_4_calendario');
    verifica('  ...e riprendendo finisce senza doppioni',
      vive(calL).length === piano.tratti.length && senzaDoppioni(calL) &&
      uguali(lezioniSul(calL, primoGiorno, ultimoGiorno), piano.lezioni) &&
      !proprieta.has(PROGRESSO_CALENDARIO) && ripresaDi('ORARI_4_calendario').length === 0);
    if (op === 'setTag') {
      // la serie a cui Google non ha salvato il contrassegno lo riceve alla
      // ripresa: il cambio d'orario la rifa' o la toglie come le altre, e
      // nessuna lezione compare due volte
      const senzaTag = vive(calL).filter(s => s.getTag('campanella') !== 'orario');
      verifica('  ...e la serie a cui Google non ha salvato il contrassegno lo riceve alla ripresa (' + senzaTag.length +
        ' senza)', senzaTag.length === 0 && calL.serie[3].getTag('campanella') === 'orario');
      if (c.validoDal) {
        docOriginale.celle = ruotata(celleOriginali);
        const cambioTag = contesto.ORARI_5_cambioOrario();
        const attesoTag = piano.lezioni.filter(l => l.slice(0, 10) < c.validoDal)
          .concat(pianoAtteso(ruotata(celleOriginali), dataDa(c.validoDal)).lezioni).sort();
        const doppie = lezioniSul(calL, primoGiorno, ultimoGiorno).filter((l, i, t) => t.indexOf(l) !== i);
        verifica('  ...e il cambio d\'orario dopo non lascia lezioni doppie' + (doppie.length ? ' (doppie: ' +
          doppie.slice(0, 3).join(', ') + ')' : ''),
          uguali(lezioniSul(calL, primoGiorno, ultimoGiorno), attesoTag) && !/senza contrassegno/.test(cambioTag));
        docOriginale.celle = celleOriginali.slice();
      }
    }
  }
  // il contrassegno non riesce neanche alla ripresa: si riprova la volta dopo
  azzeraCalendario();
  const LIMITE_TAG = 'You have been creating or deleting too many calendars or calendar events in a short time. Please try again later.';
  guasti([{ op: 'setTag', alla: 4, messaggio: LIMITE_TAG }, { op: 'setTag', alla: 5, messaggio: LIMITE_TAG }]);
  contesto.ORARI_4_calendario();
  const calR = calendari[0];
  contesto.ORARI_4_calendario({ triggerUid: 'ripresa' });
  verifica('se il contrassegno non riesce neanche alla ripresa, la serie resta da contrassegnare e non si crea ' +
    'nient\'altro', vive(calR).length === 4 && !!salvato() && salvato().daContrassegnare.length === 1 &&
    ripresaDi('ORARI_4_calendario').length === 1);
  riprendiFinoInFondo('ORARI_4_calendario');
  verifica('  ...e alla ripresa dopo lo riceve, e il lavoro finisce senza doppioni',
    vive(calR).length === piano.tratti.length && senzaDoppioni(calR) &&
    vive(calR).every(s => s.getTag('campanella') === 'orario') && !proprieta.has(PROGRESSO_CALENDARIO));
  // la serie senza contrassegno copiata a mano prima della ripresa: due uguali,
  // e non si sceglie. Nessuna delle due riceve il contrassegno, e il messaggio
  // finale lo dice, con il rimedio
  azzeraCalendario();
  guasti([{ op: 'setTag', alla: 4, messaggio: LIMITE_TAG }]);
  contesto.ORARI_4_calendario();
  const calD = calendari[0];
  const quarta = calD.serie[3];
  const gemella = calD.createEventSeries(quarta.titolo, quarta.inizio, quarta.fine, quarta.ricorrenza,
                                         { description: quarta.getDescription() });
  riprendiFinoInFondo('ORARI_4_calendario');
  const fineD = registro[registro.length - 1];
  verifica('con due serie uguali senza contrassegno (una copiata a mano) non ne sceglie una: nessuna lo riceve',
    !quarta.getTag('campanella') && !gemella.getTag('campanella') && !proprieta.has(PROGRESSO_CALENDARIO) &&
    vive(calD).filter(s => s.getTag('campanella') === 'orario').length === piano.tratti.length - 1);
  verifica('  ...e il messaggio finale lo dice, che il cambio d\'orario non la rifara\' e come rimediare',
    /non ha salvato il contrassegno/.test(fineD) && /non sono riuscito a rimetterlo/.test(fineD) &&
    fineD.indexOf(quarta.titolo + ', ') >= 0 && /due volte/.test(fineD) &&
    /ORARI_ANNULLA_calendario, poi di nuovo ORARI_4_calendario/.test(fineD));
  // un errore che non e' un limite: il punto resta, l'errore si vede
  azzeraCalendario();
  guasti([{ op: 'createEventSeries', alla: 3, messaggio: 'Errore interno di prova' }]);
  const altroErrore = errore(() => contesto.ORARI_4_calendario());
  verifica('un altro errore si vede cosi\' com\'e\', il punto resta salvato e non parte nessuna ripresa',
    altroErrore === 'Errore interno di prova' && !!salvato() && salvato().fatti === 2 &&
    ripresaDi('ORARI_4_calendario').length === 0);
  contesto.ORARI_4_calendario();
  verifica('  ...rieseguito a mano riparte da dove era arrivato, senza doppioni',
    vive(calendari[0]).length === piano.tratti.length && senzaDoppioni(calendari[0]) && !proprieta.has(PROGRESSO_CALENDARIO));
  // le operazioni della giornata finite: niente riprese ogni minuto fino a domani
  azzeraCalendario();
  guasti([{ op: 'createEventSeries', alla: 3, messaggio: 'Service invoked too many times for one day: calendar.' }]);
  const domani = contesto.ORARI_4_calendario();
  verifica('finite le operazioni della giornata si ferma, senza riprese, e dice di rieseguire domani',
    /domani/.test(domani) && ripresaDi('ORARI_4_calendario').length === 0 && !!salvato() && salvato().fatti === 2);
  contesto.ORARI_4_calendario();
  verifica('  ...e il giorno dopo finisce il lavoro senza doppioni',
    vive(calendari[0]).length === piano.tratti.length && senzaDoppioni(calendari[0]) && !proprieta.has(PROGRESSO_CALENDARIO));
  // Google rifiuta sempre: dopo un po' smette di riprovare ogni minuto
  azzeraCalendario();
  guasti(Array.from({ length: 60 }, (x, i) => ({ op: 'createEventSeries', alla: i + 1, messaggio: 'Rate Limit Exceeded' })));
  contesto.ORARI_4_calendario();
  let ultimo = '', giriL = 0;
  while (ripresaDi('ORARI_4_calendario').length && giriL < 40) {
    ultimo = contesto.ORARI_4_calendario({ triggerUid: 'rifiutato' + giriL });
    giriL++;
  }
  verifica('se Google rifiuta ancora e ancora, dopo ' + giriL + ' riprese smette e dice di riprovare piu\' tardi',
    giriL > 1 && giriL < 20 && /piu' tardi/.test(ultimo) && ripresaDi('ORARI_4_calendario').length === 0 && !!salvato());
  guasti([]);
  contesto.ORARI_4_calendario();
  verifica('  ...e rieseguito piu\' tardi finisce il lavoro',
    vive(calendari[0]).length === piano.tratti.length && !proprieta.has(PROGRESSO_CALENDARIO));

  intestazione('CALENDARIO: BLOCCO DI ESECUZIONE');
  azzeraCalendario();
  lockOccupato = true;
  const occupatoCal = contesto.ORARI_4_calendario();
  verifica('con il blocco preso da un\'altra esecuzione non crea niente, non programma niente e dice di riprovare',
    calendari.length === 0 && /riprova/.test(occupatoCal) && trigger.length === 0);
  lockOccupato = false;
  sogliaCalendario = 5;
  contesto.ORARI_4_calendario();
  sogliaCalendario = Infinity;
  trigger.length = 0;
  lockOccupato = true;
  const rinviataCal = contesto.ORARI_4_calendario({ triggerUid: 'ripresa' });
  verifica('una ripresa che trova il blocco preso si riprogramma fra un minuto, senza creare niente',
    /fra un minuto/.test(rinviataCal) && ripresaDi('ORARI_4_calendario').length === 1 && vive(calendari[0]).length === 5);
  const annullaOccupato = contesto.ORARI_ANNULLA_calendario();
  verifica('con il blocco preso ORARI_ANNULLA_calendario non toglie niente, non dimentica niente e dice di riprovare',
    /riprova/.test(annullaOccupato) && vive(calendari[0]).length === 5 && !!salvato() &&
    ripresaDi('ORARI_4_calendario').length === 1);
  trigger.length = 0;
  const primaDelBlocco = scritture;
  const cambioOccupato = contesto.ORARI_5_cambioOrario();
  verifica('anche ORARI_5_cambioOrario aspetta il blocco, e riprogramma la ripresa del lavoro a meta\'',
    /fra un minuto/.test(cambioOccupato) && ripresaDi('ORARI_4_calendario').length === 1 && scritture === primaDelBlocco);
  lockOccupato = false;
  riprendiFinoInFondo('ORARI_4_calendario');
  verifica('liberato il blocco, la ripresa finisce il lavoro',
    vive(calendari[0]).length === piano.tratti.length && !proprieta.has(PROGRESSO_CALENDARIO));

  intestazione('CALENDARIO: DATIORARI.GS CAMBIATO A META\'');
  azzeraCalendario();
  sogliaCalendario = 5;
  contesto.ORARI_4_calendario();
  sogliaCalendario = Infinity;
  const calI = calendari[0];
  // incollato un DatiOrari.gs con un altro orario e la data da cui vale: le
  // settimane prima devono avere l'orario di prima, quindi si finisce con i
  // dati di prima e poi si fa il cambio (annullare e rimettere darebbe
  // l'orario nuovo anche alle settimane prima)
  const salvaI = contesto.ORARI.calendario;
  contesto.ORARI.calendario = Object.assign({}, salvaI, { validoDal: c.validoDal || '2026-10-05' });
  docOriginale.celle = ruotata(celleOriginali);
  const cambiato = errore(() => contesto.ORARI_4_calendario({ triggerUid: 'ripresa' }));
  verifica('la ripresa si accorge che DatiOrari.gs e\' cambiato, si ferma e spiega cosa fare',
    /DatiOrari\.gs/.test(cambiato) && /cambiato/.test(cambiato));
  verifica('con la data del cambio: prima finire con il DatiOrari.gs di prima, poi ORARI_5_cambioOrario (annullare e ' +
    'rimettere solo come alternativa)', /di prima/.test(cambiato) && /ORARI_5_cambioOrario/.test(cambiato) &&
    cambiato.indexOf('ORARI_5_cambioOrario') < cambiato.indexOf('ORARI_ANNULLA_calendario'));
  verifica('senza creare altre serie', vive(calI).length === 5);
  verifica('toglie la ripresa, ma si ricorda a che punto era: serve per finire con i dati di prima',
    !!salvato() && salvato().fatti === 5 && ripresaDi('ORARI_4_calendario').length === 0);
  const ancoraCambiato = errore(() => contesto.ORARI_4_calendario());
  verifica('rieseguito con i dati nuovi si ferma di nuovo, senza raddoppiare niente',
    /cambiato/.test(ancoraCambiato) && vive(calI).length === 5 && !!salvato());
  contesto.ORARI.calendario = Object.assign({}, salvaI, { validoDal: '' });
  const senzaData = errore(() => contesto.ORARI_4_calendario());
  verifica('senza la data del cambio: rimettere i dati di prima per finire, oppure annullare e rimettere tutto',
    /di prima/.test(senzaData) && /ORARI_ANNULLA_calendario/.test(senzaData) && !/ORARI_5_cambioOrario/.test(senzaData));
  contesto.ORARI.calendario = salvaI;
  docOriginale.celle = celleOriginali.slice();
  const finito = errore(() => contesto.ORARI_4_calendario());
  verifica('rimessi i dati di prima, ORARI_4_calendario finisce da dove era arrivato, senza doppioni' +
    (finito ? ' (invece: ' + finito.split('\n')[0].slice(0, 80) + ')' : ''),
    finito === '' && vive(calI).length === piano.tratti.length && senzaDoppioni(calI) && !proprieta.has(PROGRESSO_CALENDARIO));

  // --- il cambio d'orario --------------------------------------------------------
  intestazione('CAMBIO D\'ORARIO');
  const validoDal = String(c.validoDal || '');
  verifica('i dati hanno la data del cambio d\'orario (validoDal ' + validoDal + '), dopo l\'inizio e prima della fine',
    /^\d{4}-\d{2}-\d{2}$/.test(validoDal) && validoDal > c.inizio && validoDal <= c.fine);
  const vd = dataDa(validoDal || c.inizio);
  const giornoPrima = giorniDopo(vd, -1);
  const nuovoPiano = pianoAtteso(ruotata(celleOriginali), vd);
  // il calendario atteso dopo il cambio: le lezioni di prima fino al giorno prima, poi quelle nuove
  const attesoDopoCambio = piano.lezioni.filter(l => l.slice(0, 10) < validoDal).concat(nuovoPiano.lezioni).sort();
  if (validoDal) {
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    const calC = calendari[0];
    // un evento non nostro dopo il cambio, e due eventi singoli nostri, uno prima e uno dopo
    const altrui = calC.createEvent('Collegio docenti', new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() + 3, 15, 0),
                                    new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() + 3, 17, 0));
    const singoloDopo = calC.createEvent('Recupero', new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() + 1, 14, 0),
                                         new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() + 1, 15, 0));
    singoloDopo.setTag('campanella', 'orario');
    const singoloPrima = calC.createEvent('Recupero', new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() - 3, 14, 0),
                                          new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() - 3, 15, 0));
    singoloPrima.setTag('campanella', 'orario');
    const vecchie = vive(calC).slice();
    const primaDelCambio = lezioniSul(calC, primoGiorno, giornoPrima);
    const daRifare = vecchie.filter(s => chiave(s.inizio) < validoDal && chiave(s.ricorrenza.until) >= validoDal);
    const daTogliere = vecchie.filter(s => chiave(s.inizio) >= validoDal).length;
    verifica('i dati fanno rifare delle serie fino al giorno prima (' + daRifare.length + ') e toglierne altre (' +
      daTogliere + ')', daRifare.length > 0 && daTogliere > 0);
    docOriginale.celle = ruotata(celleOriginali);          // il nuovo orario, in un DatiOrari.gs nuovo
    occorrenzeTolte.length = 0;
    const esitoCambio = contesto.ORARI_5_cambioOrario();
    console.log(esitoCambio);
    verifica('dice quante serie ha rifatto fino al giorno prima (' + daRifare.length + ')',
      numero(/rifatte fino al [^:]*: (\d+)/, esitoCambio) === daRifare.length);
    verifica('quante ne ha tolte (' + daTogliere + ')', numero(/tolte[^:]*: (\d+)/, esitoCambio) === daTogliere);
    verifica('e quanti eventi singoli, a parte dalle serie (1)',
      numero(/Eventi singoli tolti[^:]*: (\d+)/, esitoCambio) === 1);
    verifica('quante ne ha create (' + nuovoPiano.tratti.length + ') e quante lezioni ha saltato (' + nuovoPiano.saltate + ')',
      numero(/create: (\d+)/, esitoCambio) === nuovoPiano.tratti.length &&
      numero(/Lezioni saltate nei giorni senza lezione: (\d+)/, esitoCambio) === nuovoPiano.saltate);
    verifica('e dice che le lezioni prima restano, anche quelle cambiate a mano (non piu\' che "potrebbero non restare")',
      /restano come erano, con le lezioni spostate o cancellate a mano/.test(esitoCambio) &&
      !/potrebbero non restare/.test(esitoCambio) && !/accorciate/.test(esitoCambio));
    verifica('le settimane prima del cambio restano com\'erano (' + primaDelCambio.length + ' lezioni)',
      uguali(lezioniSul(calC, primoGiorno, giornoPrima), primaDelCambio));
    verifica('nessuna lezione dell\'orario di prima dal ' + validoDal + ' in poi',
      vecchie.every(s => s.cancellata || s.lezioni(ultimoGiorno).every(l => chiave(l.inizio) < validoDal)));
    verifica('dal ' + validoDal + ' ci sono proprio le lezioni del nuovo orario (' + nuovoPiano.lezioni.length + ')',
      uguali(lezioniSul(calC, vd, ultimoGiorno), nuovoPiano.lezioni));
    // le serie rifatte: una per ogni serie vecchia che c'era prima e dopo il cambio
    const rifatteC = vive(calC).filter(s => s.getTag('campanella_sostituisce'));
    const giusta = s => {
      const v = vecchie.find(x => x.id === String(s.getTag('campanella_sostituisce')).split('|')[0]);
      const u = s.ricorrenza.until;
      return !!v && v.cancellata && s.titolo === v.titolo && s.getDescription() === v.getDescription() &&
        s.inizio.getTime() === v.inizio.getTime() && s.fine - s.inizio === v.fine - v.inizio &&
        s.getTag('campanella') === 'orario' && s.getTag('campanella_sostituisce') === v.id + '|' + chiave(giornoPrima) &&
        chiave(u) === chiave(giornoPrima) && u.getHours() === 23 && u.getMinutes() === 59 && u.getSeconds() === 59 &&
        s.fuso === FUSO_BANCO;
    };
    verifica('le serie vecchie con lezioni prima e dopo il cambio sono tolte, e al loro posto ce n\'e\' una nuova uguale ' +
      '(titolo, descrizione, prima lezione), fino al giorno prima alle 23:59:59, con il contrassegno e quello che dice ' +
      'quale serie sostituisce (' + rifatteC.length + ')',
      rifatteC.length === daRifare.length && rifatteC.every(giusta) && daRifare.every(v => v.cancellata));
    verifica('senza lezioni spostate o cancellate a mano, nessuna lezione tolta una per una e nessun evento singolo creato',
      occorrenzeTolte.length === 0 && !calC.eventi.some(e => e.getTag('campanella_sostituisce')));
    verifica('setRecurrence mai chiamata (non cambia niente)', conSetRecurrence.length === 0);
    verifica('l\'evento singolo nostro dopo il cambio e\' tolto, quello prima resta',
      singoloDopo.cancellato && !singoloPrima.cancellato);
    verifica('e l\'evento non nostro resta', !altrui.cancellato);
    verifica('lavoro finito: niente a meta\', nessuna ripresa',
      !proprieta.has(PROGRESSO_CALENDARIO) && ripresaDi('ORARI_5_cambioOrario').length === 0);
    // rieseguito con la stessa data: lo stesso calendario
    const dopoUno = lezioniSul(calC, primoGiorno, ultimoGiorno);
    const createLaPrimaVolta = vive(calC).filter(s => vecchie.indexOf(s) < 0 && !s.getTag('campanella_sostituisce')).length;
    const esitoDue = contesto.ORARI_5_cambioOrario();
    verifica('rieseguito con la stessa data da\' lo stesso calendario, senza doppioni',
      uguali(lezioniSul(calC, primoGiorno, ultimoGiorno), dopoUno) && senzaDoppioni(calC));
    verifica('togliendo e rifacendo le serie create la volta prima (' + createLaPrimaVolta + '), senza rifarne altre',
      numero(/tolte[^:]*: (\d+)/, esitoDue) === createLaPrimaVolta && numero(/rifatte fino al [^:]*: (\d+)/, esitoDue) === 0 &&
      rifatteC.every(s => !s.cancellata));
    verifica('il calendario dopo il cambio e\' quello atteso: prima l\'orario vecchio, poi il nuovo',
      uguali(lezioniSul(calC, primoGiorno, ultimoGiorno).filter(l => !/ Recupero$/.test(l)), attesoDopoCambio));
    // una copia fatta a mano di una lezione: ha la descrizione di Campanella ma
    // non il contrassegno. Il cambio non la tocca e la nomina; l'annullamento,
    // che il docente chiede per togliere tutto, la toglie (lo dicono i documenti)
    const copia = calC.createEventSeries('Copia a mano',
      new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() - 7, 18, 0), new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() - 7, 19, 0),
      CalendarApp.newRecurrence().addWeeklyRule().until(new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() + 21, 23, 59, 59)),
      { description: '[Campanella] Orario di ' + c.docente + ', copiata a mano' });
    // e una lezione singola copiata a mano dopo il cambio: la sola descrizione
    const copiaSingola = calC.createEvent('Recupero a mano',
      new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() + 2, 18, 0), new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() + 2, 19, 0));
    copiaSingola.descrizione = '[Campanella] Orario di ' + c.docente + ', copiata a mano';
    const esitoCopia = contesto.ORARI_5_cambioOrario();
    verifica('una serie con la descrizione di Campanella ma senza contrassegno (una copia a mano) il cambio non la ' +
      'tocca, e la nomina', !copia.cancellata && copia.eccezioni.size === 0 && copia.lezioni().length === 5 &&
      !vive(calC).some(s => String(s.getTag('campanella_sostituisce') || '').indexOf(copia.id + '|') === 0) &&
      /senza contrassegno/.test(esitoCopia) && esitoCopia.indexOf('Copia a mano') >= 0);
    verifica('  ...e nemmeno una lezione singola copiata a mano dopo il cambio: la lascia e la nomina (2 in tutto)',
      !copiaSingola.cancellato && esitoCopia.indexOf('Recupero a mano') >= 0 &&
      numero(/senza contrassegno[^(]*\((\d+)\)/, esitoCopia) === 2);
    contesto.ORARI_ANNULLA_calendario();
    verifica('ORARI_ANNULLA_calendario invece la toglie, come dicono i documenti', copia.cancellata && copiaSingola.cancellato);
    docOriginale.celle = celleOriginali.slice();
  }

  intestazione('CAMBIO D\'ORARIO: RIPRESA E CASI LIMITE');
  if (validoDal) {
    // interrotto dal tempo mentre rifa' e mentre crea: si arriva allo stesso calendario
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    // quante serie rifa' il taglio: i contrassegni del taglio sono due per serie
    const nRifatte = vive(calendari[0]).filter(s => chiave(s.inizio) < validoDal && chiave(s.ricorrenza.until) >= validoDal).length;
    docOriginale.celle = ruotata(celleOriginali);
    sogliaCalendario = 4;
    const aMeta = contesto.ORARI_5_cambioOrario();
    verifica('al tempo massimo si ferma mentre rifa\' le serie di prima, e programma la ripresa di ORARI_5_cambioOrario',
      /Tempo massimo/.test(aMeta) && /mentre rifacevo l'orario di prima/.test(aMeta) && !!salvato() &&
      salvato().funzione === 'ORARI_5_cambioOrario' && salvato().fase === 'taglio' && ripresaDi('ORARI_5_cambioOrario').length === 1);
    const giriC = riprendiFinoInFondo('ORARI_5_cambioOrario');
    sogliaCalendario = Infinity;
    verifica('riprendendo (' + giriC + ' volte) arriva allo stesso calendario del cambio fatto in una volta',
      giriC > 2 && !proprieta.has(PROGRESSO_CALENDARIO) && senzaDoppioni(calendari[0]) &&
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));

    // un limite di Google mentre rifa': quando crea la serie nuova, quando toglie la vecchia
    for (const [op, cosa] of [['createEventSeries', 'crea la prima serie nuova'], ['deleteEventSeries', 'toglie la seconda serie']]) {
      azzeraCalendario();
      contesto.ORARI_4_calendario();
      docOriginale.celle = ruotata(celleOriginali);
      guasti([{ op, alla: op === 'createEventSeries' ? 1 : 2, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
      const limiteTaglio = contesto.ORARI_5_cambioOrario();
      verifica('un limite di Google mentre ' + cosa + ' del taglio: si ferma e riprende fra un minuto',
        /fra un minuto/.test(limiteTaglio) && ripresaDi('ORARI_5_cambioOrario').length === 1 && salvato().fase === 'taglio');
      riprendiFinoInFondo('ORARI_5_cambioOrario');
      verifica('  ...e riprendendo arriva allo stesso calendario, senza doppioni',
        !proprieta.has(PROGRESSO_CALENDARIO) && senzaDoppioni(calendari[0]) &&
        uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));
    }

    // i contrassegni di una serie appena rifatta che Google non salva (il
    // primo, o quello "sostituisce"): l'id e' nel punto salvato, e alla
    // ripresa la serie li riceve invece di essere rifatta una seconda volta
    for (const alla of [1, 2]) {
      azzeraCalendario();
      contesto.ORARI_4_calendario();
      docOriginale.celle = ruotata(celleOriginali);
      guasti([{ op: 'setTag', alla, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
      const limiteAppena = contesto.ORARI_5_cambioOrario();
      const appena = salvato() && salvato().appenaCreato;
      const orfana = appena && calendari[0].serie.find(s => s.id === appena.id);
      verifica('il ' + (alla === 1 ? 'contrassegno' : 'contrassegno "sostituisce"') + ' della prima serie rifatta non ' +
        'riesce: si ferma, e il punto salvato ha il suo id',
        /fra un minuto/.test(limiteAppena) && !!orfana && !orfana.getTag('campanella_sostituisce') &&
        (alla === 1) === !orfana.getTag('campanella'));
      riprendiFinoInFondo('ORARI_5_cambioOrario');
      verifica('  ...alla ripresa la riceve, non la rifa\', e il cambio arriva allo stesso calendario',
        !!orfana && !orfana.cancellata && orfana.getTag('campanella') === 'orario' &&
        /\|/.test(String(orfana.getTag('campanella_sostituisce'))) && senzaDoppioni(calendari[0]) &&
        vive(calendari[0]).filter(s => s.getTag('campanella_sostituisce')).length === nRifatte &&
        !proprieta.has(PROGRESSO_CALENDARIO) && uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));
    }

    // il contrassegno di una serie nuova dell'orario nuovo che Google non
    // salva (dopo i due di ogni serie rifatta): alla ripresa lo riceve, e un
    // secondo cambio la rifa' o la toglie come le altre
    const tagSecondaNuova = 2 * nRifatte + 2;
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    docOriginale.celle = ruotata(celleOriginali);
    guasti([{ op: 'setTag', alla: tagSecondaNuova, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
    const limiteTag = contesto.ORARI_5_cambioOrario();
    const nuovaSenza = vive(calendari[0]).filter(s => s.getTag('campanella') !== 'orario');
    verifica('il contrassegno di una serie nuova del cambio non riesce: si ferma e riprende fra un minuto',
      /fra un minuto/.test(limiteTag) && nuovaSenza.length === 1 && salvato().daContrassegnare.length === 1);
    riprendiFinoInFondo('ORARI_5_cambioOrario');
    verifica('  ...alla ripresa la serie lo riceve, e il cambio arriva allo stesso calendario',
      nuovaSenza[0].getTag('campanella') === 'orario' && !proprieta.has(PROGRESSO_CALENDARIO) &&
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));
    const salvaTag = contesto.ORARI.calendario;
    const secondoCambio = chiave(giorniDopo(vd, 35));
    contesto.ORARI.calendario = Object.assign({}, salvaTag, { validoDal: secondoCambio });
    docOriginale.celle = celleOriginali.slice();
    const esitoSecondo = contesto.ORARI_5_cambioOrario();
    const attesoSecondo = attesoDopoCambio.filter(l => l.slice(0, 10) < secondoCambio)
      .concat(pianoAtteso(celleOriginali, dataDa(secondoCambio)).lezioni).sort();
    verifica('  ...e un secondo cambio d\'orario, dal ' + secondoCambio + ', la tratta come le altre: niente lezioni doppie',
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoSecondo) && !/senza contrassegno/.test(esitoSecondo));
    // la serie senza contrassegno e DatiOrari.gs cambiato prima della ripresa:
    // il cambio si rifa' da capo, e l'errore dice di cancellarla prima
    azzeraCalendario();
    contesto.ORARI.calendario = salvaTag;
    contesto.ORARI_4_calendario();
    docOriginale.celle = ruotata(celleOriginali);
    guasti([{ op: 'setTag', alla: tagSecondaNuova, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
    contesto.ORARI_5_cambioOrario();
    const daCancellare = vive(calendari[0]).filter(s => s.getTag('campanella') !== 'orario')[0];
    contesto.ORARI.calendario = Object.assign({}, salvaTag, { validoDal: secondoCambio });
    const cambiatoTag = errore(() => contesto.ORARI_5_cambioOrario({ triggerUid: 'ripresa' }));
    verifica('  ...con DatiOrari.gs cambiato prima della ripresa, l\'errore nomina la serie senza contrassegno e dice ' +
      'di cancellarla prima di rieseguire', /cambiato/.test(cambiatoTag) && !!daCancellare &&
      cambiatoTag.indexOf(daCancellare.titolo + ', ') >= 0 && /cancellala/.test(cambiatoTag) && !salvato());
    contesto.ORARI.calendario = salvaTag;
    docOriginale.celle = celleOriginali.slice();

    // ORARI_4_calendario con un cambio a meta'
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    docOriginale.celle = ruotata(celleOriginali);
    sogliaCalendario = 4;
    contesto.ORARI_5_cambioOrario();
    sogliaCalendario = Infinity;
    const quattroAMeta = errore(() => contesto.ORARI_4_calendario());
    verifica('ORARI_4_calendario a mano con un cambio a meta\' si ferma e dice di finire ORARI_5_cambioOrario',
      /ORARI_5_cambioOrario/.test(quattroAMeta) && /a meta'/.test(quattroAMeta));
    trigger.push({ fn: 'ORARI_4_calendario', ms: 60000 });
    const quattroRipresa = contesto.ORARI_4_calendario({ triggerUid: 'altra' });
    verifica('una ripresa di ORARI_4_calendario rimasta non tocca il lavoro di ORARI_5_cambioOrario',
      /Niente da riprendere/.test(quattroRipresa) && !!salvato() && salvato().funzione === 'ORARI_5_cambioOrario' &&
      ripresaDi('ORARI_4_calendario').length === 0 && ripresaDi('ORARI_5_cambioOrario').length === 1);
    riprendiFinoInFondo('ORARI_5_cambioOrario');
    verifica('  ...che poi finisce', !proprieta.has(PROGRESSO_CALENDARIO) &&
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));

    // la data del cambio che manca o e' sbagliata
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    const serieIntatte = vive(calendari[0]).length;
    const salvaCal = contesto.ORARI.calendario;
    const primaDelleDate = scritture;
    for (const [valore, attesa, come] of [['', /validoDal/, 'manca'], ['domani', /validoDal/, 'non e\' una data'],
                                          ['2099-01-01', /dopo la fine/, 'viene dopo la fine del periodo']]) {
      contesto.ORARI.calendario = Object.assign({}, salvaCal, { validoDal: valore });
      const e = errore(() => contesto.ORARI_5_cambioOrario());
      verifica('se la data del cambio ' + come + ' si ferma e lo spiega, senza toccare niente',
        attesa.test(e) && vive(calendari[0]).length === serieIntatte && scritture === primaDelleDate &&
        !proprieta.has(PROGRESSO_CALENDARIO));
    }
    // una data prima dell'inizio: il nuovo orario vale per tutto il periodo
    const primaInizio = chiave(giorniDopo(primoGiorno, -20));
    contesto.ORARI.calendario = Object.assign({}, salvaCal, { validoDal: primaInizio });
    docOriginale.celle = ruotata(celleOriginali);
    contesto.ORARI_5_cambioOrario();
    verifica('con la data del cambio prima dell\'inizio il nuovo orario vale dall\'inizio, e il vecchio sparisce',
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), pianoAtteso(ruotata(celleOriginali), primoGiorno).lezioni));
    contesto.ORARI.calendario = salvaCal;
    docOriginale.celle = celleOriginali.slice();

    // niente da rifare: il calendario c'e' ma e' vuoto (creato a mano, senza fuso: UTC)
    azzeraCalendario();
    CalendarApp.createCalendar(c.nome);
    const vuoto = contesto.ORARI_5_cambioOrario();
    verifica('se non trova niente da rifare o togliere lo dice (forse ORARI_4_calendario non era mai stato eseguito)',
      /ORARI_4_calendario non era mai stato eseguito/.test(vuoto));
    verifica('e mette lo stesso l\'orario dal ' + validoDal + ', dopo aver dato al calendario il fuso dello script (e lo dice)',
      calendari[0].getTimeZone() === FUSO_BANCO && /aveva il fuso orario UTC/.test(vuoto) &&
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), pianoAtteso(celleOriginali, vd).lezioni));
    // e il calendario che non c'e'
    azzeraCalendario();
    const senzaCal = errore(() => contesto.ORARI_5_cambioOrario());
    verifica('senza il calendario si ferma e dice di usare ORARI_4_calendario',
      /ORARI_4_calendario/.test(senzaCal) && calendari.length === 0);
  }

  intestazione('CAMBIO D\'ORARIO: DATA PRIMA DELL\'INIZIO, ANNO PRIMA NELLO STESSO CALENDARIO');
  if (validoDal) {
    // il nome di partenza, "Orario COGNOME", si ripete ogni anno: l'anno prima
    // sta nello stesso calendario. Una data del cambio scritta per sbaglio
    // prima dell'inizio non deve toccarlo
    azzeraCalendario();
    const salvaP = contesto.ORARI.calendario;
    const inizioPrima = dataDa('2025-09-15'), finePrima = dataDa('2026-06-10');
    contesto.ORARI.calendario = Object.assign({}, salvaP, { inizio: '2025-09-15', fine: '2026-06-10', sospensioni: [], validoDal: '' });
    contesto.ORARI_4_calendario();
    const calP = calendari[0];
    const annoPrima = lezioniSul(calP, inizioPrima, finePrima);
    const serieAnnoPrima = vive(calP).slice();
    contesto.ORARI.calendario = Object.assign({}, salvaP, { validoDal: '2025-10-05' });
    contesto.ORARI_4_calendario();
    const antP = contesto.ORARI_1_anteprima();
    verifica('l\'anteprima dice che il nuovo orario vale da tutto il periodo, non che le settimane prima restano',
      /da tutto il periodo/.test(antP) && !/le settimane prima restano/.test(antP));
    docOriginale.celle = ruotata(celleOriginali);
    const esitoP = contesto.ORARI_5_cambioOrario();
    console.log(esitoP);
    verifica('le serie dell\'anno prima restano intatte (' + serieAnnoPrima.length + ' serie, ' + annoPrima.length + ' lezioni)',
      annoPrima.length > 0 && uguali(lezioniSul(calP, inizioPrima, finePrima), annoPrima) &&
      serieAnnoPrima.every(s => !s.cancellata && s.eccezioni.size === 0) &&
      !vive(calP).some(s => serieAnnoPrima.some(v => String(s.getTag('campanella_sostituisce') || '').indexOf(v.id + '|') === 0)));
    verifica('e quest\'anno c\'e\' l\'orario nuovo da tutto il periodo',
      uguali(lezioniSul(calP, primoGiorno, ultimoGiorno), pianoAtteso(ruotata(celleOriginali), primoGiorno).lezioni));
    verifica('il messaggio dice che la data viene prima dell\'inizio e che il cambio vale da tutto il periodo',
      /prima dell'inizio/.test(esitoP) && /da tutto il periodo/.test(esitoP) && esitoP.indexOf('dal ' + c.inizio) >= 0);
    // il "Dal" del periodo spostato alla data del cambio: le serie messe prima
    // cominciano prima dell'inizio nuovo, e vanno rifatte lo stesso
    azzeraCalendario();
    contesto.ORARI.calendario = salvaP;
    contesto.ORARI_4_calendario();
    contesto.ORARI.calendario = Object.assign({}, salvaP, { inizio: validoDal });
    docOriginale.celle = ruotata(celleOriginali);
    contesto.ORARI_5_cambioOrario();
    verifica('con il "Dal" spostato alla data del cambio le serie di prima si rifanno lo stesso, senza doppioni',
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));
    contesto.ORARI.calendario = salvaP;
    docOriginale.celle = celleOriginali.slice();
  }

  intestazione('CAMBIO D\'ORARIO: LEZIONI SPOSTATE O CANCELLATE A MANO');
  if (validoDal) {
    // Google non lascia accorciare una serie: il cambio la rifa' fino al giorno
    // prima. Le lezioni spostate o cancellate a mano prima del cambio restano
    // come si vedono: la serie nuova salta le settimane senza la lezione
    // regolare, e ogni lezione spostata torna come evento singolo
    const settimanaPrima = giorniDopo(primoGiorno, -7);
    /** L'orario messo, con tre serie cambiate a mano: la prima lezione spostata, la seconda cancellata, la prima cancellata. */
    function conModificheAMano() {
      azzeraCalendario();
      contesto.ORARI_4_calendario();
      const calX = calendari[0];
      const scelte = vive(calX).filter(s => chiave(s.inizio) < validoDal && chiave(s.ricorrenza.until) >= validoDal &&
        s.inizi(giornoPrima).length >= 3);
      if (scelte.length < 3) return null;
      const [spostata, conBuco, senzaPrima] = scelte;
      const p0 = spostata.inizio;
      spostata.sposta(0, new Date(p0.getFullYear(), p0.getMonth(), p0.getDate() + 2, 15, 0),
                         new Date(p0.getFullYear(), p0.getMonth(), p0.getDate() + 2, 16, 0));
      conBuco.cancella(1);
      senzaPrima.cancella(0);
      return { cal: calX, spostata, conBuco, senzaPrima, prima: lezioniSul(calX, settimanaPrima, giornoPrima) };
    }
    /** Il calendario intero, per confrontarne due: le lezioni, le serie e gli eventi singoli che ci sono. */
    const fotografia = calX => lezioniSul(calX, settimanaPrima, ultimoGiorno).join('\n') + '\n' + vive(calX).length +
      ' serie, ' + calX.eventi.filter(e => !e.cancellato).length + ' eventi singoli';
    const sostituisce = s => String(s.getTag('campanella_sostituisce') || '');
    const m = conModificheAMano();
    verifica('ci sono almeno tre serie da rifare con tre lezioni prima del cambio', !!m);
    if (m) {
      docOriginale.celle = ruotata(celleOriginali);
      occorrenzeTolte.length = 0;
      const esitoM = contesto.ORARI_5_cambioOrario();
      console.log(esitoM);
      const calM = m.cal;
      const segnoDi = v => v.id + '|' + chiave(giornoPrima);
      verifica('le lezioni prima del cambio restano come erano, con quella spostata e quelle cancellate a mano (' +
        m.prima.length + ')', uguali(lezioniSul(calM, settimanaPrima, giornoPrima), m.prima));
      verifica('nessuna lezione dell\'orario di prima dal ' + validoDal + ' in poi: dal cambio c\'e\' l\'orario nuovo',
        uguali(lezioniSul(calM, vd, ultimoGiorno), nuovoPiano.lezioni));
      verifica('le tre serie vecchie sono tolte', [m.spostata, m.conBuco, m.senzaPrima].every(s => s.cancellata));
      const singoli = calM.eventi.filter(e => !e.cancellato && sostituisce(e));
      const t0 = m.spostata.inizio;
      verifica('la lezione spostata a mano e\' tornata come evento singolo, alla sua ora, con il suo titolo, la sua ' +
        'descrizione e i due contrassegni (' + singoli.length + ')',
        singoli.length === 1 && singoli[0].titolo === m.spostata.titolo &&
        singoli[0].getDescription() === m.spostata.getDescription() && singoli[0].getTag('campanella') === 'orario' &&
        sostituisce(singoli[0]) === segnoDi(m.spostata) &&
        singoli[0].inizio.getTime() === new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + 2, 15, 0).getTime());
      const nuovaBuco = vive(calM).find(s => sostituisce(s) === segnoDi(m.conBuco));
      verifica('dalla serie rifatta al posto di quella con la lezione cancellata e\' tolta solo quella settimana, e la ' +
        'serie resta', !!nuovaBuco && occorrenzeTolte.length === 1 && occorrenzeTolte[0].serie === nuovaBuco &&
        occorrenzeTolte[0].inizio.getTime() === settimaneDopo(m.conBuco.inizio, 1).getTime() && !nuovaBuco.cancellata);
      verifica('le serie rifatte al posto di quella con la prima lezione spostata e di quella con la prima cancellata ' +
        'cominciano dalla prima lezione regolare, la seconda settimana',
        [m.spostata, m.senzaPrima].every(v => vive(calM).some(s => sostituisce(s) === segnoDi(v) &&
          s.inizio.getTime() === settimaneDopo(v.inizio, 1).getTime())));
      verifica('il messaggio dice la lezione spostata rimessa come evento singolo, e non che le modifiche a mano ' +
        'potrebbero non restare', numero(/rimesse come eventi singoli alla loro ora: (\d+)/, esitoM) === 1 &&
        esitoM.indexOf(m.spostata.titolo + ', ') >= 0 && / 15:00/.test(esitoM) && !/potrebbero non restare/.test(esitoM));
      const riferimento = fotografia(calM);
      const esitoRifatto = contesto.ORARI_5_cambioOrario();
      verifica('rieseguito, lo stesso calendario: niente rifatto due volte',
        fotografia(calM) === riferimento && numero(/rifatte fino al [^:]*: (\d+)/, esitoRifatto) === 0 &&
        !/rimesse come eventi singoli/.test(esitoRifatto));

      // interrotto in ogni punto (il tempo massimo dopo 1, 2, 3... modifiche) e ripreso: lo stesso calendario
      const diversi = [];
      for (let soglia = 1; soglia <= 8; soglia++) {
        const mx = conModificheAMano();
        docOriginale.celle = ruotata(celleOriginali);
        sogliaCalendario = soglia;
        scrittureDallUltimoSalto = 0;
        contesto.ORARI_5_cambioOrario();
        riprendiFinoInFondo('ORARI_5_cambioOrario');
        sogliaCalendario = Infinity;
        if (proprieta.has(PROGRESSO_CALENDARIO) || fotografia(mx.cal) !== riferimento) diversi.push(soglia);
      }
      verifica('interrotto dal tempo massimo dopo 1, 2, ... 8 modifiche e ripreso, arriva sempre allo stesso calendario' +
        (diversi.length ? ' (diverso con: ' + diversi.join(', ') + ')' : ''), diversi.length === 0);
      // e fermato da un limite di Google a ogni operazione, una per volta
      const LIMITE = 'Service invoked too many times in a short time: calendar.';
      const diversiL = [];
      for (const op of ['createEventSeries', 'setTag', 'deleteEvent', 'createEvent', 'deleteEventSeries', 'setColor']) {
        for (let alla = 1; alla <= 6; alla++) {
          const mx = conModificheAMano();
          docOriginale.celle = ruotata(celleOriginali);
          guasti([{ op, alla, messaggio: LIMITE }]);
          contesto.ORARI_5_cambioOrario();
          riprendiFinoInFondo('ORARI_5_cambioOrario');
          guasti([]);
          if (proprieta.has(PROGRESSO_CALENDARIO) || fotografia(mx.cal) !== riferimento) diversiL.push(op + ' ' + alla);
        }
      }
      verifica('fermato da un limite di Google a ogni operazione (le prime sei di ognuna) e ripreso, lo stesso calendario' +
        (diversiL.length ? ' (diverso con: ' + diversiL.join(', ') + ')' : ''), diversiL.length === 0);

      // DatiOrari.gs cambiato a meta' del cambio, con un'altra data (una
      // settimana dopo o prima), fermato dopo la prima serie nuova (la vecchia
      // c'e' ancora): il cambio rifatto da capo toglie i pezzi rifatti per la
      // data di prima e arriva al calendario della data nuova
      const salvaX = contesto.ORARI.calendario;
      const singoliDoppi = calX => {
        const k = calX.eventi.filter(e => !e.cancellato).map(e => e.titolo + '|' + e.inizio.getTime());
        return k.length - new Set(k).size;
      };
      for (const giorni of [7, -7]) {
        const altra = chiave(giorniDopo(vd, giorni)), primaAltra = giorniDopo(vd, giorni - 1);
        const mx = conModificheAMano();
        const attesoAltra = lezioniSul(mx.cal, settimanaPrima, primaAltra)
          .concat(pianoAtteso(ruotata(celleOriginali), dataDa(altra)).lezioni).sort();
        docOriginale.celle = ruotata(celleOriginali);
        sogliaCalendario = 1;
        scrittureDallUltimoSalto = 0;
        contesto.ORARI_5_cambioOrario();
        sogliaCalendario = Infinity;
        const pezzi = mx.cal.serie.filter(s => !s.cancellata && sostituisce(s));
        const conLaVecchia = pezzi.length === 1 && vive(mx.cal).some(v => sostituisce(pezzi[0]).indexOf(v.id + '|') === 0);
        contesto.ORARI.calendario = Object.assign({}, salvaX, { validoDal: altra });
        const errAltra = errore(() => contesto.ORARI_5_cambioOrario({ triggerUid: 'ripresa' }));
        contesto.ORARI_5_cambioOrario();
        const restati = mx.cal.serie.filter(s => !s.cancellata && sostituisce(s).split('|')[1] === chiave(giornoPrima));
        const vistoAltra = lezioniSul(mx.cal, settimanaPrima, ultimoGiorno);
        verifica('DatiOrari.gs cambiato a meta\', dopo la prima serie rifatta, con la data ' +
          (giorni > 0 ? 'una settimana dopo' : 'una settimana prima') + ': rifatto da capo, il pezzo per la data di ' +
          'prima e\' tolto e il calendario e\' quello del cambio dal ' + altra +
          (uguali(vistoAltra, attesoAltra) ? '' : ' (mancano: ' + attesoAltra.filter(x => vistoAltra.indexOf(x) < 0).join(', ') +
            '; in piu\': ' + vistoAltra.filter(x => attesoAltra.indexOf(x) < 0).join(', ') + ')') +
          (restati.length ? ' (pezzi per la data di prima rimasti: ' + restati.length + ')' : ''),
          conLaVecchia && /cambiato/.test(errAltra) && !/viene dopo quella di prima/.test(errAltra) &&
          !proprieta.has(PROGRESSO_CALENDARIO) && restati.length === 0 && pezzi[0].cancellata &&
          uguali(vistoAltra, attesoAltra) && senzaDoppioni(mx.cal) && singoliDoppi(mx.cal) === 0);
        contesto.ORARI.calendario = salvaX;
      }
      // con qualche serie vecchia gia' rifatta e tolta, una data nuova dopo
      // quella di prima non puo' rimettere le lezioni di prima fra le due date:
      // l'errore lo dice, con il rimedio, e il calendario resta senza doppioni
      {
        const altra = chiave(giorniDopo(vd, 7));
        const mx = conModificheAMano();
        const primaDellaPrima = lezioniSul(mx.cal, settimanaPrima, giornoPrima);
        docOriginale.celle = ruotata(celleOriginali);
        sogliaCalendario = 3;
        scrittureDallUltimoSalto = 0;
        contesto.ORARI_5_cambioOrario();
        sogliaCalendario = Infinity;
        const giaFatte = salvato() ? salvato().rifatte + salvato().tolte : 0;
        contesto.ORARI.calendario = Object.assign({}, salvaX, { validoDal: altra });
        const errDopo = errore(() => contesto.ORARI_5_cambioOrario({ triggerUid: 'ripresa' }));
        contesto.ORARI_5_cambioOrario();
        verifica('con ' + giaFatte + ' serie gia\' rifatte o tolte e la data nuova una settimana dopo, l\'errore dice che fra ' +
          'le due date le lezioni di prima non tornano, e come riaverle; poi il cambio non lascia doppioni',
          giaFatte > 0 && /viene dopo quella di prima/.test(errDopo) && /ORARI_ANNULLA_calendario/.test(errDopo) &&
          senzaDoppioni(mx.cal) && singoliDoppi(mx.cal) === 0 && !proprieta.has(PROGRESSO_CALENDARIO) &&
          uguali(lezioniSul(mx.cal, settimanaPrima, giornoPrima), primaDellaPrima) &&
          uguali(lezioniSul(mx.cal, dataDa(altra), ultimoGiorno), pianoAtteso(ruotata(celleOriginali), dataDa(altra)).lezioni));
        contesto.ORARI.calendario = salvaX;
      }
      // ...e fermato appena creata una serie, prima dei contrassegni: prima di
      // dimenticare il lavoro glieli rimette, e il cambio rifatto la ritrova
      {
        const mx = conModificheAMano();
        const dopoUnaSettimana = giorniDopo(vd, 7);
        const attesoX = lezioniSul(mx.cal, settimanaPrima, giorniDopo(vd, 6))
          .concat(pianoAtteso(ruotata(celleOriginali), dopoUnaSettimana).lezioni).sort();
        docOriginale.celle = ruotata(celleOriginali);
        guasti([{ op: 'setTag', alla: 1, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
        contesto.ORARI_5_cambioOrario();
        guasti([]);
        const appena = salvato() && salvato().appenaCreato;
        const orfana = appena && mx.cal.serie.find(s => s.id === appena.id);
        const orfanaSenza = !!orfana && !orfana.getTag('campanella');
        contesto.ORARI.calendario = Object.assign({}, salvaX, { validoDal: chiave(dopoUnaSettimana) });
        const errAppena = errore(() => contesto.ORARI_5_cambioOrario({ triggerUid: 'ripresa' }));
        const presa = !!orfana && orfana.getTag('campanella') === 'orario' && /\|/.test(sostituisce(orfana));
        contesto.ORARI_5_cambioOrario();
        verifica('fermato appena creata una serie, prima dei contrassegni, e DatiOrari.gs cambiato: prima di dimenticare ' +
          'il lavoro le rimette i contrassegni, e il cambio rifatto la toglie come le altre (niente lezioni doppie)',
          orfanaSenza && presa && /cambiato/.test(errAppena) && !/compare due volte/.test(errAppena) && orfana.cancellata &&
          senzaDoppioni(mx.cal) && uguali(lezioniSul(mx.cal, settimanaPrima, ultimoGiorno), attesoX));
        contesto.ORARI.calendario = salvaX;
      }

      // una lezione rinominata a mano, alla sua ora: resta com'e', come evento
      // singolo, e la serie rifatta ha il titolo della serie
      {
        azzeraCalendario();
        contesto.ORARI_4_calendario();
        const calR = calendari[0];
        const sR = vive(calR).find(x => chiave(x.inizio) < validoDal && chiave(x.ricorrenza.until) >= validoDal &&
          x.inizi(giornoPrima).length >= 2);
        sR.rinomina(1, sR.titolo + ' verifica');
        const primaR = lezioniSul(calR, settimanaPrima, giornoPrima);
        docOriginale.celle = ruotata(celleOriginali);
        const esitoR = contesto.ORARI_5_cambioOrario();
        const nuovaR = vive(calR).find(x => sostituisce(x).indexOf(sR.id + '|') === 0);
        verifica('una lezione rinominata a mano ("' + sR.titolo + ' verifica") resta com\'e\', come evento singolo, e ' +
          'la serie rifatta ha il titolo della serie', uguali(lezioniSul(calR, settimanaPrima, giornoPrima), primaR) &&
          primaR.some(l => / verifica$/.test(l)) && !!nuovaR && nuovaR.titolo === sR.titolo &&
          calR.eventi.some(e => !e.cancellato && e.titolo === sR.titolo + ' verifica' && sostituisce(e)) &&
          numero(/rimesse come eventi singoli alla loro ora: (\d+)/, esitoR) === 1);
        docOriginale.celle = celleOriginali.slice();
      }

      // una lezione con una nota scritta a mano solo per lei ("Solo questo
      // evento": la descrizione), e in un'altra serie, con un luogo messo a
      // tutta la serie, una lezione con un luogo suo: restano com'erano, come
      // eventi singoli, e la serie rifatta ha la descrizione e il luogo della
      // serie. Il cambio si usa anche solo per aggiungere un giorno senza lezione
      {
        azzeraCalendario();
        contesto.ORARI_4_calendario();
        const calN = calendari[0];
        const [sN, sL] = vive(calN).filter(x => chiave(x.inizio) < validoDal && chiave(x.ricorrenza.until) >= validoDal &&
          x.inizi(giornoPrima).length >= 3);
        sN.annota(1, { descrizione: sN.descrizione + '\nVERIFICA: capitoli 3 e 4' });
        sL.luogo = 'Aula 12';
        sL.annota(2, { luogo: 'Laboratorio di chimica' });
        /** Le lezioni di Campanella prima del cambio, con descrizione e luogo. */
        const conNote = calX => calX.getEvents(settimanaPrima, new Date(giornoPrima.getFullYear(), giornoPrima.getMonth(),
          giornoPrima.getDate(), 23, 59, 59)).filter(nostro)
          .map(e => chiave(e.getStartTime()) + ' ' + ora(minutiDi(e.getStartTime())) + ' ' + e.getTitle() + ' | ' +
                    e.getDescription() + ' | ' + e.getLocation()).sort();
        const primaN = conNote(calN);
        docOriginale.celle = ruotata(celleOriginali);
        const esitoN = contesto.ORARI_5_cambioOrario();
        const dopoN = conNote(calN);
        const nuovaL = vive(calN).find(x => sostituisce(x).indexOf(sL.id + '|') === 0);
        const nuovaN = vive(calN).find(x => sostituisce(x).indexOf(sN.id + '|') === 0);
        verifica('una lezione con una nota scritta a mano solo per lei, e una con un luogo suo, restano com\'erano ' +
          '(descrizione e luogo di ogni lezione prima del cambio, ' + primaN.length + ')' + (uguali(dopoN, primaN) ? '' :
          ' (sparite: ' + primaN.filter(x => dopoN.indexOf(x) < 0).join(' ;; ') + ')'),
          primaN.some(l => /VERIFICA/.test(l)) && primaN.some(l => /Laboratorio di chimica$/.test(l)) && uguali(dopoN, primaN));
        verifica('  ...come eventi singoli, e le serie rifatte hanno la descrizione e il luogo della serie',
          !!nuovaN && !!nuovaL && nuovaN.getDescription() === sN.descrizione && nuovaL.getLocation() === 'Aula 12' &&
          calN.eventi.filter(e => !e.cancellato && sostituisce(e)).length === 2 &&
          numero(/rimesse come eventi singoli alla loro ora: (\d+)/, esitoN) === 2 && /annotate/.test(esitoN));
        docOriginale.celle = celleOriginali.slice();
      }
      // se Google desse la descrizione di ogni lezione scritta in un altro modo
      // da quella della serie (nessuno l'ha provato dal vivo), le lezioni
      // restano regolari: conta la descrizione piu' frequente fra le lezioni
      {
        azzeraCalendario();
        contesto.ORARI_4_calendario();
        const calF = calendari[0];
        const sF = vive(calF).find(x => chiave(x.inizio) < validoDal && chiave(x.ricorrenza.until) >= validoDal &&
          x.inizi(giornoPrima).length >= 3);
        sF.inizi(ultimoGiorno).forEach((t, n) => sF.annota(n, { descrizione: '<p>' + sF.descrizione + '</p>' }));
        docOriginale.celle = ruotata(celleOriginali);
        const esitoF = contesto.ORARI_5_cambioOrario();
        const nuovaF = vive(calF).find(x => sostituisce(x).indexOf(sF.id + '|') === 0);
        verifica('con la descrizione di ogni lezione scritta in un altro modo da quella della serie, la serie si rifa\' ' +
          'lo stesso, senza eventi singoli', !!nuovaF && nuovaF.lezioni(giornoPrima).length === sF.inizi(giornoPrima).length &&
          calF.eventi.filter(e => !e.cancellato && sostituisce(e)).length === 0 && !/rimesse come eventi singoli/.test(esitoF));
        docOriginale.celle = celleOriginali.slice();
      }
      // un pezzo appena rifatto a cui Google non salva il contrassegno, con una
      // descrizione riscritta a mano che non comincia con [Campanella]: la serie
      // rifatta di una serie con la descrizione cambiata per tutta la serie, o
      // una lezione con una descrizione solo sua, rimessa come evento singolo.
      // La ripresa lo ritrova per id e gli rimette i contrassegni: niente
      // lezioni doppie, e ORARI_ANNULLA_calendario lo toglie
      for (const [cosa, su] of [['della serie rifatta', x => x instanceof Serie],
                                ['della lezione rimessa come evento singolo', x => x instanceof Evento]]) {
        azzeraCalendario();
        contesto.ORARI_4_calendario();
        const calP = calendari[0];
        const [sP, sQ] = vive(calP).filter(x => chiave(x.inizio) < validoDal && chiave(x.ricorrenza.until) >= validoDal &&
          x.inizi(giornoPrima).length >= 3);
        sP.descrizione = 'Aula 12, LIM. Portare il registro.';
        sQ.annota(1, { descrizione: 'Compito in classe' });
        /** Tutti gli eventi prima del cambio, anche quelli che non sembrano di Campanella. */
        const tutti = calX => calX.getEvents(settimanaPrima, new Date(giornoPrima.getFullYear(), giornoPrima.getMonth(),
          giornoPrima.getDate(), 23, 59, 59)).map(e => chiave(e.getStartTime()) + ' ' + ora(minutiDi(e.getStartTime())) + ' ' +
          e.getTitle() + ' | ' + e.getDescription()).sort();
        const primaP = tutti(calP);
        docOriginale.celle = ruotata(celleOriginali);
        guasti([{ op: 'setTag', alla: 1, su, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
        contesto.ORARI_5_cambioOrario();
        const appenaP = salvato() && salvato().appenaCreato;
        guasti([]);
        const giriP = riprendiFinoInFondo('ORARI_5_cambioOrario');
        const dopoP = tutti(calP);
        const pezzo = appenaP && (calP.serie.find(x => x.id === appenaP.id) || calP.eventi.find(x => x.id === appenaP.id));
        verifica('il contrassegno ' + cosa + ', con una descrizione riscritta a mano, non riesce: alla ripresa (' + giriP +
          ') lo ritrovo per id e glielo rimetto, senza lezioni doppie (' + primaP.length + ')' + (uguali(dopoP, primaP) ? '' :
          ' (doppie: ' + dopoP.filter((x, i, tt) => tt.indexOf(x) !== i).join(' ;; ') + ')'),
          !!pezzo && !(pezzo.cancellata || pezzo.cancellato) && pezzo.getTag('campanella') === 'orario' &&
          /\|/.test(sostituisce(pezzo)) && su(pezzo) && !proprieta.has(PROGRESSO_CALENDARIO) && uguali(dopoP, primaP));
        contesto.ORARI_ANNULLA_calendario();
        verifica('  ...e ORARI_ANNULLA_calendario lo toglie: nel periodo non resta niente',
          calP.getEvents(settimanaPrima, ultimoGiorno).length === 0);
        docOriginale.celle = celleOriginali.slice();
      }
      // ...e se prima della ripresa il docente ne ha spostato la prima lezione, a
      // quell'ora non lo ritrovo: il taglio lo rifa', e il messaggio finale lo
      // dice, con la data, e dice di cancellare la lezione se compare due volte
      {
        azzeraCalendario();
        contesto.ORARI_4_calendario();
        docOriginale.celle = ruotata(celleOriginali);
        guasti([{ op: 'setTag', alla: 1, su: x => x instanceof Serie,
                  messaggio: 'Service invoked too many times in a short time: calendar.' }]);
        contesto.ORARI_5_cambioOrario();
        guasti([]);
        const appenaS = salvato() && salvato().appenaCreato;
        const orfanaS = appenaS && calendari[0].serie.find(x => x.id === appenaS.id);
        const t0 = orfanaS ? orfanaS.inizio : new Date(0);
        if (orfanaS) orfanaS.sposta(0, new Date(t0.getFullYear(), t0.getMonth(), t0.getDate(), 18, 0),
                                       new Date(t0.getFullYear(), t0.getMonth(), t0.getDate(), 19, 0));
        const fineS = contesto.ORARI_5_cambioOrario({ triggerUid: 'ripresa' });
        verifica('il pezzo appena rifatto, senza contrassegni, con la prima lezione spostata a mano prima della ripresa: ' +
          'il messaggio finale dice che non l\'ho ritrovato, con la data, e di cancellare la lezione doppia',
          !!orfanaS && /non l'ho ritrovata/.test(fineS) && fineS.indexOf(chiave(t0) + ' ' + ora(minutiDi(t0))) >= 0 &&
          /cancellane una tu/.test(fineS) && !proprieta.has(PROGRESSO_CALENDARIO));
        docOriginale.celle = celleOriginali.slice();
      }
      // lo stesso pezzo appena rifatto senza contrassegni, con la descrizione
      // riscritta a mano, ma invece della ripresa il docente esegue
      // ORARI_ANNULLA_calendario: prima di dimenticare il lavoro gli rimette i
      // contrassegni (lo ritrova per id), e cosi' lo toglie con il resto
      const fineUltimo = new Date(ultimoGiorno.getFullYear(), ultimoGiorno.getMonth(), ultimoGiorno.getDate(), 23, 59, 59);
      for (const [cosa, su] of [['la serie rifatta', x => x instanceof Serie],
                                ['la lezione rimessa come evento singolo', x => x instanceof Evento]]) {
        azzeraCalendario();
        contesto.ORARI_4_calendario();
        const calO = calendari[0];
        const [sO, sR] = vive(calO).filter(x => chiave(x.inizio) < validoDal && chiave(x.ricorrenza.until) >= validoDal &&
          x.inizi(giornoPrima).length >= 3);
        sO.descrizione = 'Portare il libro di laboratorio';
        sR.annota(1, { descrizione: 'Compito in classe' });
        docOriginale.celle = ruotata(celleOriginali);
        guasti([{ op: 'setTag', alla: 1, su, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
        contesto.ORARI_5_cambioOrario();
        const appenaO = salvato() && salvato().appenaCreato;
        guasti([]);
        const pezzoO = appenaO && (calO.serie.find(x => x.id === appenaO.id) || calO.eventi.find(x => x.id === appenaO.id));
        const annullaO = contesto.ORARI_ANNULLA_calendario();
        verifica('il cambio si ferma appena dopo aver rifatto ' + cosa + ', senza contrassegni e con la descrizione ' +
          'riscritta a mano; ORARI_ANNULLA_calendario la ritrova per id e la toglie con il resto: nel periodo non resta niente',
          !!pezzoO && su(pezzoO) && !!(pezzoO.cancellata || pezzoO.cancellato) && /Tolti \d+ eventi/.test(annullaO) &&
          !/cancellala tu/.test(annullaO) && calO.getEvents(settimanaPrima, fineUltimo).length === 0 &&
          !proprieta.has(PROGRESSO_CALENDARIO));
        docOriginale.celle = celleOriginali.slice();
        contesto.ORARI_4_calendario();
        verifica('  ...e ORARI_4_calendario rimette l\'orario una volta sola, senza lezioni doppie',
          uguali(lezioniSul(calO, primoGiorno, ultimoGiorno), piano.lezioni) &&
          calO.getEvents(settimanaPrima, fineUltimo).length === piano.lezioni.length);
      }
      // ...e se prima di ORARI_ANNULLA_calendario il docente ne ha spostato la
      // prima lezione, a quell'ora non lo ritrova: il messaggio lo dice, con la
      // data, e dice di cancellarlo a mano
      {
        azzeraCalendario();
        contesto.ORARI_4_calendario();
        const calQ = calendari[0];
        const sQ = vive(calQ).find(x => chiave(x.inizio) < validoDal && chiave(x.ricorrenza.until) >= validoDal &&
          x.inizi(giornoPrima).length >= 3);
        sQ.descrizione = 'Portare il libro di laboratorio';
        docOriginale.celle = ruotata(celleOriginali);
        guasti([{ op: 'setTag', alla: 1, su: x => x instanceof Serie && x !== sQ && x.descrizione === sQ.descrizione,
                  messaggio: 'Service invoked too many times in a short time: calendar.' }]);
        contesto.ORARI_5_cambioOrario();
        guasti([]);
        const appenaQ = salvato() && salvato().appenaCreato;
        const orfanaQ = appenaQ && calQ.serie.find(x => x.id === appenaQ.id);
        const tQ = orfanaQ ? orfanaQ.inizio : new Date(0);
        if (orfanaQ) orfanaQ.sposta(0, new Date(tQ.getFullYear(), tQ.getMonth(), tQ.getDate(), 18, 0),
                                       new Date(tQ.getFullYear(), tQ.getMonth(), tQ.getDate(), 19, 0));
        const annullaQ = contesto.ORARI_ANNULLA_calendario();
        verifica('il pezzo appena rifatto con la prima lezione spostata a mano prima di ORARI_ANNULLA_calendario: il ' +
          'messaggio dice che non l\'ho ritrovato, con la data, e di cancellarlo tu',
          !!orfanaQ && !orfanaQ.cancellata && /non l'ho ritrovata/.test(annullaQ) &&
          annullaQ.indexOf(chiave(tQ)) >= 0 && /cancellala tu/.test(annullaQ) && !proprieta.has(PROGRESSO_CALENDARIO));
        docOriginale.celle = celleOriginali.slice();
      }
      // ...e se Google rifiuta ancora il contrassegno mentre ORARI_ANNULLA_calendario
      // glielo rimette: toglie il resto, e il messaggio dice che Google non
      // l'ha lasciato fare, con la data, e di cancellarlo tu
      {
        azzeraCalendario();
        contesto.ORARI_4_calendario();
        const calR = calendari[0];
        const sR = vive(calR).find(x => chiave(x.inizio) < validoDal && chiave(x.ricorrenza.until) >= validoDal &&
          x.inizi(giornoPrima).length >= 3);
        sR.descrizione = 'Portare il libro di laboratorio';
        docOriginale.celle = ruotata(celleOriginali);
        const rifiuto = { op: 'setTag', alla: 1, su: x => x instanceof Serie && x !== sR && x.descrizione === sR.descrizione,
                          messaggio: 'Service invoked too many times in a short time: calendar.' };
        guasti([rifiuto]);
        contesto.ORARI_5_cambioOrario();
        const appenaR = salvato() && salvato().appenaCreato;
        const orfanaR = appenaR && calR.serie.find(x => x.id === appenaR.id);
        guasti([rifiuto]);
        const annullaR = contesto.ORARI_ANNULLA_calendario();
        guasti([]);
        verifica('Google rifiuta il contrassegno anche mentre ORARI_ANNULLA_calendario lo rimette al pezzo: tolto il ' +
          'resto, il messaggio dice che Google non l\'ha lasciato fare, con la data, e di cancellarlo tu',
          !!orfanaR && !orfanaR.cancellata && /Tolti \d+ eventi/.test(annullaR) && /Google non mi ha lasciato/.test(annullaR) &&
          annullaR.indexOf(chiave(orfanaR.inizio)) >= 0 && /cancellala tu/.test(annullaR) &&
          vive(calR).length === 1 && !proprieta.has(PROGRESSO_CALENDARIO));
        docOriginale.celle = celleOriginali.slice();
      }

      // ORARI_ANNULLA_calendario toglie anche gli eventi singoli rimessi dal cambio
      const mA = conModificheAMano();
      docOriginale.celle = ruotata(celleOriginali);
      contesto.ORARI_5_cambioOrario();
      const singoliA = mA.cal.eventi.filter(e => !e.cancellato && sostituisce(e));
      contesto.ORARI_ANNULLA_calendario();
      verifica('ORARI_ANNULLA_calendario toglie tutto, anche le lezioni spostate rimesse come eventi singoli (' +
        singoliA.length + ')', singoliA.length === 1 && singoliA.every(e => e.cancellato) &&
        lezioniSul(mA.cal, settimanaPrima, ultimoGiorno).length === 0 && vive(mA.cal).length === 0);
      docOriginale.celle = celleOriginali.slice();
    }

    // la prima lezione spostata di quattro giorni, anticipata alla settimana
    // prima (anche prima dell'inizio del periodo) o rimandata oltre la lezione
    // della settimana dopo: la lezione spostata non sparisce e non ce n'e' una in piu'
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    const calS = calendari[0];
    const altreDaRifare = vive(calS).filter(s => chiave(s.inizio) < validoDal &&
      chiave(s.ricorrenza.until) >= validoDal && s.inizi(giornoPrima).length >= 3);
    if (altreDaRifare.length >= 3) {
      const [diQuattro, anticipata, rimandata] = altreDaRifare;
      const sposta = (s, giorni) => {
        const t = s.inizio;
        s.sposta(0, new Date(t.getFullYear(), t.getMonth(), t.getDate() + giorni, 15, 0),
                    new Date(t.getFullYear(), t.getMonth(), t.getDate() + giorni, 16, 0));
      };
      sposta(diQuattro, 4);
      sposta(anticipata, -5);
      sposta(rimandata, 8);
      const primaS = lezioniSul(calS, settimanaPrima, giornoPrima);
      docOriginale.celle = ruotata(celleOriginali);
      const esitoS = contesto.ORARI_5_cambioOrario();
      const dopoS = lezioniSul(calS, settimanaPrima, giornoPrima);
      verifica('con la prima lezione spostata di quattro giorni, anticipata alla settimana prima o rimandata oltre ' +
        'quella dopo, le lezioni prima del cambio restano come erano (' + primaS.length + ')' +
        (uguali(dopoS, primaS) ? '' : ' (sparite: ' + primaS.filter(x => dopoS.indexOf(x) < 0).join(', ') +
          '; comparse: ' + dopoS.filter(x => primaS.indexOf(x) < 0).join(', ') + ')'), uguali(dopoS, primaS));
      verifica('  ...le tre serie vecchie sono tolte, e il messaggio dice le tre lezioni rimesse come eventi singoli',
        [diQuattro, anticipata, rimandata].every(s => s.cancellata) &&
        numero(/rimesse come eventi singoli alla loro ora: (\d+)/, esitoS) === 3);
      docOriginale.celle = celleOriginali.slice();
    } else {
      verifica('ci sono tre serie da rifare per le lezioni spostate di piu\' giorni', false);
    }

    // due lezioni spostate nello stesso posto su quattro: le due forme sono
    // pari. Vale il giorno scritto nella descrizione, quello in cui Campanella
    // ha messo la serie: spostate le prime due o le ultime due, le lezioni
    // prima del cambio restano dove si vedono
    azzeraCalendario();
    // come lo crea ORARI_4_calendario: con il fuso dello script
    const calPari = CalendarApp.createCalendar(c.nome, { timeZone: FUSO_BANCO });
    const nomiGiorni = ['Domenica', 'Lunedi\'', 'Martedi\'', 'Mercoledi\'', 'Giovedi\'', 'Venerdi\'', 'Sabato'];
    const serieDiQuattro = (titolo, primo, ora) => {
      const inizio = new Date(primo.getFullYear(), primo.getMonth(), primo.getDate(), ora, 0);
      const s = calPari.createEventSeries(titolo, inizio, new Date(inizio.getTime() + 3600 * 1000),
        CalendarApp.newRecurrence().addWeeklyRule().until(new Date(primo.getFullYear(), primo.getMonth(),
          primo.getDate() + 21, 23, 59, 59)),
        { description: '[Campanella] Orario di ' + c.docente + ', ' + nomiGiorni[primo.getDay()] + ', 2a ora (prova)' });
      s.setTag('campanella', 'orario');
      return s;
    };
    const spostaA = (s, n, giorni, ora) => {
      const t = settimaneDopo(s.inizio, n);
      s.sposta(n, new Date(t.getFullYear(), t.getMonth(), t.getDate() + giorni, ora, 0),
                  new Date(t.getFullYear(), t.getMonth(), t.getDate() + giorni, ora + 1, 0));
    };
    // alle 9 nel giorno del cambio, le prime due spostate due giorni dopo alle 15
    const primeSpostate = serieDiQuattro('Pari prime', giorniDopo(vd, -21), 9);
    spostaA(primeSpostate, 0, 2, 15);
    spostaA(primeSpostate, 1, 2, 15);
    // alle 15 due giorni dopo, le ultime due spostate due giorni prima alle 9
    const ultimeSpostate = serieDiQuattro('Pari ultime', giorniDopo(vd, -19), 15);
    spostaA(ultimeSpostate, 2, -2, 9);
    spostaA(ultimeSpostate, 3, -2, 9);
    const soloPari = l => / Pari /.test(l + ' ');
    const primaPari = lezioniSul(calPari, giorniDopo(vd, -28), giornoPrima).filter(soloPari);
    docOriginale.celle = ruotata(celleOriginali);
    contesto.ORARI_5_cambioOrario();
    const dopoPari = lezioniSul(calPari, giorniDopo(vd, -28), giornoPrima).filter(soloPari);
    verifica('quattro lezioni con due spostate nello stesso posto, le prime o le ultime: le lezioni prima del cambio ' +
      'restano dove si vedono (' + primaPari.length + ')' + (uguali(dopoPari, primaPari) ? '' :
      ' (prima: ' + primaPari.join(', ') + '; dopo: ' + dopoPari.join(', ') + ')'),
      primaPari.length === 6 && uguali(dopoPari, primaPari));
    verifica('  ...le due serie vecchie sono tolte, e le lezioni spostate prima del cambio sono eventi singoli (3)',
      [primeSpostate, ultimeSpostate].every(s => s.cancellata) &&
      calPari.eventi.filter(e => !e.cancellato && sostituisce(e) && /^Pari /.test(e.titolo)).length === 3);
    docOriginale.celle = celleOriginali.slice();

    // una serie di due lezioni, una prima e una dopo il cambio, una delle due
    // spostata: a parita' vale la prima, cosi' la lezione che resta si vede
    // dov'era (quella dopo il cambio si toglie comunque)
    const lun9 = new Date(2026, 8, 28, 9, 0), lun10 = new Date(2026, 8, 28, 10, 0);
    const lun9dopo = new Date(2026, 9, 5, 9, 0), lun10dopo = new Date(2026, 9, 5, 10, 0);
    const mer15dopo = new Date(2026, 9, 7, 15, 0), mer16dopo = new Date(2026, 9, 7, 16, 0);
    const mer15 = new Date(2026, 8, 30, 15, 0), mer16 = new Date(2026, 8, 30, 16, 0);
    const primaRegolare = { lezioni: [{ inizio: lun9, fine: lun10 }, { inizio: mer15dopo, fine: mer16dopo }] };
    contesto._orariPrimaLezione_(primaRegolare);
    verifica('due lezioni, la seconda spostata: la serie comincia dalla prima, lunedi\' alle 9',
      primaRegolare.inizio.getTime() === lun9.getTime() && primaRegolare.fine.getTime() === lun10.getTime());
    const primaSpostata = { lezioni: [{ inizio: mer15, fine: mer16 }, { inizio: lun9dopo, fine: lun10dopo }] };
    contesto._orariPrimaLezione_(primaSpostata);
    verifica('due lezioni, la prima spostata: la serie comincia dove si vede la prima (mercoledi\' alle 15), e si nota',
      primaSpostata.inizio.getTime() === mer15.getTime() && primaSpostata.irregolare === true);
    const conSpostata = { lezioni: [{ inizio: mer15, fine: mer16 }, { inizio: lun9dopo, fine: lun10dopo },
      { inizio: new Date(2026, 9, 12, 9, 0), fine: new Date(2026, 9, 12, 10, 0) }] };
    contesto._orariPrimaLezione_(conSpostata);
    verifica('tre lezioni, la prima spostata di due giorni: la serie comincia dalla sua settimana, lunedi\' alle 9, ' +
      'e si nota', conSpostata.inizio.getTime() === lun9.getTime() && conSpostata.irregolare === true);
    // a parita' decide il giorno scritto nella descrizione, anche con una
    // virgola nel nome del docente
    const conDescrizione = { descrizione: '[Campanella] Orario di ' + c.docente + ', Lunedi\', dalla 1a alla 2a ora (prova)',
      lezioni: [{ inizio: mer15, fine: mer16 }, { inizio: lun9dopo, fine: lun10dopo }] };
    contesto._orariPrimaLezione_(conDescrizione);
    verifica('due lezioni, la prima spostata, e la descrizione dice lunedi\': la serie comincia dalla settimana ' +
      'della prima, lunedi\' alle 9', conDescrizione.inizio.getTime() === lun9.getTime() && conDescrizione.irregolare === true);
    const mar9 = new Date(2026, 8, 29, 9, 0), mar10 = new Date(2026, 8, 29, 10, 0);
    const conVirgola = { descrizione: '[Campanella] Orario di ROSSI, MARIA, Mercoledi\', 3a ora (prova)',
      lezioni: [{ inizio: mar9, fine: mar10 }, { inizio: mer15dopo, fine: mer16dopo }] };
    contesto._orariPrimaLezione_(conVirgola);
    verifica('  ...e con "ROSSI, MARIA" nel nome il giorno e\' mercoledi\', non martedi\'',
      conVirgola.inizio.getTime() === mer15.getTime() && conVirgola.fine.getTime() === mer16.getTime());

    // la prima lezione spostata di uno o tre giorni e la seconda cancellata:
    // fra la spostata e la prima regolare manca una settimana. La spostata e'
    // della settimana in cui cade, se li' Campanella poteva mettere una
    // lezione (dal primo giorno del periodo, e non in un giorno senza
    // lezione); altrimenti si conta come prima (anticipata alla settimana prima)
    const lunedi = '[Campanella] Orario di ' + c.docente + ', Lunedi\', 1a ora (prova)';
    const dal14 = { inizio: new Date(2026, 8, 14), fine: new Date(2027, 5, 10), sospensioni: [] };
    const lez = (mese, giorno, ora) => ({ inizio: new Date(2026, mese, giorno, ora, 0), fine: new Date(2026, mese, giorno, ora + 1, 0) });
    const alle = (voce, mese, giorno, ora) => voce.inizio.getTime() === new Date(2026, mese, giorno, ora, 0).getTime() &&
      voce.fine.getTime() === new Date(2026, mese, giorno, ora + 1, 0).getTime();
    for (const giorni of [1, 3]) {
      const v = { descrizione: lunedi, lezioni: [lez(8, 14 + giorni, 9), lez(8, 28, 9), lez(9, 5, 9), lez(9, 12, 9)] };
      contesto._orariPrimaLezione_(v, dal14);
      verifica('la prima lezione spostata di ' + giorni + (giorni === 1 ? ' giorno' : ' giorni') + ' e la seconda ' +
        'cancellata: la serie comincia dal lunedi\' 14/09 (' + chiave(v.inizio) + '), e si nota',
        alle(v, 8, 14, 9) && v.irregolare === true);
    }
    const anticipataPrima = { descrizione: lunedi, lezioni: [lez(8, 9, 15), lez(8, 21, 9), lez(8, 28, 9)] };
    contesto._orariPrimaLezione_(anticipataPrima, dal14);
    verifica('  ...ma la prima anticipata alla settimana prima dell\'inizio del periodo e\' ancora del 14/09 (' +
      chiave(anticipataPrima.inizio) + ')', alle(anticipataPrima, 8, 14, 9));
    const dopoIlPonte = { descrizione: lunedi, lezioni: [lez(9, 9, 15), lez(9, 19, 9), lez(9, 26, 9)] };
    contesto._orariPrimaLezione_(dopoIlPonte, { inizio: dal14.inizio, fine: dal14.fine,
                                                sospensioni: [{ dal: '2026-10-05', al: '2026-10-05', nome: 'ponte' }] });
    verifica('  ...e la prima dopo un ponte, anticipata alla settimana del ponte, e\' ancora del 12/10 (' +
      chiave(dopoIlPonte.inizio) + ')', alle(dopoIlPonte, 9, 12, 9));
    const senzaPeriodo = { descrizione: lunedi, lezioni: [lez(8, 15, 9), lez(8, 28, 9), lez(9, 5, 9)] };
    contesto._orariPrimaLezione_(senzaPeriodo);
    verifica('  ...e senza il periodo si conta come prima: dal 21/09 (' + chiave(senzaPeriodo.inizio) + ')',
      alle(senzaPeriodo, 8, 21, 9));
    // due lezioni spostate nella stessa settimana: non si sa di quali settimane sono, si contano
    const dueNellaStessa = { descrizione: lunedi, lezioni: [lez(8, 15, 9), lez(8, 17, 9), lez(9, 5, 9), lez(9, 12, 9)] };
    contesto._orariPrimaLezione_(dueNellaStessa, dal14);
    verifica('  ...e con due spostate nella stessa settimana si contano: dal 21/09 (' + chiave(dueNellaStessa.inizio) + ')',
      alle(dueNellaStessa, 8, 21, 9));

    // e nel cambio d'orario vero: la lezione spostata non sparisce, e la
    // settimana cancellata resta vuota
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    const calB = calendari[0];
    const conSettimanaCancellata = vive(calB).filter(s => chiave(s.inizio) < validoDal &&
      chiave(s.ricorrenza.until) >= validoDal && s.inizi(giornoPrima).length >= 3 && chiave(s.inizio) === chiave(s.inizioOriginale));
    if (conSettimanaCancellata.length >= 2) {
      const coppie = [[conSettimanaCancellata[0], 1], [conSettimanaCancellata[1], 3]];
      for (const [s, giorni] of coppie) {
        const t = s.inizio, durata = s.fine - s.inizio;
        const nuovo = new Date(t.getFullYear(), t.getMonth(), t.getDate() + giorni, t.getHours(), t.getMinutes());
        s.sposta(0, nuovo, new Date(nuovo.getTime() + durata));
        s.cancella(1);
      }
      const primaB = lezioniSul(calB, primoGiorno, giornoPrima);
      docOriginale.celle = ruotata(celleOriginali);
      contesto.ORARI_5_cambioOrario();
      const dopoB = lezioniSul(calB, primoGiorno, giornoPrima);
      verifica('con la prima lezione spostata di uno o tre giorni e la seconda cancellata, le lezioni prima del cambio ' +
        'restano come erano (' + primaB.length + ')' + (uguali(dopoB, primaB) ? '' : ' (sparite: ' +
          primaB.filter(x => dopoB.indexOf(x) < 0).join(', ') + '; comparse: ' + dopoB.filter(x => primaB.indexOf(x) < 0).join(', ') + ')'),
        uguali(dopoB, primaB));
      verifica('  ...le due serie vecchie sono tolte, e le due lezioni spostate sono eventi singoli',
        coppie.every(([s]) => s.cancellata) &&
        coppie.every(([s]) => calB.eventi.some(e => !e.cancellato && String(e.getTag('campanella_sostituisce') || '')
          .indexOf(s.id + '|') === 0)));
      docOriginale.celle = celleOriginali.slice();
    } else {
      verifica('ci sono due serie da rifare per la prima lezione spostata e la seconda cancellata', false);
    }

    // due cambi d'orario, e fra i due la prima lezione di una serie messa dal
    // primo anticipata alla settimana prima. Quella settimana, dopo l'inizio
    // del periodo e senza giorni senza lezione, aveva ancora l'orario di
    // prima: la serie non comincia li', e il secondo cambio non aggiunge una
    // lezione nel passato
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    const calDue = calendari[0];
    const salvaDue = contesto.ORARI.calendario;
    const primoCambio = chiave(giorniDopo(vd, 2)), secondoCambio = chiave(giorniDopo(vd, 35));
    contesto.ORARI.calendario = Object.assign({}, salvaDue, { validoDal: primoCambio });
    contesto.ORARI_5_cambioOrario();
    const lunediDopo = giorniDopo(vd, 7);
    const nuovaLun = vive(calDue).find(s => chiave(s.inizio) === chiave(lunediDopo));
    verifica('il primo cambio, dal ' + primoCambio + ', mette una serie nuova che comincia il ' + chiave(lunediDopo),
      !!nuovaLun && nuovaLun.getDescription().indexOf('[Campanella]') === 0);
    if (nuovaLun) {
      const t = nuovaLun.inizio, durata = nuovaLun.fine - nuovaLun.inizio;
      const anticipata = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 3, t.getHours(), t.getMinutes());
      nuovaLun.sposta(0, anticipata, new Date(anticipata.getTime() + durata));
      const primaDue = lezioniSul(calDue, primoGiorno, giorniDopo(dataDa(secondoCambio), -1));
      contesto.ORARI.calendario = Object.assign({}, salvaDue, { validoDal: secondoCambio });
      docOriginale.celle = ruotata(celleOriginali);
      const esitoDue = contesto.ORARI_5_cambioOrario();
      const dopoDue = lezioniSul(calDue, primoGiorno, giorniDopo(dataDa(secondoCambio), -1));
      verifica('  ...la sua prima lezione anticipata alla settimana prima, e un secondo cambio dal ' + secondoCambio +
        ': le lezioni prima restano come erano (' + primaDue.length + ')' + (uguali(dopoDue, primaDue) ? '' :
        ' (invece ' + dopoDue.length + ', doppie: ' + dopoDue.filter((x, i, tt) => tt.indexOf(x) !== i).join(', ') +
        '; sparite: ' + primaDue.filter(x => dopoDue.indexOf(x) < 0).join(', ') + ')'), uguali(dopoDue, primaDue));
      const giornoAnticipata = ['domenica', 'lunedi\'', 'martedi\'', 'mercoledi\'', 'giovedi\'', 'venerdi\'', 'sabato'][anticipata.getDay()];
      verifica('  ...la serie vecchia e\' tolta, e il messaggio nomina la lezione anticipata, rimessa come evento singolo',
        nuovaLun.cancellata &&
        esitoDue.indexOf(nuovaLun.titolo + ', ' + giornoAnticipata + ' ' + chiave(anticipata) + ' ') >= 0);
      verifica('  ...perche\' la descrizione dice il primo giorno della serie',
        nuovaLun.getDescription().indexOf(', serie dal ' + chiave(lunediDopo)) > 0);
    }
    contesto.ORARI.calendario = salvaDue;
    docOriginale.celle = celleOriginali.slice();
    // e la data nella descrizione, per _orariPrimaLezione_: la serie non comincia prima
    const conData = { descrizione: '[Campanella] Orario di ' + c.docente + ', Lunedi\', 1a ora, serie dal 2026-10-12 (prova)',
      lezioni: [lez(9, 9, 9), lez(9, 19, 9), lez(9, 26, 9), lez(10, 2, 9)] };
    contesto._orariPrimaLezione_(conData, dal14);
    verifica('con la descrizione "serie dal 2026-10-12" la prima lezione anticipata a venerdi\' 9/10 e\' ancora del ' +
      '12/10 (' + chiave(conData.inizio) + '), anche con il periodo dal 14/09', alle(conData, 9, 12, 9));
    const senzaData = { descrizione: lunedi, lezioni: [lez(9, 9, 9), lez(9, 19, 9), lez(9, 26, 9), lez(10, 2, 9)] };
    contesto._orariPrimaLezione_(senzaData, dal14);
    verifica('  ...mentre senza la data (una serie di una versione di prima) conta il periodo: dal 05/10 (' +
      chiave(senzaData.inizio) + ')', alle(senzaData, 9, 5, 9));
  }

  // --- i colori delle classi ------------------------------------------------------
  // Ogni lezione ha il colore della sua classe (calendario.colori di
  // DatiOrari.gs, da "1" a "11"): ORARI_4_calendario e ORARI_5_cambioOrario lo
  // danno alle serie e agli eventi che creano, ORARI_6_coloraLezioni a quelli
  // gia' messi. I dati hanno almeno due classi del piano con un colore; per le
  // prove con una classe senza, all'ultima si toglie
  intestazione('COLORI DELLE CLASSI');
  const calendarioDati = contesto.ORARI.calendario;
  const coloriDati = Object.assign({}, calendarioDati.colori || {});
  const colorabile = v => (/^(?:[1-9]|1[01])$/.test(String(v == null ? '' : v).trim()) ? String(v).trim() : '');
  const NOMI_COLORI = ['', 'Lavanda', 'Salvia', 'Vinaccia', 'Fenicottero', 'Banana', 'Mandarino', 'Pavone', 'Grafite',
                       'Mirtillo', 'Basilico', 'Pomodoro'];
  const colorate = [...new Set(piano.tratti.map(tr => tr.blocco.testo))].filter(k => colorabile(coloriDati[k]));
  verifica('i dati hanno i colori di almeno due classi del piano (' +
    colorate.map(k => k + ' ' + NOMI_COLORI[Number(coloriDati[k])]).join(', ') + ')', colorate.length >= 2);
  /** Mette in DatiOrari.gs questi colori delle classi (quelli dei dati si rimettono con conColori(coloriDati)). */
  const conColori = colori => { contesto.ORARI.calendario = Object.assign({}, calendarioDati, { colori }); };
  const atteso = (colori, titolo) => colorabile(colori[titolo]);
  /** Le serie di un calendario con un colore diverso da quello della loro classe. */
  const coloriSbagliati = (calX, colori) => vive(calX).filter(s => s.getColor() !== atteso(colori, s.titolo));
  const fuga = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const senzaColore = colorate[colorate.length - 1];
  const coloriProva = Object.assign({}, coloriDati);
  delete coloriProva[senzaColore];

  azzeraCalendario();
  conColori(coloriProva);
  const esitoColori = contesto.ORARI_4_calendario();
  const calK = calendari[0];
  const sbagliateK = coloriSbagliati(calK, coloriProva);
  verifica('ORARI_4_calendario da\' a ogni serie il colore della sua classe (' + vive(calK).length + ' serie' +
    (sbagliateK.length ? '; sbagliate: ' + sbagliateK.map(s => s.titolo + ' ' + s.getColor()).join(', ') : '') + ')',
    sbagliateK.length === 0 && vive(calK).length === piano.tratti.length);
  verifica('  ...e alle serie di ' + senzaColore + ', senza colore, lascia quello del calendario',
    vive(calK).some(s => s.titolo === senzaColore) &&
    vive(calK).filter(s => s.titolo === senzaColore).every(s => s.getColor() === ''));
  verifica('  ...senza cambiare il colore del calendario', !c.colore || calK.colore === CalendarApp.Color[c.colore]);
  verifica('il messaggio finale dice i colori delle classi, con i nomi di Google Calendar',
    colorate.slice(0, -1).every(k => esitoColori.indexOf(k + ' ' + NOMI_COLORI[Number(coloriDati[k])]) >= 0) &&
    new RegExp('Colori delle classi: [^\\n]*; del colore del calendario: [^\\n]*' + fuga(senzaColore)).test(esitoColori));
  const anteprimaColori = contesto.ORARI_1_anteprima();
  verifica('ORARI_1_anteprima dice i colori delle classi, e che alle lezioni gia\' messe li da\' ORARI_6_coloraLezioni',
    colorate.slice(0, -1).every(k => anteprimaColori.indexOf(k + ' ' + NOMI_COLORI[Number(coloriDati[k])]) >= 0) &&
    /Colori delle classi: /.test(anteprimaColori) && /gia' messe li da' ORARI_6_coloraLezioni/.test(anteprimaColori) &&
    !/ATTENZIONE: in DatiOrari/.test(anteprimaColori));
  // colori scritti male (a mano): l'anteprima li nomina, e per lo script quella classe non ha colore
  conColori(Object.assign({}, coloriProva, { [senzaColore]: 'rosso', 'CLASSE INVENTATA': '12' }));
  const anteprimaSbagliati = contesto.ORARI_1_anteprima();
  const configSbagliati = contesto._orariCalendarioConfig_(contesto.ORARI);
  verifica('con colori che Google Calendar non ha ("rosso", "12") l\'anteprima li nomina e dice di rigenerare DatiOrari.gs',
    /ATTENZIONE: in DatiOrari\.gs i colori di /.test(anteprimaSbagliati) &&
    anteprimaSbagliati.indexOf(senzaColore + ' ("rosso")') >= 0 && anteprimaSbagliati.indexOf('CLASSE INVENTATA ("12")') >= 0 &&
    /Rigenera DatiOrari\.gs/.test(anteprimaSbagliati));
  verifica('  ...e per lo script quelle classi non hanno colore',
    contesto._orariColoreDi_(configSbagliati, senzaColore) === '' && contesto._orariColoreDi_(configSbagliati, 'CLASSE INVENTATA') === '');
  conColori({ [' ' + colorate[0].toLowerCase() + ' ']: 4 });
  verifica('una classe scritta con altre maiuscole o altri spazi, e il colore scritto come numero, valgono',
    contesto._orariColoreDi_(contesto._orariCalendarioConfig_(contesto.ORARI), colorate[0]) === '4');
  conColori({});
  verifica('senza colori, la riga dice che tutte le lezioni hanno il colore del calendario',
    /Colori delle classi: nessuno, tutte le lezioni hanno il colore del calendario/.test(contesto.ORARI_1_anteprima()));

  // un colore che Google non mette non ferma il lavoro: il messaggio dice
  // quale serie, e ORARI_6_coloraLezioni glielo mette
  for (const messaggio of ['Errore interno di prova', 'Rate Limit Exceeded']) {
    azzeraCalendario();
    conColori(coloriProva);
    guasti([{ op: 'setColor', alla: 2, messaggio }]);
    const esitoG = contesto.ORARI_4_calendario();
    guasti([]);
    const calCG = calendari[0];
    const senza = coloriSbagliati(calCG, coloriProva);
    verifica('Google non mette un colore ("' + messaggio + '"): il lavoro va fino in fondo, e il messaggio dice ' +
      'quale serie e di eseguire ORARI_6_coloraLezioni',
      vive(calCG).length === piano.tratti.length && vive(calCG).every(s => s.getTag('campanella') === 'orario') &&
      senza.length === 1 && senza[0].getColor() === '' && !proprieta.has(PROGRESSO_CALENDARIO) &&
      ripresaDi('ORARI_4_calendario').length === 0 && /non ha messo il colore della classe a una serie/.test(esitoG) &&
      esitoG.indexOf(senza[0].titolo + ', ') >= 0 && /esegui ORARI_6_coloraLezioni/.test(esitoG));
    const rimesso = contesto.ORARI_6_coloraLezioni();
    verifica('  ...e ORARI_6_coloraLezioni glielo mette, toccando solo quella serie',
      coloriSbagliati(calCG, coloriProva).length === 0 && (chiamate.setColor || 0) === 1 &&
      numero(/Colorati adesso con il colore della loro classe: (\d+)/, rimesso) === 1);
  }
  // il colore arriva prima del contrassegno: se il contrassegno non riesce, la serie ce l'ha gia'
  {
    const n = piano.tratti.findIndex(tr => !!atteso(coloriProva, tr.blocco.testo));
    azzeraCalendario();
    conColori(coloriProva);
    guasti([{ op: 'setTag', alla: n + 1, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
    contesto.ORARI_4_calendario();
    guasti([]);
    const senzaTag = calendari[0].serie[n];
    verifica('il colore arriva prima del contrassegno: se il contrassegno non riesce, la serie ha gia\' il colore della ' +
      'sua classe', n >= 0 && !!senzaTag && !senzaTag.getTag('campanella') && !!senzaTag.getColor() &&
      senzaTag.getColor() === atteso(coloriProva, senzaTag.titolo));
    riprendiFinoInFondo('ORARI_4_calendario');
    verifica('  ...e alla ripresa riceve il contrassegno, e tutte le serie hanno il loro colore',
      !!senzaTag && senzaTag.getTag('campanella') === 'orario' && coloriSbagliati(calendari[0], coloriProva).length === 0 &&
      !proprieta.has(PROGRESSO_CALENDARIO));
  }
  // i colori cambiati a meta' (un DatiOrari.gs rigenerato con altri colori)
  // non sono nell'impronta del piano: la ripresa va avanti con quelli nuovi
  {
    azzeraCalendario();
    conColori(coloriProva);
    sogliaCalendario = 5;
    contesto.ORARI_4_calendario();
    sogliaCalendario = Infinity;
    const prime = vive(calendari[0]).slice();
    const [kx, ky] = colorate;
    const scambiati = Object.assign({}, coloriProva, { [kx]: coloriProva[ky] || '', [ky]: coloriProva[kx] });
    conColori(scambiati);
    const ripresaColori = errore(() => riprendiFinoInFondo('ORARI_4_calendario'));
    const fineScambio = registro[registro.length - 1];
    verifica('i colori cambiati a meta\' non fermano la ripresa: non sono nell\'impronta del piano' +
      (ripresaColori ? ' (invece: ' + ripresaColori.slice(0, 80) + ')' : ''),
      ripresaColori === '' && vive(calendari[0]).length === piano.tratti.length && senzaDoppioni(calendari[0]) &&
      !proprieta.has(PROGRESSO_CALENDARIO) && prime.length === 5);
    verifica('  ...le serie messe dopo hanno i colori nuovi, e il messaggio finale dice di dare a tutte quelli di adesso ' +
      'con ORARI_6_coloraLezioni',
      vive(calendari[0]).filter(s => prime.indexOf(s) < 0).every(s => s.getColor() === atteso(scambiati, s.titolo)) &&
      /cambiati a meta' del lavoro/.test(fineScambio) && /ORARI_6_coloraLezioni/.test(fineScambio));
    contesto.ORARI_6_coloraLezioni();
    verifica('  ...e ORARI_6_coloraLezioni da\' a tutte i colori di adesso', coloriSbagliati(calendari[0], scambiati).length === 0);
  }
  conColori(coloriDati);

  intestazione('COLORI NEL CAMBIO D\'ORARIO');
  if (validoDal) {
    azzeraCalendario();
    conColori(coloriProva);
    contesto.ORARI_4_calendario();
    const calV = calendari[0];
    const sost = s => String(s.getTag('campanella_sostituisce') || '');
    const attraverso = vive(calV).filter(s => chiave(s.inizio) < validoDal && chiave(s.ricorrenza.until) >= validoDal &&
      s.inizi(giornoPrima).length >= 3);
    // sA: di una classe che nel DatiOrari.gs nuovo non ha colore, colorata a
    // mano tutta; sB: di una classe con un colore nuovo, con la prima lezione
    // spostata a mano e la seconda colorata a mano solo lei
    const sA = attraverso[0];
    const sB = attraverso.find(s => !!sA && s.titolo !== sA.titolo);
    verifica('ci sono due serie da rifare di due classi diverse', !!sA && !!sB);
    if (sA && sB) {
      const coloriCambio = Object.assign({}, coloriProva);
      delete coloriCambio[sA.titolo];
      const nuovoDiB = ['6', '7', '2', '1'].find(v => v !== coloriProva[sB.titolo]);
      coloriCambio[sB.titolo] = nuovoDiB;
      sA.colore = '5';                                     // tutta la serie, colorata a mano da Google Calendar
      const pB = sB.inizio;
      sB.sposta(0, new Date(pB.getFullYear(), pB.getMonth(), pB.getDate() + 2, 15, 0),
                   new Date(pB.getFullYear(), pB.getMonth(), pB.getDate() + 2, 16, 0));
      sB.colora(1, '3');
      const primaV = lezioniSul(calV, primoGiorno, giornoPrima);
      const vecchieV = vive(calV).slice();
      conColori(coloriCambio);
      docOriginale.celle = ruotata(celleOriginali);
      const esitoV = contesto.ORARI_5_cambioOrario();
      const rifattaA = vive(calV).find(s => sost(s).indexOf(sA.id + '|') === 0);
      const rifattaB = vive(calV).find(s => sost(s).indexOf(sB.id + '|') === 0);
      const singoliB = calV.eventi.filter(e => !e.cancellato && sost(e).indexOf(sB.id + '|') === 0);
      const spostataB = singoliB.find(e => e.inizio.getHours() === 15);
      const colorataB = singoliB.find(e => e.inizio.getTime() === settimaneDopo(sB.inizio, 1).getTime());
      verifica('la serie rifatta di una classe con un colore nuovo in DatiOrari.gs prende quello (' + nuovoDiB + ')',
        !!rifattaB && rifattaB.getColor() === nuovoDiB);
      verifica('  ...e anche la sua lezione spostata a mano, rimessa come evento singolo',
        !!spostataB && spostataB.getColor() === nuovoDiB);
      verifica('  ...mentre quella colorata a mano solo lei torna come evento singolo, alla sua ora, con il suo colore',
        !!colorataB && colorataB.getColor() === '3' && !!rifattaB &&
        rifattaB.lezioni(giornoPrima).every(l => l.inizio.getTime() !== colorataB.inizio.getTime()));
      verifica('la serie rifatta di una classe che in DatiOrari.gs non ha piu\' un colore tiene quello della vecchia',
        !!rifattaA && rifattaA.getColor() === '5');
      const nuoveV = vive(calV).filter(s => vecchieV.indexOf(s) < 0 && !sost(s));
      verifica('le serie dell\'orario nuovo hanno il colore della loro classe (' + nuoveV.length + ')',
        nuoveV.length === nuovoPiano.tratti.length && nuoveV.every(s => s.getColor() === atteso(coloriCambio, s.titolo)));
      verifica('le lezioni prima del cambio restano come erano, e il messaggio conta anche la lezione colorata a mano fra ' +
        'quelle rimesse come eventi singoli (2)', uguali(lezioniSul(calV, primoGiorno, giornoPrima), primaV) &&
        numero(/colorate a mano, rimesse come eventi singoli alla loro ora: (\d+)/, esitoV) === 2 &&
        /Le serie rifatte hanno il colore della loro classe/.test(esitoV));
    }
    // ORARI_6_coloraLezioni sugli eventi singoli rimessi dal cambio: una
    // lezione rinominata a mano ("VERIFICA") e' ancora della sua classe e
    // prende il colore nuovo; una colorata a mano solo lei tiene il suo, come
    // dentro la serie
    azzeraCalendario();
    conColori(coloriProva);
    contesto.ORARI_4_calendario();
    const calR = calendari[0];
    const sR = vive(calR).find(s => chiave(s.inizio) < validoDal && chiave(s.ricorrenza.until) >= validoDal &&
      s.inizi(giornoPrima).length >= 3 && !!atteso(coloriProva, s.titolo));
    verifica('c\'e\' una serie da rifare di una classe con un colore, per gli eventi singoli rimessi', !!sR);
    if (sR) {
      const classeR = sR.titolo;
      const suoR = ['4', '3'].find(v => v !== coloriProva[classeR]);
      const altroR = ['6', '7', '2', '1'].find(v => v !== coloriProva[classeR] && v !== suoR);
      sR.rinomina(0, classeR + ' VERIFICA');
      sR.colora(1, suoR);
      docOriginale.celle = ruotata(celleOriginali);
      contesto.ORARI_5_cambioOrario();
      const rinominataR = calR.eventi.find(e => !e.cancellato && e.titolo === classeR + ' VERIFICA');
      const colorataR = calR.eventi.find(e => !e.cancellato && e.inizio.getTime() === settimaneDopo(sR.inizio, 1).getTime());
      verifica('il cambio rimette come eventi singoli la lezione rinominata a mano, con il colore della classe, e quella ' +
        'colorata a mano, con il suo', !proprieta.has(PROGRESSO_CALENDARIO) &&
        !!rinominataR && rinominataR.getColor() === coloriProva[classeR] && !!colorataR && colorataR.getColor() === suoR);
      conColori(Object.assign({}, coloriProva, { [classeR]: altroR }));
      const esitoR = contesto.ORARI_6_coloraLezioni();
      verifica('ORARI_6_coloraLezioni da\' alla lezione rinominata a mano il colore nuovo della sua classe, come alla ' +
        'serie rifatta (' + (rinominataR ? rinominataR.getColor() : '-') + ')',
        !!rinominataR && rinominataR.getColor() === altroR &&
        vive(calR).filter(s => s.titolo === classeR && s.getTag('campanella') === 'orario').every(s => s.getColor() === altroR));
      verifica('  ...e non la conta fra le classi senza colore', !/senza colore[^\n]*VERIFICA/.test(esitoR));
      verifica('la lezione colorata a mano solo lei tiene il suo colore (' + (colorataR ? colorataR.getColor() : '-') +
        '), e il messaggio la nomina fra quelle lasciate con il loro',
        !!colorataR && colorataR.getColor() === suoR &&
        numero(/Colorati a mano solo loro[^:]*: (\d+)/, esitoR) === 1 && esitoR.indexOf(NOMI_COLORI[Number(suoR)]) >= 0);
      const ancoraR = contesto.ORARI_6_coloraLezioni();
      verifica('  ...anche rieseguita', !!colorataR && colorataR.getColor() === suoR &&
        numero(/Colorati adesso con il colore della loro classe: (\d+)/, ancoraR) === 0);
      docOriginale.celle = celleOriginali.slice();
    }
    // un colore che Google non mette nel taglio non ferma il cambio: il messaggio lo dice
    azzeraCalendario();
    conColori(coloriProva);
    contesto.ORARI_4_calendario();
    docOriginale.celle = ruotata(celleOriginali);
    guasti([{ op: 'setColor', alla: 1, messaggio: 'Rate Limit Exceeded' }]);
    const esitoGV = contesto.ORARI_5_cambioOrario();
    guasti([]);
    verifica('nel cambio d\'orario un colore che Google non mette non ferma il lavoro, e il messaggio lo dice',
      !proprieta.has(PROGRESSO_CALENDARIO) && uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio) &&
      /non ha messo il colore della classe a una serie/.test(esitoGV) && /esegui ORARI_6_coloraLezioni/.test(esitoGV));
    docOriginale.celle = celleOriginali.slice();
    conColori(coloriDati);
  }

  intestazione('ORARI_6_COLORALEZIONI');
  {
    azzeraCalendario();
    conColori(coloriProva);
    contesto.ORARI_4_calendario();
    const cal6 = calendari[0];
    const k1 = colorate[0];
    const v1 = ['4', '8'].find(v => v !== coloriProva[k1]);
    const nuovi6 = Object.assign({}, coloriProva, { [k1]: v1, [senzaColore]: '5' });
    const nostreNelPeriodo = calX => vive(calX).filter(s => s.getTag('campanella') === 'orario' && s.inizio >= primoGiorno);
    const daCambiare = nostreNelPeriodo(cal6).filter(s => atteso(nuovi6, s.titolo) !== s.getColor()).length;
    const giaGiuste = nostreNelPeriodo(cal6).filter(s => !!atteso(nuovi6, s.titolo) && atteso(nuovi6, s.titolo) === s.getColor())
      .length;
    const senzaColore6 = nostreNelPeriodo(cal6).filter(s => !atteso(nuovi6, s.titolo)).length;
    // una copia fatta a mano (la sola descrizione), un evento non nostro, un
    // evento singolo nostro della classe, e una serie nostra dell'anno prima
    const d0 = new Date(primoGiorno.getFullYear(), primoGiorno.getMonth(), primoGiorno.getDate() + 1, 18, 0);
    const copia6 = cal6.createEventSeries(k1, d0, new Date(d0.getTime() + 3600 * 1000),
      CalendarApp.newRecurrence().addWeeklyRule().until(giorniDopo(primoGiorno, 30)),
      { description: '[Campanella] Orario di ' + c.docente + ', copiata a mano' });
    const riunione6 = cal6.createEvent('Collegio docenti', new Date(d0.getTime() + 24 * 3600 * 1000),
                                       new Date(d0.getTime() + 26 * 3600 * 1000));
    const singolo6 = cal6.createEvent(k1, new Date(d0.getTime() + 48 * 3600 * 1000), new Date(d0.getTime() + 49 * 3600 * 1000),
                                      { description: '[Campanella] Orario di ' + c.docente + ', recupero' });
    singolo6.setTag('campanella', 'orario');
    const annoPrima = new Date(primoGiorno.getFullYear() - 1, primoGiorno.getMonth(), primoGiorno.getDate(), 8, 0);
    const vecchia6 = cal6.createEventSeries(k1, annoPrima, new Date(annoPrima.getTime() + 3600 * 1000),
      CalendarApp.newRecurrence().addWeeklyRule().until(new Date(annoPrima.getFullYear(), annoPrima.getMonth() + 2, 1)),
      { description: '[Campanella] Orario di ' + c.docente + ', l\'anno prima' });
    vecchia6.setTag('campanella', 'orario');
    const lezioniPrima6 = lezioniSul(cal6, primoGiorno, ultimoGiorno);
    const seriePrima6 = vive(cal6).length;
    conColori(nuovi6);
    guasti([]);
    const esito6 = contesto.ORARI_6_coloraLezioni();
    console.log(esito6);
    verifica('ORARI_6_coloraLezioni da\' alle serie e agli eventi singoli con il contrassegno i colori di adesso, ' +
      'cambiando solo quelli da cambiare (' + (daCambiare + 1) + ' su ' + (nostreNelPeriodo(cal6).length + 1) + ')',
      nostreNelPeriodo(cal6).every(s => s.getColor() === atteso(nuovi6, s.titolo)) && singolo6.getColor() === v1 &&
      (chiamate.setColor || 0) === daCambiare + 1);
    verifica('  ...senza rifare, spostare o togliere niente',
      uguali(lezioniSul(cal6, primoGiorno, ultimoGiorno), lezioniPrima6) && vive(cal6).length === seriePrima6 &&
      (chiamate.createEventSeries || 0) + (chiamate.createEvent || 0) + (chiamate.deleteEventSeries || 0) +
      (chiamate.deleteEvent || 0) + (chiamate.setTag || 0) === 0);
    verifica('  ...e non tocca la copia fatta a mano, l\'evento non nostro e la serie dell\'anno prima',
      copia6.getColor() === '' && riunione6.getColor() === '' && vecchia6.getColor() === '');
    verifica('il messaggio dice quante ne ha colorate (' + (daCambiare + 1) + '), quante lo avevano gia\' (' + giaGiuste +
      '), quante sono di classi senza colore (' + senzaColore6 + ') e la copia lasciata',
      numero(/Colorati adesso con il colore della loro classe: (\d+)/, esito6) === daCambiare + 1 &&
      numero(/Avevano gia' il colore della loro classe: (\d+)/, esito6) === giaGiuste &&
      numero(/Di classi senza colore in DatiOrari\.gs, lasciati come sono: (\d+)/, esito6) === (senzaColore6 || -1) &&
      /senza contrassegno, forse copiati a mano: non li ho toccati \(1\)/.test(esito6) &&
      !proprieta.has(PROGRESSO_COLORI) && ripresaDi('ORARI_6_coloraLezioni').length === 0);
    guasti([]);
    const ancora6 = contesto.ORARI_6_coloraLezioni();
    verifica('rieseguita con gli stessi colori non cambia niente',
      (chiamate.setColor || 0) === 0 && numero(/Colorati adesso con il colore della loro classe: (\d+)/, ancora6) === 0);
    // una classe che perde il colore: le sue lezioni restano come sono, e il messaggio lo dice
    const senzaK1 = Object.assign({}, nuovi6);
    delete senzaK1[k1];
    conColori(senzaK1);
    guasti([]);
    const perso6 = contesto.ORARI_6_coloraLezioni();
    verifica('una classe che non ha piu\' un colore: le sue lezioni restano come sono, e il messaggio dice che ne hanno ' +
      'ancora uno messo prima e come toglierlo',
      (chiamate.setColor || 0) === 0 && nostreNelPeriodo(cal6).filter(s => s.titolo === k1).every(s => s.getColor() === v1) &&
      /ancora un colore messo prima/.test(perso6) && perso6.indexOf(k1 + ', ') >= 0 &&
      perso6.indexOf('(' + NOMI_COLORI[Number(v1)] + ')') >= 0 && /da Google Calendar/.test(perso6));
    azzeraCalendario();
    const senzaCal6 = errore(() => contesto.ORARI_6_coloraLezioni());
    verifica('senza il calendario si ferma e dice di eseguire ORARI_4_calendario',
      /nessun calendario/.test(senzaCal6) && /ORARI_4_calendario/.test(senzaCal6) && !proprieta.has(PROGRESSO_COLORI));
    conColori(coloriDati);
  }

  intestazione('ORARI_6_COLORALEZIONI: RIPRESA, LIMITI DI GOOGLE E BLOCCO');
  /** Fa scattare la ripresa di ORARI_6_coloraLezioni finche' c'e' il suo lavoro (e la sua ripresa). */
  function riprendiColori() {
    let giri = 0;
    while (proprieta.has(PROGRESSO_COLORI) && giri < 80 && trigger.some(t => t.fn === 'ORARI_6_coloraLezioni')) {
      contesto.ORARI_6_coloraLezioni({ triggerUid: 'ripresa dei colori ' + giri });
      giri++;
    }
    return giri;
  }
  const salvatoColori = () => JSON.parse(proprieta.get(PROGRESSO_COLORI) || 'null');
  /** L'orario messo con i colori dei dati, e poi in DatiOrari.gs i colori girati: ogni serie colorata e' da cambiare. */
  function daRicolorare() {
    azzeraCalendario();
    conColori(coloriDati);
    contesto.ORARI_4_calendario();
    const giro = Object.assign({}, coloriDati);
    colorate.forEach((k, i) => { giro[k] = coloriDati[colorate[(i + 1) % colorate.length]]; });
    conColori(giro);
    guasti([]);
    return giro;
  }
  /** ORARI_6_coloraLezioni fermata dal tempo massimo dopo n colori, con la sua ripresa programmata. */
  function coloriAMeta(n) {
    sogliaColori = n;
    coloriDallUltimoSalto = 0;
    const testo = contesto.ORARI_6_coloraLezioni();
    sogliaColori = Infinity;
    orologio = 0;
    return testo;
  }
  {
    const giro = daRicolorare();
    const daFare = coloriSbagliati(calendari[0], giro).length;
    const aMeta6 = coloriAMeta(3);
    verifica('al tempo massimo si ferma, lo dice e programma la sua ripresa fra un minuto (' + daFare + ' da colorare)',
      /Tempo massimo/.test(aMeta6) && /fra un minuto/.test(aMeta6) && !!salvatoColori() && salvatoColori().colorate === 3 &&
      ripresaDi('ORARI_6_coloraLezioni').length === 1 && ripresaDi('ORARI_6_coloraLezioni')[0].ms === 60000 && daFare > 3);
    const giri6 = riprendiColori();
    verifica('riprendendo (' + giri6 + ' volte) finisce: ogni serie ha il colore nuovo, e nessuna e\' colorata due volte',
      giri6 >= 1 && !proprieta.has(PROGRESSO_COLORI) && ripresaDi('ORARI_6_coloraLezioni').length === 0 &&
      coloriSbagliati(calendari[0], giro).length === 0 && (chiamate.setColor || 0) === daFare &&
      numero(/Colorati adesso con il colore della loro classe: (\d+)/, registro[registro.length - 1]) === daFare);
    trigger.push({ fn: 'ORARI_6_coloraLezioni', ms: 60000 });
    const niente6 = contesto.ORARI_6_coloraLezioni({ triggerUid: 'rimasto' });
    verifica('una ripresa che non trova niente da riprendere non colora niente, e toglie il trigger',
      /Niente da riprendere/.test(niente6) && ripresaDi('ORARI_6_coloraLezioni').length === 0 &&
      (chiamate.setColor || 0) === daFare);
  }
  for (const [messaggio, domani] of [['Rate Limit Exceeded', false], ['Service invoked too many times for one day: calendar.', true]]) {
    const giro = daRicolorare();
    guasti([{ op: 'setColor', alla: 3, messaggio }]);
    const r6 = contesto.ORARI_6_coloraLezioni();
    verifica('"' + messaggio.slice(0, 44) + '...": si ferma e lo dice, ' +
      (domani ? 'senza riprese, e di rieseguirlo domani' : 'e riprende fra un minuto'),
      !!salvatoColori() && salvatoColori().colorate === 2 &&
      (domani ? /domani/.test(r6) && ripresaDi('ORARI_6_coloraLezioni').length === 0
              : /fra un minuto/.test(r6) && ripresaDi('ORARI_6_coloraLezioni').length === 1));
    guasti([]);
    if (domani) contesto.ORARI_6_coloraLezioni();
    else riprendiColori();
    verifica('  ...e ' + (domani ? 'rieseguito a mano' : 'riprendendo') + ' finisce',
      !proprieta.has(PROGRESSO_COLORI) && coloriSbagliati(calendari[0], giro).length === 0);
  }
  {
    const giro = daRicolorare();
    guasti([{ op: 'setColor', alla: 2, messaggio: 'Errore interno di prova' }]);
    const altro6 = contesto.ORARI_6_coloraLezioni();
    guasti([]);
    verifica('un altro errore su un colore non ferma il lavoro: le altre hanno il colore nuovo, e il messaggio dice ' +
      'quella rimasta e di rieseguire piu\' tardi', !proprieta.has(PROGRESSO_COLORI) &&
      coloriSbagliati(calendari[0], giro).length === 1 && /non ha messo il colore a una serie o lezione/.test(altro6) &&
      /Riesegui ORARI_6_coloraLezioni piu' tardi/.test(altro6));
    contesto.ORARI_6_coloraLezioni();
    verifica('  ...e rieseguita glielo mette', coloriSbagliati(calendari[0], giro).length === 0);
  }
  {
    // i colori cambiati fra un'esecuzione e la sua ripresa: ricomincia da capo
    daRicolorare();
    coloriAMeta(2);
    conColori(coloriDati);
    riprendiColori();
    verifica('DatiOrari.gs con altri colori fra un\'esecuzione e la ripresa: ricomincia, e ogni serie ha i colori di adesso',
      !proprieta.has(PROGRESSO_COLORI) && coloriSbagliati(calendari[0], coloriDati).length === 0);
  }
  {
    // il blocco preso da un'altra esecuzione
    daRicolorare();
    coloriAMeta(2);
    trigger.length = 0;
    lockOccupato = true;
    const primaDelBlocco6 = chiamate.setColor || 0;
    const occupato6 = contesto.ORARI_6_coloraLezioni({ triggerUid: 'ripresa' });
    verifica('una ripresa che trova il blocco preso si riprogramma fra un minuto, senza colorare niente',
      /fra un minuto/.test(occupato6) && ripresaDi('ORARI_6_coloraLezioni').length === 1 &&
      (chiamate.setColor || 0) === primaDelBlocco6);
    lockOccupato = false;
    riprendiColori();
    lockOccupato = true;
    const occupato6b = contesto.ORARI_6_coloraLezioni();
    lockOccupato = false;
    verifica('  ...e senza un lavoro a meta\' dice di riprovare e non programma niente',
      !proprieta.has(PROGRESSO_COLORI) && /riprova/.test(occupato6b) && ripresaDi('ORARI_6_coloraLezioni').length === 0);
  }
  {
    // ORARI_ANNULLA_calendario dimentica anche il lavoro sui colori
    daRicolorare();
    coloriAMeta(2);
    const annulla6 = contesto.ORARI_ANNULLA_calendario();
    verifica('ORARI_ANNULLA_calendario dimentica anche un ORARI_6_coloraLezioni a meta\', ne toglie la ripresa e lo dice',
      !proprieta.has(PROGRESSO_COLORI) && ripresaDi('ORARI_6_coloraLezioni').length === 0 && /a meta'/.test(annulla6) &&
      vive(calendari[0]).length === 0);
    proprieta.set(PROGRESSO_COLORI, '{non e\' JSON');
    const illeggibile6 = contesto.ORARI_6_coloraLezioni();
    verifica('un punto salvato illeggibile vale come nessun punto',
      /Serie ed eventi singoli di Campanella: 0/.test(illeggibile6) && !proprieta.has(PROGRESSO_COLORI));
  }
  conColori(coloriDati);
  contesto.ORARI.calendario = calendarioDati;

  // ORARI_6_coloraLezioni con il lavoro di ORARI_4_calendario o di
  // ORARI_5_cambioOrario a meta': si ferma senza toccare niente, come quelle
  // due davanti al lavoro dell'altra. Il cambio d'orario ripreso tiene la
  // lezione colorata a mano solo lei, gia' rimessa come evento singolo. Con
  // la serie vecchia colorata prima della ripresa, la lezione perderebbe il
  // suo colore o, se il colore della serie va anche alle lezioni colorate a
  // mano (l'altra supposizione, anche lei non provata dal vivo), sparirebbe
  intestazione('ORARI_6_COLORALEZIONI CON UN LAVORO DEL CALENDARIO A META\'');
  if (validoDal) {
    for (const modo of ['come supposto', 'la serie colora anche le lezioni cambiate']) {
      azzeraCalendario();
      coloreDiGoogle = modo;
      conColori(coloriProva);
      contesto.ORARI_4_calendario();
      const calM = calendari[0];
      const sM = vive(calM).find(s => chiave(s.inizio) < validoDal && chiave(s.ricorrenza.until) >= validoDal &&
        s.inizi(giornoPrima).length >= 3 && !!atteso(coloriProva, s.titolo));
      verifica('[' + modo + '] c\'e\' una serie da rifare di una classe con un colore', !!sM);
      if (!sM) continue;
      const suoM = ['4', '3'].find(v => v !== coloriProva[sM.titolo]);
      const nuovoM = ['6', '7', '2', '1'].find(v => v !== coloriProva[sM.titolo] && v !== suoM);
      const quandoM = settimaneDopo(sM.inizio, 1);
      sM.colora(1, suoM);
      const primaM = lezioniSul(calM, primoGiorno, giornoPrima);
      conColori(Object.assign({}, coloriProva, { [sM.titolo]: nuovoM }));
      docOriginale.celle = ruotata(celleOriginali);
      // Google chiede di rallentare proprio quando ORARI_5 toglie la serie
      // vecchia: la lezione colorata a mano e' gia' rimessa come evento singolo
      guasti([{ op: 'deleteEventSeries', su: s => s === sM, alla: 1, messaggio: 'Rate Limit Exceeded' }]);
      contesto.ORARI_5_cambioOrario();
      guasti([]);
      const rimessaM = calM.eventi.find(e => !e.cancellato && e.inizio.getTime() === quandoM.getTime());
      verifica('  ORARI_5_cambioOrario e\' fermo a meta\': la lezione colorata a mano e\' gia\' rimessa come evento ' +
        'singolo, con il suo colore, e la serie vecchia c\'e\' ancora',
        proprieta.has(PROGRESSO_CALENDARIO) && ripresaDi('ORARI_5_cambioOrario').length === 1 && !sM.cancellata &&
        !!rimessaM && rimessaM.getColor() === suoM);
      const scrittePrima = scritture;
      const lavoroPrima = proprieta.get(PROGRESSO_CALENDARIO);
      const fermo6 = errore(() => contesto.ORARI_6_coloraLezioni());
      verifica('  ORARI_6_coloraLezioni si ferma, dice di finire prima il cambio d\'orario e non tocca niente' +
        (fermo6 ? '' : ' (invece ha colorato)'),
        /cambio d'orario a meta'/.test(fermo6) && /ORARI_5_cambioOrario/.test(fermo6) && /ORARI_6_coloraLezioni/.test(fermo6) &&
        scritture === scrittePrima && proprieta.get(PROGRESSO_CALENDARIO) === lavoroPrima &&
        ripresaDi('ORARI_5_cambioOrario').length === 1 && !proprieta.has(PROGRESSO_COLORI) &&
        ripresaDi('ORARI_6_coloraLezioni').length === 0);
      riprendiFinoInFondo('ORARI_5_cambioOrario');
      const quelGiorno = calM.getEvents(quandoM, new Date(quandoM.getTime() + 60 * 1000)).filter(nostro);
      verifica('  ...e ripreso il cambio, la lezione colorata a mano c\'e\' una volta sola, con il suo colore (' +
        quelGiorno.length + (quelGiorno.length ? ', ' + quelGiorno.map(e => e.getColor()).join(', ') : '') + ')',
        !proprieta.has(PROGRESSO_CALENDARIO) && quelGiorno.length === 1 && quelGiorno[0].getColor() === suoM &&
        uguali(lezioniSul(calM, primoGiorno, giornoPrima), primaM));
    }
    // ORARI_4_calendario a meta': anche le serie che aspettano il contrassegno non si toccano
    azzeraCalendario();
    conColori(coloriProva);
    sogliaCalendario = 5;
    contesto.ORARI_4_calendario();
    sogliaCalendario = Infinity;
    orologio = 0;
    const scritte4 = scritture;
    const fermo4 = errore(() => contesto.ORARI_6_coloraLezioni());
    verifica('con ORARI_4_calendario a meta\' ORARI_6_coloraLezioni si ferma, dice di finirlo e non tocca niente',
      /ORARI_4_calendario e' ancora a meta'/.test(fermo4) && /ORARI_6_coloraLezioni/.test(fermo4) &&
      scritture === scritte4 && proprieta.has(PROGRESSO_CALENDARIO) && ripresaDi('ORARI_4_calendario').length === 1 &&
      !proprieta.has(PROGRESSO_COLORI));
    riprendiFinoInFondo('ORARI_4_calendario');
    verifica('  ...e l\'orario si finisce come sempre, con i colori delle classi',
      !proprieta.has(PROGRESSO_CALENDARIO) && vive(calendari[0]).length === piano.tratti.length &&
      coloriSbagliati(calendari[0], coloriProva).length === 0);
    // una ripresa di ORARI_6_coloraLezioni che trova un cambio d'orario a meta'
    // (eseguito mentre lei aspettava): si ferma, e il suo lavoro resta per dopo
    daRicolorare();
    coloriAMeta(2);
    const coloriSalvati = proprieta.get(PROGRESSO_COLORI);
    docOriginale.celle = ruotata(celleOriginali);
    sogliaCalendario = 5;
    contesto.ORARI_5_cambioOrario();
    sogliaCalendario = Infinity;
    orologio = 0;
    const scritteR = scritture;
    const ripresa6 = errore(() => contesto.ORARI_6_coloraLezioni({ triggerUid: 'ripresa dei colori' }));
    verifica('una ripresa di ORARI_6_coloraLezioni con un cambio d\'orario a meta\' si ferma senza colorare, e il ' +
      'suo lavoro resta per quando il cambio e\' finito',
      /cambio d'orario a meta'/.test(ripresa6) && scritture === scritteR && proprieta.get(PROGRESSO_COLORI) === coloriSalvati &&
      ripresaDi('ORARI_6_coloraLezioni').length === 0 && proprieta.has(PROGRESSO_CALENDARIO));
    riprendiFinoInFondo('ORARI_5_cambioOrario');
    contesto.ORARI_6_coloraLezioni();
    verifica('  ...e finito il cambio, rieseguita finisce il suo lavoro',
      !proprieta.has(PROGRESSO_CALENDARIO) && !proprieta.has(PROGRESSO_COLORI) &&
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));
    docOriginale.celle = celleOriginali.slice();
  }
  azzeraCalendario();
  conColori(coloriDati);
  contesto.ORARI.calendario = calendarioDati;

  // --- i colloqui con le famiglie ---------------------------------------------
  // ORARI_4_calendario mette, dopo le lezioni, i colloqui di DatiOrari.gs
  // (calendario.colloqui): il ricevimento di ogni settimana a tratti, come le
  // lezioni (niente nei giorni senza lezione e in quelli senza colloqui), le
  // giornate singole come eventi singoli, con il link del Meet come luogo.
  // Qui i colloqui sono inventati, con link inventati; quelli dei dati (se ci
  // sono) li ha messi da parte l'inizio, e li prova l'ultima sezione
  const LINK_A = 'https://meet.google.com/abc-defg-hij';
  const LINK_B = 'https://meet.google.com/kmn-pqrs-tuv';
  const LINK_C = 'https://meet.google.com/wxy-zabc-def';
  const colloquiProva = {
    settimanali: [
      // il giovedi' per tutto il periodo
      { giorno: 'giovedi', dalle: '10:10', alle: '11:10', dal: '', al: '', nome: 'Ricevimento', link: LINK_A },
      // il martedi' pomeriggio solo fra gennaio e febbraio, senza link: il 16 febbraio e' Carnevale
      { giorno: 'martedi', dalle: '15:00', alle: '15:30', dal: '2027-01-12', al: '2027-02-23',
        nome: 'Ricevimento pomeridiano', link: '' }
    ],
    singoli: [
      // dentro il periodo senza colloqui: una giornata scritta apposta c'e' lo stesso
      { data: '2026-12-15', dalle: '15:00', alle: '18:00', nome: 'Colloqui generali', link: LINK_B },
      { data: '2027-04-13', dalle: '15:00', alle: '18:00', nome: 'Colloqui generali', link: LINK_B },
      // l'anno scorso: fuori dal periodo, non si mette
      { data: '2025-12-16', dalle: '15:00', alle: '18:00', nome: 'Colloqui dell\'anno scorso', link: LINK_B }
    ],
    sospensioni: [{ dal: '2026-12-10', al: '2027-01-09' }, { dal: '2027-05-15', al: '2027-06-10' }]
  };
  // i colloqui cambiati: il ricevimento passa al venerdi' con un altro link,
  // la giornata di aprile va via e ne arriva una a marzo
  const colloquiNuovi = {
    settimanali: [
      { giorno: 'venerdi', dalle: '11:10', alle: '12:10', dal: '', al: '', nome: 'Ricevimento', link: LINK_C },
      colloquiProva.settimanali[1]
    ],
    singoli: [colloquiProva.singoli[0],
              { data: '2027-03-10', dalle: '16:00', alle: '19:00', nome: 'Colloqui di marzo', link: LINK_B }],
    sospensioni: colloquiProva.sospensioni
  };
  /** Mette in DatiOrari.gs questi colloqui e questo colore dei colloqui (di partenza Banana, "5"). */
  const conColloqui = (k, colore) => {
    contesto.ORARI.calendario = Object.assign({}, calendarioDati, { colloqui: k,
      coloreColloqui: (colore === undefined) ? '5' : colore });
  };
  /** Di Campanella: con il contrassegno delle lezioni o dei colloqui, o con la descrizione. */
  const diCampanella = e => ['orario', 'colloquio'].indexOf(e.getTag('campanella')) >= 0 ||
    String(e.getDescription() || '').indexOf('[Campanella]') === 0;
  /** Un colloquio: dal contrassegno, o senza dalla descrizione. */
  const diColloquio = e => (e.getTag('campanella') ? e.getTag('campanella') === 'colloquio'
    : String(e.getDescription() || '').indexOf('[Campanella] Colloqui') === 0);
  /** Le lezioni di Campanella (senza i colloqui), come lezioniSul. */
  function soloLezioniSul(calX, da, a) {
    const fine = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59, 59);
    return calX.getEvents(da, fine).filter(e => diCampanella(e) && !diColloquio(e))
      .map(e => chiave(e.getStartTime()) + ' ' + ora(minutiDi(e.getStartTime())) + '-' +
                ora(minutiDi(e.getEndTime())) + ' ' + e.getTitle())
      .sort();
  }
  /** I colloqui sul calendario, dal giorno al giorno compresi: "aaaa-mm-gg hh:mm-hh:mm nome|luogo", in ordine. */
  function colloquiSul(calX, da, a) {
    const fine = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59, 59);
    return calX.getEvents(da, fine).filter(e => diCampanella(e) && diColloquio(e))
      .map(e => chiave(e.getStartTime()) + ' ' + ora(minutiDi(e.getStartTime())) + '-' +
                ora(minutiDi(e.getEndTime())) + ' ' + e.getTitle() + '|' + e.getLocation())
      .sort();
  }
  /**
   * I colloqui attesi dal giorno dal, ricavati qui senza guardare lo script,
   * nella forma di colloquiSul, e quante serie (tratti) per il ricevimento.
   */
  function colloquiAttesi(k, dal) {
    const incontri = [];
    let tratti = 0;
    const fermi = (k.sospensioni || []).map(s => ({ dal: s.dal, al: s.al || s.dal }));
    const fermo = g => fermi.some(s => s.dal <= g && g <= s.al);
    for (const w of k.settimanali || []) {
      const gs = giornoSettimana(w.giorno);
      let t = w.dal ? dataDa(w.dal) : primoGiorno;
      if (t < dal) t = dal;
      t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      const fine = (w.al && dataDa(w.al) < ultimoGiorno) ? dataDa(w.al) : ultimoGiorno;
      while (t.getDay() !== gs) t = giorniDopo(t, 1);
      let aperto = false;
      for (; t <= fine; t = giorniDopo(t, 7)) {
        const g = chiave(t);
        if (sospeso(g) || fermo(g)) { aperto = false; continue; }
        if (!aperto) { tratti++; aperto = true; }
        incontri.push(g + ' ' + w.dalle + '-' + w.alle + ' ' + w.nome + '|' + (w.link || ''));
      }
    }
    for (const u of k.singoli || []) {
      if (u.data < c.inizio || u.data > c.fine || u.data < chiave(dal)) continue;
      incontri.push(u.data + ' ' + u.dalle + '-' + u.alle + ' ' + u.nome + '|' + (u.link || ''));
    }
    return { incontri: incontri.sort(), tratti };
  }
  const serieColloqui = calX => vive(calX).filter(s => s.getTag('campanella') === 'colloquio');
  const giornateColloqui = calX => calX.eventi.filter(e => !e.cancellato && e.getTag('campanella') === 'colloquio');

  intestazione('COLLOQUI CON LE FAMIGLIE');
  {
    azzeraCalendario();
    oggiFinto = null;
    conColloqui(colloquiProva);
    const attesi = colloquiAttesi(colloquiProva, primoGiorno);
    verifica('i colloqui di prova provano i casi: il martedi\' di Carnevale e i giovedi\' senza colloqui saltati, la ' +
      'giornata di dicembre dentro il periodo senza colloqui, quella dell\'anno scorso fuori (' + attesi.incontri.length +
      ' incontri, ' + attesi.tratti + ' serie)',
      !attesi.incontri.some(x => /^2027-02-16 /.test(x)) && attesi.incontri.some(x => /^2027-02-09 15:00/.test(x)) &&
      !attesi.incontri.some(x => /^2026-12-17 /.test(x) || /^2027-05-20 /.test(x)) &&
      attesi.incontri.some(x => /^2026-12-03 10:10/.test(x)) && attesi.incontri.some(x => /^2026-12-15 15:00/.test(x)) &&
      !attesi.incontri.some(x => /^2025-/.test(x)) && attesi.tratti === 4);
    const anteprima = contesto.ORARI_1_anteprima();
    verifica('ORARI_1_anteprima dice i colloqui che ORARI_4_calendario mettera\', quello fuori dal periodo e il loro colore',
      new RegExp('Colloqui da mettere con ORARI_4_calendario: 2 ricevimenti settimanali \\(' + attesi.tratti + ' serie, ' +
        (attesi.incontri.length - 2) + ' incontri\\), 2 giornate singole').test(anteprima) &&
      /1 giornata fuori dal periodo/.test(anteprima) && /Colore dei colloqui: Banana/.test(anteprima));
    const esito = contesto.ORARI_4_calendario();
    console.log(esito);
    const calC = calendari[0];
    verifica('ORARI_4_calendario mette le lezioni come senza colloqui (' + piano.lezioni.length + ')',
      uguali(soloLezioniSul(calC, primoGiorno, ultimoGiorno), piano.lezioni) &&
      vive(calC).filter(s => s.getTag('campanella') === 'orario').length === piano.tratti.length);
    const messi = colloquiSul(calC, primoGiorno, ultimoGiorno);
    verifica('e i colloqui del piano, giorno, ora, nome e link, non uno di piu\' (' + messi.length + ' su ' +
      attesi.incontri.length + ')', uguali(messi, attesi.incontri));
    const serie = serieColloqui(calC), giornate = giornateColloqui(calC);
    verifica('il ricevimento e\' a tratti: una serie per tratto di settimane (' + serie.length + '), ogni settimana fino ' +
      'all\'ultimo incontro alle 23:59:59, con il contrassegno dei colloqui',
      serie.length === attesi.tratti && serie.every(s => !!s.ricorrenza && s.ricorrenza.weekly &&
        s.ricorrenza.until.getHours() === 23 && s.ricorrenza.until.getMinutes() === 59 &&
        s.ricorrenza.until.getSeconds() === 59 && s.fuso === FUSO_BANCO));
    verifica('le giornate singole sono eventi singoli con il contrassegno dei colloqui (2), anche quella dentro il periodo ' +
      'senza colloqui; quella dell\'anno scorso no',
      giornate.length === 2 && giornate.some(e => chiave(e.inizio) === '2026-12-15') &&
      !calC.eventi.some(e => chiave(e.inizio) === '2025-12-16'));
    verifica('il luogo e\' il link del Meet (senza link, nessun luogo); la descrizione comincia con [Campanella] Colloqui ' +
      'e dice il link; il titolo e\' il nome',
      serie.concat(giornate).every(x => String(x.getDescription()).indexOf('[Campanella] Colloqui') === 0 &&
        (x.getLocation() === '' || String(x.getDescription()).indexOf(x.getLocation()) > 0)) &&
      serie.filter(s => s.titolo === 'Ricevimento').every(s => s.getLocation() === LINK_A) &&
      serie.filter(s => s.titolo === 'Ricevimento pomeridiano').every(s => s.getLocation() === '') &&
      giornate.every(e => e.getLocation() === LINK_B && e.titolo === 'Colloqui generali'));
    verifica('i colloqui hanno il colore dei colloqui (Banana)', serie.concat(giornate).every(x => x.getColor() === '5'));
    verifica('il messaggio dice i colloqui messi, di ORARI_7_colloqui e che le prenotazioni restano nel registro',
      new RegExp('Colloqui messi: 2 ricevimenti settimanali \\(' + attesi.tratti + ' serie').test(esito) &&
      /ORARI_7_colloqui/.test(esito) && /registro elettronico/.test(esito));
    const seconda = errore(() => contesto.ORARI_4_calendario());
    verifica('rieseguito si ferma, anche per i colloqui, senza raddoppiarli',
      /gia' \d+ serie/.test(seconda) && uguali(colloquiSul(calC, primoGiorno, ultimoGiorno), attesi.incontri));
    const altrui = calC.createEvent('Colloquio con la dirigente', new Date(2026, 10, 12, 15, 0), new Date(2026, 10, 12, 16, 0));
    contesto.ORARI_ANNULLA_calendario();
    verifica('ORARI_ANNULLA_calendario toglie anche i colloqui, serie e giornate, e lascia gli altri eventi',
      serie.every(s => s.cancellata) && giornate.every(e => e.cancellato) &&
      colloquiSul(calC, primoGiorno, ultimoGiorno).length === 0 && !altrui.cancellato);

    // i colloqui che Google non contrassegna (un limite proprio sul contrassegno):
    // la ripresa lo rimette, alla serie e alla giornata singola, senza doppioni
    for (const titolo of ['Ricevimento', 'Colloqui generali']) {
      azzeraCalendario();
      conColloqui(colloquiProva);
      guasti([{ op: 'setTag', alla: 1, su: x => x.titolo === titolo,
                messaggio: 'Service invoked too many times in a short time: calendar.' }]);
      const fermo = contesto.ORARI_4_calendario();
      guasti([]);
      const calG = calendari[0];
      const senza = serieColloqui(calG).length + giornateColloqui(calG).length;
      riprendiFinoInFondo('ORARI_4_calendario');
      verifica('Google non salva il contrassegno di "' + titolo + '": la ripresa glielo rimette, senza doppioni',
        /fra un minuto/.test(fermo) && senza < attesi.tratti + 2 &&
        serieColloqui(calG).length === attesi.tratti && giornateColloqui(calG).length === 2 &&
        uguali(colloquiSul(calG, primoGiorno, ultimoGiorno), attesi.incontri) && !proprieta.has(PROGRESSO_CALENDARIO));
    }

    // dati sbagliati (un DatiOrari.gs cambiato a mano): si ferma prima di toccare il calendario
    const sbagliati = [
      [{ settimanali: [{ giorno: 'giovedi', dalle: '11:10', alle: '10:10', nome: 'x', link: LINK_A }] },
       'ricevimento settimanale numero 1 non ha le ore giuste'],
      [{ settimanali: [{ giorno: 'giovedi', dalle: '10:10', alle: '11:10', nome: 'x', link: 'javascript:alert(1)' }] },
       'non e\' un indirizzo https://'],
      [{ settimanali: [{ giorno: 'ognigiorno', dalle: '10:10', alle: '11:10', nome: 'x', link: '' }] },
       'ricevimento settimanale numero 1 non si capisce'],
      [{ singoli: [{ data: '15/12/2026', dalle: '15:00', alle: '18:00', nome: 'x', link: '' }] },
       'giornata di colloqui numero 1 non ha una data'],
      [{ sospensioni: [{ dal: '2027-01-09', al: '2026-12-10' }] }, 'periodo senza colloqui numero 1 non si capisce']
    ];
    for (const [k, attesa] of sbagliati) {
      azzeraCalendario();
      conColloqui(k);
      const detto = errore(() => contesto.ORARI_4_calendario());
      verifica('con dati sbagliati si ferma prima di toccare il calendario e dice di rigenerare DatiOrari.gs ("' +
        attesa + '")', detto.indexOf(attesa) >= 0 && /rigenera/.test(detto) && calendari.length === 0);
    }
    // un link scritto "Https://" (Campanella lo capisce): vale, con lo schema in
    // minuscolo, e non ferma le lezioni
    azzeraCalendario();
    conColloqui({ settimanali: [{ giorno: 'giovedi', dalle: '10:10', alle: '11:10', dal: '', al: '', nome: 'Ricevimento',
                                  link: 'Https://meet.google.com/abc-defg-hij' }] });
    const conMaiuscola = errore(() => contesto.ORARI_4_calendario());
    const calH = calendari[0];
    verifica('un link "Https://meet.google.com/..." vale: le lezioni e il ricevimento ci sono, con il link in minuscolo ' +
      'come luogo e nella descrizione' + (conMaiuscola ? ' (invece: ' + conMaiuscola + ')' : ''),
      conMaiuscola === '' && !!calH && uguali(soloLezioniSul(calH, primoGiorno, ultimoGiorno), piano.lezioni) &&
      serieColloqui(calH).length > 0 && serieColloqui(calH).every(s => s.getLocation() === LINK_A &&
        String(s.getDescription()).indexOf(LINK_A) > 0));
    // l'orario messo senza colloqui (anche con la 1.5), poi i colloqui scritti:
    // ORARI_4_calendario rieseguito si ferma e dice, per primo, di ORARI_7_colloqui,
    // che li mette da oggi senza toccare le lezioni
    azzeraCalendario();
    contesto.ORARI.calendario = calendarioDati;
    contesto.ORARI_4_calendario();
    const calSenza = calendari[0];
    const lezioniSenza = soloLezioniSul(calSenza, primoGiorno, ultimoGiorno);
    conColloqui(colloquiProva);
    const primaDiRimettere = scritture;
    const rimettere = errore(() => contesto.ORARI_4_calendario());
    verifica('orario gia\' messo e colloqui aggiunti dopo: ORARI_4_calendario si ferma, non tocca niente e dice per ' +
      'primo di eseguire ORARI_7_colloqui',
      /gia' \d+ serie/.test(rimettere) && scritture === primaDiRimettere && colloquiSul(calSenza, primoGiorno, ultimoGiorno).length === 0 &&
      /solo aggiunto o cambiato i colloqui con le famiglie, esegui ORARI_7_colloqui/.test(rimettere) &&
      rimettere.indexOf('ORARI_7_colloqui') < rimettere.indexOf('ORARI_5_cambioOrario'));
    oggiFinto = new Date(2027, 0, 20, 9, 30);
    contesto.ORARI_7_colloqui();
    const daOggi = colloquiAttesi(colloquiProva, new Date(2027, 0, 20));
    verifica('  ...e ORARI_7_colloqui li mette da oggi, con le lezioni com\'erano',
      uguali(soloLezioniSul(calSenza, primoGiorno, ultimoGiorno), lezioniSenza) &&
      uguali(colloquiSul(calSenza, primoGiorno, ultimoGiorno), daOggi.incontri));
    oggiFinto = null;
    azzeraCalendario();
    conColloqui(colloquiProva);
  }

  intestazione('COLLOQUI: ORARI_7_COLLOQUI');
  {
    const OGGI = '2027-01-20';                  // un mercoledi'
    const oggi = dataDa(OGGI), ieri = giorniDopo(oggi, -1);
    azzeraCalendario();
    conColloqui(colloquiProva);
    contesto.ORARI_4_calendario();
    const cal7 = calendari[0];
    oggiFinto = new Date(2027, 0, 20, 9, 30);
    // a mano, prima di oggi: il primo incontro del secondo tratto del giovedi'
    // (14 gennaio) spostato al venerdi'; dopo oggi, una copia fatta a mano
    const giovedi = serieColloqui(cal7).find(s => s.titolo === 'Ricevimento' && chiave(s.inizio) === '2027-01-14');
    giovedi.sposta(0, new Date(2027, 0, 15, 12, 0), new Date(2027, 0, 15, 13, 0));
    const copia = cal7.createEvent('Colloquio straordinario', new Date(2027, 1, 3, 16, 0), new Date(2027, 1, 3, 17, 0),
      { description: '[Campanella] Colloqui con le famiglie, copiato a mano' });
    const lezioni = soloLezioniSul(cal7, primoGiorno, ultimoGiorno);
    const serieLezioni = vive(cal7).filter(s => s.getTag('campanella') === 'orario');
    const primaDiOggi = colloquiSul(cal7, primoGiorno, ieri);
    const nuovi = colloquiAttesi(colloquiNuovi, oggi);
    verifica('prima di oggi c\'e\' l\'incontro spostato a mano, e il giovedi\' ha incontri prima e dopo oggi',
      primaDiOggi.indexOf('2027-01-15 12:00-13:00 Ricevimento|' + LINK_A) >= 0 && !!giovedi &&
      chiave(giovedi.ricorrenza.until) > OGGI);
    conColloqui(colloquiNuovi);
    const esito = contesto.ORARI_7_colloqui();
    console.log(esito);
    verifica('le lezioni restano tutte come sono (' + lezioni.length + '): nessuna serie dell\'orario rifatta o tolta',
      uguali(soloLezioniSul(cal7, primoGiorno, ultimoGiorno), lezioni) && serieLezioni.every(s => !s.cancellata) &&
      vive(cal7).filter(s => s.getTag('campanella') === 'orario').length === serieLezioni.length);
    verifica('i colloqui prima di oggi restano come erano, anche l\'incontro spostato a mano (' + primaDiOggi.length + ')',
      uguali(colloquiSul(cal7, primoGiorno, ieri), primaDiOggi));
    verifica('da oggi ci sono proprio i colloqui nuovi (' + nuovi.incontri.length + '), e la copia fatta a mano',
      uguali(colloquiSul(cal7, oggi, ultimoGiorno).filter(x => x.indexOf('Colloquio straordinario') < 0), nuovi.incontri) &&
      !copia.cancellato);
    const rimesso = cal7.eventi.find(e => !e.cancellato && chiave(e.inizio) === '2027-01-15');
    verifica('l\'incontro spostato torna come evento singolo alla sua ora, con il contrassegno dei colloqui e quello ' +
      'che dice che cosa sostituisce, senza la classe',
      !!rimesso && rimesso.getTag('campanella') === 'colloquio' && !!rimesso.getTag('campanella_sostituisce') &&
      !rimesso.getTag('campanella_classe') && rimesso.getLocation() === LINK_A && giovedi.cancellata);
    verifica('i ricevimenti rifatti fino a ieri hanno il contrassegno dei colloqui e il loro colore',
      serieColloqui(cal7).filter(s => s.getTag('campanella_sostituisce')).length === 1 &&
      serieColloqui(cal7).concat(giornateColloqui(cal7)).every(x => x.getColor() === '5'));
    // rifatti: il giovedi' (con il solo incontro spostato, rimesso da solo) e il
    // martedi' fino a ieri; tolto: il secondo tratto del martedi', tutto dopo oggi
    verifica('il messaggio dice da quando, quanti ricevimenti ha rifatto fino a ieri (2) e tolto (1), quante giornate ' +
      'ha tolto (1), la copia a mano e che le lezioni non le ha toccate',
      /Colloqui aggiornati dal 2027-01-20/.test(esito) &&
      numero(/rifatti fino al 2027-01-19[^:]*: (\d+)/, esito) === 2 &&
      numero(/Ricevimenti di prima tolti[^:]*: (\d+)/, esito) === 1 &&
      numero(/Giornate di colloqui tolte[^:]*: (\d+)/, esito) === 1 &&
      /senza contrassegno/.test(esito) && esito.indexOf('Colloquio straordinario') >= 0 &&
      /lezioni non le ho toccate/.test(esito) && /registro elettronico/.test(esito));
    verifica('lavoro finito: niente a meta\', nessuna ripresa', !salvato() && ripresaDi('ORARI_7_colloqui').length === 0);
    const dopo = colloquiSul(cal7, primoGiorno, ultimoGiorno);
    contesto.ORARI_7_colloqui();
    verifica('rieseguito lo stesso giorno da\' lo stesso calendario, senza doppioni',
      uguali(colloquiSul(cal7, primoGiorno, ultimoGiorno), dopo) && senzaDoppioni(cal7) &&
      uguali(soloLezioniSul(cal7, primoGiorno, ultimoGiorno), lezioni));
    // il giorno dopo, con gli stessi dati: niente cambia
    oggiFinto = new Date(2027, 0, 21, 8, 0);
    contesto.ORARI_7_colloqui();
    verifica('  ...e anche il giorno dopo', uguali(colloquiSul(cal7, primoGiorno, ultimoGiorno), dopo) &&
      uguali(soloLezioniSul(cal7, primoGiorno, ultimoGiorno), lezioni));
    contesto.ORARI_ANNULLA_calendario();
    verifica('ORARI_ANNULLA_calendario toglie anche i colloqui rifatti e quelli rimessi come eventi singoli',
      colloquiSul(cal7, primoGiorno, ultimoGiorno).filter(x => x.indexOf('Colloquio straordinario') < 0).length === 0 &&
      soloLezioniSul(cal7, primoGiorno, ultimoGiorno).length === 0);

    // interrotto dal tempo massimo, e ripreso dopo la mezzanotte: finisce il
    // lavoro del giorno in cui era cominciato
    azzeraCalendario();
    oggiFinto = new Date(2027, 0, 20, 23, 50);
    conColloqui(colloquiProva);
    contesto.ORARI_4_calendario();
    const calR = calendari[0];
    const attesoR = colloquiSul(calR, primoGiorno, ieri).concat(nuovi.incontri).sort();
    conColloqui(colloquiNuovi);
    sogliaCalendario = 2;
    const parziale = contesto.ORARI_7_colloqui();
    sogliaCalendario = Infinity;
    verifica('al tempo massimo si ferma, si ricorda il giorno e riprende da solo fra un minuto',
      /Tempo massimo/.test(parziale) && ripresaDi('ORARI_7_colloqui').length === 1 && !!salvato() &&
      salvato().funzione === 'ORARI_7_colloqui' && salvato().validoDal === OGGI);
    // con il lavoro a meta' le altre funzioni del calendario si fermano e lo dicono
    const quattro = errore(() => contesto.ORARI_4_calendario());
    const cinque = errore(() => contesto.ORARI_5_cambioOrario());
    const sei = errore(() => contesto.ORARI_6_coloraLezioni());
    verifica('con l\'aggiornamento dei colloqui a meta\' ORARI_4, ORARI_5 e ORARI_6 si fermano e nominano ORARI_7_colloqui',
      [quattro, cinque, sei].every(t => /aggiornamento dei colloqui a meta'/.test(t) && /ORARI_7_colloqui/.test(t)) &&
      salvato().funzione === 'ORARI_7_colloqui');
    lockOccupato = true;
    const scritte = scritture;
    const occupato = contesto.ORARI_7_colloqui({ triggerUid: 'ripresa col blocco preso' });
    lockOccupato = false;
    verifica('una ripresa con il blocco occupato non tocca niente e si riprogramma',
      /in corso/.test(occupato) && scritture === scritte && ripresaDi('ORARI_7_colloqui').length === 1);
    oggiFinto = new Date(2027, 0, 21, 0, 30);
    orologio = 0;
    const giri = riprendiFinoInFondo('ORARI_7_colloqui');
    verifica('riprendendo dopo la mezzanotte finisce il lavoro del 20 gennaio, senza doppioni (' + giri + ' riprese)',
      uguali(colloquiSul(calR, primoGiorno, ultimoGiorno), attesoR) && senzaDoppioni(calR) &&
      uguali(soloLezioniSul(calR, primoGiorno, ultimoGiorno), piano.lezioni) && !salvato() &&
      ripresaDi('ORARI_7_colloqui').length === 0);

    // DatiOrari.gs cambiato a meta': dimentica il lavoro e dice di rieseguirlo
    azzeraCalendario();
    oggiFinto = new Date(2027, 0, 20, 9, 30);
    conColloqui(colloquiProva);
    contesto.ORARI_4_calendario();
    const calD = calendari[0];
    conColloqui(colloquiNuovi);
    sogliaCalendario = 2;
    contesto.ORARI_7_colloqui();
    sogliaCalendario = Infinity;
    orologio = 0;
    conColloqui(colloquiProva);
    const cambiato = errore(() => contesto.ORARI_7_colloqui({ triggerUid: 'ripresa' }));
    verifica('con i colloqui cambiati a meta\' la ripresa si ferma, dimentica il lavoro e dice di rieseguire ORARI_7_colloqui',
      /cambiato a meta'/.test(cambiato) && /Riesegui ORARI_7_colloqui/.test(cambiato) && !salvato() &&
      ripresaDi('ORARI_7_colloqui').length === 0);
    contesto.ORARI_7_colloqui();
    const tornati = colloquiAttesi(colloquiProva, oggi).incontri;
    verifica('  ...e rieseguito mette i colloqui di adesso da oggi, senza doppioni',
      uguali(colloquiSul(calD, oggi, ultimoGiorno), tornati) && senzaDoppioni(calD));

    // ORARI_ANNULLA_calendario con l'aggiornamento a meta': toglie la ripresa e dimentica
    conColloqui(colloquiNuovi);
    sogliaCalendario = 2;
    contesto.ORARI_7_colloqui();
    sogliaCalendario = Infinity;
    orologio = 0;
    contesto.ORARI_ANNULLA_calendario();
    verifica('ORARI_ANNULLA_calendario dimentica l\'aggiornamento a meta\' e ne toglie la ripresa',
      !salvato() && ripresaDi('ORARI_7_colloqui').length === 0 &&
      colloquiSul(calD, primoGiorno, ultimoGiorno).length === 0);

    // i casi limite: senza calendario, dopo la fine del periodo, prima dell'inizio
    azzeraCalendario();
    const senzaCal = errore(() => contesto.ORARI_7_colloqui());
    verifica('senza il calendario si ferma e dice di eseguire ORARI_4_calendario',
      /nessun calendario/.test(senzaCal) && /ORARI_4_calendario/.test(senzaCal) && calendari.length === 0);
    conColloqui(colloquiProva);
    contesto.ORARI_4_calendario();
    const calL = calendari[0];
    const tutti = colloquiSul(calL, primoGiorno, ultimoGiorno);
    conColloqui(colloquiNuovi);
    oggiFinto = new Date(2027, 6, 1, 9, 0);
    const scritteFine = scritture;
    const finito = errore(() => contesto.ORARI_7_colloqui());
    verifica('dopo la fine del periodo non tocca niente e lo dice',
      /e' finito/.test(finito) && scritture === scritteFine && uguali(colloquiSul(calL, primoGiorno, ultimoGiorno), tutti));
    oggiFinto = new Date(2026, 7, 20, 9, 0);
    contesto.ORARI_7_colloqui();
    verifica('prima dell\'inizio del periodo li aggiorna tutti, dall\'inizio, e le lezioni restano',
      uguali(colloquiSul(calL, primoGiorno, ultimoGiorno), colloquiAttesi(colloquiNuovi, primoGiorno).incontri) &&
      uguali(soloLezioniSul(calL, primoGiorno, ultimoGiorno), piano.lezioni));
    oggiFinto = null;
  }

  intestazione('COLLOQUI: CAMBIO D\'ORARIO E COLORI');
  {
    if (validoDal) {
      // ORARI_5_cambioOrario tratta i colloqui come le lezioni: rifa' le
      // settimane prima del cambio e dal cambio mette quelli dei dati
      azzeraCalendario();
      conColloqui(colloquiProva);
      contesto.ORARI_4_calendario();
      const calC = calendari[0];
      const primaDelCambio = colloquiSul(calC, primoGiorno, giornoPrima);
      docOriginale.celle = ruotata(celleOriginali);
      conColloqui(colloquiNuovi);
      const esito = contesto.ORARI_5_cambioOrario();
      console.log(esito);
      const nuoviDalCambio = colloquiAttesi(colloquiNuovi, vd).incontri;
      verifica('nel cambio d\'orario i colloqui prima del ' + validoDal + ' restano come erano (' + primaDelCambio.length +
        '), e dal ' + validoDal + ' ci sono quelli nuovi (' + nuoviDalCambio.length + ')',
        uguali(colloquiSul(calC, primoGiorno, giornoPrima), primaDelCambio) &&
        uguali(colloquiSul(calC, vd, ultimoGiorno), nuoviDalCambio));
      verifica('  ...e le lezioni sono quelle del cambio', uguali(soloLezioniSul(calC, primoGiorno, ultimoGiorno), attesoDopoCambio));
      verifica('  ...e il messaggio dice i colloqui dal giorno del cambio',
        new RegExp('Colloqui dal ' + validoDal + ': 2 ricevimenti settimanali').test(esito));
      // e ORARI_6_coloraLezioni da' ai colloqui il colore dei colloqui, alle lezioni quello delle classi
      conColloqui(colloquiNuovi, '7');
      const colorate = contesto.ORARI_6_coloraLezioni();
      verifica('ORARI_6_coloraLezioni da\' a tutti i colloqui il colore dei colloqui nuovo (Pavone), e alle lezioni ' +
        'lascia quello della loro classe',
        serieColloqui(calC).concat(giornateColloqui(calC)).every(x => x.getColor() === '7') &&
        vive(calC).filter(s => s.getTag('campanella') === 'orario' && !s.getTag('campanella_sostituisce'))
          .every(s => s.getColor() === atteso(coloriDati, s.titolo)) && /Colorati adesso/.test(colorate));
      // senza colore dei colloqui li lascia come sono, e lo dice
      conColloqui(colloquiNuovi, '');
      const senzaColore = contesto.ORARI_6_coloraLezioni();
      verifica('  ...e senza un colore dei colloqui li lascia come sono, e lo dice',
        serieColloqui(calC).concat(giornateColloqui(calC)).every(x => x.getColor() === '7') &&
        /lasciati come sono: \d+ \([^)]*Colloqui/.test(senzaColore));
      docOriginale.celle = celleOriginali.slice();
    } else {
      verifica('i dati hanno la data del cambio d\'orario (serve a questa sezione)', false);
    }
    // i colloqui dei dati (generati da Campanella, in test/prova_orario.ps1): vanno sul calendario come dice il piano
    if (colloquiDeiDati) {
      azzeraCalendario();
      conColloqui(colloquiDeiDati, coloreColloquiDeiDati);
      contesto.ORARI_4_calendario();
      const attesiDati = colloquiAttesi(colloquiDeiDati, primoGiorno);
      // test/prova_orario.ps1 confronta questi numeri con quelli di Campanella
      console.log('  COLLOQUI: ' + serieColloqui(calendari[0]).length + ' serie, ' + giornateColloqui(calendari[0]).length +
        ' giornate, ' + colloquiSul(calendari[0], primoGiorno, ultimoGiorno).length + ' incontri');
      verifica('i colloqui di DatiOrari.gs vanno sul calendario come dice il piano (' + attesiDati.incontri.length + ')',
        attesiDati.incontri.length > 0 && uguali(colloquiSul(calendari[0], primoGiorno, ultimoGiorno), attesiDati.incontri) &&
        serieColloqui(calendari[0]).length === attesiDati.tratti);
    }
    oggiFinto = null;
    azzeraCalendario();
    contesto.ORARI.calendario = calendarioDati;
  }

  intestazione('ANNULLA CALENDARIO DOPO UN LAVORO A META\'');
  azzeraCalendario();
  sogliaCalendario = 5;
  contesto.ORARI_4_calendario();
  sogliaCalendario = Infinity;
  const calA = calendari[0];
  trigger.push({ fn: 'smistaNuoviMessaggi', ms: 0 }, { fn: 'ORARI_2_invia', ms: 60000 },
               { fn: 'ORARI_5_cambioOrario', ms: 60000 });
  const annullato = contesto.ORARI_ANNULLA_calendario();
  console.log(annullato);
  verifica('toglie le serie gia\' messe (' + calA.serie.length + ')', calA.serie.length === 5 && vive(calA).length === 0);
  verifica('dimentica il lavoro a meta\', e lo dice', !proprieta.has(PROGRESSO_CALENDARIO) && /a meta'/.test(annullato));
  verifica('toglie le riprese del calendario e lascia gli altri trigger',
    trigger.map(t => t.fn).sort().join(',') === 'ORARI_2_invia,smistaNuoviMessaggi');
  trigger.push({ fn: 'ORARI_4_calendario', ms: 60000 });
  const tardi = contesto.ORARI_4_calendario({ triggerUid: 'tardi' });
  verifica('una ripresa arrivata dopo l\'annullamento non rimette niente',
    /Niente da riprendere/.test(tardi) && vive(calA).length === 0 && ripresaDi('ORARI_4_calendario').length === 0);
  azzeraCalendario();
  proprieta.set(PROGRESSO_CALENDARIO, '{"funzione":"ORARI_4_calendario","fatti":3}');
  trigger.push({ fn: 'ORARI_4_calendario', ms: 60000 });
  const senzaCalendario = contesto.ORARI_ANNULLA_calendario();
  verifica('anche senza il calendario dimentica il lavoro a meta\' e toglie la ripresa',
    !proprieta.has(PROGRESSO_CALENDARIO) && trigger.length === 0 && /nessun calendario/.test(senzaCalendario));

  // con i tratti le serie sono tante: anche l'annullamento incontra i limiti
  // di Google e il tempo massimo. Si ferma dicendo quante ne ha tolte e di
  // rieseguirlo (rieseguito, ritrova solo quelle che restano)
  intestazione('ANNULLA CALENDARIO: TEMPO MASSIMO E LIMITI DI GOOGLE');
  azzeraCalendario();
  contesto.ORARI_4_calendario();
  const calZ = calendari[0];
  const tutteZ = vive(calZ).length;
  guasti([{ op: 'deleteEventSeries', alla: 4,
            messaggio: 'You have been creating or deleting too many calendars or calendar events in a short time. Please try again later.' }]);
  let esitoZ = '';
  const erroreZ = errore(() => { esitoZ = contesto.ORARI_ANNULLA_calendario(); });
  console.log(esitoZ || erroreZ);
  verifica('un limite di Google mentre toglie: si ferma senza l\'errore grezzo, dice quante ne ha tolte e di rieseguirlo',
    erroreZ === '' && vive(calZ).length === tutteZ - 3 && /Google/.test(esitoZ) && /3 /.test(esitoZ) &&
    /riesegui/i.test(esitoZ) && /ORARI_ANNULLA_calendario/.test(esitoZ));
  guasti([]);
  contesto.ORARI_ANNULLA_calendario();
  verifica('  ...e rieseguito toglie quelle che restano', vive(calZ).length === 0);
  guasti([{ op: 'deleteEventSeries', alla: 2, messaggio: 'Service invoked too many times for one day: calendar.' }]);
  contesto.ORARI_4_calendario();
  guasti([{ op: 'deleteEventSeries', alla: 2, messaggio: 'Service invoked too many times for one day: calendar.' }]);
  const giornoZ = errore(() => { esitoZ = contesto.ORARI_ANNULLA_calendario(); });
  verifica('finite le modifiche della giornata dice di rieseguirlo domani',
    giornoZ === '' && /domani/.test(esitoZ) && vive(calZ).length === tutteZ - 1);
  guasti([]);
  contesto.ORARI_ANNULLA_calendario();
  contesto.ORARI_4_calendario();
  scrittureDallUltimoSalto = 0;
  sogliaCalendario = 3;
  const tempoZ = contesto.ORARI_ANNULLA_calendario();
  sogliaCalendario = Infinity;
  verifica('al tempo massimo si ferma, dice quante ne ha tolte e di rieseguirlo',
    vive(calZ).length > 0 && vive(calZ).length < tutteZ && /Tempo massimo/.test(tempoZ) && /ORARI_ANNULLA_calendario/.test(tempoZ));
  orologio = 0;
  contesto.ORARI_ANNULLA_calendario();
  verifica('  ...e rieseguito finisce', vive(calZ).length === 0);
  guasti([{ op: 'deleteEventSeries', alla: 2, messaggio: 'Errore interno di prova' }]);
  contesto.ORARI_4_calendario();
  verifica('un altro errore si vede cosi\' com\'e\'', errore(() => contesto.ORARI_ANNULLA_calendario()) === 'Errore interno di prova');
  azzeraCalendario();
  attrezziCalendario = { azzeraCalendario, vive, salvato, ripresaDi, piano, errore, riprendiFinoInFondo,
                         daRicolorare, coloriAMeta, salvatoColori, coloriSbagliati, conColori, coloriDati, calendarioDati };
}

if (!SOLO_CALENDARIO) {
  intestazione('CONVIVENZA CON LA POSTA');
  // Posta e Orari si incollano nello stesso progetto: nessun nome globale in comune
  function nomiGlobali(testo) {
    const nomi = new Set();
    const re = /^(?:function\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/gm;
    let m;
    while ((m = re.exec(testo))) nomi.add(m[1] || m[2]);
    return nomi;
  }
  const nomiOrari = nomiGlobali(codice);
  const posta = fs.readFileSync(path.join(radice, 'src', 'risorse', 'Organizzazione_Gmail.gs'), 'utf8');
  const comuni = [...nomiGlobali(posta)].filter(n => nomiOrari.has(n));
  verifica('Orari.gs e Organizzazione_Gmail.gs non hanno nomi globali in comune' +
    (comuni.length ? ' (' + comuni.join(', ') + ')' : ''), comuni.length === 0);
  verifica('Orari.gs non ridefinisce CONFIG', !nomiOrari.has('CONFIG'));
  // per Apps Script una funzione che finisce con "_" e' privata: non compare
  // nel menu Esegui, dove si lancerebbe senza il lock
  const interneVisibili = [...nomiOrari].filter(n =>
    typeof contesto[n] === 'function' && !/^ORARI_/.test(n) && !/_$/.test(n));
  verifica('le funzioni interne finiscono con "_"' +
    (interneVisibili.length ? ' (non: ' + interneVisibili.join(', ') + ')' : ''), interneVisibili.length === 0);
  ['ORARI_1_anteprima', 'ORARI_2_invia', 'ORARI_3_inviaOrariClassi', 'ORARI_4_calendario',
   'ORARI_5_cambioOrario', 'ORARI_6_coloraLezioni', 'ORARI_7_colloqui', 'ORARI_ANNULLA_calendario',
   'ORARI_ANNULLA_invio'].forEach(n =>
    verifica('c\'e\' la funzione ' + n + ', citata dall\'app e dai documenti', typeof contesto[n] === 'function'));
  // ANNULLA_automazione della Posta spegne tutto il progetto, dicono documenti e
  // nota per il DPO: anche ogni ripresa degli orari (var _ORARI_TRIGGER...). Se
  // Orari.gs ne aggiunge una, qui ci se ne accorge.
  const riprese = [...codice.matchAll(/^var\s+(_ORARI_TRIGGER\w*)\s*=\s*(['"])([^'"]+)\2/gm)].map(m => m[3]);
  verifica('le riprese degli orari lette da Orari.gs (' + riprese.join(', ') + '), anche quelle del calendario e dei colori',
    riprese.length >= 6 && riprese.every(n => typeof contesto[n] === 'function') &&
    riprese.indexOf('ORARI_4_calendario') >= 0 && riprese.indexOf('ORARI_5_cambioOrario') >= 0 &&
    riprese.indexOf('ORARI_6_coloraLezioni') >= 0 && riprese.indexOf('ORARI_7_colloqui') >= 0);
  vm.runInContext(posta, contesto, { filename: 'Organizzazione_Gmail.gs' });
  trigger.length = 0;
  riprese.forEach(fn => trigger.push({ fn, ms: 60000 }));
  const spenta = contesto.ANNULLA_automazione();
  verifica('ANNULLA_automazione della Posta le toglie tutte' +
    (trigger.length ? ' (restano: ' + trigger.map(t => t.fn).join(', ') + ')' : ''), trigger.length === 0);
  verifica('e le nomina tutte', riprese.every(n => spenta.indexOf(n) >= 0));
  {
    // Un invio degli orari delle classi sta lavorando e tiene il blocco: al
    // tempo massimo riprogramma la sua ripresa e lo lascia. ANNULLA_automazione
    // deve aspettarlo e togliere anche quella ripresa, non toglierla prima.
    trigger.length = 0;
    let inCorso = true;
    const finisceLInvio = () => {
      if (!inCorso) return;
      inCorso = false;
      trigger.push({ fn: 'ORARI_3_inviaOrariClassi', ms: 60000 });
    };
    const bloccoVero = LockService.getUserLock;
    // chi aspetta il blocco (tryLock con un'attesa) lo trova libero quando l'invio finisce
    LockService.getUserLock = () => ({
      tryLock: ms => { if (inCorso && ms > 0) finisceLInvio(); return !inCorso; },
      releaseLock: () => {}
    });
    contesto.ANNULLA_automazione();
    finisceLInvio();   // se nessuno ha aspettato il blocco, l'invio finisce adesso
    LockService.getUserLock = bloccoVero;
    verifica('ANNULLA_automazione aspetta l\'invio in corso e toglie anche la ripresa che ha appena programmato' +
      (trigger.length ? ' (restano: ' + trigger.map(t => t.fn).join(', ') + ')' : ''), trigger.length === 0);

    // l'invio non finisce entro l'attesa: niente di tolto, e lo dice
    trigger.push({ fn: 'ORARI_3_inviaOrariClassi', ms: 60000 });
    lockOccupato = true;
    const occupata = contesto.ANNULLA_automazione();
    lockOccupato = false;
    verifica('con un invio che non finisce, ANNULLA_automazione non toglie niente e dice di riprovare',
      trigger.length === 1 && /riprova fra un minuto/.test(occupata) && !/spenta|Fermata/.test(occupata));
    trigger.length = 0;
  }
  {
    // Un file Classe_3B.gs nel progetto, come lo copia "Le mie classi..." della
    // Posta: un terzo file, con il suo nome globale CLASSI_STUDENTI, che nessuno
    // dei due script dichiara. La posta lo legge; gli orari, accanto, non
    // scrivono gli studenti da nessuna parte (registro, email, calendario).
    verifica('ne\' Orari.gs ne\' Organizzazione_Gmail.gs dichiarano CLASSI_STUDENTI, il nome dei file delle classi',
      !nomiOrari.has('CLASSI_STUDENTI') && !nomiGlobali(posta).has('CLASSI_STUDENTI'));
    const studenti = [];
    for (let i = 0; i < 25; i++) studenti.push('studente' + i + '.terzab@studenti.scuola-esempio.edu.it');
    vm.runInContext('var CLASSI_STUDENTI = (typeof CLASSI_STUDENTI !== \'undefined\' && CLASSI_STUDENTI) || {};\n' +
      'CLASSI_STUDENTI["3B"] = {\n  etichetta: "Classi 2026-27/3B",\n  copiato: "2026-09-20",\n  indirizzi: ' +
      JSON.stringify(studenti) + '\n};\n', contesto, { filename: 'Classe_3B.gs' });
    const file = contesto._fileDellaClasse_('3B');
    verifica('la posta, nello stesso progetto degli orari, trova il file della classe',
      contesto._classiNeiFile_().join() === '3B' && !!file && file.etichetta === 'Classi 2026-27/3B');
    const dalRegistro = registro.length;
    mandate.length = 0; proprieta.clear(); trigger.length = 0; quota = 1000;
    const detti = [contesto.ORARI_1_anteprima(), contesto.ORARI_2_invia(), contesto.ORARI_3_inviaOrariClassi()];
    let descrizioni = [];
    if (attrezziCalendario) {
      attrezziCalendario.azzeraCalendario();
      detti.push(contesto.ORARI_4_calendario());
      descrizioni = calendari.reduce((tutte, cal) => tutte.concat(cal.serie.map(s => s.titolo + ' ' + s.descrizione)), []);
      attrezziCalendario.azzeraCalendario();
    }
    detti.push(contesto.ANNULLA_automazione());
    const scritto = detti.concat(registro.slice(dalRegistro), descrizioni,
      mandate.map(m => [m.to, m.subject, m.body, m.htmlBody].join(' '))).join('\n');
    verifica('con il file della classe nel progetto gli orari lavorano come prima (' + mandate.length + ' email, ' +
      descrizioni.length + ' serie)', mandate.length > 0 && descrizioni.length > 0 && mandate.every(m => m.to === IO));
    verifica('e gli studenti non finiscono ne\' nel registro, ne\' nelle email, ne\' nel calendario',
      !/terzab@/.test(scritto));
    mandate.length = 0; proprieta.clear(); trigger.length = 0;
  }

  // Una ripresa del calendario scattata un attimo prima di ANNULLA_automazione
  // aspetta il blocco: quando lo prende, il suo trigger e' gia' stato tolto, ma
  // il punto salvato c'e' ancora. Non deve lavorare e riprogrammarsi: il punto
  // dice che il lavoro e' stato fermato. Rieseguito a mano, riparte.
  intestazione('ANNULLA_AUTOMAZIONE E UNA RIPRESA DEL CALENDARIO GIA\' PARTITA');
  if (attrezziCalendario) {
    const { azzeraCalendario, vive, salvato, ripresaDi, piano, errore, riprendiFinoInFondo } = attrezziCalendario;
    azzeraCalendario();
    sogliaCalendario = 5;
    contesto.ORARI_4_calendario();
    sogliaCalendario = Infinity;
    const calF = calendari[0];
    const spenta = contesto.ANNULLA_automazione();
    verifica('ANNULLA_automazione toglie la ripresa del calendario e segna fermato il lavoro a meta\'',
      ripresaDi('ORARI_4_calendario').length === 0 && !!salvato() && salvato().fermato === true &&
      /calendario/.test(spenta));
    const partita = contesto.ORARI_4_calendario({ triggerUid: 'gia partita' });
    verifica('la ripresa gia\' partita, preso il blocco, non lavora e non si riprogramma',
      vive(calF).length === 5 && ripresaDi('ORARI_4_calendario').length === 0 && /ANNULLA_automazione/.test(partita));
    lockOccupato = true;
    contesto.ORARI_4_calendario({ triggerUid: 'gia partita, blocco preso' });
    lockOccupato = false;
    verifica('e se trova il blocco preso non si riprogramma lo stesso', ripresaDi('ORARI_4_calendario').length === 0);
    verifica('il punto resta, per chi vuole finire', !!salvato() && salvato().fatti === 5);
    // l'altra funzione del calendario, eseguita a mano, non dice che il lavoro
    // fermato riprende da solo: dice di rieseguirlo
    const altraAMano = errore(() => contesto.ORARI_5_cambioOrario());
    verifica('ORARI_5_cambioOrario a mano con l\'orario fermato a meta\' dice che non riprende da solo, che l\'ha ' +
      'fermato ANNULLA_automazione e di rieseguire ORARI_4_calendario (invece: ' + altraAMano.slice(0, 90) + ')',
      /non riprende da solo/.test(altraAMano) && /ANNULLA_automazione/.test(altraAMano) &&
      /ORARI_4_calendario/.test(altraAMano) && /rieseguilo/.test(altraAMano) && !/fra poco/.test(altraAMano) &&
      !!salvato() && salvato().fatti === 5 && vive(calF).length === 5);
    contesto.ORARI_4_calendario();
    verifica('rieseguito a mano, finisce il lavoro da dove era arrivato',
      vive(calF).length === piano.tratti.length && !salvato() && ripresaDi('ORARI_4_calendario').length === 0);

    // e al contrario: un cambio d'orario fermato, e ORARI_4_calendario a mano
    sogliaCalendario = 4;
    contesto.ORARI_5_cambioOrario();
    sogliaCalendario = Infinity;
    contesto.ANNULLA_automazione();
    const cambioFermato = salvato();
    const quattroAMano = errore(() => contesto.ORARI_4_calendario());
    verifica('ORARI_4_calendario a mano con il cambio d\'orario fermato a meta\' dice di rieseguire ORARI_5_cambioOrario, ' +
      'non che riprende da solo', !!cambioFermato && cambioFermato.funzione === 'ORARI_5_cambioOrario' &&
      cambioFermato.fermato === true && /non riprende da solo/.test(quattroAMano) &&
      /ANNULLA_automazione/.test(quattroAMano) && /ORARI_5_cambioOrario/.test(quattroAMano) && !/fra poco/.test(quattroAMano));
    contesto.ORARI_5_cambioOrario();
    verifica('  ...e rieseguito a mano, il cambio finisce', !salvato() && ripresaDi('ORARI_5_cambioOrario').length === 0);

    // anche il limite di Google della giornata toglie la ripresa: il lavoro va
    // rieseguito, e l'altra funzione lo dice senza nominare ANNULLA_automazione
    azzeraCalendario();
    guasti([{ op: 'createEventSeries', alla: 3, messaggio: 'Service invoked too many times for one day: calendar.' }]);
    contesto.ORARI_4_calendario();
    guasti([]);
    const dopoIlGiorno = errore(() => contesto.ORARI_5_cambioOrario());
    verifica('con il lavoro fermato dal limite della giornata, l\'altra funzione dice che non riprende da solo',
      !!salvato() && ripresaDi('ORARI_4_calendario').length === 0 && /non riprende da solo/.test(dopoIlGiorno) &&
      /rieseguilo/.test(dopoIlGiorno) && !/ANNULLA_automazione/.test(dopoIlGiorno) && !/fra poco/.test(dopoIlGiorno));
    // con la ripresa programmata, invece, riprende da solo davvero
    azzeraCalendario();
    sogliaCalendario = 5;
    contesto.ORARI_4_calendario();
    sogliaCalendario = Infinity;
    const conRipresa = errore(() => contesto.ORARI_5_cambioOrario());
    verifica('  ...mentre con la ripresa programmata dice che riprende da solo fra poco',
      ripresaDi('ORARI_4_calendario').length === 1 && /riprende da solo fra poco/.test(conRipresa));
    // la ripresa parte e finisce con un errore che non e' un limite di Google:
    // il suo trigger, gia' scattato, resta fra quelli del progetto (come in
    // Google) ma non e' piu' una ripresa programmata. L'altra funzione non deve
    // dire che il lavoro riprende da solo
    guasti([{ op: 'createEventSeries', alla: 1, messaggio: 'Errore interno di prova' }]);
    const ripresaRotta = errore(() => contesto.ORARI_4_calendario({ triggerUid: 'ripresa rotta' }));
    guasti([]);
    const dopoLaRotta = errore(() => contesto.ORARI_5_cambioOrario());
    verifica('una ripresa finita con un altro errore toglie il suo trigger, e l\'altra funzione dice di rieseguire il ' +
      'lavoro (invece: ' + dopoLaRotta.slice(0, 90) + ')',
      /Errore interno di prova/.test(ripresaRotta) && !!salvato() && ripresaDi('ORARI_4_calendario').length === 0 &&
      /non riprende da solo/.test(dopoLaRotta) && /rieseguilo/.test(dopoLaRotta) && !/fra poco/.test(dopoLaRotta));
    contesto.ORARI_4_calendario();
    verifica('  ...e rieseguito a mano finisce da dove era arrivato',
      !salvato() && ripresaDi('ORARI_4_calendario').length === 0 && vive(calendari[0]).length === piano.tratti.length);

    // lo stesso per ORARI_6_coloraLezioni a meta': ANNULLA_automazione ne toglie
    // la ripresa e segna fermato il suo lavoro; una ripresa gia' partita non lo
    // riprende, rieseguita a mano lo finisce
    const { daRicolorare, coloriAMeta, salvatoColori, coloriSbagliati, conColori, coloriDati, calendarioDati } = attrezziCalendario;
    const giro = daRicolorare();
    coloriAMeta(2);
    const spenta6 = contesto.ANNULLA_automazione();
    verifica('ANNULLA_automazione toglie la ripresa di ORARI_6_coloraLezioni, segna fermato il suo lavoro e lo dice',
      ripresaDi('ORARI_6_coloraLezioni').length === 0 && !!salvatoColori() && salvatoColori().fermato === true &&
      /ORARI_6_coloraLezioni/.test(spenta6));
    const primaDellaPartita = chiamate.setColor || 0;
    const partita6 = contesto.ORARI_6_coloraLezioni({ triggerUid: 'gia partita' });
    verifica('  ...una sua ripresa gia\' partita non colora niente e non si riprogramma',
      /ANNULLA_automazione/.test(partita6) && ripresaDi('ORARI_6_coloraLezioni').length === 0 &&
      (chiamate.setColor || 0) === primaDellaPartita && !!salvatoColori() && salvatoColori().colorate === 2);
    contesto.ORARI_6_coloraLezioni();
    verifica('  ...e rieseguita a mano finisce', !salvatoColori() && coloriSbagliati(calendari[0], giro).length === 0);
    conColori(coloriDati);
    contesto.ORARI.calendario = calendarioDati;
    azzeraCalendario();
  } else {
    verifica('le prove del calendario sono arrivate in fondo (servono a questa)', false);
  }
} else {
  // Calendario.gs sta in un progetto tutto suo, nell'altro account: niente
  // Posta, niente email. MailApp e GmailApp qui non ci sono (un loro uso
  // sarebbe gia' fallito), e Session da' soltanto il fuso orario
  intestazione('CALENDARIO.GS DA SOLO, SENZA LA POSTA');
  const nomi = new Set([...codice.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/gm)]
    .map(m => m[1] || m[2]));
  const pubbliche = [...nomi].filter(n => /^ORARI_/.test(n) && typeof contesto[n] === 'function').sort();
  verifica('le funzioni pubbliche sono quelle del calendario, con i nomi di Orari.gs (' + pubbliche.join(', ') + ')',
    pubbliche.join() === 'ORARI_1_anteprima,ORARI_4_calendario,ORARI_5_cambioOrario,ORARI_6_coloraLezioni,' +
      'ORARI_7_colloqui,ORARI_ANNULLA_calendario');
  const interneVisibili = [...nomi].filter(n => typeof contesto[n] === 'function' && !/^ORARI_/.test(n) && !/_$/.test(n));
  verifica('le funzioni interne finiscono con "_"' + (interneVisibili.length ? ' (non: ' + interneVisibili.join(', ') + ')' : ''),
    interneVisibili.length === 0);
  const riprese = [...codice.matchAll(/^var\s+(_ORARI_TRIGGER\w*)\s*=\s*(['"])([^'"]+)\2/gm)].map(m => m[3]).sort();
  verifica('le sue riprese sono quelle del calendario, e ognuna e\' una sua funzione (' + riprese.join(', ') + ')',
    riprese.join() === 'ORARI_4_calendario,ORARI_5_cambioOrario,ORARI_6_coloraLezioni,ORARI_7_colloqui' &&
    riprese.every(n => typeof contesto[n] === 'function'));
  verifica('nel progetto non ci sono ne\' MailApp ne\' GmailApp, e in tutte le prove nessuna email e\' partita',
    typeof contesto.MailApp === 'undefined' && typeof contesto.GmailApp === 'undefined' && mandate.length === 0 &&
    etichetteCercate.length === 0 && ricerche.length === 0);
  // il blocco lo puo' tenere solo un'altra funzione del calendario: il messaggio non parla della posta
  lockOccupato = true;
  const occupato = contesto.ORARI_ANNULLA_calendario();
  lockOccupato = false;
  verifica('con il blocco occupato dice che e\' in corso il calendario, non la posta (' + occupato + ')',
    /in corso/.test(occupato) && /\(il calendario\)/.test(occupato) && !/posta|invio/.test(occupato));
}

intestazione('RISULTATO');
verifica('in tutte le prove ' + (SOLO_CALENDARIO ? 'Calendario.gs' : 'Orari.gs') + ' non ha mai chiamato setRecurrence, che in Google non cambia niente' +
  (conSetRecurrence.length ? ' (chiamata ' + conSetRecurrence.length + ' volte)' : ''), conSetRecurrence.length === 0);
const saltate = SEZIONI.filter(s => sezioniFatte.indexOf(s) < 0);
verifica('tutte le sezioni sono state provate' + (saltate.length ? ' (saltate: ' + saltate.join(', ') + ')' : ''),
  saltate.length === 0);
if (fallimenti === 0) console.log('  Tutte le prove superate.');
else { console.log('  PROVE FALLITE: ' + fallimenti); process.exitCode = 1; }
