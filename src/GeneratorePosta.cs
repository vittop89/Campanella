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
using System.Security.Cryptography;
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
        /// indirizzi particolari, il personale, le regole, le opzioni (Periodo,
        /// Ore, Report, EscludiInviata) e i filtri di Gmail da togliere;
        /// "quando" finisce nell'intestazione.
        /// </summary>
        public static string Configurazione(Stato s, bool prova, DateTime quando)
        {
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
            sb.Append(Corpo(s, prova, Impronta(s), true));
            return sb.ToString();
        }

        /// <summary>
        /// L'impronta della configurazione: 8 cifre esadecimali (i primi 4 byte
        /// dello SHA-1) di tutto CONFIG senza i commenti, tranne l'impronta
        /// stessa e provaSenzaModifiche. Data e versione di Campanella stanno
        /// nell'intestazione, e non contano; nemmeno nomi e ruoli scritti
        /// accanto agli indirizzi, che sono commenti e allo script non dicono
        /// niente. Cosi' le due copie del passo 6, con e senza prova, hanno la
        /// stessa impronta, e una regola spenta o un indirizzo cambiato la
        /// cambiano. PASSO_1_anteprima la stampa, e il passo 5 mostra quella di
        /// adesso: se non sono uguali, la configurazione incollata e' vecchia.
        /// </summary>
        public static string Impronta(Stato s)
        {
            // le righe fatte solo di commento vanno via qui; i commenti in fondo
            // alle righe dei dati o non ci sono (commenti = false) o non cambiano
            StringBuilder testo = new StringBuilder();
            foreach (string riga in Corpo(s, false, null, false).Replace("\r\n", "\n").Split('\n'))
                if (!riga.TrimStart().StartsWith("//")) testo.Append(riga).Append('\n');
            byte[] h;
            using (SHA1 sha = SHA1.Create()) h = sha.ComputeHash(Encoding.UTF8.GetBytes(testo.ToString()));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 4; i++) sb.Append(h[i].ToString("X2"));
            return sb.ToString();
        }

        /// <summary>
        /// Il testo da "var CONFIG = {" alla fine. Senza impronta (null) manca
        /// la sua riga; senza commenti mancano nome e ruolo accanto agli
        /// indirizzi del personale: e' il testo su cui l'impronta si calcola.
        /// </summary>
        static string Corpo(Stato s, bool prova, string impronta, bool commenti)
        {
            List<string> indirizzi = s.IndirizziPersonale();
            int mesi = MesiDelPeriodo(s.Periodo);

            StringBuilder sb = new StringBuilder();
            sb.AppendLine("var CONFIG = {");
            sb.AppendLine();
            if (impronta != null)
            {
                sb.AppendLine("  // ---- l'impronta di queste scelte ------------------------------------");
                sb.AppendLine("  //  PASSO_1_anteprima la scrive in cima; Campanella (Posta, passo 5)");
                sb.AppendLine("  //  mostra quella di adesso. Se sono diverse, copia di nuovo questo file.");
                sb.AppendLine("  impronta: \"" + impronta + "\",");
                sb.AppendLine();
            }
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
                    string commento = (commenti && nota.ContainsKey(indirizzi[i])) ? nota[indirizzi[i]] : "";
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
            sb.AppendLine("  //  colore = sfondo e testo dell'etichetta in Gmail, dalla tavolozza di Gmail:");
            sb.AppendLine("  //  li mette il servizio Gmail API (EXTRA_coloraEtichette).");
            // solo con le classi: chi non le usa ha la configurazione di prima
            if (ConClassi(s.Regole))
            {
                sb.AppendLine("  //  unoQualsiasi = basta l'oggetto (o le parole) oppure i mittenti, non tutti e due.");
                sb.AppendLine("  //  @CLASSE:3B@ = gli studenti della 3B: gli indirizzi non stanno qui, li porta il");
                sb.AppendLine("  //  file Classe_3B.gs (Posta, passo 4, \"Le mie classi...\"). Senza, conta l'oggetto.");
                sb.AppendLine("  //  Nei filtri veri di Gmail (EXTRA_creaFiltriGmail) gli studenti non vanno.");
            }
            sb.AppendLine("  regole: [");

            // le sottoetichette dei ruoli: sfumature del colore di Colleghi, o scelte a mano
            string coloreColleghi = ColoriEtichette.DeiColleghi(s.Regole);
            List<string> blocchi = new List<string>();
            for (int i = 0; i < s.Regole.Count; i++)
            {
                Regola r = s.Regole[i];
                List<string> da = MittentiDellaRegola(s, r);
                bool attiva = AttivaNellaConfigurazione(s, r, indirizzi);

                StringBuilder b = new StringBuilder();
                b.AppendLine("    {");
                b.AppendLine("      attiva:    " + (attiva ? "true" : "false") + ",");
                b.AppendLine("      etichetta: \"" + AnalisiOrario.Js(r.Etichetta) + "\",");
                if (da.Count > 0) b.AppendLine("      da:        " + ListaJs(da) + ",");
                if (r.Oggetto.Count > 0) b.AppendLine("      oggetto:   " + ListaJs(r.Oggetto) + ",");
                if (r.Contiene.Count > 0) b.AppendLine("      contiene:  " + ListaJs(r.Contiene) + ",");
                // solo se vero: le regole di sempre restano scritte come prima
                if (r.UnoQualsiasi) b.AppendLine("      unoQualsiasi: true,");
                if (r.QueryLibera != "") b.AppendLine("      queryLibera: \"" + AnalisiOrario.Js(r.QueryLibera) + "\",");
                if (r.EscludiEtichette.Count > 0)
                    b.AppendLine("      escludiEtichette: " + ListaJs(r.EscludiEtichette) + ",");
                if (r.Archivia) b.AppendLine("      archivia:  true,");
                if (r.SegnaComeLette) b.AppendLine("      segnaComeLette: true,");
                // solo un colore che Gmail accetta: uno scritto a mano che non va
                // non arriva allo script (nessun colore, come "" e come null)
                string colore = ColoriEtichette.Pulito(r.Colore);
                if (colore != "") b.AppendLine("      colore:    " + ColoreJs(colore) + ",");
                b.AppendLine("      nota:      \"" + AnalisiOrario.Js(SoloUnaRiga(r.Descrizione)) + "\"");
                b.Append("    }");
                blocchi.Add(b.ToString());

                // subito sotto ai colleghi vanno le sottoetichette dei ruoli:
                // chi ci finisce dentro e' un sottoinsieme di quella regola
                if (gruppi.Count > 0 && colleghi == r.Etichetta)
                    foreach (string nome in CategoriePresenti(gruppi))
                        blocchi.Add(BloccoRuolo(r.Etichetta, nome, gruppi[nome].Count,
                                                ColoriEtichette.DelRuolo(coloreColleghi, nome, s.ColoriRuoli)));
            }
            if (gruppi.Count > 0 && !ColleghiInElenco(s.Regole))
                foreach (string nome in CategoriePresenti(gruppi))
                    blocchi.Add(BloccoRuolo(colleghi, nome, gruppi[nome].Count,
                                            ColoriEtichette.DelRuolo(coloreColleghi, nome, s.ColoriRuoli)));

            sb.AppendLine(string.Join("," + Environment.NewLine, blocchi.ToArray()));
            List<string> filtri = FiltriJs(s);
            sb.AppendLine("  ]" + (filtri.Count > 0 ? "," : ""));
            if (filtri.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine("  // ---- i filtri di Gmail da togliere (EXTRA_togliFiltri) ---------------");
                sb.AppendLine("  //  Scelti in Campanella (Posta, passo 4) fra quelli che avevi gia'. Lo");
                sb.AppendLine("  //  script toglie solo il filtro che ha proprio questi criteri, nessuno in");
                sb.AppendLine("  //  piu', e mette proprio questa etichetta, dopo averne scritto una copia");
                sb.AppendLine("  //  nel registro. Serve il servizio Gmail API.");
                sb.AppendLine("  filtriDaTogliere: [");
                sb.AppendLine(string.Join("," + Environment.NewLine, filtri.ToArray()));
                sb.AppendLine("  ]");
            }
            sb.AppendLine("};");
            return sb.ToString();
        }

        /// <summary>
        /// Le voci di filtriDaTogliere, una per filtro scelto: l'etichetta e i
        /// criteri con i nomi del servizio Gmail API, i si'/no come true e la
        /// dimensione come numero, come li da' il servizio. Una voce che non
        /// si capisce tutta (FiltroDaTogliere.Da) non si scrive, e una ripetuta
        /// si scrive una volta; nemmeno una che sembra di una classe e cerca
        /// degli indirizzi (FiltriGmail.DiUnaClasseConIndirizzi).
        /// </summary>
        static List<string> FiltriJs(Stato s)
        {
            List<string> fuori = new List<string>(), chiavi = new List<string>();
            if (s.FiltriDaTogliere == null) return fuori;
            foreach (FiltroDaTogliere scelto in s.FiltriDaTogliere)
            {
                // uno che sembra di una classe e cerca degli indirizzi, scelto
                // prima: porterebbe qui gli indirizzi degli studenti
                if (scelto == null || FiltriGmail.DiUnaClasseConIndirizzi(scelto.Etichetta, scelto.Criteri, s)) continue;
                List<KeyValuePair<string, object>> grezzi = new List<KeyValuePair<string, object>>();
                foreach (KeyValuePair<string, string> kv in scelto.Criteri)
                    grezzi.Add(new KeyValuePair<string, object>(kv.Key, kv.Value));
                FiltroDaTogliere f = FiltroDaTogliere.Da(scelto.Etichetta, grezzi);
                if (f == null || chiavi.Contains(f.Chiave())) continue;
                chiavi.Add(f.Chiave());

                // prima i criteri che Gmail conosce, nel loro ordine, poi gli altri
                List<string> nomi = new List<string>(), altri = new List<string>();
                foreach (string n in FiltroDaTogliere.NomiCriteri) if (f.Criteri.ContainsKey(n)) nomi.Add(n);
                foreach (string n in f.Criteri.Keys) if (!nomi.Contains(n)) altri.Add(n);
                altri.Sort(StringComparer.Ordinal);
                nomi.AddRange(altri);
                List<string> criteri = new List<string>();
                foreach (string n in nomi)
                {
                    string v = f.Criteri[n];
                    // i nomi sono solo lettere e cifre (FiltroDaTogliere.Valore): vanno scritti cosi'
                    if (n == "hasAttachment" || n == "excludeChats") criteri.Add(n + ": true");
                    else if (n == "size") criteri.Add(n + ": " + v);
                    else criteri.Add(n + ": \"" + AnalisiOrario.Js(v) + "\"");
                }
                fuori.Add("    { etichetta: \"" + AnalisiOrario.Js(f.Etichetta) + "\"," + Environment.NewLine +
                          "      criteri:   { " + string.Join(", ", criteri.ToArray()) + " } }");
            }
            return fuori;
        }

        /// <summary>Vero se c'e' una regola delle classi, o una a cui basta l'oggetto oppure i mittenti.</summary>
        static bool ConClassi(List<Regola> regole)
        {
            foreach (Regola r in regole)
                if (r.UnoQualsiasi || LeMieClassi.ClasseDi(r) != null) return true;
            return false;
        }

        /// <summary>Quanti filtri di Gmail da togliere finiscono nella configurazione.</summary>
        public static int FiltriDaTogliere(Stato s)
        {
            return FiltriJs(s).Count;
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

        /// <summary>
        /// Vero se la regola esce accesa in Configurazione.gs: spuntata e con
        /// qualcosa da cercare. Una regola senza mittenti ne' altri criteri, con
        /// @DOMINIO@ senza dominio o con @PERSONALE@ senza elenco del personale
        /// (Colleghi non avrebbe nessuno da riconoscere) esce spenta.
        /// "indirizzi" e' s.IndirizziPersonale(), passato per non rifarlo.
        /// </summary>
        public static bool AttivaNellaConfigurazione(Stato s, Regola r, List<string> indirizzi)
        {
            if (!r.Attiva) return false;
            List<string> da = MittentiDellaRegola(s, r);
            if (da.Count == 0 && r.Oggetto.Count == 0 && r.Contiene.Count == 0 && r.QueryLibera == "")
                return false;
            if (da.Count == 1 && da[0] == "@DOMINIO@" && s.DominioPulito() == "") return false;
            if (da.Count == 1 && da[0] == "@PERSONALE@" && indirizzi.Count == 0) return false;
            return true;
        }

        /// <summary>
        /// I mittenti di una regola come li scrive la configurazione: quelle di
        /// Dirigenza, Segreteria e Registro li prendono dalla pagina "La tua
        /// scuola", le altre dalla regola (segnaposto compresi).
        /// </summary>
        public static List<string> MittentiDellaRegola(Stato s, Regola r)
        {
            if (r.Sorgente == "dirigenza") return Righe(s.Dirigenza);
            if (r.Sorgente == "segreteria") return Righe(s.Segreteria);
            if (r.Sorgente == "registro") return Righe(s.Registro);
            return new List<string>(r.Da);
        }

        /// <summary>
        /// Con le sottoetichette per ruolo accese: le regole accese i cui
        /// mittenti sono quelli di un ruolo dell'elenco del personale, o una
        /// parte, e che quindi mettono la loro etichetta agli stessi messaggi
        /// della sottoetichetta (Dirigenza e Colleghi/Dirigenza). Una frase per
        /// coppia, per il passo 4; PASSO_1_anteprima lo dice di tutte le coppie
        /// di regole. Non contano la regola dei colleghi, madre delle
        /// sottoetichette, le regole con altri criteri (oggetto, testo, ricerca,
        /// etichette escluse) e quelle con @DOMINIO@, che non e' un elenco di
        /// indirizzi. Gli indirizzi si confrontano in minuscolo.
        /// </summary>
        public static List<string> DoppioniConIRuoli(Stato s)
        {
            List<string> fuori = new List<string>();
            if (!s.EtichettaPerRuolo) return fuori;
            Dictionary<string, List<string>> gruppi = s.GruppiPerRuolo();
            if (gruppi.Count == 0) return fuori;
            string colleghi = EtichettaColleghi(s.Regole);
            string prefisso = s.PrefissoPulito();
            string davanti = (prefisso == "") ? "" : prefisso + "/";
            List<string> personale = s.IndirizziPersonale();

            foreach (Regola r in s.Regole)
            {
                if (!r.Attiva) continue;
                if (r.Oggetto.Count > 0 || r.Contiene.Count > 0 || r.QueryLibera.Trim() != "" ||
                    r.EscludiEtichette.Count > 0) continue;
                string nome = r.Etichetta.Trim();
                // i colleghi sono la madre delle sottoetichette: e' voluto
                if (string.Equals(nome, colleghi.Trim(), StringComparison.OrdinalIgnoreCase)) continue;
                List<string> mittenti = MittentiEspansi(MittentiDellaRegola(s, r), gruppi, personale);
                if (mittenti == null || mittenti.Count == 0) continue;

                foreach (string c in CategoriePresenti(gruppi))
                {
                    string sotto = colleghi + "/" + c;
                    if (string.Equals(nome, sotto, StringComparison.OrdinalIgnoreCase)) continue;
                    List<string> ruolo = gruppi[c];
                    bool dentro = true;
                    foreach (string m in mittenti) if (!ruolo.Contains(m)) { dentro = false; break; }
                    if (!dentro) continue;
                    string a = davanti + nome, b = davanti + sotto;
                    fuori.Add(mittenti.Count == ruolo.Count
                        ? a + " e " + b + ": stessi mittenti, ogni messaggio prende tutte e due. " +
                          "Se ne vuoi una sola, togli la spunta a " + a + " (la sottoetichetta per ruolo resta)."
                        : a + " e " + b + ": i mittenti di " + a + " sono tutti anche in " + b +
                          ", quindi ogni suo messaggio prende tutte e due. Se ti basta " + b +
                          ", togli la spunta a " + a + " (la sottoetichetta per ruolo resta).");
                }
            }
            return fuori;
        }

        /// <summary>
        /// I mittenti con i segnaposto sciolti, in minuscolo e senza doppioni:
        /// null con @DOMINIO@, che non e' un elenco di indirizzi. Un gruppo che
        /// non c'e' non aggiunge nessuno, come nello script.
        /// </summary>
        static List<string> MittentiEspansi(List<string> da, Dictionary<string, List<string>> gruppi,
                                            List<string> personale)
        {
            List<string> fuori = new List<string>();
            foreach (string grezzo in da)
            {
                string v = (grezzo ?? "").Trim();
                if (v == "") continue;
                List<string> piu = new List<string>();
                if (v == "@DOMINIO@") return null;
                if (v == "@PERSONALE@") piu.AddRange(personale);
                else if (v.StartsWith("@GRUPPO:") && v.Length > 9 && v.EndsWith("@"))
                {
                    string nome = v.Substring(8, v.Length - 9);
                    if (gruppi.ContainsKey(nome)) piu.AddRange(gruppi[nome]);
                }
                else piu.Add(v);
                foreach (string p in piu)
                {
                    string e = p.Trim().ToLowerInvariant();
                    if (e != "" && !fuori.Contains(e)) fuori.Add(e);
                }
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

        static string BloccoRuolo(string baseEtichetta, string categoria, int quanti, string colore)
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine("    {");
            b.AppendLine("      attiva:    true,");
            b.AppendLine("      etichetta: \"" + AnalisiOrario.Js(baseEtichetta + "/" + categoria) + "\",");
            b.AppendLine("      da:        [\"@GRUPPO:" + AnalisiOrario.Js(categoria) + "@\"],");
            colore = ColoriEtichette.Pulito(colore);
            if (colore != "") b.AppendLine("      colore:    " + ColoreJs(colore) + ",");
            b.AppendLine("      nota:      \"" + AnalisiOrario.Js(categoria + ": " + quanti +
                         (quanti == 1 ? " indirizzo" : " indirizzi") +
                         " dall'elenco del personale.") + "\"");
            b.Append("    }");
            return b.ToString();
        }

        /// <summary>Un colore valido come lo legge lo script: { sfondo: "#cc3a21", testo: "#ffffff" }.</summary>
        static string ColoreJs(string colore)
        {
            return "{ sfondo: \"" + ColoriEtichette.Sfondo(colore) + "\", testo: \"" +
                   ColoriEtichette.TestoDi(colore) + "\" }";
        }

        /// <summary>
        /// Quante etichette della configurazione hanno un colore: le regole
        /// che escono accese (come le conta PASSO_1_anteprima: una spuntata ma
        /// senza niente da cercare esce spenta) e le sottoetichette dei ruoli
        /// che nasceranno. Per il riepilogo del passo 5.
        /// </summary>
        public static int EtichetteColorate(Stato s)
        {
            int n = 0;
            List<string> indirizzi = s.IndirizziPersonale();
            foreach (Regola r in s.Regole)
                if (AttivaNellaConfigurazione(s, r, indirizzi) && ColoriEtichette.Pulito(r.Colore) != "") n++;
            Dictionary<string, List<string>> gruppi = s.EtichettaPerRuolo
                ? s.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            string colleghi = ColoriEtichette.DeiColleghi(s.Regole);
            foreach (string c in CategoriePresenti(gruppi))
                if (ColoriEtichette.DelRuolo(colleghi, c, s.ColoriRuoli) != "") n++;
            return n;
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

    /// <summary>
    /// Una classe nella finestra "Le mie classi..." (Posta, passo 4). Gli
    /// indirizzi incollati degli studenti stanno qui, in memoria, finche' la
    /// finestra e' aperta: non vanno mai nello Stato ne' in Configurazione.gs,
    /// solo nel file Classe_3B.gs che il docente copia nel progetto dello script.
    /// </summary>
    class ClasseScelta
    {
        /// <summary>Il nome come lo scrive Campanella (LeMieClassi.Nome): "3B", "3B LSA", "A5".</summary>
        public string Nome = "";
        /// <summary>Spuntata: ha (o avra') la sua regola. Tolta la spunta, la regola va via.</summary>
        public bool Spuntata = true;
        /// <summary>Le parole da cercare nell'oggetto, separate da virgole; fra virgolette quelle con una virgola (LeMieClassi.TestoOggetto).</summary>
        public string Oggetto = "";
        /// <summary>Da dove viene: "orario", "Cartelle", "regola", "a mano".</summary>
        public string Provenienza = "";
        /// <summary>La regola che la classe ha gia' sotto l'etichetta madre di adesso, o null.</summary>
        public Regola Regola = null;
        /// <summary>Gli indirizzi degli studenti incollati adesso, senza il personale; null = nessuno.</summary>
        public List<string> Indirizzi = null;
        /// <summary>Gli indirizzi del personale tolti da quelli incollati (non si mostrano: si contano).</summary>
        public List<string> Tolti = new List<string>();
        /// <summary>Il file Classe_*.gs e' stato copiato dopo l'ultimo incolla.</summary>
        public bool Copiato = false;
        /// <summary>L'etichetta per cui e' stato copiato: con un'altra madre il file va copiato di nuovo.</summary>
        public string CopiatoPer = "";
        /// <summary>Il docente ha cambiato la spunta: resta anche cambiando l'etichetta madre.</summary>
        public bool SpuntaCambiata = false;
        /// <summary>Il docente ha cambiato le parole dell'oggetto: restano anche cambiando l'etichetta madre.</summary>
        public bool OggettoCambiato = false;
    }

    /// <summary>
    /// Le classi del docente per la Posta (passo 4, "Le mie classi..."): una
    /// regola per classe, con l'etichetta "Classi 2026-27/3B", che prende i
    /// messaggi con la classe nell'oggetto (da chiunque) oppure mandati dagli
    /// studenti della classe (unoQualsiasi). Da dove vengono le classi, come
    /// si cercano nell'oggetto, gli indirizzi incollati e il file Classe_3B.gs
    /// che li porta nel progetto dello script. Gli indirizzi degli studenti
    /// (dati di minori) non vanno mai nello Stato: le regole hanno solo il
    /// segnaposto @CLASSE:3B@. Senza finestre: test\prova_posta.ps1 lo prova.
    /// </summary>
    static class LeMieClassi
    {
        /// <summary>Oltre questi indirizzi incollati per una classe, sembrano piu' classi.</summary>
        public const int TroppiStudenti = 40;

        // Numero e sezione: "3B", "3 B", "3^B", "3(grado)B", "5AL". La sezione sono le
        // lettere attaccate; dopo puo' venire solo un separatore (spazio,
        // trattino, parentesi...) e il resto: "3B LSA", "2B-Ls". "10A", "1A2" e
        // "A5" non lo sono, e restano come sono.
        static readonly Regex NumeroSezione =
            new Regex(@"^([1-9]) ?[\^\u00b0\u00ba\u00aa.]? ?([A-Za-z]+)(?:$|[^A-Za-z0-9](.*)$)");
        static readonly string[] Romani = { "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX" };
        // un indirizzo email dentro un testo qualunque (anche "Nome Cognome <indirizzo>").
        // Prima della @ solo quello che ammette Google Workspace: lettere, cifre,
        // punto, trattino, trattino basso, l'apostrofo (d'amico, dell'orto) e il
        // + degli alias. Cosi' quello che sta attaccato davanti ("?email=",
        // "Rossi|" di una riga a colonne) resta fuori. Gli apici e i punti
        // intorno a un indirizzo li toglie Indirizzi
        static readonly Regex Indirizzo =
            new Regex(@"[A-Za-z0-9._+\-']+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}");
        static readonly char[] PrimaDellIndirizzo = { '\'', '.', '-', '+' };

        static string Pulito(string s) { return Regex.Replace(s ?? "", @"\s+", " ").Trim(); }

        /// <summary>
        /// Il nome di una classe come lo scrive Campanella: "3^b" -> "3B", "3b  LSA"
        /// -> "3B LSA"; gli altri codici restano. Le barre diventano trattini:
        /// il nome va nell'etichetta di Gmail, dove una barra farebbe
        /// un'etichetta dentro l'altra ("3A/B" -> "3A-B").
        /// </summary>
        public static string Nome(string grezzo)
        {
            string s = Pulito(grezzo);
            Match m = NumeroSezione.Match(s);
            if (!m.Success) return SenzaBarre(s);
            string testa = m.Groups[1].Value + m.Groups[2].Value.ToUpperInvariant();
            string resto = m.Groups[3].Success ? m.Groups[3].Value.Trim() : "";
            if (resto == "") return testa;
            // il separatore scritto (un trattino resta un trattino), uno spazio se era uno spazio
            string separatore = s.Substring(m.Groups[2].Index + m.Groups[2].Length, 1);
            return SenzaBarre(testa + (separatore.Trim() == "" ? " " : separatore) + resto);
        }

        static string SenzaBarre(string s) { return (s ?? "").Replace('/', '-').Replace('\\', '-'); }

        /// <summary>
        /// Quello che fa di due nomi la stessa classe: numero e sezione in
        /// maiuscolo e, se c'e', il resto (l'articolazione) in lettere e cifre
        /// maiuscole. 3B, 3 B, 3^B e 3(grado)B sono "3B"; 3B LSA, 3B-LSA e 3b_lsa
        /// sono "3B LSA", un'altra classe, come 3B ITE. Per gli altri codici
        /// lettere e cifre, in maiuscolo.
        /// </summary>
        public static string Chiave(string grezzo)
        {
            Match m = NumeroSezione.Match(Pulito(grezzo));
            if (m.Success)
            {
                string resto = m.Groups[3].Success
                    ? Regex.Replace(Stato.SenzaAccenti(m.Groups[3].Value).ToUpperInvariant(), "[^A-Z0-9]", "") : "";
                return m.Groups[1].Value + m.Groups[2].Value.ToUpperInvariant() + (resto == "" ? "" : " " + resto);
            }
            return Regex.Replace(Stato.SenzaAccenti(grezzo ?? "").ToUpperInvariant(), "[^A-Z0-9]", "");
        }

        /// <summary>Numero e sezione di una classe, in maiuscolo ("3B" anche per 3B LSA); "" per gli altri codici.</summary>
        public static string NumeroESezione(string grezzo)
        {
            Match m = NumeroSezione.Match(Pulito(grezzo));
            return m.Success ? m.Groups[1].Value + m.Groups[2].Value.ToUpperInvariant() : "";
        }

        /// <summary>
        /// Le classi di una cella dell'orario o di una riga: "3A/3B", "3A-3B",
        /// "3A 3B", "3A + 3B", "5AINF/5BINF" e "5Ainf/5Binf" sono due classi
        /// (una lezione insieme); "2B-Ls", "3B LSA" e "3A/B" una. Si spezza solo
        /// se ogni pezzo sembra una classe (ClasseNellaCella) con la forma della
        /// prima (StessaForma): "3B 2 gruppi", "1A 2 ore", "4A 2gr", "4A 2GR",
        /// "4AS 2gr" e "3BS 1gr" restano una.
        /// </summary>
        public static List<string> Separa(string grezzo)
        {
            string s = Pulito(grezzo);
            List<string> fuori = new List<string>();
            if (s == "") return fuori;
            string[] pezzi = Regex.Split(s, @"\s*[/+&\-]\s*(?=[1-9])|\s+(?=[1-9])");
            for (int i = 0; i < pezzi.Length; i++) pezzi[i] = pezzi[i].Trim();
            bool tutte = pezzi.Length > 1;
            for (int i = 0; i < pezzi.Length; i++)
                if (!ClasseNellaCella(pezzi[i]) || !StessaForma(pezzi[0], pezzi[i])) tutte = false;
            if (!tutte) { fuori.Add(s); return fuori; }
            fuori.AddRange(pezzi);
            return fuori;
        }

        /// <summary>
        /// Vero se un pezzo di una cella puo' essere una classe, per Separa: una
        /// classe ben fatta (ClasseBenFatta), una sezione attaccata al numero
        /// tutta maiuscola di qualunque lunghezza ("5AINF", "3ACAT":
        /// SezioneAttaccata) o con le maiuscole miste ("5Ainf": SezioneMista), o
        /// di due lettere anche minuscole ("3bs", "3Cs"), con al piu' una sigla
        /// dopo. Resta fuori la parola: "2 gruppi", "2 ore", "5 per", "2ore", "2
        /// Ore". Un gruppo come "2gr" o "2GR" qui passa: lo ferma StessaForma.
        /// </summary>
        static bool ClasseNellaCella(string s)
        {
            return ClasseBenFatta(s) || SezioneAttaccata(s) || SezioneMista(s) || DueLettereAttaccate(s);
        }

        /// <summary>
        /// Vero se due pezzi di una cella hanno la forma della stessa scuola: la
        /// sezione lunga uguale e, dopo la prima lettera, le stesse lettere
        /// (maiuscole a parte). 3AS/3BS, 3AS-3bs, 5AINF/5BINF e 5Ainf/5Binf si';
        /// "4A 2GR", "4AS 2gr", "3A 1SQ" e "3BS 1gr" (i gruppi) no.
        /// </summary>
        static bool StessaForma(string prima, string altra)
        {
            Match a = NumeroSezione.Match(prima ?? ""), b = NumeroSezione.Match(altra ?? "");
            if (!a.Success || !b.Success) return false;
            string sa = a.Groups[2].Value, sb = b.Groups[2].Value;
            return sa.Length == sb.Length && string.Equals(sa.Substring(1), sb.Substring(1), StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Vero se il nome e' il numero con attaccata una sezione con le
        /// maiuscole miste, come si scrive a volte quella dei tecnici: la prima
        /// lettera maiuscola, poi da una a quattro lettere, non tutte maiuscole
        /// ("5Ainf", "3Acat", "4BAfm", "3Bs"), e al piu' una sigla dopo. Nome la
        /// scrive tutta maiuscola (5AINF). Non "2gr" o "5per", che cominciano
        /// con la minuscola.
        /// </summary>
        static bool SezioneMista(string s)
        {
            Match m = NumeroSezione.Match(s ?? "");
            if (!m.Success || m.Groups[2].Index != m.Groups[1].Index + 1) return false;
            string sezione = m.Groups[2].Value;
            return sezione.Length >= 2 && sezione.Length <= 5 && char.IsUpper(sezione[0]) &&
                   sezione != sezione.ToUpperInvariant() && SoloArticolazione(m.Groups[3]);
        }

        /// <summary>
        /// Vero se il nome e' il numero con la sezione attaccata tutta maiuscola,
        /// di qualunque lunghezza, e al piu' una sigla dopo: "5AINF", "3ACAT",
        /// "4BAFM", "3BLSA", "4AINF LAB" (le classi dei tecnici). Non "5A Praga",
        /// "5 per mille" o "2gr".
        /// </summary>
        static bool SezioneAttaccata(string s)
        {
            Match m = NumeroSezione.Match(s ?? "");
            if (!m.Success) return false;
            string sezione = m.Groups[2].Value;
            return m.Groups[2].Index == m.Groups[1].Index + 1 && sezione == sezione.ToUpperInvariant() &&
                   SoloArticolazione(m.Groups[3]);
        }

        /// <summary>Vero se il nome e' il numero con attaccata una sezione di due lettere, maiuscole o no, e al piu' una sigla dopo.</summary>
        static bool DueLettereAttaccate(string s)
        {
            Match m = NumeroSezione.Match(s ?? "");
            return m.Success && m.Groups[2].Index == m.Groups[1].Index + 1 && m.Groups[2].Value.Length == 2 &&
                   SoloArticolazione(m.Groups[3]);
        }

        // sezioni che sono anche parole italiane: "3 A" prenderebbe "da 1 a 10",
        // "1 E" "le classi 1 e 2", "5 AL" "dal 5 al 10"
        static readonly string[] SezioniParola =
        {
            "A", "E", "I", "O", "U", "AD", "AL", "CI", "DA", "DI", "ED", "HA", "HO", "IL", "IN", "LA", "LE", "LO",
            "MI", "NE", "SI", "SU", "TI", "UN", "VI", "CHE", "CON", "COL", "DAL", "DEL", "FRA", "GLI", "NEL", "NON",
            "PER", "SUL", "TRA", "UNA", "UNO"
        };

        /// <summary>
        /// Le parole di partenza per l'oggetto: per la 3B (e la 3B LSA) 3B, "3 B"
        /// e III B. Gmail cerca parole intere, e una frase come parole vicine:
        /// "3 B" dovrebbe prendere anche 3^B e 3(grado)B (da controllare in
        /// Gmail). Se la sezione e' anche una parola (A, E, I, O, AL...) le forme
        /// con lo spazio da sole prenderebbero "da 1 a 10": allora 3A, "classe 3
        /// A" e "classe III A". Un codice che non e' numero e sezione (A5, AF, un
        /// laboratorio) non ha parole: come compare nell'oggetto lo scrive il docente.
        /// </summary>
        public static List<string> Varianti(string grezzo)
        {
            List<string> fuori = new List<string>();
            Match m = NumeroSezione.Match(Pulito(grezzo));
            if (!m.Success) return fuori;
            string n = m.Groups[1].Value, sezione = m.Groups[2].Value.ToUpperInvariant();
            bool parola = Array.IndexOf(SezioniParola, sezione) >= 0;
            string prima = parola ? "classe " : "";
            fuori.Add(n + sezione);
            fuori.Add(prima + n + " " + sezione);
            fuori.Add(prima + Romani[int.Parse(n)] + " " + sezione);
            return fuori;
        }

        /// <summary>Vero se il nome e' numero e sezione (3B, 3B LSA): le altre classi partono senza parole e senza spunta.</summary>
        public static bool NumeroESezioneDi(string grezzo)
        {
            return NumeroSezione.IsMatch(Pulito(grezzo));
        }

        /// <summary>
        /// Le parole dell'oggetto scritte nella finestra: separate da virgole (o
        /// punti e virgola, o a capo), una volta ciascuna (maiuscole a parte); una
        /// parola fra virgolette puo' avere dentro una virgola ("Scrutinio 3B,
        /// primo periodo"). Un indirizzo email non e' una parola dell'oggetto: gli
        /// indirizzi degli studenti incollati qui per sbaglio finirebbero nello
        /// Stato, in Configurazione.gs e nel filtro di Gmail. Si scartano
        /// (IndirizziNellOggetto dice quanti).
        /// </summary>
        public static List<string> ParoleOggetto(string testo)
        {
            List<string> fuori = new List<string>(), viste = new List<string>();
            foreach (string p in PezziOggetto(testo))
            {
                string t = Pulito(p);
                if (t == "" || t.IndexOf('@') >= 0 || viste.Contains(t.ToLowerInvariant())) continue;
                viste.Add(t.ToLowerInvariant());
                fuori.Add(t);
            }
            return fuori;
        }

        /// <summary>
        /// Vero se nel testo scritto come nome di una classe, o come etichetta
        /// madre, c'e' una @: la riga del campo A di Classroom incollata nel posto
        /// sbagliato. Gli indirizzi (e i nomi) degli studenti finirebbero nel
        /// nome della regola, nello Stato, in Configurazione.gs e nell'etichetta
        /// di Gmail, che non si cancella: un testo cosi' non si usa, tutto intero.
        /// </summary>
        public static bool ConIndirizzi(string testo) { return (testo ?? "").IndexOf('@') >= 0; }

        /// <summary>Che cosa dire di un nome di classe con degli indirizzi (ConIndirizzi); "" se non ne ha.</summary>
        public static string AvvisoIndirizziNelNome(string testo)
        {
            if (!ConIndirizzi(testo)) return "";
            return "Come nome di una classe hai scritto degli indirizzi email: non l'ho aggiunta, e li ho tolti. Scrivi " +
                   "il nome della classe (per esempio 3B); gli indirizzi degli studenti vanno nella casella sotto, " +
                   "scelta la classe.";
        }

        /// <summary>Che cosa dire quando nell'etichetta madre c'erano degli indirizzi (ConIndirizzi).</summary>
        public const string AvvisoIndirizziNellaMadre =
            "Nell'etichetta madre c'erano degli indirizzi email: li ho tolti, e ho rimesso l'etichetta di partenza. " +
            "Gli indirizzi degli studenti vanno nella casella sotto, scelta la classe.";

        /// <summary>Quanti pezzi del testo della colonna "Cerca nell'oggetto" sono indirizzi (hanno una @).</summary>
        public static int IndirizziNellOggetto(string testo)
        {
            int n = 0;
            foreach (string p in PezziOggetto(testo)) if (p.IndexOf('@') >= 0) n++;
            return n;
        }

        /// <summary>Le parole dell'oggetto come le mostra la finestra: separate da virgole, fra virgolette quelle con una virgola.</summary>
        public static string TestoOggetto(IEnumerable<string> parole)
        {
            List<string> fuori = new List<string>();
            foreach (string p in parole ?? new List<string>())
            {
                string t = Pulito(p).Replace("\"", "");
                if (t == "") continue;
                fuori.Add(t.IndexOfAny(new char[] { ',', ';' }) >= 0 ? "\"" + t + "\"" : t);
            }
            return string.Join(", ", fuori.ToArray());
        }

        /// <summary>I pezzi di un testo separati da virgole, punti e virgola o a capo, fuori dalle virgolette (che vanno via).</summary>
        static List<string> PezziOggetto(string testo)
        {
            List<string> pezzi = new List<string>();
            StringBuilder b = new StringBuilder();
            bool dentro = false;
            foreach (char ch in testo ?? "")
            {
                if (ch == '"') { dentro = !dentro; continue; }
                if (!dentro && (ch == ',' || ch == ';' || ch == '\r' || ch == '\n'))
                {
                    pezzi.Add(b.ToString());
                    b.Length = 0;
                    continue;
                }
                b.Append(ch);
            }
            pezzi.Add(b.ToString());
            return pezzi;
        }

        /// <summary>
        /// Gli indirizzi email di un testo incollato, in qualunque forma (uno per
        /// riga, separati da virgole, "Nome Cognome &lt;indirizzo&gt;"):
        /// minuscoli, una volta ciascuno, nell'ordine.
        /// </summary>
        public static List<string> Indirizzi(string testo)
        {
            List<string> fuori = new List<string>();
            foreach (Match m in Indirizzo.Matches(testo ?? ""))
            {
                // 'o'neil@...' fra apici: gli apici e la punteggiatura davanti non sono
                // dell'indirizzo, l'apostrofo dentro si'
                string e = m.Value.TrimStart(PrimaDellIndirizzo).TrimEnd('.').ToLowerInvariant();
                if (e.IndexOf('@') > 0 && !fuori.Contains(e)) fuori.Add(e);
            }
            return fuori;
        }

        /// <summary>
        /// Gli indirizzi senza quelli del personale (chi ha la spunta
        /// nell'elenco del passo 3, la dirigenza e la segreteria della pagina "La
        /// tua scuola"): un collega fra gli studenti avrebbe l'etichetta della
        /// classe su tutta la sua posta. Chi nell'elenco e' senza spunta resta:
        /// sono gli studenti e le famiglie (li lascia fuori l'import) e gli
        /// indirizzi presi dalla casella, dove ci sono anche gli studenti. Quelli
        /// tolti vanno in "tolti", se non e' null.
        /// </summary>
        public static List<string> TogliPersonale(List<string> indirizzi, Stato s, List<string> tolti)
        {
            List<string> personale = new List<string>();
            if (s.Personale != null) personale.AddRange(s.IndirizziPersonale());
            personale.AddRange(DallaScuola(s));
            List<string> fuori = new List<string>();
            foreach (string e in indirizzi ?? new List<string>())
            {
                if (!personale.Contains(e)) fuori.Add(e);
                else if (tolti != null && !tolti.Contains(e)) tolti.Add(e);
            }
            return fuori;
        }

        /// <summary>
        /// Vero se un nome sembra quello di una classe: numero, sezione e al
        /// piu' un'articolazione (ClasseBenFatta: "3B", "3 B", "5AL", "3B LSA"),
        /// la sezione attaccata al numero tutta maiuscola, anche lunga, dei
        /// tecnici (SezioneAttaccata: "5AINF", "3ACAT", "4BAFM", "4AINF LAB"),
        /// o il numero romano, da I a V, uno spazio e la sezione in maiuscolo
        /// ("III B", "IV A LSA"). Serve a riconoscere le etichette delle classi
        /// nei filtri di Gmail: "5 per mille", "5A Praga" e "3B 2 gruppi" non lo
        /// sono.
        /// </summary>
        public static bool SembraClasse(string nome)
        {
            string s = Pulito(nome);
            if (ClasseBenFatta(s) || SezioneAttaccata(s)) return true;
            Match m = Regex.Match(s, @"^(?:I|II|III|IV|V) [A-Z]{1,3}(?:$|[^A-Za-z0-9](.*)$)");
            return m.Success && SoloArticolazione(m.Groups[1]);
        }

        // dopo numero e sezione, in una classe vera, al massimo un'articolazione:
        // LSA, ITE, AFM, L.S.A. Non una parola ("per mille", "Praga", "gruppi")
        static readonly Regex Articolazione = new Regex(@"^(?:[A-Z]{1,4}|[A-Z](?:\.[A-Z]){1,3}\.?)$");

        /// <summary>
        /// Vero se il nome e' numero e sezione come in una classe vera, con al
        /// piu' un'articolazione: "3B", "3 b", "5AL", "3B LSA", "3B-LSA", "3B
        /// (L.S.A.)". La sezione ha al piu' tre lettere, maiuscole se sono piu'
        /// d'una ("5 per", "2 ore" no); l'articolazione e' una sigla ("3B 2
        /// gruppi", "5A Praga" no).
        /// </summary>
        static bool ClasseBenFatta(string s)
        {
            Match m = NumeroSezione.Match(s ?? "");
            if (!m.Success) return false;
            string sezione = m.Groups[2].Value;
            if (sezione.Length > 3 || (sezione.Length > 1 && sezione != sezione.ToUpperInvariant())) return false;
            return SoloArticolazione(m.Groups[3]);
        }

        /// <summary>Vero se dopo numero e sezione non c'e' niente, o solo un'articolazione (fra parentesi anche).</summary>
        static bool SoloArticolazione(Group resto)
        {
            string r = resto.Success ? Regex.Replace(resto.Value, @"^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$", "") : "";
            return r == "" || Articolazione.IsMatch(r);
        }

        /// <summary>Gli indirizzi della dirigenza e della segreteria (pagina "La tua scuola"), minuscoli.</summary>
        public static List<string> DallaScuola(Stato s)
        {
            List<string> fuori = new List<string>();
            foreach (string e in GeneratorePosta.Righe(s.Dirigenza)) fuori.Add(e.Trim().ToLowerInvariant());
            foreach (string e in GeneratorePosta.Righe(s.Segreteria)) fuori.Add(e.Trim().ToLowerInvariant());
            return fuori;
        }

        /// <summary>Il file con gli indirizzi di una classe: Classe_3B.gs (lo stesso nome che cerca lo script, _fileClasse_).</summary>
        public static string NomeFile(string classe)
        {
            string pulito = Regex.Replace(classe ?? "", "[^A-Za-z0-9]+", "_").Trim('_');
            return "Classe_" + (pulito == "" ? "senza_nome" : pulito) + ".gs";
        }

        /// <summary>Il segnaposto degli studenti di una classe fra i mittenti: @CLASSE:3B@.</summary>
        public static string Segnaposto(string classe) { return "@CLASSE:" + classe + "@"; }

        /// <summary>La classe di una regola delle classi (dal segnaposto), o null se la regola non e' di una classe.</summary>
        public static string ClasseDi(Regola r)
        {
            if (r == null || r.Sorgente != Regola.SorgenteClasse) return null;
            foreach (string d in r.Da)
            {
                string v = (d ?? "").Trim();
                if (v.StartsWith("@CLASSE:", StringComparison.Ordinal) && v.Length >= 10 && v.EndsWith("@", StringComparison.Ordinal))
                    return v.Substring(8, v.Length - 9);
            }
            return null;
        }

        /// <summary>
        /// Il testo del file Classe_3B.gs: un'intestazione che dice di chi sono
        /// gli indirizzi, che Campanella non ne tiene copia, come aggiornarli e
        /// di cancellarlo a fine anno; poi in CLASSI_STUDENTI l'etichetta della
        /// regola e gli indirizzi. Lo script li usa solo per la regola con
        /// quell'etichetta (_studentiDellaClasse_): il file della 3B dell'anno
        /// prima non vale per la 3B dell'anno dopo. Piu' file nello stesso
        /// progetto si sommano, in qualunque ordine Google li legga.
        /// </summary>
        public static string FileClasse(string classe, string etichetta, List<string> indirizzi, DateTime quando)
        {
            string nome = AnalisiOrario.TestoCommento(classe);
            int n = (indirizzi == null) ? 0 : indirizzi.Count;
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("/* =========================================================================");
            sb.AppendLine("   STUDENTI DELLA " + nome + "  -  file " + NomeFile(classe));
            sb.AppendLine("   Generato il " + quando.ToString("dd/MM/yyyy HH:mm") + " dall'applicazione Campanella " +
                          Aggiornamenti.VersioneCampanella + ".");
            sb.AppendLine();
            sb.AppendLine("   Gli indirizzi email degli studenti della " + nome + " (" + n + "), per la regola");
            sb.AppendLine("   \"" + AnalisiOrario.TestoCommento(etichetta) + "\" dello script della posta: i loro messaggi");
            sb.AppendLine("   prendono quell'etichetta anche senza la classe nell'oggetto. Valgono solo per");
            sb.AppendLine("   quella regola: per un'altra etichetta (l'anno dopo) copia il file nuovo.");
            sb.AppendLine();
            sb.AppendLine("   Campanella non ne tiene copia, e lo script non li mette nei filtri di Gmail:");
            sb.AppendLine("   ci sono solo qui, nel tuo progetto.");
            sb.AppendLine("   Per aggiornarli incollali di nuovo in Campanella (Posta, passo 4,");
            sb.AppendLine("   \"Le mie classi...\"), copia di nuovo il file e sostituisci tutto questo.");
            sb.AppendLine("   Sono dati di studenti, spesso minorenni: a fine anno cancella questo file");
            sb.AppendLine("   (nell'editor, i tre puntini accanto al suo nome -> Elimina).");
            sb.AppendLine("   ========================================================================= */");
            sb.AppendLine();
            sb.AppendLine("var CLASSI_STUDENTI = (typeof CLASSI_STUDENTI !== 'undefined' && CLASSI_STUDENTI) || {};");
            sb.AppendLine("CLASSI_STUDENTI[\"" + AnalisiOrario.Js(classe) + "\"] = {");
            sb.AppendLine("  etichetta: \"" + AnalisiOrario.Js(etichetta) + "\",");
            // il giorno: l'anteprima lo dice, e avvisa se e' di un anno scolastico passato
            sb.AppendLine("  copiato: \"" + quando.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) + "\",");
            sb.AppendLine("  indirizzi: [");
            for (int i = 0; i < n; i++)
                sb.AppendLine("    \"" + AnalisiOrario.Js(indirizzi[i]) + "\"" + (i < n - 1 ? "," : ""));
            sb.AppendLine("  ]");
            sb.AppendLine("};");
            return sb.ToString();
        }

        /// <summary>
        /// L'etichetta madre di partenza: quella delle regole delle classi che ci
        /// sono, se fra quelle che non sono di un altro anno ce n'e' una sola (il
        /// docente l'aveva scelta, o cambiata, lui: "Le mie classi"); altrimenti
        /// "Classi " e l'anno scolastico (quello di Cartelle, o quello delle
        /// classi di oggi: AnnoDelleClassi). Cosi' riaprendo la finestra le regole
        /// si ritrovano, e l'anno dopo la madre dell'anno prima non si riusa.
        /// </summary>
        public static string MadreDiPartenza(Stato s)
        {
            return MadreDiPartenzaAl(s, DateTime.Now);
        }

        /// <summary>Lo stesso, se oggi fosse il giorno dato (per le prove: il 28 agosto, il 24 settembre).</summary>
        public static string MadreDiPartenzaAl(Stato s, DateTime oggi)
        {
            string anno = (s.Anno ?? "").Trim();
            if (anno == "") anno = AnnoDelleClassi(oggi);
            List<string> madri = new List<string>();
            foreach (Regola r in s.Regole)
            {
                string e = r.Etichetta ?? "";
                int b = e.LastIndexOf('/');
                if (ClasseDi(r) == null || b <= 0) continue;
                string m = Madre(e.Substring(0, b));
                if (DiUnAltroAnno(m, anno)) continue;
                bool gia = false;
                foreach (string x in madri) if (string.Equals(x, m, StringComparison.OrdinalIgnoreCase)) gia = true;
                if (!gia) madri.Add(m);
            }
            return (madri.Count == 1) ? madri[0] : "Classi " + anno;
        }

        /// <summary>
        /// L'anno scolastico delle classi, nella forma 2026-27: agosto conta gia'
        /// per quello che comincia, come nello script (_annoScolasticoDi_), che
        /// dice di un anno passato un file Classe_*.gs copiato prima. Chi a fine
        /// agosto prepara le classi nuove le mette sotto l'anno che arriva, e a
        /// settembre la finestra le ritrova (Stato.AnnoScolastico cambia solo a
        /// settembre: vale per il resto dell'applicazione).
        /// </summary>
        public static string AnnoDelleClassi(DateTime quando)
        {
            int inizio = (quando.Month >= 8) ? quando.Year : quando.Year - 1;
            return inizio + "-" + ((inizio + 1) % 100).ToString("00");
        }

        /// <summary>Vero se nel nome c'e' un anno (il primo numero di quattro cifre) diverso da quello dell'anno scolastico.</summary>
        static bool DiUnAltroAnno(string nome, string anno)
        {
            Match a = Regex.Match(nome ?? "", @"\d{4}"), b = Regex.Match(anno ?? "", @"\d{4}");
            return a.Success && b.Success && a.Value != b.Value;
        }

        /// <summary>
        /// L'etichetta madre scritta nella finestra: senza barre in fondo e spazi
        /// doppi; vuota, "Classi". Con degli indirizzi (ConIndirizzi) non vale:
        /// anche lei "Classi" (la finestra rimette quella di partenza).
        /// </summary>
        public static string Madre(string scritta)
        {
            string m = ConIndirizzi(scritta) ? "" : Pulito(scritta).Trim('/').Trim();
            return (m == "") ? "Classi" : m;
        }

        /// <summary>Vero se la regola sta sotto questa etichetta madre (maiuscole a parte).</summary>
        public static bool SottoMadre(Regola r, string madre)
        {
            return (r.Etichetta ?? "").StartsWith(Madre(madre) + "/", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Le classi del docente: quelle delle sue lezioni (il docente scelto in
        /// Orari, passo 4; senza le ore a disposizione) e quelle scritte in
        /// Cartelle (una per riga, le materie dopo i due punti). Una lezione
        /// di due classi insieme (3A/3B) sono due classi. Una volta ciascuna
        /// (3B, 3 B e 3^B sono la stessa; 3B LSA e' un'altra), in ordine.
        /// </summary>
        public static List<string> DaLezioniECartelle(Stato s)
        {
            List<string> trovate = DalleLezioni(s);
            trovate.AddRange(DaCartelle(s));
            return SenzaDoppioni(trovate);
        }

        /// <summary>Le classi delle lezioni del docente scelto in Orari (passo 4), senza le ore a disposizione.</summary>
        public static List<string> DalleLezioni(Stato s)
        {
            List<string> trovate = new List<string>();
            if (s.Lezioni == null || s.Lezioni.Count == 0 || (s.CalDocente ?? "").Trim() == "") return trovate;
            RisultatoOrario o = RisultatoOrario.Ripristina(s);
            string docente = o.TrovaDocente(s.CalDocente);
            if (docente == "") return trovate;
            foreach (Lezione l in o.Lezioni)
                if (string.Equals(l.Docente, docente, StringComparison.CurrentCultureIgnoreCase) &&
                    (l.Classe ?? "").Trim() != "" && !o.EDisposizione(l.Classe))
                    trovate.AddRange(Separa(l.Classe));
            return trovate;
        }

        /// <summary>Le classi scritte in Cartelle: una per riga, le materie dopo i due punti.</summary>
        public static List<string> DaCartelle(Stato s)
        {
            List<string> trovate = new List<string>();
            foreach (string riga in (s.Classi ?? "").Replace("\r\n", "\n").Split('\n'))
            {
                string nome = riga;
                int due = nome.IndexOf(':');
                if (due >= 0) nome = nome.Substring(0, due);
                nome = nome.Trim();
                // "1A; 2B" su una riga: Cartelle lo rifiuta, e qui non e' una classe;
                // nemmeno un indirizzo (ConIndirizzi)
                if (nome == "" || nome.IndexOfAny(new char[] { ';', ',', '@' }) >= 0) continue;
                trovate.AddRange(Separa(nome));
            }
            return trovate;
        }

        /// <summary>I nomi (LeMieClassi.Nome) una volta per classe, il primo trovato, in ordine di chiave.</summary>
        public static List<string> SenzaDoppioni(IEnumerable<string> nomi)
        {
            List<string> fuori = new List<string>(), chiavi = new List<string>();
            foreach (string grezzo in nomi)
            {
                string k = Chiave(grezzo);
                if (k == "" || chiavi.Contains(k)) continue;
                chiavi.Add(k);
                fuori.Add(Nome(grezzo));
            }
            fuori.Sort(delegate(string a, string b) { return string.CompareOrdinal(Chiave(a), Chiave(b)); });
            return fuori;
        }

        /// <summary>
        /// Che cosa fare dopo "Usa queste classi" (la finestra e la riga di
        /// stato lo dicono): copiare di nuovo la configurazione e, se lo script
        /// della posta nel progetto e' di una versione di prima, reincollare
        /// anche il codice. Quello di prima non conosce le regole delle classi
        /// (unoQualsiasi, @CLASSE:3B@): cercherebbe la classe nell'oggetto E fra
        /// i mittenti, e non etichetterebbe niente. versione e' quella dello
        /// script di adesso (Guscio.VersioneScript).
        /// </summary>
        public static string DopoLeClassi(string versione)
        {
            return "copia di nuovo la configurazione (passo 5). Le classi vogliono lo script della posta " +
                   versione + ": se PASSO_1_anteprima scrive una versione di prima, reincolla anche il codice (passo " +
                   "5), altrimenti le regole delle classi non etichettano niente.";
        }

        /// <summary>A cosa serve la regola di una classe, per il passo 4 e per la nota in Configurazione.gs.</summary>
        public static string Descrizione(string classe)
        {
            return "Le email con la " + classe + " nell'oggetto o mandate dagli studenti della " + classe + ". " +
                   "Gli indirizzi degli studenti non stanno in Campanella: li porta il file " + NomeFile(classe) +
                   ", nel progetto dello script.";
        }

        /// <summary>
        /// Mette nello Stato le classi scelte nella finestra: per ogni classe
        /// spuntata crea (in fondo all'elenco) o aggiorna la sua regola sotto
        /// l'etichetta madre, con le parole dell'oggetto e fra i mittenti solo
        /// il segnaposto; una classe senza spunta perde la sua regola. Con
        /// togliVecchie toglie le regole delle classi sotto un'altra etichetta
        /// madre (l'anno prima). Poi i colori delle classi nuove, e via dai
        /// filtri di Gmail da togliere quelli che adesso sembrano di una classe
        /// e cercano degli indirizzi. Dice che cosa ha fatto, senza indirizzi.
        /// </summary>
        public static string Applica(Stato s, string madre, List<ClasseScelta> classi, bool togliVecchie)
        {
            string m = Madre(madre);
            int nuove = 0, aggiornate = 0, tolte = 0, vecchie = 0;
            // le classi che perdono la regola: il loro file resta nel progetto
            List<string> senzaRegola = new List<string>();
            if (togliVecchie)
                vecchie = s.Regole.RemoveAll(delegate(Regola r)
                {
                    bool via = ClasseDi(r) != null && !SottoMadre(r, m);
                    if (via) senzaRegola.Add(ClasseDi(r));
                    return via;
                });
            foreach (ClasseScelta c in classi ?? new List<ClasseScelta>())
            {
                // un nome con degli indirizzi non e' una classe: niente regola
                if (ConIndirizzi(c.Nome)) continue;
                Regola r = RegolaDellaClasse(s, m, Chiave(c.Nome));
                if (!c.Spuntata)
                {
                    if (r != null) { s.Regole.Remove(r); tolte++; senzaRegola.Add(ClasseDi(r)); }
                    continue;
                }
                // il nome della regola che c'e' gia': il file Classe_*.gs incollato ha quello
                string nome = (r != null) ? ClasseDi(r) : Nome(c.Nome);
                if (r == null)
                {
                    r = new Regola();
                    s.Regole.Add(r);
                    nuove++;
                }
                else aggiornate++;
                r.Etichetta = m + "/" + nome;
                r.Sorgente = Regola.SorgenteClasse;
                // la madre resta ricordata anche quando le regole andranno via
                s.AggiungiMadreClassi(m);
                r.Da = new List<string>(new string[] { Segnaposto(nome) });
                r.Oggetto = ParoleOggetto(c.Oggetto);
                r.UnoQualsiasi = true;
                r.Descrizione = Descrizione(nome);
            }
            ColoriEtichette.DelleClassi(s.Regole, s.ColoriRuoli);
            // un filtro con degli indirizzi scelto prima sotto questa madre adesso
            // e' di una classe: gli studenti non devono restare nello Stato
            int filtriTolti = FiltriGmail.TogliQuelliDelleClassi(s);
            List<string> parti = new List<string>();
            if (nuove > 0) parti.Add(nuove + (nuove == 1 ? " regola nuova" : " regole nuove"));
            if (aggiornate > 0) parti.Add(aggiornate + (aggiornate == 1 ? " aggiornata" : " aggiornate"));
            if (tolte > 0) parti.Add(tolte + (tolte == 1 ? " tolta" : " tolte"));
            if (vecchie > 0) parti.Add(vecchie + (vecchie == 1 ? " dell'anno prima tolta" : " degli anni prima tolte"));
            // il file di una classe tolta ha ancora gli indirizzi dei suoi studenti;
            // se un'altra regola usa un file con lo stesso nome, quello nuovo lo sostituisce
            List<string> daCancellare = new List<string>();
            foreach (string c in senzaRegola)
            {
                string file = NomeFile(c);
                bool usato = false;
                foreach (Regola r in s.Regole)
                    if (ClasseDi(r) != null && NomeFile(ClasseDi(r)) == file) usato = true;
                if (!usato && !daCancellare.Contains(file)) daCancellare.Add(file);
            }
            return "Classi: " + (parti.Count == 0 ? "niente da cambiare" : string.Join(", ", parti.ToArray())) + "." +
                   (daCancellare.Count == 0 ? "" : " Nel progetto dello script cancella " +
                    string.Join(", ", daCancellare.ToArray()) + ": ha gli indirizzi degli studenti.") +
                   (filtriTolti == 0 ? "" : filtriTolti == 1
                    ? " 1 filtro di Gmail scelto prima sembra di una classe e cerca degli indirizzi: non lo togliera' " +
                      "lo script, toglilo tu in Gmail."
                    : " " + filtriTolti + " filtri di Gmail scelti prima sembrano di una classe e cercano degli " +
                      "indirizzi: non li togliera' lo script, toglili tu in Gmail.");
        }

        /// <summary>La regola di una classe (per chiave) sotto l'etichetta madre, o null.</summary>
        public static Regola RegolaDellaClasse(Stato s, string madre, string chiave)
        {
            foreach (Regola r in s.Regole)
            {
                string c = ClasseDi(r);
                if (c != null && SottoMadre(r, madre) && Chiave(c) == chiave) return r;
            }
            return null;
        }
    }
}
