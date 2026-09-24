/**
 * ============================================================================
 *  ORARI - l'orario di ogni docente nella tua casella, il tuo sul calendario
 * ============================================================================
 *
 *  Va incollato nello stesso progetto di "Organizzazione Gmail", insieme al
 *  file DatiOrari.gs generato dall'applicazione Campanella.
 *
 *  E' uno strumento personale: le email arrivano SOLO all'account in cui
 *  gira lo script (il tuo). Nessun messaggio parte verso altre persone, e in
 *  DatiOrari.gs non c'e' nessun indirizzo.
 *
 *  FUNZIONI, NELL'ORDINE
 *    ORARI_1_anteprima ......... dice cosa manderebbe, senza mandare niente
 *                                (e quante serie metterebbe sul calendario)
 *    ORARI_2_invia ............. manda a te una email per docente (a blocchi,
 *                                riprende da sola se finisce il tempo)
 *    ORARI_3_inviaOrariClassi .. manda a te anche gli orari delle classi
 *                                (anche questa riprende da sola)
 *    ORARI_4_calendario ........ mette il tuo orario (il nome scelto
 *                                nell'applicazione) su Google Calendar, nel
 *                                calendario indicato (lo crea se non c'e'),
 *                                senza lezioni nei giorni senza lezione;
 *                                riprende da sola se finisce il tempo o se
 *                                Google chiede di rallentare
 *    ORARI_5_cambioOrario ...... l'orario e' cambiato: dalla data scelta
 *                                nell'applicazione mette quello nuovo, e le
 *                                settimane prima restano (riprende da sola)
 *    ORARI_ANNULLA_calendario .. toglie dal calendario gli eventi messi qui,
 *                                nel periodo scritto in DatiOrari.gs, e
 *                                dimentica un lavoro a meta'
 *    ORARI_ANNULLA_invio ....... dimentica a che punto erano gli invii
 *
 *  PERMESSI
 *    Google calcola i permessi sull'intero progetto, guardando il codice di
 *    tutti i file. Con questo file nel progetto, alla prima esecuzione chiede
 *    quindi anche il permesso per il Calendario, anche se usi solo le email:
 *    e' normale. Le email partono con MailApp, l'etichetta la mette GmailApp
 *    e il tuo indirizzo lo dice Session. Il Calendario lo usano soltanto
 *    ORARI_4_calendario, ORARI_5_cambioOrario e ORARI_ANNULLA_calendario, che
 *    toccano solo il calendario che indichi (uno tuo, non uno a cui sei
 *    iscritto, con quel nome esatto) e, dentro, solo gli eventi creati qui:
 *    ORARI_4_calendario li crea, ORARI_5_cambioOrario accorcia o toglie solo
 *    quelli con il contrassegno, ORARI_ANNULLA_calendario toglie quelli con il
 *    contrassegno o con la descrizione che comincia con [Campanella] (se Google
 *    non ha salvato il contrassegno; ma anche una copia fatta a mano di una
 *    lezione ha quella descrizione).
 * ============================================================================
 */

var _ORARI_VERSIONE      = '1.5.0';
var _ORARI_MAX_SECONDI   = 260;
var _ORARI_CHIAVE        = 'CAMPANELLA_ORARI_PROGRESSO';
var _ORARI_CHIAVE_CLASSI = 'CAMPANELLA_ORARI_CLASSI_PROGRESSO';
var _ORARI_CHIAVE_CALENDARIO = 'CAMPANELLA_ORARI_CALENDARIO_PROGRESSO';  // il lavoro a meta' sul calendario
var _ORARI_TRIGGER       = 'ORARI_2_invia';
var _ORARI_TRIGGER_CLASSI = 'ORARI_3_inviaOrariClassi';
var _ORARI_TRIGGER_CALENDARIO = 'ORARI_4_calendario';  // le riprese del calendario: la funzione stessa
var _ORARI_TRIGGER_CAMBIO = 'ORARI_5_cambioOrario';
var _ORARI_PAUSA_MS      = 500;                // fra una modifica al calendario e l'altra
var _ORARI_MAX_RIFIUTI   = 10;                 // limiti di Google di fila prima di smettere di riprovare
var _ORARI_ETICHETTA     = 'Orari';            // sotto il prefisso delle etichette della Posta
var _ORARI_TAG           = 'campanella';       // contrassegno degli eventi creati qui
var _ORARI_TAG_VALORE    = 'orario';


// ===========================================================================
//  1 - ANTEPRIMA
// ===========================================================================
function ORARI_1_anteprima() {
  var d = _orariDati_();
  var righe = [];
  righe.push('ANTEPRIMA - non viene mandato niente.');
  righe.push('Orari.gs versione ' + _ORARI_VERSIONE);
  righe.push('');
  righe.push('Periodo: ' + (d.periodo || '(non indicato)'));
  righe.push('Docenti nel file: ' + d.docenti.length);
  righe.push('Giorni: ' + d.giorni.join(' ') + '   Ore al giorno: ' + d.ore);
  righe.push('Destinatario: ' + _mioIndirizzoOrari_() + ' (solo tu)');
  righe.push('Etichetta dei messaggi mandati: "' + _orariNomeEtichetta_() + '", se esiste');
  righe.push('');

  var elenco = _daMandare_(d);
  righe.push('Email da mandare: ' + elenco.length + ' (una per docente con almeno un\'ora)');
  righe.push('Ancora disponibili oggi: ' + MailApp.getRemainingDailyQuota());
  if (d.classi && d.classi.length) righe.push('Orari delle classi pronti: ' + d.classi.length);
  if (d.calendario && d.calendario.docente) {
    righe.push('Calendario: "' + d.calendario.nome + '" per ' + d.calendario.docente +
               ', dal ' + d.calendario.inizio + ' al ' + d.calendario.fine);
    righe = righe.concat(_orariAnteprimaCalendario_(d));
  }
  righe.push('');
  righe.push('Esempio del primo messaggio');
  righe.push('---------------------------');
  var primo = elenco[0];
  if (primo) {
    righe.push('A:       ' + primo.a);
    righe.push('Oggetto: ' + primo.oggetto);
    righe.push('');
    righe.push(_testoSemplice_(primo.griglia, d));
  } else {
    righe.push('(niente da mandare)');
  }

  var testo = righe.join('\n');
  Logger.log(testo);
  return testo;
}

/** Le righe dell'anteprima sul calendario: giorni senza lezione, serie, lezioni saltate, cambio d'orario. */
function _orariAnteprimaCalendario_(d) {
  var righe = [];
  try {
    var c = _orariCalendarioConfig_(d);
    var doc = _orariDocente_(d, c.docente);
    var periodo = _orariPeriodo_(c);
    var piano = _orariPiano_(d, doc, periodo, periodo.inizio);
    righe.push('Giorni senza lezione: ' + _orariSospensioniNelPeriodo_(periodo) + ' (giorni o periodi)');
    righe.push('Serie settimanali da creare con ORARI_4_calendario: ' + piano.serie.length +
               ' (' + piano.lezioni + ' lezioni)');
    righe.push('Lezioni saltate nei giorni senza lezione: ' + piano.saltate);
    if (c.validoDal) {
      var validoDal = _orariValidoDal_(c, periodo);
      if (validoDal < periodo.inizio) {
        // una data prima dell'inizio vale come l'inizio (vedi _orariCalendario_)
        var tutto = _orariPiano_(d, doc, periodo, periodo.inizio);
        righe.push('L\'orario e\' cambiato: il nuovo vale dal ' + c.validoDal + ', che viene prima dell\'inizio ' +
                   'del periodo (' + c.inizio + '). Il cambio si fa con ORARI_5_cambioOrario: ' + tutto.serie.length +
                   ' serie nuove da tutto il periodo, ' + tutto.saltate + ' lezioni saltate; le serie di prima ' +
                   'dell\'inizio non si toccano.');
      } else {
        var dopo = _orariPiano_(d, doc, periodo, validoDal);
        righe.push('L\'orario e\' cambiato: il nuovo vale dal ' + c.validoDal + '. Il cambio si fa con ' +
                   'ORARI_5_cambioOrario: ' + dopo.serie.length + ' serie nuove da quel giorno, ' +
                   dopo.saltate + ' lezioni saltate; le settimane prima restano come sono.');
      }
    }
  } catch (err) {
    righe.push('Calendario da sistemare: ' + err.message);
  }
  return righe;
}


// ===========================================================================
//  2 - INVIO (a te stesso)
//  Le email partono a blocchi: se finisce il tempo di un'esecuzione, lo
//  script si ricorda dove era arrivato e si riprogramma fra un minuto; se
//  finisce la quota giornaliera si ferma, e rieseguito il giorno dopo
//  riparte da li'. Lo stesso vale per gli orari delle classi (passo 3).
// ===========================================================================
function ORARI_2_invia(e) {
  return _orariConLock_('docenti', e);
}

function ORARI_ANNULLA_invio() {
  // lo stesso lock dell'invio: annullare a meta' di un'esecuzione non
  // servirebbe, perche' quella salverebbe di nuovo il punto a cui e' arrivata
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) {
    var occupato = 'Un\'altra esecuzione (un invio degli orari, il calendario o il riordino della posta) ' +
                   'e\' ancora in corso: riprova fra qualche minuto. Non ho dimenticato niente.';
    Logger.log(occupato);
    return occupato;
  }
  try {
    var prop = PropertiesService.getUserProperties();
    prop.deleteProperty(_ORARI_CHIAVE);
    prop.deleteProperty(_ORARI_CHIAVE_CLASSI);
    _togliTriggerOrari_(_ORARI_TRIGGER);
    _togliTriggerOrari_(_ORARI_TRIGGER_CLASSI);
  } finally {
    lock.releaseLock();
  }
  var testo = 'Dimenticato il punto in cui erano arrivati gli invii: il prossimo ORARI_2_invia ' +
              'ricomincia dal primo docente, e ORARI_3_inviaOrariClassi dalla prima classe.';
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  3 - ORARI DELLE CLASSI (sempre e solo a te)
// ===========================================================================
function ORARI_3_inviaOrariClassi(e) {
  return _orariConLock_('classi', e);
}

// --- pezzi dell'invio -------------------------------------------------------
/** Dove si ricorda il punto e quale funzione riprende, per docenti o classi. */
function _orariLavoro_(tipo) {
  return (tipo === 'classi')
    ? { chiave: _ORARI_CHIAVE_CLASSI, funzione: _ORARI_TRIGGER_CLASSI }
    : { chiave: _ORARI_CHIAVE, funzione: _ORARI_TRIGGER };
}

function _orariConLock_(tipo, e) {
  var lavoro = _orariLavoro_(tipo);
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) {
    // il lock e' lo stesso della Posta: se c'e' un invio a meta', non lo
    // lascio fermo, ma lo riprogrammo fra un minuto
    var aMeta = PropertiesService.getUserProperties().getProperty(lavoro.chiave);
    if (aMeta) _programmaRipresaOrari_(lavoro.funzione);
    var occupato = 'Un\'altra esecuzione (un invio degli orari, il calendario o il riordino della posta) e\' ' +
      'ancora in corso: ' +
      (aMeta ? 'riprovo da solo fra un minuto, da dove ero arrivato.' : 'aspetta che finisca e riprova.');
    Logger.log(occupato);
    return occupato;
  }
  try { return _orariInvia_(tipo, e); }
  finally { lock.releaseLock(); }
}

function _orariInvia_(tipo, e) {
  var lavoro = _orariLavoro_(tipo);
  var d = _orariDati_();
  var prop = PropertiesService.getUserProperties();
  var salvato = prop.getProperty(lavoro.chiave);

  // una ripresa programmata che non trova il punto salvato non ricomincia
  // da capo: l'invio e' gia' finito, oppure e' stato annullato
  if (e && e.triggerUid && !salvato) {
    _togliTriggerOrari_(lavoro.funzione);
    var niente = 'Niente da riprendere: l\'invio e\' gia\' finito, oppure e\' stato annullato.';
    Logger.log(niente);
    return niente;
  }

  var scadenza = Date.now() + _ORARI_MAX_SECONDI * 1000;
  var elenco = (tipo === 'classi') ? _classiDaMandare_(d) : _daMandare_(d);
  var stato = JSON.parse(salvato || '{"i":0,"mandati":0}');

  if (MailApp.getRemainingDailyQuota() <= 0) {
    var aspetta = 'Hai finito le email che Google ti lascia mandare oggi.\n' +
      'Riprova domani: il conto ricomincia. Fatti finora: ' + stato.mandati + '.';
    Logger.log(aspetta);
    return aspetta;
  }

  var interrotto = false;
  while (stato.i < elenco.length) {
    if (Date.now() > scadenza) { interrotto = true; break; }
    if (MailApp.getRemainingDailyQuota() <= 0) {
      prop.setProperty(lavoro.chiave, JSON.stringify(stato));
      var fermo = 'Quota giornaliera esaurita dopo ' + stato.mandati + ' messaggi.\n' +
        'Riesegui ' + lavoro.funzione + ' domani: riparte da dove si e\' fermato.';
      Logger.log(fermo);
      return fermo;
    }

    var m = elenco[stato.i];
    try {
      MailApp.sendEmail({
        to: m.a,
        subject: m.oggetto,
        body: _testoSemplice_(m.griglia, d),
        htmlBody: _html_(m.titolo, m.griglia, d),
        name: 'Orari'
      });
      stato.mandati++;
    } catch (err) {
      Logger.log('Non mandato "' + m.oggetto + '": ' + err.message);
    }
    stato.i++;
    if (stato.i % 10 === 0) prop.setProperty(lavoro.chiave, JSON.stringify(stato));
    Utilities.sleep(200);
  }

  if (interrotto) {
    prop.setProperty(lavoro.chiave, JSON.stringify(stato));
    _programmaRipresaOrari_(lavoro.funzione);
    var parziale = 'Tempo massimo raggiunto: mandati ' + stato.mandati + ' su ' +
      elenco.length + '. Riprende da solo fra un minuto.';
    Logger.log(parziale);
    return parziale;
  }

  prop.deleteProperty(lavoro.chiave);
  _togliTriggerOrari_(lavoro.funzione);

  var fine;
  if (tipo === 'classi') {
    _etichettaInviati_(d.oggettoClasse || 'Orario classe {classe}');
    fine = 'FATTO: mandati ' + stato.mandati + ' orari di classe su ' + elenco.length +
      ', tutti a ' + _mioIndirizzoOrari_() + '.';
  } else {
    _etichettaInviati_(d.oggettoDocente || 'Orario {docente}');
    fine = 'FATTO: mandati ' + stato.mandati + ' messaggi su ' + elenco.length + '.\n' +
      'Li trovi nella tua Posta in arrivo: cerca il cognome per ritrovare l\'orario di un collega.';
  }
  Logger.log(fine);
  return fine;
}


// ===========================================================================
//  4 - GOOGLE CALENDAR
//  Ogni blocco di ore consecutive della stessa classe diventa un evento
//  settimanale, dal primo giorno utile fino alla data di fine. Nei giorni
//  senza lezione (feste, vacanze, ponti: la parte "sospensioni" di
//  DatiOrari.gs) l'evento non c'e': il blocco diventa piu' serie, una per
//  ogni tratto di settimane senza interruzioni (il "piano"). Gli eventi
//  portano un contrassegno, cosi' ORARI_ANNULLA_calendario e
//  ORARI_5_cambioOrario toccano solo loro.
//
//  Con tante serie si rischia il tempo massimo di un'esecuzione, o il
//  limite di Google alle modifiche fatte in poco tempo: lo script si ricorda
//  a che punto e' (con un'impronta del piano, per non mescolare due orari) e
//  si riprogramma fra un minuto, come l'invio.
// ===========================================================================
function ORARI_4_calendario(e) {
  return _orariCalendarioConLock_(_ORARI_TRIGGER_CALENDARIO, e);
}

// ===========================================================================
//  5 - CAMBIO D'ORARIO
//  L'orario nuovo vale da calendario.validoDal: le serie gia' messe che
//  cominciano prima finiscono il giorno prima, quelle che cominciano da quel
//  giorno in poi si tolgono, e dal validoDal si mette l'orario nuovo. Le
//  settimane prima restano come sono. Rieseguito con la stessa data da' lo
//  stesso risultato. Una data prima dell'inizio del periodo vale come
//  l'inizio: l'anno prima, che puo' stare nello stesso calendario, non si
//  tocca. Solo le serie con il contrassegno: una con la sola descrizione di
//  Campanella (forse una copia fatta a mano) resta, e il messaggio la nomina.
// ===========================================================================
function ORARI_5_cambioOrario(e) {
  return _orariCalendarioConLock_(_ORARI_TRIGGER_CAMBIO, e);
}

function ORARI_ANNULLA_calendario() {
  // lo stesso lock dell'invio e del calendario: un lavoro in corso, finito il
  // tempo, rimetterebbe il suo punto e la sua ripresa subito dopo
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) {
    var occupato = 'Un\'altra esecuzione (il calendario, un invio degli orari o il riordino della posta) ' +
                   'e\' ancora in corso: riprova fra qualche minuto. Non ho tolto niente.';
    Logger.log(occupato);
    return occupato;
  }
  try { return _orariAnnullaCalendario_(); }
  finally { lock.releaseLock(); }
}

// --- pezzi del calendario ---------------------------------------------------
function _orariCalendarioConLock_(funzione, e) {
  // una ripresa toglie subito il proprio trigger: scattato, resta fra quelli
  // del progetto, e una ripresa finita con un errore che non e' un limite di
  // Google sembrerebbe ancora programmata (_orariRipresaProgrammata_). Se serve
  // un'altra ripresa, la rimette _programmaRipresaOrari_
  if (e && e.triggerUid) _togliTriggerOrari_(funzione);
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) {
    // il lock e' lo stesso dell'invio e della Posta: un lavoro a meta' non
    // lo lascio fermo, lo riprogrammo fra un minuto
    // (ma non un lavoro fermato con ANNULLA_automazione)
    var aMeta = _orariLavoroCalendario_();
    var riprendo = !!aMeta && !aMeta.fermato;
    if (riprendo) _programmaRipresaOrari_(aMeta.funzione);
    var occupato = 'Un\'altra esecuzione (il calendario, un invio degli orari o il riordino della posta) e\' ' +
      'ancora in corso: ' +
      (riprendo ? 'riprovo da solo fra un minuto, da dove ero arrivato.' : 'aspetta che finisca e riprova.');
    Logger.log(occupato);
    return occupato;
  }
  try { return _orariCalendario_(funzione, e); }
  finally { lock.releaseLock(); }
}

/** Il lavoro a meta' sul calendario (di ORARI_4 o di ORARI_5), se c'e' e si capisce. */
function _orariLavoroCalendario_() {
  var testo = PropertiesService.getUserProperties().getProperty(_ORARI_CHIAVE_CALENDARIO);
  if (!testo) return null;
  try {
    var s = JSON.parse(testo);
    if (s && (s.funzione === _ORARI_TRIGGER_CALENDARIO || s.funzione === _ORARI_TRIGGER_CAMBIO)) return s;
  } catch (err) { /* un punto illeggibile vale come nessun punto */ }
  return null;
}

function _orariCalendario_(funzione, e) {
  var prop = PropertiesService.getUserProperties();
  var salvato = _orariLavoroCalendario_();
  var cambio = (funzione === _ORARI_TRIGGER_CAMBIO);
  var ripresa = !!(e && e.triggerUid);

  // una ripresa programmata che non trova il suo lavoro non ricomincia da
  // capo: e' gia' finito, oppure e' stato annullato
  if (ripresa && (!salvato || salvato.funzione !== funzione)) {
    _togliTriggerOrari_(funzione);
    var niente = 'Niente da riprendere: il lavoro sul calendario e\' gia\' finito, oppure e\' stato annullato.';
    Logger.log(niente);
    return niente;
  }
  // ANNULLA_automazione ha fermato il lavoro: una ripresa gia' partita, che
  // aspettava il blocco mentre toglieva i trigger, non lo riprende. Rieseguita
  // a mano la funzione riparte da dove era arrivata
  if (ripresa && salvato.fermato) {
    _togliTriggerOrari_(funzione);
    var fermo = 'Il lavoro sul calendario e\' stato fermato con ANNULLA_automazione: non lo riprendo da solo. ' +
      'Per finirlo riesegui ' + funzione + ', che riparte da dove era arrivato; per togliere tutto quello che ' +
      'Campanella ha messo sul calendario c\'e\' ORARI_ANNULLA_calendario.';
    Logger.log(fermo);
    return fermo;
  }
  if (salvato && salvato.funzione !== funzione) {
    // riprende da solo se la sua ripresa c'e' ancora: ANNULLA_automazione
    // (che lo segna fermato), il limite della giornata o Google che rifiuta
    // ancora dopo tante riprese la tolgono, e una ripresa partita toglie la
    // sua appena comincia (finita con un altro errore, non ce n'e' un'altra):
    // allora va rieseguito a mano
    var daSolo = !salvato.fermato && _orariRipresaProgrammata_(salvato.funzione);
    var come = daSolo
      ? 'riprende da solo fra poco, oppure rieseguilo tu per finirlo'
      : 'non riprende da solo' + (salvato.fermato ? ' (e\' stato fermato con ANNULLA_automazione)' : '') +
        ': rieseguilo tu, riparte da dove era arrivato';
    throw new Error(salvato.funzione === _ORARI_TRIGGER_CAMBIO
      ? 'C\'e\' un cambio d\'orario a meta\' (ORARI_5_cambioOrario): ' + come + '. Per togliere tutto quello ' +
        'che Campanella ha messo sul calendario c\'e\' ORARI_ANNULLA_calendario.'
      : 'L\'orario messo da ORARI_4_calendario e\' ancora a meta\': ' + come + ', e poi esegui ' +
        'ORARI_5_cambioOrario. Per togliere tutto c\'e\' ORARI_ANNULLA_calendario.');
  }

  // prima di toccare il calendario: dati, date e piano, tutti controllati
  var d = _orariDati_();
  var c = _orariCalendarioConfig_(d);
  var doc = _orariDocente_(d, c.docente);
  var periodo = _orariPeriodo_(c);
  var dal = periodo.inizio;
  var validoDal = null;
  if (cambio) {
    validoDal = _orariValidoDal_(c, periodo);
    // una data prima dell'inizio vale come l'inizio: l'orario nuovo per tutto
    // il periodo, e niente prima (l'anno prima puo' stare nello stesso calendario)
    if (validoDal < periodo.inizio) validoDal = periodo.inizio;
    dal = validoDal;
  }
  var piano = _orariPiano_(d, doc, periodo, dal);
  var impronta = _orariImpronta_(c, doc, d, piano, cambio ? c.validoDal : '');

  if (salvato && salvato.impronta !== impronta) {
    _togliTriggerOrari_(funzione);
    if (cambio) {
      // il cambio si rifa' da capo con i dati di adesso: il taglio ritrova le serie gia' messe
      prop.deleteProperty(_ORARI_CHIAVE_CALENDARIO);
      throw new Error('DatiOrari.gs e\' cambiato a meta\' del lavoro: ORARI_5_cambioOrario aveva cominciato con ' +
        'un altro orario (o altre date) e non va avanti mescolandoli. Ho dimenticato il lavoro a meta\'; le serie ' +
        'gia\' messe restano.\nRiesegui ORARI_5_cambioOrario: rifa\' il cambio dal ' + c.validoDal + ' con i ' +
        'dati di adesso, e le settimane prima restano.');
    }
    // ORARI_4_calendario: il punto resta, cosi' con i dati di prima si finisce.
    // Con un orario nuovo e la data da cui vale, annullare e rimettere darebbe
    // l'orario nuovo anche alle settimane prima
    throw new Error('DatiOrari.gs e\' cambiato a meta\' del lavoro: ORARI_4_calendario aveva cominciato con un ' +
      'altro orario (o altre date) e non va avanti mescolandoli. Le serie gia\' messe restano, e mi ricordo a ' +
      'che punto ero.\n' + (c.validoDal
        ? 'Se l\'orario nuovo vale dal ' + c.validoDal + ': rimetti il DatiOrari.gs di prima (o rigeneralo ' +
          'dall\'applicazione con l\'orario di prima) e riesegui ORARI_4_calendario, che finisce da dove era ' +
          'arrivato; poi incolla quello nuovo ed esegui ORARI_5_cambioOrario, cosi\' le settimane prima del ' +
          c.validoDal + ' tengono l\'orario di prima.\nSolo se l\'orario nuovo vale per tutto il periodo: ' +
          'ORARI_ANNULLA_calendario, poi ORARI_4_calendario.'
        : 'Per finire con l\'orario di prima: rimetti il DatiOrari.gs di prima (o rigeneralo dall\'applicazione ' +
          'con l\'orario di prima) e riesegui ORARI_4_calendario, che riparte da dove era arrivato.\nPer mettere ' +
          'invece i dati di adesso su tutto il periodo: ORARI_ANNULLA_calendario, poi ORARI_4_calendario.'));
  }

  var cal = _orariTrovaCalendario_(c.nome);
  var stato = salvato;
  if (stato && !cal) {
    prop.deleteProperty(_ORARI_CHIAVE_CALENDARIO);
    _togliTriggerOrari_(funzione);
    throw new Error('Il calendario "' + c.nome + '" non c\'e\' piu\': ho dimenticato il lavoro a meta\'. ' +
                    'Riesegui ' + funzione + '.');
  }
  if (!stato) {
    var creato = false;
    if (cambio) {
      if (!cal) {
        throw new Error('Non c\'e\' nessun calendario chiamato "' + c.nome + '": ORARI_5_cambioOrario cambia ' +
          'l\'orario messo con ORARI_4_calendario. Se non l\'hai mai messo, esegui ORARI_4_calendario.');
      }
    } else if (!cal) {
      cal = CalendarApp.createCalendar(c.nome, {
        summary: 'Orario scolastico messo da Campanella. Gli eventi si tolgono con ORARI_ANNULLA_calendario.'
      });
      creato = true;
    } else {
      // rieseguire sopra un orario gia' messo raddoppierebbe ogni lezione
      var gia = _orariNostri_(cal, periodo.inizio, _orariFineGiornata_(periodo.fine)).length;
      if (gia) {
        throw new Error('Nel calendario "' + c.nome + '" ci sono gia\' ' + gia + ' serie di eventi ' +
          'messe da Campanella fra il ' + c.inizio + ' e il ' + c.fine + ': rimettendole, ogni ' +
          'lezione comparirebbe due volte.\n' +
          'Se l\'orario e\' cambiato, usa ORARI_5_cambioOrario con la data da cui vale il nuovo (le ' +
          'settimane prima restano), oppure esegui prima ORARI_ANNULLA_calendario (toglie tutto) e poi di ' +
          'nuovo ORARI_4_calendario.');
      }
    }
    if (!cambio && c.colore) {
      try { cal.setColor(CalendarApp.Color[c.colore] || c.colore); } catch (err) { /* colore non riconosciuto */ }
    }
    stato = { funzione: funzione, impronta: impronta, fase: cambio ? 'taglio' : 'crea', fatti: 0,
              accorciate: 0, tolte: 0, eventiTolti: 0, rifiuti: 0, creato: creato,
              irregolari: [], nIrregolari: 0, senzaContrassegno: [], nSenzaContrassegno: 0 };
    prop.setProperty(_ORARI_CHIAVE_CALENDARIO, JSON.stringify(stato));
  }
  // rieseguita a mano dopo ANNULLA_automazione: si riparte, e le riprese tornano a valere
  if (stato.fermato) stato.fermato = false;

  var scadenza = Date.now() + _ORARI_MAX_SECONDI * 1000;
  var salva = function () { prop.setProperty(_ORARI_CHIAVE_CALENDARIO, JSON.stringify(stato)); };
  try {
    if (stato.fase === 'taglio') {
      if (!_orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva)) {
        return _orariCalendarioInterrotto_(funzione, stato, piano, 'tempo', salva);
      }
      stato.fase = 'crea';
      salva();
    }
    while (stato.fatti < piano.serie.length) {
      if (Date.now() > scadenza) return _orariCalendarioInterrotto_(funzione, stato, piano, 'tempo', salva);
      var serie = _orariCreaSerie_(cal, piano.serie[stato.fatti], c, d, doc);
      // contata subito: se poi il contrassegno non riesce, la serie c'e' gia'
      // (e la descrizione la riconosce): alla ripresa non si rifa'
      stato.fatti++;
      stato.rifiuti = 0;
      salva();
      serie.setTag(_ORARI_TAG, _ORARI_TAG_VALORE);
      Utilities.sleep(_ORARI_PAUSA_MS);
    }
  } catch (err) {
    salva();
    var limite = _orariLimiteGoogle_(err);
    if (!limite) throw err;          // un altro errore: il punto resta, e si vede
    return _orariCalendarioInterrotto_(funzione, stato, piano, limite, salva);
  }

  prop.deleteProperty(_ORARI_CHIAVE_CALENDARIO);
  _togliTriggerOrari_(funzione);
  var testo = cambio ? _orariFineCambio_(c, doc, piano, stato, validoDal)
                     : _orariFineCalendario_(c, doc, periodo, piano, stato);
  Logger.log(testo);
  return testo;
}

/**
 * Il taglio del cambio d'orario. Le serie con il contrassegno che hanno
 * lezioni dal validoDal in poi: se cominciano prima, finiscono il giorno
 * prima del validoDal (setRecurrence, con la loro prima lezione); se
 * cominciano dal validoDal in poi, si tolgono. Gli eventi singoli con il
 * contrassegno dal validoDal in poi si tolgono. Le serie le trova solo
 * _orariNostri_; quelle che riconosce solo dalla descrizione (forse una copia
 * fatta a mano) restano, e il messaggio finale le nomina, come le serie
 * accorciate con lezioni spostate o cancellate a mano. Il validoDal non viene
 * mai prima dell'inizio del periodo. Torna false se finisce il tempo: alla
 * ripresa si riparte da qui, e quello che e' gia' sistemato non ha piu'
 * lezioni dal validoDal in poi, quindi non si ritrova.
 */
function _orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva) {
  // da un anno prima dell'inizio: per sapere la prima lezione di ogni serie,
  // anche di una cominciata prima dell'inizio (un "Dal" spostato in avanti).
  // Le serie dell'anno prima, se stanno nello stesso calendario, finiscono
  // prima dell'inizio, quindi prima del validoDal: restano come sono
  var da = new Date(periodo.inizio.getFullYear() - 1, periodo.inizio.getMonth(), periodo.inizio.getDate());
  var nostri = _orariNostri_(cal, da, _orariFineGiornata_(periodo.fine));
  var fino = new Date(validoDal.getFullYear(), validoDal.getMonth(), validoDal.getDate() - 1, 23, 59, 59);
  if (!stato.irregolari) { stato.irregolari = []; stato.nIrregolari = 0; }
  stato.senzaContrassegno = [];
  stato.nSenzaContrassegno = 0;
  for (var i = 0; i < nostri.length; i++) {
    var voce = nostri[i];
    if (voce.ultimo < validoDal) continue;          // finisce prima del cambio: resta com'e'
    if (!voce.contrassegno) {
      // la sola descrizione non basta per cambiarla: la nomino e basta
      stato.nSenzaContrassegno++;
      if (stato.senzaContrassegno.length < 10) stato.senzaContrassegno.push(_orariEtichetta_(voce));
      continue;
    }
    if (Date.now() > scadenza) return false;
    if (voce.evento) {
      voce.evento.deleteEvent();
      stato.eventiTolti++;
    } else if (voce.inizio >= validoDal) {
      voce.serie.deleteEventSeries();
      stato.tolte++;
    } else {
      voce.serie.setRecurrence(CalendarApp.newRecurrence().addWeeklyRule().until(fino), voce.inizio, voce.fine);
      stato.accorciate++;
      if (voce.irregolare) {
        stato.nIrregolari++;
        if (stato.irregolari.length < 10) stato.irregolari.push(_orariEtichetta_(voce));
      }
    }
    stato.rifiuti = 0;
    salva();
    Utilities.sleep(_ORARI_PAUSA_MS);
  }
  return true;
}

/** Una serie del piano: dalla prima lezione del tratto, ogni settimana fino all'ultima compresa. */
function _orariCreaSerie_(cal, voce, c, d, doc) {
  var primo = _orariData_(voce.dal);
  var ultimo = _orariFineGiornata_(_orariData_(voce.al));
  var da = _orariOraDel_(primo, c.inizioOre, voce.blocco.oraDa, c.minutiOra, false);
  var a  = _orariOraDel_(primo, c.inizioOre, voce.blocco.oraA,  c.minutiOra, true);
  var ricorrenza = CalendarApp.newRecurrence().addWeeklyRule().until(ultimo);
  return cal.createEventSeries(voce.blocco.testo, da, a, ricorrenza,
                               { description: _orariDescrizione_(doc.nome, voce.blocco, d) });
}

/**
 * Un lavoro sul calendario si ferma prima della fine: per il tempo massimo
 * o per un limite di Google riprende da solo fra un minuto; per il limite
 * della giornata, o se Google rifiuta ancora dopo tante riprese, aspetta che
 * lo riesegua il docente. Il punto resta salvato in ogni caso.
 */
function _orariCalendarioInterrotto_(funzione, stato, piano, motivo, salva) {
  var dove = (stato.fase === 'taglio')
    ? 'mentre accorciavo l\'orario di prima: ' + stato.accorciate + ' serie accorciate e ' + stato.tolte + ' tolte'
    : stato.fatti + ' serie messe su ' + piano.serie.length;
  var testo;
  if (motivo === 'giorno') {
    salva();
    _togliTriggerOrari_(funzione);
    testo = 'Google ha finito le modifiche al calendario che ti lascia fare oggi (' + dove + ').\n' +
            'Riesegui ' + funzione + ' domani: riparte da dove era arrivato.';
  } else if (motivo === 'limite' && ++stato.rifiuti > _ORARI_MAX_RIFIUTI) {
    salva();
    _togliTriggerOrari_(funzione);
    testo = 'Google continua a rifiutare le modifiche al calendario (' + dove + '): smetto di riprovare ogni ' +
            'minuto.\nRiesegui ' + funzione + ' piu\' tardi (fra un\'ora, o domani): riparte da dove era arrivato.';
  } else {
    salva();
    _programmaRipresaOrari_(funzione);
    testo = (motivo === 'tempo')
      ? 'Tempo massimo raggiunto (' + dove + '). Riprende da solo fra un minuto.'
      : 'Google dice che ho fatto troppe modifiche al calendario in poco tempo (' + dove + ').\n' +
        'Riprendo da solo fra un minuto, da dove ero arrivato.';
  }
  Logger.log(testo);
  return testo;
}

/**
 * I limiti di Google, dal testo dell'errore (in inglese o in italiano):
 * 'giorno' per le operazioni della giornata finite, 'limite' per troppe
 * modifiche in poco tempo, '' per tutto il resto.
 */
function _orariLimiteGoogle_(err) {
  var m = String((err && err.message) || err || '');
  if (/for one day|per un giorno/i.test(m)) return 'giorno';
  if (/too many|rate ?limit|troppe volte|troppi (calendari|eventi)|in poco tempo|breve periodo|try again later/i.test(m)) {
    return 'limite';
  }
  return '';
}

function _orariFineCalendario_(c, doc, periodo, piano, stato) {
  return (stato.creato ? 'Creato il calendario "' + c.nome + '".\n' : 'Uso il calendario "' + c.nome + '".\n') +
    'Orario di ' + doc.nome + ': ' + piano.serie.length + ' serie settimanali dal ' + c.inizio + ' al ' + c.fine +
    ' (' + piano.lezioni + ' lezioni).\n' +
    'Giorni senza lezione: ' + _orariSospensioniNelPeriodo_(periodo) + ' (giorni o periodi).\n' +
    'Lezioni saltate nei giorni senza lezione: ' + piano.saltate + '.' +
    (piano.blocchiFuori ? '\nSaltati ' + piano.blocchiFuori + ' blocchi (giorno non riconosciuto o fuori dal periodo).' : '') +
    '\n\nSe l\'orario cambia a meta\' anno, ORARI_5_cambioOrario lo cambia dalla data che scegli e lascia ' +
    'le settimane prima. Se qualcosa non va, ORARI_ANNULLA_calendario toglie solo questi eventi e lascia ' +
    'il resto del calendario com\'e\'.';
}

/** Il messaggio finale del cambio d'orario. validoDal e' la data vera del cambio, mai prima dell'inizio. */
function _orariFineCambio_(c, doc, piano, stato, validoDal) {
  var dal = _orariChiaveData_(validoDal);
  var giornoPrima = _orariChiaveData_(new Date(validoDal.getFullYear(), validoDal.getMonth(), validoDal.getDate() - 1));
  var primaDellInizio = (_orariData_(c.validoDal) < validoDal);
  var niente = (stato.accorciate + stato.tolte + stato.eventiTolti === 0);
  var irregolari = stato.nIrregolari || 0, senzaContrassegno = stato.nSenzaContrassegno || 0;
  return 'Cambio d\'orario dal ' + dal + ' nel calendario "' + c.nome + '", per ' + doc.nome + '.\n' +
    (primaDellInizio ? 'La data scritta in DatiOrari.gs, ' + c.validoDal + ', viene prima dell\'inizio del periodo: ' +
                       'l\'orario nuovo vale da tutto il periodo, dal ' + c.inizio + '. Quello che c\'e\' prima ' +
                       'dell\'inizio (per esempio l\'anno scorso, nello stesso calendario) non l\'ho toccato.\n' : '') +
    'Serie dell\'orario di prima accorciate (finiscono il ' + giornoPrima + '): ' + stato.accorciate + '\n' +
    'Serie dell\'orario di prima tolte (cominciavano dal ' + dal + ' in poi): ' + stato.tolte + '\n' +
    (stato.eventiTolti ? 'Eventi singoli tolti (dal ' + dal + ' in poi): ' + stato.eventiTolti + '\n' : '') +
    'Serie dell\'orario nuovo create: ' + piano.serie.length + ' (' + piano.lezioni + ' lezioni, fino al ' +
    c.fine + ')\n' +
    'Lezioni saltate nei giorni senza lezione: ' + piano.saltate + '\n' +
    (irregolari ? '\nSerie accorciate con lezioni spostate o cancellate a mano (controlla che siano rimaste come ' +
                  'le volevi): ' + irregolari + ' - ' + stato.irregolari.join('; ') +
                  (irregolari > stato.irregolari.length ? '; ...' : '') + '\n' : '') +
    (senzaContrassegno ? '\nSerie o lezioni singole con la descrizione di Campanella ma senza contrassegno, forse ' +
                         'copiate a mano: ' +
                         'non le ho toccate, controllale tu (' + senzaContrassegno + '): ' +
                         stato.senzaContrassegno.join('; ') +
                         (senzaContrassegno > stato.senzaContrassegno.length ? '; ...' : '') + '\n' : '') +
    (niente ? '\nNon ho trovato niente da accorciare o togliere: forse ORARI_4_calendario non era mai stato ' +
              'eseguito su questo calendario. L\'orario nuovo c\'e\' lo stesso, dal ' + dal + '.\n' : '') +
    '\nLe settimane prima del ' + dal + ' restano come erano. Attenzione: le modifiche fatte a mano ' +
    'su singole lezioni delle serie accorciate (una lezione spostata o cancellata) potrebbero non restare: ' +
    'dai un\'occhiata.\nSe l\'orario cambia di nuovo, rigenera DatiOrari.gs con la nuova data e riesegui ' +
    'ORARI_5_cambioOrario.';
}

/**
 * Toglie gli eventi messi da Campanella nel periodo di DatiOrari.gs. Con
 * tante serie puo' finire il tempo, o Google puo' chiedere di rallentare: si
 * ferma, dice quanti ne ha tolti e di rieseguirlo (rieseguito, ritrova solo
 * quelli che restano). Non si riprogramma da solo: e' il docente che toglie.
 */
function _orariAnnullaCalendario_() {
  // prima il lavoro a meta' e le sue riprese: cosi' nessuna ripresa rimette
  // quello che tolgo, anche se qui sotto qualcosa va storto
  var prop = PropertiesService.getUserProperties();
  var aMeta = !!prop.getProperty(_ORARI_CHIAVE_CALENDARIO);
  prop.deleteProperty(_ORARI_CHIAVE_CALENDARIO);
  _togliTriggerOrari_(_ORARI_TRIGGER_CALENDARIO);
  _togliTriggerOrari_(_ORARI_TRIGGER_CAMBIO);
  var nota = aMeta ? '\nDimenticato anche il lavoro a meta\' sul calendario, e tolte le sue riprese.' : '';

  var d = _orariDati_();
  var c = _orariCalendarioConfig_(d);
  var cal = _orariTrovaCalendario_(c.nome);
  if (!cal) {
    var niente = 'Non c\'e\' nessun calendario chiamato "' + c.nome + '": niente da togliere.' + nota;
    Logger.log(niente);
    return niente;
  }
  var inizio = _orariData_(c.inizio) || new Date(2000, 0, 1);
  var fine = _orariFineGiornata_(_orariData_(c.fine) || new Date(2100, 0, 1));

  var nostri = _orariNostri_(cal, inizio, fine);
  var scadenza = Date.now() + _ORARI_MAX_SECONDI * 1000;
  var tolti = 0, motivo = '';
  try {
    for (var i = 0; i < nostri.length; i++) {
      if (Date.now() > scadenza) { motivo = 'tempo'; break; }
      var voce = nostri[i];
      if (voce.serie) voce.serie.deleteEventSeries();
      else voce.evento.deleteEvent();
      tolti++;
      Utilities.sleep(_ORARI_PAUSA_MS);
    }
  } catch (err) {
    motivo = _orariLimiteGoogle_(err);
    if (!motivo) throw err;          // un altro errore si vede cosi' com'e'
  }
  var periodo = (c.inizio && c.fine) ? ' fra il ' + c.inizio + ' e il ' + c.fine : '';
  var testo;
  if (motivo) {
    testo = (motivo === 'tempo' ? 'Tempo massimo raggiunto'
             : motivo === 'giorno' ? 'Google ha finito le modifiche al calendario che ti lascia fare oggi'
             : 'Google dice che ho fatto troppe modifiche al calendario in poco tempo') +
            ': tolti ' + tolti + ' eventi su ' + nostri.length + ' messi da Campanella nel calendario "' + c.nome +
            '"' + periodo + '.\nRiesegui ORARI_ANNULLA_calendario ' +
            (motivo === 'giorno' ? 'domani' : motivo === 'limite' ? 'fra qualche minuto' : 'adesso') +
            ': toglie quelli che restano.' + nota;
  } else {
    testo = 'Tolti ' + tolti + ' eventi messi da Campanella dal calendario "' + c.nome + '"' + periodo +
            '. Il calendario e gli altri eventi restano.' + nota;
  }
  Logger.log(testo);
  return testo;
}

/**
 * Gli eventi messi da Campanella fra le due date: una voce per ogni serie,
 * con la sua prima lezione (inizio e fine, vedi _orariPrimaLezione_) e
 * l'inizio dell'ultima, o per l'evento singolo. Messi da Campanella vuol dire
 * con il contrassegno (contrassegno: true), oppure con la descrizione che
 * comincia con [Campanella]: se Google non ha salvato il contrassegno, ma
 * anche in una copia fatta a mano di una lezione.
 */
function _orariNostri_(cal, inizio, fine) {
  var eventi = cal.getEvents(inizio, fine);
  var perSerie = {};
  var fuori = [];
  for (var i = 0; i < eventi.length; i++) {
    var ev = eventi[i];
    var contrassegno = false;
    try { contrassegno = (ev.getTag(_ORARI_TAG) === _ORARI_TAG_VALORE); } catch (e) { }
    var nostro = contrassegno;
    if (!nostro) {
      try { nostro = String(ev.getDescription() || '').indexOf('[Campanella]') === 0; } catch (e2) { }
    }
    if (!nostro) continue;

    var lezione = { inizio: ev.getStartTime(), fine: ev.getEndTime() };
    // getEventSeries non e' mai null, nemmeno per un evento singolo (e' la
    // sua "serie"): quello che li distingue e' isRecurringEvent
    var ricorrente = false;
    try { ricorrente = ev.isRecurringEvent(); } catch (e3) { ricorrente = false; }
    if (!ricorrente) {
      fuori.push({ evento: ev, contrassegno: contrassegno, titolo: ev.getTitle(),
                   inizio: lezione.inizio, fine: lezione.fine, ultimo: lezione.inizio });
      continue;
    }
    var serie = ev.getEventSeries();
    var id = serie.getId();
    var voce = perSerie[id];
    if (!voce) {
      var descrizione = '';
      try { descrizione = String(serie.getDescription() || ''); } catch (e4) { }
      voce = perSerie[id] = { serie: serie, contrassegno: false, titolo: ev.getTitle(), descrizione: descrizione,
                              lezioni: [] };
      fuori.push(voce);
    }
    if (contrassegno) voce.contrassegno = true;
    voce.lezioni.push(lezione);
  }
  for (var k = 0; k < fuori.length; k++) if (fuori[k].serie) _orariPrimaLezione_(fuori[k]);
  return fuori;
}

/**
 * La prima lezione di una serie, per setRecurrence, che vuole l'inizio del
 * primo evento. getEvents da' le lezioni spostate a mano all'ora nuova: la
 * prima trovata non basta (una prima lezione spostata sposterebbe tutta la
 * serie). Giorno, ora e durata della serie sono quelli piu' frequenti; la
 * prima lezione e' la prima con quelli, o qualche settimana prima se ci sono
 * lezioni spostate che vengono da prima (vedi sotto). Poi voce.ultimo,
 * l'inizio dell'ultima lezione, e voce.irregolare: ci sono lezioni spostate,
 * o settimane che mancano (cancellate a mano).
 */
function _orariPrimaLezione_(voce) {
  var settimana = 7 * 24 * 3600 * 1000;
  var lezioni = voce.lezioni.sort(function (x, y) { return x.inizio - y.inizio; });
  var conta = {};
  for (var i = 0; i < lezioni.length; i++) {
    var f = _orariForma_(lezioni[i]);
    conta[f] = (conta[f] || 0) + 1;
  }
  // la forma della serie: la piu' frequente. A parita' (succede solo con
  // pochissime lezioni) quella del giorno scritto nella descrizione, il giorno
  // in cui Campanella ha messo la serie; se non basta, quella della lezione
  // piu' presto: con due lezioni e' quella che resta dopo il cambio, e cosi'
  // si vede dov'era
  var scritto = _orariGiornoDellaDescrizione_(voce.descrizione);
  var forma = '', quante = 0, delGiorno = false;
  for (var j = 0; j < lezioni.length; j++) {
    var g = _orariForma_(lezioni[j]);
    var giusto = (lezioni[j].inizio.getDay() === scritto);
    if (conta[g] > quante || (conta[g] === quante && giusto && !delGiorno)) {
      quante = conta[g]; forma = g; delGiorno = giusto;
    }
  }
  var prima = null, ultimaRegolare = null;
  for (var k = 0; k < lezioni.length; k++) {
    if (_orariForma_(lezioni[k]) !== forma) continue;
    if (!prima) prima = lezioni[k];
    ultimaRegolare = lezioni[k];
  }
  // quante settimane prima della prima lezione regolare comincia la serie.
  // Ogni lezione spostata viene da una settimana senza la sua lezione: quelle
  // che stanno prima della prima regolare dalle settimane prima, una per
  // settimana (contate, non misurate: spostata di quattro giorni o anticipata
  // alla settimana prima e' sempre una settimana); quelle fra la prima e
  // l'ultima regolare dalle settimane vuote in mezzo, e se sono di piu' anche
  // loro da prima (una lezione rimandata oltre quella della settimana dopo)
  var primaDellaPrima = 0, inMezzo = 0;
  for (var m = 0; m < lezioni.length; m++) {
    if (_orariForma_(lezioni[m]) === forma) continue;
    if (lezioni[m].inizio < prima.inizio) primaDellaPrima++;
    else if (lezioni[m].inizio < ultimaRegolare.inizio) inMezzo++;
  }
  // (mai meno di zero: una lezione spostata proprio all'ora di un'altra conta due volte)
  var vuoteInMezzo = Math.max(0, Math.round((ultimaRegolare.inizio - prima.inizio) / settimana) + 1 - quante);
  var indietro = primaDellaPrima + Math.max(0, inMezzo - vuoteInMezzo);
  var p = prima.inizio;
  voce.inizio = new Date(p.getFullYear(), p.getMonth(), p.getDate() - 7 * indietro,
                         p.getHours(), p.getMinutes(), p.getSeconds());
  voce.fine = new Date(voce.inizio.getTime() + (prima.fine - prima.inizio));
  voce.ultimo = lezioni[lezioni.length - 1].inizio;
  var attese = Math.round((ultimaRegolare.inizio - voce.inizio) / settimana) + 1;
  voce.irregolare = (quante < lezioni.length) || (lezioni.length < attese);
}

/**
 * Il giorno della settimana (0 = domenica) scritto da _orariDescrizione_,
 * subito prima delle ore: "[Campanella] Orario di ROSSI, Lunedi', 1a ora".
 * -1 se la descrizione non e' questa (cambiata a mano, o di un'altra
 * versione). Una virgola nel nome del docente non confonde: il giorno e'
 * il pezzo seguito dalle ore.
 */
function _orariGiornoDellaDescrizione_(descrizione) {
  var m = String(descrizione || '').match(/^\[Campanella\][^\n]*?,\s*([^,\n]+?)\s*,\s*(?:dalla\s+)?\d+a\s/);
  return m ? _orariGiornoSettimana_(m[1]) : -1;
}

/** Giorno della settimana, ora e durata di una lezione: in una serie sono uguali, se nessuno le ha cambiate. */
function _orariForma_(lezione) {
  return lezione.inizio.getDay() + ' ' + lezione.inizio.getHours() + ':' + lezione.inizio.getMinutes() + ' ' +
         (lezione.fine - lezione.inizio);
}

/** "1A, lunedi' 09:00, dal 2026-09-14": una serie (o un evento) nei messaggi. */
function _orariEtichetta_(voce) {
  var g = voce.inizio;
  var nomi = ['domenica', 'lunedi\'', 'martedi\'', 'mercoledi\'', 'giovedi\'', 'venerdi\'', 'sabato'];
  var hh = g.getHours(), mm = g.getMinutes();
  return String(voce.titolo || '') + ', ' + nomi[g.getDay()] + ' ' + (hh < 10 ? '0' : '') + hh + ':' +
         (mm < 10 ? '0' : '') + mm + ', dal ' + _orariChiaveData_(g);
}

function _orariCalendarioConfig_(d) {
  var c = d.calendario;
  if (!c || !c.docente) {
    throw new Error('In DatiOrari.gs non c\'e\' la parte "calendario".\n' +
      'Nell\'applicazione, pagina Orari, passo 4: scegli il tuo nome, il nome del ' +
      'calendario e il periodo, poi rigenera e incolla DatiOrari.gs.');
  }
  return {
    docente: String(c.docente),
    nome: String(c.nome || ('Orario ' + c.docente)).trim() || ('Orario ' + c.docente),
    inizio: String(c.inizio || ''),
    fine: String(c.fine || ''),
    minutiOra: Math.max(5, Number(c.minutiOra) || 60),
    inizioOre: (c.inizioOre && c.inizioOre.length) ? c.inizioOre : ['08:00'],
    colore: String(c.colore || '').trim().toUpperCase(),
    sospensioni: (c.sospensioni && c.sospensioni.length) ? c.sospensioni : [],
    validoDal: String(c.validoDal || '').trim()
  };
}

/** Le date del periodo e i giorni senza lezione, controllati: prima di toccare il calendario. */
function _orariPeriodo_(c) {
  var inizio = _orariData_(c.inizio);
  var fine = _orariData_(c.fine);
  if (!inizio || !fine) throw new Error('Le date di inizio e fine vanno scritte come aaaa-mm-gg.');
  if (fine < inizio) throw new Error('La data di fine viene prima di quella di inizio.');
  var sospensioni = [];
  for (var i = 0; i < c.sospensioni.length; i++) {
    var s = c.sospensioni[i] || {};
    var dal = _orariData_(s.dal);
    var al = _orariData_(s.al || s.dal);
    if (!dal || !al || al < dal) {
      throw new Error('In DatiOrari.gs il giorno senza lezione numero ' + (i + 1) + ' non si capisce ' +
        '(dal "' + s.dal + '" al "' + s.al + '"): rigenera il file dall\'applicazione.');
    }
    sospensioni.push({ dal: _orariChiaveData_(dal), al: _orariChiaveData_(al), nome: String(s.nome || '') });
  }
  return { inizio: inizio, fine: fine, sospensioni: sospensioni };
}

/** La data da cui vale l'orario nuovo: obbligatoria per il cambio, e non dopo la fine del periodo. */
function _orariValidoDal_(c, periodo) {
  if (!c.validoDal) {
    throw new Error('In DatiOrari.gs manca la data da cui vale l\'orario nuovo (validoDal).\n' +
      'Nell\'applicazione, pagina Orari, passo 4: spunta "L\'orario e\' cambiato: il nuovo vale dal", ' +
      'scegli la data, poi rigenera e incolla DatiOrari.gs.');
  }
  var dal = _orariData_(c.validoDal);
  if (!dal) {
    throw new Error('In DatiOrari.gs la data del cambio d\'orario (validoDal: "' + c.validoDal + '") non e\' ' +
      'una data aaaa-mm-gg: rigenera il file dall\'applicazione.');
  }
  if (dal > periodo.fine) {
    throw new Error('La data del cambio d\'orario (' + c.validoDal + ') viene dopo la fine del periodo (' +
      c.fine + '): non c\'e\' niente da cambiare.');
  }
  return dal;
}

/**
 * Il piano: per ogni blocco le date settimanali da "dal" alla fine del
 * periodo, tolte quelle senza lezione, raggruppate in tratti di settimane
 * consecutive. Ogni tratto e' una serie. Lo stesso calcolo lo fa
 * Campanella (Calendario.Piano), per l'anteprima della pagina.
 */
function _orariPiano_(d, doc, periodo, dal) {
  var blocchi = _orariBlocchi_(doc.celle, d);
  var piano = { serie: [], lezioni: 0, saltate: 0, blocchiFuori: 0 };
  for (var b = 0; b < blocchi.length; b++) {
    var blocco = blocchi[b];
    var giornoSettimana = _orariGiornoSettimana_(d.giorni[blocco.giorno]);
    if (giornoSettimana < 0) { piano.blocchiFuori++; continue; }
    var primo = _orariPrimoGiorno_(dal, giornoSettimana);
    if (primo > periodo.fine) { piano.blocchiFuori++; continue; }   // il periodo non contiene quel giorno

    var aperta = null;
    for (var k = 0; ; k++) {
      var giorno = new Date(primo.getFullYear(), primo.getMonth(), primo.getDate() + 7 * k);
      if (giorno > periodo.fine) break;
      var chiave = _orariChiaveData_(giorno);
      if (_orariSospeso_(chiave, periodo.sospensioni)) { piano.saltate++; aperta = null; continue; }
      if (!aperta) {
        aperta = { blocco: blocco, dal: chiave, al: chiave, lezioni: 0 };
        piano.serie.push(aperta);
      }
      aperta.al = chiave;
      aperta.lezioni++;
      piano.lezioni++;
    }
  }
  return piano;
}

/** Quanti giorni o periodi senza lezione toccano il periodo: quelli fuori (un anno sbagliato) non contano. */
function _orariSospensioniNelPeriodo_(periodo) {
  var da = _orariChiaveData_(periodo.inizio), a = _orariChiaveData_(periodo.fine), n = 0;
  for (var i = 0; i < periodo.sospensioni.length; i++)
    if (periodo.sospensioni[i].al >= da && periodo.sospensioni[i].dal <= a) n++;
  return n;
}

function _orariSospeso_(chiave, sospensioni) {
  for (var i = 0; i < sospensioni.length; i++)
    if (sospensioni[i].dal <= chiave && chiave <= sospensioni[i].al) return true;
  return false;
}

/**
 * L'impronta del piano: cambia se cambia qualunque cosa che finisce sul
 * calendario (calendario, classi, giorni, ore, date, descrizioni). Una
 * ripresa con un'impronta diversa si ferma invece di mescolare due orari.
 */
function _orariImpronta_(c, doc, d, piano, validoDal) {
  var parti = [c.nome, doc.nome, c.inizioOre.join(','), c.minutiOra, validoDal];
  for (var i = 0; i < piano.serie.length; i++) {
    var s = piano.serie[i];
    parti.push([s.blocco.testo, s.dal, s.al, s.blocco.oraDa, s.blocco.oraA,
                _orariDescrizione_(doc.nome, s.blocco, d)].join('|'));
  }
  var testo = parti.join('\n');
  var h = 0x811c9dc5;                                  // FNV-1a a 32 bit
  for (var k = 0; k < testo.length; k++) {
    h ^= testo.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8) + '-' + piano.serie.length;
}

function _orariDocente_(d, nome) {
  var chiave = _orariChiave_(nome);
  for (var i = 0; i < d.docenti.length; i++)
    if (_orariChiave_(d.docenti[i].nome) === chiave) return d.docenti[i];
  for (var k = 0; k < d.docenti.length; k++)
    if (_orariChiave_(d.docenti[k].nome).indexOf(chiave) === 0) return d.docenti[k];
  throw new Error('Nel tabellone non trovo il nome "' + nome + '".');
}

function _orariChiave_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Il calendario con quel nome: solo fra i tuoi (non quelli di altri a cui sei
 * iscritto) e con il nome scritto proprio cosi' (Google non bada alle
 * maiuscole). Se ce ne sono due, non ne sceglie uno a caso.
 */
function _orariTrovaCalendario_(nome) {
  var trovati = CalendarApp.getOwnedCalendarsByName(nome) || [];
  var esatti = [];
  for (var i = 0; i < trovati.length; i++) if (trovati[i].getName() === nome) esatti.push(trovati[i]);
  if (esatti.length > 1) {
    throw new Error('Ci sono ' + esatti.length + ' calendari tuoi chiamati "' + nome + '": non so quale usare, ' +
      'e non ho toccato niente. Rinominane uno in Google Calendar, oppure scegli un altro nome ' +
      'nell\'applicazione (Orari, passo 4) e rigenera DatiOrari.gs.');
  }
  return esatti.length ? esatti[0] : null;
}

/** "2026-09-14" -> Date a mezzanotte, nel fuso dello script. null se non e' una data. */
function _orariData_(s) {
  var m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  var giorno = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  // 2026-02-31 non e' il 3 marzo: una data che non esiste non e' una data
  if (isNaN(giorno.getTime()) || giorno.getMonth() !== Number(m[2]) - 1) return null;
  return giorno;
}

/** Date -> "2026-09-14", nel fuso dello script. */
function _orariChiaveData_(g) {
  var m = g.getMonth() + 1, gg = g.getDate();
  return g.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (gg < 10 ? '0' : '') + gg;
}

/** Lo stesso giorno alle 23:59:59: l'ultimo istante compreso. */
function _orariFineGiornata_(g) {
  var t = new Date(g.getTime());
  t.setHours(23, 59, 59, 0);
  return t;
}

/** Nome del giorno come sta in DatiOrari.gs -> 0 = domenica ... 6 = sabato. */
function _orariGiornoSettimana_(nome) {
  var n = _orariChiave_(nome);
  var nomi = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  for (var i = 0; i < nomi.length; i++) if (n.indexOf(nomi[i]) === 0) return i;
  var corti = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  for (var k = 0; k < corti.length; k++) if (n.indexOf(corti[k]) === 0) return k;
  return -1;
}

/** Il primo giorno >= inizio che cade nel giorno della settimana dato. */
function _orariPrimoGiorno_(inizio, giornoSettimana) {
  var g = new Date(inizio.getTime());
  var salto = (giornoSettimana - g.getDay() + 7) % 7;
  g.setDate(g.getDate() + salto);
  return g;
}

/** Data e ora dell'inizio (o della fine, se `fine`) dell'ora di lezione n (1 = prima). */
function _orariOraDel_(giorno, inizioOre, n, minutiOra, fine) {
  var hhmm = inizioOre[Math.min(n, inizioOre.length) - 1] || '08:00';
  var parti = String(hhmm).split(':');
  var t = new Date(giorno.getTime());
  t.setHours(Number(parti[0]) || 0, Number(parti[1]) || 0, 0, 0);
  // se l'orario di quest'ora non e' scritto, lo ricavo dall'ultimo scritto
  if (n > inizioOre.length) t.setMinutes(t.getMinutes() + (n - inizioOre.length) * minutiOra);
  if (fine) t.setMinutes(t.getMinutes() + minutiOra);
  return t;
}

/** Ore consecutive della stessa classe nello stesso giorno: un blocco solo. */
function _orariBlocchi_(celle, d) {
  var blocchi = [];
  for (var g = 0; g < d.giorni.length; g++) {
    var aperto = null;
    for (var o = 0; o < d.ore; o++) {
      var v = _mostraCella_(_cella_(celle, d, g, o));
      if (v === 'a disposizione') v = 'A disposizione';
      if (aperto && v && v === aperto.testo && aperto.oraA === o) { aperto.oraA = o + 1; continue; }
      if (!v) { aperto = null; continue; }
      aperto = { giorno: g, oraDa: o + 1, oraA: o + 1, testo: v };
      blocchi.push(aperto);
    }
  }
  return blocchi;
}

function _orariDescrizione_(docente, blocco, d) {
  var ore = (blocco.oraDa === blocco.oraA)
    ? blocco.oraDa + 'a ora'
    : 'dalla ' + blocco.oraDa + 'a alla ' + blocco.oraA + 'a ora';
  return '[Campanella] Orario di ' + docente + ', ' + d.giorni[blocco.giorno] + ', ' + ore +
         (d.periodo ? ' (' + d.periodo + ')' : '') +
         '. Se qualcosa non torna, l\'orario ufficiale resta quello pubblicato dalla scuola.';
}


// ===========================================================================
//  COSTRUZIONE DEI MESSAGGI
// ===========================================================================
function _daMandare_(d) {
  var mio = _mioIndirizzoOrari_();
  var fuori = [];
  for (var i = 0; i < d.docenti.length; i++) {
    var doc = d.docenti[i];
    if (_conteggioOre_(doc.celle) === 0) continue;
    fuori.push({
      a: mio,
      nome: doc.nome,
      titolo: doc.nome,
      oggetto: (d.oggettoDocente || 'Orario {docente}')
                 .replace(/\{docente\}/g, doc.nome)
                 .replace(/\{periodo\}/g, d.periodo || ''),
      griglia: doc.celle
    });
  }
  return fuori;
}

function _classiDaMandare_(d) {
  if (!d.classi || !d.classi.length) {
    throw new Error('In DatiOrari.gs non ci sono gli orari delle classi.\n' +
      'Nell\'applicazione, nella pagina Orari, spunta "Prepara anche gli orari ' +
      'delle classi" e rigenera i dati.');
  }
  var mio = _mioIndirizzoOrari_();
  var fuori = [];
  for (var i = 0; i < d.classi.length; i++) {
    var c = d.classi[i];
    fuori.push({
      a: mio,
      nome: c.nome,
      titolo: 'Classe ' + c.nome,
      oggetto: (d.oggettoClasse || 'Orario classe {classe}')
                 .replace(/\{classe\}/g, c.nome)
                 .replace(/\{periodo\}/g, d.periodo || ''),
      griglia: c.celle
    });
  }
  return fuori;
}

function _conteggioOre_(celle) {
  var n = 0;
  for (var i = 0; i < celle.length; i++) if (celle[i]) n++;
  return n;
}

function _cella_(celle, d, giorno, ora) {
  var i = giorno * d.ore + ora;
  return (i < celle.length) ? (celle[i] || '') : '';
}

function _mostraCella_(v) {
  if (!v) return '';
  var s = String(v).trim().toUpperCase();
  if (s === 'D' || s === 'DISP' || s === 'DISP.' || s === 'DISPOSIZIONE') return 'a disposizione';
  return String(v).trim();
}

function _html_(titolo, celle, d) {
  var s = [];
  s.push('<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#202124">');
  s.push('<h2 style="margin:0 0 4px 0;font-size:18px">' + _fuga_(titolo) + '</h2>');
  if (d.periodo) s.push('<div style="color:#5f6368;margin-bottom:14px">' + _fuga_(d.periodo) + '</div>');

  s.push('<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px">');
  s.push('<tr><th style="' + _stileTh_() + '">Ora</th>');
  for (var g = 0; g < d.giorni.length; g++)
    s.push('<th style="' + _stileTh_() + '">' + _fuga_(d.giorni[g]) + '</th>');
  s.push('</tr>');

  for (var o = 0; o < d.ore; o++) {
    s.push('<tr>');
    s.push('<td style="' + _stileTd_() + 'font-weight:600;text-align:center;background:#f8f9fa">' +
           (o + 1) + '</td>');
    for (var gg = 0; gg < d.giorni.length; gg++) {
      var v = _mostraCella_(_cella_(celle, d, gg, o));
      var vuota = (v === '');
      s.push('<td style="' + _stileTd_() + (vuota ? 'background:#fcfcfd' : '') + '">' +
             (vuota ? '&nbsp;' : _fuga_(v)) + '</td>');
    }
    s.push('</tr>');
  }
  s.push('</table>');

  if (d.nota) s.push('<p style="color:#5f6368;margin-top:16px">' + _fuga_(d.nota) + '</p>');
  s.push('<p style="color:#9aa0a6;font-size:11px;margin-top:18px">' +
         'Messaggio preparato automaticamente. Se qualcosa non torna, ' +
         'l\'orario ufficiale resta quello pubblicato dalla scuola.</p>');
  s.push('</div>');
  return s.join('');
}

function _stileTh_() {
  return 'border:1px solid #dadce0;padding:6px 10px;background:#e8f0fe;text-align:center;';
}

function _stileTd_() {
  return 'border:1px solid #dadce0;padding:6px 10px;white-space:nowrap;';
}

function _testoSemplice_(celle, d) {
  var righe = [];
  var intest = 'Ora  ';
  for (var g = 0; g < d.giorni.length; g++) intest += _riempi_(d.giorni[g], 16);
  righe.push(intest);
  righe.push(new Array(intest.length + 1).join('-'));
  for (var o = 0; o < d.ore; o++) {
    var r = _riempi_(String(o + 1), 5);
    for (var gg = 0; gg < d.giorni.length; gg++)
      r += _riempi_(_mostraCella_(_cella_(celle, d, gg, o)) || '-', 16);
    righe.push(r);
  }
  if (d.nota) { righe.push(''); righe.push(d.nota); }
  return righe.join('\n');
}

function _riempi_(s, n) {
  s = String(s == null ? '' : s);
  while (s.length < n) s += ' ';
  return s;
}

function _fuga_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ===========================================================================
//  UTILITA'
// ===========================================================================
function _orariDati_() {
  if (typeof ORARI === 'undefined') {
    throw new Error('Manca il file "DatiOrari.gs".\n' +
      'Nell\'applicazione Campanella, pagina Orari, premi "Copia negli appunti" con ' +
      '"Dati dell\'orario" selezionato e incolla in un nuovo file dell\'editor chiamato DatiOrari.');
  }
  if (!ORARI.docenti || !ORARI.docenti.length) {
    throw new Error('In DatiOrari.gs non c\'e\' nessun docente.');
  }
  return ORARI;
}

function _mioIndirizzoOrari_() {
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (err) { e = ''; }
  // in un trigger getActiveUser puo' tornare vuoto: allora vale l'utente
  // effettivo, che in uno script personale e' sempre il titolare dell'account
  if (!e) {
    try { e = Session.getEffectiveUser().getEmail(); } catch (err2) { e = ''; }
  }
  if (!e) throw new Error('Non riesco a sapere qual e\' il tuo indirizzo: riprova dopo aver ' +
                          'autorizzato lo script.');
  return e;
}

/**
 * L'etichetta degli orari, come la crea la Posta: "Orari" sotto il prefisso
 * delle etichette, se c'e'. Configurazione.gs sta nello stesso progetto; se
 * manca, l'etichetta e' "Orari" e basta.
 */
function _orariNomeEtichetta_() {
  var prefisso = '';
  if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.prefissoEtichette) {
    prefisso = String(CONFIG.prefissoEtichette).replace(/\/+$/, '');
  }
  return prefisso ? prefisso + '/' + _ORARI_ETICHETTA : _ORARI_ETICHETTA;
}

/** Se esiste l'etichetta degli orari, la metto ai messaggi appena mandati a me con quell'oggetto. */
function _etichettaInviati_(oggetto) {
  var nome = _orariNomeEtichetta_();
  try {
    var etichetta = GmailApp.getUserLabelByName(nome);
    if (!etichetta) {
      Logger.log('Non c\'e\' l\'etichetta "' + nome + '": i messaggi restano senza etichetta.');
      return;
    }
    var modello = String(oggetto || '').split('{')[0].trim() || 'Orario';
    var trovati = GmailApp.search('to:me from:me subject:"' + modello + '" newer_than:1d', 0, 100);
    if (trovati.length) etichetta.addToThreads(trovati);
  } catch (e) {
    Logger.log('Etichetta "' + nome + '" non messa: ' + e.message);
  }
}

function _programmaRipresaOrari_(funzione) {
  _togliTriggerOrari_(funzione);
  ScriptApp.newTrigger(funzione).timeBased().after(60 * 1000).create();
}

/** Vero se c'e' una ripresa programmata di quella funzione. */
function _orariRipresaProgrammata_(funzione) {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === funzione) return true;
  return false;
}

function _togliTriggerOrari_(funzione) {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++)
    if (t[i].getHandlerFunction() === funzione) ScriptApp.deleteTrigger(t[i]);
}
