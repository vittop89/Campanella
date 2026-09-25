/**
 * Prova in locale del collaudo del calendario
 *
 *   node test/collaudo/prova_locale.js
 *
 * Fa girare test/collaudo/Collaudo_calendario.gs insieme a
 * src/risorse/Orari.gs, come nel progetto di prova, con le finte API di
 * test/mock_orari.js: la parte "FINTE API" di quel file, presa cosi' com'e'
 * (niente copie a mano; ogni progetto ha la sua, nuova). Controlla che:
 *   - COLLAUDO dica OK a tutti i controlli, con le NOTE sui punti mai
 *     provati dal vivo, e alla fine non resti niente: calendari di prova,
 *     trigger, lavori degli orari a meta';
 *   - COLLAUDO_1 e COLLAUDO_2, uno dopo l'altro, facciano lo stesso;
 *   - il collaudo dica NO quando Google o Orari.gs non fanno quello che
 *     devono (la prova della prova): setTimeZone senza effetto, le serie nel
 *     fuso con cui e' nato il calendario, un Orari.gs che crea il calendario
 *     senza fuso come la 1.5; e pulisca lo stesso;
 *   - finito il tempo si fermi, dica di eseguire le parti a parte, e pulisca;
 *   - non cominci in un progetto che non e' di prova, ne' con un calendario
 *     con lo stesso nome che non e' suo, e tolga i resti di un collaudo
 *     interrotto.
 */

'use strict';
// il fuso degli script della scuola, con l'ora legale (vedi mock_orari.js):
// va fissato prima di qualunque data
process.env.TZ = 'Europe/Rome';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const qui = __dirname;
const radice = path.join(qui, '..', '..');
const percorsoBanco = path.join(radice, 'test', 'mock_orari.js');
const banco = fs.readFileSync(percorsoBanco, 'utf8');
const orari = fs.readFileSync(path.join(radice, 'src', 'risorse', 'Orari.gs'), 'utf8');
const collaudo = fs.readFileSync(path.join(qui, 'Collaudo_calendario.gs'), 'utf8');

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
  '           else throw new Error(\'non so impostare \' + nome);\n' +
  '         },\n' +
  '         avanti(ms) { orologio += ms; } };\n})',
  { filename: percorsoBanco, lineOffset: righePrima - 2 });

/**
 * Un progetto di prova: finte API nuove, Orari.gs (o quello dato) e
 * Collaudo_calendario.gs, piu' il codice dato in "prima" (per esempio la Posta).
 */
function progetto(opzioni) {
  opzioni = opzioni || {};
  const f = fabbrica('io@scuola-esempio.edu.it');
  if (opzioni.fusoDiGoogle) f.imposta('fusoDiGoogle', opzioni.fusoDiGoogle);
  if (opzioni.coloreDiGoogle) f.imposta('coloreDiGoogle', opzioni.coloreDiGoogle);
  const contesto = vm.createContext({
    MailApp: f.MailApp, GmailApp: f.GmailApp, CalendarApp: f.CalendarApp, PropertiesService: f.PropertiesService,
    LockService: f.LockService, ScriptApp: f.ScriptApp, Session: f.Session, Logger: f.Logger, Utilities: f.Utilities,
    Date: f.DateFinta, JSON, Math, String, Number, Object, Array, RegExp, Error, isNaN, console
  });
  if (opzioni.prima) vm.runInContext(opzioni.prima, contesto, { filename: 'altro.gs' });
  vm.runInContext(opzioni.orari || orari, contesto, { filename: 'Orari.gs' });
  vm.runInContext(collaudo, contesto, { filename: 'Collaudo_calendario.gs' });
  return { f, contesto };
}

/** Esegue una funzione del collaudo e divide il registro: righe OK, NO, NOTA, PASSO. */
function esegui(p, funzione) {
  const partenza = p.f.registro.length;
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
  verifica(nome + ': il riepilogo c\'e\', con i conti', /== RIEPILOGO di /.test(esito.riepilogo) &&
    /Controlli: \d+ {3}OK: \d+ {3}NO: \d+/.test(esito.riepilogo), esito.errore ? String(esito.errore.stack) : esito.riepilogo);
}

function contiene(elenco, pezzo) {
  return elenco.some(r => r.indexOf(pezzo) >= 0);
}

// quanti controlli fa COLLAUDO adesso: uno nuovo nel collaudo va contato qui,
// cosi' uno che sparisce (o viene saltato in silenzio) si vede
const CONTROLLI = 47;
let controlliParte1 = 0;

// ---------------------------------------------------------------------------
//  COLLAUDO: tutto OK
// ---------------------------------------------------------------------------
intestazione('COLLAUDO CON IL FINTO CALENDARIO: TUTTO OK');
{
  const p = progetto();
  const e = esegui(p, 'COLLAUDO');
  verifica('COLLAUDO non lancia errori', !e.errore, e.errore && e.errore.stack);
  verifica('nessun controllo NO (' + e.no.length + ')', e.no.length === 0, e.no.join('\n'));
  verifica('tutti i controlli OK: ' + e.ok.length + ' (devono essere ' + CONTROLLI + ')', e.ok.length === CONTROLLI);
  verifica('il riepilogo dice NO: 0 e "Tutti i controlli sono OK"',
    /NO: 0\n/.test(e.riepilogo) && e.riepilogo.indexOf('Tutti i controlli sono OK.') >= 0, e.riepilogo);
  // i controlli che il collaudo deve fare davvero (non saltarli in silenzio)
  [
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
    'il calendario di prova "Collaudo Campanella" non c\'e\' piu\' (cancellato adesso con deleteCalendar)',
    'il calendario di prova "Collaudo Campanella vecchio" non c\'e\' piu\' (cancellato adesso con deleteCalendar)',
    'nessun trigger rimasto nel progetto'
  ].forEach(atteso => verifica('OK: ' + atteso, contiene(e.ok, atteso)));
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
    e.passi.length >= 35 && e.passi.every(r => /: \d+\.\d s \(\d+\.\d s dall'inizio\)/.test(r)) &&
    contiene(e.passi, 'ORARI_5_cambioOrario rieseguito: ') && contiene(e.passi, 'pulizia: '), e.passi.join('\n'));
  verifica('il riepilogo dice il tempo in tutto e i passi piu\' lenti', /Tempo: \d+\.\d s in tutto, \d+ passi/.test(e.riepilogo) &&
    e.riepilogo.indexOf('I piu\' lenti: ') >= 0);
  // le funzioni vere di Orari.gs hanno lavorato davvero (le loro righe nel registro)
  verifica('nel registro ci sono i messaggi veri di Orari.gs (anteprima, cambio, colori, annulla)',
    e.testo.indexOf('ANTEPRIMA - non viene mandato niente.') >= 0 && e.testo.indexOf('Cambio d\'orario dal 2026-11-02') >= 0 &&
    e.testo.indexOf('Colori delle classi nel calendario "Collaudo Campanella"') >= 0 &&
    e.testo.indexOf('eventi messi da Campanella dal calendario "Collaudo Campanella"') >= 0);
  verifica('e il messaggio con cui ORARI_4_calendario si ferma sul calendario della 1.5',
    e.testo.indexOf('il suo messaggio: Il calendario "Collaudo Campanella vecchio" ha il fuso orario UTC, non Europe/Rome') >= 0);
  puliti(p, e, 'COLLAUDO');
}

intestazione('COLLAUDO_1 E COLLAUDO_2, UNO DOPO L\'ALTRO, NELLO STESSO PROGETTO');
{
  const p = progetto();
  const e1 = esegui(p, 'COLLAUDO_1');
  verifica('COLLAUDO_1: nessun NO, e fa solo la parte 1', !e1.errore && e1.no.length === 0 && e1.ok.length > 20 &&
    e1.testo.indexOf('PARTE 2') < 0 && e1.testo.indexOf('Collaudo Campanella vecchio') < 0, e1.no.join('\n'));
  puliti(p, e1, 'COLLAUDO_1');
  const e2 = esegui(p, 'COLLAUDO_2');
  verifica('COLLAUDO_2: nessun NO, e fa solo la parte 2', !e2.errore && e2.no.length === 0 && e2.ok.length > 10 &&
    e2.testo.indexOf('PARTE 1') < 0, e2.no.join('\n'));
  puliti(p, e2, 'COLLAUDO_2');
  // la pulizia di ognuno controlla i trigger: una volta in piu' di COLLAUDO
  verifica('insieme fanno i controlli di COLLAUDO (' + e1.ok.length + ' + ' + e2.ok.length + ' = ' + CONTROLLI + ' + 1)',
    e1.ok.length + e2.ok.length === CONTROLLI + 1);
  controlliParte1 = e1.ok.length;
}

// ---------------------------------------------------------------------------
//  LA PROVA DELLA PROVA: quando Google o Orari.gs sbagliano, il collaudo dice NO
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
  verifica('con il messaggio di Orari.gs (Google dice che ha ancora UTC)',
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
  verifica('con il messaggio della prova del fuso di Orari.gs', e.testo.indexOf('Google non ripete le lezioni del calendario') >= 0);
  puliti(p, e, 'serie nel fuso di nascita');
}

intestazione('LA PROVA DELLA PROVA: UN ORARI.GS CHE CREA IL CALENDARIO SENZA FUSO, COME LA 1.5');
{
  const senzaFuso = orari.replace(/,\s*timeZone: Session\.getScriptTimeZone\(\)/, '');
  verifica('in Orari.gs ho tolto il fuso a createCalendar', senzaFuso !== orari);
  const p = progetto({ orari: senzaFuso });
  const e = esegui(p, 'COLLAUDO_1');
  verifica('COLLAUDO_1 dice NO: il calendario creato non ha il fuso dello script',
    contiene(e.no, 'il calendario creato ha il fuso orario dello script (Europe/Rome)'), e.no.join('\n'));
  verifica('e che ORARI_4_calendario non mette l\'orario (si ferma alla prova del fuso)',
    contiene(e.no, 'ORARI_4_calendario mette l\'orario, in un calendario che crea con il fuso Europe/Rome') &&
    e.testo.indexOf('Mi fermo qui con la parte 1') >= 0, e.no.join('\n'));
  verifica('e le lezioni dal 26/10 un\'ora prima', contiene(e.no, 'dopo ORARI_4_calendario: dal 26/10, finita l\'ora legale'),
    e.no.join('\n'));
  puliti(p, e, 'Orari.gs senza fuso');
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
      '"lettura del calendario (dopo ORARI_5_cambioOrario)"') && e.testo.indexOf('Esegui COLLAUDO_1 e poi COLLAUDO_2') >= 0,
    e.no.join('\n'));
  verifica('la parte 2 non la comincia', contiene(e.no, 'la parte 2 non l\'ho fatta: sono gia\' passati 300 secondi') &&
    e.testo.indexOf('PARTE 2') < 0, e.no.join('\n'));
  verifica('la pulizia la fa lo stesso', contiene(e.ok, 'il calendario di prova "Collaudo Campanella" non c\'e\' piu\''));
  puliti(p, e, 'tempo finito');
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
  r.f.proprieta.set('CAMPANELLA_ORARI_CALENDARIO_PROGRESSO', '{"funzione":"ORARI_4_calendario"}');
  r.f.trigger.push({ fn: 'ORARI_4_calendario', ms: 60000 });
  const g = esegui(r, 'COLLAUDO_1');
  verifica('e con un lavoro degli orari a meta\' che non e\' di un collaudo: lo lascia, con la sua ripresa',
    contiene(g.no, 'non comincio: in questo progetto c\'e\' un lavoro degli orari a meta\'') &&
    r.f.proprieta.has('CAMPANELLA_ORARI_CALENDARIO_PROGRESSO') && r.f.trigger.length === 1 && r.f.calendari.length === 0,
    g.no.join('\n'));
  const s = progetto();
  s.contesto.Session.getScriptTimeZone = () => 'Europe/London';
  const h = esegui(s, 'COLLAUDO_2');
  verifica('e con un altro fuso orario: dice dove cambiarlo', contiene(h.no, 'non comincio: il fuso orario di questo progetto e\' ' +
    'Europe/London, non Europe/Rome') && s.f.calendari.length === 0, h.no.join('\n'));
}

intestazione('UN CALENDARIO CON LO STESSO NOME, CHE NON E\' DI UN COLLAUDO');
{
  const p = progetto();
  p.f.CalendarApp.createCalendar('Collaudo Campanella', { timeZone: 'Europe/Rome' });
  const e = esegui(p, 'COLLAUDO_1');
  verifica('non comincia, e lo lascia', contiene(e.no, 'non comincio: c\'e\' gia\' un calendario tuo chiamato "Collaudo ' +
    'Campanella"') && p.f.calendari.length === 1, e.no.join('\n'));
  // Google non bada alle maiuscole: uno con le maiuscole diverse non e' del collaudo, e resta
  const q = progetto();
  q.f.CalendarApp.createCalendar('collaudo campanella', { timeZone: 'Europe/Rome' });
  const f = esegui(q, 'COLLAUDO_1');
  verifica('uno con le maiuscole diverse ("collaudo campanella") non lo ferma, e alla fine resta',
    f.no.length === 0 && f.ok.length === controlliParte1 && q.f.calendari.length === 1 &&
    q.f.calendari[0].nome === 'collaudo campanella', f.no.join('\n'));
}

intestazione('I RESTI DI UN COLLAUDO INTERROTTO');
{
  const p = progetto();
  // Google l'ha fermato a meta' del cambio d'orario: il calendario, il lavoro a meta', la sua ripresa, il segno
  p.f.CalendarApp.createCalendar('Collaudo Campanella', { timeZone: 'Europe/Rome' });
  p.f.CalendarApp.createCalendar('Collaudo Campanella vecchio');
  p.f.proprieta.set('CAMPANELLA_COLLAUDO_CALENDARIO', JSON.stringify({ nomi: ['Collaudo Campanella', 'Collaudo Campanella vecchio'] }));
  p.f.proprieta.set('CAMPANELLA_ORARI_CALENDARIO_PROGRESSO', '{"funzione":"ORARI_5_cambioOrario"}');
  p.f.trigger.push({ fn: 'ORARI_5_cambioOrario', ms: 60000 });
  const e = esegui(p, 'COLLAUDO_1');
  verifica('li toglie prima di cominciare, e lo dice', e.testo.indexOf('Un collaudo di prima non aveva finito di pulire: ho ' +
    'tolto i lavori degli orari a meta\', le loro riprese e i suoi calendari ("Collaudo Campanella", "Collaudo Campanella ' +
    'vecchio")') >= 0, e.testo.split('\n').slice(0, 6).join('\n'));
  verifica('poi il collaudo e\' tutto OK', e.no.length === 0 && e.ok.length === controlliParte1, e.no.join('\n'));
  puliti(p, e, 'resti');
}

intestazione('RISULTATO');
if (fallimenti === 0) {
  console.log('  Tutte le prove superate.');
} else {
  console.log('  PROVE FALLITE: ' + fallimenti);
  process.exitCode = 1;
}
