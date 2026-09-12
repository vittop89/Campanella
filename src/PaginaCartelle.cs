// ===========================================================================
//  PaginaCartelle.cs - la struttura del nuovo anno scolastico nel Drive
//
//  Porta dentro Campanella il "Generatore Anno Scolastico": crea la cartella
//  "A.S. <anno>" nella radice del Drive, con le classi, le materie, i
//  recuperi e le cartelle fisse, e ci copia dentro i modelli da MODELLI.
//
//  Regola di fondo: non sovrascrive e non cancella mai niente. Se una
//  cartella o un file esistono gia', li lascia stare.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Campanella
{
    class RisultatoGenerazione
    {
        public string Cartella = "";
        public int Creati = 0;
        public List<string> Errori = new List<string>();
    }

    class PaginaCartelle : Pagina
    {
        TextBox txtAnno, txtClassi, txtDrive, txtExtra, logBox;
        CheckedListBox clbModelli, clbStruttura;

        static readonly string[] StrutturaDiDefault =
        {
            "CLASSI",
            "Amministrazione e modulistica",
            "Verifiche e valutazione",
            "Orari e calendari",
            "Materiali insegnante",
            "Griglie di valutazione",
            "Liceo potenziato-attivita",
            "Dipartimento di matematica e fisica",
            "RECUPERI\\TRIMESTRE",
            "RECUPERI\\PENTAMESTRE",
            "Simulazioni seconda prova",
            "DigComp2.2",
            "Da stampare",
            "Adempimenti finali",
            "Educazione Civica\\Lezioni e patente",
            "Educazione Civica\\Curricolo e programmazione",
            "Educazione Civica\\Orientamento"
        };

        const string FileStruttura = "struttura.json";

        public PaginaCartelle(Guscio g) : base(g) { Costruisci(); }

        public override string Nome { get { return "Cartelle"; } }

        // ===================================================================
        void Costruisci()
        {
            int y = 6;
            Controls.Add(Tema.Testo1("La struttura del nuovo anno", 0, y, 0, Tema.Sezione, Ruolo.Sezione));
            y += 40;
            Controls.Add(Tema.Testo1(
                "Crea nel Drive la cartella \"A.S. <anno>\" con dentro le classi, le materie, i " +
                "recuperi e le cartelle fisse, e ci copia i modelli presi da MODELLI. " +
                "Non sovrascrive e non cancella mai niente: aggiunge solo cio' che manca.",
                0, y, 880, Tema.Normale, Ruolo.Tenue));
            y += 48;

            Controls.Add(Tema.Testo1("Anno scolastico", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtAnno = Tema.Casella(0, y + 22, 180, Stato.AnnoScolastico(DateTime.Now));
            Controls.Add(txtAnno);
            Controls.Add(Tema.Testo1(
                "Si aggiorna da solo il primo settembre. Se lo cambi a mano resta quello che scrivi; " +
                "svuotalo per tornare a quello automatico.",
                196, y + 22, 560, Tema.Piccolo, Ruolo.Tenue));
            y += 62;

            Controls.Add(Tema.Testo1("Classi  (una per riga; dopo i due punti le materie)",
                                     0, y, 600, Tema.Grassetto, Ruolo.Normale));
            txtClassi = Tema.CasellaMulti(0, y + 22, 880, 96,
                "1A: Matematica, Fisica\r\n2B-Ls: Matematica\r\n4Ar");
            Controls.Add(txtClassi);
            y += 126;
            Controls.Add(Tema.Testo1(
                "1A: Matematica, Fisica      crea CLASSI\\1A\\Matematica e CLASSI\\1A\\Fisica\n" +
                "2B-Ls: Matematica           una sola materia\n" +
                "4Ar                         senza materie: solo la cartella della classe\n" +
                "Per ogni classe crea anche RECUPERI\\TRIMESTRE e RECUPERI\\PENTAMESTRE, " +
                "con le stesse materie dentro.",
                0, y, 880, Tema.Piccolo, Ruolo.Tenue));
            y += 74;

            Controls.Add(Tema.Testo1("Percorso di \"Il mio Drive\"", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtDrive = Tema.Casella(0, y + 22, 700, "per esempio  H:\\Il mio Drive");
            txtDrive.TextChanged += delegate { PopolaModelli(); };
            Controls.Add(txtDrive);
            Controls.Add(Tema.Bottone("Sfoglia...", 712, y + 21, 130, delegate
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    d.Description = "Seleziona la cartella \"Il mio Drive\"";
                    if (d.ShowDialog(this) == DialogResult.OK)
                    {
                        txtDrive.Text = d.SelectedPath;
                        PopolaModelli();
                    }
                }
            }));
            y += 58;

            Controls.Add(Tema.Testo1("Modelli da includere  (le sottocartelle di MODELLI)",
                                     0, y, 420, Tema.Grassetto, Ruolo.Normale));
            Controls.Add(Tema.Testo1("Cartelle dell'anno", 450, y, 250, Tema.Grassetto, Ruolo.Normale));
            Controls.Add(Tema.Bottone("Modifica struttura...", 700, y - 4, 180,
                delegate { ModificaStruttura(); }));

            clbModelli = new CheckedListBox();
            clbModelli.Location = new Point(0, y + 24);
            clbModelli.Size = new Size(430, 150);
            clbModelli.CheckOnClick = true;
            clbModelli.Font = Tema.Normale;
            Controls.Add(clbModelli);

            clbStruttura = new CheckedListBox();
            clbStruttura.Location = new Point(450, y + 24);
            clbStruttura.Size = new Size(430, 150);
            clbStruttura.CheckOnClick = true;
            clbStruttura.Font = Tema.Normale;
            Controls.Add(clbStruttura);
            y += 186;

            Controls.Add(Tema.Testo1("Cartelle in piu'  (facoltative, una per riga o separate da virgola)",
                                     0, y, 600, Tema.Grassetto, Ruolo.Normale));
            txtExtra = Tema.CasellaMulti(0, y + 22, 880, 50, "Progetti, PCTO, Consiglio di classe");
            Controls.Add(txtExtra);
            y += 82;

            Controls.Add(Tema.Testo1("Cosa sta succedendo", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            logBox = Tema.Registro(0, y + 22, 880, 130, true);
            Controls.Add(logBox);
            y += 146;

            Controls.Add(Tema.BottonePrincipale("Genera la struttura", 0, y, 200, delegate { Genera(); }));
            Controls.Add(Tema.Bottone("Apri la cartella dell'anno", 212, y + 2, 200, delegate
            {
                string t = CartellaAnno();
                if (Directory.Exists(t)) Guscio.Apri(t);
                else MessageBox.Show(this, "La cartella non c'e' ancora:\n" + t,
                    "Niente da aprire", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }));
        }

        // ===================================================================
        public override void Entra()
        {
            txtDrive.Text = S.Drive;
            // S.Anno vuoto = "quello calcolato dalla data": cosi' dal primo
            // settembre l'anno cambia da solo, senza ricordarsi di aggiornarlo
            txtAnno.Text = (S.Anno != "") ? S.Anno : Stato.AnnoScolastico(DateTime.Now);
            txtClassi.Text = S.Classi;
            txtExtra.Text = S.CartelleExtra;
            PopolaModelli();
            RicaricaStruttura();
            Tema.Applica(this);
        }

        public override void Esce()
        {
            S.Drive = txtDrive.Text;
            string anno = (txtAnno.Text ?? "").Trim();
            S.Anno = (anno == Stato.AnnoScolastico(DateTime.Now)) ? "" : anno;
            S.Classi = txtClassi.Text;
            S.CartelleExtra = txtExtra.Text;
        }

        string AnnoCorrente()
        {
            string a = (txtAnno.Text ?? "").Trim();
            return (a == "") ? Stato.AnnoScolastico(DateTime.Now) : a;
        }

        string PercorsoDrive() { return (txtDrive.Text ?? "").Trim().TrimEnd('\\'); }

        string PercorsoModelli() { return Path.Combine(PercorsoDrive(), "MODELLI"); }

        string CartellaAnno()
        {
            return Path.Combine(PercorsoDrive(), "A.S. " + AnnoCorrente());
        }

        void Log(string m)
        {
            logBox.AppendText(m + "\r\n");
            logBox.SelectionStart = logBox.TextLength;
            logBox.ScrollToCaret();
            Application.DoEvents();
        }

        // -------------------------------------------------------------------
        void PopolaModelli()
        {
            Dictionary<string, bool> prima = new Dictionary<string, bool>();
            for (int i = 0; i < clbModelli.Items.Count; i++)
                prima[Convert.ToString(clbModelli.Items[i])] = clbModelli.GetItemChecked(i);

            clbModelli.Items.Clear();
            string mod = PercorsoModelli();
            if (!Directory.Exists(mod))
            {
                clbModelli.Items.Add("(non trovo la cartella MODELLI in " + PercorsoDrive() + ")", false);
                clbModelli.Enabled = false;
                return;
            }
            clbModelli.Enabled = true;
            try
            {
                string[] cartelle = Directory.GetDirectories(mod);
                Array.Sort(cartelle);
                foreach (string d in cartelle)
                {
                    string nome = Path.GetFileName(d);
                    bool spuntata = prima.ContainsKey(nome) ? prima[nome] : true;
                    clbModelli.Items.Add(nome, spuntata);
                }
            }
            catch (Exception ex)
            {
                clbModelli.Items.Add("(errore leggendo MODELLI: " + ex.Message + ")", false);
            }
        }

        class VoceStruttura { public string Nome = ""; public bool Spuntata = true; }

        string PercorsoStruttura()
        {
            try { return Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), FileStruttura); }
            catch { return FileStruttura; }
        }

        List<VoceStruttura> LeggiStrutturaJson()
        {
            string p = PercorsoStruttura();
            if (!File.Exists(p)) return null;
            try
            {
                JavaScriptSerializer ser = new JavaScriptSerializer();
                Dictionary<string, object> radice =
                    ser.DeserializeObject(File.ReadAllText(p, Encoding.UTF8)) as Dictionary<string, object>;
                if (radice == null || !radice.ContainsKey("cartelle")) return null;
                object[] a = radice["cartelle"] as object[];
                if (a == null) return null;

                List<VoceStruttura> voci = new List<VoceStruttura>();
                foreach (object o in a)
                {
                    Dictionary<string, object> d = o as Dictionary<string, object>;
                    if (d == null) continue;
                    string nome = Stato.Str(d, "nome", "");
                    if (nome.Trim() == "") continue;
                    VoceStruttura v = new VoceStruttura();
                    v.Nome = nome;
                    v.Spuntata = Stato.Bool(d, "spuntata", true);
                    voci.Add(v);
                }
                return (voci.Count > 0) ? voci : null;
            }
            catch { return null; }
        }

        void RicaricaStruttura()
        {
            List<VoceStruttura> voci = LeggiStrutturaJson();
            if (voci == null)
            {
                voci = new List<VoceStruttura>();
                foreach (string s in StrutturaDiDefault)
                {
                    VoceStruttura v = new VoceStruttura();
                    v.Nome = s;
                    v.Spuntata = (s != "Liceo potenziato-attivita");
                    voci.Add(v);
                }
            }
            Dictionary<string, bool> prima = new Dictionary<string, bool>();
            for (int i = 0; i < clbStruttura.Items.Count; i++)
                prima[Convert.ToString(clbStruttura.Items[i])] = clbStruttura.GetItemChecked(i);

            clbStruttura.Items.Clear();
            foreach (VoceStruttura v in voci)
                clbStruttura.Items.Add(v.Nome, prima.ContainsKey(v.Nome) ? prima[v.Nome] : v.Spuntata);
        }

        void ModificaStruttura()
        {
            string p = PercorsoStruttura();
            if (!File.Exists(p))
            {
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("{");
                sb.AppendLine("  \"cartelle\": [");
                for (int i = 0; i < clbStruttura.Items.Count; i++)
                {
                    string nome = Convert.ToString(clbStruttura.Items[i]);
                    string sep = (i < clbStruttura.Items.Count - 1) ? "," : "";
                    sb.AppendLine("    { \"nome\": \"" + nome.Replace("\\", "\\\\") + "\", \"spuntata\": " +
                                  (clbStruttura.GetItemChecked(i) ? "true" : "false") + " }" + sep);
                }
                sb.AppendLine("  ]");
                sb.AppendLine("}");
                File.WriteAllText(p, sb.ToString(), new UTF8Encoding(false));
            }
            Guscio.Apri(p);
            MessageBox.Show(this,
                "Ho aperto " + FileStruttura + " con l'editor di testo.\n\n" +
                "Modifica i nomi, salva con Ctrl+S e torna qui: l'elenco si aggiorna da solo.\n" +
                "Nel file il backslash si scrive doppio: \"RECUPERI\\\\TRIMESTRE\".",
                "Struttura", MessageBoxButtons.OK, MessageBoxIcon.Information);
            RicaricaStruttura();
            Tema.Applica(this);
        }

        // ===================================================================
        //  GENERAZIONE
        // ===================================================================
        void Genera()
        {
            logBox.Clear();
            Esce();

            string bersaglio = CartellaAnno();
            string avviso = Directory.Exists(bersaglio)
                ? "La cartella\n\n" + bersaglio + "\n\nesiste gia'. Verranno aggiunte solo le " +
                  "cartelle e i file mancanti: niente viene sovrascritto o cancellato.\n\nProcedo?"
                : "Sto per creare\n\n" + bersaglio + "\n\nProcedo?";
            if (MessageBox.Show(this, avviso, "Conferma",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

            List<string> gruppi = new List<string>();
            if (clbModelli.Enabled)
                for (int i = 0; i < clbModelli.Items.Count; i++)
                    if (clbModelli.GetItemChecked(i)) gruppi.Add(Convert.ToString(clbModelli.Items[i]));

            List<string> struttura = new List<string>();
            for (int i = 0; i < clbStruttura.Items.Count; i++)
                if (clbStruttura.GetItemChecked(i)) struttura.Add(Convert.ToString(clbStruttura.Items[i]));

            List<string> righe = new List<string>();
            try
            {
                RisultatoGenerazione r = GeneraAnno(AnnoCorrente(), PercorsoDrive(),
                                                    txtClassi.Text, gruppi, struttura,
                                                    txtExtra.Text, righe);
                foreach (string riga in righe) Log(riga);
                Log("");
                Log("=== FINE ===");
                Log("Struttura creata in: " + r.Cartella);
                Log("Elementi creati: " + r.Creati);
                Log("Problemi: " + r.Errori.Count);
                foreach (string e in r.Errori) Log("  - " + e);
                Guscio.Stato1(r.Errori.Count == 0
                    ? "Fatto: " + r.Creati + " elementi creati."
                    : "Fatto con " + r.Errori.Count + " problemi: leggi il riquadro.",
                    r.Errori.Count == 0 ? Tema.Verde : Tema.Ambra);
            }
            catch (Exception ex)
            {
                foreach (string riga in righe) Log(riga);
                Log("ERRORE: " + ex.Message);
                MessageBox.Show(this, ex.Message, "Non ho potuto procedere",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        public static RisultatoGenerazione GeneraAnno(string anno, string driveIn, string classiText,
            List<string> gruppiIn, List<string> strutturaIn, string extraText, List<string> log)
        {
            RisultatoGenerazione res = new RisultatoGenerazione();
            List<string> errori = res.Errori;
            int creati = 0;

            if (anno == "") throw new Exception("Manca l'anno scolastico (per esempio 2026-27).");
            string drive = (driveIn ?? "").Trim().TrimEnd('\\');
            if (drive == "") drive = Stato.DriveDiDefault();
            if (!Directory.Exists(drive)) throw new Exception("Percorso non trovato: " + drive);

            string modelli = Path.Combine(drive, "MODELLI");
            bool conModelli = Directory.Exists(modelli);
            if (!conModelli)
                log.Add("Nota: non c'e' la cartella MODELLI in " + drive + ": creo solo le cartelle.");

            List<string> classi = new List<string>();
            foreach (string riga in (classiText ?? "").Split(new char[] { '\r', '\n', ';' }))
            {
                string r = riga.Trim();
                if (r != "") classi.Add(r);
            }
            if (classi.Count == 0)
                throw new Exception("Scrivi almeno una classe (per esempio  1A: Matematica, Fisica).");

            string target = Path.Combine(drive, "A.S. " + anno);
            if (Directory.Exists(target))
                log.Add("La cartella esiste gia': aggiungo solo cio' che manca.");

            foreach (string d in strutturaIn) Directory.CreateDirectory(Path.Combine(target, d));
            log.Add("Struttura creata: " + target);
            creati++;

            if (extraText != null && extraText.Trim() != "")
            {
                foreach (string e in extraText.Split(new char[] { ',', ';', '\n', '\r' }))
                {
                    string ee = e.Trim();
                    if (ee == "") continue;
                    if (ee.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                    {
                        errori.Add("Nome di cartella non valido: [" + ee + "]");
                        continue;
                    }
                    Directory.CreateDirectory(Path.Combine(target, ee));
                    log.Add("Cartella in piu': " + ee);
                    creati++;
                }
            }

            foreach (string c in classi)
            {
                string nomeClasse = c;
                List<string> materie = new List<string>();
                int idx = c.IndexOf(':');
                if (idx > 0)
                {
                    nomeClasse = c.Substring(0, idx).Trim();
                    foreach (string m in c.Substring(idx + 1).Split(new char[] { ',', ';' }))
                    {
                        string mm = m.Trim();
                        if (mm != "") materie.Add(mm);
                    }
                }
                if (nomeClasse == "" || nomeClasse.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                {
                    errori.Add("Classe non valida: [" + c + "]");
                    continue;
                }

                string dirClasse = Path.Combine(target, "CLASSI", nomeClasse);
                Directory.CreateDirectory(dirClasse);
                Directory.CreateDirectory(Path.Combine(target, "RECUPERI", "TRIMESTRE", nomeClasse));
                Directory.CreateDirectory(Path.Combine(target, "RECUPERI", "PENTAMESTRE", nomeClasse));

                string elenco = "";
                foreach (string m in materie)
                {
                    if (m.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                    {
                        errori.Add("Materia non valida in [" + c + "]: " + m);
                        continue;
                    }
                    Directory.CreateDirectory(Path.Combine(dirClasse, m));
                    Directory.CreateDirectory(Path.Combine(target, "RECUPERI", "TRIMESTRE", nomeClasse, m));
                    Directory.CreateDirectory(Path.Combine(target, "RECUPERI", "PENTAMESTRE", nomeClasse, m));
                    if (elenco != "") elenco += ", ";
                    elenco += m;
                }

                if (conModelli)
                {
                    string moduloSrc = TrovaModulo(modelli);
                    if (moduloSrc != null)
                    {
                        string dest = Path.Combine(dirClasse,
                            "Modulo di controllo - segni " + nomeClasse + Path.GetExtension(moduloSrc));
                        if (File.Exists(dest)) log.Add("  classe " + nomeClasse + ": modulo gia' presente");
                        else
                        {
                            try
                            {
                                File.Copy(moduloSrc, dest, false);
                                log.Add("  classe " + nomeClasse + ": copiato il modulo di controllo");
                                creati++;
                            }
                            catch (Exception ex) { errori.Add("Modulo classe " + nomeClasse + ": " + ex.Message); }
                        }
                    }
                    else
                    {
                        string nota = "DUPLICA IN GOOGLE DOCS - Modulo di controllo - segni " + nomeClasse + ".txt";
                        string percorsoNota = Path.Combine(dirClasse, nota);
                        if (!File.Exists(percorsoNota))
                        {
                            File.WriteAllLines(percorsoNota, new string[]
                            {
                                "Per la classe " + nomeClasse + ": duplicare in Google Drive",
                                "(tasto destro -> Crea una copia) il documento",
                                "'Modulo di verifica compiti_assegnati' e rinominarlo:",
                                "Modulo di controllo - segni " + nomeClasse,
                                "Sorgente: un anno qualsiasi dentro A.S. PRECEDENTI"
                            }, Encoding.UTF8);
                        }
                    }
                }

                log.Add("Classe: " + nomeClasse + (elenco != "" ? " -> " + elenco : ""));
                creati++;
            }

            if (conModelli && gruppiIn != null)
            {
                foreach (string nome in gruppiIn)
                {
                    string g = Path.Combine(modelli, nome);
                    if (!Directory.Exists(g)) { errori.Add("Modello non trovato: " + g); continue; }
                    string dest = Path.Combine(target, nome);
                    List<string> google = new List<string>();

                    foreach (string f in Directory.GetFiles(g))
                    {
                        if (EFileGoogle(f)) { google.Add(Path.GetFileName(f)); continue; }
                        if (Path.GetFileNameWithoutExtension(f) == "Modulo di controllo - segni") continue;
                        Directory.CreateDirectory(dest);
                        string df = Path.Combine(dest, Path.GetFileName(f));
                        if (File.Exists(df)) continue;
                        try
                        {
                            File.Copy(f, df, false);
                            log.Add("  copiato: " + nome + "\\" + Path.GetFileName(f));
                            creati++;
                        }
                        catch (Exception ex)
                        {
                            errori.Add("Copia fallita: " + Path.GetFileName(f) + " :: " + ex.Message);
                        }
                    }

                    foreach (string sd in Directory.GetDirectories(g))
                    {
                        List<string> sotto = new List<string>();
                        try
                        {
                            CopiaCartella(sd, Path.Combine(dest, Path.GetFileName(sd)), sotto);
                            log.Add("  copiato: " + nome + "\\" + Path.GetFileName(sd) + "\\");
                            creati++;
                        }
                        catch (Exception ex)
                        {
                            errori.Add("Copia fallita: " + Path.GetFileName(sd) + " :: " + ex.Message);
                        }
                        foreach (string gf in sotto) google.Add(Path.GetFileName(sd) + "\\" + gf);
                    }

                    if (google.Count > 0)
                    {
                        Directory.CreateDirectory(dest);
                        List<string> righe = new List<string>();
                        righe.Add("Duplicare in Google Drive (tasto destro -> Crea una copia) questi file:");
                        righe.Add("(i documenti Google non si possono copiare come file normali)");
                        righe.Add("");
                        foreach (string gf in google) righe.Add("- " + gf);
                        File.WriteAllLines(Path.Combine(dest, "DUPLICA IN GOOGLE DOCS - " + nome + ".txt"),
                                           righe.ToArray(), Encoding.UTF8);
                        log.Add("  " + google.Count + " documenti Google da duplicare a mano (nota creata)");
                    }
                }
            }

            res.Cartella = target;
            res.Creati = creati;
            return res;
        }

        static string TrovaModulo(string modelli)
        {
            string[] basi =
            {
                Path.Combine(modelli, "Modulo di controllo - segni"),
                Path.Combine(modelli, "Verifiche e valutazione", "Modulo di controllo - segni")
            };
            foreach (string b in basi)
                foreach (string est in new string[] { ".xlsx", ".docx", ".xls", ".doc" })
                    if (File.Exists(b + est)) return b + est;
            return null;
        }

        static bool EFileGoogle(string percorso)
        {
            string e = Path.GetExtension(percorso).ToLowerInvariant();
            return e == ".gdoc" || e == ".gsheet" || e == ".gslides" ||
                   e == ".gdraw" || e == ".gform" || e == ".gsite";
        }

        static void CopiaCartella(string origine, string destinazione, List<string> google)
        {
            Directory.CreateDirectory(destinazione);
            foreach (string f in Directory.GetFiles(origine))
            {
                if (EFileGoogle(f)) { google.Add(Path.GetFileName(f)); continue; }
                string df = Path.Combine(destinazione, Path.GetFileName(f));
                if (File.Exists(df)) continue;         // non sovrascrive mai
                File.Copy(f, df, false);
            }
            foreach (string sd in Directory.GetDirectories(origine))
                CopiaCartella(sd, Path.Combine(destinazione, Path.GetFileName(sd)), google);
        }
    }
}
