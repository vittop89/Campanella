/**
 * Banco di prova per Organizzazione_Gmail.gs
 *
 *   node test/mock_apps_script.js [Configurazione.gs] [Organizzazione_Gmail.gs]
 *
 * Simula GmailApp, PropertiesService, ScriptApp, MailApp e Session con una
 * finta casella di posta, poi esegue i quattro passi e stampa cosa succede.
 * Serve a verificare le ricerche costruite, l'etichettatura a blocchi, la
 * ripresa dopo il tempo massimo e le funzioni di annullamento, senza dover
 * caricare nulla su Google. Con i file delle classi caricati fa girare ogni
 * funzione pubblica, anche con Gmail che rifiuta ricerche e filtri, e
 * controlla che gli indirizzi degli studenti non escano da nessuna parte. In
 * fondo controlla che ogni email mandata durante le prove sia andata solo
 * all'account stesso, senza copie.
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
    // chi ha scritto nella conversazione: il primo mittente e quelli delle
    // risposte (opzioni.mittenti). "from:" di Gmail li guarda tutti.
    this.mittenti = [this.from].concat((opzioni.mittenti || []).map(m => String(m).toLowerCase()));
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
        return t.mittenti.some(m => (v.startsWith('@') ? m.endsWith(v) : m === v));
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
let oggiFinto = null;             // se c'e', new Date() senza argomenti e' questo giorno
let sogliaInterruzione = Infinity; // dopo quante addToThreads far "scadere" il tempo

// ogni etichetta ha il suo id, come in Gmail: una cancellata e rifatta con
// lo stesso nome e' un'altra etichetta, con un altro id
let prossimaEtichetta = 1;

class Label {
  constructor(nome) { this.nome = nome; this.id = 'Label_' + (prossimaEtichetta++); }
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
  construct(target, args) { return (args.length === 0 && oggiFinto) ? new target(oggiFinto.getTime()) : new target(...args); }
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
// getActiveUser puo' tornare vuoto nei trigger: una prova lo svuota apposta
let indirizzoAttivo = IO;
const Session = {
  getActiveUser: () => ({ getEmail: () => indirizzoAttivo }),
  getEffectiveUser: () => ({ getEmail: () => IO }),
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
{
  const righe = anteprima.split('\n');
  verifica('le prime righe restano quelle di prima: versione, account, dominio, persone, periodo',
    righe[0].indexOf('ANTEPRIMA - ') === 0 && righe[1].indexOf('Versione dello script: ') === 0 &&
    righe[2].indexOf('Account: ') === 0 && righe[3].indexOf('Dominio scuola: ') === 0 &&
    righe[4].indexOf('Persone in elenco: ') === 0 && righe[5].indexOf('Periodo: ') === 0);
  verifica('e subito dopo l\'impronta della configurazione',
    /^Configurazione: impronta [0-9A-F]{8}$/.test(righe[6]) && righe[6].indexOf(contesto.CONFIG.impronta) > 0);
  verifica('nessuna riga dell\'anteprima supera i 100 caratteri',
    righe.every(r => r.length <= 100));
  const piatta = anteprima.replace(/\s+/g, ' ');
  // le etichette escluse da Studenti non ci sono ancora e le loro regole hanno
  // da etichettare: qui quei messaggi finiscono anche in Studenti
  verifica('Studenti e\' una stima per eccesso, e dice perche\'',
    piatta.indexOf('Nota: Scuola/Studenti e\' una stima per eccesso. Esclude le conversazioni con ' +
                   'Scuola/Colleghi (non esiste ancora), Scuola/Dirigenza (non esiste ancora), ' +
                   'Scuola/Segreteria (non esiste ancora)') >= 0);
  verifica('le altre regole no', (anteprima.match(/stima per eccesso/g) || []).length === 1 &&
    anteprima.indexOf('non esistono ancora') < 0);
  verifica('le regole che archiviano lo dicono', /^  Scuola\/Sindacati .*\(archivia\)$/m.test(anteprima));
}

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
{
  // anche l'anteprima: la regola rotta la segnala, e le altre le conta lo stesso
  let a = '';
  try { a = contesto.PASSO_1_anteprima(); } catch (e) { a = 'ERRORE: ' + e.message; }
  verifica('l\'anteprima non si ferma su una ricerca rifiutata, e la segnala',
    /^  Scuola\/Rotta +\? /m.test(a) && a.indexOf('Gmail non accetta la ricerca di questa regola') > 0 &&
    /^  Scuola\/Circolari +\d+ /m.test(a));
}
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

intestazione('UTENTE ATTIVO VUOTO, COME A VOLTE NEI TRIGGER');
{
  // Session.getActiveUser() puo' tornare vuoto: allora vale l'utente
  // effettivo, come fa Orari.gs. Con "(sconosciuto)" il riepilogo non partiva
  // e il proprio indirizzo finiva nell'elenco dei colleghi.
  indirizzoAttivo = '';
  verifica('senza utente attivo il mio indirizzo e\' quello dell\'utente effettivo',
    contesto._mioIndirizzo_() === IO);
  const postaPrima = posta.length;
  const tsv = contesto.EXTRA_elencaIndirizziScuola();
  const email = posta.slice(postaPrima);
  verifica('l\'email con l\'elenco parte lo stesso, a me',
    email.length === 1 && email[0].a === IO);
  verifica('e l\'elenco non contiene il mio indirizzo', tsv.length > 0 && !tsv.includes(IO));
  // nemmeno l'utente effettivo si legge: resta "(sconosciuto)", come prima
  const effettivoVero = Session.getEffectiveUser;
  Session.getEffectiveUser = () => { throw new Error('Autorizzazione richiesta'); };
  verifica('senza nessuno dei due resta "(sconosciuto)"', contesto._mioIndirizzo_() === '(sconosciuto)');
  Session.getEffectiveUser = effettivoVero;
  indirizzoAttivo = IO;
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

  // Un filtro creato da EXTRA_creaFiltriGmail e poi scelto in Campanella fra
  // quelli da togliere: EXTRA_togliFiltri lo toglie, e EXTRA_creaFiltriGmail
  // non deve rifarlo, se no le due funzioni si disfano a vicenda a ogni giro.
  {
    const veri = [];
    let prossimo = 1;
    contesto.Gmail = { Users: {
      Labels: { list: () => ({ labels: [...etichette.keys()].map(n => ({ name: n, id: 'id:' + n, type: 'user' })) }) },
      Settings: { Filters: {
        list: () => (veri.length ? { filter: JSON.parse(JSON.stringify(veri)) } : {}),
        create: f => { const c = JSON.parse(JSON.stringify(f)); c.id = 'C' + (prossimo++); veri.push(c); return c; },
        remove: (u, id) => {
          const i = veri.findIndex(f => f.id === id);
          if (i < 0) throw new Error('Requested entity was not found.');
          veri.splice(i, 1);
        }
      } }
    } };
    const sceltiPrima = contesto.CONFIG.filtriDaTogliere;
    delete contesto.CONFIG.filtriDaTogliere;
    contesto.EXTRA_creaFiltriGmail();
    const quanti = veri.length;
    const scelto = veri[0];
    const nome = scelto ? scelto.action.addLabelIds[0].replace(/^id:/, '') : '';
    const uguale = f => f.action.addLabelIds[0] === scelto.action.addLabelIds[0] &&
      JSON.stringify(f.criteria) === JSON.stringify(scelto.criteria);
    verifica('EXTRA_creaFiltriGmail crea i filtri delle regole (' + quanti + ', il primo per ' + nome + ')',
      quanti > 0 && nome !== '');
    contesto.CONFIG.filtriDaTogliere = [{ etichetta: nome, criteri: JSON.parse(JSON.stringify(scelto.criteria)) }];
    let tt = contesto.EXTRA_togliFiltri();
    verifica('scelto fra quelli da togliere, EXTRA_togliFiltri lo toglie, e solo lui',
      veri.length === quanti - 1 && !veri.some(uguale) && /Filtri di Gmail tolti adesso: 1\n/.test(tt));
    tt = contesto.EXTRA_creaFiltriGmail();
    console.log(tt);
    verifica('EXTRA_creaFiltriGmail non lo rifa\'', veri.length === quanti - 1 && !veri.some(uguale));
    verifica('e lo dice, con l\'etichetta, fra quelle che Gmail non smista da solo',
      new RegExp('Non creati, perche\' in Campanella li hai scelti fra i filtri da togliere \\(EXTRA_togliFiltri\\): ' +
                 nome.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).test(tt) &&
      new RegExp('tranne [^\\n]*' + nome.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).test(tt));
    tt = contesto.EXTRA_togliFiltri();
    verifica('e EXTRA_togliFiltri, rieseguita, non trova niente da togliere',
      veri.length === quanti - 1 && /Filtri di Gmail tolti adesso: 0\n/.test(tt) && /Gia' tolti prima/.test(tt));
    contesto.CONFIG.filtriDaTogliere = sceltiPrima;
    if (sceltiPrima === undefined) delete contesto.CONFIG.filtriDaTogliere;
    delete contesto.Gmail;
  }
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
{
  // un riordino, uno smistamento o un invio degli orari sta lavorando e tiene
  // il blocco: arrivato al tempo massimo riprogrammerebbe la sua ripresa
  // subito dopo. ANNULLA_automazione non tocca niente e non dice di aver spento.
  const primaDelBlocco = trigger.map(t => t.fn).join(', ');
  const bloccoVero = LockService.getUserLock;
  LockService.getUserLock = () => ({ tryLock: () => false, releaseLock: () => {} });
  const occupata = contesto.ANNULLA_automazione();
  LockService.getUserLock = bloccoVero;
  verifica('con il blocco preso ANNULLA_automazione non toglie nessun trigger (' + primaDelBlocco + ')',
    trigger.length >= 2 && trigger.map(t => t.fn).join(', ') === primaDelBlocco);
  verifica('e dice di riprovare fra un minuto, senza dire di aver spento qualcosa',
    occupata.indexOf('riprova fra un minuto') >= 0 && !/spenta|Fermata/.test(occupata));

  // un errore mentre toglie i trigger non lascia il blocco preso
  let presi = 0, lasciati = 0;
  LockService.getUserLock = () => ({ tryLock: () => { presi++; return true; }, releaseLock: () => { lasciati++; } });
  const cancellaVera = ScriptApp.deleteTrigger;
  ScriptApp.deleteTrigger = () => { throw new Error('Service invoked too many times'); };
  let errore = null;
  try { contesto.ANNULLA_automazione(); } catch (e) { errore = e; }
  ScriptApp.deleteTrigger = cancellaVera;
  LockService.getUserLock = bloccoVero;
  verifica('ANNULLA_automazione prende il blocco, e lo lascia anche se togliere un trigger fallisce',
    errore !== null && presi === 1 && lasciati === 1);
}
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

// La riga di una regola nella tabella dell'anteprima, divisa nelle colonne
// (nome, da etichettare, gia' etichettate, in Gmail, archivia), o null. Un
// nome troppo lungo per la colonna sta da solo, e i numeri vanno sotto.
function colonneAnteprima(testo, nome) {
  const righe = testo.split('\n');
  const i = righe.findIndex(x => x.indexOf('  ' + nome) === 0 && x.trim().split(/\s{2,}/)[0] === nome);
  if (i < 0) return null;
  const c = righe[i].trim().split(/\s{2,}/);
  return c.length > 1 ? c : [nome].concat((righe[i + 1] || '').trim().split(/\s{2,}/));
}
// La riga con i numeri di una regola: la sua, o quella sotto se il nome e' lungo.
function rigaNumeri(testo, nome) {
  const righe = testo.split('\n');
  const i = righe.findIndex(x => x.indexOf('  ' + nome) === 0 && x.trim().split(/\s{2,}/)[0] === nome);
  if (i < 0) return null;
  return righe[i].trim() === nome ? righe[i + 1] : righe[i];
}
function stesseColonne(testo, nome, attese) {
  const c = colonneAnteprima(testo, nome);
  return !!c && c.join(' | ') === attese.join(' | ');
}

intestazione('ANTEPRIMA DI UNA SCUOLA INVENTATA: NUMERI, ETICHETTE CHE CI SONO GIA\', DOPPIONI');
const configDiPrima = contesto.CONFIG;
{
  // Come la casella di chi ha trovato numeri strani nell'anteprima della
  // 1.5.0: nessun gruppo, le sottoetichette dei ruoli, una "Colleghi" fatta a
  // mano, la Dirigenza del passo 2 uguale al ruolo Dirigenza dell'elenco,
  // tanta posta dalla segreteria e il registro scritto con l'indirizzo sbagliato.
  casella.length = 0;
  etichette.clear();
  proprieta.clear();
  trigger.length = 0;
  orologio = 0;
  const S = 'scuola.example';
  indirizzoAttivo = 'docente@' + S;
  const preside = 'preside@' + S;
  const docenti = ['anna.bianchi', 'carlo.verdi', 'elena.neri', 'gino.gialli', 'ivo.viola', 'lia.rosa']
    .map(n => n + '@' + S);
  const amministrativi = ['marco.azzurri', 'nora.grigi'].map(n => n + '@' + S);
  contesto.CONFIG = {
    impronta: 'A1B2C3D4',
    dominioScuola: S,
    prefissoEtichette: '',
    provaSenzaModifiche: true,
    soloUltimiMesi: 0,
    escludiPostaInviata: true,
    personale: [preside].concat(docenti, amministrativi),
    gruppi: { Dirigenza: [preside], Docenti: docenti, Amministrativi: amministrativi },
    regole: [
      { attiva: true, etichetta: 'Dirigenza', da: [preside] },
      { attiva: true, etichetta: 'Segreteria', da: ['segreteria@' + S] },
      { attiva: true, etichetta: 'Circolari', oggetto: ['circolare'] },
      { attiva: true, etichetta: 'Registro elettronico', da: ['avvisi@registro.example'] },
      { attiva: true, etichetta: 'Colleghi', da: ['@PERSONALE@'] },
      { attiva: true, etichetta: 'Colleghi/Dirigenza', da: ['@GRUPPO:Dirigenza@'] },
      { attiva: true, etichetta: 'Colleghi/Docenti', da: ['@GRUPPO:Docenti@'] },
      { attiva: true, etichetta: 'Colleghi/Amministrativi', da: ['@GRUPPO:Amministrativi@'] },
      { attiva: true, etichetta: 'Studenti', da: ['@DOMINIO@'],
        escludiEtichette: ['Colleghi', 'Dirigenza', 'Segreteria'] },
      { attiva: true, etichetta: 'Ministero e USR', da: ['@istruzione.it', '@mim.gov.it'] },
      { attiva: true, etichetta: 'Sindacati', da: ['@sindacato.example'], archivia: true },
      { attiva: false, etichetta: 'Formazione e corsi', oggetto: ['corso'] }
    ]
  };
  const dalPreside = [];
  for (let i = 0; i < 13; i++) dalPreside.push(aggiungi(preside, 'Comunicazione del dirigente ' + i, ''));
  for (let i = 0; i < 520; i++) aggiungi('segreteria@' + S, 'Pratica ' + i, '');
  for (let i = 0; i < 4; i++) aggiungi('segreteria@' + S, 'Circolare n. ' + (i + 1), '');
  const dalPersonale = [];
  for (let i = 0; i < 40; i++) dalPersonale.push(aggiungi(docenti[i % docenti.length], 'Dipartimento ' + i, ''));
  for (let i = 0; i < 5; i++) dalPersonale.push(aggiungi(amministrativi[i % 2], 'Pratica del personale ' + i, ''));
  for (let i = 0; i < 30; i++) aggiungi('studente' + i + '@' + S, 'Domanda ' + i, '');
  // il registro scrive da un indirizzo, nell'app ne e' stato scritto un altro
  for (let i = 0; i < 25; i++) aggiungi('noreply@registro.example', 'Nuova valutazione ' + i, '');
  for (let i = 0; i < 37; i++) aggiungi('comunicazioni@istruzione.it', 'Nota ministeriale ' + i, '');
  const sindacali = [];
  for (let i = 0; i < 15; i++) sindacali.push(aggiungi('info@sindacato.example', 'Assemblea ' + i, ''));
  // "Colleghi" c'era gia': un filtro fatto a mano l'ha messa a quasi tutta la
  // posta del personale; "Sindacati" l'ha creata lo script, e se l'e' segnata
  GmailApp.createLabel('Colleghi').addToThreads(dalPersonale.slice(6).concat(dalPreside));
  GmailApp.createLabel('Sindacati').addToThreads(sindacali.slice(0, 12));
  _memoriaCon(['Sindacati']);
  const primaDellAnteprima = casella.map(t => [...t.labels].sort().join('|')).join('\n');

  const a = contesto.PASSO_1_anteprima();
  console.log(a);
  const piatta = a.replace(/\s+/g, ' ');
  verifica('l\'anteprima non tocca niente, nemmeno la memoria delle etichette create',
    casella.map(t => [...t.labels].sort().join('|')).join('\n') === primaDellAnteprima &&
    etichette.size === 2 && proprieta.get('ORGGMAIL_ETICHETTE_CREATE') === '["Sindacati"]');
  verifica('scrive l\'impronta della configurazione', a.split('\n')[6] === 'Configurazione: impronta A1B2C3D4');
  verifica('nessuna riga supera i 100 caratteri', a.split('\n').every(r => r.length <= 100));
  verifica('i numeri al tetto delle ricerche hanno il +: Segreteria 500+',
    stesseColonne(a, 'Segreteria', ['Segreteria', '500+', '-', 'da creare']) &&
    stesseColonne(a, 'Studenti', ['Studenti', '500+', '-', 'da creare']));
  verifica('e gli altri no: Dirigenza 13, Colleghi/Docenti 40',
    stesseColonne(a, 'Dirigenza', ['Dirigenza', '13', '-', 'da creare']) &&
    stesseColonne(a, 'Colleghi/Docenti', ['Colleghi/Docenti', '40', '-', 'da creare']));
  verifica('una "Colleghi" che c\'era gia\': 6 da etichettare, 52 gia\' etichettate, "esisteva gia\'"',
    stesseColonne(a, 'Colleghi', ['Colleghi', '6', '52', 'esisteva gia\'']));
  verifica('una creata dallo script lo dice, con quelle che ha gia\'',
    stesseColonne(a, 'Sindacati', ['Sindacati', '3', '12', 'creata dallo script', '(archivia)']));
  verifica('una regola spenta non c\'e\'', a.indexOf('Formazione e corsi') < 0);
  verifica('il totale ha il + perche\' qualche ricerca e\' al tetto', /^Totale da etichettare: \d+\+ /m.test(a));
  verifica('dice che cosa vuol dire "esisteva gia\'" e che cosa fanno le due ANNULLA',
    piatta.indexOf('ESISTEVA GIA\': l\'etichetta c\'era prima dello script') >= 0 &&
    piatta.indexOf('ANNULLA_etichettatura non la svuota, ANNULLA_etichettaturaCompleta si\'') >= 0);
  {
    const righe = a.split('\n');
    const i = righe.findIndex(r => r.indexOf('  Registro elettronico ') === 0);
    verifica('il registro con l\'indirizzo sbagliato: 0, e sotto il consiglio di controllare il mittente',
      stesseColonne(a, 'Registro elettronico', ['Registro elettronico', '0', '-', 'da creare']) &&
      i > 0 && (righe[i + 1] + ' ' + righe[i + 2]).replace(/\s+/g, ' ').trim() ===
        'nessun messaggio da questi mittenti: controlla gli indirizzi (per il registro elettronico, ' +
        'guarda il mittente vero di una notifica)');
    verifica('e solo li\'', (a.match(/nessun messaggio da questi mittenti/g) || []).length === 1);
  }
  verifica('Studenti e\' una stima per eccesso, per le escluse che devono ancora prendere messaggi',
    piatta.indexOf('Nota: Studenti e\' una stima per eccesso. Esclude le conversazioni con Colleghi ' +
      '(deve prenderne ancora 6), Dirigenza (non esiste ancora), Segreteria (non esiste ancora)') >= 0);
  verifica('il doppione della Dirigenza, con il consiglio',
    piatta.indexOf('Regole che mettono due etichette agli stessi messaggi: - Dirigenza e ' +
      'Colleghi/Dirigenza: stessi mittenti, ogni messaggio prende tutte e due. Se ne vuoi una sola, ' +
      'spegni la regola Dirigenza nel passo 4 di Campanella (la sottoetichetta per ruolo resta).') >= 0);
  verifica('e nessun altro: non Colleghi con le sue sottoetichette, non Dirigenza con tutto il personale',
    a.split('\n').filter(r => r.indexOf('  - ') === 0).length === 1);

  // la configurazione di prima della 1.5.1 non ha l'impronta
  delete contesto.CONFIG.impronta;
  const senza = contesto.PASSO_1_anteprima();
  verifica('senza impronta lo dice: generata da una versione precedente',
    senza.split('\n')[6] === 'Configurazione: senza impronta: generata da una versione precedente di Campanella.');
  contesto.CONFIG.impronta = 'A1B2C3D4';

  // Dopo il riordino vero le etichette escluse sono piene e le loro regole non
  // hanno piu' niente da etichettare: il conto di Studenti e' giusto
  contesto.CONFIG.provaSenzaModifiche = false;
  contesto.PASSO_3_riordinaPostaEsistente();
  aggiungi('studente.nuovo@' + S, 'Domanda nuova', '');
  // un ruolo senza posta: 0, ma nessun indirizzo scritto a mano da controllare
  contesto.CONFIG.gruppi.Tecnici = ['tecnico@' + S];
  contesto.CONFIG.regole.splice(8, 0, { attiva: true, etichetta: 'Colleghi/Tecnici', da: ['@GRUPPO:Tecnici@'] });
  const dopo = contesto.PASSO_1_anteprima();
  console.log(dopo);
  verifica('dopo il riordino nessuna stima per eccesso: le escluse sono piene',
    dopo.indexOf('stima per eccesso') < 0 && dopo.indexOf('non esist') < 0 &&
    stesseColonne(dopo, 'Studenti', ['Studenti', '1', '30', 'creata dallo script']));
  verifica('le etichette create dal riordino sono "creata dallo script", la Colleghi di prima no',
    stesseColonne(dopo, 'Dirigenza', ['Dirigenza', '0', '13', 'creata dallo script']) &&
    stesseColonne(dopo, 'Colleghi', ['Colleghi', '0', '58', 'esisteva gia\'']));
  verifica('anche le gia\' etichettate si fermano al tetto: Segreteria 500+',
    stesseColonne(dopo, 'Segreteria', ['Segreteria', '0', '500+', 'creata dallo script']));
  verifica('una regola che ha gia\' etichettato tutto non riceve il consiglio sugli indirizzi, ' +
    'ne\' un ruolo senza posta: resta solo il registro',
    stesseColonne(dopo, 'Colleghi/Tecnici', ['Colleghi/Tecnici', '0', '-', 'da creare']) &&
    (dopo.match(/nessun messaggio da questi mittenti/g) || []).length === 1);
  contesto.CONFIG.regole.splice(8, 1);
  delete contesto.CONFIG.gruppi.Tecnici;

  // i doppioni, regola per regola
  const cfgD = { dominioScuola: S, prefissoEtichette: '', personale: [preside].concat(docenti),
                 gruppi: { Dirigenza: [preside], Docenti: docenti } };
  const preside1 = { attiva: true, etichetta: 'Preside', da: ['PRESIDE@' + S] };
  const vice = { attiva: true, etichetta: 'Vicepresidenza', da: [preside, 'vice@' + S] };
  const verbali = { attiva: true, etichetta: 'Verbali', da: [preside], oggetto: ['verbale'] };
  const dominio = { attiva: true, etichetta: 'Tutta la scuola', da: ['@DOMINIO@'] };
  const ruolo = { attiva: true, etichetta: 'Colleghi/Dirigenza', da: ['@GRUPPO:Dirigenza@'] };
  const tutti = { attiva: true, etichetta: 'Colleghi', da: ['@PERSONALE@'] };
  const d = contesto._doppioni_(cfgD, [preside1, vice, verbali, dominio, ruolo, tutti]);
  console.log('    ' + d.join('\n    '));
  verifica('mittenti dentro quelli di un\'altra regola: lo dice, e consiglia di spegnere la piu\' piccola',
    d.indexOf('Preside e Vicepresidenza: i mittenti di Preside sono tutti anche in Vicepresidenza, ' +
      'quindi ogni messaggio di Preside prende tutte e due. Se ti basta Vicepresidenza, spegni la ' +
      'regola Preside nel passo 4 di Campanella.') >= 0);
  verifica('gli indirizzi si confrontano in minuscolo, e i gruppi espansi',
    d.indexOf('Preside e Colleghi/Dirigenza: stessi mittenti, ogni messaggio prende tutte e due. ' +
      'Se ne vuoi una sola, spegni la regola Preside nel passo 4 di Campanella (la sottoetichetta ' +
      'per ruolo resta).') >= 0);
  verifica('una sottoetichetta per ruolo dentro un\'altra regola: niente consiglio, non si spegne da sola',
    d.indexOf('Colleghi/Dirigenza e Vicepresidenza: i mittenti di Colleghi/Dirigenza sono tutti anche ' +
      'in Vicepresidenza, quindi ogni messaggio di Colleghi/Dirigenza prende tutte e due.') >= 0);
  verifica('e nient\'altro: non con altri criteri, non con @DOMINIO@, non la madre con la figlia (' +
    d.length + ' coppie)', d.length === 3 && !d.some(f => /Verbali|Tutta la scuola|^Colleghi e /.test(f)));
  verifica('due regole uguali qualsiasi: spegnine una',
    contesto._doppioni_(cfgD, [vice, { attiva: true, etichetta: 'Presidenza', da: ['vice@' + S, preside] }])
      .join('') === 'Vicepresidenza e Presidenza: stessi mittenti, ogni messaggio prende tutte e due. ' +
      'Se ne vuoi una sola, spegni una delle due regole nel passo 4 di Campanella.');
}
contesto.CONFIG = configDiPrima;
indirizzoAttivo = IO;

intestazione('ANTEPRIMA: PIU\' MITTENTI, NOMI LUNGHI, UN GRUPPO DELLA 1.4');
{
  const S = 'scuola.example';
  indirizzoAttivo = 'docente@' + S;
  function daCapo(cfg) {
    casella.length = 0;
    etichette.clear();
    proprieta.clear();
    trigger.length = 0;
    orologio = 0;
    contesto.CONFIG = cfg;
  }
  const persone = [];
  for (let i = 0; i < 25; i++) persone.push('collega' + i + '@' + S);

  // Una conversazione "rispondi a tutti" fra colleghi ha piu' mittenti. Con
  // piu' di 20 persone la regola Colleghi fa piu' ricerche, e la stessa
  // conversazione torna da due: il riordino la etichetta una volta sola, e
  // l'anteprima deve contarla una volta sola.
  daCapo({
    impronta: 'A1B2C3D4', dominioScuola: S, prefissoEtichette: '', provaSenzaModifiche: false,
    soloUltimiMesi: 0, escludiPostaInviata: true, personale: persone,
    regole: [{ attiva: true, etichetta: 'Colleghi', da: ['@PERSONALE@'] }]
  });
  verifica('(preparazione) con 25 persone la regola Colleghi fa due ricerche',
    contesto._queryDellaRegola_(contesto.CONFIG, contesto.CONFIG.regole[0]).length === 2);
  aggiungi(persone[0], 'Consiglio di classe', '', { mittenti: [persone[21]] });
  aggiungi(persone[1], 'Scambio ora', '');
  aggiungi(persone[22], 'Gita', '', { mittenti: [persone[3], persone[23]] });
  const prima = colonneAnteprima(contesto.PASSO_1_anteprima(), 'Colleghi');
  contesto.PASSO_3_riordinaPostaEsistente();
  const fatte = casella.filter(t => t.labels.has('Colleghi')).length;
  verifica('l\'anteprima conta una volta le conversazioni che tornano da due ricerche, come il ' +
    'riordino (' + (prima && prima[1]) + ' e ' + fatte + ')',
    fatte === 3 && !!prima && prima[1] === String(fatte));

  // Nomi lunghi: con un gruppo come "Istituto Comprensivo" molti nomi passano
  // i 30 caratteri. Le colonne restano allineate e le righe corte; un nome
  // troppo lungo va su una riga sua, con i numeri sotto.
  const G = 'Istituto Comprensivo/';
  daCapo({
    impronta: 'A1B2C3D4', dominioScuola: S, prefissoEtichette: 'Istituto Comprensivo',
    provaSenzaModifiche: true, soloUltimiMesi: 0, escludiPostaInviata: true,
    personale: persone.slice(0, 3), gruppi: { Amministrativi: [persone[2]] },
    regole: [
      { attiva: true, etichetta: 'Dirigenza', da: ['preside@' + S] },
      { attiva: true, etichetta: 'Registro elettronico', da: ['@registro.example'], archivia: true },
      { attiva: true, etichetta: 'Colleghi', da: ['@PERSONALE@'] },
      { attiva: true, etichetta: 'Colleghi/Amministrativi', da: ['@GRUPPO:Amministrativi@'] },
      { attiva: true, etichetta: 'Comunicazioni sindacali regionali', da: ['@sindacato.example'],
        archivia: true }
    ]
  });
  for (let i = 0; i < 12; i++) aggiungi('preside@' + S, 'Nota ' + i, '');
  const voti = [];
  for (let i = 0; i < 30; i++) voti.push(aggiungi('avvisi@registro.example', 'Voto ' + i, ''));
  for (let i = 0; i < 7; i++) aggiungi(persone[i % 3], 'Riunione ' + i, '');
  const assemblee = [];
  for (let i = 0; i < 530; i++) assemblee.push(aggiungi('info@sindacato.example', 'Assemblea ' + i, ''));
  // due etichette le ha gia' create lo script, e archiviano: le righe piu' larghe
  GmailApp.createLabel(G + 'Registro elettronico').addToThreads(voti.slice(0, 10));
  GmailApp.createLabel(G + 'Comunicazioni sindacali regionali').addToThreads(assemblee.slice(0, 20));
  _memoriaCon([G + 'Registro elettronico', G + 'Comunicazioni sindacali regionali']);
  const lunga = contesto.PASSO_1_anteprima();
  console.log(lunga);
  const righeL = lunga.split('\n');
  const lunghe = righeL.filter(r => r.length > 100);
  verifica('con nomi lunghi nessuna riga supera i 100 caratteri' +
    (lunghe.length ? ': ' + lunghe[0].length + ' in "' + lunghe[0] + '"' : ''), lunghe.length === 0);
  const testata = righeL.find(r => r.indexOf('  ETICHETTA') === 0) || '';
  const fineDa = testata.indexOf('DA ETICHETTARE') + 'DA ETICHETTARE'.length;
  const fineGia = testata.indexOf('GIA\' ETICHETTATE') + 'GIA\' ETICHETTATE'.length;
  const nomi = ['Dirigenza', 'Registro elettronico', 'Colleghi', 'Colleghi/Amministrativi',
                'Comunicazioni sindacali regionali'].map(n => G + n);
  const storte = nomi.filter(n => {
    const r = rigaNumeri(lunga, n) || '';
    return !(/\S/.test(r.charAt(fineDa - 1)) && r.charAt(fineDa) === ' ' &&
             /\S/.test(r.charAt(fineGia - 1)) && r.charAt(fineGia) === ' ');
  });
  verifica('e i numeri finiscono tutti sotto la fine della loro intestazione' +
    (storte.length ? ' (non: ' + storte.join(', ') + ')' : ''), fineDa > 20 && storte.length === 0);
  verifica('i nomi che ci stanno restano sulla riga dei numeri',
    stesseColonne(lunga, G + 'Dirigenza', [G + 'Dirigenza', '12', '-', 'da creare']) &&
    rigaNumeri(lunga, G + 'Dirigenza').indexOf('  ' + G + 'Dirigenza ') === 0);
  verifica('quelli troppo lunghi hanno i numeri sotto, con tutte le colonne',
    stesseColonne(lunga, G + 'Comunicazioni sindacali regionali', [G + 'Comunicazioni sindacali regionali',
      '500+', '20', 'creata dallo script', '(archivia)']) &&
    righeL.indexOf('  ' + G + 'Comunicazioni sindacali regionali') > 0);

  // Con il gruppo "Scuola" (quello di partenza fino alla 1.4) le etichette le
  // ha create lo script di allora, che non se lo segnava: "esisteva gia'"
  // deve dirlo anche con il gruppo, non solo senza.
  daCapo({
    impronta: 'A1B2C3D4', dominioScuola: S, prefissoEtichette: 'Scuola', provaSenzaModifiche: true,
    soloUltimiMesi: 0, escludiPostaInviata: true, personale: persone.slice(0, 3),
    regole: [
      { attiva: true, etichetta: 'Dirigenza', da: ['preside@' + S] },
      { attiva: true, etichetta: 'Colleghi', da: ['@PERSONALE@'] }
    ]
  });
  const dalPreside = [];
  for (let i = 0; i < 5; i++) dalPreside.push(aggiungi('preside@' + S, 'Circolare ' + i, ''));
  GmailApp.createLabel('Scuola/Dirigenza').addToThreads(dalPreside);
  GmailApp.createLabel('Scuola/Colleghi');
  const vecchio = contesto.PASSO_1_anteprima();
  const piattaV = vecchio.replace(/\s+/g, ' ');
  verifica('con il gruppo e senza memoria: "esisteva gia\'"',
    stesseColonne(vecchio, 'Scuola/Dirigenza', ['Scuola/Dirigenza', '0', '5', 'esisteva gia\'']));
  verifica('e la nota dice che puo\' averla creata una versione fino alla 1.4.6, e che ' +
    'ANNULLA_etichettatura la svuota lo stesso',
    piattaV.indexOf('ESISTEVA GIA\': l\'etichetta c\'era prima dello script (o l\'ha creata una ' +
      'versione fino alla 1.4.6, che non se lo segnava).') >= 0 &&
    piattaV.indexOf('sta dentro "Scuola", quindi ANNULLA_etichettatura la svuota comunque') >= 0);
}
contesto.CONFIG = configDiPrima;
indirizzoAttivo = IO;

intestazione('I COLORI DELLE ETICHETTE');
{
  const S = 'scuola.example';
  indirizzoAttivo = 'docente@' + S;
  // I colori che Gmail accetta, come li elenca la documentazione dell'API
  // (Label.color). Il motore deve avere proprio questi, e il servizio finto
  // qui sotto rifiuta tutti gli altri, come quello vero.
  const TAVOLOZZA = [
    '#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#f3f3f3', '#ffffff',
    '#fb4c2f', '#ffad47', '#fad165', '#16a766', '#43d692', '#4a86e8', '#a479e2', '#f691b3',
    '#f6c5be', '#ffe6c7', '#fef1d1', '#b9e4d0', '#c6f3de', '#c9daf8', '#e4d7f5', '#fcdee8',
    '#efa093', '#ffd6a2', '#fce8b3', '#89d3b2', '#a0eac9', '#a4c2f4', '#d0bcf1', '#fbc8d9',
    '#e66550', '#ffbc6b', '#fcda83', '#44b984', '#68dfa9', '#6d9eeb', '#b694e8', '#f7a7c0',
    '#cc3a21', '#eaa041', '#f2c960', '#149e60', '#3dc789', '#3c78d8', '#8e63ce', '#e07798',
    '#ac2b16', '#cf8933', '#d5ae49', '#0b804b', '#2a9c68', '#285bac', '#653e9b', '#b65775',
    '#822111', '#a46a21', '#aa8831', '#076239', '#1a764d', '#1c4587', '#41236d', '#83334c',
    '#464646', '#e7e7e7', '#0d3472', '#b6cff5', '#0d3b44', '#98d7e4', '#3d188e', '#e3d7ff',
    '#711a36', '#fbd3e0', '#8a1c0a', '#f2b2a8', '#7a2e0b', '#ffc8af', '#7a4706', '#ffdeb5',
    '#594c05', '#fbe983', '#684e07', '#fdedc1', '#0b4f30', '#b3efd3', '#04502e', '#a2dcc1',
    '#c2c2c2', '#4986e7', '#2da2bb', '#b99aff', '#994a64', '#f691b2', '#ff7537', '#ffad46',
    '#662e37', '#ebdbde', '#cca6ac', '#094228', '#42d692', '#16a765'
  ];
  const ordinata = a => JSON.stringify(a.slice().sort());
  const delMotore = contesto._COLORI_GMAIL || [];
  verifica('il motore conosce proprio i colori che Gmail accetta (' + delMotore.length + ')',
    TAVOLOZZA.length === 102 && ordinata(delMotore) === ordinata(TAVOLOZZA));

  // Il servizio avanzato "Gmail API", finto, sopra le etichette finte. Come
  // quello vero: l'elenco non dice i colori (li dice get), patch vuole sfondo
  // e testo insieme e solo dalla tavolozza, e le etichette di sistema ci sono.
  const api = { get: 0, patch: [] };
  let patchRotto = false;
  function gmailFinto() {
    const perId = id => [...etichette.values()].find(l => l.id === id);
    return { Users: {
      Labels: {
        list: () => ({ labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }].concat(
          [...etichette.values()].map(l => ({ id: l.id, name: l.nome, type: 'user' }))) }),
        get: (utente, id) => {
          api.get++;
          const l = perId(id);
          if (utente !== 'me' || !l) throw new Error('Requested entity was not found.');
          return { id, name: l.nome, type: 'user', color: l.colore ? Object.assign({}, l.colore) : undefined };
        },
        patch: (risorsa, utente, id) => {
          if (patchRotto) throw new Error('Service unavailable');
          const l = perId(id);
          if (utente !== 'me' || !l) throw new Error('Requested entity was not found.');
          const c = (risorsa && risorsa.color) || {};
          if (TAVOLOZZA.indexOf(c.backgroundColor) < 0 || TAVOLOZZA.indexOf(c.textColor) < 0) {
            throw new Error('Label color ' + c.backgroundColor + ' is not on the allowed color palette');
          }
          api.patch.push({ nome: l.nome, sfondo: c.backgroundColor, testo: c.textColor });
          l.colore = { backgroundColor: c.backgroundColor, textColor: c.textColor };
          return { id, name: l.nome, color: Object.assign({}, l.colore) };
        }
      },
      Settings: { Filters: { list: () => ({ filter: [] }), create: f => f } }
    } };
  }
  const colore = n => {
    const l = etichette.get(n);
    return !l ? '(non c\'e\')' : l.colore ? l.colore.backgroundColor + '/' + l.colore.textColor : '';
  };
  const fotografia = () => JSON.stringify([...etichette.values()].map(l => [l.nome, l.colore || null]));
  function daCapo(prova) {
    casella.length = 0;
    etichette.clear();
    proprieta.clear();
    trigger.length = 0;
    orologio = 0;
    api.get = 0;
    api.patch.length = 0;
    patchRotto = false;
    contesto.CONFIG = {
      impronta: 'A1B2C3D4', dominioScuola: S, prefissoEtichette: 'Scuola', provaSenzaModifiche: prova,
      soloUltimiMesi: 0, escludiPostaInviata: true, giorniPostaNuova: 3,
      personale: ['anna.bianchi@' + S], gruppi: { Docenti: ['anna.bianchi@' + S] },
      regole: [
        { attiva: true, etichetta: 'Dirigenza', da: ['preside@' + S], colore: { sfondo: '#cc3a21', testo: '#ffffff' } },
        { attiva: true, etichetta: 'Colleghi', da: ['@PERSONALE@'], colore: { sfondo: '#4a86e8', testo: '#000000' } },
        { attiva: true, etichetta: 'Colleghi/Docenti', da: ['@GRUPPO:Docenti@'],
          colore: { sfondo: '#A4C2F4', testo: '#000000' } },
        { attiva: true, etichetta: 'Circolari', oggetto: ['circolare'] },
        { attiva: true, etichetta: 'Sindacati', da: ['@sindacato.example'], colore: { sfondo: '#123456', testo: '#ffffff' } },
        { attiva: false, etichetta: 'Genitori', da: ['@genitori.example'], colore: { sfondo: '#a46a21', testo: '#ffffff' } }
      ]
    };
  }

  // --- senza il servizio Gmail API: niente colori, niente errori ------------
  daCapo(false);
  delete contesto.Gmail;
  let t = '', errore = null;
  try { t = contesto.PASSO_2_creaEtichette(); } catch (e) { errore = e; }
  verifica('senza il servizio Gmail API le etichette nascono lo stesso, senza colore',
    !errore && etichette.has('Scuola/Dirigenza') && [...etichette.values()].every(l => !l.colore));
  verifica('e PASSO_2 dice che manca il servizio, e come si attiva',
    /3 etichette nuove sono nate senza il colore scelto in Campanella: manca il servizio "Gmail API"/.test(t) &&
    t.indexOf('Servizi -> "+"') > 0 && t.indexOf('EXTRA_coloraEtichette') > 0);
  let senza1 = '', senza2 = '';
  errore = null;
  try { senza1 = contesto.EXTRA_coloraEtichette(); senza2 = contesto.EXTRA_coloraTutteLeEtichette(); } catch (e) { errore = e; }
  verifica('senza servizio le due funzioni dei colori non si fermano con un errore, e non cambiano niente',
    !errore && [...etichette.values()].every(l => !l.colore));
  verifica('e spiegano come attivarlo, ognuna con il suo nome',
    senza1.indexOf('NON ATTIVO') >= 0 && senza1.indexOf('Servizi -> "+" -> scegli "Gmail API"') > 0 &&
    senza1.indexOf('EXTRA_coloraEtichette.') > 0 && senza2.indexOf('EXTRA_coloraTutteLeEtichette.') > 0);
  {
    const a = contesto.PASSO_1_anteprima().split('\n');
    const riga = a.find(r => r.indexOf('Colori: ') === 0) || '';
    verifica('l\'anteprima dice quante etichette hanno un colore e che senza servizio non si applicano',
      riga === 'Colori: 3 etichette con un colore, ma senza il servizio Gmail API non si possono applicare.');
    verifica('in una riga sola, sotto l\'impronta, prima della tabella',
      a.indexOf(riga) > 6 && a.indexOf(riga) < a.findIndex(r => r.indexOf('  ETICHETTA') === 0) &&
      a.every(r => r.length <= 100));
  }

  // --- con il servizio: le etichette nuove nascono colorate ------------------
  daCapo(false);
  contesto.Gmail = gmailFinto();
  {
    const riga = contesto.PASSO_1_anteprima().split('\n').find(r => r.indexOf('Colori: ') === 0) || '';
    verifica('con il servizio l\'anteprima dice che i colori si possono applicare',
      riga === 'Colori: 3 etichette con un colore; il servizio Gmail API c\'e\', quindi si possono applicare.');
  }
  t = contesto.PASSO_2_creaEtichette();
  console.log(t);
  verifica('le etichette create da PASSO_2 prendono il colore della loro regola',
    colore('Scuola/Dirigenza') === '#cc3a21/#ffffff' && colore('Scuola/Colleghi') === '#4a86e8/#000000' &&
    colore('Scuola/Colleghi/Docenti') === '#a4c2f4/#000000');
  verifica('il gruppo "Scuola", che non e\' una regola, resta senza colore', colore('Scuola') === '');
  verifica('una regola senza colore lascia la sua etichetta del colore di Gmail', colore('Scuola/Circolari') === '');
  verifica('un colore che Gmail non accetta si salta, senza nemmeno chiederlo a Gmail',
    colore('Scuola/Sindacati') === '' && api.patch.every(p => p.nome !== 'Scuola/Sindacati'));
  verifica('una regola spenta non crea e non colora niente', !etichette.has('Scuola/Genitori'));
  verifica('PASSO_2 lo dice: 3 colori dati, 1 saltato',
    t.indexOf('Colori dati alle etichette nuove: 3.') > 0 && t.indexOf('Colori saltati perche\' Gmail non li accetta: 1.') > 0);

  daCapo(false);
  contesto.Gmail = gmailFinto();
  contesto.PASSO_3_riordinaPostaEsistente();
  verifica('anche il riordino (PASSO_3) colora le etichette che crea',
    colore('Scuola/Dirigenza') === '#cc3a21/#ffffff' && colore('Scuola/Colleghi/Docenti') === '#a4c2f4/#000000');
  // l'hai cancellata da Gmail: lo smistamento la ricrea, gia' colorata
  etichette.delete('Scuola/Dirigenza');
  const nuova = aggiungi('preside@' + S, 'Convocazione', '', { giorniFa: 1 });
  contesto.smistaNuoviMessaggi();
  verifica('e anche lo smistamento, se deve ricrearne una',
    nuova.labels.has('Scuola/Dirigenza') && colore('Scuola/Dirigenza') === '#cc3a21/#ffffff');

  // in prova non si crea niente, e quindi non si colora niente
  daCapo(true);
  contesto.Gmail = gmailFinto();
  contesto.PASSO_2_creaEtichette();
  contesto.PASSO_3_riordinaPostaEsistente();
  verifica('in prova niente etichette e niente colori', etichette.size === 0 && api.patch.length === 0);

  // un errore di Gmail sul colore non ferma la creazione delle etichette
  daCapo(false);
  contesto.Gmail = gmailFinto();
  patchRotto = true;
  const primaDelGuasto = registro.length;
  errore = null;
  try { t = contesto.PASSO_2_creaEtichette(); } catch (e) { errore = e; }
  verifica('se Gmail rifiuta il colore le etichette nascono lo stesso, e lo dice',
    !errore && etichette.has('Scuola/Colleghi/Docenti') && t.indexOf('Colori non applicati: 3') > 0 &&
    registro.slice(primaDelGuasto).some(r => /Scuola\/Dirigenza": colore non applicato \(Service unavailable\)/.test(r)));

  // --- le etichette che c'erano gia' -------------------------------------------
  daCapo(true);
  contesto.Gmail = gmailFinto();
  GmailApp.createLabel('Scuola');
  // Dirigenza c'era, e le avevi dato tu un colore (verde)
  GmailApp.createLabel('Scuola/Dirigenza').colore = { backgroundColor: '#16a766', textColor: '#ffffff' };
  // Colleghi c'era, senza colore
  GmailApp.createLabel('Scuola/Colleghi');
  // Colleghi/Docenti l'ha creata lo script, con il colore di prima
  GmailApp.createLabel('Scuola/Colleghi/Docenti').colore = { backgroundColor: '#fb4c2f', textColor: '#000000' };
  _memoriaCon(['Scuola/Colleghi/Docenti']);
  // Circolari non ha colore nella configurazione: il tuo giallo resta
  GmailApp.createLabel('Scuola/Circolari').colore = { backgroundColor: '#fad165', textColor: '#000000' };
  const quante = etichette.size;

  const prima = fotografia();
  t = contesto.EXTRA_coloraEtichette();
  console.log(t);
  verifica('in prova EXTRA_coloraEtichette non cambia nessun colore, e non si segna niente',
    fotografia() === prima && api.patch.length === 0 && !proprieta.has('ORGGMAIL_COLORI_DATI'));
  verifica('e dice che cosa cambierebbe: Colleghi e Colleghi/Docenti',
    t.indexOf('MODALITA\' PROVA') === 0 && /Etichette da colorare: 2\n  - Scuola\/Colleghi\n  - Scuola\/Colleghi\/Docenti\n/.test(t));
  const tutteInProva = contesto.EXTRA_coloraTutteLeEtichette();
  verifica('in prova nemmeno EXTRA_coloraTutteLeEtichette, che direbbe anche la Dirigenza',
    fotografia() === prima && api.patch.length === 0 && /Etichette da colorare: 3\n/.test(tutteInProva) &&
    tutteInProva.indexOf('  - Scuola/Dirigenza') > 0);

  contesto.CONFIG.provaSenzaModifiche = false;
  t = contesto.EXTRA_coloraEtichette();
  console.log(t);
  verifica('colora un\'etichetta che c\'era gia\' ma non aveva colore', colore('Scuola/Colleghi') === '#4a86e8/#000000');
  verifica('e ricolora una creata dallo script', colore('Scuola/Colleghi/Docenti') === '#a4c2f4/#000000');
  verifica('ma non tocca il colore che avevi dato tu a un\'etichetta che c\'era gia\'',
    colore('Scuola/Dirigenza') === '#16a766/#ffffff');
  verifica('e lo dice, con la funzione che la ricolorerebbe',
    /Non toccate[^\n]*: Scuola\/Dirigenza\./.test(t) && t.indexOf('esegui EXTRA_coloraTutteLeEtichette') > 0);
  verifica('le etichette delle regole senza colore restano come sono', colore('Scuola/Circolari') === '#fad165/#000000');
  verifica('il colore che Gmail non accetta e\' saltato e segnalato',
    /Saltate, perche' Gmail non accetta il loro colore: Scuola\/Sindacati \(sfondo #123456, testo #ffffff\)/.test(t));
  verifica('a Gmail non arriva mai un colore fuori dalla sua tavolozza',
    api.patch.every(p => TAVOLOZZA.indexOf(p.sfondo) >= 0 && TAVOLOZZA.indexOf(p.testo) >= 0));

  const cambi = api.patch.length;
  t = contesto.EXTRA_coloraTutteLeEtichette();
  console.log(t);
  verifica('EXTRA_coloraTutteLeEtichette ricolora anche quella che avevi colorato tu',
    colore('Scuola/Dirigenza') === '#cc3a21/#ffffff' && api.patch.length === cambi + 1);
  verifica('e lo dice subito, in cima', t.indexOf('Questa funzione ricolora anche le etichette che c\'erano gia\'') === 0);
  verifica('ma nemmeno lei tocca le etichette delle regole senza colore', colore('Scuola/Circolari') === '#fad165/#000000');
  const ancora = contesto.EXTRA_coloraTutteLeEtichette();
  verifica('rieseguita non cambia niente: sono gia\' del colore scelto',
    api.patch.length === cambi + 1 && /Etichette colorate adesso: 0\nGia' del colore scelto: 3/.test(ancora));
  verifica('e nessuna etichetta e\' stata cancellata o creata', etichette.size === quante);

  // un riordino o uno smistamento in corso tiene il blocco: non si tocca niente
  daCapo(false);
  contesto.Gmail = gmailFinto();
  GmailApp.createLabel('Scuola/Colleghi');
  const bloccoVero = LockService.getUserLock;
  LockService.getUserLock = () => ({ tryLock: () => false, releaseLock: () => {} });
  t = contesto.EXTRA_coloraEtichette();
  LockService.getUserLock = bloccoVero;
  verifica('con il blocco preso non colora niente, e dice di riprovare',
    api.patch.length === 0 && colore('Scuola/Colleghi') === '' && t.indexOf('riprova fra un minuto') > 0);
  // e un'etichetta che manca non la crea: la creera' il riordino
  t = contesto.EXTRA_coloraEtichette();
  verifica('un\'etichetta che non c\'e\' ancora non la crea, lo dice',
    !etichette.has('Scuola/Dirigenza') && /Non ci sono ancora in Gmail: Scuola\/Dirigenza/.test(t));
  // PASSO_3 rifarebbe tutto il riordino (e manderebbe di nuovo il riepilogo):
  // per creare le etichette basta PASSO_2
  verifica('e dice che la crea PASSO_2, non il riordino da capo',
    t.indexOf('Le crea PASSO_2_creaEtichette, gia\' colorate.') > 0 && t.indexOf('PASSO_3') < 0);
  contesto.CONFIG.provaSenzaModifiche = true;
  t = contesto.EXTRA_coloraEtichette();
  verifica('in prova non dice che le crea PASSO_2 adesso: nasceranno quando togli la prova',
    /Non ci sono ancora in Gmail: Scuola\/Dirigenza/.test(t) && t.indexOf('Le crea PASSO_2') < 0 &&
    t.indexOf('Nasceranno gia\' colorate quando togli la modalita\' prova') > 0);

  // --- un colore dato dallo script segue la configurazione; uno tuo no ---------
  // un account riordinato con la 1.4.x: le etichette ci sono, senza colore,
  // e lo script non se ne ricorda nessuna
  const regola = n => contesto.CONFIG.regole.find(r => r.etichetta === n);
  daCapo(false);
  contesto.Gmail = gmailFinto();
  GmailApp.createLabel('Scuola');
  GmailApp.createLabel('Scuola/Colleghi');
  GmailApp.createLabel('Scuola/Colleghi/Docenti');
  contesto.EXTRA_coloraEtichette();
  verifica('le etichette di prima, senza colore, prendono il loro',
    colore('Scuola/Colleghi') === '#4a86e8/#000000' && colore('Scuola/Colleghi/Docenti') === '#a4c2f4/#000000');
  // in Campanella Colleghi diventa verde, e Docenti lo segue con la sua sfumatura
  regola('Colleghi').colore = { sfondo: '#16a766', testo: '#000000' };
  regola('Colleghi/Docenti').colore = { sfondo: '#89d3b2', testo: '#000000' };
  t = contesto.EXTRA_coloraEtichette();
  console.log(t);
  verifica('cambiato il colore in Campanella, le etichette colorate dallo script prendono quello nuovo',
    colore('Scuola/Colleghi') === '#16a766/#000000' && colore('Scuola/Colleghi/Docenti') === '#89d3b2/#000000' &&
    /Etichette colorate adesso: 2\n/.test(t) && t.indexOf('Non toccate') < 0);
  // poi in Gmail cambi tu il colore di Colleghi, e in Campanella torna blu
  etichette.get('Scuola/Colleghi').colore = { backgroundColor: '#fb4c2f', textColor: '#ffffff' };
  regola('Colleghi').colore = { sfondo: '#4a86e8', testo: '#000000' };
  regola('Colleghi/Docenti').colore = { sfondo: '#a4c2f4', testo: '#000000' };
  t = contesto.EXTRA_coloraEtichette();
  verifica('ma il colore che le hai dato tu dopo resta tuo, e lo dice',
    colore('Scuola/Colleghi') === '#fb4c2f/#ffffff' && colore('Scuola/Colleghi/Docenti') === '#a4c2f4/#000000' &&
    /Non toccate, perche' hanno un colore che non ha dato lo script[^\n]*: Scuola\/Colleghi\./.test(t));

  // --- un'etichetta nata dallo script, cancellata e rifatta da te ------------
  daCapo(false);
  contesto.Gmail = gmailFinto();
  contesto.PASSO_2_creaEtichette();
  const idCreate = () => JSON.parse(proprieta.get('ORGGMAIL_ETICHETTE_CREATE_ID') || '{}');
  verifica('lo script si segna anche l\'id delle etichette che crea',
    idCreate()['Scuola/Dirigenza'] === etichette.get('Scuola/Dirigenza').id &&
    idCreate()['Scuola/Circolari'] === etichette.get('Scuola/Circolari').id);
  // la cancelli da Gmail e ne fai una tua con lo stesso nome, verde
  etichette.delete('Scuola/Dirigenza');
  GmailApp.createLabel('Scuola/Dirigenza').colore = { backgroundColor: '#16a766', textColor: '#ffffff' };
  let cambiPrima = api.patch.length;
  t = contesto.EXTRA_coloraEtichette();
  verifica('un\'etichetta rifatta da te con lo stesso nome e\' tua: il suo verde resta',
    colore('Scuola/Dirigenza') === '#16a766/#ffffff' && api.patch.length === cambiPrima &&
    /Non toccate[^\n]*: Scuola\/Dirigenza\./.test(t));
  // e quando lo script dimentica quelle sparite, dimentica anche il loro id
  etichette.delete('Scuola/Circolari');
  contesto._potaCreate_();
  verifica('dimenticata un\'etichetta sparita, se ne dimentica anche l\'id',
    !('Scuola/Circolari' in idCreate()) && 'Scuola/Dirigenza' in idCreate());
  // se invece la ricrea lo script (qui lo smistamento), e' di nuovo sua
  etichette.delete('Scuola/Dirigenza');
  aggiungi('preside@' + S, 'Convocazione', '', { giorniFa: 1 });
  contesto.smistaNuoviMessaggi();
  regola('Dirigenza').colore = { sfondo: '#fb4c2f', testo: '#ffffff' };
  cambiPrima = api.patch.length;
  contesto.EXTRA_coloraEtichette();
  verifica('una rifatta dallo script invece e\' sua: segue il colore nuovo',
    idCreate()['Scuola/Dirigenza'] === etichette.get('Scuola/Dirigenza').id &&
    colore('Scuola/Dirigenza') === '#fb4c2f/#ffffff' && api.patch.length === cambiPrima + 1);

  // la configurazione di prima della 1.5.3 non ha colori
  daCapo(false);
  contesto.CONFIG.regole.forEach(r => { delete r.colore; });
  const vecchia = contesto.PASSO_1_anteprima().split('\n').find(r => r.indexOf('Colori: ') === 0);
  verifica('senza colori nella configurazione l\'anteprima dice che non ce ne sono',
    vecchia === 'Colori: nessuno scelto in Campanella.');
  contesto.CONFIG.provaSenzaModifiche = false;
  t = contesto.EXTRA_coloraTutteLeEtichette();
  verifica('e le funzioni dei colori non toccano niente', api.patch.length === 0 && /colorate adesso: 0/.test(t));
  delete contesto.Gmail;
}
contesto.CONFIG = configDiPrima;
indirizzoAttivo = IO;

intestazione('TOGLIERE I FILTRI DI GMAIL CHE AVEVI GIA\'');
{
  // Il servizio avanzato "Gmail API", finto: le etichette (con quelle di
  // sistema) e i filtri. Come quello vero: l'elenco dei filtri da' delle
  // copie, senza filtri non c'e' nemmeno la chiave "filter", e remove vuole
  // l'id di un filtro che c'e'.
  const S = 'scuola.example';
  casella.length = 0;
  etichette.clear();
  proprieta.clear();
  trigger.length = 0;
  orologio = 0;
  aggiungi('preside@' + S, 'Convocazione', '');
  aggiungi('info@famiglie.example', 'Colloqui', '');
  const filtri = [];
  const tolti = [];                 // { id, registro }: quante scritte c'erano quando e' stato tolto
  let rimozioneRotta = '';
  let prossimoFiltro = 1;
  function filtro(criteria, action) {
    const f = { id: 'F' + (prossimoFiltro++), criteria, action };
    filtri.push(f);
    return f;
  }
  const sistema = ['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT'].map(n => ({ id: n, name: n, type: 'system' }));
  function gmailFiltri() {
    return { Users: {
      Labels: { list: () => ({ labels: sistema.concat([...etichette.values()].map(l => ({ id: l.id, name: l.nome, type: 'user' }))) }) },
      Settings: { Filters: {
        list: () => (filtri.length ? { filter: JSON.parse(JSON.stringify(filtri)) } : {}),
        remove: (utente, id) => {
          if (utente !== 'me') throw new Error('Delegation denied');
          if (id === rimozioneRotta) throw new Error('Backend Error');
          const i = filtri.findIndex(f => f.id === id);
          if (i < 0) throw new Error('Requested entity was not found.');
          tolti.push({ id, registro: registro.length });
          filtri.splice(i, 1);
        },
        create: f => { throw new Error('qui non si crea niente: ' + JSON.stringify(f)); }
      } }
    } };
  }
  const famiglie = GmailApp.createLabel('Famiglie');
  const viaggi = GmailApp.createLabel('Viaggi');
  const circolari = GmailApp.createLabel('Circolari');
  const alunni = GmailApp.createLabel('Alunni');
  const riunioni = GmailApp.createLabel('Riunioni');
  famiglie.addToThreads([casella[1]]);
  // Gmail tiene anche due filtri uguali: vanno via tutti e due
  const fFamiglie = filtro({ query: 'from:(@famiglie.example)' }, { addLabelIds: [famiglie.id] });
  const fFamiglie2 = filtro({ query: 'from:(@famiglie.example)' }, { addLabelIds: [famiglie.id] });
  // un criterio in piu', o un'altra etichetta: sono altri filtri, restano
  const fInPiu = filtro({ query: 'from:(@famiglie.example)', hasAttachment: true }, { addLabelIds: [famiglie.id] });
  const fAltraEtichetta = filtro({ query: 'from:(@famiglie.example)' }, { addLabelIds: [viaggi.id] });
  const fCircolari = filtro({ subject: 'circolare', from: 'segreteria@' + S },
    { addLabelIds: [circolari.id], removeLabelIds: ['INBOX', 'UNREAD'] });
  // l'API scrive anche i criteri spenti: false, 'unspecified', spazi
  const fAlunni = filtro({ from: '  @studenti.' + S + ' ', hasAttachment: false, excludeChats: false,
                           sizeComparison: 'unspecified' }, { addLabelIds: [alunni.id, 'STARRED'] });
  // e le azioni che lo script non usa mai (qui un inoltro): la copia le riporta
  const fRiunioni = filtro({ query: 'riunione', negatedQuery: 'bozza', size: 5242880, sizeComparison: 'larger' },
    { addLabelIds: [riunioni.id], removeLabelIds: ['IMPORTANT'], forward: 'vice@' + S });
  const fTuo = filtro({ from: 'agenzia@viaggi.example' }, { addLabelIds: [viaggi.id] });
  const filtriPrima = JSON.stringify(filtri);
  const fotoEtichette = () => JSON.stringify([...etichette.values()].map(l => [l.nome, l.id]));
  const fotoPosta = () => JSON.stringify(casella.map(t => [t.id, [...t.labels].sort(), t.inInbox, t.unread]));
  const etichettePrima = fotoEtichette(), postaPrima = fotoPosta();

  contesto.CONFIG = {
    impronta: 'A1B2C3D4', dominioScuola: S, prefissoEtichette: '', provaSenzaModifiche: true,
    soloUltimiMesi: 0, escludiPostaInviata: true, inviaReport: true, personale: [],
    regole: [{ attiva: true, etichetta: 'Circolari', oggetto: ['circolare'] }],
    filtriDaTogliere: [
      // l'etichetta si confronta senza badare alle maiuscole
      { etichetta: 'famiglie', criteri: { query: 'from:(@famiglie.example)' } },
      // i criteri in un altro ordine sono gli stessi criteri
      { etichetta: 'Circolari', criteri: { from: 'segreteria@' + S, subject: 'circolare' } },
      { etichetta: 'Alunni', criteri: { from: '@studenti.' + S } },
      { etichetta: 'Riunioni', criteri: { query: 'riunione', negatedQuery: 'bozza', size: 5242880, sizeComparison: 'larger' } },
      { etichetta: 'Genitori', criteri: { query: 'from:(@genitori.example)' } },
      // senza criteri non e' un filtro: si salta, e lo dice
      { etichetta: 'Viaggi', criteri: {} }
    ]
  };

  // --- l'anteprima lo dice in una riga --------------------------------------
  {
    const a = contesto.PASSO_1_anteprima().split('\n');
    const i = a.findIndex(r => r.indexOf('filtri di Gmail da togliere') >= 0);
    verifica('l\'anteprima dice in una riga quanti filtri ci sono da togliere, e con quale funzione',
      i > 6 && a[i] === '5 filtri di Gmail da togliere: esegui EXTRA_togliFiltri (serve il servizio Gmail API).' &&
      i < a.findIndex(r => r.indexOf('  ETICHETTA') === 0) && a.every(r => r.length <= 100));
    const senza = contesto.CONFIG.filtriDaTogliere;
    contesto.CONFIG.filtriDaTogliere = [];
    verifica('e senza filtri da togliere non dice niente',
      contesto.PASSO_1_anteprima().indexOf('da togliere') < 0);
    contesto.CONFIG.filtriDaTogliere = senza;
  }

  // --- senza il servizio Gmail API: lo dice e non cambia niente ---------------
  delete contesto.Gmail;
  let t = '', errore = null;
  try { t = contesto.EXTRA_togliFiltri(); } catch (e) { errore = e; }
  verifica('senza il servizio Gmail API EXTRA_togliFiltri non si ferma con un errore e non toglie niente',
    !errore && JSON.stringify(filtri) === filtriPrima && tolti.length === 0);
  verifica('e spiega come attivarlo',
    t.indexOf('NON ATTIVO') >= 0 && t.indexOf('Servizi -> "+" -> scegli "Gmail API"') > 0 &&
    t.indexOf('EXTRA_togliFiltri') > 0);
  contesto.Gmail = { Users: { Labels: gmailFiltri().Users.Labels } };
  errore = null;
  try { t = contesto.EXTRA_togliFiltri(); } catch (e) { errore = e; }
  verifica('anche con il servizio a meta\' (senza i filtri) lo dice, senza errori', !errore && t.indexOf('NON ATTIVO') >= 0);

  // --- in prova: dice che cosa toglierebbe, e non toglie niente -----------------
  contesto.Gmail = gmailFiltri();
  const postaMandata = posta.length;
  t = contesto.EXTRA_togliFiltri();
  console.log(t);
  verifica('in prova non toglie nessun filtro e non si segna niente',
    tolti.length === 0 && JSON.stringify(filtri) === filtriPrima && !proprieta.has('ORGGMAIL_FILTRI_TOLTI'));
  verifica('e dice che cosa toglierebbe: i due di Famiglie, Circolari, Alunni e Riunioni',
    t.indexOf('MODALITA\' PROVA') === 0 && /Filtri di Gmail da togliere: 5\n/.test(t) &&
    (t.match(/Applica l'etichetta: Famiglie/g) || []).length === 2 && t.indexOf('Applica l\'etichetta: Riunioni') > 0);
  verifica('e che cosa non trova (Genitori), e la voce senza criteri',
    /Non trovati: 1\n  - Genitori/.test(t) && /[Ss]altat[ae][^\n]*: 1\n  - Viaggi/.test(t));
  verifica('in prova non manda nessuna email', posta.length === postaMandata);

  // --- con il blocco preso non tocca niente ----------------------------------
  contesto.CONFIG.provaSenzaModifiche = false;
  const bloccoVero = LockService.getUserLock;
  LockService.getUserLock = () => ({ tryLock: () => false, releaseLock: () => {} });
  t = contesto.EXTRA_togliFiltri();
  LockService.getUserLock = bloccoVero;
  verifica('con un\'altra esecuzione in corso non toglie niente, e dice di riprovare',
    tolti.length === 0 && JSON.stringify(filtri) === filtriPrima && t.indexOf('riprova fra un minuto') > 0);

  // --- sul serio -------------------------------------------------------------
  t = contesto.EXTRA_togliFiltri();
  console.log(t);
  const idTolti = tolti.map(x => x.id).sort().join(',');
  verifica('toglie proprio i filtri scelti (' + idTolti + ')',
    idTolti === [fFamiglie.id, fFamiglie2.id, fCircolari.id, fAlunni.id, fRiunioni.id].sort().join(','));
  verifica('non quello con un criterio in piu\', ne\' quello che mette un\'altra etichetta, ne\' gli altri',
    filtri.map(f => f.id).sort().join(',') === [fInPiu.id, fAltraEtichetta.id, fTuo.id].sort().join(',') &&
    JSON.stringify(filtri) === JSON.stringify(JSON.parse(filtriPrima).filter(f => [fInPiu.id, fAltraEtichetta.id, fTuo.id].indexOf(f.id) >= 0)));
  verifica('etichette e messaggi restano come erano', fotoEtichette() === etichettePrima && fotoPosta() === postaPrima);
  {
    // la copia di ogni filtro e' nel registro subito prima di toglierlo
    const copia = { [fFamiglie.id]: ['Contiene le parole: from:(@famiglie.example)', 'Applica l\'etichetta: Famiglie'],
                    [fFamiglie2.id]: ['Contiene le parole: from:(@famiglie.example)', 'Applica l\'etichetta: Famiglie'],
                    [fCircolari.id]: ['Da: segreteria@' + S, 'Oggetto: circolare', 'Applica l\'etichetta: Circolari',
                                      'Salta la Posta in arrivo (archivia)', 'Segna come gia\' letto'],
                    [fAlunni.id]: ['Da: @studenti.' + S, 'Applica l\'etichetta: Alunni', 'Aggiungi stella'],
                    [fRiunioni.id]: ['Contiene le parole: riunione', 'Non contiene: bozza', 'Dimensioni: maggiore di 5 MB',
                                     'Non contrassegnarlo mai come importante', 'Inoltralo a: vice@' + S] };
    const senzaCopia = tolti.filter(x => {
      const prima = registro[x.registro - 1] || '';
      return prima.indexOf('COPIA DEL FILTRO') !== 0 || !copia[x.id].every(pezzo => prima.indexOf(pezzo) >= 0);
    });
    verifica('prima di togliere ogni filtro ne scrive nel registro una copia completa, con i nomi delle etichette' +
      (senzaCopia.length ? ' (no: ' + senzaCopia.map(x => x.id).join(', ') + ')' : ''), tolti.length === 5 && senzaCopia.length === 0);
    verifica('la copia dice come rifarlo a mano', (registro[tolti[0].registro - 1] || '').indexOf('Crea un nuovo filtro') > 0);
  }
  verifica('il riepilogo dice quanti ne ha tolti, quale non trova e che le etichette restano',
    /^Filtri di Gmail tolti adesso: 5\n/.test(t) && /Non trovati: 1\n  - Genitori/.test(t) &&
    t.indexOf('Le etichette gia\' messe ai messaggi restano') >= 0 && t.indexOf('Gli altri filtri non li ho toccati') >= 0);
  const email = posta.slice(postaMandata);
  verifica('e lo manda anche per email, a te, con le copie',
    email.length === 1 && email[0].a === IO && /Filtri di Gmail tolti/.test(email[0].o) &&
    email[0].c.indexOf('Contiene le parole: from:(@famiglie.example)') >= 0 && email[0].c.indexOf('Non trovati: 1') >= 0);
  {
    const memoria = proprieta.get('ORGGMAIL_FILTRI_TOLTI') || '';
    verifica('si segna quali voci ha tolto, senza indirizzi ne\' parole', memoria !== '' &&
      memoria.indexOf('@') < 0 && memoria.indexOf('famiglie') < 0 && memoria.indexOf('riunione') < 0);
  }

  // --- rieseguita non toglie niente, e lo dice ----------------------------------
  const quantiTolti = tolti.length, postaDopo = posta.length;
  t = contesto.EXTRA_togliFiltri();
  console.log(t);
  verifica('rieseguita non toglie niente', tolti.length === quantiTolti && filtri.length === 3);
  verifica('e lo dice: niente da togliere, quattro gia\' tolti prima, Genitori non c\'e\'',
    t.indexOf('NIENTE DA TOGLIERE') === 0 && /Filtri di Gmail tolti adesso: 0\n/.test(t) &&
    /Gia' tolti prima da EXTRA_togliFiltri: 4\n/.test(t) && /Non trovati: 1\n  - Genitori/.test(t));
  verifica('e non manda un\'altra email', posta.length === postaDopo);

  // --- un filtro che Gmail non toglie: gli altri si', e lo dice --------------------
  const fRotto = filtro({ from: 'notizie@giornale.example' }, { addLabelIds: [viaggi.id] });
  const fAncora = filtro({ from: 'treni@viaggi.example' }, { addLabelIds: [viaggi.id] });
  rimozioneRotta = fRotto.id;
  contesto.CONFIG.inviaReport = false;
  contesto.CONFIG.filtriDaTogliere = [
    { etichetta: 'Viaggi', criteri: { from: 'notizie@giornale.example' } },
    { etichetta: 'Viaggi', criteri: { from: 'treni@viaggi.example' } }
  ];
  t = contesto.EXTRA_togliFiltri();
  verifica('un filtro che Gmail non toglie finisce fra i non riusciti, e gli altri vanno via lo stesso',
    filtri.some(f => f.id === fRotto.id) && !filtri.some(f => f.id === fAncora.id) &&
    /Non riusciti: 1\n  - Viaggi[^\n]*Backend Error/.test(t) && /Filtri di Gmail tolti adesso: 1\n/.test(t));
  verifica('senza il riepilogo per email non manda niente', posta.length === postaDopo);
  verifica('ancora una volta, etichette e messaggi intatti', fotoEtichette() === etichettePrima && fotoPosta() === postaPrima);

  // --- la copia dice le azioni con le parole della finestra di Gmail ----------------
  {
    const newsletter = GmailApp.createLabel('Newsletter');
    ['TRASH', 'SPAM', 'CATEGORY_PROMOTIONS'].forEach(n => sistema.push({ id: n, name: n, type: 'system' }));
    const fTutto = filtro({ query: 'unsubscribe' }, {
      addLabelIds: [newsletter.id, 'TRASH', 'STARRED', 'IMPORTANT', 'CATEGORY_PROMOTIONS'],
      removeLabelIds: ['SPAM'], forward: 'vice@' + S });
    const fMai = filtro({ query: 'offerta' }, { addLabelIds: [newsletter.id], removeLabelIds: ['IMPORTANT', 'INBOX'] });
    contesto.CONFIG.filtriDaTogliere = [
      { etichetta: 'Newsletter', criteri: { query: 'unsubscribe' } },
      { etichetta: 'Newsletter', criteri: { query: 'offerta' } }
    ];
    const prima = tolti.length;
    t = contesto.EXTRA_togliFiltri();
    const copiaDi = id => { const x = tolti.find(y => y.id === id); return x ? (registro[x.registro - 1] || '') : ''; };
    console.log(copiaDi(fTutto.id));
    const attese = {
      [fTutto.id]: ['Applica l\'etichetta: Newsletter', 'Eliminalo (va nel cestino)', 'Aggiungi stella',
                    'Contrassegna sempre come importante', 'Classifica come: Promozioni', 'Non inviarlo mai in Spam',
                    'Inoltralo a: vice@' + S],
      [fMai.id]: ['Non contrassegnarlo mai come importante', 'Salta la Posta in arrivo (archivia)'] };
    const storte = Object.keys(attese).filter(id => !attese[id].every(p => copiaDi(id).indexOf(p) >= 0));
    verifica('la copia dice elimina, stella, importante, categoria, spam e inoltro come la finestra "Crea un nuovo filtro"' +
      (storte.length ? ' (no: ' + storte.join(', ') + ')' : ''), tolti.length === prima + 2 && storte.length === 0);
    verifica('e non con i nomi del servizio Gmail API',
      [fTutto.id, fMai.id].every(id => copiaDi(id) !== '' && !/\b(TRASH|STARRED|IMPORTANT|CATEGORY_PROMOTIONS|SPAM)\b|forward/.test(copiaDi(id))));
  }

  // --- niente scelto in Campanella ----------------------------------------------
  delete contesto.CONFIG.filtriDaTogliere;
  errore = null;
  try { t = contesto.EXTRA_togliFiltri(); } catch (e) { errore = e; }
  verifica('senza filtri scelti in Campanella lo dice, e dice dove si scelgono',
    !errore && t.indexOf('Nessun filtro da togliere') === 0 && t.indexOf('passo 4') > 0);
  delete contesto.Gmail;
}
contesto.CONFIG = configDiPrima;
indirizzoAttivo = IO;

// il file di una classe come lo scrive Campanella (LeMieClassi.FileClasse): la
// classe, l'etichetta della regola per cui e' stato copiato e gli indirizzi.
// Piu' file nello stesso progetto si sommano, in qualunque ordine li legga Google
function fileClasse(nome, etichetta, indirizzi, copiato) {
  return '/* indirizzi degli studenti della ' + nome + ' */\n' +
    'var CLASSI_STUDENTI = (typeof CLASSI_STUDENTI !== \'undefined\' && CLASSI_STUDENTI) || {};\n' +
    'CLASSI_STUDENTI[' + JSON.stringify(nome) + '] = {\n' +
    '  etichetta: ' + JSON.stringify(etichetta) + ',\n' +
    (copiato ? '  copiato: ' + JSON.stringify(copiato) + ',\n' : '') +
    '  indirizzi: [\n' + indirizzi.map(x => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]\n};\n';
}

intestazione('LE CLASSI: L\'OGGETTO OPPURE GLI STUDENTI (unoQualsiasi)');
{
  // Una regola per classe: prende i messaggi con la classe nell'oggetto, da
  // chiunque, e quelli mandati dagli studenti della classe, qualunque oggetto.
  // Gli indirizzi degli studenti non stanno in Configurazione.gs: la regola ha
  // il segnaposto @CLASSE:3B@, e gli indirizzi li porta il file Classe_3B.gs,
  // che il docente incolla nel progetto accanto alla configurazione, copiato
  // per l'etichetta di quella regola.
  const S = 'scuola.example';
  indirizzoAttivo = 'docente@' + S;
  function daCapo(cfg) {
    casella.length = 0;
    etichette.clear();
    proprieta.clear();
    trigger.length = 0;
    orologio = 0;
    contesto.CONFIG = cfg;
  }
  const studenti = [];
  for (let i = 0; i < 25; i++) studenti.push('studente' + i + '.terzab@studenti.' + S);
  const colleghi = ['anna.bianchi@' + S, 'carlo.verdi@' + S];
  const classe = { attiva: true, etichetta: 'Classi 2026-27/3B', da: ['@CLASSE:3B@'],
                   oggetto: ['3B', '3 B', 'III B'], unoQualsiasi: true, nota: 'la 3B' };
  // mittenti e oggetto, senza unoQualsiasi: tutti e due, come prima
  const verbali = { attiva: true, etichetta: 'Verbali', da: colleghi, oggetto: ['verbale'], nota: 'in AND' };
  const cfg = {
    impronta: 'A1B2C3D4', dominioScuola: S, prefissoEtichette: '', provaSenzaModifiche: false,
    soloUltimiMesi: 0, escludiPostaInviata: true, personale: colleghi, regole: [classe, verbali]
  };
  daCapo(cfg);
  const inizioRegistro = registro.length;

  // --- senza il file della classe: resta l'oggetto -------------------------
  contesto.CLASSI_STUDENTI = undefined;
  let q = contesto._queryDellaRegola_(cfg, classe);
  verifica('senza il file Classe_3B.gs la regola cerca lo stesso l\'oggetto, da chiunque (' + q.length + ' ricerca)',
    q.length === 1 && /subject:\(3B OR "3 B" OR "III B"\)/.test(q[0]) && q[0].indexOf('from:') < 0);
  const consiglio = aggiungi(colleghi[0], 'Consiglio di classe 3B', '', { giorniFa: 30 });
  let a = contesto.PASSO_1_anteprima();
  verifica('e l\'anteprima lo dice: manca il file, conta solo l\'oggetto',
    a.replace(/\s+/g, ' ').indexOf('manca il file Classe_3B.gs: conta solo l\'oggetto') > 0 &&
    stesseColonne(a, 'Classi 2026-27/3B', ['Classi 2026-27/3B', '1', '-', 'da creare']));
  verifica('nessuna riga dell\'anteprima supera i 100 caratteri', a.split('\n').every(r => r.length <= 100));
  const soloTesto = contesto._criteriFiltro_(cfg, classe);
  verifica('e il filtro di Gmail e\' quello dell\'oggetto', soloTesto.length === 1 &&
    soloTesto[0].subject === '3B OR "3 B" OR "III B"' && !soloTesto[0].from);
  // una regola con i soli mittenti, senza file: come prima, non cerca niente
  const soloStudenti = { attiva: true, etichetta: 'Studenti 3B', da: ['@CLASSE:3B@'], unoQualsiasi: true };
  verifica('una regola con i soli studenti e senza file non cerca niente (non tutta la casella)',
    contesto._queryDellaRegola_(cfg, soloStudenti).length === 0 && contesto._criteriFiltro_(cfg, soloStudenti).length === 0);

  // --- i file delle classi si sommano, in qualunque ordine -----------------
  const quarta = ['studente.quartaa@studenti.' + S];
  for (const ordine of [['3B', '4A'], ['4A', '3B']]) {
    const c = vm.createContext({});
    for (const nome of ordine) {
      vm.runInContext(fileClasse(nome, 'Classi 2026-27/' + nome, nome === '3B' ? studenti : quarta), c);
    }
    verifica('due file di classi nello stesso progetto, letti ' + ordine.join(' poi ') + ': ci sono tutte e due',
      c.CLASSI_STUDENTI && c.CLASSI_STUDENTI['3B'].indirizzi.length === 25 &&
      c.CLASSI_STUDENTI['4A'].indirizzi[0] === quarta[0] && c.CLASSI_STUDENTI['4A'].etichetta === 'Classi 2026-27/4A');
  }
  vm.runInContext(fileClasse('4A', 'Classi 2026-27/4A', quarta), contesto);
  vm.runInContext(fileClasse('3B', 'Classi 2026-27/3B', studenti), contesto);

  // --- con il file: una ricerca per l'oggetto e una per gruppo di studenti --
  q = contesto._queryDellaRegola_(cfg, classe);
  const conFrom = q.filter(x => x.indexOf('from:(') === 0);
  verifica('con il file: una ricerca con l\'oggetto e due con gli studenti, a gruppi di 20 (' + q.length + ')',
    q.length === 3 && q[0].indexOf('from:') < 0 && /subject:\(/.test(q[0]) && conFrom.length === 2 &&
    conFrom[0].split(' OR ').length === 20 && conFrom[1].split(' OR ').length === 5 &&
    conFrom.every(x => x.indexOf('subject:') < 0));
  verifica('e il resto in comune: l\'etichetta gia\' messa, le chat e la posta inviata restano fuori',
    q.every(x => x.indexOf('-label:"Classi 2026-27/3B"') > 0 && x.indexOf('-in:chats') > 0 && x.indexOf('-in:sent') > 0));
  const qv = contesto._queryDellaRegola_(cfg, verbali);
  verifica('una regola senza unoQualsiasi resta com\'era: mittenti E oggetto, in una ricerca sola',
    qv.length === 1 && qv[0].indexOf('from:(') === 0 && /subject:\(verbale\)/.test(qv[0]));

  const daStudente = aggiungi(studenti[0], 'Domanda sui compiti', '', { giorniFa: 30 });
  const altraClasse = aggiungi(colleghi[1], 'Consiglio di classe 4A', '', { giorniFa: 30 });
  const tuttiEDue = aggiungi(studenti[21], '3B: consegna della relazione', '', { giorniFa: 30 });
  // una conversazione con due studenti di due gruppi diversi e la classe
  // nell'oggetto: torna da tutte e tre le ricerche
  const gita = aggiungi(studenti[1], 'Gita della III B', '', { giorniFa: 30, mittenti: [studenti[22]] });
  const verbaleCollega = aggiungi(colleghi[0], 'Verbale del dipartimento', '', { giorniFa: 30 });
  const verbaleStudente = aggiungi(studenti[2], 'Verbale dell\'assemblea di classe', '', { giorniFa: 30 });
  const della3B = [consiglio, daStudente, tuttiEDue, gita, verbaleStudente];

  a = contesto.PASSO_1_anteprima();
  console.log(a);
  const piatta = a.replace(/\s+/g, ' ');
  verifica('l\'anteprima conta una volta sola le conversazioni che tornano da piu\' ricerche (5)',
    stesseColonne(a, 'Classi 2026-27/3B', ['Classi 2026-27/3B', '5', '-', 'da creare']));
  verifica('la regola senza unoQualsiasi conta solo mittenti E oggetto (1)',
    stesseColonne(a, 'Verbali', ['Verbali', '1', '-', 'da creare']));
  verifica('dice quanti indirizzi ha trovato nel file della classe, solo il numero',
    piatta.indexOf('studenti della 3B: 25 indirizzi, dal file Classe_3B.gs') > 0 &&
    a.indexOf('manca il file') < 0);
  // la 4A non ha una regola: il suo file resta nel progetto, con dati di minori
  verifica('e dice che il file della 4A non lo usa nessuna regola, con quanti indirizzi e l\'invito a cancellarlo',
    piatta.indexOf('File delle classi che nessuna regola accesa usa: Classe_4A.gs (1 indirizzo, per ' +
                   'Classi 2026-27/4A)') >= 0 && /cancellali dal progetto/.test(piatta) &&
    piatta.indexOf('Classe_3B.gs (') < 0);
  verifica('e nessun indirizzo di uno studente', !studenti.concat(quarta).some(x => a.indexOf(x) >= 0));

  // --- il riordino in prova conta, una volta sola --------------------------
  cfg.provaSenzaModifiche = true;
  const prova = contesto.PASSO_3_riordinaPostaEsistente();
  verifica('in prova il riordino conta anche lui 5 conversazioni per la 3B, non 8',
    /Classi 2026-27\/3B\s+5 conversazioni/.test(prova) && /Verbali\s+1 conversazione\b/.test(prova));

  // --- e anche se il tempo finisce a meta' della regola --------------------
  // Il tempo finisce dopo la ricerca dell'oggetto della 3B: la ripresa riparte
  // dagli studenti, e non deve contare di nuovo le conversazioni che la
  // ricerca dell'oggetto aveva gia' contato (la gita, la relazione)
  const cercaGiusta = GmailApp.search;
  {
    let scaduto = false;
    GmailApp.search = (query, inizio, quanti) => {
      const r = cercaGiusta(query, inizio, quanti);
      if (!scaduto && query.indexOf('subject:(3B') === 0) { scaduto = true; orologio += 10 * 60 * 1000; }
      return r;
    };
    proprieta.clear();
    const prima = contesto.PASSO_3_riordinaPostaEsistente();
    const dopo = contesto.PASSO_3_riordinaPostaEsistente();
    GmailApp.search = cercaGiusta;
    orologio = 0;
    trigger.length = 0;
    verifica('in prova, ripreso a meta\' della regola, conta ancora 5 conversazioni per la 3B (' +
             ((dopo.match(/Classi 2026-27\/3B\s+(\d+)/) || [])[1]) + ')',
      /Tempo massimo/.test(prima) && /PROVA COMPLETATA/.test(dopo) && /Classi 2026-27\/3B\s+5 conversazioni/.test(dopo));
  }
  cfg.provaSenzaModifiche = false;

  // --- il riordino vero ----------------------------------------------------
  const fatto = contesto.PASSO_3_riordinaPostaEsistente();
  const con3B = casella.filter(t => t.labels.has('Classi 2026-27/3B'));
  verifica('il riordino etichetta le 5 conversazioni della 3B, e le conta una volta',
    con3B.length === 5 && della3B.every(t => t.labels.has('Classi 2026-27/3B')) &&
    /Classi 2026-27\/3B\s+5 conversazioni/.test(fatto));
  verifica('lo studente senza la classe nell\'oggetto e il collega con la 3B nell\'oggetto si\'',
    daStudente.labels.has('Classi 2026-27/3B') && consiglio.labels.has('Classi 2026-27/3B'));
  verifica('il collega che scrive della 4A no', !altraClasse.labels.has('Classi 2026-27/3B'));
  verifica('e Verbali resta in AND: il collega si\', lo studente no',
    verbaleCollega.labels.has('Verbali') && !verbaleStudente.labels.has('Verbali'));

  // --- lo smistamento di ogni ora ------------------------------------------
  const nuovoStudente = aggiungi(studenti[5], 'Ciao prof', '', { giorniFa: 1 });
  const nuovoCollega3B = aggiungi(colleghi[1], 'Uscita didattica 3B', '', { giorniFa: 1 });
  const nuovoCollega = aggiungi(colleghi[1], 'Riunione di dipartimento', '', { giorniFa: 1 });
  const nuovoEntrambi = aggiungi(studenti[6], 'Verifica 3B', '', { giorniFa: 1 });
  // Gmail aggiorna l'indice con un po' di ritardo: la ricerca dei mittenti,
  // subito dopo quella dell'oggetto, trova ancora la conversazione appena
  // etichettata. Lo smistamento non deve contarla due volte.
  GmailApp.search = (query, inizio, quanti) => cercaGiusta(query.replace(/-label:"[^"]*"/g, ''), inizio, quanti);
  const primaDelloSmistamento = registro.length;
  contesto.smistaNuoviMessaggi();
  GmailApp.search = cercaGiusta;
  const smistati = registro.slice(primaDelloSmistamento).join('\n');
  verifica('lo smistamento prende lo studente, il collega con la 3B e lo studente con la 3B, non l\'altro collega',
    nuovoStudente.labels.has('Classi 2026-27/3B') && nuovoCollega3B.labels.has('Classi 2026-27/3B') &&
    nuovoEntrambi.labels.has('Classi 2026-27/3B') && !nuovoCollega.labels.has('Classi 2026-27/3B'));
  verifica('e anche con l\'indice di Gmail in ritardo le conta una volta (3)',
    /Classi 2026-27\/3B\s+3 conversazioni/.test(smistati));

  // --- una ricerca rifiutata, in prova e davvero: niente indirizzi ----------
  // Gmail ripete la ricerca nel suo messaggio d'errore. Il primo riordino di
  // tutti e' in prova: anche li' la ricerca rifiutata si salta e si dice, e
  // per una classe non si scrivono ne' la ricerca ne' il messaggio di Gmail
  GmailApp.search = (query, inizio, quanti) => {
    if (query.indexOf('from:(' + studenti[0]) === 0) throw new Error('Invalid search query: ' + query);
    return cercaGiusta(query, inizio, quanti);
  };
  for (const inProva of [true, false]) {
    cfg.provaSenzaModifiche = inProva;
    proprieta.clear();
    casella.forEach(t => t.labels.clear());
    const primaDelRifiuto = registro.length;
    let esito = '', eccezione = null;
    try { esito = contesto.PASSO_3_riordinaPostaEsistente(); } catch (e) { eccezione = e; }
    const rifiuto = registro.slice(primaDelRifiuto).join('\n');
    const come = inProva ? 'in prova' : 'davvero';
    verifica(come + ' una ricerca degli studenti rifiutata non ferma il riordino (' +
             (eccezione ? String(eccezione.message).slice(0, 60) : 'nessuna eccezione') + ')',
      !eccezione && /(PROVA|RIORDINO) COMPLETAT/.test(esito));
    verifica(come + ' si segnala, dicendo quale ricerca e non che cosa cercava',
      rifiuto.indexOf('Regola "Classi 2026-27/3B": ricerca non accettata da Gmail (i mittenti, gruppo 1 di 2)') >= 0 &&
      /Classi 2026-27\/3B \(ricerca rifiutata\)/.test(esito) && rifiuto.indexOf('Invalid search query') < 0 &&
      !studenti.some(x => rifiuto.indexOf(x) >= 0 || esito.indexOf(x) >= 0));
  }
  GmailApp.search = cercaGiusta;
  cfg.provaSenzaModifiche = false;

  // --- la classe fra i destinatari --------------------------------------------
  // Campanella la mette solo fra i mittenti; una configurazione scritta a mano
  // puo' metterla in "a": anche li' _espandi_ la riempie con gli studenti, e
  // la ricerca rifiutata non si scrive
  const aLei = { attiva: true, etichetta: 'Classi 2026-27/3B', a: ['@CLASSE:3B@'], oggetto: ['verifica'] };
  const qaLei = contesto._queryDellaRegola_(cfg, aLei);
  const rifiutaLei = contesto._ricercaRifiutata_(aLei, aLei.etichetta, qaLei, 0,
    new Error('Invalid search query: ' + qaLei[0]));
  verifica('una classe fra i destinatari e\' una classe della regola, e la sua ricerca rifiutata non si ' +
           'scrive (' + rifiutaLei + ')',
    qaLei.length === 1 && qaLei[0].indexOf(studenti[0]) > 0 && contesto._classiDellaRegola_(aLei).join() === '3B' &&
    !studenti.some(x => rifiutaLei.indexOf(x) >= 0) && rifiutaLei.indexOf('Invalid search query') < 0 &&
    rifiutaLei.indexOf('(la ricerca con gli studenti fra i destinatari). Ricerca saltata.') > 0);
  // senza studenti (il file e' per un'altra etichetta) la regola non cerca
  // niente: nemmeno i mittenti scritti, che senza "a" prenderebbero di piu'
  const aLeiDa = { attiva: true, etichetta: 'Verifiche 3B', da: [colleghi[0]], a: ['@CLASSE:3B@'], oggetto: ['verifica'] };
  const cfgLei = Object.assign({}, cfg, { regole: [aLeiDa] });
  const notaLei = contesto._notaClasse_(cfgLei, aLeiDa, '3B');
  verifica('e senza i suoi studenti l\'anteprima dice che non trova niente (' + notaLei + ')',
    contesto._queryDellaRegola_(cfgLei, aLeiDa).length === 0 && /intanto questa regola non trova niente$/.test(notaLei));
  // se il file e' di un'altra regola accesa, per toglierla non c'e' la
  // spunta delle classi: la regola non sta sotto un'etichetta madre
  const notaLei2 = contesto._notaClasse_(Object.assign({}, cfg, { regole: [classe, aLeiDa] }), aLeiDa, '3B');
  verifica('e con il file di un\'altra regola accesa dice di spegnerla o toglierla al passo 4 (' + notaLei2 + ')',
    notaLei2.indexOf('Se questa non ti serve piu\', spegnila o toglila (Posta, passo 4); se e\' questa') > 0 &&
    /Intanto questa regola non trova niente$/.test(notaLei2));

  // --- i filtri veri: solo quello dell'oggetto ------------------------------
  // Gli indirizzi degli studenti nei filtri di Gmail resterebbero nelle
  // impostazioni dell'account anche cancellando Classe_3B.gs, finirebbero
  // nell'esportazione dei filtri e si accumulerebbero cambiando la classe:
  // per le classi il filtro cerca solo l'oggetto, e degli studenti si occupa
  // lo smistamento dello script
  const filtri = [];
  contesto.Gmail = { Users: {
    Labels: { list: () => ({ labels: [...etichette.keys()].map(n => ({ name: n, id: 'id:' + n, type: 'user' })) }) },
    Settings: { Filters: { list: () => ({ filter: filtri.slice() }), create: f => { filtri.push(f); return f; } } }
  } };
  const tf = contesto.EXTRA_creaFiltriGmail();
  console.log(tf);
  const della3BF = filtri.filter(f => f.action.addLabelIds[0] === 'id:Classi 2026-27/3B');
  verifica('il filtro della 3B e\' uno solo, quello dell\'oggetto, anche con il file della classe (' +
           della3BF.length + ')',
    della3BF.length === 1 && della3BF[0].criteria.subject === '3B OR "3 B" OR "III B"' && !della3BF[0].criteria.from);
  verifica('nessun filtro creato ha l\'indirizzo di uno studente',
    !filtri.some(f => studenti.concat(quarta).some(x => JSON.stringify(f).indexOf(x) >= 0)));
  const diVerbali = filtri.filter(f => f.action.addLabelIds[0] === 'id:Verbali');
  verifica('e Verbali un filtro solo, con mittenti E oggetto', diVerbali.length === 1 &&
    diVerbali[0].criteria.subject === 'verbale' && diVerbali[0].criteria.from === colleghi.join(' OR '));
  const tfPiatto = tf.replace(/\s+/g, ' ');
  verifica('il riepilogo lo dice: per le classi solo l\'oggetto, e gli studenti allo smistamento dello script',
    tfPiatto.indexOf('Per le classi il filtro cerca solo l\'oggetto: Classi 2026-27/3B') >= 0 &&
    tfPiatto.indexOf('I loro messaggi li etichetta lo smistamento dello script') > 0);
  verifica('e che per i messaggi degli studenti lo smistamento automatico (PASSO_4) deve restare acceso',
    tfPiatto.indexOf('tranne Classi 2026-27/3B (i messaggi degli studenti): per questa lo smistamento ' +
                     'automatico (PASSO_4) deve restare acceso') >= 0);
  verifica('il riepilogo dei filtri non scrive indirizzi di studenti', !studenti.some(x => tf.indexOf(x) >= 0));
  // senza il file della classe l'oggetto basta: Gmail fa tutto da solo
  contesto.CLASSI_STUDENTI = undefined;
  filtri.length = 0;
  const tf2 = contesto.EXTRA_creaFiltriGmail();
  verifica('senza il file della classe il riepilogo non chiede lo smistamento per la 3B',
    tf2.indexOf('i messaggi degli studenti') < 0 && /anche senza lo script/.test(tf2));
  delete contesto.Gmail;
  vm.runInContext(fileClasse('4A', 'Classi 2026-27/4A', quarta), contesto);
  vm.runInContext(fileClasse('3B', 'Classi 2026-27/3B', studenti), contesto);

  // --- il file dell'anno prima non vale per la 3B dell'anno dopo -----------
  // La 3B del 2027-28 ha lo stesso segnaposto @CLASSE:3B@, ma nel progetto
  // c'e' ancora il file copiato per la 3B del 2026-27: sono altri studenti
  const dopo = { attiva: true, etichetta: 'Classi 2027-28/3B', da: ['@CLASSE:3B@'],
                 oggetto: ['3B', '3 B', 'III B'], unoQualsiasi: true };
  const cfgDopo = Object.assign({}, cfg, { regole: [dopo] });
  const qDopo = contesto._queryDellaRegola_(cfgDopo, dopo);
  verifica('il file copiato per la 3B del 2026-27 non da\' studenti alla 3B del 2027-28 (' + qDopo.length + ' ricerca)',
    qDopo.length === 1 && qDopo[0].indexOf('from:') < 0);
  contesto.CONFIG = cfgDopo;
  const aDopo = contesto.PASSO_1_anteprima();
  contesto.CONFIG = cfg;
  const piattaDopo = aDopo.replace(/\s+/g, ' ');
  verifica('e l\'anteprima lo dice: il file e\' di un\'altra etichetta, da cancellare e copiare di nuovo',
    piattaDopo.indexOf('il file Classe_3B.gs e\' di Classi 2026-27/3B, non di questa regola: cancellalo e ' +
                       'copia quello nuovo da Campanella; intanto conta solo l\'oggetto') >= 0 &&
    piattaDopo.indexOf('25 indirizzi, dal file') < 0);
  verifica('ed elenca i due file che nessuna regola usa, con quanti indirizzi e per quale etichetta',
    piattaDopo.indexOf('File delle classi che nessuna regola accesa usa: ') >= 0 &&
    piattaDopo.indexOf('Classe_3B.gs (25 indirizzi, per Classi 2026-27/3B)') > 0 &&
    piattaDopo.indexOf('Classe_4A.gs (1 indirizzo, per Classi 2026-27/4A)') > 0 &&
    !studenti.concat(quarta).some(x => aDopo.indexOf(x) >= 0));
  // un file senza l'etichetta (scritto a mano, o di una versione di prova): non vale
  const c2 = { CLASSI_STUDENTI: { '3B': studenti } };
  const salvato = contesto.CLASSI_STUDENTI;
  contesto.CLASSI_STUDENTI = c2.CLASSI_STUDENTI;
  verifica('un file senza l\'etichetta della regola non da\' studenti',
    contesto._queryDellaRegola_(cfg, classe).length === 1 &&
    /il file Classe_3B\.gs non dice per quale etichetta e'/.test(contesto._notaClasse_(cfg, classe, '3B')));
  contesto.CLASSI_STUDENTI = salvato;
  // con una madre senza anno ("Le mie classi") l'etichetta resta la stessa
  // l'anno dopo: il file dice quando e' stato copiato, e quello di un anno
  // scolastico passato si fa notare
  const senzaAnno = { attiva: true, etichetta: 'Le mie classi/3B', da: ['@CLASSE:3B@'], oggetto: ['3B'], unoQualsiasi: true };
  const oggi = new Date();
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const annoPassato = (oggi.getMonth() >= 8 ? oggi.getFullYear() - 1 : oggi.getFullYear() - 2) + '-10-01';
  contesto.CLASSI_STUDENTI = undefined;
  vm.runInContext(fileClasse('3B', 'Le mie classi/3B', studenti, annoPassato), contesto);
  const vecchio = contesto._notaClasse_(cfg, senzaAnno, '3B');
  const annoDi = Number(annoPassato.slice(0, 4));
  verifica('un file copiato in un anno scolastico passato lo dice (' + vecchio + ')',
    vecchio.indexOf('studenti della 3B: 25 indirizzi, dal file Classe_3B.gs copiato il 01/10/' + annoDi) === 0 &&
    vecchio.indexOf('e\' dell\'anno scolastico ' + annoDi + '-' + String(annoDi + 1).slice(2)) > 0);
  contesto.CLASSI_STUDENTI = undefined;
  vm.runInContext(fileClasse('3B', 'Le mie classi/3B', studenti, iso(oggi)), contesto);
  const nuovo = contesto._notaClasse_(cfg, senzaAnno, '3B');
  verifica('uno di quest\'anno dice solo quando (' + nuovo + ')',
    /copiato il \d\d\/\d\d\/\d{4}$/.test(nuovo) && nuovo.indexOf('anno scolastico') < 0);
  // agosto conta gia' per l'anno che comincia: il file copiato a fine agosto
  // per le classi di settembre non e' dell'anno passato, ne' a settembre ne'
  // ancora ad agosto; quello di luglio si'
  const annoDelGiorno = ['2026-07-31', '2026-08-01', '2026-08-28', '2026-09-01', '2027-06-10']
    .map(g => g + ' ' + contesto._annoScolasticoDi_(g)).join(', ');
  verifica('l\'anno scolastico di un giorno: agosto e\' gia\' del nuovo (' + annoDelGiorno + ')',
    annoDelGiorno === '2026-07-31 2025, 2026-08-01 2026, 2026-08-28 2026, 2026-09-01 2026, 2027-06-10 2026');
  const adessoIn = [[2026, 6, 31], [2026, 7, 1], [2026, 7, 30], [2026, 8, 24], [2027, 5, 10]].map(g => {
    oggiFinto = new Date(g[0], g[1], g[2], 12, 0, 0);
    return contesto._annoScolasticoAdesso_();
  }).join(', ');
  verifica('e quello di adesso con la stessa regola (' + adessoIn + ')', adessoIn === '2025, 2026, 2026, 2026, 2026');
  for (const oggiProva of [[2026, 8, 24], [2026, 7, 30]]) {
    oggiFinto = new Date(oggiProva[0], oggiProva[1], oggiProva[2], 12, 0, 0);
    contesto.CLASSI_STUDENTI = undefined;
    vm.runInContext(fileClasse('3B', 'Le mie classi/3B', studenti, '2026-08-28'), contesto);
    const diAgosto = contesto._notaClasse_(cfg, senzaAnno, '3B');
    contesto.CLASSI_STUDENTI = undefined;
    vm.runInContext(fileClasse('3B', 'Le mie classi/3B', studenti, '2026-07-15'), contesto);
    const diLuglio = contesto._notaClasse_(cfg, senzaAnno, '3B');
    verifica('oggi ' + oggiProva[2] + '/' + (oggiProva[1] + 1) + ': il file copiato il 28 agosto e\' di quest\'anno (' +
             diAgosto + '), quello del 15 luglio del 2025-26',
      /copiato il 28\/08\/2026$/.test(diAgosto) && diLuglio.indexOf('e\' dell\'anno scolastico 2025-26') > 0);
  }
  oggiFinto = null;
  // e lo dicono anche il riepilogo del riordino e quello dello smistamento di
  // ogni ora, che girano anche senza l'anteprima: la regola usa ancora gli
  // studenti dell'anno prima
  {
    const cfgSenzaAnno = Object.assign({}, cfg, { regole: [senzaAnno], provaSenzaModifiche: true });
    contesto.CONFIG = cfgSenzaAnno;
    contesto.CLASSI_STUDENTI = undefined;
    vm.runInContext(fileClasse('3B', 'Le mie classi/3B', studenti, annoPassato), contesto);
    proprieta.clear();
    const riordino = contesto.PASSO_3_riordinaPostaEsistente().replace(/\s+/g, ' ');
    const atteso = 'File delle classi di un anno scolastico passato, che le regole usano ancora: Classe_3B.gs (per ' +
                   'Le mie classi/3B, copiato il 01/10/' + annoDi + '). Se la classe e\' cambiata, copialo di nuovo ' +
                   'da Campanella (Posta, passo 4, "Le mie classi...") al posto di quello di prima.';
    verifica('il riepilogo del riordino dice che il file e\' di un anno scolastico passato',
      riordino.indexOf(atteso) > 0 && !studenti.some(x => riordino.indexOf(x) >= 0));
    cfgSenzaAnno.provaSenzaModifiche = false;
    const dallaTerza = aggiungi(studenti[7], 'Una domanda', '', { giorniFa: 1 });
    const primaDelloSmistamento = registro.length;
    contesto.smistaNuoviMessaggi();
    const smistamento = registro.slice(primaDelloSmistamento).join('\n').replace(/\s+/g, ' ');
    verifica('e anche lo smistamento di ogni ora (' + smistamento.slice(0, 60) + '...)',
      dallaTerza.labels.has('Le mie classi/3B') && smistamento.indexOf(atteso) > 0 &&
      !studenti.some(x => smistamento.indexOf(x) >= 0));
    contesto.CLASSI_STUDENTI = undefined;
    vm.runInContext(fileClasse('3B', 'Le mie classi/3B', studenti, iso(oggi)), contesto);
    cfgSenzaAnno.provaSenzaModifiche = true;
    proprieta.clear();
    verifica('con il file di quest\'anno non lo dicono',
      contesto.PASSO_3_riordinaPostaEsistente().indexOf('anno scolastico passato') < 0);
    contesto.CONFIG = cfg;
  }
  contesto.CLASSI_STUDENTI = salvato;

  // --- due regole accese con la stessa classe: il file vale per una --------
  // L'anno dopo, senza togliere le regole dell'anno prima (la spunta parte
  // senza segno), la 3B del 2026-27 e quella del 2027-28 sono accese tutte e
  // due, con lo stesso @CLASSE:3B@, e il file Classe_3B.gs e' uno solo. A
  // quella che non ce l'ha l'anteprima non deve dire di cancellarlo: l'altra
  // perderebbe gli studenti, e ricopiandolo direbbe di nuovo lo stesso
  for (const diChi of ['Classi 2027-28/3B', 'Classi 2026-27/3B']) {
    const altra = diChi === 'Classi 2027-28/3B' ? 'Classi 2026-27/3B' : 'Classi 2027-28/3B';
    const cfgDue = Object.assign({}, cfg, { regole: [classe, dopo] });
    contesto.CLASSI_STUDENTI = undefined;
    vm.runInContext(fileClasse('3B', diChi, studenti, iso(oggi)), contesto);
    contesto.CONFIG = cfgDue;
    const aDue = contesto.PASSO_1_anteprima();
    contesto.CONFIG = cfg;
    const piattaDue = aDue.replace(/\s+/g, ' ');
    const suaNota = contesto._notaClasse_(cfgDue, diChi === dopo.etichetta ? classe : dopo, '3B');
    verifica('due regole accese per la 3B, il file di ' + diChi + ': a ' + altra + ' l\'anteprima non dice ' +
             'di cancellarlo (' + suaNota + ')',
      piattaDue.indexOf('cancellalo') < 0 && suaNota.indexOf('cancell') < 0 &&
      suaNota.indexOf('il file Classe_3B.gs e\' della regola ' + diChi + ', accesa anche lei') === 0);
    verifica('ma che vale per una regola sola, come togliere questa o prendere il file per lei, e che intanto ' +
             'conta solo l\'oggetto',
      suaNota.indexOf('vale per una regola sola') > 0 &&
      suaNota.indexOf('la spunta "Togli le regole delle classi del ' + altra.slice(7, 14) + '"') > 0 &&
      suaNota.indexOf('se e\' questa quella giusta, copia il suo file da Campanella') > 0 &&
      /Intanto conta solo l'oggetto$/.test(suaNota));
    verifica('la regola di ' + diChi + ' ha i suoi 25 studenti, e l\'anteprima non chiede di copiare un file ' +
             'che c\'e\' gia\'',
      piattaDue.indexOf('studenti della 3B: 25 indirizzi, dal file Classe_3B.gs') > 0 &&
      piattaDue.indexOf('Gli indirizzi degli studenti di una classe li porta il suo file') < 0 &&
      piattaDue.indexOf('File delle classi che nessuna regola accesa usa') < 0 &&
      !studenti.some(x => aDue.indexOf(x) >= 0));
  }
  contesto.CLASSI_STUDENTI = salvato;

  verifica('in tutto questo, nel registro nessun indirizzo di uno studente',
    !studenti.concat(quarta).some(x => registro.slice(inizioRegistro).some(r => r.indexOf(x) >= 0)));
  contesto.CLASSI_STUDENTI = undefined;
}
contesto.CONFIG = configDiPrima;
indirizzoAttivo = IO;

intestazione('GLI INDIRIZZI DEGLI STUDENTI NON ESCONO: OGNI FUNZIONE, ANCHE CON GLI ERRORI DI GMAIL');
{
  // Gli indirizzi dei file Classe_*.gs sono dati di minori: lo script li usa
  // solo per cercare. Qui ogni funzione che il docente puo' eseguire, e quella
  // del trigger, gira con i file delle classi caricati e il riepilogo per email
  // acceso, in prova e no, prima con Gmail che risponde e poi con Gmail che
  // rifiuta ogni ricerca e ogni filtro ripetendoli nel suo messaggio d'errore.
  // Nessun indirizzo di uno studente, e nemmeno il suo nome utente, deve
  // comparire nel registro, nelle email, nei valori restituiti, nelle
  // eccezioni, nei filtri creati o nelle proprieta' dello script. Le funzioni
  // si trovano da sole: una nuova entra qui senza doverla aggiungere. Le
  // email vanno all'account di sempre (IO): in fondo si controlla anche questo.
  const S = 'scuola.example';
  const studenti = [], quarta = [], quinta = [];
  for (let i = 0; i < 23; i++) studenti.push('alunno' + i + '.terzab@studenti.' + S);
  for (let i = 0; i < 3; i++) quarta.push('d\'amico' + i + '.quartaa@studenti.' + S);
  for (let i = 0; i < 2; i++) quinta.push('alunno' + i + '.quintaa@studenti.' + S);
  const pezzi = studenti.concat(quarta, quinta).map(x => x.split('@')[0].toLowerCase());
  const pubbliche = Object.keys(contesto).filter(n => typeof contesto[n] === 'function' &&
    (/^(PASSO|EXTRA|ANNULLA)_/.test(n) || n === 'smistaNuoviMessaggi')).sort();
  verifica('le funzioni da provare sono quelle che il docente puo\' eseguire, e il trigger (' + pubbliche.length + ')',
    pubbliche.length >= 15 && pubbliche.indexOf('EXTRA_creaFiltriGmail') >= 0 &&
    pubbliche.indexOf('smistaNuoviMessaggi') >= 0 && pubbliche.indexOf('ANNULLA_etichettatura') >= 0);
  function configurazione(prova) {
    return {
      impronta: 'A1B2C3D4', dominioScuola: S, prefissoEtichette: 'Scuola', provaSenzaModifiche: prova,
      soloUltimiMesi: 0, escludiPostaInviata: true, inviaReport: true, giorniPostaNuova: 3,
      personale: ['anna.bianchi@' + S], gruppi: { Docenti: ['anna.bianchi@' + S] },
      regole: [
        { attiva: true, etichetta: 'Dirigenza', da: ['preside@' + S], colore: { sfondo: '#cc3a21', testo: '#ffffff' } },
        { attiva: true, etichetta: 'Classi 2026-27/3B', da: ['@CLASSE:3B@'], oggetto: ['3B', '3 B', 'III B'],
          unoQualsiasi: true, colore: { sfondo: '#c6f3de', testo: '#000000' } },
        // la 4A in AND: gli studenti E l'oggetto
        { attiva: true, etichetta: 'Classi 2026-27/4A', da: ['@CLASSE:4A@'], oggetto: ['compito'] },
        // la 5A fra i destinatari: Campanella non la scrive cosi', una
        // configurazione scritta a mano si'
        { attiva: true, etichetta: 'Classi 2026-27/5A', a: ['@CLASSE:5A@'], oggetto: ['verifica'] }
      ],
      filtriDaTogliere: [{ etichetta: 'Famiglie', criteri: { query: 'from:(@famiglie.example)' } }]
    };
  }
  const filtri = [];
  let rifiuta = false;
  const cercaGiusta = GmailApp.search;
  GmailApp.search = (query, inizio, quanti) => {
    if (rifiuta) throw new Error('Invalid search query: ' + query);
    return cercaGiusta(query, inizio, quanti);
  };
  contesto.Gmail = { Users: {
    Labels: {
      list: () => ({ labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }].concat(
        [...etichette.values()].map(l => ({ id: l.id, name: l.nome, type: 'user' }))) }),
      get: (utente, id) => ({ id, name: id, type: 'user' }),
      patch: (risorsa, utente, id) => ({ id, color: risorsa.color })
    },
    Settings: { Filters: {
      list: () => ({ filter: JSON.parse(JSON.stringify(filtri)) }),
      create: f => {
        if (rifiuta) throw new Error('Invalid filter: ' + JSON.stringify(f));
        const nuovo = { id: 'F' + (filtri.length + 1), criteria: f.criteria, action: f.action };
        filtri.push(nuovo);
        return nuovo;
      },
      remove: (utente, id) => {
        if (rifiuta) throw new Error('Backend Error: ' + id);
        const i = filtri.findIndex(f => f.id === id);
        if (i >= 0) filtri.splice(i, 1);
      }
    } }
  } };
  const trovati = [];
  function guarda(dove, testo) {
    const t = String(testo === undefined ? '' : testo).toLowerCase();
    const chi = pezzi.filter(p => t.indexOf(p) >= 0);
    if (chi.length) trovati.push(dove + ': ' + chi.length + ' studenti');
  }
  let chiamate = 0;
  for (const prova of [true, false]) {
    for (const errori of [false, true]) {
      casella.length = 0;
      etichette.clear();
      proprieta.clear();
      trigger.length = 0;
      filtri.length = 0;
      orologio = 0;
      rifiuta = false;
      contesto.CONFIG = configurazione(prova);
      contesto.CLASSI_STUDENTI = undefined;
      vm.runInContext(fileClasse('3B', 'Classi 2026-27/3B', studenti), contesto);
      vm.runInContext(fileClasse('4A', 'Classi 2026-27/4A', quarta), contesto);
      vm.runInContext(fileClasse('5A', 'Classi 2026-27/5A', quinta), contesto);
      // un file che nessuna regola usa: l'anteprima lo elenca
      vm.runInContext(fileClasse('2C', 'Classi 2026-27/2C', [studenti[0]]), contesto);
      aggiungi('preside@' + S, 'Consiglio di classe 3B', '', { giorniFa: 20 });
      aggiungi(studenti[0], 'Domanda', '', { giorniFa: 20 });
      aggiungi(studenti[21], '3B: relazione', '', { giorniFa: 2, mittenti: [studenti[3]] });
      aggiungi(quarta[1], 'Il compito di domani', '', { giorniFa: 1 });
      aggiungi('anna.bianchi@' + S, 'Scambio ora', '', { giorniFa: 1 });
      // un filtro di prima, fra quelli da togliere
      filtri.push({ id: 'F0', criteria: { query: 'from:(@famiglie.example)' }, action: { addLabelIds: ['Label_x'] } });
      rifiuta = errori;
      const come = (prova ? 'in prova' : 'davvero') + (errori ? ', con gli errori' : '');
      for (const nome of pubbliche) {
        const primaRegistro = registro.length, primaPosta = posta.length;
        let valore, eccezione = null;
        try { valore = contesto[nome](); } catch (e) { eccezione = e; }
        chiamate++;
        guarda(nome + ' ' + come + ', registro', registro.slice(primaRegistro).join('\n'));
        posta.slice(primaPosta).forEach(m => guarda(nome + ' ' + come + ', email', m.o + '\n' + m.c));
        guarda(nome + ' ' + come + ', valore restituito', typeof valore === 'object' ? JSON.stringify(valore) : valore);
        if (eccezione) guarda(nome + ' ' + come + ', eccezione', eccezione.message + '\n' + eccezione.stack);
      }
      guarda('filtri creati ' + come, JSON.stringify(filtri));
      guarda('proprieta\' ' + come, JSON.stringify([...proprieta]));
    }
  }
  GmailApp.search = cercaGiusta;
  delete contesto.Gmail;
  contesto.CLASSI_STUDENTI = undefined;
  verifica('tutte le funzioni, in prova e no, con Gmail che risponde e che rifiuta (' + chiamate + ' esecuzioni): ' +
           'nessun indirizzo di uno studente esce' + (trovati.length ? ' - trovati in ' + trovati.join('; ') : ''),
    chiamate === pubbliche.length * 4 && trovati.length === 0);
}
contesto.CONFIG = configDiPrima;
indirizzoAttivo = IO;

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
