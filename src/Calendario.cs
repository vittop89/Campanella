// ===========================================================================
//  Calendario.cs - i giorni senza lezione e il piano delle serie
//
//  Sul calendario ogni blocco di ore (Orario.cs, AnalisiOrario.Blocchi)
//  diventa un evento settimanale. Nei giorni senza lezione (feste, vacanze,
//  ponti) l'evento non deve comparire: il blocco allora diventa piu' serie
//  settimanali, una per ogni tratto di settimane senza interruzioni.
//
//  I giorni senza lezione li scrive il docente, una riga per giorno o per
//  periodo; le feste nazionali si possono aggiungere con un bottone. Nessuna
//  tabella di calendari regionali: vacanze, patrono e ponti cambiano da
//  regione a regione e da scuola a scuola, e li dice la circolare.
//
//  Lo stesso piano lo calcola lo script (Orari.gs, _orariPiano_): qui serve
//  all'anteprima della pagina, e test\prova_orario.ps1 controlla che i due
//  diano gli stessi numeri.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Campanella
{
    /// <summary>Un giorno o un periodo senza lezione, dal / al compresi.</summary>
    class Sospensione
    {
        public DateTime Dal;
        public DateTime Al;
        public string Nome = "";
    }

    /// <summary>
    /// Come e' stata letta una riga dei giorni senza lezione: il giorno o il
    /// periodo capito (Giorni) oppure perche' non si capisce (Motivo) e, se
    /// capita, un avviso da controllare. La pagina Orari le mostra tutte sotto
    /// la casella, mentre si scrive (Calendario.Descrivi).
    /// </summary>
    class RigaLetta
    {
        public int Numero;               // la riga del testo, da 1
        public string Testo = "";        // com'e' scritta
        public Sospensione Giorni;       // null: non capita
        public string Motivo = "";       // perche' non e' capita
        public string Avviso = "";       // capita, ma da controllare
    }

    /// <summary>Una serie settimanale del piano: un blocco, dalla prima all'ultima lezione di un tratto.</summary>
    class SerieCalendario
    {
        public BloccoOrario Blocco;
        public DateTime Dal;
        public DateTime Al;
        public int Lezioni;
    }

    class PianoCalendario
    {
        public List<SerieCalendario> Serie = new List<SerieCalendario>();
        public int Lezioni = 0;         // quelle che finiscono sul calendario
        public int Saltate = 0;         // quelle che cadono in un giorno senza lezione
        public int BlocchiFuori = 0;    // giorno non riconosciuto, o il periodo non lo contiene
    }

    static class Calendario
    {
        // una data: 2026-11-01, oppure 1/11/2026, 01/11/26, 01/11 (anche con i punti).
        // [0-9] e non \d: \d prende anche le cifre degli altri alfabeti (quelle a
        // larghezza piena di un PDF, per esempio), che poi int.Parse non legge
        const string Data = @"(?:[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[/.][0-9]{1,2}(?:[/.](?:[0-9]{4}|[0-9]{2}))?)";
        // la stessa senza la forma aaaa-mm-gg: quella che segue un giorno solo, "23-31/12/2026"
        const string GiornoMese = @"(?:[0-9]{1,2}[/.][0-9]{1,2}(?:[/.](?:[0-9]{4}|[0-9]{2}))?)";
        // un mese a parole, intero o abbreviato
        const string Mese = @"(?<mese>gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|mag(?:gio)?|giu(?:gno)?|" +
                            @"lug(?:lio)?|ago(?:sto)?|set(?:t(?:embre)?)?|ott(?:obre)?|nov(?:embre)?|dic(?:embre)?)";
        // fra l'inizio e la fine di un periodo: il trattino, "al" o "fino al"
        const string Fra = @"\s*[-–—]\s*|\s+(?:fino\s+)?al\s+";
        // dopo le date: la fine della riga o un separatore, poi il nome. Altre
        // cifre attaccate no ("1/11/202" non e' un anno a due cifre); un punto o
        // una parentesi si', come in fondo a una frase della circolare. "fine"
        // segna dove finiscono le date
        const string PoiNome = @"(?<fine>)(?=$|[\s:,;.)–—-])[\s:,;.)–—-]*(?<nome>.*)$";

        // [dal] data [ (- | [fino] al) data ] [nome]. Con "dal" la seconda data ci
        // vuole (LeggiUna): "dal 23/12/2026 all'Epifania" non e' un giorno solo
        static readonly Regex DueDate = new Regex(
            @"^(?<dal>dal\s+)?(?<d1>" + Data + @")(?:(?:" + Fra + @")(?<d2>" + Data + @"))?" + PoiNome,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // il mese scritto una volta sola: un giorno e poi la data intera,
        // "23-31/12/2026", "dal 23 al 31/12/2026", "7 e 8/12/2026" (con "e", due
        // giorni di seguito)
        static readonly Regex GiornoEData = new Regex(
            @"^(?:dal\s+)?(?<g1>[0-9]{1,2})(?<fra>" + Fra + @"|\s+e\s+)(?<d2>" + GiornoMese + @")" + PoiNome,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // a parole: "8 dicembre 2026", "7-8 dicembre 2026", "dal 23 al 31 dicembre",
        // "7 e 8 dic.", "dal 7 all'8 dicembre", "1° maggio". Dopo il mese niente
        // altre lettere ("8 martedi'" non e' marzo)
        static readonly Regex GiorniAParole = new Regex(
            @"^(?<dal>dal\s+)?(?<g1>[0-9]{1,2})\s*[°º]?" +
            @"(?:(?<fra>" + Fra + @"|\s+e\s+|\s+(?:fino\s+)?all['’]\s*)(?<g2>[0-9]{1,2})\s*[°º]?)?" +
            @"\s*" + Mese + @"\.?(?![a-z])(?:\s+(?<anno>[0-9]{4})(?![0-9]))?" + PoiNome,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // una data dentro il nome: "07/12/2026, 08/12/2026 ponte", "dal 23/12/2026 a
        // 06/01/2027". Con il punto solo se c'e' l'anno: "alle 10.30" e' un'ora
        static readonly Regex DataNelNome = new Regex(
            @"(?<![0-9])(?:[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}/[0-9]{1,2}(?:/[0-9]{2,4})?|" +
            @"[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{2,4})(?![0-9])", RegexOptions.CultureInvariant);

        // un giorno scritto a parole: "6 gennaio", "6 gen. 2027", "1 maggio" (anche con
        // il segno di grado). Non "2 settimane" o "3 marce": dopo il mese non ci sono
        // altre lettere
        static readonly Regex DataAParole = new Regex(
            @"(?<![0-9])([0-9]{1,2})\s*[°º]?\s*(gen(?:naio)?|feb(?:braio)?|mar(?:zo)?|apr(?:ile)?|" +
            @"mag(?:gio)?|giu(?:gno)?|lug(?:lio)?|ago(?:sto)?|set(?:t(?:embre)?)?|ott(?:obre)?|nov(?:embre)?|" +
            @"dic(?:embre)?)\.?(?![a-z])(?:\s+([0-9]{4})(?![0-9]))?",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // subito dopo le date, un collegamento seguito da un numero: "- 03", "al 3",
        // "all'8", "e 8 dicembre", ", 2": la fine di un periodo scritta in un altro modo
        static readonly Regex Collegamento = new Regex(
            @"^\s*(?:[-–—/,;&+]|e|a|al|all['’]|fino\s+(?:a|al|all['’]))\s*(?=[0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // un numero nel nome che potrebbe essere un giorno: "ponte 7-8", "fino al
        // giorno 6", "anche martedi' 8". Non un'ora, un decimale, una percentuale,
        // un piano, una classe o una quantita': "alle 10.30", "il 3,5", "al 50%",
        // "al 2° piano", "1A", "3 ore", "2 settimane", "il 2 turno"
        static readonly Regex NumeroNelNome = new Regex(
            @"(?<![0-9.,:/])([0-9]{1,2})(?![0-9])(?![.,:][0-9])(?!\s*[%°ºª^])(?![a-z])" +
            @"(?!\s*(?:ore|ora|h|min|minuti|settimana|settimane|giorno|giorni|mese|mesi|anno|anni|volte|turno|turni|" +
            @"piano|classi|persone|euro)\b)",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // una data con il punto e senza anno nel nome: "8.12 Immacolata". Non un'ora
        // ("alle 10.30", "ore 12.10": subito dopo alle, dalle, ore, h), un decimale
        // di una quantita' ("3.5%") o un pezzo di un numero piu' lungo
        static readonly Regex GiornoColPunto = new Regex(
            @"(?<![0-9.,:/])(?<!\b(?:alle|dalle|ore|h)\s*)([0-9]{1,2})\.([0-9]{1,2})(?![0-9]|\.[0-9]|\s*[%°º])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // nel nome la fine di un periodo scritta a parole ("fino all'Epifania", "sino
        // al lunedi'", "all'Epifania", "al giorno dopo"): in una riga di un giorno solo
        // e' un periodo scritto come un giorno
        static readonly Regex FineNelNome = new Regex(
            @"\b(?:fino|sino)\b|\ball['’]\s*epifania|\bal\s+(?:giorno|luned|marted|mercoled|gioved|venerd|sabato|" +
            @"domenica|capodanno|epifania)",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // quanti giorni dura, nel nome: "di 2 giorni", "(15 giorni)", "2gg", "2 gg"
        static readonly Regex GiorniNelNome = new Regex(@"(?<![0-9.,])([0-9]{1,3})\s*(?:giorni|gg)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // lo stesso con il numero in lettere: "di due giorni", "tre gg", "un giorno"
        static readonly Regex GiorniInLettere = new Regex(
            @"(?<!\p{L})(un|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|quindici)\s+(?:giorni|giorno|gg)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        static readonly string[] NumeriInLettere = { "un", "uno", "due", "tre", "quattro", "cinque", "sei", "sette",
                                                     "otto", "nove", "dieci", "quindici" };
        static readonly int[] ValoriInLettere = { 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15 };

        // un giorno della settimana nel nome: "lunedi'", "martedi", "lunedì", "sabato".
        // Due diversi in una riga di un giorno solo sono un periodo scritto come un
        // giorno ("22/02/2027 carnevale lunedi' e martedi'")
        static readonly Regex GiornoDellaSettimana = new Regex(
            @"(?<!\p{L})(?:(luned|marted|mercoled|gioved|venerd)(?:i|ì)|(sabato|domenica))(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // nel nome l'inizio o la fine di un periodo, o un giorno di lezione: "Inizio
        // delle lezioni", "Vacanze natalizie", "fine vacanze", "Ripresa delle
        // lezioni", "Rientro dalle vacanze". In una riga di un giorno solo non e'
        // un giorno senza lezione: e' un confine scritto al posto del periodo
        static readonly Regex ConfineNelNome = new Regex(
            @"(?<!\p{L})(?:vacanz\p{L}*|inizio|iniziano|termine|terminano|fine|ripresa|riprendono|rientro)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // gli a capo: anche quelli che arrivano incollando da un PDF o da una pagina web
        static readonly Regex ACapo = new Regex("\r\n|[\n\r\u000B\u000C\u0085\u2028\u2029]");

        static readonly string[] Mesi = { "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic" };
        static readonly string[] GiorniBrevi = { "dom", "lun", "mar", "mer", "gio", "ven", "sab" };

        /// <summary>L'avviso di una riga capita con un numero nel nome che potrebbe essere un giorno.</summary>
        public const string AvvisoNumero = "nel motivo c'e' un numero: controlla che il periodo sia giusto";

        /// <summary>
        /// L'avviso di una riga capita con nel nome la fine di un periodo ("fino
        /// all'Epifania") o quanti giorni dura ("di 2 giorni"), che non tornano con
        /// le date della riga.
        /// </summary>
        public const string AvvisoDurata = "nel motivo c'e' una fine o una durata che non torna con le date: " +
                                           "per un periodo scrivi anche la fine, come 23/12/2026-06/01/2027";

        /// <summary>
        /// L'avviso di una riga di un giorno solo che nel nome parla del
        /// confine di un periodo o di un giorno di lezione ("Inizio delle
        /// lezioni", "Vacanze natalizie", "fine vacanze", "Rientro dalle
        /// vacanze"): di solito il primo o l'ultimo giorno scritto al posto del
        /// periodo, o un giorno in cui si fa lezione.
        /// </summary>
        public const string AvvisoConfine = "sembra l'inizio o la fine di un periodo, o un giorno di lezione: per un " +
                                            "periodo scrivi anche la fine (23/12/2026-06/01/2027); i giorni di " +
                                            "lezione non vanno qui";

        // ===================================================================
        //  LE RIGHE SCRITTE DAL DOCENTE
        // ===================================================================

        /// <summary>
        /// I giorni senza lezione capiti, e le righe non capite cosi' come sono
        /// state scritte (LeggiRighe dice come e' stata letta ognuna).
        /// </summary>
        public static List<Sospensione> Leggi(string testo, DateTime inizioPeriodo, out List<string> nonCapite)
        {
            List<Sospensione> fuori = new List<Sospensione>();
            nonCapite = new List<string>();
            foreach (RigaLetta r in LeggiRighe(testo, inizioPeriodo))
            {
                if (r.Giorni != null) fuori.Add(r.Giorni);
                else nonCapite.Add(r.Testo);
            }
            return fuori;
        }

        /// <summary>
        /// Una riga per giorno o per periodo: "01/11/2026 Tutti i Santi",
        /// "23/12/2026-06/01/2027 Vacanze di Natale", "dal 23/12/2026 al
        /// 06/01/2027", "2026-11-01", anni a due cifre, e anche senza anno
        /// ("01/11", "23/12-06/01"): allora l'anno e' quello dell'anno
        /// scolastico del periodo (da settembre a dicembre l'anno in cui
        /// comincia, da gennaio ad agosto quello dopo), o quello dell'altra
        /// data della riga ("23/12-06/01/2027"). Il mese scritto una volta
        /// sola: "23-31/12/2026", "dal 23 al 31/12/2026", "7 e 8/12/2026", e a
        /// parole "7-8 dicembre 2026", "dal 23 al 31 dicembre", "8 dicembre"
        /// ("e" vuol dire due giorni di seguito). Le righe vuote e quelle che
        /// cominciano con # non contano. Non si capisce (Motivo) una data
        /// impossibile, la fine prima dell'inizio, un'altra data nel nome
        /// ("07/12/2026, 08/12/2026", "dal 23/12 a 06/01", e con la data della
        /// riga con il punto anche "7.12 ponte, 8.12"), la fine scritta in un
        /// altro modo subito dopo le date ("2026-11-01-03", "01/11 - 03",
        /// "dal 23/12 al 6 gennaio"), "dal" con una data sola ("dal 23/12/2026
        /// all'Epifania"): mai un giorno solo con il resto nel nome. Un giorno a
        /// parole fra le date della riga ("25/04/2027 - 25 aprile") e' un nome.
        /// Un numero nel nome che potrebbe essere un giorno fuori dal periodo
        /// ("07/12/2026 ponte 7-8", "8.12") non ferma la riga, ma le da' un
        /// Avviso: la pagina la mostra da controllare. Lo stesso, in una riga di
        /// un giorno solo, la fine di un periodo a parole ("fino all'Epifania"),
        /// e una durata che non torna con le date ("di 2 giorni", "2gg", "di due
        /// giorni", e in un giorno solo due giorni della settimana, "lunedi' e
        /// martedi'"). E una
        /// riga di un giorno solo che parla del confine di un periodo o di un
        /// giorno di lezione ("23/12/2026 Vacanze natalizie", "14/09/2026 Inizio
        /// delle lezioni", "07/01/2027 Ripresa delle lezioni").
        /// </summary>
        public static List<RigaLetta> LeggiRighe(string testo, DateTime inizioPeriodo)
        {
            List<RigaLetta> fuori = new List<RigaLetta>();
            int annoInizio = AnnoScolastico(inizioPeriodo);
            string[] righe = ACapo.Split(testo ?? "");
            for (int i = 0; i < righe.Length; i++)
            {
                string riga = righe[i].Trim();
                if (riga == "" || riga.StartsWith("#")) continue;
                RigaLetta r = new RigaLetta();
                r.Numero = i + 1;
                r.Testo = riga;
                LeggiUna(riga, annoInizio, r);
                fuori.Add(r);
            }
            return fuori;
        }

        /// <summary>Il numero della riga (da 1, come RigaLetta.Numero) in cui sta la posizione nel testo.</summary>
        public static int NumeroDiRiga(string testo, int posizione)
        {
            string prima = (testo ?? "").Substring(0, Math.Max(0, Math.Min(posizione, (testo ?? "").Length)));
            return ACapo.Matches(prima).Count + 1;
        }

        static void NonCapita(RigaLetta r, string motivo)
        {
            r.Giorni = null;
            r.Motivo = motivo;
        }

        /// <summary>Legge una riga non vuota e la scrive in r.</summary>
        static void LeggiUna(string riga, int annoInizio, RigaLetta r)
        {
            // un punto elenco copiato da una circolare
            string s = Regex.Replace(riga, @"^[-*•]\s+", "");
            DateTime dal, al;
            string perche;
            Match m = DueDate.Match(s);
            if (!m.Success) m = GiornoEData.Match(s);
            if (!m.Success) m = GiorniAParole.Match(s);
            if (!m.Success)
            {
                NonCapita(r, "non comincia con una data (come 01/11/2026, 23/12/2026-06/01/2027 o 7-8 dicembre 2026)");
                return;
            }
            if (!Date(m, annoInizio, out dal, out al, out perche)) { NonCapita(r, perche); return; }
            if (al < dal) { NonCapita(r, "la fine viene prima dell'inizio"); return; }

            // dopo le date: un'altra data nel nome, un collegamento con un numero
            // che non e' un giorno a parole fra le date ("2026-11-01-03", "- 03",
            // "al 3"), o un giorno a parole fuori dalle date ("al 6 gennaio").
            // "25/04/2027 - 25 aprile" invece e' un nome
            string dopo = s.Substring(m.Groups["fine"].Index);
            string nome = m.Groups["nome"].Value.Trim();
            // con la data della riga scritta con il punto, anche "8.12" nel nome e'
            // un'altra data ("7.12 ponte, 8.12 Immacolata")
            bool colPunto = m.Groups["d1"].Value.IndexOf('.') >= 0 || m.Groups["d2"].Value.IndexOf('.') >= 0;
            if (DataNelNome.IsMatch(nome) || (colPunto && GiorniColPunto(nome, false, dal, al)))
            {
                NonCapita(r, "dopo la data ce n'e' un'altra: un giorno o un periodo per riga, come 07/12/2026-08/12/2026");
                return;
            }
            Match collegamento = Collegamento.Match(dopo);
            if (collegamento.Success)
            {
                Match subito = DataAParole.Match(dopo, collegamento.Length);
                if (!subito.Success || subito.Index != collegamento.Length || !FraLeDate(subito, dal, al))
                {
                    NonCapita(r, "la fine del periodo va scritta come data, come 01/11/2026-03/11/2026 o 1-3/11/2026");
                    return;
                }
            }
            foreach (Match aParole in DataAParole.Matches(dopo))
            {
                if (FraLeDate(aParole, dal, al)) continue;
                NonCapita(r, "c'e' un altro giorno a parole: scrivi il periodo con le date, come 23/12/2026-06/01/2027");
                return;
            }
            // "dal" e una data sola: la fine del periodo manca, o e' a parole
            // ("dal 23/12/2026 all'Epifania"). Non un giorno solo con il resto nel nome
            if (m.Groups["dal"].Success && !m.Groups["d2"].Success && !m.Groups["g2"].Success)
            {
                NonCapita(r, "comincia con \"dal\" ma manca la fine del periodo: scrivila come data, come " +
                             "dal 23/12/2026 al 06/01/2027");
                return;
            }

            Sospensione giorni = new Sospensione();
            giorni.Dal = dal;
            giorni.Al = al;
            giorni.Nome = nome;
            r.Giorni = giorni;
            // un numero nel nome che potrebbe essere un giorno fuori dal periodo: la
            // riga vale, ma va guardata ("07/12/2026 ponte 7-8" e' solo il 7). Anche
            // un giorno con il punto e senza anno ("07/12/2026 ponte, 8.12")
            foreach (Match n in NumeroNelNome.Matches(nome))
            {
                int g = int.Parse(n.Groups[1].Value, CultureInfo.InvariantCulture);
                if (g < 1 || g > 31 || GiornoDelPeriodo(g, dal, al)) continue;
                r.Avviso = AvvisoNumero;
                break;
            }
            if (r.Avviso == "" && GiorniColPunto(nome, true, dal, al)) r.Avviso = AvvisoNumero;
            // la fine di un periodo a parole in una riga di un giorno solo, o una
            // durata che non torna con le date: "23/12/2026 Vacanze fino
            // all'Epifania", "07/12/2026 ponte di 2 giorni", "07/12/2026 ponte 2gg"
            if (r.Avviso == "")
            {
                int durata = (al.Date - dal.Date).Days + 1;
                if (durata == 1 && FineNelNome.IsMatch(nome)) r.Avviso = AvvisoDurata;
                foreach (Match n in GiorniNelNome.Matches(nome))
                    if (int.Parse(n.Groups[1].Value, CultureInfo.InvariantCulture) != durata) r.Avviso = AvvisoDurata;
                // in lettere: "07/12/2026 ponte di due giorni"
                foreach (Match n in GiorniInLettere.Matches(nome))
                {
                    int i = Array.IndexOf(NumeriInLettere, n.Groups[1].Value.ToLowerInvariant());
                    if (i >= 0 && ValoriInLettere[i] != durata) r.Avviso = AvvisoDurata;
                }
                // due giorni della settimana in una riga di un giorno solo:
                // "22/02/2027 carnevale lunedi' e martedi'" e' solo il lunedi'
                if (durata == 1)
                {
                    List<string> settimana = new List<string>();
                    foreach (Match g in GiornoDellaSettimana.Matches(nome))
                    {
                        string quale = g.Value.Substring(0, 3).ToLowerInvariant();
                        if (!settimana.Contains(quale)) settimana.Add(quale);
                    }
                    if (settimana.Count >= 2) r.Avviso = AvvisoDurata;
                }
            }
            // un giorno solo che parla del confine di un periodo o di un giorno di
            // lezione: "23/12/2026 Vacanze natalizie" e' solo il 23, "14/09/2026
            // Inizio delle lezioni" un giorno di lezione
            if (r.Avviso == "" && dal.Date == al.Date && ConfineNelNome.IsMatch(nome)) r.Avviso = AvvisoConfine;
        }

        /// <summary>
        /// Vero se nel nome c'e' un giorno scritto con il punto e senza anno
        /// ("8.12"): un giorno da 1 a 31 di un mese da 1 a 12 che esiste, fuori
        /// dalle date della riga se fuoriSoltanto (nell'anno di dal o di al).
        /// </summary>
        static bool GiorniColPunto(string nome, bool fuoriSoltanto, DateTime dal, DateTime al)
        {
            foreach (Match n in GiornoColPunto.Matches(nome ?? ""))
            {
                int g = int.Parse(n.Groups[1].Value, CultureInfo.InvariantCulture);
                int mese = int.Parse(n.Groups[2].Value, CultureInfo.InvariantCulture);
                if (g < 1 || g > 31 || mese < 1 || mese > 12) continue;
                if (!fuoriSoltanto) return true;
                bool dentro = false;
                foreach (int anno in new int[] { dal.Year, al.Year })
                {
                    if (g > DateTime.DaysInMonth(anno, mese)) continue;
                    DateTime d = new DateTime(anno, mese, g);
                    if (d >= dal.Date && d <= al.Date) dentro = true;
                }
                if (!dentro) return true;
            }
            return false;
        }

        /// <summary>
        /// Le date di una riga, dalla forma che l'ha riconosciuta (DueDate,
        /// GiornoEData o GiorniAParole). False, con il perche', se una non esiste
        /// o se con "e" i due giorni non sono di seguito.
        /// </summary>
        static bool Date(Match m, int annoInizio, out DateTime dal, out DateTime al, out string perche)
        {
            dal = al = DateTime.MinValue;
            perche = "la data non esiste (giorno, mese o anno impossibili)";
            int g1, m1, a1, g2, m2, a2;
            if (m.Groups["d1"].Success)
            {
                // due date intere (la seconda puo' mancare): senza anno, quello
                // dell'altra data della riga, o quello dell'anno scolastico
                if (!Pezzi(m.Groups["d1"].Value, out g1, out m1, out a1)) return false;
                if (m.Groups["d2"].Success)
                {
                    if (!Pezzi(m.Groups["d2"].Value, out g2, out m2, out a2)) return false;
                    if (a1 == 0 && a2 != 0) a1 = (m1 * 100 + g1 <= m2 * 100 + g2) ? a2 : a2 - 1;
                    else if (a2 == 0 && a1 != 0) a2 = (m2 * 100 + g2 >= m1 * 100 + g1) ? a1 : a1 + 1;
                }
                else { g2 = g1; m2 = m1; a2 = a1; }
                if (a1 == 0) a1 = AnnoDelMese(m1, annoInizio);
                if (a2 == 0) a2 = AnnoDelMese(m2, annoInizio);
                return Giorno(g1, m1, a1, out dal) && Giorno(g2, m2, a2, out al);
            }
            if (m.Groups["d2"].Success)
            {
                // un giorno solo e poi la data intera: mese e anno sono quelli della data
                if (!Pezzi(m.Groups["d2"].Value, out g2, out m2, out a2)) return false;
                if (a2 == 0) a2 = AnnoDelMese(m2, annoInizio);
                g1 = int.Parse(m.Groups["g1"].Value, CultureInfo.InvariantCulture);
                if (!Giorno(g1, m2, a2, out dal) || !Giorno(g2, m2, a2, out al)) return false;
            }
            else
            {
                // a parole: il mese, e l'anno se c'e'
                m1 = Array.IndexOf(Mesi, m.Groups["mese"].Value.Substring(0, 3).ToLowerInvariant()) + 1;
                a1 = m.Groups["anno"].Success ? int.Parse(m.Groups["anno"].Value, CultureInfo.InvariantCulture)
                                              : AnnoDelMese(m1, annoInizio);
                g1 = int.Parse(m.Groups["g1"].Value, CultureInfo.InvariantCulture);
                g2 = m.Groups["g2"].Success ? int.Parse(m.Groups["g2"].Value, CultureInfo.InvariantCulture) : g1;
                if (!Giorno(g1, m1, a1, out dal) || !Giorno(g2, m1, a1, out al)) return false;
            }
            // "7 e 8": due giorni di seguito. Due giorni lontani non sono un periodo
            if (Regex.IsMatch(m.Groups["fra"].Value, @"^\s+e\s+$", RegexOptions.IgnoreCase) && al != dal.AddDays(1))
            {
                perche = "con \"e\" vanno due giorni di seguito (7 e 8/12/2026): due giorni lontani, su due righe";
                return false;
            }
            return true;
        }

        /// <summary>
        /// Giorno, mese e anno di una data scritta in cifre (aaaa-mm-gg, gg/mm/aaaa,
        /// gg/mm/aa, gg/mm, anche con i punti); anno 0 se non c'e'.
        /// </summary>
        static bool Pezzi(string s, out int giorno, out int mese, out int anno)
        {
            giorno = mese = anno = 0;
            Match iso = Regex.Match(s, @"^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$");
            if (iso.Success)
            {
                anno = int.Parse(iso.Groups[1].Value, CultureInfo.InvariantCulture);
                mese = int.Parse(iso.Groups[2].Value, CultureInfo.InvariantCulture);
                giorno = int.Parse(iso.Groups[3].Value, CultureInfo.InvariantCulture);
                return true;
            }
            string[] p = s.Split('/', '.');
            if (p.Length < 2) return false;
            giorno = int.Parse(p[0], CultureInfo.InvariantCulture);
            mese = int.Parse(p[1], CultureInfo.InvariantCulture);
            if (p.Length > 2) anno = (p[2].Length == 2) ? 2000 + int.Parse(p[2], CultureInfo.InvariantCulture)
                                                         : int.Parse(p[2], CultureInfo.InvariantCulture);
            return true;
        }

        /// <summary>L'anno di un mese scritto senza anno: da settembre a dicembre quello in cui comincia l'anno scolastico.</summary>
        static int AnnoDelMese(int mese, int annoInizio)
        {
            return (mese >= 9) ? annoInizio : annoInizio + 1;
        }

        static bool Giorno(int giorno, int mese, int anno, out DateTime d)
        {
            d = DateTime.MinValue;
            if (anno < 2000 || anno > 2100 || mese < 1 || mese > 12 || giorno < 1) return false;
            if (giorno > DateTime.DaysInMonth(anno, mese)) return false;
            d = new DateTime(anno, mese, giorno);
            return true;
        }

        /// <summary>Vero se uno dei giorni da dal ad al compresi e' il giorno g del suo mese.</summary>
        static bool GiornoDelPeriodo(int g, DateTime dal, DateTime al)
        {
            if ((al.Date - dal.Date).Days >= 31) return true;
            for (DateTime d = dal.Date; d <= al.Date; d = d.AddDays(1))
                if (d.Day == g) return true;
            return false;
        }

        /// <summary>
        /// Vero se il giorno scritto a parole (DataAParole) cade fra dal e al
        /// compresi: con l'anno, se c'e', o con quello di dal o di al.
        /// </summary>
        static bool FraLeDate(Match aParole, DateTime dal, DateTime al)
        {
            int giorno = int.Parse(aParole.Groups[1].Value, CultureInfo.InvariantCulture);
            int mese = Array.IndexOf(Mesi, aParole.Groups[2].Value.Substring(0, 3).ToLowerInvariant()) + 1;
            List<int> anni = new List<int>();
            if (aParole.Groups[3].Success) anni.Add(int.Parse(aParole.Groups[3].Value, CultureInfo.InvariantCulture));
            else { anni.Add(dal.Year); anni.Add(al.Year); }
            foreach (int anno in anni)
            {
                if (mese < 1 || anno < 1 || anno > 9999 || giorno < 1 || giorno > DateTime.DaysInMonth(anno, mese)) continue;
                DateTime d = new DateTime(anno, mese, giorno);
                if (d >= dal.Date && d <= al.Date) return true;
            }
            return false;
        }

        /// <summary>
        /// L'anno in cui comincia l'anno scolastico del periodo. Un periodo che
        /// comincia a luglio o ad agosto e' quello che parte a settembre: le
        /// lezioni finiscono a giugno, e chi prepara il calendario ad agosto
        /// pensa all'anno che arriva.
        /// </summary>
        public static int AnnoScolastico(DateTime inizioPeriodo)
        {
            return (inizioPeriodo.Month >= 7) ? inizioPeriodo.Year : inizioPeriodo.Year - 1;
        }

        /// <summary>"lun 07/12/2026"</summary>
        static string GiornoBreve(DateTime d)
        {
            return GiorniBrevi[(int)d.DayOfWeek] + " " + d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Come la pagina mostra una riga letta, sotto la casella: "riga 3: dal
        /// lun 07/12/2026 al lun 07/12/2026 (1 giorno) ponte 7-8   &lt;- nel
        /// motivo c'e' un numero: ...", oppure "riga 4: non capita: ...". Una
        /// riga che non tocca il periodo lo dice.
        /// </summary>
        public static string Descrivi(RigaLetta r, DateTime inizio, DateTime fine)
        {
            string testa = "riga " + r.Numero + ": ";
            if (r.Giorni == null) return testa + "non capita: " + r.Motivo;
            Sospensione s = r.Giorni;
            int giorni = (s.Al.Date - s.Dal.Date).Days + 1;
            string t = testa + "dal " + GiornoBreve(s.Dal) + " al " + GiornoBreve(s.Al) + " (" + giorni +
                       (giorni == 1 ? " giorno)" : " giorni)") + ((s.Nome ?? "") == "" ? "" : " " + s.Nome);
            List<string> guarda = new List<string>();
            if (r.Avviso != "") guarda.Add(r.Avviso);
            if (s.Al.Date < inizio.Date || s.Dal.Date > fine.Date) guarda.Add("fuori dal periodo: controlla l'anno");
            return (guarda.Count == 0) ? t : t + "   <- " + string.Join("; ", guarda.ToArray());
        }

        /// <summary>Vero se la riga va guardata: non capita, con un avviso, o fuori dal periodo.</summary>
        public static bool DaGuardare(RigaLetta r, DateTime inizio, DateTime fine)
        {
            if (r.Giorni == null || r.Avviso != "") return true;
            return r.Giorni.Al.Date < inizio.Date || r.Giorni.Dal.Date > fine.Date;
        }

        /// <summary>La riga come la scrive la pagina: "01/11/2026 Tutti i Santi" o "23/12/2026-06/01/2027 Natale".</summary>
        public static string Riga(Sospensione s)
        {
            string dal = s.Dal.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            string date = (s.Al.Date == s.Dal.Date) ? dal : dal + "-" + s.Al.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            return (s.Nome ?? "") == "" ? date : date + " " + s.Nome;
        }

        /// <summary>
        /// I giorni o periodi senza lezione che non toccano il periodo (finiscono
        /// prima dell'inizio o cominciano dopo la fine): di solito un anno
        /// sbagliato, o una riga ricopiata dall'anno prima.
        /// </summary>
        public static List<Sospensione> FuoriPeriodo(List<Sospensione> sospensioni, DateTime inizio, DateTime fine)
        {
            List<Sospensione> fuori = new List<Sospensione>();
            if (sospensioni == null) return fuori;
            foreach (Sospensione s in sospensioni)
                if (s.Al.Date < inizio.Date || s.Dal.Date > fine.Date) fuori.Add(s);
            return fuori;
        }

        /// <summary>Vero se il giorno cade in uno dei giorni o periodi senza lezione.</summary>
        public static bool Coperto(DateTime giorno, List<Sospensione> sospensioni)
        {
            if (sospensioni == null) return false;
            DateTime g = giorno.Date;
            foreach (Sospensione s in sospensioni)
                if (g >= s.Dal.Date && g <= s.Al.Date) return true;
            return false;
        }

        // ===================================================================
        //  LE FESTE NAZIONALI
        // ===================================================================

        /// <summary>
        /// Le feste nazionali che cadono nel periodo (estremi compresi), in
        /// ordine di data: Tutti i Santi, Immacolata, Natale, Santo Stefano,
        /// Capodanno, Epifania, Pasqua e Lunedi' dell'Angelo, 25 aprile, primo
        /// maggio, 2 giugno, e dal 2026 il 4 ottobre (San Francesco d'Assisi e
        /// Santa Caterina da Siena, legge 151/2025). Il patrono no: cambia da
        /// comune a comune. Pasqua o Pasquetta possono cadere il 25 aprile:
        /// allora quel giorno ha due feste.
        /// </summary>
        public static List<Sospensione> Festivita(DateTime inizio, DateTime fine)
        {
            List<Sospensione> fuori = new List<Sospensione>();
            for (int anno = inizio.Year; anno <= fine.Year; anno++)
            {
                DateTime pasqua = Pasqua(anno);
                List<Sospensione> dellAnno = new List<Sospensione>();
                dellAnno.Add(Festa(new DateTime(anno, 1, 1), "Capodanno"));
                dellAnno.Add(Festa(new DateTime(anno, 1, 6), "Epifania"));
                dellAnno.Add(Festa(pasqua, "Pasqua"));
                dellAnno.Add(Festa(pasqua.AddDays(1), "Lunedi' dell'Angelo"));
                dellAnno.Add(Festa(new DateTime(anno, 4, 25), "Festa della Liberazione"));
                dellAnno.Add(Festa(new DateTime(anno, 5, 1), "Festa del Lavoro"));
                dellAnno.Add(Festa(new DateTime(anno, 6, 2), "Festa della Repubblica"));
                if (anno >= 2026)
                    dellAnno.Add(Festa(new DateTime(anno, 10, 4), "San Francesco d'Assisi e Santa Caterina da Siena"));
                dellAnno.Add(Festa(new DateTime(anno, 11, 1), "Tutti i Santi"));
                dellAnno.Add(Festa(new DateTime(anno, 12, 8), "Immacolata"));
                dellAnno.Add(Festa(new DateTime(anno, 12, 25), "Natale"));
                dellAnno.Add(Festa(new DateTime(anno, 12, 26), "Santo Stefano"));
                // Pasquetta puo' venire dopo il 25 aprile: in ordine di data, e a
                // parita' nell'ordine dell'elenco (Pasqua prima della Liberazione)
                for (int i = 1; i < dellAnno.Count; i++)
                {
                    Sospensione x = dellAnno[i];
                    int j = i - 1;
                    while (j >= 0 && dellAnno[j].Dal > x.Dal) { dellAnno[j + 1] = dellAnno[j]; j--; }
                    dellAnno[j + 1] = x;
                }
                foreach (Sospensione f in dellAnno)
                    if (f.Dal >= inizio.Date && f.Dal <= fine.Date) fuori.Add(f);
            }
            return fuori;
        }

        static Sospensione Festa(DateTime giorno, string nome)
        {
            Sospensione s = new Sospensione();
            s.Dal = giorno;
            s.Al = giorno;
            s.Nome = nome;
            return s;
        }

        /// <summary>La domenica di Pasqua (calendario gregoriano, algoritmo di Gauss nella forma di Meeus).</summary>
        public static DateTime Pasqua(int anno)
        {
            int a = anno % 19, b = anno / 100, c = anno % 100;
            int d = b / 4, e = b % 4;
            int f = (b + 8) / 25, g = (b - f + 1) / 3;
            int h = (19 * a + b - d - g + 15) % 30;
            int i = c / 4, k = c % 4;
            int l = (32 + 2 * e + 2 * i - h - k) % 7;
            int m = (a + 11 * h + 22 * l) / 451;
            int mese = (h + l - 7 * m + 114) / 31;
            int giorno = ((h + l - 7 * m + 114) % 31) + 1;
            return new DateTime(anno, mese, giorno);
        }

        /// <summary>
        /// Il testo con in fondo, una per riga, le feste nazionali del periodo
        /// che nessuna riga copre gia'. Due feste nello stesso giorno (Pasqua
        /// il 25 aprile) fanno una riga sola, con i due nomi. Quante righe ha
        /// aggiunto lo dice aggiunte.
        /// </summary>
        public static string ConFeste(string testo, DateTime inizio, DateTime fine, out int aggiunte)
        {
            List<string> nonCapite;
            List<Sospensione> gia = Leggi(testo, inizio, out nonCapite);
            List<Sospensione> nuove = new List<Sospensione>();
            foreach (Sospensione f in Festivita(inizio, fine))
            {
                if (Coperto(f.Dal, gia)) continue;
                Sospensione stessoGiorno = null;
                foreach (Sospensione n in nuove) if (n.Dal == f.Dal) stessoGiorno = n;
                if (stessoGiorno != null) { stessoGiorno.Nome += " e " + f.Nome; continue; }
                nuove.Add(Festa(f.Dal, f.Nome));
            }
            aggiunte = nuove.Count;
            if (aggiunte == 0) return testo ?? "";
            StringBuilder righe = new StringBuilder();
            foreach (Sospensione n in nuove)
            {
                if (righe.Length > 0) righe.Append("\r\n");
                righe.Append(Riga(n));
            }
            string prima = (testo ?? "").TrimEnd();
            return (prima == "") ? righe.ToString() : prima + "\r\n" + righe.ToString();
        }

        // ===================================================================
        //  IL PIANO
        // ===================================================================

        /// <summary>
        /// Il piano di un docente: i blocchi della sua griglia, con il giorno
        /// della settimana di ogni colonna del tabellone.
        /// </summary>
        public static PianoCalendario PianoDelDocente(RisultatoOrario o, string docente, DateTime inizio,
                                                      DateTime fine, List<Sospensione> sospensioni)
        {
            return Piano(AnalisiOrario.Blocchi(o.GrigliaDocente(docente), o), o.IndiciGiorni, inizio, fine, sospensioni);
        }

        /// <summary>
        /// Per ogni blocco le date settimanali dal primo giorno utile alla
        /// fine, tolte quelle senza lezione, raggruppate in tratti di settimane
        /// consecutive: ogni tratto e' una serie. giorniColonne dice il giorno
        /// della settimana di ogni colonna (0 = lunedi'), come
        /// RisultatoOrario.IndiciGiorni. Lo stesso calcolo e' _orariPiano_ in
        /// Orari.gs.
        /// </summary>
        public static PianoCalendario Piano(List<BloccoOrario> blocchi, List<int> giorniColonne, DateTime inizio,
                                            DateTime fine, List<Sospensione> sospensioni)
        {
            PianoCalendario p = new PianoCalendario();
            foreach (BloccoOrario b in blocchi)
            {
                if (b.Giorno < 0 || b.Giorno >= giorniColonne.Count ||
                    giorniColonne[b.Giorno] < 0 || giorniColonne[b.Giorno] > 6) { p.BlocchiFuori++; continue; }
                DayOfWeek giorno = (DayOfWeek)((giorniColonne[b.Giorno] + 1) % 7);
                DateTime primo = inizio.Date;
                while (primo.DayOfWeek != giorno) primo = primo.AddDays(1);
                if (primo > fine.Date) { p.BlocchiFuori++; continue; }

                SerieCalendario aperta = null;
                for (DateTime t = primo; t <= fine.Date; t = t.AddDays(7))
                {
                    if (Coperto(t, sospensioni)) { p.Saltate++; aperta = null; continue; }
                    if (aperta == null)
                    {
                        aperta = new SerieCalendario();
                        aperta.Blocco = b;
                        aperta.Dal = t;
                        p.Serie.Add(aperta);
                    }
                    aperta.Al = t;
                    aperta.Lezioni++;
                    p.Lezioni++;
                }
            }
            return p;
        }
    }
}
