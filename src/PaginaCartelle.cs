// ===========================================================================
//  PaginaCartelle.cs - la struttura del nuovo anno scolastico nel Drive
//
//  Porta dentro Campanella il "Generatore Anno Scolastico": crea la cartella
//  "A.S. <anno>" nella radice del Drive, con le classi, le materie, i
//  recuperi e le cartelle fisse, e ci copia dentro i modelli da MODELLI.
//
//  Regola di fondo: non sovrascrive e non cancella mai niente. Se una
//  cartella o un file esistono gia', li lascia stare. Il lavoro sul disco
//  lo fa GeneratoreAnno.cs, che si prova senza finestre.
//
//  Due passi. Il primo lavora sul PC, nella cartella che Google Drive tiene
//  sincronizzata. Il secondo e' per quello che dal PC non si puo' fare: un
//  modulo Google (.gform) e' solo un segnaposto, e il foglio delle risposte
//  dell'anno va creato e collegato dentro l'account. Qui si prepara lo script
//  che lo fa (Moduli.cs + risorse\Moduli.gs) e si spiega come usarlo.
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
    class PaginaCartelle : Pagina
    {
        static readonly string[] NomiPassi =
        {
            "1  Le cartelle dell'anno",
            "2  I moduli Google"
        };

        Panel[] pagine;
        int passo = 0;

        // passo 1
        TextBox txtAnno, txtClassi, txtDrive, txtExtra, logBox;
        CheckedListBox clbModelli, clbStruttura;
        Label lblDrive;
        Button btnAltroDrive;
        List<DriveTrovato> drivi = new List<DriveTrovato>();

        // passo 2
        ComboBox cmbModulo, cmbCartellaFoglio, cmbCosaVedereM;
        TextBox txtNomeFoglio, txtChiusura, txtAnteprimaM;
        CheckBox chkChiusura, chkSvuota, chkDriveM;
        Label lblModuloRiepilogo, lblModuloTrovati, lblCartellaFoglio;
        bool zittoM = false;
        string cartellaProposta = "", foglioProposto = "";

        // Le cartelle fisse di partenza: generiche apposta. Chi vuole le proprie
        // le cambia da "Modifica struttura...", che scrive struttura.json.
        static readonly string[] StrutturaDiDefault =
        {
            "CLASSI",
            "Amministrazione e modulistica",
            "Verifiche e valutazione",
            "Orari e calendari",
            "Materiali insegnante",
            "Griglie di valutazione",
            "Dipartimento",
            "RECUPERI\\TRIMESTRE",
            "RECUPERI\\PENTAMESTRE",
            "Da stampare",
            "Adempimenti finali",
            "Educazione Civica"
        };

        const string FileStruttura = "struttura.json";

        /// <summary>La sottocartella di MODELLI i cui file vanno dentro ogni classe.</summary>
        const string CartellaPerClasse = GeneratoreAnno.CartellaPerClasse;

        public PaginaCartelle(Guscio g) : base(g)
        {
            pagine = new Panel[NomiPassi.Length];
            pagine[0] = PaginaStruttura();
            pagine[1] = PaginaModuli();
            foreach (Panel p in pagine)
            {
                p.Dock = DockStyle.Fill;
                p.Visible = false;
                p.AutoScroll = true;
                Controls.Add(p);
            }
            pagine[0].Visible = true;
        }

        public override string Nome { get { return "Cartelle"; } }
        public override string[] Passi { get { return NomiPassi; } }

        public override int Passo
        {
            get { return passo; }
            set
            {
                if (value < 0 || value >= pagine.Length) return;
                passo = value;
                for (int i = 0; i < pagine.Length; i++) pagine[i].Visible = (i == passo);
                if (passo == 1) { RiempiModuli(); AggiornaModulo(); }
            }
        }

        // ===================================================================
        //  PASSO 1 - LE CARTELLE, SUL PC
        // ===================================================================
        Panel PaginaStruttura()
        {
            Panel p = new Panel();
            p.AutoScroll = true;
            int y = 6;
            p.Controls.Add(Tema.Testo1("La struttura del nuovo anno", 0, y, 0, Tema.Sezione, Ruolo.Sezione));
            y += 40;
            Label intro = Tema.RigaAiuto(p,
                "Crea nel Drive la cartella dell'anno con le classi, le materie, i recuperi e i modelli.",
                0, y, Tema.Normale, Ruolo.Tenue, "La struttura del nuovo anno",
                "Crea nel Drive la cartella \"A.S. <anno>\" con dentro le classi, le materie, i " +
                "recuperi e le cartelle fisse, e ci copia i modelli presi da MODELLI: una " +
                "sottocartella per gruppo, e i file di MODELLI\\PER CLASSE dentro ogni classe " +
                "con il nome della classe in coda.\r\n\r\n" +
                "Non sovrascrive e non cancella mai niente: aggiunge solo cio' che manca, " +
                "quindi la puoi far girare tutte le volte che vuoi.");
            y += intro.Height + 16;

            Tema.TitoloAiuto(p, "Anno scolastico", 0, y, "Anno scolastico",
                "Si aggiorna da solo il primo settembre, quindi di solito non lo tocchi.\r\n\r\n" +
                "Se lo scrivi a mano resta quello, anche l'anno prossimo: svuota la casella " +
                "per tornare a quello automatico.");
            txtAnno = Tema.Casella(0, y + 22, 180, Stato.AnnoScolastico(DateTime.Now));
            p.Controls.Add(txtAnno);
            y += 62;

            Tema.TitoloAiuto(p, "Classi  (una per riga; dopo i due punti le materie)", 0, y,
                "Come si scrivono le classi",
                "1A: Matematica, Fisica\r\n" +
                "    crea CLASSI\\1A\\Matematica e CLASSI\\1A\\Fisica\r\n\r\n" +
                "2B-Ls: Matematica\r\n" +
                "    una sola materia\r\n\r\n" +
                "4Ar\r\n" +
                "    senza materie: solo la cartella della classe\r\n\r\n" +
                "Fra le materie va bene anche il punto e virgola (1A: Matematica; Fisica), " +
                "ma ogni classe va su una riga sua.\r\n\r\n" +
                "Per ogni classe crea anche RECUPERI\\TRIMESTRE e RECUPERI\\PENTAMESTRE, " +
                "con le stesse materie dentro.");
            txtClassi = Tema.CasellaMulti(0, y + 22, 880, 96,
                "1A: Matematica, Fisica\r\n2B-Ls: Matematica\r\n4Ar");
            p.Controls.Add(txtClassi);
            y += 126;

            p.Controls.Add(Tema.Testo1("Percorso di \"Il mio Drive\"", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtDrive = Tema.Casella(0, y + 22, 700, "per esempio  H:\\Il mio Drive");
            txtDrive.TextChanged += delegate { PopolaModelli(); AggiornaDrive(); };
            p.Controls.Add(txtDrive);
            p.Controls.Add(Tema.Bottone("Sfoglia...", 712, y + 21, 130, delegate
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
            y += 52;

            // chi ha anche l'account personale si ritrova due "Il mio Drive": se
            // quello scelto non e' quello della scuola, qui lo si vede e si cambia
            lblDrive = Tema.Testo1("", 0, y, 700, Tema.Piccolo, Ruolo.Tenue);
            lblDrive.Height = 34;
            p.Controls.Add(lblDrive);
            btnAltroDrive = Tema.Bottone("Usa quello", 712, y - 2, 130, delegate { UsaIlMigliore(); });
            btnAltroDrive.Visible = false;
            p.Controls.Add(btnAltroDrive);
            y += 40;

            p.Controls.Add(Tema.Testo1("Modelli da includere  (le sottocartelle di MODELLI)",
                                     0, y, 420, Tema.Grassetto, Ruolo.Normale));
            p.Controls.Add(Tema.Testo1("Cartelle dell'anno", 450, y, 250, Tema.Grassetto, Ruolo.Normale));
            p.Controls.Add(Tema.Bottone("Modifica struttura...", 700, y - 4, 180,
                delegate { ModificaStruttura(); }));

            clbModelli = new CheckedListBox();
            clbModelli.Location = new Point(0, y + 24);
            clbModelli.Size = new Size(430, 150);
            clbModelli.CheckOnClick = true;
            clbModelli.Font = Tema.Normale;
            p.Controls.Add(clbModelli);

            clbStruttura = new CheckedListBox();
            clbStruttura.Location = new Point(450, y + 24);
            clbStruttura.Size = new Size(430, 150);
            clbStruttura.CheckOnClick = true;
            clbStruttura.Font = Tema.Normale;
            p.Controls.Add(clbStruttura);
            y += 186;

            p.Controls.Add(Tema.Testo1("Cartelle in piu'  (facoltative, una per riga o separate da virgola)",
                                     0, y, 600, Tema.Grassetto, Ruolo.Normale));
            txtExtra = Tema.CasellaMulti(0, y + 22, 880, 50, "Progetti, PCTO, Consiglio di classe");
            p.Controls.Add(txtExtra);
            y += 82;

            p.Controls.Add(Tema.Testo1("Cosa sta succedendo", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            logBox = Tema.Registro(0, y + 22, 880, 130, true);
            p.Controls.Add(logBox);
            y += 164;

            p.Controls.Add(Tema.BottonePrincipale("Genera la struttura", 0, y, 200, delegate { Genera(); }));
            p.Controls.Add(Tema.Bottone("Apri la cartella dell'anno", 212, y + 2, 200, delegate
            {
                string t = CartellaAnno();
                if (Directory.Exists(t)) Guscio.Apri(t);
                else MessageBox.Show(this, "La cartella non c'e' ancora:\n" + t,
                    "Niente da aprire", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }));
            p.Controls.Add(Tema.Testo1(
                "I moduli Google (.gform) li prepara il passo 2.",
                430, y + 8, 300, Tema.Piccolo, Ruolo.Tenue));
            p.Controls.Add(Tema.Aiuto(736, y + 8, "E i moduli Google?",
                "Un file .gform sul PC e' solo un collegamento: copiarlo non crea un modulo " +
                "nuovo, e il foglio delle risposte non si puo' collegare da qui.\r\n\r\n" +
                "Per questo il foglio delle risposte dell'anno nuovo si prepara nel passo 2, " +
                "che lavora dentro Google."));
            return p;
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
            AggiornaDrive();
            RicaricaStruttura();
            CaricaModulo();
            Tema.Applica(this);
        }

        public override void Esce()
        {
            S.Drive = txtDrive.Text;
            string anno = (txtAnno.Text ?? "").Trim();
            S.Anno = (anno == Stato.AnnoScolastico(DateTime.Now)) ? "" : anno;
            S.Classi = txtClassi.Text;
            S.CartelleExtra = txtExtra.Text;
            RaccogliModulo();
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
        /// <summary>
        /// Dice se il Drive scelto e' quello giusto. Con due account Google sul
        /// computer (scuola e personale) le unita' sono due, e quella buona e'
        /// quella con dentro MODELLI o le cartelle degli anni.
        /// </summary>
        void AggiornaDrive()
        {
            if (lblDrive == null) return;
            if (drivi.Count == 0) drivi = Stato.DriviPossibili();

            string scelto = PercorsoDrive();
            DriveTrovato questo = null, migliore = null;
            foreach (DriveTrovato d in drivi)
            {
                if (string.Equals(d.Percorso, scelto, StringComparison.OrdinalIgnoreCase)) questo = d;
                if (migliore == null && (d.ConModelli || d.ConAnni)) migliore = d;
            }
            bool questoBuono = (questo != null) && (questo.ConModelli || questo.ConAnni);
            bool cambia = !questoBuono && migliore != null &&
                          !string.Equals(migliore.Percorso, scelto, StringComparison.OrdinalIgnoreCase);

            if (cambia)
            {
                lblDrive.Text =
                    "Qui dentro non c'e' MODELLI e non ci sono cartelle di anni scolastici." +
                    ((questo != null && questo.Account != "") ? " Sembra il Drive di " + questo.Account + "." : "") +
                    "\r\nQuello della scuola sembra  " + migliore.Descrizione();
                lblDrive.Tag = Ruolo.Avviso;
                btnAltroDrive.Tag = migliore.Percorso;
                btnAltroDrive.Visible = true;
            }
            else
            {
                string altri = "";
                foreach (DriveTrovato d in drivi)
                {
                    if (string.Equals(d.Percorso, scelto, StringComparison.OrdinalIgnoreCase)) continue;
                    altri += (altri == "" ? "" : "   ·   ") + d.Descrizione();
                }
                lblDrive.Text = (questo != null && questo.Account != "")
                    ? "Drive di " + questo.Account + (altri == "" ? "" : ".  Sul computer c'e' anche: " + altri)
                    : (altri == "" ? "" : "Sul computer c'e' anche: " + altri);
                lblDrive.Tag = Ruolo.Tenue;
                btnAltroDrive.Visible = false;
            }
            Tema.Applica(lblDrive);
        }

        void UsaIlMigliore()
        {
            string p = Convert.ToString(btnAltroDrive.Tag);
            if (p == "") return;
            txtDrive.Text = p;
            PopolaModelli();
            AggiornaDrive();
            Guscio.Stato1("Adesso uso " + p);
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
                    // PER CLASSE non e' un gruppo: va dentro ogni classe, sempre
                    if (nome.Equals(CartellaPerClasse, StringComparison.OrdinalIgnoreCase)) continue;
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
                    v.Spuntata = true;
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
        //  PASSO 2 - I MODULI GOOGLE, NEL CLOUD
        // ===================================================================
        Panel PaginaModuli()
        {
            Panel p = new Panel();
            p.AutoScroll = true;
            p.Controls.Add(Tema.Testo1("Il foglio delle risposte dei moduli Google", 0, 6, 0,
                                       Tema.Sezione, Ruolo.Sezione));
            int y = 46;

            Label intro = Tema.RigaAiuto(p,
                "Qui prepari uno script da incollare dentro il modulo: ogni anno crea il foglio " +
                "delle risposte e ce lo collega.",
                0, y, Tema.Normale, Ruolo.Tenue, "Perche' serve uno script",
                "Un modulo Google sul PC e' solo un segnaposto: copiarlo o spostarlo da Esplora " +
                "file non si porta dietro il foglio delle risposte, che ogni anno andrebbe " +
                "ricreato e ricollegato a mano.\r\n\r\n" +
                "Lo script fa quel lavoro da dentro Google: crea il foglio dell'anno nella " +
                "cartella giusta, ci collega il modulo, lo riapre, e a fine anno lo chiude " +
                "lasciando il foglio fermo com'e'. Non cancella niente.");
            y += intro.Height + 16;

            Panel avviso = Tema.Scheda1("Da sapere prima",
                "Lo script si incolla una volta sola per ogni modulo. Poi, ogni anno dal primo " +
                "settembre, apri il modulo e scegli Campanella -> Prepara l'anno nuovo: un clic, " +
                "senza reincollare niente.",
                0, y, 880,
                "I permessi dello script",
                "Lo script vive in un progetto suo, dentro il modulo, e Google gli chiede i suoi " +
                "permessi: Moduli, Fogli, Drive e le attivita' programmate.\r\n\r\n" +
                "Lo script della posta resta com'e': i permessi dei due progetti non si sommano, " +
                "e togliere uno non tocca l'altro.");
            p.Controls.Add(avviso);
            y += avviso.Height + 16;

            p.Controls.Add(Tema.Testo1("Il modulo", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            cmbModulo = new ComboBox();
            cmbModulo.Location = new Point(0, y + 22);
            cmbModulo.Width = 520;
            cmbModulo.Font = Tema.Normale;
            cmbModulo.DropDownStyle = ComboBoxStyle.DropDown;
            cmbModulo.TextChanged += delegate { if (!zittoM) { Proponi(); AggiornaModulo(); } };
            p.Controls.Add(cmbModulo);
            lblModuloTrovati = Tema.Testo1("", 532, y + 22, 348, Tema.Piccolo, Ruolo.Tenue);
            lblModuloTrovati.Height = 40;
            p.Controls.Add(lblModuloTrovati);
            y += 66;

            p.Controls.Add(Tema.Testo1("Cartella del foglio, dentro quella dell'anno", 0, y, 0,
                                       Tema.Grassetto, Ruolo.Normale));
            cmbCartellaFoglio = new ComboBox();
            cmbCartellaFoglio.Location = new Point(0, y + 22);
            cmbCartellaFoglio.Width = 340;
            cmbCartellaFoglio.Font = Tema.Normale;
            cmbCartellaFoglio.DropDownStyle = ComboBoxStyle.DropDown;
            cmbCartellaFoglio.TextChanged += delegate { if (!zittoM) AggiornaModulo(); };
            p.Controls.Add(cmbCartellaFoglio);

            p.Controls.Add(Tema.Testo1("Nome del foglio delle risposte", 360, y, 0,
                                       Tema.Grassetto, Ruolo.Normale));
            txtNomeFoglio = Tema.Casella(360, y + 22, 520, "Risposte Recuperi - A.S. {anno}");
            txtNomeFoglio.TextChanged += delegate { if (!zittoM) AggiornaModulo(); };
            p.Controls.Add(txtNomeFoglio);
            y += 54;
            lblCartellaFoglio = Tema.Testo1("", 0, y, 350, Tema.Piccolo, Ruolo.Tenue);
            lblCartellaFoglio.Height = 46;
            p.Controls.Add(lblCartellaFoglio);
            Tema.RigaAiuto(p, "{anno} diventa l'anno scolastico (2026-27).",
                           360, y, Tema.Piccolo, Ruolo.Tenue, "Il nome del foglio",
                "Dove scrivi {anno} lo script mette l'anno scolastico: il foglio si chiamera' " +
                "per esempio \"Risposte Recuperi - A.S. 2026-27\".\r\n\r\n" +
                "Se un foglio con quel nome c'e' gia', lo script usa quello invece di crearne un " +
                "altro: niente doppioni.");
            y += 44;

            chkChiusura = Tema.Spunta("A fine anno chiudi il modulo e scollega il foglio, finito il giorno",
                                      0, y + 2, Ruolo.Normale);
            chkChiusura.CheckedChanged += delegate
            {
                txtChiusura.Enabled = chkChiusura.Checked;
                if (!zittoM) AggiornaModulo();
            };
            p.Controls.Add(chkChiusura);
            txtChiusura = Tema.Casella(470, y, 70, ScriptModuli.ChiusuraDiDefault);
            txtChiusura.TextChanged += delegate { if (!zittoM) AggiornaModulo(); };
            p.Controls.Add(txtChiusura);
            p.Controls.Add(Tema.Testo1("giorno/mese. Riapre con \"Prepara l'anno nuovo\".",
                                       552, y + 4, 328, Tema.Piccolo, Ruolo.Tenue));
            y += 34;

            chkSvuota = Tema.SpuntaAiuto(p,
                "Togli dal modulo le risposte degli anni scorsi",
                0, y, "Le risposte vecchie",
                "Le risposte restano dentro il modulo anche quando il foglio viene scollegato, e " +
                "Google le ricopia in ogni foglio nuovo: senza questa spunta il foglio dell'anno " +
                "comincia con quelle vecchie in cima.\r\n\r\n" +
                "Con la spunta lo script le toglie, ma solo dopo aver controllato che un foglio " +
                "degli anni scorsi le contiene gia' tutte. Altrimenti non tocca niente e te lo dice.");
            chkSvuota.CheckedChanged += delegate { if (!zittoM) AggiornaModulo(); };
            y += 32;

            chkDriveM = Tema.SpuntaAiuto(p,
                "Metti il foglio nella cartella dell'anno",
                0, y, "Il permesso per Drive",
                "Con la spunta lo script chiede a Google anche il permesso per Drive, che gli " +
                "serve per mettere il foglio nella cartella dell'anno.\r\n\r\n" +
                "Senza, il codice non nomina Drive e il permesso non viene chiesto: il foglio " +
                "nasce nella radice di \"Il mio Drive\" e nella cartella dell'anno lo sposti tu " +
                "(spostarlo non rompe il collegamento). Serve se la scuola blocca agli script " +
                "l'accesso a Drive.");
            chkDriveM.CheckedChanged += delegate
            {
                cmbCartellaFoglio.Enabled = chkDriveM.Checked;
                if (!zittoM) AggiornaModulo();
            };
            y += 38;

            Tema.RigaAiuto(p,
                "Piu' moduli? Le voci 4 e 5 qui sotto preparano un foglio di controllo.",
                0, y, Tema.Piccolo, Ruolo.Tenue, "Il foglio di controllo",
                "Le voci 4 e 5 del menu preparano un foglio Google con una riga per modulo: da " +
                "li' si prepara l'anno nuovo per tutti insieme, e il foglio si aggiorna da solo " +
                "quando aggiungi o togli un modulo.\r\n\r\n" +
                "Quello script pero' chiede il permesso su tutti i tuoi moduli, non su uno solo: " +
                "con pochi moduli conviene questa strada.");
            y += 36;

            lblModuloRiepilogo = Tema.Testo1("", 0, y, 880, Tema.Grassetto, Ruolo.Normale);
            lblModuloRiepilogo.Height = 62;
            p.Controls.Add(lblModuloRiepilogo);
            y += 68;

            cmbCosaVedereM = new ComboBox();
            cmbCosaVedereM.Location = new Point(0, y);
            cmbCosaVedereM.Width = 340;
            cmbCosaVedereM.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbCosaVedereM.Font = Tema.Normale;
            cmbCosaVedereM.Items.AddRange(new object[]
            {
                "1. Il codice da incollare nel modulo",
                "2. Cosa fare, passo per passo",
                "3. (facoltativo) Il manifest, per chiedere meno permessi",
                "4. Piu' moduli: il codice del foglio di controllo",
                "5. Piu' moduli: cosa fare, passo per passo"
            });
            cmbCosaVedereM.SelectedIndex = 1;
            cmbCosaVedereM.SelectedIndexChanged += delegate { AggiornaModulo(); };
            p.Controls.Add(cmbCosaVedereM);

            p.Controls.Add(Tema.BottonePrincipale("Copia negli appunti", 352, y - 2, 180, delegate
            {
                string problema = ProblemaModulo();
                if ((cmbCosaVedereM.SelectedIndex == 0 || cmbCosaVedereM.SelectedIndex == 3) && problema != "")
                {
                    MessageBox.Show(this, problema, "Manca qualcosa",
                                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Guscio.Copia(TestoModulo(cmbCosaVedereM.SelectedIndex),
                    cmbCosaVedereM.SelectedIndex == 0 ? "Codice copiato: incollalo nel modulo."
                    : cmbCosaVedereM.SelectedIndex == 3 ? "Codice copiato: incollalo nel foglio."
                    : "Copiato.");
            }));
            p.Controls.Add(Tema.Bottone("Salva su file...", 542, y, 130, delegate { SalvaModulo(); }));
            p.Controls.Add(Tema.Bottone("Apri Google Moduli", 682, y, 198,
                delegate { Guscio.Apri("https://docs.google.com/forms/"); }));
            y += 40;

            txtAnteprimaM = Tema.Registro(0, y, 880, 300, false);
            txtAnteprimaM.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            p.Controls.Add(txtAnteprimaM);
            return p;
        }

        /// <summary>Le cartelle dell'anno fra cui scegliere: quelle spuntate al passo 1, piu' le aggiunte.</summary>
        List<string> CartelleDellAnno()
        {
            List<string> fuori = new List<string>();
            for (int i = 0; i < clbStruttura.Items.Count; i++)
                if (clbStruttura.GetItemChecked(i)) fuori.Add(Convert.ToString(clbStruttura.Items[i]));
            if (clbModelli.Enabled)
                for (int i = 0; i < clbModelli.Items.Count; i++)
                {
                    string g = Convert.ToString(clbModelli.Items[i]);
                    if (clbModelli.GetItemChecked(i) && !fuori.Contains(g)) fuori.Add(g);
                }
            foreach (string e in (txtExtra.Text ?? "").Split(new char[] { ',', ';', '\n', '\r' }))
                if (e.Trim() != "" && !fuori.Contains(e.Trim())) fuori.Add(e.Trim());
            return fuori;
        }

        /// <summary>Un altro Drive del computer che i moduli ce li ha davvero, oppure vuoto.</summary>
        string AltroDriveConModuli()
        {
            if (drivi.Count == 0) drivi = Stato.DriviPossibili();
            string scelto = PercorsoDrive();
            foreach (DriveTrovato d in drivi)
            {
                if (string.Equals(d.Percorso, scelto, StringComparison.OrdinalIgnoreCase)) continue;
                if (ScriptModuli.TrovaModuli(d.Percorso).Count > 0) return d.Descrizione();
            }
            return "";
        }

        void RiempiModuli()
        {
            zittoM = true;
            try
            {
                string scelto = cmbModulo.Text;
                List<string> trovati = ScriptModuli.TrovaModuli(PercorsoDrive());
                cmbModulo.Items.Clear();
                foreach (string m in trovati) cmbModulo.Items.Add(m);
                if (scelto.Trim() == "" && trovati.Count > 0) scelto = trovati[0];
                cmbModulo.Text = scelto;

                if (!Directory.Exists(PercorsoDrive()))
                    lblModuloTrovati.Text = "Non trovo il Drive (" + PercorsoDrive() + "): controlla il percorso al passo 1. Puoi comunque scrivere il nome del modulo.";
                else if (trovati.Count == 0)
                    lblModuloTrovati.Text = "Nessun modulo (.gform) in " + PercorsoDrive() + ": ho guardato in MODELLI e nella radice. " +
                        (AltroDriveConModuli() != "" ? "Con i moduli sembra invece " + AltroDriveConModuli() + ": cambia il percorso al passo 1."
                                                     : "Scrivi tu il nome del modulo.");
                else
                    lblModuloTrovati.Text = (trovati.Count == 1 ? "Un modulo trovato" : trovati.Count + " moduli trovati") +
                        " in MODELLI. Ogni modulo ha il suo script: sceglili uno alla volta.";

                string cartella = cmbCartellaFoglio.Text;
                cmbCartellaFoglio.Items.Clear();
                // "RECUPERI\TRIMESTRE" da solo inviterebbe a mettere il foglio un
                // piano troppo sotto: in elenco ci va prima "RECUPERI"
                List<string> proponibili = new List<string>();
                foreach (string c in CartelleDellAnno())
                {
                    string primo = (c ?? "").Split('\\', '/')[0].Trim();
                    if (primo != "" && !proponibili.Contains(primo)) proponibili.Add(primo);
                    if (c != primo && !proponibili.Contains(c)) proponibili.Add(c);
                }
                foreach (string c in proponibili) cmbCartellaFoglio.Items.Add(c);
                cmbCartellaFoglio.Text = cartella;
            }
            finally { zittoM = false; }
            Proponi();
        }

        /// <summary>
        /// Cartella e nome del foglio proposti per il modulo scelto. Non tocca quello
        /// che il docente ha scritto di suo: cambia solo i campi vuoti o ancora uguali
        /// alla proposta precedente.
        /// </summary>
        void Proponi()
        {
            string modulo = ScriptModuli.NomeModulo(cmbModulo.Text);
            string nuovaCartella = ScriptModuli.CartellaProposta(cmbModulo.Text, CartelleDellAnno());
            string nuovoFoglio = ScriptModuli.NomeFoglioProposto(modulo);
            bool prima = zittoM;
            zittoM = true;
            try
            {
                if (cmbCartellaFoglio.Text.Trim() == "" || cmbCartellaFoglio.Text == cartellaProposta)
                    cmbCartellaFoglio.Text = nuovaCartella;
                if (txtNomeFoglio.Text.Trim() == "" || txtNomeFoglio.Text == foglioProposto)
                    txtNomeFoglio.Text = nuovoFoglio;
            }
            finally { zittoM = prima; }
            cartellaProposta = nuovaCartella;
            foglioProposto = nuovoFoglio;
        }

        void CaricaModulo()
        {
            zittoM = true;
            try
            {
                cmbModulo.Text = S.ModuloPercorso;
                cmbCartellaFoglio.Text = S.ModuloCartella;
                txtNomeFoglio.Text = S.ModuloFoglio;
                txtChiusura.Text = (S.ModuloChiusura.Trim() == "") ? ScriptModuli.ChiusuraDiDefault : S.ModuloChiusura;
                chkChiusura.Checked = S.ModuloChiudi;
                txtChiusura.Enabled = S.ModuloChiudi;
                chkSvuota.Checked = S.ModuloSvuota;
                chkDriveM.Checked = S.ModuloDrive;
                cmbCartellaFoglio.Enabled = S.ModuloDrive;
                // quello che era una proposta resta una proposta anche dopo il riavvio
                cartellaProposta = ScriptModuli.CartellaProposta(S.ModuloPercorso, CartelleDellAnno());
                foglioProposto = ScriptModuli.NomeFoglioProposto(ScriptModuli.NomeModulo(S.ModuloPercorso));
            }
            finally { zittoM = false; }
            if (passo == 1) { RiempiModuli(); AggiornaModulo(); }
        }

        void RaccogliModulo()
        {
            S.ModuloPercorso = cmbModulo.Text.Trim();
            S.ModuloCartella = cmbCartellaFoglio.Text.Trim();
            S.ModuloFoglio = txtNomeFoglio.Text.Trim();
            S.ModuloChiusura = txtChiusura.Text.Trim();
            S.ModuloChiudi = chkChiusura.Checked;
            S.ModuloSvuota = chkSvuota.Checked;
            S.ModuloDrive = chkDriveM.Checked;
        }

        /// <summary>"auto" se l'anno del passo 1 e' quello calcolato dalla data, altrimenti quello scritto.</summary>
        string AnnoPerLoScript()
        {
            string a = AnnoCorrente();
            return (a == Stato.AnnoScolastico(DateTime.Now)) ? "auto" : a;
        }

        /// <summary>
        /// Tutti i moduli del Drive, per il foglio di controllo: quello scelto con le
        /// impostazioni di qui, gli altri con le proposte.
        /// </summary>
        List<ParametriModulo> TuttiIModuli()
        {
            List<ParametriModulo> fuori = new List<ParametriModulo>();
            List<string> cartelle = CartelleDellAnno();
            ParametriModulo scelto = Parametri();
            bool trovato = false;

            foreach (string percorso in ScriptModuli.TrovaModuli(PercorsoDrive()))
            {
                string nome = ScriptModuli.NomeModulo(percorso);
                if (nome == scelto.Modulo && !trovato) { fuori.Add(scelto); trovato = true; continue; }
                ParametriModulo p = new ParametriModulo();
                p.Modulo = nome;
                p.Anno = scelto.Anno;
                p.CartellaAnno = scelto.CartellaAnno;
                p.CartellaFoglio = ScriptModuli.CartellaProposta(percorso, cartelle);
                p.NomeFoglio = ScriptModuli.NomeFoglioProposto(nome);
                p.Chiusura = scelto.Chiusura;
                p.FusoOrario = scelto.FusoOrario;
                fuori.Add(p);
            }
            if (!trovato && scelto.Modulo.Trim() != "") fuori.Insert(0, scelto);
            if (fuori.Count == 0) fuori.Add(scelto);
            return fuori;
        }

        ParametriModulo Parametri()
        {
            ParametriModulo p = new ParametriModulo();
            p.Modulo = ScriptModuli.NomeModulo(cmbModulo.Text);
            p.Anno = AnnoPerLoScript();
            p.CartellaFoglio = chkDriveM.Checked ? cmbCartellaFoglio.Text.Trim() : "";
            p.NomeFoglio = txtNomeFoglio.Text.Trim();
            p.Chiusura = chkChiusura.Checked ? txtChiusura.Text.Trim() : "";
            p.Svuota = chkSvuota.Checked;
            p.UsaDrive = chkDriveM.Checked;
            return p;
        }

        /// <summary>Vuoto se il codice si puo' generare, altrimenti cosa manca.</summary>
        string ProblemaModulo()
        {
            string e = ScriptModuli.ControllaAnno(AnnoPerLoScript());
            if (e != "") return e + " Correggilo al passo 1.";
            e = ScriptModuli.ControllaNome(txtNomeFoglio.Text, "il nome del foglio delle risposte");
            if (e != "") return e;
            if (chkChiusura.Checked)
            {
                if (txtChiusura.Text.Trim() == "") return "Scrivi il giorno di chiusura (per esempio 31/08) oppure togli la spunta.";
                e = ScriptModuli.ControllaChiusura(txtChiusura.Text);
                if (e != "") return e;
            }
            return "";
        }

        /// <summary>Il foglio dell'anno c'e' gia'? Drive per desktop lo mostra come file .gsheet.</summary>
        bool FoglioPresente(ParametriModulo p, string anno)
        {
            return ScriptModuli.FoglioSulPc(PercorsoDrive(), anno, p);
        }

        void AggiornaModulo()
        {
            if (lblModuloRiepilogo == null || txtAnteprimaM == null) return;
            ParametriModulo p = Parametri();
            string anno = AnnoCorrente();
            string problema = ProblemaModulo();

            // la casella qui sopra confonde: meglio far vedere il percorso che ne esce
            if (lblCartellaFoglio != null)
            {
                string dentro = (cmbCartellaFoglio.Text ?? "").Trim().Trim('\\');
                lblCartellaFoglio.Text = (dentro == "")
                    ? "Vuota: il foglio nasce dentro \"A.S. " + anno + "\".\r\n" +
                      "Scrivendo RECUPERI nascerebbe in \"A.S. " + anno + "\\RECUPERI\"."
                    : "Il foglio nasce in \"A.S. " + anno + "\\" + dentro + "\".\r\n" +
                      "Vuota = dentro \"A.S. " + anno + "\"; la barra scende di un livello.";
            }

            if (problema != "")
            {
                lblModuloRiepilogo.Text = problema;
                lblModuloRiepilogo.Tag = Ruolo.Avviso;
            }
            else
            {
                string dove = p.UsaDrive
                    ? "Il mio Drive \\ A.S. " + anno + (p.CartellaFoglio != "" ? " \\ " + p.CartellaFoglio : "")
                    : "la radice di Il mio Drive (lo sposti tu)";
                DateTime? chiusura = ScriptModuli.DataChiusura(p.Chiusura, anno);
                string riga = "Foglio \"" + p.NomeFoglio.Replace("{anno}", anno) + "\" in " + dove + ".\n" +
                    (p.Anno == "auto"
                        ? "Anno calcolato dallo script: adesso " + anno + ", dal primo settembre il successivo."
                        : "Anno fisso " + anno + ": l'anno dopo lo script va rigenerato.") +
                    (chiusura.HasValue ? "  Chiusura: finito il " + chiusura.Value.ToString("dd/MM/yyyy") + "."
                                       : "  Nessuna chiusura automatica.");
                bool fatto = FoglioPresente(p, anno);
                riga += "\n" + (fatto
                    ? "Sul PC il foglio di quest'anno c'e' gia': per quest'anno lo script ha fatto il suo lavoro."
                    : "Sul PC il foglio di quest'anno non c'e' ancora: lo script e' da eseguire (o Drive deve ancora scaricarlo).");
                lblModuloRiepilogo.Text = riga;
                lblModuloRiepilogo.Tag = fatto ? Ruolo.Buono : Ruolo.Normale;
            }
            Tema.Applica(lblModuloRiepilogo);

            string testo = ((cmbCosaVedereM.SelectedIndex == 0 || cmbCosaVedereM.SelectedIndex == 3) && problema != "")
                ? "Il codice si puo' generare quando e' tutto a posto:\n\n" + problema
                : TestoModulo(cmbCosaVedereM.SelectedIndex);
            txtAnteprimaM.Text = testo.Replace("\r\n", "\n").Replace("\n", "\r\n");
            txtAnteprimaM.Select(0, 0);
        }

        string TestoModulo(int voce)
        {
            try
            {
                if (voce == 0) return ScriptModuli.Codice(Parametri());
                if (voce == 2) return ScriptModuli.Manifest(Parametri());
                if (voce == 3) return ScriptModuli.CodicePannello(TuttiIModuli());
                if (voce == 4) return ScriptModuli.IstruzioniPannello(TuttiIModuli(), AnnoCorrente());
                return ScriptModuli.Istruzioni(Parametri(), AnnoCorrente());
            }
            catch (Exception ex) { return "Non riesco a preparare il testo: " + ex.Message; }
        }

        void SalvaModulo()
        {
            int voce = cmbCosaVedereM.SelectedIndex;
            string problema = ProblemaModulo();
            if ((voce == 0 || voce == 3) && problema != "")
            {
                MessageBox.Show(this, problema, "Manca qualcosa", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            string modulo = ScriptModuli.NomeModulo(cmbModulo.Text);
            foreach (char c in Path.GetInvalidFileNameChars()) modulo = modulo.Replace(c, '_');
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.FileName = (voce == 0) ? "Moduli" + (modulo != "" ? " - " + modulo : "") + ".gs"
                           : (voce == 2) ? "appsscript.json"
                           : (voce == 3) ? "Pannello.gs" : "pannello - cosa fare.txt";
                d.Filter = "Tutti i file (*.*)|*.*";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                File.WriteAllText(d.FileName, TestoModulo(voce), new UTF8Encoding(false));
                Guscio.Stato1("Salvato: " + d.FileName);
            }
        }

        // ===================================================================
        //  GENERAZIONE
        // ===================================================================
        void Genera()
        {
            logBox.Clear();
            // casella vuota: propongo il Drive trovato sul computer, e la conferma
            // qui sotto fa vedere dove andrei a scrivere prima di toccare niente
            if (PercorsoDrive() == "") txtDrive.Text = Stato.DriveDiDefault();
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

            GeneratoreAnno generatore = new GeneratoreAnno();
            generatore.Avanzamento = delegate (string riga) { Log(riga); };
            try
            {
                RisultatoGenerazione r = generatore.Genera(AnnoCorrente(), PercorsoDrive(),
                                                           txtClassi.Text, gruppi, struttura,
                                                           txtExtra.Text);
                Log("");
                Log("=== FINE ===");
                Log("Struttura in: " + r.Cartella);
                Log("Creati adesso: " + r.Creati + "   (cartelle, file copiati e note)");
                Log("Gia' presenti, lasciati come sono: " + r.GiaPresenti);
                Log("Problemi: " + r.Errori.Count);
                foreach (string e in r.Errori) Log("  - " + e);
                Guscio.Stato1(r.Errori.Count == 0
                    ? "Fatto: " + r.Creati + " elementi creati, " + r.GiaPresenti + " gia' presenti."
                    : "Fatto con " + r.Errori.Count + " problemi: leggi il riquadro.",
                    r.Errori.Count == 0 ? Tema.Verde : Tema.Ambra);
            }
            catch (Exception ex)
            {
                Log("ERRORE: " + ex.Message);
                MessageBox.Show(this, ex.Message, "Non ho potuto procedere",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
