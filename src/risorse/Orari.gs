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
 *    ORARI_2_invia ............. manda a te una email per docente (a blocchi,
 *                                riprende da sola se finisce il tempo)
 *    ORARI_3_inviaOrariClassi .. manda a te anche gli orari delle classi
 *                                (anche questa riprende da sola)
 *    ORARI_4_calendario ........ mette il tuo orario (il nome scelto
 *                                nell'applicazione) su Google Calendar, nel
 *                                calendario indicato (lo crea se non c'e')
 *    ORARI_ANNULLA_calendario .. toglie dal calendario gli eventi messi qui
 *    ORARI_ANNULLA_invio ....... dimentica a che punto erano gli invii
 *
 *  PERMESSI
 *    Google calcola i permessi sull'intero progetto, guardando il codice di
 *    tutti i file. Con questo file nel progetto, alla prima esecuzione chiede
 *    quindi anche il permesso per il Calendario, anche se usi solo le email:
 *    e' normale. Le email partono con MailApp, l'etichetta la mette GmailApp
 *    e il tuo indirizzo lo dice Session. Il Calendario lo usano soltanto
 *    ORARI_4_calendario e ORARI_ANNULLA_calendario, che toccano solo il
 *    calendario che indichi e solo gli eventi creati qui (riconoscibili da
 *    un contrassegno).
 * ============================================================================
 */

var _ORARI_VERSIONE      = '1.4.6';
var _ORARI_MAX_SECONDI   = 260;
var _ORARI_CHIAVE        = 'CAMPANELLA_ORARI_PROGRESSO';
var _ORARI_CHIAVE_CLASSI = 'CAMPANELLA_ORARI_CLASSI_PROGRESSO';
var _ORARI_TRIGGER       = 'ORARI_2_invia';
var _ORARI_TRIGGER_CLASSI = 'ORARI_3_inviaOrariClassi';
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
    var occupato = 'Un invio (o il riordino della posta) e\' ancora in corso: riprova fra ' +
                   'qualche minuto. Non ho dimenticato niente.';
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
    var occupato = 'Un altro invio (o il riordino della posta) e\' ancora in corso: ' +
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
//  settimanale, dal primo giorno utile fino alla data di fine. Gli eventi
//  portano un contrassegno, cosi' ORARI_ANNULLA_calendario toglie solo loro.
// ===========================================================================
function ORARI_4_calendario() {
  var d = _orariDati_();
  var c = _orariCalendarioConfig_(d);
  var doc = _orariDocente_(d, c.docente);
  var inizio = _orariData_(c.inizio);
  var fine = _orariData_(c.fine);
  if (!inizio || !fine) throw new Error('Le date di inizio e fine vanno scritte come aaaa-mm-gg.');
  if (fine < inizio) throw new Error('La data di fine viene prima di quella di inizio.');

  var fineGiornata = new Date(fine.getTime());
  fineGiornata.setHours(23, 59, 59, 0);

  var cal = _orariTrovaCalendario_(c.nome);
  var creato = false;
  if (!cal) {
    cal = CalendarApp.createCalendar(c.nome, {
      summary: 'Orario scolastico messo da Campanella. Gli eventi si tolgono con ORARI_ANNULLA_calendario.'
    });
    creato = true;
  } else {
    // rieseguire sopra un orario gia' messo raddoppierebbe ogni lezione
    var gia = _orariNostri_(cal, inizio, fineGiornata).length;
    if (gia) {
      throw new Error('Nel calendario "' + c.nome + '" ci sono gia\' ' + gia + ' serie di eventi ' +
        'messe da Campanella fra il ' + c.inizio + ' e il ' + c.fine + ': rimettendole, ogni ' +
        'lezione comparirebbe due volte.\n' +
        'Se l\'orario e\' cambiato, esegui prima ORARI_ANNULLA_calendario e poi di nuovo ' +
        'ORARI_4_calendario.');
    }
  }
  if (c.colore) {
    try { cal.setColor(CalendarApp.Color[c.colore] || c.colore); } catch (e) { /* colore non riconosciuto */ }
  }

  var ricorrenza = CalendarApp.newRecurrence().addWeeklyRule().until(fineGiornata);

  var blocchi = _orariBlocchi_(doc.celle, d);
  var fatti = 0, saltati = 0;
  for (var b = 0; b < blocchi.length; b++) {
    var blocco = blocchi[b];
    var giornoSettimana = _orariGiornoSettimana_(d.giorni[blocco.giorno]);
    if (giornoSettimana < 0) { saltati++; continue; }

    var primo = _orariPrimoGiorno_(inizio, giornoSettimana);
    if (primo > fine) { saltati++; continue; }   // il periodo non contiene quel giorno

    var da = _orariOraDel_(primo, c.inizioOre, blocco.oraDa, c.minutiOra, false);
    var a  = _orariOraDel_(primo, c.inizioOre, blocco.oraA,  c.minutiOra, true);

    var serie = cal.createEventSeries(blocco.testo, da, a, ricorrenza);
    serie.setDescription(_orariDescrizione_(doc.nome, blocco, d));
    serie.setTag(_ORARI_TAG, _ORARI_TAG_VALORE);
    fatti++;
  }

  var testo = (creato ? 'Creato il calendario "' + c.nome + '".\n' : 'Uso il calendario "' + c.nome + '".\n') +
    'Orario di ' + doc.nome + ': ' + fatti + ' eventi settimanali dal ' + c.inizio + ' al ' + c.fine + '.' +
    (saltati ? '\nSaltati ' + saltati + ' blocchi (giorno non riconosciuto o fuori dal periodo).' : '') +
    '\n\nSe qualcosa non va, ORARI_ANNULLA_calendario toglie solo questi eventi e lascia ' +
    'il resto del calendario com\'e\'.';
  Logger.log(testo);
  return testo;
}

function ORARI_ANNULLA_calendario() {
  var d = _orariDati_();
  var c = _orariCalendarioConfig_(d);
  var cal = _orariTrovaCalendario_(c.nome);
  if (!cal) {
    var niente = 'Non c\'e\' nessun calendario chiamato "' + c.nome + '": niente da togliere.';
    Logger.log(niente);
    return niente;
  }
  var inizio = _orariData_(c.inizio) || new Date(2000, 0, 1);
  var fine = _orariData_(c.fine) || new Date(2100, 0, 1);
  fine.setHours(23, 59, 59, 0);

  var nostri = _orariNostri_(cal, inizio, fine);
  for (var i = 0; i < nostri.length; i++) {
    if (nostri[i].serie) nostri[i].serie.deleteEventSeries();
    else nostri[i].evento.deleteEvent();
  }
  var testo = 'Tolti ' + nostri.length + ' eventi messi da Campanella dal calendario "' + c.nome +
              '". Il calendario e gli altri eventi restano.';
  Logger.log(testo);
  return testo;
}

// --- pezzi del calendario ---------------------------------------------------
/** Gli eventi messi da Campanella nel periodo: una voce per ogni serie, o per l'evento singolo. */
function _orariNostri_(cal, inizio, fine) {
  var eventi = cal.getEvents(inizio, fine);
  var serieViste = {};
  var fuori = [];
  for (var i = 0; i < eventi.length; i++) {
    var ev = eventi[i];
    var nostro = false;
    try { nostro = (ev.getTag(_ORARI_TAG) === _ORARI_TAG_VALORE); } catch (e) { }
    if (!nostro) {
      try { nostro = String(ev.getDescription() || '').indexOf('[Campanella]') === 0; } catch (e2) { }
    }
    if (!nostro) continue;

    var serie = null;
    try { serie = ev.getEventSeries(); } catch (e3) { serie = null; }
    if (serie) {
      var id = serie.getId();
      if (serieViste[id]) continue;
      serieViste[id] = true;
      fuori.push({ serie: serie });
    } else {
      fuori.push({ evento: ev });
    }
  }
  return fuori;
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
    colore: String(c.colore || '').trim().toUpperCase()
  };
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

function _orariTrovaCalendario_(nome) {
  var trovati = CalendarApp.getCalendarsByName(nome);
  return (trovati && trovati.length) ? trovati[0] : null;
}

/** "2026-09-14" -> Date a mezzanotte, nel fuso dello script. null se non e' una data. */
function _orariData_(s) {
  var m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  var giorno = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return isNaN(giorno.getTime()) ? null : giorno;
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

function _togliTriggerOrari_(funzione) {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++)
    if (t[i].getHandlerFunction() === funzione) ScriptApp.deleteTrigger(t[i]);
}
