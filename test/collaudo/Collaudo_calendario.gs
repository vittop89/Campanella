/**
 * ============================================================================
 *  COLLAUDO DEL CALENDARIO DEGLI ORARI (per chi sviluppa Campanella)
 * ============================================================================
 *
 *  Prova dal vivo, su Google Calendar, le funzioni vere che mettono l'orario
 *  sul calendario (ORARI_1_anteprima, ORARI_4_calendario,
 *  ORARI_5_cambioOrario, ORARI_6_coloraLezioni, ORARI_ANNULLA_calendario),
 *  quelle di Calendario.gs, la versione solo calendario che l'applicazione
 *  prepara per un altro account (il personale, per esempio), o quelle di
 *  Orari.gs. Dati inventati: il docente PROVA COLLAUDO, le classi 2B, 3B e
 *  4C, ognuna con il suo colore, dal 12/10 al 13/11/2026 con due giorni senza
 *  lezione, e l'orario che cambia dal 02/11. L'ora legale finisce il 25/10,
 *  nel mezzo. Ai docenti non serve.
 *
 *  COME SI USA (per esempio nel tuo account personale)
 *    1. script.google.com, entrando con l'account da provare -> Nuovo
 *       progetto. Un progetto di prova, non quello con gli orari veri.
 *    2. Impostazioni progetto (l'ingranaggio a sinistra) -> Fuso orario:
 *       quello con Roma (Europe/Rome). Con un altro il collaudo non comincia.
 *    3. Editor: nel file Codice.gs incolla Calendario.gs (nell'applicazione:
 *       Orari, passo 4, "in un altro account Google", voce "1. Codice solo
 *       calendario", Copia negli appunti) al posto di tutto quello che c'e',
 *       e rinominalo Calendario; poi "+" -> Script, chiamalo
 *       Collaudo_calendario e incollaci questo file. Solo questi due: niente
 *       DatiOrari.gs (i dati li mette il collaudo). Al posto di Calendario.gs
 *       va bene anche src/risorse/Orari.gs, sempre in un progetto nuovo e
 *       senza la Posta.
 *    4. Scegli COLLAUDO in alto ed esegui. La prima volta Google chiede i
 *       permessi: con Calendario.gs solo il Calendario e l'esecuzione quando
 *       non sei presente (le riprese dei lavori lunghi); con Orari.gs anche
 *       quelli delle email, che vede nel suo codice. Il collaudo usa solo
 *       quello che usa Calendario.gs: niente email, niente posta, niente
 *       Drive, e nemmeno il tuo indirizzo.
 *    5. Copia tutto il registro dell'esecuzione. Ogni controllo ha una riga
 *       OK o NO; NOTA dice cosa fa Google dove nessuno l'aveva ancora
 *       provato; PASSO dice quanto ha preso ogni passo; in fondo il
 *       riepilogo. Le righe delle funzioni del calendario stanno in mezzo
 *       (con Orari.gs l'anteprima scrive anche il tuo indirizzo,
 *       Destinatario: toglilo se passi il registro ad altri).
 *    6. Se il riepilogo dice "Da fare", esegui le parti che nomina (per
 *       esempio COLLAUDO_2), una alla volta, e copia anche i loro registri.
 *  COLLAUDO fa le due parti qui sotto in un'esecuzione sola, se ci stanno.
 *  Google ferma uno script dopo 6 minuti: la seconda parte comincia solo se
 *  c'e' il tempo per finirla (_COLLAUDO_STIMA_PARTI), dopo 270 secondi non
 *  comincia piu' nessun passo, e alle funzioni del calendario resta solo il
 *  tempo fino a 300 secondi (_ORARI_MAX_SECONDI: poi si fermano da sole),
 *  cosi' la pulizia si fa sempre. COLLAUDO_1 e COLLAUDO_2 fanno una parte
 *  sola.
 *
 *  COSA CONTROLLA
 *    Parte 1 (COLLAUDO_1): il calendario "Collaudo Campanella", creato da
 *    ORARI_4_calendario.
 *    - L'anteprima: serie, lezioni saltate, colori.
 *    - Il calendario ha il fuso dello script; le lezioni sono proprio quelle
 *      dell'orario, alla stessa ora prima e dopo il 25/10, nessuna nei giorni
 *      senza lezione, ognuna con il colore della sua classe e il contrassegno.
 *    - Su una serie di prova, quello che nessuno ha provato dal vivo (NOTA):
 *      setTime e setColor su una lezione sola, poi setColor sulla serie.
 *    - Prima del cambio, come dall'interfaccia di Google: una lezione
 *      spostata (setTime, se sposta solo lei), una cancellata (deleteEvent)
 *      e una colorata a mano (setColor, se colora solo lei).
 *    - ORARI_5_cambioOrario: le settimane prima identiche (anche quelle tre,
 *      con i colori), dal 02/11 solo l'orario nuovo, giusto; rieseguito da'
 *      lo stesso calendario; una riunione che non e' di Campanella resta.
 *    - ORARI_6_coloraLezioni con i colori cambiati: ogni lezione quello nuovo
 *      della sua classe, tranne quella colorata a mano, e niente spostato.
 *    - ORARI_ANNULLA_calendario toglie tutte le lezioni e lascia la riunione.
 *    Parte 2 (COLLAUDO_2): il calendario "Collaudo Campanella vecchio",
 *    creato qui senza fuso come faceva la 1.5, con una serie di 2B messa come
 *    allora e una serie del ricevimento, che non e' di Campanella.
 *    - Il calendario e' in UTC, e la serie dal 26/10 compare un'ora prima.
 *    - L'anteprima dice che e' da sistemare; ORARI_4_calendario si ferma,
 *      spiega (si controlla il testo) e non tocca niente.
 *    - ORARI_ANNULLA_calendario e poi ORARI_4_calendario: le lezioni alla
 *      stessa ora prima e dopo il 25/10. E se setTimeZone ha cambiato l'ora
 *      del ricevimento, che c'era gia' (NOTA).
 *    Alla fine, anche se qualcosa va storto: via i calendari di prova
 *    (deleteCalendar), i lavori degli orari a meta' e le loro riprese.
 *
 *  COSA TOCCA
 *    Solo i calendari di prova, che crea e cancella lui: se uno con quel
 *    nome c'e' gia', si ferma senza toccare niente. Un collaudo fermato da
 *    Google prima di pulire si ricorda i nomi dei suoi calendari, e il
 *    collaudo dopo li cancella prima di cominciare. Si ferma anche se nel
 *    progetto trova DatiOrari.gs o la Posta: nel progetto vero toglierebbe un
 *    lavoro degli orari a meta' e le sue riprese. Usa soltanto servizi che
 *    usa anche Calendario.gs (il Calendario, i trigger, le proprieta' dello
 *    script e il suo fuso orario), quindi non chiede altri permessi.
 *
 *  In locale lo fa girare test/collaudo/prova_locale.js, con Orari.gs e con
 *  Calendario.gs, e con il finto calendario di test/mock_orari.js.
 * ============================================================================
 */

var ORARI;   // i dati degli orari: li mette il collaudo, passo per passo (niente DatiOrari.gs)

var _COLLAUDO_NOME           = 'Collaudo Campanella';
var _COLLAUDO_NOME_VECCHIO   = 'Collaudo Campanella vecchio';
var _COLLAUDO_NOMI           = ['', _COLLAUDO_NOME, _COLLAUDO_NOME_VECCHIO];  // il calendario di ogni parte
var _COLLAUDO_CHIAVE         = 'CAMPANELLA_COLLAUDO_CALENDARIO';  // i nomi dei calendari di un collaudo non ancora pulito
var _COLLAUDO_FUSO           = 'Europe/Rome';
// Google ferma uno script dopo 360 secondi. Dal vivo un'operazione sul
// calendario prende circa un secondo: la parte 1 un paio di minuti, la 2 uno,
// e il passo piu' lungo (ORARI_5_cambioOrario) meno di uno
var _COLLAUDO_LIMITE_PASSI   = 270;   // secondi: dopo, nessun passo nuovo, e la pulizia ha tempo
var _COLLAUDO_LIMITE_ORARI   = 300;   // secondi: le funzioni del calendario si fermano da sole entro qui
// quanto puo' prendere ogni parte: COLLAUDO comincia una parte dopo la prima
// solo se, con i secondi gia' passati, resta entro _COLLAUDO_LIMITE_PASSI
var _COLLAUDO_STIMA_PARTI    = [0, 180, 90];
var _COLLAUDO_DOCENTE        = 'PROVA COLLAUDO';
var _COLLAUDO_INIZIO         = '2026-10-12';   // un lunedi'
var _COLLAUDO_FINE           = '2026-11-13';   // un venerdi'
var _COLLAUDO_ORA_SOLARE     = '2026-10-26';   // il lunedi' dopo la fine dell'ora legale (domenica 25/10)
var _COLLAUDO_VALIDO_DAL     = '2026-11-02';   // l'orario nuovo vale da qui, un lunedi'
var _COLLAUDO_GIORNI = ['Lunedi\'', 'Martedi\'', 'Mercoledi\'', 'Giovedi\'', 'Venerdi\''];
var _COLLAUDO_ORE    = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'];
var _COLLAUDO_SOSPENSIONI = [
  { dal: '2026-10-20', al: '2026-10-20', nome: 'Giorno senza lezione (collaudo)' },   // un martedi' di 3B
  { dal: '2026-11-06', al: '2026-11-06', nome: 'Ponte (collaudo)' }                    // un venerdi' di 4C, orario nuovo
];
// l'orario di prima e quello nuovo: giorno 1 = lunedi', ore dalla "da" alla "a" comprese
var _COLLAUDO_PRIMA = [
  { classe: '2B', giorno: 1, da: 1, a: 2 },
  { classe: '3B', giorno: 2, da: 3, a: 3 },
  { classe: '4C', giorno: 4, da: 2, a: 2 }
];
var _COLLAUDO_DOPO = [
  { classe: '2B', giorno: 1, da: 1, a: 1 },
  { classe: '3B', giorno: 2, da: 4, a: 4 },
  { classe: '4C', giorno: 5, da: 2, a: 3 }
];
// i colori delle classi (CalendarApp.EventColor, da "1" a "11"): 9 Mirtillo,
// 10 Basilico, 6 Mandarino; per ORARI_6_coloraLezioni 2B diventa 5 Banana e 4C 3 Vinaccia
var _COLLAUDO_COLORI       = { '2B': '9', '3B': '10', '4C': '6' };
var _COLLAUDO_RIGA_COLORI  = 'Colori delle classi: 2B Mirtillo, 3B Basilico, 4C Mandarino.';
var _COLLAUDO_COLORI_NUOVI = { '2B': '5', '3B': '10', '4C': '3' };
// prima del cambio, come dall'interfaccia di Google Calendar
var _COLLAUDO_SPOSTATA   = { classe: '4C', da: '2026-10-22 09:00', a: '2026-10-23 11:00' };   // un'ora
var _COLLAUDO_CANCELLATA = { classe: '2B', il: '2026-10-26 08:00' };
var _COLLAUDO_COLORATA   = { classe: '2B', il: '2026-10-19 08:00', colore: '11' };            // Pomodoro
var _COLLAUDO_RIUNIONE   = { titolo: 'Riunione (collaudo)', il: '2026-10-28 15:00' };        // un'ora, non di Campanella
var _COLLAUDO_SONDA      = 'Prova del collaudo';      // la serie per le prove mai fatte: sabato 17-18, dal 17/10 al 31/10
var _COLLAUDO_RICEVIMENTO = 'Ricevimento (collaudo)'; // parte 2: mercoledi' 15-16, dal 14/10 all'11/11


// ===========================================================================
//  LE FUNZIONI DA ESEGUIRE
// ===========================================================================
function COLLAUDO() {
  return _collaudo_('COLLAUDO', [1, 2]);
}

function COLLAUDO_1() {
  return _collaudo_('COLLAUDO_1', [1]);
}

function COLLAUDO_2() {
  return _collaudo_('COLLAUDO_2', [2]);
}

/**
 * Le parti (1, 2) una dopo l'altra, con la pulizia alla fine anche se
 * qualcosa va storto; torna il riepilogo. Una parte dopo la prima comincia
 * solo se ci sta nel tempo (_COLLAUDO_STIMA_PARTI): se no resta da fare, e
 * il riepilogo dice di eseguirla a parte. _ORARI_MAX_SECONDI, che il
 * collaudo abbassa per ogni funzione del calendario, alla fine torna com'era.
 */
function _collaudo_(funzione, parti) {
  var t = { funzione: funzione, partenza: Date.now(), ok: 0, no: [], note: [], passi: [], fermo: false,
            fatte: [], daFare: [], maxOrari: null };
  var nomi = [];
  for (var i = 0; i < parti.length; i++) nomi.push(_COLLAUDO_NOMI[parti[i]]);
  Logger.log('COLLAUDO DEL CALENDARIO DEGLI ORARI (' + funzione + ')');
  var pronto = false;
  try {
    _collaudoPrepara_(t, nomi);
    pronto = true;
    t.maxOrari = _ORARI_MAX_SECONDI;
    for (var p = 0; p < parti.length; p++) {
      var gia = _collaudoSecondi_(t);
      if (t.fermo) {
        t.daFare.push(parti[p]);
        continue;
      }
      if (p > 0 && gia + _COLLAUDO_STIMA_PARTI[parti[p]] > _COLLAUDO_LIMITE_PASSI) {
        t.daFare.push(parti[p]);
        Logger.log('== PARTE ' + parti[p] + ': non la comincio. Sono gia\' passati ' + gia.toFixed(0) + ' secondi, ' +
                   'questa parte ne puo\' prendere ' + _COLLAUDO_STIMA_PARTI[parti[p]] + ' e Google ferma uno script ' +
                   'dopo 360: esegui COLLAUDO_' + parti[p] + ' a parte.');
        continue;
      }
      var inizio = Date.now();
      try {
        if (parti[p] === 1) _collaudoParte1_(t);
        else _collaudoParte2_(t);
      } catch (err) {
        _collaudoNo_(t, 'errore inatteso nel collaudo: ' + (err && err.message), err && err.stack);
      }
      // una parte fermata dal tempo resta da fare
      if (t.fermo) t.daFare.push(parti[p]);
      else t.fatte.push({ parte: parti[p], secondi: (Date.now() - inizio) / 1000 });
    }
  } catch (errPrima) {
    _collaudoNo_(t, 'non comincio: ' + (errPrima && errPrima.message));
  } finally {
    if (pronto) _collaudoPulisci_(t, nomi);
    ORARI = undefined;
    if (t.maxOrari !== null) _ORARI_MAX_SECONDI = t.maxOrari;
  }
  return _collaudoRiepilogo_(t);
}


// ===========================================================================
//  PARTE 1: IL CALENDARIO NUOVO
// ===========================================================================
function _collaudoParte1_(t) {
  var fuso = Session.getScriptTimeZone();
  _collaudoTitolo_(t, 'PARTE 1 (COLLAUDO_1): il calendario "' + _COLLAUDO_NOME + '", creato da ORARI_4_calendario');
  var prima = _collaudoAttese_(_COLLAUDO_PRIMA, _COLLAUDO_INIZIO);
  var nuovo = _collaudoAttese_(_COLLAUDO_DOPO, _COLLAUDO_VALIDO_DAL);

  // --- l'orario di prima: anteprima e ORARI_4_calendario
  ORARI = _collaudoDati_(_COLLAUDO_NOME, _COLLAUDO_PRIMA, _COLLAUDO_COLORI, '');
  var r = _collaudoOrari_(t, 'ORARI_1_anteprima', ORARI_1_anteprima);
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_1_anteprima dice ' + prima.serie + ' serie (' + prima.lezioni.length + ' lezioni) e ' +
    prima.saltate + ' lezione saltata nei giorni senza lezione',
    !r.errore && _collaudoContiene_(r.testo, ['Serie settimanali da creare con ORARI_4_calendario: ' + prima.serie + ' (' +
      prima.lezioni.length + ' lezioni)', 'Lezioni saltate nei giorni senza lezione: ' + prima.saltate + '\n']),
    _collaudoPerche_(r));
  _collaudoControlla_(t, 'ORARI_1_anteprima dice i colori delle classi ("' + _COLLAUDO_RIGA_COLORI + '")',
    !r.errore && _collaudoContiene_(r.testo, [_COLLAUDO_RIGA_COLORI]), _collaudoPerche_(r));

  r = _collaudoOrari_(t, 'ORARI_4_calendario', ORARI_4_calendario);
  if (t.fermo) return;
  var messo = _collaudoControlla_(t, 'ORARI_4_calendario mette l\'orario, in un calendario che crea con il fuso ' + fuso,
    !r.errore && _collaudoContiene_(r.testo, ['Creato il calendario "' + _COLLAUDO_NOME + '", con il fuso orario ' + fuso]),
    _collaudoPerche_(r));
  var cal = _collaudoCalendario_(_COLLAUDO_NOME);
  if (!_collaudoControlla_(t, 'c\'e\' il calendario "' + _COLLAUDO_NOME + '"', !!cal)) return;
  _collaudoControlla_(t, 'il calendario creato ha il fuso orario dello script (' + fuso + ')',
    String(cal.getTimeZone()) === fuso, 'ha il fuso orario ' + cal.getTimeZone());
  var lette = _collaudoLeggi_(t, cal, 'dopo ORARI_4_calendario');
  if (!lette) return;
  _collaudoControllaOrario_(t, lette, prima, _COLLAUDO_COLORI, 'dopo ORARI_4_calendario');
  var nostre = _collaudoNostre_(lette), senza = [];
  for (var i = 0; i < nostre.length; i++) if (!nostre[i].contrassegno) senza.push(nostre[i].chiave);
  _collaudoControlla_(t, 'dopo ORARI_4_calendario: ogni lezione ha il contrassegno di Campanella',
    nostre.length > 0 && !senza.length, nostre.length ? 'senza: ' + _collaudoElenco_(senza) : 'nessuna lezione');
  if (!messo) {
    Logger.log('Mi fermo qui con la parte 1: senza l\'orario messo da ORARI_4_calendario il resto non si prova.');
    return;
  }

  // --- una riunione che non e' di Campanella: nessuna funzione deve toccarla
  var inizioRiunione = _collaudoIstante_(_COLLAUDO_RIUNIONE.il), fineRiunione = _collaudoIstante_(_COLLAUDO_RIUNIONE.il, 60);
  r = _collaudoPasso_(t, 'createEvent: "' + _COLLAUDO_RIUNIONE.titolo + '", che non e\' di Campanella', function () {
    return cal.createEvent(_COLLAUDO_RIUNIONE.titolo, inizioRiunione, fineRiunione,
                           { description: 'Evento del collaudo: non e\' di Campanella.' });
  });
  if (t.fermo) return;
  if (r.errore) { _collaudoNo_(t, 'non riesco a creare la riunione', r.errore.message); return; }
  var altre = [_collaudoVoce_(_collaudoChiave_(_COLLAUDO_RIUNIONE.titolo, inizioRiunione, fineRiunione), '')];

  // --- quello che nessuno ha provato dal vivo, su una serie di prova
  var sonde = _collaudoSonde_(t, cal);
  if (t.fermo || !sonde) return;

  // --- prima del cambio: una lezione spostata, una cancellata e una colorata a mano (fatte: quelle
  // fatte davvero, anche se poi il controllo dice NO: il cambio d'orario le deve rimettere)
  t.lette = null;
  var attese = _collaudoVociAttese_(prima.lezioni, _COLLAUDO_COLORI);
  var fatte = { spostata: false, cancellata: false, colorata: false };
  var sp = _COLLAUDO_SPOSTATA, lsp = _collaudoLezioneAttesa_(prima, sp.classe, sp.da);
  var nuovaSp = _collaudoChiave_(sp.classe, _collaudoIstante_(sp.a), _collaudoIstante_(sp.a, 60));
  if (sonde.setTimeSolo) {
    if (_collaudoModifica_(t, cal, 'setTime: la lezione di ' + sp.classe + ' del ' + _collaudoBreve_(sp.da) +
        ' spostata al ' + _collaudoBreve_(sp.a), sp.classe, sp.da, function (ev) {
          ev.setTime(_collaudoIstante_(sp.a), _collaudoIstante_(sp.a, 60));
        })) {
      fatte.spostata = true;
      attese = _collaudoCambiaVoce_(attese, lsp.chiave, _collaudoVoce_(nuovaSp, _COLLAUDO_COLORI[sp.classe]));
      _collaudoControllaModifica_(t, cal, 'dopo setTime', 'setTime ha spostato la lezione di ' +
        sp.classe + ' del ' + _collaudoBreve_(sp.da) + ' al ' + _collaudoBreve_(sp.a) + ', e solo lei', attese, altre);
    }
    if (t.fermo) return;
  } else {
    Logger.log('Niente lezione spostata: setTime su una lezione della serie di prova non ha spostato solo lei (vedi la NOTA).');
  }
  var ca = _COLLAUDO_CANCELLATA, lca = _collaudoLezioneAttesa_(prima, ca.classe, ca.il);
  if (_collaudoModifica_(t, cal, 'deleteEvent: via la lezione di ' + ca.classe + ' del ' + _collaudoBreve_(ca.il),
      ca.classe, ca.il, function (ev) { ev.deleteEvent(); })) {
    fatte.cancellata = true;
    attese = _collaudoCambiaVoce_(attese, lca.chiave, '');
    _collaudoControllaModifica_(t, cal, 'dopo deleteEvent', 'deleteEvent ha tolto la lezione di ' +
      ca.classe + ' del ' + _collaudoBreve_(ca.il) + ', e solo lei', attese, altre);
  }
  if (t.fermo) return;
  var co = _COLLAUDO_COLORATA, lco = _collaudoLezioneAttesa_(prima, co.classe, co.il);
  if (sonde.setColorSolo) {
    if (_collaudoModifica_(t, cal, 'setColor: la lezione di ' + co.classe + ' del ' + _collaudoBreve_(co.il) + ' colorata ' +
        _orariNomeColore_(co.colore) + ' (' + co.colore + ')', co.classe, co.il, function (ev) { ev.setColor(co.colore); })) {
      fatte.colorata = true;
      attese = _collaudoCambiaVoce_(attese, lco.chiave, _collaudoVoce_(lco.chiave, co.colore));
      _collaudoControllaModifica_(t, cal, 'dopo setColor', 'setColor ha colorato ' +
        _orariNomeColore_(co.colore) + ' la lezione di ' + co.classe + ' del ' + _collaudoBreve_(co.il) + ', e solo lei',
        attese, altre);
    }
    if (t.fermo) return;
  } else {
    Logger.log('Niente lezione colorata a mano: setColor su una lezione della serie di prova non ha colorato solo lei ' +
               '(vedi la NOTA).');
  }

  // --- il cambio d'orario (le lezioni di adesso: quelle lette dopo l'ultima modifica, se c'e')
  lette = t.lette || _collaudoLeggi_(t, cal, 'prima del cambio');
  if (!lette) return;
  var validoDal = _collaudoIstante_(_COLLAUDO_VALIDO_DAL);
  var primaDelCambio = _collaudoVoci_(_collaudoNostre_(lette), function (l) { return l.inizio < validoDal; });
  ORARI = _collaudoDati_(_COLLAUDO_NOME, _COLLAUDO_DOPO, _COLLAUDO_COLORI, _COLLAUDO_VALIDO_DAL);
  r = _collaudoOrari_(t, 'ORARI_1_anteprima', ORARI_1_anteprima, 'ORARI_1_anteprima con l\'orario nuovo');
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_1_anteprima con l\'orario nuovo dice il cambio dal ' + _collaudoBreve_(_COLLAUDO_VALIDO_DAL) +
    ' (' + nuovo.serie + ' serie nuove, ' + nuovo.saltate + ' lezione saltata) e niente da sistemare',
    !r.errore && _collaudoContiene_(r.testo, ['L\'orario e\' cambiato: il nuovo vale dal ' + _COLLAUDO_VALIDO_DAL +
      '. Il cambio si fa con ORARI_5_cambioOrario: ' + nuovo.serie + ' serie nuove da quel giorno, ' + nuovo.saltate +
      ' lezioni saltate']) && r.testo.indexOf('da sistemare') < 0, _collaudoPerche_(r));

  r = _collaudoOrari_(t, 'ORARI_5_cambioOrario', ORARI_5_cambioOrario);
  if (t.fermo) return;
  var giornoPrima = _collaudoGiorno_(new Date(validoDal.getFullYear(), validoDal.getMonth(), validoDal.getDate() - 1));
  var rifatte = 0, tolte = 0;
  for (var k = 0; k < prima.tratti.length; k++) {
    var lz = prima.tratti[k].lezioni;
    if (lz[lz.length - 1].inizio < validoDal) continue;          // finisce prima del cambio: resta
    if (lz[0].inizio < validoDal) rifatte++;
    else tolte++;
  }
  var rimesse = (fatte.spostata ? 1 : 0) + (fatte.colorata ? 1 : 0);
  var pezzi = ['Cambio d\'orario dal ' + _COLLAUDO_VALIDO_DAL + ' nel calendario "' + _COLLAUDO_NOME + '"',
               'Serie dell\'orario di prima rifatte fino al ' + giornoPrima + ', con le lezioni come erano: ' + rifatte + '\n',
               'Serie dell\'orario di prima tolte (nessuna lezione prima del ' + _COLLAUDO_VALIDO_DAL + '): ' + tolte + '\n'];
  if (rimesse) pezzi.push('rimesse come eventi singoli alla loro ora: ' + rimesse + ' - ');
  _collaudoControlla_(t, 'ORARI_5_cambioOrario finisce e dice ' + rifatte + ' serie rifatte fino al ' +
    _collaudoBreve_(giornoPrima) + ', ' + tolte + ' tolte' + (rimesse ? ', ' + rimesse + ' lezioni rimesse come eventi singoli' : ''),
    !r.errore && _collaudoContiene_(r.testo, pezzi), _collaudoPerche_(r));
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_5_cambioOrario');
  if (!lette) return;
  _collaudoControllaCambio_(t, lette, primaDelCambio, prima, nuovo, altre, fatte, 'dopo ORARI_5_cambioOrario');
  var dopoIlCambio = _collaudoVoci_(_collaudoTutte_(lette));

  r = _collaudoOrari_(t, 'ORARI_5_cambioOrario', ORARI_5_cambioOrario, 'ORARI_5_cambioOrario rieseguito');
  if (t.fermo) return;
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_5_cambioOrario rieseguito');
  if (!lette) return;
  var d = _collaudoDiff_(dopoIlCambio, _collaudoVoci_(_collaudoTutte_(lette)));
  _collaudoControlla_(t, 'ORARI_5_cambioOrario rieseguito con gli stessi dati lascia il calendario com\'era (lezioni, ore, ' +
    'colori, la riunione)', !r.errore && d.uguali, r.errore ? _collaudoPerche_(r) : _collaudoDiffTesto_(d));

  // --- i colori delle classi cambiati: ORARI_6_coloraLezioni
  ORARI = _collaudoDati_(_COLLAUDO_NOME, _COLLAUDO_DOPO, _COLLAUDO_COLORI_NUOVI, _COLLAUDO_VALIDO_DAL);
  var chiaviPrima6 = _collaudoCampo_(_collaudoTutte_(lette), 'chiave');
  r = _collaudoOrari_(t, 'ORARI_6_coloraLezioni', ORARI_6_coloraLezioni);
  if (t.fermo) return;
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_6_coloraLezioni');
  if (!lette) return;
  nostre = _collaudoNostre_(lette);
  var male = [];
  for (var c = 0; c < nostre.length; c++) {
    var atteso = (fatte.colorata && nostre[c].chiave === lco.chiave) ? co.colore : (_COLLAUDO_COLORI_NUOVI[nostre[c].titolo] || '');
    if (nostre[c].colore !== atteso) male.push(nostre[c].voce + ' invece di [' + (atteso || '-') + ']');
  }
  _collaudoControlla_(t, 'ORARI_6_coloraLezioni da\' a ogni lezione il colore nuovo della sua classe (' +
    _collaudoNomiColori_(_COLLAUDO_COLORI_NUOVI) + ')' + (fatte.colorata ? ', e lascia ' + _orariNomeColore_(co.colore) +
    ' alla lezione di ' + co.classe + ' del ' + _collaudoBreve_(co.il) + ' colorata a mano' : ''),
    !r.errore && nostre.length > 0 && !male.length, r.errore ? _collaudoPerche_(r) : 'con un altro colore: ' + _collaudoElenco_(male));
  d = _collaudoDiff_(chiaviPrima6, _collaudoCampo_(_collaudoTutte_(lette), 'chiave'));
  _collaudoControlla_(t, 'ORARI_6_coloraLezioni non sposta, non aggiunge e non toglie niente', d.uguali, _collaudoDiffTesto_(d));
  if (fatte.spostata) {
    var l6 = null;
    for (var s = 0; s < nostre.length; s++) if (nostre[s].chiave === nuovaSp) l6 = nostre[s];
    _collaudoControlla_(t, 'la lezione di ' + sp.classe + ' spostata al ' + _collaudoBreve_(sp.a) + ', rimessa da ' +
      'ORARI_5_cambioOrario come evento singolo, ha il colore nuovo di ' + sp.classe + ' (CalendarEvent.setColor)',
      !!l6 && !l6.ricorrente && l6.colore === _COLLAUDO_COLORI_NUOVI[sp.classe],
      l6 ? l6.voce + (l6.ricorrente ? ', in una serie' : ', evento singolo') : 'non la trovo');
  }
  d = _collaudoDiff_(altre, _collaudoVoci_(_collaudoAltre_(lette)));
  _collaudoControlla_(t, 'ORARI_6_coloraLezioni lascia la riunione com\'era', d.uguali, _collaudoDiffTesto_(d));

  // --- via tutto
  r = _collaudoOrari_(t, 'ORARI_ANNULLA_calendario', ORARI_ANNULLA_calendario);
  if (t.fermo) return;
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_ANNULLA_calendario');
  if (!lette) return;
  nostre = _collaudoNostre_(lette);
  _collaudoControlla_(t, 'ORARI_ANNULLA_calendario toglie tutte le lezioni di Campanella', !r.errore && !nostre.length,
    r.errore ? _collaudoPerche_(r) : 'restano: ' + _collaudoElenco_(_collaudoVoci_(nostre)));
  d = _collaudoDiff_(altre, _collaudoVoci_(_collaudoAltre_(lette)));
  _collaudoControlla_(t, 'e lascia la riunione, che non e\' di Campanella', d.uguali, _collaudoDiffTesto_(d));
}

/**
 * Su una serie di prova, che non e' di Campanella: quello che nessuno ha
 * provato dal vivo. setTime su una lezione sola (sposta solo lei?), setColor
 * su una lezione sola (colora solo lei?), poi setColor sulla serie (arriva
 * anche alla lezione spostata? copre quella colorata a mano?). Lo scrive in
 * una NOTA; poi toglie la serie. Torna { setTimeSolo, setColorSolo }, o null
 * se non si puo' andare avanti.
 */
function _collaudoSonde_(t, cal) {
  var esito = { setTimeSolo: false, setColorSolo: false };
  var giorni = ['2026-10-17', '2026-10-24', '2026-10-31'];
  var r = _collaudoPasso_(t, 'createEventSeries: "' + _COLLAUDO_SONDA + '", il sabato alle 17:00 dal 17/10 al 31/10', function () {
    return cal.createEventSeries(_COLLAUDO_SONDA, _collaudoIstante_(giorni[0] + ' 17:00'), _collaudoIstante_(giorni[0] + ' 18:00'),
      CalendarApp.newRecurrence().addWeeklyRule().until(_collaudoFineGiorno_(giorni[2])),
      { description: 'Serie del collaudo: non e\' di Campanella.' });
  });
  if (t.fermo) return null;
  if (r.errore) {
    _collaudoNo_(t, 'non riesco a creare la serie di prova', r.errore.message);
    return esito;
  }
  var serie = r.valore;
  var leggi = function (cosa) {
    var l = _collaudoLeggi_(t, cal, cosa, giorni[0], giorni[2], true);
    if (!l) return null;
    var fuori = [];
    for (var i = 0; i < l.length; i++) if (l[i].titolo === _COLLAUDO_SONDA) fuori.push(l[i]);
    return fuori;
  };
  var ore = function (lezioni) {
    var v = [];
    for (var i = 0; i < lezioni.length; i++) v.push(_collaudoFormato_(lezioni[i].inizio, 'dd/MM HH:mm'));
    return v.join(', ');
  };
  var colori = function (lezioni) {
    var v = [];
    for (var i = 0; i < lezioni.length; i++) v.push(lezioni[i].colore || '-');
    return v.join(',');
  };
  var coloriDetti = function (lezioni) {
    var v = [];
    for (var i = 0; i < lezioni.length; i++) {
      v.push(_collaudoFormato_(lezioni[i].inizio, 'dd/MM') + ' ' +
             (lezioni[i].colore ? _orariNomeColore_(lezioni[i].colore) + ' (' + lezioni[i].colore + ')' : 'del calendario'));
    }
    return v.join(', ');
  };
  // setTime su una lezione sola (le altre due dicono anche se la serie resta alle 17:00 dopo il 25/10)
  r = _collaudoPasso_(t, 'setTime sulla lezione del 24/10 della serie di prova (alle 18:30)', function () {
    var ev = _collaudoTrova_(cal, _COLLAUDO_SONDA, _collaudoIstante_('2026-10-24 17:00'));
    if (!ev) throw new Error('non trovo la lezione del 24/10 alle 17:00');
    ev.setTime(_collaudoIstante_('2026-10-24 18:30'), _collaudoIstante_('2026-10-24 19:30'));
  });
  if (t.fermo) return null;
  var l = leggi('dopo setTime');
  if (!l) return null;
  var visto = ore(l), testo;
  if (r.errore) {
    testo = 'da\' un errore (' + r.errore.message + ')';
  } else if (visto === '17/10 17:00, 24/10 18:30, 31/10 17:00') {
    var nellaSerie = l[1].ricorrente && l[1].serie === l[0].serie && l[2].serie === l[0].serie;
    esito.setTimeSolo = nellaSerie;
    testo = 'sposta solo quella lezione' + (nellaSerie
      ? ', che resta nella serie (isRecurringEvent vero, lo stesso id di serie delle altre)'
      : ', che pero\' non risulta piu\' nella serie (' + (l[1].ricorrente ? 'un altro id di serie' : 'un evento singolo') +
        '): non la uso per le lezioni di Campanella');
  } else if (visto === '17/10 18:30, 24/10 18:30, 31/10 18:30') {
    testo = 'sposta tutta la serie';
  } else if (visto === '17/10 17:00, 24/10 17:00, 31/10 17:00') {
    testo = 'non sposta niente';
  } else {
    testo = 'fa qualcos\'altro';
  }
  _collaudoNota_(t, 'setTime su una lezione di una serie: ' + testo + '. Le lezioni della serie di prova adesso: ' + visto + '.');

  // setColor su una lezione sola
  r = _collaudoPasso_(t, 'setColor ' + _COLLAUDO_COLORATA.colore + ' sulla lezione del 31/10 della serie di prova', function () {
    var ev = _collaudoTrova_(cal, _COLLAUDO_SONDA, _collaudoIstante_('2026-10-31 17:00'));
    if (!ev) throw new Error('non trovo la lezione del 31/10 alle 17:00');
    ev.setColor(_COLLAUDO_COLORATA.colore);
  });
  if (t.fermo) return null;
  l = leggi('dopo setColor su una lezione');
  if (!l) return null;
  var visti = colori(l);
  if (r.errore) testo = 'da\' un errore (' + r.errore.message + ')';
  else if (visti === '-,-,' + _COLLAUDO_COLORATA.colore) { esito.setColorSolo = true; testo = 'colora solo quella lezione'; }
  else if (visti === [_COLLAUDO_COLORATA.colore, _COLLAUDO_COLORATA.colore, _COLLAUDO_COLORATA.colore].join(',')) {
    testo = 'colora tutta la serie';
  } else if (visti === '-,-,-') testo = 'non cambia niente';
  else testo = 'fa qualcos\'altro';
  _collaudoNota_(t, 'setColor su una lezione di una serie: ' + testo + '. I colori delle tre lezioni adesso: ' +
                 coloriDetti(l) + '.');

  // setColor sulla serie, con una lezione spostata e una colorata a mano
  r = _collaudoPasso_(t, 'setColor 5 sulla serie di prova (EventSeries.setColor)', function () { serie.setColor('5'); });
  if (t.fermo) return null;
  l = leggi('dopo setColor sulla serie');
  if (!l) return null;
  if (r.errore) {
    testo = 'da\' un errore (' + r.errore.message + ')';
  } else if (l.length !== 3) {
    testo = 'le lezioni sono diventate ' + l.length;
  } else {
    var parti = [l[0].colore === '5' ? 'colora le lezioni della serie'
                                     : 'NON colora le lezioni della serie (la prima ha ' + (l[0].colore || 'il colore del calendario') + ')'];
    if (esito.setTimeSolo) {
      parti.push(l[1].colore === '5' ? 'anche quella spostata con setTime'
                                     : 'ma non quella spostata con setTime (ha ' + (l[1].colore || 'il colore del calendario') + ')');
    }
    if (esito.setColorSolo) {
      parti.push(l[2].colore === _COLLAUDO_COLORATA.colore ? 'e lascia il suo colore a quella colorata a mano'
                                                           : 'e copre anche quella colorata a mano (ha ' + (l[2].colore || '-') + ')');
    }
    testo = parti.join(', ');
  }
  _collaudoNota_(t, 'EventSeries.setColor su una serie con lezioni cambiate a mano: ' + testo + '. I colori adesso: ' +
                 coloriDetti(l) + '.');

  // via la serie di prova
  r = _collaudoPasso_(t, 'deleteEventSeries: via la serie di prova', function () { serie.deleteEventSeries(); });
  if (t.fermo) return null;
  l = leggi('dopo deleteEventSeries');
  if (!l) return null;
  _collaudoControlla_(t, 'deleteEventSeries toglie la serie di prova, anche le lezioni cambiate a mano', !r.errore && !l.length,
    r.errore ? r.errore.message : 'restano: ' + ore(l));
  return esito;
}


// ===========================================================================
//  PARTE 2: IL CALENDARIO DELLA 1.5, CREATO SENZA FUSO
// ===========================================================================
function _collaudoParte2_(t) {
  var fuso = Session.getScriptTimeZone();
  _collaudoTitolo_(t, 'PARTE 2 (COLLAUDO_2): il calendario "' + _COLLAUDO_NOME_VECCHIO + '", creato senza fuso come faceva ' +
                      'Campanella 1.5');
  var prima = _collaudoAttese_(_COLLAUDO_PRIMA, _COLLAUDO_INIZIO);
  var r = _collaudoPasso_(t, 'createCalendar("' + _COLLAUDO_NOME_VECCHIO + '"), senza fuso', function () {
    return CalendarApp.createCalendar(_COLLAUDO_NOME_VECCHIO);
  });
  if (t.fermo) return;
  if (r.errore) { _collaudoNo_(t, 'non riesco a creare il calendario "' + _COLLAUDO_NOME_VECCHIO + '"', r.errore.message); return; }
  var cal = r.valore;
  _collaudoControlla_(t, 'il calendario creato senza fuso ha il fuso UTC, come quelli della 1.5 (visto dal vivo il 25/09/2026)',
    String(cal.getTimeZone()) === 'UTC', 'ha il fuso orario ' + cal.getTimeZone());
  r = _collaudoPasso_(t, 'createEventSeries: la serie di 2B come la metteva la 1.5, con il contrassegno, e "' +
                         _COLLAUDO_RICEVIMENTO + '"', function () {
    var s = cal.createEventSeries('2B', _collaudoIstante_('2026-10-12 08:00'), _collaudoIstante_('2026-10-12 10:00'),
      CalendarApp.newRecurrence().addWeeklyRule().until(_collaudoFineGiorno_('2026-11-09')),
      { description: '[Campanella] Orario di ' + _COLLAUDO_DOCENTE + ', Lunedi\', dalla 1a alla 2a ora (collaudo). ' +
                     'Serie messa come faceva Campanella 1.5.' });
    s.setTag(_ORARI_TAG, _ORARI_TAG_VALORE);
    cal.createEventSeries(_COLLAUDO_RICEVIMENTO, _collaudoIstante_('2026-10-14 15:00'), _collaudoIstante_('2026-10-14 16:00'),
      CalendarApp.newRecurrence().addWeeklyRule().until(_collaudoFineGiorno_('2026-11-11')),
      { description: 'Serie del collaudo: non e\' di Campanella.' });
  });
  if (t.fermo) return;
  if (r.errore) { _collaudoNo_(t, 'non riesco a mettere le due serie', r.errore.message); return; }
  var lette = _collaudoLeggi_(t, cal, 'con la serie della 1.5');
  if (!lette) return;
  var ore2B = _collaudoOre_(_collaudoNostre_(lette), '2B');
  _collaudoControlla_(t, 'come visto dal vivo: la serie di 2B e\' alle 08:00 fino al 19/10 e alle 07:00 dal 26/10 (sempre ' +
    'alle 06:00 UTC)', ore2B === '12/10 08:00, 19/10 08:00, 26/10 07:00, 02/11 07:00, 09/11 07:00', 'le lezioni: ' + ore2B);
  var ricevimento = _collaudoOre_(_collaudoAltre_(lette), _COLLAUDO_RICEVIMENTO);
  var fotoPrima = _collaudoVoci_(_collaudoTutte_(lette));

  ORARI = _collaudoDati_(_COLLAUDO_NOME_VECCHIO, _COLLAUDO_PRIMA, _COLLAUDO_COLORI, '');
  r = _collaudoOrari_(t, 'ORARI_1_anteprima', ORARI_1_anteprima);
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_1_anteprima dice che il calendario e\' da sistemare (fuso UTC, con lezioni di Campanella)',
    !r.errore && _collaudoContiene_(r.testo, ['Calendario da sistemare. Il calendario "' + _COLLAUDO_NOME_VECCHIO +
      '" ha il fuso orario UTC, non ' + fuso]), _collaudoPerche_(r));

  r = _collaudoOrari_(t, 'ORARI_4_calendario', ORARI_4_calendario);
  if (t.fermo) return;
  var messaggio = r.errore ? String(r.errore.message) : '';
  _collaudoControlla_(t, 'ORARI_4_calendario si ferma', !!r.errore, 'e\' andato avanti, e ha detto: ' + _collaudoCorto_(r.testo));
  if (messaggio) Logger.log('       il suo messaggio: ' + messaggio.replace(/\n/g, '\n       '));
  _collaudoControlla_(t, 'e spiega: il fuso UTC, le lezioni un\'ora prima dalla fine dell\'ora legale, che cambiare il fuso ' +
    'da Google Calendar non basta, il rimedio (ORARI_ANNULLA_calendario e poi ORARI_4_calendario) e che non ha toccato niente',
    _collaudoContiene_(messaggio, ['ha il fuso orario UTC, non ' + fuso, 'compaiono un\'ora prima', 'non basta',
      'Per sistemare: esegui ORARI_ANNULLA_calendario', 'e poi ORARI_4_calendario',
      'Non ho aggiunto, cambiato ne\' tolto niente']), messaggio ? 'il messaggio e\' qui sopra' : 'nessun messaggio');
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_4_calendario fermato');
  if (!lette) return;
  var calOra = _collaudoCalendario_(_COLLAUDO_NOME_VECCHIO);
  var d = _collaudoDiff_(fotoPrima, _collaudoVoci_(_collaudoTutte_(lette)));
  var fusoOra = calOra ? String(calOra.getTimeZone()) : '(il calendario non c\'e\' piu\')';
  _collaudoControlla_(t, 'e non ha toccato niente: le stesse lezioni alla stessa ora, e il calendario ancora in UTC',
    d.uguali && fusoOra === 'UTC', [_collaudoDiffTesto_(d), 'fuso orario: ' + fusoOra].join('\n'));

  r = _collaudoOrari_(t, 'ORARI_ANNULLA_calendario', ORARI_ANNULLA_calendario);
  if (t.fermo) return;
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_ANNULLA_calendario');
  if (!lette) return;
  _collaudoControlla_(t, 'ORARI_ANNULLA_calendario toglie la serie della 1.5', !r.errore && !_collaudoNostre_(lette).length,
    r.errore ? _collaudoPerche_(r) : 'restano: ' + _collaudoElenco_(_collaudoVoci_(_collaudoNostre_(lette))));
  var ricevimentoDopo = _collaudoOre_(_collaudoAltre_(lette), _COLLAUDO_RICEVIMENTO);
  _collaudoControlla_(t, 'e lascia "' + _COLLAUDO_RICEVIMENTO + '", che non e\' di Campanella',
    !!ricevimento && ricevimentoDopo === ricevimento, 'prima: ' + ricevimento + '\nadesso: ' + ricevimentoDopo);

  r = _collaudoOrari_(t, 'ORARI_4_calendario', ORARI_4_calendario, 'ORARI_4_calendario di nuovo');
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_4_calendario adesso mette l\'orario, e dice che al calendario ha messo il fuso ' + fuso +
    ' (aveva UTC) e che l\'ha controllato su una serie che passa il 25/10',
    !r.errore && _collaudoContiene_(r.testo, ['Il calendario aveva il fuso orario UTC: gli ho messo ' + fuso, '(controllato:']),
    _collaudoPerche_(r));
  calOra = _collaudoCalendario_(_COLLAUDO_NOME_VECCHIO);
  if (!_collaudoControlla_(t, 'c\'e\' ancora il calendario "' + _COLLAUDO_NOME_VECCHIO + '"', !!calOra)) return;
  fusoOra = String(calOra.getTimeZone());
  _collaudoControlla_(t, 'il calendario ha adesso il fuso orario dello script (' + fuso + ')', fusoOra === fuso,
    'ha il fuso orario ' + fusoOra);
  lette = _collaudoLeggi_(t, calOra, 'dopo ORARI_ANNULLA_calendario e ORARI_4_calendario');
  if (!lette) return;
  _collaudoControllaOrario_(t, lette, prima, _COLLAUDO_COLORI, 'dopo ORARI_ANNULLA_calendario e ORARI_4_calendario');

  // setTimeZone e una serie che c'era gia'
  var ricevimentoOra = _collaudoOre_(_collaudoAltre_(lette), _COLLAUDO_RICEVIMENTO), testo;
  if (fusoOra !== fuso) {
    testo = 'il calendario non ha preso il fuso ' + fuso + ' (ha ancora ' + fusoOra + '), quindi delle serie gia\' create ' +
      'non si puo\' dire niente';
  } else if (ricevimentoOra === ricevimento) {
    testo = 'NON cambia l\'ora delle serie gia\' create: "' + _COLLAUDO_RICEVIMENTO + '", creato quando il calendario era ' +
      'in UTC, e\' ancora ' + ricevimentoOra + ' (alla stessa ora UTC). E\' quello che dicono i messaggi di Orari.gs: ' +
      'cambiare il fuso non basta per le lezioni gia\' messe';
  } else {
    testo = 'CAMBIA l\'ora delle serie gia\' create: "' + _COLLAUDO_RICEVIMENTO + '" era ' + ricevimento + ', adesso e\' ' +
      ricevimentoOra + '. I messaggi di Orari.gs dicono che cambiare il fuso non basta: da rivedere (il rimedio con ' +
      'ORARI_ANNULLA_calendario e ORARI_4_calendario resta giusto)';
  }
  _collaudoNota_(t, 'setTimeZone su un calendario che c\'era gia\' (lo chiama ORARI_4_calendario): ' + testo + '.');
}


// ===========================================================================
//  I CONTROLLI SULLE LEZIONI
// ===========================================================================
/**
 * Le lezioni di Campanella lette dal calendario sono l'orario atteso: tutte
 * e sole, alla stessa ora anche dopo la fine dell'ora legale, nessuna nei
 * giorni senza lezione, ognuna con il colore della sua classe. Senza lezioni
 * ogni controllo e' NO: un calendario vuoto non prova niente.
 */
function _collaudoControllaOrario_(t, lette, attese, colori, quando) {
  var nostre = _collaudoNostre_(lette);
  var vuoto = 'nessuna lezione di Campanella nel calendario';
  var d = _collaudoDiff_(attese.chiavi, _collaudoCampo_(nostre, 'chiave'));
  _collaudoControlla_(t, quando + ': le lezioni sono proprio quelle dell\'orario (' + attese.lezioni.length + '), nessuna in ' +
    'piu\' ne\' in meno', nostre.length > 0 && d.uguali, nostre.length ? _collaudoDiffTesto_(d) : vuoto);
  var solare = _collaudoIstante_(_COLLAUDO_ORA_SOLARE), dopo = 0, sbagliate = [];
  for (var i = 0; i < nostre.length; i++) {
    if (nostre[i].inizio < solare) continue;
    dopo++;
    if (attese.chiavi.indexOf(nostre[i].chiave) < 0) sbagliate.push(nostre[i].chiave);
  }
  _collaudoControlla_(t, quando + ': dal 26/10, finita l\'ora legale, le lezioni sono alla stessa ora di prima' +
    _collaudoEsempioOra_(nostre, solare), dopo > 0 && !sbagliate.length,
    dopo ? 'a un\'altra ora: ' + _collaudoElenco_(sbagliate) : 'nessuna lezione dal 26/10');
  var sospese = [];
  for (var s = 0; s < nostre.length; s++) if (_collaudoSospeso_(nostre[s].inizio)) sospese.push(nostre[s].chiave);
  _collaudoControlla_(t, quando + ': nessuna lezione nei giorni senza lezione (' + _collaudoGiorniSenza_() + ')',
    nostre.length > 0 && !sospese.length, nostre.length ? 'ci sono: ' + _collaudoElenco_(sospese) : vuoto);
  var male = [];
  for (var c = 0; c < nostre.length; c++) if (nostre[c].colore !== (colori[nostre[c].titolo] || '')) male.push(nostre[c].voce);
  _collaudoControlla_(t, quando + ': ogni lezione ha il colore della sua classe (' + _collaudoNomiColori_(colori) + ')',
    nostre.length > 0 && !male.length, nostre.length ? 'con un altro colore (fra le quadre): ' + _collaudoElenco_(male) : vuoto);
}

/**
 * Dopo il cambio d'orario: le lezioni prima del validoDal sono quelle di
 * prima (primaDelCambio, con i colori), dal validoDal ci sono tutte e sole
 * quelle dell'orario nuovo con il colore della loro classe, nessuna nei
 * giorni senza lezione, e la riunione e' com'era.
 */
function _collaudoControllaCambio_(t, lette, primaDelCambio, prima, nuovo, altre, fatte, quando) {
  var validoDal = _collaudoIstante_(_COLLAUDO_VALIDO_DAL), dal = _collaudoBreve_(_COLLAUDO_VALIDO_DAL);
  var nostre = _collaudoNostre_(lette);
  var cambiate = [];
  if (fatte.spostata) cambiate.push('la spostata');
  if (fatte.cancellata) cambiate.push('la cancellata');
  if (fatte.colorata) cambiate.push('la colorata a mano');
  var d = _collaudoDiff_(primaDelCambio, _collaudoVoci_(nostre, function (l) { return l.inizio < validoDal; }));
  _collaudoControlla_(t, quando + ': le lezioni prima del ' + dal + ' sono rimaste come erano, alla stessa ora e con i loro ' +
    'colori' + (cambiate.length ? ' (anche ' + cambiate.join(', ') + ')' : ''), nostre.length > 0 && d.uguali,
    _collaudoDiffTesto_(d));
  var vecchie = [], dopo = [], male = [];
  for (var i = 0; i < nostre.length; i++) {
    if (nostre[i].inizio < validoDal) continue;
    dopo.push(nostre[i].chiave);
    if (prima.chiavi.indexOf(nostre[i].chiave) >= 0) vecchie.push(nostre[i].chiave);
    if (nostre[i].colore !== (_COLLAUDO_COLORI[nostre[i].titolo] || '')) male.push(nostre[i].voce);
  }
  _collaudoControlla_(t, quando + ': dal ' + dal + ' nessuna lezione dell\'orario di prima', dopo.length > 0 && !vecchie.length,
    dopo.length ? 'ci sono ancora: ' + _collaudoElenco_(vecchie) : 'nessuna lezione dal ' + dal);
  d = _collaudoDiff_(nuovo.chiavi, dopo);
  _collaudoControlla_(t, quando + ': dal ' + dal + ' c\'e\' l\'orario nuovo, giusto (' + nuovo.lezioni.length + ' lezioni)',
    dopo.length > 0 && d.uguali, _collaudoDiffTesto_(d));
  _collaudoControlla_(t, quando + ': le lezioni dell\'orario nuovo hanno il colore della loro classe', dopo.length > 0 && !male.length,
    'con un altro colore (fra le quadre): ' + _collaudoElenco_(male));
  var sospese = [];
  for (var s = 0; s < nostre.length; s++) if (_collaudoSospeso_(nostre[s].inizio)) sospese.push(nostre[s].chiave);
  _collaudoControlla_(t, quando + ': nessuna lezione nei giorni senza lezione (' + _collaudoGiorniSenza_() + ')',
    nostre.length > 0 && !sospese.length, 'ci sono: ' + _collaudoElenco_(sospese));
  d = _collaudoDiff_(altre, _collaudoVoci_(_collaudoAltre_(lette)));
  _collaudoControlla_(t, quando + ': la riunione, che non e\' di Campanella, e\' rimasta com\'era', d.uguali, _collaudoDiffTesto_(d));
}

/**
 * Una modifica fatta a mano a una lezione di Campanella (la classe, e
 * l'inizio come "2026-10-22 09:00"), come dall'interfaccia di Google. Vero se
 * fatta senza errori.
 */
function _collaudoModifica_(t, cal, nome, classe, il, fa) {
  var r = _collaudoPasso_(t, nome, function () {
    var ev = _collaudoTrova_(cal, classe, _collaudoIstante_(il));
    if (!ev) throw new Error('non trovo la lezione di ' + classe + ' del ' + il);
    fa(ev);
  });
  if (t.fermo) return false;
  if (r.errore) {
    t.lette = null;              // qualcosa puo' essere cambiato lo stesso: prima del cambio si rilegge
    _collaudoNo_(t, nome + ': non riuscito', r.errore.message);
  }
  return !r.errore;
}

/**
 * Dopo una modifica a mano: le lezioni di Campanella sono quelle attese (con
 * i colori) e le altre sono com'erano. Le lezioni lette restano in
 * t.lette, per non rileggerle prima del cambio d'orario.
 */
function _collaudoControllaModifica_(t, cal, cosa, descrizione, attese, altre) {
  var lette = t.lette = _collaudoLeggi_(t, cal, cosa);
  if (!lette) return false;
  var d = _collaudoDiff_(attese, _collaudoVoci_(_collaudoNostre_(lette)));
  var e = _collaudoDiff_(altre, _collaudoVoci_(_collaudoAltre_(lette)));
  return _collaudoControlla_(t, descrizione, d.uguali && e.uguali, [_collaudoDiffTesto_(d), _collaudoDiffTesto_(e)].join('\n'));
}


// ===========================================================================
//  L'ORARIO ATTESO, CALCOLATO QUI (senza le funzioni di Orari.gs)
// ===========================================================================
/**
 * Le lezioni di un orario (blocchi) dal giorno "dal" alla fine del periodo,
 * senza i giorni senza lezione: ognuna con titolo, inizio, fine e chiave. Poi
 * i tratti di settimane senza interruzioni (una serie ciascuno), quante serie
 * e quante lezioni saltate.
 */
function _collaudoAttese_(blocchi, dal) {
  var fuori = { lezioni: [], chiavi: [], tratti: [], serie: 0, saltate: 0 };
  var inizio = _collaudoIstante_(dal), fine = _collaudoIstante_(_COLLAUDO_FINE);
  for (var b = 0; b < blocchi.length; b++) {
    var x = blocchi[b], tratto = null;
    for (var g = inizio; g <= fine; g = new Date(g.getFullYear(), g.getMonth(), g.getDate() + 1)) {
      if (g.getDay() !== x.giorno) continue;
      if (_collaudoSospeso_(g)) { fuori.saltate++; tratto = null; continue; }
      if (!tratto) { tratto = { classe: x.classe, lezioni: [] }; fuori.tratti.push(tratto); }
      var giorno = _collaudoGiorno_(g);
      var l = { titolo: x.classe, inizio: _collaudoIstante_(giorno + ' ' + _COLLAUDO_ORE[x.da - 1]),
                fine: _collaudoIstante_(giorno + ' ' + _COLLAUDO_ORE[x.a - 1], 60) };
      l.chiave = _collaudoChiave_(l.titolo, l.inizio, l.fine);
      tratto.lezioni.push(l);
      fuori.lezioni.push(l);
      fuori.chiavi.push(l.chiave);
    }
  }
  fuori.serie = fuori.tratti.length;
  return fuori;
}

/** La lezione attesa di una classe che comincia a "il" ("2026-10-26 08:00"). */
function _collaudoLezioneAttesa_(attese, classe, il) {
  var inizio = _collaudoIstante_(il).getTime();
  for (var i = 0; i < attese.lezioni.length; i++) {
    if (attese.lezioni[i].titolo === classe && attese.lezioni[i].inizio.getTime() === inizio) return attese.lezioni[i];
  }
  throw new Error('nell\'orario del collaudo non c\'e\' una lezione di ' + classe + ' il ' + il);
}

/** Le voci ("chiave [colore]") delle lezioni attese, ognuna con il colore della sua classe. */
function _collaudoVociAttese_(lezioni, colori) {
  var v = [];
  for (var i = 0; i < lezioni.length; i++) v.push(_collaudoVoce_(lezioni[i].chiave, colori[lezioni[i].titolo] || ''));
  return v;
}

/** Le voci senza quella della lezione con quella chiave (di qualunque colore), piu' la nuova se c'e'. */
function _collaudoCambiaVoce_(voci, chiave, nuova) {
  var fuori = [], tolta = false;
  for (var i = 0; i < voci.length; i++) {
    if (!tolta && voci[i].indexOf(chiave + ' [') === 0) { tolta = true; continue; }
    fuori.push(voci[i]);
  }
  if (nuova) fuori.push(nuova);
  return fuori;
}

/**
 * I dati degli orari come li genera Campanella per un orario del collaudo:
 * quelli "del tuo orario" (AnalisiOrario.GeneraDatiDelDocenteGs), un docente
 * solo e niente orari delle classi, oggetti o nota delle email, che vanno
 * bene a Calendario.gs e a Orari.gs; niente colloqui.
 */
function _collaudoDati_(nome, blocchi, colori, validoDal) {
  var celle = [];
  for (var i = 0; i < _COLLAUDO_GIORNI.length * _COLLAUDO_ORE.length; i++) celle.push('');
  for (var b = 0; b < blocchi.length; b++) {
    for (var o = blocchi[b].da; o <= blocchi[b].a; o++) {
      celle[(blocchi[b].giorno - 1) * _COLLAUDO_ORE.length + o - 1] = blocchi[b].classe;
    }
  }
  var c = {};
  for (var k in colori) c[k] = colori[k];
  var sospensioni = [];
  for (var s = 0; s < _COLLAUDO_SOSPENSIONI.length; s++) {
    sospensioni.push({ dal: _COLLAUDO_SOSPENSIONI[s].dal, al: _COLLAUDO_SOSPENSIONI[s].al, nome: _COLLAUDO_SOSPENSIONI[s].nome });
  }
  return {
    periodo: 'collaudo',
    ore: _COLLAUDO_ORE.length,
    giorni: _COLLAUDO_GIORNI.slice(0),
    docenti: [{ nome: _COLLAUDO_DOCENTE, celle: celle }],
    calendario: {
      docente: _COLLAUDO_DOCENTE, nome: nome, inizio: _COLLAUDO_INIZIO, fine: _COLLAUDO_FINE, minutiOra: 60,
      inizioOre: _COLLAUDO_ORE.slice(0), colore: '', colori: c, sospensioni: sospensioni,
      colloqui: { settimanali: [], singoli: [], sospensioni: [] }, coloreColloqui: '', validoDal: validoDal
    }
  };
}


// ===========================================================================
//  IL CALENDARIO LETTO
// ===========================================================================
/**
 * Gli eventi del calendario fra due giorni (compresi), in ordine: titolo,
 * inizio, fine, colore ('' = quello del calendario), se e' di Campanella
 * (il contrassegno, o la descrizione che comincia con [Campanella]), se sta
 * in una serie e, con conSerie, quale; chiave ("2026-10-26 08:00-10:00 2B")
 * e voce (la chiave con il colore fra le quadre). Ogni lettura costa tempo,
 * con Google: solo quello che serve (la descrizione solo senza contrassegno).
 */
function _collaudoLezioni_(cal, dal, al, conSerie) {
  var eventi = cal.getEvents(_collaudoIstante_(dal), _collaudoFineGiorno_(al));
  var fuori = [];
  for (var i = 0; i < eventi.length; i++) {
    var ev = eventi[i];
    var l = { titolo: String(ev.getTitle() || ''), inizio: ev.getStartTime(), fine: ev.getEndTime(), colore: '',
              contrassegno: false, nostra: false, ricorrente: false, serie: '' };
    // un colore che non e' da "1" a "11" vale come quello del calendario, come per Orari.gs
    try {
      var colore = String(ev.getColor() || '').replace(/^\s+|\s+$/g, '');
      l.colore = /^(?:[1-9]|1[01])$/.test(colore) ? colore : '';
    } catch (e) { l.colore = '?'; }
    try { l.contrassegno = (ev.getTag(_ORARI_TAG) === _ORARI_TAG_VALORE); } catch (e2) { l.contrassegno = false; }
    l.nostra = l.contrassegno;
    if (!l.nostra) {
      try { l.nostra = String(ev.getDescription() || '').indexOf('[Campanella]') === 0; } catch (e3) { l.nostra = false; }
    }
    try { l.ricorrente = !!ev.isRecurringEvent(); } catch (e4) { l.ricorrente = false; }
    if (conSerie && l.ricorrente) {
      try { l.serie = String(ev.getEventSeries().getId()); } catch (e5) { l.serie = ''; }
    }
    l.chiave = _collaudoChiave_(l.titolo, l.inizio, l.fine);
    l.voce = _collaudoVoce_(l.chiave, l.colore);
    fuori.push(l);
  }
  fuori.sort(function (a, b) { return (a.inizio - b.inizio) || (a.voce < b.voce ? -1 : (a.voce > b.voce ? 1 : 0)); });
  return fuori;
}

/** Come _collaudoLezioni_ (di partenza tutto il periodo), come passo del collaudo; null se non si puo'. */
function _collaudoLeggi_(t, cal, cosa, dal, al, conSerie) {
  var r = _collaudoPasso_(t, 'lettura del calendario (' + cosa + ')', function () {
    return _collaudoLezioni_(cal, dal || _COLLAUDO_INIZIO, al || _COLLAUDO_FINE, conSerie);
  });
  if (t.fermo) return null;
  if (r.errore) {
    _collaudoNo_(t, 'non riesco a leggere il calendario (' + cosa + ')', r.errore.message);
    return null;
  }
  return r.valore;
}

/** La lezione (o l'evento) con quel titolo che comincia proprio a quell'ora; null se non c'e'. */
function _collaudoTrova_(cal, titolo, inizio) {
  var eventi = cal.getEvents(inizio, new Date(inizio.getTime() + 60 * 1000));
  for (var i = 0; i < eventi.length; i++) {
    if (String(eventi[i].getTitle()) === titolo && eventi[i].getStartTime().getTime() === inizio.getTime()) return eventi[i];
  }
  return null;
}

/** Le lezioni di Campanella. */
function _collaudoNostre_(lette) {
  var v = [];
  for (var i = 0; i < lette.length; i++) if (lette[i].nostra) v.push(lette[i]);
  return v;
}

/** Gli altri eventi (la riunione, il ricevimento), senza quelli della serie di prova se ne restasse qualcuno. */
function _collaudoAltre_(lette) {
  var v = [];
  for (var i = 0; i < lette.length; i++) if (!lette[i].nostra && lette[i].titolo !== _COLLAUDO_SONDA) v.push(lette[i]);
  return v;
}

/** Tutti gli eventi, senza quelli della serie di prova se ne restasse qualcuno. */
function _collaudoTutte_(lette) {
  var v = [];
  for (var i = 0; i < lette.length; i++) if (lette[i].nostra || lette[i].titolo !== _COLLAUDO_SONDA) v.push(lette[i]);
  return v;
}

/** Le voci delle lezioni, solo quelle che vanno bene a filtro se c'e'. */
function _collaudoVoci_(lezioni, filtro) {
  var v = [];
  for (var i = 0; i < lezioni.length; i++) if (!filtro || filtro(lezioni[i])) v.push(lezioni[i].voce);
  return v;
}

function _collaudoCampo_(lezioni, campo) {
  var v = [];
  for (var i = 0; i < lezioni.length; i++) v.push(lezioni[i][campo]);
  return v;
}

/** "12/10 08:00, 19/10 08:00": quando cominciano gli eventi con quel titolo. */
function _collaudoOre_(lezioni, titolo) {
  var v = [];
  for (var i = 0; i < lezioni.length; i++) {
    if (lezioni[i].titolo === titolo) v.push(_collaudoFormato_(lezioni[i].inizio, 'dd/MM HH:mm'));
  }
  return v.join(', ');
}

/** " (per esempio 2B: il 19/10 08:00-10:00 e il 26/10 08:00-10:00)": una classe prima e dopo la fine dell'ora legale. */
function _collaudoEsempioOra_(nostre, solare) {
  var classi = [];
  for (var i = 0; i < nostre.length; i++) if (classi.indexOf(nostre[i].titolo) < 0) classi.push(nostre[i].titolo);
  for (var c = 0; c < classi.length; c++) {
    var prima = null, dopo = null;
    for (var k = 0; k < nostre.length; k++) {
      if (nostre[k].titolo !== classi[c]) continue;
      if (nostre[k].inizio < solare) prima = nostre[k];
      else if (!dopo) dopo = nostre[k];
    }
    if (prima && dopo) return ' (per esempio ' + classi[c] + ': ' + _collaudoQuando_(prima) + ' e ' + _collaudoQuando_(dopo) + ')';
  }
  return '';
}

function _collaudoQuando_(l) {
  return 'il ' + _collaudoFormato_(l.inizio, 'dd/MM HH:mm') + '-' + _collaudoFormato_(l.fine, 'HH:mm');
}

/** Confronta due elenchi di testi come insiemi con le ripetizioni: quelli che mancano e quelli in piu'. */
function _collaudoDiff_(attese, trovate) {
  var resto = attese.slice(0), inPiu = [];
  for (var i = 0; i < trovate.length; i++) {
    var k = resto.indexOf(trovate[i]);
    if (k >= 0) resto.splice(k, 1);
    else inPiu.push(trovate[i]);
  }
  resto.sort();
  inPiu.sort();
  return { uguali: !resto.length && !inPiu.length, mancano: resto, inPiu: inPiu };
}

function _collaudoDiffTesto_(d) {
  var parti = [];
  if (d.mancano.length) parti.push('mancano: ' + _collaudoElenco_(d.mancano));
  if (d.inPiu.length) parti.push('in piu\': ' + _collaudoElenco_(d.inPiu));
  return parti.join('\n');
}

function _collaudoElenco_(v) {
  return v.slice(0, 8).join('; ') + (v.length > 8 ? '; ... (' + v.length + ' in tutto)' : '');
}


// ===========================================================================
//  DATE, ORE E COLORI (nel fuso dello script)
// ===========================================================================
/** "2026-10-22 09:00" (o solo il giorno) -> Date, piu' i minuti dati. */
function _collaudoIstante_(s, minuti) {
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/);
  if (!m) throw new Error('data del collaudo scritta male: ' + s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0) + (minuti || 0), 0);
}

function _collaudoFineGiorno_(s) {
  var g = _collaudoIstante_(s);
  return new Date(g.getFullYear(), g.getMonth(), g.getDate(), 23, 59, 59);
}

function _collaudoFormato_(g, modello) {
  return Utilities.formatDate(g, Session.getScriptTimeZone(), modello);
}

/** Date -> "2026-10-26". */
function _collaudoGiorno_(g) {
  return _collaudoFormato_(g, 'yyyy-MM-dd');
}

/** "2026-10-22 09:00" -> "22/10 09:00", "2026-11-02" -> "02/11". */
function _collaudoBreve_(s) {
  var m = String(s).match(/^\d{4}-(\d{2})-(\d{2})(.*)$/);
  return m ? m[2] + '/' + m[1] + m[3] : String(s);
}

/** "2026-10-26 08:00-10:00 2B": una lezione, nel fuso dello script. */
function _collaudoChiave_(titolo, inizio, fine) {
  return _collaudoFormato_(inizio, 'yyyy-MM-dd HH:mm') + '-' + _collaudoFormato_(fine, 'HH:mm') + ' ' + titolo;
}

/** "2026-10-26 08:00-10:00 2B [9]": la chiave con il colore ("-" = quello del calendario). */
function _collaudoVoce_(chiave, colore) {
  return chiave + ' [' + (colore || '-') + ']';
}

/** Vero se il giorno (una Date) e' fra quelli senza lezione. */
function _collaudoSospeso_(g) {
  var giorno = _collaudoGiorno_(g);
  for (var i = 0; i < _COLLAUDO_SOSPENSIONI.length; i++) {
    if (_COLLAUDO_SOSPENSIONI[i].dal <= giorno && giorno <= _COLLAUDO_SOSPENSIONI[i].al) return true;
  }
  return false;
}

/** "20/10, 06/11". */
function _collaudoGiorniSenza_() {
  var v = [];
  for (var i = 0; i < _COLLAUDO_SOSPENSIONI.length; i++) {
    var s = _COLLAUDO_SOSPENSIONI[i];
    v.push(_collaudoBreve_(s.dal) + (s.al !== s.dal ? '-' + _collaudoBreve_(s.al) : ''));
  }
  return v.join(', ');
}

/** "2B Mirtillo, 3B Basilico, 4C Mandarino". */
function _collaudoNomiColori_(colori) {
  var classi = [], v = [];
  for (var k in colori) classi.push(k);
  classi.sort();
  for (var i = 0; i < classi.length; i++) v.push(classi[i] + ' ' + _orariNomeColore_(colori[classi[i]]));
  return v.join(', ');
}


// ===========================================================================
//  IL REGISTRO, I PASSI E LA PULIZIA
// ===========================================================================
function _collaudoSecondi_(t) {
  return (Date.now() - t.partenza) / 1000;
}

function _collaudoTitolo_(t, testo) {
  Logger.log('== ' + testo);
}

/** Una riga OK o NO; con NO anche il dettaglio, se c'e'. Torna la condizione. */
function _collaudoControlla_(t, descrizione, condizione, dettaglio) {
  if (condizione) {
    t.ok++;
    Logger.log('OK    ' + descrizione);
    return true;
  }
  t.no.push(descrizione);
  var altro = String(dettaglio == null ? '' : dettaglio).replace(/^\s+|\s+$/g, '');
  Logger.log('NO    ' + descrizione + (altro ? '\n       ' + altro.replace(/\n/g, '\n       ') : ''));
  return false;
}

function _collaudoNo_(t, descrizione, dettaglio) {
  return _collaudoControlla_(t, descrizione, false, dettaglio);
}

/** Quello che si e' visto di Google dove nessuno l'aveva ancora provato: va anche nel riepilogo. */
function _collaudoNota_(t, testo) {
  t.note.push(testo);
  Logger.log('NOTA  ' + testo);
}

/**
 * Un passo del collaudo, con il suo tempo (una riga PASSO): torna { valore,
 * errore }. Dopo _COLLAUDO_LIMITE_PASSI secondi non ne comincia piu'
 * nessuno (t.fermo): scrive perche', e la pulizia ha ancora tempo.
 */
function _collaudoPasso_(t, nome, fa) {
  if (t.fermo) return { saltato: true, valore: undefined, errore: null };
  var gia = _collaudoSecondi_(t);
  if (gia > _COLLAUDO_LIMITE_PASSI) {
    t.fermo = true;
    _collaudoNo_(t, 'tempo: sono passati ' + gia.toFixed(0) + ' secondi e Google ferma uno script dopo 360, quindi mi fermo ' +
      'prima di "' + nome + '"; il resto non l\'ho provato',
      t.funzione === 'COLLAUDO' ? 'Esegui le parti una alla volta: COLLAUDO_1 e COLLAUDO_2.'
                                : 'Google e\' stato piu\' lento del solito: riesegui ' + t.funzione + ' piu\' tardi.');
    return { saltato: true, valore: undefined, errore: null };
  }
  var inizio = Date.now(), r = { saltato: false, valore: undefined, errore: null };
  try { r.valore = fa(); } catch (err) { r.errore = err || new Error('errore senza messaggio'); }
  var secondi = (Date.now() - inizio) / 1000;
  t.passi.push({ nome: nome, secondi: secondi });
  var errore = r.errore ? String(r.errore.message).split('\n')[0] : '';
  Logger.log('PASSO ' + nome + ': ' + secondi.toFixed(1) + ' s (' + _collaudoSecondi_(t).toFixed(1) + ' s dall\'inizio)' +
             (errore ? ' - errore: ' + (errore.length > 120 ? errore.slice(0, 120) + '...' : errore) : ''));
  return r;
}

/**
 * Una funzione del calendario (nome, funzione), come passo: torna anche il
 * suo testo. Le lascia solo il tempo che resta fino a _COLLAUDO_LIMITE_ORARI
 * (_ORARI_MAX_SECONDI, poi rimesso com'era): finito quello si ferma da sola,
 * come a fine esecuzione, e Google non ferma il collaudo prima della
 * pulizia. Se si ferma a meta' (tempo, limiti di Google) la riprende a mano
 * fra 20 secondi, se c'e' il tempo, al massimo tre volte, e ne toglie la
 * ripresa programmata.
 */
function _collaudoOrari_(t, nome, funzione, etichetta) {
  var r = null;
  for (var giro = 1; giro <= 3; giro++) {
    r = _collaudoPasso_(t, (etichetta || nome) + (giro > 1 ? ' (ripreso a mano, ' + giro + 'a volta)' : ''), function () {
      var resta = Math.floor(_COLLAUDO_LIMITE_ORARI - _collaudoSecondi_(t));
      _ORARI_MAX_SECONDI = Math.max(5, Math.min(t.maxOrari || 260, resta));
      try { return funzione(); }
      finally { _ORARI_MAX_SECONDI = t.maxOrari || 260; }
    });
    r.testo = String(r.valore == null ? '' : r.valore);
    if (r.saltato || r.errore || giro === 3 || !_collaudoAMeta_(r.testo)) return r;
    _togliTriggerOrari_(nome);
    if (_collaudoSecondi_(t) + 20 > _COLLAUDO_LIMITE_PASSI) {
      Logger.log('       ' + nome + ' si e\' fermato a meta\' (' + r.testo.split('\n')[0] + '), e il tempo e\' quasi finito.');
    } else {
      Logger.log('       ' + nome + ' si e\' fermato a meta\' (' + r.testo.split('\n')[0] + '): lo riprendo io fra 20 secondi.');
      Utilities.sleep(20000);
    }
  }
  return r;
}

/** Vero se il testo di una funzione di Orari.gs dice che si e' fermata a meta' e va ripresa. */
function _collaudoAMeta_(testo) {
  return /(Riprende|Riprendo|riprovo) da solo|Riesegui ORARI_ANNULLA_calendario (adesso|fra qualche minuto)/.test(testo);
}

function _collaudoContiene_(testo, pezzi) {
  var s = String(testo || '');
  for (var i = 0; i < pezzi.length; i++) if (s.indexOf(pezzi[i]) < 0) return false;
  return true;
}

/** Per le righe NO: l'errore, o il testo (accorciato) di una funzione di Orari.gs. */
function _collaudoPerche_(r) {
  if (r.errore) return 'errore: ' + r.errore.message;
  return 'ha detto: ' + _collaudoCorto_(r.testo);
}

function _collaudoCorto_(testo) {
  var s = String(testo || '').replace(/\s+/g, ' ');
  return s.length > 400 ? s.slice(0, 400) + '...' : s;
}

/** I calendari tuoi con proprio quel nome (Google non bada alle maiuscole: qui si'). */
function _collaudoCalendari_(nome) {
  var trovati = CalendarApp.getOwnedCalendarsByName(nome) || [];
  var esatti = [];
  for (var i = 0; i < trovati.length; i++) if (String(trovati[i].getName()) === nome) esatti.push(trovati[i]);
  return esatti;
}

function _collaudoCalendario_(nome) {
  var c = _collaudoCalendari_(nome);
  return c.length ? c[0] : null;
}

/**
 * Prima di cominciare: Orari.gs c'e', il progetto e' di prova, il fuso e'
 * quello di Roma, i resti di un collaudo interrotto sono tolti e i nomi dei
 * calendari di prova sono liberi; poi si segna quei nomi (_COLLAUDO_CHIAVE),
 * cosi' un collaudo fermato da Google prima di pulire li fa togliere a
 * quello dopo. Se qualcosa non va, un errore che dice cosa fare.
 */
function _collaudoPrepara_(t, nomi) {
  if (typeof ORARI_4_calendario !== 'function' || typeof ORARI_6_coloraLezioni !== 'function' ||
      typeof ORARI_7_colloqui !== 'function' || typeof _ORARI_MAX_SECONDI !== 'number') {
    throw new Error('in questo progetto non c\'e\' Calendario.gs (o Orari.gs) della 1.6.0 o dopo: incollalo in un file ' +
      'chiamato Calendario, accanto a questo, e riesegui. Non ho toccato niente.');
  }
  if (typeof ORARI !== 'undefined' || typeof CONFIG !== 'undefined' || typeof ANNULLA_automazione === 'function') {
    throw new Error('in questo progetto c\'e\' anche DatiOrari.gs o lo script della Posta: sembra quello vero, e il ' +
      'collaudo ci toglierebbe un lavoro degli orari a meta\'. Mettilo in un progetto nuovo, con solo Calendario.gs (o ' +
      'Orari.gs) e Collaudo_calendario.gs (vedi in cima a questo file). Non ho toccato niente.');
  }
  var fuso = Session.getScriptTimeZone();
  Logger.log(_collaudoScript_() + ' versione ' + _ORARI_VERSIONE + '; fuso orario dello script: ' + fuso + '.');
  if (fuso !== _COLLAUDO_FUSO) {
    throw new Error('il fuso orario di questo progetto e\' ' + fuso + ', non ' + _COLLAUDO_FUSO + ': Impostazioni progetto ' +
      '(l\'ingranaggio a sinistra) -> Fuso orario -> quello con Roma, poi riesegui. Non ho toccato niente.');
  }
  var prop = PropertiesService.getUserProperties();
  var resti = null;
  try { resti = JSON.parse(prop.getProperty(_COLLAUDO_CHIAVE) || 'null'); } catch (e) { resti = null; }
  if (!resti && (prop.getProperty(_ORARI_CHIAVE_CALENDARIO) || prop.getProperty(_ORARI_CHIAVE_COLORI))) {
    throw new Error('in questo progetto c\'e\' un lavoro degli orari a meta\' che non e\' di un collaudo: sembra un ' +
      'progetto vero. Metti il collaudo in un progetto nuovo (vedi in cima a questo file). Non ho toccato niente.');
  }
  if (resti) {
    // un collaudo di prima non ha finito di pulire: i calendari con i suoi
    // nomi li ha creati lui (quando e' cominciato, quei nomi erano liberi)
    _collaudoTogliLavori_();
    var tolti = [], nomiResti = (resti.nomi && resti.nomi.length) ? resti.nomi : [];
    for (var i = 0; i < nomiResti.length; i++) {
      var cals = _collaudoCalendari_(String(nomiResti[i]));
      for (var k = 0; k < cals.length; k++) {
        cals[k].deleteCalendar();
        tolti.push('"' + nomiResti[i] + '"');
      }
    }
    prop.deleteProperty(_COLLAUDO_CHIAVE);
    Logger.log('Un collaudo di prima non aveva finito di pulire: ho tolto i lavori degli orari a meta\', le loro ' +
               'riprese e ' + (tolti.length ? 'i suoi calendari (' + tolti.join(', ') + ')' : 'nessun calendario (non ' +
               'c\'erano piu\')') + '.');
  }
  for (var n = 0; n < nomi.length; n++) {
    if (_collaudoCalendari_(nomi[n]).length) {
      throw new Error('c\'e\' gia\' un calendario tuo chiamato "' + nomi[n] + '", e non l\'ha creato un collaudo: ' +
        'rinominalo o cancellalo tu da Google Calendar, poi riesegui. Non ho toccato niente.');
    }
  }
  prop.setProperty(_COLLAUDO_CHIAVE, JSON.stringify({ nomi: nomi }));
  Logger.log('Il collaudo crea e alla fine cancella ' + (nomi.length > 1 ? 'i calendari "' : 'il calendario "') +
             nomi.join('" e "') + '"; altri calendari non li tocca.');
}

/** Lo script del calendario nel progetto: Orari.gs (con le funzioni delle email) o Calendario.gs. */
function _collaudoScript_() {
  return (typeof ORARI_2_invia === 'function') ? 'Orari.gs' : 'Calendario.gs';
}

/** Via i lavori degli orari a meta' e le loro riprese (del progetto di prova), anche quelle dei colloqui. */
function _collaudoTogliLavori_() {
  var prop = PropertiesService.getUserProperties();
  prop.deleteProperty(_ORARI_CHIAVE_CALENDARIO);
  prop.deleteProperty(_ORARI_CHIAVE_COLORI);
  _togliTriggerOrari_(_ORARI_TRIGGER_CALENDARIO);
  _togliTriggerOrari_(_ORARI_TRIGGER_CAMBIO);
  _togliTriggerOrari_(_ORARI_TRIGGER_COLORI);
  _togliTriggerOrari_(_ORARI_TRIGGER_COLLOQUI);
}

/** Alla fine, anche se qualcosa e' andato storto: via lavori a meta', riprese e calendari di prova. */
function _collaudoPulisci_(t, nomi) {
  var inizio = Date.now();
  _collaudoTitolo_(t, 'PULIZIA');
  try { _collaudoTogliLavori_(); } catch (e) {
    _collaudoNo_(t, 'non riesco a togliere i lavori degli orari a meta\' e le loro riprese', e.message);
  }
  var tutti = true;
  for (var i = 0; i < nomi.length; i++) {
    var tolti = 0, restano = -1, errore = '';
    try {
      var cals = _collaudoCalendari_(nomi[i]);
      for (var k = 0; k < cals.length; k++) {
        cals[k].deleteCalendar();
        tolti++;
      }
      restano = _collaudoCalendari_(nomi[i]).length;
    } catch (err) {
      errore = err.message;
    }
    tutti = _collaudoControlla_(t, 'il calendario di prova "' + nomi[i] + '" non c\'e\' piu\'' +
      (tolti ? ' (cancellato adesso con deleteCalendar)' : ' (non c\'era)'), !errore && restano === 0,
      errore ? 'errore: ' + errore + '. Cancellalo tu da Google Calendar, oppure riesegui il collaudo, che lo toglie prima di ' +
               'cominciare.'
             : 'ce ne sono ancora ' + restano + ': cancellali tu da Google Calendar.') && tutti;
  }
  if (tutti) PropertiesService.getUserProperties().deleteProperty(_COLLAUDO_CHIAVE);
  var rimasti = [];
  try {
    var trigger = ScriptApp.getProjectTriggers();
    for (var j = 0; j < trigger.length; j++) rimasti.push(trigger[j].getHandlerFunction());
  } catch (err2) {
    rimasti.push('? (' + err2.message + ')');
  }
  _collaudoControlla_(t, 'nessun trigger rimasto nel progetto', !rimasti.length, 'ci sono: ' + rimasti.join(', '));
  var secondi = (Date.now() - inizio) / 1000;
  t.passi.push({ nome: 'pulizia', secondi: secondi });
  Logger.log('PASSO pulizia: ' + secondi.toFixed(1) + ' s (' + _collaudoSecondi_(t).toFixed(1) + ' s dall\'inizio)');
}

/** In fondo al registro: i conti, i NO, le parti da fare ancora, le NOTE e i tempi. */
function _collaudoRiepilogo_(t) {
  var righe = ['== RIEPILOGO di ' + t.funzione +
               (typeof _ORARI_VERSIONE !== 'undefined' ? ' (' + _collaudoScript_() + ' ' + _ORARI_VERSIONE + ')' : '')];
  righe.push('Controlli: ' + (t.ok + t.no.length) + '   OK: ' + t.ok + '   NO: ' + t.no.length);
  if (!t.no.length) {
    righe.push(t.daFare.length ? 'I controlli fatti sono tutti OK.' : 'Tutti i controlli sono OK.');
  } else {
    righe.push('I controlli NO:');
    for (var i = 0; i < t.no.length; i++) righe.push('  - ' + t.no[i]);
  }
  if (t.daFare.length) {
    var da = [];
    for (var f = 0; f < t.daFare.length; f++) da.push('COLLAUDO_' + t.daFare[f]);
    righe.push('Da fare, per il tempo: esegui ' + da.join(', poi ') +
               (da.length > 1 ? ', uno alla volta, e copia anche i loro registri.' : ' e copia anche il suo registro.'));
  }
  if (t.fatte.length) {
    var v = [];
    for (var p = 0; p < t.fatte.length; p++) v.push(t.fatte[p].parte + ' in ' + t.fatte[p].secondi.toFixed(1) + ' s');
    righe.push('Parti fatte: ' + v.join(', ') + '.');
  }
  if (t.note.length) {
    righe.push('Cosa fa Google dove nessuno l\'aveva provato:');
    for (var k = 0; k < t.note.length; k++) righe.push('  - ' + t.note[k]);
  }
  var lenti = t.passi.slice(0).sort(function (a, b) { return b.secondi - a.secondi; }).slice(0, 5), v = [];
  for (var j = 0; j < lenti.length; j++) v.push(lenti[j].nome + ' ' + lenti[j].secondi.toFixed(1) + ' s');
  righe.push('Tempo: ' + _collaudoSecondi_(t).toFixed(1) + ' s in tutto, ' + t.passi.length + ' passi (Google ferma uno ' +
             'script dopo 360 s)' + (v.length ? '. I piu\' lenti: ' + v.join('; ') : '') + '.');
  var testo = righe.join('\n');
  Logger.log(testo);
  return testo;
}
