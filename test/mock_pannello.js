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
    risposteDate: 0,
    tutte: [],                                        // ogni risposta mai data, per contare quelle perse
    moduli: new Map(),
    fogli: new Map(),
    file: new Map()
  };
  // lunghi come quelli veri (44 caratteri): contano per il tetto delle proprieta'
  const id = p => (p + (m.prossimoId++)).padEnd(44, 'x');
  const momento = r => new Date(Math.round(r.tempo / 1000) * 1000);

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
      this.grassetti = new Set(); this.protezioni = []; this.grafici = []; this.immagini = [];
      this.disegni = []; this.scrittoComeTesto = new Set();
      this.cancellata = false;
    }
    getDrawings() { return this.disegni; }
    getSlicers() { return []; }
    getMaxColumns() { return 26; }
    getName() {
      // come il foglio vero: una scheda cancellata non risponde piu'
      if (this.cancellata) throw new Error('Questa scheda e\' stata eliminata.');
      return this.nome;
    }
    getLastColumn() {
      let ultima = 0;
      for (const riga of this.celle) {
        if (!riga) continue;
        for (let c = 0; c < riga.length; c++) {
          if (riga[c] !== '' && riga[c] !== undefined && riga[c] !== null) ultima = Math.max(ultima, c + 1);
        }
      }
      return ultima;
    }
    clear() {
      this.celle = []; this.formati = new Map(); this.grassetti = new Set(); this.spunte = new Set();
      this.scrittoComeTesto = new Set();
      return this;
    }
    getCharts() { return this.grafici; }
    getImages() { return this.immagini; }
    setHiddenGridlines() { return this; }
    getProtections(tipo) { return this.protezioni.filter(p => p.tipo === tipo); }
    protect() {
      const p = { tipo: 'SHEET', soloAvviso: false, descrizione: '',
                  setDescription(d) { this.descrizione = d; return this; },
                  getDescription() { return this.descrizione; },
                  setWarningOnly(v) { this.soloAvviso = v; return this; } };
      this.protezioni.push(p);
      return p;
    }
    /** il testo della colonna A, riga per riga: per le prove sulla scheda Istruzioni */
    testo() {
      const fuori = [];
      for (let r = 0; r < this.getLastRow(); r++) fuori.push(String(this.cella(r, 0)));
      return fuori;
    }
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
      // per le prove: quali celle hanno ricevuto testo quando erano GIA' a testo
      if (typeof v === 'string' && this.formati.get(r + ',' + c) === '@') this.scrittoComeTesto.add(r + ',' + c);
      if (typeof v === 'string' && this.formati.get(r + ',' + c) !== '@') {
        const g = /^(\d{1,2})\/(\d{1,2})$/.exec(v);
        if (g) v = new Date(new Date(m.adesso).getFullYear(), parseInt(g[2], 10) - 1, parseInt(g[1], 10));
        // e una stringa che comincia con = + - il foglio la legge come formula
        else if (/^[=+\-]/.test(v)) v = '#ERROR!';
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
        setFontWeight(w) {
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) {
            const chiave = (r - 1 + i) + ',' + (c - 1 + k);
            if (w === 'bold') scheda.grassetti.add(chiave); else scheda.grassetti.delete(chiave);
          }
          return this;
        },
        setFontSize() { return this; },
        setWrap() { return this; },
        setVerticalAlignment() { return this; },
        setNumberFormat(f) {
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) scheda.formati.set((r - 1 + i) + ',' + (c - 1 + k), f);
          return this;
        },
        // come dice la documentazione di Google: "Sets the value of all cells in
        // the range to false". E' il motivo per cui il motore non la usa piu'
        insertCheckboxes() {
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) {
            scheda.spunte.add((r - 1 + i) + ',' + (c - 1 + k));
            scheda.scrivi(r - 1 + i, c - 1 + k, false);
          }
          return this;
        },
        // la convalida a casella non tocca i valori
        setDataValidation(regola) {
          if (!regola || regola.tipo !== 'casella') throw new Error('convalida sconosciuta al banco di prova');
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) scheda.spunte.add((r - 1 + i) + ',' + (c - 1 + k));
          return this;
        },
        clearDataValidations() {
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) scheda.spunte.delete((r - 1 + i) + ',' + (c - 1 + k));
          return this;
        },
        clearContent() {
          for (let i = 0; i < righe; i++) for (let k = 0; k < colonne; k++) {
            if (scheda.celle[r - 1 + i]) scheda.celle[r - 1 + i][c - 1 + k] = '';
          }
          return this;
        },
        getNotes() {
          const fuori = [];
          for (let i = 0; i < righe; i++) {
            const riga = [];
            for (let k = 0; k < colonne; k++) riga.push(scheda.note.get((r - 1 + i) + ',' + (c - 1 + k)) || '');
            fuori.push(riga);
          }
          return fuori;
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
    getSheets() { return this.schede.slice(); }
    getSheetByName(n) { return this.schede.find(s => s.nome === n) || null; }
    insertSheet(n) {
      if (this.getSheetByName(n)) throw new Error('Esiste gia\' una scheda di nome "' + n + '".');
      const s = new Scheda(n); this.schede.push(s); return s;
    }
    deleteSheet(s) {
      if (this.schede.length <= 1) throw new Error('Non puoi eliminare l\'unica scheda del foglio.');
      const i = this.schede.indexOf(s);
      if (i < 0) throw new Error('La scheda non e\' in questo foglio.');
      this.schede.splice(i, 1);
      s.cancellata = true;
      if (this.attiva === s) this.attiva = this.schede[0];
    }
    getActiveSheet() { return this.attiva || this.schede[0]; }
    setActiveSheet(s) { this.attiva = s; return s; }
    /** come il foglio vero: la posizione parte da 1 */
    moveActiveSheet(posizione) {
      const s = this.getActiveSheet();
      this.schede.splice(this.schede.indexOf(s), 1);
      this.schede.splice(Math.max(0, Math.min(posizione - 1, this.schede.length)), 0, s);
    }
    /** i nomi delle schede, nell'ordine in cui le vedi in basso */
    nomiSchede() { return this.schede.map(s => s.nome); }
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
    /**
     * Ogni risposta ha il suo momento, con i millesimi; nella prima colonna del
     * foglio Google lo scrive al secondo (qui arrotondato, il caso piu' scomodo).
     */
    rispondi(n) {
      for (let i = 0; i < n; i++) {
        m.risposteDate++;
        const tempo = m.adesso + m.risposteDate * 1000 + (m.risposteDate * 337) % 1000;
        const risposta = { tempo, getTimestamp: () => new Date(tempo) };
        this.risposte.push(risposta); m.tutte.push(risposta);
        if (this.destinazione) this.destinazione.scheda.scrivi(this.destinazione.scheda.getLastRow(), 0, momento(risposta));
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
      for (let i = 0; i < this.risposte.length; i++) scheda.scrivi(i + 1, 0, momento(this.risposte[i]));
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

  /** Le risposte date che non stanno piu' da nessuna parte: ne' in un modulo, ne' in un foglio. */
  m.perse = function () {
    const righe = new Map();
    for (const f of m.fogli.values()) {
      for (const s of f.schede) {
        for (const riga of s.celle) {
          const v = riga && riga[0];
          if (v instanceof Date) righe.set(v.getTime(), (righe.get(v.getTime()) || 0) + 1);
        }
      }
    }
    let n = 0;
    for (const r of m.tutte) {
      if ([...m.moduli.values()].some(x => x.risposte.indexOf(r) >= 0)) continue;
      const t = momento(r).getTime();
      if (righe.get(t) > 0) righe.set(t, righe.get(t) - 1); else n++;
    }
    return n;
  };
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
        m.adesso += m.costoApertura || 0;             // per le prove sul tempo: ogni modulo costa qualche secondo
        const f = m.moduli.get(idModulo);
        if (!f) throw new Error('Modulo non trovato: ' + idModulo);
        return f;
      },
      getActiveForm: () => { throw new Error('questo script non sta dentro un modulo'); }
    },
    SpreadsheetApp: {
      ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
      newDataValidation() {
        const costruttore = { tipo: '',
          requireCheckbox() { this.tipo = 'casella'; return this; },
          build() { return { tipo: this.tipo }; } };
        return costruttore;
      },
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
        const t = { funzione, uid: 'trigger-' + (m.prossimoId++) };
        const o = {
          at() { throw new Error('at(data) dipende dal fuso del progetto: serve atDate + inTimezone'); },
          atDate(a, me, g) { t.anno = a; t.mese = me; t.giorno = g; return o; },
          after(ms) { t.dopo = ms; return o; },
          inTimezone(f) { t.fuso = f; return o; },
          create() { m.trigger.push(t); return t; }
        };
        return { timeBased: () => o };
      },
      getProjectTriggers: () => m.trigger.map(t => ({ getHandlerFunction: () => t.funzione, getUniqueId: () => t.uid, _rif: t })),
      deleteTrigger(t) { const i = m.trigger.indexOf(t._rif); if (i >= 0) m.trigger.splice(i, 1); }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (m.proprieta.has(k) ? m.proprieta.get(k) : null),
        getProperties: () => { const fuori = {}; for (const [k, v] of m.proprieta) fuori[k] = v; return fuori; },
        getKeys: () => [...m.proprieta.keys()],
        setProperty: (k, v) => {
          // come quelle vere: un valore sta in circa 9 KB, oltre Google rifiuta di salvarlo
          if (Buffer.byteLength(String(v), 'utf8') > 9 * 1024) throw new Error('Argument too large: value');
          m.proprieta.set(k, String(v));
        }
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

/** La memoria dello script, con i fogli di tutti gli anni (stanno in proprieta' a parte). */
function ricordo(m) {
  const r = JSON.parse(m.proprieta.get('CAMPANELLA_PANNELLO'));
  for (const [k, v] of m.proprieta) {
    if (k.indexOf('CAMPANELLA_PANNELLO_FOGLI_') === 0) Object.assign(r.fogli, JSON.parse(v));
  }
  return r;
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

// ---- 1a. le schede del foglio: via Foglio1, dentro Istruzioni ----------------------------
titolo('LE SCHEDE: VIA FOGLIO1, DENTRO LE ISTRUZIONI');
{
  const m = nuovoMondo();
  const c = carica(m);
  verifica('il foglio nuovo nasce con Foglio1, come quello vero',
    JSON.stringify(m.pannello.nomiSchede()) === '["Foglio1"]');
  const t = c.PANNELLO_1_preparaIlFoglio();
  verifica('dopo: Moduli e Istruzioni, in quest\'ordine, e basta',
    JSON.stringify(m.pannello.nomiSchede()) === '["Moduli","Istruzioni"]');
  verifica('lo dice all\'utente', t.indexOf('Tolta la scheda vuota Foglio1') >= 0 && t.indexOf('Istruzioni') >= 0);
  verifica('si resta sulla scheda Moduli', m.pannello.getActiveSheet().getName() === 'Moduli');

  const ist = m.pannello.getSheetByName('Istruzioni');
  const testo = ist.testo();
  const tutto = testo.join('\n');
  const passi = testo.filter(r => /^\d\.\s/.test(r)).join('\n');
  verifica('le istruzioni hanno i passi del menu, nell\'ordine',
    passi.indexOf('Prepara il foglio') >= 0 &&
    passi.indexOf('Prepara il foglio') < passi.indexOf('Trova i moduli nel Drive') &&
    passi.indexOf('Trova i moduli nel Drive') < passi.indexOf('Anteprima') &&
    passi.indexOf('Anteprima') < passi.indexOf('Prepara l\'anno nuovo'));
  verifica('spiegano ogni colonna', ['Modulo:', 'Link del modulo:', 'Chiusura:', 'Svuota:', 'Attivo:', 'Ultima esecuzione:']
    .every(x => testo.some(r => r.indexOf(x) === 0)));
  verifica('dicono cosa fare ogni anno e durante l\'anno',
    tutto.indexOf('OGNI ANNO') >= 0 && tutto.indexOf('DURANTE L\'ANNO') >= 0 && tutto.indexOf('Annulla') >= 0);
  // niente valori calcolati oggi: invecchierebbero fra una riscrittura e l'altra
  verifica('dicono la regola dell\'anno e della cartella, non i valori di oggi',
    tutto.indexOf('automatico') >= 0 && tutto.indexOf('"A.S. {anno}"') >= 0 && tutto.indexOf('A.S. 2026-27') < 0);
  verifica('con l\'anno automatico dicono che cambia da solo', tutto.indexOf('cambia da solo il primo settembre') >= 0);
  verifica('dicono che una riga nuova parte accesa', tutto.indexOf('una riga nuova parte accesa') >= 0);
  verifica('ogni riga scritta a testo, a colonna gia\' impostata',
    testo.every((r, i) => r === '' || ist.scrittoComeTesto.has(i + ',0')));
  verifica('i titoli in grassetto, il resto no', ist.grassetti.has('0,0') &&
    ist.grassetti.has(testo.indexOf('LA PRIMA VOLTA') + ',0') && !ist.grassetti.has('1,0'));
  verifica('protetta con il solo avviso', ist.protezioni.length === 1 && ist.protezioni[0].soloAvviso === true);

  const quante = testo.length;
  // sotto il testo, dove la riscrittura non arriva: resta solo se manca clear()
  ist.getRange(quante + 2, 1).setValue('una nota mia');
  ist.getRange(quante + 3, 1).setFontWeight('bold');
  c.PANNELLO_1_preparaIlFoglio();
  verifica('rieseguito: sempre due schede', JSON.stringify(m.pannello.nomiSchede()) === '["Moduli","Istruzioni"]');
  verifica('le istruzioni vengono riscritte da capo, non accodate',
    m.pannello.getSheetByName('Istruzioni').testo().length === quante);
  verifica('e quello scritto a mano sparisce (lo dice la scheda stessa)',
    m.pannello.getSheetByName('Istruzioni').testo().indexOf('una nota mia') < 0 && tutto.indexOf('non scriverci dentro') >= 0);
  verifica('e anche la sua formattazione', !m.pannello.getSheetByName('Istruzioni').grassetti.has((quante + 2) + ',0'));
  verifica('la protezione non si moltiplica', m.pannello.getSheetByName('Istruzioni').protezioni.length === 1);
  verifica('le righe dei moduli restano', scheda(m).length === 2);
}

// le schede di chi ci ha gia' lavorato non si toccano
{
  const m = nuovoMondo();
  const c = carica(m);
  m.pannello.getSheetByName('Foglio1').getRange(1, 1).setValue('appunti miei');
  m.pannello.insertSheet('Foglio2');                           // vuota, col nome di partenza
  m.pannello.insertSheet('Da fare');                           // vuota, ma rinominata da te
  m.pannello.insertSheet('Foglio3').grafici.push({});          // vuota di celle, ma con un grafico
  m.pannello.insertSheet('Foglio4').disegni.push({});          // con un disegno (un bottone con uno script)
  m.pannello.insertSheet('Foglio5').note.set('4,2', 'appunto'); // con una nota in C5
  const t = c.PANNELLO_1_preparaIlFoglio();
  const nomi = m.pannello.nomiSchede();
  verifica('Foglio1 con dentro qualcosa resta', nomi.indexOf('Foglio1') >= 0);
  verifica('Foglio2 vuota se ne va', nomi.indexOf('Foglio2') < 0 && t.indexOf('Foglio2') >= 0);
  verifica('una scheda rinominata resta, anche vuota', nomi.indexOf('Da fare') >= 0);
  verifica('una scheda con un grafico resta', nomi.indexOf('Foglio3') >= 0);
  verifica('una scheda con un disegno resta', nomi.indexOf('Foglio4') >= 0);
  verifica('una scheda con una nota resta', nomi.indexOf('Foglio5') >= 0);
  verifica('Moduli e Istruzioni comunque in testa', nomi[0] === 'Moduli' && nomi[1] === 'Istruzioni');
}

// con l'anno scritto a mano le istruzioni non promettono che cambi da solo
{
  const m = nuovoMondo();
  const c = carica(m, { config: { anno: '2026-27' } });
  c.PANNELLO_1_preparaIlFoglio();
  const tutto = m.pannello.getSheetByName('Istruzioni').testo().join('\n');
  verifica('anno fisso: lo dice, e dice come passare all\'anno dopo',
    tutto.indexOf('fisso, 2026-27') >= 0 && tutto.indexOf('NON cambia da solo') >= 0);
  verifica('e non dice che cambia da solo', tutto.indexOf('cambia da solo il primo settembre') < 0);
}

// chi ha gia' il foglio e usa solo "Prepara l'anno nuovo" ha lo stesso le istruzioni
{
  const p = mondoPronto();
  p.m.pannello.deleteSheet(p.m.pannello.getSheetByName('Istruzioni'));
  p.m.pannello.insertSheet('Foglio1');
  p.c.PANNELLO_4_preparaAnno();
  verifica('"Prepara l\'anno nuovo" rifa\' anche le Istruzioni e toglie Foglio1',
    JSON.stringify(p.m.pannello.nomiSchede()) === '["Moduli","Istruzioni"]');
}

// ---- 1a-bis. le caselle Attivo e Svuota ---------------------------------------------------
titolo('LE CASELLE "ATTIVO" E "SVUOTA" NON SI AZZERANO');
{
  const p = mondoPronto();
  const s = p.m.pannello.getSheetByName('Moduli');
  s.getRange(2, 6).setValue(true);                   // Recuperi: svuota
  s.getRange(3, 7).setValue(false);                  // Uscite: spenta
  p.c.PANNELLO_1_preparaIlFoglio();
  verifica('rieseguire "Prepara il foglio" lascia le spunte come erano',
    scheda(p.m)[0][5] === true && scheda(p.m)[0][6] === true && scheda(p.m)[1][6] === false);
  verifica('le righe dei moduli hanno le caselle', s.spunte.has('1,5') && s.spunte.has('1,6') && s.spunte.has('2,6'));
  verifica('sotto l\'ultima riga niente caselle', !s.spunte.has('3,6') && !s.spunte.has('50,6'));

  // un foglio fatto con la versione vecchia: caselle spente fino in fondo
  const v = mondoPronto();
  const sv = v.m.pannello.getSheetByName('Moduli');
  sv.getRange(4, 7, 100, 1).insertCheckboxes();
  sv.getRange(4, 1).setValue('Nuovo');               // una riga aggiunta a mano, sopra una casella spenta
  v.c.PANNELLO_1_preparaIlFoglio();
  // la casella spenta della versione vecchia non si distingue da una spenta
  // apposta: resta spenta, ma adesso si vede e "Trova"/"Anteprima" lo dicono
  verifica('una riga scritta sopra una casella vecchia resta spenta, con la casella in vista',
    scheda(v.m)[2][6] === false && sv.spunte.has('3,6'));
  verifica('ma sotto le righe le caselle vecchie spariscono', !sv.spunte.has('10,6') && sv.getRange(11, 7).getValue() === '');

  // una riga aggiunta a mano, senza toccare la casella
  const n = mondoPronto();
  new n.m.Modulo('Gite', n.m.cartella('MODELLI'));
  const sn = n.m.pannello.getSheetByName('Moduli');
  sn.getRange(4, 1).setValue('Gite');
  const t = n.c.PANNELLO_2_trovaIModuli();
  verifica('una riga nuova parte accesa: "Trova i moduli" la trova', t.indexOf('Gite: trovato') >= 0);
  verifica('e le mette le caselle, Attivo spuntato', sn.spunte.has('3,6') && scheda(n.m)[2][6] === true);

  sn.getRange(4, 7).setValue(false);
  const t2 = n.c.PANNELLO_2_trovaIModuli();
  const t3 = n.c.PANNELLO_3_anteprima();
  verifica('una riga spenta non sparisce in silenzio', t2.indexOf('Gite: saltata') >= 0 && t3.indexOf('saltate: Gite') >= 0);
}

// ---- 1a-ter. "Prepara l'anno nuovo" rieseguito a meta' anno ---------------------------------
titolo('PREPARA L\'ANNO NUOVO RIESEGUITO A META\' ANNO');
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  c.PANNELLO_4_preparaAnno();
  const fogliUscite = m.uscite.destinazione.foglio;
  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  c.PANNELLO_chiusura();                                           // Uscite si chiude il 30/06
  verifica('(Uscite chiuso e scollegato dalla sua chiusura)', m.uscite.aperto === false && m.uscite.destinazione === null);

  // a luglio arriva un modulo nuovo: la riga, poi Trova e Prepara, come dicono le istruzioni
  new m.Modulo('Gite', m.cartella('MODELLI'));
  m.pannello.getSheetByName('Moduli').getRange(4, 1).setValue('Gite');
  c.PANNELLO_2_trovaIModuli();
  const schedePrima = fogliUscite.schede.length;
  const t = c.PANNELLO_4_preparaAnno();
  verifica('il modulo gia\' chiuso resta chiuso', m.uscite.aperto === false);
  verifica('e non viene ricollegato (niente seconda scheda di risposte)',
    m.uscite.destinazione === null && fogliUscite.schede.length === schedePrima);
  verifica('lo dice', t.indexOf('non lo ricollego e non lo riapro') >= 0);
  verifica('la sua riga resta "chiuso il ..."', scheda(m)[1][7].indexOf('chiuso il 30/06/2027') === 0);
  verifica('il modulo nuovo invece viene preparato', scheda(m)[2][7] === 'pronto per 2026-27');
  verifica('Recuperi, ancora aperto, non viene toccato', m.recuperi.aperto === true);

  // un modulo chiuso a mano prima della sua chiusura
  m.recuperi.aperto = false;
  const t2 = c.PANNELLO_4_preparaAnno();
  verifica('un modulo chiuso a mano non viene riaperto', m.recuperi.aperto === false);
  verifica('e lo dice, nella riga e nel resoconto',
    t2.indexOf('non lo riapro') >= 0 && scheda(m)[0][7].indexOf('chiuso a mano') >= 0);

  // l'anno dopo invece si riapre tutto, come sempre
  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  c.PANNELLO_4_preparaAnno();
  verifica('l\'anno dopo i moduli riaprono', m.recuperi.aperto === true && m.uscite.aperto === true);
}

// una preparazione rotta a meta': la volta dopo la riga si rifa' tutta
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  const ricordo = JSON.parse(p.m.proprieta.get('CAMPANELLA_PANNELLO'));
  delete ricordo.pronti[p.m.recuperi.id + '|2026-27'];              // come se si fosse fermata prima della fine
  p.m.proprieta.set('CAMPANELLA_PANNELLO', JSON.stringify(ricordo));
  p.m.recuperi.aperto = false;
  p.c.PANNELLO_4_preparaAnno();
  verifica('riga non finita: la volta dopo il modulo viene riaperto', p.m.recuperi.aperto === true);
}

// chi viene da una versione di prima: la memoria non sa cosa sia "pronti"
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  const ricordo = JSON.parse(p.m.proprieta.get('CAMPANELLA_PANNELLO'));
  delete ricordo.pronti;
  p.m.proprieta.set('CAMPANELLA_PANNELLO', JSON.stringify(ricordo));
  p.m.recuperi.aperto = false;                                      // chiuso a mano
  p.c.PANNELLO_4_preparaAnno();
  verifica('memoria vecchia: le righe con il foglio dell\'anno contano come pronte', p.m.recuperi.aperto === false);
}

// dopo "Annulla" la riga non e' piu' pronta
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  p.c.PANNELLO_ANNULLA();
  p.m.recuperi.aperto = false;
  p.c.PANNELLO_4_preparaAnno();
  verifica('dopo Annulla si prepara da capo, riapertura compresa',
    p.m.recuperi.aperto === true && p.m.recuperi.destinazione !== null);
}

// la chiusura e' scattata, poi qualcuno sposta o svuota il giorno in "Chiusura"
for (const nuovo of ['31/07', '']) {
  const p = mondoPronto();
  const m = p.m, c = p.c;
  c.PANNELLO_4_preparaAnno();
  const suo = m.uscite.destinazione.foglio;
  m.uscite.rispondi(2);
  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  c.PANNELLO_chiusura();                                        // Uscite, 30/06
  m.pannello.getSheetByName('Moduli').getRange(3, 5).setValue(nuovo);
  m.adesso = new Date('2027-07-05T09:00:00+02:00').getTime();
  const schede = suo.schede.length;
  const t = c.PANNELLO_4_preparaAnno();
  const come = nuovo ? 'spostata al ' + nuovo : 'svuotata';
  verifica('chiusura ' + come + ' dopo che e\' scattata: non ricollega (niente risposte doppie)',
    m.uscite.destinazione === null && suo.schede.length === schede);
  verifica('chiusura ' + come + ': resta chiuso, e la riga dice chi l\'ha chiuso',
    m.uscite.aperto === false && scheda(m)[1][7].indexOf('chiuso il 30/06/2027') === 0);
  if (nuovo) verifica('e spiega che per quest\'anno la chiusura e\' gia\' scattata', t.indexOf('e\' gia\' scattata') >= 0);
}

// un modulo scollegato a mano, ancora aperto, prima della sua chiusura
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  const suo = p.m.recuperi.destinazione.foglio;
  p.m.recuperi.rispondi(3);
  p.m.recuperi.removeDestination();
  const schede = suo.schede.length;
  p.c.PANNELLO_4_preparaAnno();
  verifica('scollegato a mano: non lo ricollego (Google ricopierebbe le risposte)',
    p.m.recuperi.destinazione === null && suo.schede.length === schede);
  verifica('e la riga lo dice', scheda(p.m)[0][7].indexOf('scollegato a mano') > 0);
}

// un modulo non pubblicato non diventa "pronto": pubblicato, la volta dopo si riapre
{
  const p = mondoPronto();
  p.m.recuperi.aperto = false;
  p.m.recuperi.pubblicato = false;
  p.c.PANNELLO_4_preparaAnno();
  verifica('non pubblicato: la riga lo dice', scheda(p.m)[0][7].indexOf('non e\' pubblicato') > 0);
  p.m.recuperi.pubblicato = true;
  p.c.PANNELLO_4_preparaAnno();
  verifica('pubblicato dopo: la volta dopo viene riaperto', p.m.recuperi.aperto === true);
}

// la riapertura che non riesce non segna la riga come pronta
{
  const p = mondoPronto();
  p.m.recuperi.aperto = false;
  const vera = p.m.recuperi.setAcceptingResponses;
  p.m.recuperi.setAcceptingResponses = function () { throw new Error('Service error: Forms'); };
  p.c.PANNELLO_4_preparaAnno();
  verifica('riapertura fallita: la riga dice "problema", non "pronto"',
    scheda(p.m)[0][7].indexOf('problema') === 0);
  p.m.recuperi.setAcceptingResponses = vera;
  p.c.PANNELLO_4_preparaAnno();
  verifica('e la volta dopo lo riapre davvero', p.m.recuperi.aperto === true &&
    scheda(p.m)[0][7] === 'pronto per 2026-27');
}

// la memoria tiene solo l'anno in corso (le proprieta' hanno un tetto di 9 KB)
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  const r = JSON.parse(p.m.proprieta.get('CAMPANELLA_PANNELLO'));
  r.pronti['vecchio|2019-20'] = true;
  r.chiusi['vecchio|2019-20'] = '2020-08-31';
  p.m.proprieta.set('CAMPANELLA_PANNELLO', JSON.stringify(r));
  p.c.PANNELLO_4_preparaAnno();
  const dopo = JSON.parse(p.m.proprieta.get('CAMPANELLA_PANNELLO'));
  verifica('"pronti" e "chiusi" degli anni passati non si accumulano',
    dopo.pronti['vecchio|2019-20'] === undefined && dopo.chiusi['vecchio|2019-20'] === undefined &&
    dopo.pronti[p.m.recuperi.id + '|2026-27'] === true);
}

// una scheda "Istruzioni" che c'era gia' ed e' tua
{
  const m = nuovoMondo();
  const c = carica(m);
  const mia = m.pannello.insertSheet('Istruzioni');
  mia.getRange(1, 1).setValue('Turni di sorveglianza');
  const t = c.PANNELLO_1_preparaIlFoglio();
  verifica('una scheda "Istruzioni" tua non viene toccata',
    m.pannello.getSheetByName('Istruzioni').getRange(1, 1).getValue() === 'Turni di sorveglianza');
  verifica('le istruzioni vanno in "Istruzioni Campanella"',
    m.pannello.getSheetByName('Istruzioni Campanella') !== null &&
    m.pannello.getSheetByName('Istruzioni Campanella').testo()[0].indexOf('CAMPANELLA - COME SI USA') === 0);
  verifica('e lo dice', t.indexOf('e\' tua: non l\'ho toccata') >= 0);
  c.PANNELLO_1_preparaIlFoglio();
  verifica('rieseguito: niente terza scheda di istruzioni',
    m.pannello.nomiSchede().filter(n => n.indexOf('Istruzioni') === 0).length === 2);
}

// un modulo non ancora pubblicato a settembre: poi lo pubblichi, arriva la sua
// chiusura, e a luglio riesegui "Prepara l'anno nuovo" per un modulo nuovo
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  m.uscite.aperto = false; m.uscite.pubblicato = false;
  c.PANNELLO_4_preparaAnno();
  const suo = m.uscite.destinazione.foglio;
  m.uscite.pubblicato = true; m.uscite.aperto = true;          // pubblicato e aperto da Google Moduli
  m.uscite.rispondi(3);
  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  c.PANNELLO_chiusura();
  const schede = suo.schede.length;
  m.adesso = new Date('2027-07-05T09:00:00+02:00').getTime();
  c.PANNELLO_4_preparaAnno();
  verifica('non pubblicato a settembre, chiuso a giugno: a luglio non viene ricollegato ne\' riaperto',
    m.uscite.destinazione === null && m.uscite.aperto === false && suo.schede.length === schede);
}

// memoria di una versione di prima, con una preparazione che si era fermata
// prima del collegamento: il foglio c'e', ma e' ancora intatto
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  m.recuperi.aperto = false;                                    // chiuso dalla chiusura dell'anno prima
  const intatto = new m.FoglioDiCalcolo('Risposte Recuperi - A.S. 2026-27', m.cartella('A.S. 2026-27/RECUPERI'));
  const vecchia = { fogli: {}, scadenze: {} };                  // com'era scritta prima della 1.4.6
  vecchia.fogli[m.recuperi.id + '|2026-27'] = intatto.id;
  m.proprieta.set('CAMPANELLA_PANNELLO', JSON.stringify(vecchia));
  const t = c.PANNELLO_4_preparaAnno();
  verifica('memoria vecchia, foglio mai collegato: lo collega e riapre il modulo',
    m.recuperi.destinazione !== null && m.recuperi.destinazione.foglio.id === intatto.id && m.recuperi.aperto === true);
  verifica('e non dice che qualcuno l\'ha chiuso o scollegato',
    t.indexOf('l\'ha chiuso qualcuno') < 0 && scheda(m)[0][7] === 'pronto per 2026-27');

  // memoria vecchia, foglio gia' collegato e poi scollegato: non lo ricollega,
  // e non riapre (non si sa chi l'ha chiuso), ma senza dare la colpa a nessuno
  const q = mondoPronto();
  q.c.PANNELLO_4_preparaAnno();
  const r = JSON.parse(q.m.proprieta.get('CAMPANELLA_PANNELLO'));
  delete r.pronti; delete r.chiusi;
  q.m.proprieta.set('CAMPANELLA_PANNELLO', JSON.stringify(r));
  q.m.recuperi.aperto = false;
  q.m.recuperi.removeDestination();
  const t2 = q.c.PANNELLO_4_preparaAnno();
  verifica('memoria vecchia, foglio gia\' usato: non lo ricollega e non lo riapre',
    q.m.recuperi.destinazione === null && q.m.recuperi.aperto === false);
  verifica('e lo dice senza inventare chi l\'ha chiuso',
    t2.indexOf('versione di prima') >= 0 && t2.indexOf('l\'ha chiuso qualcuno') < 0);
}

// anno fisso: il codice dell'anno dopo incollato prima che scatti la chiusura
{
  const m = nuovoMondo();
  m.recuperi = new m.Modulo('Recuperi', m.cartella('MODELLI'));
  m.uscite = new m.Modulo('Uscite', m.cartella('MODELLI'));
  const c1 = carica(m, { config: { anno: '2026-27' } });
  c1.PANNELLO_1_preparaIlFoglio(); c1.PANNELLO_2_trovaIModuli(); c1.PANNELLO_4_preparaAnno();
  m.adesso = new Date('2027-08-25T09:00:00+02:00').getTime();
  const c2 = carica(m, { config: { anno: '2027-28' } });       // reincollato a fine agosto
  m.adesso = new Date('2027-09-01T00:10:00+02:00').getTime();
  c2.PANNELLO_chiusura();                                       // Recuperi, 31/08/2027
  const ricordo = JSON.parse(m.proprieta.get('CAMPANELLA_PANNELLO'));
  verifica('anno fisso: la chiusura del 31/08/2027 e\' segnata per il 2026-27, non per il 2027-28',
    ricordo.chiusi[m.recuperi.id + '|2027-28'] === undefined);
  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  c2.PANNELLO_4_preparaAnno();
  m.adesso = new Date('2027-09-06T09:00:00+02:00').getTime();
  c2.PANNELLO_4_preparaAnno();                                  // la seconda volta nel 2027-28
  verifica('e il 2027-28 resta aperto, con le sue chiusure programmate',
    m.recuperi.aperto === true && scheda(m)[0][7] === 'pronto per 2027-28' && m.trigger.some(x => x.anno === 2028));
}

// Google non chiude il modulo: la riga non deve dirlo chiuso
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  c.PANNELLO_4_preparaAnno();
  const vera = m.uscite.setAcceptingResponses;
  let rifiuti = 0;
  m.uscite.setAcceptingResponses = function (si) {
    if (!si && rifiuti < 2) { rifiuti++; throw new Error('Service error: Forms'); }   // anche al secondo tentativo
    return vera.call(this, si);
  };
  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  c.PANNELLO_chiusura();
  const r1 = JSON.parse(m.proprieta.get('CAMPANELLA_PANNELLO'));
  verifica('modulo che non si chiude: la riga dice "chiusura non riuscita", non "chiuso"',
    scheda(m)[1][7].indexOf('chiusura non riuscita') === 0);
  verifica('resta collegato (le risposte tardive arrivano al foglio) e ci si riprova fra un\'ora',
    m.uscite.destinazione !== null && r1.scadenze[m.uscite.id] !== undefined &&
    r1.chiusi[m.uscite.id + '|2026-27'] === undefined && m.trigger.some(x => x.dopo === 60 * 60 * 1000));
  m.adesso = new Date('2027-07-01T01:10:00+02:00').getTime();
  c.PANNELLO_chiusura();
  verifica('al tentativo dopo si chiude davvero', m.uscite.aperto === false && m.uscite.destinazione === null &&
    scheda(m)[1][7].indexOf('chiuso il 30/06/2027') === 0);
}

// un foglio trovato per nome, gia' usato: se il primo collegamento fallisce,
// la volta dopo va collegato, non preso per "scollegato a mano"
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  const suo = new m.FoglioDiCalcolo('Risposte Recuperi - A.S. 2026-27', m.cartella('A.S. 2026-27/RECUPERI'));
  m.recuperi.setDestination('SPREADSHEET', suo.id);           // collegato dallo script dentro il modulo...
  m.recuperi.removeDestination();                             // ...e poi scollegato
  const vera = m.recuperi.setDestination;
  m.recuperi.setDestination = function () { throw new Error('Service error: Forms'); };
  c.PANNELLO_4_preparaAnno();
  verifica('(primo collegamento fallito: la riga dice problema)', scheda(m)[0][7].indexOf('problema') === 0);
  m.recuperi.setDestination = vera;
  c.PANNELLO_4_preparaAnno();
  verifica('la volta dopo il foglio trovato per nome viene collegato',
    m.recuperi.destinazione !== null && m.recuperi.destinazione.foglio.id === suo.id &&
    scheda(m)[0][7] === 'pronto per 2026-27');
}

// una chiusura che non riesce non ferma le altre e ci riprova
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  m.pannello.getSheetByName('Moduli').getRange(2, 5).setValue('30/06');   // anche Recuperi il 30/06
  c.PANNELLO_4_preparaAnno();
  m.recuperi.removeDestination = function () { throw new Error('Service error: Forms'); };
  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  const t = c.PANNELLO_chiusura();
  const ricordo = JSON.parse(m.proprieta.get('CAMPANELLA_PANNELLO'));
  verifica('chiusura non riuscita: lo scrive nella riga', scheda(m)[0][7].indexOf('chiusura non riuscita') === 0);
  verifica('e la sua scadenza resta, con un nuovo tentativo programmato',
    ricordo.scadenze[m.recuperi.id] !== undefined && m.trigger.some(x => x.dopo === 60 * 60 * 1000));
  verifica('l\'altra riga si chiude e la memoria lo ricorda',
    m.uscite.aperto === false && ricordo.chiusi[m.uscite.id + '|2026-27'] === '2027-06-30' && t.indexOf('Riprovo') >= 0);
}

// Google continua a non chiudere un modulo: un giorno intero di tentativi
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  c.PANNELLO_4_preparaAnno();
  m.uscite.setAcceptingResponses = function () { throw new Error('Service error: Forms'); };
  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  let scattato = m.trigger.find(x => x.mese === 7);
  for (let i = 0; i < 24; i++) {
    c.PANNELLO_chiusura({ triggerUid: scattato.uid });
    scattato = m.trigger[m.trigger.length - 1];
    m.adesso += 60 * 60 * 1000;
  }
  verifica('24 chiusure fallite di fila: i trigger non si accumulano (quello del 31/08 e un tentativo)',
    m.trigger.length === 2 && m.trigger.filter(x => x.dopo === 60 * 60 * 1000).length === 1 &&
    m.trigger.some(x => x.mese === 9 && x.giorno === 1));
}

// la chiusura scatta mentre "Prepara l'anno nuovo" sta lavorando
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  c.PANNELLO_4_preparaAnno();
  const scattato = m.trigger.find(x => x.mese === 7);
  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  m.lockOccupato = true;
  const t = c.PANNELLO_chiusura({ triggerUid: scattato.uid });
  verifica('lock occupato: la chiusura non tocca niente adesso', m.uscite.aperto === true &&
    m.uscite.destinazione !== null && t.indexOf('riprovo fra un\'ora') >= 0);
  verifica('e al posto del trigger scattato c\'e\' un tentativo fra un\'ora',
    m.trigger.indexOf(scattato) < 0 && m.trigger.some(x => x.dopo === 60 * 60 * 1000));
  m.lockOccupato = false;
  m.adesso += 60 * 60 * 1000;
  c.PANNELLO_chiusura({ triggerUid: m.trigger.find(x => x.dopo).uid });
  verifica('al tentativo dopo chiude, e resta solo la chiusura del 31/08',
    m.uscite.aperto === false && m.trigger.length === 1 && m.trigger[0].mese === 9);
}

// una riga che non riesce a prepararsi tiene la sua chiusura programmata
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  c.PANNELLO_4_preparaAnno();
  const recuperi = m.recuperi;
  m.moduli.delete(recuperi.id);                                  // per un momento Google non lo apre
  const t = c.PANNELLO_4_preparaAnno();
  verifica('(la riga di Recuperi non riesce)', t.indexOf('PROBLEMA') >= 0 && scheda(m)[0][7].indexOf('problema') === 0);
  verifica('ma la sua chiusura del 31/08 resta programmata',
    m.trigger.length === 2 && m.trigger.some(x => x.anno === 2027 && x.mese === 9 && x.giorno === 1));
  m.moduli.set(recuperi.id, recuperi);
  m.adesso = new Date('2027-09-01T00:10:00+02:00').getTime();
  c.PANNELLO_chiusura({ triggerUid: m.trigger.find(x => x.mese === 9).uid });
  verifica('e quando scatta, il modulo si chiude', recuperi.aperto === false && recuperi.destinazione === null);
}

// una chiusura gia' scaduta e non riuscita resta da riprovare anche dopo "Prepara"
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  c.PANNELLO_4_preparaAnno();
  const vera = m.uscite.setAcceptingResponses;
  m.uscite.setAcceptingResponses = function (si) { if (!si) throw new Error('Service error: Forms'); return vera.call(this, si); };
  m.adesso = new Date('2027-07-01T00:10:00+02:00').getTime();
  c.PANNELLO_chiusura({ triggerUid: m.trigger.find(x => x.mese === 7).uid });
  m.adesso = new Date('2027-07-01T00:40:00+02:00').getTime();
  c.PANNELLO_4_preparaAnno();                                    // intanto qualcuno riesegue la preparazione
  verifica('la preparazione rieseguita non butta via il tentativo della chiusura non riuscita',
    m.trigger.some(x => x.dopo === 60 * 60 * 1000) && m.trigger.some(x => x.mese === 9));
  m.uscite.setAcceptingResponses = vera;
  m.adesso = new Date('2027-07-01T01:40:00+02:00').getTime();
  c.PANNELLO_chiusura({ triggerUid: m.trigger.find(x => x.dopo).uid });
  verifica('e al tentativo dopo Uscite si chiude', m.uscite.aperto === false && m.uscite.destinazione === null);
}

// un foglio creato con Google in inglese
{
  const m = nuovoMondo();
  m.pannello.schede[0].nome = 'Sheet1';
  const c = carica(m);
  c.PANNELLO_1_preparaIlFoglio();
  verifica('anche Sheet1 (Google in inglese) se ne va',
    JSON.stringify(m.pannello.nomiSchede()) === '["Moduli","Istruzioni"]');
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
  verifica('lo spiega', t.indexOf('Google le ricopia nel foglio dell') >= 0);

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
  verifica('nessuna risposta persa', m.perse() === 0);
}

titolo('SVUOTARE: DOPO "ANNULLA" ARRIVANO 10 RISPOSTE SOLO NEL MODULO');
{
  const p = mondoPronto();
  const m = p.m, c = p.c;
  m.pannello.getSheetByName('Moduli').getRange(2, 6).setValue(true);        // Recuperi: svuota
  c.PANNELLO_4_preparaAnno();
  const primo = m.recuperi.destinazione.foglio;
  m.recuperi.rispondi(200);
  m.adesso = new Date('2027-09-01T00:10:00+02:00').getTime();
  c.PANNELLO_chiusura();
  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  c.PANNELLO_4_preparaAnno();
  verifica('(anno 2: le 200 dell\'anno prima tolte dal modulo, stanno nel loro foglio)',
    m.recuperi.risposte.length === 0 && primo.righeDiRisposte() === 200);
  const secondo = m.recuperi.destinazione.foglio;
  m.recuperi.rispondi(50);
  c.PANNELLO_ANNULLA();
  m.recuperi.rispondi(10);                                   // aperto, ma non scrive in nessun foglio
  const t = c.PANNELLO_4_preparaAnno();
  verifica('60 risposte, 10 in nessun foglio: NON le toglie, anche se il foglio vecchio ha 200 righe',
    m.recuperi.risposte.length === 60 && t.indexOf('NON le tolgo') >= 0);
  verifica('e il foglio dell\'anno, ricollegato, le riceve tutte',
    m.recuperi.destinazione.foglio.id === secondo.id && secondo.righeDiRisposte() === 60);
  verifica('nessuna risposta persa', m.perse() === 0);
}

titolo('SVUOTARE: UN MODULO SCOLLEGATO, CON RISPOSTE ARRIVATE SOLO LI\'');
{
  // come lasciava le cose una chiusura fallita di una versione di prima: scollegato ma aperto
  const p = mondoPronto();
  const m = p.m, c = p.c;
  m.pannello.getSheetByName('Moduli').getRange(2, 6).setValue(true);        // Recuperi: svuota
  c.PANNELLO_4_preparaAnno();
  const primo = m.recuperi.destinazione.foglio;
  m.recuperi.rispondi(40);
  // e un foglio di due anni fa, con piu' righe di quante il modulo ne abbia
  const vecchio = new m.FoglioDiCalcolo('Risposte Recuperi - A.S. 2025-26', m.cartella('A.S. 2025-26/RECUPERI'));
  const sv = vecchio.insertSheet('Risposte del modulo 1');
  sv.scrivi(0, 0, 'Informazioni cronologiche');
  for (let i = 0; i < 200; i++) sv.scrivi(i + 1, 0, new Date(m.adesso - 400 * 24 * 3600 * 1000 + i * 60000));
  const r = JSON.parse(m.proprieta.get('CAMPANELLA_PANNELLO'));
  r.fogli[m.recuperi.id + '|2025-26'] = vecchio.id;
  m.proprieta.set('CAMPANELLA_PANNELLO', JSON.stringify(r));
  m.recuperi.removeDestination();
  m.recuperi.rispondi(7);                                    // queste stanno solo nel modulo
  m.adesso = new Date('2027-09-03T09:00:00+02:00').getTime();
  const t = c.PANNELLO_4_preparaAnno();
  verifica('47 risposte, 7 solo nel modulo: NON le toglie, anche se il foglio di due anni fa ha 200 righe',
    m.recuperi.risposte.length === 47 && t.indexOf('NON le tolgo: 7 non le ritrovo') >= 0 && primo.righeDiRisposte() === 40);
  verifica('nessuna risposta persa', m.perse() === 0);
}

titolo('LA CONFERMA DICE IL VERO SULLO SVUOTARE');
{
  const p = mondoPronto();
  p.m.pannello.getSheetByName('Moduli').getRange(2, 6).setValue(true);      // Recuperi: svuota
  p.c.PANNELLO_4_preparaAnno();
  const domanda = p.m.avvisi.filter(a => a.bottoni === 'YES_NO')[0].testo;
  verifica('con una riga "Svuota" non dice "Non cancello niente", e dice che non si annulla',
    domanda.indexOf('Non cancello niente') < 0 && domanda.indexOf('non si puo\' annullare') >= 0);
  const q = mondoPronto();
  q.c.PANNELLO_4_preparaAnno();
  verifica('senza righe "Svuota" dice che non cancella niente',
    q.m.avvisi.filter(a => a.bottoni === 'YES_NO')[0].testo.indexOf('Non cancello niente') >= 0);
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
  verifica('e lo scrive nella sua riga, non solo nel registro',
    scheda(p.m)[1][7].indexOf('non si apre piu\'') === 0);
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

// ---- 8e. il foglio trovato per nome diventa il foglio dell'anno ---------------------------
titolo('IL FOGLIO TROVATO PER NOME VIENE RICORDATO');
{
  const p = mondoPronto();
  // come dopo l'altro script: il foglio dell'anno c'e' gia', nella sua cartella
  const suo = new p.m.FoglioDiCalcolo('Risposte Recuperi - A.S. 2026-27', p.m.cartella('A.S. 2026-27/RECUPERI'));
  p.c.PANNELLO_4_preparaAnno();
  verifica('lo usa senza crearne un altro', p.m.recuperi.destinazione.foglio.id === suo.id && p.m.fogliCreati === 1);
  const segnati = ricordo(p.m).fogli;
  verifica('e se lo segna come foglio dell\'anno', segnati[p.m.recuperi.id + '|2026-27'] === suo.id);
  p.c.PANNELLO_5_controlla();
  verifica('cosi" Controlla" lo riconosce come suo',
    scheda(p.m)[0][7].indexOf('collegato al foglio di quest') === 0);
}

// ---- 8f. tanti moduli per tanti anni ----------------------------------------------------------
titolo('25 MODULI PER 10 ANNI: LA MEMORIA RESTA SOTTO IL TETTO DI GOOGLE');
{
  const moduli = [];
  for (let i = 1; i <= 25; i++) {
    const n = ('0' + i).slice(-2);
    moduli.push({ modulo: 'Modulo ' + n, cartella: 'MODULI', foglio: 'Risposte ' + n + ' - A.S. {anno}', chiusura: '31/08', svuota: false });
  }
  const m = nuovoMondo();
  for (const x of moduli) new m.Modulo(x.modulo, m.cartella('MODELLI'));
  const c = carica(m, { config: { moduli } });
  c.PANNELLO_1_preparaIlFoglio();
  c.PANNELLO_2_trovaIModuli();
  let problemi = 0;
  for (let a = 2026; a < 2036; a++) {
    m.adesso = new Date(a + '-09-02T10:00:00+02:00').getTime();
    const t = c.PANNELLO_4_preparaAnno();
    if (t.indexOf('PROBLEMA') >= 0 || t.indexOf('Non ho potuto') >= 0) problemi++;
    m.adesso = new Date((a + 1) + '-09-01T00:10:00+02:00').getTime();
    c.PANNELLO_chiusura({ triggerUid: m.trigger.length ? m.trigger[0].uid : '' });
  }
  const piuLunga = Math.max(...[...m.proprieta.values()].map(v => Buffer.byteLength(v, 'utf8')));
  verifica('dieci anni di preparazioni e chiusure senza problemi, un foglio per modulo e per anno',
    problemi === 0 && m.fogliCreati === 250);
  verifica('ogni proprieta\' sta sotto i 9 KB (la piu\' lunga: ' + piuLunga + ' byte)', piuLunga < 9 * 1024);
  m.adesso = new Date('2035-09-10T10:00:00+02:00').getTime();
  c.PANNELLO_4_preparaAnno();
  verifica('rieseguito il decimo anno: nessun foglio in piu\', li ricorda tutti', m.fogliCreati === 250 &&
    Object.keys(ricordo(m).fogli).length === 250);
}

// una memoria scritta da una versione di prima, con i fogli di tutti gli anni insieme
{
  const p = mondoPronto();
  p.c.PANNELLO_4_preparaAnno();
  const r = ricordo(p.m);
  for (const k of [...p.m.proprieta.keys()]) p.m.proprieta.delete(k);
  p.m.proprieta.set('CAMPANELLA_PANNELLO', JSON.stringify(r));        // com'era prima: tutto in una
  p.c.PANNELLO_4_preparaAnno();
  verifica('memoria di prima con tutti i fogli insieme: li riconosce e li divide per anno',
    p.m.fogliCreati === 2 && JSON.parse(p.m.proprieta.get('CAMPANELLA_PANNELLO')).fogli &&
    Object.keys(JSON.parse(p.m.proprieta.get('CAMPANELLA_PANNELLO')).fogli).length === 0 &&
    Object.keys(JSON.parse(p.m.proprieta.get('CAMPANELLA_PANNELLO_FOGLI_2026-27'))).length === 2);
}

// ---- 8g. tante righe: il limite dei 6 minuti ---------------------------------------------------
titolo('30 RIGHE LENTE: MI FERMO PRIMA DEI 6 MINUTI DI GOOGLE');
{
  const moduli = [];
  for (let i = 1; i <= 30; i++) {
    const n = ('0' + i).slice(-2);
    moduli.push({ modulo: 'Modulo ' + n, cartella: '', foglio: 'Risposte ' + n + ' - A.S. {anno}', chiusura: '31/08', svuota: false });
  }
  const m = nuovoMondo();
  for (const x of moduli) new m.Modulo(x.modulo, m.cartella('MODELLI'));
  const c = carica(m, { config: { moduli } });
  c.PANNELLO_1_preparaIlFoglio();
  c.PANNELLO_2_trovaIModuli();
  m.costoApertura = 15 * 1000;                                // ogni modulo: 15 secondi
  const inizio = m.adesso;
  const t = c.PANNELLO_4_preparaAnno();
  const pronte = scheda(m).filter(r => r[7] === 'pronto per 2026-27').length;
  verifica('si ferma prima dei 6 minuti (' + Math.round((m.adesso - inizio) / 1000) + ' s)', m.adesso - inizio <= 280 * 1000);
  verifica('e dice che non ha finito, e cosa manca', t.indexOf('NON HO FINITO') >= 0 && t.indexOf('Da preparare ancora') >= 0);
  verifica('le righe fatte sono nella scheda, le altre dicono di rieseguire', pronte > 0 && pronte < 30 &&
    scheda(m).filter(r => String(r[7]).indexOf('tempo finito') >= 0).length === 30 - pronte);
  verifica('le chiusure delle righe fatte sono programmate', m.trigger.length === 1);
  const t2 = c.PANNELLO_4_preparaAnno();
  verifica('rieseguito: riparte dalle righe mancanti e le finisce tutte',
    scheda(m).every(r => r[7] === 'pronto per 2026-27') && t2.indexOf('FATTO') >= 0 && m.fogliCreati === 30);
  verifica('e dice quali righe gia\' pronte non ha ricontrollato', t2.indexOf('non ricontrollate adesso') >= 0);
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
  // la chiusura illeggibile ferma la riga prima di creare o collegare qualcosa:
  // meglio una riga ferma e da correggere che una fatta a meta'
  verifica('chiusura scritta a parole: problema solo su quella riga, prima di toccare niente',
    tb.indexOf('giorno/mese') >= 0 && brutto.m.fogliCreati === 1 && scheda(brutto.m)[1][7] === 'pronto per 2026-27');
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
