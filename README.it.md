# Campanella

*[English](README.md)*

Quattro strumenti per la vita digitale di un docente, in una sola applicazione
Windows: un eseguibile da poche centinaia di KB, nessuna dipendenza, nessun
runtime da installare.

| Strumento    | Cosa fa |
|--------------|---------|
| **Posta**    | riordina la casella Gmail in etichette (dirigenza, segreteria, circolari, colleghi, studenti…), sulla posta già ricevuta e su quella futura |
| **Cartelle** | crea nel Drive la struttura del nuovo anno scolastico — classi, materie, recuperi — e ci copia i modelli |
| **Orari**    | legge il tabellone degli orari da un file Excel, manda **a te stesso** una email per ogni docente con il suo orario (per ritrovarlo cercando il cognome in Gmail) e mette il tuo orario su Google Calendar |
| **Privacy**  | le regole su dati della scuola e IA, gli strumenti per togliere i dati personali (testo per un assistente, con ripristino della risposta; file da ripulire) e i documenti per dirigenza e DPO |

L'applicazione **non tocca mai la posta, il calendario né il Drive da sola**:
prepara il codice e la configurazione di uno script Google Apps Script che
l'utente incolla nel proprio account. È l'utente a premere Esegui, sempre.
Lo script non scrive a nessun altro: le uniche email partono verso lo stesso
account in cui gira.

L'eseguibile si collega alla rete solo su richiesta esplicita dell'utente:
per chiedere a GitHub l'ultima versione di rizzo-pii e per scaricarla. Non
manda dati a nessuno, non raccoglie statistiche, non controlla niente
all'avvio.

## Per chi è, e per chi no

- Docenti con un account **Google Workspace for Education**: Gmail, Drive,
  Calendar. Con una scuola su Microsoft 365 non fa niente.
- **Windows** 10 o 11. Niente Mac, niente Linux.
- L'elenco del personale si legge dal registro **ClasseViva di Spaggiari**,
  pagina "Tutto il personale", con l'estensione per Chrome o con la funzione
  per la Console. Con Argo, Axios, Nuvola o altri registri le due cose non
  trovano niente: l'elenco si incolla a mano (quasi qualunque formato va
  bene), si chiede in segreteria, oppure lo si fa leggere allo script dai
  mittenti veri della casella, che è il metodo più preciso.
- Il tabellone degli orari è l'export "TABELLONE DOCENTI" di **Orario
  Facile**, oppure una tabella Docente / Giorno / Ora / Classe. Altri formati
  vanno prima ridotti a questa.
- Tutto in italiano: interfaccia, documenti, script.

## Installazione, per chi la usa

`Installa Campanella.exe` si porta dentro l'applicazione come risorsa.
Installa in `%LOCALAPPDATA%\Programs\Campanella`, quindi **senza diritti di
amministratore e senza UAC**; crea i collegamenti nel menu Start e si registra
fra i programmi installati, così si disinstalla dalle Impostazioni di Windows
come qualunque altro. Il disinstallatore è una copia dello stesso eseguibile:
siccome un programma non può cancellare sé stesso mentre gira, si ricopia in
`%TEMP%` e da lì fa pulizia.

Prima di copiare qualsiasi cosa mostra le **condizioni d'uso** e chiede due
spunte distinte — avvertenze sui dati e esclusione di responsabilità. Le stesse
condizioni ricompaiono al primo avvio se l'applicazione viene copiata a mano
invece che installata; l'accettazione è registrata in `campanella.json` con
data e versione (`Consenso.Versione`: alzarla ripropone il testo a tutti).

L'installer copia anche, nella cartella `documenti`, la **nota tecnica**, il
**modello di email** per dirigente e DPO e la **spiegazione del GDPR**
(vedi `docs/`), e offre di scaricare **rizzo-pii** (≈1,2 GB) dalla pagina dei
rilasci su GitHub. rizzo-pii non è incorporato: pesa più di mille volte
l'applicazione, e tenerlo separato vuol dire poterlo aggiornare per conto suo.

C'è anche uno script per **Inno Setup** (`installer/Campanella.iss`,
multilingue italiano/inglese) pensato per la pubblicazione su GitHub con
firma tramite SignPath: vedi più sotto.

## Uso portabile

L'applicazione **è già portabile per costruzione**: non tocca il registro (lo fa
solo l'installer, per la voce in "App installate"), non ha dipendenze oltre al
.NET Framework di Windows, e scrive `campanella.json` e `struttura.json`
**accanto al proprio eseguibile**.

Due limiti da conoscere:

- **rizzo-pii non è portabile** (1,2 GB, si installa come servizio locale):
  su un computer dove non c'è, i passi 2 e 3 di Privacy non funzionano;
- il file delle impostazioni contiene l'**elenco del personale** con nomi e
  indirizzi. Per questo dalle Impostazioni si possono tenere i dati di altre
  persone in `campanella-dati.json` **dentro la cartella del Drive** della
  scuola: restano nell'account istituzionale, si ritrovano su tutti i computer
  che sincronizzano quel Drive, e nel file accanto al programma non ne resta
  traccia. Una chiavetta persa con quei dati è una violazione da notificare.

All'avvio l'applicazione prova davvero a scrivere nella propria cartella
(`Stato.CartellaScrivibile`, un file di prova poi cancellato) e avvisa se non
può; se i dati stanno nel Drive e il file non c'è (Drive non ancora
sincronizzato), lo dice invece di far finta di niente.

## Come si compila

```powershell
.\build.ps1                  # -> dist\Campanella.exe + dist\Installa Campanella.exe
.\build.ps1 -SenzaInstaller  # solo l'applicazione, più veloce per le prove
.\build.ps1 -Firma           # + firma con un certificato locale autofirmato
.\build.ps1 -Pubblica        # + copia in H:\Il mio Drive\Campanella
```

Serve solo Windows: il compilatore è il `csc.exe` del .NET Framework 4.x
già presente nel sistema. Niente Visual Studio, niente NuGet, niente runtime
da installare sul computer di destinazione.

Vincoli da ricordare quando si mette mano al codice:

- il compilatore è quello di **C# 5**: niente interpolazione `$"..."`, niente
  `?.`, niente `nameof`, niente inizializzatori di proprietà automatiche;
- i sorgenti sono UTF-8 senza BOM e `build.ps1` passa `/codepage:65001`:
  senza quello gli accenti diventano mojibake;
- niente `dpiAware` nel manifest. Il layout è a coordinate assolute:
  lasciando l'app DPI-unaware Windows la scala per bitmap, che è appena
  sfocata ma sempre della misura giusta. Dichiarare la DPI awareness senza
  riscrivere tutto il layout darebbe una finestra minuscola sui 4K;
- gli ancoraggi `Bottom` dentro un pannello con `AutoScroll` schiacciano il
  controllo: nelle pagine lunghe si usa solo `Top | Left`;
- `Tema.AltezzaTesto` misura con `TextRenderer`, non con
  `Graphics.MeasureString`: la Label disegna con GDI e GDI+ sbaglia di una riga;
- le caselle di testo sono `CasellaTema` (in `Tema.cs`): ridisegnano il bordo
  nel colore del tema, perché Windows lo dipinge con i colori di sistema fuori
  dall'area che WinForms lascia colorare, e nel tema scuro spuntava chiaro a
  tratti. Lo stesso file chiede a Windows le barre di scorrimento scure
  (`SetWindowTheme` con `DarkMode_Explorer`, come Esplora file).

## Com'è fatto

```
src/
  Guscio.cs           Main, finestra, barra laterale, pagina iniziale, impostazioni
  Tema.cs             tavolozza chiara/scura, fabbriche di controlli, CasellaTema
  Stato.cs            modello dati, salvataggio (impostazioni + dati nel Drive)
  PaginaPosta.cs      lo strumento Posta (7 passi)
  PaginaCartelle.cs   lo strumento Cartelle
  PaginaOrari.cs      lo strumento Orari (4 passi: file, controllo, email, calendario)
  PaginaPrivacy.cs    lo strumento Privacy (3 passi) + documenti per DS e DPO
  Anonimizzatore.cs   client HTTP di rizzo-pii (health, analyze, pdf, ripristino)
  Consenso.cs         condizioni d'uso + finestra di accettazione
  Aggiornamenti.cs    rilasci da GitHub, scarico con avanzamento
  Xlsx.cs             lettore minimo .xlsx (ZIP + XML) e CSV
  Orario.cs           riconoscimento del tabellone, blocchi per il calendario, DatiOrari.gs
  Dialoghi.cs         finestrelle di servizio
  app.manifest        asInvoker, supportedOS, common controls 6
  risorse/            i file .gs e .js incorporati nell'eseguibile
    estensione_personale/   l'estensione per Chrome che legge il personale da ClasseViva
src-installer/
  Installa.cs         installer e disinstallatore; riusa Tema, Consenso,
                      Stato e Aggiornamenti dai sorgenti dell'applicazione
  app.manifest        asInvoker: senza questo Windows chiederebbe l'UAC per un
                      eseguibile che si chiama "Installa..."
installer/
  Campanella.iss      script Inno Setup (italiano/inglese) per la pubblicazione
  CONDIZIONI-it.txt   le condizioni d'uso mostrate dal wizard, nelle due lingue
  CONDIZIONI-en.txt
  signpath-artifact-configuration.xml   cosa firma SignPath, e come lo controlla
docs/
  GDPR-e-DPO.md               cosa vale per un docente, con i riferimenti di legge
  Nota-tecnica-DS-DPO.md      descrizione dell'applicazione per dirigente e DPO
  Email-DS-DPO.md             modello di comunicazione
test/
  mock_apps_script.js  banco di prova di Organizzazione_Gmail.gs
  mock_orari.js        banco di prova di Orari.gs (email a sé stessi e calendario)
  Configurazione_esempio.gs, DatiOrari_esempio.gs   dati inventati per i banchi di prova
  prova_orario.ps1     lettura di un tabellone vero + controlli incrociati
  genera_dati_prova.ps1
  finto_rizzo.py       un rizzo-pii finto, per provare il client senza il modello
  prova_installer.ps1  guida l'installer, controlla file, collegamenti e registro
  prova_solalettura.ps1 toglie i permessi a una cartella e verifica l'avviso
  prova_anonimizzazione.ps1  client di rizzo-pii: JSON, multipart, dizionario
strumenti/firma.ps1   certificato autofirmato + Authenticode
.github/workflows/release.yml   compilazione, prove, firma SignPath, installer, rilascio
```

Ogni pagina è un `Pagina : Panel`; il guscio la mostra e, se la pagina
dichiara dei passi, li elenca rientrati nella barra di sinistra. La barra si
costruisce **una volta sola**: cambiando pagina si spostano e si mostrano i
bottoni già fatti (prima veniva ricostruita a ogni clic, ed era il motivo dello
sfarfallio). Il tema si applica ripassando l'albero dei controlli e
colorandoli in base al **ruolo** scritto nella loro `Tag`.

Lo stato è uno solo per tutti gli strumenti. I dati di altre persone (elenco
del personale, indirizzi, orari con i cognomi) stanno in un dizionario
separato (`Stato.Dati()`) che finisce in `campanella.json` oppure, se l'utente
lo sceglie, in `campanella-dati.json` nel Drive.

## Come si prova

```powershell
node test\mock_apps_script.js     # riordino della posta: prova, etichette, ripresa, annulla
node test\mock_orari.js           # email a sé stessi, quota, ripresa, orari di classe, calendario
.\test\prova_anonimizzazione.ps1  # client di rizzo-pii (finto servizio)
.\test\prova_installer.ps1        # installa in una cartella temporanea, poi toglie
.\test\prova_solalettura.ps1      # cartella senza permessi: deve avvisare, non tacere
.\test\prova_orario.ps1           # legge un tabellone vero e controlla la griglia
.\test\genera_dati_prova.ps1 ; node test\mock_orari.js test\DatiOrari_prova.gs
```

I banchi di prova simulano `GmailApp`, `MailApp`, `CalendarApp`,
`PropertiesService`, `LockService` e `ScriptApp` con una finta casella e un
finto calendario, compreso un interprete semplificato della sintassi di
ricerca di Gmail. Girano con i dati inventati di `*_esempio.gs`; i file
`*_prova.gs`, generati dai dati veri, restano fuori dal repository.

`prova_orario.ps1` carica l'eseguibile come assembly e chiama i metodi
interni via reflection: è il motivo per cui `Xlsx`, `AnalisiOrario` e i
metodi di parsing sono statici e testabili.

## Il formato del tabellone

Il riferimento è l'export "TABELLONE DOCENTI" di Orario Facile: una riga per
docente, in orizzontale i giorni divisi nelle loro ore, nelle celle la classe
(oppure `D` per le ore a disposizione). Il riconoscimento non è legato a quel
programma: cerca la riga con i nomi dei giorni e quella con i numeri delle
ore. In alternativa capisce una tabella con le colonne
`Docente | Giorno | Ora | Classe`.

Per il calendario, le ore consecutive della stessa classe diventano un solo
evento settimanale (`CalendarApp.createEventSeries` con regola settimanale
fino alla data di fine), marcato con un tag: `ORARI_ANNULLA_calendario` toglie
solo quelli. Gli orari delle ore sono configurabili (inizio della prima ora e
durata, oppure l'inizio di ogni ora se c'è un intervallo).

## L'anonimizzazione

Il riconoscimento dei dati personali lo fa **rizzo-pii**
(<https://github.com/Rizzo-AI-Academy/rizzo-pii>, MIT): un modello italiano da
0.3B parametri che gira sulla CPU, riconosce 22 categorie — compresi codice
fiscale, partita IVA e IBAN, con validazione del checksum — e non ha bisogno
di rete. L'applicazione desktop, il container Docker e l'avvio da sorgente
espongono tutti lo stesso servizio su `127.0.0.1:5005`; `Anonimizzatore.cs`
parla con quello (`GET /health`, `POST /analyze`, `POST /pdf`).

Sui **file** l'anonimizzazione è definitiva: non resta nessun dizionario da
cui risalire. Sul **testo per l'IA** il dizionario serve — è quello che
permette di rimettere i nomi veri nella risposta — e resta in memoria
dell'applicazione, mai su disco e mai in rete. rizzo-pii legge PDF, TXT e MD:
un `.docx` non si può anonimizzare e viene segnalato.

## Sicurezza per chi lo usa

- Nessuno strumento cancella posta, file o eventi. Al massimo archivia, e
  l'archiviazione in Gmail è reversibile.
- La prima esecuzione del riordino parte sempre in modalità prova, e in prova
  non crea nemmeno le etichette.
- Lo script scrive solo a sé stesso: nessuna email ai colleghi.
- Ogni strumento ha la sua funzione `ANNULLA_…`.
- Le esecuzioni sono protette da un `LockService`: la ripresa automatica e lo
  smistamento orario non si accavallano; una regola con una ricerca che Gmail
  rifiuta viene saltata e segnalata, senza bloccare le altre.
- Gli unici permessi richiesti sono Gmail (sempre) e Calendar (solo per il
  passo 4 degli Orari). Niente Drive, niente servizi esterni.

## Installer pubblico, firma e lingue

Il repository contiene `installer/Campanella.iss` per **Inno Setup 6**:
per-utente (`PrivilegesRequired=lowest`), italiano e inglese con scelta
all'avvio, condizioni d'uso nelle due lingue, copia dei documenti per DS e DPO,
registrazione del consenso in `campanella.json`. Si compila con
`ISCC.exe installer\Campanella.iss` dopo `build.ps1 -SenzaInstaller`.

`.github/workflows/release.yml` compila, esegue le prove, manda
`Campanella.exe` a **SignPath** (programma gratuito per l'open source), lo
rimette nell'installer, firma anche l'installer e pubblica il rilascio. Il
segreto e le variabili da impostare nel repository sono documentati in testa
al workflow; cosa firma SignPath, e come controlla nome e versione del
prodotto, sta in `installer/signpath-artifact-configuration.xml`. Il
disinstallatore che Inno Setup mette nella cartella del programma resta non
firmato: la firma arriva dopo la compilazione dell'installer.

Cambiare lingua **dentro** l'applicazione non è ancora possibile: i testi sono
scritti nel codice. Farlo significa raccogliere tutte le stringhe in un
dizionario per lingua (circa 600 voci) e ricalcolare il layout delle etichette,
che hanno larghezze fisse. È il passo successivo, non un dettaglio.

## Le cartelle dell'anno: cosa è convenzione

Lo strumento Cartelle crea `A.S. <anno>` nella radice del Drive e cerca i
modelli in `MODELLI`, con una sottocartella per gruppo. La sottocartella
`MODELLI\PER CLASSE` è speciale: ogni file che contiene viene copiato dentro
ogni classe con il nome della classe in coda (`Griglia 3A.xlsx`). L'elenco
delle cartelle fisse è generico; chi vuole il proprio lo cambia da "Modifica
struttura...", che scrive `struttura.json` accanto al programma e da lì in
poi comanda quello. Il file è per utente e non è versionato.

## Code signing policy

I binari dei rilasci vengono compilati da GitHub Actions a partire da questo
repository (`.github/workflows/release.yml`) e firmati tramite SignPath:
la firma attesta che l'eseguibile è stato costruito da questi sorgenti, senza
passaggi a mano. Finché il progetto non è accettato dal programma per l'open
source, i rilasci escono non firmati e lo dicono.

Free code signing provided by [SignPath.io](https://signpath.io), certificate
by [SignPath Foundation](https://signpath.org).

- Committers e reviewer: [vittop89](https://github.com/vittop89)
- Approver delle richieste di firma: [vittop89](https://github.com/vittop89)

Il progetto è mantenuto da una persona sola: chi scrive il codice è anche chi
lo rivede e chi approva la firma. Le modifiche esterne arrivano solo tramite
pull request, riviste prima di essere unite.

Informativa: il programma non trasmette informazioni ad altri sistemi in
rete se non su richiesta esplicita di chi lo usa o lo installa. Le uniche
connessioni sono verso GitHub, per cercare e scaricare rizzo-pii, e solo
quando si preme il pulsante; gli script generati girano dentro l'account
Google dell'utente; rizzo-pii gira in locale. In inglese, come chiede
SignPath: *This program will not transfer any information to other networked
systems unless specifically requested by the user or the person installing
or operating it.* I dettagli sono in [PRIVACY.md](PRIVACY.md).

## Segnalazioni e contributi

Errori e proposte: le *issue* di GitHub. Per un problema di sicurezza non
aprire una issue pubblica: vedi [SECURITY.md](SECURITY.md), in inglese (si
può scrivere in italiano). Le modifiche arrivano con le *pull request*; prima
di aprirne una, far girare i banchi di prova. Le versioni sono elencate in
[CHANGELOG.md](CHANGELOG.md), in inglese.

## Licenza e marchi

MIT — vedi [LICENSE](LICENSE).

Progetto indipendente, senza alcun rapporto con Google, Gruppo Spaggiari
Parma o mathema software. Gmail, Google Drive, Google Calendar, Google Apps
Script, ClasseViva e Orario Facile sono marchi dei rispettivi titolari e qui
sono citati solo per dire con quali strumenti l'applicazione funziona.

Prima di pubblicare o condividere questo repository leggi
[PRIVACY.md](PRIVACY.md): il codice si può pubblicare, i dati che ci girano
dentro no.
