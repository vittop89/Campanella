/**
 * Banco di prova per Moduli.gs
 *
 *   node test/mock_moduli.js                 il motore, con tante configurazioni
 *   node test/mock_moduli.js Moduli_prova.gs uno script generato da Campanella
 *
 * Simula FormApp, SpreadsheetApp, DriveApp, ScriptApp, PropertiesService,
 * LockService e Utilities, con un Drive finto, un modulo finto e un orologio
 * finto (le prove non devono dipendere dal giorno in cui girano). Il modulo
 * finto si comporta come quello vero nei punti che contano: le risposte
 * restano nel modulo, collegare un foglio gli aggiunge una scheda con TUTTE le
 * risposte che il modulo ha gia', getDestinationId() senza destinazione lancia
 * un errore, un modulo non pubblicato non si puo' riaprire.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const radice = path.join(__dirname, '..');
const motore = fs.readFileSync(path.join(radice, 'src', 'risorse', 'Moduli.gs'), 'utf8').replace(/\r\n/g, '\n');

const INIZIO_CONFIG = '// >>> CONFIGURAZIONE >>>';
const FINE_CONFIG = '// <<< CONFIGURAZIONE <<<';
const INIZIO_DRIVE = '// [DRIVE >>>';
const FINE_DRIVE = '// <<< DRIVE]';
const FOGLI_GOOGLE = 'application/vnd.google-apps.spreadsheet';

// ---------------------------------------------------------------------------
//  IL MONDO FINTO
// ---------------------------------------------------------------------------
function nuovoMondo(opzioni) {
  opzioni = opzioni || {};
  const m = {
    adesso: new Date(opzioni.adesso || '2026-09-19T10:00:00+02:00').getTime(),
    prossimoId: 1,
    cartelleCreate: 0,
    fogliCreati: 0,
    collegamenti: 0,
    trigger: [],
    proprieta: new Map(),
    registro: [],
    avvisi: [],
    risposteUi: opzioni.risposteUi || [],
    menu: null,
    lockOccupato: false,
    permessiMancanti: false,
    spostamentoRotto: false,
    collegamentoRottoPerVolte: 0,
    pause: 0,
    tutte: [],                                        // ogni risposta mai data, per contare quelle perse
    fogli: new Map(),
    file: new Map()
  };
  const id = prefisso => prefisso + (m.prossimoId++);

  class Iteratore {
    constructor(elenco) { this.elenco = elenco.slice(); this.i = 0; }
    hasNext() { return this.i < this.elenco.length; }
    next() { return this.elenco[this.i++]; }
  }

  class Cartella {
    constructor(nome, genitore) {
      this.id = id('cartella'); this.nome = nome; this.genitore = genitore || null;
      this.cestino = false; this.creata = new Date(m.adesso + m.prossimoId);
      this.cartelle = []; this.files = [];
    }
    getId() { return this.id; }
    getName() { return this.nome; }
    isTrashed() { return this.cestino; }
    getDateCreated() { return this.creata; }
    getUrl() { return 'https://drive.example/' + this.id; }
    // come Drive: anche quello che sta nel cestino ha ancora il suo genitore
    getFoldersByName(nome) { return new Iteratore(this.cartelle.filter(c => c.nome === nome)); }
    getFilesByName(nome) { return new Iteratore(this.files.filter(f => f.nome === nome)); }
    createFolder(nome) { m.cartelleCreate++; return this.aggiungi(nome); }
    aggiungi(nome) { const c = new Cartella(nome, this); this.cartelle.push(c); return c; }
    percorso() { return (this.genitore ? this.genitore.percorso() + '/' : '') + this.nome; }
  }

  class File {
    constructor(nome, mime, cartella, idFisso) {
      this.id = idFisso || id('file'); this.nome = nome; this.mime = mime; this.cartella = cartella;
      this.cestino = false; this.creato = new Date(m.adesso + m.prossimoId);
      cartella.files.push(this); m.file.set(this.id, this);
    }
    getId() { return this.id; }
    getName() { return this.nome; }
    getMimeType() { return this.mime; }
    isTrashed() { return this.cestino; }
    getDateCreated() { return this.creato; }
    getParents() { return new Iteratore([this.cartella]); }
    moveTo(destinazione) {
      if (m.spostamentoRotto) throw new Error('Service error: Drive');
      this.cartella.files.splice(this.cartella.files.indexOf(this), 1);
      this.cartella = destinazione; destinazione.files.push(this);
    }
  }

  /**
   * Una scheda del foglio: la prima colonna delle risposte e' il momento in cui
   * sono arrivate. Google lo scrive al secondo (qui arrotondato, il caso piu'
   * scomodo: una risposta delle 10:00:00,700 diventa 10:00:01).
   */
  class Scheda {
    constructor(nome) { this.nome = nome; this.intestazione = false; this.tempi = []; this.modulo = null; }
    get righe() { return (this.intestazione ? 1 : 0) + this.tempi.length; }
    aggiungi(risposta) { this.tempi.push(Math.round(risposta.tempo / 1000) * 1000); }
  }

  class Foglio {
    constructor(nome, cartella) {
      this.id = id('foglio'); this.nome = nome;
      this.schede = [new Scheda('Foglio1')];                            // quella vuota che Google crea sempre
      m.fogli.set(this.id, this);
      new File(nome, FOGLI_GOOGLE, cartella || m.radice, this.id);
    }
    getId() { return this.id; }
    getUrl() { return 'https://docs.example/spreadsheets/d/' + this.id; }
    getSheets() {
      return this.schede.map(s => ({
        getLastRow: () => s.righe,
        getLastColumn: () => (s.righe > 0 ? 1 : 0),
        getName: () => s.nome,
        getRange(r, c, nr, nc) {
          return {
            getValues() {
              const fuori = [];
              for (let i = 0; i < nr; i++) {
                const riga = [];
                for (let k = 0; k < nc; k++) {
                  const n = r + i - (s.intestazione ? 2 : 1);      // l'indice nei tempi
                  if (c + k !== 1) riga.push('');
                  else if (s.intestazione && r + i === 1) riga.push('Informazioni cronologiche');
                  else riga.push(n >= 0 && n < s.tempi.length ? new Date(s.tempi[n]) : '');
                }
                fuori.push(riga);
              }
              return fuori;
            }
          };
        }
      }));
    }
    righeDiRisposte() { return Math.max(0, ...this.schede.map(s => s.righe - 1)); }
  }

  class Modulo {
    constructor(titolo) {
      this.id = id('modulo'); this.titolo = titolo; this.risposte = [];
      this.destinazione = null; this.aperto = true; this.pubblicato = true; this.conPubblicazione = true;
    }
    getId() { return this.id; }
    getTitle() { return this.titolo; }
    getResponses() { return this.risposte.slice(); }
    rispondi(n) {
      if (!this.aperto) throw new Error('il modulo e\' chiuso');
      for (let i = 0; i < n; i++) {
        // ogni risposta ha il suo momento, con i millesimi (Google Moduli li tiene)
        m.risposteDate = (m.risposteDate || 0) + 1;
        const tempo = m.adesso + m.risposteDate * 1000 + (m.risposteDate * 337) % 1000;
        const risposta = { tempo, getTimestamp: () => new Date(tempo) };
        this.risposte.push(risposta); m.tutte.push(risposta);
        if (this.destinazione) this.destinazione.scheda.aggiungi(risposta);
      }
    }
    getDestinationType() {
      if (!this.destinazione) throw new Error('The form currently has no response destination.');
      return 'SPREADSHEET';
    }
    getDestinationId() {
      if (!this.destinazione) throw new Error('The form currently has no response destination.');
      return this.destinazione.foglio.id;
    }
    setDestination(tipo, idFoglio) {
      if (m.collegamentoRottoPerVolte > 0) { m.collegamentoRottoPerVolte--; throw new Error('Failed to set response destination.'); }
      if (tipo !== 'SPREADSHEET') throw new Error('tipo di destinazione sbagliato');
      const foglio = m.fogli.get(idFoglio);
      if (!foglio) throw new Error('Invalid destination id');
      m.collegamenti++;
      if (this.destinazione) this.destinazione.scheda.modulo = null;
      // Google aggiunge una scheda nuova e ci ricopia tutte le risposte che il modulo ha gia'
      const scheda = new Scheda('Risposte del modulo ' + foglio.schede.length);
      scheda.intestazione = true; scheda.modulo = this.id;
      for (const risposta of this.risposte) scheda.aggiungi(risposta);
      foglio.schede.push(scheda);
      this.destinazione = { foglio, scheda };
    }
    removeDestination() { if (this.destinazione) { this.destinazione.scheda.modulo = null; this.destinazione = null; } }
    deleteAllResponses() { this.risposte = []; }                       // le righe nei fogli restano
    isAcceptingResponses() { return this.aperto; }
    setAcceptingResponses(si) {
      if (si && !this.pubblicato) throw new Error('Cannot accept responses on an unpublished form.');
      this.aperto = si;
    }
    supportsAdvancedResponderPermissions() { return this.conPubblicazione; }
    isPublished() {
      if (!this.conPubblicazione) throw new Error('This form does not support publishing.');
      return this.pubblicato;
    }
  }

  m.radice = new Cartella('Il mio Drive', null);
  m.form = new Modulo(opzioni.titolo || 'Recuperi');
  m.Cartella = Cartella; m.File = File; m.Foglio = Foglio; m.Modulo = Modulo;

  /** Un foglio di un anno passato con n righe di risposte, arrivate piu' di un anno fa. */
  m.foglioVecchio = function (nome, percorso, n) {
    const f = new Foglio(nome, m.cartella(percorso));
    const s = new Scheda('Risposte del modulo 1');
    s.intestazione = true;
    for (let i = 0; i < n; i++) s.tempi.push(m.adesso - 400 * 24 * 3600 * 1000 + i * 60000);
    f.schede.push(s);
    return f;
  };

  /** Le risposte date che non stanno piu' da nessuna parte: ne' nel modulo, ne' in un foglio. */
  m.perse = function () {
    const righe = new Map();
    for (const f of m.fogli.values()) for (const s of f.schede) for (const t of s.tempi) righe.set(t, (righe.get(t) || 0) + 1);
    let n = 0;
    for (const r of m.tutte) {
      if (m.form.risposte.indexOf(r) >= 0) continue;
      const t = Math.round(r.tempo / 1000) * 1000;
      if (righe.get(t) > 0) righe.set(t, righe.get(t) - 1); else n++;
    }
    return n;
  };

  /** Le cartelle che il PC ha gia' caricato: 'A.S. 2026-27/RECUPERI'. */
  m.cartella = function (percorso) {
    let c = m.radice;
    for (const nome of percorso.split('/')) {
      c = c.cartelle.find(x => x.nome === nome && !x.cestino) || c.aggiungi(nome);
    }
    return c;
  };

  const VeraData = Date;
  class FintaData extends VeraData {
    constructor(...a) { if (a.length === 0) super(m.adesso); else super(...a); }
    static now() { return m.adesso; }
  }

  const ui = {
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
    Button: { YES: 'YES', NO: 'NO', OK: 'OK' },
    alert(titolo, testo, bottoni) {
      m.avvisi.push({ titolo, testo, bottoni, collegamentiFinoAQui: m.collegamenti });
      return bottoni === 'YES_NO' ? (m.risposteUi.shift() || 'NO') : 'OK';
    },
    createMenu(nome) {
      const menu = { nome, voci: [] };
      const costruttore = {
        addItem(etichetta, funzione) { menu.voci.push({ etichetta, funzione }); return costruttore; },
        addSeparator() { return costruttore; },
        addToUi() { m.menu = menu; }
      };
      return costruttore;
    }
  };

  m.sandbox = {
    Date: FintaData,
    JSON, Math, Object, String, Array, RegExp, Error, parseInt, isNaN,
    Logger: { log: t => m.registro.push(String(t)) },
    MimeType: { GOOGLE_SHEETS: FOGLI_GOOGLE },
    FormApp: {
      DestinationType: { SPREADSHEET: 'SPREADSHEET' },
      getActiveForm: () => (opzioni.senzaModulo ? null : m.form),
      getUi: () => ui,
      openById: () => { throw new Error('openById non deve servire: chiederebbe il permesso su tutti i moduli'); }
    },
    SpreadsheetApp: {
      create(nome) { m.fogliCreati++; return new Foglio(nome); },
      openById(idFoglio) {
        const f = m.fogli.get(idFoglio);
        if (!f) throw new Error('Foglio non trovato');
        return f;
      }
    },
    DriveApp: {
      getRootFolder: () => m.radice,
      getFileById(idFile) {
        const f = m.file.get(idFile);
        if (!f) throw new Error('File non trovato');
        return f;
      }
    },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' },
      AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' },
      requireAllScopes() { m.permessiChiesti = (m.permessiChiesti || 0) + 1; },
      getAuthorizationInfo: () => ({
        getAuthorizationStatus: () => (m.permessiMancanti ? 'REQUIRED' : 'NOT_REQUIRED')
      }),
      newTrigger(funzione) {
        const t = { funzione, uid: 'trigger-' + (m.prossimoId++) };
        const orologio = {
          at() { throw new Error('at(data) dipende dal fuso dell\'editor: serve atDate + inTimezone'); },
          atDate(anno, mese, giorno) { t.anno = anno; t.mese = mese; t.giorno = giorno; return orologio; },
          after(ms) { t.dopo = ms; return orologio; },
          inTimezone(fuso) { t.fuso = fuso; return orologio; },
          create() { m.trigger.push(t); return t; }
        };
        return { timeBased: () => orologio };
      },
      getProjectTriggers: () => m.trigger.map(t => ({ getHandlerFunction: () => t.funzione, getUniqueId: () => t.uid, _rif: t })),
      deleteTrigger(t) { const i = m.trigger.indexOf(t._rif); if (i >= 0) m.trigger.splice(i, 1); }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (m.proprieta.has(k) ? m.proprieta.get(k) : null),
        setProperty: (k, v) => {
          // come quelle vere: un valore sta in circa 9 KB, oltre Google rifiuta di salvarlo
          if (Buffer.byteLength(String(v), 'utf8') > 9 * 1024) throw new Error('Argument too large: value');
          m.proprieta.set(k, String(v));
        }
      })
    },
    LockService: { getUserLock: () => ({ tryLock: () => !m.lockOccupato, releaseLock() {} }) },
    Utilities: {
      sleep() { m.pause++; },
      formatDate(data, fuso, formato) {
        if (formato !== 'yyyy-MM-dd') throw new Error('formato non previsto dal banco di prova: ' + formato);
        return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' })
          .format(data);
      }
    }
  };
  return m;
}

const CONFIG_BASE = {
  anno: 'auto', cartellaAnno: 'A.S. {anno}', cartellaFoglio: 'RECUPERI',
  nomeFoglio: 'Risposte Recuperi - A.S. {anno}', chiusura: '31/08',
  riapri: true, svuotaRisposte: false, fusoOrario: 'Europe/Rome', usaDrive: true
};

function conConfig(testo, config) {
  const a = testo.indexOf(INIZIO_CONFIG), b = testo.indexOf(FINE_CONFIG);
  if (a < 0 || b < a) throw new Error('manca il blocco della configurazione');
  return testo.slice(0, a) + INIZIO_CONFIG + '\nvar MODULO = ' + JSON.stringify(config, null, 2) + ';\n' +
         testo.slice(b);
}

function senzaDrive(testo) {
  const a = testo.indexOf(INIZIO_DRIVE), b = testo.indexOf(FINE_DRIVE);
  if (a < 0 || b < a) throw new Error('manca il blocco di Drive');
  return testo.slice(0, a) + testo.slice(b + FINE_DRIVE.length);
}

/** Carica lo script in un mondo. opzioni: { config, senzaDrive, codice } */
function carica(mondo, opzioni) {
  opzioni = opzioni || {};
  let codice = opzioni.codice || conConfig(motore, Object.assign({}, CONFIG_BASE, opzioni.config || {}));
  if (opzioni.senzaDrive) {
    codice = senzaDrive(codice);
    delete mondo.sandbox.DriveApp;                    // se lo nomina ancora, qui esplode
    delete mondo.sandbox.MimeType;
  }
  const contesto = vm.createContext(mondo.sandbox);
  vm.runInContext(codice, contesto, { filename: 'Moduli.gs' });
  return contesto;
}

// ---------------------------------------------------------------------------
//  PROVE
// ---------------------------------------------------------------------------
let fallite = 0, fatte = 0;
function titolo(t) { console.log('\n' + '='.repeat(72) + '\n  ' + t + '\n' + '='.repeat(72)); }
function verifica(testo, ok) {
  fatte++;
  if (ok) console.log('  OK   ' + testo);
  else { console.log('  FALLITO   ' + testo); fallite++; }
}
function lancia(f) { try { f(); return ''; } catch (e) { return String(e.message || e); } }
const memoria = m => JSON.parse(m.proprieta.get('CAMPANELLA_MODULO') || '{"fogli":{}}');

// ---- uno script generato da Campanella, passato sulla riga di comando ----------
if (process.argv[2]) {
  const generato = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
  const usaDrive = generato.indexOf('DriveApp') >= 0;
  titolo('SCRIPT GENERATO: ' + path.basename(process.argv[2]) + (usaDrive ? '  (con Drive)' : '  (senza Drive)'));
  const m = nuovoMondo();
  if (usaDrive) m.cartella('A.S. 2026-27/RECUPERI');
  if (!usaDrive) { delete m.sandbox.DriveApp; delete m.sandbox.MimeType; }
  const c = carica(m, { codice: generato });
  verifica('la configurazione c\'e\' ed e\' completa',
    ['anno', 'cartellaAnno', 'cartellaFoglio', 'nomeFoglio', 'chiusura', 'riapri', 'svuotaRisposte', 'fusoOrario', 'usaDrive']
      .every(k => Object.prototype.hasOwnProperty.call(c.MODULO, k)));
  verifica('usaDrive dice la verita\' sul codice', c.MODULO.usaDrive === usaDrive);
  verifica('nessun servizio in piu\' (posta, rete, calendario)',
    !/GmailApp|MailApp|UrlFetchApp|CalendarApp|DocumentApp/.test(generato));
  const anteprima = c.MODULO_1_anteprima();
  verifica('l\'anteprima non tocca niente', m.fogliCreati === 0 && m.trigger.length === 0 && m.collegamenti === 0);
  verifica('l\'anteprima dice la versione dello script', /Script: Campanella \d+\.\d+\.\d+ /.test(anteprima));
  verifica('l\'anteprima nomina il foglio', anteprima.indexOf(c.MODULO.nomeFoglio.replace('{anno}', '2026-27')) >= 0 ||
    c.MODULO.anno !== 'auto');
  c.MODULO_2_prepara(); c.MODULO_2_prepara();
  verifica('due esecuzioni: un foglio solo, un collegamento solo, una chiusura sola',
    m.fogliCreati === 1 && m.collegamenti === 1 && m.trigger.length <= 1);
  verifica('il modulo scrive nel foglio creato', m.form.destinazione && m.fogli.has(m.form.destinazione.foglio.id));
  console.log(fallite === 0 ? '\n  Tutte le prove superate.' : '\n  PROVE FALLITE: ' + fallite);
  process.exit(fallite === 0 ? 0 : 1);
}

// ---- 0. il testo del motore -------------------------------------------------------
titolo('IL TESTO DEL MOTORE');
{
  const fuori = senzaDrive(motore);
  verifica('fuori dal blocco di Drive il codice non nomina DriveApp (commenti compresi)', fuori.indexOf('DriveApp') < 0);
  verifica('dentro il blocco di Drive lo usa', motore.indexOf('DriveApp.getRootFolder') > motore.indexOf(INIZIO_DRIVE));
  verifica('nessun servizio in piu\': niente posta, niente rete, niente calendario',
    !/GmailApp|MailApp|UrlFetchApp|CalendarApp|DocumentApp/.test(motore));
  verifica('non apre moduli per id (chiederebbe il permesso su tutti i moduli)', motore.indexOf('FormApp.openById') < 0);
  verifica('le righe che Campanella sostituisce nella versione senza Drive ci sono',
    motore.indexOf(' *    - lo mette nella cartella dell\'anno, dentro "Il mio Drive";\n') > 0 &&
    motore.indexOf(' *    Drive ........ trovare o creare la cartella dell\'anno e metterci il foglio\n') > 0);
}

// ---- 1. anteprima -----------------------------------------------------------------
titolo('ANTEPRIMA SU UN DRIVE VUOTO: non deve toccare niente');
{
  const m = nuovoMondo();
  const c = carica(m);
  const t = c.MODULO_1_anteprima();
  verifica('dice l\'anno giusto (19 settembre 2026 -> 2026-27)', t.indexOf('2026-27') >= 0);
  const versione = /var _MODULO_VERSIONE\s*=\s*'([^']+)'/.exec(motore)[1];
  verifica('dice la versione dello script (' + versione + '), per sapere se va reincollato',
    t.indexOf('Script: Campanella ' + versione + ' ') >= 0);
  verifica('dice che le cartelle sono da creare', t.indexOf('da creare: Il mio Drive / A.S. 2026-27') >= 0 &&
    t.indexOf('da creare: Il mio Drive / A.S. 2026-27 / RECUPERI') >= 0);
  verifica('nessuna cartella, nessun foglio, nessun collegamento, nessuna chiusura, niente ricordato',
    m.cartelleCreate === 0 && m.fogliCreati === 0 && m.collegamenti === 0 && m.trigger.length === 0 &&
    m.proprieta.size === 0);
  verifica('il risultato finisce anche nel registro di esecuzione', m.registro.length === 1 && m.registro[0] === t);
}

// ---- 2. prepara, con le cartelle gia' caricate dal PC -----------------------------
titolo('PREPARA, con le cartelle dell\'anno gia\' caricate dal PC');
{
  const m = nuovoMondo();
  const recuperi = m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m);
  const t = c.MODULO_2_prepara();
  verifica('usa le cartelle che ci sono: non ne crea', m.cartelleCreate === 0);
  verifica('crea un foglio con il nome dell\'anno', m.fogliCreati === 1 &&
    recuperi.files.length === 1 && recuperi.files[0].nome === 'Risposte Recuperi - A.S. 2026-27');
  verifica('il foglio non resta nella radice', m.radice.files.length === 0);
  verifica('il modulo scrive nel foglio nuovo', m.form.destinazione && m.form.destinazione.foglio.id === recuperi.files[0].id);
  verifica('una chiusura sola, di MODULO_chiusura', m.trigger.length === 1 && m.trigger[0].funzione === 'MODULO_chiusura');
  verifica('scatta alla mezzanotte che chiude il 31/08/2027, ora italiana',
    m.trigger[0].anno === 2027 && m.trigger[0].mese === 9 && m.trigger[0].giorno === 1 && m.trigger[0].fuso === 'Europe/Rome');
  verifica('ricorda il foglio dell\'anno e il modulo', memoria(m).fogli['2026-27'] === recuperi.files[0].id &&
    memoria(m).modulo === m.form.id);
  verifica('chiede a Google di controllare i permessi prima di programmare', m.permessiChiesti >= 1);
  verifica('il resoconto dice dove sta il foglio', t.indexOf('https://docs.example/spreadsheets/d/') >= 0 && t.indexOf('FATTO') >= 0);

  c.MODULO_2_prepara();
  const foglio = m.fogli.get(recuperi.files[0].id);
  verifica('rieseguito: nessun secondo foglio', m.fogliCreati === 1 && recuperi.files.length === 1);
  verifica('rieseguito: nessun secondo collegamento (niente scheda doppia)', m.collegamenti === 1 && foglio.schede.length === 2);
  verifica('rieseguito: la chiusura resta una', m.trigger.length === 1);
}

// ---- 3. cartelle mancanti, foglio gia' esistente, cestino, doppioni ---------------
titolo('CARTELLE: le crea se mancano, ignora il cestino, segnala i doppioni');
{
  const m = nuovoMondo();
  const c = carica(m);
  const t = c.MODULO_2_prepara();
  verifica('su un Drive vuoto crea anno e sottocartella', m.cartelleCreate === 2 && t.indexOf('creata:') >= 0);
  verifica('e ci mette il foglio', m.cartella('A.S. 2026-27/RECUPERI').files.length === 1);

  const m2 = nuovoMondo();
  const vecchio = new m2.Foglio('Risposte Recuperi - A.S. 2026-27', m2.cartella('A.S. 2026-27/RECUPERI'));
  const c2 = carica(m2);
  const t2 = c2.MODULO_2_prepara();
  verifica('un foglio con quel nome c\'e\' gia\' (per esempio dal vecchio script): usa quello',
    m2.fogliCreati === 0 && m2.form.destinazione.foglio.id === vecchio.id && t2.indexOf('senza doppioni') >= 0);

  const m3 = nuovoMondo();
  const buttata = m3.radice.aggiungi('A.S. 2026-27'); buttata.cestino = true;
  buttata.aggiungi('RECUPERI');
  const buona = m3.cartella('A.S. 2026-27');
  const prima = buona.aggiungi('RECUPERI');
  buona.aggiungi('RECUPERI');
  const c3 = carica(m3);
  const t3 = c3.MODULO_2_prepara();
  verifica('la cartella nel cestino non conta', buttata.cartelle[0].files.length === 0);
  verifica('due cartelle con lo stesso nome: usa la piu\' vecchia e lo dice', prima.files.length === 1 && t3.indexOf('ATTENZIONE') >= 0);

  const m4 = nuovoMondo();
  const c4 = carica(m4, { config: { cartellaFoglio: 'RECUPERI\\TRIMESTRE/1A' } });
  c4.MODULO_2_prepara();
  verifica('sottocartelle con barra o barra rovescia', m4.cartella('A.S. 2026-27/RECUPERI/TRIMESTRE/1A').files.length === 1);

  const m5 = nuovoMondo();
  const c5 = carica(m5, { config: { cartellaFoglio: '' } });
  c5.MODULO_2_prepara();
  verifica('cartella vuota = direttamente nella cartella dell\'anno', m5.cartella('A.S. 2026-27').files.length === 1);
}

// ---- 4. le risposte vecchie ---------------------------------------------------------
titolo('RISPOSTE GIA\' NEL MODULO: senza spunta restano, e Google le ricopia');
{
  const m = nuovoMondo();
  m.cartella('A.S. 2026-27/RECUPERI');
  m.form.rispondi(5);
  const c = carica(m);
  const anteprima = c.MODULO_1_anteprima();
  verifica('l\'anteprima dice quante sono', anteprima.indexOf('Risposte gia\' nel modulo: 5') >= 0);
  const t = c.MODULO_2_prepara();
  verifica('non cancella niente', m.form.risposte.length === 5);
  verifica('nel foglio nuovo ci sono anche quelle (come fa Google)', m.form.destinazione.foglio.righeDiRisposte() === 5);
  verifica('e il resoconto lo spiega', t.indexOf('ce le ricopia') >= 0);
}

titolo('RISPOSTE GIA\' NEL MODULO: con la spunta, ma senza un foglio che le contenga');
{
  const m = nuovoMondo();
  m.cartella('A.S. 2026-27/RECUPERI');
  m.form.rispondi(3);
  const c = carica(m, { config: { svuotaRisposte: true } });
  const t = c.MODULO_2_prepara();
  verifica('NON le toglie: sarebbe una cancellazione vera', m.form.risposte.length === 3 && t.indexOf('NON le tolgo') >= 0);
  verifica('collega lo stesso il foglio', m.form.destinazione !== null);
}

// ---- 5. due anni di fila -------------------------------------------------------------
titolo('DUE ANNI DI FILA: prepara, risposte, chiusura, anno nuovo con la spunta');
{
  const m = nuovoMondo({ adesso: '2026-09-19T10:00:00+02:00' });
  m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m, { config: { svuotaRisposte: true } });
  c.MODULO_2_prepara();
  const primo = m.form.destinazione.foglio;
  m.form.rispondi(4);
  verifica('anno 1: le risposte arrivano nel foglio dell\'anno', primo.righeDiRisposte() === 4);

  m.adesso = new Date('2027-09-01T00:05:00+02:00').getTime();
  const chiusura = c.MODULO_chiusura();
  verifica('chiusura: il modulo non accetta piu\' risposte', m.form.aperto === false);
  verifica('chiusura: foglio scollegato, con le sue 4 righe', m.form.destinazione === null && primo.righeDiRisposte() === 4);
  verifica('chiusura: le risposte restano nel modulo', m.form.risposte.length === 4);
  verifica('chiusura: il trigger scattato viene tolto dall\'elenco', m.trigger.length === 0);
  verifica('chiusura: lo racconta', chiusura.indexOf('CHIUSURA DI FINE ANNO') >= 0);

  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  const anteprima = c.MODULO_1_anteprima();
  verifica('anno 2, anteprima: passa da solo al 2027-28 e non tocca niente',
    anteprima.indexOf('2027-28') >= 0 && m.form.risposte.length === 4 && m.fogliCreati === 1);
  verifica('anno 2, anteprima: annuncia che le toglierebbe', anteprima.indexOf('verrebbero tolte') >= 0);
  const t = c.MODULO_2_prepara();
  const secondo = m.form.destinazione.foglio;
  verifica('anno 2: cartella dell\'anno nuovo creata', m.cartella('A.S. 2027-28/RECUPERI').files.length === 1);
  verifica('anno 2: foglio nuovo, diverso dal primo', secondo.id !== primo.id && secondo.nome === 'Risposte Recuperi - A.S. 2027-28');
  verifica('anno 2: le 4 risposte vecchie tolte dal modulo solo perche\' stanno nel foglio vecchio',
    m.form.risposte.length === 0 && primo.righeDiRisposte() === 4 && t.indexOf('tolte dal modulo') >= 0);
  verifica('anno 2: il foglio nuovo comincia vuoto', secondo.righeDiRisposte() === 0);
  verifica('anno 2: il modulo riapre', m.form.aperto === true);
  verifica('anno 2: chiusura programmata per la fine del 31/08/2028',
    m.trigger.length === 1 && m.trigger[0].anno === 2028 && m.trigger[0].mese === 9 && m.trigger[0].giorno === 1);
  verifica('ricorda tutti e due gli anni', Object.keys(memoria(m).fogli).length === 2);
  verifica('nessuna risposta persa', m.perse() === 0);
}

titolo('SVUOTARE: DOPO "ANNULLA" ARRIVANO 10 RISPOSTE SOLO NEL MODULO');
{
  const m = nuovoMondo({ adesso: '2026-09-19T10:00:00+02:00' });
  m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m, { config: { svuotaRisposte: true } });
  c.MODULO_2_prepara();
  const primo = m.form.destinazione.foglio;
  m.form.rispondi(200);
  m.adesso = new Date('2027-09-01T00:05:00+02:00').getTime();
  c.MODULO_chiusura();
  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  c.MODULO_2_prepara();
  verifica('(anno 2: le 200 dell\'anno prima tolte dal modulo, stanno nel loro foglio)',
    m.form.risposte.length === 0 && primo.righeDiRisposte() === 200);
  const secondo = m.form.destinazione.foglio;
  m.form.rispondi(50);
  c.MODULO_ANNULLA();
  m.form.rispondi(10);                                         // aperto, ma non scrive in nessun foglio
  const t = c.MODULO_2_prepara();
  verifica('60 risposte, 10 in nessun foglio: NON le toglie, anche se il foglio vecchio ha 200 righe',
    m.form.risposte.length === 60 && t.indexOf('NON le tolgo') >= 0);
  verifica('e il foglio dell\'anno, ricollegato, le riceve tutte',
    m.form.destinazione.foglio.id === secondo.id && secondo.righeDiRisposte() === 60);
  verifica('nessuna risposta persa', m.perse() === 0);
}

titolo('SVUOTARE: LA CHIUSURA DI FINE ANNO NON RIESCE');
{
  const m = nuovoMondo({ adesso: '2026-09-19T10:00:00+02:00' });
  m.cartella('A.S. 2026-27/RECUPERI');
  // l'anno prima il modulo scriveva in un foglio con 200 righe
  const vecchio = m.foglioVecchio('Risposte Recuperi - A.S. 2025-26', 'A.S. 2025-26/RECUPERI', 200);
  m.proprieta.set('CAMPANELLA_MODULO', JSON.stringify({ modulo: m.form.id, fogli: { '2025-26': vecchio.id } }));
  const c = carica(m, { config: { svuotaRisposte: true } });
  c.MODULO_2_prepara();
  const primo = m.form.destinazione.foglio;
  m.form.rispondi(40);
  const vera = m.form.setAcceptingResponses;
  m.form.setAcceptingResponses = function (si) {
    if (!si) throw new Error('Service error: Forms');              // anche al secondo tentativo
    return vera.call(this, si);
  };
  m.adesso = new Date('2027-09-01T00:05:00+02:00').getTime();
  const scattato = m.trigger[0];
  const tc = c.MODULO_chiusura({ triggerUid: scattato.uid });
  verifica('chiusura non riuscita: il modulo resta collegato al foglio dell\'anno',
    m.form.destinazione !== null && m.form.destinazione.foglio.id === primo.id && tc.indexOf('Riprovo fra un\'ora') >= 0);
  verifica('il trigger scattato se ne va, e al suo posto c\'e\' un tentativo fra un\'ora',
    m.trigger.length === 1 && m.trigger[0] !== scattato && m.trigger[0].dopo === 60 * 60 * 1000);
  m.form.rispondi(7);
  verifica('le risposte arrivate dopo finiscono nel foglio', primo.righeDiRisposte() === 47);
  m.form.setAcceptingResponses = vera;
  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  c.MODULO_2_prepara();
  verifica('anno 2: nessuna risposta persa (stanno tutte nel foglio del primo anno)',
    m.perse() === 0 && primo.righeDiRisposte() === 47);

  // com'erano lasciate le cose dallo script di prima: chiusura fallita, foglio scollegato lo stesso
  const v = nuovoMondo({ adesso: '2026-09-19T10:00:00+02:00' });
  v.cartella('A.S. 2026-27/RECUPERI');
  const vv = v.foglioVecchio('Risposte Recuperi - A.S. 2025-26', 'A.S. 2025-26/RECUPERI', 200);
  v.proprieta.set('CAMPANELLA_MODULO', JSON.stringify({ modulo: v.form.id, fogli: { '2025-26': vv.id } }));
  const cv = carica(v, { config: { svuotaRisposte: true } });
  cv.MODULO_2_prepara();
  v.form.rispondi(40);
  v.form.removeDestination();                                     // scollegato, ma ancora aperto
  v.form.rispondi(7);                                             // queste stanno solo nel modulo
  v.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  const tv = cv.MODULO_2_prepara();
  verifica('47 risposte, 7 solo nel modulo: NON le toglie, anche se il foglio di due anni fa ha 200 righe',
    v.form.risposte.length === 47 && tv.indexOf('NON le tolgo: 7 non le ritrovo') >= 0);
  verifica('nessuna risposta persa', v.perse() === 0);
}

titolo('ANNO NUOVO CON LA SPUNTA, ma il foglio vecchio non ha piu\' tutte le righe');
{
  const m = nuovoMondo({ adesso: '2026-09-19T10:00:00+02:00' });
  m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m, { config: { svuotaRisposte: true } });
  c.MODULO_2_prepara();
  const primo = m.form.destinazione.foglio;
  m.form.rispondi(6);
  primo.schede[1].tempi.splice(2);                             // qualcuno ha cancellato delle righe dal foglio
  m.adesso = new Date('2027-09-01T00:05:00+02:00').getTime();
  c.MODULO_chiusura();
  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  const t = c.MODULO_2_prepara();
  verifica('il foglio vecchio ha 2 righe, il modulo 6 risposte: NON le toglie',
    m.form.risposte.length === 6 && t.indexOf('NON le tolgo') >= 0);
  verifica('l\'anno nuovo parte lo stesso', m.form.destinazione.foglio.id !== primo.id && m.form.aperto === true);
}

// ---- 6. senza Drive ---------------------------------------------------------------------
titolo('SENZA DRIVE: niente DriveApp nel codice, foglio nella radice, niente doppioni');
{
  const m = nuovoMondo();
  const c = carica(m, { senzaDrive: true, config: { usaDrive: false } });
  const t = c.MODULO_2_prepara();
  verifica('gira senza che DriveApp esista', m.fogliCreati === 1);
  verifica('il foglio nasce nella radice e lo dice', m.radice.files.length === 1 && t.indexOf('spostalo tu') >= 0);
  verifica('nessuna cartella creata', m.cartelleCreate === 0);
  c.MODULO_2_prepara();
  verifica('rieseguito: lo riconosce da quello che ricorda, non ne crea un altro', m.fogliCreati === 1 && m.collegamenti === 1);
  verifica('collegamento e chiusura come sempre', m.form.destinazione !== null && m.trigger.length === 1);
}

// ---- 7. annulla ---------------------------------------------------------------------------
titolo('ANNULLA: toglie chiusura e collegamento, non cancella niente');
{
  const m = nuovoMondo();
  const recuperi = m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m);
  c.MODULO_2_prepara();
  m.form.rispondi(2);
  const t = c.MODULO_ANNULLA();
  verifica('chiusura tolta', m.trigger.length === 0);
  verifica('foglio scollegato', m.form.destinazione === null);
  verifica('il foglio e le cartelle restano, con le risposte', recuperi.files.length === 1 && !recuperi.files[0].cestino &&
    m.fogli.get(recuperi.files[0].id).righeDiRisposte() === 2);
  verifica('le risposte restano anche nel modulo', m.form.risposte.length === 2);
  verifica('lo dice', t.indexOf('Non ho cancellato niente') >= 0);

  const m2 = nuovoMondo();
  m2.cartella('A.S. 2026-27/RECUPERI');
  const altro = new m2.Foglio('Foglio mio');
  m2.form.setDestination('SPREADSHEET', altro.id);
  const c2 = carica(m2);
  const t2 = c2.MODULO_ANNULLA();
  verifica('un foglio collegato da te, non dallo script, non lo tocca', m2.form.destinazione !== null && t2.indexOf('non lo tocco') >= 0);
}

// ---- 8. l'anno e la chiusura -----------------------------------------------------------------
titolo('ANNO E GIORNO DI CHIUSURA');
{
  const m = nuovoMondo();
  const c = carica(m);
  verifica('31 agosto -> ancora l\'anno vecchio', c._moduloAnno('2026-08-31') === '2025-26');
  verifica('1 settembre -> anno nuovo', c._moduloAnno('2026-09-01') === '2026-27');
  verifica('gennaio -> stesso anno scolastico', c._moduloAnno('2027-01-10') === '2026-27');
  verifica('cambio di secolo: 2099-00', c._moduloAnno('2099-10-01') === '2099-00');

  const notte = nuovoMondo({ adesso: '2026-08-31T22:30:00Z' });     // in Italia e' gia' il primo settembre
  verifica('l\'anno si calcola con l\'ora italiana, non con quella dell\'editor', carica(notte)._moduloAnno() === '2026-27');

  const sbagliato = nuovoMondo();
  const e1 = lancia(() => carica(sbagliato, { config: { anno: '2026-28' } }).MODULO_1_anteprima());
  verifica('anno scritto male: si ferma e spiega', e1.indexOf('2026-27') >= 0 && sbagliato.fogliCreati === 0);
  const e2 = lancia(() => carica(nuovoMondo(), { config: { chiusura: '31/02' } }).MODULO_2_prepara());
  verifica('31/02 non esiste: si ferma', e2.indexOf('non esiste') >= 0);
  const e3 = lancia(() => carica(nuovoMondo(), { config: { chiusura: 'fine agosto' } }).MODULO_1_anteprima());
  verifica('chiusura scritta a parole: si ferma e dice come scriverla', e3.indexOf('giorno/mese') >= 0);
  const bisestile = nuovoMondo({ adesso: '2027-09-10T10:00:00+02:00' });   // 2027-28: febbraio 2028 ha il 29
  const e4 = lancia(() => carica(bisestile, { config: { chiusura: '29/02' } }).MODULO_2_prepara());
  verifica('29/02 anche in un anno bisestile: si ferma prima di toccare niente, come Campanella',
    e4.indexOf('non c\'e\' tutti gli anni') >= 0 && bisestile.fogliCreati === 0 && bisestile.trigger.length === 0);

  const senza = nuovoMondo();
  const t = carica(senza, { config: { chiusura: '' } }).MODULO_2_prepara();
  verifica('chiusura vuota: nessun trigger, e lo dice', senza.trigger.length === 0 && t.indexOf('non richiesta') >= 0);

  const passato = nuovoMondo();
  const t2 = carica(passato, { config: { anno: '2025-26' } }).MODULO_2_prepara();
  verifica('anno fisso gia\' finito: la chiusura non viene programmata', passato.trigger.length === 0 && t2.indexOf('gia\' passato') >= 0);

  const giugno = nuovoMondo();
  carica(giugno, { config: { chiusura: '30/06' } }).MODULO_2_prepara();
  verifica('30/06 del 2026-27 scatta il primo luglio 2027',
    giugno.trigger[0].anno === 2027 && giugno.trigger[0].mese === 7 && giugno.trigger[0].giorno === 1);
  const dicembre = nuovoMondo();
  carica(dicembre, { config: { chiusura: '31/12' } }).MODULO_2_prepara();
  verifica('31/12 del 2026-27 e\' nel 2026, e scatta il primo gennaio 2027',
    dicembre.trigger[0].anno === 2027 && dicembre.trigger[0].mese === 1 && dicembre.trigger[0].giorno === 1);
}

// ---- 9. moduli non pubblicati, permessi, lock, errori di Google ---------------------------------
titolo('CASI STORTI');
{
  const m = nuovoMondo();
  m.cartella('A.S. 2026-27/RECUPERI');
  m.form.aperto = false; m.form.pubblicato = false;
  const t = carica(m).MODULO_2_prepara();
  verifica('modulo non pubblicato: non lo pubblica e non si rompe', m.form.aperto === false && t.indexOf('non e\' pubblicato') >= 0);
  verifica('ma il foglio lo collega', m.form.destinazione !== null);

  const vecchio = nuovoMondo();
  vecchio.form.aperto = false; vecchio.form.conPubblicazione = false;
  carica(vecchio).MODULO_2_prepara();
  verifica('modulo vecchio stile (senza pubblicazione): lo riapre', vecchio.form.aperto === true);

  const p = nuovoMondo();
  p.permessiMancanti = true;
  const tp = carica(p).MODULO_2_prepara();
  verifica('permessi concessi a meta\': non fa niente e dice perche\'',
    p.fogliCreati === 0 && p.trigger.length === 0 && tp.indexOf('MANCA QUALCHE PERMESSO') >= 0);

  const l = nuovoMondo();
  l.lockOccupato = true;
  const tl = carica(l).MODULO_2_prepara();
  verifica('un\'altra esecuzione in corso: aspetta', l.fogliCreati === 0 && tl.indexOf('ancora in corso') >= 0);

  const s = nuovoMondo();
  s.cartella('A.S. 2026-27/RECUPERI');
  s.spostamentoRotto = true;
  const cs = carica(s);
  const ts = cs.MODULO_2_prepara();
  verifica('lo spostamento fallisce: il foglio resta nella radice ma viene collegato lo stesso',
    s.radice.files.length === 1 && s.form.destinazione !== null && ts.indexOf('NON sono riuscito') >= 0);
  cs.MODULO_2_prepara();
  verifica('e rieseguendo non nasce un secondo foglio', s.fogliCreati === 1);

  const r = nuovoMondo();
  r.cartella('A.S. 2026-27/RECUPERI');
  r.collegamentoRottoPerVolte = 1;
  carica(r).MODULO_2_prepara();
  verifica('il collegamento fallisce una volta: riprova e ci riesce', r.form.destinazione !== null && r.pause === 1);

  const fuori = nuovoMondo({ senzaModulo: true });
  const ef = lancia(() => carica(fuori).MODULO_1_anteprima());
  verifica('incollato fuori da un modulo: lo dice chiaro', ef.indexOf('DENTRO il modulo') >= 0);

  const copia = nuovoMondo();
  copia.proprieta.set('CAMPANELLA_MODULO', JSON.stringify({ modulo: 'modulo-originale', fogli: { '2026-27': 'foglio-di-un-altro' } }));
  const cc = carica(copia);
  verifica('copia di un modulo: non eredita i fogli dell\'originale', Object.keys(cc._moduloMemoria(copia.form).fogli).length === 0);
  copia.proprieta.set('CAMPANELLA_MODULO', '{rotto');
  verifica('memoria illeggibile: riparte da zero senza rompersi', Object.keys(cc._moduloMemoria(copia.form).fogli).length === 0);
}

// ---- 9b. passare il comando al foglio di controllo ------------------------------------
titolo('PASSARE IL COMANDO AL FOGLIO DI CONTROLLO');
{
  const m = nuovoMondo();
  const recuperi = m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m);
  c.MODULO_2_prepara();
  const foglio = m.form.destinazione.foglio;
  const t = c.MODULO_PASSA_AL_FOGLIO();
  verifica('toglie la chiusura programmata da qui', m.trigger.length === 0);
  verifica('ma NON scollega il foglio', m.form.destinazione !== null && m.form.destinazione.foglio.id === foglio.id);
  verifica('non tocca il modulo', m.form.aperto === true && m.form.risposte.length === 0);
  verifica('non crea e non cancella fogli', m.fogliCreati === 1 && recuperi.files.length === 1);
  verifica('spiega cosa fare nel foglio di controllo', t.indexOf('STESSA cartella') > 0 && t.indexOf('STESSO nome') > 0);
  verifica('rieseguito non si lamenta', c.MODULO_PASSA_AL_FOGLIO().indexOf('non ce n\'era') > 0);
  c.MODULO_2_prepara();
  verifica('e da qui si puo\' riprendere il comando', m.trigger.length === 1 && m.fogliCreati === 1);
}

// ---- 9c. rieseguito a meta' anno ---------------------------------------------------------------
titolo('PREPARA RIESEGUITO A META\' ANNO: quello che e\' successo dopo resta');
{
  const m = nuovoMondo();
  m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m);
  c.MODULO_2_prepara();
  m.form.aperto = false;                                          // chiuso a mano, da Google Moduli
  const t = c.MODULO_2_prepara();
  verifica('un modulo chiuso a mano non viene riaperto, e lo dice',
    m.form.aperto === false && t.indexOf('l\'ha chiuso qualcuno') >= 0);

  // la chiusura del 30/06 e' scattata; a luglio si riesegue
  const g = nuovoMondo();
  g.cartella('A.S. 2026-27/RECUPERI');
  const cg = carica(g, { config: { chiusura: '30/06' } });
  cg.MODULO_2_prepara();
  const suo = g.form.destinazione.foglio;
  g.form.rispondi(3);
  g.adesso = new Date('2027-07-01T00:05:00+02:00').getTime();
  cg.MODULO_chiusura({ triggerUid: g.trigger[0].uid });
  verifica('(chiuso e scollegato dalla sua chiusura)', g.form.aperto === false && g.form.destinazione === null);
  g.adesso = new Date('2027-07-05T09:00:00+02:00').getTime();
  const schede = suo.schede.length;
  const tg = cg.MODULO_2_prepara();
  verifica('chiusura gia\' scattata: non lo ricollega (niente scheda con le risposte doppie)',
    g.form.destinazione === null && suo.schede.length === schede);
  verifica('e non lo riapre, e dice perche\'', g.form.aperto === false && tg.indexOf('e\' finito il 30/06/2027') >= 0);
  const tg2 = carica(g, { config: { chiusura: '31/07' } }).MODULO_2_prepara();
  verifica('anche se intanto il giorno di chiusura e\' stato spostato',
    g.form.aperto === false && g.form.destinazione === null && tg2.indexOf('gia\' scattata') >= 0);
  g.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  cg.MODULO_2_prepara();
  verifica('l\'anno dopo si riapre, con un foglio nuovo', g.form.aperto === true && g.form.destinazione.foglio.id !== suo.id);

  // scollegato a mano durante l'anno
  const s = nuovoMondo();
  s.cartella('A.S. 2026-27/RECUPERI');
  const cs = carica(s);
  cs.MODULO_2_prepara();
  const suoS = s.form.destinazione.foglio;
  s.form.rispondi(3);
  s.form.removeDestination();
  const schedeS = suoS.schede.length;
  const ts = cs.MODULO_2_prepara();
  verifica('scollegato a mano: non lo ricollega (Google ricopierebbe le risposte), e lo dice',
    s.form.destinazione === null && suoS.schede.length === schedeS && ts.indexOf('Non lo ricollego') >= 0);
  cs.MODULO_ANNULLA();
  s.form.aperto = false;
  cs.MODULO_2_prepara();
  verifica('dopo Annulla si prepara da capo: ricollega e riapre',
    s.form.destinazione !== null && s.form.destinazione.foglio.id === suoS.id && s.form.aperto === true);

  // una riapertura che non riesce: la volta dopo ci riprova
  const r = nuovoMondo();
  r.cartella('A.S. 2026-27/RECUPERI');
  r.form.aperto = false;
  const vera = r.form.setAcceptingResponses;
  r.form.setAcceptingResponses = function () { throw new Error('Service error: Forms'); };
  const cr = carica(r);
  cr.MODULO_2_prepara();
  r.form.setAcceptingResponses = vera;
  cr.MODULO_2_prepara();
  verifica('riapertura non riuscita: la volta dopo lo riapre', r.form.aperto === true);

  // memoria di una versione di prima (solo i fogli): foglio gia' usato, modulo chiuso
  const v = nuovoMondo();
  v.cartella('A.S. 2026-27/RECUPERI');
  const cv = carica(v);
  cv.MODULO_2_prepara();
  v.proprieta.set('CAMPANELLA_MODULO', JSON.stringify({ modulo: v.form.id, fogli: memoria(v).fogli }));
  v.form.aperto = false;
  const tv = cv.MODULO_2_prepara();
  verifica('memoria di prima, foglio gia\' usato: non lo riapre, senza dare la colpa a nessuno',
    v.form.aperto === false && tv.indexOf('versione di prima') >= 0 && tv.indexOf('l\'ha chiuso qualcuno') < 0);

  // memoria di prima, con un foglio mai collegato (una preparazione rotta a meta')
  const w = nuovoMondo();
  const cartella = w.cartella('A.S. 2026-27/RECUPERI');
  w.form.aperto = false;
  const intatto = new w.Foglio('Risposte Recuperi - A.S. 2026-27', cartella);
  w.proprieta.set('CAMPANELLA_MODULO', JSON.stringify({ modulo: w.form.id, fogli: { '2026-27': intatto.id } }));
  carica(w).MODULO_2_prepara();
  verifica('memoria di prima, foglio mai collegato: lo collega e riapre il modulo',
    w.form.destinazione !== null && w.form.destinazione.foglio.id === intatto.id && w.form.aperto === true);
}

// ---- 9d. la chiusura --------------------------------------------------------------------------
titolo('LA CHIUSURA: LOCK, TENTATIVI, MEMORIA');
{
  const m = nuovoMondo();
  m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m);
  c.MODULO_2_prepara();
  const scattato = m.trigger[0];
  m.adesso = new Date('2027-09-01T00:05:00+02:00').getTime();
  m.lockOccupato = true;                                          // "Prepara l'anno nuovo" sta lavorando
  const t = c.MODULO_chiusura({ triggerUid: scattato.uid });
  verifica('lock occupato: adesso non tocca niente', m.form.aperto === true && m.form.destinazione !== null &&
    t.indexOf('riprovo fra un\'ora') >= 0);
  verifica('e al posto del trigger scattato ce n\'e\' uno fra un\'ora',
    m.trigger.length === 1 && m.trigger[0] !== scattato && m.trigger[0].dopo === 60 * 60 * 1000);
  m.lockOccupato = false;
  m.adesso += 60 * 60 * 1000;
  c.MODULO_chiusura({ triggerUid: m.trigger[0].uid });
  verifica('al tentativo dopo chiude, e non resta nessun trigger', m.form.aperto === false && m.trigger.length === 0);
  verifica('la chiusura resta segnata per il suo anno', memoria(m).chiusi['2026-27'] === '2027-08-31' && !memoria(m).scadenza);

  // Google continua a non chiudere il modulo: un giorno di tentativi
  const f = nuovoMondo();
  f.cartella('A.S. 2026-27/RECUPERI');
  const cf = carica(f);
  cf.MODULO_2_prepara();
  f.form.setAcceptingResponses = function () { throw new Error('Service error: Forms'); };
  f.adesso = new Date('2027-09-01T00:05:00+02:00').getTime();
  let uid = f.trigger[0].uid;
  for (let i = 0; i < 24; i++) {
    cf.MODULO_chiusura({ triggerUid: uid });
    uid = f.trigger[f.trigger.length - 1].uid;
    f.adesso += 60 * 60 * 1000;
  }
  verifica('24 chiusure fallite di fila: i trigger non si accumulano (ne resta uno)',
    f.trigger.length === 1 && f.trigger[0].dopo === 60 * 60 * 1000);
  verifica('e il modulo resta collegato al suo foglio', f.form.destinazione !== null);

  // un tentativo rimasto indietro, dopo che l'anno nuovo e' gia' stato preparato
  const n = nuovoMondo();
  n.cartella('A.S. 2026-27/RECUPERI');
  const cn = carica(n);
  cn.MODULO_2_prepara();
  n.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  cn.MODULO_2_prepara();                                          // il 2027-28, chiusura il 31/08/2028
  const tn = cn.MODULO_chiusura();
  verifica('prima della sua scadenza non chiude niente', n.form.aperto === true && n.form.destinazione !== null &&
    tn.indexOf('oggi non chiudo niente') >= 0 && n.trigger.length === 1);

  // il trigger puo' scattare qualche minuto prima della mezzanotte
  const q = nuovoMondo();
  q.cartella('A.S. 2026-27/RECUPERI');
  const cq = carica(q);
  cq.MODULO_2_prepara();
  q.adesso = new Date('2027-08-31T23:50:00+02:00').getTime();
  cq.MODULO_chiusura({ triggerUid: q.trigger[0].uid });
  verifica('scattato alle 23:50 del giorno di chiusura: chiude lo stesso', q.form.aperto === false && q.form.destinazione === null);

  // una chiusura programmata da una versione di prima: in memoria non c'e' la scadenza
  const o = nuovoMondo();
  o.cartella('A.S. 2026-27/RECUPERI');
  const co = carica(o);
  co.MODULO_2_prepara();
  o.proprieta.set('CAMPANELLA_MODULO', JSON.stringify({ modulo: o.form.id, fogli: memoria(o).fogli }));
  o.adesso = new Date('2027-09-01T00:05:00+02:00').getTime();
  co.MODULO_chiusura();
  verifica('chiusura di una versione di prima: chiude, e si segna l\'anno giusto',
    o.form.aperto === false && memoria(o).chiusi['2026-27'] === '2027-08-31');
}

// ---- 9e. tanti anni di fila ---------------------------------------------------------------------
titolo('TRENT\'ANNI DI FILA: LA MEMORIA RESTA SOTTO IL TETTO DI GOOGLE');
{
  const m = nuovoMondo({ adesso: '2026-09-02T10:00:00+02:00' });
  const c = carica(m);
  let errori = 0;
  for (let a = 2026; a < 2056; a++) {
    m.adesso = new Date(a + '-09-02T10:00:00+02:00').getTime();
    if (c.MODULO_2_prepara().indexOf('FATTO') < 0) errori++;
    m.form.rispondi(2);
    m.adesso = new Date((a + 1) + '-09-01T00:05:00+02:00').getTime();
    c.MODULO_chiusura({ triggerUid: m.trigger[0] && m.trigger[0].uid });
  }
  const piuLunga = Math.max(...[...m.proprieta.values()].map(v => Buffer.byteLength(v, 'utf8')));
  verifica('trenta preparazioni e trenta chiusure, tutte a buon fine', errori === 0 && m.fogliCreati === 30);
  verifica('la memoria piu\' lunga sta sotto i 9 KB (' + piuLunga + ' byte)', piuLunga < 9 * 1024);
}

// ---- 10. il menu dentro il modulo -----------------------------------------------------------------
titolo('IL MENU');
{
  const m = nuovoMondo({ risposteUi: ['NO', 'YES'] });
  m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m);
  c.onOpen();
  verifica("menu Campanella con quattro voci", m.menu && m.menu.nome === "Campanella" && m.menu.voci.length === 4);
  verifica('ogni voce chiama una funzione che esiste', m.menu.voci.every(v => typeof c[v.funzione] === 'function'));
  c.MODULO_menu_prepara();
  verifica('risposta No: non fa niente', m.fogliCreati === 0 && m.avvisi.length === 1);
  c.MODULO_menu_prepara();
  verifica('risposta Si\': prepara', m.fogliCreati === 1 && m.form.destinazione !== null);
  const ultimo = m.avvisi[m.avvisi.length - 1];
  verifica('il messaggio finale arriva a lavoro fatto, non a meta\'', ultimo.collegamentiFinoAQui === 1 && ultimo.testo.indexOf('FATTO') >= 0);
  verifica('la conferma mostra anno e nome del foglio', m.avvisi[1].testo.indexOf('2026-27') >= 0 &&
    m.avvisi[1].testo.indexOf('Risposte Recuperi - A.S. 2026-27') >= 0);

  verifica('senza svuotare la conferma dice che non cancella niente', m.avvisi[0].testo.indexOf('Non cancello niente') >= 0);
  const sv = nuovoMondo({ risposteUi: ['NO'] });
  carica(sv, { config: { svuotaRisposte: true } }).MODULO_menu_prepara();
  verifica('con svuotaRisposte la conferma dice che le risposte vecchie le toglie, e non "Non cancello niente"',
    sv.avvisi[0].testo.indexOf('Non cancello niente') < 0 && sv.avvisi[0].testo.indexOf('non si puo\' annullare') >= 0);

  const rotto = nuovoMondo({ risposteUi: ['YES'] });
  const cr = carica(rotto, { config: { chiusura: 'boh' } });
  cr.MODULO_menu_prepara();
  verifica('un errore dal menu diventa un messaggio, non una finestra rossa',
    rotto.avvisi[rotto.avvisi.length - 1].testo.indexOf('Non ho potuto procedere') >= 0);
}

// ---------------------------------------------------------------------------
titolo('RISULTATO');
console.log(fallite === 0 ? '  Tutte le prove superate.  (' + fatte + ')' : '  PROVE FALLITE: ' + fallite + ' su ' + fatte);
process.exit(fallite === 0 ? 0 : 1);
