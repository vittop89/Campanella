/**
 * Banco di prova per Orari.gs
 *
 *   node test/mock_orari.js [DatiOrari.gs]
 *
 * Simula MailApp, GmailApp, CalendarApp, PropertiesService, LockService,
 * ScriptApp e Session e verifica che l'anteprima, l'invio (tutto a se'
 * stessi), la ripresa dopo il tempo massimo o con il lock occupato, la quota
 * giornaliera, gli orari delle classi, l'etichetta con il prefisso della
 * Posta e il calendario si comportino bene. Del calendario prova anche i
 * giorni senza lezione (una serie per ogni tratto di settimane), la ripresa
 * per il tempo massimo e per i limiti di Google senza doppioni, l'impronta
 * del piano, il cambio d'orario (ORARI_5_cambioOrario) e l'annullamento di
 * un lavoro a meta'. Di partenza usa i dati inventati
 * di DatiOrari_esempio.gs; si puo' passare un altro file, per esempio quello
 * che test/prova_orario.ps1 genera con il generatore vero.
 *
 * Ogni sezione e' obbligatoria: se i dati non hanno le classi o il
 * calendario, la prova fallisce invece di saltarle.
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
const codice = fs.readFileSync(path.join(radice, 'src', 'risorse', 'Orari.gs'), 'utf8');
const percorsoDati = process.argv[2] || path.join(__dirname, 'DatiOrari_esempio.gs');
const dati = fs.readFileSync(percorsoDati, 'utf8');
const IO = 'io@scuola-esempio.edu.it';

// ---------------------------------------------------------------------------
//  FINTE API
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
// Le serie ripetono l'evento ogni settimana alla stessa ora (anche a cavallo
// dell'ora legale, come Google) fino a "until" compreso. setRecurrence cambia
// la regola e l'inizio; le opzioni di createEventSeries portano la
// descrizione. Una lezione di una serie si puo' spostare o cancellare a mano
// (sposta, cancella), come dall'interfaccia di Google: getEvents la da'
// all'ora nuova, o non la da'; setRecurrence tiene le lezioni cambiate a mano
// che ci sono ancora nella serie nuova (stesso inizio originale). Come in
// Google, getEventSeries di un evento singolo non e' null: la "serie" di
// quell'evento. I calendari sono tuoi o condivisi con te (iscritto):
// getCalendarsByName li da' tutti, getOwnedCalendarsByName solo i tuoi, e
// tutti e due senza badare alle maiuscole. I limiti di Google si simulano con
// guasti(): alla n-esima chiamata di un'operazione parte l'errore scelto. Il
// tempo che passa si simula con sogliaCalendario: ogni tante scritture
// l'orologio va avanti di dieci minuti, oltre il tempo massimo di
// un'esecuzione.
const calendari = [];
let prossimoId = 1;
let sogliaCalendario = Infinity;
let scrittureDallUltimoSalto = 0;
const chiamate = {};                 // operazione -> quante volte e' stata chiamata
let guastiPrevisti = [];             // { op, alla, messaggio }
const tagliate = [];                 // le serie su cui e' stato chiamato setRecurrence
const occorrenzeTolte = [];          // deleteEvent su una sola lezione di una serie

function guasti(elenco) {
  guastiPrevisti = elenco.slice();
  for (const k of Object.keys(chiamate)) delete chiamate[k];
}
function operazione(op) {
  chiamate[op] = (chiamate[op] || 0) + 1;
  const g = guastiPrevisti.find(x => x.op === op && x.alla === chiamate[op]);
  if (g) throw new Error(g.messaggio);
  if (op !== 'setTag' && ++scrittureDallUltimoSalto >= sogliaCalendario) {
    orologio += 10 * 60 * 1000;
    scrittureDallUltimoSalto = 0;
  }
}
/** Stessa ora, n settimane dopo: con le date del calendario, non con i millisecondi. */
function settimaneDopo(t, n) {
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7 * n, t.getHours(), t.getMinutes(), t.getSeconds());
}

class Serie {
  constructor(cal, titolo, inizio, fine, ricorrenza, opzioni) {
    this.id = 'serie' + (prossimoId++);
    this.cal = cal; this.titolo = titolo;
    this.inizio = new Date(inizio.getTime()); this.fine = new Date(fine.getTime());
    this.ricorrenza = ricorrenza; this.opzioni = opzioni || {};
    this.tag = {}; this.descrizione = (opzioni && opzioni.description) || ''; this.cancellata = false;
    this.inizioOriginale = new Date(inizio.getTime());
    this.eccezioni = new Map();      // inizio originale (ms) -> { inizio, fine } spostata, o null cancellata
  }
  getId() { return this.id; }
  setTag(k, v) { operazione('setTag'); this.tag[k] = v; return this; }
  getTag(k) { return this.tag[k] || null; }
  setDescription(d) { this.descrizione = d; return this; }
  getDescription() { return this.descrizione; }
  isRecurringEvent() { return true; }
  deleteEventSeries() { operazione('deleteEventSeries'); this.cancellata = true; }
  setRecurrence(ricorrenza, inizio, fine) {
    operazione('setRecurrence');
    if (!ricorrenza || !ricorrenza.weekly || !(inizio instanceof Date) || !(fine instanceof Date)) {
      throw new Error('setRecurrence: argomenti non validi');
    }
    this.ricorrenza = ricorrenza;
    this.inizio = new Date(inizio.getTime());
    this.fine = new Date(fine.getTime());
    // le lezioni cambiate a mano restano se la loro lezione c'e' ancora
    const ancora = new Set(this.inizi().map(t => t.getTime()));
    for (const k of [...this.eccezioni.keys()]) if (!ancora.has(k)) this.eccezioni.delete(k);
    tagliate.push(this);
    return this;
  }
  /** gli inizi delle lezioni della regola, dalla prima all'ultima (fino a "until" o al limite dato) */
  inizi(limite) {
    const fuori = [];
    const fino = (this.ricorrenza && this.ricorrenza.until) ? this.ricorrenza.until : limite;
    for (let n = 0; n < 1000; n++) {
      const t = settimaneDopo(this.inizio, n);
      if (t > fino || (limite && t > limite)) break;
      fuori.push(t);
    }
    return fuori;
  }
  /** a mano, dall'interfaccia di Google: la lezione n (0 = la prima) spostata, o cancellata */
  sposta(n, inizio, fine) { this.eccezioni.set(settimaneDopo(this.inizio, n).getTime(), { inizio, fine }); }
  cancella(n) { this.eccezioni.set(settimaneDopo(this.inizio, n).getTime(), null); }
  /** le lezioni come le vede chi guarda il calendario: con quelle spostate, senza quelle cancellate */
  lezioni(limite) {
    const durata = this.fine - this.inizio;
    const fuori = [];
    for (const t of this.inizi(limite)) {
      if (!this.eccezioni.has(t.getTime())) { fuori.push({ inizio: t, fine: new Date(t.getTime() + durata) }); continue; }
      const x = this.eccezioni.get(t.getTime());
      if (x) fuori.push({ inizio: new Date(x.inizio.getTime()), fine: new Date(x.fine.getTime()) });
    }
    return fuori;
  }
}

class Evento {                                   // un evento singolo: di partenza non nostro
  constructor(cal, titolo, inizio, fine) {
    this.id = 'evento' + (prossimoId++);
    this.cal = cal; this.titolo = titolo; this.inizio = inizio; this.fine = fine;
    this.tag = {}; this.cancellato = false; this.descrizione = 'riunione';
  }
  getTag(k) { return this.tag[k] || null; }
  setTag(k, v) { this.tag[k] = v; return this; }
  getDescription() { return this.descrizione; }
  /** come in Google: anche un evento singolo ha la sua "serie", che non e' mai null */
  getEventSeries() {
    const ev = this;
    return {
      getId: () => ev.id,
      getTag: k => ev.getTag(k),
      getDescription: () => ev.getDescription(),
      isRecurringEvent: () => false,
      deleteEventSeries: () => { operazione('deleteEventSeries'); ev.cancellato = true; },
      setRecurrence: () => { throw new Error('nel finto, un evento singolo non diventa una serie'); }
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
  }
  getName() { return this.nome; }
  setColor(c) { this.colore = c; return this; }
  createEventSeries(titolo, inizio, fine, ricorrenza, opzioni) {
    operazione('createEventSeries');
    const s = new Serie(this, titolo, inizio, fine, ricorrenza, opzioni);
    this.serie.push(s);
    return s;
  }
  createEvent(titolo, inizio, fine) {
    const e = new Evento(this, titolo, inizio, fine);
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
        const inizio = new Date(l.inizio.getTime()), fine = new Date(l.fine.getTime());
        fuori.push({
          getTag: k => s.getTag(k),
          getDescription: () => s.getDescription(),
          getEventSeries: () => s,
          isRecurringEvent: () => true,
          deleteEvent: () => { occorrenzeTolte.push({ serie: s, inizio }); },
          getStartTime: () => new Date(inizio.getTime()),
          getEndTime: () => new Date(fine.getTime()),
          getTitle: () => s.titolo
        });
      }
    }
    for (const e of this.eventi) if (!e.cancellato && e.inizio >= da && e.inizio <= a) fuori.push(e);
    return fuori;
  }
}

const stessoNome = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const CalendarApp = {
  Color: { BLUE: '#4285f4', GREEN: '#0f9d58', RED: '#db4437' },
  // come Google: senza badare alle maiuscole, e anche i calendari a cui sei iscritto
  getCalendarsByName: nome => calendari.filter(c => stessoNome(c.nome, nome)),
  getOwnedCalendarsByName: nome => calendari.filter(c => c.proprio && stessoNome(c.nome, nome)),
  createCalendar: (nome, opzioni) => { const c = new Calendario(nome, opzioni); calendari.push(c); return c; },
  newRecurrence: () => ({
    addWeeklyRule: () => ({ until: d => ({ weekly: true, until: new Date(d.getTime()) }) })
  })
};

// getActiveUser puo' tornare vuoto nei trigger: le prove lo svuotano apposta
let indirizzoAttivo = IO;
let indirizzoEffettivo = IO;
const Session = {
  getActiveUser: () => ({ getEmail: () => indirizzoAttivo }),
  getEffectiveUser: () => ({ getEmail: () => indirizzoEffettivo })
};
const Logger = { log: t => registro.push(String(t)) };
let pause = 0;
const Utilities = { sleep: () => { pause++; } };

const DateFinta = new Proxy(Date, {
  get(target, prop) {
    if (prop === 'now') return () => target.now() + orologio;
    return Reflect.get(target, prop);
  },
  construct(target, args) { return new target(...args); }
});

const contesto = vm.createContext({
  MailApp, GmailApp, CalendarApp, PropertiesService, LockService, ScriptApp, Session, Logger,
  Utilities, Date: DateFinta, JSON, Math, String, Number, Object, Array, RegExp, Error,
  isNaN, console
});
vm.runInContext(dati, contesto, { filename: 'DatiOrari.gs' });
vm.runInContext(codice, contesto, { filename: 'Orari.gs' });

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
const SEZIONI = [
  'ANTEPRIMA', 'INVIO: tutto a me stesso', 'ETICHETTA DEGLI ORARI E PREFISSO DELLA POSTA',
  'QUOTA GIORNALIERA', 'TEMPO MASSIMO DI ESECUZIONE', 'BLOCCO DI ESECUZIONE', 'ANNULLA INVIO',
  'ORARI DELLE CLASSI', 'CLASSI: QUOTA E RIPRESA', 'INDIRIZZO: RIPIEGO SULL\'UTENTE EFFETTIVO',
  'GOOGLE CALENDAR', 'CALENDARIO: dati mancanti o sbagliati', 'CALENDARIO: SOLO I TUOI, CON IL NOME ESATTO',
  'GIORNI SENZA LEZIONE',
  'CALENDARIO: RIPRESA PER IL TEMPO MASSIMO', 'CALENDARIO: RIPRESA PER I LIMITI DI GOOGLE',
  'CALENDARIO: BLOCCO DI ESECUZIONE', 'CALENDARIO: DATIORARI.GS CAMBIATO A META\'',
  'CAMBIO D\'ORARIO', 'CAMBIO D\'ORARIO: RIPRESA E CASI LIMITE',
  'CAMBIO D\'ORARIO: DATA PRIMA DELL\'INIZIO, ANNO PRIMA NELLO STESSO CALENDARIO',
  'CAMBIO D\'ORARIO: LEZIONI SPOSTATE O CANCELLATE A MANO',
  'ANNULLA CALENDARIO DOPO UN LAVORO A META\'', 'ANNULLA CALENDARIO: TEMPO MASSIMO E LIMITI DI GOOGLE',
  'CONVIVENZA CON LA POSTA', 'ANNULLA_AUTOMAZIONE E UNA RIPRESA DEL CALENDARIO GIA\' PARTITA'
];
// gli attrezzi del calendario, per le prove che stanno dopo la Posta
let attrezziCalendario = null;
const PROGRESSO_CALENDARIO = 'CAMPANELLA_ORARI_CALENDARIO_PROGRESSO';
const PROGRESSO = 'CAMPANELLA_ORARI_PROGRESSO';
const PROGRESSO_CLASSI = 'CAMPANELLA_ORARI_CLASSI_PROGRESSO';

// il fuso fissato in cima deve avere davvero l'ora legale (se Node non lo
// cambiasse, le prove del calendario non vedrebbero piu' i salti di un'ora)
verifica('le prove girano nel fuso di Roma, con l\'ora legale (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')',
  new Date(2027, 0, 15).getTimezoneOffset() === -60 && new Date(2027, 6, 15).getTimezoneOffset() === -120);

const D = contesto.ORARI;
const conOre = D.docenti.filter(d => d.celle.some(c => c)).length;
console.log('Dati: ' + D.docenti.length + ' docenti (' + conOre + ' con ore), ' +
            (D.classi ? D.classi.length : 0) + ' classi, ' +
            D.giorni.length + ' giorni x ' + D.ore + ' ore');

intestazione('ANTEPRIMA');
const anteprima = contesto.ORARI_1_anteprima();
console.log(anteprima.split('\n').slice(0, 20).join('\n'));
verifica('l\'anteprima non manda niente', mandate.length === 0);
verifica('mostra un esempio di messaggio', anteprima.indexOf('Oggetto:') > 0);
verifica('la tabella ha i giorni', anteprima.indexOf(D.giorni[0]) > 0);
verifica('dice che il destinatario sei tu', anteprima.indexOf(IO) > 0);
verifica('dice la versione dello script', /Orari\.gs versione \d+\.\d+\.\d+/.test(anteprima));
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
    guasti([]);
    orologio = 0;
    tagliate.length = 0;
    occorrenzeTolte.length = 0;
    lockOccupato = false;
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
    tagliate.length = 0;
    const due = errore(() => contesto[fn]());
    verifica('con due tuoi calendari chiamati "' + c.nome + '" ' + fn + ' si ferma, lo dice e non ' + come + ' niente',
      /2 calendari/.test(due) && vive(tuo).length === piano.tratti.length && gemello.serie.length === 0 &&
      tagliate.length === 0 && !proprieta.has(PROGRESSO_CALENDARIO));
  }

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
      const senzaTag = vive(calL).filter(s => s.getTag('campanella') !== 'orario');
      contesto.ORARI_ANNULLA_calendario();
      verifica('  ...la serie rimasta senza contrassegno ha la descrizione di Campanella, e l\'annullamento la toglie',
        senzaTag.length === 1 && senzaTag[0].getDescription().indexOf('[Campanella]') === 0 && vive(calL).length === 0);
    }
  }
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
  const cambioOccupato = contesto.ORARI_5_cambioOrario();
  verifica('anche ORARI_5_cambioOrario aspetta il blocco, e riprogramma la ripresa del lavoro a meta\'',
    /fra un minuto/.test(cambioOccupato) && ripresaDi('ORARI_4_calendario').length === 1 && tagliate.length === 0);
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
    const daAccorciare = vecchie.filter(s => chiave(s.inizio) < validoDal && chiave(s.ricorrenza.until) >= validoDal).length;
    const daTogliere = vecchie.filter(s => chiave(s.inizio) >= validoDal).length;
    verifica('i dati fanno accorciare delle serie (' + daAccorciare + ') e toglierne altre (' + daTogliere + ')',
      daAccorciare > 0 && daTogliere > 0);
    docOriginale.celle = ruotata(celleOriginali);          // il nuovo orario, in un DatiOrari.gs nuovo
    tagliate.length = 0;
    occorrenzeTolte.length = 0;
    const esitoCambio = contesto.ORARI_5_cambioOrario();
    console.log(esitoCambio);
    verifica('dice quante serie ha accorciato (' + daAccorciare + ')',
      numero(/accorciate[^:]*: (\d+)/, esitoCambio) === daAccorciare);
    verifica('quante ne ha tolte (' + daTogliere + ')', numero(/tolte[^:]*: (\d+)/, esitoCambio) === daTogliere);
    verifica('e quanti eventi singoli, a parte dalle serie (1)',
      numero(/Eventi singoli tolti[^:]*: (\d+)/, esitoCambio) === 1);
    verifica('quante ne ha create (' + nuovoPiano.tratti.length + ') e quante lezioni ha saltato (' + nuovoPiano.saltate + ')',
      numero(/create: (\d+)/, esitoCambio) === nuovoPiano.tratti.length &&
      numero(/Lezioni saltate nei giorni senza lezione: (\d+)/, esitoCambio) === nuovoPiano.saltate);
    verifica('e avverte che le modifiche fatte a mano sulle serie accorciate potrebbero non restare',
      /a mano/.test(esitoCambio) && /accorciate/.test(esitoCambio));
    verifica('le settimane prima del cambio restano com\'erano (' + primaDelCambio.length + ' lezioni)',
      uguali(lezioniSul(calC, primoGiorno, giornoPrima), primaDelCambio));
    verifica('nessuna lezione dell\'orario di prima dal ' + validoDal + ' in poi',
      vecchie.every(s => s.cancellata || s.inizi(ultimoGiorno).every(t => chiave(t) < validoDal)));
    verifica('dal ' + validoDal + ' ci sono proprio le lezioni del nuovo orario (' + nuovoPiano.lezioni.length + ')',
      uguali(lezioniSul(calC, vd, ultimoGiorno), nuovoPiano.lezioni));
    verifica('le serie accorciate tengono il loro inizio e finiscono il giorno prima del cambio, alle 23:59:59',
      tagliate.length === daAccorciare && tagliate.every(s =>
        s.inizio.getTime() === s.inizioOriginale.getTime() && chiave(s.ricorrenza.until) === chiave(giornoPrima) &&
        s.ricorrenza.until.getHours() === 23 && s.ricorrenza.until.getMinutes() === 59 && s.ricorrenza.until.getSeconds() === 59));
    verifica('setRecurrence solo su serie con il contrassegno', tagliate.every(s => s.getTag('campanella') === 'orario'));
    verifica('nessuna lezione cancellata una per una dentro una serie', occorrenzeTolte.length === 0);
    verifica('l\'evento singolo nostro dopo il cambio e\' tolto, quello prima resta',
      singoloDopo.cancellato && !singoloPrima.cancellato);
    verifica('e l\'evento non nostro resta', !altrui.cancellato);
    verifica('lavoro finito: niente a meta\', nessuna ripresa',
      !proprieta.has(PROGRESSO_CALENDARIO) && ripresaDi('ORARI_5_cambioOrario').length === 0);
    // rieseguito con la stessa data: lo stesso calendario
    const dopoUno = lezioniSul(calC, primoGiorno, ultimoGiorno);
    const createLaPrimaVolta = vive(calC).filter(s => vecchie.indexOf(s) < 0).length;
    tagliate.length = 0;
    const esitoDue = contesto.ORARI_5_cambioOrario();
    verifica('rieseguito con la stessa data da\' lo stesso calendario, senza doppioni',
      uguali(lezioniSul(calC, primoGiorno, ultimoGiorno), dopoUno) && senzaDoppioni(calC));
    verifica('togliendo e rifacendo le serie create la volta prima (' + createLaPrimaVolta + '), senza accorciarne altre',
      numero(/tolte[^:]*: (\d+)/, esitoDue) === createLaPrimaVolta && numero(/accorciate[^:]*: (\d+)/, esitoDue) === 0 &&
      tagliate.length === 0);
    verifica('il calendario dopo il cambio e\' quello atteso: prima l\'orario vecchio, poi il nuovo',
      uguali(lezioniSul(calC, primoGiorno, ultimoGiorno).filter(l => !/ Recupero$/.test(l)), attesoDopoCambio));
    // una copia fatta a mano di una lezione: ha la descrizione di Campanella ma
    // non il contrassegno. Il cambio non la tocca e la nomina; l'annullamento,
    // che il docente chiede per togliere tutto, la toglie (lo dicono i documenti)
    const copia = calC.createEventSeries('Copia a mano',
      new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() - 7, 18, 0), new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() - 7, 19, 0),
      CalendarApp.newRecurrence().addWeeklyRule().until(new Date(vd.getFullYear(), vd.getMonth(), vd.getDate() + 21, 23, 59, 59)),
      { description: '[Campanella] Orario di ' + c.docente + ', copiata a mano' });
    tagliate.length = 0;
    const esitoCopia = contesto.ORARI_5_cambioOrario();
    verifica('una serie con la descrizione di Campanella ma senza contrassegno (una copia a mano) il cambio non la ' +
      'tocca, e la nomina', !copia.cancellata && tagliate.indexOf(copia) < 0 && copia.inizi().length === 5 &&
      /senza contrassegno/.test(esitoCopia) && esitoCopia.indexOf('Copia a mano') >= 0);
    contesto.ORARI_ANNULLA_calendario();
    verifica('ORARI_ANNULLA_calendario invece la toglie, come dicono i documenti', copia.cancellata);
    docOriginale.celle = celleOriginali.slice();
  }

  intestazione('CAMBIO D\'ORARIO: RIPRESA E CASI LIMITE');
  if (validoDal) {
    // interrotto dal tempo mentre accorcia e mentre crea: si arriva allo stesso calendario
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    docOriginale.celle = ruotata(celleOriginali);
    sogliaCalendario = 4;
    const aMeta = contesto.ORARI_5_cambioOrario();
    verifica('al tempo massimo si ferma mentre accorcia le serie di prima, e programma la ripresa di ORARI_5_cambioOrario',
      /Tempo massimo/.test(aMeta) && !!salvato() && salvato().funzione === 'ORARI_5_cambioOrario' &&
      salvato().fase === 'taglio' && ripresaDi('ORARI_5_cambioOrario').length === 1);
    const giriC = riprendiFinoInFondo('ORARI_5_cambioOrario');
    sogliaCalendario = Infinity;
    verifica('riprendendo (' + giriC + ' volte) arriva allo stesso calendario del cambio fatto in una volta',
      giriC > 2 && !proprieta.has(PROGRESSO_CALENDARIO) && senzaDoppioni(calendari[0]) &&
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));

    // un limite di Google mentre accorcia
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    docOriginale.celle = ruotata(celleOriginali);
    guasti([{ op: 'setRecurrence', alla: 2, messaggio: 'Service invoked too many times in a short time: calendar.' }]);
    const limiteTaglio = contesto.ORARI_5_cambioOrario();
    verifica('un limite di Google mentre accorcia: si ferma e riprende fra un minuto',
      /fra un minuto/.test(limiteTaglio) && ripresaDi('ORARI_5_cambioOrario').length === 1 && salvato().fase === 'taglio');
    riprendiFinoInFondo('ORARI_5_cambioOrario');
    verifica('  ...e riprendendo arriva allo stesso calendario',
      !proprieta.has(PROGRESSO_CALENDARIO) && uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));

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
    tagliate.length = 0;
    for (const [valore, attesa, come] of [['', /validoDal/, 'manca'], ['domani', /validoDal/, 'non e\' una data'],
                                          ['2099-01-01', /dopo la fine/, 'viene dopo la fine del periodo']]) {
      contesto.ORARI.calendario = Object.assign({}, salvaCal, { validoDal: valore });
      const e = errore(() => contesto.ORARI_5_cambioOrario());
      verifica('se la data del cambio ' + come + ' si ferma e lo spiega, senza toccare niente',
        attesa.test(e) && vive(calendari[0]).length === serieIntatte && tagliate.length === 0 && !proprieta.has(PROGRESSO_CALENDARIO));
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

    // niente da accorciare: il calendario c'e' ma e' vuoto
    azzeraCalendario();
    CalendarApp.createCalendar(c.nome);
    const vuoto = contesto.ORARI_5_cambioOrario();
    verifica('se non trova niente da accorciare o togliere lo dice (forse ORARI_4_calendario non era mai stato eseguito)',
      /ORARI_4_calendario non era mai stato eseguito/.test(vuoto));
    verifica('e mette lo stesso l\'orario dal ' + validoDal,
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
    tagliate.length = 0;
    const esitoP = contesto.ORARI_5_cambioOrario();
    console.log(esitoP);
    verifica('le serie dell\'anno prima restano intatte (' + serieAnnoPrima.length + ' serie, ' + annoPrima.length + ' lezioni)',
      annoPrima.length > 0 && uguali(lezioniSul(calP, inizioPrima, finePrima), annoPrima) &&
      serieAnnoPrima.every(s => !s.cancellata && tagliate.indexOf(s) < 0));
    verifica('e quest\'anno c\'e\' l\'orario nuovo da tutto il periodo',
      uguali(lezioniSul(calP, primoGiorno, ultimoGiorno), pianoAtteso(ruotata(celleOriginali), primoGiorno).lezioni));
    verifica('il messaggio dice che la data viene prima dell\'inizio e che il cambio vale da tutto il periodo',
      /prima dell'inizio/.test(esitoP) && /da tutto il periodo/.test(esitoP) && esitoP.indexOf('dal ' + c.inizio) >= 0);
    // il "Dal" del periodo spostato alla data del cambio: le serie messe prima
    // cominciano prima dell'inizio nuovo, e vanno accorciate lo stesso
    azzeraCalendario();
    contesto.ORARI.calendario = salvaP;
    contesto.ORARI_4_calendario();
    contesto.ORARI.calendario = Object.assign({}, salvaP, { inizio: validoDal });
    docOriginale.celle = ruotata(celleOriginali);
    contesto.ORARI_5_cambioOrario();
    verifica('con il "Dal" spostato alla data del cambio le serie di prima si accorciano lo stesso, senza doppioni',
      uguali(lezioniSul(calendari[0], primoGiorno, ultimoGiorno), attesoDopoCambio));
    contesto.ORARI.calendario = salvaP;
    docOriginale.celle = celleOriginali.slice();
  }

  intestazione('CAMBIO D\'ORARIO: LEZIONI SPOSTATE O CANCELLATE A MANO');
  if (validoDal) {
    // setRecurrence vuole l'inizio della prima lezione della serie, e getEvents
    // da' le lezioni spostate a mano all'ora nuova: una prima lezione spostata
    // non deve spostare tutta la serie
    azzeraCalendario();
    contesto.ORARI_4_calendario();
    const calM = calendari[0];
    const accorciabili = vive(calM).filter(s => chiave(s.inizio) < validoDal && chiave(s.ricorrenza.until) >= validoDal &&
      s.inizi(giornoPrima).length >= 3);
    verifica('ci sono almeno tre serie da accorciare con tre lezioni prima del cambio (' + accorciabili.length + ')',
      accorciabili.length >= 3);
    if (accorciabili.length >= 3) {
      const [spostata, conBuco, senzaPrima] = accorciabili;
      const p0 = spostata.inizio;
      spostata.sposta(0, new Date(p0.getFullYear(), p0.getMonth(), p0.getDate() + 2, 15, 0),
                         new Date(p0.getFullYear(), p0.getMonth(), p0.getDate() + 2, 16, 0));
      conBuco.cancella(1);
      senzaPrima.cancella(0);
      const primaM = lezioniSul(calM, primoGiorno, giornoPrima);
      docOriginale.celle = ruotata(celleOriginali);
      const esitoM = contesto.ORARI_5_cambioOrario();
      console.log(esitoM);
      verifica('le lezioni prima del cambio restano come erano, con quelle spostate o cancellate a mano (' +
        primaM.length + ')', uguali(lezioniSul(calM, primoGiorno, giornoPrima), primaM));
      verifica('la serie con la prima lezione spostata tiene il suo giorno e la sua ora: non si sposta tutta',
        spostata.inizio.getTime() === spostata.inizioOriginale.getTime() && chiave(spostata.ricorrenza.until) === chiave(giornoPrima));
      verifica('il messaggio nomina le serie accorciate con lezioni spostate o cancellate a mano (2)',
        numero(/spostate o cancellate a mano[^:]*: (\d+)/, esitoM) === 2 && esitoM.indexOf(spostata.titolo) >= 0 &&
        esitoM.indexOf(conBuco.titolo) >= 0);
      verifica('e dal cambio c\'e\' l\'orario nuovo', uguali(lezioniSul(calM, vd, ultimoGiorno), nuovoPiano.lezioni));
      docOriginale.celle = celleOriginali.slice();
    }
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
  attrezziCalendario = { azzeraCalendario, vive, salvato, ripresaDi, piano };
}

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
 'ORARI_5_cambioOrario', 'ORARI_ANNULLA_calendario', 'ORARI_ANNULLA_invio'].forEach(n =>
  verifica('c\'e\' la funzione ' + n + ', citata dall\'app e dai documenti', typeof contesto[n] === 'function'));
// ANNULLA_automazione della Posta spegne tutto il progetto, dicono documenti e
// nota per il DPO: anche ogni ripresa degli orari (var _ORARI_TRIGGER...). Se
// Orari.gs ne aggiunge una, qui ci se ne accorge.
const riprese = [...codice.matchAll(/^var\s+(_ORARI_TRIGGER\w*)\s*=\s*(['"])([^'"]+)\2/gm)].map(m => m[3]);
verifica('le riprese degli orari lette da Orari.gs (' + riprese.join(', ') + '), anche quelle del calendario',
  riprese.length >= 4 && riprese.every(n => typeof contesto[n] === 'function') &&
  riprese.indexOf('ORARI_4_calendario') >= 0 && riprese.indexOf('ORARI_5_cambioOrario') >= 0);
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

// Una ripresa del calendario scattata un attimo prima di ANNULLA_automazione
// aspetta il blocco: quando lo prende, il suo trigger e' gia' stato tolto, ma
// il punto salvato c'e' ancora. Non deve lavorare e riprogrammarsi: il punto
// dice che il lavoro e' stato fermato. Rieseguito a mano, riparte.
intestazione('ANNULLA_AUTOMAZIONE E UNA RIPRESA DEL CALENDARIO GIA\' PARTITA');
if (attrezziCalendario) {
  const { azzeraCalendario, vive, salvato, ripresaDi, piano } = attrezziCalendario;
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
  contesto.ORARI_4_calendario();
  verifica('rieseguito a mano, finisce il lavoro da dove era arrivato',
    vive(calF).length === piano.tratti.length && !salvato() && ripresaDi('ORARI_4_calendario').length === 0);
  azzeraCalendario();
} else {
  verifica('le prove del calendario sono arrivate in fondo (servono a questa)', false);
}

intestazione('RISULTATO');
const saltate = SEZIONI.filter(s => sezioniFatte.indexOf(s) < 0);
verifica('tutte le sezioni sono state provate' + (saltate.length ? ' (saltate: ' + saltate.join(', ') + ')' : ''),
  saltate.length === 0);
if (fallimenti === 0) console.log('  Tutte le prove superate.');
else { console.log('  PROVE FALLITE: ' + fallimenti); process.exitCode = 1; }
