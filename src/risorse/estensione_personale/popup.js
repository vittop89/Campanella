// ===========================================================================
//  Estrattore personale (Campanella) - popup.js
//
//  Quando il popup si apre esegue estraiPersonale() dentro la pagina attiva:
//  scorre l'elenco fino in fondo (le liste lunghe si caricano a pezzi), legge
//  nominativo, ruolo e indirizzo di ogni voce e li riporta qui come testo
//  separato da tabulazioni, lo stesso formato che Campanella riconosce con
//  "Incolla elenco". Niente esce dal browser: il pulsante copia negli appunti.
// ===========================================================================

const area = document.getElementById('risultato');
const bottone = document.getElementById('copiaBtn');
const stato = document.getElementById('stato');

function mostra(testo, classe) {
  stato.textContent = testo;
  stato.className = classe || '';
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || !tabs[0]) { mostra('Nessuna scheda attiva.', 'no'); return; }
  chrome.scripting.executeScript(
    { target: { tabId: tabs[0].id }, func: estraiPersonale },
    (risultati) => {
      if (chrome.runtime.lastError) {
        mostra('Non riesco a leggere questa pagina: ' + chrome.runtime.lastError.message, 'no');
        return;
      }
      const esito = risultati && risultati[0] && risultati[0].result;
      if (!esito || !esito.righe) {
        area.value = '';
        mostra('Nessun nominativo trovato: apri "Tutto il personale" di ClasseViva (Spaggiari) e riprova. ' +
               'Con altri registri questa estensione non funziona.', 'no');
        return;
      }
      area.value = esito.testo;
      bottone.disabled = false;
      mostra(esito.righe + ' persone, ' + esito.conEmail + ' con indirizzo. Premi "Copia".', 'ok');
    });
});

bottone.addEventListener('click', () => {
  navigator.clipboard.writeText(area.value).then(() => {
    mostra('Copiato: torna in Campanella e premi "Incolla elenco".', 'ok');
  }).catch((e) => {
    mostra('Copia non riuscita (' + e + '): seleziona il testo e copialo a mano.', 'no');
  });
});

// --- questa funzione gira DENTRO la pagina di ClasseViva -------------------
async function estraiPersonale() {
  const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
  const conta = () => document.querySelectorAll('[account_id]').length ||
                      document.querySelectorAll('.sing_user_nominativo').length;

  // 1. scorrimento: le liste lunghe si caricano un pezzo per volta
  let precedente = -1, fermi = 0;
  while (fermi < 3) {
    window.scrollTo(0, document.body.scrollHeight);
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 200) el.scrollTop = el.scrollHeight;
    });
    await attesa(600);
    const ora = conta();
    fermi = (ora === precedente) ? fermi + 1 : 0;
    precedente = ora;
  }
  window.scrollTo(0, 0);

  // 2. lettura
  const REGEX_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const pulisci = (t) => (t || '').replace(/\s+/g, ' ').trim();

  let contenitori = Array.from(document.querySelectorAll('[account_id]'));
  if (contenitori.length === 0) {
    contenitori = Array.from(document.querySelectorAll('.sing_user_nominativo'))
      .map((el) => el.closest('li, tr, .row, div') || el.parentElement)
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
    let email = '';
    const mailto = c.querySelector('a[href^="mailto:"]');
    if (mailto) email = decodeURIComponent(mailto.getAttribute('href').slice(7)).split('?')[0].trim();
    else { const m = (c.innerText || '').match(REGEX_EMAIL); if (m) email = m[0]; }
    const chiave = (c.getAttribute && c.getAttribute('account_id')) || (nome + '|' + ruolo).toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    persone.push({ nome, ruolo, email: email.toLowerCase() });
  }
  if (persone.length === 0) return { righe: 0 };

  // i ruoli del registro, radunati nelle cinque categorie di Campanella
  const categoria = (ruolo) => {
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

  persone.sort((a, b) => a.ruolo.localeCompare(b.ruolo) || a.nome.localeCompare(b.nome));
  const testo = 'NOMINATIVO\tRUOLO\tEMAIL\tCATEGORIA\n' +
                persone.map((p) => p.nome + '\t' + p.ruolo + '\t' + p.email +
                                   '\t' + categoria(p.ruolo)).join('\n');
  return { righe: persone.length, conEmail: persone.filter((p) => p.email).length, testo };
}
