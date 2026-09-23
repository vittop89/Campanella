/* =========================================================================
   CONFIGURAZIONE DI "ORGANIZZAZIONE GMAIL" - DATI INVENTATI PER LE PROVE
   Ha la stessa forma di quella generata da Campanella (strumento Posta,
   passo 5). Dominio e persone non esistono: servono a test/mock_apps_script.js.
   ========================================================================= */

var CONFIG = {

  // ---- l'impronta di queste scelte ------------------------------------
  //  PASSO_1_anteprima la scrive in cima; Campanella (Posta, passo 5)
  //  mostra quella di adesso. Se sono diverse, copia di nuovo questo file.
  impronta: "A1B2C3D4",

  // ---- la tua scuola ---------------------------------------------------
  dominioScuola:     "scuola-esempio.edu.it",
  prefissoEtichette: "Scuola",

  // ---- come lavorare ---------------------------------------------------
  provaSenzaModifiche: true,   // true = conta soltanto, non tocca niente
  soloUltimiMesi:      0,       // 0 = tutta la posta
  ogniQuanteOre:       1,
  giorniPostaNuova:    3,
  inviaReport:         true,
  escludiPostaInviata: true,
  escludiGiaArchiviati: false,
  anniDaEsaminare:     3,       // per EXTRA_elencaIndirizziScuola

  // ---- il personale della scuola (2 indirizzi) ----
  personale: [
    "mario.rossi@scuola-esempio.edu.it",     // ROSSI MARIO - Docente laureato
    "anna.deluca@scuola-esempio.edu.it"      // DE LUCA ANNA - Assistente amministrativo
  ],

  // ---- lo stesso personale, diviso per ruolo ----
  //  Da qui nascono le sottoetichette Colleghi/Docenti, Colleghi/Amministrativi...
  gruppi: {
    "Docenti": [        // 1 indirizzo
      "mario.rossi@scuola-esempio.edu.it"
    ],
    "Amministrativi": [        // 1 indirizzo
      "anna.deluca@scuola-esempio.edu.it"
    ]
  },

  // ---- le regole: le etichette si sommano, l'ordine conta solo per escludiEtichette
  //  @PERSONALE@ = l'elenco qui sopra   ·   @DOMINIO@ = tutto il dominio
  //  colore = sfondo e testo dell'etichetta in Gmail, dalla tavolozza di Gmail:
  //  li mette il servizio Gmail API (EXTRA_coloraEtichette).
  regole: [
    {
      attiva:    true,
      etichetta: "Dirigenza",
      da:        ["preside@scuola-esempio.edu.it"],
      colore:    { sfondo: "#cc3a21", testo: "#ffffff" },
      nota:      "Messaggi del dirigente scolastico e dei collaboratori."
    },
    {
      attiva:    true,
      etichetta: "Segreteria",
      da:        ["segreteria@scuola-esempio.edu.it"],
      colore:    { sfondo: "#ffad47", testo: "#000000" },
      nota:      "Segreteria didattica e del personale."
    },
    {
      attiva:    true,
      etichetta: "Circolari",
      oggetto:   ["circolare", "circolari", "circ.", "comunicazione n"],
      colore:    { sfondo: "#fad165", testo: "#000000" },
      nota:      "Messaggi che hanno \"circolare\" nell'oggetto, da chiunque arrivino."
    },
    {
      attiva:    true,
      etichetta: "Registro elettronico",
      da:        ["@spaggiari.eu"],
      colore:    { sfondo: "#2da2bb", testo: "#000000" },
      nota:      "Avvisi automatici del registro."
    },
    {
      attiva:    true,
      etichetta: "Colleghi",
      da:        ["@PERSONALE@"],
      colore:    { sfondo: "#4a86e8", testo: "#000000" },
      nota:      "Messaggi delle persone dell'elenco del personale."
    },
    {
      attiva:    true,
      etichetta: "Colleghi/Docenti",
      da:        ["@GRUPPO:Docenti@"],
      colore:    { sfondo: "#a4c2f4", testo: "#000000" },
      nota:      "Docenti: 1 indirizzo dall'elenco del personale."
    },
    {
      attiva:    true,
      etichetta: "Colleghi/Amministrativi",
      da:        ["@GRUPPO:Amministrativi@"],
      colore:    { sfondo: "#6d9eeb", testo: "#000000" },
      nota:      "Amministrativi: 1 indirizzo dall'elenco del personale."
    },
    {
      attiva:    true,
      etichetta: "Studenti",
      da:        ["@DOMINIO@"],
      escludiEtichette: ["Colleghi", "Dirigenza", "Segreteria"],
      colore:    { sfondo: "#16a766", testo: "#000000" },
      nota:      "Tutto il resto che arriva dal dominio della scuola."
    },
    {
      attiva:    true,
      etichetta: "Ministero e USR",
      da:        ["@istruzione.it", "@posta.istruzione.it", "@miur.it", "@mim.gov.it"],
      colore:    { sfondo: "#434343", testo: "#ffffff" },
      nota:      "Comunicazioni ministeriali e degli uffici scolastici regionali."
    },
    {
      attiva:    true,
      etichetta: "Sindacati",
      da:        ["@flcgil.it", "@cislscuola.it", "@uilscuola.it", "@snals.it", "@anief.net", "@gildains.it"],
      archivia:  true,
      colore:    { sfondo: "#8e63ce", testo: "#000000" },
      nota:      "Comunicati sindacali, archiviati."
    },
    {
      attiva:    false,
      etichetta: "Formazione e corsi",
      oggetto:   ["corso", "formazione", "webinar", "aggiornamento", "seminario"],
      colore:    { sfondo: "#43d692", testo: "#000000" },
      nota:      "Parte spenta."
    },
    {
      attiva:    true,
      etichetta: "Orari",
      oggetto:   ["orario"],
      colore:    { sfondo: "#f691b3", testo: "#000000" },
      nota:      "Gli orari mandati dallo strumento Orari."
    },
    {
      attiva:    true,
      etichetta: "Newsletter",
      queryLibera: "category:promotions OR unsubscribe",
      archivia:  true,
      colore:    { sfondo: "#999999", testo: "#000000" },
      nota:      "Promozioni e messaggi con il link per disiscriversi, archiviati."
    },
    {
      attiva:    false,
      etichetta: "Genitori",
      colore:    { sfondo: "#a46a21", testo: "#ffffff" },
      nota:      "Parte spenta."
    }
  ]
};
