/**
 * Le promesse fatte al DPO, controllate sul codice degli script
 *
 *   node test/invarianti_script.js
 *
 * Organizzazione_Gmail.gs (Posta) e Orari.gs girano nell'account del docente
 * con i permessi di Gmail, di invio e del calendario. Documenti e condizioni
 * promettono che non mandano posta ad altri, non chiamano servizi esterni, non
 * inoltrano, non condividono e non cancellano (se non quello che hanno creato
 * loro). Qui quelle promesse diventano controlli sul testo dei due script,
 * commenti esclusi:
 *
 *   - niente UrlFetchApp, inoltri, condivisioni, invitati, bozze o risposte,
 *     cestino, spam, Drive;
 *   - ogni sendEmail va a un destinatario ammesso (l'account stesso), senza
 *     cc ne' bcc;
 *   - le cancellazioni sono solo quelle dell'elenco di ciascun file;
 *   - i filtri di Gmail (solo Posta) etichettano, archiviano e segnano come
 *     letti, e basta.
 *
 * Poi la prova della prova: su copie modificate in memoria (e, per il banco
 * test/mock_apps_script.js, su una copia temporanea del motore) un
 * UrlFetchApp, un destinatario estraneo, una copia in cc o un moveToTrash
 * devono far fallire i controlli. Se un giorno uno di questi non fallisse
 * piu', il controllo sarebbe diventato cieco.
 */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const figlio = require('child_process');

const radice = path.join(__dirname, '..');
const risorse = path.join(radice, 'src', 'risorse');

let fallimenti = 0;
function verifica(descrizione, condizione) {
  console.log((condizione ? '  OK   ' : '  FALLITO  ') + descrizione);
  if (!condizione) fallimenti++;
}
function intestazione(t) { console.log('\n' + '='.repeat(72) + '\n  ' + t + '\n' + '='.repeat(72)); }

// ---------------------------------------------------------------------------
//  IL CODICE SENZA COMMENTI
//  codice: i commenti diventano spazi (a capo compresi), stringhe intatte;
//  nudo:   anche stringhe e espressioni regolari svuotate;
//  stringhe: il valore di ogni stringa letterale.
// ---------------------------------------------------------------------------
function smonta(sorgente) {
  let codice = '', nudo = '';
  const stringhe = [];
  let ultimo = '';                         // ultimo carattere significativo
  const n = sorgente.length;
  let i = 0;
  const bianco = t => t.replace(/[^\n]/g, ' ');
  const apreRegex = () => {
    if (ultimo === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(ultimo)) return true;
    return /\b(return|typeof|case|do|else|in|of|new|delete|void|throw)\s*$/.test(codice);
  };
  while (i < n) {
    const c = sorgente[i], d = sorgente[i + 1];
    if (c === '/' && d === '/') {
      let j = sorgente.indexOf('\n', i);
      if (j < 0) j = n;
      const pezzo = bianco(sorgente.slice(i, j));
      codice += pezzo; nudo += pezzo; i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = sorgente.indexOf('*/', i + 2);
      j = (j < 0) ? n : j + 2;
      const pezzo = bianco(sorgente.slice(i, j));
      codice += pezzo; nudo += pezzo; i = j;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1, valore = '';
      while (j < n && sorgente[j] !== c) {
        if (sorgente[j] === '\\') { valore += sorgente[j + 1]; j += 2; continue; }
        valore += sorgente[j]; j++;
      }
      j++;
      const pezzo = sorgente.slice(i, j);
      codice += pezzo;
      nudo += c + bianco(pezzo.slice(1, -1)) + c;
      stringhe.push(valore);
      ultimo = c; i = j;
      continue;
    }
    if (c === '/' && apreRegex()) {
      let j = i + 1, classe = false;
      while (j < n && (sorgente[j] !== '/' || classe)) {
        if (sorgente[j] === '\\') { j += 2; continue; }
        if (sorgente[j] === '[') classe = true;
        else if (sorgente[j] === ']') classe = false;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(sorgente[j])) j++;
      const pezzo = sorgente.slice(i, j);
      codice += pezzo;
      nudo += '/' + bianco(pezzo.slice(1)).replace(/ $/, '/');
      ultimo = '/'; i = j;
      continue;
    }
    codice += c; nudo += c;
    if (!/\s/.test(c)) ultimo = c;
    i++;
  }
  return { codice, nudo, stringhe };
}

/** Il testo fra le parentesi di una chiamata, a partire dalla "(" in posizione i. */
function argomenti(testo, nudo, i) {
  let profondita = 0;
  for (let j = i; j < nudo.length; j++) {
    if (nudo[j] === '(' || nudo[j] === '{' || nudo[j] === '[') profondita++;
    else if (nudo[j] === ')' || nudo[j] === '}' || nudo[j] === ']') {
      profondita--;
      if (profondita === 0) return { testo: testo.slice(i + 1, j), nudo: nudo.slice(i + 1, j) };
    }
  }
  return { testo: testo.slice(i + 1), nudo: nudo.slice(i + 1) };
}

/** Il primo argomento (fino alla prima virgola al livello piu' esterno). */
function primoArgomento(a) {
  let profondita = 0;
  for (let j = 0; j < a.nudo.length; j++) {
    const c = a.nudo[j];
    if (c === '(' || c === '{' || c === '[') profondita++;
    else if (c === ')' || c === '}' || c === ']') profondita--;
    else if (c === ',' && profondita === 0) return { testo: a.testo.slice(0, j), nudo: a.nudo.slice(0, j) };
  }
  return a;
}

// ---------------------------------------------------------------------------
//  LE REGOLE, FILE PER FILE
// ---------------------------------------------------------------------------
const VIETATI = [
  [/\bUrlFetchApp\b/, 'chiamata a un servizio esterno (UrlFetchApp)'],
  [/forward/i, 'inoltro (forward)'],
  [/trash/i, 'cestino (trash)'],
  [/spam/i, 'spam'],
  [/\b(addEditors?|addViewers?|addCommenters?|setSharing|share|setOwner|Permissions)\b/, 'condivisione'],
  [/\b(addGuest|guests|sendInvites)\b/, 'invitati a un evento'],
  [/\b(createDraft|reply|replyAll)\b/, 'bozza o risposta a nome tuo'],
  [/\bDriveApp\b|\bDrive\s*\.\s*(Files|Permissions|Drives)\b/, 'uso del Drive'],
  [/\b(cc|bcc)\s*:/, 'copia (cc) o copia nascosta (bcc) in un invio']
];

// etichette di sistema di Gmail: un filtro puo' toglierne solo quelle ammesse
const DI_SISTEMA = /^(INBOX|UNREAD|TRASH|SPAM|STARRED|UNSTARRED|IMPORTANT|SENT|DRAFT|CHAT|CATEGORY_[A-Z]+)$/;

const REGOLE = {
  'Organizzazione_Gmail.gs': {
    cancellazioni: ['deleteProperty', 'deleteTrigger', 'removeFromThreads'],
    destinatari: [/^_mioIndirizzo_?\(\)$/],
    etichetteDiSistema: ['INBOX', 'UNREAD'],
    gmailApi: ['Gmail.Users.Labels.list', 'Gmail.Users.Settings.Filters.list',
               'Gmail.Users.Settings.Filters.create']
  },
  'Orari.gs': {
    cancellazioni: ['deleteProperty', 'deleteTrigger', 'deleteEventSeries', 'deleteEvent'],
    destinatari: [/^mio$/, /^m\.a$/, /^_mioIndirizzoOrari_?\(\)$/],
    etichetteDiSistema: [],
    gmailApi: []
  }
};

/** L'elenco delle violazioni di un file: vuoto se rispetta le promesse. */
function controlla(nomeFile, sorgente) {
  const regole = REGOLE[nomeFile];
  const { codice, nudo, stringhe } = smonta(sorgente);
  const fuori = [];
  const riga = pos => codice.slice(0, pos).split('\n').length;

  for (const [re, cosa] of VIETATI) {
    const m = re.exec(codice);
    if (m) fuori.push(cosa + ' (riga ' + riga(m.index) + ': ' + m[0] + ')');
  }

  // le cancellazioni: solo quelle dell'elenco
  const chiamata = /\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = chiamata.exec(nudo))) {
    const nome = m[1];
    if (/delete|remove|trash|purge|clear|empty|destroy/i.test(nome) &&
        regole.cancellazioni.indexOf(nome) < 0) {
      fuori.push('cancellazione non ammessa: ' + nome + ' (riga ' + riga(m.index) + ')');
    }
  }

  // ogni invio va a un destinatario ammesso
  const invio = /\bsendEmail\s*\(/g;
  let invii = 0;
  while ((m = invio.exec(nudo))) {
    invii++;
    const aperta = m.index + m[0].length - 1;
    const primo = primoArgomento(argomenti(codice, nudo, aperta));
    let chi = primo.testo.trim();
    if (chi.charAt(0) === '{') {
      const to = /(?:^|[{,\s])to\s*:\s*([^,}\n]+)/.exec(chi);
      chi = to ? to[1].trim() : '(nessun "to")';
    }
    if (!regole.destinatari.some(re => re.test(chi))) {
      fuori.push('email verso un destinatario non ammesso: ' + chi + ' (riga ' + riga(m.index) + ')');
    }
  }
  if (invii === 0) fuori.push('nessun sendEmail trovato: il controllo dei destinatari non vale piu\'');

  // etichette di sistema (filtri di Gmail): solo quelle ammesse
  for (const s of stringhe) {
    if (DI_SISTEMA.test(s) && regole.etichetteDiSistema.indexOf(s) < 0) {
      fuori.push('etichetta di sistema non ammessa: ' + s);
    }
  }

  // il servizio avanzato Gmail: solo elencare etichette e filtri, e creare filtri
  const api = /\bGmail\s*\.\s*Users(?:\s*\.\s*[A-Za-z_$][\w$]*)+\s*\(/g;
  while ((m = api.exec(nudo))) {
    const nome = m[0].replace(/\s+/g, '').replace(/\($/, '');
    if (regole.gmailApi.indexOf(nome) < 0) {
      fuori.push('servizio Gmail non ammesso: ' + nome + ' (riga ' + riga(m.index) + ')');
    }
  }
  return fuori;
}

// ---------------------------------------------------------------------------
//  1. GLI SCRIPT DI OGGI RISPETTANO LE PROMESSE
// ---------------------------------------------------------------------------
const sorgenti = {};
for (const nome of Object.keys(REGOLE)) {
  sorgenti[nome] = fs.readFileSync(path.join(risorse, nome), 'utf8');
}

function scriptDiOggi() {
  intestazione('GLI SCRIPT DI OGGI');
  for (const nome of Object.keys(REGOLE)) {
    const v = controlla(nome, sorgenti[nome]);
    verifica(nome + ': nessuna violazione', v.length === 0);
    v.forEach(x => console.log('        ' + x));
  }
}

// ---------------------------------------------------------------------------
//  2. LA PROVA DELLA PROVA: copie modificate devono fallire
// ---------------------------------------------------------------------------
function inserisci(testo, dopo, aggiunta) {
  const i = testo.indexOf(dopo);
  if (i < 0) return null;
  return testo.slice(0, i + dopo.length) + aggiunta + testo.slice(i + dopo.length);
}
function sostituisci(testo, vecchio, nuovo) {
  return testo.indexOf(vecchio) < 0 ? null : testo.replace(vecchio, nuovo);
}
function deveFallire(nomeFile, descrizione, modificato, attesa) {
  if (modificato === null) { verifica(descrizione + ' (punto di aggancio non trovato)', false); return; }
  const v = controlla(nomeFile, modificato);
  verifica(descrizione, v.some(x => x.indexOf(attesa) >= 0));
}

function provaDellaProva() {
  intestazione('LA PROVA DELLA PROVA: COPIE MODIFICATE IN MEMORIA');
  const posta = sorgenti['Organizzazione_Gmail.gs'];
  const INIZIO = 'function PASSO_1_anteprima() {';
  deveFallire('Organizzazione_Gmail.gs', 'un UrlFetchApp aggiunto viene trovato',
    inserisci(posta, INIZIO, '\n  UrlFetchApp.fetch(\'https://esempio.example/?d=\' + _config_().dominioScuola);'),
    'UrlFetchApp');
  deveFallire('Organizzazione_Gmail.gs', 'un destinatario estraneo viene trovato',
    sostituisci(posta, 'MailApp.sendEmail(_mioIndirizzo_(),', 'MailApp.sendEmail(\'collega@scuola-esempio.edu.it\','),
    'destinatario non ammesso');
  deveFallire('Organizzazione_Gmail.gs', 'una copia in cc viene trovata',
    sostituisci(posta, '\'[Organizzazione Gmail] \' + oggetto, corpo);',
                '\'[Organizzazione Gmail] \' + oggetto, corpo, { cc: \'collega@scuola-esempio.edu.it\' });'),
    'copia (cc)');
  deveFallire('Organizzazione_Gmail.gs', 'un moveToTrash viene trovato',
    inserisci(posta, INIZIO, '\n  GmailApp.search(\'in:inbox\')[0].moveToTrash();'), 'cestino');
  deveFallire('Organizzazione_Gmail.gs', 'una cancellazione fuori elenco viene trovata',
    inserisci(posta, INIZIO, '\n  GmailApp.deleteLabel(GmailApp.getUserLabelByName(\'Colleghi\'));'),
    'cancellazione non ammessa: deleteLabel');
  deveFallire('Organizzazione_Gmail.gs', 'un filtro che butta nel cestino viene trovato',
    sostituisci(posta, 'togli.push(\'INBOX\');', 'togli.push(\'INBOX\'); togli.push(\'TRASH\');'),
    'etichetta di sistema non ammessa: TRASH');
  deveFallire('Organizzazione_Gmail.gs', 'un servizio Gmail fuori elenco viene trovato',
    inserisci(posta, INIZIO, '\n  Gmail.Users.Messages.batchDelete({ ids: [] }, \'me\');'),
    'Gmail.Users.Messages.batchDelete');
  const commentato = inserisci(posta, INIZIO, '\n  // UrlFetchApp.fetch(\'x\'); moveToTrash(); /* bcc: tutti */');
  verifica('ma un UrlFetchApp in un commento non conta',
    commentato !== null && controlla('Organizzazione_Gmail.gs', commentato).length === 0);

  const orari = sorgenti['Orari.gs'];
  deveFallire('Orari.gs', 'un destinatario estraneo negli orari viene trovato',
    sostituisci(orari, 'to: m.a,', 'to: \'collega@scuola-esempio.edu.it\','), 'destinatario non ammesso');
  deveFallire('Orari.gs', 'un calendario cancellato viene trovato',
    inserisci(orari, 'function ORARI_ANNULLA_calendario() {', '\n  CalendarApp.getDefaultCalendar().deleteCalendar();'),
    'cancellazione non ammessa: deleteCalendar');
  deveFallire('Orari.gs', 'gli invitati a un evento vengono trovati',
    inserisci(orari, 'function ORARI_4_calendario() {', '\n  var opzioni = { guests: \'collega@scuola-esempio.edu.it\' };'),
    'invitati');
}

// ---------------------------------------------------------------------------
//  3. IL BANCO DELLA POSTA SI ACCORGE DI UN DESTINATARIO ESTRANEO
//  Lo stesso guasto, ma nel motore che gira nel banco: test/mock_apps_script.js
//  controlla ogni email mandata durante le prove.
// ---------------------------------------------------------------------------
function bancoConGuasti() {
  intestazione('IL BANCO DELLA POSTA, SU UNA COPIA TEMPORANEA DEL MOTORE');
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'campanella-posta-invarianti-'));
  const banco = path.join(__dirname, 'mock_apps_script.js');
  const esempio = path.join(__dirname, 'Configurazione_esempio.gs');
  const posta = sorgenti['Organizzazione_Gmail.gs'];
  function esitoBanco(nome, motore) {
    if (motore === null) return null;
    const file = path.join(cartella, nome);
    fs.writeFileSync(file, motore);
    const r = figlio.spawnSync(process.execPath, [banco, esempio, file], { encoding: 'utf8' });
    return r.status;
  }
  try {
    verifica('il motore di oggi, copiato, passa il banco', esitoBanco('uguale.gs', posta) === 0);
    const RIGA = 'MailApp.sendEmail(_mioIndirizzo_(), \'[Organizzazione Gmail] \' + oggetto, corpo);';
    const estraneo = sostituisci(posta, RIGA,
      RIGA + '\n    MailApp.sendEmail(\'collega@scuola-esempio.edu.it\', oggetto, corpo);');
    const s1 = esitoBanco('estraneo.gs', estraneo);
    verifica('con un destinatario estraneo il banco fallisce', s1 !== null && s1 !== 0);
    const inCopia = sostituisci(posta, RIGA,
      'MailApp.sendEmail(_mioIndirizzo_(), \'[Organizzazione Gmail] \' + oggetto, corpo, ' +
      '{ bcc: \'collega@scuola-esempio.edu.it\' });');
    const s2 = esitoBanco('bcc.gs', inCopia);
    verifica('con una copia nascosta il banco fallisce', s2 !== null && s2 !== 0);
  } finally {
    fs.rmSync(cartella, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
//  4. GLI ESTRATTORI DEL PERSONALE
//  L'estensione per Chrome e la funzione da console leggono la stessa pagina
//  del registro. Qui girano su una pagina finta, con persone inventate: la
//  funzione da console non deve lasciare file nei download quando gli appunti
//  funzionano (A-19).
// ---------------------------------------------------------------------------
const FILE_CONSOLE = path.join(risorse, 'estrai_personale_spaggiari.js');

const PERSONE = [
  { nome: 'ROSSI MARIO', ruolo: 'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO', email: 'mario.rossi@scuola-esempio.edu.it' },
  { nome: 'DE LUCA ANNA', ruolo: 'ASSISTENTE AMMINISTRATIVO', email: 'anna.deluca@scuola-esempio.edu.it' },
  { nome: 'VERDI GIUSEPPE', ruolo: 'COLLABORATORE SCOLASTICO', email: '' },
  { nome: 'BLU CARLA', ruolo: 'ASSISTENTE TECNICO', email: 'carla.blu@scuola-esempio.edu.it' },
  { nome: 'GRIGI SARA', ruolo: 'DIRIGENTE SCOLASTICO', email: 's.grigi@scuola-esempio.edu.it' },
  { nome: 'VIOLA TIZIO', ruolo: '', email: '' }
];

/**
 * Una pagina del personale finta, con solo quello che i due estrattori
 * leggono. "appunti" dice quali strade per gli appunti funzionano: copy() della
 * console, navigator.clipboard, execCommand('copy').
 */
function paginaFinta(host, persone, appunti) {
  appunti = appunti || {};
  const esito = { scorrimenti: 0, scaricati: [], copiato: null, scritte: [] };
  const contenitori = persone.map((p, i) => ({
    getAttribute: n => (n === 'account_id' ? 'id' + i : null),
    querySelector: sel => {
      if (sel === '.sing_user_nominativo') return { textContent: '\n  ' + p.nome + '  ' };
      if (sel === '.sing_user_ruolo') return p.ruolo ? { textContent: p.ruolo } : null;
      if (sel === 'a[href^="mailto:"]') return p.email ? { getAttribute: () => 'mailto:' + p.email } : null;
      return null;
    },
    innerText: p.nome + '\n' + (p.ruolo || ''),
    classList: { contains: () => false }
  }));
  let areaDiTesto = null;
  const scrivi = (...a) => { esito.scritte.push(a.join(' ')); };
  const globali = {
    document: {
      body: { scrollHeight: 5000, appendChild: () => {} },
      querySelectorAll: sel => (sel === '[account_id]' ? contenitori : []),
      createElement: tag => {
        const el = { tag, style: {}, remove: () => {}, select: () => {} };
        el.click = () => { if (tag === 'a' && el.download) esito.scaricati.push(el.download); };
        if (tag === 'textarea') areaDiTesto = el;
        return el;
      },
      execCommand: () => {
        if (!appunti.execCommand) return false;
        esito.copiato = areaDiTesto && areaDiTesto.value;
        return true;
      }
    },
    window: { scrollTo: () => { esito.scorrimenti++; } },
    location: { hostname: host },
    navigator: { clipboard: { writeText: t => {
      if (!appunti.navigatore) return Promise.reject(new Error('permesso negato'));
      esito.copiato = t;
      return Promise.resolve();
    } } },
    setTimeout: f => { f(); return 0; },
    URL: { createObjectURL: () => 'blob:finto', revokeObjectURL: () => {} },
    Blob: function Blob(parti) { this.parti = parti; },
    console: { log: scrivi, warn: scrivi, table: () => {} }
  };
  if (appunti.copy) globali.copy = t => { esito.copiato = t; };
  return { contesto: vm.createContext(globali), esito };
}

/** Esegue la funzione da console nella pagina finta, come dopo Invio nella Console. */
async function eseguiConsole(pagina, file) {
  const codice = fs.readFileSync(file || FILE_CONSOLE, 'utf8');
  return await vm.runInContext(codice, pagina.contesto, { filename: 'estrai_personale_spaggiari.js' });
}

async function estrattori() {
  intestazione('LA FUNZIONE DA CONSOLE: IL CSV SOLO SE GLI APPUNTI NON FUNZIONANO');
  const HOST = 'web.spaggiari.eu';

  const conCopy = paginaFinta(HOST, PERSONE, { copy: true });
  const risposta = await eseguiConsole(conCopy);
  verifica('legge tutte le persone', risposta === PERSONE.length + ' persone estratte');
  verifica('con gli appunti che funzionano copia l\'elenco',
    typeof conCopy.esito.copiato === 'string' && conCopy.esito.copiato.indexOf('NOMINATIVO\tRUOLO\tEMAIL\tCATEGORIA') === 0);
  verifica('e non scarica nessun file', conCopy.esito.scaricati.length === 0);

  const conNavigatore = paginaFinta(HOST, PERSONE, { navigatore: true });
  await eseguiConsole(conNavigatore);
  verifica('anche con navigator.clipboard: copiato, nessun file',
    conNavigatore.esito.copiato !== null && conNavigatore.esito.scaricati.length === 0);

  const senzaAppunti = paginaFinta(HOST, PERSONE, {});
  await eseguiConsole(senzaAppunti);
  verifica('senza appunti scarica il CSV, e solo allora',
    senzaAppunti.esito.scaricati.length === 1 && senzaAppunti.esito.scaricati[0] === 'personale_spaggiari.csv');
  verifica('e dice di cancellarlo dopo averlo usato',
    senzaAppunti.esito.scritte.some(s => /CANCELLA IL FILE/.test(s)));
}

// ---------------------------------------------------------------------------
async function principale() {
  scriptDiOggi();
  provaDellaProva();
  bancoConGuasti();
  await estrattori();

  intestazione('RISULTATO');
  if (fallimenti === 0) {
    console.log('  Tutte le prove superate.');
  } else {
    console.log('  PROVE FALLITE: ' + fallimenti);
    process.exitCode = 1;
  }
}

module.exports = { smonta, controlla, paginaFinta, eseguiConsole, PERSONE };
if (require.main === module) {
  principale().catch(e => { console.error(e); process.exitCode = 1; });
}
