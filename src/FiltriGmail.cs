// ===========================================================================
//  FiltriGmail.cs - i filtri che il docente ha gia' in Gmail
//
//  Gmail esporta i filtri in un file XML (un feed Atom): Impostazioni ->
//  Vedi tutte le impostazioni -> Filtri e indirizzi bloccati -> spunta tutti
//  -> Esporta, di solito mailFilters.xml. Ogni <entry> e' un filtro, con le
//  sue <apps:property name="..." value="..."/>. Qui quel file diventa un
//  elenco di filtri, con i criteri nei nomi del servizio Gmail API (quelli
//  che lo script confronta), e ogni filtro si confronta con le regole di
//  Campanella: uguale, simile o tuo. Senza finestre: il passo 4 della Posta
//  lo usa nella sua finestra, test\prova_posta.ps1 su un file inventato.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Xml;

namespace Campanella
{
    /// <summary>Un filtro letto dall'esportazione di Gmail.</summary>
    class FiltroGmail
    {
        /// <summary>L'etichetta che mette; "" se non ne mette nessuna.</summary>
        public string Etichetta = "";
        /// <summary>I criteri, con i nomi e i valori del servizio Gmail API (vedi FiltroDaTogliere.Valore).</summary>
        public Dictionary<string, string> Criteri = new Dictionary<string, string>();
        /// <summary>Le azioni oltre all'etichetta, dette a parole: "archivia", "segna come letto"...</summary>
        public List<string> Azioni = new List<string>();
        /// <summary>Le proprieta' che Campanella non conosce, tali e quali: si mostrano, non si perdono.</summary>
        public List<KeyValuePair<string, string>> Altre = new List<KeyValuePair<string, string>>();

        /// <summary>La voce da togliere per questo filtro: null se non mette etichette o non ha criteri.</summary>
        public FiltroDaTogliere DaTogliere()
        {
            List<KeyValuePair<string, object>> c = new List<KeyValuePair<string, object>>();
            foreach (KeyValuePair<string, string> kv in Criteri) c.Add(new KeyValuePair<string, object>(kv.Key, kv.Value));
            return FiltroDaTogliere.Da(Etichetta, c);
        }
    }

    /// <summary>Quanto un filtro di Gmail somiglia alle regole di Campanella.</summary>
    class Somiglianza
    {
        /// <summary>FiltriGmail.Uguale, Simile, Tuo o SenzaEtichetta.</summary>
        public string Tipo = FiltriGmail.Tuo;
        /// <summary>L'etichetta della regola (con il gruppo, come al passo 4), per uguale e simile.</summary>
        public string Regola = "";
        /// <summary>La regola e' spenta, o la configurazione la scrive spenta.</summary>
        public bool Spenta = false;

        public string Testo()
        {
            if (Tipo == FiltriGmail.Uguale) return "uguale a una regola di Campanella (" + Regola + ")";
            if (Tipo == FiltriGmail.Simile) return "simile a " + Regola + (Spenta ? " (regola spenta)" : "");
            if (Tipo == FiltriGmail.SenzaEtichetta) return "non mette etichette: resta com'e'";
            return "tuo";
        }
    }

    static class FiltriGmail
    {
        public const string Uguale = "uguale";
        public const string Simile = "simile";
        public const string Tuo = "tuo";
        public const string SenzaEtichetta = "senza";

        /// <summary>Un'esportazione vera pesa pochi KB: oltre questo non e' quella.</summary>
        public const int DimensioneMassima = 20 * 1024 * 1024;

        const string DiNuovo = " Esporta di nuovo i filtri da Gmail (Impostazioni -> Vedi tutte le impostazioni -> " +
                               "Filtri e indirizzi bloccati -> seleziona tutti -> Esporta) e apri quel file.";

        // ===================================================================
        //  LA LETTURA DEL FILE
        // ===================================================================

        /// <summary>
        /// I filtri di un file esportato da Gmail. Un file vuoto, rovinato,
        /// troppo grande o che non e' un'esportazione dei filtri alza
        /// InvalidDataException con un messaggio da mostrare cosi' com'e'.
        /// </summary>
        public static List<FiltroGmail> LeggiFile(string percorso)
        {
            FileInfo info = new FileInfo(percorso);
            if (info.Length > DimensioneMassima)
                throw new InvalidDataException("Il file e' troppo grande per essere un'esportazione dei filtri di Gmail." + DiNuovo);
            byte[] contenuto = File.ReadAllBytes(percorso);
            if (contenuto.Length == 0) throw new InvalidDataException("Il file e' vuoto." + DiNuovo);
            // dai byte: la codifica la dice il file stesso (di solito UTF-8)
            using (MemoryStream m = new MemoryStream(contenuto))
            using (XmlReader r = XmlReader.Create(m, Impostazioni()))
                return Leggi(r);
        }

        /// <summary>Lo stesso, dal testo del file.</summary>
        public static List<FiltroGmail> Leggi(string xml)
        {
            if (string.IsNullOrEmpty(xml) || xml.Trim() == "") throw new InvalidDataException("Il file e' vuoto." + DiNuovo);
            using (StringReader s = new StringReader(xml))
            using (XmlReader r = XmlReader.Create(s, Impostazioni()))
                return Leggi(r);
        }

        /// <summary>Niente DTD e niente risorse esterne: un file che ne chiede non si apre.</summary>
        static XmlReaderSettings Impostazioni()
        {
            XmlReaderSettings x = new XmlReaderSettings();
            x.DtdProcessing = DtdProcessing.Prohibit;
            x.XmlResolver = null;
            x.IgnoreComments = true;
            x.IgnoreProcessingInstructions = true;
            return x;
        }

        static List<FiltroGmail> Leggi(XmlReader r)
        {
            XmlDocument doc = new XmlDocument();
            doc.XmlResolver = null;
            try { doc.Load(r); }
            catch (XmlException ex)
            {
                // il messaggio del lettore XML e' in inglese e ripete pezzi del
                // file: basta la riga
                throw new InvalidDataException("Il file non si legge: non e' un XML completo" +
                    (ex.LineNumber > 0 ? " (il problema e' alla riga " + ex.LineNumber + ")" : "") +
                    ", forse si e' rovinato o e' rimasto a meta'." + DiNuovo);
            }
            XmlElement radice = doc.DocumentElement;
            if (radice == null || radice.LocalName != "feed")
                throw new InvalidDataException("Il file e' un XML, ma non e' l'esportazione dei filtri di Gmail: " +
                    "manca l'elenco dei filtri." + DiNuovo);

            List<FiltroGmail> fuori = new List<FiltroGmail>();
            foreach (XmlNode n in radice.ChildNodes)
            {
                XmlElement voce = n as XmlElement;
                if (voce == null || voce.LocalName != "entry") continue;
                List<KeyValuePair<string, string>> proprieta = new List<KeyValuePair<string, string>>();
                foreach (XmlNode p in voce.ChildNodes)
                {
                    XmlElement e = p as XmlElement;
                    if (e == null || e.LocalName != "property" || !e.HasAttribute("name")) continue;
                    proprieta.Add(new KeyValuePair<string, string>(e.GetAttribute("name"), e.GetAttribute("value")));
                }
                // una voce senza proprieta' non e' un filtro
                if (proprieta.Count > 0) fuori.Add(Filtro(proprieta));
            }
            return fuori;
        }

        // le azioni si/no dell'esportazione, dette a parole
        static readonly string[,] AzioniSiNo =
        {
            { "shouldArchive", "archivia (salta la Posta in arrivo)" },
            { "shouldMarkAsRead", "segna come letto" },
            { "shouldStar", "aggiunge la stella" },
            { "shouldTrash", "elimina (nel cestino)" },
            { "shouldNeverSpam", "mai nello spam" },
            { "shouldAlwaysMarkAsImportant", "sempre importante" },
            { "shouldNeverMarkAsImportant", "mai importante" }
        };

        // i criteri dell'esportazione e il loro nome nel servizio Gmail API
        static readonly string[,] NomiCriteri =
        {
            { "from", "from" }, { "to", "to" }, { "subject", "subject" }, { "hasTheWord", "query" },
            { "doesNotHaveTheWord", "negatedQuery" }, { "hasAttachment", "hasAttachment" },
            { "excludeChats", "excludeChats" }
        };

        /// <summary>Un filtro dalle sue proprieta', nell'ordine del file.</summary>
        static FiltroGmail Filtro(List<KeyValuePair<string, string>> proprieta)
        {
            FiltroGmail f = new FiltroGmail();
            Dictionary<string, string> valori = new Dictionary<string, string>();
            foreach (KeyValuePair<string, string> kv in proprieta)
            {
                // una proprieta' ripetuta (Gmail non lo fa): vale la prima, le altre si mostrano
                if (valori.ContainsKey(kv.Key)) f.Altre.Add(kv);
                else valori[kv.Key] = kv.Value ?? "";
            }
            List<string> note = new List<string>();

            for (int i = 0; i < NomiCriteri.GetLength(0); i++)
            {
                string da = NomiCriteri[i, 0];
                if (!valori.ContainsKey(da)) continue;
                note.Add(da);
                string v = FiltroDaTogliere.Valore(NomiCriteri[i, 1], valori[da]);
                if (v == null) f.Altre.Add(new KeyValuePair<string, string>(da, valori[da]));
                else if (v != "") f.Criteri[NomiCriteri[i, 1]] = v;
            }
            // la dimensione: numero, unita' e maggiore o minore. sizeOperator e
            // sizeUnit ci sono anche senza size, e allora non dicono niente
            note.Add("sizeOperator"); note.Add("sizeUnit");
            if (valori.ContainsKey("size"))
            {
                note.Add("size");
                string inByte = InByte(valori["size"], valori.ContainsKey("sizeUnit") ? valori["sizeUnit"] : "");
                string confronto = valori.ContainsKey("sizeOperator") ? Confronto(valori["sizeOperator"]) : "";
                if (inByte == null || confronto == null)
                {
                    foreach (string k in new string[] { "size", "sizeOperator", "sizeUnit" })
                        if (valori.ContainsKey(k)) f.Altre.Add(new KeyValuePair<string, string>(k, valori[k]));
                }
                else if (inByte != "")
                {
                    f.Criteri["size"] = inByte;
                    if (confronto != "") f.Criteri["sizeComparison"] = confronto;
                }
            }

            note.Add("label");
            if (valori.ContainsKey("label")) f.Etichetta = valori["label"].Trim();
            for (int i = 0; i < AzioniSiNo.GetLength(0); i++)
            {
                string nome = AzioniSiNo[i, 0];
                note.Add(nome);
                if (valori.ContainsKey(nome) && valori[nome].Trim().Equals("true", StringComparison.OrdinalIgnoreCase))
                    f.Azioni.Add(AzioniSiNo[i, 1]);
            }
            note.Add("smartLabelToApply");
            if (valori.ContainsKey("smartLabelToApply") && valori["smartLabelToApply"].Trim() != "")
                f.Azioni.Add("categoria " + Categoria(valori["smartLabelToApply"].Trim()));
            note.Add("forwardTo");
            if (valori.ContainsKey("forwardTo") && valori["forwardTo"].Trim() != "")
                f.Azioni.Add("inoltra a " + valori["forwardTo"].Trim());

            foreach (KeyValuePair<string, string> kv in valori)
                if (!note.Contains(kv.Key)) f.Altre.Add(kv);
            return f;
        }

        /// <summary>La dimensione in byte ("" = nessuna, null = non si capisce).</summary>
        static string InByte(string numero, string unita)
        {
            long n;
            string s = (numero ?? "").Trim();
            if (s == "") return "";
            if (!long.TryParse(s, System.Globalization.NumberStyles.None,
                               System.Globalization.CultureInfo.InvariantCulture, out n)) return null;
            string u = (unita ?? "").Trim().ToLowerInvariant();
            long per = (u == "s_smb") ? 1048576 : (u == "s_skb") ? 1024 : (u == "s_sb" || u == "") ? 1 : 0;
            if (per == 0) return null;
            return (n * per > 0) ? (n * per).ToString(System.Globalization.CultureInfo.InvariantCulture) : "";
        }

        /// <summary>Maggiore o minore, come lo scrive il servizio Gmail API ("" = non detto, null = non si capisce).</summary>
        static string Confronto(string operatore)
        {
            string o = (operatore ?? "").Trim().ToLowerInvariant();
            if (o == "s_sl") return "larger";
            if (o == "s_ss") return "smaller";
            return (o == "") ? "" : null;
        }

        static string Categoria(string etichetta)
        {
            switch (etichetta.ToLowerInvariant())
            {
                case "^smartlabel_personal": return "Principale";
                case "^smartlabel_social": return "Social";
                case "^smartlabel_promo": return "Promozioni";
                case "^smartlabel_notification": return "Aggiornamenti";
                case "^smartlabel_group": return "Forum";
                default: return etichetta;
            }
        }

        // ===================================================================
        //  A PAROLE
        // ===================================================================

        /// <summary>I criteri in una riga: "da: ...; con le parole: ...; con allegato".</summary>
        public static string DescriviCriteri(Dictionary<string, string> criteri)
        {
            List<string> parti = new List<string>();
            if (criteri == null) return "";
            string[,] nomi =
            {
                { "from", "da: " }, { "to", "a: " }, { "subject", "oggetto: " }, { "query", "con le parole: " },
                { "negatedQuery", "senza le parole: " }
            };
            for (int i = 0; i < nomi.GetLength(0); i++)
                if (criteri.ContainsKey(nomi[i, 0])) parti.Add(nomi[i, 1] + criteri[nomi[i, 0]]);
            if (criteri.ContainsKey("hasAttachment")) parti.Add("con allegato");
            if (criteri.ContainsKey("excludeChats")) parti.Add("escluse le chat");
            if (criteri.ContainsKey("size"))
            {
                string c = criteri.ContainsKey("sizeComparison") ? criteri["sizeComparison"] : "";
                parti.Add((c == "larger" ? "piu' grande di " : c == "smaller" ? "piu' piccolo di " : "dimensione ") +
                          Dimensione(criteri["size"]));
            }
            foreach (KeyValuePair<string, string> kv in criteri)
                if (Array.IndexOf(FiltroDaTogliere.NomiCriteri, kv.Key) < 0) parti.Add(kv.Key + ": " + kv.Value);
            return string.Join("; ", parti.ToArray());
        }

        /// <summary>Le azioni oltre all'etichetta, in una riga ("" se non ce ne sono).</summary>
        public static string DescriviAzioni(FiltroGmail f)
        {
            return (f == null) ? "" : string.Join(", ", f.Azioni.ToArray());
        }

        static string Dimensione(string quanti)
        {
            long n;
            if (!long.TryParse(quanti, out n)) return quanti;
            if (n % 1048576 == 0) return (n / 1048576) + " MB";
            if (n % 1024 == 0) return (n / 1024) + " KB";
            return n + " byte";
        }

        // ===================================================================
        //  UGUALE, SIMILE O TUO
        // ===================================================================

        // Parole con lo stesso significato, per le etichette che si danno di
        // solito a scuola: Famiglie e Genitori, Alunni e Studenti...
        static readonly string[][] Sinonimi =
        {
            new string[] { "famiglie", "famiglia", "genitori", "genitore" },
            new string[] { "alunni", "alunno", "alunne", "studenti", "studente", "studentesse", "allievi", "ragazzi" },
            new string[] { "colleghi", "collega", "colleghe", "personale", "docenti", "docente", "insegnanti", "professori" },
            new string[] { "dirigenza", "dirigente", "preside", "presidenza", "vicepresidenza" },
            new string[] { "segreteria", "amministrazione", "uffici" },
            new string[] { "registro", "classeviva", "spaggiari", "argo", "nuvola" },
            new string[] { "ministero", "miur", "usr" },
            new string[] { "sindacati", "sindacato", "sindacale", "sindacali", "rsu" },
            new string[] { "circolari", "circolare", "comunicazioni", "comunicazione", "avvisi" },
            new string[] { "formazione", "corsi", "corso", "webinar", "aggiornamento" },
            new string[] { "newsletter", "promozioni", "pubblicita" },
            new string[] { "orari", "orario" }
        };

        // parole troppo generiche per dire che due etichette si somigliano
        static readonly string[] Generiche =
        {
            "della", "delle", "dello", "degli", "dalla", "dalle", "dagli", "nella", "nelle", "negli", "sulla",
            "sulle", "alla", "alle", "agli", "questo", "questa", "altro", "altri", "altre", "varie", "vari",
            "tutti", "tutte", "anno", "mail", "email", "posta", "elettronico", "elettronica", "elettronici",
            "elettroniche"
        };

        /// <summary>
        /// Quanto l'etichetta di un filtro somiglia alle etichette di Campanella.
        /// Uguale: e' proprio il nome intero (con il gruppo) di una regola che
        /// la configurazione scrive accesa, o di una sottoetichetta dei ruoli,
        /// maiuscole a parte. Simile: ha una parola in comune con una regola
        /// (anche al singolare o al plurale) o un sinonimo, o e' il nome di una
        /// regola spenta. Altrimenti e' tuo.
        /// </summary>
        public static Somiglianza Confronta(string etichetta, Stato s)
        {
            Somiglianza x = new Somiglianza();
            string e = (etichetta ?? "").Trim().Trim('/');
            if (e == "") { x.Tipo = SenzaEtichetta; return x; }

            string pre = s.PrefissoPulito();
            string davanti = (pre == "") ? "" : pre + "/";
            List<string> indirizzi = s.IndirizziPersonale();
            // le etichette di Campanella: prima le regole accese, poi le
            // sottoetichette dei ruoli, poi le regole spente
            List<string> nomi = new List<string>(), proprie = new List<string>();
            List<bool> spente = new List<bool>();
            foreach (Regola r in s.Regole)
                if (GeneratorePosta.AttivaNellaConfigurazione(s, r, indirizzi))
                { nomi.Add(davanti + r.Etichetta); proprie.Add(r.Etichetta); spente.Add(false); }
            if (s.EtichettaPerRuolo)
            {
                string colleghi = GeneratorePosta.EtichettaColleghi(s.Regole);
                foreach (string c in GeneratorePosta.CategoriePresenti(s.GruppiPerRuolo()))
                { nomi.Add(davanti + colleghi + "/" + c); proprie.Add(colleghi + "/" + c); spente.Add(false); }
            }
            foreach (Regola r in s.Regole)
                if (!GeneratorePosta.AttivaNellaConfigurazione(s, r, indirizzi))
                { nomi.Add(davanti + r.Etichetta); proprie.Add(r.Etichetta); spente.Add(true); }

            for (int i = 0; i < nomi.Count; i++)
            {
                if (!string.Equals(e, nomi[i].Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                x.Tipo = spente[i] ? Simile : Uguale;
                x.Regola = nomi[i];
                x.Spenta = spente[i];
                return x;
            }
            List<string> parole = Parole(e);
            for (int i = 0; i < nomi.Count; i++)
            {
                if (!Somigliano(parole, Parole(proprie[i]))) continue;
                x.Tipo = Simile;
                x.Regola = nomi[i];
                x.Spenta = spente[i];
                return x;
            }
            return x;
        }

        /// <summary>Le parole di un'etichetta, minuscole e senza accenti.</summary>
        static List<string> Parole(string etichetta)
        {
            List<string> fuori = new List<string>();
            foreach (string p in Regex.Split(Stato.SenzaAccenti(etichetta ?? "").ToLowerInvariant(), "[^a-z0-9]+"))
                if (p != "" && !fuori.Contains(p)) fuori.Add(p);
            return fuori;
        }

        /// <summary>
        /// Due etichette si somigliano se hanno un sinonimo in comune, o una
        /// parola non generica di almeno quattro lettere uguale a meno
        /// dell'ultima lettera (circolare e circolari, sindacato e sindacati).
        /// </summary>
        static bool Somigliano(List<string> a, List<string> b)
        {
            foreach (string x in a)
                foreach (string y in b)
                {
                    foreach (string[] gruppo in Sinonimi)
                        if (Array.IndexOf(gruppo, x) >= 0 && Array.IndexOf(gruppo, y) >= 0) return true;
                    if (x.Length < 4 || y.Length < 4) continue;
                    if (Array.IndexOf(Generiche, x) >= 0 || Array.IndexOf(Generiche, y) >= 0) continue;
                    int comune = 0;
                    while (comune < x.Length && comune < y.Length && x[comune] == y[comune]) comune++;
                    if (comune >= 4 && comune >= Math.Min(x.Length, y.Length) - 1) return true;
                }
            return false;
        }
    }
}
