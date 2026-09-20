/* ===========================================================================
   ESTRAI L'ELENCO DEL PERSONALE DA SPAGGIARI (ClasseViva)
   ---------------------------------------------------------------------------
   Vale SOLO per ClasseViva: con altri registri (Argo, Axios, Nuvola...) non
   trova niente. Legge la pagina gia' visibile a chi e' autenticato e non
   manda nulla a nessuno.

   DOVE SI USA
     Spaggiari  ->  icona del profilo  ->  Network  ->  TUTTO IL PERSONALE
     tasto destro in un punto qualsiasi  ->  Ispeziona (o Esamina)
     scheda "Console"  ->  incolla qui sotto  ->  Invio

   COSA FA
     1. scorre la pagina fino in fondo, cosi' carica tutti i nominativi;
     2. legge nominativo, ruolo e (se c'e') l'indirizzo email;
     3. raduna i ruoli in cinque categorie (Dirigenza, Docenti,
        Amministrativi, Tecnici, Collaboratori);
     4. copia tutto negli appunti in formato incollabile;
     5. scarica anche un file CSV, come copia di sicurezza;
     6. stampa il riepilogo per categoria e il blocco CSV, da copiare a mano
        se gli appunti non funzionano.

   POI
     Torna nell'applicazione "Organizzazione Gmail", passo 2 (Personale),
     e premi "Incolla elenco".
   =========================================================================== */

(async () => {
  const attesa = ms => new Promise(r => setTimeout(r, ms));

  const conta = () => document.querySelectorAll('[account_id]').length ||
                      document.querySelectorAll('.sing_user_nominativo').length;

  // --- 1. scorrimento: le liste lunghe si caricano un pezzo per volta --------
  let precedente = -1, fermi = 0;
  console.log('Carico l\'elenco completo, attendi qualche secondo...');
  while (fermi < 3) {
    window.scrollTo(0, document.body.scrollHeight);
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 200) {
        el.scrollTop = el.scrollHeight;
      }
    });
    await attesa(600);
    const ora = conta();
    fermi = (ora === precedente) ? fermi + 1 : 0;
    precedente = ora;
  }
  window.scrollTo(0, 0);

  // --- 2. lettura dei dati ---------------------------------------------------
  const REGEX_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const pulisci = t => (t || '').replace(/\s+/g, ' ').trim();

  // I ruoli del registro sono tanti e lunghi ("DOCENTE LAUREATO SCUOLA
  // SECONDARIA II GRADO"): qui diventano le stesse cinque categorie che usa
  // Campanella per le sottoetichette di Gmail.
  const categoria = ruolo => {
    const r = (ruolo || '').toLowerCase();
    if (!r) return '';
    if (/dirigente scolastic|preside/.test(r)) return 'Dirigenza';
    if (/direttore sga|d\.s\.g\.a|dsga|direttore dei servizi|assistente amministrativ|amministrativo|segreteri/.test(r))
      return 'Amministrativi';
    if (/assistente tecnic|tecnico di laboratorio|aggiunto di laboratorio/.test(r)) return 'Tecnici';
    if (/collaboratore scolastic|ausiliari/.test(r)) return 'Collaboratori';
    if (/docente|insegnante|professor|educator|itp/.test(r)) return 'Docenti';
    return '';
  };

  let contenitori = Array.from(document.querySelectorAll('[account_id]'));
  if (contenitori.length === 0) {
    // struttura diversa dal solito: risalgo dal nominativo al blocco che lo contiene
    contenitori = Array.from(document.querySelectorAll('.sing_user_nominativo'))
      .map(el => el.closest('li, tr, .row, div') || el.parentElement)
      .filter(Boolean);
  }

  const persone = [];
  const visti = new Set();

  for (const c of contenitori) {
    const nomeEl = c.querySelector('.sing_user_nominativo') ||
                   (c.classList && c.classList.contains('sing_user_nominativo') ? c : null);
    if (!nomeEl) continue;

    const nome = pulisci(nomeEl.textContent);
    if (!nome) continue;

    const ruoloEl = c.querySelector('.sing_user_ruolo');
    const ruolo = pulisci(ruoloEl && ruoloEl.textContent) || 'Ruolo non specificato';

    const mailto = c.querySelector('a[href^="mailto:"]');
    let email = '';
    if (mailto) {
      email = decodeURIComponent(mailto.getAttribute('href').slice(7)).split('?')[0].trim();
    } else {
      const m = (c.innerText || '').match(REGEX_EMAIL);
      if (m) email = m[0];
    }

    const chiave = (c.getAttribute && c.getAttribute('account_id')) ||
                   (nome + '|' + ruolo).toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);

    persone.push({ nome, ruolo, email: email.toLowerCase(), categoria: categoria(ruolo) });
  }

  if (persone.length === 0) {
    console.warn('Nessun nominativo trovato.\n' +
      'Controlla di essere sulla pagina "TUTTO IL PERSONALE" e riprova.');
    return;
  }

  persone.sort((a, b) => a.ruolo.localeCompare(b.ruolo) || a.nome.localeCompare(b.nome));

  // --- 3. testo da incollare nell'applicazione -------------------------------
  const intestazione = 'NOMINATIVO\tRUOLO\tEMAIL\tCATEGORIA';
  const tsv = intestazione + '\n' +
              persone.map(p => `${p.nome}\t${p.ruolo}\t${p.email}\t${p.categoria}`).join('\n');

  const csv = [intestazione.replace(/\t/g, ';')]
    .concat(persone.map(p => [p.nome, p.ruolo, p.email, p.categoria]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')))
    .join('\r\n');

  let copiato = false;
  try { copy(tsv); copiato = true; } catch (e) { /* copy() esiste solo nella console */ }
  if (!copiato) {
    try { await navigator.clipboard.writeText(tsv); copiato = true; } catch (e) { /* niente */ }
  }
  if (!copiato) {
    const ta = document.createElement('textarea');
    ta.value = tsv;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { copiato = document.execCommand('copy'); } catch (e) { /* niente */ }
    ta.remove();
  }

  // --- 4. copia di sicurezza in CSV -----------------------------------------
  try {
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'personale_spaggiari.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    console.warn('CSV non scaricato (non e\' un problema): ' + e.message);
  }

  // --- 5. riepilogo ----------------------------------------------------------
  const perRuolo = {};
  persone.forEach(p => (perRuolo[p.ruolo] = perRuolo[p.ruolo] || []).push(p.nome));

  console.log('%c SUDDIVISIONE PER RUOLO ', 'background:#1a73e8;color:#fff;font-weight:bold');
  Object.keys(perRuolo).sort().forEach(ruolo => {
    console.log(`${ruolo.toUpperCase()}  (${perRuolo[ruolo].length})`);
    console.log('   ' + perRuolo[ruolo].join(', '));
  });

  const perCategoria = {};
  persone.forEach(p => {
    const c = p.categoria || 'Senza categoria';
    (perCategoria[c] = perCategoria[c] || []).push(p);
  });
  console.log('%c LE CINQUE CATEGORIE (quelle che Campanella usa in Gmail) ',
              'background:#188038;color:#fff;font-weight:bold');
  ['Dirigenza', 'Docenti', 'Amministrativi', 'Tecnici', 'Collaboratori', 'Senza categoria']
    .filter(c => perCategoria[c])
    .forEach(c => {
      const con = perCategoria[c].filter(p => p.email);
      console.log(`${c}: ${perCategoria[c].length} persone, ${con.length} con indirizzo`);
      if (con.length) console.log('   ' + con.map(p => p.email).join(', '));
    });
  console.table(persone);

  console.log('\n' + '='.repeat(64));
  console.log(`Persone trovate: ${persone.length}   -   con email: ` +
              persone.filter(p => p.email).length);
  console.log(copiato
    ? 'ELENCO COPIATO NEGLI APPUNTI. Torna in Campanella, strumento Posta,\n' +
      'passo 3 (Il personale), e premi "Incolla elenco".'
    : 'Copia automatica non riuscita: usa il file CSV scaricato, oppure\n' +
      'seleziona il blocco CSV qui sotto e copialo a mano.');
  console.log('='.repeat(64) + '\n');

  // Il blocco CSV resta sempre stampato: Campanella lo legge tale e quale,
  // e si seleziona con il mouse anche quando gli appunti non collaborano.
  console.log('%c CSV DA INCOLLARE IN CAMPANELLA ',
              'background:#5f6368;color:#fff;font-weight:bold');
  console.log(csv);

  window.PERSONALE = persone;   // resta disponibile come variabile: PERSONALE
  return `${persone.length} persone estratte`;
})();
