<#
    prova_stato.ps1 - i salvataggi non distruggono i dati dell'utente

        .\test\prova_stato.ps1
        .\test\prova_stato.ps1 -Stato C:\altrove\Stato.cs   (un'altra versione, per vederla fallire)

    Compila un piccolo programma ospite insieme a src\Stato.cs e lo fa girare
    in cartelle temporanee, una per caso: campanella.json sta accanto alla
    copia dell'ospite, e il "Drive" e' una cartella finta li' dentro. Nessuna
    prova tocca il Drive vero, la cartella del programma o le impostazioni
    vere: e' la regola per tutte le prove che creano uno Stato.

    Ogni caso scrive i file di partenza, chiama Carica, Salva o SpostaDati
    come fa l'applicazione, e guarda che cosa e' rimasto sul disco. In fondo
    la protezione delle versioni di prima: una copia dello stesso Stato.cs con
    Formato = 1, come la 1.5.2, non deve riscrivere i file scritti da questo.
#>
param([string]$Stato = '')

$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if ($Stato -eq '') { $Stato = Join-Path $radice 'src\Stato.cs' }
if (-not (Test-Path $Stato)) { throw "Manca $Stato" }

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'Compilatore C# non trovato: manca il .NET Framework 4.x.' }

# ---------------------------------------------------------------------------
#  Il programma ospite. Usa solo quello che c'era gia' in Stato (Carica,
#  Salva, SpostaDati a tre argomenti, i campi): il resto lo cerca per nome,
#  cosi' si compila anche con una versione vecchia e li' i controlli falliscono.
# ---------------------------------------------------------------------------
$ospite = @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using Campanella;

static class ProvaStato
{
    static string Base;
    static int fallimenti = 0;
    static JavaScriptSerializer ser = new JavaScriptSerializer();
    static UTF8Encoding utf8 = new UTF8Encoding(false);

    static int Main(string[] args)
    {
        Base = Path.GetDirectoryName(Path.GetFullPath(Assembly.GetExecutingAssembly().Location));
        // con la cartella di prova Stato non va nemmeno a cercare il Drive vero
        FieldInfo prova = typeof(Stato).GetField("CartellaDiProva", BindingFlags.Public | BindingFlags.Static);
        if (prova != null) prova.SetValue(null, Base);

        string caso = (args.Length > 0) ? args[0] : "";
        try
        {
            switch (caso)
            {
                case "nuovo": Nuovo(); break;
                case "dati-mancanti": DatiMancanti(); break;
                case "dati-mancanti-e-nuovi": DatiMancantiENuovi(); break;
                case "dati-troncati":
                    DatiIlleggibili("{\"personale\":[{\"nome\":\"BIANCHI ANNA\",\"email\":\"anna.bian", "troncato");
                    break;
                case "dati-non-json": DatiIlleggibili("questo non e' JSON {", "non JSON"); break;
                case "dati-vuoti": DatiIlleggibili("", "vuoto"); break;
                case "dati-bloccati": DatiBloccati(); break;
                case "dati-piu-recenti": DatiPiuRecenti(); break;
                case "impostazioni-illeggibili": ImpostazioniIlleggibili(); break;
                case "impostazioni-vuote": ImpostazioniVuote(); break;
                case "impostazioni-piu-recenti": ImpostazioniPiuRecenti(); break;
                case "scrittura-atomica": ScritturaAtomica(); break;
                case "sposta-su-esistente": SpostaSuEsistente(); break;
                case "usa-esistente": UsaEsistente(); break;
                case "cambia-cartella": CambiaCartella(); break;
                case "sposta-fallito": SpostaFallito(); break;
                case "torna-locale": TornaLocale(); break;
                case "torna-locale-illeggibile": TornaLocaleIlleggibile(); break;
                case "cambiato-dopo-l-avvio": CambiatoDopoLAvvio(); break;
                case "cambiato-e-spostato": CambiatoESpostato(); break;
                case "conflitto-alla-chiusura": ConflittoAllaChiusura(); break;
                case "scrittura-a-meta": ScritturaAMeta(); break;
                case "chiavi-sconosciute": ChiaviSconosciute(); break;
                case "nome-calendario": NomeCalendario(); break;
                case "nome-calendario-drive-non-pronto": NomeCalendarioDriveNonPronto(); break;
                case "andata-e-ritorno": AndataERitorno(); break;
                case "calendario-andata-e-ritorno": CalendarioAndataERitorno(); break;
                case "colori-andata-e-ritorno": ColoriAndataERitorno(); break;
                case "colori-dalla-1-5": ColoriDalla15(); break;
                case "colori-scritti-a-mano": ColoriScrittiAMano(); break;
                case "filtri-andata-e-ritorno": FiltriAndataERitorno(); break;
                case "filtri-scritti-a-mano": FiltriScrittiAMano(); break;
                case "classi-andata-e-ritorno": ClassiAndataERitorno(); break;
                case "classi-colori": ClassiColori(); break;
                case "classi-madri": ClassiMadri(); break;
                // queste due girano nella stessa cartella, una dopo l'altra: la
                // prima con lo Stato di adesso, la seconda con Formato = 1
                case "scrivi-per-la-vecchia": ScriviPerLaVecchia(); break;
                case "vecchia-non-riscrive": VecchiaNonRiscrive(); break;
                default: Console.WriteLine("  caso sconosciuto: " + caso); return 99;
            }
        }
        catch (Exception ex)
        {
            Verifica("il caso gira fino in fondo (" + ex.GetType().Name + ": " + ex.Message + ")", false);
        }
        return fallimenti;
    }

    // ===================================================================
    //  I CASI
    // ===================================================================

    // A-52, A-15: uno Stato nuovo non punta al Drive del computer
    static void Nuovo()
    {
        Stato s = new Stato();
        Verifica("new Stato() lascia vuoto il Drive: non cerca le unita'", s.Drive == "");
        s.Drive = Finto();
        Verifica("Percorso() sta nella cartella di prova", Stato.Percorso() == Impostazioni());
        Stato c = Stato.Carica();
        Verifica("senza campanella.json, nella cartella di prova, Carica non cerca il Drive", c.Drive == "");
    }

    // A-1: il file dei dati non c'e' all'avvio (Drive non ancora sincronizzato)
    static void DatiMancanti()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Stato s = Carica();
        Verifica("file assente: DatiNonTrovati", s.DatiNonTrovati);
        Verifica("file assente: non e' un errore di lettura", Testo(s, "ErroreDati") == "");
        s.Salva();
        Verifica("senza modifiche non crea un file dei dati vuoto", !File.Exists(FileDati(c)));

        // il Drive finisce di sincronizzare mentre Campanella e' aperta
        string vero = ToJson(DatiCon(Persona("BIANCHI ANNA", "anna.bianchi@scuola.example")));
        Scrivi(FileDati(c), vero);
        s.Salva();
        Verifica("il file comparso dopo l'avvio non viene sovrascritto", Leggi(FileDati(c)) == vero);
        Verifica("senza modifiche non c'e' niente da dire alla chiusura", Testo(s, "DaAvvisare") == "");

        s.Personale.Add(NuovaPersona("ROSSI MARIO", "mario.rossi@scuola.example"));
        s.Salva();
        Verifica("neanche con un elenco cambiato in questa sessione", Leggi(FileDati(c)) == vero);
        Verifica("e allora l'utente viene avvisato", Pieno(Testo(s, "DaAvvisare")));
        Verifica("UltimoErrore lo annota", s.UltimoErrore != "");
    }

    // il file manca, ma l'utente scrive un elenco: alla chiusura il file nasce
    static void DatiMancantiENuovi()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Stato s = Carica();
        s.Personale.Add(NuovaPersona("ROSSI MARIO", "mario.rossi@scuola.example"));
        s.Salva();
        Verifica("un elenco scritto adesso finisce nel Drive", File.Exists(FileDati(c)) &&
            Nomi(Json(FileDati(c))).Contains("ROSSI MARIO"));
        Verifica("e campanella.json resta senza elenco", !Json(Impostazioni()).ContainsKey("personale"));
    }

    // A-1: il file dei dati c'e' ma non si legge
    static void DatiIlleggibili(string contenuto, string come)
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Scrivi(FileDati(c), contenuto);
        Stato s = Carica();
        Verifica(come + ": non lo scambia per un file assente", !s.DatiNelDrive || !s.DatiNonTrovati);
        Verifica(come + ": dice perche' non l'ha letto", Pieno(Testo(s, "ErroreDati")));
        s.Salva();
        Verifica(come + ": Salva non lo sovrascrive", Leggi(FileDati(c)) == contenuto);
        Verifica(come + ": UltimoErrore lo annota", s.UltimoErrore != "");
        Verifica(come + ": l'utente viene avvisato", Pieno(Testo(s, "DaAvvisare")));
    }

    // A-1: il file e' bloccato mentre Campanella parte, e sbloccato alla chiusura
    static void DatiBloccati()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        string contenuto = ToJson(DatiCon(Persona("BIANCHI ANNA", "anna.bianchi@scuola.example")));
        Scrivi(FileDati(c), contenuto);
        Stato s;
        using (FileStream f = new FileStream(FileDati(c), FileMode.Open, FileAccess.Read, FileShare.None))
            s = Carica();
        Verifica("bloccato: non lo scambia per un file assente", !s.DatiNonTrovati);
        Verifica("bloccato: dice perche' non l'ha letto", Pieno(Testo(s, "ErroreDati")));
        s.Salva();
        Verifica("sbloccato alla chiusura: non lo sostituisce con un elenco vuoto", Leggi(FileDati(c)) == contenuto);
        Verifica("e avvisa", Pieno(Testo(s, "DaAvvisare")));
    }

    // A-51: un file scritto da una versione piu' recente si legge ma non si riscrive
    static void DatiPiuRecenti()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Dictionary<string, object> d = DatiCon(Persona("BIANCHI ANNA", "anna.bianchi@scuola.example"));
        d["formato"] = 99;
        string contenuto = ToJson(d);
        Scrivi(FileDati(c), contenuto);
        Stato s = Carica();
        Verifica("l'elenco si legge lo stesso", s.Personale.Count == 1);
        Verifica("dice che il file e' di una versione piu' recente", Pieno(Testo(s, "ErroreDati")));
        s.Salva();
        Verifica("non lo riscrive (perderebbe quello che non capisce)", Leggi(FileDati(c)) == contenuto);
        Verifica("e avvisa", Pieno(Testo(s, "DaAvvisare")));
    }

    // A-1: campanella.json illeggibile non viene sostituito in silenzio
    static void ImpostazioniIlleggibili()
    {
        string rotto = "{\"temaScuro\":false,\"personale\":[{\"nome\":\"ROSSI MARIO\",\"email\":\"mario.ro";
        Scrivi(Impostazioni(), rotto);
        Stato s = Carica();
        Verifica("dice perche' non ha letto campanella.json", Pieno(Testo(s, "ErroreImpostazioni")));
        s.Salva();
        Verifica("campanella.json illeggibile non viene sostituito", Leggi(Impostazioni()) == rotto);
        Verifica("l'utente viene avvisato", Pieno(Testo(s, "DaAvvisare")));
        Verifica("nessuna copia lasciata accanto", SoloAttesi());
        File.Delete(Impostazioni());
        s.Salva();
        Verifica("tolto il file rotto, Salva ne scrive uno nuovo", File.Exists(Impostazioni()) &&
            Json(Impostazioni()) != null && s.UltimoErrore == "");
    }

    // un campanella.json vuoto non ha niente da perdere: si riparte da zero
    static void ImpostazioniVuote()
    {
        Scrivi(Impostazioni(), "");
        Stato s = Carica();
        Verifica("vuoto: nessun errore", Testo(s, "ErroreImpostazioni") == "");
        s.Salva();
        Verifica("vuoto: Salva lo riscrive", s.UltimoErrore == "" && Json(Impostazioni()) != null);
    }

    static void ImpostazioniPiuRecenti()
    {
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["formato"] = 99; r["drive"] = Finto(); r["temaScuro"] = false;
        string contenuto = ToJson(r);
        Scrivi(Impostazioni(), contenuto);
        Stato s = Carica();
        Verifica("le impostazioni si leggono lo stesso", !s.TemaScuro);
        s.Salva();
        Verifica("campanella.json di una versione piu' recente non si riscrive", Leggi(Impostazioni()) == contenuto);
        Verifica("e avvisa", Pieno(Testo(s, "DaAvvisare")));
    }

    // R-1.4: campanella.json passa da un .tmp e non lascia copie
    static void ScritturaAtomica()
    {
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["personale"] = Elenco(Persona("ROSSI MARIO", "mario.rossi@scuola.example"));
        ScriviImpostazioni(false, "", altro);
        Scrivi(Impostazioni() + ".tmp", "resto di un salvataggio interrotto");
        Stato s = Carica();
        Verifica("legge l'elenco", s.Personale.Count == 1);
        s.Salva();
        Verifica("Salva riesce", s.UltimoErrore == "");
        Verifica("il file e' JSON con l'elenco", Nomi(Json(Impostazioni())).Contains("ROSSI MARIO"));
        Verifica("non resta campanella.json.tmp", !File.Exists(Impostazioni() + ".tmp"));
        Verifica("nessuna copia .bak o altro accanto", SoloAttesi());

        string prima = Leggi(Impostazioni());
        File.SetAttributes(Impostazioni(), FileAttributes.ReadOnly);
        try
        {
            s.Personale.Clear();
            s.Salva();
            Verifica("in sola lettura lo dice", s.UltimoErrore != "");
            Verifica("in sola lettura il file resta intero", Leggi(Impostazioni()) == prima);
            Verifica("e non lascia il .tmp", !File.Exists(Impostazioni() + ".tmp"));
        }
        finally { File.SetAttributes(Impostazioni(), FileAttributes.Normal); }
    }

    // A-1: spostare i dati nel Drive dove c'e' gia' un file non lo sovrascrive
    static void SpostaSuEsistente()
    {
        string c = Cartella("Campanella");
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["personale"] = Elenco(Persona("ROSSI MARIO", "mario.rossi@scuola.example"));
        ScriviImpostazioni(false, "", altro);
        string delDrive = ToJson(DatiCon(Persona("BIANCHI ANNA", "anna.bianchi@scuola.example")));
        Scrivi(FileDati(c), delDrive);
        Stato s = Carica();

        string errore;
        bool ok = s.SpostaDati(true, c, out errore);
        Verifica("non sposta sopra un file che non ha letto, e lo dice", !ok && errore != "");
        Verifica("il file del Drive resta com'era", Leggi(FileDati(c)) == delDrive);
        Verifica("i dati restano accanto al programma", !s.DatiNelDrive &&
            Nomi(Json(Impostazioni())).Contains("ROSSI MARIO"));

        object[] a = { true, c, true, null };
        object r = Chiama(s, "SpostaDati", a);
        Verifica("se l'utente conferma lo sostituisce", r is bool && (bool)r);
        Verifica("adesso il file del Drive ha l'elenco di questo computer",
            Nomi(Json(FileDati(c))).Contains("ROSSI MARIO"));
        Verifica("e campanella.json resta senza elenco", !Json(Impostazioni()).ContainsKey("personale"));
    }

    // l'utente sceglie di usare il file che c'e' gia' nel Drive
    static void UsaEsistente()
    {
        string c = Cartella("Campanella");
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["personale"] = Elenco(Persona("ROSSI MARIO", "mario.rossi@scuola.example"));
        ScriviImpostazioni(false, "", altro);
        string delDrive = ToJson(DatiCon(Persona("BIANCHI ANNA", "anna.bianchi@scuola.example")));
        Scrivi(FileDati(c), delDrive);
        Stato s = Carica();

        object[] a = { c, null };
        object r = Chiama(s, "UsaDatiDelDrive", a);
        Verifica("usa il file che c'e'", r is bool && (bool)r);
        Verifica("senza toccarlo", Leggi(FileDati(c)) == delDrive);
        Dictionary<string, object> imp = Json(Impostazioni());
        Verifica("campanella.json passa al Drive e perde l'elenco di prima",
            Vero(imp, "datiNelDrive") && !imp.ContainsKey("personale"));
        s.Salva();   // la chiusura prima del riavvio: in memoria c'e' ancora l'elenco di prima
        Verifica("il salvataggio prima del riavvio non riscrive il file del Drive", Leggi(FileDati(c)) == delDrive);
        Verifica("e non avvisa di niente", Testo(s, "DaAvvisare") == "");
        Stato t = Carica();
        Verifica("al riavvio l'elenco e' quello del Drive",
            t.Personale.Count == 1 && t.Personale[0].Nome == "BIANCHI ANNA");
    }

    // A-62: cambiando cartella dentro il Drive la copia vecchia non resta
    static void CambiaCartella()
    {
        string a = Cartella("A"), b = Cartella("B");
        ScriviImpostazioni(true, a, null);
        Scrivi(FileDati(a), ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"))));
        Stato s = Carica();
        string errore;
        bool ok = s.SpostaDati(true, b, out errore);
        Verifica("sposta nella cartella nuova", ok && File.Exists(FileDati(b)) &&
            Nomi(Json(FileDati(b))).Contains("ROSSI MARIO"));
        Verifica("e toglie la copia vecchia", !File.Exists(FileDati(a)));
    }

    // A-62: se lo spostamento non riesce si torna com'era, senza perdere l'elenco
    static void SpostaFallito()
    {
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["personale"] = Elenco(Persona("ROSSI MARIO", "mario.rossi@scuola.example"));
        ScriviImpostazioni(false, "", altro);
        Stato s = Carica();
        string dove = Path.Combine(Base, "manca", "sotto", "Campanella");
        string errore;
        bool ok = s.SpostaDati(true, dove, out errore);
        Verifica("se il Drive non c'e' non riesce, e lo dice", !ok && errore != "");
        Verifica("torna com'era: dati accanto al programma", !s.DatiNelDrive && s.CartellaDati == "");
        Dictionary<string, object> imp = Json(Impostazioni());
        Verifica("campanella.json ha ancora l'elenco e la sede di prima",
            !Vero(imp, "datiNelDrive") && Nomi(imp).Contains("ROSSI MARIO"));
    }

    static void TornaLocale()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Scrivi(FileDati(c), ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"))));
        Stato s = Carica();
        string errore;
        bool ok = s.SpostaDati(false, "", out errore);
        Verifica("riporta i dati accanto al programma", ok && Nomi(Json(Impostazioni())).Contains("ROSSI MARIO"));
        Verifica("e toglie il file dal Drive", !File.Exists(FileDati(c)));
    }

    // un file del Drive che non si e' letto non si cancella
    static void TornaLocaleIlleggibile()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Scrivi(FileDati(c), "{rotto");
        Stato s = Carica();
        string errore;
        s.SpostaDati(false, "", out errore);
        Verifica("i dati adesso stanno accanto al programma", !s.DatiNelDrive &&
            !Vero(Json(Impostazioni()), "datiNelDrive"));
        Verifica("il file non letto non viene cancellato", File.Exists(FileDati(c)) && Leggi(FileDati(c)) == "{rotto");
        Verifica("e lo dice", errore != "");
    }

    // il file dei dati letto all'avvio, poi cambiato da un altro computer: il
    // portatile rimasto aperto non lo riporta alla sua copia, anche senza modifiche
    static void CambiatoDopoLAvvio()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Scrivi(FileDati(c), ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"))));
        Stato s = Carica();
        s.Salva();
        Verifica("il file letto all'avvio si salva", s.UltimoErrore == "" &&
            Nomi(Json(FileDati(c))).Contains("ROSSI MARIO"));

        // niente di nuovo: il file ha gia' quello che si scriverebbe
        DateTime vecchia = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(FileDati(c), vecchia);
        s.Salva();
        Verifica("se il file e' gia' uguale non lo riscrive", s.UltimoErrore == "" &&
            File.GetLastWriteTimeUtc(FileDati(c)) == vecchia);

        // un altro computer aggiunge una persona, e il Drive porta qui il file
        string altroPc = ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"),
                                        Persona("VERDI ANNA", "anna.verdi@scuola.example")));
        Scrivi(FileDati(c), altroPc);
        s.Salva();
        Verifica("senza modifiche qui il file cambiato altrove resta com'e'", Leggi(FileDati(c)) == altroPc);
        Verifica("UltimoErrore lo annota", s.UltimoErrore != "");
        Verifica("senza modifiche qui non c'e' niente da dire alla chiusura", Testo(s, "DaAvvisare") == "");
        Verifica("nelle Impostazioni diventa un file da usare o sostituire",
            !s.DatiGiaLetti(FileDati(c)) && Pieno(Testo(s, "ErroreDati")));

        s.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        s.Salva();
        Verifica("neanche con un elenco cambiato qui", Leggi(FileDati(c)) == altroPc);
        Verifica("e allora avvisa", Pieno(Testo(s, "DaAvvisare")));

        // un computer gia' aggiornato a un formato piu' recente riscrive il file
        string n = Cartella("Nuovo");
        ScriviImpostazioni(true, n, null);
        Scrivi(FileDati(n), ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"))));
        Stato t = Carica();
        Dictionary<string, object> p = Persona("ROSSI MARIO", "mario.rossi@scuola.example");
        p["campoNuovo"] = new object[] { "1A", "2B" };
        Dictionary<string, object> futuro = DatiCon(p);
        futuro["formato"] = Stato.Formato + 1;
        string recente = ToJson(futuro);
        Scrivi(FileDati(n), recente);
        t.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        t.Salva();
        Verifica("un file riscritto in un formato piu' recente non torna a quello vecchio",
            Leggi(FileDati(n)) == recente);
        Verifica("e l'avviso dice che e' di una versione piu' recente",
            (Testo(t, "DaAvvisare") ?? "").Contains("versione piu' recente"));
    }

    // una copia cambiata da un altro computer dopo l'avvio non si cancella
    // spostando i dati: dentro c'e' qualcosa che qui non si e' mai visto
    static void CambiatoESpostato()
    {
        string altroPc = ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"),
                                        Persona("VERDI ANNA", "anna.verdi@scuola.example")));
        string errore;

        // tornando accanto al programma
        string a = Cartella("A");
        ScriviImpostazioni(true, a, null);
        Scrivi(FileDati(a), ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"))));
        Stato s = Carica();
        Scrivi(FileDati(a), altroPc);
        bool ok = s.SpostaDati(false, "", out errore);
        Verifica("tornando accanto al programma i dati si salvano li'", !s.DatiNelDrive &&
            Nomi(Json(Impostazioni())).Contains("ROSSI MARIO"));
        Verifica("ma il file cambiato altrove resta nel Drive, e lo dice",
            Leggi(FileDati(a)) == altroPc && !ok && errore != "");

        // cambiando cartella dentro il Drive
        string b = Cartella("B"), c = Cartella("C");
        ScriviImpostazioni(true, b, null);
        Scrivi(FileDati(b), ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"))));
        Stato t = Carica();
        Scrivi(FileDati(b), altroPc);
        ok = t.SpostaDati(true, c, out errore);
        Verifica("cambiando cartella i dati vanno in quella nuova", Nomi(Json(FileDati(c))).Contains("ROSSI MARIO"));
        Verifica("ma la copia cambiata altrove resta, e lo dice",
            Leggi(FileDati(b)) == altroPc && !ok && errore != "");

        // scegliendo di usare il file che c'e' gia' in un'altra cartella
        string e = Cartella("E"), f = Cartella("F");
        ScriviImpostazioni(true, e, null);
        Scrivi(FileDati(e), ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"))));
        Scrivi(FileDati(f), ToJson(DatiCon(Persona("NERI PAOLA", "paola.neri@scuola.example"))));
        Stato u = Carica();
        Scrivi(FileDati(e), altroPc);
        object[] arg = { f, null };
        object r = Chiama(u, "UsaDatiDelDrive", arg);
        Verifica("usando l'altro file, la copia cambiata altrove resta, e lo dice",
            Leggi(FileDati(e)) == altroPc && r is bool && !(bool)r && Pieno(arg[1] as string));
    }

    // S-1: un altro computer cambia il file dei dati e qui l'elenco e' cambiato.
    // Il salvataggio della chiusura non lo sovrascrive e lo dice con
    // ModificheInConflitto (il guscio chiede se chiudere lo stesso); l'avviso non
    // consiglia di riaprire fra qualche minuto, che caricherebbe il file dell'altro
    // computer. Applica > sostituisci, finche' la finestra e' aperta, tiene i dati.
    static void ConflittoAllaChiusura()
    {
        string altroPc = ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"),
                                        Persona("VERDI ANNA", "anna.verdi@scuola.example")));
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Scrivi(FileDati(c), ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"))));
        Stato s = Carica();
        Scrivi(FileDati(c), altroPc);
        s.Salva();
        Verifica("cambiato altrove, ma qui niente di nuovo: nessun conflitto",
            Testo(s, "ModificheInConflitto") == "False");

        s.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        s.Salva();
        string avviso = Testo(s, "DaAvvisare") ?? "";
        Verifica("con le modifiche di adesso il file dell'altro computer resta", Leggi(FileDati(c)) == altroPc);
        Verifica("ed e' un conflitto con modifiche: il guscio chiede prima di chiudere",
            Testo(s, "ModificheInConflitto") == "True");
        Verifica("l'avviso non dice di riaprire fra qualche minuto",
            Pieno(avviso) && !avviso.Contains("fra qualche minuto"));
        Verifica("dice che riaprendo si carica il file dell'altro computer",
            avviso.Contains("Riaprendo") && avviso.Contains("file dell'altro computer"));
        Verifica("e che sostituirlo tiene i dati solo finche' la finestra e' aperta",
            avviso.Contains("sostituire quel file") && avviso.Contains("finche' questa finestra"));

        // l'utente resta, e in Impostazioni sceglie Applica > sostituisci
        object[] a = { true, c, true, null };
        object r = Chiama(s, "SpostaDati", a);
        Verifica("sostituito: nel Drive ci sono i dati di adesso", r is bool && (bool)r &&
            Nomi(Json(FileDati(c))).Contains("BIANCHI LUCA"));
        s.Salva();
        Verifica("e alla chiusura non c'e' piu' niente da chiedere",
            Testo(s, "ModificheInConflitto") == "False" && Testo(s, "DaAvvisare") == "");

        // un file comparso dopo l'avvio (il Drive non aveva finito) vale lo stesso
        string n = Cartella("Comparso");
        ScriviImpostazioni(true, n, null);
        Stato t = Carica();
        t.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        Scrivi(FileDati(n), altroPc);
        t.Salva();
        Verifica("anche un file comparso dopo l'avvio, con modifiche qui, e' un conflitto",
            Leggi(FileDati(n)) == altroPc && Testo(t, "ModificheInConflitto") == "True" &&
            !(Testo(t, "DaAvvisare") ?? "").Contains("fra qualche minuto"));

        // un file che all'avvio non si leggeva: l'ha gia' detto l'avvio, non e' un conflitto
        string b = Cartella("Rotto");
        ScriviImpostazioni(true, b, null);
        Scrivi(FileDati(b), "{\"personale\":[{\"nome\":\"ROSSI MA");
        Stato u = Carica();
        u.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        u.Salva();
        Verifica("un file che all'avvio non si leggeva non e' un conflitto, ma avvisa",
            Testo(u, "ModificheInConflitto") == "False" && Pieno(Testo(u, "DaAvvisare")));
    }

    // S-1: la scrittura del file dei dati si ferma a meta' (qui un'altra maniglia
    // blocca il primo byte dopo la fine del file: la lettura passa, la scrittura
    // no). Quello che resta sul disco e' di questa sessione: il salvataggio dopo
    // lo ripara, invece di dire che l'ha cambiato un altro computer
    static void ScritturaAMeta()
    {
        // piu' di 4096 byte: una lettura piu' corta chiede comunque 4096 byte al
        // disco, e toccherebbe il byte bloccato
        const int quante = 60;
        string prima = ToJson(DatiCon(Molte(quante)));
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Scrivi(FileDati(c), prima);
        Stato s = Carica();
        s.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        SalvaConUnByteBloccato(s, FileDati(c));
        Verifica("(la scrittura si e' davvero fermata a meta')", s.UltimoErrore != "" && Leggi(FileDati(c)) != prima);
        s.Salva();
        List<string> nomi = Nomi(Json(FileDati(c)));
        Verifica("il salvataggio dopo ripara il file: c'e' l'elenco intero",
            s.UltimoErrore == "" && nomi.Count == quante + 1 && nomi.Contains("BIANCHI LUCA"));
        Verifica("e non dice che l'ha cambiato un altro computer",
            Testo(s, "DaAvvisare") == "" && Testo(s, "ErroreDati") == "");
        Stato t = Carica();
        Verifica("riaprendo si legge l'elenco intero",
            Testo(t, "ErroreDati") == "" && t.Personale.Count == quante + 1);

        // un cambio fatto altrove dopo la scrittura a meta' si riconosce ancora
        string altroPc = ToJson(DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"),
                                        Persona("VERDI ANNA", "anna.verdi@scuola.example")));
        string n = Cartella("Altro");
        ScriviImpostazioni(true, n, null);
        Scrivi(FileDati(n), prima);
        Stato u = Carica();
        u.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        SalvaConUnByteBloccato(u, FileDati(n));
        Scrivi(FileDati(n), altroPc);
        u.Salva();
        Verifica("un cambio fatto altrove dopo la scrittura a meta' non si sovrascrive",
            u.UltimoErrore != "" && Leggi(FileDati(n)) == altroPc);

        // un file che non si apre nemmeno (sola lettura) resta com'era, e dopo si salva
        string o = Cartella("SolaLettura");
        ScriviImpostazioni(true, o, null);
        Scrivi(FileDati(o), prima);
        Stato v = Carica();
        v.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        File.SetAttributes(FileDati(o), FileAttributes.ReadOnly);
        try { v.Salva(); }
        finally { File.SetAttributes(FileDati(o), FileAttributes.Normal); }
        Verifica("in sola lettura non scrive, e il file resta intero", v.UltimoErrore != "" && Leggi(FileDati(o)) == prima);
        v.Salva();
        Verifica("tolta la sola lettura, il salvataggio dopo scrive l'elenco",
            v.UltimoErrore == "" && Nomi(Json(FileDati(o))).Contains("BIANCHI LUCA"));
    }

    // Salva mentre un'altra maniglia blocca il primo byte dopo la fine del file
    static void SalvaConUnByteBloccato(Stato s, string file)
    {
        long fine = new FileInfo(file).Length;
        using (FileStream f = new FileStream(file, FileMode.Open, FileAccess.Read,
                                             FileShare.ReadWrite | FileShare.Delete))
        {
            f.Lock(fine, 1);
            try { s.Salva(); }
            finally { f.Unlock(fine, 1); }
        }
    }

    // A-51: numero di formato e chiavi sconosciute conservate
    static void ChiaviSconosciute()
    {
        string c = Cartella("Campanella");
        Dictionary<string, object> futuro = new Dictionary<string, object>();
        futuro["x"] = 1;
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["chiaveFutura"] = futuro;
        ScriviImpostazioni(true, c, altro);
        Dictionary<string, object> d = DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"));
        d["elencoFuturo"] = new object[] { 1, 2 };
        Scrivi(FileDati(c), ToJson(d));
        Stato s = Carica();
        s.Salva();
        Dictionary<string, object> imp = Json(Impostazioni());
        Dictionary<string, object> dati = Json(FileDati(c));
        Verifica("campanella.json ha il numero di formato", Numero(imp, "formato") >= 1);
        Verifica("il file dei dati anche", Numero(dati, "formato") >= 1);
        Verifica("una chiave sconosciuta di campanella.json resta", imp.ContainsKey("chiaveFutura"));
        Verifica("una chiave sconosciuta del file dei dati resta", dati.ContainsKey("elencoFuturo"));
        Verifica("l'elenco resta", Nomi(dati).Contains("ROSSI MARIO"));

        // e con i dati accanto al programma
        string errore;
        s.SpostaDati(false, "", out errore);
        imp = Json(Impostazioni());
        Verifica("in locale la chiave sconosciuta di campanella.json resta", imp.ContainsKey("chiaveFutura"));
        Verifica("quella del file dei dati segue i dati e non si perde",
            imp.ContainsKey("elencoFuturo") && !File.Exists(FileDati(c)));

        // e di nuovo nel Drive
        bool ok = s.SpostaDati(true, c, out errore);
        imp = Json(Impostazioni());
        dati = Json(FileDati(c));
        Verifica("tornando nel Drive la chiave del file dei dati torna li'", ok && dati.ContainsKey("elencoFuturo"));
        Verifica("e non resta in campanella.json", !imp.ContainsKey("elencoFuturo"));
        Verifica("quella di campanella.json invece resta dov'e'",
            imp.ContainsKey("chiaveFutura") && !dati.ContainsKey("chiaveFutura"));
    }

    // A-57: il nome del calendario segue i dati personali
    static void NomeCalendario()
    {
        string c = Cartella("Campanella");
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["calNome"] = "Orario Bianchi";
        ScriviImpostazioni(true, c, altro);
        Scrivi(FileDati(c), ToJson(DatiCon(Persona("BIANCHI ANNA", "anna.bianchi@scuola.example"))));
        Stato s = Carica();
        Verifica("il nome del calendario si ritrova dopo l'aggiornamento", s.CalNome == "Orario Bianchi");
        s.Salva();
        Verifica("con i dati nel Drive non sta in campanella.json", !Json(Impostazioni()).ContainsKey("calNome"));
        Verifica("sta nel file dei dati", Str(Json(FileDati(c)), "calNome") == "Orario Bianchi");
        Stato t = Carica();
        Verifica("e si rilegge da li'", t.CalNome == "Orario Bianchi");
        string errore;
        t.SpostaDati(false, "", out errore);
        Verifica("con i dati accanto al programma sta in campanella.json",
            Str(Json(Impostazioni()), "calNome") == "Orario Bianchi");
    }

    // A-57, dalla 1.4.6: il primo avvio salva subito (le condizioni d'uso nuove),
    // spesso prima che il Drive abbia portato il file dei dati
    static void NomeCalendarioDriveNonPronto()
    {
        string c = Cartella("Campanella");
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["calNome"] = "Orario Bianchi";
        ScriviImpostazioni(true, c, altro);          // come la 1.4.6: senza formato
        Stato s = Carica();
        Verifica("il file dei dati non c'e' ancora: DatiNonTrovati", s.DatiNonTrovati);
        Verifica("il nome del calendario si legge da campanella.json", s.CalNome == "Orario Bianchi");
        s.Salva();
        Verifica("salvando con il Drive non pronto il nome resta in campanella.json",
            Str(Json(Impostazioni()), "calNome") == "Orario Bianchi");

        // arriva il file dei dati della 1.4.6, che il nome non ce l'ha
        Scrivi(FileDati(c), ToJson(DatiCon(Persona("BIANCHI ANNA", "anna.bianchi@scuola.example"))));
        Stato t = Carica();
        Verifica("al prossimo avvio il nome del calendario c'e' ancora", t.CalNome == "Orario Bianchi");

        // il Drive sparisce proprio mentre si salva
        string via = Finto() + "-via";
        Directory.Move(Finto(), via);
        try { t.Salva(); }
        finally { Directory.Move(via, Finto()); }
        Verifica("neanche con il Drive sparito il nome si perde",
            t.UltimoErrore != "" && Str(Json(Impostazioni()), "calNome") == "Orario Bianchi");

        t.Salva();
        Verifica("scritto il file dei dati, il nome sta li'", Str(Json(FileDati(c)), "calNome") == "Orario Bianchi");
        Verifica("e non piu' in campanella.json", !Json(Impostazioni()).ContainsKey("calNome"));
    }

    // quello che si salva si rilegge uguale
    static void AndataERitorno()
    {
        ScriviImpostazioni(false, "", null);
        Stato s = Carica();
        s.TemaScuro = false;
        s.Dominio = "scuola.example";
        s.Dirigenza = "dirigente@scuola.example";
        s.Personale.Add(NuovaPersona("ROSSI MARIO", "mario.rossi@scuola.example"));
        s.CalNome = "Orario Rossi";
        s.Salva();
        Verifica("Salva riesce", s.UltimoErrore == "");
        Stato t = Carica();
        Verifica("si rilegge uguale", !t.TemaScuro && t.Dominio == "scuola.example" &&
            t.Dirigenza == "dirigente@scuola.example" && t.Personale.Count == 1 &&
            t.Personale[0].Email == "mario.rossi@scuola.example" && t.CalNome == "Orario Rossi" &&
            t.Drive == Finto());
    }

    // I giorni senza lezione (Orari, passo 4) sono testo libero: accanto alle
    // feste ci si scrive facilmente un permesso o il nome di un collega. Per
    // questo seguono i dati personali: con i dati nel Drive stanno nel file dei
    // dati, e campanella.json non li ha (lo promettono PRIVACY.md e la nota per
    // il DPO). La data del cambio d'orario e' solo una data: resta nelle
    // impostazioni. Si rileggono uguali (a capo compresi) e di partenza sono vuoti.
    static void CalendarioAndataERitorno()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Scrivi(FileDati(c), ToJson(DatiCon(Persona("BIANCHI ANNA", "anna.bianchi@scuola.example"))));
        Stato s = Carica();
        Verifica("di partenza niente giorni senza lezione e nessun cambio d'orario",
            Testo(s, "CalSospensioni") == "" && Testo(s, "CalValidoDal") == "");
        string sospensioni = "01/11/2026 Tutti i Santi\r\n23/12/2026-06/01/2027 Vacanze di \"Natale\"\r\n" +
                             "12/03/2027 permesso di BIANCHI\r\n# una nota\r\n";
        if (!Metti(s, "CalSospensioni", sospensioni) || !Metti(s, "CalValidoDal", "2026-10-05")) return;
        s.Salva();
        Verifica("Salva riesce", s.UltimoErrore == "");
        Dictionary<string, object> imp = Json(Impostazioni());
        Dictionary<string, object> dati = Json(FileDati(c));
        Verifica("con i dati nel Drive i giorni senza lezione stanno nel file dei dati",
            Str(dati, "calSospensioni") == sospensioni && !dati.ContainsKey("calValidoDal"));
        Verifica("e campanella.json non li ha (ha solo la data del cambio)",
            !imp.ContainsKey("calSospensioni") && Str(imp, "calValidoDal") == "2026-10-05" &&
            File.ReadAllText(Impostazioni()).IndexOf("BIANCHI") < 0);
        Stato t = Carica();
        Verifica("si rileggono uguali, a capo compresi",
            Testo(t, "CalSospensioni") == sospensioni && Testo(t, "CalValidoDal") == "2026-10-05");
        Metti(t, "CalValidoDal", "");
        t.Salva();
        Verifica("la spunta del cambio tolta resta tolta", Testo(Carica(), "CalValidoDal") == "");
        string errore;
        t.SpostaDati(false, "", out errore);
        Verifica("riportati i dati accanto al programma, vanno con loro in campanella.json",
            Str(Json(Impostazioni()), "calSospensioni") == sospensioni && Testo(Carica(), "CalSospensioni") == sospensioni);
        Stato u = Carica();
        string c2 = Cartella("Campanella2");
        u.SpostaDati(true, c2, out errore);
        Verifica("e rimandati nel Drive, lasciano campanella.json (" + errore + ")",
            !Json(Impostazioni()).ContainsKey("calSospensioni") && Str(Json(FileDati(c2)), "calSospensioni") == sospensioni);
    }

    // i colori delle etichette si salvano e si rileggono, anche "nessun colore"
    static void ColoriAndataERitorno()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Stato s = Carica();
        Verifica("le regole di partenza hanno ognuna il suo colore",
            ColoreDi(RegolaDi(s, "Dirigenza")) == "#cc3a21/#ffffff" &&
            ColoreDi(RegolaDi(s, "Colleghi")) == "#4a86e8/#000000" &&
            ColoreDi(RegolaDi(s, "Circolari")) == "#fad165/#000000");
        MettiColore(RegolaDi(s, "Dirigenza"), "#16a766/#000000");
        MettiColore(RegolaDi(s, "Circolari"), "");
        ColoriRuoli(s)["Docenti"] = "#fb4c2f/#000000";
        ColoriRuoli(s)["Tecnici"] = "";
        s.Salva();
        Verifica("Salva riesce", s.UltimoErrore == "");
        Dictionary<string, object> dati = Json(FileDati(c));
        Dictionary<string, object> imp = Json(Impostazioni());
        Verifica("il colore sta dentro la regola, nel file dei dati",
            Str(RegolaNelFile(dati, "Dirigenza"), "colore") == "#16a766/#000000");
        Verifica("anche nessun colore, scritto vuoto", Str(RegolaNelFile(dati, "Circolari"), "colore") == "");
        Dictionary<string, object> ruoli = imp.ContainsKey("coloriRuoli") ? imp["coloriRuoli"] as Dictionary<string, object> : null;
        Verifica("i colori dei ruoli scelti a mano stanno in campanella.json",
            ruoli != null && Str(ruoli, "Docenti") == "#fb4c2f/#000000" && Str(ruoli, "Tecnici") == "" &&
            ruoli.Count == 2 && !dati.ContainsKey("coloriRuoli"));
        Verifica("i due file hanno il formato di adesso (" + Stato.Formato + "), che la 1.5.2 (1) non riscrive",
            Numero(imp, "formato") == Stato.Formato && Numero(dati, "formato") == Stato.Formato && Stato.Formato > 1);

        Stato t = Carica();
        Verifica("si rileggono uguali",
            ColoreDi(RegolaDi(t, "Dirigenza")) == "#16a766/#000000" &&
            ColoreDi(RegolaDi(t, "Colleghi")) == "#4a86e8/#000000");
        Verifica("nessun colore resta nessun colore: non torna quello di partenza", ColoreDi(RegolaDi(t, "Circolari")) == "");
        Dictionary<string, string> letti = ColoriRuoli(t);
        Verifica("e i colori dei ruoli, compreso nessun colore",
            letti.Count == 2 && letti.ContainsKey("Docenti") && letti["Docenti"] == "#fb4c2f/#000000" &&
            letti.ContainsKey("Tecnici") && letti["Tecnici"] == "");
        t.Salva();
        Stato u = Carica();
        Verifica("anche dopo un altro salvataggio", ColoreDi(RegolaDi(u, "Circolari")) == "" &&
            ColoreDi(RegolaDi(u, "Dirigenza")) == "#16a766/#000000");
    }

    // le regole salvate dalla 1.5.2 non hanno il colore: prendono quello di partenza
    static void ColoriDalla15()
    {
        object[] regole =
        {
            RegolaJson("Dirigenza", "dirigenza", null), RegolaJson("Segreteria", "segreteria", null),
            RegolaJson("Registro ClasseViva", "registro", null),   // rinominata: la riconosce la sorgente
            RegolaJson("Circolari", "", null), RegolaJson("Colleghi", "", null),
            RegolaJson("Progetti", "", null), RegolaJson("orari", "", null), RegolaJson("Gite", "", null)
        };
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["formato"] = 1;
        altro["etichettaPerRuolo"] = true;
        altro["regole"] = regole;
        ScriviImpostazioni(false, "", altro);
        Stato s = Carica();
        ControllaColoriDalla15(s, "accanto al programma");
        s.Salva();
        Dictionary<string, object> imp = Json(Impostazioni());
        Verifica("salvando: formato di adesso, e ogni regola con il suo colore",
            Numero(imp, "formato") == Stato.Formato &&
            Str(RegolaNelFile(imp, "Registro ClasseViva"), "colore") == "#2da2bb/#000000" &&
            Str(RegolaNelFile(imp, "Gite"), "colore") == "#16a766/#000000");
        ControllaColoriDalla15(Carica(), "riletti");

        // lo stesso con i dati nel Drive: il file dei dati della 1.5.2 si aggiorna
        string c = Cartella("Campanella");
        Dictionary<string, object> soloImp = new Dictionary<string, object>();
        soloImp["formato"] = 1;
        soloImp["etichettaPerRuolo"] = true;
        ScriviImpostazioni(true, c, soloImp);
        Dictionary<string, object> d = DatiCon(Persona("ROSSI MARIO", "mario.rossi@scuola.example"));
        d["formato"] = 1;
        d["regole"] = regole;
        Scrivi(FileDati(c), ToJson(d));
        Stato t = Carica();
        ControllaColoriDalla15(t, "nel Drive");
        t.Salva();
        Dictionary<string, object> dati = Json(FileDati(c));
        Verifica("nel Drive il file dei dati passa al formato di adesso, con i colori",
            t.UltimoErrore == "" && Numero(dati, "formato") == Stato.Formato &&
            Str(RegolaNelFile(dati, "Dirigenza"), "colore") == "#cc3a21/#ffffff" && Nomi(dati).Contains("ROSSI MARIO"));
    }

    static void ControllaColoriDalla15(Stato s, string come)
    {
        Verifica(come + ": Dirigenza e Segreteria riprendono il colore di partenza",
            ColoreDi(RegolaDi(s, "Dirigenza")) == "#cc3a21/#ffffff" &&
            ColoreDi(RegolaDi(s, "Segreteria")) == "#ffad47/#000000");
        Verifica(come + ": il registro rinominato lo riconosce la sorgente",
            ColoreDi(RegolaDi(s, "Registro ClasseViva")) == "#2da2bb/#000000");
        Verifica(come + ": le altre di partenza dal nome, maiuscole a parte",
            ColoreDi(RegolaDi(s, "Circolari")) == "#fad165/#000000" &&
            ColoreDi(RegolaDi(s, "Colleghi")) == "#4a86e8/#000000" &&
            ColoreDi(RegolaDi(s, "orari")) == "#f691b3/#000000");
        Verifica(come + ": le regole tue, i primi colori liberi (" + ColoreDi(RegolaDi(s, "Progetti")) + ", " +
                 ColoreDi(RegolaDi(s, "Gite")) + ")",
            ColoreDi(RegolaDi(s, "Progetti")) == "#fb4c2f/#000000" && ColoreDi(RegolaDi(s, "Gite")) == "#16a766/#000000");
        // le sfumature di blu che le sottoetichette dei ruoli prendono da Colleghi
        List<string> sfondi = new List<string> { "#c9daf8", "#a4c2f4", "#6d9eeb", "#3c78d8", "#285bac" };
        bool diversi = true;
        foreach (Regola r in s.Regole)
        {
            string colore = ColoreDi(r) ?? "";
            string sfondo = colore.Split('/')[0];
            if (sfondo == "" || sfondi.Contains(sfondo)) diversi = false;
            sfondi.Add(sfondo);
        }
        Verifica(come + ": nessun colore ripetuto, nemmeno con le sottoetichette dei ruoli", diversi);
    }

    // un colore scritto a mano in campanella.json che Gmail non accetterebbe
    static void ColoriScrittiAMano()
    {
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["regole"] = new object[]
        {
            RegolaJson("Dirigenza", "dirigenza", "#123456/#ffffff"), RegolaJson("Circolari", "", "rosso"),
            RegolaJson("Colleghi", "", "  #4A86E8/#000000 "), RegolaJson("Gite", "", "#cc3a21")
        };
        Dictionary<string, object> ruoli = new Dictionary<string, object>();
        ruoli["Docenti"] = "#123456/#000000";
        ruoli["Tecnici"] = "#A4C2F4/#000000";
        ruoli["Inventata"] = "#cc3a21/#ffffff";
        altro["coloriRuoli"] = ruoli;
        ScriviImpostazioni(false, "", altro);
        Stato s = Carica();
        Verifica("un colore che Gmail non accetta diventa nessun colore",
            ColoreDi(RegolaDi(s, "Dirigenza")) == "" && ColoreDi(RegolaDi(s, "Circolari")) == "" &&
            ColoreDi(RegolaDi(s, "Gite")) == "");
        Verifica("maiuscole e spazi si sistemano", ColoreDi(RegolaDi(s, "Colleghi")) == "#4a86e8/#000000");
        Dictionary<string, string> letti = ColoriRuoli(s);
        Verifica("nei ruoli lo stesso, e una categoria che non esiste non resta",
            letti.ContainsKey("Docenti") && letti["Docenti"] == "" && letti.ContainsKey("Tecnici") &&
            letti["Tecnici"] == "#a4c2f4/#000000" && !letti.ContainsKey("Inventata"));
    }

    // I filtri di Gmail da togliere (Posta, passo 4) sono dati personali: i
    // criteri possono avere indirizzi. Stanno nel file dei dati, seguono i dati
    // quando cambiano posto e si rileggono uguali.
    static void FiltriAndataERitorno()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Stato s = Carica();
        Verifica("uno Stato letto da un file senza filtri non ne ha, e l'elenco c'e'", FiltriDi(s) != null && FiltriDi(s).Count == 0);
        AggiungiFiltro(s, "Famiglie", "query", "from:(@famiglie.example)");
        AggiungiFiltro(s, "Progetti", "to", "erasmus@scuola.example", "hasAttachment", "true",
                       "size", "5242880", "sizeComparison", "larger");
        s.Salva();
        Verifica("Salva riesce", s.UltimoErrore == "");
        Dictionary<string, object> dati = Json(FileDati(c));
        Verifica("i filtri stanno nel file dei dati, con etichetta e criteri",
            FiltriNelFile(dati) == "Famiglie{query=from:(@famiglie.example)}|" +
            "Progetti{hasAttachment=true,size=5242880,sizeComparison=larger,to=erasmus@scuola.example}");
        Verifica("e non in campanella.json, nemmeno un indirizzo",
            !Json(Impostazioni()).ContainsKey("filtriDaTogliere") && !Leggi(Impostazioni()).Contains("erasmus@"));
        Stato t = Carica();
        Verifica("si rileggono uguali (" + DescriviFiltri(t) + ")", DescriviFiltri(t) == DescriviFiltri(s) &&
            DescriviFiltri(t).StartsWith("Famiglie{query=from:(@famiglie.example)}|Progetti{"));

        string errore;
        t.SpostaDati(false, "", out errore);
        Verifica("con i dati accanto al programma stanno in campanella.json",
            FiltriNelFile(Json(Impostazioni())) == FiltriNelFile(dati) && !File.Exists(FileDati(c)));
        bool ok = t.SpostaDati(true, c, out errore);
        Verifica("e tornando nel Drive tornano nel file dei dati, e escono da campanella.json",
            ok && FiltriNelFile(Json(FileDati(c))) == FiltriNelFile(dati) &&
            !Json(Impostazioni()).ContainsKey("filtriDaTogliere"));
        if (FiltriDi(t) != null) FiltriDi(t).Clear();
        t.Salva();
        Verifica("tolti tutti, il file dei dati ha un elenco vuoto", FiltriNelFile(Json(FileDati(c))) == "" &&
            Json(FileDati(c)).ContainsKey("filtriDaTogliere"));
    }

    // un elenco scritto a mano, o rovinato: una voce che non si capisce del
    // tutto non si tiene a meta' (con un criterio in meno toglierebbe un altro filtro)
    static void FiltriScrittiAMano()
    {
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["filtriDaTogliere"] = new object[]
        {
            FiltroJson("Famiglie", Criteri("query", "  from:(@famiglie.example) ")),
            FiltroJson("Famiglie", Criteri("query", "from:(@famiglie.example)")),       // la stessa: una volta sola
            FiltroJson("", Criteri("from", "x@scuola.example")),                          // senza etichetta
            FiltroJson("Vuoto", Criteri()),                                               // senza criteri
            FiltroJson("Rotto", Criteri("from", new object[] { "a@scuola.example" })),    // un criterio che non si capisce
            FiltroJson("Allegati", Criteri("from", "b@scuola.example", "hasAttachment", "forse")),
            FiltroJson("Grandi", Criteri("size", 5242880, "sizeComparison", "LARGER", "hasAttachment", true,
                                         "excludeChats", false)),
            FiltroJson("Futuro", Criteri("from", "c@scuola.example", "deliveredTo", "io@scuola.example")),
            "non e' una voce"
        };
        ScriviImpostazioni(false, "", altro);
        Stato s = Carica();
        Verifica("tiene le voci buone, una volta sola (" + DescriviFiltri(s) + ")",
            DescriviFiltri(s) == "Famiglie{query=from:(@famiglie.example)}|" +
            "Grandi{hasAttachment=true,size=5242880,sizeComparison=larger}|" +
            "Futuro{deliveredTo=io@scuola.example,from=c@scuola.example}");
        s.Salva();
        Stato t = Carica();
        Verifica("e le riscrive cosi'", DescriviFiltri(t) == DescriviFiltri(s));
    }

    // Le regole delle classi (Posta, passo 4, "Le mie classi..."): basta
    // l'oggetto oppure gli studenti (UnoQualsiasi), la sorgente "classe" e fra
    // i mittenti solo il segnaposto della classe: gli indirizzi degli studenti
    // Campanella non li tiene. Si salvano e si rileggono uguali, e le altre
    // regole restano con i criteri insieme. La 1.5.3 (formato 2) riscrivendo
    // il file perderebbe UnoQualsiasi e la regola vorrebbe oggetto E studenti:
    // per questo il formato e' salito.
    static void ClassiAndataERitorno()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Stato s = Carica();
        Verifica("le regole di partenza non hanno UnoQualsiasi", !Uno(RegolaDi(s, "Circolari")) && !Uno(RegolaDi(s, "Colleghi")));
        Regola r = NuovaClasse("Classi 2026-27/3B", "3B");
        Regola copia = r.Copia();
        Verifica("Copia tiene UnoQualsiasi e la sorgente", Uno(copia) && copia.Sorgente == "classe");
        s.Regole.Add(r);
        s.Salva();
        Verifica("Salva riesce", s.UltimoErrore == "");
        Dictionary<string, object> dati = Json(FileDati(c));
        Dictionary<string, object> nelFile = RegolaNelFile(dati, "Classi 2026-27/3B");
        Verifica("nel file dei dati: unoQualsiasi vero, sorgente classe, e fra i mittenti solo il segnaposto (" +
                 ListaNelFile(nelFile, "da") + ")",
            Vero(nelFile, "unoQualsiasi") && Str(nelFile, "sorgente") == "classe" &&
            ListaNelFile(nelFile, "da") == "@CLASSE:3B@" && ListaNelFile(nelFile, "oggetto") == "3B|3 B|III B");
        Dictionary<string, object> circolari = RegolaNelFile(dati, "Circolari");
        Verifica("le altre regole con unoQualsiasi falso, come gli altri si'/no",
            circolari.ContainsKey("unoQualsiasi") && circolari["unoQualsiasi"] is bool && !Vero(circolari, "unoQualsiasi"));
        Verifica("i due file hanno il formato " + Stato.Formato + ", piu' alto di quello della 1.5.3 (2)",
            Numero(dati, "formato") == Stato.Formato && Numero(Json(Impostazioni()), "formato") == Stato.Formato &&
            Stato.Formato >= 3);

        Stato t = Carica();
        Regola l = RegolaDi(t, "Classi 2026-27/3B");
        Verifica("si rilegge uguale", l != null && Uno(l) && l.Sorgente == "classe" && l.Da.Count == 1 &&
            l.Da[0] == "@CLASSE:3B@" && string.Join("|", l.Oggetto.ToArray()) == "3B|3 B|III B" &&
            !Uno(RegolaDi(t, "Circolari")));
        t.Salva();
        Verifica("anche dopo un altro salvataggio", Uno(RegolaDi(Carica(), "Classi 2026-27/3B")));

        // una regola scritta da una versione di prima, senza la chiave: i
        // criteri insieme, come allora
        Dictionary<string, object> vecchia = RegolaJson("Verbali", "", null);
        vecchia["da"] = new object[] { "collega@scuola.example" };
        vecchia["oggetto"] = new object[] { "verbale" };
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["regole"] = new object[] { vecchia };
        ScriviImpostazioni(false, "", altro);
        Stato v = Carica();
        Verifica("una regola di prima, senza la chiave, resta con i criteri insieme", RegolaDi(v, "Verbali") != null &&
            !Uno(RegolaDi(v, "Verbali")));
    }

    // I colori delle etichette delle classi: sfumature di una tinta sola, che
    // nessun'altra regola usa, ognuna la sua finche' ce ne sono; un colore gia'
    // dato (anche nessun colore, scelto a mano) resta.
    static void ClassiColori()
    {
        Stato s = new Stato();                  // le regole di partenza, niente file
        Regola a = NuovaClasse("Classi 2026-27/1A", "1A");
        Regola b = NuovaClasse("Classi 2026-27/3B", "3B");
        Regola c = NuovaClasse("Classi 2026-27/5C", "5C");
        s.Regole.Add(a); s.Regole.Add(b); s.Regole.Add(c);
        ColoriDelleClassi(s);
        // le regole di partenza accese usano tutte le tinte intere tranne il
        // verde acqua (Formazione e' spenta): le classi prendono quello
        Verifica("tre sfumature del verde acqua, dalla piu' chiara (" + ColoreDi(a) + ", " + ColoreDi(b) + ", " +
                 ColoreDi(c) + ")",
            Sfondo(a) == "#c6f3de" && Sfondo(b) == "#a0eac9" && Sfondo(c) == "#68dfa9");
        MettiColore(b, "");
        Regola d = NuovaClasse("Classi 2026-27/4D", "4D");
        s.Regole.Add(d);
        ColoriDelleClassi(s);
        Verifica("un colore gia' dato resta, anche nessun colore, e la classe nuova prende la prima sfumatura libera (" +
                 ColoreDi(d) + ")",
            Sfondo(a) == "#c6f3de" && ColoreDi(b) == "" && Sfondo(c) == "#68dfa9" && Sfondo(d) == "#a0eac9");
        List<string> sfondi = new List<string>();
        for (int i = 0; i < 6; i++)
        {
            Regola x = NuovaClasse("Classi 2026-27/" + (i + 1) + "E", (i + 1) + "E");
            s.Regole.Add(x);
            ColoriDelleClassi(s);
            sfondi.Add(Sfondo(x));
        }
        Verifica("finche' ce ne sono ognuna la sua, saltando quella di Formazione, poi la meno usata (" + string.Join(" ", sfondi.ToArray()) + ")",
            sfondi[0] == "#3dc789" && sfondi[1] == "#2a9c68" && sfondi[2] == "#1a764d" &&
            sfondi[3] == "#43d692" && sfondi[4] == "#c6f3de" && sfondi[5] == "#a0eac9");

        // con poche regole: la prima tinta intera che nessuna usa
        Stato p = new Stato();
        p.Regole.Clear();
        Regola dirigenza = new Regola();
        dirigenza.Etichetta = "Dirigenza";
        dirigenza.Colore = "#cc3a21/#ffffff";
        p.Regole.Add(dirigenza);
        Regola e = NuovaClasse("Classi 2026-27/2A", "2A");
        p.Regole.Add(e);
        ColoriDelleClassi(p);
        Verifica("con le altre regole tutte rosse, le classi prendono gli arancioni (" + ColoreDi(e) + ")",
            Sfondo(e) == "#ffe6c7");
        // una classe con un colore scelto a mano: le altre la seguono
        MettiColore(e, "#c9daf8/#000000");
        Regola f = NuovaClasse("Classi 2026-27/2B", "2B");
        p.Regole.Add(f);
        ColoriDelleClassi(p);
        Verifica("una classe nuova segue la tinta delle classi che ci sono (" + ColoreDi(f) + ")", Sfondo(f) == "#a4c2f4");
    }

    // Le etichette madri usate per le classi (solo i nomi) restano anche tolte
    // le regole: servono a riconoscere un filtro di Gmail con gli studenti
    // sotto una madre scritta a mano (FiltriGmail.EtichettaDiUnaClasse)
    static void ClassiMadri()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Stato s = Carica();
        Verifica("uno Stato nuovo non ha madri delle classi", s.MadriClassi != null && s.MadriClassi.Count == 0);
        s.Regole.Add(NuovaClasse("Le mie classi/3B", "3B"));
        s.AggiungiMadreClassi("Classi 2026-27");
        s.AggiungiMadreClassi(" classi  2026-27/ ");
        Verifica("una madre si ricorda una volta, maiuscole e spazi a parte (" + string.Join("|", s.MadriClassi.ToArray()) + ")",
            string.Join("|", s.MadriClassi.ToArray()) == "Classi 2026-27");
        s.Salva();
        Dictionary<string, object> dati = Json(FileDati(c));
        Verifica("le madri stanno nel file dei dati, insieme alle regole",
            ListaNelFile(dati, "madriClassi") == "Classi 2026-27" && !Json(Impostazioni()).ContainsKey("madriClassi"));
        Stato t = Carica();
        Verifica("rilette, con quella della regola delle classi che c'e' (" + string.Join("|", t.MadriClassi.ToArray()) + ")",
            string.Join("|", t.MadriClassi.ToArray()) == "Classi 2026-27|Le mie classi");
        t.Regole.RemoveAll(delegate(Regola r) { return r.Sorgente == "classe"; });
        t.Salva();
        Verifica("e restano anche tolte le regole delle classi",
            string.Join("|", Carica().MadriClassi.ToArray()) == "Classi 2026-27|Le mie classi");

        // un file di prima della chiave, con una regola di una classe: la sua madre
        Dictionary<string, object> classe = RegolaJson("Corsi/Potenziamento", "classe", null);
        classe["da"] = new object[] { "@CLASSE:Potenziamento@" };
        Dictionary<string, object> altro = new Dictionary<string, object>();
        altro["regole"] = new object[] { classe, RegolaJson("Verbali/2026", "", null) };
        ScriviImpostazioni(false, "", altro);
        Verifica("da un file senza la chiave, le madri delle regole delle classi (" +
                 string.Join("|", Carica().MadriClassi.ToArray()) + ")",
            string.Join("|", Carica().MadriClassi.ToArray()) == "Corsi");
    }

    static void ColoriDelleClassi(Stato s)
    {
        Type t = typeof(Stato).Assembly.GetType("Campanella.ColoriEtichette");
        MethodInfo m = (t == null) ? null : t.GetMethod("DelleClassi", BindingFlags.Public | BindingFlags.Static);
        if (m == null) { Verifica("c'e' ColoriEtichette.DelleClassi", false); return; }
        m.Invoke(null, new object[] { s.Regole, ColoriRuoli(s) });
    }

    static string Sfondo(Regola r)
    {
        string c = ColoreDi(r) ?? "";
        return c.Split('/')[0];
    }

    static Regola NuovaClasse(string etichetta, string classe)
    {
        Regola r = new Regola();
        r.Etichetta = etichetta;
        r.Sorgente = "classe";
        r.Da.Add("@CLASSE:" + classe + "@");
        r.Oggetto.AddRange(new string[] { classe, classe.Substring(0, 1) + " " + classe.Substring(1), "III B" });
        MettiUno(r, true);
        return r;
    }

    // UnoQualsiasi si cerca per nome, come i colori: con uno Stato di prima
    // della 1.6.0 non c'e', e i controlli falliscono invece di non compilare
    static bool Uno(Regola r)
    {
        FieldInfo f = typeof(Regola).GetField("UnoQualsiasi");
        if (f == null) { Verifica("Regola ha il campo UnoQualsiasi", false); return false; }
        return r != null && (bool)f.GetValue(r);
    }

    static void MettiUno(Regola r, bool si)
    {
        FieldInfo f = typeof(Regola).GetField("UnoQualsiasi");
        if (f == null) { Verifica("Regola ha il campo UnoQualsiasi", false); return; }
        if (r != null) f.SetValue(r, si);
    }

    // un elenco di una regola nel file, con le voci separate da "|"
    static string ListaNelFile(Dictionary<string, object> regola, string k)
    {
        object[] a = regola.ContainsKey(k) ? regola[k] as object[] : null;
        if (a == null) return "(manca)";
        List<string> fuori = new List<string>();
        foreach (object o in a) fuori.Add(Convert.ToString(o));
        return string.Join("|", fuori.ToArray());
    }

    // la versione di adesso scrive i file: la prova dopo li da' a una versione
    // con il formato di prima, che non deve riscriverli
    static void ScriviPerLaVecchia()
    {
        string c = Cartella("Campanella");
        ScriviImpostazioni(true, c, null);
        Stato s = Carica();
        MettiColore(RegolaDi(s, "Circolari"), "");
        ColoriRuoli(s)["Docenti"] = "#fb4c2f/#000000";
        AggiungiFiltro(s, "Famiglie", "query", "from:(@famiglie.example)");
        s.Personale.Add(NuovaPersona("ROSSI MARIO", "mario.rossi@scuola.example"));
        s.Regole.Add(NuovaClasse("Classi 2026-27/3B", "3B"));
        s.Salva();
        Verifica("scritti con il formato di adesso (" + Stato.Formato + "), piu' alto di quello della 1.5.2",
            s.UltimoErrore == "" && Numero(Json(Impostazioni()), "formato") == Stato.Formato &&
            Numero(Json(FileDati(c)), "formato") == Stato.Formato && Stato.Formato > 1);
        Verifica("e il file dei dati ha i filtri di Gmail da togliere, che la 1.5.2 non conosce",
            FiltriNelFile(Json(FileDati(c))) == "Famiglie{query=from:(@famiglie.example)}");
        Verifica("e la regola della classe con unoQualsiasi, che la 1.5.3 non conosce",
            Vero(RegolaNelFile(Json(FileDati(c)), "Classi 2026-27/3B"), "unoQualsiasi"));
    }

    static void VecchiaNonRiscrive()
    {
        string c = Path.Combine(Finto(), "Campanella");
        string imp = Leggi(Impostazioni()), dati = Leggi(FileDati(c));
        Verifica("(la versione di adesso ha scritto i due file)", imp != null && dati != null);
        Stato s = Carica();
        Verifica("la versione con il formato " + Stato.Formato + " li riconosce come piu' recenti",
            Pieno(Testo(s, "ErroreImpostazioni")) && Pieno(Testo(s, "ErroreDati")));
        s.TemaScuro = !s.TemaScuro;
        s.Personale.Add(NuovaPersona("BIANCHI LUCA", "luca.bianchi@scuola.example"));
        s.Salva();
        Verifica("e non li riscrive: i colori delle regole e dei ruoli, i filtri da togliere e unoQualsiasi delle classi non si perdono",
            Leggi(Impostazioni()) == imp && Leggi(FileDati(c)) == dati);
        Verifica("e lo dice", (Testo(s, "DaAvvisare") ?? "").Contains("versione piu' recente"));
    }

    // ===================================================================
    //  ATTREZZI
    // ===================================================================

    // I campi dei colori si cercano per nome: con uno Stato di prima della
    // 1.5.3 non ci sono, e allora i controlli falliscono invece di non compilare.
    static string ColoreDi(Regola r)
    {
        FieldInfo f = typeof(Regola).GetField("Colore");
        if (f == null) { Verifica("Regola ha il campo Colore", false); return null; }
        return (r == null) ? null : f.GetValue(r) as string;
    }

    static void MettiColore(Regola r, string colore)
    {
        FieldInfo f = typeof(Regola).GetField("Colore");
        if (f == null) { Verifica("Regola ha il campo Colore", false); return; }
        if (r != null) f.SetValue(r, colore);
    }

    static Dictionary<string, string> ColoriRuoli(Stato s)
    {
        FieldInfo f = typeof(Stato).GetField("ColoriRuoli");
        if (f == null) { Verifica("Stato ha il campo ColoriRuoli", false); return new Dictionary<string, string>(); }
        Dictionary<string, string> d = f.GetValue(s) as Dictionary<string, string>;
        if (d == null) { d = new Dictionary<string, string>(); f.SetValue(s, d); }
        return d;
    }

    // I filtri di Gmail da togliere si cercano per nome, come i colori: con uno
    // Stato di prima non ci sono, e i controlli falliscono invece di non compilare.
    static IList FiltriDi(Stato s)
    {
        FieldInfo f = typeof(Stato).GetField("FiltriDaTogliere");
        if (f == null) { Verifica("Stato ha il campo FiltriDaTogliere", false); return null; }
        return f.GetValue(s) as IList;
    }

    static void AggiungiFiltro(Stato s, string etichetta, params string[] criteri)
    {
        Type t = typeof(Stato).Assembly.GetType("Campanella.FiltroDaTogliere");
        if (t == null) { Verifica("c'e' la classe FiltroDaTogliere", false); return; }
        object f = Activator.CreateInstance(t, true);
        t.GetField("Etichetta").SetValue(f, etichetta);
        Dictionary<string, string> c = t.GetField("Criteri").GetValue(f) as Dictionary<string, string>;
        for (int i = 0; i + 1 < criteri.Length; i += 2) c[criteri[i]] = criteri[i + 1];
        IList elenco = FiltriDi(s);
        if (elenco != null) elenco.Add(f);
    }

    // "Etichetta{chiave=valore,...}|..." con le chiavi in ordine
    static string DescriviFiltri(Stato s)
    {
        IList elenco = FiltriDi(s);
        if (elenco == null) return "(null)";
        List<string> fuori = new List<string>();
        foreach (object f in elenco)
        {
            Type t = f.GetType();
            Dictionary<string, string> c = t.GetField("Criteri").GetValue(f) as Dictionary<string, string>;
            List<string> coppie = new List<string>();
            foreach (KeyValuePair<string, string> kv in c) coppie.Add(kv.Key + "=" + kv.Value);
            coppie.Sort(StringComparer.Ordinal);
            fuori.Add(t.GetField("Etichetta").GetValue(f) + "{" + string.Join(",", coppie.ToArray()) + "}");
        }
        return string.Join("|", fuori.ToArray());
    }

    // lo stesso, dal file
    static string FiltriNelFile(Dictionary<string, object> file)
    {
        object[] a = file.ContainsKey("filtriDaTogliere") ? file["filtriDaTogliere"] as object[] : null;
        if (a == null) return "(manca)";
        List<string> fuori = new List<string>();
        foreach (object o in a)
        {
            Dictionary<string, object> d = o as Dictionary<string, object>;
            Dictionary<string, object> c = (d != null && d.ContainsKey("criteri")) ? d["criteri"] as Dictionary<string, object> : null;
            if (c == null) { fuori.Add("(voce strana)"); continue; }
            List<string> coppie = new List<string>();
            foreach (KeyValuePair<string, object> kv in c) coppie.Add(kv.Key + "=" + Convert.ToString(kv.Value));
            coppie.Sort(StringComparer.Ordinal);
            fuori.Add(Str(d, "etichetta") + "{" + string.Join(",", coppie.ToArray()) + "}");
        }
        return string.Join("|", fuori.ToArray());
    }

    static Dictionary<string, object> FiltroJson(string etichetta, Dictionary<string, object> criteri)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["etichetta"] = etichetta;
        d["criteri"] = criteri;
        return d;
    }

    static Dictionary<string, object> Criteri(params object[] coppie)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        for (int i = 0; i + 1 < coppie.Length; i += 2) d[(string)coppie[i]] = coppie[i + 1];
        return d;
    }

    static Regola RegolaDi(Stato s, string etichetta)
    {
        foreach (Regola r in s.Regole) if (r.Etichetta == etichetta) return r;
        return null;
    }

    // una regola come la scrive la 1.5.2 (colore == null: senza la chiave)
    static Dictionary<string, object> RegolaJson(string etichetta, string sorgente, string colore)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["etichetta"] = etichetta; d["descrizione"] = ""; d["attiva"] = true;
        d["da"] = new object[0]; d["oggetto"] = new object[0]; d["contiene"] = new object[0];
        d["escludi"] = new object[0]; d["query"] = ""; d["archivia"] = false; d["lette"] = false;
        d["sorgente"] = sorgente;
        if (colore != null) d["colore"] = colore;
        return d;
    }

    static Dictionary<string, object> RegolaNelFile(Dictionary<string, object> file, string etichetta)
    {
        object[] a = file.ContainsKey("regole") ? file["regole"] as object[] : null;
        if (a != null)
            foreach (object o in a)
            {
                Dictionary<string, object> r = o as Dictionary<string, object>;
                if (r != null && Str(r, "etichetta") == etichetta) return r;
            }
        return new Dictionary<string, object>();
    }
    static void Verifica(string testo, bool ok)
    {
        if (ok) Console.WriteLine("  OK      " + testo);
        else { Console.WriteLine("  FALLITO " + testo); fallimenti++; }
    }

    static string Impostazioni() { return Path.Combine(Base, "campanella.json"); }
    static string Finto() { return Path.Combine(Base, "drive"); }
    static string FileDati(string cartella) { return Path.Combine(cartella, "campanella-dati.json"); }

    static string Cartella(string nome)
    {
        string c = Path.Combine(Finto(), nome);
        Directory.CreateDirectory(c);
        return c;
    }

    static void Scrivi(string p, string testo) { File.WriteAllText(p, testo, utf8); }
    static string Leggi(string p) { return File.Exists(p) ? File.ReadAllText(p, Encoding.UTF8) : null; }
    static string ToJson(object o) { return ser.Serialize(o); }

    static Dictionary<string, object> Json(string p)
    {
        try { return ser.DeserializeObject(Leggi(p)) as Dictionary<string, object> ?? new Dictionary<string, object>(); }
        catch { return new Dictionary<string, object>(); }
    }

    static bool Pieno(string s) { return !string.IsNullOrEmpty(s); }

    static string Str(Dictionary<string, object> d, string k)
    {
        return (d.ContainsKey(k) && d[k] != null) ? Convert.ToString(d[k]) : null;
    }

    static bool Vero(Dictionary<string, object> d, string k)
    {
        return d.ContainsKey(k) && d[k] is bool && (bool)d[k];
    }

    static int Numero(Dictionary<string, object> d, string k)
    {
        try { return d.ContainsKey(k) ? Convert.ToInt32(d[k]) : -1; } catch { return -1; }
    }

    static Dictionary<string, object> Persona(string nome, string email)
    {
        Dictionary<string, object> p = new Dictionary<string, object>();
        p["nome"] = nome; p["ruolo"] = "DOCENTE"; p["email"] = email; p["incluso"] = true;
        return p;
    }

    static Persona NuovaPersona(string nome, string email)
    {
        Persona p = new Persona();
        p.Nome = nome; p.Ruolo = "DOCENTE"; p.Email = email;
        return p;
    }

    static object[] Elenco(params Dictionary<string, object>[] persone) { return persone; }

    // un elenco lungo di persone inventate
    static Dictionary<string, object>[] Molte(int quante)
    {
        Dictionary<string, object>[] fuori = new Dictionary<string, object>[quante];
        for (int i = 0; i < quante; i++)
            fuori[i] = Persona("DOCENTE NUMERO " + (i + 1), "docente" + (i + 1) + "@scuola.example");
        return fuori;
    }

    static Dictionary<string, object> DatiCon(params Dictionary<string, object>[] persone)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["personale"] = persone;
        return d;
    }

    static List<string> Nomi(Dictionary<string, object> d)
    {
        List<string> fuori = new List<string>();
        object[] a = d.ContainsKey("personale") ? d["personale"] as object[] : null;
        if (a == null) return fuori;
        foreach (object o in a)
        {
            Dictionary<string, object> p = o as Dictionary<string, object>;
            if (p != null && p.ContainsKey("nome")) fuori.Add(Convert.ToString(p["nome"]));
        }
        return fuori;
    }

    // accanto all'ospite solo quello che ci si aspetta: niente .bak, niente .tmp
    static bool SoloAttesi()
    {
        foreach (string f in Directory.GetFiles(Base))
        {
            string n = Path.GetFileName(f).ToLowerInvariant();
            if (n != "provastato.exe" && n != "campanella.json") { Console.WriteLine("          (in piu': " + n + ")"); return false; }
        }
        return true;
    }

    // campanella.json di partenza: il Drive e' sempre quello finto
    static void ScriviImpostazioni(bool nelDrive, string cartellaDati, Dictionary<string, object> altro)
    {
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["consensoVersione"] = 3;
        r["drive"] = Finto();
        r["datiNelDrive"] = nelDrive;
        r["cartellaDati"] = cartellaDati ?? "";
        if (altro != null) foreach (KeyValuePair<string, object> kv in altro) r[kv.Key] = kv.Value;
        Scrivi(Impostazioni(), ToJson(r));
    }

    // la regola delle prove: appena creato, lo Stato guarda solo il Drive finto
    static Stato Carica()
    {
        Stato s = Stato.Carica();
        s.Drive = Finto();
        return s;
    }

    static string Testo(object o, string nome)
    {
        FieldInfo f = o.GetType().GetField(nome, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        if (f == null) { Verifica("Stato ha il campo " + nome, false); return null; }
        object v = f.GetValue(o);
        return (v == null) ? "" : v.ToString();
    }

    static bool Metti(object o, string nome, object valore)
    {
        FieldInfo f = o.GetType().GetField(nome, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        if (f == null) { Verifica("Stato ha il campo " + nome, false); return false; }
        f.SetValue(o, valore);
        return true;
    }

    static object Chiama(object o, string nome, object[] argomenti)
    {
        foreach (MethodInfo m in o.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
            if (m.Name == nome && m.GetParameters().Length == argomenti.Length) return m.Invoke(o, argomenti);
        Verifica("Stato ha il metodo " + nome + " con " + argomenti.Length + " argomenti", false);
        return null;
    }
}
'@

$casi = @(
    'nuovo'
    'dati-mancanti'
    'dati-mancanti-e-nuovi'
    'dati-troncati'
    'dati-non-json'
    'dati-vuoti'
    'dati-bloccati'
    'dati-piu-recenti'
    'impostazioni-illeggibili'
    'impostazioni-vuote'
    'impostazioni-piu-recenti'
    'scrittura-atomica'
    'sposta-su-esistente'
    'usa-esistente'
    'cambia-cartella'
    'sposta-fallito'
    'torna-locale'
    'torna-locale-illeggibile'
    'cambiato-dopo-l-avvio'
    'cambiato-e-spostato'
    'conflitto-alla-chiusura'
    'scrittura-a-meta'
    'chiavi-sconosciute'
    'nome-calendario'
    'nome-calendario-drive-non-pronto'
    'andata-e-ritorno'
    'calendario-andata-e-ritorno'
    'colori-andata-e-ritorno'
    'colori-dalla-1-5'
    'colori-scritti-a-mano'
    'filtri-andata-e-ritorno'
    'filtri-scritti-a-mano'
    'classi-andata-e-ritorno'
    'classi-colori'
    'classi-madri'
)

$base = Join-Path $env:TEMP ('campanella-prova-stato-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $base | Out-Null
$fallimenti = 0
try {
    $sorgente = Join-Path $base 'ProvaStato.cs'
    [System.IO.File]::WriteAllText($sorgente, $ospite, (New-Object System.Text.UTF8Encoding($false)))
    $exe = Join-Path $base 'ProvaStato.exe'
    Write-Host "Compilo l'ospite con $Stato" -ForegroundColor Cyan
    & $csc /nologo /target:exe /codepage:65001 "/out:$exe" /r:System.dll /r:System.Core.dll `
        /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll $Stato $sorgente
    if ($LASTEXITCODE -ne 0) { throw "Compilazione dell'ospite fallita (codice $LASTEXITCODE)." }

    foreach ($caso in $casi) {
        Write-Host "`n$($caso.ToUpperInvariant())" -ForegroundColor Cyan
        $dove = Join-Path $base $caso
        New-Item -ItemType Directory -Path $dove | Out-Null
        Copy-Item $exe -Destination $dove
        $uscita = & (Join-Path $dove 'ProvaStato.exe') $caso
        $codice = $LASTEXITCODE
        foreach ($riga in $uscita) {
            if ($riga -like '  FALLITO*') { Write-Host $riga -ForegroundColor Red } else { Write-Host $riga }
        }
        if ($codice -gt 0 -and $codice -lt 1000) { $fallimenti += $codice }
        elseif ($codice -ne 0) { Write-Host "  FALLITO l'ospite si e' fermato (codice $codice)" -ForegroundColor Red; $fallimenti++ }
    }

    # -----------------------------------------------------------------------
    #  LA PROTEZIONE DELLE VERSIONI DI PRIMA
    #  La 1.5.2 ha il formato 1 e non sa niente dei colori ne' dei filtri di
    #  Gmail da togliere; la 1.5.3 ha il formato 2 e non sa niente di
    #  unoQualsiasi, che hanno le regole delle classi: riscrivendo i file di
    #  adesso li perderebbero. Qui gira una copia di questo stesso Stato.cs
    #  con ogni formato di prima, nella cartella dove la versione di adesso ha
    #  appena scritto i suoi file: deve lasciarli come sono.
    # -----------------------------------------------------------------------
    Write-Host "`nPROTEZIONE-VERSIONE-VECCHIA" -ForegroundColor Cyan
    $testoStato = [System.IO.File]::ReadAllText($Stato)
    $modello = 'public const int Formato = (\d+);'
    if (-not [regex]::IsMatch($testoStato, $modello)) {
        Write-Host "  FALLITO in $Stato non trovo '$modello'" -ForegroundColor Red
        $fallimenti++
    } else {
        $adesso = [int][regex]::Match($testoStato, $modello).Groups[1].Value
        for ($vecchio = 1; $vecchio -lt $adesso; $vecchio++) {
            Write-Host "  (con il formato $vecchio)"
            $vecchioStato = Join-Path $base "StatoFormato$vecchio.cs"
            [System.IO.File]::WriteAllText($vecchioStato, [regex]::Replace($testoStato, $modello, "public const int Formato = $vecchio;"),
                (New-Object System.Text.UTF8Encoding($false)))
            $exeVecchio = Join-Path $base "ProvaStatoVecchia$vecchio.exe"
            & $csc /nologo /target:exe /codepage:65001 "/out:$exeVecchio" /r:System.dll /r:System.Core.dll `
                /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll $vecchioStato $sorgente
            if ($LASTEXITCODE -ne 0) { throw "Compilazione dell'ospite con Formato = $vecchio fallita (codice $LASTEXITCODE)." }
            $dove = Join-Path $base "protezione-versione-vecchia-$vecchio"
            New-Item -ItemType Directory -Path $dove | Out-Null
            Copy-Item $exe -Destination $dove
            Copy-Item $exeVecchio -Destination (Join-Path $dove 'ProvaStatoVecchia.exe')
            foreach ($passo in @(@('ProvaStato.exe', 'scrivi-per-la-vecchia'), @('ProvaStatoVecchia.exe', 'vecchia-non-riscrive'))) {
                $uscita = & (Join-Path $dove $passo[0]) $passo[1]
                $codice = $LASTEXITCODE
                foreach ($riga in $uscita) {
                    if ($riga -like '  FALLITO*') { Write-Host $riga -ForegroundColor Red } else { Write-Host $riga }
                }
                if ($codice -gt 0 -and $codice -lt 1000) { $fallimenti += $codice }
                elseif ($codice -ne 0) { Write-Host "  FALLITO l'ospite si e' fermato (codice $codice)" -ForegroundColor Red; $fallimenti++ }
            }
        }
    }
}
finally {
    Remove-Item $base -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
