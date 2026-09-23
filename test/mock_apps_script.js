/**
 * Banco di prova per Organizzazione_Gmail.gs
 *
 *   node test/mock_apps_script.js [Configurazione.gs] [Organizzazione_Gmail.gs]
 *
 * Simula GmailApp, PropertiesService, ScriptApp, MailApp e Session con una
 * finta casella di posta, poi esegue i quattro passi e stampa cosa succede.
 * Serve a verificare le ricerche costruite, l'etichettatura a blocchi, la
 * ripresa dopo il tempo massimo e le funzioni di annullamento, senza dover
 * caricare nulla su Google. In fondo controlla che ogni email mandata durante
 * le prove sia andata solo all'account stesso, senza copie.
 *
 * Di partenza usa test/Configurazione_esempio.gs e il motore vero; il primo
 * argomento e' un'altra configurazione (test/prova_posta.ps1 passa quella
 * generata da Campanella), il secondo una copia del motore
 * (test/invarianti_script.js ci mette dei guasti apposta).
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
//  FINTA CASELLA DI POSTA
// ---------------------------------------------------------------------------
let prossimoId = 1;

class Thread {
  constructor(from, subject, body, opzioni) {
    opzioni = opzioni || {};
    this.id = 'th' + (prossimoId++);
    this.from = from.toLowerCase();
    this.subject = subject;
    this.body = body || '';
    this.labels = new Set();
    this.inInbox = opzioni.inInbox !== false;
    this.inSent = !!opzioni.sent;
    this.isChat = !!opzioni.chat;
    this.unread = opzioni.unread !== false;
    this.giorniFa = opzioni.giorniFa || 1;
  }
  getId() { return this.id; }
}

const casella = [];
function aggiungi(from, subject, body, opzioni) {
  const t = new Thread(from, subject, body, opzioni);
  casella.push(t);
  return t;
}

// ---------------------------------------------------------------------------
//  INTERPRETE (semplificato) DELLE RICERCHE DI GMAIL
//  Copre quello che genera lo script: from:(a OR b), subject:(...), to:(...),
//  -label:"x", -in:chats, -in:sent, in:inbox, newer_than:Nd|Nm|Ny,
//  has:attachment, category:..., testo libero fra parentesi.
// ---------------------------------------------------------------------------
function tokenizza(query) {
  const out = [];
  let i = 0;
  while (i < query.length) {
    if (/\s/.test(query[i])) { i++; continue; }
    let neg = false;
    if (query[i] === '-') { neg = true; i++; }
    let inizio = i, profondita = 0, virgolette = false;
    while (i < query.length) {
      const c = query[i];
      if (c === '"') virgolette = !virgolette;
      else if (!virgolette && c === '(') profondita++;
      else if (!virgolette && c === ')') profondita--;
      else if (!virgolette && profondita === 0 && /\s/.test(c)) break;
      i++;
    }
    out.push({ neg, testo: query.slice(inizio, i) });
  }
  return out;
}

function valoriOr(grezzo) {
  let s = grezzo.trim();
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
  return s.split(/\s+OR\s+/i).map(v => v.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

const CAMPI = ['from', 'to', 'subject', 'label', 'in', 'newer_than', 'older_than',
               'has', 'category', 'list', 'filename', 'larger', 'smaller'];

function corrispondeToken(t, token) {
  let s = token.testo;

  // gruppo fra parentesi: "(a OR b)" -> vero se una delle alternative e' vera
  if (s.startsWith('(') && s.endsWith(')')) {
    const alternative = valoriOr(s);
    if (alternative.length > 1) {
      return alternative.some(a => corrispondeToken(t, { neg: false, testo: a }));
    }
    s = alternative[0];
  }

  const due = s.indexOf(':');
  const campo = (due > 0 && CAMPI.indexOf(s.slice(0, due).toLowerCase()) >= 0)
    ? s.slice(0, due).toLowerCase() : '';
  const valore = (campo !== '') ? s.slice(due + 1) : s;

  switch (campo) {
    case 'from':
      return valoriOr(valore).some(v => {
        v = v.toLowerCase();
        return v.startsWith('@') ? t.from.endsWith(v) : t.from === v;
      });
    case 'to':
      return valoriOr(valore).some(v => (t.to || '').toLowerCase().includes(v.toLowerCase()));
    case 'subject':
      return valoriOr(valore).some(v => t.subject.toLowerCase().includes(v.toLowerCase()));
    case 'label':
      return t.labels.has(valore.replace(/^"|"$/g, ''));
    case 'in': {
      const dove = valore.toLowerCase();
      if (dove === 'chats') return t.isChat;
      if (dove === 'sent') return t.inSent;
      if (dove === 'inbox') return t.inInbox;
      if (dove === 'anywhere') return true;
      return false;
    }
    case 'newer_than': {
      const m = valore.match(/^(\d+)([dmy])$/);
      if (!m) return true;
      const giorni = Number(m[1]) * (m[2] === 'd' ? 1 : m[2] === 'm' ? 30 : 365);
      return t.giorniFa <= giorni;
    }
    case 'has':
      return valore === 'attachment' ? !!t.allegato : true;
    case 'category':
      return (t.categoria || '') === valore;
    default: {
      // testo libero, eventualmente "(a OR b)"
      return valoriOr(valore).some(v => {
        const vm2 = v.toLowerCase();
        if (vm2.startsWith('category:')) return (t.categoria || '') === vm2.slice(9);
        return (t.subject + ' ' + t.body).toLowerCase().includes(vm2);
      });
    }
  }
}

function cerca(query) {
  const tokens = tokenizza(query);
  return casella.filter(t => {
    // Come in Gmail, le chat restano fuori solo se la ricerca lo chiede con
    // -in:chats (lo script lo chiede sempre): se ne occupa il token "in"
    for (const tok of tokens) {
      const ok = corrispondeToken(t, tok);
      if (tok.neg ? ok : !ok) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
//  FINTE API DI GOOGLE
// ---------------------------------------------------------------------------
const etichette = new Map();
const registro = [];
const chiamate = { search: 0, addToThreads: 0, archivia: 0 };
let orologio = 0;                 // millisecondi finti aggiunti a Date.now()
let sogliaInterruzione = Infinity; // dopo quante addToThreads far "scadere" il tempo

class Label {
  constructor(nome) { this.nome = nome; }
  getName() { return this.nome; }
  addToThreads(threads) {
    chiamate.addToThreads++;
    if (chiamate.addToThreads >= sogliaInterruzione) orologio += 10 * 60 * 1000;
    threads.forEach(t => t.labels.add(this.nome));
    return this;
  }
  removeFromThreads(threads) {
    threads.forEach(t => t.labels.delete(this.nome));
    return this;
  }
  getThreads(inizio, quanti) {
    const tutti = casella.filter(t => t.labels.has(this.nome));
    return tutti.slice(inizio, inizio + quanti);
  }
}

const GmailApp = {
  search(query, inizio, quanti) {
    chiamate.search++;
    const r = cerca(query);
    return (inizio === undefined) ? r : r.slice(inizio, inizio + quanti);
  },
  getUserLabelByName(nome) { return etichette.get(nome) || null; },
  getUserLabels() { return [...etichette.values()]; },
  createLabel(nome) {
    if (!etichette.has(nome)) etichette.set(nome, new Label(nome));
    return etichette.get(nome);
  },
  moveThreadsToArchive(threads) {
    chiamate.archivia += threads.length;
    threads.forEach(t => { t.inInbox = false; });
  },
  markThreadsRead(threads) { threads.forEach(t => { t.unread = false; }); },
  getMessagesForThreads(threads) {
    return threads.map(t => [{
      getFrom: () => t.fromCompleto || ('Nome Cognome <' + t.from + '>'),
      getTo: () => t.to || IO,
      getCc: () => ''
    }]);
  }
};

const proprieta = new Map();
const PropertiesService = {
  getUserProperties: () => ({
    getProperty: k => (proprieta.has(k) ? proprieta.get(k) : null),
    setProperty: (k, v) => proprieta.set(k, v),
    deleteProperty: k => proprieta.delete(k)
  })
};

const trigger = [];
const ScriptApp = {
  newTrigger(fn) {
    const t = { fn, tipo: null, valore: null };
    const costruttore = {
      timeBased: () => ({
        everyHours: n => { t.tipo = 'ore'; t.valore = n; return { create: () => trigger.push(t) }; },
        after: ms => { t.tipo = 'dopo'; t.valore = ms; return { create: () => trigger.push(t) }; }
      })
    };
    return costruttore;
  },
  getProjectTriggers: () => trigger.map(t => ({
    getHandlerFunction: () => t.fn,
    _rif: t
  })),
  deleteTrigger(t) {
    const i = trigger.indexOf(t._rif);
    if (i >= 0) trigger.splice(i, 1);
  }
};

// Ogni invio, con tutto quello che lo script passa: destinatario, oggetto,
// corpo e opzioni (cc, bcc...), in tutte e due le forme che MailApp accetta.
// In fondo si controlla che ogni email sia andata solo all'account stesso.
const posta = [];
function registraInvio(servizio, argomenti) {
  const primo = argomenti[0];
  if (primo && typeof primo === 'object') {
    posta.push({ servizio, a: primo.to, o: primo.subject, c: primo.body, opzioni: primo });
  } else {
    posta.push({ servizio, a: primo, o: argomenti[1], c: argomenti[2], opzioni: argomenti[3] || {} });
  }
}
const MailApp = { sendEmail: (...argomenti) => registraInvio('MailApp', argomenti) };
GmailApp.sendEmail = (...argomenti) => registraInvio('GmailApp', argomenti);
const Logger = { log: t => registro.push(String(t)) };
const Utilities = {
  sleep: () => {},
  formatDate: (d, fuso, modello) => (modello === 'yyyyMMdd' ? '20260923' : String(d))
};
const LockService = {
  getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} })
};

const DateFinta = new Proxy(Date, {
  get(target, prop) {
    if (prop === 'now') return () => target.now() + orologio;
    return Reflect.get(target, prop);
  },
  construct(target, args) { return new target(...args); }
});

// ---------------------------------------------------------------------------
//  CARICO GLI SCRIPT
// ---------------------------------------------------------------------------
const radice = path.join(__dirname, '..', 'src', 'risorse');
// di partenza il motore vero; un secondo argomento carica una sua copia (serve
// a test/invarianti_script.js per provare che il banco si accorge dei guasti)
const codice = process.argv[3]
  ? fs.readFileSync(process.argv[3], 'utf8')
  : fs.readFileSync(path.join(radice, 'Organizzazione_Gmail.gs'), 'utf8');
// di partenza i dati inventati di Configurazione_esempio.gs; si puo' passare
// un'altra configurazione (la casella finta si adatta al suo dominio)
const configurazione = process.argv[2]
  ? fs.readFileSync(process.argv[2], 'utf8')
  : fs.readFileSync(path.join(__dirname, 'Configurazione_esempio.gs'), 'utf8');

const contesto = vm.createContext({
  GmailApp, PropertiesService, ScriptApp, MailApp, LockService, Logger, Utilities,
  Date: DateFinta, JSON, Math, String, Number, Object, Array, RegExp, Error,
  console
});
vm.runInContext(configurazione, contesto, { filename: 'Configurazione.gs' });

const DOM = String(contesto.CONFIG.dominioScuola || 'scuola-esempio.edu.it').replace(/^@/, '');
const IO = 'io@' + DOM;
const Session = {
  getActiveUser: () => ({ getEmail: () => IO }),
  getScriptTimeZone: () => 'Europe/Rome'
};
contesto.Session = Session;
vm.runInContext(codice, contesto, { filename: 'Organizzazione_Gmail.gs' });

// ---------------------------------------------------------------------------
//  DATI DI PROVA (indirizzi inventati, sul dominio della configurazione)
// ---------------------------------------------------------------------------
aggiungi('preside@' + DOM, 'Convocazione collegio docenti', '');
aggiungi('segreteria@' + DOM, 'Consegna documenti', '');
aggiungi('segreteria@' + DOM, 'Circolare n. 42 - orario', '');
aggiungi('noreply@spaggiari.eu', 'Nuova nota disciplinare', '');
aggiungi('mario.rossi@' + DOM, 'Dipartimento matematica', '');
aggiungi('anna.deluca@' + DOM, 'Scambio ora', '');
aggiungi('giuseppe.esposito@' + DOM, 'Chiarimento compiti', '');
aggiungi('sara.blu@' + DOM, 'Assenza di ieri', '');
aggiungi('comunicazioni@istruzione.it', 'Nota ministeriale 1234', '');
aggiungi('info@flcgil.it', 'Sciopero del 20', '');
const promo = aggiungi('offerte@negozio.com', 'Sconti di primavera', 'clicca qui per unsubscribe');
promo.categoria = 'promotions';
aggiungi('amico@gmail.com', 'Cena sabato?', '');
aggiungi(IO, 'Messaggio inviato da me', '', { sent: true });
for (let i = 0; i < 250; i++) {
  aggiungi('studente' + i + '@' + DOM, 'Domanda ' + i, '');
}

// ---------------------------------------------------------------------------
//  PROVE
// ---------------------------------------------------------------------------
function intestazione(t) { console.log('\n' + '='.repeat(72) + '\n  ' + t + '\n' + '='.repeat(72)); }
function ultimoLog() { return registro[registro.length - 1]; }

let fallimenti = 0;
function verifica(descrizione, condizione) {
  console.log((condizione ? '  OK   ' : '  FALLITO  ') + descrizione);
  if (!condizione) fallimenti++;
}

intestazione('PASSO 1 - anteprima (non deve modificare niente)');
const etichettePrima = new Set(casella.flatMap(t => [...t.labels]));
const anteprima = contesto.PASSO_1_anteprima();
console.log(anteprima);
verifica('nessuna etichetta applicata durante l\'anteprima',
  casella.every(t => t.labels.size === 0) && etichettePrima.size === 0);
verifica('l\'anteprima dice la versione dello script',
  /Versione dello script: \d+\.\d+\.\d+/.test(anteprima) &&
  anteprima.indexOf(contesto._POSTA_VERSIONE) >= 0);

intestazione('PASSO 3 in modalita\' prova: conta e basta');
verifica('la configurazione di partenza e\' in prova', contesto.CONFIG.provaSenzaModifiche === true);
console.log(contesto.PASSO_3_riordinaPostaEsistente());
verifica('in prova non crea nemmeno le etichette', etichette.size === 0);
verifica('in prova non tocca nessuna conversazione', casella.every(t => t.labels.size === 0 && t.inInbox));
verifica('in prova non manda il riepilogo', posta.length === 0);
verifica('in prova non lascia un progresso a meta\'', !proprieta.has('ORGGMAIL_PROGRESSO'));
verifica('in prova conta tutti gli studenti, non solo i primi 100',
  registro.some(r => /Studenti\s+25[0-9] conversazioni/.test(r)));

intestazione('PASSO 2 in modalita\' prova: elenca soltanto');
{
  // "in prova non si crea nemmeno un'etichetta": vale anche per PASSO_2, che la
  // procedura guidata fa eseguire prima di togliere la prova
  const t = contesto.PASSO_2_creaEtichette();
  console.log(t);
  verifica('in prova PASSO_2 non crea nessuna etichetta', etichette.size === 0);
  verifica('e lo dice, elencando quelle che nasceranno',
    t.indexOf('MODALITA\' PROVA') === 0 &&t.indexOf('Scuola/Colleghi/Docenti') > 0);
  verifica('elencando ogni etichetta una volta sola',
    t.split('\n').filter(r => r === '  - Scuola').length === 1);
  const filtriInProva = [];
  contesto.Gmail = { Users: { Labels: { list: () => ({ labels: [] }) },
    Settings: { Filters: { list: () => ({ filter: [] }), create: (f) => { filtriInProva.push(f); return f; } } } } };
  const tf = contesto.EXTRA_creaFiltriGmail();
  delete contesto.Gmail;
  verifica('in prova nemmeno i filtri di Gmail, e lo dice',
    filtriInProva.length === 0 && etichette.size === 0 && tf.indexOf('MODALITA\' PROVA') === 0);
}

intestazione('PASSO 2 - creazione etichette');
contesto.CONFIG.provaSenzaModifiche = false;
console.log(contesto.PASSO_2_creaEtichette());
verifica('l\'etichetta madre "Scuola" e\' stata creata', etichette.has('Scuola'));
verifica('esiste Scuola/Colleghi', etichette.has('Scuola/Colleghi'));
verifica('e le sottoetichette dei ruoli, a tre livelli',
  etichette.has('Scuola/Colleghi/Docenti') && etichette.has('Scuola/Colleghi/Amministrativi'));

intestazione('PASSO 3 - riordino vero (provaSenzaModifiche = false)');
contesto.CONFIG.provaSenzaModifiche = false;
console.log(contesto.PASSO_3_riordinaPostaEsistente());

const conEtichetta = n => casella.filter(t => t.labels.has(n)).length;
console.log('\n  Scuola/Dirigenza .......... ' + conEtichetta('Scuola/Dirigenza'));
console.log('  Scuola/Segreteria ......... ' + conEtichetta('Scuola/Segreteria'));
console.log('  Scuola/Circolari .......... ' + conEtichetta('Scuola/Circolari'));
console.log('  Scuola/Registro elettronico ' + conEtichetta('Scuola/Registro elettronico'));
console.log('  Scuola/Colleghi ........... ' + conEtichetta('Scuola/Colleghi'));
console.log('  Scuola/Studenti ........... ' + conEtichetta('Scuola/Studenti'));
console.log('  Scuola/Ministero e USR .... ' + conEtichetta('Scuola/Ministero e USR'));
console.log('  Scuola/Sindacati .......... ' + conEtichetta('Scuola/Sindacati'));
console.log('  Scuola/Newsletter ......... ' + conEtichetta('Scuola/Newsletter'));

const rossi = casella.find(t => t.from === 'mario.rossi@' + DOM);
const esposito = casella.find(t => t.from === 'giuseppe.esposito@' + DOM);
const preside = casella.find(t => t.from === 'preside@' + DOM);
const amico = casella.find(t => t.from === 'amico@gmail.com');
const inviato = casella.find(t => t.inSent);

verifica('un collega finisce in Colleghi', rossi.labels.has('Scuola/Colleghi'));
verifica('un collega NON finisce in Studenti', !rossi.labels.has('Scuola/Studenti'));

// i ruoli: @GRUPPO:Docenti@ deve pescare solo da quel gruppo di CONFIG.gruppi
const deluca = casella.find(t => t.from === 'anna.deluca@' + DOM);
verifica('il docente prende anche la sottoetichetta del suo ruolo',
  rossi.labels.has('Scuola/Colleghi/Docenti'));
verifica('e non quella di un altro ruolo', !rossi.labels.has('Scuola/Colleghi/Amministrativi'));
verifica('l\'amministrativa prende la sua',
  deluca && deluca.labels.has('Scuola/Colleghi/Amministrativi') &&
  !deluca.labels.has('Scuola/Colleghi/Docenti'));
verifica('il ruolo non toglie l\'etichetta generale dei colleghi',
  deluca.labels.has('Scuola/Colleghi'));
verifica('uno studente non prende nessun ruolo',
  ![...esposito.labels].some(l => l.indexOf('Scuola/Colleghi/') === 0));
verifica('uno studente finisce in Studenti', esposito.labels.has('Scuola/Studenti'));
verifica('uno studente NON finisce in Colleghi', !esposito.labels.has('Scuola/Colleghi'));
verifica('il preside non finisce fra gli studenti', !preside.labels.has('Scuola/Studenti'));
verifica('la posta personale resta intatta', amico.labels.size === 0);
verifica('la posta inviata non viene toccata', inviato.labels.size === 0);
verifica('tutti i 250 studenti sono stati etichettati', conEtichetta('Scuola/Studenti') >= 250);
verifica('i sindacati sono stati archiviati',
  casella.filter(t => t.labels.has('Scuola/Sindacati')).every(t => !t.inInbox));
verifica('la newsletter e\' stata archiviata',
  casella.filter(t => t.labels.has('Scuola/Newsletter')).every(t => !t.inInbox));
verifica('nessun messaggio e\' sparito', casella.length === 263);
verifica('il progresso e\' stato azzerato a fine lavoro', !proprieta.has('ORGGMAIL_PROGRESSO'));
verifica('e\' stato mandato il riepilogo per email', posta.length === 1);

intestazione('PASSO 3 - ripresa dopo il tempo massimo');
// rimetto tutto com'era e faccio "scadere" il tempo dopo 3 blocchi
casella.forEach(t => { t.labels.clear(); t.inInbox = true; });
proprieta.clear();
trigger.length = 0;
chiamate.addToThreads = 0;
orologio = 0;
sogliaInterruzione = 3;
console.log(contesto.PASSO_3_riordinaPostaEsistente());
verifica('il progresso e\' stato salvato', proprieta.has('ORGGMAIL_PROGRESSO'));
verifica('e\' stato programmato il riavvio automatico',
  trigger.some(t => t.fn === 'PASSO_3_riordinaPostaEsistente' && t.tipo === 'dopo'));

sogliaInterruzione = Infinity;
orologio = 0;
let giri = 0;
while (proprieta.has('ORGGMAIL_PROGRESSO') && giri < 20) {
  contesto.PASSO_3_riordinaPostaEsistente();
  giri++;
}
verifica('la ripresa porta il lavoro a termine (' + giri + ' riprese)',
  !proprieta.has('ORGGMAIL_PROGRESSO'));
verifica('dopo la ripresa i colleghi sono etichettati lo stesso',
  conEtichetta('Scuola/Colleghi') === 2);
verifica('dopo la ripresa gli studenti sono etichettati lo stesso',
  conEtichetta('Scuola/Studenti') >= 250);
verifica('il trigger di ripresa e\' stato rimosso a fine lavoro',
  !trigger.some(t => t.fn === 'PASSO_3_riordinaPostaEsistente'));

intestazione('PASSO 3 - seconda passata: non deve rifare il lavoro');
const prima = chiamate.addToThreads;
contesto.PASSO_3_riordinaPostaEsistente();
verifica('nessuna nuova etichettatura sulla posta gia\' sistemata',
  chiamate.addToThreads === prima);

intestazione('PASSO 4 - automazione');
console.log(contesto.PASSO_4_attivaAutomazione());
verifica('trigger orario creato',
  trigger.some(t => t.fn === 'smistaNuoviMessaggi' && t.tipo === 'ore'));

const nuovo = aggiungi('preside@' + DOM, 'Convocazione urgente', '', { giorniFa: 1 });
contesto.smistaNuoviMessaggi();
verifica('un messaggio nuovo viene etichettato dall\'automazione',
  nuovo.labels.has('Scuola/Dirigenza'));

const vecchio = aggiungi('preside@' + DOM, 'Roba di due anni fa', '', { giorniFa: 700 });
contesto.smistaNuoviMessaggi();
verifica('l\'automazione non torna indietro nel tempo', !vecchio.labels.has('Scuola/Dirigenza'));

intestazione('REGOLA CON UNA RICERCA CHE GMAIL RIFIUTA');
const cercaVera = GmailApp.search;
GmailApp.search = (query, inizio, quanti) => {
  if (/subject:\(rotta\)/.test(query)) throw new Error('Invalid search query');
  return cercaVera(query, inizio, quanti);
};
contesto.CONFIG.regole.unshift({ attiva: true, etichetta: 'Rotta', oggetto: ['rotta'], nota: 'prova' });
proprieta.clear();
const primaDellaRotta = registro.length;
contesto.PASSO_3_riordinaPostaEsistente();
verifica('la regola rotta viene saltata e segnalata',
  registro.slice(primaDellaRotta).some(r => /Rotta.*ricerca non accettata/.test(r)));
verifica('le altre regole lavorano lo stesso', !proprieta.has('ORGGMAIL_PROGRESSO'));
contesto.CONFIG.regole.shift();
GmailApp.search = cercaVera;

intestazione('EXTRA - elenco indirizzi del dominio');
const primaDegliIndirizzi = registro.length;
const postaPrima = posta.length;
const tsv = contesto.EXTRA_elencaIndirizziScuola();
console.log(tsv.split('\n').slice(0, 6).join('\n') + '\n  ...');
verifica('trova gli indirizzi del dominio della scuola', tsv.includes('mario.rossi@' + DOM));
verifica('non tira dentro i domini esterni', !tsv.includes('amico@gmail.com'));
verifica("non elenca l'indirizzo dell'utente stesso", !tsv.includes(IO));
{
  // il registro dell'editor taglia le scritte lunghe: l'elenco intero in una
  // riga sola spariva, e con lui il conto dei trovati
  const scritte = registro.slice(primaDegliIndirizzi);
  verifica('nessuna scritta nel registro e\' lunga da farsi tagliare',
    scritte.every(r => r.length < 6000));
  verifica('la prima scritta e\' il sommario, non l\'elenco',
    /^Trovati \d+ indirizzi @/.test(scritte[0]) && scritte[0].split('\n').length === 1);
  verifica('e subito dopo dice che l\'elenco e\' nell\'email',
    /EMAIL/.test(scritte[1]) && /Incolla elenco/.test(scritte[1]));
  // nomi e indirizzi di altre persone: il registro delle esecuzioni li
  // conserverebbe, quindi con l'email partita li' non vanno
  verifica('con l\'email partita l\'elenco NON finisce nel registro',
    scritte.every(r => !r.includes('mario.rossi@' + DOM)));

  const email = posta.slice(postaPrima).filter(m => /Indirizzi @/.test(m.o));
  verifica('l\'email con l\'elenco parte sempre', email.length === 1);
  verifica('e dentro ci sono tutti gli indirizzi trovati',
    tsv.split('\n').every(r => email[0].c.includes(r)));
  verifica('con il conto di quante conversazioni ha guardato',
    /esaminando \d+ conversazioni/.test(email[0].c));

  // l'email non parte (quota finita, per esempio): allora l'elenco serve nel registro
  const mandaVero = MailApp.sendEmail;
  MailApp.sendEmail = () => { throw new Error('Service invoked too many times: email'); };
  const primaDelGuasto = registro.length;
  contesto.EXTRA_elencaIndirizziScuola();
  MailApp.sendEmail = mandaVero;
  const guasto = registro.slice(primaDelGuasto);
  verifica('se l\'email non parte lo dice, e l\'elenco va nel registro a blocchi',
    guasto.some(r => /NON E' PARTITA/.test(r)) &&
    guasto.some(r => r.includes('mario.rossi@' + DOM)) && guasto.every(r => r.length < 6000));
}

intestazione('FILTRI VERI DI GMAIL');
{
  // il servizio avanzato "Gmail API", finto: etichette e filtri
  const filtri = [];
  contesto.Gmail = {
    Users: {
      Labels: { list: () => ({ labels: [...etichette.keys()].map(n => ({ name: n, id: 'id:' + n })) }) },
      Settings: { Filters: {
        list: () => ({ filter: filtri.slice() }),
        create: (f) => { filtri.push(f); return f; }
      } }
    }
  };
  const t = contesto.EXTRA_creaFiltriGmail();
  const etichettate = filtri.map(f => f.action.addLabelIds[0]);
  // un filtro puo' solo etichettare, archiviare e segnare come letto: niente
  // cestino, spam, inoltro o altre etichette di sistema
  verifica('i filtri fanno solo quello che fa lo script (' + filtri.length + ' filtri)',
    filtri.length > 0 && filtri.every(f =>
      Object.keys(f.action).every(k => k === 'addLabelIds' || k === 'removeLabelIds') &&
      f.action.addLabelIds.every(id => etichette.has(id.replace(/^id:/, ''))) &&
      (f.action.removeLabelIds || []).every(id => id === 'INBOX' || id === 'UNREAD') &&
      Object.keys(f.criteria).every(k => ['from', 'to', 'subject', 'query', 'hasAttachment'].indexOf(k) >= 0)));
  verifica('crea i filtri delle regole semplici',
    etichettate.indexOf('id:Scuola/Colleghi') >= 0 && etichettate.indexOf('id:Scuola/Circolari') >= 0);
  verifica('ma non quello di Studenti: prenderebbe anche i colleghi',
    etichettate.indexOf('id:Scuola/Studenti') < 0);
  verifica('e lo dice, spiegando perche\'',
    /restano allo smistamento dello script: [^\n]*Scuola\/Studenti/.test(t) && t.indexOf('colleghi compresi') >= 0);
  verifica('e avverte che un filtro vecchio resta', t.indexOf('il filtro vecchio resta') >= 0);
  verifica('non promette che Gmail faccia tutto da solo',
    t.indexOf('tranne Scuola/Studenti') >= 0 && t.indexOf('PASSO_4') >= 0);
  verifica('senza filtri vecchi, nessun allarme', t.indexOf('ATTENZIONE') < 0);

  // chi li aveva creati con una versione di prima: c'e' il filtro "tutto il dominio"
  filtri.push({ id: 'vecchio', criteria: { from: '@' + DOM }, action: { addLabelIds: ['id:Scuola/Studenti'] } });
  const t2 = contesto.EXTRA_creaFiltriGmail();
  verifica('il vecchio filtro di Studenti viene trovato e segnalato in cima',
    t2.indexOf('ATTENZIONE') === 0 && t2.indexOf('Scuola/Studenti  (da: @' + DOM + ')') > 0);
  verifica('e non viene cancellato da solo', filtri.some(f => f.id === 'vecchio'));

  // un filtro tuo, stretto, per la stessa etichetta: non e' quello vecchio
  filtri.splice(filtri.findIndex(f => f.id === 'vecchio'), 1);
  filtri.push({ id: 'mio', criteria: { from: 'rappresentante@' + DOM }, action: { addLabelIds: ['id:Scuola/Studenti'] } });
  const t3 = contesto.EXTRA_creaFiltriGmail();
  verifica('un filtro tuo su un indirizzo solo non viene scambiato per quello vecchio', t3.indexOf('ATTENZIONE') < 0);

  // un filtro che Gmail rifiuta: quella regola non si smista da sola
  const crea = contesto.Gmail.Users.Settings.Filters.create;
  filtri.length = 0;
  contesto.Gmail.Users.Settings.Filters.create = (f) => {
    if (f.action.addLabelIds[0] === 'id:Scuola/Colleghi') throw new Error('Filter too big');
    return crea(f);
  };
  const t4 = contesto.EXTRA_creaFiltriGmail();
  verifica('un filtro non riuscito finisce fra quelli che restano allo script',
    /tranne [^\n]*Scuola\/Colleghi/.test(t4));
  delete contesto.Gmail;
}

intestazione('ELENCO DEL PERSONALE VUOTO');
{
  // Colleghi con l'elenco vuoto: nessun mittente da cercare. Una ricerca senza
  // "from:" prenderebbe tutta la casella.
  const personaleVero = contesto.CONFIG.personale;
  contesto.CONFIG.personale = [];
  const colleghi = contesto.CONFIG.regole.find(r => r.etichetta === 'Colleghi');
  const q = contesto._queryDellaRegola_(contesto.CONFIG, colleghi);
  verifica('Colleghi senza personale non cerca niente (non tutta la casella)', q.length === 0);
  verifica('e non diventa un filtro di Gmail', contesto._criteriFiltro_(contesto.CONFIG, colleghi).length === 0);
  // mittenti piu' parole nell'oggetto: senza mittenti non deve restare un filtro
  // sul solo oggetto, che prenderebbe quelle parole da chiunque
  const mista = { attiva: true, etichetta: 'Colleghi/Verbali', da: ['@PERSONALE@'], oggetto: ['verbale'] };
  verifica('mittenti vuoti e oggetto: nessun filtro sul solo oggetto',
    contesto._criteriFiltro_(contesto.CONFIG, mista).length === 0 &&
    contesto._queryDellaRegola_(contesto.CONFIG, mista).length === 0);
  const circolari = contesto.CONFIG.regole.find(r => r.etichetta === 'Circolari');
  verifica('una regola senza mittenti (solo oggetto) cerca come prima', contesto._queryDellaRegola_(contesto.CONFIG, circolari).length === 1);
  // destinatari previsti ma nessuno rimasto: niente "to:()", niente filtro
  const aNessuno = { attiva: true, etichetta: 'Verbali', a: ['@PERSONALE@'], oggetto: ['verbale'] };
  verifica('destinatari vuoti: nessuna ricerca e nessun filtro',
    contesto._queryDellaRegola_(contesto.CONFIG, aNessuno).length === 0 &&
    contesto._criteriFiltro_(contesto.CONFIG, aNessuno).length === 0);
  contesto.CONFIG.personale = personaleVero;
}

intestazione('IL FILTRO DI GMAIL PRENDE QUELLO CHE PRENDE LA RICERCA');
{
  // "a" (destinatari) e "haAllegato": la ricerca dello script li usa, e il
  // filtro nativo non deve risultare piu' largo
  const regola = { attiva: true, etichetta: 'Verbali', a: ['@PERSONALE@'], haAllegato: true, oggetto: ['verbale'] };
  const q = contesto._queryDellaRegola_(contesto.CONFIG, regola);
  const c = contesto._criteriFiltro_(contesto.CONFIG, regola);
  verifica('la ricerca ha destinatari e allegato', q.length === 1 && /to:\(/.test(q[0]) && /has:attachment/.test(q[0]));
  verifica('e il filtro anche', c.length === 1 && /mario\.rossi@/.test(c[0].to || '') && c[0].hasAttachment === true &&
    c[0].subject === 'verbale');
  const soloAllegato = contesto._criteriFiltro_(contesto.CONFIG, { attiva: true, etichetta: 'Allegati', haAllegato: true });
  verifica('una regola con il solo allegato diventa un filtro sul solo allegato',
    soloAllegato.length === 1 && soloAllegato[0].hasAttachment === true && Object.keys(soloAllegato[0]).length === 1);
  const gia = [{ criteria: { subject: 'verbale', to: c[0].to }, action: { addLabelIds: ['id:x'] } }];
  verifica('un filtro uguale ma senza allegato non conta come gia\' presente',
    !contesto._filtroGiaPresente_(gia, c[0], 'id:x'));
  gia[0].criteria.hasAttachment = true;
  verifica('con l\'allegato si', contesto._filtroGiaPresente_(gia, c[0], 'id:x'));
}

intestazione('ANNULLA_progressoRiordino MENTRE IL RIORDINO LAVORA');
{
  proprieta.set('ORGGMAIL_PROGRESSO', JSON.stringify({ indice: 4, query: 0, fatti: {}, iniziato: '2026-09-01' }));
  trigger.push({ fn: 'PASSO_3_riordinaPostaEsistente', tipo: 'dopo', valore: 60000 });
  const bloccoVero = LockService.getUserLock;
  LockService.getUserLock = () => ({ tryLock: () => false, releaseLock: () => {} });
  const t = contesto.ANNULLA_progressoRiordino();
  LockService.getUserLock = bloccoVero;
  verifica('senza il blocco non tocca niente, e lo dice',
    t.indexOf('riprova fra un minuto') >= 0 && proprieta.has('ORGGMAIL_PROGRESSO') &&
    trigger.some(x => x.fn === 'PASSO_3_riordinaPostaEsistente'));
  const t2 = contesto.ANNULLA_progressoRiordino();
  verifica('con il blocco azzera davvero', !proprieta.has('ORGGMAIL_PROGRESSO') &&
    !trigger.some(x => x.fn === 'PASSO_3_riordinaPostaEsistente') && t2.indexOf('azzerato') >= 0);
}

intestazione('RIPRESA DEL RIORDINO QUANDO NON C\'E\' NIENTE DA RIPRENDERE');
{
  proprieta.delete('ORGGMAIL_PROGRESSO');
  trigger.push({ fn: 'PASSO_3_riordinaPostaEsistente', tipo: 'dopo', valore: 60000 });
  const primaDelNulla = chiamate.addToThreads;
  const t = contesto.PASSO_3_riordinaPostaEsistente({ triggerUid: 'finto' });
  verifica('una ripresa senza segnaposto non riparte da zero',
    chiamate.addToThreads === primaDelNulla && !proprieta.has('ORGGMAIL_PROGRESSO'));
  verifica('e toglie il suo trigger', !trigger.some(x => x.fn === 'PASSO_3_riordinaPostaEsistente'));

  // il blocco e' preso (per esempio da ANNULLA_etichettatura) e non c'e' un
  // riordino a meta': non si riprogramma
  const bloccoVero = LockService.getUserLock;
  LockService.getUserLock = () => ({ tryLock: () => false, releaseLock: () => {} });
  const t2 = contesto.PASSO_3_riordinaPostaEsistente();
  LockService.getUserLock = bloccoVero;
  verifica('occupato e senza riordino a meta\': non si riprogramma',
    !trigger.some(x => x.fn === 'PASSO_3_riordinaPostaEsistente') && t2.indexOf('riprova tu') >= 0);
}

intestazione('ANNULLA - rimozione delle etichette');
{
  // con tanta posta il tempo di Google finisce a meta': deve dirlo
  const toglieVera = Label.prototype.removeFromThreads;
  let volte = 0;
  Label.prototype.removeFromThreads = function (threads) {
    volte++;
    if (volte === 2) orologio += 10 * 60 * 1000;          // alla seconda tornata il tempo e' finito
    return toglieVera.call(this, threads);
  };
  // un riordino che stava ancora riprendendo da solo, a meta' strada
  proprieta.set('ORGGMAIL_PROGRESSO', JSON.stringify({ regola: 3, inizio: 0 }));
  trigger.push({ fn: 'PASSO_3_riordinaPostaEsistente', tipo: 'dopo', valore: 60000 });
  const interrotto = contesto.ANNULLA_etichettatura();
  Label.prototype.removeFromThreads = toglieVera;
  verifica('tempo finito a meta\': lo dice in cima, in modo che si veda',
    interrotto.indexOf('TEMPO SCADUTO A META\'') === 0);
  verifica('e non dice che le etichette sono vuote', interrotto.indexOf('ma vuote') < 0);
  verifica('e infatti qualche etichetta e\' rimasta',
    casella.some(t => [...t.labels].some(l => l.startsWith('Scuola/'))));
  verifica('il riordino in corso e\' fermato (niente ripresa, segnaposto azzerato)',
    !trigger.some(x => x.fn === 'PASSO_3_riordinaPostaEsistente') && !proprieta.has('ORGGMAIL_PROGRESSO'));
}
// un'etichetta di una regola spenta, con dentro una conversazione
const genitori = GmailApp.createLabel('Scuola/Genitori');
genitori.addToThreads([casella[0]]);
const finale = contesto.ANNULLA_etichettatura();
console.log(finale);
verifica('rieseguita finisce, e lo dice in cima', finale.indexOf('FATTO') === 0 && finale.indexOf('TEMPO SCADUTO') < 0);
verifica('le etichette delle regole spente non le tocca, ma le nomina',
  casella[0].labels.has('Scuola/Genitori') && finale.indexOf('regole spente, non toccate: Scuola/Genitori') >= 0);
genitori.removeFromThreads([casella[0]]);
verifica('nessuna conversazione ha piu\' le etichette dello strumento',
  casella.every(t => [...t.labels].every(l => !l.startsWith('Scuola/'))));
// le due riprese di Orari.gs, che sta nello stesso progetto, a meta' invio:
// quella degli orari dei docenti e quella degli orari delle classi
trigger.push({ fn: 'ORARI_2_invia', tipo: 'dopo', valore: 60000 });
trigger.push({ fn: 'ORARI_3_inviaOrariClassi', tipo: 'dopo', valore: 60000 });
const spenta = contesto.ANNULLA_automazione();
console.log(spenta);
verifica('nessun trigger residuo, nemmeno le riprese degli orari' +
  (trigger.length ? ' (restano: ' + trigger.map(t => t.fn).join(', ') + ')' : ''), trigger.length === 0);
verifica('e lo dice, nominandole tutte e due', spenta.indexOf('ripresa dell\'invio degli orari') > 0 &&
  spenta.indexOf('ORARI_2_invia') > 0 && spenta.indexOf('ORARI_3_inviaOrariClassi') > 0);
// con la sola ripresa degli orari delle classi
trigger.push({ fn: 'ORARI_3_inviaOrariClassi', tipo: 'dopo', valore: 60000 });
const soloClassi = contesto.ANNULLA_automazione();
verifica('anche la sola ripresa degli orari delle classi si ferma, e lo dice',
  trigger.length === 0 && soloClassi.indexOf('ripresa dell\'invio degli orari') > 0);

intestazione('SENZA GRUPPO: le etichette che hai gia\' vengono riempite');
{
  const conGruppo = [...etichette.keys()].filter(n => n.indexOf('Scuola/') === 0).length;
  verifica('con il gruppo le etichette stanno sotto "Scuola"', conGruppo > 0);

  // due etichette fatte a mano, come quelle che uno ha gia' in Gmail
  GmailApp.createLabel('Colleghi');
  GmailApp.createLabel('Studenti');
  const quante = etichette.size;
  contesto.CONFIG.prefissoEtichette = '';
  console.log(contesto.PASSO_2_creaEtichette());
  verifica('riusa quelle che ci sono, non le duplica',
    etichette.has('Colleghi') && etichette.has('Studenti') &&
    ![...etichette.keys()].some(n => n === 'Colleghi/Colleghi' || n === '/Colleghi'));
  verifica('le altre nascono senza barra',
    [...etichette.keys()].filter(n => n.indexOf('/') < 0).length > 2);
  verifica('quelle con il gruppo restano dov\'erano, intatte',
    [...etichette.keys()].filter(n => n.indexOf('Scuola/') === 0).length === conGruppo);
  verifica('e ne sono nate di nuove', etichette.size > quante);
  contesto.CONFIG.prefissoEtichette = 'Scuola';
}

// il codice di stato: CMP1-giorno-etichette-automazione-conversazioni-S|T<versione>
// (S: ha contato solo le etichette sue; T: anche quelle con gli stessi nomi)
function leggiCodice(c) {
  const m = /^CMP1-(\d{8})-(\d+)-([01])-(\d+)-([ST])(\d+)$/.exec(c);
  return m ? { etichette: +m[2], automazione: +m[3], conversazioni: +m[4],
               soloSue: m[5] === 'S', versione: +m[6] } : null;
}

intestazione('SENZA GRUPPO: ANNULLA toglie solo le etichette nate dallo script');
{
  // da capo: nessuna etichetta, nessuna memoria, posta intatta
  casella.forEach(t => { t.labels.clear(); t.inInbox = true; });
  etichette.clear();
  proprieta.clear();
  trigger.length = 0;
  orologio = 0;
  contesto.CONFIG.prefissoEtichette = '';
  contesto.CONFIG.provaSenzaModifiche = false;

  // "Colleghi" c'era gia': l'avevi messa tu, a mano, a una conversazione
  const aMano = GmailApp.createLabel('Colleghi');
  aMano.addToThreads([amico]);
  // e un'etichetta tua che con la scuola non c'entra
  GmailApp.createLabel('Viaggi').addToThreads([amico]);

  contesto.PASSO_3_riordinaPostaEsistente();
  verifica('il riordino riempie anche la "Colleghi" che c\'era', rossi.labels.has('Colleghi'));
  const create = JSON.parse(proprieta.get('ORGGMAIL_ETICHETTE_CREATE') || '[]');
  verifica('lo script si segna le etichette che crea',
    create.indexOf('Studenti') >= 0 && create.indexOf('Colleghi/Docenti') >= 0);
  verifica('e non quelle che c\'erano gia\'', create.indexOf('Colleghi') < 0 && create.indexOf('Viaggi') < 0);

  const codice = leggiCodice(contesto.EXTRA_codiceStato());
  const conversazioniCreate = casella.filter(t => [...t.labels].some(l => create.indexOf(l) >= 0)).length;
  verifica('il codice di stato conta solo le etichette dello strumento, non "Viaggi"',
    codice && codice.etichette === create.length);
  verifica('e le loro conversazioni', codice && codice.conversazioni >= conversazioniCreate &&
    codice.conversazioni > 0);
  verifica('il codice di stato dice la versione dello script',
    registro[registro.length - 1].indexOf('Versione dello script: ' + contesto._POSTA_VERSIONE) === 0);
  const [maggiore, minore, correzione] = contesto._POSTA_VERSIONE.split('.').map(Number);
  verifica('e la porta in coda al codice, in cifre (' + (codice && codice.versione) + ')',
    codice && codice.versione === maggiore * 10000 + minore * 100 + correzione);
  verifica('con la memoria dice che ha contato solo le etichette sue (S)', codice && codice.soloSue);

  const t = contesto.ANNULLA_etichettatura();
  console.log(t);
  verifica('la tua "Colleghi" resta sulla conversazione a cui l\'avevi messa', amico.labels.has('Colleghi'));
  verifica('e anche "Viaggi"', amico.labels.has('Viaggi'));
  verifica('le etichette nate dallo script sono vuote',
    casella.every(x => [...x.labels].every(l => create.indexOf(l) < 0)));
  verifica('il resoconto dice quale non ha toccato e perche\'',
    t.indexOf('FATTO') === 0 && /Non toccate, perche' non le ha create lo script: Colleghi\./.test(t));
  const dopo = leggiCodice(contesto.EXTRA_codiceStato());
  verifica('dopo ANNULLA il codice di stato non dice piu\' "fatto" (conversazioni 0)',
    dopo && dopo.conversazioni === 0);

  // uno script di una versione di prima non si segnava niente: si contano le
  // etichette delle regole, ma mai quelle che non c'entrano
  proprieta.delete('ORGGMAIL_ETICHETTE_CREATE');
  const vecchio = leggiCodice(contesto.EXTRA_codiceStato());
  verifica('senza memoria il codice conta le etichette delle regole, non "Viaggi"',
    vecchio && vecchio.conversazioni === casella.filter(x => x.labels.has('Colleghi')).length);
  verifica('e dice che fra quelle ci possono essere le tue (T): Campanella non ci crede',
    vecchio && !vecchio.soloSue);

  // Chi ha organizzato la posta con la 1.4.6 o prima e poi ha reincollato il
  // motore nuovo: le etichette delle regole le ha create lo script di allora,
  // che non se lo segnava. ANNULLA_etichettatura non le puo' svuotare e non
  // deve dire FATTO; per svuotarle c'e' ANNULLA_etichettaturaCompleta.
  // La casella come la lascia un PASSO_3 di allora: etichette piene, nessuna memoria.
  contesto.PASSO_3_riordinaPostaEsistente();
  verifica('(preparazione) etichette delle regole piene e nessuna memoria, come con la 1.4.6',
    !proprieta.has('ORGGMAIL_ETICHETTE_CREATE') && rossi.labels.has('Colleghi') &&
    esposito.labels.has('Studenti') && amico.labels.has('Colleghi'));
  const primaDiAnnullare = casella.map(x => [...x.labels].sort().join('|')).join('\n');
  const t2 = contesto.ANNULLA_etichettatura();
  console.log(t2);
  verifica('senza memoria ANNULLA non toglie niente',
    rossi.labels.has('Colleghi') && casella.map(x => [...x.labels].sort().join('|')).join('\n') === primaDiAnnullare);
  verifica('e non dice FATTO: in cima c\'e\' NIENTE DA TOGLIERE',
    t2.indexOf('NIENTE DA TOGLIERE') === 0 && t2.indexOf('FATTO') < 0);
  verifica('e non dice che le etichette restano vuote', t2.indexOf('ma vuote') < 0);
  verifica('nomina le etichette non toccate e la funzione che le svuota',
    /Non toccate, perche' non le ha create lo script: [^\n]*Colleghi/.test(t2) &&
    t2.indexOf('ANNULLA_etichettaturaCompleta') > 0);

  // ANNULLA_etichettaturaCompleta: prima di tutto il blocco, come l'altra
  const bloccoVero = LockService.getUserLock;
  LockService.getUserLock = () => ({ tryLock: () => false, releaseLock: () => {} });
  const occupata = contesto.ANNULLA_etichettaturaCompleta();
  LockService.getUserLock = bloccoVero;
  verifica('la versione completa aspetta il riordino in corso e non tocca niente',
    occupata.indexOf('riprova fra un minuto') >= 0 && rossi.labels.has('Colleghi'));

  // con molta posta il tempo finisce a meta': si riesegue, e riparte da li'
  proprieta.set('ORGGMAIL_PROGRESSO', JSON.stringify({ indice: 2, query: 0, fatti: {}, iniziato: '2026-09-01' }));
  trigger.push({ fn: 'PASSO_3_riordinaPostaEsistente', tipo: 'dopo', valore: 60000 });
  const toglieVera = Label.prototype.removeFromThreads;
  let volte = 0;
  Label.prototype.removeFromThreads = function (threads) {
    volte++;
    if (volte === 1) orologio += 10 * 60 * 1000;          // alla prima tornata il tempo e' finito
    return toglieVera.call(this, threads);
  };
  const meta = contesto.ANNULLA_etichettaturaCompleta();
  Label.prototype.removeFromThreads = toglieVera;
  orologio = 0;
  verifica('tempo finito a meta\': lo dice in cima e dice di rieseguire la versione completa',
    meta.indexOf('TEMPO SCADUTO A META\'') === 0 && meta.indexOf('Esegui di nuovo ANNULLA_etichettaturaCompleta') > 0);
  verifica('e anche li\' dice che svuota pure le etichette fatte a mano', /a mano/.test(meta.split('\n\n')[0]));
  verifica('il riordino in corso e\' fermato anche dalla versione completa',
    !trigger.some(x => x.fn === 'PASSO_3_riordinaPostaEsistente') && !proprieta.has('ORGGMAIL_PROGRESSO'));

  const t3 = contesto.ANNULLA_etichettaturaCompleta();
  console.log(t3);
  verifica('la versione completa svuota le etichette delle regole create da uno script di prima',
    !rossi.labels.has('Colleghi') && !esposito.labels.has('Studenti') &&
    casella.every(x => [...x.labels].every(l => l === 'Viaggi')));
  verifica('anche la "Colleghi" che avevi messo tu a mano, e lo dice in cima',
    !amico.labels.has('Colleghi') && t3.indexOf('FATTO') === 0 && /a mano/.test(t3.split('\n')[0]));
  verifica('ma non le etichette che non sono delle regole ("Viaggi")', amico.labels.has('Viaggi'));
  verifica('e le etichette restano in Gmail, vuote', etichette.has('Colleghi') && etichette.has('Studenti'));

  // un'etichetta nata dallo script e poi cancellata da te in Gmail viene dimenticata
  _memoriaCon(['Circolari', 'Sparita']);
  GmailApp.createLabel('Circolari');
  contesto.PASSO_2_creaEtichette();
  const memoria = JSON.parse(proprieta.get('ORGGMAIL_ETICHETTE_CREATE') || '[]');
  verifica('le etichette cancellate da Gmail escono dalla memoria',
    memoria.indexOf('Sparita') < 0 && memoria.indexOf('Circolari') >= 0);

  // con il gruppo non cambia niente: tutto quello che sta sotto "Scuola"
  contesto.CONFIG.prefissoEtichette = 'Scuola';
  GmailApp.createLabel('Scuola/Circolari').addToThreads([preside]);
  const conGruppo = leggiCodice(contesto.EXTRA_codiceStato());
  verifica('con il gruppo conta le etichette sotto il gruppo',
    conGruppo && conGruppo.etichette === [...etichette.keys()].filter(n => n.indexOf('Scuola/') === 0).length &&
    conGruppo.conversazioni >= 1);
  verifica('e sono tutte sue (S)', conGruppo && conGruppo.soloSue);
}
function _memoriaCon(nomi) { proprieta.set('ORGGMAIL_ETICHETTE_CREATE', JSON.stringify(nomi)); }

intestazione('LA POSTA VA SOLO A TE');
{
  // La promessa fatta al DPO: lo script manda email solo all'account in cui
  // gira. Qui passano tutte quelle mandate durante le prove qui sopra.
  verifica('le prove hanno mandato delle email, quindi il controllo vale (' + posta.length + ')',
    posta.length >= 2);
  const altrove = posta.filter(m => typeof m.a !== 'string' || m.a.trim().toLowerCase() !== IO);
  verifica('ogni email e\' andata solo al tuo indirizzo', altrove.length === 0);
  if (altrove.length) console.log('    verso: ' + altrove.map(m => String(m.a)).join(', '));
  const inCopia = posta.filter(m => { const o = m.opzioni || {}; return !!(o.cc || o.bcc); });
  verifica('nessuna in copia o in copia nascosta', inCopia.length === 0);
}

intestazione('RISULTATO');
if (fallimenti === 0) {
  console.log('  Tutte le prove superate.');
} else {
  console.log('  PROVE FALLITE: ' + fallimenti);
  process.exitCode = 1;
}
