/* =========================================================================
   CONFIGURAZIONE DI "ORGANIZZAZIONE GMAIL" - DATI INVENTATI PER LE PROVE
   Ha la stessa forma di quella generata da Campanella (strumento Posta,
   passo 5). Dominio e persone non esistono: servono a test/mock_apps_script.js.
   ========================================================================= */

var CONFIG = {

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

  // ---- le regole, in ordine di priorita' -------------------------------
  //  @PERSONALE@ = l'elenco qui sopra   ·   @DOMINIO@ = tutto il dominio
  regole: [
    {
      attiva:    true,
      etichetta: "Dirigenza",
      da:        ["preside@scuola-esempio.edu.it"],
      nota:      "Messaggi del dirigente scolastico e dei collaboratori."
    },
    {
      attiva:    true,
      etichetta: "Segreteria",
      da:        ["segreteria@scuola-esempio.edu.it"],
      nota:      "Segreteria didattica e del personale."
    },
    {
      attiva:    true,
      etichetta: "Circolari",
      oggetto:   ["circolare", "circolari", "circ.", "comunicazione n"],
      nota:      "Messaggi che hanno \"circolare\" nell'oggetto, da chiunque arrivino."
    },
    {
      attiva:    true,
      etichetta: "Registro elettronico",
      da:        ["@spaggiari.eu"],
      nota:      "Avvisi automatici del registro."
    },
    {
      attiva:    true,
      etichetta: "Colleghi",
      da:        ["@PERSONALE@"],
      nota:      "Messaggi delle persone dell'elenco del personale."
    },
    {
      attiva:    true,
      etichetta: "Colleghi/Docenti",
      da:        ["@GRUPPO:Docenti@"],
      nota:      "Docenti: 1 indirizzo dall'elenco del personale."
    },
    {
      attiva:    true,
      etichetta: "Colleghi/Amministrativi",
      da:        ["@GRUPPO:Amministrativi@"],
      nota:      "Amministrativi: 1 indirizzo dall'elenco del personale."
    },
    {
      attiva:    true,
      etichetta: "Studenti",
      da:        ["@DOMINIO@"],
      escludiEtichette: ["Colleghi", "Dirigenza", "Segreteria"],
      nota:      "Tutto il resto che arriva dal dominio della scuola."
    },
    {
      attiva:    true,
      etichetta: "Ministero e USR",
      da:        ["@istruzione.it", "@posta.istruzione.it", "@miur.it", "@mim.gov.it"],
      nota:      "Comunicazioni ministeriali e degli uffici scolastici regionali."
    },
    {
      attiva:    true,
      etichetta: "Sindacati",
      da:        ["@flcgil.it", "@cislscuola.it", "@uilscuola.it", "@snals.it", "@anief.net", "@gildains.it"],
      archivia:  true,
      nota:      "Comunicati sindacali, archiviati."
    },
    {
      attiva:    false,
      etichetta: "Formazione e corsi",
      oggetto:   ["corso", "formazione", "webinar", "aggiornamento", "seminario"],
      nota:      "Parte spenta."
    },
    {
      attiva:    true,
      etichetta: "Orari",
      oggetto:   ["orario"],
      nota:      "Gli orari mandati dallo strumento Orari."
    },
    {
      attiva:    true,
      etichetta: "Newsletter",
      queryLibera: "category:promotions OR unsubscribe",
      archivia:  true,
      nota:      "Promozioni e messaggi con il link per disiscriversi, archiviati."
    },
    {
      attiva:    false,
      etichetta: "Genitori",
      nota:      "Parte spenta."
    }
  ]
};
