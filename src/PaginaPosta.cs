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

        CheckBox chkRuoliEtichette;
        ComboBox cmbGruppo;
        Label lblGruppo;

        CheckedListBox clbRegole;
        TextBox txtPrefisso;
        Label lblPrefisso;
        bool zitto = false;
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
            zitto = true;
            try { txtPrefisso.Text = S.Prefisso; } finally { zitto = false; }
            txtDominio.Text = S.Dominio;
            txtDirigenza.Text = S.Dirigenza;
            txtSegreteria.Text = S.Segreteria;
            txtRegistro.Text = S.Registro;
            cmbSchema.Text = S.SchemaEmail;
            if (S.OrdineNominativo >= 0 && S.OrdineNominativo < cmbOrdine.Items.Count)
                cmbOrdine.SelectedIndex = S.OrdineNominativo;
            chkRuoliEtichette.Checked = S.EtichettaPerRuolo;
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
            AggiornaAvvisoPrefisso();
        }

        /// <summary>
        /// Spiega cosa cambia nel raggruppare le etichette. Senza gruppo lo script
        /// usa i nomi cosi' come sono: se in Gmail ci sono gia' etichette con quei
        /// nomi, applica quelle, e ANNULLA_etichettatura non le svuota, perche' non
        /// saprebbe distinguerle dai messaggi a cui le avevi messe tu.
        /// </summary>
        void AggiornaAvvisoPrefisso()
        {
            if (lblPrefisso == null) return;
            string pre = S.PrefissoPulito();
            if (pre != "")
            {
                lblPrefisso.Text = "Tutte dentro \"" + pre + "\": " + pre + "/Circolari, " + pre + "/Colleghi...";
                lblPrefisso.Tag = Ruolo.Tenue;
            }
            else
            {
                lblPrefisso.Text = "Etichette dirette: Circolari, Colleghi... Le tue con lo stesso nome vengono riempite.";
                lblPrefisso.Tag = Ruolo.Tenue;
            }
            Tema.Applica(lblPrefisso);
        }

        void Raccogli()
        {
            S.Prefisso = txtPrefisso.Text;
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
            // al passo "La tua scuola" di questa pagina, dovunque stia nel menu
            p.Controls.Add(Tema.BottonePrincipale("Cominciamo  >", 0, y + 6, 180,
                delegate { Guscio.VaiAPagina(this, 1); }));
            return p;
        }

        // ===================================================================
        //  PASSO 2
        // ===================================================================
        Panel PaginaScuola()
        {
            Panel p = NuovaPagina("La tua scuola");
            int y = 54;

            Tema.RigaAiuto(p, "Serve il dominio della scuola e qualche indirizzo.",
                0, y, Tema.Normale, Ruolo.Tenue, "Se non sai cosa mettere",
                "Lascia vuoto il campo: le regole che lo usano verranno semplicemente " +
                "saltate, e le altre funzionano lo stesso.\r\n\r\n" +
                "Il tuo indirizzo non serve da nessuna parte: lo script gira dentro il tuo " +
                "account e lo sa da solo.");
            y += 40;

            p.Controls.Add(Tema.Testo1("Dominio della scuola", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtDominio = Tema.Casella(0, y + 22, 340, "per esempio  liceoxyz.edu.it");
            p.Controls.Add(txtDominio);
            p.Controls.Add(Tema.Testo1(
                "La parte dopo la chiocciola degli indirizzi della scuola.",
                356, y + 26, 500, Tema.Piccolo, Ruolo.Tenue));
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

            Tema.RigaAiuto(p, "Registro elettronico", 0, y, Tema.Normale, Ruolo.Tenue,
                "Come si scrivono gli indirizzi",
                "Puoi scrivere un indirizzo intero (preside@scuola.it) oppure solo un dominio " +
                "preceduto dalla chiocciola (@spaggiari.eu).\r\n\r\n" +
                "Con il dominio la regola vale per tutti gli indirizzi di quel dominio: comodo " +
                "per il registro elettronico, che scrive da mittenti sempre diversi.\r\n\r\n" +
                "Vale per tutte e tre le caselle di questa pagina.");
            txtRegistro = Tema.CasellaMulti(0, y + 20, 300, 50, "@spaggiari.eu");
            p.Controls.Add(txtRegistro);
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
                "dominio. Le righe senza spunta non vanno nello script ma restano salvate: quelle " +
                "che non servono toglile con \"Togli le righe senza spunta\".",
                0, y, 860, Tema.Normale, Ruolo.Tenue));
            y += 40;

            GroupBox g = Tema.Gruppo("Da dove prendo gli indirizzi", 0, y, 900, 116);
            g.Controls.Add(Tema.Testo1("A) Ce li ho gia'", 14, 26, 210, Tema.Grassetto, Ruolo.Normale));
            g.Controls.Add(Tema.Testo1("Indirizzi presi dalla rubrica o da una mail al gruppo docenti.",
                                       14, 46, 215, Tema.Piccolo, Ruolo.Tenue));
            g.Controls.Add(Tema.Bottone("Incolla elenco", 14, 76, 150, delegate { IncollaElenco(); }));

            g.Controls.Add(Tema.Testo1("B) Da ClasseViva (solo Spaggiari)", 246, 26, 240, Tema.Grassetto, Ruolo.Normale));
            g.Controls.Add(Tema.Testo1("Nomi e ruoli da \"Tutto il personale\". Altri registri: usa A o C.",
                                       246, 46, 240, Tema.Piccolo, Ruolo.Tenue));
            g.Controls.Add(Tema.Bottone("Come si fa...", 246, 76, 118, delegate { GuidaSpaggiari(); }));
            g.Controls.Add(Tema.Bottone("Estensione...", 370, 76, 118, delegate { CreaEstensione(); }));

            g.Controls.Add(Tema.Testo1("C) Dalla tua casella", 500, 26, 250, Tema.Grassetto, Ruolo.Normale));
            g.Controls.Add(Tema.Testo1("Lo script legge i mittenti del dominio: indirizzi certi.",
                                       500, 46, 250, Tema.Piccolo, Ruolo.Tenue));
            g.Controls.Add(Tema.Bottone("Come si fa...", 500, 76, 130, delegate { GuidaCasella(); }));
            g.Controls.Add(Tema.Bottone("Controlla gli indirizzi...", 636, 76, 180,
                delegate { ControllaConLaCasella(); }));
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
            p.Controls.Add(Tema.Testo1("Studenti, genitori e indirizzi presi dalla casella senza ruolo " +
                                       "partono senza spunta.",
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
            griglia.Columns.AddRange(ColonnePersonale());

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
            // sotto la nota sulle righe che partono senza spunta: le toglie tutte,
            // cosi' non restano nel file dei dati
            p.Controls.Add(Tema.Bottone("Togli le righe senza spunta", 0, ys + 27, 200,
                delegate { TogliRigheSenzaSpunta(); }));
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
                "Sono un'ipotesi: con \"Controlla gli indirizzi...\" li confronto con la tua casella.",
                266, ys + 58, 620, Tema.Piccolo, Ruolo.Avviso));

            // ---- i ruoli: in Gmail come sottoetichette, e qui come rubrica ----
            int yr = ys + 92;
            p.Controls.Add(Tema.Testo1("I ruoli", 0, yr, 0, Tema.Grassetto, Ruolo.Normale));
            yr += 26;
            chkRuoliEtichette = Tema.SpuntaAiuto(p,
                "In Gmail dividi i colleghi per ruolo", 0, yr,
                "Le sottoetichette dei ruoli",
                "Oltre a \"Colleghi\", lo script mette una sottoetichetta per categoria: " +
                "Colleghi/Docenti, Colleghi/Amministrativi, Colleghi/Tecnici, " +
                "Colleghi/Collaboratori, Colleghi/Dirigenza. Cosi' in Gmail vedi a colpo " +
                "d'occhio da che parte della scuola arriva un messaggio.\r\n\r\n" +
                "Le categorie nascono dai ruoli della tabella: i nomi lunghi del registro " +
                "(DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO, ASSISTENTE AMMINISTRATIVO, " +
                "DIRETTORE SGA...) si radunano in cinque.\r\n\r\n" +
                "Chi ha un ruolo che non riconosco resta sotto Colleghi e basta. " +
                "Le sottoetichette compaiono nel passo 5, dentro la configurazione.");
            chkRuoliEtichette.CheckedChanged += delegate
            {
                if (zitto) return;
                S.EtichettaPerRuolo = chkRuoliEtichette.Checked;
                AggiornaGruppi();
            };

            // la stessa divisione, all'incontrario: non chi mi ha scritto, ma a chi scrivo
            yr += 34;
            Label lblScrivi = Tema.Testo1("Scrivere a un gruppo:", 0, yr + 4, 0, Tema.Normale, Ruolo.Normale);
            p.Controls.Add(lblScrivi);
            int xg = TextRenderer.MeasureText(lblScrivi.Text, Tema.Normale).Width + 14;
            cmbGruppo = new ComboBox();
            cmbGruppo.Location = new Point(xg, yr);
            cmbGruppo.Width = 220;
            cmbGruppo.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbGruppo.Font = Tema.Normale;
            cmbGruppo.SelectedIndexChanged += delegate { AggiornaNotaGruppo(); };
            p.Controls.Add(cmbGruppo);
            p.Controls.Add(Tema.Bottone("Scrivi in Gmail", xg + 230, yr - 2, 140, delegate { ScriviAlGruppo(); }));
            p.Controls.Add(Tema.Bottone("Copia gli indirizzi", xg + 378, yr - 2, 150, delegate { CopiaGruppo(); }));
            p.Controls.Add(Tema.Aiuto(xg + 536, yr + 4, "Scrivere a un gruppo",
                "Serve quando devi mandare un messaggio a tutta una categoria: per esempio a " +
                "tutti gli assistenti amministrativi, senza andarli a cercare uno per uno.\r\n\r\n" +
                "\"Scrivi in Gmail\" mette gli indirizzi negli appunti e apre un messaggio nuovo: " +
                "in Gmail clicca \"Ccn\" (copia nascosta) e incolla con Ctrl+V. Scrivi e invii da " +
                "Gmail, come sempre. \"Copia gli indirizzi\" li mette solo negli appunti.\r\n\r\n" +
                "Gli indirizzi non passano dal collegamento che apre Gmail, che resterebbe nella " +
                "cronologia del browser. Negli appunti Campanella chiede a Windows di non tenerli " +
                "nella cronologia degli appunti (Win+V) e di non sincronizzarli con gli altri " +
                "dispositivi.\r\n\r\n" +
                "Prima di inviare guarda in alto a destra in Gmail che sia aperto l'account della " +
                "scuola: con piu' account nel browser, Gmail apre il primo.\r\n\r\n" +
                "Ccn e non A: cosi' ognuno riceve il messaggio senza vedere gli indirizzi degli " +
                "altri, che sono dati personali di colleghi.\r\n\r\n" +
                "Gli indirizzi sono quelli delle righe con la spunta: se togli qualcuno dalla " +
                "tabella, sparisce anche da qui. Campanella non manda niente da sola."));

            lblGruppo = Tema.Testo1("", 0, yr + 32, 880, Tema.Piccolo, Ruolo.Tenue);
            lblGruppo.Height = 20;
            p.Controls.Add(lblGruppo);
            return p;
        }

        // -------------------------------------------------------------------
        //  I GRUPPI PER RUOLO
        // -------------------------------------------------------------------
        void AggiornaGruppi()
        {
            Dictionary<string, List<string>> gruppi = S.GruppiPerRuolo();
            string scelto = Convert.ToString(cmbGruppo.SelectedItem ?? "");
            cmbGruppo.Items.Clear();
            foreach (string c in Stato.Categorie)
                if (gruppi.ContainsKey(c)) cmbGruppo.Items.Add(c + "  (" + gruppi[c].Count + ")");
            if (cmbGruppo.Items.Count > 0)
            {
                int i = cmbGruppo.Items.IndexOf(scelto);
                cmbGruppo.SelectedIndex = (i >= 0) ? i : 0;
            }
            AggiornaNotaGruppo();
        }

        string CategoriaScelta()
        {
            string s = Convert.ToString(cmbGruppo.SelectedItem ?? "");
            int p = s.IndexOf("  (");
            return (p > 0) ? s.Substring(0, p) : s;
        }

        void AggiornaNotaGruppo()
        {
            Dictionary<string, List<string>> gruppi = S.GruppiPerRuolo();
            if (gruppi.Count == 0)
            {
                lblGruppo.Text = "Nessun ruolo riconosciuto nell'elenco: le categorie nascono dalla " +
                                 "colonna \"Ruolo\" della tabella.";
                return;
            }
            List<string> pezzi = new List<string>();
            foreach (string c in Stato.Categorie)
                if (gruppi.ContainsKey(c)) pezzi.Add(c + " " + gruppi[c].Count);
            lblGruppo.Text = "Categorie: " + string.Join("  ·  ", pezzi.ToArray()) +
                (S.EtichettaPerRuolo ? "  ·  in Gmail diventano " + EtichettaColleghi() + "/<categoria>" : "");
        }

        /// <summary>Gli indirizzi della categoria scelta, o null (e l'ha gia' detto) se non ce ne sono.</summary>
        List<string> IndirizziDelGruppo()
        {
            string c = CategoriaScelta();
            Dictionary<string, List<string>> gruppi = S.GruppiPerRuolo();
            if (c == "" || !gruppi.ContainsKey(c))
            {
                MessageBox.Show(this,
                    "Non c'e' nessuna categoria da usare: nella tabella manca la colonna " +
                    "\"Ruolo\", oppure i ruoli non sono fra quelli che riconosco.",
                    "Nessun gruppo", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return null;
            }
            return gruppi[c];
        }

        void CopiaGruppo()
        {
            List<string> indirizzi = IndirizziDelGruppo();
            if (indirizzi == null) return;
            if (Appunti(string.Join(", ", indirizzi.ToArray())))
                Guscio.Stato1(indirizzi.Count + " indirizzi di " + CategoriaScelta() +
                              " copiati: incollali nel campo Ccn.");
        }

        /// <summary>
        /// Mette negli appunti gli indirizzi del gruppo e apre in Gmail un
        /// messaggio nuovo, dove li incolli nel Ccn. Gli indirizzi non passano
        /// dal collegamento: resterebbero nella cronologia del browser. Non
        /// manda niente: il messaggio lo scrivi e lo invii tu.
        /// </summary>
        void ScriviAlGruppo()
        {
            List<string> indirizzi = IndirizziDelGruppo();
            if (indirizzi == null) return;

            // con piu' account nel browser, quello della scuola: Gmail lo sceglie
            // dall'indirizzo, ma solo se e' davvero del dominio della scuola
            string account = AccountDellaScuola();
            string url = GeneratorePosta.NuovoMessaggioGmail(account);

            // senza l'account della scuola Gmail apre il primo account del browser,
            // che puo' essere quello personale: meglio dirlo prima dell'invio
            string mittente = (account != "") ? "" :
                "\n\nPrima di inviare guarda in alto a destra in Gmail che sia aperto l'account " +
                "della scuola" + (S.DominioPulito() != "" ? " (@" + S.DominioPulito() + ")" : "") +
                ": con piu' account nel browser, Gmail apre il primo.";
            if (!Appunti(string.Join(", ", indirizzi.ToArray()))) return;
            // prima l'avviso, poi il browser: aperto prima, Gmail passerebbe davanti
            // e l'avviso resterebbe nascosto dietro
            MessageBox.Show(this,
                "Ho copiato negli appunti i " + indirizzi.Count + " indirizzi di " + CategoriaScelta() + ".\n\n" +
                "Premi OK: si apre un messaggio nuovo in Gmail. Li' clicca \"Ccn\" (a destra del " +
                "campo A) e incolla con Ctrl+V: cosi' ognuno riceve il messaggio senza vedere gli " +
                "indirizzi degli altri." + mittente,
                "Incolla gli indirizzi nel Ccn", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Guscio.Apri(url);
            Guscio.Stato1(indirizzi.Count + " indirizzi negli appunti: in Gmail clicca Ccn e incolla con Ctrl+V.");
        }

        /// <summary>Negli appunti, fuori dalla cronologia degli appunti di Windows.</summary>
        bool Appunti(string testo)
        {
            try { Guscio.MettiNegliAppunti(testo); return true; }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Non riesco a copiare negli appunti: " + ex.Message,
                    "Appunti", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
        }

        /// <summary>L'account del Drive scelto, se e' della scuola; altrimenti "".</summary>
        string AccountDellaScuola()
        {
            string dominio = S.DominioPulito();
            if (dominio == "") return "";
            try
            {
                string drive = (S.Drive ?? "").Trim().TrimEnd('\\');
                foreach (DriveTrovato d in Stato.DriviPossibili())
                {
                    if (!string.Equals(d.Percorso.TrimEnd('\\'), drive, StringComparison.OrdinalIgnoreCase)) continue;
                    string a = (d.Account ?? "").Trim().ToLowerInvariant();
                    if (a.EndsWith("@" + dominio)) return a;
                }
            }
            catch { }
            return "";
        }

        // ===================================================================
        //  PASSO 4
        // ===================================================================
        Panel PaginaRegole()
        {
            Panel p = NuovaPagina("Regole ed etichette");
            int y = 52;

            Tema.RigaAiuto(p,
                "Ogni riga e' un'etichetta di Gmail: togli la spunta a quelle che non ti servono.",
                0, y, Tema.Normale, Ruolo.Tenue, "Come lavorano le regole",
                "Ogni regola cerca i suoi messaggi e ci mette la sua etichetta. Le etichette si " +
                "sommano: una circolare mandata dal dirigente prende sia Dirigenza sia Circolari, " +
                "e resta una conversazione sola.\r\n\r\n" +
                "L'ordine conta solo per le regole che escludono le altre. Studenti prende la " +
                "posta del dominio della scuola che non e' gia' finita in Colleghi, Dirigenza o " +
                "Segreteria: per saperlo quelle regole devono girare prima, e per questo " +
                "Studenti sta sotto. \"Su\" e \"Giu'\" servono a questo.\r\n\r\n" +
                "Le regole con \"Archivia\" (di partenza Sindacati e Newsletter) tolgono i " +
                "messaggi dalla Posta in arrivo: restano sotto la loro etichetta e in Tutti i " +
                "messaggi. Nessuna regola cancella niente.");
            y += 40;

            p.Controls.Add(Tema.Testo1("Raggruppa sotto", 0, y + 4, 0, Tema.Normale, Ruolo.Normale));
            txtPrefisso = Tema.Casella(150, y, 160, "vuoto: nomi diretti");
            txtPrefisso.TextChanged += delegate
            {
                if (zitto) return;
                S.Prefisso = txtPrefisso.Text;
                AggiornaElencoRegole(clbRegole.SelectedIndex);
                AggiornaAvvisoPrefisso();
            };
            p.Controls.Add(txtPrefisso);
            p.Controls.Add(Tema.Aiuto(320, y + 5, "Raggruppa sotto",
                "Dentro l'account della scuola tutta la posta e' di lavoro: bastano le etichette " +
                "con i nomi diretti (Circolari, Colleghi...). Quelle che hai gia' in Gmail con lo " +
                "stesso nome vengono riempite, non duplicate; se un nome ti va stretto, cambialo " +
                "con \"Modifica\" e lo script usera' la tua etichetta.\r\n\r\n" +
                "Scrivi un nome, per esempio Scuola, se questa casella e' personale e raccoglie " +
                "anche la posta della scuola: le etichette nascono tutte li' dentro " +
                "(Scuola/Circolari, Scuola/Colleghi...), restano separate dal resto e si tolgono " +
                "in un colpo solo.\r\n\r\n" +
                "Il prezzo dei nomi diretti: sulle etichette che avevi gia', ANNULLA_etichettatura " +
                "non puo' distinguere i messaggi etichettati da te da quelli etichettati dallo " +
                "script. Per non toccare i tuoi le lascia come sono e te lo dice: svuota solo le " +
                "etichette che ha creato lo script. ANNULLA_etichettaturaCompleta invece le svuota " +
                "tutte, comprese le tue."));
            lblPrefisso = Tema.Testo1("", 346, y + 4, 480, Tema.Piccolo, Ruolo.Tenue);
            lblPrefisso.Height = 20;
            p.Controls.Add(lblPrefisso);
            y += 48;

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
            pannelloPassi.FlowDirection = FlowDirection.TopDown;
            pannelloPassi.WrapContents = false;
            pannelloPassi.AutoScroll = true;
            p.Controls.Add(pannelloPassi);
            // niente Anchor: quando il pannello nasce la pagina e' ancora larga
            // 200 px, e i margini dell'ancoraggio verrebbero presi da li' (il
            // pannello finiva per sporgere a destra)
            int cimaPassi = y;
            p.Resize += delegate
            {
                pannelloPassi.Width = Math.Max(300, p.ClientSize.Width);
                pannelloPassi.Height = Math.Max(200, p.ClientSize.Height - cimaPassi);
            };

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

            Cartellino(5, "Guarda le etichette che nasceranno",
                "Scegli la funzione  PASSO_2_creaEtichette  e premi Esegui. In modalita' prova non " +
                "crea niente: nel registro elenca le etichette che nasceranno. Le crea davvero il " +
                "passo 6, quando togli la prova; da li' le vedi in Gmail, nella colonna di sinistra.",
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
                "avviene dentro Gmail, senza aspettare lo script. \"Studenti\" resta allo script: un " +
                "filtro non sa escludere chi e' gia' fra i Colleghi. Con la modalita' prova accesa " +
                "non crea niente. Se poi cambi una regola, il " +
                "filtro vecchio va cancellato a mano in Gmail (Impostazioni -> Filtri).",
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
            scorrevole.AutoScroll = true;
            p.Controls.Add(scorrevole);
            p.Resize += delegate
            {
                scorrevole.Width = Math.Max(300, p.ClientSize.Width);
                scorrevole.Height = Math.Max(200, p.ClientSize.Height - 50);
            };

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
                  "Esegui ANNULLA_etichettatura: ferma il riordino se sta ancora lavorando e toglie " +
                  "dalle conversazioni le etichette delle regole accese (quelle delle regole spente " +
                  "le nomina ma non le tocca). Senza gruppo toglie solo le etichette che ha creato " +
                  "lo script: quelle che avevi gia' in Gmail le nomina e le lascia come sono. " +
                  "Se avevi riordinato con Campanella 1.4.6 o prima, lo script di allora non si " +
                  "segnava le etichette che creava: ANNULLA_etichettatura risponde NIENTE DA TOGLIERE " +
                  "e per svuotarle serve ANNULLA_etichettaturaCompleta, che le toglie da tutti i " +
                  "messaggi, anche da quelli a cui le avevi messe tu a mano. " +
                  "Con molta posta il tempo di Google finisce prima e lo " +
                  "dice: rieseguila finche' in cima non compare FATTO. Esegui ANNULLA_automazione per spegnere " +
                  "il controllo automatico; i filtri veri di Gmail, se li hai creati, si tolgono a mano " +
                  "(Gmail -> Impostazioni -> Filtri). Nulla viene mai cancellato, quindi non si perde posta." },
                { "Alcuni messaggi finiscono nell'etichetta sbagliata",
                  "Prima una cosa normale: le etichette si sommano, e una circolare del dirigente " +
                  "prende sia Dirigenza sia Circolari. Se invece un collega finisce fra gli Studenti, " +
                  "manca nell'elenco del personale (passo 3). Se una regola prende troppo, nel passo 4 " +
                  "premi \"Modifica\" e rendila piu' precisa, poi rigenera la configurazione e " +
                  "incollala di nuovo. PASSO_3 aggiunge etichette ma non ne toglie: per rifare " +
                  "da capo esegui prima ANNULLA_etichettatura (con molta posta, finche' in cima non " +
                  "compare FATTO): ferma anche il riordino in corso, che poi riparte dall'inizio. " +
                  "Se in cima compare NIENTE DA TOGLIERE, le etichette le ha create lo script di " +
                  "Campanella 1.4.6 o prima, che non se lo segnava: esegui " +
                  "ANNULLA_etichettaturaCompleta, che svuota le etichette delle regole accese " +
                  "anche dove le avevi messe tu a mano, e poi PASSO_3. " +
                  "Se hai creato i filtri veri di Gmail, cancella anche il filtro vecchio " +
                  "di quella regola: altrimenti continua a etichettare come prima." },
                { "Colleghi e studenti finiscono insieme",
                  "Di solito vuol dire che l'elenco del personale e' incompleto: sono indirizzi dello " +
                  "stesso dominio, e l'unico modo per distinguerli e' l'elenco. Usa il metodo C del " +
                  "passo 3 (EXTRA_elencaIndirizziScuola): legge i mittenti veri dalla tua casella. " +
                  "Se hai creato i filtri veri di Gmail con una versione di Campanella precedente " +
                  "alla 1.4.6, c'e' anche un filtro \"Studenti\" su tutto il dominio: cancellalo in " +
                  "Gmail -> Impostazioni -> Filtri." },
                { "Dove trovo l'elenco di EXTRA_elencaIndirizziScuola?",
                  "Nell'email che lo script manda a te stesso, con oggetto \"[Organizzazione " +
                  "Gmail] Indirizzi ...\". Nel registro dell'editor resta solo quanti ne ha " +
                  "trovati: l'elenco ci finisce, a blocchi, soltanto se l'email non e' partita. " +
                  "Il registro delle esecuzioni Google lo conserva per un po': se ci e' finito " +
                  "l'elenco, sappi che resta li'. Se compare \"Logging output too large\" non e' " +
                  "un errore: e' Google che accorcia le scritte lunghe." },
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
            // Le righe dell'email di EXTRA_elencaIndirizziScuola (indirizzo, nome,
            // quanti messaggi): sono tutti gli indirizzi del dominio visti nella
            // casella, studenti compresi. Senza un ruolo partono senza spunta.
            List<Persona> dallaCasella = new List<Persona>();

            string[] righe = testo.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            foreach (string rigaGrezza in righe)
            {
                string riga = rigaGrezza.Trim();
                if (riga.Length == 0) continue;
                if (Regex.IsMatch(riga, @"^[\-=_\.]{3,}$")) continue;

                string senzaSegni = riga.TrimStart('#', '*', ' ', '\t', '"');
                if (senzaSegni.StartsWith("NOMINATIVO", StringComparison.OrdinalIgnoreCase) ||
                    senzaSegni.StartsWith("INDIRIZZO", StringComparison.OrdinalIgnoreCase) ||
                    senzaSegni.StartsWith("SUDDIVISIONE", StringComparison.OrdinalIgnoreCase)) continue;

                Match mr = reRuolo.Match(riga);
                if (mr.Success && !riga.Contains("@"))
                {
                    ruoloCorrente = Titolizza(mr.Groups[1].Value.Trim());
                    continue;
                }

                // il CSV scaricato dal registro, o riesportato da Campanella:
                // "COGNOME NOME";"ASSISTENTE AMMINISTRATIVO";"a.b@scuola.it"
                if (!riga.Contains("\t") && EccoUnCsv(riga))
                {
                    string[] campi = CampiCsv(riga);
                    Persona pc = new Persona();
                    pc.Nome = PulisciNome(campi[0]);
                    for (int i = 1; i < campi.Length; i++)
                    {
                        Match me = reEmail.Match(campi[i]);
                        if (me.Success) { pc.Email = me.Value.ToLowerInvariant(); break; }
                    }
                    pc.Ruolo = (campi.Length > 1 && !reEmail.IsMatch(campi[1]) && campi[1] != "")
                               ? Titolizza(campi[1]) : ruoloCorrente;
                    if (pc.Nome != "" || pc.Email != "") fuori.Add(pc);
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
                        if (campi.Length > 2 && Regex.IsMatch(campi[2], @"^\d+$")) dallaCasella.Add(p);
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
                        // la stessa riga dell'email dello script, se copiando le
                        // tabulazioni sono diventate spazi: "indirizzo nome 12"
                        bool casella = dentro.Count == 1 && spezzone.TrimStart().StartsWith(dentro[0].Value) &&
                                       Regex.IsMatch(resto, @"\s\d+\s*$");
                        if (casella) resto = Regex.Replace(resto, @"\s\d+\s*$", "");
                        string nome = (dentro.Count == 1) ? PulisciNome(resto) : "";
                        foreach (Match m in dentro)
                        {
                            Persona p = new Persona();
                            p.Email = m.Value.ToLowerInvariant();
                            p.Nome = nome;
                            p.Ruolo = ruoloCorrente;
                            fuori.Add(p);
                            if (casella) dallaCasella.Add(p);
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
                bool senzaRuolo = (p.Ruolo == "");
                if (senzaRuolo) p.Ruolo = "Non specificato";
                p.Incluso = !RuoloDaEscludere(p.Ruolo) && !(senzaRuolo && dallaCasella.Contains(p));
            }
            return fuori;
        }

        /// <summary>
        /// Una riga di CSV vera: almeno due campi separati da punto e virgola,
        /// e il primo che non e' un indirizzo. Un elenco di indirizzi separati
        /// da punto e virgola non deve finire qui dentro.
        /// </summary>
        static bool EccoUnCsv(string riga)
        {
            if (riga.IndexOf(';') < 0) return false;
            string[] campi = CampiCsv(riga);
            if (campi.Length < 2) return false;
            if (Regex.IsMatch(campi[0], @"[A-Za-z0-9._%+\-]+@")) return false;
            return Regex.IsMatch(campi[0], @"\p{L}");
        }

        /// <summary>Spezza una riga di CSV, togliendo le virgolette doppiate.</summary>
        static string[] CampiCsv(string riga)
        {
            List<string> campi = new List<string>();
            StringBuilder corrente = new StringBuilder();
            bool dentro = false;
            for (int i = 0; i < riga.Length; i++)
            {
                char c = riga[i];
                if (c == '"')
                {
                    if (dentro && i + 1 < riga.Length && riga[i + 1] == '"') { corrente.Append('"'); i++; }
                    else dentro = !dentro;
                }
                else if (c == ';' && !dentro) { campi.Add(corrente.ToString().Trim()); corrente.Length = 0; }
                else corrente.Append(c);
            }
            campi.Add(corrente.ToString().Trim());
            return campi.ToArray();
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

        void AggiornaPersonale() { AggiornaGriglia(); AggiornaRuoli(); AggiornaConteggio(); AggiornaGruppi(); }

        void AggiornaGriglia()
        {
            griglia.CellValueChanged -= GrigliaModificata;
            RiempiGriglia(griglia, S.Personale);
            griglia.CellValueChanged += GrigliaModificata;
        }

        /// <summary>
        /// Le colonne della griglia del personale. Nessuna si ordina con un clic
        /// sull'intestazione: le righe restano nell'ordine dell'elenco.
        /// </summary>
        static DataGridViewColumn[] ColonnePersonale()
        {
            DataGridViewCheckBoxColumn c0 = new DataGridViewCheckBoxColumn();
            c0.HeaderText = "Usa"; c0.FillWeight = 8;
            DataGridViewTextBoxColumn c1 = new DataGridViewTextBoxColumn();
            c1.HeaderText = "Nominativo"; c1.FillWeight = 30;
            DataGridViewTextBoxColumn c2 = new DataGridViewTextBoxColumn();
            c2.HeaderText = "Ruolo"; c2.FillWeight = 22;
            DataGridViewTextBoxColumn c3 = new DataGridViewTextBoxColumn();
            c3.HeaderText = "Indirizzo email"; c3.FillWeight = 40;
            DataGridViewTextBoxColumn c4 = new DataGridViewTextBoxColumn();
            c4.HeaderText = "Visto"; c4.FillWeight = 10; c4.ReadOnly = true;
            c4.ToolTipText = "\"si\" quando quell'indirizzo si e' visto davvero nella tua casella";
            DataGridViewColumn[] colonne = new DataGridViewColumn[] { c0, c1, c2, c3, c4 };
            foreach (DataGridViewColumn c in colonne) c.SortMode = DataGridViewColumnSortMode.NotSortable;
            return colonne;
        }

        /// <summary>Una riga per persona; ogni riga tiene nel Tag la sua persona.</summary>
        static void RiempiGriglia(DataGridView g, List<Persona> elenco)
        {
            g.Rows.Clear();
            foreach (Persona p in elenco)
            {
                int i = g.Rows.Add(p.Incluso, p.Nome, p.Ruolo, p.Email, p.Verificato ? "si" : "");
                g.Rows[i].Tag = p;
            }
        }

        /// <summary>
        /// La persona di una riga, presa dal Tag e non dalla posizione: se le
        /// righe cambiano ordine, la riga N non e' piu' la persona N dell'elenco.
        /// Null se la riga non ha una persona che sta ancora nell'elenco.
        /// </summary>
        static Persona PersonaDellaRiga(DataGridViewRow r, List<Persona> elenco)
        {
            if (r == null) return null;
            Persona p = r.Tag as Persona;
            return (p != null && elenco.Contains(p)) ? p : null;
        }

        /// <summary>Copia i valori della riga nella sua persona e la restituisce (null se non ce l'ha).</summary>
        static Persona RigaInPersona(DataGridViewRow r, List<Persona> elenco)
        {
            Persona p = PersonaDellaRiga(r, elenco);
            if (p == null) return null;
            p.Incluso = Convert.ToBoolean(r.Cells[0].Value ?? false);
            p.Nome = Convert.ToString(r.Cells[1].Value ?? "");
            p.Ruolo = Convert.ToString(r.Cells[2].Value ?? "");
            string scritto = Convert.ToString(r.Cells[3].Value ?? "").Trim().ToLowerInvariant();
            // un indirizzo riscritto a mano non e' piu' quello visto nella casella
            if (scritto != p.Email) { p.Email = scritto; p.Verificato = false; }
            return p;
        }

        void GrigliaModificata(object mittente, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0 || e.RowIndex >= griglia.Rows.Count) return;
            if (RigaInPersona(griglia.Rows[e.RowIndex], S.Personale) == null) return;
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
                "  Adesso premi \"Controlla gli indirizzi...\": li confronto con la tua casella.");
        }

        // ===================================================================
        //  CONTROLLO DEGLI INDIRIZZI CON LA CASELLA
        //  Gli indirizzi costruiti dai nomi sono un'ipotesi. Qui l'ipotesi
        //  viene confrontata con gli indirizzi che nella casella si sono visti
        //  davvero: quelli che tornano restano, quelli sbagliati vengono
        //  sostituiti, gli altri restano segnalati.
        // ===================================================================
        void ControllaConLaCasella()
        {
            if (S.Personale.Count == 0)
            {
                MessageBox.Show(this,
                    "Prima carica l'elenco del personale (metodo A o B), poi torna qui a " +
                    "controllare gli indirizzi.",
                    "Elenco vuoto", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string testo = "";
            try { if (Clipboard.ContainsText()) testo = Clipboard.GetText(); } catch { }

            using (FormIncolla f = new FormIncolla(testo,
                "Incolla qui gli indirizzi veri della tua casella: sono quelli dell'email che ti " +
                "manda EXTRA_elencaIndirizziScuola (oggetto \"[Organizzazione Gmail] Indirizzi " +
                "...\"), oppure un file che hai salvato. Non aggiungo nessuno all'elenco: " +
                "guardo solo se gli indirizzi che hai in tabella esistono davvero, e correggo " +
                "quelli che posso attribuire senza dubbi.",
                "Controlla gli indirizzi", "Controlla"))
            {
                if (f.ShowDialog(this) != DialogResult.OK) return;
                List<Persona> reali = AnalizzaElenco(f.Testo);
                int quantiVeri = 0;
                foreach (Persona r in reali) if ((r.Email ?? "") != "") quantiVeri++;
                if (quantiVeri == 0)
                {
                    MessageBox.Show(this,
                        "In quel testo non ho trovato nessun indirizzo.\n\n" +
                        "Serve l'elenco degli indirizzi veri: quello dell'email dello script, " +
                        "con una riga per indirizzo.",
                        "Nessun indirizzo", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                EsitoConfronto esito = S.ConfrontaConLaCasella(reali);
                CercaLoSchema(esito);
                AggiornaPersonale();
                MostraEsitoControllo(esito, quantiVeri);
            }
        }

        /// <summary>
        /// Quale schema di indirizzi usa davvero la scuola: lo deduce dalle
        /// persone il cui indirizzo e' stato confermato.
        /// </summary>
        void CercaLoSchema(EsitoConfronto esito)
        {
            string dominio = S.DominioPulito();
            if (dominio == "") return;
            string[] schemi = { "{nome}.{cognome}", "{n}.{cognome}", "{cognome}.{nome}",
                                "{nome}{cognome}", "{cognome}{nome}", "{cognome}.{n}" };
            bool cognomePrima = (cmbOrdine.SelectedIndex != 1);
            Dictionary<string, int> conti = new Dictionary<string, int>();
            foreach (Persona p in S.Personale)
            {
                if (!p.Verificato || p.Nome == "" || p.Email == "") continue;
                foreach (string s in schemi)
                    if (ComponiEmail(p.Nome, s, cognomePrima, dominio) == p.Email)
                    {
                        conti[s] = conti.ContainsKey(s) ? conti[s] + 1 : 1;
                        break;
                    }
            }
            foreach (KeyValuePair<string, int> c in conti)
                if (c.Value > esito.QuantiSchema) { esito.QuantiSchema = c.Value; esito.SchemaPiuUsato = c.Key; }
        }

        void MostraEsitoControllo(EsitoConfronto e, int quantiVeri)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("CONTROLLO DEGLI INDIRIZZI CON LA TUA CASELLA");
            sb.AppendLine("============================================");
            sb.AppendLine();
            sb.AppendLine("Indirizzi veri letti .......... " + quantiVeri);
            sb.AppendLine("Gia' giusti ................... " + e.Confermati);
            sb.AppendLine("Corretti adesso ............... " + e.Corretti);
            sb.AppendLine("Non trovati nella casella ..... " + e.NonTrovati);
            sb.AppendLine("Lasciati stare (ambigui) ...... " + e.Ambigui);
            sb.AppendLine();
            if (e.SchemaPiuUsato != "")
            {
                sb.AppendLine("Lo schema piu' usato nella tua scuola risulta  " + e.SchemaPiuUsato +
                              "  (" + e.QuantiSchema + " indirizzi).");
                sb.AppendLine("Se costruisci altri indirizzi dai nomi, usa quello.");
                sb.AppendLine();
            }
            if (e.Cambiati.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine("CORRETTI");
                sb.AppendLine("--------");
                foreach (string r in e.Cambiati) sb.AppendLine("  " + r);
                sb.AppendLine();
            }
            if (e.Mancanti.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine("DA GUARDARE A MANO");
                sb.AppendLine("------------------");
                sb.AppendLine("Nella casella non c'e' (ancora) un messaggio di queste persone, oppure");
                sb.AppendLine("gli indirizzi possibili erano piu' d'uno. Non ho cambiato niente.");
                sb.AppendLine();
                foreach (string r in e.Mancanti) sb.AppendLine("  " + r);
                sb.AppendLine();
            }
            sb.AppendLine();
            sb.AppendLine("Nella tabella la colonna \"Visto\" dice si per gli indirizzi che nella");
            sb.AppendLine("casella ci sono davvero. Chi non ce l'ha non e' per forza sbagliato:");
            sb.AppendLine("puo' semplicemente non averti mai scritto.");

            using (FormTesto f = new FormTesto("Controllo degli indirizzi", sb.ToString(), null, null))
                f.ShowDialog(this);

            Guscio.Stato1("Controllo finito: " + e.Confermati + " giusti, " + e.Corretti +
                          " corretti, " + (e.NonTrovati + e.Ambigui) + " da guardare.");
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
            List<Persona> scelte = PersoneSelezionate(griglia, S.Personale);
            if (scelte.Count == 0)
            {
                MessageBox.Show(this, "Seleziona prima una o piu' righe (clic sulla riga).",
                    "Nessuna riga selezionata", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            S.Personale.RemoveAll(delegate(Persona p) { return scelte.Contains(p); });
            AggiornaPersonale();
            Guscio.Stato1("Tolte " + scelte.Count + " righe.");
        }

        /// <summary>Le persone delle righe selezionate (dal Tag, vedi PersonaDellaRiga), ciascuna una volta.</summary>
        static List<Persona> PersoneSelezionate(DataGridView g, List<Persona> elenco)
        {
            List<Persona> scelte = new List<Persona>();
            foreach (DataGridViewRow r in g.SelectedRows)
            {
                Persona p = PersonaDellaRiga(r, elenco);
                if (p != null && !scelte.Contains(p)) scelte.Add(p);
            }
            return scelte;
        }

        /// <summary>
        /// Toglie le righe senza spunta: non vanno nello script, ma finche' stanno
        /// in elenco restano nel file dei dati (anche nel Drive). Sono soprattutto
        /// gli indirizzi presi dalla casella, studenti compresi.
        /// </summary>
        void TogliRigheSenzaSpunta()
        {
            int quante = ContaSenzaSpunta(S.Personale);
            if (quante == 0)
            {
                MessageBox.Show(this, "Tutte le righe hanno la spunta: non c'e' niente da togliere.",
                    "Nessuna riga senza spunta", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            if (MessageBox.Show(this, DomandaSenzaSpunta(quante),
                    "Conferma", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            int tolte = TogliSenzaSpunta(S.Personale);
            AggiornaPersonale();
            Guscio.Stato1("Tolte " + tolte + (tolte == 1 ? " riga senza spunta" : " righe senza spunta") +
                          ". In elenco: " + S.Personale.Count + ".");
        }

        static int ContaSenzaSpunta(List<Persona> elenco)
        {
            int n = 0;
            foreach (Persona p in elenco) if (!p.Incluso) n++;
            return n;
        }

        /// <summary>Toglie le persone senza spunta; le altre restano nel loro ordine. Dice quante ne ha tolte.</summary>
        static int TogliSenzaSpunta(List<Persona> elenco)
        {
            return elenco.RemoveAll(delegate(Persona p) { return !p.Incluso; });
        }

        static string DomandaSenzaSpunta(int quante)
        {
            return "Tolgo dall'elenco " + quante + (quante == 1 ? " riga senza spunta?" : " righe senza spunta?") +
                   "\n\nNon vanno nello script, ma finche' restano in elenco restano anche nel file " +
                   "dei dati di Campanella. Le righe con la spunta non cambiano.";
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
                sb.AppendLine("NOMINATIVO;RUOLO;EMAIL;CATEGORIA;USATO");
                foreach (Persona p in S.Personale)
                    sb.AppendLine("\"" + p.Nome.Replace("\"", "\"\"") + "\";\"" +
                                  p.Ruolo.Replace("\"", "\"\"") + "\";\"" +
                                  p.Email.Replace("\"", "\"\"") + "\";\"" +
                                  Stato.CategoriaRuolo(p.Ruolo) + "\";" + (p.Incluso ? "si" : "no"));
                if (Guscio.SalvaFile(this, d.FileName, sb.ToString(), new UTF8Encoding(true)))
                    Guscio.Stato1("Salvato: " + d.FileName);
            }
        }

        void GuidaSpaggiari()
        {
            string guida =
                "COME PRENDERE L'ELENCO DA CLASSEVIVA (SPAGGIARI)\n\n" +
                "Vale solo per il registro ClasseViva: con Argo, Axios, Nuvola o altri\n" +
                "registri questa funzione non trova niente. In quel caso incolla\n" +
                "l'elenco a mano (metodo A) o fallo leggere dalla casella (metodo C).\n\n" +
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
                "Insieme ai nominativi prende anche il ruolo di ognuno, e lo raduna\n" +
                "nelle cinque categorie che servono alle sottoetichette di Gmail.\n" +
                "Nella Console restano stampati il riepilogo per categoria e il\n" +
                "blocco CSV: se gli appunti non funzionano, seleziona quel blocco,\n" +
                "copialo a mano e incollalo lo stesso con \"Incolla elenco\".\n" +
                "Solo in quel caso la funzione scarica anche personale_spaggiari.csv\n" +
                "nella cartella dei download: lo carichi con \"Incolla elenco\" ->\n" +
                "\"Apri un file...\", e poi lo cancelli, perche' contiene nomi e\n" +
                "indirizzi dei colleghi.\n\n" +
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
                    // la versione di chi l'ha scritta: in chrome://extensions si riconosce una copia vecchia
                    if (f == "manifest.json")
                        testo = GeneratorePosta.ManifestEstensione(testo, Aggiornamenti.VersioneCampanella);
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
                "Funziona solo con il registro ClasseViva di Spaggiari: con Argo,\n" +
                "Axios, Nuvola o altri registri non trova niente.\n\n" +
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
                "manda niente a nessuno e non ha bisogno del Web Store. Lavora solo\n" +
                "sulle pagine di ClasseViva (spaggiari.eu): su ogni altra pagina non\n" +
                "fa niente e te lo dice. Se la cartella sta nel Drive, la ritrovi\n" +
                "uguale su tutti i computer (su ognuno va caricata una volta da\n" +
                "chrome://extensions).\n\n" +
                "In chrome://extensions porta la versione di Campanella che l'ha\n" +
                "scritta (" + Aggiornamenti.VersioneCampanella + "). Con una Campanella piu' nuova premi di\n" +
                "nuovo \"Estensione...\" e poi, in chrome://extensions, \"Ricarica\".\n\n" +
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
                "Il registro dell'editor mostra solo quanti ne ha trovati:\n" +
                "l'elenco sta nell'email, e nel registro finisce (a blocchi)\n" +
                "soltanto se l'email non e' partita.\n\n" +
                "LO STESSO ELENCO SERVE A CONTROLLARE\n" +
                "Se l'elenco del personale lo hai gia' preso dal registro, gli\n" +
                "indirizzi costruiti dai nomi sono solo un'ipotesi. Premi\n" +
                "\"Controlla gli indirizzi...\": incolli questa stessa email e\n" +
                "Campanella corregge da sola quelli che puo' attribuire senza\n" +
                "dubbi, segnalando gli altri. Nessuno viene aggiunto all'elenco.\n\n" +
                "Nell'elenco ci sono anche gli studenti: per questo gli indirizzi\n" +
                "arrivano in tabella senza spunta. Metti la spunta ai colleghi\n" +
                "(anche tutti insieme con \"Non specificato\" fra i ruoli a\n" +
                "sinistra, togliendola poi agli studenti) e premi \"Togli le\n" +
                "righe senza spunta\": le righe senza spunta non vanno nello\n" +
                "script, ma finche' restano in elenco restano salvate nel file\n" +
                "dei dati. Oppure seleziona le righe degli studenti e premi\n" +
                "\"Togli le righe selezionate\".";
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
        //  Il testo lo scrive GeneratorePosta, che lavora solo sui dati: qui
        //  si raccolgono i valori dei controlli nello Stato e basta.
        // ===================================================================
        static List<string> Righe(string testo) { return GeneratorePosta.Righe(testo); }

        public string GeneraConfigurazione() { return GeneraConfigurazione(chkProva.Checked); }

        public string GeneraConfigurazione(bool prova)
        {
            Raccogli();
            return GeneratorePosta.Configurazione(S, prova, DateTime.Now);
        }

        /// <summary>L'etichetta sotto cui mettere i ruoli: quella dei colleghi.</summary>
        string EtichettaColleghi() { return GeneratorePosta.EtichettaColleghi(S.Regole); }

        string RiepilogoEtichette()
        {
            Raccogli();
            StringBuilder sb = new StringBuilder();
            string prefisso = S.PrefissoPulito();
            sb.AppendLine("ETICHETTE CHE VERRANNO CREATE IN GMAIL");
            sb.AppendLine("======================================");
            sb.AppendLine();
            if (prefisso != "") { sb.AppendLine(prefisso); sb.AppendLine("  |"); }
            Dictionary<string, List<string>> gruppiEtichette = S.EtichettaPerRuolo
                ? S.GruppiPerRuolo() : new Dictionary<string, List<string>>();
            int n = 0;
            foreach (Regola r in S.Regole)
            {
                if (!r.Attiva) continue;
                n++;
                sb.AppendLine((prefisso != "" ? "  +-- " : "") + r.Etichetta +
                              (r.Archivia ? "      (i messaggi escono dalla Posta in arrivo)" : ""));
                if (gruppiEtichette.Count > 0 && EtichettaColleghi() == r.Etichetta)
                    foreach (string c in GeneratorePosta.CategoriePresenti(gruppiEtichette))
                    {
                        n++;
                        sb.AppendLine((prefisso != "" ? "  |     " : "  ") + "+-- " + c +
                                      "      (" + gruppiEtichette[c].Count + " indirizzi)");
                    }
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
                if (Guscio.SalvaFile(this, d.FileName, TestoCorrente(), new UTF8Encoding(false)))
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
            catch (Exception) { }     // Drive che non si legge: si apre Drive nel browser
            Guscio.Apri("https://drive.google.com/");
        }
    }
}
