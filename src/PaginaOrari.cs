// ===========================================================================
//  PaginaOrari.cs - da un tabellone Excel alla tua casella e al tuo calendario
//
//  Quattro passi: si carica il file, si controlla che l'orario sia stato
//  letto bene, si preparano le email (tutte a te stesso: una per docente,
//  per ritrovare l'orario di un collega cercando il cognome in Gmail), e si
//  mette il tuo orario su Google Calendar.
//
//  E' uno strumento personale: non manda niente a nessun altro, e nei dati
//  che genera non c'e' nessun indirizzo. L'invio e il calendario li fa uno
//  script dentro l'account Google: qui si prepara solo il testo.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace Campanella
{
    class PaginaOrari : Pagina
    {
        static readonly string[] NomiPassi =
        {
            "1  Il file dell'orario",
            "2  Controlla la lettura",
            "3  Le email a te stesso",
            "4  Google Calendar"
        };

        /// <summary>Colori di Google Calendar: nome italiano -> valore di CalendarApp.Color.</summary>
        static readonly string[,] Colori =
        {
            { "scelto da Google", "" },
            { "blu", "BLUE" }, { "verde", "GREEN" }, { "rosso", "RED" }, { "arancione", "ORANGE" },
            { "giallo", "YELLOW" }, { "viola", "PURPLE" }, { "rosa", "PINK" }, { "grigio", "GRAY" },
            { "turchese", "TURQOISE" }, { "prugna", "PLUM" }, { "verde oliva", "OLIVE" }
        };

        Panel[] pagine;
        int passo = 0;

        RisultatoOrario orario = new RisultatoOrario();
        List<FoglioExcel> fogli = new List<FoglioExcel>();

        // passo 1
        TextBox txtFile;
        ComboBox cmbFoglio;
        TextBox txtEsito;
        Panel bannerPosta;
        Label lblBanner;

        // passo 2
        ComboBox cmbChi, cmbCosa;
        DataGridView grigliaOrario;
        Label lblRiepilogoOrario;

        // passo 3
        TextBox txtOggetto, txtOggettoClasse, txtNota;
        CheckBox chkClassi;
        ComboBox cmbCosaVedere;
        TextBox txtAnteprima;

        // passo 4
        ComboBox cmbDocente, cmbColore, cmbCosaVedere4;
        TextBox txtCalNome, txtPrimaOra, txtOreInizio, txtAnteprima4, txtSospensioni;
        DateTimePicker dtInizio, dtFine, dtValidoDal;
        CheckBox chkValidoDal;
        NumericUpDown numMinuti;
        Label lblCalRiepilogo;
        // quello che sta sotto il riepilogo, che cambia altezza: si sposta con
        // lui, alla stessa distanza dal suo fondo
        List<Control> sottoRiepilogo = new List<Control>();
        List<int> distanzeRiepilogo = new List<int>();
        bool zitto4 = false;

        public PaginaOrari(Guscio g) : base(g)
        {
            pagine = new Panel[NomiPassi.Length];
            pagine[0] = PaginaFile();
            pagine[1] = PaginaControlla();
            pagine[2] = PaginaInvio();
            pagine[3] = PaginaCalendario();
            foreach (Panel p in pagine)
            {
                p.Dock = DockStyle.Fill;
                p.Visible = false;
                p.AutoScroll = true;
                Controls.Add(p);
            }
            pagine[0].Visible = true;
        }

        public override string Nome { get { return "Orari"; } }
        public override string[] Passi { get { return NomiPassi; } }

        public override int Passo
        {
            get { return passo; }
            set
            {
                if (value < 0 || value >= pagine.Length) return;
                passo = value;
                for (int i = 0; i < pagine.Length; i++) pagine[i].Visible = (i == passo);
                if (passo == 1) AggiornaAnteprimaOrario();
                if (passo == 2) AggiornaAnteprimaCodice();
                if (passo == 3) { RiempiDocenti(); AggiornaCalendario(); }
            }
        }

        public override void Entra()
        {
            if (orario.Lezioni.Count == 0 && S.Lezioni.Count > 0) RipristinaDaStato();
            AggiornaBanner();
            Tema.Applica(this);
        }

        public override void Esce()
        {
            // il file dell'orario lo ricorda CaricaFile quando si legge davvero:
            // la casella qui e' vuota finche' non se ne sceglie uno, e scriverla
            // faceva dimenticare quello dell'ultima volta
            S.OggettoOrari = txtOggetto.Text;
            S.OggettoOrariClasse = txtOggettoClasse.Text;
            S.NotaOrari = txtNota.Text;
            S.InviaOrariClassi = chkClassi.Checked;
            // un foglio non riconosciuto lascia l'orario vuoto: quello salvato
            // prima resta, invece di sparire alla chiusura
            if (orario.Lezioni.Count > 0) orario.SalvaIn(S);
            RaccogliCalendario();
        }

        void RipristinaDaStato()
        {
            // le colonne e il periodo sono salvati con le lezioni: dopo un
            // riavvio l'orario torna con gli stessi giorni del tabellone
            orario = RisultatoOrario.Ripristina(S);
            // con i dati di una versione precedente qui c'e' l'invito a
            // ricaricare il file: lo mostro in "Cosa ho capito", al passo 1
            if (orario.Avvisi.Count > 0)
                txtEsito.Text = string.Join("\r\n\r\n", orario.Avvisi.ToArray());
        }

        // ===================================================================
        //  PASSO 1
        // ===================================================================
        Panel PaginaFile()
        {
            Panel p = NuovaPagina("Il file dell'orario");
            int y = 52;

            bannerPosta = new Panel();
            bannerPosta.Location = new Point(0, y);
            bannerPosta.Size = new Size(900, 88);
            bannerPosta.Tag = Ruolo.Scheda;
            Tema.Contorna(bannerPosta);
            lblBanner = Tema.Testo1("", 16, 14, 690, Tema.Normale, Ruolo.Avviso);
            lblBanner.Height = 60;
            bannerPosta.Controls.Add(lblBanner);
            bannerPosta.Controls.Add(Tema.Bottone("Vai a Posta", 730, 29, 150,
                delegate { Guscio.VaiAPagina(typeof(PaginaPosta), 0); }));
            p.Controls.Add(bannerPosta);
            y += 102;

            Tema.RigaAiuto(p, "Scegli il file Excel del tabellone orario.",
                0, y, Tema.Normale, Ruolo.Tenue, "Che file ci vuole",
                "Il tabellone con una riga per docente e, in orizzontale, i giorni divisi nelle " +
                "loro ore: per esempio l'export \"TABELLONE DOCENTI\" di Orario Facile.\r\n\r\n" +
                "Va bene anche un CSV, o una tabella con le colonne Docente, Giorno, Ora, " +
                "Classe. Altri formati vanno prima ridotti a uno di questi.");
            y += 34;

            txtFile = Tema.Casella(0, y, 700, "nessun file scelto");
            txtFile.ReadOnly = true;
            p.Controls.Add(txtFile);
            p.Controls.Add(Tema.BottonePrincipale("Scegli il file...", 712, y - 2, 170,
                delegate { ScegliFile(); }));
            y += 46;

            p.Controls.Add(Tema.Testo1("Foglio", 0, y + 4, 0, Tema.Normale, Ruolo.Tenue));
            cmbFoglio = new ComboBox();
            cmbFoglio.Location = new Point(60, y);
            cmbFoglio.Width = 300;
            cmbFoglio.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbFoglio.Font = Tema.Normale;
            cmbFoglio.SelectedIndexChanged += delegate { AnalizzaFoglio(); };
            p.Controls.Add(cmbFoglio);
            y += 44;

            p.Controls.Add(Tema.Testo1("Cosa ho capito", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtEsito = Tema.Registro(0, y + 22, 880, 240, true);
            p.Controls.Add(txtEsito);
            return p;
        }

        void AggiornaBanner()
        {
            StatoPosta sp = StatoPosta.Verifica(S);
            bannerPosta.Visible = !sp.Fatto;
            if (!sp.Fatto)
                lblBanner.Text =
                    "Consiglio: prima di mandarti gli orari, fai il riordino della posta.\n" +
                    "Cosi' questi messaggi nascono gia' etichettati sotto \"Orari\" e li ritrovi " +
                    "subito. Non e' obbligatorio: puoi andare avanti lo stesso.";
        }

        void ScegliFile()
        {
            using (OpenFileDialog d = new OpenFileDialog())
            {
                d.Filter = "Fogli di calcolo (*.xlsx;*.csv;*.tsv)|*.xlsx;*.csv;*.tsv|Tutti i file (*.*)|*.*";
                d.Title = "Scegli il file dell'orario";
                if (S.FileOrari != "" && File.Exists(S.FileOrari))
                    d.InitialDirectory = Path.GetDirectoryName(S.FileOrari);
                else if (Directory.Exists(S.Drive)) d.InitialDirectory = S.Drive;
                if (d.ShowDialog(this) != DialogResult.OK) return;
                CaricaFile(d.FileName);
            }
        }

        void CaricaFile(string percorso)
        {
            try
            {
                fogli = Xlsx.Leggi(percorso);
                txtFile.Text = percorso;
                S.FileOrari = percorso;
                cmbFoglio.Items.Clear();
                foreach (FoglioExcel f in fogli)
                    cmbFoglio.Items.Add(f.Nome + "   (" + f.NumeroRighe + " righe)");
                if (cmbFoglio.Items.Count > 0) cmbFoglio.SelectedIndex = 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Non riesco a leggere il file:\n\n" + ex.Message,
                    "Errore", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        void AnalizzaFoglio()
        {
            int i = cmbFoglio.SelectedIndex;
            if (i < 0 || i >= fogli.Count) return;

            orario = AnalisiOrario.Analizza(fogli[i]);
            List<string> docenti = orario.Docenti();
            List<string> classi = orario.Classi();

            StringBuilder sb = new StringBuilder();
            if (orario.Lezioni.Count == 0)
            {
                foreach (string a in orario.Avvisi) sb.AppendLine(a);
                txtEsito.Text = sb.ToString().Replace("\n", "\r\n");
                Guscio.Stato1("Foglio non riconosciuto.", Tema.Ambra);
                return;
            }

            sb.AppendLine("Formato riconosciuto: " + orario.Formato);
            if (orario.Titolo != "") sb.AppendLine("Intestazione: " + orario.Titolo);
            if (orario.Periodo != "") sb.AppendLine("Periodo: " + orario.Periodo);
            sb.AppendLine();
            sb.AppendLine("Docenti ........... " + docenti.Count);
            sb.AppendLine("Classi ............ " + classi.Count);
            sb.AppendLine("Giorni ............ " + string.Join(" ", orario.Giorni.ToArray()));
            sb.AppendLine("Ore al giorno ..... " + orario.OrePerGiorno);
            sb.AppendLine("Ore totali lette .. " + orario.Lezioni.Count);
            sb.AppendLine();
            foreach (string a in orario.Avvisi) sb.AppendLine(a);
            sb.AppendLine();
            sb.AppendLine("Primi docenti trovati:");
            for (int k = 0; k < Math.Min(8, docenti.Count); k++)
                sb.AppendLine("   " + docenti[k] + "  -  " + orario.OreDi(docenti[k]) + " ore");
            if (docenti.Count > 8) sb.AppendLine("   ... e altri " + (docenti.Count - 8));
            sb.AppendLine();
            sb.AppendLine("Classi trovate:");
            sb.AppendLine("   " + string.Join(", ", classi.ToArray()));
            sb.AppendLine();
            sb.AppendLine("Vai al passo 2 e controlla che l'orario di qualche docente sia giusto.");

            txtEsito.Text = sb.ToString().Replace("\n", "\r\n");
            txtEsito.Select(0, 0);
            Guscio.Stato1("Letti " + orario.Lezioni.Count + " impegni di " + docenti.Count + " docenti.");
        }

        // ===================================================================
        //  PASSO 2
        // ===================================================================
        Panel PaginaControlla()
        {
            Panel p = NuovaPagina("Controlla la lettura");
            int y = 52;

            p.Controls.Add(Tema.Testo1(
                "Confronta questa griglia con il file: se e' giusta, tutto il resto lo sara'. " +
                "Le ore segnate \"D\" nel tabellone diventano \"a disposizione\" nelle email.",
                0, y, 880, Tema.Normale, Ruolo.Tenue));
            y += 44;

            cmbCosa = new ComboBox();
            cmbCosa.Location = new Point(0, y);
            cmbCosa.Width = 160;
            cmbCosa.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbCosa.Font = Tema.Normale;
            cmbCosa.Items.AddRange(new object[] { "orario di un docente", "orario di una classe" });
            cmbCosa.SelectedIndex = 0;
            cmbCosa.SelectedIndexChanged += delegate { RiempiElencoChi(); };
            p.Controls.Add(cmbCosa);

            cmbChi = new ComboBox();
            cmbChi.Location = new Point(172, y);
            cmbChi.Width = 280;
            cmbChi.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbChi.Font = Tema.Normale;
            cmbChi.SelectedIndexChanged += delegate { DisegnaGriglia(); };
            p.Controls.Add(cmbChi);

            lblRiepilogoOrario = Tema.Testo1("", 470, y + 4, 420, Tema.Normale, Ruolo.Tenue);
            lblRiepilogoOrario.Height = 24;   // nasce vuota: senza questo il testo poi non ci sta
            p.Controls.Add(lblRiepilogoOrario);
            y += 44;

            grigliaOrario = new DataGridView();
            grigliaOrario.Location = new Point(0, y);
            grigliaOrario.Size = new Size(880, 380);
            grigliaOrario.Font = Tema.Normale;
            grigliaOrario.BorderStyle = BorderStyle.FixedSingle;
            grigliaOrario.AllowUserToAddRows = false;
            grigliaOrario.AllowUserToResizeRows = false;
            grigliaOrario.ReadOnly = true;
            grigliaOrario.RowHeadersVisible = false;
            grigliaOrario.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            grigliaOrario.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            p.Controls.Add(grigliaOrario);
            return p;
        }

        void AggiornaAnteprimaOrario() { RiempiElencoChi(); }

        void RiempiElencoChi()
        {
            cmbChi.Items.Clear();
            List<string> voci = (cmbCosa.SelectedIndex == 0) ? orario.Docenti() : orario.Classi();
            foreach (string v in voci) cmbChi.Items.Add(v);
            if (cmbChi.Items.Count > 0) cmbChi.SelectedIndex = 0;
            else DisegnaGriglia();
        }

        void DisegnaGriglia()
        {
            grigliaOrario.Columns.Clear();
            grigliaOrario.Rows.Clear();
            if (cmbChi.SelectedIndex < 0 || orario.Giorni.Count == 0)
            {
                lblRiepilogoOrario.Text = "Nessun orario caricato: torna al passo 1.";
                return;
            }

            string chi = Convert.ToString(cmbChi.SelectedItem);
            bool docente = (cmbCosa.SelectedIndex == 0);
            string[,] g = docente ? orario.GrigliaDocente(chi) : orario.GrigliaClasse(chi);

            DataGridViewTextBoxColumn c0 = new DataGridViewTextBoxColumn();
            c0.HeaderText = "Ora"; c0.FillWeight = 8;
            grigliaOrario.Columns.Add(c0);
            foreach (string giorno in orario.Giorni)
            {
                DataGridViewTextBoxColumn c = new DataGridViewTextBoxColumn();
                c.HeaderText = giorno; c.FillWeight = 20;
                grigliaOrario.Columns.Add(c);
            }

            for (int o = 0; o < orario.OrePerGiorno; o++)
            {
                object[] riga = new object[orario.Giorni.Count + 1];
                riga[0] = (o + 1).ToString();
                for (int d = 0; d < orario.Giorni.Count; d++)
                {
                    string v = g[o, d];
                    riga[d + 1] = orario.EDisposizione(v) ? "a disposizione" : (v ?? "");
                }
                grigliaOrario.Rows.Add(riga);
            }

            lblRiepilogoOrario.Text = docente
                ? orario.OreDi(chi) + " ore di lezione" +
                  (orario.Periodo != "" ? "   -   " + orario.Periodo : "")
                : "orario della classe " + chi;
        }

        // ===================================================================
        //  PASSO 3 - LE EMAIL A TE STESSO
        // ===================================================================
        Panel PaginaInvio()
        {
            Panel p = NuovaPagina("Le email a te stesso");
            int y = 52;

            Panel chi = Tema.Scheda1("A chi arrivano",
                "Tutte a te: una email per ogni docente del tabellone, con la sua griglia. " +
                "Poi ritrovi l'orario di chiunque cercando il cognome in Gmail.",
                0, y, 880,
                "Nessuna email ai colleghi",
                "Le email arrivano all'indirizzo dell'account Google in cui incolli lo script, " +
                "cioe' il tuo account istituzionale: non c'e' niente da impostare, lo script lo " +
                "legge da solo.\r\n\r\n" +
                "Nessun messaggio parte verso i colleghi, e nei dati dell'orario non c'e' " +
                "nessun indirizzo: solo i nomi come stanno nel tabellone.");
            p.Controls.Add(chi);
            y += chi.Height + 14;

            p.Controls.Add(Tema.Testo1("Oggetto delle email", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtOggetto = Tema.Casella(0, y + 22, 420, "Orario {docente}");
            txtOggetto.TextChanged += delegate { AggiornaAnteprimaCodice(); };
            p.Controls.Add(txtOggetto);
            p.Controls.Add(Tema.Testo1("Puoi usare {docente} e {periodo}.",
                                       432, y + 26, 300, Tema.Piccolo, Ruolo.Tenue));
            y += 56;

            chkClassi = Tema.Spunta("Prepara anche gli orari delle classi", 0, y, Ruolo.Normale);
            chkClassi.CheckedChanged += delegate
            {
                txtOggettoClasse.Enabled = chkClassi.Checked;
                AggiornaAnteprimaCodice();
            };
            p.Controls.Add(chkClassi);
            txtOggettoClasse = Tema.Casella(0, y + 26, 420, "Orario classe {classe}");
            txtOggettoClasse.TextChanged += delegate { AggiornaAnteprimaCodice(); };
            p.Controls.Add(txtOggettoClasse);
            p.Controls.Add(Tema.Testo1("Una email per classe, sempre a te. Puoi usare {classe}.",
                                       432, y + 30, 420, Tema.Piccolo, Ruolo.Tenue));
            y += 62;

            p.Controls.Add(Tema.Testo1("Nota da mettere in fondo a ogni email  (facoltativa)",
                                       0, y, 500, Tema.Grassetto, Ruolo.Normale));
            txtNota = Tema.CasellaMulti(0, y + 22, 880, 50,
                "Orario provvisorio: eventuali variazioni vengono comunicate per circolare.");
            txtNota.TextChanged += delegate { AggiornaAnteprimaCodice(); };
            p.Controls.Add(txtNota);
            y += 84;

            cmbCosaVedere = new ComboBox();
            cmbCosaVedere.Location = new Point(0, y);
            cmbCosaVedere.Width = 340;
            cmbCosaVedere.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbCosaVedere.Font = Tema.Normale;
            cmbCosaVedere.Items.AddRange(new object[]
            {
                "1. Codice degli orari  ->  file Orari.gs",
                "2. Dati dell'orario  ->  file DatiOrari.gs",
                "3. Cosa fare, passo per passo"
            });
            cmbCosaVedere.SelectedIndex = 0;
            cmbCosaVedere.SelectedIndexChanged += delegate { AggiornaAnteprimaCodice(); };
            p.Controls.Add(cmbCosaVedere);

            p.Controls.Add(Tema.BottonePrincipale("Copia negli appunti", 352, y - 2, 180,
                delegate { Guscio.Copia(TestoCorrente(cmbCosaVedere.SelectedIndex), "Copiato."); }));
            p.Controls.Add(Tema.Bottone("Salva su file...", 542, y, 130,
                delegate { SalvaSuFile(cmbCosaVedere.SelectedIndex); }));
            p.Controls.Add(Tema.Bottone("Apri l'editor dello script", 682, y, 198,
                delegate { Guscio.Apri("https://script.google.com/home"); }));
            y += 40;

            txtAnteprima = Tema.Registro(0, y, 880, 300, false);
            txtAnteprima.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            p.Controls.Add(txtAnteprima);

            txtOggetto.Text = S.OggettoOrari;
            txtOggettoClasse.Text = S.OggettoOrariClasse;
            txtNota.Text = S.NotaOrari;
            chkClassi.Checked = S.InviaOrariClassi;
            txtOggettoClasse.Enabled = chkClassi.Checked;
            return p;
        }

        public static string CodiceOrari()
        {
            string s = Guscio.LeggiRisorsa("Orari.gs");
            return (s != "") ? s : "// Risorsa non trovata: ricompila l'applicazione.";
        }

        string DatiOrari()
        {
            Esce();
            return AnalisiOrario.GeneraDatiGs(orario, S, chkClassi.Checked);
        }

        string IstruzioniInvio()
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("COSA FARE, PASSO PER PASSO");
            sb.AppendLine("==========================");
            sb.AppendLine();
            sb.AppendLine("1.  Apri lo stesso progetto Apps Script che usi per la posta");
            sb.AppendLine("    (script.google.com). Se non ce l'hai, fai prima lo strumento Posta.");
            sb.AppendLine();
            sb.AppendLine("2.  Crea un file nuovo: \"+\" accanto a File -> Script -> chiamalo  Orari");
            sb.AppendLine("    Incolla dentro il \"Codice degli orari\" (voce 1 del menu qui sopra).");
            sb.AppendLine();
            sb.AppendLine("3.  Crea un altro file, chiamalo  DatiOrari");
            sb.AppendLine("    Incolla dentro i \"Dati dell'orario\" (voce 2 del menu). Salva.");
            sb.AppendLine();
            sb.AppendLine("4.  Scegli la funzione  ORARI_1_anteprima  ed Esegui.");
            sb.AppendLine("    Leggi il registro: dice quante email manderebbe e ti mostra la prima.");
            sb.AppendLine("    Google chiede le autorizzazioni per tutto il progetto: con il file");
            sb.AppendLine("    Orari dentro, anche per il Calendario, pure se usi solo le email.");
            sb.AppendLine("    Il calendario lo toccano soltanto ORARI_4_calendario,");
            sb.AppendLine("    ORARI_5_cambioOrario e ORARI_ANNULLA_calendario, e solo se li esegui tu.");
            sb.AppendLine();
            sb.AppendLine("5.  Scegli  ORARI_2_invia  ed Esegui.");
            sb.AppendLine("    Le email arrivano tutte a te: una per docente.");
            sb.AppendLine();
            if (chkClassi.Checked)
            {
                sb.AppendLine("6.  Per gli orari delle classi:  ORARI_3_inviaOrariClassi");
                sb.AppendLine("    (anche questi solo a te).");
                sb.AppendLine();
            }
            sb.AppendLine("SITUAZIONE ATTUALE");
            sb.AppendLine("------------------");
            sb.AppendLine("Docenti nell'orario ....... " + orario.Docenti().Count);
            sb.AppendLine("Classi .................... " + orario.Classi().Count);
            sb.AppendLine("Destinatario .............. tu, all'indirizzo dell'account dello script");
            sb.AppendLine();
            sb.AppendLine("QUANTE EMAIL PUOI MANDARE IN UN GIORNO");
            sb.AppendLine("--------------------------------------");
            sb.AppendLine("Un account Gmail normale ne manda 100 al giorno, un account della");
            sb.AppendLine("scuola (Workspace) 1500. Se non bastano, lo script si ferma e si");
            sb.AppendLine("ricorda dove era arrivato: il giorno dopo riesegui tu ORARI_2_invia");
            sb.AppendLine("(o ORARI_3_inviaOrariClassi) e riparte da li', senza mandare niente");
            sb.AppendLine("due volte. Se invece finisce il tempo di un'esecuzione (circa quattro");
            sb.AppendLine("minuti), riprende da solo dopo un minuto. Per ricominciare da capo:");
            sb.AppendLine("ORARI_ANNULLA_invio.");
            return sb.ToString();
        }

        string TestoCorrente(int voce)
        {
            switch (voce)
            {
                case 0: return CodiceOrari();
                case 1: return DatiOrari();
                default: return IstruzioniInvio();
            }
        }

        void AggiornaAnteprimaCodice()
        {
            if (txtAnteprima == null) return;
            if (orario.Lezioni.Count == 0)
            {
                txtAnteprima.Text = "Nessun orario caricato: torna al passo 1 e scegli il file.";
                return;
            }
            txtAnteprima.Text = TestoCorrente(cmbCosaVedere.SelectedIndex).Replace("\r\n", "\n").Replace("\n", "\r\n");
            txtAnteprima.Select(0, 0);
        }

        void SalvaSuFile(int voce)
        {
            string nome;
            switch (voce)
            {
                case 0: nome = "Orari.gs"; break;
                case 1: nome = "DatiOrari.gs"; break;
                case 2: nome = "orari - cosa fare.txt"; break;
                default: nome = "calendario - cosa fare.txt"; break;
            }
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.FileName = nome;
                d.Filter = "Tutti i file (*.*)|*.*";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                string testo = (voce == 3) ? IstruzioniCalendario() : TestoCorrente(voce);
                if (Guscio.SalvaFile(this, d.FileName, testo, new UTF8Encoding(false)))
                    Guscio.Stato1("Salvato: " + d.FileName);
            }
        }

        // ===================================================================
        //  PASSO 4 - GOOGLE CALENDAR
        // ===================================================================
        Panel PaginaCalendario()
        {
            Panel p = NuovaPagina("L'orario su Google Calendar");
            int y = 52;

            Tema.RigaAiuto(p,
                "Scegli il tuo nome, il nome del calendario e il periodo.",
                0, y, Tema.Normale, Ruolo.Tenue, "Cosa fa lo script sul calendario",
                "Mette il tuo orario sul tuo calendario: ogni ora di lezione diventa un evento " +
                "settimanale, dal primo giorno utile fino alla data di fine, tranne i giorni " +
                "senza lezione.\r\n\r\n" +
                "Se un calendario con quel nome esiste gia' lo usa, altrimenti lo crea.\r\n\r\n" +
                "Gli eventi portano un contrassegno, cosi' si tolgono in un colpo solo con " +
                "ORARI_ANNULLA_calendario, senza toccare il resto del calendario, e " +
                "ORARI_5_cambioOrario puo' cambiare l'orario da una data in poi.");
            y += 40;

            p.Controls.Add(Tema.Testo1("Il tuo nome, come nel tabellone", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            cmbDocente = new ComboBox();
            cmbDocente.Location = new Point(0, y + 22);
            cmbDocente.Width = 300;
            cmbDocente.Font = Tema.Normale;
            cmbDocente.DropDownStyle = ComboBoxStyle.DropDown;
            cmbDocente.TextChanged += delegate
            {
                if (zitto4) return;
                if (txtCalNome.Text.Trim() == "" || txtCalNome.Text.StartsWith("Orario "))
                    txtCalNome.Text = (cmbDocente.Text.Trim() == "") ? "" : "Orario " + cmbDocente.Text.Trim();
                AggiornaCalendario();
            };
            p.Controls.Add(cmbDocente);

            p.Controls.Add(Tema.Testo1("Nome del calendario", 320, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtCalNome = Tema.Casella(320, y + 22, 300, "Orario Rossi");
            txtCalNome.TextChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(txtCalNome);
            p.Controls.Add(Tema.Testo1("Se esiste gia' lo uso, altrimenti lo creo.",
                                       632, y + 26, 250, Tema.Piccolo, Ruolo.Tenue));
            y += 62;

            p.Controls.Add(Tema.Testo1("Dal", 0, y + 4, 0, Tema.Grassetto, Ruolo.Normale));
            dtInizio = new DateTimePicker();
            dtInizio.Location = new Point(40, y);
            dtInizio.Width = 150;
            dtInizio.Format = DateTimePickerFormat.Short;
            dtInizio.Font = Tema.Normale;
            dtInizio.ValueChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(dtInizio);
            p.Controls.Add(Tema.Testo1("al", 204, y + 4, 0, Tema.Grassetto, Ruolo.Normale));
            dtFine = new DateTimePicker();
            dtFine.Location = new Point(230, y);
            dtFine.Width = 150;
            dtFine.Format = DateTimePickerFormat.Short;
            dtFine.Font = Tema.Normale;
            dtFine.ValueChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(dtFine);
            p.Controls.Add(Tema.Testo1("compresi. Di partenza: da oggi alla fine delle lezioni.",
                                       392, y + 4, 480, Tema.Piccolo, Ruolo.Tenue));
            y += 44;

            p.Controls.Add(Tema.Testo1("La prima ora comincia alle", 0, y + 4, 0, Tema.Normale, Ruolo.Normale));
            txtPrimaOra = Tema.Casella(190, y, 70, "08:00");
            txtPrimaOra.TextChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(txtPrimaOra);
            p.Controls.Add(Tema.Testo1("e ogni ora dura", 272, y + 4, 0, Tema.Normale, Ruolo.Normale));
            numMinuti = new NumericUpDown();
            numMinuti.Location = new Point(384, y);
            numMinuti.Width = 60;
            numMinuti.Minimum = 5; numMinuti.Maximum = 240; numMinuti.Value = 60;
            numMinuti.Font = Tema.Normale;
            numMinuti.ValueChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(numMinuti);
            p.Controls.Add(Tema.Testo1("minuti", 452, y + 4, 0, Tema.Normale, Ruolo.Normale));
            y += 40;

            p.Controls.Add(Tema.Testo1(
                "Se le ore non sono tutte uguali (intervallo, ore da 50 minuti), scrivi qui quando " +
                "comincia ciascuna, separate da virgola. Quelle che mancano le ricavo dalla durata.",
                0, y, 880, Tema.Piccolo, Ruolo.Tenue));
            txtOreInizio = Tema.Casella(0, y + 40, 620, "08:00, 09:00, 10:00, 11:10, 12:10, 13:10");
            txtOreInizio.TextChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(txtOreInizio);

            p.Controls.Add(Tema.Testo1("Colore", 640, y + 44, 0, Tema.Normale, Ruolo.Normale));
            cmbColore = new ComboBox();
            cmbColore.Location = new Point(694, y + 40);
            cmbColore.Width = 186;
            cmbColore.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbColore.Font = Tema.Normale;
            for (int i = 0; i < Colori.GetLength(0); i++) cmbColore.Items.Add(Colori[i, 0]);
            cmbColore.SelectedIndex = 0;
            cmbColore.SelectedIndexChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(cmbColore);
            y += 78;

            // --- i giorni senza lezione -----------------------------------------
            Tema.RigaAiuto(p, "Giorni senza lezione", 0, y, Tema.Grassetto, Ruolo.Normale,
                "Giorni senza lezione",
                "In questi giorni sul calendario non c'e' nessuna lezione: ogni ora di lezione " +
                "diventa piu' eventi settimanali, uno per ogni tratto di settimane senza " +
                "interruzioni.\r\n\r\n" +
                "Una riga per giorno o per periodo, con la data e, se vuoi, il nome:\r\n" +
                "     01/11/2026 Tutti i Santi\r\n" +
                "     23/12/2026-06/01/2027 Vacanze di Natale\r\n" +
                "     dal 23/12/2026 al 06/01/2027 Vacanze\r\n\r\n" +
                "Vanno bene anche 1/11/26 e 2026-11-01. L'anno si puo' non scrivere (01/11, " +
                "23/12-06/01): lo prendo dal periodo, da settembre a dicembre il primo anno, da " +
                "gennaio in poi il secondo. Le righe che cominciano con # sono note e non " +
                "contano.\r\n\r\n" +
                "Un periodo si scrive con il trattino o con \"dal ... al ...\" (anche \"fino al\"). " +
                "Una riga con due date scritte in un altro modo (\"07/12, 08/12\", \"dal 23/12 a " +
                "06/01\") non la prendo a meta': il riepilogo la segnala fra quelle non capite.\r\n\r\n" +
                "\"Aggiungi le feste nazionali\" mette in fondo quelle del periodo che mancano, " +
                "Pasqua e Pasquetta comprese.");
            txtSospensioni = Tema.CasellaMulti(0, y + 24, 620, 100, "01/11/2026 Tutti i Santi");
            txtSospensioni.TextChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(txtSospensioni);
            p.Controls.Add(Tema.Bottone("Aggiungi le feste nazionali", 640, y + 24, 240,
                delegate { AggiungiFeste(); }));
            p.Controls.Add(Tema.Testo1(
                "Vacanze, patrono e ponti: copiali dalla circolare sul calendario scolastico della " +
                "regione e della scuola.", 640, y + 62, 240, Tema.Piccolo, Ruolo.Tenue));
            y += 24 + 100 + 14;

            // --- il cambio d'orario --------------------------------------------
            chkValidoDal = Tema.Spunta("L'orario e' cambiato: il nuovo vale dal", 0, y + 3, Ruolo.Normale);
            chkValidoDal.CheckedChanged += delegate
            {
                dtValidoDal.Enabled = chkValidoDal.Checked;
                if (!zitto4) AggiornaCalendario();
            };
            p.Controls.Add(chkValidoDal);
            int xCambio = chkValidoDal.PreferredSize.Width + 8;
            dtValidoDal = new DateTimePicker();
            dtValidoDal.Location = new Point(xCambio, y);
            dtValidoDal.Width = 150;
            dtValidoDal.Format = DateTimePickerFormat.Short;
            dtValidoDal.Font = Tema.Normale;
            dtValidoDal.Enabled = false;
            dtValidoDal.ValueChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(dtValidoDal);
            p.Controls.Add(Tema.Testo1("Le settimane prima restano come sono. Poi esegui ORARI_5_cambioOrario.",
                                       xCambio + 162, y + 4, 880 - xCambio - 162, Tema.Piccolo, Ruolo.Tenue));
            y += 44;

            lblCalRiepilogo = Tema.Testo1("", 0, y, 880, Tema.Grassetto, Ruolo.Normale);
            lblCalRiepilogo.Height = 44;
            p.Controls.Add(lblCalRiepilogo);
            y += 50;

            cmbCosaVedere4 = new ComboBox();
            cmbCosaVedere4.Location = new Point(0, y);
            cmbCosaVedere4.Width = 340;
            cmbCosaVedere4.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbCosaVedere4.Font = Tema.Normale;
            cmbCosaVedere4.Items.AddRange(new object[]
            {
                "1. Dati dell'orario  ->  file DatiOrari.gs",
                "2. Cosa fare, passo per passo"
            });
            cmbCosaVedere4.SelectedIndex = 1;
            cmbCosaVedere4.SelectedIndexChanged += delegate { AggiornaCalendario(); };
            p.Controls.Add(cmbCosaVedere4);

            Button copia4 = Tema.BottonePrincipale("Copia negli appunti", 352, y - 2, 180, delegate
            {
                Guscio.Copia(cmbCosaVedere4.SelectedIndex == 0 ? DatiOrari() : IstruzioniCalendario(), "Copiato.");
            });
            p.Controls.Add(copia4);
            Button salva4 = Tema.Bottone("Salva su file...", 542, y, 130,
                delegate { SalvaSuFile(cmbCosaVedere4.SelectedIndex == 0 ? 1 : 3); });
            p.Controls.Add(salva4);
            Button apri4 = Tema.Bottone("Apri Google Calendar", 682, y, 198,
                delegate { Guscio.Apri("https://calendar.google.com/"); });
            p.Controls.Add(apri4);
            y += 40;

            txtAnteprima4 = Tema.Registro(0, y, 880, 260, false);
            txtAnteprima4.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            p.Controls.Add(txtAnteprima4);

            foreach (Control c in new Control[] { cmbCosaVedere4, copia4, salva4, apri4, txtAnteprima4 })
            {
                sottoRiepilogo.Add(c);
                distanzeRiepilogo.Add(c.Top - lblCalRiepilogo.Bottom);
            }

            MostraCalendario();
            return p;
        }

        /// <summary>Il riepilogo alto quanto il suo testo, e quello che sta sotto alla stessa distanza.</summary>
        void DisponiRiepilogo()
        {
            lblCalRiepilogo.Height = Math.Max(44, Tema.AltezzaTesto(lblCalRiepilogo.Text, lblCalRiepilogo.Font,
                                                                   lblCalRiepilogo.Width));
            for (int i = 0; i < sottoRiepilogo.Count; i++)
                sottoRiepilogo[i].Top = lblCalRiepilogo.Bottom + distanzeRiepilogo[i];
        }

        /// <summary>"Aggiungi le feste nazionali": in fondo, quelle del periodo che nessuna riga copre.</summary>
        void AggiungiFeste()
        {
            if (dtFine.Value.Date < dtInizio.Value.Date)
            {
                // ConFeste non troverebbe niente, e "ci sono gia' tutte" non sarebbe vero
                Guscio.Stato1("La data di fine viene prima di quella di inizio: sistema il periodo, poi aggiungi le feste.",
                              Tema.Ambra);
                return;
            }
            int aggiunte;
            string testo = Calendario.ConFeste(txtSospensioni.Text, dtInizio.Value.Date, dtFine.Value.Date, out aggiunte);
            if (aggiunte == 0)
            {
                Guscio.Stato1("Le feste nazionali del periodo ci sono gia' tutte.");
                return;
            }
            txtSospensioni.Text = testo;
            txtSospensioni.SelectionStart = txtSospensioni.TextLength;
            txtSospensioni.ScrollToCaret();
            Guscio.Stato1(aggiunte == 1 ? "Aggiunta una festa nazionale." : "Aggiunte " + aggiunte + " feste nazionali.");
        }

        void MostraCalendario()
        {
            zitto4 = true;
            cmbDocente.Text = S.CalDocente;
            txtCalNome.Text = S.CalNome;
            DateTime inizio, fine;
            dtInizio.Value = LeggiData(S.CalInizio, out inizio) ? inizio : DateTime.Today;
            dtFine.Value = LeggiData(S.CalFine, out fine) ? fine : FineLezioni(DateTime.Today);
            txtPrimaOra.Text = S.CalPrimaOra;
            if (S.CalMinutiOra >= numMinuti.Minimum && S.CalMinutiOra <= numMinuti.Maximum)
                numMinuti.Value = S.CalMinutiOra;
            txtOreInizio.Text = S.CalOreInizio;
            cmbColore.SelectedIndex = 0;
            for (int i = 0; i < Colori.GetLength(0); i++)
                if (Colori[i, 1] == S.CalColore) { cmbColore.SelectedIndex = i; break; }
            txtSospensioni.Text = S.CalSospensioni;
            DateTime cambio;
            bool conCambio = LeggiData(S.CalValidoDal, out cambio);
            chkValidoDal.Checked = conCambio;
            dtValidoDal.Value = conCambio ? cambio : DateTime.Today;
            dtValidoDal.Enabled = conCambio;
            zitto4 = false;
        }

        void RaccogliCalendario()
        {
            if (cmbDocente == null) return;
            S.CalDocente = cmbDocente.Text.Trim();
            S.CalNome = txtCalNome.Text.Trim();
            S.CalInizio = dtInizio.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            S.CalFine = dtFine.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            S.CalPrimaOra = AnalisiOrario.OraValida(txtPrimaOra.Text) ? txtPrimaOra.Text.Trim() : "08:00";
            S.CalMinutiOra = (int)numMinuti.Value;
            S.CalOreInizio = txtOreInizio.Text.Trim();
            int c = cmbColore.SelectedIndex;
            S.CalColore = (c >= 0 && c < Colori.GetLength(0)) ? Colori[c, 1] : "";
            S.CalSospensioni = txtSospensioni.Text;
            // spunta tolta = nessun cambio d'orario
            S.CalValidoDal = chkValidoDal.Checked
                ? dtValidoDal.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "";
        }

        static string Giorno(DateTime d) { return d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture); }

        static bool LeggiData(string s, out DateTime d)
        {
            return DateTime.TryParseExact((s ?? "").Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture,
                                          DateTimeStyles.None, out d);
        }

        /// <summary>
        /// Il 10 giugno che chiude l'anno scolastico: con la regola delle righe
        /// senza anno (Calendario.AnnoScolastico), luglio e agosto contano gia'
        /// per l'anno che parte a settembre. Mai prima di oggi, che e' l'inizio
        /// di partenza: dall'11 al 30 giugno, il 10 giugno dell'anno dopo.
        /// </summary>
        static DateTime FineLezioni(DateTime oggi)
        {
            DateTime fine = new DateTime(Calendario.AnnoScolastico(oggi) + 1, 6, 10);
            return (fine < oggi.Date) ? fine.AddYears(1) : fine;
        }

        void RiempiDocenti()
        {
            zitto4 = true;
            string prima = cmbDocente.Text;
            cmbDocente.Items.Clear();
            foreach (string d in orario.Docenti()) cmbDocente.Items.Add(d);
            cmbDocente.Text = prima;
            zitto4 = false;
        }

        void AggiornaCalendario()
        {
            if (lblCalRiepilogo == null) return;
            RaccogliCalendario();

            string docente = orario.TrovaDocente(S.CalDocente);
            if (orario.Lezioni.Count == 0)
            {
                lblCalRiepilogo.Text = "Nessun orario caricato: torna al passo 1 e scegli il file.";
                lblCalRiepilogo.Tag = Ruolo.Avviso;
            }
            else if (S.CalDocente == "")
            {
                lblCalRiepilogo.Text = "Scegli il tuo nome dall'elenco: sul calendario va il tuo orario.";
                lblCalRiepilogo.Tag = Ruolo.Tenue;
            }
            else if (docente == "")
            {
                lblCalRiepilogo.Text = "\"" + S.CalDocente + "\" non e' nel tabellone: scegli un nome dall'elenco.";
                lblCalRiepilogo.Tag = Ruolo.Avviso;
            }
            else if (dtFine.Value.Date < dtInizio.Value.Date)
            {
                lblCalRiepilogo.Text = "La data di fine viene prima di quella di inizio.";
                lblCalRiepilogo.Tag = Ruolo.Avviso;
            }
            else
            {
                DateTime inizio = dtInizio.Value.Date, fine = dtFine.Value.Date;
                List<BloccoOrario> blocchi = AnalisiOrario.Blocchi(orario.GrigliaDocente(docente), orario);
                List<string> inizi = AnalisiOrario.InizioOre(S.CalOreInizio, S.CalPrimaOra, S.CalMinutiOra,
                                                             orario.OrePerGiorno);
                List<string> nonCapite;
                List<Sospensione> sospensioni = Calendario.Leggi(S.CalSospensioni, inizio, out nonCapite);
                PianoCalendario piano = Calendario.Piano(blocchi, orario.IndiciGiorni, inizio, fine, sospensioni);
                // le righe che non toccano il periodo (un anno sbagliato) non contano
                List<Sospensione> fuoriPeriodo = Calendario.FuoriPeriodo(sospensioni, inizio, fine);
                int nelPeriodo = sospensioni.Count - fuoriPeriodo.Count;
                string ruolo = Ruolo.Buono;

                StringBuilder r = new StringBuilder();
                r.Append(docente + ": " + orario.OreDi(docente) + " ore la settimana in " + blocchi.Count +
                         " blocchi, quindi " + piano.Serie.Count + " serie settimanali nel calendario \"" +
                         (S.CalNome != "" ? S.CalNome : "Orario " + docente) + "\".");
                r.Append("\nDal " + Giorno(inizio) + " al " + Giorno(fine) + ": " + piano.Lezioni + " lezioni");
                if (nelPeriodo == 0) r.Append(", nessun giorno senza lezione nel periodo.");
                else r.Append("; " + piano.Saltate + " lezioni saltate per " + nelPeriodo +
                              (nelPeriodo == 1 ? " giorno o periodo" : " giorni o periodi") + " senza lezione.");
                if (S.CalValidoDal != "")
                {
                    DateTime cambio = dtValidoDal.Value.Date;
                    if (cambio > fine)
                    {
                        r.Append("\nIl cambio d'orario (" + Giorno(cambio) + ") viene dopo la fine del periodo: " +
                                 "sposta la data, o togli la spunta.");
                        ruolo = Ruolo.Avviso;
                    }
                    else
                    {
                        PianoCalendario dopo = Calendario.Piano(blocchi, orario.IndiciGiorni,
                                                                cambio > inizio ? cambio : inizio, fine, sospensioni);
                        r.Append("\nCambio d'orario dal " + Giorno(cambio) + ": " + dopo.Serie.Count +
                                 " serie nuove da quel giorno con ORARI_5_cambioOrario" +
                                 (cambio > inizio ? "; le settimane prima restano." : ", cioe' da tutto il periodo.") +
                                 " Il periodo resta quello con cui hai messo l'orario: la data del cambio va solo qui.");
                    }
                }
                r.Append("\nOre: " + string.Join("  ", inizi.ToArray()) + "  (durata " + S.CalMinutiOra + " minuti).");
                if (nonCapite.Count > 0)
                {
                    string esempio = nonCapite[0].Length > 40 ? nonCapite[0].Substring(0, 37) + "..." : nonCapite[0];
                    r.Append("\nRighe dei giorni senza lezione non capite: " + nonCapite.Count + ", come \"" + esempio +
                             "\". Scrivi una data per riga, per esempio 01/11/2026.");
                    ruolo = Ruolo.Avviso;
                }
                if (fuoriPeriodo.Count > 0)
                {
                    string riga = Calendario.Riga(fuoriPeriodo[0]);
                    string esempio = riga.Length > 40 ? riga.Substring(0, 37) + "..." : riga;
                    r.Append("\n" + (fuoriPeriodo.Count == 1 ? "Una riga dei giorni senza lezione e' fuori"
                                                             : fuoriPeriodo.Count + " righe dei giorni senza lezione sono fuori") +
                             " dal periodo, come \"" + esempio + "\": controlla l'anno.");
                    ruolo = Ruolo.Avviso;
                }
                lblCalRiepilogo.Text = r.ToString();
                lblCalRiepilogo.Tag = ruolo;
            }
            DisponiRiepilogo();
            Tema.Applica(lblCalRiepilogo);

            if (txtAnteprima4 != null)
            {
                string testo = (cmbCosaVedere4.SelectedIndex == 0)
                    ? (orario.Lezioni.Count == 0 ? "Nessun orario caricato." : DatiOrari())
                    : IstruzioniCalendario();
                txtAnteprima4.Text = testo.Replace("\r\n", "\n").Replace("\n", "\r\n");
                txtAnteprima4.Select(0, 0);
            }
        }

        string IstruzioniCalendario()
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("L'ORARIO SU GOOGLE CALENDAR, PASSO PER PASSO");
            sb.AppendLine("===========================================");
            sb.AppendLine();
            sb.AppendLine("1.  Se non l'hai gia' fatto, metti nel progetto Apps Script il file  Orari");
            sb.AppendLine("    con il \"Codice degli orari\" (passo 3, voce 1 del menu).");
            sb.AppendLine();
            sb.AppendLine("2.  Rigenera i \"Dati dell'orario\" (qui, voce 1 del menu) e incollali nel");
            sb.AppendLine("    file  DatiOrari, al posto di quello che c'era. Adesso contengono anche");
            sb.AppendLine("    la parte  calendario:  con il tuo nome, il nome del calendario e il");
            sb.AppendLine("    periodo. Salva.");
            sb.AppendLine();
            sb.AppendLine("3.  Scegli la funzione  ORARI_4_calendario  ed Esegui.");
            sb.AppendLine("    Il permesso per il Calendario Google lo chiede per tutto il progetto");
            sb.AppendLine("    appena dentro c'e' il file  Orari, alla prima esecuzione di una");
            sb.AppendLine("    funzione qualsiasi, anche solo per le email: se l'hai gia' dato, qui");
            sb.AppendLine("    non ti chiede niente. Se te lo chiede adesso, e' come per la posta:");
            sb.AppendLine("    Avanzate -> Apri ... (non sicura) -> Consenti.");
            sb.AppendLine("    Con tante lezioni ci mette qualche minuto. Se finisce il tempo di");
            sb.AppendLine("    un'esecuzione, o se Google chiede di rallentare, si ferma e riprende");
            sb.AppendLine("    da solo dopo un minuto, da dove era arrivato: non devi fare niente.");
            sb.AppendLine();
            sb.AppendLine("4.  Apri calendar.google.com: nella colonna di sinistra c'e' il calendario");
            sb.AppendLine("    con l'orario. Puoi accenderlo e spegnerlo, cambiargli colore, vederlo");
            sb.AppendLine("    anche dal telefono.");
            sb.AppendLine();
            sb.AppendLine("GIORNI SENZA LEZIONE");
            sb.AppendLine("--------------------");
            sb.AppendLine("Nei giorni scritti qui sopra in \"Giorni senza lezione\" sul calendario");
            sb.AppendLine("non c'e' nessuna lezione. Una riga per giorno o per periodo:");
            sb.AppendLine("    01/11/2026 Tutti i Santi");
            sb.AppendLine("    23/12/2026-06/01/2027 Vacanze di Natale");
            sb.AppendLine("    dal 23/12/2026 al 06/01/2027 Vacanze");
            sb.AppendLine("\"Aggiungi le feste nazionali\" mette quelle del periodo, Pasqua e");
            sb.AppendLine("Pasquetta comprese. Vacanze, patrono e ponti copiali dalla circolare sul");
            sb.AppendLine("calendario scolastico della regione e della scuola. Ogni ora di lezione");
            sb.AppendLine("diventa piu' eventi settimanali, uno per ogni tratto di settimane senza");
            sb.AppendLine("interruzioni: quanti, te lo dice ORARI_1_anteprima (e il riepilogo qui");
            sb.AppendLine("sopra). Un giorno senza lezione aggiunto dopo aver messo l'orario: spunta");
            sb.AppendLine("\"L'orario e' cambiato\" con la data da cui vale e usa ORARI_5_cambioOrario,");
            sb.AppendLine("anche se l'orario e' lo stesso.");
            sb.AppendLine();
            sb.AppendLine("SE L'ORARIO CAMBIA");
            sb.AppendLine("------------------");
            sb.AppendLine("1.  Carica il nuovo tabellone al passo 1. Qui sopra spunta \"L'orario e'");
            sb.AppendLine("    cambiato: il nuovo vale dal\" e scegli il primo giorno dell'orario nuovo.");
            sb.AppendLine("    Il periodo (\"Dal\" e \"al\") resta quello con cui hai messo l'orario:");
            sb.AppendLine("    la data del cambio va solo nella spunta.");
            sb.AppendLine();
            sb.AppendLine("2.  Rigenera i \"Dati dell'orario\" (voce 1 del menu) e incollali nel file");
            sb.AppendLine("    DatiOrari, al posto di quello che c'era. Salva.");
            sb.AppendLine();
            sb.AppendLine("3.  Esegui  ORARI_5_cambioOrario. Le serie dell'orario di prima finiscono");
            sb.AppendLine("    il giorno prima: le settimane passate restano come sono. Quelle che");
            sb.AppendLine("    cominciavano dopo si tolgono, e da quel giorno c'e' l'orario nuovo.");
            sb.AppendLine("    Rieseguita con la stessa data da' lo stesso risultato, e anche lei");
            sb.AppendLine("    riprende da sola se si ferma. Tocca solo gli eventi con il");
            sb.AppendLine("    contrassegno: una copia fatta a mano di una lezione la lascia e te la");
            sb.AppendLine("    nomina. Le modifiche fatte a mano su singole lezioni delle serie");
            sb.AppendLine("    accorciate potrebbero non restare: il messaggio finale dice in quali");
            sb.AppendLine("    serie ne ha trovate, dai un'occhiata.");
            sb.AppendLine();
            sb.AppendLine("ORARI_ANNULLA_calendario  resta per togliere tutto: solo gli eventi messi");
            sb.AppendLine("da qui (e le loro copie fatte a mano), nel periodo indicato; il calendario");
            sb.AppendLine("e gli altri eventi non vengono toccati (il calendario, se non ti serve");
            sb.AppendLine("piu', lo cancelli tu da Google Calendar). Se si ferma per il tempo o");
            sb.AppendLine("perche' Google chiede di rallentare, rieseguilo. Se hai cambiato le date");
            sb.AppendLine("del periodo dopo aver messo l'orario, rimetti quelle di prima: gli eventi");
            sb.AppendLine("fuori dal periodo non li trova. Dopo, ORARI_4_calendario rimette l'orario");
            sb.AppendLine("da capo. Se riesegui  ORARI_4_calendario  sopra un orario gia' messo, si");
            sb.AppendLine("ferma e te lo dice: non mette le lezioni due volte.");
            sb.AppendLine();
            sb.AppendLine("COME VENGONO GLI EVENTI");
            sb.AppendLine("-----------------------");
            sb.AppendLine("Ore consecutive della stessa classe diventano un evento solo (per");
            sb.AppendLine("esempio 10:00-12:00). Il titolo e' la classe; \"D\" diventa");
            sb.AppendLine("\"A disposizione\". Gli orari delle ore sono quelli scritti qui sopra:");
            sb.AppendLine("se la scuola ha un intervallo, scrivi l'inizio di ogni ora.");
            return sb.ToString();
        }
    }
}
