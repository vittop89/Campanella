// ===========================================================================
//  Stato.cs - i dati dell'applicazione e il loro salvataggio
//
//  Tutto quello che l'utente inserisce vive qui dentro. Le impostazioni
//  vanno in "campanella.json", accanto all'eseguibile. I dati personali di
//  altre persone (l'elenco del personale, gli indirizzi della dirigenza e
//  della segreteria, gli orari con i cognomi) possono restare nello stesso
//  file oppure, se l'utente lo chiede, andare in "campanella-dati.json"
//  dentro la cartella del Drive: cosi' sul computer non resta niente fuori
//  dall'account della scuola, e le stesse impostazioni si ritrovano su
//  tutti i computer che sincronizzano quel Drive.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Campanella
{
    // =======================================================================
    //  MODELLI
    // =======================================================================

    class Persona
    {
        public string Nome = "";
        public string Ruolo = "";
        public string Email = "";
        public bool Incluso = true;
        public bool Verificato = false;   // l'indirizzo e' stato visto davvero nella casella
    }

    /// <summary>Come e' andato il confronto fra l'elenco e gli indirizzi veri.</summary>
    class EsitoConfronto
    {
        public int Confermati = 0;      // l'indirizzo che c'era e' quello giusto
        public int Corretti = 0;        // l'ho sostituito con quello vero
        public int NonTrovati = 0;      // nella casella non compare nessuno che gli somigli
        public int Ambigui = 0;         // piu' indirizzi possibili: meglio non scegliere io
        public List<string> Cambiati = new List<string>();
        public List<string> Mancanti = new List<string>();
        public string SchemaPiuUsato = "";
        public int QuantiSchema = 0;
    }

    class Regola
    {
        public string Etichetta = "";
        public string Descrizione = "";
        public bool Attiva = true;
        public List<string> Da = new List<string>();
        public List<string> Oggetto = new List<string>();
        public List<string> Contiene = new List<string>();
        public List<string> EscludiEtichette = new List<string>();
        public string QueryLibera = "";
        public bool Archivia = false;
        public bool SegnaComeLette = false;
        // basta uno dei due criteri: il testo (oggetto o parole) oppure i
        // mittenti, invece di tutti e due insieme. L'hanno le regole delle
        // classi: la 3B nell'oggetto, da chiunque, oppure uno studente della 3B
        public bool UnoQualsiasi = false;
        // "dirigenza" | "segreteria" | "registro": i mittenti di queste regole
        // arrivano dai campi della pagina "La tua scuola". "classe": una regola
        // di "Le mie classi..." (passo 4), che fra i mittenti ha solo il
        // segnaposto @CLASSE:3B@. "": una regola come le altre
        public string Sorgente = "";
        // il colore dell'etichetta in Gmail, "sfondo/testo" dalla tavolozza di
        // Gmail (ColoriEtichette); "" = nessun colore, scelto apposta; null =
        // mai scelto (le regole salvate fino alla 1.5.2): Carica gli da' quello
        // di partenza
        public string Colore = null;

        /// <summary>La sorgente delle regole delle classi (Posta, passo 4, "Le mie classi...").</summary>
        public const string SorgenteClasse = "classe";

        public Regola Copia()
        {
            Regola r = new Regola();
            r.Etichetta = Etichetta; r.Descrizione = Descrizione; r.Attiva = Attiva;
            r.Da = new List<string>(Da); r.Oggetto = new List<string>(Oggetto);
            r.Contiene = new List<string>(Contiene);
            r.EscludiEtichette = new List<string>(EscludiEtichette);
            r.QueryLibera = QueryLibera; r.Archivia = Archivia;
            r.SegnaComeLette = SegnaComeLette; r.UnoQualsiasi = UnoQualsiasi;
            r.Sorgente = Sorgente;
            r.Colore = Colore;
            return r;
        }

        /// <summary>
        /// Vero se i mittenti arrivano dalla pagina "La tua scuola" (Dirigenza,
        /// Segreteria, Registro elettronico): la regola non li ha dentro. Quelle
        /// delle classi e le altre li hanno nella regola.
        /// </summary>
        public bool MittentiDallaScuola()
        {
            return Sorgente == "dirigenza" || Sorgente == "segreteria" || Sorgente == "registro";
        }
    }

    /// <summary>
    /// Un filtro di Gmail che l'utente aveva gia' e che ha scelto di togliere
    /// (Posta, passo 4): l'etichetta che mette e i suoi criteri, con i nomi
    /// del servizio Gmail API (from, to, subject, query, negatedQuery,
    /// hasAttachment, excludeChats, size, sizeComparison). Lo script
    /// (EXTRA_togliFiltri) toglie solo il filtro che ha proprio questi criteri,
    /// nessuno in piu', e mette proprio questa etichetta. I criteri possono
    /// avere indirizzi: e' un dato personale, e sta con l'elenco del personale.
    /// </summary>
    class FiltroDaTogliere
    {
        public string Etichetta = "";
        /// <summary>nome del criterio -> valore, come lo scrive Valore ("true" per i si'/no, i byte per size)</summary>
        public Dictionary<string, string> Criteri = new Dictionary<string, string>();

        /// <summary>I criteri che Gmail conosce, nell'ordine in cui si scrivono.</summary>
        public static readonly string[] NomiCriteri =
            { "from", "to", "subject", "query", "negatedQuery", "hasAttachment", "excludeChats", "size", "sizeComparison" };

        /// <summary>
        /// Il valore di un criterio come lo tiene Campanella: "" se e' come se
        /// il criterio non ci fosse (vuoto, falso, zero, 'unspecified'), null
        /// se non si capisce (un elenco, un si'/no scritto male, un nome che non
        /// e' un nome). Una voce con un criterio che non si capisce non si tiene
        /// a meta': con un criterio in meno lo script toglierebbe un altro filtro.
        /// </summary>
        public static string Valore(string nome, object valore)
        {
            if (nome == null || !Regex.IsMatch(nome, "^[A-Za-z][A-Za-z0-9]*$")) return null;
            if (valore == null) return "";
            bool testo = valore is string, siNo = valore is bool;
            bool numero = valore is int || valore is long || valore is decimal || valore is double;
            if (!testo && !siNo && !numero) return null;
            string v = Convert.ToString(valore, CultureInfo.InvariantCulture).Trim();
            if (nome == "hasAttachment" || nome == "excludeChats")
            {
                if (v.Equals("true", StringComparison.OrdinalIgnoreCase)) return "true";
                if (v == "" || v.Equals("false", StringComparison.OrdinalIgnoreCase)) return "";
                return null;
            }
            if (nome == "size")
            {
                long n;
                if (v == "") return "";
                if (!long.TryParse(v, NumberStyles.None, CultureInfo.InvariantCulture, out n)) return null;
                return (n > 0) ? n.ToString(CultureInfo.InvariantCulture) : "";
            }
            if (siNo || numero) return null;          // un testo scritto come si'/no o numero
            if (nome == "sizeComparison")
            {
                v = v.ToLowerInvariant();
                return (v == "unspecified") ? "" : v;
            }
            return v;
        }

        /// <summary>
        /// Un filtro dai criteri letti (nome -> valore qualsiasi): null se
        /// l'etichetta manca, se non resta nessun criterio o se uno non si capisce.
        /// </summary>
        public static FiltroDaTogliere Da(string etichetta, IEnumerable<KeyValuePair<string, object>> criteri)
        {
            FiltroDaTogliere f = new FiltroDaTogliere();
            f.Etichetta = (etichetta ?? "").Trim();
            if (f.Etichetta == "" || criteri == null) return null;
            foreach (KeyValuePair<string, object> kv in criteri)
            {
                string v = Valore(kv.Key, kv.Value);
                if (v == null) return null;
                if (v != "") f.Criteri[kv.Key] = v;
            }
            // il confronto con il minore o maggiore vale solo con una dimensione
            if (!f.Criteri.ContainsKey("size")) f.Criteri.Remove("sizeComparison");
            return (f.Criteri.Count > 0) ? f : null;
        }

        /// <summary>
        /// Etichetta (senza maiuscole) e criteri in ordine, con gli spazi in fila
        /// come uno solo: due filtri con la stessa chiave sono lo stesso filtro,
        /// come per lo script.
        /// </summary>
        public string Chiave()
        {
            List<string> nomi = new List<string>(Criteri.Keys);
            nomi.Sort(StringComparer.Ordinal);
            StringBuilder sb = new StringBuilder((Etichetta ?? "").Trim().ToLowerInvariant());
            foreach (string n in nomi) sb.Append('\n').Append(n).Append('=').Append(Regex.Replace(Criteri[n] ?? "", @"\s+", " ").Trim());
            return sb.ToString();
        }

        public FiltroDaTogliere Copia()
        {
            FiltroDaTogliere f = new FiltroDaTogliere();
            f.Etichetta = Etichetta;
            f.Criteri = new Dictionary<string, string>(Criteri);
            return f;
        }
    }

    /// <summary>Un "Il mio Drive" trovato sul computer, e di chi e'.</summary>
    class DriveTrovato
    {
        public string Percorso = "";
        public string Account = "";      // l'indirizzo, se Windows lo scrive nell'etichetta dell'unita'
        public bool ConModelli = false;
        public bool ConAnni = false;
        public int Punti = 0;

        /// <summary>"H:\Il mio Drive  (tizio@scuola.it)"</summary>
        public string Descrizione()
        {
            return Percorso + ((Account != "") ? "  (" + Account + ")" : "");
        }
    }

    /// <summary>Una casella dell'orario: chi, quando, con chi.</summary>
    class Lezione
    {
        public string Docente = "";
        public int Giorno = 0;        // il giorno della settimana, 0 = lunedi' (non la colonna)
        public int Ora = 1;           // 1 = prima ora
        public string Classe = "";

        public static readonly string[] Giorni =
        { "Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'", "Sabato", "Domenica" };
    }

    // =======================================================================
    //  STATO GENERALE
    // =======================================================================
    class Stato
    {
        public const string NomeFile = "campanella.json";
        public const string NomeFileDati = "campanella-dati.json";

        // ---- aspetto -------------------------------------------------------
        public bool TemaScuro = true;

        // ---- condizioni d'uso accettate ------------------------------------
        public int ConsensoVersione = 0;
        public string ConsensoData = "";

        // ---- dove stanno i dati personali ----------------------------------
        /// <summary>Vero = elenco del personale, indirizzi e orari vanno in
        /// campanella-dati.json dentro CartellaDati (di norma nel Drive).</summary>
        public bool DatiNelDrive = false;
        public string CartellaDati = "";

        // ---- la scuola -----------------------------------------------------
        public string Dominio = "";
        public string Prefisso = "";           // gruppo delle etichette: vuoto = nomi diretti (passo 4)
        public bool EtichettaPerRuolo = false; // sottoetichette Colleghi/Docenti, Colleghi/Amministrativi...
        // i colori delle sottoetichette dei ruoli scelti a mano: categoria ->
        // colore ("" = nessun colore). Le categorie che non ci sono prendono
        // una sfumatura del colore di Colleghi (ColoriEtichette.DelRuolo)
        public Dictionary<string, string> ColoriRuoli = new Dictionary<string, string>();
        public string Dirigenza = "";          // dato personale
        public string Segreteria = "";         // dato personale
        public string Registro = "@spaggiari.eu";

        // ---- personale (dato personale) --------------------------------------
        public List<Persona> Personale = new List<Persona>();
        public string SchemaEmail = "{nome}.{cognome}";
        public int OrdineNominativo = 0;   // 0 = COGNOME NOME

        // ---- regole della posta (possono contenere indirizzi) ----------------
        public List<Regola> Regole = RegoleDiDefault();
        public bool Prova = true;
        public bool Report = true;
        public bool EscludiInviata = true;
        public bool Filtri = false;
        public int Periodo = 0;
        public int Ore = 1;
        public List<bool> SpunteInstallazione = new List<bool>();
        public string CodiceStatoPosta = "";     // incollato dall'utente
        // i filtri di Gmail che l'utente aveva gia' e vuole togliere (dato
        // personale: i criteri possono avere indirizzi)
        public List<FiltroDaTogliere> FiltriDaTogliere = new List<FiltroDaTogliere>();
        // le etichette madri usate per le classi ("Classi 2026-27", "Le mie
        // classi"): solo nomi di etichette. Restano anche tolte le regole, cosi'
        // un filtro di Gmail con gli studenti sotto una di queste si riconosce
        // (FiltriGmail.EtichettaDiUnaClasse) e non si puo' scegliere
        public List<string> MadriClassi = new List<string>();

        // ---- cartelle (generatore anno scolastico) --------------------------
        // Vuoto finche' Carica non lo legge dal file o, se non c'e' niente di
        // salvato, non lo cerca sul computer: un "new Stato()" non deve andare
        // a frugare nelle unita', e una prova non deve finire nel Drive vero.
        public string Drive = "";
        public string Anno = "";                 // vuoto = quello calcolato dalla data
        public string Classi = "";
        public string CartelleExtra = "";

        // ---- moduli Google (lo script che collega il foglio dell'anno) ------
        public string ModuloPercorso = "";       // relativo al Drive, oppure solo il nome
        public string ModuloCartella = "";       // dentro la cartella dell'anno
        public string ModuloFoglio = "";         // nome del foglio, puo' contenere {anno}
        public const string ModuloChiusuraDiDefault = "31/08";   // l'unico posto dove sta scritto (anche per ScriptModuli)
        public string ModuloChiusura = ModuloChiusuraDiDefault;  // giorno/mese della chiusura automatica
        public bool ModuloChiudi = true;         // falso = nessuna chiusura automatica
        public bool ModuloSvuota = false;
        public bool ModuloDrive = true;

        // ---- anonimizzazione (rizzo-pii) -------------------------------------
        public const string AnonIndirizzoDiDefault = "http://127.0.0.1:5005";   // l'unico posto dove sta scritto
        public string AnonIndirizzo = AnonIndirizzoDiDefault;
        public string AnonDestinazione = "";
        public bool AnonReversibileTesto = true;
        public bool PrivacyLetta = false;

        // ---- orari -----------------------------------------------------------
        public List<Lezione> Lezioni = new List<Lezione>();   // dato personale (cognomi)
        public List<int> GiorniOrari = new List<int>();       // le colonne dell'orario, 0 = lunedi'
        public int OreOrari = 0;                               // ore al giorno dell'orario
        public string PeriodoOrari = "";                       // il periodo scritto nel tabellone
        public string FileOrari = "";
        public bool InviaOrariClassi = false;
        public string OggettoOrari = "Orario {docente}";
        public string OggettoOrariClasse = "Orario classe {classe}";
        public string NotaOrari = "";

        // ---- orario su Google Calendar ---------------------------------------
        public string CalDocente = "";           // cognome come nel tabellone (dato personale)
        public string CalNome = "";              // nome del calendario
        public string CalInizio = "";            // yyyy-MM-dd
        public string CalFine = "";              // yyyy-MM-dd
        public string CalPrimaOra = "08:00";     // inizio della prima ora
        public int CalMinutiOra = 60;            // durata di un'ora di lezione
        public string CalOreInizio = "";         // facoltativo: "08:00, 09:00, 10:10, ..." una per ora
        public string CalColore = "";            // colore del calendario, vuoto = quello di Google
        public string CalSospensioni = "";       // giorni senza lezione, una riga per giorno o periodo (testo libero: segue i dati personali)
        public string CalValidoDal = "";         // yyyy-MM-dd: da quando vale l'orario cambiato, vuoto = nessun cambio
        // il colore delle lezioni di ogni classe sul calendario (la classe come
        // nel tabellone, "A disposizione" per le ore a disposizione): il valore
        // di CalendarApp.EventColor, da "1" a "11", oppure "" = il colore del
        // calendario. Solo nomi di classi: sta nelle impostazioni. Quelli delle
        // classi che non sono in CalColoriAMano li ha dati Campanella
        // (ColoriLezioni.Completa), e restano gli stessi. Cambiano solo quando
        // DatiOrari.gs esce da Campanella (copiato o salvato) e con "Usa questi
        // colori": il riepilogo e l'anteprima li calcolano su una copia
        public Dictionary<string, string> CalColori = new Dictionary<string, string>();
        // le classi il cui colore l'ha scelto il docente: resta com'e'
        public List<string> CalColoriAMano = new List<string>();
        // i colori delle classi del calendario nell'ultimo DatiOrari.gs uscito
        // da Campanella: quelli delle lezioni gia' sul calendario. Fra due
        // classi con lo stesso colore dato da Campanella lo tiene quella che e'
        // qui (ColoriLezioni.Completa)
        public Dictionary<string, string> CalColoriScritti = new Dictionary<string, string>();
        // vero = l'avviso dell'avvio sul fuso dei calendari messi con la 1.5 o
        // prima e' gia' stato dato (o non serviva): non si ripete
        public bool AvvisoFusoCalendarioDato = false;

        // ===================================================================
        //  PERCORSI
        // ===================================================================

        /// <summary>
        /// Solo per le prove: la cartella di campanella.json al posto di quella
        /// dell'eseguibile. Se e' impostata, Carica non cerca nemmeno il Drive
        /// sul computer: una prova non deve toccare niente di vero.
        /// </summary>
        public static string CartellaDiProva = "";

        public static string Percorso()
        {
            if (!string.IsNullOrEmpty(CartellaDiProva)) return Path.Combine(CartellaDiProva, NomeFile);
            try
            {
                return Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), NomeFile);
            }
            catch { return NomeFile; }
        }

        /// <summary>Il file dei dati personali, se vanno tenuti nel Drive.</summary>
        public string PercorsoDati()
        {
            string c = (CartellaDati ?? "").Trim();
            if (c == "") c = CartellaDatiDiDefault();
            return Path.Combine(c, NomeFileDati);
        }

        public string CartellaDatiDiDefault()
        {
            return Path.Combine((Drive ?? "").Trim().TrimEnd('\\'), "Campanella");
        }

        /// <summary>
        /// Cerca la cartella "Il mio Drive" di Google Drive per desktop: nel
        /// profilo dell'utente oppure nella radice di un'unita' (Drive si
        /// monta spesso come G: o H:). Se non la trova propone quella nel
        /// profilo, che e' la sistemazione piu' comune.
        /// </summary>
        /// <summary>
        /// I "Il mio Drive" che ci sono sul computer, il piu' probabile per primo.
        /// Chi ha anche l'account personale si ritrova due unita' (per esempio G: e
        /// H:): quella della scuola e' riconoscibile perche' dentro ha MODELLI o le
        /// cartelle degli anni, e perche' l'account non e' di un servizio per
        /// privati. Sceglierne una a caso vuol dire dire "non trovo niente" a chi
        /// ha tutto al suo posto sull'altra.
        /// </summary>
        public static List<DriveTrovato> DriviPossibili()
        {
            string[] nomi = { "Il mio Drive", "My Drive" };
            List<DriveTrovato> fuori = new List<DriveTrovato>();
            List<string> radici = new List<string>();
            List<string> etichette = new List<string>();

            string profilo = "";
            try { profilo = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile); } catch { }
            if (profilo != "") { radici.Add(profilo); etichette.Add(""); }
            try
            {
                foreach (DriveInfo d in DriveInfo.GetDrives())
                {
                    try
                    {
                        if (!d.IsReady) continue;
                        radici.Add(d.RootDirectory.FullName);
                        string e = "";
                        try { e = d.VolumeLabel ?? ""; } catch { }
                        etichette.Add(e);
                    }
                    catch { }
                }
            }
            catch { }

            for (int i = 0; i < radici.Count; i++)
            {
                foreach (string n in nomi)
                {
                    string c;
                    try { c = Path.Combine(radici[i], n); } catch { continue; }
                    try { if (!Directory.Exists(c)) continue; } catch { continue; }
                    if (Contiene(fuori, c)) continue;

                    fuori.Add(EsaminaDrive(c, etichette[i]));
                }
            }
            // ordinamento stabile: a pari punti resta l'ordine di scoperta
            for (int i = 1; i < fuori.Count; i++)
            {
                DriveTrovato x = fuori[i];
                int k = i - 1;
                while (k >= 0 && fuori[k].Punti < x.Punti) { fuori[k + 1] = fuori[k]; k--; }
                fuori[k + 1] = x;
            }
            return fuori;
        }

        /// <summary>
        /// Che aria tira in una cartella "Il mio Drive": ci sono i modelli? le
        /// cartelle degli anni? di chi e' l'account? Piu' punti = piu' probabile
        /// che sia quello della scuola. Sta qui, separato, per poterlo provare.
        /// </summary>
        public static DriveTrovato EsaminaDrive(string percorso, string etichetta)
        {
            DriveTrovato t = new DriveTrovato();
            t.Percorso = percorso;
            t.Account = Email(etichetta);
            try { t.ConModelli = Directory.Exists(Path.Combine(percorso, "MODELLI")); } catch { }
            try { t.ConAnni = (Directory.GetDirectories(percorso, "A.S. *").Length > 0); } catch { }
            t.Punti = (t.ConModelli ? 4 : 0) + (t.ConAnni ? 3 : 0) + (IndirizzoPrivato(t.Account) ? -3 : 0);
            return t;
        }

        static bool Contiene(List<DriveTrovato> elenco, string percorso)
        {
            foreach (DriveTrovato t in elenco)
                if (string.Equals(t.Percorso, percorso, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        /// <summary>L'indirizzo dentro l'etichetta dell'unita': "tizio@scuola.it - Google Drive".</summary>
        static string Email(string etichetta)
        {
            Match m = Regex.Match(etichetta ?? "", @"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}");
            return m.Success ? m.Value : "";
        }

        /// <summary>Un indirizzo da servizio per privati: quel Drive non e' quello della scuola.</summary>
        static bool IndirizzoPrivato(string email)
        {
            string e = (email ?? "").ToLowerInvariant();
            if (e == "") return false;
            string[] privati = { "gmail.com", "googlemail.com", "outlook.", "hotmail.", "live.",
                                 "yahoo.", "libero.it", "virgilio.it", "alice.it", "tiscali.it",
                                 "icloud.com", "me.com", "protonmail.com", "proton.me" };
            foreach (string p in privati) if (e.EndsWith("@" + p) || e.Contains("@" + p)) return true;
            return false;
        }

        public static string DriveDiDefault()
        {
            List<DriveTrovato> trovati = DriviPossibili();
            if (trovati.Count > 0) return trovati[0].Percorso;
            string profilo = "";
            try { profilo = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile); } catch { }
            return (profilo != "") ? Path.Combine(profilo, "Il mio Drive") : @"C:\Il mio Drive";
        }

        /// <summary>Perche' l'ultimo salvataggio non e' riuscito. Vuoto se e' andato bene.</summary>
        public string UltimoErrore = "";

        /// <summary>
        /// Quello che l'ultimo salvataggio ha lasciato indietro apposta, per non
        /// rovinare un file che non ha letto, o perche' il Drive non c'era: va
        /// detto all'utente con un avviso, non solo scritto nelle Impostazioni.
        /// Vuoto se non c'e' niente da dire.
        /// </summary>
        public string DaAvvisare = "";

        /// <summary>
        /// Vero se l'ultimo salvataggio ha lasciato fuori dal Drive le modifiche di
        /// questa sessione ai dati personali perche' il file dei dati, dopo l'avvio,
        /// l'ha cambiato (o ce l'ha messo) un altro computer. Chiudendo andrebbero
        /// perse: finche' la finestra e' aperta, in Impostazioni Applica puo' ancora
        /// sostituire quel file con i dati di adesso.
        /// </summary>
        public bool ModificheInConflitto = false;

        /// <summary>Vero se, con i dati nel Drive, il file dei dati non era li' all'avvio.</summary>
        public bool DatiNonTrovati = false;

        /// <summary>
        /// Quanti filtri di Gmail da togliere, scelti prima, Campanella ha tolto
        /// dalla scelta all'avvio perche' sembrano di una classe e cercano degli
        /// indirizzi (FiltriGmail.TogliQuelliDelleClassi). Non si salva: lo
        /// dicono il passo 4 della Posta e la finestra dei filtri, finche' non
        /// la si apre; al prossimo avvio non c'e' piu' niente da togliere.
        /// </summary>
        public int FiltriClassiToltiAllAvvio = 0;

        /// <summary>
        /// Perche' all'avvio campanella.json c'era ma non si e' potuto usare
        /// (illeggibile, o scritto da una versione piu' recente). Finche' non e'
        /// vuoto quel file non si sovrascrive: dentro c'e' qualcosa che qui non si vede.
        /// </summary>
        public string ErroreImpostazioni = "";

        /// <summary>
        /// Lo stesso per il file dei dati nel Drive: c'era, ma non si e' potuto
        /// leggere; oppure, dopo l'avvio, l'ha cambiato un altro computer.
        /// </summary>
        public string ErroreDati = "";

        /// <summary>
        /// Il formato dei due file. Le chiavi che questa versione non conosce si
        /// riscrivono tali e quali, e quelle del file dei dati seguono i dati
        /// quando cambiano posto. Il numero va alzato quando una versione vecchia,
        /// riscrivendo il file, perderebbe qualcosa che non sa leggere (per
        /// esempio un campo nuovo dentro le persone dell'elenco), e ogni volta che
        /// Dati() scrive una chiave nuova in cima: in campanella.json una versione
        /// vecchia non distingue un dato personale sconosciuto da un'impostazione,
        /// e ce lo lascerebbe anche con i dati nel Drive. Vedendo un numero piu'
        /// alto del suo, quella versione non sovrascrive il file.
        /// Formato 2 (1.5.3): il colore dentro le regole ("colore"), i colori
        /// delle sottoetichette dei ruoli ("coloriRuoli") e, fra i dati
        /// personali, i filtri di Gmail da togliere ("filtriDaTogliere", una
        /// chiave nuova in cima a Dati()); la 1.5.2 riscrivendo i file li
        /// perderebbe, e i filtri li lascerebbe in campanella.json anche con i
        /// dati nel Drive.
        /// Formato 3 (1.6.0): i giorni senza lezione degli Orari
        /// ("calSospensioni", testo libero, una chiave nuova in cima a Dati()),
        /// "unoQualsiasi" dentro le regole (le regole delle classi: l'oggetto
        /// oppure gli studenti) e le etichette madri delle classi ("madriClassi",
        /// solo nomi, anche questa in cima a Dati()); la 1.5.3 riscrivendo i file
        /// lascerebbe i giorni senza lezione in campanella.json anche con i dati
        /// nel Drive, e perderebbe unoQualsiasi: la regola di una classe vorrebbe
        /// senza dirlo l'oggetto E gli studenti.
        /// </summary>
        public const int Formato = 3;

        // Il file dei dati che questa sessione ha letto o scritto, o che l'utente
        // ha scelto di sostituire: e' l'unico che Salva puo' sovrascrivere.
        string datiLetti = "";
        // quel file com'era quando questa sessione l'ha letto o scritto, per
        // accorgersi se poi l'ha cambiato un altro computer; null = l'utente ha
        // scelto di sostituirlo, qualunque cosa ci sia
        byte[] datiSulDisco = null;
        // un altro computer ha cambiato il file dei dati dopo l'avvio
        bool datiCambiatiFuori = false;
        // fino alla 1.4.6 il nome del calendario stava in campanella.json: ci
        // resta finche' il file dei dati nel Drive non l'ha preso
        bool calNomeDaPortare = false;
        // L'utente ha scelto di usare il file dei dati gia' nel Drive: lo si legge
        // al prossimo avvio, e fino ad allora quello che c'e' in memoria non ci va.
        bool datiDaRileggere = false;
        // campanella.json contiene l'elenco del personale (dati accanto al
        // programma, o un passaggio al Drive non ancora riuscito)
        bool datiNelFileLocale = false;
        // i dati appena caricati, come testo: se non cambiano non c'e' niente da scrivere
        string datiAllAvvio = null;
        // le chiavi dei due file che questa versione non conosce
        Dictionary<string, object> altroImpostazioni = new Dictionary<string, object>();
        Dictionary<string, object> altroDati = new Dictionary<string, object>();

        /// <summary>
        /// Prova davvero a scrivere nella cartella dell'eseguibile, con un file
        /// di prova che poi cancella. Serve all'avvio: se non si puo' scrivere
        /// e' meglio dirlo subito, non dopo un'ora di lavoro.
        /// </summary>
        public static bool CartellaScrivibile(out string errore)
        {
            return Scrivibile(Path.GetDirectoryName(Percorso()), out errore);
        }

        public static bool Scrivibile(string cartella, out string errore)
        {
            errore = "";
            try
            {
                if (string.IsNullOrEmpty(cartella)) cartella = ".";
                if (!Directory.Exists(cartella)) { errore = "la cartella non esiste"; return false; }
                string prova = Path.Combine(cartella,
                    ".campanella-prova-" + Guid.NewGuid().ToString("N") + ".tmp");
                File.WriteAllText(prova, "prova");
                File.Delete(prova);
                return true;
            }
            catch (Exception ex)
            {
                errore = ex.Message;
                return false;
            }
        }

        // ===================================================================
        //  SALVATAGGIO
        // ===================================================================
        public void Salva()
        {
            // Non alzo eccezioni: perdere le impostazioni e' fastidioso, ma
            // non deve far cadere l'applicazione mentre lavori. Il motivo
            // pero' lo tengo in UltimoErrore, e le Impostazioni lo mostrano.
            UltimoErrore = "";
            DaAvvisare = "";
            ModificheInConflitto = false;
            JavaScriptSerializer ser = new JavaScriptSerializer();
            ser.MaxJsonLength = 60 * 1024 * 1024;
            UTF8Encoding utf8 = new UTF8Encoding(false);

            // prima i dati nel Drive: se non si possono scrivere, l'elenco che
            // sta ancora in campanella.json non deve sparire anche da li'
            bool datiScritti = DatiNelDrive && !datiDaRileggere && SalvaDatiNelDrive(ser, utf8);
            bool conDati = !DatiNelDrive || (!datiScritti && !datiDaRileggere && datiNelFileLocale);
            if (datiScritti) calNomeDaPortare = false;

            Dictionary<string, object> r = Impostazioni();
            if (conDati)
            {
                foreach (KeyValuePair<string, object> kv in Dati()) r[kv.Key] = kv.Value;
                // le chiavi sconosciute del file dei dati seguono i dati: tornando
                // accanto al programma non si perdono, e tornando nel Drive ci vanno
                foreach (KeyValuePair<string, object> kv in altroDati)
                    if (!r.ContainsKey(kv.Key)) r[kv.Key] = kv.Value;
            }
            // un primo salvataggio con il Drive non ancora sincronizzato non deve
            // perdere il nome del calendario scritto qui dalla 1.4.6
            else if (calNomeDaPortare) r["calNome"] = CalNome;
            foreach (KeyValuePair<string, object> kv in altroImpostazioni)
                if (!r.ContainsKey(kv.Key)) r[kv.Key] = kv.Value;
            r["formato"] = Formato;

            string p = Percorso();
            try
            {
                if (ErroreImpostazioni != "" && File.Exists(p))
                {
                    Problema("impostazioni non salvate: " + p + " " + ErroreImpostazioni,
                        "Il file delle impostazioni\n\n" + p + "\n\n" + ErroreImpostazioni + ". " +
                        "Per non perdere quello che contiene non l'ho sovrascritto, quindi quello " +
                        "che hai cambiato adesso non e' stato salvato.\n\n" +
                        "Se quel file non ti serve piu', cancellalo e riapri Campanella: " +
                        "ripartira' dai valori di partenza.");
                    return;
                }
                ScriviSostituendo(p, ser.Serialize(r), utf8);
                ErroreImpostazioni = "";
                datiNelFileLocale = conDati;
            }
            catch (Exception ex) { Problema(ex.Message, ""); }
        }

        /// <summary>
        /// Scrive campanella-dati.json nel Drive, ma solo se e' il file letto (o
        /// scritto) in questa sessione, o se non c'e'. Uno comparso dopo l'avvio,
        /// uno che all'avvio non si leggeva o uno di una versione piu' recente
        /// puo' avere dati che qui non ci sono: sovrascriverlo li cancellerebbe,
        /// anche sugli altri computer. Lo stesso per il file letto qui, se dopo
        /// l'ha cambiato un altro computer. Torna vero se nel Drive adesso ci sono
        /// i dati di questa sessione (scritti, o gia' uguali).
        /// </summary>
        bool SalvaDatiNelDrive(JavaScriptSerializer ser, UTF8Encoding utf8)
        {
            string dati = PercorsoDati();
            try
            {
                Dictionary<string, object> d = Dati();
                foreach (KeyValuePair<string, object> kv in altroDati)
                    if (!d.ContainsKey(kv.Key)) d[kv.Key] = kv.Value;
                d["formato"] = Formato;
                byte[] testo = utf8.GetBytes(ser.Serialize(d));

                bool nostro = StessoPercorso(dati, datiLetti);
                if (nostro && File.Exists(dati))
                {
                    byte[] ora = File.ReadAllBytes(dati);
                    // c'e' gia' quello che scriverei: niente da riscrivere
                    if (Uguali(ora, testo)) { datiSulDisco = ora; return true; }
                    if (datiSulDisco != null && !Uguali(ora, datiSulDisco))
                    {
                        // l'ha cambiato un altro computer dopo che qui l'ho letto (o
                        // scritto): da adesso e' come un file comparso dopo l'avvio,
                        // e nelle Impostazioni si sceglie se usarlo o sostituirlo
                        datiLetti = "";
                        datiSulDisco = null;
                        datiCambiatiFuori = true;
                        ErroreDati = PercheCambiato(ora);
                        nostro = false;
                    }
                }
                if (!nostro && File.Exists(dati))
                {
                    string perche = (ErroreDati != "") ? ErroreDati : "e' comparso dopo l'avvio e non l'ho letto";
                    // cambiato (o comparso) dopo l'avvio: e' il file di un altro computer.
                    // Se qui non c'e' niente di nuovo non si perde niente
                    bool altrove = datiCambiatiFuori || ErroreDati == "";
                    bool cambiati = DatiCambiati();
                    bool dire = (ErroreDati != "" && !datiCambiatiFuori) || cambiati;
                    ModificheInConflitto = altrove && cambiati;
                    Problema("dati nel Drive non salvati: non sovrascrivo " + dati + ", che " + perche,
                        !dire ? "" :
                        "Il file dei dati nel Drive\n\n" + dati + "\n\n" + perche + ". Per non perdere " +
                        "quello che contiene non l'ho sovrascritto: le modifiche di adesso all'elenco del " +
                        "personale, agli indirizzi e agli orari non sono state salvate.\n\n" +
                        (altrove
                            // riaprendo si legge quel file: aspettare non serve
                            ? "Riaprendo Campanella si carica il file dell'altro computer, senza le " +
                              "modifiche di adesso. Per tenerle, finche' questa finestra e' aperta: in " +
                              "Impostazioni premi Applica accanto alla cartella dei dati e scegli di " +
                              "sostituire quel file. Dopo la chiusura non si puo' piu'."
                            : "Se il Drive stava ancora sincronizzando, riapri Campanella fra qualche minuto. " +
                              "Altrimenti, in Impostazioni, premi Applica accanto alla cartella dei dati: " +
                              "potrai scegliere se usare quel file o sostituirlo."));
                    return false;
                }
                // mancava gia' all'avvio e non e' cambiato niente: non creo un file
                // nuovo in un Drive che forse non ha ancora finito di sincronizzare
                if (!nostro && DatiNonTrovati && !DatiCambiati()) return false;

                // i dati personali vanno nel Drive: nel file accanto all'eseguibile
                // non ne resta traccia. Se il Drive non e' montato non invento
                // cartelle altrove: le impostazioni si salvano, i dati aspettano.
                string cartella = Path.GetDirectoryName(dati);
                string radice = Path.GetDirectoryName(cartella);
                if (string.IsNullOrEmpty(radice) || !Directory.Exists(radice))
                    throw new Exception("non trovo la cartella del Drive (" + radice + ")");
                Directory.CreateDirectory(cartella);
                // scritto sul posto, non sostituito: nel Drive un file nuovo
                // perderebbe la cronologia delle versioni, che e' il modo di recuperarlo
                try { File.WriteAllBytes(dati, testo); }
                catch (Exception) { RicordaScrittoAMeta(dati, testo); throw; }
                datiLetti = dati;
                datiSulDisco = testo;
                return true;
            }
            catch (Exception ex)
            {
                Problema("dati nel Drive non salvati: " + ex.Message,
                    !DatiCambiati() ? "" :
                    "Non sono riuscito a salvare nel Drive l'elenco del personale, gli indirizzi e " +
                    "gli orari (" + ex.Message + "): le modifiche di adesso non sono state salvate.");
                return false;
            }
        }

        /// <summary>
        /// Dopo una scrittura del file dei dati non riuscita. WriteAllBytes svuota il
        /// file prima di scrivere: se poi si ferma (disco pieno, una parte del file
        /// bloccata) sul disco resta l'inizio di quello che si scriveva, cioe' un
        /// file di questa sessione. Lo ricordo come tale: il prossimo salvataggio lo
        /// ripara, invece di dire che l'ha cambiato un altro computer, e un cambio
        /// fatto altrove dopo si riconosce lo stesso. Se sul disco c'e' altro (il
        /// file non si e' nemmeno aperto) o non si legge, non cambio niente.
        /// </summary>
        void RicordaScrittoAMeta(string dati, byte[] testo)
        {
            byte[] ora;
            try
            {
                if (!File.Exists(dati)) return;
                ora = File.ReadAllBytes(dati);
            }
            catch (Exception) { return; }
            if (ora.Length > testo.Length) return;
            for (int i = 0; i < ora.Length; i++) if (ora[i] != testo[i]) return;
            datiLetti = dati;
            datiSulDisco = ora;
        }

        /// <summary>Annota un problema del salvataggio: per le Impostazioni e, se serve, per un avviso.</summary>
        void Problema(string tecnico, string perUtente)
        {
            UltimoErrore = (UltimoErrore == "" ? "" : UltimoErrore + "; ") + tecnico;
            if (perUtente != "") DaAvvisare = (DaAvvisare == "" ? "" : DaAvvisare + "\n\n") + perUtente;
        }

        /// <summary>
        /// Scrive un file senza passare da un momento in cui e' a meta': prima un
        /// .tmp accanto, poi lo scambio. Nessuna copia .bak: sarebbe un'altra
        /// copia dei dati personali, in un posto che nessuno ha dichiarato.
        /// </summary>
        static void ScriviSostituendo(string percorso, string testo, Encoding codifica)
        {
            string tmp = percorso + ".tmp";
            try
            {
                File.WriteAllText(tmp, testo, codifica);
                if (!File.Exists(percorso)) File.Move(tmp, percorso);
                else
                {
                    try { File.Replace(tmp, percorso, null); }
                    catch (IOException)
                    {
                        // certi dischi (chiavette, cartelle di rete) non sanno fare
                        // lo scambio: allora si scrive sopra, come si e' sempre fatto
                        File.Copy(tmp, percorso, true);
                    }
                }
            }
            finally
            {
                try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
            }
        }

        // i dati come testo, per capire se in questa sessione sono cambiati
        string FotoDati()
        {
            try
            {
                JavaScriptSerializer ser = new JavaScriptSerializer();
                ser.MaxJsonLength = 60 * 1024 * 1024;
                return ser.Serialize(Dati());
            }
            catch { return null; }
        }

        bool DatiCambiati()
        {
            string ora = FotoDati();
            return datiAllAvvio == null || ora == null || ora != datiAllAvvio;
        }

        static bool Uguali(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
            return true;
        }

        // i byte di un file come li legge File.ReadAllText: con o senza BOM
        static string TestoDi(byte[] contenuto)
        {
            using (StreamReader l = new StreamReader(new MemoryStream(contenuto), Encoding.UTF8, true))
                return l.ReadToEnd();
        }

        /// <summary>Vero se il file c'e' ed e' ancora com'era (null: non si sa com'era).</summary>
        static bool Intatto(string percorso, byte[] comEra)
        {
            if (comEra == null) return false;
            try { return File.Exists(percorso) && Uguali(File.ReadAllBytes(percorso), comEra); }
            catch (Exception) { return false; }
        }

        // perche' non si sovrascrive il file dei dati cambiato da un altro computer
        static string PercheCambiato(byte[] contenuto)
        {
            try
            {
                Dictionary<string, object> d = DaJson(TestoDi(contenuto));
                int formato = (d != null) ? Int(d, "formato", 0) : 0;
                if (formato > Formato) return PiuRecente(formato);
            }
            catch (Exception) { /* a meta' o rovinato: vale lo stesso motivo */ }
            return "e' stato cambiato da un altro computer dopo l'avvio";
        }

        /// <summary>Vero se questo file dei dati e' quello letto (o scritto) in questa sessione.</summary>
        public bool DatiGiaLetti(string percorso)
        {
            return StessoPercorso(percorso, datiLetti);
        }

        public static bool StessoPercorso(string a, string b)
        {
            if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b)) return false;
            try
            {
                return string.Equals(Path.GetFullPath(a).TrimEnd('\\'), Path.GetFullPath(b).TrimEnd('\\'),
                                     StringComparison.OrdinalIgnoreCase);
            }
            catch { return string.Equals(a, b, StringComparison.OrdinalIgnoreCase); }
        }

        /// <summary>Le impostazioni: niente che riguardi altre persone.</summary>
        Dictionary<string, object> Impostazioni()
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["temaScuro"] = TemaScuro;
            r["consensoVersione"] = ConsensoVersione;
            r["consensoData"] = ConsensoData;
            r["datiNelDrive"] = DatiNelDrive;
            r["cartellaDati"] = CartellaDati;
            r["dominio"] = Dominio;
            r["prefisso"] = Prefisso;
            r["etichettaPerRuolo"] = EtichettaPerRuolo;
            Dictionary<string, object> ruoli = new Dictionary<string, object>();
            if (ColoriRuoli != null)
                foreach (KeyValuePair<string, string> kv in ColoriRuoli) ruoli[kv.Key] = kv.Value ?? "";
            r["coloriRuoli"] = ruoli;
            r["registro"] = Registro;
            r["schemaEmail"] = SchemaEmail;
            r["ordineNominativo"] = OrdineNominativo;
            r["prova"] = Prova;
            r["report"] = Report;
            r["escludiInviata"] = EscludiInviata;
            r["filtri"] = Filtri;
            r["periodo"] = Periodo;
            r["ore"] = Ore;
            r["codiceStatoPosta"] = CodiceStatoPosta;
            r["drive"] = Drive;
            r["anno"] = Anno;
            r["classi"] = Classi;
            r["cartelleExtra"] = CartelleExtra;
            r["moduloPercorso"] = ModuloPercorso;
            r["moduloCartella"] = ModuloCartella;
            r["moduloFoglio"] = ModuloFoglio;
            r["moduloChiusura"] = ModuloChiusura;
            r["moduloChiudi"] = ModuloChiudi;
            r["moduloSvuota"] = ModuloSvuota;
            r["moduloDrive"] = ModuloDrive;
            r["fileOrari"] = FileOrari;
            r["inviaOrariClassi"] = InviaOrariClassi;
            r["oggettoOrari"] = OggettoOrari;
            r["oggettoOrariClasse"] = OggettoOrariClasse;
            r["notaOrari"] = NotaOrari;
            r["calInizio"] = CalInizio;
            r["calFine"] = CalFine;
            r["calPrimaOra"] = CalPrimaOra;
            r["calMinutiOra"] = CalMinutiOra;
            r["calOreInizio"] = CalOreInizio;
            r["calColore"] = CalColore;
            r["calValidoDal"] = CalValidoDal;    // solo una data; i giorni senza lezione stanno in Dati()
            // i colori delle classi: nomi di classi e numeri, niente di personale
            Dictionary<string, object> colori = new Dictionary<string, object>();
            if (CalColori != null)
                foreach (KeyValuePair<string, string> kv in CalColori) colori[kv.Key] = kv.Value ?? "";
            r["calColori"] = colori;
            List<object> aMano = new List<object>();
            if (CalColoriAMano != null) foreach (string k in CalColoriAMano) aMano.Add(k);
            r["calColoriAMano"] = aMano;
            Dictionary<string, object> scritti = new Dictionary<string, object>();
            if (CalColoriScritti != null)
                foreach (KeyValuePair<string, string> kv in CalColoriScritti) scritti[kv.Key] = kv.Value ?? "";
            r["calColoriScritti"] = scritti;
            r["avvisoFusoCalendario"] = AvvisoFusoCalendarioDato;
            r["anonIndirizzo"] = AnonIndirizzo;
            r["anonDestinazione"] = AnonDestinazione;
            r["anonReversibileTesto"] = AnonReversibileTesto;
            r["privacyLetta"] = PrivacyLetta;

            List<object> sp = new List<object>();
            foreach (bool b in SpunteInstallazione) sp.Add(b);
            r["installazione"] = sp;
            return r;
        }

        /// <summary>
        /// I dati personali di altre persone: personale, indirizzi, orari, filtri
        /// di Gmail da togliere; e i giorni senza lezione, testo libero.
        /// </summary>
        Dictionary<string, object> Dati()
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["dirigenza"] = Dirigenza;
            r["segreteria"] = Segreteria;
            r["calDocente"] = CalDocente;
            r["calNome"] = CalNome;          // "Orario " + un cognome: segue i dati personali
            // testo libero: accanto alle feste ci si scrive facilmente un permesso
            // o il nome di un collega, quindi segue anche lui i dati personali
            r["calSospensioni"] = CalSospensioni;

            List<object> pers = new List<object>();
            foreach (Persona p in Personale)
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["nome"] = p.Nome; d["ruolo"] = p.Ruolo;
                d["email"] = p.Email; d["incluso"] = p.Incluso;
                d["verificato"] = p.Verificato;
                pers.Add(d);
            }
            r["personale"] = pers;

            List<object> reg = new List<object>();
            foreach (Regola x in Regole)
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["etichetta"] = x.Etichetta; d["descrizione"] = x.Descrizione;
                d["attiva"] = x.Attiva; d["da"] = x.Da; d["oggetto"] = x.Oggetto;
                d["contiene"] = x.Contiene; d["escludi"] = x.EscludiEtichette;
                d["query"] = x.QueryLibera; d["archivia"] = x.Archivia;
                d["lette"] = x.SegnaComeLette; d["unoQualsiasi"] = x.UnoQualsiasi;
                d["sorgente"] = x.Sorgente;
                // mai scelto (null) resta senza chiave: al prossimo avvio prende
                // quello di partenza; "" (nessun colore) invece si scrive
                if (x.Colore != null) d["colore"] = x.Colore;
                reg.Add(d);
            }
            r["regole"] = reg;

            List<object> filtri = new List<object>();
            if (FiltriDaTogliere != null)
                foreach (FiltroDaTogliere f in FiltriDaTogliere)
                {
                    Dictionary<string, object> d = new Dictionary<string, object>();
                    d["etichetta"] = f.Etichetta;
                    Dictionary<string, object> c = new Dictionary<string, object>();
                    foreach (KeyValuePair<string, string> kv in f.Criteri) c[kv.Key] = kv.Value;
                    d["criteri"] = c;
                    filtri.Add(d);
                }
            r["filtriDaTogliere"] = filtri;

            List<object> madri = new List<object>();
            if (MadriClassi != null) foreach (string m in MadriClassi) madri.Add(m);
            r["madriClassi"] = madri;

            List<object> lez = new List<object>();
            foreach (Lezione l in Lezioni)
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["d"] = l.Docente; d["g"] = l.Giorno; d["o"] = l.Ora;
                d["c"] = l.Classe;
                lez.Add(d);
            }
            r["lezioni"] = lez;
            List<object> colonne = new List<object>();
            foreach (int g in GiorniOrari) colonne.Add(g);
            r["orariGiorni"] = colonne;
            r["orariOre"] = OreOrari;
            r["orariPeriodo"] = PeriodoOrari;
            return r;
        }

        // ===================================================================
        //  LETTURA
        // ===================================================================
        public static Stato Carica()
        {
            Stato s = new Stato();
            Dictionary<string, object> r = null;
            try
            {
                // assente o vuoto: si parte da zero. Illeggibile: si parte da zero
                // lo stesso, ma quel file non si sovrascrive (ErroreImpostazioni)
                r = s.ApriImpostazioni(Percorso());
                if (r == null) return s.FineCarica(null);

                s.TemaScuro = Bool(r, "temaScuro", true);
                s.ConsensoVersione = Int(r, "consensoVersione", 0);
                s.ConsensoData = Str(r, "consensoData", "");
                s.DatiNelDrive = Bool(r, "datiNelDrive", false);
                s.CartellaDati = Str(r, "cartellaDati", "");
                s.Dominio = Str(r, "dominio", s.Dominio);
                s.Prefisso = Str(r, "prefisso", s.Prefisso);
                s.EtichettaPerRuolo = Bool(r, "etichettaPerRuolo", false);
                s.ColoriRuoli = ColoriDeiRuoli(r);
                s.Registro = Str(r, "registro", s.Registro);
                s.SchemaEmail = Str(r, "schemaEmail", s.SchemaEmail);
                s.OrdineNominativo = Int(r, "ordineNominativo", 0);
                s.Prova = Bool(r, "prova", true);
                s.Report = Bool(r, "report", true);
                s.EscludiInviata = Bool(r, "escludiInviata", true);
                s.Filtri = Bool(r, "filtri", false);
                s.Periodo = Int(r, "periodo", 0);
                s.Ore = Int(r, "ore", 1);
                s.CodiceStatoPosta = Str(r, "codiceStatoPosta", "");
                s.Drive = Str(r, "drive", s.Drive);
                s.Anno = Str(r, "anno", "");
                s.Classi = Str(r, "classi", "");
                s.CartelleExtra = Str(r, "cartelleExtra", "");
                s.ModuloPercorso = Str(r, "moduloPercorso", "");
                s.ModuloCartella = Str(r, "moduloCartella", "");
                s.ModuloFoglio = Str(r, "moduloFoglio", "");
                s.ModuloChiusura = Str(r, "moduloChiusura", ModuloChiusuraDiDefault);
                s.ModuloChiudi = Bool(r, "moduloChiudi", true);
                s.ModuloSvuota = Bool(r, "moduloSvuota", false);
                s.ModuloDrive = Bool(r, "moduloDrive", true);
                s.FileOrari = Str(r, "fileOrari", "");
                s.InviaOrariClassi = Bool(r, "inviaOrariClassi", false);
                s.OggettoOrari = Str(r, "oggettoOrari", s.OggettoOrari);
                s.OggettoOrariClasse = Str(r, "oggettoOrariClasse", s.OggettoOrariClasse);
                s.NotaOrari = Str(r, "notaOrari", "");
                s.CalNome = Str(r, "calNome", "");
                s.CalInizio = Str(r, "calInizio", "");
                s.CalFine = Str(r, "calFine", "");
                s.CalPrimaOra = Str(r, "calPrimaOra", s.CalPrimaOra);
                s.CalMinutiOra = Int(r, "calMinutiOra", 60);
                s.CalOreInizio = Str(r, "calOreInizio", "");
                s.CalColore = Str(r, "calColore", "");
                s.CalValidoDal = Str(r, "calValidoDal", "");
                s.CalColori = ColoriLezioni.Letti(r, "calColori");
                s.CalColoriAMano = new List<string>();
                // scelta a mano solo una classe che ha un colore (anche "")
                foreach (string k in Lista(r, "calColoriAMano"))
                    if (s.CalColori.ContainsKey(k) && !s.CalColoriAMano.Contains(k)) s.CalColoriAMano.Add(k);
                s.CalColoriScritti = ColoriLezioni.Letti(r, "calColoriScritti");
                s.AvvisoFusoCalendarioDato = Bool(r, "avvisoFusoCalendario", false);
                s.AnonIndirizzo = Str(r, "anonIndirizzo", s.AnonIndirizzo);
                s.AnonDestinazione = Str(r, "anonDestinazione", "");
                s.AnonReversibileTesto = Bool(r, "anonReversibileTesto", true);
                s.PrivacyLetta = Bool(r, "privacyLetta", false);

                object[] sp = r.ContainsKey("installazione") ? r["installazione"] as object[] : null;
                if (sp != null)
                {
                    s.SpunteInstallazione.Clear();
                    foreach (object o in sp)
                    {
                        try { s.SpunteInstallazione.Add(Convert.ToBoolean(o)); }
                        catch { s.SpunteInstallazione.Add(false); }
                    }
                }
            }
            catch (Exception ex)
            {
                // un valore che non si capisce: quel file non lo sovrascrivo
                if (s.ErroreImpostazioni == "") s.ErroreImpostazioni = "non si legge (" + ex.Message + ")";
            }
            return s.FineCarica(r);
        }

        /// <summary>
        /// Legge campanella.json. Null se non c'e' o e' vuoto: si parte da zero.
        /// Se c'e' ma non si legge, o l'ha scritto una versione piu' recente, lo
        /// annota in ErroreImpostazioni, e Salva non lo sovrascrivera'.
        /// </summary>
        Dictionary<string, object> ApriImpostazioni(string p)
        {
            Dictionary<string, object> r;
            try
            {
                if (!File.Exists(p)) return null;
                r = LeggiJson(p);
            }
            catch (Exception ex)
            {
                ErroreImpostazioni = "non si legge (" + ex.Message + ")";
                return null;
            }
            if (r != null && Int(r, "formato", 0) > Formato) ErroreImpostazioni = PiuRecente(Int(r, "formato", 0));
            return r;
        }

        /// <summary>
        /// L'ultima parte di Carica: il Drive, se non ce n'e' uno salvato; i dati
        /// personali, dal Drive se cosi' e' stato scelto, altrimenti dallo stesso
        /// file (com'era nelle versioni precedenti); una fotografia dei dati
        /// appena letti, per sapere poi se sono cambiati.
        /// </summary>
        Stato FineCarica(Dictionary<string, object> r)
        {
            if ((r == null || !r.ContainsKey("drive")) && string.IsNullOrEmpty(CartellaDiProva))
                Drive = DriveDiDefault();
            if (r != null)
            {
                try
                {
                    altroImpostazioni = Sconosciute(r, true);
                    datiNelFileLocale = r.ContainsKey("personale") || r.ContainsKey("regole") || r.ContainsKey("lezioni");
                    calNomeDaPortare = r.ContainsKey("calNome");
                    if (DatiNelDrive) CaricaDatiDelDrive(r);
                    else LeggiDati(r);
                }
                catch (Exception ex)
                {
                    // dati letti a meta': il file da cui venivano non si sovrascrive
                    datiLetti = "";
                    datiSulDisco = null;
                    if (DatiNelDrive) { if (ErroreDati == "") ErroreDati = "non si legge (" + ex.Message + ")"; }
                    else if (ErroreImpostazioni == "") ErroreImpostazioni = "non si legge (" + ex.Message + ")";
                }
            }
            datiAllAvvio = FotoDati();
            return this;
        }

        /// <summary>
        /// I dati personali dal file nel Drive. Distingue il file che non c'e'
        /// (Drive non ancora sincronizzato: DatiNonTrovati) da quello che c'e' ma
        /// non si legge (ErroreDati): in nessuno dei due casi quel file verra'
        /// sovrascritto con quello che c'e' in memoria.
        /// </summary>
        void CaricaDatiDelDrive(Dictionary<string, object> r)
        {
            string dati = PercorsoDati();
            Dictionary<string, object> d = null;
            byte[] contenuto = null;
            try
            {
                if (!File.Exists(dati)) DatiNonTrovati = true;
                else
                {
                    // letto una volta sola: quello che si ricorda e' proprio quello che si usa
                    contenuto = File.ReadAllBytes(dati);
                    d = DaJson(TestoDi(contenuto));
                    if (d == null) ErroreDati = "e' vuoto";
                }
            }
            catch (Exception ex) { ErroreDati = "non si legge (" + ex.Message + ")"; d = null; }

            if (d == null)
            {
                // se il file accanto all'exe li ha ancora (cambio di
                // modalita' non completato), meglio non perderli
                LeggiDati(r);
                return;
            }
            int formato = Int(d, "formato", 0);
            if (formato > Formato) ErroreDati = PiuRecente(formato);
            LeggiDati(d);
            altroDati = Sconosciute(d, false);
            if (ErroreDati == "") { datiLetti = dati; datiSulDisco = contenuto; }
        }

        static string PiuRecente(int formato)
        {
            return "e' stato scritto da una versione piu' recente di Campanella (formato " + formato +
                   "): aggiorna Campanella";
        }

        /// <summary>
        /// Le chiavi di un file che questa versione non scrive, da riscrivere tali
        /// e quali: cosi' un computer con una versione diversa non cancella i campi
        /// che non conosce. In campanella.json quelle dei dati personali sono note
        /// anche quando i dati stanno nel Drive.
        /// </summary>
        Dictionary<string, object> Sconosciute(Dictionary<string, object> letto, bool impostazioni)
        {
            Dictionary<string, object> fuori = new Dictionary<string, object>();
            Dictionary<string, object> dati = Dati();
            Dictionary<string, object> imp = impostazioni ? Impostazioni() : null;
            foreach (KeyValuePair<string, object> kv in letto)
            {
                if (kv.Key == "formato" || dati.ContainsKey(kv.Key)) continue;
                if (imp != null && imp.ContainsKey(kv.Key)) continue;
                fuori[kv.Key] = kv.Value;
            }
            return fuori;
        }

        /// <summary>Un file JSON con un oggetto dentro. Null se e' vuoto; eccezione se non si legge.</summary>
        static Dictionary<string, object> LeggiJson(string percorso)
        {
            return DaJson(File.ReadAllText(percorso, Encoding.UTF8));
        }

        static Dictionary<string, object> DaJson(string testo)
        {
            if (testo.Trim() == "") return null;
            JavaScriptSerializer ser = new JavaScriptSerializer();
            ser.MaxJsonLength = 60 * 1024 * 1024;
            object o;
            // il messaggio del lettore JSON ripete il contenuto del file, cioe'
            // anche i dati personali: non va in giro negli avvisi
            try { o = ser.DeserializeObject(testo); }
            catch { throw new InvalidDataException("non e' JSON valido, forse e' rimasto a meta'"); }
            Dictionary<string, object> r = o as Dictionary<string, object>;
            if (r == null) throw new InvalidDataException("non contiene un oggetto JSON");
            return r;
        }

        void LeggiDati(Dictionary<string, object> r)
        {
            Dirigenza = Str(r, "dirigenza", Dirigenza);
            Segreteria = Str(r, "segreteria", Segreteria);
            CalDocente = Str(r, "calDocente", CalDocente);
            // fino alla 1.4.6 stava in campanella.json: se nel file dei dati non
            // c'e', resta quello letto dalle impostazioni
            CalNome = Str(r, "calNome", CalNome);
            CalSospensioni = Str(r, "calSospensioni", CalSospensioni);

            object[] pers = r.ContainsKey("personale") ? r["personale"] as object[] : null;
            if (pers != null)
            {
                Personale.Clear();
                foreach (object o in pers)
                {
                    Dictionary<string, object> d = o as Dictionary<string, object>;
                    if (d == null) continue;
                    Persona x = new Persona();
                    x.Nome = Str(d, "nome", "");
                    x.Ruolo = Str(d, "ruolo", "");
                    x.Email = Str(d, "email", "");
                    x.Incluso = Bool(d, "incluso", true);
                    x.Verificato = Bool(d, "verificato", false);
                    Personale.Add(x);
                }
            }

            object[] reg = r.ContainsKey("regole") ? r["regole"] as object[] : null;
            if (reg != null && reg.Length > 0)
            {
                List<Regola> lette = new List<Regola>();
                foreach (object o in reg)
                {
                    Dictionary<string, object> d = o as Dictionary<string, object>;
                    if (d == null) continue;
                    Regola x = new Regola();
                    x.Etichetta = Str(d, "etichetta", "");
                    if (x.Etichetta == "") continue;
                    x.Descrizione = Str(d, "descrizione", "");
                    x.Attiva = Bool(d, "attiva", true);
                    x.Da = Lista(d, "da");
                    x.Oggetto = Lista(d, "oggetto");
                    x.Contiene = Lista(d, "contiene");
                    x.EscludiEtichette = Lista(d, "escludi");
                    x.QueryLibera = Str(d, "query", "");
                    x.Archivia = Bool(d, "archivia", false);
                    x.SegnaComeLette = Bool(d, "lette", false);
                    // senza chiave (1.5.3 e prima): i criteri insieme, come allora
                    x.UnoQualsiasi = Bool(d, "unoQualsiasi", false);
                    x.Sorgente = Str(d, "sorgente", "");
                    // senza chiave (1.5.2 e prima) resta null e sotto prende quello
                    // di partenza; un colore che Gmail non accetta, scritto a mano,
                    // diventa nessun colore
                    x.Colore = d.ContainsKey("colore") ? ColoriEtichette.Pulito(Str(d, "colore", "")) : null;
                    lette.Add(x);
                }
                if (lette.Count > 0)
                {
                    // una classe senza colore prende una sfumatura delle classi
                    ColoriEtichette.DelleClassi(lette, ColoriRuoli);
                    ColoriEtichette.Completa(lette, ColoriRuoli);
                    Regole = lette;
                }
            }

            // le madri delle classi: quelle scritte e quelle delle regole delle
            // classi che ci sono (un file di prima della chiave, o una regola
            // spostata a mano sotto un'altra madre)
            object[] mc = r.ContainsKey("madriClassi") ? r["madriClassi"] as object[] : null;
            MadriClassi = new List<string>();
            if (mc != null) foreach (object o in mc) AggiungiMadreClassi(Convert.ToString(o));
            foreach (Regola x in Regole)
                if (x.Sorgente == Regola.SorgenteClasse && (x.Etichetta ?? "").LastIndexOf('/') > 0)
                    AggiungiMadreClassi(x.Etichetta.Substring(0, x.Etichetta.LastIndexOf('/')));

            // i filtri di Gmail da togliere: una voce che non si capisce tutta
            // si lascia fuori (FiltroDaTogliere.Da), e una ripetuta vale una volta
            object[] ft = r.ContainsKey("filtriDaTogliere") ? r["filtriDaTogliere"] as object[] : null;
            if (ft != null)
            {
                FiltriDaTogliere = new List<FiltroDaTogliere>();
                List<string> chiavi = new List<string>();
                foreach (object o in ft)
                {
                    Dictionary<string, object> d = o as Dictionary<string, object>;
                    Dictionary<string, object> c = (d != null && d.ContainsKey("criteri"))
                        ? d["criteri"] as Dictionary<string, object> : null;
                    FiltroDaTogliere f = (c != null) ? FiltroDaTogliere.Da(Str(d, "etichetta", ""), c) : null;
                    if (f == null || chiavi.Contains(f.Chiave())) continue;
                    chiavi.Add(f.Chiave());
                    FiltriDaTogliere.Add(f);
                }
            }

            object[] lez = r.ContainsKey("lezioni") ? r["lezioni"] as object[] : null;
            if (lez != null)
            {
                Lezioni.Clear();
                foreach (object o in lez)
                {
                    Dictionary<string, object> d = o as Dictionary<string, object>;
                    if (d == null) continue;
                    Lezione l = new Lezione();
                    l.Docente = Str(d, "d", "");
                    l.Giorno = Int(d, "g", 0);
                    l.Ora = Int(d, "o", 1);
                    l.Classe = Str(d, "c", "");
                    // "m" e "a" (materia e aula) delle versioni precedenti non servono
                    if (l.Docente != "") Lezioni.Add(l);
                }
            }

            // le colonne dell'orario: nei file delle versioni precedenti non
            // ci sono, e l'orario le ricava dai giorni delle lezioni
            object[] col = r.ContainsKey("orariGiorni") ? r["orariGiorni"] as object[] : null;
            if (col != null)
            {
                GiorniOrari.Clear();
                foreach (object o in col)
                {
                    try { GiorniOrari.Add(Convert.ToInt32(o, CultureInfo.InvariantCulture)); }
                    catch { /* valore strano: lo salto */ }
                }
            }
            OreOrari = Int(r, "orariOre", OreOrari);
            PeriodoOrari = Str(r, "orariPeriodo", PeriodoOrari);
        }

        /// <summary>
        /// Cambia dove stanno i dati personali. Tornando ai dati accanto
        /// all'eseguibile, o cambiando cartella dentro il Drive, il file di prima
        /// viene cancellato: non ha senso lasciarne due copie che poi divergono,
        /// una delle quali in un posto non piu' dichiarato. Un file dei dati che
        /// c'e' gia' nella cartella nuova non si sostituisce: per quello serve
        /// sostituisci = vero, cioe' che l'utente l'abbia detto.
        /// </summary>
        public bool SpostaDati(bool nelDrive, string cartella, out string errore)
        {
            return SpostaDati(nelDrive, cartella, false, out errore);
        }

        public bool SpostaDati(bool nelDrive, string cartella, bool sostituisci, out string errore)
        {
            errore = "";
            bool eraNelDrive = DatiNelDrive;
            string eraCartella = CartellaDati;
            string eraLetti = datiLetti;
            byte[] eraSulDisco = datiSulDisco;
            string vecchio = DatiNelDrive ? PercorsoDati() : null;

            DatiNelDrive = nelDrive;
            CartellaDati = nelDrive ? (cartella ?? "").Trim() : CartellaDati;
            string nuovo = nelDrive ? PercorsoDati() : null;
            bool cera = false;
            if (nelDrive)
            {
                cera = File.Exists(nuovo);
                if (cera && !StessoPercorso(nuovo, datiLetti) && !sostituisci)
                {
                    DatiNelDrive = eraNelDrive;
                    CartellaDati = eraCartella;
                    errore = "in " + nuovo + " c'e' gia' un file dei dati: non lo sostituisco senza chiedere";
                    return false;
                }
                datiLetti = nuovo;     // scelto dall'utente: qui si puo' scrivere
                if (!cera || sostituisci) datiSulDisco = null;
            }

            Salva();
            if (UltimoErrore != "")
            {
                errore = UltimoErrore;
                // torno com'ero: sede e flag di prima, e le impostazioni riscritte
                // come prima; il file appena creato nel Drive non deve restare
                try { if (nelDrive && !cera && File.Exists(nuovo)) File.Delete(nuovo); } catch { }
                DatiNelDrive = eraNelDrive;
                CartellaDati = eraCartella;
                datiLetti = eraLetti;
                datiSulDisco = eraSulDisco;
                Salva();
                return false;
            }

            if (vecchio != null && !StessoPercorso(vecchio, nuovo) && File.Exists(vecchio))
            {
                // si cancella solo il file che questa sessione ha letto, e com'era
                // allora: quello che c'e' dentro e' appena stato scritto nel posto nuovo
                if (!StessoPercorso(vecchio, eraLetti))
                    errore = "dati salvati, ma non tolgo " + vecchio + ": qui non si e' potuto leggere, " +
                             "e non cancello quello che non ho letto. Controllalo e, se non serve, cancellalo tu";
                else if (!Intatto(vecchio, eraSulDisco))
                    errore = "dati salvati, ma non tolgo " + vecchio + ": dopo l'avvio l'ha cambiato un altro " +
                             "computer, e quelle modifiche qui non ci sono. Controllalo e, se non serve, cancellalo tu";
                else
                {
                    try { File.Delete(vecchio); }
                    catch (Exception ex) { errore = "impostazioni salvate, ma non riesco a togliere " + vecchio + ": " + ex.Message; }
                }
            }
            return errore == "";
        }

        /// <summary>
        /// Usa il file dei dati che c'e' gia' nel Drive (scritto da un altro
        /// computer, o appena sincronizzato) invece di sostituirlo. Le pagine
        /// aperte hanno ancora i dati di prima, quindi da qui alla chiusura quel
        /// file non si scrive: Campanella va riaperta, e allora lo legge.
        /// </summary>
        public bool UsaDatiDelDrive(string cartella, out string errore)
        {
            errore = "";
            string c = (cartella ?? "").Trim();
            string file = Path.Combine(c, NomeFileDati);
            try
            {
                Dictionary<string, object> d = LeggiJson(file);
                if (d == null) throw new InvalidDataException("e' vuoto");
                int formato = Int(d, "formato", 0);
                if (formato > Formato) throw new InvalidDataException(PiuRecente(formato));
            }
            catch (Exception ex)
            {
                errore = "non riesco a usare " + file + ": " + ex.Message;
                return false;
            }

            bool eraNelDrive = DatiNelDrive;
            string eraCartella = CartellaDati;
            string eraLetti = datiLetti;
            byte[] eraSulDisco = datiSulDisco;
            string vecchio = DatiNelDrive ? PercorsoDati() : null;
            DatiNelDrive = true;
            CartellaDati = c;
            datiDaRileggere = true;
            Salva();
            if (UltimoErrore != "")
            {
                errore = UltimoErrore;
                DatiNelDrive = eraNelDrive;
                CartellaDati = eraCartella;
                datiDaRileggere = false;
                Salva();
                return false;
            }
            // la copia di prima, se era un altro file del Drive letto qui, non resta in
            // giro; ma se dopo l'avvio l'ha cambiata un altro computer non la cancello
            if (vecchio != null && !StessoPercorso(vecchio, file) && StessoPercorso(vecchio, eraLetti) &&
                File.Exists(vecchio))
            {
                if (!Intatto(vecchio, eraSulDisco))
                    errore = "impostazioni salvate, ma non tolgo " + vecchio + ": dopo l'avvio l'ha cambiato " +
                             "un altro computer. Controllalo e, se non serve, cancellalo tu";
                else
                {
                    try { File.Delete(vecchio); }
                    catch (Exception ex) { errore = "impostazioni salvate, ma non riesco a togliere " + vecchio + ": " + ex.Message; }
                }
            }
            return errore == "";
        }

        // ===================================================================
        //  DERIVATI
        // ===================================================================
        public string DominioPulito()
        {
            return (Dominio ?? "").Trim().TrimStart('@').ToLowerInvariant();
        }

        public string PrefissoPulito()
        {
            return (Prefisso ?? "").Trim().Trim('/');
        }

        /// <summary>
        /// Si ricorda un'etichetta madre delle classi (MadriClassi): una volta
        /// sola, maiuscole e spazi doppi a parte, senza barre in fondo.
        /// </summary>
        public void AggiungiMadreClassi(string madre)
        {
            string m = Regex.Replace(madre ?? "", @"\s+", " ").Trim().Trim('/').Trim();
            if (m == "") return;
            if (MadriClassi == null) MadriClassi = new List<string>();
            foreach (string c in MadriClassi)
                if (string.Equals(c, m, StringComparison.OrdinalIgnoreCase)) return;
            MadriClassi.Add(m);
        }

        public List<string> IndirizziPersonale()
        {
            List<string> fuori = new List<string>();
            foreach (Persona p in Personale)
            {
                if (!p.Incluso) continue;
                string e = (p.Email ?? "").Trim().ToLowerInvariant();
                if (e == "" || !e.Contains("@")) continue;
                if (!fuori.Contains(e)) fuori.Add(e);
            }
            return fuori;
        }

        // -------------------------------------------------------------------
        //  I RUOLI, RADUNATI IN POCHE CATEGORIE
        //  I registri scrivono i ruoli per esteso e nel loro modo ("DOCENTE
        //  LAUREATO SCUOLA SECONDARIA II GRADO", "ASSISTENTE AMMINISTRATIVO"):
        //  troppi per farne un'etichetta ciascuno. Qui diventano cinque
        //  categorie, che sono quelle con cui si ragiona a scuola.
        // -------------------------------------------------------------------
        public static readonly string[] Categorie =
            { "Dirigenza", "Docenti", "Amministrativi", "Tecnici", "Collaboratori" };

        /// <summary>La categoria di un ruolo, o "" se non la riconosco.</summary>
        public static string CategoriaRuolo(string ruolo)
        {
            string r = (ruolo ?? "").ToLowerInvariant();
            if (r == "") return "";
            if (r.Contains("dirigente scolastic") || r.Contains("preside")) return "Dirigenza";
            if (r.Contains("direttore sga") || r.Contains("d.s.g.a") || r.Contains("dsga") ||
                r.Contains("direttore dei servizi") || r.Contains("assistente amministrativ") ||
                r.Contains("amministrativo") || r.Contains("segreteri")) return "Amministrativi";
            if (r.Contains("assistente tecnic") || r.Contains("tecnico di laboratorio") ||
                r.Contains("aggiunto di laboratorio")) return "Tecnici";
            if (r.Contains("collaboratore scolastic") || r.Contains("ausiliari")) return "Collaboratori";
            if (r.Contains("docente") || r.Contains("insegnante") || r.Contains("professor") ||
                r.Contains("educator") || r.Contains("itp")) return "Docenti";
            return "";
        }

        /// <summary>
        /// Gli indirizzi del personale incluso, divisi per categoria. Le
        /// categorie senza nessuno non compaiono.
        /// </summary>
        public Dictionary<string, List<string>> GruppiPerRuolo()
        {
            Dictionary<string, List<string>> fuori = new Dictionary<string, List<string>>();
            foreach (Persona p in Personale)
            {
                if (!p.Incluso) continue;
                string e = (p.Email ?? "").Trim().ToLowerInvariant();
                if (e == "" || !e.Contains("@")) continue;
                string c = CategoriaRuolo(p.Ruolo);
                if (c == "") continue;
                if (!fuori.ContainsKey(c)) fuori[c] = new List<string>();
                if (!fuori[c].Contains(e)) fuori[c].Add(e);
            }
            return fuori;
        }

        // -------------------------------------------------------------------
        //  IL CONFRONTO CON GLI INDIRIZZI VERI DELLA CASELLA
        //  Gli indirizzi costruiti dai nomi sono un'ipotesi: la scuola puo'
        //  usare nome.cognome, n.cognome, o niente di tutto cio'. Qui
        //  l'ipotesi viene messa davanti agli indirizzi che nella casella si
        //  sono visti davvero (EXTRA_elencaIndirizziScuola) e, quando uno solo
        //  puo' essere quella persona, l'ipotesi viene sostituita.
        // -------------------------------------------------------------------

        /// <summary>I pezzi di un nome o di una parte locale: minuscoli, senza accenti ne' cifre.</summary>
        public static List<string> Pezzi(string s)
        {
            List<string> fuori = new List<string>();
            foreach (string p in Regex.Split(SenzaAccenti(s ?? "").ToLowerInvariant(), "[^a-z0-9]+"))
            {
                string t = Regex.Replace(p, "[0-9]", "");
                if (t != "") fuori.Add(t);
            }
            return fuori;
        }

        public static string ParteLocale(string indirizzo)
        {
            string s = (indirizzo ?? "").Trim();
            int c = s.IndexOf('@');
            return (c > 0) ? s.Substring(0, c) : s;
        }

        /// <summary>Il nome, con i pezzi in ordine: "ROSSI MARIO" e "Mario Rossi" coincidono.</summary>
        public static string ChiaveNome(string s)
        {
            List<string> p = Pezzi(s);
            p.Sort(StringComparer.Ordinal);
            return string.Join("|", p.ToArray());
        }

        /// <summary>
        /// Questo indirizzo puo' essere di questa persona? Ogni pezzo della
        /// parte locale deve ritrovarsi nel nome (o esserne l'iniziale), e
        /// almeno un pezzo lungo deve corrispondere: cosi' m.rossi va bene per
        /// ROSSI MARIO ma non per ROSSI ANNA.
        /// </summary>
        public static bool StessaPersona(string nome, string indirizzo)
        {
            List<string> np = Pezzi(nome);
            List<string> lp = Pezzi(ParteLocale(indirizzo));
            if (np.Count == 0 || lp.Count == 0) return false;

            // anche i cognomi composti attaccati: DE LUCA ANNA -> anna.deluca
            List<string> pezziEUnioni = new List<string>(np);
            for (int i = 0; i < np.Count; i++)
            {
                string unione = np[i];
                for (int k = i + 1; k < np.Count && k < i + 3; k++)
                {
                    unione += np[k];
                    if (!pezziEUnioni.Contains(unione)) pezziEUnioni.Add(unione);
                }
            }
            // e il nome tutto attaccato, nei due versi
            if (np.Count >= 2)
            {
                string dritto = string.Join("", np.ToArray());
                List<string> rovesciati = new List<string>(np);
                rovesciati.Reverse();
                string rovescio = string.Join("", rovesciati.ToArray());
                if (!pezziEUnioni.Contains(dritto)) pezziEUnioni.Add(dritto);
                if (!pezziEUnioni.Contains(rovescio)) pezziEUnioni.Add(rovescio);
            }

            bool almenoUnoLungo = false;
            foreach (string t in lp)
            {
                if (t.Length >= 3)
                {
                    if (!pezziEUnioni.Contains(t)) return false;
                    almenoUnoLungo = true;
                }
                else
                {
                    bool iniziale = false;
                    foreach (string n in np) if (n.StartsWith(t)) { iniziale = true; break; }
                    if (!iniziale) return false;
                }
            }
            return almenoUnoLungo;
        }

        /// <summary>
        /// Mette l'elenco davanti agli indirizzi veri della casella. Cambia
        /// solo gli indirizzi che puo' attribuire senza dubbi; gli altri li
        /// segnala e basta.
        /// </summary>
        public EsitoConfronto ConfrontaConLaCasella(List<Persona> reali)
        {
            EsitoConfronto e = new EsitoConfronto();
            if (reali == null) return e;

            List<string> indirizzi = new List<string>();
            Dictionary<string, string> nomeDi = new Dictionary<string, string>();
            foreach (Persona r in reali)
            {
                string mail = (r.Email ?? "").Trim().ToLowerInvariant();
                if (mail == "" || mail.IndexOf('@') < 1) continue;
                if (nomeDi.ContainsKey(mail)) continue;
                nomeDi[mail] = r.Nome ?? "";
                indirizzi.Add(mail);
            }
            if (indirizzi.Count == 0) return e;

            foreach (Persona p in Personale)
            {
                if (!p.Incluso) continue;
                string mia = (p.Email ?? "").Trim().ToLowerInvariant();
                if (mia != "" && nomeDi.ContainsKey(mia)) { p.Verificato = true; e.Confermati++; continue; }

                List<string> candidati = new List<string>();
                foreach (string ind in indirizzi)
                {
                    bool suo = StessaPersona(p.Nome, ind);
                    if (!suo && nomeDi[ind] != "" && p.Nome != "" &&
                        ChiaveNome(nomeDi[ind]) == ChiaveNome(p.Nome)) suo = true;
                    if (suo && !candidati.Contains(ind)) candidati.Add(ind);
                }

                string chiSono = (p.Nome != "") ? p.Nome : (mia != "" ? mia : "(riga senza nome)");
                if (candidati.Count == 1)
                {
                    if (mia == candidati[0]) { p.Verificato = true; e.Confermati++; }
                    else
                    {
                        e.Cambiati.Add(chiSono + ":   " + (mia == "" ? "(nessun indirizzo)" : mia) +
                                       "   ->   " + candidati[0]);
                        p.Email = candidati[0];
                        p.Verificato = true;
                        e.Corretti++;
                    }
                }
                else if (candidati.Count > 1)
                {
                    p.Verificato = false;
                    e.Ambigui++;
                    e.Mancanti.Add(chiSono + ":   piu' indirizzi possibili (" +
                                   string.Join(", ", candidati.ToArray()) + ")");
                }
                else
                {
                    p.Verificato = false;
                    e.NonTrovati++;
                    e.Mancanti.Add(chiSono + ":   " +
                                   (mia == "" ? "nessun indirizzo" : mia + " mai visto nella casella"));
                }
            }
            return e;
        }

        public static string Chiave(string s)
        {
            return Regex.Replace(SenzaAccenti(s ?? "").ToLowerInvariant(), "[^a-z0-9]", "");
        }

        public static string SenzaAccenti(string s)
        {
            string d = (s ?? "").Normalize(NormalizationForm.FormD);
            StringBuilder sb = new StringBuilder();
            foreach (char c in d)
                if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
            return sb.ToString().Normalize(NormalizationForm.FormC);
        }

        /// <summary>L'anno scolastico in corso, nella forma 2026-27. Cambia il primo settembre.</summary>
        public static string AnnoScolastico(DateTime quando)
        {
            int inizio = (quando.Month >= 9) ? quando.Year : quando.Year - 1;
            return inizio + "-" + ((inizio + 1) % 100).ToString("00");
        }

        // ===================================================================
        //  REGOLE DI PARTENZA
        //  Ognuna con il suo colore, tutti diversi e leggibili (il testo lo
        //  sceglie ColoriEtichette.Testo), e diversi anche dalle sfumature di
        //  blu delle sottoetichette dei ruoli sotto Colleghi: rosso la
        //  dirigenza, arancio la segreteria, giallo le circolari, azzurro il
        //  registro, blu i colleghi, verde gli studenti, grigio scuro il
        //  ministero, viola i sindacati, verde acqua la formazione, rosa gli
        //  orari, grigio le newsletter, marrone i genitori.
        // ===================================================================
        public static List<Regola> RegoleDiDefault()
        {
            List<Regola> r = new List<Regola>();

            Regola dirigenza = new Regola();
            dirigenza.Etichetta = "Dirigenza";
            dirigenza.Sorgente = "dirigenza";
            dirigenza.Descrizione = "Messaggi del dirigente scolastico e dei collaboratori. " +
                "Gli indirizzi si scrivono nella pagina \"La tua scuola\".";
            dirigenza.Colore = "#cc3a21/#ffffff";
            r.Add(dirigenza);

            Regola segreteria = new Regola();
            segreteria.Etichetta = "Segreteria";
            segreteria.Sorgente = "segreteria";
            segreteria.Descrizione = "Segreteria didattica e del personale. " +
                "Gli indirizzi si scrivono nella pagina \"La tua scuola\".";
            segreteria.Colore = "#ffad47/#000000";
            r.Add(segreteria);

            Regola circolari = new Regola();
            circolari.Etichetta = "Circolari";
            circolari.Oggetto.AddRange(new string[] { "circolare", "circolari", "circ.", "comunicazione n" });
            circolari.Descrizione = "Messaggi che hanno \"circolare\" o \"comunicazione n.\" " +
                "nell'oggetto, da chiunque arrivino.";
            circolari.Colore = "#fad165/#000000";
            r.Add(circolari);

            Regola registro = new Regola();
            registro.Etichetta = "Registro elettronico";
            registro.Sorgente = "registro";
            registro.Descrizione = "Avvisi automatici del registro elettronico. Di partenza " +
                "vale per ClasseViva (@spaggiari.eu): se la scuola usa un altro registro, scrivi " +
                "il suo dominio nella pagina \"La tua scuola\". Molti li archiviano subito: " +
                "sono notifiche, non posta da leggere.";
            registro.Colore = "#2da2bb/#000000";
            r.Add(registro);

            Regola colleghi = new Regola();
            colleghi.Etichetta = "Colleghi";
            colleghi.Da.Add("@PERSONALE@");
            colleghi.Descrizione = "Messaggi delle persone dell'elenco del personale. " +
                "Senza elenco questa regola non fa niente.";
            colleghi.Colore = "#4a86e8/#000000";
            r.Add(colleghi);

            Regola studenti = new Regola();
            studenti.Etichetta = "Studenti";
            studenti.Da.Add("@DOMINIO@");
            studenti.EscludiEtichette.AddRange(new string[] { "Colleghi", "Dirigenza", "Segreteria" });
            studenti.Descrizione = "Tutto il resto che arriva dal dominio della scuola: cioe' chi " +
                "non e' nell'elenco del personale. Per questo l'elenco conta davvero.";
            studenti.Colore = "#16a766/#000000";
            r.Add(studenti);

            Regola ministero = new Regola();
            ministero.Etichetta = "Ministero e USR";
            ministero.Da.AddRange(new string[]
            { "@istruzione.it", "@posta.istruzione.it", "@miur.it", "@mim.gov.it" });
            ministero.Descrizione = "Comunicazioni ministeriali e degli uffici scolastici regionali.";
            ministero.Colore = "#434343/#ffffff";
            r.Add(ministero);

            Regola sindacati = new Regola();
            sindacati.Etichetta = "Sindacati";
            sindacati.Da.AddRange(new string[]
            { "@flcgil.it", "@cislscuola.it", "@uilscuola.it", "@snals.it", "@anief.net", "@gildains.it" });
            sindacati.Archivia = true;
            sindacati.Descrizione = "Comunicati sindacali. Di norma si archiviano: restano " +
                "leggibili dall'etichetta ma liberano la Posta in arrivo.";
            sindacati.Colore = "#8e63ce/#000000";
            r.Add(sindacati);

            Regola formazione = new Regola();
            formazione.Etichetta = "Formazione e corsi";
            formazione.Attiva = false;
            formazione.Oggetto.AddRange(new string[]
            { "corso", "formazione", "webinar", "aggiornamento", "seminario" });
            formazione.Descrizione = "Corsi, webinar e aggiornamento. Parte spenta perche' le " +
                "parole sono generiche e puo' prendere piu' del dovuto: accendila e prova " +
                "prima con l'anteprima.";
            formazione.Colore = "#43d692/#000000";
            r.Add(formazione);

            Regola orari = new Regola();
            orari.Etichetta = "Orari";
            orari.Oggetto.AddRange(new string[] { "orario" });
            orari.Descrizione = "Gli orari mandati dallo strumento \"Orari\" di questa " +
                "applicazione, piu' tutto quello che ha \"orario\" nell'oggetto.";
            orari.Colore = "#f691b3/#000000";
            r.Add(orari);

            Regola newsletter = new Regola();
            newsletter.Etichetta = "Newsletter";
            newsletter.QueryLibera = "category:promotions OR unsubscribe";
            newsletter.Archivia = true;
            newsletter.Descrizione = "Promozioni e messaggi con il link per disiscriversi. " +
                "Vengono archiviati: e' la voce che libera piu' spazio nella Posta in arrivo.";
            newsletter.Colore = "#999999/#000000";
            r.Add(newsletter);

            Regola genitori = new Regola();
            genitori.Etichetta = "Genitori";
            genitori.Attiva = false;
            genitori.Descrizione = "Parte spenta: non c'e' un modo automatico per riconoscere " +
                "i genitori. Se hanno un dominio o un indirizzo ricorrente, premi \"Modifica\" " +
                "e aggiungilo tra i mittenti.";
            genitori.Colore = "#a46a21/#ffffff";
            r.Add(genitori);

            return r;
        }

        // ===================================================================
        //  LETTURA DEL JSON
        // ===================================================================
        public static string Str(Dictionary<string, object> d, string k, string def)
        {
            if (d == null || !d.ContainsKey(k) || d[k] == null) return def;
            return Convert.ToString(d[k]);
        }

        public static bool Bool(Dictionary<string, object> d, string k, bool def)
        {
            if (d == null || !d.ContainsKey(k) || d[k] == null) return def;
            try { return Convert.ToBoolean(d[k]); } catch { return def; }
        }

        public static int Int(Dictionary<string, object> d, string k, int def)
        {
            if (d == null || !d.ContainsKey(k) || d[k] == null) return def;
            try { return Convert.ToInt32(d[k]); } catch { return def; }
        }

        /// <summary>
        /// I colori delle sottoetichette dei ruoli scelti a mano: solo le cinque
        /// categorie, ognuna con un colore che Gmail accetta oppure "" (nessun
        /// colore). Quelle che mancano seguono il colore di Colleghi.
        /// </summary>
        static Dictionary<string, string> ColoriDeiRuoli(Dictionary<string, object> r)
        {
            Dictionary<string, string> fuori = new Dictionary<string, string>();
            Dictionary<string, object> d = (r != null && r.ContainsKey("coloriRuoli"))
                ? r["coloriRuoli"] as Dictionary<string, object> : null;
            if (d == null) return fuori;
            foreach (string c in Categorie)
                if (d.ContainsKey(c)) fuori[c] = ColoriEtichette.Pulito(Str(d, c, ""));
            return fuori;
        }

        public static List<string> Lista(Dictionary<string, object> d, string k)
        {
            List<string> fuori = new List<string>();
            if (d == null || !d.ContainsKey(k)) return fuori;
            object[] a = d[k] as object[];
            if (a == null) return fuori;
            foreach (object o in a)
            {
                if (o == null) continue;
                string s = Convert.ToString(o);
                if (s != "") fuori.Add(s);
            }
            return fuori;
        }
    }

    // =======================================================================
    //  I COLORI DELLE ETICHETTE DI GMAIL
    //
    //  GmailApp non sa colorare le etichette: lo fa il servizio avanzato Gmail
    //  API, e solo con i colori della tavolozza di Gmail, per lo sfondo come
    //  per il testo (Label.color): un altro valore fa fallire la chiamata. Un
    //  colore qui si scrive "sfondo/testo", per esempio "#16a766/#000000", e ""
    //  vuol dire nessun colore. Sta in questo file, senza finestre, perche'
    //  Carica controlla i colori letti dal file e da' quelli di partenza alle
    //  regole che non ne hanno mai avuto uno (quelle salvate fino alla 1.5.2).
    // =======================================================================
    static class ColoriEtichette
    {
        /// <summary>I valori che Gmail accetta, per lo sfondo e per il testo.</summary>
        public static readonly string[] Ammessi =
        {
            "#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#f3f3f3", "#ffffff",
            "#fb4c2f", "#ffad47", "#fad165", "#16a766", "#43d692", "#4a86e8", "#a479e2", "#f691b3",
            "#f6c5be", "#ffe6c7", "#fef1d1", "#b9e4d0", "#c6f3de", "#c9daf8", "#e4d7f5", "#fcdee8",
            "#efa093", "#ffd6a2", "#fce8b3", "#89d3b2", "#a0eac9", "#a4c2f4", "#d0bcf1", "#fbc8d9",
            "#e66550", "#ffbc6b", "#fcda83", "#44b984", "#68dfa9", "#6d9eeb", "#b694e8", "#f7a7c0",
            "#cc3a21", "#eaa041", "#f2c960", "#149e60", "#3dc789", "#3c78d8", "#8e63ce", "#e07798",
            "#ac2b16", "#cf8933", "#d5ae49", "#0b804b", "#2a9c68", "#285bac", "#653e9b", "#b65775",
            "#822111", "#a46a21", "#aa8831", "#076239", "#1a764d", "#1c4587", "#41236d", "#83334c",
            "#464646", "#e7e7e7", "#0d3472", "#b6cff5", "#0d3b44", "#98d7e4", "#3d188e", "#e3d7ff",
            "#711a36", "#fbd3e0", "#8a1c0a", "#f2b2a8", "#7a2e0b", "#ffc8af", "#7a4706", "#ffdeb5",
            "#594c05", "#fbe983", "#684e07", "#fdedc1", "#0b4f30", "#b3efd3", "#04502e", "#a2dcc1",
            "#c2c2c2", "#4986e7", "#2da2bb", "#b99aff", "#994a64", "#f691b2", "#ff7537", "#ffad46",
            "#662e37", "#ebdbde", "#cca6ac", "#094228", "#42d692", "#16a765"
        };

        /// <summary>
        /// La tavolozza del passo 4, come le colonne del menu dei colori di
        /// Gmail: una tinta per riga, dalla sfumatura piu' chiara alla piu'
        /// scura. Sono gli sfondi: il testo lo sceglie Testo, perche' si legga.
        /// Le sfumature di una tinta sono anche i colori delle sottoetichette
        /// dei ruoli, quando Colleghi ha quella tinta.
        /// </summary>
        public static readonly string[][] Tinte =
        {
            new string[] { "#f6c5be", "#efa093", "#e66550", "#fb4c2f", "#cc3a21", "#ac2b16", "#822111" },   // rossi
            new string[] { "#ffe6c7", "#ffd6a2", "#ffbc6b", "#ffad47", "#eaa041", "#cf8933", "#a46a21" },   // arancioni
            new string[] { "#fef1d1", "#fce8b3", "#fcda83", "#fad165", "#f2c960", "#d5ae49", "#aa8831" },   // gialli
            new string[] { "#b9e4d0", "#89d3b2", "#44b984", "#16a766", "#149e60", "#0b804b", "#076239" },   // verdi
            new string[] { "#c6f3de", "#a0eac9", "#68dfa9", "#43d692", "#3dc789", "#2a9c68", "#1a764d" },   // verde acqua
            new string[] { "#98d7e4", "#2da2bb", "#0d3b44" },                                              // azzurri
            new string[] { "#c9daf8", "#a4c2f4", "#6d9eeb", "#4a86e8", "#3c78d8", "#285bac", "#1c4587" },   // blu
            new string[] { "#e4d7f5", "#d0bcf1", "#b694e8", "#a479e2", "#8e63ce", "#653e9b", "#41236d" },   // viola
            new string[] { "#fcdee8", "#fbc8d9", "#f7a7c0", "#f691b3", "#e07798", "#b65775", "#83334c" },   // rosa
            new string[] { "#efefef", "#cccccc", "#999999", "#666666", "#434343", "#000000" }              // grigi
        };

        /// <summary>Vero se Gmail accetta questo valore, per lo sfondo o per il testo.</summary>
        public static bool Ammesso(string valore)
        {
            return Array.IndexOf(Ammessi, (valore ?? "").Trim().ToLowerInvariant()) >= 0;
        }

        /// <summary>Vero se e' "sfondo/testo" con tutti e due i valori fra quelli che Gmail accetta.</summary>
        public static bool Valido(string colore)
        {
            string[] parti = (colore ?? "").Trim().Split('/');
            return parti.Length == 2 && Ammesso(parti[0]) && Ammesso(parti[1]);
        }

        /// <summary>
        /// Il colore scritto come lo scrive Campanella (minuscolo, senza
        /// spazi), oppure "" (nessun colore) se Gmail non lo accetterebbe: un
        /// colore sbagliato, scritto a mano in campanella.json, non deve
        /// arrivare allo script e farlo fallire.
        /// </summary>
        public static string Pulito(string colore)
        {
            string c = (colore ?? "").Trim().ToLowerInvariant().Replace(" ", "");
            return Valido(c) ? c : "";
        }

        /// <summary>Lo sfondo di un colore ("" se non c'e' o non e' valido).</summary>
        public static string Sfondo(string colore)
        {
            string c = Pulito(colore);
            return (c == "") ? "" : c.Split('/')[0];
        }

        /// <summary>Il colore del testo di un colore ("" se non c'e' o non e' valido).</summary>
        public static string TestoDi(string colore)
        {
            string c = Pulito(colore);
            return (c == "") ? "" : c.Split('/')[1];
        }

        /// <summary>
        /// Il testo che si legge su uno sfondo: bianco se il contrasto arriva a
        /// 4,5 (il minimo delle WCAG per il testo normale), altrimenti nero, che
        /// allora lo supera sempre.
        /// </summary>
        public static string Testo(string sfondo)
        {
            return (Contrasto(sfondo, "#ffffff") >= 4.5) ? "#ffffff" : "#000000";
        }

        /// <summary>Uno sfondo della tavolozza con il suo testo: "sfondo/testo".</summary>
        public static string Coppia(string sfondo)
        {
            string s = (sfondo ?? "").Trim().ToLowerInvariant();
            return s + "/" + Testo(s);
        }

        /// <summary>Il contrasto fra due colori "#rrggbb", come lo misurano le WCAG (da 1 a 21).</summary>
        public static double Contrasto(string a, string b)
        {
            double la = Luminanza(a), lb = Luminanza(b);
            return (Math.Max(la, lb) + 0.05) / (Math.Min(la, lb) + 0.05);
        }

        static double Luminanza(string colore)
        {
            int v = Convert.ToInt32((colore ?? "").Trim().TrimStart('#'), 16);
            return 0.2126 * Lineare((v >> 16) & 0xFF) + 0.7152 * Lineare((v >> 8) & 0xFF) +
                   0.0722 * Lineare(v & 0xFF);
        }

        static double Lineare(int canale)
        {
            double x = canale / 255.0;
            return (x <= 0.03928) ? x / 12.92 : Math.Pow((x + 0.055) / 1.055, 2.4);
        }

        /// <summary>Tutti i colori della tavolozza, "sfondo/testo", tinta per tinta.</summary>
        public static List<string> Tavolozza()
        {
            List<string> fuori = new List<string>();
            foreach (string[] tinta in Tinte)
                foreach (string s in tinta) fuori.Add(Coppia(s));
            return fuori;
        }

        /// <summary>
        /// Le altre sfumature della tinta di un colore, dalla piu' chiara alla
        /// piu' scura, ognuna con il suo testo. Una tinta che ne ha meno dei
        /// ruoli (gli azzurri ne hanno tre) prende le altre dalla tinta dopo,
        /// dalla piu' chiara: cosi' ogni ruolo ha il suo colore. Vuoto se non
        /// c'e' colore o se lo sfondo non sta nella tavolozza.
        /// </summary>
        public static List<string> Sfumature(string colore)
        {
            List<string> fuori = new List<string>();
            string sfondo = Sfondo(colore);
            if (sfondo == "") return fuori;
            for (int t = 0; t < Tinte.Length; t++)
            {
                if (Array.IndexOf(Tinte[t], sfondo) < 0) continue;
                foreach (string s in Tinte[t]) if (s != sfondo) fuori.Add(Coppia(s));
                // la tinta vicina: quella dopo nella tavolozza (per l'ultima, quella prima)
                string[] vicina = Tinte[(t + 1 < Tinte.Length) ? t + 1 : t - 1];
                for (int k = 0; k < vicina.Length && fuori.Count < Stato.Categorie.Length; k++)
                    if (!fuori.Contains(Coppia(vicina[k]))) fuori.Add(Coppia(vicina[k]));
                break;
            }
            return fuori;
        }

        /// <summary>Il colore della regola dei colleghi, la madre delle sottoetichette dei ruoli ("" se non c'e').</summary>
        public static string DeiColleghi(List<Regola> regole)
        {
            // la stessa regola di GeneratorePosta.EtichettaColleghi: la prima che si chiama cosi'
            if (regole != null)
                foreach (Regola r in regole)
                    if ((r.Etichetta ?? "").Trim().ToLowerInvariant() == "colleghi") return Pulito(r.Colore);
            return "";
        }

        /// <summary>
        /// Il colore della sottoetichetta di un ruolo: quello scelto a mano, se
        /// c'e' ("" = nessun colore); altrimenti una sfumatura del colore di
        /// Colleghi, sempre la stessa per ogni categoria (nell'ordine di
        /// Stato.Categorie, dalla piu' chiara), cosi' segue Colleghi quando
        /// cambia. Colleghi senza colore: nessun colore.
        /// </summary>
        public static string DelRuolo(string coloreColleghi, string categoria, Dictionary<string, string> scelti)
        {
            if (scelti != null && categoria != null && scelti.ContainsKey(categoria)) return Pulito(scelti[categoria]);
            List<string> sfumature = Sfumature(coloreColleghi);
            int i = Array.IndexOf(Stato.Categorie, categoria);
            // Sfumature ne da' almeno una per categoria: nessuna si ripete
            if (i < 0 || i >= sfumature.Count) return "";
            return sfumature[i];
        }

        /// <summary>
        /// Gli sfondi gia' presi: quelli delle regole e delle sottoetichette di
        /// tutte e cinque le categorie (anche quelle che l'elenco non ha ancora).
        /// </summary>
        static List<string> SfondiUsati(List<Regola> regole, Dictionary<string, string> coloriRuoli)
        {
            List<string> fuori = new List<string>();
            foreach (Regola r in regole)
            {
                string s = Sfondo(r.Colore);
                if (s != "" && !fuori.Contains(s)) fuori.Add(s);
            }
            string colleghi = DeiColleghi(regole);
            foreach (string c in Stato.Categorie)
            {
                string s = Sfondo(DelRuolo(colleghi, c, coloriRuoli));
                if (s != "" && !fuori.Contains(s)) fuori.Add(s);
            }
            return fuori;
        }

        /// <summary>
        /// L'ordine in cui le regole nuove prendono i colori: prima le
        /// sfumature vive (la riga di mezzo del menu di Gmail), poi le scure,
        /// poi le chiare, una tinta dopo l'altra; per ultimi azzurri e grigi.
        /// Cosi' due regole nuove di seguito hanno colori che si distinguono.
        /// </summary>
        static List<string> OrdineDelleNuove()
        {
            List<string> fuori = new List<string>();
            int[] livelli = { 3, 4, 5, 2, 6, 1, 0 };
            foreach (int l in livelli)
                foreach (string[] tinta in Tinte)
                    if (tinta.Length == 7) fuori.Add(tinta[l]);
            foreach (string[] tinta in Tinte)
                foreach (string s in tinta)
                    if (!fuori.Contains(s)) fuori.Add(s);
            return fuori;
        }

        /// <summary>Il primo colore che nessuna etichetta usa ancora, per una regola nuova (se sono tutti presi, il primo).</summary>
        public static string PrimoLibero(List<Regola> regole, Dictionary<string, string> coloriRuoli)
        {
            List<string> usati = SfondiUsati(regole, coloriRuoli);
            List<string> ordine = OrdineDelleNuove();
            foreach (string s in ordine)
                if (!usati.Contains(s)) return Coppia(s);
            return Coppia(ordine[0]);
        }

        /// <summary>
        /// Da' un colore alle regole che non l'hanno mai avuto (Colore null:
        /// le regole salvate fino alla 1.5.2). Quelle di partenza riprendono
        /// il loro: Dirigenza, Segreteria e Registro riconosciute dalla
        /// sorgente, le altre dal nome. Le altre regole, o una di partenza il
        /// cui colore e' gia' preso, il primo libero. "" (nessun colore,
        /// scelto apposta) resta com'e'.
        /// </summary>
        public static void Completa(List<Regola> regole, Dictionary<string, string> coloriRuoli)
        {
            List<Regola> partenza = Stato.RegoleDiDefault();
            List<string> presi = new List<string>();
            foreach (Regola r in regole)
            {
                string s = Sfondo(r.Colore);
                if (s != "") presi.Add(s);
            }
            // prima per sorgente, poi per nome: una regola tua che si chiama
            // "Dirigenza" non deve portare via il colore a quella vera
            for (int giro = 0; giro < 2; giro++)
            {
                foreach (Regola r in regole)
                {
                    if (r.Colore != null) continue;
                    foreach (Regola d in partenza)
                    {
                        bool stessa = (giro == 0)
                            ? (r.Sorgente ?? "") != "" && r.Sorgente == d.Sorgente
                            : string.Equals((r.Etichetta ?? "").Trim(), d.Etichetta, StringComparison.OrdinalIgnoreCase);
                        if (!stessa) continue;
                        string s = Sfondo(d.Colore);
                        if (!presi.Contains(s)) { r.Colore = d.Colore; presi.Add(s); }
                        break;
                    }
                }
            }
            foreach (Regola r in regole)
                if (r.Colore == null) r.Colore = PrimoLibero(regole, coloriRuoli);
        }

        /// <summary>
        /// Da' un colore alle regole delle classi che non ne hanno (Colore null:
        /// appena create da "Le mie classi..."): sfumature diverse di una tinta
        /// sola, cosi' in Gmail le classi si riconoscono insieme e ognuna ha la
        /// sua, finche' le sfumature bastano (poi la meno usata). La tinta e'
        /// quella di una classe che ha gia' un colore; se nessuna ce l'ha, la
        /// prima tinta intera che nessun'altra regola usa (fra tutte, poi fra
        /// quelle accese), o quella che ne usano meno. Una classe nuova prende
        /// la prima sfumatura, dalla piu' chiara, che nessuna etichetta usa;
        /// un colore gia' dato, anche scelto a mano, resta.
        /// </summary>
        public static void DelleClassi(List<Regola> regole, Dictionary<string, string> coloriRuoli)
        {
            List<Regola> classi = new List<Regola>(), altre = new List<Regola>();
            bool mancano = false;
            foreach (Regola r in regole)
            {
                if (r.Sorgente == Regola.SorgenteClasse) { classi.Add(r); if (r.Colore == null) mancano = true; }
                else altre.Add(r);
            }
            if (!mancano) return;
            string[] sfumature = Tinte[TintaDelleClassi(classi, altre)];
            List<string> prese = new List<string>();
            foreach (Regola r in classi)
            {
                string s = Sfondo(r.Colore);
                if (s != "") prese.Add(s);
            }
            List<string> altrove = SfondiUsati(altre, coloriRuoli);
            foreach (Regola r in classi)
            {
                if (r.Colore != null) continue;
                // la prima che non usa nessuno; se non c'e', quella che usano
                // meno classi (anche una che usa un'altra regola)
                string scelta = null;
                foreach (string s in sfumature)
                    if (!prese.Contains(s) && !altrove.Contains(s)) { scelta = s; break; }
                if (scelta == null)
                {
                    int meno = int.MaxValue;
                    foreach (string s in sfumature)
                    {
                        int quante = prese.FindAll(delegate(string p) { return p == s; }).Count;
                        if (quante < meno) { meno = quante; scelta = s; }
                    }
                }
                r.Colore = Coppia(scelta);
                prese.Add(scelta);
            }
        }

        /// <summary>La riga di Tinte che ha questo sfondo, o -1.</summary>
        static int TintaDi(string sfondo)
        {
            if (string.IsNullOrEmpty(sfondo)) return -1;
            for (int t = 0; t < Tinte.Length; t++) if (Array.IndexOf(Tinte[t], sfondo) >= 0) return t;
            return -1;
        }

        /// <summary>La tinta delle classi (vedi DelleClassi): solo fra quelle con tutte e sette le sfumature.</summary>
        static int TintaDelleClassi(List<Regola> classi, List<Regola> altre)
        {
            foreach (Regola r in classi)
            {
                int t = TintaDi(Sfondo(r.Colore));
                if (t >= 0) return t;
            }
            int migliore = -1, meno = int.MaxValue;
            for (int giro = 0; giro < 2; giro++)
                for (int t = 0; t < Tinte.Length; t++)
                {
                    if (Tinte[t].Length < 7) continue;
                    int quante = 0;
                    foreach (Regola r in altre)
                        if ((giro == 0 || r.Attiva) && TintaDi(Sfondo(r.Colore)) == t) quante++;
                    if (quante == 0) return t;
                    if (giro == 1 && quante < meno) { meno = quante; migliore = t; }
                }
            return migliore;
        }
    }

    // =======================================================================
    //  I COLORI DELLE LEZIONI SUL CALENDARIO (Orari, passo 4)
    //
    //  Google Calendar da' agli eventi undici colori (CalendarApp.EventColor,
    //  da "1" a "11"), che nell'interfaccia italiana hanno un nome. Ogni classe
    //  dell'orario del docente ne prende uno, cosi' nello stesso calendario la
    //  2B ha un colore e la 3B un altro. Di partenza le classi li prendono in
    //  un ordine fisso, tutte diverse finche' ce ne sono, e poi li tengono
    //  (Stato.CalColori, che cambia quando DatiOrari.gs esce da Campanella:
    //  Ricorda); uno scelto a mano (Stato.CalColoriAMano) resta, e una classe
    //  gia' sul calendario (Stato.CalColoriScritti) non perde il suo per una
    //  che arriva. "" e' il colore del calendario. Sta in questo file, senza
    //  finestre, perche' Carica controlla i colori letti dal file.
    // =======================================================================
    static class ColoriLezioni
    {
        /// <summary>Le ore a disposizione, come le chiama il calendario (AnalisiOrario.Blocchi).</summary>
        public const string Disposizione = "A disposizione";
        /// <summary>Grafite: il colore di partenza delle ore a disposizione.</summary>
        public const string Grafite = "8";

        /// <summary>
        /// I colori nell'ordine del menu di Google Calendar: il valore
        /// (CalendarApp.EventColor), il nome nell'interfaccia italiana e il colore.
        /// </summary>
        public static readonly string[,] Tavolozza =
        {
            { "11", "Pomodoro", "#d50000" }, { "4", "Fenicottero", "#e67c73" }, { "6", "Mandarino", "#f4511e" },
            { "5", "Banana", "#f6bf26" }, { "2", "Salvia", "#33b679" }, { "10", "Basilico", "#0b8043" },
            { "7", "Pavone", "#039be5" }, { "9", "Mirtillo", "#3f51b5" }, { "1", "Lavanda", "#7986cb" },
            { "3", "Vinaccia", "#8e24aa" }, { "8", "Grafite", "#616161" }
        };

        /// <summary>
        /// L'ordine in cui le classi prendono i colori di partenza: ogni tinta
        /// lontana da quella prima (rosso, blu, verde, arancione, viola...), le
        /// piu' chiare dopo; Grafite per ultimo, e' delle ore a disposizione.
        /// </summary>
        public static readonly string[] Ordine = { "11", "9", "10", "6", "3", "7", "5", "4", "2", "1", "8" };

        static int Indice(string valore)
        {
            for (int i = 0; i < Tavolozza.GetLength(0); i++) if (Tavolozza[i, 0] == valore) return i;
            return -1;
        }

        /// <summary>Vero se e' un colore degli eventi di Google Calendar ("1".."11") oppure "", il colore del calendario.</summary>
        public static bool Valido(string valore)
        {
            return valore == "" || Indice(valore) >= 0;
        }

        /// <summary>Il nome del colore come in Google Calendar ("11" -> Pomodoro); "" e' il colore del calendario.</summary>
        public static string Nome(string valore)
        {
            int i = Indice(valore ?? "");
            return (i >= 0) ? Tavolozza[i, 1] : "colore del calendario";
        }

        /// <summary>Il colore "#rrggbb" per disegnarlo; "" per il colore del calendario.</summary>
        public static string Esadecimale(string valore)
        {
            int i = Indice(valore ?? "");
            return (i >= 0) ? Tavolozza[i, 2] : "";
        }

        /// <summary>
        /// I colori letti dal file: solo le classi con un nome e un colore che
        /// Google Calendar ha (o ""). Un valore scritto male a mano non arriva
        /// allo script: la classe riprende un colore di partenza.
        /// </summary>
        public static Dictionary<string, string> Letti(Dictionary<string, object> r, string chiave)
        {
            Dictionary<string, string> fuori = new Dictionary<string, string>();
            Dictionary<string, object> d = (r != null && r.ContainsKey(chiave)) ? r[chiave] as Dictionary<string, object> : null;
            if (d == null) return fuori;
            foreach (KeyValuePair<string, object> kv in d)
            {
                string classe = (kv.Key ?? "").Trim();
                string valore = (kv.Value == null) ? "" : Convert.ToString(kv.Value, CultureInfo.InvariantCulture).Trim();
                if (classe != "" && Valido(valore)) fuori[classe] = valore;
            }
            return fuori;
        }

        /// <summary>
        /// Le classi in ordine, una volta sola: prima il numero ("2B" prima di
        /// "10A"), poi il resto; "A disposizione" in fondo. Lo stesso ordine
        /// dello script (_orariOrdineClassi_).
        /// </summary>
        public static List<string> Ordinate(List<string> classi)
        {
            List<string> fuori = new List<string>();
            if (classi != null)
                foreach (string k in classi) if (!string.IsNullOrEmpty(k) && !fuori.Contains(k)) fuori.Add(k);
            fuori.Sort(Confronta);
            return fuori;
        }

        public static int Confronta(string a, string b)
        {
            string x = a ?? "", y = b ?? "";
            int dx = (x == Disposizione) ? 1 : 0, dy = (y == Disposizione) ? 1 : 0;
            if (dx != dy) return dx - dy;
            Match nx = Regex.Match(x, "^[0-9]+"), ny = Regex.Match(y, "^[0-9]+");
            if (nx.Success && ny.Success)
            {
                // come numeri: senza gli zeri davanti, conta la lunghezza e poi le cifre
                string cx = nx.Value.TrimStart('0'), cy = ny.Value.TrimStart('0');
                if (cx.Length != cy.Length) return cx.Length - cy.Length;
                int c = string.CompareOrdinal(cx, cy);
                if (c != 0) return c;
            }
            if (nx.Success != ny.Success) return nx.Success ? -1 : 1;
            return string.CompareOrdinal(x.ToLowerInvariant(), y.ToLowerInvariant());
        }

        static bool AMano(List<string> aMano, string classe)
        {
            return aMano != null && aMano.Contains(classe);
        }

        /// <summary>Vero se la classe ha lo stesso colore (non "") che aveva nell'ultimo DatiOrari.gs uscito (scritti).</summary>
        static bool SulCalendario(Dictionary<string, string> scritti, Dictionary<string, string> colori, string classe)
        {
            string s, v;
            return scritti != null && scritti.TryGetValue(classe, out s) && colori.TryGetValue(classe, out v) &&
                   v != "" && v == s;
        }

        /// <summary>
        /// Da' un colore alle classi (quelle dell'orario del docente) che non
        /// l'hanno ancora, e lo scrive in colori, dove resta. Uno scelto a mano
        /// (aMano) resta com'e', anche "" o uguale a quello di un'altra classe.
        /// Uno dato da Campanella resta, tranne quando e' uguale a quello di
        /// un'altra classe che lo tiene e c'e' ancora un colore che nessuna usa:
        /// allora la classe ne prende uno libero. Lo tengono prima quelle scelte
        /// a mano, poi quelle che lo avevano gia' nell'ultimo DatiOrari.gs uscito
        /// (scritti: le loro lezioni sono gia' sul calendario), poi le altre
        /// nell'ordine delle classi. Cosi' una classe che torna con un colore
        /// rimasto (di un altro anno, o dato mentre si scriveva il nome di un
        /// altro docente) non lo porta via a una che e' gia' sul calendario. Le
        /// classi nuove prendono il primo colore dell'Ordine che nessun'altra
        /// usa, le ore a disposizione Grafite; finiti i colori, quello usato da
        /// meno classi. Vero se ha cambiato qualcosa.
        /// </summary>
        public static bool Completa(Dictionary<string, string> colori, List<string> aMano, List<string> classi,
                                    Dictionary<string, string> scritti)
        {
            if (colori == null || classi == null) return false;
            List<string> ordinate = Ordinate(classi);
            // i colori gia' presi, uno per classe (si contano quando sono finiti)
            List<string> usati = new List<string>();
            foreach (string k in ordinate)
                if (AMano(aMano, k) && colori.ContainsKey(k) && colori[k] != "") usati.Add(colori[k]);
            // quanti colori non usa nessuna classe, tolti quelli che servono alle nuove
            List<string> tutti = new List<string>(usati);
            int nuove = 0;
            foreach (string k in ordinate)
            {
                if (!colori.ContainsKey(k)) nuove++;
                else if (!AMano(aMano, k) && colori[k] != "") tutti.Add(colori[k]);
            }
            int liberi = 0;
            foreach (string o in Ordine) if (!tutti.Contains(o)) liberi++;
            int daRifare = Math.Max(0, liberi - nuove);
            bool cambiato = false;
            // prima quelle con il colore che hanno gia' sul calendario, poi le altre
            List<string> passaggio = new List<string>();
            foreach (string k in ordinate) if (SulCalendario(scritti, colori, k)) passaggio.Add(k);
            foreach (string k in ordinate) if (!passaggio.Contains(k)) passaggio.Add(k);
            foreach (string k in passaggio)
            {
                if (AMano(aMano, k) || !colori.ContainsKey(k)) continue;
                string v = colori[k];
                if (v == "" || (usati.Contains(v) && daRifare > 0))
                {
                    if (v != "") daRifare--;
                    colori.Remove(k);
                    continue;
                }
                usati.Add(v);
            }
            // le classi senza colore: prima le ore a disposizione, che vogliono Grafite
            List<string> daDare = new List<string>();
            if (ordinate.Contains(Disposizione) && !colori.ContainsKey(Disposizione)) daDare.Add(Disposizione);
            foreach (string k in ordinate) if (!colori.ContainsKey(k) && k != Disposizione) daDare.Add(k);
            foreach (string k in daDare)
            {
                string v = null;
                if (k == Disposizione && !usati.Contains(Grafite)) v = Grafite;
                if (v == null) foreach (string o in Ordine) if (!usati.Contains(o)) { v = o; break; }
                if (v == null)
                {
                    // finiti: quello che usano meno classi, nell'ordine
                    int meno = int.MaxValue;
                    foreach (string o in Ordine)
                    {
                        int quante = 0;
                        foreach (string u in usati) if (u == o) quante++;
                        if (quante < meno) { meno = quante; v = o; }
                    }
                }
                colori[k] = v;
                usati.Add(v);
                cambiato = true;
            }
            return cambiato;
        }

        /// <summary>
        /// "Colori di partenza": le classi dimenticano i colori scelti a mano e
        /// quelli dati prima, e prendono quelli che Campanella darebbe se
        /// nessuna ne avesse uno.
        /// </summary>
        public static void DiPartenza(Dictionary<string, string> colori, List<string> aMano, List<string> classi)
        {
            if (colori == null || classi == null) return;
            foreach (string k in classi)
            {
                colori.Remove(k);
                if (aMano != null) aMano.Remove(k);
            }
            // nessuna di queste classi ha piu' un colore: quelli sul calendario non contano
            Completa(colori, aMano, classi, null);
        }

        /// <summary>
        /// I colori delle classi del calendario come li da' Campanella adesso
        /// (Completa), su una copia: le impostazioni non cambiano. Per il
        /// riepilogo, l'anteprima e DatiOrari.gs.
        /// </summary>
        public static Dictionary<string, string> DelCalendario(Stato s, List<string> classi)
        {
            Dictionary<string, string> colori = new Dictionary<string, string>();
            if (s == null) return colori;
            if (s.CalColori != null) foreach (KeyValuePair<string, string> kv in s.CalColori) colori[kv.Key] = kv.Value;
            Completa(colori, s.CalColoriAMano, classi ?? new List<string>(), s.CalColoriScritti);
            return colori;
        }

        /// <summary>
        /// DatiOrari.gs e' uscito da Campanella (copiato o salvato) con i colori
        /// di queste classi, quelle del calendario: i colori restano nelle
        /// impostazioni (CalColori) e sono quelli delle lezioni sul calendario
        /// (CalColoriScritti). Le classi che nel file non ci sono piu' tengono il
        /// colore, ma non come scelto a mano: se tornano non lo portano via a
        /// una classe gia' sul calendario.
        /// </summary>
        public static void Ricorda(Stato s, List<string> classi)
        {
            if (s == null || classi == null || classi.Count == 0) return;
            Dictionary<string, string> colori = DelCalendario(s, classi);
            s.CalColori = colori;
            List<string> aMano = new List<string>();
            if (s.CalColoriAMano != null)
                foreach (string k in s.CalColoriAMano) if (classi.Contains(k) && !aMano.Contains(k)) aMano.Add(k);
            s.CalColoriAMano = aMano;
            Dictionary<string, string> scritti = new Dictionary<string, string>();
            foreach (string k in classi)
            {
                string v;
                scritti[k] = colori.TryGetValue(k, out v) ? v : "";
            }
            s.CalColoriScritti = scritti;
        }

        /// <summary>"1A Pomodoro, 2B Mirtillo, A disposizione Grafite": i colori delle classi, in ordine.</summary>
        public static string Riassunto(Dictionary<string, string> colori, List<string> classi)
        {
            List<string> parti = new List<string>();
            foreach (string k in Ordinate(classi))
            {
                string v;
                if (colori == null || !colori.TryGetValue(k, out v)) v = "";
                parti.Add(k + " " + Nome(v));
            }
            return string.Join(", ", parti.ToArray());
        }
    }

    // =======================================================================
    //  "IL RIORDINO DELLA POSTA E' GIA' STATO FATTO?"
    //
    //  Due modi, dal piu' comodo al piu' sicuro:
    //   1. quello che l'applicazione sa gia' (le spunte dell'installazione);
    //   2. un codice breve che lo script stampa e che si incolla qui.
    // =======================================================================
    class StatoPosta
    {
        public bool Fatto;
        /// <summary>Il codice e' stato letto ma non basta a dirlo: vedi LeggiCodice.</summary>
        public bool Incerto;
        public string Come = "";          // come lo si e' capito
        public string Dettaglio = "";
        public DateTime Quando = DateTime.MinValue;
        public int Versione = 0;          // del codice incollato: CMP1 = 1
        /// <summary>La versione dello script che ha stampato il codice, se la porta in coda.</summary>
        public Version VersioneScript = null;
        /// <summary>Lo script dice di aver contato solo le etichette sue (S in coda al codice).</summary>
        public bool SoloSue = false;
        public int Etichette = 0;
        public int Conversazioni = 0;
        public bool Automazione = false;

        /// <summary>
        /// I passi facoltativi dell'installazione guidata della Posta, che stanno
        /// in fondo: oggi uno, il servizio Gmail API (colori, filtri veri e
        /// filtri che avevi gia' da togliere). Il
        /// numero dei passi invece non si copia qui: e' quello delle spunte che
        /// la pagina salva, una per passo.
        /// </summary>
        public const int PassiFacoltativi = 1;

        /// <summary>
        /// La prima versione dello script della Posta che, senza gruppo, conta
        /// solo le etichette che ha creato lui e lo dice in coda al codice (S e
        /// la versione in cifre, per esempio S10500). Da questa in poi un codice
        /// senza gruppo basta a dire "fatto". Un codice senza campo in coda (gli
        /// script di prima contavano tutte le etichette dell'account) o con T
        /// (lo script non ricordava quali etichette aveva creato, e ha contato
        /// quelle con i nomi delle regole, che possono essere anche tue) non basta.
        /// </summary>
        public static readonly Version VersioneSoloEtichetteDelloScript = new Version(1, 5, 0);

        public static StatoPosta Verifica(Stato s)
        {
            // --- 2. il codice incollato dall'utente --------------------------
            StatoPosta daCodice = LeggiCodice(s.CodiceStatoPosta, s.PrefissoPulito());
            if (daCodice != null && daCodice.Fatto) return daCodice;

            // --- 1. quello che sappiamo da soli ------------------------------
            // Per dire "fatto" servono tutti i passi obbligatori, non sette
            // spunte qualsiasi: prima bastava saltarne uno e spuntare il
            // facoltativo.
            StatoPosta r = new StatoPosta();
            List<bool> spunte = s.SpunteInstallazione ?? new List<bool>();
            int totale = spunte.Count;
            int obbligatori = Math.Max(0, totale - PassiFacoltativi);
            int spuntate = 0;
            List<string> mancano = new List<string>();
            for (int i = 0; i < totale; i++)
            {
                if (spunte[i]) spuntate++;
                else if (i < obbligatori) mancano.Add((i + 1).ToString(CultureInfo.InvariantCulture));
            }
            string conto = "Hai spuntato " + spuntate + (spuntate == 1 ? " passo su " : " passi su ") + totale;
            r.Etichette = ContaRegoleAttive(s);
            if (obbligatori > 0 && mancano.Count == 0)
            {
                r.Fatto = true;
                r.Come = "spunte dell'installazione";
                r.Dettaglio = conto + ".";
            }
            else if (spuntate > 0)
            {
                r.Fatto = false;
                r.Come = "installazione a meta'";
                r.Dettaglio = conto + (mancano.Count == 1 ? "; manca il passo " : "; mancano i passi ") +
                              string.Join(", ", mancano.ToArray()) + ".";
            }
            else
            {
                r.Fatto = false;
                r.Come = "mai iniziata";
                r.Dettaglio = "Non risulta nessun passo dell'installazione completato.";
            }
            return r;
        }

        static int ContaRegoleAttive(Stato s)
        {
            int n = 0;
            foreach (Regola x in s.Regole) if (x.Attiva) n++;
            return n;
        }

        /// <summary>
        /// Il codice ha la forma  CMP1-&lt;giorno&gt;-&lt;etichette&gt;-&lt;automazione&gt;-&lt;conversazioni&gt;
        /// e, dagli script piu' nuovi, un campo in coda: S o T e la versione dello
        /// script in cifre (S10500). E' pensato per essere letto a voce senza
        /// sbagliare. Si leggono solo cifre ASCII e numeri che stanno in un int:
        /// un codice incollato male e' "non riconosciuto" (null), non fa cadere il
        /// programma. Una versione piu' nuova (CMP2...) e altri campi in coda si
        /// accettano, e i campi che non si conoscono si ignorano.
        ///
        /// prefisso e' il gruppo delle etichette dello script. Senza gruppo gli
        /// script di prima contavano tutte le etichette dell'account, anche
        /// quelle messe a mano, e le contavano anche dopo ANNULLA_etichettatura:
        /// allora il codice non basta a dire che il riordino e' fatto (Incerto),
        /// a meno che non venga da uno script che conta solo le sue (S, dalla
        /// VersioneSoloEtichetteDelloScript). Con T non basta mai.
        /// </summary>
        public static StatoPosta LeggiCodice(string codice, string prefisso)
        {
            if (string.IsNullOrEmpty(codice)) return null;
            Match m = Regex.Match(codice.Trim().ToUpperInvariant(),
                @"^CMP([0-9]{1,4})-([0-9]{8})-([0-9]{1,10})-([01])-([0-9]{1,10})((?:-[0-9A-Z]{1,16})*)$");
            if (!m.Success) return null;

            int versione, etichette, conversazioni;
            DateTime quando;
            if (!Intero(m.Groups[1].Value, out versione) || versione < 1 ||
                !Intero(m.Groups[3].Value, out etichette) ||
                !Intero(m.Groups[5].Value, out conversazioni) ||
                !DateTime.TryParseExact(m.Groups[2].Value, "yyyyMMdd", CultureInfo.InvariantCulture,
                                        DateTimeStyles.None, out quando))
                return null;

            StatoPosta r = new StatoPosta();
            r.Versione = versione;
            r.Quando = quando;
            r.Etichette = etichette;
            r.Conversazioni = conversazioni;
            r.Automazione = (m.Groups[4].Value == "1");
            r.Come = "codice di verifica";
            bool conT = false;
            foreach (string campo in m.Groups[6].Value.Split(new char[] { '-' }, StringSplitOptions.RemoveEmptyEntries))
            {
                Match c = Regex.Match(campo, "^([ST])([0-9]{1,8})$");
                int cifre;
                if (!c.Success || r.VersioneScript != null || !Intero(c.Groups[2].Value, out cifre)) continue;
                r.VersioneScript = new Version(cifre / 10000, (cifre / 100) % 100, cifre % 100);
                r.SoloSue = (c.Groups[1].Value == "S");
                conT = !r.SoloSue;
            }
            bool soloDelloScript = r.SoloSue && r.VersioneScript >= VersioneSoloEtichetteDelloScript;
            r.Incerto = conT || (!soloDelloScript && (prefisso ?? "").Trim().Trim('/') == "");
            r.Fatto = !r.Incerto && etichette > 0 && conversazioni > 0;
            r.Dettaglio = (r.Incerto
                ? (conT ? "lo script non sa quali etichette ha creato lui, e ha contato anche quelle " +
                          "con gli stessi nomi che avevi gia' ("
                        : "il codice conta anche le etichette messe da te, perche' non hanno un gruppo (") +
                  etichette + " etichette, " + conversazioni + " conversazioni)."
                : "Riordinate " + conversazioni + " conversazioni in " + etichette +
                  " etichette il " + quando.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) + ".") +
                " Automazione " + (r.Automazione ? "attiva." : "spenta.");
            return r;
        }

        static bool Intero(string cifre, out int n)
        {
            return int.TryParse(cifre, NumberStyles.None, CultureInfo.InvariantCulture, out n);
        }
    }
}
