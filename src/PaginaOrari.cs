// ===========================================================================
//  PaginaOrari.cs - da un tabellone Excel alla tua casella e al tuo calendario
//
//  Quattro passi: si carica il file, si controlla che l'orario sia stato
//  letto bene, si preparano le email (tutte a te stesso: una per docente,
//  per ritrovare l'orario di un collega cercando il cognome in Gmail), e si
//  mette il tuo orario su Google Calendar: quello dell'account della scuola
//  (Orari.gs, nel progetto della Posta) o quello di un altro account, per
//  esempio il personale (Calendario.gs e un DatiOrari.gs con il solo tuo
//  orario, in un progetto di quell'account: SoloCalendario.cs).
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
        RadioButton rbScuola, rbAltroAccount;   // dove va l'orario (Stato.CalAltroAccount)
        ComboBox cmbDocente, cmbColore, cmbCosaVedere4;
        // le voci del menu del passo 4: con l'account della scuola i dati di
        // tutto il tabellone e le istruzioni; con un altro account il codice
        // solo calendario, i dati del solo docente e le istruzioni per quello
        const int VoceDati = 0, VoceIstruzioni = 1, VoceCodiceCalendario = 2, VoceDatiDelDocente = 3;
        List<int> vociMenu4 = new List<int>();
        TextBox txtCalNome, txtPrimaOra, txtOreInizio, txtAnteprima4, txtSospensioni;
        ListBox lstLette;           // come e' stata letta ogni riga dei giorni senza lezione
        TextBox txtColloqui;        // i colloqui con le famiglie, una riga per voce (Colloqui.cs)
        ListBox lstColloqui;        // come e' stata letta ogni riga dei colloqui
        DateTimePicker dtInizio, dtFine, dtValidoDal;
        CheckBox chkValidoDal;
        NumericUpDown numMinuti;
        Label lblCalRiepilogo;
        Button btnColori;                 // "Colori delle classi..."
        RiepilogoColori riepilogoColori;  // accanto, i colori di ogni classe
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
                delegate { Guscio.Copia(TestoDaDare(cmbCosaVedere.SelectedIndex), "Copiato."); }));
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

        /// <summary>
        /// DatiOrari.gs da copiare o da salvare: lo stesso dell'anteprima, e i
        /// colori delle classi che ci sono scritti restano nelle impostazioni
        /// come quelli delle lezioni sul calendario (AnalisiOrario.DatiOrariUsciti).
        /// </summary>
        string DatiOrariDaDare()
        {
            string testo = DatiOrari();
            AnalisiOrario.DatiOrariUsciti(orario, S);
            return testo;
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
            sb.AppendLine("    ORARI_5_cambioOrario, ORARI_6_coloraLezioni, ORARI_7_colloqui e");
            sb.AppendLine("    ORARI_ANNULLA_calendario, e solo se li esegui tu.");
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

        /// <summary>Il testo della voce da copiare: come nell'anteprima, DatiOrari.gs con DatiOrariDaDare.</summary>
        string TestoDaDare(int voce)
        {
            return (voce == 1) ? DatiOrariDaDare() : TestoCorrente(voce);
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

        /// <summary>"Salva su file..." del passo 3: una delle tre voci del suo menu.</summary>
        void SalvaSuFile(int voce)
        {
            string nome = (voce == 0) ? "Orari.gs" : (voce == 1) ? "DatiOrari.gs" : "orari - cosa fare.txt";
            SalvaTesto(nome, delegate { return TestoCorrente(voce); }, voce == 1);
        }

        /// <summary>
        /// Salva su file un testo, preso dopo che il file e' stato scelto.
        /// datiOrari: e' un DatiOrari.gs, e i colori delle classi che ha restano
        /// nelle impostazioni (AnalisiOrario.DatiOrariUsciti).
        /// </summary>
        void SalvaTesto(string nome, Func<string> testo, bool datiOrari)
        {
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.FileName = nome;
                d.Filter = "Tutti i file (*.*)|*.*";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                if (Guscio.SalvaFile(this, d.FileName, testo(), new UTF8Encoding(false)))
                {
                    // DatiOrari.gs e' uscito: i colori delle classi che ha restano
                    if (datiOrari) AnalisiOrario.DatiOrariUsciti(orario, S);
                    Guscio.Stato1("Salvato: " + d.FileName);
                }
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
                "ORARI_5_cambioOrario puo' cambiare l'orario da una data in poi.\r\n\r\n" +
                "Ogni classe ha il suo colore: lo scegli con \"Colori delle classi...\".\r\n\r\n" +
                "Con l'orario mette anche i tuoi colloqui con le famiglie (\"Colloqui con le famiglie\", qui " +
                "sotto), con il link del Meet.");
            y += 40;

            // --- dove va l'orario: nell'account della scuola o in un altro ------
            Tema.TitoloAiuto(p, "Dove metti l'orario", 0, y, "Dove metti l'orario",
                "Nell'account della scuola (la scelta di partenza): il codice degli orari (Orari.gs) sta nello " +
                "stesso progetto della Posta, e mette l'orario nel Google Calendar dell'account della scuola.\r\n\r\n" +
                "In un altro account Google, per esempio il tuo personale, se e' il calendario che usi sempre: " +
                "l'orario lo mette uno script dentro QUELL'account, in un progetto tutto suo, con due file che " +
                "prepari qui sotto. Il codice solo calendario (Calendario.gs) e' quello degli orari senza le " +
                "email: Google gli chiede solo il permesso del Calendario e quello di riprendere da solo un " +
                "lavoro lungo. I dati del tuo orario (DatiOrari.gs, solo il tuo) hanno soltanto il tuo orario: " +
                "nessun collega, nessun orario delle classi.\r\n\r\n" +
                "Le email degli orari, se le vuoi, restano nel progetto della scuola (passo 3).");
            y += 26;
            rbScuola = SceltaAccount("nell'account della scuola, nello stesso progetto della Posta", y);
            p.Controls.Add(rbScuola);
            y += 26;
            rbAltroAccount = SceltaAccount("in un altro account Google, per esempio il tuo personale", y);
            p.Controls.Add(rbAltroAccount);
            y += 38;

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

            // --- i colori delle classi ------------------------------------------
            btnColori = Tema.Bottone("Colori delle classi...", 0, y, 190, delegate { ScegliColori(); });
            p.Controls.Add(btnColori);
            p.Controls.Add(Tema.Aiuto(198, y + 7, "I colori delle classi",
                "Ogni lezione sul calendario prende il colore della sua classe: la 2B di un colore, la 3B di un " +
                "altro, sempre nello stesso calendario. Sono i colori degli eventi di Google Calendar, con i loro " +
                "nomi (Pomodoro, Mirtillo, Basilico...).\r\n\r\n" +
                "Di partenza ogni classe del tuo orario ne ha uno diverso, e da quando copi o salvi DatiOrari.gs lo " +
                "tiene: una classe che arriva dopo prende un colore che le altre non hanno, anche se ne aveva uno " +
                "un altro anno. Le ore a disposizione sono grigie (Grafite). Un colore che " +
                "scegli tu resta; \"Colori di partenza\" rimette quelli di Campanella. Con \"colore del calendario\" " +
                "le lezioni di quella classe hanno il colore del calendario (Colore, qui sopra).\r\n\r\n" +
                "I colori vanno in DatiOrari.gs: ORARI_4_calendario e ORARI_5_cambioOrario li danno alle lezioni " +
                "che mettono. Per le lezioni gia' sul calendario rigenera e incolla DatiOrari.gs, poi esegui " +
                "ORARI_6_coloraLezioni: cambia solo il colore, senza rifare ne' spostare niente. Le lezioni di una " +
                "classe a cui togli il colore restano come sono: il colore lo togli da Google Calendar.\r\n\r\n" +
                "Se hai scritto dei colloqui con le famiglie, anche loro hanno un colore: la riga Colloqui, dopo le " +
                "classi. Di partenza e' uno che le classi non usano."));
            riepilogoColori = new RiepilogoColori(228, y + 5, 652, 2 * (Tema.Normale.Height + 4));
            p.Controls.Add(riepilogoColori);
            y += 52;

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
                "23/12-06/01): lo prendo dall'altra data della riga o dal periodo, da settembre a " +
                "dicembre il primo anno, da gennaio in poi il secondo. Le righe che cominciano con # " +
                "sono note e non contano.\r\n\r\n" +
                "Un periodo si scrive con il trattino o con \"dal ... al ...\" (anche \"fino al\"). Il " +
                "mese si puo' scrivere una volta sola: 23-31/12/2026, dal 23 al 31/12/2026, 7 e " +
                "8/12/2026 (con \"e\" due giorni di seguito), 7-8 dicembre 2026. Una riga con due date " +
                "scritte in un altro modo (\"07/12, 08/12\", \"dal 23/12 a 06/01\"), o con la fine " +
                "scritta dopo la data a parole o con il solo giorno (\"dal 23/12 al 6 gennaio\", " +
                "\"01/11 - 03\"), o con \"dal\" e senza la fine (\"dal 23/12 all'Epifania\"), non la " +
                "prendo a meta': e' fra quelle non capite.\r\n\r\n" +
                "Sotto la casella c'e' come ho letto ogni riga, con i giorni della settimana: guarda " +
                "che i periodi siano quelli giusti. In ambra quelle non capite, quelle fuori dal " +
                "periodo e quelle con un numero nel motivo che potrebbe essere un giorno: \"07/12/2026 " +
                "ponte 7-8\" e' solo il 7 dicembre, per due giorni scrivi 7-8/12/2026. Anche un giorno " +
                "solo con una fine o una durata nel motivo (\"fino all'Epifania\", \"di 2 giorni\"), o " +
                "che sembra l'inizio o la fine di un periodo, o un giorno di lezione (\"23/12/2026 Vacanze " +
                "natalizie\" e' solo il 23; \"Inizio delle lezioni\" o \"Ripresa delle lezioni\" non vanno " +
                "qui).\r\n\r\n" +
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
            y += 24 + 100 + 6;

            // come ho letto ogni riga, mentre si scrive: un giorno preso al posto
            // di un periodo si vede subito. In ambra quelle da guardare
            p.Controls.Add(Tema.Testo1("Come le ho lette, riga per riga (in ambra quelle da guardare):",
                                       0, y, 880, Tema.Piccolo, Ruolo.Tenue));
            lstLette = new ListBox();
            lstLette.Location = new Point(0, y + 20);
            lstLette.Font = Tema.Piccolo;
            lstLette.IntegralHeight = false;
            lstLette.SelectionMode = SelectionMode.None;
            lstLette.HorizontalScrollbar = true;
            lstLette.DrawMode = DrawMode.OwnerDrawFixed;
            lstLette.ItemHeight = Tema.Piccolo.Height + 3;
            lstLette.Size = new Size(880, 5 * lstLette.ItemHeight + 4);     // cinque righe
            lstLette.DrawItem += DisegnaLetta;
            lstLette.TabStop = false;
            lstLette.AccessibleName = "Come ho letto i giorni senza lezione";
            p.Controls.Add(lstLette);
            y += 20 + lstLette.Height + 14;

            // --- i colloqui con le famiglie -------------------------------------
            Tema.RigaAiuto(p, "Colloqui con le famiglie", 0, y, Tema.Grassetto, Ruolo.Normale,
                "Colloqui con le famiglie",
                "Sul calendario vanno anche i tuoi colloqui con le famiglie, con il link del Meet: il ricevimento " +
                "di ogni settimana, le giornate dei colloqui generali e i periodi senza colloqui. Una riga per " +
                "voce:\r\n" +
                "     ogni giovedi 10:10-11:10 Ricevimento https://meet.google.com/abc-defg-hij\r\n" +
                "     dal 12/10/2026 al 22/05/2027 ogni giovedi 10:10-11:10 Ricevimento\r\n" +
                "     15/12/2026 15:00-18:00 Colloqui generali https://meet.google.com/abc-defg-hij\r\n" +
                "     niente colloqui dal 14/12/2026 al 09/01/2027\r\n\r\n" +
                "L'ora si scrive anche \"dalle 15 alle 18\" o \"15-18\", le date come nei giorni senza lezione. Il " +
                "link e' il primo indirizzo https:// della riga e sul calendario diventa il luogo dell'evento; il " +
                "resto e' il nome (di partenza \"Ricevimento\" per quello di ogni settimana, \"Colloqui\" per una " +
                "giornata). Senza date, il ricevimento vale per tutto il periodo e, come le lezioni, salta i giorni " +
                "senza lezione e quelli senza colloqui. Una giornata scritta a parte c'e' anche in un periodo senza " +
                "colloqui: i colloqui generali di solito cadono proprio li'.\r\n\r\n" +
                "\"Importa da un file...\" legge un .csv o un .xlsx con le colonne data (o giorno), dalle, alle, " +
                "cosa (o descrizione) e link, e aggiunge le sue righe qui: la casella resta l'unica fonte.\r\n\r\n" +
                "Sotto c'e' come ho letto ogni riga. In ambra quelle da guardare: non capite, senza ora o con la " +
                "fine prima dell'inizio (restano qui, ma sul calendario non vanno), in un giorno che non e' " +
                "nell'orario, fuori dal periodo, o con un link che non e' di Google Meet (vale lo stesso).\r\n\r\n" +
                "I colloqui vanno sul calendario con ORARI_4_calendario, insieme all'orario; se cambiano solo loro, " +
                "ORARI_7_colloqui li aggiorna da oggi in poi, senza toccare le lezioni. Hanno un colore loro: la riga " +
                "Colloqui in \"Colori delle classi...\".\r\n\r\n" +
                "I link del Meet aprono le tue stanze: stanno con i dati personali, e vanno solo nel tuo calendario. " +
                "Le prenotazioni dei genitori restano nel registro elettronico: Campanella non le tocca.");
            txtColloqui = Tema.CasellaMulti(0, y + 24, 620, 90,
                                            "ogni giovedi 10:10-11:10 Ricevimento https://meet.google.com/...");
            txtColloqui.TextChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(txtColloqui);
            p.Controls.Add(Tema.Bottone("Importa da un file...", 640, y + 24, 240, delegate { ImportaColloqui(); }));
            p.Controls.Add(Tema.Testo1(
                "Le prenotazioni dei genitori restano nel registro elettronico.", 640, y + 62, 240, Tema.Piccolo,
                Ruolo.Tenue));
            y += 24 + 90 + 6;

            p.Controls.Add(Tema.Testo1("Come ho letto i colloqui, riga per riga (in ambra quelli da guardare):",
                                       0, y, 880, Tema.Piccolo, Ruolo.Tenue));
            lstColloqui = new ListBox();
            lstColloqui.Location = new Point(0, y + 20);
            lstColloqui.Font = Tema.Piccolo;
            lstColloqui.IntegralHeight = false;
            lstColloqui.SelectionMode = SelectionMode.None;
            lstColloqui.HorizontalScrollbar = true;
            lstColloqui.DrawMode = DrawMode.OwnerDrawFixed;
            lstColloqui.ItemHeight = Tema.Piccolo.Height + 3;
            lstColloqui.Size = new Size(880, 4 * lstColloqui.ItemHeight + 4);     // quattro righe
            lstColloqui.DrawItem += DisegnaLetta;
            lstColloqui.TabStop = false;
            lstColloqui.AccessibleName = "Come ho letto i colloqui";
            p.Controls.Add(lstColloqui);
            y += 20 + lstColloqui.Height + 14;

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
            RiempiMenu4();
            cmbCosaVedere4.SelectedIndexChanged += delegate { if (!zitto4) AggiornaCalendario(); };
            p.Controls.Add(cmbCosaVedere4);

            Button copia4 = Tema.BottonePrincipale("Copia negli appunti", 352, y - 2, 180, delegate { CopiaPasso4(); });
            p.Controls.Add(copia4);
            Button salva4 = Tema.Bottone("Salva su file...", 542, y, 130, delegate { SalvaPasso4(); });
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

        /// <summary>Una delle due scelte di "Dove metti l'orario".</summary>
        RadioButton SceltaAccount(string testo, int y)
        {
            RadioButton r = new RadioButton();
            r.Text = testo;
            r.Location = new Point(0, y);
            r.AutoSize = true;
            r.Font = Tema.Normale;
            r.Tag = Ruolo.Normale;
            r.Cursor = Cursors.Hand;
            r.CheckedChanged += delegate
            {
                if (zitto4 || !r.Checked) return;
                RiempiMenu4();
                AggiornaCalendario();
            };
            return r;
        }

        /// <summary>
        /// Il menu del passo 4, secondo dove va l'orario: nell'account della
        /// scuola i dati di tutto il tabellone e le istruzioni; in un altro
        /// account il codice solo calendario, i dati del solo docente e le
        /// istruzioni per quell'account. Di partenza, le istruzioni.
        /// </summary>
        void RiempiMenu4()
        {
            bool prima = zitto4;
            zitto4 = true;
            cmbCosaVedere4.Items.Clear();
            vociMenu4.Clear();
            if (rbAltroAccount != null && rbAltroAccount.Checked)
            {
                cmbCosaVedere4.Items.Add("1. Codice solo calendario (Calendario.gs)");
                vociMenu4.Add(VoceCodiceCalendario);
                cmbCosaVedere4.Items.Add("2. Dati del tuo orario (DatiOrari.gs, solo il tuo)");
                vociMenu4.Add(VoceDatiDelDocente);
                cmbCosaVedere4.Items.Add("3. Cosa fare, passo per passo");
                vociMenu4.Add(VoceIstruzioni);
            }
            else
            {
                cmbCosaVedere4.Items.Add("1. Dati dell'orario  ->  file DatiOrari.gs");
                vociMenu4.Add(VoceDati);
                cmbCosaVedere4.Items.Add("2. Cosa fare, passo per passo");
                vociMenu4.Add(VoceIstruzioni);
            }
            cmbCosaVedere4.SelectedIndex = vociMenu4.IndexOf(VoceIstruzioni);
            zitto4 = prima;
        }

        /// <summary>La voce scelta nel menu del passo 4 (VoceDati, VoceIstruzioni...).</summary>
        int Voce4()
        {
            int i = cmbCosaVedere4.SelectedIndex;
            return (i >= 0 && i < vociMenu4.Count) ? vociMenu4[i] : VoceIstruzioni;
        }

        /// <summary>
        /// Il testo di una voce del passo 4. daDare: esce da Campanella (copiato
        /// o salvato), e i colori delle classi dei dati restano nelle impostazioni.
        /// </summary>
        string TestoPasso4(int voce, bool daDare)
        {
            switch (voce)
            {
                case VoceDati:
                    if (daDare) return DatiOrariDaDare();
                    return orario.Lezioni.Count == 0 ? "Nessun orario caricato." : DatiOrari();
                case VoceDatiDelDocente:
                    if (daDare) return DatiDelDocenteDaDare();
                    return orario.Lezioni.Count == 0 ? "Nessun orario caricato." : DatiDelDocente();
                case VoceCodiceCalendario:
                    return SoloCalendario.Codice();
                default:
                    return IstruzioniCalendario();
            }
        }

        /// <summary>DatiOrari.gs per l'altro account: soltanto il docente del calendario.</summary>
        string DatiDelDocente()
        {
            Esce();
            return AnalisiOrario.GeneraDatiDelDocenteGs(orario, S);
        }

        /// <summary>Lo stesso, da copiare o da salvare: i suoi colori delle classi restano, come per DatiOrari.gs.</summary>
        string DatiDelDocenteDaDare()
        {
            string testo = DatiDelDocente();
            AnalisiOrario.DatiOrariUsciti(orario, S);
            return testo;
        }

        /// <summary>
        /// I dati del solo docente servono solo con il suo nome: senza, niente da
        /// copiare o salvare, e la barra in basso dice perche'.
        /// </summary>
        bool DocenteScelto()
        {
            RaccogliCalendario();
            if (orario.Lezioni.Count == 0)
            {
                Guscio.Stato1("Prima carica l'orario (passo 1) e scegli il tuo nome.", Tema.Ambra);
                return false;
            }
            if (orario.TrovaDocente(S.CalDocente) == "")
            {
                Guscio.Stato1("Prima scegli il tuo nome: i dati per l'altro account contengono solo il tuo orario.",
                              Tema.Ambra);
                return false;
            }
            return true;
        }

        /// <summary>
        /// Calendario.gs si prepara? Se no (una risorsa che manca, un Orari.gs
        /// con un segno rimasto aperto), niente da copiare o salvare, e la barra
        /// in basso dice perche'.
        /// </summary>
        bool CalendarioPronto()
        {
            string codice = SoloCalendario.Codice();
            if (!codice.StartsWith("//", StringComparison.Ordinal)) return true;
            Guscio.Stato1(codice.Split('\n')[0].TrimStart('/', ' '), Tema.Ambra);
            return false;
        }

        void CopiaPasso4()
        {
            int voce = Voce4();
            if (voce == VoceDatiDelDocente && !DocenteScelto()) return;
            if (voce == VoceCodiceCalendario && !CalendarioPronto()) return;
            Guscio.Copia(TestoPasso4(voce, true), "Copiato.");
        }

        void SalvaPasso4()
        {
            int voce = Voce4();
            if (voce == VoceDatiDelDocente && !DocenteScelto()) return;
            if (voce == VoceCodiceCalendario && !CalendarioPronto()) return;
            string nome;
            switch (voce)
            {
                case VoceDati:
                case VoceDatiDelDocente: nome = "DatiOrari.gs"; break;
                case VoceCodiceCalendario: nome = SoloCalendario.NomeFile; break;
                default: nome = "calendario - cosa fare.txt"; break;
            }
            SalvaTesto(nome, delegate { return TestoPasso4(voce, false); },
                       voce == VoceDati || voce == VoceDatiDelDocente);
        }

        /// <summary>Una riga della lista sotto i giorni senza lezione: il testo, e se va guardata (in ambra).</summary>
        class RigaVista
        {
            public string Testo = "";
            public bool DaGuardare;
            public override string ToString() { return Testo; }
        }

        /// <summary>
        /// La lista sotto i giorni senza lezione: come e' stata letta ogni riga
        /// (Calendario.LeggiRighe e Descrivi), con il periodo di adesso.
        /// </summary>
        void AggiornaLette()
        {
            if (lstLette == null) return;
            DateTime inizio = dtInizio.Value.Date, fine = dtFine.Value.Date;
            List<RigaVista> viste = new List<RigaVista>();
            List<int> numeri = new List<int>();
            foreach (RigaLetta r in Calendario.LeggiRighe(txtSospensioni.Text, inizio))
            {
                RigaVista v = new RigaVista();
                v.Testo = Calendario.Descrivi(r, inizio, fine);
                v.DaGuardare = Calendario.DaGuardare(r, inizio, fine);
                viste.Add(v);
                numeri.Add(r.Numero);
            }
            RiempiLista(lstLette, viste, numeri, txtSospensioni,
                        "Nessuna riga: scrivi un giorno o un periodo per riga, per esempio 01/11/2026 Tutti i Santi.");
        }

        /// <summary>
        /// La lista sotto i colloqui: come e' stata letta ogni riga
        /// (Colloqui.LeggiRighe e Descrivi), con il periodo e i giorni dell'orario.
        /// </summary>
        void AggiornaLetteColloqui()
        {
            if (lstColloqui == null) return;
            DateTime inizio = dtInizio.Value.Date, fine = dtFine.Value.Date;
            List<RigaVista> viste = new List<RigaVista>();
            List<int> numeri = new List<int>();
            foreach (RigaColloquio r in Colloqui.LeggiRighe(txtColloqui.Text, inizio, orario.IndiciGiorni))
            {
                RigaVista v = new RigaVista();
                v.Testo = Colloqui.Descrivi(r, inizio, fine);
                v.DaGuardare = Colloqui.DaGuardare(r, inizio, fine);
                viste.Add(v);
                numeri.Add(r.Numero);
            }
            RiempiLista(lstColloqui, viste, numeri, txtColloqui,
                        "Nessun colloquio: scrivi una riga per voce, per esempio ogni giovedi 10:10-11:10 Ricevimento.");
        }

        /// <summary>
        /// Riempie una lista di righe lette (numeri: la riga del testo di ognuna),
        /// o con la frase di quando non ce n'e' nessuna, e la fa scorrere fino alla
        /// riga dove si sta scrivendo nella casella (o all'ultima aggiunta).
        /// </summary>
        static void RiempiLista(ListBox lista, List<RigaVista> viste, List<int> numeri, TextBox casella, string vuota)
        {
            lista.BeginUpdate();
            try
            {
                lista.Items.Clear();
                int larga = 0;
                foreach (RigaVista v in viste)
                {
                    lista.Items.Add(v);
                    larga = Math.Max(larga, TextRenderer.MeasureText(v.Testo, lista.Font).Width);
                }
                if (viste.Count == 0)
                {
                    RigaVista niente = new RigaVista();
                    niente.Testo = vuota;
                    lista.Items.Add(niente);
                }
                lista.HorizontalExtent = larga + 8;
                string testo = casella.Text;
                int qui = Calendario.NumeroDiRiga(testo, Math.Min(casella.SelectionStart, testo.Length));
                int indice = 0;
                for (int i = 0; i < numeri.Count; i++) if (numeri[i] <= qui) indice = i;
                int visibili = Math.Max(1, lista.ClientSize.Height / lista.ItemHeight);
                if (indice < lista.TopIndex) lista.TopIndex = indice;
                else if (indice >= lista.TopIndex + visibili) lista.TopIndex = indice - visibili + 1;
            }
            finally { lista.EndUpdate(); }
        }

        /// <summary>Una riga di una delle due liste: in ambra quelle da guardare, le altre come il testo.</summary>
        static void DisegnaLetta(object o, DrawItemEventArgs e)
        {
            ListBox lista = o as ListBox;
            if (lista == null || e.Index < 0 || e.Index >= lista.Items.Count) return;
            RigaVista v = lista.Items[e.Index] as RigaVista;
            using (SolidBrush fondo = new SolidBrush(lista.BackColor)) e.Graphics.FillRectangle(fondo, e.Bounds);
            Color colore = (v != null && v.DaGuardare) ? Tema.Ambra : Tema.Testo;
            TextRenderer.DrawText(e.Graphics, lista.Items[e.Index].ToString(), lista.Font, e.Bounds, colore,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine);
        }

        /// <summary>"Importa da un file...": i colloqui di un .csv o di un .xlsx, in fondo alla casella.</summary>
        void ImportaColloqui()
        {
            using (OpenFileDialog d = new OpenFileDialog())
            {
                d.Title = "Importa i colloqui da un file";
                d.Filter = "Fogli con i colloqui (*.xlsx;*.csv)|*.xlsx;*.csv|Tutti i file (*.*)|*.*";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                int saltate;
                string errore;
                List<string> righe = Colloqui.Importa(d.FileName, dtInizio.Value.Date, out saltate, out errore);
                if (errore != "") { Guscio.Stato1(errore, Tema.Ambra); return; }
                AggiungiColloqui(righe, Path.GetFileName(d.FileName), saltate);
            }
        }

        /// <summary>
        /// Aggiunge in fondo alla casella dei colloqui le righe importate da un
        /// file (daDove), e lo dice nella barra in basso, con quelle saltate
        /// perche' senza data ne' giorno.
        /// </summary>
        void AggiungiColloqui(List<string> righe, string daDove, int saltate)
        {
            if (righe.Count == 0)
            {
                Guscio.Stato1("In " + daDove + " non ci sono colloqui: ogni riga vuole una data o un giorno della " +
                              "settimana.", Tema.Ambra);
                return;
            }
            string prima = txtColloqui.Text.TrimEnd();
            string nuove = string.Join("\r\n", righe.ToArray());
            txtColloqui.Text = (prima == "") ? nuove : prima + "\r\n" + nuove;
            txtColloqui.SelectionStart = txtColloqui.TextLength;
            txtColloqui.ScrollToCaret();
            AggiornaCalendario();
            string detto = (righe.Count == 1 ? "Importata una riga" : "Importate " + righe.Count + " righe") + " da " +
                           daDove + ": guarda qui sotto come le ho lette.";
            if (saltate > 0)
                Guscio.Stato1(detto + " " + (saltate == 1 ? "Una riga, senza data ne' giorno, e' saltata."
                                                          : saltate + " righe, senza data ne' giorno, sono saltate."),
                              Tema.Ambra);
            else Guscio.Stato1(detto);
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
            rbAltroAccount.Checked = S.CalAltroAccount;
            rbScuola.Checked = !S.CalAltroAccount;
            RiempiMenu4();
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
            txtColloqui.Text = S.CalColloqui;
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
            S.CalAltroAccount = rbAltroAccount.Checked;
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
            S.CalColloqui = txtColloqui.Text;
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
            AggiornaLette();
            AggiornaLetteColloqui();

            string docente = orario.TrovaDocente(S.CalDocente);
            AggiornaColori(docente);
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
                int conAvviso = 0;
                foreach (RigaLetta letta in Calendario.LeggiRighe(S.CalSospensioni, inizio))
                    if (letta.Giorni != null && letta.Avviso != "") conAvviso++;
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
                // i colloqui: quanti vanno sul calendario, e le righe da guardare
                List<RigaColloquio> colloqui = Colloqui.LeggiRighe(S.CalColloqui, inizio, orario.IndiciGiorni);
                if (colloqui.Count > 0)
                {
                    PianoColloqui pc = Colloqui.Piano(colloqui, inizio, fine, sospensioni);
                    int daGuardare = 0;
                    foreach (RigaColloquio rc in colloqui) if (Colloqui.DaGuardare(rc, inizio, fine)) daGuardare++;
                    r.Append("\nColloqui con le famiglie: " + Colloqui.Riassunto(pc) +
                             (pc.Saltati > 0 ? "; " + pc.Saltati + " incontri saltati nei giorni senza lezione o " +
                                               "senza colloqui" : "") + ".");
                    if (daGuardare > 0)
                    {
                        r.Append(" " + (daGuardare == 1 ? "Una riga dei colloqui e' da guardare"
                                                        : daGuardare + " righe dei colloqui sono da guardare") +
                                 ": in ambra, qui sopra.");
                        ruolo = Ruolo.Avviso;
                    }
                }
                if (nonCapite.Count > 0)
                {
                    string esempio = nonCapite[0].Length > 40 ? nonCapite[0].Substring(0, 37) + "..." : nonCapite[0];
                    r.Append("\nRighe dei giorni senza lezione non capite: " + nonCapite.Count + ", come \"" + esempio +
                             "\" (il perche' e' qui sopra). Scrivi una data per riga, per esempio 01/11/2026.");
                    ruolo = Ruolo.Avviso;
                }
                if (conAvviso > 0)
                {
                    r.Append("\n" + (conAvviso == 1 ? "Una riga ha" : conAvviso + " righe hanno") + " nel motivo un numero " +
                             "che potrebbe essere un giorno, una fine o una durata che non tornano con le date, o " +
                             "l'inizio o la fine di un periodo scritti come un giorno solo: controlla qui sopra che " +
                             "il periodo sia quello giusto, e che non sia un giorno di lezione.");
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
                string testo = TestoPasso4(Voce4(), false);
                txtAnteprima4.Text = testo.Replace("\r\n", "\n").Replace("\n", "\r\n");
                txtAnteprima4.Select(0, 0);
            }
        }

        /// <summary>
        /// Il riepilogo dei colori delle classi del docente, come li da'
        /// Campanella adesso (ColoriLezioni.DelCalendario), su una copia: mentre
        /// si scrive il nome, il docente trovato per prefisso puo' essere un
        /// altro, e i colori delle sue classi non devono restare. Restano quando
        /// DatiOrari.gs esce (DatiOrariDaDare) o con "Usa questi colori".
        /// </summary>
        void AggiornaColori(string docente)
        {
            if (riepilogoColori == null) return;
            // con le classi, i colloqui (se ci sono): hanno un colore loro
            List<string> classi = AnalisiOrario.VociDeiColori(orario, S, docente);
            riepilogoColori.Mostra(classi, ColoriLezioni.DelCalendario(S, classi), orario.Lezioni.Count == 0
                ? "Carica l'orario al passo 1: ogni classe del tuo orario avra' il suo colore."
                : "Scegli il tuo nome: ogni classe del tuo orario avra' il suo colore.");
        }

        /// <summary>"Colori delle classi...": la finestra con un colore per classe.</summary>
        void ScegliColori()
        {
            RaccogliCalendario();
            List<string> classi = AnalisiOrario.VociDeiColori(orario, S, orario.TrovaDocente(S.CalDocente));
            if (classi.Count == 0)
            {
                Guscio.Stato1(orario.Lezioni.Count == 0
                    ? "Prima carica l'orario (passo 1) e scegli il tuo nome: i colori vanno alle classi del tuo orario."
                    : "Prima scegli il tuo nome: i colori vanno alle classi del tuo orario.", Tema.Ambra);
                return;
            }
            using (FormColoriClassi f = new FormColoriClassi(classi, S.CalColori, S.CalColoriAMano, S.CalColoriScritti))
            {
                if (f.ShowDialog(this) != DialogResult.OK) return;
                S.CalColori = new Dictionary<string, string>(f.Colori);
                S.CalColoriAMano = new List<string>(f.AMano);
            }
            AggiornaCalendario();
            Guscio.Stato1("Colori delle classi scelti: rigenera DatiOrari.gs e incollalo. Per le lezioni gia' sul " +
                          "calendario esegui ORARI_6_coloraLezioni.");
        }

        /// <summary>"Cosa fare, passo per passo" del passo 4, per l'account scelto in "Dove metti l'orario".</summary>
        string IstruzioniCalendario()
        {
            return GuidaCalendario(Guscio != null && S != null && S.CalAltroAccount);
        }

        /// <summary>
        /// La guida del passo 4. altroAccount: l'orario va nel Google Calendar
        /// di un altro account, con Calendario.gs e i dati del solo docente in un
        /// progetto di quell'account; se no nell'account della scuola, con
        /// Orari.gs nel progetto della Posta. Il resto (giorni senza lezione,
        /// colori, cambio d'orario) e' uguale: le funzioni hanno gli stessi nomi.
        /// </summary>
        static string GuidaCalendario(bool altroAccount)
        {
            StringBuilder sb = new StringBuilder();
            string versione = Guscio.VersioneScript("Orari.gs");
            // la voce del menu con i dati, e dove si incollano
            string voceDati = altroAccount
                ? "i \"Dati del tuo orario\" (voce 2 del menu) e incollali nel file"
                : "i \"Dati dell'orario\" (voce 1 del menu) e incollali nel file";
            if (altroAccount) GuidaAltroAccount(sb, versione);
            else GuidaScuola(sb, versione);
            GuidaComune(sb, voceDati);
            return sb.ToString();
        }

        /// <summary>I primi passi, con l'orario in un altro account (Calendario.gs).</summary>
        static void GuidaAltroAccount(StringBuilder sb, string versione)
        {
            sb.AppendLine("L'ORARIO SU GOOGLE CALENDAR IN UN ALTRO ACCOUNT, PASSO PER PASSO");
            sb.AppendLine("================================================================");
            sb.AppendLine();
            sb.AppendLine("L'orario va nel Google Calendar di un altro account Google, per esempio");
            sb.AppendLine("il tuo personale. Lo mette uno script dentro QUELL'account, in un");
            sb.AppendLine("progetto tutto suo, con due file che prepari qui: il codice solo");
            sb.AppendLine("calendario (Calendario.gs, senza le email) e i dati del tuo orario");
            sb.AppendLine("(DatiOrari.gs, solo il tuo: nessun collega, nessun orario delle classi).");
            sb.AppendLine();
            sb.AppendLine("1.  Apri script.google.com CON QUELL'ACCOUNT. Se nel browser sei entrato");
            sb.AppendLine("    con piu' account Google, guarda in alto a destra quale stai usando");
            sb.AppendLine("    (o apri una finestra in incognito ed entra solo con quello).");
            sb.AppendLine();
            sb.AppendLine("2.  Nuovo progetto. Dagli un nome, per esempio  Orario sul calendario.");
            sb.AppendLine();
            sb.AppendLine("3.  Impostazioni progetto (l'ingranaggio a sinistra) -> Fuso orario:");
            sb.AppendLine("    scegli quello con Roma. Il calendario nasce con il fuso dello script:");
            sb.AppendLine("    con un altro, le lezioni comparirebbero a un'altra ora.");
            sb.AppendLine();
            sb.AppendLine("4.  Torna all'editor (le parentesi < > a sinistra). Nel file  Codice.gs");
            sb.AppendLine("    cancella tutto e incolla il \"Codice solo calendario\" (voce 1 del");
            sb.AppendLine("    menu qui sopra). Se vuoi, rinominalo  Calendario.");
            sb.AppendLine();
            sb.AppendLine("5.  Crea un altro file: \"+\" accanto a File -> Script -> chiamalo");
            sb.AppendLine("    DatiOrari. Incolla dentro i \"Dati del tuo orario\" (voce 2 del menu).");
            sb.AppendLine("    Salva. Sono due file in tutto: non servono ne' la Posta ne' Orari.gs.");
            sb.AppendLine();
            sb.AppendLine("6.  Scegli la funzione  ORARI_4_calendario  ed Esegui. La prima volta");
            sb.AppendLine("    Google chiede di autorizzare lo script: Rivedi autorizzazioni, scegli");
            sb.AppendLine("    l'account, Avanzate -> Apri ... (non sicura) -> Consenti. Chiede solo");
            sb.AppendLine("    il Calendario e di poter riprendere da solo un lavoro lungo quando non");
            sb.AppendLine("    ci sei (i trigger): niente posta, niente email, niente Drive.");
            sb.AppendLine("    Con tante lezioni ci mette qualche minuto. Se finisce il tempo di");
            sb.AppendLine("    un'esecuzione, o se Google chiede di rallentare, si ferma e riprende");
            sb.AppendLine("    da solo dopo un minuto, da dove era arrivato: non devi fare niente.");
            sb.AppendLine("    Prima, se vuoi, ORARI_1_anteprima dice quante serie mettera' e il");
            sb.AppendLine("    fuso orario dello script (deve essere Europe/Rome), senza mettere");
            sb.AppendLine("    niente. Se non scrive  \"Calendario.gs versione " + versione + "\",");
            sb.AppendLine("    reincolla il codice, al posto di quello che c'era: quello di prima");
            sb.AppendLine("    non fa le stesse cose di questa versione di Campanella.");
            sb.AppendLine();
            sb.AppendLine("7.  Apri calendar.google.com con quell'account: nella colonna di sinistra");
            sb.AppendLine("    c'e' il calendario con l'orario, e ogni classe ha il suo colore.");
            sb.AppendLine();
            sb.AppendLine("LE EMAIL DEGLI ORARI");
            sb.AppendLine("--------------------");
            sb.AppendLine("Restano, se le vuoi, nel progetto della scuola: Orari.gs e il DatiOrari.gs");
            sb.AppendLine("di tutto il tabellone (passo 3). Li' non eseguire ORARI_4_calendario:");
            sb.AppendLine("l'orario finirebbe anche nel calendario della scuola. Quando l'orario");
            sb.AppendLine("cambia, rigenera e incolla i dati in tutti e due i progetti.");
            sb.AppendLine();
        }

        /// <summary>I primi passi, con l'orario nell'account della scuola (Orari.gs con la Posta).</summary>
        static void GuidaScuola(StringBuilder sb, string versione)
        {
            sb.AppendLine("L'ORARIO SU GOOGLE CALENDAR, PASSO PER PASSO");
            sb.AppendLine("===========================================");
            sb.AppendLine();
            sb.AppendLine("1.  Metti nel progetto Apps Script il file  Orari  con il \"Codice degli");
            sb.AppendLine("    orari\" (passo 3, voce 1 del menu). Se c'e' gia' (per gli orari via");
            sb.AppendLine("    email), esegui  ORARI_1_anteprima: se non scrive  \"Orari.gs versione " +
                          versione + "\",");
            sb.AppendLine("    reincolla il codice, al posto di quello che c'era. Quello di prima");
            sb.AppendLine("    non conosce i giorni senza lezione, che finirebbero sul calendario");
            sb.AppendLine("    come giorni di lezione, ne' ORARI_5_cambioOrario, ne' i colloqui");
            sb.AppendLine("    (ORARI_7_colloqui).");
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
            sb.AppendLine("    Il calendario nasce con il fuso orario dello script: ORARI_1_anteprima");
            sb.AppendLine("    lo scrive, e se non e' Europe/Rome te lo dice (Impostazioni progetto");
            sb.AppendLine("    -> Fuso orario). Un calendario messo con Campanella 1.5 ha il fuso");
            sb.AppendLine("    UTC: dal 26 ottobre le lezioni compaiono un'ora prima. Lo script se ne");
            sb.AppendLine("    accorge, si ferma e ti dice come sistemare: ORARI_ANNULLA_calendario e");
            sb.AppendLine("    poi di nuovo ORARI_4_calendario (le lezioni spostate o cancellate a");
            sb.AppendLine("    mano vanno rifatte). Cambiare il fuso del calendario dalle impostazioni");
            sb.AppendLine("    di Google Calendar non basta: le lezioni gia' messe restano nel fuso di");
            sb.AppendLine("    prima (lo script se ne accorge lo stesso, e ti dice il rimedio).");
            sb.AppendLine("    Se Google non tiene il fuso giusto (lo script lo controlla sulla prima");
            sb.AppendLine("    serie che passa un cambio dell'ora), si ferma e ti dice di cambiare");
            sb.AppendLine("    nome al calendario: ORARI_4_calendario ne crea uno nuovo.");
            sb.AppendLine();
            sb.AppendLine("4.  Apri calendar.google.com: nella colonna di sinistra c'e' il calendario");
            sb.AppendLine("    con l'orario, e ogni classe ha il suo colore. Puoi accenderlo e");
            sb.AppendLine("    spegnerlo, cambiargli colore, vederlo anche dal telefono.");
            sb.AppendLine();
        }

        /// <summary>
        /// Il resto della guida, uguale per tutti e due gli account. voceDati:
        /// quale voce del menu da' i dati da incollare in DatiOrari.
        /// </summary>
        static void GuidaComune(StringBuilder sb, string voceDati)
        {
            sb.AppendLine("GIORNI SENZA LEZIONE");
            sb.AppendLine("--------------------");
            sb.AppendLine("Nei giorni scritti qui sopra in \"Giorni senza lezione\" sul calendario");
            sb.AppendLine("non c'e' nessuna lezione. Una riga per giorno o per periodo:");
            sb.AppendLine("    01/11/2026 Tutti i Santi");
            sb.AppendLine("    23/12/2026-06/01/2027 Vacanze di Natale");
            sb.AppendLine("    dal 23/12/2026 al 06/01/2027 Vacanze");
            sb.AppendLine("    7-8/12/2026 Ponte                  (il mese scritto una volta sola)");
            sb.AppendLine("    7-8 dicembre 2026 Ponte");
            sb.AppendLine("Sotto la casella c'e' come ho letto ogni riga, con i giorni della");
            sb.AppendLine("settimana: guarda che i periodi siano quelli giusti. In ambra quelle da");
            sb.AppendLine("guardare: non capite, fuori dal periodo, o con un numero nel motivo che");
            sb.AppendLine("potrebbe essere un giorno (\"07/12/2026 ponte 7-8\" e' solo il 7), o un");
            sb.AppendLine("giorno solo con una fine o una durata nel motivo (\"fino all'Epifania\",");
            sb.AppendLine("\"di 2 giorni\"), o che sembra l'inizio o la fine di un periodo, o un giorno");
            sb.AppendLine("di lezione (\"23/12/2026 Vacanze natalizie\" e' solo il 23; \"Inizio delle");
            sb.AppendLine("lezioni\" e \"Ripresa delle lezioni\" non vanno qui). \"dal\" con una data");
            sb.AppendLine("sola non lo capisco: scrivi la fine.");
            sb.AppendLine("\"Aggiungi le feste nazionali\" mette quelle del periodo, Pasqua e");
            sb.AppendLine("Pasquetta comprese. Vacanze, patrono e ponti copiali dalla circolare sul");
            sb.AppendLine("calendario scolastico della regione e della scuola. Ogni ora di lezione");
            sb.AppendLine("diventa piu' eventi settimanali, uno per ogni tratto di settimane senza");
            sb.AppendLine("interruzioni: quanti, te lo dice ORARI_1_anteprima (e il riepilogo qui");
            sb.AppendLine("sopra). Un giorno senza lezione aggiunto dopo aver messo l'orario: spunta");
            sb.AppendLine("\"L'orario e' cambiato\" con la data da cui vale e usa ORARI_5_cambioOrario,");
            sb.AppendLine("anche se l'orario e' lo stesso.");
            sb.AppendLine();
            sb.AppendLine("I COLORI DELLE CLASSI");
            sb.AppendLine("---------------------");
            sb.AppendLine("Ogni lezione prende il colore della sua classe (la 2B di un colore, la 3B");
            sb.AppendLine("di un altro), sempre nello stesso calendario: sono i colori degli eventi");
            sb.AppendLine("di Google Calendar. Di partenza ogni classe del tuo orario ne ha uno");
            sb.AppendLine("diverso, e poi lo tiene; le ore a disposizione sono grigie (Grafite).");
            sb.AppendLine("Per cambiarli c'e' \"Colori delle classi...\" qui sopra: un colore scelto");
            sb.AppendLine("da te resta, e \"colore del calendario\" lascia a quella classe il colore");
            sb.AppendLine("del calendario. ORARI_4_calendario e ORARI_5_cambioOrario danno i colori");
            sb.AppendLine("alle lezioni che mettono. Per quelle gia' sul calendario rigenera e");
            sb.AppendLine("incolla DatiOrari.gs, poi esegui  ORARI_6_coloraLezioni: cambia solo il");
            sb.AppendLine("colore delle lezioni di Campanella, senza rifarle ne' spostarle, e");
            sb.AppendLine("riprende da sola se si ferma. Le lezioni di una classe a cui togli il");
            sb.AppendLine("colore restano come sono: quel colore lo togli da Google Calendar.");
            sb.AppendLine();
            sb.AppendLine("I COLLOQUI CON LE FAMIGLIE");
            sb.AppendLine("--------------------------");
            sb.AppendLine("Scrivili qui sopra in \"Colloqui con le famiglie\", una riga per voce, o");
            sb.AppendLine("importali da un file .csv o .xlsx (\"Importa da un file...\", con le");
            sb.AppendLine("colonne data o giorno, dalle, alle, cosa e link):");
            sb.AppendLine("    ogni giovedi 10:10-11:10 Ricevimento https://meet.google.com/...");
            sb.AppendLine("    dal 12/10/2026 al 22/05/2027 ogni giovedi 10:10-11:10 Ricevimento");
            sb.AppendLine("    15/12/2026 15:00-18:00 Colloqui generali https://meet.google.com/...");
            sb.AppendLine("    niente colloqui dal 14/12/2026 al 09/01/2027");
            sb.AppendLine("ORARI_4_calendario li mette con l'orario: il ricevimento di ogni");
            sb.AppendLine("settimana come le lezioni (niente nei giorni senza lezione e in quelli");
            sb.AppendLine("senza colloqui), le giornate come eventi singoli. Il titolo e' il nome,");
            sb.AppendLine("il luogo il link del Meet, e hanno il colore dei colloqui (la riga");
            sb.AppendLine("Colloqui in \"Colori delle classi...\"). Se cambiano solo i colloqui,");
            sb.AppendLine("rigenera e incolla DatiOrari.gs ed esegui  ORARI_7_colloqui: li aggiorna");
            sb.AppendLine("da oggi in poi, senza toccare le lezioni; quelli passati restano come");
            sb.AppendLine("sono. ORARI_5_cambioOrario li tratta come le lezioni, e");
            sb.AppendLine("ORARI_ANNULLA_calendario li toglie con loro. Le prenotazioni dei");
            sb.AppendLine("genitori restano nel registro elettronico: Campanella non le tocca. I");
            sb.AppendLine("link del Meet aprono le tue stanze: tieni DatiOrari.gs per te.");
            sb.AppendLine();
            sb.AppendLine("SE L'ORARIO CAMBIA");
            sb.AppendLine("------------------");
            sb.AppendLine("1.  Carica il nuovo tabellone al passo 1. Qui sopra spunta \"L'orario e'");
            sb.AppendLine("    cambiato: il nuovo vale dal\" e scegli il primo giorno dell'orario nuovo.");
            sb.AppendLine("    Il periodo (\"Dal\" e \"al\") resta quello con cui hai messo l'orario:");
            sb.AppendLine("    la data del cambio va solo nella spunta.");
            sb.AppendLine();
            sb.AppendLine("2.  Rigenera " + voceDati);
            sb.AppendLine("    DatiOrari, al posto di quello che c'era. Salva.");
            sb.AppendLine();
            sb.AppendLine("3.  Esegui  ORARI_5_cambioOrario. Le settimane passate restano come sono,");
            sb.AppendLine("    anche le lezioni spostate o cancellate a mano, e da quel giorno c'e'");
            sb.AppendLine("    l'orario nuovo. Google non lascia accorciare una serie: quelle");
            sb.AppendLine("    dell'orario di prima le rifa' fino al giorno prima (le lezioni");
            sb.AppendLine("    spostate a mano, o con il titolo, la descrizione, il luogo o il colore");
            sb.AppendLine("    cambiati solo per loro, tornano come eventi singoli, alla loro ora e");
            sb.AppendLine("    come sono) e toglie le vecchie. La serie rifatta ha il colore della");
            sb.AppendLine("    sua classe (se la classe non ne ha uno, quello che aveva); altre");
            sb.AppendLine("    modifiche fatte a mano a una serie, come un promemoria, non passano a");
            sb.AppendLine("    quella rifatta. Rieseguita con la stessa data da' lo stesso");
            sb.AppendLine("    risultato, e anche lei riprende da sola se si ferma.");
            sb.AppendLine("    Tocca solo gli eventi con il contrassegno: una copia fatta a mano di una");
            sb.AppendLine("    lezione la lascia e te la nomina.");
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
        }
    }
}
