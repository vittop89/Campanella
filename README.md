# Campanella

*[Versione italiana](README.it.md)*

Four tools for a teacher's digital life, in one Windows application: a single
executable of a few hundred KB, no dependencies, no runtime to install.

Campanella is made for Italian schools on Google Workspace: the interface,
the documents and the generated scripts are in Italian. This README is in
English for the open-source audience; the Italian one is
[README.it.md](README.it.md).

| Tool | What it does |
|------|--------------|
| **Posta** (mail) | sorts the Gmail mailbox into labels (management, secretariat, circulars, colleagues, students…), on the mail already received and on the future one |
| **Cartelle** (folders) | creates in Drive the folder tree of the new school year — classes, subjects, remedial courses — and copies the templates into it; for Google Forms, which cannot be copied from a PC, it writes the script that gives each form its response sheet for the year |
| **Orari** (timetables) | reads the school timetable from an Excel file, sends **to yourself** one email per teacher with their timetable (to find it again by searching the surname in Gmail) and puts your own timetable on Google Calendar |
| **Privacy** | the rules on school data and AI, the tools to remove personal data (text for an assistant, with restoration of the answer; files to clean) and the documents for the principal and the Data Protection Officer |

The application **never touches mail, calendar or Drive on its own**: it
prepares the code and the configuration of a Google Apps Script that the
user pastes into their own account. It is the user who presses Run, always.
The script writes to nobody else: the only emails go to the same account it
runs in.

The executable connects to the network only on the user's explicit request:
to ask GitHub for the latest version of rizzo-pii and to download it. It
sends data to nobody, collects no statistics, checks nothing at start-up.

## Who it is for, and who it is not

- Teachers with a **Google Workspace for Education** account: Gmail, Drive,
  Calendar. With a school on Microsoft 365 it does nothing.
- **Windows** 10 or 11. No Mac, no Linux.
- The staff list is read from the **ClasseViva** register by Spaggiari,
  page "Tutto il personale", with the Chrome extension or with the Console
  function. With Argo, Axios, Nuvola or other registers the two find
  nothing: the list is pasted by hand (almost any format works), asked to
  the school office, or the script learns it from the real senders in the
  mailbox, which is the most accurate method.
- The timetable is the "TABELLONE DOCENTI" export of **Orario Facile**, or
  a Teacher / Day / Period / Class table. Other formats must first be reduced
  to that one.
- Everything is in Italian: interface, documents, scripts.

## Installing, for users

`Installa Campanella.exe` carries the application inside itself as a
resource. It installs into `%LOCALAPPDATA%\Programs\Campanella`, therefore
**without administrator rights and without UAC**; it creates the Start menu
shortcuts and registers among the installed programs, so it can be removed
from Windows Settings like any other. The uninstaller is a copy of the same
executable: since a program cannot delete itself while running, it copies
itself to `%TEMP%` and cleans up from there.

Before copying anything it shows the **terms of use** and asks for two
separate check marks — data warnings and disclaimer of liability. The same
terms come back at first start if the application is copied by hand instead
of installed; acceptance is recorded in `campanella.json` with date and
version (`Consenso.Versione`: raising it shows the text again to everyone).

The installer also copies, into the `documenti` folder, the **technical
note**, the **email template** for the principal and the DPO and the **GDPR
explanation** (see `docs/`), and offers to download **rizzo-pii** (≈1.2 GB)
from its GitHub releases page. rizzo-pii is not bundled: it weighs more than
a thousand times the application, and keeping it separate means updating it
on its own.

The GitHub releases ship a second installer, made with **Inno Setup**
(`installer/Campanella.iss`, Italian/English), meant to be signed through
SignPath: see below.

## Portable use

The application **is portable by construction**: it does not touch the
registry (only the installer does, for the entry in "Installed apps"), it
has no dependencies beyond the .NET Framework that ships with Windows, and
it writes `campanella.json` and `struttura.json` **next to its own
executable**.

Two limits to know:

- **rizzo-pii is not portable** (1.2 GB, it installs as a local service): on
  a computer where it is missing, steps 2 and 3 of Privacy do not work;
- the settings file contains the **staff list** with names and addresses.
  That is why, from Settings, the data of other people can be kept in
  `campanella-dati.json` **inside the school's Drive folder**: it stays in
  the institutional account, it is found on every computer that syncs that
  Drive, and no trace of it remains in the file next to the program. A lost
  USB stick with that data is a breach that must be notified.

At start-up the application really tries to write into its own folder
(`Stato.CartellaScrivibile`, a test file then deleted) and warns if it
cannot; if the data lives in Drive and the file is missing (Drive not yet
synced), it says so instead of pretending nothing happened.

## Building

```powershell
.\build.ps1                  # -> dist\Campanella.exe + dist\Installa Campanella.exe
.\build.ps1 -SenzaInstaller  # the application only, faster for tests
.\build.ps1 -Firma           # + signature with a local self-signed certificate
.\build.ps1 -Pubblica        # + copy to H:\Il mio Drive\Campanella
```

Only Windows is needed: the compiler is the `csc.exe` of the .NET Framework
4.x already present in the system. No Visual Studio, no NuGet, no runtime to
install on the target computer.

Constraints to remember when touching the code:

- the compiler is the **C# 5** one: no `$"..."` interpolation, no `?.`, no
  `nameof`, no auto-property initializers;
- sources are UTF-8 without BOM and `build.ps1` passes `/codepage:65001`:
  without it, accented letters become mojibake;
- no `dpiAware` in the manifest. The layout uses absolute coordinates:
  leaving the app DPI-unaware, Windows scales it as a bitmap, slightly
  blurred but always the right size. Declaring DPI awareness without
  rewriting the whole layout would give a tiny window on 4K screens;
- `Bottom` anchors inside a panel with `AutoScroll` squash the control: the
  long pages use only `Top | Left`;
- `Tema.AltezzaTesto` measures with `TextRenderer`, not with
  `Graphics.MeasureString`: the Label draws with GDI and GDI+ is off by one
  line;
- text boxes are `CasellaTema` (in `Tema.cs`): they repaint the border in
  the theme colour, because Windows paints it with the system colours
  outside the area WinForms lets you colour, and in the dark theme it showed
  up light in places. The same file asks Windows for dark scrollbars
  (`SetWindowTheme` with `DarkMode_Explorer`, like File Explorer).

## Layout

```
src/
  Guscio.cs           Main, window, sidebar, home page, settings
  Tema.cs             light/dark palette, control factories, CasellaTema
  Stato.cs            data model, persistence (settings + data in Drive)
  PaginaPosta.cs      the Posta tool (7 steps)
  PaginaCartelle.cs   the Cartelle tool
  PaginaOrari.cs      the Orari tool (4 steps: file, check, email, calendar)
  PaginaPrivacy.cs    the Privacy tool (3 steps) + documents for principal and DPO
  Anonimizzatore.cs   HTTP client of rizzo-pii (health, analyze, pdf, restore)
  Consenso.cs         terms of use + acceptance window
  Aggiornamenti.cs    GitHub releases, download with progress
  Xlsx.cs             minimal .xlsx reader (ZIP + XML) and CSV
  Orario.cs           timetable recognition, calendar blocks, DatiOrari.gs
  Moduli.cs           the script for Google Forms: configuration, no-Drive variant, instructions
  Dialoghi.cs         small service dialogs
  app.manifest        asInvoker, supportedOS, common controls 6
  risorse/            the .gs and .js files embedded in the executable
    estensione_personale/   the Chrome extension that reads the staff from ClasseViva
src-installer/
  Installa.cs         installer and uninstaller; reuses Tema, Consenso,
                      Stato and Aggiornamenti from the application sources
  app.manifest        asInvoker: without it Windows would ask for UAC for an
                      executable named "Installa..."
installer/
  Campanella.iss      Inno Setup script (Italian/English) for the GitHub releases
  CONDIZIONI-it.txt   the terms of use shown by the wizard, in the two languages
  CONDIZIONI-en.txt
  signpath-artifact-configuration.xml   what SignPath signs, and how it checks it
docs/
  GDPR-e-DPO.md               what applies to a teacher, with the legal references (Italian)
  Nota-tecnica-DS-DPO.md      description of the application for principal and DPO (Italian)
  Email-DS-DPO.md             template of the communication (Italian)
test/
  mock_apps_script.js  test bench of Organizzazione_Gmail.gs
  mock_orari.js        test bench of Orari.gs (emails to oneself and calendar)
  mock_moduli.js       test bench of Moduli.gs (fake Forms, Sheets, Drive, triggers and clock)
  prova_moduli.ps1     generates the forms script with the real generator and runs it in the bench
  Configurazione_esempio.gs, DatiOrari_esempio.gs   invented data for the test benches
  prova_orario.ps1     reading of a timetable + cross checks
  genera_dati_prova.ps1
  finto_rizzo.py       a fake rizzo-pii, to test the client without the model
  prova_installer.ps1  drives the installer, checks files, shortcuts and registry
  prova_solalettura.ps1  removes permissions from a folder and checks the warning
  prova_anonimizzazione.ps1  rizzo-pii client: JSON, multipart, dictionary
strumenti/firma.ps1   self-signed certificate + Authenticode
.github/workflows/release.yml   build, tests, SignPath signature, installer, release
```

Every page is a `Pagina : Panel`; the shell shows it and, if the page
declares steps, lists them indented in the left bar. The bar is built
**once**: changing page moves and shows the buttons already made (it used to
be rebuilt on every click, which was the cause of the flicker). The theme is
applied by walking the control tree and colouring each control by the
**role** written in its `Tag`.

There is a single state for all tools. The data of other people (staff
list, addresses, timetables with surnames) lives in a separate dictionary
(`Stato.Dati()`) that ends up in `campanella.json` or, if the user chooses
so, in `campanella-dati.json` in Drive.

## Testing

```powershell
node test\mock_apps_script.js     # mail sorting: trial mode, labels, resume, undo
node test\mock_orari.js           # emails to oneself, quota, resume, class timetables, calendar
node test\mock_moduli.js          # forms: yearly sheet, linking, closing, two years in a row, no-Drive variant
.\test\prova_moduli.ps1          # the generated forms script, with and without Drive, inside the bench
.\test\prova_anonimizzazione.ps1  # rizzo-pii client (fake service)
.\test\prova_installer.ps1        # installs into a temporary folder, then removes
.\test\prova_solalettura.ps1      # folder without permissions: it must warn, not stay silent
.\test\prova_orario.ps1           # reads a timetable and checks the grid
.\test\genera_dati_prova.ps1 ; node test\mock_orari.js test\DatiOrari_prova.gs
```

The test benches simulate `GmailApp`, `MailApp`, `CalendarApp`, `FormApp`,
`SpreadsheetApp`, `DriveApp`, `PropertiesService`, `LockService` and `ScriptApp` with a fake mailbox and a
fake calendar, including a simplified interpreter of Gmail's search syntax.
They run on the invented data of `*_esempio.gs`; the `*_prova.gs` files,
generated from real data, stay out of the repository.

`prova_orario.ps1` loads the executable as an assembly and calls the internal
methods via reflection: that is why `Xlsx`, `AnalisiOrario` and the parsing
methods are static and testable.

## The timetable format

The reference is the "TABELLONE DOCENTI" export of Orario Facile: one row
per teacher, the days side by side split into their periods, the class in
each cell (or `D` for the periods at disposal). Recognition is not tied to
that program: it looks for the row with the day names and the one with the
period numbers. Alternatively it understands a table with the columns
`Docente | Giorno | Ora | Classe`.

For the calendar, consecutive periods of the same class become a single
weekly event (`CalendarApp.createEventSeries` with a weekly rule until the
end date), marked with a tag: `ORARI_ANNULLA_calendario` removes only those.
The period times are configurable (start of the first period and duration,
or the start of every period if there is a break).

## Anonymisation

Personal data recognition is done by **rizzo-pii**
(<https://github.com/Rizzo-AI-Academy/rizzo-pii>, MIT): an Italian model of
0.3B parameters that runs on the CPU, recognises 22 categories — including
codice fiscale, VAT number and IBAN, with checksum validation — and needs no
network. The desktop application, the Docker container and the start from
source all expose the same service on `127.0.0.1:5005`; `Anonimizzatore.cs`
talks to that (`GET /health`, `POST /analyze`, `POST /pdf`).

On **files** anonymisation is final: no dictionary remains to trace back.
On the **text for the AI** the dictionary is needed — it is what puts the
real names back into the answer — and it stays in the application's memory,
never on disk and never on the network. rizzo-pii reads PDF, TXT and MD: a
`.docx` cannot be anonymised and is reported.

## Safety for users

- No tool deletes mail, files, folders, sheets or events. At most it archives,
  and archiving in Gmail is reversible. One exception, optional and off by
  default: the forms script can clear last year's responses from the form,
  and only after checking that an earlier response sheet already holds them
  all; otherwise it touches nothing and says so.
- The first run of the sorting always starts in trial mode, and in trial
  mode it does not even create the labels.
- The script writes only to itself: no email to colleagues.
- Every tool has its `ANNULLA_…` (undo) function.
- Runs are protected by a `LockService`: automatic resume and hourly sorting
  do not overlap; a rule whose search Gmail rejects is skipped and reported,
  without blocking the others.
- The mail and timetable script asks only for Gmail (always) and Calendar
  (only for step 4 of Orari): no Drive, no external services. The forms
  script is a separate project, bound to the form it is pasted into, with
  its own permissions: Forms, Sheets, triggers, and Drive only to put the
  sheet into the year folder. A variant without Drive can be generated, and
  an optional manifest narrows Forms access to that single form.

## Public installer, signing and languages

The repository contains `installer/Campanella.iss` for **Inno Setup 6**:
per-user (`PrivilegesRequired=lowest`), Italian and English chosen at
start, terms of use in both languages, copy of the documents for principal
and DPO, consent recorded in `campanella.json`. It compiles with
`ISCC.exe installer\Campanella.iss` after `build.ps1 -SenzaInstaller`.

`.github/workflows/release.yml` builds, runs the tests, sends
`Campanella.exe` to **SignPath** (free programme for open source), puts it
back into the installer, signs the installer too and publishes the release.
The secret and the variables to set in the repository are documented at the
top of the workflow; what SignPath signs, and how it checks product name and
version, is in `installer/signpath-artifact-configuration.xml`. The
uninstaller that Inno Setup puts into the program folder stays unsigned: the
signature comes after the installer is built.

Changing language **inside** the application is not possible yet: the texts
are written in the code. Doing it means collecting all the strings in a
per-language dictionary (about 600 entries) and recomputing the layout of the
labels, which have fixed widths. It is the next step, not a detail.

## The year folders: what is convention

The Cartelle tool creates `A.S. <year>` in the Drive root and looks for the
templates in `MODELLI`, with one subfolder per group. The subfolder
`MODELLI\PER CLASSE` is special: every file it contains is copied into every
class with the class name appended (`Griglia 3A.xlsx`). The list of fixed
folders is generic; whoever wants their own changes it from "Modifica
struttura...", which writes `struttura.json` next to the program and from
then on that one rules. The file is per user and is not versioned.

Google Forms are the exception. On the PC a form is only a placeholder that
cannot even be read, so copying it from Explorer does not bring its response
sheet along. The form stays where it is, and step 2 of Cartelle writes an Apps
Script to paste once inside the form: every year it creates the response
sheet in the year folder, links the form to it and reopens the form; at the
end of the year it closes the form and unlinks the sheet, which stays as it
is. From the second year on it is one click in the form, menu Campanella.
The school year is computed in Italian time and rolls over on 1 September.

## Code signing policy

Release binaries are built by GitHub Actions from this repository
(`.github/workflows/release.yml`) and signed through SignPath: the signature
attests that the executable was built from these sources, with no manual
step in between. Until the project is accepted into the open-source
programme, releases go out unsigned and say so.

Free code signing provided by [SignPath.io](https://signpath.io),
certificate by [SignPath Foundation](https://signpath.org).

- Committers and reviewers: [vittop89](https://github.com/vittop89)
- Approvers of signing requests: [vittop89](https://github.com/vittop89)

The project is maintained by one person: whoever writes the code is also
the one who reviews it and approves the signature. External changes arrive
only through pull requests, reviewed before being merged.

Privacy policy: this program will not transfer any information to other
networked systems unless specifically requested by the user or the person
installing or operating it. The only connections it makes are to GitHub, to
look up and download rizzo-pii, and only when the user presses the button.
The scripts it generates run inside the user's own Google account; rizzo-pii
runs locally. Details, in Italian, in [PRIVACY.md](PRIVACY.md).

## Reporting and contributing

Bugs and proposals: GitHub *issues*, in Italian or English. For a security
problem do not open a public issue: see [SECURITY.md](SECURITY.md). Changes
arrive as *pull requests*; before opening one, run the test benches. The
versions are listed in [CHANGELOG.md](CHANGELOG.md).

## Licence and trademarks

MIT — see [LICENSE](LICENSE).

Independent project, with no relationship with Google, Gruppo Spaggiari
Parma or mathema software. Gmail, Google Drive, Google Calendar, Google Apps
Script, ClasseViva and Orario Facile are trademarks of their respective
owners and are mentioned here only to say which tools the application works
with.

Before publishing or sharing this repository read [PRIVACY.md](PRIVACY.md)
(Italian): the code can be published, the data that runs through it cannot.
