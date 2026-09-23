/**
 * Prova dei gemelli: Moduli.gs e Pannello.gs, e i nomi che li tengono insieme
 *
 *   node test/prova_gemelli.js
 *
 * Lo script dentro il modulo (Moduli.gs) e il foglio di controllo (Pannello.gs)
 * hanno molte funzioni uguali a meno del prefisso (_modulo... e _pan...). Una
 * correzione portata in un gemello solo lascia il difetto nell'altro script,
 * che intanto e' gia' incollato nei moduli dei docenti. Qui:
 *
 *   1. le funzioni gemelle devono essere identiche, a meno del prefisso, dei
 *      commenti e degli spazi. Una coppia nuova con lo stesso nome deve finire
 *      o fra le gemelle o fra quelle diverse apposta, con il perche';
 *   2. le regole che le coppie diverse devono condividere si provano girando
 *      il codice: il giorno di chiusura (29/02 compreso) e l'anno scolastico;
 *   3. ogni funzione interna chiamata o nominata esiste;
 *   4. i nomi che il menu, i trigger e Campanella (src/Moduli.cs) citano come
 *      testo esistono davvero negli script.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const radice = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(radice, f), 'utf8').replace(/\r\n/g, '\n');
const MODULI = leggi('src/risorse/Moduli.gs');
const PANNELLO = leggi('src/risorse/Pannello.gs');
const GENERATORE = leggi('src/Moduli.cs');

// Identiche a meno del prefisso. Il nome e' quello senza prefisso ne' "_" finale.
const GEMELLE = [
  'Fuso', 'Oggi', 'Anno', 'Nome', 'Due', 'TogliTrigger', 'Riprogramma', 'TogliScattato',
  'Destinazione', 'Riprova', 'Apribile', 'GiaCollegatoUnaVolta', 'AnnoDellaData', 'Leggibile',
  'RisposteAlSicuro', 'TempiNelFoglio', 'Figli', 'FoglioPerNome', 'Metti', 'NelCestino'
];

// Stesso nome, ma diverse apposta: un modulo solo contro una riga per modulo.
const DIVERSE = {
  UnoAllaVolta: 'il foglio di controllo trasforma anche gli errori in un messaggio',
  Esegui: 'un modulo solo contro tutte le righe della scheda',
  RisposteVecchie: 'i messaggi: nel foglio vanno nella riga (stessa regola: RisposteAlSicuro)',
  Riapri: 'i messaggi e l\'opzione riapri del modulo (stessa regola: pronti, "da prima")',
  Annulla: 'un modulo solo contro tutte le righe',
  PermessiCompleti: 'solo la forma del codice',
  GiornoChiusura: 'il modulo legge MODULO.chiusura, il foglio la cella: la regola si prova girando',
  Memoria: 'la memoria del foglio ha una chiave per modulo e i fogli divisi per anno',
  SoloAnno: 'le chiavi: "anno" nel modulo, "modulo|anno" nel foglio',
  Ricorda: 'il foglio divide i fogli per anno (tetto di 9 KB per proprieta\')',
  Cartella: 'il percorso del foglio: in MODULO per il modulo, nella riga per il foglio'
};

// ---------------------------------------------------------------------------
//  LEGGERE IL CODICE: stringhe, commenti ed espressioni regolari a parte
// ---------------------------------------------------------------------------
/**
 * Il codice in pezzi: { tipo: 'codice' | 'stringa' | 'commento' | 'regex', testo }.
 * Basta per questi due file; non e' un parser JavaScript completo.
 */
function pezzi(t) {
  const fuori = [];
  let i = 0, codice = '';
  const chiudi = () => { if (codice) { fuori.push({ tipo: 'codice', testo: codice }); codice = ''; } };
  const ultimoSignificativo = () => {
    for (let k = codice.length - 1; k >= 0; k--) if (!/\s/.test(codice[k])) return codice[k];
    for (let k = fuori.length - 1; k >= 0; k--) {
      if (fuori[k].tipo === 'commento') continue;
      if (fuori[k].tipo !== 'codice') return 'x';
      const s = fuori[k].testo.replace(/\s+$/, '');
      if (s) return s[s.length - 1];
    }
    return '';
  };
  while (i < t.length) {
    const c = t[i], d = t[i + 1];
    if (c === '/' && d === '/') {
      chiudi(); const f = t.indexOf('\n', i); const fine = f < 0 ? t.length : f;
      fuori.push({ tipo: 'commento', testo: t.slice(i, fine) }); i = fine; continue;
    }
    if (c === '/' && d === '*') {
      chiudi(); const fine = t.indexOf('*/', i + 2) + 2;
      fuori.push({ tipo: 'commento', testo: t.slice(i, fine) }); i = fine; continue;
    }
    if (c === '\'' || c === '"') {
      chiudi(); let k = i + 1;
      while (k < t.length && t[k] !== c) { if (t[k] === '\\') k++; k++; }
      fuori.push({ tipo: 'stringa', testo: t.slice(i, k + 1) }); i = k + 1; continue;
    }
    if (c === '/' && '(,=:[!&|?{};+'.indexOf(ultimoSignificativo()) >= 0) {
      chiudi(); let k = i + 1, classe = false;
      while (k < t.length && (t[k] !== '/' || classe)) {
        if (t[k] === '\\') k++; else if (t[k] === '[') classe = true; else if (t[k] === ']') classe = false;
        k++;
      }
      k++; while (/[a-z]/.test(t[k] || '')) k++;
      fuori.push({ tipo: 'regex', testo: t.slice(i, k) }); i = k; continue;
    }
    codice += c; i++;
  }
  chiudi();
  return fuori;
}

/** Il solo codice, con stringhe e regex svuotate: per cercare i nomi. */
function soloCodice(t) {
  return pezzi(t).map(p => (p.tipo === 'codice' ? p.testo : p.tipo === 'commento' ? ' ' : ' "" ')).join('');
}

/** Le funzioni dichiarate in cima al file: nome -> testo, dalla parola function alla graffa che chiude. */
function funzioni(t) {
  const fuori = {};
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(t))) {
    const inizio = m.index;
    let prof = 0, fine = -1, pos = 0;
    for (const p of pezzi(t.slice(inizio))) {
      if (p.tipo === 'codice') {
        for (let k = 0; k < p.testo.length; k++) {
          if (p.testo[k] === '{') prof++;
          else if (p.testo[k] === '}') { prof--; if (prof === 0) { fine = pos + k + 1; break; } }
        }
      }
      if (fine >= 0) break;
      pos += p.testo.length;
    }
    fuori[m[1]] = t.slice(inizio, inizio + fine);
  }
  return fuori;
}

/** Il testo di una funzione senza commenti e spazi, con i prefissi dei due script resi uguali. */
function normale(testo) {
  return pezzi(testo).map(p => {
    if (p.tipo === 'commento') return '';
    // nei messaggi la configurazione si chiama per nome: "Correggi MODULO.anno" / "PANNELLO.anno"
    if (p.tipo === 'stringa') return p.testo.replace(/\b(?:MODULO|PANNELLO)\./g, 'CFG.');
    if (p.tipo !== 'codice') return p.testo;
    return p.testo
      .replace(/(?<![\w$])_(?:modulo|pan)([A-Z][A-Za-z0-9]*)_?(?![\w$])/g, '_X$1')
      .replace(/(?<![\w$])_(?:MODULO|PAN)_/g, '_K_')
      .replace(/(?<![\w$])(?:MODULO|PANNELLO)\./g, 'CFG.')
      .replace(/\s+/g, '');
  }).join('');
}

/** "_moduloFuso_" e "_panFuso" diventano "Fuso"; null se non e' una funzione interna di questi script. */
function radiceDelNome(nome) {
  const m = /^_(?:modulo|pan)([A-Z][A-Za-z0-9]*)_?$/.exec(nome);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
let fallite = 0, fatte = 0;
function titolo(t) { console.log('\n' + '='.repeat(72) + '\n  ' + t + '\n' + '='.repeat(72)); }
function verifica(testo, ok) {
  fatte++;
  if (ok) console.log('  OK   ' + testo);
  else { console.log('  FALLITO   ' + testo); fallite++; }
}

const FM = funzioni(MODULI), FP = funzioni(PANNELLO);
const perRadice = f => {
  const fuori = {};
  for (const n of Object.keys(f)) { const r = radiceDelNome(n); if (r) fuori[r] = n; }
  return fuori;
};
const RM = perRadice(FM), RP = perRadice(FP);

// ---- 1. le gemelle ------------------------------------------------------------
titolo('LE FUNZIONI GEMELLE SONO IDENTICHE, A MENO DEL PREFISSO');
for (const r of GEMELLE) {
  const a = RM[r], b = RP[r];
  if (!a || !b) { verifica(r + ': c\'e\' in tutti e due gli script', false); continue; }
  verifica(r + ' (' + a + ' / ' + b + ')', normale(FM[a]) === normale(FP[b]));
}
{
  const comuni = Object.keys(RM).filter(r => RP[r]);
  const senzaDecisione = comuni.filter(r => GEMELLE.indexOf(r) < 0 && !DIVERSE.hasOwnProperty(r));
  verifica('ogni coppia con lo stesso nome e\' gemella o diversa apposta' +
    (senzaDecisione.length ? ' (da decidere: ' + senzaDecisione.join(', ') + ')' : ''), senzaDecisione.length === 0);
  const sparite = Object.keys(DIVERSE).filter(r => !(RM[r] && RP[r]));
  verifica('l\'elenco delle diverse non nomina coppie che non ci sono piu\'' +
    (sparite.length ? ' (' + sparite.join(', ') + ')' : ''), sparite.length === 0);
  const davveroDiverse = Object.keys(DIVERSE).filter(r => RM[r] && RP[r] && normale(FM[RM[r]]) === normale(FP[RP[r]]));
  verifica('le "diverse" lo sono davvero (altrimenti vanno fra le gemelle)' +
    (davveroDiverse.length ? ' (' + davveroDiverse.join(', ') + ')' : ''), davveroDiverse.length === 0);
}

// ---- 2. le regole condivise, girando il codice -----------------------------------
titolo('LE REGOLE CONDIVISE: GIORNO DI CHIUSURA E ANNO SCOLASTICO');
{
  const sandbox = () => ({
    JSON, Math, Object, String, Array, RegExp, Error, parseInt, isNaN, Date,
    Utilities: { formatDate: () => '2026-09-19' }, Logger: { log() {} }
  });
  const cm = vm.createContext(sandbox()); vm.runInContext(MODULI, cm);
  const cp = vm.createContext(sandbox()); vm.runInContext(PANNELLO, cp);
  const chiusuraM = RM.GiornoChiusura, chiusuraP = RP.GiornoChiusura;
  const esito = f => { try { return JSON.stringify(f()); } catch (e) { return 'ERRORE'; } };
  let uguali = 0, diversi = [];
  for (const anno of ['2026-27', '2027-28', '2099-00']) {
    for (let mese = 0; mese <= 13; mese++) {
      for (let giorno = 0; giorno <= 32; giorno++) {
        const c = giorno + '/' + ('0' + mese).slice(-2);
        cm.MODULO.chiusura = c;
        const a = esito(() => cm[chiusuraM](anno));
        const b = esito(() => cp[chiusuraP](c, anno));
        if (a === b) uguali++; else diversi.push(c + ' ' + anno);
      }
    }
  }
  verifica('il giorno di chiusura: stesso risultato per ' + uguali + ' casi' +
    (diversi.length ? ' (diversi: ' + diversi.slice(0, 5).join(', ') + ')' : ''), diversi.length === 0);
  cm.MODULO.chiusura = '29/02';
  verifica('29/02 rifiutato da tutti e due anche in un anno bisestile (2027-28)',
    esito(() => cm[chiusuraM]('2027-28')) === 'ERRORE' && esito(() => cp[chiusuraP]('29/02', '2027-28')) === 'ERRORE');
  let anniUguali = true;
  for (const oggi of ['2026-08-31', '2026-09-01', '2027-01-10', '2099-10-01', '2100-03-01']) {
    if (cm[RM.Anno](oggi) !== cp[RP.Anno](oggi)) anniUguali = false;
  }
  verifica('l\'anno scolastico: stesso risultato', anniUguali);
}

// ---- 3. i nomi interni ------------------------------------------------------------------
titolo('LE FUNZIONI INTERNE ESISTONO');
for (const [nome, testo, definite] of [['Moduli.gs', MODULI, FM], ['Pannello.gs', PANNELLO, FP]]) {
  const codice = soloCodice(testo);
  const nominate = new Set();
  const re = /(^|[^\w$.])(_[A-Za-z][\w$]*)/g;
  let m;
  while ((m = re.exec(codice))) nominate.add(m[2]);
  const variabili = new Set();
  const rv = /\bvar\s+(_[A-Za-z][\w$]*)/g;
  while ((m = rv.exec(codice))) variabili.add(m[1]);
  const mancano = [...nominate].filter(n => !definite[n] && !variabili.has(n));
  verifica(nome + ': ogni funzione interna nominata esiste' + (mancano.length ? ' (mancano: ' + mancano.join(', ') + ')' : ''),
    mancano.length === 0);
}

// ---- 4. i nomi citati come testo -------------------------------------------------------
titolo('I NOMI CITATI COME TESTO ESISTONO');
for (const [nome, testo, definite] of [['Moduli.gs', MODULI, FM], ['Pannello.gs', PANNELLO, FP]]) {
  const voci = [];
  const re = /\.addItem\(\s*'(?:[^'\\]|\\.)*'\s*,\s*'([^']+)'\s*\)/g;
  let m;
  while ((m = re.exec(testo))) voci.push(m[1]);
  verifica(nome + ': le voci del menu chiamano funzioni che esistono e non sono private (' + voci.length + ')',
    voci.length > 0 && voci.every(v => definite[v] && !/_$/.test(v)));
  const trigger = /var\s+_(?:MODULO|PAN)_TRIGGER\s*=\s*'([^']+)'/.exec(testo);
  verifica(nome + ': la funzione della chiusura programmata esiste (' + (trigger ? trigger[1] : '?') + ')',
    !!trigger && !!definite[trigger[1]] && testo.indexOf('newTrigger(' + trigger[0].split(/\s+/)[1] + ')') > 0);
  verifica(nome + ': onOpen c\'e\', per il menu', !!definite.onOpen);
}
{
  const citati = new Set();
  const re = /\b((?:MODULO|PANNELLO)_[A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(GENERATORE))) citati.add(m[1]);
  const mancano = [...citati].filter(n => !(n.indexOf('MODULO_') === 0 ? FM[n] : FP[n]));
  verifica('i nomi che src/Moduli.cs cita nelle istruzioni esistono negli script (' + citati.size + ')' +
    (mancano.length ? ' (mancano: ' + mancano.join(', ') + ')' : ''), citati.size > 0 && mancano.length === 0);
}

titolo('RISULTATO');
console.log(fallite === 0 ? '  Tutte le prove superate.  (' + fatte + ')' : '  PROVE FALLITE: ' + fallite + ' su ' + fatte);
process.exit(fallite === 0 ? 0 : 1);
