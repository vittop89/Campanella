/* =========================================================================
   DATI DEGLI ORARI - DATI INVENTATI PER LE PROVE
   Stessa forma di quelli generati da Campanella (strumento Orari). Cognomi
   e classi non esistono: servono a test/mock_orari.js.
   Sei docenti, quattro classi, cinque giorni per sei ore; le celle sono
   in ordine "prima tutte le ore del giorno 1, poi del giorno 2..."
   ========================================================================= */

var ORARI = {
  periodo:  "orario dal 14 settembre 2026",
  titolo:   "TABELLONE DOCENTI",
  nota:     "Orario provvisorio: eventuali variazioni vengono comunicate per circolare.",
  oggettoDocente: "Orario {docente}",
  oggettoClasse:  "Orario classe {classe}",
  ore:      6,
  giorni:   ["Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'"],

  // 6 docenti
  docenti: [
    { nome: "BIANCHI",
      celle: ["1A","1A","2B","","","",  "3C","3C","","","","",  "","","","","","",  "","","","1A","1A","",  "D","2B","","","",""] },
    { nome: "DE GIULI",
      celle: ["","","","4D","4D","",  "","","","","","",  "2B","","","","","",  "","3C","","","","",  "","","","","","1A"] },
    { nome: "GIALLI",
      celle: ["","","","","","",  "","","","","","",  "","","","","","",  "","","","","","",  "","","","","",""] },
    { nome: "NERI",
      celle: ["","","","","","D",  "","","","","","",  "","","","","","",  "","","","","","",  "","","","","",""] },
    { nome: "ROSSI",
      celle: ["","2B","2B","","","",  "1A","","","4D","","",  "3C","3C","3C","","","",  "","","","","2B","2B",  "","","1A","","",""] },
    { nome: "VERDI",
      celle: ["4D","","","","","",  "","","2B","2B","","",  "","","","","","",  "1A","","","","","",  "","","","3C","3C",""] }
  ],

  // 4 classi
  classi: [
    { nome: "1A",
      celle: ["BIANCHI","BIANCHI","","","","",  "ROSSI","","","","","",  "","","","","","",  "VERDI","","","BIANCHI","BIANCHI","",  "","","ROSSI","","","DE GIULI"] },
    { nome: "2B",
      celle: ["","ROSSI","ROSSI + BIANCHI","","","",  "","","VERDI","VERDI","","",  "DE GIULI","","","","","",  "","","","","ROSSI","ROSSI",  "","BIANCHI","","","",""] },
    { nome: "3C",
      celle: ["","","","","","",  "BIANCHI","BIANCHI","","","","",  "ROSSI","ROSSI","ROSSI","","","",  "","DE GIULI","","","","",  "","","","VERDI","VERDI",""] },
    { nome: "4D",
      celle: ["VERDI","","","DE GIULI","DE GIULI","",  "","","","ROSSI","","",  "","","","","","",  "","","","","","",  "","","","","",""] }
  ],

  // l'orario da mettere su Google Calendar (ORARI_4_calendario, ORARI_5_cambioOrario)
  calendario: {
    docente:   "ROSSI",
    nome:      "Orario ROSSI",
    inizio:    "2026-09-14",     // un lunedi'
    fine:      "2027-06-10",
    minutiOra: 60,
    inizioOre: ["08:00", "09:00", "10:00", "11:10", "12:10", "13:10"],
    colore:    "BLUE",
    // il colore delle lezioni di ogni classe (CalendarApp.EventColor, da 1 a
    // 11): 4D non ne ha uno, e le sue lezioni hanno il colore del calendario
    colori:    { "1A": "11", "2B": "9", "3C": "10" },
    // i giorni senza lezione: feste isolate, un ponte, vacanze lunghe. Pasqua e
    // Pasquetta stanno da sole (niente vacanze di Pasqua): Pasquetta spezza i
    // blocchi del lunedi' e lascia interi quelli del mercoledi'
    sospensioni: [
      { dal: "2026-11-01", al: "2026-11-01", nome: "Tutti i Santi" },
      { dal: "2026-12-07", al: "2026-12-07", nome: "Ponte dell'Immacolata" },
      { dal: "2026-12-08", al: "2026-12-08", nome: "Immacolata" },
      { dal: "2026-12-23", al: "2027-01-06", nome: "Vacanze di Natale" },
      { dal: "2027-02-15", al: "2027-02-16", nome: "Carnevale" },
      { dal: "2027-03-28", al: "2027-03-28", nome: "Pasqua" },
      { dal: "2027-03-29", al: "2027-03-29", nome: "Lunedi' dell'Angelo" },
      { dal: "2027-04-25", al: "2027-04-25", nome: "Festa della Liberazione" },
      { dal: "2027-05-01", al: "2027-05-01", nome: "Festa del Lavoro" },
      { dal: "2027-06-02", al: "2027-06-02", nome: "Festa della Repubblica" }
    ],
    // i colloqui con le famiglie (ORARI_4_calendario; se cambiano, ORARI_7_colloqui):
    // il ricevimento del giovedi', a tratti fra i giorni senza lezione e quelli
    // senza colloqui, una giornata dentro il periodo senza colloqui (c'e' lo
    // stesso). Link inventati. test/mock_orari.js li prova nelle sue sezioni dei
    // colloqui, con i suoi; questi alla fine
    colloqui: {
      settimanali: [
        { giorno: "giovedi", dalle: "10:10", alle: "11:10", dal: "", al: "", nome: "Ricevimento",
          link: "https://meet.google.com/abc-defg-hij" }
      ],
      singoli: [
        { data: "2026-12-15", dalle: "15:00", alle: "18:00", nome: "Colloqui generali",
          link: "https://meet.google.com/kmn-pqrs-tuv" }
      ],
      sospensioni: [
        { dal: "2026-12-14", al: "2027-01-09" }
      ]
    },
    coloreColloqui: "5",         // Banana, che le classi non usano
    validoDal: "2026-10-05"      // l'orario cambiato vale da qui (ORARI_5_cambioOrario), un lunedi'
  }
};
