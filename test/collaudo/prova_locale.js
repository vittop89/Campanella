/**
 * Prova in locale del collaudo del calendario
 *
 *   node test/collaudo/prova_locale.js
 *
 * Fa girare test/collaudo/Collaudo_calendario.gs come nel progetto di prova,
 * insieme a Calendario.gs (la versione solo calendario, come la prepara
 * l'applicazione: test/solo_calendario.js) e insieme a src/risorse/Orari.gs,
 * con le finte API di test/mock_orari.js: la parte "FINTE API" di quel file,
 * presa cosi' com'e' (niente copie a mano; ogni progetto ha la sua, nuova).
 * Con Calendario.gs il progetto e' quello di un altro account: niente
 * MailApp ne' GmailApp, e Session da' soltanto il fuso orario. Controlla che:
 *   - il collaudo non chieda permessi in piu' di Calendario.gs: non nomina,
 *     nemmeno in un commento, i servizi vietati in Calendario.gs
 *     (SoloCalendario.Vietati, in src/SoloCalendario.cs), usa solo servizi
 *     che usa anche Calendario.gs, di Session solo il fuso orario, e delle
 *     funzioni e costanti di Orari.gs solo quelle che ci sono anche in
 *     Calendario.gs (la prova della prova: con una di quelle deve fallire);
 *   - COLLAUDO dica OK a tutti i controlli, con Calendario.gs e con Orari.gs,
 *     con le NOTE sui punti mai provati dal vivo, e alla fine non resti
 *     niente: calendari di prova, trigger, lavori degli orari a meta';
 *   - COLLAUDO_1, COLLAUDO_2 e COLLAUDO_3, uno dopo l'altro, facciano lo
 *     stesso; la parte 3 (i colloqui, con le date intorno a oggi) sia tutta
 *     OK in ogni giorno della settimana, al cambio dell'ora e a capodanno;
 *   - il collaudo dica NO quando Google o lo script non fanno quello che
 *     devono (la prova della prova): setTimeZone senza effetto, le serie nel
 *     fuso con cui e' nato il calendario, il calendario creato senza fuso
 *     come la 1.5, ORARI_7_colloqui che cambia anche i colloqui passati, i
 *     colloqui senza il link come luogo, senza il loro colore, anche nei
 *     giorni senza colloqui, ORARI_ANNULLA_calendario che li lascia; e
 *     pulisca lo stesso;
 *   - finito il tempo si fermi, dica di eseguire le parti a parte, e pulisca;
 *     con Google lento lasci alle funzioni del calendario solo il tempo che
 *     resta (_ORARI_MAX_SECONDI) e finisca, pulizia compresa, prima dei 360
 *     secondi; una parte che non ci sta non la cominci, e la dica da fare;
 *   - non cominci in un progetto che non e' di prova, ne' con un calendario
 *     con lo stesso nome che non e' suo, ne' con uno script senza
 *     ORARI_7_colloqui, e tolga i resti di un collaudo interrotto.
 */

'use strict';
// il fuso degli script della scuola, con l'ora legale (vedi mock_orari.js):
// va fissato prima di qualunque data
process.env.TZ = 'Europe/Rome';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { soloCalendario } = require('../solo_calendario');

const qui = __dirname;
const radice = path.join(qui, '..', '..');
const percorsoBanco = path.join(radice, 'test', 'mock_orari.js');
const banco = fs.readFileSync(percorsoBanco, 'utf8');
const orari = fs.readFileSync(path.join(radice, 'src', 'risorse', 'Orari.gs'), 'utf8');
const testaCalendario = fs.readFileSync(path.join(radice, 'src', 'risorse', 'Calendario_intestazione.txt'), 'utf8');
// Calendario.gs come lo prepara l'applicazione (test/prova_orario.ps1 controlla che sia lo stesso)
const calendario = soloCalendario(orari, testaCalendario);
const collaudo = fs.readFileSync(path.join(qui, 'Collaudo_calendario.gs'), 'utf8');
// la versione dello script, come la scrivono il collaudo e il riepilogo
const VERSIONE = (/\bvar\s+_ORARI_VERSIONE\s*=\s*'([^']+)'/.exec(orari) || [])[1];

let fallimenti = 0;
function verifica(descrizione, condizione, dettaglio) {
  console.log((condizione ? '  OK      ' : '  FALLITO ') + descrizione);
  if (!condizione) {
    fallimenti++;
    if (dettaglio) console.log('          ' + String(dettaglio).replace(/\n/g, '\n          '));
  }
}
function intestazione(t) {
  console.log('\n' + '='.repeat(70) + '\n  ' + t + '\n' + '='.repeat(70));
}

verifica('le prove girano nel fuso di Roma, con l\'ora legale (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')',
  new Date(2026, 9, 20).getTimezoneOffset() === -120 && new Date(2026, 9, 27).getTimezoneOffset() === -60);

// ---------------------------------------------------------------------------
//  LE FINTE API DI mock_orari.js
// ---------------------------------------------------------------------------
// (i due segni a inizio riga: il commento in cima alla parte li cita)
const INIZIO_FINTE = '//  FINTE API';
const FINE_FINTE = 'const contesto = vm.createContext(';
const da = banco.indexOf('\n' + INIZIO_FINTE) + 1;
const a = banco.indexOf('\n' + FINE_FINTE, da) + 1;
verifica('in mock_orari.js ci sono le finte API, fra "' + INIZIO_FINTE + '" e "' + FINE_FINTE + '" a inizio riga', da > 0 && a > da);
if (!(da > 0 && a > da)) {
  console.log('\n  PROVE FALLITE: ' + fallimenti);
  process.exit(1);
}
const inizioFinte = banco.lastIndexOf('\n', da) + 1;
const finte = banco.slice(inizioFinte, a);
const righePrima = banco.slice(0, inizioFinte).split('\n').length - 1;
// una funzione che, a ogni chiamata, crea finte API nuove: calendari,
// proprieta', trigger e registro tutti vuoti. Le righe degli errori sono
// quelle di mock_orari.js
const fabbrica = vm.runInThisContext(
  '(function (IO) {\n\'use strict\';\n' + finte + '\n' +
  'return { MailApp, GmailApp, CalendarApp, PropertiesService, LockService, ScriptApp, Session, Logger, Utilities,\n' +
  '         DateFinta, calendari, trigger, proprieta, registro,\n' +
  '         imposta(nome, valore) {\n' +
  '           if (nome === \'fusoDiGoogle\') fusoDiGoogle = valore;\n' +
  '           else if (nome === \'coloreDiGoogle\') coloreDiGoogle = valore;\n' +
  '           else if (nome === \'oggi\') oggiFinto = valore;\n' +
  '           else throw new Error(\'non so impostare \' + nome);\n' +
  '         },\n' +
  '         avanti(ms) { orologio += ms; } };\n})',
  { filename: percorsoBanco, lineOffset: righePrima - 2 });

// il giorno delle prove: la parte 3 mette i colloqui intorno a oggi. Un
// giovedi': il ricevimento del mercoledi' ha un incontro ieri e uno la
// settimana prossima nello stesso tratto, che ORARI_7_colloqui rifa' fino a ieri
const OGGI = new Date(2026, 9, 1, 9, 30);

/**
 * Un progetto di prova: finte API nuove, lo script del calendario
 * (Calendario.gs, di partenza, o Orari.gs; codice: un altro testo) e
 * Collaudo_calendario.gs, piu' il codice dato in "prima" (per esempio la
 * Posta). Con Calendario.gs, come nell'altro account: niente MailApp ne'
 * GmailApp, e di Session solo il fuso orario.
 */
function progetto(opzioni) {
  opzioni = opzioni || {};
  const script = opzioni.script || 'Calendario.gs';
  const f = fabbrica('io@scuola-esempio.edu.it');
  if (opzioni.fusoDiGoogle) f.imposta('fusoDiGoogle', opzioni.fusoDiGoogle);
  if (opzioni.coloreDiGoogle) f.imposta('coloreDiGoogle', opzioni.coloreDiGoogle);
  f.imposta('oggi', opzioni.oggi === undefined ? OGGI : opzioni.oggi);
  const comuni = { CalendarApp: f.CalendarApp, PropertiesService: f.PropertiesService, LockService: f.LockService,
                   ScriptApp: f.ScriptApp, Logger: f.Logger, Utilities: f.Utilities, Date: f.DateFinta, JSON, Math, String,
                   Number, Object, Array, RegExp, Error, isNaN, console };
  const contesto = vm.createContext(script === 'Orari.gs'
    ? Object.assign({ MailApp: f.MailApp, GmailApp: f.GmailApp, Session: f.Session }, comuni)
    : Object.assign({ Session: { getScriptTimeZone: f.Session.getScriptTimeZone } }, comuni));
  if (opzioni.prima) vm.runInContext(opzioni.prima, contesto, { filename: 'altro.gs' });
  vm.runInContext(opzioni.codice || (script === 'Orari.gs' ? orari : calendario), contesto, { filename: script });
  vm.runInContext(opzioni.collaudo || collaudo, contesto, { filename: 'Collaudo_calendario.gs' });
  return { f, contesto, script };
}

/** Esegue una funzione del collaudo e divide il registro: righe OK, NO, NOTA, PASSO. */
function esegui(p, funzione) {
  const partenza = p.f.registro.length;
  p.partenza = p.f.DateFinta.now();
  let riepilogo = '', errore = null;
  try { riepilogo = p.contesto[funzione](); } catch (e) { errore = e; }
  const righe = p.f.registro.slice(partenza);
  const di = prefisso => righe.filter(r => r.indexOf(prefisso) === 0).map(r => r.slice(prefisso.length).trim());
  return { righe, riepilogo: String(riepilogo || ''), errore, ok: di('OK '), no: di('NO '), note: di('NOTA '),
           passi: di('PASSO '), testo: righe.join('\n') };
}

/** Quello che deve restare dopo un collaudo: niente calendari di prova, trigger o proprieta' di Campanella. */
function puliti(p, esito, nome) {
  const calendari = p.f.calendari.map(c => c.nome).filter(n => /^Collaudo Campanella/.test(n));
  verifica(nome + ': alla fine nessun calendario di prova' + (calendari.length ? ' (restano: ' + calendari.join(', ') + ')' : ''),
    calendari.length === 0);
  verifica(nome + ': nessun trigger' + (p.f.trigger.length ? ' (restano: ' + p.f.trigger.map(t => t.fn).join(', ') + ')' : ''),
    p.f.trigger.length === 0);
  const chiavi = [...p.f.proprieta.keys()].filter(k => /^CAMPANELLA_/.test(k));
  verifica(nome + ': nessun lavoro degli orari a meta\' e nessun segno del collaudo' + (chiavi.length ? ' (' + chiavi.join(', ') + ')' : ''),
    chiavi.length === 0);
  verifica(nome + ': il riepilogo c\'e\', con i conti, e _ORARI_MAX_SECONDI e\' tornato com\'era (260)',
    /== RIEPILOGO di /.test(esito.riepilogo) && /Controlli: \d+ {3}OK: \d+ {3}NO: \d+/.test(esito.riepilogo) &&
    p.contesto._ORARI_MAX_SECONDI === 260, esito.errore ? String(esito.errore.stack) : esito.riepilogo);
}

function contiene(elenco, pezzo) {
  return elenco.some(r => r.indexOf(pezzo) >= 0);
}

/** Orari.gs con una sostituzione (la prova della prova): verifica che sia cambiato davvero. */
function mutato(da, a, nome) {
  const nuovo = orari.replace(da, a);
  verifica('in Orari.gs ho cambiato ' + nome, nuovo !== orari);
  return nuovo;
}

// ---------------------------------------------------------------------------
//  NIENTE PERMESSI IN PIU' DI CALENDARIO.GS
// ---------------------------------------------------------------------------
intestazione('IL COLLAUDO NON CHIEDE PERMESSI IN PIU\' DI CALENDARIO.GS');
// i nomi che in Calendario.gs non ci devono essere, nemmeno in un commento:
// quelli dell'applicazione (SoloCalendario.Vietati), letti dal sorgente
const sorgenteSolo = fs.readFileSync(path.join(radice, 'src', 'SoloCalendario.cs'), 'utf8');
const mVietati = /\bVietati\s*=\s*\{([^}]*)\}/.exec(sorgenteSolo);
const VIETATI = mVietati ? [...mVietati[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
verifica('in src/SoloCalendario.cs ci sono i nomi vietati in Calendario.gs (' + VIETATI.join(', ') + ')',
  VIETATI.indexOf('MailApp') >= 0 && VIETATI.indexOf('GmailApp') >= 0 && VIETATI.indexOf('getActiveUser') >= 0);
verifica('Calendario.gs, come lo prepara l\'applicazione, e\' la versione solo calendario',
  /Calendario\.gs versione \d+\.\d+\.\d+/.test(calendario) && !/function ORARI_2_invia\(/.test(calendario));

/** I nomi vietati che il testo nomina (anche in un commento). */
const vietatiIn = testo => VIETATI.filter(n => new RegExp('(?<![\\w$])' + n.replace(/\./g, '\\.') + '(?![\\w$])').test(testo));
/** I servizi di Apps Script che il testo nomina (anche in un commento: Google chiede i permessi guardando il codice). */
const serviziIn = testo => [...new Set((testo.match(/\b(?:[A-Z][A-Za-z]*(?:App|Service)|Session|Logger|Utilities|Browser)\b/g) || []))].sort();
/** Quello che il collaudo usa di Session. */
const sessionIn = testo => [...new Set([...testo.matchAll(/\bSession\s*\.\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1]))].sort();
/** Le funzioni e le variabili dichiarate in cima a uno script. */
function dichiarati(testo) {
  const nomi = new Set();
  for (const m of testo.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/gm)) nomi.add(m[1] || m[2]);
  return nomi;
}
/**
 * Le funzioni e le costanti di Orari.gs che il testo usa, fuori dai commenti
 * e dai typeof (con typeof il collaudo guarda solo se ci sono), e che in
 * Calendario.gs non ci sono.
 */
function soloDiOrari(testo) {
  const codice = testo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1')
                      .replace(/\btypeof\s+[A-Za-z_$][\w$]*/g, '');
  const diOrari = dichiarati(orari), diCalendario = dichiarati(calendario);
  const usati = new Set(codice.match(/[A-Za-z_$][\w$]*/g) || []);
  return [...usati].filter(n => diOrari.has(n) && !diCalendario.has(n)).sort();
}
function controllaPermessi(testo) {
  const vietati = vietatiIn(testo);
  const altri = serviziIn(testo).filter(s => serviziIn(calendario).indexOf(s) < 0);
  const session = sessionIn(testo).filter(s => s !== 'getScriptTimeZone');
  const diOrari = soloDiOrari(testo);
  return { vietati, altri, session, diOrari, buono: !vietati.length && !altri.length && !session.length && !diOrari.length };
}
{
  const c = controllaPermessi(collaudo);
  verifica('il collaudo non nomina i servizi vietati in Calendario.gs, nemmeno in un commento', !c.vietati.length,
    'nomina: ' + c.vietati.join(', '));
  verifica('usa solo servizi che usa anche Calendario.gs (' + serviziIn(collaudo).join(', ') + '; Calendario.gs: ' +
    serviziIn(calendario).join(', ') + ')', !c.altri.length, 'in piu\': ' + c.altri.join(', '));
  verifica('di Session usa solo il fuso orario (' + sessionIn(collaudo).join(', ') + ')', !c.session.length,
    'usa anche: ' + c.session.join(', '));
  verifica('delle funzioni e costanti di Orari.gs usa solo quelle che ci sono anche in Calendario.gs', !c.diOrari.length,
    'solo in Orari.gs: ' + c.diOrari.join(', '));
  // la prova della prova: con un servizio delle email, un altro servizio o una funzione delle email il controllo fallisce
  const conMail = controllaPermessi(collaudo + '\nfunction _x_() { return MailApp.getRemainingDailyQuota(); }\n');
  const conDrive = controllaPermessi(collaudo + '\n// DriveApp.getFiles()\n');
  const conCache = controllaPermessi(collaudo + '\nfunction _x_() { return CacheService.getUserCache(); }\n');
  const conIndirizzo = controllaPermessi(collaudo + '\nfunction _x_() { return Session.getEffectiveUser(); }\n');
  const conFunzione = controllaPermessi(collaudo + '\nfunction _x_() { return _mioIndirizzoOrari_(); }\n');
  verifica('  ...e con MailApp, DriveApp in un commento, CacheService, Session.getEffectiveUser o una funzione delle email ' +
    'il controllo fallisce',
    !conMail.buono && conMail.vietati.indexOf('MailApp') >= 0 && !conDrive.buono && conDrive.vietati.indexOf('DriveApp') >= 0 &&
    !conCache.buono && conCache.altri.indexOf('CacheService') >= 0 && !conIndirizzo.buono &&
    conIndirizzo.session.indexOf('getEffectiveUser') >= 0 && !conFunzione.buono &&
    conFunzione.diOrari.indexOf('_mioIndirizzoOrari_') >= 0);
}

// quanti controlli fa COLLAUDO adesso: uno nuovo nel collaudo va contato qui,
// cosi' uno che sparisce (o viene saltato in silenzio) si vede
const CONTROLLI = 76;
const controlliParte = {};

// i controlli che il collaudo deve fare davvero (non saltarli in silenzio)
const ATTESI_PARTE_1 = [
  'ORARI_1_anteprima dice 4 serie (14 lezioni) e 1 lezione saltata',
  'ORARI_1_anteprima dice i colori delle classi',
  'il calendario creato ha il fuso orario dello script (Europe/Rome)',
  'dopo ORARI_4_calendario: le lezioni sono proprio quelle dell\'orario (14)',
  'dopo ORARI_4_calendario: dal 26/10, finita l\'ora legale, le lezioni sono alla stessa ora di prima (per esempio 2B: il 19/10 08:00-10:00 e il 26/10 08:00-10:00)',
  'dopo ORARI_4_calendario: nessuna lezione nei giorni senza lezione (20/10, 06/11)',
  'dopo ORARI_4_calendario: ogni lezione ha il colore della sua classe (2B Mirtillo, 3B Basilico, 4C Mandarino)',
  'dopo ORARI_4_calendario: ogni lezione ha il contrassegno di Campanella',
  'setTime ha spostato la lezione di 4C del 22/10 09:00 al 23/10 11:00, e solo lei',
  'deleteEvent ha tolto la lezione di 2B del 26/10 08:00, e solo lei',
  'setColor ha colorato Pomodoro la lezione di 2B del 19/10 08:00, e solo lei',
  'ORARI_1_anteprima con l\'orario nuovo dice il cambio dal 02/11 (3 serie nuove, 1 lezione saltata)',
  'ORARI_5_cambioOrario finisce e dice 3 serie rifatte fino al 01/11, 0 tolte, 2 lezioni rimesse come eventi singoli',
  'dopo ORARI_5_cambioOrario: le lezioni prima del 02/11 sono rimaste come erano, alla stessa ora e con i loro colori (anche la spostata, la cancellata, la colorata a mano)',
  'dopo ORARI_5_cambioOrario: dal 02/11 nessuna lezione dell\'orario di prima',
  'dopo ORARI_5_cambioOrario: dal 02/11 c\'e\' l\'orario nuovo, giusto (5 lezioni)',
  'dopo ORARI_5_cambioOrario: le lezioni dell\'orario nuovo hanno il colore della loro classe',
  'dopo ORARI_5_cambioOrario: la riunione, che non e\' di Campanella, e\' rimasta com\'era',
  'ORARI_5_cambioOrario rieseguito con gli stessi dati lascia il calendario com\'era',
  'ORARI_6_coloraLezioni da\' a ogni lezione il colore nuovo della sua classe (2B Banana, 3B Basilico, 4C Vinaccia), e lascia Pomodoro',
  'ORARI_6_coloraLezioni non sposta, non aggiunge e non toglie niente',
  'la lezione di 4C spostata al 23/10 11:00, rimessa da ORARI_5_cambioOrario come evento singolo, ha il colore nuovo di 4C',
  'ORARI_ANNULLA_calendario toglie tutte le lezioni di Campanella',
  'e lascia la riunione, che non e\' di Campanella',
  'il calendario di prova "Collaudo Campanella" non c\'e\' piu\' (cancellato adesso con deleteCalendar)'
];
const ATTESI_PARTE_2 = [
  'il calendario creato senza fuso ha il fuso UTC',
  'come visto dal vivo: la serie di 2B e\' alle 08:00 fino al 19/10 e alle 07:00 dal 26/10',
  'ORARI_1_anteprima dice che il calendario e\' da sistemare',
  'ORARI_4_calendario si ferma',
  'e spiega: il fuso UTC',
  'e non ha toccato niente: le stesse lezioni alla stessa ora, e il calendario ancora in UTC',
  'ORARI_ANNULLA_calendario toglie la serie della 1.5',
  'e lascia "Ricevimento (collaudo)"',
  'ORARI_4_calendario adesso mette l\'orario, e dice che al calendario ha messo il fuso Europe/Rome (aveva UTC)',
  'il calendario ha adesso il fuso orario dello script (Europe/Rome)',
  'dopo ORARI_ANNULLA_calendario e ORARI_4_calendario: le lezioni sono proprio quelle dell\'orario (14)',
  'dopo ORARI_ANNULLA_calendario e ORARI_4_calendario: dal 26/10, finita l\'ora legale, le lezioni sono alla stessa ora di prima',
  'il calendario di prova "Collaudo Campanella vecchio" non c\'e\' piu\' (cancellato adesso con deleteCalendar)'
];
// oggi e' giovedi' 01/10/2026: il periodo va dal 14/09 al 23/10, il giorno
// senza lezione e' il 23/09, i colloqui sono sospesi dal 12/10 al 16/10 (la
// giornata e' il 15/10), l'orario nuovo vale dal 12/10
const ATTESI_PARTE_3 = [
  'ORARI_1_anteprima dice i colloqui da mettere: 1 ricevimento settimanale (3 serie, 4 incontri), 1 giornata singola; 2 incontri ' +
    'saltati nei giorni senza lezione o senza colloqui. Colore dei colloqui: Pavone.',
  'ORARI_4_calendario mette l\'orario e i colloqui, in un calendario che crea con il fuso Europe/Rome',
  'c\'e\' il calendario "Collaudo Campanella colloqui"',
  'dopo ORARI_4_calendario: le lezioni sono quelle dell\'orario (6, 2B il lunedi\'), con il colore della classe',
  'dopo ORARI_4_calendario: i colloqui sono proprio quelli scritti (4 incontri del ricevimento e 1 giornata), con il titolo scritto',
  'dopo ORARI_4_calendario: ogni colloquio ha come luogo il suo link del Meet (https://meet.google.com/abc-defg-hij)',
  'dopo ORARI_4_calendario: ogni colloquio ha il colore dei colloqui (Pavone)',
  'dopo ORARI_4_calendario: ogni colloquio (5) ha il contrassegno dei colloqui e la descrizione di Campanella, con il suo link',
  'dopo ORARI_4_calendario: nessun incontro del ricevimento il 23/09 (giorno senza lezione) ne\' dal 12/10 al 16/10 (colloqui ' +
    'sospesi); la giornata del 15/10, in quei giorni, c\'e\'',
  'dopo ORARI_4_calendario: il ricevimento e\' a tratti, una serie per ogni tratto di settimane (3: 16/09; 30/09, 07/10; 21/10), ' +
    'e la giornata e\' un evento singolo',
  'ORARI_7_colloqui con il ricevimento dalle 16 alle 17 e un altro link aggiorna i colloqui da oggi: ricevimenti rifatti fino a ' +
    'ieri 1, tolti 1, giornate tolte 1',
  'dopo ORARI_7_colloqui: gli incontri prima di oggi (2) sono rimasti come erano',
  'dopo ORARI_7_colloqui: da oggi ci sono proprio i colloqui nuovi (3), un\'ora dopo, con il link nuovo e il colore dei colloqui',
  'dopo ORARI_7_colloqui: ogni colloquio (5) ha il contrassegno dei colloqui',
  'dopo ORARI_7_colloqui: le lezioni e "Colloquio con la dirigente (collaudo)", che non e\' di Campanella, sono rimasti come erano',
  'ORARI_1_anteprima con l\'orario nuovo dal 12/10 dice che anche ORARI_7_colloqui mette i colloqui nuovi da quel giorno',
  'ORARI_7_colloqui prima del cambio d\'orario aggiorna i colloqui dal 12/10',
  'e fino al 11/10 i colloqui sono rimasti come erano',
  'e dal 12/10 ci sono i colloqui dell\'orario nuovo (2, il ricevimento il giovedi\' con il terzo link)',
  'e le lezioni sono ancora quelle dell\'orario di prima, anche dal 12/10',
  'ORARI_5_cambioOrario cambia l\'orario dal 12/10 (serie rifatte fino al giorno prima: 1) e dice i colloqui da quel giorno',
  'dopo ORARI_5_cambioOrario: le lezioni prima del 12/10 sono rimaste, e da quel giorno c\'e\' l\'orario nuovo (2B il martedi\', 2 lezioni)',
  'dopo ORARI_5_cambioOrario: i colloqui sono come li ha lasciati ORARI_7_colloqui',
  'dopo ORARI_5_cambioOrario: ogni colloquio (5) ha il contrassegno dei colloqui',
  'ORARI_6_coloraLezioni da\' a tutti i colloqui (5, anche quelli prima di oggi e quelli rifatti) il colore nuovo dei colloqui, Vinaccia',
  'e le lezioni restano con il colore della loro classe, e niente e\' spostato, aggiunto o tolto',
  'ORARI_ANNULLA_calendario toglie tutte le lezioni e tutti i colloqui di Campanella',
  'e lascia "Colloquio con la dirigente (collaudo)", che non e\' di Campanella',
  'il calendario di prova "Collaudo Campanella colloqui" non c\'e\' piu\' (cancellato adesso con deleteCalendar)'
];

// ---------------------------------------------------------------------------
//  COLLAUDO: tutto OK, con Calendario.gs e con Orari.gs
// ---------------------------------------------------------------------------
for (const script of ['Calendario.gs', 'Orari.gs']) {
  intestazione('COLLAUDO CON ' + script.toUpperCase() + ' E IL FINTO CALENDARIO: TUTTO OK');
  const p = progetto({ script });
  const e = esegui(p, 'COLLAUDO');
  verifica('COLLAUDO non lancia errori', !e.errore, e.errore && e.errore.stack);
  verifica('nessun controllo NO (' + e.no.length + ')', e.no.length === 0, e.no.join('\n'));
  verifica('tutti i controlli OK: ' + e.ok.length + ' (devono essere ' + CONTROLLI + ')', e.ok.length === CONTROLLI);
  verifica('il riepilogo dice NO: 0, "Tutti i controlli sono OK", le tre parti fatte e niente da fare, con lo script (' +
    script + ' ' + VERSIONE + ')', /NO: 0\n/.test(e.riepilogo) && e.riepilogo.indexOf('Tutti i controlli sono OK.') >= 0 &&
    /Parti fatte: 1 in \d+\.\d s, 2 in \d+\.\d s, 3 in \d+\.\d s\./.test(e.riepilogo) && e.riepilogo.indexOf('Da fare') < 0 &&
    e.riepilogo.indexOf('== RIEPILOGO di COLLAUDO (' + script + ' ' + VERSIONE + ')\n') === 0, e.riepilogo);
  ATTESI_PARTE_1.concat(ATTESI_PARTE_2, ATTESI_PARTE_3, ['nessun trigger rimasto nel progetto'])
    .forEach(atteso => verifica('OK: ' + atteso, contiene(e.ok, atteso)));
  // le NOTE sui punti mai provati dal vivo, con quello che il finto calendario suppone
  verifica('NOTA: setTime su una lezione di una serie sposta solo quella, che resta nella serie',
    contiene(e.note, 'setTime su una lezione di una serie: sposta solo quella lezione, che resta nella serie') &&
    contiene(e.note, 'Le lezioni della serie di prova adesso: 17/10 17:00, 24/10 18:30, 31/10 17:00.'), e.note.join('\n'));
  verifica('NOTA: setColor su una lezione di una serie colora solo quella',
    contiene(e.note, 'setColor su una lezione di una serie: colora solo quella lezione'), e.note.join('\n'));
  verifica('NOTA: EventSeries.setColor colora le lezioni, anche la spostata, e lascia la colorata a mano',
    contiene(e.note, 'EventSeries.setColor su una serie con lezioni cambiate a mano: colora le lezioni della serie, anche ' +
      'quella spostata con setTime, e lascia il suo colore a quella colorata a mano'), e.note.join('\n'));
  verifica('NOTA: setTimeZone non cambia l\'ora del ricevimento, che c\'era gia\'',
    contiene(e.note, 'setTimeZone su un calendario che c\'era gia\' (lo chiama ORARI_4_calendario): NON cambia l\'ora delle ' +
      'serie gia\' create: "Ricevimento (collaudo)", creato quando il calendario era in UTC, e\' ancora 14/10 15:00, 21/10 ' +
      '15:00, 28/10 14:00, 04/11 14:00, 11/11 14:00'), e.note.join('\n'));
  verifica('le NOTE finiscono anche nel riepilogo', e.riepilogo.indexOf('Cosa fa Google dove nessuno l\'aveva provato:') >= 0 &&
    e.note.every(n => e.riepilogo.indexOf(n) >= 0));
  // il tempo di ogni passo
  verifica('una riga PASSO con i secondi per ogni passo (' + e.passi.length + '), anche per la pulizia',
    e.passi.length >= 50 && e.passi.every(r => /: \d+\.\d s \(\d+\.\d s dall'inizio\)/.test(r)) &&
    contiene(e.passi, 'ORARI_5_cambioOrario rieseguito: ') && contiene(e.passi, 'ORARI_7_colloqui prima del cambio d\'orario: ') &&
    contiene(e.passi, 'pulizia: '), e.passi.join('\n'));
  verifica('il riepilogo dice il tempo in tutto e i passi piu\' lenti', /Tempo: \d+\.\d s in tutto, \d+ passi/.test(e.riepilogo) &&
    e.riepilogo.indexOf('I piu\' lenti: ') >= 0);
  // le funzioni vere dello script hanno lavorato davvero (le loro righe nel registro)
  verifica('nel registro ci sono i messaggi veri di ' + script + ' (anteprima, cambio, colori, colloqui, annulla)',
    e.testo.indexOf(script === 'Orari.gs' ? 'ANTEPRIMA - non viene mandato niente.' :
                                            'ANTEPRIMA - sul calendario non viene messo niente.') >= 0 &&
    e.testo.indexOf(script + ' versione ' + VERSIONE + '; fuso orario dello script: Europe/Rome.') >= 0 &&
    e.testo.indexOf('Cambio d\'orario dal 2026-11-02') >= 0 &&
    e.testo.indexOf('Colori delle classi nel calendario "Collaudo Campanella"') >= 0 &&
    e.testo.indexOf('Colloqui aggiornati dal 2026-10-01 nel calendario "Collaudo Campanella colloqui"') >= 0 &&
    e.testo.indexOf('Colloqui aggiornati dal 2026-10-12 nel calendario "Collaudo Campanella colloqui"') >= 0 &&
    e.testo.indexOf('eventi messi da Campanella dal calendario "Collaudo Campanella"') >= 0);
  verifica('e il messaggio con cui ORARI_4_calendario si ferma sul calendario della 1.5',
    e.testo.indexOf('il suo messaggio: Il calendario "Collaudo Campanella vecchio" ha il fuso orario UTC, non Europe/Rome') >= 0);
  if (script === 'Calendario.gs') {
    verifica('con Calendario.gs nel registro non c\'e\' nessun indirizzo', e.testo.indexOf('@scuola-esempio') < 0 &&
      !/[\w.]+@[\w-]+\.[\w.]+/.test(e.testo));
  }
  puliti(p, e, 'COLLAUDO con ' + script);
}

intestazione('COLLAUDO_1, COLLAUDO_2 E COLLAUDO_3, UNO DOPO L\'ALTRO, NELLO STESSO PROGETTO');
for (const script of ['Calendario.gs', 'Orari.gs']) {
  const p = progetto({ script });
  const e1 = esegui(p, 'COLLAUDO_1');
  verifica(script + ', COLLAUDO_1: nessun NO, e fa solo la parte 1', !e1.errore && e1.no.length === 0 && e1.ok.length > 20 &&
    e1.testo.indexOf('PARTE 2') < 0 && e1.testo.indexOf('PARTE 3') < 0 && e1.testo.indexOf('Collaudo Campanella vecchio') < 0 &&
    e1.riepilogo.indexOf('Tutti i controlli sono OK.') >= 0 && /Parti fatte: 1 in /.test(e1.riepilogo), e1.no.join('\n'));
  puliti(p, e1, script + ', COLLAUDO_1');
  const e2 = esegui(p, 'COLLAUDO_2');
  verifica(script + ', COLLAUDO_2: nessun NO, e fa solo la parte 2', !e2.errore && e2.no.length === 0 && e2.ok.length > 10 &&
    e2.testo.indexOf('PARTE 1') < 0 && e2.testo.indexOf('PARTE 3') < 0, e2.no.join('\n'));
  puliti(p, e2, script + ', COLLAUDO_2');
  const e3 = esegui(p, 'COLLAUDO_3');
  verifica(script + ', COLLAUDO_3: nessun NO, e fa solo la parte 3', !e3.errore && e3.no.length === 0 && e3.ok.length > 25 &&
    e3.testo.indexOf('PARTE 1') < 0 && e3.testo.indexOf('PARTE 2') < 0 && e3.testo.indexOf('Collaudo Campanella vecchio') < 0,
    e3.no.join('\n'));
  ATTESI_PARTE_3.forEach(atteso => { if (!contiene(e3.ok, atteso)) verifica(script + ', COLLAUDO_3: OK: ' + atteso, false); });
  puliti(p, e3, script + ', COLLAUDO_3');
  // la pulizia di ognuno controlla i trigger: due volte in piu' di COLLAUDO
  verifica(script + ': insieme fanno i controlli di COLLAUDO (' + e1.ok.length + ' + ' + e2.ok.length + ' + ' + e3.ok.length +
    ' = ' + CONTROLLI + ' + 2)', e1.ok.length + e2.ok.length + e3.ok.length === CONTROLLI + 2);
  controlliParte[1] = e1.ok.length;
  controlliParte[2] = e2.ok.length;
  controlliParte[3] = e3.ok.length;
}

// ---------------------------------------------------------------------------
//  LA PARTE 3 IN OGNI GIORNO: le date sono intorno a oggi
// ---------------------------------------------------------------------------
intestazione('LA PARTE 3 IN OGNI GIORNO DELLA SETTIMANA, AL CAMBIO DELL\'ORA E A CAPODANNO');
{
  const giorni = [];
  for (let g = 28; g <= 34; g++) giorni.push(new Date(2026, 8, g, 18, 0));          // da lunedi' 28/09 a domenica 04/10, la sera
  giorni.push(new Date(2026, 9, 25, 10, 0), new Date(2026, 9, 28, 16, 30),          // la fine dell'ora legale, e dopo
              new Date(2027, 2, 28, 3, 30), new Date(2026, 11, 30, 23, 50),         // l'inizio, e capodanno
              new Date(2027, 0, 1, 0, 10));
  const male = [];
  for (const oggi of giorni) {
    const p = progetto({ oggi });
    const e = esegui(p, 'COLLAUDO_3');
    const calendari = p.f.calendari.filter(c => /^Collaudo Campanella/.test(c.nome)).length;
    if (e.errore || e.no.length || e.ok.length !== controlliParte[3] || calendari || p.f.trigger.length || p.f.proprieta.size) {
      male.push(oggi.toString().slice(0, 21) + ': ' + (e.errore ? e.errore.message : e.no.join('; ') + ' (' + e.ok.length + ' OK)'));
    }
  }
  verifica('COLLAUDO_3 e\' tutto OK (' + controlliParte[3] + ' controlli) e pulisce in ogni giorno della settimana, al cambio ' +
    'dell\'ora e a capodanno (' + giorni.length + ' giorni)', !male.length, male.join('\n'));
  // con il giorno vero di oggi
  const p = progetto({ oggi: null });
  const e = esegui(p, 'COLLAUDO_3');
  verifica('e con il giorno vero di oggi (' + new Date().toDateString() + ')', !e.errore && !e.no.length &&
    e.ok.length === controlliParte[3], e.no.join('\n'));
  puliti(p, e, 'oggi');
  // il giorno cambia a meta' della parte 3: ORARI_7_colloqui aggiornerebbe da un altro giorno
  const q = progetto();
  const vero = q.contesto.ORARI_4_calendario;
  q.contesto.ORARI_4_calendario = function () {
    const r = vero.apply(this, arguments);
    q.f.imposta('oggi', new Date(2026, 9, 2, 0, 5));
    return r;
  };
  const f = esegui(q, 'COLLAUDO_3');
  verifica('se il giorno cambia a meta\' della parte 3 lo dice, non esegue ORARI_7_colloqui e pulisce',
    contiene(f.no, 'il giorno e\' cambiato durante la parte 3 (era il 2026-10-01, adesso e\' il 2026-10-02)') &&
    f.testo.indexOf('Colloqui aggiornati') < 0 && f.testo.indexOf('Riesegui COLLAUDO_3.') >= 0, f.no.join('\n'));
  puliti(q, f, 'giorno cambiato');
}

// ---------------------------------------------------------------------------
//  LA PROVA DELLA PROVA: quando Google o lo script sbagliano, il collaudo dice NO
// ---------------------------------------------------------------------------
intestazione('LA PROVA DELLA PROVA: SETTIMEZONE SENZA EFFETTO');
{
  const p = progetto({ fusoDiGoogle: 'setTimeZone senza effetto' });
  const e = esegui(p, 'COLLAUDO_2');
  verifica('COLLAUDO_2 dice NO: ORARI_4_calendario, dopo ORARI_ANNULLA_calendario, non mette l\'orario',
    contiene(e.no, 'ORARI_4_calendario adesso mette l\'orario'), e.no.join('\n'));
  verifica('e che il calendario non ha il fuso dello script, e le lezioni non ci sono',
    contiene(e.no, 'il calendario ha adesso il fuso orario dello script') &&
    contiene(e.no, 'dopo ORARI_ANNULLA_calendario e ORARI_4_calendario: le lezioni sono proprio quelle dell\'orario'), e.no.join('\n'));
  verifica('con il messaggio dello script (Google dice che ha ancora UTC)',
    e.testo.indexOf('ma Google dice che ha ancora UTC') >= 0);
  verifica('la NOTA dice che il fuso non e\' cambiato', contiene(e.note, 'il calendario non ha preso il fuso Europe/Rome (ha ' +
    'ancora UTC)'), e.note.join('\n'));
  verifica('il riepilogo elenca i NO', e.riepilogo.indexOf('I controlli NO:') >= 0 && !/NO: 0\n/.test(e.riepilogo));
  puliti(p, e, 'setTimeZone senza effetto');
}

intestazione('LA PROVA DELLA PROVA: LE SERIE NEL FUSO CON CUI E\' NATO IL CALENDARIO');
{
  const p = progetto({ fusoDiGoogle: 'serie nel fuso di nascita' });
  const e = esegui(p, 'COLLAUDO_2');
  verifica('COLLAUDO_2 dice NO: ORARI_4_calendario non mette l\'orario, e le lezioni dal 26/10 non sono alla stessa ora',
    contiene(e.no, 'ORARI_4_calendario adesso mette l\'orario') &&
    contiene(e.no, 'dopo ORARI_ANNULLA_calendario e ORARI_4_calendario: dal 26/10, finita l\'ora legale, le lezioni sono alla ' +
      'stessa ora di prima'), e.no.join('\n'));
  verifica('con il messaggio della prova del fuso dello script', e.testo.indexOf('Google non ripete le lezioni del calendario') >= 0);
  puliti(p, e, 'serie nel fuso di nascita');
}

intestazione('LA PROVA DELLA PROVA: UNO SCRIPT CHE CREA IL CALENDARIO SENZA FUSO, COME LA 1.5');
{
  const senzaFuso = mutato(/,\s*timeZone: Session\.getScriptTimeZone\(\)/, '', 'createCalendar senza fuso');
  for (const script of ['Calendario.gs', 'Orari.gs']) {
    const p = progetto({ script, codice: script === 'Orari.gs' ? senzaFuso : soloCalendario(senzaFuso, testaCalendario) });
    const e = esegui(p, 'COLLAUDO_1');
    verifica(script + ': COLLAUDO_1 dice NO, il calendario creato non ha il fuso dello script',
      contiene(e.no, 'il calendario creato ha il fuso orario dello script (Europe/Rome)'), e.no.join('\n'));
    verifica('  ...e che ORARI_4_calendario non mette l\'orario (si ferma alla prova del fuso)',
      contiene(e.no, 'ORARI_4_calendario mette l\'orario, in un calendario che crea con il fuso Europe/Rome') &&
      e.testo.indexOf('Mi fermo qui con la parte 1') >= 0, e.no.join('\n'));
    verifica('  ...e le lezioni dal 26/10 un\'ora prima', contiene(e.no, 'dopo ORARI_4_calendario: dal 26/10, finita l\'ora legale'),
      e.no.join('\n'));
    puliti(p, e, script + ' senza fuso');
  }
}

intestazione('LA PROVA DELLA PROVA: EVENTSERIES.SETCOLOR CHE COPRE LE LEZIONI COLORATE A MANO');
{
  const p = progetto({ coloreDiGoogle: 'la serie colora anche le lezioni cambiate' });
  const e = esegui(p, 'COLLAUDO_1');
  verifica('la NOTA lo dice', contiene(e.note, 'e copre anche quella colorata a mano (ha 5)'), e.note.join('\n'));
  verifica('e il resto e\' OK (ORARI_6_coloraLezioni colora dopo il cambio, quando la lezione colorata a mano e\' un evento ' +
    'singolo)', e.no.length === 0, e.no.join('\n'));
  puliti(p, e, 'setColor della serie sopra quello a mano');
}

intestazione('LA PROVA DELLA PROVA: I COLLOQUI SBAGLIATI');
{
  const casi = [
    ['ORARI_7_colloqui che cambia anche i colloqui prima di oggi',
     mutato('return (oggi < periodo.inizio) ? periodo.inizio : oggi;', 'return periodo.inizio;', 'il giorno di ORARI_7_colloqui'),
     ['ORARI_7_colloqui con il ricevimento dalle 16 alle 17 e un altro link aggiorna i colloqui da oggi',
      'dopo ORARI_7_colloqui: gli incontri prima di oggi (2) sono rimasti come erano']],
    ['i colloqui senza il link come luogo',
     mutato('if (voce.link) opzioni.location = voce.link;', '', 'il luogo dei colloqui'),
     ['dopo ORARI_4_calendario: ogni colloquio ha come luogo il suo link del Meet']],
    ['i colloqui senza il loro colore',
     mutato('      if (c.coloreColloqui) {', '      if (false) {', 'il colore dei colloqui'),
     ['dopo ORARI_4_calendario: ogni colloquio ha il colore dei colloqui (Pavone)']],
    ['il ricevimento anche nei giorni senza colloqui',
     mutato('_orariSospeso_(chiave, periodo.sospensioni) || _orariSospeso_(chiave, sospesi)',
            '_orariSospeso_(chiave, periodo.sospensioni)', 'i periodi senza colloqui'),
     ['ORARI_1_anteprima dice i colloqui da mettere', 'dopo ORARI_4_calendario: i colloqui sono proprio quelli scritti',
      'dopo ORARI_4_calendario: nessun incontro del ricevimento il 23/09 (giorno senza lezione) ne\' dal 12/10 al 16/10',
      'dopo ORARI_4_calendario: il ricevimento e\' a tratti']],
    ['ORARI_ANNULLA_calendario che lascia i colloqui',
     mutato(/(      if \(voce\.serie\) voce\.serie\.deleteEventSeries\(\);\r?\n      else voce\.evento\.deleteEvent\(\);\r?\n      tolti\+\+;)/,
            '      if (voce.colloquio) continue;\n$1', 'ORARI_ANNULLA_calendario'),
     ['ORARI_ANNULLA_calendario toglie tutte le lezioni e tutti i colloqui di Campanella']]
  ];
  for (const [nome, codiceOrari, attesi] of casi) {
    const p = progetto({ codice: soloCalendario(codiceOrari, testaCalendario) });
    const e = esegui(p, 'COLLAUDO_3');
    const mancano = attesi.filter(x => !contiene(e.no, x));
    verifica('con ' + nome + ' COLLAUDO_3 dice NO (' + e.no.length + ')', !e.errore && mancano.length === 0,
      'non dice NO a: ' + mancano.join('; ') + '\nNO: ' + e.no.join('\n'));
    puliti(p, e, nome);
  }
}

// ---------------------------------------------------------------------------
//  IL TEMPO, IL PROGETTO GIUSTO, I RESTI
// ---------------------------------------------------------------------------
intestazione('IL TEMPO FINISCE A META\'');
{
  const p = progetto();
  // Google lento: ORARI_5_cambioOrario prende cinque minuti
  const vero = p.contesto.ORARI_5_cambioOrario;
  p.contesto.ORARI_5_cambioOrario = function () {
    const r = vero.apply(this, arguments);
    p.f.avanti(5 * 60 * 1000);
    return r;
  };
  const e = esegui(p, 'COLLAUDO');
  verifica('si ferma prima del passo dopo, e dice di eseguire le parti una alla volta',
    contiene(e.no, 'tempo: sono passati 300 secondi e Google ferma uno script dopo 360, quindi mi fermo prima di ' +
      '"lettura del calendario (dopo ORARI_5_cambioOrario)"') &&
    e.testo.indexOf('Esegui le parti una alla volta: COLLAUDO_1, COLLAUDO_2 e COLLAUDO_3.') >= 0, e.no.join('\n'));
  verifica('le parti 2 e 3 non le comincia, e il riepilogo dice di eseguirle tutte a parte',
    e.testo.indexOf('PARTE 2') < 0 && e.testo.indexOf('PARTE 3') < 0 && e.riepilogo.indexOf('Da fare, per il tempo: esegui ' +
      'COLLAUDO_1, poi COLLAUDO_2, poi COLLAUDO_3, uno alla volta, e copia anche i loro registri.') >= 0, e.riepilogo);
  verifica('la pulizia la fa lo stesso', contiene(e.ok, 'il calendario di prova "Collaudo Campanella" non c\'e\' piu\''));
  puliti(p, e, 'tempo finito');
}

intestazione('GOOGLE LENTO: LE FUNZIONI DEL CALENDARIO SI FERMANO DA SOLE, E LA PULIZIA C\'E\' SEMPRE');
{
  /**
   * COLLAUDO con Google lento: ogni pausa fra una modifica al calendario e
   * l'altra prende 20 secondi in piu'. ORARI_5_cambioOrario comincia a 82
   * secondi: senza il limite del collaudo andrebbe avanti fino a 342, e la
   * pulizia non ci starebbe. Torna il progetto, l'esito, il tempo del
   * riepilogo e, per ogni funzione del calendario, quando e' partita e con
   * quale _ORARI_MAX_SECONDI.
   */
  const lento = testo => {
    const p = progetto({ collaudo: testo });
    p.f.Utilities.sleep = ms => p.f.avanti(ms + 20000);
    const date = [];
    for (const nome of ['ORARI_1_anteprima', 'ORARI_4_calendario', 'ORARI_5_cambioOrario', 'ORARI_6_coloraLezioni',
                        'ORARI_7_colloqui', 'ORARI_ANNULLA_calendario']) {
      const vera = p.contesto[nome];
      p.contesto[nome] = function () {
        date.push({ nome, secondi: (p.f.DateFinta.now() - p.partenza) / 1000, max: p.contesto._ORARI_MAX_SECONDI });
        return vera.apply(this, arguments);
      };
    }
    const e = esegui(p, 'COLLAUDO');
    return { p, e, date, tempo: Number((/Tempo: (\d+\.\d) s in tutto/.exec(e.riepilogo) || [])[1]) };
  };
  // la prova della prova: senza il limite ORARI_5_cambioOrario va avanti, e il collaudo supera i 330 secondi
  const senzaLimite = collaudo.replace(/_ORARI_MAX_SECONDI = Math\.max\(5, [^;]*;/, '');
  const s = lento(senzaLimite);
  verifica('(la prova della prova: un collaudo senza il limite, con Google lento, finisce dopo 330 secondi: ' + s.tempo + ' s)',
    senzaLimite !== collaudo && s.tempo > 330);
  const { p, e, date, tempo } = lento(collaudo);
  const troppo = date.filter(x => x.max > 260 || x.max < 5 || x.secondi + x.max > 300 + 1);
  verifica('a ogni funzione del calendario il collaudo lascia al massimo il tempo che resta fino a 300 secondi (' +
    date.map(x => x.secondi.toFixed(0) + ' s: ' + x.max).join(', ') + ')', date.length >= 4 && !troppo.length &&
    date.some(x => x.max < 260), troppo.map(x => x.nome + ' a ' + x.secondi + ' s con ' + x.max).join('\n'));
  verifica('ORARI_5_cambioOrario si ferma da solo a meta\' (e si riprogramma), e il collaudo non lo riprende: il tempo e\' ' +
    'quasi finito', /ORARI_5_cambioOrario si e' fermato a meta' \(Tempo massimo raggiunto[^\n]*\), e il tempo e' quasi finito/
      .test(e.testo), e.testo.split('\n').filter(r => /a meta'/.test(r)).join('\n'));
  verifica('finisce, pulizia compresa (anche la ripresa di ORARI_5_cambioOrario), prima dei 360 secondi (' + tempo + ' s), e ' +
    'dice di eseguire le parti a parte', tempo > 300 && tempo < 330 && contiene(e.no, 'tempo: sono passati') &&
    /Da fare, per il tempo: esegui /.test(e.riepilogo), e.riepilogo);
  puliti(p, e, 'Google lento');
}

intestazione('UNA PARTE CHE NON CI STA NEL TEMPO');
{
  const p = progetto();
  // la parte 1 prende 130 secondi: la 2 (fino a 90) ci sta, la 3 (fino a 150) no
  const vero = p.contesto.ORARI_6_coloraLezioni;
  p.contesto.ORARI_6_coloraLezioni = function () {
    const r = vero.apply(this, arguments);
    p.f.avanti(130 * 1000);
    return r;
  };
  const e = esegui(p, 'COLLAUDO');
  verifica('fa le parti 1 e 2, non comincia la 3 e lo dice, senza NO',
    e.no.length === 0 && e.testo.indexOf('PARTE 2 (COLLAUDO_2)') >= 0 && e.testo.indexOf('PARTE 3 (COLLAUDO_3)') < 0 &&
    e.testo.indexOf('== PARTE 3: non la comincio. Sono gia\' passati 130 secondi, questa parte ne puo\' prendere 150') >= 0,
    e.no.join('\n'));
  verifica('il riepilogo dice che i controlli fatti sono OK e di eseguire COLLAUDO_3',
    e.riepilogo.indexOf('I controlli fatti sono tutti OK.') >= 0 && e.riepilogo.indexOf('Tutti i controlli sono OK.') < 0 &&
    e.riepilogo.indexOf('Da fare, per il tempo: esegui COLLAUDO_3 e copia anche il suo registro.') >= 0 &&
    /Parti fatte: 1 in 130\.\d s, 2 in \d+\.\d s\./.test(e.riepilogo), e.riepilogo);
  verifica('e alla fine controlla anche il calendario della parte 3, che non c\'era',
    contiene(e.ok, 'il calendario di prova "Collaudo Campanella colloqui" non c\'e\' piu\' (non c\'era)'));
  puliti(p, e, 'parte che non ci sta');
}

intestazione('NON COMINCIA IN UN PROGETTO CHE NON E\' DI PROVA');
{
  const p = progetto({ prima: 'var CONFIG = { prefissoEtichette: "Scuola" };' });
  const e = esegui(p, 'COLLAUDO');
  verifica('dice NO: sembra il progetto vero, e non tocca niente',
    e.no.length === 1 && contiene(e.no, 'non comincio: in questo progetto c\'e\' anche DatiOrari.gs o lo script della Posta') &&
    p.f.calendari.length === 0 && p.f.proprieta.size === 0, e.no.join('\n'));
  const q = progetto({ prima: 'var ORARI = { docenti: [] };' });
  const f = esegui(q, 'COLLAUDO_1');
  verifica('anche con DatiOrari.gs', contiene(f.no, 'non comincio: in questo progetto c\'e\' anche DatiOrari.gs') &&
    q.f.calendari.length === 0, f.no.join('\n'));
  const r = progetto();
  r.f.proprieta.set('CAMPANELLA_ORARI_CALENDARIO_PROGRESSO', '{"funzione":"ORARI_7_colloqui"}');
  r.f.trigger.push({ fn: 'ORARI_7_colloqui', ms: 60000 });
  const g = esegui(r, 'COLLAUDO_3');
  verifica('e con un lavoro degli orari a meta\' che non e\' di un collaudo: lo lascia, con la sua ripresa',
    contiene(g.no, 'non comincio: in questo progetto c\'e\' un lavoro degli orari a meta\'') &&
    r.f.proprieta.has('CAMPANELLA_ORARI_CALENDARIO_PROGRESSO') && r.f.trigger.length === 1 && r.f.calendari.length === 0,
    g.no.join('\n'));
  const s = progetto();
  s.contesto.Session.getScriptTimeZone = () => 'Europe/London';
  const h = esegui(s, 'COLLAUDO_2');
  verifica('e con un altro fuso orario: dice dove cambiarlo', contiene(h.no, 'non comincio: il fuso orario di questo progetto e\' ' +
    'Europe/London, non Europe/Rome') && s.f.calendari.length === 0, h.no.join('\n'));
  const u = progetto({ codice: calendario.replace('function ORARI_7_colloqui(', 'function ORARI_7_vecchia(') });
  const k = esegui(u, 'COLLAUDO');
  verifica('e con un Calendario.gs senza ORARI_7_colloqui (di prima della 1.6.0): dice di incollare quello nuovo',
    contiene(k.no, 'non comincio: in questo progetto non c\'e\' Calendario.gs (o Orari.gs) della 1.6.0 o dopo') &&
    u.f.calendari.length === 0, k.no.join('\n'));
}

intestazione('UN CALENDARIO CON LO STESSO NOME, CHE NON E\' DI UN COLLAUDO');
{
  const p = progetto();
  p.f.CalendarApp.createCalendar('Collaudo Campanella colloqui', { timeZone: 'Europe/Rome' });
  const e = esegui(p, 'COLLAUDO');
  verifica('non comincia, e lo lascia', contiene(e.no, 'non comincio: c\'e\' gia\' un calendario tuo chiamato "Collaudo ' +
    'Campanella colloqui"') && p.f.calendari.length === 1, e.no.join('\n'));
  // Google non bada alle maiuscole: uno con le maiuscole diverse non e' del collaudo, e resta
  const q = progetto();
  q.f.CalendarApp.createCalendar('collaudo campanella', { timeZone: 'Europe/Rome' });
  const f = esegui(q, 'COLLAUDO_1');
  verifica('uno con le maiuscole diverse ("collaudo campanella") non lo ferma, e alla fine resta',
    f.no.length === 0 && f.ok.length === controlliParte[1] && q.f.calendari.length === 1 &&
    q.f.calendari[0].nome === 'collaudo campanella', f.no.join('\n'));
}

intestazione('I RESTI DI UN COLLAUDO INTERROTTO');
{
  const p = progetto();
  // Google l'ha fermato a meta' dei colloqui: i calendari, il lavoro a meta', la sua ripresa, il segno
  p.f.CalendarApp.createCalendar('Collaudo Campanella', { timeZone: 'Europe/Rome' });
  p.f.CalendarApp.createCalendar('Collaudo Campanella vecchio');
  p.f.CalendarApp.createCalendar('Collaudo Campanella colloqui', { timeZone: 'Europe/Rome' });
  p.f.proprieta.set('CAMPANELLA_COLLAUDO_CALENDARIO', JSON.stringify({ nomi: ['Collaudo Campanella', 'Collaudo Campanella vecchio',
                                                                              'Collaudo Campanella colloqui'] }));
  p.f.proprieta.set('CAMPANELLA_ORARI_CALENDARIO_PROGRESSO', '{"funzione":"ORARI_7_colloqui"}');
  p.f.trigger.push({ fn: 'ORARI_7_colloqui', ms: 60000 });
  const e = esegui(p, 'COLLAUDO_1');
  verifica('li toglie prima di cominciare, e lo dice', e.testo.indexOf('Un collaudo di prima non aveva finito di pulire: ho ' +
    'tolto i lavori degli orari a meta\', le loro riprese e i suoi calendari ("Collaudo Campanella", "Collaudo Campanella ' +
    'vecchio", "Collaudo Campanella colloqui")') >= 0, e.testo.split('\n').slice(0, 6).join('\n'));
  verifica('poi il collaudo e\' tutto OK', e.no.length === 0 && e.ok.length === controlliParte[1], e.no.join('\n'));
  puliti(p, e, 'resti');
}

intestazione('RISULTATO');
if (fallimenti === 0) {
  console.log('  Tutte le prove superate.');
} else {
  console.log('  PROVE FALLITE: ' + fallimenti);
  process.exitCode = 1;
}
