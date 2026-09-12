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
 *    ORARI_4_calendario ........ mette l'orario del docente scelto su Google
 *                                Calendar, nel calendario indicato (lo crea
 *                                se non c'e')
 *    ORARI_ANNULLA_calendario .. toglie dal calendario gli eventi messi qui
 *    ORARI_ANNULLA_invio ....... dimentica a che punto era l'invio
 *
 *  PERMESSI
 *    Le funzioni 1-3 usano solo Gmail. La 4 chiede anche il permesso per il
 *    Calendario: Google lo ripropone alla prima esecuzione, ed e' normale.
 *    Lo script tocca soltanto il calendario che gli indichi e soltanto gli
 *    eventi che ha creato lui (riconoscibili da un contrassegno).
 * ============================================================================
 */

var _ORARI_MAX_SECONDI = 260;
var _ORARI_CHIAVE      = 'CAMPANELLA_ORARI_PROGRESSO';
var _ORARI_TRIGGER     = 'ORARI_2_invia';
var _ORARI_ETICHETTA   = 'Scuola/Orari';
var _ORARI_TAG         = 'campanella';       // contrassegno degli eventi creati qui
var _ORARI_TAG_VALORE  = 'orario';


// ===========================================================================
//  1 - ANTEPRIMA
// ===========================================================================
function ORARI_1_anteprima() {
  var d = _orariDati();
  var righe = [];
  righe.push('ANTEPRIMA - non viene mandato niente.');
  righe.push('');
  righe.push('Periodo: ' + (d.periodo || '(non indicato)'));
  righe.push('Docenti nel file: ' + d.docenti.length);
  righe.push('Giorni: ' + d.giorni.join(' ') + '   Ore al giorno: ' + d.ore);
  righe.push('Destinatario: ' + _mioIndirizzoOrari() + ' (solo tu)');
  righe.push('');

  var elenco = _daMandare(d);
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
    righe.push(_testoSemplice(primo.griglia, d));
  } else {
    righe.push('(niente da mandare)');
  }

  var testo = righe.join('\n');
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  2 - INVIO (a te stesso)
// ===========================================================================
function ORARI_2_invia() {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(5000)) {
    var occupato = 'Un altro invio e\' ancora in corso: aspetta che finisca.';
    Logger.log(occupato);
    return occupato;
  }
  try { return _orariInvia(); }
  finally { lock.releaseLock(); }
}

function _orariInvia() {
  var d = _orariDati();
  var prop = PropertiesService.getUserProperties();
  var scadenza = Date.now() + _ORARI_MAX_SECONDI * 1000;
  var elenco = _daMandare(d);
  var stato = JSON.parse(prop.getProperty(_ORARI_CHIAVE) || '{"i":0,"mandati":0}');

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
      prop.setProperty(_ORARI_CHIAVE, JSON.stringify(stato));
      var fermo = 'Quota giornaliera esaurita dopo ' + stato.mandati + ' messaggi.\n' +
        'Riesegui ORARI_2_invia domani: riparte da dove si e\' fermato.';
      Logger.log(fermo);
      return fermo;
    }

    var m = elenco[stato.i];
    try {
      MailApp.sendEmail({
        to: m.a,
        subject: m.oggetto,
        body: _testoSemplice(m.griglia, d),
        htmlBody: _html(m.titolo, m.griglia, d),
        name: 'Orari'
      });
      stato.mandati++;
    } catch (e) {
      Logger.log('Non mandato "' + m.oggetto + '": ' + e.message);
    }
    stato.i++;
    if (stato.i % 10 === 0) prop.setProperty(_ORARI_CHIAVE, JSON.stringify(stato));
    Utilities.sleep(200);
  }

  if (interrotto) {
    prop.setProperty(_ORARI_CHIAVE, JSON.stringify(stato));
    _programmaRipresaOrari();
    var parziale = 'Tempo massimo raggiunto: mandati ' + stato.mandati + ' su ' +
      elenco.length + '. Riprende da solo fra un minuto.';
    Logger.log(parziale);
    return parziale;
  }

  prop.deleteProperty(_ORARI_CHIAVE);
  _togliTriggerOrari();
  _etichettaInviati(d);

  var fine = 'FATTO: mandati ' + stato.mandati + ' messaggi su ' + elenco.length + '.\n' +
    'Li trovi nella tua Posta in arrivo: cerca il cognome per ritrovare l\'orario di un collega.';
  Logger.log(fine);
  return fine;
}

function ORARI_ANNULLA_invio() {
  PropertiesService.getUserProperties().deleteProperty(_ORARI_CHIAVE);
  _togliTriggerOrari();
  var testo = 'Dimenticato il punto in cui era arrivato l\'invio: il prossimo ORARI_2_invia ' +
              'ricomincia dal primo docente.';
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  3 - ORARI DELLE CLASSI (sempre e solo a te)
// ===========================================================================
function ORARI_3_inviaOrariClassi() {
  var d = _orariDati();
  if (!d.classi || !d.classi.length) {
    throw new Error('In DatiOrari.gs non ci sono gli orari delle classi.\n' +
      'Nell\'applicazione, nella pagina Orari, spunta "Prepara anche gli orari ' +
      'delle classi" e rigenera i dati.');
  }
  var mio = _mioIndirizzoOrari();
  var mandati = 0;
  var scadenza = Date.now() + _ORARI_MAX_SECONDI * 1000;

  for (var i = 0; i < d.classi.length && Date.now() < scadenza; i++) {
    if (MailApp.getRemainingDailyQuota() <= 0) break;
    var c = d.classi[i];
    var oggetto = (d.oggettoClasse || 'Orario classe {classe}')
                    .replace(/\{classe\}/g, c.nome)
                    .replace(/\{periodo\}/g, d.periodo || '');
    MailApp.sendEmail({
      to: mio,
      subject: oggetto,
      body: _testoSemplice(c.celle, d),
      htmlBody: _html('Classe ' + c.nome, c.celle, d),
      name: 'Orari'
    });
    mandati++;
    Utilities.sleep(200);
  }

  var testo = 'Mandati ' + mandati + ' orari di classe a ' + mio + '.';
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  4 - GOOGLE CALENDAR
//  Ogni blocco di ore consecutive della stessa classe diventa un evento
//  settimanale, dal primo giorno utile fino alla data di fine. Gli eventi
//  portano un contrassegno, cosi' ORARI_ANNULLA_calendario toglie solo loro.
// ===========================================================================
function ORARI_4_calendario() {
  var d = _orariDati();
  var c = _orariCalendarioConfig(d);
  var doc = _orariDocente(d, c.docente);
  var inizio = _orariData(c.inizio);
  var fine = _orariData(c.fine);
  if (!inizio || !fine) throw new Error('Le date di inizio e fine vanno scritte come aaaa-mm-gg.');
  if (fine < inizio) throw new Error('La data di fine viene prima di quella di inizio.');

  var cal = _orariTrovaCalendario(c.nome);
  var creato = false;
  if (!cal) {
    cal = CalendarApp.createCalendar(c.nome, {
      summary: 'Orario scolastico messo da Campanella. Gli eventi si tolgono con ORARI_ANNULLA_calendario.'
    });
    creato = true;
  }
  if (c.colore) {
    try { cal.setColor(CalendarApp.Color[c.colore] || c.colore); } catch (e) { /* colore non riconosciuto */ }
  }

  var fineGiornata = new Date(fine.getTime());
  fineGiornata.setHours(23, 59, 59, 0);
  var ricorrenza = CalendarApp.newRecurrence().addWeeklyRule().until(fineGiornata);

  var blocchi = _orariBlocchi(doc.celle, d);
  var fatti = 0, saltati = 0;
  for (var b = 0; b < blocchi.length; b++) {
    var blocco = blocchi[b];
    var giornoSettimana = _orariGiornoSettimana(d.giorni[blocco.giorno]);
    if (giornoSettimana < 0) { saltati++; continue; }

    var primo = _orariPrimoGiorno(inizio, giornoSettimana);
    if (primo > fine) { saltati++; continue; }   // il periodo non contiene quel giorno

    var da = _orariOraDel(primo, c.inizioOre, blocco.oraDa, c.minutiOra, false);
    var a  = _orariOraDel(primo, c.inizioOre, blocco.oraA,  c.minutiOra, true);

    var serie = cal.createEventSeries(blocco.testo, da, a, ricorrenza);
    serie.setDescription(_orariDescrizione(doc.nome, blocco, d));
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
  var d = _orariDati();
  var c = _orariCalendarioConfig(d);
  var cal = _orariTrovaCalendario(c.nome);
  if (!cal) {
    var niente = 'Non c\'e\' nessun calendario chiamato "' + c.nome + '": niente da togliere.';
    Logger.log(niente);
    return niente;
  }
  var inizio = _orariData(c.inizio) || new Date(2000, 0, 1);
  var fine = _orariData(c.fine) || new Date(2100, 0, 1);
  fine.setHours(23, 59, 59, 0);

  var eventi = cal.getEvents(inizio, fine);
  var serieViste = {};
  var tolti = 0;
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
      serie.deleteEventSeries();
    } else {
      ev.deleteEvent();
    }
    tolti++;
  }
  var testo = 'Tolti ' + tolti + ' eventi messi da Campanella dal calendario "' + c.nome +
              '". Il calendario e gli altri eventi restano.';
  Logger.log(testo);
  return testo;
}

// --- pezzi del calendario ---------------------------------------------------
function _orariCalendarioConfig(d) {
  var c = d.calendario;
  if (!c || !c.docente) {
    throw new Error('In DatiOrari.gs non c\'e\' la parte "calendario".\n' +
      'Nell\'applicazione, pagina Orari, passo 4: scegli il docente, il nome del ' +
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

function _orariDocente(d, nome) {
  var chiave = _orariChiave(nome);
  for (var i = 0; i < d.docenti.length; i++)
    if (_orariChiave(d.docenti[i].nome) === chiave) return d.docenti[i];
  for (var k = 0; k < d.docenti.length; k++)
    if (_orariChiave(d.docenti[k].nome).indexOf(chiave) === 0) return d.docenti[k];
  throw new Error('Nel tabellone non trovo il docente "' + nome + '".');
}

function _orariChiave(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function _orariTrovaCalendario(nome) {
  var trovati = CalendarApp.getCalendarsByName(nome);
  return (trovati && trovati.length) ? trovati[0] : null;
}

/** "2026-09-14" -> Date a mezzanotte, nel fuso dello script. null se non e' una data. */
function _orariData(s) {
  var m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  var giorno = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return isNaN(giorno.getTime()) ? null : giorno;
}

/** Nome del giorno come sta in DatiOrari.gs -> 0 = domenica ... 6 = sabato. */
function _orariGiornoSettimana(nome) {
  var n = _orariChiave(nome);
  var nomi = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  for (var i = 0; i < nomi.length; i++) if (n.indexOf(nomi[i]) === 0) return i;
  var corti = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  for (var k = 0; k < corti.length; k++) if (n.indexOf(corti[k]) === 0) return k;
  return -1;
}

/** Il primo giorno >= inizio che cade nel giorno della settimana dato. */
function _orariPrimoGiorno(inizio, giornoSettimana) {
  var g = new Date(inizio.getTime());
  var salto = (giornoSettimana - g.getDay() + 7) % 7;
  g.setDate(g.getDate() + salto);
  return g;
}

/** Data e ora dell'inizio (o della fine, se `fine`) dell'ora di lezione n (1 = prima). */
function _orariOraDel(giorno, inizioOre, n, minutiOra, fine) {
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
function _orariBlocchi(celle, d) {
  var blocchi = [];
  for (var g = 0; g < d.giorni.length; g++) {
    var aperto = null;
    for (var o = 0; o < d.ore; o++) {
      var v = _mostraCella(_cella(celle, d, g, o));
      if (v === 'a disposizione') v = 'A disposizione';
      if (aperto && v && v === aperto.testo && aperto.oraA === o) { aperto.oraA = o + 1; continue; }
      if (!v) { aperto = null; continue; }
      aperto = { giorno: g, oraDa: o + 1, oraA: o + 1, testo: v };
      blocchi.push(aperto);
    }
  }
  return blocchi;
}

function _orariDescrizione(docente, blocco, d) {
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
function _daMandare(d) {
  var mio = _mioIndirizzoOrari();
  var fuori = [];
  for (var i = 0; i < d.docenti.length; i++) {
    var doc = d.docenti[i];
    if (_conteggioOre(doc.celle) === 0) continue;
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

function _conteggioOre(celle) {
  var n = 0;
  for (var i = 0; i < celle.length; i++) if (celle[i]) n++;
  return n;
}

function _cella(celle, d, giorno, ora) {
  var i = giorno * d.ore + ora;
  return (i < celle.length) ? (celle[i] || '') : '';
}

function _mostraCella(v) {
  if (!v) return '';
  var s = String(v).trim().toUpperCase();
  if (s === 'D' || s === 'DISP' || s === 'DISP.' || s === 'DISPOSIZIONE') return 'a disposizione';
  return String(v).trim();
}

function _html(titolo, celle, d) {
  var s = [];
  s.push('<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#202124">');
  s.push('<h2 style="margin:0 0 4px 0;font-size:18px">' + _fuga(titolo) + '</h2>');
  if (d.periodo) s.push('<div style="color:#5f6368;margin-bottom:14px">' + _fuga(d.periodo) + '</div>');

  s.push('<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px">');
  s.push('<tr><th style="' + _stileTh() + '">Ora</th>');
  for (var g = 0; g < d.giorni.length; g++)
    s.push('<th style="' + _stileTh() + '">' + _fuga(d.giorni[g]) + '</th>');
  s.push('</tr>');

  for (var o = 0; o < d.ore; o++) {
    s.push('<tr>');
    s.push('<td style="' + _stileTd() + 'font-weight:600;text-align:center;background:#f8f9fa">' +
           (o + 1) + '</td>');
    for (var gg = 0; gg < d.giorni.length; gg++) {
      var v = _mostraCella(_cella(celle, d, gg, o));
      var vuota = (v === '');
      s.push('<td style="' + _stileTd() + (vuota ? 'background:#fcfcfd' : '') + '">' +
             (vuota ? '&nbsp;' : _fuga(v)) + '</td>');
    }
    s.push('</tr>');
  }
  s.push('</table>');

  if (d.nota) s.push('<p style="color:#5f6368;margin-top:16px">' + _fuga(d.nota) + '</p>');
  s.push('<p style="color:#9aa0a6;font-size:11px;margin-top:18px">' +
         'Messaggio preparato automaticamente. Se qualcosa non torna, ' +
         'l\'orario ufficiale resta quello pubblicato dalla scuola.</p>');
  s.push('</div>');
  return s.join('');
}

function _stileTh() {
  return 'border:1px solid #dadce0;padding:6px 10px;background:#e8f0fe;text-align:center;';
}

function _stileTd() {
  return 'border:1px solid #dadce0;padding:6px 10px;white-space:nowrap;';
}

function _testoSemplice(celle, d) {
  var righe = [];
  var intest = 'Ora  ';
  for (var g = 0; g < d.giorni.length; g++) intest += _riempi(d.giorni[g], 16);
  righe.push(intest);
  righe.push(new Array(intest.length + 1).join('-'));
  for (var o = 0; o < d.ore; o++) {
    var r = _riempi(String(o + 1), 5);
    for (var gg = 0; gg < d.giorni.length; gg++)
      r += _riempi(_mostraCella(_cella(celle, d, gg, o)) || '-', 16);
    righe.push(r);
  }
  if (d.nota) { righe.push(''); righe.push(d.nota); }
  return righe.join('\n');
}

function _riempi(s, n) {
  s = String(s == null ? '' : s);
  while (s.length < n) s += ' ';
  return s;
}

function _fuga(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ===========================================================================
//  UTILITA'
// ===========================================================================
function _orariDati() {
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

function _mioIndirizzoOrari() {
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (err) { e = ''; }
  if (!e) throw new Error('Non riesco a sapere qual e\' il tuo indirizzo: riprova dopo aver ' +
                          'autorizzato lo script.');
  return e;
}

/** Se esiste l'etichetta degli orari, la metto ai messaggi appena mandati a me. */
function _etichettaInviati(d) {
  try {
    var etichetta = GmailApp.getUserLabelByName(_ORARI_ETICHETTA);
    if (!etichetta) return;
    var modello = (d.oggettoDocente || 'Orario {docente}').split('{')[0].trim() || 'Orario';
    var trovati = GmailApp.search('to:me from:me subject:"' + modello + '" newer_than:1d', 0, 100);
    if (trovati.length) etichetta.addToThreads(trovati);
  } catch (e) { /* non e' importante */ }
}

function _programmaRipresaOrari() {
  _togliTriggerOrari();
  ScriptApp.newTrigger(_ORARI_TRIGGER).timeBased().after(60 * 1000).create();
}

function _togliTriggerOrari() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++)
    if (t[i].getHandlerFunction() === _ORARI_TRIGGER) ScriptApp.deleteTrigger(t[i]);
}
