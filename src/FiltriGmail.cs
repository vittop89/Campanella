// ===========================================================================
//  FiltriGmail.cs - i filtri che il docente ha gia' in Gmail
//
//  Gmail esporta i filtri in un file XML (un feed Atom): Impostazioni ->
//  Vedi tutte le impostazioni -> Filtri e indirizzi bloccati -> spunta tutti
//  -> Esporta, di solito mailFilters.xml. Ogni <entry> e' un filtro, con le
//  sue <apps:property name="..." value="..."/>. Qui quel file diventa un
//  elenco di filtri, con i criteri nei nomi del servizio Gmail API (quelli
//  che lo script confronta), e ogni filtro si confronta con le regole di
//  Campanella: uguale, creato da Campanella (EXTRA_creaFiltriGmail), simile
//  o tuo. Un filtro con un criterio che non si capisce resta com'e'. Senza
//  finestre: il passo 4 della Posta lo usa nella sua finestra,
//  test\prova_posta.ps1 su un file inventato.
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
        /// <summary>
        /// Le azioni che le regole di Campanella non fanno mai (tutte tranne
        /// etichetta, archivia e segna come letto), a parole: inoltra, elimina,
        /// stella, importante, spam, categoria, e quelle che Campanella non
        /// conosce. Chi toglie il filtro perde anche queste.
        /// </summary>
        public List<string> AltreAzioni = new List<string>();
        /// <summary>Le proprieta' che Campanella non conosce, tali e quali: si mostrano, non si perdono.</summary>
        public List<KeyValuePair<string, string>> Altre = new List<KeyValuePair<string, string>>();
        /// <summary>
        /// Vero se un criterio non si capisce: un valore che non si legge, una
        /// dimensione con un'unita' che non si conosce, una proprieta' ripetuta
        /// o sconosciuta che potrebbe essere un criterio. Un filtro cosi' non si
        /// toglie: con un criterio in meno lo script ne toglierebbe un altro.
        /// </summary>
        public bool CriteriIncompleti = false;

        /// <summary>La voce da togliere per questo filtro: null se non mette etichette, non ha criteri o uno non si capisce.</summary>
        public FiltroDaTogliere DaTogliere()
        {
            if (CriteriIncompleti) return null;
            List<KeyValuePair<string, object>> c = new List<KeyValuePair<string, object>>();
            foreach (KeyValuePair<string, string> kv in Criteri) c.Add(new KeyValuePair<string, object>(kv.Key, kv.Value));
            return FiltroDaTogliere.Da(Etichetta, c);
        }
    }

    /// <summary>Quanto un filtro di Gmail somiglia alle regole di Campanella.</summary>
    class Somiglianza
    {
        /// <summary>FiltriGmail.Uguale, DiCampanella, Simile, Tuo, SenzaEtichetta, SenzaCriteri o NonCapito.</summary>
        public string Tipo = FiltriGmail.Tuo;
        /// <summary>L'etichetta della regola (con il gruppo, come al passo 4), per uguale, di Campanella e simile.</summary>
        public string Regola = "";
        /// <summary>La regola e' spenta, o la configurazione la scrive spenta.</summary>
        public bool Spenta = false;
        /// <summary>Le azioni del filtro che le regole non fanno (FiltroGmail.AltreAzioni), in una riga; "" se non ce ne sono.</summary>
        public string Anche = "";
        /// <summary>L'etichetta e' di una classe (FiltriGmail.EtichettaDiUnaClasse): il filtro non parte mai spuntato.</summary>
        public bool Classe = false;

        public string Testo()
        {
            if (Tipo == FiltriGmail.Uguale)
                return "uguale a una regola di Campanella (" + Regola + ")" +
                       (Anche != "" ? ", ma fa anche altro (" + Anche + "): toglilo solo se non ti serve piu'" : "");
            if (Tipo == FiltriGmail.DiCampanella)
                return (Anche != ""
                    ? "come quelli creati da Campanella per " + Regola + " (EXTRA_creaFiltriGmail), ma fa anche " +
                      "altro (" + Anche + "): toglilo solo se non ti serve piu'"
                    : "creato da Campanella per " + Regola + " (EXTRA_creaFiltriGmail): toglilo solo se non " +
                      "vuoi piu' i filtri veri");
            if (Tipo == FiltriGmail.Simile) return "simile a " + Regola + (Spenta ? " (regola spenta)" : "");
            if (Tipo == FiltriGmail.SenzaEtichetta) return "non mette etichette: resta com'e'";
            if (Tipo == FiltriGmail.SenzaCriteri) return "senza criteri: resta com'e'";
            if (Tipo == FiltriGmail.NonCapito) return "ha un criterio che Campanella non capisce: resta com'e'";
            if (Tipo == FiltriGmail.DiUnaClasse)
                return "di una classe, con gli indirizzi degli studenti: Campanella non li conserva, quindi non lo " +
                       "toglie; se non ti serve piu', toglilo in Gmail (Impostazioni -> Filtri e indirizzi bloccati)";
            return "tuo";
        }
    }

    static class FiltriGmail
    {
        public const string Uguale = "uguale";
        public const string DiCampanella = "campanella";
        public const string Simile = "simile";
        public const string Tuo = "tuo";
        public const string SenzaEtichetta = "senza";
        public const string SenzaCriteri = "senzacriteri";
        public const string NonCapito = "noncapito";
        public const string DiUnaClasse = "classe";

        /// <summary>Un'esportazione vera pesa pochi KB: oltre questo non e' quella.</summary>
        public const int DimensioneMassima = 20 * 1024 * 1024;

        /// <summary>
        /// Quanti mittenti al massimo in un filtro di EXTRA_creaFiltriGmail:
        /// _INDIRIZZI_PER_QUERY nello script (test\prova_posta.ps1 controlla
        /// che siano uguali).
        /// </summary>
        public const int IndirizziPerFiltro = 20;

        const string Atom = "http://www.w3.org/2005/Atom";
        const string Apps = "http://schemas.google.com/apps/2006";

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
            // il feed Atom di Gmail, con le proprieta' dei filtri nel loro spazio
            // dei nomi (apps): un altro feed Atom, o proprieta' di un altro
            // spazio dei nomi, non sono filtri
            XmlElement radice = doc.DocumentElement;
            if (radice == null || radice.LocalName != "feed" || radice.NamespaceURI != Atom)
                throw new InvalidDataException("Il file e' un XML, ma non e' l'esportazione dei filtri di Gmail: " +
                    "manca l'elenco dei filtri." + DiNuovo);

            List<FiltroGmail> fuori = new List<FiltroGmail>();
            int voci = 0;
            foreach (XmlNode n in radice.ChildNodes)
            {
                XmlElement voce = n as XmlElement;
                if (voce == null || voce.LocalName != "entry" || voce.NamespaceURI != Atom) continue;
                voci++;
                List<KeyValuePair<string, string>> proprieta = new List<KeyValuePair<string, string>>();
                foreach (XmlNode p in voce.ChildNodes)
                {
                    XmlElement e = p as XmlElement;
                    if (e == null || e.LocalName != "property" || e.NamespaceURI != Apps || !e.HasAttribute("name")) continue;
                    proprieta.Add(new KeyValuePair<string, string>(e.GetAttribute("name"), e.GetAttribute("value")));
                }
                // una voce senza proprieta' non e' un filtro
                if (proprieta.Count > 0) fuori.Add(Filtro(proprieta));
            }
            // delle voci, ma nessuna con le proprieta' di un filtro: e' un altro
            // feed (un blog, delle notizie), non l'esportazione di Gmail
            if (voci > 0 && fuori.Count == 0)
                throw new InvalidDataException("Il file e' un XML, ma non e' l'esportazione dei filtri di Gmail: " +
                    "le sue voci non sono filtri." + DiNuovo);
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

        // le azioni con un valore (non si'/no): non sono criteri
        static readonly string[] AzioniConValore = { "label", "smartLabelToApply", "forwardTo", "cannedResponse" };

        /// <summary>
        /// Vero se una proprieta' e' di sicuro un'azione, anche una che
        /// Campanella non conosce: Gmail chiama le azioni si'/no "should..."
        /// (shouldArchive, shouldTrash...). Tutte le altre potrebbero essere
        /// criteri.
        /// </summary>
        static bool EAzione(string nome)
        {
            if (Array.IndexOf(AzioniConValore, nome) >= 0) return true;
            return nome.Length > 6 && nome.StartsWith("should", StringComparison.Ordinal) && char.IsUpper(nome[6]);
        }

        /// <summary>
        /// Un filtro dalle sue proprieta', nell'ordine del file. Un criterio
        /// che non si capisce, una dimensione che non si legge, una proprieta'
        /// ripetuta o sconosciuta che non e' un'azione lo segnano come
        /// CriteriIncompleti: resta nell'elenco, ma non si puo' togliere.
        /// </summary>
        static FiltroGmail Filtro(List<KeyValuePair<string, string>> proprieta)
        {
            FiltroGmail f = new FiltroGmail();
            Dictionary<string, string> valori = new Dictionary<string, string>();
            foreach (KeyValuePair<string, string> kv in proprieta)
            {
                // una proprieta' ripetuta (Gmail non lo fa): vale la prima, le
                // altre si mostrano; se non e' un'azione non si sa quale criterio vale
                if (valori.ContainsKey(kv.Key))
                {
                    f.Altre.Add(kv);
                    if (!EAzione(kv.Key)) f.CriteriIncompleti = true;
                }
                else valori[kv.Key] = kv.Value ?? "";
            }
            List<string> note = new List<string>();

            for (int i = 0; i < NomiCriteri.GetLength(0); i++)
            {
                string da = NomiCriteri[i, 0];
                if (!valori.ContainsKey(da)) continue;
                note.Add(da);
                string v = FiltroDaTogliere.Valore(NomiCriteri[i, 1], valori[da]);
                if (v == null)
                {
                    f.Altre.Add(new KeyValuePair<string, string>(da, valori[da]));
                    f.CriteriIncompleti = true;
                }
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
                    f.CriteriIncompleti = true;
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
                if (!valori.ContainsKey(nome) || !valori[nome].Trim().Equals("true", StringComparison.OrdinalIgnoreCase)) continue;
                f.Azioni.Add(AzioniSiNo[i, 1]);
                // archiviare e segnare come letto le regole lo fanno; il resto no
                if (nome != "shouldArchive" && nome != "shouldMarkAsRead") f.AltreAzioni.Add(AzioniSiNo[i, 1]);
            }
            note.Add("smartLabelToApply");
            if (valori.ContainsKey("smartLabelToApply") && valori["smartLabelToApply"].Trim() != "")
                AltraAzione(f, "categoria " + Categoria(valori["smartLabelToApply"].Trim()));
            note.Add("forwardTo");
            if (valori.ContainsKey("forwardTo") && valori["forwardTo"].Trim() != "")
                AltraAzione(f, "inoltra a " + valori["forwardTo"].Trim());
            note.Add("cannedResponse");
            if (valori.ContainsKey("cannedResponse") && valori["cannedResponse"].Trim() != "")
                AltraAzione(f, "risponde con un modello");

            foreach (KeyValuePair<string, string> kv in valori)
            {
                if (note.Contains(kv.Key)) continue;
                f.Altre.Add(kv);
                // un'azione che Campanella non conosce si mostra e basta (se e'
                // accesa, il filtro fa anche altro); il resto potrebbe essere un
                // criterio nuovo di Gmail
                string v = (kv.Value ?? "").Trim();
                if (!EAzione(kv.Key)) f.CriteriIncompleti = true;
                else if (v != "" && !v.Equals("false", StringComparison.OrdinalIgnoreCase))
                    f.AltreAzioni.Add("azione che Campanella non conosce: " + kv.Key);
            }
            return f;
        }

        static void AltraAzione(FiltroGmail f, string testo)
        {
            f.Azioni.Add(testo);
            f.AltreAzioni.Add(testo);
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
        /// Un filtro letto dal file, confrontato con le regole: come
        /// Confronta(etichetta, criteri, s), ma prima dice se non mette
        /// etichette, se non ha criteri o se un criterio non si capisce (e
        /// allora resta com'e'), e dopo aggiunge che cosa fa oltre alle regole.
        /// </summary>
        public static Somiglianza Confronta(FiltroGmail f, Stato s)
        {
            Somiglianza x;
            if (f == null || f.Etichetta == "") { x = new Somiglianza(); x.Tipo = SenzaEtichetta; }
            else if (f.CriteriIncompleti) { x = new Somiglianza(); x.Tipo = NonCapito; }
            else if (f.DaTogliere() == null) { x = new Somiglianza(); x.Tipo = SenzaCriteri; }
            else if (EtichettaDiUnaClasse(f.Etichetta, s) && ConIndirizzi(f.Criteri))
            {
                // gli studenti di una classe: nella voce da togliere finirebbero i
                // loro indirizzi, e Campanella non li deve conservare
                x = new Somiglianza();
                x.Tipo = DiUnaClasse;
                x.Regola = f.Etichetta.Trim();
            }
            else x = Confronta(f.Etichetta, f.Criteri, s);
            if (f != null)
            {
                x.Anche = string.Join(", ", f.AltreAzioni.ToArray());
                x.Classe = EtichettaDiUnaClasse(f.Etichetta, s);
            }
            return x;
        }

        /// <summary>
        /// Vero se il filtro parte spuntato: e' uguale a una regola, ma non e'
        /// uno di quelli creati da Campanella con i criteri di adesso, e non fa
        /// niente che le regole non facciano (inoltrare, eliminare, stella,
        /// importante, spam, categoria...). Togliere un filtro cosi' non fa
        /// perdere niente; gli altri si spuntano a mano.
        /// </summary>
        public static bool DiPartenza(FiltroGmail f, Somiglianza x)
        {
            // quelli delle classi mai: il filtro degli studenti Campanella non lo
            // conosce, e con quello dell'oggetto si toglie anche la classe da Gmail
            return f != null && x != null && x.Tipo == Uguale && !x.Classe && f.AltreAzioni.Count == 0 &&
                   f.DaTogliere() != null;
        }

        /// <summary>
        /// Vero se l'etichetta e' di una classe (Posta, passo 4, "Le mie
        /// classi..."): quella di una regola delle classi, una sotto la stessa
        /// etichetta madre, o una sotto "Classi 2025-26" (il nome di partenza,
        /// anche di un anno le cui regole sono gia' state tolte). Con il gruppo
        /// il nome e' intero, come in Gmail.
        /// </summary>
        public static bool EtichettaDiUnaClasse(string etichetta, Stato s)
        {
            string e = (etichetta ?? "").Trim().Trim('/');
            int barra = e.LastIndexOf('/');
            if (barra <= 0) return false;
            string madre = e.Substring(0, barra);
            string pre = s.PrefissoPulito();
            string davanti = (pre == "") ? "" : pre + "/";
            foreach (Regola r in s.Regole)
            {
                if (LeMieClassi.ClasseDi(r) == null) continue;
                string nome = (davanti + r.Etichetta).Trim().Trim('/');
                int b = nome.LastIndexOf('/');
                if (string.Equals(e, nome, StringComparison.OrdinalIgnoreCase) ||
                    (b > 0 && string.Equals(madre, nome.Substring(0, b), StringComparison.OrdinalIgnoreCase))) return true;
            }
            return Regex.IsMatch(madre.Substring(madre.LastIndexOf('/') + 1), @"^Classi \d{4}-\d{2}$", RegexOptions.IgnoreCase);
        }

        /// <summary>Vero se un criterio ha un indirizzo (o un dominio): una "@" nel valore.</summary>
        static bool ConIndirizzi(Dictionary<string, string> criteri)
        {
            if (criteri != null)
                foreach (KeyValuePair<string, string> kv in criteri)
                    if ((kv.Value ?? "").IndexOf('@') >= 0) return true;
            return false;
        }

        /// <summary>Lo stesso, dall'etichetta sola (senza criteri non si riconoscono i filtri creati da Campanella).</summary>
        public static Somiglianza Confronta(string etichetta, Stato s)
        {
            return Confronta(etichetta, null, s);
        }

        /// <summary>
        /// Quanto l'etichetta di un filtro somiglia alle etichette di Campanella.
        /// Uguale: e' proprio il nome intero (con il gruppo) di una regola che
        /// la configurazione scrive accesa, o di una sottoetichetta dei ruoli,
        /// maiuscole a parte. Di Campanella: e' uguale e ha proprio i criteri di
        /// un filtro che EXTRA_creaFiltriGmail crea con la configurazione di
        /// adesso (FiltriDiCampanella). Simile: ha una parola in comune con una
        /// regola (anche al singolare o al plurale) o un sinonimo, o e' il nome
        /// di una regola spenta. Altrimenti e' tuo.
        /// </summary>
        public static Somiglianza Confronta(string etichetta, Dictionary<string, string> criteri, Stato s)
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

            x.Classe = EtichettaDiUnaClasse(e, s);
            for (int i = 0; i < nomi.Count; i++)
            {
                if (!string.Equals(e, nomi[i].Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                x.Tipo = spente[i] ? Simile : Uguale;
                x.Regola = nomi[i];
                x.Spenta = spente[i];
                if (x.Tipo == Uguale && DiCampanellaAdesso(etichetta, criteri, s)) x.Tipo = DiCampanella;
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

        /// <summary>Vero se etichetta e criteri sono proprio quelli di un filtro di FiltriDiCampanella.</summary>
        static bool DiCampanellaAdesso(string etichetta, Dictionary<string, string> criteri, Stato s)
        {
            if (criteri == null || criteri.Count == 0) return false;
            List<KeyValuePair<string, object>> grezzi = new List<KeyValuePair<string, object>>();
            foreach (KeyValuePair<string, string> kv in criteri) grezzi.Add(new KeyValuePair<string, object>(kv.Key, kv.Value));
            FiltroDaTogliere questo = FiltroDaTogliere.Da(etichetta, grezzi);
            if (questo == null) return false;
            string chiave = questo.Chiave();
            foreach (FiltroDaTogliere f in FiltriDiCampanella(s))
                if (f.Chiave() == chiave) return true;
            return false;
        }

        // ===================================================================
        //  I FILTRI CHE CREA CAMPANELLA
        // ===================================================================

        /// <summary>
        /// I filtri che EXTRA_creaFiltriGmail crea con la configurazione di
        /// adesso: l'etichetta intera (con il gruppo) e i criteri, calcolati come
        /// fa lo script (_criteriFiltro_), nel contenitore di un filtro da
        /// togliere. Non ne creano le regole che la configurazione scrive spente
        /// e quelle che escludono altre etichette (restano allo script); una
        /// regola con tanti mittenti ne crea uno ogni IndirizziPerFiltro. Degli
        /// studenti delle classi Campanella non sa niente (gli indirizzi stanno
        /// solo nei file Classe_*.gs del progetto): per una classe c'e' il filtro
        /// dell'oggetto, come lo script senza quel file.
        /// test\prova_posta.ps1 li confronta con quelli dello script vero.
        /// </summary>
        public static List<FiltroDaTogliere> FiltriDiCampanella(Stato s)
        {
            List<FiltroDaTogliere> fuori = new List<FiltroDaTogliere>();
            string pre = s.PrefissoPulito();
            string davanti = (pre == "") ? "" : pre + "/";
            List<string> personale = s.IndirizziPersonale();
            Dictionary<string, List<string>> gruppi = s.EtichettaPerRuolo
                ? s.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            string dominio = s.DominioPulito();
            List<string> niente = new List<string>();
            foreach (Regola r in s.Regole)
            {
                if (!GeneratorePosta.AttivaNellaConfigurazione(s, r, personale) || r.EscludiEtichette.Count > 0) continue;
                AggiungiFiltri(fuori, davanti + r.Etichetta, CriteriCreati(GeneratorePosta.MittentiDellaRegola(s, r),
                    r.Oggetto, r.Contiene, r.QueryLibera ?? "", r.UnoQualsiasi, dominio, personale, gruppi));
            }
            // le sottoetichette dei ruoli: un gruppo dell'elenco del personale per mittente
            string colleghi = GeneratorePosta.EtichettaColleghi(s.Regole);
            foreach (string c in GeneratorePosta.CategoriePresenti(gruppi))
            {
                List<string> gruppo = new List<string>(new string[] { "@GRUPPO:" + c + "@" });
                AggiungiFiltri(fuori, davanti + colleghi + "/" + c,
                    CriteriCreati(gruppo, niente, niente, "", false, dominio, personale, gruppi));
            }
            return fuori;
        }

        static void AggiungiFiltri(List<FiltroDaTogliere> fuori, string etichetta, List<Dictionary<string, string>> criteri)
        {
            foreach (Dictionary<string, string> c in criteri)
            {
                List<KeyValuePair<string, object>> grezzi = new List<KeyValuePair<string, object>>();
                foreach (KeyValuePair<string, string> kv in c) grezzi.Add(new KeyValuePair<string, object>(kv.Key, kv.Value));
                FiltroDaTogliere f = FiltroDaTogliere.Da(etichetta, grezzi);
                if (f != null) fuori.Add(f);
            }
        }

        /// <summary>
        /// I criteri dei filtri di una regola, come _criteriFiltro_ e _altriCriteri_
        /// nello script. Con unoQualsiasi, mittenti e testo (oggetto o parole)
        /// un filtro per il testo e uno per ogni gruppo di mittenti (_bastaUno_).
        /// </summary>
        static List<Dictionary<string, string>> CriteriCreati(List<string> da, List<string> oggetto, List<string> contiene,
            string queryLibera, bool unoQualsiasi, string dominio, List<string> personale,
            Dictionary<string, List<string>> gruppi)
        {
            List<Dictionary<string, string>> fuori = new List<Dictionary<string, string>>();
            List<string> mittenti = Espandi(da, dominio, personale, gruppi);
            List<string> avanzata = new List<string>();
            if (queryLibera != "") avanzata.Add("(" + queryLibera + ")");
            List<string> libera = new List<string>();
            if (contiene.Count > 0) libera.Add("(" + OrDiTesti(contiene) + ")");
            libera.AddRange(avanzata);
            string soggetto = (oggetto.Count > 0) ? OrDiTesti(oggetto) : "";
            if (unoQualsiasi && da.Count > 0 && (oggetto.Count > 0 || contiene.Count > 0))
            {
                // il testo da chiunque, poi i mittenti senza il testo
                Dictionary<string, string> testo = new Dictionary<string, string>();
                AltriCriteri(testo, soggetto, libera);
                fuori.Add(testo);
                for (int i = 0; i < mittenti.Count; i += IndirizziPerFiltro)
                {
                    Dictionary<string, string> c = new Dictionary<string, string>();
                    c["from"] = string.Join(" OR ", mittenti.GetRange(i, Math.Min(IndirizziPerFiltro, mittenti.Count - i)).ToArray());
                    AltriCriteri(c, "", avanzata);
                    fuori.Add(c);
                }
                return fuori;
            }
            // mittenti previsti ma nessuno rimasto: niente filtro
            if (mittenti.Count == 0 && da.Count > 0) return fuori;
            if (mittenti.Count > 0)
            {
                for (int i = 0; i < mittenti.Count; i += IndirizziPerFiltro)
                {
                    Dictionary<string, string> c = new Dictionary<string, string>();
                    List<string> pezzo = mittenti.GetRange(i, Math.Min(IndirizziPerFiltro, mittenti.Count - i));
                    c["from"] = string.Join(" OR ", pezzo.ToArray());
                    AltriCriteri(c, soggetto, libera);
                    fuori.Add(c);
                }
            }
            else if (soggetto != "" || libera.Count > 0)
            {
                Dictionary<string, string> c = new Dictionary<string, string>();
                AltriCriteri(c, soggetto, libera);
                fuori.Add(c);
            }
            return fuori;
        }

        static void AltriCriteri(Dictionary<string, string> c, string soggetto, List<string> libera)
        {
            if (soggetto != "") c["subject"] = soggetto;
            if (libera.Count > 0) c["query"] = string.Join(" ", libera.ToArray());
        }

        /// <summary>I mittenti con i segnaposto sciolti e senza doppioni (maiuscole a parte), come _espandi_ nello script.</summary>
        static List<string> Espandi(List<string> elenco, string dominio, List<string> personale,
                                    Dictionary<string, List<string>> gruppi)
        {
            List<string> tutti = new List<string>();
            foreach (string grezzo in elenco)
            {
                string v = (grezzo ?? "").Trim();
                if (v == "") continue;
                if (v.StartsWith("@GRUPPO:", StringComparison.Ordinal) && v.Length >= 9 &&
                    v.EndsWith("@", StringComparison.Ordinal))
                {
                    string nome = v.Substring(8, v.Length - 9);
                    if (gruppi.ContainsKey(nome))
                        foreach (string g in gruppi[nome]) if ((g ?? "").Trim() != "") tutti.Add(g.Trim());
                }
                else if (v == "@PERSONALE@")
                {
                    foreach (string p in personale) if ((p ?? "").Trim() != "") tutti.Add(p.Trim());
                }
                else if (v == "@DOMINIO@")
                {
                    if (dominio != "") tutti.Add("@" + dominio);
                }
                // gli studenti di una classe: stanno solo nel file Classe_*.gs del progetto
                else if (v.StartsWith("@CLASSE:", StringComparison.Ordinal) && v.Length >= 10 &&
                         v.EndsWith("@", StringComparison.Ordinal)) { }
                else tutti.Add(v);
            }
            List<string> fuori = new List<string>(), visti = new List<string>();
            foreach (string t in tutti)
            {
                string k = t.ToLowerInvariant();
                if (visti.Contains(k)) continue;
                visti.Add(k);
                fuori.Add(t);
            }
            return fuori;
        }

        /// <summary>Le parole in OR, quelle con uno spazio fra virgolette: _orDiTesti_ nello script.</summary>
        static string OrDiTesti(List<string> elenco)
        {
            List<string> fuori = new List<string>();
            foreach (string grezzo in elenco)
            {
                string t = (grezzo ?? "").Trim();
                if (t == "") continue;
                fuori.Add(Regex.IsMatch(t, @"\s") ? "\"" + t.Replace("\"", "") + "\"" : t);
            }
            return string.Join(" OR ", fuori.ToArray());
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
        /// dell'ultima lettera (circolare e circolari, sindacato e sindacati,
        /// orario e orari): lunghe uguali o una lettera in piu', e diverse al
        /// piu' nell'ultima. Circolo e circolari, sindaco e sindacati no.
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
                    if (comune >= 4 && Math.Abs(x.Length - y.Length) <= 1 && comune >= Math.Max(x.Length, y.Length) - 1)
                        return true;
                }
            return false;
        }
    }
}
