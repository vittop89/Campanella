# Changelog

## 1.6.0 — (data da definire)

**If you put your timetable on Google Calendar with Campanella 1.5 or
earlier, from 26 October its lessons appear one hour early**: that calendar
was created in UTC. Paste Orari.gs again, run ORARI_1_anteprima and follow
what it says (ORARI_ANNULLA_calendario, then ORARI_4_calendario; lessons
moved or cancelled by hand have to be redone). Changing the calendar's time
zone in Google Calendar's settings is not enough: the lessons already there
keep the old one. Campanella says so once at start-up to whoever chose a
teacher or a calendar name in step 4 of Orari.

Scripts to paste again: Orari.gs and Organizzazione_Gmail.gs; copy
DatiOrari.gs and Configurazione.gs again. With the new class labels, also
paste the Classe_*.gs file of each class, copied from "Le mie classi...".

**Orari: school holidays and timetable changes on Google Calendar**

- Step 4 has "Giorni senza lezione": one line per day or period
  (`01/11/2026 Tutti i Santi`, `23/12/2026-06/01/2027 Vacanze di Natale`,
  `dal 23/12/2026 al 06/01/2027`, `2026-11-01`, two-digit years, and also
  without the year, `01/11` or `23/12-06/01`: the year comes from the school
  year of the period, September to December the first one, January on the
  second, or from the other date of the line, as in `23/12-06/01/2027`).
  The month may be written once: `23-31/12/2026`, `dal 23 al 31/12/2026`,
  `7 e 8/12/2026` ("e" for two consecutive days) and, in words,
  `7-8 dicembre 2026`, `dal 23 al 31 dicembre`, `8 dicembre 2026`. A period
  may end with a full stop, as in circulars, and "fino al" works too. Empty
  lines and lines starting with # do not count; a line Campanella does not
  understand (an impossible date, the end before the start, two dates
  written another way, as in `07/12/2026, 08/12/2026`, `2026-11-01-03` or,
  with the date written with dots, `7.12 ponte, 8.12 Immacolata`, the end
  written right after the date in words or as a day only, as in
  `dal 23/12/2026 al 6 gennaio 2027` or `01/11/2026 - 03`, "dal" with one
  date only, as in `dal 23/12/2026 all'Epifania`, two days far apart
  joined by "e", digits of other scripts) is left out of DatiOrari.gs:
  never taken as its first day only. A day in words within the dates of the
  line, as in `25/04/2027 - 25 aprile`, is just part of the name. A number
  in the name that could be a day outside the line's dates
  (`07/12/2026 ponte 7-8`, `fino al giorno 8`, `8.12`), and in a one-day
  line the end of a period in words (`fino all'Epifania`, `sino al
  lunedi'`) or a length that does not match the dates (`di 2 giorni`,
  `(15 giorni)`, `2gg`, also in words, `di due giorni`, or two weekdays,
  `carnevale lunedi' e martedi'`), and a one-day line that names the edge
  of a period or a school day (`23/12/2026 Vacanze natalizie`,
  `06/01/2027 fine vacanze`, `14/09/2026 Inizio delle lezioni`,
  `07/01/2027 Ripresa delle lezioni`, `07/04/2027 Rientro dalle vacanze
  pasquali`), do not reject the line: it is taken as written, with a
  warning to check it. Under the box,
  a read-only list updated while typing shows how every line was read,
  with the weekdays (`riga 3: dal lun 07/12/2026 al lun 07/12/2026 (1
  giorno) ponte 7-8   <- ...`, `riga 4: non capita: ...`), scrolled to the
  line being written; lines not understood, with a warning or outside the
  period are in amber, and the summary counts them.
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
  function ORARI_5_cambioOrario: from that date the calendar has the new
  timetable, and the weeks before stay as they were, lessons moved or
  cancelled by hand included. Google does not let a series be shortened
  (setRecurrence, tried live on a UTC and on a Europe/Rome calendar, with
  the end at 23:59:59 of the day before or at midnight, changes nothing), so
  a series already on the calendar with lessons both before and after the
  date is done again up to the day before: a new series with the same
  title, description and location, from its first regular lesson (the most
  frequent day, time and length, the series' title, and the description and
  location most frequent among its lessons, so that a different format
  between series and lessons does not turn every lesson into a single
  event) every week until the day before at 23:59:59; from it the lessons of
  the weeks where the old series had no regular lesson (cancelled, moved,
  renamed or annotated by hand) are removed (deleteEvent on one lesson of a
  series removes only that one, tried live); every lesson moved by hand, or
  with its title, description or location changed for it alone ("Solo
  questo evento", as a note "VERIFICA cap. 3-4"), before the date comes
  back as a single event at its own time, with its own title, description
  and location; only then the old series is removed. Series with no lesson
  before the date are removed, and so are the
  single events with the mark from that date on; then the new timetable goes
  on from that date. The series and events done again carry the mark and a
  second one, campanella_sostituisce, with the id of the old series and the
  day before: a job stopped halfway (time, Google's limits) or run again
  finds what it already did, does not do it twice and ends with the same
  calendar, and what was done for another date (a change started over with
  another DatiOrari.gs) is removed before its old series. The id of a piece
  just created goes in the saved point before its marks, so a resume after a
  refused mark puts them back instead of creating the piece again (and a
  change started over puts them back before forgetting the job): the piece
  is found by that id among all the events at the time of its first lesson,
  also when its description, copied from a series or a lesson rewritten by
  hand, does not start with [Campanella] (before, it was not found, was
  created again and stayed without marks: lessons twice, and a series that
  not even ORARI_ANNULLA_calendario removed); if it is no longer there
  (moved or deleted by hand before the resume), the final message gives its
  date and says to delete the lesson if it appears twice.
  ORARI_ANNULLA_calendario, run instead of waiting for the resume, reads the
  saved point before forgetting it and puts the marks back on that piece the
  same way before looking for Campanella's events, so it goes with the rest
  (before, it stayed, and a new ORARI_4_calendario showed its lessons twice);
  if it cannot find it, its message gives the date and time and says to
  delete it by hand. A date
  before the start of the period counts as the start: earlier school years
  in the same calendar (the default name "Orario COGNOME" is the same every
  year) are not touched, and preview and message say that the new timetable
  holds for the whole period. The first lesson of a series, for the messages
  and to recognise a series just put, is the first with its most frequent
  day, time and length, as many weeks earlier as there are lessons moved by
  hand before it (counted, not measured) or moved past the next week; a
  lesson moved before the first regular one with a week missing in between
  (the first lesson moved by one to three days and the second cancelled)
  stays in the week it falls in, when Campanella could have put a lesson
  there (from the start of the period, not on a day off). The description of
  every series says the day of its first lesson (`serie dal 2026-10-12`): a
  series never starts before it. With two shapes equally frequent (only in
  very short series) the weekday written in the description, where
  Campanella put the series, decides, then the earliest lesson. Only events
  with the mark are done again or removed; a series or a single lesson
  recognised only by the description (a copy made by hand) is left and
  named. The final message says how many series were done again up to the
  day before, removed and created, how many single events were removed,
  which lessons moved, renamed, annotated or coloured by hand came back as
  single events, how
  many lessons were skipped, and that other changes made by hand to an old
  series (a reminder) do not pass to the new one (its colour does: see
  below). When
  DatiOrari.gs changes halfway to a later date, the error says that the old
  lessons between the two dates of the series already done again or removed
  do not come back, and how to have them (ORARI_ANNULLA_calendario,
  ORARI_4_calendario with the previous DatiOrari.gs, then
  ORARI_5_cambioOrario). It also serves for a day off added after the
  timetable was put on the calendar.
  The period ("Dal" and "al") stays as it was: the change date goes only in
  the tick. With the box unticked there is no change date. Before, the only
  way was ORARI_ANNULLA_calendario and ORARI_4_calendario again, which also
  rewrote the past weeks.
- The calendar is one of the teacher's own, with exactly that name
  (getOwnedCalendarsByName and an exact match: not a colleague's calendar
  the teacher is subscribed to, not one differing in case); with two of them
  the functions stop without touching anything.
- The calendar is created with the script's time zone. Up to 1.5.3
  ORARI_4_calendario created it without one, Google gave it UTC, and a
  weekly series repeats at the same time of the calendar's zone: from 26
  October, when summer time ends, every lesson appeared one hour early
  (08:00 became 07:00), until the end of March. ORARI_4_calendario and
  ORARI_5_cambioOrario now check the zone of the calendar they find before
  putting, changing or removing lessons: with no lessons by Campanella in
  the period they give it the script's zone (the final message says so);
  with lessons already there they stop without touching anything and say
  how to fix it: ORARI_ANNULLA_calendario, then ORARI_4_calendario, which
  sets the zone and puts the timetable back (lessons moved, cancelled or
  edited by hand are lost and have to be redone; if the timetable already
  changed during the year, first ORARI_4_calendario with the previous
  DatiOrari.gs, then ORARI_5_cambioOrario with the new one).
  Nobody has tried live whether series created after setTimeZone repeat in
  the new zone, and that remedy relies on it: after setTimeZone the calendar
  is taken again from Google and must say the script's zone, and in every
  job the first series that crosses a change of the clock is read back and
  must have all its lessons at the same time in the script's zone.
  Otherwise the function stops, says which lesson is at the wrong time and
  gives the remedy tried live (ORARI_ANNULLA_calendario, the calendar
  renamed in Google Calendar, then ORARI_4_calendario, which creates a new
  one with the zone), and stays stopped, run again or resumed, until
  ORARI_ANNULLA_calendario forgets the job. The final message says when
  the zone was checked. At start-up Campanella says once, to whoever chose
  a teacher or a calendar name in step 4, that a calendar put with 1.5 or
  earlier shows the lessons one hour early from 26 October, and how to fix
  it (remembered in campanella.json, `avvisoFusoCalendario`; not decided
  while the data file cannot be read).
  ORARI_1_anteprima prints the script's time zone, warns when it is not
  Europe/Rome (Project settings -> Time zone), and says when the calendar
  has another zone and whether it already holds lessons. A 1.5 calendar
  whose zone the teacher changed by hand in Google Calendar's settings says
  the script's zone, but its series keep repeating at the same UTC time:
  when Campanella's series in the period that cross a change of the clock
  have, after it, their lessons at the same UTC time and at another time in
  the script's zone (the most frequent time counts, so one lesson moved by
  hand does not decide), ORARI_1_anteprima says the calendar needs fixing,
  with one lesson as an example, and ORARI_4_calendario and
  ORARI_5_cambioOrario stop without touching anything, with the same
  remedy (before, the preview said nothing and ORARI_5_cambioOrario went
  through, leaving those lessons one hour early). These messages and the
  start-up warning say that changing the zone in Google Calendar's settings
  is not enough. Moved lessons are
  recognised by day and time in the calendar's zone, so in a UTC calendar
  the lessons after 25 October do not look moved.
- ORARI_4_calendario and ORARI_5_cambioOrario resume by themselves, like the
  sending: when an execution runs out of time, or Google says there were too
  many calendar changes in a short time ("Service invoked too many times",
  "You have been creating or deleting too many calendars or calendar
  events", rate limit, also in Italian), they save where they are, with a
  fingerprint of the plan, and schedule themselves again a minute later. When
  the day's quota is over, or Google keeps refusing after ten resumes in a
  row, they stop and ask to be run again later; any other error keeps the
  saved point and shows. A resume removes its own trigger as soon as it
  starts (a fired trigger stays among the project's): after an error it is
  not counted as a scheduled resume, and the other calendar function says
  to run the job again instead of promising it resumes by itself. A resume
  that finds a different DatiOrari.gs stops
  and explains instead of mixing two timetables: for ORARI_4_calendario the
  saved point stays, and the message says to finish with the previous
  DatiOrari.gs and then, with a change date, to run ORARI_5_cambioOrario
  (removing everything and starting again would give the new timetable to
  the weeks before too). A resume with nothing to do removes its trigger
  and says so, and one that finds its job stopped by ANNULLA_automazione
  does not work nor reschedule itself. There is a short pause between series;
  the description goes in the options of createEventSeries and the mark right
  after, and a series whose mark fails counts as done (its description still
  identifies it), so a resume never creates it twice. The saved point
  remembers it, and the resume, before creating other series, puts the mark
  back on it: found among Campanella's events in the dates of its stretch by
  title, description and first lesson, and only when exactly one matches
  (two equal series mean a copy made by hand, and none is picked). Without
  the mark a later timetable change would neither redo nor remove it, and
  its lessons would appear twice. When the mark cannot be put back, the final
  message names the series and says how to fix it (ORARI_ANNULLA_calendario
  and ORARI_4_calendario again; after ORARI_5_cambioOrario, delete it by hand
  and run the change again); a change started over because DatiOrari.gs
  changed says to delete it before running again.
  `test/invarianti_script.js` allows this one more setTag, on the series found
  that way, after its guard, with a fingerprint of the functions that
  recognise it; it also wants the `continue` closing the guard of the cut to
  be a statement of its own (not inside an if or a while, after an else or a
  label).
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
  understood, with full dates) and `validoDal`, and the header says that
  besides surnames, classes and hours the file holds the days without
  lessons, with the name the teacher wrote. The days without lessons
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
  does not pick it up again; run by hand, the function goes on. The other
  calendar function, run by hand meanwhile, says that the job will not
  resume by itself and has to be run again (as after the day's quota or too
  many refusals from Google), instead of promising a resume. The other Posta
  functions that find the lock busy (the label colours, EXTRA_togliFiltri,
  ANNULLA_etichettatura, ANNULLA_progressoRiordino) no longer blame only the
  reordering: they say it may also be a timetable sending or the calendar.
- The guide of step 4 no longer says "if you have not done it yet" about the
  timetable code: it says to run ORARI_1_anteprima and paste the code again
  when it does not print "Orari.gs versione" and the version of the code in
  this Campanella. An older Orari.gs ignores the days without lessons (they
  would end up on the calendar as school days) and has no
  ORARI_5_cambioOrario. The instructions say the same, and "Le mie classi"
  (its note and the status line after "Usa queste classi") says that the
  classes want the mail script of this version: an older one, reading the
  new Configurazione.gs, would look for the class in the subject and among
  the senders together, and label nothing.

**Orari: a colour for each class on the calendar**

- Every lesson on the calendar takes the colour of its class (2B one
  colour, 3B another), in the same calendar: the eleven event colours of
  Google Calendar (CalendarApp.EventColor, "1" to "11"), with the names of
  its Italian interface (Pomodoro, Mirtillo, Basilico...). Step 4 has
  "Colori delle classi..." with a "?": next to it, the classes of the
  teacher's timetable with a small square of their colour (those that do
  not fit become "e altre N"); the button opens a small window with a row
  per class, the square and a drop-down list of the eleven colours (each
  with its square) plus "colore del calendario". Out of the box every class
  of the teacher gets a different colour, in a fixed order meant to keep
  neighbours apart (Pomodoro, Mirtillo, Basilico, Mandarino, Vinaccia,
  Pavone, Banana, Fenicottero, Salvia, Lavanda), the hours "a
  disposizione" Grafite, and keeps it from when DatiOrari.gs is copied or
  saved (step 3 or 4): a class added later (a new timetable) takes a colour
  no other class has, and the others do not change. The summary, the
  preview and the teacher's name being typed (found by prefix, "R" may be
  another teacher) do not change the settings. When DatiOrari.gs is copied
  or saved Campanella also remembers its colours, those of the lessons on
  the calendar (`calColoriScritti`): between two classes with the same
  default colour the one already on the calendar keeps it, so a class
  coming back with a colour left over (from another school year) takes a
  free one instead of taking it from a class with lessons on the calendar;
  a class that is no longer in the copied file keeps its colour, but no
  longer as chosen by hand. A colour chosen by hand stays, "colore del
  calendario" included; chosen equal to another class's default colour,
  that class takes a free one at once, and the window shows it before "Usa
  questi colori" (to have both the same, choose it for that class too).
  "Colori di partenza" goes back to the default ones. When the classes are
  more than the colours, the extra ones take the least used. The colours
  are in the settings (`calColori`, `calColoriAMano`, `calColoriScritti`:
  class names and numbers only, not personal data), and a value written by
  hand that Google Calendar does not have is not read.
- DatiOrari.gs: the `calendario` block has `colori`, `{ "2B": "11", ... }`,
  only the classes with a colour. ORARI_4_calendario and ORARI_5_cambioOrario
  give each series they create the colour of its class (setColor), right
  after creating it and before the mark, so that a resume that puts the
  mark back finds the colour already there. In the change, the series done
  again take the colour of their class, or, when DatiOrari.gs has none for
  it (a class no longer in the timetable, or without colour), the one the
  old series had; a lesson coloured by hand on its own (a colour different
  from the others of its series) comes back as a single event with its
  colour, like the moved ones, which take the colour of the series. Every
  single event put back also has its class (the title of the old series,
  tag `campanella_classe`) and, when it got the colour chosen by hand, the
  mark `campanella_colore`. A colour
  Google does not set does not stop the job: it is counted, and the final
  message names the series and says to run ORARI_6_coloraLezioni.
- The colours are not part of the fingerprint of the plan used by the
  resume: they do not change which lessons are on the calendar, and a
  DatiOrari.gs generated again halfway with other colours must not stop a
  resume. The series still to be put take the new colours, and the final
  message says the colours changed halfway and to run ORARI_6_coloraLezioni
  to give them to all the lessons.
- New function ORARI_6_coloraLezioni: gives the lessons already on the
  calendar the colours of DatiOrari.gs without doing them again or moving
  them, only those with Campanella's mark in the period (a copy made by
  hand, an event of someone else and last year's series are left, and the
  message counts the copies). A lesson that already has the right colour is
  not touched; the classes without a colour are left as they are, and the
  message names those that still have a colour given before, saying to
  change it in Google Calendar. A single event put back by the change takes
  the colour of the class in its tag, so a lesson renamed by hand ("2B
  VERIFICA") gets the colour of the 2B and is not a class without colour;
  one put back with the colour chosen by hand keeps it, like the same
  lesson inside its series, and the message names it. With the job of
  ORARI_4_calendario or ORARI_5_cambioOrario halfway it colours nothing
  (also in a resume of its own) and says how to finish that first, as
  those two do with each other: colouring the old series of a change
  halfway made the lesson coloured by hand, already put back as a single
  event, lose its colour, or, if Google gives the colour of a series also
  to the lessons coloured on their own (not tried live), disappear when the
  change resumed. It takes the same lock as the other
  functions, remembers what it already coloured (a fingerprint of the id)
  and resumes by itself a minute later when time runs out or Google asks to
  slow down (its trigger is `var _ORARI_TRIGGER_COLORI`); the day's quota
  or too many refusals stop it until it is run again, and with other colours
  in DatiOrari.gs it starts over. ANNULLA_automazione of the mail script
  removes its resume, names it and marks its job as stopped (a resume
  already started does not pick it up again); ORARI_ANNULLA_calendario
  forgets it too. ORARI_1_anteprima says the colour of every class, names
  the values that are not Google Calendar colours, and says that
  ORARI_6_coloraLezioni gives them to the lessons already there; the final
  messages of ORARI_4_calendario and ORARI_5_cambioOrario say the colours.
- The guide of step 4, the instructions and the technical note say how the
  colours work and when to run ORARI_6_coloraLezioni.

**Orari: the timetable on the Google Calendar of another account**

- Step 4 asks "Dove metti l'orario": in the school account, in the same
  project as the mail script (the default, as before), or in another Google
  account, for example the personal one, for whoever always uses that
  calendar. The choice is in the settings (`calAltroAccount`, not personal
  data).
- With another account the menu of the step gives "Codice solo calendario
  (Calendario.gs)", "Dati del tuo orario (DatiOrari.gs, solo il tuo)" and a
  step-by-step guide for that account: open script.google.com with that
  account, a new project, Project settings -> time zone of Rome, the two
  files, run ORARI_4_calendario and authorise it (Calendar and triggers
  only). The timetable emails, if wanted, stay in the school project, where
  ORARI_4_calendario is not to be run; when the timetable changes, the data
  go into both projects again.
- Calendario.gs is made by the app from Orari.gs (SoloCalendario.cs). The
  parts that only serve the emails (ORARI_2_invia, ORARI_3_inviaOrariClassi,
  ORARI_ANNULLA_invio, building the messages, the label of the sent ones,
  the teacher's address with Session.getActiveUser, MailApp, GmailApp) are
  marked in Orari.gs by comments on their own lines, `// [SOLO EMAIL]` and
  `// [FINE SOLO EMAIL]`, and left out; the lines between
  `// [SOLO CALENDARIO.GS]` and `// [FINE SOLO CALENDARIO.GS]`, comments in
  Orari.gs, become code there (the preview's "Calendario.gs versione 1.6.0",
  and "il calendario" as the only other job that can hold the lock). Its own
  header (src/risorse/Calendario_intestazione.txt) says what it does, for
  which account and which permissions Google asks. The calendar functions
  keep their names (ORARI_1_anteprima, ORARI_4_calendario,
  ORARI_5_cambioOrario, ORARI_6_coloraLezioni, ORARI_7_colloqui,
  ORARI_ANNULLA_calendario), so the instructions hold for both. The app gives no Calendario.gs with a
  marker left open, or naming, even in a comment, MailApp, GmailApp, Gmail,
  sendEmail, getActiveUser, getEffectiveUser, UrlFetchApp, DriveApp,
  DocumentApp, SpreadsheetApp or FormApp: Google would ask for that
  permission in the other account.
- ORARI_1_anteprima has a calendar part that uses neither MailApp nor the
  address, and says so when DatiOrari.gs has no calendar block. The
  messages about another job holding the lock name the jobs of the script
  they are in.
- The DatiOrari.gs for the other account has only the teacher chosen in step
  4: their row of the timetable, the days, the hours and the calendar block
  (days without lessons, change date, colours). No other teacher, no class
  timetables, no email subjects or note, no title of the timetable; its
  header says so. The variable is still ORARI. Copied or saved, its class
  colours stay in the settings, as with DatiOrari.gs.
- The instructions, the technical note for principal and DPO (only the
  teacher's own timetable, classes and hours end up in the other account,
  nothing about colleagues; the permissions asked there; how to switch it
  off) and PRIVACY.md say so.

**Orari: parents' meetings (colloqui) on the calendar, with the Meet link**

- Step 4 has "Colloqui con le famiglie", under the days without lessons: a
  box with one line per entry, and the teacher's weekly meeting hour, the
  days of the general meetings and the periods without meetings go on the
  calendar with the timetable. `ogni giovedi 10:10-11:10 Ricevimento
  https://meet.google.com/...` is a weekly meeting for the whole period, or
  between its own dates with `dal 12/10/2026 al 22/05/2027` in front (also
  `tutti i giovedi`, or the name in front); `15/12/2026 15:00-18:00 Colloqui
  generali https://meet.google.com/...` is one day (also `dalle 15 alle 18`,
  `15-18`, `ore 15-18`, the weekday before or after the date, the date in
  words or without the year); `niente colloqui dal 14/12/2026 al
  09/01/2027` (or `colloqui sospesi dal ... al ...`, `niente colloqui il
  20/05/2027`) is a period without meetings. The link is the first https://
  address of the line, and becomes the location of the event; the rest is
  the name (by default Ricevimento, or Colloqui for a day). Dates are read
  by the same reader as the days without lessons (Calendario.cs), not by a
  second one.
- "Importa da un file..." reads a .csv or .xlsx (Xlsx.cs) and adds its
  lines at the end of the box, which stays the only source: the columns are
  found from the header, `data` or `giorno` (a date or a weekday), `dalle`
  and `alle` (or `inizio` and `fine`), `cosa` or `descrizione`, `link`;
  dates and times saved by Excel as numbers work; rows with neither a date
  nor a weekday are skipped, and the status bar says how many.
- Under the box, the same read-only list as the days without lessons: how
  every line was read (`riga 1: ogni giovedi' 10:10-11:10, Ricevimento, per
  tutto il periodo, con il link del Meet`, `riga 2: non capita: ...`).
  In amber the doubtful lines: without a time, with only the start, or with
  the end before the start (kept in the box, but not put on the calendar),
  on a weekday that is not in the timetable, with a weekday that does not
  match the date, outside the period, or with a link that is not Google
  Meet (a warning, not an error: it goes on the calendar), and the lines not
  understood. The summary counts the meetings (weekly ones, their series,
  meetings and days) and the lines to check.
- ORARI_4_calendario puts them after the lessons: the weekly meeting like
  the lessons, one series per stretch of weeks, skipping the days without
  lessons and the periods without meetings; the days as single events, also
  inside a period without meetings (general meetings usually fall right
  there). Title is the name, location the link, the description starts with
  "[Campanella] Colloqui" and gives the link; the mark is Campanella's, with
  its own value (`colloquio`), and the colour is the meetings' own.
  ORARI_1_anteprima says how many meetings will go on the calendar;
  ORARI_5_cambioOrario treats them like the lessons (done again up to the
  day before, then those of DatiOrari.gs from the date);
  ORARI_6_coloraLezioni gives them the meetings' colour;
  ORARI_ANNULLA_calendario removes them with the lessons.
- New function ORARI_7_colloqui, in Orari.gs and Calendario.gs: when only
  the meetings change it updates them from today on, without touching the
  lessons, by the same technique as the timetable change (today as the
  date): the weekly meetings with sessions before today are done again up
  to yesterday, sessions moved or changed by hand before today come back as
  they are, then the meetings of DatiOrari.gs from today. Only events with
  the mark are touched. It takes the lock, resumes by itself (the day is the
  one it started on, also after midnight), stops with DatiOrari.gs changed
  halfway, and the other calendar functions wait for it; ANNULLA_automazione
  of the mail script removes its resume and names it.
- The resume fingerprint of the plan includes the meetings (without
  meetings it is the one of before, so a job left halfway by an earlier
  version still finishes).
- "Colori delle classi..." has a "Colloqui" row after the classes, when
  there are meetings: by default a colour the classes do not use.
- DatiOrari.gs (also the one for the other account) has in the calendar
  block `colloqui` (weekly ones with weekday, times, their dates if any,
  name and link; single days; periods without meetings; dates yyyy-mm-dd,
  times hh:mm; only the lines that go on the calendar) and
  `coloreColloqui`; its header says the Meet links open the teacher's
  rooms. The text of the box follows the personal data (`calColloqui`, next
  to the days without lessons), since the links are access links.
- Parents' bookings are not handled: they stay in the electronic register
  (ClasseViva); the calendar only has when and where. The instructions, the
  guide of step 4, the headers of Orari.gs and Calendario.gs, the technical
  note for principal and DPO and PRIVACY.md say so.

**Posta: a label for each of your classes**

- Step 4 has "Le mie classi...": one rule per class, with a label such as
  "Classi 2026-27/3B" under a parent label ("Classi" and the school year,
  editable; reopening the window finds the parent of your class rules
  again, unless it names another year). A message gets it if either holds:
  the class is in the subject,
  whoever sent it (management's "Consiglio di classe 3B", colleagues,
  Classroom notifications like "3B Matematica: ...", families), or the
  sender is a student of that class. Class labels add to the others:
  Studenti, Colleghi and the rest stay.
- The classes come from the timetable (your lessons, without the "a
  disposizione" hours; a lesson for 3A/3B, 5AINF/5BINF or 5Ainf/5Binf is
  two classes, a cell such as "3B 2 gruppi", "4A 2gr", "4A 2GR" or "4AS
  2gr" stays one: every piece needs a section shaped like the first one, as
  long and with the same letters after the first, case aside, as in
  3AS-3bs): Orari, the timetable file and your
  name in step 4) and from the classes written in Cartelle; others are
  added by hand.
  3B, 3 B and 3^B are the same class; 3B LSA and 3B ITE are other classes,
  and when two share number and section the window says so. A slash never
  gets into a label name.
  "Cerca nell'oggetto" starts from 3B, "3 B" and III B (Gmail searches whole
  words; 3B LSA gets the same ones). When the section is also an Italian
  word (A, E, I, O, AL...) it starts from 3A, "classe 3 A" and "classe III
  A", since "3 A" alone would match "da 1 a 10"; a code that is not number
  and section, such as A5, starts unticked and with no words. The words can
  be edited, comma separated (quoted if they contain a comma); addresses
  pasted there are dropped, with a warning. A text with an @ written in
  "Aggiungi una classe" (the To line of Classroom pasted in the wrong box)
  adds no class and the button says where addresses go; in the parent label
  the whole text goes and the starting parent comes back; a class with an @
  in Cartelle is not a class, and "Usa queste classi" never makes a rule of
  such a name: students' names and addresses never reach a rule, the data
  file, Configurazione.gs or a Gmail label. The preview counts a rule, not
  each word: what a word such as "3 B" matches (3^B too?) is checked by
  searching Gmail for subject:"3 B".
- Students' addresses are pasted (or dragged) in the window, for example
  from Classroom (course -> People -> tick above the students -> Actions ->
  Email: Gmail opens a message with every address in the To field, to copy;
  then delete that message with the bin, or it stays among the drafts) or
  from the class's Google group. The help says that a Ctrl+C in the browser
  goes into Windows' clipboard history (Win+V to remove it) and that
  dragging the text avoids the clipboard. Only email addresses are taken,
  also in the form Name Surname <address> and with an apostrophe
  (d'amico...), without what is stuck in front of them (a link's "?email=",
  "Rossi|" in a row with columns), lower case, once each; the staff's
  addresses (ticked in step 3, management, secretariat) are removed and
  counted by where they come from, and more than 40 trigger a warning
  ("sembra piu' di una classe").
  They are data of minors, and Campanella does not keep them anywhere: not
  in campanella.json, not in the data file, not in the rules, not in
  Configurazione.gs. The window copies (outside the clipboard history,
  never to a file) a separate script file, Classe_3B.gs, to paste into the
  Apps Script project next to Configurazione.gs: it holds the label of its
  rule, the day it was copied and the addresses. Once the window is closed
  the addresses are gone, and reopening it says so; if the copied file is
  still on the clipboard, closing the window offers to clear it (otherwise
  it stays there even after Campanella is closed). The rule holds only the
  placeholder @CLASSE:3B@. Without that file the rule still labels the
  messages with the class in the subject.
- "Usa queste classi" creates or updates one rule per ticked class (at the
  end of the list, in shades of one colour that no other rule uses, each
  class its own) and removes the rule of an unticked class, reminding you
  to delete its Classe_*.gs file. Changing the parent label in the window
  shows that parent's rules and keeps what you did (pasted addresses,
  changed ticks and words, classes added by hand); a file copied for
  another parent must be copied again. Closing with Annulla, Esc or the X
  asks first if a file was copied or something changed. In a new school
  year (also written 2026-2027) it offers, unticked, to remove last year's
  class rules, and reminds you to delete their Classe_*.gs files, except
  those named like one of this year's classes, which the new file replaces
  (after "Usa queste classi" it says which ones). With a
  parent label without the year (such as "Le mie classi") the rules stay
  the same the next year but the students do not: the window says that in
  a new school year the addresses must be pasted and the file copied again.
  Labels in Gmail are never deleted.
- The rule window ("Modifica") has "Basta uno dei due: l'oggetto oppure i
  mittenti", the option behind the class rules (unoQualsiasi in
  Configurazione.gs, written only when on: without classes the
  configuration and its fingerprint do not change); for a class rule it
  shows the placeholder instead of the senders.
- The script: a rule with unoQualsiasi and both senders and text searches
  the text from anyone and, separately, the senders in groups of 20 with any
  text; recipients, attachment, advanced search, excluded labels and period
  apply to all of them, and native Gmail filters follow (one for the text,
  one per group of senders). @CLASSE:3B@ becomes the students of
  Classe_3B.gs, only if the file was copied for that rule's label (last
  year's 3B file does not count for this year's 3B); none without the file.
  A class placeholder among the recipients (only a hand-written
  configuration puts it there) counts as a class of the rule too.
  Students never go into native Gmail filters, which would keep them in the
  account settings even after deleting the file: for a class the filter
  matches the subject only, the students' messages are labelled by the
  hourly sorting, and EXTRA_creaFiltriGmail says that PASSO_4 must stay on
  for them. PASSO_1_anteprima says how many addresses each class file has
  (never which ones) and when it was copied (warning if from a past school
  year), or that the file is missing or belongs to another label and what
  the rule still looks for meanwhile (the subject, the other senders or
  recipients; "finds nothing" only when it makes no search at all), and
  lists the class files no active rule uses. When last year's rules are
  kept, last year's 3B and this year's share the one Classe_3B.gs: the
  preview says which rule the file serves and how to switch off or remove
  the other, not to delete the file. The reorder summary (PASSO_3) and the
  hourly sorting's log also flag a class file from a past school year
  that a rule still uses (August already counts for the school year that
  starts: a file copied at the end of August is for September's classes).
  The classes window follows the same rule: without the year of Cartelle,
  from August on it starts from the parent of the school year that starts
  (Classi 2026-27 on 28 August), so the rules and files prepared at the end
  of August are found again in September instead of looking like last
  year's. A year of Cartelle left behind (written by hand in August, say
  2026-27, and still there a year later) does not count: the window starts
  from the parent of this year and offers to remove last year's rules.
  A conversation found by two
  searches of the same rule counts once in the trial reorder (even when it
  resumes halfway through a rule) and in the hourly sorting, even when
  Gmail's index lags. A rejected search is skipped in the trial reorder
  too; for a class rule neither the search nor Gmail's message is logged,
  only which search it was. The test bench runs every public function with
  class files loaded and Gmail rejecting searches and filters, and checks
  that no student address comes out.
- In "Filtri che hai gia' in Gmail..." class filters never start ticked. A
  filter with addresses whose label looks like a class (it ends with 3B,
  III B or 3B LSA, with at most a code after number and section, so not "5
  per mille" or "5A Praga", or with the section attached to the number in
  capitals, as technical schools write it, 5AINF, 3ACAT, 4BAFM, 4AINF LAB,
  or in mixed case, 5Ainf; also with words before or the school year after,
  as in "Classe 3B", "Inglese 3B", "3B 2025-26", but not a class followed by
  other words, "3B Inglese", like "5A Praga";
  or it sits under a parent with the word
  "classi" in it, not "Liceo Classico", under the parent of a class rule or
  under one used for classes before, remembered even after the rules are
  removed) cannot be ticked: the addresses might be students' and would
  reach the data file and Configurazione.gs. Such a filter chosen before
  (with 1.5.3, or before the classes were created under its parent) is
  dropped from the choice at start-up and by "Usa queste classi", never
  written to Configurazione.gs, and the window says so; the ones dropped at
  start-up are also shown in amber in step 4, under "Filtri che hai gia' in
  Gmail...", until the window is opened (the count is not saved). Remove it
  in Gmail. The window, step 4 and "Usa queste classi" also say to copy the
  configuration again and replace the one in the script project: the one
  pasted before may still have that filter, with the addresses (1.5.3 wrote
  all the criteria of the chosen filters).
- The same format 3 of the settings files (see Orari above) keeps 1.5.3 from
  overwriting them for the classes too: it would drop unoQualsiasi, and a
  class rule would silently want the subject AND the students. The data file
  also remembers the parent labels used for classes (names only).

**For developers**

- mock_orari.js runs in the Europe/Rome time zone, with daylight saving
  time, also in the CI in UTC (a weekly step in milliseconds would go
  unnoticed there). The fake Calendar does what Google does, as tried live
  on 25 September 2026: a calendar created without timeZone is in UTC, with
  it in that zone (getTimeZone, setTimeZone); a series repeats every week
  until `until`, in the zone the calendar had when it was created (in UTC at
  the same UTC time, so an hour earlier in Rome after 25 October);
  setRecurrence changes nothing (the calls are remembered, and the end of
  the tests checks there were none); deleteEvent on a lesson of a series
  removes only that one; single events have ids, marks and the description
  of their options. It also takes the options of createEventSeries, can
  throw Google's limits at the n-th call of an operation, has lessons moved
  or cancelled by hand, calendars one is only subscribed to, names matched
  regardless of case, and a non-null "series" for single events, as Google.
  Assumed, not tried live and said so in its comment: setTimeZone does not
  change the series already there; series created after it, in the same
  execution and with the same object, repeat in the new zone (the remedy
  for 1.5 calendars relies on it: the scripts check it, and the fake can
  also play setTimeZone without effect and new series in the zone the
  calendar was born with); setTime moves one lesson only. As in Google,
  getOwnedCalendarsByName returns a new object every time, reading the same
  calendar, and with setTimeZone without effect only the object it was
  called on says the new zone: a script that did not take the calendar
  again after setTimeZone would not pass. Title,
  description and location can be changed for one lesson alone, and a
  failure can hit setTag only on a series or only on a single event. New
  sections: the time zone (the calendar created in the script's zone, series
  across 25 October at the same time, a 1.5 calendar in UTC with the
  timetable, which makes both functions stop, the same calendar with its
  zone changed by hand after the series, which the preview reports and
  makes both functions stop too, an empty UTC calendar that
  takes the zone, the two cases where Google would not keep it and the
  remedy with a new calendar, the shape of lessons in the calendar's zone),
  days without
  lessons (an isolated holiday, a long break, a Monday block split by Easter
  Monday and a Wednesday one that is not, days outside the period), which
  calendar is used, resume for time and for Google's limits without
  duplicates, lock, changed DatiOrari.gs, timetable change (done again up to
  the day before with the second mark, removed, created, weeks before
  untouched, no old lesson after the date, same result when run again or
  resumed halfway, a refused mark on a series just done again, a date before
  the start with last year in the same calendar, a "Dal" moved forward,
  lessons moved or cancelled by hand, also by four days, before the start of
  the period, past the next week or two out of four, the first one moved by
  one to three days with the second cancelled, a lesson renamed by hand, a
  note or a location on one lesson, a description written differently for
  every lesson, a piece just done again whose marks are refused with a
  description rewritten by hand, also moved before the resume, or removed
  by ORARI_ANNULLA_calendario run instead of the resume, with the
  moved, renamed and annotated lessons back as single events and the week
  of a cancelled one removed from the new series, stopped by time after each of
  the first eight changes and by Google's limits at each of the first six
  calls of every operation and always ending with the same calendar,
  DatiOrari.gs changed halfway to a week later or earlier,
  ORARI_ANNULLA_calendario removing the single events too, a series and a
  single lesson copied by hand), undo of a job half done, undo stopped by
  time or by Google's limits, ANNULLA_automazione with a resume already
  started and the other calendar function run by hand, and a resume that
  ends with an error that is not one of Google's limits.
- invarianti_script.js checks the calendar by shape (CALENDARIO_ORARI): only
  four members of CalendarApp; every method that reads, creates, changes or
  removes events only in a few functions, on a receiver written exactly so,
  which in the functions that change or remove comes from an exact
  declaration and is never changed; setRecurrence never named (it changes
  nothing in Google), setTimeZone only in _orariSistemaFuso_, createEvent
  only in _orariLezioneRifatta_, a lesson of a series removed only in
  _orariTogliBuco_ (the new series found by id, with the mark, after its
  guard), and in the cut the marks go only to the series and the single
  events just created, or on resume (and in ORARI_ANNULLA_calendario,
  before removing it) to the piece found by the id the saved point took
  from it (appenaCreato, named only in its statements, like
  daContrassegnare; the only other getEvents, among all the events at the
  time of its first lesson, after the guard on the id), with fingerprints
  of the functions that recognise them and of those that create
  (_orariCreaSerie_, _orariSerieRifatta_, _orariLezioneRifatta_: one
  returning an event already on the calendar would give it the marks); the
  mark and "ours" assigned only in the
  allowed forms, with the guards in the loop before the calls; the list of
  _orariNostri_ named only in the allowed statements (no unshift, splice,
  concat, index or alias), the key `contrassegno` only with its value or
  false, and a fingerprint of the whole _orariNostri_, so that any change to
  it has to be read again; no Object, constructor, prototype or
  defineProperty, no computed property written outside two statements,
  each only in its own function and on a new object, no computed keys in
  object literals, no for ... of on a property, JSON.parse only where the
  saved point is read, the constants of the mark, the services and the
  script's own functions (each declared once) never redefined; no call,
  apply, bind, eval, this, unused event methods, destructuring, quoted
  properties or functions inside the functions that change or remove. The
  seven ways around the previous rules found by the first review, the
  seven found by the second (any event put among ours with unshift, splice,
  concat or an index, a single event with only the description taken as
  marked, Object.assign with JSON.parse, Object.defineProperty), those
  found by the third (a destructuring inside an expression, as in
  `{ a: voce.contrassegno } = { a: true }` after "=" or a comma, the
  allowed computed write copied into another function, a script function
  reassigned, computed keys) and more must fail, as the eight copies of
  before.
- Posta and Orari in the same project: invarianti_script.js checks that
  neither script uses the other's functions or variables, not even after a
  dot, and that Orari.gs never names CLASSI_STUDENTI or the functions that
  read it, not even in quotes (the timetables cannot reach the class
  students, the mail script cannot touch the calendar); the ways around it
  must fail. mock_orari.js puts a Classe_3B.gs file next to both scripts:
  the mail script finds it, and the timetable preview, the sendings, the
  calendar and ANNULLA_automazione never write a student address.
- prova_orario.ps1: the line formats (also with a full stop, "fino al",
  other line breaks), lines not understood (two dates written another way,
  the second in words or as a day only, another day in the name, digits of
  other scripts) and names with numbers that are not days (`25 aprile` on
  25 April, `al 50%`, `2 settimane`), lines outside the period, holidays of
  several years (Easter 2027 on 28 March, 2028 on 16 April, 2038 on 25 April
  with the Liberation Day in one line, Easter Monday 2011 too, 4 October only
  from 2026), the default end of the period, the plan, `sospensioni` and
  `validoDal` in the generated DatiOrari.gs, and the same number of series
  and skipped lessons in the app and in the script, from the start and from
  the change date. prova_stato.ps1 checks that the days without lessons
  follow the personal data and the change date stays in the settings;
  prova_disposizione.ps1 checks step 4 with the fullest summary, the tick,
  the holidays button (also with the end before the start) and a line
  outside the period.
- The colours of the classes: the fake Calendar of mock_orari.js has
  setColor and getColor on series and single events (not tried live, and
  said so), a lesson coloured by hand on its own, and a threshold that makes
  time pass on setColor only. New sections check the colours given by
  ORARI_4_calendario (also when setColor fails, before the mark, with the
  colours changed halfway), by ORARI_5_cambioOrario (a class with a new
  colour, one without, a lesson moved and one coloured by hand, a failure
  in the cut; setColor added to the operations failing at each of the first
  six calls), the preview, and ORARI_6_coloraLezioni (only what has to
  change, nothing done again, copies, other events and last year left
  alone, a class that lost its colour, resume for time and for Google's
  limits, another error, colours changed between a run and its resume, the
  lock, ORARI_ANNULLA_calendario, an unreadable saved point,
  ANNULLA_automazione, a lesson renamed by hand and one coloured by hand
  put back by the change, ORARI_4_calendario or ORARI_5_cambioOrario
  halfway, also stopped right after putting back the lesson coloured by
  hand and with both ways of colouring a series: `coloreDiGoogle` in the
  fake Calendar gives the colour of a series also to the lessons coloured
  on their own). DatiOrari_esempio.gs has colours for three classes
  out of four. invarianti_script.js allows setColor only on the calendar,
  the series just created, the pieces just done again by the cut, and in
  ORARI_6_coloraLezioni on the entries of _orariNostri_ after the guard of
  the mark (from an exact declaration, no nested functions, JSON.parse only
  where its saved point is read), and the ways around it must fail.
  nomi_funzioni.js wants every public function of Orari.gs in its header
  and in the instructions, and every resume of Orari.gs known to the mail
  script. prova_orario.ps1 checks the default colours in DatiOrari.gs, that
  they stay the same (also with a new class), the colours chosen by hand,
  "Colori di partenza", two classes with the same default colour (also with
  one of them on the calendar), more classes than colours, the names, the
  same order of the classes in the app and in the script, the colours kept
  only when DatiOrari.gs is copied, the name typed one letter at a time
  with another teacher found by prefix, a class coming back in January with
  a colour left over, and one chosen by hand a year before; prova_stato.ps1
  the colours in the settings, also written wrong by hand;
  prova_disposizione.ps1 the summary next to the button (also with 30
  classes, and with the name typed by prefix), DatiOrari.gs copied, and the
  window, also with 16 classes and with a colour chosen equal to another
  class's.
- The calendar in another account: test/solo_calendario.js applies in
  JavaScript the rule of SoloCalendario.Genera, and prova_orario.ps1 checks
  that the app's Calendario.gs is the same, character by character. New
  test/prova_solo_calendario.js, in tutte.ps1: Calendario.gs names none of
  those services, not even in a comment, has the six calendar functions and
  none of the email ones, no marker left and its own header; the data have
  one teacher only; mock_orari.js --solo-calendario runs the calendar
  sections on Calendario.gs with one teacher's data, in a project without
  MailApp and GmailApp and with a Session that only gives the time zone,
  plus the preview of Calendario.gs and its checks alone; and a marker left
  open, a calendar-only line without "// ", the email functions without
  markers, MailApp or DriveApp in a calendar part must fail.
  invarianti_script.js checks Calendario.gs (the one of solo_calendario.js,
  or the app's with --calendario) with the same calendar rules, no
  sendEmail, no CONFIG, Session only for getScriptTimeZone, and, as for
  Orari.gs, every function and constant of the script that it names declared
  in the file; the ways around it must fail. nomi_funzioni.js wants the
  public functions of Calendario.gs in its header and its resumes on its own
  functions. prova_orario.ps1 makes both files with the real generator from
  the example timetable, checks that the data have none of the other
  teachers' surnames, runs prova_solo_calendario.js and invarianti_script.js
  --calendario on them, and checks the guide for the other account;
  prova_stato.ps1 the choice in the settings; prova_disposizione.ps1 the
  choice in step 4, the menu, its previews and the layout.
- Parents' meetings: new sections of mock_orari.js (also with
  --solo-calendario) check the meetings put by ORARI_4_calendario (series
  per stretch, skipping days without lessons and periods without meetings,
  single days, location = link, mark and colour, lessons unchanged, a mark
  Google did not save, wrong data stopping before touching the calendar),
  ORARI_7_colloqui (lessons and past meetings untouched, a session moved by
  hand before today put back as a single event, a copy made by hand left
  and named, same result when run again the same day or the next, stopped
  by time and resumed after midnight, the lock, the other functions waiting
  for it, DatiOrari.gs changed halfway, ORARI_ANNULLA_calendario, no
  calendar, after the end and before the start of the period), the
  timetable change and ORARI_6_coloraLezioni with meetings; the meetings of
  the data (DatiOrari_esempio.gs has some) are put aside at the start and
  checked at the end. The fake `Date` can fix today for `new Date()`.
  invarianti_script.js: meetings follow the rules of the lessons (created
  only in _orariCreaColloquio_, mark and colour only on the meeting just
  created or found again after the guard, the second value of the mark
  among the forms of _orariNostri_ and among the constants, fingerprints of
  the new functions), and the ways around it must fail. prova_orario.ps1:
  how the lines are read (also the doubtful ones and those not
  understood), the plan, the import from test/colloqui_esempio.csv and
  test/colloqui_esempio.xlsx (invented data), `colloqui` and
  `coloreColloqui` in both generated DatiOrari.gs, and the same numbers of
  meetings in the app and in the script. prova_stato.ps1: the box follows
  the personal data, and the meetings' colour comes after every class with a
  colour the classes do not use; prova_disposizione.ps1: the section, its
  list, the summary, the import and the "Colloqui" row of the colours
  window; nomi_funzioni.js and prova_solo_calendario.js: ORARI_7_colloqui.

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
