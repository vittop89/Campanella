# Nota tecnica — Campanella

Strumento personale per l'organizzazione della casella Google Workspace di un
docente. Documento da allegare alla comunicazione al dirigente scolastico e
al Responsabile della protezione dei dati (DPO).

| | |
|---|---|
| **Nome** | Campanella, versione 1.2 |
| **Chi lo usa** | un singolo docente, sul proprio account Google Workspace istituzionale |
| **Codice sorgente** | pubblico, licenza MIT: https://github.com/vittop89/Campanella |
| **Autore** | Vittorio Pantaleo (progetto indipendente, senza rapporti con Google, Gruppo Spaggiari Parma o altri fornitori citati) |
| **Referente per questa comunicazione** | *[nome e cognome, disciplina, indirizzo istituzionale]* |

## 1. Che cos'è

Campanella è un programma per Windows che **prepara del testo**: il codice e la
configurazione di uno script Google Apps Script che il docente incolla nel
proprio account e fa partire di persona. Lo script gira interamente dentro
l'account Google Workspace della scuola, sull'infrastruttura di Google già
contrattualizzata dall'istituto; il programma sul computer non accede né alla
posta né al Drive.

Quattro funzioni, tutte facoltative e indipendenti:

1. **Posta** — crea in Gmail delle etichette (Dirigenza, Segreteria, Circolari,
   Colleghi, Studenti, Ministero, Sindacati, Newsletter…) e le applica ai
   messaggi già ricevuti e a quelli futuri, per riordinare la casella.
2. **Cartelle** — crea sul Drive del docente la struttura di cartelle
   dell'anno scolastico (classi, materie, recuperi) e vi copia i suoi modelli.
3. **Orari** — legge il tabellone degli orari (file Excel) e, tramite lo
   script, invia **al docente stesso** una email per ogni docente con la
   relativa griglia (per ritrovare l'orario di un collega cercandone il
   cognome in Gmail) e inserisce **il proprio** orario in Google Calendar.
4. **Privacy** — toglie i dati personali da testi e file prima di darli a un
   assistente di intelligenza artificiale, usando rizzo-pii, un modello
   open source che gira sul computer del docente senza collegamento in rete.

## 2. Che cosa non fa

- **Non cancella nulla**: nessuna funzione elimina messaggi, file o eventi.
  L'unica azione sulla posta oltre all'etichettatura è l'archiviazione
  (rimozione dalla Posta in arrivo, reversibile), attivata solo per le
  categorie che il docente sceglie (di partenza: newsletter e comunicati
  sindacali).
- **Non invia messaggi ad altre persone**: le uniche email che lo script
  manda hanno come destinatario lo stesso account in cui gira (riepiloghi e
  orari).
- **Non trasferisce dati a terzi**: lo script non contiene chiamate a servizi
  esterni (nessun uso di `UrlFetchApp`), non usa servizi di terze parti e non
  condivide nulla. Il programma sul computer non raccoglie statistiche e si
  collega a internet solo quando l'utente preme un pulsante per verificare o
  scaricare rizzo-pii dal suo sito di pubblicazione (GitHub).
- **Non crea trattamenti nuovi**: i dati sono quelli già presenti
  nell'account istituzionale del docente (mittenti, oggetti, etichette) e il
  tabellone orario già distribuito dalla scuola.

## 3. Dati personali coinvolti e dove risiedono

| Dato | Origine | Dove sta | Chi lo vede |
|---|---|---|---|
| Elenco del personale (nominativo, ruolo, indirizzo istituzionale dei colleghi) | rubrica/registro elettronico, oppure i mittenti già presenti nella casella | nel file di configurazione dello script dentro l'account Google del docente; e sul computer del docente, oppure — scelta consigliata — in un file dentro la cartella del Drive istituzionale | solo il docente |
| Indirizzi di dirigenza e segreteria | pubblici nel sito della scuola | come sopra | solo il docente |
| Etichette applicate ai messaggi | generate dallo script | nell'account Gmail del docente | solo il docente |
| Tabellone orario (cognomi, classi, ore) | file distribuito dalla scuola | nel file dei dati dello script e nel file dati di Campanella; le email con gli orari nella casella del docente; gli eventi del proprio orario in Google Calendar | solo il docente |
| Testi e file dati alla funzione Privacy | scelti dal docente | elaborati sul computer, senza rete; le copie anonimizzate dove il docente le salva | solo il docente |

Nessun dato di categorie particolari (art. 9 GDPR) è richiesto o estratto
dall'applicazione. La corrispondenza può contenerne, ma lo script non ne
legge il contenuto per scopi diversi dall'applicazione delle etichette, che
si basa su mittente, oggetto e ricerca di Gmail.

## 4. Autorizzazioni richieste allo script

Alla prima esecuzione Google mostra la schermata di autorizzazione dello
script (con l'avviso «app non verificata», normale per gli script personali
non pubblicati). Le autorizzazioni sono determinate dalle funzioni usate:

- **Gmail** (`GmailApp`): ricerca dei messaggi, creazione e applicazione di
  etichette, archiviazione, invio di email al proprio indirizzo. Apps Script
  richiede per `GmailApp` l'ambito completo di Gmail; il codice ne usa solo
  le operazioni elencate, tutte leggibili nel sorgente.
- **Trigger** (`ScriptApp`): per riprendere da solo il lavoro quando supera il
  tempo massimo di esecuzione e per lo smistamento periodico dei nuovi
  messaggi. Si disattivano con `ANNULLA_automazione`.
- **Google Calendar** (`CalendarApp`), solo se si usa la funzione
  `ORARI_4_calendario`: crea o usa un calendario con il nome scelto e vi
  inserisce gli eventi del proprio orario, marcati con un contrassegno; la
  funzione di annullamento rimuove solo quelli.
- **Gmail API** (servizio avanzato), solo se il docente sceglie di creare i
  filtri nativi di Gmail (passo facoltativo).

Non vengono richiesti: accesso al Drive, accesso a servizi esterni, accesso a
dati di altri utenti del dominio. L'amministratore del Workspace può in ogni
momento limitare o revocare l'esecuzione di script nel dominio; il docente
può revocare l'accesso da https://myaccount.google.com/permissions.

## 5. Misure di sicurezza e reversibilità

- La prima esecuzione del riordino è sempre in **modalità prova**: conta i
  messaggi che verrebbero etichettati, senza modificare nulla, nemmeno le
  etichette.
- Ogni funzione ha la sua **funzione di annullamento** (`ANNULLA_…`): toglie
  le etichette applicate, spegne l'automazione, rimuove gli eventi dal
  calendario. I messaggi archiviati restano in «Tutti i messaggi».
- Lo script usa un **blocco di esecuzione** per non far girare due copie
  contemporaneamente, e in caso di errore in una regola passa alla
  successiva senza interrompere il resto.
- Il programma sul computer non richiede diritti di amministratore, non tocca
  il registro di sistema (salvo la voce «Programmi installati», se si usa
  l'installer), non contiene componenti di rete.
- Le **condizioni d'uso** che l'utente accetta all'installazione ricordano che
  il titolare dei dati è la scuola, che i dati degli studenti restano fuori
  dal computer, e che i testi dati a un'IA vanno prima anonimizzati.

## 6. Come si disattiva tutto

1. Nell'editor dello script: eseguire `ANNULLA_automazione` (spegne i
   trigger), `ANNULLA_etichettatura` (toglie le etichette dai messaggi),
   `ORARI_ANNULLA_calendario` (toglie gli eventi).
2. Eliminare il progetto Apps Script dal Drive e revocare l'accesso da
   https://myaccount.google.com/permissions.
3. Disinstallare Campanella dalle Impostazioni di Windows (App installate) e,
   se si vuole, cancellare il file dei dati (`campanella-dati.json`) dalla
   cartella del Drive.

## 7. Verificabilità

Il codice degli script è visibile per intero nell'editor di Apps Script, nel
progetto del docente. Il codice dell'applicazione e degli script è pubblicato
su GitHub con licenza MIT, insieme ai banchi di prova che simulano Gmail e
Calendar per verificarne il comportamento senza toccare un account vero.
Il referente è a disposizione per mostrarlo o per fornire ulteriori dettagli.
