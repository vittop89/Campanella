/**
 * I filtri di Gmail scelti a caso, nel motore vero della posta
 *
 *   node test/filtri_a_caso.js scenari.json Organizzazione_Gmail.gs
 *
 * La lancia test/filtri_a_caso.ps1, che per ogni scenario (regole, filtri e
 * scelte inventati a caso, con un seme fisso) fa quello che fa la finestra
 * "Filtri che hai gia' in Gmail..." con "Usa questa scelta" e scrive la
 * configurazione che ne esce; e test/prova_posta.ps1, con i casi scritti a
 * mano. Qui, per ogni scenario, con la configurazione e lo script veri:
 *
 *   1. EXTRA_togliFiltri (con un servizio Gmail API finto che ha i filtri
 *      del file) dice quali filtri vanno via davvero;
 *   2. su una casella finta sempre uguale, con i messaggi di mittenti che si
 *      sovrappongono, i filtri rimasti in Gmail fanno il loro lavoro
 *      all'arrivo (etichetta, archivia, segna come letto, manda nel cestino:
 *      la ricerca dello script nel cestino non guarda), poi gira lo
 *      smistamento (smistaNuoviMessaggi) oppure il riordino (PASSO_3);
 *   3. ogni messaggio di ogni filtro tolto deve avere ancora l'etichetta
 *      della regola che lo sostituisce (quella del filtro, se si toglie
 *      senza regola) ed essere archiviato e segnato come letto se il filtro
 *      lo faceva. Non contano i filtri tolti con "Toglilo" scelto apposta,
 *      senza una regola: chi lo sceglie sa che va via e basta. E non conta
 *      un messaggio che la regola non prende perche' ha l'etichetta di una
 *      regola che lei esclude (i colleghi per Studenti, la casella della
 *      scuola in Segreteria per Ministero e USR): e' quello che fa. Solo se
 *      quell'etichetta gliela mettono le regole, da sole: la stessa casella,
 *      senza nessun filtro di Gmail, con lo stesso smistamento o riordino,
 *      gli da' l'etichetta esclusa e non quella della regola. Se gliela
 *      mette solo un filtro rimasto in Gmail la promessa e' rotta. E conta
 *      lo stesso se le regole escluse prendono tutti i messaggi di un
 *      mittente del filtro (tutti quelli della casella): per quel mittente
 *      il filtro non lo sostituisce nessuno.
 *
 * scenari.json: { messaggi: [{ da, nome }], scenari: [{ nome, configurazione,
 * racconto, filtri: [{ etichetta, criteri, archivia, letti, cestino, regola,
 * esplicito }] }] }. regola e' quella che la voce da togliere ricorda ("" se
 * nessuna); esplicito, un "Toglilo" senza regola scelto apposta.
 *
 * Le ricerche le valuta test/ricerche_gmail.js. Esce con 1 se anche un solo
 * scenario rompe la promessa.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const { analizza, vale, cerca, ricercaDelFiltro } = require('./ricerche_gmail');

const [fileScenari, fileMotore] = process.argv.slice(2);
if (!fileScenari || !fileMotore) {
  console.log('Uso: node test/filtri_a_caso.js scenari.json Organizzazione_Gmail.gs');
  process.exit(2);
}
const dati = JSON.parse(fs.readFileSync(fileScenari, 'utf8').replace(/^﻿/, ''));
const motore = new vm.Script(fs.readFileSync(fileMotore, 'utf8'), { filename: 'Organizzazione_Gmail.gs' });
const zitto = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };

function nuovaCasella() {
  return dati.messaggi.map((x, i) => ({
    id: 'm' + i, da: x.da, nome: x.nome || '', oggetto: x.oggetto || 'Messaggio', testo: '',
    etichette: new Set(), inArrivo: true, letto: false, cestino: false, getId() { return this.id; }
  }));
}

/** I filtri rimasti in Gmail, all'arrivo dei messaggi. */
function applicaFiltri(filtri, casella) {
  filtri.forEach(f => cerca(ricercaDelFiltro(f.criteri), casella).forEach(m => {
    m.etichette.add(f.etichetta);
    if (f.archivia) m.inArrivo = false;
    if (f.letti) m.letto = true;
    if (f.cestino) m.cestino = true;
  }));
}

/** Lo script con la configurazione, su quella casella, con le API di Google finte. */
function contesto(configurazione, casella) {
  const etichette = new Map(), proprieta = new Map();
  class Label {
    constructor(nome) { this.nome = nome; }
    getName() { return this.nome; }
    addToThreads(ms) { ms.forEach(m => m.etichette.add(this.nome)); return this; }
    removeFromThreads(ms) { ms.forEach(m => m.etichette.delete(this.nome)); return this; }
  }
  // le etichette che i filtri rimasti hanno messo esistono gia'; in Gmail il
  // nome di un'etichetta non distingue le maiuscole
  casella.forEach(m => m.etichette.forEach(e => {
    if (!etichette.has(e.toLowerCase())) etichette.set(e.toLowerCase(), new Label(e));
  }));
  const ctx = vm.createContext({
    GmailApp: {
      // come Gmail: la ricerca non guarda nel cestino
      search: (q, inizio, quanti) => cerca(q, casella.filter(m => !m.cestino)).slice(inizio || 0, (inizio || 0) + (quanti || 500)),
      getUserLabelByName: nome => etichette.get(String(nome).toLowerCase()) || null,
      createLabel: nome => { const l = new Label(nome); etichette.set(String(nome).toLowerCase(), l); return l; },
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
      getEffectiveUser: () => ({ getEmail: () => 'docente@scuola.example' }), getScriptTimeZone: () => 'Europe/Rome' },
    Utilities: { sleep: () => {}, formatDate: () => '20260926' },
    MailApp: { sendEmail: () => {} },
    Logger: { log: () => {} },
    console: zitto
  });
  vm.runInContext(configurazione, ctx, { filename: 'Configurazione.gs' });
  motore.runInContext(ctx);
  ctx.CONFIG.provaSenzaModifiche = false;
  ctx.CONFIG.inviaReport = false;
  return ctx;
}

/** I mittenti che il filtro cerca (i from: non negati), come li scrive: pezzi di testo. */
function mittentiDelFiltro(criteri) {
  const fuori = [];
  function giu(n, campo, negato) {
    if (!n) return;
    if (n.tipo === 'e' || n.tipo === 'o') n.parti.forEach(p => giu(p, campo, negato));
    else if (n.tipo === 'non') giu(n.x, campo, !negato);
    else if (n.tipo === 'campo') giu(n.x, n.campo, negato);
    else if (!negato && (n.campo || campo) === 'from') fuori.push(n.valore);
  }
  try { giu(analizza(ricercaDelFiltro(criteri)), '', false); } catch (e) { return []; }
  return fuori;
}

/** Gli indici dei filtri che EXTRA_togliFiltri toglie davvero, e lo script con la configurazione. */
function tolti(scenario) {
  const ctx = contesto(scenario.configurazione, nuovaCasella());
  const labelGmail = [], filtriGmail = [], via = [];
  scenario.filtri.forEach((f, i) => {
    labelGmail.push({ id: 'Label_' + i, name: f.etichetta, type: 'user' });
    const criteria = {};
    Object.keys(f.criteri).forEach(k => {
      criteria[k] = (k === 'hasAttachment' || k === 'excludeChats') ? true : (k === 'size' ? Number(f.criteri[k]) : f.criteri[k]);
    });
    const action = { addLabelIds: ['Label_' + i] };
    if (f.archivia) action.removeLabelIds = ['INBOX'];
    filtriGmail.push({ id: 'F' + i, criteria, action });
  });
  ctx.Gmail = { Users: {
    Labels: { list: () => ({ labels: labelGmail }) },
    Settings: { Filters: {
      list: () => ({ filter: JSON.parse(JSON.stringify(filtriGmail)) }),
      remove: (u, id) => { via.push(Number(id.slice(1))); filtriGmail.splice(filtriGmail.findIndex(f => f.id === id), 1); }
    } }
  } };
  ctx.EXTRA_togliFiltri();
  return { via: new Set(via), ctx };
}

let scenari = 0, rotti = 0, filtriTolti = 0, controllati = 0, messaggiControllati = 0, eccezioni = 0;
let raccontati = 0;
for (const scenario of dati.scenari) {
  scenari++;
  const problemi = [];
  try {
    const { via, ctx } = tolti(scenario);
    filtriTolti += via.size;
    const prefisso = String(ctx.CONFIG.prefissoEtichette || '').replace(/\/+$/, '');
    const conGruppo = e => (prefisso ? prefisso + '/' : '') + e;
    // le etichette (intere) che le regole accese escludono, per etichetta della regola
    const escluse = {};
    ctx._regoleAttive_(ctx.CONFIG).forEach(r => {
      const k = conGruppo(r.etichetta).toLowerCase();
      (r.escludiEtichette || []).forEach(e => { (escluse[k] = escluse[k] || new Set()).add(conGruppo(e).toLowerCase()); });
    });
    for (const modo of ['smistamento', 'riordino']) {
      const casella = nuovaCasella();
      applicaFiltri(scenario.filtri.filter((f, i) => !via.has(i)), casella);
      const c = contesto(scenario.configurazione, casella);
      if (modo === 'smistamento') c.smistaNuoviMessaggi(); else c.PASSO_3_riordinaPostaEsistente();
      // la stessa casella con le regole sole, senza nessun filtro di Gmail
      const soloRegole = nuovaCasella();
      const r = contesto(scenario.configurazione, soloRegole);
      if (modo === 'smistamento') r.smistaNuoviMessaggi(); else r.PASSO_3_riordinaPostaEsistente();
      const dalleRegole = new Map(soloRegole.map(m => [m.id, [...m.etichette].map(e => e.toLowerCase())]));
      scenario.filtri.forEach((f, i) => {
        if (!via.has(i) || f.esplicito) return;
        if (modo === 'smistamento') controllati++;
        const attesa = (f.regola ? conGruppo(f.regola) : f.etichetta).toLowerCase();
        // la regola non lo prende nemmeno da sola, perche' le regole gli danno
        // un'etichetta che lei esclude: e' quello che fa
        const esclusoDalleRegole = m => {
          const ha = dalleRegole.get(m.id) || [];
          return !!escluse[attesa] && ha.indexOf(attesa) < 0 && ha.some(e => escluse[attesa].has(e));
        };
        const delFiltro = cerca(ricercaDelFiltro(f.criteri), casella);
        // un mittente del filtro di cui le regole escluse prendono tutti i
        // messaggi: per lui il filtro non lo sostituisce nessuno
        const interi = new Set();
        mittentiDelFiltro(f.criteri).forEach(t => {
          const suoi = delFiltro.filter(m => vale({ tipo: 'parola', campo: 'from', valore: t }, m, ''));
          if (suoi.length && suoi.every(esclusoDalleRegole)) suoi.forEach(m => interi.add(m.id));
        });
        delFiltro.forEach(m => {
          messaggiControllati++;
          const ha = [...m.etichette].map(e => e.toLowerCase());
          if (esclusoDalleRegole(m) && !interi.has(m.id)) { eccezioni++; return; }
          const manca = [];
          if (ha.indexOf(attesa) < 0) manca.push('senza l\'etichetta ' + attesa);
          if (f.archivia && m.inArrivo) manca.push('non archiviato');
          if (f.letti && !m.letto) manca.push('non segnato come letto');
          if (manca.length) {
            problemi.push(modo + ': il filtro ' + i + ' (' + f.etichetta + ' ' + JSON.stringify(f.criteri) +
                          (f.regola ? ', regola ' + f.regola : ', senza regola') + ') e\' tolto, e ' + m.da + ' e\' ' +
                          manca.join(', ') + ' [etichette: ' + [...m.etichette].join(', ') + ']');
          }
        });
      });
    }
  } catch (e) {
    problemi.push('lo script si ferma: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e));
  }
  if (problemi.length) {
    rotti++;
    console.log('SCENARIO ' + scenario.nome + ': PROMESSA ROTTA');
    problemi.slice(0, 6).forEach(p => console.log('    ' + p));
    if (raccontati < 5 && scenario.racconto) {
      raccontati++;
      console.log(scenario.racconto.replace(/\r\n/g, '\n').trimEnd().replace(/^/gm, '      | '));
    }
  }
}
console.log('Scenari: ' + scenari + '; filtri tolti da EXTRA_togliFiltri: ' + filtriTolti + ' (' + controllati +
            ' controllati: gli altri sono "Toglilo" senza regola, scelto apposta); messaggi controllati: ' +
            messaggiControllati + ' (' + eccezioni + ' che la regola non prende nemmeno da sola: le regole gli danno ' +
            'un\'etichetta che lei esclude); scenari che rompono ' +
            'la promessa: ' + rotti);
process.exit(rotti ? 1 : 0);
