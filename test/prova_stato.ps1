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
    come fa l'applicazione, e guarda che cosa e' rimasto sul disco.
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
                case "chiavi-sconosciute": ChiaviSconosciute(); break;
                case "nome-calendario": NomeCalendario(); break;
                case "nome-calendario-drive-non-pronto": NomeCalendarioDriveNonPronto(); break;
                case "andata-e-ritorno": AndataERitorno(); break;
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
        futuro["formato"] = 2;
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

    // ===================================================================
    //  ATTREZZI
    // ===================================================================
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
    'chiavi-sconosciute'
    'nome-calendario'
    'nome-calendario-drive-non-pronto'
    'andata-e-ritorno'
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
}
finally {
    Remove-Item $base -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
