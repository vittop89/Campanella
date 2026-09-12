// ===========================================================================
//  PaginaPosta.cs - riordino della casella Gmail
//
//  Sette passi: cosa fa, la scuola, il personale, le regole, il codice da
//  incollare, l'installazione guidata, l'aiuto. L'applicazione non tocca la
//  posta: prepara il codice di uno script che gira dentro l'account.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace Campanella
{
    class PaginaPosta : Pagina
    {
        static readonly string[] NomiPassi =
        {
            "1  Come funziona",
            "2  La tua scuola",
            "3  Il personale",
            "4  Regole ed etichette",
            "5  Codice da incollare",
            "6  Installazione guidata",
            "7  Aiuto e problemi"
        };

        Panel[] pagine;
        int passo = 0;

        TextBox txtDominio, txtDirigenza, txtSegreteria, txtRegistro;

        DataGridView griglia;
        CheckedListBox clbRuoli;
        Label lblConteggio;
        ComboBox cmbSchema, cmbOrdine;
        bool aggiornandoRuoli = false;

        CheckedListBox clbRegole;
        TextBox txtDescrizioneRegola;
        CheckBox chkArchiviaRegola, chkProva, chkReport, chkEscludiInviata, chkFiltri;
        ComboBox cmbPeriodo;
        NumericUpDown numOre;

        ComboBox cmbCosaVedere;
        TextBox txtAnteprima;

        FlowLayoutPanel pannelloPassi;
        List<CheckBox> spunte = new List<CheckBox>();

        const string CartellaEstensione = "EstrattorePersonale";

        public PaginaPosta(Guscio g) : base(g)
        {
            pagine = new Panel[NomiPassi.Length];
            pagine[0] = PaginaIntroduzione();
            pagine[1] = PaginaScuola();
            pagine[2] = PaginaPersonale();
            pagine[3] = PaginaRegole();
            pagine[4] = PaginaCodice();
            pagine[5] = PaginaInstallazione();
            pagine[6] = PaginaAiuto();
            foreach (Panel p in pagine)
            {
                p.Dock = DockStyle.Fill;
                p.Visible = false;
                p.AutoScroll = true;
                Controls.Add(p);
            }
            Mostra();
            pagine[0].Visible = true;
        }

        public override string Nome { get { return "Posta"; } }
        public override string[] Passi { get { return NomiPassi; } }

        public override int Passo
        {
            get { return passo; }
            set
            {
                if (value < 0 || value >= pagine.Length) return;
                if (passo == 3 && value != 3) LeggiSpunteRegole();
                passo = value;
                for (int i = 0; i < pagine.Length; i++) pagine[i].Visible = (i == passo);
                if (passo == 3) AggiornaElencoRegole(clbRegole.SelectedIndex);
                if (passo == 4) AggiornaAnteprima();
            }
        }

        public override void Entra() { Tema.Applica(this); }
        public override void Esce() { Raccogli(); }

        // ===================================================================
        //  SINCRONIZZAZIONE CON LO STATO
        // ===================================================================
        void Mostra()
        {
            txtDominio.Text = S.Dominio;
            txtDirigenza.Text = S.Dirigenza;
            txtSegreteria.Text = S.Segreteria;
            txtRegistro.Text = S.Registro;
            cmbSchema.Text = S.SchemaEmail;
            if (S.OrdineNominativo >= 0 && S.OrdineNominativo < cmbOrdine.Items.Count)
                cmbOrdine.SelectedIndex = S.OrdineNominativo;
            chkProva.Checked = S.Prova;
            chkReport.Checked = S.Report;
            chkEscludiInviata.Checked = S.EscludiInviata;
            chkFiltri.Checked = S.Filtri;
            if (S.Periodo >= 0 && S.Periodo < cmbPeriodo.Items.Count) cmbPeriodo.SelectedIndex = S.Periodo;
            if (S.Ore >= numOre.Minimum && S.Ore <= numOre.Maximum) numOre.Value = S.Ore;
            for (int i = 0; i < spunte.Count && i < S.SpunteInstallazione.Count; i++)
                spunte[i].Checked = S.SpunteInstallazione[i];
            AggiornaPersonale();
            AggiornaElencoRegole(0);
        }

        void Raccogli()
        {
            S.Dominio = txtDominio.Text;
            S.Dirigenza = txtDirigenza.Text;
            S.Segreteria = txtSegreteria.Text;
            S.Registro = txtRegistro.Text;
            S.SchemaEmail = cmbSchema.Text;
            S.OrdineNominativo = cmbOrdine.SelectedIndex;
            S.Prova = chkProva.Checked;
            S.Report = chkReport.Checked;
            S.EscludiInviata = chkEscludiInviata.Checked;
            S.Filtri = chkFiltri.Checked;
            S.Periodo = cmbPeriodo.SelectedIndex;
            S.Ore = (int)numOre.Value;
            LeggiSpunteRegole();
            S.SpunteInstallazione.Clear();
            foreach (CheckBox c in spunte) S.SpunteInstallazione.Add(c.Checked);
        }

        // ===================================================================
        //  PASSO 1
        // ===================================================================
        Panel PaginaIntroduzione()
        {
            Panel p = NuovaPagina("Come funziona, in breve");
            int y = 54;

            string[,] blocchi =
            {
                { "Che cos'e'",
                  "Questa pagina non tocca la tua posta. Prepara per te il codice e le " +
                  "impostazioni di un piccolo programma Google (Apps Script) che gira dentro il " +
                  "tuo account e mette in ordine i messaggi con delle etichette." },
                { "Che cosa fa lo script",
                  "Crea le etichette (Dirigenza, Segreteria, Circolari, Colleghi, Studenti, ...), " +
                  "le applica alla posta gia' ricevuta e poi continua da solo con i messaggi nuovi. " +
                  "Se vuoi, crea anche i veri filtri di Gmail." },
                { "Che cosa NON fa",
                  "Non cancella niente, non svuota il cestino, non segnala come spam, non manda " +
                  "messaggi al posto tuo. Al massimo archivia, cioe' toglie dalla Posta in arrivo: " +
                  "il messaggio resta comunque in \"Tutti i messaggi\"." },
                { "Prima si prova",
                  "La prima esecuzione parte sempre in modalita' prova: conta i messaggi e ti dice " +
                  "cosa farebbe, senza modificare nulla. Solo quando il risultato ti convince togli " +
                  "la spunta e fai sul serio." },
                { "I passi da fare",
                  "2) il dominio della scuola   3) l'elenco del personale   4) le etichette   " +
                  "5) copi il codice   6) segui l'installazione guidata. " +
                  "Dieci minuti la prima volta, poi mai piu'." }
            };

            for (int i = 0; i < blocchi.GetLength(0); i++)
            {
                Panel c = Tema.Scheda1(blocchi[i, 0], blocchi[i, 1], 0, y, 880);
                p.Controls.Add(c);
                y += c.Height + 12;
            }
            p.Controls.Add(Tema.BottonePrincipale("Cominciamo  >", 0, y + 6, 180,
                delegate { Guscio.VaiA(1, 1); }));
            return p;
        }

        // ===================================================================
        //  PASSO 2
        // ===================================================================
        Panel PaginaScuola()
        {
            Panel p = NuovaPagina("La tua scuola");
            int y = 54;

            p.Controls.Add(Tema.Testo1(
                "Serve il dominio della scuola e qualche indirizzo. Se non sai cosa mettere in un " +
                "campo, lascialo vuoto: le regole che lo usano verranno semplicemente saltate. " +
                "Il tuo indirizzo non serve: lo script gira dentro il tuo account e lo sa da solo.",
                0, y, 860, Tema.Normale, Ruolo.Tenue));
            y += 52;

            p.Controls.Add(Tema.Testo1("Dominio della scuola", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtDominio = Tema.Casella(0, y + 22, 340, "per esempio  liceoxyz.edu.it");
            p.Controls.Add(txtDominio);
            p.Controls.Add(Tema.Testo1(
                "La parte dopo la chiocciola degli indirizzi della scuola. Le etichette vengono " +
                "raggruppate sotto \"" + S.PrefissoPulito() + "\": " + S.PrefissoPulito() +
                "/Circolari, " + S.PrefissoPulito() + "/Colleghi...",
                356, y + 22, 500, Tema.Piccolo, Ruolo.Tenue));
            y += 66;

            p.Controls.Add(Tema.Testo1("Indirizzi particolari  (uno per riga, oppure separati da virgola)",
                                       0, y, 780, Tema.Grassetto, Ruolo.Normale));
            y += 26;

            p.Controls.Add(Tema.Testo1("Dirigenza", 0, y, 0, Tema.Normale, Ruolo.Tenue));
            txtDirigenza = Tema.CasellaMulti(0, y + 20, 300, 66, "dirigente@liceoxyz.edu.it");
            p.Controls.Add(txtDirigenza);

            p.Controls.Add(Tema.Testo1("Segreteria", 320, y, 0, Tema.Normale, Ruolo.Tenue));
            txtSegreteria = Tema.CasellaMulti(320, y + 20, 300, 66, "segreteria@liceoxyz.edu.it");
            p.Controls.Add(txtSegreteria);
            y += 98;

            p.Controls.Add(Tema.Testo1("Registro elettronico", 0, y, 0, Tema.Normale, Ruolo.Tenue));
            txtRegistro = Tema.CasellaMulti(0, y + 20, 300, 50, "@spaggiari.eu");
            p.Controls.Add(txtRegistro);
            p.Controls.Add(Tema.Testo1(
                "Puoi scrivere un indirizzo intero (preside@scuola.it) oppure solo un dominio " +
                "preceduto dalla chiocciola (@spaggiari.eu): in quel caso vale per tutti gli " +
                "indirizzi di quel dominio.",
                320, y + 20, 400, Tema.Piccolo, Ruolo.Tenue));
            return p;
        }

        // ===================================================================
        //  PASSO 3
        // ===================================================================
        Panel PaginaPersonale()
        {
            Panel p = NuovaPagina("Il personale della scuola");
            int y = 52;

            p.Controls.Add(Tema.Testo1(
                "Serve per distinguere i colleghi dagli studenti, che hanno indirizzi dello stesso " +
                "dominio. Lo stesso elenco viene poi riusato dallo strumento Orari.",
                0, y, 860, Tema.Normale, Ruolo.Tenue));
            y += 40;

            GroupBox g = Tema.Gruppo("Da dove prendo gli indirizzi", 0, y, 900, 116);
            g.Controls.Add(Tema.Testo1("A) Ce li ho gia'", 14, 26, 210, Tema.Grassetto, Ruolo.Normale));
            g.Controls.Add(Tema.Testo1("Indirizzi presi dalla rubrica o da una mail al gruppo docenti.",
                                       14, 46, 215, Tema.Piccolo, Ruolo.Tenue));
            g.Controls.Add(Tema.Bottone("Incolla elenco", 14, 76, 150, delegate { IncollaElenco(); }));

            g.Controls.Add(Tema.Testo1("B) Dal registro Spaggiari", 246, 26, 230, Tema.Grassetto, Ruolo.Normale));
            g.Controls.Add(Tema.Testo1("Nomi e ruoli dalla pagina \"Tutto il personale\".",
                                       246, 46, 230, Tema.Piccolo, Ruolo.Tenue));
            g.Controls.Add(Tema.Bottone("Come si fa...", 246, 76, 118, delegate { GuidaSpaggiari(); }));
            g.Controls.Add(Tema.Bottone("Estensione...", 370, 76, 118, delegate { CreaEstensione(); }));

            g.Controls.Add(Tema.Testo1("C) Dalla tua casella", 500, 26, 250, Tema.Grassetto, Ruolo.Normale));
            g.Controls.Add(Tema.Testo1("Lo script legge i mittenti del dominio: indirizzi certi.",
                                       500, 46, 250, Tema.Piccolo, Ruolo.Tenue));
            g.Controls.Add(Tema.Bottone("Come si fa...", 500, 76, 130, delegate { GuidaCasella(); }));
            p.Controls.Add(g);
            y += 128;

            p.Controls.Add(Tema.Testo1("Ruoli da includere", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            clbRuoli = new CheckedListBox();
            clbRuoli.Location = new Point(0, y + 22);
            clbRuoli.Size = new Size(250, 250);
            clbRuoli.Font = Tema.Normale;
            clbRuoli.CheckOnClick = true;
            clbRuoli.ItemCheck += RuoloCambiato;
            p.Controls.Add(clbRuoli);
            p.Controls.Add(Tema.Testo1("Gli studenti e i genitori partono senza spunta.",
                                       0, y + 278, 250, Tema.Piccolo, Ruolo.Tenue));

            lblConteggio = Tema.Testo1("Nessuna persona caricata", 266, y, 600, Tema.Grassetto, Ruolo.Normale);
            p.Controls.Add(lblConteggio);

            griglia = new DataGridView();
            griglia.Location = new Point(266, y + 22);
            griglia.Size = new Size(634, 250);
            griglia.Font = Tema.Normale;
            griglia.BorderStyle = BorderStyle.FixedSingle;
            griglia.AllowUserToAddRows = false;
            griglia.AllowUserToResizeRows = false;
            griglia.RowHeadersVisible = false;
            griglia.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            griglia.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            griglia.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;

            DataGridViewCheckBoxColumn c0 = new DataGridViewCheckBoxColumn();
            c0.HeaderText = "Usa"; c0.FillWeight = 8;
            DataGridViewTextBoxColumn c1 = new DataGridViewTextBoxColumn();
            c1.HeaderText = "Nominativo"; c1.FillWeight = 30;
            DataGridViewTextBoxColumn c2 = new DataGridViewTextBoxColumn();
            c2.HeaderText = "Ruolo"; c2.FillWeight = 22;
            DataGridViewTextBoxColumn c3 = new DataGridViewTextBoxColumn();
            c3.HeaderText = "Indirizzo email"; c3.FillWeight = 40;
            griglia.Columns.AddRange(new DataGridViewColumn[] { c0, c1, c2, c3 });

            griglia.CurrentCellDirtyStateChanged += delegate
            {
                if (griglia.IsCurrentCellDirty)
                    griglia.CommitEdit(DataGridViewDataErrorContexts.Commit);
            };
            griglia.CellValueChanged += GrigliaModificata;
            p.Controls.Add(griglia);

            int yb = y + 280;
            p.Controls.Add(Tema.Bottone("Genera le email dai nomi", 266, yb, 190, delegate { GeneraEmail(); }));
            p.Controls.Add(Tema.Bottone("Togli le righe selezionate", 464, yb, 180, delegate { TogliSelezionate(); }));
            p.Controls.Add(Tema.Bottone("Svuota tutto", 652, yb, 110, delegate { Svuota(); }));
            p.Controls.Add(Tema.Bottone("Esporta CSV", 770, yb, 110, delegate { EsportaCsv(); }));

            int ys = yb + 40;
            p.Controls.Add(Tema.Testo1("Se hai solo i nomi, costruisco gli indirizzi cosi':",
                                       266, ys + 5, 0, Tema.Normale, Ruolo.Tenue));
            cmbSchema = new ComboBox();
            cmbSchema.Location = new Point(266, ys + 28);
            cmbSchema.Width = 230;
            cmbSchema.Font = Tema.Normale;
            cmbSchema.Items.AddRange(new object[]
            { "{nome}.{cognome}", "{n}.{cognome}", "{cognome}.{nome}",
              "{nome}{cognome}", "{cognome}{nome}", "{cognome}.{n}" });
            p.Controls.Add(cmbSchema);

            cmbOrdine = new ComboBox();
            cmbOrdine.Location = new Point(506, ys + 28);
            cmbOrdine.Width = 220;
            cmbOrdine.Font = Tema.Normale;
            cmbOrdine.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbOrdine.Items.AddRange(new object[]
            { "il nominativo e' COGNOME NOME", "il nominativo e' NOME COGNOME" });
            p.Controls.Add(cmbOrdine);

            p.Controls.Add(Tema.Testo1(
                "Gli indirizzi generati sono un'ipotesi: controllali e correggili nella tabella.",
                266, ys + 58, 620, Tema.Piccolo, Ruolo.Avviso));
            return p;
        }

        // ===================================================================
        //  PASSO 4
        // ===================================================================
        Panel PaginaRegole()
        {
            Panel p = NuovaPagina("Regole ed etichette");
            int y = 52;

            p.Controls.Add(Tema.Testo1(
                "Ogni riga e' un'etichetta di Gmail. Togli la spunta a quelle che non ti servono. " +
                "L'ordine conta: le regole piu' in alto hanno la precedenza.",
                0, y, 800, Tema.Normale, Ruolo.Tenue));
            y += 44;

            clbRegole = new CheckedListBox();
            clbRegole.Location = new Point(0, y);
            clbRegole.Size = new Size(400, 300);
            clbRegole.Font = Tema.Normale;
            clbRegole.CheckOnClick = true;
            clbRegole.SelectedIndexChanged += delegate { MostraDescrizioneRegola(); };
            clbRegole.ItemCheck += delegate(object s, ItemCheckEventArgs e)
            {
                if (e.Index >= 0 && e.Index < S.Regole.Count)
                    S.Regole[e.Index].Attiva = (e.NewValue == CheckState.Checked);
            };
            p.Controls.Add(clbRegole);

            int yb = y + 310;
            p.Controls.Add(Tema.Bottone("Aggiungi regola...", 0, yb, 150, delegate { AggiungiRegola(); }));
            p.Controls.Add(Tema.Bottone("Modifica", 158, yb, 110, delegate { ModificaRegola(); }));
            p.Controls.Add(Tema.Bottone("Su", 272, yb, 60, delegate { SpostaRegola(-1); }));
            p.Controls.Add(Tema.Bottone("Giu'", 336, yb, 60, delegate { SpostaRegola(1); }));

            txtDescrizioneRegola = Tema.Paragrafo(420, y, 480, 108, Ruolo.Normale);
            p.Controls.Add(txtDescrizioneRegola);

            chkArchiviaRegola = Tema.Spunta("Archivia: togli questi messaggi dalla Posta in arrivo",
                                            420, y + 116, Ruolo.Normale);
            chkArchiviaRegola.CheckedChanged += delegate
            {
                int i = clbRegole.SelectedIndex;
                if (i >= 0 && i < S.Regole.Count && S.Regole[i].Archivia != chkArchiviaRegola.Checked)
                {
                    S.Regole[i].Archivia = chkArchiviaRegola.Checked;
                    AggiornaElencoRegole(i);
                }
            };
            p.Controls.Add(chkArchiviaRegola);

            GroupBox go = Tema.Gruppo("Come deve lavorare lo script", 420, y + 150, 480, 210);
            chkProva = Tema.Spunta("Modalita' prova: conta soltanto, non modifica niente", 14, 28, Ruolo.Avviso);
            chkProva.Font = Tema.Grassetto;
            go.Controls.Add(chkProva);

            go.Controls.Add(Tema.Testo1("Quanta posta guardare", 14, 60, 0, Tema.Normale, Ruolo.Tenue));
            cmbPeriodo = new ComboBox();
            cmbPeriodo.Location = new Point(210, 56);
            cmbPeriodo.Width = 250;
            cmbPeriodo.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbPeriodo.Font = Tema.Normale;
            cmbPeriodo.Items.AddRange(new object[]
            { "tutta la posta", "ultimi 12 mesi", "ultimi 24 mesi", "ultimi 36 mesi" });
            go.Controls.Add(cmbPeriodo);

            go.Controls.Add(Tema.Testo1("Controlla la posta nuova ogni", 14, 94, 0, Tema.Normale, Ruolo.Tenue));
            numOre = new NumericUpDown();
            numOre.Location = new Point(210, 90);
            numOre.Width = 60;
            numOre.Minimum = 1; numOre.Maximum = 12; numOre.Value = 1;
            numOre.Font = Tema.Normale;
            go.Controls.Add(numOre);
            go.Controls.Add(Tema.Testo1("ora/e", 276, 94, 0, Tema.Normale, Ruolo.Tenue));

            chkReport = Tema.Spunta("Mandami un riepilogo per email quando ha finito  (al tuo stesso account)",
                                    14, 124, Ruolo.Normale);
            go.Controls.Add(chkReport);
            chkEscludiInviata = Tema.Spunta("Non toccare la posta inviata", 14, 148, Ruolo.Normale);
            go.Controls.Add(chkEscludiInviata);
            chkFiltri = Tema.Spunta("Voglio anche i filtri veri di Gmail  (un passaggio in piu')",
                                    14, 172, Ruolo.Normale);
            go.Controls.Add(chkFiltri);
            p.Controls.Add(go);
            return p;
        }

        // ===================================================================
        //  PASSO 5
        // ===================================================================
        Panel PaginaCodice()
        {
            Panel p = NuovaPagina("Codice da incollare");
            int y = 52;

            p.Controls.Add(Tema.Testo1(
                "Qui c'e' tutto il materiale pronto. Non serve capirlo: basta copiarlo e incollarlo " +
                "dove dice il passo 6.",
                0, y, 800, Tema.Normale, Ruolo.Tenue));
            y += 40;

            cmbCosaVedere = new ComboBox();
            cmbCosaVedere.Location = new Point(0, y);
            cmbCosaVedere.Width = 340;
            cmbCosaVedere.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbCosaVedere.Font = Tema.Normale;
            cmbCosaVedere.Items.AddRange(new object[]
            {
                "1. Codice principale  ->  file Codice.gs",
                "2. Configurazione  ->  file Configurazione.gs",
                "3. Funzione per Spaggiari  ->  console del browser",
                "4. Riepilogo delle etichette"
            });
            cmbCosaVedere.SelectedIndex = 0;
            cmbCosaVedere.SelectedIndexChanged += delegate { AggiornaAnteprima(); };
            p.Controls.Add(cmbCosaVedere);

            p.Controls.Add(Tema.BottonePrincipale("Copia negli appunti", 352, y - 2, 180,
                delegate { Guscio.Copia(TestoCorrente(), MessaggioCopia()); }));
            p.Controls.Add(Tema.Bottone("Salva su file...", 542, y, 130, delegate { SalvaAnteprima(); }));
            p.Controls.Add(Tema.Bottone("Salva tutto in una cartella...", 682, y, 218, delegate { SalvaTutto(); }));
            y += 40;

            txtAnteprima = Tema.Registro(0, y, 900, 440, false);
            txtAnteprima.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            p.Controls.Add(txtAnteprima);
            return p;
        }

        // ===================================================================
        //  PASSO 6
        // ===================================================================
        Panel PaginaInstallazione()
        {
            Panel p = NuovaPagina("Installazione guidata");
            int y = 52;

            p.Controls.Add(Tema.Testo1(
                "Fai un passo per volta e spunta la casella quando l'hai finito: le spunte restano " +
                "salvate, cosi' se ti interrompi sai dove eri arrivato.",
                0, y, 900, Tema.Normale, Ruolo.Tenue));
            y += 44;

            pannelloPassi = new FlowLayoutPanel();
            pannelloPassi.Location = new Point(0, y);
            pannelloPassi.Size = new Size(910, 480);
            pannelloPassi.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            pannelloPassi.FlowDirection = FlowDirection.TopDown;
            pannelloPassi.WrapContents = false;
            pannelloPassi.AutoScroll = true;
            p.Controls.Add(pannelloPassi);

            Cartellino(1, "Apri l'editor dello script",
                "Vai su script.google.com con lo stesso account Gmail che vuoi riordinare. " +
                "Se hai gia' il progetto \"Organizzazione Gmail\" nel Drive, aprilo. " +
                "Altrimenti premi \"Nuovo progetto\" e chiamalo Organizzazione Gmail.",
                new string[] { "Apri script.google.com", "Apri il progetto nel Drive" },
                new EventHandler[]
                {
                    delegate { Guscio.Apri("https://script.google.com/home"); },
                    delegate { ApriProgetto(); }
                });

            Cartellino(2, "Incolla il codice principale",
                "Nell'editor vedi un file chiamato Codice.gs (o Code.gs) con dentro poche righe. " +
                "Fai clic nel testo, premi Ctrl+A per selezionare tutto, poi Ctrl+V per incollare " +
                "il codice. Infine Ctrl+S per salvare.",
                new string[] { "Copia il codice principale" },
                new EventHandler[] { delegate { Guscio.Copia(CodicePrincipale(), "Codice principale copiato."); } });

            Cartellino(3, "Aggiungi il file della configurazione",
                "Sempre nell'editor, colonna di sinistra, accanto a \"File\" premi il \"+\" e scegli " +
                "\"Script\". Chiamalo esattamente  Configurazione  (senza .gs). Seleziona tutto " +
                "(Ctrl+A) e incolla (Ctrl+V) la configurazione. Poi Ctrl+S.",
                new string[] { "Copia la configurazione" },
                new EventHandler[] { delegate { Guscio.Copia(GeneraConfigurazione(), "Configurazione copiata."); } });

            Cartellino(4, "Prima esecuzione e autorizzazione",
                "In alto scegli la funzione  PASSO_1_anteprima  dal menu a tendina e premi Esegui. " +
                "Google chiede il permesso: premi \"Rivedi autorizzazioni\", scegli il tuo account, " +
                "poi nella schermata \"Google non ha verificato questa app\" premi \"Avanzate\" e " +
                "quindi \"Apri Organizzazione Gmail (non sicura)\", infine \"Consenti\". " +
                "E' il tuo script, scritto da te: l'avviso compare per tutti gli script personali. " +
                "Alla fine, in basso, leggi il registro con il conteggio dei messaggi.",
                new string[] { }, new EventHandler[] { });

            Cartellino(5, "Crea le etichette",
                "Scegli la funzione  PASSO_2_creaEtichette  e premi Esegui. In Gmail compaiono le " +
                "etichette vuote, nella colonna di sinistra.",
                new string[] { "Apri Gmail" },
                new EventHandler[] { delegate { Guscio.Apri("https://mail.google.com/"); } });

            Cartellino(6, "Riordina la posta gia' ricevuta",
                "Se l'anteprima ti convince, apri il file Configurazione, cerca la riga " +
                "provaSenzaModifiche: true  e cambiala in  false. Salva con Ctrl+S. " +
                "Poi scegli  PASSO_3_riordinaPostaEsistente  ed Esegui. Se la posta e' tanta lo " +
                "script si ferma dopo qualche minuto e riparte da solo: puoi chiudere la pagina.",
                new string[] { "Copia la configurazione senza modalita' prova" },
                new EventHandler[] { delegate {
                    Guscio.Copia(GeneraConfigurazione(false),
                        "Configurazione copiata, senza modalita' prova: adesso agira' davvero."); } });

            Cartellino(7, "Accendi l'automazione",
                "Scegli  PASSO_4_attivaAutomazione  ed Esegui. Da questo momento i messaggi nuovi " +
                "vengono etichettati da soli, anche a computer spento.",
                new string[] { }, new EventHandler[] { });

            Cartellino(8, "Facoltativo: i filtri veri di Gmail",
                "Nell'editor, colonna di sinistra, alla voce \"Servizi\" premi il \"+\", scegli " +
                "\"Gmail API\" e conferma. Poi esegui  EXTRA_creaFiltriGmail. Cosi' lo smistamento " +
                "avviene dentro Gmail, senza aspettare lo script.",
                new string[] { }, new EventHandler[] { });

            return p;
        }

        void Cartellino(int numero, string titolo, string testo, string[] bottoni, EventHandler[] azioni)
        {
            int larghezza = 862;
            Panel c = new Panel();
            c.Width = larghezza;
            c.Tag = Ruolo.Scheda;
            c.Margin = new Padding(0, 0, 0, 10);

            Label num = new Label();
            num.Text = numero.ToString();
            num.Font = new Font("Segoe UI", 13f, FontStyle.Bold);
            num.TextAlign = ContentAlignment.MiddleCenter;
            num.Location = new Point(14, 14);
            num.Size = new Size(34, 34);
            num.Tag = Ruolo.Numero;
            c.Controls.Add(num);

            Label lt = Tema.Testo1(titolo, 60, 14, larghezza - 220, Tema.Sottosezione, Ruolo.Normale);
            c.Controls.Add(lt);
            Label lc = Tema.Testo1(testo, 60, 14 + lt.Height + 2, larghezza - 100, Tema.Normale, Ruolo.Normale);
            c.Controls.Add(lc);

            int y = 14 + lt.Height + 2 + lc.Height + 8;
            int x = 60;
            for (int i = 0; i < bottoni.Length; i++)
            {
                int w = 26 + TextRenderer.MeasureText(bottoni[i], Tema.Normale).Width;
                c.Controls.Add(Tema.Bottone(bottoni[i], x, y, w, azioni[i]));
                x += w + 10;
            }
            y += (bottoni.Length > 0) ? 38 : 4;

            CheckBox spunta = Tema.Spunta("Fatto", 60, y, Ruolo.Tenue);
            spunta.Font = Tema.Grassetto;
            spunta.CheckedChanged += delegate
            {
                spunta.Tag = spunta.Checked ? Ruolo.Buono : Ruolo.Tenue;
                Tema.Applica(spunta);
            };
            c.Controls.Add(spunta);
            spunte.Add(spunta);

            c.Height = y + 34;
            Tema.Contorna(c);
            pannelloPassi.Controls.Add(c);
        }

        // ===================================================================
        //  PASSO 7
        // ===================================================================
        Panel PaginaAiuto()
        {
            Panel p = NuovaPagina("Aiuto e problemi");
            Panel scorrevole = new Panel();
            scorrevole.Location = new Point(0, 50);
            scorrevole.Size = new Size(910, 540);
            scorrevole.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            scorrevole.AutoScroll = true;
            p.Controls.Add(scorrevole);

            string[,] faq =
            {
                { "Windows dice che l'app non e' sicura e non la fa partire",
                  "E' la protezione SmartScreen, che diffida dei programmi poco diffusi. " +
                  "Premi \"Ulteriori informazioni\" e poi \"Esegui comunque\". " +
                  "Se il file arriva da una chiavetta o da un download: tasto destro sul file, " +
                  "Proprieta', in fondo spunta \"Annulla blocco\" e premi OK." },
                { "\"Google non ha verificato questa app\"",
                  "Compare per tutti gli script personali, anche i tuoi. Premi \"Avanzate\" in " +
                  "basso a sinistra, poi \"Apri ... (non sicura)\" e infine \"Consenti\". " +
                  "Il codice gira solo dentro il tuo account e nessun altro lo vede." },
                { "Lo script si ferma con \"Superato il tempo massimo di esecuzione\"",
                  "E' normale con molte migliaia di messaggi. Lo script salva il punto in cui era " +
                  "arrivato e si rimette in moto da solo dopo un minuto: puoi chiudere la pagina. " +
                  "Se vuoi ripartire da zero esegui ANNULLA_progressoRiordino." },
                { "Ho sbagliato: come torno indietro?",
                  "Esegui ANNULLA_etichettatura: toglie dalle conversazioni tutte le etichette " +
                  "applicate. Esegui ANNULLA_automazione per spegnere il controllo automatico. " +
                  "Nulla viene mai cancellato, quindi non si perde posta." },
                { "Alcuni messaggi finiscono nell'etichetta sbagliata",
                  "Quasi sempre e' l'ordine delle regole: quelle in alto vincono. Nel passo 4 usa " +
                  "\"Su\" e \"Giu'\" per spostarle, rigenera la configurazione e incollala di nuovo. " +
                  "Poi riesegui PASSO_3: le conversazioni gia' etichettate non vengono ritoccate." },
                { "Colleghi e studenti finiscono insieme",
                  "Vuol dire che l'elenco del personale e' incompleto: sono indirizzi dello stesso " +
                  "dominio, e l'unico modo per distinguerli e' l'elenco. Usa il metodo C del passo 3 " +
                  "(EXTRA_elencaIndirizziScuola): legge i mittenti veri dalla tua casella." },
                { "Quanto tempo ci mette?",
                  "Dipende da quanta posta hai. Indicativamente un migliaio di conversazioni al " +
                  "minuto. Con caselle molto grandi lo script lavora a riprese, in automatico, " +
                  "anche per un'ora: non serve restare a guardare." }
            };

            int y = 8;
            for (int i = 0; i < faq.GetLength(0); i++)
            {
                Panel c = Tema.Scheda1(faq[i, 0], faq[i, 1], 0, y, 862);
                scorrevole.Controls.Add(c);
                y += c.Height + 10;
            }
            return p;
        }

        Panel NuovaPagina(string titolo)
        {
            Panel p = new Panel();
            p.AutoScroll = true;
            p.Controls.Add(Tema.Testo1(titolo, 0, 6, 0, Tema.Sezione, Ruolo.Sezione));
            return p;
        }

        // ===================================================================
        //  PERSONALE
        // ===================================================================
        void IncollaElenco()
        {
            string testo = "";
            try { if (Clipboard.ContainsText()) testo = Clipboard.GetText(); } catch { }

            using (FormIncolla f = new FormIncolla(testo))
            {
                if (f.ShowDialog(this) != DialogResult.OK) return;
                List<Persona> nuove = AnalizzaElenco(f.Testo);
                if (nuove.Count == 0)
                {
                    MessageBox.Show(this,
                        "Non ho riconosciuto nessun nominativo o indirizzo.\n\n" +
                        "Va bene qualunque forma: un indirizzo per riga, indirizzi separati da " +
                        "virgola, oppure l'elenco copiato da Spaggiari.",
                        "Elenco vuoto", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Unisci(nuove);
                AggiornaPersonale();
                Guscio.Stato1("Aggiunte " + nuove.Count + " voci. In elenco: " + S.Personale.Count + ".");
            }
        }

        void Unisci(List<Persona> nuove)
        {
            Dictionary<string, Persona> perEmail = new Dictionary<string, Persona>();
            Dictionary<string, Persona> perNome = new Dictionary<string, Persona>();
            foreach (Persona p in S.Personale)
            {
                if (p.Email != "") perEmail[p.Email.ToLowerInvariant()] = p;
                if (p.Nome != "") perNome[Stato.Chiave(p.Nome)] = p;
            }

            foreach (Persona n in nuove)
            {
                Persona esistente = null;
                if (n.Email != "" && perEmail.ContainsKey(n.Email.ToLowerInvariant()))
                    esistente = perEmail[n.Email.ToLowerInvariant()];
                else if (n.Nome != "" && perNome.ContainsKey(Stato.Chiave(n.Nome)))
                    esistente = perNome[Stato.Chiave(n.Nome)];

                if (esistente != null)
                {
                    if (esistente.Email == "" && n.Email != "") esistente.Email = n.Email;
                    if (esistente.Nome == "" && n.Nome != "") esistente.Nome = n.Nome;
                    if ((esistente.Ruolo == "" || esistente.Ruolo == "Non specificato") && n.Ruolo != "")
                        esistente.Ruolo = n.Ruolo;
                }
                else
                {
                    S.Personale.Add(n);
                    if (n.Email != "") perEmail[n.Email.ToLowerInvariant()] = n;
                    if (n.Nome != "") perNome[Stato.Chiave(n.Nome)] = n;
                }
            }
        }

        /// <summary>
        /// Riconosce quasi tutti i formati: TSV di Spaggiari, TSV dello script,
        /// elenchi di indirizzi, "Nome Cognome &lt;indirizzo&gt;", output della
        /// funzione della console raggruppato per ruolo.
        /// </summary>
        public static List<Persona> AnalizzaElenco(string testo)
        {
            List<Persona> fuori = new List<Persona>();
            if (string.IsNullOrEmpty(testo)) return fuori;

            Regex reEmail = new Regex(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}");
            Regex reRuolo = new Regex(@"^[^\w]*([\p{Lu}][\p{Lu}\s\.'\-]{2,})\s*\(\s*\d+\s*\)\s*$");
            string ruoloCorrente = "";

            string[] righe = testo.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            foreach (string rigaGrezza in righe)
            {
                string riga = rigaGrezza.Trim();
                if (riga.Length == 0) continue;
                if (Regex.IsMatch(riga, @"^[\-=_\.]{3,}$")) continue;

                string senzaSegni = riga.TrimStart('#', '*', ' ', '\t');
                if (senzaSegni.StartsWith("NOMINATIVO", StringComparison.OrdinalIgnoreCase) ||
                    senzaSegni.StartsWith("INDIRIZZO", StringComparison.OrdinalIgnoreCase) ||
                    senzaSegni.StartsWith("SUDDIVISIONE", StringComparison.OrdinalIgnoreCase)) continue;

                Match mr = reRuolo.Match(riga);
                if (mr.Success && !riga.Contains("@"))
                {
                    ruoloCorrente = Titolizza(mr.Groups[1].Value.Trim());
                    continue;
                }

                if (riga.Contains("\t"))
                {
                    string[] campi = riga.Split('\t');
                    for (int i = 0; i < campi.Length; i++) campi[i] = campi[i].Trim();

                    Persona p = new Persona();
                    if (campi.Length > 0 && reEmail.IsMatch(campi[0]))
                    {
                        p.Email = reEmail.Match(campi[0]).Value.ToLowerInvariant();
                        p.Nome = (campi.Length > 1) ? PulisciNome(campi[1]) : "";
                        p.Ruolo = ruoloCorrente;
                    }
                    else
                    {
                        p.Nome = PulisciNome(campi[0]);
                        p.Ruolo = (campi.Length > 1 && campi[1] != "") ? Titolizza(campi[1]) : ruoloCorrente;
                        for (int i = 1; i < campi.Length; i++)
                        {
                            Match me = reEmail.Match(campi[i]);
                            if (me.Success) { p.Email = me.Value.ToLowerInvariant(); break; }
                        }
                    }
                    if (p.Nome != "" || p.Email != "") fuori.Add(p);
                    continue;
                }

                MatchCollection mails = reEmail.Matches(riga);
                if (mails.Count > 0)
                {
                    string[] spezzoni = (mails.Count == 1)
                        ? new string[] { riga }
                        : riga.Split(new char[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries);

                    foreach (string spezzone in spezzoni)
                    {
                        MatchCollection dentro = reEmail.Matches(spezzone);
                        if (dentro.Count == 0) continue;
                        string resto = spezzone;
                        foreach (Match m in dentro) resto = resto.Replace(m.Value, " ");
                        string nome = (dentro.Count == 1) ? PulisciNome(resto) : "";
                        foreach (Match m in dentro)
                        {
                            Persona p = new Persona();
                            p.Email = m.Value.ToLowerInvariant();
                            p.Nome = nome;
                            p.Ruolo = ruoloCorrente;
                            fuori.Add(p);
                            nome = "";
                        }
                    }
                    continue;
                }

                string[] pezzi = riga.Split(new char[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string pezzo in pezzi)
                {
                    string nome = PulisciNome(pezzo);
                    if (nome.Length < 3) continue;
                    if (!Regex.IsMatch(nome, @"\p{L}")) continue;
                    Persona p = new Persona();
                    p.Nome = nome;
                    p.Ruolo = ruoloCorrente;
                    fuori.Add(p);
                }
            }

            foreach (Persona p in fuori)
            {
                if (p.Ruolo == "") p.Ruolo = "Non specificato";
                p.Incluso = !RuoloDaEscludere(p.Ruolo);
            }
            return fuori;
        }

        static bool RuoloDaEscludere(string ruolo)
        {
            string r = ruolo.ToLowerInvariant();
            return r.Contains("studen") || r.Contains("alunn") || r.Contains("genitor") ||
                   r.Contains("famigli") || r.Contains("tutor legale");
        }

        static string PulisciNome(string s)
        {
            s = Regex.Replace(s ?? "", @"[<>""]", " ");
            s = Regex.Replace(s, @"\s+", " ").Trim();
            return s.Trim(' ', '-', ':', ',', ';', '.');
        }

        static string Titolizza(string s)
        {
            s = Regex.Replace(s ?? "", @"\s+", " ").Trim();
            if (s.Length == 0) return "";
            if (s == s.ToUpperInvariant())
                s = CultureInfo.GetCultureInfo("it-IT").TextInfo.ToTitleCase(s.ToLowerInvariant());
            return s;
        }

        void AggiornaPersonale() { AggiornaGriglia(); AggiornaRuoli(); AggiornaConteggio(); }

        void AggiornaGriglia()
        {
            griglia.CellValueChanged -= GrigliaModificata;
            griglia.Rows.Clear();
            foreach (Persona p in S.Personale)
                griglia.Rows.Add(p.Incluso, p.Nome, p.Ruolo, p.Email);
            griglia.CellValueChanged += GrigliaModificata;
        }

        void GrigliaModificata(object mittente, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0 || e.RowIndex >= S.Personale.Count) return;
            Persona p = S.Personale[e.RowIndex];
            DataGridViewRow r = griglia.Rows[e.RowIndex];
            p.Incluso = Convert.ToBoolean(r.Cells[0].Value ?? false);
            p.Nome = Convert.ToString(r.Cells[1].Value ?? "");
            p.Ruolo = Convert.ToString(r.Cells[2].Value ?? "");
            p.Email = Convert.ToString(r.Cells[3].Value ?? "").Trim().ToLowerInvariant();
            if (e.ColumnIndex == 0 || e.ColumnIndex == 2) AggiornaRuoli();
            AggiornaConteggio();
        }

        void AggiornaRuoli()
        {
            aggiornandoRuoli = true;
            clbRuoli.Items.Clear();
            Dictionary<string, int> totali = new Dictionary<string, int>();
            Dictionary<string, int> inclusi = new Dictionary<string, int>();
            List<string> ordine = new List<string>();
            foreach (Persona p in S.Personale)
            {
                string r = (p.Ruolo == "") ? "Non specificato" : p.Ruolo;
                if (!totali.ContainsKey(r)) { totali[r] = 0; inclusi[r] = 0; ordine.Add(r); }
                totali[r]++;
                if (p.Incluso) inclusi[r]++;
            }
            ordine.Sort(StringComparer.CurrentCultureIgnoreCase);
            foreach (string r in ordine) clbRuoli.Items.Add(r + "  (" + totali[r] + ")", inclusi[r] > 0);
            aggiornandoRuoli = false;
        }

        void RuoloCambiato(object mittente, ItemCheckEventArgs e)
        {
            if (aggiornandoRuoli) return;
            string voce = Convert.ToString(clbRuoli.Items[e.Index]);
            int par = voce.LastIndexOf("  (");
            string ruolo = (par > 0) ? voce.Substring(0, par) : voce;
            bool valore = (e.NewValue == CheckState.Checked);
            foreach (Persona p in S.Personale)
            {
                string r = (p.Ruolo == "") ? "Non specificato" : p.Ruolo;
                if (string.Equals(r, ruolo, StringComparison.CurrentCultureIgnoreCase)) p.Incluso = valore;
            }
            BeginInvoke((MethodInvoker)delegate { AggiornaGriglia(); AggiornaConteggio(); });
        }

        void AggiornaConteggio()
        {
            int inclusi = 0, conMail = 0;
            foreach (Persona p in S.Personale)
            {
                if (!p.Incluso) continue;
                inclusi++;
                if (p.Email != "") conMail++;
            }
            lblConteggio.Text = S.Personale.Count == 0
                ? "Nessuna persona caricata"
                : "In elenco: " + S.Personale.Count + "   ·   da usare: " + inclusi +
                  "   ·   con indirizzo: " + conMail +
                  (conMail < inclusi ? "   ·   mancano " + (inclusi - conMail) + " indirizzi" : "");
            lblConteggio.Tag = (conMail < inclusi && inclusi > 0) ? Ruolo.Avviso : Ruolo.Normale;
            Tema.Applica(lblConteggio);
        }

        void GeneraEmail()
        {
            string dominio = (txtDominio.Text ?? "").Trim().TrimStart('@').ToLowerInvariant();
            if (dominio == "")
            {
                MessageBox.Show(this, "Prima scrivi il dominio della scuola nel passo 2.",
                    "Manca il dominio", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            string schema = cmbSchema.Text.Trim();
            if (schema == "") schema = "{nome}.{cognome}";
            bool cognomePrima = (cmbOrdine.SelectedIndex == 0);

            int quanti = 0, senzaNome = 0;
            foreach (Persona p in S.Personale)
            {
                if (!p.Incluso || p.Email != "") continue;
                string mail = ComponiEmail(p.Nome, schema, cognomePrima, dominio);
                if (mail == "") { senzaNome++; continue; }
                p.Email = mail;
                quanti++;
            }
            AggiornaPersonale();
            Guscio.Stato1("Generati " + quanti + " indirizzi." +
                (senzaNome > 0 ? "  " + senzaNome + " righe senza nome utilizzabile." : "") +
                "  Controllali nella tabella.");
        }

        public static string ComponiEmail(string nominativo, string schema, bool cognomePrima, string dominio)
        {
            string[] parole = (nominativo ?? "").Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parole.Length == 0) return "";

            string nome, cognome;
            if (parole.Length == 1) { cognome = parole[0]; nome = ""; }
            else if (cognomePrima)
            {
                nome = parole[parole.Length - 1];
                cognome = string.Join("", parole, 0, parole.Length - 1);
            }
            else
            {
                nome = parole[0];
                cognome = string.Join("", parole, 1, parole.Length - 1);
            }

            nome = Stato.Chiave(nome);
            cognome = Stato.Chiave(cognome);
            if (cognome == "") return "";

            string s = schema
                .Replace("{nome}", nome)
                .Replace("{cognome}", cognome)
                .Replace("{n}", nome.Length > 0 ? nome.Substring(0, 1) : "")
                .Replace("{c}", cognome.Length > 0 ? cognome.Substring(0, 1) : "");
            s = Regex.Replace(s, @"^\.|\.$", "");
            s = Regex.Replace(s, @"\.\.+", ".");
            return (s == "") ? "" : s + "@" + dominio;
        }

        void TogliSelezionate()
        {
            List<int> indici = new List<int>();
            foreach (DataGridViewRow r in griglia.SelectedRows)
                if (r.Index >= 0 && r.Index < S.Personale.Count) indici.Add(r.Index);
            if (indici.Count == 0)
            {
                MessageBox.Show(this, "Seleziona prima una o piu' righe (clic sulla riga).",
                    "Nessuna riga selezionata", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            indici.Sort();
            for (int i = indici.Count - 1; i >= 0; i--) S.Personale.RemoveAt(indici[i]);
            AggiornaPersonale();
            Guscio.Stato1("Tolte " + indici.Count + " righe.");
        }

        void Svuota()
        {
            if (S.Personale.Count == 0) return;
            if (MessageBox.Show(this, "Vuoi svuotare tutto l'elenco del personale?",
                    "Conferma", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            S.Personale.Clear();
            AggiornaPersonale();
            Guscio.Stato1("Elenco svuotato.");
        }

        void EsportaCsv()
        {
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.Filter = "File CSV (*.csv)|*.csv";
                d.FileName = "personale.csv";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("NOMINATIVO;RUOLO;EMAIL;USATO");
                foreach (Persona p in S.Personale)
                    sb.AppendLine("\"" + p.Nome.Replace("\"", "\"\"") + "\";\"" +
                                  p.Ruolo.Replace("\"", "\"\"") + "\";\"" +
                                  p.Email.Replace("\"", "\"\"") + "\";" + (p.Incluso ? "si" : "no"));
                File.WriteAllText(d.FileName, sb.ToString(), new UTF8Encoding(true));
                Guscio.Stato1("Salvato: " + d.FileName);
            }
        }

        void GuidaSpaggiari()
        {
            string guida =
                "COME PRENDERE L'ELENCO DA SPAGGIARI\n\n" +
                "Due strade. La piu' comoda e' l'estensione per Chrome (pulsante\n" +
                "\"Estensione...\"): una volta installata, basta un clic sulla pagina\n" +
                "del personale. Questa e' la strada senza estensione, dalla Console:\n\n" +
                "1.  Entra in Spaggiari (ClasseViva) con il tuo account.\n" +
                "2.  Clic sull'icona del profilo, in alto a destra.\n" +
                "3.  Scegli \"Network\", poi \"Tutto il personale\".\n" +
                "4.  Tasto destro in un punto qualsiasi della pagina, poi\n" +
                "    \"Ispeziona\" (in alcuni browser si chiama \"Esamina\").\n" +
                "5.  Nel riquadro che si apre scegli la scheda \"Console\".\n" +
                "6.  Premi il pulsante qui sotto per copiare la funzione,\n" +
                "    poi torna nella Console, incolla con Ctrl+V e premi Invio.\n" +
                "7.  Aspetta qualche secondo: la funzione scorre la pagina, legge\n" +
                "    tutti i nominativi e li copia negli appunti.\n" +
                "8.  Torna qui e premi \"Incolla elenco\".\n\n" +
                "Se il browser chiede di scrivere \"consentimi\" (o \"allow pasting\")\n" +
                "prima di poter incollare nella Console, scrivilo e premi Invio:\n" +
                "e' una protezione di Chrome, va fatto una volta sola.";
            using (FormTesto f = new FormTesto("Elenco da Spaggiari", guida,
                       "Copia la funzione per la Console", FunzioneSpaggiari()))
                f.ShowDialog(this);
        }

        /// <summary>
        /// Scrive su disco l'estensione per Chrome che legge l'elenco del
        /// personale da Spaggiari: stessi file di una estensione "scompattata",
        /// da caricare una volta da chrome://extensions. Sta dentro
        /// l'eseguibile, quindi si rigenera quando serve e non c'e' niente da
        /// scaricare.
        /// </summary>
        void CreaEstensione()
        {
            string radice = Path.Combine((S.Drive ?? "").Trim().TrimEnd('\\'), "Estensioni");
            using (FolderBrowserDialog d = new FolderBrowserDialog())
            {
                d.Description = "Dove creare la cartella dell'estensione (" + CartellaEstensione + ")";
                if (Directory.Exists(radice)) d.SelectedPath = radice;
                else if (Directory.Exists(S.Drive)) d.SelectedPath = S.Drive;
                if (d.ShowDialog(this) != DialogResult.OK) return;
                radice = d.SelectedPath;
            }

            string cartella = Path.Combine(radice, CartellaEstensione);
            string[] file = { "manifest.json", "popup.html", "popup.js" };
            try
            {
                Directory.CreateDirectory(cartella);
                foreach (string f in file)
                {
                    string testo = Guscio.LeggiRisorsa("estensione_" + f);
                    if (testo == "") throw new Exception("manca la risorsa " + f + ": ricompila l'applicazione");
                    File.WriteAllText(Path.Combine(cartella, f), testo, new UTF8Encoding(false));
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Non sono riuscito a creare l'estensione:\n\n" + ex.Message,
                    "Errore", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string guida =
                "ESTENSIONE CREATA IN\n" + cartella + "\n\n" +
                "COME INSTALLARLA IN CHROME (una volta sola)\n\n" +
                "1.  Apri Chrome e vai su  chrome://extensions  (scrivilo nella barra\n" +
                "    degli indirizzi). Vale anche per Edge: edge://extensions.\n" +
                "2.  In alto a destra accendi \"Modalita' sviluppatore\".\n" +
                "3.  Premi \"Carica estensione non pacchettizzata\" e scegli la\n" +
                "    cartella qui sopra.\n" +
                "4.  Compare \"Estrattore personale (Campanella)\": tienila.\n\n" +
                "COME USARLA\n\n" +
                "1.  Entra in Spaggiari: profilo -> Network -> Tutto il personale.\n" +
                "2.  Premi l'icona dell'estensione (il pezzo di puzzle in alto a\n" +
                "    destra, poi \"Estrattore personale\").\n" +
                "3.  Scorre la pagina da sola, legge nominativi, ruoli e indirizzi e\n" +
                "    li mostra: premi \"Copia\", torna qui e premi \"Incolla elenco\".\n\n" +
                "L'estensione legge solo quello che vedi gia' tu sullo schermo, non\n" +
                "manda niente a nessuno e non ha bisogno del Web Store. Se la\n" +
                "cartella sta nel Drive, la ritrovi uguale su tutti i computer\n" +
                "(su ognuno va caricata una volta da chrome://extensions).\n\n" +
                "Le condizioni d'uso di ClasseViva non vietano gli script, ma vietano\n" +
                "di scaricare e riformattare i contenuti della piattaforma senza\n" +
                "permesso: usala una volta, per il tuo elenco, non in modo sistematico.\n" +
                "Se preferisci non avere il dubbio, chiedi l'elenco in segreteria.";
            using (FormTesto f = new FormTesto("Estensione per Chrome", guida,
                       "Apri la cartella dell'estensione", null))
            {
                f.ShowDialog(this);
            }
            Guscio.Apri(cartella);
            Guscio.Stato1("Estensione scritta in " + cartella);
        }

        void GuidaCasella()
        {
            string guida =
                "COME FARE DIRE A GMAIL CHI TI SCRIVE\n\n" +
                "Questo e' il metodo piu' preciso: gli indirizzi non vengono\n" +
                "indovinati, ma letti dai messaggi che hai gia' ricevuto.\n\n" +
                "1.  Completa prima i passi 4, 5 e 6 dell'installazione guidata\n" +
                "    (serve lo script gia' installato e autorizzato).\n" +
                "2.  Nell'editor scegli la funzione  EXTRA_elencaIndirizziScuola\n" +
                "    e premi Esegui.\n" +
                "3.  Dopo qualche minuto ricevi una email da te stesso con\n" +
                "    l'oggetto \"[Organizzazione Gmail] Indirizzi ...\".\n" +
                "4.  Apri quella email, seleziona l'elenco e copialo.\n" +
                "5.  Torna qui e premi \"Incolla elenco\".\n\n" +
                "Nell'elenco ci sono anche gli studenti: qui nella tabella togli\n" +
                "la spunta a chi non e' personale, oppure usa i ruoli a sinistra.";
            using (FormTesto f = new FormTesto("Indirizzi dalla casella", guida, null, null))
                f.ShowDialog(this);
        }

        // ===================================================================
        //  REGOLE
        // ===================================================================
        void AggiornaElencoRegole(int selezione)
        {
            clbRegole.Items.Clear();
            string prefisso = S.PrefissoPulito();
            foreach (Regola r in S.Regole)
            {
                string nome = (prefisso == "" ? "" : prefisso + "/") + r.Etichetta;
                if (r.Archivia) nome += "    (archivia)";
                clbRegole.Items.Add(nome, r.Attiva);
            }
            if (selezione >= 0 && selezione < clbRegole.Items.Count) clbRegole.SelectedIndex = selezione;
            else if (clbRegole.Items.Count > 0) clbRegole.SelectedIndex = 0;
            MostraDescrizioneRegola();
        }

        void MostraDescrizioneRegola()
        {
            int i = clbRegole.SelectedIndex;
            if (i < 0 || i >= S.Regole.Count) { txtDescrizioneRegola.Text = ""; return; }
            Regola r = S.Regole[i];

            StringBuilder sb = new StringBuilder();
            sb.AppendLine(r.Descrizione);
            sb.AppendLine();
            List<string> mittenti = MittentiDellaRegola(r);
            if (mittenti.Count > 0)
            {
                string elenco = string.Join(", ", mittenti.ToArray());
                if (elenco.Length > 150) elenco = elenco.Substring(0, 150) + "...";
                sb.AppendLine("Mittenti: " + elenco);
            }
            if (r.Oggetto.Count > 0) sb.AppendLine("Oggetto contiene: " + string.Join(", ", r.Oggetto.ToArray()));
            if (r.QueryLibera != "") sb.AppendLine("Ricerca: " + r.QueryLibera);

            txtDescrizioneRegola.Text = sb.ToString();
            txtDescrizioneRegola.Select(0, 0);
            chkArchiviaRegola.Checked = r.Archivia;
        }

        List<string> MittentiDellaRegola(Regola r)
        {
            List<string> m = new List<string>();
            if (r.Sorgente == "dirigenza") m.AddRange(Righe(txtDirigenza.Text));
            else if (r.Sorgente == "segreteria") m.AddRange(Righe(txtSegreteria.Text));
            else if (r.Sorgente == "registro") m.AddRange(Righe(txtRegistro.Text));
            else
            {
                foreach (string s in r.Da)
                {
                    if (s == "@PERSONALE@") m.Add("(l'elenco del passo 3: " + S.IndirizziPersonale().Count + " indirizzi)");
                    else if (s == "@DOMINIO@") m.Add("@" + (txtDominio.Text ?? "").Trim().TrimStart('@'));
                    else m.Add(s);
                }
            }
            return m;
        }

        void SpostaRegola(int direzione)
        {
            int i = clbRegole.SelectedIndex;
            int j = i + direzione;
            if (i < 0 || j < 0 || j >= S.Regole.Count) return;
            Regola tmp = S.Regole[i]; S.Regole[i] = S.Regole[j]; S.Regole[j] = tmp;
            AggiornaElencoRegole(j);
        }

        void AggiungiRegola()
        {
            using (FormRegola f = new FormRegola(null))
            {
                if (f.ShowDialog(this) != DialogResult.OK) return;
                S.Regole.Add(f.Risultato);
                AggiornaElencoRegole(S.Regole.Count - 1);
                Guscio.Stato1("Regola aggiunta.");
            }
        }

        void ModificaRegola()
        {
            int i = clbRegole.SelectedIndex;
            if (i < 0 || i >= S.Regole.Count) return;
            using (FormRegola f = new FormRegola(S.Regole[i]))
            {
                if (f.ShowDialog(this) != DialogResult.OK) return;
                if (f.Elimina)
                {
                    S.Regole.RemoveAt(i);
                    AggiornaElencoRegole(Math.Min(i, S.Regole.Count - 1));
                    Guscio.Stato1("Regola eliminata.");
                    return;
                }
                S.Regole[i] = f.Risultato;
                AggiornaElencoRegole(i);
                Guscio.Stato1("Regola aggiornata.");
            }
        }

        void LeggiSpunteRegole()
        {
            for (int i = 0; i < S.Regole.Count && i < clbRegole.Items.Count; i++)
                S.Regole[i].Attiva = clbRegole.GetItemChecked(i);
        }

        // ===================================================================
        //  GENERAZIONE
        // ===================================================================
        static List<string> Righe(string testo)
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

        static string Js(string s)
        {
            return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"")
                            .Replace("\r", "").Replace("\n", "\\n");
        }

        static string ListaJs(List<string> valori)
        {
            if (valori.Count == 0) return "[]";
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < valori.Count; i++)
            {
                if (i > 0) sb.Append(", ");
                sb.Append("\"").Append(Js(valori[i])).Append("\"");
            }
            return sb.Append("]").ToString();
        }

        static string SoloUnaRiga(string s) { return Regex.Replace(s ?? "", @"\s+", " ").Trim(); }

        public string GeneraConfigurazione() { return GeneraConfigurazione(chkProva.Checked); }

        public string GeneraConfigurazione(bool prova)
        {
            Raccogli();
            List<string> indirizzi = S.IndirizziPersonale();
            int mesi = 0;
            if (cmbPeriodo.SelectedIndex == 1) mesi = 12;
            else if (cmbPeriodo.SelectedIndex == 2) mesi = 24;
            else if (cmbPeriodo.SelectedIndex == 3) mesi = 36;

            StringBuilder sb = new StringBuilder();
            sb.AppendLine("/* =========================================================================");
            sb.AppendLine("   CONFIGURAZIONE DI \"ORGANIZZAZIONE GMAIL\"");
            sb.AppendLine("   Generata il " + DateTime.Now.ToString("dd/MM/yyyy HH:mm") +
                          " dall'applicazione Campanella.");
            sb.AppendLine();
            sb.AppendLine("   Puoi modificare i valori a mano: sono tutti scritti in chiaro.");
            sb.AppendLine("   Dopo ogni modifica salva con Ctrl+S.");
            sb.AppendLine("   ========================================================================= */");
            sb.AppendLine();
            sb.AppendLine("var CONFIG = {");
            sb.AppendLine();
            sb.AppendLine("  // ---- la tua scuola ---------------------------------------------------");
            sb.AppendLine("  dominioScuola:     \"" + Js(S.DominioPulito()) + "\",");
            sb.AppendLine("  prefissoEtichette: \"" + Js(S.PrefissoPulito()) + "\",");
            sb.AppendLine();
            sb.AppendLine("  // ---- come lavorare ---------------------------------------------------");
            sb.AppendLine("  provaSenzaModifiche: " + (prova ? "true" : "false") +
                          ",   // true = conta soltanto, non tocca niente");
            sb.AppendLine("  soloUltimiMesi:      " + mesi + ",       // 0 = tutta la posta");
            sb.AppendLine("  ogniQuanteOre:       " + (int)numOre.Value + ",");
            sb.AppendLine("  giorniPostaNuova:    3,");
            sb.AppendLine("  inviaReport:         " + (chkReport.Checked ? "true" : "false") + ",");
            sb.AppendLine("  escludiPostaInviata: " + (chkEscludiInviata.Checked ? "true" : "false") + ",");
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
                foreach (Persona p in S.Personale)
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
                    string riga = "    \"" + Js(indirizzi[i]) + "\"" + virgola;
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
            sb.AppendLine();
            sb.AppendLine("  // ---- le regole, in ordine di priorita' -------------------------------");
            sb.AppendLine("  //  @PERSONALE@ = l'elenco qui sopra   ·   @DOMINIO@ = tutto il dominio");
            sb.AppendLine("  regole: [");

            for (int i = 0; i < S.Regole.Count; i++)
            {
                Regola r = S.Regole[i];
                List<string> da;
                if (r.Sorgente == "dirigenza") da = Righe(S.Dirigenza);
                else if (r.Sorgente == "segreteria") da = Righe(S.Segreteria);
                else if (r.Sorgente == "registro") da = Righe(S.Registro);
                else da = new List<string>(r.Da);

                bool inutile = da.Count == 0 && r.Oggetto.Count == 0 &&
                               r.Contiene.Count == 0 && r.QueryLibera == "";
                bool attiva = r.Attiva && !inutile;
                if (da.Count == 1 && da[0] == "@DOMINIO@" && S.DominioPulito() == "") attiva = false;

                sb.AppendLine("    {");
                sb.AppendLine("      attiva:    " + (attiva ? "true" : "false") + ",");
                sb.AppendLine("      etichetta: \"" + Js(r.Etichetta) + "\",");
                if (da.Count > 0) sb.AppendLine("      da:        " + ListaJs(da) + ",");
                if (r.Oggetto.Count > 0) sb.AppendLine("      oggetto:   " + ListaJs(r.Oggetto) + ",");
                if (r.Contiene.Count > 0) sb.AppendLine("      contiene:  " + ListaJs(r.Contiene) + ",");
                if (r.QueryLibera != "") sb.AppendLine("      queryLibera: \"" + Js(r.QueryLibera) + "\",");
                if (r.EscludiEtichette.Count > 0)
                    sb.AppendLine("      escludiEtichette: " + ListaJs(r.EscludiEtichette) + ",");
                if (r.Archivia) sb.AppendLine("      archivia:  true,");
                if (r.SegnaComeLette) sb.AppendLine("      segnaComeLette: true,");
                sb.AppendLine("      nota:      \"" + Js(SoloUnaRiga(r.Descrizione)) + "\"");
                sb.AppendLine("    }" + (i < S.Regole.Count - 1 ? "," : ""));
            }
            sb.AppendLine("  ]");
            sb.AppendLine("};");
            return sb.ToString();
        }

        string RiepilogoEtichette()
        {
            Raccogli();
            StringBuilder sb = new StringBuilder();
            string prefisso = S.PrefissoPulito();
            sb.AppendLine("ETICHETTE CHE VERRANNO CREATE IN GMAIL");
            sb.AppendLine("======================================");
            sb.AppendLine();
            if (prefisso != "") { sb.AppendLine(prefisso); sb.AppendLine("  |"); }
            int n = 0;
            foreach (Regola r in S.Regole)
            {
                if (!r.Attiva) continue;
                n++;
                sb.AppendLine((prefisso != "" ? "  +-- " : "") + r.Etichetta +
                              (r.Archivia ? "      (i messaggi escono dalla Posta in arrivo)" : ""));
            }
            if (n == 0) sb.AppendLine("  (nessuna regola attiva: torna al passo 4)");
            sb.AppendLine();
            sb.AppendLine();
            sb.AppendLine("RIEPILOGO DELLE IMPOSTAZIONI");
            sb.AppendLine("============================");
            sb.AppendLine();
            sb.AppendLine("Dominio della scuola ......... " +
                          (S.DominioPulito() == "" ? "(non impostato)" : S.DominioPulito()));
            sb.AppendLine("Persone in elenco ............ " + S.IndirizziPersonale().Count);
            sb.AppendLine("Regole attive ................ " + n + " su " + S.Regole.Count);
            sb.AppendLine("Modalita' prova .............. " + (S.Prova ? "SI (non modifica niente)" : "no"));
            sb.AppendLine("Posta da esaminare ........... " + cmbPeriodo.Text);
            sb.AppendLine("Controllo posta nuova ........ ogni " + S.Ore + " ora/e");
            sb.AppendLine("Filtri veri di Gmail ......... " + (S.Filtri ? "si (passo 8)" : "no"));
            sb.AppendLine();

            List<string> avvisi = new List<string>();
            if (S.DominioPulito() == "") avvisi.Add("Manca il dominio della scuola (passo 2).");
            if (S.IndirizziPersonale().Count == 0)
                avvisi.Add("L'elenco del personale e' vuoto (passo 3): colleghi e studenti " +
                           "non potranno essere distinti.");
            int senzaMail = 0;
            foreach (Persona p in S.Personale) if (p.Incluso && p.Email == "") senzaMail++;
            if (senzaMail > 0)
                avvisi.Add(senzaMail + " persone dell'elenco non hanno un indirizzo: verranno ignorate.");

            if (avvisi.Count > 0)
            {
                sb.AppendLine("DA SISTEMARE");
                sb.AppendLine("============");
                foreach (string a in avvisi) sb.AppendLine("  - " + a);
            }
            else sb.AppendLine("Tutto pronto: vai al passo 6.");
            return sb.ToString();
        }

        public static string CodicePrincipale()
        {
            string s = Guscio.LeggiRisorsa("Organizzazione_Gmail.gs");
            return (s != "") ? s : "// Risorsa non trovata: ricompila l'applicazione.";
        }

        public static string FunzioneSpaggiari()
        {
            string s = Guscio.LeggiRisorsa("estrai_personale_spaggiari.js");
            return (s != "") ? s : "// Risorsa non trovata: ricompila l'applicazione.";
        }

        string TestoCorrente()
        {
            switch (cmbCosaVedere.SelectedIndex)
            {
                case 0: return CodicePrincipale();
                case 1: return GeneraConfigurazione();
                case 2: return FunzioneSpaggiari();
                default: return RiepilogoEtichette();
            }
        }

        string MessaggioCopia()
        {
            switch (cmbCosaVedere.SelectedIndex)
            {
                case 0: return "Codice principale copiato. Incollalo in Codice.gs.";
                case 1: return "Configurazione copiata. Incollala in Configurazione.gs.";
                case 2: return "Funzione copiata. Incollala nella Console del browser.";
                default: return "Riepilogo copiato.";
            }
        }

        void AggiornaAnteprima()
        {
            txtAnteprima.Text = TestoCorrente().Replace("\r\n", "\n").Replace("\n", "\r\n");
            txtAnteprima.Select(0, 0);
        }

        void SalvaAnteprima()
        {
            string nomeFile, filtro;
            switch (cmbCosaVedere.SelectedIndex)
            {
                case 0: nomeFile = "Organizzazione_Gmail.gs"; filtro = "Script Google (*.gs)|*.gs"; break;
                case 1: nomeFile = "Configurazione.gs"; filtro = "Script Google (*.gs)|*.gs"; break;
                case 2: nomeFile = "estrai_personale_spaggiari.js"; filtro = "JavaScript (*.js)|*.js"; break;
                default: nomeFile = "riepilogo_etichette.txt"; filtro = "Testo (*.txt)|*.txt"; break;
            }
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.FileName = nomeFile;
                d.Filter = filtro + "|Tutti i file (*.*)|*.*";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                File.WriteAllText(d.FileName, TestoCorrente(), new UTF8Encoding(false));
                Guscio.Stato1("Salvato: " + d.FileName);
            }
        }

        void SalvaTutto()
        {
            using (FolderBrowserDialog d = new FolderBrowserDialog())
            {
                d.Description = "Scegli dove salvare tutti i file";
                string proposta = Path.Combine((S.Drive ?? "").TrimEnd('\\'), "Campanella");
                if (Directory.Exists(proposta)) d.SelectedPath = proposta;
                else if (Directory.Exists(S.Drive)) d.SelectedPath = S.Drive;
                if (d.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    UTF8Encoding utf8 = new UTF8Encoding(false);
                    File.WriteAllText(Path.Combine(d.SelectedPath, "Organizzazione_Gmail.gs"), CodicePrincipale(), utf8);
                    File.WriteAllText(Path.Combine(d.SelectedPath, "Configurazione.gs"), GeneraConfigurazione(), utf8);
                    File.WriteAllText(Path.Combine(d.SelectedPath, "estrai_personale_spaggiari.js"), FunzioneSpaggiari(), utf8);
                    File.WriteAllText(Path.Combine(d.SelectedPath, "riepilogo_etichette.txt"), RiepilogoEtichette(), utf8);
                    Guscio.Stato1("Salvati 4 file in " + d.SelectedPath);
                    Guscio.Apri(d.SelectedPath);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, "Non sono riuscito a salvare:\n\n" + ex.Message,
                        "Errore", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        void ApriProgetto()
        {
            // Drive per desktop mostra i progetti Apps Script come file .gscript
            string drive = (S.Drive ?? "").TrimEnd('\\');
            try
            {
                if (Directory.Exists(drive))
                {
                    string[] progetti = Directory.GetFiles(drive, "*.gscript", SearchOption.TopDirectoryOnly);
                    foreach (string g in progetti)
                        if (Path.GetFileNameWithoutExtension(g).IndexOf("Organizzazione Gmail",
                                StringComparison.OrdinalIgnoreCase) >= 0)
                        { Guscio.Apri(g); return; }
                    if (progetti.Length == 1) { Guscio.Apri(progetti[0]); return; }
                }
            }
            catch { }
            Guscio.Apri("https://drive.google.com/");
        }
    }
}
