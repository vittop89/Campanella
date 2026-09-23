# Revisione architetturale — Campanella — settembre 2026

- **Base:** commit `9534dd5b` su `main`, uguale a `origin/main` e al tag `v1.4.6`, il 23/9/2026. Perimetro: l'intero repository.
- **Redazione:** 23/9/2026, in sola lettura. Nel repository non è stato modificato nulla; build e prove sono girate su un clone usa e getta. Il rapporto non contiene dati personali, segreti o percorsi del PC: dove un rilievo riguarda uno di questi, dice dove sta e non che cosa contiene.
- **Esito:** il piano è stato applicato nella versione 1.5.0 (tag `v1.5.0`, 23/9/2026), con altri tre giri di verifica avversaria sul codice corretto. Restano aperti di proposito A-15 e A-16 (separare la persistenza di `Stato` dall'interfaccia, ridurre `PaginaPosta.cs`), D-1 (rilascio in due job) e R-13.3 (manifest obbligatorio, dopo la verifica dal vivo di R-13.2). La prossima revisione parte da qui con il capitolo di confronto.
- **Metodo:** revisione condotta con agenti IA coordinati. Ogni rilievo è stato riletto da un secondo agente incaricato di smentirlo (capitolo 11.3). Gli ID (A- per i problemi architetturali, DOC- per quelli documentali, D- per le dipendenze, R- per le proposte) servono a ritrovare i rilievi nelle segnalazioni e nella prossima revisione.

## 1. Sintesi

**Stato.** Campanella è un progetto piccolo e ordinato:

- una sola dipendenza, il .NET Framework di Windows;
- nessun avviso del compilatore;
- banchi di prova seri per i quattro script Google (425 controlli verdi);
- il generatore dei moduli provato fino all'esecuzione dello script generato;
- una politica di privacy scritta e in gran parte rispettata dal codice.

I rischi non stanno nella struttura, ma in tre famiglie di difetti ricorrenti.

**Tre rischi principali.**

1. **Perdita di dati dell'utente senza avviso.**
   - Il file dei dati nel Drive viene sovrascritto con un elenco vuoto quando all'avvio non si è riusciti a leggerlo (A-1).
   - Lo svuotamento delle risposte di un modulo è protetto solo da un conteggio di righe, e può cancellare risposte che non stanno in nessun foglio (A-58).
   - L'anonimizzazione può sovrascrivere gli originali (A-24).
2. **Uscite dal perimetro promesso al DPO.**
   - Un tabellone con `*/` inietta codice nello script della posta (A-2).
   - L'indirizzo di rizzo-pii non è vincolato al computer locale (A-12).
   - Il CSV del personale finisce nella cartella dei download (A-19).
   - Un'installazione silenziosa registra un consenso mai dato (A-20).
   - I documenti per il DPO descrivono permessi e cancellazioni diversi da quelli del codice (DOC-1 … DOC-6, DOC-15, DOC-16).
3. **Regressioni che nessuno ferma.**
   - La CI gira solo al rilascio, e il passo dei banchi ignora i fallimenti dei primi due (A-3, A-4).
   - I generatori di Posta e Orari non sono mai provati con il codice vero (A-13).
   - `Stato`, che custodisce i dati personali, non si può provare senza toccare il Drive reale (A-15).

**Tre interventi a maggior resa.**

1. **Salvataggi che non distruggono** (R-1, circa tre giorni). `Stato` non tocca più il Drive se non glielo si chiede, `Salva` non sovrascrive un file non letto, lo svuotamento richiede i timestamp ritrovati, l'anonimizzazione non scrive sugli originali.
2. **Una CI che ferma le regressioni, e generatori che non si possono iniettare** (R-3, R-2). Il controllo del codice d'uscita costa un'ora, poi vengono un workflow su push e pull request e le prove dei generatori veri.
3. **Invarianti trasformati in prove** (R-4, R-5, R-13). Il consenso e il suo testo sono confrontati prima del tag, «posta solo a sé stessi» e «nessuna rete» sono controllati nei banchi, e le frasi dei documenti per il DPO sono allineate a ciò che il codice fa.

Nei numeri: 79 problemi architetturali (5 alta, 30 media, 44 bassa), 16 documentali, 9 dipendenze, 13 proposte.

## 2. Il progetto

- **Che cos'è.** Un'applicazione Windows per docenti italiani su Google Workspace. Prepara gli strumenti che il docente usa nel proprio account:
  - etichette Gmail (Posta);
  - email e calendario dell'orario, solo a sé stessi (Orari);
  - cartelle dell'anno e moduli Google (Cartelle);
  - anonimizzazione locale di testi e file (Privacy).

  Il lavoro su Google lo fanno script Apps Script che l'app genera e che il docente incolla. Pubblico dichiarato: ristretto a Workspace, Windows, il registro elettronico e un programma di orari in uso nelle scuole.
- **Stack:**
  - C# 5 con WinForms, compilato con il `csc` del .NET Framework 4.x senza Visual Studio (`build.ps1:1-20`): 15 file, 11.718 righe, di cui 820 dell'installer in C#;
  - quattro script Google Apps Script incorporati come risorse, 3.541 righe;
  - un'estensione Chrome Manifest V3 e una funzione da console, 357 righe;
  - un installer Inno Setup, 140 righe;
  - script PowerShell di build e firma;
  - prove in Node, PowerShell e Python, 4.600 righe.

  Fonte: `git ls-files` e `wc -l` sulla base.
- **Piattaforme.** L'app gira su Windows; i documenti dicono 10 e 11 (D-9). Gli script girano nei server di Google, nell'account del docente. L'estensione gira in Chrome o Edge. Niente è eseguito su server del progetto: non ne esistono.
- **Rilascio.**
  - Canale ufficiale: al push di un tag `v*` il workflow `.github/workflows/release.yml` confronta la versione, compila su `windows-latest`, esegue cinque prove, compila l'installer Inno e pubblica su GitHub eseguibile, installer, istruzioni e `PRIVACY.md`. La firma SignPath è predisposta ma non attiva.
  - Canale locale: `build.ps1 -Pubblica` copia l'exe e l'installer C# in una cartella.
  - Stato alla base: 15 tag; l'ultimo rilascio è la 1.4.6 del 22/9/2026.
- **Chi lo mantiene.** Una persona sola (`SECURITY.md:27-28`). Le proposte sono quindi a passi piccoli e reversibili, un commit ciascuno.
- **Istruzioni e invarianti.** Il repository non ha istruzioni per la revisione, né un `CLAUDE.md`, né ADR. Gli invarianti sono ricavati da queste fonti:
  - `SECURITY.md`, che elenca che cosa conta come problema di sicurezza;
  - `PRIVACY.md`, con i luoghi dei dati e la lista di controllo prima del push;
  - `.gitignore`, secondo cui i dati personali non devono mai entrare nel repository;
  - le scelte della 1.2.0 nel `CHANGELOG.md`: strumento Archivio tolto, Orari solo a sé stessi, dati di altre persone nel Drive;
  - i commenti del codice.

  Gli invarianti, trattati come vincoli da rafforzare e mai da togliere, sono sei:
  1. i dati personali stanno solo in `campanella.json`, in `campanella-dati.json` e nelle cartelle scelte dall'utente;
  2. gli script non mandano posta ad altri, non cancellano, non chiamano servizi esterni non dichiarati;
  3. il consenso è versionato, con `Consenso.Versione` allineato al `#define ConsensoVersione` dell'installer;
  4. l'estensione legge solo ciò che dichiara;
  5. installer e disinstallatore non toccano file fuori dalla propria cartella;
  6. il vincolo C# 5 / .NET Framework 4.x resta, come scelta dichiarata.

  `PRIVACY.md`, i documenti per dirigente e DPO in `docs/` e `installer/CONDIZIONI-*.txt` sono documenti legali e di privacy: se ne segnalano solo le incongruenze con il codice.
- **Base della revisione.** Commit `9534dd5b` su `main`, uguale a `origin/main` e al tag `v1.4.6`, il 23/9/2026. La copia di lavoro era pulita.
- **Ipotesi dichiarate.** Il comportamento sui servizi Google reali (schermate di consenso, quote, conservazione dei registri) e sull'installer Inno installato davvero non è stato osservato. Vale il codice e i banchi finti; ciò che ne dipende è nel capitolo 11.4.

## 3. Mappa dei moduli

Misure prese sul commit `9534dd5b` con `git ls-files`, `wc -l` e `grep`. «Test» indica le prove che esercitano il modulo e se girano nel workflow di rilascio, che è l'unica CI (capitolo 4, A-3 e A-4). Nessuno strumento di copertura è configurato.

### 3.1 Applicazione C# (`src/`, 14 file, 10.898 righe)

| Modulo | Responsabilità | Dipende da | Usato da | Dimensione | Test |
|---|---|---|---|---|---|
| Avvio e guscio (`src/Guscio.cs:33-539`: `Programma`, `Pagina`, `Guscio`) | `Main` carica lo stato, il tema e il consenso; `Pagina` è il contratto degli strumenti a passi; `Guscio` fa menu, piede, navigazione, cambio di tema e salvataggio alla chiusura. | `Stato`, `Consenso`, `Tema`, le sei pagine | Tutte le pagine (`Stato1`, `VaiA`, `VaiAStrumento`) | circa 500 righe; il metodo più lungo è `VaiA`, 38 righe | `prova_disposizione.ps1`, `prova_solalettura.ps1`, fuori CI |
| Servizi del guscio (`src/Guscio.cs:446-538`) | Appunti, apertura di file e URL, lettura delle risorse incorporate, documenti per dirigente e DPO. | Risorse dell'assembly, nomi fissati in `build.ps1` | Tutte le pagine; `Moduli.cs` per `LeggiRisorsa` | 93 righe | Solo `LeggiRisorsa`, indirettamente in CI |
| Pagina iniziale e Impostazioni (`src/Guscio.cs:544-1225`) | Schede di stato dei quattro strumenti; tema, sede dei dati, rizzo-pii (indirizzo, salute, scarico), documenti, condizioni. | `Stato`, `StatoPosta`, `Anonimizzatore`, `Aggiornamenti`, `FormConsenso` | `Guscio` (prima e ultima pagina) | 680 righe; `PaginaImpostazioni.Costruisci` 189 righe | Solo disposizione, fuori CI |
| `src/Tema.cs` | Tavolozze chiara e scura, ruoli nella `Tag`, ricolorazione ricorsiva, fabbriche di controlli, `Bolla`. | Solo WinForms e P/Invoke | Tutta l'interfaccia e l'installer C# | 796 righe; `Colora` 162 righe | Contrasto in `prova_disposizione.ps1`, fuori CI |
| `src/Stato.cs`: persistenza | Oggetto mutabile unico: 54 membri pubblici, 46 chiavi JSON serializzate a mano in `campanella.json` e in `campanella-dati.json` nel Drive. | `JavaScriptSerializer`, `System.IO`, `Application.ExecutablePath` | Tutto l'applicativo e l'installer C# | circa 630 delle 1.230 righe; `Carica` 91 righe | **Nessuna prova** su `Carica`, `Salva`, `SpostaDati` |
| `src/Stato.cs`: dominio | Categorie di ruolo, confronto fra elenco e casella, 11 regole di partenza, codice di stato CMP1, scelta del Drive, anno scolastico. | Regex; contratti testuali con `Organizzazione_Gmail.gs` | Pagine Posta, Orari, Cartelle; `Orario.cs`, `Moduli.cs` | circa 570 righe; `RegoleDiDefault` 100 righe | `prova_personale.ps1` fuori CI; `EsaminaDrive` in CI |
| `src/Orario.cs` e `src/Xlsx.cs` | Lettura di `.xlsx` (ZIP e XML) e CSV; riconoscimento del tabellone e della tabella Docente/Giorno/Ora; generazione di `DatiOrari.gs`. | `System.IO.Compression`, `System.Xml`, `Stato` | Pagina Orari | 540 + 374 righe; `AnalizzaTabellone` 112 righe | `prova_orario.ps1` in CI, **solo su un CSV**; il ramo `.xlsx` e `GeneraDatiGs` senza prove in CI |
| `src/Anonimizzatore.cs` | Client HTTP del servizio locale rizzo-pii: salute, testo, PDF, copie anonimizzate, ripristino. | `HttpWebRequest`, processo esterno all'indirizzo configurato | Pagina Privacy, Impostazioni | 330 righe | `prova_anonimizzazione.ps1` con un finto servizio in Python, fuori CI |
| `src/Aggiornamenti.cs` e `src/Consenso.cs` | Versione del prodotto, ultimo rilascio di rizzo-pii e suo scarico; testo e versione del consenso con la finestra che lo chiede. | `HttpWebRequest`; `Stato`, `Tema` | Impostazioni, `Main`, installer C# | 191 + 263 righe | Nessuna prova; in CI solo il confronto della stringa di versione |
| `src/Moduli.cs` | Genera gli script dei moduli Google e del foglio di controllo, i manifest e le istruzioni. | Risorse `Moduli.gs` e `Pannello.gs`, marcatori testuali | Pagina Cartelle | 708 righe, metà istruzioni testuali | `prova_moduli.ps1` in CI, con `mock_moduli.js` e `mock_pannello.js` |
| Pagina Posta (`src/PaginaPosta.cs`, 7 passi) | Dominio, elenco del personale (import, estensione, confronto, CSV, scrittura a un gruppo), regole, generazione di `Configurazione.gs`, installazione guidata. | `Stato`, `Dialoghi`, risorse degli script e dell'estensione | `Guscio` | **2.170 righe**, 69 metodi; circa 630 righe di logica di dominio | `prova_personale.ps1` fuori CI; **`GeneraConfigurazione` senza prove** |
| Pagina Cartelle (`src/PaginaCartelle.cs`, 2 passi) | Struttura «A.S. <anno>» nel Drive e copia dei modelli; parametri e codice degli script dei moduli. | `Stato`, `ScriptModuli`, file system | `Guscio` | 1.255 righe; `GeneraAnno` 221 righe, unica funzione che scrive nel Drive | **`GeneraAnno` senza prove** |
| Pagine Orari e Privacy | Lettura e controllo dell'orario, script e dati, calendario; anonimizzazione di testo e di file su thread. | `Stato`, `Xlsx`, `AnalisiOrario`, `Anonimizzatore` | `Guscio` | 858 + 677 righe | Parziali, fuori CI |
| `src/Dialoghi.cs` e `src/app.manifest` | Finestre modali della Posta; manifest Win32 (asInvoker, da Windows 7 a 11). | `Tema`, `Regola` | Pagina Posta; `build.ps1` | 280 + 41 righe | Nessuna |

### 3.2 Script Google e browser (`src/risorse/`, 3.541 righe di Apps Script)

| Modulo | Responsabilità | Dipende da | Usato da | Dimensione | Test |
|---|---|---|---|---|---|
| `Organizzazione_Gmail.gs` (Posta) | Etichette Gmail secondo le regole di `CONFIG`: crea, riordina con ripresa, smista la posta nuova, crea filtri, stampa il codice CMP1. | `Configurazione.gs` generato dal C#; GmailApp, MailApp, ScriptApp, LockService | Il docente che la incolla; `Stato.LeggiCodice` | 941 righe, 37 funzioni; `_riordina` 107 righe | `mock_apps_script.js` (82 controlli), in CI ma mascherabile (A-3) |
| `Orari.gs` | Email al docente stesso per ogni docente e classe; orario di un docente su Google Calendar. | `DatiOrari.gs` generato dal C#; MailApp, GmailApp, CalendarApp | Il docente, nello stesso progetto della Posta | 561 righe, 32 funzioni | `mock_orari.js` (47 controlli), in CI ma mascherabile |
| Progetto condiviso Posta + Orari | Quattro file incollati insieme: stesso spazio dei nomi, stesso lock, stesse proprietà, stessi trigger, stessa schermata di consenso. | I due motori e i due file di dati | Il docente | 1.502 righe di motore, 17 funzioni pubbliche, nessuna collisione di nomi | **Nessun test carica insieme i due motori** |
| `Moduli.gs` (script nel singolo modulo) | Per l'anno scolastico: foglio risposte nella cartella dell'anno, riapertura, chiusura programmata. | Blocco di configurazione di `ScriptModuli`; FormApp, SpreadsheetApp, DriveApp | Pagina Cartelle | 664 righe, 38 funzioni | `mock_moduli.js` (99), in CI anche sugli script generati |
| `Pannello.gs` (foglio di controllo) | Una riga per modulo, lo stesso lavoro di `Moduli.gs` per ogni riga attiva, memoria in ScriptProperties. | FormApp.openById, SpreadsheetApp, DriveApp | Pagina Cartelle | 1.375 righe, 65 funzioni; `_panUnaRiga` 182 righe | `mock_pannello.js` (197), in CI solo tramite `prova_moduli.ps1` |
| Estensione Chrome (`estensione_personale/*`) e funzione da console (`estrai_personale_spaggiari.js`) | Leggono nominativo, ruolo ed email dalla pagina del personale del registro elettronico e producono un TSV; la funzione da console scarica anche un CSV. | Struttura della pagina del registro; `activeTab`, `scripting` | Pagina Posta, che le consegna | 157 + 200 righe | **Nessuna prova del JavaScript** |

### 3.3 Rilascio, installazione e prove

| Modulo | Responsabilità | Dipende da | Usato da | Dimensione | Test |
|---|---|---|---|---|---|
| `build.ps1` e `strumenti/firma.ps1` | Compila l'exe (csc del .NET Framework 4.x) e, senza `-SenzaInstaller`, l'installer C#; firma locale con un certificato autofirmato; pubblica in una cartella. | csc, risorse, cmdlet PKI | CI (solo `-SenzaInstaller`), manutentore | 167 + 126 righe | Nessuna prova diretta |
| `installer/Campanella.iss` e `CONDIZIONI-*.txt` | Installer Inno dei rilasci GitHub: per utente, senza UAC, condizioni come licenza, `campanella.json` con la versione del consenso. | exe compilato, documenti; `ConsensoVersione` allineata a mano | CI, che lo pubblica | 140 righe; condizioni 131 e 132 righe | **Nessuna prova**: in CI è solo compilato |
| `src-installer/Installa.cs` | Installer e disinstallatore alternativi in C#: consenso, copia, collegamenti, chiave di disinstallazione, scarico facoltativo di rizzo-pii. | `Tema`, `Consenso`, `Stato`, `Aggiornamenti` e `Anonimizzatore` di `src` | `build.ps1`, pubblicazione locale | 820 righe; `Lavora` 141 righe | `prova_installer.ps1`, a mano; **in CI non è nemmeno compilato** |
| `.github/workflows/release.yml` | Unico workflow, su tag `v*` o a mano: controlla la versione, compila, prova, firma (se configurato), compila Inno e pubblica. | Runner `windows-latest`, azioni con tag mobile, SignPath (non attivo) | Il manutentore con i tag | 196 righe, 15 passi | 16 esecuzioni riuscite su 18 |
| Banchi Node (`test/mock_*.js`) | Servizi Google finti per i quattro motori. | Motori `.gs`, file d'esempio scritti a mano | CI (tre direttamente, uno tramite `prova_moduli.ps1`) | 3.096 righe | — |
| Prove PowerShell (`test/prova_*.ps1`) | Prove per riflessione sull'exe: orario, moduli, personale, disposizione, anonimizzazione, sola lettura, installer. | `dist\Campanella.exe`, Node, Python | CI solo per orario e moduli | 1.324 righe | 5 prove su 7 fuori CI |

## 4. Problemi architetturali

Ogni riga ha passato una verifica avversaria: un secondo agente, incaricato di smentirla, ha riletto il codice alla prova indicata e spesso l'ha riprodotta con una sonda. Dove il verificatore ha corretto prova, priorità o proposta, la riga riporta la versione corretta. Più dimensioni hanno trovato lo stesso difetto in modo indipendente; qui è unito in una riga sola. Le osservazioni nate dalla mappa (A-58 in poi) hanno avuto un giro di verifica a parte (capitolo 11.3). Le righe sono quelle di `9534dd5b`; «sonda locale» è un programma scritto e lanciato fuori dal repository con il codice vero.

### 4.1 Priorità alta

| ID | Problema | Prova | Impatto | Priorità |
|---|---|---|---|---|
| A-1 | **I dati personali nel Drive vengono sovrascritti con un file vuoto.** Con i dati nel Drive, se all'avvio `campanella-dati.json` manca (Drive non ancora sincronizzato) o non si legge (troncato, vuoto, bloccato), personale e orari partono vuoti. `Stato.Salva` poi scrive comunque il file nel Drive, perché non guarda mai `DatiNonTrovati`. La scrittura avviene in tre momenti: alla chiusura, dopo un nuovo consenso e, in modo deterministico, seguendo il rimedio indicato dall'avviso (`ApplicaDati`/`SpostaDati`). Anche `campanella.json` illeggibile torna ai valori di partenza e viene sovrascritto, e nessuna scrittura è atomica. | `src/Stato.cs:590-608` (file assente, e un JSON illeggibile finisce nel catch generico senza avviso); `src/Stato.cs:378-415` (Salva scrive a `:392` e `:408` senza controllare il flag); `src/Guscio.cs:181-189` (chiusura); `src/Consenso.cs:164-172`; `src/Guscio.cs:953-1002` e `src/Stato.cs:694-708` (`SpostaDati` non legge il file esistente). Riprodotto da tre verificatori indipendenti con una sonda locale: il file diventa `"personale":[]` con `UltimoErrore` vuoto. | Perdita silenziosa di elenco del personale, regole e orari proprio nel file dichiarato per i dati personali. Con più computer la perdita si propaga agli altri, e si recupera solo dalla cronologia delle versioni di Drive. Oggi nessuna prova tocca `Carica` o `Salva`. | alta |
| A-2 | **Un tabellone manipolato può iniettare codice nello script della posta.** `GeneraDatiGs` copia il testo della cella «periodo» del tabellone dentro un commento `/* … */` in testa a `DatiOrari.gs`, senza neutralizzare `*/`. Il resto della cella diventa codice, eseguito nel progetto della Posta, che ha già i permessi Gmail e di invio. | `src/Orario.cs:438-446` (`o.Periodo` a `:440` senza escape; gli altri valori passano da `Js()` a `:534-538`); `src/Orario.cs:227-236` (il periodo è una cella qualsiasi dell'intestazione); `src/PaginaOrari.cs:480-499` (il file va nel progetto della posta). Riprodotto due volte generando il file dall'exe con un tabellone inventato: `typeof INIETTATO` vale `number`. | Codice arbitrario nell'account del docente, eseguito a ogni esecuzione e a ogni scatto del trigger orario, senza un nuovo consenso. L'invariante «nessuna email ad altri» finisce per dipendere da un file esterno. | alta |
| A-3 | **Nella CI un banco che fallisce non ferma il rilascio.** Il passo che prova gli script lancia tre `node` di fila in un unico blocco `pwsh`, e GitHub guarda solo il codice d'uscita dell'ultimo. Un fallimento di `mock_apps_script.js` o di `mock_orari.js` viene ignorato se `mock_moduli.js` passa. | `.github/workflows/release.yml:70-75` (nessun controllo di `$LASTEXITCODE`, che invece c'è a `:121` per ISCC); `test/mock_apps_script.js:648-653` e `test/mock_orari.js:368-370` impostano solo `process.exitCode = 1`. Riprodotto con Windows PowerShell 5.1 con la stessa testa e coda del runner: uscita 0. Il comportamento di `pwsh` 7 sul runner è da confermare con un'esecuzione. | Un rilascio può uscire con prove fallite proprio sugli invarianti: gli orari solo all'account stesso (`test/mock_orari.js:203-204, 263`) e nessun messaggio perso (`test/mock_apps_script.js:375, 381`). Oggi il difetto è latente: i banchi passano. | alta |
| A-4 | **La CI esiste solo al rilascio, e metà delle prove non ci passa.** L'unico workflow parte al push di un tag o a mano, mai su push o pull request. Delle 11 prove ne esegue 6 (`mock_pannello.js` solo tramite `prova_moduli.ps1`). Restano fuori `prova_personale.ps1`, che non ha interfaccia ed è la sola prova delle funzioni che decidono gruppi e indirizzi della Posta, e poi `prova_disposizione`, `prova_anonimizzazione`, `prova_solalettura` e `prova_installer`. L'installer C# non viene nemmeno compilato. | `.github/workflows/release.yml:33-36, 66-68` (`-SenzaInstaller`), `:70-83`; `test/prova_moduli.ps1:198-199`; `test/prova_personale.ps1:17-19, 248`; README con l'elenco incompleto (`README.md:103-113`, `README.it.md:100-110`); il commit `08cb6c5` corregge un guasto scoperto solo al rilascio. | Gli errori emergono dopo aver creato il tag, e una regressione del parser del personale o dell'installer C# arriva al rilascio. | alta |
| A-58 | **Lo svuotamento delle risposte di un modulo è protetto solo da un conteggio.** L'unica cancellazione irreversibile, `form.deleteAllResponses()`, parte se una scheda qualsiasi di un foglio candidato ha almeno tante righe quante sono le risposte. I candidati sono il foglio collegato e quelli degli anni precedenti di quel modulo: anche un foglio di un altro anno, con risposte diverse. In `Moduli.gs` un modulo che non si riesce a chiudere viene scollegato lo stesso, e la conferma dice «Non cancello niente» anche con lo svuotamento attivo. | `src/risorse/Moduli.gs:339-349` (candidati), `:357` (`deleteAllResponses`), `:566-578` (solo `getLastRow()`), `:115-123` (scollega anche se la chiusura fallisce), `:165`, `:391-411`; `src/risorse/Pannello.gs:820-836, 1211-1221, 931-973`; promessa in `installer/CONDIZIONI-it.txt:18-20` e `src/Consenso.cs:43-45`. Riprodotto con i banchi del repository. Dopo «Annulla» arrivano 10 risposte solo nel modulo, e «Prepara l'anno nuovo» toglie tutte le 60 risposte perché il foglio dell'anno prima ne ha 200. Nello scenario della chiusura fallita, 47 risposte diventano 0. | Le risposte arrivate solo nel modulo si perdono per sempre, mentre il resoconto dice che «restano nel foglio vecchio». Serve che il docente abbia scelto lo svuotamento, ma è il caso per cui la funzione esiste. | alta |

### 4.2 Priorità media

| ID | Problema | Prova | Impatto | Priorità |
|---|---|---|---|---|
| A-5 | **`Moduli.gs` non ha le protezioni che la 1.4.6 ha dato al foglio di controllo.** Rieseguire `MODULO_2_prepara` a metà anno riapre un modulo chiuso a mano. Dopo una chiusura già scattata, ricollega il modulo al foglio dell'anno e duplica le risposte. | `src/risorse/Moduli.gs:112-131` (la chiusura non lascia memoria), `:251, 283-298`, `:365-389`, `:580-594`; il gemello protetto in `src/risorse/Pannello.gs:207, 642-674, 795-797, 846-861`; il commit `9534dd5` cambia in `Moduli.gs` solo la versione. Riprodotto su una copia del banco: modulo riaperto, schede da 2 a 3. | Chi usa lo script nel modulo, la strada consigliata con uno o due moduli, può ritrovare il modulo riaperto agli studenti e una scheda con le risposte duplicate; nessun dato esce dall'account. | media |
| A-6 | **La memoria del foglio di controllo supera il tetto di circa 9 KB di PropertiesService.** La mappa `memoria.fogli` cresce ogni anno e non viene mai sfoltita. | `src/risorse/Pannello.gs:1232-1233` (il commento conosce il tetto), `:1253-1257` (sfoltisce solo `pronti`, `chiusi`, `annullati`), `:709-762`; `test/mock_pannello.js:443-447` (nessun tetto nel finto). Simulazione con id reali di 44 caratteri: guasto all'8° anno con 10 moduli, al 3° con 25. | Il foglio viene creato ma non ricordato, il modulo resta chiuso, e ogni riesecuzione crea un doppione nella radice del Drive senza rimedio dal menu. | media |
| A-7 | **Una riga fallita perde il proprio trigger di chiusura.** «Prepara l'anno nuovo» toglie tutti i trigger di chiusura e li ricrea solo dalle righe riuscite in questa esecuzione. | `src/risorse/Pannello.gs:572-606`, `:1126-1157`, `:788-789`; riprodotto su una copia di `test/mock_pannello.js` con un `openById` in errore: resta solo il trigger di un'altra data. | Un modulo con chiusura al 30/06 resta aperto fino al trigger di un'altra data o alla prossima preparazione riuscita, e nessun avviso dice che la chiusura non è più programmata. | media |
| A-8 | **Rieseguire `ORARI_4_calendario` raddoppia tutte le lezioni.** Crea le serie senza cercare quelle già contrassegnate. Il banco lo esegue due volte, ma controlla solo il numero dei calendari. | `src/risorse/Orari.gs:219-258`; `test/mock_orari.js:339-341`; sonda locale: 12 serie invece di 6. | Ogni lezione compare doppia in Calendar per tutto l'anno; si rimedia con `ORARI_ANNULLA_calendario`. | media |
| A-9 | **Gli script incollati non hanno una versione riconoscibile.** `_MODULO_VERSIONE` non è mai letta, `Organizzazione_Gmail.gs` e `Orari.gs` non hanno una costante, e le costanti sono state alzate anche senza modifiche. L'app non sa quale motore gira. Caso concreto: un motore fino alla 1.4.3 con una configurazione che usa `@GRUPPO:` cerca il testo letterale e la regola non prende nulla. | `src/risorse/Moduli.gs:61`; `src/risorse/Pannello.gs:68, 516`; `src/PaginaPosta.cs:1817-1818` e `src/Orario.cs:439` (solo la data); `git diff` fra i tag; commit `c183b22`; `ISTRUZIONI - Campanella.txt:233-236` non dice di reincollare il motore. | Il docente non sa se reincollare, il manutentore non capisce che cosa gira, e una regola può restare senza effetto. | media |
| A-10 | **Gli invarianti di privacy di Posta e Orari non sono presidiati dalle prove.** I controlli statici su «nessun servizio esterno» esistono solo per Moduli e Pannello. Il finto `MailApp` della Posta registra il destinatario ma non lo verifica. Nessuna prova limita le azioni dei filtri Gmail. | `test/mock_moduli.js:326, 346`, `test/mock_pannello.js:514` (unici controlli sul testo); `test/mock_apps_script.js:240, 323, 383, 471-476`; copia temporanea: un destinatario estraneo e un `UrlFetchApp` lasciano verdi entrambi i banchi. | Una modifica futura che introduca un inoltro, una chiamata di rete o un destinatario diverso passerebbe tutte le prove, mentre i documenti per il DPO promettono proprio il contrario. Oggi gli invarianti sono rispettati. | media |
| A-11 | **`Orari.gs` cerca un'etichetta fissa che dalla 1.4.1 non esiste più.** Con il prefisso di partenza vuoto la regola crea «Orari», ma `_etichettaInviati` cerca «Scuola/Orari», non la trova ed esce in silenzio. Lo smistamento della Posta non rimedia, perché di partenza esclude la posta inviata. | `src/risorse/Orari.gs:35, 149, 542-550` (catch vuoto); `src/Stato.cs:138, 153, 1085-1090`; `src/risorse/Organizzazione_Gmail.gs:687-690, 719`; `src/PaginaOrari.cs:199-202` (l'interfaccia promette l'etichetta); `test/mock_orari.js:47`. | Una funzione promessa dall'interfaccia si spegne in silenzio con la configurazione di partenza; non si perde posta. | media |
| A-12 | **L'indirizzo di rizzo-pii non è vincolato al computer locale.** È una casella libera salvata in `campanella.json` e usata senza controlli per `/health`, per il testo con il dizionario reversibile e per l'invio dei PDF. Il commento del codice e i documenti promettono un'elaborazione senza rete. | `src/Guscio.cs:831-835, 1072-1078`; `src/PaginaPrivacy.cs:313-319`; `src/Stato.cs:176, 462, 572`; `src/Anonimizzatore.cs:15-16, 51, 63, 209-220, 267-296`; barriera esistente in `src/PaginaPrivacy.cs:333-342` (un refuso non fa partire dati). Promesse in `docs/GDPR-e-DPO.md:109`, `docs/Nota-tecnica-DS-DPO.md:46-47, 81`, `PRIVACY.md:135-139`. | Con un host remoto indicato di proposito, testi, file e dizionario viaggiano in chiaro verso una macchina di altri, contro la garanzia centrale data al DPO. | media |
| A-13 | **Il contratto fra i generatori C# e gli script di Posta e Orari non è provato.** `GeneraConfigurazione` sta nella pagina WinForms e legge i controlli, quindi non si chiama senza costruire la finestra. I banchi girano solo su file d'esempio scritti a mano. | `src/PaginaPosta.cs:1803-1963` (`Raccogli` a `:1807`); `src/Orario.cs:435-514` (chiamato solo da `test/genera_dati_prova.ps1`, fuori CI); `test/mock_apps_script.js:262-264`; `test/mock_orari.js:20`; confronto con `test/prova_moduli.ps1:52-69`. | Una chiave rinominata da un solo lato (per esempio `provaSenzaModifiche`) renderebbe reale la prima esecuzione che doveva essere di prova, con le prove verdi. | media |
| A-14 | **Rete e lavori lunghi girano sul thread dell'interfaccia.** `Pulisci` chiama `Salute` e `TestoAnonimo` (fino a 5 minuti); Impostazioni chiama `Salute` a ogni ingresso; `Genera` copia i modelli nel Drive in modo sincrono. | `src/PaginaPrivacy.cs:321-373`; `src/Anonimizzatore.cs:53, 65-66, 217-218`; `src/Guscio.cs:1054-1067, 1114-1123`; `src/PaginaCartelle.cs:935-982`. Misura: con rizzo-pii spento, `Salute` torna dopo circa 2,1 s. | Impostazioni si blocca a ogni ingresso, e Pulisci o Genera possono mandare la finestra in «Non risponde». | media |
| A-15 | **`Stato` mescola modello, persistenza, dominio e WinForms, e non si può provare.** Ricava il percorso da `Application.ExecutablePath`. Il suo inizializzatore `Drive = DriveDiDefault()` legge tutte le unità e punta al Drive reale del PC. | `src/Stato.cs:21, 161, 202-209, 238-301, 520-529`; `test/prova_disposizione.ps1:34-37, 306` (carica e alla chiusura salva accanto a `powershell.exe`); 128 accessi `S.` in PaginaPosta. Durante questa revisione una sonda che creava uno `Stato` senza cartelle esplicite ha scritto e poi cancellato un file nella cartella Drive reale del PC (capitolo 11.3). | Il codice che custodisce i dati personali non ha prove, e scriverle è pericoloso: basta istanziare `Stato` per toccare il Drive vero. | media |
| A-16 | **File oltre le 1.200 righe con logica di dominio nelle pagine, e un generatore delle cartelle senza prove.** PaginaPosta (2.170 righe), PaginaCartelle (1.255), Guscio.cs (1.226, cinque classi) e Stato.cs (1.230) superano la soglia. `GeneraAnno`, l'unica funzione che scrive nel Drive, non ha prove, riscrive a ogni giro la nota dei gruppi e conta come «creati» anche file già presenti. | `src/PaginaCartelle.cs:984-1204` (`:1191-1192` contro `:1102`; contatore a `:1019, 1034, 1115`); `src/Guscio.cs:544-706, 711-1225`; `src/PaginaPosta.cs:1038-1214, 1805-1963`. Due esecuzioni su una radice finta: la nota modificata dall'utente è sovrascritta. | Una struttura sbagliata resta nel Drive per l'anno, le note dell'utente si perdono, e i diff restano difficili da rileggere. | media |
| A-17 | **Due installer paralleli; il disinstallatore C# cancella troppo.** Il rilascio pubblica l'installer Inno, mentre `build.ps1` compila quello C#, l'unico provato e quello descritto dalle istruzioni allegate al rilascio. Il disinstallatore C# cancella, senza Cestino, ogni file al primo livello di una cartella che l'utente può scrivere a mano. Cancella anche tutta la cartella `documenti`, il gruppo del menu Start condiviso con Inno e `struttura.json` anche quando si risponde «No». | `.github/workflows/release.yml:67, 114-129, 147-155`; `build.ps1:104-146`; `src-installer/Installa.cs:243-253, 446-452, 735-740, 763-791`; `installer/Campanella.iss:30, 38-44, 75-76, 133-137`; `test/prova_installer.ps1:14` (prova solo il C#). | File dell'utente mai scritti dall'installer vengono cancellati in modo irreversibile, i due installer si pestano i piedi, e quello pubblicato non ha prove. L'esposizione è limitata a chi usa la pubblicazione locale. | media |
| A-18 | **L'installer di rizzo-pii viene avviato senza controllarne l'integrità.** Lo scarico legge fino a EOF senza confrontare i byte con `Content-Length` o con la dimensione dichiarata: un file troncato da una chiusura pulita della connessione viene avviato. Il file parziale resta nella cartella temporanea se lo scarico fallisce. Il campo `digest` degli asset esiste nell'API ma non è letto. | `src/Aggiornamenti.cs:84-94` (URL non controllato, `digest` ignorato), `:153-189`; `src/Guscio.cs:1164-1214`; `src-installer/Installa.cs:559-572`; prova con un server locale: 400.000 byte su 1.000.000 dichiarati, nessuna eccezione. | Viene avviato un installer incompleto di circa 1,2 GB. Il dirottamento è poco probabile: TLS non è alterato, l'API è fissa, e nessuna elevazione è coinvolta. | media |
| A-19 | **La funzione da console scarica sempre un CSV del personale.** `personale_spaggiari.csv`, con nominativi, ruoli ed email, finisce nella cartella dei download anche quando la copia negli appunti riesce. Né la guida dell'app né `PRIVACY.md` lo dicono. L'estensione, la strada consigliata, non scarica nulla. | `src/risorse/estrai_personale_spaggiari.js:127-154` (download senza condizioni), `:19, 188` (dichiarato solo nel commento); `src/PaginaPosta.cs:1526-1556` (guida); contrasto con `PRIVACY.md:67-72`. | Una copia dell'elenco del personale resta in una cartella non dichiarata e mai ripulita, anche quando i dati stanno nel Drive. | media |
| A-20 | **L'installer Inno registra il consenso anche nelle installazioni silenziose.** `CurStepChanged` scrive la versione del consenso in `campanella.json` senza controllare `WizardSilent`: con `/VERYSILENT` le condizioni non vengono mai mostrate né chieste al primo avvio. In più `PrivilegesRequiredOverridesAllowed=dialog` offre l'installazione per tutti gli utenti, contro l'intestazione del file e i README. | `installer/Campanella.iss:109-124` (senza `WizardSilent`), `:65-66`, `:41-42`; `src/Consenso.cs:164` (esce subito se la versione salvata basta); `README.it.md:25`, `README.md:29`. Il comportamento reale con `/VERYSILENT` è da verificare con un'installazione. | Un parametro della riga di comando registra un'accettazione che nessuno ha dato: aggira il consenso versionato. | media |
| A-21 | **Lo script nel modulo chiede il permesso su tutti i moduli dell'account.** Senza manifest Google lo deduce dal codice, e il manifest che lo restringe al modulo corrente è facoltativo e arriva dopo la prima esecuzione. I testi dell'app, `PRIVACY.md` e la nota tecnica lo presentano come limitato al singolo modulo. | `src/Moduli.cs:529-533, 676-683` (sezione facoltativa, dopo `MODULO_1_anteprima`), `:371-372, 597-601`; `src/PaginaCartelle.cs:595-596, 613`; `PRIVACY.md:86-90`; `docs/Nota-tecnica-DS-DPO.md:113-115, 135-142`. | Il permesso concesso seguendo i passi obbligatori è più largo di quello dichiarato al DPO, anche se lo script apre solo il proprio modulo. | media |
| A-22 | **L'elenco degli indirizzi ricavato dalla casella include gli studenti.** `EXTRA_elencaIndirizziScuola` raccoglie tutti gli indirizzi del dominio visti in Da, A e Cc. Importati senza ruolo, diventano «Non specificato» con la spunta e finiscono in `Configurazione.gs` come colleghi. Le righe senza spunta restano comunque salvate, e i testi sul registro delle esecuzioni contraddicono il codice. | `src/risorse/Organizzazione_Gmail.gs:357-371, 408-411, 847-859`; `src/PaginaPosta.cs:1084-1095, 1150-1154, 1647-1656, 945-947`; `src/Stato.cs:474-490, 723-733`. | Nomi e indirizzi di studenti, spesso minori, possono entrare nella configurazione come colleghi e restano nel file dei dati anche se esclusi. | media |
| A-23 | **Nessun avviso quando esce una nuova versione di Campanella.** «Cerca aggiornamenti» interroga solo il rilascio di rizzo-pii, `VersioneCampanella` non viene mai confrontata con l'ultimo rilascio, e l'exe portatile non ha nessun rimando. `SECURITY.md` supporta solo l'ultima versione. | `src/Aggiornamenti.cs:47-109` (solo `ApiRizzo`); `src/Guscio.cs:845-853, 1108-1150`; `src/Moduli.cs:637-638`; `SECURITY.md:29-31`; `ISTRUZIONI - Campanella.txt:23-24, 233-236`. | Le correzioni, anche di sicurezza, non raggiungono chi ha già installato, e per gli script serve anche reincollarli. | media |
| A-24 | **Lo strumento Privacy può sovrascrivere gli originali.** Se la cartella delle copie pulite coincide con quella dei file, `Anonimizza` sovrascrive l'originale con la versione anonimizzata. Anche due file omonimi in sottocartelle diverse finiscono uno sull'altro. L'interfaccia promette che «l'originale resta intatto». | `src/PaginaPrivacy.cs:399-403, 585-591, 625-639`; `src/Anonimizzatore.cs:122-156` (`WriteAllBytes` a `:136`, `WriteAllText` a `:152`); riprodotto con una sonda locale: impronta dell'originale cambiata. | Originali persi senza passare dal Cestino, anche se serve una scelta attiva dell'utente. | media |
| A-25 | **Numero e testo del consenso sono allineati solo a mano.** `Consenso.Versione` e `#define ConsensoVersione` dell'installer Inno sono legati da un commento. `Consenso.Testo` e `installer/CONDIZIONI-it.txt` sono due copie dello stesso testo. La CI non controlla nessuno dei due allineamenti; oggi coincidono. | `src/Consenso.cs:21, 25-156, 164`; `installer/Campanella.iss:26-27, 65-66, 115-118`; `.github/workflows/release.yml:50-64`; precedente: il commit `6ef23bf` cambia il testo con la versione ferma a 2. | Con il `#define` più alto, l'installer registra l'accettazione di un testo mai mostrato e l'app non lo chiede più. Con il testo cambiato senza nuova versione, chi ha già installato non lo rilegge. | media |
| A-26 | **Il lettore `.xlsx` e il secondo formato dell'orario non sono mai provati.** `prova_orario.ps1` lavora solo su un CSV: il percorso ZIP/XML, che è la strada principale nell'app, e la tabella Docente/Giorno/Ora non girano mai. I controlli sono soglie minime. | `src/Xlsx.cs:75-271`; `src/Orario.cs:199, 291-359`; `test/prova_orario.ps1:25, 73-75`; sonda locale: un indice delle stringhe condivise alterato lascia passare le soglie. | Una regressione del lettore lascia la CI verde. L'impatto è contenuto dal controllo umano «Controlla la lettura» e dall'invio solo a sé stessi. | media |
| A-27 | **Alcune prove non possono fallire.** La più importante è in `prova_installer.ps1`: il controllo sul pulsante del consenso bloccato usa `Control.FromHandle` su una finestra di un altro processo, che restituisce sempre `null`. Poi c'è un percorso di prova con un a capo vero, sezioni di `mock_orari.js` saltate in silenzio, una regex che accetta qualunque versione del consenso e un `if` vuoto. | `test/prova_installer.ps1:127, 163`; `test/prova_moduli.ps1:158-159`; `test/mock_orari.js:257, 270, 369`; `test/mock_apps_script.js:144-146`. | Fiducia sbagliata: un pulsante del consenso attivo senza spunte passerebbe. | media |
| A-28 | **Le prove dipendono dall'ambiente, e una tocca l'installazione vera.** `mock_pannello.js` fallisce 2 prove su 197 nei fusi a est di Roma. Le prove PowerShell usano `dist\Campanella.exe` senza controllarne la data. `prova_installer.ps1` cancella il gruppo del menu Start e il collegamento sulla scrivania dell'installazione Inno reale. | `test/mock_pannello.js:173` contro `src/risorse/Pannello.gs:1019, 1072`; `LoadFrom` senza controllo in sei prove; `test/prova_installer.ps1:166-173, 204-207` con `installer/Campanella.iss:39`. | Falsi rossi fuori fuso, falsi verdi con un exe vecchio, e collegamenti dell'installazione vera tolti dal PC di chi prova. | media |
| A-29 | **Il codice di stato conta le etichette personali.** Con il prefisso vuoto, predefinito dalla 1.4.1, `EXTRA_codiceStato` conta tutte le etichette dell'utente e le loro conversazioni. L'app dichiara «Già fatto» anche senza riordino o dopo `ANNULLA_etichettatura`. Nessuna prova chiama la funzione. | `src/risorse/Organizzazione_Gmail.gs:528-558` (il filtro vale solo con un prefisso non vuoto), `:712-714`; `src/Stato.cs:138, 1166-1170, 1209-1228`; `src/Guscio.cs:625-630, 1036-1052`; sonda locale: prefisso vuoto dà `CMP1-…-2-0-14`, con «Scuola» dà `…-0-0-0`. | Home e Impostazioni mostrano «Già fatto» e «Confermato» a chi non ha riordinato; la posta non viene toccata. | media |
| A-59 | **Le lezioni slittano di colonna se il tabellone non comincia di lunedì.** `Lezione.Giorno` è l'indice assoluto del giorno nel tabellone e un indice compattato nella tabella Docente/Giorno/Ora. Le griglie lo usano come posizione nell'elenco dei giorni trovati, e il ripristino dopo un riavvio ricostruisce le colonne da lunedì. | `src/Orario.cs:200, 261, 273, 353-357, 77-78, 91-94`; `src/PaginaOrari.cs:131-138`; `src/Stato.cs:100`. Sonde su tabelloni inventati: senza lunedì le lezioni del martedì finiscono sotto mercoledì e quelle del venerdì si perdono; nella tabella senza lunedì, dopo un riavvio simulato, ogni evento cade un giorno prima. `Orari.gs:239` propaga l'errore. | Email ed eventi di Calendar con l'orario sbagliato. L'esportazione standard da lunedì non è toccata. | media |
| A-60 | **Un CSV salvato da Excel in ANSI non si legge.** `Xlsx.RilevaCodifica` tratta come UTF-8 ogni file senza BOM, e i byte non validi diventano U+FFFD. La stessa lettura fissa è in `FormIncolla` e nell'anonimizzatore. | `src/Xlsx.cs:318, 366-372`; `src/Dialoghi.cs:72`; `src/Anonimizzatore.cs:55, 147`. Sonda: con i giorni abbreviati i cognomi accentati si corrompono; con i giorni scritti per intero e accentati il foglio risulta «non riconosciuto»; gli stessi dati in UTF-8 si leggono bene. | Cognomi corrotti nei dati degli orari e negli oggetti delle email, oppure un tabellone rifiutato senza una spiegazione utile. | media |
| A-61 | **Con il prefisso vuoto `ANNULLA_etichettatura` toglie anche le etichette messe a mano.** Le regole riusano le etichette omonime già esistenti, e l'annullamento le toglie da tutte le conversazioni. Il resoconto non distingue quelle etichettate dall'utente, e anzi consiglia di cancellare le etichette rimaste vuote. Il compromesso è scritto solo nel fumetto di aiuto; la FAQ propone l'annullamento come passo abituale. | `src/risorse/Organizzazione_Gmail.gs:43, 572, 592-605, 624-636, 686-690`; `src/Stato.cs:138`; `src/PaginaPosta.cs:151, 614-624, 919-934`; riprodotto sul banco con una conversazione etichettata a mano «Colleghi». | Si perde senza rimedio la classificazione fatta a mano, proprio da chi il valore predefinito vuole servire. Nessun messaggio viene cancellato. | media |
| A-62 | **Cambiando cartella dentro il Drive, la copia vecchia dei dati resta.** `SpostaDati` cancella il vecchio `campanella-dati.json` solo tornando in locale. Se il salvataggio fallisce, sede e flag non vengono ripristinati, e `campanella.json` è già stato riscritto senza i dati. | `src/Stato.cs:694-708, 389-409, 355-373, 590-604`; `src/Guscio.cs:979-985, 995-1002`; `PRIVACY.md:67-72`. Ricostruito dalla lettura del codice: `SpostaDati` non è stato eseguito, perché chiama `Salva`. | Una copia dei dati personali resta in una cartella non più dichiarata, anche nel Drive dell'account personale. Un errore di scrittura durante lo spostamento può far perdere l'elenco al riavvio (A-1). | media |
| A-63 | **Le classi della pagina Cartelle si spezzano anche sul punto e virgola.** Così «1A: Matematica; Fisica» crea una classe «Fisica», con le sue cartelle e le copie dei modelli, senza segnalare errori. | `src/PaginaCartelle.cs:1005` (spezza su `;` prima di cercare i due punti) contro `:1046` (accetta `;` fra le materie); `:1058-1061, 1082-1114`. Provato su una radice finta: nasce `CLASSI\Fisica`. | Cartelle sbagliate nel Drive vero, dove il programma non cancella mai nulla. | media |

### 4.3 Priorità bassa

| ID | Problema | Prova | Impatto | Priorità |
|---|---|---|---|---|
| A-30 | Quando una chiusura non riesce, `PANNELLO_chiusura` crea un nuovo trigger dopo un'ora senza togliere quello scattato; con un errore persistente i trigger si accumulano verso la quota di 20. | `src/risorse/Pannello.gs:194-214, 1160-1163`; copia del banco: da 2 a 26 trigger dopo 24 chiamate fallite. | Dopo circa 19 ore di errori i tentativi si fermano mentre la riga dice ancora «Riprovo fra un'ora»; Prepara e Annulla ripuliscono. Che i trigger scattati contino nella quota è da verificare. | bassa |
| A-31 | `_panEsegui` non ha una scadenza interna, a differenza di Posta e Orari (260 s), e scrive la scheda e programma le chiusure solo dopo il ciclo. | `src/risorse/Pannello.gs:572-606`; confronto con `src/risorse/Organizzazione_Gmail.gs:51` e `src/risorse/Orari.gs:32`; banco con 30 righe e tempi finti: 450 s. | Con molti moduli l'esecuzione può essere interrotta al limite di 6 minuti senza scheda né trigger; si rimedia rieseguendo. | bassa |
| A-32 | Orari e Posta condividono lo stesso lock utente: se la ripresa di `ORARI_2_invia` lo trova occupato ritorna senza riprogrammarsi, e `ORARI_ANNULLA_invio` non lo prende. | `src/risorse/Orari.gs:85-90, 157-164, 552-555`; `src/risorse/Organizzazione_Gmail.gs:149-158, 582, 653`; nessun test carica i due motori insieme. | Durante un riordino lungo l'invio degli orari si ferma in silenzio; le email vanno comunque solo all'account stesso. | bassa |
| A-33 | `ORARI_3_inviaOrariClassi` non ha progresso né ripresa: a quota o tempo finiti si ferma senza dirne il motivo, e rieseguita riparte dalla prima classe. | `src/risorse/Orari.gs:178-198`; `src/PaginaOrari.cs:509-524` e `ISTRUZIONI - Campanella.txt:205-207` promettono in generale «niente due volte». | Doppioni solo nella casella del docente. | bassa |
| A-34 | `_criteriFiltro` ignora i campi di regola `a` e `haAllegato`, che `_queryDellaRegola` usa: il filtro Gmail nativo risulterebbe più largo della ricerca dello script. | `src/risorse/Organizzazione_Gmail.gs:702-703, 786-823`; il C# non genera mai quei campi (`src/PaginaPosta.cs:1934-1946`). | Solo con una regola scritta a mano e la funzione facoltativa dei filtri. | bassa |
| A-35 | `ScriptModuli.ManifestPannello` non è raggiungibile dall'interfaccia (lo usa solo una prova), e tre opzioni di `ParametriModulo` non vengono mai impostate. | `src/Moduli.cs:27-34, 340-356`; `test/prova_moduli.ps1:201-202`; `src/PaginaCartelle.cs:609-616, 896-907`. | Codice generato e provato che nessuno può ottenere. Offrirlo non servirebbe: non restringe i permessi e potrebbe rompere il menu del foglio. | bassa |
| A-36 | La regola della chiusura al 29/02 diverge: il C# la rifiuta sempre, `Moduli.gs` e `Pannello.gs` la accettano solo negli anni bisestili. | `src/Moduli.cs:137-139`; `src/risorse/Moduli.gs:490-496`; `src/risorse/Pannello.gs:1110-1116`. | Un 29/02 scritto a mano nel foglio di controllo fa saltare la riga tre anni su quattro, con un messaggio nella colonna Stato. | bassa |
| A-37 | `MODULO_chiusura` e `PANNELLO_chiusura` non prendono il lock usato dalle voci di menu, e lo stato si riscrive per intero. | `src/risorse/Moduli.gs:112-131, 197-209`; `src/risorse/Pannello.gs:140-220, 1240, 1271-1286`. | Raro: una chiusura che coincide con una preparazione dello stesso utente richiude il modulo appena riaperto. | bassa |
| A-38 | La gestione degli errori è disomogenea: su 72 `catch`, 42 non hanno tipo e 22 sono vuoti; manca `Application.ThreadException`; cinque `File.WriteAllText` e due `GetFiles` ricorsivi non hanno `try`; uno `struttura.json` con errori è ignorato in silenzio. | `src/Guscio.cs:38-90`; `src/PaginaPosta.cs:1521, 2118`; `src/PaginaCartelle.cs:389-432, 459, 927`; `src/PaginaOrari.cs:566`; `src/PaginaPrivacy.cs:457, 525`. | Un CSV aperto in Excel o una cartella protetta mostrano la finestra d'errore di .NET. | bassa |
| A-39 | Helper e impalcature duplicati: l'escape per JavaScript in due copie identiche (`PaginaPosta.Js` e `AnalisiOrario.Js`), `NuovaPagina`, `Servizio()` e l'indirizzo predefinito di rizzo-pii ripetuti, lo scheletro delle pagine a passi scritto quattro volte. | `src/PaginaPosta.cs:1783-1787`; `src/Orario.cs:534-538`; `src/Guscio.cs:1072`; `src/PaginaPrivacy.cs:313`; `src/PaginaPosta.cs:65-101`, `src/PaginaCartelle.cs:85-113`, `src/PaginaOrari.cs:75-107`, `src/PaginaPrivacy.cs:53-81`. | Una correzione all'escape portata in una copia sola farebbe divergere i generatori. | bassa |
| A-40 | La navigazione è legata all'ordine delle pagine: «Cominciamo» chiama `VaiA(1, 1)`, e `VaiAStrumento` cerca per sottostringa senza avvisare; «Impostazioni» contiene «posta». | `src/PaginaPosta.cs:216`; `src/Guscio.cs:168-173, 416-421`; `src/PaginaOrari.cs:159`. | Riordinare le pagine rompe in silenzio i bottoni verso Posta. | bassa |
| A-41 | La versione del prodotto è scritta a mano in otto punti di sei file, e il rilascio ne controlla tre: non `AssemblyFileVersion` (che SignPath confronterà), né l'installer C#, né le costanti degli script. | `src/Guscio.cs:30-31`; `src-installer/Installa.cs:36-37`; `src/Aggiornamenti.cs:47`; `installer/Campanella.iss:22`; `src/risorse/Moduli.gs:61`; `src/risorse/Pannello.gs:68`; `.github/workflows/release.yml:53-61`. | Rischio di manutenzione; quasi metà dei commit su quei file serve solo a cambiare il numero. | bassa |
| A-42 | Codice senza chiamanti: i campi `Posta`, `Cartelle`, `Orari`, `Privacy` e il costruttore vuoto di `Guscio`; `Stato.TrovaPersona` e `Parole`, ultimo residuo dell'abbinamento cognome-indirizzo tolto nella 1.2.0; `Xlsx.NomeColonna`, `Tema.Ombra`, `RisultatoOrario.Disposizione`, `Lezione.NomeGiorno`, `EsitoFile.Origine/Destinazione`. `Anonimizzatore.cs` è compilato nell'installer senza essere usato. `Lezione.Materia` e `Aula` sono lette e salvate nel file dei dati senza alcun uso. | `src/Guscio.cs:140-145`; `src/Stato.cs:939-984, 103-112`; `src/Xlsx.cs:287-298`; `src/Orario.cs:36, 66, 308-309, 344-345`; `build.ps1:117`; `docs/Nota-tecnica-DS-DPO.md:79`; compilazioni senza questi elementi riuscite. | Codice da mantenere senza funzione, e due dati conservati senza motivo nel file dei dati personali. | bassa |
| A-43 | `Anonimizzatore.Trattabile` e `Temporaneo` non hanno chiamanti, mentre `PaginaPrivacy` ricopia la condizione; l'elenco delle estensioni è ripetuto e il messaggio di salto cita solo PDF, TXT e MD. | `src/Anonimizzatore.cs:55, 103-118, 159`; `src/PaginaPrivacy.cs:412, 446-447, 543-544`. | Cosmetico: messaggio impreciso e conteggio dei file non gestiti gonfiato. | bassa |
| A-44 | Le prove PowerShell cercano campi e metodi per nome con la reflection, anche privati in `prova_disposizione.ps1`. | `test/prova_disposizione.ps1:149-158, 272-280`; `test/prova_personale.ps1:39-42`. | Una ridenominazione si scopre solo lanciando la prova, che oggi è fuori CI (A-4). | bassa |
| A-45 | «Scrivere a un gruppo» mette gli indirizzi dei colleghi nel parametro `bcc` di un URL aperto nel browser, e le copie di dati personali negli appunti non escludono la cronologia e la sincronizzazione degli appunti di Windows. | `src/PaginaPosta.cs:516-536, 551-560`; `src/Guscio.cs:449-470`. | Indirizzi nella cronologia del browser e, se attivi, nella cronologia e nel cloud degli appunti. La parte documentale è in DOC-5. | bassa |
| A-46 | L'estensione Chrome esegue lo script sulla scheda attiva senza controllarne l'indirizzo, e la versione del suo manifest è ferma a `1.0`. | `src/risorse/estensione_personale/popup.js:20-23, 57-68`; `src/risorse/estensione_personale/manifest.json:4`. | Su altre pagine l'unico effetto è uno scorrimento non richiesto (la lettura cerca solo i marcatori del registro); una copia vecchia non si riconosce. | bassa |
| A-47 | `strumenti/firma.ps1` crea un certificato autofirmato con chiave esportabile e, salvo `-SenzaAttendibilita`, lo mette in Root e TrustedPublisher dell'utente, dove resta; `build.ps1` non passa mai quell'opzione. | `strumenti/firma.ps1:43-80`; `build.ps1:148-153`; `PRIVACY.md:182-183`. | Igiene del PC del manutentore, non del prodotto: chi ha accesso al profilo può esportare la chiave. | bassa |
| A-48 | In un file di prova la parte locale di un indirizzo d'esempio è formata dal nome del manutentore (dominio inventato), contro la lista di controllo di `PRIVACY.md`. Il valore non si riporta qui. | `test/prova_moduli.ps1:147, 151, 160`; `PRIVACY.md:188-195`. | Minimo: è il nome già pubblico come autore, ma la regola che il progetto si è dato dice di usare nomi inventati. | bassa |
| A-49 | Il valore predefinito di `-Produzione` in `build.ps1` è un percorso personale del PC, ripetuto nel README italiano; il controllo arriva dopo la firma, che installa il certificato. | `build.ps1:24, 148-166`; `README.it.md:50`. | Portabilità: chi prova `-Pubblica` senza quell'unità si ritrova un certificato installato prima dell'errore. | bassa |
| A-50 | Costanti e valori predefiniti ripetuti come letterali in più file e linguaggi: indirizzo di rizzo-pii, fuso orario, chiusura «31/08», nomi dei documenti, nomi dei file di configurazione. | `src/Stato.cs:170, 176`; `src/Anonimizzatore.cs:51`; `src/Moduli.cs:30, 34, 208, 307, 342, 537`; `build.ps1:40-46`; `src/Guscio.cs:492-494`; `src-installer/Installa.cs:50-52`; `installer/Campanella.iss:87-90`. | Una modifica fatta in un punto solo lascia indietro gli altri; un documento mancante si scopre solo premendo il pulsante. | bassa |
| A-51 | `campanella.json` e `campanella-dati.json` non hanno un numero di formato, e `Salva` scrive solo le chiavi note: un computer con una versione più vecchia che condivide il file del Drive cancella a ogni chiusura i campi introdotti dopo, come `verificato`. | `src/Stato.cs:378-515, 487, 638`. | Un PC con la 1.4.4 o precedente azzera la verifica degli indirizzi di tutti. | bassa |
| A-52 | `Stato.Drive` si inizializza con `DriveDiDefault()` a ogni `new Stato()`, anche quando il valore salvato lo sostituisce subito. | `src/Stato.cs:161, 238-286, 549`. | Circa 9 ms con unità fisse; possibile rallentamento con unità di rete scollegate. È anche ciò che rende pericolose le prove su `Stato` (A-15). | bassa |
| A-53 | Le 25 mutazioni del motore del foglio di controllo citate nel commit `9534dd5` non sono ripetibili: nessuno strumento né elenco è nel repository. | `git log --grep=mutaz`; `test/mock_pannello.js:17-22`. | Manca solo la misura della forza dei banchi. | bassa |
| A-54 | `prova_solalettura.ps1` e `prova_installer.ps1` aspettano con pause fisse invece che su una condizione. | `test/prova_solalettura.ps1:71-75`; `test/prova_installer.ps1:119-122, 146-150`. | Instabilità osservata in questa revisione: `prova_solalettura` è fallita una volta e passata alla seconda (capitolo 11.1). | bassa |
| A-55 | Selettori della pagina del registro e classificazione dei ruoli sono copiati fra estensione, funzione da console e `Stato.CategoriaRuolo`, senza una prova che li confronti. | `src/risorse/estensione_personale/popup.js:53-113`; `src/risorse/estrai_personale_spaggiari.js:31-102`; `src/Stato.cs:747-761`. | Una modifica della pagina del registro va riportata in due copie JS; le categorie effettive le ricalcola il C#. | bassa |
| A-56 | `Moduli.gs` e `Pannello.gs` contengono 15 coppie di funzioni identiche a meno del prefisso, senza una prova che ne controlli l'allineamento. | Per esempio `src/risorse/Moduli.gs:428, 450, 529, 641` contro `src/risorse/Pannello.gs:1072, 1078, 1150, 1353`. | Una correzione su un gemello solo lascia il difetto nell'altro script già incollato; A-5 ne è un caso. | bassa |
| A-57 | Il nome del calendario, di partenza «Orario » più il docente scelto, sta nelle impostazioni e finisce sempre in `campanella.json`, anche con i dati nel Drive. | `src/Stato.cs:190-191, 455, 479, 565`; `src/PaginaOrari.cs:598-599`. | Resta sul PC un cognome, quasi sempre del docente stesso, contro la promessa che in quella modalità il file locale non contiene dati di altri. | bassa |
| A-64 | Il periodo dell'orario non viene salvato: dopo un riavvio `DatiOrari.gs` dice «periodo non indicato», e l'oggetto delle email e la descrizione degli eventi lo perdono. La regola D/DISP e la fusione in blocchi sono scritte sia in C# sia in `Orari.gs`, oggi con lo stesso risultato. | `src/Stato.cs:505-513`; `src/PaginaOrari.cs:127-140`; `src/Orario.cs:61-67, 407-430, 440`; `src/risorse/Orari.gs:382-396, 441-446`. | Informazione mancante nelle email; rischio di divergenza futura. | bassa |
| A-65 | Il lettore `.xlsx` scarta le celle senza attributo `r`, che lo standard ammette, e non limita gli indici di riga e colonna: un file di 300 byte può allocare 125 MB. | `src/Xlsx.cs:219-236, 274-285, 39-51`; sonde su file costruiti ad arte. | Un file valido ma insolito risulta «non riconosciuto»; il file lo sceglie l'utente. | bassa |
| A-66 | L'indirizzo del docente si ricava solo da `Session.getActiveUser()`, senza ripiego: se è vuoto, la ripresa degli orari si ferma con un errore e il riepilogo della Posta non parte. | `src/risorse/Orari.gs:99, 412, 533-539`; `src/risorse/Organizzazione_Gmail.gs:264-265, 841-844, 935-941`. Che sia vuoto nei trigger di uno script personale non è dimostrato. | Invio interrotto; nessun messaggio va ad altri. | bassa |
| A-67 | `ANNULLA_automazione` non toglie il trigger di ripresa degli orari, mentre la nota tecnica dice che i trigger di ripresa del progetto si disattivano così. | `src/risorse/Organizzazione_Gmail.gs:564-570`; `src/risorse/Orari.gs:157-164`; `docs/Nota-tecnica-DS-DPO.md:100-102, 173-175`. | Un trigger a colpo singolo resta attivo fino a fine invio; manda solo al docente. | bassa |
| A-68 | Le 137 funzioni interne degli script hanno `_` come prefisso: per Apps Script sono private solo quelle che finiscono con `_`, quindi compaiono tutte nel menu Esegui, con `_riordina` subito sotto `PASSO_3`. | `grep '^function _' src/risorse/*.gs`: Moduli 28, Orari 26, Posta 26, Pannello 57. | Menu affollato; lanciare a mano una funzione interna salta il lock, senza danni gravi. | bassa |
| A-69 | `prova_moduli.ps1` scrive i quattro script generati dentro `test/` invece che in una cartella temporanea; `genera_dati_prova.ps1` fa lo stesso con dati che possono essere veri. | `test/prova_moduli.ps1:55-58, 78-79, 185-186`; `test/genera_dati_prova.ps1:42`; `.gitignore:14-16`. | File generati nella copia di lavoro, protetti solo da `.gitignore`. | bassa |
| A-70 | `StatoPosta.LeggiCodice` usa `int.Parse` su `\d+`: un numero lungo o una cifra non ASCII lanciano un'eccezione non gestita. Il numero dei passi dell'installazione guidata è copiato a mano e la soglia conta sette spunte qualsiasi. | `src/Stato.cs:1164, 1177, 1212-1221`; `src/Guscio.cs:1036-1051`. | Finestra d'errore di .NET su un codice incollato male; giudizio «già fatto» sbagliato. | bassa |
| A-71 | «Rileggile» apre la stessa finestra dell'accettazione, con le spunte e «Non accetto», ma ne ignora il risultato. | `src/Guscio.cs:888-891`; `src/Consenso.cs:162-175, 219-248`. L'invariante regge: senza consenso l'app non parte (`src/Guscio.cs:68`). | Fa credere di poter ritirare il consenso; serve una finestra di sola lettura. | bassa |
| A-72 | Nella pagina iniziale, se il Drive impostato non ha modelli né anni e un altro sì, `Entra` esce prima di aggiornare le schede Orari e Privacy e il riepilogo. | `src/Guscio.cs:648-659` contro `:676-697`. | Schede vuote o ferme: si perde l'avviso su dove stanno i dati di altri. | bassa |
| A-73 | `Tema.Applica` riporta i colori al ruolo della `Tag`: il rosso di «Elimina regola» non si vede, un avviso ambra torna verde dopo il cambio di tema, e il cambio dalle Impostazioni non riaggiorna il menu. | `src/Dialoghi.cs:219-249`; `src/Tema.cs:194-258`; `src/Guscio.cs:229, 423-439, 1026-1034`; sonda sull'exe. | Estetico, ma toglie un segnale su un'azione distruttiva (che chiede comunque conferma). | bassa |
| A-74 | `struttura.json` modificato a mano con un errore viene ignorato in silenzio, e le sue voci non sono validate: una voce assoluta o con `..` crea cartelle fuori da «A.S. <anno>». | `src/PaginaCartelle.cs:416, 445-454, 1017`; provato su una radice finta. | Il file lo scrive solo l'utente; il danno resta a lui. | bassa |
| A-75 | `Dialoghi.Spezza` scarta le righe che cominciano con `(` anche nelle parole dell'oggetto, dove non c'è nessun testo segnaposto da saltare. | `src/Dialoghi.cs:262, 274`; `Spezza('(urgente)…')` restituisce solo le altre righe. | Una regola con «(urgente)» come unica parola viene generata disattivata. | bassa |
| A-76 | Con `build.ps1 -Firma` l'installer C# incorpora l'exe prima che venga firmato, quindi installa una copia non firmata. | `build.ps1:132, 141, 148-152`; il flusso corretto è in `.github/workflows/release.yml:93-120`. | Solo per il canale locale; si perde lo scopo dichiarato della firma locale. | bassa |
| A-77 | `strumenti/firma.ps1` esce dal ciclo dei server di marca temporale solo con lo stato `Valid`, quindi con un certificato non attendibile rifirma senza marca; `build.ps1` non controlla il suo codice d'uscita. | `strumenti/firma.ps1:98-125`; `build.ps1:148-153`; sonde con un certificato in memoria. | Firme locali senza marca, e `-Pubblica` che copia file non firmati. | bassa |
| A-78 | Lo scarico di rizzo-pii dalle Impostazioni non si può fermare (nessun controllo imposta `interrompi`), e il file parziale resta in `%TEMP%` dopo un errore. | `src/Guscio.cs:720, 1167-1193, 1210`; `src/Aggiornamenti.cs:153-178`. | Per fermare 1,2 GB bisogna chiudere Campanella. | bassa |
| A-79 | Chiudendo la finestra durante un lotto di anonimizzazione o uno scarico, il lavoro si interrompe in silenzio: i thread sono in background e nessuno chiede conferma. | `src/PaginaPrivacy.cs:95-99, 607-667`; `src/Guscio.cs:83-90, 181-189, 1114-1223`. | Elenco a metà senza riepilogo; gli originali non sono toccati. | bassa |

**Smentiti dalla verifica.**

- *Dati personali nella copia di lavoro* (`test-e-ci#9`): i file con dati veri sono ignorati per regole esplicite e non sono mai entrati nella storia; resta solo A-48.
- *`ORARI_ANNULLA_calendario` lascia gli eventi vecchi*: i testi chiedono di annullare prima di rigenerare, e con periodi sovrapposti le serie vengono tolte tutte.
- *`SalvaTutto` della Posta sovrascrive senza chiedere*: la cartella la sceglie l'utente e i file sono esportazioni aggiornate; resta una nota per la disattivazione in DOC-3.
- *Ordine del nominativo letto in due modi*: il valore fuori intervallo non si raggiunge nel flusso reale.
- *Installer C# riuscito anche senza l'exe incorporato*: `csc` si ferma prima se manca una risorsa.

## 5. Problemi documentali

Stessa regola del capitolo 4: ogni riga ha passato la verifica avversaria. I documenti per dirigente e DPO (`docs/`), `PRIVACY.md` e le condizioni (`installer/CONDIZIONI-*.txt`) sono documenti legali e di privacy. Qui se ne segnalano solo le frasi di fatto che il codice smentisce; se correggere il testo o il codice lo decide il manutentore. I testi scritti dal codice (aiuti dell'app, intestazioni degli script) si correggono nel codice.

| ID | Problema | Prova | Impatto | Priorità |
|---|---|---|---|---|
| DOC-1 | **[DPO] La nota tecnica descrive permessi diversi da quelli che Google chiederà.** Attribuisce l'invio a GmailApp senza citare MailApp e Session. Dice che Calendar si chiede solo usando `ORARI_4_calendario`, ma Posta e Orari non hanno un manifest e Google calcola i permessi sull'intero progetto. Lascia intendere un foglio di controllo senza Drive e con una sola attività programmata. | `docs/Nota-tecnica-DS-DPO.md:96-106, 127-142` contro `src/risorse/Orari.gs:24-27, 122, 187, 222-339, 535`, `src/risorse/Organizzazione_Gmail.gs:842, 937`, `src/risorse/Pannello.gs:214, 1131, 1319-1362`; `oauthScopes` solo in `src/Moduli.cs:348, 543`. La stessa frase su Calendar è in `src/risorse/Orari.gs:25-26` e `src/PaginaOrari.cs:824-826`. | Il DPO riceve un quadro inesatto: chi incolla `Orari.gs` solo per le email concede comunque Calendar. La schermata di consenso reale resta da osservare (capitolo 11.4). | media |
| DOC-2 | **[DPO] Frase assoluta «nessuna funzione cancella fogli o eventi».** Sta in quattro documenti, fra cui la nota tecnica, che la contraddice ai §4 e §5. `ORARI_ANNULLA_calendario` toglie eventi; il foglio di controllo elimina schede vuote di partenza e riscrive la propria scheda Istruzioni; lo svuotamento delle risposte è una cancellazione vera. Il codice toglie solo ciò che ha creato o che l'utente chiede. | `README.md:141-142`, `README.it.md:139-140`, `ISTRUZIONI - Campanella.txt:240-243`, `docs/Nota-tecnica-DS-DPO.md:51-55` contro `:103-106, 158-160`; `src/risorse/Orari.gs:294-296`; `src/risorse/Pannello.gs:29, 309-314, 355, 405, 836`. | Imprecisione in un documento consegnato al DPO, senza rischio per i dati. | media |
| DOC-3 | **[DPO] La procedura di disattivazione è incompleta.** Non copre i filtri nativi di Gmail, che restano e si tolgono a mano, né il «segna come letti», che non si annulla. Non cita `PANNELLO_ANNULLA`, e `MODULO_ANNULLA` solo al §4. La frase «ogni strumento ha la sua ANNULLA_» non è vera per i filtri. | `src/risorse/Organizzazione_Gmail.gs:231, 323, 440, 477, 480, 564-644`; `src/risorse/Moduli.gs:79`; `src/risorse/Pannello.gs:133`; `docs/Nota-tecnica-DS-DPO.md:56-59, 107-108, 158-180`; `README.md:145`; `ISTRUZIONI - Campanella.txt:82-83, 247`. | Chi segue la procedura consegnata al DPO lascia attivi i filtri dopo la revoca. | media |
| DOC-4 | **[DPO] «Nessun componente di rete» e versione 1.3.** La nota tecnica dice che il programma non ha componenti di rete, contraddicendo le proprie righe 65-67 e il codice (GitHub a richiesta, rizzo-pii anche in automatico). È ferma alla versione 1.3. Presenta la firma dei rilasci come attiva e descrive l'installer C# invece di quello pubblicato. | `docs/Nota-tecnica-DS-DPO.md:9, 65-67, 164-166`; `src/Aggiornamenti.cs:47, 60, 148`; `src/Anonimizzatore.cs:63, 214, 270`; `src/Guscio.cs:1064`; `PRIVACY.md:184-186` contro `.github/workflows/release.yml:21-22, 94`. | Il DPO valuta un trattamento descritto in modo non allineato al programma. | media |
| DOC-5 | **[DPO] «Scrivere a un gruppo» non compare nei documenti per il DPO.** Il pulsante prepara in Gmail una bozza in Ccn a un'intera categoria di colleghi. I documenti descrivono l'elenco del personale solo come mezzo per distinguere i messaggi. La funzione è dichiarata all'utente. | `src/PaginaPosta.cs:405-433, 511-548`; `docs/Email-DS-DPO.md:40-43`; `docs/Nota-tecnica-DS-DPO.md:32, 68, 76`; `docs/GDPR-e-DPO.md:146-148`; dichiarata in `ISTRUZIONI - Campanella.txt:122-130`. | Descrizione incompleta dell'uso dei dati dei colleghi. La parte tecnica è A-45. | media |
| DOC-6 | **[DPO] L'elenco del personale finisce nel registro delle esecuzioni, e i documenti non lo dicono.** `EXTRA_elencaIndirizziScuola` scrive nomi e indirizzi nel registro di Apps Script e li manda in un'email a sé stessi. La tabella «Dove sta» della nota tecnica cita solo il file di configurazione e il PC o il Drive, e la guida dell'app dice che il registro mostra solo quanti ne ha trovati. | `src/risorse/Organizzazione_Gmail.gs:402-418, 935-940`; `test/mock_apps_script.js:468-469` (voluto e provato); `src/PaginaPosta.cs:945-947, 1647-1649`; `docs/Nota-tecnica-DS-DPO.md:76, 79`. | La tabella dei luoghi dei dati è incompleta, e la durata di conservazione del registro non è indicata; i dati non escono dall'account. | bassa |
| DOC-7 | **Le istruzioni allegate al rilascio descrivono l'installer C#, non quello pubblicato.** Parlano di due caselle, della casella di rizzo-pii e di `Disinstalla Campanella.exe`, mentre i rilasci danno solo l'installer Inno. Anche la promessa sullo scarico di rizzo-pii durante l'installazione è falsa per l'installer pubblicato. | `ISTRUZIONI - Campanella.txt:43-54, 228-229, 264-272` contro `installer/Campanella.iss:17-18, 44, 65-66, 78-95` e `.github/workflows/release.yml:115-156`; `src-installer/Installa.cs:219-231, 282, 499`. | Chi installa segue passi e nomi di file di un altro programma: il file è allegato, installato e collegato nel menu Start. | media |
| DOC-8 | In modalità prova `PASSO_2_creaEtichette` crea comunque le etichette, mentre i testi promettono che «non si crea nemmeno un'etichetta»; la procedura guidata lo esegue prima di togliere la prova. | `src/risorse/Organizzazione_Gmail.gs:94-125, 434`; `src/PaginaPosta.cs:199-202, 666, 808-822, 1831-1832`; `ISTRUZIONI - Campanella.txt:141-142`; `test/mock_apps_script.js:328-333`. | Etichette vuote create durante la prova; nessun messaggio toccato. | bassa |
| DOC-9 | I README sono incompleti su build e prove: mancano `-Firma`, `src/Dialoghi.cs`, `strumenti/firma.ps1`, `prova_personale.ps1`, `prova_disposizione.ps1`, i prerequisiti (Node, Python) e quali prove girano in CI. Non avvertono che `-Firma` e `-Pubblica` installano un certificato radice, né che `prova_installer.ps1` tocca il menu Start reale. | `README.md:52-55, 74-95, 103-113`; `README.it.md:50, 70-91, 100-110`; `build.ps1:7, 148-153`. | Chi contribuisce non trova tutte le prove da lanciare e può installare un certificato senza saperlo. | bassa |
| DOC-10 | Quattro testi di aiuto sbagliati: la ripresa «da sola il giorno dopo» degli orari a quota finita (il codice non la programma); il rimando al passo 2 di «Organizzazione Gmail» nella funzione da console (è lo strumento Posta, passo 3); l'elenco dei formati accettati da rizzo-pii; la promessa del disinstallatore C# di conservare le impostazioni. | `src/PaginaOrari.cs:521-524` e `ISTRUZIONI - Campanella.txt:205-207` contro `src/risorse/Orari.gs:102-144`; `src/risorse/estrai_personale_spaggiari.js:23-25` contro `:185-187`; `src/Anonimizzatore.cs:159`; `src-installer/Installa.cs:735-769`. | Istruzioni che portano fuori strada. | bassa |
| DOC-11 | **[privacy] `PRIVACY.md` ha tre imprecisioni di fatto.** Il comando di controllo prima del push restituisce anche file attesi che mancano dall'elenco. La frase «il binario locale è firmato» vale solo con `-Firma` o `-Pubblica`. I collegamenti a `docs/*.md` non esistono nella copia installata, dove i documenti sono `.txt` nella cartella `documenti`. | `PRIVACY.md:5, 29-34, 121-123, 182-183`; `.gitignore:20-21`; `build.ps1:43-47, 148-153`; `installer/Campanella.iss:85-90`. | Chi segue la lista di controllo impara a ignorare i risultati inattesi. | bassa |
| DOC-12 | Nomi vecchi e requisiti incoerenti nei metadati. Il manifest incorporato nell'exe porta ancora il nome e la descrizione del progetto precedente e dichiara Windows 7-11; l'installer accetta Windows 7 SP1 mentre i documenti dicono 10/11. Le intestazioni di `strumenti/firma.ps1` e della configurazione SignPath citano nomi superati. | `src/app.manifest:3-4, 16-27`; `installer/Campanella.iss:62`; `README.md:41`, `README.it.md:37`, `ISTRUZIONI - Campanella.txt:28`, `.github/workflows/release.yml:184`; `strumenti/firma.ps1:5, 9`; `installer/signpath-artifact-configuration.xml:8`. | Confonde chi mantiene firma e SignPath; l'installer si avvia su sistemi non provati. | bassa |
| DOC-13 | Il fumetto «Il foglio di controllo» della pagina Cartelle dice che il foglio si aggiorna da solo quando si aggiunge o si toglie un modulo; il motore e tutte le altre istruzioni dicono il contrario. | `src/PaginaCartelle.cs:592-594`; `src/risorse/Pannello.gs:84, 214, 499, 1131` (solo `onOpen` e trigger a tempo); introdotto con `ad2bb36`. | Chi aggiunge un modulo può non eseguire «Prepara l'anno nuovo»; nel foglio le istruzioni sono giuste. | bassa |
| DOC-14 | I nomi delle funzioni degli script sono ripetuti come testo nel C# e nei documenti senza una prova che li confronti con i `.gs`; l'intestazione di `Organizzazione_Gmail.gs` non elenca `EXTRA_codiceStato`, che l'app chiede di eseguire. | `src/risorse/Organizzazione_Gmail.gs:29-44, 528`; `src/Guscio.cs:800`; citazioni in `src/PaginaPosta.cs`, `src/PaginaOrari.cs:501-524, 824-837`, `src/Moduli.cs:480-499, 597-703`, `docs/`. | Oggi i nomi coincidono; una rinomina lascerebbe istruzioni sbagliate senza segnali. | bassa |
| DOC-15 | **[DPO] I documenti parlano del «tuo» orario, ma il passo del calendario accetta qualunque docente del tabellone,** e il cognome scelto finisce nella descrizione degli eventi. `GDPR-e-DPO.md` non parla per niente dello script dei moduli, e quindi neanche dello svuotamento delle risposte. Nella pagina Posta, una frase dice che l'elenco del personale è riusato dagli Orari, che non lo leggono più dalla 1.2. | `src/PaginaOrari.cs:589-601, 753-754, 770-773`; `src/risorse/Orari.gs:325-332, 402`; `docs/GDPR-e-DPO.md:107-108` (nessuna occorrenza di «modul»); `docs/Email-DS-DPO.md:27-28`; `docs/Nota-tecnica-DS-DPO.md:44, 79, 105`; `src/PaginaPosta.cs:278-279`. | Il documento per il DPO descrive un perimetro più stretto di quello che l'interfaccia permette. Nel codice basta chiedere «il tuo nome» invece di «il docente». | media |
| DOC-16 | **[condizioni d'uso] Le condizioni non coprono il foglio di controllo.** Il punto 1 del testo accettato (`CONDIZIONI-it`, `CONDIZIONI-en`, `Consenso.Testo`) descrive solo lo script dentro il modulo. Il foglio di controllo, arrivato dopo il passaggio del consenso alla versione 3, chiede il permesso su tutti i moduli, sui fogli e sul Drive. La versione è rimasta 3. | `installer/CONDIZIONI-it.txt:15-20`; `installer/CONDIZIONI-en.txt:15-20`; `src/Consenso.cs:21, 40-45`; `src/Moduli.cs:349-352` contro `:544-547`; storia: `8a9a552` (versione 3) precede `900b37f` (primo commit di `Pannello.gs`, che aggiorna gli altri documenti ma non le condizioni). | Il consenso versionato non copre una funzione. `PRIVACY.md`, la nota tecnica e l'app avvisano del permesso più largo al momento della scelta. Il testo lo decide il manutentore; se cambia, la versione passa a 4 (A-25). | media |

## 6. Proposte di refactoring

Ogni scheda raggruppa rilievi che si correggono insieme. Nessuna chiede una riscrittura né di abbandonare C# 5. Sono passi da un commit ciascuno, con una prova che fallisce prima e passa dopo, come il progetto fa già con i banchi e con le mutazioni. Una regola vale per tutte le prove nuove che toccano `Stato`: **mai con i percorsi predefiniti**. `Drive` e `CartellaDati` vanno sempre messi in una cartella temporanea, perché oggi `new Stato()` punta al Drive reale (A-15). Le stime sono in giorni di lavoro di una persona.

### R-1 Salvataggi che non distruggono i dati dell'utente
- **Obiettivo:** nessuna scrittura deve sostituire dati che il programma non ha letto, e nessuna cancellazione irreversibile deve partire senza la prova che i dati sono già salvati altrove. (A-1, A-58, A-62, A-24, A-15, A-52)
- **File:** `src/Stato.cs`, `src/Guscio.cs` (Main, `ApplicaDati`, chiusura), `src/Consenso.cs`, `src/risorse/Moduli.gs`, `src/risorse/Pannello.gs`, `src/Anonimizzatore.cs`, `src/PaginaPrivacy.cs`, `test/prova_stato.ps1` (nuovo), `test/mock_moduli.js`, `test/mock_pannello.js`.
- **Passi:**
  1. `Drive = ""` nell'inizializzatore di `Stato`, con `DriveDiDefault()` chiamato solo dentro `Carica`. Da qui in poi le prove su `Stato` diventano sicure.
  2. Nuova `test/prova_stato.ps1`. Compila un piccolo programma ospite con `Stato.cs` in una cartella temporanea e prova tre casi: file del Drive assente, troncato, e spostamento verso un file esistente. Oggi fallisce.
  3. In `Carica` separare «file assente» da «file illeggibile». `Salva` non scrive un `campanella-dati.json` esistente che non è stato letto in questa sessione, e lo dice all'utente alla chiusura. `ApplicaDati` chiede prima di sostituire un file già presente. `SpostaDati` ripristina sede e flag se fallisce, e cancella la copia vecchia quando cambia cartella dentro il Drive.
  4. Scrittura atomica solo per `campanella.json`: `.tmp` e `File.Replace`, senza copie `.bak`, che sarebbero dati personali in posti non dichiarati.
  5. In `Moduli.gs` e `Pannello.gs` lo svuotamento parte solo se ogni timestamp delle risposte compare in una scheda dei candidati. `Moduli.gs` non scollega un modulo rimasto aperto, come fa già il Pannello, e la conferma non dice «Non cancello niente» quando lo svuotamento è attivo.
  6. In `Anonimizza` si salta un file se origine e destinazione coincidono; in `Avvia3` si rifiuta una destinazione uguale a una cartella d'origine.
- **Rischio:** medio sul passo 3, perché cambia il comportamento alla chiusura. Va provato su un Drive finto prima che sul PC.
- **Verifica:** `prova_stato.ps1` rossa prima e verde dopo. Gli scenari «Annulla + 10 risposte» e «chiusura fallita» lasciano le risposte nel modulo, e «DUE ANNI DI FILA» le toglie ancora. `prova_anonimizzazione.ps1` con origine uguale alla destinazione lascia intatta l'impronta dell'originale.
- **Priorità:** alta · **Giorni:** 3 · **Dipende da:** nessuna.

### R-2 Generatori che non si possono iniettare
- **Obiettivo:** nessun valore letto da un file dell'utente deve poter uscire da un commento o da una stringa negli script generati. (A-2)
- **File:** `src/Orario.cs`, `test/prova_orario.ps1`.
- **Passi:**
  1. Un helper `TestoCommento` in `AnalisiOrario`: riduce spazi e a capo, compresi U+2028 e U+2029, a uno spazio, e sostituisce `*/`.
  2. Usarlo a `src/Orario.cs:440`.
  3. In `prova_orario.ps1` generare `DatiOrari.gs` da un tabellone con `*/` in una cartella temporanea ed eseguirlo in un contesto `vm` di node, dove deve esistere solo `ORARI`.
- **Rischio:** nullo sui tabelloni normali.
- **Verifica:** la prova fallisce oggi e passa dopo. Con il tabellone d'esempio l'uscita è identica, data esclusa.
- **Priorità:** alta · **Giorni:** 0,5 · **Dipende da:** nessuna.

### R-3 Una CI che ferma le regressioni
- **Obiettivo:** ogni prova esistente deve poter fermare un commit, non solo un rilascio. (A-3, A-4, A-13, A-26, A-27, A-28, A-44, A-69, D-4)
- **File:** `.github/workflows/release.yml`, `.github/workflows/prove.yml` (nuovo), `test/prova_personale.ps1`, `test/prova_installer.ps1`, `test/mock_pannello.js`, `test/prova_moduli.ps1`, `test/prova_posta.ps1` e `test/prova_xlsx.ps1` (nuove).
- **Passi:**
  1. Subito: controllare `$LASTEXITCODE` dopo ogni `node` in `release.yml:72-75`.
  2. Un workflow `prove.yml` su push e pull request, con `contents: read` e nessun segreto: build `-SenzaInstaller` più la compilazione dell'installer C#, un passo per ogni banco, `prova_orario`, `prova_moduli`, `prova_personale`.
  3. `prova_posta.ps1`: genera `Configurazione.gs` dal generatore vero con uno `Stato` inventato, in una cartella temporanea, e lo passa a `mock_apps_script.js`. Lo stesso per `DatiOrari.gs` in `prova_orario.ps1`.
  4. `prova_xlsx.ps1`: un `.xlsx` generato al momento dalla griglia del CSV.
  5. Le prove che non possono fallire devono poterlo fare (`IsWindowEnabled` al posto di `Control.FromHandle`); `mock_pannello.js` indipendente dal fuso; controllo che l'exe non sia più vecchio dei sorgenti.
  6. `prova_installer.ps1` si ferma se trova un'installazione vera, e `prova_moduli.ps1` scrive in `%TEMP%`.
- **Rischio:** basso. Ogni passo può rendere rossa una PR che oggi passa, ed è lo scopo.
- **Verifica:** su un ramo di prova, un `verifica('x', false)` in `mock_apps_script.js` rende rosso il passo, e una categoria rotta in `prova_personale` pure.
- **Priorità:** alta (passi 1-2), media (il resto) · **Giorni:** 2 · **Dipende da:** R-1 passo 1 per le prove su `Stato`.

### R-4 Consenso e versioni controllati prima del tag
- **Obiettivo:** il consenso versionato è un invariante, e non deve dipendere da un commento o dai parametri dell'installazione. (A-25, A-20, A-41, A-9, A-71, DOC-16)
- **File:** `test/prova_versioni.ps1` (nuovo, in sola lettura), `.github/workflows/release.yml`, `installer/Campanella.iss`, `src/Consenso.cs`, `src/Guscio.cs`, `src/risorse/*.gs`.
- **Passi:**
  1. Uno script, lanciato dal workflow e dal manutentore prima del tag, che confronta:
     - `Consenso.Versione` con `#define ConsensoVersione`;
     - `Consenso.Testo` con `CONDIZIONI-it.txt`, normalizzati;
     - un'impronta del testo per versione, perché un testo cambiato senza nuova versione fallisca;
     - `AssemblyFileVersion`, le versioni dell'installer C# e le costanti degli script cambiati dall'ultimo tag.
  2. In `Campanella.iss`, `and not WizardSilent` prima di scrivere il consenso.
  3. `FormConsenso` in sola lettura per «Rileggile».
  4. `_POSTA_VERSIONE` e `_ORARI_VERSIONE` stampate dalle anteprime.
  5. Se il manutentore aggiorna le condizioni per il foglio di controllo, versione 4.
- **Rischio:** basso.
- **Verifica:** su un ramo di prova, cambiare solo il `#define`, solo una parola delle condizioni o solo `Pannello.gs` fa fallire lo script; i file di oggi passano.
- **Priorità:** media · **Giorni:** 1 · **Dipende da:** nessuna.

### R-5 Invarianti degli script presidiati dai banchi
- **Obiettivo:** le promesse fatte al DPO devono essere prove, non solo testo. (A-10, A-22, A-61, DOC-2, DOC-14)
- **File:** `test/mock_apps_script.js`, `test/mock_orari.js`, `test/nomi_funzioni.js` (nuovo), `src/risorse/Organizzazione_Gmail.gs`.
- **Passi:**
  1. Registrare tutte le opzioni di `sendEmail` e verificare che ogni email vada solo all'account, senza cc né bcc.
  2. Controlli statici su `Organizzazione_Gmail.gs` e `Orari.gs`, che ignorano i commenti: niente `UrlFetchApp`, `forward`, condivisioni, cestino; azioni dei filtri limitate alle etichette. Poi un elenco delle cancellazioni ammesse per file.
  3. Nomi delle funzioni citati da app e documenti verificati contro i `.gs`.
  4. Prova di `ANNULLA_etichettatura` con prefisso vuoto e un'etichetta messa a mano. Poi lo script ricorda le etichette che crea e svuota solo quelle.
- **Rischio:** basso.
- **Verifica:** su una copia temporanea, un destinatario estraneo, un `UrlFetchApp` o un `moveToTrash` fanno fallire i banchi; il repository di oggi passa.
- **Priorità:** media · **Giorni:** 1,5 · **Dipende da:** R-3 passo 1.

### R-6 Il foglio di controllo e lo script nel modulo allineati e robusti
- **Obiettivo:** portare in `Moduli.gs` le protezioni della 1.4.6, e rendere il foglio di controllo sicuro con molti moduli e molti anni. (A-5, A-6, A-7, A-30, A-31, A-36, A-37, A-56)
- **File:** `src/risorse/Moduli.gs`, `src/risorse/Pannello.gs`, `test/mock_moduli.js`, `test/mock_pannello.js`, `test/prova_gemelli.js` (nuovo).
- **Passi:**
  1. Prima gli scenari nei banchi, rossi oggi: modulo chiuso a mano, chiusura già scattata, memoria oltre 9 KB (limite nel finto), riga fallita, 24 chiusure fallite, esecuzione lunga.
  2. In `Moduli.gs`, memoria delle chiusure e della preparazione come nel Pannello.
  3. Nel Pannello:
     - `fogli` salvato per anno;
     - chiusure ricostruite per le righe fallite;
     - trigger scattato tolto con `e.triggerUid`;
     - scadenza di 260 s;
     - lock breve nelle chiusure.
  4. `prova_gemelli.js` confronta le 15 funzioni gemelle.
- **Rischio:** medio: sono i motori che girano nei moduli dei docenti. Ogni cambio va accompagnato da «Script da reincollare» nel CHANGELOG.
- **Verifica:** gli scenari nuovi passano, e le 99 e 197 prove esistenti restano verdi.
- **Priorità:** media · **Giorni:** 3 · **Dipende da:** R-4 per la regola delle versioni.

### R-7 Orari: lettura e calendario corretti
- **Obiettivo:** l'orario letto deve essere quello del file, e il calendario non deve duplicarsi. (A-59, A-60, A-8, A-11, A-64, A-65, A-32, A-33, A-66)
- **File:** `src/Orario.cs`, `src/Xlsx.cs`, `src/PaginaOrari.cs`, `src/Stato.cs`, `src/risorse/Orari.gs`, `test/prova_orario.ps1`, `test/mock_orari.js`.
- **Passi:**
  1. `Lezione.Giorno` sempre assoluto (0 = lunedì), con l'elenco delle colonne salvato e ripristinato; `Periodo` salvato.
  2. Lettura del testo con BOM, poi UTF-8 rigoroso, poi Windows-1252.
  3. Celle senza `r` e indici limitati a quelli di Excel.
  4. In `ORARI_4_calendario`, errore esplicito se esistono già serie contrassegnate nel periodo.
  5. Etichetta degli orari ricavata dal prefisso.
  6. Ripresa riprogrammata quando il lock è occupato.
  7. Ripiego su `getEffectiveUser` per l'indirizzo, che resta quello del proprietario.
- **Rischio:** medio sul passo 1, perché cambia i dati salvati. Serve la lettura del formato vecchio.
- **Verifica:** tabelloni inventati senza lunedì o senza mercoledì e un CSV ANSI danno celle sotto il giorno giusto e nomi intatti; il tabellone d'esempio produce gli stessi dati di oggi.
- **Priorità:** media · **Giorni:** 2 · **Dipende da:** R-3 per le prove in CI.

### R-8 rizzo-pii: solo locale, scarico integro
- **Obiettivo:** far rispettare dal codice la promessa «nessuna rete» sui dati da anonimizzare, e non avviare installer incompleti. (A-12, A-18, A-78, D-5, D-6)
- **File:** `src/Anonimizzatore.cs`, `src/Aggiornamenti.cs`, `src/Guscio.cs`, `src-installer/Installa.cs`, `test/prova_anonimizzazione.ps1`, `test/finto_rizzo.py`.
- **Passi:**
  1. Un metodo privato `Url()` in `Anonimizzatore` che accetta solo `http` o `https` con host di loopback; `Salute` torna non pronto con un messaggio chiaro, e le richieste lanciano un'eccezione.
  2. In `Scarica`, confronto dei byte con la dimensione attesa e con il `digest` SHA-256 dell'asset, e cancellazione del parziale su ogni errore.
  3. Un pulsante per fermare lo scarico.
  4. Solo `Tls12`.
  5. Rifiuto di una risposta senza `anonymized_text`.
- **Rischio:** basso.
- **Verifica:** con un indirizzo non locale e irraggiungibile (uno di quelli riservati alla documentazione) la salute non è pronta in meno di un secondo; con `127.0.0.1` e il finto servizio le prove passano; con un server che chiude a metà, nessun file resta e l'installer non parte.
- **Priorità:** media · **Giorni:** 1 · **Dipende da:** nessuna.

### R-9 Un solo installer di riferimento
- **Obiettivo:** chi scarica il rilascio deve trovare istruzioni per quel programma, e nessuna disinstallazione deve cancellare file dell'utente. (A-17, A-76, A-77, DOC-7)
- **File:** `src-installer/Installa.cs`, `build.ps1`, `ISTRUZIONI - Campanella.txt`, README, `strumenti/firma.ps1`.
- **Passi:**
  1. Subito: il disinstallatore C# cancella solo un elenco fisso di file, conserva `struttura.json` quando si tengono le impostazioni, e si rifiuta di lavorare in una cartella senza `Campanella.exe`.
  2. Istruzioni riscritte per l'installer Inno pubblicato.
  3. Decidere quale installer è quello di riferimento. Se è Inno, far copiare a `-Pubblica` l'output Inno, rendere `-SenzaInstaller` il comportamento normale e dismettere `src-installer` dopo un rilascio.
  4. In `build.ps1` firmare l'exe prima di incorporarlo e fermarsi se la firma fallisce.
- **Rischio:** basso per il passo 1, da decidere per il passo 3.
- **Verifica:** una variante di `prova_installer.ps1` con un file estraneo nella cartella lo ritrova dopo la disinstallazione; con «No» `struttura.json` resta.
- **Priorità:** media · **Giorni:** 1 · **Dipende da:** nessuna.

### R-10 Dati personali solo nei posti dichiarati
- **Obiettivo:** chiudere le tre uscite di dati personali dai luoghi che `PRIVACY.md` dichiara. (A-19, A-45, A-57, A-22)
- **File:** `src/risorse/estrai_personale_spaggiari.js`, `src/PaginaPosta.cs`, `src/Guscio.cs`, `src/Stato.cs`, `src/risorse/Organizzazione_Gmail.gs`.
- **Passi:**
  1. La funzione da console scarica il CSV solo se la copia negli appunti fallisce.
  2. «Scrivere a un gruppo» passa sempre dagli appunti, senza `bcc` nell'URL.
  3. Copie negli appunti con i formati che le escludono dalla cronologia e dal cloud di Windows.
  4. `calNome` spostato fra i dati personali.
  5. Il registro delle esecuzioni riceve l'elenco degli indirizzi solo se l'email a sé stessi non parte; guida e testi corretti sugli esclusi.
- **Rischio:** basso.
- **Verifica:** `grep "bcc="` vuoto; con appunti funzionanti nessun file nei download; con i dati nel Drive, `campanella.json` senza `calNome`.
- **Priorità:** media · **Giorni:** 1 · **Dipende da:** nessuna.

### R-11 Avviso di nuove versioni e script da reincollare
- **Obiettivo:** chi ha installato deve sapere che c'è una correzione, anche per gli script. (A-23, A-9)
- **File:** `src/Aggiornamenti.cs`, `src/Guscio.cs`, `ISTRUZIONI - Campanella.txt`, `CHANGELOG.md`.
- **Passi:**
  1. `UltimoCampanella()` sulla stessa API, interrogato solo premendo «Cerca aggiornamenti», con un avviso e un collegamento alla pagina dei rilasci, senza scaricare nulla.
  2. Riga «Script da reincollare» nel CHANGELOG.
  3. Segnalare al manutentore i due documenti per il DPO che descrivono le connessioni.
- **Rischio:** basso: nessuna connessione nuova senza un clic.
- **Verifica:** con una versione più bassa compilata in una prova l'avviso compare, con quella del tag no, e senza rete il messaggio su rizzo-pii resta.
- **Priorità:** media · **Giorni:** 0,5 · **Dipende da:** R-4.

### R-12 Pulizia a basso rischio
- **Obiettivo:** meno codice da mantenere e meno sorprese. (A-14, A-38, A-39, A-40, A-42, A-43, A-63, A-68, A-70, A-72, A-73, A-74, A-75, A-79)
- **Passi, un commit ciascuno:**
  1. Classi spezzate solo sugli a capo.
  2. `Application.ThreadException` con un messaggio breve.
  3. Rete fuori dal thread dell'interfaccia in Impostazioni e Privacy.
  4. `VaiAPagina` al posto degli indici.
  5. Una sola funzione di escape JavaScript.
  6. Rimozione del codice senza chiamanti e di `Materia` e `Aula`.
  7. `int.TryParse` in `LeggiCodice`.
  8. Suffisso `_` alle funzioni interne senza parametri.
  9. `return` sostituito in `PaginaHome.Entra`.
  10. Ruolo `Pericolo` nel tema.
  11. Validazione di `struttura.json`.
  12. Conferma alla chiusura durante un lavoro in corso.
- **Rischio:** basso per commit singolo.
- **Verifica:** `build.ps1` completo, `prova_disposizione.ps1`, e le prove della parte toccata.
- **Priorità:** bassa (media per il passo 1) · **Giorni:** 3 · **Dipende da:** R-3.

### R-13 Documenti per il DPO allineati al codice
- **Obiettivo:** ogni frase di fatto dei documenti consegnati al DPO deve corrispondere al codice. (DOC-1 … DOC-6, DOC-15, DOC-16, A-21)
- **File:** capitolo 8.1.
- **Passi:**
  1. Un commit per documento, con le sole frasi di fatto.
  2. Osservare dal vivo, in un account di prova, la schermata di consenso di Posta+Orari, del modulo con e senza manifest e del foglio di controllo.
  3. Se il manifest del modulo, messo prima della prima esecuzione, restringe davvero il permesso, renderlo un passo obbligatorio.
- **Rischio:** nullo sul codice.
- **Verifica:** i `grep` delle frasi vecchie non trovano più nulla, e le schermate osservate coincidono con la nota tecnica.
- **Priorità:** media · **Giorni:** 1 · **Dipende da:** R-5 per le prove sui nomi.

## 7. Dipendenze

**Stato generale.** Campanella non ha gestori di pacchetti: niente NuGet, npm o pip, e nessun file di lock.

- **Applicazione.** Usa soltanto la libreria di base del .NET Framework 4.x, compilata con il `csc` incluso in Windows. È una scelta dichiarata in testa a `build.ps1`, che vincola il linguaggio a C# 5.
- **Script generati.** Usano solo i servizi di Google Apps Script.
- **Prove.** Usano Node e Python del sistema, senza dipendenze esterne.

Le dipendenze vere sono quindi i servizi e gli strumenti esterni. È lì che servono le guardie.

| ID | Dipendenza | Versione attuale | Proposta | Motivo | Cosa rompe e come si verifica | Priorità |
|---|---|---|---|---|---|---|
| D-1 | Azioni di GitHub nel workflow di rilascio | `actions/checkout@v7`, `actions/upload-artifact@v7`, `signpath/github-action-submit-signing-request@v3`, `softprops/action-gh-release@v3`, tutte a **tag mobile**; `contents: write` per tutto il workflow; nessun `dependabot.yml` | Fissare per primo `softprops/action-gh-release` allo SHA completo, con la versione in un commento, poi le due azioni di SignPath prima di attivare la firma, poi le altre. Aggiungere `persist-credentials: false` al checkout e un `.github/dependabot.yml` mensile per `github-actions`. Dividere in un job di build con `contents: read` e uno di pubblicazione è l'ultimo passo. | Chi controlla il repository di un'azione può spostarne il tag. `softprops` gira a ogni tag con il permesso di scrittura e pubblica l'installer al link permanente dei README (`.github/workflows/release.yml:38-40, 48, 87, 95, 126, 133, 190`). | Nulla, se lo SHA è quello già in uso: il log dell'ultima esecuzione registra lo SHA risolto per ogni azione. Verifica: `workflow_dispatch` su un ramo di prova passa «Set up job», e uno SHA inesistente lo fa fallire. | media |
| D-2 | SignPath (firma del codice) | Configurato nel workflow e in `installer/signpath-artifact-configuration.xml`, ma **non attivo**: le variabili del repository sono vuote e i passi di firma vengono saltati | Nessun cambio tecnico prima dell'accettazione da parte di SignPath Foundation. Poi fissare le azioni (D-1) e controllare che `AssemblyFileVersion` sia allineata (A-41). | I rilasci escono non firmati, e lo dicono nelle note (`release.yml:178-182`). | Da verificare all'attivazione: il nome del file firmato deve restare `Installa-Campanella.exe`, da cui dipende il link permanente dei README (`release.yml:152`). | media |
| D-3 | Inno Setup | Quello preinstallato nell'immagine `windows-latest` (6.7.1 nell'esecuzione di v1.4.6); il ripiego `choco install innosetup` è senza versione e non è mai scattato | Stampare la versione di `ISCC.exe` nel log e fermarsi se la versione maggiore non è la 6; aggiungere `--version` al solo ripiego. | Due tag con lo stesso codice possono produrre installer diversi senza traccia (`release.yml:115-122`). | Nulla. Verifica: il log mostra «Inno Setup 6.x.y»; con un percorso di `ISCC.exe` sbagliato su un ramo di prova il passo fallisce con un messaggio chiaro. | bassa |
| D-4 | Node e Python per le prove | Non dichiarati: la CI usa il Node dell'immagine, senza `actions/setup-node`; `prova_anonimizzazione.ps1` chiama `python` | Una riga di prerequisiti nei due README (Node 18 o successivo, minimo 11 per `flatMap`; Python 3.7 o successivo per `ThreadingHTTPServer`); `actions/setup-node` con versione fissata prima dei banchi. | Chi contribuisce scopre i requisiti quando qualcosa fallisce (`test/mock_apps_script.js:313`, `test/finto_rizzo.py:15`). | Nulla. Verifica: con `node-version: 10` il passo fallisce, con quella fissata passa. | bassa |
| D-5 | rizzo-pii (servizio locale di anonimizzazione) | L'ultimo rilascio del suo repository GitHub, scaricato su richiesta dalle Impostazioni o dall'installer C#. Il protocollo HTTP non ha versione, e il client accetta risposte incomplete | Una costante con la versione di rizzo-pii provata, mostrata nelle Impostazioni. Rifiutare una risposta senza `anonymized_text` invece di scrivere un file vuoto. Per lo scarico vedi A-18. | Se il servizio cambia un campo, i file risultano «ripuliti» ma vuoti (`src/Anonimizzatore.cs:147-155, 226, 242`), e l'app propone qualunque versione più recente senza sapere se è compatibile. | Nulla. Verifica: un'opzione di `test/finto_rizzo.py` che omette il campo fa fallire la prova prima della correzione e passare dopo. | bassa |
| D-6 | Protocolli TLS | `ServicePointManager.SecurityProtocol = Tls12 \| Tls11 \| Tls`, assegnato per tutto il processo (`src/Aggiornamenti.cs:57-58, 145-146`) | Solo `Tls12`, assegnato e non con `\|=`, che lascerebbe attivo SSL 3. | È pulizia: GitHub rifiuta comunque le versioni sotto la 1.2, e l'assegnazione serve perché l'exe non dichiara un framework di destinazione. | Nulla. Verifica: «Cerca aggiornamenti» e lo scarico funzionano come prima. | bassa |
| D-7 | Google Apps Script | Runtime V8 predefinito; Posta e Orari senza `appsscript.json`; Moduli con manifest facoltativo | Nessun aggiornamento. Nessuna API deprecata trovata; le API recenti sono protette da controlli `typeof` (`src/risorse/Moduli.gs:375-376`, `src/risorse/Pannello.gs:183-184`). | I permessi e il fuso orario dei progetti di Posta e Orari dipendono dalle impostazioni di partenza di Google (capitolo 11.4). | — | bassa |
| D-8 | Estensione Chrome (Manifest V3) | Permessi minimi `activeTab` e `scripting`; versione del manifest ferma a `1.0` | Versione del manifest legata a quella dell'app al momento della generazione (A-46). | Chi ha una copia vecchia non se ne accorge (`src/risorse/estensione_personale/manifest.json:4`). | Nulla. Verifica: `chrome://extensions` mostra la versione dell'app. | bassa |
| D-9 | Piattaforma Windows e .NET Framework | Il manifest dell'app e l'installer Inno accettano Windows 7 SP1 (`src/app.manifest:16-27`, `installer/Campanella.iss:62`); README, istruzioni e note di rilascio dicono Windows 10/11; l'app richiede almeno .NET 4.5 (`src/Xlsx.cs:90`) | `MinVersion=10.0` nell'installer Inno e nome e descrizione aggiornati nel manifest (DOC-12). La scelta C# 5 / .NET Framework 4.x resta: è dichiarata, e .NET Framework 4.8.1 è un componente di Windows. | L'installer si avvia su sistemi che i documenti escludono e che nessuno prova. | Nulla sui sistemi supportati. Verifica: ISCC compila; con una `MinVersion` impossibile, solo in locale, l'installer si rifiuta di partire. | bassa |

## 8. Piano documentazione

Il progetto ha già delle regole per i propri documenti, e il piano le rispetta:

- README in inglese per il pubblico open source, con la copia italiana;
- `CHANGELOG.md` in inglese, con una sezione per versione che diventa il corpo del rilascio;
- `PRIVACY.md`, i documenti in `docs/`, l'app e le istruzioni in italiano;
- i documenti per dirigente e DPO distribuiti come testo nella cartella `documenti`.

Due regole valgono per tutto il piano:

1. **Ogni frase di fatto sul codice deve poter essere controllata da una prova**, oppure deve rimandare al codice invece di ripeterlo. Metà dei rilievi documentali sono frasi giuste un tempo e poi rimaste indietro.
2. **I documenti per il DPO e le condizioni non si riscrivono.** Il manutentore decide, frase per frase, se correggere il documento (con la procedura del consenso, se tocca le condizioni) o il codice (per esempio A-19 invece di dichiarare il CSV scaricato).

### 8.1 Documenti in ordine di intervento

| # | Documento | Intervento | Rilievi | Priorità |
|---|---|---|---|---|
| 1 | `docs/Nota-tecnica-DS-DPO.md` | Allineare le frasi di fatto, senza toccare il merito legale:<br>• permessi reali (MailApp, Session, Calendar chiesto con l'intero progetto, Drive e ricerca nel foglio di controllo);<br>• connessioni reali;<br>• cancellazioni con le loro eccezioni;<br>• disattivazione completa (filtri Gmail, «segna come letti», `MODULO_ANNULLA`, `PANNELLO_ANNULLA`);<br>• scrittura a un gruppo;<br>• registro delle esecuzioni;<br>• nessun numero di versione nel testo.<br>Poi osservare dal vivo, in un account di prova, la schermata di consenso dei tre progetti. | DOC-1, DOC-2, DOC-3, DOC-4, DOC-5, DOC-6 | media |
| 2 | `ISTRUZIONI - Campanella.txt` | Descrivere l'installer pubblicato (Inno) invece di quello C#. Dire come ci si accorge di una nuova versione e quando reincollare gli script. Correggere la ripresa degli orari. | DOC-7, DOC-10, A-23 | media |
| 3 | `docs/GDPR-e-DPO.md`, `docs/Email-DS-DPO.md` | Stesse frasi di fatto della nota tecnica, riconciliate fra loro. | DOC-2, DOC-5, DOC-15 | media |
| 4 | `PRIVACY.md` | Comando di controllo prima del push ancorato alle estensioni giuste; firma locale solo con `-Firma` o `-Pubblica`; nomi dei documenti come compaiono nella cartella installata; eventuali nuovi luoghi di dati se il codice non viene corretto (A-19, A-57). | DOC-11 | bassa |
| 5 | `README.md` e `README.it.md` | Sezione delle prove completa, con i prerequisiti e quali girano in CI; `-Firma` e l'avviso sul certificato radice; `src/Dialoghi.cs` e `strumenti/firma.ps1` nella struttura; quale installer è ufficiale; frase sulle cancellazioni come nella nota tecnica. | DOC-9, DOC-2, A-17 | bassa |
| 6 | `CHANGELOG.md` | Da ora, in ogni versione che cambia uno script, una riga «Script da reincollare: …» oppure «nessuno». È ciò su cui si appoggia il rimando di `src/Moduli.cs:637-638`. | A-9, A-23 | bassa |
| 7 | Testi nel codice: `src/PaginaCartelle.cs:592-594`, `src/PaginaOrari.cs:521-524`, intestazione di `src/risorse/estrai_personale_spaggiari.js`, `src/Anonimizzatore.cs:159`, intestazioni di `Orari.gs`, `Pannello.gs` e `Organizzazione_Gmail.gs` | Correggere nel codice le frasi che il codice smentisce. | DOC-8, DOC-10, DOC-13, DOC-14 | bassa |
| 8 | Metadati: `src/app.manifest`, `strumenti/firma.ps1`, `installer/signpath-artifact-configuration.xml`, `installer/Campanella.iss` | Nomi aggiornati, Windows 10/11 come requisito, e il nome `assemblyIdentity` in un commit separato controllando a mano stili e DPI. | DOC-12 | bassa |
| 9 | `installer/CONDIZIONI-en.txt` | Non si confronta in automatico con il testo italiano: va riletto a mano a ogni cambio delle condizioni. Il confronto automatico si fa solo fra l'italiano e `Consenso.Testo` (A-25). | A-25 | bassa |

### 8.2 Registro del debito

Il progetto non tiene un registro del debito: il `CHANGELOG.md` racconta ciò che è stato fatto, non ciò che resta. Per un solo manutentore conviene evitare un nuovo documento da tenere allineato. Le proposte:

- **Segnalazioni su GitHub.** Aprire una segnalazione per ogni rilievo ad alta e media priorità di questo report, con un'etichetta (per esempio `debito`) e l'ID del report nel titolo. Il repository ha le segnalazioni attive.
- **Il report come riferimento.** I rilievi a bassa priorità restano qui; la prossima revisione li riconcilia nel suo capitolo di confronto.
- **Chiusura con prova.** Ogni correzione chiude la sua segnalazione con il commit e con la prova che fallisce prima e passa dopo.

**Rilievi da registrare subito come segnalazioni:**

- priorità alta: A-1, A-2, A-3, A-4, A-58;
- priorità media: A-5, A-6, A-7, A-8, A-9, A-10, A-11, A-12, A-13, A-14, A-15, A-16, A-17, A-18, A-19, A-20, A-21, A-22, A-23, A-24, A-25, A-26, A-27, A-28, A-29, D-1, D-2, DOC-1, DOC-2, DOC-3, DOC-4, DOC-5, DOC-7, A-59, A-60, A-61, A-62, A-63, DOC-15, DOC-16.

## 9. Piano in tre fasi

L'ordine segue tre criteri:

1. prima ciò che può far perdere dati o eseguire codice non voluto;
2. poi ciò che impedisce di accorgersi delle regressioni;
3. infine la pulizia.

Ogni passo è un commit con la sua prova. Ogni rilascio che cambia uno script lo dice nel CHANGELOG, perché gli script vanno reincollati.

### Sotto un giorno ciascuno (da fare subito, in quest'ordine)

1. **Controllo del codice d'uscita dopo ogni `node` nella CI** (R-3 passo 1, A-3). Un'ora, e rende vere tutte le prove che seguono.
2. **Commenti sicuri in `DatiOrari.gs`**, con la prova sul `*/` (R-2, A-2).
3. **`Drive = ""` nell'inizializzatore di `Stato`** (R-1 passo 1, A-15, A-52): da qui in poi nessuna prova può toccare il Drive reale.
4. **`Salva` non sovrascrive un file dei dati che non ha letto** (R-1 passo 3, A-1), con `prova_stato.ps1` in una cartella temporanea.
5. **Svuotamento delle risposte solo con i timestamp ritrovati** (R-1 passo 5, A-58), con gli scenari nei due banchi.
6. **Anonimizzazione che non sovrascrive gli originali** (R-1 passo 6, A-24).
7. **Il disinstallatore C# cancella solo i propri file** (R-9 passo 1, A-17).
8. **`and not WizardSilent` nell'installer Inno** (R-4 passo 2, A-20), e il confronto fra le due versioni del consenso nel rilascio (R-4 passo 1, A-25).
9. **La funzione da console scarica il CSV solo se gli appunti falliscono** (R-10 passo 1, A-19).
10. **Classi spezzate solo sugli a capo** (R-12, A-63).

### Una settimana

- Workflow di prove su push e pull request, `prova_personale` in CI, generatori veri nei banchi, lettore `.xlsx` provato (R-3).
- Invarianti degli script presidiati dai banchi e prefisso vuoto gestito da `ANNULLA_etichettatura` (R-5).
- Script di controllo delle versioni e del testo del consenso; consenso in sola lettura per «Rileggile» (R-4).
- rizzo-pii solo locale e scarico integro (R-8).
- Dati personali solo nei posti dichiarati (R-10).
- Documenti per il DPO allineati, con l'osservazione dal vivo delle schermate di consenso (R-13); decisione del manutentore sulle condizioni per il foglio di controllo (DOC-16).

### Oltre la settimana

- Il foglio di controllo e lo script nel modulo allineati e robusti (R-6).
- Lettura degli orari corretta e calendario senza doppioni (R-7).
- Scelta dell'installer di riferimento e dismissione dell'altro (R-9 passo 3).
- Avviso di nuove versioni (R-11).
- Pulizia a basso rischio (R-12), un commit alla volta.
- Dipendenze: azioni fissate per SHA prima di attivare SignPath (D-1, D-2), versioni di Inno e Node registrate (D-3, D-4).

## 10. Glossario e boundary

### 10.1 Glossario

| Termine | Significato nel codice |
|---|---|
| Guscio | La finestra principale (`src/Guscio.cs`): menu degli strumenti, passi, Indietro/Avanti, riga di stato, salvataggio alla chiusura. |
| Pagina, passo | Uno strumento (Posta, Cartelle, Orari, Privacy, più Home e Impostazioni) e le sue schermate in sequenza; il contratto è la classe astratta `Pagina`. |
| Stato | L'oggetto unico con tutte le impostazioni e i dati (`src/Stato.cs`), salvato in `campanella.json` accanto all'exe e, se scelto, in `campanella-dati.json` nel Drive. |
| Dati nel Drive | Modalità in cui i dati di altre persone (personale, indirizzi, orari) stanno in `campanella-dati.json` nella cartella del Drive e non nel file locale. |
| Motore e dati | Ogni script Google ha un motore fisso, incorporato nell'app, e un file di dati generato dall'app: `Organizzazione_Gmail.gs` e `Configurazione.gs` per la Posta, `Orari.gs` e `DatiOrari.gs` per gli Orari. Per Moduli e Pannello i dati stanno nello stesso file, in un blocco di configurazione. |
| Progetto della posta | Il progetto Apps Script nell'account del docente in cui stanno insieme Posta e Orari: condividono spazio dei nomi, lock, proprietà, trigger e permessi. |
| Foglio di controllo (Pannello) | Un foglio Google con una riga per modulo (`src/risorse/Pannello.gs`) che prepara, riapre e chiude più moduli. Chiede il permesso su tutti i moduli dell'account. |
| Codice di stato CMP1 | Riga che lo script della Posta stampa (`EXTRA_codiceStato`) e che l'app legge per dire se il riordino è stato fatto. |
| Prefisso delle etichette | Gruppo sotto cui nascono le etichette Gmail. Dalla 1.4.1 è vuoto per impostazione predefinita, e da qui vengono A-11 e A-29. |
| rizzo-pii | Servizio locale di riconoscimento e anonimizzazione dei dati personali, installato a parte e raggiunto su `127.0.0.1`. |
| Consenso versionato | Le condizioni d'uso hanno un numero (`Consenso.Versione`); l'app le richiede quando il numero salvato è più basso. L'installer Inno scrive lo stesso numero in `campanella.json`. |
| Banco (mock) | Programma Node che carica un motore `.gs` con servizi Google finti e ne verifica il comportamento (`test/mock_*.js`). |
| Estensione / funzione da console | Due modi di estrarre l'elenco del personale dalla pagina del registro elettronico, nel browser del docente. |

### 10.2 Boundary del sistema

Descritti a parole, dall'esterno verso l'interno.

1. **Il PC del docente.**
   - L'app scrive soltanto:
     - nella propria cartella (`campanella.json`, `struttura.json`, la cartella `documenti`);
     - nella cartella dei dati nel Drive;
     - nelle cartelle scelte dall'utente (anno scolastico, copie anonimizzate, file generati).
   - È un invariante, e oggi ha tre eccezioni:
     - il CSV scaricato dalla funzione da console (A-19);
     - la cronologia del browser e degli appunti (A-45);
     - una copia vecchia dei dati che resta nel Drive dopo un cambio di cartella (da verificare nel capitolo 11.3).
2. **Rete, dal PC:**
   - GitHub, solo a richiesta (ultimo rilascio di rizzo-pii e suo scarico);
   - rizzo-pii su `127.0.0.1`, anche in automatico all'apertura delle Impostazioni.

   L'indirizzo di rizzo-pii però non è vincolato al computer locale (A-12). Nessun'altra connessione (`grep` di `WebRequest.Create`: cinque punti, tutti in `Aggiornamenti.cs` e `Anonimizzatore.cs`).
3. **Confine fra app e Google.** L'app non parla con Google: produce testo (script, dati, manifest) che il docente incolla. Il contratto fra generatori C# e motori `.gs` è quindi un confine testuale. Oggi è provato con il generatore vero solo per Moduli e Pannello; per Posta e Orari solo con file d'esempio scritti a mano (A-13).
4. **Dentro l'account Google del docente.**
   - Gli script agiscono con i permessi concessi dal docente.
   - Mandano posta solo all'indirizzo dell'account (`_mioIndirizzo`, `_mioIndirizzoOrari`).
   - Cancellano solo ciò che hanno creato, con le eccezioni elencate in DOC-2.
   - L'unica cancellazione irreversibile è lo svuotamento delle risposte di un modulo, su richiesta.
5. **Confine dei permessi.** Posta e Orari non hanno un manifest generato: i permessi li deduce Google dal codice dell'intero progetto (DOC-1). Lo script nel modulo ha un manifest facoltativo che restringe il permesso al solo modulo, ma arriva dopo la prima autorizzazione (A-21).
6. **Il registro elettronico.** L'estensione e la funzione da console leggono la pagina del personale aperta dal docente, nel suo browser; nessun dato passa da server del progetto.
7. **Rilascio.** Da GitHub Actions ai rilasci pubblici, con azioni di terze parti (D-1) e una firma non ancora attiva (D-2); in parallelo, la pubblicazione locale con l'installer C# (A-17).

## 11. Verificato e da verificare

### 11.1 Eseguito

I controlli che scrivono file (la build scrive `dist/`) sono girati su un **clone usa e getta del commit `9534dd5b`**, in una cartella temporanea fuori dal repository. Prima e dopo si è confrontata l'impronta di `git status --porcelain` del repository: è rimasto invariato.

| Comando (nel clone) | Esito |
|---|---|
| `.\build.ps1` (completa, senza firma né pubblicazione) | Compilati `Campanella.exe` (556 KB) e `Installa Campanella.exe` (708 KB). |
| `csc /warn:4` su `src\*.cs`, con gli stessi riferimenti di `build.ps1` | **0 avvisi**. |
| `node test\mock_apps_script.js` | Tutte le prove superate (82 controlli). |
| `node test\mock_orari.js` | Tutte superate (47). |
| `node test\mock_moduli.js` | Tutte superate (99). |
| `node test\mock_pannello.js` | Tutte superate (197). |
| `.\test\prova_orario.ps1`, `.\test\prova_moduli.ps1`, `.\test\prova_personale.ps1`, `.\test\prova_disposizione.ps1`, `.\test\prova_anonimizzazione.ps1` | Tutte superate. |
| `.\test\prova_solalettura.ps1` | **Instabile**. Alla prima esecuzione ha dato 3 fallimenti: si è aperta la finestra delle condizioni invece dell'avviso di sola lettura. Alla seconda è passata. `Stato.Scrivibile`, provato a parte su una cartella con scrittura negata, risponde correttamente «falso»; la causa del primo fallimento non è stata trovata (A-54). |
| `gh run list`, `gh api` sul repository (in sola lettura) | 16 esecuzioni del rilascio riuscite su 18. `main` non è protetto. La segnalazione privata delle vulnerabilità è attiva. Sono spenti la scansione dei segreti, la protezione al push, gli avvisi sulle dipendenze e gli aggiornamenti di sicurezza di Dependabot. |

Gli agenti della revisione hanno inoltre scritto e lanciato fuori dal repository diverse sonde, con il codice vero caricato per reflection su una copia dell'exe:

- iniezione nei commenti (A-2);
- perdita dei dati nel Drive, con cartelle temporanee (A-1);
- svuotamento delle risposte sui banchi del repository (A-58);
- tabelloni senza lunedì e CSV in ANSI (A-59, A-60);
- sovrascrittura degli originali (A-24);
- scarico troncato (A-18);
- passo `pwsh` della CI (A-3);
- banchi in fusi orari diversi (A-28).

### 11.2 Non eseguito, e perché

- **`prova_installer.ps1`.** Crea e poi cancella il gruppo del menu Start, il collegamento sulla scrivania e la chiave di disinstallazione dell'utente: toccherebbe l'installazione vera del PC (A-28).
- **Compilazione e installazione dell'installer Inno.** ISCC non è installato sul PC della revisione. Il comportamento con `/VERYSILENT`, la pagina della licenza in UTF-8 senza BOM e la disinstallazione silenziosa restano da osservare.
- **Esecuzione del workflow su GitHub.** Nessun push né `workflow_dispatch`, per la regola di sola lettura. Il comportamento di `pwsh` 7 sul runner (A-3) è riprodotto con Windows PowerShell 5.1 e dedotto dalla documentazione.
- **Nulla sui servizi Google reali.** Nessuno script è stato incollato in un account: valgono il codice e i banchi finti.

### 11.3 Il metodo di verifica, con i numeri

1. **Primo giro.** Cinque agenti hanno mappato i moduli e otto hanno cercato problemi per dimensione:
   - architettura C#;
   - script Apps Script;
   - sicurezza e privacy;
   - configurazione e versioni;
   - prove e CI;
   - dipendenze;
   - documentazione;
   - codice morto.

   Ogni rilievo è passato a un agente incaricato di smentirlo. Su 127 rilievi, 126 hanno retto e 1 è stato smentito. Molti hanno avuto priorità, prova o proposta corrette, e i doppioni fra dimensioni sono stati uniti.
2. **Secondo giro.** Ventotto osservazioni con prova, emerse dalla mappa e non coperte dai rilievi, sono passate a sette verificatori:
   - 24 hanno retto, 4 sono state smentite;
   - lo svuotamento delle risposte (A-58) è stato confermato ad alta priorità, riproducendolo sui banchi del repository;
   - lo slittamento dei giorni (A-59) è sceso a media.
3. **Controllo diretto.** Il redattore ha riletto sul commit il codice di A-1, A-2 e A-3.

**Un incidente durante la revisione, e che cosa dimostra.** Nel primo giro una sonda di un verificatore ha creato un'istanza di `Stato` senza impostare cartelle, e `Stato` ha preso come Drive quello predefinito. La sonda ha così scritto e poi cancellato nella cartella Drive reale del PC un `campanella-dati.json` con i soli valori iniziali. Nessun dato reale è stato toccato; lo si è verificato:

- sul PC i dati nel Drive non sono attivi;
- il `campanella.json` installato è identico, impronta per impronta, alla copia di riserva precedente la revisione;
- nel Drive non c'è nessun `campanella-dati.json`.

Il file creato e cancellato può essere finito nel cestino di Google Drive. Il secondo giro ha vietato esplicitamente di istanziare `Stato` con i percorsi predefiniti. L'episodio è la prova pratica di A-15 e A-52, e il motivo per cui R-1 comincia da `Drive = ""`.

### 11.4 Da verificare

**Sui servizi Google, con un account di prova:**

- la schermata di consenso del progetto Posta+Orari: se Calendar viene chiesto anche senza usare il calendario, e se compaiono MailApp e Session (DOC-1);
- lo script nel modulo, con e senza il manifest facoltativo, e se il manifest messo prima della prima esecuzione restringe davvero il permesso; il foglio di controllo (A-21, DOC-16);
- se `FormApp.getUi()` e `SpreadsheetApp.getUi()` funzionano con un manifest senza `script.container.ui`;
- se i trigger singoli già scattati contano nella quota di 20 (A-30), e quanto dura davvero «Prepara l'anno nuovo» per riga (A-31);
- il fuso orario di partenza dei progetti di Posta e Orari, che non hanno manifest: gli eventi del calendario usano il fuso del progetto;
- per quanto tempo il registro delle esecuzioni conserva l'elenco scritto da `EXTRA_elencaIndirizziScuola` (DOC-6);
- se `getActiveUser()` è vuoto nei trigger di uno script personale (A-66);
- se un filtro Gmail nativo agisce sui messaggi mandati a sé stessi (A-11);
- se il Chrome gestito dalla scuola consente estensioni non pacchettizzate e la console.

**Sull'installer e su Windows:**

- l'installer Inno con `/VERYSILENT`: si salta la licenza e si scrive comunque il consenso? (A-20);
- dove installa scegliendo «per tutti gli utenti»;
- come mostra le lettere accentate di `CONDIZIONI-it.txt` (UTF-8 senza BOM);
- se la finestra di disinstallazione blocca una disinstallazione silenziosa;
- quante voci compaiono fra i programmi installati su un PC che ha usato entrambi gli installer (A-17);
- se `File.Replace` funziona sull'unità virtuale di Google Drive per desktop, necessaria per la scrittura atomica di R-1;
- come Google Drive per desktop tratta un file vuoto scritto prima della fine della sincronizzazione: copia in conflitto o sovrascrittura nel cloud (A-1).

**Sul rilascio:**

- se l'installer di rizzo-pii è firmato Authenticode, e da chi;
- all'attivazione di SignPath, che il file firmato mantenga il nome da cui dipende il link permanente dei README (D-2).

**Decisioni del manutentore, non correzioni:**

- quale installer è quello di riferimento (A-17, R-9);
- se aggiornare le condizioni d'uso per il foglio di controllo e passare alla versione 4 (DOC-16);
- se la pubblicazione locale (`-Pubblica`) serve ancora accanto ai rilasci GitHub;
- se il ramo di compatibilità per i file dei modelli delle versioni precedenti (`src/PaginaCartelle.cs:1206-1231`) serve ancora.

## 12. Confronto con la revisione precedente

Non esiste una revisione precedente: `docs/analysis/` non c'era prima di questo report. Il prossimo confronto partirà da qui, e conviene tenere gli ID di questo documento (A-, DOC-, D-, R-) quando i rilievi diventano segnalazioni o commit.
