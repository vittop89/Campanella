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
        const string Data = @"([0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[/.][0-9]{1,2}(?:[/.](?:[0-9]{4}|[0-9]{2}))?)";

        // [dal] data [ (- | [fino] al) data ] [nome]. Dopo le date non ci devono
        // essere altre cifre attaccate ("1/11/202" non e' un anno a due cifre);
        // un punto o una parentesi si', come in fondo a una frase della circolare
        static readonly Regex RigaSospensione = new Regex(
            @"^(?:dal\s+)?" + Data +
            @"(?:\s*[-–—]\s*" + Data + @"|\s+(?:fino\s+)?al\s+" + Data + @")?" +
            @"(?=$|[\s:,;.)–—-])[\s:,;.)–—-]*(.*)$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        // una data dentro il nome: "07/12/2026, 08/12/2026 ponte", "dal 23/12/2026 a
        // 06/01/2027". Con il punto solo se c'e' l'anno: "alle 10.30" e' un'ora
        static readonly Regex DataNelNome = new Regex(
            @"(?<![0-9])(?:[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}/[0-9]{1,2}(?:/[0-9]{2,4})?|" +
            @"[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{2,4})(?![0-9])", RegexOptions.CultureInvariant);

        // gli a capo: anche quelli che arrivano incollando da un PDF o da una pagina web
        static readonly Regex ACapo = new Regex("\r\n|[\n\r\u000B\u000C\u0085\u2028\u2029]");

        // ===================================================================
        //  LE RIGHE SCRITTE DAL DOCENTE
        // ===================================================================

        /// <summary>
        /// Una riga per giorno o per periodo: "01/11/2026 Tutti i Santi",
        /// "23/12/2026-06/01/2027 Vacanze di Natale", "dal 23/12/2026 al
        /// 06/01/2027", "2026-11-01", anni a due cifre, e anche senza anno
        /// ("01/11", "23/12-06/01"): allora l'anno e' quello dell'anno
        /// scolastico del periodo (da settembre a dicembre l'anno in cui
        /// comincia, da gennaio ad agosto quello dopo). Le righe vuote e
        /// quelle che cominciano con # non contano. Le righe che non si
        /// capiscono (una data impossibile, la fine prima dell'inizio, un
        /// periodo scritto in un altro modo, come "dal 23/12 a 06/01" o
        /// "2026-11-01-03", due giorni sulla stessa riga) finiscono in
        /// nonCapite, cosi' come sono state scritte: mai un giorno solo con il
        /// resto nel nome.
        /// </summary>
        public static List<Sospensione> Leggi(string testo, DateTime inizioPeriodo, out List<string> nonCapite)
        {
            List<Sospensione> fuori = new List<Sospensione>();
            nonCapite = new List<string>();
            int annoInizio = AnnoScolastico(inizioPeriodo);
            foreach (string grezza in ACapo.Split(testo ?? ""))
            {
                string riga = grezza.Trim();
                if (riga == "" || riga.StartsWith("#")) continue;
                // un punto elenco copiato da una circolare
                string senzaPunto = Regex.Replace(riga, @"^[-*•]\s+", "");

                Match m = RigaSospensione.Match(senzaPunto);
                DateTime dal, al;
                if (!m.Success || !LeggiData(m.Groups[1].Value, annoInizio, out dal))
                {
                    nonCapite.Add(riga);
                    continue;
                }
                Group seconda = m.Groups[2].Success ? m.Groups[2] : m.Groups[3];
                if (!seconda.Success) al = dal;
                else if (!LeggiData(seconda.Value, annoInizio, out al)) { nonCapite.Add(riga); continue; }
                if (al < dal) { nonCapite.Add(riga); continue; }

                // dopo le date un trattino attaccato a una cifra ("2026-11-01-03"),
                // o un'altra data nel nome: un periodo che non ho capito
                Group ultima = seconda.Success ? seconda : m.Groups[1];
                string dopo = senzaPunto.Substring(ultima.Index + ultima.Length);
                string nome = m.Groups[4].Value.Trim();
                if (Regex.IsMatch(dopo, @"^[-–—/]\s*[0-9]|^\s*[-–—/][0-9]") || DataNelNome.IsMatch(nome))
                {
                    nonCapite.Add(riga);
                    continue;
                }

                Sospensione s = new Sospensione();
                s.Dal = dal;
                s.Al = al;
                s.Nome = nome;
                fuori.Add(s);
            }
            return fuori;
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

        static bool LeggiData(string s, int annoInizio, out DateTime d)
        {
            d = DateTime.MinValue;
            int anno, mese, giorno;
            Match iso = Regex.Match(s, @"^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$");
            if (iso.Success)
            {
                anno = int.Parse(iso.Groups[1].Value);
                mese = int.Parse(iso.Groups[2].Value);
                giorno = int.Parse(iso.Groups[3].Value);
            }
            else
            {
                string[] p = s.Split('/', '.');
                giorno = int.Parse(p[0]);
                mese = int.Parse(p[1]);
                if (p.Length > 2) anno = (p[2].Length == 2) ? 2000 + int.Parse(p[2]) : int.Parse(p[2]);
                else anno = (mese >= 9) ? annoInizio : annoInizio + 1;
            }
            if (anno < 2000 || anno > 2100 || mese < 1 || mese > 12 || giorno < 1) return false;
            if (giorno > DateTime.DaysInMonth(anno, mese)) return false;
            d = new DateTime(anno, mese, giorno);
            return true;
        }

        /// <summary>La riga come la scrive la pagina: "01/11/2026 Tutti i Santi" o "23/12/2026-06/01/2027 Natale".</summary>
        public static string Riga(Sospensione s)
        {
            string dal = s.Dal.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            string date = (s.Al.Date == s.Dal.Date) ? dal : dal + "-" + s.Al.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            return (s.Nome ?? "") == "" ? date : date + " " + s.Nome;
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
