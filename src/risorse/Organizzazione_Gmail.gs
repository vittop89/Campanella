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
 *  stesso. Non cancella messaggi ne' etichette.
 *
 *  COSA FA
 *    1. crea le etichette in Gmail;
 *    2. le applica alla posta gia' ricevuta, in blocchi, riprendendo da sola
 *       se il tempo massimo di esecuzione finisce;
 *    3. resta attiva e smista i messaggi nuovi ogni ora;
 *    4. (facoltativo) crea i veri filtri di Gmail, cosi' lo smistamento
 *       avviene anche senza lo script (tranne le regole che escludono le
 *       altre, come Studenti: quelle restano allo smistamento del punto 3);
 *    5. (facoltativo) da' alle etichette i colori scelti in Campanella;
 *    6. (facoltativo) toglie i filtri di Gmail che avevi gia' e che hai
 *       scelto in Campanella, dopo averne scritto una copia nel registro.
 *    I punti 4, 5 e 6 vogliono il servizio avanzato "Gmail API" (Servizi -> "+").
 *
 *  COSA NON FA
 *    Non cancella messaggi ne' etichette. Non svuota il cestino. Non segnala
 *    come spam. Applica etichette e, se richiesto, archivia: l'archiviazione
 *    toglie dalla Posta in arrivo ma il messaggio resta in "Tutti i messaggi".
 *    Toglie soltanto quello che chiedi tu: le etichette dai messaggi (le
 *    funzioni ANNULLA_) e i filtri di Gmail che hai scelto in Campanella
 *    (EXTRA_togliFiltri, dopo averne scritto una copia nel registro).
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
 *    EXTRA_coloraEtichette ......... da' alle etichette i colori scelti in
 *                                    Campanella: solo a quelle senza colore e
 *                                    a quelle create o colorate dallo script
 *                                    (facoltativo)
 *    EXTRA_coloraTutteLeEtichette .. come la precedente, ma ricolora anche le
 *                                    etichette che c'erano gia', comprese
 *                                    quelle a cui avevi dato un colore tu
 *    EXTRA_togliFiltri ............. toglie i filtri di Gmail che avevi gia'
 *                                    e che hai scelto in Campanella (Posta,
 *                                    passo 4), dopo averne scritto una copia
 *                                    nel registro (facoltativo)
 *    EXTRA_codiceStato ............. stampa il codice da incollare in
 *                                    Campanella (Impostazioni): dice se il
 *                                    riordino e' fatto
 *
 *    ANNULLA_automazione ........... spegne lo smistamento automatico (e le
 *                                    riprese degli orari, se ci sono)
 *    ANNULLA_etichettatura ......... toglie dalle mail le etichette applicate
 *                                    (senza gruppo, solo quelle nate qui)
 *    ANNULLA_etichettaturaCompleta . come la precedente, ma senza gruppo
 *                                    svuota TUTTE le etichette delle regole
 *                                    accese: anche quelle con lo stesso nome
 *                                    che avevi fatto tu a mano, e quelle
 *                                    create dallo script fino alla 1.4.6, che
 *                                    non se lo segnava
 *    ANNULLA_progressoRiordino ..... azzera il segnaposto del PASSO 3
 *
 *  Le funzioni che finiscono con "_" sono interne: Apps Script non le mostra
 *  nel menu a tendina, cosi' non si lanciano per sbaglio.
 *
 *  VERSIONE: la stampano PASSO_1_anteprima ed EXTRA_codiceStato. Se in
 *  Campanella la versione e' piu' nuova, reincolla questo file.
 *  PASSO_1_anteprima stampa anche l'impronta di Configurazione.gs: deve
 *  essere quella che Campanella mostra al passo 5 della Posta, se no la
 *  configurazione incollata e' vecchia e va copiata di nuovo.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Limiti e costanti interne
// ---------------------------------------------------------------------------
var _POSTA_VERSIONE         = '1.5.3'; // versione di questo file (vedi l'intestazione)
var _MAX_SECONDI_ESECUZIONE = 260;   // ~4 min 20 s: sotto il limite di Google
var _THREAD_PER_BLOCCO      = 100;   // massimo consentito da addToThreads()
var _INDIRIZZI_PER_QUERY    = 20;    // spezza le ricerche troppo lunghe
var _THREAD_INDIRIZZI       = 4000;  // tetto di EXTRA_elencaIndirizziScuola
var _RIGHE_PER_SCRITTA      = 40;    // il registro taglia le scritte lunghe
var _TETTO_ANTEPRIMA        = 500;   // PASSO_1 conta fino a qui per ricerca (massimo di Gmail)
var _LARGHEZZA_RIGA         = 96;    // le note dell'anteprima vanno a capo qui
var _LARGHEZZA_TABELLA      = 100;   // e le righe della sua tabella non vanno oltre
var _CHIAVE_PROGRESSO       = 'ORGGMAIL_PROGRESSO';
var _CHIAVE_CREATE          = 'ORGGMAIL_ETICHETTE_CREATE';  // le etichette nate qui
var _CHIAVE_CREATE_ID       = 'ORGGMAIL_ETICHETTE_CREATE_ID';  // e il loro id (servizio Gmail API)
var _CHIAVE_COLORI          = 'ORGGMAIL_COLORI_DATI';  // i colori dati dallo script, per id
var _CHIAVE_FILTRI_TOLTI    = 'ORGGMAIL_FILTRI_TOLTI'; // le voci di filtriDaTogliere gia' tolte (solo un'impronta)
var _TRIGGER_RIPRESA        = 'PASSO_3_riordinaPostaEsistente';
var _TRIGGER_ORARIO         = 'smistaNuoviMessaggi';
var _TRIGGER_ORARI          = 'ORARI_2_invia';  // le due riprese di Orari.gs, nello stesso progetto
var _TRIGGER_ORARI_CLASSI   = 'ORARI_3_inviaOrariClassi';
// i colori che Gmail accetta per le etichette, per lo sfondo e per il testo
// (Gmail API, Label.color): con un altro valore la chiamata fallisce
var _COLORI_GMAIL = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#f3f3f3', '#ffffff',
  '#fb4c2f', '#ffad47', '#fad165', '#16a766', '#43d692', '#4a86e8', '#a479e2', '#f691b3',
  '#f6c5be', '#ffe6c7', '#fef1d1', '#b9e4d0', '#c6f3de', '#c9daf8', '#e4d7f5', '#fcdee8',
  '#efa093', '#ffd6a2', '#fce8b3', '#89d3b2', '#a0eac9', '#a4c2f4', '#d0bcf1', '#fbc8d9',
  '#e66550', '#ffbc6b', '#fcda83', '#44b984', '#68dfa9', '#6d9eeb', '#b694e8', '#f7a7c0',
  '#cc3a21', '#eaa041', '#f2c960', '#149e60', '#3dc789', '#3c78d8', '#8e63ce', '#e07798',
  '#ac2b16', '#cf8933', '#d5ae49', '#0b804b', '#2a9c68', '#285bac', '#653e9b', '#b65775',
  '#822111', '#a46a21', '#aa8831', '#076239', '#1a764d', '#1c4587', '#41236d', '#83334c',
  '#464646', '#e7e7e7', '#0d3472', '#b6cff5', '#0d3b44', '#98d7e4', '#3d188e', '#e3d7ff',
  '#711a36', '#fbd3e0', '#8a1c0a', '#f2b2a8', '#7a2e0b', '#ffc8af', '#7a4706', '#ffdeb5',
  '#594c05', '#fbe983', '#684e07', '#fdedc1', '#0b4f30', '#b3efd3', '#04502e', '#a2dcc1',
  '#c2c2c2', '#4986e7', '#2da2bb', '#b99aff', '#994a64', '#f691b2', '#ff7537', '#ffad46',
  '#662e37', '#ebdbde', '#cca6ac', '#094228', '#42d692', '#16a765'
];
// i criteri dei filtri (Gmail API, Filter.criteria) come li chiama Gmail nella
// finestra "Crea un nuovo filtro": le copie dei filtri tolti usano questi nomi
var _NOMI_CRITERI = [
  ['from', 'Da'], ['to', 'A'], ['subject', 'Oggetto'], ['query', 'Contiene le parole'],
  ['negatedQuery', 'Non contiene'], ['hasAttachment', 'Contiene allegati'],
  ['excludeChats', 'Non includere chat']
];


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
  // L'impronta la scrive Campanella in Configurazione.gs, e al passo 5 mostra
  // quella delle scelte di adesso: se non sono uguali, la configurazione
  // incollata qui e' di prima (una regola spenta nell'app qui e' ancora accesa)
  if (cfg.impronta) {
    righe.push('Configurazione: impronta ' + String(cfg.impronta));
    righe = righe.concat(_aCapo_('Campanella mostra quella di adesso nella Posta, al passo 5: se e\' ' +
      'diversa, questa configurazione e\' vecchia e va copiata di nuovo.', '  ', '  '));
  } else {
    righe.push('Configurazione: senza impronta: generata da una versione precedente di Campanella.');
    righe = righe.concat(_aCapo_('Copiala di nuovo dalla Posta, passo 5: quella nuova ha l\'impronta, ' +
      'e qui potrai controllare che sia quella di adesso.', '  ', '  '));
  }
  // i colori scelti in Campanella: li puo' mettere solo il servizio Gmail API
  righe.push(_rigaColori_(cfg));
  // i filtri di Gmail che avevi gia' e che hai scelto di togliere
  var daTogliere = _vociFiltri_(cfg).buone.length;
  if (daTogliere) {
    righe.push(daTogliere + (daTogliere === 1 ? ' filtro' : ' filtri') +
               ' di Gmail da togliere: esegui EXTRA_togliFiltri (serve il servizio Gmail API).');
  }
  righe.push('');

  var prefisso = String(cfg.prefissoEtichette || '').replace(/\/+$/, '');
  var create = _etichetteCreate_();
  var regole = _regoleAttive_(cfg);
  var conti = [], nomi = [], code = [];
  var totale = 0, totalePieno = false, giaDiPrima = false;
  // prima i conti, poi la tabella: la colonna dei nomi si allarga fin dove
  // le righe restano corte (_colonnaNomi_)
  for (var i = 0; i < regole.length; i++) {
    var nome = _etichettaCompleta_(cfg, regole[i]);
    var c = _contaAnteprima_(cfg, regole[i], nome);
    nomi.push(nome);
    conti.push(c);
    totale += c.nuove;
    if (c.pieno) totalePieno = true;
    var sua = create.indexOf(nome) >= 0;
    if (c.etichetta && !sua) giaDiPrima = true;
    code.push(_aDestra_(c.rifiutata ? '?' : _numeroAnteprima_(c.nuove, c.pieno), 15) +
              _aDestra_(c.etichetta ? _numeroAnteprima_(c.gia, c.giaPiena) : '-', 18) + '  ' +
              (!c.etichetta ? 'da creare' : sua ? 'creata dallo script' : 'esisteva gia\'') +
              (regole[i].archivia ? '  (archivia)' : ''));
  }
  var colonna = _colonnaNomi_(nomi, code);
  righe.push('  ' + _pad_('ETICHETTA', colonna) + _aDestra_('DA ETICHETTARE', 15) +
             _aDestra_('GIA\' ETICHETTATE', 18) + '  IN GMAIL');
  for (var r = 0; r < regole.length; r++) {
    c = conti[r];
    if (nomi[r].length + 2 > colonna) {
      // un nome che non ci sta va su una riga sua, e i numeri sotto, in colonna
      righe.push('  ' + nomi[r]);
      righe.push('  ' + _pad_('', colonna) + code[r]);
    } else {
      righe.push('  ' + _pad_(nomi[r], colonna) + code[r]);
    }
    if (c.rifiutata) {
      righe = righe.concat(_aCapo_('Gmail non accetta la ricerca di questa regola: controlla la ' +
        'ricerca avanzata (queryLibera). Il riordino la salta.', '      ', '      '));
    } else if (c.senzaPosta) {
      righe = righe.concat(_aCapo_('nessun messaggio da questi mittenti: controlla gli indirizzi ' +
        '(per il registro elettronico, guarda il mittente vero di una notifica)', '      ', '      '));
    }
  }
  righe.push('');
  righe.push('Totale da etichettare: ' + _numeroAnteprima_(totale, totalePieno) +
             '  (una conversazione con due etichette conta due volte)');
  righe = righe.concat(_aCapo_('DA ETICHETTARE: le conversazioni che prenderanno l\'etichetta (quelle ' +
    'che ce l\'hanno gia\' non si contano). GIA\' ETICHETTATE: quelle che ce l\'hanno adesso. ' +
    'Un numero con il + e\' un minimo: il conteggio si ferma a ' + _TETTO_ANTEPRIMA +
    ' conversazioni per ricerca.', '', ''));

  if (giaDiPrima) {
    righe.push('');
    // lo script si segna le etichette che crea solo dalla 1.5.0: quelle fatte
    // prima (anche sotto "Scuola", il gruppo di partenza fino alla 1.4.0) qui
    // risultano gia' esistenti, con il gruppo e senza
    righe = righe.concat(_aCapo_(prefisso
      ? 'ESISTEVA GIA\': l\'etichetta c\'era prima dello script (o l\'ha creata una versione fino ' +
        'alla 1.4.6, che non se lo segnava). Lo script la riusa e ci aggiunge i suoi messaggi; ' +
        'sta dentro "' + prefisso + '", quindi ANNULLA_etichettatura la svuota comunque, anche ' +
        'dai messaggi a cui l\'avessi messa tu.'
      : 'ESISTEVA GIA\': l\'etichetta c\'era prima dello script (o l\'ha creata una versione fino ' +
        'alla 1.4.6, che non se lo segnava). Lo script la riusa e ci aggiunge i suoi messaggi; ' +
        'ANNULLA_etichettatura non la svuota, ANNULLA_etichettaturaCompleta si\' (anche dai ' +
        'messaggi a cui l\'avevi messa tu).', '', ''));
  }

  var eccesso = _stimePerEccesso_(cfg, regole, conti);
  for (var s = 0; s < eccesso.length; s++) {
    righe.push('');
    righe = righe.concat(_aCapo_(eccesso[s], '', ''));
  }

  var doppi = _doppioni_(cfg, regole);
  if (doppi.length) {
    righe.push('');
    righe.push('Regole che mettono due etichette agli stessi messaggi:');
    for (var d = 0; d < doppi.length; d++) righe = righe.concat(_aCapo_(doppi[d], '  - ', '    '));
  }
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

/**
 * I numeri di una regola per l'anteprima: quante conversazioni prenderebbero
 * l'etichetta (nuove), se l'etichetta c'e' gia' in Gmail e quante ce l'hanno
 * (gia). Ogni ricerca si ferma a _TETTO_ANTEPRIMA: "pieno" e "giaPiena"
 * dicono che il tetto e' stato toccato, e che il numero vero e' piu' alto.
 * Con molti mittenti la regola fa piu' ricerche, e una conversazione con
 * mittenti in due gruppi (un "rispondi a tutti" fra colleghi) torna da
 * tutte e due: si conta una volta sola, come fa il PASSO_3 quando la etichetta.
 */
function _contaAnteprima_(cfg, regola, nome) {
  var c = { nuove: 0, pieno: false, rifiutata: false, etichetta: false, gia: 0, giaPiena: false,
            senzaPosta: false };
  var queries = _queryDellaRegola_(cfg, regola);
  var viste = {};
  for (var q = 0; q < queries.length; q++) {
    var trovate;
    try { trovate = GmailApp.search(queries[q], 0, _TETTO_ANTEPRIMA); }
    catch (e) { c.rifiutata = true; continue; }     // come nel PASSO_3: la regola e' saltata
    if (trovate.length >= _TETTO_ANTEPRIMA) c.pieno = true;
    for (var t = 0; t < trovate.length; t++) {
      var id = trovate[t].getId();
      if (viste[id]) continue;
      viste[id] = true;
      c.nuove++;
    }
  }
  var etichetta = GmailApp.getUserLabelByName(nome);
  if (etichetta) {
    c.etichetta = true;
    c.gia = etichetta.getThreads(0, _TETTO_ANTEPRIMA).length;
    c.giaPiena = c.gia >= _TETTO_ANTEPRIMA;
  }
  // mittenti scritti per esteso (indirizzi o domini, anche quelli che
  // Campanella propone di partenza) che non trovano niente, nemmeno fra i
  // messaggi che hanno gia' l'etichetta: spesso sono sbagliati
  if (!c.nuove && !c.rifiutata && _indirizziScritti_(regola)) c.senzaPosta = _nessunMittente_(cfg, regola);
  return c;
}

/** Un conteggio dell'anteprima: con il "+" quando una ricerca ha toccato il tetto. */
function _numeroAnteprima_(n, pieno) { return String(n) + (pieno ? '+' : ''); }

/** Vero se fra i mittenti c'e' un indirizzo (o un dominio) scritto per esteso, non un segnaposto. */
function _indirizziScritti_(regola) {
  var da = regola.da || [];
  for (var i = 0; i < da.length; i++) {
    var v = String(da[i] || '').trim();
    if (!v || v === '@PERSONALE@' || v === '@DOMINIO@') continue;
    if (v.indexOf('@GRUPPO:') === 0 && v.charAt(v.length - 1) === '@') continue;
    return true;
  }
  return false;
}

/**
 * Vero se dai mittenti della regola non arriva niente, nel periodo scelto:
 * la stessa ricerca con i soli mittenti, contando anche le conversazioni che
 * hanno gia' l'etichetta.
 */
function _nessunMittente_(cfg, regola) {
  var soloMittenti = { etichetta: regola.etichetta, da: regola.da };
  var togli = ' -label:' + _virgolette_(_etichettaCompleta_(cfg, soloMittenti));
  var queries = _queryDellaRegola_(cfg, soloMittenti);
  for (var q = 0; q < queries.length; q++) {
    try {
      if (GmailApp.search(queries[q].replace(togli, ''), 0, 1).length) return false;
    } catch (e) { return false; }
  }
  return queries.length > 0;
}

/**
 * Le regole che escludono altre etichette (Studenti esclude Colleghi...)
 * contano di piu' del reale solo se una regola esclusa, che nel riordino gira
 * prima, ha ancora conversazioni da etichettare: qui quelle non hanno ancora
 * l'etichetta e finiscono nel conto. Una frase per regola, con le escluse
 * che ne sono la causa; niente frase se il conto e' giusto.
 */
function _stimePerEccesso_(cfg, regole, conti) {
  var frasi = [];
  for (var i = 0; i < regole.length; i++) {
    var escludi = regole[i].escludiEtichette || [];
    if (!escludi.length || !conti[i].nuove || conti[i].rifiutata) continue;
    var motivi = [];
    for (var e = 0; e < escludi.length; e++) {
      var esclusa = _etichettaCompleta_(cfg, { etichetta: escludi[e] });
      for (var j = 0; j < i; j++) {
        if (_etichettaCompleta_(cfg, regole[j]) !== esclusa || !conti[j].nuove) continue;
        motivi.push(esclusa + (!conti[j].etichetta ? ' (non esiste ancora)'
                             : !conti[j].gia ? ' (e\' ancora vuota)'
                             : ' (deve prenderne ancora ' +
                               _numeroAnteprima_(conti[j].nuove, conti[j].pieno) + ')'));
        break;
      }
    }
    if (!motivi.length) continue;
    var nome = _etichettaCompleta_(cfg, regole[i]);
    frasi.push('Nota: ' + nome + ' e\' una stima per eccesso. Esclude le conversazioni con ' +
               motivi.join(', ') + ': nel riordino quelle regole girano prima, e i messaggi che ' +
               'etichettano non finiscono in ' + nome + '.');
  }
  return frasi;
}

/**
 * Le coppie di regole accese che mettono la loro etichetta agli stessi
 * messaggi: stessi mittenti, o quelli di una tutti dentro l'altra, e nessun
 * altro criterio. Non contano la madre con le figlie (Colleghi e
 * Colleghi/Docenti: le sottoetichette dei ruoli sono una parte dei colleghi
 * apposta) ne' tutto il personale (@PERSONALE@) con una sua parte. Una frase
 * per coppia, nell'ordine delle regole.
 */
function _doppioni_(cfg, regole) {
  var mittenti = [], nomi = [];
  for (var i = 0; i < regole.length; i++) {
    mittenti.push(_mittentiConfrontabili_(cfg, regole[i]));
    nomi.push(_etichettaCompleta_(cfg, regole[i]));
  }
  var frasi = [];
  for (var a = 0; a < regole.length; a++) {
    if (!mittenti[a]) continue;
    for (var b = a + 1; b < regole.length; b++) {
      if (!mittenti[b] || nomi[a] === nomi[b]) continue;
      if (nomi[b].indexOf(nomi[a] + '/') === 0 || nomi[a].indexOf(nomi[b] + '/') === 0) continue;
      var aInB = _tuttiDentro_(mittenti[a], mittenti[b]);
      var bInA = _tuttiDentro_(mittenti[b], mittenti[a]);
      if (aInB && bInA) {
        var ruoloA = _soloRuolo_(regole[a]), ruoloB = _soloRuolo_(regole[b]);
        frasi.push(nomi[a] + ' e ' + nomi[b] + ': stessi mittenti, ogni messaggio prende tutte e due.' +
          (ruoloA === ruoloB
            ? (ruoloA ? '' : ' Se ne vuoi una sola, spegni una delle due regole nel passo 4 di Campanella.')
            : ' Se ne vuoi una sola, spegni la regola ' + (ruoloA ? nomi[b] : nomi[a]) +
              ' nel passo 4 di Campanella (la sottoetichetta per ruolo resta).'));
        continue;
      }
      if (!aInB && !bInA) continue;
      var piccola = aInB ? a : b, grande = aInB ? b : a;
      if (_tuttoIlPersonale_(regole[grande])) continue;
      frasi.push(nomi[piccola] + ' e ' + nomi[grande] + ': i mittenti di ' + nomi[piccola] +
        ' sono tutti anche in ' + nomi[grande] + ', quindi ogni messaggio di ' + nomi[piccola] +
        ' prende tutte e due.' +
        (_soloRuolo_(regole[piccola]) ? ''
          : ' Se ti basta ' + nomi[grande] + ', spegni la regola ' + nomi[piccola] +
            ' nel passo 4 di Campanella' +
            (_soloRuolo_(regole[grande]) ? ' (la sottoetichetta per ruolo resta).' : '.')));
    }
  }
  return frasi;
}

/**
 * I mittenti di una regola da confrontare con le altre: gli indirizzi dopo
 * l'espansione, in minuscolo. null se la regola non si puo' confrontare:
 * senza mittenti, con altri criteri (oggetto, testo, destinatari, allegato,
 * ricerca avanzata, etichette escluse) o con @DOMINIO@, che non e' un elenco
 * di indirizzi.
 */
function _mittentiConfrontabili_(cfg, regola) {
  var da = regola.da || [];
  if (!da.length) return null;
  if ((regola.oggetto && regola.oggetto.length) || (regola.contiene && regola.contiene.length) ||
      (regola.a && regola.a.length) || regola.haAllegato || regola.queryLibera ||
      (regola.escludiEtichette && regola.escludiEtichette.length)) return null;
  for (var i = 0; i < da.length; i++) {
    if (String(da[i] || '').trim() === '@DOMINIO@') return null;
  }
  var espansi = _espandi_(cfg, da);
  if (!espansi.length) return null;
  var fuori = [];
  for (var k = 0; k < espansi.length; k++) fuori.push(String(espansi[k]).toLowerCase());
  return _senzaDoppioni_(fuori);
}

function _tuttiDentro_(piccolo, grande) {
  var c = {};
  for (var i = 0; i < grande.length; i++) c[grande[i]] = true;
  for (var j = 0; j < piccolo.length; j++) if (!c[piccolo[j]]) return false;
  return true;
}

/** Una sottoetichetta per ruolo: i mittenti sono un gruppo del personale e basta. */
function _soloRuolo_(regola) {
  var da = regola.da || [];
  if (da.length !== 1) return false;
  var v = String(da[0] || '').trim();
  return v.indexOf('@GRUPPO:') === 0 && v.length > 9 && v.charAt(v.length - 1) === '@';
}

/** Tutto l'elenco del personale (la regola Colleghi): contiene ogni regola fatta di colleghi. */
function _tuttoIlPersonale_(regola) {
  var da = regola.da || [];
  return da.length === 1 && String(da[0] || '').trim() === '@PERSONALE@';
}

/** Spezza un testo in righe corte per il registro: "prima" apre la prima riga, "dopo" le altre. */
function _aCapo_(testo, prima, dopo) {
  var parole = String(testo).split(' ');
  var righe = [], riga = prima, vuota = true;
  for (var i = 0; i < parole.length; i++) {
    if (!parole[i]) continue;
    if (!vuota && riga.length + 1 + parole[i].length > _LARGHEZZA_RIGA) {
      righe.push(riga);
      riga = dopo + parole[i];
    } else {
      riga += (vuota ? '' : ' ') + parole[i];
    }
    vuota = false;
  }
  righe.push(riga);
  return righe;
}

/**
 * La larghezza della colonna dei nomi nella tabella dell'anteprima: almeno
 * 30, o il nome piu' lungo con due spazi dopo, ma solo finche' la riga piu'
 * larga (i numeri, "creata dallo script", "(archivia)") resta entro
 * _LARGHEZZA_TABELLA. Un nome che non ci sta va su una riga sua.
 */
function _colonnaNomi_(nomi, code) {
  var nome = 0, coda = 0;
  for (var i = 0; i < nomi.length; i++) {
    nome = Math.max(nome, nomi[i].length + 2);
    coda = Math.max(coda, code[i].length);
  }
  return Math.max(30, Math.min(nome, _LARGHEZZA_TABELLA - 2 - coda));
}

/** Allinea a destra, per le colonne dei numeri. */
function _aDestra_(s, n) {
  s = String(s);
  while (s.length < n) s = ' ' + s;
  return s;
}

/**
 * La riga dell'anteprima sui colori: quante etichette delle regole accese
 * hanno un colore che Gmail accetta, e se il servizio Gmail API c'e' per
 * metterli. Una riga sola, sotto l'impronta: la tabella resta com'e'.
 */
function _rigaColori_(cfg) {
  var regole = _regoleAttive_(cfg), n = 0;
  for (var i = 0; i < regole.length; i++) if (_coloreAmmesso_(regole[i].colore)) n++;
  if (!n) return 'Colori: nessuno scelto in Campanella.';
  return 'Colori: ' + n + (n === 1 ? ' etichetta' : ' etichette') + ' con un colore' +
    (_servizioGmail_() ? '; il servizio Gmail API c\'e\', quindi si possono applicare.'
                       : ', ma senza il servizio Gmail API non si possono applicare.');
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
  // come e' andata con i colori delle etichette nuove (vedi _coloraNuova_)
  var colori = { messi: 0, senzaServizio: 0, sbagliati: 0, falliti: 0 };
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
        if (!prova) _creaEtichetta_(progressivo, colori);
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
              (esistenti.length ? '\n  - ' + esistenti.join('\n  - ') : '') +
              _esitoColori_(colori);
  Logger.log(testo);
  return testo;
}

/** Quello che PASSO_2 dice dei colori delle etichette che ha appena creato. */
function _esitoColori_(c) {
  var testo = '';
  if (c.messi) testo += '\n\nColori dati alle etichette nuove: ' + c.messi + '.';
  if (c.senzaServizio) {
    testo += '\n\n' + (c.senzaServizio === 1 ? 'Un\'etichetta nuova e\' nata' :
                       c.senzaServizio + ' etichette nuove sono nate') +
             ' senza il colore scelto in Campanella: manca il servizio "Gmail API". Nell\'editor: ' +
             'Servizi -> "+" -> scegli "Gmail API" -> Aggiungi; poi esegui EXTRA_coloraEtichette.';
  }
  if (c.sbagliati) {
    testo += '\n\nColori saltati perche\' Gmail non li accetta: ' + c.sbagliati +
             '. Scegli di nuovo il colore in Campanella (Posta, passo 4) e copia di nuovo la configurazione.';
  }
  if (c.falliti) {
    testo += '\n\nColori non applicati: ' + c.falliti + ' (il motivo e\' nel registro). ' +
             'Riprova con EXTRA_coloraEtichette.';
  }
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

  var idEtichette = {}, perId = {};
  var lista = Gmail.Users.Labels.list('me').labels || [];
  for (var i = 0; i < lista.length; i++) {
    idEtichette[lista[i].name] = lista[i].id;
    perId[lista[i].id] = { nome: String(lista[i].name), sistema: lista[i].type === 'system' };
  }

  var esistenti = Gmail.Users.Settings.Filters.list('me').filter || [];
  var creati = [], saltati = [], falliti = [], alloScript = [], vecchi = [], daTogliere = [];
  var regole = _regoleAttive_(cfg);
  // i filtri scelti in Campanella per EXTRA_togliFiltri non si creano: se no
  // quella funzione li toglierebbe e questa li rifarebbe, un giro dopo l'altro
  var scelti = _vociFiltri_(cfg).buone;

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
      var azione = { addLabelIds: [id] };
      if (_fraIScelti_(scelti, { criteria: criteri[c], action: azione }, perId)) {
        if (daTogliere.indexOf(nome) < 0) daTogliere.push(nome);
        continue;
      }
      if (_filtroGiaPresente_(esistenti, criteri[c], id)) { saltati.push(nome); continue; }
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

  // le regole che Gmail non smistera' da solo: quelle lasciate allo script,
  // quelle il cui filtro non si e' riusciti a creare e quelle con un filtro
  // scelto fra quelli da togliere
  var tranne = alloScript.slice();
  for (var f = 0; f < falliti.length; f++) {
    var chi = falliti[f].split(': ')[0];
    if (tranne.indexOf(chi) < 0) tranne.push(chi);
  }
  for (var d = 0; d < daTogliere.length; d++) {
    if (tranne.indexOf(daTogliere[d]) < 0) tranne.push(daTogliere[d]);
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
              (daTogliere.length
                ? '\nNon creati, perche\' in Campanella li hai scelti fra i filtri da togliere ' +
                  '(EXTRA_togliFiltri): ' + daTogliere.join(', ') +
                  '\n  (se li rivuoi, togli la spunta in Campanella, Posta, passo 4, "Filtri che hai gia\' ' +
                  'in Gmail...", copia di nuovo la configurazione e riesegui questa funzione)'
                : '') +
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
//  EXTRA - I COLORI DELLE ETICHETTE (facoltativo)
//  GmailApp non sa colorare le etichette: serve il servizio avanzato "Gmail
//  API", lo stesso dei filtri veri (editor -> Servizi (+) -> "Gmail API").
//  Con il servizio attivo le etichette nuove nascono gia' colorate; queste
//  due funzioni colorano quelle che ci sono gia'. Toccano solo le etichette
//  delle regole accese che in Configurazione.gs hanno un colore, e solo con
//  i colori della tavolozza di Gmail. Non cancellano niente.
// ===========================================================================

/**
 * Da' alle etichette delle regole accese il colore scelto in Campanella, ma
 * solo a quelle senza colore, a quelle create dallo script e a quelle che
 * hanno ancora il colore che lo script aveva dato: un colore che avevi dato
 * tu a un'etichetta che c'era gia' resta com'e'.
 */
function EXTRA_coloraEtichette() {
  return _coloraEtichette_(false);
}

/**
 * Come EXTRA_coloraEtichette, ma ricolora anche le etichette che c'erano
 * gia', comprese quelle a cui avevi dato un colore tu.
 */
function EXTRA_coloraTutteLeEtichette() {
  return _coloraEtichette_(true);
}

function _coloraEtichette_(tutte) {
  var funzione = tutte ? 'EXTRA_coloraTutteLeEtichette' : 'EXTRA_coloraEtichette';
  if (!_servizioGmail_()) {
    var senza = 'SERVIZIO "Gmail API" NON ATTIVO: non ho cambiato nessun colore.\n' +
      'I colori delle etichette li puo\' mettere solo quel servizio. Nell\'editor, colonna di sinistra: ' +
      'Servizi -> "+" -> scegli "Gmail API" -> Aggiungi. Poi esegui di nuovo ' + funzione + '.';
    Logger.log(senza);
    return senza;
  }
  var cfg = _config_();
  var prova = !!cfg.provaSenzaModifiche;

  // lo stesso blocco del riordino e dello smistamento, che creano etichette
  var lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) {
    var occupato = 'Un\'altra esecuzione (il riordino della posta o lo smistamento) sta lavorando ' +
                   'proprio adesso: riprova fra un minuto. Non ho cambiato nessun colore.';
    Logger.log(occupato);
    return occupato;
  }
  var fatte = [], uguali = [], tue = [], mancano = [], sbagliati = [], fallite = [];
  try {
    var memoria = _memoriaEtichette_();
    var inGmail = _etichetteGmail_();
    var regole = _regoleAttive_(cfg);
    var viste = {};
    for (var i = 0; i < regole.length; i++) {
      var colore = regole[i].colore;
      if (!colore) continue;                       // regola senza colore: la sua etichetta non si tocca
      var nome = _etichettaCompleta_(cfg, regole[i]);
      if (viste[nome]) continue;
      viste[nome] = true;
      if (!_coloreAmmesso_(colore)) { sbagliati.push(nome + ' (' + _descriviColore_(colore) + ')'); continue; }
      if (!inGmail[nome]) { mancano.push(nome); continue; }
      try {
        var adesso = Gmail.Users.Labels.get('me', inGmail[nome].id).color || null;
        if (_stessoColore_(adesso, colore)) { uguali.push(nome); continue; }
        // un colore che non ha dato lo script si cambia solo se lo chiedi
        var senzaColore = !adesso || !adesso.backgroundColor;
        if (!tutte && !senzaColore && !_coloreDelloScript_(memoria, nome, inGmail[nome].id, adesso)) {
          tue.push(nome);
          continue;
        }
        if (!prova) _applicaColore_(inGmail[nome].id, colore, inGmail);
        fatte.push(nome);
      } catch (errore) {
        fallite.push(nome + ': ' + errore.message);
      }
    }
  } finally {
    lock.releaseLock();
  }

  var testo = (prova
      ? 'MODALITA\' PROVA: non ho cambiato nessun colore, dico soltanto che cosa cambierebbe.\n'
      : '') +
    (tutte
      ? 'Questa funzione ricolora anche le etichette che c\'erano gia\', comprese quelle a cui avevi ' +
        'dato un colore tu.\n'
      : '') +
    (prova ? 'Etichette da colorare: ' : 'Etichette colorate adesso: ') + fatte.length +
    (fatte.length ? '\n  - ' + fatte.join('\n  - ') : '') +
    '\nGia\' del colore scelto: ' + uguali.length +
    (tue.length
      ? '\n\nNon toccate, perche\' hanno un colore che non ha dato lo script (gliel\'hai dato tu): ' +
        tue.join(', ') + '.\nPer dare anche a queste i colori di Campanella esegui ' +
        'EXTRA_coloraTutteLeEtichette.'
      : '') +
    (mancano.length
      ? '\n\nNon ci sono ancora in Gmail: ' + mancano.join(', ') + '.\n' +
        (prova
          ? 'Nasceranno gia\' colorate quando togli la modalita\' prova (le crea PASSO_2_creaEtichette, ' +
            'o il riordino).'
          : 'Le crea PASSO_2_creaEtichette, gia\' colorate.')
      : '') +
    (sbagliati.length
      ? '\n\nSaltate, perche\' Gmail non accetta il loro colore: ' + sbagliati.join(', ') + '.\n' +
        'Scegli di nuovo il colore in Campanella (Posta, passo 4) e copia di nuovo la configurazione.'
      : '') +
    (fallite.length ? '\n\nNon riuscite:\n  - ' + fallite.join('\n  - ') : '') +
    '\n\nLe etichette delle regole senza colore restano come sono.';
  Logger.log(testo);
  return testo;
}


// ===========================================================================
//  EXTRA - TOGLIERE I FILTRI DI GMAIL CHE AVEVI GIA' (facoltativo)
//  Un filtro fatto a mano anni fa continua a mettere la sua etichetta anche
//  quando le etichette le mette lo script. In Campanella (Posta, passo 4,
//  "Filtri che hai gia' in Gmail...") apri l'esportazione dei tuoi filtri e
//  spunti quelli da togliere: finiscono in Configurazione.gs, in
//  filtriDaTogliere, con l'etichetta e i criteri esatti. Serve il servizio
//  avanzato "Gmail API" (editor -> Servizi (+) -> "Gmail API").
//  Toglie solo un filtro che ha proprio quei criteri (tutti, e nessuno in
//  piu') e che mette proprio quell'etichetta; prima di toglierlo ne scrive
//  una copia completa nel registro, con cui lo si rifa' a mano. Non tocca
//  gli altri filtri, le etichette ne' i messaggi.
// ===========================================================================
function EXTRA_togliFiltri() {
  var cfg = _config_();
  var voci = _vociFiltri_(cfg);
  if (!voci.buone.length && !voci.saltate.length) {
    var niente = 'Nessun filtro da togliere in Configurazione.gs. I filtri che hai gia\' in Gmail si ' +
      'scelgono in Campanella (Posta, passo 4, "Filtri che hai gia\' in Gmail..."): poi copia di nuovo ' +
      'la configurazione ed esegui ancora questa funzione.';
    Logger.log(niente);
    return niente;
  }
  if (!_servizioFiltri_()) {
    var senza = 'SERVIZIO "Gmail API" NON ATTIVO: non ho tolto nessun filtro.\n' +
      'I filtri di Gmail li puo\' togliere solo quel servizio. Nell\'editor, colonna di sinistra: ' +
      'Servizi -> "+" -> scegli "Gmail API" -> Aggiungi. Poi esegui di nuovo EXTRA_togliFiltri.';
    Logger.log(senza);
    return senza;
  }
  var prova = !!cfg.provaSenzaModifiche;

  // lo stesso blocco del riordino, dello smistamento e dei colori
  var lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) {
    var occupato = 'Un\'altra esecuzione (il riordino della posta o lo smistamento) sta lavorando ' +
                   'proprio adesso: riprova fra un minuto. Non ho tolto nessun filtro.';
    Logger.log(occupato);
    return occupato;
  }
  var esito;
  try { esito = _togliFiltri_(voci.buone, prova); }
  finally { lock.releaseLock(); }

  var n = esito.tolti.length;
  var righe = [];
  if (prova) {
    righe.push('MODALITA\' PROVA: non ho tolto nessun filtro, dico soltanto che cosa toglierei.');
  } else if (!n && !esito.nonRiusciti.length) {
    righe = righe.concat(_aCapo_('NIENTE DA TOGLIERE: in Gmail non c\'e\' nessun filtro con proprio i ' +
      'criteri e l\'etichetta di quelli scelti in Campanella.', '', ''));
  }
  righe.push((prova ? 'Filtri di Gmail da togliere: ' : 'Filtri di Gmail tolti adesso: ') + n);
  for (var i = 0; i < n; i++) righe.push(_rientra_(esito.tolti[i], '  - ', '    '));
  if (esito.nonRiusciti.length) {
    righe.push('');
    righe.push('Non riusciti: ' + esito.nonRiusciti.length);
    for (var r = 0; r < esito.nonRiusciti.length; r++) righe.push('  - ' + esito.nonRiusciti[r]);
    righe = righe.concat(_aCapo_('Questi filtri ci sono ancora. Riprova fra qualche minuto: gli altri ' +
      'restano tolti.', '  ', '  '));
  }
  if (esito.nonTrovati.length) {
    righe.push('');
    righe.push('Non trovati: ' + esito.nonTrovati.length);
    for (var t = 0; t < esito.nonTrovati.length; t++) righe.push('  - ' + esito.nonTrovati[t]);
    righe = righe.concat(_aCapo_('In Gmail non c\'e\' un filtro con proprio questi criteri (tutti, e ' +
      'nessuno in piu\') che mette questa etichetta: se l\'hai cambiato, esportalo di nuovo e sceglilo in ' +
      'Campanella. Non ho tolto niente al suo posto.', '  ', '  '));
  }
  if (esito.giaTolti.length) {
    righe.push('');
    righe.push('Gia\' tolti prima da EXTRA_togliFiltri: ' + esito.giaTolti.length);
    for (var g = 0; g < esito.giaTolti.length; g++) righe.push('  - ' + esito.giaTolti[g]);
  }
  if (voci.saltate.length) {
    righe.push('');
    righe.push('Voci di Configurazione.gs saltate, perche\' senza etichetta o senza criteri: ' + voci.saltate.length);
    for (var s = 0; s < voci.saltate.length; s++) righe.push('  - ' + voci.saltate[s]);
  }
  righe.push('');
  righe = righe.concat(_aCapo_('Gli altri filtri non li ho toccati. Le etichette gia\' messe ai messaggi ' +
    'restano, e i messaggi pure: se un\'etichetta non ti serve piu\', cancellala tu da Gmail ' +
    '(Impostazioni -> Etichette); i messaggi non si cancellano.', '', ''));
  if (prova) {
    righe = righe.concat(_aCapo_('Per togliere davvero questi filtri: in Configurazione.gs metti ' +
      'provaSenzaModifiche: false ed esegui di nuovo EXTRA_togliFiltri.', '', ''));
  } else if (n) {
    righe = righe.concat(_aCapo_('Prima di togliere ogni filtro ne ho scritto una copia completa nel ' +
      'registro: con quella, se serve, lo rifai a mano (Gmail -> Impostazioni -> Filtri e indirizzi ' +
      'bloccati -> Crea un nuovo filtro).', '', ''));
  }
  var testo = righe.join('\n');
  if (!prova && cfg.inviaReport && (n || esito.nonRiusciti.length) &&
      _inviaReport_('Filtri di Gmail tolti', testo)) {
    testo += '\nLo stesso riepilogo, con le copie dei filtri, e\' nell\'email che ti sei appena mandato.';
  }
  Logger.log(testo);
  return testo;
}

/**
 * Le voci di filtriDaTogliere: buone (etichetta, criteri come li confronta
 * lo script e la loro impronta) e saltate, quelle senza etichetta o senza
 * criteri. Una voce senza criteri non e' un filtro, e non si cerca.
 */
function _vociFiltri_(cfg) {
  var fuori = { buone: [], saltate: [] };
  var elenco = cfg.filtriDaTogliere;
  if (!elenco || typeof elenco.length !== 'number') return fuori;
  for (var i = 0; i < elenco.length; i++) {
    var voce = elenco[i] || {};
    var etichetta = String(voce.etichetta || '').trim();
    var criteri = _criteriNormali_(voce.criteri);
    var quanti = 0;
    for (var k in criteri) quanti++;
    if (!etichetta || !quanti) {
      fuori.saltate.push(etichetta ? etichetta + ' (senza criteri)' : '(senza etichetta)');
      continue;
    }
    fuori.buone.push({ etichetta: etichetta, criteri: criteri, firma: _firmaFiltro_(etichetta, criteri) });
  }
  return fuori;
}

/**
 * Cerca e toglie (in prova soltanto cerca) i filtri delle voci. Per ogni
 * filtro trovato: la copia nel registro, poi la rimozione. Dice che cosa ha
 * tolto (le copie), che cosa non e' riuscito a togliere, quali voci non ha
 * trovato e quali aveva gia' tolto in un giro di prima.
 */
function _togliFiltri_(voci, prova) {
  var esito = { tolti: [], nonRiusciti: [], nonTrovati: [], giaTolti: [] };
  var etichette = {};                  // id -> { nome, sistema }
  var lista = Gmail.Users.Labels.list('me').labels || [];
  for (var i = 0; i < lista.length; i++) {
    etichette[lista[i].id] = { nome: String(lista[i].name), sistema: lista[i].type === 'system' };
  }
  var esistenti = Gmail.Users.Settings.Filters.list('me').filter || [];
  var memoria = _leggiMappa_(_CHIAVE_FILTRI_TOLTI);
  var oggi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  var visti = {};                      // un filtro che vale per due voci si toglie una volta
  var segnate = false;

  for (var v = 0; v < voci.length; v++) {
    var voce = voci[v], trovati = 0;
    var chi = voce.etichetta + ' (' + _righeCriteri_(voce.criteri, '').join('; ') + ')';
    for (var f = 0; f < esistenti.length; f++) {
      var filtro = esistenti[f];
      if (visti[filtro.id] || !_stessoFiltro_(filtro, voce, etichette)) continue;
      visti[filtro.id] = true;
      trovati++;
      var copia = _copiaFiltro_(filtro, etichette);
      if (prova) { esito.tolti.push(copia); continue; }
      Logger.log('COPIA DEL FILTRO CHE STO PER TOGLIERE. Per rifarlo: Gmail -> Impostazioni -> Filtri e ' +
                 'indirizzi bloccati -> Crea un nuovo filtro, con questi criteri e queste azioni.\n' + copia);
      try {
        Gmail.Users.Settings.Filters.remove('me', filtro.id);
        esito.tolti.push(copia);
        memoria[voce.firma] = oggi;
        segnate = true;
      } catch (errore) {
        esito.nonRiusciti.push(chi + ': ' + errore.message);
      }
    }
    if (trovati) continue;
    var quando = String(memoria[voce.firma] || '');
    if (quando) {
      esito.giaTolti.push(chi + (/^\d{8}$/.test(quando)
        ? ' (il ' + quando.slice(6, 8) + '/' + quando.slice(4, 6) + '/' + quando.slice(0, 4) + ')' : ''));
    } else {
      esito.nonTrovati.push(chi);
    }
  }
  if (segnate) {
    try { _salvaMappa_(_CHIAVE_FILTRI_TOLTI, memoria); }
    catch (errore2) {
      // i filtri sono tolti lo stesso: al prossimo giro risulteranno "non trovati"
      Logger.log('Filtri tolti, ma non ricordati (' + errore2.message + ').');
    }
  }
  return esito;
}

/** Vero se nel progetto c'e' il servizio avanzato "Gmail API" con i filtri. */
function _servizioFiltri_() {
  return _servizioGmail_() && !!Gmail.Users.Settings && !!Gmail.Users.Settings.Filters;
}

/**
 * Il filtro di Gmail e' quello della voce? Mette la sua etichetta (il nome,
 * senza badare alle maiuscole, come fa Gmail) e ha proprio i suoi criteri:
 * gli stessi, con gli stessi valori, e nessuno in piu'.
 */
function _stessoFiltro_(filtro, voce, etichette) {
  var aggiunte = (filtro.action || {}).addLabelIds || [];
  var cercata = voce.etichetta.toLowerCase(), sua = false;
  for (var i = 0; i < aggiunte.length; i++) {
    var e = etichette[aggiunte[i]];
    if (e && e.nome.trim().toLowerCase() === cercata) { sua = true; break; }
  }
  if (!sua) return false;
  var criteri = _criteriNormali_(filtro.criteria), k;
  for (k in criteri) {
    if (!Object.prototype.hasOwnProperty.call(voce.criteri, k) || criteri[k] !== voce.criteri[k]) return false;
  }
  for (k in voce.criteri) {
    if (!Object.prototype.hasOwnProperty.call(criteri, k)) return false;
  }
  return true;
}

/**
 * I criteri di un filtro come si confrontano: solo quelli che dicono
 * qualcosa (Gmail scrive anche hasAttachment: false, sizeComparison:
 * 'unspecified'), spazi in fila come uno solo, vero come 'true' e la
 * dimensione come numero.
 */
function _criteriNormali_(criteri) {
  var fuori = {};
  if (!criteri || typeof criteri !== 'object') return fuori;
  for (var k in criteri) {
    var v = criteri[k];
    if (v === null || v === undefined || v === false || v === '') continue;
    if (k === 'hasAttachment' || k === 'excludeChats') {
      if (v === true || String(v).toLowerCase() === 'true') fuori[k] = 'true';
      continue;
    }
    if (k === 'size') {
      var n = Number(v);
      if (n > 0) fuori[k] = String(n);
      continue;
    }
    var t = String(v).replace(/\s+/g, ' ').trim();
    if (k === 'sizeComparison') t = (t.toLowerCase() === 'unspecified') ? '' : t.toLowerCase();
    if (t) fuori[k] = t;
  }
  if (!fuori.size) delete fuori.sizeComparison;
  return fuori;
}

/**
 * Un'impronta di etichetta e criteri: otto cifre esadecimali (FNV-1a).
 * Serve a ricordare quali voci sono gia' state tolte senza scrivere nelle
 * proprieta' dello script indirizzi o parole dei tuoi filtri.
 */
function _firmaFiltro_(etichetta, criteri) {
  var chiavi = [];
  for (var k in criteri) chiavi.push(k);
  chiavi.sort();
  var testo = String(etichetta).trim().toLowerCase();
  for (var i = 0; i < chiavi.length; i++) testo += '\n' + chiavi[i] + '=' + criteri[chiavi[i]];
  var h = 0x811c9dc5;
  for (var j = 0; j < testo.length; j++) {
    h = (h ^ testo.charCodeAt(j)) >>> 0;
    // h * 16777619 (2^24 + 403) modulo 2^32, senza Math.imul: i conti restano sotto 2^53
    h = ((h << 24) + h * 403) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/** I criteri, una riga per criterio, con i nomi della finestra di Gmail (_NOMI_CRITERI). */
function _righeCriteri_(criteri, rientro) {
  var righe = [], fatti = { size: true, sizeComparison: true };
  for (var i = 0; i < _NOMI_CRITERI.length; i++) {
    var k = _NOMI_CRITERI[i][0];
    fatti[k] = true;
    if (!criteri[k]) continue;
    var siNo = (k === 'hasAttachment' || k === 'excludeChats');
    righe.push(rientro + _NOMI_CRITERI[i][1] + (siNo ? '' : ': ' + criteri[k]));
  }
  if (criteri.size) {
    righe.push(rientro + 'Dimensioni: ' +
      (criteri.sizeComparison === 'smaller' ? 'minore di ' : criteri.sizeComparison === 'larger' ? 'maggiore di ' : '') +
      _dimensione_(criteri.size));
  }
  // un criterio che Gmail aggiungera' un giorno: si scrive com'e'
  for (var altro in criteri) if (!fatti[altro]) righe.push(rientro + altro + ': ' + criteri[altro]);
  return righe;
}

function _dimensione_(byte) {
  var n = Number(byte);
  if (n % 1048576 === 0) return (n / 1048576) + ' MB';
  if (n % 1024 === 0) return (n / 1024) + ' KB';
  return n + ' byte';
}

/**
 * Vero se il filtro (criteri e azione, come lo creerebbe
 * EXTRA_creaFiltriGmail) e' una delle voci di filtriDaTogliere: stessa
 * etichetta e proprio gli stessi criteri (_stessoFiltro_).
 */
function _fraIScelti_(voci, filtro, etichette) {
  for (var i = 0; i < voci.length; i++) {
    if (_stessoFiltro_(filtro, voci[i], etichette)) return true;
  }
  return false;
}

// Le azioni dei filtri di Gmail che lo script non usa mai, con le parole della
// finestra "Crea un nuovo filtro" di Gmail: le etichette di sistema che un
// filtro aggiunge o toglie, e le altre chiavi della sua azione. Servono solo
// alla copia che EXTRA_togliFiltri scrive nel registro prima di togliere un
// filtro (_copiaFiltro_), per rifarlo a mano. Il controllo delle promesse
// (test/invarianti_script.js) lascia questi nomi, vietati in tutto il resto
// dello script, solo in questa tabella di testi, e solo _copiaFiltro_ la legge.
var _AZIONI_A_PAROLE = {
  aggiunge: {
    TRASH: 'Eliminalo (va nel cestino)',
    STARRED: 'Aggiungi stella',
    IMPORTANT: 'Contrassegna sempre come importante',
    CATEGORY_PERSONAL: 'Classifica come: Principale',
    CATEGORY_SOCIAL: 'Classifica come: Social',
    CATEGORY_PROMOTIONS: 'Classifica come: Promozioni',
    CATEGORY_UPDATES: 'Classifica come: Aggiornamenti',
    CATEGORY_FORUMS: 'Classifica come: Forum'
  },
  toglie: {
    INBOX: 'Salta la Posta in arrivo (archivia)',
    UNREAD: 'Segna come gia\' letto',
    SPAM: 'Non inviarlo mai in Spam',
    IMPORTANT: 'Non contrassegnarlo mai come importante'
  },
  altro: {
    forward: 'Inoltralo a: '
  }
};

/**
 * La copia di un filtro, per rifarlo a mano: i criteri e le azioni, con i
 * nomi delle etichette invece dei loro id e le azioni dette come nella
 * finestra di Gmail (_AZIONI_A_PAROLE). Un'azione che Gmail aggiungera' un
 * giorno si scrive con il nome che ha nel servizio Gmail API.
 */
function _copiaFiltro_(filtro, etichette) {
  var azione = filtro.action || {};
  var righe = ['Filtro di Gmail', '  Criteri:'].concat(_righeCriteri_(_criteriNormali_(filtro.criteria), '    '));
  righe.push('  Azioni:');
  var aggiunte = azione.addLabelIds || [], tolte = azione.removeLabelIds || [];
  for (var i = 0; i < aggiunte.length; i++) {
    var e = etichette[aggiunte[i]], a = _AZIONI_A_PAROLE.aggiunge[aggiunte[i]];
    if (typeof a === 'string') righe.push('    ' + a);
    else if (!e) righe.push('    Applica l\'etichetta con id ' + aggiunte[i] + ' (in Gmail non c\'e\' piu\')');
    else if (!e.sistema) righe.push('    Applica l\'etichetta: ' + e.nome);
    else righe.push('    Aggiunge ' + e.nome + ' (etichetta di sistema di Gmail)');
  }
  for (var j = 0; j < tolte.length; j++) {
    var d = etichette[tolte[j]], t = _AZIONI_A_PAROLE.toglie[tolte[j]];
    if (typeof t === 'string') righe.push('    ' + t);
    else if (d && !d.sistema) righe.push('    Toglie l\'etichetta: ' + d.nome);
    else righe.push('    Toglie ' + (d ? d.nome : tolte[j]) + ' (etichetta di sistema di Gmail)');
  }
  for (var k in azione) {
    if (k === 'addLabelIds' || k === 'removeLabelIds') continue;
    var valore = azione[k], parole = _AZIONI_A_PAROLE.altro[k];
    righe.push('    ' + (typeof parole === 'string' ? parole : k + ': ') +
               (valore && typeof valore === 'object' ? JSON.stringify(valore) : String(valore)));
  }
  return righe.join('\n');
}

/** Un testo di piu' righe dentro un elenco: "prima" davanti alla prima riga, "dopo" davanti alle altre. */
function _rientra_(testo, prima, dopo) {
  var righe = String(testo).split('\n');
  for (var i = 0; i < righe.length; i++) righe[i] = (i === 0 ? prima : dopo) + righe[i];
  return righe.join('\n');
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
  // Sono solo etichette dello script quelle sotto il gruppo, o quelle che si
  // e' segnato creandole. Senza memoria si contano quelle con i nomi delle
  // regole, che possono essere anche tue: il codice lo dice (T invece di S),
  // e Campanella allora non lo prende per "fatto"
  var soloSue = prefisso ? true : _etichetteCreate_().length > 0;

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
  // in coda: S o T e la versione dello script in cifre (1.5.0 = 10500)
  var codice = 'CMP1-' + oggi + '-' + nostre + '-' + automazione + '-' + conversazioni +
               '-' + (soloSue ? 'S' : 'T') + _versioneInCifre_(_POSTA_VERSIONE);

  var testo = 'Versione dello script: ' + _POSTA_VERSIONE +
              '\nEtichette dello strumento: ' + nostre +
              (soloSue ? '' : ' (anche quelle con gli stessi nomi che avevi gia\')') +
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
  // lo stesso blocco del riordino e degli invii degli orari: un'esecuzione in
  // corso, arrivata al tempo massimo, riprogrammerebbe la sua ripresa subito
  // dopo che l'ho tolta. Aspetto che finisca, poi tolgo quello che ha lasciato.
  var lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) {
    // senza il blocco non tocco niente, e non dico di aver spento qualcosa
    var occupato = 'Un\'altra esecuzione (il riordino della posta, lo smistamento o un invio degli ' +
                   'orari) sta lavorando proprio adesso: riprova fra un minuto. Non ho ancora spento niente.';
    Logger.log(occupato);
    return occupato;
  }
  var orari = 0;
  try {
    _rimuoviTrigger_(_TRIGGER_ORARIO);
    _rimuoviTrigger_(_TRIGGER_RIPRESA);
    // Orari.gs sta nello stesso progetto e anche le sue riprese (orari dei
    // docenti e orari delle classi) sono attivita' programmate: spegnere
    // l'automazione vuol dire spegnere tutto
    orari = _rimuoviTrigger_(_TRIGGER_ORARI) + _rimuoviTrigger_(_TRIGGER_ORARI_CLASSI);
  } finally {
    lock.releaseLock();
  }
  var testo ='Automazione spenta. Le etichette gia\' applicate restano dove sono.' +
              (orari ? '\nFermata anche la ripresa dell\'invio degli orari: se serve, riesegui ' +
                       'ORARI_2_invia (o ORARI_3_inviaOrariClassi, per gli orari delle classi), ' +
                       'che riparte da dove era arrivato.' : '');
  Logger.log(testo);
  return testo;
}

/**
 * Toglie dalle conversazioni le etichette applicate da questo strumento.
 * Senza gruppo svuota solo quelle che lo script ha creato e si e' segnato.
 */
function ANNULLA_etichettatura() {
  return _annullaEtichettatura_(false);
}

/**
 * Come ANNULLA_etichettatura, ma senza gruppo svuota tutte le etichette delle
 * regole accese, anche quelle con lo stesso nome che avevi fatto tu a mano:
 * lo script non sa distinguere i messaggi etichettati da te da quelli
 * etichettati da lui, e qui li tratta allo stesso modo. Serve soprattutto a
 * chi ha riordinato la posta con Campanella fino alla 1.4.6, il cui script
 * non si segnava le etichette che creava. Non cancella niente: toglie solo
 * le etichette, e le etichette restano nell'elenco di Gmail, vuote.
 */
function ANNULLA_etichettaturaCompleta() {
  return _annullaEtichettatura_(true);
}

function _annullaEtichettatura_(completa) {
  var cfg = _config_();
  var scadenza = Date.now() + _MAX_SECONDI_ESECUZIONE * 1000;
  var funzione = completa ? 'ANNULLA_etichettaturaCompleta' : 'ANNULLA_etichettatura';

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
  // La versione completa le svuota tutte, come faceva lo script fino alla 1.4.6.
  var prefisso = String(cfg.prefissoEtichette || '').replace(/\/+$/, '');
  var create = (prefisso || completa) ? null : _etichetteCreate_();
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

  // Senza gruppo e senza niente da togliere: le etichette delle regole ancora
  // piene non le ha create lo script (tipico di chi ha riordinato con la 1.4.6
  // o prima). "FATTO" farebbe credere che siano state svuotate.
  var niente = finito && !!create && _totale_(tolte) === 0 && nonSue.length > 0;

  // con tanta posta il tempo di Google finisce prima: va detto, altrimenti
  // sembra tutto a posto e le etichette rimaste non le toglie piu' nessuno
  var testo = (finito
      ? (niente
          ? 'NIENTE DA TOGLIERE: le etichette delle regole che hanno dei messaggi non le ha ' +
            'create questo script, quindi non ne ho tolta nessuna. Leggi qui sotto.'
          : 'FATTO: tolte ' + (completa
              ? 'tutte le etichette delle regole accese, anche quelle con lo stesso nome ' +
                'che avevi fatto tu a mano'
              : create ? 'le etichette create dallo script' : 'tutte le etichette delle regole attive') +
            '.') +
        '\n\n'
      : 'TEMPO SCADUTO A META\'. Esegui di nuovo ' + funzione + ', e ancora, ' +
        'finche\' non compare "FATTO" in cima.' +
        (completa ? '\nQuesta funzione toglie le etichette delle regole accese da tutti i messaggi, ' +
                    'anche da quelli a cui le avevi messe tu a mano.' : '') +
        '\n\n') +
    'Etichette tolte dalle conversazioni in questo giro:\n' + _riepilogo_(tolte) +
    (finito && !niente
      ? '\n\nLe etichette tolte restano nell\'elenco di Gmail, ma vuote: se vuoi puoi ' +
        'cancellarle da Gmail -> Impostazioni -> Etichette.'
      : '') +
    (nonSue.length
      ? '\n\nNon toccate, perche\' non le ha create lo script: ' + nonSue.join(', ') + '.\n' +
        'C\'erano gia\' (le avevi fatte tu), oppure le ha create una versione di prima dello ' +
        'script (Campanella fino alla 1.4.6), che non se lo segnava. Lo script non sa ' +
        'distinguere i messaggi etichettati da te da quelli etichettati da lui, quindi non ' +
        'toglie niente.\n' +
        'Per svuotarle lo stesso esegui ANNULLA_etichettaturaCompleta: toglie le etichette ' +
        'delle regole accese da tutti i messaggi, anche da quelli a cui le avevi messe tu a ' +
        'mano. Se invece erano solo dello script puoi anche cancellarle da Gmail -> ' +
        'Impostazioni -> Etichette: i messaggi restano.'
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
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (err) { e = ''; }
  // in un trigger getActiveUser puo' tornare vuoto: allora vale l'utente
  // effettivo, che in uno script personale e' sempre il titolare dell'account
  // (come in _mioIndirizzoOrari_ di Orari.gs)
  if (!e) {
    try { e = Session.getEffectiveUser().getEmail(); } catch (err2) { e = ''; }
  }
  return e || '(sconosciuto)';
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

/** "1.5.0" diventa 10500: nel codice di stato vanno solo lettere e cifre. */
function _versioneInCifre_(versione) {
  var p = String(versione).split('.');
  return (parseInt(p[0], 10) || 0) * 10000 + (parseInt(p[1], 10) || 0) * 100 + (parseInt(p[2], 10) || 0);
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

/**
 * Crea un'etichetta, se lo segna e le da' il colore della sua regola (se il
 * servizio Gmail API c'e'). "colori", facoltativo, conta com'e' andata.
 */
function _creaEtichetta_(nome, colori) {
  var etichetta = GmailApp.createLabel(nome);
  var create = _etichetteCreate_();
  if (create.indexOf(nome) < 0) {
    create.push(nome);
    _salvaCreate_(create);
  }
  var esito = _coloraNuova_(nome);
  if (colori && esito) colori[esito] = (colori[esito] || 0) + 1;
  return etichetta;
}

/**
 * Da' a un'etichetta appena creata il colore della sua regola. Senza il
 * servizio Gmail API resta del colore di Gmail; un colore che Gmail non
 * accetta si salta. Un errore qui non ferma il riordino: finisce nel
 * registro. Dice com'e' andata ('' se la regola non ha un colore).
 * Con il servizio si segna anche l'id dell'etichetta nata qui: se poi la
 * cancelli e ne fai un'altra con lo stesso nome, quella e' tua.
 */
function _coloraNuova_(nome) {
  var colore = _coloreDellEtichetta_(_config_(), nome);
  var ammesso = _coloreAmmesso_(colore);
  if (!_servizioGmail_()) return !colore ? '' : (ammesso ? 'senzaServizio' : 'sbagliati');
  try {
    var tutte = _etichetteGmail_();
    var inGmail = tutte[nome];
    if (!inGmail) throw new Error('il servizio Gmail API non la trova');
    _segnaIdCreata_(nome, inGmail.id);
    if (!colore) return '';
    if (!ammesso) return 'sbagliati';
    _applicaColore_(inGmail.id, colore, tutte);
    return 'messi';
  } catch (errore) {
    if (!colore) return '';
    if (!ammesso) return 'sbagliati';
    Logger.log('Etichetta "' + nome + '": colore non applicato (' + errore.message + ').');
    return 'falliti';
  }
}

/** L'id di ogni etichetta nata qui, se il servizio Gmail API c'era: nome -> id. */
function _idCreate_() {
  return _leggiMappa_(_CHIAVE_CREATE_ID);
}

function _segnaIdCreata_(nome, id) {
  try {
    var mappa = _idCreate_();
    if (mappa[nome] === id) return;
    mappa[nome] = id;
    _salvaMappa_(_CHIAVE_CREATE_ID, mappa);
  } catch (errore) {
    // l'etichetta c'e' lo stesso: vale ancora il nome, come fino alla 1.5.2
    Logger.log('Etichetta "' + nome + '": id non ricordato (' + errore.message + ').');
  }
}

/**
 * Il colore che lo script ha dato a ogni etichetta, per id: 'sfondo/testo'.
 * Cosi' un colore che ha dato lui si puo' cambiare quando cambi quello
 * della regola, e uno che poi gli hai cambiato tu resta tuo.
 */
function _coloriDati_() {
  return _leggiMappa_(_CHIAVE_COLORI);
}

function _leggiMappa_(chiave) {
  var raw = PropertiesService.getUserProperties().getProperty(chiave);
  if (!raw) return {};
  try {
    var mappa = JSON.parse(raw);
    return (mappa && typeof mappa === 'object' && typeof mappa.length !== 'number') ? mappa : {};
  } catch (e) { return {}; }
}

function _salvaMappa_(chiave, mappa) {
  PropertiesService.getUserProperties().setProperty(chiave, JSON.stringify(mappa));
}

/** Quello che lo script si e' segnato delle etichette, letto una volta sola. */
function _memoriaEtichette_() {
  return { create: _etichetteCreate_(), ids: _idCreate_(), colori: _coloriDati_() };
}

/**
 * Il colore che ha adesso l'etichetta l'ha dato lo script? Vero se l'ha
 * creata lui (la stessa etichetta: se ne ricorda l'id, deve essere quello;
 * le versioni fino alla 1.5.2 si segnavano solo il nome) o se ha ancora il
 * colore che lui le aveva dato. "memoria" viene da _memoriaEtichette_.
 */
function _coloreDelloScript_(memoria, nome, id, adesso) {
  var suoId = memoria.ids[nome];
  if (memoria.create.indexOf(nome) >= 0 && (!suoId || suoId === id)) return true;
  var dato = memoria.colori[id];
  return !!dato && !!adesso && dato === _scriviColore_(adesso.backgroundColor, adesso.textColor);
}

/** Un colore come lo ricorda lo script: 'sfondo/testo', in minuscolo. */
function _scriviColore_(sfondo, testo) {
  return (String(sfondo || '') + '/' + String(testo || '')).toLowerCase();
}

// ---------------------------------------------------------------------------
//  I colori delle etichette, con il servizio avanzato "Gmail API". In
//  Configurazione.gs un colore e' { sfondo: "#16a766", testo: "#000000" }.
// ---------------------------------------------------------------------------

/** Vero se nel progetto c'e' il servizio avanzato "Gmail API" (Servizi -> "+"). */
function _servizioGmail_() {
  return typeof Gmail !== 'undefined' && !!Gmail && !!Gmail.Users && !!Gmail.Users.Labels;
}

/** Vero se sfondo e testo sono tutti e due fra i colori che Gmail accetta. */
function _coloreAmmesso_(colore) {
  return !!colore && typeof colore === 'object' &&
    _COLORI_GMAIL.indexOf(String(colore.sfondo || '').toLowerCase()) >= 0 &&
    _COLORI_GMAIL.indexOf(String(colore.testo || '').toLowerCase()) >= 0;
}

function _descriviColore_(colore) {
  if (!colore || typeof colore !== 'object') return 'colore scritto male: ' + String(colore);
  return 'sfondo ' + String(colore.sfondo) + ', testo ' + String(colore.testo);
}

/** Il colore che l'etichetta ha in Gmail e' gia' quello scelto? */
function _stessoColore_(adesso, colore) {
  return !!adesso &&
    String(adesso.backgroundColor || '').toLowerCase() === String(colore.sfondo).toLowerCase() &&
    String(adesso.textColor || '').toLowerCase() === String(colore.testo).toLowerCase();
}

/** Il colore della regola accesa che mette quell'etichetta (gruppo compreso), o null. */
function _coloreDellEtichetta_(cfg, nome) {
  var regole = _regoleAttive_(cfg);
  for (var i = 0; i < regole.length; i++) {
    if (regole[i].colore && _etichettaCompleta_(cfg, regole[i]) === nome) return regole[i].colore;
  }
  return null;
}

/**
 * Le tue etichette secondo il servizio Gmail API: nome -> { id }. L'elenco
 * non dice i colori: li dice Gmail.Users.Labels.get, un'etichetta alla volta.
 */
function _etichetteGmail_() {
  var mappa = {};
  var lista = Gmail.Users.Labels.list('me').labels || [];
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].type && lista[i].type !== 'user') continue;
    mappa[lista[i].name] = { id: lista[i].id };
  }
  return mappa;
}

/**
 * Cambia il colore di un'etichetta: sfondo e testo insieme, come vuole Gmail.
 * Poi se lo segna (vedi _coloriDati_), e dimentica le etichette che in
 * "esistenti" (nome -> { id }) non ci sono piu'. Mai in modalita' prova:
 * chi la chiama la salta.
 */
function _applicaColore_(id, colore, esistenti) {
  var sfondo = String(colore.sfondo).toLowerCase(), testo = String(colore.testo).toLowerCase();
  Gmail.Users.Labels.patch({ color: { backgroundColor: sfondo, textColor: testo } }, 'me', id);
  try {
    var dati = _coloriDati_(), restano = {};
    for (var nome in esistenti) {
      var altro = esistenti[nome].id;
      if (dati[altro]) restano[altro] = dati[altro];
    }
    restano[id] = _scriviColore_(sfondo, testo);
    _salvaMappa_(_CHIAVE_COLORI, restano);
  } catch (errore) {
    // il colore c'e': se non riesco a segnarmelo, al prossimo cambio sembrera' tuo
    Logger.log('Colore di "' + id + '" applicato ma non ricordato (' + errore.message + ').');
  }
}

/** Dimentica le etichette create qui che nel frattempo hai cancellato da Gmail. */
function _potaCreate_() {
  var create = _etichetteCreate_();
  var restano = [];
  for (var i = 0; i < create.length; i++) {
    if (GmailApp.getUserLabelByName(create[i])) restano.push(create[i]);
  }
  if (restano.length !== create.length) _salvaCreate_(restano);
  // e il loro id: una che rifai tu con lo stesso nome non e' nata qui
  var ids = _idCreate_(), idRestano = {}, tolti = false;
  for (var nome in ids) {
    if (restano.indexOf(nome) >= 0) idRestano[nome] = ids[nome];
    else tolti = true;
  }
  if (tolti) _salvaMappa_(_CHIAVE_CREATE_ID, idRestano);
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
