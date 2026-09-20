# Campanella

*[Versione italiana](README.it.md)*

Four tools for a teacher's digital life, in one Windows application: a single
executable of a few hundred KB, no dependencies, no runtime to install.

Campanella is made for Italian schools on Google Workspace: the interface, the
documents and the generated scripts are in Italian. This README is in English
for the open-source audience.

| Tool | What it does |
|------|--------------|
| **Posta** (mail) | sorts the Gmail mailbox into labels (management, secretariat, circulars, colleagues, students…), past and future mail |
| **Cartelle** (folders) | builds the school-year folder tree in Drive and copies the templates into it; for Google Forms, which cannot be copied from a PC, it writes the script that gives each form its response sheet for the year |
| **Orari** (timetables) | reads the timetable from an Excel file, mails **you** one message per teacher, and puts your own timetable on Google Calendar |
| **Privacy** | the rules on school data and AI, tools to strip personal data before pasting into an assistant, and the documents for the principal and the DPO |

The application **never touches mail, calendar or Drive on its own**: it
prepares the code of a Google Apps Script that the user pastes into their own
account and runs. The scripts write to nobody else. The executable connects to
the network only when the user presses a button, to look up and download
rizzo-pii from GitHub.

## Download

| | |
|---|---|
| **[Installer (recommended)](https://github.com/vittop89/Campanella/releases/latest/download/Installa-Campanella.exe)** | installs per user, no administrator rights, appears in "Installed apps" |
| [Application only](https://github.com/vittop89/Campanella/releases/latest/download/Campanella.exe) | portable, keeps its settings next to itself |
| [Instructions](https://github.com/vittop89/Campanella/releases/latest/download/ISTRUZIONI-Campanella.txt) · [Privacy notes](https://github.com/vittop89/Campanella/releases/latest/download/PRIVACY.md) | Italian |
| [All releases](https://github.com/vittop89/Campanella/releases) | changelog and older versions |

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
.\build.ps1                  # -> dist\Campanella.exe + dist\Installa Campanella.exe
.\build.ps1 -SenzaInstaller  # the application only, faster for tests
```

Only Windows is needed: the compiler is the `csc.exe` of the .NET Framework
4.x already present in the system. No Visual Studio, no NuGet.

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
  Guscio.cs           Main, window, sidebar, home page, settings
  Tema.cs             light/dark palette, control factories, CasellaTema
  Stato.cs            data model, persistence (settings + data in Drive)
  PaginaPosta.cs      the Posta tool (7 steps)
  PaginaCartelle.cs   the Cartelle tool (2 steps: folders, Google Forms)
  PaginaOrari.cs      the Orari tool (4 steps)
  PaginaPrivacy.cs    the Privacy tool + documents for principal and DPO
  Moduli.cs           the Google Forms scripts: configuration, instructions, manifest
  Anonimizzatore.cs   HTTP client of rizzo-pii
  Consenso.cs         terms of use + acceptance window
  Aggiornamenti.cs    GitHub releases, download with progress
  Xlsx.cs             minimal .xlsx reader (ZIP + XML) and CSV
  Orario.cs           timetable recognition, calendar blocks
  risorse/            the .gs and .js files embedded in the executable
src-installer/        the C# installer, per-user, no UAC
installer/            Inno Setup script (it/en), terms, SignPath artifact config
docs/                 GDPR notes, technical note and email for principal and DPO (Italian)
test/                 mock benches for the scripts, PowerShell tests for the app
.github/workflows/release.yml   build, tests, SignPath signature, installer, release
```

Every page is a `Pagina : Panel`; the shell shows it and lists its steps in the
left bar, which is built once. The theme is applied by walking the control tree
and colouring each control by the **role** written in its `Tag`.

## Testing

```powershell
node test\mock_apps_script.js     # mail sorting: trial mode, labels, resume, undo
node test\mock_orari.js           # timetable emails and calendar
node test\mock_moduli.js          # forms: yearly sheet, linking, closing, two years in a row
node test\mock_pannello.js        # the control sheet for several forms
.\test\prova_moduli.ps1           # generates both forms scripts and runs them in the benches
.\test\prova_orario.ps1           # reads a timetable and checks the grid
.\test\prova_installer.ps1        # installs into a temporary folder, then removes
.\test\prova_anonimizzazione.ps1  # rizzo-pii client (fake service)
.\test\prova_solalettura.ps1      # folder without permissions: it must warn, not stay silent
```

The benches simulate `GmailApp`, `MailApp`, `CalendarApp`, `FormApp`,
`SpreadsheetApp`, `DriveApp`, `PropertiesService`, `LockService` and
`ScriptApp`, including a fake clock and a simplified interpreter of Gmail's
search syntax. They run on invented data; files generated from real data stay
out of the repository.

## Google Forms

A form lives in the cloud: on the PC it is only a placeholder that cannot even
be read, so copying it from Explorer leaves its response sheet behind. Step 2
of Cartelle writes an Apps Script to paste once inside the form. Every year it
creates the response sheet in the year folder, links the form to it and reopens
the form; at the end of the year it closes the form and unlinks the sheet,
which stays as it is. From the second year it is one click inside the form.

For several forms the same step writes a **control sheet** instead: one Google
Sheet with a row per form, from which the whole year is prepared at once. It is
more convenient and more expensive: a sheet-bound script opens forms that live
outside it, so Google asks for access to *all* the account's forms, not one.

Nothing is deleted. Last year's answers stay in the form unless you ask for
them to be cleared, and even then only after checking that an earlier sheet
already holds them all.

## Safety for users

- No tool deletes mail, files, folders, sheets or events. At most it archives,
  and archiving in Gmail is reversible.
- The first run of the mail sorting always starts in trial mode, and in trial
  mode it does not even create the labels.
- Every tool has its `ANNULLA_…` (undo) function.
- The mail and timetable script asks only for Gmail and, for the calendar step,
  Calendar. The forms scripts are separate projects with their own permissions;
  a variant without Drive can be generated for schools that block it.

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
look up and download rizzo-pii, and only when the user presses the button. The
scripts it generates run inside the user's own Google account; rizzo-pii runs
locally. Details, in Italian, in [PRIVACY.md](PRIVACY.md).

## Reporting and contributing

Bugs and proposals: GitHub *issues*, in Italian or English. For a security
problem do not open a public issue: see [SECURITY.md](SECURITY.md). Before
opening a pull request, run the test benches. Versions are listed in
[CHANGELOG.md](CHANGELOG.md).

## Licence and trademarks

MIT — see [LICENSE](LICENSE).

Independent project, with no relationship with Google, Gruppo Spaggiari Parma
or mathema software. Gmail, Google Drive, Google Calendar, Google Apps Script,
Google Forms, ClasseViva and Orario Facile are trademarks of their respective
owners and are mentioned only to say which tools the application works with.

Before publishing or sharing this repository read [PRIVACY.md](PRIVACY.md)
(Italian): the code can be published, the data that runs through it cannot.
