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
        /// <summary>null: uno scelto prima, che nel file non c'e' (o senza il file).</summary>
        public FiltroGmail Filtro;
        /// <summary>null: non si puo' togliere (niente etichetta, criteri, uno non si capisce, di una classe).</summary>
        public FiltroDaTogliere Voce;
        public Somiglianza Somiglia;
        public SceltaFiltro Scelta;
        /// <summary>
        /// La scelta l'ha fatta il docente nella tendina (o con lo spazio), non
        /// e' la proposta: un "Toglilo" e basta scelto cosi' toglie il filtro
        /// anche se la regola di prima non lo sostituisce piu'.
        /// </summary>
        public bool AMano = false;
        /// <summary>
        /// Scelto prima, e nel file aperto non c'e': forse e' gia' stato tolto, e
        /// non conta fra quelli che restano in Gmail.
        /// </summary>
        public bool FuoriDalFile = false;
    }

    /// <summary>Un filtro con una scelta che lo toglie, che invece resta in Gmail: la sua voce (FiltroDaTogliere.Chiave), l'etichetta e perche'.</summary>
    class FiltroCheResta
    {
        public string Chiave = "", Etichetta = "", Perche = "";
        /// <summary>
        /// Resta per una ragione che non dipende dalle altre scelte (un filtro
        /// lasciato in Gmail per scelta, una scelta che non si puo' fare in
        /// nessun caso): anche lasciate altre scelte resterebbe. Esito lo lascia
        /// subito, senza un giro per lui.
        /// </summary>
        public bool Certo = false;
    }

    /// <summary>Che cosa fanno le scelte della finestra dei filtri (FiltriGmail.Applica e FiltriGmail.Prova).</summary>
    class EsitoScelte
    {
        /// <summary>I filtri da togliere, ognuno con la regola che lo sostituisce.</summary>
        public List<FiltroDaTogliere> Togli = new List<FiltroDaTogliere>();
        /// <summary>Quelli con una scelta che li toglie che restano in Gmail, e perche'.</summary>
        public List<FiltroCheResta> Restano = new List<FiltroCheResta>();
        /// <summary>Le regole nuove (con il gruppo), i mittenti uniti alle regole e in "La tua scuola", a parole.</summary>
        public List<string> Nuove = new List<string>(), Unite = new List<string>(), Scuola = new List<string>();
        /// <summary>Quanti filtri della finestra restano in Gmail (lasciati, o la cui scelta non si puo' fare).</summary>
        public int Lasciati = 0;
        /// <summary>Che cosa e' successo, a parole: il riepilogo dopo "Usa questa scelta".</summary>
        public string Riepilogo = "";

        /// <summary>Perche' il filtro con quella voce resta in Gmail anche se la scelta lo toglie; null se non resta.</summary>
        public string PercheResta(string chiave)
        {
            foreach (FiltroCheResta r in Restano) if (r.Chiave == chiave) return r.Perche;
            return null;
        }
    }

    /// <summary>
    /// Un'etichetta rimasta da un filtro di Gmail che va via sostituito da una
    /// regola con un'altra etichetta (FiltriGmail.EtichetteRimaste): Da e' quella
    /// del filtro, come in Gmail; A quella della regola, con il gruppo.
    /// EXTRA_unisciEtichette mette A a tutte le conversazioni di Da, e basta.
    /// </summary>
    class CoppiaEtichette
    {
        public string Da = "";
        public string A = "";
        public string Testo() { return Da + " → " + A; }
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
        /// Manda nel cestino (shouldTrash). Restando in Gmail, un filtro cosi'
        /// toglie ai messaggi che prende le etichette delle regole: la loro
        /// ricerca nel cestino non guarda (FiltriGmail.Applica).
        /// </summary>
        public bool Cestino = false;
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

        /// <summary>
        /// La voce da togliere per questo filtro, con quello che fa oltre
        /// all'etichetta (archivia, segna come letto): null se non mette
        /// etichette, non ha criteri o uno non si capisce.
        /// </summary>
        public FiltroDaTogliere DaTogliere()
        {
            if (CriteriIncompleti) return null;
            List<KeyValuePair<string, object>> c = new List<KeyValuePair<string, object>>();
            foreach (KeyValuePair<string, string> kv in Criteri) c.Add(new KeyValuePair<string, object>(kv.Key, kv.Value));
            FiltroDaTogliere v = FiltroDaTogliere.Da(Etichetta, c);
            if (v != null)
            {
                v.Archivia = Archivia;
                v.SegnaLetto = SegnaLetto;
            }
            return v;
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
                else
                {
                    if (nome == "shouldTrash") f.Cestino = true;
                    f.AltreAzioni.Add(AzioniSiNo[i, 1]);
                }
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
            Regola chi;
            return CreatoDaCampanella(etichetta, criteri, s, out chi);
        }

        /// <summary>
        /// Vero se etichetta e criteri sono proprio quelli di un filtro che
        /// EXTRA_creaFiltriGmail crea con la configurazione di adesso
        /// (FiltriDiCampanella); in chi, la regola che lo crea: proprio quella,
        /// non un'altra con la stessa etichetta (due Portali creano ognuna i
        /// suoi). null per le sottoetichette dei ruoli, che non hanno una regola.
        /// </summary>
        static bool CreatoDaCampanella(string etichetta, Dictionary<string, string> criteri, Stato s, out Regola chi)
        {
            chi = null;
            if (criteri == null || criteri.Count == 0) return false;
            List<KeyValuePair<string, object>> grezzi = new List<KeyValuePair<string, object>>();
            foreach (KeyValuePair<string, string> kv in criteri) grezzi.Add(new KeyValuePair<string, object>(kv.Key, kv.Value));
            FiltroDaTogliere questo = FiltroDaTogliere.Da(etichetta, grezzi);
            if (questo == null) return false;
            string chiave = questo.Chiave();
            foreach (KeyValuePair<Regola, FiltroDaTogliere> kv in FiltriDiCampanellaConLaRegola(s, chiave))
                if (kv.Value.Chiave() == chiave) { chi = kv.Key; return true; }
            return false;
        }

        /// <summary>
        /// La regola accesa che sostituisce un filtro creato da Campanella: quella
        /// che crea proprio quel filtro (CreatoDaCampanella), se archivia e segna
        /// come letti come lui (StesseAzioni: se non si sa, deve farlo) e sopra
        /// di lei non c'e' un'altra regola con la stessa etichetta che fa
        /// diversamente (PrimaUnaDiversa), che nello script prenderebbe quei
        /// messaggi per prima. null se non e' creato da Campanella, se lo crea la
        /// sottoetichetta di un ruolo o se la regola non lo sostituisce.
        /// </summary>
        static Regola RegolaCheLoCrea(string etichetta, Dictionary<string, string> criteri, bool? archivia, bool? letti, Stato s)
        {
            Regola chi;
            if (!CreatoDaCampanella(etichetta, criteri, s, out chi) || chi == null) return null;
            if (!StesseAzioni(chi, archivia, letti) || PrimaUnaDiversa(s, chi, s.IndirizziPersonale())) return null;
            return chi;
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
            foreach (KeyValuePair<Regola, FiltroDaTogliere> kv in FiltriDiCampanellaConLaRegola(s, null)) fuori.Add(kv.Value);
            return fuori;
        }

        /// <summary>
        /// Gli stessi, ognuno con la regola che lo crea (null per le
        /// sottoetichette dei ruoli). Con perLaChiave (FiltroDaTogliere.Chiave
        /// di un filtro), solo quelli con la sua etichetta, nello stesso ordine:
        /// gli altri non possono avere quella chiave, e calcolarli tutti per ogni
        /// filtro della finestra, a ogni scelta, costa (sono uno o piu' per regola).
        /// </summary>
        static List<KeyValuePair<Regola, FiltroDaTogliere>> FiltriDiCampanellaConLaRegola(Stato s, string perLaChiave)
        {
            List<KeyValuePair<Regola, FiltroDaTogliere>> fuori = new List<KeyValuePair<Regola, FiltroDaTogliere>>();
            string pre = s.PrefissoPulito();
            string davanti = (pre == "") ? "" : pre + "/";
            List<string> personale = s.IndirizziPersonale();
            Dictionary<string, List<string>> gruppi = s.EtichettaPerRuolo
                ? s.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            string dominio = s.DominioPulito();
            List<string> niente = new List<string>();
            foreach (Regola r in s.Regole)
            {
                if (!ConLaChiave(davanti + r.Etichetta, perLaChiave)) continue;
                if (!GeneratorePosta.AttivaNellaConfigurazione(s, r, personale) || r.EscludiEtichette.Count > 0) continue;
                AggiungiFiltri(fuori, r, davanti + r.Etichetta, CriteriCreati(GeneratorePosta.MittentiDellaRegola(s, r),
                    r.Oggetto, r.Contiene, r.QueryLibera ?? "", r.UnoQualsiasi, dominio, personale, gruppi));
            }
            // le sottoetichette dei ruoli: un gruppo dell'elenco del personale per mittente
            string colleghi = GeneratorePosta.EtichettaColleghi(s.Regole);
            foreach (string c in GeneratorePosta.CategoriePresenti(gruppi))
            {
                if (!ConLaChiave(davanti + colleghi + "/" + c, perLaChiave)) continue;
                List<string> gruppo = new List<string>(new string[] { "@GRUPPO:" + c + "@" });
                AggiungiFiltri(fuori, null, davanti + colleghi + "/" + c,
                    CriteriCreati(gruppo, niente, niente, "", false, dominio, personale, gruppi));
            }
            return fuori;
        }

        /// <summary>
        /// Vero se un filtro con quell'etichetta puo' avere quella chiave
        /// (FiltroDaTogliere.Chiave: l'etichetta senza spazi ai lati e in
        /// minuscolo, poi a capo e i criteri, che non mancano mai); sempre vero
        /// senza la chiave.
        /// </summary>
        static bool ConLaChiave(string etichetta, string chiave)
        {
            return chiave == null || chiave.StartsWith((etichetta ?? "").Trim().ToLowerInvariant() + "\n", StringComparison.Ordinal);
        }

        static void AggiungiFiltri(List<KeyValuePair<Regola, FiltroDaTogliere>> fuori, Regola r, string etichetta,
                                   List<Dictionary<string, string>> criteri)
        {
            foreach (Dictionary<string, string> c in criteri)
            {
                List<KeyValuePair<string, object>> grezzi = new List<KeyValuePair<string, object>>();
                foreach (KeyValuePair<string, string> kv in c) grezzi.Add(new KeyValuePair<string, object>(kv.Key, kv.Value));
                FiltroDaTogliere f = FiltroDaTogliere.Da(etichetta, grezzi);
                if (f != null) fuori.Add(new KeyValuePair<Regola, FiltroDaTogliere>(r, f));
            }
        }

        /// <summary>
        /// Il nome intero (con il gruppo) della sottoetichetta di un ruolo
        /// (Colleghi/Docenti...) che ha proprio quell'etichetta, maiuscole a
        /// parte, se le sottoetichette dei ruoli sono accese e il ruolo ha
        /// qualcuno nell'elenco del personale; null altrimenti. Nella
        /// configurazione e' una regola accesa che non archivia e non segna come
        /// letti, subito sotto i colleghi (o in fondo, senza la loro regola).
        /// </summary>
        static string SottoetichettaDiUnRuolo(string etichetta, Stato s)
        {
            string e = (etichetta ?? "").Trim().Trim('/').Trim();
            if (e == "" || s == null || !s.EtichettaPerRuolo) return null;
            string pre = s.PrefissoPulito();
            string davanti = (pre == "") ? "" : pre + "/";
            string colleghi = GeneratorePosta.EtichettaColleghi(s.Regole);
            foreach (string c in GeneratorePosta.CategoriePresenti(s.GruppiPerRuolo()))
            {
                string nome = davanti + colleghi + "/" + c;
                if (string.Equals(e, nome.Trim(), StringComparison.OrdinalIgnoreCase)) return nome;
            }
            return null;
        }

        /// <summary>
        /// Dove la configurazione mette le sottoetichette dei ruoli fra le
        /// regole: subito dopo la regola dei colleghi (l'indice di quella), o in
        /// fondo (s.Regole.Count) se non c'e'. Come GeneratorePosta.Configurazione.
        /// </summary>
        static int DoveIRuoli(Stato s)
        {
            string colleghi = GeneratorePosta.EtichettaColleghi(s.Regole);
            for (int i = 0; i < s.Regole.Count; i++)
                if (s.Regole[i] != null && s.Regole[i].Etichetta == colleghi) return i;
            return s.Regole.Count;
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
        // parentesi, due punti (Regola.UnMittente)
        static bool UnMittente(string t)
        {
            return Regola.UnMittente(t);
        }

        /// <summary>
        /// Vero se fra i mittenti della regola, come li scrive la configurazione
        /// (GeneratorePosta.MittentiDellaRegola, una voce per indirizzo), ce n'e'
        /// uno che non e' un mittente solo (UnMittente) ne' un segnaposto: un
        /// nome fra virgolette, un operatore, un pezzo di ricerca. Nella
        /// ricerca della regola non si sa bene che cosa prende: nel dubbio la
        /// regola non sostituisce nessun filtro (non "lo fa gia'", non si unisce).
        /// </summary>
        static bool MittentiDubbi(Stato s, Regola r)
        {
            foreach (string d in GeneratorePosta.MittentiDellaRegola(s, r))
                if (!Segnaposto(d) && !UnMittente((d ?? "").Trim())) return true;
            return false;
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
        /// segnaposto dell'elenco del personale, del dominio o di una classe, e
        /// nessuno che non sia un mittente solo, come un nome fra virgolette:
        /// MittentiDubbi) o
        /// quelli di "La tua scuola" (Dirigenza, Segreteria, Registro
        /// elettronico: vanno li'), nessun altro criterio (oggetto, parole,
        /// "basta uno dei due"), nella ricerca avanzata al piu' delle esclusioni
        /// di mittenti, e archivia e segna come letti come il filtro. Le
        /// esclusioni del filtro (-from:y) vanno nella ricerca avanzata e
        /// valgono per tutta la regola: solo se non tolgono niente dei mittenti
        /// che la regola ha gia' (Innocua: -from:esami puo' stare in qualunque
        /// indirizzo, -from:newsletter@flcgil.it toglie una parte di
        /// @flcgil.it), se no la regola perderebbe dei messaggi che prendeva, e
        /// quelli degli altri filtri uniti a lei. Allo stesso modo le esclusioni
        /// che la regola ha gia' e il filtro no non devono toccare i mittenti
        /// del filtro. Una regola spenta si accende (Applica).
        /// Registro elettronico prende solo domini e le parole dei registri noti
        /// (spaggiari.eu, @portaleargo.it, nuvola: DelRegistro), nessun
        /// indirizzo intero ne' altre parole: i suoi mittenti stanno nelle
        /// impostazioni (Stato.Impostazioni), non con i dati personali, e
        /// l'indirizzo o il nome di una persona non ci devono finire. Una
        /// regola che esclude altre etichette (Ministero e USR esclude Dirigenza
        /// e Segreteria) non prende un mittente che una di quelle regole puo'
        /// prendere tutto (ForseDaUnaEsclusa: la casella della scuola in
        /// Segreteria; nel dubbio si', e con i filtri veri anche una spenta o
        /// sotto): i suoi messaggi resterebbero senza l'etichetta del filtro. Nemmeno una
        /// regola con sopra un'altra regola accesa con la stessa etichetta che
        /// archivia o segna come letti diversamente (PrimaUnaDiversa): dove
        /// prendono gli stessi messaggi li prende quella di sopra, e fa solo
        /// quello che fa lei.
        /// </summary>
        public static bool SiPuoUnire(FiltroGmail f, MittentiFiltro m, Regola r, Stato s)
        {
            return SiPuoUnireIMittenti(f, m, r, s) && EsclusioniCompatibili(m, r, s);
        }

        const string ToglieDelleEsclusioni = "un'esclusione, che vale per tutta la regola, toglierebbe dei messaggi alla " +
                                             "regola o al filtro";

        /// <summary>
        /// Perche' i mittenti del filtro non si uniscono alla regola quando e'
        /// per le esclusioni (EsclusioniCompatibili), a parole; "" se si
        /// uniscono o se non e' per quelle. Per il riquadro della finestra.
        /// </summary>
        public static string EsclusioniCheNonSiUniscono(FiltroGmail f, Regola r, Stato s)
        {
            MittentiFiltro m = (f == null) ? null : SoloMittenti(f.Criteri);
            if (!SiPuoUnireIMittenti(f, m, r, s) || EsclusioniCompatibili(m, r, s)) return "";
            return ToglieDelleEsclusioni;
        }

        /// <summary>SiPuoUnire senza guardare le esclusioni (EsclusioniCompatibili).</summary>
        static bool SiPuoUnireIMittenti(FiltroGmail f, MittentiFiltro m, Regola r, Stato s)
        {
            if (f == null || m == null || r == null) return false;
            if (r.Sorgente != "" && !r.MittentiDallaScuola()) return false;
            if (r.Sorgente == "registro")
                foreach (string d in m.Da) if (!DelRegistro(d)) return false;
            if (LeMieClassi.ClasseDi(r) != null) return false;
            foreach (string d in r.Da) if (Segnaposto(d)) return false;
            // un nome fra virgolette, un operatore: non si sa che cosa prende
            if (MittentiDubbi(s, r)) return false;
            if (r.Oggetto.Count > 0 || r.Contiene.Count > 0 || r.UnoQualsiasi) return false;
            if (Esclusioni(r.QueryLibera) == null) return false;
            if (r.Archivia != f.Archivia || r.SegnaComeLette != f.SegnaLetto) return false;
            // sopra di lei una regola accesa con la stessa etichetta che archivia
            // o segna come letti diversamente: i messaggi comuni li prende quella
            if (PrimaUnaDiversa(s, r, s.IndirizziPersonale())) return false;
            foreach (string d in m.Da) if (ForseDaUnaEsclusa(s, r, d)) return false;
            return true;
        }

        /// <summary>
        /// Vero se, uniti il filtro e la regola, nessuna esclusione toglie dei
        /// messaggi all'uno o all'altra: quelle della regola che il filtro non
        /// ha non toccano i mittenti del filtro, e quelle del filtro che la
        /// regola non ha non toccano i mittenti che la regola ha gia'
        /// (Innocua), con i segnaposto sciolti.
        /// </summary>
        static bool EsclusioniCompatibili(MittentiFiltro m, Regola r, Stato s)
        {
            List<string> esclusi = (r == null) ? null : Esclusioni(r.QueryLibera);
            if (m == null || esclusi == null || s == null) return false;
            foreach (string e in esclusi)
                if (!Contiene(m.Esclusi, e) && !Innocua(s, r, e, m.Da)) return false;
            List<string> sue = null;
            foreach (string e in m.Esclusi)
            {
                if (Contiene(esclusi, e)) continue;
                if (sue == null) sue = MittentiSciolti(s, r, s.IndirizziPersonale());
                if (!Innocua(s, r, e, sue)) return false;
            }
            return true;
        }

        /// <summary>
        /// Vero se l'esclusione y (quello che segue -from:, un mittente) puo'
        /// togliere dei messaggi del mittente d. Gmail cerca anche i pezzi di
        /// un indirizzo (e il nome), e nel dubbio un'esclusione tocca: y senza
        /// chiocciola (una parola come esami, una parte locale come
        /// mario.rossi, anche un dominio) o con il dominio incompleto
        /// (mario.rossi@, mario.rossi@sind) puo' stare nella parte prima della
        /// chiocciola di qualunque indirizzo; e un d senza chiocciola che non
        /// e' un dominio (una parola, una parte locale come mario.rossi) puo'
        /// essere di qualunque dominio. Altrimenti y tocca d se uno prende
        /// l'altro (CopreLargo: @dominio anche i sottodomini), uno sta dentro
        /// l'altro, o possono essere lo stesso indirizzo: la parte prima della
        /// chiocciola dell'uno finisce con quella dell'altro, e il dominio
        /// dell'uno comincia con quello dell'altro (mario.rossi@sindacato.exampl
        /// tocca @sindacato.example). I segnaposto (@PERSONALE@...) non
        /// contano: si guardano sciolti.
        /// </summary>
        static bool Tocca(string y, string d)
        {
            if (Segnaposto(d)) return false;
            string a = (y ?? "").Trim().ToLowerInvariant(), b = (d ?? "").Trim().ToLowerInvariant();
            if (a == "" || b == "") return false;
            if (!ConDominio(a)) return true;
            if (b.IndexOf('@') < 0 && !DominioDelRegistro.IsMatch(b)) return true;
            string a0 = a.TrimStart('@'), b0 = b.TrimStart('@');
            if (CopreLargo(a, b) || CopreLargo(b, a) || a0.IndexOf(b0, StringComparison.Ordinal) >= 0 ||
                b0.IndexOf(a0, StringComparison.Ordinal) >= 0) return true;
            int ka = a.LastIndexOf('@'), kb = b.LastIndexOf('@');
            string localeA = a.Substring(0, ka), dominioA = a.Substring(ka + 1);
            // d e' un dominio: il dominio di y ne puo' essere l'inizio
            if (kb < 0) return b.StartsWith(dominioA, StringComparison.Ordinal);
            string localeB = b.Substring(0, kb), dominioB = b.Substring(kb + 1);
            return (localeA.EndsWith(localeB, StringComparison.Ordinal) || localeB.EndsWith(localeA, StringComparison.Ordinal)) &&
                   (dominioA.StartsWith(dominioB, StringComparison.Ordinal) || dominioB.StartsWith(dominioA, StringComparison.Ordinal));
        }

        /// <summary>Vero se il mittente ha la chiocciola e dopo un dominio intero, con un punto (x@sindacato.example, @sindacato.example; non x@, x@sind).</summary>
        static bool ConDominio(string mittente)
        {
            string t = (mittente ?? "").Trim();
            int k = t.LastIndexOf('@');
            if (k < 0) return false;
            string dominio = t.Substring(k + 1);
            return dominio.IndexOf('.') > 0 && !dominio.EndsWith(".", StringComparison.Ordinal);
        }

        /// <summary>
        /// Vero se l'esclusione (un termine -from:... di Esclusioni) non toglie
        /// alla regola r nessun messaggio di quei mittenti: non ne tocca nessuno
        /// (Tocca), o quello che toglie lo prende tutto una delle regole di cui
        /// r esclude l'etichetta (PresoDaUnaEsclusa: la casella della scuola in
        /// Segreteria, per Ministero e USR), e r non lo prenderebbe comunque. Un
        /// nome fra virgolette puo' essere quello di qualunque mittente.
        /// </summary>
        static bool Innocua(Stato s, Regola r, string esclusione, List<string> mittenti)
        {
            string e = (esclusione ?? "").Trim();
            List<string> tolti = (e.Length > 6) ? ElencoMittenti(e.Substring(6)) : null;
            foreach (string d in mittenti)
            {
                if (Segnaposto(d)) continue;
                if (tolti == null) return false;
                foreach (string y in tolti)
                    if (Tocca(y, d) && !PresoDaUnaEsclusa(s, r, y)) return false;
            }
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
        // fondo uno dei domini di primo livello dei registri (it, eu) o di
        // quelli generici; .example e' quello dei dati inventati delle prove.
        // Non uno qualsiasi di due lettere: mario.re e giulia.li sono nomi di
        // persona (.re e .li sono domini di primo livello). Anche per Tocca: un
        // mittente senza chiocciola e' un dominio solo cosi', se no puo' essere
        // la parte locale di un indirizzo di qualunque dominio
        static readonly Regex DominioDelRegistro = new Regex(
            @"^@?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:it|eu|com|net|org|edu|gov|info|biz|cloud|online|school|education|example)$",
            RegexOptions.IgnoreCase);

        /// <summary>
        /// Vero se il mittente puo' stare fra quelli di Registro elettronico,
        /// nelle impostazioni: un dominio .it, .eu o generico (spaggiari.eu,
        /// @portaleargo.it, mastercom.cloud) o la parola di un registro noto
        /// (nuvola). Non un indirizzo, ne' una parola qualsiasi, che puo' essere
        /// il nome di una persona (rossi, mario.rossi, mario.re): i nomi delle
        /// persone stanno con i dati personali.
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
        /// esclusa, e r non li prende. Contano solo le regole accese nella
        /// configurazione e sopra r: lo script le fa in ordine, e quando tocca
        /// a r i messaggi hanno gia' solo le etichette di quelle di sopra. Una
        /// regola esclusa spenta, o sotto r, non toglie niente a r. E solo una
        /// che cerca soltanto dei mittenti (CercaSoloIMittenti): una con
        /// l'oggetto o delle parole non li prende tutti. E' quello che e'
        /// sicuro, per dire che un'esclusione non toglie niente (Innocua) o che
        /// un filtro che resta in Gmail non cambia niente (PresiDalleEscluse);
        /// per dire che r prende i messaggi di un filtro conta anche quello che
        /// e' possibile (ForseDaUnaEsclusa).
        /// </summary>
        static bool PresoDaUnaEsclusa(Stato s, Regola r, string mittente)
        {
            return EsclusaCheLoPrende(s, r, mittente, true, false);
        }

        /// <summary>
        /// Vero se i messaggi del mittente possono avere, quando tocca a r,
        /// l'etichetta di una regola che r esclude, tutti: se una di quelle
        /// regole, accesa e sopra di lei, li prende tutti (PresoDaUnaEsclusa);
        /// e con i filtri veri di Gmail (EXTRA_creaFiltriGmail, Stato.Filtri)
        /// anche se li prende una di quelle regole spenta o sotto di lei: il suo
        /// filtro vero mette l'etichetta all'arrivo, e quello creato prima resta
        /// in Gmail anche spegnendo la regola. Nel dubbio r non li prende, e un
        /// filtro con quel mittente non lo sostituisce: per "lo fa gia'" e
        /// "Unisci". Per dire che un'esclusione non toglie niente (Innocua)
        /// conta solo quello che e' sicuro, PresoDaUnaEsclusa.
        /// </summary>
        static bool ForseDaUnaEsclusa(Stato s, Regola r, string mittente)
        {
            return EsclusaCheLoPrende(s, r, mittente, false, false) ||
                   (s != null && s.Filtri && EsclusaCheLoPrende(s, r, mittente, false, true));
        }

        /// <summary>
        /// Vero se una delle regole di cui r esclude l'etichetta ha fra i suoi
        /// mittenti (sciolti) uno che prende tutto il mittente (Copre). Con
        /// sicuro, solo una regola che cerca soltanto dei mittenti (niente
        /// oggetto, parole, etichette escluse, nella ricerca avanzata al piu'
        /// esclusioni che non toccano quel mittente): cosi' quei messaggi li
        /// prende davvero tutti. Con tutte, anche le regole spente o sotto r.
        /// </summary>
        static bool EsclusaCheLoPrende(Stato s, Regola r, string mittente, bool sicuro, bool tutte)
        {
            if (s == null || r == null || r.EscludiEtichette.Count == 0) return false;
            Dictionary<string, List<string>> gruppi = s.EtichettaPerRuolo ? s.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            List<string> personale = s.IndirizziPersonale();
            foreach (Regola altra in s.Regole)
            {
                if (altra == r) { if (tutte) continue; break; }
                if (altra == null || !Contiene(r.EscludiEtichette, altra.Etichetta) ||
                    (!tutte && !GeneratorePosta.AttivaNellaConfigurazione(s, altra, personale))) continue;
                if (sicuro && !CercaSoloIMittenti(altra, mittente)) continue;
                List<string> sue = Espandi(GeneratorePosta.MittentiDellaRegola(s, altra), s.DominioPulito(), personale, gruppi);
                foreach (string e in sue) if (sicuro ? Copre(e, mittente) : ForseCopre(e, mittente)) return true;
            }
            return false;
        }

        /// <summary>
        /// Copre letto largo, per dire che una regola esclusa forse prende
        /// tutti i messaggi del mittente d di un filtro: anche quando il
        /// mittente e della regola sta dentro d (preside@scuola.example dentro
        /// vicepreside@scuola.example, rossi dentro mario.rossi), perche' from:
        /// di Gmail cerca un pezzo dell'indirizzo, e allora ogni messaggio di d
        /// ha anche e; e quando e e' @dominio e d lo stesso dominio senza
        /// chiocciola o un suo sottodominio (CopreLargo), che prendono quasi
        /// sempre gli stessi indirizzi. Nel dubbio la regola esclusa prende
        /// tutto d.
        /// </summary>
        static bool ForseCopre(string e, string d)
        {
            string a = (e ?? "").Trim().ToLowerInvariant(), b = (d ?? "").Trim().ToLowerInvariant();
            return Copre(e, d) || CopreLargo(e, d) || (a != "" && b.IndexOf(a, StringComparison.Ordinal) >= 0);
        }

        /// <summary>
        /// Vero se la regola cerca solo dei mittenti: niente oggetto, parole,
        /// "basta uno dei due" o etichette escluse, e nella ricerca avanzata al
        /// piu' delle esclusioni di mittenti che non toccano il mittente d (un
        /// nome fra virgolette puo' toccarlo sempre).
        /// </summary>
        static bool CercaSoloIMittenti(Regola a, string d)
        {
            if (a.Oggetto.Count > 0 || a.Contiene.Count > 0 || a.UnoQualsiasi || a.EscludiEtichette.Count > 0) return false;
            List<string> esclusi = Esclusioni(a.QueryLibera);
            if (esclusi == null) return false;
            foreach (string e in esclusi)
            {
                List<string> tolti = (e.Length > 6) ? ElencoMittenti(e.Substring(6)) : null;
                if (tolti == null) return false;
                foreach (string y in tolti) if (Tocca(y, d)) return false;
            }
            return true;
        }

        /// <summary>
        /// Vero se il mittente e di una regola prende di sicuro tutti i
        /// messaggi del mittente d di un filtro. from: di Gmail cerca un pezzo
        /// dell'indirizzo, e nel dubbio si legge stretto: sono uguali; e e' un
        /// dominio senza chiocciola (sindacato.example) e d e' un indirizzo di
        /// quel dominio o di un suo sottodominio, o uno dei due domini, con la
        /// chiocciola o senza; e e' @dominio e d e' un indirizzo proprio di
        /// quel dominio. @sindacato.example non prende news@posta.sindacato.example
        /// ne' sindacato.example senza chiocciola, che prende anche quello. Un
        /// indirizzo intero prende solo se stesso, una parola anche.
        /// </summary>
        static bool Copre(string e, string d)
        {
            string a = (e ?? "").Trim().ToLowerInvariant(), b = (d ?? "").Trim().ToLowerInvariant();
            if (a == "" || b == "") return false;
            if (a == b) return true;
            int chiocciola = a.IndexOf('@');
            if (chiocciola > 0) return false;
            if (chiocciola == 0)
            {
                string suo = a.Substring(1);
                int k = b.IndexOf('@');
                return suo.IndexOf('.') > 0 && suo.IndexOf('@') < 0 && k > 0 && k == b.LastIndexOf('@') &&
                       b.Substring(k + 1) == suo;
            }
            if (a.IndexOf('.') < 0) return false;
            return b.EndsWith("@" + a, StringComparison.Ordinal) || b.EndsWith("." + a, StringComparison.Ordinal);
        }

        /// <summary>
        /// Copre letto largo, per le esclusioni (Tocca): @dominio prende anche
        /// i sottodomini e il dominio senza chiocciola, che Gmail forse trova.
        /// Nel dubbio un'esclusione tocca.
        /// </summary>
        static bool CopreLargo(string e, string d)
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
        /// Vero se la regola prende gia' tutti i messaggi del filtro, fatto solo
        /// di mittenti (PrendeIMittenti). Toglierlo non fa perdere niente.
        /// </summary>
        public static bool GiaNellaRegola(FiltroGmail f, Regola r, Stato s)
        {
            if (f == null || s == null) return false;
            return PrendeIMittenti(s, r, SoloMittenti(f.Criteri), f.Archivia, f.SegnaLetto, s.IndirizziPersonale());
        }

        /// <summary>
        /// Vero se la regola prende tutti i messaggi di un filtro fatto solo di
        /// mittenti (m) e fa quello che faceva lui: e' accesa nella
        /// configurazione, cerca solo dei mittenti (niente oggetto o parole,
        /// nella ricerca avanzata al piu' delle esclusioni), archivia e segna
        /// come letti come lui (StesseAzioni), ogni suo mittente lo prende uno
        /// della regola (lo stesso, o il suo dominio; con l'elenco del
        /// personale, il dominio e i gruppi sciolti: Colleghi con i colleghi
        /// dell'elenco; nessuno della regola che non sia un mittente solo o un
        /// segnaposto, come un nome fra virgolette: MittentiDubbi, nel dubbio
        /// no), ogni esclusione che il filtro non ha non tocca i suoi
        /// mittenti (Innocua: un'esclusione in piu' lascerebbe fuori dei
        /// messaggi del filtro), nessuna delle regole di cui esclude
        /// l'etichetta puo' prendere tutto un suo mittente (ForseDaUnaEsclusa:
        /// nel dubbio si', e con i filtri veri anche spenta o sotto), e sopra di lei non c'e'
        /// una regola con la stessa etichetta che archivia o segna come letti
        /// diversamente (PrimaUnaDiversa). I messaggi che hanno l'etichetta di
        /// una regola che esclude (i colleghi per Studenti, la casella della
        /// scuola per Ministero e USR) non li prende: e' quello che fa, e
        /// non conta.
        /// </summary>
        static bool PrendeIMittenti(Stato s, Regola r, MittentiFiltro m, bool? archivia, bool? letti, List<string> personale)
        {
            if (m == null || r == null || s == null) return false;
            if (r.Sorgente != "" && !r.MittentiDallaScuola()) return false;
            if (r.Oggetto.Count > 0 || r.Contiene.Count > 0 || r.UnoQualsiasi) return false;
            if (!StesseAzioni(r, archivia, letti) || MittentiDubbi(s, r)) return false;
            List<string> esclusi = Esclusioni(r.QueryLibera);
            if (esclusi == null) return false;
            if (!GeneratorePosta.AttivaNellaConfigurazione(s, r, personale) || PrimaUnaDiversa(s, r, personale)) return false;
            List<string> sue = MittentiSciolti(s, r, personale);
            foreach (string d in m.Da)
                if (!PresoDa(sue, d) || ForseDaUnaEsclusa(s, r, d)) return false;
            foreach (string e in esclusi)
                if (!Contiene(m.Esclusi, e) && !Innocua(s, r, e, m.Da)) return false;
            return true;
        }

        /// <summary>
        /// Vero se la regola, accesa, fa proprio la ricerca di un filtro che non
        /// e' fatto solo di mittenti, tutta nella ricerca avanzata, e
        /// nient'altro: nessun mittente, oggetto, parole o etichette escluse;
        /// archivia e segna come letti come lui (StesseAzioni), e sopra di lei
        /// nessuna regola con la stessa etichetta fa diversamente.
        /// </summary>
        static bool FaLaRicerca(Stato s, Regola r, string ricerca, bool? archivia, bool? letti, List<string> personale)
        {
            if (r == null || s == null || ricerca == null) return false;
            if (r.Sorgente != "" || r.Da.Count > 0 || r.Oggetto.Count > 0 || r.Contiene.Count > 0 || r.UnoQualsiasi ||
                r.EscludiEtichette.Count > 0 || MittentiDubbi(s, r)) return false;
            if (!StessaRicerca(r.QueryLibera, ricerca)) return false;
            return StesseAzioni(r, archivia, letti) && GeneratorePosta.AttivaNellaConfigurazione(s, r, personale) &&
                   !PrimaUnaDiversa(s, r, personale);
        }

        // OR e AND scritti da soli, in maiuscolo: gli operatori della ricerca di
        // Gmail. In minuscolo (or, and) sono parole da cercare
        static readonly Regex Operatore = new Regex(@"(?<![^\s(){}])(OR|AND)(?![^\s(){}])");

        /// <summary>
        /// Vero se le due ricerche sono la stessa per Gmail: uguali a meno degli
        /// spazi e delle maiuscole delle parole, ma non degli operatori OR e
        /// AND, che in minuscolo sono parole ("a or b" cerca anche "or").
        /// </summary>
        static bool StessaRicerca(string a, string b)
        {
            return RicercaDaConfrontare(a) == RicercaDaConfrontare(b);
        }

        static string RicercaDaConfrontare(string ricerca)
        {
            string r = Regex.Replace((ricerca ?? "").Trim(), @"\s+", " ");
            r = Operatore.Replace(r, delegate(Match m) { return m.Value == "OR" ? "\u0001" : "\u0002"; });
            return r.ToLowerInvariant();
        }

        /// <summary>
        /// Vero se la regola archivia e segna come letti come il filtro. Quello
        /// che non si sa (null: un filtro scelto con la 1.6.0, che non lo
        /// ricordava) la regola lo deve fare: il filtro poteva farlo, e nel
        /// dubbio non si perde.
        /// </summary>
        static bool StesseAzioni(Regola r, bool? archivia, bool? letti)
        {
            return (archivia.HasValue ? r.Archivia == archivia.Value : r.Archivia) &&
                   (letti.HasValue ? r.SegnaComeLette == letti.Value : r.SegnaComeLette);
        }

        /// <summary>
        /// Vero se sopra la regola c'e' un'altra regola accesa con la stessa
        /// etichetta che archivia o segna come letti in modo diverso. Nel
        /// riordino e nello smistamento ogni regola cerca solo i messaggi che
        /// non hanno ancora la sua etichetta (-label:): quella di sopra prende
        /// anche i messaggi comuni, e fa solo quello che fa lei. Conta anche la
        /// sottoetichetta di un ruolo (Colleghi/Docenti), che la configurazione
        /// scrive subito sotto i colleghi, accesa, e non archivia e non segna
        /// come letti: una regola Colleghi/Docenti che lo fa, sotto di lei, non
        /// lo farebbe ai messaggi dei docenti dell'elenco.
        /// </summary>
        static bool PrimaUnaDiversa(Stato s, Regola r, List<string> personale)
        {
            int dove = s.Regole.IndexOf(r);
            if ((r.Archivia || r.SegnaComeLette) && SottoetichettaDiUnRuolo(NomeIntero(r, s), s) != null &&
                (dove < 0 || DoveIRuoli(s) < dove)) return true;
            foreach (Regola a in s.Regole)
            {
                if (a == r) return false;
                if (string.Equals((a.Etichetta ?? "").Trim(), (r.Etichetta ?? "").Trim(), StringComparison.OrdinalIgnoreCase) &&
                    (a.Archivia != r.Archivia || a.SegnaComeLette != r.SegnaComeLette) &&
                    GeneratorePosta.AttivaNellaConfigurazione(s, a, personale)) return true;
            }
            return false;
        }

        /// <summary>I mittenti della regola come li scrive, e con i segnaposto sciolti (l'elenco del personale, il dominio, i gruppi).</summary>
        static List<string> MittentiSciolti(Stato s, Regola r, List<string> personale)
        {
            Dictionary<string, List<string>> gruppi = s.EtichettaPerRuolo ? s.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            List<string> da = GeneratorePosta.MittentiDellaRegola(s, r);
            da.AddRange(Espandi(da, s.DominioPulito(), personale, gruppi));
            return da;
        }

        /// <summary>Vero se uno dei mittenti prende tutti i messaggi del mittente d (Copre).</summary>
        static bool PresoDa(List<string> mittenti, string d)
        {
            foreach (string e in mittenti) if (Copre(e, d)) return true;
            return false;
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
        /// Campanella crea proprio quel filtro (DiCampanella), se archivia e
        /// segna come letti come lui e sopra di lei nessuna regola con la stessa
        /// etichetta fa diversamente (RegolaCheLoCrea); oppure, fra la
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
            // uno di quelli che crea Campanella: la regola che crea proprio lui, se
            // archivia e segna come letto come lui (lo script lo crea cosi', ma in
            // Gmail si cambia) e sopra non ce n'e' una con la stessa etichetta che
            // fa diversamente
            if (x.Tipo == DiCampanella)
            {
                Regola crea = RegolaCheLoCrea(f.Etichetta, f.Criteri, f.Archivia, f.SegnaLetto, s);
                if (crea != null) return crea;
            }
            List<Regola> candidate = new List<Regola>();
            if (simile != null) candidate.Add(simile);
            foreach (Regola r in s.Regole) if (!candidate.Contains(r) && ConEtichetta(r, f.Etichetta, s)) candidate.Add(r);
            Regola tradotta = Traduci(f, x, s);
            List<string> personale = s.IndirizziPersonale();
            foreach (Regola r in candidate)
            {
                if (GiaNellaRegola(f, r, s)) return r;
                if (tradotta != null && StessaRegola(tradotta, r) && GeneratorePosta.AttivaNellaConfigurazione(s, r, personale) &&
                    !PrimaUnaDiversa(s, r, personale)) return r;
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
        /// file non la propone di nuovo. Nemmeno la sottoetichetta di un ruolo
        /// (SottoetichettaDiUnRuolo): e' gia' una regola, sopra le nuove, che
        /// non archivia e non segna come letti. null se non puo'.
        /// </summary>
        public static Regola RegolaDalFiltro(FiltroGmail f, Somiglianza x, Stato s)
        {
            if (f == null || RegolaConEtichetta(s, f.Etichetta) != null || SottoetichettaDiUnRuolo(f.Etichetta, s) != null) return null;
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
            if (SottoetichettaDiUnRuolo(f.Etichetta, s) != null)
                return "c'e' gia' la sottoetichetta di un ruolo con la sua etichetta (dall'elenco del personale), che non " +
                       "archivia e non segna come letti";
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
        /// letti diversamente, cerca altro che i mittenti, mittenti che la
        /// regola non prende e non puo' prendere) lascialo: con l'etichetta
        /// uguale la regola non lo sostituisce. Simile: toglilo se una regola
        /// accesa lo fa gia', unisci alla regola simile se si puo' e ha senso
        /// (DaProporre; se e' spenta, solo se da sola non cerca niente, come
        /// Genitori: accesa prenderebbe anche quello che cercava gia'); se si
        /// puo' ma non ha senso, diventa una regola se si puo'; altrimenti
        /// lascialo. Simile solo nel nome a Dirigenza o Segreteria (domini, non
        /// indirizzi) e' come tuo. Tuo: diventa una regola se si puo',
        /// altrimenti lascialo. Di Campanella, di una classe, che fa anche
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
        /// quella che crea proprio quel filtro (EXTRA_creaFiltriGmail:
        /// RegolaCheLoCrea), o una con quell'etichetta che prende ancora tutti
        /// i suoi messaggi, come "Toglilo: lo fa gia'" (PrendeIMittenti: tutti i
        /// suoi mittenti, anche in "La tua scuola" e con i segnaposto sciolti,
        /// nessuna esclusione in piu' che li tocchi, niente oggetto o parole;
        /// per uno che non e' fatto solo di mittenti FaLaRicerca, proprio la sua
        /// ricerca e nient'altro), e archivia e segna come letti come lui. Uno
        /// creato per la sottoetichetta di un ruolo, che non ha una regola sua,
        /// solo se non archivia e non segna come letto. Vero anche per uno che si
        /// toglie e basta. Tolta, spenta o cambiata la regola dopo "Usa questa
        /// scelta" (anche tolta la sua gemella: l'altra esclude i suoi mittenti),
        /// il filtro resta in Gmail (GeneratorePosta.FiltriJs non lo scrive) e
        /// il passo 4 lo dice: nessun filtro va via senza la regola che lo
        /// sostituisce. Uno scelto con la 1.6.0 (SceltoConLaVersioneDiPrima),
        /// che non ricorda la regola ne' se archiviava o segnava come letto,
        /// senza il file non va mai via: la 1.6.0 lo sceglieva per l'etichetta
        /// sola, e senza il file non si vede che cosa fa, ne' se in Gmail ce
        /// n'e' un altro con la stessa etichetta che non archivia (mettendola
        /// all'arrivo, toglierebbe quei messaggi alla regola). Con il file la
        /// finestra lo vede e lo propone di nuovo. Non va via nemmeno uno che
        /// la voce ricorda andato via grazie alle regole escluse, se adesso
        /// non reggono piu', ne' uno scelto con un altro gruppo delle etichette
        /// (PerGliAltriFiltri).
        /// </summary>
        public static bool AncoraSostituito(FiltroDaTogliere v, Stato s)
        {
            if (v == null || s == null) return true;
            if ((v.Regola ?? "").Trim() == "") return !SceltoConLaVersioneDiPrima(v);
            return SostituitoDallaRegola(v, s) && PerGliAltriFiltri(v, s) == "";
        }

        /// <summary>
        /// Vero se la regola che la voce ricorda, da sola, prende ancora tutti i
        /// messaggi del filtro (RegolaCheLoSostituisceAncora), o se e' uno creato
        /// per la sottoetichetta di un ruolo, che non archivia e non segna come
        /// letti: senza guardare i filtri che restano in Gmail (PerGliAltriFiltri).
        /// </summary>
        static bool SostituitoDallaRegola(FiltroDaTogliere v, Stato s)
        {
            if (RegolaCheLoSostituisceAncora(v, s) != null) return true;
            Regola chi;
            return CreatoDaCampanella(v.Etichetta, v.Criteri, s, out chi) && chi == null &&
                   v.Archivia == false && v.SegnaLetto == false;
        }

        /// <summary>
        /// Perche' il filtro scelto prima non si toglie piu' per quello che la
        /// voce ricorda dei filtri che restano in Gmail (FiltroDaTogliere.Gruppo,
        /// Escluse e Accanto), che senza il file non si vedono: dopo la scelta e'
        /// cambiato il gruppo delle etichette ("Raggruppa sotto": la regola mette
        /// un'etichetta di un altro gruppo, e un filtro rimasto con
        /// un'etichetta del gruppo nuovo, la stessa o una che la regola esclude,
        /// le toglierebbe dei messaggi), o la voce non lo ricorda (nel dubbio);
        /// la sua regola adesso esclude un'etichetta che quando si e' scelto non
        /// escludeva (un filtro rimasto con quell'etichetta le toglierebbe dei
        /// messaggi), oppure resta in Gmail un filtro con un'etichetta che lei
        /// esclude i cui mittenti non li prende piu' tutti una regola esclusa,
        /// accesa e sopra di lei (spenta, spostata sotto, con altri mittenti o
        /// con un altro elenco del personale: ConUnaEtichettaEsclusa). "" se
        /// niente di questo, e "" anche quando la regola, da sola, non lo
        /// sostituisce piu' (tolta, spenta, senza i suoi mittenti...): allora il
        /// perche' e' lei, non gli altri filtri (SostituitoDallaRegola). Con il
        /// file la finestra rivede tutto da capo.
        /// </summary>
        public static string PerGliAltriFiltri(FiltroDaTogliere v, Stato s)
        {
            if (v == null || s == null || (v.Regola ?? "").Trim() == "") return "";
            if (!SostituitoDallaRegola(v, s)) return "";
            if (v.Gruppo == null)
                return "non ricorda il gruppo delle etichette (\"Raggruppa sotto\") di quando l'hai scelto: se e' cambiato, " +
                       "la regola " + v.Regola.Trim() + " mette un'etichetta di un altro gruppo, e un filtro rimasto in Gmail " +
                       "con un'etichetta del gruppo nuovo potrebbe toglierle dei messaggi, e senza il file dei filtri non si vede";
            if (Pulita(v.Gruppo) != Pulita(s.PrefissoPulito()))
                return "dopo la scelta hai cambiato il gruppo delle etichette (\"Raggruppa sotto\"" +
                       (Pulita(v.Gruppo) == "" ? ", prima nessuno" : ", era " + v.Gruppo.Trim().Trim('/')) + "): la regola " + v.Regola.Trim() +
                       " mette un'etichetta di un altro gruppo, e un filtro rimasto in Gmail con un'etichetta del gruppo nuovo " +
                       "potrebbe toglierle dei messaggi, e senza il file dei filtri non si vede";
            if (v.Escluse != null)
                foreach (Regola r in s.Regole)
                {
                    if (r == null || !string.Equals((r.Etichetta ?? "").Trim(), v.Regola.Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                    foreach (string e in r.EscludiEtichette)
                        if (!Contiene(v.Escluse, e))
                            return "la regola " + v.Regola.Trim() + " adesso esclude anche " + (e ?? "").Trim() + ": un filtro che " +
                                   "resta in Gmail con quell'etichetta le toglierebbe dei messaggi, e senza il file dei filtri non si vede";
                }
            if (v.Accanto != null && v.Accanto.Count > 0)
            {
                string perche = ConUnaEtichettaEsclusa(v, v.Accanto, s);
                if (perche != "")
                    return perche + " (quando l'hai scelto i suoi mittenti li prendeva una regola esclusa, accesa e sopra di " +
                           "lei, che adesso e' spenta, e' sotto o ha altri mittenti)";
            }
            return "";
        }

        /// <summary>
        /// Perche' la regola che ricorda non sostituisce piu' il filtro scelto
        /// prima (AncoraSostituito falso), a parole.
        /// </summary>
        public static string PercheNonLoSostituisce(FiltroDaTogliere v, Stato s)
        {
            string altri = PerGliAltriFiltri(v, s);
            if (altri != "") return altri;
            return "la regola " + ((v == null) ? "" : (v.Regola ?? "").Trim()) + ", che lo sostituiva, non prende piu' " +
                   "tutti i suoi messaggi, o non archivia o non segna come letti come lui";
        }

        /// <summary>
        /// La regola che sostituisce ancora un filtro scelto prima con la sua
        /// regola (FiltroDaTogliere.Regola), come la cerca AncoraSostituito;
        /// null se nessuna (anche per quelli creati per un ruolo, che una regola
        /// non l'hanno).
        /// </summary>
        public static Regola RegolaCheLoSostituisceAncora(FiltroDaTogliere v, Stato s)
        {
            if (v == null || s == null || (v.Regola ?? "").Trim() == "") return null;
            Regola crea = RegolaCheLoCrea(v.Etichetta, v.Criteri, v.Archivia, v.SegnaLetto, s);
            if (crea != null) return crea;
            MittentiFiltro m = SoloMittenti(v.Criteri);
            string ricerca = (m == null) ? RicercaDelFiltro(v.Criteri) : null;
            List<string> personale = s.IndirizziPersonale();
            foreach (Regola r in s.Regole)
            {
                if (r == null || !string.Equals((r.Etichetta ?? "").Trim(), v.Regola.Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                if (m != null ? PrendeIMittenti(s, r, m, v.Archivia, v.SegnaLetto, personale)
                              : FaLaRicerca(s, r, ricerca, v.Archivia, v.SegnaLetto, personale)) return r;
            }
            return null;
        }

        /// <summary>
        /// Vero per un filtro scelto da togliere con la 1.6.0 (o prima): non
        /// ricorda la regola che lo sostituisce ne' se archiviava o segnava
        /// come letto. La 1.6.0 lo sceglieva perche' aveva l'etichetta di una
        /// regola, anche se la regola non prendeva i suoi messaggi, e anche se
        /// archiviava o segnava come letto e la regola no.
        /// </summary>
        public static bool SceltoConLaVersioneDiPrima(FiltroDaTogliere v)
        {
            return v != null && (v.Regola ?? "").Trim() == "" && v.Archivia == null && v.SegnaLetto == null;
        }

        /// <summary>
        /// I filtri scelti da togliere che restano in Gmail, una volta sola
        /// ciascuno (per il passo 4): quelli che non hanno piu' la regola che
        /// li sostituisce (AncoraSostituito) e quelli che per loro non si
        /// possono piu' togliere (CheRestano); non quelli che sembrano di una
        /// classe e hanno degli indirizzi, che il passo 4 dice a parte.
        /// </summary>
        public static List<FiltroDaTogliere> SenzaLaRegola(Stato s)
        {
            List<FiltroDaTogliere> fuori = new List<FiltroDaTogliere>();
            List<string> visti = new List<string>();
            foreach (FiltroDaTogliere v in CheRestano(s))
            {
                if (DiUnaClasseConIndirizzi(v.Etichetta, v.Criteri, s) || visti.Contains(v.Chiave())) continue;
                visti.Add(v.Chiave());
                fuori.Add(v);
            }
            return fuori;
        }

        /// <summary>
        /// I filtri scelti da togliere che restano in Gmail, come li vede la
        /// configurazione (GeneratorePosta.FiltriJs), senza il file: quelli che
        /// non hanno piu' la regola che li sostituisce (AncoraSostituito), quelli
        /// che sembrano di una classe e hanno degli indirizzi (la configurazione
        /// non li scrive), lo stesso filtro scelto due volte se una delle due
        /// voci resta, e quelli che per uno di questi non si possono piu'
        /// togliere: restando, quello mette la sua etichetta all'arrivo, e uno
        /// con la stessa etichetta che archivia o segna come letto
        /// (ConLaStessaEtichetta), o la cui regola esclude quell'etichetta
        /// (ConUnaEtichettaEsclusa), perderebbe dei messaggi; e uno che manda
        /// nel cestino ne toglie l'etichetta a quelli che prende anche un
        /// altro (ConUnoNelCestino). Come in "Usa questa scelta", restando un
        /// filtro ne puo' far restare un altro.
        /// </summary>
        public static List<FiltroDaTogliere> CheRestano(Stato s)
        {
            List<FiltroDaTogliere> restano = new List<FiltroDaTogliere>(), vanno = new List<FiltroDaTogliere>();
            if (s == null || s.FiltriDaTogliere == null) return restano;
            List<string> chiavi = new List<string>();
            foreach (FiltroDaTogliere v in s.FiltriDaTogliere)
            {
                if (v == null) continue;
                if (DiUnaClasseConIndirizzi(v.Etichetta, v.Criteri, s) || !AncoraSostituito(v, s))
                {
                    restano.Add(v);
                    chiavi.Add(v.Chiave());
                }
                else vanno.Add(v);
            }
            // lo stesso filtro scelto due volte (non succede: Applica e la lettura
            // del file ne tengono uno) va via solo se lo sostituiscono tutte e due
            // le voci: nel dubbio resta
            foreach (FiltroDaTogliere v in new List<FiltroDaTogliere>(vanno))
                if (chiavi.Contains(v.Chiave())) { vanno.Remove(v); restano.Add(v); }
            for (bool ancora = true; ancora; )
            {
                ancora = false;
                List<FiltroDaTogliere> nelCestino = new List<FiltroDaTogliere>();
                foreach (FiltroDaTogliere g in restano) if (g.Cestino) nelCestino.Add(g);
                foreach (FiltroDaTogliere v in new List<FiltroDaTogliere>(vanno))
                {
                    if (PercheResta(v, restano, nelCestino, s) == "") continue;
                    vanno.Remove(v);
                    restano.Add(v);
                    if (v.Cestino) nelCestino.Add(v);
                    ancora = true;
                }
            }
            return restano;
        }

        /// <summary>
        /// Fa nello Stato quello che si e' scelto nella finestra: unisce i
        /// mittenti alle regole (o in "La tua scuola", per Dirigenza, Segreteria
        /// e Registro elettronico) e le esclusioni alla loro ricerca avanzata,
        /// accende una regola spenta che li prende, crea le regole nuove (dopo
        /// quella simile, o in fondo, con il primo colore libero) e mette fra i
        /// filtri da togliere (FiltriDaTogliere) quelli che non si lasciano, ognuno
        /// con la regola che lo sostituisce (FiltroDaTogliere.Regola) e quello
        /// che faceva (archivia, segna come letto). Un filtro la cui scelta non
        /// si puo' fare resta in Gmail (Fai dice quando: nessun filtro va via
        /// senza una regola che fa quello che faceva), e per lui non si cambia
        /// nessuna regola: le scelte si provano prima su una copia dello Stato
        /// (Stato.CopiaPerLeScelte), togliendo di volta in volta quelle
        /// rifiutate, finche' reggono tutte; solo allora si fanno davvero. Dice
        /// che cosa ha fatto, a parole.
        /// </summary>
        public static string Applica(Stato s, List<FiltroScelto> scelti)
        {
            string testo = Esito(s, scelti, true).Riepilogo;
            // le etichette dei filtri uniti a una regola con un'altra etichetta
            // restano in Gmail: le unisce EXTRA_unisciEtichette (passo 4)
            List<CoppiaEtichette> rimaste = DaUnire(s);
            if (rimaste.Count > 0)
            {
                List<string> nomi = new List<string>();
                foreach (CoppiaEtichette c in rimaste) nomi.Add(c.Testo());
                testo += "\r\n\r\n" + (rimaste.Count == 1 ? "Un'etichetta resta" : rimaste.Count + " etichette restano") +
                         " in Gmail con i messaggi di prima: " + string.Join(", ", nomi.ToArray()) + ". Dopo EXTRA_togliFiltri, " +
                         "EXTRA_unisciEtichette mette ai loro messaggi l'etichetta della regola, e poi le cancelli tu da " +
                         "Gmail (passo 4, \"Etichette rimaste dai filtri uniti\").";
            }
            return testo;
        }

        /// <summary>
        /// Quello che farebbe Applica con quelle scelte, senza cambiare niente:
        /// la finestra non propone una scelta che Applica rifiuta, e il conto e
        /// il riquadro dicono quali filtri restano in Gmail e perche'.
        /// </summary>
        public static EsitoScelte Prova(Stato s, List<FiltroScelto> scelti)
        {
            return Esito(s, scelti, false);
        }

        static EsitoScelte Esito(Stato s, List<FiltroScelto> scelti, bool davvero)
        {
            List<FiltroScelto> tutti = new List<FiltroScelto>();
            if (scelti != null) foreach (FiltroScelto x in scelti) if (x != null) tutti.Add(x);
            List<FiltroCheResta> restano = new List<FiltroCheResta>();
            EsitoScelte e = null;
            // su una copia: una scelta rifiutata resta in Gmail e al giro dopo
            // conta come lasciata (per lei non si unisce e non nasce niente),
            // finche' nessuna e' rifiutata. Una per giro, l'ultima rifiutata: di
            // solito resta per colpa delle altre (un filtro con la stessa
            // etichetta che resta), e lasciata lei le altre si possono fare
            // (due Portali, uno che archivia e uno no: resta quello che archivia,
            // l'altro diventa la regola). Con lei tutte quelle che resterebbero
            // anche ai giri dopo (FiltroCheResta.Certo: una regola che non si
            // scrive, un filtro con la stessa etichetta, o con un'etichetta
            // esclusa che nessuna scelta cambia se non con dei mittenti in piu',
            // lasciato in Gmail): cosi'
            // con 200 filtri non serve un giro per ognuna. Ogni giro rifa' tutte
            // le prove: quello che va via alla fine regge con tutto quello che resta
            for (int giro = 0; ; giro++)
            {
                Stato copia = s.CopiaPerLeScelte();
                Dictionary<Regola, Regola> mappa = new Dictionary<Regola, Regola>();
                for (int i = 0; i < s.Regole.Count; i++)
                    if (s.Regole[i] != null && !mappa.ContainsKey(s.Regole[i])) mappa[s.Regole[i]] = copia.Regole[i];
                List<FiltroCheResta> rifiutati = new List<FiltroCheResta>();
                e = Fai(copia, tutti, restano, mappa, rifiutati, s);
                if (rifiutati.Count == 0) break;
                if (giro >= tutti.Count) { restano.AddRange(rifiutati); break; }
                FiltroCheResta ultima = rifiutati[rifiutati.Count - 1];
                foreach (FiltroCheResta r in rifiutati) if (r.Certo || r == ultima) restano.Add(r);
            }
            if (davvero)
            {
                // le stesse scelte, che adesso reggono tutte, nello Stato vero
                List<FiltroCheResta> rifiutati = new List<FiltroCheResta>();
                e = Fai(s, tutti, restano, null, rifiutati, null);
                restano.AddRange(rifiutati);
            }
            // nell'ordine della finestra
            List<FiltroCheResta> inOrdine = new List<FiltroCheResta>();
            Dictionary<FiltroScelto, string> chiavi = Chiavi(tutti);
            foreach (FiltroScelto x in tutti)
                foreach (FiltroCheResta r in restano)
                    if (x.Voce != null && r.Chiave == chiavi[x] && !inOrdine.Contains(r)) inOrdine.Add(r);
            foreach (FiltroCheResta r in restano) if (!inOrdine.Contains(r)) inOrdine.Add(r);
            e.Restano = inOrdine;
            e.Riepilogo = Riepilogo(e);
            return e;
        }

        /// <summary>
        /// Le scelte, fatte nello Stato s (quello vero, o una copia: mappa porta
        /// le regole delle scelte a quelle della copia). I filtri in restano
        /// contano come lasciati. Una scelta che non si puo' fare finisce in
        /// rifiutati, con il perche', e il filtro resta in Gmail:
        ///  - "Unisci" che non si unisce piu' (SiPuoUnire), "Diventa una regola"
        ///    che non si scrive o non puo' nascere (CreaRegola);
        ///  - "Toglilo" e basta non scelto a mano (FiltroScelto.AMano) per uno
        ///    scelto prima la cui regola non lo sostituisce piu' (e' cambiata, o
        ///    in Gmail adesso archivia o segna come letto), o scelto con la 1.6.0
        ///    senza il file (non si vede che cosa fa, ne' gli altri filtri con la
        ///    sua etichetta): la finestra lo propone lasciato;
        ///  - "Toglilo" e basta, senza una regola, non scelto a mano per uno che
        ///    non era fra quelli scelti prima (s.FiltriDaTogliere): la finestra
        ///    non lo propone mai, e nel dubbio non va via;
        ///  - lo stesso filtro piu' volte, con azioni diverse, e la regola non fa
        ///    quello che fa la copia che archivia o segna come letto;
        ///  - dopo tutte le scelte, la sua regola non prende piu' tutti i suoi
        ///    messaggi (AncoraSostituito);
        ///  - resta in Gmail un filtro con la stessa etichetta che non archivia o
        ///    non segna come letti come lui (ConLaStessaEtichetta), o con
        ///    un'etichetta che la sua regola esclude (ConUnaEtichettaEsclusa):
        ///    quel filtro mette l'etichetta all'arrivo, e la regola non prende o
        ///    non tocca piu' quei messaggi; o un filtro che manda nel cestino e
        ///    puo' prendere gli stessi messaggi (ConUnoNelCestino): nel cestino
        ///    la regola non guarda. Restando, un filtro ne puo' far restare un
        ///    altro.
        /// Due filtri uguali sono la stessa voce: conta la scelta con una regola
        /// (Unisci o Diventa una regola, poi "lo fa gia'"), se c'e', altrimenti
        /// quella del primo. Una regola nuova con l'etichetta di una che c'e'
        /// gia' non nasce di nuovo (CreaRegola). Con originale (lo Stato vero,
        /// quando s e' una copia) dice anche quali scelte rifiutate lo
        /// sarebbero a ogni giro di Esito (FiltroCheResta.Certo).
        /// </summary>
        static EsitoScelte Fai(Stato s, List<FiltroScelto> scelti, List<FiltroCheResta> restano,
                               Dictionary<Regola, Regola> mappa, List<FiltroCheResta> rifiutati, Stato originale)
        {
            EsitoScelte e = new EsitoScelte();
            List<FiltroDaTogliere> togli = new List<FiltroDaTogliere>();
            HashSet<string> fatte = new HashSet<string>(), lasciate = new HashSet<string>();
            foreach (FiltroCheResta r in restano) lasciate.Add(r.Chiave);
            // la chiave di ogni scelta e di ogni voce da togliere, calcolata una
            // volta sola: con tanti filtri si guarda tante volte
            Dictionary<FiltroScelto, string> chiavi = Chiavi(scelti);
            Dictionary<FiltroDaTogliere, string> chiaveDi = new Dictionary<FiltroDaTogliere, string>();
            // quelli scelti prima, com'erano prima di queste scelte
            List<string> salvati = new List<string>();
            if (s.FiltriDaTogliere != null)
                foreach (FiltroDaTogliere v in s.FiltriDaTogliere) if (v != null) salvati.Add(v.Chiave());
            List<Regola> createAdesso = new List<Regola>();
            Dictionary<Regola, int> dopo = new Dictionary<Regola, int>();
            Dictionary<string, FiltroScelto> perVoce = new Dictionary<string, FiltroScelto>();
            // le regole nate adesso e la scelta che le ha fatte nascere (la sua
            // chiave); e le scelte rifiutate perche' una di quelle archivia o
            // segna come letti diversamente, con la chiave di chi l'ha fatta nascere
            Dictionary<Regola, string> natiDa = new Dictionary<Regola, string>();
            List<KeyValuePair<FiltroCheResta, string>> perUnaNata = new List<KeyValuePair<FiltroCheResta, string>>();
            // la ricerca avanzata di ogni regola prima delle scelte di questo
            // giro: un'unione ci puo' aggiungere delle esclusioni (EscludeUnaToccata)
            Dictionary<Regola, string> ricercheDiPrima = new Dictionary<Regola, string>();
            foreach (Regola r in s.Regole) if (r != null && !ricercheDiPrima.ContainsKey(r)) ricercheDiPrima[r] = r.QueryLibera ?? "";
            foreach (FiltroScelto x in scelti)
            {
                if (!Toglie(x, lasciate, chiavi)) continue;
                string k = chiavi[x];
                if (!perVoce.ContainsKey(k) || Peso(x) > Peso(perVoce[k])) perVoce[k] = x;
            }
            foreach (FiltroScelto x in scelti)
            {
                if (!Toglie(x, lasciate, chiavi)) { e.Lasciati++; continue; }
                string chiave = chiavi[x];
                if (fatte.Contains(chiave) || perVoce[chiave] != x) continue;
                fatte.Add(chiave);
                Regola sostituta = (x.Scelta.Regola != null && mappa != null && mappa.ContainsKey(x.Scelta.Regola))
                    ? mappa[x.Scelta.Regola] : x.Scelta.Regola;
                string perche = "";
                Regola perColpaDi = null;
                if (x.Scelta.Azione == SceltaFiltro.Unisci)
                    perche = UnisciAllaRegola(s, x.Filtro, sostituta, e.Unite, e.Scuola);
                else if (x.Scelta.Azione == SceltaFiltro.Nuova)
                    perche = CreaRegola(s, x, dopo, createAdesso, e.Nuove, e.Unite, e.Scuola, out sostituta, out perColpaDi);
                if (perche != "")
                {
                    // resterebbe a ogni giro: una regola che non si scrive, un'unione
                    // che non si fa nemmeno nello Stato di prima delle scelte
                    bool certo = (x.Scelta.Azione == SceltaFiltro.Nuova && Traduci(x.Filtro, x.Somiglia, s) == null) ||
                                 (x.Scelta.Azione == SceltaFiltro.Unisci && originale != null && x.Scelta.Regola != null &&
                                  originale.Regole.Contains(x.Scelta.Regola) &&
                                  !SiPuoUnire(x.Filtro, (x.Filtro == null) ? null : SoloMittenti(x.Filtro.Criteri), x.Scelta.Regola, originale));
                    Rifiuta(e, rifiutati, x.Voce, perche, certo);
                    // per una regola nata adesso da un'altra scelta: resta a ogni
                    // giro se quella scelta alla fine si fa (qui sotto)
                    if (perColpaDi != null && natiDa.ContainsKey(perColpaDi))
                        perUnaNata.Add(new KeyValuePair<FiltroCheResta, string>(rifiutati[rifiutati.Count - 1], natiDa[perColpaDi]));
                    continue;
                }
                if (sostituta != null && createAdesso.Contains(sostituta) && !natiDa.ContainsKey(sostituta)) natiDa[sostituta] = chiave;
                FiltroDaTogliere voce = x.Voce.Copia();
                chiaveDi[voce] = chiave;
                if (x.Filtro != null)
                {
                    // con il file: quello che fa adesso, con il gruppo delle etichette di adesso
                    voce.Archivia = x.Filtro.Archivia;
                    voce.SegnaLetto = x.Filtro.SegnaLetto;
                    voce.Cestino = x.Filtro.Cestino;
                    voce.Gruppo = s.PrefissoPulito();
                }
                // lo stesso filtro piu' volte in Gmail: EXTRA_togliFiltri le toglie
                // tutte, e ai loro messaggi, che sono gli stessi, facevano quello
                // che fa una qualsiasi. Se una archivia (o segna come letto), la
                // regola lo deve fare
                bool diverse = false, aMano = false;
                foreach (FiltroScelto y in scelti)
                {
                    if (y.Voce == null || chiavi[y] != chiave) continue;
                    if (y.AMano && y.Scelta != null && y.Scelta.Azione == SceltaFiltro.Togli && y.Scelta.Regola == null) aMano = true;
                    if (y == x || y.Filtro == null) continue;
                    if (x.Filtro != null && (y.Filtro.Archivia != x.Filtro.Archivia || y.Filtro.SegnaLetto != x.Filtro.SegnaLetto)) diverse = true;
                    if (y.Filtro.Archivia) voce.Archivia = true;
                    if (y.Filtro.SegnaLetto) voce.SegnaLetto = true;
                    if (y.Filtro.Cestino) voce.Cestino = true;
                }
                if (sostituta != null) voce.Regola = sostituta.Etichetta;
                else if (SceltoConLaVersioneDiPrima(voce))
                {
                    // scelto con la 1.6.0, e senza il file (con il file la voce ha le
                    // azioni del filtro): non si vede che cosa fa, ne' se in Gmail ce
                    // n'e' un altro con la sua etichetta che non archivia. Va via
                    // solo con "Toglilo" scelto a mano, e allora quello che faceva
                    // non conta piu'
                    if (!aMano)
                    {
                        Rifiuta(e, rifiutati, x.Voce, TestoCon160, true);
                        continue;
                    }
                    voce.Regola = ""; voce.Archivia = false; voce.SegnaLetto = false;
                }
                else if ((voce.Regola ?? "").Trim() != "" && !AncoraSostituito(voce, s))
                {
                    // scelto prima con la sua regola, che adesso non lo sostituisce
                    // piu' (e' cambiata, o in Gmail il filtro adesso archivia o segna
                    // come letto): va via e basta solo con "Toglilo" scelto a mano
                    if (!aMano)
                    {
                        Rifiuta(e, rifiutati, x.Voce, PercheNonLoSostituisce(voce, s));
                        continue;
                    }
                    voce.Regola = "";
                }
                else if ((voce.Regola ?? "").Trim() == "" && !aMano && !salvati.Contains(chiave))
                {
                    // "Toglilo" e basta, senza una regola, per uno che non era
                    // scelto: la finestra non lo propone, e lo toglie solo chi lo sceglie
                    Rifiuta(e, rifiutati, x.Voce, "\"Toglilo\" e basta, senza una regola che lo sostituisca, toglie un filtro " +
                            "che non era fra quelli scelti prima solo se lo scegli tu", true);
                    continue;
                }
                if (diverse && voce.Regola != "" && !AncoraSostituito(voce, s))
                {
                    Rifiuta(e, rifiutati, x.Voce, "c'e' piu' volte in Gmail, con azioni diverse: andrebbero via tutte le " +
                            "copie, e la regola " + voce.Regola + " non archivia o non segna come letti come la copia che lo fa");
                    continue;
                }
                togli.Add(voce);
            }
            // dopo tutte le unioni e le regole nuove, ogni filtro va via solo se
            // la sua regola, com'e' adesso, prende ancora tutti i suoi messaggi:
            // un'altra scelta puo' averle aggiunto un'esclusione, o dato a una
            // regola che esclude un mittente del filtro
            foreach (FiltroDaTogliere v in new List<FiltroDaTogliere>(togli))
            {
                if (AncoraSostituito(v, s)) continue;
                togli.Remove(v);
                Rifiuta(e, rifiutati, v, "dopo le altre scelte la regola " + v.Regola + " non prende piu' tutti i suoi messaggi");
            }
            // un filtro che resta in Gmail mette la sua etichetta all'arrivo: la
            // regola con quell'etichetta cerca solo i messaggi che non ce l'hanno
            // ancora (-label:), e a quelli che prende anche lui non fa niente; una
            // regola che esclude quell'etichetta non li prende proprio. Restando,
            // un filtro ne puo' far restare un altro
            List<FiltroDaTogliere> nelCestino = new List<FiltroDaTogliere>();
            List<FiltroDaTogliere> inGmail = QuelliCheRestano(scelti, Via(togli, chiaveDi), nelCestino, chiavi);
            // quelli che restano in Gmail a ogni giro di Esito, comunque vadano le
            // altre scelte: lasciati, che non si possono togliere, o gia' fra
            // quelli che restano. Uno che resta per loro con la stessa etichetta
            // o nel cestino (che non dipende dalle regole di questo giro), o con
            // un'etichetta che la sua regola esclude quando nessuna delle regole
            // escluse e' nata in questo giro o ha preso delle esclusioni (ai giri
            // dopo le scelte che si fanno sono di meno: le regole escluse hanno
            // meno mittenti, o restano spente, e prendono di meno; nel dubbio
            // resta), resterebbe anche ai giri dopo (FiltroCheResta.Certo), e
            // Esito lo lascia subito
            HashSet<string> toccate = new HashSet<string>();
            foreach (Regola r in s.Regole)
                if (r != null && (!ricercheDiPrima.ContainsKey(r) || ricercheDiPrima[r] != (r.QueryLibera ?? "")))
                    toccate.Add(Pulita(r.Etichetta));
            HashSet<string> provati = new HashSet<string>(), certi = new HashSet<string>();
            foreach (FiltroCheResta r in rifiutati) if (r.Certo) certi.Add(r.Chiave);
            foreach (FiltroScelto x in scelti) if (Toglie(x, lasciate, chiavi) && !certi.Contains(chiavi[x])) provati.Add(chiavi[x]);
            List<FiltroDaTogliere> nelCestinoFissi = new List<FiltroDaTogliere>();
            List<FiltroDaTogliere> fissi = QuelliCheRestano(scelti, provati, nelCestinoFissi, chiavi);
            for (bool ancora = true; ancora; )
            {
                ancora = false;
                foreach (FiltroDaTogliere v in new List<FiltroDaTogliere>(togli))
                {
                    string perche = PercheResta(v, inGmail, nelCestino, s);
                    if (perche == "") continue;
                    togli.Remove(v);
                    Rifiuta(e, rifiutati, v, perche,
                            ConLaStessaEtichetta(v, fissi, s) != "" || ConUnoNelCestino(v, nelCestinoFissi) != "" ||
                            (ConUnaEtichettaEsclusa(v, fissi, s) != "" && !EscludeUnaToccata(v, s, toccate)));
                    // resta lui, e con lui i filtri uguali
                    inGmail = QuelliCheRestano(scelti, Via(togli, chiaveDi), nelCestino, chiavi);
                    ancora = true;
                }
            }
            // rifiutati per una regola nata adesso da un'altra scelta che alla fine
            // si fa: al giro dopo quella regola nasce di nuovo, e loro restano
            HashSet<string> vannoVia = Via(togli, chiaveDi);
            foreach (KeyValuePair<FiltroCheResta, string> kv in perUnaNata)
                if (vannoVia.Contains(kv.Value)) kv.Key.Certo = true;
            // quello che ogni voce ricorda per ricontrollarsi senza il file: il
            // gruppo delle etichette, le etichette che la sua regola esclude
            // adesso, e i filtri che restano in Gmail con una di quelle e possono
            // prendere i suoi messaggi (i loro mittenti li prende gia' una regola
            // esclusa: se no la voce sarebbe rimasta qui sopra). Senza il file,
            // quelli che ricordava restano: la finestra non vede gli altri filtri
            foreach (FiltroDaTogliere v in togli)
            {
                if ((v.Regola ?? "").Trim() == "")
                {
                    v.Escluse = null; v.Accanto = new List<FiltroDaTogliere>(); v.Gruppo = null;
                    continue;
                }
                v.Gruppo = s.PrefissoPulito();
                v.Escluse = EtichetteEscluse(v.Regola, s);
                // un altro filtro con la stessa etichetta resta in Gmail: la sua
                // etichetta e' ancora in uso, non e' rimasta (EtichetteRimaste)
                bool stessa = false;
                foreach (FiltroDaTogliere g in inGmail) if (Pulita(g.Etichetta) == Pulita(v.Etichetta)) stessa = true;
                v.StessaEtichettaInGmail = stessa;
                if (v.Accanto == null) v.Accanto = new List<FiltroDaTogliere>();
                foreach (FiltroDaTogliere g in FiltriAccanto(v, inGmail, s))
                {
                    bool gia = false;
                    foreach (FiltroDaTogliere a in v.Accanto) if (a.Chiave() == g.Chiave()) gia = true;
                    if (gia) continue;
                    FiltroDaTogliere c = new FiltroDaTogliere();
                    c.Etichetta = g.Etichetta;
                    c.Criteri = new Dictionary<string, string>(g.Criteri);
                    v.Accanto.Add(c);
                }
            }
            s.FiltriDaTogliere = togli;
            e.Togli = togli;
            return e;
        }

        /// <summary>
        /// Perche' il filtro v, sostituito da una regola, deve restare in Gmail
        /// per quelli che ci restano (restano; nelCestino: quelli che mandano nel
        /// cestino): ConLaStessaEtichetta, ConUnaEtichettaEsclusa o
        /// ConUnoNelCestino. "" se niente.
        /// </summary>
        static string PercheResta(FiltroDaTogliere v, List<FiltroDaTogliere> restano, List<FiltroDaTogliere> nelCestino, Stato s)
        {
            string perche = ConLaStessaEtichetta(v, restano, s);
            if (perche == "") perche = ConUnaEtichettaEsclusa(v, restano, s);
            if (perche == "") perche = ConUnoNelCestino(v, nelCestino);
            return perche;
        }

        /// <summary>
        /// Perche' il filtro v, sostituito da una regola, deve restare in Gmail
        /// per un filtro che ci resta e manda nel cestino, se possono prendere
        /// gli stessi messaggi (PossonoSovrapporsi: nel dubbio si'): quello li
        /// mette nel cestino all'arrivo, e la ricerca della regola, che nel
        /// cestino non guarda, non darebbe loro l'etichetta che dava v. "" se
        /// non ce n'e', o se v si toglie e basta, senza una regola.
        /// </summary>
        static string ConUnoNelCestino(FiltroDaTogliere v, List<FiltroDaTogliere> nelCestino)
        {
            if (v == null || (v.Regola ?? "").Trim() == "" || nelCestino == null) return "";
            foreach (FiltroDaTogliere g in nelCestino)
            {
                if (!PossonoSovrapporsi(v.Criteri, g.Criteri)) continue;
                string quale = (g.Etichetta ?? "").Trim();
                return "resta in Gmail un filtro che manda nel cestino" + (quale == "" ? "" : " (" + quale + ")") + " e puo' " +
                       "prendere gli stessi messaggi: nel cestino la regola " + v.Regola.Trim() + " non li cerca, e non avrebbero " +
                       "piu' la sua etichetta";
            }
            return "";
        }

        /// <summary>Le etichette che escludono le regole con quell'etichetta (senza il gruppo), come le scrivono.</summary>
        static List<string> EtichetteEscluse(string regola, Stato s)
        {
            List<string> fuori = new List<string>();
            foreach (Regola r in s.Regole)
            {
                if (r == null || !string.Equals((r.Etichetta ?? "").Trim(), (regola ?? "").Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                foreach (string x in r.EscludiEtichette) if (!Contiene(fuori, x)) fuori.Add((x ?? "").Trim());
            }
            return fuori;
        }

        /// <summary>
        /// I filtri che restano in Gmail con un'etichetta che la regola del
        /// filtro v esclude, e che possono prendere i suoi messaggi
        /// (PossonoSovrapporsi): quelli che guarda ConUnaEtichettaEsclusa.
        /// </summary>
        static List<FiltroDaTogliere> FiltriAccanto(FiltroDaTogliere v, List<FiltroDaTogliere> restano, Stato s)
        {
            List<FiltroDaTogliere> fuori = new List<FiltroDaTogliere>();
            if (v == null || (v.Regola ?? "").Trim() == "") return fuori;
            string pre = s.PrefissoPulito();
            foreach (Regola r in s.Regole)
            {
                if (r == null || r.EscludiEtichette.Count == 0 ||
                    !string.Equals((r.Etichetta ?? "").Trim(), v.Regola.Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                List<string> escluse = new List<string>();
                foreach (string x in r.EscludiEtichette) escluse.Add(Pulita((pre == "" ? "" : pre + "/") + x));
                foreach (FiltroDaTogliere g in restano)
                    if (escluse.Contains(Pulita(g.Etichetta)) && !fuori.Contains(g) && PossonoSovrapporsi(v.Criteri, g.Criteri)) fuori.Add(g);
            }
            return fuori;
        }

        /// <summary>Perche' uno scelto con la 1.6.0, senza il file, resta in Gmail.</summary>
        public const string TestoCon160 = "scelto con la 1.6.0, che non ricordava se archiviava o segnava come letto: " +
            "senza il file dei filtri non si vede che cosa fa, ne' se in Gmail ce n'e' un altro con la stessa etichetta " +
            "che non lo fa (apri il file dei filtri)";

        /// <summary>Vero se la scelta toglie il filtro, e non e' fra quelli che restano gia' (lasciate: le chiavi; chiavi: quelle delle scelte, Chiavi).</summary>
        static bool Toglie(FiltroScelto x, HashSet<string> lasciate, Dictionary<FiltroScelto, string> chiavi)
        {
            return x != null && x.Voce != null && x.Scelta != null && x.Scelta.TogliIlFiltro && !lasciate.Contains(chiavi[x]);
        }

        /// <summary>La chiave della voce di ogni scelta che ne ha una (FiltroDaTogliere.Chiave).</summary>
        static Dictionary<FiltroScelto, string> Chiavi(List<FiltroScelto> scelti)
        {
            Dictionary<FiltroScelto, string> fuori = new Dictionary<FiltroScelto, string>();
            foreach (FiltroScelto x in scelti ?? new List<FiltroScelto>())
                if (x != null && x.Voce != null && !fuori.ContainsKey(x)) fuori[x] = x.Voce.Chiave();
            return fuori;
        }

        /// <summary>Le chiavi dei filtri da togliere (chiaveDi: quelle gia' calcolate).</summary>
        static HashSet<string> Via(List<FiltroDaTogliere> togli, Dictionary<FiltroDaTogliere, string> chiaveDi)
        {
            HashSet<string> via = new HashSet<string>();
            foreach (FiltroDaTogliere v in togli) via.Add(chiaveDi.ContainsKey(v) ? chiaveDi[v] : v.Chiave());
            return via;
        }

        /// <summary>
        /// Fra due filtri uguali conta prima la scelta che unisce o fa una
        /// regola, poi "lo fa gia'", poi "Toglilo" e basta. Fra due "Diventa
        /// una regola", quella della copia che fa di piu' (archivia, segna come
        /// letto): la regola nuova lo fa per tutte le copie, che vanno via insieme.
        /// </summary>
        static int Peso(FiltroScelto x)
        {
            SceltaFiltro c = x.Scelta;
            if (c.Azione == SceltaFiltro.Nuova)
                return 20 + (x.Filtro != null && x.Filtro.Archivia ? 1 : 0) + (x.Filtro != null && x.Filtro.SegnaLetto ? 1 : 0);
            if (c.Azione == SceltaFiltro.Unisci) return 20;
            return (c.Regola != null) ? 10 : 0;
        }

        static void Rifiuta(EsitoScelte e, List<FiltroCheResta> rifiutati, FiltroDaTogliere voce, string perche)
        {
            Rifiuta(e, rifiutati, voce, perche, false);
        }

        /// <summary>Lo stesso; certo: resterebbe anche ai giri dopo di Esito, con qualunque altra scelta lasciata (FiltroCheResta.Certo).</summary>
        static void Rifiuta(EsitoScelte e, List<FiltroCheResta> rifiutati, FiltroDaTogliere voce, string perche, bool certo)
        {
            FiltroCheResta r = new FiltroCheResta();
            r.Chiave = voce.Chiave();
            r.Etichetta = voce.Etichetta;
            r.Perche = perche;
            r.Certo = certo;
            rifiutati.Add(r);
            e.Lasciati++;
        }

        /// <summary>Il riepilogo dopo "Usa questa scelta": le regole nuove e cambiate, i filtri che restano e perche', quelli da togliere.</summary>
        static string Riepilogo(EsitoScelte e)
        {
            StringBuilder sb = new StringBuilder();
            if (e.Nuove.Count > 0)
                sb.Append(e.Nuove.Count == 1 ? "Una regola nuova" : e.Nuove.Count + " regole nuove")
                  .Append(", con l'etichetta e la ricerca del filtro (in fondo alle regole, o sotto quella simile): ")
                  .Append(string.Join(", ", e.Nuove.ToArray())).Append(".\r\n\r\n");
            if (e.Unite.Count > 0)
                sb.Append("Mittenti aggiunti alle regole: ").Append(string.Join("; ", e.Unite.ToArray())).Append(".\r\n\r\n");
            if (e.Scuola.Count > 0)
                sb.Append("Mittenti aggiunti nella pagina \"La tua scuola\", dove si scrivono quelli di Dirigenza, " +
                          "Segreteria e Registro elettronico: ").Append(string.Join("; ", e.Scuola.ToArray())).Append(".\r\n\r\n");
            if (e.Restano.Count > 0)
            {
                List<string> detti = new List<string>();
                foreach (FiltroCheResta r in e.Restano) detti.Add(r.Etichetta + " (" + r.Perche + ")");
                sb.Append("Restano in Gmail, perche' la scelta non si puo' piu' fare: ")
                  .Append(string.Join("; ", detti.ToArray())).Append(".\r\n\r\n");
            }
            int n = e.Togli.Count;
            sb.Append(n == 0 ? "Nessun filtro da togliere." :
                (n == 1 ? "1 filtro da togliere" : n + " filtri da togliere") + ": li toglie EXTRA_togliFiltri.");
            if (n > 0 && e.Nuove.Count + e.Unite.Count + e.Scuola.Count > 0)
                sb.Append(" Le regole e i filtri da togliere arrivano insieme, nella stessa configurazione: copiala di " +
                          "nuovo (passo 5) e incollala al posto di quella di prima prima di eseguire EXTRA_togliFiltri, " +
                          "cosi' nessun filtro va via prima della regola che lo sostituisce.");
            else if (n > 0) sb.Append(" Copia di nuovo la configurazione (passo 5).");
            if (e.Lasciati > 0)
                sb.Append("\r\n\r\n").Append(e.Lasciati == 1 ? "1 filtro resta in Gmail." : e.Lasciati + " filtri restano in Gmail.");
            return sb.ToString();
        }

        /// <summary>
        /// I filtri della finestra che restano in Gmail: lasciati, che non si
        /// possono togliere o la cui scelta non si puo' fare; non quelli uguali
        /// a una voce da togliere, che vanno via con lei, ne' quelli scelti prima
        /// che nel file aperto non ci sono (FiltroScelto.FuoriDalFile: forse
        /// sono gia' stati tolti). Ognuno con l'etichetta, i criteri (nessuno se
        /// uno non si capisce: allora puo' prendere qualunque messaggio) e
        /// quello che fa (null: non si sa, un filtro scelto con la 1.6.0). In
        /// nelCestino, se non e' null, quelli che mandano nel cestino, anche
        /// senza etichetta. via: le chiavi di quelli che vanno via; chiavi:
        /// quelle delle scelte (Chiavi).
        /// </summary>
        static List<FiltroDaTogliere> QuelliCheRestano(List<FiltroScelto> scelti, HashSet<string> via, List<FiltroDaTogliere> nelCestino,
                                                       Dictionary<FiltroScelto, string> chiavi)
        {
            List<FiltroDaTogliere> fuori = new List<FiltroDaTogliere>();
            if (nelCestino != null) nelCestino.Clear();
            foreach (FiltroScelto x in scelti ?? new List<FiltroScelto>())
            {
                if (x == null || x.FuoriDalFile || (x.Voce != null && via.Contains(chiavi[x]))) continue;
                FiltroDaTogliere r = new FiltroDaTogliere();
                if (x.Filtro != null)
                {
                    r.Etichetta = x.Filtro.Etichetta;
                    r.Criteri = x.Filtro.CriteriIncompleti ? new Dictionary<string, string>() : x.Filtro.Criteri;
                    r.Archivia = x.Filtro.Archivia;
                    r.SegnaLetto = x.Filtro.SegnaLetto;
                    r.Cestino = x.Filtro.Cestino;
                }
                else if (x.Voce != null)
                {
                    r.Etichetta = x.Voce.Etichetta;
                    r.Criteri = x.Voce.Criteri;
                    r.Archivia = x.Voce.Archivia;
                    r.SegnaLetto = x.Voce.SegnaLetto;
                    r.Cestino = x.Voce.Cestino;
                }
                // uno che manda nel cestino conta anche senza etichetta
                if (nelCestino != null && r.Cestino) nelCestino.Add(r);
                if ((r.Etichetta ?? "").Trim() != "") fuori.Add(r);
            }
            return fuori;
        }

        /// <summary>
        /// Perche' il filtro v, sostituito da una regola, deve restare in
        /// Gmail per un filtro che ci resta: ha la stessa etichetta di v o
        /// della sua regola (maiuscole a parte) e non archivia, o non segna
        /// come letto, mentre v lo fa (o non si sa: uno scelto con la 1.6.0,
        /// senza il file, forse non lo fa). Quel filtro mette l'etichetta
        /// all'arrivo, e la regola non cerca piu' quei messaggi. Basta
        /// l'etichetta: i mittenti possono sovrapporsi in molti modi. "" se non
        /// ce n'e', o se v si toglie e basta, senza una regola.
        /// </summary>
        static string ConLaStessaEtichetta(FiltroDaTogliere v, List<FiltroDaTogliere> restano, Stato s)
        {
            if (v == null || (v.Regola ?? "").Trim() == "") return "";
            List<string> etichette = new List<string>();
            etichette.Add(Pulita(v.Etichetta));
            foreach (Regola r in s.Regole)
                if (r != null && string.Equals((r.Etichetta ?? "").Trim(), v.Regola.Trim(), StringComparison.OrdinalIgnoreCase))
                    etichette.Add(Pulita(NomeIntero(r, s)));
            foreach (FiltroDaTogliere g in restano)
            {
                if (!etichette.Contains(Pulita(g.Etichetta))) continue;
                bool archivio = v.Archivia != false && g.Archivia != true;
                bool letti = v.SegnaLetto != false && g.SegnaLetto != true;
                if (!archivio && !letti) continue;
                string non = archivio ? "archivia" : "segna come letti";
                bool forse = archivio ? g.Archivia == null : g.SegnaLetto == null;
                return "resta in Gmail un altro filtro con l'etichetta " + g.Etichetta.Trim() + ", che " + (forse ? "forse " : "") +
                       "non " + non + ": mette l'etichetta ai messaggi che prende anche lui prima dello script, e la regola " +
                       v.Regola + " non li cerca piu' e non li " + (archivio ? "archivierebbe" : "segnerebbe come letti");
            }
            return "";
        }

        /// <summary>
        /// Perche' il filtro v deve restare in Gmail quando la regola che lo
        /// sostituisce esclude altre etichette (Studenti esclude Colleghi,
        /// Dirigenza e Segreteria; Ministero e USR le ultime due) e in Gmail
        /// resta un filtro con una di quelle: la mette all'arrivo, e la regola
        /// non prende i messaggi che l'hanno. Solo se i due filtri possono
        /// prendere gli stessi messaggi (PossonoSovrapporsi: nel dubbio si'), e
        /// non se tutti i mittenti di quel filtro li prende gia' una delle regole
        /// escluse, accesa e sopra di lei (PresoDaUnaEsclusa: quell'etichetta
        /// quei messaggi l'avrebbero comunque, ed e' quello che fa la regola).
        /// "" se non ce n'e', o se v si toglie e basta.
        /// </summary>
        static string ConUnaEtichettaEsclusa(FiltroDaTogliere v, List<FiltroDaTogliere> restano, Stato s)
        {
            if (v == null || (v.Regola ?? "").Trim() == "") return "";
            string pre = s.PrefissoPulito();
            foreach (Regola r in s.Regole)
            {
                if (r == null || r.EscludiEtichette.Count == 0 ||
                    !string.Equals((r.Etichetta ?? "").Trim(), v.Regola.Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                List<string> escluse = new List<string>();
                foreach (string x in r.EscludiEtichette) escluse.Add(Pulita((pre == "" ? "" : pre + "/") + x));
                foreach (FiltroDaTogliere g in restano)
                {
                    // non uno che sembra di una classe e ha degli indirizzi: la voce
                    // lo ricorderebbe (FiltroDaTogliere.Accanto), con gli indirizzi
                    if (!escluse.Contains(Pulita(g.Etichetta)) || !PossonoSovrapporsi(v.Criteri, g.Criteri) ||
                        (PresiDalleEscluse(s, r, g.Criteri) && !DiUnaClasseConIndirizzi(g.Etichetta, g.Criteri, s))) continue;
                    return "resta in Gmail un filtro con l'etichetta " + g.Etichetta.Trim() + ", che la regola " + NomeIntero(r, s) +
                           " esclude: mette l'etichetta ai messaggi che prende anche lui prima dello script, e la regola non li " +
                           "prende piu'";
                }
            }
            return "";
        }

        /// <summary>
        /// Vero se la regola del filtro v esclude un'etichetta fra toccate (le
        /// regole nate in un giro di Fai, o a cui le sue scelte hanno aggiunto
        /// delle esclusioni): allora un altro giro, con meno scelte, puo' dire
        /// diversamente se le regole escluse prendono tutti i mittenti di un
        /// filtro che resta (PresiDalleEscluse). Mittenti in piu' o una regola
        /// accesa no: con meno scelte le regole escluse prendono solo di meno.
        /// </summary>
        static bool EscludeUnaToccata(FiltroDaTogliere v, Stato s, HashSet<string> toccate)
        {
            if (v == null || toccate.Count == 0) return false;
            foreach (Regola r in s.Regole)
            {
                if (r == null || !string.Equals((r.Etichetta ?? "").Trim(), (v.Regola ?? "").Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                foreach (string x in r.EscludiEtichette) if (toccate.Contains(Pulita(x))) return true;
            }
            return false;
        }

        /// <summary>
        /// Vero se due filtri possono prendere lo stesso messaggio: se tutti e
        /// due sono fatti solo di mittenti, quando un mittente dell'uno puo'
        /// essere un mittente dell'altro (Tocca, letto largo: un dominio e i suoi
        /// indirizzi, una parola, una parte locale); altrimenti, nel dubbio, si'.
        /// </summary>
        static bool PossonoSovrapporsi(Dictionary<string, string> a, Dictionary<string, string> b)
        {
            MittentiFiltro ma = SoloMittenti(a), mb = SoloMittenti(b);
            if (ma == null || mb == null) return true;
            foreach (string x in ma.Da)
                foreach (string y in mb.Da)
                    if (Tocca(x, y) || Tocca(y, x)) return true;
            return false;
        }

        /// <summary>Vero se il filtro e' fatto solo di mittenti e ognuno lo prende tutto una delle regole che r esclude, accesa e sopra di lei (PresoDaUnaEsclusa).</summary>
        static bool PresiDalleEscluse(Stato s, Regola r, Dictionary<string, string> criteri)
        {
            MittentiFiltro m = SoloMittenti(criteri);
            if (m == null) return false;
            foreach (string d in m.Da) if (!PresoDaUnaEsclusa(s, r, d)) return false;
            return true;
        }

        /// <summary>Un'etichetta per confrontarla: senza spazi ai lati, senza le barre in fondo, in minuscolo.</summary>
        static string Pulita(string etichetta)
        {
            return (etichetta ?? "").Trim().Trim('/').Trim().ToLowerInvariant();
        }

        /// <summary>
        /// Aggiunge i mittenti del filtro alla regola (a "La tua scuola" per
        /// Dirigenza, Segreteria e Registro elettronico) e le sue esclusioni
        /// alla ricerca avanzata, e la accende. "" se l'ha fatto, altrimenti il perche'.
        /// </summary>
        static string UnisciAllaRegola(Stato s, FiltroGmail f, Regola r, List<string> unite, List<string> scuola)
        {
            MittentiFiltro m = (f == null) ? null : SoloMittenti(f.Criteri);
            if (r == null || !s.Regole.Contains(r) || !SiPuoUnireIMittenti(f, m, r, s)) return "non si unisce piu' a quella regola";
            if (!EsclusioniCompatibili(m, r, s)) return "unito a " + NomeIntero(r, s) + ", " + ToglieDelleEsclusioni;
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
        /// dell'altro. Solo se archiviano e segnano come letti allo stesso
        /// modo: dove prendono gli stessi messaggi li prende la prima, e fa solo
        /// quello che fa lei; con azioni diverse il filtro resta. Con una
        /// regola che c'era gia', il filtro resta. "" se l'ha fatto,
        /// altrimenti il perche'.
        /// </summary>
        static string CreaRegola(Stato s, FiltroScelto x, Dictionary<Regola, int> dopo, List<Regola> createAdesso,
                                 List<string> nuove, List<string> unite, List<string> scuola, out Regola sostituta,
                                 out Regola perColpaDi)
        {
            sostituta = null;
            perColpaDi = null;
            FiltroGmail f = x.Filtro;
            Regola r = Traduci(f, x.Somiglia, s);
            if (r == null) return "non si scrive come regola";
            List<string> personale = s.IndirizziPersonale();
            MittentiFiltro m = SoloMittenti(f.Criteri);
            Regola cera = null, gemella = null;
            foreach (Regola e in s.Regole)
            {
                if (!ConEtichetta(e, f.Etichetta, s)) continue;
                if (GiaNellaRegola(f, e, s) ||
                    (StessaRegola(r, e) && GeneratorePosta.AttivaNellaConfigurazione(s, e, personale) && !PrimaUnaDiversa(s, e, personale)))
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
            // la sottoetichetta di un ruolo e' gia' una regola, subito sotto i
            // colleghi, che non archivia e non segna come letti: una regola nuova
            // con la stessa etichetta, sotto di lei, non prenderebbe i messaggi
            // dell'elenco del personale
            string ruolo = SottoetichettaDiUnRuolo(f.Etichetta, s);
            if (ruolo != null) return "c'e' gia' la sottoetichetta del ruolo " + ruolo + ", dall'elenco del personale";
            // due regole con la stessa etichetta cercano tutte e due -label:
            // quella etichetta: dove si sovrappongono prende la prima, e fa solo
            // quello che fa lei. Con azioni diverse, una delle due non le farebbe
            foreach (Regola e in createAdesso)
                if (ConEtichetta(e, f.Etichetta, s) && (e.Archivia != r.Archivia || e.SegnaComeLette != r.SegnaComeLette))
                {
                    perColpaDi = e;
                    return "c'e' gia' una regola " + NomeIntero(e, s) + ", nata adesso da un altro filtro, che " +
                           (e.Archivia != r.Archivia ? "archivia" : "segna come letti") + " diversamente: dove prendono " +
                           "gli stessi messaggi farebbe solo quello che fa lei";
                }
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
        /// Le etichette rimaste dai filtri di Gmail che la configurazione toglie
        /// sostituiti da una regola con un'altra etichetta (Famiglie unito a
        /// Genitori, la casella della scuola unita a Segreteria): la loro
        /// etichetta resta in Gmail con i messaggi di prima, e nessuno la mette
        /// piu'. Non un'etichetta ancora in uso: quella di un filtro scelto che
        /// resta in Gmail (CheRestano), o di uno che, quando si e' scelto,
        /// lasciava in Gmail un altro filtro con la stessa etichetta
        /// (FiltroDaTogliere.StessaEtichettaInGmail). Una volta per etichetta, e
        /// non un'etichetta delle regole, anche spente, dei ruoli o del gruppo
        /// (EtichettaGestita), ne' una che due regole diverse si contendono.
        /// Anche quelle che il docente non vuole unire (Stato.EtichetteDaNonUnire):
        /// le toglie DaUnire.
        /// </summary>
        public static List<CoppiaEtichette> EtichetteRimaste(Stato s)
        {
            List<CoppiaEtichette> fuori = new List<CoppiaEtichette>();
            if (s == null || s.FiltriDaTogliere == null) return fuori;
            // le etichette ancora in uso: di un filtro scelto che resta in Gmail,
            // o di uno che ne lasciava in Gmail un altro con la stessa etichetta
            List<string> restano = new List<string>(), inUso = new List<string>(), contese = new List<string>();
            foreach (FiltroDaTogliere v in CheRestano(s)) { restano.Add(v.Chiave()); inUso.Add(Pulita(v.Etichetta)); }
            foreach (FiltroDaTogliere v in s.FiltriDaTogliere)
                if (v != null && v.StessaEtichettaInGmail == true) inUso.Add(Pulita(v.Etichetta));
            foreach (FiltroDaTogliere v in s.FiltriDaTogliere)
            {
                if (v == null || (v.Regola ?? "").Trim() == "" || restano.Contains(v.Chiave())) continue;
                if (DiUnaClasseConIndirizzi(v.Etichetta, v.Criteri, s)) continue;
                Regola r = RegolaCheLoSostituisceAncora(v, s);
                if (r == null) continue;
                string da = (v.Etichetta ?? "").Trim().Trim('/').Trim(), a = NomeIntero(r, s).Trim();
                if (da == "" || Pulita(da) == Pulita(a) || EtichettaGestita(s, da) || inUso.Contains(Pulita(da)) ||
                    contese.Contains(Pulita(da))) continue;
                CoppiaEtichette gia = null;
                foreach (CoppiaEtichette c in fuori) if (Pulita(c.Da) == Pulita(da)) gia = c;
                if (gia != null)
                {
                    // la stessa etichetta verso due regole diverse: nel dubbio nessuna
                    if (Pulita(gia.A) != Pulita(a)) { fuori.Remove(gia); contese.Add(Pulita(da)); }
                    continue;
                }
                CoppiaEtichette nuova = new CoppiaEtichette();
                nuova.Da = da;
                nuova.A = a;
                fuori.Add(nuova);
            }
            return fuori;
        }

        /// <summary>Le etichette rimaste da unire (EtichetteRimaste), senza quelle che il docente non vuole unire.</summary>
        public static List<CoppiaEtichette> DaUnire(Stato s)
        {
            List<CoppiaEtichette> fuori = new List<CoppiaEtichette>();
            foreach (CoppiaEtichette c in EtichetteRimaste(s))
                if (!DaNonUnire(s, c.Da)) fuori.Add(c);
            return fuori;
        }

        /// <summary>Vero se il docente non vuole unire quell'etichetta rimasta (Stato.EtichetteDaNonUnire), maiuscole a parte.</summary>
        public static bool DaNonUnire(Stato s, string etichetta)
        {
            if (s == null || s.EtichetteDaNonUnire == null) return false;
            foreach (string e in s.EtichetteDaNonUnire) if (Pulita(e) == Pulita(etichetta)) return true;
            return false;
        }

        /// <summary>
        /// Vero per un'etichetta che lo script gestisce: quella di una regola,
        /// anche spenta, con il gruppo, o un livello sopra (il gruppo, Colleghi
        /// sopra Colleghi/Docenti), o la sottoetichetta di un ruolo. Lo script
        /// non la unisce a niente (EXTRA_unisciEtichette fa lo stesso controllo).
        /// </summary>
        public static bool EtichettaGestita(Stato s, string etichetta)
        {
            string e = Pulita(etichetta);
            if (e == "") return true;
            if (SottoetichettaDiUnRuolo(etichetta, s) != null) return true;
            foreach (Regola r in s.Regole)
            {
                if (r == null || (r.Etichetta ?? "").Trim() == "") continue;
                string nome = "";
                foreach (string parte in NomeIntero(r, s).Split('/'))
                {
                    nome = (nome == "") ? parte : nome + "/" + parte;
                    if (Pulita(nome) == e) return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Vero se la regola b cerca la stessa cosa della regola a, nata da un
        /// filtro, e fa lo stesso: etichetta, mittenti, ricerca (StessaRicerca:
        /// OR e AND sono operatori solo in maiuscolo), archivia, letti; e b non
        /// ha altri criteri ne' etichette escluse.
        /// </summary>
        static bool StessaRegola(Regola a, Regola b)
        {
            if (!string.Equals(a.Etichetta.Trim(), b.Etichetta.Trim(), StringComparison.OrdinalIgnoreCase)) return false;
            if (a.Da.Count != b.Da.Count || b.Oggetto.Count > 0 || b.Contiene.Count > 0 || b.UnoQualsiasi) return false;
            if (b.Sorgente != "" || b.EscludiEtichette.Count > 0) return false;
            foreach (string d in a.Da) if (!Contiene(b.Da, d)) return false;
            return StessaRicerca(a.QueryLibera, b.QueryLibera) && a.Archivia == b.Archivia && a.SegnaComeLette == b.SegnaComeLette;
        }
    }
}
