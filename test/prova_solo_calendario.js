/**
 * Calendario.gs e il DatiOrari.gs del solo docente, per un altro account
 *
 *   node test/prova_solo_calendario.js
 *   node test/prova_solo_calendario.js Calendario.gs DatiOrari.gs
 *
 * Chi mette l'orario nel Google Calendar di un altro account (il suo
 * personale, per esempio) incolla in un progetto di quell'account
 * Calendario.gs, la versione solo calendario di Orari.gs, e un DatiOrari.gs
 * con soltanto il suo orario. Qui:
 *
 *   - Calendario.gs non nomina, nemmeno in un commento, i servizi delle
 *     email e dell'indirizzo (MailApp, GmailApp, Session.getActiveUser...) ne'
 *     quelli che Campanella non usa (UrlFetchApp, DriveApp, DocumentApp,
 *     SpreadsheetApp, FormApp): Google ne chiederebbe il permesso;
 *   - ha le funzioni del calendario con i nomi di Orari.gs, e nessuna delle
 *     email; nessun segno "// [SOLO ...]" e' rimasto; l'intestazione e' la sua,
 *     con la versione e ogni funzione;
 *   - DatiOrari.gs ha un docente solo, quello del calendario, e niente orari
 *     delle classi, oggetti o nota delle email;
 *   - il banco test/mock_orari.js fa girare le sezioni del calendario su
 *     questi due file (--solo-calendario), in un progetto senza email.
 *
 * Senza argomenti Calendario.gs e' quello di test/solo_calendario.js (la
 * regola dell'applicazione, in JavaScript) e i dati sono quelli di
 * test/DatiOrari_esempio.gs ridotti al docente del calendario. Con i due file
 * dell'applicazione (li passa test/prova_orario.ps1) controlla anche che il
 * Calendario.gs dell'applicazione sia quello di test/solo_calendario.js.
 *
 * In fondo la prova della prova: un segno aperto e non chiuso, una riga
 * "solo calendario" senza "// ", un blocco delle email senza segni o un
 * servizio delle email in una parte del calendario devono far fallire i
 * controlli.
 */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const figlio = require('child_process');
const { SEGNI, soloCalendario, calendarioDiOggi } = require('./solo_calendario');

const radice = path.join(__dirname, '..');
const risorse = path.join(radice, 'src', 'risorse');

let fallimenti = 0;
function verifica(descrizione, condizione) {
  console.log((condizione ? '  OK   ' : '  FALLITO  ') + descrizione);
  if (!condizione) fallimenti++;
}
function intestazione(t) { console.log('\n' + '='.repeat(72) + '\n  ' + t + '\n' + '='.repeat(72)); }

// i nomi che in Calendario.gs non ci devono essere, nemmeno in un commento
const VIETATI = ['MailApp', 'GmailApp', 'Gmail', 'sendEmail', 'Session.getActiveUser', 'getActiveUser',
                 'getEffectiveUser', 'UrlFetchApp', 'DriveApp', 'DocumentApp', 'SpreadsheetApp', 'FormApp'];
const DEL_CALENDARIO = ['ORARI_1_anteprima', 'ORARI_4_calendario', 'ORARI_5_cambioOrario', 'ORARI_6_coloraLezioni',
                        'ORARI_7_colloqui', 'ORARI_ANNULLA_calendario'];
const DELLE_EMAIL = ['ORARI_2_invia', 'ORARI_3_inviaOrariClassi', 'ORARI_ANNULLA_invio'];

/** I nomi vietati che il testo nomina. */
function vietatiIn(testo) {
  return VIETATI.filter(n => new RegExp('(?<![\\w$])' + n.replace(/\./g, '\\.') + '(?![\\w$])').test(testo));
}
/** Le funzioni ORARI_ dichiarate, in ordine. */
function pubbliche(testo) {
  return [...testo.matchAll(/^function\s+(ORARI_[A-Za-z0-9_]*[A-Za-z0-9])\s*\(/gm)].map(m => m[1]).sort();
}

// con gli a capo di Windows (autocrlf) i punti di aggancio qui sotto non cambiano
const orari = fs.readFileSync(path.join(risorse, 'Orari.gs'), 'utf8').replace(/\r\n/g, '\n');
const testa = fs.readFileSync(path.join(risorse, 'Calendario_intestazione.txt'), 'utf8');
const versione = /\bvar\s+_ORARI_VERSIONE\s*=\s*'([^']+)'/.exec(orari)[1];

// ---------------------------------------------------------------------------
//  I FILE: quelli dell'applicazione, o quelli di adesso
// ---------------------------------------------------------------------------
const dellApplicazione = process.argv.length >= 4;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'campanella-solo-calendario-'));
let percorsoCodice, percorsoDati;
try {
  if (dellApplicazione) {
    percorsoCodice = path.resolve(process.argv[2]);
    percorsoDati = path.resolve(process.argv[3]);
  } else {
    percorsoCodice = path.join(tmp, 'Calendario.gs');
    fs.writeFileSync(percorsoCodice, calendarioDiOggi());
    // i dati d'esempio ridotti al docente del calendario, come li scrive l'applicazione
    const contesto = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'DatiOrari_esempio.gs'), 'utf8'), contesto);
    const d = contesto.ORARI;
    const doc = d.docenti.filter(x => x.nome === d.calendario.docente);
    const solo = { periodo: d.periodo, ore: d.ore, giorni: d.giorni, docenti: doc, calendario: d.calendario };
    percorsoDati = path.join(tmp, 'DatiOrari.gs');
    fs.writeFileSync(percorsoDati, '// i dati d\'esempio, ridotti al docente del calendario\nvar ORARI = ' +
                     JSON.stringify(solo, null, 2) + ';\n');
  }
  const codice = fs.readFileSync(percorsoCodice, 'utf8');
  const dati = fs.readFileSync(percorsoDati, 'utf8');
  console.log('Calendario.gs: ' + (dellApplicazione ? percorsoCodice + ' (dell\'applicazione)' : 'da test/solo_calendario.js'));
  console.log('DatiOrari.gs:  ' + (dellApplicazione ? percorsoDati + ' (dell\'applicazione)' : 'test/DatiOrari_esempio.gs, solo il docente del calendario'));

  // -------------------------------------------------------------------------
  intestazione('CALENDARIO.GS: SOLO IL CALENDARIO');
  const nominati = vietatiIn(codice);
  verifica('non nomina, nemmeno in un commento, ' + VIETATI.join(', ') +
    (nominati.length ? ' (nomina: ' + nominati.join(', ') + ')' : ''), nominati.length === 0);
  verifica('ha le funzioni del calendario con i nomi di Orari.gs, e nessuna delle email (' + pubbliche(codice).join(', ') + ')',
    pubbliche(codice).join() === DEL_CALENDARIO.slice().sort().join() &&
    DELLE_EMAIL.every(n => codice.indexOf(n) < 0));
  verifica('in Orari.gs ci sono tutte, quelle del calendario e quelle delle email',
    DEL_CALENDARIO.concat(DELLE_EMAIL).every(n => pubbliche(orari).indexOf(n) >= 0));
  const segniRimasti = codice.split('\n').filter(r => /^\s*\/\/ \[(FINE )?SOLO /.test(r));
  verifica('nessun segno "// [SOLO ...]" e\' rimasto' + (segniRimasti.length ? ' (' + segniRimasti[0].trim() + ')' : ''),
    segniRimasti.length === 0);
  const suaTesta = codice.slice(0, codice.indexOf('*/'));
  verifica('l\'intestazione e\' quella di Calendario.gs, con la versione (' + versione + ') e ogni funzione',
    suaTesta.indexOf('Calendario.gs versione ' + versione) >= 0 && DEL_CALENDARIO.every(n => suaTesta.indexOf(n) >= 0) &&
    suaTesta.indexOf('Orari.gs versione') < 0);
  verifica('l\'intestazione dice dove va incollato, del fuso orario e dei soli due permessi',
    /DI QUELL'ACCOUNT/.test(suaTesta) && /Fuso orario -> quello con Roma/.test(suaTesta) &&
    /soltanto due permessi/.test(suaTesta) && /Google Calendar/.test(suaTesta) && /trigger/.test(suaTesta));
  verifica('l\'anteprima dice "Calendario.gs versione", non "Orari.gs versione"',
    codice.indexOf('righe.push(\'Calendario.gs versione \' + _ORARI_VERSIONE);') > 0 &&
    codice.indexOf('Orari.gs versione') < 0);
  let sintassi = '';
  try { new vm.Script(codice, { filename: 'Calendario.gs' }); } catch (e) { sintassi = e.message; }
  verifica('e\' JavaScript che si legge' + (sintassi ? ' (' + sintassi + ')' : ''), sintassi === '');
  if (dellApplicazione) {
    verifica('il Calendario.gs dell\'applicazione e\' quello di test/solo_calendario.js, carattere per carattere',
      codice === calendarioDiOggi());
  }

  // -------------------------------------------------------------------------
  intestazione('DATIORARI.GS: SOLO IL TUO ORARIO');
  const cd = vm.createContext({});
  let letti = '';
  try { vm.runInContext(dati, cd, { filename: 'DatiOrari.gs' }); } catch (e) { letti = e.message; }
  const D = cd.ORARI;
  verifica('si carica da solo e fa nascere soltanto ORARI (' + Object.keys(cd).join(', ') + ')',
    letti === '' && Object.keys(cd).join() === 'ORARI');
  verifica('ha un docente solo, quello del calendario',
    !!D && !!D.calendario && Array.isArray(D.docenti) && D.docenti.length === 1 && D.docenti[0].nome === D.calendario.docente);
  verifica('niente orari delle classi, oggetti o nota delle email, titolo del tabellone',
    !!D && ['classi', 'oggettoDocente', 'oggettoClasse', 'nota', 'titolo'].every(k => !(k in D)));
  if (dellApplicazione) {
    const testaDati = dati.slice(0, dati.indexOf('*/'));
    verifica('la sua intestazione dice che c\'e\' soltanto il tuo orario, e nessun collega',
      /soltanto il TUO orario/.test(testaDati) && /Nessun collega/.test(testaDati) && /Calendario\.gs/.test(testaDati));
  }

  // -------------------------------------------------------------------------
  intestazione('IL BANCO DEL CALENDARIO SU CALENDARIO.GS');
  const r = figlio.spawnSync(process.execPath, [path.join(__dirname, 'mock_orari.js'), '--solo-calendario',
                                                percorsoCodice, percorsoDati], { encoding: 'utf8' });
  const uscita = String(r.stdout || '') + String(r.stderr || '');
  const ok = (uscita.match(/^\s+OK /gm) || []).length;
  uscita.split('\n').filter(x => /FALLITO|PROVE FALLITE|\bError\b/.test(x)).slice(0, 20).forEach(x => console.log('        ' + x));
  verifica('mock_orari.js --solo-calendario passa (' + ok + ' controlli)', r.status === 0 && ok > 100);
  verifica('  ...con le sezioni del calendario e quelle di Calendario.gs da solo, senza quelle delle email',
    /ANTEPRIMA DI CALENDARIO\.GS/.test(uscita) && /CALENDARIO\.GS DA SOLO, SENZA LA POSTA/.test(uscita) &&
    /CAMBIO D'ORARIO: LEZIONI SPOSTATE O CANCELLATE A MANO/.test(uscita) && /ORARI_6_COLORALEZIONI/.test(uscita) &&
    !/INVIO: tutto a me stesso/.test(uscita) && !/CONVIVENZA CON LA POSTA/.test(uscita));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
//  LA PROVA DELLA PROVA
// ---------------------------------------------------------------------------
intestazione('LA PROVA DELLA PROVA');
const errore = f => { try { f(); return ''; } catch (e) { return e.message; } };
function cambiato(vecchio, nuovo) {
  if (orari.indexOf(vecchio) < 0) return null;
  return orari.replace(vecchio, nuovo);
}
const APERTO = cambiato('// [FINE SOLO EMAIL] ------------------------------------------------------------\n\n' +
                        '\n// ===========================================================================\n//  4 - GOOGLE CALENDAR',
                        '\n\n// ===========================================================================\n//  4 - GOOGLE CALENDAR');
verifica('un blocco delle email aperto e non chiuso e\' un errore',
  APERTO !== null && /non si chiude|dentro un altro blocco/.test(errore(() => soloCalendario(APERTO, testa))));
const SENZA_COMMENTO = cambiato('// var _ORARI_ALTRE_ESECUZIONI = ', 'var _ORARI_ALTRE_ESECUZIONI = ');
verifica('una riga "solo calendario" senza "// " e\' un errore',
  SENZA_COMMENTO !== null && /manca "\/\/ "/.test(errore(() => soloCalendario(SENZA_COMMENTO, testa))));
verifica('e cosi\' una fine senza il suo inizio',
  /senza il suo inizio/.test(errore(() => soloCalendario(orari.replace(SEGNI.email + ' -----', '// -----'), testa))));
verifica('e Orari.gs senza la sua intestazione',
  /intestazione/.test(errore(() => soloCalendario(orari.slice(orari.indexOf('*/') + 2), testa))));
// il tuo indirizzo senza i segni: in Calendario.gs ci sarebbe getActiveUser
const INDIRIZZO = cambiato('// [SOLO EMAIL] -----------------------------------------------------------------\nfunction _mioIndirizzoOrari_() {',
                           'function _mioIndirizzoOrari_() {');
let conIndirizzo = '';
if (INDIRIZZO !== null) {
  const pezzi = INDIRIZZO.split('// [FINE SOLO EMAIL] ------------------------------------------------------------\n\nfunction _programmaRipresaOrari_');
  conIndirizzo = (pezzi.length === 2) ? soloCalendario(pezzi.join('\nfunction _programmaRipresaOrari_'), testa) : '';
}
verifica('le funzioni del tuo indirizzo senza i segni finirebbero in Calendario.gs, e i controlli lo vedono (' +
  vietatiIn(conIndirizzo).join(', ') + ')', vietatiIn(conIndirizzo).indexOf('getActiveUser') >= 0);
const MAIL = cambiato('function ORARI_4_calendario(e) {\n',
                      'function ORARI_4_calendario(e) {\n  MailApp.getRemainingDailyQuota();\n');
verifica('MailApp in una parte del calendario viene visto',
  MAIL !== null && vietatiIn(soloCalendario(MAIL, testa)).indexOf('MailApp') >= 0);
verifica('e cosi\' un servizio che nessuno script usa, anche solo in un commento (DriveApp)',
  vietatiIn(soloCalendario(orari.replace('function ORARI_4_calendario(e) {\n',
    'function ORARI_4_calendario(e) {\n  // DriveApp.getFiles()\n'), testa)).indexOf('DriveApp') >= 0);
const conInvio = soloCalendario(orari.replace(/\/\/ \[SOLO EMAIL\] -+\n\/\/ =+\n\/\/  2 - INVIO/, '// ===\n//  2 - INVIO')
  .replace('      \'Li trovi nella tua Posta in arrivo: cerca il cognome per ritrovare l\\\'orario di un collega.\';\n' +
           '  }\n  Logger.log(fine);\n  return fine;\n}\n// [FINE SOLO EMAIL]',
           '      \'Li trovi nella tua Posta in arrivo: cerca il cognome per ritrovare l\\\'orario di un collega.\';\n' +
           '  }\n  Logger.log(fine);\n  return fine;\n}\n// ---'), testa);
verifica('l\'invio senza i segni darebbe a Calendario.gs ORARI_2_invia, e i controlli lo vedono',
  pubbliche(conInvio).indexOf('ORARI_2_invia') >= 0 && vietatiIn(conInvio).indexOf('MailApp') >= 0);

intestazione('RISULTATO');
if (fallimenti === 0) {
  console.log('  Tutte le prove superate.');
} else {
  console.log('  PROVE FALLITE: ' + fallimenti);
  process.exitCode = 1;
}
