# Modello di email per il dirigente scolastico e il DPO

Da adattare: sostituisci le parti fra parentesi quadre, togli quello che non
ti riguarda, allega la nota tecnica (file «Nota tecnica per dirigente e
DPO»). È una comunicazione, non una richiesta con silenzio-assenso: dici cosa
fai, ti rendi disponibile e chiedi se il regolamento della scuola prevede
qualcosa. Se prevede un'autorizzazione, aspettala.

---

**A:** [indirizzo del dirigente scolastico]
**Cc:** [indirizzo del DPO], [eventualmente: animatore digitale / amministratore del Workspace]
**Oggetto:** Comunicazione: uso di uno script personale (Google Apps Script) per organizzare la mia casella istituzionale

Gentile Dirigente,
e per conoscenza al Responsabile della protezione dei dati,

Le scrivo per informarLa che, per organizzare meglio la mia casella di posta
istituzionale e i miei materiali di lavoro, intendo utilizzare uno strumento
personale, Campanella, che opera esclusivamente all'interno del mio account
Google Workspace dell'istituto. Allego una nota tecnica che ne descrive nel
dettaglio funzionamento, dati coinvolti e autorizzazioni; in sintesi:

- **cosa fa**: applica delle etichette ai messaggi della mia casella
  (dirigenza, segreteria, circolari, colleghi, studenti…), crea sul mio Drive
  le cartelle dell'anno scolastico, mi invia — al mio stesso indirizzo — le
  griglie orarie dei docenti ricavate dal tabellone già distribuito, e inserisce
  il mio orario nel mio Google Calendar;
- **dove gira**: dentro il mio account Google Workspace istituzionale, tramite
  uno script Google Apps Script che autorizzo ed eseguo io stesso. Il codice
  non contatta servizi esterni, non trasmette dati a terzi e non condivide
  nulla con altri utenti;
- **cosa non fa**: non cancella messaggi né file, non invia messaggi ad altre
  persone (le uniche email partono verso il mio stesso indirizzo), non tratta
  dati di studenti o famiglie per finalità diverse da quelle già proprie della
  corrispondenza istituzionale;
- **dati di colleghi**: per distinguere i messaggi dei colleghi da quelli degli
  studenti lo strumento usa l'elenco del personale (nominativo, ruolo e
  indirizzo istituzionale), che conservo [nella cartella del Drive
  istituzionale / esclusivamente nel mio account] e che cancellerò quando non
  sarà più necessario;
- **strumento per l'IA**: lo stesso programma include una funzione che
  rimuove localmente, sul mio computer e senza collegamento in rete, i dati
  personali da un testo prima di sottoporlo a un assistente di intelligenza
  artificiale. La uso proprio per evitare che dati di terzi escano
  dall'istituto.

Sono consapevole che il titolare del trattamento di questi dati è l'istituto
e che opero sotto la sua autorità e secondo le sue istruzioni. Per questo Le
chiedo cortesemente di indicarmi se il regolamento d'istituto o le regole
d'uso del Workspace prevedono, per uno strumento di questo tipo, una
specifica autorizzazione o adempimenti ulteriori: in tal caso attenderò le
Sue indicazioni prima di attivarlo. In assenza di prescrizioni particolari,
intendo utilizzarlo come descritto.

Il codice è pubblico (https://github.com/vittop89/Campanella) e resto a
disposizione per mostrarlo o per qualunque chiarimento, anche al DPO.

Cordiali saluti,

[Nome e Cognome]
[Disciplina / ruolo]
[Indirizzo istituzionale]

---

## Perché è scritta così

- **«Comunicazione» e non «richiesta di autorizzazione con silenzio-assenso»**:
  il GDPR non prevede un'autorizzazione del DPO per i singoli strumenti, ma
  ti obbliga a seguire le istruzioni della scuola (art. 29 e 32, par. 4 GDPR;
  art. 2-quaterdecies del Codice privacy). L'email dice cosa fai e chiede se
  esistono istruzioni in merito: è l'unica domanda che ha senso.
- **Niente scadenza unilaterale**: un termine di 15 giorni «trascorso il quale
  procedo» non produce alcun effetto giuridico e suona come un fatto compiuto.
- **Niente affermazioni imprecise**: lo script non lavora «offline» (gira sui
  server di Google, dentro il Workspace della scuola) e i server non sono
  «della scuola» ma del suo fornitore contrattualizzato. Sono le due frasi che
  un DPO attento contesterebbe per prime.
- **La funzione di anonimizzazione è descritta per quello che è**: uno
  strumento locale, separato dallo script, che serve a non far uscire dati
  dall'istituto. Non è un'autorizzazione a usare l'IA su documenti della
  scuola: quella, se serve, va chiesta a parte.
