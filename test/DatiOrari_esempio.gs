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
    validoDal: "2026-10-05"      // l'orario cambiato vale da qui (ORARI_5_cambioOrario), un lunedi'
  }
};
