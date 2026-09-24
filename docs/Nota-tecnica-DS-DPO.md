# Nota tecnica — Campanella

Strumento personale per l'organizzazione della casella Google Workspace di un
docente. Documento da allegare alla comunicazione al dirigente scolastico e
al Responsabile della protezione dei dati (DPO).

| | |
|---|---|
| **Nome** | Campanella (la versione in uso si legge in Impostazioni) |
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

Requisiti e limiti: Windows; un account Google Workspace (non funziona con
Microsoft 365); l'estrazione dell'elenco del personale è specifica per il
registro ClasseViva di Spaggiari e legge soltanto la pagina già visibile al
docente autenticato, senza interrogare altri sistemi; il tabellone orario è
l'export di Orario Facile o una tabella docente/giorno/ora/classe.

Quattro funzioni, tutte facoltative e indipendenti:

1. **Posta** — crea in Gmail delle etichette (Dirigenza, Segreteria, Circolari,
   Colleghi, Studenti, Ministero, Sindacati, Newsletter…) e le applica ai
   messaggi già ricevuti e a quelli futuri, per riordinare la casella.
   Facoltativamente, un'etichetta per ogni classe del docente (per esempio
   «Classi 2026-27/3B»), per i messaggi con la classe nell'oggetto o mandati
   dagli studenti della classe, i cui indirizzi il docente incolla nel
   progetto dello script (punto 3).
   Con lo stesso elenco del personale, «Scrivere a un gruppo» aiuta a
   scrivere a una categoria di colleghi (per esempio gli assistenti
   amministrativi): copia i loro indirizzi negli appunti e apre in Gmail un
   messaggio nuovo e vuoto, dove il docente li incolla in copia nascosta
   (Ccn), scrive e invia di persona. Gli indirizzi non passano dal
   collegamento aperto nel browser, e Campanella chiede a Windows di non
   tenerli nella cronologia degli appunti e di non sincronizzarli con altri
   dispositivi.
2. **Cartelle** — crea sul Drive del docente la struttura di cartelle
   dell'anno scolastico (classi, materie, recuperi) e vi copia i suoi modelli.
   Per i moduli Google del docente (per esempio quello delle iscrizioni ai
   recuperi) prepara un secondo script, da incollare dentro il modulo: ogni
   anno crea il foglio delle risposte nella cartella dell'anno, vi collega il
   modulo e, a fine anno, chiude il modulo e scollega il foglio.
3. **Orari** — legge il tabellone degli orari (file Excel) e, tramite lo
   script, invia **al docente stesso** una email per ogni docente con la
   relativa griglia (per ritrovare l'orario di un collega cercandone il
   cognome in Gmail) e inserisce **il proprio** orario in Google Calendar,
   senza lezioni nei giorni senza lezione indicati dal docente e, quando
   l'orario cambia, con l'orario nuovo da una data in poi.
4. **Privacy** — toglie i dati personali da testi e file prima di darli a un
   assistente di intelligenza artificiale, usando rizzo-pii, un modello
   open source che gira sul computer del docente senza collegamento in rete.

## 2. Che cosa non fa

- **Non cancella dati**: nessuna funzione elimina messaggi, file del docente,
  cartelle o fogli delle risposte. Toglie soltanto ciò che gli strumenti
  hanno messo, e solo quando il docente esegue una funzione di annullamento
  (punto 6): le etichette dai messaggi, che restano vuote nell'elenco di
  Gmail, e gli eventi dell'orario creati dallo script, riconoscibili da un
  contrassegno. Nel cambio d'orario (`ORARI_5_cambioOrario`, eseguita dal
  docente) accorcia le serie dell'orario messe dallo script perché finiscano
  il giorno prima della data indicata e toglie quelle che cominciano da
  quella data in poi: sempre e solo eventi con il contrassegno, e mai prima
  dell'inizio del periodo indicato (gli anni scolastici precedenti nello
  stesso calendario restano).
  Nel foglio di controllo dei moduli toglie la scheda vuota «Foglio1» che
  Google crea con ogni foglio nuovo (solo se è ancora vuota e con il nome di
  partenza) e il contenuto della propria scheda «Istruzioni», che riscrive a
  ogni esecuzione. Un'eccezione, facoltativa e spenta di
  partenza: lo script dei moduli può togliere dal modulo le risposte degli
  anni precedenti, e lo fa solo dopo aver ritrovato ogni risposta, una per
  una e dall'ora in cui è arrivata, in un foglio degli anni scorsi; se ne
  manca anche una non tocca niente e lo segnala. È l'unica cancellazione di
  dati che non si può annullare.
  L'altra eccezione riguarda le impostazioni della casella, non i messaggi:
  lo script della posta, solo se il docente lo esegue con il servizio
  facoltativo Gmail API (`EXTRA_togliFiltri`), toglie i filtri di Gmail che
  il docente aveva già e che ha scelto uno per uno in Campanella: soltanto
  quelli, cioè un filtro con proprio quei criteri che mette proprio
  quell'etichetta, e ognuno solo dopo averne scritto una copia completa nel
  registro dell'esecuzione (e nel riepilogo per email al docente stesso, se
  attivo). Non tocca gli altri filtri, le etichette né i messaggi. La
  rimozione di un filtro non si annulla da script: con quella copia il
  docente lo ricrea a mano.
  Il programma sul computer cancella soltanto il proprio file dei dati
  (`campanella-dati.json`): quando il docente, dalle Impostazioni e dopo una
  conferma, sposta i dati in un'altra cartella del Drive o di nuovo sul
  computer, oppure sceglie di usare un file dei dati già presente nel Drive,
  toglie la copia di prima; se quella copia non l'ha letta, o nel frattempo
  l'ha cambiata un altro computer, la lascia e lo segnala.
  L'unica azione sulla posta oltre all'etichettatura è l'archiviazione
  (rimozione dalla Posta in arrivo, reversibile), attivata solo per le
  categorie che il docente sceglie (di partenza: newsletter e comunicati
  sindacali). Una regola può anche segnare i messaggi come letti, se il
  docente lo sceglie; di partenza nessuna lo fa.
- **Non invia messaggi ad altre persone**: le uniche email che lo script
  manda hanno come destinatario lo stesso account in cui gira (riepiloghi e
  orari). «Scrivere a un gruppo» non invia niente: il messaggio lo scrive e
  lo invia il docente, da Gmail.
- **Non trasferisce dati a terzi**: lo script non contiene chiamate a servizi
  esterni (nessun uso di `UrlFetchApp`), non usa servizi di terze parti e non
  condivide nulla. Il programma sul computer non raccoglie statistiche e si
  collega a internet solo quando l'utente preme un pulsante: «Cerca
  aggiornamenti» chiede a GitHub (api.github.com) l'ultima versione
  pubblicata di Campanella e di rizzo-pii, senza scaricare niente; «Scarica
  e installa rizzo-pii» scarica da GitHub l'installer di rizzo-pii e, prima
  di avviarlo, ne controlla la dimensione e, quando GitHub la pubblica,
  l'impronta SHA-256. Campanella non si aggiorna da sola: se c'è una
  versione nuova lo dice e rimanda alla pagina dei rilasci. Con rizzo-pii il
  programma parla soltanto a un indirizzo di questo computer (localhost,
  127.0.0.1 o ::1), anche quando Impostazioni controlla all'apertura se il
  servizio è avviato: un indirizzo diverso viene rifiutato prima di aprire
  la connessione, e le richieste non passano da proxy né seguono
  reindirizzamenti.
- **Non crea trattamenti nuovi**: i dati sono quelli già presenti
  nell'account istituzionale del docente (mittenti, oggetti, etichette) e il
  tabellone orario già distribuito dalla scuola; per le etichette delle
  classi, se il docente le usa, gli indirizzi degli studenti delle sue
  classi, che ha già nel corso di Classroom o nei gruppi della scuola.

## 3. Dati personali coinvolti e dove risiedono

| Dato | Origine | Dove sta | Chi lo vede |
|---|---|---|---|
| Elenco del personale (nominativo, ruolo, indirizzo istituzionale dei colleghi) | rubrica/registro elettronico, oppure i mittenti già presenti nella casella | nel file di configurazione dello script dentro l'account Google del docente; e sul computer del docente, oppure — scelta consigliata — in un file dentro la cartella del Drive istituzionale (in quel caso il file delle impostazioni sul computer non contiene nomi). Gli indirizzi che lo script ricava dalla casella (`EXTRA_elencaIndirizziScuola`) arrivano in un'email al docente stesso, e finiscono nel registro delle esecuzioni di Apps Script, che resta nell'account per il tempo stabilito da Google, solo se quell'email non parte. Le righe senza spunta (per esempio indirizzi di studenti trovati nella casella) non entrano nella configurazione dello script, ma restano nel file dei dati finché il docente non le toglie («Togli le righe senza spunta»). Con «Scrivere a un gruppo», gli indirizzi di una categoria passano per gli appunti di Windows, esclusi dalla cronologia | solo il docente |
| Indirizzi di dirigenza e segreteria | pubblici nel sito della scuola | come sopra | solo il docente |
| Etichette applicate ai messaggi | generate dallo script | nell'account Gmail del docente | solo il docente |
| Filtri di Gmail che il docente sceglie di togliere (etichetta e criteri, che possono contenere indirizzi; quelli che sembrano di una classe e hanno indirizzi non si possono scegliere, e quelli scelti prima, con la 1.5.3 o prima di creare le classi, Campanella li toglie dalla scelta all'avvio e non li scrive nel file di configurazione, per non portare in Campanella indirizzi di studenti) | l'esportazione dei filtri che il docente scarica da Gmail e apre in Campanella; il file resta dove il docente l'ha salvato, e Campanella dice che si può cancellare dopo averlo aperto | solo i filtri scelti, nel file dei dati di Campanella insieme all'elenco del personale (sul computer o nel Drive istituzionale, come sopra) e nel file di configurazione dello script; prima di togliere un filtro, lo script ne scrive una copia nel registro delle esecuzioni e, se il riepilogo è attivo, nell'email al docente stesso; nelle proprietà dello script resta solo un'impronta numerica dei filtri tolti, senza indirizzi né parole | solo il docente |
| Indirizzi email degli studenti delle classi del docente (facoltativi, per le etichette delle classi) | incollati dal docente in Campanella, per esempio dall'elenco del corso in Classroom; Campanella toglie quelli del personale (con la spunta nell'elenco, dirigenza e segreteria) | solo nel file `Classe_….gs` di ogni classe, nel progetto Apps Script del docente (account istituzionale), dove servono solo alle ricerche dello smistamento; il file vale solo per l'etichetta per cui è stato copiato e dice il giorno della copia; con un'etichetta madre senza l'anno la finestra ricorda di ricopiarlo ogni anno scolastico, e anteprima, riordino e smistamento avvisano se è di un anno passato. Campanella non li conserva: non sono nel file delle impostazioni, nel file dei dati né nel file di configurazione dello script, dove la regola ha solo un segnaposto, e un indirizzo scritto fra le parole dell'oggetto viene scartato. Dal programma passano per gli appunti di Windows, esclusi dalla cronologia: restano negli appunti fino alla copia successiva, e chiudendo la finestra Campanella propone di svuotarli; non vengono mai scritti su un file del computer. Lo script non li scrive nel registro delle esecuzioni, nei riepiloghi né nei messaggi d'errore (al più quanti sono), e non li mette nei filtri nativi di Gmail, che per le classi cercano solo l'oggetto. L'anteprima elenca i file che nessuna regola usa. Per toglierli si cancella il file | solo il docente |
| Tabellone orario (cognomi, classi, ore) | file distribuito dalla scuola | nel file dei dati dello script e nel file dati di Campanella; le email con gli orari nella casella del docente; gli eventi del proprio orario in Google Calendar, con il cognome scelto nella descrizione | solo il docente |
| Giorni senza lezione del proprio orario (date e un nome, testo libero: servono le chiusure della scuola, ma il docente può scriverci altro) | il docente, dalla circolare sul calendario scolastico | nel file dati di Campanella, insieme ai dati personali (con i dati nel Drive, non nel file delle impostazioni sul computer); le righe riconosciute, con data e nome, nel file dei dati dello script | solo il docente |
| Risposte ai moduli Google del docente (per esempio iscrizioni ai recuperi) | compilate da studenti o famiglie nel modulo del docente | nel modulo e nel foglio Google delle risposte, dentro il Drive istituzionale del docente; lo script ne legge solo il numero e l'ora di arrivo (per ritrovarle nei fogli degli anni scorsi prima di un eventuale svuotamento) e collega i fogli, non ne legge il contenuto | il docente, e chi il docente decide di far accedere al foglio |
| Testi e file dati alla funzione Privacy | scelti dal docente | elaborati sul computer, senza rete, da rizzo-pii raggiunto solo a un indirizzo locale; le copie anonimizzate dove il docente le salva, mai sopra gli originali | solo il docente |

Nessun dato di categorie particolari (art. 9 GDPR) è richiesto o estratto
dall'applicazione. La corrispondenza può contenerne, ma lo script non ne
legge il contenuto per scopi diversi dall'applicazione delle etichette, che
si basa su mittente, oggetto e ricerca di Gmail.

## 4. Autorizzazioni richieste allo script

Alla prima esecuzione Google mostra la schermata di autorizzazione dello
script. Con un account personale compare anche l'avviso «app non
verificata», normale per gli script non pubblicati; con un account del
dominio dell'istituto, per uno script di proprietà dello stesso utente, la
documentazione di Google prevede la procedura ordinaria, senza avviso. Le autorizzazioni le calcola Google leggendo il codice di tutti i file del progetto, e le chiede tutte insieme alla prima esecuzione, qualunque sia la funzione eseguita:

- **Gmail** (`GmailApp`): ricerca dei messaggi, creazione e applicazione di
  etichette, archiviazione e, per le regole che lo prevedono, il segno di
  «letto» sui messaggi. Apps Script richiede per `GmailApp` l'ambito
  completo di Gmail; il codice ne usa solo le operazioni elencate, tutte
  leggibili nel sorgente.
- **Invio di email** (`MailApp`): i riepiloghi e gli orari, sempre e solo al
  proprio indirizzo.
- **Indirizzo del docente** (`Session`): per sapere a quale indirizzo, il
  proprio, mandare riepiloghi e orari.
- **Trigger** (`ScriptApp`): per riprendere da solo il lavoro quando supera il
  tempo massimo di esecuzione (il riordino della posta, i due invii degli
  orari, ai docenti e alle classi, e l'orario sul calendario, anche nel
  cambio d'orario, che riprende anche quando Google chiede di rallentare) e
  per lo smistamento periodico dei nuovi messaggi. Le riprese sono attivazioni
  singole, un minuto dopo, della stessa funzione. Si disattivano tutti con
  `ANNULLA_automazione`, che segna anche come fermato un lavoro a metà sul
  calendario (una ripresa già partita non lo riprende); quelli del
  calendario anche con `ORARI_ANNULLA_calendario`.
- **Google Calendar** (`CalendarApp`): se nel progetto c'è anche il file
  degli orari, Google chiede questo permesso per tutto il progetto alla prima
  autorizzazione, anche se il docente usa solo le email. Lo usano soltanto
  `ORARI_4_calendario`, che crea o usa un calendario del docente con il nome
  scelto, scritto esattamente così (non un calendario di altri a cui è
  iscritto), e vi inserisce gli eventi del proprio orario, marcati con un
  contrassegno e senza i giorni senza lezione indicati dal docente (se
  Google non salva il contrassegno di una serie appena creata, alla ripresa
  lo script lo rimette a quella serie, riconosciuta da titolo, descrizione e
  prima lezione, e solo se ce n'è una sola così);
  `ORARI_5_cambioOrario`, che quando l'orario cambia accorcia le serie già
  messe perché finiscano il giorno prima della data indicata (o le toglie,
  se cominciano da quella data in poi) e inserisce l'orario nuovo da quella
  data; e `ORARI_ANNULLA_calendario`, che rimuove solo quelli, nel periodo
  indicato. Il cambio d'orario accorcia o toglie soltanto eventi con il
  contrassegno; l'annullamento anche quelli con la descrizione che comincia
  con «[Campanella]» (se Google non ha salvato il contrassegno, oppure una
  copia fatta a mano dal docente di una lezione). Gli altri eventi del
  calendario non li tocca. `test/invarianti_script.js` controlla sul codice
  che nessun'altra funzione possa prendere un calendario o un evento, né
  cambiarlo o toglierlo, e che fra gli eventi da accorciare o togliere
  finiscano solo quelli riconosciuti così. Controlla anche che i due
  script, che stanno nello stesso progetto, non usino le funzioni l'uno
  dell'altro: quello della posta non arriva al calendario, quello degli
  orari non arriva agli indirizzi degli studenti delle classi.
- **Gmail API** (servizio avanzato), solo se il docente lo aggiunge (passo
  facoltativo): per creare i filtri nativi di Gmail, per dare alle etichette
  dello script i colori scelti in Campanella e per togliere i filtri di Gmail
  che il docente ha scelto in Campanella fra quelli che aveva già
  (`EXTRA_togliFiltri`, descritta al punto 2).

Questo script non richiede: accesso al Drive, accesso a servizi esterni,
accesso a dati di altri utenti del dominio.

Lo **script dei moduli** è un progetto Apps Script separato, legato al singolo
modulo Google in cui viene incollato, con autorizzazioni proprie che non si
sommano a quelle dello script della posta:

- **Moduli** (`FormApp`): legge lo stato del modulo (foglio collegato, numero
  di risposte, aperto o chiuso), lo collega al foglio dell'anno, lo riapre e,
  a fine anno, lo chiude e scollega il foglio. Per la sola verifica descritta
  al punto 2 legge l'ora di arrivo di ogni risposta. Il codice apre soltanto
  il modulo in cui si trova, ma il permesso dipende dal manifest
  (`appsscript.json`), facoltativo, che l'applicazione prepara da mettere
  prima della prima esecuzione: senza manifest Google ricava i permessi dal
  codice e concede l'ambito completo di Google Moduli, cioè su tutti i
  moduli dell'account; con il manifest, che per i moduli elenca solo
  l'ambito limitato al modulo corrente (`forms.currentonly`), il permesso
  vale solo per quel modulo.
- **Fogli** (`SpreadsheetApp`): crea il foglio delle risposte dell'anno e, per
  la sola verifica descritta al punto 2, legge nei fogli degli anni
  precedenti la colonna con l'ora di arrivo delle risposte.
- **Drive** (`DriveApp`): cerca o crea la cartella dell'anno dentro «Il mio
  Drive» del docente e vi sposta il foglio appena creato. Apps Script non
  offre per questo un ambito più stretto di quello completo di Drive; il
  codice usa solo le operazioni elencate. Il docente può generare una
  versione dello script **senza questa parte**: in quel caso l'autorizzazione
  per Drive non viene chiesta e il foglio lo sposta a mano.
- **Trigger** (`ScriptApp`): la chiusura di fine anno e, se la chiusura non
  riesce, un nuovo tentativo ogni ora, con al massimo un tentativo in
  sospeso; `MODULO_ANNULLA` li rimuove.

Lo script dei moduli non invia email, non contatta servizi esterni, non
condivide file e non modifica le domande del modulo.

Se i moduli sono più di uno, l'applicazione può generare in alternativa un
**foglio di controllo**: lo stesso lavoro, ma lo script risiede in un foglio
Google e opera sui moduli elencati in una sua scheda. Poiché in questo caso
apre moduli esterni al file che lo ospita, Apps Script richiede sempre
l'ambito completo di Google Moduli (tutti i moduli dell'account), lo stesso
che riceve lo script dentro il modulo senza manifest, e l'ambito limitato
al modulo corrente non è disponibile; lo script apre soltanto quelli
elencati, e il codice è leggibile. Usa inoltre i Fogli (la scheda con
l'elenco, i fogli delle risposte e, per la verifica del punto 2, l'ora di
arrivo delle risposte nei fogli degli anni precedenti), Drive (per trovare
i moduli per nome, cercare o creare le cartelle dell'anno e mettervi i
fogli; questa variante non ha una versione senza Drive) e le attività
programmate: una chiusura per ogni data diversa e, se una chiusura non
riesce, un nuovo tentativo ogni ora. Le chiusure scattano da sole, nel
giorno indicato, e `PANNELLO_ANNULLA` le rimuove. L'applicazione segnala la
differenza e consiglia lo script dentro il modulo quando i moduli sono
pochi.

L'esecuzione di script Apps Script è una funzione del Google Workspace che
l'amministratore del dominio può consentire o bloccare per tutti gli utenti:
se è consentita, lo script si autorizza con la procedura standard di Google;
se è bloccata, non parte. L'amministratore può in ogni momento limitare o
revocare l'esecuzione di script nel dominio, e il docente può revocare
l'accesso concesso allo script da https://myaccount.google.com/permissions.
*[Nel dominio dell'istituto l'esecuzione risulta consentita: verificato
eseguendo lo script il [data].]*

## 5. Misure di sicurezza e reversibilità

- La prima esecuzione del riordino è sempre in **modalità prova**: conta i
  messaggi che verrebbero etichettati, senza modificare nulla, nemmeno le
  etichette.
- Ogni script ha le sue **funzioni di annullamento** (punto 6): tolgono le
  etichette applicate, spengono l'automazione, rimuovono gli eventi dal
  calendario, tolgono le chiusure programmate dei moduli. Senza un'etichetta
  di gruppo, `ANNULLA_etichettatura` toglie solo le etichette che lo script
  ha creato e si è segnato: quelle con lo stesso nome che il docente aveva
  già, o create da versioni precedenti dello script, le elenca senza
  toccarle, e se non ne trova di sue dice «NIENTE DA TOGLIERE». Per svuotare
  anche quelle c'è `ANNULLA_etichettaturaCompleta`, che toglie dai messaggi
  le etichette di tutte le regole attive, comprese quelle con lo stesso nome
  messe a mano dal docente. I messaggi archiviati restano in «Tutti i
  messaggi». Due cose le funzioni `ANNULLA_` non le annullano: i filtri
  nativi di Gmail, se il docente li ha creati, si tolgono a mano dalle
  impostazioni di Gmail oppure con `EXTRA_togliFiltri`, dopo averli scelti
  in Campanella; i messaggi che una regola ha segnato come letti restano
  letti. Un filtro tolto con `EXTRA_togliFiltri` non si rimette da script:
  si ricrea a mano dalla copia che lo script ha scritto nel registro prima
  di toglierlo, e `EXTRA_creaFiltriGmail` non ricrea i filtri scelti per
  essere tolti.
- Lo script usa un **blocco di esecuzione** per non far girare due copie
  contemporaneamente, e in caso di errore in una regola passa alla
  successiva senza interrompere il resto. Anche `ANNULLA_automazione`
  aspetta che le altre esecuzioni dello script finiscano prima di togliere
  i trigger.
- Il programma sul computer non richiede diritti di amministratore, non tocca
  il registro di sistema (salvo la voce «Programmi installati», se si usa
  l'installer), e si collega alla rete solo nei casi descritti al punto 2.
- Le **condizioni d'uso** che l'utente accetta all'installazione o al primo
  avvio (e di nuovo quando cambiano) ricordano che il titolare dei dati è la
  scuola, che i dati particolari degli studenti (certificazioni, PDP e PEI,
  relazioni) restano fuori dal computer, e che i testi
  dati a un'IA vanno prima anonimizzati. Descrivono anche il foglio di
  controllo dei moduli, con il permesso su tutti i moduli dell'account e le
  chiusure che scattano da sole, e dicono che anche lo script dentro il
  modulo, senza il manifest facoltativo, riceve il permesso su tutti i
  moduli dell'account.

## 6. Come si disattiva tutto

1. Nell'editor dello script della posta: eseguire `ANNULLA_automazione`
   (spegne i trigger: lo smistamento periodico, la ripresa del riordino e le
   riprese degli invii degli orari, `ORARI_2_invia` e
   `ORARI_3_inviaOrariClassi`, e del calendario, `ORARI_4_calendario` e
   `ORARI_5_cambioOrario`), `ANNULLA_etichettatura` (toglie dai messaggi
   le etichette create dallo script; `ANNULLA_etichettaturaCompleta` per
   quelle nate con versioni precedenti o con lo stesso nome di etichette del
   docente, come spiegato al punto 5), `ORARI_ANNULLA_calendario` (toglie
   gli eventi del periodo indicato nei dati degli orari e dimentica un
   lavoro a metà sul calendario, con le sue riprese; se si ferma per il
   tempo massimo o per i limiti di Google, lo dice e va rieseguito).
2. Se il docente ha creato i filtri nativi di Gmail (passo facoltativo),
   cancellarli a mano da Gmail → Impostazioni → Filtri e indirizzi bloccati,
   oppure esportarli, sceglierli in Campanella (Posta, passo 4) ed eseguire
   `EXTRA_togliFiltri`, che toglie solo i filtri scelti. Quelli delle classi
   cercano solo l'oggetto e si scelgono come gli altri; un filtro con degli
   indirizzi (fatto a mano) sotto un'etichetta che sembra di una classe
   (l'ultima parte finisce con una classe, come «3B», «Classe 3B», «Inglese
   3B» o «3B 2025-26», o una madre con la parola «classi» o usata per le
   classi) Campanella non lo lascia scegliere, e si toglie da Gmail; una
   classe seguita da altre parole («3B Inglese») non basta, e un filtro così
   con gli studenti il docente non deve sceglierlo. Il file esportato si
   può cancellare dopo averlo aperto. I messaggi segnati come letti da una
   regola restano letti.
3. Se usa lo script dei moduli: eseguire `MODULO_ANNULLA` in ogni modulo in
   cui l'ha incollato; se usa il foglio di controllo, `PANNELLO_ANNULLA`
   (menu Campanella del foglio). Tolgono le chiusure programmate e
   scollegano i fogli dell'anno, che restano nel Drive.
4. Eliminare il progetto Apps Script della posta dal Drive e revocare
   l'accesso da https://myaccount.google.com/permissions, anche quello
   concesso agli script dei moduli. Con il progetto spariscono anche i file
   `Classe_….gs` con gli indirizzi degli studenti, che non stanno altrove
   (nemmeno nei filtri nativi di Gmail); per toglierli prima basta cancellare
   quei file.
5. Disinstallare Campanella dalle Impostazioni di Windows (App installate) e,
   se si vuole, cancellare il file dei dati (`campanella-dati.json`) dalla
   cartella del Drive.

## 7. Verificabilità

Il codice degli script è visibile per intero nell'editor di Apps Script, nel
progetto del docente. Il codice dell'applicazione e degli script è pubblicato
su GitHub con licenza MIT, insieme ai banchi di prova che simulano Gmail e
Calendar per verificarne il comportamento senza toccare un account vero.
Il referente è a disposizione per mostrarlo o per fornire ulteriori dettagli.
