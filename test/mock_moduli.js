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

  class Foglio {
    constructor(nome, cartella) {
      this.id = id('foglio'); this.nome = nome;
      this.schede = [{ nome: 'Foglio1', righe: 0, modulo: null }];      // quella vuota che Google crea sempre
      m.fogli.set(this.id, this);
      new File(nome, FOGLI_GOOGLE, cartella || m.radice, this.id);
    }
    getId() { return this.id; }
    getUrl() { return 'https://docs.example/spreadsheets/d/' + this.id; }
    getSheets() { return this.schede.map(s => ({ getLastRow: () => s.righe, getName: () => s.nome })); }
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
        this.risposte.push({});
        if (this.destinazione) this.destinazione.scheda.righe++;
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
      const scheda = { nome: 'Risposte del modulo ' + foglio.schede.length, righe: 1 + this.risposte.length, modulo: this.id };
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
        const t = { funzione };
        const orologio = {
          at() { throw new Error('at(data) dipende dal fuso dell\'editor: serve atDate + inTimezone'); },
          atDate(anno, mese, giorno) { t.anno = anno; t.mese = mese; t.giorno = giorno; return orologio; },
          inTimezone(fuso) { t.fuso = fuso; return orologio; },
          create() { m.trigger.push(t); return t; }
        };
        return { timeBased: () => orologio };
      },
      getProjectTriggers: () => m.trigger.map(t => ({ getHandlerFunction: () => t.funzione, _rif: t })),
      deleteTrigger(t) { const i = m.trigger.indexOf(t._rif); if (i >= 0) m.trigger.splice(i, 1); }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (m.proprieta.has(k) ? m.proprieta.get(k) : null),
        setProperty: (k, v) => { m.proprieta.set(k, v); }
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
}

titolo('ANNO NUOVO CON LA SPUNTA, ma il foglio vecchio non ha piu\' tutte le righe');
{
  const m = nuovoMondo({ adesso: '2026-09-19T10:00:00+02:00' });
  m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m, { config: { svuotaRisposte: true } });
  c.MODULO_2_prepara();
  const primo = m.form.destinazione.foglio;
  m.form.rispondi(6);
  primo.schede[1].righe = 3;                                   // qualcuno ha cancellato delle righe dal foglio
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

// ---- 10. il menu dentro il modulo -----------------------------------------------------------------
titolo('IL MENU');
{
  const m = nuovoMondo({ risposteUi: ['NO', 'YES'] });
  m.cartella('A.S. 2026-27/RECUPERI');
  const c = carica(m);
  c.onOpen();
  verifica('menu "Campanella" con tre voci', m.menu && m.menu.nome === 'Campanella' && m.menu.voci.length === 3);
  verifica('ogni voce chiama una funzione che esiste', m.menu.voci.every(v => typeof c[v.funzione] === 'function'));
  c.MODULO_menu_prepara();
  verifica('risposta No: non fa niente', m.fogliCreati === 0 && m.avvisi.length === 1);
  c.MODULO_menu_prepara();
  verifica('risposta Si\': prepara', m.fogliCreati === 1 && m.form.destinazione !== null);
  const ultimo = m.avvisi[m.avvisi.length - 1];
  verifica('il messaggio finale arriva a lavoro fatto, non a meta\'', ultimo.collegamentiFinoAQui === 1 && ultimo.testo.indexOf('FATTO') >= 0);
  verifica('la conferma mostra anno e nome del foglio', m.avvisi[1].testo.indexOf('2026-27') >= 0 &&
    m.avvisi[1].testo.indexOf('Risposte Recuperi - A.S. 2026-27') >= 0);

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
