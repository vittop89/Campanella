# Campanella

*[English](README.md)*

Quattro strumenti per la vita digitale di un docente, in una sola applicazione
Windows: un eseguibile da poche centinaia di KB, nessuna dipendenza, nessun
runtime da installare.

| Strumento | Cosa fa |
|-----------|---------|
| **Posta** | riordina la casella Gmail in etichette (dirigenza, segreteria, circolari, colleghi, studenti…), sulla posta già ricevuta e su quella futura, con i colori che scegli |
| **Cartelle** | crea nel Drive la struttura del nuovo anno scolastico e ci copia i modelli; per i moduli Google, che dal PC non si possono copiare, scrive lo script che ogni anno dà al modulo il suo foglio delle risposte |
| **Orari** | legge il tabellone da un file Excel, manda **a te stesso** una email per ogni docente e mette il tuo orario su Google Calendar |
| **Privacy** | le regole su dati della scuola e IA, gli strumenti per togliere i dati personali prima di darli a un assistente, e i documenti per dirigenza e DPO |

L'applicazione **non tocca mai la posta, il calendario né il Drive da sola**:
prepara il codice di uno script Google Apps Script che l'utente incolla nel
proprio account ed esegue. Gli script non scrivono a nessun altro.
L'applicazione si collega a internet solo quando premi un pulsante: per
chiedere a GitHub l'ultima versione di Campanella e di rizzo-pii, e per
scaricare rizzo-pii. Con rizzo-pii parla solo a un indirizzo dello stesso
computer, e le Impostazioni lo controllano quando le apri.

## Scarica

| | |
|---|---|
| **[Installer (consigliato)](https://github.com/vittop89/Campanella/releases/latest/download/Installa-Campanella.exe)** | installa per il tuo utente, senza diritti di amministratore, e compare fra i programmi installati |
| [Solo l'applicazione](https://github.com/vittop89/Campanella/releases/latest/download/Campanella.exe) | portabile, tiene le impostazioni accanto a sé |
| [Istruzioni](https://github.com/vittop89/Campanella/releases/latest/download/ISTRUZIONI-Campanella.txt) · [Note sulla privacy](https://github.com/vittop89/Campanella/releases/latest/download/PRIVACY.md) | |
| [Tutti i rilasci](https://github.com/vittop89/Campanella/releases) | novità e versioni precedenti |

L'installer è `Installa-Campanella.exe`, costruito con Inno Setup dal flusso
di rilascio: è l'unico installer pubblicato. Impostazioni > "Cerca
aggiornamenti" dice quando è uscita una versione nuova; per aggiornare si
esegue l'installer nuovo sopra l'installazione che c'è. Dalla 1.5.0 le note
di ogni rilascio dicono quali script Google reincollare.

I file non sono ancora firmati, quindi SmartScreen avvisa: **Ulteriori
informazioni**, poi **Esegui comunque**. Vedi più sotto "Code signing policy".

## Per chi è, e per chi no

- Docenti con un account **Google Workspace for Education**. Con una scuola su
  Microsoft 365 non fa niente.
- **Windows** 10 o 11. Niente Mac, niente Linux.
- L'elenco del personale si legge dal registro **ClasseViva di Spaggiari**, con
  l'estensione per Chrome che il programma genera. Con Argo, Axios, Nuvola o
  altri registri non trova niente: l'elenco si incolla a mano, si chiede in
  segreteria, oppure lo si fa leggere allo script dai mittenti veri.
- Il tabellone degli orari è l'export "TABELLONE DOCENTI" di **Orario Facile**,
  oppure una tabella Docente / Giorno / Ora / Classe.

## Come si compila

```powershell
.\build.ps1                  # -> dist\Campanella.exe + dist\Installa Campanella.exe (installer C#)
.\build.ps1 -SenzaInstaller  # solo l'applicazione, più veloce per le prove
.\build.ps1 -Firma           # firma anche tutti e due con un certificato locale autofirmato
.\build.ps1 -Pubblica -Produzione 'D:\Campanella'   # compila, firma e copia in quella cartella
```

Serve solo Windows: il compilatore è il `csc.exe` del .NET Framework 4.x già
presente nel sistema. Niente Visual Studio, niente NuGet. Le prove chiedono
anche Node e Python (vedi "Come si prova"). L'installer pubblicato chiede
Inno Setup 6:

```powershell
.\build.ps1 -SenzaInstaller
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" installer\Campanella.iss   # -> dist\Installa-Campanella.exe
```

**Due installer, uno pubblicato.** Quello ufficiale è
`Installa-Campanella.exe` (Inno Setup, `installer/Campanella.iss`): lo
costruisce il flusso di rilascio, che lo allega a ogni rilascio, e il flusso
delle prove lo compila a ogni push. `dist\Installa Campanella.exe` (C#,
`src-installer/`) lo compila `build.ps1` e lo copia `-Pubblica`, solo per
la distribuzione in locale: non viene mai pubblicato. Quando il suo
disinstallatore lavora in una cartella dove c'è anche l'installazione Inno,
toglie solo sé stesso e la propria voce fra i programmi installati. Al
contrario, `Installa-Campanella.exe` eseguito sopra una vecchia installazione
C# nella stessa cartella toglie il vecchio disinstallatore C# e la sua voce:
prima della 1.5.0 quel disinstallatore cancellava anche il programma.

**`-Firma` e `-Pubblica` installano un certificato.** Firmano con
`strumenti\firma.ps1`, che la prima volta crea un certificato di firma del
codice nei certificati personali del tuo utente di Windows (con la chiave
non esportabile) e ne aggiunge la parte pubblica alle *Autorità di
certificazione radice attendibili* e agli *Autori attendibili* di quell'utente;
prima di aggiungerlo alle radici Windows chiede conferma. Da quel momento
quell'utente considera attendibile qualunque cosa firmata con quel
certificato. Resta installato finché non lo togli con `certmgr.msc`, e gli
altri computer non lo conoscono. L'exe viene firmato prima di finire
nell'installer C#, e se una firma non riesce la compilazione si ferma.
`-Pubblica` non ha una cartella predefinita: serve `-Produzione`, con il
percorso completo, e viene controllata prima di compilare e di firmare.

Vincoli da ricordare quando si mette mano al codice:

- il compilatore è quello di **C# 5**: niente interpolazione `$"..."`, niente
  `?.`, niente `nameof`, niente inizializzatori di proprietà automatiche;
- i sorgenti sono UTF-8 senza BOM e `build.ps1` passa `/codepage:65001`;
- niente `dpiAware` nel manifest: il layout è a coordinate assolute e Windows
  scala la finestra per bitmap;
- gli ancoraggi `Bottom` dentro un pannello con `AutoScroll` schiacciano il
  controllo: nelle pagine lunghe si usa solo `Top | Left`;
- le caselle di testo sono `CasellaTema` (in `Tema.cs`): ridisegnano il bordo e
  chiedono a Windows le barre di scorrimento scure, cosa che WinForms non fa.

## Com'è fatto

```
src/
  Guscio.cs           Main, finestra, barra laterale, classe base Pagina, appunti, documenti
  PaginaHome.cs       la pagina iniziale: lo stato di ogni strumento
  PaginaImpostazioni.cs  impostazioni: tema, dati nel Drive, rizzo-pii, aggiornamenti, condizioni
  Tema.cs             tavolozza chiara/scura, fabbriche di controlli, CasellaTema
  Stato.cs            modello dati, salvataggio (impostazioni + dati nel Drive)
  Dialoghi.cs         le finestrelle: incolla un elenco, mostra un testo, modifica una regola
  PaginaPosta.cs      lo strumento Posta (7 passi)
  GeneratorePosta.cs  Configurazione.gs dello strumento Posta, senza finestre
  PaginaCartelle.cs   lo strumento Cartelle (2 passi: cartelle, moduli Google)
  GeneratoreAnno.cs   le cartelle dell'anno sul disco, senza finestre
  PaginaOrari.cs      lo strumento Orari (4 passi)
  PaginaPrivacy.cs    lo strumento Privacy + documenti per DS e DPO
  Moduli.cs           gli script per i moduli Google: configurazione, istruzioni, manifest
  Anonimizzatore.cs   client HTTP di rizzo-pii (solo indirizzi di questo computer)
  Consenso.cs         condizioni d'uso + finestra di accettazione
  Aggiornamenti.cs    rilasci di Campanella e rizzo-pii da GitHub, scarico controllato
  Xlsx.cs             lettore minimo .xlsx (ZIP + XML) e CSV
  Testo.cs            file di testo letti in UTF-8 o in ANSI (Windows-1252)
  Orario.cs           riconoscimento del tabellone, blocchi per il calendario
  risorse/            i file .gs e .js incorporati nell'eseguibile
src-installer/        l'installer in C#, per utente, senza UAC (solo compilazioni locali)
installer/            script Inno Setup (l'installer pubblicato, it/en), condizioni, configurazione SignPath
strumenti/firma.ps1   firma locale con un certificato autofirmato (-Firma, -Pubblica)
docs/                 GDPR, nota tecnica e modello di email per dirigenza e DPO
test/                 banchi di prova degli script, prove PowerShell dell'applicazione
.github/workflows/prove.yml     compilazione e tutte le prove della CI, a ogni push e pull request
.github/workflows/release.yml   controlli, compilazione, prove, firma SignPath, installer Inno, rilascio
.github/dependabot.yml          aggiornamenti mensili delle azioni fissate per commit
```

Ogni pagina è un `Pagina : Panel`; il guscio la mostra e ne elenca i passi
nella barra di sinistra, costruita una volta sola. Il tema si applica
ripassando l'albero dei controlli e colorandoli in base al **ruolo** scritto
nella loro `Tag`.

## Come si prova

Prima delle prove serve `.\build.ps1`: quasi tutte le prove PowerShell
caricano `dist\Campanella.exe` (`prova_stato.ps1` e
`prova_disinstallazione.ps1` compilano i sorgenti da sole,
`prova_versioni.ps1` usa l'eseguibile solo se c'è), e `test\tutte.ps1` le
segna fallite se l'eseguibile manca o è più vecchio dei sorgenti. Le prove
chiedono **Node 18** o successivo (la CI usa il 24) e **Python
3.7** o successivo, raggiungibile come `python` (la CI usa il 3.13), per il
finto rizzo-pii di `prova_anonimizzazione.ps1`.

```powershell
.\test\tutte.ps1                                 # tutte le prove della CI qui sotto, con il riepilogo alla fine
.\test\tutte.ps1 -Solo mock_orari,prova_stato    # solo quelle indicate
.\test\tutte.ps1 -ConGrafica                     # più le due prove che aprono finestre
```

`tutte.ps1` lancia queste, in quest'ordine; `.github/workflows/prove.yml` lo
lancia a ogni push e pull request, e il flusso di rilascio prima di
pubblicare:

```powershell
node test\mock_apps_script.js     # riordino della posta: prova, etichette, ripresa, annulla
node test\mock_orari.js           # email degli orari, ripresa, orari delle classi, calendario
node test\mock_moduli.js          # moduli: foglio dell'anno, collegamento, chiusura, due anni di fila
node test\mock_pannello.js        # il foglio di controllo per più moduli
node test\prova_gemelli.js        # le funzioni gemelle dei due script dei moduli restano uguali
node test\mutazioni_pannello.js   # mutazioni del motore del foglio di controllo: il banco deve accorgersene
node test\nomi_funzioni.js        # ogni funzione degli script citata da app e documenti esiste
node test\invarianti_script.js    # script di posta e orari: niente posta ad altri, niente servizi esterni, solo le cancellazioni ammesse
.\test\prova_orario.ps1           # legge un tabellone, controlla la griglia e il DatiOrari.gs generato
.\test\prova_xlsx.ps1             # il lettore .xlsx e i CSV in ANSI, UTF-8 e UTF-16
.\test\prova_moduli.ps1           # genera i due script dei moduli e li fa girare nei banchi
.\test\prova_personale.ps1        # elenco del personale: formati da incollare, ruoli nelle cinque categorie
.\test\prova_stato.ps1            # caricamento e salvataggio di impostazioni e dati nel Drive, in cartelle temporanee
.\test\prova_guscio.ps1           # la finestra principale, senza mostrarla: errori, codice di stato, chiusura
.\test\prova_disinstallazione.ps1 # cosa toglie il disinstallatore C#, su cartelle finte, e che Campanella.iss tolga le stesse impostazioni
.\test\prova_posta.ps1            # il generatore vero di Configurazione.gs nel banco di Gmail
.\test\prova_cartelle.ps1         # le cartelle dell'anno su un Drive finto
.\test\prova_versioni.ps1         # versione e testo del consenso, versioni del prodotto e degli script, nomi dei documenti
.\test\prova_anonimizzazione.ps1  # client di rizzo-pii (finto servizio)
```

Fuori dalla CI:

```powershell
.\test\prova_disposizione.ps1     # costruisce la finestra vera: sovrapposizioni, testi che non ci stanno (-ConGrafica)
.\test\prova_solalettura.ps1      # cartella senza permessi: deve avvisare, non tacere (-ConGrafica)
.\test\prova_installer.ps1        # installa e disinstalla davvero l'installer C#
```

`prova_installer.ps1` si rifiuta di partire dove Campanella è installata,
perché toccherebbe l'installazione e il menu Start veri: va lanciata con un
utente di Windows che non ha mai avuto Campanella. `prova_versioni.ps1` legge
e basta: va lanciata prima di creare il tag di un rilascio.
`genera_dati_prova.ps1` non è una prova: scrive in `%TEMP%` un
`DatiOrari_prova.gs` a partire da un tabellone.

Per cambiare le condizioni d'uso si modificano insieme
`installer\CONDIZIONI-it.txt`, `installer\CONDIZIONI-en.txt` e
`Consenso.Testo` in `src\Consenso.cs`, si alzano `Consenso.Versione` e
`#define ConsensoVersione` in `installer\Campanella.iss`, e si aggiunge alla
tabella in cima a `test\prova_versioni.ps1` la riga che la prova stampa.

I banchi simulano `GmailApp`, `MailApp`, `CalendarApp`, `FormApp`,
`SpreadsheetApp`, `DriveApp`, `PropertiesService`, `LockService` e `ScriptApp`,
con un orologio finto e un interprete semplificato della ricerca di Gmail.
Girano su dati inventati; i file generati da dati veri restano fuori dal
repository. Ogni prova che crea uno `Stato` lo manda su cartelle temporanee,
mai sulle impostazioni o sul Drive veri.

## I moduli Google

Un modulo vive nel cloud: sul PC è solo un segnaposto che non si riesce nemmeno
a leggere, e copiarlo da Esplora file non si porta dietro il foglio delle
risposte. Il passo 2 di Cartelle scrive uno script da incollare una volta
dentro il modulo. Ogni anno crea il foglio delle risposte nella cartella
dell'anno, ci collega il modulo e lo riapre; a fine anno chiude il modulo e
scollega il foglio, che resta com'è. Dal secondo anno è un clic dentro il
modulo. Lo script apre solo il suo modulo, ma Google gli dà il permesso su
*tutti* i moduli dell'account, a meno che prima della prima esecuzione non
si aggiunga il manifest facoltativo che il passo prepara; con il manifest,
solo su quel modulo.

Se i moduli sono più di uno, lo stesso passo prepara un **foglio di controllo**:
un foglio Google con una riga per modulo, da cui si fa tutto insieme. È più
comodo e costa di più: uno script dentro un foglio apre moduli che stanno
fuori, quindi Google chiede sempre il permesso su *tutti* i moduli
dell'account, oltre che sui fogli e sul Drive, e le chiusure che programma
scattano da sole.

Non si cancella niente. Le risposte dell'anno prima restano nel modulo, a meno
che tu non chieda di toglierle, e anche allora solo dopo averle ritrovate
tutte, una per una e dall'ora di arrivo, in un foglio vecchio.

## Sicurezza per chi lo usa

- Nessuno strumento cancella posta, file, cartelle o fogli delle risposte. Al
  massimo archivia, e l'archiviazione in Gmail è reversibile. Gli strumenti
  tolgono solo quello che hanno messo loro, e quando glielo chiedi: le
  etichette dai messaggi e gli eventi dell'orario creati dallo script. Il
  foglio di controllo toglie anche la scheda vuota "Foglio1" di un foglio
  nuovo e riscrive la propria scheda "Istruzioni". L'unica cancellazione vera
  è facoltativa e spenta di partenza: togliere dal modulo le risposte degli
  anni scorsi, come detto sopra, e non si annulla. In più, solo quando esegui
  `EXTRA_togliFiltri`, lo script della posta toglie i filtri di Gmail che
  avevi già e che hai spuntato al passo 4, solo quelli, dopo averne scritto
  una copia nel registro per rifarli a mano.
- La prima esecuzione del riordino parte sempre in modalità prova, e in prova
  non crea nemmeno le etichette.
- Ogni script ha le sue funzioni per annullare (`ANNULLA_…`, `MODULO_ANNULLA`,
  `PANNELLO_ANNULLA`). Senza gruppo per le etichette, `ANNULLA_etichettatura`
  toglie solo le etichette che lo script ha creato, e dice "NIENTE DA
  TOGLIERE" se non ne trova; `ANNULLA_etichettaturaCompleta` svuota le
  etichette di tutte le regole attive, comprese quelle con lo stesso nome
  messe a mano. Due cose le funzioni `ANNULLA_` non le annullano: i filtri
  veri di Gmail, se li hai creati, si tolgono a mano dalle impostazioni di
  Gmail oppure con `EXTRA_togliFiltri`, dopo averli spuntati al passo 4; i
  messaggi che una regola ha segnato come letti restano letti.
- Lo script della posta e quello degli orari stanno nello stesso progetto
  Apps Script, e Google ne chiede i permessi tutti insieme: Gmail, l'invio a
  te stesso (`MailApp`), il tuo indirizzo (`Session`), i trigger e, appena
  nel progetto c'è il file degli orari, Calendar, anche se usi solo le
  email. Gli script dei moduli sono progetti a parte con permessi loro; se la
  scuola blocca Drive, dello script dentro il modulo se ne può generare una
  versione che non lo usa.

## Code signing policy

I binari dei rilasci vengono compilati da GitHub Actions a partire da questo
repository (`.github/workflows/release.yml`) e firmati tramite SignPath: la
firma attesta che l'eseguibile è stato costruito da questi sorgenti, senza
passaggi a mano. Finché il progetto non è accettato dal programma per l'open
source, i rilasci escono non firmati e lo dicono.

Free code signing provided by [SignPath.io](https://signpath.io), certificate
by [SignPath Foundation](https://signpath.org).

- Committers e reviewer: [vittop89](https://github.com/vittop89)
- Approver delle richieste di firma: [vittop89](https://github.com/vittop89)

Informativa: il programma non trasmette informazioni ad altri sistemi in rete
se non su richiesta esplicita di chi lo usa o lo installa. Le uniche
connessioni sono verso GitHub, per chiedere l'ultima versione di Campanella e
di rizzo-pii e per scaricare rizzo-pii, e solo quando si preme il pulsante;
gli script generati girano dentro l'account Google dell'utente; rizzo-pii
gira in locale, e Campanella lo raggiunge solo a un indirizzo dello stesso
computer. I dettagli sono in [PRIVACY.md](PRIVACY.md).

## Segnalazioni e contributi

Errori e proposte: le *issue* di GitHub. Per un problema di sicurezza non
aprire una issue pubblica: vedi [SECURITY.md](SECURITY.md), in inglese (si può
scrivere in italiano). Prima di aprire una pull request, lancia
`.\test\tutte.ps1`. Le versioni sono elencate in [CHANGELOG.md](CHANGELOG.md),
in inglese.

## Licenza e marchi

MIT — vedi [LICENSE](LICENSE).

Progetto indipendente, senza alcun rapporto con Google, Gruppo Spaggiari Parma
o mathema software. Gmail, Google Drive, Google Calendar, Google Apps Script,
Google Moduli, ClasseViva e Orario Facile sono marchi dei rispettivi titolari e
qui sono citati solo per dire con quali strumenti l'applicazione funziona.

Prima di pubblicare o condividere questo repository leggi
[PRIVACY.md](PRIVACY.md): il codice si può pubblicare, i dati che ci girano
dentro no.
