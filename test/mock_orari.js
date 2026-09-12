/**
 * Banco di prova per Orari.gs
 *
 *   node test/mock_orari.js [DatiOrari.gs]
 *
 * Simula MailApp, GmailApp, CalendarApp, PropertiesService, LockService e
 * ScriptApp e verifica che l'anteprima, l'invio (tutto a se' stessi), la
 * ripresa dopo il tempo massimo, la quota giornaliera, gli orari delle classi
 * e il calendario si comportino bene. Di partenza usa i dati inventati di
 * DatiOrari_esempio.gs; si puo' passare un altro file.
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

const GmailApp = {
  getUserLabelByName: () => null,
  search: () => []
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

const Session = { getActiveUser: () => ({ getEmail: () => IO }) };
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
function intestazione(t) { console.log('\n' + '='.repeat(70) + '\n  ' + t + '\n' + '='.repeat(70)); }

const D = contesto.ORARI;
const conOre = D.docenti.filter(d => d.celle.some(c => c)).length;
console.log('Dati: ' + D.docenti.length + ' docenti (' + conOre + ' con ore), ' +
            (D.classi ? D.classi.length : 0) + ' classi, ' +
            D.giorni.length + ' giorni x ' + D.ore + ' ore');

intestazione('ANTEPRIMA');
const anteprima = contesto.ORARI_1_anteprima();
console.log(anteprima.split('\n').slice(0, 18).join('\n'));
verifica('l\'anteprima non manda niente', mandate.length === 0);
verifica('mostra un esempio di messaggio', anteprima.indexOf('Oggetto:') > 0);
verifica('la tabella ha i giorni', anteprima.indexOf(D.giorni[0]) > 0);
verifica('dice che il destinatario sei tu', anteprima.indexOf(IO) > 0);
if (D.calendario) verifica('parla del calendario', anteprima.indexOf(D.calendario.nome) > 0);

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
verifica('il progresso e\' stato azzerato', !proprieta.has('CAMPANELLA_ORARI_PROGRESSO'));

intestazione('QUOTA GIORNALIERA');
mandate.length = 0;
proprieta.clear();
quota = 2;
const parziale = contesto.ORARI_2_invia();
verifica('si ferma quando finisce la quota', mandate.length === 2);
verifica('lo dice chiaramente', /quota/i.test(parziale));
verifica('si ricorda dove era arrivato', proprieta.has('CAMPANELLA_ORARI_PROGRESSO'));
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
while (proprieta.has('CAMPANELLA_ORARI_PROGRESSO') && giri < 30) { contesto.ORARI_2_invia(); giri++; }
verifica('riprendendo arriva in fondo (' + giri + ' riprese)', mandate.length === conOre);
verifica('toglie il trigger a lavoro finito', !trigger.some(t => t.fn === 'ORARI_2_invia'));

intestazione('BLOCCO DI ESECUZIONE');
mandate.length = 0;
lockOccupato = true;
const occupato = contesto.ORARI_2_invia();
verifica('se un\'altra esecuzione e\' in corso non manda niente', mandate.length === 0);
verifica('e lo dice', /in corso/i.test(occupato));
lockOccupato = false;

intestazione('ANNULLA INVIO');
proprieta.set('CAMPANELLA_ORARI_PROGRESSO', '{"i":3,"mandati":3}');
contesto.ORARI_ANNULLA_invio();
verifica('dimentica il punto in cui era arrivato', !proprieta.has('CAMPANELLA_ORARI_PROGRESSO'));

if (D.classi && D.classi.length) {
  intestazione('ORARI DELLE CLASSI');
  mandate.length = 0;
  quota = 1000;
  contesto.ORARI_3_inviaOrariClassi();
  verifica('un messaggio per classe', mandate.length === D.classi.length);
  verifica('arrivano solo a me', mandate.every(m => m.to === IO));
  verifica('l\'oggetto contiene la classe', mandate[0].subject.indexOf(D.classi[0].nome) >= 0);
  verifica('nel corpo ci sono i cognomi dei docenti',
    D.classi[0].celle.filter(Boolean).every(c =>
      mandate[0].htmlBody.indexOf(c.split(' + ')[0]) > 0));
}

if (D.calendario && D.calendario.docente) {
  intestazione('GOOGLE CALENDAR');
  const c = D.calendario;
  const esito = contesto.ORARI_4_calendario();
  console.log(esito);
  const cal = calendari.find(x => x.nome === c.nome);
  verifica('crea il calendario con il nome scelto', !!cal);
  verifica('un solo calendario', calendari.length === 1);

  // i blocchi attesi: ore consecutive della stessa classe nello stesso giorno
  const doc = D.docenti.find(d => d.nome === c.docente);
  let attesi = 0;
  for (let g = 0; g < D.giorni.length; g++) {
    let prec = '';
    for (let o = 0; o < D.ore; o++) {
      const v = doc.celle[g * D.ore + o] || '';
      if (v && v !== prec) attesi++;
      prec = v;
    }
  }
  verifica('un evento settimanale per ogni blocco di ore (' + attesi + ')', cal.serie.length === attesi);
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

  // ROSSI: mercoledi' 1a-3a ora in 3C -> un evento dalle 08:00 alle 11:00
  const mer = cal.serie.find(s => s.titolo === '3C');
  if (mer) {
    verifica('un blocco di tre ore dura dalle 08:00 alle 11:00',
      mer.inizio.getHours() === 8 && mer.inizio.getMinutes() === 0 &&
      mer.fine.getHours() === 11 && mer.fine.getMinutes() === 0);
    verifica('e cade di mercoledi\'', mer.inizio.getDay() === 3);
  }
  // ROSSI: giovedi' 5a-6a ora in 2B -> 12:10 - 14:10 (orari delle ore con intervallo)
  const gio = cal.serie.find(s => s.titolo === '2B' && s.inizio.getDay() === 4);
  if (gio) {
    verifica('le ore dopo l\'intervallo usano l\'orario scritto (12:10-14:10)',
      gio.inizio.getHours() === 12 && gio.inizio.getMinutes() === 10 &&
      gio.fine.getHours() === 14 && gio.fine.getMinutes() === 10);
  }
  if (c.colore) verifica('il colore viene applicato', cal.colore === CalendarApp.Color[c.colore]);

  // una seconda esecuzione trova il calendario e non ne crea un altro
  contesto.ORARI_4_calendario();
  verifica('la seconda volta usa lo stesso calendario', calendari.length === 1);

  // un evento che non e' nostro deve sopravvivere all'annullamento
  cal.createEvent('Collegio docenti', new Date(2026, 9, 5, 15, 0), new Date(2026, 9, 5, 17, 0));
  console.log(contesto.ORARI_ANNULLA_calendario());
  verifica('l\'annullamento toglie tutti gli eventi messi da Campanella',
    cal.serie.every(s => s.cancellata));
  verifica('e lascia stare gli altri eventi', cal.eventi.every(e => !e.cancellato));
  verifica('il calendario resta', calendari.length === 1);

  intestazione('CALENDARIO: dati mancanti o sbagliati');
  const salva = contesto.ORARI.calendario;
  contesto.ORARI.calendario = null;
  let errore = '';
  try { contesto.ORARI_4_calendario(); } catch (e) { errore = e.message; }
  verifica('senza la parte "calendario" si ferma e spiega', /calendario/i.test(errore));
  contesto.ORARI.calendario = Object.assign({}, salva, { docente: 'NESSUNO' });
  errore = '';
  try { contesto.ORARI_4_calendario(); } catch (e) { errore = e.message; }
  verifica('con un docente che non c\'e\' si ferma', /non trovo/i.test(errore));
  contesto.ORARI.calendario = Object.assign({}, salva, { fine: '2026-09-01' });
  errore = '';
  try { contesto.ORARI_4_calendario(); } catch (e) { errore = e.message; }
  verifica('con la fine prima dell\'inizio si ferma', /prima/i.test(errore));
  contesto.ORARI.calendario = salva;
}

intestazione('RISULTATO');
if (fallimenti === 0) console.log('  Tutte le prove superate.');
else { console.log('  PROVE FALLITE: ' + fallimenti); process.exitCode = 1; }
