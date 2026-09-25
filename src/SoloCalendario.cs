// ===========================================================================
//  SoloCalendario.cs - l'orario nel Google Calendar di un altro account
//
//  Lo script della Posta e degli Orari gira nell'account della scuola. Chi
//  usa il Google Calendar di un altro account (il suo personale, per
//  esempio) mette l'orario da li': in un progetto Apps Script di
//  quell'account incolla Calendario.gs, la versione solo calendario di
//  Orari.gs, e un DatiOrari.gs con il solo suo orario
//  (AnalisiOrario.GeneraDatiDelDocenteGs). Calendario.gs nasce da Orari.gs,
//  la risorsa incorporata:
//
//    - l'intestazione di Orari.gs (il primo commento, da "/**" al primo
//      "*/") lascia il posto a Calendario_intestazione.txt, con la versione
//      di Orari.gs al posto di {versione};
//    - le righe fra "// [SOLO EMAIL]" e "// [FINE SOLO EMAIL]" (i segni
//      compresi) si tolgono: servono solo alle email (l'invio, i messaggi,
//      l'etichetta, il tuo indirizzo);
//    - le righe fra "// [SOLO CALENDARIO.GS]" e "// [FINE SOLO CALENDARIO.GS]"
//      in Orari.gs sono commenti: qui perdono il "// " in testa e diventano
//      codice;
//    - un segno e' una riga che comincia cosi' (dopo gli spazi); piu' di due
//      righe vuote di fila diventano due; gli a capo sono \n.
//
//  test\solo_calendario.js fa la stessa cosa in JavaScript, per le prove
//  che girano senza l'eseguibile, e test\prova_orario.ps1 controlla che le
//  due diano lo stesso file. Se Calendario.gs nominasse ancora un servizio
//  delle email o dell'indirizzo (o uno che Campanella non usa, come il
//  Drive), Google chiederebbe anche quel permesso nell'altro account: Genera
//  allora si ferma, e l'applicazione non lo da'.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;

namespace Campanella
{
    static class SoloCalendario
    {
        public const string NomeFile = "Calendario.gs";
        public const string RisorsaIntestazione = "Calendario_intestazione.txt";

        public const string SegnoEmail = "// [SOLO EMAIL]";
        public const string FineEmail = "// [FINE SOLO EMAIL]";
        public const string SegnoCalendario = "// [SOLO CALENDARIO.GS]";
        public const string FineCalendario = "// [FINE SOLO CALENDARIO.GS]";

        /// <summary>
        /// I nomi che in Calendario.gs non ci devono essere, nemmeno in un
        /// commento: i servizi delle email e dell'indirizzo, e quelli che
        /// nessuno script di Campanella usa.
        /// </summary>
        public static readonly string[] Vietati =
        {
            "MailApp", "GmailApp", "Gmail", "sendEmail", "getActiveUser", "getEffectiveUser",
            "UrlFetchApp", "DriveApp", "DocumentApp", "SpreadsheetApp", "FormApp"
        };

        /// <summary>
        /// Calendario.gs dagli script incorporati. Se non si puo' preparare, un
        /// commento che dice perche' (incollato, non fa niente).
        /// </summary>
        public static string Codice()
        {
            string orari = Guscio.LeggiRisorsa("Orari.gs");
            string testa = Guscio.LeggiRisorsa(RisorsaIntestazione);
            if (orari == "" || testa == "") return "// Risorsa non trovata: ricompila l'applicazione.";
            try { return Genera(orari, testa); }
            catch (InvalidDataException ex)
            {
                return "// Non riesco a preparare Calendario.gs: " + ex.Message + ".\n" +
                       "// Per adesso metti l'orario dall'account della scuola, con Orari.gs.";
            }
        }

        /// <summary>
        /// Calendario.gs da Orari.gs e dall'intestazione: vedi in cima al file.
        /// Un segno aperto e non chiuso, uno che si chiude senza essere aperto,
        /// uno dentro l'altro, una riga "solo calendario" senza "// ", Orari.gs
        /// senza intestazione o senza versione, un nome vietato nel risultato:
        /// InvalidDataException, con il motivo.
        /// </summary>
        public static string Genera(string orari, string intestazione)
        {
            string testo = (orari ?? "").Replace("\r\n", "\n");
            Match v = Regex.Match(testo, @"\bvar\s+_ORARI_VERSIONE\s*=\s*'([0-9]+(?:\.[0-9]+)*)'");
            if (!v.Success) throw new InvalidDataException("in Orari.gs non trovo la versione (_ORARI_VERSIONE)");
            if (!testo.StartsWith("/**", StringComparison.Ordinal))
                throw new InvalidDataException("Orari.gs non comincia con la sua intestazione (/**)");
            int fineIntestazione = testo.IndexOf("*/", StringComparison.Ordinal);
            if (fineIntestazione < 0) throw new InvalidDataException("l'intestazione di Orari.gs non si chiude");
            string resto = testo.Substring(fineIntestazione + 2);
            if (resto.StartsWith("\n", StringComparison.Ordinal)) resto = resto.Substring(1);

            List<string> fuori = new List<string>();
            string dove = "";
            int riga = 0;
            foreach (string r in resto.Split('\n'))
            {
                riga++;
                string t = r.TrimStart(' ', '\t');
                string segno = t.StartsWith(SegnoEmail, StringComparison.Ordinal) ? "email"
                             : t.StartsWith(FineEmail, StringComparison.Ordinal) ? "fineEmail"
                             : t.StartsWith(SegnoCalendario, StringComparison.Ordinal) ? "calendario"
                             : t.StartsWith(FineCalendario, StringComparison.Ordinal) ? "fineCalendario" : "";
                if (segno == "email" || segno == "calendario")
                {
                    if (dove != "")
                        throw new InvalidDataException("riga " + riga + " dopo l'intestazione: " + Segno(segno) +
                                                       " dentro un altro blocco");
                    dove = segno;
                    continue;
                }
                if (segno == "fineEmail" || segno == "fineCalendario")
                {
                    if (dove != (segno == "fineEmail" ? "email" : "calendario"))
                        throw new InvalidDataException("riga " + riga + " dopo l'intestazione: " + Segno(segno) +
                                                       " senza il suo inizio");
                    dove = "";
                    continue;
                }
                if (dove == "email") continue;
                string scritta = r;
                if (dove == "calendario")
                {
                    string rientro = r.Substring(0, r.Length - t.Length);
                    if (t == "//") scritta = "";
                    else if (t.StartsWith("// ", StringComparison.Ordinal)) scritta = rientro + t.Substring(3);
                    else throw new InvalidDataException("riga " + riga + " dopo l'intestazione: nel blocco solo " +
                                                        "calendario manca \"// \" in testa");
                }
                // piu' di due righe vuote di fila diventano due
                int n = fuori.Count;
                if (Vuota(scritta) && n >= 2 && Vuota(fuori[n - 1]) && Vuota(fuori[n - 2])) continue;
                fuori.Add(scritta);
            }
            if (dove != "") throw new InvalidDataException("il blocco " + Segno(dove) + " non si chiude");

            string testa = (intestazione ?? "").Replace("\r\n", "\n").Replace("{versione}", v.Groups[1].Value).TrimEnd();
            string codice = testa + "\n" + string.Join("\n", fuori.ToArray());
            foreach (string nome in Vietati)
            {
                Match m = Regex.Match(codice, @"(?<![\w$])" + Regex.Escape(nome) + @"(?![\w$])");
                if (m.Success)
                    throw new InvalidDataException("nominerebbe " + nome + " (riga " +
                        (codice.Substring(0, m.Index).Split('\n').Length) + "), e Google ne chiederebbe il permesso");
            }
            return codice;
        }

        static string Segno(string quale)
        {
            switch (quale)
            {
                case "email": return SegnoEmail;
                case "fineEmail": return FineEmail;
                case "calendario": return SegnoCalendario;
                default: return FineCalendario;
            }
        }

        static bool Vuota(string s) { return s.Replace(" ", "").Replace("\t", "") == ""; }
    }
}
