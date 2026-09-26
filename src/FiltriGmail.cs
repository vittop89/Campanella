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
//  o tuo. Un filtro con un criterio che non si capisce resta com'e'.
//  Per ogni filtro c'e' anche che cosa farne (SceltaFiltro): lasciarlo in
//  Gmail, toglierlo, unire i suoi mittenti a una regola o farne una regola
//  nuova, con la stessa etichetta e la stessa ricerca; Applica lo fa nello
//  Stato. Senza finestre: il passo 4 della Posta lo usa nella sua finestra,
//  test\prova_posta.ps1 su file inventati.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;

namespace Campanella
{
    /// <summary>
    /// Che cosa fare di un filtro di Gmail (Posta, passo 4, "Filtri che hai
    /// gia' in Gmail...", colonna "Che cosa fare"): FiltriGmail.Scelte dice
    /// quelle possibili, FiltriGmail.Proposta quella di partenza.
    /// </summary>
    class SceltaFiltro
    {
        /// <summary>Resta in Gmail.</summary>
        public const string Lascia = "lascia";
        /// <summary>Si toglie e basta (o perche' lo fa gia' una regola, in Regola).</summary>
        public const string Togli = "togli";
        /// <summary>I suoi mittenti vanno nella regola (Regola), o in "La tua scuola" per le sue; poi si toglie.</summary>
        public const string Unisci = "unisci";
        /// <summary>Diventa una regola nuova con la stessa etichetta e la stessa ricerca; poi si toglie.</summary>
        public const string Nuova = "nuova";

        public string Azione = Lascia;
        /// <summary>Togli: la regola che lo fa gia' (o null); Unisci: quella che prende i mittenti.</summary>
        public Regola Regola = null;
        /// <summary>Come la dice la tendina: diversa dalle altre dello stesso filtro.</summary>
        public string Testo = "Lascialo in Gmail";

        /// <summary>Vero se con questa scelta il filtro si toglie da Gmail (EXTRA_togliFiltri).</summary>
        public bool TogliIlFiltro { get { return Azione != Lascia; } }
    }

    /// <summary>Un filtro della finestra con la sua scelta: quello che FiltriGmail.Applica mette nello Stato.</summary>
    class FiltroScelto
    {
        /// <summary>null: uno scelto prima, che nel file non c'e'.</summary>
        public FiltroGmail Filtro;
        /// <summary>null: non si puo' togliere (niente etichetta, criteri, uno non si capisce, di una classe).</summary>
        public FiltroDaTogliere Voce;
        public Somiglianza Somiglia;
        public SceltaFiltro Scelta;
    }

    /// <summary>
    /// I mittenti di un filtro fatto solo di mittenti (FiltriGmail.SoloMittenti):
    /// quelli che prende, come si scrivono fra i mittenti di una regola, e le
    /// esclusioni, come si scrivono nella ricerca avanzata ("-from:y").
    /// </summary>
    class MittentiFiltro
    {
        public List<string> Da = new List<string>();
        public List<string> Esclusi = new List<string>();
    }

    /// <summary>Un filtro letto dall'esportazione di Gmail.</summary>
    class FiltroGmail
    {
        /// <summary>L'etichetta che mette; "" se non ne mette nessuna.</summary>
        public string Etichetta = "";
        /// <summary>I criteri, con i nomi e i valori del servizio Gmail API (vedi FiltroDaTogliere.Valore).</summary>
        public Dictionary<string, string> Criteri = new Dictionary<string, string>();
        /// <summary>Le azioni oltre all'etichetta, dette a parole: "archivia", "segna come letto"...</summary>
        public List<string> Azioni = new List<string>();
        /// <summary>Archivia (shouldArchive) e segna come letto (shouldMarkAsRead): le due che anche le regole fanno.</summary>
        public bool Archivia = false, SegnaLetto = false;
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
            // l'etichetta sembra di una classe: gli indirizzi potrebbero anche non
            // essere di studenti (Progetti/2FA), e non si dice che lo sono
            if (Tipo == FiltriGmail.DiUnaClasse)
                return "sembra di una classe e cerca degli indirizzi (forse di studenti): Campanella non li conserva, " +
                       "quindi non lo toglie; se non ti serve piu', toglilo in Gmail (Impostazioni -> Filtri e " +
                       "indirizzi bloccati)";
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
                if (nome == "shouldArchive") f.Archivia = true;
                else if (nome == "shouldMarkAsRead") f.SegnaLetto = true;
                else f.AltreAzioni.Add(AzioniSiNo[i, 1]);
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
            else if (DiUnaClasseConIndirizzi(f.Etichetta, f.Criteri, s))
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
        /// Vero se il filtro, uguale a una regola, puo' partire da togliere: non
        /// e' uno di quelli creati da Campanella con i criteri di adesso, e non
        /// fa niente che le regole non facciano (inoltrare, eliminare, stella,
        /// importante, spam, categoria...). Parte da togliere (o da unire alla
        /// regola) solo se la regola prende davvero i suoi messaggi, o li
        /// prende unendoli: lo decide Proposta. Gli altri si scelgono a mano.
        /// </summary>
        public static bool DiPartenza(FiltroGmail f, Somiglianza x)
        {
            // quelli delle classi mai: il filtro degli studenti Campanella non lo
            // conosce, e con quello dell'oggetto si toglie anche la classe da Gmail
            return f != null && x != null && x.Tipo == Uguale && !x.Classe && f.AltreAzioni.Count == 0 &&
                   f.DaTogliere() != null;
        }

        // "classi" come parola intera: Classi 2026-27, Le mie classi, Classi2026;
        // non Liceo Classico, Classici
        static readonly Regex ParolaClassi = new Regex(@"(?<!\p{L})classi(?!\p{L})", RegexOptions.IgnoreCase);

        // in fondo all'ultima parte di un'etichetta, l'anno scolastico: "3B
        // 2025-26", "3B (2025/26)", "3B a.s. 2025-2026", "3B-2026"
        static readonly Regex AnnoInFondo = new Regex(
            @"[\s\-_(]+(?:a\.?\s?s\.?\s*)?[0-9]{4}(?:[-/][0-9]{2,4})?\)?$", RegexOptions.IgnoreCase);

        /// <summary>
        /// Vero se l'ultima parte di un'etichetta finisce con il nome di una
        /// classe (LeMieClassi.SembraClasse: 3B, III B, 3B LSA, 5AINF, 5Ainf),
        /// anche con l'anno dopo ("3B 2025-26") o delle parole prima ("Classe
        /// 3B", "Inglese 3B", "Consiglio di classe 3B"). Non una classe seguita
        /// da altre parole: "5A Praga" e "3B 2 gruppi" non lo sono, e nemmeno
        /// "3B Inglese".
        /// </summary>
        static bool FinisceConUnaClasse(string parte)
        {
            string u = AnnoInFondo.Replace(parte ?? "", "").Trim();
            if (u == "") return false;
            if (LeMieClassi.SembraClasse(u)) return true;
            for (int i = 0; i < u.Length; i++)
                if (u[i] == ' ' && LeMieClassi.SembraClasse(u.Substring(i + 1))) return true;
            return false;
        }

        /// <summary>
        /// Vero se l'etichetta e' (o puo' essere) di una classe (Posta, passo 4,
        /// "Le mie classi..."). L'etichetta madre si scrive a mano e l'anno e'
        /// testo libero, quindi non basta il nome di partenza: vale come classe
        /// un'etichetta la cui ultima parte finisce con il nome di una classe
        /// (FinisceConUnaClasse: 3B, III B, 3B LSA, 5AINF, 5Ainf, Classe 3B,
        /// Inglese 3B, 3B 2025-26), una con la parola "classi" nella madre
        /// (Classi 2026-27, Le mie classi, Classi a.s. 2026/27), quella di una
        /// regola delle classi o una sotto la sua madre, e una sotto una madre
        /// usata per le classi prima (Stato.MadriClassi: resta anche dopo aver
        /// tolto le regole). Meglio una di troppo: un filtro che sembra di una
        /// classe e ha degli indirizzi non si sceglie, e si toglie da Gmail.
        /// Con il gruppo il nome e' intero, come in Gmail; spazi doppi e
        /// maiuscole non contano.
        /// </summary>
        public static bool EtichettaDiUnaClasse(string etichetta, Stato s)
        {
            string e = Regex.Replace(etichetta ?? "", @"\s+", " ").Trim().Trim('/').Trim();
            if (e == "") return false;
            int barra = e.LastIndexOf('/');
            if (FinisceConUnaClasse(e.Substring(barra + 1))) return true;
            if (barra <= 0) return false;
            string madre = e.Substring(0, barra);
            if (ParolaClassi.IsMatch(madre)) return true;
            string pre = s.PrefissoPulito();
            string davanti = (pre == "") ? "" : pre + "/";
            List<string> madri = new List<string>();
            foreach (Regola r in s.Regole)
            {
                if (LeMieClassi.ClasseDi(r) == null) continue;
                string nome = Regex.Replace(davanti + r.Etichetta, @"\s+", " ").Trim().Trim('/');
                if (string.Equals(e, nome, StringComparison.OrdinalIgnoreCase)) return true;
                if (nome.LastIndexOf('/') > 0) madri.Add(nome.Substring(0, nome.LastIndexOf('/')));
            }
            if (s.MadriClassi != null)
                foreach (string m in s.MadriClassi)
                {
                    madri.Add(Regex.Replace(davanti + m, @"\s+", " ").Trim().Trim('/'));
                    madri.Add(Regex.Replace(m ?? "", @"\s+", " ").Trim().Trim('/'));
                }
            foreach (string m in madri)
                if (m != "" && (string.Equals(madre, m, StringComparison.OrdinalIgnoreCase) ||
                                madre.StartsWith(m + "/", StringComparison.OrdinalIgnoreCase))) return true;
            return false;
        }

        /// <summary>Vero se un criterio ha un indirizzo (o un dominio): una "@" nel valore.</summary>
        static bool ConIndirizzi(Dictionary<string, string> criteri)
        {
            if (criteri != null)
                foreach (KeyValuePair<string, string> kv in criteri)
                    if ((kv.Value ?? "").IndexOf('@') >= 0) return true;
            return false;
        }

        /// <summary>
        /// Vero se un filtro sembra di una classe (EtichettaDiUnaClasse) e cerca
        /// degli indirizzi: forse gli studenti, che Campanella non conserva. Non
        /// si puo' scegliere, e fra quelli da togliere non ci deve stare.
        /// </summary>
        public static bool DiUnaClasseConIndirizzi(string etichetta, Dictionary<string, string> criteri, Stato s)
        {
            return EtichettaDiUnaClasse(etichetta, s) && ConIndirizzi(criteri);
        }

        /// <summary>
        /// Toglie dai filtri da togliere quelli che sembrano di una classe e
        /// cercano degli indirizzi (DiUnaClasseConIndirizzi): scelti prima (con
        /// la 1.5.3, o prima di creare le classi sotto la loro etichetta madre),
        /// porterebbero gli indirizzi degli studenti nel file dei dati e in
        /// Configurazione.gs. All'avvio e dopo "Usa queste classi". Quanti ne ha tolti.
        /// </summary>
        public static int TogliQuelliDelleClassi(Stato s)
        {
            if (s == null || s.FiltriDaTogliere == null) return 0;
            return s.FiltriDaTogliere.RemoveAll(delegate(FiltroDaTogliere f)
            {
                return f != null && DiUnaClasseConIndirizzi(f.Etichetta, f.Criteri, s);
            });
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
        /// regola con tanti mittenti ne crea uno ogni IndirizziPerFiltro. Gli
        /// studenti delle classi non vanno mai nei filtri, nemmeno nello script
        /// con i file Classe_*.gs: per una classe c'e' solo il filtro
        /// dell'oggetto, qui e nello script.
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
        public static List<string> Espandi(List<string> elenco, string dominio, List<string> personale,
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
        public static string OrDiTesti(List<string> elenco)
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

        // ===================================================================
        //  DAI FILTRI ALLE REGOLE
        //  Un filtro fatto solo di mittenti (from:a, from:(a OR b), anche con
        //  -from:y) puo' unire i suoi mittenti a una regola che ha i mittenti
        //  suoi; un filtro che non fa altro che etichettare (e archiviare, o
        //  segnare come letto) puo' diventare una regola, con la stessa
        //  etichetta e la stessa ricerca, scritta nella sintassi della ricerca
        //  di Gmail. Solo quando la traduzione e' esatta: altrimenti la scelta
        //  non c'e'. La finestra propone, Applica fa.
        // ===================================================================

        // un mittente come si scrive in una regola: un indirizzo, @dominio, un
        // dominio o una parola (nuvola, noreply). Niente spazi, virgolette,
        // parentesi, due punti
        static readonly Regex Mittente = new Regex(@"^[A-Za-z0-9@._+'\-]+$");

        static bool UnMittente(string t)
        {
            return !string.IsNullOrEmpty(t) && t[0] != '-' && t != "OR" && t != "AND" && Mittente.IsMatch(t);
        }

        /// <summary>Vero se l'elenco ha gia' quel valore (spazi ai lati e maiuscole a parte).</summary>
        public static bool Contiene(List<string> elenco, string valore)
        {
            if (elenco == null) return false;
            foreach (string e in elenco)
                if (string.Equals((e ?? "").Trim(), (valore ?? "").Trim(), StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        /// <summary>
        /// I mittenti di un elenco come lo scrive Gmail: "a", "a OR b", "(a OR
        /// b)" o "{a b}". null se c'e' altro: un nome fra virgolette, due parole
        /// senza OR (per Gmail ci vogliono tutte e due), un operatore.
        /// </summary>
        static List<string> ElencoMittenti(string valore)
        {
            string v = (valore ?? "").Trim();
            string[] pezzi;
            if (v.Length >= 2 && v[0] == '{' && v[v.Length - 1] == '}')
                pezzi = Regex.Split(v.Substring(1, v.Length - 2).Trim(), @"\s+");
            else
            {
                if (v.Length >= 2 && v[0] == '(' && v[v.Length - 1] == ')') v = v.Substring(1, v.Length - 2).Trim();
                pezzi = Regex.Split(v, @"\s+OR\s+");
            }
            List<string> fuori = new List<string>();
            foreach (string p in pezzi)
            {
                string t = p.Trim();
                if (!UnMittente(t)) return null;
                if (!Contiene(fuori, t)) fuori.Add(t);
            }
            return (fuori.Count > 0) ? fuori : null;
        }

        /// <summary>
        /// I pezzi di una ricerca di Gmail al primo livello, separati dagli
        /// spazi fuori da virgolette, parentesi e graffe: "from:(a OR b)",
        /// "-from:\"Nome Cognome\"", "OR". null se virgolette, parentesi o
        /// graffe non si chiudono.
        /// </summary>
        public static List<string> Termini(string ricerca)
        {
            List<string> fuori = new List<string>();
            StringBuilder b = new StringBuilder();
            int tonde = 0, graffe = 0;
            bool virgolette = false;
            foreach (char c in ricerca ?? "")
            {
                if (c == '"') virgolette = !virgolette;
                else if (!virgolette)
                {
                    if (c == '(') tonde++;
                    else if (c == ')') { if (--tonde < 0) return null; }
                    else if (c == '{') graffe++;
                    else if (c == '}') { if (--graffe < 0) return null; }
                    else if (char.IsWhiteSpace(c) && tonde == 0 && graffe == 0)
                    {
                        if (b.Length > 0) { fuori.Add(b.ToString()); b.Length = 0; }
                        continue;
                    }
                }
                b.Append(c);
            }
            if (virgolette || tonde != 0 || graffe != 0) return null;
            if (b.Length > 0) fuori.Add(b.ToString());
            return fuori;
        }

        /// <summary>
        /// Un termine che esclude dei mittenti, come si scrive nella ricerca:
        /// "-from:y", "-from:\"Nome Cognome\"", "-from:(a OR b)". null se il
        /// termine e' un'altra cosa.
        /// </summary>
        static string Esclusione(string termine)
        {
            if (termine == null || !termine.StartsWith("-from:", StringComparison.OrdinalIgnoreCase)) return null;
            string op = termine.Substring(6);
            if (!Regex.IsMatch(op, "^\"[^\"]+\"$") && ElencoMittenti(op) == null) return null;
            return "-from:" + op;
        }

        /// <summary>
        /// Le esclusioni di una ricerca fatta solo di esclusioni di mittenti (la
        /// ricerca avanzata di una regola che ha preso quelle di un filtro), una
        /// per termine. Vuota per una ricerca vuota; null se c'e' dell'altro.
        /// </summary>
        public static List<string> Esclusioni(string ricerca)
        {
            List<string> termini = Termini(ricerca);
            if (termini == null) return null;
            List<string> fuori = new List<string>();
            foreach (string t in termini)
            {
                string e = Esclusione(t);
                if (e == null) return null;
                if (!Contiene(fuori, e)) fuori.Add(e);
            }
            return fuori;
        }

        /// <summary>I mittenti che una ricerca esclude con -from: (a e b di -from:(a OR b)); i nomi fra virgolette no.</summary>
        public static List<string> MittentiEsclusi(string ricerca)
        {
            List<string> fuori = new List<string>();
            foreach (string t in Termini(ricerca) ?? new List<string>())
            {
                string e = Esclusione(t);
                List<string> da = (e == null) ? null : ElencoMittenti(e.Substring(6));
                if (da == null) continue;
                foreach (string m in da) if (!Contiene(fuori, m)) fuori.Add(m);
            }
            return fuori;
        }

        /// <summary>
        /// I mittenti di un filtro fatto solo di mittenti: il campo Da (from) o
        /// "Con le parole" (query) fatto di from:x o from:(a OR b ...), uno dei
        /// due, piu' le esclusioni (-from:y) e, se c'e', "escluse le chat" (lo
        /// script le esclude sempre). null per ogni altro filtro: con due from:
        /// Gmail vuole tutti e due i mittenti, non uno dei due.
        /// </summary>
        public static MittentiFiltro SoloMittenti(Dictionary<string, string> criteri)
        {
            if (criteri == null || criteri.Count == 0) return null;
            MittentiFiltro m = new MittentiFiltro();
            List<List<string>> presi = new List<List<string>>();
            foreach (KeyValuePair<string, string> kv in criteri)
            {
                if (kv.Key == "excludeChats") continue;
                if (kv.Key == "from")
                {
                    List<string> da = ElencoMittenti(kv.Value);
                    if (da == null) return null;
                    presi.Add(da);
                }
                else if (kv.Key == "query")
                {
                    List<string> termini = Termini(kv.Value);
                    if (termini == null) return null;
                    foreach (string t in termini)
                    {
                        string e = Esclusione(t);
                        if (e != null)
                        {
                            if (!Contiene(m.Esclusi, e)) m.Esclusi.Add(e);
                            continue;
                        }
                        if (!t.StartsWith("from:", StringComparison.OrdinalIgnoreCase)) return null;
                        List<string> da = ElencoMittenti(t.Substring(5));
                        if (da == null) return null;
                        presi.Add(da);
                    }
                }
                else return null;
            }
            if (presi.Count != 1) return null;
            m.Da = presi[0];
            return m;
        }

        /// <summary>
        /// Quello che segue from:, to: o subject: nella ricerca di un filtro:
        /// il valore tale e quale se e' un mittente solo o e' gia' fra
        /// parentesi, altrimenti fra parentesi, come fa Gmail. null se e' vuoto
        /// o virgolette e parentesi non si chiudono.
        /// </summary>
        static string Operando(string valore)
        {
            string v = (valore ?? "").Trim();
            List<string> termini = Termini(v);
            if (v == "" || termini == null) return null;
            if (UnMittente(v)) return v;
            if (termini.Count == 1 && v[0] == '(' && v[v.Length - 1] == ')') return v;
            return "(" + v + ")";
        }

        /// <summary>
        /// La ricerca di Gmail che fa un filtro, dai suoi criteri: from:,
        /// to:, subject:, le parole (fra parentesi se c'e' altro), -parola per
        /// "senza le parole", has:attachment, larger: e smaller:. Solo quando e'
        /// esatta: null per "senza le parole" con piu' parole (Gmail non dice se
        /// ne basta una), una dimensione senza maggiore o minore, un criterio
        /// che non si conosce, virgolette o parentesi che non si chiudono.
        /// "Escluse le chat" non si scrive: lo script le esclude sempre.
        /// </summary>
        public static string RicercaDelFiltro(Dictionary<string, string> criteri)
        {
            if (criteri == null) return null;
            int quanti = 0;
            foreach (string k in criteri.Keys)
            {
                if (Array.IndexOf(FiltroDaTogliere.NomiCriteri, k) < 0) return null;
                if (k != "excludeChats" && k != "sizeComparison") quanti++;
            }
            if (quanti == 0) return null;
            List<string> parti = new List<string>();
            string[] campi = { "from", "to", "subject" };
            foreach (string campo in campi)
            {
                if (!criteri.ContainsKey(campo)) continue;
                string op = Operando(criteri[campo]);
                if (op == null) return null;
                parti.Add(campo + ":" + op);
            }
            if (criteri.ContainsKey("query"))
            {
                string q = (criteri["query"] ?? "").Trim();
                if (q == "" || Termini(q) == null) return null;
                parti.Add(quanti == 1 ? q : "(" + q + ")");
            }
            if (criteri.ContainsKey("negatedQuery"))
            {
                string n = (criteri["negatedQuery"] ?? "").Trim();
                if (!Regex.IsMatch(n, "^[^\\s\"(){}:\\-][^\\s\"(){}]*$")) return null;
                parti.Add("-" + n);
            }
            if (criteri.ContainsKey("hasAttachment")) parti.Add("has:attachment");
            if (criteri.ContainsKey("size"))
            {
                string c = criteri.ContainsKey("sizeComparison") ? criteri["sizeComparison"] : "";
                long n;
                if ((c != "larger" && c != "smaller") ||
                    !long.TryParse(criteri["size"], System.Globalization.NumberStyles.None,
                                   System.Globalization.CultureInfo.InvariantCulture, out n) || n <= 0) return null;
                parti.Add(c + ":" + ((n % 1048576 == 0) ? (n / 1048576) + "M"
                                     : n.ToString(System.Globalization.CultureInfo.InvariantCulture)));
            }
            return string.Join(" ", parti.ToArray());
        }

        /// <summary>L'etichetta del filtro senza il gruppo delle etichette (Posta, passo 4); null se non sta dentro il gruppo.</summary>
        public static string EtichettaNelGruppo(string etichetta, Stato s)
        {
            string e = (etichetta ?? "").Trim().Trim('/').Trim();
            string pre = s.PrefissoPulito();
            if (e == "") return null;
            if (pre == "") return e;
            if (!e.StartsWith(pre + "/", StringComparison.OrdinalIgnoreCase)) return null;
            string resto = e.Substring(pre.Length + 1).Trim().Trim('/').Trim();
            return (resto == "") ? null : resto;
        }

        /// <summary>Il nome intero di una regola, con il gruppo, come al passo 4 e in Gmail.</summary>
        public static string NomeIntero(Regola r, Stato s)
        {
            string pre = s.PrefissoPulito();
            return (pre == "" ? "" : pre + "/") + r.Etichetta;
        }

        /// <summary>La regola che mette proprio quell'etichetta (con il gruppo, maiuscole a parte), o null.</summary>
        public static Regola RegolaConEtichetta(Stato s, string etichetta)
        {
            string e = (etichetta ?? "").Trim().Trim('/').Trim();
            if (e == "") return null;
            foreach (Regola r in s.Regole)
                if (string.Equals(NomeIntero(r, s).Trim(), e, StringComparison.OrdinalIgnoreCase)) return r;
            return null;
        }

        /// <summary>La regola di cui parla il confronto (uguale, simile, di Campanella); null per le sottoetichette dei ruoli.</summary>
        public static Regola RegolaDi(Somiglianza x, Stato s)
        {
            if (x == null || (x.Tipo != Uguale && x.Tipo != Simile && x.Tipo != DiCampanella)) return null;
            return RegolaConEtichetta(s, x.Regola);
        }

        /// <summary>Vero se il mittente e' un segnaposto: @PERSONALE@, @DOMINIO@, @GRUPPO:...@, @CLASSE:...@.</summary>
        static bool Segnaposto(string mittente)
        {
            string v = (mittente ?? "").Trim();
            return v.Length > 1 && v[0] == '@' && v[v.Length - 1] == '@';
        }

        /// <summary>
        /// Vero se i mittenti del filtro si possono aggiungere alla regola senza
        /// cambiare che cosa fa il filtro: la regola ha i mittenti suoi (nessun
        /// segnaposto dell'elenco del personale, del dominio o di una classe) o
        /// quelli di "La tua scuola" (Dirigenza, Segreteria, Registro
        /// elettronico: vanno li'), nessun altro criterio (oggetto, parole,
        /// "basta uno dei due"), nella ricerca avanzata al piu' delle esclusioni
        /// di mittenti, e archivia e segna come letti come il filtro. Le
        /// esclusioni del filtro (-from:y) vanno nella ricerca avanzata: valgono
        /// per tutta la regola. Una regola spenta si accende (Applica).
        /// Registro elettronico prende solo domini e le parole dei registri noti
        /// (spaggiari.eu, @portaleargo.it, nuvola: DelRegistro), nessun
        /// indirizzo intero ne' altre parole: i suoi mittenti stanno nelle
        /// impostazioni (Stato.Impostazioni), non con i dati personali, e
        /// l'indirizzo o il nome di una persona non ci devono finire. Una
        /// regola che esclude altre etichette (Ministero e USR esclude Dirigenza
        /// e Segreteria) non prende un mittente che una di quelle regole prende
        /// tutto (PresoDaUnaEsclusa: la casella della scuola in Segreteria): i
        /// suoi messaggi resterebbero senza l'etichetta del filtro.
        /// </summary>
        public static bool SiPuoUnire(FiltroGmail f, MittentiFiltro m, Regola r, Stato s)
        {
            if (f == null || m == null || r == null) return false;
            if (r.Sorgente != "" && !r.MittentiDallaScuola()) return false;
            if (r.Sorgente == "registro")
                foreach (string d in m.Da) if (!DelRegistro(d)) return false;
            if (LeMieClassi.ClasseDi(r) != null) return false;
            foreach (string d in r.Da) if (Segnaposto(d)) return false;
            if (r.Oggetto.Count > 0 || r.Contiene.Count > 0 || r.UnoQualsiasi) return false;
            if (Esclusioni(r.QueryLibera) == null) return false;
            if (r.Archivia != f.Archivia || r.SegnaComeLette != f.SegnaLetto) return false;
            foreach (string d in m.Da) if (PresoDaUnaEsclusa(s, r, d)) return false;
            return true;
        }

        // le parole con cui scrivono i registri elettronici piu' diffusi: fra i
        // mittenti di Registro elettronico, nelle impostazioni, vanno solo queste
        // e i domini (DelRegistro)
        static readonly string[] ParoleDeiRegistri =
        {
            "spaggiari", "mailspaggiari", "classeviva", "argo", "argosoft", "portaleargo", "didup", "nuvola",
            "madisoft", "axios", "axioscloud", "mastercom", "registroelettronico"
        };

        // un dominio: nomi di lettere, cifre e trattini separati da punti, e in
        // fondo un dominio di primo livello di due lettere (it, eu) o uno di
        // quelli generici; .example e' quello dei dati inventati delle prove
        static readonly Regex DominioDelRegistro = new Regex(
            @"^@?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2}|com|net|org|edu|gov|info|biz|cloud|online|school|education|example)$",
            RegexOptions.IgnoreCase);

        /// <summary>
        /// Vero se il mittente puo' stare fra quelli di Registro elettronico,
        /// nelle impostazioni: un dominio (spaggiari.eu, @portaleargo.it) o la
        /// parola di un registro noto (nuvola). Non un indirizzo, ne' una parola
        /// qualsiasi, che puo' essere il nome di una persona (rossi,
        /// mario.rossi): i nomi delle persone stanno con i dati personali.
        /// </summary>
        static bool DelRegistro(string mittente)
        {
            string t = (mittente ?? "").Trim().ToLowerInvariant();
            return DominioDelRegistro.IsMatch(t) || Array.IndexOf(ParoleDeiRegistri, t) >= 0;
        }

        /// <summary>
        /// Vero se una delle regole di cui r esclude l'etichetta prende tutti i
        /// messaggi del mittente: fra i suoi mittenti (quelli di "La tua scuola"
        /// per Dirigenza e Segreteria, i segnaposto sciolti) c'e' lo stesso
        /// indirizzo o il suo dominio (Copre). Quei messaggi hanno l'etichetta
        /// esclusa, e r non li prende.
        /// </summary>
        static bool PresoDaUnaEsclusa(Stato s, Regola r, string mittente)
        {
            if (s == null || r == null || r.EscludiEtichette.Count == 0) return false;
            Dictionary<string, List<string>> gruppi = s.EtichettaPerRuolo ? s.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            foreach (Regola altra in s.Regole)
            {
                if (altra == r || !Contiene(r.EscludiEtichette, altra.Etichetta)) continue;
                List<string> sue = Espandi(GeneratorePosta.MittentiDellaRegola(s, altra), s.DominioPulito(), s.IndirizziPersonale(), gruppi);
                foreach (string e in sue) if (Copre(e, mittente)) return true;
            }
            return false;
        }

        /// <summary>
        /// Vero se il mittente e di una regola prende tutti i messaggi del
        /// mittente d di un filtro: sono uguali (anche uno con la chiocciola
        /// davanti e l'altro senza), o e e' un dominio (@dominio, o dominio con
        /// un punto) e d e' un indirizzo di quel dominio o un suo sottodominio.
        /// Un indirizzo intero prende solo se stesso, una parola anche.
        /// </summary>
        static bool Copre(string e, string d)
        {
            string a = (e ?? "").Trim().ToLowerInvariant(), b = (d ?? "").Trim().ToLowerInvariant();
            if (a == "" || b == "") return false;
            if (a.TrimStart('@') == b.TrimStart('@')) return true;
            if (a.IndexOf('@') > 0) return false;
            string dominio = a.TrimStart('@');
            if (dominio.IndexOf('.') < 0) return false;
            return b.EndsWith("@" + dominio, StringComparison.Ordinal) || b.EndsWith("." + dominio, StringComparison.Ordinal);
        }

        /// <summary>
        /// Vero se la regola prende gia' tutti i messaggi del filtro: si
        /// potrebbe unire (SiPuoUnire: archivia e segna come letti come lui), e'
        /// accesa nella configurazione, ha gia' tutti i suoi mittenti, ed esclude
        /// solo quello che esclude anche lui (un'esclusione in piu' nella regola
        /// lascerebbe fuori dei messaggi del filtro). Toglierlo non fa perdere niente.
        /// </summary>
        public static bool GiaNellaRegola(FiltroGmail f, Regola r, Stato s)
        {
            MittentiFiltro m = (f == null) ? null : SoloMittenti(f.Criteri);
            if (!SiPuoUnire(f, m, r, s)) return false;
            if (!GeneratorePosta.AttivaNellaConfigurazione(s, r, s.IndirizziPersonale())) return false;
            List<string> da = GeneratorePosta.MittentiDellaRegola(s, r);
            foreach (string d in m.Da) if (!Contiene(da, d)) return false;
            foreach (string e in Esclusioni(r.QueryLibera)) if (!Contiene(m.Esclusi, e)) return false;
            return true;
        }

        /// <summary>Quanti mittenti del filtro la regola non ha ancora (quelli che l'unione aggiunge); 0 se non si puo' unire.</summary>
        public static int MittentiDaAggiungere(FiltroGmail f, Regola r, Stato s)
        {
            MittentiFiltro m = (f == null) ? null : SoloMittenti(f.Criteri);
            if (!SiPuoUnire(f, m, r, s)) return 0;
            List<string> da = GeneratorePosta.MittentiDellaRegola(s, r);
            int n = 0;
            foreach (string d in m.Da) if (!Contiene(da, d)) n++;
            return n;
        }

        /// <summary>
        /// Vero se la regola da sola non cerca niente: nessun mittente (nemmeno
        /// in "La tua scuola"), niente oggetto, parole o ricerca avanzata. Come
        /// Genitori di partenza: accesa con i mittenti di un filtro, prende
        /// solo quelli.
        /// </summary>
        public static bool NienteDaSola(Stato s, Regola r)
        {
            return r != null && GeneratorePosta.MittentiDellaRegola(s, r).Count == 0 && r.Oggetto.Count == 0 &&
                   r.Contiene.Count == 0 && (r.QueryLibera ?? "").Trim() == "";
        }

        /// <summary>Vero se la regola mette proprio quell'etichetta (con il gruppo, maiuscole a parte).</summary>
        static bool ConEtichetta(Regola r, string etichetta, Stato s)
        {
            string e = (etichetta ?? "").Trim().Trim('/').Trim();
            return e != "" && string.Equals(NomeIntero(r, s).Trim(), e, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// La regola accesa che fa gia' quello che fa il filtro: quella per cui
        /// Campanella crea proprio quel filtro (DiCampanella); oppure, fra la
        /// regola simile e quelle con la sua etichetta, una che prende gia'
        /// tutti i suoi messaggi (GiaNellaRegola) o che e' la regola che il
        /// filtro diventa (la stessa ricerca, e archivia e segna come letti come
        /// lui). null se nessuna: avere la stessa etichetta non basta, ne' con
        /// una regola spenta.
        /// </summary>
        public static Regola RegolaCheLoFa(FiltroGmail f, Somiglianza x, Stato s)
        {
            if (f == null || x == null || s == null) return null;
            Regola simile = RegolaDi(x, s);
            if (x.Tipo == DiCampanella) return simile;
            List<Regola> candidate = new List<Regola>();
            if (simile != null) candidate.Add(simile);
            foreach (Regola r in s.Regole) if (!candidate.Contains(r) && ConEtichetta(r, f.Etichetta, s)) candidate.Add(r);
            Regola tradotta = Traduci(f, x, s);
            List<string> personale = s.IndirizziPersonale();
            foreach (Regola r in candidate)
            {
                if (GiaNellaRegola(f, r, s)) return r;
                if (tradotta != null && StessaRegola(tradotta, r) && GeneratorePosta.AttivaNellaConfigurazione(s, r, personale)) return r;
            }
            return null;
        }

        /// <summary>
        /// Vero se ha senso proporre di unire i mittenti alla regola: per
        /// Dirigenza e Segreteria (persone e uffici della scuola) solo indirizzi
        /// interi, non domini o parole. "Amministrazione e stipendio", con i
        /// domini degli stipendi, somiglia a Segreteria solo nel nome.
        /// </summary>
        static bool DaProporre(MittentiFiltro m, Regola r)
        {
            if (m == null || r == null) return false;
            if (r.Sorgente != "dirigenza" && r.Sorgente != "segreteria") return true;
            foreach (string d in m.Da) if (d.IndexOf('@') <= 0) return false;
            return true;
        }

        /// <summary>Come comincia la descrizione di una regola nata da un filtro di Gmail.</summary>
        public const string DaUnFiltro = "Da un filtro di Gmail: ";

        /// <summary>
        /// La regola che il filtro diventa, senza guardare se la sua etichetta
        /// c'e' gia': la stessa etichetta (senza il gruppo), i mittenti fra i
        /// mittenti e le esclusioni nella ricerca avanzata se il filtro e' fatto
        /// solo di mittenti, altrimenti tutta la ricerca del filtro nella
        /// ricerca avanzata; archivia e segna come letti se lo fa il filtro; il
        /// colore lo sceglie Applica. null se il filtro fa anche altro, se e' di
        /// una classe o creato da Campanella, se l'etichetta non sta nel gruppo
        /// o se la sua ricerca non si scrive esatta.
        /// </summary>
        static Regola Traduci(FiltroGmail f, Somiglianza x, Stato s)
        {
            if (f == null || x == null || f.DaTogliere() == null || f.AltreAzioni.Count > 0) return null;
            if (x.Tipo != Tuo && x.Tipo != Simile && x.Tipo != Uguale) return null;
            if (x.Classe || EtichettaDiUnaClasse(f.Etichetta, s)) return null;
            string etichetta = EtichettaNelGruppo(f.Etichetta, s);
            string ricerca = RicercaDelFiltro(f.Criteri);
            if (etichetta == null || ricerca == null) return null;
            Regola r = new Regola();
            r.Etichetta = etichetta;
            MittentiFiltro m = SoloMittenti(f.Criteri);
            if (m != null)
            {
                r.Da = new List<string>(m.Da);
                r.QueryLibera = string.Join(" ", m.Esclusi.ToArray());
            }
            else r.QueryLibera = ricerca;
            r.Archivia = f.Archivia;
            r.SegnaComeLette = f.SegnaLetto;
            List<string> fa = new List<string>();
            if (f.Archivia) fa.Add("archivia");
            if (f.SegnaLetto) fa.Add("segna come letti");
            // la ricerca la dicono i mittenti e la ricerca avanzata, sotto la descrizione
            r.Descrizione = DaUnFiltro + "la stessa etichetta e la stessa ricerca" +
                            (fa.Count > 0 ? ", e " + string.Join(", ", fa.ToArray()) : "") + ".";
            return r;
        }

        /// <summary>
        /// La regola che il filtro diventa (Traduci), se nessuna regola ha gia'
        /// la sua etichetta: e' cosi' che la finestra riaperta sullo stesso
        /// file non la propone di nuovo. null se non puo'.
        /// </summary>
        public static Regola RegolaDalFiltro(FiltroGmail f, Somiglianza x, Stato s)
        {
            if (f == null || RegolaConEtichetta(s, f.Etichetta) != null) return null;
            return Traduci(f, x, s);
        }

        /// <summary>Perche' il filtro non puo' diventare una regola, a parole; "" se puo'.</summary>
        public static string PercheNonDiventaRegola(FiltroGmail f, Somiglianza x, Stato s)
        {
            if (f == null || x == null) return "";
            if (RegolaDalFiltro(f, x, s) != null) return "";
            if (f.DaTogliere() == null || x.Tipo == DiUnaClasse) return "non si puo' togliere";
            if (f.AltreAzioni.Count > 0) return "fa anche altro (" + string.Join(", ", f.AltreAzioni.ToArray()) + ")";
            if (x.Tipo == DiCampanella) return "e' uno di quelli creati da Campanella";
            if (x.Classe || EtichettaDiUnaClasse(f.Etichetta, s)) return "l'etichetta sembra di una classe (per le classi c'e' \"Le mie classi...\")";
            if (RegolaConEtichetta(s, f.Etichetta) != null) return "c'e' gia' una regola con la sua etichetta";
            if (EtichettaNelGruppo(f.Etichetta, s) == null)
                return "l'etichetta non sta dentro \"" + s.PrefissoPulito() + "\", il gruppo delle etichette";
            return "la sua ricerca non si scrive esatta per Gmail";
        }

        /// <summary>
        /// Come diventa la regola se ci si uniscono i mittenti del filtro: una
        /// copia, con i mittenti (anche quelli di "La tua scuola") e le
        /// esclusioni in piu', accesa. Per dire la ricerca che fara'; null se
        /// non si puo' unire.
        /// </summary>
        public static Regola DopoLUnione(FiltroGmail f, Regola r, Stato s)
        {
            MittentiFiltro m = (f == null) ? null : SoloMittenti(f.Criteri);
            if (!SiPuoUnire(f, m, r, s)) return null;
            Regola c = r.Copia();
            c.Sorgente = "";
            c.Da = GeneratorePosta.MittentiDellaRegola(s, r);
            foreach (string d in m.Da) if (!Contiene(c.Da, d)) c.Da.Add(d);
            List<string> esclusi = Esclusioni(r.QueryLibera);
            foreach (string e in m.Esclusi) if (!Contiene(esclusi, e)) esclusi.Add(e);
            c.QueryLibera = string.Join(" ", esclusi.ToArray());
            c.Attiva = true;
            return c;
        }

        /// <summary>
        /// Che cosa si puo' fare di un filtro, nell'ordine della tendina:
        /// lasciarlo in Gmail; toglierlo ("lo fa gia' la regola X" solo se una
        /// regola accesa prende davvero i suoi messaggi: RegolaCheLoFa; con
        /// quello che si perde, se fa anche altro); unire i mittenti a una
        /// regola (prima quella simile, poi le altre in ordine, solo dove si
        /// puo': SiPuoUnire; a una spenta anche se ha gia' i suoi mittenti,
        /// per accenderla); farne una regola (RegolaDalFiltro). Uno che non si puo'
        /// togliere (di una classe, senza etichetta o criteri, con un criterio
        /// che non si capisce) si lascia e basta; uno che fa anche altro, di
        /// una classe o creato da Campanella si lascia o si toglie.
        /// </summary>
        public static List<SceltaFiltro> Scelte(FiltroGmail f, Somiglianza x, Stato s)
        {
            List<SceltaFiltro> fuori = new List<SceltaFiltro>();
            fuori.Add(new SceltaFiltro());
            if (f == null || x == null || x.Tipo == DiUnaClasse || f.DaTogliere() == null) return fuori;
            Regola simile = RegolaDi(x, s);
            Regola fa = RegolaCheLoFa(f, x, s);
            SceltaFiltro togli = new SceltaFiltro();
            togli.Azione = SceltaFiltro.Togli;
            string perse = (f.AltreAzioni.Count > 0) ? " (si perde: " + string.Join(", ", f.AltreAzioni.ToArray()) + ")" : "";
            if (fa != null)
            {
                togli.Regola = fa;
                togli.Testo = "Toglilo: lo fa gia' la regola " + NomeIntero(fa, s) + perse;
            }
            else togli.Testo = "Toglilo" + perse;
            fuori.Add(togli);
            if (f.AltreAzioni.Count > 0 || x.Tipo == DiCampanella || x.Classe) return fuori;

            MittentiFiltro m = SoloMittenti(f.Criteri);
            if (m != null)
            {
                List<Regola> ordine = new List<Regola>();
                if (simile != null) ordine.Add(simile);
                foreach (Regola r in s.Regole) if (r != simile) ordine.Add(r);
                foreach (Regola r in ordine)
                {
                    if (r == fa || !SiPuoUnire(f, m, r, s)) continue;
                    SceltaFiltro u = new SceltaFiltro();
                    u.Azione = SceltaFiltro.Unisci;
                    u.Regola = r;
                    u.Testo = Unico(fuori, "Unisci a " + NomeIntero(r, s) +
                                           (r.MittentiDallaScuola() ? " (in \"La tua scuola\")" : "") +
                                           (r.Attiva ? "" : " (la accendo)"));
                    fuori.Add(u);
                }
            }
            if (RegolaDalFiltro(f, x, s) != null)
            {
                SceltaFiltro n = new SceltaFiltro();
                n.Azione = SceltaFiltro.Nuova;
                n.Testo = "Diventa una regola";
                fuori.Add(n);
            }
            return fuori;
        }

        /// <summary>Il testo, diverso da quelli gia' nella tendina: due regole con lo stesso nome prendono un numero.</summary>
        static string Unico(List<SceltaFiltro> gia, string testo)
        {
            string t = testo;
            for (int n = 2; Trova(gia, t) != null; n++) t = testo + " (" + n + ")";
            return t;
        }

        /// <summary>La scelta con quel testo, o null.</summary>
        public static SceltaFiltro Trova(List<SceltaFiltro> scelte, string testo)
        {
            if (scelte != null) foreach (SceltaFiltro c in scelte) if (c.Testo == testo) return c;
            return null;
        }

        /// <summary>La prima scelta con quell'azione (e quella regola, se non e' null), o null.</summary>
        public static SceltaFiltro Trova(List<SceltaFiltro> scelte, string azione, Regola regola)
        {
            if (scelte != null)
                foreach (SceltaFiltro c in scelte)
                    if (c.Azione == azione && (regola == null || c.Regola == regola)) return c;
            return null;
        }

        /// <summary>
        /// La scelta di partenza, fra quelle di Scelte. Uguale a una regola, se
        /// non fa anche altro: toglilo se la regola prende gia' i suoi messaggi
        /// (RegolaCheLoFa); se ha dei mittenti che la regola non ha e si possono
        /// unire, unisci, cosi' non si perdono; altrimenti (archivia o segna come
        /// letti diversamente, cerca altro che i mittenti, la regola ha i
        /// segnaposto) lascialo: con l'etichetta uguale la regola non lo
        /// sostituisce. Simile: toglilo se una regola accesa lo fa gia', unisci
        /// alla regola simile se si puo' e ha senso (DaProporre; se e' spenta,
        /// solo se da sola non cerca niente, come Genitori: accesa prenderebbe
        /// anche quello che cercava gia'); se si puo' ma non ha senso, diventa
        /// una regola se si puo'; altrimenti lascialo. Simile solo nel nome a
        /// Dirigenza o Segreteria (domini, non indirizzi) e' come tuo. Tuo: diventa una regola se si
        /// puo', altrimenti lascialo. Di Campanella, di una classe, che fa anche
        /// altro, con un criterio che non si capisce: lascialo. Uno scelto prima
        /// (prima): toglilo, come prima.
        /// </summary>
        public static SceltaFiltro Proposta(List<SceltaFiltro> scelte, FiltroGmail f, Somiglianza x, Stato s, bool prima)
        {
            SceltaFiltro lascia = scelte[0];
            SceltaFiltro togli = Trova(scelte, SceltaFiltro.Togli, null);
            if (togli == null) return lascia;
            if (prima) return togli;
            if (f == null || x == null) return lascia;
            Regola simile = RegolaDi(x, s);
            SceltaFiltro unisci = (simile == null) ? null : Trova(scelte, SceltaFiltro.Unisci, simile);
            SceltaFiltro nuova = Trova(scelte, SceltaFiltro.Nuova, null);
            if (x.Tipo == Uguale) return !DiPartenza(f, x) ? lascia : (togli.Regola != null ? togli : (unisci ?? lascia));
            if (x.Tipo == Tuo) return nuova ?? lascia;
            if (x.Tipo != Simile || x.Classe || f.AltreAzioni.Count > 0) return lascia;
            if (togli.Regola != null) return togli;
            if (unisci != null && DaProporre(SoloMittenti(f.Criteri), simile) && (simile.Attiva || NienteDaSola(s, simile)))
                return unisci;
            if (unisci != null) return nuova ?? lascia;
            return lascia;
        }

        /// <summary>
        /// Vero se il filtro scelto da togliere ha ancora la regola che lo
        /// sostituisce (FiltroDaTogliere.Regola), accesa nella configurazione:
        /// quella che crea proprio quel filtro (EXTRA_creaFiltriGmail), o una
        /// con quell'etichetta che ha ancora tutti i suoi mittenti (anche in "La
        /// tua scuola", con i segnaposto sciolti) o, per uno che non e' fatto
        /// solo di mittenti, proprio la sua ricerca. Vero anche per uno che si
        /// toglie e basta. Tolta, spenta o cambiata la regola dopo "Usa questa
        /// scelta", il filtro resta in Gmail (GeneratorePosta.FiltriJs non lo
        /// scrive) e il passo 4 lo dice: nessun filtro va via senza la regola
        /// che lo sostituisce.
        /// </summary>
        public static bool AncoraSostituito(FiltroDaTogliere v, Stato s)
        {
            if (v == null || s == null || (v.Regola ?? "").Trim() == "") return true;
            if (DiCampanellaAdesso(v.Etichetta, v.Criteri, s)) return true;
            MittentiFiltro m = SoloMittenti(v.Criteri);
            string ricerca = RicercaDelFiltro(v.Criteri);
            List<string> personale = s.IndirizziPersonale();
            Dictionary<string, List<string>> gruppi = s.EtichettaPerRuolo ? s.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            foreach (Regola r in s.Regole)
            {
                if (!string.Equals((r.Etichetta ?? "").Trim(), v.Regola.Trim(), StringComparison.OrdinalIgnoreCase) ||
                    !GeneratorePosta.AttivaNellaConfigurazione(s, r, personale)) continue;
                if (m != null)
                {
                    List<string> da = GeneratorePosta.MittentiDellaRegola(s, r);
                    da.AddRange(Espandi(da, s.DominioPulito(), personale, gruppi));
                    bool tutti = true;
                    foreach (string d in m.Da) if (!Contiene(da, d)) { tutti = false; break; }
                    if (tutti) return true;
                }
                else if (ricerca != null && string.Equals((r.QueryLibera ?? "").Trim(), ricerca.Trim(), StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        /// <summary>I filtri scelti da togliere che non hanno piu' la regola che li sostituisce (AncoraSostituito): restano in Gmail.</summary>
        public static List<FiltroDaTogliere> SenzaLaRegola(Stato s)
        {
            List<FiltroDaTogliere> fuori = new List<FiltroDaTogliere>();
            if (s == null || s.FiltriDaTogliere == null) return fuori;
            foreach (FiltroDaTogliere v in s.FiltriDaTogliere)
                if (v != null && !DiUnaClasseConIndirizzi(v.Etichetta, v.Criteri, s) && !AncoraSostituito(v, s)) fuori.Add(v);
            return fuori;
        }

        /// <summary>
        /// Fa nello Stato quello che si e' scelto nella finestra: unisce i
        /// mittenti alle regole (o in "La tua scuola", per Dirigenza, Segreteria
        /// e Registro elettronico) e le esclusioni alla loro ricerca avanzata,
        /// accende una regola spenta che li prende, crea le regole nuove (dopo
        /// quella simile, o in fondo, con il primo colore libero) e mette fra i
        /// filtri da togliere (FiltriDaTogliere) quelli che non si lasciano, ognuno
        /// con la regola che lo sostituisce (FiltroDaTogliere.Regola). Un
        /// filtro che non riesce piu' a diventare regola o a unirsi resta in
        /// Gmail: nessun filtro va via senza la regola che lo sostituisce. Un
        /// filtro uguale a uno gia' fatto (la stessa voce) non si rifa'. Una
        /// regola nuova con l'etichetta di una che c'e' gia' non nasce di
        /// nuovo: se la regola fa gia' quello che faceva il filtro basta lei,
        /// se si puo', con le stesse esclusioni, ci si uniscono i mittenti; un
        /// altro filtro con la stessa etichetta, appena diventato regola, ne fa
        /// altrimenti un'altra con la stessa etichetta (CreaRegola). Dice che
        /// cosa ha fatto, a parole.
        /// </summary>
        public static string Applica(Stato s, List<FiltroScelto> scelti)
        {
            List<FiltroDaTogliere> togli = new List<FiltroDaTogliere>();
            List<string> fatte = new List<string>();
            List<string> nuove = new List<string>(), unite = new List<string>(), scuola = new List<string>();
            List<string> saltati = new List<string>();
            List<Regola> createAdesso = new List<Regola>();
            Dictionary<Regola, int> dopo = new Dictionary<Regola, int>();
            int lasciati = 0;
            // due filtri uguali sono la stessa voce: conta la scelta di quello
            // che unisce o fa una regola, se c'e', altrimenti del primo
            Dictionary<string, FiltroScelto> perVoce = new Dictionary<string, FiltroScelto>();
            foreach (FiltroScelto x in scelti ?? new List<FiltroScelto>())
            {
                if (x == null || x.Voce == null || x.Scelta == null || !x.Scelta.TogliIlFiltro) continue;
                string k = x.Voce.Chiave();
                if (!perVoce.ContainsKey(k) || (perVoce[k].Scelta.Azione == SceltaFiltro.Togli && x.Scelta.Azione != SceltaFiltro.Togli))
                    perVoce[k] = x;
            }
            foreach (FiltroScelto x in scelti ?? new List<FiltroScelto>())
            {
                if (x == null) continue;
                if (x.Voce == null || x.Scelta == null || !x.Scelta.TogliIlFiltro) { lasciati++; continue; }
                string chiave = x.Voce.Chiave();
                if (fatte.Contains(chiave) || perVoce[chiave] != x) continue;
                string perche = "";
                Regola sostituta = x.Scelta.Regola;
                if (x.Scelta.Azione == SceltaFiltro.Unisci)
                    perche = UnisciAllaRegola(s, x.Filtro, x.Scelta.Regola, unite, scuola);
                else if (x.Scelta.Azione == SceltaFiltro.Nuova)
                    perche = CreaRegola(s, x, dopo, createAdesso, nuove, unite, scuola, out sostituta);
                if (perche != "")
                {
                    saltati.Add(x.Voce.Etichetta + " (" + perche + ")");
                    lasciati++;
                    continue;
                }
                fatte.Add(chiave);
                // la regola che lo sostituisce; con "Toglilo" e basta resta quella
                // di una scelta di prima, finche' lo sostituisce ancora
                FiltroDaTogliere voce = x.Voce.Copia();
                if (sostituta != null) voce.Regola = sostituta.Etichetta;
                else if (!AncoraSostituito(voce, s)) voce.Regola = "";
                togli.Add(voce);
            }
            s.FiltriDaTogliere = togli;

            StringBuilder sb = new StringBuilder();
            if (nuove.Count > 0)
                sb.Append(nuove.Count == 1 ? "Una regola nuova" : nuove.Count + " regole nuove")
                  .Append(", con l'etichetta e la ricerca del filtro (in fondo alle regole, o sotto quella simile): ")
                  .Append(string.Join(", ", nuove.ToArray())).Append(".\r\n\r\n");
            if (unite.Count > 0)
                sb.Append("Mittenti aggiunti alle regole: ").Append(string.Join("; ", unite.ToArray())).Append(".\r\n\r\n");
            if (scuola.Count > 0)
                sb.Append("Mittenti aggiunti nella pagina \"La tua scuola\", dove si scrivono quelli di Dirigenza, " +
                          "Segreteria e Registro elettronico: ").Append(string.Join("; ", scuola.ToArray())).Append(".\r\n\r\n");
            if (saltati.Count > 0)
                sb.Append("Restano in Gmail, perche' la scelta non si puo' piu' fare: ")
                  .Append(string.Join("; ", saltati.ToArray())).Append(".\r\n\r\n");
            int n = togli.Count;
            sb.Append(n == 0 ? "Nessun filtro da togliere." :
                (n == 1 ? "1 filtro da togliere" : n + " filtri da togliere") + ": li toglie EXTRA_togliFiltri.");
            if (n > 0 && nuove.Count + unite.Count + scuola.Count > 0)
                sb.Append(" Le regole e i filtri da togliere arrivano insieme, nella stessa configurazione: copiala di " +
                          "nuovo (passo 5) e incollala al posto di quella di prima prima di eseguire EXTRA_togliFiltri, " +
                          "cosi' nessun filtro va via prima della regola che lo sostituisce.");
            else if (n > 0) sb.Append(" Copia di nuovo la configurazione (passo 5).");
            if (lasciati > 0)
                sb.Append("\r\n\r\n").Append(lasciati == 1 ? "1 filtro resta in Gmail." : lasciati + " filtri restano in Gmail.");
            return sb.ToString();
        }

        /// <summary>
        /// Aggiunge i mittenti del filtro alla regola (a "La tua scuola" per
        /// Dirigenza, Segreteria e Registro elettronico) e le sue esclusioni
        /// alla ricerca avanzata, e la accende. "" se l'ha fatto, altrimenti il perche'.
        /// </summary>
        static string UnisciAllaRegola(Stato s, FiltroGmail f, Regola r, List<string> unite, List<string> scuola)
        {
            MittentiFiltro m = (f == null) ? null : SoloMittenti(f.Criteri);
            if (r == null || !s.Regole.Contains(r) || !SiPuoUnire(f, m, r, s)) return "non si unisce piu' a quella regola";
            List<string> aggiunti = new List<string>();
            List<string> gia = GeneratorePosta.MittentiDellaRegola(s, r);
            foreach (string d in m.Da) if (!Contiene(gia, d) && !Contiene(aggiunti, d)) aggiunti.Add(d);
            if (r.MittentiDallaScuola())
            {
                if (aggiunti.Count > 0)
                {
                    string campo = (r.Sorgente == "dirigenza") ? s.Dirigenza : (r.Sorgente == "segreteria") ? s.Segreteria : s.Registro;
                    campo = (campo ?? "").TrimEnd();
                    campo = (campo == "" ? "" : campo + "\r\n") + string.Join("\r\n", aggiunti.ToArray());
                    if (r.Sorgente == "dirigenza") s.Dirigenza = campo;
                    else if (r.Sorgente == "segreteria") s.Segreteria = campo;
                    else s.Registro = campo;
                }
            }
            else r.Da.AddRange(aggiunti);
            List<string> esclusi = Esclusioni(r.QueryLibera);
            int nuoveEsclusioni = 0;
            foreach (string e in m.Esclusi)
                if (!Contiene(esclusi, e)) { esclusi.Add(e); nuoveEsclusioni++; }
            if (nuoveEsclusioni > 0) r.QueryLibera = string.Join(" ", esclusi.ToArray());
            bool accesa = !r.Attiva;
            r.Attiva = true;
            // una spenta che aveva gia' i mittenti del filtro: si accende e basta
            string detto = r.Etichetta + ": " +
                (aggiunti.Count == 0 && nuoveEsclusioni == 0
                    ? "i mittenti del filtro \"" + f.Etichetta + "\" li aveva gia'"
                    : (aggiunti.Count == 1 ? "1 mittente" : aggiunti.Count + " mittenti") +
                      (nuoveEsclusioni == 0 ? "" : nuoveEsclusioni == 1 ? " e 1 esclusione" : " e " + nuoveEsclusioni + " esclusioni") +
                      " dal filtro \"" + f.Etichetta + "\"" +
                      (nuoveEsclusioni > 0 ? " (le esclusioni valgono per tutta la regola)" : "")) +
                (accesa ? "; era spenta, adesso e' accesa" : "");
            (r.MittentiDallaScuola() ? scuola : unite).Add(detto);
            return "";
        }

        /// <summary>
        /// Crea la regola che il filtro diventa. Con l'etichetta di una regola
        /// che c'e' gia' (la finestra riaperta sullo stesso file, o due filtri
        /// con la stessa etichetta): se una di quelle regole fa gia' quello che
        /// faceva il filtro basta lei; se a una si possono unire i mittenti e
        /// il filtro esclude le stesse cose (nessuna, o le stesse -from:) ci si
        /// uniscono; altrimenti, se sono regole appena nate da altri filtri, ne
        /// nasce un'altra con la stessa etichetta e lo stesso colore, subito
        /// sotto: unite, le esclusioni dell'uno varrebbero anche per i mittenti
        /// dell'altro. Con una regola che c'era gia', il filtro resta. "" se
        /// l'ha fatto, altrimenti il perche'.
        /// </summary>
        static string CreaRegola(Stato s, FiltroScelto x, Dictionary<Regola, int> dopo, List<Regola> createAdesso,
                                 List<string> nuove, List<string> unite, List<string> scuola, out Regola sostituta)
        {
            sostituta = null;
            FiltroGmail f = x.Filtro;
            Regola r = Traduci(f, x.Somiglia, s);
            if (r == null) return "non si scrive come regola";
            List<string> personale = s.IndirizziPersonale();
            MittentiFiltro m = SoloMittenti(f.Criteri);
            Regola cera = null, gemella = null;
            foreach (Regola e in s.Regole)
            {
                if (!ConEtichetta(e, f.Etichetta, s)) continue;
                if (GiaNellaRegola(f, e, s) || (StessaRegola(r, e) && GeneratorePosta.AttivaNellaConfigurazione(s, e, personale)))
                {
                    sostituta = e;
                    return "";
                }
                if (!createAdesso.Contains(e)) { if (cera == null) cera = e; }
                else gemella = e;
            }
            foreach (Regola e in s.Regole)
                if (ConEtichetta(e, f.Etichetta, s) && m != null && SiPuoUnire(f, m, e, s) &&
                    StesseEsclusioni(m.Esclusi, Esclusioni(e.QueryLibera)))
                {
                    sostituta = e;
                    return UnisciAllaRegola(s, f, e, unite, scuola);
                }
            if (cera != null) return "c'e' gia' la regola " + NomeIntero(cera, s);
            r.Colore = (gemella != null) ? gemella.Colore : ColoriEtichette.PrimoLibero(s.Regole, s.ColoriRuoli);
            Regola simile = (x.Somiglia != null && x.Somiglia.Tipo == Simile) ? RegolaDi(x.Somiglia, s) : null;
            int dove = s.Regole.Count;
            if (gemella != null)
            {
                dove = s.Regole.IndexOf(gemella) + 1;
                // dentro le regole nuove messe sotto una simile: sono una di piu'
                foreach (Regola k in new List<Regola>(dopo.Keys))
                {
                    int i = s.Regole.IndexOf(k);
                    if (i >= 0 && dove > i && dove <= i + dopo[k] + 1) dopo[k] = dopo[k] + 1;
                }
            }
            else if (simile != null && s.Regole.Contains(simile))
            {
                int gia = dopo.ContainsKey(simile) ? dopo[simile] : 0;
                dove = Math.Min(s.Regole.Count, s.Regole.IndexOf(simile) + 1 + gia);
                dopo[simile] = gia + 1;
            }
            s.Regole.Insert(dove, r);
            createAdesso.Add(r);
            nuove.Add(NomeIntero(r, s));
            sostituta = r;
            return "";
        }

        /// <summary>Vero se i due elenchi hanno le stesse esclusioni (maiuscole e ordine a parte).</summary>
        static bool StesseEsclusioni(List<string> a, List<string> b)
        {
            if (a == null || b == null) return false;
            foreach (string e in a) if (!Contiene(b, e)) return false;
            foreach (string e in b) if (!Contiene(a, e)) return false;
            return true;
        }

        /// <summary>
        /// Vero se la regola b cerca la stessa cosa della regola a, nata da un
        /// filtro, e fa lo stesso: etichetta, mittenti, ricerca, archivia,
        /// letti; e b non ha altri criteri ne' etichette escluse.
        /// </summary>
        static bool StessaRegola(Regola a, Regola b)
        {
            if (!string.Equals(a.Etichetta.Trim(), b.Etichetta.Trim(), StringComparison.OrdinalIgnoreCase)) return false;
            if (a.Da.Count != b.Da.Count || b.Oggetto.Count > 0 || b.Contiene.Count > 0 || b.UnoQualsiasi) return false;
            if (b.Sorgente != "" || b.EscludiEtichette.Count > 0) return false;
            foreach (string d in a.Da) if (!Contiene(b.Da, d)) return false;
            return string.Equals((a.QueryLibera ?? "").Trim(), (b.QueryLibera ?? "").Trim(), StringComparison.OrdinalIgnoreCase) &&
                   a.Archivia == b.Archivia && a.SegnaComeLette == b.SegnaComeLette;
        }
    }
}
