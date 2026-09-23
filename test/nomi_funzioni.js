/**
 * I nomi delle funzioni degli script, citati da app e documenti
 *
 *   node test/nomi_funzioni.js
 *
 * L'app e i documenti dicono al docente quale funzione eseguire nell'editor
 * di Apps Script (PASSO_3_riordinaPostaEsistente, ORARI_4_calendario,
 * MODULO_ANNULLA...). Sono testo: se una funzione cambia nome in un .gs, le
 * istruzioni restano sbagliate senza che nessuno se ne accorga. Qui:
 *
 *   1. ogni nome citato in src/*.cs, docs/*.md, README*.md, PRIVACY.md e
 *      "ISTRUZIONI - Campanella.txt" deve esistere come funzione in
 *      src/risorse/*.gs. Valgono anche le forme brevi che i testi usano:
 *      "PASSO_3" (inizio di un nome, fino a un "_"), "ANNULLA_..." e
 *      "PASSO_3_riordinaPosta..." (con i puntini);
 *   2. ogni trigger e ogni voce di menu degli script deve chiamare una
 *      funzione che esiste nel suo progetto (Posta e Orari stanno insieme).
 */

'use strict';
const fs = require('fs');
const path = require('path');

const radice = path.join(__dirname, '..');
const risorse = path.join(radice, 'src', 'risorse');

let fallimenti = 0;
function verifica(descrizione, condizione) {
  console.log((condizione ? '  OK   ' : '  FALLITO  ') + descrizione);
  if (!condizione) fallimenti++;
}
function intestazione(t) { console.log('\n' + '='.repeat(72) + '\n  ' + t + '\n' + '='.repeat(72)); }

// ---------------------------------------------------------------------------
//  LE FUNZIONI CHE ESISTONO, SCRIPT PER SCRIPT
// ---------------------------------------------------------------------------
const script = fs.readdirSync(risorse).filter(f => /\.gs$/.test(f)).sort();
const funzioniDi = {};
const tutte = new Set();
for (const f of script) {
  const testo = fs.readFileSync(path.join(risorse, f), 'utf8');
  funzioniDi[f] = new Set([...testo.matchAll(/^[ \t]*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]));
  funzioniDi[f].forEach(n => tutte.add(n));
}
// i file incollati nello stesso progetto Apps Script vedono le funzioni l'uno dell'altro
const PROGETTI = [['Organizzazione_Gmail.gs', 'Orari.gs']];
function progettoDi(f) {
  const insieme = new Set(funzioniDi[f]);
  for (const p of PROGETTI) {
    if (p.indexOf(f) >= 0) p.forEach(g => (funzioniDi[g] || new Set()).forEach(n => insieme.add(n)));
  }
  return insieme;
}

// ---------------------------------------------------------------------------
//  1. I NOMI CITATI DA APP E DOCUMENTI
// ---------------------------------------------------------------------------
const CITATI = /\b(?:PASSO|EXTRA|ANNULLA|ORARI|MODULO|PANNELLO)_[A-Za-z0-9_]*|\bsmistaNuoviMessaggi\b/g;

function fileDaControllare() {
  const fuori = [];
  const aggiungi = (cartella, filtro) => {
    const dove = path.join(radice, cartella);
    if (!fs.existsSync(dove)) return;
    fs.readdirSync(dove).filter(filtro).sort().forEach(f => fuori.push(path.join(cartella, f)));
  };
  aggiungi('src', f => /\.cs$/.test(f));
  aggiungi('docs', f => /\.md$/.test(f));
  aggiungi('.', f => /^README.*\.md$/.test(f) || f === 'PRIVACY.md' || f === 'ISTRUZIONI - Campanella.txt');
  return fuori;
}

/** Il nome citato esiste? Anche nelle forme brevi. */
function esiste(nome, dopo) {
  if (tutte.has(nome)) return true;
  const inizio = [...tutte].filter(n => n.indexOf(nome) === 0);
  if (nome.charAt(nome.length - 1) === '_') return inizio.length > 0;       // "ANNULLA_..."
  if (/^\.\.\.|^…/.test(dopo)) return inizio.length > 0;               // "PASSO_3_riordinaPosta..."
  return inizio.some(n => n.charAt(nome.length) === '_');                   // "PASSO_3"
}

intestazione('I NOMI CITATI DA APP E DOCUMENTI ESISTONO NEGLI SCRIPT');
verifica('trovate le funzioni degli script (' + tutte.size + ' in ' + script.join(', ') + ')', tutte.size > 20);
let citazioni = 0;
for (const file of fileDaControllare()) {
  const testo = fs.readFileSync(path.join(radice, file), 'utf8');
  const mancanti = new Set();
  let quanti = 0;
  for (const m of testo.matchAll(CITATI)) {
    quanti++;
    if (!esiste(m[0], testo.slice(m.index + m[0].length, m.index + m[0].length + 3))) {
      const riga = testo.slice(0, m.index).split('\n').length;
      mancanti.add(m[0] + ' (riga ' + riga + ')');
    }
  }
  citazioni += quanti;
  if (quanti === 0 && !mancanti.size) continue;
  verifica(file + ': ' + quanti + ' citazioni, tutte di funzioni che esistono', mancanti.size === 0);
  mancanti.forEach(x => console.log('        non esiste: ' + x));
}
verifica('le citazioni ci sono davvero (' + citazioni + '), quindi il controllo vale', citazioni > 50);

// ---------------------------------------------------------------------------
//  2. TRIGGER E MENU DEGLI SCRIPT
// ---------------------------------------------------------------------------
intestazione('TRIGGER E VOCI DI MENU CHIAMANO FUNZIONI CHE ESISTONO');
for (const f of script) {
  const testo = fs.readFileSync(path.join(risorse, f), 'utf8');
  const nomi = [];
  // var _QUALCOSA_TRIGGER = 'funzione'  (e _TRIGGER_QUALCOSA)
  for (const m of testo.matchAll(/var\s+(\w*TRIGGER\w*)\s*=\s*(['"])([^'"]+)\2/g)) nomi.push(m[3]);
  // newTrigger('funzione')
  for (const m of testo.matchAll(/newTrigger\(\s*(['"])([^'"]+)\1/g)) nomi.push(m[2]);
  // .addItem('voce', 'funzione')
  for (const m of testo.matchAll(/\.addItem\(\s*(['"])(?:\\.|(?!\1).)*\1\s*,\s*(['"])([^'"]+)\2/g)) nomi.push(m[3]);
  if (!nomi.length) continue;
  const progetto = progettoDi(f);
  const mancanti = nomi.filter(n => !progetto.has(n));
  verifica(f + ': ' + nomi.length + ' trigger e voci di menu, tutti verso funzioni del progetto', mancanti.length === 0);
  mancanti.forEach(n => console.log('        non esiste: ' + n));
}

// ---------------------------------------------------------------------------
//  LA PROVA DELLA PROVA: un nome sbagliato deve essere trovato
// ---------------------------------------------------------------------------
intestazione('LA PROVA DELLA PROVA');
verifica('un nome inventato non passa', !esiste('PASSO_3_riordinaTutto', ''));
verifica('un nome vecchio (ORARI_3_abbinaIndirizzi) non passa', !esiste('ORARI_3_abbinaIndirizzi', ''));
verifica('la forma breve "PASSO_3" passa', esiste('PASSO_3', ' '));
verifica('ma "PASSO_9" no', !esiste('PASSO_9', ' '));
verifica('"ANNULLA_" passa', esiste('ANNULLA_', '...'));
verifica('un nome troncato senza puntini no', !esiste('PASSO_3_riordinaPosta', ' '));

intestazione('RISULTATO');
if (fallimenti === 0) {
  console.log('  Tutte le prove superate.');
} else {
  console.log('  PROVE FALLITE: ' + fallimenti);
  process.exitCode = 1;
}
