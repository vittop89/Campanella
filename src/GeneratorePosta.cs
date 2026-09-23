// ===========================================================================
//  GeneratorePosta.cs - il file Configurazione.gs dello strumento Posta
//
//  Lavora solo sui dati dello Stato, senza finestre: la pagina Posta lo
//  chiama quando serve il testo, e test\prova_posta.ps1 lo chiama con dati
//  inventati e passa il risultato al banco test\mock_apps_script.js, che ci
//  fa girare lo script vero. Cosi' una chiave rinominata da una parte sola
//  (per esempio provaSenzaModifiche) si vede subito.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace Campanella
{
    static class GeneratorePosta
    {
        /// <summary>I mesi di posta da guardare per la scelta "Quanta posta guardare" (0 = tutta).</summary>
        public static int MesiDelPeriodo(int periodo)
        {
            if (periodo == 1) return 12;
            if (periodo == 2) return 24;
            if (periodo == 3) return 36;
            return 0;
        }

        /// <summary>
        /// Il testo di Configurazione.gs. Legge dallo Stato il dominio, gli
        /// indirizzi particolari, il personale, le regole e le opzioni (Periodo,
        /// Ore, Report, EscludiInviata); "quando" finisce nell'intestazione.
        /// </summary>
        public static string Configurazione(Stato s, bool prova, DateTime quando)
        {
            List<string> indirizzi = s.IndirizziPersonale();
            int mesi = MesiDelPeriodo(s.Periodo);

            StringBuilder sb = new StringBuilder();
            sb.AppendLine("/* =========================================================================");
            sb.AppendLine("   CONFIGURAZIONE DI \"ORGANIZZAZIONE GMAIL\"");
            sb.AppendLine("   Generata il " + quando.ToString("dd/MM/yyyy HH:mm") +
                          " dall'applicazione Campanella " + Aggiornamenti.VersioneCampanella + ".");
            sb.AppendLine();
            sb.AppendLine("   Puoi modificare i valori a mano: sono tutti scritti in chiaro.");
            sb.AppendLine("   Dopo ogni modifica salva con Ctrl+S.");
            sb.AppendLine("   ========================================================================= */");
            sb.AppendLine();
            sb.AppendLine("var CONFIG = {");
            sb.AppendLine();
            sb.AppendLine("  // ---- la tua scuola ---------------------------------------------------");
            sb.AppendLine("  dominioScuola:     \"" + AnalisiOrario.Js(s.DominioPulito()) + "\",");
            sb.AppendLine("  prefissoEtichette: \"" + AnalisiOrario.Js(s.PrefissoPulito()) + "\",");
            sb.AppendLine();
            sb.AppendLine("  // ---- come lavorare ---------------------------------------------------");
            sb.AppendLine("  provaSenzaModifiche: " + (prova ? "true" : "false") +
                          ",   // true = conta soltanto, non tocca niente");
            sb.AppendLine("  soloUltimiMesi:      " + mesi + ",       // 0 = tutta la posta");
            sb.AppendLine("  ogniQuanteOre:       " + s.Ore + ",");
            sb.AppendLine("  giorniPostaNuova:    3,");
            sb.AppendLine("  inviaReport:         " + (s.Report ? "true" : "false") + ",");
            sb.AppendLine("  escludiPostaInviata: " + (s.EscludiInviata ? "true" : "false") + ",");
            sb.AppendLine("  escludiGiaArchiviati: false,");
            sb.AppendLine("  anniDaEsaminare:     3,       // per EXTRA_elencaIndirizziScuola");
            sb.AppendLine();
            sb.AppendLine("  // ---- il personale della scuola (" + indirizzi.Count + " indirizzi) ----");
            if (indirizzi.Count == 0)
            {
                sb.AppendLine("  //  ATTENZIONE: elenco vuoto. La regola \"Colleghi\" non fara' niente e");
                sb.AppendLine("  //  tutta la posta del dominio finira' sotto \"Studenti\".");
                sb.AppendLine("  personale: [],");
            }
            else
            {
                sb.AppendLine("  personale: [");
                Dictionary<string, string> nota = new Dictionary<string, string>();
                foreach (Persona p in s.Personale)
                {
                    string e = (p.Email ?? "").Trim().ToLowerInvariant();
                    if (e == "" || nota.ContainsKey(e)) continue;
                    string n = p.Nome;
                    if (p.Ruolo != "" && p.Ruolo != "Non specificato")
                        n = (n == "" ? "" : n + " - ") + p.Ruolo;
                    nota[e] = n;
                }
                int larghezza = 0;
                foreach (string a in indirizzi) if (a.Length > larghezza) larghezza = a.Length;
                for (int i = 0; i < indirizzi.Count; i++)
                {
                    string virgola = (i < indirizzi.Count - 1) ? "," : " ";
                    string riga = "    \"" + AnalisiOrario.Js(indirizzi[i]) + "\"" + virgola;
                    string commento = nota.ContainsKey(indirizzi[i]) ? nota[indirizzi[i]] : "";
                    if (commento != "")
                    {
                        while (riga.Length < larghezza + 9) riga += " ";
                        riga += "  // " + SoloUnaRiga(commento);
                    }
                    sb.AppendLine(riga.TrimEnd());
                }
                sb.AppendLine("  ],");
            }
            // ---- lo stesso personale, diviso per ruolo ----
            Dictionary<string, List<string>> gruppi = s.EtichettaPerRuolo
                ? s.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            string colleghi = EtichettaColleghi(s.Regole);
            if (gruppi.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine("  // ---- lo stesso personale, diviso per ruolo ---------------------------");
                sb.AppendLine("  //  Da qui nascono le sottoetichette " + colleghi + "/Docenti,");
                sb.AppendLine("  //  " + colleghi + "/Amministrativi e cosi' via.");
                sb.AppendLine("  gruppi: {");
                List<string> nomi = CategoriePresenti(gruppi);
                for (int g = 0; g < nomi.Count; g++)
                {
                    List<string> dentro = gruppi[nomi[g]];
                    sb.AppendLine("    \"" + AnalisiOrario.Js(nomi[g]) + "\": [        // " + dentro.Count +
                                  (dentro.Count == 1 ? " indirizzo" : " indirizzi"));
                    for (int k = 0; k < dentro.Count; k += 3)
                    {
                        List<string> pezzo = new List<string>();
                        for (int j = k; j < Math.Min(k + 3, dentro.Count); j++)
                            pezzo.Add("\"" + AnalisiOrario.Js(dentro[j]) + "\"");
                        bool ultima = (k + 3 >= dentro.Count);
                        sb.AppendLine("      " + string.Join(", ", pezzo.ToArray()) + (ultima ? "" : ","));
                    }
                    sb.AppendLine("    ]" + (g < nomi.Count - 1 ? "," : ""));
                }
                sb.AppendLine("  },");
            }

            sb.AppendLine();
            sb.AppendLine("  // ---- le regole --------------------------------------------------------");
            sb.AppendLine("  //  Le etichette si sommano: un messaggio puo' prenderne piu' d'una.");
            sb.AppendLine("  //  L'ordine conta solo per escludiEtichette: Studenti va sotto le regole");
            sb.AppendLine("  //  che esclude (Colleghi, Dirigenza, Segreteria).");
            sb.AppendLine("  //  @PERSONALE@ = l'elenco qui sopra   \u00b7   @DOMINIO@ = tutto il dominio");
            if (gruppi.Count > 0)
                sb.AppendLine("  //  @GRUPPO:Docenti@ = solo quel gruppo qui sopra");
            sb.AppendLine("  regole: [");

            List<string> blocchi = new List<string>();
            for (int i = 0; i < s.Regole.Count; i++)
            {
                Regola r = s.Regole[i];
                List<string> da;
                if (r.Sorgente == "dirigenza") da = Righe(s.Dirigenza);
                else if (r.Sorgente == "segreteria") da = Righe(s.Segreteria);
                else if (r.Sorgente == "registro") da = Righe(s.Registro);
                else da = new List<string>(r.Da);

                bool inutile = da.Count == 0 && r.Oggetto.Count == 0 &&
                               r.Contiene.Count == 0 && r.QueryLibera == "";
                bool attiva = r.Attiva && !inutile;
                if (da.Count == 1 && da[0] == "@DOMINIO@" && s.DominioPulito() == "") attiva = false;
                // senza elenco del personale, Colleghi non ha nessuno da riconoscere
                if (da.Count == 1 && da[0] == "@PERSONALE@" && indirizzi.Count == 0) attiva = false;

                StringBuilder b = new StringBuilder();
                b.AppendLine("    {");
                b.AppendLine("      attiva:    " + (attiva ? "true" : "false") + ",");
                b.AppendLine("      etichetta: \"" + AnalisiOrario.Js(r.Etichetta) + "\",");
                if (da.Count > 0) b.AppendLine("      da:        " + ListaJs(da) + ",");
                if (r.Oggetto.Count > 0) b.AppendLine("      oggetto:   " + ListaJs(r.Oggetto) + ",");
                if (r.Contiene.Count > 0) b.AppendLine("      contiene:  " + ListaJs(r.Contiene) + ",");
                if (r.QueryLibera != "") b.AppendLine("      queryLibera: \"" + AnalisiOrario.Js(r.QueryLibera) + "\",");
                if (r.EscludiEtichette.Count > 0)
                    b.AppendLine("      escludiEtichette: " + ListaJs(r.EscludiEtichette) + ",");
                if (r.Archivia) b.AppendLine("      archivia:  true,");
                if (r.SegnaComeLette) b.AppendLine("      segnaComeLette: true,");
                b.AppendLine("      nota:      \"" + AnalisiOrario.Js(SoloUnaRiga(r.Descrizione)) + "\"");
                b.Append("    }");
                blocchi.Add(b.ToString());

                // subito sotto ai colleghi vanno le sottoetichette dei ruoli:
                // chi ci finisce dentro e' un sottoinsieme di quella regola
                if (gruppi.Count > 0 && colleghi == r.Etichetta)
                    foreach (string nome in CategoriePresenti(gruppi))
                        blocchi.Add(BloccoRuolo(r.Etichetta, nome, gruppi[nome].Count));
            }
            if (gruppi.Count > 0 && !ColleghiInElenco(s.Regole))
                foreach (string nome in CategoriePresenti(gruppi))
                    blocchi.Add(BloccoRuolo(colleghi, nome, gruppi[nome].Count));

            sb.AppendLine(string.Join("," + Environment.NewLine, blocchi.ToArray()));
            sb.AppendLine("  ]");
            sb.AppendLine("};");
            return sb.ToString();
        }

        /// <summary>
        /// Il collegamento a un messaggio nuovo in Gmail, con l'account da usare
        /// (il tuo) e basta. Gli indirizzi dei colleghi non ci vanno mai: il
        /// collegamento resta nella cronologia del browser. Passano dagli appunti.
        /// </summary>
        public static string NuovoMessaggioGmail(string account)
        {
            string url = "https://mail.google.com/mail/?view=cm&fs=1";
            if (!string.IsNullOrEmpty(account)) url += "&authuser=" + Uri.EscapeDataString(account);
            return url;
        }

        /// <summary>
        /// Il manifest dell'estensione per Chrome con la versione di Campanella
        /// che la scrive: in chrome://extensions si vede quale copia e' caricata.
        /// </summary>
        public static string ManifestEstensione(string manifest, string versione)
        {
            return Regex.Replace(manifest ?? "", "(\"version\"\\s*:\\s*\")[^\"]*(\")",
                                 "${1}" + versione + "${2}");
        }

        /// <summary>Gli indirizzi scritti in una casella: uno per riga, o separati da virgole e spazi.</summary>
        public static List<string> Righe(string testo)
        {
            List<string> fuori = new List<string>();
            if (string.IsNullOrEmpty(testo)) return fuori;
            foreach (string p in testo.Split(new char[] { '\r', '\n', ',', ';', ' ', '\t' },
                                             StringSplitOptions.RemoveEmptyEntries))
            {
                string s = p.Trim();
                if (s != "" && !fuori.Contains(s)) fuori.Add(s);
            }
            return fuori;
        }

        /// <summary>L'etichetta sotto cui mettere i ruoli: quella dei colleghi.</summary>
        public static string EtichettaColleghi(List<Regola> regole)
        {
            foreach (Regola r in regole)
                if (r.Etichetta.Trim().ToLowerInvariant() == "colleghi") return r.Etichetta;
            return "Colleghi";
        }

        static bool ColleghiInElenco(List<Regola> regole)
        {
            foreach (Regola r in regole)
                if (r.Etichetta.Trim().ToLowerInvariant() == "colleghi") return true;
            return false;
        }

        /// <summary>Le categorie che hanno qualcuno, nell'ordine di Stato.Categorie.</summary>
        public static List<string> CategoriePresenti(Dictionary<string, List<string>> gruppi)
        {
            List<string> fuori = new List<string>();
            foreach (string c in Stato.Categorie) if (gruppi.ContainsKey(c)) fuori.Add(c);
            return fuori;
        }

        static string BloccoRuolo(string baseEtichetta, string categoria, int quanti)
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine("    {");
            b.AppendLine("      attiva:    true,");
            b.AppendLine("      etichetta: \"" + AnalisiOrario.Js(baseEtichetta + "/" + categoria) + "\",");
            b.AppendLine("      da:        [\"@GRUPPO:" + AnalisiOrario.Js(categoria) + "@\"],");
            b.AppendLine("      nota:      \"" + AnalisiOrario.Js(categoria + ": " + quanti +
                         (quanti == 1 ? " indirizzo" : " indirizzi") +
                         " dall'elenco del personale.") + "\"");
            b.Append("    }");
            return b.ToString();
        }

        static string ListaJs(List<string> valori)
        {
            if (valori.Count == 0) return "[]";
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < valori.Count; i++)
            {
                if (i > 0) sb.Append(", ");
                sb.Append("\"").Append(AnalisiOrario.Js(valori[i])).Append("\"");
            }
            return sb.Append("]").ToString();
        }

        /// <summary>
        /// Tutto su una riga. Serve ai commenti "//" di Configurazione.gs: un a
        /// capo (anche U+2028 e U+2029, che per JavaScript lo sono) farebbe
        /// diventare codice il resto del testo.
        /// </summary>
        static string SoloUnaRiga(string s) { return Regex.Replace(s ?? "", @"\s+", " ").Trim(); }
    }
}
