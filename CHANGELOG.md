# Changelog

## 1.4.6 — 22 September 2026

**The control sheet tidies itself up and keeps its own instructions.** A new
Google spreadsheet comes with an empty "Foglio1"; "Prepara il foglio" added
"Moduli" next to it and left the empty one there.

- "Prepara il foglio" now removes the empty default sheet (Foglio1, or Sheet1
  and friends in other languages) — only while it still has its original name
  and nothing in it. A renamed sheet, or one with anything inside, stays.
- It also writes an "Istruzioni" sheet: the first-time steps, what to do every
  September and during the year, what each column means, how to undo, and the
  settings in use. It is rewritten on every run so it never drifts from the
  script, and it is protected with a warning only.
- Moduli comes first, Istruzioni second, and the script leaves you on Moduli.
  "Prepara l'anno nuovo" does the same tidying and rewrites Istruzioni, so a
  file set up with an older version gets it on the next yearly run too.

**Fixes found while reviewing this release** (the control sheet engine):

- The Attivo and Svuota checkboxes were added with `insertCheckboxes()`,
  which Google documents as setting every cell to false: re-running "Prepara
  il foglio" could untick every row, and a row typed by hand started unticked
  and was skipped in silence. The boxes now go only on rows with a form, via
  data validation (which leaves values alone); a new row starts active; the
  old unticked boxes below the last row are removed; and every run lists the
  rows it skipped because Attivo is off.
- Re-running "Prepara l'anno nuovo" during the year (to add a form, say)
  relinked forms that had already reached their closing day — Google then
  copies all their responses into a second tab — and reopened them for good.
  It also reopened forms closed by hand. Now:
  - the script remembers when a form's closing has fired, and for the rest of
    that school year leaves it closed and unlinked, even if the day in
    "Chiusura" is moved or cleared afterwards;
  - a form whose year's sheet already holds its responses tab, but which no
    longer writes there, was unlinked by someone: it is not relinked
    ("scollegato a mano" in its row). "Annulla" followed by "Prepara l'anno
    nuovo" still relinks, because that is what was asked;
  - a form closed after its row was prepared stays closed ("chiuso a mano");
  - a row whose preparation broke halfway — a reopen that failed, a form not
    yet published, a sheet created but never linked, also by an older version
    — is not taken as done, and is redone in full the next time.
  A row with a closing day that cannot be read now stops before anything is
  created or linked, instead of halfway through.
- The closing's own run no longer stops at the first form it cannot close:
  it writes the problem in that row, keeps the date and tries again an hour
  later, and saves what it did for the others. It also checks that the form
  really stopped accepting responses before unlinking it; if Google did not
  close it, the row says so and the form stays linked until the retry.
- A sheet found by name is remembered only once the form actually writes to
  it, so a first link that fails is simply retried the next time.
- The new "prepared"/"closed" marks are kept only for the current school
  year, so they do not pile up toward Google's 9 KB limit per script property.
- A sheet of yours already called "Istruzioni" is left alone: the
  instructions go to "Istruzioni Campanella" instead, and the output says so.
- A form deleted during the year is now written into its own row on closing
  day ("non si apre piu'"), not only in a log nobody reads.
- The empty-sheet check also looks at drawings, slicers and notes.

**Posta fixes found in the same review:**

- With an empty staff list, the Colleghi rule had no senders left and its
  search lost the "from:" part: it matched the whole mailbox, and every
  conversation would have been labelled Colleghi. A rule whose senders expand
  to nothing now matches nothing (and makes no Gmail filter), and the
  generated configuration switches Colleghi off when the list is empty.
- ANNULLA_progressoRiordino, like ANNULLA_etichettatura, waits for a running
  PASSO_3 and says so if it cannot, instead of claiming a reset that the
  running block would undo.
- The real Gmail filters no longer include Studenti: a filter cannot exclude
  what other filters labelled, so it took the whole domain, colleagues
  included. It stays with the hourly sorting, and the output says so instead
  of promising that Gmail does everything alone. If a Studenti filter from an
  earlier version is still there, the output flags it at the top.
- ANNULLA_etichettatura first stops a PASSO_3 run that is still resuming (it
  would put labels back) and resets its progress; a resume that fires with
  nothing left to resume now does nothing instead of starting over. It says
  "FATTO" when done and "TEMPO SCADUTO A META'" when Google's time limit stops
  it, and it names the labels of switched-off rules it did not touch.
- If a filter cannot be created, its rule is listed with the ones that still
  need the hourly sorting. Only a filter covering the whole school domain is
  flagged as the old Studenti one; your own narrower filters are left out.
- "Scrivi in Gmail": the help says what happens with large groups (the
  message opens empty and the addresses go to the clipboard), and when the
  school account is not known it reminds you to check the sender.
- The generated configuration no longer calls the rules "in ordine di
  priorita'".

Disabled buttons are drawn by Campanella itself: WinForms ignored their text
colour and painted near-black on the dark theme (contrast 1.2:1, now 6.3:1),
and the layout test measures it in both themes.

**"Avanti" at the end of a section.** On the last step the button was already
disabled, but the theme painted a disabled primary button exactly like an
active one: it looked alive and did nothing. Now it reads "Vai a Cartelle",
"Vai a Orari", "Vai a Privacy" and takes you to the first step of the next
tool; after Privacy there is nothing left and it greys out. Every disabled
button in the app now looks disabled, in both themes.

**Posta, step 3 — writing to a group, explained by the page itself.** The row
is now titled and worded for what it does: "Scrivere a un gruppo", pick the
category, then "Scrivi in Gmail" opens a new message with those addresses
already in Bcc (on the school account when the Drive tells which one it is;
beyond about fifty addresses they go to the clipboard, to paste in Bcc).
"Copia gli indirizzi" remains for pasting by hand. Nothing is sent by
Campanella.

**Posta, step 4 — the text about rule order was wrong.** It said that rules
higher up take precedence. The engine does not work that way: labels add up
(a circular from the head teacher gets both Dirigenza and Circolari), and the
order only matters for rules that exclude others, like Studenti, which skips
whatever Colleghi, Dirigenza or Segreteria already took. The page, its "?"
bubble and the matching FAQ entry now say so.

## 1.4.5 — 21 September 2026

**The guessed addresses can now be checked against your own mailbox.** When
the staff list comes from the register it carries names and roles but rarely
addresses, so Campanella builds them from a pattern and warns you they are a
guess. Checking a few hundred of them by hand is not a plan.

- "Controlla gli indirizzi..." (step 3, box C) takes the list of real
  addresses — the email from `EXTRA_elencaIndirizziScuola`, pasted or loaded
  from a file — and compares it with the table. An address that matches is
  confirmed; one that is wrong but belongs to exactly one real address
  (m.rossi where the school uses mario.rossi) is replaced; anything ambiguous
  or never seen is listed and left alone. Nobody is added to the list.
- The matching reads the local part: every piece of it must be part of the
  person's name or its initial, so m.rossi fits ROSSI MARIO but not ROSSI
  ANNA, and segreteria@ fits nobody. Compound surnames (anna.deluca for DE
  LUCA ANNA), accents and trailing digits are handled.
- The report also says which pattern the school really uses, counted from the
  confirmed addresses, so the rest can be generated the right way.
- New "Visto" column in the table: "si" for the addresses that were actually
  seen in your mailbox. Editing an address by hand clears it.
- The paste dialog gained "Apri un file...", for the CSV the register
  downloads or a saved copy of the script's email.

## 1.4.4 — 21 September 2026

**The staff roles now reach Gmail.** The personnel list has always carried a
role for each person, but it stopped at the table: in Gmail everyone was just
"Colleghi". A school does not work that way — a message from the DSGA is not a
message from a colleague teaching next door.

- Step 3 has a new switch, "In Gmail dividi i colleghi per ruolo". With it on,
  the script also files staff mail under Colleghi/Docenti,
  Colleghi/Amministrativi, Colleghi/Tecnici, Colleghi/Collaboratori and
  Colleghi/Dirigenza. The general Colleghi label stays, so nothing you had
  before moves.
- The long role names from the register (DOCENTE LAUREATO SCUOLA SECONDARIA II
  GRADO, ASSISTENTE AMMINISTRATIVO, DIRETTORE SGA, COLLABORATORE SCOLASTICO...)
  are gathered into those five categories. A role that does not match any of
  them leaves the person under Colleghi alone.
- "Devo scrivere a": pick a category and "Copia gli indirizzi" puts them on the
  clipboard, ready for the Bcc field. This answers the other half of the
  question — not only "who wrote to me" but "who do I write to".
- The generated configuration gained a `gruppi` block and the `@GRUPPO:name@`
  placeholder, so a rule can point at one group instead of the whole staff.
  Both are plain text you can edit by hand, like the rest.
- The ClasseViva extraction (console script and Chrome extension) now adds a
  CATEGORIA column, prints a summary per category, and always leaves a CSV
  block in the console to copy by hand if the clipboard refuses.
- "Incolla elenco" reads semicolon CSV too, quotes included: the file the
  register downloads, or the one Campanella exports, can go straight back in
  without losing the roles. The export gained the CATEGORIA column.
- New test, `test/prova_personale.ps1`: the real role names from a register,
  the four paste formats, and the grouping that feeds Gmail.

## 1.4.3 — 21 September 2026

**"Logging output too large" while listing the school addresses.**
`EXTRA_elencaIndirizziScuola` wrote every address it found into a single log
entry. With a few hundred addresses Google truncates that entry, so the run
looked like it had failed and the count at the top was buried in the notice.
The list was never lost — the script always mails it to you — but nothing said
so.

- The log now starts with the summary line, then says in capitals that the
  full list is in the email it just sent you, and only then repeats the
  addresses in blocks of 40. Whatever Google truncates is at the bottom, where
  it no longer matters.
- The email says how many conversations were examined, and why the scan
  stopped: time budget or ceiling.
- The ceiling went from 1000 conversations to 4000. The 4 minute 20 second
  budget was already the real limit; 1000 was cutting mailboxes short before
  the time ran out.
- Step 7 has a question for that exact message, and the method C guide says
  the log only carries the count.

## 1.4.2 — 20 September 2026

**Lighter pages: the long explanations moved into "?" bubbles.** Every page
kept a paragraph of grey text next to each field. On a screen at 100% those
paragraphs pushed into the controls beside them, and most of them went unread
anyway. Now the page states the point in one line and a "?" in a circle opens
the rest in a small themed bubble, which closes as soon as you click elsewhere
or press Esc. Twenty of them, across Posta, Cartelle, Orari, Privacy and
Impostazioni.

- Fixed the overlaps that came with those paragraphs: the log box ran into the
  buttons in Cartelle step 1, the intro ran into the file box in Orari step 1,
  two panels in Posta stuck out past the right edge of the page, and two
  labels that start empty (the timetable summary, the settings result) were
  one line too short for the text they later receive.
- New test, `test/prova_disposizione.ps1`: it builds the real window off
  screen, walks every page and every step, and fails on overlapping controls,
  anything past the right edge, and text that does not fit its label. It also
  clicks every "?" and checks the bubble opens and holds its text. `-Immagini`
  saves a picture of each page.

## 1.4.1 — 20 September 2026

- No parent label by default. The labels are now created with the names you
  read in the list (Circolari, Colleghi, Studenti), not under "Scuola". A
  teacher who already sorts by hand gets their own labels filled instead of a
  second set alongside them. Type a name in "Raggruppa sotto" to get the old
  behaviour back, for every label at once.
- The hint next to the box now says when each choice fits. Inside the school
  account every message is work, so a parent label adds a level for nothing;
  it earns its keep when a personal mailbox also collects school mail, where
  it keeps that mail together and removable in one go.

## 1.4.0 — 20 September 2026

**The label group is back, as a field you can empty.** Campanella files its
labels under "Scuola": Scuola/Dirigenza, Scuola/Colleghi and so on. That keeps
them separate from whatever you already have, and lets you remove them in one
go, but a teacher who already sorts by hand ends up with two labels for the
same thing. Step 4 now has a "Tutte sotto l'etichetta" box.

- Leave it as "Scuola" and nothing you already have is touched.
- Empty it and the script uses the names in the list as they are. Gmail labels
  with those exact names are reused, not duplicated, so your own Colleghi and
  Studenti get filled instead of being shadowed. Rename a rule to match one of
  your labels and that one gets used too.
- The warning next to the box says the price of the second choice:
  ANNULLA_etichettatura would then strip those labels from the messages you had
  labelled by hand, because it can no longer tell them apart.
- The test bench covers it: with no group, existing labels are reused and the
  ones under "Scuola" stay where they are.

## 1.3.6 — 20 September 2026

- When the control sheet finds this year's response sheet by name, instead of
  creating it, it now remembers it as the sheet of the year. Without that,
  "Controlla com'e' messo adesso" called it "a sheet I did not create", which
  is exactly the case of a form handed over from the per-form script.

## 1.3.5 — 20 September 2026

**The closing day turned into a date, and the script could not read it back.**
Google Sheets reads "31/08" as a date unless the column is set to plain text,
and the panel set that format only after writing the rows. The cell then held
a Date, and the preview refused it: "la chiusura Mon Aug 31 2026 00:00:00
GMT+0200 non e' nella forma giorno/mese".

- The column is set to text before anything is written into it.
- "Prepara il foglio" repairs a sheet that already has dates in that column,
  writing them back as 31/08. It is the same menu entry as always, and it
  leaves every other column alone.
- The reader accepts a date anyway, so a sheet built with the older version
  keeps working while you get around to repairing it.
- The test bench now imitates that behaviour of Sheets, so the mistake cannot
  come back unnoticed: removing any of the three fixes makes it fail.

## 1.3.4 — 20 September 2026

Instructions only, after a teacher walked into both traps on the same day.

- Deleting the code from the form's Codice.gs does not delete the closing it
  had already scheduled: the trigger belongs to the project, not to the text.
  It fires next August, finds no function and Google sends a failure email.
  Both guides now say so and point to the clock icon in the editor.
- A new section lists the triggers by name and says which script owns each
  one, because that page only shows the project you are looking at:
  PANNELLO_chiusura, MODULO_chiusura, smistaNuoviMessaggi,
  PASSO_3_riordinaPostaEsistente, ORARI_2_invia. For each one, what happens
  if you remove it and how to put it back.

## 1.3.3 — 20 September 2026

**A form with the per-form script, also listed in the control sheet.** The two
scripts cannot see each other: one lives in the form, the other in the sheet.
Running both on the same form closed it twice at the end of the year and, if
folder or sheet name differed, left two sheets for the same year.

- The control sheet now adopts the sheet the form is already writing into,
  when its name matches the one the row asks for, instead of creating a second
  one. It works even if that sheet sits in another folder.
- The per-form script has a new menu entry, "Passa il comando al foglio di
  controllo", which removes only its own scheduled closing and leaves the link
  and the form untouched.
- Both sets of instructions explain the handover, in three steps, and say that
  keeping the form out of the sheet is one unticked "Attivo" away.

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
