# Changelog

## 1.3.2 — 20 September 2026

**The control sheet does not refresh by itself, and now says so.** Its Stato,
Foglio dell'anno and Ultima esecuzione columns are a diary of what the script
did, not a live view: unlink or close a form by hand in Google and the sheet
stays behind. A new menu entry, "Controlla com'e' messo adesso", reads the
real state of every listed form and rewrites the rows. It only reads.

- A form deleted or trashed during the year no longer leaves anything hanging:
  its row says so, the other rows are prepared as usual, and its pending
  closing is dropped instead of keeping the scheduled triggers alive. The
  response sheet stays in Drive with the answers it already collected.
- The instructions now spell out how to add a form (a row, then "Trova i
  moduli nel Drive") and how to retire one (untick "Attivo").

**The folder field in step 2 explains itself.** Under the box there is now the
path that comes out of it, updated as you type, instead of an example that
looked like a value to copy. The dropdown offers RECUPERI as well as
RECUPERI\TRIMESTRE, so the shallower choice is visible.

## 1.3.1 — 20 September 2026

**"No forms found" when the forms were there.** A teacher who also has a
personal Google account has two Drive letters mounted, and Campanella picked
the first one it saw, which was the personal one: no MODELLI, no year folders,
so Cartelle reported an empty Drive while everything sat on the other letter.
It now looks at what is inside each candidate before choosing, preferring the
Drive that holds MODELLI or `A.S. …` folders, and it reads the account from
the volume label to rule out a consumer address.

- The folders page shows which account the chosen Drive belongs to, warns when
  it does not look like the school one, and offers a button to switch.
- The home page says so too, instead of reporting "folders to create" forever.
- The step 2 message now names the folder it searched, and points to the other
  Drive when that one does have the forms.

## 1.3.0 — 20 September 2026

**Google Forms.** A form lives in the cloud: on the PC it is only a
placeholder that cannot even be read, so copying it from Explorer leaves its
response sheet behind and every September the form has to be relinked by
hand. Cartelle is now in two steps, and the second one writes an Apps Script
to paste once inside the form. From then on, every year: it creates the
response sheet in the year folder, links the form to it, reopens the form,
and at the end of the year closes the form and unlinks the sheet, which stays
as it is. From the second year it is one click inside the form, under the
puzzle-piece icon, menu Campanella.

- The school year is computed in Italian time and rolls over on 1 September;
  the closing trigger is scheduled with an explicit time zone, so the editor's
  own time zone cannot shift it by a day.
- Nothing is deleted. Last year's responses stay in the form unless you ask
  for them to be cleared, and even then only after checking that an earlier
  sheet already holds them all.
- Running it twice changes nothing: it remembers the sheet it made, reuses one
  that already has the right name, and never leaves two linked tabs behind.
- A variant without Drive can be generated for schools that block Drive for
  scripts: that code does not mention Drive at all, so the permission is not
  requested. An optional manifest narrows Forms access to that single form.
- Partial consent is refused: if a permission is missing the script stops and
  says so, instead of failing alone next August.
- Cartelle no longer tells you to duplicate a form by hand: the note it writes
  next to the templates now points to step 2.

**More than one form?** The same step writes a control sheet instead: one
Google Sheet with a row per form, a menu to prepare the whole year at once,
and the outcome written back into each row. It is more convenient and more
expensive: a sheet-bound script opens forms that live outside it, so Google
asks for access to all the account's forms. With one or two forms the script
inside the form remains the better deal, and the app says so.

- The installer is now published as `Installa-Campanella.exe`, without the
  version in the name, so that the links in the README always point to the
  latest release.
- New test benches: `test/mock_moduli.js` (fake Forms, Sheets, Drive, triggers
  and clock; two school years in a row) and `test/prova_moduli.ps1`, which
  generates both scripts with the real generator and runs them in the benches;
  `test/mock_pannello.js` simulates a Google Sheet, cell by cell.

**Posta.** Step 2 no longer repeats the label-group explanation under the
school domain field.

## 1.2.0 — 12 September 2026

First release published on GitHub.

- **Orari** (timetables): the emails reach only whoever runs the script;
  gone are the sending to colleagues, the drafts and the address matching;
  the generated data holds no address. New "Google Calendar" step: a
  teacher's timetable as weekly events, removable with
  `ORARI_ANNULLA_calendario`.
- **Archivio** removed: no more mail downloaded into Drive, no file
  monitoring.
- **Other people's data** (staff list, addresses, timetables) can be kept in
  `campanella-dati.json` inside Drive instead of next to the program.
- **Posta** (mail): the label group is no longer asked (it stays "Scuola");
  Chrome extension, generated on demand, to read the staff from ClasseViva;
  the summary explicitly goes to one's own account.
- **Scripts**: in trial mode not even the labels are created; execution lock
  against overlaps; a rule with a search rejected by Gmail is skipped and
  reported.
- **Cartelle** (folders): school year that changes by itself on 1 September;
  examples in the boxes; generic starting folders; `MODELLI\PER CLASSE`
  copied into every class.
- **Interface**: sidebar without flicker; themed text-box borders and
  scrollbars; placeholders in empty boxes; empty starting domain and Drive
  folder detected automatically.
- **Documents** for principal and DPO (technical note, email template, GDPR)
  embedded in the application and copied by the installer; terms of use
  updated (version 2, asked again to everyone).
- **Publishing**: Inno Setup script (it/en), GitHub workflow with SignPath
  signing, tests on invented data, `SECURITY.md`; the version shown in
  Settings and in "Installed apps" now says 1.2.0.

## 1.1.0

Internal version: five tools (Posta, Cartelle, Orari, Archivio, Privacy),
C# installer, anonymisation with rizzo-pii.
