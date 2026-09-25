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
 *                                (e quante serie e quanti colloqui
 *                                metterebbe sul calendario; avvisa se il
 *                                fuso orario dello script non e' quello
 *                                dell'Italia)
 *    ORARI_2_invia ............. manda a te una email per docente (a blocchi,
 *                                riprende da sola se finisce il tempo)
 *    ORARI_3_inviaOrariClassi .. manda a te anche gli orari delle classi
 *                                (anche questa riprende da sola)
 *    ORARI_4_calendario ........ mette il tuo orario (il nome scelto
 *                                nell'applicazione) su Google Calendar, nel
 *                                calendario indicato (lo crea se non c'e',
 *                                con il fuso orario dello script),
 *                                senza lezioni nei giorni senza lezione e
 *                                ogni classe con il suo colore, e i tuoi
 *                                colloqui con le famiglie, con il link del
 *                                Meet; riprende da sola se finisce il tempo
 *                                o se Google chiede di rallentare
 *    ORARI_5_cambioOrario ...... l'orario e' cambiato: dalla data scelta
 *                                nell'applicazione mette quello nuovo (e i
 *                                colloqui), e le settimane prima restano
 *                                (riprende da sola)
 *    ORARI_6_coloraLezioni ..... da' alle lezioni gia' messe il colore della
 *                                loro classe scelto nell'applicazione, e ai
 *                                colloqui il loro, senza rifarli (riprende
 *                                da sola)
 *    ORARI_7_colloqui .......... i colloqui sono cambiati: li aggiorna da
 *                                oggi in poi, senza toccare le lezioni;
 *                                quelli passati restano (riprende da sola)
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
 *    ORARI_4_calendario, ORARI_5_cambioOrario, ORARI_6_coloraLezioni,
 *    ORARI_7_colloqui e ORARI_ANNULLA_calendario, che toccano solo il
 *    calendario che indichi (uno tuo, non uno a cui sei iscritto, con quel
 *    nome esatto) e, dentro, solo gli eventi creati qui: ORARI_4_calendario
 *    li crea, ORARI_5_cambioOrario (e ORARI_7_colloqui, per i soli colloqui)
 *    rifa' fino al giorno prima del cambio (poi toglie la serie vecchia) o
 *    toglie solo quelli con il contrassegno, ORARI_6_coloraLezioni cambia
 *    solo il colore di quelli con il contrassegno, ORARI_ANNULLA_calendario
 *    toglie quelli con il contrassegno o con la descrizione che comincia con
 *    [Campanella] (se Google non ha salvato il contrassegno; ma anche una
 *    copia fatta a mano di una lezione ha quella descrizione). Gli eventi
 *    creati qui hanno il colore della loro classe, scelto nell'applicazione
 *    (calendario.colori in DatiOrari.gs), e i colloqui il loro
 *    (calendario.coloreColloqui). Del calendario cambiano solo il colore
 *    scelto nell'applicazione e il fuso orario, se non e' quello dello
 *    script.
 *
 *  I COLLOQUI CON LE FAMIGLIE
 *    Li scrivi nell'applicazione (Orari, passo 4, Colloqui): il ricevimento
 *    di ogni settimana, le giornate dei colloqui generali, i periodi senza
 *    colloqui. Sul calendario il ricevimento e' una serie (a tratti, come le
 *    lezioni: niente colloqui nei giorni senza lezione e in quelli senza
 *    colloqui), una giornata e' un evento singolo; il titolo e' il nome che
 *    hai scritto, il luogo il link del Meet. Le prenotazioni dei genitori
 *    restano nel registro elettronico: qui c'e' solo quando e dove.
 *
 *  IL CALENDARIO IN UN ALTRO ACCOUNT
 *    Per mettere l'orario nel Google Calendar di un altro account (per
 *    esempio il tuo personale) l'applicazione prepara da questo file
 *    Calendario.gs, la versione solo calendario: le stesse funzioni del
 *    calendario, con gli stessi nomi, senza quelle delle email, da incollare
 *    in un progetto di quell'account con un DatiOrari.gs che ha soltanto il
 *    tuo orario. Le parti che servono solo alle email stanno fra le righe
 *    "// [SOLO EMAIL]" e "// [FINE SOLO EMAIL]": in Calendario.gs non ci
 *    sono. Le righe fra "// [SOLO CALENDARIO.GS]" e
 *    "// [FINE SOLO CALENDARIO.GS]" qui sono commenti, e li' diventano
 *    codice. Questa intestazione, li', e' un'altra.
 * ============================================================================
 */

var _ORARI_VERSIONE      = '1.5.0';
var _ORARI_MAX_SECONDI   = 260;
// [SOLO EMAIL] -----------------------------------------------------------------
// l'invio degli orari: dove si ricorda il punto, chi riprende, l'etichetta
var _ORARI_CHIAVE        = 'CAMPANELLA_ORARI_PROGRESSO';
var _ORARI_CHIAVE_CLASSI = 'CAMPANELLA_ORARI_CLASSI_PROGRESSO';
var _ORARI_TRIGGER       = 'ORARI_2_invia';
var _ORARI_TRIGGER_CLASSI = 'ORARI_3_inviaOrariClassi';
var _ORARI_ETICHETTA     = 'Orari';            // sotto il prefisso delle etichette della Posta
// chi altro puo' tenere il blocco dello script, per i messaggi: nel progetto
// della Posta anche un invio degli orari e il riordino della posta
var _ORARI_ALTRE_ESECUZIONI = 'il calendario, un invio degli orari o il riordino della posta';
// [FINE SOLO EMAIL] ------------------------------------------------------------
// [SOLO CALENDARIO.GS] (in Calendario.gs queste righe sono codice) -------------
// var _ORARI_ALTRE_ESECUZIONI = 'il calendario';
// [FINE SOLO CALENDARIO.GS] ----------------------------------------------------
var _ORARI_CHIAVE_CALENDARIO = 'CAMPANELLA_ORARI_CALENDARIO_PROGRESSO';  // il lavoro a meta' sul calendario
var _ORARI_CHIAVE_COLORI = 'CAMPANELLA_ORARI_COLORI_PROGRESSO';  // quello di ORARI_6_coloraLezioni
var _ORARI_TRIGGER_CALENDARIO = 'ORARI_4_calendario';  // le riprese del calendario: la funzione stessa
var _ORARI_TRIGGER_CAMBIO = 'ORARI_5_cambioOrario';
var _ORARI_TRIGGER_COLORI = 'ORARI_6_coloraLezioni';
var _ORARI_TRIGGER_COLLOQUI = 'ORARI_7_colloqui';  // le riprese dei colloqui (lo stesso lavoro a meta' del calendario)
// i colori degli eventi di Google Calendar (CalendarApp.EventColor, da "1" a
// "11") con il nome che hanno nell'interfaccia italiana, per i messaggi
var _ORARI_NOMI_COLORI   = ['', 'Lavanda', 'Salvia', 'Vinaccia', 'Fenicottero', 'Banana', 'Mandarino', 'Pavone',
                            'Grafite', 'Mirtillo', 'Basilico', 'Pomodoro'];
var _ORARI_PAUSA_MS      = 500;                // fra una modifica al calendario e l'altra
var _ORARI_MAX_RIFIUTI   = 10;                 // limiti di Google di fila prima di smettere di riprovare
var _ORARI_TAG           = 'campanella';       // contrassegno degli eventi creati qui
var _ORARI_TAG_VALORE    = 'orario';
// i colloqui con le famiglie: lo stesso contrassegno, con un valore loro. Senza
// contrassegno si riconoscono dall'inizio della descrizione
var _ORARI_TAG_COLLOQUIO = 'colloquio';
var _ORARI_INIZIO_COLLOQUI = '[Campanella] Colloqui';
var _ORARI_NOME_COLLOQUI = 'Colloqui';          // nei messaggi, dove le lezioni hanno la classe
// il secondo contrassegno delle serie e degli eventi rifatti dal cambio
// d'orario: l'id della serie vecchia che sostituiscono e il giorno prima del cambio
var _ORARI_TAG_SOSTITUISCE = 'campanella_sostituisce';
// negli eventi singoli rimessi dal cambio d'orario: la classe (il loro titolo
// puo' essere cambiato a mano, come "2B VERIFICA") e, se il colore l'ha scelto
// il docente per quella lezione, il segno; li legge ORARI_6_coloraLezioni
var _ORARI_TAG_CLASSE    = 'campanella_classe';
var _ORARI_TAG_COLORE    = 'campanella_colore';
var _ORARI_COLORE_A_MANO = 'a mano';
// quello delle scuole italiane: con un altro fuso dello script l'anteprima
// avvisa, e ORARI_4, ORARI_5 e ORARI_7 si fermano (_orariFusoDelloScript_)
var _ORARI_FUSO_SCUOLA   = 'Europe/Rome';
// il DatiOrari.gs della scuola quando l'orario va nel Google Calendar di un
// altro account (calendarioAltroAccount: true, e niente calendario)
var _ORARI_ALTRO_ACCOUNT = 'nell\'applicazione (Orari, passo 4) hai scelto di mettere l\'orario nel Google ' +
                           'Calendar di un altro account: li\' lo mette ORARI_4_calendario di Calendario.gs, con i ' +
                           '"Dati del tuo orario". In questo progetto non ci sono ne\' il calendario ne\' i colloqui.';


// ===========================================================================
//  1 - ANTEPRIMA
// ===========================================================================
function ORARI_1_anteprima() {
  var d = _orariDati_();
  var righe = [];
  // [SOLO EMAIL] ---------------------------------------------------------------
  righe.push('ANTEPRIMA - non viene mandato niente.');
  righe.push('Orari.gs versione ' + _ORARI_VERSIONE);
  // [FINE SOLO EMAIL] ----------------------------------------------------------
  // [SOLO CALENDARIO.GS] -------------------------------------------------------
  // righe.push('ANTEPRIMA - sul calendario non viene messo niente.');
  // righe.push('Calendario.gs versione ' + _ORARI_VERSIONE);
  // [FINE SOLO CALENDARIO.GS] --------------------------------------------------
  righe.push('Fuso orario dello script: ' + Session.getScriptTimeZone());
  // il calendario prende il fuso dello script: le lezioni finirebbero a un'altra ora
  var fusoSbagliato = _orariFusoDelloScript_();
  if (fusoSbagliato) righe.push('ATTENZIONE: ' + fusoSbagliato + ' Poi riesegui ORARI_1_anteprima.');
  righe.push('');
  righe.push('Periodo: ' + (d.periodo || '(non indicato)'));
  righe.push('Docenti nel file: ' + d.docenti.length);
  righe.push('Giorni: ' + d.giorni.join(' ') + '   Ore al giorno: ' + d.ore);
  // [SOLO EMAIL] ---------------------------------------------------------------
  // le email: a chi (il tuo indirizzo), con quale etichetta, quante
  var elenco = _daMandare_(d);
  righe = righe.concat(_orariAnteprimaInvio_(d, elenco));
  // [FINE SOLO EMAIL] ----------------------------------------------------------
  // [SOLO CALENDARIO.GS] -------------------------------------------------------
  // righe.push('');
  // [FINE SOLO CALENDARIO.GS] --------------------------------------------------
  // il calendario: senza email e senza indirizzo, come in Calendario.gs
  if (d.calendario && d.calendario.docente) {
    righe.push('Calendario: "' + d.calendario.nome + '" per ' + d.calendario.docente +
               ', dal ' + d.calendario.inizio + ' al ' + d.calendario.fine);
    righe = righe.concat(_orariAnteprimaCalendario_(d));
  } else if (d.calendarioAltroAccount) {
    righe.push('Calendario: ' + _ORARI_ALTRO_ACCOUNT);
  } else {
    righe.push('Calendario: nessuno. Per mettere il tuo orario su Google Calendar scegli il tuo nome ' +
               'nell\'applicazione (Orari, passo 4) e rigenera DatiOrari.gs.');
  }
  // [SOLO EMAIL] ---------------------------------------------------------------
  righe = righe.concat(_orariAnteprimaMessaggio_(d, elenco));
  // [FINE SOLO EMAIL] ----------------------------------------------------------

  var testo = righe.join('\n');
  Logger.log(testo);
  return testo;
}

// [SOLO EMAIL] -----------------------------------------------------------------
/** Le righe dell'anteprima sulle email: destinatario, etichetta, quante e la quota di oggi. */
function _orariAnteprimaInvio_(d, elenco) {
  var righe = [];
  righe.push('Destinatario: ' + _mioIndirizzoOrari_() + ' (solo tu)');
  righe.push('Etichetta dei messaggi mandati: "' + _orariNomeEtichetta_() + '", se esiste');
  righe.push('');
  righe.push('Email da mandare: ' + elenco.length + ' (una per docente con almeno un\'ora)');
  righe.push('Ancora disponibili oggi: ' + MailApp.getRemainingDailyQuota());
  if (d.classi && d.classi.length) righe.push('Orari delle classi pronti: ' + d.classi.length);
  return righe;
}

/** In fondo all'anteprima: il primo messaggio che partirebbe, com'e'. */
function _orariAnteprimaMessaggio_(d, elenco) {
  var righe = [];
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
  return righe;
}
// [FINE SOLO EMAIL] ------------------------------------------------------------

/**
 * Il fuso orario dello script non e' quello delle scuole italiane
 * (_ORARI_FUSO_SCUOLA): il calendario nasce con il fuso dello script, e le
 * lezioni finirebbero a un'altra ora. Il perche' e dove si cambia, o '' se il
 * fuso e' giusto. ORARI_1_anteprima lo dice; ORARI_4_calendario,
 * ORARI_5_cambioOrario e ORARI_7_colloqui si fermano prima di toccare il calendario.
 */
function _orariFusoDelloScript_() {
  if (Session.getScriptTimeZone() === _ORARI_FUSO_SCUOLA) return '';
  return 'il fuso orario dello script non e\' quello dell\'Italia (' + _ORARI_FUSO_SCUOLA + '): e\' ' +
    Session.getScriptTimeZone() + ', e le ore delle lezioni sul calendario sarebbero lette in quel fuso: le lezioni ' +
    'comparirebbero a un\'altra ora. Cambialo nell\'editor: Impostazioni progetto (l\'ingranaggio a sinistra) -> ' +
    'Fuso orario -> quello con Roma.';
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
    righe = righe.concat(_orariAnteprimaColori_(c, piano));
    righe.push(_orariRigaColloqui_(c, _orariPianoColloqui_(c, periodo, periodo.inizio), 'da mettere con ORARI_4_calendario'));
    // il calendario c'e' gia', con un altro fuso: lo dico prima di ORARI_4 e ORARI_5
    var cal = _orariTrovaCalendario_(c.nome);
    var fuso = Session.getScriptTimeZone();
    var suo = cal ? String(cal.getTimeZone() || '') : fuso;
    if (suo !== fuso) {
      var problema = _orariLezioniNelFusoSbagliato_(cal, c, periodo, suo, fuso);
      righe.push(problema ? 'Calendario da sistemare. ' + problema
                          : 'Il calendario "' + c.nome + '" ha il fuso orario ' + (suo || '(nessuno)') + ', non ' + fuso +
                            ': ORARI_4_calendario (o ORARI_5_cambioOrario) gli mette ' + fuso + ' prima di mettere ' +
                            'le lezioni.');
    } else if (cal) {
      // il fuso giusto, ma serie messe quando ne aveva un altro (cambiato a mano)
      var diPrima = _orariSerieNelFusoDiPrima_(cal, c, periodo);
      if (diPrima) righe.push('Calendario da sistemare. ' + diPrima);
    }
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


// [SOLO EMAIL] -----------------------------------------------------------------
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
// [FINE SOLO EMAIL] ------------------------------------------------------------


// ===========================================================================
//  4 - GOOGLE CALENDAR
//  Ogni blocco di ore consecutive della stessa classe diventa un evento
//  settimanale, dal primo giorno utile fino alla data di fine. Nei giorni
//  senza lezione (feste, vacanze, ponti: la parte "sospensioni" di
//  DatiOrari.gs) l'evento non c'e': il blocco diventa piu' serie, una per
//  ogni tratto di settimane senza interruzioni (il "piano"). Gli eventi
//  portano un contrassegno, cosi' ORARI_ANNULLA_calendario e
//  ORARI_5_cambioOrario toccano solo loro. Dopo le lezioni vanno i colloqui
//  con le famiglie (la sezione 7).
//
//  Con tante serie si rischia il tempo massimo di un'esecuzione, o il
//  limite di Google alle modifiche fatte in poco tempo: lo script si ricorda
//  a che punto e' (con un'impronta del piano, per non mescolare due orari) e
//  si riprogramma fra un minuto, come l'invio.
//
//  Ogni serie prende il colore della sua classe (calendario.colori), appena
//  creata e prima del contrassegno. I colori non sono nell'impronta del
//  piano: non cambiano quali lezioni ci sono, e un DatiOrari.gs rigenerato a
//  meta' con altri colori non deve fermare una ripresa. Le serie che mancano
//  prendono quelli di adesso, e il messaggio finale dice di dare anche alle
//  altre quelli di adesso con ORARI_6_coloraLezioni. Un colore che Google
//  non mette non ferma il lavoro: si conta, e il messaggio finale lo dice.
//
//  Google ripete una serie alla stessa ora nel fuso del calendario, non in
//  quello dello script: il calendario si crea con il fuso dello script (che
//  deve essere quello dell'Italia: con un altro, e un progetto nuovo di un
//  altro account puo' averlo, ORARI_4, ORARI_5 e ORARI_7 si fermano prima
//  di toccare il calendario, _orariFusoDelloScript_), e
//  uno che c'e' gia' con un altro fuso (UTC, come quelli creati senza fuso
//  da Campanella 1.5) lo prende prima di ricevere lezioni. Se ne ha gia'
//  qualcuna, lo script si ferma e spiega come sistemare: dalla fine dell'ora
//  legale quelle lezioni comparirebbero un'ora prima. Si ferma anche se il
//  calendario ha gia' il fuso dello script ma le serie di Campanella che
//  passano un cambio dell'ora hanno le lezioni alla stessa ora UTC: il fuso
//  cambiato a mano in Google Calendar non cambia le serie gia' messe. Che le serie create
//  dopo setTimeZone seguano il fuso nuovo nessuno l'ha provato dal vivo:
//  dopo setTimeZone il calendario si riprende da Google e se ne guarda il
//  fuso, e in ogni lavoro la prima serie che passa un cambio dell'ora deve
//  avere tutte le lezioni alla stessa ora. Se no lo script si ferma, e dice
//  di usare un calendario nuovo (creato con il fuso: provato dal vivo).
// ===========================================================================
function ORARI_4_calendario(e) {
  return _orariCalendarioConLock_(_ORARI_TRIGGER_CALENDARIO, e);
}

// ===========================================================================
//  5 - CAMBIO D'ORARIO
//  L'orario nuovo vale da calendario.validoDal. Google non lascia accorciare
//  una serie (setRecurrence, provata dal vivo, non cambia niente), quindi le
//  serie gia' messe con lezioni prima di quel giorno e dopo si rifanno: una
//  serie nuova uguale (titolo, descrizione e luogo) fino al giorno prima,
//  senza le settimane in cui la vecchia non aveva la lezione (cancellata o
//  spostata a mano, o cambiata solo lei), un evento singolo per ogni lezione
//  spostata, rinominata, annotata o colorata a mano, alla sua ora e com'e', e solo alla
//  fine si toglie la vecchia. Le serie senza lezioni prima di
//  quel giorno si tolgono, come gli eventi singoli da quel giorno in poi, e
//  dal validoDal si mette l'orario nuovo. Le settimane prima restano come
//  sono. I colloqui con le famiglie si trattano come le lezioni: rifatti
//  fino al giorno prima, e dal validoDal quelli di DatiOrari.gs (per i soli
//  colloqui, da oggi, c'e' ORARI_7_colloqui: la sezione 7). Rieseguito con
//  la stessa data, o ripreso dopo un'interruzione, da'
//  lo stesso risultato: la serie nuova ha un secondo contrassegno con la
//  serie vecchia che sostituisce e il giorno prima del cambio, e si ritrova.
//  Una data prima dell'inizio del periodo vale come l'inizio: l'anno prima,
//  che puo' stare nello stesso calendario, non si tocca. Solo gli eventi con
//  il contrassegno: una serie con la sola descrizione di Campanella (forse
//  una copia fatta a mano) resta, e il messaggio la nomina.
// ===========================================================================
function ORARI_5_cambioOrario(e) {
  return _orariCalendarioConLock_(_ORARI_TRIGGER_CAMBIO, e);
}

// ===========================================================================
//  6 - I COLORI DELLE CLASSI
//  Ogni lezione ha il colore della sua classe, scelto nell'applicazione
//  (calendario.colori in DatiOrari.gs): ORARI_4_calendario e
//  ORARI_5_cambioOrario lo danno alle serie e agli eventi che creano. Questa
//  funzione lo da' a quelli gia' messi, senza rifarli ne' spostarli: solo a
//  quelli con il contrassegno, nel periodo di DatiOrari.gs; ai colloqui con
//  le famiglie il colore dei colloqui (calendario.coloreColloqui). Le lezioni di una
//  classe senza colore restano come sono (il messaggio dice quali ne hanno
//  ancora uno di prima). Con tante serie puo' finire il tempo, o Google puo'
//  chiedere di rallentare: si ricorda quelle gia' fatte e riprende da sola
//  fra un minuto, come le altre, con lo stesso lock. Con il lavoro di
//  ORARI_4_calendario o di ORARI_5_cambioOrario a meta' non colora niente e
//  dice di finirlo prima.
// ===========================================================================
function ORARI_6_coloraLezioni(e) {
  // una ripresa toglie subito il proprio trigger (vedi _orariCalendarioConLock_)
  if (e && e.triggerUid) _togliTriggerOrari_(_ORARI_TRIGGER_COLORI);
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) {
    // un lavoro a meta' non lo lascio fermo (ma non uno fermato con ANNULLA_automazione)
    var aMeta = _orariLavoroColori_();
    var riprendo = !!aMeta && !aMeta.fermato;
    if (riprendo) _programmaRipresaOrari_(_ORARI_TRIGGER_COLORI);
    var occupato = 'Un\'altra esecuzione (' + _ORARI_ALTRE_ESECUZIONI + ') e\' ancora in corso: ' +
      (riprendo ? 'riprovo da solo fra un minuto, da dove ero arrivato.' : 'aspetta che finisca e riprova.');
    Logger.log(occupato);
    return occupato;
  }
  try { return _orariColori_(e); }
  finally { lock.releaseLock(); }
}

// ===========================================================================
//  7 - I COLLOQUI CON LE FAMIGLIE
//  ORARI_4_calendario mette, dopo le lezioni, anche i colloqui scritti
//  nell'applicazione (calendario.colloqui in DatiOrari.gs): ogni ricevimento
//  settimanale come le lezioni, una serie per ogni tratto di settimane (niente
//  colloqui nei giorni senza lezione e in quelli in cui sono sospesi), ogni
//  giornata singola come evento singolo. Il titolo e' il nome scritto, il
//  luogo il link del Meet, la descrizione comincia con "[Campanella]
//  Colloqui" e dice il link; il contrassegno e' quello delle lezioni con un
//  valore suo, e il colore quello dei colloqui (calendario.coloreColloqui).
//  ORARI_5_cambioOrario li tratta come le lezioni, e ORARI_ANNULLA_calendario
//  li toglie con loro.
//  Se cambiano solo i colloqui, questa funzione li aggiorna da oggi in poi:
//  e' il cambio d'orario (la sezione 5), con oggi come data del cambio, solo
//  sui colloqui. Quelli prima di oggi restano come sono, anche se cambiati a
//  mano; le lezioni non si toccano. Il giorno e' quello in cui comincia: una
//  ripresa dopo la mezzanotte continua lo stesso lavoro. Le prenotazioni dei
//  genitori restano nel registro elettronico: qui c'e' solo quando e dove.
// ===========================================================================
function ORARI_7_colloqui(e) {
  return _orariCalendarioConLock_(_ORARI_TRIGGER_COLLOQUI, e);
}

function ORARI_ANNULLA_calendario() {
  // lo stesso lock dell'invio e del calendario: un lavoro in corso, finito il
  // tempo, rimetterebbe il suo punto e la sua ripresa subito dopo
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) {
    var occupato = 'Un\'altra esecuzione (' + _ORARI_ALTRE_ESECUZIONI + ') e\' ancora in corso: ' +
                   'riprova fra qualche minuto. Non ho tolto niente.';
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
    var occupato = 'Un\'altra esecuzione (' + _ORARI_ALTRE_ESECUZIONI + ') e\' ancora in corso: ' +
      (riprendo ? 'riprovo da solo fra un minuto, da dove ero arrivato.' : 'aspetta che finisca e riprova.');
    Logger.log(occupato);
    return occupato;
  }
  try { return _orariCalendario_(funzione, e); }
  finally { lock.releaseLock(); }
}

/** Il lavoro a meta' sul calendario (di ORARI_4, di ORARI_5 o di ORARI_7), se c'e' e si capisce. */
function _orariLavoroCalendario_() {
  var testo = PropertiesService.getUserProperties().getProperty(_ORARI_CHIAVE_CALENDARIO);
  if (!testo) return null;
  try {
    var s = JSON.parse(testo);
    if (s && (s.funzione === _ORARI_TRIGGER_CALENDARIO || s.funzione === _ORARI_TRIGGER_CAMBIO ||
              s.funzione === _ORARI_TRIGGER_COLLOQUI)) return s;
  } catch (err) { /* un punto illeggibile vale come nessun punto */ }
  return null;
}

/**
 * Per chi trova a meta' il lavoro sul calendario di un'altra funzione: come
 * si finisce. Riprende da solo se la sua ripresa c'e' ancora:
 * ANNULLA_automazione (che lo segna fermato), il limite della giornata o
 * Google che rifiuta ancora dopo tante riprese la tolgono, e una ripresa
 * partita toglie la sua appena comincia (finita con un altro errore, non ce
 * n'e' un'altra): allora va rieseguito a mano.
 */
function _orariComeFinire_(salvato) {
  var daSolo = !salvato.fermato && _orariRipresaProgrammata_(salvato.funzione);
  return daSolo
    ? 'riprende da solo fra poco, oppure rieseguilo tu per finirlo'
    : 'non riprende da solo' + (salvato.fermato ? ' (e\' stato fermato con ANNULLA_automazione)' : '') +
      ': rieseguilo tu, riparte da dove era arrivato';
}

function _orariCalendario_(funzione, e) {
  var prop = PropertiesService.getUserProperties();
  var salvato = _orariLavoroCalendario_();
  var cambio = (funzione === _ORARI_TRIGGER_CAMBIO);
  // ORARI_7_colloqui: il taglio del cambio d'orario, da oggi e solo sui colloqui
  var soloColloqui = (funzione === _ORARI_TRIGGER_COLLOQUI);
  var taglia = cambio || soloColloqui;
  var ripresa = !!(e && e.triggerUid);

  // una ripresa programmata che non trova il suo lavoro non ricomincia da
  // capo: e' gia' finito, oppure e' stato annullato
  if (ripresa && (!salvato || salvato.funzione !== funzione)) {
    _togliTriggerOrari_(funzione);
    var niente = 'Niente da riprendere: il lavoro sul calendario e\' gia\' finito, oppure e\' stato annullato.';
    Logger.log(niente);
    return niente;
  }
  // la prova del fuso orario e' andata male (_orariFusoDellaSerie_): in quel
  // calendario non si mette nient'altro, finche' ORARI_ANNULLA_calendario non
  // dimentica il lavoro. Il messaggio e' quello di allora, con il rimedio
  if (salvato && salvato.fusoSbagliato) {
    if (ripresa) _togliTriggerOrari_(funzione);
    throw new Error(String(salvato.fusoSbagliato));
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
    var come = _orariComeFinire_(salvato);
    throw new Error(salvato.funzione === _ORARI_TRIGGER_CAMBIO
      ? 'C\'e\' un cambio d\'orario a meta\' (ORARI_5_cambioOrario): ' + come + '. Per togliere tutto quello ' +
        'che Campanella ha messo sul calendario c\'e\' ORARI_ANNULLA_calendario.'
      : salvato.funzione === _ORARI_TRIGGER_COLLOQUI
      ? 'C\'e\' un aggiornamento dei colloqui a meta\' (ORARI_7_colloqui): ' + come + '. Per togliere tutto ' +
        'quello che Campanella ha messo sul calendario c\'e\' ORARI_ANNULLA_calendario.'
      : 'L\'orario messo da ORARI_4_calendario e\' ancora a meta\': ' + come + ', e poi esegui ' +
        funzione + '. Per togliere tutto c\'e\' ORARI_ANNULLA_calendario.');
  }

  // prima di toccare il calendario: dati, date e piano, tutti controllati
  var d = _orariDati_();
  var c = _orariCalendarioConfig_(d);
  var doc = _orariDocente_(d, c.docente);
  var periodo = _orariPeriodo_(c);
  // e il fuso dello script: il calendario nasce con quello, e le serie si
  // ripetono all'ora di quel fuso (un progetto nuovo di un altro account puo'
  // averne un altro)
  var fusoSbagliato = _orariFusoDelloScript_();
  if (fusoSbagliato) {
    throw new Error('Mi fermo: ' + fusoSbagliato + ' Poi riesegui ' + funzione + '. Non ho toccato il calendario.');
  }
  var dal = periodo.inizio;
  var validoDal = null;
  if (cambio) {
    validoDal = _orariValidoDal_(c, periodo);
    // una data prima dell'inizio vale come l'inizio: l'orario nuovo per tutto
    // il periodo, e niente prima (l'anno prima puo' stare nello stesso calendario)
    if (validoDal < periodo.inizio) validoDal = periodo.inizio;
    dal = validoDal;
  }
  if (soloColloqui) {
    // da oggi, o dal giorno in cui e' cominciato il lavoro che riprende
    validoDal = _orariOggiDeiColloqui_(salvato, periodo);
    dal = validoDal;
  }
  // ORARI_7_colloqui non mette lezioni: il suo piano ha solo i colloqui
  var piano = soloColloqui ? { serie: [], lezioni: 0, saltate: 0, blocchiFuori: 0 }
                           : _orariPiano_(d, doc, periodo, dal);
  piano.colloqui = _orariPianoColloqui_(c, periodo, dal);
  var impronta = _orariImpronta_(c, doc, d, piano,
                                 cambio ? c.validoDal : (soloColloqui ? _orariChiaveData_(validoDal) : ''));

  if (salvato && salvato.impronta !== impronta) {
    _togliTriggerOrari_(funzione);
    if (soloColloqui) {
      // come il cambio d'orario: si rifa' da capo con i dati di adesso
      var colloquioSenza = _orariPezzoAppenaRifatto_(salvato, c);
      prop.deleteProperty(_ORARI_CHIAVE_CALENDARIO);
      throw new Error('DatiOrari.gs e\' cambiato a meta\' del lavoro: ORARI_7_colloqui aveva cominciato con altri ' +
        'colloqui (o altre date) e non va avanti mescolandoli. Ho dimenticato il lavoro a meta\'; i colloqui gia\' ' +
        'messi restano.\nRiesegui ORARI_7_colloqui: aggiorna i colloqui da oggi con i dati di adesso, e quelli ' +
        'prima restano.' + _orariAvvisoDaContrassegnare_(salvato) + colloquioSenza);
    }
    if (cambio) {
      // il cambio si rifa' da capo con i dati di adesso: il taglio ritrova le
      // serie gia' messe, e i pezzi rifatti per un'altra data li toglie
      var rifattoSenza = _orariPezzoAppenaRifatto_(salvato, c);
      // le serie gia' rifatte fino al giorno prima della data di prima (o
      // tolte) non hanno piu' le lezioni di prima fra le due date
      var avanti = (salvato.validoDal && c.validoDal > salvato.validoDal && (salvato.rifatte || salvato.tolte))
        ? '\nAttenzione: la data nuova, ' + c.validoDal + ', viene dopo quella di prima, ' + salvato.validoDal + ', e ' +
          'qualche serie era gia\' stata rifatta fino al giorno prima di quella, o tolta: fra le due date quelle ' +
          'lezioni dell\'orario di prima non ci sono piu\', e il cambio non le rimette. Per riaverle: ' +
          'ORARI_ANNULLA_calendario, poi ORARI_4_calendario con il DatiOrari.gs dell\'orario di prima, poi ' +
          'ORARI_5_cambioOrario con quello nuovo.'
        : '';
      prop.deleteProperty(_ORARI_CHIAVE_CALENDARIO);
      throw new Error('DatiOrari.gs e\' cambiato a meta\' del lavoro: ORARI_5_cambioOrario aveva cominciato con ' +
        'un altro orario (o altre date) e non va avanti mescolandoli. Ho dimenticato il lavoro a meta\'; le serie ' +
        'gia\' messe restano.\nRiesegui ORARI_5_cambioOrario: rifa\' il cambio dal ' + c.validoDal + ' con i ' +
        'dati di adesso, e le settimane prima restano.' + avanti + _orariAvvisoDaContrassegnare_(salvato) + rifattoSenza);
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
    var creato = false, fusoDiPrima = '';
    if (taglia) {
      if (!cal) {
        throw new Error(cambio
          ? 'Non c\'e\' nessun calendario chiamato "' + c.nome + '": ORARI_5_cambioOrario cambia ' +
            'l\'orario messo con ORARI_4_calendario. Se non l\'hai mai messo, esegui ORARI_4_calendario.'
          : 'Non c\'e\' nessun calendario chiamato "' + c.nome + '": ORARI_7_colloqui aggiorna i colloqui messi ' +
            'con ORARI_4_calendario. Se non l\'hai mai eseguito, esegui ORARI_4_calendario, che mette l\'orario e i ' +
            'colloqui.');
      }
    } else if (!cal) {
      // con il fuso dello script: senza, Google lo crea in UTC, e le serie
      // restano alla stessa ora UTC (dalla fine dell'ora legale, un'ora prima)
      cal = CalendarApp.createCalendar(c.nome, {
        summary: 'Orario scolastico messo da Campanella. Gli eventi si tolgono con ORARI_ANNULLA_calendario.',
        timeZone: Session.getScriptTimeZone()
      });
      creato = true;
    }
    // prima di mettere, cambiare o togliere lezioni: il fuso del calendario
    // dev'essere quello dello script (si ferma se ci sono gia' lezioni nel fuso sbagliato)
    if (!creato) fusoDiPrima = _orariSistemaFuso_(cal, c, periodo);
    // setTimeZone nessuno l'ha provato dal vivo: da qui si usa il calendario
    // ripreso da Google, che deve avere il fuso nuovo (se no si ferma)
    if (fusoDiPrima) cal = _orariCalendarioColFusoNuovo_(c, fusoDiPrima);
    if (!taglia && !creato) {
      // rieseguire sopra un orario gia' messo raddoppierebbe ogni lezione
      var gia = _orariNostri_(cal, periodo.inizio, _orariFineGiornata_(periodo.fine)).length;
      if (gia) {
        throw new Error('Nel calendario "' + c.nome + '" ci sono gia\' ' + gia + ' serie di eventi ' +
          'messe da Campanella fra il ' + c.inizio + ' e il ' + c.fine + ': rimettendole, ogni ' +
          'lezione comparirebbe due volte.\n' +
          'Se hai solo aggiunto o cambiato i colloqui con le famiglie, esegui ORARI_7_colloqui: li mette da oggi ' +
          'senza toccare le lezioni.\n' +
          'Se l\'orario e\' cambiato, usa ORARI_5_cambioOrario con la data da cui vale il nuovo (le ' +
          'settimane prima restano), oppure esegui prima ORARI_ANNULLA_calendario (toglie tutto, anche le ' +
          'lezioni spostate o cambiate a mano) e poi di nuovo ORARI_4_calendario.');
      }
    }
    if (!taglia && c.colore) {
      try { cal.setColor(CalendarApp.Color[c.colore] || c.colore); } catch (err) { /* colore non riconosciuto */ }
    }
    stato = { funzione: funzione, impronta: impronta, fase: taglia ? 'taglio' : 'crea', fatti: 0, colloquiFatti: 0,
              validoDal: cambio ? c.validoDal : (soloColloqui ? _orariChiaveData_(validoDal) : ''),
              rifatte: 0, tolte: 0, eventiTolti: 0, rimesse: 0, spostate: [],
              rifiuti: 0, creato: creato, fusoDiPrima: fusoDiPrima, senzaContrassegno: [], nSenzaContrassegno: 0,
              coloriImpronta: _orariImprontaColori_(c), coloriNonMessi: [], nColoriNonMessi: 0 };
    prop.setProperty(_ORARI_CHIAVE_CALENDARIO, JSON.stringify(stato));
  }
  // rieseguita a mano dopo ANNULLA_automazione: si riparte, e le riprese tornano a valere
  if (stato.fermato) stato.fermato = false;
  // le serie a cui rimettere il contrassegno, e quelle che non ho ritrovato
  // (anche in un punto salvato da una versione di prima, che non le aveva)
  if (!stato.daContrassegnare) stato.daContrassegnare = [];
  if (!stato.nonRitrovate) { stato.nonRitrovate = []; stato.nNonRitrovate = 0; }
  // i conti del taglio, anche in un punto salvato prima che ci fossero
  if (!stato.spostate) { stato.spostate = []; stato.rimesse = 0; }
  if (!stato.rifatte) stato.rifatte = 0;
  // i colloqui messi, anche in un punto salvato prima che ci fossero
  if (!stato.colloquiFatti) stato.colloquiFatti = 0;
  // i colori delle classi non sono nell'impronta (vedi sopra): cambiati a
  // meta', le serie da qui in poi prendono quelli di adesso, e il messaggio
  // finale dice di ricolorare le altre. Un punto salvato da una versione di
  // prima non li ha: valgono quelli di adesso
  if (!stato.coloriNonMessi) { stato.coloriNonMessi = []; stato.nColoriNonMessi = 0; }
  var coloriOra = _orariImprontaColori_(c);
  if (stato.coloriImpronta === undefined) stato.coloriImpronta = coloriOra;
  if (stato.coloriImpronta !== coloriOra) {
    stato.coloriCambiati = true;
    stato.coloriImpronta = coloriOra;
  }

  var scadenza = Date.now() + _ORARI_MAX_SECONDI * 1000;
  var salva = function () { prop.setProperty(_ORARI_CHIAVE_CALENDARIO, JSON.stringify(stato)); };
  try {
    if (stato.fase === 'taglio') {
      if (!_orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva, c)) {
        return _orariCalendarioInterrotto_(funzione, stato, piano, 'tempo', salva);
      }
      stato.fase = 'crea';
      salva();
    }
    // una serie a cui Google non ha salvato il contrassegno (qui sotto): prima
    // di crearne altre glielo rimetto, se la ritrovo. Senza, il cambio d'orario
    // non la rifarebbe ne' la toglierebbe, e le sue lezioni comparirebbero
    // due volte. Se il contrassegno non riesce ancora, resta da fare
    while (stato.daContrassegnare.length) {
      if (!_orariRimettiContrassegno_(cal, stato.daContrassegnare[0])) {
        stato.nNonRitrovate++;
        if (stato.nonRitrovate.length < 10) stato.nonRitrovate.push(_orariEtichettaDelTratto_(stato.daContrassegnare[0]));
      }
      stato.daContrassegnare.shift();
      stato.rifiuti = 0;
      salva();
    }
    while (stato.fatti < piano.serie.length) {
      if (Date.now() > scadenza) return _orariCalendarioInterrotto_(funzione, stato, piano, 'tempo', salva);
      var serie = _orariCreaSerie_(cal, piano.serie[stato.fatti], c, d, doc);
      // contata subito, e ricordata fra quelle da contrassegnare: se poi il
      // contrassegno non riesce, la serie c'e' gia'. Alla ripresa non si rifa',
      // e le si rimette il contrassegno (qui sopra)
      stato.daContrassegnare.push(_orariTrattoFatto_(piano.serie[stato.fatti], c, d, doc));
      stato.fatti++;
      stato.rifiuti = 0;
      salva();
      // il colore della sua classe, prima del contrassegno: se poi il
      // contrassegno non riesce, la serie lo riceve alla ripresa e il colore
      // ce l'ha gia'. Un colore che Google non mette non ferma il lavoro
      var colore = _orariColoreDi_(c, piano.serie[stato.fatti - 1].blocco.testo);
      if (colore) {
        try { serie.setColor(colore); }
        catch (errColore) {
          _orariColoreNonMesso_(stato, _orariEtichettaDelTratto_(_orariTrattoFatto_(piano.serie[stato.fatti - 1], c, d, doc)));
          salva();
        }
      }
      serie.setTag(_ORARI_TAG, _ORARI_TAG_VALORE);
      stato.daContrassegnare.pop();
      // la prima serie che passa un cambio dell'ora dice se Google ripete le
      // lezioni nel fuso dello script; se no, mi fermo qui (vedi sopra)
      if (!stato.fusoProvato && _orariPassaUnCambioDellOra_(piano.serie[stato.fatti - 1])) {
        var prova = _orariFusoDellaSerie_(cal, serie.getId(), piano.serie[stato.fatti - 1]);
        if (prova.sbagliata) {
          stato.fusoSbagliato = _orariFusoSbagliato_(c, prova);
          salva();
          throw new Error(stato.fusoSbagliato);
        }
        stato.fusoProvato = prova.provato;
      }
      Utilities.sleep(_ORARI_PAUSA_MS);
    }
    // poi i colloqui, allo stesso modo: il ricevimento di ogni settimana a
    // tratti, le giornate singole come eventi singoli (vedi la sezione 7)
    while (stato.colloquiFatti < piano.colloqui.voci.length) {
      if (Date.now() > scadenza) return _orariCalendarioInterrotto_(funzione, stato, piano, 'tempo', salva);
      var nuovoColloquio = _orariCreaColloquio_(cal, piano.colloqui.voci[stato.colloquiFatti], doc);
      stato.daContrassegnare.push(_orariColloquioFatto_(piano.colloqui.voci[stato.colloquiFatti], doc));
      stato.colloquiFatti++;
      stato.rifiuti = 0;
      salva();
      var voceColloquio = piano.colloqui.voci[stato.colloquiFatti - 1];
      if (c.coloreColloqui) {
        try { nuovoColloquio.setColor(c.coloreColloqui); }
        catch (errColoreColloquio) {
          _orariColoreNonMesso_(stato, _orariEtichettaDelTratto_(_orariColloquioFatto_(voceColloquio, doc)));
          salva();
        }
      }
      nuovoColloquio.setTag(_ORARI_TAG, _ORARI_TAG_COLLOQUIO);
      stato.daContrassegnare.pop();
      // anche un ricevimento settimanale prova il fuso, se le lezioni non l'hanno provato
      if (!stato.fusoProvato && !voceColloquio.singolo && _orariPassaUnCambioDellOra_(voceColloquio)) {
        var provaColloquio = _orariFusoDellaSerie_(cal, nuovoColloquio.getId(), voceColloquio);
        if (provaColloquio.sbagliata) {
          stato.fusoSbagliato = _orariFusoSbagliato_(c, provaColloquio);
          salva();
          throw new Error(stato.fusoSbagliato);
        }
        stato.fusoProvato = provaColloquio.provato;
      }
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
            : soloColloqui ? _orariFineColloqui_(c, doc, piano, stato, validoDal)
            : _orariFineCalendario_(c, doc, periodo, piano, stato);
  Logger.log(testo);
  return testo;
}

/**
 * Il taglio del cambio d'orario. Google non lascia accorciare una serie
 * (setRecurrence, provata dal vivo, non cambia niente): una serie con il
 * contrassegno che ha lezioni prima del validoDal e dal validoDal in poi si
 * rifa' per le settimane prima (_orariRifacimento_). (1) Una serie nuova,
 * con lo stesso titolo, la stessa descrizione e lo stesso luogo, dalla prima
 * lezione regolare ogni settimana fino al giorno prima del validoDal, con il
 * contrassegno e con quello che dice quale serie sostituisce
 * (_ORARI_TAG_SOSTITUISCE: l'id della vecchia e il giorno prima del cambio);
 * (2) dalla serie nuova si tolgono le lezioni delle settimane in cui la
 * vecchia non aveva la lezione regolare (cancellata, spostata o cambiata solo
 * lei a mano); (3) ogni lezione spostata, rinominata, annotata o colorata a mano torna
 * come evento singolo, alla sua ora, con i due contrassegni; (4) solo alla fine si
 * toglie la serie vecchia. Le serie con il contrassegno senza lezioni prima
 * del validoDal, e gli eventi singoli dal validoDal in poi, si tolgono. Le
 * trova solo _orariNostri_; quelle che riconosce solo dalla descrizione
 * (forse una copia fatta a mano) restano, e il messaggio finale le nomina.
 * Il validoDal non viene mai prima dell'inizio del periodo.
 *
 * Ogni volta tutto si ricalcola dal calendario (_orariPianoDelTaglio_), e
 * ogni passo fatto si ritrova: finche' la serie vecchia c'e', i suoi pezzi
 * gia' rifatti per questa data non si rifanno, e quelli rifatti per
 * un'altra (un cambio ricominciato da capo con altri dati) si tolgono prima
 * di lei. Un pezzo appena creato, a cui Google non ha ancora salvato i
 * contrassegni, ha l'id nel punto salvato (stato.appenaCreato), e glieli
 * rimette la ripresa, che lo ritrova per id anche se la sua descrizione (quella
 * della serie vecchia) non comincia con [Campanella]; se non lo ritrova, il
 * messaggio finale lo dice. Cosi' un lavoro interrotto (il tempo, i limiti di
 * Google) o rieseguito arriva allo stesso calendario. Torna false se finisce
 * il tempo.
 *
 * I pezzi rifatti prendono, appena creati e prima dei contrassegni, il colore
 * della classe della serie vecchia (il suo titolo) in c.colori; se la classe
 * non ne ha uno (non e' piu' nell'orario, o e' senza colore), quello che
 * aveva la serie vecchia. Una lezione colorata a mano solo lei (un colore
 * diverso da quello delle altre, r.coloreDiTutte) torna come evento singolo
 * con il suo. Ogni evento singolo rimesso ha anche la sua classe (il titolo
 * della serie vecchia) e, se il colore e' suo, il segno "a mano": cosi'
 * ORARI_6_coloraLezioni da' il colore della classe anche a una lezione
 * rinominata, e lascia com'e' quella colorata a mano.
 */
function _orariTaglia_(cal, periodo, validoDal, stato, scadenza, salva, c) {
  if (stato.appenaCreato) {
    // non ritrovato all'ora della sua prima lezione (tolto o spostato a mano
    // prima della ripresa): il taglio lo rifa', e il messaggio finale lo dice
    if (!_orariRimettiContrassegniAlPezzo_(cal, stato.appenaCreato)) _orariPezzoNonRitrovato_(stato, stato.appenaCreato.inizio);
    stato.appenaCreato = null;
    salva();
  }
  // da un anno prima dell'inizio: per sapere la prima lezione di ogni serie,
  // anche di una cominciata prima dell'inizio (un "Dal" spostato in avanti).
  // Le serie dell'anno prima, se stanno nello stesso calendario, finiscono
  // prima dell'inizio, quindi prima del validoDal: restano come sono
  var da = new Date(periodo.inizio.getFullYear() - 1, periodo.inizio.getMonth(), periodo.inizio.getDate());
  var nostri = _orariNostri_(cal, da, _orariFineGiornata_(periodo.fine));
  var fino = new Date(validoDal.getFullYear(), validoDal.getMonth(), validoDal.getDate() - 1, 23, 59, 59);
  var piano = _orariPianoDelTaglio_(nostri, periodo, validoDal, fino, cal.getTimeZone());
  stato.senzaContrassegno = [];
  stato.nSenzaContrassegno = 0;
  for (var n = 0; n < piano.ordine.length; n++) {
    var i = piano.ordine[n];
    var voce = nostri[i];
    var cosa = piano.cose[i];
    if (cosa.resta) continue;            // finisce prima del cambio, o e' un pezzo gia' rifatto (va con la sua serie)
    // ORARI_7_colloqui tocca solo i colloqui: le lezioni restano come sono
    if (stato.funzione === _ORARI_TRIGGER_COLLOQUI && !voce.colloquio) continue;
    if (!voce.contrassegno) {
      // la sola descrizione non basta per cambiarla: la nomino e basta
      stato.nSenzaContrassegno++;
      if (stato.senzaContrassegno.length < 10) stato.senzaContrassegno.push(_orariEtichetta_(voce));
      continue;
    }
    if (Date.now() > scadenza) return false;
    if (cosa.vecchio) {
      // rifatto per un'altra data, per una serie vecchia che c'e' ancora: via, prima di lei
      if (voce.serie) voce.serie.deleteEventSeries();
      else voce.evento.deleteEvent();
    } else if (voce.evento) {
      voce.evento.deleteEvent();
      stato.eventiTolti++;
    } else if (!cosa.rifai) {
      voce.serie.deleteEventSeries();
      stato.tolte++;
    } else {
      var r = cosa.rifai;
      var id = r.idNuova;
      // i colori dei pezzi rifatti (vedi sopra): per un colloquio quello dei colloqui
      var colore = _orariColoreNeiDati_(c, voce, r.titolo) || _orariColoreDiVoce_(voce) || r.coloreDiTutte;
      // il contrassegno dei pezzi: quello della serie vecchia, di una lezione o di un colloquio
      var valore = voce.colloquio ? _ORARI_TAG_COLLOQUIO : _ORARI_TAG_VALORE;
      if (!id && r.inizio) {
        // (1) la serie nuova: il suo id nel punto salvato prima dei contrassegni
        var nuova = _orariSerieRifatta_(cal, r, fino);
        id = nuova.getId();
        stato.appenaCreato = { id: nuova.getId(), inizio: r.inizio.getTime(), segno: r.segno,
                               colloquio: voce.colloquio };
        salva();
        if (colore) {
          try { nuova.setColor(colore); }
          catch (errColore) { _orariColoreNonMesso_(stato, _orariEtichetta_(voce)); salva(); }
        }
        nuova.setTag(_ORARI_TAG, valore);
        nuova.setTag(_ORARI_TAG_SOSTITUISCE, r.segno);
        stato.appenaCreato = null;
        salva();
        Utilities.sleep(_ORARI_PAUSA_MS);
      }
      // (2) le settimane in cui la vecchia non aveva la lezione regolare
      for (var b = 0; b < r.buchi.length; b++) {
        if (Date.now() > scadenza) return false;
        if (_orariTogliBuco_(cal, id, r.buchi[b])) Utilities.sleep(_ORARI_PAUSA_MS);
      }
      // (3) le lezioni spostate a mano, alla loro ora
      for (var m = 0; m < r.spostate.length; m++) {
        if (Date.now() > scadenza) return false;
        var singolo = _orariLezioneRifatta_(cal, r.spostate[m]);
        stato.appenaCreato = { id: singolo.getId(), inizio: r.spostate[m].inizio.getTime(), segno: r.segno,
                               colloquio: voce.colloquio };
        salva();
        var suo = _orariColoreDellaLezione_(r.spostate[m]);
        var suoAMano = !!suo && suo !== r.coloreDiTutte;
        var coloreSingolo = suoAMano ? suo : colore;
        var messoAMano = false;
        if (coloreSingolo) {
          try { singolo.setColor(coloreSingolo); messoAMano = suoAMano; }
          catch (errColoreSingolo) { _orariColoreNonMesso_(stato, _orariEtichettaLezione_(r.spostate[m])); salva(); }
        }
        // la classe (non per un colloquio, che ha il colore dei colloqui) e, se
        // ha il colore scelto a mano per lei, il segno: li legge ORARI_6_coloraLezioni
        if (!voce.colloquio) singolo.setTag(_ORARI_TAG_CLASSE, r.titolo);
        if (messoAMano) singolo.setTag(_ORARI_TAG_COLORE, _ORARI_COLORE_A_MANO);
        singolo.setTag(_ORARI_TAG, valore);
        singolo.setTag(_ORARI_TAG_SOSTITUISCE, r.segno);
        stato.appenaCreato = null;
        stato.rimesse++;
        if (stato.spostate.length < 10) stato.spostate.push(_orariEtichettaLezione_(r.spostate[m]));
        salva();
        Utilities.sleep(_ORARI_PAUSA_MS);
      }
      // (4) solo adesso la serie vecchia
      if (Date.now() > scadenza) return false;
      voce.serie.deleteEventSeries();
      stato.rifatte++;
    }
    stato.rifiuti = 0;
    salva();
    Utilities.sleep(_ORARI_PAUSA_MS);
  }
  return true;
}

/**
 * Per _orariTaglia_: che cosa fare di ogni voce di _orariNostri_, senza
 * toccare niente (legge i contrassegni "sostituisce" e le lezioni). In cose,
 * allo stesso indice di nostri:
 *   resta:   finisce prima del validoDal, oppure e' un pezzo gia' fatto del
 *            rifacimento, per questa data, di una serie vecchia che c'e'
 *            ancora: si usa con lei;
 *   vecchio: un pezzo del rifacimento di una serie vecchia che c'e' ancora,
 *            fatto per un'altra data (o doppio): si toglie;
 *   rifai:   una serie con il contrassegno, con lezioni prima del validoDal
 *            e dal validoDal in poi: come rifarla (_orariRifacimento_), senza
 *            quello che c'e' gia' (la serie nuova, idNuova, e le lezioni
 *            spostate gia' rimesse);
 *   altrimenti si toglie. In ordine vengono prima i pezzi vecchi: si
 *   riconoscono solo finche' c'e' la loro serie vecchia, quindi vanno tolti
 *   prima di lei.
 */
function _orariPianoDelTaglio_(nostri, periodo, validoDal, fino, fuso) {
  var giorno = _orariChiaveData_(fino);
  var ids = [], segni = [], cose = [];
  for (var i = 0; i < nostri.length; i++) {
    var v = nostri[i];
    ids.push(v.serie ? String(v.serie.getId()) : '');
    segni.push(_orariSegnoDi_(v));
    cose.push({ resta: false, vecchio: false, rifai: null });
    // la prima lezione di nuovo, con il periodo (per i nomi nei messaggi): una
    // lezione spostata sta nella sua settimana solo dove Campanella metteva lezioni
    if (v.serie) _orariPrimaLezione_(v, periodo, fuso);
  }
  for (var k = 0; k < nostri.length; k++) {
    var w = nostri[k];
    if (_orariSerieSostituita_(segni[k], ids) >= 0) continue;     // un pezzo: qui sotto
    if (w.ultimo < validoDal) { cose[k].resta = true; continue; }
    if (!w.serie || !w.contrassegno) continue;
    var r = _orariRifacimento_(w, validoDal, fino, fuso);
    if (!r.prima) continue;                                      // nessuna lezione prima del cambio: si toglie
    r.segno = ids[k] + '|' + giorno;
    cose[k].rifai = r;
  }
  for (var p = 0; p < nostri.length; p++) {
    var vecchia = _orariSerieSostituita_(segni[p], ids);
    if (vecchia < 0) continue;
    var rv = cose[vecchia].rifai, x = nostri[p];
    if (rv && segni[p] === rv.segno) {
      if (x.serie && !rv.idNuova) {
        rv.idNuova = ids[p];
        rv.buchi = _orariBuchiAncoraDa_(rv.buchi, x);
        cose[p].resta = true;
        continue;
      }
      var fatta = x.evento ? _orariSpostataRimessa_(rv.spostate, x) : -1;
      if (fatta >= 0) {
        rv.spostate.splice(fatta, 1);
        cose[p].resta = true;
        continue;
      }
    }
    cose[p].vecchio = true;
  }
  var ordine = [], dopo = [];
  for (var q = 0; q < nostri.length; q++) {
    if (cose[q].vecchio) ordine.push(q);
    else dopo.push(q);
  }
  return { cose: cose, ordine: ordine.concat(dopo) };
}

/**
 * Come rifare fino al giorno prima del cambio (fino) una serie con lezioni
 * prima del validoDal e dopo. prima: quante lezioni ha prima del validoDal,
 * come le vede chi guarda il calendario. Quelle regolari (con la forma della
 * serie, voce.forma di _orariPrimaLezione_, con il titolo della serie e con
 * la descrizione, il luogo e il colore piu' frequenti fra le sue lezioni,
 * come la forma) fanno la serie nuova, con il titolo, la descrizione e il
 * luogo della vecchia: dalla prima (inizio, fine) ogni settimana alla stessa
 * ora nel fuso dello script, come la ripete Google in un calendario con quel
 * fuso. buchi: le settimane della serie nuova in cui la vecchia non ha una
 * lezione regolare (cancellata, spostata, rinominata, annotata o colorata a
 * mano), da togliere. spostate: le lezioni prima del validoDal non regolari
 * (spostate, o con il titolo, la descrizione, il luogo o il colore cambiati a
 * mano solo per loro, come una nota "VERIFICA", o una seconda alla stessa
 * ora), da rimettere come eventi singoli alla loro ora, come sono (titolo,
 * descrizione, luogo e colore loro). coloreDiTutte: il colore piu' frequente
 * fra le lezioni, quello della serie come lo da' Google lezione per lezione.
 */
function _orariRifacimento_(voce, validoDal, fino, fuso) {
  var titolo = voce.titolo;
  try { titolo = String(voce.serie.getTitle() || '') || voce.titolo; } catch (e) { titolo = voce.titolo; }
  var luogo = '';
  try { luogo = String(voce.serie.getLocation() || ''); } catch (e2) { luogo = ''; }
  var r = { prima: 0, inizio: null, fine: null, titolo: titolo, descrizione: voce.descrizione, luogo: luogo,
            coloreDiTutte: '', buchi: [], spostate: [], idNuova: '', segno: '' };
  // la descrizione, il luogo e il colore di tutta la serie: i piu' frequenti
  // fra le sue lezioni (non quelli della serie, che potrebbero essere scritti
  // in un altro modo e farebbero di ogni lezione un evento singolo)
  var descrizioni = [], luoghi = [], colori = [];
  for (var h = 0; h < voce.lezioni.length; h++) {
    descrizioni.push(_orariDescrizioneDi_(voce.lezioni[h]));
    luoghi.push(_orariLuogoDi_(voce.lezioni[h]));
    colori.push(_orariColoreDellaLezione_(voce.lezioni[h]));
  }
  var descrizioneDiTutte = _orariPiuFrequente_(descrizioni, voce.descrizione);
  var luogoDiTutte = _orariPiuFrequente_(luoghi, luogo);
  r.coloreDiTutte = _orariPiuFrequente_(colori, '');
  var regolari = [];
  for (var i = 0; i < voce.lezioni.length; i++) {
    var l = voce.lezioni[i];
    if (l.inizio >= validoDal) continue;
    r.prima++;
    if (_orariForma_(l, fuso) === voce.forma && _orariTitoloDi_(l) === r.titolo && descrizioni[i] === descrizioneDiTutte &&
        luoghi[i] === luogoDiTutte && colori[i] === r.coloreDiTutte) regolari.push(l);
    else r.spostate.push(l);
  }
  if (!regolari.length) return r;
  var p = regolari[0].inizio;
  r.inizio = p;
  r.fine = regolari[0].fine;
  var j = 0;
  for (var k = 0; ; k++) {
    var t = new Date(p.getFullYear(), p.getMonth(), p.getDate() + 7 * k, p.getHours(), p.getMinutes(), p.getSeconds());
    if (t > fino) break;
    // una regolare che non cade in una settimana della serie (una seconda alla stessa ora): a parte
    while (j < regolari.length && regolari[j].inizio < t) {
      r.spostate.push(regolari[j]);
      j++;
    }
    if (j < regolari.length && regolari[j].inizio.getTime() === t.getTime()) j++;
    else r.buchi.push(t);
  }
  for (; j < regolari.length; j++) r.spostate.push(regolari[j]);
  return r;
}

/** Il contrassegno "sostituisce" di una voce di _orariNostri_ ("id|giorno"), '' se non c'e'. */
function _orariSegnoDi_(voce) {
  var s = '';
  try {
    s = String((voce.serie ? voce.serie.getTag(_ORARI_TAG_SOSTITUISCE)
                           : voce.evento.getTag(_ORARI_TAG_SOSTITUISCE)) || '');
  } catch (e) { s = ''; }
  return s;
}

/** L'indice, fra gli id delle serie trovate, della serie vecchia che un pezzo sostituisce; -1 se non c'e' (piu'). */
function _orariSerieSostituita_(segno, ids) {
  if (!segno) return -1;
  return ids.indexOf(String(segno).split('|')[0]);
}

/** Le settimane da togliere che la serie nuova gia' fatta ha ancora (quelle gia' tolte non contano). */
function _orariBuchiAncoraDa_(buchi, nuova) {
  var restano = [];
  for (var i = 0; i < buchi.length; i++) {
    for (var j = 0; j < nuova.lezioni.length; j++) {
      if (nuova.lezioni[j].inizio.getTime() === buchi[i].getTime()) {
        restano.push(buchi[i]);
        break;
      }
    }
  }
  return restano;
}

/** Fra le lezioni spostate da rimettere, quella gia' rimessa come questo evento singolo (alla stessa ora): indice o -1. */
function _orariSpostataRimessa_(spostate, evento) {
  for (var i = 0; i < spostate.length; i++) {
    if (spostate[i].inizio.getTime() === evento.inizio.getTime() &&
        spostate[i].fine.getTime() === evento.fine.getTime()) return i;
  }
  return -1;
}

/** Il titolo di una lezione di _orariNostri_, come lo vede chi guarda il calendario. */
function _orariTitoloDi_(lezione) {
  try { return String(lezione.evento.getTitle() || ''); } catch (e) { return ''; }
}

/** La descrizione di una lezione di _orariNostri_, come la vede chi guarda il calendario. */
function _orariDescrizioneDi_(lezione) {
  try { return String(lezione.evento.getDescription() || ''); } catch (e) { return ''; }
}

/** Il luogo di una lezione di _orariNostri_ ('' se non c'e'): Campanella non lo mette, il docente si'. */
function _orariLuogoDi_(lezione) {
  try { return String(lezione.evento.getLocation() || ''); } catch (e) { return ''; }
}

/** Il testo piu' frequente di un elenco; a parita' il preferito, se c'e' fra quelli, se no il primo. */
function _orariPiuFrequente_(valori, preferito) {
  var scelto = '', quante = 0;
  for (var i = 0; i < valori.length; i++) {
    var n = 0;
    for (var j = 0; j < valori.length; j++) if (valori[j] === valori[i]) n++;
    if (n > quante || (n === quante && valori[i] === preferito && scelto !== preferito)) {
      scelto = valori[i];
      quante = n;
    }
  }
  return scelto;
}

/** (1) del taglio: la serie nuova, come la vecchia (titolo, descrizione e luogo), dalla prima lezione regolare a fino. */
function _orariSerieRifatta_(cal, r, fino) {
  var ricorrenza = CalendarApp.newRecurrence().addWeeklyRule().until(fino);
  var opzioni = { description: r.descrizione };
  if (r.luogo) opzioni.location = r.luogo;
  return cal.createEventSeries(r.titolo, r.inizio, r.fine, ricorrenza, opzioni);
}

/**
 * (3) del taglio: una lezione spostata, rinominata o annotata a mano, come
 * evento singolo alla sua ora, con titolo, descrizione e luogo.
 */
function _orariLezioneRifatta_(cal, lezione) {
  var opzioni = { description: _orariDescrizioneDi_(lezione) };
  var luogo = _orariLuogoDi_(lezione);
  if (luogo) opzioni.location = luogo;
  return cal.createEvent(_orariTitoloDi_(lezione), lezione.inizio, lezione.fine, opzioni);
}

/**
 * (2) del taglio: toglie dalla serie nuova di un rifacimento (id) la lezione
 * che comincia a inizio, in una settimana in cui la serie vecchia non aveva
 * la lezione regolare. La cerca fra quelle di Campanella a quell'ora, solo
 * nella serie con quell'id e con il contrassegno: deleteEvent su una lezione
 * di una serie toglie solo quella (provato dal vivo), e la serie resta. Vero
 * se l'ha tolta.
 */
function _orariTogliBuco_(cal, id, inizio) {
  var nostri = _orariNostri_(cal, inizio, new Date(inizio.getTime() + 60 * 1000));
  for (var i = 0; i < nostri.length; i++) {
    var voce = nostri[i];
    if (!_orariSerieConId_(voce, id)) continue;
    for (var j = 0; j < voce.lezioni.length; j++) {
      var lezione = voce.lezioni[j];
      if (lezione.inizio.getTime() !== inizio.getTime()) continue;
      lezione.evento.deleteEvent();
      return true;
    }
  }
  return false;
}

/** Vero se la voce di _orariNostri_ e' la serie con quell'id, con il contrassegno. */
function _orariSerieConId_(voce, id) {
  return !!id && !!voce.serie && !!voce.contrassegno && String(voce.serie.getId()) === String(id);
}

/**
 * La ripresa di un taglio fermato subito dopo aver creato un pezzo (la serie
 * nuova o un evento singolo), prima che Google ne salvasse i contrassegni:
 * lo ritrova fra gli eventi all'ora della sua prima lezione, con l'id salvato
 * in stato.appenaCreato (pezzo), e glieli rimette. Senza, il taglio non lo
 * riconoscerebbe e lo rifarebbe (lezioni doppie). Lo cerca fra tutti, non
 * solo fra quelli di Campanella: il pezzo copia la descrizione della serie
 * vecchia, o della lezione, che il docente puo' aver riscritto (senza
 * [Campanella] in testa), e senza contrassegno _orariNostri_ non lo
 * vedrebbe. L'id, preso proprio da quello appena creato, basta: e' suo. False
 * se non l'ha ritrovato.
 */
function _orariRimettiContrassegniAlPezzo_(cal, pezzo) {
  var aQuellOra = cal.getEvents(new Date(pezzo.inizio), new Date(pezzo.inizio + 60 * 1000));
  // il pezzo di un colloquio ha il contrassegno dei colloqui
  var valore = pezzo.colloquio ? _ORARI_TAG_COLLOQUIO : _ORARI_TAG_VALORE;
  for (var i = 0; i < aQuellOra.length; i++) {
    var ev = aQuellOra[i];
    if (!_orariEventoDelPezzo_(ev, pezzo.id)) continue;
    if (ev.isRecurringEvent()) {
      var serie = ev.getEventSeries();
      serie.setTag(_ORARI_TAG, valore);
      serie.setTag(_ORARI_TAG_SOSTITUISCE, pezzo.segno);
    } else {
      ev.setTag(_ORARI_TAG, valore);
      ev.setTag(_ORARI_TAG_SOSTITUISCE, pezzo.segno);
    }
    return true;
  }
  return false;
}

/**
 * Vero se l'evento trovato e' il pezzo con quell'id: una lezione della serie
 * con quell'id (getEventSeries().getId(), come la serie appena creata), o
 * l'evento singolo con quell'id.
 */
function _orariEventoDelPezzo_(ev, id) {
  var suo = '';
  try { suo = ev.isRecurringEvent() ? ev.getEventSeries().getId() : ev.getId(); } catch (e) { suo = ''; }
  return !!id && !!suo && String(suo) === String(id);
}

/** Per il messaggio finale del cambio: un pezzo appena rifatto che la ripresa non ha ritrovato (inizio in ms). */
function _orariPezzoNonRitrovato_(stato, inizio) {
  if (!stato.pezziNonRitrovati) stato.pezziNonRitrovati = [];
  var g = new Date(inizio);
  var hh = g.getHours(), mm = g.getMinutes();
  if (stato.pezziNonRitrovati.length < 10) {
    stato.pezziNonRitrovati.push(_orariChiaveData_(g) + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm);
  }
  stato.nPezziNonRitrovati = (stato.nPezziNonRitrovati || 0) + 1;
}

/** Per il messaggio finale del cambio: i pezzi appena rifatti che la ripresa non ha ritrovato, con il rimedio. */
function _orariAvvisoPezziNonRitrovati_(stato) {
  var n = stato.nPezziNonRitrovati || 0;
  if (!n) return '';
  var una = (n === 1);
  return '\n\nAttenzione: il lavoro si era fermato appena dopo aver rifatto ' + (una ? 'la lezione' : 'le lezioni') +
    ' del ' + stato.pezziNonRitrovati.join(', ') + (n > stato.pezziNonRitrovati.length ? ', ...' : '') + ' (e le ' +
    'settimane dopo, se era una serie), prima di darle il contrassegno di Campanella, e alla ripresa non ' +
    (una ? 'l\'ho ritrovata' : 'le ho ritrovate') + ' a quell\'ora: ' + (una ? 'l\'ho rifatta' : 'le ho rifatte') +
    '. Se adesso una lezione compare due volte, cancellane una tu da Google Calendar (se e\' di una serie, tutti ' +
    'gli eventi di quella serie).';
}

/**
 * Prima di dimenticare un cambio d'orario a meta' (DatiOrari.gs cambiato):
 * il pezzo appena rifatto senza contrassegni (stato.appenaCreato) li
 * riceve, se lo ritrovo; cosi' il cambio rifatto da capo lo riconosce. '' se
 * non c'era o l'ho sistemato, altrimenti l'avviso per il messaggio.
 */
function _orariPezzoAppenaRifatto_(salvato, c) {
  if (!salvato || !salvato.appenaCreato) return '';
  try {
    var cal = _orariTrovaCalendario_(c.nome);
    if (cal && _orariRimettiContrassegniAlPezzo_(cal, salvato.appenaCreato)) return '';
  } catch (err) { /* sotto l'avviso */ }
  var g = new Date(salvato.appenaCreato.inizio);
  return '\nAttenzione: il lavoro si era fermato appena dopo aver rifatto la lezione del ' + _orariChiaveData_(g) +
    ' (e le settimane dopo, se era una serie), prima di darle il contrassegno di Campanella, e non sono riuscito a ' +
    'darglielo. Se dopo il cambio quella lezione compare due volte, cancellane una tu da Google Calendar.';
}

/** Una serie del piano: dalla prima lezione del tratto, ogni settimana fino all'ultima compresa. */
function _orariCreaSerie_(cal, voce, c, d, doc) {
  var primo = _orariData_(voce.dal);
  var ultimo = _orariFineGiornata_(_orariData_(voce.al));
  var da = _orariOraDel_(primo, c.inizioOre, voce.blocco.oraDa, c.minutiOra, false);
  var a  = _orariOraDel_(primo, c.inizioOre, voce.blocco.oraA,  c.minutiOra, true);
  var ricorrenza = CalendarApp.newRecurrence().addWeeklyRule().until(ultimo);
  return cal.createEventSeries(voce.blocco.testo, da, a, ricorrenza,
                               { description: _orariDescrizione_(doc.nome, voce.blocco, d, voce.dal) });
}

/**
 * Un colloquio del piano (_orariPianoColloqui_): il ricevimento di un tratto
 * di settimane come serie, dal primo incontro ogni settimana fino all'ultimo
 * compreso, o la giornata singola come evento singolo. Il titolo e' il nome,
 * il luogo il link (se c'e'), la descrizione quella dei colloqui.
 */
function _orariCreaColloquio_(cal, voce, doc) {
  var primo = _orariData_(voce.dal);
  var da = _orariAlleOre_(primo, voce.dalle);
  var a = _orariAlleOre_(primo, voce.alle);
  var opzioni = { description: _orariDescrizioneColloquio_(doc.nome, voce) };
  if (voce.link) opzioni.location = voce.link;
  if (voce.singolo) return cal.createEvent(voce.nome, da, a, opzioni);
  var ricorrenza = CalendarApp.newRecurrence().addWeeklyRule().until(_orariFineGiornata_(_orariData_(voce.al)));
  return cal.createEventSeries(voce.nome, da, a, ricorrenza, opzioni);
}

/**
 * Come _orariTrattoFatto_, per un colloquio appena creato da
 * _orariCreaColloquio_: se Google non gli salva il contrassegno, la ripresa
 * lo ritrova (_orariSerieDelTratto_) e glielo rimette, con il valore dei
 * colloqui. Una giornata singola (singolo) si ritrova anche dall'ora di fine.
 */
function _orariColloquioFatto_(voce, doc) {
  var primo = _orariData_(voce.dal);
  return { dal: voce.dal, al: voce.al, titolo: voce.nome, colloquio: true, singolo: voce.singolo,
           inizio: _orariAlleOre_(primo, voce.dalle).getTime(), fine: _orariAlleOre_(primo, voce.alle).getTime(),
           descrizione: _orariDescrizioneColloquio_(doc.nome, voce) };
}

/**
 * La descrizione di un colloquio: comincia con _ORARI_INIZIO_COLLOQUI (senza
 * contrassegno lo si riconosce da li'), dice di chi e', quando e il link, e
 * per una serie il giorno del primo incontro ("serie dal 2026-10-15"), che
 * _orariPrimaLezione_ rilegge come per le lezioni.
 */
function _orariDescrizioneColloquio_(docente, voce) {
  var nomi = ['domenica', 'lunedi\'', 'martedi\'', 'mercoledi\'', 'giovedi\'', 'venerdi\'', 'sabato'];
  var giorno = nomi[_orariData_(voce.dal).getDay()];
  return _ORARI_INIZIO_COLLOQUI + ' con le famiglie, di ' + docente + ': ' + voce.nome + ', ' +
         (voce.singolo ? giorno + ' ' + voce.dal : 'ogni ' + giorno) + ' dalle ' + voce.dalle + ' alle ' + voce.alle +
         (voce.singolo ? '' : ', serie dal ' + voce.dal) +
         (voce.link ? '. Link: ' + voce.link : '') +
         '. Le prenotazioni restano nel registro elettronico.';
}

/** Il giorno (a mezzanotte) all'ora "hh:mm", nel fuso dello script. */
function _orariAlleOre_(giorno, hhmm) {
  var t = new Date(giorno.getTime());
  t.setHours(_orariMinutiDi_(hhmm) / 60 | 0, _orariMinutiDi_(hhmm) % 60, 0, 0);
  return t;
}

/**
 * Quello che serve per ritrovare la serie di un tratto del piano appena
 * creata da _orariCreaSerie_, se Google non le salva il contrassegno: le
 * date del tratto, il titolo, l'inizio della prima lezione e la descrizione.
 */
function _orariTrattoFatto_(voce, c, d, doc) {
  var primo = _orariData_(voce.dal);
  return { dal: voce.dal, al: voce.al, titolo: voce.blocco.testo,
           inizio: _orariOraDel_(primo, c.inizioOre, voce.blocco.oraDa, c.minutiOra, false).getTime(),
           descrizione: _orariDescrizione_(doc.nome, voce.blocco, d, voce.dal) };
}

/**
 * Rimette il contrassegno alla serie di un tratto (_orariTrattoFatto_) a cui
 * Google non l'ha salvato. La cerca fra quelle di Campanella nelle date del
 * tratto (_orariNostri_), e la tocca solo se ce n'e' una sola uguale
 * (_orariSerieDelTratto_): con due, una e' una copia fatta a mano, e non si
 * sceglie. False se non l'ha ritrovata, o ce n'erano due.
 */
function _orariRimettiContrassegno_(cal, tratto) {
  var nostri = _orariNostri_(cal, _orariData_(tratto.dal), _orariFineGiornata_(_orariData_(tratto.al)));
  var uguali = 0;
  for (var k = 0; k < nostri.length; k++) if (_orariSerieDelTratto_(nostri[k], tratto)) uguali++;
  if (uguali !== 1) return false;
  for (var i = 0; i < nostri.length; i++) {
    var voce = nostri[i];
    if (!_orariSerieDelTratto_(voce, tratto)) continue;
    // la giornata singola di un colloquio e' un evento singolo
    if (tratto.singolo) voce.evento.setTag(_ORARI_TAG, _ORARI_TAG_COLLOQUIO);
    else if (tratto.colloquio) voce.serie.setTag(_ORARI_TAG, _ORARI_TAG_COLLOQUIO);
    else voce.serie.setTag(_ORARI_TAG, _ORARI_TAG_VALORE);
    return true;
  }
  return false;
}

/**
 * Vero se la voce di _orariNostri_ e' la serie del tratto come l'ha creata
 * Campanella: una serie, con lo stesso titolo, la stessa descrizione e la
 * prima lezione proprio all'inizio del tratto (appena creata, nessuno l'ha
 * ancora spostata). La giornata singola di un colloquio (tratto.singolo) e'
 * un evento singolo, con la descrizione dei colloqui, lo stesso titolo e la
 * stessa ora di inizio e di fine.
 */
function _orariSerieDelTratto_(voce, tratto) {
  if (tratto.singolo) {
    return !!voce.evento && voce.colloquio === true && voce.titolo === tratto.titolo &&
           voce.inizio.getTime() === tratto.inizio && voce.fine.getTime() === tratto.fine;
  }
  return !!voce.serie && voce.titolo === tratto.titolo && voce.descrizione === tratto.descrizione &&
         voce.inizio.getTime() === tratto.inizio;
}

/** "2B, lunedi' 09:00, dal 2027-02-22": la serie di un tratto nei messaggi. */
function _orariEtichettaDelTratto_(tratto) {
  return _orariEtichetta_({ titolo: tratto.titolo, inizio: new Date(tratto.inizio) });
}

/** Per l'errore di un cambio d'orario rifatto da capo: le serie rimaste senza contrassegno, da togliere a mano. */
function _orariAvvisoDaContrassegnare_(stato) {
  var n = (stato && stato.daContrassegnare) ? stato.daContrassegnare.length : 0;
  if (!n) return '';
  var nomi = [], una = (n === 1);
  for (var i = 0; i < n; i++) nomi.push(_orariEtichettaDelTratto_(stato.daContrassegnare[i]));
  return '\nAttenzione: Google non aveva salvato il contrassegno ' + (una ? 'della serie' : 'delle serie') + ' ' +
    nomi.join('; ') + ', appena ' + (una ? 'messa' : 'messe') + '. Il cambio d\'orario rifa\' e toglie solo le ' +
    'serie con il contrassegno: prima di rieseguirlo ' + (una ? 'cancellala' : 'cancellale') + ' tu da Google ' +
    'Calendar (tutti gli eventi della serie; se ce ne sono due uguali, tutte e due), altrimenti quelle lezioni ' +
    'comparirebbero due volte.';
}

/**
 * Per il messaggio finale di ORARI_4_calendario, ORARI_5_cambioOrario e
 * ORARI_7_colloqui: le serie a cui Google non ha salvato il contrassegno e
 * che non ho ritrovato per rimetterlo, con il rimedio (cambio: la funzione
 * che le rimette, rieseguita; false per ORARI_4_calendario). "" se non ce ne sono.
 */
function _orariAvvisoNonRitrovate_(stato, cambio) {
  var n = stato.nNonRitrovate || 0;
  if (!n) return '';
  var una = (n === 1);
  return '\n\nAttenzione: Google non ha salvato il contrassegno di ' + (una ? 'una serie' : n + ' serie') + ', e ' +
    'non sono riuscito a rimetterlo (non ' + (una ? 'l\'ho ritrovata' : 'le ho ritrovate') + ', o ce n\'erano due ' +
    'uguali): ' + stato.nonRitrovate.join('; ') + (n > stato.nonRitrovate.length ? '; ...' : '') + '. Il cambio ' +
    'd\'orario rifa\' e toglie solo le serie con il contrassegno: dopo un cambio quelle lezioni comparirebbero ' +
    'due volte. ' +
    (cambio
      ? 'Per sistemare: ' + (una ? 'cancellala' : 'cancellale') + ' tu da Google Calendar (tutti gli eventi della ' +
        'serie; se ce ne sono due uguali, tutte e due), poi riesegui ' + cambio + ' con lo stesso ' +
        'DatiOrari.gs, che ' + (una ? 'la' : 'le') + ' rimette con il contrassegno.'
      : 'Per sistemare: ORARI_ANNULLA_calendario, poi di nuovo ORARI_4_calendario.');
}

/**
 * Un lavoro sul calendario si ferma prima della fine: per il tempo massimo
 * o per un limite di Google riprende da solo fra un minuto; per il limite
 * della giornata, o se Google rifiuta ancora dopo tante riprese, aspetta che
 * lo riesegua il docente. Il punto resta salvato in ogni caso.
 */
function _orariCalendarioInterrotto_(funzione, stato, piano, motivo, salva) {
  var colloqui = piano.colloqui.voci.length;
  var dove = (stato.fase === 'taglio')
    ? (funzione === _ORARI_TRIGGER_COLLOQUI
        ? 'mentre rifacevo i colloqui di prima, fino al giorno prima dell\'aggiornamento: ' + stato.rifatte +
          ' serie rifatte e ' + stato.tolte + ' tolte'
        : 'mentre rifacevo l\'orario di prima fino al giorno prima del cambio: ' + stato.rifatte + ' serie rifatte e ' +
          stato.tolte + ' tolte')
    : (piano.serie.length || !colloqui ? stato.fatti + ' serie messe su ' + piano.serie.length : '') +
      (piano.serie.length && colloqui ? ', ' : '') +
      (colloqui ? stato.colloquiFatti + ' colloqui messi su ' + colloqui : '');
  return _orariInterrotto_(funzione, dove, stato, motivo, salva);
}

/**
 * Per _orariCalendarioInterrotto_ e ORARI_6_coloraLezioni: il lavoro della
 * funzione si ferma a un certo punto (dove, per il messaggio), per il tempo
 * massimo o per un limite di Google (motivo). Riprende da solo, oppure
 * aspetta che lo riesegua il docente; stato.rifiuti conta i limiti di fila.
 */
function _orariInterrotto_(funzione, dove, stato, motivo, salva) {
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
  return (stato.creato ? 'Creato il calendario "' + c.nome + '", con il fuso orario ' + Session.getScriptTimeZone() + '.\n'
                       : 'Uso il calendario "' + c.nome + '".\n') + _orariAvvisoFuso_(stato) +
    'Orario di ' + doc.nome + ': ' + piano.serie.length + ' serie settimanali dal ' + c.inizio + ' al ' + c.fine +
    ' (' + piano.lezioni + ' lezioni).\n' +
    'Giorni senza lezione: ' + _orariSospensioniNelPeriodo_(periodo) + ' (giorni o periodi).\n' +
    'Lezioni saltate nei giorni senza lezione: ' + piano.saltate + '.' +
    (piano.blocchiFuori ? '\nSaltati ' + piano.blocchiFuori + ' blocchi (giorno non riconosciuto o fuori dal periodo).' : '') +
    '\n' + _orariRigaColori_(c, _orariClassiDelPiano_(piano)) +
    '\n' + _orariRigaColloqui_(c, piano.colloqui, 'messi') +
    '\n\nSe l\'orario cambia a meta\' anno, ORARI_5_cambioOrario lo cambia dalla data che scegli e lascia ' +
    'le settimane prima; se cambiano solo i colloqui, ORARI_7_colloqui li aggiorna da oggi. Le prenotazioni dei ' +
    'genitori restano nel registro elettronico. Se qualcosa non va, ORARI_ANNULLA_calendario toglie solo questi ' +
    'eventi e lascia il resto del calendario com\'e\'.' + _orariAvvisoNonRitrovate_(stato, false) +
    _orariAvvisoColori_(stato);
}

/**
 * Per i messaggi finali: il fuso del calendario, se l'ho cambiato, e se la
 * prova sulla prima serie che passa un cambio dell'ora dice che le lezioni
 * restano alla loro ora. "" se non l'ho cambiato.
 */
function _orariAvvisoFuso_(stato) {
  if (!stato.fusoDiPrima) return '';
  return 'Il calendario aveva il fuso orario ' + stato.fusoDiPrima + ': gli ho messo ' + Session.getScriptTimeZone() +
    ', quello dello script, perche\' le lezioni restino alla loro ora anche dopo il cambio dell\'ora' +
    (stato.fusoProvato ? ' (controllato: in una serie che lo passa, tutte le lezioni sono alla stessa ora)' : '') + '.\n';
}

/** Il messaggio finale del cambio d'orario. validoDal e' la data vera del cambio, mai prima dell'inizio. */
function _orariFineCambio_(c, doc, piano, stato, validoDal) {
  var dal = _orariChiaveData_(validoDal);
  var giornoPrima = _orariChiaveData_(new Date(validoDal.getFullYear(), validoDal.getMonth(), validoDal.getDate() - 1));
  var primaDellInizio = (_orariData_(c.validoDal) < validoDal);
  var niente = (stato.rifatte + stato.tolte + stato.eventiTolti === 0);
  var rimesse = stato.rimesse || 0, senzaContrassegno = stato.nSenzaContrassegno || 0;
  return 'Cambio d\'orario dal ' + dal + ' nel calendario "' + c.nome + '", per ' + doc.nome + '.\n' +
    _orariAvvisoFuso_(stato) +
    (primaDellInizio ? 'La data scritta in DatiOrari.gs, ' + c.validoDal + ', viene prima dell\'inizio del periodo: ' +
                       'l\'orario nuovo vale da tutto il periodo, dal ' + c.inizio + '. Quello che c\'e\' prima ' +
                       'dell\'inizio (per esempio l\'anno scorso, nello stesso calendario) non l\'ho toccato.\n' : '') +
    'Serie dell\'orario di prima rifatte fino al ' + giornoPrima + ', con le lezioni come erano: ' + stato.rifatte + '\n' +
    'Serie dell\'orario di prima tolte (nessuna lezione prima del ' + dal + '): ' + stato.tolte + '\n' +
    (stato.eventiTolti ? 'Eventi singoli tolti (dal ' + dal + ' in poi): ' + stato.eventiTolti + '\n' : '') +
    (rimesse ? 'Lezioni spostate, rinominate, annotate o colorate a mano, rimesse come eventi singoli alla loro ora: ' + rimesse + ' - ' +
               stato.spostate.join('; ') + (rimesse > stato.spostate.length ? '; ...' : '') + '\n' : '') +
    'Serie dell\'orario nuovo create: ' + piano.serie.length + ' (' + piano.lezioni + ' lezioni, fino al ' +
    c.fine + ')\n' +
    'Lezioni saltate nei giorni senza lezione: ' + piano.saltate + '\n' +
    _orariRigaColori_(c, _orariClassiDelPiano_(piano)) + '\n' +
    _orariRigaColloqui_(c, piano.colloqui, 'dal ' + dal) + '\n' +
    (senzaContrassegno ? '\nSerie o lezioni singole con la descrizione di Campanella ma senza contrassegno, forse ' +
                         'copiate a mano: ' +
                         'non le ho toccate, controllale tu (' + senzaContrassegno + '): ' +
                         stato.senzaContrassegno.join('; ') +
                         (senzaContrassegno > stato.senzaContrassegno.length ? '; ...' : '') + '\n' : '') +
    (niente ? '\nNon ho trovato niente da rifare o togliere: forse ORARI_4_calendario non era mai stato ' +
              'eseguito su questo calendario. L\'orario nuovo c\'e\' lo stesso, dal ' + dal + '.\n' : '') +
    '\nLe settimane prima del ' + dal + ' restano come erano, con le lezioni spostate o cancellate a mano. ' +
    'Google non lascia accorciare una serie: quelle con lezioni prima del cambio le ho rifatte fino al ' +
    giornoPrima + ' (le lezioni spostate a mano, o con il titolo, la descrizione o il luogo cambiati solo per loro, ' +
    'come eventi singoli) e poi ho tolto le vecchie. Le serie rifatte hanno il colore della loro classe (se in ' +
    'DatiOrari.gs non ne ha uno, quello della serie vecchia), e le lezioni colorate a mano solo loro il loro. ' +
    'Altre modifiche fatte a mano a una serie vecchia, come un promemoria, non sono passate a quella rifatta: se ' +
    'ne avevi fatte, rifalle.\nSe l\'orario cambia di nuovo, rigenera DatiOrari.gs con la nuova data ' +
    'e riesegui ORARI_5_cambioOrario.' + _orariAvvisoPezziNonRitrovati_(stato) +
    _orariAvvisoNonRitrovate_(stato, _ORARI_TRIGGER_CAMBIO) +
    _orariAvvisoColori_(stato);
}

/** Il messaggio finale di ORARI_7_colloqui. validoDal e' il giorno da cui li ha aggiornati, mai prima dell'inizio. */
function _orariFineColloqui_(c, doc, piano, stato, validoDal) {
  var dal = _orariChiaveData_(validoDal);
  var giornoPrima = _orariChiaveData_(new Date(validoDal.getFullYear(), validoDal.getMonth(), validoDal.getDate() - 1));
  var rimesse = stato.rimesse || 0, senzaContrassegno = stato.nSenzaContrassegno || 0;
  return 'Colloqui aggiornati dal ' + dal + ' nel calendario "' + c.nome + '", per ' + doc.nome + '.\n' +
    _orariAvvisoFuso_(stato) +
    'Ricevimenti di prima rifatti fino al ' + giornoPrima + ', con gli incontri come erano: ' + stato.rifatte + '\n' +
    'Ricevimenti di prima tolti (nessun incontro prima del ' + dal + '): ' + stato.tolte + '\n' +
    'Giornate di colloqui tolte (dal ' + dal + ' in poi): ' + stato.eventiTolti + '\n' +
    (rimesse ? 'Incontri spostati, rinominati, annotati o colorati a mano, rimessi come eventi singoli alla loro ' +
               'ora: ' + rimesse + ' - ' + stato.spostate.join('; ') +
               (rimesse > stato.spostate.length ? '; ...' : '') + '\n' : '') +
    _orariRigaColloqui_(c, piano.colloqui, 'dal ' + dal) + '\n' +
    (senzaContrassegno ? '\nColloqui con la descrizione di Campanella ma senza contrassegno, forse copiati a mano: ' +
                         'non li ho toccati, controllali tu (' + senzaContrassegno + '): ' +
                         stato.senzaContrassegno.join('; ') +
                         (senzaContrassegno > stato.senzaContrassegno.length ? '; ...' : '') + '\n' : '') +
    '\nLe lezioni non le ho toccate, e i colloqui prima del ' + dal + ' restano come erano. Le prenotazioni dei ' +
    'genitori restano nel registro elettronico: qui ci sono solo il giorno, l\'ora e il link.' +
    _orariAvvisoPezziNonRitrovati_(stato) + _orariAvvisoNonRitrovate_(stato, _ORARI_TRIGGER_COLLOQUI) +
    _orariAvvisoColori_(stato);
}

/** "3A, mercoledi' 2026-09-16 15:00": una lezione spostata a mano, nei messaggi. */
function _orariEtichettaLezione_(lezione) {
  var g = lezione.inizio;
  var nomi = ['domenica', 'lunedi\'', 'martedi\'', 'mercoledi\'', 'giovedi\'', 'venerdi\'', 'sabato'];
  var hh = g.getHours(), mm = g.getMinutes();
  return _orariTitoloDi_(lezione) + ', ' + nomi[g.getDay()] + ' ' + _orariChiaveData_(g) + ' ' +
         (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

/**
 * Toglie gli eventi messi da Campanella nel periodo di DatiOrari.gs, lezioni e
 * colloqui. Con tante serie puo' finire il tempo, o Google puo' chiedere di
 * rallentare: si ferma, dice quanti ne ha tolti e di rieseguirlo (rieseguito, ritrova solo
 * quelli che restano). Non si riprogramma da solo: e' il docente che toglie.
 * Un cambio d'orario fermato appena dopo aver rifatto un pezzo (la serie
 * nuova o un evento singolo), prima che Google ne salvasse i contrassegni,
 * ha l'id del pezzo nel punto salvato (appenaCreato): prima di cercare gli
 * eventi di Campanella gli rimette i contrassegni, come la ripresa
 * (_orariRimettiContrassegniAlPezzo_), cosi' si toglie con il resto anche
 * se la sua descrizione, copiata da una serie o da una lezione riscritta a
 * mano, non comincia con [Campanella]. Se non lo ritrova, il messaggio lo
 * dice, con la data, e dice di cancellarlo a mano.
 */
function _orariAnnullaCalendario_() {
  // prima il lavoro a meta' e le sue riprese: cosi' nessuna ripresa rimette
  // quello che tolgo, anche se qui sotto qualcosa va storto. Del lavoro
  // resta qui solo il pezzo appena rifatto (vedi sopra)
  var prop = PropertiesService.getUserProperties();
  var aMeta = !!prop.getProperty(_ORARI_CHIAVE_CALENDARIO) || !!prop.getProperty(_ORARI_CHIAVE_COLORI);
  var lavoro = _orariLavoroCalendario_();
  prop.deleteProperty(_ORARI_CHIAVE_CALENDARIO);
  prop.deleteProperty(_ORARI_CHIAVE_COLORI);
  _togliTriggerOrari_(_ORARI_TRIGGER_CALENDARIO);
  _togliTriggerOrari_(_ORARI_TRIGGER_CAMBIO);
  _togliTriggerOrari_(_ORARI_TRIGGER_COLORI);
  _togliTriggerOrari_(_ORARI_TRIGGER_COLLOQUI);
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
  // il pezzo appena rifatto senza contrassegni: con quelli _orariNostri_ lo
  // vede, e si toglie con il resto; se non lo ritrovo (o Google rifiuta), lo dico
  var pezzo = '';
  if (lavoro && lavoro.appenaCreato) {
    var ritrovato = false, rifiutato = false;
    try { ritrovato = _orariRimettiContrassegniAlPezzo_(cal, lavoro.appenaCreato); } catch (err0) { rifiutato = true; }
    if (!ritrovato) pezzo = _orariAvvisoPezzoDaCancellare_(lavoro.appenaCreato.inizio, rifiutato);
  }

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
            ': toglie quelli che restano.' + nota + pezzo;
  } else {
    testo = 'Tolti ' + tolti + ' eventi messi da Campanella dal calendario "' + c.nome + '"' + periodo +
            '. Il calendario e gli altri eventi restano.' + nota + pezzo;
  }
  Logger.log(testo);
  return testo;
}

/**
 * Per il messaggio di ORARI_ANNULLA_calendario: il pezzo appena rifatto da
 * un cambio d'orario (inizio in ms) che non ho ritrovato per dargli i
 * contrassegni (o Google non mi ha lasciato darglieli: rifiutato), e quindi
 * non ho tolto. Il docente lo cancella a mano.
 */
function _orariAvvisoPezzoDaCancellare_(inizio, rifiutato) {
  var g = new Date(inizio);
  var hh = g.getHours(), mm = g.getMinutes();
  return '\nAttenzione: un cambio d\'orario si era fermato appena dopo aver rifatto la lezione del ' +
    _orariChiaveData_(g) + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ' (e le settimane ' +
    'dopo, se era una serie), prima di darle il contrassegno di Campanella, e ' +
    (rifiutato ? 'Google non mi ha lasciato darglielo adesso' : 'non l\'ho ritrovata a quell\'ora') + ': non l\'ho ' +
    'tolta. Se e\' ancora sul calendario (anche spostata), cancellala tu da Google Calendar (se e\' di una ' +
    'serie, tutti gli eventi di quella serie), altrimenti rimettendo l\'orario compare due volte.';
}

// --- i colori delle classi ----------------------------------------------------
/** Il lavoro a meta' di ORARI_6_coloraLezioni, se c'e' e si capisce. */
function _orariLavoroColori_() {
  var testo = PropertiesService.getUserProperties().getProperty(_ORARI_CHIAVE_COLORI);
  if (!testo) return null;
  try {
    var s = JSON.parse(testo);
    if (s && s.funzione === _ORARI_TRIGGER_COLORI && Array.isArray(s.fatte)) return s;
  } catch (err) { /* un punto illeggibile vale come nessun punto */ }
  return null;
}

/**
 * ORARI_6_coloraLezioni, con il lock gia' preso. Il punto salvato ha le serie
 * e gli eventi gia' fatti (l'impronta del loro id, stato.fatte) e i conti; con
 * altri colori in DatiOrari.gs (un'altra impronta dei colori) ricomincia da
 * capo, perche' quelli gia' fatti avevano i colori di prima.
 */
function _orariColori_(e) {
  var prop = PropertiesService.getUserProperties();
  var salvato = _orariLavoroColori_();
  var ripresa = !!(e && e.triggerUid);
  // una ripresa programmata che non trova il suo lavoro non ricomincia da
  // capo: e' gia' finito, oppure e' stato annullato
  if (ripresa && !salvato) {
    _togliTriggerOrari_(_ORARI_TRIGGER_COLORI);
    var niente = 'Niente da riprendere: i colori delle lezioni sono gia\' stati messi, oppure il lavoro e\' stato ' +
                 'annullato.';
    Logger.log(niente);
    return niente;
  }
  // ANNULLA_automazione ha fermato il lavoro: una ripresa gia' partita non lo
  // riprende. Rieseguita a mano la funzione riparte da dove era arrivata
  if (ripresa && salvato.fermato) {
    _togliTriggerOrari_(_ORARI_TRIGGER_COLORI);
    var fermo = 'Il lavoro sui colori delle lezioni e\' stato fermato con ANNULLA_automazione: non lo riprendo da ' +
                'solo. Per finirlo riesegui ORARI_6_coloraLezioni, che non ricolora le lezioni gia\' fatte.';
    Logger.log(fermo);
    return fermo;
  }
  // il lavoro di ORARI_4_calendario o di ORARI_5_cambioOrario a meta': non
  // si colora niente, come quelle due si fermano davanti al lavoro
  // dell'altra, e i due lavori restano. Il cambio d'orario riconosce dal
  // colore le lezioni colorate a mano solo loro, e le rimette come eventi
  // singoli con il loro: colorare adesso la serie vecchia o quegli eventi
  // farebbe perdere il colore scelto a mano, o la lezione
  var lavoro = _orariLavoroCalendario_();
  if (lavoro) throw new Error(_orariCalendarioAMeta_(lavoro));

  // prima di toccare il calendario: dati e date, controllati
  var d = _orariDati_();
  var c = _orariCalendarioConfig_(d);
  var periodo = _orariPeriodo_(c);
  var cal = _orariTrovaCalendario_(c.nome);
  if (!cal) {
    prop.deleteProperty(_ORARI_CHIAVE_COLORI);
    _togliTriggerOrari_(_ORARI_TRIGGER_COLORI);
    throw new Error('Non c\'e\' nessun calendario chiamato "' + c.nome + '": ORARI_6_coloraLezioni colora le ' +
      'lezioni messe con ORARI_4_calendario. Se non l\'hai mai messo, esegui ORARI_4_calendario, che da\' gia\' a ' +
      'ogni serie il colore della sua classe.');
  }
  var colori = _orariImprontaColori_(c);
  var stato = salvato;
  if (!stato || stato.coloriImpronta !== colori) {
    stato = { funzione: _ORARI_TRIGGER_COLORI, coloriImpronta: colori, fatte: [], colorate: 0, gia: 0,
              nonMessi: 0, esempiNonMessi: [], rifiuti: 0 };
  }
  if (!Array.isArray(stato.esempiNonMessi)) stato.esempiNonMessi = [];
  // rieseguita a mano dopo ANNULLA_automazione: si riparte, e le riprese tornano a valere
  if (stato.fermato) stato.fermato = false;

  var scadenza = Date.now() + _ORARI_MAX_SECONDI * 1000;
  var salva = function () { prop.setProperty(_ORARI_CHIAVE_COLORI, JSON.stringify(stato)); };
  var conti = null;
  try {
    conti = _orariColoraLezioni_(cal, periodo, c, stato, scadenza, salva);
  } catch (err) {
    salva();
    var limite = _orariLimiteGoogle_(err);
    if (!limite) throw err;          // un altro errore: il punto resta, e si vede
    return _orariInterrotto_(_ORARI_TRIGGER_COLORI, _orariDoveColori_(stato), stato, limite, salva);
  }
  if (!conti) return _orariInterrotto_(_ORARI_TRIGGER_COLORI, _orariDoveColori_(stato), stato, 'tempo', salva);

  prop.deleteProperty(_ORARI_CHIAVE_COLORI);
  _togliTriggerOrari_(_ORARI_TRIGGER_COLORI);
  var testo = _orariFineColori_(c, stato, conti);
  Logger.log(testo);
  return testo;
}

/**
 * Il lavoro di ORARI_6_coloraLezioni: ogni voce di _orariNostri_ nel periodo
 * con il contrassegno prende il colore della sua classe (il titolo della
 * serie, o dell'evento singolo; di un evento rimesso dal cambio d'orario
 * quella del suo contrassegno, _orariClasseDellaVoce_) in c.colori, se ne ha
 * uno e se non ce l'ha gia'. Quelle senza contrassegno (forse copiate a
 * mano), quelle di una classe senza colore e gli eventi rimessi dal cambio
 * con il colore scelto a mano per loro restano come sono. Quelle gia' fatte
 * (stato.fatte) si saltano. Un limite di Google ferma il lavoro (lo riprende
 * la ripresa); un altro errore si conta e il lavoro va avanti. Torna i conti
 * per il messaggio finale, o null se finisce il tempo.
 */
function _orariColoraLezioni_(cal, periodo, c, stato, scadenza, salva) {
  var nostri = _orariNostri_(cal, periodo.inizio, _orariFineGiornata_(periodo.fine));
  var conti = { tutte: 0, copie: 0, nSenza: 0, senza: [], nAncora: 0, ancora: [], nAMano: 0, aMano: [] };
  for (var i = 0; i < nostri.length; i++) {
    var voce = nostri[i];
    if (!voce.contrassegno) {
      // la sola descrizione di Campanella (forse una copia fatta a mano): la lascio com'e'
      conti.copie++;
      continue;
    }
    conti.tutte++;
    if (_orariColoreSceltoAMano_(voce)) {
      // colorata a mano solo lei, rimessa cosi' dal cambio d'orario: la lascio com'e', come dentro la serie
      conti.nAMano++;
      if (conti.aMano.length < 10) {
        conti.aMano.push(_orariEtichetta_(voce) + ' (' + _orariNomeColore_(_orariColoreDiVoce_(voce)) + ')');
      }
      continue;
    }
    // un colloquio prende il colore dei colloqui, una lezione quello della sua classe
    var classe = voce.colloquio ? _ORARI_NOME_COLLOQUI : _orariClasseDellaVoce_(voce);
    var colore = _orariColoreNeiDati_(c, voce, classe);
    if (!colore) {
      // una classe senza colore: la lascio com'e', e se ne ha uno di prima lo dico
      conti.nSenza++;
      if (conti.senza.indexOf(classe) < 0 && conti.senza.length < 10) conti.senza.push(classe);
      var rimasto = _orariColoreDiVoce_(voce);
      if (rimasto) {
        conti.nAncora++;
        if (conti.ancora.length < 10) conti.ancora.push(_orariEtichetta_(voce) + ' (' + _orariNomeColore_(rimasto) + ')');
      }
      continue;
    }
    var segno = _orariSegnoDellaVoce_(voce);
    if (stato.fatte.indexOf(segno) >= 0) continue;          // fatta in un'esecuzione di prima
    if (_orariColoreDiVoce_(voce) === colore) {
      stato.gia++;
      stato.fatte.push(segno);
      continue;
    }
    if (Date.now() > scadenza) return null;
    try {
      if (voce.serie) voce.serie.setColor(colore);
      else voce.evento.setColor(colore);
      stato.colorate++;
    } catch (err) {
      if (_orariLimiteGoogle_(err)) throw err;
      stato.nonMessi++;
      if (stato.esempiNonMessi.length < 10) stato.esempiNonMessi.push(_orariEtichetta_(voce));
    }
    stato.fatte.push(segno);
    stato.rifiuti = 0;
    salva();
    Utilities.sleep(_ORARI_PAUSA_MS);
  }
  return conti;
}

/** Il messaggio di ORARI_6_coloraLezioni davanti al lavoro a meta' di ORARI_4_calendario o di ORARI_5_cambioOrario. */
function _orariCalendarioAMeta_(lavoro) {
  if (lavoro.fusoSbagliato) {
    return 'Non coloro niente: il lavoro sul calendario si e\' fermato per il fuso orario.\n' +
      String(lavoro.fusoSbagliato);
  }
  var come = _orariComeFinire_(lavoro);
  if (lavoro.funzione === _ORARI_TRIGGER_CAMBIO) {
    return 'C\'e\' un cambio d\'orario a meta\' (ORARI_5_cambioOrario): ' + come + '. Quando e\' finito esegui ' +
      'ORARI_6_coloraLezioni: finche\' e\' a meta\' non coloro niente, perche\' il cambio riconosce dal colore le ' +
      'lezioni colorate a mano solo loro, e le rimette con il loro. Non ho toccato niente.';
  }
  if (lavoro.funzione === _ORARI_TRIGGER_COLLOQUI) {
    return 'C\'e\' un aggiornamento dei colloqui a meta\' (ORARI_7_colloqui): ' + come + '. Quando e\' finito ' +
      'esegui ORARI_6_coloraLezioni: finche\' e\' a meta\' non coloro niente, perche\' l\'aggiornamento riconosce dal ' +
      'colore gli incontri colorati a mano solo loro, e li rimette con il loro. Non ho toccato niente.';
  }
  return 'L\'orario messo da ORARI_4_calendario e\' ancora a meta\': ' + come + '. ORARI_4_calendario da\' gia\' ' +
    'a ogni serie il colore della sua classe; quando e\' finito, se il suo messaggio finale te lo dice, esegui ' +
    'ORARI_6_coloraLezioni. Finche\' e\' a meta\' non coloro niente, e non ho toccato niente.';
}

/** Per i messaggi di ORARI_6_coloraLezioni fermata a meta': quante ne ha colorate. */
function _orariDoveColori_(stato) {
  return (stato.colorate === 1 ? 'una serie o lezione colorata' : stato.colorate + ' serie o lezioni colorate') +
         ' finora';
}

/** Il messaggio finale di ORARI_6_coloraLezioni. */
function _orariFineColori_(c, stato, conti) {
  var n = stato.nonMessi || 0;
  return 'Colori delle classi nel calendario "' + c.nome + '", fra il ' + c.inizio + ' e il ' + c.fine + '.\n' +
    'Serie ed eventi singoli di Campanella: ' + conti.tutte + '\n' +
    'Colorati adesso con il colore della loro classe: ' + stato.colorate + '\n' +
    'Avevano gia\' il colore della loro classe: ' + stato.gia + '\n' +
    (conti.nSenza ? 'Di classi senza colore in DatiOrari.gs, lasciati come sono: ' + conti.nSenza + ' (' +
                    conti.senza.join(', ') + ')\n' : '') +
    (conti.nAMano ? 'Colorati a mano solo loro, e rimessi cosi\' da ORARI_5_cambioOrario, lasciati con il loro ' +
                    'colore: ' + conti.nAMano + ' (' + conti.aMano.join('; ') +
                    (conti.nAMano > conti.aMano.length ? '; ...' : '') + '). Se vuoi il colore della classe, ' +
                    'cambialo tu da Google Calendar.\n' : '') +
    (conti.nAncora ? '\n' + (conti.nAncora === 1 ? 'Uno di questi ha' : conti.nAncora + ' di questi hanno') +
                     ' ancora un colore messo prima: ' + conti.ancora.join('; ') +
                     (conti.nAncora > conti.ancora.length ? '; ...' : '') + '. Se vuoi che abbiano il colore del ' +
                     'calendario, cambialo tu da Google Calendar (per una serie, a tutti gli eventi della serie); ' +
                     'oppure scegli un colore per la classe in Campanella e riesegui ORARI_6_coloraLezioni.\n' : '') +
    (conti.copie ? '\nCon la descrizione di Campanella ma senza contrassegno, forse copiati a mano: non li ho ' +
                   'toccati (' + conti.copie + ').\n' : '') +
    (n ? '\nAttenzione: Google non ha messo il colore a ' + (n === 1 ? 'una serie o lezione' : n + ' serie o lezioni') +
         ': ' + stato.esempiNonMessi.join('; ') + (n > stato.esempiNonMessi.length ? '; ...' : '') + '. Riesegui ' +
         'ORARI_6_coloraLezioni piu\' tardi.\n' : '') +
    '\nLe lezioni non le ho rifatte ne\' spostate: ho cambiato solo il colore. I colori li scegli in Campanella ' +
    '(Orari, passo 4, "Colori delle classi..."): per cambiarli rigenera DatiOrari.gs, incollalo e riesegui ' +
    'ORARI_6_coloraLezioni.';
}

/** Il titolo di una voce di _orariNostri_: quello della serie (non di una sua lezione rinominata a mano), o dell'evento singolo. */
function _orariTitoloDellaVoce_(voce) {
  var t = '';
  try { t = String((voce.serie ? voce.serie.getTitle() : voce.evento.getTitle()) || ''); } catch (e) { t = ''; }
  return t || String(voce.titolo || '');
}

/**
 * La classe di una voce di _orariNostri_, per il suo colore: di un evento
 * singolo rimesso dal cambio d'orario quella scritta nel suo contrassegno
 * (il titolo puo' essere cambiato a mano, come "2B VERIFICA"), altrimenti
 * il titolo della serie o dell'evento.
 */
function _orariClasseDellaVoce_(voce) {
  var k = '';
  if (voce.evento) {
    try { k = String(voce.evento.getTag(_ORARI_TAG_CLASSE) || '').trim(); } catch (e) { k = ''; }
  }
  return k || _orariTitoloDellaVoce_(voce);
}

/** Vero se la voce e' un evento singolo rimesso dal cambio d'orario con il colore scelto a mano per quella lezione. */
function _orariColoreSceltoAMano_(voce) {
  if (!voce.evento) return false;
  try { return voce.evento.getTag(_ORARI_TAG_COLORE) === _ORARI_COLORE_A_MANO; } catch (e) { return false; }
}

/** L'impronta dell'id di una voce di _orariNostri_ (la serie o l'evento singolo), per il punto salvato. */
function _orariSegnoDellaVoce_(voce) {
  var id = '';
  try { id = String(voce.serie ? voce.serie.getId() : voce.evento.getId()); } catch (e) { id = ''; }
  return _orariFnv_(id);
}

/** Il colore che ha adesso una voce di _orariNostri_ (la serie o l'evento singolo): da "1" a "11", '' = quello del calendario. */
function _orariColoreDiVoce_(voce) {
  try { return _orariColoreValido_(voce.serie ? voce.serie.getColor() : voce.evento.getColor()); } catch (e) { return ''; }
}

/** Il colore che ha adesso una lezione di una voce di _orariNostri_ (come getEvents la da'). */
function _orariColoreDellaLezione_(lezione) {
  try { return _orariColoreValido_(lezione.evento.getColor()); } catch (e) { return ''; }
}

/**
 * Il colore della classe di una lezione (il titolo della serie, come nel
 * tabellone) in c.colori: il valore di CalendarApp.EventColor, da "1" a
 * "11"; '' se non ne ha uno giusto (allora le sue lezioni hanno il colore del
 * calendario). La classe scritta con altre maiuscole o altri spazi e' la
 * stessa.
 */
function _orariColoreDi_(c, titolo) {
  var t = String(titolo == null ? '' : titolo).trim();
  var v = _orariValoreColore_(c.colori, t);
  if (v || !t) return v;
  var chiave = _orariChiave_(t);
  if (!chiave) return '';
  for (var k in c.colori) {
    if (_orariChiave_(k) !== chiave) continue;
    v = _orariValoreColore_(c.colori, k);
    if (v) return v;
  }
  return '';
}

/** Il colore di una classe in calendario.colori, se e' uno di quelli di Google Calendar; altrimenti ''. */
function _orariValoreColore_(colori, classe) {
  var v = '';
  try { v = colori[classe]; } catch (e) { v = ''; }
  return _orariColoreValido_(v);
}

/** "1".."11" (anche scritto come numero) se e' un colore degli eventi di Google Calendar, altrimenti ''. */
function _orariColoreValido_(v) {
  var s = (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : '';
  return /^(?:[1-9]|1[01])$/.test(s) ? s : '';
}

/** Il nome di un colore come nell'interfaccia di Google Calendar ("11" -> Pomodoro). */
function _orariNomeColore_(v) {
  return _ORARI_NOMI_COLORI[Number(_orariColoreValido_(v))] || 'colore del calendario';
}

/** Le classi dei blocchi del piano (i titoli delle serie), una volta sola, in ordine. */
function _orariClassiDelPiano_(piano) {
  var classi = [];
  for (var i = 0; i < piano.serie.length; i++) {
    var t = piano.serie[i].blocco.testo;
    if (classi.indexOf(t) < 0) classi.push(t);
  }
  classi.sort(_orariOrdineClassi_);
  return classi;
}

/** Le classi in ordine: prima il numero ("2B" prima di "10A"), poi il resto; "A disposizione" in fondo. */
function _orariOrdineClassi_(a, b) {
  var x = String(a), y = String(b);
  var dx = (x === 'A disposizione') ? 1 : 0, dy = (y === 'A disposizione') ? 1 : 0;
  if (dx !== dy) return dx - dy;
  var nx = /^\d+/.exec(x), ny = /^\d+/.exec(y);
  if (nx && ny && Number(nx[0]) !== Number(ny[0])) return Number(nx[0]) - Number(ny[0]);
  if (!nx !== !ny) return nx ? -1 : 1;
  var kx = x.toLowerCase(), ky = y.toLowerCase();
  return (kx < ky) ? -1 : (kx > ky ? 1 : 0);
}

/** "Colori delle classi: 1A Pomodoro, 2B Mirtillo; del colore del calendario: 4D." */
function _orariRigaColori_(c, classi) {
  var con = [], senza = [];
  for (var i = 0; i < classi.length; i++) {
    var v = _orariColoreDi_(c, classi[i]);
    if (v) con.push(classi[i] + ' ' + _orariNomeColore_(v));
    else senza.push(classi[i]);
  }
  if (!con.length) return 'Colori delle classi: nessuno, tutte le lezioni hanno il colore del calendario.';
  return 'Colori delle classi: ' + con.join(', ') + (senza.length ? '; del colore del calendario: ' + senza.join(', ') : '') +
         '.';
}

/** Le righe dell'anteprima sui colori delle classi del piano, con quelli scritti male in DatiOrari.gs. */
function _orariAnteprimaColori_(c, piano) {
  var righe = [_orariRigaColori_(c, _orariClassiDelPiano_(piano))];
  var sbagliati = [];
  for (var k in c.colori) {
    var v = c.colori[k];
    var s = (v == null) ? '' : String(v).trim();
    if (s !== '' && !_orariColoreValido_(v)) sbagliati.push(k + ' ("' + s + '")');
  }
  if (sbagliati.length) {
    var uno = (sbagliati.length === 1);
    righe.push('ATTENZIONE: in DatiOrari.gs ' + (uno ? 'il colore di ' : 'i colori di ') + sbagliati.join(', ') +
               (uno ? ' non e\' uno' : ' non sono') + ' dei colori di Google Calendar (da 1 a 11): quelle lezioni ' +
               'avranno il colore del calendario. Rigenera DatiOrari.gs dall\'applicazione.');
  }
  righe.push('I colori vanno sulle lezioni con ORARI_4_calendario e ORARI_5_cambioOrario; a quelle gia\' messe li da\' ' +
             'ORARI_6_coloraLezioni.');
  return righe;
}

/** L'impronta dei colori di DatiOrari.gs (solo quelli giusti, anche quello dei colloqui): cambia se cambia un colore. */
function _orariImprontaColori_(c) {
  var parti = [];
  for (var k in c.colori) {
    var v = _orariValoreColore_(c.colori, k);
    if (v) parti.push(k + '=' + v);
  }
  parti.sort();
  // quello dei colloqui dopo le classi, con un segno che nessuna classe ha
  if (c.coloreColloqui) parti.push('\n' + _ORARI_NOME_COLLOQUI + '=' + c.coloreColloqui);
  return _orariFnv_(parti.join('\n'));
}

/** Per il messaggio finale: una serie o una lezione a cui Google non ha messo il colore della sua classe. */
function _orariColoreNonMesso_(stato, etichetta) {
  stato.nColoriNonMessi = (stato.nColoriNonMessi || 0) + 1;
  if (!stato.coloriNonMessi) stato.coloriNonMessi = [];
  if (stato.coloriNonMessi.length < 10) stato.coloriNonMessi.push(etichetta);
}

/** Per i messaggi finali di ORARI_4 e ORARI_5: i colori che Google non ha messo, e i colori cambiati a meta'. */
function _orariAvvisoColori_(stato) {
  var testo = '';
  var n = stato.nColoriNonMessi || 0;
  if (n) {
    testo += '\n\nAttenzione: Google non ha messo il colore della classe a ' +
      (n === 1 ? 'una serie o lezione' : n + ' serie o lezioni') + ': ' + stato.coloriNonMessi.join('; ') +
      (n > stato.coloriNonMessi.length ? '; ...' : '') + '. Le lezioni ci sono lo stesso, con il colore del ' +
      'calendario: per dar loro quello della classe esegui ORARI_6_coloraLezioni.';
  }
  if (stato.coloriCambiati) {
    testo += '\n\nI colori delle classi in DatiOrari.gs sono cambiati a meta\' del lavoro: le serie messe prima ' +
      'hanno ancora quelli di prima. Per dare a tutte le lezioni i colori di adesso esegui ORARI_6_coloraLezioni.';
  }
  return testo;
}

/**
 * Gli eventi messi da Campanella fra le due date: una voce per ogni serie,
 * con la sua prima lezione (inizio e fine, vedi _orariPrimaLezione_, nel
 * fuso del calendario), l'inizio dell'ultima e le lezioni come le da'
 * getEvents (ognuna con il suo evento: il taglio ne toglie una sola dalla
 * serie nuova, _orariTogliBuco_), o per l'evento singolo. Messi da
 * Campanella vuol dire con il contrassegno (contrassegno: true), oppure con
 * la descrizione che comincia con [Campanella]: se Google non ha salvato il
 * contrassegno, ma anche in una copia fatta a mano di una lezione. Le lezioni
 * e i colloqui con le famiglie hanno lo stesso contrassegno, con due valori:
 * colloquio dice quale (_orariDiColloquio_).
 */
function _orariNostri_(cal, inizio, fine) {
  var fuso = cal.getTimeZone();
  var eventi = cal.getEvents(inizio, fine);
  var perSerie = {};
  var fuori = [];
  for (var i = 0; i < eventi.length; i++) {
    var ev = eventi[i];
    var contrassegno = false;
    try {
      contrassegno = (ev.getTag(_ORARI_TAG) === _ORARI_TAG_VALORE || ev.getTag(_ORARI_TAG) === _ORARI_TAG_COLLOQUIO);
    } catch (e) { }
    var nostro = contrassegno;
    if (!nostro) {
      try { nostro = String(ev.getDescription() || '').indexOf('[Campanella]') === 0; } catch (e2) { }
    }
    if (!nostro) continue;

    var lezione = { inizio: ev.getStartTime(), fine: ev.getEndTime(), evento: ev };
    // getEventSeries non e' mai null, nemmeno per un evento singolo (e' la
    // sua "serie"): quello che li distingue e' isRecurringEvent
    var ricorrente = false;
    try { ricorrente = ev.isRecurringEvent(); } catch (e3) { ricorrente = false; }
    if (!ricorrente) {
      fuori.push({ evento: ev, contrassegno: contrassegno, titolo: ev.getTitle(),
                   inizio: lezione.inizio, fine: lezione.fine, ultimo: lezione.inizio,
                   colloquio: _orariDiColloquio_(ev) });
      continue;
    }
    var serie = ev.getEventSeries();
    var id = serie.getId();
    var voce = perSerie[id];
    if (!voce) {
      var descrizione = '';
      try { descrizione = String(serie.getDescription() || ''); } catch (e4) { }
      voce = perSerie[id] = { serie: serie, contrassegno: false, titolo: ev.getTitle(), descrizione: descrizione,
                              lezioni: [], colloquio: _orariDiColloquio_(serie) };
      fuori.push(voce);
    }
    if (contrassegno) voce.contrassegno = true;
    voce.lezioni.push(lezione);
  }
  for (var k = 0; k < fuori.length; k++) if (fuori[k].serie) _orariPrimaLezione_(fuori[k], null, fuso);
  return fuori;
}

/**
 * Per _orariNostri_: vero se l'evento (o la serie) di Campanella e' un
 * colloquio con le famiglie. Con il contrassegno lo dice il suo valore;
 * senza (Google non l'ha salvato), l'inizio della descrizione. Non decide se
 * un evento e' di Campanella: lo decidono il contrassegno e la descrizione.
 */
function _orariDiColloquio_(x) {
  var valore = '', descrizione = '';
  try { valore = String(x.getTag(_ORARI_TAG) || ''); } catch (e) { valore = ''; }
  if (valore) return valore === _ORARI_TAG_COLLOQUIO;
  try { descrizione = String(x.getDescription() || ''); } catch (e2) { descrizione = ''; }
  return descrizione.indexOf(_ORARI_INIZIO_COLLOQUI) === 0;
}

/**
 * La prima lezione di una serie: dove comincia per Google. getEvents da' le
 * lezioni spostate a mano all'ora nuova: la prima trovata non basta (una
 * prima lezione spostata sposterebbe tutta la serie). Giorno, ora e durata
 * della serie sono quelli piu' frequenti (voce.forma), guardati nel fuso del
 * calendario: in un calendario con un altro fuso, come UTC, dopo il cambio
 * dell'ora le lezioni non sembrano spostate. Senza fuso, quello dello
 * script. La prima lezione e' la prima con quella forma, o qualche settimana
 * prima se ci sono lezioni spostate che vengono da prima (vedi sotto). Poi
 * voce.ultimo, l'inizio dell'ultima lezione, e voce.irregolare: ci sono
 * lezioni spostate, o settimane che mancano (cancellate a mano). Con il
 * periodo (inizio e giorni senza lezione, come da _orariPeriodo_) una
 * lezione spostata prima della prima regolare sta, se puo', nella settimana
 * in cui cade. La serie non comincia mai prima del giorno scritto nella sua
 * descrizione ("serie dal 2026-10-12"), se c'e'.
 */
function _orariPrimaLezione_(voce, periodo, fuso) {
  var settimana = 7 * 24 * 3600 * 1000;
  var lezioni = voce.lezioni.sort(function (x, y) { return x.inizio - y.inizio; });
  var forme = [];
  for (var h = 0; h < lezioni.length; h++) forme.push(_orariForma_(lezioni[h], fuso));
  var conta = {};
  for (var i = 0; i < lezioni.length; i++) {
    var f = forme[i];
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
    var g = forme[j];
    var giusto = (_orariGiornoDellaForma_(g) === scritto);
    if (conta[g] > quante || (conta[g] === quante && giusto && !delGiorno)) {
      quante = conta[g]; forma = g; delGiorno = giusto;
    }
  }
  var prima = null, ultimaRegolare = null;
  for (var k = 0; k < lezioni.length; k++) {
    if (forme[k] !== forma) continue;
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
    if (forme[m] === forma) continue;
    if (lezioni[m].inizio < prima.inizio) primaDellaPrima++;
    else if (lezioni[m].inizio < ultimaRegolare.inizio) inMezzo++;
  }
  // (mai meno di zero: una lezione spostata proprio all'ora di un'altra conta due volte)
  var vuoteInMezzo = Math.max(0, Math.round((ultimaRegolare.inizio - prima.inizio) / settimana) + 1 - quante);
  var indietro = primaDellaPrima + Math.max(0, inMezzo - vuoteInMezzo);
  // la prima lezione spostata di qualche giorno e la seconda cancellata: fra
  // la spostata e la prima regolare manca una settimana, e contata la
  // spostata finirebbe nella settimana cancellata (e dopo il taglio non ci
  // sarebbe piu'). Con il periodo, ogni lezione spostata prima della prima
  // regolare sta nella settimana in cui cade, se puo' (_orariSettimaneProprie_);
  // anticipata alla settimana prima dell'inizio o di un giorno senza lezione,
  // dove Campanella non ha messo lezioni, si conta come sopra. Il giorno
  // della prima lezione scritto nella descrizione, se c'e', vale come
  // l'inizio del periodo: una serie messa da un cambio d'orario comincia al
  // giorno del cambio di allora, che DatiOrari.gs non conserva, e la
  // settimana prima aveva ancora l'orario di prima
  var dalScritto = _orariPrimoGiornoDellaDescrizione_(voce.descrizione, prima);
  if (periodo && primaDellaPrima && inMezzo <= vuoteInMezzo) {
    var limite = (dalScritto && dalScritto > periodo.inizio)
      ? { inizio: dalScritto, fine: periodo.fine, sospensioni: periodo.sospensioni } : periodo;
    indietro = Math.max(indietro, _orariSettimaneProprie_(lezioni, forme, forma, prima, limite));
  }
  var p = prima.inizio;
  voce.inizio = new Date(p.getFullYear(), p.getMonth(), p.getDate() - 7 * indietro,
                         p.getHours(), p.getMinutes(), p.getSeconds());
  // e la serie non comincia mai prima di quel giorno
  if (dalScritto && voce.inizio < dalScritto) {
    voce.inizio = new Date(dalScritto.getFullYear(), dalScritto.getMonth(), dalScritto.getDate(),
                           p.getHours(), p.getMinutes(), p.getSeconds());
  }
  voce.fine = new Date(voce.inizio.getTime() + (prima.fine - prima.inizio));
  voce.forma = forma;
  voce.ultimo = lezioni[lezioni.length - 1].inizio;
  var attese = Math.round((ultimaRegolare.inizio - voce.inizio) / settimana) + 1;
  voce.irregolare = (quante < lezioni.length) || (lezioni.length < attese);
}

/**
 * Per _orariPrimaLezione_ (con la forma di ogni lezione e quella della
 * serie): le lezioni spostate prima della prima regolare, ognuna nella
 * settimana in cui cade (le settimane della serie cominciano
 * nel giorno della prima regolare, quello della descrizione). Quante
 * settimane prima della prima regolare comincia allora la serie; 0 se non si
 * puo': due spostate nella stessa settimana, o una settimana il cui giorno
 * viene prima dell'inizio del periodo o e' senza lezione, dove Campanella non
 * ha messo lezioni.
 */
function _orariSettimaneProprie_(lezioni, forme, forma, prima, periodo) {
  var p = prima.inizio, viste = [], fino = 0;
  var giornoPrima = new Date(p.getFullYear(), p.getMonth(), p.getDate());
  for (var i = 0; i < lezioni.length; i++) {
    var t = lezioni[i].inizio;
    if (t >= p || forme[i] === forma) continue;
    var giorni = Math.round((giornoPrima - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / (24 * 3600 * 1000));
    var k = Math.ceil(giorni / 7);
    var giorno = new Date(p.getFullYear(), p.getMonth(), p.getDate() - 7 * k);
    if (k < 1 || viste.indexOf(k) >= 0 || giorno < periodo.inizio ||
        _orariSospeso_(_orariChiaveData_(giorno), periodo.sospensioni)) return 0;
    viste.push(k);
    fino = Math.max(fino, k);
  }
  return fino;
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

/**
 * Il giorno della prima lezione scritto da _orariDescrizione_ ("..., serie
 * dal 2026-10-12"), a mezzanotte; null se non c'e' (una serie di una
 * versione di prima, o la descrizione cambiata a mano) o se non torna con la
 * prima lezione regolare: un altro giorno della settimana, dopo, o non a
 * settimane intere.
 */
function _orariPrimoGiornoDellaDescrizione_(descrizione, prima) {
  var m = String(descrizione || '').match(/^\[Campanella\][^\n]*?, serie dal (\d{4}-\d{1,2}-\d{1,2})(?![\d])/);
  var g = m ? _orariData_(m[1]) : null;
  if (!g) return null;
  var p = prima.inizio;
  var giorni = Math.round((new Date(p.getFullYear(), p.getMonth(), p.getDate()) - g) / (24 * 3600 * 1000));
  return (g.getDay() === p.getDay() && giorni >= 0 && giorni % 7 === 0) ? g : null;
}

/**
 * Giorno della settimana (come getDay: 0 = domenica), ora e durata di una
 * lezione, nel fuso dato (quello del calendario; senza, quello dello script):
 * in una serie sono uguali, se nessuno le ha cambiate. Il giorno viene dalla
 * data scritta in quel fuso, contata come un giorno qualunque.
 */
function _orariForma_(lezione, fuso) {
  var s = Utilities.formatDate(lezione.inizio, fuso || Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var giorno = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))).getDay();
  return giorno + ' ' + s.slice(11) + ' ' + (lezione.fine - lezione.inizio);
}

/** Il giorno della settimana di una forma di _orariForma_, come getDay: 0 = domenica. */
function _orariGiornoDellaForma_(forma) {
  return Number(String(forma).split(' ')[0]);
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
  if ((!c || !c.docente) && d.calendarioAltroAccount) {
    throw new Error('Qui non tocco il calendario: ' + _ORARI_ALTRO_ACCOUNT + '\nPer togliere un orario messo prima ' +
      'nel calendario di questo account: nell\'applicazione scegli per un momento "nell\'account della scuola", ' +
      'rigenera e incolla DatiOrari.gs ed esegui ORARI_ANNULLA_calendario (oppure elimina quel calendario da Google ' +
      'Calendar).');
  }
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
    // il colore di ogni classe (CalendarApp.EventColor, da "1" a "11"): si
    // legge solo con _orariColoreDi_, che scarta quelli sbagliati
    colori: (c.colori && typeof c.colori === 'object') ? c.colori : {},
    sospensioni: (c.sospensioni && c.sospensioni.length) ? c.sospensioni : [],
    validoDal: String(c.validoDal || '').trim(),
    // i colloqui con le famiglie (si leggono con _orariPianoColloqui_, che
    // controlla date e ore) e il loro colore, "" se non ce n'e' uno giusto
    colloqui: {
      settimanali: (c.colloqui && c.colloqui.settimanali && c.colloqui.settimanali.length) ? c.colloqui.settimanali : [],
      singoli: (c.colloqui && c.colloqui.singoli && c.colloqui.singoli.length) ? c.colloqui.singoli : [],
      sospensioni: (c.colloqui && c.colloqui.sospensioni && c.colloqui.sospensioni.length) ? c.colloqui.sospensioni : []
    },
    coloreColloqui: _orariColoreValido_(c.coloreColloqui)
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

/**
 * Il piano dei colloqui, dal giorno dal alla fine del periodo. Ogni
 * ricevimento settimanale (calendario.colloqui.settimanali) come le lezioni:
 * nelle sue date (dal, al) se le ha, se no in tutto il periodo, senza i giorni
 * senza lezione e quelli in cui i colloqui sono sospesi
 * (calendario.colloqui.sospensioni), una serie per ogni tratto di settimane.
 * Le giornate singole (singoli) una per una, se cadono nel periodo e non
 * prima di dal: le sospensioni valgono solo per il ricevimento settimanale,
 * perche' una giornata scritta apposta (i colloqui generali) di solito cade
 * proprio quando il ricevimento e' sospeso. Ogni voce: { singolo, nome,
 * dalle, alle, link, dal, al, incontri }; i conti per i messaggi. Dati che
 * non si capiscono fermano tutto prima di toccare il calendario. Lo stesso
 * calcolo lo fa Campanella (Colloqui.Piano), per il riepilogo della pagina.
 */
function _orariPianoColloqui_(c, periodo, dal) {
  var k = c.colloqui;
  var piano = { voci: [], settimanali: 0, tratti: 0, singoli: 0, incontri: 0, saltati: 0, fuori: 0 };
  var sospesi = [];
  for (var s = 0; s < k.sospensioni.length; s++) {
    var x = k.sospensioni[s] || {};
    var da = _orariData_(x.dal), a = _orariData_(x.al || x.dal);
    if (!da || !a || a < da) {
      throw new Error('In DatiOrari.gs il periodo senza colloqui numero ' + (s + 1) + ' non si capisce (dal "' +
        x.dal + '" al "' + x.al + '"): rigenera il file dall\'applicazione.');
    }
    sospesi.push({ dal: _orariChiaveData_(da), al: _orariChiaveData_(a) });
  }
  for (var i = 0; i < k.settimanali.length; i++) {
    var w = _orariColloquioLetto_(k.settimanali[i], 'il ricevimento settimanale numero ' + (i + 1));
    var giorno = _orariGiornoSettimana_(w.giorno);
    var inizio = w.dal ? _orariData_(w.dal) : periodo.inizio;
    var fine = w.al ? _orariData_(w.al) : periodo.fine;
    if (giorno < 0 || !inizio || !fine) {
      throw new Error('In DatiOrari.gs il ricevimento settimanale numero ' + (i + 1) + ' non si capisce (giorno "' +
        w.giorno + '", dal "' + w.dal + '" al "' + w.al + '"): rigenera il file dall\'applicazione.');
    }
    piano.settimanali++;
    if (inizio < dal) inizio = dal;
    if (fine > periodo.fine) fine = periodo.fine;
    var aperta = null;
    for (var g = _orariPrimoGiorno_(inizio, giorno); g <= fine;
         g = new Date(g.getFullYear(), g.getMonth(), g.getDate() + 7)) {
      var chiave = _orariChiaveData_(g);
      if (_orariSospeso_(chiave, periodo.sospensioni) || _orariSospeso_(chiave, sospesi)) {
        piano.saltati++;
        aperta = null;
        continue;
      }
      if (!aperta) {
        aperta = { singolo: false, nome: w.nome, dalle: w.dalle, alle: w.alle, link: w.link, dal: chiave, al: chiave,
                   incontri: 0 };
        piano.voci.push(aperta);
        piano.tratti++;
      }
      aperta.al = chiave;
      aperta.incontri++;
      piano.incontri++;
    }
  }
  for (var j = 0; j < k.singoli.length; j++) {
    var u = _orariColloquioLetto_(k.singoli[j], 'la giornata di colloqui numero ' + (j + 1));
    var data = _orariData_(k.singoli[j].data);
    if (!data) {
      throw new Error('In DatiOrari.gs la giornata di colloqui numero ' + (j + 1) + ' non ha una data aaaa-mm-gg ("' +
        k.singoli[j].data + '"): rigenera il file dall\'applicazione.');
    }
    if (data < periodo.inizio || data > periodo.fine) { piano.fuori++; continue; }
    if (data < dal) continue;            // prima del cambio: resta com'e'
    var giornata = _orariChiaveData_(data);
    piano.voci.push({ singolo: true, nome: u.nome, dalle: u.dalle, alle: u.alle, link: u.link, dal: giornata,
                      al: giornata, incontri: 1 });
    piano.singoli++;
    piano.incontri++;
  }
  return piano;
}

/**
 * Un colloquio di DatiOrari.gs (cosa: come si chiama nei messaggi) con le ore
 * controllate: "hh:mm", la fine dopo l'inizio. Il nome di partenza e'
 * "Colloqui"; il link, se c'e', e' un indirizzo https://.
 */
function _orariColloquioLetto_(x, cosa) {
  var v = x || {};
  var ora = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  var dalle = String(v.dalle || '').trim(), alle = String(v.alle || '').trim();
  var md = ora.exec(dalle), ma = ora.exec(alle);
  if (!md || !ma || Number(ma[1]) * 60 + Number(ma[2]) <= Number(md[1]) * 60 + Number(md[2])) {
    throw new Error('In DatiOrari.gs ' + cosa + ' non ha le ore giuste (dalle "' + v.dalle + '" alle "' + v.alle +
      '"): rigenera il file dall\'applicazione.');
  }
  var link = String(v.link || '').trim();
  if (link && !/^https:\/\/\S+$/i.test(link)) {
    throw new Error('In DatiOrari.gs ' + cosa + ' ha un link che non e\' un indirizzo https:// ("' + link + '"): ' +
      'rigenera il file dall\'applicazione.');
  }
  // "Https://...": lo schema in minuscolo, come lo scrive l'applicazione
  if (link) link = 'https://' + link.slice('https://'.length);
  return { nome: String(v.nome || '').trim() || _ORARI_NOME_COLLOQUI, giorno: String(v.giorno || ''),
           dal: String(v.dal || '').trim(), al: String(v.al || '').trim(), link: link,
           dalle: ('0' + Number(md[1])).slice(-2) + ':' + md[2], alle: ('0' + Number(ma[1])).slice(-2) + ':' + ma[2] };
}

/**
 * Il giorno da cui ORARI_7_colloqui aggiorna i colloqui: oggi, oppure quello
 * del lavoro a meta' che riprende (salvato). Mai prima dell'inizio del
 * periodo; dopo la fine non c'e' niente da aggiornare.
 */
function _orariOggiDeiColloqui_(salvato, periodo) {
  var oggi = (salvato && salvato.funzione === _ORARI_TRIGGER_COLLOQUI) ? _orariData_(salvato.validoDal) : null;
  if (!oggi) {
    var adesso = new Date();
    oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  }
  if (oggi > periodo.fine) {
    throw new Error('Il periodo del calendario e\' finito il ' + _orariChiaveData_(periodo.fine) + ': non ci sono ' +
      'colloqui da aggiornare. Per l\'anno nuovo scegli il periodo nell\'applicazione (Orari, passo 4), rigenera ' +
      'DatiOrari.gs ed esegui ORARI_4_calendario.');
  }
  return (oggi < periodo.inizio) ? periodo.inizio : oggi;
}

/** "Colloqui ...: 1 ricevimento settimanale (2 serie, 28 incontri), 2 giornate singole; ...": per i messaggi. */
function _orariRigaColloqui_(c, piano, cosa) {
  if (!piano.settimanali && !piano.voci.length && !piano.fuori) {
    return 'Colloqui ' + cosa + ': nessuno (si scrivono nell\'applicazione, Orari, passo 4, Colloqui).';
  }
  return 'Colloqui ' + cosa + ': ' +
    (piano.settimanali === 1 ? '1 ricevimento settimanale' : piano.settimanali + ' ricevimenti settimanali') +
    ' (' + piano.tratti + ' serie, ' + (piano.incontri - piano.singoli) + ' incontri), ' +
    (piano.singoli === 1 ? '1 giornata singola' : piano.singoli + ' giornate singole') +
    (piano.saltati ? '; ' + piano.saltati + ' incontri saltati nei giorni senza lezione o senza colloqui' : '') +
    (piano.fuori ? '; ' + (piano.fuori === 1 ? '1 giornata fuori dal periodo, lasciata fuori'
                                             : piano.fuori + ' giornate fuori dal periodo, lasciate fuori') : '') +
    '. Colore dei colloqui: ' + _orariNomeColore_(c.coloreColloqui) + '.';
}

/** Il colore che DatiOrari.gs da' a una voce di _orariNostri_: quello dei colloqui, o quello della sua classe. */
function _orariColoreNeiDati_(c, voce, classe) {
  return voce.colloquio ? c.coloreColloqui : _orariColoreDi_(c, classe);
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
 * L'impronta del piano: cambia se cambia qualunque cosa che decide quali
 * lezioni finiscono sul calendario (calendario, classi, giorni, ore, date,
 * descrizioni), e i colloqui del piano (piano.colloqui: date, ore, nomi e
 * link). Una ripresa con un'impronta diversa si ferma invece di mescolare
 * due orari. Senza colloqui l'impronta e' quella delle versioni di prima,
 * cosi' un lavoro a meta' lasciato da una di loro si finisce. I colori non ci
 * sono: cambiati a meta' non mescolano due orari (vedi la sezione 4, e
 * _orariImprontaColori_).
 */
function _orariImpronta_(c, doc, d, piano, validoDal) {
  var parti = [c.nome, doc.nome, c.inizioOre.join(','), c.minutiOra, validoDal];
  for (var i = 0; i < piano.serie.length; i++) {
    var s = piano.serie[i];
    parti.push([s.blocco.testo, s.dal, s.al, s.blocco.oraDa, s.blocco.oraA,
                _orariDescrizione_(doc.nome, s.blocco, d)].join('|'));
  }
  var colloqui = (piano.colloqui && piano.colloqui.voci) ? piano.colloqui.voci : [];
  for (var j = 0; j < colloqui.length; j++) {
    var k = colloqui[j];
    parti.push(['colloquio', k.singolo ? 'giornata' : 'settimanale', k.nome, k.dal, k.al, k.dalle, k.alle,
                k.link].join('|'));
  }
  return _orariFnv_(parti.join('\n')) + '-' + piano.serie.length + (colloqui.length ? '-' + colloqui.length : '');
}

/** FNV-1a a 32 bit di un testo, in otto cifre esadecimali. */
function _orariFnv_(testo) {
  var h = 0x811c9dc5;
  for (var k = 0; k < testo.length; k++) {
    h ^= testo.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/**
 * Il docente del calendario: con il nome esatto, o scritto come l'inizio
 * ("ROSSI" per "ROSSI M.") se nel tabellone c'e' un docente solo che comincia
 * cosi'. Con due omonimi ("ROSSI A." e "ROSSI M.") si ferma: non mette
 * l'orario di un collega.
 */
function _orariDocente_(d, nome) {
  var chiave = _orariChiave_(nome);
  for (var i = 0; i < d.docenti.length; i++)
    if (_orariChiave_(d.docenti[i].nome) === chiave) return d.docenti[i];
  var comincia = [];
  for (var k = 0; k < d.docenti.length; k++)
    if (chiave && _orariChiave_(d.docenti[k].nome).indexOf(chiave) === 0) comincia.push(d.docenti[k]);
  if (comincia.length === 1) return comincia[0];
  if (comincia.length > 1) {
    var nomi = [];
    for (var n = 0; n < comincia.length; n++) nomi.push(comincia[n].nome);
    throw new Error('Nel tabellone "' + nome + '" puo\' essere ' + nomi.join(' o ') + ': nell\'applicazione ' +
      '(Orari, passo 4) scegli il tuo nome esatto dall\'elenco, poi rigenera e incolla DatiOrari.gs.');
  }
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

/**
 * Il fuso del calendario deve essere quello dello script. Google ripete una
 * serie alla stessa ora nel fuso del calendario: in un calendario UTC (come
 * quelli creati da Campanella 1.5, senza fuso) una lezione delle 8 resta alle
 * 6 UTC, e dalla fine dell'ora legale (l'ultima domenica di ottobre) compare
 * alle 7. Se il fuso e' un altro e nel periodo non ci sono lezioni di
 * Campanella, glielo imposta e torna il fuso di prima; se ci sono, si ferma
 * senza toccare niente e spiega come sistemare. '' se era gia' giusto: ma
 * anche allora si ferma se ci sono serie di Campanella nate con un altro
 * fuso (un calendario della 1.5 a cui il docente ha cambiato il fuso a mano:
 * le serie gia' messe restano nel loro, _orariSerieNelFusoDiPrima_).
 */
function _orariSistemaFuso_(cal, c, periodo) {
  var fuso = Session.getScriptTimeZone();
  var suo = String(cal.getTimeZone() || '');
  if (suo === fuso) {
    var diPrima = _orariSerieNelFusoDiPrima_(cal, c, periodo);
    if (diPrima) throw new Error(diPrima + '\nNon ho aggiunto, cambiato ne\' tolto niente.');
    return '';
  }
  var problema = _orariLezioniNelFusoSbagliato_(cal, c, periodo, suo, fuso);
  if (problema) throw new Error(problema + '\nNon ho aggiunto, cambiato ne\' tolto niente.');
  cal.setTimeZone(fuso);
  return suo || '(nessuno)';
}

/**
 * Dopo _orariSistemaFuso_ (fusoDiPrima: il fuso che il calendario aveva): il
 * calendario ripreso da Google, non l'oggetto di prima, che potrebbe
 * ricordare il fuso vecchio. Deve avere il fuso dello script: se no Google
 * non l'ha cambiato, e si ferma prima di mettere lezioni, con il rimedio (un
 * calendario nuovo, che nasce con il fuso giusto: quello si' provato dal vivo).
 */
function _orariCalendarioColFusoNuovo_(c, fusoDiPrima) {
  var fuso = Session.getScriptTimeZone();
  var ripreso = _orariTrovaCalendario_(c.nome);
  var suo = ripreso ? String(ripreso.getTimeZone() || '') : '';
  if (ripreso && suo === fuso) return ripreso;
  throw new Error('Ho dato al calendario "' + c.nome + '" il fuso orario ' + fuso + ' (aveva ' + fusoDiPrima + '), ' +
    'ma Google dice che ha ancora ' + (suo || '(nessuno)') + ': le lezioni finirebbero a un\'altra ora, e ' +
    'dall\'ultima domenica di ottobre a fine marzo si sposterebbero di un\'ora. Non ho messo, cambiato ne\' tolto ' +
    'lezioni.\n' + _orariRimedioCalendarioNuovo_(c));
}

/**
 * La prova del fuso, sulla serie appena creata (id) di un tratto del piano
 * (voce): Google ripete una serie alla stessa ora nel fuso del calendario, e
 * se quel fuso non e' quello dello script (per esempio se setTimeZone, che
 * nessuno ha provato dal vivo, non valesse per le serie nuove) le lezioni
 * dopo un cambio dell'ora si spostano di un'ora. Se le lezioni della serie
 * passano un cambio dell'ora (in UTC non sono tutte alla stessa ora), devono
 * essere tutte alla stessa ora nel fuso dello script: provato. Torna
 * { provato, sbagliata, voce, attesa }: sbagliata e' la prima lezione a
 * un'altra ora, attesa l'ora giusta, voce quella di _orariNostri_ della
 * serie; provato e' falso anche se
 * la serie non passa un cambio dell'ora (si prova con la prossima).
 */
function _orariFusoDellaSerie_(cal, id, voce) {
  var fuori = { provato: false, sbagliata: null, voce: null, attesa: '' };
  var fuso = Session.getScriptTimeZone();
  var nostri = _orariNostri_(cal, _orariData_(voce.dal), _orariFineGiornata_(_orariData_(voce.al)));
  for (var i = 0; i < nostri.length; i++) {
    if (!nostri[i].serie || String(nostri[i].serie.getId()) !== String(id)) continue;
    var lezioni = nostri[i].lezioni;
    if (!lezioni.length) return fuori;
    var attesa = Utilities.formatDate(lezioni[0].inizio, fuso, 'HH:mm');
    var primaUtc = Utilities.formatDate(lezioni[0].inizio, 'UTC', 'HH:mm');
    var cambiaInUtc = false;
    for (var k = 1; k < lezioni.length; k++) {
      if (Utilities.formatDate(lezioni[k].inizio, fuso, 'HH:mm') !== attesa && !fuori.sbagliata) {
        fuori.sbagliata = lezioni[k];
      }
      if (Utilities.formatDate(lezioni[k].inizio, 'UTC', 'HH:mm') !== primaUtc) cambiaInUtc = true;
    }
    fuori.voce = nostri[i];
    fuori.attesa = attesa;
    fuori.provato = cambiaInUtc && !fuori.sbagliata;
    return fuori;
  }
  return fuori;
}

/**
 * Vero se fra le settimane di un tratto del piano (voce.dal, voce.al) c'e' un
 * cambio dell'ora nel fuso dello script (quello delle date qui): solo allora
 * la prova del fuso dice qualcosa, e vale la lettura del calendario.
 */
function _orariPassaUnCambioDellOra_(voce) {
  var primo = _orariData_(voce.dal), ultimo = _orariData_(voce.al);
  if (!primo || !ultimo) return false;
  for (var k = 1; ; k++) {
    var g = new Date(primo.getFullYear(), primo.getMonth(), primo.getDate() + 7 * k);
    if (g > ultimo) return false;
    if (g.getTimezoneOffset() !== primo.getTimezoneOffset()) return true;
  }
}

/** L'errore della prova del fuso andata male (_orariFusoDellaSerie_), con il rimedio. */
function _orariFusoSbagliato_(c, prova) {
  var fuso = Session.getScriptTimeZone();
  var l = prova.sbagliata;
  return 'Google non ripete le lezioni del calendario "' + c.nome + '" nel fuso orario ' + fuso + ' dello script: ' +
    'nella serie appena messa (' + _orariEtichetta_(prova.voce) + ') la lezione del ' + _orariChiaveData_(l.inizio) +
    ' compare alle ' + Utilities.formatDate(l.inizio, fuso, 'HH:mm') + ' invece che alle ' + prova.attesa + ', ' +
    'come in un calendario con un altro fuso orario. Mi sono fermato: in questo calendario non metto altre ' +
    'lezioni.\n' + _orariRimedioCalendarioNuovo_(c);
}

/** Il rimedio quando il calendario non tiene il fuso dello script: un calendario nuovo, che nasce con quel fuso. */
function _orariRimedioCalendarioNuovo_(c) {
  return 'Per sistemare: esegui ORARI_ANNULLA_calendario, che toglie le lezioni messe da Campanella e dimentica il ' +
    'lavoro a meta\'; poi in Google Calendar cambia il nome del calendario "' + c.nome + '" (o eliminalo, se non ci ' +
    'hai messo nient\'altro); poi esegui di nuovo ORARI_4_calendario, che crea un calendario nuovo con il fuso ' +
    'orario dello script. Se l\'orario e\' cambiato a meta\' anno, prima ORARI_4_calendario con il DatiOrari.gs ' +
    'dell\'orario di prima, poi ORARI_5_cambioOrario con quello nuovo.';
}

/**
 * Le lezioni di Campanella nel periodo, in un calendario con un fuso diverso
 * da quello dello script: che cosa succede e come si sistema. '' se non ce
 * ne sono (allora basta cambiare il fuso). Per ORARI_1_anteprima e per
 * _orariSistemaFuso_.
 */
function _orariLezioniNelFusoSbagliato_(cal, c, periodo, suo, fuso) {
  var gia = _orariNostri_(cal, periodo.inizio, _orariFineGiornata_(periodo.fine)).length;
  if (!gia) return '';
  return 'Il calendario "' + c.nome + '" ha il fuso orario ' + (suo || '(nessuno)') + ', non ' + fuso + ' come lo ' +
    'script, e ci sono gia\' ' + gia + ' serie o lezioni messe da Campanella fra il ' + c.inizio + ' e il ' + c.fine +
    ' (con una versione di prima, che creava il calendario senza fuso). Google ripete le lezioni alla stessa ora ' +
    'del fuso del calendario: con UTC, dalla fine dell\'ora legale (l\'ultima domenica di ottobre) compaiono ' +
    'un\'ora prima. Cambiare il fuso del calendario dalle impostazioni di Google Calendar non basta: le lezioni ' +
    'gia\' messe restano nel fuso di prima.\nPer sistemare: esegui ORARI_ANNULLA_calendario, che toglie le lezioni ' +
    'messe da Campanella nel periodo, e poi ORARI_4_calendario, che mette al calendario il fuso giusto e rimette ' +
    'l\'orario (se Google non lo lascia cambiare, ORARI_4_calendario se ne accorge, si ferma e dice come fare con un ' +
    'calendario nuovo). ' + _orariDopoIlRimedio_();
}

/**
 * Le serie di Campanella nel periodo nate con un altro fuso, in un
 * calendario che ha gia' quello dello script (cal): un calendario della 1.5,
 * nato in UTC, a cui il docente ha cambiato il fuso dalle impostazioni di
 * Google Calendar. Le serie gia' messe restano nel fuso che il calendario
 * aveva quando sono nate (_orariSerieNataInUnAltroFuso_), e dalla fine
 * dell'ora legale le lezioni compaiono un'ora prima. Che cosa succede, con
 * una lezione per esempio, e come si sistema; '' se non ce ne sono. Per
 * ORARI_1_anteprima e per _orariSistemaFuso_.
 */
function _orariSerieNelFusoDiPrima_(cal, c, periodo) {
  var fuso = Session.getScriptTimeZone();
  var nostri = _orariNostri_(cal, periodo.inizio, _orariFineGiornata_(periodo.fine));
  var quante = 0, esempio = null;
  for (var i = 0; i < nostri.length; i++) {
    if (!nostri[i].lezioni) continue;                  // un evento singolo: da solo non si ripete
    var prova = _orariSerieNataInUnAltroFuso_(nostri[i], fuso);
    if (!prova) continue;
    quante++;
    if (!esempio) esempio = { voce: nostri[i], sbagliata: prova.sbagliata, attesa: prova.attesa };
  }
  if (!quante) return '';
  var una = (quante === 1);
  var l = esempio.sbagliata;
  return 'Il calendario "' + c.nome + '" ha il fuso orario ' + fuso + ', come lo script, ma ' +
    (una ? 'una serie messa' : quante + ' serie messe') + ' da Campanella fra il ' + c.inizio + ' e il ' + c.fine +
    (una ? ' ripete' : ' ripetono') + ' le lezioni alla stessa ora del fuso che il calendario aveva quando ' +
    (una ? 'e\' stata messa' : 'sono state messe') + ' (UTC, con Campanella 1.5 o prima, che creava il calendario ' +
    'senza fuso): dalla fine dell\'ora legale (l\'ultima domenica di ottobre) le lezioni compaiono un\'ora prima. ' +
    'Per esempio ' + _orariEtichetta_(esempio.voce) + ': la lezione del ' + _orariChiaveData_(l.inizio) + ' e\' alle ' +
    Utilities.formatDate(l.inizio, fuso, 'HH:mm') + ' invece che alle ' + esempio.attesa + '. Cambiare il fuso del ' +
    'calendario dalle impostazioni di Google Calendar non basta: le lezioni gia\' messe restano nel fuso di prima.\n' +
    'Per sistemare: esegui ORARI_ANNULLA_calendario, che toglie le lezioni messe da Campanella nel periodo, e poi ' +
    'ORARI_4_calendario, che rimette l\'orario nel fuso del calendario (se Google non lo tiene, ORARI_4_calendario ' +
    'se ne accorge dalla prima serie che passa un cambio dell\'ora, si ferma e dice come fare con un calendario ' +
    'nuovo). ' + _orariDopoIlRimedio_();
}

/** La fine del rimedio per le lezioni nel fuso sbagliato: le modifiche a mano si perdono, e l'orario cambiato a meta' anno. */
function _orariDopoIlRimedio_() {
  return 'Cosi\' si perdono le modifiche fatte a mano alle lezioni (spostate, cancellate, cambiate): se ne avevi ' +
    'fatte, rifalle dopo. Se l\'orario e\' gia\' cambiato a meta\' anno, rimetti prima con ORARI_4_calendario il ' +
    'DatiOrari.gs dell\'orario di prima, poi incolla quello nuovo ed esegui ORARI_5_cambioOrario.';
}

/**
 * Se una serie di Campanella (una voce di _orariNostri_) e' nata in un
 * calendario con un altro fuso. Una serie si ripete alla stessa ora del fuso
 * che il calendario aveva quando e' nata: nata in UTC, dopo un cambio
 * dell'ora ha le lezioni alla stessa ora UTC e a un'altra ora nel fuso dello
 * script (fuso). Le lezioni si dividono per lo scarto fra le due ore (uno
 * con l'ora legale, uno senza): la serie e' nata in un altro fuso se in un
 * gruppo diverso da quello della prima lezione l'ora piu' frequente UTC e'
 * la stessa di quel gruppo, e quella nel fuso dello script no (conta la piu'
 * frequente: una lezione spostata a mano non decide). Torna { sbagliata,
 * attesa }: la prima lezione a un'altra ora, e l'ora delle lezioni come la
 * prima; null se la serie va bene o non passa un cambio dell'ora.
 */
function _orariSerieNataInUnAltroFuso_(voce, fuso) {
  var gruppi = [], primo = 0;
  for (var i = 0; i < voce.lezioni.length; i++) {
    var l = voce.lezioni[i];
    if (l.inizio < voce.lezioni[primo].inizio) primo = i;
    var qui = Utilities.formatDate(l.inizio, fuso, 'HH:mm');
    var utc = Utilities.formatDate(l.inizio, 'UTC', 'HH:mm');
    var scarto = (_orariMinutiDi_(qui) - _orariMinutiDi_(utc) + 24 * 60) % (24 * 60);
    var g = -1;
    for (var k = 0; k < gruppi.length; k++) if (gruppi[k].scarto === scarto) g = k;
    if (g < 0) {
      gruppi.push({ scarto: scarto, qui: [], utc: [], lezioni: [] });
      g = gruppi.length - 1;
    }
    gruppi[g].qui.push(qui);
    gruppi[g].utc.push(utc);
    gruppi[g].lezioni.push(l);
  }
  if (gruppi.length < 2) return null;
  var suo = null;
  for (var h = 0; h < gruppi.length; h++) if (gruppi[h].lezioni.indexOf(voce.lezioni[primo]) >= 0) suo = gruppi[h];
  var attesa = _orariPiuFrequente_(suo.qui, '');
  var utcAttesa = _orariPiuFrequente_(suo.utc, '');
  for (var j = 0; j < gruppi.length; j++) {
    var altro = gruppi[j];
    if (altro === suo) continue;
    if (_orariPiuFrequente_(altro.utc, '') !== utcAttesa || _orariPiuFrequente_(altro.qui, '') === attesa) continue;
    for (var m = 0; m < altro.lezioni.length; m++) {
      if (altro.qui[m] !== attesa) return { sbagliata: altro.lezioni[m], attesa: attesa };
    }
  }
  return null;
}

/** "08:50" -> minuti dalla mezzanotte. */
function _orariMinutiDi_(hhmm) {
  return Number(String(hhmm).slice(0, 2)) * 60 + Number(String(hhmm).slice(3, 5));
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

/** Il testo di una casella della griglia (giorno, ora da 0): per il calendario e per i messaggi. */
function _cella_(celle, d, giorno, ora) {
  var i = giorno * d.ore + ora;
  return (i < celle.length) ? (celle[i] || '') : '';
}

/** Una casella come si legge: "D" (e le sue varianti) e' "a disposizione". */
function _mostraCella_(v) {
  if (!v) return '';
  var s = String(v).trim().toUpperCase();
  if (s === 'D' || s === 'DISP' || s === 'DISP.' || s === 'DISPOSIZIONE') return 'a disposizione';
  return String(v).trim();
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

/**
 * La descrizione di una serie: di chi e', il giorno, le ore e, se c'e' dal,
 * il giorno della prima lezione ("serie dal 2026-10-12"), che
 * _orariPrimaLezione_ rilegge. L'impronta del piano la usa senza dal, come
 * le versioni di prima.
 */
function _orariDescrizione_(docente, blocco, d, dal) {
  var ore = (blocco.oraDa === blocco.oraA)
    ? blocco.oraDa + 'a ora'
    : 'dalla ' + blocco.oraDa + 'a alla ' + blocco.oraA + 'a ora';
  return '[Campanella] Orario di ' + docente + ', ' + d.giorni[blocco.giorno] + ', ' + ore +
         (dal ? ', serie dal ' + dal : '') +
         (d.periodo ? ' (' + d.periodo + ')' : '') +
         '. Se qualcosa non torna, l\'orario ufficiale resta quello pubblicato dalla scuola.';
}


// [SOLO EMAIL] -----------------------------------------------------------------
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
// [FINE SOLO EMAIL] ------------------------------------------------------------


// ===========================================================================
//  UTILITA'
// ===========================================================================
function _orariDati_() {
  if (typeof ORARI === 'undefined') {
    throw new Error('Manca il file "DatiOrari.gs".\n' +
      'Nell\'applicazione Campanella, pagina Orari, copia i dati dell\'orario (il file DatiOrari.gs) e ' +
      'incollali in un nuovo file dell\'editor chiamato DatiOrari.');
  }
  if (!ORARI.docenti || !ORARI.docenti.length) {
    throw new Error('In DatiOrari.gs non c\'e\' nessun docente.');
  }
  // [SOLO CALENDARIO.GS] -------------------------------------------------------
  // // nel progetto dell'altro account vanno i dati del solo docente: quelli di
  // // tutto il tabellone (del passo 3, o del progetto della scuola) portano
  // // qui i colleghi e gli orari delle classi
  // if (ORARI.docenti.length > 1 || typeof ORARI.classi !== 'undefined' ||
  //     typeof ORARI.oggettoDocente !== 'undefined' || typeof ORARI.nota !== 'undefined') {
  //   throw new Error('Questo DatiOrari.gs e\' quello di tutto il tabellone (' + ORARI.docenti.length + ' docenti' +
  //     (ORARI.classi ? ', con gli orari delle classi' : '') + '): in questo account vanno soltanto i dati del tuo ' +
  //     'orario. Nell\'applicazione, pagina Orari, passo 4 ("in un altro account Google"), copia i "Dati del tuo ' +
  //     'orario" (voce 2 del menu) e incollali qui nel file DatiOrari, al posto di tutto quello che c\'e\'. Non ho ' +
  //     'toccato il calendario.');
  // }
  // [FINE SOLO CALENDARIO.GS] --------------------------------------------------
  return ORARI;
}

// [SOLO EMAIL] -----------------------------------------------------------------
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
// [FINE SOLO EMAIL] ------------------------------------------------------------

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
