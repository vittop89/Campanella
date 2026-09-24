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
 *   - il calendario (solo negli orari): di CalendarApp solo il calendario
 *     trovato per nome fra i propri o creato; ogni metodo che legge, crea,
 *     accorcia (setRecurrence) o toglie eventi sta in poche funzioni, su un
 *     ricevente scritto proprio cosi' (voce.serie, cal...), che nelle
 *     funzioni che cambiano o tolgono viene da una dichiarazione esatta e non
 *     si cambia; _orariNostri_ assegna contrassegno e nostro solo nelle forme
 *     ammesse, salta gli eventi non suoi e nel suo elenco mette solo le voci
 *     ammesse (e il suo testo ha un'impronta: ogni modifica va riletta), il
 *     taglio salta quelli senza contrassegno; il contrassegno di una voce non
 *     si da' in nessun altro modo (niente Object, constructor, prototype,
 *     proprieta' calcolate scritte fuori dalle due ammesse, for ... of su una
 *     proprieta', JSON.parse fuori dal punto salvato), le sue costanti e i
 *     servizi non si cambiano; gli altri metodi degli eventi e dei calendari,
 *     call, apply, bind, eval, this, la destrutturazione, i nomi calcolati e
 *     le funzioni dentro quelle che cambiano o tolgono sono fuori (vedi
 *     CALENDARIO_ORARI);
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
 *     _copiaFiltro_;
 *   - gli indirizzi degli studenti delle classi (CLASSI_STUDENTI, dai file
 *     Classe_*.gs) si leggono solo in tre funzioni, e l'unica che li da'
 *     (_studentiDellaClasse_) la chiama solo _espandi_, che li mette nelle
 *     ricerche;
 *   - Posta e Orari stanno nello stesso progetto e ognuno vedrebbe le
 *     funzioni e le variabili dell'altro: nessuno dei due ne usa una
 *     dell'altro, cosi' le regole di un file non si aggirano passando
 *     dall'altro (gli orari non arrivano agli studenti delle classi, e i loro
 *     nomi non li scrivono nemmeno fra virgolette; la posta non tocca il
 *     calendario).
 *
 * Poi la prova della prova: su copie modificate in memoria (e, per il banco
 * test/mock_apps_script.js, su una copia temporanea del motore) un
 * UrlFetchApp, un foglio nel Drive, una connessione Jdbc, un destinatario
 * estraneo, una copia in cc, un moveToTrash, un filtro tolto fuori da
 * EXTRA_togliFiltri, _togliFiltri_ chiamata dallo smistamento di ogni ora,
 * un'etichetta cancellata anche li' dentro, la tabella dei testi usata per
 * altro, gli studenti delle classi nel riepilogo per email, nel registro o
 * di nuovo nei filtri veri di Gmail, una serie del calendario accorciata
 * fuori dal cambio d'orario o presa senza guardare il contrassegno (anche
 * per le strade trovate dalla revisione: s[k].call(s, ...), una funzione
 * d'appoggio con getEvents, le serie passate dal chiamante, "|| true"
 * accanto al contrassegno, una funzione che accorcia creata nel taglio,
 * deleteEventSeries su una serie qualunque, il calendario predefinito; e
 * dalla seconda: ogni evento messo fra i nostri con unshift, splice, concat
 * o un indice, un evento singolo con la sola descrizione preso per
 * contrassegnato, Object.assign con JSON.parse, Object.defineProperty,
 * voce.contrassegno++, voce[k] = true, for ... of su una proprieta',
 * _ORARI_TAG_VALORE = null, String ridefinita) devono far fallire i
 * controlli. Se un giorno uno di questi non fallisse piu', il controllo
 * sarebbe diventato cieco.
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

// ---------------------------------------------------------------------------
//  IL CALENDARIO DEGLI ORARI
//  Orari.gs crea gli eventi dell'orario e, nel cambio d'orario, ne accorcia e
//  ne toglie: eventi che il docente vede. La promessa e' che tocca solo il
//  calendario che ha trovato per nome fra quelli del docente (o che ha
//  creato), e dentro solo gli eventi messi da Campanella; nel cambio solo
//  quelli con il contrassegno. Qui la promessa diventa una forma del codice:
//    - di CalendarApp solo questi membri: nessun altro calendario si prende;
//    - ogni metodo che legge, crea, cambia o toglie eventi sta solo in certe
//      funzioni e su un ricevente scritto proprio cosi';
//    - nelle funzioni che cambiano o tolgono, e in _orariNostri_, i riceventi
//      vengono da una dichiarazione esatta e non si riassegnano ne' si
//      modificano (quindi: solo le voci trovate da _orariNostri_);
//    - in _orariNostri_ contrassegno e nostro si assegnano solo cosi', e un
//      evento non nostro si salta prima di prenderne la serie; il suo elenco
//      si nomina solo nelle istruzioni ammesse, e il testo intero ha
//      un'impronta; nel taglio una voce senza contrassegno si salta prima di
//      toccare qualcosa;
//    - il contrassegno di una voce si da' solo in _orariNostri_, in una forma:
//      niente Object, constructor o prototype, proprieta' calcolate scritte
//      solo nelle due istruzioni ammesse, niente for ... of su una proprieta',
//      JSON.parse solo dove si legge il punto salvato; le costanti del
//      contrassegno e i servizi non si cambiano;
//    - i metodi che nessuna funzione deve usare non si nominano nemmeno
//      (setTitle, getDefaultCalendar, getEventSeriesById, call, apply,
//      bind...); niente eval, with, this, destrutturazione, proprieta' fra
//      virgolette, nomi calcolati, funzioni dentro quelle che cambiano o
//      tolgono. Cosi' le strade per aggirare le regole di prima (un nome
//      calcolato con .call, una funzione d'appoggio, le serie passate dal
//      chiamante) finiscono tutte in una regola.
// ---------------------------------------------------------------------------
const CALENDARIO_ORARI = {
  membriCalendarApp: ['getOwnedCalendarsByName', 'createCalendar', 'newRecurrence', 'Color'],
  metodi: {
    setRecurrence:           { funzioni: ['_orariTaglia_'], ricevente: 'voce.serie' },
    deleteEventSeries:       { funzioni: ['_orariTaglia_', '_orariAnnullaCalendario_'], ricevente: 'voce.serie' },
    deleteEvent:             { funzioni: ['_orariTaglia_', '_orariAnnullaCalendario_'], ricevente: 'voce.evento' },
    setTag:                  { funzioni: ['_orariCalendario_'], ricevente: 'serie' },
    setColor:                { funzioni: ['_orariCalendario_'], ricevente: 'cal' },
    getEvents:               { funzioni: ['_orariNostri_'], ricevente: 'cal' },
    getEventSeries:          { funzioni: ['_orariNostri_'], ricevente: 'ev' },
    createEventSeries:       { funzioni: ['_orariCreaSerie_'], ricevente: 'cal' },
    getOwnedCalendarsByName: { funzioni: ['_orariTrovaCalendario_'], ricevente: 'CalendarApp' },
    createCalendar:          { funzioni: ['_orariCalendario_'], ricevente: 'CalendarApp' }
  },
  // da dove vengono i riceventi: una dichiarazione sola, scritta cosi'
  origini: {
    _orariTaglia_: { nostri: 'var nostri = _orariNostri_(cal, da, _orariFineGiornata_(periodo.fine));',
                     voce: 'var voce = nostri[i];' },
    _orariAnnullaCalendario_: { nostri: 'var nostri = _orariNostri_(cal, inizio, fine);', voce: 'var voce = nostri[i];' },
    _orariCalendario_: { serie: 'var serie = _orariCreaSerie_(cal, piano.serie[stato.fatti], c, d, doc);' },
    _orariNostri_: { eventi: 'var eventi = cal.getEvents(inizio, fine);', ev: 'var ev = eventi[i];' }
  },
  // le variabili che decidono che cosa e' nostro: si assegnano solo cosi'
  forme: {
    _orariNostri_: {
      contrassegno: ['var contrassegno = false;', 'contrassegno = (ev.getTag(_ORARI_TAG) === _ORARI_TAG_VALORE);'],
      nostro: ['var nostro = contrassegno;',
               'nostro = String(ev.getDescription() || \'\').indexOf(\'[Campanella]\') === 0;']
    }
  },
  // gli elenchi di _orariNostri_: ogni volta che si nominano, solo in queste
  // istruzioni. In fuori entrano la voce di una serie nuova e l'evento
  // singolo dopo la guardia, con il suo contrassegno, e nient'altro: niente
  // unshift, splice, concat, indici, riassegnazioni o altri nomi per loro
  raccolte: {
    _orariNostri_: {
      fuori: ['var fuori = [];', 'fuori.push(voce);',
              'fuori.push({ evento: ev, contrassegno: contrassegno, titolo: ev.getTitle(), inizio: lezione.inizio, ' +
                'fine: lezione.fine, ultimo: lezione.inizio });',
              'k < fuori.length;', 'fuori[k].serie', 'fuori[k]', 'return fuori;'],
      perSerie: ['var perSerie = {};', 'var voce = perSerie[id];',
                 'voce = perSerie[id] = { serie: serie, contrassegno: false, titolo: ev.getTitle(), ' +
                   'descrizione: descrizione, lezioni: [] };']
    }
  },
  // la proprieta' contrassegno delle voci: solo in _orariNostri_, solo cosi';
  // come chiave solo li', con il valore di contrassegno o false
  contrassegno: { funzione: '_orariNostri_', forme: ['if (contrassegno) voce.contrassegno = true;'],
                  valori: ['contrassegno', 'false'] },
  // il contrassegno si confronta con queste costanti: dichiarate una volta
  // sola, cosi', e mai cambiate (con _ORARI_TAG_VALORE = null ogni evento
  // senza contrassegno ne avrebbe uno)
  costanti: { _ORARI_TAG: 'var _ORARI_TAG = \'campanella\';', _ORARI_TAG_VALORE: 'var _ORARI_TAG_VALORE = \'orario\';' },
  // le sole scritture su una proprieta' calcolata (x[k] = ...) in tutto il file
  scrittureCalcolate: ['conta[f] = (conta[f] || 0) + 1;',
                       'voce = perSerie[id] = { serie: serie, contrassegno: false, titolo: ev.getTitle(), ' +
                         'descrizione: descrizione, lezioni: [] };'],
  // JSON.parse fa oggetti con le chiavi scritte in un testo: solo dove si
  // legge il punto salvato di un lavoro
  jsonParse: ['_orariInvia_', '_orariLavoroCalendario_'],
  // la funzione che decide quali eventi sono nostri, per intero: ogni
  // modifica, anche una che le regole qui non vedono, chiede di rileggerla e
  // di aggiornare l'impronta (sha256 del testo senza commenti, spazi ridotti)
  impronte: { _orariNostri_: '00b0d489da7b1ae3' },
  // le guardie: nel ciclo (non dentro un altro if), prima di queste chiamate
  guardie: {
    _orariNostri_: { guardia: 'if (!nostro) continue;', prima: ['getEventSeries', 'push'] },
    _orariTaglia_: { guardia: 'if (!voce.contrassegno) {', blocco: true,
                     prima: ['setRecurrence', 'deleteEventSeries', 'deleteEvent'] }
  },
  senzaAnnidate: ['_orariTaglia_', '_orariAnnullaCalendario_', '_orariNostri_'],
  // non si nominano nemmeno: metodi degli eventi e dei calendari che nessuno
  // usa, altre strade per prendere un calendario o un evento, e le chiamate
  // indirette (s[k].call(s, ...))
  vietati: ['setTitle', 'setDescription', 'setLocation', 'setTime', 'setAllDayDate', 'setAllDayDates',
            'setVisibility', 'setAnyoneCanAddSelf', 'setGuestsCanInviteOthers', 'setGuestsCanModify',
            'setGuestsCanSeeGuests', 'setMyStatus', 'addEmailReminder', 'addPopupReminder', 'addSmsReminder',
            'resetRemindersToDefault', 'deleteTag', 'setHidden', 'setSelected', 'setName', 'setTimeZone',
            'unsubscribeFromCalendar', 'subscribeToCalendar', 'getDefaultCalendar', 'getAllCalendars',
            'getAllOwnedCalendars', 'getCalendarById', 'getOwnedCalendarById', 'getCalendarsByName',
            'getEventSeriesById', 'getEventById', 'getEventsForDay', 'createEvent', 'createAllDayEvent',
            'createAllDayEventSeries', 'createEventFromDescription', 'call', 'apply', 'bind',
            'eval', 'globalThis', 'this',
            // le strade per dare una proprieta' a un oggetto senza scriverne il nome
            'constructor', 'prototype', '__proto__', '__defineGetter__', '__defineSetter__', 'assign',
            'defineProperty', 'defineProperties', 'setPrototypeOf', 'getPrototypeOf', 'getOwnPropertyDescriptor',
            'fromEntries']
};

const REGOLE = {
  'Organizzazione_Gmail.gs': {
    // CONFIG sta in Configurazione.gs, nello stesso progetto; CLASSI_STUDENTI
    // (gli indirizzi degli studenti di una classe, solo dati) nei file
    // Classe_*.gs, se il docente li ha incollati
    servizi: SERVIZI_POSTA.concat(JS, ['CONFIG', 'CLASSI_STUDENTI']),
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
    tabellaDiTesti: { nome: '_AZIONI_A_PAROLE', gruppi: ['aggiunge', 'toglie', 'altro'], soloIn: '_copiaFiltro_' },
    // gli indirizzi degli studenti delle classi (i file Classe_*.gs, dati di
    // minori): il nome CLASSI_STUDENTI si scrive solo in queste tre funzioni,
    // e l'unica che da' gli indirizzi la chiama solo _espandi_, che li mette
    // nelle ricerche. Nessun'altra funzione li puo' scrivere nel registro, in
    // un riepilogo o in un filtro senza passare di li'
    nomiSoloIn: {
      CLASSI_STUDENTI: ['_classiNeiFile_', '_fileDellaClasse_', '_studentiDellaClasse_'],
      _studentiDellaClasse_: ['_espandi_']
    },
    // Orari.gs sta nello stesso progetto: le sue funzioni qui non si usano
    // (ORARI_ANNULLA_calendario e le altre toccano il calendario)
    nomiDi: 'Orari.gs'
  },
  'Orari.gs': {
    // ORARI sta in DatiOrari.gs; CONFIG (il prefisso delle etichette) in
    // Configurazione.gs della Posta, se c'e'. Object no: Object.assign e
    // Object.defineProperty darebbero il contrassegno a una voce qualunque
    servizi: SERVIZI_POSTA.concat(['CalendarApp'], JS.filter(x => x !== 'Object'), ['CONFIG', 'ORARI']),
    cancellazioni: ['deleteProperty', 'deleteTrigger', 'deleteEventSeries', 'deleteEvent'],
    destinatari: [/^mio$/, /^m\.a$/, /^_mioIndirizzoOrari_?\(\)$/],
    etichetteDiSistema: [],
    gmailApi: [],
    gmailApiSoloIn: {},
    // il calendario: crea, accorcia e toglie solo i suoi eventi (piu' su)
    calendario: CALENDARIO_ORARI,
    // Organizzazione_Gmail.gs sta nello stesso progetto: le sue funzioni qui
    // non si usano, e quelle che danno gli studenti delle classi (i suoi
    // nomiSoloIn) nemmeno fra virgolette
    nomiDi: 'Organizzazione_Gmail.gs'
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

/** L'espressione regolare di un nome intero (non pezzo di un altro, non dopo un punto). */
function nomeIntero(nome) { return new RegExp('(^|[^\\w$.])' + nome.replace(/\$/g, '\\$') + '(?![\\w$])', 'g'); }

/**
 * L'istruzione che contiene la posizione, come testo con gli spazi ridotti:
 * dal ; { } che la precede (fuori dalle parentesi tonde) al ; che la chiude.
 * Un oggetto scritto per esteso dopo la posizione ("x = { a: 1 };") fa parte
 * dell'istruzione: la sua graffa non la chiude.
 */
function istruzione(codice, nudo, pos) {
  let i = pos, tonde = 0;
  while (i > 0) {
    const c = nudo[i - 1];
    if (c === ')') tonde++;
    else if (c === '(') { if (tonde === 0) break; tonde--; }
    else if (tonde === 0 && (c === ';' || c === '{' || c === '}')) break;
    i--;
  }
  let j = pos;
  tonde = 0;
  while (j < nudo.length) {
    const c = nudo[j];
    if (c === '(') tonde++;
    else if (c === ')') { if (tonde === 0) break; tonde--; }
    else if (tonde === 0 && c === '{' && /(?:[=(,:[?!&|]|\breturn)\s*$/.test(nudo.slice(Math.max(0, j - 20), j))) {
      let graffe = 0;                      // un oggetto: fino alla sua graffa chiusa
      for (; j < nudo.length; j++) {
        if (nudo[j] === '{') graffe++;
        else if (nudo[j] === '}' && --graffe === 0) break;
      }
    }
    else if (tonde === 0 && (c === ';' || c === '{' || c === '}')) { if (c === ';') j++; break; }
    j++;
  }
  return codice.slice(i, j).replace(/\s+/g, ' ').trim();
}

/**
 * Il ricevente di una chiamata di metodo: la catena di nomi con il punto
 * subito prima del punto del metodo ("voce.serie" in voce.serie.x()). Vuoto
 * se la catena continua a sinistra con un punto (una parentesi, un indice o
 * una chiamata prima: (x).serie, a[0].serie, f().serie, a?.serie): allora non
 * e' un nome scritto per intero. Dopo "if (...)" o "return" invece si'.
 */
function riceventeDi(nudo, punto) {
  const prima = nudo.slice(Math.max(0, punto - 300), punto).replace(/\s*\.\s*/g, '.');
  const m = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/.exec(prima);
  if (!m) return '';
  return (prima.slice(0, m.index).slice(-1) === '.') ? '' : m[1];
}

/** Il testo di un'istruzione come espressione regolare che non bada agli spazi. */
function formaFlessibile(testo) {
  return new RegExp(testo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*'), 'g');
}

// tutti i modi di assegnare dopo un nome (x = , x += , x **= , x ||= , x++ ...)
// e prima (++x, --x)
const ASSEGNA = '(?:=(?!=)|\\+\\+|--|\\*\\*=|<<=|>>>?=|[-+*/%&|^]=|\\|\\|=|&&=|\\?\\?=)';
const PRIMA_DI = '(?:\\+\\+|--)\\s*';

/** L'impronta di un testo: sha256, i primi 16 caratteri. */
function impronta(testo) {
  return require('crypto').createHash('sha256').update(testo, 'utf8').digest('hex').slice(0, 16);
}

/** Il testo di una funzione, dalla parola function alla graffa che la chiude, senza commenti e con gli spazi ridotti. */
function testoDellaFunzione(codice, nudo, corpo) {
  const da = nudo.lastIndexOf('function', corpo[0]);
  return codice.slice(da, corpo[1] + 1).replace(/\s+/g, ' ').trim();
}

/** Le regole del calendario degli orari (CALENDARIO_ORARI): le violazioni trovate. */
function controllaCalendario(k, codice, nudo, corpi, riga, servizi) {
  const fuori = [];
  let m;
  const dichiarata = f => {
    const quante = (corpi[f] || []).length;
    if (quante !== 1) fuori.push('la funzione ' + f + ' e\' dichiarata ' + quante + ' volte');
  };
  const nomi = new Set();
  Object.values(k.metodi).forEach(r => r.funzioni.forEach(f => nomi.add(f)));
  [k.origini, k.forme, k.guardie, k.raccolte, k.impronte].forEach(x => Object.keys(x).forEach(f => nomi.add(f)));
  k.senzaAnnidate.forEach(f => nomi.add(f));
  k.jsonParse.forEach(f => nomi.add(f));
  nomi.add(k.contrassegno.funzione);
  nomi.forEach(dichiarata);

  // la funzione che decide che cosa e' nostro: il testo e' quello controllato
  for (const f of Object.keys(k.impronte)) {
    for (const corpo of (corpi[f] || [])) {
      const trovata = impronta(testoDellaFunzione(codice, nudo, corpo));
      if (trovata !== k.impronte[f]) {
        fuori.push('il testo di ' + f + ' non e\' quello controllato (impronta ' + trovata + ' invece di ' +
                   (k.impronte[f] || 'nessuna') + '): e\' la funzione che decide quali eventi sono di Campanella. Se ' +
                   'l\'hai cambiata apposta, rileggila con le regole di CALENDARIO_ORARI e aggiorna l\'impronta');
      }
    }
  }

  // i nomi vietati: nemmeno nominati (nel testo nudo stringhe e commenti non ci sono)
  for (const nome of k.vietati) {
    for (const re of [nomeIntero(nome), new RegExp('\\.\\s*' + nome + '(?![\\w$])', 'g')]) {
      while ((m = re.exec(nudo))) fuori.push('nome non ammesso negli orari: ' + nome + ' (riga ' + riga(m.index) + ')');
    }
  }
  if ((m = /\bwith\s*\(/.exec(nudo))) fuori.push('with non ammesso (riga ' + riga(m.index) + ')');

  // chiamate che sfuggono ai nomi: per nome calcolato (x[k](), (x[k])(), x[k]?.(), x[k]``)
  const calcolata = /\]\s*(?:\)\s*)*(?:\?\.\s*)?[(`]/g;
  while ((m = calcolata.exec(nudo))) fuori.push('metodo chiamato con un nome calcolato (riga ' + riga(m.index) + ')');
  // x['nome'] (non un elenco di testi: la parentesi quadra viene dopo un nome, una ) o una ])
  const virgolette = /([\w$]+|[)\]])\s*\[\s*['"`]/g;
  while ((m = virgolette.exec(nudo))) {
    if (/^(return|typeof|in|of|case|void|throw|new|delete)$/.test(m[1])) continue;
    fuori.push('proprieta\' scritta fra virgolette (riga ' + riga(m.index) + ')');
  }
  // la destrutturazione porta un metodo in una variabile senza il punto
  const destrutturazioni = [/\b(?:var|let|const)\s*[[{]/g, /\bfunction\s*[\w$]*\s*\([^)]*[[{]/g, /\(\s*[[{][^)]*\)\s*=>/g,
                            /(?:^|[;{}(])\s*[[{][^;{}]*[\]}]\s*\)?\s*=(?![=>])/g];
  for (const re of destrutturazioni) {
    while ((m = re.exec(nudo))) fuori.push('destrutturazione non ammessa (riga ' + riga(m.index) + ')');
  }

  // CalendarApp: solo i membri dell'elenco, sempre con il punto
  const ca = /\bCalendarApp\b(?:\s*\.\s*([A-Za-z_$][\w$]*))?/g;
  while ((m = ca.exec(nudo))) {
    if (/\.\s*$/.test(nudo.slice(Math.max(0, m.index - 20), m.index))) continue;
    if (!m[1] || k.membriCalendarApp.indexOf(m[1]) < 0) {
      fuori.push('CalendarApp usato fuori da ' + k.membriCalendarApp.join(', ') + ' (riga ' + riga(m.index) + ')');
    }
  }

  // i metodi degli eventi: dove, su che ricevente, e sempre chiamati
  for (const metodo of Object.keys(k.metodi)) {
    const r = k.metodi[metodo];
    const re = new RegExp('(^|[^\\w$])' + metodo + '(?![\\w$])', 'g');
    while ((m = re.exec(nudo))) {
      const pos = m.index + m[1].length;
      const punto = /\.\s*$/.exec(nudo.slice(Math.max(0, pos - 20), pos));
      if (!punto) { fuori.push(metodo + ' nominata senza il punto (riga ' + riga(pos) + ')'); continue; }
      if (!/^\s*\(/.test(nudo.slice(pos + metodo.length))) {
        fuori.push(metodo + ' presa come valore (riga ' + riga(pos) + ')');
        continue;
      }
      if (!dentroA(corpi, r.funzioni, pos)) {
        fuori.push(metodo + ' fuori da ' + r.funzioni.join(' e ') + ' (riga ' + riga(pos) + ')');
        continue;
      }
      const ricevente = riceventeDi(nudo, pos - punto[0].length);
      if (ricevente !== r.ricevente) {
        fuori.push(metodo + ' su "' + (ricevente || '(non un nome)') + '": solo su ' + r.ricevente + ' (riga ' + riga(pos) + ')');
      }
    }
  }

  // da dove vengono i riceventi: la dichiarazione esatta, e poi solo letti
  for (const f of Object.keys(k.origini)) {
    for (const [da, a] of (corpi[f] || [])) {
      const corpo = nudo.slice(da, a);
      const parametri = /\(([^)]*)\)\s*$/.exec(nudo.slice(Math.max(0, da - 300), da));
      for (const nome of Object.keys(k.origini[f])) {
        const forma = k.origini[f][nome];
        if (parametri && new RegExp('(^|[^\\w$])' + nome + '(?![\\w$])').test(parametri[1])) {
          fuori.push('in ' + f + ' ' + nome + ' non puo\' essere un parametro');
        }
        const assegnata = new RegExp('(^|[^\\w$.])' + nome + '\\s*' + ASSEGNA + '|(^|[^\\w$.])' + PRIMA_DI + nome +
          '(?![\\w$])', 'g');
        let volte = 0, g;
        while ((g = assegnata.exec(corpo))) {
          volte++;
          const s = istruzione(codice, nudo, da + g.index + 1);
          if (s !== forma) fuori.push('in ' + f + ' ' + nome + ' si assegna solo cosi\': ' + forma + ' (riga ' + riga(da + g.index) + ': ' + s + ')');
        }
        if (volte !== 1) fuori.push('in ' + f + ' ' + nome + ' va dichiarata una volta sola, cosi\': ' + forma + ' (trovata ' + volte + ' volte)');
        const membri = '(?:\\s*(?:\\.\\s*[\\w$]+|\\[[^\\]]*\\]))+';
        const modificata = new RegExp('(^|[^\\w$.])' + nome + membri + '\\s*' + ASSEGNA + '|' +
          '(^|[^\\w$.])' + PRIMA_DI + nome + membri + '|' +
          '(^|[^\\w$.])' + nome + '\\s*\\.\\s*(?:push|unshift|splice|pop|shift|reverse|sort|fill|copyWithin)\\s*\\(', 'g');
        while ((g = modificata.exec(corpo))) fuori.push('in ' + f + ' ' + nome + ' si cambia (riga ' + riga(da + g.index) + ')');
      }
    }
  }

  // le variabili che decidono che cosa e' nostro: solo nelle forme ammesse, e tutte presenti
  for (const f of Object.keys(k.forme)) {
    for (const [da, a] of (corpi[f] || [])) {
      const corpo = nudo.slice(da, a);
      for (const nome of Object.keys(k.forme[f])) {
        const forme = k.forme[f][nome];
        const assegnata = new RegExp('(^|[^\\w$.])' + nome + '\\s*' + ASSEGNA + '|(^|[^\\w$.])' + PRIMA_DI + nome +
          '(?![\\w$])', 'g');
        const viste = new Set();
        let g;
        while ((g = assegnata.exec(corpo))) {
          const s = istruzione(codice, nudo, da + g.index + (g[1] !== undefined ? g[1] : g[2]).length);
          viste.add(s);
          if (forme.indexOf(s) < 0) {
            fuori.push('in ' + f + ' ' + nome + ' si assegna solo cosi\': ' + forme.join('  oppure  ') +
                       ' (riga ' + riga(da + g.index) + ': ' + s + ')');
          }
        }
        forme.forEach(x => { if (!viste.has(x)) fuori.push('in ' + f + ' manca ' + x); });
      }
    }
  }

  // la proprieta' contrassegno: assegnata solo in _orariNostri_, solo cosi'
  // (con qualunque operatore: anche ++, **=, ||=); come chiave solo li', con
  // il valore di contrassegno o false
  const cc = k.contrassegno;
  const catena = '[A-Za-z_$][\\w$]*(?:\\s*(?:\\.\\s*[\\w$]+|\\[[^\\]]*\\]))*?\\s*';
  const proprieta = new RegExp('\\.\\s*contrassegno\\s*' + ASSEGNA + '|' + PRIMA_DI + catena + '\\.\\s*contrassegno(?![\\w$])', 'g');
  while ((m = proprieta.exec(nudo))) {
    const s = istruzione(codice, nudo, m.index);
    if (!dentroA(corpi, [cc.funzione], m.index) || cc.forme.indexOf(s) < 0) {
      fuori.push('contrassegno di una voce assegnato fuori da ' + cc.funzione + ' o non cosi\': ' + cc.forme.join(' | ') +
                 ' (riga ' + riga(m.index) + ': ' + s + ')');
    }
  }
  const chiave = /(^|[{,]\s*)contrassegno\s*:\s*([^,}]*)/g;
  while ((m = chiave.exec(nudo))) {
    if (!dentroA(corpi, [cc.funzione], m.index)) fuori.push('contrassegno come chiave fuori da ' + cc.funzione + ' (riga ' + riga(m.index) + ')');
    else if (cc.valori.indexOf(m[2].trim()) < 0) {
      fuori.push('contrassegno come chiave solo con il valore ' + cc.valori.join(' o ') + ' (riga ' + riga(m.index) + ': ' +
                 m[2].trim() + ')');
    }
  }
  const scambio = new RegExp('\\.\\s*(serie|evento)\\s*' + ASSEGNA + '|' + PRIMA_DI + catena + '\\.\\s*(serie|evento)(?![\\w$])', 'g');
  while ((m = scambio.exec(nudo))) fuori.push('la ' + (m[1] || m[2]) + ' di una voce si cambia (riga ' + riga(m.index) + ')');

  // gli elenchi di _orariNostri_: nominati solo nelle istruzioni ammesse
  for (const f of Object.keys(k.raccolte)) {
    for (const [da, a] of (corpi[f] || [])) {
      for (const nome of Object.keys(k.raccolte[f])) {
        const ammesse = k.raccolte[f][nome];
        const re = nomeIntero(nome);
        const corpo = nudo.slice(da, a);
        let g;
        while ((g = re.exec(corpo))) {
          const pos = da + g.index + g[1].length;
          const s = istruzione(codice, nudo, pos);
          if (ammesse.indexOf(s) < 0) {
            fuori.push('in ' + f + ' ' + nome + ' si usa solo cosi\': ' + ammesse.join('  oppure  ') + ' (riga ' + riga(pos) + ': ' + s + ')');
          }
        }
      }
    }
  }

  // le proprieta' calcolate (x[k] = ...): si scrivono solo nelle istruzioni
  // ammesse, in tutto il file. Un nome calcolato darebbe il contrassegno
  // senza scriverlo: voce['contr' + 'assegno'] = true
  const calcolate = new RegExp('\\]\\s*' + ASSEGNA + '|' + PRIMA_DI + catena + '\\[', 'g');
  while ((m = calcolate.exec(nudo))) {
    const s = istruzione(codice, nudo, m.index);
    if (k.scrittureCalcolate.indexOf(s) < 0) {
      fuori.push('proprieta\' calcolata scritta fuori dalle istruzioni ammesse (riga ' + riga(m.index) + ': ' + s + ')');
    }
  }

  // for (x.p of ...) e for (x[k] in ...) assegnano anche loro: nella testa di
  // un for ... in / of solo una variabile nuova
  const perOgni = /\bfor\s*\(/g;
  while ((m = perOgni.exec(nudo))) {
    const testa = argomenti(codice, nudo, m.index + m[0].length - 1);
    let tonde = 0, conPuntoEVirgola = false;
    for (const c of testa.nudo) {
      if (c === '(' || c === '[' || c === '{') tonde++;
      else if (c === ')' || c === ']' || c === '}') tonde--;
      else if (c === ';' && tonde === 0) conPuntoEVirgola = true;
    }
    if (!conPuntoEVirgola && !/^\s*(?:var|let|const)\s+[A-Za-z_$][\w$]*\s+(?:in|of)\s/.test(testa.nudo)) {
      fuori.push('for ... in / of che non dichiara una variabile nuova (riga ' + riga(m.index) + ')');
    }
  }

  // le costanti del contrassegno: una dichiarazione sola, scritta cosi', e mai cambiate
  for (const nome of Object.keys(k.costanti)) {
    const forma = k.costanti[nome];
    const dichiarazioni = [...nudo.matchAll(new RegExp('\\b(?:var|let|const|function|class)\\s+' + nome + '(?![\\w$])', 'g'))];
    if (dichiarazioni.length !== 1 || istruzione(codice, nudo, dichiarazioni[0].index) !== forma) {
      fuori.push('la costante ' + nome + ' va dichiarata una volta sola, cosi\': ' + forma + ' (' +
                 (dichiarazioni.length === 1 ? 'invece: ' + istruzione(codice, nudo, dichiarazioni[0].index)
                                             : 'dichiarata ' + dichiarazioni.length + ' volte') + ')');
    }
    const assegnata = new RegExp('(^|[^\\w$.])' + nome + '\\s*' + ASSEGNA + '|' + PRIMA_DI + nome + '(?![\\w$])', 'g');
    while ((m = assegnata.exec(nudo))) {
      const s = istruzione(codice, nudo, m.index + (m[1] || '').length);
      if (s !== forma) fuori.push('la costante ' + nome + ' si cambia (riga ' + riga(m.index) + ': ' + s + ')');
    }
    const parametri = /\bfunction\s*[\w$]*\s*\(([^)]*)\)|\bcatch\s*\(([^)]*)\)/g;
    while ((m = parametri.exec(nudo))) {
      if (new RegExp('(^|[^\\w$])' + nome + '(?![\\w$])').test(m[1] || m[2] || '')) {
        fuori.push('la costante ' + nome + ' usata come parametro (riga ' + riga(m.index) + ')');
      }
    }
  }

  // JSON: solo JSON.stringify(...) e JSON.parse(...), e JSON.parse solo dove si legge il punto salvato
  const json = /(^|[^\w$.])JSON(?![\w$])/g;
  while ((m = json.exec(nudo))) {
    const pos = m.index + m[1].length;
    const uso = /^JSON\s*\.\s*(stringify|parse)\s*\(/.exec(nudo.slice(pos));
    if (!uso) fuori.push('JSON usato come valore, o per un altro metodo (riga ' + riga(pos) + ')');
    else if (uso[1] === 'parse' && !dentroA(corpi, k.jsonParse, pos)) {
      fuori.push('JSON.parse fuori da ' + k.jsonParse.join(' e ') + ' (riga ' + riga(pos) + ')');
    }
  }

  // i servizi e gli oggetti di JavaScript non si ridefiniscono ne' si cambiano:
  // String = function () { return '[Campanella]'; } farebbe nostro ogni evento
  for (const nome of servizi) {
    const cambiato = new RegExp('(^|[^\\w$.])' + nome + '(?:\\s*(?:\\.\\s*[\\w$]+|\\[[^\\]]*\\]))*\\s*' + ASSEGNA + '|' +
      PRIMA_DI + nome + '(?![\\w$])|\\b(?:var|let|const|function|class)\\s+' + nome + '(?![\\w$])', 'g');
    while ((m = cambiato.exec(nudo))) fuori.push('il servizio ' + nome + ' si ridefinisce o si cambia (riga ' + riga(m.index) + ')');
  }

  // le guardie: nel ciclo (profondita' 2 nella funzione), prima delle chiamate indicate
  for (const f of Object.keys(k.guardie)) {
    const gg = k.guardie[f];
    for (const [da, a] of (corpi[f] || [])) {
      const testo = codice.slice(da, a);
      const re = formaFlessibile(gg.guardia);
      const trovata = re.exec(testo);
      if (!trovata) { fuori.push('in ' + f + ' manca la guardia ' + gg.guardia); continue; }
      const pos = da + trovata.index;
      const aperte = (nudo.slice(da, pos).match(/\{/g) || []).length - (nudo.slice(da, pos).match(/\}/g) || []).length;
      const davanti = nudo.slice(da, pos).replace(/\s+$/, '').slice(-1);
      if (aperte !== 2 || !/[;{}]/.test(davanti)) fuori.push('in ' + f + ' la guardia ' + gg.guardia + ' non sta da sola nel ciclo');
      if (gg.blocco) {
        const apertaBlocco = pos + trovata[0].length - 1;
        let prof = 0, j = apertaBlocco;
        for (; j < a; j++) { if (nudo[j] === '{') prof++; else if (nudo[j] === '}' && --prof === 0) break; }
        if (!/continue\s*;\s*$/.test(nudo.slice(apertaBlocco + 1, j))) {
          fuori.push('in ' + f + ' la guardia ' + gg.guardia + ' non finisce con continue');
        }
      }
      for (const chiamata of gg.prima) {
        const c = new RegExp('\\.\\s*' + chiamata + '\\s*\\(').exec(nudo.slice(da, pos));
        if (c) fuori.push('in ' + f + ' ' + chiamata + ' viene prima della guardia ' + gg.guardia + ' (riga ' + riga(da + c.index) + ')');
      }
    }
  }

  // niente funzioni dentro quelle che cambiano o tolgono: una funzione creata
  // li' dentro potrebbe essere usata altrove
  for (const f of k.senzaAnnidate) {
    for (const [da, a] of (corpi[f] || [])) {
      const dentro = /\bfunction\b|=>/g;
      const corpo = nudo.slice(da + 1, a);
      while ((m = dentro.exec(corpo))) fuori.push('funzione dentro ' + f + ' (riga ' + riga(da + 1 + m.index) + ')');
    }
  }
  return fuori;
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

  // il calendario degli orari (CALENDARIO_ORARI)
  if (regole.calendario) fuori.push(...controllaCalendario(regole.calendario, codice, nudo, corpi, riga, regole.servizi));

  // i nomi che si usano solo dentro certe funzioni (gli studenti delle
  // classi): fuori, anche solo nominati, anche dopo un punto (this.X) o fra
  // virgolette (this['X']), sono una violazione. Le funzioni ammesse ci sono
  // una volta sola: una seconda con lo stesso nome prenderebbe il posto della vera
  const nomiSoloIn = regole.nomiSoloIn || {};
  for (const nome of Object.keys(nomiSoloIn)) {
    const ammesse = nomiSoloIn[nome];
    for (const f of ammesse) {
      const quante = (corpi[f] || []).length;
      if (quante !== 1) fuori.push('la funzione ' + f + ', che puo\' usare ' + nome + ', e\' dichiarata ' + quante + ' volte');
    }
    const uso = new RegExp('(?<![\\w$])' + nome + '(?![\\w$])', 'g');
    let u;
    while ((u = uso.exec(nudo))) {
      if (/\bfunction\s+$/.test(nudo.slice(Math.max(0, u.index - 30), u.index))) continue;   // la dichiarazione
      if (!dentroA(corpi, ammesse, u.index)) {
        fuori.push(nome + ' usato fuori da ' + ammesse.join(', ') + ' (riga ' + riga(u.index) + ')');
      }
    }
    if (stringhe.some(s => s.indexOf(nome) >= 0)) fuori.push('il nome ' + nome + ' fra virgolette (un accesso per nome?)');
  }

  // l'altro script dello stesso progetto (nomiDi): le sue funzioni e variabili
  // in cima al file qui non si usano, nemmeno dopo un punto; i nomi che si
  // e' riservato (i suoi nomiSoloIn: gli studenti delle classi e le funzioni
  // che li leggono) nemmeno fra virgolette
  if (regole.nomiDi) {
    const altro = REGOLE[regole.nomiDi];
    const nudoAltro = smonta(sorgenti[regole.nomiDi]).nudo;
    const suoi = new Set([...nudoAltro.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/gm)]
      .map(x => x[1] || x[2]));
    const riservati = new Set();
    for (const nome of Object.keys(altro.nomiSoloIn || {})) {
      riservati.add(nome);
      altro.nomiSoloIn[nome].forEach(f => riservati.add(f));
    }
    const vietati = new Set([...suoi, ...riservati]);
    for (const nome of vietati) {
      const uso = new RegExp('(?<![\\w$])' + nome.replace(/\$/g, '\\$') + '(?![\\w$])', 'g');
      let u;
      while ((u = uso.exec(nudo))) {
        fuori.push(nome + (riservati.has(nome) ? ' e\' riservato a ' : ' e\' di ') + regole.nomiDi +
                   ', che sta nello stesso progetto: qui non si usa (riga ' + riga(u.index) + ')');
      }
    }
    for (const nome of riservati) {
      if (stringhe.some(s => s.indexOf(nome) >= 0)) {
        fuori.push('il nome ' + nome + ', riservato a ' + regole.nomiDi + ', fra virgolette');
      }
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
  // gli indirizzi degli studenti: CLASSI_STUDENTI solo nelle sue tre funzioni,
  // e quella che da' gli indirizzi solo dentro _espandi_
  deveFallire('Organizzazione_Gmail.gs', 'gli studenti aggiunti al riepilogo per email vengono trovati',
    inserisci(posta, 'function _inviaReport_(oggetto, corpo) {', '\n  corpo += JSON.stringify(CLASSI_STUDENTI);'),
    'CLASSI_STUDENTI usato fuori da');
  deveFallire('Organizzazione_Gmail.gs', 'e scritti nel registro dal codice di stato',
    inserisci(posta, 'function EXTRA_codiceStato() {', '\n  Logger.log(JSON.stringify(this.CLASSI_STUDENTI));'),
    'CLASSI_STUDENTI usato fuori da');
  deveFallire('Organizzazione_Gmail.gs', 'e presi per nome, fra virgolette',
    inserisci(posta, 'function EXTRA_codiceStato() {', '\n  Logger.log(JSON.stringify(this[\'CLASSI_STUDENTI\']));'),
    'il nome CLASSI_STUDENTI fra virgolette');
  deveFallire('Organizzazione_Gmail.gs', 'gli indirizzi di una classe chiesti dall\'anteprima vengono trovati',
    inserisci(posta, INIZIO, '\n  Logger.log(_studentiDellaClasse_(\'3B\', \'Classi 2026-27/3B\'));'),
    '_studentiDellaClasse_ usato fuori da _espandi_');
  deveFallire('Organizzazione_Gmail.gs', 'e una seconda _studentiDellaClasse_, che prenderebbe il posto di quella vera',
    posta + '\nfunction _studentiDellaClasse_() {\n  return CLASSI_STUDENTI;\n}\n',
    'la funzione _studentiDellaClasse_, che puo\' usare CLASSI_STUDENTI, e\' dichiarata 2 volte');
  // Posta e Orari nello stesso progetto: nessuno dei due passa dall'altro
  const orariAccanto = sorgenti['Orari.gs'];
  const ANTEPRIMA_ORARI = 'function ORARI_1_anteprima() {';
  deveFallire('Orari.gs', 'gli orari che chiedono alla posta gli studenti di una classe vengono trovati',
    inserisci(orariAccanto, ANTEPRIMA_ORARI, '\n  Logger.log(_studentiDellaClasse_(\'3B\', \'Classi 2026-27/3B\'));'),
    '_studentiDellaClasse_ e\' riservato a Organizzazione_Gmail.gs');
  deveFallire('Orari.gs', '  ...anche con _espandi_ e il segnaposto della classe',
    inserisci(orariAccanto, ANTEPRIMA_ORARI,
              '\n  Logger.log(_espandi_(CONFIG, [\'@CLASSE:3B@\'], { etichetta: \'Classi 2026-27/3B\' }));'),
    '_espandi_ e\' riservato a Organizzazione_Gmail.gs');
  deveFallire('Orari.gs', '  ...o leggendo CLASSI_STUDENTI',
    inserisci(orariAccanto, ANTEPRIMA_ORARI, '\n  Logger.log(JSON.stringify(CLASSI_STUDENTI));'),
    'CLASSI_STUDENTI e\' riservato a Organizzazione_Gmail.gs');
  deveFallire('Orari.gs', '  ...o scrivendone il nome fra virgolette',
    inserisci(orariAccanto, ANTEPRIMA_ORARI, '\n  var nome = \'_studenti\' + \'DellaClasse_\', tutto = \'CLASSI_STUDENTI\';'),
    'il nome CLASSI_STUDENTI, riservato a Organizzazione_Gmail.gs, fra virgolette');
  deveFallire('Orari.gs', '  ...e una funzione qualunque della posta',
    inserisci(orariAccanto, ANTEPRIMA_ORARI, '\n  var cfg = _config_();'), '_config_ e\' di Organizzazione_Gmail.gs');
  deveFallire('Organizzazione_Gmail.gs', 'la posta che toglie il calendario con una funzione degli orari viene trovata',
    inserisci(posta, INIZIO, '\n  ORARI_ANNULLA_calendario();'), 'ORARI_ANNULLA_calendario e\' di Orari.gs');
  deveFallire('Organizzazione_Gmail.gs', '  ...anche dopo un punto',
    inserisci(posta, INIZIO, '\n  this._orariAnnullaCalendario_();'), '_orariAnnullaCalendario_ e\' di Orari.gs');
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

  // accorciare una serie (setRecurrence) si', ma solo nel taglio del cambio
  // d'orario e solo sulle serie trovate con il contrassegno
  const ACCORCIA = '.setRecurrence(';
  const accorciaDiOggi = smonta(orari).codice.split(ACCORCIA).length - 1;
  verifica('gli orari di oggi accorciano le serie (' + accorciaDiOggi + ' chiamata), e il controllo lo lascia fare ' +
    'solo li\'', accorciaDiOggi >= 1 && controlla('Orari.gs', orari).length === 0);
  const TAGLIA = 'function _orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva) {';
  const NOSTRI = 'try { contrassegno = (ev.getTag(_ORARI_TAG) === _ORARI_TAG_VALORE); } catch (e) { }';
  deveFallire('Orari.gs', 'una serie accorciata fuori dal taglio (in ORARI_4_calendario) viene trovata',
    inserisci(orari, 'function _orariCreaSerie_(cal, voce, c, d, doc) {',
      '\n  cal.getEvents(new Date(), new Date())[0].getEventSeries().setRecurrence(CalendarApp.newRecurrence(), ' +
      'new Date(), new Date());'),
    'setRecurrence fuori da _orariTaglia_');
  deveFallire('Orari.gs', 'anche in una funzione nuova con un nome quasi uguale',
    orari + '\nfunction _orariTagliaTutto_(cal) {\n  cal.getEvents(new Date(), new Date())[0].getEventSeries()' +
      '.setRecurrence(CalendarApp.newRecurrence(), new Date(), new Date());\n}\n',
    'setRecurrence fuori da _orariTaglia_');
  deveFallire('Orari.gs', 'o in un secondo _orariTaglia_, che prenderebbe il posto di quello vero',
    orari + '\nfunction _orariTaglia_(cal) {\n  _orariNostri_(cal, new Date(), new Date())[0].serie' +
      '.setRecurrence(CalendarApp.newRecurrence(), new Date(), new Date());\n}\n',
    'la funzione _orariTaglia_ e\' dichiarata 2 volte');
  deveFallire('Orari.gs', 'nel taglio, una serie presa da getEvents invece che da _orariNostri_ viene trovata',
    inserisci(orari, TAGLIA,
      '\n  cal.getEvents(periodo.inizio, periodo.fine)[0].getEventSeries().setRecurrence(' +
      'CalendarApp.newRecurrence(), periodo.inizio, periodo.fine);'),
    'getEvents fuori da _orariNostri_');
  deveFallire('Orari.gs', 'o cercata per id', inserisci(orari, TAGLIA,
      '\n  cal.getEventSeriesById(\'x\').setRecurrence(CalendarApp.newRecurrence(), periodo.inizio, periodo.fine);'),
    'nome non ammesso negli orari: getEventSeriesById');
  deveFallire('Orari.gs', 'un _orariNostri_ che non guarda piu\' il contrassegno viene trovato',
    sostituisci(orari, NOSTRI, 'contrassegno = true;'), 'in _orariNostri_ contrassegno si assegna solo cosi\'');
  deveFallire('Orari.gs', 'setRecurrence chiamata con un nome calcolato, anche nel taglio, viene trovata',
    inserisci(orari, TAGLIA, '\n  var k = \'setRe\' + \'currence\'; cal[k](CalendarApp.newRecurrence(), ' +
      'periodo.inizio, periodo.fine);'),
    'metodo chiamato con un nome calcolato');
  deveFallire('Orari.gs', 'e setRecurrence presa come valore',
    inserisci(orari, 'function _orariCreaSerie_(cal, voce, c, d, doc) {',
      '\n  var accorcia = cal.getEvents(new Date(), new Date())[0].getEventSeries().setRecurrence;'),
    'setRecurrence presa come valore');

  // le strade per aggirare le regole trovate dalla revisione: ognuna deve
  // cadere in una regola
  const CREA = 'function _orariCreaSerie_(cal, voce, c, d, doc) {';
  const CHIAMA_TAGLIA = 'if (!_orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva)) {';
  const R = 'CalendarApp.newRecurrence().addWeeklyRule().until(validoDal), periodo.inizio, periodo.fine';
  const GUARDIA = 'if (!voce.contrassegno) {';
  deveFallire('Orari.gs', '(a) s[k].call(s, ...) con il nome calcolato viene trovato',
    inserisci(orari, TAGLIA, '\n  var k = \'setRe\' + \'currence\'; var nn = _orariNostri_(cal, periodo.inizio, periodo.fine); ' +
      'nn[0].serie[k].call(nn[0].serie, ' + R + ');'), 'nome non ammesso negli orari: call');
  deveFallire('Orari.gs', '  ...e anche con apply o bind',
    inserisci(orari, TAGLIA, '\n  var nn = _orariNostri_(cal, periodo.inizio, periodo.fine); var f = nn[0].serie.x; ' +
      'f.apply(nn[0].serie, [' + R + ']); f.bind(nn[0].serie)();'), 'nome non ammesso negli orari: apply');
  deveFallire('Orari.gs', '  ...e con il nome calcolato fra parentesi, (x[k])(...)',
    inserisci(orari, TAGLIA, '\n  var k = \'setRe\' + \'currence\'; (voce.serie[k])(' + R + ');'),
    'metodo chiamato con un nome calcolato');
  const appoggio = inserisci(orari, TAGLIA, '\n  var tutte = _orariAppoggio_(cal); tutte[0].serie.setRecurrence(' + R + ');');
  deveFallire('Orari.gs', '(b) nel taglio, serie prese da una funzione d\'appoggio con getEvents vengono trovate',
    appoggio && appoggio + '\nfunction _orariAppoggio_(cal) {\n  return cal.getEvents(new Date(2000, 0, 1), new Date(2100, 0, 1))' +
      '.map(function (x) { return { serie: x.getEventSeries() }; });\n}\n', 'getEvents fuori da _orariNostri_');
  const dalChiamante = sostituisci(orari, CHIAMA_TAGLIA,
    'if (!_orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva, _orariNostri_(cal, periodo.inizio, periodo.fine))) {');
  deveFallire('Orari.gs', '(c) serie passate dal chiamante per parametro vengono trovate',
    dalChiamante && sostituisci(dalChiamante, TAGLIA,
      'function _orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva, altre) {\n  altre[0].serie.setRecurrence(' + R + ');'),
    'setRecurrence su "(non un nome)": solo su voce.serie');
  deveFallire('Orari.gs', '  ...anche con il nome giusto, se voce viene da un parametro',
    sostituisci(orari, TAGLIA, 'function _orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva, voce) {'),
    'in _orariTaglia_ voce non puo\' essere un parametro');
  deveFallire('Orari.gs', '(d) (getTag(...) === _ORARI_TAG_VALORE) || true dentro _orariNostri_ viene trovato',
    sostituisci(orari, NOSTRI, 'try { contrassegno = (ev.getTag(_ORARI_TAG) === _ORARI_TAG_VALORE) || true; } catch (e) { }'),
    'in _orariNostri_ contrassegno si assegna solo cosi\'');
  deveFallire('Orari.gs', '  ...e una voce qualunque presa per nostra, nostro = true',
    sostituisci(orari, 'try { nostro = String(ev.getDescription() || \'\').indexOf(\'[Campanella]\') === 0; } catch (e2) { }',
                'nostro = true;'), 'in _orariNostri_ nostro si assegna solo cosi\'');
  deveFallire('Orari.gs', '  ...e un evento non nostro che non si salta piu\'',
    sostituisci(orari, 'if (!nostro) continue;', 'if (!nostro && false) continue;'), 'in _orariNostri_ manca la guardia');
  deveFallire('Orari.gs', '  ...o un contrassegno dato a una voce fuori da _orariNostri_',
    inserisci(orari, TAGLIA, '\n  stato.x = { contrassegno: true };'), 'contrassegno come chiave fuori da _orariNostri_');
  deveFallire('Orari.gs', '(e) una funzione che accorcia creata dentro _orariTaglia_ e usata altrove viene trovata',
    inserisci(inserisci(orari, TAGLIA, '\n  stato.accorcia = function (s) { s.setRecurrence(' + R + '); };'),
      CREA, '\n  if (voce.stato) voce.stato.accorcia(voce.altra);'), 'funzione dentro _orariTaglia_');
  deveFallire('Orari.gs', '  ...anche con il ricevente giusto',
    sostituisci(orari, GUARDIA, 'stato.f = function () { voce.serie.setRecurrence(' + R + '); };\n    ' + GUARDIA),
    'funzione dentro _orariTaglia_');
  deveFallire('Orari.gs', '(f) deleteEventSeries su una serie qualunque viene trovata',
    inserisci(orari, CREA, '\n  cal.getEvents(new Date(2000, 0, 1), new Date(2100, 0, 1))[0].getEventSeries().deleteEventSeries();'),
    'deleteEventSeries fuori da _orariTaglia_ e _orariAnnullaCalendario_');
  deveFallire('Orari.gs', '(g) il calendario predefinito, svuotato evento per evento, viene trovato',
    inserisci(orari, 'function ORARI_4_calendario(e) {',
      '\n  CalendarApp.getDefaultCalendar().getEvents(new Date(2000, 0, 1), new Date(2100, 0, 1)).forEach(x => x.deleteEvent());'),
    'nome non ammesso negli orari: getDefaultCalendar');
  deveFallire('Orari.gs', '  ...e CalendarApp messo in una variabile',
    inserisci(orari, 'function ORARI_4_calendario(e) {', '\n  var C = CalendarApp; C.getOwnedCalendarsByName(\'Famiglia\');'),
    'CalendarApp usato fuori da');
  deveFallire('Orari.gs', '  ...o preso per nome da this',
    inserisci(orari, 'function ORARI_4_calendario(e) {', '\n  var C = this.CalendarApp;'), 'nome non ammesso negli orari: this');
  deveFallire('Orari.gs', 'nel taglio, una voce senza contrassegno che non si salta piu\' viene trovata',
    sostituisci(orari, GUARDIA, 'if (false) {'), 'in _orariTaglia_ manca la guardia');
  deveFallire('Orari.gs', '  ...o saltata solo in un altro if',
    sostituisci(orari, GUARDIA, 'if (validoDal) if (!voce.contrassegno) {'), 'non sta da sola nel ciclo');
  deveFallire('Orari.gs', 'una voce presa da un altro elenco nel taglio viene trovata',
    sostituisci(orari, 'var voce = nostri[i];', 'var voce = stato.altre[i];'), 'in _orariTaglia_ voce si assegna solo cosi\'');
  deveFallire('Orari.gs', 'e una serie cambiata dentro una voce',
    sostituisci(orari, GUARDIA, 'voce.serie = stato.altra;\n    ' + GUARDIA), 'la serie di una voce si cambia');
  deveFallire('Orari.gs', 'setRecurrence portata in una variabile con la destrutturazione viene trovata',
    inserisci(orari, TAGLIA, '\n  var { setRecurrence } = stato;'), 'setRecurrence nominata senza il punto');
  deveFallire('Orari.gs', 'un titolo cambiato su una serie nostra viene trovato',
    sostituisci(orari, GUARDIA, 'voce.serie.setTitle(\'x\');\n    ' + GUARDIA), 'nome non ammesso negli orari: setTitle');
  deveFallire('Orari.gs', 'eval viene trovato',
    inserisci(orari, TAGLIA, '\n  eval(\'voce.serie.setRe\' + \'currence(x)\');'), 'nome non ammesso negli orari: eval');
  deveFallire('Orari.gs', 'il calendario cercato anche fra quelli a cui si e\' iscritti viene trovato',
    sostituisci(orari, 'CalendarApp.getOwnedCalendarsByName(nome)', 'CalendarApp.getCalendarsByName(nome)'),
    'nome non ammesso negli orari: getCalendarsByName');

  // le strade trovate dalla seconda revisione: un evento qualunque messo fra
  // i nostri, o un contrassegno dato senza scriverlo nelle forme ammesse.
  // Ognuna deve cadere in una regola, e quelle dentro _orariNostri_ anche
  // nell'impronta
  const EV = 'var ev = eventi[i];';
  const QUALUNQUE = '{ evento: ev, contrassegno: contrassegno, titolo: ev.getTitle(), inizio: ev.getStartTime(), ' +
    'fine: ev.getEndTime(), ultimo: ev.getStartTime() }';
  const SINGOLO = 'fuori.push({ evento: ev, contrassegno: contrassegno,';
  const PRIMA_LEZIONE = 'function _orariPrimaLezione_(voce) {';
  const VOCE_TAGLIO = 'var voce = nostri[i];';
  const RACCOLTA = 'in _orariNostri_ fuori si usa solo cosi\'';
  deveFallire('Orari.gs', '(a) ogni evento messo fra i nostri con fuori.unshift, prima della guardia, viene trovato',
    inserisci(orari, EV, '\n    fuori.unshift(' + QUALUNQUE + ');'), RACCOLTA);
  deveFallire('Orari.gs', '  ...e con fuori.splice', inserisci(orari, EV, '\n    fuori.splice(0, 0, ' + QUALUNQUE + ');'), RACCOLTA);
  deveFallire('Orari.gs', '  ...e con fuori[fuori.length] = ...',
    inserisci(orari, EV, '\n    fuori[fuori.length] = ' + QUALUNQUE + ';'), RACCOLTA);
  deveFallire('Orari.gs', '  ...e con fuori = fuori.concat(...)',
    inserisci(orari, EV, '\n    fuori = fuori.concat([' + QUALUNQUE + ']);'), RACCOLTA);
  deveFallire('Orari.gs', '  ...e con un altro nome per fuori',
    inserisci(orari, EV, '\n    var altri = fuori; altri.unshift(' + QUALUNQUE + ');'), RACCOLTA);
  deveFallire('Orari.gs', '  ...e in perSerie, per un id inventato',
    inserisci(orari, EV, '\n    perSerie[ev.getTitle()] = ' + QUALUNQUE + ';'), 'in _orariNostri_ perSerie si usa solo cosi\'');
  deveFallire('Orari.gs', '(b) un evento singolo con la sola descrizione preso come se avesse il contrassegno viene trovato',
    sostituisci(orari, SINGOLO, 'fuori.push({ evento: ev, contrassegno: nostro,'),
    'contrassegno come chiave solo con il valore contrassegno o false');
  deveFallire('Orari.gs', '  ...anche con contrassegno: true', sostituisci(orari, SINGOLO, 'fuori.push({ evento: ev, contrassegno: true,'),
    'contrassegno come chiave solo con il valore contrassegno o false');
  deveFallire('Orari.gs', '(c) Object.assign(voce, JSON.parse(...)) nel taglio, prima della guardia, viene trovato',
    inserisci(orari, VOCE_TAGLIO, '\n    Object.assign(voce, JSON.parse(\'{"contrassegno": true}\'));'), 'servizio non ammesso: Object');
  deveFallire('Orari.gs', '  ...e il suo JSON.parse, fuori da dove si legge il punto salvato',
    inserisci(orari, VOCE_TAGLIO, '\n    Object.assign(voce, JSON.parse(\'{"contrassegno": true}\'));'), 'JSON.parse fuori da');
  deveFallire('Orari.gs', '  ...e Object.defineProperty in _orariNostri_, con il nome scritto a pezzi',
    inserisci(orari, 'voce.lezioni.push(lezione);',
      '\n    Object.defineProperty(voce, String.fromCharCode(99) + \'ontrassegno\', { value: true });'), 'servizio non ammesso: Object');
  deveFallire('Orari.gs', '  ...e Object preso da una voce, voce.constructor.assign(...)',
    inserisci(orari, PRIMA_LEZIONE, '\n  voce.constructor.assign(voce, { x: 1 });'), 'nome non ammesso negli orari: constructor');
  deveFallire('Orari.gs', 'un contrassegno dato con voce.contrassegno++ viene trovato',
    inserisci(orari, PRIMA_LEZIONE, '\n  voce.contrassegno++;'), 'contrassegno di una voce assegnato fuori da _orariNostri_');
  deveFallire('Orari.gs', '  ...e con ++voce.contrassegno', inserisci(orari, PRIMA_LEZIONE, '\n  ++voce.contrassegno;'),
    'contrassegno di una voce assegnato fuori da _orariNostri_');
  deveFallire('Orari.gs', '  ...e con voce.contrassegno **= 0', inserisci(orari, PRIMA_LEZIONE, '\n  voce.contrassegno **= 0;'),
    'contrassegno di una voce assegnato fuori da _orariNostri_');
  deveFallire('Orari.gs', '  ...e con un nome calcolato, voce[k] = true',
    inserisci(orari, PRIMA_LEZIONE, '\n  var k = \'contr\' + \'assegno\'; voce[k] = true;'), 'proprieta\' calcolata scritta fuori');
  deveFallire('Orari.gs', '  ...e con ++voce[k]', inserisci(orari, PRIMA_LEZIONE, '\n  var k = \'contr\' + \'assegno\'; ++voce[k];'),
    'proprieta\' calcolata scritta fuori');
  deveFallire('Orari.gs', '  ...e con for (voce.contrassegno of [true]) nel taglio',
    inserisci(orari, VOCE_TAGLIO, '\n    for (voce.contrassegno of [true]) { }'), 'for ... in / of che non dichiara');
  deveFallire('Orari.gs', '  ...e con for (voce[k] in ...)',
    inserisci(orari, PRIMA_LEZIONE, '\n  var k = \'contr\' + \'assegno\'; for (voce[k] in { x: 1 }) { }'), 'for ... in / of che non dichiara');
  deveFallire('Orari.gs', '  ...e con voce.contrassegno ||= 1 nel taglio',
    inserisci(orari, VOCE_TAGLIO, '\n    voce.contrassegno ||= 1;'), 'in _orariTaglia_ voce si cambia');
  deveFallire('Orari.gs', 'una serie cambiata dentro una voce con for (voce.serie of ...) viene trovata',
    inserisci(orari, VOCE_TAGLIO, '\n    for (voce.serie of [stato]) { }'), 'for ... in / of che non dichiara');
  deveFallire('Orari.gs', 'il valore del contrassegno cambiato (_ORARI_TAG_VALORE = null: ogni evento ne avrebbe uno) viene trovato',
    sostituisci(orari, 'var _ORARI_TAG_VALORE    = \'orario\';', 'var _ORARI_TAG_VALORE    = null;'),
    'la costante _ORARI_TAG_VALORE va dichiarata una volta sola');
  deveFallire('Orari.gs', '  ...e anche riassegnato in una funzione',
    inserisci(orari, PRIMA_LEZIONE, '\n  _ORARI_TAG_VALORE = null;'), 'la costante _ORARI_TAG_VALORE si cambia');
  deveFallire('Orari.gs', 'String ridefinita (ogni descrizione comincerebbe con [Campanella]) viene trovata',
    orari + '\nString = function () { return \'[Campanella]\'; };\n', 'il servizio String si ridefinisce');
  deveFallire('Orari.gs', '  ...anche come funzione dello script',
    orari + '\nfunction String() { return \'[Campanella]\'; }\n', 'il servizio String si ridefinisce');
  deveFallire('Orari.gs', 'JSON preso come valore viene trovato',
    inserisci(orari, PRIMA_LEZIONE, '\n  var J = JSON; var o = J.parse(\'{}\');'), 'JSON usato come valore');
  deveFallire('Orari.gs', 'un getter messo con __defineGetter__ viene trovato',
    inserisci(orari, PRIMA_LEZIONE, '\n  voce.__defineGetter__(\'x\', function () { return 1; });'),
    'nome non ammesso negli orari: __defineGetter__');
  // l'impronta: anche un cambio che nessuna regola vede, in _orariNostri_, si nota
  deveFallire('Orari.gs', 'un cambio qualunque in _orariNostri_, anche innocuo, chiede di aggiornare l\'impronta',
    sostituisci(orari, 'var lezione = { inizio: ev.getStartTime(), fine: ev.getEndTime() };',
                'var lezione = { fine: ev.getEndTime(), inizio: ev.getStartTime() };'), 'il testo di _orariNostri_ non e\' quello controllato');
  const soloImpronta = sostituisci(orari, 'var lezione = { inizio: ev.getStartTime(), fine: ev.getEndTime() };',
                                   'var lezione = { fine: ev.getEndTime(), inizio: ev.getStartTime() };');
  verifica('  ...e lo vede solo l\'impronta (le altre regole lo lasciano passare)',
    soloImpronta !== null && controlla('Orari.gs', soloImpronta).length === 1);
  deveFallire('Orari.gs', '  ...e l\'impronta vede anche (a)', inserisci(orari, EV, '\n    fuori.unshift(' + QUALUNQUE + ');'),
    'il testo di _orariNostri_ non e\' quello controllato');
  const aCapo = orari.split('\r\n').join('\n').replace(/\n/g, '\r\n');
  verifica('  ...ma non gli a capo, gli spazi o i commenti', controlla('Orari.gs', aCapo).length === 0 &&
    controlla('Orari.gs', sostituisci(orari, 'var perSerie = {};', 'var   perSerie = {};   // le serie')).length === 0);
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
    // Gli indirizzi degli studenti delle classi: il banco fa girare ogni
    // funzione pubblica con i file delle classi caricati, e se ne esce anche
    // uno solo (registro, email, valori, eccezioni, filtri) fallisce
    const studentiNeiFiltri = sostituisci(posta,
      'var mittenti = _espandi_(cfg, _senzaClassi_(regola.da || []), regola);',
      'var mittenti = _espandi_(cfg, regola.da || [], regola);');
    const s6 = esitoBanco('filtri-studenti.gs', studentiNeiFiltri);
    verifica('se i filtri veri di Gmail tornano ad avere gli studenti il banco fallisce', s6 !== null && s6 !== 0);
    const ricercaScritta = sostituisci(posta, 'if (!_classiDellaRegola_(regola).length) {', 'if (true) {');
    const s7 = esitoBanco('ricerca-scritta.gs', ricercaScritta);
    verifica('e se una ricerca rifiutata di una classe si scrive nel registro, con gli studenti', s7 !== null && s7 !== 0);
    const nelRiepilogo = sostituisci(posta, RIGA,
      'MailApp.sendEmail(_mioIndirizzo_(), \'[Organizzazione Gmail] \' + oggetto, corpo + ' +
      '(typeof CLASSI_STUDENTI !== \'undefined\' ? JSON.stringify(CLASSI_STUDENTI) : \'\'));');
    const s8 = esitoBanco('riepilogo-studenti.gs', nelRiepilogo);
    verifica('e se il riepilogo per email li aggiunge', s8 !== null && s8 !== 0);
    const nelCodice = inserisci(posta, 'function EXTRA_codiceStato() {',
      '\n  if (typeof CLASSI_STUDENTI !== \'undefined\') Logger.log(JSON.stringify(CLASSI_STUDENTI));');
    const s9 = esitoBanco('codice-studenti.gs', nelCodice);
    verifica('e se il codice di stato li scrive nel registro', s9 !== null && s9 !== 0);
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
