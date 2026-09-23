/**
 * Mutazioni del motore del foglio di controllo: il banco se ne accorge?
 *
 *   node test/mutazioni_pannello.js
 *
 * Ogni mutazione toglie o storce una protezione di Pannello.gs, su una copia
 * in una cartella temporanea, e fa girare test/mock_pannello.js su quella
 * copia (variabile PANNELLO_MOTORE). Il banco deve fallire: una mutazione che
 * passa vuol dire una protezione che nessuna prova guarda. Il file vero non
 * viene mai toccato.
 *
 * Ogni mutazione cerca un pezzo di codice che deve esserci una volta sola: se
 * il motore cambia e il pezzo non c'e' piu', la mutazione va aggiornata, e lo
 * strumento lo dice invece di contarla come presa.
 */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const radice = path.join(__dirname, '..');
const banco = path.join(__dirname, 'mock_pannello.js');
const originale = fs.readFileSync(path.join(radice, 'src', 'risorse', 'Pannello.gs'), 'utf8').replace(/\r\n/g, '\n');

// { nome: la protezione tolta, da: il codice com'e', a: com'e' dopo la mutazione }
const MUTAZIONI = [
  { nome: 'svuota anche se qualche risposta non sta in nessun foglio',
    da: "  if (alSicuro.mancano > 0) {\n    righe.push('  risposte gia\\' nel modulo: '",
    a: "  if (alSicuro.mancano > 999999) {\n    righe.push('  risposte gia\\' nel modulo: '" },
  { nome: 'non guarda il secondo arrotondato per eccesso',
    da: '    else if (righe.hasOwnProperty(String(t + 1)) && righe[String(t + 1)].length > 0) chiave = String(t + 1);',
    a: '    else if (false) chiave = String(t + 1);' },
  { nome: 'una riga del foglio vale per piu\' risposte',
    da: '    var id = righe[chiave].pop();',
    a: '    var id = righe[chiave][0];' },
  { nome: 'la conferma dice "Non cancello niente" anche con Svuota',
    da: '                    (_panQualcunaDaSvuotare()',
    a: '                    (false' },
  { nome: 'la chiusura non controlla che il modulo sia chiuso davvero',
    da: "        if (pubblicato) throw new Error('il modulo accetta ancora risposte');",
    a: '' },
  { nome: 'la chiusura scattata non lascia il segno',
    da: "    memoria.chiusi[r.id + '|' + _panAnnoDellaData(scadenza)] = scadenza;",
    a: '' },
  { nome: 'il segno della chiusura va all\'anno dello script, non a quello della data',
    da: "    memoria.chiusi[r.id + '|' + _panAnnoDellaData(scadenza)] = scadenza;",
    a: "    memoria.chiusi[r.id + '|' + _panAnno()] = scadenza;" },
  { nome: 'un modulo cancellato lascia la sua scadenza in sospeso',
    da: "      _panScriviStato(foglio, r, 'non si apre piu\\' (cancellato?): chiusura saltata', null);\n      delete memoria.scadenze[r.id];",
    a: "      _panScriviStato(foglio, r, 'non si apre piu\\' (cancellato?): chiusura saltata', null);" },
  { nome: 'una chiusura non riuscita non si riprova',
    da: '  if (riprovare) _panRiprogramma(e);',
    a: '  if (false) _panRiprogramma(e);' },
  { nome: 'il trigger scattato resta in elenco',
    da: 'function _panRiprogramma(e) {\n  _panTogliScattato(e);',
    a: 'function _panRiprogramma(e) {' },
  { nome: 'la chiusura non prende il lock',
    da: '  if (!lock.tryLock(10000)) {\n    _panRiprogramma(e);',
    a: '  if (false) {\n    _panRiprogramma(e);' },
  { nome: 'un modulo chiuso a mano a meta\' anno viene riaperto',
    da: '  if (giaPreparata === true) {',
    a: '  if (false) {' },
  { nome: 'un modulo preparato con la versione di prima viene riaperto',
    da: "  if (giaPreparata) {\n    // preparata con una versione di prima",
    a: "  if (false) {\n    // preparata con una versione di prima" },
  { nome: 'una riga finita non viene segnata come pronta',
    da: '      memoria.pronti[chiave] = true;',
    a: '' },
  { nome: 'un modulo scollegato a mano viene ricollegato',
    da: '  } else if (foglioDiQuestAnno && !memoria.annullati[chiave] && _panGiaCollegatoUnaVolta(idFoglio)) {',
    a: '  } else if (false) {' },
  { nome: 'dopo la chiusura gia\' scattata la riga si rifa\'',
    da: '    if (finitoIl) {\n      var ancoraAperto = false;',
    a: '    if (false) {\n      var ancoraAperto = false;' },
  { nome: '"Annulla" non segna la riga da ricollegare',
    da: "    memoria.annullati[r.id + '|' + anno] = true;",
    a: '' },
  { nome: 'le chiusure delle righe non riuscite si perdono',
    da: '    if (s >= oggi) fuori.date[s] = _panScadenza(s);',
    a: '    if (false) fuori.date[s] = _panScadenza(s);' },
  { nome: 'una chiusura scaduta e non riuscita perde il suo tentativo dopo "Prepara"',
    da: '    else fuori.riprova = true;',
    a: '' },
  { nome: 'nessun limite di tempo',
    da: '    if (new Date().getTime() - inizio > _PAN_TEMPO) {',
    a: '    if (false) {' },
  { nome: 'le righe da preparare non passano per prime',
    da: '  return prima.concat(dopo);',
    a: '  return righeScheda;' },
  { nome: 'i fogli di tutti gli anni in una proprieta\' sola',
    da: '  resto.fogli = {};',
    a: '' },
  { nome: 'i fogli degli anni scorsi non vengono riletti',
    da: '          if (diUnAnno.hasOwnProperty(f) && !m.fogli.hasOwnProperty(f)) m.fogli[f] = diUnAnno[f];',
    a: '' },
  { nome: '"pronti" degli anni passati si accumulano',
    da: '      m.pronti = _panSoloAnno(m.pronti, anno);',
    a: '' },
  { nome: 'sotto l\'ultima riga restano le caselle spente',
    da: '    sotto.clearDataValidations();',
    a: '' },
  { nome: 'una riga nuova parte spenta',
    da: "      .setValues([[v[_PAN_C.SVUOTA] === true, v[_PAN_C.ATTIVO] !== false]]);",
    a: "      .setValues([[v[_PAN_C.SVUOTA] === true, v[_PAN_C.ATTIVO] === true]]);" },
  { nome: 'la colonna della chiusura non e\' a testo',
    da: "  foglio.getRange(2, _PAN_C.CHIUSURA + 1, quante - 1, 1).setNumberFormat('@');",
    a: '' },
  { nome: 'la chiusura diventata data si rilegge nel fuso sbagliato',
    da: "    return Utilities.formatDate(valore, _panFuso(), 'dd/MM');",
    a: "    return ('0' + valore.getUTCDate()).slice(-2) + '/' + ('0' + (valore.getUTCMonth() + 1)).slice(-2);" },
  { nome: 'la scheda Istruzioni si accoda invece di riscriversi',
    da: '  var s = _panSchedaIstruzioni(ss);\n  s.clear();',
    a: '  var s = _panSchedaIstruzioni(ss);' },
  { nome: 'si toglie anche una scheda di partenza con dentro qualcosa',
    da: '  if (s.getLastRow() > 0 || s.getLastColumn() > 0) return false;',
    a: '' },
  { nome: 'fra due moduli con lo stesso nome ne sceglie uno a caso',
    da: '    } else if (candidati.length > 1) {',
    a: '    } else if (false) {' },
  { nome: 'il foglio gia\' collegato con lo stesso nome non viene adottato',
    da: '    if (giaCollegato && _panNomeDiUnFile(giaCollegato) === nomeFoglio) {',
    a: '    if (false) {' },
  { nome: 'i permessi a meta\' non fermano niente',
    da: '  if (davvero && !_panPermessiCompleti()) {',
    a: '  if (false) {' },
  { nome: 'il 29/02 passa negli anni bisestili',
    da: "  if (mese === 2 && giorno === 29) throw new Error('il giorno di chiusura",
    a: "  if (false) throw new Error('il giorno di chiusura" },
  { nome: 'l\'anteprima non dice la versione dello script',
    da: "  righe.push('Script: Campanella ' + _PAN_VERSIONE",
    a: "  righe.push('Script: Campanella ' + 'x'" }
];

function conta(testo, pezzo) {
  let n = 0, i = testo.indexOf(pezzo);
  while (i >= 0) { n++; i = testo.indexOf(pezzo, i + 1); }
  return n;
}

function gira(file) {
  const env = Object.assign({}, process.env, { PANNELLO_MOTORE: file });
  return spawnSync(process.execPath, [banco], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).status;
}

const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'campanella-mutazioni-'));
let prese = 0, sopravvissute = [], nonApplicabili = [];
try {
  const copia = path.join(cartella, 'Pannello.gs');
  fs.writeFileSync(copia, originale);
  if (gira(copia) !== 0) {
    console.log('Il banco fallisce gia\' sul motore vero: prima va sistemato quello.');
    process.exitCode = 1;
  } else {
    for (const mu of MUTAZIONI) {
      const volte = conta(originale, mu.da);
      if (volte !== 1) {
        nonApplicabili.push(mu.nome + ' (il pezzo c\'e\' ' + volte + ' volte)');
        console.log('  ???      ' + mu.nome + ': il pezzo di codice c\'e\' ' + volte + ' volte, non una');
        continue;
      }
      fs.writeFileSync(copia, originale.replace(mu.da, mu.a));
      const stato = gira(copia);
      if (stato !== 0) { prese++; console.log('  PRESA    ' + mu.nome); }
      else { sopravvissute.push(mu.nome); console.log('  SFUGGITA ' + mu.nome); }
    }
    console.log('\n  Mutazioni prese: ' + prese + ' su ' + MUTAZIONI.length +
      (sopravvissute.length ? '; sfuggite: ' + sopravvissute.length : '') +
      (nonApplicabili.length ? '; da aggiornare: ' + nonApplicabili.length : ''));
    if (sopravvissute.length || nonApplicabili.length) process.exitCode = 1;
  }
} finally {
  fs.rmSync(cartella, { recursive: true, force: true });
}
