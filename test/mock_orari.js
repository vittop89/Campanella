/**
 * Banco di prova per Orari.gs
 *
 *   node test/mock_orari.js [DatiOrari.gs]
 *
 * Simula MailApp, GmailApp, CalendarApp, PropertiesService, LockService,
 * ScriptApp e Session e verifica che l'anteprima, l'invio (tutto a se'
 * stessi), la ripresa dopo il tempo massimo o con il lock occupato, la quota
 * giornaliera, gli orari delle classi, l'etichetta con il prefisso della
 * Posta e il calendario si comportino bene. Di partenza usa i dati inventati
 * di DatiOrari_esempio.gs; si puo' passare un altro file, per esempio quello
 * che test/prova_orario.ps1 genera con il generatore vero.
 *
 * Ogni sezione e' obbligatoria: se i dati non hanno le classi o il
 * calendario, la prova fallisce invece di saltarle.
 */

'use strict';
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
const calendari = [];
let prossimoId = 1;

class Serie {
  constructor(cal, titolo, inizio, fine, ricorrenza) {
    this.id = 'serie' + (prossimoId++);
    this.cal = cal; this.titolo = titolo; this.inizio = inizio; this.fine = fine;
    this.ricorrenza = ricorrenza; this.tag = {}; this.descrizione = ''; this.cancellata = false;
  }
  getId() { return this.id; }
  setTag(k, v) { this.tag[k] = v; return this; }
  getTag(k) { return this.tag[k] || null; }
  setDescription(d) { this.descrizione = d; return this; }
  getDescription() { return this.descrizione; }
  deleteEventSeries() { this.cancellata = true; }
}

class Evento {                                   // un evento singolo, non nostro
  constructor(cal, titolo, inizio, fine) {
    this.cal = cal; this.titolo = titolo; this.inizio = inizio; this.fine = fine;
    this.tag = {}; this.cancellato = false; this.descrizione = 'riunione';
  }
  getTag(k) { return this.tag[k] || null; }
  getDescription() { return this.descrizione; }
  getEventSeries() { return null; }
  deleteEvent() { this.cancellato = true; }
}

class Calendario {
  constructor(nome, opzioni) { this.nome = nome; this.opzioni = opzioni || {}; this.serie = []; this.eventi = []; this.colore = ''; }
  getName() { return this.nome; }
  setColor(c) { this.colore = c; return this; }
  createEventSeries(titolo, inizio, fine, ricorrenza) {
    const s = new Serie(this, titolo, inizio, fine, ricorrenza);
    this.serie.push(s);
    return s;
  }
  createEvent(titolo, inizio, fine) {
    const e = new Evento(this, titolo, inizio, fine);
    this.eventi.push(e);
    return e;
  }
  /** le occorrenze delle serie nel periodo: una per settimana, come farebbe Google */
  getEvents(da, a) {
    const fuori = [];
    for (const s of this.serie) {
      if (s.cancellata) continue;
      let t = new Date(s.inizio.getTime());
      const fineSerie = s.ricorrenza.until || a;
      while (t <= a && t <= fineSerie) {
        if (t >= da) {
          fuori.push({
            getTag: k => s.getTag(k),
            getDescription: () => s.getDescription(),
            getEventSeries: () => s,
            deleteEvent: () => { s.cancellata = true; },
            getStartTime: () => new Date(t.getTime()),
            getTitle: () => s.titolo
          });
        }
        t = new Date(t.getTime() + 7 * 24 * 3600 * 1000);
      }
    }
    for (const e of this.eventi) if (!e.cancellato && e.inizio >= da && e.inizio <= a) fuori.push(e);
    return fuori;
  }
}

const CalendarApp = {
  Color: { BLUE: '#4285f4', GREEN: '#0f9d58', RED: '#db4437' },
  getCalendarsByName: nome => calendari.filter(c => c.nome === nome),
  createCalendar: (nome, opzioni) => { const c = new Calendario(nome, opzioni); calendari.push(c); return c; },
  newRecurrence: () => ({ addWeeklyRule: () => ({ until: d => ({ weekly: true, until: d }) }) })
};

// getActiveUser puo' tornare vuoto nei trigger: le prove lo svuotano apposta
let indirizzoAttivo = IO;
let indirizzoEffettivo = IO;
const Session = {
  getActiveUser: () => ({ getEmail: () => indirizzoAttivo }),
  getEffectiveUser: () => ({ getEmail: () => indirizzoEffettivo })
};
const Logger = { log: t => registro.push(String(t)) };
const Utilities = { sleep: () => {} };

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
  'GOOGLE CALENDAR', 'CALENDARIO: dati mancanti o sbagliati', 'CONVIVENZA CON LA POSTA'
];
const PROGRESSO = 'CAMPANELLA_ORARI_PROGRESSO';
const PROGRESSO_CLASSI = 'CAMPANELLA_ORARI_CLASSI_PROGRESSO';

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
verifica('e lo dice', /in corso/i.test(occupato));
verifica('senza un invio a meta\' non programma riprese', trigger.length === 0);
// una ripresa che trova il lock preso (per esempio dal riordino della posta)
proprieta.set(PROGRESSO, '{"i":2,"mandati":2}');
const rinviata = contesto.ORARI_2_invia({ triggerUid: 'ripresa' });
verifica('una ripresa con il lock occupato si riprogramma invece di fermarsi',
  mandate.length === 0 && trigger.filter(t => t.fn === 'ORARI_2_invia').length === 1);
verifica('e lo dice', /fra un minuto/.test(rinviata));
verifica('il punto a cui era arrivato resta', proprieta.get(PROGRESSO) === '{"i":2,"mandati":2}');
const annullaOccupato = contesto.ORARI_ANNULLA_invio();
verifica('con il lock occupato ORARI_ANNULLA_invio non dimentica niente, e lo dice',
  proprieta.has(PROGRESSO) && /in corso/.test(annullaOccupato));
lockOccupato = false;
contesto.ORARI_2_invia({ triggerUid: 'ripresa' });
verifica('liberato il lock, la ripresa finisce da dove era arrivata (' + mandate.length + ' email)',
  mandate.length === Math.max(0, conOre - 2) && !proprieta.has(PROGRESSO));
verifica('e toglie il trigger', !trigger.some(t => t.fn === 'ORARI_2_invia'));

intestazione('ANNULLA INVIO');
proprieta.set(PROGRESSO, '{"i":3,"mandati":3}');
proprieta.set(PROGRESSO_CLASSI, '{"i":1,"mandati":1}');
trigger.length = 0;
trigger.push({ fn: 'ORARI_2_invia' }, { fn: 'ORARI_3_inviaOrariClassi' }, { fn: 'PASSO_4_automatico' });
contesto.ORARI_ANNULLA_invio();
verifica('dimentica il punto dei docenti e quello delle classi',
  !proprieta.has(PROGRESSO) && !proprieta.has(PROGRESSO_CLASSI));
verifica('toglie le riprese degli orari e lascia gli altri trigger',
  trigger.length === 1 && trigger[0].fn === 'PASSO_4_automatico');
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
verifica('i dati hanno la parte del calendario (serve a questa sezione e alla prossima)', conCalendario);
if (conCalendario) {
  const c = D.calendario;
  const esito = contesto.ORARI_4_calendario();
  console.log(esito);
  const cal = calendari.find(x => x.nome === c.nome);
  verifica('crea il calendario con il nome scelto', !!cal);
  verifica('un solo calendario', calendari.length === 1);

  // i blocchi attesi: ore consecutive della stessa classe nello stesso giorno,
  // ricavati qui in modo indipendente dallo script, con gli orari delle ore
  const doc = D.docenti.find(d => d.nome === c.docente);
  const leggibile = v => {
    const s = String(v || '').trim();
    return /^(D|DISP\.?|DISPOSIZIONE)$/i.test(s) ? 'A disposizione' : s;
  };
  const attesi = [];
  for (let g = 0; g < D.giorni.length; g++) {
    let aperto = null;
    for (let o = 0; o < D.ore; o++) {
      const v = leggibile(doc.celle[g * D.ore + o]);
      if (aperto && v && v === aperto.testo && aperto.oraA === o) { aperto.oraA = o + 1; continue; }
      if (!v) { aperto = null; continue; }
      aperto = { giorno: g, oraDa: o + 1, oraA: o + 1, testo: v };
      attesi.push(aperto);
    }
  }
  verifica('un evento settimanale per ogni blocco di ore (' + attesi.length + ')',
    cal.serie.length === attesi.length);

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
  const abbinati = attesi.filter(b => cal.serie.some(s =>
    s.titolo === b.testo &&
    s.inizio.getDay() === giornoSettimana(D.giorni[b.giorno]) &&
    minutiDi(s.inizio) === minutiDellOra(b.oraDa) &&
    minutiDi(s.fine) === minutiDellOra(b.oraA) + minuti));
  verifica('ogni blocco ha un evento nel giorno giusto, con inizio e fine giusti (' +
    abbinati.length + ' su ' + attesi.length + ')', abbinati.length === attesi.length);
  const multipli = attesi.filter(b => b.oraA > b.oraDa).length;
  verifica('ci sono blocchi di piu\' ore consecutive, quindi la fusione e\' stata provata (' +
    multipli + ')', multipli > 0);
  verifica('tutti gli eventi portano il contrassegno',
    cal.serie.every(s => s.getTag('campanella') === 'orario'));
  verifica('la descrizione dice da dove vengono',
    cal.serie.every(s => s.getDescription().indexOf('[Campanella]') === 0));
  verifica('la ricorrenza e\' settimanale fino alla data di fine',
    cal.serie.every(s => s.ricorrenza.weekly &&
      s.ricorrenza.until.getFullYear() === Number(c.fine.slice(0, 4)) &&
      s.ricorrenza.until.getMonth() + 1 === Number(c.fine.slice(5, 7)) &&
      s.ricorrenza.until.getDate() === Number(c.fine.slice(8, 10))));
  const primoGiorno = new Date(Number(c.inizio.slice(0, 4)), Number(c.inizio.slice(5, 7)) - 1, Number(c.inizio.slice(8, 10)));
  verifica('nessun evento prima della data di inizio', cal.serie.every(s => s.inizio >= primoGiorno));
  verifica('gli eventi cadono tutti entro una settimana dall\'inizio',
    cal.serie.every(s => (s.inizio - primoGiorno) < 7 * 24 * 3600 * 1000));

  if (c.colore) verifica('il colore viene applicato', cal.colore === CalendarApp.Color[c.colore]);

  // una seconda esecuzione trova le serie gia' messe e si ferma, invece di raddoppiarle
  let secondaVolta = '';
  try { contesto.ORARI_4_calendario(); } catch (e) { secondaVolta = e.message; }
  verifica('la seconda volta si ferma e dice di annullare prima',
    /gia' \d+ serie/.test(secondaVolta) && /ORARI_ANNULLA_calendario/.test(secondaVolta));
  verifica('senza raddoppiare le lezioni (' + cal.serie.length + ' serie)', cal.serie.length === attesi.length);
  verifica('e senza creare un altro calendario', calendari.length === 1);

  // un evento che non e' nostro deve sopravvivere all'annullamento
  cal.createEvent('Collegio docenti', new Date(2026, 9, 5, 15, 0), new Date(2026, 9, 5, 17, 0));
  console.log(contesto.ORARI_ANNULLA_calendario());
  verifica('l\'annullamento toglie tutti gli eventi messi da Campanella',
    cal.serie.every(s => s.cancellata));
  verifica('e lascia stare gli altri eventi', cal.eventi.every(e => !e.cancellato));
  verifica('il calendario resta', calendari.length === 1);

  // dopo l'annullamento l'orario si rimette, una volta sola, e l'evento altrui non lo blocca
  contesto.ORARI_4_calendario();
  const vive = cal.serie.filter(s => !s.cancellata);
  verifica('dopo l\'annullamento l\'orario si rimette, una volta sola (' + vive.length + ' serie)',
    vive.length === attesi.length);
  contesto.ORARI_ANNULLA_calendario();

  intestazione('CALENDARIO: dati mancanti o sbagliati');
  const salva = contesto.ORARI.calendario;
  contesto.ORARI.calendario = null;
  let errore = '';
  try { contesto.ORARI_4_calendario(); } catch (e) { errore = e.message; }
  verifica('senza la parte "calendario" si ferma e spiega', /calendario/i.test(errore));
  verifica('e chiede il tuo nome', /il tuo nome/.test(errore));
  contesto.ORARI.calendario = Object.assign({}, salva, { docente: 'NESSUNO' });
  errore = '';
  try { contesto.ORARI_4_calendario(); } catch (e) { errore = e.message; }
  verifica('con un nome che non c\'e\' si ferma', /non trovo/i.test(errore));
  contesto.ORARI.calendario = Object.assign({}, salva, { fine: '2026-09-01' });
  errore = '';
  try { contesto.ORARI_4_calendario(); } catch (e) { errore = e.message; }
  verifica('con la fine prima dell\'inizio si ferma', /prima/i.test(errore));
  contesto.ORARI.calendario = salva;
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
 'ORARI_ANNULLA_calendario', 'ORARI_ANNULLA_invio'].forEach(n =>
  verifica('c\'e\' la funzione ' + n + ', citata dall\'app e dai documenti', typeof contesto[n] === 'function'));
// ANNULLA_automazione della Posta spegne tutto il progetto, dicono documenti e
// nota per il DPO: anche ogni ripresa degli orari (var _ORARI_TRIGGER...). Se
// Orari.gs ne aggiunge una, qui ci se ne accorge.
const riprese = [...codice.matchAll(/^var\s+(_ORARI_TRIGGER\w*)\s*=\s*(['"])([^'"]+)\2/gm)].map(m => m[3]);
verifica('le riprese degli orari lette da Orari.gs (' + riprese.join(', ') + ')',
  riprese.length >= 2 && riprese.every(n => typeof contesto[n] === 'function'));
vm.runInContext(posta, contesto, { filename: 'Organizzazione_Gmail.gs' });
trigger.length = 0;
riprese.forEach(fn => trigger.push({ fn, ms: 60000 }));
const spenta = contesto.ANNULLA_automazione();
verifica('ANNULLA_automazione della Posta le toglie tutte' +
  (trigger.length ? ' (restano: ' + trigger.map(t => t.fn).join(', ') + ')' : ''), trigger.length === 0);
verifica('e le nomina tutte', riprese.every(n => spenta.indexOf(n) >= 0));

intestazione('RISULTATO');
const saltate = SEZIONI.filter(s => sezioniFatte.indexOf(s) < 0);
verifica('tutte le sezioni sono state provate' + (saltate.length ? ' (saltate: ' + saltate.join(', ') + ')' : ''),
  saltate.length === 0);
if (fallimenti === 0) console.log('  Tutte le prove superate.');
else { console.log('  PROVE FALLITE: ' + fallimenti); process.exitCode = 1; }
