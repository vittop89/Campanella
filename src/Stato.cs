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
        // "dirigenza" | "segreteria" | "registro" | "" : i mittenti di queste
        // regole arrivano dai campi della pagina "La tua scuola"
        public string Sorgente = "";

        public Regola Copia()
        {
            Regola r = new Regola();
            r.Etichetta = Etichetta; r.Descrizione = Descrizione; r.Attiva = Attiva;
            r.Da = new List<string>(Da); r.Oggetto = new List<string>(Oggetto);
            r.Contiene = new List<string>(Contiene);
            r.EscludiEtichette = new List<string>(EscludiEtichette);
            r.QueryLibera = QueryLibera; r.Archivia = Archivia;
            r.SegnaComeLette = SegnaComeLette; r.Sorgente = Sorgente;
            return r;
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

    /// <summary>Una casella dell'orario: chi, quando, dove, con chi.</summary>
    class Lezione
    {
        public string Docente = "";
        public int Giorno = 0;        // 0 = lunedi'
        public int Ora = 1;           // 1 = prima ora
        public string Classe = "";
        public string Materia = "";
        public string Aula = "";

        public static readonly string[] Giorni =
        { "Lunedi'", "Martedi'", "Mercoledi'", "Giovedi'", "Venerdi'", "Sabato", "Domenica" };

        public string NomeGiorno
        {
            get { return (Giorno >= 0 && Giorno < Giorni.Length) ? Giorni[Giorno] : "?"; }
        }
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

        // ---- cartelle (generatore anno scolastico) --------------------------
        public string Drive = DriveDiDefault();
        public string Anno = "";                 // vuoto = quello calcolato dalla data
        public string Classi = "";
        public string CartelleExtra = "";

        // ---- moduli Google (lo script che collega il foglio dell'anno) ------
        public string ModuloPercorso = "";       // relativo al Drive, oppure solo il nome
        public string ModuloCartella = "";       // dentro la cartella dell'anno
        public string ModuloFoglio = "";         // nome del foglio, puo' contenere {anno}
        public string ModuloChiusura = "31/08";  // giorno/mese della chiusura automatica
        public bool ModuloChiudi = true;         // falso = nessuna chiusura automatica
        public bool ModuloSvuota = false;
        public bool ModuloDrive = true;

        // ---- anonimizzazione (rizzo-pii) -------------------------------------
        public string AnonIndirizzo = "http://127.0.0.1:5005";
        public string AnonDestinazione = "";
        public bool AnonReversibileTesto = true;
        public bool PrivacyLetta = false;

        // ---- orari -----------------------------------------------------------
        public List<Lezione> Lezioni = new List<Lezione>();   // dato personale (cognomi)
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

        // ===================================================================
        //  PERCORSI
        // ===================================================================
        public static string Percorso()
        {
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

        /// <summary>Vero se, con i dati nel Drive, il file dei dati non era li' all'avvio.</summary>
        public bool DatiNonTrovati = false;

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
            JavaScriptSerializer ser = new JavaScriptSerializer();
            ser.MaxJsonLength = 60 * 1024 * 1024;
            UTF8Encoding utf8 = new UTF8Encoding(false);

            Dictionary<string, object> r = Impostazioni();
            if (!DatiNelDrive)
                foreach (KeyValuePair<string, object> kv in Dati()) r[kv.Key] = kv.Value;

            try { File.WriteAllText(Percorso(), ser.Serialize(r), utf8); }
            catch (Exception ex) { UltimoErrore = ex.Message; }

            if (!DatiNelDrive) return;

            // i dati personali vanno nel Drive: nel file accanto all'eseguibile
            // non ne resta traccia. Se il Drive non e' montato non invento
            // cartelle altrove: le impostazioni si salvano, i dati aspettano.
            try
            {
                string dati = PercorsoDati();
                string cartella = Path.GetDirectoryName(dati);
                string radice = Path.GetDirectoryName(cartella);
                if (string.IsNullOrEmpty(radice) || !Directory.Exists(radice))
                    throw new Exception("non trovo la cartella del Drive (" + radice + ")");
                Directory.CreateDirectory(cartella);
                File.WriteAllText(dati, ser.Serialize(Dati()), utf8);
            }
            catch (Exception ex)
            {
                UltimoErrore = (UltimoErrore == "" ? "" : UltimoErrore + "; ") +
                               "dati nel Drive non salvati: " + ex.Message;
            }
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
            r["calNome"] = CalNome;
            r["calInizio"] = CalInizio;
            r["calFine"] = CalFine;
            r["calPrimaOra"] = CalPrimaOra;
            r["calMinutiOra"] = CalMinutiOra;
            r["calOreInizio"] = CalOreInizio;
            r["calColore"] = CalColore;
            r["anonIndirizzo"] = AnonIndirizzo;
            r["anonDestinazione"] = AnonDestinazione;
            r["anonReversibileTesto"] = AnonReversibileTesto;
            r["privacyLetta"] = PrivacyLetta;

            List<object> sp = new List<object>();
            foreach (bool b in SpunteInstallazione) sp.Add(b);
            r["installazione"] = sp;
            return r;
        }

        /// <summary>I dati personali di altre persone: personale, indirizzi, orari.</summary>
        Dictionary<string, object> Dati()
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["dirigenza"] = Dirigenza;
            r["segreteria"] = Segreteria;
            r["calDocente"] = CalDocente;

            List<object> pers = new List<object>();
            foreach (Persona p in Personale)
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["nome"] = p.Nome; d["ruolo"] = p.Ruolo;
                d["email"] = p.Email; d["incluso"] = p.Incluso;
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
                d["lette"] = x.SegnaComeLette; d["sorgente"] = x.Sorgente;
                reg.Add(d);
            }
            r["regole"] = reg;

            List<object> lez = new List<object>();
            foreach (Lezione l in Lezioni)
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["d"] = l.Docente; d["g"] = l.Giorno; d["o"] = l.Ora;
                d["c"] = l.Classe; d["m"] = l.Materia; d["a"] = l.Aula;
                lez.Add(d);
            }
            r["lezioni"] = lez;
            return r;
        }

        // ===================================================================
        //  LETTURA
        // ===================================================================
        public static Stato Carica()
        {
            Stato s = new Stato();
            try
            {
                string p = Percorso();
                if (!File.Exists(p)) return s;

                Dictionary<string, object> r = LeggiJson(p);
                if (r == null) return s;

                s.TemaScuro = Bool(r, "temaScuro", true);
                s.ConsensoVersione = Int(r, "consensoVersione", 0);
                s.ConsensoData = Str(r, "consensoData", "");
                s.DatiNelDrive = Bool(r, "datiNelDrive", false);
                s.CartellaDati = Str(r, "cartellaDati", "");
                s.Dominio = Str(r, "dominio", s.Dominio);
                s.Prefisso = Str(r, "prefisso", s.Prefisso);
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
                s.ModuloChiusura = Str(r, "moduloChiusura", "31/08");
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

                // i dati personali: dal Drive se cosi' e' stato scelto,
                // altrimenti dallo stesso file (com'era nelle versioni precedenti)
                if (s.DatiNelDrive)
                {
                    string dati = s.PercorsoDati();
                    if (File.Exists(dati))
                    {
                        Dictionary<string, object> d = LeggiJson(dati);
                        if (d != null) s.LeggiDati(d);
                    }
                    else
                    {
                        s.DatiNonTrovati = true;
                        // se il file accanto all'exe li ha ancora (cambio di
                        // modalita' non completato), meglio non perderli
                        s.LeggiDati(r);
                    }
                }
                else s.LeggiDati(r);
            }
            catch { /* file illeggibile: si riparte dai valori di partenza */ }
            return s;
        }

        static Dictionary<string, object> LeggiJson(string percorso)
        {
            JavaScriptSerializer ser = new JavaScriptSerializer();
            ser.MaxJsonLength = 60 * 1024 * 1024;
            return ser.DeserializeObject(File.ReadAllText(percorso, Encoding.UTF8)) as Dictionary<string, object>;
        }

        void LeggiDati(Dictionary<string, object> r)
        {
            Dirigenza = Str(r, "dirigenza", Dirigenza);
            Segreteria = Str(r, "segreteria", Segreteria);
            CalDocente = Str(r, "calDocente", CalDocente);

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
                    x.Sorgente = Str(d, "sorgente", "");
                    lette.Add(x);
                }
                if (lette.Count > 0) Regole = lette;
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
                    l.Materia = Str(d, "m", "");
                    l.Aula = Str(d, "a", "");
                    if (l.Docente != "") Lezioni.Add(l);
                }
            }
        }

        /// <summary>
        /// Cambia dove stanno i dati personali. Tornando ai dati accanto
        /// all'eseguibile, il file nel Drive viene cancellato: non ha senso
        /// lasciarne due copie che poi divergono.
        /// </summary>
        public bool SpostaDati(bool nelDrive, string cartella, out string errore)
        {
            errore = "";
            string vecchio = DatiNelDrive ? PercorsoDati() : null;
            DatiNelDrive = nelDrive;
            CartellaDati = nelDrive ? (cartella ?? "").Trim() : CartellaDati;
            Salva();
            if (UltimoErrore != "") { errore = UltimoErrore; return false; }
            if (!nelDrive && vecchio != null)
            {
                try { if (File.Exists(vecchio)) File.Delete(vecchio); }
                catch (Exception ex) { errore = "impostazioni salvate, ma non riesco a togliere " + vecchio + ": " + ex.Message; }
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

        /// <summary>Indirizzo del docente il cui nominativo assomiglia a quello dato.</summary>
        public Persona TrovaPersona(string nominativo)
        {
            string chiave = Chiave(nominativo);
            if (chiave == "") return null;

            // 1) corrispondenza esatta sul nominativo normalizzato
            foreach (Persona p in Personale)
                if (Chiave(p.Nome) == chiave) return p;

            // 2) stesse parole in ordine diverso ("ROSSI MARIO" / "Mario Rossi")
            List<string> parole = Parole(nominativo);
            foreach (Persona p in Personale)
            {
                List<string> altre = Parole(p.Nome);
                if (altre.Count != parole.Count || altre.Count == 0) continue;
                bool tutte = true;
                foreach (string w in parole) if (!altre.Contains(w)) { tutte = false; break; }
                if (tutte) return p;
            }

            // 3) cognome + iniziale del nome ("ROSSI M." su "ROSSI MARIO")
            if (parole.Count >= 2)
            {
                foreach (Persona p in Personale)
                {
                    List<string> altre = Parole(p.Nome);
                    if (altre.Count < 2) continue;
                    if (altre[0] != parole[0]) continue;
                    if (altre[1].StartsWith(parole[1]) || parole[1].StartsWith(altre[1])) return p;
                }
            }
            return null;
        }

        public static List<string> Parole(string s)
        {
            List<string> fuori = new List<string>();
            foreach (string w in (s ?? "").Split(new char[] { ' ', '.', ',', '\t' },
                                                 StringSplitOptions.RemoveEmptyEntries))
            {
                string k = Chiave(w);
                if (k != "") fuori.Add(k);
            }
            return fuori;
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
        // ===================================================================
        public static List<Regola> RegoleDiDefault()
        {
            List<Regola> r = new List<Regola>();

            Regola dirigenza = new Regola();
            dirigenza.Etichetta = "Dirigenza";
            dirigenza.Sorgente = "dirigenza";
            dirigenza.Descrizione = "Messaggi del dirigente scolastico e dei collaboratori. " +
                "Gli indirizzi si scrivono nella pagina \"La tua scuola\".";
            r.Add(dirigenza);

            Regola segreteria = new Regola();
            segreteria.Etichetta = "Segreteria";
            segreteria.Sorgente = "segreteria";
            segreteria.Descrizione = "Segreteria didattica e del personale. " +
                "Gli indirizzi si scrivono nella pagina \"La tua scuola\".";
            r.Add(segreteria);

            Regola circolari = new Regola();
            circolari.Etichetta = "Circolari";
            circolari.Oggetto.AddRange(new string[] { "circolare", "circolari", "circ.", "comunicazione n" });
            circolari.Descrizione = "Messaggi che hanno \"circolare\" o \"comunicazione n.\" " +
                "nell'oggetto, da chiunque arrivino.";
            r.Add(circolari);

            Regola registro = new Regola();
            registro.Etichetta = "Registro elettronico";
            registro.Sorgente = "registro";
            registro.Descrizione = "Avvisi automatici del registro elettronico. Di partenza " +
                "vale per ClasseViva (@spaggiari.eu): se la scuola usa un altro registro, scrivi " +
                "il suo dominio nella pagina \"La tua scuola\". Molti li archiviano subito: " +
                "sono notifiche, non posta da leggere.";
            r.Add(registro);

            Regola colleghi = new Regola();
            colleghi.Etichetta = "Colleghi";
            colleghi.Da.Add("@PERSONALE@");
            colleghi.Descrizione = "Messaggi delle persone dell'elenco del personale. " +
                "Senza elenco questa regola non fa niente.";
            r.Add(colleghi);

            Regola studenti = new Regola();
            studenti.Etichetta = "Studenti";
            studenti.Da.Add("@DOMINIO@");
            studenti.EscludiEtichette.AddRange(new string[] { "Colleghi", "Dirigenza", "Segreteria" });
            studenti.Descrizione = "Tutto il resto che arriva dal dominio della scuola: cioe' chi " +
                "non e' nell'elenco del personale. Per questo l'elenco conta davvero.";
            r.Add(studenti);

            Regola ministero = new Regola();
            ministero.Etichetta = "Ministero e USR";
            ministero.Da.AddRange(new string[]
            { "@istruzione.it", "@posta.istruzione.it", "@miur.it", "@mim.gov.it" });
            ministero.Descrizione = "Comunicazioni ministeriali e degli uffici scolastici regionali.";
            r.Add(ministero);

            Regola sindacati = new Regola();
            sindacati.Etichetta = "Sindacati";
            sindacati.Da.AddRange(new string[]
            { "@flcgil.it", "@cislscuola.it", "@uilscuola.it", "@snals.it", "@anief.net", "@gildains.it" });
            sindacati.Archivia = true;
            sindacati.Descrizione = "Comunicati sindacali. Di norma si archiviano: restano " +
                "leggibili dall'etichetta ma liberano la Posta in arrivo.";
            r.Add(sindacati);

            Regola formazione = new Regola();
            formazione.Etichetta = "Formazione e corsi";
            formazione.Attiva = false;
            formazione.Oggetto.AddRange(new string[]
            { "corso", "formazione", "webinar", "aggiornamento", "seminario" });
            formazione.Descrizione = "Corsi, webinar e aggiornamento. Parte spenta perche' le " +
                "parole sono generiche e puo' prendere piu' del dovuto: accendila e prova " +
                "prima con l'anteprima.";
            r.Add(formazione);

            Regola orari = new Regola();
            orari.Etichetta = "Orari";
            orari.Oggetto.AddRange(new string[] { "orario" });
            orari.Descrizione = "Gli orari mandati dallo strumento \"Orari\" di questa " +
                "applicazione, piu' tutto quello che ha \"orario\" nell'oggetto.";
            r.Add(orari);

            Regola newsletter = new Regola();
            newsletter.Etichetta = "Newsletter";
            newsletter.QueryLibera = "category:promotions OR unsubscribe";
            newsletter.Archivia = true;
            newsletter.Descrizione = "Promozioni e messaggi con il link per disiscriversi. " +
                "Vengono archiviati: e' la voce che libera piu' spazio nella Posta in arrivo.";
            r.Add(newsletter);

            Regola genitori = new Regola();
            genitori.Etichetta = "Genitori";
            genitori.Attiva = false;
            genitori.Descrizione = "Parte spenta: non c'e' un modo automatico per riconoscere " +
                "i genitori. Se hanno un dominio o un indirizzo ricorrente, premi \"Modifica\" " +
                "e aggiungilo tra i mittenti.";
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
    //  "IL RIORDINO DELLA POSTA E' GIA' STATO FATTO?"
    //
    //  Due modi, dal piu' comodo al piu' sicuro:
    //   1. quello che l'applicazione sa gia' (le spunte dell'installazione);
    //   2. un codice breve che lo script stampa e che si incolla qui.
    // =======================================================================
    class StatoPosta
    {
        public bool Fatto;
        public string Come = "";          // come lo si e' capito
        public string Dettaglio = "";
        public DateTime Quando = DateTime.MinValue;
        public int Etichette = 0;
        public bool Automazione = false;

        public const int PassiInstallazione = 8;

        public static StatoPosta Verifica(Stato s)
        {
            // --- 2. il codice incollato dall'utente --------------------------
            StatoPosta daCodice = LeggiCodice(s.CodiceStatoPosta);
            if (daCodice != null && daCodice.Fatto) return daCodice;

            // --- 1. quello che sappiamo da soli ------------------------------
            StatoPosta r = new StatoPosta();
            int spuntate = 0;
            foreach (bool b in s.SpunteInstallazione) if (b) spuntate++;
            r.Etichette = ContaRegoleAttive(s);
            if (spuntate >= 7)
            {
                r.Fatto = true;
                r.Come = "spunte dell'installazione";
                r.Dettaglio = "Hai spuntato " + spuntate + " passi su " + PassiInstallazione + ".";
            }
            else if (spuntate > 0)
            {
                r.Fatto = false;
                r.Come = "installazione a meta'";
                r.Dettaglio = "Hai spuntato " + spuntate + " passi su " + PassiInstallazione + ".";
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
        /// ed e' pensato per essere letto a voce senza sbagliare.
        /// </summary>
        public static StatoPosta LeggiCodice(string codice)
        {
            if (string.IsNullOrEmpty(codice)) return null;
            Match m = Regex.Match(codice.Trim().ToUpperInvariant(),
                @"^CMP1-(\d{8})-(\d+)-([01])-(\d+)$");
            if (!m.Success) return null;

            StatoPosta r = new StatoPosta();
            DateTime.TryParseExact(m.Groups[1].Value, "yyyyMMdd", CultureInfo.InvariantCulture,
                                   DateTimeStyles.None, out r.Quando);
            r.Etichette = int.Parse(m.Groups[2].Value);
            r.Automazione = (m.Groups[3].Value == "1");
            int conversazioni = int.Parse(m.Groups[4].Value);
            r.Fatto = (r.Etichette > 0 && conversazioni > 0);
            r.Come = "codice di verifica";
            r.Dettaglio = "Riordinate " + conversazioni + " conversazioni in " + r.Etichette +
                          " etichette il " + r.Quando.ToString("dd/MM/yyyy") + ". Automazione " +
                          (r.Automazione ? "attiva." : "spenta.");
            return r;
        }
    }
}
