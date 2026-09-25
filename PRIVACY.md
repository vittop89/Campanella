# Privacy, dati personali e pubblicazione su GitHub

Nota pratica, non un parere legale. Se la scuola ha un DPO, è a lui che vanno
le domande che contano. Per il quadro giuridico completo, con i riferimenti
di legge, vedi [docs/GDPR-e-DPO.md](docs/GDPR-e-DPO.md) (nella cartella di
Campanella è `documenti\GDPR - cosa vale per un docente.txt`).

## In breve

**Il codice si può pubblicare in chiaro. I dati che ci passano dentro no.**

Campanella è un generatore di testo: non contiene dati personali, non
raccoglie statistiche, e si collega a internet solo quando glielo chiedi
tu (vedi «Le connessioni del programma», più sotto). Tutto quello che tratta
resta nell'account Google dell'utente e nel suo computer. Il rischio non è il
programma: è quello che finisce per sbaglio dentro al repository.

## Cosa NON deve mai finire nel repository

| File | Perché |
|---|---|
| `campanella.json`, `campanella-dati.json` | contengono l'elenco del personale: nomi, cognomi, ruoli, indirizzi email di colleghi. Dati personali di terzi. |
| `DatiOrari_prova.gs`, `Configurazione_prova.gs` | generati dai dati veri (cognomi, indirizzi, orario di servizio): `test\genera_dati_prova.ps1` scrive il suo in `%TEMP%\campanella-dati-prova`, fuori dal repository. I banchi di prova usano i file `*_esempio.gs`, inventati. |
| qualunque `.xlsx` di orario | come sopra |
| `Configurazione.gs`, `DatiOrari.gs` generati | l'elenco degli indirizzi del personale, i cognomi |
| `mailFilters.xml` (i filtri esportati da Gmail) | i filtri veri di un account, con gli indirizzi e le parole che cercano. Le prove usano `test/filtri_gmail_esempio.xml`, inventato. |
| `Classe_*.gs` (Posta, passo 4, «Le mie classi…») | gli indirizzi degli studenti di una classe. Campanella li copia solo negli appunti, per il progetto dello script: se li salvi in un file, fuori dal repository. |
| `struttura.json`, `dist/`, `documenti/` | non sono sensibili, ma sono output: non serve versionarli |

Il `.gitignore` del progetto li esclude già tutti. Prima di ogni `push`
conviene comunque controllare a mano:

```bash
git ls-files | grep -iE "\.(json|gs|xlsx|xls|csv|xml)$"
```

Devono comparire solo i `.gs` di `src/risorse`, il `manifest.json`
dell'estensione, la configurazione della firma in `installer/` e i file
inventati di `test/`: `Configurazione_esempio.gs`, `DatiOrari_esempio.gs`,
`tabellone_esempio.csv`, `colloqui_esempio.csv`, `colloqui_esempio.xlsx` e
`filtri_gmail_esempio.xml`. Qualunque altro nome è
da controllare. Se un file con dati è già stato committato, non basta
cancellarlo: resta nella storia. Va riscritta la storia
(`git filter-repo`) oppure, molto più semplice, si ricomincia da un
repository nuovo.

## Cosa resta nel codice, e va bene

- I domini dei sindacati e del ministero nelle regole di partenza: sono
  informazioni pubbliche, stanno sui siti istituzionali. Il dominio della
  scuola di partenza è vuoto: lo scrive chi usa il programma.
- La cartella del Drive viene cercata all'avvio (`Il mio Drive` nel profilo o
  nella radice di un'unità). `build.ps1` non contiene percorsi personali: la
  cartella in cui `-Pubblica` copia i file si scrive ogni volta con
  `-Produzione`.
- Il nome dell'autore nelle proprietà dell'eseguibile: è una scelta di chi
  pubblica.

## Il trattamento dei dati, quando lo usi

Qui sta la sostanza, ed è indipendente da GitHub.

**Chi tratta cosa.** Nomi, indirizzi di servizio e orari dei colleghi sono
dati personali (comuni, non particolari). Il titolare del trattamento è la
scuola, non il singolo docente. Usando questi strumenti stai trattando dati
di cui disponi legittimamente per ragioni di servizio, come persona
autorizzata che opera sotto l'autorità della scuola: l'esenzione "domestica"
del GDPR non copre l'attività professionale, quindi ti muovi dentro il
perimetro della scuola e delle sue istruzioni.

**Dove finiscono i dati.** In nessun posto nuovo: restano nell'account Google
che stai già usando (solo il tuo orario, se lo scegli tu, va nel calendario
di un altro tuo account: vedi qui sotto). Campanella non li manda a nessun
servizio terzo, e nemmeno a chi l'ha scritta. Lo script scrive email
soltanto al tuo stesso indirizzo. «Scrivere a un gruppo» (Posta, passo 3)
non manda niente: mette negli appunti gli indirizzi di una categoria di
colleghi e apre in Gmail un messaggio vuoto, che scrivi e invii tu con gli
indirizzi in Ccn. Gli indirizzi non passano dal collegamento aperto nel
browser.

**Il tuo orario in un altro account.** Di partenza il tuo orario va nel
Google Calendar dell'account della scuola. Se scegli «in un altro account
Google» (Orari, passo 4), per esempio il tuo personale, incolli in un
progetto di quell'account due file: `Calendario.gs`, lo script degli orari
senza le email, e un `DatiOrari.gs` con soltanto il tuo orario (il tuo
cognome come nel tabellone, le tue classi e le tue ore, i giorni senza
lezione con il nome che hai scritto, il colore di ogni classe e i tuoi
colloqui con i link del Meet). Nessun dato
dei colleghi: né gli altri docenti del tabellone, né gli orari delle classi,
né indirizzi (con i dati di tutto il tabellone `Calendario.gs` si ferma e dice
di incollare quelli del tuo orario). I giorni senza lezione sono testo libero
e vanno anche lì: non scriverci il nome di un collega. Nel progetto della
scuola, con questa scelta, il `DatiOrari.gs` non ha la parte del calendario:
né i colloqui né i link del Meet. Quello script chiede solo il permesso del
Calendario e quello di riprendere da solo un lavoro lungo; non tocca la
posta e non conosce il tuo indirizzo. Le email degli orari, se le vuoi,
restano nell'account della scuola. È comunque il tuo orario di servizio in
un account fuori da quello della scuola: segui le regole dell'istituto
sull'uso degli account personali.

**I tuoi colloqui con le famiglie.** Negli Orari (passo 4) puoi scrivere i
tuoi colloqui, o importarli da un tuo file .csv o .xlsx: il ricevimento di
ogni settimana, le giornate dei colloqui generali, i periodi senza
colloqui, con il link della tua stanza di Google Meet. Vanno solo sul tuo
calendario, con il link come luogo. Quei link sono di accesso: chi li ha
entra nella stanza. Per questo il testo dei colloqui sta con i dati
personali (con i dati nel Drive, non nel file accanto al programma), e il
`DatiOrari.gs` che li contiene tienilo per te. Niente nomi di studenti o di
genitori: le prenotazioni restano nel registro elettronico, e Campanella non
le legge (un file con colonne di persone, come cognome, nome, classe,
genitore o email, non lo importa: è un elenco di prenotazioni).

**Le connessioni del programma.** Campanella si collega a internet solo
quando premi un pulsante. «Cerca aggiornamenti» (Impostazioni) chiede a
GitHub, su api.github.com, l'ultima versione pubblicata di Campanella e di
rizzo-pii: se c'è una Campanella nuova te lo dice e ti rimanda alla pagina
dei rilasci, senza scaricare niente. «Scarica e installa rizzo-pii» scarica
da GitHub l'installer di rizzo-pii e, prima di avviarlo, ne controlla la
dimensione e, quando GitHub la pubblica, l'impronta SHA-256. Con rizzo-pii
parla solo sul tuo computer, anche quando le Impostazioni, all'apertura,
controllano se è avviato (vedi «Dare documenti a un'intelligenza
artificiale»). I pulsanti che aprono Gmail, il Drive o l'editor degli
script aprono il tuo browser.

**Dove stanno i dati sul computer.** L'elenco del personale, gli indirizzi di
dirigenza e segreteria e gli orari con i cognomi stanno in `campanella.json`
accanto al programma, oppure — dalle Impostazioni, ed è la scelta
consigliata — in `campanella-dati.json` dentro la cartella del Drive della
scuola. Nel secondo caso restano nell'account istituzionale e nel file locale
non ne resta traccia, nemmeno il nome del calendario degli orari, i giorni
senza lezione che hai scritto (un testo libero, dove accanto alle feste può
finire un permesso o il nome di un collega) o i tuoi colloqui con i link del
Meet. Se poi sposti i dati in
un'altra cartella del Drive o di nuovo accanto al programma, Campanella,
dopo averlo chiesto, cancella il file che lasciano;
se quel file non l'ha letto, o nel frattempo l'ha cambiato un altro
computer, lo lascia e lo dice. Quando non ti servono più, svuota l'elenco.
Le righe senza spunta (per esempio gli indirizzi di studenti trovati nella
casella, che arrivano senza spunta) non vanno nello script ma restano
salvate: toglile con «Togli le righe senza spunta». I filtri di Gmail che
scegli di togliere (Posta, passo 4) stanno con l'elenco del personale,
perché i loro criteri possono contenere indirizzi: Campanella tiene solo
quelli che spunti, con l'etichetta e i criteri. Un filtro che sembra di una
classe e ha degli indirizzi non si può spuntare: potrebbero essere quelli
degli studenti, e si toglie da Gmail. Sembra di una classe se l'ultima parte
dell'etichetta finisce con il nome di una classe (3B, III B, 3B LSA, 5AINF o
5Ainf), anche con delle parole prima o l'anno dopo («Classe 3B», «Inglese
3B», «3B 2025-26»), o se l'etichetta sta sotto una madre con la parola
«classi» o usata per le classi. Una classe seguita da altre parole («3B
Inglese», come «5A Praga») non basta: un filtro così, se ha gli indirizzi
degli studenti, non spuntarlo. Se
l'avevi scelto prima (con la 1.5.3, o prima di creare le classi sotto
quell'etichetta), Campanella lo toglie dalla scelta all'avvio e con «Usa
queste classi», e non lo scrive nella configurazione; quella che avevi già
incollato nel progetto dello script può averlo ancora, con gli indirizzi
(la 1.5.3 ci scriveva tutti i criteri): copia di nuovo la configurazione e
sostituiscila. Il file che Gmail
esporta (di solito `mailFilters.xml`) contiene tutti i tuoi filtri: dopo
averlo aperto in Campanella puoi cancellarlo. Quando Campanella copia
negli appunti la configurazione degli script, i dati degli orari, il file
di una classe, gli indirizzi di un gruppo o i testi della Privacy, chiede a
Windows di non tenerli nella cronologia degli appunti e di non
sincronizzarli con altri dispositivi.

**Il registro delle esecuzioni.** Gli indirizzi che lo script della posta
ricava dalla tua casella (`EXTRA_elencaIndirizziScuola`: nomi e indirizzi
del dominio della scuola che compaiono nei tuoi messaggi) ti arrivano in
un'email a te stesso. Nel registro delle esecuzioni di Apps Script, che
Google conserva nel tuo account, finisce solo il conteggio; l'elenco ci
finisce soltanto se quell'email non parte. `EXTRA_togliFiltri` invece, prima
di togliere ognuno dei filtri che hai scelto, ne scrive nel registro una
copia completa, criteri compresi (anche indirizzi): serve a rifarlo a mano.
Con il riepilogo acceso la stessa copia ti arriva per email. Toglie solo
quei filtri; gli altri, le etichette e i messaggi restano.

**Gli indirizzi degli studenti delle tue classi.** Le etichette delle classi
(Posta, passo 4, «Le mie classi…», facoltative) prendono anche i messaggi
mandati dagli studenti di una classe. I loro indirizzi li incolli tu nella
finestra, per esempio dall'elenco del corso in Classroom: sono dati di minori,
e Campanella non li conserva. Restano in memoria finché la finestra è aperta
(Campanella toglie quelli del personale) e non vanno né in `campanella.json`,
né nel file dei dati nel Drive, né nelle regole, né in `Configurazione.gs`,
dove la regola ha solo un segnaposto (`@CLASSE:3B@`); un indirizzo scritto
fra le parole dell'oggetto viene scartato. Esistono solo nel file
`Classe_3B.gs` che copi dalla finestra (mai su un file del computer) e
incolli nel progetto Apps Script del tuo account della scuola, dove servono
alle ricerche dello smistamento; il file vale solo per l'etichetta per cui
l'hai copiato. Con un'etichetta madre senza l'anno («Le mie classi») la
regola l'anno dopo è la stessa ma gli studenti no: la finestra ricorda di
copiare di nuovo il file, e l'anteprima, il riordino e lo smistamento
avvisano se è di un anno scolastico passato. Lo script non li scrive nel
registro, nei riepiloghi né nei messaggi d'errore (l'anteprima dice solo
quanti sono), e non li mette nei filtri veri di Gmail: per le classi il
filtro cerca solo l'oggetto. Per
toglierli si cancella quel file dal progetto; a fine anno toglili, e togli le
classi (l'anteprima elenca i file che nessuna regola usa).

Due copie passano fuori da Campanella. Quella che copia Campanella non entra
nella cronologia degli appunti di Windows, ma resta negli appunti finché non
copi altro: chiudendo la finestra Campanella ti chiede se svuotarli. Se
prendi gli indirizzi da Classroom con Ctrl+C, quella copia invece entra nella
cronologia (Win+V per toglierla), e il messaggio che Classroom apre in Gmail
va eliminato con il cestino, non chiuso: chiuso resterebbe fra le bozze, con
tutti gli indirizzi. Puoi anche trascinare il testo nella casella della
finestra, senza passare dagli appunti.

**I moduli Google e le loro risposte.** Lo script dei moduli (Cartelle, passo
2) è un progetto a parte, incollato dentro il singolo modulo: crea il foglio
delle risposte dell'anno, lo collega al modulo e a fine anno chiude il modulo
e scollega il foglio. Apre soltanto il modulo in cui sta, ma senza il
manifest facoltativo che Campanella prepara (da mettere prima della prima
esecuzione) Google gli dà il permesso su tutti i moduli dell'account; con il
manifest, che per i moduli chiede solo l'ambito del modulo corrente, il
permesso vale solo per quello. Le risposte sono dati di studenti e famiglie:
restano nel modulo e nel foglio, dentro il Drive della scuola. Lo script ne
legge il numero e l'ora di arrivo, non il contenuto, e non le manda da
nessuna parte. Il foglio che crea è tuo e non è condiviso con nessuno: farlo
vedere ad altri è una tua decisione. Chiede il permesso per Drive solo per
mettere il foglio nella cartella dell'anno, e ne esiste una versione che ne
fa a meno. Le risposte degli anni scorsi le toglie dal modulo solo se lo
chiedi tu, e solo dopo averle ritrovate, una per una e dall'ora in cui sono
arrivate, in un foglio degli anni scorsi: se ne manca anche una non toglie
niente. È l'unica cancellazione che non si può annullare. Vale anche qui la
conservazione: i fogli degli anni passati non scadono da soli.
Se i moduli sono più di uno c'è la variante «foglio di controllo»: stesso
lavoro, ma lo script sta in un foglio e apre i moduli elencati lì dentro,
quindi Google gli chiede sempre il permesso su tutti i moduli dell'account,
oltre che sui fogli e sul Drive (questa variante non ha una versione senza
Drive), e le chiusure che programma scattano da sole nel giorno indicato.
Il codice è leggibile e tocca solo quelli in elenco, ma il permesso sui
moduli non si può restringere: con pochi moduli conviene lo script dentro
il modulo, con il manifest.

**I punti che meritano attenzione.**

1. **Il computer e i supporti.** Un computer non cifrato o condiviso, una
   chiavetta: una chiavetta smarrita con l'elenco del personale è una
   violazione di dati che la scuola deve valutare e, se del caso, notificare
   al Garante entro 72 ore. Avvisa subito la scuola, secondo le sue
   istruzioni.
2. **I dati degli studenti.** Certificazioni, PDP e PEI, relazioni cliniche
   sono categorie particolari (art. 9 GDPR). Campanella non li tratta; non
   copiarli sul computer e non darli a un assistente di IA, nemmeno
   anonimizzati.
3. **Conservazione.** Un file sul disco non ha una scadenza automatica.
   Decidi tu per quanto tenerlo e cancellalo quando non serve più.

**Base giuridica.** Per l'organizzazione del servizio scolastico si ricade
nell'esecuzione di un compito di interesse pubblico (art. 6, par. 1, lett. e)
GDPR; art. 2-ter del Codice privacy), esercitato dalla scuola. Un'iniziativa
personale che coinvolge i dati dei colleghi va quindi ricondotta a quel
quadro: da qui i documenti per dirigenza e DPO che Campanella ti mette a
disposizione (pagina Privacy e cartella `documenti`).

## Devo avvisare il DPO?

Non c'è un obbligo di legge di chiedere un'autorizzazione per riordinare la
propria casella dentro l'account della scuola: il DPO informa, consiglia e
sorveglia, non autorizza. Ci sono però le istruzioni della scuola, che devi
seguire (art. 29 e 32, par. 4 GDPR): se il regolamento d'istituto prevede
una segnalazione o un'autorizzazione per gli script, vale quella. La strada
prudente è una comunicazione con allegata la nota tecnica. Tutto spiegato,
con i riferimenti, in [docs/GDPR-e-DPO.md](docs/GDPR-e-DPO.md); i testi
pronti sono [docs/Nota-tecnica-DS-DPO.md](docs/Nota-tecnica-DS-DPO.md) e
[docs/Email-DS-DPO.md](docs/Email-DS-DPO.md). Nella cartella di Campanella
gli stessi documenti stanno in `documenti`, come testo: «GDPR - cosa vale
per un docente», «Nota tecnica per dirigente e DPO» ed «Email per dirigente
e DPO»; li apri anche dalla pagina Privacy e dalle Impostazioni.

## Dare documenti a un'intelligenza artificiale

Quando incolli un documento in ChatGPT, Claude o Gemini quel testo esce dal tuo
computer e finisce su server che non controlli, dove può essere conservato o
usato. Se il documento contiene dati personali di colleghi, studenti o
famiglie, quello è un trasferimento a un terzo — ed è esattamente il caso in
cui il GDPR chiede una base giuridica che, per un'iniziativa personale, non
c'è.

Lo strumento **Privacy** dell'applicazione serve a togliere il problema alla
radice invece di gestirlo: il testo viene ripulito **in locale** da rizzo-pii,
all'assistente arriva solo `[FULLNAME_1]`, `[CF_2]`, `[IBAN_1]`, e i nomi veri
si rimettono nella risposta sempre in locale. Il dizionario che collega
segnaposto e valori resta nella memoria dell'applicazione: non viene scritto su
disco e non passa dalla rete. Testi e file vanno soltanto a un rizzo-pii che
gira su questo computer: un indirizzo del servizio diverso da localhost,
127.0.0.1 (o un altro 127.x.x.x) o ::1 viene rifiutato prima di collegarsi,
e le richieste non passano da proxy né seguono reindirizzamenti.

Due avvertenze che restano valide anche così:

1. **Nessun riconoscitore prende il 100%.** Rileggi sempre il testo pulito
   prima di incollarlo. E soprattutto: un dato che identifica una persona non
   è per forza un nome. "La collega di sostegno della 3B" non contiene nomi e
   identifica benissimo.

2. **Sui dati degli studenti non basta anonimizzare.** In una classe di venti
   persone il contesto reidentifica quasi sempre. Certificazioni, PDP e PEI,
   relazioni cliniche non vanno date a un assistente, nemmeno con i segnaposto.

## L'elenco del personale da Spaggiari

Vale solo per ClasseViva di Spaggiari: con altri registri (Argo, Axios,
Nuvola e simili) l'estensione e la funzione per la Console non trovano
niente, e l'elenco si incolla a mano o si chiede in segreteria.

La funzione per la Console e l'estensione per Chrome leggono soltanto quello
che è già visibile sullo schermo di un utente autenticato: non aggirano
l'autenticazione, non interrogano API riservate, non accedono a niente che tu
non possa già vedere, non mandano niente a nessuno. L'estensione non passa
dal Web Store: si carica dalla cartella con la modalità sviluppatore di
Chrome, quindi non c'è nessuna pubblicazione, e lavora solo sulle pagine di
ClasseViva. La funzione per la Console copia l'elenco negli appunti; scrive
`personale_spaggiari.csv` nella cartella dei download solo se gli appunti non
funzionano, e in quel caso ti dice di cancellarlo dopo averlo caricato.

Le Condizioni generali di utilizzo di ClasseViva (web.spaggiari.eu, versione
del luglio 2024) non parlano di accesso automatizzato, bot o script.
Contengono però, al punto 2, clausole sulla proprietà intellettuale dei
"Materiali" della piattaforma, cioè informazioni, testi, software e contenuti
editoriali: ne è consentito un uso occasionale e non sistematico per scopi
personali o didattici, mentre scaricarli, riformattarli o riprodurli con
qualsiasi tecnologia senza autorizzazione scritta non è consentito. L'elenco
del personale è un dato della scuola, che ne è titolare, non un contenuto
editoriale di Spaggiari; la clausola però è scritta in modo ampio, e
un'estrazione automatica le si avvicina più di una copia a mano. In pratica:
usa l'estensione una volta, per il tuo elenco, non in modo sistematico. Se
preferisci non avere il dubbio, chiedi l'elenco alla segreteria, che resta
anche il modo più affidabile. Il contratto fra la scuola e Spaggiari può
contenere regole d'uso ulteriori, che non sono pubbliche.

## Se pubblichi l'eseguibile

Il binario compilato in locale è firmato solo se lo chiedi (`build.ps1 -Firma`
o `-Pubblica`), con un certificato autofirmato che `strumenti/firma.ps1` crea
la prima volta e aggiunge ai certificati attendibili del tuo utente di
Windows: su quel computer Windows lo accetta senza storie, su qualunque
altro SmartScreen avvisa lo stesso. Il certificato resta installato finché
non lo togli da certmgr.msc. Per i rilasci pubblici c'è il workflow con
SignPath (`.github/workflows/release.yml`), che firmerà con un certificato
di un'autorità riconosciuta, senza costi per i progetti open source, quando
il progetto sarà accettato nel programma: fino ad allora i rilasci escono
non firmati e lo dicono.

## Lista di controllo prima di rendere pubblico il repository

- [ ] `git ls-files` non mostra `campanella*.json`, `.xlsx`, `*_prova.gs`
- [ ] nessun indirizzo email di persone reali nei sorgenti e nei commenti
- [ ] nessun cognome reale nei file di prova (usa nomi inventati: `*_esempio.gs`)
- [ ] il dominio predefinito è vuoto
- [ ] README, PRIVACY, LICENSE e `docs/` presenti
- [ ] la storia dei commit è pulita quanto i file attuali
