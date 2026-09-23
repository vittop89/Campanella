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
 *    chiedi tu (svuotaRisposte) e solo dopo aver ritrovato ognuna, dal momento
 *    in cui e' arrivata, in un foglio degli anni scorsi.
 *
 *  FUNZIONI
 *    MODULO_1_anteprima ... dice cosa farebbe, senza fare niente
 *    MODULO_2_prepara ..... prepara l'anno: foglio, collegamento, chiusura
 *    MODULO_ANNULLA ....... toglie la chiusura programmata e scollega il foglio
 *                           dell'anno (il foglio resta dov'e')
 *    MODULO_PASSA_AL_FOGLIO  se questo modulo passa sotto il foglio di controllo
 *                           di piu' moduli: toglie solo la chiusura di qui, per
 *                           non chiudere il modulo due volte
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

var _MODULO_VERSIONE = '1.4.6';
var _MODULO_TRIGGER  = 'MODULO_chiusura';
var _MODULO_CHIAVE   = 'CAMPANELLA_MODULO';


// ===========================================================================
//  LE FUNZIONI DA ESEGUIRE
// ===========================================================================
function MODULO_1_anteprima() {
  var testo = _moduloEsegui_(false);
  Logger.log(testo);
  return testo;
}

function MODULO_2_prepara() {
  return _moduloUnoAllaVolta_(function () { return _moduloEsegui_(true); });
}

function MODULO_ANNULLA() {
  return _moduloUnoAllaVolta_(function () { return _moduloAnnulla_(); });
}

/**
 * Da usare quando questo modulo passa sotto il foglio di controllo (quello con
 * una riga per modulo). Toglie solo la chiusura programmata da qui, cosi' non
 * si ritrova a chiudere il modulo due volte; il foglio delle risposte resta
 * collegato e il modulo resta com'e'.
 */
function MODULO_PASSA_AL_FOGLIO() {
  return _moduloUnoAllaVolta_(function () {
    var tolti = _moduloTogliTrigger_();
    var righe = ['PASSO IL COMANDO AL FOGLIO DI CONTROLLO', ''];
    righe.push(tolti > 0 ? 'Chiusura programmata da qui: tolta.'
                         : 'Chiusura programmata da qui: non ce n\'era.');
    righe.push('Il collegamento al foglio delle risposte NON e\' stato toccato: il modulo');
    righe.push('continua a scrivere dove scriveva.');
    righe.push('');
    righe.push('Adesso, nel foglio di controllo, metti una riga per questo modulo con la');
    righe.push('STESSA cartella e lo STESSO nome del foglio che vedi qui sopra: cosi\' lo');
    righe.push('riconosce e non ne crea un altro. Poi "Prepara l\'anno nuovo" da li\'.');
    righe.push('');
    righe.push('Se cambi idea: "Prepara l\'anno nuovo" da questo menu riprende il comando');
    righe.push('(e ricordati di togliere la spunta "Attivo" nella riga del foglio).');
    return righe.join('\n');
  });
}

/**
 * La chiama Google, da sola, finito il giorno di chiusura. Prima chiude il
 * modulo (cosi' non arriva niente a meta' lavoro), poi scollega il foglio.
 * Se il modulo non si chiude, il foglio resta collegato: le risposte che
 * arrivano ci finiscono lo stesso, e fra un'ora si riprova.
 */
function MODULO_chiusura(e) {
  // lo stesso lock del menu: una chiusura a meta' di "Prepara l'anno nuovo" richiuderebbe il
  // modulo appena riaperto. Se e' occupato non aspetto: riprovo fra un'ora
  var lock = LockService.getUserLock();
  if (!lock.tryLock(10000)) {
    _moduloRiprogramma_(e);
    return _moduloScriviNelRegistro_(['CHIUSURA DI FINE ANNO',
      'Un\'altra esecuzione e\' in corso: non tocco niente adesso, riprovo fra un\'ora.']);
  }
  try { return _moduloChiudi_(e); }
  finally { lock.releaseLock(); }
}

function _moduloChiudi_(e) {
  var form = _moduloForm_();
  var memoria = _moduloMemoria_(form);
  var righe = ['CHIUSURA DI FINE ANNO'];
  // la scadenza e' quella segnata da "Prepara l'anno nuovo". Se e' ancora avanti, questo e'
  // un tentativo rimasto indietro e non c'e' niente da chiudere. Una chiusura programmata
  // da una versione di prima non la segnava: vale il giorno appena finito (il trigger
  // scatta verso la mezzanotte, anche qualche minuto prima)
  var oggi = _moduloOggi_();
  if (memoria.scadenza && oggi < memoria.scadenza) {
    righe.push('La chiusura e\' programmata per la fine del ' + _moduloLeggibile_(memoria.scadenza) + ': oggi non chiudo niente.');
    _moduloTogliScattato_(e);
    return _moduloScriviNelRegistro_(righe);
  }
  var finito = memoria.scadenza ||
    Utilities.formatDate(new Date(new Date().getTime() - 12 * 60 * 60 * 1000), _moduloFuso_(), 'yyyy-MM-dd');
  if (!memoria.scadenza) {
    // lo segno al primo tentativo: se il modulo non si chiude, quelli fra un'ora devono chiudere
    // lo stesso anno. Ricalcolato dopo mezza giornata sarebbe gia' l'anno nuovo
    memoria.modulo = form.getId();
    memoria.scadenza = finito;
    _moduloRicorda_(memoria);
  }
  var guasto = '';
  try { _moduloRiprova_(function () { form.setAcceptingResponses(false); }); }
  catch (e1) { guasto = String(e1.message || e1); }  // lo guardo qui sotto
  var ancoraAperto = false;
  try { ancoraAperto = form.isAcceptingResponses(); } catch (e2) { ancoraAperto = false; }
  if (ancoraAperto) {
    // un modulo non pubblicato non raccoglie risposte comunque: quello non lo riprovo per sempre
    var pubblicato = true;
    try {
      if (typeof form.supportsAdvancedResponderPermissions === 'function' &&
          form.supportsAdvancedResponderPermissions()) pubblicato = form.isPublished();
    } catch (e3) { pubblicato = true; }
    if (pubblicato) {
      righe.push('Non sono riuscito a chiudere il modulo' + (guasto ? ' (' + guasto + ')' : '') + ': accetta ancora risposte.');
      righe.push('Resta collegato al suo foglio, cosi\' le risposte che arrivano ci finiscono. Riprovo fra un\'ora.');
      _moduloRiprogramma_(e);
      return _moduloScriviNelRegistro_(righe);
    }
  }
  righe.push('Il modulo non accetta piu\' risposte. Riapre con "Prepara l\'anno nuovo".');
  if (_moduloDestinazione_(form)) {
    try { _moduloRiprova_(function () { form.removeDestination(); }); }
    catch (e4) {
      righe.push('Non sono riuscito a scollegare il foglio (' + (e4.message || e4) + '). Riprovo fra un\'ora.');
      _moduloRiprogramma_(e);
      return _moduloScriviNelRegistro_(righe);
    }
    righe.push('Foglio delle risposte scollegato: resta dov\'e\', con tutto quello che contiene.');
  } else {
    righe.push('Il modulo non era collegato a nessun foglio.');
  }
  // il segno che per quell'anno la chiusura e' scattata: "Prepara l'anno nuovo" rieseguito
  // dopo non deve ricollegare ne' riaprire. L'anno dalla data, non da MODULO.anno
  memoria.modulo = form.getId();
  memoria.chiusi[_moduloAnnoDellaData_(finito)] = finito;
  memoria.scadenza = '';
  _moduloRicorda_(memoria);
  _moduloTogliTrigger_();                               // i trigger gia' scattati restano in elenco: li tolgo
  return _moduloScriviNelRegistro_(righe);
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
      .addItem('Passa il comando al foglio di controllo', 'MODULO_menu_passa')
      .addItem('Annulla: togli chiusura e collegamento', 'MODULO_menu_annulla')
      .addToUi();
  } catch (e) {
    // aperto da un contesto senza interfaccia: il menu non serve
  }
}

function MODULO_menu_anteprima() {
  var testo = _moduloProtetto_(function () { return MODULO_1_anteprima(); });
  var ui = FormApp.getUi();
  ui.alert('Campanella - anteprima', testo, ui.ButtonSet.OK);
}

function MODULO_menu_prepara() {
  var ui = FormApp.getUi();
  var anno;
  try { anno = _moduloAnno_(); }
  catch (e) { ui.alert('Campanella', String(e.message || e), ui.ButtonSet.OK); return; }
  var risposta = ui.alert('Campanella',
    'Preparo l\'anno scolastico ' + anno + ': foglio delle risposte "' +
    _moduloNome_(MODULO.nomeFoglio, anno) + '", collegamento del modulo e chiusura programmata.\n\n' +
    (MODULO.svuotaRisposte
      ? 'Le risposte degli anni scorsi le tolgo dal modulo, ma solo se le ritrovo tutte, una per una, ' +
        'in un foglio degli anni scorsi: toglierle non si puo\' annullare. Fogli e cartelle non li cancello. Procedo?'
      : 'Non cancello niente. Procedo?'), ui.ButtonSet.YES_NO);
  if (risposta !== ui.Button.YES) return;
  // prima il lavoro, poi il messaggio: una finestra lasciata aperta fermerebbe lo script a meta'
  var testo = _moduloProtetto_(function () { return MODULO_2_prepara(); });
  ui.alert('Campanella', testo, ui.ButtonSet.OK);
}

function MODULO_menu_passa() {
  var ui = FormApp.getUi();
  var risposta = ui.alert('Campanella',
    'Tolgo la chiusura programmata da qui, cosi\' il comando passa al foglio di controllo.\n' +
    'Il foglio delle risposte resta collegato e il modulo non cambia. Procedo?', ui.ButtonSet.YES_NO);
  if (risposta !== ui.Button.YES) return;
  var testo = _moduloProtetto_(function () { return MODULO_PASSA_AL_FOGLIO(); });
  ui.alert('Campanella', testo, ui.ButtonSet.OK);
}

function MODULO_menu_annulla() {
  var ui = FormApp.getUi();
  var risposta = ui.alert('Campanella',
    'Tolgo la chiusura programmata e scollego il foglio di quest\'anno.\n' +
    'Il foglio resta nel Drive con le risposte che contiene. Procedo?', ui.ButtonSet.YES_NO);
  if (risposta !== ui.Button.YES) return;
  var testo = _moduloProtetto_(function () { return MODULO_ANNULLA(); });
  ui.alert('Campanella', testo, ui.ButtonSet.OK);
}

function _moduloProtetto_(f) {
  try { return f(); }
  catch (e) { return 'Non ho potuto procedere:\n' + String(e.message || e); }
}

function _moduloUnoAllaVolta_(f) {
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
function _moduloEsegui_(davvero) {
  var righe = [];
  var form = _moduloForm_();
  var anno = _moduloAnno_();
  var nomeFoglio = _moduloNome_(MODULO.nomeFoglio || 'Risposte - A.S. {anno}', anno);
  var conDrive = (MODULO.usaDrive !== false) && (typeof _moduloCartella_ === 'function');
  var memoria = _moduloMemoria_(form);

  righe.push(davvero ? 'PREPARO L\'ANNO SCOLASTICO ' + anno
                     : 'ANTEPRIMA per l\'anno scolastico ' + anno + ' - non modifico niente.');
  righe.push('Modulo: "' + (form.getTitle() || '(senza titolo)') + '"');
  righe.push('Script: Campanella ' + _MODULO_VERSIONE + ' (se Campanella e\' piu\' nuova, rigenera e reincolla il codice)');
  righe.push('');

  // Google lascia togliere le spunte ai singoli permessi. La chiusura di fine anno gira da
  // sola e non puo' chiedere niente a nessuno: se manca un permesso fallirebbe fra un anno.
  if (!_moduloPermessiCompleti_()) {
    righe.push('MANCA QUALCHE PERMESSO. Nella finestra di Google le spunte vanno lasciate tutte:');
    righe.push('riesegui la funzione e, quando Google lo chiede, concedi tutti i permessi.');
    righe.push('Non ho fatto niente.');
    return righe.join('\n');
  }

  // --- 0. l'anno di questo modulo e' gia' finito? --------------------------------
  // Rieseguire "Prepara l'anno nuovo" a meta' anno non deve disfare quello che e' successo
  // dopo: un modulo gia' arrivato alla sua chiusura non va ricollegato (Google ricopierebbe
  // tutte le risposte in una scheda nuova del foglio) e non va riaperto. Lo dice la memoria,
  // che l'ha segnato quando la chiusura e' scattata; per un anno preparato da una versione
  // di prima il segno non c'e', e allora guardo il giorno di chiusura di adesso.
  // "pronti" vale true per un anno preparato fino in fondo da questa versione, 'da prima'
  // per uno ereditato da una versione precedente (di cui non so com'e' finito).
  var giaPreparata = memoria.pronti[anno];
  var giorno = _moduloGiornoChiusura_(anno);            // scritto male: si ferma qui, prima di toccare niente
  var finitoIl = memoria.chiusi[anno] || '';
  if (!finitoIl && giaPreparata && giorno && _moduloOggi_() > giorno.testo) finitoIl = giorno.testo;
  if (finitoIl) {
    var ancoraAperto = false;
    try { ancoraAperto = form.isAcceptingResponses(); } catch (e0) { ancoraAperto = false; }
    righe.push('L\'anno ' + anno + ' per questo modulo e\' finito il ' + _moduloLeggibile_(finitoIl) +
               ': non lo ricollego e non lo riapro.');
    if (giorno && giorno.testo !== finitoIl) {
      righe.push('(la chiusura adesso dice ' + giorno.leggibile + ', ma per quest\'anno e\' gia\' scattata: se va');
      righe.push('riaperto, riaprilo da Google Moduli -> Risposte)');
    }
    if (ancoraAperto) righe.push('(risulta ancora aperto: se va chiuso, chiudilo da Google Moduli)');
    righe.push('');
    righe.push('L\'anno nuovo si prepara dal primo settembre.');
    return righe.join('\n');
  }

  // --- 1. la cartella --------------------------------------------------------
  var dest = null;
  if (conDrive) {
    righe.push('Cartella del foglio');
    dest = _moduloCartella_(anno, davvero, righe);
  } else {
    righe.push('Cartella del foglio: questo script non ha il permesso per Drive. Il foglio nasce');
    righe.push('  nella radice di "Il mio Drive": spostalo tu nella cartella dell\'anno, dal PC o');
    righe.push('  dal sito di Drive. Spostarlo non rompe il collegamento con il modulo.');
  }
  righe.push('');

  // --- 2. il foglio ----------------------------------------------------------
  var idFoglio = null;
  var foglioDiQuestAnno = false;                       // il foglio preparato gia' prima di questa volta
  var ricordato = memoria.fogli[anno];
  if (ricordato && _moduloApribile_(ricordato) &&
      !(conDrive && _moduloNelCestino_(ricordato))) {
    idFoglio = ricordato;
    foglioDiQuestAnno = true;
    righe.push('Foglio delle risposte: c\'e\' gia\', e\' quello creato da questo script. Lo lascio dov\'e\'.');
  }
  if (!idFoglio && conDrive && dest && dest.cartella) {
    idFoglio = _moduloFoglioPerNome_(dest.cartella, nomeFoglio);
    if (idFoglio) righe.push('Foglio delle risposte: "' + nomeFoglio + '" esiste gia\' nella cartella. Uso quello, senza doppioni.');
  }
  if (!idFoglio) {
    if (davvero) {
      idFoglio = SpreadsheetApp.create(nomeFoglio).getId();
      // lo ricordo subito: se qualcosa va storto piu' avanti, rieseguendo non ne nasce un secondo
      memoria.modulo = form.getId();
      memoria.fogli[anno] = idFoglio;
      _moduloRicorda_(memoria);
      righe.push('Foglio delle risposte: creato "' + nomeFoglio + '".');
      if (conDrive && dest && dest.cartella) {
        try {
          if (_moduloMetti_(idFoglio, dest.cartella)) righe.push('  messo in: ' + dest.percorso);
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
  // Un anno ereditato da una versione di prima, il cui foglio non e' mai stato collegato:
  // quella preparazione si e' fermata prima del collegamento, e quindi anche prima della
  // riapertura. Lo tratto come mai fatto.
  if (giaPreparata === 'da prima' && (!foglioDiQuestAnno || !_moduloGiaCollegatoUnaVolta_(idFoglio))) {
    giaPreparata = false;
  }
  var collegatoA = _moduloDestinazione_(form);
  var giaCollegato = (idFoglio !== null && collegatoA === idFoglio);
  var quante = form.getResponses().length;
  righe.push('');
  if (giaCollegato) {
    righe.push('Collegamento: il modulo scrive gia\' in questo foglio. Non lo tocco.');
  } else if (foglioDiQuestAnno && !memoria.annullati[anno] && _moduloGiaCollegatoUnaVolta_(idFoglio)) {
    // Il foglio di quest'anno ha gia' la sua scheda di risposte: e' stato collegato, e adesso
    // il modulo non ci scrive piu'. L'ha scollegato qualcuno. Ricollegarlo farebbe ricopiare
    // a Google tutte le risposte in una scheda nuova dello stesso foglio. (Un foglio ancora
    // intatto, invece, non e' mai stato collegato: una preparazione rotta a meta'.)
    righe.push('Collegamento: quest\'anno il modulo scriveva in questo foglio, e adesso non ci scrive piu\'.');
    righe.push('  Non lo ricollego: Google ricopierebbe tutte le risposte in una scheda nuova. Se va');
    righe.push('  ricollegato davvero, fallo da Google Moduli (Risposte -> Collega a Fogli).');
  } else {
    if (quante > 0) _moduloRisposteVecchie_(form, quante, collegatoA, idFoglio, memoria, davvero, righe);
    if (davvero) {
      _moduloRiprova_(function () { form.setDestination(FormApp.DestinationType.SPREADSHEET, idFoglio); });
      righe.push('Collegamento: fatto. Le risposte nuove arrivano nel foglio dell\'anno.');
      if (memoria.annullati[anno]) delete memoria.annullati[anno];
    } else {
      righe.push('Collegamento: il modulo verrebbe collegato al foglio dell\'anno' +
                 (collegatoA ? ' (adesso scrive in un altro foglio, che resta com\'e\').' : '.'));
    }
  }

  // --- 4. il modulo riapre --------------------------------------------------------
  var riapertura = _moduloRiapri_(form, davvero, righe, giaPreparata);

  // --- 5. la chiusura di fine anno -------------------------------------------------
  var programmata = _moduloProgrammaChiusura_(anno, davvero, righe);

  // --- 6. per l'anno prossimo -------------------------------------------------------
  if (davvero) {
    memoria.modulo = form.getId();
    memoria.fogli[anno] = idFoglio;
    // la scadenza va segnata adesso: il giorno in cui scatta, l'anno scolastico puo' essere
    // gia' cambiato. E l'anno e' "pronto" solo a lavoro finito: un modulo non pubblicato, o
    // che non si e' riaperto, la volta dopo si riprova a riaprirlo
    memoria.scadenza = programmata ? programmata.testo : '';
    if (riapertura === 'aperto' || riapertura === 'riaperto' || riapertura === 'lasciato chiuso' ||
        riapertura === 'non richiesta') {
      memoria.pronti[anno] = true;
    }
    _moduloRicorda_(memoria);
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
 * possono togliere dal modulo, ma solo se ognuna sta gia' in un foglio degli
 * anni scorsi: altrimenti sarebbe una cancellazione vera, e non si torna
 * indietro. Contare le righe non basta: un foglio vecchio puo' averne tante e
 * non avere quelle arrivate dopo, solo nel modulo.
 */
function _moduloRisposteVecchie_(form, quante, collegatoA, idFoglio, memoria, davvero, righe) {
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
  var alSicuro = _moduloRisposteAlSicuro_(form, candidati);
  if (alSicuro.mancano > 0) {
    righe.push('Risposte gia\' nel modulo: ' + quante + '. NON le tolgo: ' +
               (alSicuro.mancano === quante ? 'non le ritrovo' : alSicuro.mancano + ' non le ritrovo') +
               ' in nessun foglio degli anni scorsi');
    righe.push('  (le cerco una per una, dal momento in cui sono arrivate), e toglierle sarebbe cancellarle.');
    righe.push('  Finiranno anche nel foglio nuovo. Se sei sicuro che non servono, toglile tu dal modulo');
    righe.push('  (Risposte -> Elimina tutte le risposte).');
    return;
  }
  if (davvero) {
    form.deleteAllResponses();
    righe.push('Risposte degli anni scorsi: ' + quante + ', tolte dal modulo. Restano nel foglio');
  } else {
    righe.push('Risposte degli anni scorsi: ' + quante + ', verrebbero tolte dal modulo. Restano nel foglio');
  }
  for (var k = 0; k < alSicuro.fogli.length; k++) {
    righe.push('  ' + SpreadsheetApp.openById(alSicuro.fogli[k]).getUrl());
  }
}

/**
 * Riapre un modulo chiuso: e' il lavoro di inizio anno, quando la chiusura
 * dell'anno prima lo ha lasciato chiuso. Se quest'anno era gia' stato preparato
 * invece no: un modulo chiuso a meta' anno l'ha chiuso qualcuno, apposta.
 * Torna com'e' andata: 'aperto', 'riaperto', 'lasciato chiuso', 'lasciato
 * chiuso, da prima', 'non pubblicato', 'non riaperto', 'da riaprire' (anteprima)
 * o 'non richiesta'.
 */
function _moduloRiapri_(form, davvero, righe, giaPreparata) {
  if (MODULO.riapri === false) return 'non richiesta';
  var aperto = true;
  try { aperto = form.isAcceptingResponses(); } catch (e) { aperto = true; }
  if (aperto) return 'aperto';
  if (giaPreparata === true) {
    righe.push('Il modulo e\' chiuso e quest\'anno era gia\' pronto: l\'ha chiuso qualcuno, non lo riapro.');
    righe.push('  (se va riaperto: Google Moduli -> Risposte -> "Accetta risposte")');
    return 'lasciato chiuso';
  }
  if (giaPreparata) {
    // preparato con una versione di prima: non so se l'ha chiuso qualcuno o se allora non si
    // era riaperto. Nel dubbio non lo riapro, e lo dico com'e'.
    righe.push('Il modulo e\' chiuso, e quest\'anno era gia\' stato preparato con la versione di prima:');
    righe.push('  non lo riapro. Se va riaperto: Google Moduli -> Risposte -> "Accetta risposte".');
    return 'lasciato chiuso, da prima';
  }

  // dal 2025 un modulo puo' essere "non pubblicato": riaprirlo darebbe errore, e pubblicarlo
  // e' una decisione del docente, non di uno script
  var pubblicato = true;
  try {
    if (typeof form.supportsAdvancedResponderPermissions === 'function' &&
        form.supportsAdvancedResponderPermissions()) pubblicato = form.isPublished();
  } catch (e2) { pubblicato = true; }
  if (!pubblicato) {
    righe.push('Il modulo non e\' pubblicato: non lo riapro io. Quando e\' pronto, pubblicalo tu da Google Moduli.');
    return 'non pubblicato';
  }
  if (!davvero) { righe.push('Il modulo e\' chiuso: verrebbe riaperto alle risposte.'); return 'da riaprire'; }
  try {
    form.setAcceptingResponses(true);
    righe.push('Il modulo era chiuso: adesso accetta di nuovo risposte.');
    return 'riaperto';
  } catch (e3) {
    righe.push('Non sono riuscito a riaprire il modulo (' + (e3.message || e3) + '): riaprilo tu da Google Moduli,');
    righe.push('  oppure riesegui: la volta dopo ci riprovo.');
    return 'non riaperto';
  }
}

function _moduloAnnulla_() {
  var form = _moduloForm_();
  var anno = _moduloAnno_();
  var memoria = _moduloMemoria_(form);
  var righe = ['ANNULLO quello che ha fatto MODULO_2_prepara per l\'anno ' + anno + '.'];

  var tolti = _moduloTogliTrigger_();
  righe.push(tolti > 0 ? 'Chiusura programmata: tolta.' : 'Chiusura programmata: non ce n\'era.');
  // annullato, l'anno non e' piu' "pronto" (ne' chiuso): la prossima preparazione lo rifa'
  // tutto, ricollegamento compreso (scollegato da me, non da qualcuno)
  memoria.scadenza = '';
  delete memoria.pronti[anno];
  delete memoria.chiusi[anno];
  memoria.annullati[anno] = true;
  _moduloRicorda_(memoria);

  var idFoglio = memoria.fogli[anno];
  var collegatoA = _moduloDestinazione_(form);
  if (idFoglio && collegatoA === idFoglio) {
    _moduloRiprova_(function () { form.removeDestination(); });
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
function _moduloForm_() {
  var form = null;
  try { form = FormApp.getActiveForm(); } catch (e) { form = null; }
  if (!form) {
    throw new Error('Non trovo il modulo. Questo script va incollato DENTRO il modulo (in Google ' +
      'Moduli: tre puntini in alto a destra -> Apps Script), non in un progetto a parte.');
  }
  return form;
}

function _moduloFuso_() {
  return String(MODULO.fusoOrario || 'Europe/Rome');
}

/** Oggi nel fuso della scuola, come 2026-09-19: l'editor del modulo puo' averne un altro. */
function _moduloOggi_() {
  return Utilities.formatDate(new Date(), _moduloFuso_(), 'yyyy-MM-dd');
}

function _moduloPermessiCompleti_() {
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
function _moduloAnno_(oggi) {
  var a = String(MODULO.anno === undefined || MODULO.anno === null ? 'auto' : MODULO.anno).replace(/\s/g, '');
  if (a === '' || a.toLowerCase() === 'auto') {
    var t = oggi || _moduloOggi_();
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

function _moduloNome_(modello, anno) {
  return String(modello || '').split('{anno}').join(anno).replace(/^\s+|\s+$/g, '');
}

function _moduloPezzi_(percorso) {
  var fuori = [];
  var pezzi = String(percorso || '').split(/[\\\/]+/);
  for (var i = 0; i < pezzi.length; i++) {
    var p = pezzi[i].replace(/^\s+|\s+$/g, '');
    if (p !== '') fuori.push(p);
  }
  return fuori;
}

function _moduloDue_(n) { return ('0' + n).slice(-2); }

/**
 * Il giorno di chiusura dentro l'anno scolastico: 31/08 del 2026-27 e' il 31
 * agosto 2027. Restituisce null se la chiusura non e' richiesta.
 */
function _moduloGiornoChiusura_(anno) {
  var c = String(MODULO.chiusura || '').replace(/\s/g, '');
  if (c === '') return null;
  var m = /^(\d{1,2})\/(\d{1,2})$/.exec(c);
  if (!m) throw new Error('La chiusura "' + c + '" non e\' nella forma giorno/mese, per esempio 31/08.');
  var giorno = parseInt(m[1], 10), mese = parseInt(m[2], 10);
  // la stessa regola di Campanella e del foglio di controllo: una chiusura che salta tre anni su quattro no
  if (mese === 2 && giorno === 29) throw new Error('Il giorno di chiusura "' + c + '" non c\'e\' tutti gli anni: scegli 28/02 o 01/03.');
  var inizio = parseInt(anno.substring(0, 4), 10);
  var annoData = (mese >= 9) ? inizio : inizio + 1;
  var prova = new Date(Date.UTC(annoData, mese - 1, giorno));
  if (mese < 1 || mese > 12 || giorno < 1 || prova.getUTCMonth() !== mese - 1) {
    throw new Error('Il giorno di chiusura "' + c + '" non esiste.');
  }
  var dopo = new Date(Date.UTC(annoData, mese - 1, giorno + 1));
  return {
    testo:     annoData + '-' + _moduloDue_(mese) + '-' + _moduloDue_(giorno),
    leggibile: _moduloDue_(giorno) + '/' + _moduloDue_(mese) + '/' + annoData,
    // il trigger scatta verso la mezzanotte con cui comincia il giorno DOPO: il giorno indicato vale tutto
    scatta:    { anno: dopo.getUTCFullYear(), mese: dopo.getUTCMonth() + 1, giorno: dopo.getUTCDate() }
  };
}

/** Programma la chiusura dell'anno. Torna il giorno programmato, oppure null. */
function _moduloProgrammaChiusura_(anno, davvero, righe) {
  var g = _moduloGiornoChiusura_(anno);
  if (!g) {
    if (davvero) _moduloTogliTrigger_();
    righe.push('Chiusura automatica: non richiesta. Il modulo resta aperto finche\' non lo chiudi tu.');
    return null;
  }
  if (_moduloOggi_() > g.testo) {
    if (davvero) _moduloTogliTrigger_();
    righe.push('Chiusura automatica: il ' + g.leggibile + ' e\' gia\' passato, non programmo niente.');
    return null;
  }
  if (davvero) {
    _moduloTogliTrigger_();
    ScriptApp.newTrigger(_MODULO_TRIGGER).timeBased()
      .atDate(g.scatta.anno, g.scatta.mese, g.scatta.giorno)
      .inTimezone(_moduloFuso_())
      .create();
  }
  righe.push('Chiusura automatica: ' + (davvero ? 'programmata' : 'verrebbe programmata') +
             ' per la fine del ' + g.leggibile + ' (chiude il modulo e scollega il foglio).');
  return g;
}

function _moduloTogliTrigger_() {
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

/** Il trigger che mi ha chiamato non scatta piu': lo tolgo, e ne programmo uno fra un'ora. */
function _moduloRiprogramma_(e) {
  _moduloTogliScattato_(e);
  ScriptApp.newTrigger(_MODULO_TRIGGER).timeBased().after(60 * 60 * 1000).create();
}

/** Toglie dall'elenco il trigger che ha lanciato questa esecuzione: scattato, resterebbe li'. */
function _moduloTogliScattato_(e) {
  if (!e || !e.triggerUid) return;
  var tutti = ScriptApp.getProjectTriggers();
  for (var i = 0; i < tutti.length; i++) {
    if (String(tutti[i].getUniqueId()) === String(e.triggerUid)) { ScriptApp.deleteTrigger(tutti[i]); return; }
  }
}

function _moduloScriviNelRegistro_(righe) {
  var testo = righe.join('\n');
  Logger.log(testo);
  return testo;
}

/** L'id del foglio in cui il modulo scrive adesso, oppure null. */
function _moduloDestinazione_(form) {
  try {
    if (form.getDestinationType() !== FormApp.DestinationType.SPREADSHEET) return null;
    return form.getDestinationId() || null;
  } catch (e) {
    return null;                                       // nessuna destinazione: Google lo dice con un errore
  }
}

/** Collegare e scollegare un foglio ogni tanto fallisce per un attimo: un secondo tentativo basta. */
function _moduloRiprova_(f) {
  try { return f(); }
  catch (e) {
    Utilities.sleep(2000);
    return f();
  }
}

function _moduloApribile_(idFoglio) {
  try { SpreadsheetApp.openById(idFoglio); return true; }
  catch (e) { return false; }
}

/**
 * Il foglio e' gia' stato collegato a un modulo, almeno una volta? Un foglio
 * creato dallo script nasce con una scheda sola, vuota; collegandolo, Google
 * ci aggiunge la scheda delle risposte, che resta anche quando lo scolleghi.
 */
function _moduloGiaCollegatoUnaVolta_(idFoglio) {
  try {
    var schede = SpreadsheetApp.openById(idFoglio).getSheets();
    if (schede.length > 1) return true;
    return schede.length === 1 && (schede[0].getLastRow() > 0 || schede[0].getLastColumn() > 0);
  } catch (e) { return false; }
}

/** L'anno scolastico a cui appartiene un giorno "2027-06-30": dal primo settembre, l'anno dopo. */
function _moduloAnnoDellaData_(testo) {
  var y = parseInt(String(testo).substring(0, 4), 10), mese = parseInt(String(testo).substring(5, 7), 10);
  var inizio = (mese >= 9) ? y : y - 1;
  return inizio + '-' + ('0' + ((inizio + 1) % 100)).slice(-2);
}

/** "2027-08-31" diventa "31/08/2027". */
function _moduloLeggibile_(testo) {
  var p = String(testo || "").split("-");
  return (p.length === 3) ? p[2] + "/" + p[1] + "/" + p[0] : String(testo || "");
}

/**
 * Quante risposte del modulo NON stanno in nessuno dei fogli candidati, e i
 * fogli in cui stanno le altre. Ogni risposta la cerco per il momento in cui
 * e' arrivata: Google lo scrive nella prima colonna (Informazioni
 * cronologiche), al secondo. Una riga del foglio vale per una risposta sola.
 */
function _moduloRisposteAlSicuro_(form, candidati) {
  var righe = {};                                      // secondo -> i fogli che hanno una riga di quel secondo
  for (var i = 0; i < candidati.length; i++) {
    var tempi = _moduloTempiNelFoglio_(candidati[i]);
    for (var k = 0; k < tempi.length; k++) {
      var s = String(Math.floor(tempi[k] / 1000));
      if (!righe.hasOwnProperty(s)) righe[s] = [];
      righe[s].push(candidati[i]);
    }
  }
  var risposte = form.getResponses();
  var secondi = [];
  for (var q = 0; q < risposte.length; q++) secondi.push(Math.floor(risposte[q].getTimestamp().getTime() / 1000));
  secondi.sort(function (a, b) { return a - b; });     // in ordine: ognuna prende la riga libera piu' vicina
  var mancano = 0, fogli = [];
  for (var r = 0; r < secondi.length; r++) {
    var t = secondi[r];
    // il foglio puo' avere il secondo arrotondato per eccesso: guardo anche quello dopo
    var chiave = null;
    if (righe.hasOwnProperty(String(t)) && righe[String(t)].length > 0) chiave = String(t);
    else if (righe.hasOwnProperty(String(t + 1)) && righe[String(t + 1)].length > 0) chiave = String(t + 1);
    if (chiave === null) { mancano++; continue; }
    var id = righe[chiave].pop();
    if (fogli.indexOf(id) < 0) fogli.push(id);
  }
  return { mancano: mancano, fogli: fogli };
}

/** I momenti (in millisecondi) scritti nella prima colonna di ogni scheda del foglio. */
function _moduloTempiNelFoglio_(idFoglio) {
  var fuori = [];
  try {
    var schede = SpreadsheetApp.openById(idFoglio).getSheets();
    for (var i = 0; i < schede.length; i++) {
      var ultima = schede[i].getLastRow();
      if (ultima < 2) continue;
      var valori = schede[i].getRange(2, 1, ultima - 1, 1).getValues();
      for (var k = 0; k < valori.length; k++) {
        var v = valori[k][0];
        if (v && typeof v.getTime === 'function' && !isNaN(v.getTime())) fuori.push(v.getTime());
      }
    }
  } catch (e) {
    // un foglio che non si apre non tiene al sicuro niente
  }
  return fuori;
}

/**
 * Quello che lo script ricorda da un anno all'altro:
 *   modulo     l'id di questo modulo
 *   fogli      anno -> il foglio delle risposte di quell'anno
 *   scadenza   il giorno di chiusura programmato, come 2027-08-31 ('' = nessuno)
 *   pronti     anno -> quell'anno e' stato preparato fino in fondo
 *   chiusi     anno -> il giorno in cui la chiusura di quell'anno e' scattata
 *   annullati  anno -> scollegato da "Annulla": la prossima volta si ricollega
 * Le ultime quattro ci sono da questa versione. Chi viene da prima ha solo
 * "fogli", e un foglio dell'anno vuol dire un anno preparato: lo ricavo da li'.
 * Di pronti, chiusi e annullati tengo solo l'anno in corso: sono gli unici che servono.
 */
function _moduloMemoria_(form) {
  var anno = null;
  try { anno = _moduloAnno_(); } catch (e0) { anno = null; }
  var vuota = { modulo: form ? form.getId() : '', fogli: {}, scadenza: '', pronti: {}, chiusi: {}, annullati: {} };
  try {
    var testo = PropertiesService.getScriptProperties().getProperty(_MODULO_CHIAVE);
    if (!testo) return vuota;
    var m = JSON.parse(testo);
    if (!m || typeof m !== 'object' || !m.fogli || typeof m.fogli !== 'object') return vuota;
    // la copia di un modulo si porta dietro lo script: non deve ereditare i fogli dell'originale
    if (form && m.modulo && m.modulo !== form.getId()) return vuota;
    if (typeof m.scadenza !== 'string') m.scadenza = '';
    if (!m.pronti || typeof m.pronti !== 'object') {
      // ereditati: so che il foglio c'era, non se l'anno era finito. 'da prima' basta a non
      // riaprire un modulo chiuso, non a dire che l'ha chiuso qualcuno
      m.pronti = {};
      for (var k in m.fogli) if (m.fogli.hasOwnProperty(k)) m.pronti[k] = 'da prima';
    }
    if (!m.chiusi || typeof m.chiusi !== 'object') m.chiusi = {};
    if (!m.annullati || typeof m.annullati !== 'object') m.annullati = {};
    if (anno) {
      m.pronti = _moduloSoloAnno_(m.pronti, anno);
      m.chiusi = _moduloSoloAnno_(m.chiusi, anno);
      m.annullati = _moduloSoloAnno_(m.annullati, anno);
    }
    return m;
  } catch (e) {
    return vuota;
  }
}

function _moduloSoloAnno_(mappa, anno) {
  var fuori = {};
  if (mappa.hasOwnProperty(anno)) fuori[anno] = mappa[anno];
  return fuori;
}

function _moduloRicorda_(memoria) {
  PropertiesService.getScriptProperties().setProperty(_MODULO_CHIAVE, JSON.stringify(memoria));
}


// [DRIVE >>>  questa parte chiede il permesso per Drive; Campanella la toglie se scegli di farne a meno
function _moduloFigli_(iteratore) {
  var fuori = [];
  while (iteratore.hasNext()) {
    var x = iteratore.next();
    if (!x.isTrashed()) fuori.push(x);                 // il cestino non conta
  }
  fuori.sort(function (a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });
  return fuori;
}

/** Trova la cartella del foglio dentro "Il mio Drive"; se crea e' vero, crea i pezzi che mancano. */
function _moduloCartella_(anno, crea, righe) {
  var nomi = [_moduloNome_(MODULO.cartellaAnno || 'A.S. {anno}', anno)].concat(_moduloPezzi_(MODULO.cartellaFoglio));
  var corrente = DriveApp.getRootFolder();
  var percorso = 'Il mio Drive';
  for (var i = 0; i < nomi.length; i++) {
    percorso += ' / ' + nomi[i];
    if (corrente === null) { righe.push('  da creare: ' + percorso); continue; }
    var trovate = _moduloFigli_(corrente.getFoldersByName(nomi[i]));
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

function _moduloFoglioPerNome_(cartella, nome) {
  var trovati = _moduloFigli_(cartella.getFilesByName(nome));
  for (var i = 0; i < trovati.length; i++) {
    if (trovati[i].getMimeType() === MimeType.GOOGLE_SHEETS) return trovati[i].getId();
  }
  return null;
}

/** Mette il foglio nella cartella. Falso se c'era gia'. */
function _moduloMetti_(idFoglio, cartella) {
  var file = DriveApp.getFileById(idFoglio);
  var genitori = file.getParents();
  while (genitori.hasNext()) {
    if (genitori.next().getId() === cartella.getId()) return false;
  }
  file.moveTo(cartella);
  return true;
}

function _moduloNelCestino_(idFoglio) {
  try { return DriveApp.getFileById(idFoglio).isTrashed(); }
  catch (e) { return true; }
}
// <<< DRIVE]
