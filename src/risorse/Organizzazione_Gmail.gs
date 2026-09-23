/**
 * ============================================================================
 *  ORGANIZZAZIONE GMAIL  -  riordino automatico della posta scolastica
 * ============================================================================
 *
 *  Questo codice NON va modificato a mano.
 *  Tutte le impostazioni (dominio della scuola, elenco del personale, regole,
 *  etichette) stanno nel file "Configurazione.gs", che viene generato
 *  dall'applicazione Campanella (strumento Posta) e incollato qui accanto.
 *
 *  Usa soltanto Gmail: non scrive nel Drive, non chiama servizi esterni
 *  (nessun UrlFetchApp) e le uniche email che manda sono i riepiloghi a te
 *  stesso. Non cancella mai niente.
 *
 *  COSA FA
 *    1. crea le etichette in Gmail;
 *    2. le applica alla posta gia' ricevuta, in blocchi, riprendendo da sola
 *       se il tempo massimo di esecuzione finisce;
 *    3. resta attiva e smista i messaggi nuovi ogni ora;
 *    4. (facoltativo) crea i veri filtri di Gmail, cosi' lo smistamento
 *       avviene anche senza lo script (tranne le regole che escludono le
 *       altre, come Studenti: quelle restano allo smistamento del punto 3).
 *
 *  COSA NON FA
 *    Non cancella niente. Non svuota il cestino. Non segnala come spam.
 *    Applica etichette e, se richiesto, archivia: l'archiviazione toglie dalla
 *    Posta in arrivo ma il messaggio resta in "Tutti i messaggi".
 *
 *  FUNZIONI DA ESEGUIRE, NELL'ORDINE
 *  (menu a tendina in alto nell'editor, accanto al pulsante "Esegui")
 *
 *    PASSO_1_anteprima ............. prova a vuoto: dice cosa farebbe
 *    PASSO_2_creaEtichette ......... crea solo le etichette (in prova le elenca)
 *    PASSO_3_riordinaPostaEsistente  applica le etichette alla posta vecchia
 *    PASSO_4_attivaAutomazione ..... smista da solo i messaggi nuovi
 *
 *    EXTRA_elencaIndirizziScuola ... estrae dalla casella gli indirizzi del
 *                                    dominio della scuola, per compilare
 *                                    l'elenco del personale nell'applicazione
 *    EXTRA_creaFiltriGmail ......... crea i filtri veri di Gmail (facoltativo)
 *    EXTRA_codiceStato ............. stampa il codice da incollare in
 *                                    Campanella (Impostazioni): dice se il
 *                                    riordino e' fatto
 *
 *    ANNULLA_automazione ........... spegne lo smistamento automatico
 *    ANNULLA_etichettatura ......... toglie dalle mail le etichette applicate
 *                                    (senza gruppo, solo quelle nate qui)
 *    ANNULLA_progressoRiordino ..... azzera il segnaposto del PASSO 3
 *
 *  Le funzioni che finiscono con "_" sono interne: Apps Script non le mostra
 *  nel menu a tendina, cosi' non si lanciano per sbaglio.
 *
 *  VERSIONE: la stampano PASSO_1_anteprima ed EXTRA_codiceStato. Se in
 *  Campanella la versione e' piu' nuova, reincolla questo file.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Limiti e costanti interne
// ---------------------------------------------------------------------------
var _POSTA_VERSIONE         = '1.4.6'; // versione di questo file (vedi l'intestazione)
var _MAX_SECONDI_ESECUZIONE = 260;   // ~4 min 20 s: sotto il limite di Google
var _THREAD_PER_BLOCCO      = 100;   // massimo consentito da addToThreads()
var _INDIRIZZI_PER_QUERY    = 20;    // spezza le ricerche troppo lunghe
var _THREAD_INDIRIZZI       = 4000;  // tetto di EXTRA_elencaIndirizziScuola
var _RIGHE_PER_SCRITTA      = 40;    // il registro taglia le scritte lunghe
var _CHIAVE_PROGRESSO       = 'ORGGMAIL_PROGRESSO';
var _CHIAVE_CREATE          = 'ORGGMAIL_ETICHETTE_CREATE';  // le etichette nate qui
var _TRIGGER_RIPRESA        = 'PASSO_3_riordinaPostaEsistente';
var _TRIGGER_ORARIO         = 'smistaNuoviMessaggi';
var _TRIGGER_ORARI          = 'ORARI_2_invia';  // la ripresa di Orari.gs, nello stesso progetto


// ===========================================================================
//  PASSO 1 - ANTEPRIMA (non modifica niente)
// ===========================================================================
function PASSO_1_anteprima() {
  var cfg = _config_();
  var righe = [];
  righe.push('ANTEPRIMA - nessun messaggio verra\' modificato.');
  righe.push('Versione dello script: ' + _POSTA_VERSIONE);
  righe.push('Account: ' + _mioIndirizzo_());
  righe.push('Dominio scuola: ' + (cfg.dominioScuola || '(non impostato)'));
  righe.push('Persone in elenco: ' + ((cfg.personale || []).length));
  righe.push('Periodo: ' + _descrizionePeriodo_(cfg));
  righe.push('');

  var totale = 0;
  var regole = _regoleAttive_(cfg);
  for (var i = 0; i < regole.length; i++) {
    var n = 0;
    var queries = _queryDellaRegola_(cfg, regole[i]);
    for (var q = 0; q < queries.length; q++) {
      // il conteggio si ferma a 500 per ricerca: serve solo a dare un'idea
      n += GmailApp.search(queries[q], 0, 500).length;
    }
    totale += n;
    righe.push('  ' + _pad_(_etichettaCompleta_(cfg, regole[i]), 34) + _contaTesto_(n) +
               (regole[i].archivia ? '   (poi archivia)' : ''));
  }
  righe.push('');
  righe.push('Totale conversazioni interessate (stima): ' + totale);
  righe.push('');
  righe.push('Nota: i numeri sono una stima per eccesso. Le regole che escludono');
  righe.push('altre etichette (per esempio Studenti, che esclude Colleghi) qui');
  righe.push('contano di piu\' del reale, perche\' le etichette non esistono ancora.');
  righe.push('');
  if (cfg.provaSenzaModifiche) {
    // in prova PASSO_2 elenca soltanto: le etichette le crea il riordino vero
    righe.push('Se il risultato ti convince: in Configurazione.gs metti');
    righe.push('  provaSenzaModifiche: false');
    righe.push('ed esegui PASSO_3_riordinaPostaEsistente, che crea anche le etichette.');
  } else {
    righe.push('Se il risultato ti convince: esegui PASSO_2_creaEtichette');
    righe.push('e poi PASSO_3_riordinaPostaEsistente.');
  }

  var testo = righe.join('\n');
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  PASSO 2 - CREA LE ETICHETTE
// ===========================================================================
function PASSO_2_creaEtichette() {
  var cfg = _config_();
  var regole = _regoleAttive_(cfg);
  // in prova non si crea niente, nemmeno le etichette: le elenca e basta
  var prova = !!cfg.provaSenzaModifiche;
  var create = [];
  var esistenti = [];
  if (!prova) _potaCreate_();

  for (var i = 0; i < regole.length; i++) {
    // le etichette annidate vanno create anche nei livelli superiori
    var parti = _etichettaCompleta_(cfg, regole[i]).split('/');
    var progressivo = '';
    for (var p = 0; p < parti.length; p++) {
      progressivo = (p === 0) ? parti[0] : progressivo + '/' + parti[p];
      if (GmailApp.getUserLabelByName(progressivo)) {
        if (esistenti.indexOf(progressivo) < 0) esistenti.push(progressivo);
      } else if (create.indexOf(progressivo) < 0) {
        if (!prova) _creaEtichetta_(progressivo);
        create.push(progressivo);
      }
    }
  }

  var testo = (prova
                ? 'MODALITA\' PROVA: non creo niente. Queste etichette nasceranno quando in ' +
                  'Configurazione.gs metti  provaSenzaModifiche: false  (le crea da solo anche ' +
                  'PASSO_3_riordinaPostaEsistente).\n\nEtichette da creare: '
                : 'Etichette create adesso: ') + create.length +
              (create.length ? '\n  - ' + create.join('\n  - ') : '') +
              '\n\nEtichette gia\' presenti: ' + esistenti.length +
              (esistenti.length ? '\n  - ' + esistenti.join('\n  - ') : '');
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  PASSO 3 - RIORDINA LA POSTA GIA' RICEVUTA
//  Lavora a blocchi e, se finisce il tempo, riprende da sola dopo un minuto.
// ===========================================================================
function PASSO_3_riordinaPostaEsistente(e) {
  // Chiamata dalla ripresa automatica, ma non c'e' niente da riprendere: il
  // riordino e' finito, o ANNULLA_etichettatura l'ha fermato. Ripartire da zero
  // rimetterebbe tutte le etichette appena tolte.
  var daRipresa = !!(e && e.triggerUid);
  if (daRipresa && !_leggiProgresso_().iniziato) { _rimuoviTrigger_(_TRIGGER_RIPRESA); return ''; }

  // un blocco per volta: se la ripresa automatica parte mentre un'altra
  // esecuzione e' ancora in corso, la seconda aspetta o lascia perdere
  var lock = LockService.getUserLock();
  if (!lock.tryLock(10000)) {
    // riprogrammo solo se c'e' un riordino a meta': se il blocco e' di
    // ANNULLA_etichettatura, il segnaposto l'ha appena azzerato
    var aMeta = !!_leggiProgresso_().iniziato;
    if (aMeta) _programmaRipresa_();
    var occupato = 'Un\'altra esecuzione e\' in corso: ' +
      (aMeta ? 'riprovo fra un minuto.' : 'riprova tu fra qualche minuto.');
    Logger.log(occupato);
    return occupato;
  }
  try {
    if (daRipresa && !_leggiProgresso_().iniziato) { _rimuoviTrigger_(_TRIGGER_RIPRESA); return ''; }
    return _riordina_();
  }
  finally { lock.releaseLock(); }
}

function _riordina_() {
  var scadenza = Date.now() + _MAX_SECONDI_ESECUZIONE * 1000;
  var cfg = _config_();
  var regole = _regoleAttive_(cfg);
  var stato = _leggiProgresso_();
  var prova = !!cfg.provaSenzaModifiche;

  if (!stato.iniziato) {
    stato.iniziato = new Date().toISOString();
    stato.fatti = {};
    // in prova non si crea niente, nemmeno le etichette: "non modifica
    // niente" deve valere alla lettera
    if (!prova) PASSO_2_creaEtichette();
  }

  var interrotto = false;

  while (stato.indice < regole.length && !interrotto) {
    var regola = regole[stato.indice];
    var nomeEtichetta = _etichettaCompleta_(cfg, regola);
    var etichetta = prova ? null
      : (GmailApp.getUserLabelByName(nomeEtichetta) || _creaEtichetta_(nomeEtichetta));
    var queries = _queryDellaRegola_(cfg, regola);

    while (stato.query < queries.length) {
      var query = queries[stato.query];
      var guardia = '';               // prima conversazione del giro precedente

      while (true) {
        if (Date.now() > scadenza) { interrotto = true; break; }

        if (prova) {
          // in prova non applico nulla, quindi la stessa ricerca tornerebbe
          // sempre uguale: conto a pagine (fino a un tetto) e passo oltre
          _somma_(stato.fatti, nomeEtichetta, _contaConversazioni_(query, 2000));
          break;
        }

        var threads;
        try {
          threads = GmailApp.search(query, 0, _THREAD_PER_BLOCCO);
        } catch (errore) {
          // una ricerca scritta male (di solito la "ricerca avanzata" di una
          // regola) non deve bloccare tutte le altre: la salto e lo dico
          Logger.log('Regola "' + nomeEtichetta + '": ricerca non accettata da Gmail (' +
                     errore.message + '). Regola saltata: ' + query);
          _somma_(stato.fatti, nomeEtichetta + ' (ricerca rifiutata)', 0);
          break;
        }
        if (!threads.length) break;

        var primo = threads[0].getId();
        if (primo === guardia) {
          // stessa conversazione due giri di fila: l'indice di Gmail non si e'
          // ancora aggiornato. Mi fermo per non girare a vuoto.
          Logger.log('Regola "' + nomeEtichetta + '": indice di Gmail in ritardo, ' +
                     'riprendo alla prossima esecuzione.');
          interrotto = true;
          break;
        }
        guardia = primo;

        etichetta.addToThreads(threads);
        if (regola.archivia)       GmailApp.moveThreadsToArchive(threads);
        if (regola.segnaComeLette) GmailApp.markThreadsRead(threads);
        _somma_(stato.fatti, nomeEtichetta, threads.length);
        Utilities.sleep(300);         // gentile con le quote di Gmail
      }

      if (interrotto) break;
      stato.query++;
    }

    if (interrotto) break;
    stato.indice++;
    stato.query = 0;
  }

  if (interrotto) {
    _salvaProgresso_(stato);
    _programmaRipresa_();
    var parziale = 'Tempo massimo di esecuzione raggiunto.\n' +
                   'Il riordino riprende da solo tra circa un minuto: ' +
                   'puoi anche chiudere la pagina.\n\nFatto finora:\n' +
                   _riepilogo_(stato.fatti);
    Logger.log(parziale);
    return parziale;
  }

  _rimuoviTrigger_(_TRIGGER_RIPRESA);
  var riepilogo = (cfg.provaSenzaModifiche
        ? 'PROVA COMPLETATA - nessuna modifica applicata.\n' +
          'Per applicare davvero: in Configurazione.gs metti\n' +
          '  provaSenzaModifiche: false\n\n'
        : 'RIORDINO COMPLETATO.\n\n') + _riepilogo_(stato.fatti);
  _azzeraProgresso_();
  Logger.log(riepilogo);
  if (cfg.inviaReport && !cfg.provaSenzaModifiche) {
    _inviaReport_('Riordino completato', riepilogo);
  }
  return riepilogo;
}


// ===========================================================================
//  PASSO 4 - SMISTAMENTO AUTOMATICO DEI MESSAGGI NUOVI
// ===========================================================================
function PASSO_4_attivaAutomazione() {
  var cfg = _config_();
  var ore = Math.max(1, cfg.ogniQuanteOre || 1);
  _rimuoviTrigger_(_TRIGGER_ORARIO);
  ScriptApp.newTrigger(_TRIGGER_ORARIO).timeBased().everyHours(ore).create();

  var testo = 'Smistamento automatico attivo: ogni ' + ore + ' ora/e i messaggi ' +
              'nuovi vengono etichettati da soli.\n\n' +
              (cfg.provaSenzaModifiche
                ? 'ATTENZIONE: sei ancora in modalita\' prova, quindi ' +
                  'l\'automazione non modifichera\' nulla.\n' +
                  'In Configurazione.gs metti  provaSenzaModifiche: false\n\n'
                : '') +
              'Per spegnerlo esegui ANNULLA_automazione.';
  Logger.log(testo);
  return testo;
}

/** Bersaglio del trigger orario: guarda solo la posta recente. */
function smistaNuoviMessaggi() {
  var cfg = _config_();
  if (cfg.provaSenzaModifiche) return;      // in prova non tocca nulla

  // se il riordino grosso (PASSO 3) sta ancora girando, questo giro salta:
  // la posta nuova la prende il prossimo, fra un'ora
  var lock = LockService.getUserLock();
  if (!lock.tryLock(0)) return;
  try {
    var scadenza = Date.now() + _MAX_SECONDI_ESECUZIONE * 1000;
    var regole = _regoleAttive_(cfg);
    var giorni = Math.max(1, cfg.giorniPostaNuova || 3);
    var fatti = {};

    for (var i = 0; i < regole.length && Date.now() < scadenza; i++) {
      var regola = regole[i];
      var nome = _etichettaCompleta_(cfg, regola);
      var etichetta = GmailApp.getUserLabelByName(nome) || _creaEtichetta_(nome);
      var queries = _queryDellaRegola_(cfg, regola, 'newer_than:' + giorni + 'd');

      for (var q = 0; q < queries.length && Date.now() < scadenza; q++) {
        var threads;
        try { threads = GmailApp.search(queries[q], 0, _THREAD_PER_BLOCCO); }
        catch (errore) {
          Logger.log('Regola "' + nome + '": ricerca non accettata da Gmail, saltata.');
          continue;
        }
        if (!threads.length) continue;
        etichetta.addToThreads(threads);
        if (regola.archivia)       GmailApp.moveThreadsToArchive(threads);
        if (regola.segnaComeLette) GmailApp.markThreadsRead(threads);
        _somma_(fatti, nome, threads.length);
      }
    }
    if (_totale_(fatti) > 0) Logger.log('Smistamento automatico:\n' + _riepilogo_(fatti));
  } finally {
    lock.releaseLock();
  }
}

/** Conta le conversazioni di una ricerca a pagine, fino a un tetto. */
function _contaConversazioni_(query, tetto) {
  var n = 0;
  while (n < tetto) {
    var pagina = GmailApp.search(query, n, Math.min(_THREAD_PER_BLOCCO, tetto - n));
    n += pagina.length;
    if (pagina.length < _THREAD_PER_BLOCCO) break;
  }
  return n;
}


// ===========================================================================
//  EXTRA - ELENCO DEGLI INDIRIZZI DEL DOMINIO DELLA SCUOLA
//  Legge i mittenti gia' presenti nella casella: gli indirizzi cosi' ottenuti
//  sono quelli veri, senza doverli indovinare da nome e cognome.
// ===========================================================================
function EXTRA_elencaIndirizziScuola() {
  var cfg = _config_();
  var dominio = String(cfg.dominioScuola || '').replace(/^@/, '').toLowerCase();
  if (!dominio) throw new Error('In Configurazione.gs manca "dominioScuola".');

  var scadenza = Date.now() + _MAX_SECONDI_ESECUZIONE * 1000;
  var anni  = Math.max(1, cfg.anniDaEsaminare || 3);
  var query = '(from:@' + dominio + ' OR to:@' + dominio + ') newer_than:' +
              anni + 'y -in:chats';

  var trovati = {};        // indirizzo -> { nome: '', n: 0 }
  var start = 0;
  while (Date.now() < scadenza && start < _THREAD_INDIRIZZI) {
    var threads = GmailApp.search(query, start, 50);
    if (!threads.length) break;
    var perThread = GmailApp.getMessagesForThreads(threads);
    for (var t = 0; t < perThread.length; t++) {
      for (var m = 0; m < perThread[t].length; m++) {
        var msg = perThread[t][m];
        _raccogliIndirizzi_(msg.getFrom(), dominio, trovati);
        _raccogliIndirizzi_(msg.getTo(),   dominio, trovati);
        _raccogliIndirizzi_(msg.getCc(),   dominio, trovati);
      }
    }
    start += 50;
  }

  delete trovati[_mioIndirizzo_().toLowerCase()];   // io non sono un mio collega

  var elenco = [];
  for (var indirizzo in trovati) {
    elenco.push({ ind: indirizzo, nome: trovati[indirizzo].nome, n: trovati[indirizzo].n });
  }
  elenco.sort(function (a, b) { return b.n - a.n; });

  var righe = [];
  for (var i = 0; i < elenco.length; i++) {
    righe.push(elenco[i].ind + '\t' + elenco[i].nome + '\t' + elenco[i].n);
  }
  var tsv = righe.join('\n');

  var dove = '';
  if (Date.now() >= scadenza)
    dove = ' Mi sono fermato qui per non sforare il tempo massimo di Google: ' +
           'rieseguimi e guardo le stesse, oppure abbassa "anniDaEsaminare" in ' +
           'Configurazione.gs per arrivare piu\' indietro nel tempo.';
  else if (start >= _THREAD_INDIRIZZI)
    dove = ' Mi sono fermato al tetto di ' + _THREAD_INDIRIZZI + ' conversazioni.';

  // L'elenco (nomi e indirizzi di altre persone) va solo nell'email a te
  // stesso. Il registro delle esecuzioni lo conserva Google per un po': li'
  // finisce soltanto se l'email non parte, e a blocchi, perche' il registro
  // taglia le scritte lunghe ("Logging output too large"). In cima, sempre,
  // il sommario, che e' la parte che serve.
  var inviata = _inviaReport_('Indirizzi @' + dominio + ' trovati nella tua casella',
    'Trovati ' + elenco.length + ' indirizzi, esaminando ' + start + ' conversazioni.' +
    dove + '\n\n' +
    'Copia tutto il blocco qui sotto e incollalo in Campanella, strumento Posta,\n' +
    'passo 3 (Il personale), pulsante "Incolla elenco".\n\n' +
    'INDIRIZZO\tNOME\tN. MESSAGGI\n' + tsv);

  Logger.log('Trovati ' + elenco.length + ' indirizzi @' + dominio +
             ' (esaminate ' + start + ' conversazioni).' + dove);
  if (inviata) {
    Logger.log('L\'ELENCO COMPLETO E\' NELL\'EMAIL CHE TI SEI APPENA MANDATO: cercala in ' +
               'Gmail con oggetto "[Organizzazione Gmail] Indirizzi @' + dominio + '". ' +
               'Aprila, copia il blocco e incollalo in Campanella, strumento Posta, ' +
               'passo 3 (Il personale), pulsante "Incolla elenco". ' +
               'Qui nel registro l\'elenco non lo scrivo.');
  } else {
    Logger.log('L\'EMAIL NON E\' PARTITA, QUINDI L\'ELENCO E\' QUI SOTTO, a blocchi: copialo e ' +
               'incollalo in Campanella, strumento Posta, passo 3 (Il personale), pulsante ' +
               '"Incolla elenco".');
    for (var b = 0; b < righe.length; b += _RIGHE_PER_SCRITTA) {
      Logger.log('Indirizzi ' + (b + 1) + '-' + Math.min(b + _RIGHE_PER_SCRITTA, righe.length) +
                 ' di ' + righe.length + '\n' + righe.slice(b, b + _RIGHE_PER_SCRITTA).join('\n'));
    }
  }
  return tsv;
}


// ===========================================================================
//  EXTRA - FILTRI VERI DI GMAIL (facoltativo)
//  Richiede: editor -> Servizi (+) -> "Gmail API" -> Aggiungi.
// ===========================================================================
function EXTRA_creaFiltriGmail() {
  if (typeof Gmail === 'undefined') {
    throw new Error('Servizio "Gmail API" non attivo.\n' +
      'Nell\'editor, colonna di sinistra: Servizi -> "+" -> scegli "Gmail API" ' +
      '-> Aggiungi. Poi riesegui questa funzione.');
  }
  var cfg = _config_();
  if (cfg.provaSenzaModifiche) {
    // i filtri cambiano la posta che arriva: in prova non si crea niente
    var inProva = 'MODALITA\' PROVA: i filtri di Gmail non vengono creati, come le etichette.\n' +
      'Quando il riordino ti convince, in Configurazione.gs metti  provaSenzaModifiche: false,\n' +
      'esegui PASSO_3_riordinaPostaEsistente e poi di nuovo questa funzione.';
    Logger.log(inProva);
    return inProva;
  }
  PASSO_2_creaEtichette();

  var idEtichette = {};
  var lista = Gmail.Users.Labels.list('me').labels || [];
  for (var i = 0; i < lista.length; i++) idEtichette[lista[i].name] = lista[i].id;

  var esistenti = Gmail.Users.Settings.Filters.list('me').filter || [];
  var creati = [], saltati = [], falliti = [], alloScript = [], vecchi = [];
  var regole = _regoleAttive_(cfg);

  for (var r = 0; r < regole.length; r++) {
    var regola = regole[r];
    var nome = _etichettaCompleta_(cfg, regola);
    var id = idEtichette[nome];
    if (!id) continue;
    // Un filtro di Gmail lavora sul messaggio che arriva e non puo' sapere
    // quali etichette gli metteranno gli altri filtri: "Studenti, tranne chi e'
    // gia' Colleghi" diventerebbe "tutto il dominio", colleghi compresi. Queste
    // regole restano allo smistamento automatico dello script.
    if (regola.escludiEtichette && regola.escludiEtichette.length) {
      alloScript.push(nome);
      // chi aveva creato i filtri con una versione di prima ce l'ha gia', quel
      // filtro "tutto il dominio": lo cerco e lo segnalo. Solo quello: un filtro
      // tuo su qualche indirizzo per la stessa etichetta non c'entra
      var dominio = '@' + String(cfg.dominioScuola || '').replace(/^@/, '').toLowerCase();
      for (var v = 0; v < esistenti.length; v++) {
        var az = esistenti[v].action || {};
        if (!az.addLabelIds || az.addLabelIds.indexOf(id) < 0) continue;
        var cr = esistenti[v].criteria || {};
        var termini = String(cr.from || '').toLowerCase().split(/\s+or\s+|[\s(){}]+/);
        if (dominio.length > 1 && termini.indexOf(dominio) >= 0) {
          vecchi.push(nome + '  (da: ' + cr.from + ')');
        }
      }
      continue;
    }

    var criteri = _criteriFiltro_(cfg, regola);
    for (var c = 0; c < criteri.length; c++) {
      if (_filtroGiaPresente_(esistenti, criteri[c], id)) { saltati.push(nome); continue; }
      var azione = { addLabelIds: [id] };
      var togli = [];
      if (regola.archivia)       togli.push('INBOX');
      if (regola.segnaComeLette) togli.push('UNREAD');
      if (togli.length) azione.removeLabelIds = togli;
      try {
        Gmail.Users.Settings.Filters.create({ criteria: criteri[c], action: azione }, 'me');
        creati.push(nome);
      } catch (e) {
        falliti.push(nome + ': ' + e.message);
      }
    }
  }

  // le regole che Gmail non smistera' da solo: quelle lasciate allo script e
  // quelle il cui filtro non si e' riusciti a creare
  var tranne = alloScript.slice();
  for (var f = 0; f < falliti.length; f++) {
    var chi = falliti[f].split(': ')[0];
    if (tranne.indexOf(chi) < 0) tranne.push(chi);
  }
  var testo = (vecchi.length
                ? 'ATTENZIONE: c\'e\' ancora un filtro di una versione di prima che mette questa ' +
                  'etichetta a tutto il dominio, colleghi compresi:\n  - ' + vecchi.join('\n  - ') +
                  '\nCancellalo in Gmail -> Impostazioni -> Vedi tutte le impostazioni -> Filtri e ' +
                  'indirizzi bloccati.\n\n'
                : '') +
              'Filtri creati: ' + creati.length +
              '\nFiltri gia\' presenti (saltati): ' + saltati.length +
              (falliti.length ? '\nNon riusciti:\n  - ' + falliti.join('\n  - ') : '') +
              (alloScript.length
                ? '\nSenza filtro, restano allo smistamento dello script: ' + alloScript.join(', ') +
                  '\n  (escludono le etichette delle altre regole, e un filtro di Gmail non lo sa fare:' +
                  '\n  li prenderebbe tutti, colleghi compresi)'
                : '') +
              (tranne.length
                ? '\n\nDa adesso Gmail smista da solo la posta in arrivo, tranne ' + tranne.join(', ') +
                  (tranne.length === 1 ? ': per questa' : ': per queste') +
                  ' lo smistamento automatico (PASSO_4) deve restare acceso.'
                : '\n\nDa adesso Gmail smista da solo la posta in arrivo, anche senza lo script.') +
              '\nLi trovi in Gmail: Impostazioni -> Vedi tutte le impostazioni -> Filtri e ' +
              'indirizzi bloccati.' +
              '\nSe poi cambi una regola, il filtro vecchio resta: cancellalo da li\' e riesegui ' +
              'questa funzione.';
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  EXTRA - CODICE DI STATO PER L'APPLICAZIONE
//  Stampa una riga sola da incollare in Campanella, Impostazioni.
//  Non contiene indirizzi ne' testi: solo tre numeri e una data.
// ===========================================================================
function EXTRA_codiceStato() {
  var cfg = _config_();
  var prefisso = String(cfg.prefissoEtichette || '').replace(/\/+$/, '');
  var etichette = GmailApp.getUserLabels();
  var nostre = 0, conversazioni = 0;
  // senza gruppo non si contano tutte le etichette dell'utente, ma solo quelle
  // di cui lo strumento risponde
  var gestite = prefisso ? null : _etichetteGestite_(cfg);

  for (var i = 0; i < etichette.length; i++) {
    var nome = etichette[i].getName();
    if (prefisso ? nome.indexOf(prefisso + '/') !== 0 : gestite.indexOf(nome) < 0) continue;
    nostre++;
    try { conversazioni += GmailApp.search('label:' + _virgolette_(nome), 0, 500).length; }
    catch (e) { }
  }

  var automazione = 0;
  var trigger = ScriptApp.getProjectTriggers();
  for (var t = 0; t < trigger.length; t++)
    if (trigger[t].getHandlerFunction() === _TRIGGER_ORARIO) automazione = 1;

  var oggi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var codice = 'CMP1-' + oggi + '-' + nostre + '-' + automazione + '-' + conversazioni;

  var testo = 'Versione dello script: ' + _POSTA_VERSIONE +
              '\nEtichette dello strumento: ' + nostre +
              '\nConversazioni etichettate: ' + conversazioni +
              (conversazioni >= 500 ? ' o piu\'' : '') +
              '\nSmistamento automatico: ' + (automazione ? 'attivo' : 'spento') +
              '\n\nCODICE DA INCOLLARE NELL\'APPLICAZIONE (Impostazioni):\n\n    ' +
              codice;
  Logger.log(testo);
  return codice;
}


// ===========================================================================
//  ANNULLA
// ===========================================================================
function ANNULLA_automazione() {
  _rimuoviTrigger_(_TRIGGER_ORARIO);
  _rimuoviTrigger_(_TRIGGER_RIPRESA);
  // Orari.gs sta nello stesso progetto e anche la sua ripresa e' un'attivita'
  // programmata: spegnere l'automazione vuol dire spegnere tutto
  var orari = _rimuoviTrigger_(_TRIGGER_ORARI);
  var testo = 'Automazione spenta. Le etichette gia\' applicate restano dove sono.' +
              (orari ? '\nFermata anche la ripresa dell\'invio degli orari: se serve, riesegui ' +
                       'ORARI_2_invia, che riparte da dove era arrivato.' : '');
  Logger.log(testo);
  return testo;
}

/** Toglie dalle conversazioni le etichette applicate da questo strumento. */
function ANNULLA_etichettatura() {
  var cfg = _config_();
  var scadenza = Date.now() + _MAX_SECONDI_ESECUZIONE * 1000;

  // Prima fermo il riordino: se PASSO_3 sta ancora riprendendo da solo, fra un
  // giro e l'altro rimetterebbe le etichette che tolgo, e il segnaposto lo
  // farebbe ripartire da meta', saltando le regole gia' fatte.
  var lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) {
    var occupato = 'Il riordino (PASSO_3) sta lavorando proprio adesso: riprova fra un minuto.';
    Logger.log(occupato);
    return occupato;
  }
  var regole, tolte = {}, finito = true;
  // Senza gruppo un'etichetta con il nome di una regola puo' essere tua, e
  // lo script non sa distinguere i messaggi etichettati da te da quelli
  // etichettati da lui: svuota soltanto le etichette che ha creato lui.
  var prefisso = String(cfg.prefissoEtichette || '').replace(/\/+$/, '');
  var create = prefisso ? null : _etichetteCreate_();
  var nonSue = [];
  try {
    _rimuoviTrigger_(_TRIGGER_RIPRESA);
    _azzeraProgresso_();
    regole = _regoleAttive_(cfg);

    for (var i = 0; i < regole.length; i++) {
      if (Date.now() >= scadenza) { finito = false; break; }
      var nome = _etichettaCompleta_(cfg, regole[i]);
      var etichetta = GmailApp.getUserLabelByName(nome);
      if (!etichetta) continue;
      if (create && create.indexOf(nome) < 0) {
        if (etichetta.getThreads(0, 1).length && nonSue.indexOf(nome) < 0) nonSue.push(nome);
        continue;
      }
      while (true) {
        if (Date.now() >= scadenza) { finito = false; break; }
        var threads = etichetta.getThreads(0, _THREAD_PER_BLOCCO);
        if (!threads.length) break;
        etichetta.removeFromThreads(threads);
        _somma_(tolte, nome, threads.length);
      }
      if (!finito) break;
    }
  } finally {
    // una ripresa partita mentre lavoravo si sarebbe riprogrammata: la tolgo
    _rimuoviTrigger_(_TRIGGER_RIPRESA);
    lock.releaseLock();
  }

  // le regole spente non le tocco: l'etichetta con quel nome potrebbe essere
  // tua. Ma se hanno ancora conversazioni lo dico.
  var spente = [];
  var tutte = cfg.regole || [];
  for (var s = 0; s < tutte.length; s++) {
    if (tutte[s].attiva !== false || !tutte[s].etichetta) continue;
    var nomeSpenta = _etichettaCompleta_(cfg, tutte[s]);
    var e = GmailApp.getUserLabelByName(nomeSpenta);
    if (e && e.getThreads(0, 1).length) spente.push(nomeSpenta);
  }

  // con tanta posta il tempo di Google finisce prima: va detto, altrimenti
  // sembra tutto a posto e le etichette rimaste non le toglie piu' nessuno
  var testo = (finito
      ? 'FATTO: tolte ' + (create ? 'le etichette create dallo script' : 'tutte le etichette delle regole attive') +
        '.\n\n'
      : 'TEMPO SCADUTO A META\'. Esegui di nuovo ANNULLA_etichettatura, e ancora, ' +
        'finche\' non compare "FATTO" in cima.\n\n') +
    'Etichette tolte dalle conversazioni in questo giro:\n' + _riepilogo_(tolte) +
    (finito
      ? '\n\nLe etichette tolte restano nell\'elenco di Gmail, ma vuote: se vuoi puoi ' +
        'cancellarle da Gmail -> Impostazioni -> Etichette.'
      : '') +
    (nonSue.length
      ? '\n\nNon toccate, perche\' non le ha create lo script: ' + nonSue.join(', ') + '.\n' +
        'C\'erano gia\' (le avevi fatte tu), oppure le ha create una versione di prima dello ' +
        'script, che non se lo segnava. Lo script non sa distinguere i messaggi etichettati ' +
        'da te da quelli etichettati da lui, quindi non toglie niente. Se erano solo dello ' +
        'script, cancellale da Gmail -> Impostazioni -> Etichette: i messaggi restano.'
      : '') +
    (spente.length
      ? '\n\nEtichette di regole spente, non toccate: ' + spente.join(', ') + '.\n' +
        'Se le aveva messe lo script, riaccendi la regola, rigenera la configurazione ' +
        'e riesegui; oppure cancellale tu da Gmail -> Impostazioni -> Etichette.'
      : '') +
    '\n\nIl riordino e\' fermo e ripartira\' dall\'inizio. ' +
    'Nota: i messaggi archiviati non tornano nella Posta in arrivo, ' +
    'ma li trovi in "Tutti i messaggi".';
  Logger.log(testo);
  return testo;
}

function ANNULLA_progressoRiordino() {
  // come ANNULLA_etichettatura: aspetto che un blocco in corso finisca, se no
  // quello risalverebbe il segnaposto subito dopo
  var lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) {
    // senza il blocco non tocco niente: il riordino in corso rimetterebbe
    // segnaposto e ripresa subito dopo, e il messaggio qui sotto mentirebbe
    var occupato = 'Il riordino (PASSO_3) sta lavorando proprio adesso: riprova fra un minuto.';
    Logger.log(occupato);
    return occupato;
  }
  try {
    _rimuoviTrigger_(_TRIGGER_RIPRESA);
    _azzeraProgresso_();
  } finally {
    lock.releaseLock();
  }
  var testo = 'Segnaposto azzerato: il prossimo PASSO_3 ricomincia dall\'inizio.';
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  COSTRUZIONE DELLE RICERCHE
// ===========================================================================

/**
 * Regole attive, nell'ordine scritto in Configurazione.gs. Le etichette si
 * sommano: l'ordine conta solo per chi ha escludiEtichette (Studenti sotto
 * Colleghi, Dirigenza e Segreteria).
 */
function _regoleAttive_(cfg) {
  var out = [];
  var regole = cfg.regole || [];
  for (var i = 0; i < regole.length; i++) {
    if (regole[i] && regole[i].attiva !== false) out.push(regole[i]);
  }
  return out;
}

function _etichettaCompleta_(cfg, regola) {
  var prefisso = String(cfg.prefissoEtichette || '').replace(/\/+$/, '');
  return prefisso ? prefisso + '/' + regola.etichetta : regola.etichetta;
}

/**
 * Traduce una regola in una o piu' ricerche di Gmail.
 * Gli elenchi lunghi di indirizzi vengono spezzati in gruppi da
 * _INDIRIZZI_PER_QUERY: una singola ricerca troppo lunga verrebbe rifiutata.
 */
function _queryDellaRegola_(cfg, regola, periodoExtra) {
  var comune = [];
  // destinatari previsti ma nessuno dopo l'espansione: come per i mittenti
  // (qui sotto), niente ricerca. "to:()" non vuol dire niente.
  var destinatari = _espandi_(cfg, regola.a || []);
  if (!destinatari.length && regola.a && regola.a.length) return [];

  if (regola.oggetto  && regola.oggetto.length)  comune.push('subject:(' + _orDiTesti_(regola.oggetto) + ')');
  if (regola.contiene && regola.contiene.length) comune.push('(' + _orDiTesti_(regola.contiene) + ')');
  if (destinatari.length)                        comune.push('to:(' + destinatari.join(' OR ') + ')');
  if (regola.haAllegato)                         comune.push('has:attachment');
  if (regola.queryLibera)                        comune.push('(' + regola.queryLibera + ')');

  // non riprocessare cio' che ha gia' l'etichetta
  comune.push('-label:' + _virgolette_(_etichettaCompleta_(cfg, regola)));

  // etichette da escludere: e' cosi' che "Studenti" evita chi e' gia' "Colleghi"
  var escludi = regola.escludiEtichette || [];
  for (var e = 0; e < escludi.length; e++) {
    var pieno = cfg.prefissoEtichette
      ? String(cfg.prefissoEtichette).replace(/\/+$/, '') + '/' + escludi[e]
      : escludi[e];
    comune.push('-label:' + _virgolette_(pieno));
  }

  comune.push('-in:chats');
  if (cfg.escludiPostaInviata !== false) comune.push('-in:sent');
  if (cfg.escludiGiaArchiviati)          comune.push('in:inbox');

  if (periodoExtra) comune.push(periodoExtra);
  else if (cfg.soloUltimiMesi > 0) comune.push('newer_than:' + cfg.soloUltimiMesi + 'm');

  var base = comune.join(' ');

  // i mittenti sono l'unica parte che puo' diventare lunghissima
  var mittenti = _espandi_(cfg, regola.da || []);
  // Una regola che ha dei mittenti, ma nessuno dopo l'espansione (Colleghi con
  // l'elenco del personale vuoto), non deve diventare una ricerca senza "from:":
  // prenderebbe tutta la casella. Non cerca niente, e basta.
  if (!mittenti.length) return (regola.da && regola.da.length) ? [] : [base];

  var queries = [];
  for (var i = 0; i < mittenti.length; i += _INDIRIZZI_PER_QUERY) {
    queries.push('from:(' + mittenti.slice(i, i + _INDIRIZZI_PER_QUERY).join(' OR ') + ') ' + base);
  }
  return queries;
}

/**
 * Sostituisce i segnaposto con i valori veri:
 *   @PERSONALE@        tutto l'elenco del personale
 *   @DOMINIO@          il dominio della scuola
 *   @GRUPPO:Docenti@   solo quel gruppo di CONFIG.gruppi
 */
function _espandi_(cfg, elenco) {
  var out = [];
  for (var i = 0; i < elenco.length; i++) {
    var v = String(elenco[i] || '').trim();
    if (!v) continue;
    if (v.indexOf('@GRUPPO:') === 0 && v.charAt(v.length - 1) === '@') {
      var nome = v.substring(8, v.length - 1);
      var gruppo = (cfg.gruppi || {})[nome] || [];
      for (var g = 0; g < gruppo.length; g++) {
        var uno = String(gruppo[g] || '').trim();
        if (uno) out.push(uno);
      }
    } else if (v === '@PERSONALE@') {
      var p = cfg.personale || [];
      for (var k = 0; k < p.length; k++) {
        var indirizzo = String(p[k] || '').trim();
        if (indirizzo) out.push(indirizzo);
      }
    } else if (v === '@DOMINIO@') {
      if (cfg.dominioScuola) out.push('@' + String(cfg.dominioScuola).replace(/^@/, ''));
    } else {
      out.push(v);
    }
  }
  return _senzaDoppioni_(out);
}

function _orDiTesti_(elenco) {
  var out = [];
  for (var i = 0; i < elenco.length; i++) {
    var t = String(elenco[i] || '').trim();
    if (!t) continue;
    out.push(/\s/.test(t) ? '"' + t.replace(/"/g, '') + '"' : t);
  }
  return out.join(' OR ');
}

function _virgolette_(s) { return '"' + String(s).replace(/"/g, '') + '"'; }

/** Criteri per i filtri veri di Gmail (stessa logica, sintassi dell'API). */
function _criteriFiltro_(cfg, regola) {
  var criteri = [];
  var mittenti = _espandi_(cfg, regola.da || []);
  var destinatari = _espandi_(cfg, regola.a || []);
  var allegato = !!regola.haAllegato;
  var libera = [];
  if (regola.contiene && regola.contiene.length) libera.push('(' + _orDiTesti_(regola.contiene) + ')');
  if (regola.queryLibera) libera.push('(' + regola.queryLibera + ')');
  var soggetto = (regola.oggetto && regola.oggetto.length) ? _orDiTesti_(regola.oggetto) : '';

  // come in _queryDellaRegola_: mittenti (o destinatari) previsti ma nessuno
  // rimasto = niente filtro
  if (!mittenti.length && regola.da && regola.da.length) return [];
  if (!destinatari.length && regola.a && regola.a.length) return [];

  if (mittenti.length) {
    for (var i = 0; i < mittenti.length; i += _INDIRIZZI_PER_QUERY) {
      var c = { from: mittenti.slice(i, i + _INDIRIZZI_PER_QUERY).join(' OR ') };
      criteri.push(_altriCriteri_(c, soggetto, destinatari, libera, allegato));
    }
  } else if (soggetto || destinatari.length || libera.length || allegato) {
    criteri.push(_altriCriteri_({}, soggetto, destinatari, libera, allegato));
  }
  return criteri;
}

/** Il resto dei criteri, gli stessi campi che _queryDellaRegola_ mette nella ricerca. */
function _altriCriteri_(c, soggetto, destinatari, libera, allegato) {
  if (soggetto)           c.subject = soggetto;
  if (destinatari.length) c.to = destinatari.join(' OR ');
  if (libera.length)      c.query = libera.join(' ');
  if (allegato)           c.hasAttachment = true;
  return c;
}

function _filtroGiaPresente_(esistenti, criterio, idEtichetta) {
  for (var i = 0; i < esistenti.length; i++) {
    var f = esistenti[i];
    if (!f.action || !f.action.addLabelIds) continue;
    if (f.action.addLabelIds.indexOf(idEtichetta) < 0) continue;
    var c = f.criteria || {};
    if ((c.from || '')    === (criterio.from || '') &&
        (c.to || '')      === (criterio.to || '') &&
        (c.subject || '') === (criterio.subject || '') &&
        (c.query || '')   === (criterio.query || '') &&
        !!c.hasAttachment === !!criterio.hasAttachment) return true;
  }
  return false;
}


// ===========================================================================
//  UTILITA'
// ===========================================================================
function _config_() {
  if (typeof CONFIG === 'undefined') {
    throw new Error('Manca il file "Configurazione.gs".\n' +
      'Apri Campanella, strumento Posta, passo 5 "Codice da incollare": scegli ' +
      '"Configurazione", premi "Copia negli appunti" e incolla il testo in un ' +
      'nuovo file dell\'editor chiamato Configurazione.');
  }
  return CONFIG;
}

function _mioIndirizzo_() {
  try { return Session.getActiveUser().getEmail() || '(sconosciuto)'; }
  catch (e) { return '(sconosciuto)'; }
}

/** Estrae da un campo "Nome <indirizzo>, Nome2 <indirizzo2>" quelli del dominio. */
function _raccogliIndirizzi_(campo, dominio, mappa) {
  if (!campo) return;
  var pezzi = String(campo).split(',');
  for (var i = 0; i < pezzi.length; i++) {
    var m = pezzi[i].match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);
    if (!m) continue;
    var indirizzo = m[0].toLowerCase();
    if (indirizzo.indexOf('@' + dominio) < 0) continue;
    var nome = pezzi[i].replace(m[0], '').replace(/[<>"]/g, '').trim();
    if (!mappa[indirizzo]) mappa[indirizzo] = { nome: nome, n: 0 };
    if (!mappa[indirizzo].nome && nome) mappa[indirizzo].nome = nome;
    mappa[indirizzo].n++;
  }
}

function _senzaDoppioni_(elenco) {
  var visti = {}, out = [];
  for (var i = 0; i < elenco.length; i++) {
    var k = String(elenco[i]).toLowerCase();
    if (visti[k]) continue;
    visti[k] = true;
    out.push(elenco[i]);
  }
  return out;
}

function _somma_(mappa, chiave, quanti) { mappa[chiave] = (mappa[chiave] || 0) + quanti; }

function _totale_(mappa) {
  var t = 0;
  for (var k in mappa) t += mappa[k];
  return t;
}

function _riepilogo_(mappa) {
  var righe = [];
  for (var k in mappa) righe.push('  ' + _pad_(k, 34) + _contaTesto_(mappa[k]));
  if (!righe.length) righe.push('  (nessuna conversazione)');
  righe.push('');
  righe.push('  TOTALE: ' + _totale_(mappa));
  return righe.join('\n');
}

function _contaTesto_(n) { return n + (n === 1 ? ' conversazione' : ' conversazioni'); }

function _pad_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

function _descrizionePeriodo_(cfg) {
  return (cfg.soloUltimiMesi > 0) ? 'ultimi ' + cfg.soloUltimiMesi + ' mesi' : 'tutta la posta';
}

function _leggiProgresso_() {
  var vuoto = { indice: 0, query: 0, fatti: {}, iniziato: null };
  var raw = PropertiesService.getUserProperties().getProperty(_CHIAVE_PROGRESSO);
  if (!raw) return vuoto;
  try {
    var s = JSON.parse(raw);
    s.indice = s.indice || 0;
    s.query  = s.query  || 0;
    s.fatti  = s.fatti  || {};
    return s;
  } catch (e) { return vuoto; }
}

function _salvaProgresso_(stato) {
  PropertiesService.getUserProperties().setProperty(_CHIAVE_PROGRESSO, JSON.stringify(stato));
}

function _azzeraProgresso_() {
  PropertiesService.getUserProperties().deleteProperty(_CHIAVE_PROGRESSO);
}

// ---------------------------------------------------------------------------
//  Le etichette create dallo script. Senza gruppo hanno nomi comuni
//  (Colleghi, Circolari...) e possono essere etichette che avevi gia': solo
//  qui resta scritto quali sono nate dallo script, e le annulla solo quelle.
// ---------------------------------------------------------------------------
function _etichetteCreate_() {
  var raw = PropertiesService.getUserProperties().getProperty(_CHIAVE_CREATE);
  if (!raw) return [];
  try {
    var elenco = JSON.parse(raw);
    return (elenco && typeof elenco.length === 'number') ? elenco : [];
  } catch (e) { return []; }
}

function _salvaCreate_(elenco) {
  PropertiesService.getUserProperties().setProperty(_CHIAVE_CREATE, JSON.stringify(elenco));
}

/** Crea un'etichetta e se lo segna. */
function _creaEtichetta_(nome) {
  var etichetta = GmailApp.createLabel(nome);
  var create = _etichetteCreate_();
  if (create.indexOf(nome) < 0) {
    create.push(nome);
    _salvaCreate_(create);
  }
  return etichetta;
}

/** Dimentica le etichette create qui che nel frattempo hai cancellato da Gmail. */
function _potaCreate_() {
  var create = _etichetteCreate_();
  var restano = [];
  for (var i = 0; i < create.length; i++) {
    if (GmailApp.getUserLabelByName(create[i])) restano.push(create[i]);
  }
  if (restano.length !== create.length) _salvaCreate_(restano);
}

/**
 * Senza gruppo, le etichette di cui lo strumento risponde: quelle che ha
 * creato lui. Se non ne ricorda nessuna (le ha create una versione di prima,
 * o c'erano gia' tutte), quelle delle regole attive.
 */
function _etichetteGestite_(cfg) {
  var create = _etichetteCreate_();
  if (create.length) return create;
  var fuori = [];
  var regole = _regoleAttive_(cfg);
  for (var i = 0; i < regole.length; i++) {
    var nome = _etichettaCompleta_(cfg, regole[i]);
    if (fuori.indexOf(nome) < 0) fuori.push(nome);
  }
  return fuori;
}

function _programmaRipresa_() {
  _rimuoviTrigger_(_TRIGGER_RIPRESA);
  ScriptApp.newTrigger(_TRIGGER_RIPRESA).timeBased().after(60 * 1000).create();
}

/** Toglie i trigger di una funzione; dice quanti ne ha tolti. */
function _rimuoviTrigger_(nomeFunzione) {
  var trigger = ScriptApp.getProjectTriggers();
  var tolti = 0;
  for (var i = 0; i < trigger.length; i++) {
    if (trigger[i].getHandlerFunction() === nomeFunzione) {
      ScriptApp.deleteTrigger(trigger[i]);
      tolti++;
    }
  }
  return tolti;
}

/** Manda un riepilogo a te stesso, e soltanto a te. Vero se e' partito. */
function _inviaReport_(oggetto, corpo) {
  try {
    MailApp.sendEmail(_mioIndirizzo_(), '[Organizzazione Gmail] ' + oggetto, corpo);
    return true;
  } catch (e) {
    Logger.log('Report non inviato: ' + e.message);
    return false;
  }
}
