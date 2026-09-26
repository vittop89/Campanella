/**
 * I filtri di Gmail diventati regole, nel motore vero della posta
 *
 *   node test/filtri_diventano_regole.js Configurazione.gs Organizzazione_Gmail.gs scelte.json
 *
 * La lancia test/prova_posta.ps1, dopo "Usa questa scelta" nella finestra dei
 * filtri di Gmail con l'esportazione inventata test/filtri_gmail_riorganizza.xml:
 * la configurazione e' quella che Campanella genera dopo, scelte.json dice per
 * ogni filtro i criteri (con i nomi del servizio Gmail API), se archiviava o
 * segnava come letto, che cosa si e' scelto (nuova, unisci, togli, lascia) e
 * con quale regola, e per ogni regola le ricerche che la finestra mostra
 * (GeneratorePosta.Ricerche). Controlla che:
 *
 *   - le ricerche della finestra siano quelle che il motore costruisce
 *     (_queryDellaRegola_), a parte quello che lo script aggiunge sempre (la
 *     sua etichetta, -in:chats, -in:sent);
 *   - con il riordino vero (PASSO_3_riordinaPostaEsistente) su una casella
 *     finta, ogni messaggio che il filtro prendeva prenda l'etichetta della
 *     regola (per una regola nuova: proprio quelli, ne' uno di piu' ne' uno
 *     di meno), e sia archiviato se il filtro archiviava: from:(... OR ...),
 *     le esclusioni -from:, i nomi fra virgolette, due from: insieme. Anche
 *     per un filtro tolto perche' "lo fa gia' la regola X": X lo fa davvero;
 *   - la casella della scuola (in Segreteria) non finisca in Ministero e USR;
 *   - un filtro unito a una regola non le tolga i messaggi che prendeva gia'
 *     ne' quelli degli altri filtri uniti a lei (Sindacati: la newsletter di
 *     @flcgil.it, gli esiti di esami.sindacato-uno.example);
 *   - EXTRA_togliFiltri, con la stessa configurazione, tolga i filtri scelti
 *     e che ognuno di quelli diventati regola, uniti o tolti perche' li fa
 *     gia' una regola abbia la sua regola accesa in quella stessa
 *     configurazione: arrivano insieme.
 *
 * Le ricerche le valuta un interprete delle ricerche di Gmail fatto qui (con
 * le precedenze di Gmail: OR prima dello spazio), lo stesso per il filtro e
 * per le regole. La ricerca del filtro la scrive questo file dai criteri,
 * come Gmail (from:(...), le parole fra parentesi), non il C#.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const [fileConfigurazione, fileMotore, fileScelte] = process.argv.slice(2);
if (!fileConfigurazione || !fileMotore || !fileScelte) {
  console.log('Uso: node test/filtri_diventano_regole.js Configurazione.gs Organizzazione_Gmail.gs scelte.json');
  process.exit(2);
}
const scelte = JSON.parse(fs.readFileSync(fileScelte, 'utf8').replace(/^\uFEFF/, ''));

let fallimenti = 0;
function verifica(descrizione, condizione) {
  console.log((condizione ? '  OK      ' : '  FALLITO ') + descrizione);
  if (!condizione) fallimenti++;
}

// ---------------------------------------------------------------------------
//  UN INTERPRETE DELLE RICERCHE DI GMAIL
//  Gli spazi sono "e", OR e' "o" e lega piu' forte degli spazi, "-" e' "non",
//  le parentesi raggruppano, le graffe sono un "o", campo:(...) vale per
//  tutto il gruppo. from: guarda indirizzo e nome del mittente; le parole
//  senza campo oggetto, testo e mittente; un valore vale se c'e' dentro.
// ---------------------------------------------------------------------------
function analizza(q) {
  let i = 0;
  const salta = () => { while (i < q.length && /\s/.test(q[i])) i++; };
  function sequenza(fine) {
    const parti = [];
    for (;;) {
      salta();
      if (i >= q.length || q[i] === fine) break;
      parti.push(alternativa());
    }
    return { tipo: 'e', parti };
  }
  function alternativa() {
    const parti = [unario()];
    for (;;) {
      const prima = i;
      salta();
      if (q.startsWith('OR', i) && (i + 2 >= q.length || /[\s({"]/.test(q[i + 2]))) {
        i += 2;
        parti.push(unario());
      } else { i = prima; break; }
    }
    return parti.length === 1 ? parti[0] : { tipo: 'o', parti };
  }
  function unario() {
    salta();
    if (q[i] === '-') { i++; return { tipo: 'non', x: unario() }; }
    return primario();
  }
  function primario() {
    salta();
    if (q[i] === '(') { i++; const s = sequenza(')'); if (q[i] !== ')') throw new Error('manca ) in ' + q); i++; return s; }
    if (q[i] === '{') {
      i++;
      const parti = [];
      for (;;) { salta(); if (i >= q.length) throw new Error('manca } in ' + q); if (q[i] === '}') { i++; break; } parti.push(unario()); }
      return { tipo: 'o', parti };
    }
    if (q[i] === '"') {
      const j = q.indexOf('"', i + 1);
      if (j < 0) throw new Error('manca " in ' + q);
      const t = q.slice(i + 1, j);
      i = j + 1;
      return { tipo: 'parola', campo: '', valore: t };
    }
    let j = i;
    while (j < q.length && !/[\s(){}"]/.test(q[j])) j++;
    const t = q.slice(i, j);
    i = j;
    if (t === '') throw new Error('ricerca che non si legge: ' + q);
    const due = t.indexOf(':');
    if (due > 0 && due === t.length - 1) return { tipo: 'campo', campo: t.slice(0, -1).toLowerCase(), x: primario() };
    if (due > 0) return { tipo: 'parola', campo: t.slice(0, due).toLowerCase(), valore: t.slice(due + 1) };
    return { tipo: 'parola', campo: '', valore: t };
  }
  const albero = sequenza(null);
  if (i < q.length) throw new Error('avanza qualcosa in ' + q);
  return albero;
}

function vale(n, m, campo) {
  switch (n.tipo) {
    case 'e': return n.parti.every(p => vale(p, m, campo));
    case 'o': return n.parti.some(p => vale(p, m, campo));
    case 'non': return !vale(n.x, m, campo);
    case 'campo': return vale(n.x, m, n.campo);
    default: return parola(n.campo || campo || '', n.valore, m);
  }
}

function parola(campo, valore, m) {
  const v = String(valore).toLowerCase();
  switch (campo) {
    case 'from': return (m.da + ' ' + m.nome).toLowerCase().indexOf(v) >= 0;
    case 'to': return (m.a || '').toLowerCase().indexOf(v) >= 0;
    case 'subject': return m.oggetto.toLowerCase().indexOf(v) >= 0;
    case 'label': return [...m.etichette].some(e => e.toLowerCase() === v);
    case 'in': return v === 'inbox' ? m.inArrivo : v === 'anywhere';
    case 'newer_than': case 'older_than': return true;
    case 'has': return v === 'attachment' ? !!m.allegato : false;
    case '': return (m.oggetto + ' ' + m.testo + ' ' + m.da + ' ' + m.nome).toLowerCase().indexOf(v) >= 0;
    default: return false;
  }
}

const valutate = {};
function cerca(q, casella) {
  if (!valutate[q]) valutate[q] = analizza(q);
  return casella.filter(m => vale(valutate[q], m, ''));
}

/** La ricerca di un filtro dai suoi criteri, come la scrive Gmail. */
function ricercaDelFiltro(c) {
  const p = [];
  if (c.from) p.push('from:(' + c.from + ')');
  if (c.to) p.push('to:(' + c.to + ')');
  if (c.subject) p.push('subject:(' + c.subject + ')');
  if (c.query) p.push('(' + c.query + ')');
  if (c.negatedQuery) p.push('-(' + c.negatedQuery + ')');
  if (c.hasAttachment) p.push('has:attachment');
  return p.join(' ');
}

// ---------------------------------------------------------------------------
//  LA CASELLA FINTA: almeno un messaggio per filtro, e quelli ai margini
// ---------------------------------------------------------------------------
let prossimo = 1;
const casella = [];
function messaggio(da, nome, oggetto) {
  const m = { id: 'm' + (prossimo++), da, nome: nome || '', oggetto: oggetto || 'Comunicazione', testo: '',
              etichette: new Set(), inArrivo: true, letto: false, getId() { return this.id; } };
  casella.push(m);
  return m;
}
messaggio('dipartimento.materia@scuola.example', 'Dipartimento', 'Riunione di dipartimento');
const civica = messaggio('no-reply@classroom.google.com', 'ANNA ESEMPIO (Classroom)', 'Nuovo compito: educazione civica');
const classroom = messaggio('no-reply@classroom.google.com', 'MARCO ESEMPIO (Classroom)', 'Nuovo materiale');
messaggio('comunicazioni@istruzione.it', 'Ministero', 'Nota ministeriale');
messaggio('usr.regione@istruzione.gov.it', 'USR', 'Avviso');
messaggio('ufficio@mim.gov.it', 'MIM', 'Decreto');
// la casella istituzionale della scuola: e' in Segreteria, e il filtro 1 (XYIS01200Z) la prende
const casellaScuola = messaggio('casella@istruzione.it', 'Istituto (casella istituzionale)', 'Convocazione');
messaggio('noreply@spaggiari.eu', 'ClasseViva', 'Nuova nota');
messaggio('avvisi@portaleargo.it', 'Argo', 'Scrutini');
messaggio('info@nuvola.example', 'Nuvola', 'Assenze');
messaggio('posta@legalmail.example', 'PEC', 'Ricevuta di consegna');
messaggio('avviso@postacert.example', 'PEC', 'Accettazione');
messaggio('cedolino@stipendi.pa.example', 'Stipendi', 'Cedolino di settembre');
messaggio('info@gare-scientifiche.example', 'Gare', 'Iscrizioni aperte');
messaggio('olimat@olimpiadi.example', 'Olimpiadi', 'Risultati');
messaggio('news@editore-uno.example', 'Editore', 'Nuovi libri');
const sindacato = messaggio('comunicati@sindacato-uno.example', 'Sindacato', 'Assemblea');
// due filtri Sindacati uniti alla regola (prova_posta.ps1, "unisci con le
// esclusioni"): uno esclude "esami", che e' proprio il mittente dell'altro; e
// uno esclude la newsletter di un dominio che Sindacati prende gia'
const esamiSindacato = messaggio('esiti@esami.sindacato-uno.example', 'Sindacato', 'Esiti');
const newsletterSindacato = messaggio('newsletter@flcgil.it', 'Sindacato', 'Newsletter');
messaggio('redazione@notizie-scuola.example', 'Notizie', 'Novita\' normative');
const github = messaggio('noreply@github.com', 'GitHub', 'Notifica');
messaggio('mailer-daemon@googlemail.com', 'Mail Delivery Subsystem', 'Delivery Status Notification');
messaggio('segreteria@liceo-uno.example', 'Liceo', 'Scambio di classi');
messaggio('ds@istituto-due.example', 'Istituto', 'Rete di scuole');
messaggio('prof@scuola.edu.it', 'Altra scuola', 'Progetto');
messaggio('mamma.rossi@gmail.com', 'Famiglia Rossi', 'Giustificazione');
// due filtri con la stessa etichetta (prova_posta.ps1, "due filtri con la
// stessa etichetta"): Portali esclude gli esami, che prende l'altro Portali
messaggio('avvisi@portale-uno.example', 'Portale', 'Avviso');
messaggio('info@portale-due.example', 'Portale', 'Novita');
messaggio('esiti@esami.portale-uno.example', 'Portale', 'Esiti');
messaggio('iscrizioni@gare-uno.example', 'Gara', 'Iscrizioni');
messaggio('risultati@gare-due.example', 'Gara', 'Risultati');
messaggio('papa.verdi@libero.it', 'Famiglia Verdi', 'Colloquio');
messaggio('preside@scuola.example', 'Dirigente', 'Collegio docenti');
messaggio('anna.bianchi@scuola.example', 'Anna Bianchi', 'Verbale');

// ---------------------------------------------------------------------------
//  LE FINTE API DI GOOGLE
// ---------------------------------------------------------------------------
const etichette = new Map();
const proprieta = new Map();
class Label {
  constructor(nome) { this.nome = nome; }
  getName() { return this.nome; }
  addToThreads(ms) { ms.forEach(m => m.etichette.add(this.nome)); return this; }
  removeFromThreads(ms) { ms.forEach(m => m.etichette.delete(this.nome)); return this; }
  getThreads(inizio, quanti) { return casella.filter(m => m.etichette.has(this.nome)).slice(inizio, inizio + quanti); }
}
const contesto = vm.createContext({
  GmailApp: {
    search: (q, inizio, quanti) => cerca(q, casella).slice(inizio || 0, (inizio || 0) + (quanti || 500)),
    getUserLabelByName: nome => etichette.get(nome) || null,
    createLabel: nome => { const l = new Label(nome); etichette.set(nome, l); return l; },
    getUserLabels: () => [...etichette.values()],
    moveThreadsToArchive: ms => ms.forEach(m => { m.inArrivo = false; }),
    markThreadsRead: ms => ms.forEach(m => { m.letto = true; })
  },
  PropertiesService: { getUserProperties: () => ({
    getProperty: k => (proprieta.has(k) ? proprieta.get(k) : null),
    setProperty: (k, v) => { proprieta.set(k, String(v)); },
    deleteProperty: k => { proprieta.delete(k); }
  }) },
  LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {},
               newTrigger: () => ({ timeBased: () => ({ after: () => ({ create: () => {} }), everyHours: () => ({ create: () => {} }) }) }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'docente@scuola.example' }),
             getEffectiveUser: () => ({ getEmail: () => 'docente@scuola.example' }),
             getScriptTimeZone: () => 'Europe/Rome' },
  Utilities: { sleep: () => {}, formatDate: () => '20260926' },
  MailApp: { sendEmail: () => {} },
  Logger: { log: () => {} },
  console
});
vm.runInContext(fs.readFileSync(fileConfigurazione, 'utf8'), contesto, { filename: 'Configurazione.gs' });
vm.runInContext(fs.readFileSync(fileMotore, 'utf8'), contesto, { filename: 'Organizzazione_Gmail.gs' });
const cfg = contesto.CONFIG;
cfg.provaSenzaModifiche = false;
cfg.inviaReport = false;

// ---------------------------------------------------------------------------
console.log('\nLE RICERCHE CHE MOSTRA LA FINESTRA SONO QUELLE DEL MOTORE');
const regole = contesto._regoleAttive_(cfg);
// due regole possono avere la stessa etichetta (due filtri con la stessa
// etichetta e esclusioni diverse): si confrontano nell'ordine
const perEtichetta = {}, tutteDi = {}, viste = {};
regole.forEach(r => { perEtichetta[r.etichetta] = r; (tutteDi[r.etichetta] = tutteDi[r.etichetta] || []).push(r); });
const diverse = [];
let confrontate = 0;
(scelte.ricerche || []).forEach(x => {
  const k = viste[x.etichetta] || 0;
  viste[x.etichetta] = k + 1;
  const r = (tutteDi[x.etichetta] || [])[k];
  if (!r) { if (x.ricerche.length) diverse.push(x.etichetta + ': nel motore non c\'e\''); return; }
  const proprie = ' -label:' + contesto._virgolette_(contesto._etichettaCompleta_(cfg, r));
  const delMotore = contesto._queryDellaRegola_(cfg, r).map(q =>
    q.split(proprie).join('').split(' -in:chats').join('').split(' -in:sent').join('').trim());
  confrontate++;
  if (JSON.stringify(delMotore) !== JSON.stringify(x.ricerche)) {
    diverse.push(x.etichetta + ':\n      motore:  ' + delMotore.join(' | ') + '\n      finestra: ' + x.ricerche.join(' | '));
  }
});
verifica('per ognuna delle ' + confrontate + ' regole accese, le stesse ricerche' +
         (diverse.length ? ':\n    ' + diverse.join('\n    ') : ''), diverse.length === 0 && confrontate >= 10);

// ---------------------------------------------------------------------------
console.log('\nIL RIORDINO VERO: OGNI MESSAGGIO DEL FILTRO NELLA SUA REGOLA');
const esito = contesto.PASSO_3_riordinaPostaEsistente();
verifica('il riordino finisce (' + String(esito).split('\n')[0] + ')', /RIORDINO COMPLETATO/.test(esito));
const prefisso = String(cfg.prefissoEtichette || '').replace(/\/+$/, '');
const conGruppo = e => (prefisso ? prefisso + '/' : '') + e;
// quelli che hanno una regola: diventati regola, uniti, o tolti perche' la regola li fa gia'
const conRegola = f => f.azione === 'nuova' || f.azione === 'unisci' || (f.azione === 'togli' && !!f.regola);
(scelte.filtri || []).forEach(f => {
  if (!conRegola(f)) return;
  const q = ricercaDelFiltro(f.criteri);
  const presi = cerca(q, casella);
  const etichetta = conGruppo(f.regola);
  const senza = presi.filter(m => !m.etichette.has(etichetta)).map(m => m.da);
  const archivio = f.archivia ? presi.filter(m => m.inArrivo).map(m => m.da) : [];
  const letti = f.letti ? presi.filter(m => !m.letto).map(m => m.da) : [];
  let testo = f.etichetta + ' (' + f.azione + ' -> ' + etichetta + '): ' + presi.length + ' messaggi del filtro';
  let ok = presi.length > 0 && senza.length === 0 && archivio.length === 0 && letti.length === 0;
  if (f.azione === 'nuova') {
    // le regole nuove con quell'etichetta prendono proprio quelli dei filtri
    // diventati regola con quell'etichetta (di solito uno)
    const deiFiltri = new Set();
    (scelte.filtri || []).forEach(g => {
      if (g.azione === 'nuova' && conGruppo(g.regola) === etichetta) cerca(ricercaDelFiltro(g.criteri), casella).forEach(m => deiFiltri.add(m));
    });
    const inPiu = casella.filter(m => m.etichette.has(etichetta) && !deiFiltri.has(m)).map(m => m.da);
    ok = ok && inPiu.length === 0;
    if (inPiu.length) testo += '; in piu\': ' + inPiu.join(', ');
  }
  if (senza.length) testo += '; senza l\'etichetta: ' + senza.join(', ');
  if (archivio.length) testo += '; non archiviati: ' + archivio.join(', ');
  if (letti.length) testo += '; non letti: ' + letti.join(', ');
  verifica(testo + (f.archivia ? ', archiviati' : ''), ok);
});
verifica('due from: insieme (Ref. Ed. Civica) prendono solo il messaggio di Classroom di quella persona',
  civica.etichette.has(conGruppo('Ref. Ed. Civica')) && !classroom.etichette.has(conGruppo('Ref. Ed. Civica')));
verifica('e -from:"nome" (Classroom) lascia fuori proprio quella persona',
  classroom.etichette.has(conGruppo('Classroom')) && !civica.etichette.has(conGruppo('Classroom')));
verifica('la casella della scuola (in Segreteria) ha Segreteria e non Ministero e USR (' + [...casellaScuola.etichette].join(', ') + ')',
  casellaScuola.etichette.has(conGruppo('Segreteria')) && !casellaScuola.etichette.has(conGruppo('Ministero e USR')));
verifica('le notifiche e i sindacati sono archiviati, e hanno solo la loro etichetta',
  !github.inArrivo && !sindacato.inArrivo && github.etichette.size === 1 && sindacato.etichette.size === 1);
// un filtro unito a una regola non le toglie i messaggi che prendeva gia' (le
// sue esclusioni valgono per tutta la regola), ne' quelli di un altro filtro
// unito a lei
const sindacati = perEtichetta.Sindacati;
if (sindacati && (sindacati.da || []).indexOf('@flcgil.it') >= 0) {
  verifica('Sindacati prende ancora la newsletter di @flcgil.it, che prendeva gia\' (' + [...newsletterSindacato.etichette].join(', ') + ')',
    newsletterSindacato.etichette.has(conGruppo('Sindacati')) && !newsletterSindacato.inArrivo);
}
if (sindacati && (sindacati.da || []).some(d => /sindacato-uno\.example$/.test(d))) {
  verifica('e gli esiti di esami.sindacato-uno.example, archiviati (' + [...esamiSindacato.etichette].join(', ') + ')',
    esamiSindacato.etichette.has(conGruppo('Sindacati')) && !esamiSindacato.inArrivo);
}

// ---------------------------------------------------------------------------
console.log('\nEXTRA_togliFiltri CON LA STESSA CONFIGURAZIONE');
const labelGmail = [], filtriGmail = [], tolti = [];
(scelte.filtri || []).forEach((f, i) => {
  labelGmail.push({ id: 'Label_' + i, name: f.etichetta, type: 'user' });
  const criteria = {};
  Object.keys(f.criteri).forEach(k => {
    criteria[k] = (k === 'hasAttachment' || k === 'excludeChats') ? true : (k === 'size' ? Number(f.criteri[k]) : f.criteri[k]);
  });
  const action = { addLabelIds: ['Label_' + i] };
  if (f.archivia) action.removeLabelIds = ['INBOX'];
  filtriGmail.push({ id: 'F' + i, criteria, action });
});
contesto.Gmail = { Users: {
  Labels: { list: () => ({ labels: labelGmail }) },
  Settings: { Filters: {
    list: () => ({ filter: JSON.parse(JSON.stringify(filtriGmail)) }),
    remove: (u, id) => { tolti.push(id); filtriGmail.splice(filtriGmail.findIndex(f => f.id === id), 1); }
  } }
} };
const daTogliere = (scelte.filtri || []).map((f, i) => (f.azione === 'lascia' ? null : 'F' + i)).filter(Boolean);
contesto.EXTRA_togliFiltri();
verifica('toglie proprio i ' + daTogliere.length + ' filtri scelti (' + tolti.join(', ') + ')',
  tolti.slice().sort().join(',') === daTogliere.slice().sort().join(','));
const senzaRegola = [];
(scelte.filtri || []).forEach((f, i) => {
  if (tolti.indexOf('F' + i) < 0 || !conRegola(f)) return;
  if (!perEtichetta[f.regola]) senzaRegola.push(f.etichetta + ' -> ' + f.regola);
});
verifica("e ognuno di quelli diventati regola, uniti a una regola o che una regola fa gia' ha la sua regola accesa nella stessa configurazione" +
         (senzaRegola.length ? ': no ' + senzaRegola.join(', ') : ''), senzaRegola.length === 0);

console.log('');
if (fallimenti) { console.log('FALLITE: ' + fallimenti); process.exit(1); }
console.log('Tutto bene.');
