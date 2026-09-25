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
 *   1. ogni nome citato in src/*.cs, docs/*.md, README*.md, PRIVACY.md,
 *      "ISTRUZIONI - Campanella.txt" e nell'intestazione di Calendario.gs
 *      (src/risorse/Calendario_intestazione.txt) deve esistere come funzione in
 *      src/risorse/*.gs. Valgono anche le forme brevi che i testi usano:
 *      "PASSO_3" (inizio di un nome, fino a un "_"), "ANNULLA_..." e
 *      "PASSO_3_riordinaPosta..." (con i puntini);
 *   2. ogni trigger e ogni voce di menu degli script deve chiamare una
 *      funzione che esiste nel suo progetto (Posta e Orari stanno insieme);
 *   3. ogni funzione pubblica di Orari.gs (ORARI_...) sta nell'elenco in cima
 *      al file e nelle istruzioni, e ogni sua ripresa la conosce anche la
 *      Posta, perche' ANNULLA_automazione la spenga;
 *   4. Calendario.gs, la versione solo calendario di Orari.gs per un altro
 *      account (test/solo_calendario.js), ha nella sua intestazione ogni sua
 *      funzione pubblica, e ogni sua ripresa chiama una funzione che ha lei:
 *      nel progetto dell'altro account non c'e' altro.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { calendarioDiOggi } = require('./solo_calendario');

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
  // l'intestazione di Calendario.gs: il docente la legge nell'editor
  aggiungi(path.join('src', 'risorse'), f => f === 'Calendario_intestazione.txt');
  return fuori;
}

/** Il nome citato esiste? Anche nelle forme brevi. */
function esiste(nome, dopo) {
  if (tutte.has(nome)) return true;
  const inizio = [...tutte].filter(n => n.indexOf(nome) === 0);
  if (nome.charAt(nome.length - 1) === '_') return inizio.length > 0;       // "ANNULLA_..."
  if (/^\.\.\.|^\u2026/.test(dopo)) return inizio.length > 0;               // "PASSO_3_riordinaPosta..."
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
//  3. LE FUNZIONI DEGLI ORARI: DETTE AL DOCENTE, E SPENTE DALLA POSTA
//  Ogni funzione pubblica di Orari.gs (ORARI_...) sta nell'elenco in cima al
//  file e nelle istruzioni: una funzione nuova, come ORARI_7_colloqui,
//  non resta senza spiegazione. E ogni sua ripresa (var _ORARI_TRIGGER...)
//  la conosce anche la Posta (var _TRIGGER_ORARI...), perche'
//  ANNULLA_automazione, che spegne tutto il progetto, la tolga.
// ---------------------------------------------------------------------------
const ISTRUZIONI = fs.readFileSync(path.join(radice, 'ISTRUZIONI - Campanella.txt'), 'utf8');
/** Le funzioni ORARI_ di un testo di Orari.gs che mancano nella sua intestazione o nelle istruzioni. */
function funzioniOrariNonDette(orari, istruzioni) {
  const fine = orari.indexOf('*/');
  const intestazioneOrari = fine > 0 ? orari.slice(0, fine) : '';
  const fuori = [];
  for (const m of orari.matchAll(/^function\s+(ORARI_[A-Za-z0-9_]*[A-Za-z0-9])\s*\(/gm)) {
    if (intestazioneOrari.indexOf(m[1]) < 0) fuori.push(m[1] + ' (intestazione di Orari.gs)');
    if (istruzioni.indexOf(m[1]) < 0) fuori.push(m[1] + ' (ISTRUZIONI - Campanella.txt)');
  }
  return fuori;
}
/** Le riprese di Orari.gs che la Posta non conosce. */
function ripreseNonSpente(orari, posta) {
  const valori = testo => [...testo.matchAll(/^var\s+(\w+)\s*=\s*(['"])([^'"]+)\2/gm)];
  const dellaPosta = valori(posta).filter(m => /^_TRIGGER_ORARI/.test(m[1])).map(m => m[3]);
  return valori(orari).filter(m => /^_ORARI_TRIGGER/.test(m[1])).map(m => m[3]).filter(n => dellaPosta.indexOf(n) < 0);
}
intestazione('LE FUNZIONI DEGLI ORARI SONO DETTE AL DOCENTE, E LE LORO RIPRESE LE SPEGNE LA POSTA');
const testoOrari = fs.readFileSync(path.join(risorse, 'Orari.gs'), 'utf8');
const testoPosta = fs.readFileSync(path.join(risorse, 'Organizzazione_Gmail.gs'), 'utf8');
const pubbliche = [...testoOrari.matchAll(/^function\s+(ORARI_[A-Za-z0-9_]*[A-Za-z0-9])\s*\(/gm)].map(m => m[1]);
const nonDette = funzioniOrariNonDette(testoOrari, ISTRUZIONI);
verifica('le ' + pubbliche.length + ' funzioni pubbliche di Orari.gs (' + pubbliche.join(', ') + ') stanno nella sua ' +
  'intestazione e nelle istruzioni' + (nonDette.length ? ' (mancano: ' + nonDette.join(', ') + ')' : ''),
  pubbliche.length >= 9 && pubbliche.indexOf('ORARI_6_coloraLezioni') >= 0 && pubbliche.indexOf('ORARI_7_colloqui') >= 0 &&
  nonDette.length === 0);
const nonSpente = ripreseNonSpente(testoOrari, testoPosta);
verifica('ogni ripresa di Orari.gs la conosce anche ANNULLA_automazione della Posta' +
  (nonSpente.length ? ' (non conosce: ' + nonSpente.join(', ') + ')' : ''), nonSpente.length === 0);

// ---------------------------------------------------------------------------
//  4. CALENDARIO.GS: LE SUE FUNZIONI NELLA SUA INTESTAZIONE, LE SUE RIPRESE SUE
//  Nel progetto dell'altro account ci sono solo Calendario.gs e i dati: ogni
//  sua funzione pubblica la spiega la sua intestazione, e una ripresa verso
//  una funzione delle email (che li' non c'e') fallirebbe ogni minuto.
// ---------------------------------------------------------------------------
/** Le funzioni ORARI_ di Calendario.gs che la sua intestazione non nomina, e le riprese verso funzioni che non ha. */
function calendarioNonDetto(cal) {
  const fine = cal.indexOf('*/');
  const suaIntestazione = fine > 0 ? cal.slice(0, fine) : '';
  const sue = new Set([...cal.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]));
  const fuori = [];
  for (const n of sue) {
    if (/^ORARI_/.test(n) && suaIntestazione.indexOf(n) < 0) fuori.push(n + ' (intestazione di Calendario.gs)');
  }
  for (const m of cal.matchAll(/^var\s+(\w*TRIGGER\w*)\s*=\s*(['"])([^'"]+)\2/gm)) {
    if (!sue.has(m[3])) fuori.push(m[1] + ' riprende ' + m[3] + ', che in Calendario.gs non c\'e\'');
  }
  return fuori;
}
intestazione('CALENDARIO.GS: LE SUE FUNZIONI NELLA SUA INTESTAZIONE, E LE SUE RIPRESE');
const testoCalendario = calendarioDiOggi();
const pubblicheCal = [...testoCalendario.matchAll(/^function\s+(ORARI_[A-Za-z0-9_]*[A-Za-z0-9])\s*\(/gm)].map(m => m[1]);
const nonDettoCal = calendarioNonDetto(testoCalendario);
verifica('le ' + pubblicheCal.length + ' funzioni pubbliche di Calendario.gs (' + pubblicheCal.join(', ') + ') stanno nella ' +
  'sua intestazione, e le sue riprese chiamano funzioni sue' + (nonDettoCal.length ? ' (no: ' + nonDettoCal.join('; ') + ')' : ''),
  pubblicheCal.length === 6 && pubblicheCal.indexOf('ORARI_7_colloqui') >= 0 && nonDettoCal.length === 0);

// ---------------------------------------------------------------------------
//  LA PROVA DELLA PROVA: un nome sbagliato deve essere trovato
// ---------------------------------------------------------------------------
intestazione('LA PROVA DELLA PROVA');
verifica('una funzione degli orari nuova, non scritta nell\'intestazione ne\' nelle istruzioni, viene trovata',
  funzioniOrariNonDette(testoOrari + '\nfunction ORARI_9_prova() {\n}\n', ISTRUZIONI).length === 2);
verifica('e una ripresa nuova degli orari che la Posta non spegne',
  ripreseNonSpente(testoOrari.replace(/^var _ORARI_TRIGGER_COLORI\s*=\s*'[^']+';/m,
    'var _ORARI_TRIGGER_COLORI = \'ORARI_9_prova\';'), testoPosta).join() === 'ORARI_9_prova');
verifica('una funzione nuova di Calendario.gs, non scritta nella sua intestazione, viene trovata',
  calendarioNonDetto(testoCalendario + '\nfunction ORARI_9_prova() {\n}\n').join() === 'ORARI_9_prova (intestazione di Calendario.gs)');
verifica('e una sua ripresa verso una funzione delle email',
  calendarioNonDetto(testoCalendario.replace(/^var _ORARI_TRIGGER_COLORI\s*=\s*'[^']+';/m,
    'var _ORARI_TRIGGER_COLORI = \'ORARI_2_invia\';')).length === 1);
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
