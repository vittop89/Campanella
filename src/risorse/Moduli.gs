/**
 * ============================================================================
 *  MODULI - il foglio delle risposte dell'anno nuovo, per un modulo Google
 * ============================================================================
 *
 *  Va incollato DENTRO il modulo: in Google Moduli, i tre puntini in alto a
 *  destra -> Apps Script (o "Editor di script"). Non in un progetto a parte:
 *  lo script lavora sul modulo in cui si trova. Un modulo, uno script.
 *
 *  PERCHE' NEL CLOUD
 *    Un modulo Google non e' un file: sul PC c'e' solo un segnaposto. Copiarlo
 *    o spostarlo da Esplora file non porta con se' il foglio delle risposte, e
 *    ogni anno andrebbe ricollegato a mano. Qui lo fa Google, dentro l'account.
 *
 *  COSA FA, a ogni anno scolastico
 *    - crea il foglio Google delle risposte dell'anno (se non c'e' gia');
 *    - lo mette nella cartella dell'anno, dentro "Il mio Drive";
 *    - collega il modulo a quel foglio e lo riapre alle risposte;
 *    - programma la chiusura: finito il giorno indicato chiude il modulo e
 *      scollega il foglio, cosi' il foglio dell'anno resta fermo com'e'.
 *
 *  COSA NON FA
 *    Non cancella fogli, cartelle o file. Non spedisce niente a nessuno e non
 *    condivide niente. Le risposte vecchie le toglie dal modulo solo se lo
 *    chiedi tu (svuotaRisposte) e solo dopo aver verificato che stanno gia' in
 *    un foglio degli anni scorsi.
 *
 *  FUNZIONI
 *    MODULO_1_anteprima ... dice cosa farebbe, senza fare niente
 *    MODULO_2_prepara ..... prepara l'anno: foglio, collegamento, chiusura
 *    MODULO_ANNULLA ....... toglie la chiusura programmata e scollega il foglio
 *                           dell'anno (il foglio resta dov'e')
 *    MODULO_chiusura ...... la chiama Google quando arriva il giorno
 *    Dal secondo anno basta il menu "Campanella" dentro il modulo.
 *
 *  PERMESSI (li chiede Google alla prima esecuzione: vanno concessi tutti)
 *    Moduli ....... leggere e collegare il modulo
 *    Fogli ........ creare il foglio delle risposte
 *    Drive ........ trovare o creare la cartella dell'anno e metterci il foglio
 *    Trigger ...... la chiusura programmata
 * ============================================================================
 */

// >>> CONFIGURAZIONE >>>  (scritta da Campanella: Cartelle, passo 2)
var MODULO = {
  anno:           'auto',                              // 'auto' = dal primo settembre l'anno nuovo; oppure '2026-27'
  cartellaAnno:   'A.S. {anno}',                       // nella radice di "Il mio Drive"
  cartellaFoglio: 'RECUPERI',                          // dentro la cartella dell'anno; '' = nella cartella dell'anno
  nomeFoglio:     'Risposte Recuperi - A.S. {anno}',
  chiusura:       '31/08',                             // giorno/mese; '' = nessuna chiusura automatica
  riapri:         true,                                // riapre il modulo alle risposte
  svuotaRisposte: false,                               // toglie dal modulo le risposte degli anni scorsi (solo se gia' al sicuro)
  fusoOrario:     'Europe/Rome',
  usaDrive:       true
};
// <<< CONFIGURAZIONE <<<

var _MODULO_VERSIONE = '1.3.2';
var _MODULO_TRIGGER  = 'MODULO_chiusura';
var _MODULO_CHIAVE   = 'CAMPANELLA_MODULO';


// ===========================================================================
//  LE FUNZIONI DA ESEGUIRE
// ===========================================================================
function MODULO_1_anteprima() {
  var testo = _moduloEsegui(false);
  Logger.log(testo);
  return testo;
}

function MODULO_2_prepara() {
  return _moduloUnoAllaVolta(function () { return _moduloEsegui(true); });
}

function MODULO_ANNULLA() {
  return _moduloUnoAllaVolta(function () { return _moduloAnnulla(); });
}

/**
 * La chiama Google, da sola, finito il giorno di chiusura. Prima chiude il
 * modulo (cosi' non arriva niente a meta' lavoro), poi scollega il foglio.
 */
function MODULO_chiusura() {
  var form = _moduloForm();
  var righe = ['CHIUSURA DI FINE ANNO'];
  try {
    form.setAcceptingResponses(false);
    righe.push('Il modulo non accetta piu\' risposte. Riapre con "Prepara l\'anno nuovo".');
  } catch (e) {
    righe.push('Non sono riuscito a chiudere il modulo: ' + (e.message || e));
  }
  if (_moduloDestinazione(form)) {
    _moduloRiprova(function () { form.removeDestination(); });
    righe.push('Foglio delle risposte scollegato: resta dov\'e\', con tutto quello che contiene.');
  } else {
    righe.push('Il modulo non era collegato a nessun foglio.');
  }
  _moduloTogliTrigger();                               // i trigger gia' scattati restano in elenco: li tolgo
  var testo = righe.join('\n');
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  IL MENU DENTRO IL MODULO  (sta sotto l'icona a forma di pezzo di puzzle)
// ===========================================================================
function onOpen() {
  try {
    FormApp.getUi().createMenu('Campanella')
      .addItem('Anteprima: cosa succederebbe', 'MODULO_menu_anteprima')
      .addItem('Prepara l\'anno nuovo', 'MODULO_menu_prepara')
      .addSeparator()
      .addItem('Annulla: togli chiusura e collegamento', 'MODULO_menu_annulla')
      .addToUi();
  } catch (e) {
    // aperto da un contesto senza interfaccia: il menu non serve
  }
}

function MODULO_menu_anteprima() {
  var testo = _moduloProtetto(function () { return MODULO_1_anteprima(); });
  var ui = FormApp.getUi();
  ui.alert('Campanella - anteprima', testo, ui.ButtonSet.OK);
}

function MODULO_menu_prepara() {
  var ui = FormApp.getUi();
  var anno;
  try { anno = _moduloAnno(); }
  catch (e) { ui.alert('Campanella', String(e.message || e), ui.ButtonSet.OK); return; }
  var risposta = ui.alert('Campanella',
    'Preparo l\'anno scolastico ' + anno + ': foglio delle risposte "' +
    _moduloNome(MODULO.nomeFoglio, anno) + '", collegamento del modulo e chiusura programmata.\n\n' +
    'Non cancello niente. Procedo?', ui.ButtonSet.YES_NO);
  if (risposta !== ui.Button.YES) return;
  // prima il lavoro, poi il messaggio: una finestra lasciata aperta fermerebbe lo script a meta'
  var testo = _moduloProtetto(function () { return MODULO_2_prepara(); });
  ui.alert('Campanella', testo, ui.ButtonSet.OK);
}

function MODULO_menu_annulla() {
  var ui = FormApp.getUi();
  var risposta = ui.alert('Campanella',
    'Tolgo la chiusura programmata e scollego il foglio di quest\'anno.\n' +
    'Il foglio resta nel Drive con le risposte che contiene. Procedo?', ui.ButtonSet.YES_NO);
  if (risposta !== ui.Button.YES) return;
  var testo = _moduloProtetto(function () { return MODULO_ANNULLA(); });
  ui.alert('Campanella', testo, ui.ButtonSet.OK);
}

function _moduloProtetto(f) {
  try { return f(); }
  catch (e) { return 'Non ho potuto procedere:\n' + String(e.message || e); }
}

function _moduloUnoAllaVolta(f) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) {
    var occupato = 'Un\'altra esecuzione e\' ancora in corso: aspetta che finisca.';
    Logger.log(occupato);
    return occupato;
  }
  try {
    var testo = f();
    Logger.log(testo);
    return testo;
  } finally { lock.releaseLock(); }
}


// ===========================================================================
//  IL LAVORO
// ===========================================================================
function _moduloEsegui(davvero) {
  var righe = [];
  var form = _moduloForm();
  var anno = _moduloAnno();
  var nomeFoglio = _moduloNome(MODULO.nomeFoglio || 'Risposte - A.S. {anno}', anno);
  var conDrive = (MODULO.usaDrive !== false) && (typeof _moduloCartella === 'function');
  var memoria = _moduloMemoria(form);

  righe.push(davvero ? 'PREPARO L\'ANNO SCOLASTICO ' + anno
                     : 'ANTEPRIMA per l\'anno scolastico ' + anno + ' - non modifico niente.');
  righe.push('Modulo: "' + (form.getTitle() || '(senza titolo)') + '"');
  righe.push('');

  // Google lascia togliere le spunte ai singoli permessi. La chiusura di fine anno gira da
  // sola e non puo' chiedere niente a nessuno: se manca un permesso fallirebbe fra un anno.
  if (!_moduloPermessiCompleti()) {
    righe.push('MANCA QUALCHE PERMESSO. Nella finestra di Google le spunte vanno lasciate tutte:');
    righe.push('riesegui la funzione e, quando Google lo chiede, concedi tutti i permessi.');
    righe.push('Non ho fatto niente.');
    return righe.join('\n');
  }

  // --- 1. la cartella --------------------------------------------------------
  var dest = null;
  if (conDrive) {
    righe.push('Cartella del foglio');
    dest = _moduloCartella(anno, davvero, righe);
  } else {
    righe.push('Cartella del foglio: questo script non ha il permesso per Drive. Il foglio nasce');
    righe.push('  nella radice di "Il mio Drive": spostalo tu nella cartella dell\'anno, dal PC o');
    righe.push('  dal sito di Drive. Spostarlo non rompe il collegamento con il modulo.');
  }
  righe.push('');

  // --- 2. il foglio ----------------------------------------------------------
  var idFoglio = null;
  var ricordato = memoria.fogli[anno];
  if (ricordato && _moduloApribile(ricordato) &&
      !(conDrive && _moduloNelCestino(ricordato))) {
    idFoglio = ricordato;
    righe.push('Foglio delle risposte: c\'e\' gia\', e\' quello creato da questo script. Lo lascio dov\'e\'.');
  }
  if (!idFoglio && conDrive && dest && dest.cartella) {
    idFoglio = _moduloFoglioPerNome(dest.cartella, nomeFoglio);
    if (idFoglio) righe.push('Foglio delle risposte: "' + nomeFoglio + '" esiste gia\' nella cartella. Uso quello, senza doppioni.');
  }
  if (!idFoglio) {
    if (davvero) {
      idFoglio = SpreadsheetApp.create(nomeFoglio).getId();
      // lo ricordo subito: se qualcosa va storto piu' avanti, rieseguendo non ne nasce un secondo
      memoria.modulo = form.getId();
      memoria.fogli[anno] = idFoglio;
      _moduloRicorda(memoria);
      righe.push('Foglio delle risposte: creato "' + nomeFoglio + '".');
      if (conDrive && dest && dest.cartella) {
        try {
          if (_moduloMetti(idFoglio, dest.cartella)) righe.push('  messo in: ' + dest.percorso);
        } catch (e) {
          righe.push('  NON sono riuscito a metterlo nella cartella (' + (e.message || e) + '):');
          righe.push('  e\' nella radice di "Il mio Drive", spostalo tu. Il collegamento funziona lo stesso.');
        }
      }
    } else {
      righe.push('Foglio delle risposte: da creare, "' + nomeFoglio + '".');
    }
  }

  // --- 3. le risposte che il modulo ha gia', e il collegamento ------------------
  var collegatoA = _moduloDestinazione(form);
  var giaCollegato = (idFoglio !== null && collegatoA === idFoglio);
  var quante = form.getResponses().length;
  righe.push('');
  if (giaCollegato) {
    righe.push('Collegamento: il modulo scrive gia\' in questo foglio. Non lo tocco.');
  } else {
    if (quante > 0) _moduloRisposteVecchie(form, quante, collegatoA, idFoglio, memoria, davvero, righe);
    if (davvero) {
      _moduloRiprova(function () { form.setDestination(FormApp.DestinationType.SPREADSHEET, idFoglio); });
      righe.push('Collegamento: fatto. Le risposte nuove arrivano nel foglio dell\'anno.');
    } else {
      righe.push('Collegamento: il modulo verrebbe collegato al foglio dell\'anno' +
                 (collegatoA ? ' (adesso scrive in un altro foglio, che resta com\'e\').' : '.'));
    }
  }

  // --- 4. il modulo riapre --------------------------------------------------------
  _moduloRiapri(form, davvero, righe);

  // --- 5. la chiusura di fine anno -------------------------------------------------
  _moduloProgrammaChiusura(anno, davvero, righe);

  // --- 6. per l'anno prossimo -------------------------------------------------------
  if (davvero) {
    memoria.modulo = form.getId();
    memoria.fogli[anno] = idFoglio;
    _moduloRicorda(memoria);
    righe.push('');
    righe.push('Foglio: ' + SpreadsheetApp.openById(idFoglio).getUrl());
    righe.push('Il foglio e\' tuo: se il modulo ha altri editor che devono vedere le risposte, condividilo tu.');
    righe.push('');
    righe.push('FATTO. L\'anno prossimo, dal primo settembre: apri il modulo, icona a forma di pezzo di');
    righe.push('puzzle, menu Campanella -> "Prepara l\'anno nuovo". Non serve reincollare niente.');
  } else {
    righe.push('');
    righe.push('Se ti convince: esegui MODULO_2_prepara (o, dal modulo, menu Campanella).');
  }
  return righe.join('\n');
}

/**
 * Le risposte restano dentro il modulo anche dopo che il foglio e' stato
 * scollegato: collegando un foglio nuovo Google ce le ricopia tutte. Si
 * possono togliere dal modulo, ma solo se un foglio degli anni scorsi le
 * contiene gia': altrimenti sarebbe una cancellazione vera, e non si torna
 * indietro.
 */
function _moduloRisposteVecchie(form, quante, collegatoA, idFoglio, memoria, davvero, righe) {
  if (!MODULO.svuotaRisposte) {
    righe.push('Risposte gia\' nel modulo: ' + quante + '. Collegando il foglio nuovo Google ce le ricopia');
    righe.push('  dentro. Per cominciare l\'anno con il foglio vuoto rigenera lo script con la spunta');
    righe.push('  "togli dal modulo le risposte degli anni scorsi", oppure toglile tu dal modulo (Risposte');
    righe.push('  -> tre puntini -> Elimina tutte le risposte) PRIMA di eseguire MODULO_2_prepara.');
    return;
  }
  var candidati = [];
  if (collegatoA && collegatoA !== idFoglio) candidati.push(collegatoA);
  var anni = Object.keys(memoria.fogli).sort().reverse();
  for (var i = 0; i < anni.length; i++) {
    var id = memoria.fogli[anni[i]];
    if (id && id !== idFoglio && candidati.indexOf(id) < 0) candidati.push(id);
  }
  var alSicuro = null;
  for (var k = 0; k < candidati.length && !alSicuro; k++) {
    if (_moduloRigheDiRisposte(candidati[k]) >= quante) alSicuro = candidati[k];
  }
  if (!alSicuro) {
    righe.push('Risposte gia\' nel modulo: ' + quante + '. NON le tolgo: non trovo un foglio degli anni scorsi');
    righe.push('  che le contenga tutte, e toglierle sarebbe cancellarle. Finiranno anche nel foglio nuovo.');
    righe.push('  Se sei sicuro che non servono, toglile tu dal modulo (Risposte -> Elimina tutte le risposte).');
    return;
  }
  if (davvero) {
    form.deleteAllResponses();
    righe.push('Risposte degli anni scorsi: ' + quante + ', tolte dal modulo. Restano nel foglio');
  } else {
    righe.push('Risposte degli anni scorsi: ' + quante + ', verrebbero tolte dal modulo. Restano nel foglio');
  }
  righe.push('  ' + SpreadsheetApp.openById(alSicuro).getUrl());
}

function _moduloRiapri(form, davvero, righe) {
  if (MODULO.riapri === false) return;
  var aperto = true;
  try { aperto = form.isAcceptingResponses(); } catch (e) { aperto = true; }
  if (aperto) return;

  // dal 2025 un modulo puo' essere "non pubblicato": riaprirlo darebbe errore, e pubblicarlo
  // e' una decisione del docente, non di uno script
  var pubblicato = true;
  try {
    if (typeof form.supportsAdvancedResponderPermissions === 'function' &&
        form.supportsAdvancedResponderPermissions()) pubblicato = form.isPublished();
  } catch (e2) { pubblicato = true; }
  if (!pubblicato) {
    righe.push('Il modulo non e\' pubblicato: non lo riapro io. Quando e\' pronto, pubblicalo tu da Google Moduli.');
    return;
  }
  if (!davvero) { righe.push('Il modulo e\' chiuso: verrebbe riaperto alle risposte.'); return; }
  try {
    form.setAcceptingResponses(true);
    righe.push('Il modulo era chiuso: adesso accetta di nuovo risposte.');
  } catch (e3) {
    righe.push('Non sono riuscito a riaprire il modulo (' + (e3.message || e3) + '): riaprilo tu da Google Moduli.');
  }
}

function _moduloAnnulla() {
  var form = _moduloForm();
  var anno = _moduloAnno();
  var memoria = _moduloMemoria(form);
  var righe = ['ANNULLO quello che ha fatto MODULO_2_prepara per l\'anno ' + anno + '.'];

  var tolti = _moduloTogliTrigger();
  righe.push(tolti > 0 ? 'Chiusura programmata: tolta.' : 'Chiusura programmata: non ce n\'era.');

  var idFoglio = memoria.fogli[anno];
  var collegatoA = _moduloDestinazione(form);
  if (idFoglio && collegatoA === idFoglio) {
    _moduloRiprova(function () { form.removeDestination(); });
    righe.push('Foglio dell\'anno: scollegato. Resta nel Drive con le risposte che contiene.');
  } else if (collegatoA) {
    righe.push('Il modulo scrive in un foglio che non ho collegato io: non lo tocco.');
  } else {
    righe.push('Il modulo non e\' collegato a nessun foglio.');
  }
  righe.push('Non ho cancellato niente: foglio e cartelle restano dove sono. Se non servono li butti tu.');
  return righe.join('\n');
}


// ===========================================================================
//  PEZZI
// ===========================================================================
function _moduloForm() {
  var form = null;
  try { form = FormApp.getActiveForm(); } catch (e) { form = null; }
  if (!form) {
    throw new Error('Non trovo il modulo. Questo script va incollato DENTRO il modulo (in Google ' +
      'Moduli: tre puntini in alto a destra -> Apps Script), non in un progetto a parte.');
  }
  return form;
}

function _moduloFuso() {
  return String(MODULO.fusoOrario || 'Europe/Rome');
}

/** Oggi nel fuso della scuola, come 2026-09-19: l'editor del modulo puo' averne un altro. */
function _moduloOggi() {
  return Utilities.formatDate(new Date(), _moduloFuso(), 'yyyy-MM-dd');
}

function _moduloPermessiCompleti() {
  try {
    if (typeof ScriptApp.requireAllScopes === 'function') ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  } catch (e) { /* da un menu puo' non essere disponibile: controllo qui sotto */ }
  try {
    var stato = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizationStatus();
    return stato !== ScriptApp.AuthorizationStatus.REQUIRED;
  } catch (e2) {
    return true;
  }
}

/** L'anno scolastico da preparare, nella forma 2026-27. Cambia il primo settembre. */
function _moduloAnno(oggi) {
  var a = String(MODULO.anno === undefined || MODULO.anno === null ? 'auto' : MODULO.anno).replace(/\s/g, '');
  if (a === '' || a.toLowerCase() === 'auto') {
    var t = oggi || _moduloOggi();
    var annoT = parseInt(t.substring(0, 4), 10), meseT = parseInt(t.substring(5, 7), 10);
    var inizio = (meseT >= 9) ? annoT : annoT - 1;
    return inizio + '-' + ('0' + ((inizio + 1) % 100)).slice(-2);
  }
  var m = /^(\d{4})-(\d{2})$/.exec(a);
  if (!m || (parseInt(m[1], 10) + 1) % 100 !== parseInt(m[2], 10)) {
    throw new Error('L\'anno "' + a + '" non e\' nella forma 2026-27. Correggi MODULO.anno, oppure scrivi \'auto\'.');
  }
  return a;
}

function _moduloNome(modello, anno) {
  return String(modello || '').split('{anno}').join(anno).replace(/^\s+|\s+$/g, '');
}

function _moduloPezzi(percorso) {
  var fuori = [];
  var pezzi = String(percorso || '').split(/[\\\/]+/);
  for (var i = 0; i < pezzi.length; i++) {
    var p = pezzi[i].replace(/^\s+|\s+$/g, '');
    if (p !== '') fuori.push(p);
  }
  return fuori;
}

function _moduloDue(n) { return ('0' + n).slice(-2); }

/**
 * Il giorno di chiusura dentro l'anno scolastico: 31/08 del 2026-27 e' il 31
 * agosto 2027. Restituisce null se la chiusura non e' richiesta.
 */
function _moduloGiornoChiusura(anno) {
  var c = String(MODULO.chiusura || '').replace(/\s/g, '');
  if (c === '') return null;
  var m = /^(\d{1,2})\/(\d{1,2})$/.exec(c);
  if (!m) throw new Error('La chiusura "' + c + '" non e\' nella forma giorno/mese, per esempio 31/08.');
  var giorno = parseInt(m[1], 10), mese = parseInt(m[2], 10);
  var inizio = parseInt(anno.substring(0, 4), 10);
  var annoData = (mese >= 9) ? inizio : inizio + 1;
  var prova = new Date(Date.UTC(annoData, mese - 1, giorno));
  if (mese < 1 || mese > 12 || giorno < 1 || prova.getUTCMonth() !== mese - 1) {
    throw new Error('Il giorno di chiusura "' + c + '" non esiste.');
  }
  var dopo = new Date(Date.UTC(annoData, mese - 1, giorno + 1));
  return {
    testo:     annoData + '-' + _moduloDue(mese) + '-' + _moduloDue(giorno),
    leggibile: _moduloDue(giorno) + '/' + _moduloDue(mese) + '/' + annoData,
    // il trigger scatta verso la mezzanotte con cui comincia il giorno DOPO: il giorno indicato vale tutto
    scatta:    { anno: dopo.getUTCFullYear(), mese: dopo.getUTCMonth() + 1, giorno: dopo.getUTCDate() }
  };
}

function _moduloProgrammaChiusura(anno, davvero, righe) {
  var g = _moduloGiornoChiusura(anno);
  if (!g) {
    if (davvero) _moduloTogliTrigger();
    righe.push('Chiusura automatica: non richiesta. Il modulo resta aperto finche\' non lo chiudi tu.');
    return;
  }
  if (_moduloOggi() > g.testo) {
    if (davvero) _moduloTogliTrigger();
    righe.push('Chiusura automatica: il ' + g.leggibile + ' e\' gia\' passato, non programmo niente.');
    return;
  }
  if (davvero) {
    _moduloTogliTrigger();
    ScriptApp.newTrigger(_MODULO_TRIGGER).timeBased()
      .atDate(g.scatta.anno, g.scatta.mese, g.scatta.giorno)
      .inTimezone(_moduloFuso())
      .create();
  }
  righe.push('Chiusura automatica: ' + (davvero ? 'programmata' : 'verrebbe programmata') +
             ' per la fine del ' + g.leggibile + ' (chiude il modulo e scollega il foglio).');
}

function _moduloTogliTrigger() {
  var tolti = 0;
  var tutti = ScriptApp.getProjectTriggers();
  for (var i = 0; i < tutti.length; i++) {
    if (tutti[i].getHandlerFunction() === _MODULO_TRIGGER) {
      ScriptApp.deleteTrigger(tutti[i]);
      tolti++;
    }
  }
  return tolti;
}

/** L'id del foglio in cui il modulo scrive adesso, oppure null. */
function _moduloDestinazione(form) {
  try {
    if (form.getDestinationType() !== FormApp.DestinationType.SPREADSHEET) return null;
    return form.getDestinationId() || null;
  } catch (e) {
    return null;                                       // nessuna destinazione: Google lo dice con un errore
  }
}

/** Collegare e scollegare un foglio ogni tanto fallisce per un attimo: un secondo tentativo basta. */
function _moduloRiprova(f) {
  try { return f(); }
  catch (e) {
    Utilities.sleep(2000);
    return f();
  }
}

function _moduloApribile(idFoglio) {
  try { SpreadsheetApp.openById(idFoglio); return true; }
  catch (e) { return false; }
}

/** Quante righe di risposte ci sono nel foglio: la scheda piu' lunga, senza l'intestazione. */
function _moduloRigheDiRisposte(idFoglio) {
  try {
    var schede = SpreadsheetApp.openById(idFoglio).getSheets();
    var massimo = 0;
    for (var i = 0; i < schede.length; i++) {
      var righe = schede[i].getLastRow() - 1;
      if (righe > massimo) massimo = righe;
    }
    return massimo;
  } catch (e) {
    return -1;
  }
}

/** Quello che lo script ricorda da un anno all'altro: { modulo: id, fogli: { '2026-27': id } }. */
function _moduloMemoria(form) {
  var vuota = { modulo: form ? form.getId() : '', fogli: {} };
  try {
    var testo = PropertiesService.getScriptProperties().getProperty(_MODULO_CHIAVE);
    if (!testo) return vuota;
    var m = JSON.parse(testo);
    if (!m || typeof m !== 'object' || !m.fogli || typeof m.fogli !== 'object') return vuota;
    // la copia di un modulo si porta dietro lo script: non deve ereditare i fogli dell'originale
    if (form && m.modulo && m.modulo !== form.getId()) return vuota;
    return m;
  } catch (e) {
    return vuota;
  }
}

function _moduloRicorda(memoria) {
  PropertiesService.getScriptProperties().setProperty(_MODULO_CHIAVE, JSON.stringify(memoria));
}


// [DRIVE >>>  questa parte chiede il permesso per Drive; Campanella la toglie se scegli di farne a meno
function _moduloFigli(iteratore) {
  var fuori = [];
  while (iteratore.hasNext()) {
    var x = iteratore.next();
    if (!x.isTrashed()) fuori.push(x);                 // il cestino non conta
  }
  fuori.sort(function (a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });
  return fuori;
}

/** Trova la cartella del foglio dentro "Il mio Drive"; se crea e' vero, crea i pezzi che mancano. */
function _moduloCartella(anno, crea, righe) {
  var nomi = [_moduloNome(MODULO.cartellaAnno || 'A.S. {anno}', anno)].concat(_moduloPezzi(MODULO.cartellaFoglio));
  var corrente = DriveApp.getRootFolder();
  var percorso = 'Il mio Drive';
  for (var i = 0; i < nomi.length; i++) {
    percorso += ' / ' + nomi[i];
    if (corrente === null) { righe.push('  da creare: ' + percorso); continue; }
    var trovate = _moduloFigli(corrente.getFoldersByName(nomi[i]));
    if (trovate.length === 0) {
      if (crea) {
        corrente = corrente.createFolder(nomi[i]);
        righe.push('  creata:  ' + percorso);
      } else {
        corrente = null;
        righe.push('  da creare: ' + percorso + '   (se l\'hai appena creata dal PC, aspetta che Drive finisca di caricarla)');
      }
    } else {
      corrente = trovate[0];
      righe.push('  trovata: ' + percorso);
      if (trovate.length > 1) {
        righe.push('  ATTENZIONE: ci sono ' + trovate.length + ' cartelle "' + nomi[i] + '" nello stesso posto. Uso la piu\' vecchia;');
        righe.push('  le altre controllale tu: di solito nascono quando lo script gira prima che il PC abbia caricato la sua.');
      }
    }
  }
  return { cartella: corrente, percorso: percorso };
}

function _moduloFoglioPerNome(cartella, nome) {
  var trovati = _moduloFigli(cartella.getFilesByName(nome));
  for (var i = 0; i < trovati.length; i++) {
    if (trovati[i].getMimeType() === MimeType.GOOGLE_SHEETS) return trovati[i].getId();
  }
  return null;
}

/** Mette il foglio nella cartella. Falso se c'era gia'. */
function _moduloMetti(idFoglio, cartella) {
  var file = DriveApp.getFileById(idFoglio);
  var genitori = file.getParents();
  while (genitori.hasNext()) {
    if (genitori.next().getId() === cartella.getId()) return false;
  }
  file.moveTo(cartella);
  return true;
}

function _moduloNelCestino(idFoglio) {
  try { return DriveApp.getFileById(idFoglio).isTrashed(); }
  catch (e) { return true; }
}
// <<< DRIVE]
