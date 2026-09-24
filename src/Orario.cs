// ===========================================================================
//  Orario.cs - riconoscimento del tabellone e preparazione dei dati
//
//  Il formato di riferimento e' il "TABELLONE DOCENTI" prodotto da Orario
//  Facile: una riga per docente, e in orizzontale i giorni, ognuno diviso
//  nelle sue ore. Nelle celle c'e' la classe (oppure "D" = a disposizione).
//
//        |        LUN        |        MAR        | ...
//        | 1 2 3 4 5 6 7 8   | 1 2 3 4 5 6 7 8   |
//   ROSSI|     A5 AF A5 AF   | D D     A2 B      |
//
//  Il riconoscimento non e' legato a quel programma: cerca la riga dei
//  giorni e quella delle ore, quindi si adatta a tabelloni simili. In
//  alternativa capisce anche una tabella con le colonne
//  Docente | Giorno | Ora | Classe.
//
//  In fondo c'e' la generazione di DatiOrari.gs: i dati che lo script
//  dentro Google usa per le email (tutte a te stesso) e per il calendario.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Campanella
{
    class RisultatoOrario
    {
        public List<Lezione> Lezioni = new List<Lezione>();
        public List<string> Giorni = new List<string>();
        // per ogni colonna di Giorni, il giorno della settimana (0 = lunedi'):
        // Lezione.Giorno e' sempre il giorno, la colonna si cerca qui
        public List<int> IndiciGiorni = new List<int>();
        public int OrePerGiorno = 0;
        public string Periodo = "";
        public string Titolo = "";
        public string Formato = "";
        public List<string> Avvisi = new List<string>();
        // ripreso dai dati di una versione precedente, senza le colonne: vale
        // finche' il file dell'orario non viene riletto (vedi Ripristina)
        public bool DaRicaricare = false;

        /// <summary>La colonna del giorno (0 = lunedi'), oppure -1 se il giorno non c'e'.</summary>
        public int Colonna(int giorno)
        {
            return IndiciGiorni.IndexOf(giorno);
        }

        /// <summary>Mette nello stato cio' che serve a ritrovare l'orario dopo un riavvio.</summary>
        public void SalvaIn(Stato s)
        {
            s.Lezioni = new List<Lezione>(Lezioni);
            // colonne ricavate da dati vecchi non si salvano come buone: senza,
            // l'invito a ricaricare il file resta anche dopo un riavvio
            s.GiorniOrari = DaRicaricare ? new List<int>() : new List<int>(IndiciGiorni);
            s.OreOrari = OrePerGiorno;
            s.PeriodoOrari = Periodo ?? "";
        }

        /// <summary>
        /// L'orario salvato nello stato, con le colonne di allora. I dati di
        /// una versione precedente non hanno l'elenco delle colonne: le
        /// ricavo dai giorni delle lezioni, e negli avvisi chiedo di
        /// ricaricare il file.
        /// </summary>
        public static RisultatoOrario Ripristina(Stato s)
        {
            RisultatoOrario o = new RisultatoOrario();
            o.Lezioni = new List<Lezione>(s.Lezioni);
            o.Periodo = s.PeriodoOrari ?? "";
            o.Formato = "ripreso dalle impostazioni salvate";

            int maxOra = 0;
            List<int> visti = new List<int>();
            foreach (Lezione l in s.Lezioni)
            {
                if (l.Ora > maxOra) maxOra = l.Ora;
                if (l.Giorno >= 0 && l.Giorno < Lezione.Giorni.Length && !visti.Contains(l.Giorno))
                    visti.Add(l.Giorno);
            }
            List<int> colonne = new List<int>();
            foreach (int g in s.GiorniOrari)
                if (g >= 0 && g < Lezione.Giorni.Length && !colonne.Contains(g)) colonne.Add(g);
            if (colonne.Count == 0)
            {
                visti.Sort();
                colonne = visti;
                // Nella 1.4.x il giorno di una tabella Docente/Giorno/Ora era
                // la posizione fra i giorni trovati: senza lunedi' (o con un
                // giorno saltato) le lezioni cadrebbero un giorno prima. Da
                // qui non si distingue: si chiede di rileggere il file una volta
                if (o.Lezioni.Count > 0)
                {
                    o.DaRicaricare = true;
                    o.Avvisi.Add("Questo orario e' stato salvato da una versione precedente di " +
                                 "Campanella: ricarica una volta il file dell'orario, cosi' ogni " +
                                 "lezione resta sotto il suo giorno anche se nel file manca qualche " +
                                 "giorno (per esempio il lunedi').");
                }
            }

            foreach (int g in colonne)
            {
                o.IndiciGiorni.Add(g);
                o.Giorni.Add(Lezione.Giorni[g]);
            }
            o.OrePerGiorno = Math.Max(Math.Max(1, maxOra), s.OreOrari);
            return o;
        }

        public List<string> Docenti()
        {
            List<string> fuori = new List<string>();
            foreach (Lezione l in Lezioni)
                if (l.Docente != "" && !fuori.Contains(l.Docente)) fuori.Add(l.Docente);
            fuori.Sort(StringComparer.CurrentCultureIgnoreCase);
            return fuori;
        }

        public List<string> Classi()
        {
            List<string> fuori = new List<string>();
            foreach (Lezione l in Lezioni)
            {
                if (l.Classe == "" || EDisposizione(l.Classe)) continue;
                if (!fuori.Contains(l.Classe)) fuori.Add(l.Classe);
            }
            fuori.Sort(StringComparer.CurrentCultureIgnoreCase);
            return fuori;
        }

        public bool EDisposizione(string cella)
        {
            if (cella == null) return false;
            string c = cella.Trim().ToUpperInvariant();
            return c == "D" || c == "DISP" || c == "DISP." || c == "DISPOSIZIONE";
        }

        /// <summary>Griglia giorni x ore di un docente: [ora, colonna] -> classe.</summary>
        public string[,] GrigliaDocente(string docente)
        {
            string[,] g = new string[Math.Max(1, OrePerGiorno), Math.Max(1, Giorni.Count)];
            foreach (Lezione l in Lezioni)
            {
                if (!string.Equals(l.Docente, docente, StringComparison.CurrentCultureIgnoreCase)) continue;
                if (l.Ora < 1 || l.Ora > OrePerGiorno) continue;
                int d = Colonna(l.Giorno);
                if (d < 0 || d >= Giorni.Count) continue;
                g[l.Ora - 1, d] = l.Classe;
            }
            return g;
        }

        /// <summary>Griglia giorni x ore di una classe: [ora, colonna] -> docente.</summary>
        public string[,] GrigliaClasse(string classe)
        {
            string[,] g = new string[Math.Max(1, OrePerGiorno), Math.Max(1, Giorni.Count)];
            foreach (Lezione l in Lezioni)
            {
                if (!string.Equals(l.Classe, classe, StringComparison.CurrentCultureIgnoreCase)) continue;
                if (l.Ora < 1 || l.Ora > OrePerGiorno) continue;
                int d = Colonna(l.Giorno);
                if (d < 0 || d >= Giorni.Count) continue;
                string gia = g[l.Ora - 1, d];
                // due docenti nella stessa ora (compresenza): li metto insieme
                g[l.Ora - 1, d] = string.IsNullOrEmpty(gia) ? l.Docente : gia + " + " + l.Docente;
            }
            return g;
        }

        public int OreDi(string docente)
        {
            int n = 0;
            foreach (Lezione l in Lezioni)
                if (string.Equals(l.Docente, docente, StringComparison.CurrentCultureIgnoreCase) &&
                    !EDisposizione(l.Classe)) n++;
            return n;
        }

        /// <summary>Il docente cosi' com'e' scritto nel tabellone, cercato senza badare a maiuscole e accenti.</summary>
        public string TrovaDocente(string nome)
        {
            string chiave = Stato.Chiave(nome);
            if (chiave == "") return "";
            foreach (string d in Docenti()) if (Stato.Chiave(d) == chiave) return d;
            // "ROSSI M" scritto "ROSSI": basta che cominci cosi'
            foreach (string d in Docenti()) if (Stato.Chiave(d).StartsWith(chiave)) return d;
            return "";
        }
    }

    /// <summary>Ore consecutive della stessa classe nello stesso giorno: un evento solo.</summary>
    class BloccoOrario
    {
        public int Giorno;        // indice in Giorni
        public int OraDa;         // 1 = prima ora
        public int OraA;          // ultima ora compresa
        public string Testo = "";
    }

    static class AnalisiOrario
    {
        static readonly string[][] NomiGiorni =
        {
            new string[] { "LUN", "LUNEDI", "LUNEDÌ", "MONDAY" },
            new string[] { "MAR", "MARTEDI", "MARTEDÌ", "TUESDAY" },
            new string[] { "MER", "MERCOLEDI", "MERCOLEDÌ", "WEDNESDAY" },
            new string[] { "GIO", "GIOVEDI", "GIOVEDÌ", "THURSDAY" },
            new string[] { "VEN", "VENERDI", "VENERDÌ", "FRIDAY" },
            new string[] { "SAB", "SABATO", "SATURDAY" },
            new string[] { "DOM", "DOMENICA", "SUNDAY" }
        };

        public static int IndiceGiorno(string testo)
        {
            if (string.IsNullOrEmpty(testo)) return -1;
            string t = Stato.SenzaAccenti(testo).Trim().ToUpperInvariant().TrimEnd('.', ':', '\'');
            for (int g = 0; g < NomiGiorni.Length; g++)
                foreach (string n in NomiGiorni[g])
                    if (t == Stato.SenzaAccenti(n).ToUpperInvariant()) return g;
            return -1;
        }

        // ===================================================================
        public static RisultatoOrario Analizza(FoglioExcel f)
        {
            RisultatoOrario tabellone = AnalizzaTabellone(f);
            if (tabellone != null && tabellone.Lezioni.Count > 0) return tabellone;

            RisultatoOrario tabella = AnalizzaTabella(f);
            if (tabella != null && tabella.Lezioni.Count > 0) return tabella;

            RisultatoOrario vuoto = new RisultatoOrario();
            vuoto.Formato = "non riconosciuto";
            vuoto.Avvisi.Add(
                "Non ho riconosciuto la struttura del foglio.\n\n" +
                "Vanno bene due forme:\n" +
                "  - un tabellone: una riga per docente, in alto i giorni e sotto le ore;\n" +
                "  - una tabella con le colonne Docente, Giorno, Ora, Classe.\n\n" +
                "Se il foglio ha piu' schede, prova a sceglierne un'altra.");
            return vuoto;
        }

        // -------------------------------------------------------------------
        //  FORMA 1: il tabellone
        // -------------------------------------------------------------------
        static RisultatoOrario AnalizzaTabellone(FoglioExcel f)
        {
            // 1. la riga dei giorni e' quella con piu' nomi di giorno
            int rigaGiorni = -1, quantiGiorni = 0;
            for (int r = 0; r < Math.Min(f.NumeroRighe, 40); r++)
            {
                int n = 0;
                for (int c = 0; c < f.Colonne; c++) if (IndiceGiorno(f.Cella(r, c)) >= 0) n++;
                if (n > quantiGiorni) { quantiGiorni = n; rigaGiorni = r; }
            }
            if (rigaGiorni < 0 || quantiGiorni < 3) return null;

            // 2. dove comincia ogni giorno
            List<int> inizi = new List<int>();
            List<int> indici = new List<int>();
            for (int c = 0; c < f.Colonne; c++)
            {
                int g = IndiceGiorno(f.Cella(rigaGiorni, c));
                if (g < 0) continue;
                inizi.Add(c);
                indici.Add(g);
            }

            RisultatoOrario o = new RisultatoOrario();
            o.Formato = "tabellone docenti";
            foreach (int g in indici)
            {
                o.Giorni.Add(Lezione.Giorni[g]);
                o.IndiciGiorni.Add(g);
            }

            // 3. la riga sotto contiene i numeri delle ore
            int rigaOre = rigaGiorni + 1;
            int orePerGiorno = 0;
            if (rigaOre < f.NumeroRighe)
            {
                int n = 0;
                for (int c = inizi[0]; c < f.Colonne; c++)
                {
                    int numero;
                    if (!int.TryParse(f.Cella(rigaOre, c).Trim(), out numero)) break;
                    if (numero == 1 && n > 0) break;    // ricomincia: e' il giorno dopo
                    n++;
                }
                orePerGiorno = n;
            }
            // se non ci sono i numeri, deduco le ore dalla distanza fra i giorni
            if (orePerGiorno <= 0)
            {
                rigaOre = rigaGiorni;
                orePerGiorno = (inizi.Count > 1) ? inizi[1] - inizi[0] : 1;
            }
            if (orePerGiorno <= 0 || orePerGiorno > 24) return null;
            o.OrePerGiorno = orePerGiorno;

            // 4. titolo e periodo, se ci sono nelle righe di intestazione
            for (int r = 0; r < rigaGiorni; r++)
            {
                for (int c = 0; c < Math.Min(f.Colonne, 12); c++)
                {
                    string v = f.Cella(r, c).Trim();
                    if (v == "") continue;
                    if (o.Titolo == "" && v.Length > 3) o.Titolo = v;
                    if (Regex.IsMatch(v, @"\b(dal|settimana|orario|periodo)\b", RegexOptions.IgnoreCase) &&
                        Regex.IsMatch(v, @"\d")) o.Periodo = v;
                }
            }

            // 5. le righe dei docenti
            for (int r = rigaOre + 1; r < f.NumeroRighe; r++)
            {
                string docente = "";
                for (int c = 0; c < inizi[0]; c++)
                {
                    string v = f.Cella(r, c).Trim();
                    if (v != "") { docente = v; break; }
                }
                if (docente == "") continue;
                if (Regex.IsMatch(docente, @"copyright|orariofacile|www\.", RegexOptions.IgnoreCase)) continue;
                if (IndiceGiorno(docente) >= 0) continue;

                int celle = 0;
                for (int g = 0; g < inizi.Count; g++)
                {
                    for (int h = 0; h < orePerGiorno; h++)
                    {
                        string v = f.Cella(r, inizi[g] + h).Trim();
                        if (v == "") continue;
                        Lezione l = new Lezione();
                        l.Docente = docente;
                        l.Giorno = indici[g];
                        l.Ora = h + 1;
                        l.Classe = v;
                        o.Lezioni.Add(l);
                        celle++;
                    }
                }
                if (celle == 0)
                {
                    // riga con il solo nome: probabilmente un docente senza ore
                    Lezione vuota = new Lezione();
                    vuota.Docente = docente;
                    vuota.Giorno = indici[0];
                    vuota.Ora = 0;
                    o.Lezioni.Add(vuota);
                }
            }

            // 6. controlli e avvisi
            int disposizioni = 0;
            foreach (Lezione l in o.Lezioni) if (o.EDisposizione(l.Classe)) disposizioni++;
            if (disposizioni > 0)
                o.Avvisi.Add("Trovate " + disposizioni + " ore segnate \"D\": le tratto come ore " +
                             "a disposizione e nelle email compaiono come \"a disposizione\".");
            return o;
        }

        // -------------------------------------------------------------------
        //  FORMA 2: una riga per lezione
        // -------------------------------------------------------------------
        static RisultatoOrario AnalizzaTabella(FoglioExcel f)
        {
            int rigaTitoli = -1;
            int cDocente = -1, cGiorno = -1, cOra = -1, cClasse = -1;

            for (int r = 0; r < Math.Min(f.NumeroRighe, 20) && rigaTitoli < 0; r++)
            {
                int d = -1, g = -1, o = -1, cl = -1;
                for (int c = 0; c < f.Colonne; c++)
                {
                    string v = Stato.SenzaAccenti(f.Cella(r, c)).Trim().ToLowerInvariant();
                    if (v == "") continue;
                    if (d < 0 && (v.StartsWith("docente") || v.StartsWith("insegnante") ||
                                  v.StartsWith("professore") || v == "cognome")) d = c;
                    else if (g < 0 && v.StartsWith("giorno")) g = c;
                    else if (o < 0 && (v.StartsWith("ora") || v == "modulo")) o = c;
                    else if (cl < 0 && (v.StartsWith("classe") || v.StartsWith("sezione"))) cl = c;
                }
                if (d >= 0 && g >= 0 && o >= 0)
                {
                    rigaTitoli = r;
                    cDocente = d; cGiorno = g; cOra = o; cClasse = cl;
                }
            }
            if (rigaTitoli < 0) return null;

            RisultatoOrario res = new RisultatoOrario();
            res.Formato = "tabella Docente / Giorno / Ora";
            int maxOra = 0;
            List<int> giorniVisti = new List<int>();

            for (int r = rigaTitoli + 1; r < f.NumeroRighe; r++)
            {
                string docente = f.Cella(r, cDocente).Trim();
                if (docente == "") continue;
                int giorno = IndiceGiorno(f.Cella(r, cGiorno));
                if (giorno < 0)
                {
                    int numero;
                    if (int.TryParse(f.Cella(r, cGiorno).Trim(), out numero) && numero >= 1 && numero <= 7)
                        giorno = numero - 1;
                    else continue;
                }
                int ora;
                if (!int.TryParse(Regex.Replace(f.Cella(r, cOra), @"[^\d]", ""), out ora)) continue;

                Lezione l = new Lezione();
                l.Docente = docente;
                l.Giorno = giorno;
                l.Ora = ora;
                l.Classe = (cClasse >= 0) ? f.Cella(r, cClasse).Trim() : "";
                res.Lezioni.Add(l);

                if (ora > maxOra) maxOra = ora;
                if (!giorniVisti.Contains(giorno)) giorniVisti.Add(giorno);
            }

            // le colonne sono i giorni trovati; Lezione.Giorno resta il giorno
            giorniVisti.Sort();
            foreach (int g in giorniVisti)
            {
                res.Giorni.Add(Lezione.Giorni[g]);
                res.IndiciGiorni.Add(g);
            }
            res.OrePerGiorno = Math.Max(1, maxOra);
            return res;
        }

        // ===================================================================
        //  ORARIO DELLE ORE E BLOCCHI, PER IL CALENDARIO
        // ===================================================================

        /// <summary>Vero se e' un orario nella forma 8:00 o 08:00.</summary>
        public static bool OraValida(string s)
        {
            return Regex.IsMatch((s ?? "").Trim(), @"^\d{1,2}:\d{2}$");
        }

        /// <summary>
        /// L'inizio di ogni ora di lezione: quelli scritti a mano se ci sono,
        /// altrimenti la prima ora piu' n volte la durata. Torna "HH:mm".
        /// </summary>
        public static List<string> InizioOre(string listaScritta, string primaOra, int minuti, int ore)
        {
            List<string> fuori = new List<string>();
            foreach (string p in (listaScritta ?? "").Split(new char[] { ',', ';', ' ', '\n', '\r', '\t' },
                                                            StringSplitOptions.RemoveEmptyEntries))
                if (OraValida(p)) fuori.Add(Normalizza(p));

            if (!OraValida(primaOra)) primaOra = "08:00";
            if (minuti < 5) minuti = 60;
            TimeSpan base1 = Leggi(fuori.Count > 0 ? fuori[fuori.Count - 1] : primaOra);
            int daAggiungere = ore - fuori.Count;
            if (fuori.Count == 0) { fuori.Add(Normalizza(primaOra)); base1 = Leggi(primaOra); daAggiungere--; }
            for (int i = 0; i < daAggiungere; i++)
            {
                base1 = base1.Add(TimeSpan.FromMinutes(minuti));
                fuori.Add(Scrivi(base1));
            }
            if (fuori.Count > ore) fuori.RemoveRange(ore, fuori.Count - ore);
            return fuori;
        }

        static TimeSpan Leggi(string hhmm)
        {
            string[] p = hhmm.Trim().Split(':');
            return new TimeSpan(int.Parse(p[0]), int.Parse(p[1]), 0);
        }

        static string Scrivi(TimeSpan t) { return t.Hours.ToString("00") + ":" + t.Minutes.ToString("00"); }

        static string Normalizza(string hhmm) { return Scrivi(Leggi(hhmm)); }

        /// <summary>Le ore consecutive della stessa classe diventano un blocco solo.</summary>
        public static List<BloccoOrario> Blocchi(string[,] griglia, RisultatoOrario o)
        {
            List<BloccoOrario> fuori = new List<BloccoOrario>();
            int ore = griglia.GetLength(0), giorni = griglia.GetLength(1);
            for (int d = 0; d < giorni; d++)
            {
                BloccoOrario aperto = null;
                for (int h = 0; h < ore; h++)
                {
                    string v = (griglia[h, d] ?? "").Trim();
                    string testo = (v == "") ? "" : (o.EDisposizione(v) ? "A disposizione" : v);
                    if (aperto != null && testo != "" && testo == aperto.Testo && aperto.OraA == h)
                    {
                        aperto.OraA = h + 1;
                        continue;
                    }
                    if (testo == "") { aperto = null; continue; }
                    aperto = new BloccoOrario();
                    aperto.Giorno = d; aperto.OraDa = h + 1; aperto.OraA = h + 1; aperto.Testo = testo;
                    fuori.Add(aperto);
                }
            }
            return fuori;
        }

        // ===================================================================
        //  GENERAZIONE DEI DATI PER APPS SCRIPT
        // ===================================================================
        public static string GeneraDatiGs(RisultatoOrario o, Stato s, bool includiClassi)
        {
            StringBuilder sb = new StringBuilder();
            string periodo = TestoCommento(o.Periodo);
            sb.AppendLine("/* =========================================================================");
            sb.AppendLine("   DATI DEGLI ORARI - generati il " + DateTime.Now.ToString("dd/MM/yyyy HH:mm"));
            sb.AppendLine("   " + (periodo != "" ? periodo : "periodo non indicato"));
            sb.AppendLine();
            sb.AppendLine("   Questo file contiene soltanto dati: cognomi, classi e ore, come nel");
            sb.AppendLine("   tabellone, e per il calendario i giorni senza lezione, con il nome che");
            sb.AppendLine("   hai scritto. Niente indirizzi: le email arrivano tutte a te.");
            sb.AppendLine("   Sostituiscilo ogni volta che l'orario cambia, rigenerandolo");
            sb.AppendLine("   dall'applicazione.");
            sb.AppendLine("   ========================================================================= */");
            sb.AppendLine();
            sb.AppendLine("var ORARI = {");
            sb.AppendLine("  periodo:  \"" + Js(o.Periodo) + "\",");
            sb.AppendLine("  titolo:   \"" + Js(o.Titolo) + "\",");
            sb.AppendLine("  nota:     \"" + Js(s.NotaOrari) + "\",");
            sb.AppendLine("  oggettoDocente: \"" + Js(s.OggettoOrari) + "\",");
            sb.AppendLine("  oggettoClasse:  \"" + Js(s.OggettoOrariClasse) + "\",");
            sb.AppendLine("  ore:      " + o.OrePerGiorno + ",");
            sb.Append("  giorni:   [");
            for (int i = 0; i < o.Giorni.Count; i++)
                sb.Append((i > 0 ? ", " : "") + "\"" + Js(o.Giorni[i]) + "\"");
            sb.AppendLine("],");
            sb.AppendLine();

            List<string> docenti = o.Docenti();
            sb.AppendLine("  // " + docenti.Count + " docenti");
            sb.AppendLine("  docenti: [");
            for (int i = 0; i < docenti.Count; i++)
            {
                string d = docenti[i];
                sb.AppendLine("    { nome: \"" + Js(d) + "\",");
                sb.AppendLine("      celle: " + CelleJs(o.GrigliaDocente(d), o) + " }" +
                              (i < docenti.Count - 1 ? "," : ""));
            }
            sb.AppendLine("  ],");

            if (includiClassi)
            {
                List<string> classi = o.Classi();
                sb.AppendLine();
                sb.AppendLine("  // " + classi.Count + " classi");
                sb.AppendLine("  classi: [");
                for (int i = 0; i < classi.Count; i++)
                {
                    sb.AppendLine("    { nome: \"" + Js(classi[i]) + "\",");
                    sb.AppendLine("      celle: " + CelleJs(o.GrigliaClasse(classi[i]), o) + " }" +
                                  (i < classi.Count - 1 ? "," : ""));
                }
                sb.AppendLine("  ],");
            }

            string docenteCal = o.TrovaDocente(s.CalDocente);
            sb.AppendLine();
            if (docenteCal != "")
            {
                List<string> inizi = InizioOre(s.CalOreInizio, s.CalPrimaOra, s.CalMinutiOra, o.OrePerGiorno);
                sb.AppendLine("  // il tuo orario da mettere su Google Calendar (ORARI_4_calendario; se cambia, ORARI_5_cambioOrario)");
                sb.AppendLine("  calendario: {");
                sb.AppendLine("    docente:   \"" + Js(docenteCal) + "\",");
                sb.AppendLine("    nome:      \"" + Js(s.CalNome != "" ? s.CalNome : "Orario " + docenteCal) + "\",");
                sb.AppendLine("    inizio:    \"" + Js(s.CalInizio) + "\",     // primo giorno, aaaa-mm-gg");
                sb.AppendLine("    fine:      \"" + Js(s.CalFine) + "\",     // ultimo giorno compreso");
                sb.AppendLine("    minutiOra: " + Math.Max(5, s.CalMinutiOra) + ",");
                sb.Append("    inizioOre: [");
                for (int i = 0; i < inizi.Count; i++) sb.Append((i > 0 ? ", " : "") + "\"" + inizi[i] + "\"");
                sb.AppendLine("],   // quando comincia ogni ora di lezione");
                sb.AppendLine("    colore:    \"" + Js(s.CalColore) + "\",     // vuoto = colore scelto da Google");

                // i giorni senza lezione: solo le righe capite, con le date
                // intere (l'anno delle righe che non ce l'hanno e' gia' deciso qui)
                DateTime inizioPeriodo;
                if (!DateTime.TryParseExact(s.CalInizio ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture,
                                            DateTimeStyles.None, out inizioPeriodo))
                    inizioPeriodo = DateTime.Today;
                List<string> nonCapite;
                List<Sospensione> sospensioni = Calendario.Leggi(s.CalSospensioni, inizioPeriodo, out nonCapite);
                sb.AppendLine("    // i giorni senza lezione: in quei giorni sul calendario non c'e' nessuna lezione");
                if (sospensioni.Count == 0) sb.AppendLine("    sospensioni: [],");
                else
                {
                    sb.AppendLine("    sospensioni: [");
                    for (int i = 0; i < sospensioni.Count; i++)
                    {
                        Sospensione x = sospensioni[i];
                        sb.AppendLine("      { dal: \"" + x.Dal.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) +
                                      "\", al: \"" + x.Al.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) +
                                      "\", nome: \"" + Js(x.Nome) + "\" }" + (i < sospensioni.Count - 1 ? "," : ""));
                    }
                    sb.AppendLine("    ],");
                }
                DateTime validoDal;
                string cambio = DateTime.TryParseExact(s.CalValidoDal ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture,
                                                       DateTimeStyles.None, out validoDal) ? s.CalValidoDal : "";
                sb.AppendLine("    validoDal: \"" + cambio + "\"   // l'orario cambiato vale da qui (ORARI_5_cambioOrario); vuoto = nessun cambio");
                sb.AppendLine("  }");
            }
            else
            {
                sb.AppendLine("  // calendario: nessun nome scelto nel passo 4 dell'applicazione");
                sb.AppendLine("  calendario: null");
            }

            sb.AppendLine("};");
            return sb.ToString();
        }

        /// <summary>La griglia diventa un array piatto: prima tutte le ore del giorno 1.</summary>
        static string CelleJs(string[,] g, RisultatoOrario o)
        {
            StringBuilder sb = new StringBuilder("[");
            int ore = g.GetLength(0), giorni = g.GetLength(1);
            for (int d = 0; d < giorni; d++)
            {
                for (int h = 0; h < ore; h++)
                {
                    if (d > 0 || h > 0) sb.Append(",");
                    string v = g[h, d] ?? "";
                    sb.Append("\"").Append(Js(v)).Append("\"");
                }
            }
            sb.Append("]");
            return sb.ToString();
        }

        public static string Js(string s)
        {
            return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"")
                            .Replace("\r", "").Replace("\n", "\\n");
        }

        /// <summary>
        /// Un testo letto dal file dell'utente, pronto per stare dentro un
        /// commento /* ... */ dello script: spazi e a capo (compresi U+2028 e
        /// U+2029) diventano uno spazio solo, e "*/" non chiude piu' il
        /// commento. Senza, una cella del tabellone diventerebbe codice.
        /// </summary>
        public static string TestoCommento(string s)
        {
            string t = Regex.Replace(s ?? "", @"[\s\u0085  ]+", " ").Trim();
            while (t.Contains("*/")) t = t.Replace("*/", "* /");
            return t;
        }
    }
}
