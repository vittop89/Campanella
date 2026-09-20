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
  chiusura:     '31/08',                   // giorno/mese di partenza per le righe nuove
  fusoOrario:   'Europe/Rome',
  scheda:       'Moduli',                  // la scheda di questo foglio con l'elenco
  moduli: [                                // le righe di partenza: poi comanda la scheda
    { modulo: 'Recuperi', cartella: 'RECUPERI', foglio: 'Risposte Recuperi - A.S. {anno}', chiusura: '31/08', svuota: false }
  ]
};
// <<< CONFIGURAZIONE <<<

var _PAN_VERSIONE = '1.3.6';
var _PAN_TRIGGER  = 'PANNELLO_chiusura';
var _PAN_CHIAVE   = 'CAMPANELLA_PANNELLO';

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
      // sospeso per sempre e terrebbe in piedi le chiusure programmate
      righe.push(r.nome + ': non riesco ad aprirlo (' + (e2.message || e2) + '). Tolgo la sua scadenza.');
      delete memoria.scadenze[r.id];
      continue;
    }
    try { form.setAcceptingResponses(false); } catch (e3) { /* gia' chiuso, o non pubblicato */ }
    if (_panDestinazione(form)) {
      _panRiprova(function () { form.removeDestination(); });
      righe.push(r.nome + ': modulo chiuso, foglio scollegato.');
    } else {
      righe.push(r.nome + ': modulo chiuso (non era collegato a nessun foglio).');
    }
    _panScriviStato(foglio, r, 'chiuso il ' + _panLeggibile(scadenza), null);
    delete memoria.scadenze[r.id];
    fatte++;
  }
  _panRicorda(memoria);
  _panTogliTriggerPassati(memoria);
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

  var ultima = Math.max(foglio.getMaxRows(), 2);
  foglio.getRange(2, _PAN_C.SVUOTA + 1, ultima - 1, 1).insertCheckboxes();
  foglio.getRange(2, _PAN_C.ATTIVO + 1, ultima - 1, 1).insertCheckboxes();

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
  for (var c = 0; c < note.length; c++) foglio.getRange(1, c + 1).setNote(note[c]);

  for (var k = 0; k < _PAN_COLONNE.length; k++) foglio.setColumnWidth(k + 1, k === _PAN_C.LINK ? 260 : 170);

  return 'Scheda "' + PANNELLO.scheda + '" pronta' +
    (righe.length ? ', con ' + (righe.length === 1 ? 'una riga' : righe.length + ' righe') + ' di partenza' : '') + '.\n\n' +
    'Adesso: incolla il link di ogni modulo nella colonna "Link del modulo", oppure usa\n' +
    '"Trova i moduli nel Drive" e li cerca lui dal nome. Poi "Anteprima".';
}

function _panTrovaIModuli() {
  var foglio = _panScheda(true);
  var dati = _panLeggi(foglio);
  var righe = ['CERCO I MODULI NEL DRIVE', ''];
  var trovati = 0;

  for (var i = 0; i < dati.righe.length; i++) {
    var r = dati.righe[i];
    if (!r.attivo) continue;
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

  for (var i = 0; i < dati.righe.length; i++) {
    var r = dati.righe[i];
    if (!r.attivo) continue;
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

  if (attive === 0) {
    righe.push('Nessuna riga attiva: metti la spunta in "Attivo" alle righe da preparare.');
    return righe.join('\n');
  }
  if (davvero) {
    _panScrivi(foglio, dati);
    _panProgrammaChiusure(chiusure, righe);
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

  // --- la cartella ---------------------------------------------------------
  var dest = _panCartella(r.cartella, anno, davvero, righe);

  // --- il foglio -----------------------------------------------------------
  var idFoglio = null;
  if (memoria.fogli[chiave] && _panApribile(memoria.fogli[chiave]) && !_panNelCestino(memoria.fogli[chiave])) {
    idFoglio = memoria.fogli[chiave];
    righe.push('  foglio: c\'e\' gia\', e\' quello creato da qui.');
  }
  if (!idFoglio && dest.cartella) {
    idFoglio = _panFoglioPerNome(dest.cartella, nomeFoglio);
    if (idFoglio) {
      righe.push('  foglio: "' + nomeFoglio + '" esiste gia\'. Uso quello, senza doppioni.');
      // me lo segno: da adesso e' il foglio dell'anno anche per me, e "Controlla"
      // deve poterlo dire senza spacciarlo per il foglio di qualcun altro
      if (davvero) { memoria.fogli[chiave] = idFoglio; _panRicorda(memoria); }
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
  var collegatoA = _panDestinazione(form);
  var quante = form.getResponses().length;
  if (idFoglio !== null && collegatoA === idFoglio) {
    righe.push('  collegamento: gia\' fatto, non lo tocco.');
  } else {
    if (quante > 0) _panRisposteVecchie(form, r, quante, collegatoA, idFoglio, memoria, davvero, righe);
    if (davvero) {
      _panRiprova(function () { form.setDestination(FormApp.DestinationType.SPREADSHEET, idFoglio); });
      righe.push('  collegamento: fatto.');
    } else {
      righe.push('  collegamento: da fare' + (collegatoA ? ' (adesso scrive in un altro foglio, che resta com\'e\')' : '') + '.');
    }
  }

  // --- riapertura -------------------------------------------------------------
  _panRiapri(form, davvero, righe);

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
    _panRicorda(memoria);
  }

  return {
    stato: davvero ? ('pronto per ' + anno) : 'da preparare',
    url: (davvero && idFoglio) ? SpreadsheetApp.openById(idFoglio).getUrl() : '',
    chiusura: chiusura
  };
}

function _panRisposteVecchie(form, r, quante, collegatoA, idFoglio, memoria, davvero, righe) {
  if (!r.svuota) {
    righe.push('  risposte gia\' nel modulo: ' + quante + '. Google le ricopia nel foglio nuovo.');
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

function _panRiapri(form, davvero, righe) {
  var aperto = true;
  try { aperto = form.isAcceptingResponses(); } catch (e) { aperto = true; }
  if (aperto) return;
  var pubblicato = true;
  try {
    if (typeof form.supportsAdvancedResponderPermissions === 'function' &&
        form.supportsAdvancedResponderPermissions()) pubblicato = form.isPublished();
  } catch (e2) { pubblicato = true; }
  if (!pubblicato) { righe.push('  il modulo non e\' pubblicato: non lo pubblico io.'); return; }
  if (!davvero) { righe.push('  il modulo e\' chiuso: verrebbe riaperto.'); return; }
  try { form.setAcceptingResponses(true); righe.push('  il modulo era chiuso: riaperto.'); }
  catch (e3) { righe.push('  non sono riuscito a riaprirlo (' + (e3.message || e3) + ').'); }
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

function _panMemoria() {
  var vuota = { fogli: {}, scadenze: {} };
  try {
    var testo = PropertiesService.getScriptProperties().getProperty(_PAN_CHIAVE);
    if (!testo) return vuota;
    var m = JSON.parse(testo);
    if (!m || typeof m !== "object" || !m.fogli || typeof m.fogli !== "object") return vuota;
    if (!m.scadenze || typeof m.scadenze !== "object") m.scadenze = {};
    return m;
  } catch (e) { return vuota; }
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
