// ===========================================================================
//  Dialoghi.cs - le finestrelle di servizio
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace Campanella
{
    /// <summary>Incolla un elenco (personale, indirizzi, righe di Spaggiari).</summary>
    class FormIncolla : Form
    {
        TextBox txt;
        public string Testo { get { return txt.Text; } }

        public FormIncolla(string dagliAppunti)
            : this(dagliAppunti,
                   "Incolla qui sotto (Ctrl+V) quello che hai copiato. Va bene qualunque forma: " +
                   "un indirizzo per riga, indirizzi separati da virgola, l'elenco copiato da " +
                   "Spaggiari, oppure l'email mandata dallo script. Le righe che non capisco le salto.",
                   "Incolla l'elenco", "Aggiungi all'elenco")
        {
        }

        public FormIncolla(string dagliAppunti, string spiegazione, string titolo, string testoOk)
        {
            Text = titolo;
            Size = new Size(700, 540);
            StartPosition = FormStartPosition.CenterParent;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;

            Label l = Tema.Testo1(spiegazione, 16, 12, 650, Tema.Normale, Ruolo.Tenue);
            Controls.Add(l);

            txt = new TextBox();
            txt.Location = new Point(16, 12 + l.Height + 8);
            txt.Size = new Size(652, 360);
            txt.Multiline = true;
            txt.ScrollBars = ScrollBars.Both;
            txt.WordWrap = false;
            txt.Font = Tema.Mono;
            txt.Tag = Ruolo.Codice;
            txt.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            txt.Text = dagliAppunti ?? "";
            Controls.Add(txt);

            Button ok = Tema.BottonePrincipale(testoOk, 484, 448, 184, null);
            ok.DialogResult = DialogResult.OK;
            ok.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            Controls.Add(ok);

            Button ann = Tema.Bottone("Annulla", 386, 450, 90, null);
            ann.DialogResult = DialogResult.Cancel;
            ann.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            Controls.Add(ann);
            CancelButton = ann;

            // il CSV scaricato dal registro, o l'email dello script salvata su
            // disco: piu' comodo che passare dagli appunti
            Button file = Tema.Bottone("Apri un file...", 16, 450, 140, delegate
            {
                using (OpenFileDialog d = new OpenFileDialog())
                {
                    d.Filter = "Elenchi (*.csv;*.txt;*.tsv)|*.csv;*.txt;*.tsv|Tutti i file (*.*)|*.*";
                    d.Title = "Scegli il file con l'elenco";
                    if (d.ShowDialog(this) != DialogResult.OK) return;
                    CaricaFile(d.FileName);
                }
            });
            file.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            Controls.Add(file);

            Tema.Applica(this);
        }

        /// <summary>
        /// Mette nella casella il contenuto di un file, nella sua codifica: il CSV
        /// del registro salvato da Excel e' spesso in ANSI, e letto come UTF-8
        /// rovinava i cognomi accentati.
        /// </summary>
        public void CaricaFile(string percorso)
        {
            // Campanella.Testo: qui dentro "Testo" e' la proprieta' con il testo incollato
            try { txt.Text = Campanella.Testo.LeggiFile(percorso); }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Non riesco a leggere il file:\n\n" + ex.Message,
                    "Errore", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    /// <summary>Un testo di aiuto, con un eventuale pulsante che copia qualcosa.</summary>
    class FormTesto : Form
    {
        public FormTesto(string titolo, string testo, string etichettaCopia, string daCopiare)
        {
            Text = titolo;
            Size = new Size(660, 500);
            StartPosition = FormStartPosition.CenterParent;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;

            TextBox t = new TextBox();
            t.Location = new Point(16, 16);
            t.Size = new Size(612, 382);
            t.Multiline = true;
            t.ReadOnly = true;
            t.ScrollBars = ScrollBars.Vertical;
            t.BorderStyle = BorderStyle.FixedSingle;
            t.Font = Tema.Normale;
            t.Text = (testo ?? "").Replace("\r\n", "\n").Replace("\n", "\r\n");
            t.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            t.Select(0, 0);
            Controls.Add(t);

            if (etichettaCopia != null && daCopiare != null)
            {
                Button c = Tema.BottonePrincipale(etichettaCopia, 16, 410, 280, delegate
                {
                    try
                    {
                        Clipboard.SetText(daCopiare);
                        MessageBox.Show(this, "Copiato negli appunti.\n\nAdesso torna nel browser e " +
                            "incolla con Ctrl+V.", "Fatto", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    catch
                    {
                        MessageBox.Show(this, "Gli appunti erano occupati: riprova.",
                            "Riprova", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                });
                c.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
                Controls.Add(c);
            }

            Button ok = Tema.Bottone("Chiudi", 538, 412, 90, null);
            ok.DialogResult = DialogResult.OK;
            ok.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            Controls.Add(ok);
            AcceptButton = ok;
            CancelButton = ok;

            Tema.Applica(this);
        }
    }

    /// <summary>Aggiunge o modifica una regola di smistamento.</summary>
    class FormRegola : Form
    {
        TextBox txtEtichetta, txtDa, txtOggetto, txtQuery, txtDescrizione;
        CheckBox chkArchivia, chkLette, chkUno;
        public Regola Risultato;
        public bool Elimina = false;
        Regola originale;

        /// <summary>
        /// Vero se i mittenti della regola non si scrivono qui: quelli della
        /// pagina "La tua scuola" e il segnaposto degli studenti di una classe,
        /// i cui indirizzi Campanella non conserva.
        /// </summary>
        static bool MittentiFissi(Regola r)
        {
            return r != null && (r.MittentiDallaScuola() || LeMieClassi.ClasseDi(r) != null);
        }

        public FormRegola(Regola daModificare)
        {
            originale = daModificare;
            Text = (daModificare == null) ? "Nuova regola" : "Modifica la regola";
            Size = new Size(620, 610);
            StartPosition = FormStartPosition.CenterParent;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;

            int y = 16;
            Controls.Add(Tema.Testo1("Nome dell'etichetta", 16, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtEtichetta = Tema.Casella(16, y + 22, 320);
            Controls.Add(txtEtichetta);
            y += 60;

            Controls.Add(Tema.Testo1("Mittenti  (uno per riga: un indirizzo intero oppure @dominio)",
                                     16, y, 560, Tema.Grassetto, Ruolo.Normale));
            txtDa = Tema.CasellaMulti(16, y + 22, 560, 90);
            Controls.Add(txtDa);
            y += 122;

            Controls.Add(Tema.Testo1("Parole nell'oggetto  (una per riga)", 16, y, 560, Tema.Grassetto, Ruolo.Normale));
            txtOggetto = Tema.CasellaMulti(16, y + 22, 560, 66);
            Controls.Add(txtOggetto);
            y += 96;

            // di partenza mittenti e parole valgono insieme; le regole delle
            // classi ne vogliono uno solo: la classe nell'oggetto, da chiunque,
            // oppure un messaggio di uno studente
            chkUno = Tema.Spunta("Basta uno dei due: l'oggetto oppure i mittenti", 16, y, Ruolo.Normale);
            Controls.Add(chkUno);
            y += 30;

            Controls.Add(Tema.Testo1("Ricerca avanzata di Gmail  (facoltativa)", 16, y, 560, Tema.Grassetto, Ruolo.Normale));
            txtQuery = Tema.Casella(16, y + 22, 560);
            Controls.Add(txtQuery);
            Controls.Add(Tema.Testo1("Esempi:  has:attachment    larger:5M    category:promotions",
                                     16, y + 48, 560, Tema.Piccolo, Ruolo.Tenue));
            y += 76;

            Controls.Add(Tema.Testo1("A cosa serve  (promemoria per te)", 16, y, 560, Tema.Grassetto, Ruolo.Normale));
            txtDescrizione = Tema.Casella(16, y + 22, 560);
            Controls.Add(txtDescrizione);
            y += 58;

            chkArchivia = Tema.Spunta("Archivia: togli dalla Posta in arrivo", 16, y, Ruolo.Normale);
            Controls.Add(chkArchivia);
            chkLette = Tema.Spunta("Segna come gia' letti", 320, y, Ruolo.Normale);
            Controls.Add(chkLette);
            y += 40;

            Button ok = Tema.BottonePrincipale("Salva", 396, y, 180, null);
            ok.Click += delegate
            {
                if (txtEtichetta.Text.Trim() == "")
                {
                    MessageBox.Show(this, "Dai un nome all'etichetta.", "Manca il nome",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Risultato = Componi();
                DialogResult = DialogResult.OK;
            };
            Controls.Add(ok);

            Button ann = Tema.Bottone("Annulla", 300, y + 2, 90, null);
            ann.DialogResult = DialogResult.Cancel;
            Controls.Add(ann);
            CancelButton = ann;

            if (daModificare != null && !daModificare.MittentiDallaScuola())
            {
                Button el = Tema.Bottone("Elimina regola", 16, y + 2, 140, null);
                el.Click += delegate
                {
                    if (MessageBox.Show(this, "Eliminare la regola \"" + daModificare.Etichetta + "\"?",
                            "Conferma", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
                    Elimina = true;
                    DialogResult = DialogResult.OK;
                };
                Controls.Add(el);
                el.Tag = Ruolo.Pericolo;      // un ForeColor messo a mano spariva con Tema.Applica
            }

            if (daModificare != null)
            {
                txtEtichetta.Text = daModificare.Etichetta;
                txtDa.Text = string.Join("\r\n", daModificare.Da.ToArray());
                txtOggetto.Text = string.Join("\r\n", daModificare.Oggetto.ToArray());
                txtQuery.Text = daModificare.QueryLibera;
                txtDescrizione.Text = daModificare.Descrizione;
                chkArchivia.Checked = daModificare.Archivia;
                chkLette.Checked = daModificare.SegnaComeLette;
                chkUno.Checked = daModificare.UnoQualsiasi;

                string classe = LeMieClassi.ClasseDi(daModificare);
                if (classe != null)
                {
                    // gli studenti: il segnaposto, e gli indirizzi solo nel file del progetto
                    txtDa.ReadOnly = true;
                    txtDa.Text = LeMieClassi.Segnaposto(classe) + "\r\n" + AvvisoClasse(classe);
                }
                else if (daModificare.MittentiDallaScuola())
                {
                    txtDa.ReadOnly = true;
                    txtDa.Text = "(i mittenti di questa regola si scrivono nella pagina \"La tua scuola\")";
                    txtEtichetta.ReadOnly = true;
                }
            }

            Tema.Applica(this);
        }

        Regola Componi()
        {
            Regola r = (originale != null) ? originale.Copia() : new Regola();
            r.Etichetta = txtEtichetta.Text.Trim().Trim('/');
            r.QueryLibera = txtQuery.Text.Trim();
            r.Descrizione = txtDescrizione.Text.Trim();
            r.Archivia = chkArchivia.Checked;
            r.SegnaComeLette = chkLette.Checked;
            r.UnoQualsiasi = chkUno.Checked;
            if (r.Descrizione == "") r.Descrizione = "Regola personalizzata.";

            r.Oggetto = Spezza(txtOggetto.Text);
            if (!MittentiFissi(originale)) r.Da = Spezza(txtDa.Text);
            return r;
        }

        /// <summary>Quello che sta sotto il segnaposto di una classe, al posto dei mittenti.</summary>
        static string AvvisoClasse(string classe)
        {
            return "(gli studenti della " + classe + ": gli indirizzi non stanno in Campanella, li porta il file " +
                   LeMieClassi.NomeFile(classe) + " nel progetto dello script; si incollano in \"Le mie classi...\")";
        }

        /// <summary>
        /// L'avviso che sta al posto dei mittenti nelle regole che li prendono da
        /// "La tua scuola" (lo stesso testo del costruttore). Componi non rilegge
        /// quella casella, ma se il testo arrivasse qui non deve diventare un mittente.
        /// </summary>
        const string AvvisoMittenti = "(i mittenti di questa regola si scrivono nella pagina \"La tua scuola\")";

        /// <summary>
        /// Una voce per riga, senza doppioni. Salta solo l'avviso qui sopra, non
        /// ogni riga che comincia con "(": "(urgente)" e' una parola dell'oggetto.
        /// </summary>
        static List<string> Spezza(string testo)
        {
            List<string> fuori = new List<string>();
            if (string.IsNullOrEmpty(testo)) return fuori;
            foreach (string riga in testo.Replace("\r\n", "\n").Split('\n'))
            {
                string s = riga.Trim();
                if (s == "" || s == AvvisoMittenti) continue;
                if (!fuori.Contains(s)) fuori.Add(s);
            }
            return fuori;
        }
    }

    /// <summary>
    /// I filtri che il docente ha gia' in Gmail (Posta, passo 4). Apre
    /// l'esportazione di Gmail, elenca ogni filtro con che cosa cerca, che cosa
    /// fa e quanto somiglia alle regole di Campanella (FiltriGmail.Confronta), e
    /// fa spuntare quelli da togliere: di partenza quelli uguali a una regola
    /// che non fanno altro (FiltriGmail.DiPartenza) e quelli gia' scelti prima.
    /// Scelti va nello Stato; i filtri li toglie lo script, con
    /// EXTRA_togliFiltri. Due filtri uguali si spuntano insieme: per lo script
    /// sono la stessa voce. Ogni riga della griglia sa di quale filtro e' (Tag):
    /// riordinata con un clic sull'intestazione, le spunte restano ai loro filtri.
    /// </summary>
    class FormFiltriGmail : Form
    {
        /// <summary>I filtri da togliere, dopo "Usa questa scelta".</summary>
        public List<FiltroDaTogliere> Scelti = new List<FiltroDaTogliere>();

        class Riga
        {
            public FiltroGmail Filtro;          // null: una voce scelta prima, senza file
            public FiltroDaTogliere Voce;       // null: non si puo' togliere (niente etichetta, criteri, o uno non si capisce)
            public Somiglianza Somiglia;
            public bool Prima;                  // era gia' fra i filtri scelti
            public DataGridViewRow Fila;        // la sua riga nella griglia, dovunque stia
        }

        readonly Stato stato;
        readonly List<Riga> righe = new List<Riga>();
        readonly DataGridView griglia;
        readonly Label lblEsito, lblConto;
        readonly TextBox txtDettaglio;
        bool fileAperto = false, riempiendo = false;
        const int Larga = 860;

        public FormFiltriGmail(Stato s)
        {
            stato = s;
            Text = "Filtri che hai gia' in Gmail";
            StartPosition = FormStartPosition.CenterParent;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            ShowInTaskbar = false;

            int y = 14;
            Label spiega = Tema.Testo1(
                "Un filtro che avevi gia' in Gmail continua a mettere la sua etichetta anche con Campanella. " +
                "Qui scegli quali togliere: li togliera' lo script, con EXTRA_togliFiltri (serve il servizio " +
                "Gmail API, passo 8 dell'installazione guidata).",
                16, y, Larga, Tema.Normale, Ruolo.Normale);
            Controls.Add(spiega);
            y += spiega.Height + 4;
            Label come = Tema.Testo1(
                "Per vederli qui: in Gmail apri Impostazioni (la rotella) -> Vedi tutte le impostazioni -> Filtri " +
                "e indirizzi bloccati, spunta la casella sopra l'elenco dei filtri e premi Esporta. Gmail scarica " +
                "un file, di solito mailFilters.xml: aprilo con \"Apri il file...\".",
                16, y, Larga, Tema.Normale, Ruolo.Tenue);
            Controls.Add(come);
            y += come.Height + 4;
            Label privato = Tema.Testo1(
                "Il file contiene i tuoi filtri, con gli indirizzi e le parole che cercano: dopo averlo aperto qui " +
                "puoi cancellarlo. Campanella tiene solo i filtri che spunti, insieme all'elenco del personale.",
                16, y, Larga, Tema.Normale, Ruolo.Avviso);
            Controls.Add(privato);
            y += privato.Height + 8;

            string apri = "Apri il file...";
            int wa = 26 + TextRenderer.MeasureText(apri, Tema.Normale).Width;
            Controls.Add(Tema.Bottone(apri, 16, y, wa, delegate { ScegliFile(); }));
            lblEsito = Tema.Testo1("", 16 + wa + 12, y + 5, Larga - wa - 12, Tema.Normale, Ruolo.Tenue);
            lblEsito.AutoSize = false;
            // alta quanto l'esito piu' lungo che Carica puo' scrivere
            lblEsito.Height = Tema.AltezzaTesto("Nel file ci sono 999 filtri: 999 uguali a una regola di Campanella " +
                "(999 gia' spuntati, gli altri fanno anche altro), 999 creati da Campanella, 999 simili, 999 tuoi, " +
                "999 senza etichetta o senza criteri, 999 con un criterio che Campanella non capisce, 999 delle " +
                "classi con gli studenti (si tolgono in Gmail). In fondo, 999 scelti prima che nel file non ci sono.",
                Tema.Normale, lblEsito.Width);
            Controls.Add(lblEsito);
            y += Math.Max(38, lblEsito.Height + 10);

            griglia = new DataGridView();
            griglia.Location = new Point(16, y);
            griglia.Size = new Size(Larga, 270);
            griglia.Font = Tema.Normale;
            griglia.BorderStyle = BorderStyle.FixedSingle;
            griglia.AllowUserToAddRows = false;
            griglia.AllowUserToDeleteRows = false;
            griglia.AllowUserToResizeRows = false;
            griglia.RowHeadersVisible = false;
            griglia.MultiSelect = false;
            griglia.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            griglia.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            DataGridViewCheckBoxColumn togli = new DataGridViewCheckBoxColumn();
            togli.HeaderText = "Togli";
            togli.Width = 46;
            griglia.Columns.Add(togli);
            // il suggerimento piu' lungo, "uguale a una regola di Campanella (...)",
            // ci sta con i nomi delle regole di partenza; il resto e' nel dettaglio
            string[] titoli = { "Etichetta", "Che cosa cerca", "Che cosa fa", "Suggerimento" };
            int[] larghe = { 130, 0, 150, 300 };
            for (int i = 0; i < titoli.Length; i++)
            {
                DataGridViewTextBoxColumn c = new DataGridViewTextBoxColumn();
                c.HeaderText = titoli[i];
                c.ReadOnly = true;
                if (larghe[i] == 0) c.AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
                else c.Width = larghe[i];
                griglia.Columns.Add(c);
            }
            griglia.CurrentCellDirtyStateChanged += delegate
            {
                if (griglia.IsCurrentCellDirty) griglia.CommitEdit(DataGridViewDataErrorContexts.Commit);
            };
            griglia.CellValueChanged += delegate(object o, DataGridViewCellEventArgs e)
            {
                if (riempiendo || e.RowIndex < 0 || e.ColumnIndex != 0) return;
                int i = righe.IndexOf(griglia.Rows[e.RowIndex].Tag as Riga);
                Spunta(i, Spuntata(i));
            };
            // CurrentCellChanged, non SelectionChanged: quando arriva la
            // selezione CurrentRow e' ancora la riga di prima
            griglia.CurrentCellChanged += delegate { MostraDettaglio(); };
            // lo spazio spunta la riga scelta anche fuori dalla colonna della spunta
            griglia.KeyDown += delegate(object o, KeyEventArgs e)
            {
                if (e.KeyCode != Keys.Space || griglia.CurrentRow == null) return;
                if (griglia.CurrentCell != null && griglia.CurrentCell.ColumnIndex == 0) return;
                int i = righe.IndexOf(griglia.CurrentRow.Tag as Riga);
                Spunta(i, !Spuntata(i));
                e.Handled = true;
            };
            griglia.AccessibleName = "Filtri di Gmail";
            Controls.Add(griglia);
            y += griglia.Height + 8;

            txtDettaglio = new TextBox();
            txtDettaglio.Location = new Point(16, y);
            txtDettaglio.Size = new Size(Larga, 78);
            txtDettaglio.Multiline = true;
            txtDettaglio.ReadOnly = true;
            txtDettaglio.ScrollBars = ScrollBars.Vertical;
            txtDettaglio.BorderStyle = BorderStyle.FixedSingle;
            txtDettaglio.Font = Tema.Normale;
            txtDettaglio.TabStop = false;
            Controls.Add(txtDettaglio);
            y += txtDettaglio.Height + 8;

            Label nota = Tema.Testo1(
                "Partono spuntati quelli scelti prima e quelli uguali a una regola di Campanella che non fanno " +
                "altro (non inoltrano, non eliminano...); non quelli creati da Campanella. Prima di togliere un " +
                "filtro lo script ne scrive una copia nel registro, per rifarlo a mano. Le etichette gia' messe " +
                "ai messaggi restano: se non ti servono, cancellale da Gmail (i messaggi non si cancellano).",
                16, y, Larga, Tema.Normale, Ruolo.Tenue);
            Controls.Add(nota);
            y += nota.Height + 10;

            lblConto = Tema.Testo1("", 16, y + 8, 400, Tema.Grassetto, Ruolo.Normale);
            lblConto.AutoSize = false;
            lblConto.Height = Tema.AltezzaTesto("Da togliere: 999 filtri", Tema.Grassetto, 400);
            Controls.Add(lblConto);
            Button ok = Tema.BottonePrincipale("Usa questa scelta", 16 + Larga - 200, y, 200, null);
            ok.Click += delegate { Scelti = SceltiAdesso(); DialogResult = DialogResult.OK; };
            Controls.Add(ok);
            Button ann = Tema.Bottone("Annulla", 16 + Larga - 200 - 98, y + 2, 90, null);
            ann.DialogResult = DialogResult.Cancel;
            Controls.Add(ann);
            CancelButton = ann;
            ClientSize = new Size(16 + Larga + 16, y + 34 + 16);

            // di partenza: i filtri scelti prima, spuntati
            if (s != null && s.FiltriDaTogliere != null)
                foreach (FiltroDaTogliere f in s.FiltriDaTogliere)
                {
                    if (f == null) continue;
                    Riga r = new Riga();
                    r.Voce = f.Copia();
                    r.Somiglia = FiltriGmail.Confronta(f.Etichetta, f.Criteri, s);
                    r.Prima = true;
                    righe.Add(r);
                }
            lblEsito.Text = righe.Count == 0
                ? "Nessun file aperto, e nessun filtro scelto prima."
                : "Nessun file aperto: qui sotto ci sono i filtri scelti prima.";
            Riempi(null);
            Tema.Applica(this);
        }

        void ScegliFile()
        {
            using (OpenFileDialog d = new OpenFileDialog())
            {
                d.Filter = "Filtri esportati da Gmail (*.xml)|*.xml|Tutti i file (*.*)|*.*";
                d.Title = "Scegli il file dei filtri esportato da Gmail (mailFilters.xml)";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                CaricaFile(d.FileName);
            }
        }

        /// <summary>Apre un'esportazione di Gmail; se non si legge lo dice e non cambia niente.</summary>
        public bool CaricaFile(string percorso)
        {
            List<FiltroGmail> filtri;
            try { filtri = FiltriGmail.LeggiFile(percorso); }
            catch (Exception ex)
            {
                // i messaggi di FiltriGmail sono gia' in italiano; gli altri (file
                // che non si apre) dicono il perche' di Windows
                MessageBox.Show(this, (ex is System.IO.InvalidDataException ? "" : "Non riesco a leggere il file: ") +
                    ex.Message, "Il file non va bene", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            Carica(filtri);
            return true;
        }

        /// <summary>
        /// Mette nella finestra i filtri di un file: spuntati quelli scelti prima
        /// e quelli uguali a una regola che non fanno altro. Quelli scelti prima
        /// che nel file non ci sono restano, spuntati, in fondo: forse sono gia'
        /// stati tolti.
        /// </summary>
        public void Carica(List<FiltroGmail> filtri)
        {
            // le spunte di adesso (i filtri scelti prima, o quelli di un altro
            // file aperto poco fa) passano ai filtri uguali del file nuovo; quelli
            // scelti prima che il file nuovo non ha restano in fondo
            List<string> prima = new List<string>();
            List<Riga> vecchie = new List<Riga>();
            for (int i = 0; i < righe.Count; i++)
            {
                Riga r = righe[i];
                if (r.Voce == null || !Spuntata(i) || prima.Contains(r.Voce.Chiave())) continue;
                prima.Add(r.Voce.Chiave());
                if (r.Filtro == null) vecchie.Add(r);
                else if (r.Prima)
                {
                    Riga v = new Riga();
                    v.Voce = r.Voce.Copia();
                    v.Somiglia = r.Somiglia;
                    v.Prima = true;
                    vecchie.Add(v);
                }
            }

            righe.Clear();
            List<bool> spunte = new List<bool>();
            List<string> nelFile = new List<string>();
            int uguali = 0, ugualiSpuntati = 0, diCampanella = 0, simili = 0, tuoi = 0, senza = 0, nonCapiti = 0, classi = 0;
            foreach (FiltroGmail f in filtri ?? new List<FiltroGmail>())
            {
                Riga r = new Riga();
                r.Filtro = f;
                r.Somiglia = FiltriGmail.Confronta(f, stato);
                // quello degli studenti di una classe non si sceglie: la voce da
                // togliere porterebbe i loro indirizzi nello Stato e nella configurazione
                r.Voce = (r.Somiglia.Tipo == FiltriGmail.DiUnaClasse) ? null : f.DaTogliere();
                r.Prima = r.Voce != null && prima.Contains(r.Voce.Chiave());
                righe.Add(r);
                bool di = FiltriGmail.DiPartenza(f, r.Somiglia);
                spunte.Add(r.Voce != null && (r.Prima || di));
                if (r.Voce != null) nelFile.Add(r.Voce.Chiave());
                string tipo = r.Somiglia.Tipo;
                if (tipo == FiltriGmail.Uguale) { uguali++; if (di) ugualiSpuntati++; }
                else if (tipo == FiltriGmail.DiCampanella) diCampanella++;
                else if (tipo == FiltriGmail.Simile) simili++;
                else if (tipo == FiltriGmail.SenzaEtichetta || tipo == FiltriGmail.SenzaCriteri) senza++;
                else if (tipo == FiltriGmail.NonCapito) nonCapiti++;
                else if (tipo == FiltriGmail.DiUnaClasse) classi++;
                else tuoi++;
            }
            int mancano = 0;
            foreach (Riga v in vecchie)
            {
                if (nelFile.Contains(v.Voce.Chiave())) continue;
                righe.Add(v);
                spunte.Add(true);
                mancano++;
            }
            fileAperto = true;
            int n = (filtri == null) ? 0 : filtri.Count;
            List<string> parti = new List<string>();
            if (uguali > 0)
            {
                // quelli che fanno anche altro (inoltrano, eliminano...) non partono spuntati
                string spuntati;
                if (ugualiSpuntati == uguali) spuntati = (uguali == 1) ? "gia' spuntato" : "gia' spuntati";
                else if (ugualiSpuntati == 0) spuntati = (uguali == 1) ? "non spuntato: fa anche altro" : "non spuntati: fanno anche altro";
                else spuntati = ugualiSpuntati + " gia' spuntati, gli altri fanno anche altro";
                parti.Add(Quanti(uguali, "uguale", "uguali") + " a una regola di Campanella (" + spuntati + ")");
            }
            if (diCampanella > 0) parti.Add(Quanti(diCampanella, "creato", "creati") + " da Campanella");
            if (simili > 0) parti.Add(Quanti(simili, "simile", "simili"));
            if (tuoi > 0) parti.Add(Quanti(tuoi, "tuo", "tuoi"));
            if (senza > 0) parti.Add(senza + " senza etichetta o senza criteri");
            if (nonCapiti > 0) parti.Add(nonCapiti + " con un criterio che Campanella non capisce");
            if (classi > 0) parti.Add(classi + " delle classi con gli studenti (si tolgono in Gmail)");
            lblEsito.Text = (n == 0 ? "Nel file non ci sono filtri." :
                (n == 1 ? "Nel file c'e' 1 filtro: " : "Nel file ci sono " + n + " filtri: ") +
                string.Join(", ", parti.ToArray()) + ".") +
                (mancano > 0 ? " In fondo, " + Quanti(mancano, "scelto", "scelti") + " prima che nel file " +
                               (mancano == 1 ? "non c'e'." : "non ci sono.") : "");
            Riempi(spunte);
        }

        static string Quanti(int n, string uno, string tanti) { return n + " " + (n == 1 ? uno : tanti); }

        /// <summary>Le righe nella griglia; spunte null = spuntate quelle con una voce (i filtri scelti prima).</summary>
        void Riempi(List<bool> spunte)
        {
            riempiendo = true;
            try
            {
                griglia.Rows.Clear();
                for (int i = 0; i < righe.Count; i++)
                {
                    Riga r = righe[i];
                    string etichetta = (r.Filtro != null) ? r.Filtro.Etichetta : r.Voce.Etichetta;
                    string cerca = FiltriGmail.DescriviCriteri(r.Filtro != null ? r.Filtro.Criteri : r.Voce.Criteri);
                    string fa = (r.Filtro != null) ? FiltriGmail.DescriviAzioni(r.Filtro) : "";
                    bool si = (spunte != null) ? spunte[i] : r.Voce != null;
                    int k = griglia.Rows.Add(si, etichetta == "" ? "(nessuna)" : etichetta, cerca, fa, Suggerimento(r));
                    DataGridViewRow riga = griglia.Rows[k];
                    riga.Tag = r;
                    r.Fila = riga;
                    if (r.Voce == null)
                    {
                        riga.Cells[0].ReadOnly = true;
                        riga.DefaultCellStyle.ForeColor = Tema.Tenue;
                    }
                }
            }
            finally { riempiendo = false; }
            AggiornaConto();
            MostraDettaglio();
        }

        string Suggerimento(Riga r)
        {
            if (r.Filtro == null)
                return fileAperto ? "scelto prima: nel file non c'e' (forse l'hai gia' tolto)" : "scelto prima";
            return (r.Prima ? "scelto prima; " : "") + r.Somiglia.Testo();
        }

        /// <summary>Vero se la riga i dell'elenco (nell'ordine del file, non della griglia) e' spuntata.</summary>
        public bool Spuntata(int i)
        {
            if (i < 0 || i >= righe.Count || righe[i].Fila == null) return false;
            object v = righe[i].Fila.Cells[0].Value;
            return v is bool && (bool)v;
        }

        /// <summary>Spunta (o no) la riga i dell'elenco, e con lei i filtri uguali: per lo script sono la stessa voce.</summary>
        public void Spunta(int i, bool si)
        {
            if (i < 0 || i >= righe.Count || righe[i].Fila == null) return;
            if (righe[i].Voce == null) si = false;
            riempiendo = true;
            try
            {
                righe[i].Fila.Cells[0].Value = si;
                if (righe[i].Voce != null)
                {
                    string chiave = righe[i].Voce.Chiave();
                    for (int k = 0; k < righe.Count; k++)
                        if (k != i && righe[k].Voce != null && righe[k].Fila != null && righe[k].Voce.Chiave() == chiave)
                            righe[k].Fila.Cells[0].Value = si;
                }
            }
            finally { riempiendo = false; }
            AggiornaConto();
        }

        /// <summary>Le voci spuntate adesso, una volta sola ciascuna, nell'ordine dell'elenco.</summary>
        public List<FiltroDaTogliere> SceltiAdesso()
        {
            List<FiltroDaTogliere> fuori = new List<FiltroDaTogliere>();
            List<string> chiavi = new List<string>();
            for (int i = 0; i < righe.Count; i++)
            {
                if (righe[i].Voce == null || !Spuntata(i) || chiavi.Contains(righe[i].Voce.Chiave())) continue;
                chiavi.Add(righe[i].Voce.Chiave());
                fuori.Add(righe[i].Voce.Copia());
            }
            return fuori;
        }

        void AggiornaConto()
        {
            int n = SceltiAdesso().Count;
            lblConto.Text = "Da togliere: " + (n == 0 ? "nessuno" : n + (n == 1 ? " filtro" : " filtri"));
        }

        void MostraDettaglio()
        {
            Riga r = (griglia.CurrentRow != null) ? griglia.CurrentRow.Tag as Riga : null;
            if (r == null) { txtDettaglio.Text = ""; return; }
            StringBuilder sb = new StringBuilder();
            string etichetta = (r.Filtro != null) ? r.Filtro.Etichetta : r.Voce.Etichetta;
            sb.Append("Etichetta: ").Append(etichetta == "" ? "nessuna" : etichetta).Append("\r\n");
            sb.Append("Che cosa cerca: ").Append(FiltriGmail.DescriviCriteri(r.Filtro != null ? r.Filtro.Criteri : r.Voce.Criteri)).Append("\r\n");
            if (r.Filtro != null)
            {
                string fa = FiltriGmail.DescriviAzioni(r.Filtro);
                sb.Append("Che cosa fa: ").Append(etichetta == "" ? "" : "mette l'etichetta").Append(etichetta != "" && fa != "" ? ", " : "").Append(fa).Append("\r\n");
                if (r.Filtro.Altre.Count > 0)
                {
                    List<string> altre = new List<string>();
                    foreach (KeyValuePair<string, string> kv in r.Filtro.Altre) altre.Add(kv.Key + " = " + kv.Value);
                    sb.Append("Altro, che Campanella non conosce: ").Append(string.Join("; ", altre.ToArray())).Append("\r\n");
                }
            }
            sb.Append("Suggerimento: ").Append(Suggerimento(r));
            txtDettaglio.Text = sb.ToString();
            txtDettaglio.Select(0, 0);
        }
    }

    /// <summary>
    /// Le classi del docente (Posta, passo 4, "Le mie classi..."): una regola
    /// per classe, con l'etichetta "Classi 2026-27/3B", per i messaggi con la
    /// classe nell'oggetto oppure mandati dagli studenti della classe. Le
    /// classi vengono dall'orario, da Cartelle e dalle regole che ci sono gia';
    /// se ne aggiungono a mano. Gli indirizzi degli studenti si incollano qui,
    /// restano in memoria finche' la finestra e' aperta e finiscono solo nel
    /// file Classe_3B.gs che il docente copia nel progetto dello script: mai
    /// nello Stato. Le regole le mette nello Stato LeMieClassi.Applica, con
    /// Madre, Classi e TogliVecchie di questa finestra.
    /// </summary>
    class FormClassi : Form
    {
        /// <summary>Le classi della finestra, in ordine: quelle spuntate avranno la loro regola.</summary>
        public readonly List<ClasseScelta> Classi = new List<ClasseScelta>();
        /// <summary>Le regole delle classi sotto un'altra etichetta madre (l'anno prima).</summary>
        public List<Regola> Vecchie = new List<Regola>();

        readonly Stato stato;
        readonly TextBox txtMadre, txtNuova, txtIncolla;
        readonly Label lblMadre, lblNessuna, lblTitoloIncolla, lblAvviso, lblNotaVecchie;
        readonly DataGridView griglia;
        readonly Button btnCopia;
        readonly CheckBox chkVecchie;
        int scelta = -1;
        bool riempiendo = false;
        const int Larga = 860;

        public FormClassi(Stato s)
        {
            stato = s;
            Text = "Le mie classi";
            StartPosition = FormStartPosition.CenterParent;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            ShowInTaskbar = false;

            int y = 14;
            Label spiega = Tema.Testo1(
                "Una regola per ogni classe, con un'etichetta come \"Classi 2026-27/3B\". Un messaggio la prende se " +
                "vale uno dei due: la classe e' nell'oggetto, chiunque lo mandi (la dirigenza, i colleghi, Classroom), " +
                "oppure l'ha mandato uno studente della classe. Le etichette delle classi si aggiungono alle altre: " +
                "Studenti, Colleghi e le altre restano.",
                16, y, Larga, Tema.Normale, Ruolo.Normale);
            Controls.Add(spiega);
            y += spiega.Height + 4;
            Label privato = Tema.Testo1(
                "Gli indirizzi degli studenti sono dati di minori: Campanella non li conserva. Li incolli qui, copi il " +
                "file della classe (per esempio Classe_3B.gs) nel progetto dello script, nell'account della scuola, e " +
                "chiusa questa finestra spariscono. A fine anno togli le classi e cancella quei file.",
                16, y, Larga, Tema.Normale, Ruolo.Avviso);
            Controls.Add(privato);
            y += privato.Height + 10;

            Label lblM = Tema.Testo1("Etichetta madre", 16, y + 4, 0, Tema.Grassetto, Ruolo.Normale);
            Controls.Add(lblM);
            int xm = 16 + TextRenderer.MeasureText(lblM.Text, Tema.Grassetto).Width + 12;
            txtMadre = Tema.Casella(xm, y, 220);
            txtMadre.Text = LeMieClassi.MadreDiPartenza(s);
            Controls.Add(txtMadre);
            lblMadre = Tema.Testo1("", xm + 232, y + 4, 16 + Larga - (xm + 232), Tema.Normale, Ruolo.Tenue);
            lblMadre.AutoSize = false;
            lblMadre.Height = Tema.AltezzaTesto("In Gmail: Classi 2026-27/3B, Classi 2026-27/4A...", Tema.Normale, lblMadre.Width);
            Controls.Add(lblMadre);
            y += 38;

            lblNessuna = Tema.Testo1(
                "Non ho trovato classi. Le prendo dall'orario (Orari, passo 1 il tabellone e passo 4 il tuo nome) " +
                "oppure da Cartelle (una classe per riga); altrimenti aggiungile qui sotto, una alla volta.",
                16, y, Larga, Tema.Normale, Ruolo.Avviso);
            Controls.Add(lblNessuna);
            y += lblNessuna.Height + 4;

            griglia = new DataGridView();
            griglia.Location = new Point(16, y);
            griglia.Size = new Size(Larga, 196);
            griglia.Font = Tema.Normale;
            griglia.BorderStyle = BorderStyle.FixedSingle;
            griglia.AllowUserToAddRows = false;
            griglia.AllowUserToDeleteRows = false;
            griglia.AllowUserToResizeRows = false;
            griglia.RowHeadersVisible = false;
            griglia.MultiSelect = false;
            griglia.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            griglia.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            DataGridViewCheckBoxColumn usa = new DataGridViewCheckBoxColumn();
            usa.HeaderText = "Usa";
            usa.Width = 42;
            usa.SortMode = DataGridViewColumnSortMode.NotSortable;
            griglia.Columns.Add(usa);
            string[] titoli = { "Classe", "Cerca nell'oggetto (separate da virgole)", "Studenti", "Da dove" };
            int[] larghe = { 90, 0, 200, 90 };
            for (int i = 0; i < titoli.Length; i++)
            {
                DataGridViewTextBoxColumn c = new DataGridViewTextBoxColumn();
                c.HeaderText = titoli[i];
                c.ReadOnly = (i != 1);
                c.SortMode = DataGridViewColumnSortMode.NotSortable;
                if (larghe[i] == 0) c.AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
                else c.Width = larghe[i];
                griglia.Columns.Add(c);
            }
            griglia.CurrentCellDirtyStateChanged += delegate
            {
                if (griglia.IsCurrentCellDirty && griglia.CurrentCell is DataGridViewCheckBoxCell)
                    griglia.CommitEdit(DataGridViewDataErrorContexts.Commit);
            };
            griglia.CellValueChanged += delegate(object o, DataGridViewCellEventArgs e)
            {
                if (riempiendo || e.RowIndex < 0 || e.RowIndex >= Classi.Count) return;
                object v = griglia.Rows[e.RowIndex].Cells[e.ColumnIndex].Value;
                if (e.ColumnIndex == 0) Classi[e.RowIndex].Spuntata = v is bool && (bool)v;
                else if (e.ColumnIndex == 2) Classi[e.RowIndex].Oggetto = Convert.ToString(v) ?? "";
            };
            griglia.CurrentCellChanged += delegate
            {
                if (!riempiendo && griglia.CurrentRow != null) Scegli(griglia.CurrentRow.Index);
            };
            griglia.AccessibleName = "Le classi";
            Controls.Add(griglia);
            y += griglia.Height + 8;

            Label lblN = Tema.Testo1("Aggiungi una classe", 16, y + 4, 0, Tema.Normale, Ruolo.Normale);
            Controls.Add(lblN);
            int xn = 16 + TextRenderer.MeasureText(lblN.Text, Tema.Normale).Width + 12;
            txtNuova = Tema.Casella(xn, y, 110, "per es. 3B");
            Controls.Add(txtNuova);
            Controls.Add(Tema.Bottone("Aggiungi", xn + 120, y - 1, 100, delegate
            {
                int i = Aggiungi(txtNuova.Text);
                if (i < 0) return;
                txtNuova.Text = "";
                Scegli(i);
            }));
            y += 42;

            lblTitoloIncolla = Tema.Testo1("", 16, y, 0, Tema.Grassetto, Ruolo.Normale);
            lblTitoloIncolla.AutoSize = false;
            lblTitoloIncolla.Width = 560;
            lblTitoloIncolla.Height = Tema.AltezzaTesto("Gli indirizzi degli studenti della 3B LSA", Tema.Grassetto, 560);
            Controls.Add(lblTitoloIncolla);
            Controls.Add(Tema.Aiuto(16 + 566, y + 2, "Dove prendere gli indirizzi degli studenti",
                "Per esempio da Google Classroom: apri il corso, scheda Persone, spunta la casella sopra l'elenco " +
                "degli studenti e scegli Azioni -> Invia email. Gmail apre un messaggio con tutti gli indirizzi nel " +
                "campo A: selezionali, copiali (Ctrl+C) e incollali qui, poi chiudi il messaggio senza mandarlo. " +
                "I nomi dei menu di Classroom possono cambiare.\r\n\r\n" +
                "Oppure, se la scuola ha un gruppo Google per la classe, dall'elenco dei membri del gruppo.\r\n\r\n" +
                "Va bene qualunque testo: Campanella prende solo gli indirizzi email, anche nella forma Nome " +
                "Cognome <indirizzo>, in minuscolo e una volta sola. Quelli del personale (l'elenco del passo 3, la " +
                "dirigenza e la segreteria) li toglie: un collega fra gli studenti avrebbe l'etichetta della classe " +
                "su tutta la sua posta.\r\n\r\n" +
                "Poi premi \"Copia\" e nel progetto dello script crea un file nuovo (+ accanto a File -> Script) con " +
                "il nome che vedi, per esempio Classe_3B, e incollaci il testo. Campanella non conserva gli " +
                "indirizzi: per cambiarli incollali di nuovo qui e sostituisci il file."));
            y += lblTitoloIncolla.Height + 4;

            txtIncolla = Tema.CasellaMulti(16, y, Larga, 84, "incolla qui gli indirizzi (Ctrl+V)");
            txtIncolla.ScrollBars = ScrollBars.Vertical;
            txtIncolla.TextChanged += delegate
            {
                if (riempiendo || scelta < 0) return;
                Incolla(scelta, txtIncolla.Text);
            };
            Controls.Add(txtIncolla);
            y += txtIncolla.Height + 6;

            btnCopia = Tema.Bottone("Copia Classe_3B.gs", 16, y, 230, delegate { CopiaFile(scelta); });
            Controls.Add(btnCopia);
            lblAvviso = Tema.Testo1("", 16 + 242, y + 2, Larga - 242, Tema.Normale, Ruolo.Tenue);
            lblAvviso.AutoSize = false;
            // alta quanto l'avviso piu' lungo che Avviso puo' scrivere
            lblAvviso.Height = Tema.AltezzaTesto(AvvisoPiuLungo(), Tema.Normale, lblAvviso.Width);
            Controls.Add(lblAvviso);
            y += Math.Max(36, lblAvviso.Height + 6);

            chkVecchie = Tema.Spunta("", 16, y, Ruolo.Normale);
            Controls.Add(chkVecchie);
            y += 26;
            lblNotaVecchie = Tema.Testo1("", 16, y, Larga, Tema.Normale, Ruolo.Tenue);
            lblNotaVecchie.AutoSize = false;
            lblNotaVecchie.Height = Tema.AltezzaTesto(NotaVecchie(), Tema.Normale, Larga);
            Controls.Add(lblNotaVecchie);
            y += lblNotaVecchie.Height + 4;

            Label gmail = Tema.Testo1(
                "Le etichette in Gmail non si cancellano mai: togliendo una classe resta la sua etichetta, con i " +
                "messaggi. Dopo \"Usa queste classi\" copia di nuovo la configurazione (passo 5), e i file delle classi.",
                16, y, Larga, Tema.Normale, Ruolo.Tenue);
            Controls.Add(gmail);
            y += gmail.Height + 10;

            Button ok = Tema.BottonePrincipale("Usa queste classi", 16 + Larga - 200, y, 200, null);
            ok.Click += delegate
            {
                if (!Confermato()) return;
                DialogResult = DialogResult.OK;
            };
            Controls.Add(ok);
            Button ann = Tema.Bottone("Annulla", 16 + Larga - 200 - 98, y + 2, 90, null);
            ann.DialogResult = DialogResult.Cancel;
            Controls.Add(ann);
            CancelButton = ann;
            ClientSize = new Size(16 + Larga + 16, y + 34 + 16);

            Riempi(s);
            txtMadre.TextChanged += delegate { CambiaMadre(); };
            CambiaMadre();
            Tema.Applica(this);
        }

        /// <summary>L'etichetta madre scritta adesso (vuota: "Classi").</summary>
        public string Madre
        {
            get { return LeMieClassi.Madre(txtMadre.Text); }
            set { txtMadre.Text = value ?? ""; }
        }

        /// <summary>Togliere le regole delle classi sotto un'altra etichetta madre (di partenza no).</summary>
        public bool TogliVecchie
        {
            get { return Vecchie.Count > 0 && chkVecchie.Checked; }
            set { chkVecchie.Checked = value; }
        }

        /// <summary>
        /// Le classi di partenza: quelle che hanno gia' la regola sotto l'etichetta
        /// madre (spuntate), poi quelle dell'orario e di Cartelle, spuntate solo
        /// se di classi non ce n'e' ancora nessuna (la prima volta, o l'anno nuovo).
        /// </summary>
        void Riempi(Stato s)
        {
            string madre = Madre;
            foreach (Regola r in s.Regole)
            {
                string c = LeMieClassi.ClasseDi(r);
                if (c == null || !LeMieClassi.SottoMadre(r, madre) || Indice(c) >= 0) continue;
                ClasseScelta x = new ClasseScelta();
                x.Nome = c;
                x.Spuntata = true;
                x.Oggetto = string.Join(", ", r.Oggetto.ToArray());
                x.Provenienza = "regola";
                x.Regola = r;
                Classi.Add(x);
            }
            bool primaVolta = Classi.Count == 0;
            Metti(LeMieClassi.DalleLezioni(s), "orario", primaVolta);
            Metti(LeMieClassi.DaCartelle(s), "Cartelle", primaVolta);
            Ordina();
            AggiornaGriglia();
            if (Classi.Count > 0) Scegli(0); else Scegli(-1);
        }

        void Metti(List<string> nomi, string da, bool spuntate)
        {
            foreach (string n in nomi)
            {
                if (LeMieClassi.Chiave(n) == "" || Indice(n) >= 0) continue;
                ClasseScelta x = new ClasseScelta();
                x.Nome = LeMieClassi.Nome(n);
                x.Spuntata = spuntate;
                x.Oggetto = string.Join(", ", LeMieClassi.Varianti(n).ToArray());
                x.Provenienza = da;
                Classi.Add(x);
            }
        }

        void Ordina()
        {
            Classi.Sort(delegate(ClasseScelta a, ClasseScelta b)
            {
                return string.CompareOrdinal(LeMieClassi.Chiave(a.Nome), LeMieClassi.Chiave(b.Nome));
            });
        }

        /// <summary>La riga della classe (3B, 3 B e 3^B sono la stessa), o -1.</summary>
        int Indice(string nome)
        {
            string k = LeMieClassi.Chiave(nome);
            for (int i = 0; i < Classi.Count; i++)
                if (LeMieClassi.Chiave(Classi[i].Nome) == k) return i;
            return -1;
        }

        /// <summary>Aggiunge a mano una classe, spuntata; se c'e' gia', la sua riga. -1 se il nome e' vuoto.</summary>
        public int Aggiungi(string nome)
        {
            if (LeMieClassi.Chiave(nome) == "") return -1;
            int gia = Indice(nome);
            if (gia >= 0) return gia;
            ClasseScelta x = new ClasseScelta();
            x.Nome = LeMieClassi.Nome(nome);
            x.Oggetto = string.Join(", ", LeMieClassi.Varianti(nome).ToArray());
            x.Provenienza = "a mano";
            x.Regola = LeMieClassi.RegolaDellaClasse(stato, Madre, LeMieClassi.Chiave(nome));
            Classi.Add(x);
            Ordina();
            AggiornaGriglia();
            return Indice(nome);
        }

        void AggiornaGriglia()
        {
            riempiendo = true;
            try
            {
                griglia.Rows.Clear();
                foreach (ClasseScelta c in Classi)
                    griglia.Rows.Add(c.Spuntata, c.Nome, c.Oggetto, Studenti(c), c.Provenienza);
            }
            finally { riempiendo = false; }
            lblNessuna.Visible = Classi.Count == 0;
        }

        /// <summary>La colonna "Studenti": quanti indirizzi incollati, o che non si conservano.</summary>
        static string Studenti(ClasseScelta c)
        {
            if (c.Indirizzi != null && c.Indirizzi.Count > 0)
                return c.Indirizzi.Count + " incollati" + (c.Copiato ? ", file copiato" : ", da copiare");
            return (c.Regola != null) ? "non conservati" : "nessuno";
        }

        /// <summary>Sceglie la classe i: la casella degli indirizzi e il bottone del file sono i suoi.</summary>
        public void Scegli(int i)
        {
            scelta = (i >= 0 && i < Classi.Count) ? i : -1;
            riempiendo = true;
            try
            {
                if (scelta >= 0 && (griglia.CurrentRow == null || griglia.CurrentRow.Index != scelta) &&
                    scelta < griglia.Rows.Count)
                    griglia.CurrentCell = griglia.Rows[scelta].Cells[1];
                ClasseScelta c = (scelta >= 0) ? Classi[scelta] : null;
                txtIncolla.Text = (c != null && c.Indirizzi != null) ? string.Join("\r\n", c.Indirizzi.ToArray()) : "";
                txtIncolla.Enabled = c != null;
            }
            finally { riempiendo = false; }
            AggiornaScelta();
        }

        void AggiornaScelta()
        {
            ClasseScelta c = (scelta >= 0) ? Classi[scelta] : null;
            lblTitoloIncolla.Text = (c == null) ? "Gli indirizzi degli studenti: scegli una classe"
                                                : "Gli indirizzi degli studenti della " + c.Nome;
            btnCopia.Text = "Copia " + LeMieClassi.NomeFile(c == null ? "3B" : c.Nome);
            btnCopia.Enabled = c != null && c.Indirizzi != null && c.Indirizzi.Count > 0;
            lblAvviso.Text = (c == null) ? "" : Avviso(scelta);
            lblAvviso.Tag = (c != null && c.Indirizzi != null && c.Indirizzi.Count > LeMieClassi.TroppiStudenti)
                ? Ruolo.Avviso : Ruolo.Tenue;
            Tema.Applica(lblAvviso);
        }

        /// <summary>
        /// Gli indirizzi incollati per la classe i: solo gli indirizzi email del
        /// testo, senza quelli del personale; il testo vuoto, nessuno. Restano in
        /// memoria finche' la finestra e' aperta.
        /// </summary>
        public void Incolla(int i, string testo)
        {
            if (i < 0 || i >= Classi.Count) return;
            ClasseScelta c = Classi[i];
            c.Tolti = new List<string>();
            List<string> letti = LeMieClassi.Indirizzi(testo);
            c.Indirizzi = ((testo ?? "").Trim() == "") ? null : LeMieClassi.TogliPersonale(letti, stato, c.Tolti);
            c.Copiato = false;
            riempiendo = true;
            try { if (i < griglia.Rows.Count) griglia.Rows[i].Cells[3].Value = Studenti(c); }
            finally { riempiendo = false; }
            if (i == scelta) AggiornaScelta();
        }

        /// <summary>Che cosa dire degli studenti della classe i: quanti, quelli tolti, se sembrano troppi; mai quali.</summary>
        public string Avviso(int i)
        {
            if (i < 0 || i >= Classi.Count) return "";
            ClasseScelta c = Classi[i];
            string file = LeMieClassi.NomeFile(c.Nome);
            int tolti = (c.Tolti == null) ? 0 : c.Tolti.Count;
            string delPersonale = (tolti == 0) ? "" : " " + tolti + " del personale " + (tolti == 1 ? "tolto" : "tolti") +
                                  " (sono nell'elenco del passo 3).";
            if (c.Indirizzi != null && c.Indirizzi.Count > 0)
            {
                int n = c.Indirizzi.Count;
                return n + (n == 1 ? " indirizzo." : " indirizzi.") + delPersonale +
                       (n > LeMieClassi.TroppiStudenti
                           ? " Sono piu' di " + LeMieClassi.TroppiStudenti + ": sembra piu' di una classe, controlla di " +
                             "aver copiato quella giusta."
                           : "") +
                       " Adesso copia " + file + " e incollalo nel progetto dello script: chiusa la finestra, " +
                       "Campanella li dimentica.";
            }
            if (c.Indirizzi != null)
                return "Nel testo incollato non c'e' nessun indirizzo di uno studente." + delPersonale;
            if (c.Regola != null)
                return "Gli indirizzi degli studenti Campanella non li conserva: se " + file + " e' gia' nel progetto " +
                       "dello script, la regola li usa. Per cambiarli incollali qui di nuovo e copia di nuovo il file.";
            return "Nessun indirizzo incollato: senza " + file + " nel progetto la regola prende solo i messaggi con " +
                   "la classe nell'oggetto.";
        }

        string AvvisoPiuLungo()
        {
            ClasseScelta prova = new ClasseScelta();
            prova.Nome = "3B LSA";
            prova.Indirizzi = new List<string>();
            for (int k = 0; k < 100; k++) prova.Indirizzi.Add("x");
            prova.Tolti = new List<string>(new string[] { "a", "b" });
            Classi.Add(prova);
            string a = Avviso(Classi.Count - 1);
            prova.Indirizzi = null;
            prova.Regola = new Regola();
            string b = Avviso(Classi.Count - 1);
            Classi.RemoveAt(Classi.Count - 1);
            return (Tema.AltezzaTesto(a, Tema.Normale, Larga - 242) >= Tema.AltezzaTesto(b, Tema.Normale, Larga - 242)) ? a : b;
        }

        /// <summary>Il testo del file Classe_*.gs della classe i, con gli indirizzi incollati; "" se non ce ne sono.</summary>
        public string TestoFile(int i)
        {
            if (i < 0 || i >= Classi.Count) return "";
            ClasseScelta c = Classi[i];
            if (c.Indirizzi == null || c.Indirizzi.Count == 0) return "";
            string nome = (c.Regola != null && LeMieClassi.ClasseDi(c.Regola) != null) ? LeMieClassi.ClasseDi(c.Regola) : c.Nome;
            return LeMieClassi.FileClasse(nome, Madre + "/" + nome, c.Indirizzi, DateTime.Now);
        }

        /// <summary>Copia il file della classe negli appunti, fuori dalla cronologia di Windows. Niente file su disco.</summary>
        void CopiaFile(int i)
        {
            string testo = TestoFile(i);
            if (testo == "") return;
            for (int tentativo = 0; tentativo < 3; tentativo++)
            {
                try
                {
                    Guscio.MettiNegliAppunti(testo);
                    Classi[i].Copiato = true;
                    riempiendo = true;
                    try { if (i < griglia.Rows.Count) griglia.Rows[i].Cells[3].Value = Studenti(Classi[i]); }
                    finally { riempiendo = false; }
                    MessageBox.Show(this, "Copiato negli appunti.\n\nNel progetto dello script crea un file nuovo (+ accanto " +
                        "a File -> Script), chiamalo " + LeMieClassi.NomeFile(Classi[i].Nome).Replace(".gs", "") +
                        " e incolla con Ctrl+V; se c'e' gia', sostituisci tutto il suo testo. Poi salva (Ctrl+S).",
                        "Fatto", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                catch (System.Runtime.InteropServices.ExternalException) { System.Threading.Thread.Sleep(120); }
            }
            MessageBox.Show(this, "Windows non mi ha lasciato usare gli appunti: di solito e' un altro programma che li " +
                "tiene occupati per un istante.\n\nRiprova.", "Appunti occupati", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        /// <summary>Con indirizzi incollati e non copiati, chiede prima di chiudere: chiusa la finestra spariscono.</summary>
        bool Confermato()
        {
            List<string> nonCopiati = new List<string>();
            foreach (ClasseScelta c in Classi)
                if (c.Spuntata && c.Indirizzi != null && c.Indirizzi.Count > 0 && !c.Copiato)
                    nonCopiati.Add(LeMieClassi.NomeFile(c.Nome));
            if (nonCopiati.Count == 0) return true;
            return MessageBox.Show(this, "Non hai copiato " + string.Join(", ", nonCopiati.ToArray()) + ". Campanella non " +
                "conserva gli indirizzi degli studenti: chiusa la finestra spariscono, e per quei file andranno " +
                "incollati di nuovo.\n\nChiudere lo stesso?", "File delle classi non copiati",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
        }

        /// <summary>
        /// L'etichetta madre e' cambiata: le regole delle classi sotto un'altra
        /// madre sono quelle dell'anno prima, e ogni classe ritrova la sua regola
        /// sotto quella di adesso.
        /// </summary>
        void CambiaMadre()
        {
            string madre = Madre;
            lblMadre.Text = "In Gmail: " + madre + "/" + (Classi.Count > 0 ? Classi[0].Nome : "3B") + ", " + madre + "/...";
            Vecchie = new List<Regola>();
            foreach (Regola r in stato.Regole)
                if (LeMieClassi.ClasseDi(r) != null && !LeMieClassi.SottoMadre(r, madre)) Vecchie.Add(r);
            foreach (ClasseScelta c in Classi)
                c.Regola = LeMieClassi.RegolaDellaClasse(stato, madre, LeMieClassi.Chiave(c.Nome));
            chkVecchie.Text = TestoVecchie();
            chkVecchie.Visible = Vecchie.Count > 0;
            lblNotaVecchie.Text = NotaVecchie();
            lblNotaVecchie.Visible = Vecchie.Count > 0;
            if (scelta >= 0) AggiornaScelta();
        }

        /// <summary>"Togli le regole delle classi del 2026-27 (2)": la spunta per le classi dell'anno prima.</summary>
        public string TestoVecchie()
        {
            List<string> madri = new List<string>();
            foreach (Regola r in Vecchie)
            {
                string e = r.Etichetta ?? "";
                string m = (e.LastIndexOf('/') > 0) ? e.Substring(0, e.LastIndexOf('/')) : e;
                if (!madri.Contains(m)) madri.Add(m);
            }
            string di;
            if (madri.Count == 1)
            {
                Match anno = Regex.Match(madri[0], @"\d{4}-\d{2}");
                di = anno.Success ? "del " + anno.Value : "di \"" + madri[0] + "\"";
            }
            else di = "di \"" + string.Join("\", \"", madri.ToArray()) + "\"";
            return "Togli le regole delle classi " + di + " (" + Vecchie.Count + ")";
        }

        /// <summary>Quello che Campanella non puo' togliere da solo, per le classi dell'anno prima.</summary>
        public string NotaVecchie()
        {
            return "Nel progetto dello script cancella tu i loro file Classe_*.gs, con gli indirizzi degli studenti, e se " +
                   "avevi creato i filtri veri di Gmail togli anche i loro (Gmail -> Impostazioni -> Filtri e indirizzi " +
                   "bloccati): Campanella non puo' farlo.";
        }
    }

    /// <summary>
    /// Un colore di etichetta, disegnato come Gmail mostra l'etichetta accanto
    /// a un messaggio: lo sfondo, con un filo intorno, e sopra la scritta nel
    /// colore del testo. "" e' nessun colore: bordo tratteggiato e scritta
    /// tenue. Deriva da Control, non da Label o Button, cosi' Tema.Applica non
    /// gli rifa' i colori. Si sceglie con il clic, o con Invio e spazio quando
    /// ha lo stato attivo.
    /// </summary>
    class Campione : Control
    {
        string colore = "";
        bool scelto = false;

        public Campione(string scritta, string colore, int x, int y, int w, int h)
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor | ControlStyles.Selectable, true);
            BackColor = Color.Transparent;
            Text = scritta ?? "";
            this.colore = ColoriEtichette.Pulito(colore);
            Location = new Point(x, y);
            Size = new Size(w, h);
            Font = Tema.Normale;
            Cursor = Cursors.Hand;
            TabStop = true;
            AccessibleRole = AccessibleRole.PushButton;
            AccessibleName = Text;
            AccessibleDescription = Descrizione(this.colore);
        }

        /// <summary>"sfondo/testo", oppure "" per nessun colore.</summary>
        public string Colore
        {
            get { return colore; }
            set { colore = ColoriEtichette.Pulito(value); AccessibleDescription = Descrizione(colore); Invalidate(); }
        }

        /// <summary>Il colore scelto adesso: ha intorno il bordo dell'accento.</summary>
        public bool Scelto
        {
            get { return scelto; }
            set { if (scelto != value) { scelto = value; Invalidate(); } }
        }

        /// <summary>Un colore detto a parole, per i suggerimenti e per chi legge lo schermo.</summary>
        public static string Descrizione(string colore)
        {
            string c = ColoriEtichette.Pulito(colore);
            if (c == "") return "nessun colore: l'etichetta resta del grigio di Gmail";
            return "sfondo " + ColoriEtichette.Sfondo(c) + ", testo " +
                   (ColoriEtichette.TestoDi(c) == "#ffffff" ? "bianco" :
                    ColoriEtichette.TestoDi(c) == "#000000" ? "nero" : ColoriEtichette.TestoDi(c));
        }

        protected override void OnTextChanged(EventArgs e)
        {
            base.OnTextChanged(e);
            AccessibleName = Text;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            // 3 pixel tutto intorno per il bordo della scelta
            Rectangle r = new Rectangle(3, 3, Math.Max(1, Width - 7), Math.Max(1, Height - 7));
            Color testo;
            if (colore == "")
            {
                using (SolidBrush b = new SolidBrush(Tema.Campo)) g.FillRectangle(b, r);
                using (Pen p = new Pen(Tema.CampoBordo))
                {
                    p.DashStyle = DashStyle.Dash;
                    g.DrawRectangle(p, r);
                }
                testo = Tema.Tenue;
            }
            else
            {
                using (SolidBrush b = new SolidBrush(ColorTranslator.FromHtml(ColoriEtichette.Sfondo(colore))))
                    g.FillRectangle(b, r);
                // un filo tutto intorno: le sfumature chiare sul tema chiaro, e
                // quelle scure sullo scuro, se no si confondono con la pagina
                using (Pen p = new Pen(Tema.Tenue)) g.DrawRectangle(p, r);
                testo = ColorTranslator.FromHtml(ColoriEtichette.TestoDi(colore));
            }
            if (Text != "")
                TextRenderer.DrawText(g, Text, Font, r, testo,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter |
                    TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
            if (scelto)
                using (Pen p = new Pen(Tema.Accento, 2)) g.DrawRectangle(p, 1, 1, Width - 3, Height - 3);
            else if (Focused)
                using (Pen p = new Pen(Tema.Testo))
                {
                    p.DashStyle = DashStyle.Dot;
                    g.DrawRectangle(p, 1, 1, Width - 3, Height - 3);
                }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (CanFocus) Focus();
            base.OnMouseDown(e);
        }

        protected override bool IsInputKey(Keys tasto)
        {
            // Invio sceglie il colore, non preme il bottone predefinito della finestra
            return tasto == Keys.Enter || base.IsInputKey(tasto);
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter)
            {
                e.Handled = true;
                OnClick(EventArgs.Empty);
                return;
            }
            base.OnKeyDown(e);
        }

        protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
        protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
    }

    /// <summary>
    /// Il colore dell'etichetta di una regola, dalla tavolozza di Gmail (Gmail
    /// non ne accetta altri), oppure nessun colore. Per Colleghi, con le
    /// sottoetichette dei ruoli accese, anche quello di ogni sottoetichetta:
    /// di partenza una sfumatura del colore di Colleghi, che lo segue quando
    /// cambia; oppure uno scelto a mano, compreso "nessun colore".
    /// </summary>
    class FormColore : Form
    {
        /// <summary>Il colore della regola: "sfondo/testo", "" = nessun colore.</summary>
        public string Colore;
        /// <summary>I colori dei ruoli scelti a mano (una copia): chi non c'e' segue Colleghi.</summary>
        public Dictionary<string, string> ColoriRuoli;

        readonly string etichetta;
        readonly List<string> categorie;
        string bersaglio = null;                  // null = la regola, se no una categoria
        readonly Campione campioneRegola;
        readonly Dictionary<string, Campione> campioniRuoli = new Dictionary<string, Campione>();
        readonly List<Campione> tavolozza = new List<Campione>();
        readonly Campione nessuno;
        readonly Button btnSegui;
        readonly Label lblNota;
        readonly ToolTip suggerimenti = new ToolTip();

        public FormColore(string etichetta, string colore, List<string> categorie,
                          Dictionary<string, string> coloriRuoli, string daScegliere)
        {
            this.etichetta = etichetta ?? "";
            this.categorie = categorie ?? new List<string>();
            Colore = ColoriEtichette.Pulito(colore);
            ColoriRuoli = new Dictionary<string, string>();
            if (coloriRuoli != null)
                foreach (KeyValuePair<string, string> kv in coloriRuoli) ColoriRuoli[kv.Key] = kv.Value;

            Text = "Colore di " + this.etichetta;
            StartPosition = FormStartPosition.CenterParent;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            ShowInTaskbar = false;
            Disposed += delegate { suggerimenti.Dispose(); };
            const int larga = 552;

            int y = 14;
            Label spiega = Tema.Testo1(
                "Clicca un colore. Gmail accetta solo quelli della sua tavolozza, e in Gmail li mette il " +
                "servizio Gmail API (passo 8 dell'installazione guidata).",
                16, y, larga, Tema.Normale, Ruolo.Tenue);
            Controls.Add(spiega);
            y += spiega.Height + 8;

            Label lblEt = Tema.Testo1("Etichetta", 16, y + 6, 0, Tema.Grassetto, Ruolo.Normale);
            Controls.Add(lblEt);
            int x0 = 16 + TextRenderer.MeasureText(lblEt.Text, Tema.Grassetto).Width + 16;
            campioneRegola = new Campione(this.etichetta, Colore, x0, y, Larghezza(this.etichetta, 300), 30);
            campioneRegola.Click += delegate { Scegli(null); };
            Controls.Add(campioneRegola);
            y += 40;

            if (this.categorie.Count > 0)
            {
                Label lblR = Tema.Testo1("Sottoetichette dei ruoli: " + this.etichetta + "/...", 16, y, 0,
                                         Tema.Grassetto, Ruolo.Normale);
                Controls.Add(lblR);
                y += 26;
                int x = 16;
                foreach (string c in this.categorie)
                {
                    int w = Larghezza(c, 160);
                    if (x + w > 16 + larga) { x = 16; y += 36; }
                    Campione cr = new Campione(c, ColoreDelRuolo(c), x, y, w, 30);
                    string categoria = c;
                    cr.Click += delegate { Scegli(categoria); };
                    campioniRuoli[c] = cr;
                    Controls.Add(cr);
                    x += w + 6;
                }
                y += 40;
            }

            Controls.Add(Tema.Testo1("Tavolozza di Gmail", 16, y, 0, Tema.Grassetto, Ruolo.Normale));
            y += 26;
            int righe = 0;
            for (int t = 0; t < ColoriEtichette.Tinte.Length; t++)
            {
                string[] tinta = ColoriEtichette.Tinte[t];
                for (int k = 0; k < tinta.Length; k++)
                {
                    string coppia = ColoriEtichette.Coppia(tinta[k]);
                    Campione c = new Campione("a", coppia, 16 + t * 55, y + k * 32, 52, 30);
                    c.AccessibleName = coppia;
                    c.Click += delegate { Metti(coppia); };
                    suggerimenti.SetToolTip(c, Campione.Descrizione(coppia));
                    tavolozza.Add(c);
                    Controls.Add(c);
                }
                righe = Math.Max(righe, tinta.Length);
            }
            y += righe * 32 + 8;

            nessuno = new Campione("nessun colore", "", 16, y, 150, 30);
            nessuno.Click += delegate { Metti(""); };
            suggerimenti.SetToolTip(nessuno, Campione.Descrizione(""));
            Controls.Add(nessuno);
            string segui = "Segui " + this.etichetta;
            btnSegui = Tema.Bottone(segui, 176, y, Math.Min(260, 26 + TextRenderer.MeasureText(segui, Tema.Normale).Width),
                                    delegate { Segui(); });
            Controls.Add(btnSegui);
            y += 40;

            // alta quanto la nota piu' lunga, che cambia con il colore che si sceglie
            lblNota = Tema.Testo1("", 16, y, larga, Tema.Normale, Ruolo.Tenue);
            lblNota.AutoSize = false;
            lblNota.Width = larga;
            lblNota.Height = Tema.AltezzaTesto(NotaPiuLunga(), Tema.Normale, larga);
            Controls.Add(lblNota);
            y += lblNota.Height + 10;

            Button ok = Tema.BottonePrincipale("Usa questi colori", 16 + larga - 180, y, 180, null);
            ok.DialogResult = DialogResult.OK;
            Controls.Add(ok);
            Button ann = Tema.Bottone("Annulla", 16 + larga - 180 - 98, y + 2, 90, null);
            ann.DialogResult = DialogResult.Cancel;
            Controls.Add(ann);
            CancelButton = ann;
            ClientSize = new Size(16 + larga + 16, y + 34 + 16);

            Scegli(daScegliere != null && this.categorie.Contains(daScegliere) ? daScegliere : null);
            Tema.Applica(this);
        }

        /// <summary>Quello che si sta colorando: null la regola, oppure una categoria.</summary>
        public string Bersaglio { get { return bersaglio; } }

        static int Larghezza(string scritta, int massimo)
        {
            return Math.Max(64, Math.Min(massimo, 26 + TextRenderer.MeasureText(scritta ?? "", Tema.Normale).Width));
        }

        string ColoreDelRuolo(string categoria)
        {
            return ColoriEtichette.DelRuolo(Colore, categoria, ColoriRuoli);
        }

        /// <summary>Sceglie che cosa colorare: la regola (null) o la sottoetichetta di una categoria.</summary>
        public void Scegli(string categoria)
        {
            bersaglio = categoria;
            Aggiorna();
        }

        /// <summary>Da' un colore a quello che si sta colorando ("" = nessun colore).</summary>
        public void Metti(string colore)
        {
            string c = ColoriEtichette.Pulito(colore);
            if (bersaglio == null) Colore = c;
            else ColoriRuoli[bersaglio] = c;
            Aggiorna();
        }

        /// <summary>La sottoetichetta scelta torna a seguire il colore della regola.</summary>
        public void Segui()
        {
            if (bersaglio != null) ColoriRuoli.Remove(bersaglio);
            Aggiorna();
        }

        void Aggiorna()
        {
            campioneRegola.Colore = Colore;
            campioneRegola.Scelto = (bersaglio == null && campioniRuoli.Count > 0);
            foreach (KeyValuePair<string, Campione> kv in campioniRuoli)
            {
                kv.Value.Colore = ColoreDelRuolo(kv.Key);
                kv.Value.Scelto = (bersaglio == kv.Key);
                suggerimenti.SetToolTip(kv.Value, etichetta + "/" + kv.Key + ": " + Campione.Descrizione(kv.Value.Colore));
            }
            string attuale = (bersaglio == null) ? Colore : ColoreDelRuolo(bersaglio);
            foreach (Campione c in tavolozza) c.Scelto = (c.Colore == attuale);
            nessuno.Scelto = (attuale == "");
            btnSegui.Visible = (bersaglio != null);
            btnSegui.Enabled = (bersaglio != null && ColoriRuoli.ContainsKey(bersaglio));
            lblNota.Text = Nota();
        }

        string Nota()
        {
            if (bersaglio != null)
            {
                string nome = etichetta + "/" + bersaglio;
                if (ColoriRuoli.ContainsKey(bersaglio))
                    return "Stai colorando " + nome + ", con un colore scelto a mano. \"Segui " + etichetta +
                           "\" la rimette sulla sfumatura del colore di " + etichetta + ".";
                return "Stai colorando " + nome + ": adesso ha una sfumatura del colore di " + etichetta +
                       (Colore == "" ? " (che non ha colore, quindi nemmeno lei)" : "") +
                       " e lo segue se cambia. Clicca un colore per sceglierne uno tu.";
            }
            if (campioniRuoli.Count > 0)
                return "Stai colorando " + etichetta + ". Le sottoetichette dei ruoli senza un colore scelto a " +
                       "mano prendono le sue sfumature: cliccane una per sceglierne il colore.";
            return "Stai colorando " + etichetta + ".";
        }

        string NotaPiuLunga()
        {
            string nome = etichetta + "/Amministrativi";
            string[] note =
            {
                "Stai colorando " + nome + ", con un colore scelto a mano. \"Segui " + etichetta +
                "\" la rimette sulla sfumatura del colore di " + etichetta + ".",
                "Stai colorando " + nome + ": adesso ha una sfumatura del colore di " + etichetta +
                " (che non ha colore, quindi nemmeno lei) e lo segue se cambia. Clicca un colore per sceglierne uno tu.",
                "Stai colorando " + etichetta + ". Le sottoetichette dei ruoli senza un colore scelto a " +
                "mano prendono le sue sfumature: cliccane una per sceglierne il colore."
            };
            string lunga = "";
            foreach (string n in note)
                if (Tema.AltezzaTesto(n, Tema.Normale, 552) > Tema.AltezzaTesto(lunga, Tema.Normale, 552)) lunga = n;
            return lunga;
        }
    }
}
