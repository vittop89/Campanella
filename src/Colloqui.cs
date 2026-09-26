// ===========================================================================
//  Colloqui.cs - i colloqui con le famiglie sul calendario (Orari, passo 4)
//
//  Il docente scrive i suoi colloqui, una riga per voce, o li importa da un
//  file (.csv o .xlsx, con le colonne data o giorno, dalle e alle o ora,
//  cosa, link):
//
//      ogni giovedi 10:10-11:10 Ricevimento https://meet.google.com/abc-defg-hij
//      dal 12/10/2026 al 22/05/2027 ogni giovedi 10:10-11:10 Ricevimento
//      15/12/2026 15:00-18:00 Colloqui generali https://meet.google.com/...
//      niente colloqui dal 14/12/2026 al 09/01/2027
//
//  Il link e' il primo https:// della riga (quello del Meet anche senza), il
//  resto e' il nome. Una voce per riga: una data, un altro giorno della
//  settimana o un'altra ora nel nome non si capiscono (le date del
//  ricevimento, "dal ... al ...", valgono anche dopo "ogni", ma non con
//  altro intorno, come un periodo senza colloqui), e una voce uguale a una
//  di sopra, o alla stessa ora, resta nella casella. Lo script
//  (Orari.gs e Calendario.gs: ORARI_4_calendario, ORARI_7_colloqui) mette il
//  ricevimento settimanale a tratti come le lezioni, senza i giorni senza
//  lezione e quelli senza colloqui, e le giornate come eventi singoli, con il
//  link come luogo. Le prenotazioni dei genitori restano nel registro
//  elettronico: qui c'e' solo quando e dove, e l'import rifiuta un file con
//  i nomi delle persone (un elenco di prenotazioni), con la colonna dei
//  docenti o delle materie, anche nell'intestazione su due righe, o con i
//  ricevimenti di piu' docenti (l'orario di ricevimento della scuola, con i
//  link dei colleghi).
//
//  Le date si leggono come quelle dei giorni senza lezione (Calendario.cs):
//  qui non c'e' un altro lettore di date. Il piano (quante serie e quanti
//  incontri) e' lo stesso di _orariPianoColloqui_ in Orari.gs, e
//  test\prova_orario.ps1 controlla che i due diano gli stessi numeri.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace Campanella
{
    enum TipoColloquio { Settimanale, Giornata, Sospensione }

    /// <summary>Una voce dei colloqui, come l'ha capita Colloqui.LeggiRighe.</summary>
    class Colloquio
    {
        public TipoColloquio Tipo;
        public int Giorno = -1;               // settimanale: 0 = lunedi' ... 6 = domenica (come RisultatoOrario.IndiciGiorni)
        public DateTime Dal, Al;              // la giornata (Dal = Al), il periodo senza colloqui, le date del ricevimento
        public bool ConDate;                  // settimanale: "dal ... al ..." scritto; se no vale il periodo del calendario
        public string Dalle = "", Alle = "";  // "hh:mm"; "" = non scritta
        public string Nome = "";
        public string Link = "";
    }

    /// <summary>
    /// Come e' stata letta una riga dei colloqui: la voce capita, oppure
    /// perche' non si capisce (Motivo), e gli avvisi di una riga capita ma da
    /// controllare. La pagina Orari le mostra tutte sotto la casella.
    /// </summary>
    class RigaColloquio
    {
        public int Numero;                    // la riga del testo, da 1
        public string Testo = "";
        public Colloquio Voce;                // null: non capita
        public string Motivo = "";
        public List<string> Avvisi = new List<string>();
        public int UgualeA;                   // uguale alla voce di quella riga (0: a nessuna)
        public int StessaOraDi;               // lo stesso giorno, a un'ora che si accavalla, della voce di quella riga (0: di nessuna)

        /// <summary>
        /// Va sul calendario (e in DatiOrari.gs): un periodo senza colloqui,
        /// o un colloquio con l'ora di inizio e quella di fine, dopo. Senza ora,
        /// o con la fine prima dell'inizio, resta solo nella casella; e anche
        /// una voce uguale a una di sopra, che sul calendario c'e' gia', o alla
        /// stessa ora di una di sopra (con un altro nome o un altro link: sul
        /// calendario sarebbero due colloqui insieme).
        /// </summary>
        public bool Buona
        {
            get
            {
                if (Voce == null || UgualeA > 0 || StessaOraDi > 0) return false;
                if (Voce.Tipo == TipoColloquio.Sospensione) return true;
                return Voce.Dalle != "" && Voce.Alle != "" && string.CompareOrdinal(Voce.Alle, Voce.Dalle) > 0;
            }
        }
    }

    /// <summary>Quanti colloqui vanno sul calendario: gli stessi conti di _orariPianoColloqui_ in Orari.gs.</summary>
    class PianoColloqui
    {
        public int Settimanali;     // ricevimenti settimanali
        public int Serie;           // le loro serie, una per tratto di settimane
        public int Singoli;         // giornate singole nel periodo
        public int Incontri;        // tutti gli incontri, ricevimento e giornate
        public int Saltati;         // incontri del ricevimento nei giorni senza lezione o senza colloqui
        public int Fuori;           // giornate fuori dal periodo
    }

    static class Colloqui
    {
        /// <summary>I nomi dei giorni, 0 = lunedi', come li scrive DatiOrari.gs (li legge _orariGiornoSettimana_).</summary>
        static readonly string[] NomiGiorni = { "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica" };
        static readonly string[] NomiGiorniDetti = { "lunedi'", "martedi'", "mercoledi'", "giovedi'", "venerdi'", "sabato",
                                                     "domenica" };
        static readonly string[] GiorniBrevi = { "lun", "mar", "mer", "gio", "ven", "sab", "dom" };

        /// <summary>Il nome di partenza del ricevimento settimanale.</summary>
        public const string NomeSettimanale = "Ricevimento";
        /// <summary>Il nome di partenza di una giornata di colloqui.</summary>
        public const string NomeGiornata = "Colloqui";

        // un giorno della settimana: "giovedi", "giovedi'", "giovedi’" (l'apostrofo di Word e dei Mac),
        // "giovedì", "gio", "gio."
        const string GiornoSettimana = @"(?<g>(?:luned|marted|mercoled|gioved|venerd)(?:i['’]|i|ì)|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)\.?(?!\p{L})";

        // il ricevimento: "ogni giovedi", "tutti i giovedi"
        static readonly Regex Ogni = new Regex(@"(?<!\p{L})(?:ogni|tutti\s+i)\s+" + GiornoSettimana,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        static readonly Regex OgniSenzaGiorno = new Regex(@"(?<!\p{L})(?:ogni|tutti\s+i)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // un giorno della settimana da solo, prima o dopo la data di una giornata
        static readonly Regex GiornoDavanti = new Regex(@"^" + GiornoSettimana + @"[\s,]*",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // i periodi senza colloqui: "niente colloqui", "nessun colloquio",
        // "colloqui sospesi", "sospensione dei colloqui", "ricevimento sospeso"
        static readonly Regex Sospesi = new Regex(
            @"^(?:(?:niente|nessun|nessuno|senza|no)\s+(?:colloqui|colloquio|ricevimento|ricevimenti)|" +
            @"(?:colloqui|ricevimento|ricevimenti)\s+sospes[oi]|sospensione\s+(?:dei\s+|del\s+)?(?:colloqui|ricevimento))(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // l'ora: "10:10-11:10", "10.10 - 11.10", "dalle 15 alle 18", "15-18", "ore 15-18", "alle 10:10-11:10"
        static readonly Regex DalleAlle = new Regex(
            @"(?<![0-9:.\p{L}])(?<prima>(?:dalle|alle|ore|h)\s*(?:ore\s*)?)?(?<h1>[0-9]{1,2})(?:[:.](?<m1>[0-9]{2}))?" +
            @"\s*(?:-|–|—|alle(?:\s+ore)?|fino\s+alle)\s*(?<h2>[0-9]{1,2})(?:[:.](?<m2>[0-9]{2}))?(?![0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // un'ora sola: "alle 15:00", "15:00", "ore 15"
        static readonly Regex OraSola = new Regex(
            @"(?<![0-9:.\p{L}])(?:(?:dalle|alle|ore|h)\s*(?<h1>[0-9]{1,2})(?:[:.](?<m1>[0-9]{2}))?|" +
            @"(?<h1>[0-9]{1,2})[:.](?<m1>[0-9]{2}))(?![0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // il link: il primo indirizzo https:// della riga (anche "Https://": lo
        // schema si riscrive in minuscolo, come lo vuole lo script)
        static readonly Regex Link = new Regex(@"https://[^\s<>""]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // il link del Meet senza https://, come lo mostrano Calendar, Meet e i fogli
        // ("meet.google.com/abc-defg-hij", anche con www.): gli si scrive davanti https://
        static readonly Regex MeetSenzaSchema = new Regex(@"(?<![\w./@:-])(?:www\.)?meet\.google\.com/",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        static readonly Regex DiMeet = new Regex(@"^https://meet\.google\.com/", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // un link senza la s: "http://meet.google.com/..."
        static readonly Regex LinkHttp = new Regex(@"(?<!\p{L})http://", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // --- una voce per riga: quello che nel nome dice un'altra voce ---------
        // le date del ricevimento scritte dopo "ogni" o nel nome: "dal 12/10/2026
        // al 22/05/2027", "a partire dal 12/10/2026" (da "dal" le legge Calendario.LeggiRiga)
        static readonly Regex DalNelNome = new Regex(@"(?<!\p{L})(?:a\s+partire\s+)?(?<dal>dal)\s+(?=[0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // prima o dopo quelle date, parole che dicono un periodo senza colloqui:
        // "(sospeso dal 14/12 al 09/01)", "(dal 14/12 al 09/01 sospeso)", "(scrutini
        // dal 25/01 al 05/02)", "(dal 22/12 al 06/01 vacanze)" non sono le date del ricevimento
        static readonly Regex SenzaPrimaDelPeriodo = new Regex(
            @"(?<!\p{L})(?:sospes[oiae]|sospensione|niente|nessun[oa]?|no|tranne|eccetto|escluso|esclusi|esclusa|" +
            @"escluse|salvo|pausa|vacanz\p{L}*|scrutin\p{L}*|chius[oaie]|chiusura)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // dopo le date del ricevimento, un cambio: "dal 12/10 al 18/12 poi online"
        static readonly Regex PoiDopoLeDate = new Regex(@"^\W*(?:e\s+)?(?:poi|dopo|quindi|in\s+seguito)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // la sola fine del ricevimento: "fino al 22/05/2027", "sino al 22 maggio"
        static readonly Regex FinoAlNelNome = new Regex(@"(?<!\p{L})(?:fino|sino)\s+(?:al|all['’])\s*(?=[0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // un giorno della settimana scritto per intero
        static readonly Regex GiornoNelNome = new Regex(
            @"(?<!\p{L})(?<g>(?:luned|marted|mercoled|gioved|venerd)(?:i['’]|i|ì)|sabato|domenica)(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // o abbreviato, da solo: "ogni gio 10-11 e ven 9-10"
        static readonly Regex GiornoBreveNelNome = new Regex(@"(?<!\p{L})(?<g>lun|mar|mer|gio|ven|sab|dom)\.?(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // un'altra ora: "9:10", "16.10", "alle 18", "ore 9"
        static readonly Regex OraNelNome = new Regex(
            @"(?<![0-9.,:/])(?:[01]?[0-9]|2[0-3])[:.][0-5][0-9](?![0-9])|(?<!\p{L})(?:dalle|alle|ore|h)\s*[0-9]{1,2}(?![0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // un ordinale: "1°", "3ª", "primo", "terza", "ultimo"
        const string Ordinale = @"(?:[1-5]\s*[°ºª^]|prim[oa]|second[oa]|terz[oa]|quart[oa]|quint[oa]|ultim[oa])";
        // un giorno della settimana, anche al plurale ("ogni due giovedi'", "sabati", "domeniche")
        const string GiorniDellaSettimana = @"(?:(?:luned|marted|mercoled|gioved|venerd)(?:i['’]|i|ì)|sabat[oi]|domenic(?:a|he))";
        // il numero di una cadenza: "ogni 15", "ogni 15/20", "ogni quindici", "ogni altra"
        const string NumeroDellaCadenza = @"(?:[0-9]+(?:\s*[-/]\s*[0-9]+)?|due|tre|quattro|cinque|sei|sette|otto|nove|" +
                                          @"dieci|quattordici|quindici|venti|trenta|altr[oa])";
        // prima di un ordinale e della settimana, un inizio o una fine: "dalla terza
        // settimana", "fino alla quarta settimana" sono un periodo, non una cadenza
        const string DaOFinoA = @"(?:dall(?:[ao]|['’])?|dal|a\s+partire\s+dall(?:[ao]|['’])?|dopo\s+(?:la|il|l['’])|" +
                                @"(?:fino|sino)\s+(?:all(?:[ao]|['’])?|al)|entro\s+(?:la|il|l['’]))";
        // una cadenza o un'eccezione del ricevimento: sul calendario va ogni settimana.
        // Anche il mese ("una volta al mese", "di ogni mese"), gli ordinali ("il
        // primo e il terzo", "1° e 3° giovedi'", "primo giovedi'", "1ª e 3ª
        // settimana"), "ogni due giovedi'", "ogni 15 gg", "bimensile"
        static readonly Regex CadenzaNelNome = new Regex(
            @"(?<!\p{L})(?:altern[eia]|alternat[eia]|tranne|eccetto|escluso|esclusi|esclusa|escluse|quindicinal\p{L}*|" +
            @"mensil\p{L}*|bimensil\p{L}*|bisettimanal\p{L}*|mes[ei]|a\s+settimane|" +
            @"ogni\s+" + NumeroDellaCadenza + @"\s+(?:giorni|gg|settimane|settimana|" + GiorniDellaSettimana + @")|" +
            Ordinale + @"\s*(?:,|e|ed)\s*(?:il\s+|la\s+|l['’]\s*)?" + Ordinale + "|" +
            @"(?<!" + DaOFinoA + @"\s*)" + Ordinale + @"\s+(?:settiman\p{L}*|" + GiorniDellaSettimana + @")|" +
            @"pari|dispari|una\s+(?:settimana\s+)?s[iì]\s+e\s+una\s+no|settimana\s+s[iì]\W+(?:e\s+)?(?:una|settimana)\s+no|" +
            @"sospes[oiae]|sospensione|vacanz\p{L}*|scrutin\p{L}*)(?![\p{L}°ºª])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // un periodo scritto a parole nel nome di un ricevimento senza date: sul
        // calendario va per tutto il periodo ("fino a maggio", "da ottobre", "primo
        // quadrimestre", "II periodo", "dopo Natale", "dalla terza settimana")
        static readonly Regex PeriodoNelNome = new Regex(
            @"(?<!\p{L})(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|" +
            @"dicembre|quadrimestr\p{L}*|trimestr\p{L}*|pentamestr\p{L}*|semestr\p{L}*|(?:fino|sino)\s+a(?:l|lla|lle)?|" +
            @"(?:I|II|III|IV|" + Ordinale + @")\s+periodo|natal\p{L}*|pasqu\p{L}*|carneval\p{L}*|" +
            DaOFinoA + @"\s*" + Ordinale + @"\s+(?:settiman\p{L}*|" + GiorniDellaSettimana + @"))(?!\p{L})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        /// <summary>L'avviso di un link che non e' di Google Meet: vale lo stesso, ma va guardato.</summary>
        public const string AvvisoLink = "il link non e' di Google Meet: controlla che sia quello giusto";
        /// <summary>L'avviso di un colloquio senza ora: resta nella casella, sul calendario no.</summary>
        public const string AvvisoSenzaOra = "senza ora: sul calendario non va finche' non scrivi l'ora, come 15:00-18:00";
        /// <summary>L'avviso di un colloquio con la sola ora di inizio.</summary>
        public const string AvvisoSenzaFine = "c'e' solo l'ora di inizio: scrivi anche la fine, come 15:00-18:00; " +
                                              "cosi' sul calendario non va";
        /// <summary>L'avviso di un colloquio che finisce prima di cominciare.</summary>
        public const string AvvisoFinePrima = "l'ora di fine viene prima di quella di inizio: sul calendario non va";

        // ===================================================================
        //  LE RIGHE SCRITTE DAL DOCENTE
        // ===================================================================

        /// <summary>
        /// Le righe dei colloqui, come sono state lette. Le righe vuote e quelle
        /// che cominciano con # non contano. inizioPeriodo da' l'anno alle date
        /// scritte senza (come per i giorni senza lezione); giorniOrario (0 =
        /// lunedi', RisultatoOrario.IndiciGiorni) i giorni in cui c'e' lezione:
        /// un colloquio in un altro giorno ha un avviso. Senza orario (null o
        /// vuoto), nessun avviso sui giorni. Un colloquio uguale a uno di una
        /// riga di sopra (lo stesso file importato due volte) ha un avviso, e
        /// sul calendario non va: c'e' gia'. Nemmeno uno alla stessa ora di uno
        /// di sopra, anche solo in parte, con un altro nome o un altro link (una
        /// riga importata e corretta, e il file importato di nuovo; il
        /// ricevimento scritto a mano e poi importato con il link): lo stesso
        /// giorno della settimana nelle stesse settimane, o la stessa data.
        /// </summary>
        public static List<RigaColloquio> LeggiRighe(string testo, DateTime inizioPeriodo, List<int> giorniOrario)
        {
            List<RigaColloquio> fuori = new List<RigaColloquio>();
            string[] righe = Calendario.Righe(testo);
            for (int i = 0; i < righe.Length; i++)
            {
                string riga = righe[i].Trim();
                if (riga == "" || riga.StartsWith("#")) continue;
                RigaColloquio r = new RigaColloquio();
                r.Numero = i + 1;
                r.Testo = riga;
                LeggiUna(riga, inizioPeriodo, giorniOrario, r);
                // uguale a una di sopra che va sul calendario: sul calendario comparirebbe due volte
                if (r.Buona && r.Voce.Tipo != TipoColloquio.Sospensione)
                {
                    foreach (RigaColloquio prima in fuori)
                    {
                        if (!prima.Buona || !Uguali(prima.Voce, r.Voce)) continue;
                        r.UgualeA = prima.Numero;
                        r.Avvisi.Add("uguale alla riga " + prima.Numero + ": sul calendario va una volta sola");
                        break;
                    }
                }
                // alla stessa ora di una di sopra: sul calendario sarebbero due colloqui insieme
                if (r.Buona && r.Voce.Tipo != TipoColloquio.Sospensione)
                {
                    foreach (RigaColloquio prima in fuori)
                    {
                        if (!prima.Buona || !AllaStessaOra(prima.Voce, r.Voce)) continue;
                        r.StessaOraDi = prima.Numero;
                        r.Avvisi.Add((r.Voce.Tipo == TipoColloquio.Settimanale ? "stesso giorno" : "stessa data") +
                                     " e stessa ora della riga " + prima.Numero + " (anche solo in parte): sul calendario " +
                                     "va solo quella; tieni la riga giusta e togli l'altra");
                        break;
                    }
                }
                fuori.Add(r);
            }
            return fuori;
        }

        /// <summary>
        /// Due colloqui dello stesso tipo alla stessa ora, anche solo in parte:
        /// due ricevimenti lo stesso giorno della settimana, con le date che si
        /// toccano (senza date valgono per tutto il periodo), o due giornate la
        /// stessa data. Uno che comincia quando l'altro finisce no.
        /// </summary>
        static bool AllaStessaOra(Colloquio a, Colloquio b)
        {
            if (a.Tipo != b.Tipo || a.Tipo == TipoColloquio.Sospensione) return false;
            if (a.Dalle == "" || a.Alle == "" || b.Dalle == "" || b.Alle == "") return false;
            if (string.CompareOrdinal(a.Dalle, b.Alle) >= 0 || string.CompareOrdinal(b.Dalle, a.Alle) >= 0) return false;
            if (a.Tipo == TipoColloquio.Giornata) return a.Dal.Date == b.Dal.Date;
            if (a.Giorno != b.Giorno) return false;
            return DalDi(a) <= AlDi(b) && DalDi(b) <= AlDi(a);
        }

        /// <summary>Le date di un ricevimento: le sue, o senza date tutte.</summary>
        static DateTime DalDi(Colloquio x) { return x.ConDate ? x.Dal.Date : DateTime.MinValue; }
        static DateTime AlDi(Colloquio x) { return x.ConDate ? x.Al.Date : DateTime.MaxValue; }

        /// <summary>Due colloqui uguali: lo stesso giorno o le stesse date, le stesse ore, lo stesso nome e lo stesso link.</summary>
        static bool Uguali(Colloquio a, Colloquio b)
        {
            if (a.Tipo != b.Tipo || a.Dalle != b.Dalle || a.Alle != b.Alle || a.ConDate != b.ConDate) return false;
            if (!string.Equals(a.Nome, b.Nome, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(a.Link, b.Link, StringComparison.Ordinal)) return false;
            if (a.Tipo == TipoColloquio.Settimanale && a.Giorno != b.Giorno) return false;
            if (a.Tipo == TipoColloquio.Giornata || a.ConDate) return a.Dal.Date == b.Dal.Date && a.Al.Date == b.Al.Date;
            return true;
        }

        /// <summary>Vero se il testo ha almeno un colloquio che va sul calendario (e il loro colore serve).</summary>
        public static bool CeNe(string testo, DateTime inizioPeriodo)
        {
            foreach (RigaColloquio r in LeggiRighe(testo, inizioPeriodo, null))
                if (r.Buona && r.Voce.Tipo != TipoColloquio.Sospensione) return true;
            return false;
        }

        static void NonCapita(RigaColloquio r, string motivo)
        {
            r.Voce = null;
            r.Motivo = motivo;
            r.Avvisi.Clear();
        }

        /// <summary>Legge una riga non vuota e la scrive in r.</summary>
        static void LeggiUna(string riga, DateTime inizioPeriodo, List<int> giorniOrario, RigaColloquio r)
        {
            // un punto elenco copiato da una circolare
            string s = Regex.Replace(riga, @"^[-*•]\s+", "");
            // il link del Meet senza https://: diventa un link, e non finisce nel nome
            s = MeetSenzaSchema.Replace(s, "https://meet.google.com/");
            // il link: il primo https:// della riga (senza la punteggiatura che lo segue)
            string link = "";
            Match ml = Link.Match(s);
            if (ml.Success)
            {
                link = ml.Value.TrimEnd('.', ',', ';', ':', '!', '?', ')', ']', '}', '>', '\'');
                s = (s.Substring(0, ml.Index) + " " + s.Substring(ml.Index + link.Length)).Trim();
                // "Https://...": lo schema in minuscolo, come lo vuole lo script
                link = "https://" + link.Substring("https://".Length);
            }
            // un secondo link, o uno senza la s, finirebbe nel nome
            if (Link.IsMatch(s))
            {
                NonCapita(r, "c'e' piu' di un link: una voce per riga, ognuna con il suo");
                return;
            }
            if (LinkHttp.IsMatch(s))
            {
                NonCapita(r, "il link comincia con http://: scrivilo con https://, come https://meet.google.com/abc-defg-hij");
                return;
            }

            // un periodo senza colloqui: le date come i giorni senza lezione
            Match ms = Sospesi.Match(s);
            if (ms.Success)
            {
                string resto = Regex.Replace(s.Substring(ms.Length), @"^[\s:,;–—-]+", "");
                resto = Regex.Replace(resto, @"^(?:per\s+)?(?:il|i|nel|nei|in)\s+(?=[0-9])", "",
                                      RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
                if (resto == "")
                {
                    NonCapita(r, "manca quando: scrivi per esempio niente colloqui dal 14/12/2026 al 09/01/2027");
                    return;
                }
                RigaLetta p = Calendario.LeggiRiga(resto, inizioPeriodo);
                if (p.Giorni == null) { NonCapita(r, p.Motivo); return; }
                Colloquio x = new Colloquio();
                x.Tipo = TipoColloquio.Sospensione;
                x.Dal = p.Giorni.Dal;
                x.Al = p.Giorni.Al;
                x.Nome = p.Giorni.Nome;
                r.Voce = x;
                if (p.Avviso != "") r.Avvisi.Add(p.Avviso);
                return;
            }

            // il ricevimento di ogni settimana, anche con le sue date davanti
            Match mo = Ogni.Match(s);
            if (mo.Success)
            {
                Colloquio w = new Colloquio();
                w.Tipo = TipoColloquio.Settimanale;
                w.Giorno = IndiceGiorno(mo.Groups["g"].Value);
                string prima = s.Substring(0, mo.Index).Trim();
                string nomeDavanti = "";
                if (prima != "")
                {
                    if (Regex.IsMatch(prima, @"^(?:dal\s|[0-9])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
                    {
                        RigaLetta p = Calendario.LeggiRiga(prima, inizioPeriodo);
                        if (p.Giorni == null)
                        {
                            NonCapita(r, "le date del ricevimento non si capiscono: " + p.Motivo);
                            return;
                        }
                        if (p.Giorni.Nome != "" || p.Giorni.Al.Date == p.Giorni.Dal.Date)
                        {
                            NonCapita(r, "prima di \"ogni\" vanno le date del ricevimento, come dal 12/10/2026 al 22/05/2027");
                            return;
                        }
                        w.ConDate = true;
                        w.Dal = p.Giorni.Dal;
                        w.Al = p.Giorni.Al;
                    }
                    else nomeDavanti = prima;       // "Ricevimento ogni giovedi ..."
                }
                string motivo;
                if (!OreENome(nomeDavanti + " " + s.Substring(mo.Index + mo.Length), w, r, out motivo) ||
                    !DateDopo(w, inizioPeriodo, out motivo))
                {
                    NonCapita(r, motivo);
                    return;
                }
                motivo = AltraVoceNelNome(w);
                if (motivo != "")
                {
                    NonCapita(r, motivo);
                    return;
                }
                if (w.Nome == "") w.Nome = NomeSettimanale;
                w.Link = link;
                r.Voce = w;
                if (giorniOrario != null && giorniOrario.Count > 0 && !giorniOrario.Contains(w.Giorno))
                    r.Avvisi.Add((w.Giorno == 6 ? "la " : "il ") + NomiGiorniDetti[w.Giorno] + " non e' fra i giorni dell'orario");
                if (link != "" && !DiMeet.IsMatch(link)) r.Avvisi.Add(AvvisoLink);
                if (CadenzaNelNome.IsMatch(w.Nome)) r.Avvisi.Add(AvvisoCadenza);
                else if (!w.ConDate && PeriodoNelNome.IsMatch(w.Nome)) r.Avvisi.Add(AvvisoPeriodo);
                return;
            }
            // "ogni" senza il giorno; ma non nel nome di una giornata ("15/12/2026
            // 15:00-18:00 Colloqui generali, ogni docente nella sua aula")
            if (OgniSenzaGiorno.IsMatch(s) && !ComincaConUnaData(s, inizioPeriodo))
            {
                NonCapita(r, "dopo \"ogni\" ci vuole il giorno della settimana, come ogni giovedi 10:10-11:10");
                return;
            }

            // una giornata: la data (con il giorno della settimana davanti o dopo, se c'e')
            string t = s;
            int giornoScritto = -1;
            Match mg = GiornoDavanti.Match(t);
            if (mg.Success) { giornoScritto = IndiceGiorno(mg.Groups["g"].Value); t = t.Substring(mg.Length); }
            DateTime data;
            int lunghezza;
            string perche;
            if (!Calendario.DataAllInizio(t, inizioPeriodo, out data, out lunghezza, out perche))
            {
                NonCapita(r, perche != "" ? perche
                    : "non capisco: comincia con \"ogni\" e il giorno (ogni giovedi 10:10-11:10), con una data " +
                      "(15/12/2026 15:00-18:00) o con \"niente colloqui\" (niente colloqui dal 14/12/2026 al 09/01/2027)");
                return;
            }
            string dopo = Regex.Replace(t.Substring(lunghezza), @"^[\s,;:–—-]+", "");
            if (giornoScritto < 0)
            {
                Match md = GiornoDavanti.Match(dopo);
                if (md.Success) { giornoScritto = IndiceGiorno(md.Groups["g"].Value); dopo = dopo.Substring(md.Length); }
            }
            // un'altra data dopo la prima: due giornate su una riga, o un periodo.
            // Con il punto solo se ha l'anno: "16.10-18.10" sono le ore
            DateTime altra;
            int l2;
            string p2;
            string dopoLaData = Regex.Replace(dopo, @"^(?:e|al|fino\s+al)\s+", "",
                                              RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (Calendario.DataAllInizio(dopoLaData, inizioPeriodo, out altra, out l2, out p2) &&
                !Regex.IsMatch(dopoLaData.Substring(0, l2), @"^[0-9]{1,2}\.[0-9]{1,2}$"))
            {
                NonCapita(r, "una giornata per riga: per un ricevimento con le sue date scrivi dal 12/10/2026 al " +
                             "22/05/2027 ogni giovedi 10:10-11:10");
                return;
            }
            Colloquio u = new Colloquio();
            u.Tipo = TipoColloquio.Giornata;
            u.Dal = data;
            u.Al = data;
            string motivoOre;
            if (!OreENome(dopo, u, r, out motivoOre))
            {
                NonCapita(r, motivoOre);
                return;
            }
            motivoOre = AltraVoceNelNome(u);
            if (motivoOre != "")
            {
                NonCapita(r, motivoOre);
                return;
            }
            if (u.Nome == "") u.Nome = NomeGiornata;
            u.Link = link;
            r.Voce = u;
            int suo = ((int)data.DayOfWeek + 6) % 7;
            if (giornoScritto >= 0 && giornoScritto != suo)
                r.Avvisi.Add("il " + data.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) + " e' " + NomiGiorniDetti[suo] +
                             ", non " + NomiGiorniDetti[giornoScritto]);
            else if (giorniOrario != null && giorniOrario.Count > 0 && !giorniOrario.Contains(suo))
                r.Avvisi.Add("cade di " + NomiGiorniDetti[suo] + ", che non e' fra i giorni dell'orario");
            if (link != "" && !DiMeet.IsMatch(link)) r.Avvisi.Add(AvvisoLink);
        }

        /// <summary>Vero se il testo comincia con una data, anche con il giorno della settimana davanti o impossibile.</summary>
        static bool ComincaConUnaData(string s, DateTime inizioPeriodo)
        {
            string t = s;
            Match mg = GiornoDavanti.Match(t);
            if (mg.Success) t = t.Substring(mg.Length);
            DateTime data;
            int lunghezza;
            string perche;
            return Calendario.DataAllInizio(t, inizioPeriodo, out data, out lunghezza, out perche) || perche != "";
        }

        /// <summary>
        /// L'ora e il nome di un colloquio, dal testo che resta (senza la data e
        /// il link). L'ora e' la prima "dalle-alle" all'inizio, o scritta per
        /// esteso (con i minuti o con "dalle") piu' avanti; il resto e' il nome.
        /// Senza ora, con la sola ora di inizio o con la fine prima dell'inizio
        /// la riga resta capita, con un avviso; anche con un'ora di notte (prima
        /// delle 7, dopo le 21: "dalle 3 alle 6" per il pomeriggio). False, con
        /// il motivo, se un'ora non esiste (25:00).
        /// </summary>
        static bool OreENome(string testo, Colloquio x, RigaColloquio r, out string motivo)
        {
            motivo = "";
            string t = (testo ?? "").Trim();
            Match scelta = null;
            foreach (Match m in DalleAlle.Matches(t))
            {
                bool allInizio = Regex.IsMatch(t.Substring(0, m.Index), @"^[\s,;:–—-]*$");
                if (allInizio || m.Groups["m1"].Success || m.Groups["prima"].Success) { scelta = m; break; }
            }
            if (scelta != null)
            {
                string dalle, alle;
                if (!Ora(scelta.Groups["h1"].Value, scelta.Groups["m1"].Value, out dalle) ||
                    !Ora(scelta.Groups["h2"].Value, scelta.Groups["m2"].Value, out alle))
                {
                    motivo = "l'ora non esiste: scrivila come 15:00-18:00";
                    return false;
                }
                x.Dalle = dalle;
                x.Alle = alle;
                t = t.Remove(scelta.Index, scelta.Length);
                if (string.CompareOrdinal(alle, dalle) <= 0) r.Avvisi.Add(AvvisoFinePrima);
            }
            else
            {
                Match sola = OraSola.Match(t);
                string dalle;
                if (sola.Success && Ora(sola.Groups["h1"].Value, sola.Groups["m1"].Value, out dalle))
                {
                    x.Dalle = dalle;
                    t = t.Remove(sola.Index, sola.Length);
                    r.Avvisi.Add(AvvisoSenzaFine);
                }
                else r.Avvisi.Add(AvvisoSenzaOra);
            }
            // "dalle 3 alle 6" detto per il pomeriggio: sul calendario andrebbe di notte
            if (x.Dalle != "" && (string.CompareOrdinal(x.Dalle, PrimaOra) < 0 ||
                                  (x.Alle != "" && string.CompareOrdinal(x.Alle, UltimaOra) > 0)))
                r.Avvisi.Add(AvvisoNotte);
            x.Nome = Pulito(t);
            return true;
        }

        // le ore di un colloquio: prima e dopo queste, un avviso (AvvisoNotte)
        const string PrimaOra = "07:00", UltimaOra = "21:00";

        /// <summary>L'avviso di un colloquio di notte, o finito tardi: di solito le ore del pomeriggio scritte da 1 a 12.</summary>
        public const string AvvisoNotte = "l'ora e' di notte o a tarda sera: se e' il pomeriggio scrivila come " +
                                          "15:00-18:00, non 3-6";

        /// <summary>
        /// Le date di un ricevimento scritte dopo "ogni" o nel nome, come
        /// nelle circolari: "ogni giovedi 10:10-11:10 Ricevimento dal 12/10/2026
        /// al 22/05/2027", "Ricevimento dal 12/10/2026 al 22/05/2027 ogni giovedi
        /// 10:10-11:10": dal nome passano alle date (ConDate), lette come quelle
        /// scritte davanti. Valgono solo se sono le date e basta: scritte subito
        /// dopo "ogni" e le ore, con il nome dopo ("ogni giovedi dal 12/10/2026
        /// al 22/05/2027 10:10-11:10 Ricevimento"), oppure in fondo al nome, anche
        /// fra parentesi, senza niente dopo. False, con il motivo, se non si
        /// capiscono, se sono scritte due volte, se c'e' solo l'inizio ("a
        /// partire dal"), se prima o dopo c'e' un periodo senza colloqui
        /// ("sospeso dal ... al ...", "(dal 14/12 al 09/01 sospeso)", "(scrutini
        /// dal ... al ...)") o se dopo c'e' altro ("in presenza dal 12/10 al
        /// 18/12 poi online"): sul calendario il ricevimento andrebbe solo in
        /// quelle settimane.
        /// </summary>
        static bool DateDopo(Colloquio w, DateTime inizioPeriodo, out string motivo)
        {
            motivo = "";
            Match md = DalNelNome.Match(w.Nome);
            if (!md.Success) return true;
            string prima = w.Nome.Substring(0, md.Index);
            // le parole di un periodo senza colloqui, prima delle date o in quello che segue
            if (SenzaPrimaDelPeriodo.IsMatch(prima) || SenzaPrimaDelPeriodo.IsMatch(w.Nome.Substring(md.Index)))
            {
                motivo = "nel nome c'e' un periodo senza colloqui: scrivilo su una riga sua, come niente colloqui dal " +
                         "14/12/2026 al 09/01/2027";
                return false;
            }
            if (w.ConDate)
            {
                motivo = "le date del ricevimento sono scritte due volte: scrivile una volta sola, come dal 12/10/2026 al " +
                         "22/05/2027 ogni giovedi 10:10-11:10";
                return false;
            }
            RigaLetta p = Calendario.LeggiRiga(w.Nome.Substring(md.Groups["dal"].Index), inizioPeriodo);
            if (p.Giorni == null)
            {
                // "a partire dal 12/10/2026", "dal 12 ottobre al 22 maggio"
                motivo = "le date del ricevimento non si capiscono: scrivile tutte e due in cifre, come dal 12/10/2026 " +
                         "al 22/05/2027 ogni giovedi 10:10-11:10";
                return false;
            }
            if (p.Giorni.Al.Date == p.Giorni.Dal.Date)
            {
                motivo = "il ricevimento va da una data a un'altra, come dal 12/10/2026 al 22/05/2027 ogni giovedi " +
                         "10:10-11:10; una giornata sola si scrive 15/12/2026 15:00-18:00";
                return false;
            }
            string dopo = p.Giorni.Nome;
            // una parentesi aperta prima delle date, con dentro altre parole: "Ricevimento (in presenza dal ..."
            int aperta = prima.LastIndexOf('(');
            bool dentro = aperta >= 0 && aperta > prima.LastIndexOf(')') && prima.Substring(aperta + 1).Trim() != "";
            // il nome prima delle date, senza la parentesi che le apre: "Ricevimento (dal ... al ...)"
            string nomePrima = Pulito(Regex.Replace(prima, @"[(\[]\s*$", ""));
            // con il nome davanti, dopo le date non resta niente; con le date subito
            // dopo "ogni" e le ore, dopo c'e' il nome. Mai un cambio ("poi online")
            if (dentro || PoiDopoLeDate.IsMatch(dopo) || (nomePrima != "" && Pulito(dopo) != ""))
            {
                motivo = "nel nome, con le date, c'e' altro: le date del ricevimento scrivile davanti, come dal " +
                         "12/10/2026 al 22/05/2027 ogni giovedi 10:10-11:10 Ricevimento, e i periodi senza colloqui " +
                         "su una riga loro, come niente colloqui dal 14/12/2026 al 09/01/2027";
                return false;
            }
            w.ConDate = true;
            w.Dal = p.Giorni.Dal;
            w.Al = p.Giorni.Al;
            w.Nome = Pulito(nomePrima + " " + dopo);
            return true;
        }

        /// <summary>L'avviso di un ricevimento con una cadenza o un'eccezione nel nome.</summary>
        public const string AvvisoCadenza = "nel nome c'e' una cadenza o un'eccezione (settimane alterne, tranne...): sul " +
                                            "calendario il ricevimento va ogni settimana; i giorni senza colloqui scrivili " +
                                            "su una riga loro, come niente colloqui il 24/12/2026";
        /// <summary>L'avviso di un ricevimento senza date con un periodo a parole nel nome ("fino a maggio").</summary>
        public const string AvvisoPeriodo = "nel nome c'e' un periodo (fino a maggio, primo quadrimestre...): sul " +
                                            "calendario il ricevimento va per tutto il periodo; scrivi le sue date " +
                                            "davanti, come dal 12/10/2026 al 22/05/2027 ogni giovedi 10:10-11:10";

        /// <summary>
        /// Nel nome di un colloquio (x.Nome, senza le ore e il link) quello che
        /// dice un'altra voce: una data, "fino al", un altro giorno della
        /// settimana, un'altra ora. Il motivo per cui la riga non si capisce, o
        /// "". Una voce per riga: sul calendario il resto finirebbe nel titolo.
        /// </summary>
        static string AltraVoceNelNome(Colloquio x)
        {
            bool settimanale = (x.Tipo == TipoColloquio.Settimanale);
            string nome = x.Nome ?? "";
            if (settimanale && FinoAlNelNome.IsMatch(nome))
                return "c'e' solo la fine del ricevimento: scrivi le due date, come dal 12/10/2026 al 22/05/2027 ogni " +
                       "giovedi 10:10-11:10";
            if (Calendario.CeUnaData(nome))
                return settimanale
                    ? "nel nome c'e' una data: le date del ricevimento scrivile come dal 12/10/2026 al 22/05/2027 ogni " +
                      "giovedi 10:10-11:10, e un giorno senza colloqui su una riga sua (niente colloqui il 24/12/2026)"
                    : "nel nome c'e' un'altra data: una giornata per riga, come 15/12/2026 15:00-18:00 Colloqui " +
                      "generali e sotto 16/12/2026 15:00-18:00 Colloqui generali";
            if (settimanale)
            {
                // per intero o abbreviato ("ogni gio 10-11 e ven 9-10")
                List<Match> giorni = new List<Match>();
                foreach (Match g in GiornoNelNome.Matches(nome)) giorni.Add(g);
                foreach (Match g in GiornoBreveNelNome.Matches(nome)) giorni.Add(g);
                foreach (Match g in giorni)
                {
                    if (IndiceGiorno(g.Groups["g"].Value) == x.Giorno) continue;
                    return "nel nome c'e' un altro giorno della settimana: una voce per riga, come ogni giovedi " +
                           "10:10-11:10 Ricevimento e sotto ogni venerdi 09:10-10:10 Ricevimento";
                }
            }
            // un'altra ora, anche una seconda fascia senza minuti ("ogni giovedi 10-11 e 12-13")
            if (OraNelNome.IsMatch(nome) || (x.Dalle != "" && AltraFascia(nome)))
                return "nel nome c'e' un'altra ora: una voce per riga, con le ore scritte come 15:00-18:00";
            return "";
        }

        /// <summary>Vero se nel testo c'e' una fascia "dalle-alle" con due ore che esistono ("12-13", non "26-27").</summary>
        static bool AltraFascia(string testo)
        {
            foreach (Match m in DalleAlle.Matches(testo ?? ""))
            {
                string dalle, alle;
                if (Ora(m.Groups["h1"].Value, m.Groups["m1"].Value, out dalle) &&
                    Ora(m.Groups["h2"].Value, m.Groups["m2"].Value, out alle)) return true;
            }
            return false;
        }

        /// <summary>"15" e "" -> "15:00", "9" e "05" -> "09:05"; false se l'ora non esiste.</summary>
        static bool Ora(string h, string m, out string hhmm)
        {
            hhmm = "";
            int ore, minuti = 0;
            if (!int.TryParse(h, NumberStyles.None, CultureInfo.InvariantCulture, out ore)) return false;
            if (m != "" && !int.TryParse(m, NumberStyles.None, CultureInfo.InvariantCulture, out minuti)) return false;
            if (ore > 23 || minuti > 59) return false;
            hhmm = ore.ToString("00", CultureInfo.InvariantCulture) + ":" + minuti.ToString("00", CultureInfo.InvariantCulture);
            return true;
        }

        /// <summary>
        /// Il nome: senza separatori ai lati, senza parentesi rimaste vuote o con
        /// la sola etichetta del link che c'era ("(Meet: )", "[link: ]"), senza
        /// quell'etichetta in fondo ("Ricevimento, link:"), senza un apostrofo
        /// rimasto davanti, con gli spazi ridotti.
        /// </summary>
        static string Pulito(string s)
        {
            string t = ParentesiVuote.Replace(s ?? "", " ");
            t = Regex.Replace(t, @"\s+", " ");
            // la punteggiatura rimasta staccata (dove c'era il link) torna attaccata
            t = Regex.Replace(t, @" ([.,;:!?])", "$1");
            t = EtichettaInFondo.Replace(t, "");
            t = t.Trim(' ', ',', ';', ':', '.', '-', '–', '—', '|', '/');
            return t.TrimStart('\'', '’').Trim();
        }

        // l'etichetta del link, che resta quando il link se ne va: "Meet", "Google Meet",
        // "link", "link del Meet", "collegamento"
        const string EtichettaDelLink = @"(?:(?:link|collegamento)(?:\s+(?:del\s+|al\s+)?(?:google\s+)?meet)?|(?:google\s+)?meet)";
        // le parentesi vuote, o con la sola etichetta: "(Meet: https://...)", "[Google Meet: ...]"
        static readonly Regex ParentesiVuote = new Regex(@"[(\[]\s*" + EtichettaDelLink + @"?\s*:?\s*[)\]]",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // l'etichetta con i due punti in fondo al nome: "Ricevimento, link: https://..."
        static readonly Regex EtichettaInFondo = new Regex(@"(?<![\p{L}0-9])" + EtichettaDelLink + @"\s*:\s*$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        /// <summary>Il giorno della settimana di un nome ("giovedi'", "gio"): 0 = lunedi'.</summary>
        static int IndiceGiorno(string g)
        {
            string k = (g ?? "").ToLowerInvariant();
            for (int i = 0; i < GiorniBrevi.Length; i++) if (k.StartsWith(GiorniBrevi[i])) return i;
            return -1;
        }

        // ===================================================================
        //  COME LA PAGINA MOSTRA UNA RIGA
        // ===================================================================

        static string GiornoBreve(DateTime d)
        {
            return GiorniBrevi[((int)d.DayOfWeek + 6) % 7] + " " + d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Come la pagina mostra una riga letta, sotto la casella: "riga 1: ogni
        /// giovedi' 10:10-11:10, Ricevimento, per tutto il periodo, con il link
        /// del Meet", "riga 2: mar 15/12/2026 15:00-18:00, Colloqui generali,
        /// senza link", "riga 3: niente colloqui dal lun 14/12/2026 al sab
        /// 09/01/2027 (27 giorni)", oppure "riga 4: non capita: ...". Gli avvisi
        /// in fondo, dopo "&lt;-".
        /// </summary>
        public static string Descrivi(RigaColloquio r, DateTime inizio, DateTime fine)
        {
            string testa = "riga " + r.Numero + ": ";
            if (r.Voce == null) return testa + "non capita: " + r.Motivo;
            Colloquio x = r.Voce;
            string t;
            if (x.Tipo == TipoColloquio.Sospensione)
            {
                int giorni = (x.Al.Date - x.Dal.Date).Days + 1;
                t = testa + "niente colloqui " + (giorni == 1 ? "il " + GiornoBreve(x.Dal)
                                                               : "dal " + GiornoBreve(x.Dal) + " al " + GiornoBreve(x.Al)) +
                    " (" + giorni + (giorni == 1 ? " giorno)" : " giorni)") + (x.Nome == "" ? "" : " " + x.Nome);
            }
            else
            {
                string quando = (x.Tipo == TipoColloquio.Settimanale)
                    ? "ogni " + NomiGiorniDetti[x.Giorno]
                    : GiornoBreve(x.Dal);
                string ore = (x.Dalle == "") ? "senza ora" : (x.Alle == "") ? "dalle " + x.Dalle + ", senza fine"
                                                         : x.Dalle + "-" + x.Alle;
                string date = (x.Tipo != TipoColloquio.Settimanale) ? ""
                    : x.ConDate ? ", dal " + GiornoBreve(x.Dal) + " al " + GiornoBreve(x.Al) : ", per tutto il periodo";
                string link = (x.Link == "") ? "senza link" : DiMeet.IsMatch(x.Link) ? "con il link del Meet" : "con un link";
                t = testa + quando + " " + ore + ", " + x.Nome + date + ", " + link;
            }
            List<string> guarda = new List<string>(r.Avvisi);
            if (FuoriPeriodo(x, inizio, fine)) guarda.Add("fuori dal periodo: controlla l'anno");
            return (guarda.Count == 0) ? t : t + "   <- " + string.Join("; ", guarda.ToArray());
        }

        /// <summary>Vero se la riga va guardata (in ambra): non capita, con un avviso, o fuori dal periodo.</summary>
        public static bool DaGuardare(RigaColloquio r, DateTime inizio, DateTime fine)
        {
            if (r.Voce == null || r.Avvisi.Count > 0) return true;
            return FuoriPeriodo(r.Voce, inizio, fine);
        }

        /// <summary>Le date della voce non toccano il periodo (un ricevimento senza date lo tocca sempre).</summary>
        static bool FuoriPeriodo(Colloquio x, DateTime inizio, DateTime fine)
        {
            if (x.Tipo == TipoColloquio.Settimanale && !x.ConDate) return false;
            return x.Al.Date < inizio.Date || x.Dal.Date > fine.Date;
        }

        /// <summary>La riga di una giornata come la scrive l'import: "15/12/2026 15:00-18:00 Colloqui generali link".</summary>
        static string RigaDi(string quando, string dalle, string alle, string nome, string link)
        {
            StringBuilder sb = new StringBuilder(quando);
            if (dalle != "") sb.Append(" " + dalle + (alle != "" ? "-" + alle : ""));
            if (nome != "") sb.Append(" " + nome);
            if (link != "") sb.Append(" " + link);
            return sb.ToString();
        }

        // ===================================================================
        //  IL PIANO
        // ===================================================================

        /// <summary>
        /// Quanti colloqui vanno sul calendario nel periodo, con i giorni senza
        /// lezione: lo stesso calcolo di _orariPianoColloqui_ in Orari.gs. Il
        /// ricevimento di ogni settimana (nelle sue date, dentro il periodo)
        /// salta i giorni senza lezione e quelli senza colloqui, e ogni tratto di
        /// settimane e' una serie; le giornate contano se cadono nel periodo.
        /// </summary>
        public static PianoColloqui Piano(List<RigaColloquio> righe, DateTime inizio, DateTime fine,
                                         List<Sospensione> sospensioni)
        {
            PianoColloqui p = new PianoColloqui();
            List<Sospensione> senzaColloqui = new List<Sospensione>();
            foreach (RigaColloquio r in righe)
            {
                if (!r.Buona || r.Voce.Tipo != TipoColloquio.Sospensione) continue;
                Sospensione s = new Sospensione();
                s.Dal = r.Voce.Dal;
                s.Al = r.Voce.Al;
                senzaColloqui.Add(s);
            }
            foreach (RigaColloquio r in righe)
            {
                if (!r.Buona) continue;
                Colloquio x = r.Voce;
                if (x.Tipo == TipoColloquio.Giornata)
                {
                    if (x.Dal.Date < inizio.Date || x.Dal.Date > fine.Date) { p.Fuori++; continue; }
                    p.Singoli++;
                    p.Incontri++;
                    continue;
                }
                if (x.Tipo != TipoColloquio.Settimanale) continue;
                p.Settimanali++;
                DateTime da = (x.ConDate && x.Dal.Date > inizio.Date) ? x.Dal.Date : inizio.Date;
                DateTime a = (x.ConDate && x.Al.Date < fine.Date) ? x.Al.Date : fine.Date;
                DayOfWeek giorno = (DayOfWeek)((x.Giorno + 1) % 7);
                DateTime t = da;
                while (t.DayOfWeek != giorno) t = t.AddDays(1);
                bool aperta = false;
                for (; t <= a; t = t.AddDays(7))
                {
                    if (Calendario.Coperto(t, sospensioni) || Calendario.Coperto(t, senzaColloqui))
                    {
                        p.Saltati++;
                        aperta = false;
                        continue;
                    }
                    if (!aperta) { p.Serie++; aperta = true; }
                    p.Incontri++;
                }
            }
            return p;
        }

        /// <summary>"1 ricevimento settimanale (3 serie, 28 incontri) e 2 giornate": per il riepilogo della pagina.</summary>
        public static string Riassunto(PianoColloqui p)
        {
            return (p.Settimanali == 1 ? "1 ricevimento settimanale" : p.Settimanali + " ricevimenti settimanali") +
                   " (" + p.Serie + " serie, " + (p.Incontri - p.Singoli) + " incontri) e " +
                   (p.Singoli == 1 ? "1 giornata" : p.Singoli + " giornate");
        }

        // ===================================================================
        //  DATIORARI.GS
        // ===================================================================

        /// <summary>
        /// La parte "colloqui" della parte calendario di DatiOrari.gs: le voci
        /// che vanno sul calendario (RigaColloquio.Buona), con le date intere
        /// (aaaa-mm-gg) e le ore hh:mm. Le altre righe restano solo nella casella.
        /// </summary>
        public static void ScriviDatiGs(StringBuilder sb, string testo, DateTime inizioPeriodo)
        {
            List<string> settimanali = new List<string>(), singoli = new List<string>(), sospensioni = new List<string>();
            foreach (RigaColloquio r in LeggiRighe(testo, inizioPeriodo, null))
            {
                if (!r.Buona) continue;
                Colloquio x = r.Voce;
                if (x.Tipo == TipoColloquio.Settimanale)
                    settimanali.Add("{ giorno: \"" + NomiGiorni[x.Giorno] + "\", dalle: \"" + x.Dalle + "\", alle: \"" + x.Alle +
                                    "\", dal: \"" + (x.ConDate ? Iso(x.Dal) : "") + "\", al: \"" + (x.ConDate ? Iso(x.Al) : "") +
                                    "\", nome: \"" + AnalisiOrario.Js(x.Nome) + "\", link: \"" + AnalisiOrario.Js(x.Link) + "\" }");
                else if (x.Tipo == TipoColloquio.Giornata)
                    singoli.Add("{ data: \"" + Iso(x.Dal) + "\", dalle: \"" + x.Dalle + "\", alle: \"" + x.Alle +
                                "\", nome: \"" + AnalisiOrario.Js(x.Nome) + "\", link: \"" + AnalisiOrario.Js(x.Link) + "\" }");
                else
                    sospensioni.Add("{ dal: \"" + Iso(x.Dal) + "\", al: \"" + Iso(x.Al) + "\" }");
            }
            sb.AppendLine("    // i colloqui con le famiglie (ORARI_4_calendario; se cambiano, ORARI_7_colloqui): il ricevimento");
            sb.AppendLine("    // di ogni settimana (senza dal e al, per tutto il periodo), le giornate, i periodi senza colloqui.");
            sb.AppendLine("    // I link aprono le tue stanze del Meet: tieni questo file per te");
            sb.AppendLine("    colloqui: {");
            Elenco(sb, "settimanali", settimanali, false);
            Elenco(sb, "singoli", singoli, false);
            Elenco(sb, "sospensioni", sospensioni, true);
            sb.AppendLine("    },");
        }

        static void Elenco(StringBuilder sb, string nome, List<string> voci, bool ultimo)
        {
            if (voci.Count == 0)
            {
                sb.AppendLine("      " + nome + ": []" + (ultimo ? "" : ","));
                return;
            }
            sb.AppendLine("      " + nome + ": [");
            for (int i = 0; i < voci.Count; i++) sb.AppendLine("        " + voci[i] + (i < voci.Count - 1 ? "," : ""));
            sb.AppendLine("      ]" + (ultimo ? "" : ","));
        }

        static string Iso(DateTime d) { return d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture); }

        // ===================================================================
        //  L'IMPORT DA UN FILE
        // ===================================================================

        /// <summary>
        /// Le righe dei colloqui di un file .csv o .xlsx (il primo foglio con
        /// l'intestazione giusta), da aggiungere alla casella: vedi RigheDaFoglio.
        /// Un foglio con i nomi delle persone (un elenco di prenotazioni), o con
        /// la colonna dei docenti o delle materie o i ricevimenti di piu' docenti
        /// (l'orario di ricevimento della scuola o di una classe) non si importa,
        /// e l'errore lo dice anche se un altro foglio non ha l'intestazione.
        /// </summary>
        public static List<string> Importa(string percorso, DateTime inizioPeriodo, out int saltate, out string errore)
        {
            saltate = 0;
            errore = "";
            List<FoglioExcel> fogli;
            try { fogli = Xlsx.Leggi(percorso); }
            catch (Exception ex)
            {
                errore = "Non riesco a leggere il file: " + ex.Message;
                return new List<string>();
            }
            string primo = "";
            int pesoPrimo = -1;
            foreach (FoglioExcel f in fogli)
            {
                int s;
                string e;
                List<string> righe = RigheDaFoglio(f, inizioPeriodo, out s, out e);
                if (e == "") { saltate = s; return righe; }
                // l'errore da dire: quello delle persone, poi quello dei docenti, poi il primo
                int peso = e.IndexOf(RestanoNelRegistro, StringComparison.Ordinal) >= 0 ? 2
                         : e.IndexOf(DiPiuDocenti, StringComparison.Ordinal) >= 0 ? 1 : 0;
                if (peso > pesoPrimo) { primo = e; pesoPrimo = peso; }
            }
            errore = (primo != "") ? primo : "Il file non ha fogli.";
            return new List<string>();
        }

        /// <summary>Nell'errore di un file con i nomi delle persone: le prenotazioni non passano da Campanella.</summary>
        public const string RestanoNelRegistro = "le prenotazioni restano nel registro elettronico";
        /// <summary>Nell'errore di un file con la colonna dei docenti: e' l'orario di ricevimento della scuola.</summary>
        public const string DiPiuDocenti = "l'orario di ricevimento di piu' docenti";

        /// <summary>
        /// Una colonna di persone, dall'intestazione (solo lettere minuscole):
        /// cognome, nome, alunno, studente, genitore, madre, padre, famiglia,
        /// email, telefono, prenotato da, richiedente, partecipante, utente...
        /// Un foglio che ce l'ha e' un elenco di prenotazioni. La classe da sola
        /// no: e' di un calendario dei colloqui generali ("prime").
        /// </summary>
        static bool DiPersone(string k)
        {
            if (k == "nome" || k == "tel" || k == "cell") return true;
            string[] parti = { "cognom", "nominativ", "alunn", "student", "genitor", "madre", "padre", "famigli", "tutore",
                               "mail", "telefon", "cellular", "prenotat", "prenotant", "richiedent", "partecipant",
                               "utent" };
            foreach (string p in parti) if (k.Contains(p)) return true;
            return false;
        }

        /// <summary>
        /// Una colonna di docenti, dall'intestazione (solo lettere minuscole):
        /// docente, insegnante, prof., professore, referente, coordinatore. Un
        /// foglio che ce l'ha e' l'orario di ricevimento di tutta la scuola, con
        /// i ricevimenti e i link dei colleghi.
        /// </summary>
        static bool DiDocenti(string k)
        {
            if (k.StartsWith("prof", StringComparison.Ordinal)) return true;
            string[] parti = { "docent", "insegnant", "referent", "coordinator" };
            foreach (string p in parti) if (k.Contains(p)) return true;
            return false;
        }

        /// <summary>
        /// Una colonna delle materie, dall'intestazione (solo lettere minuscole):
        /// materia, materie, disciplina, insegnamento. Un foglio che ce l'ha e'
        /// l'orario di ricevimento della scuola o di una classe, una riga per
        /// docente.
        /// </summary>
        static bool DiMaterie(string k)
        {
            string[] parti = { "materi", "disciplin", "insegnament" };
            foreach (string p in parti) if (k.Contains(p)) return true;
            return false;
        }

        /// <summary>
        /// Le righe dei colloqui di un foglio. Le colonne si riconoscono
        /// dall'intestazione, in una delle prime dieci righe: "data" oppure
        /// "giorno" (una data, anche con il giorno della settimana, o un giorno
        /// della settimana da solo), "dalle" e "alle" (o inizio e fine), oppure
        /// "ora" o "orario" con la fascia (15:00-18:00), "cosa", "descrizione" o
        /// "titolo" (il nome), "link" (anche senza https://), "classe" o
        /// "classi" (va nel nome, fra parentesi), e per un ricevimento "dal" e
        /// "al" (le sue date). Una riga con una data diventa una
        /// giornata ("martedi 15/12/2026 ...", con il giorno della settimana se
        /// c'e', cosi' la casella dice se torna), una con il solo giorno della
        /// settimana un ricevimento settimanale ("ogni giovedi ..."); una data
        /// che non si capisce resta com'e', e la casella la mostra fra quelle da
        /// guardare. Si saltano (saltate) solo le righe senza data ne' giorno.
        /// Date e ore di Excel scritte come numeri (46371, 0,4236) valgono.
        /// Senza l'intestazione, errore dice quali colonne ci vogliono. Un
        /// foglio con colonne di persone (cognome, nome, genitore, email,
        /// prenotato da...) non si importa: e' un elenco di prenotazioni, e i
        /// nomi degli studenti e dei genitori sul calendario non vanno. Nemmeno
        /// uno con la colonna dei docenti (docente, prof...) o delle materie
        /// (materia, disciplina): e' l'orario di ricevimento della scuola, e sul
        /// calendario andrebbero anche i ricevimenti e i link dei colleghi.
        /// Quelle intestazioni valgono anche sopra la riga d'intestazione, su
        /// una colonna che li' e' vuota (l'intestazione su due righe, con le
        /// celle unite). Senza, lo dicono le righe: due ricevimenti nelle stesse
        /// settimane con link diversi, tre nelle stesse settimane, due giornate
        /// alla stessa ora con link diversi (DiPiuPersoneNelleRighe). I nomi
        /// scritti dentro la colonna cosa non si riconoscono.
        /// </summary>
        public static List<string> RigheDaFoglio(FoglioExcel f, DateTime inizioPeriodo, out int saltate, out string errore)
        {
            List<string> fuori = new List<string>();
            saltate = 0;
            errore = "";
            int riga = -1, cData = -1, cGiorno = -1, cDalle = -1, cAlle = -1, cOra = -1, cCosa = -1, cLink = -1, cDal = -1,
                cAl = -1, cClasse = -1;
            List<string> persone = new List<string>(), docenti = new List<string>(), materie = new List<string>();
            for (int i = 0; i < Math.Min(10, f.NumeroRighe) && riga < 0; i++)
            {
                int d = -1, g = -1, da = -1, a = -1, o = -1, c = -1, l = -1, dal = -1, al = -1, cl = -1;
                List<string> diPersone = new List<string>(), diDocenti = new List<string>(), diMaterie = new List<string>();
                for (int j = 0; j < f.Colonne; j++)
                {
                    string k = Regex.Replace(f.Cella(i, j).ToLowerInvariant(), @"[^a-z]", "");
                    if (k == "data" && d < 0) d = j;
                    else if ((k == "giorno" || k == "giornodellasettimana" || k == "giornosettimana") && g < 0) g = j;
                    else if ((k == "dalle" || k == "inizio" || k == "orainizio" || k == "oradiinizio" || k == "dallora") &&
                             da < 0) da = j;
                    else if ((k == "alle" || k == "fine" || k == "orafine" || k == "oradifine" || k == "allora") && a < 0) a = j;
                    else if ((k == "ora" || k == "ore" || k == "orario" || k == "fascia" || k == "fasciaoraria") && o < 0) o = j;
                    else if ((k == "cosa" || k == "descrizione" || k == "titolo") && c < 0) c = j;
                    else if ((k == "link" || k == "meet" || k == "linkmeet" || k == "linkdelmeet" || k == "collegamento") && l < 0) l = j;
                    else if (k == "dal" && dal < 0) dal = j;
                    else if (k == "al" && al < 0) al = j;
                    else if (DiDocenti(k)) diDocenti.Add(f.Cella(i, j).Trim());
                    else if (DiMaterie(k)) diMaterie.Add(f.Cella(i, j).Trim());
                    else if (DiPersone(k)) diPersone.Add(f.Cella(i, j).Trim());
                    else if (k.StartsWith("class", StringComparison.Ordinal) && cl < 0) cl = j;
                }
                if ((d >= 0 || g >= 0) && (da >= 0 || o >= 0 || c >= 0 || l >= 0 || diPersone.Count > 0 || diDocenti.Count > 0 ||
                                           diMaterie.Count > 0))
                {
                    riga = i; cData = d; cGiorno = g; cDalle = da; cAlle = a; cOra = o; cCosa = c; cLink = l; cDal = dal;
                    cAl = al; cClasse = cl;
                    persone = diPersone;
                    docenti = diDocenti;
                    materie = diMaterie;
                    // con le persone la classe e' quella dello studente
                    if (persone.Count > 0 && cl >= 0) persone.Add(f.Cella(i, cl).Trim());
                }
            }
            if (riga < 0)
            {
                errore = "Nel file non trovo l'intestazione dei colloqui: ci vuole una riga con \"data\" (o \"giorno\") " +
                         "e almeno una fra \"dalle\", \"alle\", \"ora\", \"cosa\" (o \"descrizione\") e \"link\".";
                return fuori;
            }
            // l'intestazione su due righe, come si fa spesso a scuola: "DOCENTE"
            // unita in verticale sta nella riga sopra, e in questa la sua cella e'
            // vuota (le celle unite hanno il testo solo in alto). Per una colonna
            // senza intestazione, con qualcosa scritto sotto, vale la prima cella
            // scritta sopra; non il titolo del foglio
            for (int j = 0; j < f.Colonne; j++)
            {
                if (f.Cella(riga, j).Trim() != "" || !ScrittaSotto(f, riga, j)) continue;
                for (int i = riga - 1; i >= 0; i--)
                {
                    string sopra = f.Cella(i, j).Trim();
                    if (sopra == "") continue;
                    if (!Titolo(f, i, j))
                    {
                        string k = Regex.Replace(sopra.ToLowerInvariant(), @"[^a-z]", "");
                        if (DiDocenti(k)) docenti.Add(sopra);
                        else if (DiMaterie(k)) materie.Add(sopra);
                        else if (DiPersone(k)) persone.Add(sopra);
                    }
                    break;
                }
            }
            if (persone.Count > 0)
            {
                // un elenco di prenotazioni: le righe con i nomi delle persone non si leggono nemmeno
                errore = "Il file ha colonne con le persone (\"" + string.Join("\", \"", persone.ToArray()) + "\"): sembra " +
                         "un elenco di prenotazioni, e non lo importo. Sul calendario vanno solo quando e dove, e " +
                         RestanoNelRegistro + ". Importa un file con le sole colonne data (o giorno), dalle, alle, cosa " +
                         "e link.";
                return fuori;
            }
            if (docenti.Count > 0 || materie.Count > 0)
            {
                // l'orario di ricevimento della scuola: i ricevimenti e i link dei colleghi non vanno sul tuo calendario
                List<string> dette = new List<string>(docenti);
                dette.AddRange(materie);
                bool due = docenti.Count > 0 && materie.Count > 0;
                errore = "Il file ha " + (due ? "le colonne dei docenti e delle materie"
                                              : docenti.Count > 0 ? "la colonna dei docenti" : "la colonna delle materie") +
                         " (\"" + string.Join("\", \"", dette.ToArray()) + "\"): sembra " +
                         DiPiuDocenti + ", e non lo importo: sul tuo calendario andrebbero anche i ricevimenti e i link " +
                         "dei colleghi. Scrivi il tuo ricevimento nella casella (ogni giovedi 10:10-11:10 Ricevimento " +
                         "https://meet.google.com/...), o importa un file con le sole tue righe, senza " +
                         (due ? "quelle colonne." : "quella colonna.");
                return fuori;
            }
            for (int i = riga + 1; i < f.NumeroRighe; i++)
            {
                string data = Cella(f, i, cData), giorno = Cella(f, i, cGiorno);
                string dalle = OraDellaCella(Cella(f, i, cDalle)), alle = OraDellaCella(Cella(f, i, cAlle));
                // la fascia in una colonna sola ("15:00-18:00", "dalle 15 alle 18"): com'e', la legge la casella
                if (dalle == "" && alle == "") dalle = OraDellaCella(Cella(f, i, cOra));
                string nome = Cella(f, i, cCosa);
                // il link del Meet anche senza https://, come lo mostrano Calendar e Meet
                string link = MeetSenzaSchema.Replace(Cella(f, i, cLink), "https://meet.google.com/");
                string dal = Cella(f, i, cDal), al = Cella(f, i, cAl);
                string classe = Cella(f, i, cClasse);
                if (data == "" && giorno == "" && dalle == "" && alle == "" && nome == "" && link == "" && dal == "" &&
                    al == "" && classe == "") continue;
                string quando = QuandoDelleCelle(data, giorno, inizioPeriodo);
                if (quando == "") { saltate++; continue; }
                // le classi dei colloqui generali ("prime"): nel nome, fra parentesi
                if (classe != "")
                    nome = (nome != "" ? nome : quando.StartsWith("ogni ", StringComparison.Ordinal) ? NomeSettimanale
                                                                                                     : NomeGiornata) +
                           " (" + classe + ")";
                // le date del ricevimento, davanti come nella casella; una che manca
                // o che non si capisce la mostra la casella, fra quelle da guardare
                if (dal != "" || al != "")
                    quando = "dal " + (dal != "" ? DataOCella(dal, inizioPeriodo) : "?") + " al " +
                             (al != "" ? DataOCella(al, inizioPeriodo) : "?") + " " + quando;
                fuori.Add(RigaDi(quando, dalle, alle, nome, link));
            }
            // senza la colonna dei docenti lo dicono le righe: i ricevimenti e i
            // link di piu' persone (i nomi in una colonna senza intestazione, o
            // un'intestazione che non si riconosce)
            string diPiu = DiPiuPersoneNelleRighe(fuori, inizioPeriodo);
            if (diPiu != "")
            {
                errore = "Nel file ci sono " + diPiu + ": sembra " + DiPiuDocenti + ", e non lo importo: sul tuo " +
                         "calendario andrebbero anche i ricevimenti e i link dei colleghi. Se sono davvero tutti tuoi, " +
                         "scrivili nella casella, una riga per voce; se no importa un file con le sole tue righe.";
                return new List<string>();
            }
            return fuori;
        }

        /// <summary>
        /// Se le righe importate sono i colloqui di piu' docenti, quello che lo
        /// dice ("3 ricevimenti di ogni settimana con link diversi"); se no "".
        /// Un docente ha un ricevimento alla volta, al piu' due (la mattina e il
        /// pomeriggio), e alla stessa ora una stanza sola del Meet: due
        /// ricevimenti nelle stesse settimane con link diversi, tre o piu'
        /// ricevimenti nelle stesse settimane, o due giornate alla stessa ora con
        /// link diversi sono l'orario di ricevimento della scuola o di una
        /// classe. Due ricevimenti uno dopo l'altro (le date di uno finiscono
        /// prima che comincino quelle dell'altro) si', anche con link diversi.
        /// </summary>
        static string DiPiuPersoneNelleRighe(List<string> righe, DateTime inizioPeriodo)
        {
            List<Colloquio> settimanali = new List<Colloquio>(), giornate = new List<Colloquio>();
            HashSet<string> viste = new HashSet<string>(StringComparer.Ordinal);
            foreach (string riga in righe)
            {
                RigaColloquio r = new RigaColloquio();
                LeggiUna(riga, inizioPeriodo, null, r);
                // una voce sola per ora e link, anche se il file la ripete con un altro nome
                if (r.Voce == null || !viste.Add(Chiave(r.Voce))) continue;
                if (r.Voce.Tipo == TipoColloquio.Settimanale) settimanali.Add(r.Voce);
                else if (r.Voce.Tipo == TipoColloquio.Giornata) giornate.Add(r.Voce);
            }
            for (int i = 0; i < settimanali.Count; i++)
            {
                Colloquio a = settimanali[i];
                int insieme = 0;
                for (int j = 0; j < settimanali.Count; j++)
                {
                    Colloquio b = settimanali[j];
                    // quelli che valgono il primo giorno di a (a compreso)
                    if (DalDi(b) <= DalDi(a) && DalDi(a) <= AlDi(b)) insieme++;
                    if (j > i && DalDi(a) <= AlDi(b) && DalDi(b) <= AlDi(a) && a.Link != "" && b.Link != "" &&
                        !string.Equals(a.Link, b.Link, StringComparison.OrdinalIgnoreCase))
                        return settimanali.Count + " ricevimenti di ogni settimana con link diversi";
                }
                if (insieme >= 3) return insieme + " ricevimenti di ogni settimana nelle stesse settimane";
            }
            for (int i = 0; i < giornate.Count; i++)
                for (int j = i + 1; j < giornate.Count; j++)
                    if (AllaStessaOra(giornate[i], giornate[j]) && giornate[i].Link != "" && giornate[j].Link != "" &&
                        !string.Equals(giornate[i].Link, giornate[j].Link, StringComparison.OrdinalIgnoreCase))
                        return "giornate alla stessa ora con link diversi";
            return "";
        }

        /// <summary>
        /// Vero se nel foglio, sotto la riga d'intestazione, la colonna ha
        /// qualcosa di scritto.
        /// </summary>
        static bool ScrittaSotto(FoglioExcel f, int riga, int colonna)
        {
            for (int i = riga + 1; i < f.NumeroRighe; i++) if (f.Cella(i, colonna).Trim() != "") return true;
            return false;
        }

        /// <summary>
        /// Vero se la cella e' il titolo del foglio: la sola scritta della sua
        /// riga, di piu' di tre parole ("Colloqui con le famiglie - prof. ...").
        /// </summary>
        static bool Titolo(FoglioExcel f, int riga, int colonna)
        {
            for (int j = 0; j < f.Colonne; j++) if (j != colonna && f.Cella(riga, j).Trim() != "") return false;
            return f.Cella(riga, colonna).Trim().Split((char[])null, StringSplitOptions.RemoveEmptyEntries).Length > 3;
        }

        /// <summary>Una cella del foglio, con gli spazi (e gli a capo) ridotti a uno.</summary>
        static string Cella(FoglioExcel f, int riga, int colonna)
        {
            return (colonna < 0) ? "" : Regex.Replace(f.Cella(riga, colonna) ?? "", @"\s+", " ").Trim();
        }

        /// <summary>
        /// Il "quando" di una riga del foglio, dalla colonna data e da quella
        /// giorno: vedi QuandoDellaCella. Con una data in una e il giorno della
        /// settimana nell'altra, tutti e due ("martedi 15/12/2026"): la casella
        /// dice se tornano. "" se le due celle sono vuote.
        /// </summary>
        static string QuandoDelleCelle(string data, string giorno, DateTime inizioPeriodo)
        {
            if (data == "" && giorno == "") return "";
            string quando = QuandoDellaCella(data != "" ? data : giorno, inizioPeriodo);
            Match mg = GiornoDavanti.Match(giorno);
            if (data != "" && mg.Success && mg.Length == giorno.Length &&
                Regex.IsMatch(quando, @"^[0-9]{2}/[0-9]{2}/[0-9]{4}$"))
                quando = giorno.TrimEnd(',', ' ') + " " + quando;
            return quando;
        }

        /// <summary>
        /// Il "quando" di una cella, come lo scrive la casella: una data (15/12/2026,
        /// anche come numero di Excel), con il giorno della settimana davanti o
        /// dopo se c'e' ("giovedi 17/12/2026"), oppure "ogni giovedi" se la cella
        /// ha soltanto il giorno della settimana. Altrimenti la cella com'e': la
        /// riga non si capira', e la casella la mostra fra quelle da guardare
        /// (una data con il giorno della settimana non diventa un ricevimento).
        /// </summary>
        static string QuandoDellaCella(string v, DateTime inizioPeriodo)
        {
            if (v == "") return "";
            string data = DataDellaCella(v, inizioPeriodo);
            if (data != "") return data;
            Match mg = GiornoDavanti.Match(v);
            if (!mg.Success) return v;
            if (mg.Length == v.Length) return "ogni " + NomiGiorni[IndiceGiorno(mg.Groups["g"].Value)];
            data = DataDellaCella(v.Substring(mg.Length), inizioPeriodo);
            return (data != "") ? v.Substring(0, mg.Length).TrimEnd(',', ' ') + " " + data : v;
        }

        /// <summary>La data di una cella (DataDellaCella), o la cella com'e' se non si capisce.</summary>
        static string DataOCella(string v, DateTime inizioPeriodo)
        {
            string data = DataDellaCella(v, inizioPeriodo);
            return (data != "") ? data : v;
        }

        /// <summary>
        /// Una data di una cella come la scrive la casella (15/12/2026): scritta
        /// come nei giorni senza lezione, o come numero di Excel (46371), da sola
        /// o con dopo il giorno della settimana ("15/12/2026 martedi", che resta).
        /// "" se non e' una data, o se dopo c'e' altro.
        /// </summary>
        static string DataDellaCella(string v, DateTime inizioPeriodo)
        {
            if (v == "") return "";
            double n;
            if (double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out n) && n >= 36526 && n < 73051)
                return DateTime.FromOADate(Math.Floor(n)).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            DateTime d;
            int l;
            string perche;
            if (!Calendario.DataAllInizio(v, inizioPeriodo, out d, out l, out perche)) return "";
            string scritta = d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            string dopo = v.Substring(l).Trim().TrimStart(',', ';').Trim();
            if (dopo == "") return scritta;
            Match mg = GiornoDavanti.Match(dopo);
            return (mg.Success && mg.Length == dopo.Length) ? scritta + " " + dopo.TrimEnd(',', ' ') : "";
        }

        /// <summary>
        /// Le righe importate che nella casella non ci sono gia', senza doppioni
        /// fra loro: il file importato di nuovo non raddoppia i colloqui. Gia'
        /// scritta e' una riga con lo stesso testo (senza badare a maiuscole e
        /// spazi), o con la stessa voce di una riga della casella anche con un
        /// altro nome: lo stesso tipo, lo stesso giorno o la stessa data, le
        /// stesse ore, le stesse date e lo stesso link (una riga importata e poi
        /// corretta nel nome non torna). inizioPeriodo da' l'anno alle date
        /// scritte senza. gia: quante sono rimaste fuori.
        /// </summary>
        public static List<string> SenzaQuelleGiaScritte(string testo, List<string> righe, DateTime inizioPeriodo, out int gia)
        {
            gia = 0;
            HashSet<string> scritte = new HashSet<string>(StringComparer.Ordinal);
            HashSet<string> voci = new HashSet<string>(StringComparer.Ordinal);
            foreach (string r in Calendario.Righe(testo))
            {
                if (r.Trim() == "") continue;
                scritte.Add(Normale(r));
                string k = ChiaveDellaVoce(r, inizioPeriodo);
                if (k != "") voci.Add(k);
            }
            List<string> fuori = new List<string>();
            foreach (string r in righe)
            {
                string k = ChiaveDellaVoce(r, inizioPeriodo);
                if (scritte.Contains(Normale(r)) || (k != "" && voci.Contains(k))) { gia++; continue; }
                // fra le righe del file conta il testo: due voci alla stessa ora
                // con nomi diversi arrivano tutte e due, e la casella le mostra
                scritte.Add(Normale(r));
                fuori.Add(r);
            }
            return fuori;
        }

        static string Normale(string riga)
        {
            return Regex.Replace(riga ?? "", @"\s+", " ").Trim().ToLowerInvariant();
        }

        /// <summary>
        /// La voce di una riga senza il nome, per riconoscerla anche con un
        /// altro nome: "" se la riga non si capisce.
        /// </summary>
        static string ChiaveDellaVoce(string riga, DateTime inizioPeriodo)
        {
            string t = (riga ?? "").Trim();
            if (t == "" || t.StartsWith("#")) return "";
            RigaColloquio r = new RigaColloquio();
            LeggiUna(t, inizioPeriodo, null, r);
            return (r.Voce == null) ? "" : Chiave(r.Voce);
        }

        /// <summary>La voce senza il nome: il tipo, il giorno o la data, le date, le ore e il link.</summary>
        static string Chiave(Colloquio x)
        {
            if (x.Tipo == TipoColloquio.Sospensione) return "sospensione|" + Iso(x.Dal) + "|" + Iso(x.Al);
            string quando = (x.Tipo == TipoColloquio.Giornata) ? "giornata|" + Iso(x.Dal)
                          : "settimanale|" + x.Giorno + "|" + (x.ConDate ? Iso(x.Dal) + "|" + Iso(x.Al) : "|");
            return quando + "|" + x.Dalle + "|" + x.Alle + "|" + x.Link;
        }

        /// <summary>
        /// Un'ora di una cella come "hh:mm": scritta (10:10, 10.10, 10) o come
        /// frazione del giorno di Excel (0.423611, anche con la data davanti:
        /// 46371.4236). La cella com'e' se non e' un'ora.
        /// </summary>
        static string OraDellaCella(string v)
        {
            if (v == "") return "";
            // di Excel: la frazione del giorno (0.75 sono le 18), e nessuno scrive 00:25 per un colloquio
            bool frazione = Regex.IsMatch(v, @"^0[.,][0-9]+$");
            // scritta: 10:10, 10.10, 10:10:00, 10
            string hhmm;
            Match m = Regex.Match(v, @"^(?<h>[0-9]{1,2})(?:[:.](?<m>[0-9]{2}))?(?::[0-9]{2})?$");
            if (!frazione && m.Success && Ora(m.Groups["h"].Value, m.Groups["m"].Value, out hhmm)) return hhmm;
            // di Excel anche con la data davanti (46371.625), con tre cifre o piu' dopo la virgola
            double n;
            if ((frazione || Regex.IsMatch(v, @"^[0-9]+[.,][0-9]{3,}$")) &&
                double.TryParse(v.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out n))
            {
                int minuti = (int)Math.Round((n - Math.Floor(n)) * 24 * 60);
                if (minuti >= 24 * 60) minuti = 0;
                return (minuti / 60).ToString("00", CultureInfo.InvariantCulture) + ":" +
                       (minuti % 60).ToString("00", CultureInfo.InvariantCulture);
            }
            return v;
        }
    }
}
