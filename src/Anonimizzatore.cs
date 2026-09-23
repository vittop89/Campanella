// ===========================================================================
//  Anonimizzatore.cs - toglie i dati personali dai file scaricati
//
//  Si appoggia a rizzo-pii (https://github.com/Rizzo-AI-Academy/rizzo-pii),
//  un modello italiano che riconosce 22 categorie di dati personali e gira
//  in locale sulla CPU. L'applicazione desktop di rizzo-pii, il container
//  Docker e l'avvio da sorgente espongono tutti lo stesso servizio HTTP su
//  127.0.0.1:5005:
//
//      GET  /health    200 = modello caricato e pronto
//      POST /analyze   {"text": "..."}  -> { anonymized_text, n_entities, ... }
//      POST /analyze   file=@x.pdf|.md|.txt  (multipart)  -> come sopra
//      POST /pdf       file=@x.pdf  -> il PDF anonimizzato, in binario
//
//  Niente esce dal computer: il servizio e' in ascolto solo su localhost e
//  il modello sta su disco. Qui lo si fa anche rispettare: un indirizzo che
//  non punta a questo computer viene rifiutato prima di mandare qualcosa
//  (vedi Url). Se rizzo-pii non e' avviato, qui non succede niente:
//  l'applicazione lo dice e si ferma.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

namespace Campanella
{
    class SaluteAnonimizzatore
    {
        public bool Pronto = false;
        public string Messaggio = "";
        public string Modello = "";
        public string Versione = "";
        public string Dispositivo = "";
        public int Categorie = 0;
    }

    class EsitoFile
    {
        public string Origine = "";
        public string Destinazione = "";
        public bool Fatto = false;
        public bool Saltato = false;
        public int Entita = 0;
        public string Nota = "";
    }

    class Anonimizzatore
    {
        /// <summary>La versione di rizzo-pii con cui e' stato controllato il
        /// protocollo qui sotto (campi di /health e /analyze, intestazioni di /pdf).</summary>
        public const string VersioneRizzoProvata = "2.0.0";

        public string Indirizzo = Stato.AnonIndirizzoDiDefault;
        public bool ConDizionario = false;     // false = anonimizzazione definitiva
        public int TimeoutMs = 300000;         // la CPU su un PDF lungo se la prende comoda

        static readonly string[] EstensioniTesto = { ".txt", ".md", ".csv", ".htm", ".html" };

        // ===================================================================
        public SaluteAnonimizzatore Salute()
        {
            SaluteAnonimizzatore s = new SaluteAnonimizzatore();
            // un indirizzo fuori dal computer non si prova nemmeno: risposta subito
            if (UriLocale(Indirizzo + "/health") == null) { s.Messaggio = NonLocale(); return s; }
            try
            {
                HttpWebRequest req = Richiesta("/health", 4000);
                req.Method = "GET";
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    Dictionary<string, object> d = Json(r.ReadToEnd());
                    s.Pronto = Stato.Bool(d, "model_loaded", false);
                    s.Modello = Stato.Str(d, "model", "");
                    s.Versione = Stato.Str(d, "app_version", "");
                    s.Dispositivo = Stato.Str(d, "device", "");
                    s.Categorie = Stato.Int(d, "tags", 0);
                    s.Messaggio = s.Pronto
                        ? "rizzo-pii pronto: modello " + s.Modello + " su " + s.Dispositivo +
                          ", " + s.Categorie + " categorie di dati personali."
                        : "rizzo-pii e' avviato ma sta ancora caricando il modello: riprova fra poco.";
                }
            }
            catch (WebException ex)
            {
                HttpWebResponse resp = ex.Response as HttpWebResponse;
                if (resp != null && (int)resp.StatusCode == 503)
                    s.Messaggio = "rizzo-pii e' avviato ma sta ancora caricando il modello: " +
                                  "aspetta una decina di secondi e riprova.";
                else
                    s.Messaggio =
                        "Non trovo rizzo-pii in ascolto su " + Indirizzo + ".\n\n" +
                        "Avvia l'applicazione Rizzo PII (o il container Docker) e riprova. " +
                        "Se l'hai messa su un'altra porta, cambiala qui sopra.";
            }
            catch (Exception ex)
            {
                s.Messaggio = "Errore parlando con rizzo-pii: " + ex.Message;
            }
            return s;
        }

        // ===================================================================
        /// <summary>Vero se rizzo-pii sa leggere questo tipo di file.</summary>
        public static bool Trattabile(string percorso)
        {
            string est = Path.GetExtension(percorso).ToLowerInvariant();
            return est == ".pdf" || Array.IndexOf(EstensioniTesto, est) >= 0;
        }

        /// <summary>Vero se e' un file di lavoro di qualcun altro: a mezza
        /// sincronizzazione, aperto da Word, nascosto. Non va toccato.</summary>
        public static bool Temporaneo(string percorso)
        {
            string nome = Path.GetFileName(percorso);
            if (nome.StartsWith("~$") || nome.StartsWith(".")) return true;
            string est = Path.GetExtension(nome).ToLowerInvariant();
            return est == ".tmp" || est == ".partial" || est == ".crdownload" ||
                   est == ".download" || est == ".driveupload" || est == ".drivedownload";
        }

        /// <summary>I formati che si possono ripulire, per i messaggi:
        /// "PDF, TXT, MD, ...". Viene dallo stesso elenco di Trattabile.</summary>
        public static string Formati()
        {
            List<string> f = new List<string>();
            f.Add("PDF");
            foreach (string e in EstensioniTesto) f.Add(e.TrimStart('.').ToUpperInvariant());
            return string.Join(", ", f.ToArray());
        }

        /// <summary>Il filtro per la finestra "Apri": gli stessi formati di Trattabile.</summary>
        public static string FiltroFile()
        {
            string modelli = "*.pdf";
            foreach (string e in EstensioniTesto) modelli += ";*" + e;
            return "Documenti (" + modelli + ")|" + modelli + "|Tutti i file (*.*)|*.*";
        }

        // ===================================================================
        //  ORIGINALI AL SICURO
        // ===================================================================
        /// <summary>Vero se i due percorsi indicano lo stesso file.</summary>
        public static bool StessoFile(string a, string b)
        {
            try
            {
                return string.Equals(Path.GetFullPath(a).TrimEnd('\\', '/'),
                                     Path.GetFullPath(b).TrimEnd('\\', '/'),
                                     StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }     // un percorso non valido non si scrive comunque
        }

        /// <summary>Se la cartella delle copie pulite e' quella di uno dei file,
        /// torna quella cartella; altrimenti null. Le copie finirebbero sopra
        /// gli originali.</summary>
        public static string CartellaDiOrigine(IList<string> file, string destinazione)
        {
            foreach (string f in file)
            {
                string cartella;
                try { cartella = Path.GetDirectoryName(Path.GetFullPath(f)); }
                catch { continue; }
                if (!string.IsNullOrEmpty(cartella) && StessoFile(cartella, destinazione)) return cartella;
            }
            return null;
        }

        /// <summary>Il nome della copia pulita di ogni file, tutti diversi fra
        /// loro: due "verbale.pdf" di sottocartelle diverse diventano
        /// "verbale.pdf" e "verbale (2).pdf", e nessuno finisce sopra l'altro.
        /// Un nome che compare una volta sola resta com'e'.</summary>
        public static string[] NomiDiUscita(IList<string> file)
        {
            string[] nomi = new string[file.Count];
            // prima tutti i nomi veri, cosi' un numero aggiunto non ne copre uno
            Dictionary<string, bool> presi = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            foreach (string f in file) presi[Path.GetFileName(f)] = false;
            for (int i = 0; i < file.Count; i++)
            {
                string nome = Path.GetFileName(file[i]);
                if (presi[nome])
                {
                    string radice = Path.GetFileNameWithoutExtension(nome), est = Path.GetExtension(nome);
                    int n = 2;
                    do nome = radice + " (" + n++ + ")" + est; while (presi.ContainsKey(nome));
                }
                presi[nome] = true;
                nomi[i] = nome;
            }
            return nomi;
        }

        // ===================================================================
        /// <summary>Anonimizza un file e scrive il risultato. Torna cosa e' successo.</summary>
        public EsitoFile Anonimizza(string origine, string destinazione)
        {
            EsitoFile e = new EsitoFile();
            e.Origine = origine;
            e.Destinazione = destinazione;
            string est = Path.GetExtension(origine).ToLowerInvariant();

            if (StessoFile(origine, destinazione))
            {
                e.Saltato = true;
                e.Nota = "la copia pulita finirebbe sopra l'originale: scegli un'altra cartella";
                return e;
            }

            try
            {
                if (est == ".pdf")
                {
                    int redazioni, residui;
                    byte[] dati = PdfAnonimo(origine, out redazioni, out residui);
                    Directory.CreateDirectory(Path.GetDirectoryName(destinazione));
                    File.WriteAllBytes(destinazione, dati);
                    e.Fatto = true;
                    e.Entita = redazioni;
                    if (residui > 0)
                        e.Nota = residui + " valori non e' riuscito a toglierli (testo dentro " +
                                 "un'immagine o carattere strano): controlla il file.";
                    return e;
                }

                if (Array.IndexOf(EstensioniTesto, est) >= 0)
                {
                    // nella sua codifica: un TXT o un CSV salvato in ANSI, letto come
                    // UTF-8, perdeva le lettere accentate e con loro i nomi da trovare
                    string testo = Testo.LeggiFile(origine);
                    if (testo.Trim() == "") { e.Saltato = true; e.Nota = "file vuoto"; return e; }
                    int entita;
                    string pulito = TestoAnonimo(testo, out entita);
                    Directory.CreateDirectory(Path.GetDirectoryName(destinazione));
                    File.WriteAllText(destinazione, pulito, new UTF8Encoding(false));
                    e.Fatto = true;
                    e.Entita = entita;
                    return e;
                }

                e.Saltato = true;
                e.Nota = "formato " + (est != "" ? est : "senza estensione") +
                         " non gestito: si possono ripulire solo " + Formati();
                return e;
            }
            catch (Exception ex)
            {
                e.Saltato = true;
                e.Nota = ex.Message;
                return e;
            }
        }

        // -------------------------------------------------------------------
        public byte[] PdfAnonimo(string percorso, out int redazioni, out int residui)
        {
            redazioni = 0; residui = 0;
            HttpWebRequest req = Multipart("/pdf", percorso);
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            {
                redazioni = Intero(resp.Headers["X-PII-Redactions"]);
                residui = Intero(resp.Headers["X-PII-Residual"]) +
                          Intero(resp.Headers["X-PII-Skipped"]);
                using (MemoryStream m = new MemoryStream())
                {
                    resp.GetResponseStream().CopyTo(m);
                    if (m.Length == 0)
                        throw new InvalidDataException(
                            "rizzo-pii ha risposto con un PDF vuoto: non scrivo niente.");
                    return m.ToArray();
                }
            }
        }

        public string TestoAnonimo(string testo, out int entita)
        {
            Dictionary<string, string> dizionario;
            Dictionary<string, int> perTipo;
            return TestoAnonimo(testo, out entita, out dizionario, out perTipo);
        }

        /// <summary>
        /// Anonimizza del testo. Se ConDizionario e' vero torna anche la
        /// corrispondenza segnaposto -> valore vero, che serve per ripristinare
        /// la risposta dell'IA. Quel dizionario e' esso stesso un dato
        /// personale: non va mai fuori dal computer.
        /// </summary>
        public string TestoAnonimo(string testo, out int entita,
                                   out Dictionary<string, string> dizionario,
                                   out Dictionary<string, int> perTipo)
        {
            entita = 0;
            dizionario = new Dictionary<string, string>();
            perTipo = new Dictionary<string, int>();

            Dictionary<string, object> corpo = new Dictionary<string, object>();
            corpo["text"] = testo;
            corpo["include_mapping"] = ConDizionario ? "true" : "false";
            byte[] dati = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(corpo));

            HttpWebRequest req = Richiesta("/analyze", TimeoutMs);
            req.Method = "POST";
            req.ContentType = "application/json; charset=utf-8";
            req.ContentLength = dati.Length;
            using (Stream s = req.GetRequestStream()) s.Write(dati, 0, dati.Length);

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                Dictionary<string, object> d = Json(r.ReadToEnd());
                entita = Stato.Int(d, "n_entities", 0);

                Dictionary<string, object> mappa = d.ContainsKey("mapping")
                    ? d["mapping"] as Dictionary<string, object> : null;
                if (mappa != null)
                    foreach (KeyValuePair<string, object> kv in mappa)
                        dizionario[kv.Key] = Convert.ToString(kv.Value);

                Dictionary<string, object> tipi = d.ContainsKey("by_label")
                    ? d["by_label"] as Dictionary<string, object> : null;
                if (tipi != null)
                    foreach (KeyValuePair<string, object> kv in tipi)
                    {
                        try { perTipo[kv.Key] = Convert.ToInt32(kv.Value); } catch { }
                    }

                // senza il testo pulito non c'e' niente da scrivere: meglio un errore
                // che una copia "ripulita" e vuota
                object pulito;
                if (!d.TryGetValue("anonymized_text", out pulito) || !(pulito is string))
                    throw new InvalidDataException(
                        "rizzo-pii ha risposto senza il testo anonimizzato: forse la sua versione " +
                        "parla un protocollo diverso da quello della " + VersioneRizzoProvata +
                        ", con cui Campanella e' provata. Non scrivo niente.");
                return (string)pulito;
            }
        }

        /// <summary>Rimette i valori veri al posto dei segnaposto.</summary>
        public static string Ripristina(string testo, Dictionary<string, string> dizionario,
                                        out int rimessi)
        {
            rimessi = 0;
            if (string.IsNullOrEmpty(testo) || dizionario == null) return testo;

            // dai segnaposto piu' lunghi ai piu' corti: [FULLNAME_10] prima di [FULLNAME_1]
            List<string> chiavi = new List<string>(dizionario.Keys);
            chiavi.Sort(delegate (string a, string b) { return b.Length.CompareTo(a.Length); });

            foreach (string k in chiavi)
            {
                if (testo.IndexOf(k, StringComparison.Ordinal) < 0) continue;
                testo = testo.Replace(k, dizionario[k]);
                rimessi++;
            }
            return testo;
        }

        // ===================================================================
        //  SOLO SU QUESTO COMPUTER
        //  Testi, file e dizionario vanno soltanto a un servizio che gira qui:
        //  http o https verso localhost, 127.0.0.0/8 o ::1. Qualunque altro
        //  indirizzo (un refuso, o un server di altri) viene rifiutato prima
        //  di aprire una connessione.
        // ===================================================================
        /// <summary>Vero se l'indirizzo punta a questo computer.</summary>
        public static bool IndirizzoLocale(string indirizzo)
        {
            return UriLocale(indirizzo) != null;
        }

        static Uri UriLocale(string indirizzo)
        {
            Uri u;
            if (!Uri.TryCreate((indirizzo ?? "").Trim(), UriKind.Absolute, out u)) return null;
            if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return null;
            if (u.UserInfo != "") return null;      // "http://127.0.0.1@altrove" non inganna
            string host = u.DnsSafeHost;            // senza le parentesi di [::1]
            if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)) return u;
            IPAddress ip;
            if (IPAddress.TryParse(host, out ip) && IPAddress.IsLoopback(ip)) return u;
            return null;
        }

        string NonLocale()
        {
            return "L'indirizzo di rizzo-pii deve essere su questo computer (localhost, 127.0.0.1 " +
                   "o [::1]), per esempio " + Stato.AnonIndirizzoDiDefault + ".\n\n" +
                   "\"" + Indirizzo + "\" non lo e': i testi da ripulire non devono uscire dal " +
                   "computer, quindi non lo uso. Correggilo in Impostazioni.";
        }

        /// <summary>L'indirizzo di una funzione del servizio. Se non e' su
        /// questo computer lancia un'eccezione: niente parte.</summary>
        Uri Url(string funzione)
        {
            Uri u = UriLocale(Indirizzo + funzione);
            if (u == null) throw new InvalidOperationException(NonLocale());
            return u;
        }

        HttpWebRequest Richiesta(string funzione, int timeout)
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Url(funzione));
            req.Proxy = null;                   // il servizio e' qui: nessun proxy in mezzo
            req.AllowAutoRedirect = false;      // e nessun rinvio verso un altro indirizzo
            req.Timeout = timeout;
            req.ReadWriteTimeout = timeout;
            return req;
        }

        // -------------------------------------------------------------------
        HttpWebRequest Multipart(string funzione, string percorso)
        {
            string confine = "----campanella" + DateTime.Now.Ticks.ToString("x");
            HttpWebRequest req = Richiesta(funzione, TimeoutMs);
            req.Method = "POST";
            req.ContentType = "multipart/form-data; boundary=" + confine;
            byte[] contenuto = File.ReadAllBytes(percorso);
            StringBuilder testa = new StringBuilder();
            testa.Append("--").Append(confine).Append("\r\n");
            testa.Append("Content-Disposition: form-data; name=\"include_mapping\"\r\n\r\n");
            testa.Append(ConDizionario ? "true" : "false").Append("\r\n");
            testa.Append("--").Append(confine).Append("\r\n");
            testa.Append("Content-Disposition: form-data; name=\"file\"; filename=\"")
                 .Append(Path.GetFileName(percorso)).Append("\"\r\n");
            testa.Append("Content-Type: application/octet-stream\r\n\r\n");

            byte[] pre = Encoding.UTF8.GetBytes(testa.ToString());
            byte[] post = Encoding.UTF8.GetBytes("\r\n--" + confine + "--\r\n");

            // lunghezza dichiarata invece di "chunked": piu' server la accettano
            req.ContentLength = pre.Length + contenuto.Length + post.Length;
            using (Stream s = req.GetRequestStream())
            {
                s.Write(pre, 0, pre.Length);
                s.Write(contenuto, 0, contenuto.Length);
                s.Write(post, 0, post.Length);
            }
            return req;
        }

        static int Intero(string s)
        {
            int n;
            return int.TryParse(s, out n) ? n : 0;
        }

        static Dictionary<string, object> Json(string testo)
        {
            JavaScriptSerializer ser = new JavaScriptSerializer();
            ser.MaxJsonLength = 80 * 1024 * 1024;
            return ser.DeserializeObject(testo) as Dictionary<string, object>
                   ?? new Dictionary<string, object>();
        }

        /// <summary>Il messaggio dentro una risposta di errore, se c'e'.</summary>
        public static string Spiega(Exception ex)
        {
            WebException we = ex as WebException;
            if (we == null || we.Response == null) return ex.Message;
            try
            {
                using (StreamReader r = new StreamReader(we.Response.GetResponseStream(), Encoding.UTF8))
                {
                    Dictionary<string, object> d = Json(r.ReadToEnd());
                    string e = Stato.Str(d, "error", "");
                    return (e != "") ? e : ex.Message;
                }
            }
            catch { return ex.Message; }
        }
    }
}
