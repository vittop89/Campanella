/**
 * Banco di prova per Organizzazione_Gmail.gs
 *
 *   node test/mock_apps_script.js
 *
 * Simula GmailApp, PropertiesService, ScriptApp, MailApp e Session con una
 * finta casella di posta, poi esegue i quattro passi e stampa cosa succede.
 * Serve a verificare le ricerche costruite, l'etichettatura a blocchi, la
 * ripresa dopo il tempo massimo e le funzioni di annullamento, senza dover
 * caricare nulla su Google.
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
    if (t.isChat && !/in:chats/i.test(query)) {
      // Gmail esclude le chat solo se richiesto: qui lo script lo chiede sempre
    }
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

const posta = [];
const MailApp = { sendEmail: (a, o, c) => posta.push({ a, o, c }) };
const Logger = { log: t => registro.push(String(t)) };
const Utilities = { sleep: () => {} };
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
const codice = fs.readFileSync(path.join(radice, 'Organizzazione_Gmail.gs'), 'utf8');
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
const Session = { getActiveUser: () => ({ getEmail: () => IO }) };
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

intestazione('PASSO 2 - creazione etichette');
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
  verifica('l\'elenco nel registro c\'e\' lo stesso, a blocchi',
    scritte.slice(2).some(r => r.includes('mario.rossi@' + DOM)));

  const email = posta.slice(postaPrima).filter(m => /Indirizzi @/.test(m.o));
  verifica('l\'email con l\'elenco parte sempre', email.length === 1);
  verifica('e dentro ci sono tutti gli indirizzi trovati',
    tsv.split('\n').every(r => email[0].c.includes(r)));
  verifica('con il conto di quante conversazioni ha guardato',
    /esaminando \d+ conversazioni/.test(email[0].c));
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
  contesto.CONFIG.personale = personaleVero;
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
console.log(contesto.ANNULLA_automazione());
verifica('nessun trigger residuo', trigger.length === 0);

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

intestazione('RISULTATO');
if (fallimenti === 0) {
  console.log('  Tutte le prove superate.');
} else {
  console.log('  PROVE FALLITE: ' + fallimenti);
  process.exitCode = 1;
}
