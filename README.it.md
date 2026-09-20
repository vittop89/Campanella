# Campanella

*[English](README.md)*

Quattro strumenti per la vita digitale di un docente, in una sola applicazione
Windows: un eseguibile da poche centinaia di KB, nessuna dipendenza, nessun
runtime da installare.

| Strumento | Cosa fa |
|-----------|---------|
| **Posta** | riordina la casella Gmail in etichette (dirigenza, segreteria, circolari, colleghi, studenti…), sulla posta già ricevuta e su quella futura |
| **Cartelle** | crea nel Drive la struttura del nuovo anno scolastico e ci copia i modelli; per i moduli Google, che dal PC non si possono copiare, scrive lo script che ogni anno dà al modulo il suo foglio delle risposte |
| **Orari** | legge il tabellone da un file Excel, manda **a te stesso** una email per ogni docente e mette il tuo orario su Google Calendar |
| **Privacy** | le regole su dati della scuola e IA, gli strumenti per togliere i dati personali prima di darli a un assistente, e i documenti per dirigenza e DPO |

L'applicazione **non tocca mai la posta, il calendario né il Drive da sola**:
prepara il codice di uno script Google Apps Script che l'utente incolla nel
proprio account ed esegue. Gli script non scrivono a nessun altro. Si collega a
internet solo quando premi un pulsante, per cercare e scaricare rizzo-pii.

## Scarica

| | |
|---|---|
| **[Installer (consigliato)](https://github.com/vittop89/Campanella/releases/latest/download/Installa-Campanella.exe)** | installa per il tuo utente, senza diritti di amministratore, e compare fra i programmi installati |
| [Solo l'applicazione](https://github.com/vittop89/Campanella/releases/latest/download/Campanella.exe) | portabile, tiene le impostazioni accanto a sé |
| [Istruzioni](https://github.com/vittop89/Campanella/releases/latest/download/ISTRUZIONI-Campanella.txt) · [Note sulla privacy](https://github.com/vittop89/Campanella/releases/latest/download/PRIVACY.md) | |
| [Tutti i rilasci](https://github.com/vittop89/Campanella/releases) | novità e versioni precedenti |

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
.\build.ps1                  # -> dist\Campanella.exe + dist\Installa Campanella.exe
.\build.ps1 -SenzaInstaller  # solo l'applicazione, più veloce per le prove
.\build.ps1 -Pubblica        # + copia in H:\Il mio Drive\Campanella
```

Serve solo Windows: il compilatore è il `csc.exe` del .NET Framework 4.x già
presente nel sistema. Niente Visual Studio, niente NuGet.

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
  Guscio.cs           Main, finestra, barra laterale, pagina iniziale, impostazioni
  Tema.cs             tavolozza chiara/scura, fabbriche di controlli, CasellaTema
  Stato.cs            modello dati, salvataggio (impostazioni + dati nel Drive)
  PaginaPosta.cs      lo strumento Posta (7 passi)
  PaginaCartelle.cs   lo strumento Cartelle (2 passi: cartelle, moduli Google)
  PaginaOrari.cs      lo strumento Orari (4 passi)
  PaginaPrivacy.cs    lo strumento Privacy + documenti per DS e DPO
  Moduli.cs           gli script per i moduli Google: configurazione, istruzioni, manifest
  Anonimizzatore.cs   client HTTP di rizzo-pii
  Consenso.cs         condizioni d'uso + finestra di accettazione
  Aggiornamenti.cs    rilasci da GitHub, scarico con avanzamento
  Xlsx.cs             lettore minimo .xlsx (ZIP + XML) e CSV
  Orario.cs           riconoscimento del tabellone, blocchi per il calendario
  risorse/            i file .gs e .js incorporati nell'eseguibile
src-installer/        l'installer in C#, per utente, senza UAC
installer/            script Inno Setup (it/en), condizioni, configurazione SignPath
docs/                 GDPR, nota tecnica e modello di email per dirigenza e DPO
test/                 banchi di prova degli script, prove PowerShell dell'applicazione
.github/workflows/release.yml   compilazione, prove, firma SignPath, installer, rilascio
```

Ogni pagina è un `Pagina : Panel`; il guscio la mostra e ne elenca i passi
nella barra di sinistra, costruita una volta sola. Il tema si applica
ripassando l'albero dei controlli e colorandoli in base al **ruolo** scritto
nella loro `Tag`.

## Come si prova

```powershell
node test\mock_apps_script.js     # riordino della posta: prova, etichette, ripresa, annulla
node test\mock_orari.js           # email degli orari e calendario
node test\mock_moduli.js          # moduli: foglio dell'anno, collegamento, chiusura, due anni di fila
node test\mock_pannello.js        # il foglio di controllo per più moduli
.\test\prova_moduli.ps1           # genera i due script dei moduli e li fa girare nei banchi
.\test\prova_orario.ps1           # legge un tabellone e controlla la griglia
.\test\prova_installer.ps1        # installa in una cartella temporanea, poi toglie
.\test\prova_anonimizzazione.ps1  # client di rizzo-pii (finto servizio)
.\test\prova_solalettura.ps1      # cartella senza permessi: deve avvisare, non tacere
```

I banchi simulano `GmailApp`, `MailApp`, `CalendarApp`, `FormApp`,
`SpreadsheetApp`, `DriveApp`, `PropertiesService`, `LockService` e `ScriptApp`,
con un orologio finto e un interprete semplificato della ricerca di Gmail.
Girano su dati inventati; i file generati da dati veri restano fuori dal
repository.

## I moduli Google

Un modulo vive nel cloud: sul PC è solo un segnaposto che non si riesce nemmeno
a leggere, e copiarlo da Esplora file non si porta dietro il foglio delle
risposte. Il passo 2 di Cartelle scrive uno script da incollare una volta
dentro il modulo. Ogni anno crea il foglio delle risposte nella cartella
dell'anno, ci collega il modulo e lo riapre; a fine anno chiude il modulo e
scollega il foglio, che resta com'è. Dal secondo anno è un clic dentro il
modulo.

Se i moduli sono più di uno, lo stesso passo prepara un **foglio di controllo**:
un foglio Google con una riga per modulo, da cui si fa tutto insieme. È più
comodo e costa di più: uno script dentro un foglio apre moduli che stanno
fuori, quindi Google chiede il permesso su *tutti* i moduli dell'account.

Non si cancella niente. Le risposte dell'anno prima restano nel modulo, a meno
che tu non chieda di toglierle, e anche allora solo dopo aver controllato che
stanno già tutte in un foglio vecchio.

## Sicurezza per chi lo usa

- Nessuno strumento cancella posta, file, cartelle, fogli o eventi. Al massimo
  archivia, e l'archiviazione in Gmail è reversibile.
- La prima esecuzione del riordino parte sempre in modalità prova, e in prova
  non crea nemmeno le etichette.
- Ogni strumento ha la sua funzione `ANNULLA_…`.
- Lo script della posta e degli orari chiede solo Gmail e, per il passo del
  calendario, Calendar. Gli script dei moduli sono progetti a parte con
  permessi loro; se la scuola blocca Drive, se ne può generare una versione che
  non lo usa.

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
connessioni sono verso GitHub, per cercare e scaricare rizzo-pii, e solo quando
si preme il pulsante; gli script generati girano dentro l'account Google
dell'utente; rizzo-pii gira in locale. I dettagli sono in
[PRIVACY.md](PRIVACY.md).

## Segnalazioni e contributi

Errori e proposte: le *issue* di GitHub. Per un problema di sicurezza non
aprire una issue pubblica: vedi [SECURITY.md](SECURITY.md), in inglese (si può
scrivere in italiano). Prima di aprire una pull request, far girare i banchi di
prova. Le versioni sono elencate in [CHANGELOG.md](CHANGELOG.md), in inglese.

## Licenza e marchi

MIT — vedi [LICENSE](LICENSE).

Progetto indipendente, senza alcun rapporto con Google, Gruppo Spaggiari Parma
o mathema software. Gmail, Google Drive, Google Calendar, Google Apps Script,
Google Moduli, ClasseViva e Orario Facile sono marchi dei rispettivi titolari e
qui sono citati solo per dire con quali strumenti l'applicazione funziona.

Prima di pubblicare o condividere questo repository leggi
[PRIVACY.md](PRIVACY.md): il codice si può pubblicare, i dati che ci girano
dentro no.
