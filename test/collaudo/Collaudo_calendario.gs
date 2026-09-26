/**
 * ============================================================================
 *  COLLAUDO DEL CALENDARIO DEGLI ORARI (per chi sviluppa Campanella)
 * ============================================================================
 *
 *  Prova dal vivo, su Google Calendar, le funzioni vere che mettono l'orario
 *  sul calendario (ORARI_1_anteprima, ORARI_4_calendario,
 *  ORARI_5_cambioOrario, ORARI_6_coloraLezioni, ORARI_7_colloqui,
 *  ORARI_ANNULLA_calendario), quelle di Calendario.gs, la versione solo
 *  calendario che l'applicazione prepara per un altro account (il
 *  personale, per esempio), o quelle di Orari.gs. Dati inventati: il docente
 *  PROVA COLLAUDO, le classi 2B, 3B e 4C, ognuna con il suo colore, dal 12/10
 *  al 13/11/2026 con due giorni senza lezione e l'orario che cambia dal
 *  02/11 (l'ora legale finisce il 25/10, nel mezzo), e i colloqui con le
 *  famiglie, con un link del Meet inventato, intorno a oggi. Ai docenti non
 *  serve.
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
 *       esempio COLLAUDO_3), una alla volta, e copia anche i loro registri.
 *  COLLAUDO fa le tre parti qui sotto in un'esecuzione sola, se ci stanno.
 *  Google ferma uno script dopo 6 minuti: una parte dopo la prima comincia
 *  solo se c'e' il tempo per finirla (_COLLAUDO_STIMA_PARTI), dopo 270
 *  secondi non comincia piu' nessun passo, e alle funzioni del calendario
 *  resta solo il tempo fino a 300 secondi (_ORARI_MAX_SECONDI: poi si
 *  fermano da sole), cosi' la pulizia si fa sempre. COLLAUDO_1, COLLAUDO_2
 *  e COLLAUDO_3 fanno una parte sola.
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
 *    Parte 3 (COLLAUDO_3): il calendario "Collaudo Campanella colloqui", con
 *    le date intorno a oggi (dal lunedi' di due settimane fa al venerdi' fra
 *    tre settimane: ORARI_7_colloqui aggiorna da oggi). 2B il lunedi', il
 *    ricevimento il mercoledi' dalle 15 alle 16 con un link del Meet
 *    inventato, che salta il mercoledi' della settimana scorsa (giorno senza
 *    lezione) e la settimana fra due (colloqui sospesi), e una giornata di
 *    colloqui proprio in quella settimana.
 *    - L'anteprima e ORARI_4_calendario dicono i colloqui; sul calendario ci
 *      sono proprio quelli, nessuno nei giorni saltati, il ricevimento a
 *      tratti (una serie per tratto) e la giornata come evento singolo, con
 *      il titolo scritto, il link come luogo, il colore dei colloqui, il
 *      loro contrassegno e la descrizione con il link.
 *    - ORARI_7_colloqui con il ricevimento un'ora dopo e un altro link: gli
 *      incontri prima di oggi restano come erano, da oggi ci sono quelli
 *      nuovi (il messaggio dice quanti ricevimenti ha rifatto e tolto); le
 *      lezioni e un colloquio con la dirigente, che non e' di Campanella,
 *      non cambiano.
 *    - Il cambio d'orario dal lunedi' fra due settimane, con i colloqui
 *      dell'orario nuovo (il giovedi', un terzo link): ORARI_7_colloqui
 *      prima di quel giorno li mette solo da li' (l'anteprima lo dice
 *      prima); ORARI_5_cambioOrario cambia le lezioni da quel giorno e lascia
 *      i colloqui come sono.
 *    - ORARI_6_coloraLezioni con un altro colore dei colloqui li colora
 *      tutti, anche quelli rifatti, e non sposta niente.
 *    - ORARI_ANNULLA_calendario toglie lezioni e colloqui, e lascia il
 *      colloquio con la dirigente.
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
var _COLLAUDO_NOME_COLLOQUI  = 'Collaudo Campanella colloqui';
var _COLLAUDO_NOMI           = ['', _COLLAUDO_NOME, _COLLAUDO_NOME_VECCHIO, _COLLAUDO_NOME_COLLOQUI];  // il calendario di ogni parte
var _COLLAUDO_CHIAVE         = 'CAMPANELLA_COLLAUDO_CALENDARIO';  // i nomi dei calendari di un collaudo non ancora pulito
var _COLLAUDO_FUSO           = 'Europe/Rome';
// Google ferma uno script dopo 360 secondi. Dal vivo un'operazione sul
// calendario prende circa un secondo: la parte 1 un paio di minuti, la 2 uno,
// la 3 un paio, e il passo piu' lungo (ORARI_5_cambioOrario) meno di uno
var _COLLAUDO_LIMITE_PASSI   = 270;   // secondi: dopo, nessun passo nuovo, e la pulizia ha tempo
var _COLLAUDO_LIMITE_ORARI   = 300;   // secondi: le funzioni del calendario si fermano da sole entro qui
// quanto puo' prendere ogni parte: COLLAUDO comincia una parte dopo la prima
// solo se, con i secondi gia' passati, resta entro _COLLAUDO_LIMITE_PASSI
var _COLLAUDO_STIMA_PARTI    = [0, 180, 90, 150];
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
// parte 3, i colloqui: le date le calcola _collaudoDateColloqui_, intorno a
// oggi. Il lunedi' 2B (con l'orario nuovo il martedi'), il colore dei colloqui
// 7 Pavone (per ORARI_6_coloraLezioni 3 Vinaccia); i link sono inventati
var _COLLAUDO_PRIMA_3     = [{ classe: '2B', giorno: 1, da: 1, a: 2 }];
var _COLLAUDO_DOPO_3      = [{ classe: '2B', giorno: 2, da: 1, a: 2 }];
var _COLLAUDO_COLORI_3    = { '2B': '9' };
var _COLLAUDO_COLORE_COLLOQUI       = '7';
var _COLLAUDO_COLORE_COLLOQUI_NUOVO = '3';
var _COLLAUDO_LINK = ['https://meet.google.com/abc-defg-hij', 'https://meet.google.com/kmn-pqrs-tuv',
                      'https://meet.google.com/wxy-zabc-def'];
var _COLLAUDO_RICEVIMENTO_3 = 'Ricevimento genitori (collaudo)';
var _COLLAUDO_GIORNATA_3    = 'Colloqui generali (collaudo)';
var _COLLAUDO_DIRIGENTE     = 'Colloquio con la dirigente (collaudo)';   // non e' di Campanella


// ===========================================================================
//  LE FUNZIONI DA ESEGUIRE
// ===========================================================================
function COLLAUDO() {
  return _collaudo_('COLLAUDO', [1, 2, 3]);
}

function COLLAUDO_1() {
  return _collaudo_('COLLAUDO_1', [1]);
}

function COLLAUDO_2() {
  return _collaudo_('COLLAUDO_2', [2]);
}

function COLLAUDO_3() {
  return _collaudo_('COLLAUDO_3', [3]);
}

/**
 * Le parti (1, 2, 3) una dopo l'altra, con la pulizia alla fine anche se
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
        else if (parti[p] === 2) _collaudoParte2_(t);
        else _collaudoParte3_(t);
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
//  PARTE 3: I COLLOQUI CON LE FAMIGLIE, INTORNO A OGGI
// ===========================================================================
function _collaudoParte3_(t) {
  var fuso = Session.getScriptTimeZone(), nome = _COLLAUDO_NOME_COLLOQUI;
  var g = _collaudoDateColloqui_();
  _collaudoTitolo_(t, 'PARTE 3 (COLLAUDO_3): i colloqui con le famiglie nel calendario "' + nome + '", dal ' +
                      _collaudoBreve_(g.inizio) + ' al ' + _collaudoBreve_(g.fine) + ' (oggi e\' il ' + _collaudoBreve_(g.oggi) + ')');
  var sospensioni = [{ dal: g.senzaLezione, al: g.senzaLezione, nome: 'Giorno senza lezione (collaudo)' }];
  var sospesi = [{ dal: g.sospesiDal, al: g.sospesiAl }];
  // i colloqui scritti, quelli cambiati (un'ora dopo, un altro link) e quelli dell'orario nuovo (il giovedi', un terzo link)
  var k0 = _collaudoColloquiDati_('mercoledi', '15:00', '16:00', _COLLAUDO_LINK[0], g.giornata, '16:00', '19:00', sospesi);
  var k1 = _collaudoColloquiDati_('mercoledi', '16:00', '17:00', _COLLAUDO_LINK[1], g.giornata, '17:00', '19:00', sospesi);
  var k2 = _collaudoColloquiDati_('giovedi', '15:00', '16:00', _COLLAUDO_LINK[2], g.fine, '15:00', '18:00', sospesi);
  var dati = function (blocchi, validoDal, k, colore) {
    return _collaudoDati_(nome, blocchi, _COLLAUDO_COLORI_3, validoDal,
                          { inizio: g.inizio, fine: g.fine, sospensioni: sospensioni, colloqui: k, coloreColloqui: colore });
  };
  var cc = _COLLAUDO_COLORE_COLLOQUI;
  var lezioni = _collaudoAttese_(_COLLAUDO_PRIMA_3, g.inizio, g.fine, sospensioni);
  var a0 = _collaudoColloquiAttesi_(k0, g.inizio, g.fine, sospensioni);

  // --- l'anteprima e ORARI_4_calendario, con i colloqui
  ORARI = dati(_COLLAUDO_PRIMA_3, '', k0, cc);
  var riga = _collaudoRigaColloqui_(a0, cc);
  var r = _collaudoOrari_(t, 'ORARI_1_anteprima', ORARI_1_anteprima);
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_1_anteprima dice i colloqui da mettere: ' + riga,
    !r.errore && _collaudoContiene_(r.testo, ['Colloqui da mettere con ORARI_4_calendario: ' + riga]), _collaudoPerche_(r));
  r = _collaudoOrari_(t, 'ORARI_4_calendario', ORARI_4_calendario);
  if (t.fermo) return;
  var messo = _collaudoControlla_(t, 'ORARI_4_calendario mette l\'orario e i colloqui, in un calendario che crea con il fuso ' +
    fuso, !r.errore && _collaudoContiene_(r.testo, ['Creato il calendario "' + nome + '", con il fuso orario ' + fuso,
    'Colloqui messi: ' + riga]), _collaudoPerche_(r));
  var cal = _collaudoCalendario_(nome);
  if (!_collaudoControlla_(t, 'c\'e\' il calendario "' + nome + '"', !!cal)) return;
  var lette = _collaudoLeggi_(t, cal, 'dopo ORARI_4_calendario', g.inizio, g.fine, true);
  if (!lette) return;
  var d = _collaudoDiff_(_collaudoVociAttese_(lezioni.lezioni, _COLLAUDO_COLORI_3), _collaudoVoci_(_collaudoNostre_(lette)));
  _collaudoControlla_(t, 'dopo ORARI_4_calendario: le lezioni sono quelle dell\'orario (' + lezioni.lezioni.length + ', 2B il ' +
    'lunedi\'), con il colore della classe', _collaudoNostre_(lette).length > 0 && d.uguali, _collaudoDiffTesto_(d));
  _collaudoControllaColloqui_(t, lette, a0, cc, 'dopo ORARI_4_calendario');
  _collaudoControllaTratti_(t, lette, a0, g);
  if (!messo) {
    Logger.log('Mi fermo qui con la parte 3: senza l\'orario e i colloqui messi da ORARI_4_calendario il resto non si prova.');
    return;
  }

  // --- un colloquio che non e' di Campanella: nessuna funzione deve toccarlo
  var inizioAltro = _collaudoIstante_(g.dirigente + ' 15:00'), fineAltro = _collaudoIstante_(g.dirigente + ' 16:00');
  r = _collaudoPasso_(t, 'createEvent: "' + _COLLAUDO_DIRIGENTE + '", che non e\' di Campanella', function () {
    return cal.createEvent(_COLLAUDO_DIRIGENTE, inizioAltro, fineAltro,
                           { description: 'Evento del collaudo: non e\' di Campanella.' });
  });
  if (t.fermo) return;
  if (r.errore) { _collaudoNo_(t, 'non riesco a creare "' + _COLLAUDO_DIRIGENTE + '"', r.errore.message); return; }
  var altre = [_collaudoVoce_(_collaudoChiave_(_COLLAUDO_DIRIGENTE, inizioAltro, fineAltro), '')];

  // --- ORARI_7_colloqui: il ricevimento un'ora dopo, con un altro link, da oggi
  var oggi = _collaudoIstante_(g.oggi);
  var primaDiOggi = _collaudoVoci_(_collaudoColloqui_(lette), function (l) { return l.inizio < oggi; });
  var lezioniPrima = _collaudoVoci_(_collaudoNostre_(lette));
  var a1 = _collaudoColloquiAttesi_(k1, g.oggi, g.fine, sospensioni);
  var conti = _collaudoContiTaglio_(a0, g.oggi);
  ORARI = dati(_COLLAUDO_PRIMA_3, '', k1, cc);
  if (!_collaudoStessoGiorno_(t, g)) return;
  r = _collaudoOrari_(t, 'ORARI_7_colloqui', ORARI_7_colloqui);
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_7_colloqui con il ricevimento dalle 16 alle 17 e un altro link aggiorna i colloqui da oggi: ' +
    'ricevimenti rifatti fino a ieri ' + conti.rifatti + ', tolti ' + conti.tolti + ', giornate tolte ' + conti.giornate,
    !r.errore && _collaudoContiene_(r.testo, [
      'Colloqui aggiornati dal ' + g.oggi + ' nel calendario "' + nome + '"',
      'Ricevimenti di prima rifatti fino al ' + g.ieri + ', con gli incontri come erano: ' + conti.rifatti + '\n',
      'Ricevimenti di prima tolti (nessun incontro prima del ' + g.oggi + '): ' + conti.tolti + '\n',
      'Giornate di colloqui tolte (dal ' + g.oggi + ' in poi): ' + conti.giornate + '\n',
      'Colloqui dal ' + g.oggi + ': ' + _collaudoRigaColloqui_(a1, cc)]), _collaudoPerche_(r));
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_7_colloqui', g.inizio, g.fine);
  if (!lette) return;
  d = _collaudoDiff_(primaDiOggi, _collaudoVoci_(_collaudoColloqui_(lette), function (l) { return l.inizio < oggi; }));
  _collaudoControlla_(t, 'dopo ORARI_7_colloqui: gli incontri prima di oggi (' + primaDiOggi.length + ') sono rimasti come erano, ' +
    'alla stessa ora, con il link e il colore di prima', primaDiOggi.length > 0 && d.uguali, _collaudoDiffTesto_(d));
  var nuovi = _collaudoVociColloqui_(a1, cc);
  d = _collaudoDiff_(nuovi, _collaudoVoci_(_collaudoColloqui_(lette), function (l) { return l.inizio >= oggi; }));
  _collaudoControlla_(t, 'dopo ORARI_7_colloqui: da oggi ci sono proprio i colloqui nuovi (' + nuovi.length + '), un\'ora dopo, ' +
    'con il link nuovo e il colore dei colloqui', nuovi.length > 0 && d.uguali, _collaudoDiffTesto_(d));
  _collaudoControllaContrassegni_(t, lette, 'dopo ORARI_7_colloqui');
  d = _collaudoDiff_(lezioniPrima, _collaudoVoci_(_collaudoNostre_(lette)));
  var e = _collaudoDiff_(altre, _collaudoVoci_(_collaudoAltre_(lette)));
  _collaudoControlla_(t, 'dopo ORARI_7_colloqui: le lezioni e "' + _COLLAUDO_DIRIGENTE + '", che non e\' di Campanella, sono ' +
    'rimasti come erano', d.uguali && e.uguali, [_collaudoDiffTesto_(d), _collaudoDiffTesto_(e)].join('\n'));

  // --- il cambio d'orario dal lunedi' fra due settimane, con i colloqui dell'orario nuovo
  var V = g.validoDal, dalV = _collaudoIstante_(V), primaV = _collaudoGiorno_(_collaudoPiu_(dalV, -1));
  var a2 = _collaudoColloquiAttesi_(k2, V, g.fine, sospensioni);
  var riga2 = _collaudoRigaColloqui_(a2, cc);
  ORARI = dati(_COLLAUDO_DOPO_3, V, k2, cc);
  r = _collaudoOrari_(t, 'ORARI_1_anteprima', ORARI_1_anteprima, 'ORARI_1_anteprima con l\'orario nuovo');
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_1_anteprima con l\'orario nuovo dal ' + _collaudoBreve_(V) + ' dice che anche ORARI_7_colloqui ' +
    'mette i colloqui nuovi da quel giorno', !r.errore && _collaudoContiene_(r.testo, ['L\'orario e\' cambiato: il nuovo vale ' +
    'dal ' + V, 'Anche ORARI_7_colloqui, prima del ' + V + ', mette i colloqui di DatiOrari.gs da quel giorno']),
    _collaudoPerche_(r));
  var prima7 = _collaudoVoci_(_collaudoColloqui_(lette), function (l) { return l.inizio < dalV; });
  lezioniPrima = _collaudoVoci_(_collaudoNostre_(lette));
  conti = _collaudoContiTaglio_(a1, V);
  if (!_collaudoStessoGiorno_(t, g)) return;
  r = _collaudoOrari_(t, 'ORARI_7_colloqui', ORARI_7_colloqui, 'ORARI_7_colloqui prima del cambio d\'orario');
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_7_colloqui prima del cambio d\'orario aggiorna i colloqui dal ' + _collaudoBreve_(V) + ', e dice ' +
    'che fino al giorno prima restano quelli dell\'orario di prima', !r.errore && _collaudoContiene_(r.testo, [
      'Colloqui aggiornati dal ' + V + ' nel calendario "' + nome + '"', 'L\'orario nuovo vale dal ' + V,
      'Dal ' + g.oggi + ' al ' + primaV + ' restano i colloqui dell\'orario di prima',
      'Ricevimenti di prima rifatti fino al ' + primaV + ', con gli incontri come erano: ' + conti.rifatti + '\n',
      'Ricevimenti di prima tolti (nessun incontro prima del ' + V + '): ' + conti.tolti + '\n',
      'Giornate di colloqui tolte (dal ' + V + ' in poi): ' + conti.giornate + '\n', 'Colloqui dal ' + V + ': ' + riga2]),
    _collaudoPerche_(r));
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_7_colloqui prima del cambio', g.inizio, g.fine);
  if (!lette) return;
  d = _collaudoDiff_(prima7, _collaudoVoci_(_collaudoColloqui_(lette), function (l) { return l.inizio < dalV; }));
  _collaudoControlla_(t, 'e fino al ' + _collaudoBreve_(primaV) + ' i colloqui sono rimasti come erano (anche quelli da oggi, con ' +
    'il link di prima)', prima7.length > 0 && d.uguali, _collaudoDiffTesto_(d));
  var dopoV = _collaudoVociColloqui_(a2, cc);
  d = _collaudoDiff_(dopoV, _collaudoVoci_(_collaudoColloqui_(lette), function (l) { return l.inizio >= dalV; }));
  _collaudoControlla_(t, 'e dal ' + _collaudoBreve_(V) + ' ci sono i colloqui dell\'orario nuovo (' + dopoV.length + ', il ' +
    'ricevimento il giovedi\' con il terzo link)', dopoV.length > 0 && d.uguali, _collaudoDiffTesto_(d));
  d = _collaudoDiff_(lezioniPrima, _collaudoVoci_(_collaudoNostre_(lette)));
  _collaudoControlla_(t, 'e le lezioni sono ancora quelle dell\'orario di prima, anche dal ' + _collaudoBreve_(V) + ' (le cambia ' +
    'ORARI_5_cambioOrario)', d.uguali, _collaudoDiffTesto_(d));

  var colloquiDopo7 = _collaudoVoci_(_collaudoColloqui_(lette));
  lezioniPrima = _collaudoVoci_(_collaudoNostre_(lette), function (l) { return l.inizio < dalV; });
  var rifatte = 0;
  for (var k = 0; k < lezioni.tratti.length; k++) {
    var lz = lezioni.tratti[k].lezioni;
    if (lz[0].inizio < dalV && lz[lz.length - 1].inizio >= dalV) rifatte++;
  }
  var nuove = _collaudoAttese_(_COLLAUDO_DOPO_3, V, g.fine, sospensioni);
  r = _collaudoOrari_(t, 'ORARI_5_cambioOrario', ORARI_5_cambioOrario);
  if (t.fermo) return;
  _collaudoControlla_(t, 'ORARI_5_cambioOrario cambia l\'orario dal ' + _collaudoBreve_(V) + ' (serie rifatte fino al giorno ' +
    'prima: ' + rifatte + ') e dice i colloqui da quel giorno', !r.errore && _collaudoContiene_(r.testo, [
      'Cambio d\'orario dal ' + V + ' nel calendario "' + nome + '"',
      'Serie dell\'orario di prima rifatte fino al ' + primaV + ', con le lezioni come erano: ' + rifatte + '\n',
      'Colloqui dal ' + V + ': ' + riga2]), _collaudoPerche_(r));
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_5_cambioOrario', g.inizio, g.fine);
  if (!lette) return;
  d = _collaudoDiff_(lezioniPrima.concat(_collaudoVociAttese_(nuove.lezioni, _COLLAUDO_COLORI_3)),
                     _collaudoVoci_(_collaudoNostre_(lette)));
  _collaudoControlla_(t, 'dopo ORARI_5_cambioOrario: le lezioni prima del ' + _collaudoBreve_(V) + ' sono rimaste, e da quel giorno ' +
    'c\'e\' l\'orario nuovo (2B il martedi\', ' + nuove.lezioni.length + ' lezioni)', nuove.lezioni.length > 0 && d.uguali,
    _collaudoDiffTesto_(d));
  d = _collaudoDiff_(colloquiDopo7, _collaudoVoci_(_collaudoColloqui_(lette)));
  e = _collaudoDiff_(altre, _collaudoVoci_(_collaudoAltre_(lette)));
  _collaudoControlla_(t, 'dopo ORARI_5_cambioOrario: i colloqui sono come li ha lasciati ORARI_7_colloqui, e "' +
    _COLLAUDO_DIRIGENTE + '" com\'era', d.uguali && e.uguali, [_collaudoDiffTesto_(d), _collaudoDiffTesto_(e)].join('\n'));
  _collaudoControllaContrassegni_(t, lette, 'dopo ORARI_5_cambioOrario');

  // --- un altro colore dei colloqui: ORARI_6_coloraLezioni
  var nuovo = _COLLAUDO_COLORE_COLLOQUI_NUOVO;
  ORARI = dati(_COLLAUDO_DOPO_3, V, k2, nuovo);
  var chiaviPrima6 = _collaudoCampo_(_collaudoTutte_(lette), 'chiave');
  var lezioniPrima6 = _collaudoVoci_(_collaudoNostre_(lette));
  r = _collaudoOrari_(t, 'ORARI_6_coloraLezioni', ORARI_6_coloraLezioni);
  if (t.fermo) return;
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_6_coloraLezioni', g.inizio, g.fine);
  if (!lette) return;
  var colloqui = _collaudoColloqui_(lette), male = [];
  for (var c = 0; c < colloqui.length; c++) if (colloqui[c].colore !== nuovo) male.push(colloqui[c].voce);
  _collaudoControlla_(t, 'ORARI_6_coloraLezioni da\' a tutti i colloqui (' + colloqui.length + ', anche quelli prima di oggi e ' +
    'quelli rifatti) il colore nuovo dei colloqui, ' + _orariNomeColore_(nuovo), !r.errore && colloqui.length > 0 && !male.length,
    r.errore ? _collaudoPerche_(r) : 'con un altro colore: ' + _collaudoElenco_(male));
  d = _collaudoDiff_(lezioniPrima6, _collaudoVoci_(_collaudoNostre_(lette)));
  e = _collaudoDiff_(chiaviPrima6, _collaudoCampo_(_collaudoTutte_(lette), 'chiave'));
  _collaudoControlla_(t, 'e le lezioni restano con il colore della loro classe, e niente e\' spostato, aggiunto o tolto',
    d.uguali && e.uguali, [_collaudoDiffTesto_(d), _collaudoDiffTesto_(e)].join('\n'));

  // --- via tutto
  r = _collaudoOrari_(t, 'ORARI_ANNULLA_calendario', ORARI_ANNULLA_calendario);
  if (t.fermo) return;
  lette = _collaudoLeggi_(t, cal, 'dopo ORARI_ANNULLA_calendario', g.inizio, g.fine);
  if (!lette) return;
  var restano = _collaudoVoci_(_collaudoNostre_(lette)).concat(_collaudoVoci_(_collaudoColloqui_(lette)));
  _collaudoControlla_(t, 'ORARI_ANNULLA_calendario toglie tutte le lezioni e tutti i colloqui di Campanella',
    !r.errore && !restano.length, r.errore ? _collaudoPerche_(r) : 'restano: ' + _collaudoElenco_(restano));
  e = _collaudoDiff_(altre, _collaudoVoci_(_collaudoAltre_(lette)));
  _collaudoControlla_(t, 'e lascia "' + _COLLAUDO_DIRIGENTE + '", che non e\' di Campanella', e.uguali, _collaudoDiffTesto_(e));
}

/**
 * Le date della parte 3 ("aaaa-mm-gg", nel fuso dello script), intorno a
 * oggi: il periodo dal lunedi' di due settimane fa al venerdi' fra tre
 * settimane; il giorno senza lezione e' il mercoledi' della settimana scorsa,
 * i colloqui sono sospesi la settimana fra due (da lunedi' a venerdi'), con
 * la giornata di colloqui il giovedi' di quella settimana; l'orario nuovo
 * vale dal lunedi' fra due settimane; il colloquio con la dirigente e' il
 * giovedi' della settimana prossima.
 */
function _collaudoDateColloqui_() {
  var adesso = new Date();
  var oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  var lunedi = _collaudoPiu_(oggi, -((oggi.getDay() + 6) % 7));    // il lunedi' di questa settimana
  var giorno = function (n) { return _collaudoGiorno_(_collaudoPiu_(lunedi, n)); };
  return { oggi: _collaudoGiorno_(oggi), ieri: _collaudoGiorno_(_collaudoPiu_(oggi, -1)), inizio: giorno(-14), fine: giorno(25),
           senzaLezione: giorno(-5), sospesiDal: giorno(14), sospesiAl: giorno(18), giornata: giorno(17), validoDal: giorno(14),
           dirigente: giorno(10) };
}

/** I colloqui come li scrive Campanella in DatiOrari.gs: il ricevimento settimanale, una giornata, i periodi senza colloqui. */
function _collaudoColloquiDati_(giorno, dalle, alle, link, giornata, dalleGiornata, alleGiornata, sospesi) {
  return {
    settimanali: [{ giorno: giorno, dalle: dalle, alle: alle, dal: '', al: '', nome: _COLLAUDO_RICEVIMENTO_3, link: link }],
    singoli: [{ data: giornata, dalle: dalleGiornata, alle: alleGiornata, nome: _COLLAUDO_GIORNATA_3, link: link }],
    sospensioni: sospesi
  };
}

/**
 * I colloqui attesi (k come in DatiOrari.gs) dal giorno "dal" alla fine,
 * calcolati qui senza le funzioni di Orari.gs: gli incontri del ricevimento
 * ogni settimana, senza i giorni senza lezione (sospensioni) e quelli senza
 * colloqui (k.sospensioni), a tratti di settimane (una serie ciascuno); le
 * giornate da "dal" in poi. Ogni incontro con titolo, inizio, fine, luogo (il
 * link), giorno, singolo e chiave; i conti come nei messaggi di Orari.gs.
 */
function _collaudoColloquiAttesi_(k, dal, fine, sospensioni) {
  var nomi = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  var a = { incontri: [], chiavi: [], perChiave: {}, tratti: [], settimanali: k.settimanali.length, nSettimanali: 0,
            singoli: 0, saltati: 0 };
  var metti = function (x, giorno, singolo) {
    var l = { titolo: x.nome, inizio: _collaudoIstante_(giorno + ' ' + x.dalle), fine: _collaudoIstante_(giorno + ' ' + x.alle),
              luogo: x.link, giorno: giorno, singolo: singolo };
    l.chiave = _collaudoChiave_(l.titolo, l.inizio, l.fine);
    a.incontri.push(l);
    a.chiavi.push(l.chiave);
    a.perChiave[l.chiave] = l;
  };
  var ultimo = _collaudoIstante_(fine);
  for (var i = 0; i < k.settimanali.length; i++) {
    var w = k.settimanali[i], n = nomi.indexOf(w.giorno), tratto = null;
    for (var g = _collaudoIstante_(dal); g <= ultimo; g = _collaudoPiu_(g, 1)) {
      if (g.getDay() !== n) continue;
      if (_collaudoSospeso_(g, sospensioni) || _collaudoSospeso_(g, k.sospensioni)) { a.saltati++; tratto = null; continue; }
      var giorno = _collaudoGiorno_(g);
      if (!tratto) { tratto = { giorni: [] }; a.tratti.push(tratto); }
      tratto.giorni.push(giorno);
      metti(w, giorno, false);
      a.nSettimanali++;
    }
  }
  for (var j = 0; j < k.singoli.length; j++) {
    if (k.singoli[j].data < dal || k.singoli[j].data > fine) continue;
    metti(k.singoli[j], k.singoli[j].data, true);
    a.singoli++;
  }
  return a;
}

/** Le voci dei colloqui attesi, con il colore dato e il loro link. */
function _collaudoVociColloqui_(attesi, colore) {
  var v = [];
  for (var i = 0; i < attesi.incontri.length; i++) {
    v.push(_collaudoVoce_(attesi.incontri[i].chiave, colore, attesi.incontri[i].luogo));
  }
  return v;
}

/**
 * La riga dei colloqui dei messaggi di Orari.gs, per i colloqui attesi:
 * "1 ricevimento settimanale (3 serie, 4 incontri), 1 giornata singola; 2
 * incontri saltati nei giorni senza lezione o senza colloqui. Colore dei
 * colloqui: Pavone."
 */
function _collaudoRigaColloqui_(a, colore) {
  return (a.settimanali === 1 ? '1 ricevimento settimanale' : a.settimanali + ' ricevimenti settimanali') + ' (' +
    a.tratti.length + ' serie, ' + a.nSettimanali + ' incontri), ' +
    (a.singoli === 1 ? '1 giornata singola' : a.singoli + ' giornate singole') +
    (a.saltati ? '; ' + a.saltati + ' incontri saltati nei giorni senza lezione o senza colloqui' : '') +
    '. Colore dei colloqui: ' + _orariNomeColore_(colore) + '.';
}

/**
 * Per i messaggi di ORARI_7_colloqui (come per il cambio d'orario): dei
 * colloqui attesi, i ricevimenti (i tratti) che hanno incontri prima di
 * "dal" e da "dal" in poi (rifatti fino al giorno prima), quelli tutti da
 * "dal" in poi (tolti) e le giornate da "dal" in poi (tolte).
 */
function _collaudoContiTaglio_(attesi, dal) {
  var c = { rifatti: 0, tolti: 0, giornate: 0 };
  for (var i = 0; i < attesi.tratti.length; i++) {
    var giorni = attesi.tratti[i].giorni;
    if (giorni[0] >= dal) c.tolti++;
    else if (giorni[giorni.length - 1] >= dal) c.rifatti++;
  }
  for (var k = 0; k < attesi.incontri.length; k++) if (attesi.incontri[k].singolo && attesi.incontri[k].giorno >= dal) c.giornate++;
  return c;
}

/** Vero se oggi e' ancora il giorno delle date della parte 3; se no un NO: ORARI_7_colloqui aggiorna da oggi. */
function _collaudoStessoGiorno_(t, g) {
  var adesso = _collaudoGiorno_(new Date());
  if (adesso === g.oggi) return true;
  _collaudoNo_(t, 'il giorno e\' cambiato durante la parte 3 (era il ' + g.oggi + ', adesso e\' il ' + adesso + '): ' +
    'ORARI_7_colloqui aggiorna da oggi, e i controlli non tornerebbero', 'Riesegui COLLAUDO_3.');
  return false;
}

/**
 * I colloqui letti dal calendario sono quelli attesi, tutti e soli (con il
 * titolo scritto), ognuno con il suo link come luogo, il colore dei colloqui,
 * il loro contrassegno e la descrizione di Campanella con il link. Senza
 * colloqui ogni controllo e' NO.
 */
function _collaudoControllaColloqui_(t, lette, attesi, colore, quando) {
  var colloqui = _collaudoColloqui_(lette);
  var vuoto = 'nessun colloquio di Campanella nel calendario';
  var d = _collaudoDiff_(attesi.chiavi, _collaudoCampo_(colloqui, 'chiave'));
  _collaudoControlla_(t, quando + ': i colloqui sono proprio quelli scritti (' + attesi.nSettimanali + ' incontri del ' +
    'ricevimento e ' + attesi.singoli + ' giornata), con il titolo scritto, nessuno in piu\' ne\' in meno',
    colloqui.length > 0 && d.uguali, colloqui.length ? _collaudoDiffTesto_(d) : vuoto);
  var male = [], link = [];
  for (var i = 0; i < colloqui.length; i++) {
    var a = attesi.perChiave[colloqui[i].chiave];
    if (a && colloqui[i].luogo !== a.luogo) male.push(colloqui[i].chiave + ' @ ' + (colloqui[i].luogo || '(nessun luogo)'));
  }
  for (var k = 0; k < attesi.incontri.length; k++) if (link.indexOf(attesi.incontri[k].luogo) < 0) link.push(attesi.incontri[k].luogo);
  _collaudoControlla_(t, quando + ': ogni colloquio ha come luogo il suo link del Meet (' + link.join(', ') + ')',
    colloqui.length > 0 && !male.length, colloqui.length ? 'con un altro luogo: ' + _collaudoElenco_(male) : vuoto);
  male = [];
  for (var c = 0; c < colloqui.length; c++) if (colloqui[c].colore !== colore) male.push(colloqui[c].voce);
  _collaudoControlla_(t, quando + ': ogni colloquio ha il colore dei colloqui (' + _orariNomeColore_(colore) + ')',
    colloqui.length > 0 && !male.length, colloqui.length ? 'con un altro colore (fra le quadre): ' + _collaudoElenco_(male) : vuoto);
  _collaudoControllaContrassegni_(t, lette, quando);
}

/** Ogni colloquio ha il contrassegno dei colloqui e la descrizione che comincia con [Campanella] Colloqui e dice il suo link. */
function _collaudoControllaContrassegni_(t, lette, quando) {
  var colloqui = _collaudoColloqui_(lette), male = [];
  for (var i = 0; i < colloqui.length; i++) {
    var x = colloqui[i];
    if (x.tag !== _ORARI_TAG_COLLOQUIO) male.push(x.chiave + ': senza il contrassegno dei colloqui');
    else if (x.descrizione.indexOf(_ORARI_INIZIO_COLLOQUI) !== 0) male.push(x.chiave + ': la descrizione non comincia con "' +
                                                                           _ORARI_INIZIO_COLLOQUI + '"');
    else if (x.luogo && x.descrizione.indexOf(x.luogo) < 0) male.push(x.chiave + ': la descrizione non dice il link');
  }
  _collaudoControlla_(t, quando + ': ogni colloquio (' + colloqui.length + ') ha il contrassegno dei colloqui e la descrizione ' +
    'di Campanella, con il suo link', colloqui.length > 0 && !male.length,
    colloqui.length ? _collaudoElenco_(male) : 'nessun colloquio di Campanella nel calendario');
}

/**
 * Dopo ORARI_4_calendario (letto con le serie): nessun incontro del
 * ricevimento nel giorno senza lezione e nella settimana senza colloqui, la
 * giornata c'e' anche li'; il ricevimento e' una serie per ogni tratto di
 * settimane, la giornata un evento singolo.
 */
function _collaudoControllaTratti_(t, lette, attesi, g) {
  var colloqui = _collaudoColloqui_(lette), saltati = [], giornata = false;
  var fermi = [{ dal: g.senzaLezione, al: g.senzaLezione }, { dal: g.sospesiDal, al: g.sospesiAl }];
  for (var i = 0; i < colloqui.length; i++) {
    if (colloqui[i].titolo === _COLLAUDO_GIORNATA_3) giornata = giornata || _collaudoGiorno_(colloqui[i].inizio) === g.giornata;
    else if (_collaudoSospeso_(colloqui[i].inizio, fermi)) saltati.push(colloqui[i].chiave);
  }
  _collaudoControlla_(t, 'dopo ORARI_4_calendario: nessun incontro del ricevimento il ' + _collaudoBreve_(g.senzaLezione) +
    ' (giorno senza lezione) ne\' dal ' + _collaudoBreve_(g.sospesiDal) + ' al ' + _collaudoBreve_(g.sospesiAl) + ' (colloqui ' +
    'sospesi); la giornata del ' + _collaudoBreve_(g.giornata) + ', in quei giorni, c\'e\'', colloqui.length > 0 &&
    !saltati.length && giornata, saltati.length ? 'ci sono: ' + _collaudoElenco_(saltati) : 'manca la giornata');
  var gruppi = {}, ordine = [], male = [];
  for (var k = 0; k < colloqui.length; k++) {
    var x = colloqui[k], a = attesi.perChiave[x.chiave];
    if (!a) continue;                        // un colloquio in piu': lo dice gia' il controllo di prima
    if (a.singolo) {
      if (x.ricorrente) male.push(x.chiave + ': e\' in una serie, non un evento singolo');
      continue;
    }
    if (!x.ricorrente || !x.serie) { male.push(x.chiave + ': non e\' in una serie'); continue; }
    if (!gruppi[x.serie]) { gruppi[x.serie] = []; ordine.push(x.serie); }
    gruppi[x.serie].push(_collaudoBreve_(a.giorno));
  }
  var trovati = [], tratti = [];
  for (var s = 0; s < ordine.length; s++) trovati.push(gruppi[ordine[s]].join(', '));
  for (var n = 0; n < attesi.tratti.length; n++) {
    var v = [];
    for (var m = 0; m < attesi.tratti[n].giorni.length; m++) v.push(_collaudoBreve_(attesi.tratti[n].giorni[m]));
    tratti.push(v.join(', '));
  }
  var d = _collaudoDiff_(tratti, trovati);
  _collaudoControlla_(t, 'dopo ORARI_4_calendario: il ricevimento e\' a tratti, una serie per ogni tratto di settimane (' +
    tratti.length + ': ' + tratti.join('; ') + '), e la giornata e\' un evento singolo', trovati.length > 0 && d.uguali &&
    !male.length, [d.uguali ? '' : 'serie attese: ' + tratti.join('; ') + '\nserie trovate: ' + trovati.join('; '),
    male.join('; ')].join('\n'));
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
 * e quante lezioni saltate. Di partenza la fine e i giorni senza lezione sono
 * quelli delle parti 1 e 2.
 */
function _collaudoAttese_(blocchi, dal, fine, sospensioni) {
  var fuori = { lezioni: [], chiavi: [], tratti: [], serie: 0, saltate: 0 };
  var inizio = _collaudoIstante_(dal), ultimo = _collaudoIstante_(fine || _COLLAUDO_FINE);
  for (var b = 0; b < blocchi.length; b++) {
    var x = blocchi[b], tratto = null;
    for (var g = inizio; g <= ultimo; g = new Date(g.getFullYear(), g.getMonth(), g.getDate() + 1)) {
      if (g.getDay() !== x.giorno) continue;
      if (_collaudoSospeso_(g, sospensioni)) { fuori.saltate++; tratto = null; continue; }
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
 * bene a Calendario.gs e a Orari.gs. In piu' (se ci sono): inizio e fine
 * del periodo, giorni senza lezione, colloqui e il loro colore; se no quelli
 * delle parti 1 e 2, senza colloqui.
 */
function _collaudoDati_(nome, blocchi, colori, validoDal, piu) {
  piu = piu || {};
  var celle = [];
  for (var i = 0; i < _COLLAUDO_GIORNI.length * _COLLAUDO_ORE.length; i++) celle.push('');
  for (var b = 0; b < blocchi.length; b++) {
    for (var o = blocchi[b].da; o <= blocchi[b].a; o++) {
      celle[(blocchi[b].giorno - 1) * _COLLAUDO_ORE.length + o - 1] = blocchi[b].classe;
    }
  }
  var c = {};
  for (var k in colori) c[k] = colori[k];
  var sospensioni = [], da = piu.sospensioni || _COLLAUDO_SOSPENSIONI;
  for (var s = 0; s < da.length; s++) sospensioni.push({ dal: da[s].dal, al: da[s].al, nome: da[s].nome });
  var colloqui = piu.colloqui || { settimanali: [], singoli: [], sospensioni: [] };
  return {
    periodo: 'collaudo',
    ore: _COLLAUDO_ORE.length,
    giorni: _COLLAUDO_GIORNI.slice(0),
    docenti: [{ nome: _COLLAUDO_DOCENTE, celle: celle }],
    calendario: {
      docente: _COLLAUDO_DOCENTE, nome: nome, inizio: piu.inizio || _COLLAUDO_INIZIO, fine: piu.fine || _COLLAUDO_FINE,
      minutiOra: 60, inizioOre: _COLLAUDO_ORE.slice(0), colore: '', colori: c, sospensioni: sospensioni,
      colloqui: JSON.parse(JSON.stringify(colloqui)), coloreColloqui: piu.coloreColloqui || '', validoDal: validoDal
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
 * e voce (la chiave con il colore fra le quadre). Un colloquio con le
 * famiglie (colloquio: il contrassegno dei colloqui, o senza la descrizione
 * che comincia con [Campanella] Colloqui) ha anche la descrizione e il luogo,
 * che va nella voce ("... [7] @ https://..."). Ogni lettura costa tempo, con
 * Google: solo quello che serve (la descrizione solo senza contrassegno e
 * per i colloqui, il luogo solo per loro).
 */
function _collaudoLezioni_(cal, dal, al, conSerie) {
  var eventi = cal.getEvents(_collaudoIstante_(dal), _collaudoFineGiorno_(al));
  var fuori = [];
  for (var i = 0; i < eventi.length; i++) {
    var ev = eventi[i];
    var l = { titolo: String(ev.getTitle() || ''), inizio: ev.getStartTime(), fine: ev.getEndTime(), colore: '',
              contrassegno: false, colloquio: false, nostra: false, ricorrente: false, serie: '', tag: '',
              descrizione: '', luogo: '' };
    // un colore che non e' da "1" a "11" vale come quello del calendario, come per Orari.gs
    try {
      var colore = String(ev.getColor() || '').replace(/^\s+|\s+$/g, '');
      l.colore = /^(?:[1-9]|1[01])$/.test(colore) ? colore : '';
    } catch (e) { l.colore = '?'; }
    try { l.tag = String(ev.getTag(_ORARI_TAG) || ''); } catch (e2) { l.tag = ''; }
    l.contrassegno = (l.tag === _ORARI_TAG_VALORE);
    l.colloquio = (l.tag === _ORARI_TAG_COLLOQUIO);
    l.nostra = l.contrassegno || l.colloquio;
    if (!l.nostra || l.colloquio) {
      try { l.descrizione = String(ev.getDescription() || ''); } catch (e3) { l.descrizione = ''; }
    }
    if (!l.nostra && l.descrizione.indexOf('[Campanella]') === 0) {
      l.nostra = true;
      l.colloquio = (l.descrizione.indexOf(_ORARI_INIZIO_COLLOQUI) === 0);
    }
    if (l.colloquio) {
      try { l.luogo = String(ev.getLocation() || ''); } catch (e6) { l.luogo = '?'; }
    }
    try { l.ricorrente = !!ev.isRecurringEvent(); } catch (e4) { l.ricorrente = false; }
    if (conSerie && l.ricorrente) {
      try { l.serie = String(ev.getEventSeries().getId()); } catch (e5) { l.serie = ''; }
    }
    l.chiave = _collaudoChiave_(l.titolo, l.inizio, l.fine);
    l.voce = _collaudoVoce_(l.chiave, l.colore, l.luogo);
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

/** Le lezioni di Campanella (senza i colloqui). */
function _collaudoNostre_(lette) {
  var v = [];
  for (var i = 0; i < lette.length; i++) if (lette[i].nostra && !lette[i].colloquio) v.push(lette[i]);
  return v;
}

/** I colloqui con le famiglie messi da Campanella. */
function _collaudoColloqui_(lette) {
  var v = [];
  for (var i = 0; i < lette.length; i++) if (lette[i].nostra && lette[i].colloquio) v.push(lette[i]);
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

/**
 * "2026-10-26 08:00-10:00 2B [9]": la chiave con il colore ("-" = quello del
 * calendario); con il luogo, se c'e', in fondo ("... [7] @ https://...").
 */
function _collaudoVoce_(chiave, colore, luogo) {
  return chiave + ' [' + (colore || '-') + ']' + (luogo ? ' @ ' + luogo : '');
}

/** Vero se il giorno (una Date) e' fra quelli dati ({ dal, al }), di partenza i giorni senza lezione delle parti 1 e 2. */
function _collaudoSospeso_(g, sospensioni) {
  var giorno = _collaudoGiorno_(g), s = sospensioni || _COLLAUDO_SOSPENSIONI;
  for (var i = 0; i < s.length; i++) if (s[i].dal <= giorno && giorno <= (s[i].al || s[i].dal)) return true;
  return false;
}

/** Il giorno g (una Date) piu' n giorni, a mezzanotte. */
function _collaudoPiu_(g, n) {
  return new Date(g.getFullYear(), g.getMonth(), g.getDate() + n);
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
      t.funzione === 'COLLAUDO' ? 'Esegui le parti una alla volta: COLLAUDO_1, COLLAUDO_2 e COLLAUDO_3.'
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
