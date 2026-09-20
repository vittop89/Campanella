/**
 * Banco di prova per Pannello.gs
 *
 *   node test/mock_pannello.js                  il motore, con varie configurazioni
 *   node test/mock_pannello.js Pannello_prova.gs uno script generato da Campanella
 *
 * Simula un foglio Google (schede, celle, caselle di spunta), i moduli, il
 * Drive, i trigger e l'orologio. Il foglio finto si comporta come quello vero
 * nei punti che contano: getLastRow() guarda le celle piene, getRange accetta
 * una cella sola o un blocco, le spunte sono booleani. I moduli finti sono
 * quelli di mock_moduli.js: collegare un foglio ci ricopia tutte le risposte
 * che il modulo ha ancora, getDestinationId() senza destinazione lancia un
 * errore, un modulo non pubblicato non si riapre.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const radice = path.join(__dirname, '..');
const motore = fs.readFileSync(path.join(radice, 'src', 'risorse', 'Pannello.gs'), 'utf8').replace(/\r\n/g, '\n');
const INIZIO_CONFIG = '// >>> CONFIGURAZIONE >>>';
const FINE_CONFIG = '// <<< CONFIGURAZIONE <<<';
const FOGLI_GOOGLE = 'application/vnd.google-apps.spreadsheet';
const MODULI_GOOGLE = 'application/vnd.google-apps.form';

const CONFIG_BASE = {
  anno: 'auto',
  cartellaAnno: 'A.S. {anno}',
  chiusura: '31/08',
  fusoOrario: 'Europe/Rome',
  scheda: 'Moduli',
  moduli: [
    { modulo: 'Recuperi', cartella: 'RECUPERI', foglio: 'Risposte Recuperi - A.S. {anno}', chiusura: '31/08', svuota: false },
    { modulo: 'Uscite', cartella: '', foglio: 'Risposte Uscite - A.S. {anno}', chiusura: '30/06', svuota: false }
  ]
};

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
    senzaInterfaccia: !!opzioni.senzaInterfaccia,
    permessiMancanti: false,
    lockOccupato: false,
    menu: null,
    moduli: new Map(),
    fogli: new Map(),
    file: new Map()
  };
  const id = p => p + (m.prossimoId++) + 'xxxxxxxxxxxxxxxxxxxxxx';

  class Iteratore {
    constructor(e) { this.e = e.slice(); this.i = 0; }
    hasNext() { return this.i < this.e.length; }
    next() { return this.e[this.i++]; }
  }

  class Cartella {
    constructor(nome, genitore) {
      this.id = id('cart'); this.nome = nome; this.genitore = genitore || null;
      this.cestino = false; this.creata = new Date(m.adesso + m.prossimoId);
      this.cartelle = []; this.files = [];
    }
    getId() { return this.id; }
    getName() { return this.nome; }
    isTrashed() { return this.cestino; }
    getDateCreated() { return this.creata; }
    getFoldersByName(n) { return new Iteratore(this.cartelle.filter(c => c.nome === n)); }
    getFilesByName(n) { return new Iteratore(this.files.filter(f => f.nome === n)); }
    createFolder(n) { m.cartelleCreate++; return this.aggiungi(n); }
    aggiungi(n) { const c = new Cartella(n, this); this.cartelle.push(c); return c; }
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
    getUrl() { return 'https://docs.example/' + (this.mime === MODULI_GOOGLE ? 'forms' : 'spreadsheets') + '/d/' + this.id + '/edit'; }
    isTrashed() { return this.cestino; }
    getDateCreated() { return this.creato; }
    getParents() { return new Iteratore([this.cartella]); }
    moveTo(d) {
      this.cartella.files.splice(this.cartella.files.indexOf(this), 1);
      this.cartella = d; d.files.push(this);
    }
  }

  // --- il foglio di calcolo ---------------------------------------------------
  class Scheda {
    constructor(nome) {
      this.nome = nome; this.celle = []; this.note = new Map();
      this.spunte = new Set(); this.formati = new Map(); this.congelate = 0;
    }
    getName() { return this.nome; }
    cella(r, c) {
      if (!this.celle[r]) this.celle[r] = [];
      return (this.celle[r][c] === undefined) ? '' : this.celle[r][c];
    }
    /**
     * Come il foglio vero: se la cella non e' impostata come testo, una stringa
     * del tipo "31/08" viene letta come una data e dentro ci finisce una data
     * vera, con l'anno di oggi. E' il motivo per cui la colonna della chiusura
     * va messa a testo PRIMA di scriverci dentro.
     */
    scrivi(r, c, v) {
      if (!this.celle[r]) this.celle[r] = [];
      if (typeof v === 'string' && this.formati.get(r + ',' + c) !== '@') {
        const g = /^(\d{1,2})\/(\d{1,2})$/.exec(v);
        if (g) v = new Date(new Date(m.adesso).getFullYear(), parseInt(g[2], 10) - 1, parseInt(g[1], 10));
      }
      this.celle[r][c] = v;
    }
    getLastRow() {
      let ultima = 0;
      for (let r = 0; r < this.celle.length; r++) {
        const riga = this.celle[r] || [];
        for (let c = 0; c < riga.length; c++) {
          if (riga[c] !== '' && riga[c] !== undefined && riga[c] !== null) { ultima = r + 1; break; }
        }
      }
      return ultima;
    }
    getMaxRows() { return Math.max(1000, this.getLastRow()); }
    setFrozenRows(n) { this.congelate = n; return this; }
    setColumnWidth() { return this; }
    getRange(r, c, nr, nc) {
      const scheda = this;
      const righe = (nr === undefined) ? 1 : nr;
      const colonne = (nc === undefined) ? 1 : nc;
      return {
        getValues() {
          const fuori = [];
          for (let i = 0; i < righe; i++) {
            const riga = [];
            for (let k = 0; k < colonne; k++) riga.push(scheda.cella(r - 1 + i, c - 1 + k));
            fuori.push(riga);
          }
          return fuori;
        },
        setValues(v) {
          if (v.length !== righe || v[0].length !== colonne) {
            throw new Error('setValues: blocco ' + v.length + 'x' + v[0].length + ' in un intervallo ' + righe + 'x' + colonne);
          }
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) scheda.scrivi(r - 1 + i, c - 1 + k, v[i][k]);
          return this;
        },
        setValue(v) { scheda.scrivi(r - 1, c - 1, v); return this; },
        getValue() { return scheda.cella(r - 1, c - 1); },
        setNote(t) { scheda.note.set((r - 1) + ',' + (c - 1), t); return this; },
        setFontWeight() { return this; },
        setNumberFormat(f) {
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) scheda.formati.set((r - 1 + i) + ',' + (c - 1 + k), f);
          return this;
        },
        insertCheckboxes() {
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) scheda.spunte.add((r - 1 + i) + ',' + (c - 1 + k));
          return this;
        }
      };
    }
  }

  class FoglioDiCalcolo {
    constructor(nome, cartella) {
      this.id = id('fogl'); this.nome = nome; this.schede = [new Scheda('Foglio1')];
      m.fogli.set(this.id, this);
      if (cartella !== null) new File(nome, FOGLI_GOOGLE, cartella || m.radice, this.id);
    }
    getId() { return this.id; }
    getUrl() { return 'https://docs.example/spreadsheets/d/' + this.id + '/edit'; }
    getSheets() { return this.schede; }
    getSheetByName(n) { return this.schede.find(s => s.nome === n) || null; }
    insertSheet(n) { const s = new Scheda(n); this.schede.push(s); return s; }
    /** le righe di risposte: la scheda piu' lunga, senza intestazione */
    righeDiRisposte() { return Math.max(0, ...this.schede.map(s => s.getLastRow() - 1)); }
  }

  class Modulo {
    constructor(titolo, cartella) {
      this.titolo = titolo; this.risposte = []; this.destinazione = null;
      this.aperto = true; this.pubblicato = true; this.conPubblicazione = true;
      this.file = new File(titolo, MODULI_GOOGLE, cartella || m.radice);
      this.id = this.file.id;
      m.moduli.set(this.id, this);
    }
    getId() { return this.id; }
    getTitle() { return this.titolo; }
    getUrl() { return this.file.getUrl(); }
    getResponses() { return this.risposte.slice(); }
    rispondi(n) {
      for (let i = 0; i < n; i++) {
        this.risposte.push({});
        if (this.destinazione) this.destinazione.scheda.scrivi(this.destinazione.scheda.getLastRow(), 0, 'risposta');
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
      const foglio = m.fogli.get(idFoglio);
      if (!foglio) throw new Error('Invalid destination id');
      m.collegamenti++;
      const scheda = foglio.insertSheet('Risposte del modulo ' + foglio.schede.length);
      scheda.scrivi(0, 0, 'Informazioni cronologiche');
      for (let i = 0; i < this.risposte.length; i++) scheda.scrivi(i + 1, 0, 'risposta');
      this.destinazione = { foglio, scheda };
    }
    removeDestination() { this.destinazione = null; }
    deleteAllResponses() { this.risposte = []; }
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
  m.Cartella = Cartella; m.File = File; m.Modulo = Modulo; m.FoglioDiCalcolo = FoglioDiCalcolo;
  m.pannello = new FoglioDiCalcolo('Campanella - Moduli', null);     // il foglio in cui gira lo script

  m.cartella = function (percorso) {
    let c = m.radice;
    for (const nome of percorso.split('/')) c = c.cartelle.find(x => x.nome === nome && !x.cestino) || c.aggiungi(nome);
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
      m.avvisi.push({ titolo, testo, bottoni });
      if (bottoni !== 'YES_NO') return 'OK';
      return m.risposteUi.length ? m.risposteUi.shift() : 'YES';   // di norma si conferma
    },
    createMenu(nome) {
      const menu = { nome, voci: [] };
      const c = {
        addItem(e, f) { menu.voci.push({ etichetta: e, funzione: f }); return c; },
        addSeparator() { return c; },
        addToUi() { m.menu = menu; }
      };
      return c;
    }
  };

  m.sandbox = {
    Date: FintaData,
    JSON, Math, Object, String, Array, RegExp, Error, parseInt, isNaN,
    Logger: { log: t => m.registro.push(String(t)) },
    MimeType: { GOOGLE_SHEETS: FOGLI_GOOGLE, GOOGLE_FORMS: MODULI_GOOGLE },
    FormApp: {
      DestinationType: { SPREADSHEET: 'SPREADSHEET' },
      openById(idModulo) {
        const f = m.moduli.get(idModulo);
        if (!f) throw new Error('Modulo non trovato: ' + idModulo);
        return f;
      },
      getActiveForm: () => { throw new Error('questo script non sta dentro un modulo'); }
    },
    SpreadsheetApp: {
      getActive: () => m.pannello,
      getUi: () => { if (m.senzaInterfaccia) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; },
      create(nome) { m.fogliCreati++; return new FoglioDiCalcolo(nome); },
      openById(idFoglio) {
        const f = m.fogli.get(idFoglio);
        if (!f) throw new Error('Foglio non trovato');
        return f;
      }
    },
    DriveApp: {
      getRootFolder: () => m.radice,
      getFileById(i) { const f = m.file.get(i); if (!f) throw new Error('File non trovato'); return f; },
      getFilesByName(n) { return new Iteratore([...m.file.values()].filter(f => f.nome === n)); }
    },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' },
      AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' },
      requireAllScopes() { m.permessiChiesti = (m.permessiChiesti || 0) + 1; },
      getAuthorizationInfo: () => ({ getAuthorizationStatus: () => (m.permessiMancanti ? 'REQUIRED' : 'NOT_REQUIRED') }),
      newTrigger(funzione) {
        const t = { funzione };
        const o = {
          at() { throw new Error('at(data) dipende dal fuso del progetto: serve atDate + inTimezone'); },
          atDate(a, me, g) { t.anno = a; t.mese = me; t.giorno = g; return o; },
          inTimezone(f) { t.fuso = f; return o; },
          create() { m.trigger.push(t); return t; }
        };
        return { timeBased: () => o };
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
      sleep() {},
      formatDate(data, fuso, formato) {
        const p = new Intl.DateTimeFormat('en-GB', {
          timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(data).reduce((a, x) => (a[x.type] = x.value, a), {});
        if (formato === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
        if (formato === 'dd/MM') return `${p.day}/${p.month}`;
        if (formato === 'dd/MM/yyyy HH:mm') return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
        throw new Error('formato non previsto dal banco di prova: ' + formato);
      }
    }
  };
  return m;
}

function conConfig(testo, config) {
  const a = testo.indexOf(INIZIO_CONFIG), b = testo.indexOf(FINE_CONFIG);
  if (a < 0 || b < a) throw new Error('manca il blocco della configurazione');
  return testo.slice(0, a) + INIZIO_CONFIG + '\nvar PANNELLO = ' + JSON.stringify(config, null, 2) + ';\n' + testo.slice(b);
}

function carica(mondo, opzioni) {
  opzioni = opzioni || {};
  const codice = opzioni.codice || conConfig(motore, Object.assign({}, CONFIG_BASE, opzioni.config || {}));
  const contesto = vm.createContext(mondo.sandbox);
  vm.runInContext(codice, contesto, { filename: 'Pannello.gs' });
  return contesto;
}

/** Legge la scheda del pannello come la vede l'utente. */
function scheda(m) {
  const s = m.pannello.getSheetByName('Moduli');
  if (!s) return null;
  const n = s.getLastRow();
  return (n < 2) ? [] : s.getRange(2, 1, n - 1, 10).getValues();
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

/** Prepara un mondo con il foglio pronto e due moduli veri nel Drive. */
function mondoPronto(opzioni) {
  const m = nuovoMondo(opzioni);
  m.recuperi = new m.Modulo('Recuperi', m.cartella('MODELLI'));
  m.uscite = new m.Modulo('Uscite', m.cartella('MODELLI'));
  const c = carica(m, opzioni);
  c.PANNELLO_1_preparaIlFoglio();
  c.PANNELLO_2_trovaIModuli();
  return { m, c };
}

// ---- 0. il testo -------------------------------------------------------------
titolo('IL TESTO DEL MOTORE');
{
  verifica('non nomina la posta, la rete o il calendario', !/GmailApp|MailApp|UrlFetchApp|CalendarApp/.test(motore));
  verifica('dice chiaro che chiede il permesso su tutti i moduli', motore.indexOf('su tutti i moduli') > 0);
  verifica('non usa getActiveForm (non sta dentro un modulo)', motore.indexOf('getActiveForm') < 0 || motore.indexOf('FormApp.getActiveForm()') < 0);
}

// ---- 1. il foglio ---------------------------------------------------------------
titolo('PREPARA IL FOGLIO');
{
  const m = nuovoMondo();
  const c = carica(m);
  const t = c.PANNELLO_1_preparaIlFoglio();
  const s = m.pannello.getSheetByName('Moduli');
  verifica('crea la scheda', s !== null);
  verifica('scrive le intestazioni', s.getRange(1, 1, 1, 10).getValues()[0][0] === 'Modulo' &&
    s.getRange(1, 1, 1, 10).getValues()[0][9] === 'Ultima esecuzione');
  verifica('congela la prima riga', s.congelate === 1);
  verifica('mette una nota su ogni colonna', s.note.size === 10);
  verifica('avverte del link giusto nella nota', s.note.get('0,1').indexOf('/edit') > 0);
  const righe = scheda(m);
  verifica('due righe di partenza, dai moduli che conosce', righe.length === 2 && righe[0][0] === 'Recuperi' && righe[1][0] === 'Uscite');
  verifica('cartella e nome del foglio proposti', righe[0][2] === 'RECUPERI' && righe[0][3] === 'Risposte Recuperi - A.S. {anno}');
  verifica('chiusure diverse per riga', righe[0][4] === '31/08' && righe[1][4] === '30/06');
  verifica('attivo spuntato, svuota no', righe[0][6] === true && righe[0][5] === false);
  verifica('le spunte sono caselle vere', s.spunte.has('1,5') && s.spunte.has('1,6'));
  verifica('lo dice all\'utente', t.indexOf('pronta') >= 0 && t.indexOf('Trova i moduli nel Drive') >= 0);

  c.PANNELLO_1_preparaIlFoglio();
  verifica('rieseguito non duplica le righe', scheda(m).length === 2);
  const s2 = m.pannello.getSheetByName('Moduli');
  s2.getRange(2, 1).setValue('Rinominato');
  c.PANNELLO_1_preparaIlFoglio();
  verifica('e non sovrascrive quello che hai scritto', scheda(m)[0][0] === 'Rinominato');
}

// ---- 1b. la chiusura non deve diventare una data ------------------------------------------
titolo('LA CHIUSURA RESTA GIORNO/MESE, NON DIVENTA UNA DATA');
{
  const m = nuovoMondo();
  const c = carica(m);
  c.PANNELLO_1_preparaIlFoglio();
  const s = m.pannello.getSheetByName('Moduli');
  verifica('la colonna e\' impostata come testo', s.formati.get('1,4') === '@');
  verifica('e dentro c\'e\' la stringa, non una data',
    typeof scheda(m)[0][4] === 'string' && scheda(m)[0][4] === '31/08');

}

// un foglio fatto con la versione vecchia: nella cella c'e' una data vera
{
  const v = mondoPronto();
  const sv = v.m.pannello.getSheetByName('Moduli');
  sv.formati.delete('1,4');
  sv.getRange(2, 5).setValue('31/08');                 // senza il formato testo diventa una data
  verifica('il banco di prova imita il foglio vero', typeof sv.getRange(2, 5).getValue() !== 'string');
  const t = v.c.PANNELLO_3_anteprima();
  verifica('l\'anteprima la capisce lo stesso',
    t.indexOf('31/08/2027') > 0 && t.indexOf('non e\' nella forma') < 0);
  v.c.PANNELLO_4_preparaAnno();
  verifica('e la chiusura viene programmata davvero', v.m.trigger.length === 2);
  v.c.PANNELLO_1_preparaIlFoglio();
  verifica('"Prepara il foglio" la rimette come testo', scheda(v.m)[0][4] === '31/08');
  verifica('e non tocca le altre colonne',
    scheda(v.m)[0][0] === 'Recuperi' && scheda(v.m)[0][3] === 'Risposte Recuperi - A.S. {anno}');
}

// ---- 2. trova i moduli ----------------------------------------------------------
titolo('TROVA I MODULI NEL DRIVE');
{
  const m = nuovoMondo();
  const recuperi = new m.Modulo('Recuperi', m.cartella('MODELLI'));
  const c = carica(m);
  c.PANNELLO_1_preparaIlFoglio();
  const t = c.PANNELLO_2_trovaIModuli();
  const righe = scheda(m);
  verifica('riempie il link del modulo che esiste', righe[0][1] === recuperi.getUrl());
  verifica('e dice quale non ha trovato', t.indexOf('Uscite: non lo trovo') >= 0);

  const doppio = nuovoMondo();
  new doppio.Modulo('Recuperi', doppio.cartella('MODELLI'));
  new doppio.Modulo('Recuperi', doppio.cartella('MODELLI 2024'));
  const c2 = carica(doppio);
  c2.PANNELLO_1_preparaIlFoglio();
  const t2 = c2.PANNELLO_2_trovaIModuli();
  verifica('due moduli con lo stesso nome: non sceglie a caso', scheda(doppio)[0][1] === '' && t2.indexOf('ce ne sono 2') >= 0);

  const cestinato = nuovoMondo();
  const vecchio = new cestinato.Modulo('Recuperi', cestinato.cartella('MODELLI'));
  vecchio.file.cestino = true;
  const buono = new cestinato.Modulo('Recuperi', cestinato.cartella('MODELLI'));
  const c3 = carica(cestinato);
  c3.PANNELLO_1_preparaIlFoglio();
  c3.PANNELLO_2_trovaIModuli();
  verifica('quello nel cestino non conta', scheda(cestinato)[0][1] === buono.getUrl());
}

// ---- 3. il link giusto e quello sbagliato ---------------------------------------
titolo('IL LINK DEL MODULO');
{
  const m = nuovoMondo();
  const c = carica(m);
  verifica('link dell\'editor', c._panIdModulo('https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit') === '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  verifica('id incollato da solo', c._panIdModulo('1AbCdEfGhIjKlMnOpQrStUvWxYz012345') === '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  verifica('link per chi risponde: rifiutato', c._panIdModulo('https://docs.google.com/forms/d/e/1FAIpQLSd1234567890abcdefghijklmn/viewform') === '');
  verifica('link corto di condivisione: rifiutato', c._panIdModulo('https://forms.gle/abc123') === '');
  verifica('vuoto', c._panIdModulo('') === '' && c._panIdModulo('   ') === '');

  const p = mondoPronto();
  p.m.pannello.getSheetByName('Moduli').getRange(3, 2).setValue('https://docs.google.com/forms/d/e/1FAIpQLSd1234567890abcdefghijklmn/viewform');
  const t = p.c.PANNELLO_3_anteprima();
  verifica('in anteprima lo spiega invece di fallire', t.indexOf('serve il modulo aperto per modificarlo') >= 0);
  verifica('e l\'altra riga viene preparata lo stesso', t.indexOf('foglio: da creare') >= 0);
}

// ---- 4. anteprima e preparazione -------------------------------------------------
titolo('ANTEPRIMA E PREPARAZIONE');
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  const t = c.PANNELLO_3_anteprima();
  verifica('l\'anteprima non tocca niente', m.fogliCreati === 0 && m.cartelleCreate === 0 && m.trigger.length === 0);
  verifica('elenca le due chiusure', t.indexOf('31/08/2027') >= 0 && t.indexOf('30/06/2027') >= 0);

  const tp = c.PANNELLO_4_preparaAnno();
  verifica('crea un foglio per modulo', m.fogliCreati === 2);
  verifica('il primo sta nella sua sottocartella', m.cartella('A.S. 2026-27/RECUPERI').files.length === 1);
  verifica('il secondo nella cartella dell\'anno', m.cartella('A.S. 2026-27').files.length === 1);
  verifica('i moduli sono collegati', m.recuperi.destinazione !== null && m.uscite.destinazione !== null);
  verifica('una chiusura per ogni data diversa', m.trigger.length === 2 && m.trigger.every(x => x.fuso === 'Europe/Rome'));
  verifica('scattano il giorno dopo quello indicato',
    m.trigger.some(x => x.anno === 2027 && x.mese === 9 && x.giorno === 1) &&
    m.trigger.some(x => x.anno === 2027 && x.mese === 7 && x.giorno === 1));
  const righe = scheda(m);
  verifica('scrive lo stato nelle righe', righe[0][7] === 'pronto per 2026-27' && righe[1][7] === 'pronto per 2026-27');
  verifica('scrive il link del foglio', righe[0][8].indexOf('https://docs.example/spreadsheets/') === 0);
  verifica('scrive quando', /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(righe[0][9]));
  verifica('il resoconto conta le righe', tp.indexOf('Righe preparate: 2') >= 0);

  c.PANNELLO_4_preparaAnno();
  verifica('rieseguito: nessun foglio in piu\'', m.fogliCreati === 2);
  verifica('rieseguito: nessun collegamento in piu\'', m.collegamenti === 2);
  verifica('rieseguito: le chiusure restano due', m.trigger.length === 2);
}

// ---- 5. righe spente, vuote, senza chiusura -------------------------------------
titolo('RIGHE SPENTE, VUOTE, SENZA CHIUSURA');
{
  const p = mondoPronto();
  const s = p.m.pannello.getSheetByName('Moduli');
  s.getRange(3, 7).setValue(false);                       // "Uscite" non attivo
  s.getRange(2, 5).setValue('');                          // "Recuperi" senza chiusura
  const t = p.c.PANNELLO_4_preparaAnno();
  verifica('la riga spenta viene saltata', p.m.fogliCreati === 1 && p.m.uscite.destinazione === null);
  verifica('senza chiusura non programma niente', p.m.trigger.length === 0 && t.indexOf('chiusura: non richiesta') >= 0);

  const vuoto = mondoPronto();
  const sv = vuoto.m.pannello.getSheetByName('Moduli');
  sv.getRange(2, 7).setValue(false);
  sv.getRange(3, 7).setValue(false);
  const tv = vuoto.c.PANNELLO_4_preparaAnno();
  verifica('nessuna riga attiva: lo dice e non fa niente', vuoto.m.fogliCreati === 0 && tv.indexOf('Nessuna riga attiva') >= 0);
}

// ---- 6. le risposte ------------------------------------------------------------------
titolo('LE RISPOSTE');
{
  const p = mondoPronto();
  p.m.recuperi.rispondi(4);
  const t = p.c.PANNELLO_4_preparaAnno();
  verifica('le risposte restano nel modulo', p.m.recuperi.risposte.length === 4);
  verifica('e Google le ricopia nel foglio nuovo', p.m.recuperi.destinazione.foglio.righeDiRisposte() === 4);
  verifica('lo spiega', t.indexOf('Google le ricopia nel foglio nuovo') >= 0);

  const sv = mondoPronto();
  sv.m.pannello.getSheetByName('Moduli').getRange(2, 6).setValue(true);     // svuota
  sv.m.recuperi.rispondi(3);
  const tsv = sv.c.PANNELLO_4_preparaAnno();
  verifica('con la spunta ma senza foglio vecchio: NON le toglie', sv.m.recuperi.risposte.length === 3 && tsv.indexOf('NON le tolgo') >= 0);
}

// ---- 7. due anni di fila --------------------------------------------------------------
titolo('DUE ANNI DI FILA');
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  m.pannello.getSheetByName('Moduli').getRange(2, 6).setValue(true);        // Recuperi: svuota
  c.PANNELLO_4_preparaAnno();
  const primo = m.recuperi.destinazione.foglio;
  m.recuperi.rispondi(5);
  verifica('anno 1: le risposte arrivano nel foglio', primo.righeDiRisposte() === 5);

  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  const tc = c.PANNELLO_chiusura();
  verifica('primo luglio: chiude solo "Uscite" (30/06)',
    m.uscite.aperto === false && m.uscite.destinazione === null && m.recuperi.aperto === true);
  verifica('e lo scrive nella sua riga', scheda(m)[1][7].indexOf('chiuso il 30/06/2027') === 0);
  verifica('la chiusura di "Recuperi" resta programmata', m.trigger.length === 2 && tc.indexOf('Chiusure fatte: 1') >= 0);

  m.adesso = new Date('2027-09-01T00:10:00+02:00').getTime();
  c.PANNELLO_chiusura();
  verifica('primo settembre: chiude anche "Recuperi"', m.recuperi.aperto === false && m.recuperi.destinazione === null);
  verifica('non resta nessuna chiusura in sospeso', m.trigger.length === 0);
  verifica('il foglio del primo anno tiene le sue righe', primo.righeDiRisposte() === 5);

  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  const t2 = c.PANNELLO_4_preparaAnno();
  verifica('anno 2: passa da solo al 2027-28', t2.indexOf('2027-28') >= 0);
  verifica('anno 2: fogli nuovi nella cartella nuova', m.cartella('A.S. 2027-28/RECUPERI').files.length === 1 && m.fogliCreati === 4);
  verifica('anno 2: le risposte vecchie tolte dal modulo (stanno nel foglio vecchio)', m.recuperi.risposte.length === 0);
  verifica('anno 2: il foglio nuovo comincia vuoto', m.recuperi.destinazione.foglio.righeDiRisposte() === 0);
  verifica('anno 2: i moduli riaprono', m.recuperi.aperto === true && m.uscite.aperto === true);
  verifica('anno 2: chiusure riprogrammate', m.trigger.length === 2 && m.trigger.some(x => x.anno === 2028));
}

// ---- 8. annulla ---------------------------------------------------------------------------
titolo('ANNULLA');
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  const foglio = p.m.recuperi.destinazione.foglio;
  const t = p.c.PANNELLO_ANNULLA();
  verifica('toglie le chiusure', p.m.trigger.length === 0);
  verifica('scollega i fogli', p.m.recuperi.destinazione === null && p.m.uscite.destinazione === null);
  verifica('i fogli restano nel Drive', p.m.cartella('A.S. 2026-27/RECUPERI').files.length === 1 && p.m.fogli.has(foglio.id));
  verifica('lo scrive nelle righe', scheda(p.m)[0][7] === 'scollegato');
  verifica('lo dice', t.indexOf('Non ho cancellato niente') >= 0);
}

// ---- 8b. controlla com'e' messo adesso -----------------------------------------------------
titolo('CONTROLLA COME SONO MESSI ADESSO');
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  p.m.recuperi.rispondi(3);
  const prima = scheda(p.m);
  const t = p.c.PANNELLO_5_controlla();
  const righe = scheda(p.m);
  verifica('dice che e\' collegato, aperto, con le sue risposte',
    righe[0][7] === 'collegato al foglio di quest\'anno, aperto, 3 risposte');
  verifica('e conta bene anche lo zero', righe[1][7].indexOf(', 0 risposte') > 0);
  verifica('aggiorna anche l\'ora', righe[0][9] !== '');
  verifica('non ha cambiato niente', p.m.recuperi.risposte.length === 3 &&
    p.m.recuperi.destinazione !== null && p.m.trigger.length === 2);
  verifica('lo dice', t.indexOf('legge e basta') >= 0 && t.indexOf('Tutto a posto') >= 0);

  // il modulo scollegato a mano fuori di qui
  p.m.uscite.removeDestination();
  p.c.PANNELLO_5_controlla();
  verifica('se lo scolleghi a mano, il foglio se ne accorge', scheda(p.m)[1][7] === 'non collegato a nessun foglio, aperto, 0 risposte');

  // il modulo chiuso a mano
  p.m.recuperi.setAcceptingResponses(false);
  p.c.PANNELLO_5_controlla();
  verifica('e se lo chiudi a mano, pure', scheda(p.m)[0][7].indexOf(', chiuso') > 0);

  // il modulo buttato nel cestino
  const cest = mondoPronto();
  cest.c.PANNELLO_4_preparaAnno();
  cest.m.uscite.file.cestino = true;
  const tc = cest.c.PANNELLO_5_controlla();
  verifica('il cestino si vede', scheda(cest.m)[1][7] === 'e\' nel cestino del Drive');
  verifica('e la sua scadenza sparisce', JSON.parse(cest.m.proprieta.get('CAMPANELLA_PANNELLO')).scadenze[cest.m.uscite.id] === undefined);
  verifica('l\'altro modulo resta a posto', scheda(cest.m)[0][7].indexOf('collegato al foglio') === 0 && tc.indexOf('Righe da guardare: 1') >= 0);

  // il modulo cancellato del tutto
  const via = mondoPronto();
  via.c.PANNELLO_4_preparaAnno();
  via.m.moduli.delete(via.m.uscite.id);
  via.c.PANNELLO_5_controlla();
  verifica('un modulo cancellato viene detto', scheda(via.m)[1][7].indexOf('non lo trovo') === 0);

  // la riga senza link
  const vuota = nuovoMondo();
  const cv = carica(vuota);
  cv.PANNELLO_1_preparaIlFoglio();
  const tv = cv.PANNELLO_5_controlla();
  verifica('le righe senza link lo dicono', scheda(vuota)[0][7] === 'manca il link del modulo' && tv.indexOf('Righe da guardare: 2') >= 0);
}

// ---- 8c. un modulo cancellato quando scatta la chiusura ------------------------------------
titolo('UN MODULO CANCELLATO PRIMA DELLA CHIUSURA');
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  p.m.moduli.delete(p.m.uscite.id);               // sparito durante l\'anno
  p.m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  const t = p.c.PANNELLO_chiusura();
  verifica('non blocca la chiusura', t.indexOf('non riesco ad aprirlo') >= 0);
  verifica('e non lascia la sua scadenza in sospeso',
    JSON.parse(p.m.proprieta.get('CAMPANELLA_PANNELLO')).scadenze[p.m.uscite.id] === undefined);
  p.m.adesso = new Date('2027-09-01T00:10:00+02:00').getTime();
  p.c.PANNELLO_chiusura();
  verifica('l\'altro si chiude normalmente', p.m.recuperi.aperto === false);
  verifica('e alla fine non restano chiusure programmate', p.m.trigger.length === 0);
}

// ---- 8d. il modulo aveva gia' lo script dentro ----------------------------------------------
titolo('UN MODULO CHE AVEVA GIA\' IL SUO SCRIPT');
{
  // com'e' messo un modulo preparato dall'altro script: foglio dell'anno gia'
  // creato nella cartella giusta e gia' collegato, ma il pannello non ne sa niente
  const p1 = mondoPronto();
  const suo = new p1.m.FoglioDiCalcolo('Risposte Recuperi - A.S. 2026-27', p1.m.cartella('A.S. 2026-27/RECUPERI'));
  p1.m.recuperi.setDestination('SPREADSHEET', suo.id);
  p1.m.recuperi.rispondi(2);
  const t1 = p1.c.PANNELLO_4_preparaAnno();
  verifica('non crea un secondo foglio', p1.m.fogliCreati === 1);
  verifica('riusa quello che c\'era', p1.m.recuperi.destinazione.foglio.id === suo.id);
  verifica('e non ricollega (niente scheda doppia)', suo.schede.length === 2);
  verifica('le risposte restano dove sono', suo.righeDiRisposte() === 2);
  verifica('lo dice', t1.indexOf('senza doppioni') > 0 || t1.indexOf('non ne creo un altro') > 0);

  // stesso caso, ma il foglio sta in un'altra cartella: lo riconosce dal nome
  const p2 = mondoPronto();
  const altrove = new p2.m.FoglioDiCalcolo('Risposte Recuperi - A.S. 2026-27', p2.m.cartella('Vecchie cose'));
  p2.m.recuperi.setDestination('SPREADSHEET', altrove.id);
  const t2 = p2.c.PANNELLO_4_preparaAnno();
  verifica('adotta il foglio collegato anche se sta altrove', p2.m.recuperi.destinazione.foglio.id === altrove.id && p2.m.fogliCreati === 1);
  verifica('e lo racconta', t2.indexOf('non ne creo un altro') > 0);

  // se invece il foglio collegato si chiama in un altro modo, non lo adotta
  const p3 = mondoPronto();
  const diverso = new p3.m.FoglioDiCalcolo('Un foglio qualunque', p3.m.cartella('A.S. 2026-27/RECUPERI'));
  p3.m.recuperi.setDestination('SPREADSHEET', diverso.id);
  p3.c.PANNELLO_4_preparaAnno();
  verifica('un foglio con un altro nome non viene adottato', p3.m.recuperi.destinazione.foglio.id !== diverso.id);
  verifica('quello vecchio resta dov\'e\', intatto', p3.m.fogli.has(diverso.id));
}

// ---- 9. casi storti --------------------------------------------------------------------------
titolo('CASI STORTI');
{
  const senza = nuovoMondo();
  const c = carica(senza);
  const t = c.PANNELLO_3_anteprima();
  verifica('senza la scheda: lo dice invece di rompersi', t.indexOf('Esegui prima "Prepara il foglio"') >= 0);

  const p = mondoPronto();
  p.m.permessiMancanti = true;
  const tp = p.c.PANNELLO_4_preparaAnno();
  verifica('permessi a meta\': non fa niente', p.m.fogliCreati === 0 && tp.indexOf('MANCA QUALCHE PERMESSO') >= 0);

  const l = mondoPronto();
  l.m.lockOccupato = true;
  const tl = l.c.PANNELLO_4_preparaAnno();
  verifica('un\'altra esecuzione in corso: aspetta', l.m.fogliCreati === 0 && tl.indexOf('ancora in corso') >= 0);

  const sparito = mondoPronto();
  sparito.m.moduli.delete(sparito.m.uscite.id);
  const ts = sparito.c.PANNELLO_4_preparaAnno();
  verifica('un modulo sparito non ferma gli altri', sparito.m.fogliCreati === 1 && ts.indexOf('PROBLEMA') >= 0);
  verifica('e il problema finisce nella sua riga', String(scheda(sparito.m)[1][7]).indexOf('problema') === 0);

  const chiuso = mondoPronto();
  chiuso.m.recuperi.aperto = false; chiuso.m.recuperi.pubblicato = false;
  const tch = chiuso.c.PANNELLO_4_preparaAnno();
  verifica('modulo non pubblicato: non lo pubblica', chiuso.m.recuperi.aperto === false && tch.indexOf('non e\' pubblicato') >= 0);
  verifica('ma lo collega lo stesso', chiuso.m.recuperi.destinazione !== null);

  const editor = mondoPronto({ senzaInterfaccia: true });
  const te = editor.c.PANNELLO_4_preparaAnno();
  verifica('eseguito dall\'editor (senza finestre): funziona lo stesso', editor.m.fogliCreati === 2 && te.indexOf('FATTO') >= 0);

  const brutto = mondoPronto();
  brutto.m.pannello.getSheetByName('Moduli').getRange(2, 5).setValue('fine agosto');
  const tb = brutto.c.PANNELLO_4_preparaAnno();
  verifica('chiusura scritta a parole: problema solo su quella riga', tb.indexOf('giorno/mese') >= 0 && brutto.m.fogliCreati === 2);
}

// ---- 10. il menu ------------------------------------------------------------------------------
titolo('IL MENU');
{
  const m = nuovoMondo({ risposteUi: ['NO'] });
  const c = carica(m);
  c.onOpen();
  verifica('menu Campanella con sei voci', m.menu && m.menu.nome === 'Campanella' && m.menu.voci.length === 6);
  verifica('ogni voce chiama una funzione che esiste', m.menu.voci.every(v => typeof c[v.funzione] === 'function'));
  c.PANNELLO_4_preparaAnno();
  verifica('risposta No: non fa niente', m.fogliCreati === 0);
}

// ---- 11. lo script generato da Campanella -------------------------------------------------------
if (process.argv[2]) {
  titolo('SCRIPT GENERATO: ' + path.basename(process.argv[2]));
  const generato = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
  const m = nuovoMondo();
  const c = carica(m, { codice: generato });
  verifica('la configurazione c\'e\' ed e\' completa',
    ['anno', 'cartellaAnno', 'chiusura', 'fusoOrario', 'scheda', 'moduli'].every(k => k in c.PANNELLO));
  verifica('elenca almeno un modulo', Array.isArray(c.PANNELLO.moduli) && c.PANNELLO.moduli.length >= 1);
  c.PANNELLO_1_preparaIlFoglio();
  const righe = scheda(m);
  verifica('il foglio nasce con una riga per modulo', righe.length === c.PANNELLO.moduli.length);
  verifica('ogni riga ha nome e nome del foglio', righe.every(r => String(r[0]) !== '' && String(r[3]).indexOf('{anno}') > 0));
  const t = c.PANNELLO_3_anteprima();
  verifica('l\'anteprima gira e chiede i link', t.indexOf('manca il link del modulo') >= 0);
  verifica('e non ha toccato niente', m.fogliCreati === 0 && m.trigger.length === 0);
}

titolo('RISULTATO');
console.log(fallite === 0 ? '  Tutte le prove superate.  (' + fatte + ')' : '  PROVE FALLITE: ' + fallite + ' su ' + fatte);
process.exit(fallite === 0 ? 0 : 1);
