/**
 * Calendario.gs, la versione solo calendario di Orari.gs, come la prepara Campanella
 *
 *   const { soloCalendario, calendarioDiOggi } = require('./solo_calendario');
 *
 * Chi mette l'orario nel Google Calendar di un altro account (il suo
 * personale, per esempio) incolla in un progetto di quell'account
 * Calendario.gs e un DatiOrari.gs con il solo suo orario. Calendario.gs lo
 * genera l'applicazione da Orari.gs (src/SoloCalendario.cs, SoloCalendario.Genera);
 * qui la stessa regola in JavaScript, per le prove che girano senza
 * l'eseguibile (invarianti_script.js, nomi_funzioni.js,
 * prova_solo_calendario.js). test/prova_orario.ps1 controlla che il file
 * dell'applicazione sia questo, carattere per carattere.
 *
 *   - l'intestazione di Orari.gs (il primo commento, da "/**" in cima al
 *     primo "*" + "/") lascia il posto a src/risorse/Calendario_intestazione.txt,
 *     con {versione} al posto della versione di Orari.gs (_ORARI_VERSIONE);
 *   - le righe fra "// [SOLO EMAIL]" e "// [FINE SOLO EMAIL]" (i segni
 *     compresi) si tolgono: servono solo alle email;
 *   - le righe fra "// [SOLO CALENDARIO.GS]" e "// [FINE SOLO CALENDARIO.GS]"
 *     in Orari.gs sono commenti: perdono il "// " in testa e diventano
 *     codice (i segni si tolgono);
 *   - un segno e' una riga che comincia cosi' (dopo gli spazi); piu' di due
 *     righe vuote di fila diventano due; gli a capo sono \n.
 * Un segno aperto e non chiuso, uno che si chiude senza essere aperto, uno
 * dentro l'altro, una riga "solo calendario" senza "// " o Orari.gs senza la
 * sua intestazione sono errori: l'applicazione non da' un Calendario.gs a meta'.
 */

'use strict';
const fs = require('fs');
const path = require('path');

const SEGNI = {
  email: '// [SOLO EMAIL]',
  fineEmail: '// [FINE SOLO EMAIL]',
  calendario: '// [SOLO CALENDARIO.GS]',
  fineCalendario: '// [FINE SOLO CALENDARIO.GS]'
};

/** Calendario.gs da Orari.gs e dall'intestazione (Calendario_intestazione.txt). */
function soloCalendario(orari, intestazione) {
  const testo = String(orari).replace(/\r\n/g, '\n');
  const v = /\bvar\s+_ORARI_VERSIONE\s*=\s*'([0-9]+(?:\.[0-9]+)*)'/.exec(testo);
  if (!v) throw new Error('in Orari.gs non trovo la versione (_ORARI_VERSIONE)');
  if (testo.indexOf('/**') !== 0) throw new Error('Orari.gs non comincia con la sua intestazione (/**)');
  const fineIntestazione = testo.indexOf('*/');
  if (fineIntestazione < 0) throw new Error('l\'intestazione di Orari.gs non si chiude');
  let resto = testo.slice(fineIntestazione + 2);
  if (resto.charAt(0) === '\n') resto = resto.slice(1);

  const fuori = [];
  let dove = '', riga = 0;
  const vuota = s => s.replace(/[ \t]+/g, '') === '';
  for (const r of resto.split('\n')) {
    riga++;
    const t = r.replace(/^[ \t]+/, '');
    const segno = (t.indexOf(SEGNI.email) === 0) ? 'email'
                : (t.indexOf(SEGNI.fineEmail) === 0) ? 'fineEmail'
                : (t.indexOf(SEGNI.calendario) === 0) ? 'calendario'
                : (t.indexOf(SEGNI.fineCalendario) === 0) ? 'fineCalendario' : '';
    if (segno === 'email' || segno === 'calendario') {
      if (dove) throw new Error('riga ' + riga + ' dopo l\'intestazione: ' + SEGNI[segno] + ' dentro un altro blocco');
      dove = segno;
      continue;
    }
    if (segno === 'fineEmail' || segno === 'fineCalendario') {
      if (dove !== (segno === 'fineEmail' ? 'email' : 'calendario')) {
        throw new Error('riga ' + riga + ' dopo l\'intestazione: ' + SEGNI[segno] + ' senza il suo inizio');
      }
      dove = '';
      continue;
    }
    if (dove === 'email') continue;
    let scritta = r;
    if (dove === 'calendario') {
      const rientro = r.slice(0, r.length - t.length);
      if (t === '//') scritta = '';
      else if (t.indexOf('// ') === 0) scritta = rientro + t.slice(3);
      else throw new Error('riga ' + riga + ' dopo l\'intestazione: nel blocco solo calendario manca "// " in testa');
    }
    // piu' di due righe vuote di fila diventano due
    if (vuota(scritta) && fuori.length >= 2 && vuota(fuori[fuori.length - 1]) && vuota(fuori[fuori.length - 2])) continue;
    fuori.push(scritta);
  }
  if (dove) throw new Error('il blocco ' + SEGNI[dove] + ' non si chiude');

  const testa = String(intestazione).replace(/\r\n/g, '\n').split('{versione}').join(v[1]).replace(/\s+$/, '');
  return testa + '\n' + fuori.join('\n');
}

/** Calendario.gs dai file di adesso: src/risorse/Orari.gs e Calendario_intestazione.txt. */
function calendarioDiOggi() {
  const risorse = path.join(__dirname, '..', 'src', 'risorse');
  return soloCalendario(fs.readFileSync(path.join(risorse, 'Orari.gs'), 'utf8'),
                        fs.readFileSync(path.join(risorse, 'Calendario_intestazione.txt'), 'utf8'));
}

module.exports = { SEGNI, soloCalendario, calendarioDiOggi };
