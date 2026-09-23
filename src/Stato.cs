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
        public string ModuloChiusura = "31/08";  // giorno/mese della chiusura automatica
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

        /// <summary>Vero se, con i dati nel Drive, il file dei dati non era li' all'avvio.</summary>
        public bool DatiNonTrovati = false;

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
        /// </summary>
        public const int Formato = 1;

        // Il file dei dati che questa sessione ha letto o scritto, o che l'utente
        // ha scelto di sostituire: e' l'unico che Salva puo' sovrascrivere.
        string datiLetti = "";
        // quel file com'era quando questa sessione l'ha letto o scritto, per
        // accorgersi se poi l'ha cambiato un altro computer; null = l'utente ha
        // scelto di sostituirlo, qualunque cosa ci sia
        byte[] datiSulDisco = null;
        // un altro computer ha cambiato il file dei dati dopo l'avvio
        bool datiCambiatiFuori = false;
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
            JavaScriptSerializer ser = new JavaScriptSerializer();
            ser.MaxJsonLength = 60 * 1024 * 1024;
            UTF8Encoding utf8 = new UTF8Encoding(false);

            // prima i dati nel Drive: se non si possono scrivere, l'elenco che
            // sta ancora in campanella.json non deve sparire anche da li'
            bool datiScritti = DatiNelDrive && !datiDaRileggere && SalvaDatiNelDrive(ser, utf8);
            bool conDati = !DatiNelDrive || (!datiScritti && !datiDaRileggere && datiNelFileLocale);

            Dictionary<string, object> r = Impostazioni();
            if (conDati)
            {
                foreach (KeyValuePair<string, object> kv in Dati()) r[kv.Key] = kv.Value;
                // le chiavi sconosciute del file dei dati seguono i dati: tornando
                // accanto al programma non si perdono, e tornando nel Drive ci vanno
                foreach (KeyValuePair<string, object> kv in altroDati)
                    if (!r.ContainsKey(kv.Key)) r[kv.Key] = kv.Value;
            }
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
                    // cambiato altrove, ma qui niente di nuovo: non si perde niente
                    bool dire = (ErroreDati != "" && !datiCambiatiFuori) || DatiCambiati();
                    Problema("dati nel Drive non salvati: non sovrascrivo " + dati + ", che " + perche,
                        !dire ? "" :
                        "Il file dei dati nel Drive\n\n" + dati + "\n\n" + perche + ". Per non perdere " +
                        "quello che contiene non l'ho sovrascritto: le modifiche di adesso all'elenco del " +
                        "personale, agli indirizzi e agli orari non sono state salvate.\n\n" +
                        "Se il Drive stava ancora sincronizzando, riapri Campanella fra qualche minuto. " +
                        "Altrimenti, in Impostazioni, premi Applica accanto alla cartella dei dati: " +
                        "potrai scegliere se usare quel file o sostituirlo.");
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
                File.WriteAllBytes(dati, testo);
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
            r["calNome"] = CalNome;          // "Orario " + un cognome: segue i dati personali

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
                d["lette"] = x.SegnaComeLette; d["sorgente"] = x.Sorgente;
                reg.Add(d);
            }
            r["regole"] = reg;

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
        /// in fondo: oggi uno, i filtri veri di Gmail. Il numero dei passi invece
        /// non si copia qui: e' quello delle spunte che la pagina salva, una per
        /// passo.
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
