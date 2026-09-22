/**
 * ============================================================================
 *  PANNELLO DEI MODULI - un foglio solo per tutti i moduli Google
 * ============================================================================
 *
 *  Serve quando i moduli sono piu' di uno. Invece di incollare uno script
 *  dentro ogni modulo, si tiene un foglio Google con una riga per modulo: da
 *  li' si prepara l'anno nuovo per tutti insieme, e si vede a colpo d'occhio
 *  quali sono a posto.
 *
 *  LA SCHEDA NON SI AGGIORNA DA SOLA. Le righe le comandi tu: un modulo nuovo
 *  e' una riga in piu' (nome, poi "Trova i moduli nel Drive"), uno che non
 *  serve piu' e' una spunta "Attivo" tolta. Le colonne Stato e Ultima
 *  esecuzione dicono com'e' andata l'ultima volta che hai eseguito qualcosa:
 *  per rileggere la situazione vera c'e' "Controlla com'e' messo adesso".
 *
 *  Va incollato in un FOGLIO GOOGLE nuovo (Estensioni -> Apps Script), non
 *  dentro un modulo. Con un modulo solo conviene l'altro script, che chiede
 *  meno permessi.
 *
 *  COSA FA, per ogni riga attiva
 *    - crea il foglio Google delle risposte dell'anno (se non c'e' gia');
 *    - lo mette nella cartella dell'anno, dentro "Il mio Drive";
 *    - collega il modulo a quel foglio e lo riapre alle risposte;
 *    - programma la chiusura: finito il giorno indicato chiude il modulo e
 *      scollega il foglio, che resta fermo com'e'.
 *
 *  COSA NON FA
 *    Non cancella moduli, fogli, cartelle o risposte. Non manda email. Non
 *    condivide niente. Le risposte degli anni scorsi le toglie da un modulo
 *    solo se lo chiedi nella sua riga, e solo dopo aver verificato che stanno
 *    gia' in un foglio degli anni scorsi.
 *
 *  FUNZIONI  (dal menu Campanella, dentro il foglio)
 *    PANNELLO_1_preparaIlFoglio ... crea la scheda con le colonne e le righe
 *    PANNELLO_2_trovaIModuli ...... cerca i moduli nel Drive e riempie i link
 *    PANNELLO_3_anteprima ......... dice cosa farebbe, senza fare niente
 *    PANNELLO_4_preparaAnno ....... prepara l'anno nuovo per tutte le righe
 *    PANNELLO_5_controlla ......... rilegge da Google com'e' messo ogni modulo
 *    PANNELLO_ANNULLA ............. toglie chiusura e collegamento (tutte)
 *    PANNELLO_chiusura ............ la chiama Google quando arriva il giorno
 *
 *  PERMESSI (da concedere tutti)
 *    Moduli ....... APRIRE I TUOI MODULI: questo script lavora su moduli che
 *                   stanno fuori dal foglio, quindi Google chiede il permesso
 *                   su tutti i moduli dell'account, non su uno solo. E' il
 *                   prezzo del pannello unico: lo script apre soltanto quelli
 *                   elencati nella scheda.
 *    Fogli ........ creare i fogli delle risposte
 *    Drive ........ trovare i moduli e le cartelle dell'anno
 *    Trigger ...... le chiusure programmate
 * ============================================================================
 */

// >>> CONFIGURAZIONE >>>  (scritta da Campanella: Cartelle, passo 2)
var PANNELLO = {
  anno:         'auto',                    // 'auto' = dal primo settembre l'anno nuovo; oppure '2026-27'
  cartellaAnno: 'A.S. {anno}',             // nella radice di "Il mio Drive"
  chiusura:     '31/08',                   // giorno/mese proposto alle righe di partenza; quelle che aggiungi tu solo se lo scrivi in Chiusura
  fusoOrario:   'Europe/Rome',
  scheda:       'Moduli',                  // la scheda di questo foglio con l'elenco
  moduli: [                                // le righe di partenza: poi comanda la scheda
    { modulo: 'Recuperi', cartella: 'RECUPERI', foglio: 'Risposte Recuperi - A.S. {anno}', chiusura: '31/08', svuota: false }
  ]
};
// <<< CONFIGURAZIONE <<<

var _PAN_VERSIONE   = '1.4.6';
var _PAN_TRIGGER    = 'PANNELLO_chiusura';
var _PAN_CHIAVE     = 'CAMPANELLA_PANNELLO';
var _PAN_ISTRUZIONI = 'Istruzioni';       // la scheda che ricorda come si usa il foglio

// le colonne della scheda, nell'ordine
var _PAN_COLONNE = [
  'Modulo', 'Link del modulo', 'Cartella del foglio', 'Nome del foglio',
  'Chiusura', 'Svuota', 'Attivo', 'Stato', 'Foglio dell\'anno', 'Ultima esecuzione'
];
var _PAN_C = { NOME: 0, LINK: 1, CARTELLA: 2, FOGLIO: 3, CHIUSURA: 4, SVUOTA: 5, ATTIVO: 6, STATO: 7, URL: 8, QUANDO: 9 };


// ===========================================================================
//  IL MENU
// ===========================================================================
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Campanella')
      .addItem('Prepara il foglio', 'PANNELLO_1_preparaIlFoglio')
      .addItem('Trova i moduli nel Drive', 'PANNELLO_2_trovaIModuli')
      .addSeparator()
      .addItem('Anteprima: cosa succederebbe', 'PANNELLO_3_anteprima')
      .addItem('Prepara l\'anno nuovo', 'PANNELLO_4_preparaAnno')
      .addItem('Controlla com\'e\' messo adesso', 'PANNELLO_5_controlla')
      .addSeparator()
      .addItem('Annulla: togli chiusure e collegamenti', 'PANNELLO_ANNULLA')
      .addToUi();
  } catch (e) {
    // aperto da un contesto senza interfaccia: il menu non serve
  }
}


// ===========================================================================
//  LE FUNZIONI
// ===========================================================================
function PANNELLO_1_preparaIlFoglio() {
  return _panRacconta(_panUnoAllaVolta(function () { return _panPreparaIlFoglio(); }));
}

function PANNELLO_2_trovaIModuli() {
  return _panRacconta(_panUnoAllaVolta(function () { return _panTrovaIModuli(); }));
}

function PANNELLO_3_anteprima() {
  return _panRacconta(_panUnoAllaVolta(function () { return _panEsegui(false); }));
}

function PANNELLO_4_preparaAnno() {
  if (!_panConferma('Preparo l\'anno scolastico ' + _panAnno() + ' per tutte le righe attive.\n\n' +
                    'Non cancello niente. Procedo?')) return '';
  return _panRacconta(_panUnoAllaVolta(function () { return _panEsegui(true); }));
}

/**
 * Rilegge da Google com'e' messo ogni modulo adesso e lo riscrive nelle righe.
 * Le colonne Stato e Ultima esecuzione sono un diario di quello che ha fatto lo
 * script: se qualcosa cambia fuori di qui (un modulo scollegato a mano, chiuso,
 * buttato nel cestino) restano indietro finche' non si guarda davvero.
 */
function PANNELLO_5_controlla() {
  return _panRacconta(_panUnoAllaVolta(function () { return _panControlla(); }));
}

function PANNELLO_ANNULLA() {
  if (!_panConferma('Tolgo le chiusure programmate e scollego i fogli di quest\'anno.\n' +
                    'I fogli restano nel Drive con le risposte che contengono. Procedo?')) return '';
  return _panRacconta(_panUnoAllaVolta(function () { return _panAnnulla(); }));
}

/** La chiama Google, da sola, finito un giorno di chiusura. */
function PANNELLO_chiusura() {
  var righe = ['CHIUSURE DI FINE ANNO', ''];
  var oggi = _panOggi();
  var foglio = _panScheda(false);
  if (!foglio) { Logger.log('Non trovo la scheda ' + PANNELLO.scheda + '.'); return; }
  var dati = _panLeggi(foglio);
  var memoria = _panMemoria();
  var fatte = 0;
  var riprovare = false;

  // La scadenza e' quella segnata quando l'anno e' stato preparato, non ricalcolata
  // adesso: la chiusura scatta il primo settembre, quando l'anno scolastico e' gia'
  // cambiato, e ricalcolarla darebbe la scadenza dell'anno nuovo.
  for (var i = 0; i < dati.righe.length; i++) {
    var r = dati.righe[i];
    if (!r.attivo || !r.id) continue;
    var scadenza = memoria.scadenze[r.id];
    if (!scadenza || oggi <= scadenza) continue;      // non e' ancora ora per questa riga

    var form = null;
    try { form = FormApp.openById(r.id); } catch (e2) {
      // cancellato durante l'anno: tolgo la scadenza, altrimenti resterebbe in
      // sospeso per sempre e terrebbe in piedi le chiusure programmate. E lo
      // scrivo nella sua riga: questa funzione la chiama Google da sola, il
      // registro non lo legge nessuno
      righe.push(r.nome + ': non riesco ad aprirlo (' + (e2.message || e2) + '). Tolgo la sua scadenza.');
      _panScriviStato(foglio, r, 'non si apre piu\' (cancellato?): chiusura saltata', null);
      delete memoria.scadenze[r.id];
      continue;
    }
    // una riga che non riesce non deve fermare le altre, ne' far perdere quello
    // che le altre hanno fatto: la memoria si salva comunque, in fondo
    try {
      // Prima si chiude, e si controlla che sia chiuso davvero: se Google non
      // risponde, il modulo resta collegato al foglio (le risposte tardive ci
      // arrivano lo stesso) e fra un'ora si riprova. Un modulo non pubblicato
      // non raccoglie risposte comunque: quello non lo riprovo per sempre.
      try { _panRiprova(function () { form.setAcceptingResponses(false); }); } catch (e3) { /* lo guardo qui sotto */ }
      var ancoraAperto = false;
      try { ancoraAperto = form.isAcceptingResponses(); } catch (e6) { ancoraAperto = false; }
      if (ancoraAperto) {
        var pubblicato = true;
        try {
          if (typeof form.supportsAdvancedResponderPermissions === 'function' &&
              form.supportsAdvancedResponderPermissions()) pubblicato = form.isPublished();
        } catch (e7) { pubblicato = true; }
        if (pubblicato) throw new Error('il modulo accetta ancora risposte');
      }
      if (_panDestinazione(form)) {
        _panRiprova(function () { form.removeDestination(); });
        righe.push(r.nome + ': modulo chiuso, foglio scollegato.');
      } else {
        righe.push(r.nome + ': modulo chiuso (non era collegato a nessun foglio).');
      }
    } catch (e5) {
      var guasto = String(e5.message || e5);
      righe.push(r.nome + ': chiusura non riuscita (' + guasto + '). Riprovo fra un\'ora.');
      _panScriviStato(foglio, r, 'chiusura non riuscita: ' + guasto, null);
      riprovare = true;                               // la scadenza resta: ci riprovo
      continue;
    }
    _panScriviStato(foglio, r, 'chiuso il ' + _panLeggibile(scadenza), null);
    delete memoria.scadenze[r.id];
    // il segno che per quell'anno la chiusura e' scattata: "Prepara l'anno nuovo"
    // rieseguito dopo non deve disfarla, qualunque giorno ci sia adesso nella cella.
    // L'anno dalla data, non da PANNELLO.anno: con l'anno fisso e il codice gia'
    // reincollato per l'anno dopo, PANNELLO.anno direbbe l'anno sbagliato
    memoria.chiusi[r.id + '|' + _panAnnoDellaData(scadenza)] = scadenza;
    fatte++;
  }
  _panRicorda(memoria);
  _panTogliTriggerPassati(memoria);
  // il trigger che mi ha chiamato non scatta piu': per le righe non riuscite
  // ne programmo un altro, fra un'ora
  if (riprovare) ScriptApp.newTrigger(_PAN_TRIGGER).timeBased().after(60 * 60 * 1000).create();
  righe.push('');
  righe.push(fatte === 0 ? 'Niente da chiudere oggi.' : 'Chiusure fatte: ' + fatte + '.');
  var testo = righe.join('\n');
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  IL FOGLIO
// ===========================================================================
function _panPreparaIlFoglio() {
  var ss = SpreadsheetApp.getActive();
  var foglio = ss.getSheetByName(PANNELLO.scheda);
  var nuovo = false;
  if (!foglio) { foglio = ss.insertSheet(PANNELLO.scheda); nuovo = true; }

  var intestazioni = [_PAN_COLONNE];
  foglio.getRange(1, 1, 1, _PAN_COLONNE.length).setValues(intestazioni).setFontWeight('bold');
  foglio.setFrozenRows(1);

  // La colonna della chiusura va messa a "testo" PRIMA di scriverci dentro: se no
  // il foglio legge "31/08" come una data e ci mette dentro il 31 agosto di
  // quest'anno, che poi lo script si ritrova come un data lunghissima.
  var quante = Math.max(foglio.getMaxRows(), 2);
  foglio.getRange(2, _PAN_C.CHIUSURA + 1, quante - 1, 1).setNumberFormat('@');
  _panRaddrizzaChiusure(foglio);

  var righe = [];
  if (nuovo || foglio.getLastRow() < 2) {
    var anno = _panAnno();
    for (var i = 0; i < (PANNELLO.moduli || []).length; i++) {
      var m = PANNELLO.moduli[i];
      var riga = [];
      riga[_PAN_C.NOME] = m.modulo || '';
      riga[_PAN_C.LINK] = '';
      riga[_PAN_C.CARTELLA] = m.cartella || '';
      riga[_PAN_C.FOGLIO] = m.foglio || ('Risposte ' + (m.modulo || '') + ' - A.S. {anno}');
      riga[_PAN_C.CHIUSURA] = m.chiusura || PANNELLO.chiusura || '';
      riga[_PAN_C.SVUOTA] = !!m.svuota;
      riga[_PAN_C.ATTIVO] = true;
      riga[_PAN_C.STATO] = 'da preparare';
      riga[_PAN_C.URL] = '';
      riga[_PAN_C.QUANDO] = '';
      righe.push(riga);
    }
    if (righe.length > 0) {
      foglio.getRange(2, 1, righe.length, _PAN_COLONNE.length).setValues(righe);
    }
  }

  _panSpunte(foglio);

  var note = _panNoteColonne();
  for (var c = 0; c < note.length; c++) foglio.getRange(1, c + 1).setNote(note[c]);

  for (var k = 0; k < _PAN_COLONNE.length; k++) foglio.setColumnWidth(k + 1, k === _PAN_C.LINK ? 260 : 170);

  var schede = _panOrdinaLeSchede(ss, foglio);

  return 'Scheda "' + PANNELLO.scheda + '" pronta' +
    (righe.length ? ', con ' + (righe.length === 1 ? 'una riga' : righe.length + ' righe') + ' di partenza' : '') + '.\n' +
    _panRaccontaSchede(schede) + '\n\n' +
    'Adesso: incolla il link di ogni modulo nella colonna "Link del modulo", oppure usa\n' +
    '"Trova i moduli nel Drive" e li cerca lui dal nome. Poi "Anteprima".';
}

/**
 * Le caselle "Svuota" e "Attivo", solo sulle righe che hanno un modulo.
 *
 * Non uso insertCheckboxes(): secondo la documentazione di Google rimette a
 * "falso" tutte le celle, e rieseguire "Prepara il foglio" avrebbe spento ogni
 * riga. La casella la metto con la convalida, che i valori non li tocca, e i
 * valori li riscrivo io: quello che c'era resta, e una riga nuova (Attivo
 * ancora vuoto) parte accesa, come dice la nota della colonna.
 *
 * Sotto l'ultima riga niente caselle: una casella vuota sembra spenta, e una
 * riga aggiunta a mano partirebbe spenta senza che nessuno l'abbia deciso. Le
 * versioni di prima le mettevano fino in fondo al foglio, tutte spente: qui le
 * tolgo.
 */
function _panSpunte(foglio) {
  var dati = _panLeggi(foglio);
  var casella = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  var ultima = 1;
  for (var i = 0; i < dati.righe.length; i++) {
    var r = dati.righe[i];
    var v = dati.valori[r.indice];
    var riga = r.indice + 2;
    foglio.getRange(riga, _PAN_C.SVUOTA + 1, 1, 2)          // Svuota e Attivo sono vicine
      .setDataValidation(casella)
      .setValues([[v[_PAN_C.SVUOTA] === true, v[_PAN_C.ATTIVO] !== false]]);
    if (riga > ultima) ultima = riga;
  }
  var fondo = foglio.getMaxRows();
  if (fondo > ultima) {
    var sotto = foglio.getRange(ultima + 1, _PAN_C.SVUOTA + 1, fondo - ultima, 2);
    sotto.clearDataValidations();
    sotto.clearContent();
  }
}

/** Cosa va scritto in ogni colonna: finisce nelle note delle intestazioni e nelle istruzioni. */
function _panNoteColonne() {
  var note = [];
  note[_PAN_C.NOME] = 'Il nome del modulo, come lo vedi in Google Moduli. Serve anche a cercarlo nel Drive.';
  note[_PAN_C.LINK] = 'Il link del modulo APERTO PER MODIFICARLO (.../forms/d/.../edit), non quello che dai agli studenti. Lo riempie anche "Trova i moduli nel Drive".';
  note[_PAN_C.CARTELLA] = 'Dentro la cartella dell\'anno. Vuota = direttamente nella cartella dell\'anno. Sottocartelle con la barra: RECUPERI/TRIMESTRE.';
  note[_PAN_C.FOGLIO] = '{anno} diventa l\'anno scolastico. Se un foglio con questo nome c\'e\' gia\', usa quello.';
  note[_PAN_C.CHIUSURA] = 'Giorno/mese, per esempio 31/08. Vuoto = nessuna chiusura automatica per questo modulo.';
  note[_PAN_C.SVUOTA] = 'Toglie dal modulo le risposte degli anni scorsi, ma solo dopo aver controllato che stanno gia\' tutte in un foglio vecchio.';
  note[_PAN_C.ATTIVO] = 'Togli la spunta per saltare questa riga.';
  note[_PAN_C.STATO] = 'Lo scrive lo script.';
  note[_PAN_C.URL] = 'Lo scrive lo script: il foglio delle risposte di quest\'anno.';
  note[_PAN_C.QUANDO] = 'Lo scrive lo script.';
  return note;
}


// ===========================================================================
//  LE SCHEDE DEL FOGLIO: prima Moduli, poi Istruzioni, e via Foglio1
// ===========================================================================

/**
 * Mette in ordine le schede: Moduli per prima, Istruzioni subito dopo, e via
 * le schede vuote che Google crea da solo con il foglio nuovo ("Foglio1").
 * Toglie solo schede che hanno ancora il nome di partenza e sono vuote: una
 * scheda tua, anche vuota ma rinominata, resta dov'e'. Restituisce i nomi
 * delle schede tolte.
 */
function _panOrdinaLeSchede(ss, moduli) {
  var istruzioni = _panScriviIstruzioni(ss);
  var tolte = [];
  var schede = ss.getSheets();
  for (var i = 0; i < schede.length; i++) {
    var s = schede[i];
    var nome = s.getName();
    if (nome === moduli.getName() || nome === istruzioni.getName()) continue;
    if (!_panSchedaDiPartenza(s)) continue;
    if (ss.getSheets().length <= 1) break;            // un foglio senza schede non esiste
    ss.deleteSheet(s);
    tolte.push(nome);                                 // il nome va letto prima: dopo la scheda non c'e' piu'
  }

  // prima Moduli in cima, poi Istruzioni al secondo posto: nell'ordine
  // inverso Istruzioni finirebbe spinta in fondo
  ss.setActiveSheet(moduli);
  ss.moveActiveSheet(1);
  ss.setActiveSheet(istruzioni);
  ss.moveActiveSheet(2);
  ss.setActiveSheet(moduli);
  return { tolte: tolte, istruzioni: istruzioni.getName() };
}

/** Quello che _panOrdinaLeSchede ha fatto, da dire a chi ha eseguito. */
function _panRaccontaSchede(esito) {
  var t = 'Scheda "' + esito.istruzioni + '" aggiornata: li\' trovi come si usa il foglio.';
  if (esito.istruzioni !== _PAN_ISTRUZIONI) {
    t += '\nLa scheda "' + _PAN_ISTRUZIONI + '" che c\'era gia\' e\' tua: non l\'ho toccata.';
  }
  if (esito.tolte.length) t += '\nTolta la scheda vuota ' + esito.tolte.join(', ') + '.';
  return t;
}

/** La scheda che Google mette nel foglio nuovo, ancora intatta. */
function _panSchedaDiPartenza(s) {
  if (!/^(Foglio|Sheet|Hoja|Feuille|Tabelle|Planilha|Folha|Blad|Arkusz)\s*\d+$/i.test(s.getName())) return false;
  if (s.getLastRow() > 0 || s.getLastColumn() > 0) return false;
  // getLastRow conta solo il contenuto delle celle: grafici, immagini,
  // disegni (anche un bottone con uno script), filtri e note vanno guardati a parte
  try { if (s.getCharts().length > 0) return false; } catch (e) { /* niente grafici da contare */ }
  try { if (s.getImages().length > 0) return false; } catch (e2) { /* niente immagini da contare */ }
  try { if (s.getDrawings().length > 0) return false; } catch (e3) { /* niente disegni da contare */ }
  try { if (s.getSlicers().length > 0) return false; } catch (e4) { /* niente filtri da contare */ }
  try {
    var note = s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).getNotes();
    for (var r = 0; r < note.length; r++) {
      for (var c = 0; c < note[r].length; c++) if (note[r][c]) return false;
    }
  } catch (e5) { return false; }            // nel dubbio la scheda resta
  return true;
}

/**
 * La scheda Istruzioni: la riscrive lo script ogni volta, cosi' resta allineata
 * alla versione dello script e alla configurazione di adesso. E' protetta con
 * il solo avviso: chi ci scrive dentro viene avvertito, ma non bloccato.
 */
function _panScriviIstruzioni(ss) {
  var s = _panSchedaIstruzioni(ss);
  s.clear();

  var righe = _panTestoIstruzioni();
  var valori = [];
  for (var i = 0; i < righe.length; i++) valori.push([righe[i]]);
  var blocco = s.getRange(1, 1, valori.length, 1);
  // a testo PRIMA di scrivere: una riga che comincia con = o + il foglio la
  // prenderebbe per una formula
  blocco.setNumberFormat('@');
  blocco.setValues(valori).setWrap(true).setVerticalAlignment('top');
  s.setColumnWidth(1, 860);
  for (var r = 0; r < righe.length; r++) {
    if (_panEUnTitolo(righe[r])) s.getRange(r + 1, 1).setFontWeight('bold');
  }
  s.getRange(1, 1).setFontSize(13);
  try { s.setHiddenGridlines(true); } catch (e) { /* solo estetica */ }
  try {
    if (s.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      s.protect().setDescription('La scrive Campanella: le modifiche si perdono').setWarningOnly(true);
    }
  } catch (e2) { /* senza protezione funziona lo stesso */ }
  return s;
}

/**
 * La scheda in cui scrivere le istruzioni. Di norma "Istruzioni"; ma se una
 * scheda con quel nome c'e' gia' ed e' tua (un foglio condiviso con un collega,
 * degli appunti), non la tocco e uso "Istruzioni Campanella".
 */
function _panSchedaIstruzioni(ss) {
  var nomi = [_PAN_ISTRUZIONI, _PAN_ISTRUZIONI + ' Campanella'];
  for (var i = 0; i < nomi.length; i++) {
    var s = ss.getSheetByName(nomi[i]);
    if (!s) return ss.insertSheet(nomi[i]);
    if (_panEUnaMia(s)) return s;
  }
  for (var n = 2; ; n++) {
    var altro = _PAN_ISTRUZIONI + ' Campanella ' + n;
    var t = ss.getSheetByName(altro);
    if (!t) return ss.insertSheet(altro);
    if (_panEUnaMia(t)) return t;
  }
}

/** Una scheda che ha scritto lo script (o vuota): la posso riscrivere. */
function _panEUnaMia(s) {
  if (s.getLastRow() === 0 && s.getLastColumn() === 0) return true;
  try {
    if (String(s.getRange(1, 1).getValue()).indexOf('CAMPANELLA - COME SI USA') === 0) return true;
  } catch (e) { /* guardo la protezione */ }
  try {
    var p = s.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    for (var i = 0; i < p.length; i++) {
      if (String(p[i].getDescription() || '').indexOf('La scrive Campanella') === 0) return true;
    }
  } catch (e2) { /* nel dubbio non e' mia */ }
  return false;
}

function _panEUnTitolo(riga) {
  var t = String(riga || '');
  return t.length > 3 && /[A-Z]/.test(t) && t === t.toUpperCase();
}

/** Il testo della scheda Istruzioni, una riga per cella. */
function _panTestoIstruzioni() {
  var note = _panNoteColonne();
  // Qui niente valori calcolati oggi (l'anno di adesso, la cartella di adesso):
  // la scheda si riscrive solo con "Prepara il foglio" e "Prepara l'anno nuovo",
  // e fra una volta e l'altra quei valori invecchierebbero. Scrivo le regole.
  var automatico = String(PANNELLO.anno || 'auto').replace(/\s/g, '').toLowerCase() === 'auto';
  var fisso = automatico ? '' : String(PANNELLO.anno);

  var t = [];
  t.push('CAMPANELLA - COME SI USA QUESTO FOGLIO');
  t.push('Questa scheda la riscrive lo script ogni volta che scegli Campanella > Prepara il foglio o Prepara l\'anno nuovo: non scriverci dentro, si perderebbe.');
  t.push('');
  t.push('LA PRIMA VOLTA');
  t.push('1.  Campanella > Prepara il foglio. Crea la scheda "' + PANNELLO.scheda + '" e questa. Se l\'hai appena fatto, sei qui.');
  t.push('2.  Nella scheda "' + PANNELLO.scheda + '" metti una riga per modulo, con il nome come lo vedi in Google Moduli. La spunta "Attivo" la mette lo script: una riga nuova parte accesa.');
  t.push('3.  Campanella > Trova i moduli nel Drive. Riempie il link dei moduli che trova per nome. Per gli altri incolla tu il link DI MODIFICA (quello che finisce con /edit), non quello che dai agli studenti.');
  t.push('4.  Campanella > Anteprima: cosa succederebbe. Dice cosa farebbe, senza toccare niente.');
  t.push('5.  Campanella > Prepara l\'anno nuovo. Crea i fogli delle risposte, ci collega i moduli, li riapre e programma le chiusure.');
  t.push('La prima volta Google chiede i permessi: concedili tutti, altrimenti lo script si ferma e lo dice.');
  t.push('');
  t.push('OGNI ANNO, DAL PRIMO SETTEMBRE');
  if (automatico) {
    t.push('•  Apri questo foglio e scegli Campanella > Prepara l\'anno nuovo. Niente da reincollare: l\'anno scolastico cambia da solo il primo settembre.');
  } else {
    t.push('•  L\'anno scolastico e\' fisso, ' + fisso + ': NON cambia da solo. Per l\'anno dopo rigenera il codice da Campanella (Cartelle, passo 2) e incollalo di nuovo, oppure nel codice scrivi anno: \'auto\'. Poi Campanella > Prepara l\'anno nuovo.');
  }
  t.push('•  Le chiusure scattano da sole, finito il giorno scritto in "Chiusura": il modulo smette di accettare risposte e il foglio resta fermo com\'e\'. Senza un giorno in "Chiusura", quel modulo resta aperto.');
  t.push('');
  t.push('DURANTE L\'ANNO');
  t.push('•  Un modulo nuovo: aggiungi la sua riga (e il giorno in "Chiusura", se deve chiudersi da solo), poi Trova i moduli nel Drive e Prepara l\'anno nuovo. Le righe gia\' pronte quest\'anno non vengono ricollegate, e un modulo gia\' chiuso (dalla sua chiusura o a mano) resta chiuso.');
  t.push('•  Un modulo che non serve piu\': togli la spunta "Attivo". La riga resta come promemoria e lo script la salta; il modulo resta com\'e\', aperto o chiuso.');
  t.push('•  Un modulo cancellato: al giorno della chiusura lo script lo scrive nella sua riga, in "Stato", e va avanti con gli altri.');
  t.push('•  "Stato" e "Ultima esecuzione" dicono com\'e\' andata l\'ultima volta. Per rileggere com\'e\' messo davvero ogni modulo: Campanella > Controlla com\'e\' messo adesso.');
  t.push('');
  t.push('LE COLONNE DELLA SCHEDA "' + String(PANNELLO.scheda).toUpperCase() + '"');
  for (var c = 0; c < _PAN_COLONNE.length; c++) t.push(_PAN_COLONNE[c] + ':  ' + note[c]);
  t.push('');
  t.push('PER TORNARE INDIETRO');
  t.push('Campanella > Annulla: toglie le chiusure programmate e scollega i fogli di quest\'anno. Non cancella niente: fogli e risposte restano nel Drive.');
  t.push('');
  t.push('LE IMPOSTAZIONI DI QUESTO SCRIPT');
  t.push('Anno scolastico:  ' + (automatico
    ? 'automatico: dal primo settembre passa da solo al successivo'
    : fisso + ', scritto a mano: non cambia da solo'));
  t.push('Cartella dell\'anno:  "' + PANNELLO.cartellaAnno + '" nella radice di "Il mio Drive", dove {anno} e\' l\'anno scolastico (per esempio 2026-27)');
  t.push('Chiusura di partenza:  ' + (PANNELLO.chiusura || 'nessuna') + ' (quella proposta alle prime righe). Le righe che aggiungi tu si chiudono solo se scrivi il giorno in "Chiusura".');
  t.push('Script:  Campanella ' + _PAN_VERSIONE + '. Per cambiare queste impostazioni rigenera il codice da Campanella (Cartelle, passo 2), incollalo di nuovo e poi scegli Campanella > Prepara il foglio.');
  return t;
}

function _panTrovaIModuli() {
  var foglio = _panScheda(true);
  var dati = _panLeggi(foglio);
  var righe = ['CERCO I MODULI NEL DRIVE', ''];
  var trovati = 0;

  for (var i = 0; i < dati.righe.length; i++) {
    var r = dati.righe[i];
    if (!r.attivo) { righe.push((r.nome || '(riga ' + (r.indice + 2) + ')') + ': saltata, non ha la spunta "Attivo".'); continue; }
    if (r.id) { righe.push(r.nome + ': il link c\'e\' gia\'.'); continue; }
    if (!r.nome) continue;
    var candidati = _panCercaModuli(r.nome);
    if (candidati.length === 0) {
      righe.push(r.nome + ': non lo trovo nel Drive. Incolla il link a mano.');
    } else if (candidati.length > 1) {
      righe.push(r.nome + ': ce ne sono ' + candidati.length + ' con questo nome. Incolla il link di quello giusto.');
    } else {
      dati.valori[r.indice][_PAN_C.LINK] = candidati[0].getUrl();
      righe.push(r.nome + ': trovato.');
      trovati++;
    }
  }
  if (trovati > 0) _panScrivi(foglio, dati);
  _panSpunte(foglio);                       // le righe aggiunte a mano prendono le loro caselle
  righe.push('');
  righe.push(trovati === 0 ? 'Nessun link nuovo.' : 'Link riempiti: ' + trovati + '.');
  return righe.join('\n');
}


// ===========================================================================
//  IL LAVORO
// ===========================================================================
function _panEsegui(davvero) {
  var foglio = _panScheda(true);
  var dati = _panLeggi(foglio);
  var anno = _panAnno();
  var righe = [];
  righe.push(davvero ? 'PREPARO L\'ANNO SCOLASTICO ' + anno
                     : 'ANTEPRIMA per l\'anno scolastico ' + anno + ' - non modifico niente.');
  righe.push('');

  if (davvero && !_panPermessiCompleti()) {
    righe.push('MANCA QUALCHE PERMESSO. Nella finestra di Google le spunte vanno lasciate tutte:');
    righe.push('riesegui e, quando Google lo chiede, concedi tutti i permessi. Non ho fatto niente.');
    return righe.join('\n');
  }

  var attive = 0, fatte = 0, problemi = 0;
  var chiusure = {};

  var spente = [];
  for (var i = 0; i < dati.righe.length; i++) {
    var r = dati.righe[i];
    if (!r.attivo) { spente.push(r.nome || '(riga ' + (r.indice + 2) + ')'); continue; }
    attive++;
    righe.push('--- ' + (r.nome || '(riga ' + (r.indice + 2) + ')'));
    try {
      var esito = _panUnaRiga(r, anno, davvero, righe);
      if (esito.chiusura) chiusure[esito.chiusura.testo] = esito.chiusura;
      if (davvero) {
        dati.valori[r.indice][_PAN_C.STATO] = esito.stato;
        if (esito.url) dati.valori[r.indice][_PAN_C.URL] = esito.url;
        dati.valori[r.indice][_PAN_C.QUANDO] = _panAdesso();
      }
      fatte++;
    } catch (e) {
      var guaio = String(e.message || e);
      righe.push('  PROBLEMA: ' + guaio);
      if (davvero) {
        dati.valori[r.indice][_PAN_C.STATO] = 'problema: ' + guaio;
        dati.valori[r.indice][_PAN_C.QUANDO] = _panAdesso();
      }
      problemi++;
    }
  }

  if (spente.length) {
    righe.push('--- senza la spunta "Attivo", saltate: ' + spente.join(', '));
  }
  if (attive === 0) {
    righe.push('Nessuna riga attiva: metti la spunta in "Attivo" alle righe da preparare.');
    return righe.join('\n');
  }
  if (davvero) {
    _panScrivi(foglio, dati);
    _panProgrammaChiusure(chiusure, righe);
    // le righe aggiunte durante l'anno prendono le caselle, e la scheda
    // Istruzioni si riallinea allo script appena incollato: chi usa solo
    // questa voce non deve ricordarsi di rifare "Prepara il foglio"
    try {
      _panSpunte(foglio);
      righe.push('');
      righe.push(_panRaccontaSchede(_panOrdinaLeSchede(SpreadsheetApp.getActive(), foglio)));
    } catch (e4) {
      righe.push('(non sono riuscito a sistemare le schede: ' + (e4.message || e4) + ')');
    }
  } else {
    _panElencaChiusure(chiusure, righe);
  }

  righe.push('');
  righe.push(davvero
    ? 'FATTO. Righe preparate: ' + fatte + (problemi ? ', con problemi: ' + problemi : '') + '.'
    : 'Se ti convince: menu Campanella -> "Prepara l\'anno nuovo".');
  if (davvero) {
    righe.push('L\'anno prossimo, dal primo settembre: riapri questo foglio e rifai la stessa cosa.');
  }
  return righe.join('\n');
}

/** Una riga: cartella, foglio, collegamento, riapertura. Torna stato, url e chiusura da programmare. */
function _panUnaRiga(r, anno, davvero, righe) {
  if (!r.id) {
    if (r.link) throw new Error('il link non e\' quello giusto: serve il modulo aperto per modificarlo (.../forms/d/.../edit)');
    throw new Error('manca il link del modulo');
  }
  var form = FormApp.openById(r.id);
  var nomeFoglio = _panNome(r.foglio || ('Risposte ' + r.nome + ' - A.S. {anno}'), anno);
  var memoria = _panMemoria();
  var chiave = r.id + '|' + anno;

  // Una riga gia' preparata per quest'anno. Rieseguire "Prepara l'anno nuovo" a
  // meta' anno (per aggiungere un modulo, per esempio) non deve disfare quello
  // che e' successo dopo: un modulo gia' arrivato alla sua chiusura non va
  // ricollegato (Google ricopierebbe tutte le risposte in una scheda nuova del
  // foglio) e non va riaperto.
  // "pronti" vale true per una riga finita da questa versione, 'da prima' per
  // una ereditata da una versione precedente (di cui non so com'e' finita)
  var giaPreparata = memoria.pronti[chiave];
  {
    // La chiusura di quest'anno e' gia' scattata? Lo dice prima di tutto la
    // memoria, che l'ha segnato quando e' scattata: cosi' non conta se nel
    // frattempo qualcuno ha spostato o svuotato il giorno in "Chiusura", e non
    // conta se la riga era finita del tutto. Per una riga preparata prima della
    // 1.4.6 il segno non c'e', e allora guardo la data della cella.
    var finitoIl = memoria.chiusi[chiave] || '';
    var nellaCella = null;
    if ((r.chiusura || '').replace(/\s/g, '') !== '') nellaCella = _panGiornoChiusura(r.chiusura, anno);
    if (!finitoIl && giaPreparata && nellaCella && _panOggi() > nellaCella.testo) finitoIl = nellaCella.testo;
    if (finitoIl) {
      var ancoraAperto = false;
      try { ancoraAperto = form.isAcceptingResponses(); } catch (e0) { ancoraAperto = false; }
      righe.push('  l\'anno ' + anno + ' per questo modulo e\' finito il ' + _panLeggibile(finitoIl) +
                 ': non lo ricollego e non lo riapro.');
      if (nellaCella && nellaCella.testo !== finitoIl) {
        righe.push('  (in "Chiusura" adesso c\'e\' il ' + nellaCella.leggibile + ', ma per quest\'anno la chiusura ' +
                   'e\' gia\' scattata: se va riaperto, riaprilo da Google Moduli -> Risposte)');
      }
      if (ancoraAperto) righe.push('  (risulta ancora aperto: se va chiuso, chiudilo da Google Moduli)');
      return { stato: ancoraAperto ? 'aperto oltre la chiusura del ' + _panLeggibile(finitoIl)
                                   : 'chiuso il ' + _panLeggibile(finitoIl),
               url: '', chiusura: null, riapertura: '' };
    }
  }

  // --- la cartella ---------------------------------------------------------
  var dest = _panCartella(r.cartella, anno, davvero, righe);

  // --- il foglio -----------------------------------------------------------
  var idFoglio = null;
  var foglioDiQuestAnno = false;          // il foglio preparato gia' prima di questa volta
  var trovatoPerNome = false;             // trovato per nome, non ancora segnato in memoria
  if (memoria.fogli[chiave] && _panApribile(memoria.fogli[chiave]) && !_panNelCestino(memoria.fogli[chiave])) {
    idFoglio = memoria.fogli[chiave];
    foglioDiQuestAnno = true;
    righe.push('  foglio: c\'e\' gia\', e\' quello creato da qui.');
  }
  if (!idFoglio && dest.cartella) {
    idFoglio = _panFoglioPerNome(dest.cartella, nomeFoglio);
    if (idFoglio) {
      righe.push('  foglio: "' + nomeFoglio + '" esiste gia\'. Uso quello, senza doppioni.');
      // Me lo segno solo quando il modulo ci scrive davvero (qui sotto): se il
      // primo collegamento non riuscisse, un foglio trovato per nome - magari
      // gia' usato e con la sua scheda di risposte - la volta dopo sembrerebbe
      // "scollegato a mano" e non verrebbe piu' collegato.
      trovatoPerNome = true;
    }
  }
  // Il modulo puo' avere gia' dentro di se' l'altro script di Campanella, che gli
  // ha fatto il foglio dell'anno. Se e' collegato a un foglio che si chiama come
  // quello che vorrei io, adotto quello: creargliene un altro vorrebbe dire due
  // fogli per lo stesso anno e le risposte spezzate in due.
  if (!idFoglio) {
    var giaCollegato = _panDestinazione(form);
    if (giaCollegato && _panNomeDiUnFile(giaCollegato) === nomeFoglio) {
      idFoglio = giaCollegato;
      righe.push('  foglio: il modulo scrive gia\' in "' + nomeFoglio + '". Uso quello: non ne creo un altro.');
      righe.push('  (lo ha preparato lo script dentro il modulo? vedi "se il modulo ha gia\' lo script")');
      if (davvero) { memoria.fogli[chiave] = idFoglio; _panRicorda(memoria); }
    }
  }
  if (!idFoglio) {
    if (!davvero) {
      righe.push('  foglio: da creare, "' + nomeFoglio + '".');
    } else {
      idFoglio = SpreadsheetApp.create(nomeFoglio).getId();
      memoria.fogli[chiave] = idFoglio;
      _panRicorda(memoria);
      righe.push('  foglio: creato "' + nomeFoglio + '".');
      if (dest.cartella) {
        try {
          if (_panMetti(idFoglio, dest.cartella)) righe.push('  messo in: ' + dest.percorso);
        } catch (e) {
          righe.push('  NON sono riuscito a spostarlo (' + (e.message || e) + '): e\' nella radice del Drive.');
        }
      }
    }
  }

  // --- risposte vecchie e collegamento ---------------------------------------
  // Una riga ereditata da una versione di prima, il cui foglio non e' mai stato
  // collegato: quella preparazione si e' fermata prima del collegamento, e
  // quindi anche prima della riapertura. La tratto come mai fatta.
  if (giaPreparata === 'da prima' && (!foglioDiQuestAnno || !_panGiaCollegatoUnaVolta(idFoglio))) {
    giaPreparata = false;
  }

  var collegatoA = _panDestinazione(form);
  var quante = form.getResponses().length;
  var scollegatoAMano = false;
  if (idFoglio !== null && collegatoA === idFoglio) {
    righe.push('  collegamento: gia\' fatto, non lo tocco.');
    // il foglio trovato per nome e' davvero quello in cui scrive: adesso me lo segno
    if (davvero && trovatoPerNome) { memoria.fogli[chiave] = idFoglio; _panRicorda(memoria); }
  } else if (foglioDiQuestAnno && !memoria.annullati[chiave] && _panGiaCollegatoUnaVolta(idFoglio)) {
    // Il foglio di quest'anno ha gia' la sua scheda di risposte: e' stato
    // collegato, e adesso il modulo non ci scrive piu'. L'ha scollegato
    // qualcuno. Ricollegarlo farebbe ricopiare a Google tutte le risposte in
    // una scheda nuova dello stesso foglio. (Un foglio ancora intatto, invece,
    // non e' mai stato collegato - una preparazione rotta a meta', anche di
    // una versione di prima - e allora lo collego.)
    scollegatoAMano = true;
    righe.push('  collegamento: quest\'anno era collegato, e adesso non scrive piu\' nel suo foglio.');
    righe.push('  Non lo ricollego: Google ricopierebbe tutte le risposte in una scheda nuova. Se va');
    righe.push('  ricollegato davvero, fallo da Google Moduli (Risposte -> Collega a Fogli).');
  } else {
    if (quante > 0) _panRisposteVecchie(form, r, quante, collegatoA, idFoglio, memoria, davvero, righe);
    if (davvero) {
      _panRiprova(function () { form.setDestination(FormApp.DestinationType.SPREADSHEET, idFoglio); });
      righe.push('  collegamento: fatto.');
      if (memoria.annullati[chiave]) delete memoria.annullati[chiave];
      if (trovatoPerNome) memoria.fogli[chiave] = idFoglio;
      _panRicorda(memoria);
    } else {
      righe.push('  collegamento: da fare' + (collegatoA ? ' (adesso scrive in un altro foglio, che resta com\'e\')' : '') + '.');
    }
  }

  // --- riapertura -------------------------------------------------------------
  var riapertura = _panRiapri(form, davvero, righe, giaPreparata);

  // --- la chiusura ------------------------------------------------------------
  var chiusura = null;
  if ((r.chiusura || '').replace(/\s/g, '') !== '') {
    chiusura = _panGiornoChiusura(r.chiusura, anno);
    if (chiusura && _panOggi() > chiusura.testo) {
      righe.push('  chiusura: il ' + chiusura.leggibile + ' e\' gia\' passato, non la programmo.');
      chiusura = null;
    } else if (chiusura) {
      righe.push('  chiusura: ' + (davvero ? 'programmata' : 'da programmare') + ' per la fine del ' + chiusura.leggibile + '.');
    }
  } else {
    righe.push('  chiusura: non richiesta.');
  }
  if (davvero) {
    // la scadenza va segnata adesso: il giorno in cui scatta, l'anno scolastico e'
    // gia' cambiato e ricalcolarla darebbe la data dell'anno dopo
    if (chiusura) memoria.scadenze[r.id] = chiusura.testo;
    else delete memoria.scadenze[r.id];
    // solo adesso, a riga finita: se qualcosa si fosse rotto a meta', la volta
    // dopo la riga va rifatta tutta, riapertura compresa. Un modulo non
    // pubblicato non e' "pronto": quando lo pubblichi, la volta dopo lo riapro.
    // Un modulo lasciato chiuso perche' ereditato resta 'da prima': non so chi
    // l'ha chiuso, e la volta dopo non voglio dire che e' stato qualcuno.
    if (riapertura !== 'non pubblicato' && riapertura !== 'lasciato chiuso, da prima') {
      memoria.pronti[chiave] = true;
    }
    _panRicorda(memoria);
  }

  var ma = [];
  if (riapertura === 'lasciato chiuso') ma.push('chiuso a mano');
  if (riapertura === 'lasciato chiuso, da prima') ma.push('chiuso');
  if (scollegatoAMano) ma.push('scollegato a mano');
  if (riapertura === 'non pubblicato') ma.push('il modulo non e\' pubblicato');
  return {
    stato: !davvero ? 'da preparare'
         : 'pronto per ' + anno + (ma.length ? ', ma ' + ma.join(' e ') : ''),
    url: (davvero && idFoglio) ? SpreadsheetApp.openById(idFoglio).getUrl() : '',
    chiusura: chiusura
  };
}

function _panRisposteVecchie(form, r, quante, collegatoA, idFoglio, memoria, davvero, righe) {
  if (!r.svuota) {
    righe.push('  risposte gia\' nel modulo: ' + quante + '. Collegandolo, Google le ricopia nel foglio dell\'anno.');
    righe.push('  (per cominciare pulito, spunta "Svuota" in questa riga)');
    return;
  }
  var candidati = [];
  if (collegatoA && collegatoA !== idFoglio) candidati.push(collegatoA);
  for (var k in memoria.fogli) {
    if (k.indexOf(r.id + '|') !== 0) continue;
    var id = memoria.fogli[k];
    if (id && id !== idFoglio && candidati.indexOf(id) < 0) candidati.push(id);
  }
  var alSicuro = null;
  for (var i = 0; i < candidati.length && !alSicuro; i++) {
    if (_panRigheDiRisposte(candidati[i]) >= quante) alSicuro = candidati[i];
  }
  if (!alSicuro) {
    righe.push('  risposte gia\' nel modulo: ' + quante + '. NON le tolgo: non trovo un foglio vecchio');
    righe.push('  che le contenga tutte, e toglierle sarebbe cancellarle.');
    return;
  }
  if (davvero) { form.deleteAllResponses(); righe.push('  risposte vecchie: ' + quante + ', tolte dal modulo (restano nel foglio vecchio).'); }
  else { righe.push('  risposte vecchie: ' + quante + ', verrebbero tolte dal modulo (restano nel foglio vecchio).'); }
}

/**
 * Riapre un modulo chiuso: e' il lavoro di inizio anno, quando la chiusura
 * dell'anno prima lo ha lasciato chiuso. Se la riga era gia' stata preparata
 * quest'anno invece no: un modulo chiuso a meta' anno l'ha chiuso qualcuno,
 * apposta, e rieseguire "Prepara l'anno nuovo" non deve riaprirlo.
 */
function _panRiapri(form, davvero, righe, giaPreparata) {
  var aperto = true;
  try { aperto = form.isAcceptingResponses(); } catch (e) { aperto = true; }
  if (aperto) return 'aperto';
  if (giaPreparata === true) {
    righe.push('  il modulo e\' chiuso e quest\'anno era gia\' pronto: l\'ha chiuso qualcuno, non lo riapro.');
    righe.push('  (se va riaperto: Google Moduli -> Risposte -> "Accetta risposte")');
    return 'lasciato chiuso';
  }
  if (giaPreparata) {
    // preparata con una versione di prima: non so se l'ha chiuso qualcuno o se
    // allora non si era riaperto. Nel dubbio non lo riapro, e lo dico com'e'.
    righe.push('  il modulo e\' chiuso, e quest\'anno era gia\' stato preparato con la versione di prima:');
    righe.push('  non lo riapro. Se va riaperto: Google Moduli -> Risposte -> "Accetta risposte".');
    return 'lasciato chiuso, da prima';
  }
  var pubblicato = true;
  try {
    if (typeof form.supportsAdvancedResponderPermissions === 'function' &&
        form.supportsAdvancedResponderPermissions()) pubblicato = form.isPublished();
  } catch (e2) { pubblicato = true; }
  if (!pubblicato) { righe.push('  il modulo non e\' pubblicato: non lo pubblico io.'); return 'non pubblicato'; }
  if (!davvero) { righe.push('  il modulo e\' chiuso: verrebbe riaperto.'); return 'da riaprire'; }
  // Se non si riapre, la riga NON deve risultare pronta: lo faccio sapere con
  // un errore, che finisce nella riga, e la volta dopo si riprova tutto.
  _panRiprova(function () { form.setAcceptingResponses(true); });
  righe.push('  il modulo era chiuso: riaperto.');
  return 'riaperto';
}

function _panControlla() {
  var foglio = _panScheda(true);
  var dati = _panLeggi(foglio);
  var anno = _panAnno();
  var memoria = _panMemoria();
  var righe = ['COME SONO MESSI ADESSO  (anno ' + anno + ')', ''];
  var guai = 0;

  for (var i = 0; i < dati.righe.length; i++) {
    var r = dati.righe[i];
    var stato = '';
    if (!r.id) {
      stato = r.link ? 'il link non e\' quello dell\'editor' : 'manca il link del modulo';
      guai++;
    } else {
      var form = null;
      try { form = FormApp.openById(r.id); } catch (e) { form = null; }
      if (!form) {
        stato = 'non lo trovo: cancellato, o non e\' piu\' tuo';
        delete memoria.scadenze[r.id];
        guai++;
      } else if (_panNelCestino(r.id)) {
        stato = 'e\' nel cestino del Drive';
        delete memoria.scadenze[r.id];
        guai++;
      } else {
        var dove = _panDestinazione(form);
        var atteso = memoria.fogli[r.id + '|' + anno];
        if (!dove) stato = 'non collegato a nessun foglio';
        else if (atteso && dove === atteso) stato = 'collegato al foglio di quest\'anno';
        else stato = 'collegato a un foglio che non ho creato io';
        var aperto = true;
        try { aperto = form.isAcceptingResponses(); } catch (e2) { aperto = true; }
        stato += aperto ? ', aperto' : ', chiuso';
        var quante = 0;
        try { quante = form.getResponses().length; } catch (e3) { quante = -1; }
        if (quante >= 0) stato += ', ' + quante + (quante === 1 ? ' risposta' : ' risposte');
        if (!r.attivo) stato = '(riga non attiva) ' + stato;
      }
    }
    dati.valori[r.indice][_PAN_C.STATO] = stato;
    dati.valori[r.indice][_PAN_C.QUANDO] = _panAdesso();
    righe.push((r.nome || '(riga ' + (r.indice + 2) + ')') + ': ' + stato);
  }

  _panScrivi(foglio, dati);
  _panRicorda(memoria);
  righe.push('');
  righe.push(dati.righe.length === 0
    ? 'Nella scheda non c\'e\' nessuna riga.'
    : (guai === 0 ? 'Tutto a posto.' : 'Righe da guardare: ' + guai + '.'));
  righe.push('Questo controllo legge e basta: non ha cambiato niente.');
  return righe.join('\n');
}

function _panAnnulla() {
  var foglio = _panScheda(true);
  var dati = _panLeggi(foglio);
  var anno = _panAnno();
  var memoria = _panMemoria();
  var righe = ['ANNULLO quello che ho fatto per l\'anno ' + anno + '.', ''];

  var tolti = _panTogliTrigger();
  righe.push(tolti > 0 ? 'Chiusure programmate: ' + tolti + ' tolte.' : 'Chiusure programmate: non ce n\'erano.');
  memoria.scadenze = {};
  _panRicorda(memoria);
  righe.push('');

  for (var i = 0; i < dati.righe.length; i++) {
    var r = dati.righe[i];
    if (!r.id) continue;
    var idFoglio = memoria.fogli[r.id + '|' + anno];
    // annullata, la riga non e' piu' "pronta" (ne' chiusa): la prossima
    // preparazione la rifa' tutta, ricollegamento compreso (scollegata da me,
    // non da qualcuno: e' la volta in cui ricollegare e' quello che si vuole)
    delete memoria.pronti[r.id + '|' + anno];
    delete memoria.chiusi[r.id + '|' + anno];
    memoria.annullati[r.id + '|' + anno] = true;
    var form = null;
    try { form = FormApp.openById(r.id); } catch (e) { righe.push(r.nome + ': non riesco ad aprirlo.'); continue; }
    var collegatoA = _panDestinazione(form);
    if (idFoglio && collegatoA === idFoglio) {
      _panRiprova(function () { form.removeDestination(); });
      righe.push(r.nome + ': foglio scollegato (resta nel Drive).');
      dati.valori[r.indice][_PAN_C.STATO] = 'scollegato';
      dati.valori[r.indice][_PAN_C.QUANDO] = _panAdesso();
    } else if (collegatoA) {
      righe.push(r.nome + ': scrive in un foglio che non ho collegato io, non lo tocco.');
    } else {
      righe.push(r.nome + ': non e\' collegato a nessun foglio.');
    }
  }
  _panRicorda(memoria);
  _panScrivi(foglio, dati);
  righe.push('');
  righe.push('Non ho cancellato niente: fogli e cartelle restano dove sono.');
  return righe.join('\n');
}


// ===========================================================================
//  LA SCHEDA: LEGGERE E SCRIVERE
// ===========================================================================
function _panScheda(obbligatoria) {
  var foglio = SpreadsheetApp.getActive().getSheetByName(PANNELLO.scheda);
  if (!foglio && obbligatoria) {
    throw new Error('Non trovo la scheda "' + PANNELLO.scheda + '". Esegui prima "Prepara il foglio".');
  }
  return foglio;
}

function _panLeggi(foglio) {
  var ultima = foglio.getLastRow();
  var valori = (ultima < 2) ? [] : foglio.getRange(2, 1, ultima - 1, _PAN_COLONNE.length).getValues();
  var righe = [];
  for (var i = 0; i < valori.length; i++) {
    var v = valori[i];
    var nome = String(v[_PAN_C.NOME] || '').replace(/^\s+|\s+$/g, '');
    var link = String(v[_PAN_C.LINK] || '').replace(/^\s+|\s+$/g, '');
    if (nome === '' && link === '') continue;                 // riga vuota: la salto
    righe.push({
      indice:   i,
      nome:     nome,
      link:     link,
      id:       _panIdModulo(link),
      cartella: String(v[_PAN_C.CARTELLA] || '').replace(/^\s+|\s+$/g, ''),
      foglio:   String(v[_PAN_C.FOGLIO] || '').replace(/^\s+|\s+$/g, ''),
      chiusura: _panChiusura(v[_PAN_C.CHIUSURA]),
      svuota:   v[_PAN_C.SVUOTA] === true,
      attivo:   v[_PAN_C.ATTIVO] !== false
    });
  }
  return { valori: valori, righe: righe };
}

/**
 * Il giorno di chiusura di una riga, sempre come "31/08". Il foglio, se la
 * colonna non e' impostata come testo, si prende "31/08" e ci mette dentro una
 * data vera: qui la riporto a giorno/mese. L'anno di quella data non serve:
 * quello giusto lo decide l'anno scolastico.
 */
function _panChiusura(valore) {
  if (valore && typeof valore.getMonth === 'function') {
    return Utilities.formatDate(valore, _panFuso(), 'dd/MM');
  }
  return String(valore || '').replace(/\s/g, '');
}

/** Rimette come testo le chiusure che il foglio aveva trasformato in date. */
function _panRaddrizzaChiusure(foglio) {
  var ultima = foglio.getLastRow();
  if (ultima < 2) return 0;
  var intervallo = foglio.getRange(2, _PAN_C.CHIUSURA + 1, ultima - 1, 1);
  var valori = intervallo.getValues();
  var cambiate = 0;
  for (var i = 0; i < valori.length; i++) {
    var v = valori[i][0];
    if (v && typeof v.getMonth === 'function') {
      valori[i][0] = _panChiusura(v);
      cambiate++;
    }
  }
  if (cambiate > 0) intervallo.setValues(valori);
  return cambiate;
}

function _panScrivi(foglio, dati) {
  if (dati.valori.length === 0) return;
  foglio.getRange(2, 1, dati.valori.length, _PAN_COLONNE.length).setValues(dati.valori);
}

function _panScriviStato(foglio, r, stato, url) {
  foglio.getRange(r.indice + 2, _PAN_C.STATO + 1).setValue(stato);
  if (url) foglio.getRange(r.indice + 2, _PAN_C.URL + 1).setValue(url);
  foglio.getRange(r.indice + 2, _PAN_C.QUANDO + 1).setValue(_panAdesso());
}

/**
 * L'id del modulo dal link. Accetta il link dell'editor (.../forms/d/ID/edit)
 * e un id incollato da solo; rifiuta quello per chi risponde (.../forms/d/e/...),
 * che e' un altro identificativo e non si puo' aprire.
 */
function _panIdModulo(link) {
  var s = String(link || '').replace(/^\s+|\s+$/g, '');
  if (s === '') return '';
  if (s.indexOf('/forms/d/e/') >= 0) return '';           // link per chi risponde: non va bene
  var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return '';
}


// ===========================================================================
//  PEZZI
// ===========================================================================
function _panFuso() { return String(PANNELLO.fusoOrario || 'Europe/Rome'); }

function _panOggi() { return Utilities.formatDate(new Date(), _panFuso(), 'yyyy-MM-dd'); }

function _panAdesso() { return Utilities.formatDate(new Date(), _panFuso(), 'dd/MM/yyyy HH:mm'); }

function _panAnno(oggi) {
  var a = String(PANNELLO.anno === undefined || PANNELLO.anno === null ? 'auto' : PANNELLO.anno).replace(/\s/g, '');
  if (a === '' || a.toLowerCase() === 'auto') {
    var t = oggi || _panOggi();
    var annoT = parseInt(t.substring(0, 4), 10), meseT = parseInt(t.substring(5, 7), 10);
    var inizio = (meseT >= 9) ? annoT : annoT - 1;
    return inizio + '-' + ('0' + ((inizio + 1) % 100)).slice(-2);
  }
  var m = /^(\d{4})-(\d{2})$/.exec(a);
  if (!m || (parseInt(m[1], 10) + 1) % 100 !== parseInt(m[2], 10)) {
    throw new Error('L\'anno "' + a + '" non e\' nella forma 2026-27. Correggi PANNELLO.anno, oppure scrivi \'auto\'.');
  }
  return a;
}

/** "2027-08-31" diventa "31/08/2027". */
function _panLeggibile(testo) {
  var p = String(testo || "").split("-");
  return (p.length === 3) ? p[2] + "/" + p[1] + "/" + p[0] : String(testo || "");
}

function _panNome(modello, anno) {
  return String(modello || '').split('{anno}').join(anno).replace(/^\s+|\s+$/g, '');
}

function _panDue(n) { return ('0' + n).slice(-2); }

function _panGiornoChiusura(chiusura, anno) {
  var c = String(chiusura || '').replace(/\s/g, '');
  if (c === '') return null;
  var m = /^(\d{1,2})\/(\d{1,2})$/.exec(c);
  if (!m) throw new Error('la chiusura "' + c + '" non e\' nella forma giorno/mese, per esempio 31/08');
  var giorno = parseInt(m[1], 10), mese = parseInt(m[2], 10);
  var inizio = parseInt(anno.substring(0, 4), 10);
  var annoData = (mese >= 9) ? inizio : inizio + 1;
  var prova = new Date(Date.UTC(annoData, mese - 1, giorno));
  if (mese < 1 || mese > 12 || giorno < 1 || prova.getUTCMonth() !== mese - 1) {
    throw new Error('il giorno di chiusura "' + c + '" non esiste');
  }
  var dopo = new Date(Date.UTC(annoData, mese - 1, giorno + 1));
  return {
    testo:     annoData + '-' + _panDue(mese) + '-' + _panDue(giorno),
    leggibile: _panDue(giorno) + '/' + _panDue(mese) + '/' + annoData,
    scatta:    { anno: dopo.getUTCFullYear(), mese: dopo.getUTCMonth() + 1, giorno: dopo.getUTCDate() }
  };
}

/** Una chiusura programmata per ogni data diversa: quando scatta, chiude le righe scadute. */
function _panProgrammaChiusure(chiusure, righe) {
  _panTogliTrigger();
  var quante = 0;
  for (var k in chiusure) {
    var g = chiusure[k];
    ScriptApp.newTrigger(_PAN_TRIGGER).timeBased()
      .atDate(g.scatta.anno, g.scatta.mese, g.scatta.giorno)
      .inTimezone(_panFuso())
      .create();
    quante++;
  }
  righe.push('');
  righe.push(quante === 0 ? 'Chiusure programmate: nessuna.'
                          : 'Chiusure programmate: ' + quante + ' (una per ogni data diversa).');
}

function _panElencaChiusure(chiusure, righe) {
  var elenco = [];
  for (var k in chiusure) elenco.push(chiusure[k].leggibile);
  righe.push('');
  righe.push(elenco.length === 0 ? 'Chiusure da programmare: nessuna.'
                                 : 'Chiusure da programmare: ' + elenco.join(', ') + '.');
}

function _panTogliTrigger() {
  var tolti = 0;
  var tutti = ScriptApp.getProjectTriggers();
  for (var i = 0; i < tutti.length; i++) {
    if (tutti[i].getHandlerFunction() === _PAN_TRIGGER) { ScriptApp.deleteTrigger(tutti[i]); tolti++; }
  }
  return tolti;
}

/** Quando non resta piu' nessuna scadenza, tolgo le chiusure programmate. */
function _panTogliTriggerPassati(memoria) {
  for (var k in memoria.scadenze) return;              // ne resta almeno una: non tocco niente
  _panTogliTrigger();
}

function _panPermessiCompleti() {
  try {
    if (typeof ScriptApp.requireAllScopes === 'function') ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  } catch (e) { /* da un menu puo' non essere disponibile */ }
  try {
    return ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizationStatus() !==
           ScriptApp.AuthorizationStatus.REQUIRED;
  } catch (e2) { return true; }
}

function _panDestinazione(form) {
  try {
    if (form.getDestinationType() !== FormApp.DestinationType.SPREADSHEET) return null;
    return form.getDestinationId() || null;
  } catch (e) { return null; }
}

function _panRiprova(f) {
  try { return f(); }
  catch (e) { Utilities.sleep(2000); return f(); }
}

/**
 * Il foglio e' gia' stato collegato a un modulo, almeno una volta? Un foglio
 * creato dallo script nasce con una scheda sola, vuota; collegandolo, Google
 * ci aggiunge la scheda delle risposte, che resta anche quando lo scolleghi.
 */
function _panGiaCollegatoUnaVolta(idFoglio) {
  try {
    var schede = SpreadsheetApp.openById(idFoglio).getSheets();
    if (schede.length > 1) return true;
    return schede.length === 1 && (schede[0].getLastRow() > 0 || schede[0].getLastColumn() > 0);
  } catch (e) { return false; }
}

/** L'anno scolastico a cui appartiene un giorno "2027-06-30": dal primo settembre, l'anno dopo. */
function _panAnnoDellaData(testo) {
  var y = parseInt(String(testo).substring(0, 4), 10), mese = parseInt(String(testo).substring(5, 7), 10);
  var inizio = (mese >= 9) ? y : y - 1;
  return inizio + '-' + ('0' + ((inizio + 1) % 100)).slice(-2);
}

function _panApribile(idFoglio) {
  try { SpreadsheetApp.openById(idFoglio); return true; } catch (e) { return false; }
}

function _panRigheDiRisposte(idFoglio) {
  try {
    var schede = SpreadsheetApp.openById(idFoglio).getSheets();
    var massimo = 0;
    for (var i = 0; i < schede.length; i++) {
      var righe = schede[i].getLastRow() - 1;
      if (righe > massimo) massimo = righe;
    }
    return massimo;
  } catch (e) { return -1; }
}

/**
 * La memoria dello script:
 *   fogli     modulo|anno -> il foglio delle risposte di quell'anno
 *   scadenze  modulo -> il giorno di chiusura programmato
 *   pronti    modulo|anno -> quella riga e' stata preparata fino in fondo
 *   chiusi    modulo|anno -> il giorno in cui la chiusura di quell'anno e' scattata
 *   annullati modulo|anno -> scollegato da "Annulla": la prossima volta si ricollega
 * "pronti" e "chiusi" ci sono dalla 1.4.6. Chi viene da prima ha solo "fogli",
 * e un foglio dell'anno vuol dire una riga preparata, quindi lo ricavo da li'.
 * Dei due tengo solo l'anno in corso: sono gli unici che servono, e le
 * proprieta' dello script hanno un tetto di 9 KB per valore.
 */
function _panMemoria() {
  var anno = null;
  try { anno = _panAnno(); } catch (e0) { anno = null; }
  var vuota = { fogli: {}, scadenze: {}, pronti: {}, chiusi: {}, annullati: {} };
  try {
    var testo = PropertiesService.getScriptProperties().getProperty(_PAN_CHIAVE);
    if (!testo) return vuota;
    var m = JSON.parse(testo);
    if (!m || typeof m !== "object" || !m.fogli || typeof m.fogli !== "object") return vuota;
    if (!m.scadenze || typeof m.scadenze !== "object") m.scadenze = {};
    if (!m.pronti || typeof m.pronti !== "object") {
      // ereditate: so che il foglio c'era, non se la riga era finita. 'da prima'
      // basta a non riaprire un modulo chiuso, non a dire che l'ha chiuso qualcuno
      m.pronti = {};
      for (var k in m.fogli) if (m.fogli.hasOwnProperty(k)) m.pronti[k] = 'da prima';
    }
    if (!m.chiusi || typeof m.chiusi !== "object") m.chiusi = {};
    if (!m.annullati || typeof m.annullati !== "object") m.annullati = {};
    if (anno) {
      m.pronti = _panSoloAnno(m.pronti, anno);
      m.chiusi = _panSoloAnno(m.chiusi, anno);
      m.annullati = _panSoloAnno(m.annullati, anno);
    }
    return m;
  } catch (e) { return vuota; }
}

function _panSoloAnno(mappa, anno) {
  var fuori = {};
  for (var k in mappa) {
    if (mappa.hasOwnProperty(k) && k.slice(-(anno.length + 1)) === '|' + anno) fuori[k] = mappa[k];
  }
  return fuori;
}

function _panRicorda(memoria) {
  PropertiesService.getScriptProperties().setProperty(_PAN_CHIAVE, JSON.stringify(memoria));
}

function _panUnoAllaVolta(f) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) return 'Un\'altra esecuzione e\' ancora in corso: aspetta che finisca.';
  try {
    var testo = f();
    Logger.log(testo);
    return testo;
  } catch (e) {
    var guaio = 'Non ho potuto procedere:\n' + String(e.message || e);
    Logger.log(guaio);
    return guaio;
  } finally { lock.releaseLock(); }
}

function _panConferma(domanda) {
  try {
    var ui = SpreadsheetApp.getUi();
    return ui.alert('Campanella', domanda, ui.ButtonSet.YES_NO) === ui.Button.YES;
  } catch (e) {
    return true;                                  // eseguito dall'editor: niente finestre, si procede
  }
}

function _panRacconta(testo) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('Campanella', testo, ui.ButtonSet.OK);
  } catch (e) { /* dall'editor si legge nel registro di esecuzione */ }
  return testo;
}


// ===========================================================================
//  DRIVE
// ===========================================================================
function _panFigli(iteratore) {
  var fuori = [];
  while (iteratore.hasNext()) {
    var x = iteratore.next();
    if (!x.isTrashed()) fuori.push(x);
  }
  fuori.sort(function (a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });
  return fuori;
}

function _panCercaModuli(nome) {
  var fuori = [];
  var it = DriveApp.getFilesByName(nome);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_FORMS) fuori.push(f);
  }
  return fuori;
}

function _panCartella(percorso, anno, crea, righe) {
  var nomi = [_panNome(PANNELLO.cartellaAnno || 'A.S. {anno}', anno)];
  var pezzi = String(percorso || '').split(/[\\\/]+/);
  for (var i = 0; i < pezzi.length; i++) {
    var p = pezzi[i].replace(/^\s+|\s+$/g, '');
    if (p !== '') nomi.push(p);
  }
  var corrente = DriveApp.getRootFolder();
  var testo = 'Il mio Drive';
  for (var k = 0; k < nomi.length; k++) {
    testo += ' / ' + nomi[k];
    if (corrente === null) continue;
    var trovate = _panFigli(corrente.getFoldersByName(nomi[k]));
    if (trovate.length === 0) {
      if (crea) { corrente = corrente.createFolder(nomi[k]); righe.push('  creata la cartella: ' + testo); }
      else { corrente = null; righe.push('  cartella da creare: ' + testo); }
    } else {
      corrente = trovate[0];
      if (trovate.length > 1) righe.push('  ATTENZIONE: ci sono ' + trovate.length + ' cartelle "' + nomi[k] + '": uso la piu\' vecchia.');
    }
  }
  return { cartella: corrente, percorso: testo };
}

function _panFoglioPerNome(cartella, nome) {
  var trovati = _panFigli(cartella.getFilesByName(nome));
  for (var i = 0; i < trovati.length; i++) {
    if (trovati[i].getMimeType() === MimeType.GOOGLE_SHEETS) return trovati[i].getId();
  }
  return null;
}

function _panMetti(idFoglio, cartella) {
  var file = DriveApp.getFileById(idFoglio);
  var genitori = file.getParents();
  while (genitori.hasNext()) { if (genitori.next().getId() === cartella.getId()) return false; }
  file.moveTo(cartella);
  return true;
}

function _panNelCestino(idFoglio) {
  try { return DriveApp.getFileById(idFoglio).isTrashed(); } catch (e) { return true; }
}

function _panNomeDiUnFile(idFile) {
  try { return DriveApp.getFileById(idFile).getName(); } catch (e) { return ''; }
}
