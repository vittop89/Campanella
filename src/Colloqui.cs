// ===========================================================================
//  Colloqui.cs - i colloqui con le famiglie sul calendario (Orari, passo 4)
//
//  Il docente scrive i suoi colloqui, una riga per voce, o li importa da un
//  file (.csv o .xlsx, con le colonne data o giorno, dalle, alle, cosa, link):
//
//      ogni giovedi 10:10-11:10 Ricevimento https://meet.google.com/abc-defg-hij
//      dal 12/10/2026 al 22/05/2027 ogni giovedi 10:10-11:10 Ricevimento
//      15/12/2026 15:00-18:00 Colloqui generali https://meet.google.com/...
//      niente colloqui dal 14/12/2026 al 09/01/2027
//
//  Il link e' il primo https:// della riga, il resto e' il nome. Lo script
//  (Orari.gs e Calendario.gs: ORARI_4_calendario, ORARI_7_colloqui) mette il
//  ricevimento settimanale a tratti come le lezioni, senza i giorni senza
//  lezione e quelli senza colloqui, e le giornate come eventi singoli, con il
//  link come luogo. Le prenotazioni dei genitori restano nel registro
//  elettronico: qui c'e' solo quando e dove.
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

        /// <summary>
        /// Va sul calendario (e in DatiOrari.gs): un periodo senza colloqui,
        /// o un colloquio con l'ora di inizio e quella di fine, dopo. Senza ora,
        /// o con la fine prima dell'inizio, resta solo nella casella.
        /// </summary>
        public bool Buona
        {
            get
            {
                if (Voce == null) return false;
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

        // un giorno della settimana: "giovedi", "giovedi'", "giovedì", "gio", "gio."
        const string GiornoSettimana = @"(?<g>(?:luned|marted|mercoled|gioved|venerd)(?:i'|i|ì)|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)\.?(?!\p{L})";

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

        // l'ora: "10:10-11:10", "10.10 - 11.10", "dalle 15 alle 18", "15-18", "ore 15-18"
        static readonly Regex DalleAlle = new Regex(
            @"(?<![0-9:.\p{L}])(?<prima>(?:dalle|ore|h)\s*(?:ore\s*)?)?(?<h1>[0-9]{1,2})(?:[:.](?<m1>[0-9]{2}))?" +
            @"\s*(?:-|–|—|alle(?:\s+ore)?|fino\s+alle)\s*(?<h2>[0-9]{1,2})(?:[:.](?<m2>[0-9]{2}))?(?![0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        // un'ora sola: "alle 15:00", "15:00", "ore 15"
        static readonly Regex OraSola = new Regex(
            @"(?<![0-9:.\p{L}])(?:(?:dalle|alle|ore|h)\s*(?<h1>[0-9]{1,2})(?:[:.](?<m1>[0-9]{2}))?|" +
            @"(?<h1>[0-9]{1,2})[:.](?<m1>[0-9]{2}))(?![0-9])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // il link: il primo indirizzo https:// della riga
        static readonly Regex Link = new Regex(@"https://[^\s<>""]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        static readonly Regex DiMeet = new Regex(@"^https://meet\.google\.com/", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

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
        /// vuoto), nessun avviso sui giorni.
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
                fuori.Add(r);
            }
            return fuori;
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
            // il link: il primo https:// della riga (senza la punteggiatura che lo segue)
            string link = "";
            Match ml = Link.Match(s);
            if (ml.Success)
            {
                link = ml.Value.TrimEnd('.', ',', ';', ':', '!', '?', ')', ']', '}', '>', '\'');
                s = (s.Substring(0, ml.Index) + " " + s.Substring(ml.Index + link.Length)).Trim();
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
                if (!OreENome(nomeDavanti + " " + s.Substring(mo.Index + mo.Length), w, r, out motivo))
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
                return;
            }
            if (OgniSenzaGiorno.IsMatch(s))
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
            // un'altra data dopo la prima: due giornate su una riga, o un periodo
            DateTime altra;
            int l2;
            string p2;
            if (Calendario.DataAllInizio(Regex.Replace(dopo, @"^(?:e|al|fino\s+al)\s+", "",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant), inizioPeriodo, out altra, out l2, out p2))
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

        /// <summary>
        /// L'ora e il nome di un colloquio, dal testo che resta (senza la data e
        /// il link). L'ora e' la prima "dalle-alle" all'inizio, o scritta per
        /// esteso (con i minuti o con "dalle") piu' avanti; il resto e' il nome.
        /// Senza ora, con la sola ora di inizio o con la fine prima dell'inizio
        /// la riga resta capita, con un avviso. False, con il motivo, se un'ora
        /// non esiste (25:00).
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
            x.Nome = Pulito(t);
            return true;
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

        /// <summary>Il nome: senza separatori ai lati, senza parentesi rimaste vuote, con gli spazi ridotti.</summary>
        static string Pulito(string s)
        {
            string t = Regex.Replace(s ?? "", @"\(\s*\)|\[\s*\]", " ");
            t = Regex.Replace(t, @"\s+", " ");
            // la punteggiatura rimasta staccata (dove c'era il link) torna attaccata
            t = Regex.Replace(t, @" ([.,;:!?])", "$1");
            return t.Trim(' ', ',', ';', ':', '.', '-', '–', '—', '|', '/');
        }

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
            foreach (FoglioExcel f in fogli)
            {
                int s;
                string e;
                List<string> righe = RigheDaFoglio(f, inizioPeriodo, out s, out e);
                if (e == "") { saltate = s; return righe; }
                if (primo == "") primo = e;
            }
            errore = (primo != "") ? primo : "Il file non ha fogli.";
            return new List<string>();
        }

        /// <summary>
        /// Le righe dei colloqui di un foglio. Le colonne si riconoscono
        /// dall'intestazione, in una delle prime dieci righe: "data" oppure
        /// "giorno" (una data o un giorno della settimana), "dalle" e "alle" (o
        /// inizio e fine), "cosa" o "descrizione" (il nome), "link". Una riga con
        /// una data diventa una giornata, una con un giorno della settimana un
        /// ricevimento settimanale ("ogni giovedi ..."); le altre si saltano
        /// (saltate). Date e ore di Excel scritte come numeri (46371, 0,4236)
        /// valgono. Senza l'intestazione, errore dice quali colonne ci vogliono.
        /// </summary>
        public static List<string> RigheDaFoglio(FoglioExcel f, DateTime inizioPeriodo, out int saltate, out string errore)
        {
            List<string> fuori = new List<string>();
            saltate = 0;
            errore = "";
            int riga = -1, cData = -1, cGiorno = -1, cDalle = -1, cAlle = -1, cCosa = -1, cLink = -1;
            for (int i = 0; i < Math.Min(10, f.NumeroRighe) && riga < 0; i++)
            {
                int d = -1, g = -1, da = -1, a = -1, c = -1, l = -1;
                for (int j = 0; j < f.Colonne; j++)
                {
                    string k = Regex.Replace(f.Cella(i, j).ToLowerInvariant(), @"[^a-z]", "");
                    if (k == "data" && d < 0) d = j;
                    else if ((k == "giorno" || k == "giornodellasettimana" || k == "giornosettimana") && g < 0) g = j;
                    else if ((k == "dalle" || k == "inizio" || k == "orainizio" || k == "dallora") && da < 0) da = j;
                    else if ((k == "alle" || k == "fine" || k == "orafine" || k == "allora") && a < 0) a = j;
                    else if ((k == "cosa" || k == "descrizione" || k == "nome" || k == "titolo") && c < 0) c = j;
                    else if ((k == "link" || k == "meet" || k == "linkmeet" || k == "linkdelmeet" || k == "collegamento") && l < 0) l = j;
                }
                if ((d >= 0 || g >= 0) && (da >= 0 || c >= 0 || l >= 0))
                {
                    riga = i; cData = d; cGiorno = g; cDalle = da; cAlle = a; cCosa = c; cLink = l;
                }
            }
            if (riga < 0)
            {
                errore = "Nel file non trovo l'intestazione dei colloqui: ci vuole una riga con \"data\" (o \"giorno\") " +
                         "e almeno una fra \"dalle\", \"alle\", \"cosa\" (o \"descrizione\") e \"link\".";
                return fuori;
            }
            for (int i = riga + 1; i < f.NumeroRighe; i++)
            {
                string data = Cella(f, i, cData), giorno = Cella(f, i, cGiorno);
                string dalle = OraDellaCella(Cella(f, i, cDalle)), alle = OraDellaCella(Cella(f, i, cAlle));
                string nome = Regex.Replace(Cella(f, i, cCosa), @"\s+", " ").Trim();
                string link = Cella(f, i, cLink).Trim();
                if (data == "" && giorno == "" && dalle == "" && alle == "" && nome == "" && link == "") continue;
                string quando = DataDellaCella(data, inizioPeriodo);
                if (quando == "") quando = DataDellaCella(giorno, inizioPeriodo);
                if (quando == "")
                {
                    Match mg = GiornoDavanti.Match(giorno.Trim());
                    if (mg.Success) quando = "ogni " + NomiGiorni[IndiceGiorno(mg.Groups["g"].Value)];
                }
                if (quando == "") { saltate++; continue; }
                fuori.Add(RigaDi(quando, dalle, alle, nome, link));
            }
            return fuori;
        }

        static string Cella(FoglioExcel f, int riga, int colonna)
        {
            return (colonna < 0) ? "" : (f.Cella(riga, colonna) ?? "").Trim();
        }

        /// <summary>
        /// Una data di una cella come la scrive la casella (15/12/2026): scritta
        /// come nei giorni senza lezione, o come numero di Excel (46371). "" se
        /// non e' una data.
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
            if (Calendario.DataAllInizio(v, inizioPeriodo, out d, out l, out perche))
                return d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            return "";
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
