# Changelog

## 1.6.0 — (data da definire)

Scripts to paste again: Orari.gs and Organizzazione_Gmail.gs; copy DatiOrari.gs again.

**Orari: school holidays and timetable changes on Google Calendar**

- Step 4 has "Giorni senza lezione": one line per day or period
  (`01/11/2026 Tutti i Santi`, `23/12/2026-06/01/2027 Vacanze di Natale`,
  `dal 23/12/2026 al 06/01/2027`, `2026-11-01`, two-digit years, and also
  without the year, `01/11` or `23/12-06/01`: the year comes from the school
  year of the period, September to December the first one, January on the
  second). A period may end with a full stop, as in circulars, and "fino al"
  works too. Empty lines and lines starting with # do not count; a line
  Campanella does not understand (an impossible date, the end before the
  start, two dates written another way, as in `07/12/2026, 08/12/2026` or
  `2026-11-01-03`, digits of other scripts) is shown in the summary, in
  amber, and left out of DatiOrari.gs: never taken as its first day only.
  Lines pasted from a PDF with Unicode line breaks are split. A line that
  does not touch the period (a wrong year) is not counted, and the summary
  says so in amber. "Aggiungi le feste nazionali" adds at the end the
  national holidays of the period that no line covers yet: All Saints, the
  Immaculate Conception, Christmas, St Stephen, New Year's Day, Epiphany,
  Easter (computed, no internet) and Easter Monday, 25 April, 1 May, 2 June
  and, from 2026 on, 4 October (St Francis of Assisi and St Catherine of
  Siena, law 151/2025). Two holidays on the same day (Easter on 25 April
  2038) make one line with both names. With the end before the start the
  button says so. No regional calendars are built in: holidays, the patron
  saint and bridge days are copied by the teacher from the school calendar
  circular, as the page says. The default end of the period is 10 June of
  the school year, with July and August already counting for the year that
  starts in September (the rule of the lines without a year), never before
  today.
- On those days the calendar has no lessons: each block of hours becomes one
  weekly series per stretch of consecutive weeks without a day off, until
  the last lesson of the stretch. The summary of step 4 says how many series
  and how many lessons are skipped. The plan is computed in the app
  (Calendario.cs) and in the script, and the tests check that they agree.
- "L'orario e' cambiato: il nuovo vale dal" with its date, and the new
  function ORARI_5_cambioOrario: the series already on the calendar that
  started before that date now end the day before (their recurrence is
  changed, keeping the first lesson), those starting from that date on are
  removed, and so are the single events with the mark; then the new timetable
  goes on from that date. The weeks before stay as they were, and running it
  again with the same date gives the same calendar. A date before the start
  of the period counts as the start: earlier school years in the same
  calendar (the default name "Orario COGNOME" is the same every year) are
  not touched, and preview and message say that the new timetable holds for
  the whole period. The first lesson of a series, needed to shorten it, is
  the first with its most frequent day, time and length: a first lesson
  moved by hand no longer moves the whole series. Only events with the mark
  are shortened or removed; a series recognised only by the description (a
  copy made by hand) is left and named. The final message says how many
  series were shortened, removed and created, how many single events were
  removed, how many lessons were skipped, which shortened series had lessons
  moved or cancelled by hand, and that such changes may not survive. It also
  serves for a day off added after the timetable was put on the calendar.
  The period ("Dal" and "al") stays as it was: the change date goes only in
  the tick. With the box unticked there is no change date. Before, the only
  way was ORARI_ANNULLA_calendario and ORARI_4_calendario again, which also
  rewrote the past weeks.
- The calendar is one of the teacher's own, with exactly that name
  (getOwnedCalendarsByName and an exact match: not a colleague's calendar
  the teacher is subscribed to, not one differing in case); with two of them
  the functions stop without touching anything.
- ORARI_4_calendario and ORARI_5_cambioOrario resume by themselves, like the
  sending: when an execution runs out of time, or Google says there were too
  many calendar changes in a short time ("Service invoked too many times",
  "You have been creating or deleting too many calendars or calendar
  events", rate limit, also in Italian), they save where they are, with a
  fingerprint of the plan, and schedule themselves again a minute later. When
  the day's quota is over, or Google keeps refusing after ten resumes in a
  row, they stop and ask to be run again later; any other error keeps the
  saved point and shows. A resume that finds a different DatiOrari.gs stops
  and explains instead of mixing two timetables: for ORARI_4_calendario the
  saved point stays, and the message says to finish with the previous
  DatiOrari.gs and then, with a change date, to run ORARI_5_cambioOrario
  (removing everything and starting again would give the new timetable to
  the weeks before too). A resume with nothing to do removes its trigger
  and says so, and one that finds its job stopped by ANNULLA_automazione
  does not work nor reschedule itself. There is a short pause between series;
  the description goes in the options of createEventSeries and the mark right
  after, and a series whose mark fails counts as done (its description still
  identifies it), so a resume never creates it twice.
- ORARI_4_calendario, ORARI_5_cambioOrario and ORARI_ANNULLA_calendario take
  the same lock as the sending: with the lock busy and a job half done, the
  first two schedule its resume, otherwise they ask to retry; the messages of
  the sending with the lock busy name the calendar too.
  ORARI_ANNULLA_calendario also forgets a job half done and removes the
  calendar resumes; it removes the events of the period in DatiOrari.gs (with
  the mark, or the description, as in a copy made by hand), and when time
  runs out or Google asks to slow down it stops, says how many it removed and
  asks to be run again. ORARI_4_calendario still refuses to put a timetable
  over one already there, and now points to ORARI_5_cambioOrario too.
- ORARI_1_anteprima says how many days or periods without lessons fall in
  the period, how many series ORARI_4_calendario would create and how many
  lessons are skipped, and, with a change date, that the change is made with
  ORARI_5_cambioOrario and how many new series it would create.
- Single events are told apart with isRecurringEvent (getEventSeries is
  never null in Google).
- DatiOrari.gs: the `calendario` block has `sospensioni` (only the lines
  understood, with full dates) and `validoDal`. The days without lessons
  (`calSospensioni`) are free text, where a leave or a colleague's name
  ends up easily next to the holidays: they follow the personal data, so
  with the data in Drive they are in campanella-dati.json and
  campanella.json has no trace of them. The change date (`calValidoDal`),
  only a date, is a setting in campanella.json. The settings files move to
  format 3, so Campanella 1.5.3 does not overwrite them (it would leave the
  days without lessons in campanella.json) and says it needs updating.
- Posta: ANNULLA_automazione also removes and names the calendar resumes
  (ORARI_4_calendario, ORARI_5_cambioOrario), and marks a calendar job half
  done as stopped, so that a resume already started, waiting for the lock,
  does not pick it up again; run by hand, the function goes on.

**For developers**

- mock_orari.js runs in the Europe/Rome time zone, with daylight saving time,
  also in the CI in UTC (a weekly step in milliseconds would go unnoticed
  there). The fake Calendar repeats a series every week until `until`, takes
  the options of createEventSeries and setRecurrence, can throw Google's
  limits at the n-th call of an operation, has lessons moved or cancelled by
  hand, calendars one is only subscribed to, names matched regardless of
  case, and a non-null "series" for single events, as Google. New sections:
  days without lessons (an isolated holiday, a long break, a Monday block
  split by Easter Monday and a Wednesday one that is not, days outside the
  period), which calendar is used, resume for time and for Google's limits
  without duplicates, lock, changed DatiOrari.gs, timetable change
  (shortened, removed, created, weeks before untouched, no old lesson after
  the date, same result when run again, resumed halfway, a date before the
  start with last year in the same calendar, a "Dal" moved forward, lessons
  moved or cancelled by hand, a copy made by hand), undo of a job half done,
  undo stopped by time or by Google's limits, and ANNULLA_automazione with a
  resume already started.
- invarianti_script.js checks the calendar by shape (CALENDARIO_ORARI): only
  four members of CalendarApp; every method that reads, creates, changes or
  removes events only in a few functions, on a receiver written exactly so,
  which in the functions that change or remove comes from an exact
  declaration and is never changed; the mark and "ours" assigned only in the
  allowed forms, with the guards in the loop before the calls; no call,
  apply, bind, eval, this, unused event methods, destructuring, quoted
  properties or functions inside the functions that change or remove. The
  seven ways around the previous rules found by the review, and seventeen
  more, must fail, as the eight copies of before.
- prova_orario.ps1: the line formats (also with a full stop, "fino al",
  other line breaks), lines not understood (two dates written another way,
  digits of other scripts), lines outside the period, holidays of several
  years (Easter 2027 on 28 March, 2028 on 16 April, 2038 on 25 April with the
  Liberation Day in one line, Easter Monday 2011 too, 4 October only from
  2026), the default end of the period, the plan, `sospensioni` and
  `validoDal` in the generated DatiOrari.gs, and the same number of series
  and skipped lessons in the app and in the script, from the start and from
  the change date. prova_stato.ps1 checks that the days without lessons
  follow the personal data and the change date stays in the settings;
  prova_disposizione.ps1 checks step 4 with the fullest summary, the tick,
  the holidays button (also with the end before the start) and a line
  outside the period.

## 1.5.3 — 24 September 2026

Scripts to paste again: Organizzazione_Gmail.gs (and copy Configurazione.gs
again).

**Posta: label colours**

- Step 4: every label has a colour, the one it will have in Gmail. Next to
  the selected rule, "Colore in Gmail" shows it and "Cambia..." opens Gmail's
  own palette (Gmail accepts no other colour, for the background or the
  text), each colour with the text colour that reads best, plus "nessun
  colore" to leave the label Gmail grey. The built-in rules start with a
  colour each, all different: red Dirigenza, orange Segreteria, yellow
  Circolari, teal Registro elettronico, blue Colleghi, green Studenti, dark
  grey Ministero e USR, purple Sindacati, mint Formazione e corsi, pink Orari,
  grey Newsletter, brown Genitori. A rule you add gets the first colour no
  label uses yet.
- With the role sub-labels on (step 3), Colleghi/Docenti,
  Colleghi/Amministrativi and the others get shades of the Colleghi colour,
  always the same shade for the same role, a different one for each role
  (teal has only three shades: the lightest blues complete the set), and
  follow it when it changes.
  "Cambia..." on Colleghi also sets each of them by hand, "nessun colore"
  included; small squares next to the Colleghi colour show them. With no
  colour on Colleghi they have none, unless set by hand. By default no two
  labels share a colour.
- Rules saved by 1.5.2 or earlier have no colour: when Campanella starts, the
  built-in ones get theirs (recognised by name, or by source for Dirigenza,
  Segreteria and the electronic register, even when renamed) and your own
  rules the first free ones. A "nessun colore" you choose stays that way. A
  colour written by hand in campanella.json that Gmail would refuse becomes
  no colour. The settings files move to format 2, so an older Campanella
  does not overwrite them (it would lose the colours) and says it needs
  updating.
- Configurazione.gs carries each colour (`colore: { sfondo, testo }`, on the
  rules and on the role sub-labels): a changed colour changes the
  fingerprint.
- The script applies the colours through the optional "Gmail API" advanced
  service, the same one as the native Gmail filters. With the service on,
  the labels it creates (PASSO_2, PASSO_3 and the hourly sorting) are born
  with their colour; without it they are created as before and PASSO_2 says
  how to add the service. Two new functions colour the labels that already
  exist: EXTRA_coloraEtichette colours the labels with no colour, those the
  script created and those that still have the colour the script gave them
  (so a colour changed in Campanella reaches them too), and leaves alone a
  colour you gave by hand to a label you already had, or to one you deleted
  and made again with the same name; EXTRA_coloraTutteLeEtichette recolours
  those too, and says so. For a label still missing it points to PASSO_2
  (in test mode: it will be born coloured once test mode is off). Both use
  the same lock as the sorting (if a run is still working they
  ask you to retry in a minute), change nothing in test mode (they list what
  would change), skip and report a colour Gmail does not accept, never touch
  the label of a rule without a colour and never delete a label; without the
  service they explain how to add it.
- PASSO_1_anteprima adds one line under the fingerprint: how many labels
  have a colour, and whether the Gmail API service is there to apply them.
- Guided installation: the last, optional card is now about the Gmail API
  service, for the colours and for the native filters. "Aiuto e problemi"
  has an entry for labels that stay grey.

**Posta: removing the Gmail filters you already had**

- Step 4: "Filtri che hai gia' in Gmail..." opens a window that explains how
  to export your filters from Gmail (Settings -> See all settings -> Filters
  and Blocked Addresses -> select all -> Export, usually mailFilters.xml) and
  opens that file. Each filter is listed with what it looks for, what it
  does and a suggestion: "uguale a una regola di Campanella" when its label
  is the full label (group included, case aside) of a rule the configuration
  writes on, or of a role sub-label, and then it starts ticked unless it
  also does something the rules never do (forward, delete, star, important,
  never spam, category), which the suggestion names; "creato da Campanella"
  when it also has exactly the criteria EXTRA_creaFiltriGmail gives that
  rule now, and then it does not start ticked; "simile a ..." when it shares
  a word (singular or plural alike, "circolo" is not "circolari") or a
  synonym (famiglie/genitori, alunni/studenti, ClasseViva/registro...) with
  a rule, or is the name of a rule that is off; otherwise "tuo". Filters
  chosen earlier stay ticked, also after opening a file that does not have
  them; two identical filters tick together; a filter with no label, or with
  a criterion Campanella cannot read (an unknown value or property, which
  could be a criterion), cannot be ticked. Sorting a column keeps each tick
  on its own filter. A broken or wrong file (another Atom feed included)
  gets a plain message, and a file with a DOCTYPE is not opened. The window
  says that the exported file contains your filters and can be deleted once
  opened; under the button step 4 says how many filters are to be removed.
- The chosen filters (label and exact criteria) are saved with the personal
  data, next to the staff list (campanella-dati.json in the Drive when the
  data are there), because criteria can contain addresses. An entry that
  cannot be fully understood is dropped, never kept with a criterion
  missing. Format 2, already new in this release, covers them.
- Configurazione.gs carries them as `filtriDaTogliere` (label and criteria
  with the Gmail API names): they change the fingerprint, and the step 5
  summary counts them.
- New script function EXTRA_togliFiltri, with the optional Gmail API service
  (without it, it says how to add it and changes nothing). Under the same
  lock as the sorting it removes only a filter with exactly those criteria,
  all of them and none more, that adds that label, and before removing each
  one it writes a complete copy (criteria and actions, with label names and
  the wording of Gmail's "Create a filter" window) to the log, to recreate
  it by hand; at the end it sends the same recap to your own address when
  the report email is on. It never touches other filters, labels or
  messages. In test mode it only lists what it would remove and what it
  cannot find. It reports removed, not found and already removed: run
  again, it removes nothing and says so (it remembers only a fingerprint of
  each removed entry, no address or word). PASSO_1_anteprima adds one line
  with how many filters are to be removed.
- EXTRA_creaFiltriGmail does not create a filter you chose to remove, and
  says so: the two functions no longer undo each other.
- Labels already on messages stay: delete in Gmail the ones you no longer
  want (messages are not deleted). The check of the promises made to the
  DPO allows removing a filter only inside EXTRA_togliFiltri, which no other
  function or trigger may call; deleting a label or a message stays
  forbidden everywhere. Guided installation step 8 and "Aiuto e problemi"
  explain it.

## 1.5.2 — 23 September 2026

No script to paste again: only the application changes.

- Mail, guided installation, step 6: the text now says plainly what to do
  (press the button, paste the configuration over the old one, run
  PASSO_3_riordinaPostaEsistente). The button also switches off the
  "Modalita' prova" tick of step 4, so a later copy of the configuration no
  longer silently puts the script back in test mode (and stops sorting mail).
- Mail, step 5: next to the configuration fingerprint Campanella says whether
  the configuration you copy is in test mode or acts for real.

## 1.5.1 — 23 September 2026

Scripts to paste again: Organizzazione_Gmail.gs (and copy Configurazione.gs
again).

**Posta: a preview that says what it counts**

- PASSO_1_anteprima shows, for each rule, how many conversations will get
  the label and, when the label is already in Gmail, how many have it now
  and whether the script created it or it existed before ("esisteva gia'",
  also for labels made by the script up to 1.4.6, which did not note them:
  the script reuses it; with no label group ANNULLA_etichettatura leaves it
  alone and ANNULLA_etichettaturaCompleta empties it, while inside a group,
  "Raggruppa sotto", ANNULLA_etichettatura empties it too, and the preview
  says so). A label you had already filled no longer looks nearly empty next
  to its sub-labels, and a count that hit Gmail's limit of 500 per search
  shows as "500+" instead of an exact 500. A conversation found by more than
  one of a rule's searches (a reply-all among colleagues, when the staff
  list is split into searches of 20 addresses) counts once, as step 3
  labels it once. Columns are aligned and lines stay within 100 characters
  in the execution log: a label name too long for its column gets a line of
  its own, with the numbers below.
- The note saying every count is too high "because the labels do not exist
  yet" is gone. A rule that excludes other labels, such as Studenti, is
  called an overestimate only when an excluded rule still has conversations
  to label, and the preview names it.
- Rules that put two labels on the same messages are listed after the
  table: same senders, or all of one rule's senders inside another's, with
  no other condition. Typically Dirigenza and Colleghi/Dirigenza, when the
  addresses in "La tua scuola" are the staff list's Dirigenza group; the
  preview says which rule to switch off in step 4 if you want only one.
  Colleghi with its role sub-labels, and a rule inside the whole staff list,
  are meant that way and are not listed.
- A rule whose senders are written out, addresses or domains (the built-in
  ones included), and that finds no message at all says so under its row,
  and suggests checking the addresses (for the electronic register, the real
  sender of a notification).
- Configurazione.gs carries a fingerprint of your choices ("impronta", 8
  characters; test mode, the date and the comments do not count, so both
  copies of the guided installation share it; a name or a role spelled
  differently in the staff list leaves it unchanged, a different address or
  a role that moves to another group changes it). The preview prints it and
  Posta step 5
  shows the current one: if they differ, the pasted configuration is older
  than the app (a rule you switched off is still on in the script) and must
  be copied again. A configuration without one was made by an earlier
  version.
- With the role sub-labels on, Posta step 4 warns in amber when an active
  rule has the same senders as a role of the staff list, or part of them,
  naming the rule and the sub-label.

**For developers**

- New `GeneratorePosta.Impronta` and `GeneratorePosta.DoppioniConIRuoli`,
  tested headless in `prova_posta.ps1`, which also runs a generated
  configuration through the real preview. `mock_apps_script.js` adds an
  invented school with a hand-made label, a capped rule, a wrong register
  address and the Dirigenza duplicate; its fake conversations can have
  several senders, and it checks long label names and a "Scuola" group left
  by 1.4.

## 1.5.0 — 23 September 2026

**Before you update.** Update Campanella on every PC that shares the same
data file in Drive: versions up to 1.4.6 do not know the new format number
and, when they save, drop the fields they do not know (the calendar name and
the timetable layout). The terms of use move to version 4: point 1 now also
covers the control sheet, which asks for permission on all the account's
forms, sheets and Drive, and whose scheduled closings run on their own, and
says that the script inside a form, without the optional manifest, gets
permission on all the account's forms too. Campanella asks you to accept
them again at the first start.

Scripts to paste again: Organizzazione_Gmail.gs (and regenerate
Configurazione.gs), Orari.gs (and regenerate DatiOrari.gs), the form script
(Moduli.gs) and the control-sheet script (Pannello.gs). Re-create the Chrome
extension too ("Estensione..." in Posta, step 3) and reload it in
chrome://extensions. From now on every script preview prints the script's
version, so you can tell which one is pasted.

**Your data are no longer overwritten by mistake.**

- Closing Campanella without opening Orari, Cartelle or Privacy saved them
  empty: the timetable, the Drive path, the year, the classes and the form
  choices were wiped, and the Privacy "read" tick and reversible-cleaning
  choice were reset. A page never opened now touches nothing, and a
  timetable file that is not recognised no longer erases the one already
  saved.
- `campanella-dati.json` in Drive is never overwritten when it could not be
  read at startup (truncated, empty, locked, or written by a newer version),
  when it appeared only after startup, or when another computer changed it
  while Campanella was open. Campanella says so at start or at close, and
  Settings > Apply lets you use that file or replace it. If another computer
  changed it and you changed something too, closing asks whether to close
  anyway (default No, as your changes would be lost); No opens Settings,
  where you choose whether to replace that file or use it. A file missing at
  startup is no longer created empty when nothing was entered.
- An unreadable `campanella.json` is left alone instead of being reset, and
  you are told how to start over; it is now saved atomically.
- Both files carry a format number: fields this version does not know are
  kept, and a file written by a newer version is read but never overwritten.
- Settings > Apply asks whether to use or replace a data file already in the
  chosen Drive folder; moving the data removes the old copy, unless it was
  never read here or another computer changed it meanwhile (then Campanella
  says so and leaves it), and a failed move rolls back. With data in Drive,
  the calendar name lives there too, so `campanella.json` holds no names.

**Posta**

- Test mode really changes nothing: PASSO_2_creaEtichette only lists the
  labels to be created, and EXTRA_creaFiltriGmail creates no filter.
- With no label group, ANNULLA_etichettatura removes only the labels the
  script created (it now remembers them) and says "NIENTE DA TOGLIERE" when
  there are none; labels you already had keep your own sorting and are
  listed. The new ANNULLA_etichettaturaCompleta empties every active rule's
  label as 1.4.6 did, for mailboxes organised with 1.4.1–1.4.6, same-named
  labels made by hand included.
- EXTRA_codiceStato counts only the tool's own labels and says so in the code,
  with the script version: with no group, only a 1.5.0 script that counted
  its own labels makes Campanella say "Gia' fatto". A badly pasted code no
  longer crashes Home or Settings, and "Gia' fatto" from the guided
  installation needs every mandatory step and names the missing one.
- ANNULLA_automazione also stops a pending resume of the Orari sending,
  ORARI_2_invia and ORARI_3_inviaOrariClassi, and first waits for other runs
  of the script to finish, so a sending in progress can no longer schedule
  its resume again right after.
- EXTRA_elencaIndirizziScuola puts the address list only in the email to
  yourself; the execution log gets it only if that email fails. Addresses
  imported from it without a role arrive unchecked, and the new "Togli le
  righe senza spunta" removes the unchecked rows, for example pupils found in
  the mailbox.
- The staff grid can no longer be sorted by clicking the column headers:
  after sorting, editing a row changed another person's entry, and removing
  rows removed the wrong ones.
- When Google gives the mail script an empty active user, it now takes your
  address from the account running it, so the summary and the address list
  still reach you by email and your own address stays out of that list.
- "Scrivere a un gruppo" never puts colleagues' addresses in the Gmail link:
  they go through the clipboard, to paste into Bcc. The configuration, the
  timetable data, group addresses and Privacy texts are kept out of Windows
  clipboard history and cloud sync.
- The console function downloads `personale_spaggiari.csv` only when the
  clipboard fails; the Chrome extension works only on ClasseViva pages.
- Native Gmail filters honour a rule's recipients and attachment condition;
  a subject word in parentheses, such as "(urgente)", is no longer dropped;
  internal functions no longer clutter the Run menu.

**Orari**

- Google asks for the Calendar permission for the whole project as soon as
  Orari.gs is in it: the page says so, and the calendar step asks for your
  own name.
- ORARI_4_calendario refuses to run again over the series it already
  created, instead of doubling every lesson: run ORARI_ANNULLA_calendario
  first.
- ORARI_3_inviaOrariClassi saves its progress and resumes like ORARI_2_invia;
  a resume that finds the lock busy reschedules itself, and a leftover one no
  longer restarts from scratch. When the daily quota runs out, run it again
  the next day and it goes on from where it stopped.
- Sent emails get the "Orari" label ("<group>/Orari" with a Posta group), if
  it exists.
- Timetables that do not start on Monday keep every lesson on the right day,
  also after a restart; CSV files in ANSI or UTF-16 keep their accents;
  `.xlsx` cells without a reference are read and references beyond Excel's
  limits are ignored. A file whose cells would fill more than 5 million
  slots (a few KB with cells scattered as far as column XFD) is refused with
  "Il foglio e' troppo grande..." instead of taking hundreds of MB. Subject
  and room are no longer stored.
- A timetable saved by 1.4.x lacks the list of its days, so one from a table
  that did not start on Monday may stay one day off: Orari asks you to
  reload the timetable file, and once is enough.
- A crafted timetable header containing `*/` can no longer inject code into
  DatiOrari.gs.

**Cartelle and Google Forms**

- Classes are split only on new lines: "1A: Maths; Physics" no longer
  creates a class "Physics", and a line with several classes ("3C; 3D") is
  reported instead of becoming a folder. If you listed several classes on
  one line with ";", put one per line: a subject that looks like a class, as
  in "1A: Maths; 2B", is reported too.
- "Genera la struttura" runs in the background with live progress; closing
  the window stops it after the file being copied. The summary separates
  what was created now from what was already there, and a "DUPLICA IN GOOGLE
  DOCS" note you edited is no longer overwritten.
- Errors in `struttura.json` are reported instead of falling back to the
  default folders, and entries that would leave "A.S. <year>" are skipped;
  class, subject and extra-folder names get the same checks. Clear messages
  replace the .NET error window.
- Forms scripts: old responses are removed only if every single one is
  found, by its timestamp, in an earlier year's sheet. A failed year-end
  closing keeps the form linked and retries every hour; closings wait for a
  running preparation; 29/02 is refused as a closing day.
- Script inside the form: re-running "Prepara l'anno nuovo" mid-year no
  longer reopens a form closed by hand, nor relinks one already closed or
  unlinked by hand. The optional manifest step now comes before the first
  run: without the manifest Google gives the script permission on all the
  account's forms, with it only on that form.
- Control sheet: failed rows keep their closing and retry without piling up
  triggers; "Prepara l'anno nuovo" stops safely before Google's time limit
  and resumes from the rows left; a closing that fires a few minutes before
  midnight still closes the form; the sheets of each year now sit in their
  own script property and only the current year's marks are kept, so the
  memory no longer grows year after year toward Google's 9 KB limit per
  property. The help bubble no longer says the sheet updates by itself.

**Privacy and updates**

- "Cerca aggiornamenti" also tells you when a newer Campanella is out, with a
  button to the releases page. Nothing is downloaded, and nothing goes on
  the internet without a click; opening Settings only asks rizzo-pii, on
  this computer, whether it is running.
- The rizzo-pii address must be on this computer (localhost, 127.0.0.0/8 or
  ::1): any other is refused before anything is sent, with no proxy and no
  redirects.
- The rizzo-pii installer is checked against the size and, when GitHub
  publishes it, the SHA-256; a bad or stopped download is deleted and never
  launched, and "Ferma lo scarico" stops it. TLS 1.2 only.
- A rizzo-pii answer without the anonymised text is an error, not an empty
  clean copy; a clean copy never overwrites its original; one list of formats
  (PDF, TXT, MD, CSV, HTM, HTML) everywhere; Settings and Privacy no longer
  freeze while waiting for rizzo-pii, and Settings shows the rizzo-pii
  version Campanella is tested with (2.0.0).

**Installers**

- `Installa-Campanella.exe` (Inno Setup, the one published here) no longer
  records a consent nobody gave in silent installs, installs for the current
  user only, and requires Windows 10 or 11, like the application manifest.
  Installed over an old C# installation in the same folder, it removes the
  old C# uninstaller and its entry in "Installed apps": before 1.5.0 that
  uninstaller also deleted the program, so do not use it while Campanella
  shares the folder.
- The C# installer, built only locally by `build.ps1`: its uninstaller
  removes only the files it installed, keeps `struttura.json` with the
  settings unless you ask, never touches other files and refuses a folder
  that is not a Campanella installation. When the Inno installation lives in
  the same folder, it removes only its own uninstaller and entry. A failed
  rizzo-pii download no longer marks the installation as failed.
- Removing the settings on uninstall also removes `campanella.json.tmp`.

**The application**

- An unexpected error shows a short Italian message saying whether you can
  carry on, instead of the .NET dialog with a stack trace.
- Closing during folder creation, file cleaning or the rizzo-pii download
  asks first; a stopped download leaves no half installer in %TEMP%.
- Text and CSV files saved in ANSI keep their accents in "Apri un file..."
  and in the Privacy cleaning; "Salva su file..." and "Esporta CSV" say when
  a file could not be saved.
- Settings > "Rileggile" shows the terms read-only; buttons that jump between
  tools target the page, not its place in the menu; "Elimina regola" is
  really red, and changing theme from Settings repaints the side menu.

**For developers**

- New workflow "Prove" on every push and pull request: build with the C#
  installer, every test through `test\tutte.ps1`, Inno Setup compile. The
  release checks consent and versions first, stops on any failed test and
  requires Inno Setup 6. Actions are pinned by commit SHA, with monthly
  Dependabot updates.
- New tests: `tutte.ps1`, `prova_versioni.ps1`, `prova_stato.ps1`,
  `prova_guscio.ps1`, `prova_disinstallazione.ps1`, `prova_posta.ps1`,
  `prova_cartelle.ps1`, `prova_xlsx.ps1`, `prova_gemelli.js`,
  `mutazioni_pannello.js`, `nomi_funzioni.js`, `invarianti_script.js`.
  `prova_installer.ps1` refuses to run where Campanella is installed, and
  `prova_disposizione.ps1` works on temporary folders.
- `build.ps1 -Pubblica` requires `-Produzione` (no default folder); the
  executable is signed before going into the C# installer, and a failed
  signature stops the build. `strumenti\firma.ps1` creates non-exportable
  keys and explains what it installs among the trusted certificates.
- New source files: `GeneratorePosta.cs`, `GeneratoreAnno.cs`, `Testo.cs`,
  `PaginaHome.cs`, `PaginaImpostazioni.cs`.

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
