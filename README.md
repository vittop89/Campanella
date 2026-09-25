# Campanella

*[Versione italiana](README.it.md)*

Four tools for a teacher's digital life, in one Windows application: a single
executable of a few hundred KB, no dependencies, no runtime to install.

Campanella is made for Italian schools on Google Workspace: the interface, the
documents and the generated scripts are in Italian. This README is in English
for the open-source audience.

| Tool | What it does |
|------|--------------|
| **Posta** (mail) | sorts the Gmail mailbox into labels (management, secretariat, circulars, colleagues, students…), past and future mail, in the colours you pick; optionally a label for each of your classes |
| **Cartelle** (folders) | builds the school-year folder tree in Drive and copies the templates into it; for Google Forms, which cannot be copied from a PC, it writes the script that gives each form its response sheet for the year |
| **Orari** (timetables) | reads the timetable from an Excel file, mails **you** one message per teacher, and puts your own timetable on Google Calendar, with no lessons on the days you list as holidays and, when the timetable changes, the new one from a date on |
| **Privacy** | the rules on school data and AI, tools to strip personal data before pasting into an assistant, and the documents for the principal and the DPO |

The application **never touches mail, calendar or Drive on its own**: it
prepares the code of a Google Apps Script that the user pastes into their own
account and runs. The scripts write to nobody else. The executable goes on the
internet only when the user presses a button: to ask GitHub for the latest
release of Campanella and of rizzo-pii, and to download rizzo-pii. rizzo-pii
itself is reached only at an address on the same computer, and Settings
checks it when opened.

## Download

| | |
|---|---|
| **[Installer (recommended)](https://github.com/vittop89/Campanella/releases/latest/download/Installa-Campanella.exe)** | installs per user, no administrator rights, appears in "Installed apps" |
| [Application only](https://github.com/vittop89/Campanella/releases/latest/download/Campanella.exe) | portable, keeps its settings next to itself |
| [Instructions](https://github.com/vittop89/Campanella/releases/latest/download/ISTRUZIONI-Campanella.txt) · [Privacy notes](https://github.com/vittop89/Campanella/releases/latest/download/PRIVACY.md) | Italian |
| [All releases](https://github.com/vittop89/Campanella/releases) | changelog and older versions |

The installer is `Installa-Campanella.exe`, built with Inno Setup by the
release workflow: it is the only installer published. Settings > "Cerca
aggiornamenti" says when a newer release is out; to update, run the new
installer over the old installation. From 1.5.0 on, the release notes say
which Google scripts to paste again.

Releases are not code-signed yet, so Windows SmartScreen warns: choose **More
info**, then **Run anyway**. See "Code signing policy" below.

## Who it is for, and who it is not

- Teachers with a **Google Workspace for Education** account. With a school on
  Microsoft 365 it does nothing.
- **Windows** 10 or 11. No Mac, no Linux.
- The staff list is read from the **ClasseViva** register by Spaggiari, with
  the generated Chrome extension. With Argo, Axios, Nuvola or others it finds
  nothing: paste the list by hand, ask the school office, or let the script
  learn it from the real senders in the mailbox.
- The timetable is the "TABELLONE DOCENTI" export of **Orario Facile**, or a
  Teacher / Day / Period / Class table.
- Everything is in Italian: interface, documents, scripts.

## Building

```powershell
.\build.ps1                  # -> dist\Campanella.exe + dist\Installa Campanella.exe (C# installer)
.\build.ps1 -SenzaInstaller  # the application only, faster for tests
.\build.ps1 -Firma           # also signs both with a local self-signed certificate
.\build.ps1 -Pubblica -Produzione 'D:\Campanella'   # builds, signs, copies into that folder
```

Only Windows is needed: the compiler is the `csc.exe` of the .NET Framework
4.x already present in the system. No Visual Studio, no NuGet. The tests also
need Node and Python (see "Testing"). The published installer needs Inno
Setup 6:

```powershell
.\build.ps1 -SenzaInstaller
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" installer\Campanella.iss   # -> dist\Installa-Campanella.exe
```

**Two installers, one published.** `Installa-Campanella.exe` (Inno Setup,
`installer/Campanella.iss`) is the official one: the release workflow builds
it and attaches it to every release, and the test workflow compiles it on
every push. `dist\Installa Campanella.exe` (C#, `src-installer/`) is built
by `build.ps1` and copied by `-Pubblica`, for local distribution only; it is
never published. When its uninstaller runs in a folder that also holds the
Inno installation, it removes only its own uninstaller and its entry in
"Installed apps". The other way round, `Installa-Campanella.exe` installed
over an old C# installation in the same folder removes the old C#
uninstaller and its entry: before 1.5.0 that uninstaller also deleted the
program.

**`-Firma` and `-Pubblica` install a certificate.** They sign through
`strumenti\firma.ps1`, which the first time creates a code-signing
certificate in your Windows user's personal store (with a non-exportable
key) and adds its public part to that user's *Trusted Root Certification
Authorities* and *Trusted Publishers*; Windows asks for confirmation before
adding it to the root store. From then on that user trusts anything signed
with it. It stays until you remove it with `certmgr.msc`, and other
computers do not know it. The executable is signed before it goes into the C# installer, and
a failed signature stops the build. `-Pubblica` has no default folder:
`-Produzione` is required, as a full path, and is checked before anything is
built or signed.

Constraints to remember when touching the code:

- the compiler is the **C# 5** one: no `$"..."` interpolation, no `?.`, no
  `nameof`, no auto-property initializers;
- sources are UTF-8 without BOM and `build.ps1` passes `/codepage:65001`;
- no `dpiAware` in the manifest: the layout uses absolute coordinates, and
  Windows scales the window as a bitmap;
- `Bottom` anchors inside an `AutoScroll` panel squash the control; long pages
  use only `Top | Left`;
- text boxes are `CasellaTema` (in `Tema.cs`): they repaint their border and
  ask Windows for dark scrollbars, which WinForms does not do by itself.

## Layout

```
src/
  Guscio.cs           Main, window, sidebar, Pagina base class, clipboard, documents
  PaginaHome.cs       the home page: the state of every tool
  PaginaImpostazioni.cs  settings: theme, data in Drive, rizzo-pii, updates, terms
  Tema.cs             light/dark palette, control factories, CasellaTema
  Stato.cs            data model, persistence (settings + data in Drive)
  Dialoghi.cs         small dialogs: paste a list, show a text, edit a rule
  PaginaPosta.cs      the Posta tool (7 steps)
  GeneratorePosta.cs  Configurazione.gs of the Posta tool, without windows
  PaginaCartelle.cs   the Cartelle tool (2 steps: folders, Google Forms)
  GeneratoreAnno.cs   the year folders on disk, without windows
  PaginaOrari.cs      the Orari tool (4 steps)
  PaginaPrivacy.cs    the Privacy tool + documents for principal and DPO
  Moduli.cs           the Google Forms scripts: configuration, instructions, manifest
  Anonimizzatore.cs   HTTP client of rizzo-pii (local addresses only)
  Consenso.cs         terms of use + acceptance window
  Aggiornamenti.cs    GitHub releases of Campanella and rizzo-pii, checked download
  Xlsx.cs             minimal .xlsx reader (ZIP + XML) and CSV
  Testo.cs            text files read as UTF-8 or ANSI (Windows-1252)
  Orario.cs           timetable recognition, calendar blocks
  Calendario.cs       days without lessons, national holidays, the plan of calendar series
  risorse/            the .gs and .js files embedded in the executable
src-installer/        the C# installer, per-user, no UAC (local builds only)
installer/            Inno Setup script (the published installer, it/en), terms, SignPath artifact config
strumenti/firma.ps1   local signing with a self-signed certificate (-Firma, -Pubblica)
docs/                 GDPR notes, technical note and email for principal and DPO (Italian)
test/                 mock benches for the scripts, PowerShell tests for the app
.github/workflows/prove.yml     build and every CI test, on every push and pull request
.github/workflows/release.yml   checks, build, tests, SignPath signature, Inno installer, release
.github/dependabot.yml          monthly updates of the pinned actions
```

Every page is a `Pagina : Panel`; the shell shows it and lists its steps in the
left bar, which is built once. The theme is applied by walking the control tree
and colouring each control by the **role** written in its `Tag`.

## Testing

Run `.\build.ps1` before the tests: most PowerShell tests load
`dist\Campanella.exe` (`prova_stato.ps1` and `prova_disinstallazione.ps1`
compile the sources themselves, `prova_versioni.ps1` uses the executable
only if it is there), and `test\tutte.ps1` marks them as failed when that
executable is missing or older than the sources. The tests need **Node 18**
or later (CI uses 24) and **Python 3.7** or later, on the PATH as `python`
(CI uses 3.13), for the fake rizzo-pii of `prova_anonimizzazione.ps1`.

```powershell
.\test\tutte.ps1                                 # every CI test below, with a summary at the end
.\test\tutte.ps1 -Solo mock_orari,prova_stato    # only the ones named
.\test\tutte.ps1 -ConGrafica                     # plus the two tests that open windows
```

`tutte.ps1` runs these, in this order; `.github/workflows/prove.yml` runs it
on every push and pull request, and the release workflow before publishing:

```powershell
node test\mock_apps_script.js     # mail sorting: trial mode, labels, resume, undo
node test\mock_orari.js           # timetable emails, resume, class timetables, calendar: time zone, days without lessons, resume, timetable change; next to the mail script and a class file
node test\mock_moduli.js          # forms: yearly sheet, linking, closing, two years in a row
node test\mock_pannello.js        # the control sheet for several forms
node test\prova_gemelli.js        # twin functions of the two forms scripts stay identical
node test\mutazioni_pannello.js   # mutations of the control-sheet engine: the bench must catch each one
node test\nomi_funzioni.js        # every script function named by the app and the documents exists
node test\invarianti_script.js    # mail and timetable scripts: no mail to others, no external calls, only allowed deletions, on the calendar only Campanella's events, series shortened only in the timetable change, class students only in searches, neither script uses the other's functions
.\test\prova_orario.ps1           # reads a timetable, checks the grid, the days without lessons and the generated DatiOrari.gs, same calendar plan as the script
.\test\prova_xlsx.ps1             # the .xlsx reader and CSV files in ANSI, UTF-8 and UTF-16
.\test\prova_moduli.ps1           # generates both forms scripts and runs them in the benches
.\test\prova_personale.ps1        # staff list: paste formats, roles grouped into five categories
.\test\prova_stato.ps1            # loading and saving settings and Drive data, in temporary folders
.\test\prova_guscio.ps1           # the main window, never shown: error message, status code, closing
.\test\prova_disinstallazione.ps1 # what the C# uninstaller removes, on fake folders, and that Campanella.iss removes the same settings
.\test\prova_posta.ps1            # the real Configurazione.gs generator through the Gmail bench
.\test\prova_cartelle.ps1         # the year folders on a fake Drive
.\test\prova_versioni.ps1         # consent version and text, product and script versions, document names
.\test\prova_anonimizzazione.ps1  # rizzo-pii client against a fake service
```

Not in the CI:

```powershell
.\test\prova_disposizione.ps1     # builds the real window: overlaps, text that does not fit (-ConGrafica)
.\test\prova_solalettura.ps1      # folder without write permission: it must warn, not stay silent (-ConGrafica)
.\test\prova_installer.ps1        # really installs and uninstalls the C# installer
```

`prova_installer.ps1` refuses to run where Campanella is installed, because
it would touch the real installation and Start menu: run it with a Windows
user that never had Campanella. `prova_versioni.ps1` only reads: run it
before tagging a release. `genera_dati_prova.ps1` is not a test: it writes a
`DatiOrari_prova.gs` into `%TEMP%` from a timetable.

To change the terms of use, edit `installer\CONDIZIONI-it.txt`,
`installer\CONDIZIONI-en.txt` and `Consenso.Testo` in `src\Consenso.cs`
together, raise `Consenso.Versione` and `#define ConsensoVersione` in
`installer\Campanella.iss`, then add to the table at the top of
`test\prova_versioni.ps1` the row that the test prints.

The benches simulate `GmailApp`, `MailApp`, `CalendarApp`, `FormApp`,
`SpreadsheetApp`, `DriveApp`, `PropertiesService`, `LockService` and
`ScriptApp`, including a fake clock and a simplified interpreter of Gmail's
search syntax. They run on invented data; files generated from real data stay
out of the repository. Every test that creates a `Stato` points it at
temporary folders, never at the real settings or Drive.

## Google Forms

A form lives in the cloud: on the PC it is only a placeholder that cannot even
be read, so copying it from Explorer leaves its response sheet behind. Step 2
of Cartelle writes an Apps Script to paste once inside the form. Every year it
creates the response sheet in the year folder, links the form to it and reopens
the form; at the end of the year it closes the form and unlinks the sheet,
which stays as it is. From the second year it is one click inside the form.
The script opens only its own form, but Google gives it access to *all* the
account's forms unless the optional manifest the step prepares is added
before the first run; with the manifest, only to that form.

For several forms the same step writes a **control sheet** instead: one Google
Sheet with a row per form, from which the whole year is prepared at once. It is
more convenient and more expensive: a sheet-bound script opens forms that live
outside it, so Google always asks for access to *all* the account's forms,
besides Sheets and Drive, and its scheduled closings run on their own.

Nothing is deleted. Last year's answers stay in the form unless you ask for
them to be cleared, and even then only after every single answer has been
found, by its arrival time, in an earlier sheet.

## Safety for users

- No tool deletes mail, files, folders or response sheets. At most it
  archives, and archiving in Gmail is reversible. The tools remove only what
  they put there, and only when asked: labels from messages, and the
  timetable events they created. The control sheet also removes the empty
  "Foglio1" tab of a new spreadsheet and rewrites its own "Istruzioni" tab.
  The one real deletion is optional and off by default: clearing last year's
  answers from a form, described above, which cannot be undone. Besides, only
  when you run `EXTRA_togliFiltri`, the mail script removes the Gmail filters
  you already had and ticked in step 4, only those, after writing a copy of
  each one to the log so it can be made again by hand.
- The first run of the mail sorting always starts in trial mode, and in trial
  mode it does not even create the labels.
- The optional class labels also use the email addresses of your students,
  which you paste in Campanella: it never saves them (not in its settings,
  not in the data file, not in Configurazione.gs, not in any file on the
  computer). They exist only in a `Classe_*.gs` file you paste into your own
  Apps Script project: the script uses them only to search, logs how many
  there are, never which ones, and keeps them out of native Gmail filters
  (for classes those match the subject only). Deleting that file removes
  them.
- Every script has its undo functions (`ANNULLA_…`, `MODULO_ANNULLA`,
  `PANNELLO_ANNULLA`). With no label group, `ANNULLA_etichettatura` removes
  only the labels the script created, and says "NIENTE DA TOGLIERE" when
  there are none; `ANNULLA_etichettaturaCompleta` empties the labels of every
  active rule, same-named labels applied by hand included. Two things are
  not undone by the `ANNULLA_` functions: native Gmail filters, if created,
  are removed by hand in Gmail's settings or by `EXTRA_togliFiltri` after
  ticking them in step 4; messages a rule marked as read stay read.
- The mail and timetable scripts share one Apps Script project, and Google
  asks for its permissions all at once: Gmail, sending to yourself
  (`MailApp`), your own address (`Session`), triggers and, as soon as the
  timetable file is in the project, Calendar, even if only the emails are
  used. The forms scripts are separate projects with their own permissions;
  for the per-form script a variant without Drive can be generated for
  schools that block it.

## Code signing policy

Release binaries are built by GitHub Actions from this repository
(`.github/workflows/release.yml`) and signed through SignPath: the signature
attests that the executable was built from these sources, with no manual step
in between. Until the project is accepted into the open-source programme,
releases go out unsigned and say so.

Free code signing provided by [SignPath.io](https://signpath.io), certificate
by [SignPath Foundation](https://signpath.org).

- Committers and reviewers: [vittop89](https://github.com/vittop89)
- Approvers of signing requests: [vittop89](https://github.com/vittop89)

The project is maintained by one person: whoever writes the code also reviews
it and approves the signature. External changes arrive only through pull
requests.

Privacy policy: this program will not transfer any information to other
networked systems unless specifically requested by the user or the person
installing or operating it. The only connections it makes are to GitHub, to
check for new releases of Campanella and rizzo-pii and to download
rizzo-pii, and only when the user presses the button. The scripts it
generates run inside the user's own Google account; rizzo-pii runs locally,
and Campanella talks to it only at an address on the same computer. Details,
in Italian, in [PRIVACY.md](PRIVACY.md).

## Reporting and contributing

Bugs and proposals: GitHub *issues*, in Italian or English. For a security
problem do not open a public issue: see [SECURITY.md](SECURITY.md). Before
opening a pull request, run `.\test\tutte.ps1`. Versions are listed in
[CHANGELOG.md](CHANGELOG.md).

## Licence and trademarks

MIT — see [LICENSE](LICENSE).

Independent project, with no relationship with Google, Gruppo Spaggiari Parma
or mathema software. Gmail, Google Drive, Google Calendar, Google Apps Script,
Google Forms, ClasseViva and Orario Facile are trademarks of their respective
owners and are mentioned only to say which tools the application works with.

Before publishing or sharing this repository read [PRIVACY.md](PRIVACY.md)
(Italian): the code can be published, the data that runs through it cannot.
