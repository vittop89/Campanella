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

    /// <summary>
    /// Aggiunge o modifica una regola di smistamento. Per Dirigenza, Segreteria
    /// e Registro elettronico i mittenti non si scrivono qui ma nella pagina
    /// "La tua scuola": al posto della casella c'e' l'avviso, e accanto il
    /// bottone "Apri La tua scuola", che chiude la finestra (chiedendo prima
    /// che cosa fare delle modifiche non salvate) e dice al passo 4 dove
    /// portare (ApriLaTuaScuola).
    /// </summary>
    class FormRegola : Form
    {
        TextBox txtEtichetta, txtDa, txtOggetto, txtQuery, txtDescrizione;
        CheckBox chkArchivia, chkLette, chkUno;
        public Regola Risultato;
        public bool Elimina = false;
        Regola originale;

        /// <summary>
        /// La Sorgente della regola ("dirigenza", "segreteria", "registro") se
        /// la finestra si e' chiusa con "Apri La tua scuola": il passo 4 porta
        /// alla pagina "La tua scuola", nella casella di quei mittenti. null
        /// altrimenti. Con le modifiche tenute la finestra si chiude con OK e
        /// Risultato, altrimenti con Cancel.
        /// </summary>
        public string ApriLaTuaScuola = null;

        /// <summary>Il bottone "Apri La tua scuola", solo per le regole di "La tua scuola"; null per le altre.</summary>
        Button btnScuola;

        /// <summary>
        /// Chiede che cosa fare delle modifiche non salvate (testo, titolo): Yes
        /// le tiene, No le lascia, Cancel resta nella finestra. Di partenza una
        /// finestra di Windows; le prove la sostituiscono, per rispondere senza.
        /// </summary>
        public Func<string, string, DialogResult> Chiedi;

        // i campi come erano all'apertura: per sapere se c'e' qualcosa da salvare
        string comeAllApertura;

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
                if (LeMieClassi.ClasseDi(Risultato) != null && txtOggetto.Text.IndexOf('@') >= 0)
                    MessageBox.Show(this, "Fra le parole dell'oggetto c'erano degli indirizzi: li ho tolti. Gli " +
                        "indirizzi degli studenti non stanno nella regola, si incollano in \"Le mie classi...\".",
                        "Indirizzi nell'oggetto", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
                    txtDa.Text = AvvisoMittenti;
                    txtEtichetta.ReadOnly = true;
                    // chi prova a scriverci non sa dove andare: il bottone ce lo porta,
                    // accanto alla casella, che si stringe per fargli posto
                    btnScuola = Tema.Bottone("Apri La tua scuola", 0, txtDa.Top, 0, delegate { VaiALaTuaScuola(); });
                    btnScuola.Width = 26 + TextRenderer.MeasureText(btnScuola.Text, btnScuola.Font).Width;
                    btnScuola.Left = txtDa.Right - btnScuola.Width;
                    txtDa.Width = btnScuola.Left - 8 - txtDa.Left;
                    Controls.Add(btnScuola);
                }
            }

            Chiedi = delegate(string testo, string titolo)
            {
                return MessageBox.Show(this, testo, titolo, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            };
            comeAllApertura = Campi();
            Tema.Applica(this);
        }

        /// <summary>I campi che si possono cambiare, in una stringa sola: diversa se qualcosa e' cambiato.</summary>
        string Campi()
        {
            return string.Join("\u0001", new string[] {
                txtEtichetta.Text, txtDa.Text, txtOggetto.Text, txtQuery.Text, txtDescrizione.Text,
                chkArchivia.Checked ? "1" : "0", chkLette.Checked ? "1" : "0", chkUno.Checked ? "1" : "0" });
        }

        /// <summary>
        /// "Apri La tua scuola": chiude la finestra come Annulla, e il passo 4
        /// porta alla pagina "La tua scuola" (ApriLaTuaScuola). Se nella regola
        /// qualcosa e' cambiato e non e' salvato chiede se tenerlo: si' salva e
        /// chiude con OK, come "Salva"; no lo lascia perdere; Annulla resta qui.
        /// </summary>
        void VaiALaTuaScuola()
        {
            if (originale == null || !originale.MittentiDallaScuola()) return;
            if (Campi() != comeAllApertura)
            {
                DialogResult r = Chiedi(
                    "In questa regola hai cambiato qualcosa che non hai ancora salvato. Lo tengo?\r\n\r\n" +
                    "Si': salvo le modifiche e apro \"La tua scuola\".\r\n" +
                    "No: le lascio perdere e apro \"La tua scuola\".\r\n" +
                    "Annulla: resto qui.",
                    "Modifiche non salvate");
                if (r == DialogResult.Yes)
                {
                    Risultato = Componi();
                    ApriLaTuaScuola = originale.Sorgente;
                    DialogResult = DialogResult.OK;
                    return;
                }
                if (r != DialogResult.No) return;
            }
            ApriLaTuaScuola = originale.Sorgente;
            DialogResult = DialogResult.Cancel;
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
            // per una classe un indirizzo fra le parole dell'oggetto sarebbe quello
            // di uno studente: non entra nella regola (ne' nello Stato)
            if (LeMieClassi.ClasseDi(r) != null)
                r.Oggetto.RemoveAll(delegate(string p) { return p.IndexOf('@') >= 0; });
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
    /// per ognuno fa scegliere che cosa farne, nella colonna "Che cosa fare"
    /// (FiltriGmail.Scelte): lasciarlo in Gmail, toglierlo, unire i suoi
    /// mittenti a una regola o farne una regola, con la stessa etichetta e la
    /// stessa ricerca. Di partenza la proposta di FiltriGmail.Proposta, e
    /// "toglilo" per quelli scelti prima. Per ogni filtro dice la ricerca che
    /// fara' la regola. Quelli che sembrano di una classe e cercano degli
    /// indirizzi non si possono togliere, nemmeno se scelti prima
    /// (FiltriGmail.DiUnaClasseConIndirizzi). La finestra non cambia niente:
    /// dopo "Usa questa scelta" Fatte va a FiltriGmail.Applica, che crea e
    /// aggiorna le regole e sceglie i filtri da togliere (li toglie lo script,
    /// con EXTRA_togliFiltri). Due filtri uguali vanno insieme: per lo script
    /// sono la stessa voce. Ogni riga della griglia sa di quale filtro e'
    /// (Tag): riordinata con un clic sull'intestazione, le scelte restano ai
    /// loro filtri.
    /// </summary>
    class FormFiltriGmail : Form
    {
        /// <summary>I filtri da togliere, dopo "Usa questa scelta".</summary>
        public List<FiltroDaTogliere> Scelti = new List<FiltroDaTogliere>();
        /// <summary>Ogni filtro con la sua scelta, dopo "Usa questa scelta": per FiltriGmail.Applica.</summary>
        public List<FiltroScelto> Fatte = new List<FiltroScelto>();

        class Riga
        {
            public FiltroGmail Filtro;          // null: una voce scelta prima, senza file
            public FiltroDaTogliere Voce;       // null: non si puo' togliere (niente etichetta, criteri, o uno non si capisce)
            public Somiglianza Somiglia;
            public bool Prima;                  // era gia' fra i filtri scelti
            public bool Orfana;                 // scelto prima, ma la regola che lo sostituiva non lo sostituisce piu' (FiltriGmail.AncoraSostituito)
            public List<SceltaFiltro> Scelte;   // quelle della tendina; la prima e' "Lascialo in Gmail"
            public SceltaFiltro PropostaPiena;  // la proposta per il filtro da solo (FiltriGmail.Proposta)
            public SceltaFiltro Proposta;       // quella di partenza, con le scelte delle altre righe (Rivedi)
            public string PercheResta = "";     // perche' la proposta piena non si puo' fare, con le altre scelte
            public SceltaFiltro Scelta;         // quella di adesso
            public bool AMano;                  // la scelta di adesso l'ha fatta il docente (Scegli)
            public DataGridViewRow Fila;        // la sua riga nella griglia, dovunque stia
        }

        readonly Stato stato;
        readonly List<Riga> righe = new List<Riga>();
        readonly DataGridView griglia;
        readonly Label lblEsito, lblConto;
        readonly TextBox txtDettaglio;
        bool fileAperto = false, riempiendo = false;
        // che cosa farebbe "Usa questa scelta" con le scelte di adesso (FiltriGmail.Prova): per il conto e il riquadro
        EsitoScelte esito = null;
        // i filtri scelti prima che sembrano di una classe e cercano degli indirizzi: non si tengono
        int sceltiDelleClassi = 0;
        const int Larga = 1100;
        const int ColFare = 0, ColEtichetta = 1, ColCerca = 2, ColFa = 3, ColRicerca = 4;

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
                "Un filtro che avevi gia' in Gmail continua a mettere la sua etichetta anche con Campanella. Qui " +
                "scegli che cosa farne: lasciarlo, toglierlo, unire i suoi mittenti a una regola o farne una regola " +
                "di Campanella, con la stessa etichetta e la stessa ricerca. I filtri li togliera' lo script, con " +
                "EXTRA_togliFiltri (serve il servizio Gmail API, passo 8 dell'installazione guidata).",
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
                "puoi cancellarlo. Campanella tiene i filtri da togliere, insieme all'elenco del personale, e le " +
                "regole che nascono o prendono i mittenti dei filtri.",
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
                "(999 da togliere; 999 restano: fanno anche altro; 999 restano: la regola non prende tutti i loro " +
                "messaggi; 999 restano per gli altri filtri, e il riquadro dice perche'), 999 creati da Campanella, " +
                "999 simili, 999 tuoi, " +
                "999 senza etichetta o senza criteri, 999 con un criterio che Campanella non capisce, 999 che " +
                "sembrano di una classe, con degli indirizzi (si tolgono in Gmail). In fondo, 999 scelti prima che " +
                "nel file non ci sono." + TestoDelleClassiTolti(999),
                Tema.Normale, lblEsito.Width);
            Controls.Add(lblEsito);
            y += Math.Max(38, lblEsito.Height + 10);

            griglia = new DataGridView();
            griglia.Location = new Point(16, y);
            griglia.Size = new Size(Larga, 290);
            griglia.Font = Tema.Normale;
            griglia.BorderStyle = BorderStyle.FixedSingle;
            griglia.AllowUserToAddRows = false;
            griglia.AllowUserToDeleteRows = false;
            griglia.AllowUserToResizeRows = false;
            griglia.RowHeadersVisible = false;
            griglia.MultiSelect = false;
            griglia.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            griglia.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            // che cosa fare: una tendina per riga, con le scelte di quel filtro
            DataGridViewComboBoxColumn fare = new DataGridViewComboBoxColumn();
            fare.HeaderText = "Che cosa fare";
            fare.Width = 330;
            fare.FlatStyle = FlatStyle.Flat;
            fare.DisplayStyle = DataGridViewComboBoxDisplayStyle.DropDownButton;
            griglia.Columns.Add(fare);
            // la ricerca della regola: quella nuova, quella che prende i mittenti
            // o quella che lo fa gia'; il resto e' nel dettaglio
            string[] titoli = { "Etichetta", "Che cosa cerca", "Che cosa fa", "La regola cerchera'" };
            int[] larghe = { 150, 0, 100, 270 };
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
                if (riempiendo || e.RowIndex < 0 || e.ColumnIndex != ColFare) return;
                Riga r = griglia.Rows[e.RowIndex].Tag as Riga;
                SceltaFiltro c = (r == null) ? null : FiltriGmail.Trova(r.Scelte, Convert.ToString(griglia.Rows[e.RowIndex].Cells[ColFare].Value));
                if (c != null) Scegli(righe.IndexOf(r), c);
            };
            // un clic sulla colonna delle scelte apre subito la tendina
            griglia.CellClick += delegate(object o, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex < 0 || e.ColumnIndex != ColFare || griglia.Rows[e.RowIndex].Cells[ColFare].ReadOnly) return;
                griglia.BeginEdit(true);
                ComboBox cb = griglia.EditingControl as ComboBox;
                if (cb != null) cb.DroppedDown = true;
            };
            // un valore che la tendina non ha (non dovrebbe succedere) non apre la finestra d'errore
            griglia.DataError += delegate(object o, DataGridViewDataErrorEventArgs e) { e.ThrowException = false; };
            // CurrentCellChanged, non SelectionChanged: quando arriva la
            // selezione CurrentRow e' ancora la riga di prima
            griglia.CurrentCellChanged += delegate { MostraDettaglio(); };
            // lo spazio passa dal lasciarlo alla proposta (o a toglierlo), e indietro
            griglia.KeyDown += delegate(object o, KeyEventArgs e)
            {
                if (e.KeyCode != Keys.Space || griglia.CurrentRow == null || griglia.IsCurrentCellInEditMode) return;
                int i = righe.IndexOf(griglia.CurrentRow.Tag as Riga);
                Spunta(i, !Spuntata(i));
                e.Handled = true;
            };
            griglia.AccessibleName = "Filtri di Gmail";
            Controls.Add(griglia);
            y += griglia.Height + 8;

            txtDettaglio = new TextBox();
            txtDettaglio.Location = new Point(16, y);
            txtDettaglio.Size = new Size(Larga, 120);
            txtDettaglio.Multiline = true;
            txtDettaglio.ReadOnly = true;
            txtDettaglio.ScrollBars = ScrollBars.Vertical;
            txtDettaglio.BorderStyle = BorderStyle.FixedSingle;
            txtDettaglio.Font = Tema.Normale;
            txtDettaglio.TabStop = false;
            Controls.Add(txtDettaglio);
            y += txtDettaglio.Height + 8;

            Label nota = Tema.Testo1(
                "Di partenza: si tolgono quelli che una regola accesa fa gia' (e che non fanno altro: non inoltrano, " +
                "non eliminano...) e quelli scelti prima; i mittenti di uno uguale o simile a una regola vanno in " +
                "quella regola, se si puo'; uno tuo diventa una regola; gli altri restano, e anche uno che con gli " +
                "altri filtri che restano non si puo' togliere (il riquadro dice perche'). Le regole nuove o cambiate " +
                "e i filtri da togliere vanno insieme nella " +
                "configurazione: copiala di nuovo (passo 5) prima di eseguire EXTRA_togliFiltri. Prima di togliere un " +
                "filtro lo script ne scrive una copia nel registro, per rifarlo a mano. Le etichette gia' messe ai " +
                "messaggi restano.",
                16, y, Larga, Tema.Normale, Ruolo.Tenue);
            Controls.Add(nota);
            y += nota.Height + 10;

            lblConto = Tema.Testo1("", 16, y + 8, Larga - 320, Tema.Grassetto, Ruolo.Normale);
            lblConto.AutoSize = false;
            lblConto.Height = Tema.AltezzaTesto("Da togliere: 999 filtri  -  regole nuove: 999  -  da unire a una regola: 999" +
                                                "  -  restano in Gmail lo stesso: 999", Tema.Grassetto, Larga - 320);
            Controls.Add(lblConto);
            Button ok = Tema.BottonePrincipale("Usa questa scelta", 16 + Larga - 200, y, 200, null);
            ok.Click += delegate
            {
                Scelti = SceltiAdesso();
                Fatte = FatteAdesso();
                DialogResult = DialogResult.OK;
            };
            Controls.Add(ok);
            Button ann = Tema.Bottone("Annulla", 16 + Larga - 200 - 98, y + 2, 90, null);
            ann.DialogResult = DialogResult.Cancel;
            Controls.Add(ann);
            CancelButton = ann;
            ClientSize = new Size(16 + Larga + 16, y + Math.Max(34, lblConto.Height + 8) + 16);

            // di partenza: i filtri scelti prima, da togliere. Non quelli che
            // sembrano di una classe e cercano degli indirizzi (scelti con la
            // 1.5.3, o prima di creare le classi sotto quell'etichetta): come nel
            // file, non si possono scegliere. Quelli gia' tolti all'avvio dallo
            // Stato si contano lo stesso: e' qui che si dice
            if (s != null) sceltiDelleClassi = s.FiltriClassiToltiAllAvvio;
            if (s != null && s.FiltriDaTogliere != null)
                foreach (FiltroDaTogliere f in s.FiltriDaTogliere)
                {
                    if (f == null) continue;
                    if (FiltriGmail.DiUnaClasseConIndirizzi(f.Etichetta, f.Criteri, s)) { sceltiDelleClassi++; continue; }
                    righe.Add(ScelteDiPrima(f.Copia(), FiltriGmail.Confronta(f.Etichetta, f.Criteri, s)));
                }
            lblEsito.Text = (righe.Count == 0
                ? "Nessun file aperto, e nessun filtro scelto prima."
                : "Nessun file aperto: qui sotto ci sono i filtri scelti prima.") + DelleClassiTolti();
            Rivedi();
            Riempi();
            Tema.Applica(this);
        }

        /// <summary>
        /// La riga di un filtro scelto prima, senza il file: si lascia o si
        /// toglie, e parte da togliere, con la regola che lo sostituisce ancora
        /// ("Toglilo: lo fa gia' la regola X": quella che ricorda, o per uno
        /// scelto con la 1.6.0 quella con la sua etichetta che lo sostituisce
        /// adesso, e che "Usa questa scelta" ricordera'). Se nessuna lo
        /// sostituisce piu' (orfana: la regola e' stata tolta, spenta, non ha
        /// piu' i suoi mittenti, o non archivia come lui) parte lasciato.
        /// </summary>
        Riga ScelteDiPrima(FiltroDaTogliere voce, Somiglianza x)
        {
            Riga r = new Riga();
            r.Voce = voce;
            r.Somiglia = x;
            r.Prima = true;
            r.Orfana = !FiltriGmail.AncoraSostituito(voce, stato);
            SceltaFiltro togli = new SceltaFiltro();
            togli.Azione = SceltaFiltro.Togli;
            togli.Testo = "Toglilo";
            if (!r.Orfana)
            {
                Regola chi = FiltriGmail.SceltoConLaVersioneDiPrima(voce) ? FiltriGmail.RegolaCheLoSostituisce(voce, stato)
                                                                           : FiltriGmail.RegolaCheLoSostituisceAncora(voce, stato);
                if (chi != null)
                {
                    togli.Regola = chi;
                    togli.Testo = "Toglilo: lo fa gia' la regola " + FiltriGmail.NomeIntero(chi, stato);
                }
            }
            r.Scelte = new List<SceltaFiltro>(new SceltaFiltro[] { new SceltaFiltro(), togli });
            r.PropostaPiena = r.Orfana ? r.Scelte[0] : togli;
            r.Proposta = r.PropostaPiena;
            r.Scelta = r.Proposta;
            return r;
        }

        /// <summary>
        /// Le proposte, con le scelte di adesso delle altre righe: una che
        /// toglierebbe il filtro, ma che "Usa questa scelta" rifiuterebbe
        /// (FiltriGmail.Prova: resta in Gmail un altro filtro con la stessa
        /// etichetta che non archivia, o con un'etichetta che la regola esclude,
        /// una copia che archivia diversamente...), diventa "Lascialo in Gmail",
        /// e il riquadro dice perche'. Le righe scelte a mano (e le loro copie,
        /// che vanno con loro) restano come sono, le altre ripartono dalla
        /// proposta per il filtro da solo. Poi tiene l'esito, per il conto e il
        /// riquadro.
        /// </summary>
        void Rivedi()
        {
            bool prima = riempiendo;
            riempiendo = true;
            try
            {
                List<string> aMano = new List<string>();
                foreach (Riga r in righe) if (r.AMano && r.Voce != null) aMano.Add(r.Voce.Chiave());
                foreach (Riga r in righe)
                {
                    if (r.AMano || (r.Voce != null && aMano.Contains(r.Voce.Chiave()))) continue;
                    r.Proposta = r.PropostaPiena ?? r.Scelte[0];
                    r.PercheResta = "";
                    if (r.Scelta != r.Proposta) Metti(r, r.Proposta);
                }
                esito = FiltriGmail.Prova(stato, FatteAdesso());
                foreach (Riga r in righe)
                {
                    if (r.AMano || r.Voce == null || aMano.Contains(r.Voce.Chiave()) || !r.Scelta.TogliIlFiltro) continue;
                    string perche = esito.PercheResta(r.Voce.Chiave());
                    if (perche == null) continue;
                    // la stessa scelta con le righe lasciate: l'esito non cambia
                    r.PercheResta = perche;
                    r.Proposta = r.Scelte[0];
                    Metti(r, r.Proposta);
                }
            }
            finally { riempiendo = prima; }
        }

        /// <summary>
        /// La scelta della tendina che fa la stessa cosa di c (la stessa azione,
        /// con la stessa regola): per due filtri uguali, che per lo script sono
        /// uno solo. null se non c'e'.
        /// </summary>
        static SceltaFiltro SceltaUguale(List<SceltaFiltro> scelte, SceltaFiltro c)
        {
            if (c == null) return null;
            foreach (SceltaFiltro x in scelte)
                if (x.Azione == c.Azione && (x.Regola == c.Regola || (c.Azione == SceltaFiltro.Togli && c.Regola == null)))
                    return x;
            return null;
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
        /// Mette nella finestra i filtri di un file, ognuno con la sua proposta
        /// (FiltriGmail.Proposta); quelli scelti prima partono da togliere,
        /// tranne quelli scelti con la 1.6.0 (FiltriGmail.SceltoConLaVersioneDiPrima),
        /// che partono dalla proposta di adesso, e quelli che la regola che
        /// ricordano non sostituisce piu' (con le azioni del file: in Gmail
        /// adesso possono archiviare o segnare come letto), che partono
        /// lasciati. Quelli scelti prima che nel file non ci sono restano, in
        /// fondo: forse sono gia' stati tolti. Due filtri uguali partono con la
        /// stessa scelta: il secondo si toglie se si toglie il primo. Poi le
        /// proposte si rivedono con quelle delle altre righe (Rivedi).
        /// </summary>
        public void Carica(List<FiltroGmail> filtri)
        {
            // le scelte di adesso (i filtri scelti prima, o quelli di un altro
            // file aperto poco fa) passano ai filtri uguali del file nuovo; quelli
            // scelti prima che il file nuovo non ha restano in fondo
            List<string> prima = new List<string>();
            Dictionary<string, string> regolaDiPrima = new Dictionary<string, string>();
            // quelli scelti con la 1.6.0, che li sceglieva per l'etichetta sola
            List<string> con160 = new List<string>();
            List<Riga> vecchie = new List<Riga>();
            for (int i = 0; i < righe.Count; i++)
            {
                Riga r = righe[i];
                if (r.Voce == null || prima.Contains(r.Voce.Chiave())) continue;
                if (!Spuntata(i))
                {
                    // scelto prima, lasciato perche' senza la sua regola (o per
                    // le altre scelte): resta in fondo, se il file non lo ha
                    if (r.Filtro == null && (r.Orfana || r.PercheResta != "")) vecchie.Add(r);
                    continue;
                }
                prima.Add(r.Voce.Chiave());
                regolaDiPrima[r.Voce.Chiave()] = r.Voce.Regola;
                if (FiltriGmail.SceltoConLaVersioneDiPrima(r.Voce)) con160.Add(r.Voce.Chiave());
                if (r.Filtro == null) vecchie.Add(r);
                else if (r.Prima) vecchie.Add(ScelteDiPrima(r.Voce.Copia(), r.Somiglia));
            }

            righe.Clear();
            List<string> nelFile = new List<string>();
            Dictionary<string, Riga> primaDellaVoce = new Dictionary<string, Riga>();
            foreach (FiltroGmail f in filtri ?? new List<FiltroGmail>())
            {
                Riga r = new Riga();
                r.Filtro = f;
                r.Somiglia = FiltriGmail.Confronta(f, stato);
                // quello degli studenti di una classe non si sceglie: la voce da
                // togliere porterebbe i loro indirizzi nello Stato e nella configurazione
                r.Voce = (r.Somiglia.Tipo == FiltriGmail.DiUnaClasse) ? null : f.DaTogliere();
                r.Prima = r.Voce != null && prima.Contains(r.Voce.Chiave());
                // la regola che lo sostituiva, per Applica: resta se lo sostituisce ancora
                if (r.Prima) r.Voce.Regola = regolaDiPrima[r.Voce.Chiave()];
                r.Scelte = (r.Voce == null) ? new List<SceltaFiltro>(new SceltaFiltro[] { new SceltaFiltro() })
                                            : FiltriGmail.Scelte(f, r.Somiglia, stato);
                // uno scelto con la 1.6.0 parte dalla proposta di adesso, come uno
                // nuovo: la 1.6.0 lo sceglieva per l'etichetta sola. Uno scelto con
                // la sua regola che adesso non lo sostituisce piu' (con quello che
                // il filtro fa in Gmail adesso) parte lasciato, come senza il file
                bool di160 = r.Prima && con160.Contains(r.Voce.Chiave());
                r.Orfana = r.Prima && !di160 && (r.Voce.Regola ?? "").Trim() != "" && !FiltriGmail.AncoraSostituito(r.Voce, stato);
                r.PropostaPiena = r.Orfana ? r.Scelte[0] : FiltriGmail.Proposta(r.Scelte, f, r.Somiglia, stato, r.Prima && !di160);
                if (r.Voce != null)
                {
                    string k = r.Voce.Chiave();
                    // lo stesso filtro due volte: per lo script e' una voce sola, e
                    // parte con la stessa scelta (o "Toglilo", se la sua tendina non l'ha)
                    if (primaDellaVoce.ContainsKey(k))
                    {
                        SceltaFiltro dellaPrima = primaDellaVoce[k].PropostaPiena;
                        r.PropostaPiena = !dellaPrima.TogliIlFiltro ? r.Scelte[0]
                            : (SceltaUguale(r.Scelte, dellaPrima) ?? FiltriGmail.Trova(r.Scelte, SceltaFiltro.Togli, null) ?? r.Scelte[0]);
                    }
                    else primaDellaVoce[k] = r;
                    nelFile.Add(k);
                }
                r.Proposta = r.PropostaPiena;
                r.Scelta = r.Proposta;
                righe.Add(r);
            }
            int mancano = 0;
            foreach (Riga v in vecchie)
            {
                if (nelFile.Contains(v.Voce.Chiave())) continue;
                righe.Add(v);
                mancano++;
            }
            fileAperto = true;
            Rivedi();
            int uguali = 0, ugualiDaTogliere = 0, ugualiAltro = 0, ugualiAltri = 0, diCampanella = 0, simili = 0, tuoi = 0,
                senza = 0, nonCapiti = 0, classi = 0;
            foreach (Riga r in righe)
            {
                if (r.Filtro == null) continue;
                string tipo = r.Somiglia.Tipo;
                if (tipo == FiltriGmail.Uguale)
                {
                    uguali++;
                    if (r.Proposta.TogliIlFiltro) ugualiDaTogliere++;
                    else if (r.Filtro.AltreAzioni.Count > 0) ugualiAltro++;
                    else if (r.PercheResta != "") ugualiAltri++;
                }
                else if (tipo == FiltriGmail.DiCampanella) diCampanella++;
                else if (tipo == FiltriGmail.Simile) simili++;
                else if (tipo == FiltriGmail.SenzaEtichetta || tipo == FiltriGmail.SenzaCriteri) senza++;
                else if (tipo == FiltriGmail.NonCapito) nonCapiti++;
                else if (tipo == FiltriGmail.DiUnaClasse) classi++;
                else tuoi++;
            }
            int n = (filtri == null) ? 0 : filtri.Count;
            List<string> parti = new List<string>();
            if (uguali > 0)
            {
                // restano quelli che fanno anche altro (inoltrano, eliminano...),
                // quelli di cui la regola non prende tutti i messaggi e quelli che
                // con le altre scelte non si possono togliere (Rivedi)
                string togli;
                int nonPresi = uguali - ugualiDaTogliere - ugualiAltro - ugualiAltri;
                if (ugualiDaTogliere == uguali) togli = (uguali == 1) ? "da togliere" : "tutti da togliere";
                else
                {
                    List<string> come = new List<string>();
                    if (ugualiDaTogliere > 0) come.Add(ugualiDaTogliere + " da togliere");
                    string altro = (ugualiAltro == 1) ? "resta: fa anche altro" : "restano: fanno anche altro";
                    string presi = (nonPresi == 1) ? "resta: la regola non prende tutti i suoi messaggi"
                                                   : "restano: la regola non prende tutti i loro messaggi";
                    string altri = (ugualiAltri == 1) ? "resta per gli altri filtri, e il riquadro dice perche'"
                                                      : "restano per gli altri filtri, e il riquadro dice perche'";
                    if (ugualiAltro > 0) come.Add(ugualiAltro == uguali ? altro : ugualiAltro + " " + altro);
                    if (nonPresi > 0) come.Add(nonPresi == uguali ? presi : nonPresi + " " + presi);
                    if (ugualiAltri > 0) come.Add(ugualiAltri == uguali ? altri : ugualiAltri + " " + altri);
                    togli = string.Join("; ", come.ToArray());
                }
                parti.Add(Quanti(uguali, "uguale", "uguali") + " a una regola di Campanella (" + togli + ")");
            }
            if (diCampanella > 0) parti.Add(Quanti(diCampanella, "creato", "creati") + " da Campanella");
            if (simili > 0) parti.Add(Quanti(simili, "simile", "simili"));
            if (tuoi > 0) parti.Add(Quanti(tuoi, "tuo", "tuoi"));
            if (senza > 0) parti.Add(senza + " senza etichetta o senza criteri");
            if (nonCapiti > 0) parti.Add(nonCapiti + " con un criterio che Campanella non capisce");
            if (classi > 0) parti.Add(classi == 1 ? "1 che sembra di una classe, con degli indirizzi (si toglie in Gmail)"
                                                  : classi + " che sembrano di una classe, con degli indirizzi (si tolgono in Gmail)");
            lblEsito.Text = (n == 0 ? "Nel file non ci sono filtri." :
                (n == 1 ? "Nel file c'e' 1 filtro: " : "Nel file ci sono " + n + " filtri: ") +
                string.Join(", ", parti.ToArray()) + ".") +
                (mancano > 0 ? " In fondo, " + Quanti(mancano, "scelto", "scelti") + " prima che nel file " +
                               (mancano == 1 ? "non c'e'." : "non ci sono.") : "") + DelleClassiTolti();
            Riempi();
        }

        static string Quanti(int n, string uno, string tanti) { return n + " " + (n == 1 ? uno : tanti); }

        /// <summary>I filtri scelti prima che sembrano di una classe e cercano degli indirizzi: non sono piu' scelti, e lo dice.</summary>
        string DelleClassiTolti()
        {
            return TestoDelleClassiTolti(sceltiDelleClassi);
        }

        /// <summary>Quello che DelleClassiTolti dice di n filtri; "" se n e' 0.</summary>
        static string TestoDelleClassiTolti(int n)
        {
            if (n == 0) return "";
            return n == 1
                ? " 1 filtro scelto prima sembra di una classe e cerca degli indirizzi: non e' piu' fra quelli da " +
                  "togliere (se non ti serve, toglilo in Gmail). " + Sostituisci(1)
                : " " + n + " filtri scelti prima sembrano di una classe e cercano degli indirizzi: non " +
                  "sono piu' fra quelli da togliere (se non ti servono, toglili in Gmail). " + Sostituisci(n);
        }

        /// <summary>
        /// Che cosa fare della configurazione gia' incollata quando dalla scelta
        /// sono usciti dei filtri con degli indirizzi (quelli delle classi): puo'
        /// averli ancora, con gli indirizzi (con la 1.5.3 li scriveva tutti), ed
        /// EXTRA_togliFiltri, togliendoli, ne scriverebbe la copia nel registro.
        /// Va sostituita con quella nuova.
        /// </summary>
        public static string Sostituisci(int n)
        {
            return "Copia di nuovo la configurazione (passo 5) e sostituisci quella nel progetto dello script: quella " +
                   "di prima puo' avere ancora " + (n == 1 ? "quel filtro" : "quei filtri") + ", con gli indirizzi.";
        }

        /// <summary>Le righe nella griglia, ognuna con la sua tendina e la sua scelta.</summary>
        void Riempi()
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
                    int k = griglia.Rows.Add(null, etichetta == "" ? "(nessuna)" : etichetta, cerca, fa, "");
                    DataGridViewRow riga = griglia.Rows[k];
                    riga.Tag = r;
                    r.Fila = riga;
                    DataGridViewComboBoxCell tendina = (DataGridViewComboBoxCell)riga.Cells[ColFare];
                    foreach (SceltaFiltro c in r.Scelte) tendina.Items.Add(c.Testo);
                    tendina.Value = r.Scelta.Testo;
                    riga.Cells[ColRicerca].Value = RicercaDellaScelta(r);
                    if (r.Scelte.Count < 2)
                    {
                        tendina.ReadOnly = true;
                        riga.DefaultCellStyle.ForeColor = Tema.Tenue;
                    }
                }
            }
            finally { riempiendo = false; }
            AggiornaConto();
            MostraDettaglio();
        }

        /// <summary>La ricerca che fara' la regola della scelta: nuova, che prende i mittenti, o che lo fa gia'. "" se non c'e' una regola.</summary>
        string RicercaDellaScelta(Riga r)
        {
            Regola regola = RegolaDellaScelta(r);
            return (regola == null) ? "" : GeneratorePosta.Ricerca(stato, regola);
        }

        /// <summary>La regola della scelta come sara' dopo "Usa questa scelta": nuova, con i mittenti uniti, o quella che lo fa gia'; null per le altre.</summary>
        Regola RegolaDellaScelta(Riga r)
        {
            if (r == null || r.Scelta == null) return null;
            if (r.Scelta.Azione == SceltaFiltro.Nuova) return FiltriGmail.RegolaDalFiltro(r.Filtro, r.Somiglia, stato);
            if (r.Scelta.Azione == SceltaFiltro.Unisci) return FiltriGmail.DopoLUnione(r.Filtro, r.Scelta.Regola, stato);
            if (r.Scelta.Azione == SceltaFiltro.Togli) return r.Scelta.Regola;
            return null;
        }

        string Suggerimento(Riga r)
        {
            if (r.Filtro == null)
            {
                bool di160 = FiltriGmail.SceltoConLaVersioneDiPrima(r.Voce);
                string chi = (di160 ? "scelto con una versione di prima (la 1.6.0)" : "scelto prima") +
                             (fileAperto ? ": nel file non c'e' (forse l'hai gia' tolto)" : "");
                if (!r.Orfana) return chi;
                if (di160)
                    return chi + ". La 1.6.0 lo sceglieva per l'etichetta, senza ricordare se archiviava o segnava come " +
                           "letto, e nessuna regola accesa con la sua etichetta prende tutti i suoi messaggi archiviandoli e " +
                           "segnandoli come letti. Resta in Gmail, se non scegli di toglierlo lo stesso" +
                           (fileAperto ? "" : "; apri il file dei filtri: la finestra vede che cosa fa e propone che cosa farne");
                return chi + "; la regola che lo sostituiva (" + r.Voce.Regola + ") non c'e' piu', e' spenta o non " +
                       "prende piu' tutti i suoi messaggi: resta in Gmail, se non scegli di toglierlo lo stesso";
            }
            if (r.Orfana)
                return "scelto prima; la regola che lo sostituiva (" + r.Voce.Regola + ") non lo sostituisce piu': non c'e' " +
                       "piu', e' spenta, non prende piu' tutti i suoi messaggi o non archivia o non segna come letti come " +
                       "il filtro fa adesso in Gmail. Resta in Gmail, se non scegli di toglierlo lo stesso; " + r.Somiglia.Testo();
            return (r.Prima ? "scelto prima; " : "") + r.Somiglia.Testo();
        }

        /// <summary>Vero se il filtro della riga i dell'elenco (nell'ordine del file, non della griglia) si toglie da Gmail.</summary>
        public bool Spuntata(int i)
        {
            if (i < 0 || i >= righe.Count || righe[i].Scelta == null) return false;
            return righe[i].Scelta.TogliIlFiltro;
        }

        /// <summary>
        /// Toglie (o lascia) il filtro della riga i: toglierlo vuol dire la sua
        /// proposta, se lo toglie, oppure "Toglilo"; lasciarlo, "Lascialo in
        /// Gmail". Uno che non si puo' togliere resta.
        /// </summary>
        public void Spunta(int i, bool si)
        {
            if (i < 0 || i >= righe.Count) return;
            Riga r = righe[i];
            if (!si) { Scegli(i, r.Scelte[0]); return; }
            if (r.Scelta != null && r.Scelta.TogliIlFiltro) return;
            SceltaFiltro c = (r.PropostaPiena != null && r.PropostaPiena.TogliIlFiltro) ? r.PropostaPiena
                           : FiltriGmail.Trova(r.Scelte, SceltaFiltro.Togli, null);
            if (c != null) Scegli(i, c);
        }

        /// <summary>Le scelte della tendina della riga i (nell'ordine del file).</summary>
        public List<SceltaFiltro> Scelte(int i)
        {
            return (i < 0 || i >= righe.Count) ? new List<SceltaFiltro>() : new List<SceltaFiltro>(righe[i].Scelte);
        }

        /// <summary>La scelta di adesso della riga i; null se non c'e' la riga.</summary>
        public SceltaFiltro Scelta(int i)
        {
            return (i < 0 || i >= righe.Count) ? null : righe[i].Scelta;
        }

        /// <summary>
        /// Sceglie c per la riga i, a mano, e per i filtri uguali: per lo script
        /// sono la stessa voce. Lasciarlo lascia anche gli altri; toglierlo
        /// (anche per unirlo o farne una regola) toglie anche gli altri, con la
        /// stessa scelta se la loro tendina ce l'ha, e la regola la fa uno solo.
        /// Poi le proposte delle altre righe si rivedono (Rivedi): una che con
        /// questa scelta non si puo' piu' fare parte lasciata, una che adesso si
        /// puo' torna com'era.
        /// </summary>
        public void Scegli(int i, SceltaFiltro c)
        {
            if (i < 0 || i >= righe.Count || c == null || !righe[i].Scelte.Contains(c)) return;
            riempiendo = true;
            try
            {
                Metti(righe[i], c);
                righe[i].AMano = true;
                if (righe[i].Voce != null)
                {
                    string chiave = righe[i].Voce.Chiave();
                    for (int k = 0; k < righe.Count; k++)
                    {
                        Riga altra = righe[k];
                        if (k == i || altra.Voce == null || altra.Voce.Chiave() != chiave) continue;
                        altra.AMano = false;
                        SceltaFiltro uguale = c.TogliIlFiltro ? SceltaUguale(altra.Scelte, c) : altra.Scelte[0];
                        if (uguale != null) Metti(altra, uguale);
                        else if (!altra.Scelta.TogliIlFiltro)
                            Metti(altra, FiltriGmail.Trova(altra.Scelte, SceltaFiltro.Togli, null) ?? altra.Scelta);
                    }
                }
                Rivedi();
            }
            finally { riempiendo = false; }
            AggiornaConto();
            MostraDettaglio();
        }

        void Metti(Riga r, SceltaFiltro c)
        {
            r.Scelta = c;
            if (r.Fila == null) return;
            r.Fila.Cells[ColFare].Value = c.Testo;
            r.Fila.Cells[ColRicerca].Value = RicercaDellaScelta(r);
        }

        /// <summary>Le voci da togliere adesso, una volta sola ciascuna, nell'ordine dell'elenco.</summary>
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

        /// <summary>Ogni filtro con la sua scelta di adesso, nell'ordine dell'elenco: per FiltriGmail.Applica.</summary>
        public List<FiltroScelto> FatteAdesso()
        {
            List<FiltroScelto> fuori = new List<FiltroScelto>();
            foreach (Riga r in righe)
            {
                FiltroScelto x = new FiltroScelto();
                x.Filtro = r.Filtro;
                x.Voce = (r.Voce == null) ? null : r.Voce.Copia();
                x.Somiglia = r.Somiglia;
                x.Scelta = r.Scelta;
                x.AMano = r.AMano;
                // scelto prima e non nel file aperto: forse e' gia' stato tolto
                x.FuoriDalFile = fileAperto && r.Filtro == null;
                fuori.Add(x);
            }
            return fuori;
        }

        /// <summary>
        /// Il conto sotto la griglia, da quello che farebbe "Usa questa scelta"
        /// (FiltriGmail.Prova): i filtri che vanno via davvero, le regole nuove,
        /// le unioni, e quanti hanno una scelta che li toglie ma restano in Gmail.
        /// </summary>
        void AggiornaConto()
        {
            if (esito == null) esito = FiltriGmail.Prova(stato, FatteAdesso());
            int n = esito.Togli.Count, nuove = esito.Nuove.Count, unite = esito.Unite.Count + esito.Scuola.Count, restano = 0;
            List<string> viste = new List<string>();
            foreach (Riga r in righe)
            {
                if (r.Voce == null || r.Scelta == null || !r.Scelta.TogliIlFiltro || viste.Contains(r.Voce.Chiave())) continue;
                viste.Add(r.Voce.Chiave());
                if (esito.PercheResta(r.Voce.Chiave()) != null) restano++;
            }
            lblConto.Text = "Da togliere: " + (n == 0 ? "nessuno" : n + (n == 1 ? " filtro" : " filtri")) +
                (nuove > 0 ? "  -  regole nuove: " + nuove : "") +
                (unite > 0 ? "  -  da unire a una regola: " + unite : "") +
                (restano > 0 ? "  -  restano in Gmail lo stesso: " + restano : "");
        }

        void MostraDettaglio()
        {
            Riga r = (griglia.CurrentRow != null) ? griglia.CurrentRow.Tag as Riga : null;
            if (r == null) { txtDettaglio.Text = ""; return; }
            StringBuilder sb = new StringBuilder();
            string etichetta = (r.Filtro != null) ? r.Filtro.Etichetta : r.Voce.Etichetta;
            Dictionary<string, string> criteri = (r.Filtro != null) ? r.Filtro.Criteri : r.Voce.Criteri;
            sb.Append("Etichetta: ").Append(etichetta == "" ? "nessuna" : etichetta).Append("\r\n");
            sb.Append("Che cosa cerca: ").Append(FiltriGmail.DescriviCriteri(criteri)).Append("\r\n");
            string ricerca = FiltriGmail.RicercaDelFiltro(criteri);
            if (ricerca != null) sb.Append("La sua ricerca in Gmail: ").Append(ricerca).Append("\r\n");
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
            sb.Append("Suggerimento: ").Append(Suggerimento(r)).Append("\r\n");
            sb.Append("Che cosa fare: ").Append(r.Scelta.Testo).Append(". ").Append(Spiegazione(r));
            // una scelta che non si puo' fare non cambia nessuna regola
            bool resta = r.Scelta.TogliIlFiltro && esito != null && r.Voce != null && esito.PercheResta(r.Voce.Chiave()) != null;
            string cerchera = resta ? "" : RicercaDellaScelta(r);
            if (cerchera != "") sb.Append("\r\n").Append("La regola cerchera': ").Append(cerchera);
            txtDettaglio.Text = sb.ToString();
            txtDettaglio.Select(0, 0);
        }

        /// <summary>
        /// Che cosa succede con la scelta di adesso, a parole; e se il filtro,
        /// con le scelte delle altre righe, resta in Gmail lo stesso
        /// (FiltriGmail.Prova), perche'.
        /// </summary>
        string Spiegazione(Riga r)
        {
            SceltaFiltro c = r.Scelta;
            if (c.Azione == SceltaFiltro.Lascia)
            {
                if (r.Voce == null) return "Resta in Gmail: non si puo' togliere da qui.";
                string perche = (r.Filtro == null) ? "" : FiltriGmail.PercheNonDiventaRegola(r.Filtro, r.Somiglia, stato);
                // uguale o simile a una regola, ma unito le esclusioni toglierebbero dei messaggi
                Regola simile = (r.Filtro == null) ? null : FiltriGmail.RegolaDi(r.Somiglia, stato);
                string esclusioni = (simile == null) ? "" : FiltriGmail.EsclusioniCheNonSiUniscono(r.Filtro, simile, stato);
                // la proposta per il filtro da solo, che con le altre scelte non si puo' fare
                string altri = (c != r.Proposta || r.PercheResta == "") ? ""
                    : " Di partenza resta, e non \"" + r.PropostaPiena.Testo + "\": " + r.PercheResta + ".";
                return "Resta in Gmail com'e'." + altri + (perche == "" ? "" : " Non puo' diventare una regola: " + perche + ".") +
                       (esclusioni == "" ? "" : " Non si unisce a " + FiltriGmail.NomeIntero(simile, stato) + ": " + esclusioni + ".");
            }
            // "Usa questa scelta" la rifiuterebbe: lo dice, invece di dire che si toglie
            string resta = (esito == null || r.Voce == null) ? null : esito.PercheResta(r.Voce.Chiave());
            if (resta != null)
                return "Con le altre scelte questa non si puo' fare: il filtro resta in Gmail" +
                       (c.Azione == SceltaFiltro.Unisci ? ", e " + FiltriGmail.NomeIntero(c.Regola, stato) + " non cambia"
                        : c.Azione == SceltaFiltro.Nuova ? ", e la regola non nasce" : "") + ". Perche': " + resta + ".";
            if (c.Azione == SceltaFiltro.Togli)
                return DiceToglilo(r, c) +
                    (r.Filtro != null && r.Filtro.AltreAzioni.Count > 0 ? " Si perde anche quello che fa oltre all'etichetta." : "");
            return SpiegaUnisciONuova(r, c);
        }

        /// <summary>
        /// Che cosa fa "Toglilo": con la regola che lo fa gia'; per uno scelto
        /// prima, con la regola che ricorda e che lo sostituisce ancora; per uno
        /// uguale a un altro filtro della finestra, con la scelta dell'altro
        /// (che conta per tutti e due); altrimenti va via e basta.
        /// </summary>
        string DiceToglilo(Riga r, SceltaFiltro c)
        {
            if (c.Regola != null)
                return "Lo toglie EXTRA_togliFiltri; i suoi messaggi li prende la regola " + FiltriGmail.NomeIntero(c.Regola, stato) + ".";
            if (r.Voce != null)
            {
                foreach (Riga altra in righe)
                {
                    if (altra == r || altra.Voce == null || altra.Voce.Chiave() != r.Voce.Chiave() || altra.Scelta == null ||
                        !altra.Scelta.TogliIlFiltro || (altra.Scelta.Azione == SceltaFiltro.Togli && altra.Scelta.Regola == null)) continue;
                    return "E' lo stesso filtro di un'altra riga (stessa etichetta, stessi criteri): EXTRA_togliFiltri li toglie " +
                           "tutti e due, con la scelta dell'altra (\"" + altra.Scelta.Testo + "\").";
                }
                if ((r.Voce.Regola ?? "").Trim() != "" && FiltriGmail.AncoraSostituito(r.Voce, stato))
                    return "Lo toglie EXTRA_togliFiltri; i suoi messaggi li prende ancora la regola " + r.Voce.Regola.Trim() +
                           ", scelta la volta prima.";
            }
            return "Lo toglie EXTRA_togliFiltri, e basta: nessuna regola lo sostituisce.";
        }

        /// <summary>Che cosa fanno "Unisci a X" e "Diventa una regola".</summary>
        string SpiegaUnisciONuova(Riga r, SceltaFiltro c)
        {
            if (c.Azione == SceltaFiltro.Unisci)
            {
                MittentiFiltro m = FiltriGmail.SoloMittenti(r.Filtro.Criteri);
                string nome = FiltriGmail.NomeIntero(c.Regola, stato);
                return (FiltriGmail.MittentiDaAggiungere(r.Filtro, c.Regola, stato) == 0
                        ? nome + " ha gia' i suoi mittenti."
                        : c.Regola.MittentiDallaScuola()
                        ? "I mittenti di " + nome + " si scrivono nella pagina \"La tua scuola\": li aggiungo li'."
                        : "I suoi mittenti vanno fra quelli di " + nome + ".") +
                    (m != null && m.Esclusi.Count > 0
                        ? " Le esclusioni (" + string.Join(" ", m.Esclusi.ToArray()) + ") vanno nella ricerca avanzata di " +
                          nome + ", e valgono per tutta la regola." : "") +
                    (c.Regola.Attiva ? "" : FiltriGmail.NienteDaSola(stato, c.Regola)
                        ? " " + nome + " e' spenta: la accendo."
                        : " " + nome + " e' spenta: la accendo, e prende di nuovo anche quello che cercava gia' (qui sotto la " +
                          "ricerca che fara'), non solo i messaggi del filtro" + (c.Regola.Archivia ? ", e li archivia" : "") + ".") +
                    " Poi il filtro si toglie; i suoi messaggi prendono l'etichetta di " + nome + ".";
            }
            return "Nasce una regola con la stessa etichetta (i messaggi che ce l'hanno gia' restano insieme) e la " +
                   "stessa ricerca; poi il filtro si toglie.";
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

        /// <summary>
        /// Chiede si' o no (testo, titolo). Di partenza una finestra di Windows;
        /// le prove la sostituiscono, per chiudere la finestra senza domande.
        /// </summary>
        public Func<string, string, bool> Chiedi;

        /// <summary>Dove prendere gli indirizzi degli studenti: il "?" accanto alla casella.</summary>
        public const string AiutoIndirizzi =
            "Per esempio da Google Classroom: apri il corso, scheda Persone, spunta la casella sopra l'elenco degli " +
            "studenti e scegli Azioni -> Invia email. Gmail apre un messaggio con tutti gli indirizzi nel campo A: " +
            "selezionali, copiali (Ctrl+C) e incollali qui. Poi elimina quel messaggio con l'icona del cestino in " +
            "basso: chiuso e basta, Gmail lo terrebbe fra le bozze, con tutti gli indirizzi. I nomi dei menu di " +
            "Classroom possono cambiare.\r\n\r\n" +
            "Il Ctrl+C del browser finisce nella cronologia degli appunti di Windows, se e' attiva (e con la " +
            "sincronizzazione anche sugli altri tuoi dispositivi): dopo, premi Win+V e togli quella voce (i tre " +
            "puntini -> Elimina). Oppure trascina il testo selezionato dentro la casella: cosi' non passa dagli " +
            "appunti.\r\n\r\n" +
            "Oppure, se la scuola ha un gruppo Google per la classe, dall'elenco dei membri del gruppo.\r\n\r\n" +
            "Va bene qualunque testo: Campanella prende solo gli indirizzi email, anche nella forma Nome Cognome " +
            "<indirizzo>, in minuscolo e una volta sola. Quelli del personale (chi ha la spunta nell'elenco del passo " +
            "3, la dirigenza e la segreteria) li toglie: un collega fra gli studenti avrebbe l'etichetta della classe " +
            "su tutta la sua posta.\r\n\r\n" +
            "Poi premi \"Copia\" e nel progetto dello script crea un file nuovo (+ accanto a File -> Script) con il " +
            "nome che vedi, per esempio Classe_3B, e incollaci il testo. Quello che copia Campanella non entra nella " +
            "cronologia degli appunti, ma resta negli appunti finche' non copi altro: chiudendo la finestra ti chiede " +
            "se svuotarli. Campanella non conserva gli indirizzi: per cambiarli incollali di nuovo qui e sostituisci " +
            "il file.";

        readonly Stato stato;
        readonly TextBox txtMadre, txtNuova, txtIncolla;
        readonly Label lblMadre, lblDaDove, lblTitoloIncolla, lblAvviso, lblNotaVecchie, aiutoIncolla;
        readonly DataGridView griglia;
        readonly Button btnCopia;
        readonly CheckBox chkVecchie;
        int scelta = -1;
        bool riempiendo = false;
        // la madre all'apertura, e l'ultimo file copiato negli appunti (il testo e il nome)
        string madreIniziale = "";
        string ultimoCopiato = null, ultimoFile = "";
        const int Larga = 860;

        public FormClassi(Stato s)
        {
            stato = s;
            Chiedi = delegate(string testo, string titolo)
            {
                return MessageBox.Show(this, testo, titolo, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
            };
            Text = "Le mie classi";
            StartPosition = FormStartPosition.CenterParent;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            ShowInTaskbar = false;

            int y = 14;
            Label spiega = Tema.Testo1(
                "Una regola per ogni classe, con un'etichetta come \"Classi 2026-27/3B\": la prende un messaggio con " +
                "la classe nell'oggetto, da chiunque, oppure mandato da uno studente della classe. Le etichette delle " +
                "classi si aggiungono alle altre.",
                16, y, Larga, Tema.Normale, Ruolo.Normale);
            Controls.Add(spiega);
            y += spiega.Height + 2;
            Label privato = Tema.Testo1(
                "Gli indirizzi degli studenti sono dati di minori: Campanella non li conserva. Li incolli qui e copi il " +
                "file della classe (per esempio Classe_3B.gs) nel progetto dello script, nell'account della scuola; " +
                "chiusa la finestra Campanella li dimentica, e chiede se svuotare gli appunti. A fine anno togli le " +
                "classi e cancella quei file.",
                16, y, Larga, Tema.Normale, Ruolo.Avviso);
            Controls.Add(privato);
            y += privato.Height + 8;

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
            y += 34;

            // da dove vengono le classi; senza classi, dove prenderle (AggiornaGriglia)
            lblDaDove = Tema.Testo1("", 16, y, Larga, Tema.Normale, Ruolo.Tenue);
            lblDaDove.AutoSize = false;
            lblDaDove.Height = Math.Max(Tema.AltezzaTesto(DaDove(false) + " 3B e 3B LSA; 4A, 4A ITE e 4A LSA hanno lo " +
                "stesso numero e la stessa sezione: se sono la stessa classe togli la spunta a una; se sono classi " +
                "diverse, cambia le parole dell'oggetto, che di partenza sono le stesse.", Tema.Normale, Larga),
                                        Tema.AltezzaTesto(DaDove(true), Tema.Normale, Larga));
            Controls.Add(lblDaDove);
            y += lblDaDove.Height + 2;

            griglia = new DataGridView();
            griglia.Location = new Point(16, y);
            griglia.Size = new Size(Larga, 140);
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
                if (e.ColumnIndex == 0)
                {
                    Classi[e.RowIndex].Spuntata = v is bool && (bool)v;
                    Classi[e.RowIndex].SpuntaCambiata = true;
                }
                else if (e.ColumnIndex == 2)
                {
                    string avviso = CambiaOggetto(e.RowIndex, Convert.ToString(v) ?? "");
                    if (avviso != "")
                        MessageBox.Show(this, avviso, "Indirizzi nell'oggetto", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
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
                // la riga del campo A di Classroom scritta qui invece che nella casella sotto
                string indirizzi = LeMieClassi.AvvisoIndirizziNelNome(txtNuova.Text);
                if (indirizzi != "")
                {
                    txtNuova.Text = "";
                    MessageBox.Show(this, indirizzi, "Indirizzi al posto della classe", MessageBoxButtons.OK,
                                    MessageBoxIcon.Information);
                    return;
                }
                int i = Aggiungi(txtNuova.Text);
                if (i < 0) return;
                txtNuova.Text = "";
                Scegli(i);
            }));
            y += 40;

            // il titolo cambia con la classe scelta, e il "?" gli sta attaccato (AggiornaScelta)
            lblTitoloIncolla = Tema.Testo1("", 16, y, 0, Tema.Grassetto, Ruolo.Normale);
            lblTitoloIncolla.AutoSize = false;
            lblTitoloIncolla.Width = 560;
            lblTitoloIncolla.Height = Tema.AltezzaTesto("Gli indirizzi degli studenti della 3B LSA", Tema.Grassetto, 560);
            Controls.Add(lblTitoloIncolla);
            aiutoIncolla = Tema.Aiuto(16 + 566, y + 2, "Dove prendere gli indirizzi degli studenti", AiutoIndirizzi);
            Controls.Add(aiutoIncolla);
            y += lblTitoloIncolla.Height + 2;

            txtIncolla = Tema.CasellaMulti(16, y, Larga, 64, "incolla qui gli indirizzi (Ctrl+V), o trascinali qui");
            txtIncolla.ScrollBars = ScrollBars.Vertical;
            txtIncolla.TextChanged += delegate
            {
                if (riempiendo || scelta < 0) return;
                Incolla(scelta, txtIncolla.Text);
            };
            // il testo trascinato dal browser non passa dagli appunti (ne' dalla loro cronologia)
            txtIncolla.AllowDrop = true;
            txtIncolla.DragEnter += delegate(object o, DragEventArgs e)
            {
                e.Effect = (scelta >= 0 && (e.Data.GetDataPresent(DataFormats.UnicodeText) ||
                                            e.Data.GetDataPresent(DataFormats.Text)))
                    ? DragDropEffects.Copy : DragDropEffects.None;
            };
            txtIncolla.DragDrop += delegate(object o, DragEventArgs e)
            {
                string t = (e.Data.GetData(DataFormats.UnicodeText) as string) ?? (e.Data.GetData(DataFormats.Text) as string);
                Trascina(t);
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
            y += Math.Max(34, lblAvviso.Height + 4);

            chkVecchie = Tema.Spunta("", 16, y, Ruolo.Normale);
            Controls.Add(chkVecchie);
            y += 24;
            lblNotaVecchie = Tema.Testo1("", 16, y, Larga, Tema.Normale, Ruolo.Tenue);
            lblNotaVecchie.AutoSize = false;
            lblNotaVecchie.Height = Tema.AltezzaTesto(NotaVecchie(), Tema.Normale, Larga);
            Controls.Add(lblNotaVecchie);
            y += lblNotaVecchie.Height + 2;

            Label gmail = Tema.Testo1(
                "Le etichette in Gmail non si cancellano mai, nemmeno togliendo una classe. Dopo \"Usa queste classi\" " +
                LeMieClassi.DopoLeClassi(Guscio.VersioneScript("Organizzazione_Gmail.gs")),
                16, y, Larga, Tema.Normale, Ruolo.Tenue);
            Controls.Add(gmail);
            y += gmail.Height + 8;

            Button ok = Tema.BottonePrincipale("Usa queste classi", 16 + Larga - 200, y, 200, null);
            ok.Click += delegate
            {
                // una parola dell'oggetto ancora in scrittura nella griglia vale anche lei
                griglia.EndEdit();
                if (!Confermato()) return;
                DialogResult = DialogResult.OK;
            };
            Controls.Add(ok);
            Button ann = Tema.Bottone("Annulla", 16 + Larga - 200 - 98, y + 2, 90, null);
            ann.DialogResult = DialogResult.Cancel;
            Controls.Add(ann);
            CancelButton = ann;
            ClientSize = new Size(16 + Larga + 16, y + 34 + 14);

            CambiaMadre();
            madreIniziale = Madre;
            txtMadre.TextChanged += delegate
            {
                // degli indirizzi incollati qui per sbaglio: via tutto il testo (ci
                // sarebbero anche i nomi degli studenti), torna la madre di partenza
                if (LeMieClassi.ConIndirizzi(txtMadre.Text))
                {
                    txtMadre.Text = LeMieClassi.MadreDiPartenza(stato);
                    if (Visible)
                        BeginInvoke((MethodInvoker)delegate
                        {
                            MessageBox.Show(this, LeMieClassi.AvvisoIndirizziNellaMadre, "Indirizzi nell'etichetta madre",
                                            MessageBoxButtons.OK, MessageBoxIcon.Information);
                        });
                    return;
                }
                CambiaMadre();
            };
            FormClosing += delegate(object o, FormClosingEventArgs e)
            {
                // niente domande allo spegnimento del computer, che una finestra fermerebbe
                if (e.CloseReason == CloseReason.WindowsShutDown || e.CloseReason == CloseReason.TaskManagerClosing) return;
                if (DialogResult != DialogResult.OK)
                {
                    string perdo = DaPerdere();
                    if (perdo != "" && !Chiedi(perdo, "Chiudere senza usare le classi?")) { e.Cancel = true; return; }
                }
                if (AppuntiDaSvuotare() && Chiedi("Negli appunti c'e' ancora " + ultimoFile + ", con gli indirizzi " +
                        "degli studenti: ci resta finche' non copi altro, anche chiusa Campanella.\n\nSe l'hai gia' " +
                        "incollato nel progetto dello script, svuoto gli appunti?", "Svuotare gli appunti?"))
                    SvuotaAppunti();
            };
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
        /// Le righe per l'etichetta madre di adesso: le classi che hanno gia' la
        /// regola sotto questa madre (spuntate, con le loro parole), poi quelle
        /// dell'orario e di Cartelle, spuntate solo se di regole non ce n'e'
        /// nessuna (la prima volta, o l'anno nuovo). Non sceglie la riga.
        /// </summary>
        void Riempi(Stato s)
        {
            Classi.Clear();
            string madre = Madre;
            foreach (Regola r in s.Regole)
            {
                string c = LeMieClassi.ClasseDi(r);
                if (c == null || !LeMieClassi.SottoMadre(r, madre) || Indice(c) >= 0) continue;
                ClasseScelta x = new ClasseScelta();
                x.Nome = c;
                x.Spuntata = true;
                x.Oggetto = LeMieClassi.TestoOggetto(r.Oggetto);
                x.Provenienza = "regola";
                x.Regola = r;
                Classi.Add(x);
            }
            bool primaVolta = Classi.Count == 0;
            Metti(LeMieClassi.DalleLezioni(s), "orario", primaVolta);
            Metti(LeMieClassi.DaCartelle(s), "Cartelle", primaVolta);
        }

        void Metti(List<string> nomi, string da, bool spuntate)
        {
            foreach (string n in nomi)
            {
                if (LeMieClassi.Chiave(n) == "" || LeMieClassi.ConIndirizzi(n) || Indice(n) >= 0) continue;
                ClasseScelta x = new ClasseScelta();
                x.Nome = LeMieClassi.Nome(n);
                // un codice che non e' numero e sezione (A5, AF) non ha parole
                // dell'oggetto: resta senza spunta finche' il docente non le scrive
                x.Spuntata = spuntate && LeMieClassi.NumeroESezioneDi(n);
                x.Oggetto = LeMieClassi.TestoOggetto(LeMieClassi.Varianti(n));
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

        /// <summary>
        /// Aggiunge a mano una classe, spuntata (due, per "3A/3B"); se c'e'
        /// gia', la sua riga. La riga della prima; -1 se il nome e' vuoto, o se
        /// ha degli indirizzi (LeMieClassi.ConIndirizzi: il bottone lo dice).
        /// </summary>
        public int Aggiungi(string nome)
        {
            if (LeMieClassi.ConIndirizzi(nome)) return -1;
            List<string> pezzi = LeMieClassi.Separa(nome);
            if (pezzi.Count == 0 || LeMieClassi.Chiave(pezzi[0]) == "") return -1;
            bool nuove = false;
            foreach (string p in pezzi)
            {
                if (LeMieClassi.Chiave(p) == "" || Indice(p) >= 0) continue;
                ClasseScelta x = new ClasseScelta();
                x.Nome = LeMieClassi.Nome(p);
                x.Oggetto = LeMieClassi.TestoOggetto(LeMieClassi.Varianti(p));
                x.Provenienza = "a mano";
                x.Regola = LeMieClassi.RegolaDellaClasse(stato, Madre, LeMieClassi.Chiave(p));
                Classi.Add(x);
                nuove = true;
            }
            if (nuove)
            {
                Ordina();
                AggiornaGriglia();
            }
            return Indice(pezzi[0]);
        }

        /// <summary>
        /// Le classi con lo stesso numero e la stessa sezione (3B e 3B LSA):
        /// possono essere la stessa classe scritta in due modi (l'orario e
        /// Cartelle), o due classi, che di partenza cercano le stesse parole
        /// nell'oggetto. Lo dice, perche' il docente scelga; "" se non ce ne sono.
        /// </summary>
        public string AvvisoSimili()
        {
            List<string> chiavi = new List<string>();
            List<List<string>> gruppi = new List<List<string>>();
            foreach (ClasseScelta c in Classi)
            {
                string k = LeMieClassi.NumeroESezione(c.Nome);
                if (k == "") continue;
                int i = chiavi.IndexOf(k);
                if (i < 0) { chiavi.Add(k); gruppi.Add(new List<string>()); i = chiavi.Count - 1; }
                gruppi[i].Add(c.Nome);
            }
            List<string> frasi = new List<string>();
            foreach (List<string> g in gruppi)
            {
                if (g.Count < 2) continue;
                frasi.Add(string.Join(", ", g.GetRange(0, g.Count - 1).ToArray()) + " e " + g[g.Count - 1]);
            }
            if (frasi.Count == 0) return "";
            return string.Join("; ", frasi.ToArray()) + " hanno lo stesso numero e la stessa sezione: se sono la " +
                   "stessa classe togli la spunta a una; se sono classi diverse, cambia le parole dell'oggetto, che di " +
                   "partenza sono le stesse.";
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
            string simili = AvvisoSimili();
            lblDaDove.Text = DaDove(Classi.Count == 0) + (simili == "" ? "" : " " + simili);
            lblDaDove.Tag = (Classi.Count == 0 || simili != "") ? Ruolo.Avviso : Ruolo.Tenue;
            Tema.Applica(lblDaDove);
        }

        /// <summary>La riga sopra l'elenco: da dove vengono le classi, o dove prenderle se non ce n'e' nessuna.</summary>
        static string DaDove(bool nessuna)
        {
            return nessuna
                ? "Non ho trovato classi. Le prendo dall'orario (Orari: il tabellone al passo 1 e il tuo nome al passo 4) " +
                  "oppure da Cartelle (una classe per riga); altrimenti aggiungile qui sotto, una alla volta."
                : "Le classi del tuo orario (Orari, passo 4), di Cartelle e quelle che hanno gia' la regola: spunta quelle " +
                  "che vuoi. Le parole dell'oggetto si cambiano con un clic; quelle con lo spazio controllale in Gmail, " +
                  "cercando per esempio subject:\"3 B\".";
        }

        /// <summary>La colonna "Studenti": quanti indirizzi incollati, o che non si conservano.</summary>
        string Studenti(ClasseScelta c)
        {
            if (c.Indirizzi != null && c.Indirizzi.Count > 0)
                return c.Indirizzi.Count + " incollati" + (CopiatoAdesso(c) ? ", file copiato" : ", da copiare");
            return (c.Regola != null) ? "non conservati" : "nessuno";
        }

        /// <summary>L'etichetta che avra' la regola della classe (quella per cui si copia il suo file).</summary>
        string EtichettaDi(ClasseScelta c)
        {
            string nome = (c.Regola != null && LeMieClassi.ClasseDi(c.Regola) != null) ? LeMieClassi.ClasseDi(c.Regola) : c.Nome;
            return Madre + "/" + nome;
        }

        /// <summary>Vero se il file della classe i e' stato copiato per l'etichetta di adesso.</summary>
        public bool CopiatoAdesso(int i)
        {
            return i >= 0 && i < Classi.Count && CopiatoAdesso(Classi[i]);
        }

        bool CopiatoAdesso(ClasseScelta c)
        {
            return c.Copiato && string.Equals(c.CopiatoPer, EtichettaDi(c), StringComparison.OrdinalIgnoreCase);
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
            // il "?" subito dopo il titolo, che cambia con la classe
            lblTitoloIncolla.Width = Math.Min(560, TextRenderer.MeasureText(lblTitoloIncolla.Text, Tema.Grassetto).Width + 4);
            aiutoIncolla.Left = lblTitoloIncolla.Right + 6;
            btnCopia.Text = "Copia " + LeMieClassi.NomeFile(c == null ? "3B" : c.Nome);
            btnCopia.Enabled = c != null && c.Indirizzi != null && c.Indirizzi.Count > 0;
            lblAvviso.Text = (c == null) ? "" : Avviso(scelta);
            lblAvviso.Tag = (c != null && c.Indirizzi != null && c.Indirizzi.Count > LeMieClassi.TroppiStudenti)
                ? Ruolo.Avviso : Ruolo.Tenue;
            Tema.Applica(lblAvviso);
        }

        /// <summary>
        /// Le parole dell'oggetto scritte nella colonna per la classe i. Gli
        /// indirizzi (la riga del campo A di Classroom incollata qui invece che
        /// nella casella sotto) vanno via subito, anche dalla cella, e lo dice:
        /// l'avviso da mostrare, o "".
        /// </summary>
        public string CambiaOggetto(int i, string testo)
        {
            if (i < 0 || i >= Classi.Count) return "";
            int indirizzi = LeMieClassi.IndirizziNellOggetto(testo);
            Classi[i].OggettoCambiato = true;
            if (indirizzi == 0) { Classi[i].Oggetto = testo ?? ""; return ""; }
            Classi[i].Oggetto = LeMieClassi.TestoOggetto(LeMieClassi.ParoleOggetto(testo));
            riempiendo = true;
            try { if (i < griglia.Rows.Count) griglia.Rows[i].Cells[2].Value = Classi[i].Oggetto; }
            finally { riempiendo = false; }
            return "Hai incollato " + (indirizzi == 1 ? "un indirizzo" : indirizzi + " indirizzi") + " fra le parole " +
                   "dell'oggetto della " + Classi[i].Nome + ": li ho tolti. Gli indirizzi degli studenti vanno nella " +
                   "casella sotto, scelta la classe.";
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
            // un codice come A5 o AF: come compare nell'oggetto Campanella non lo sa
            string parole = (LeMieClassi.ParoleOggetto(c.Oggetto).Count == 0)
                ? "Scrivi tu in \"Cerca nell'oggetto\" come compare nell'oggetto delle email" +
                  (LeMieClassi.NumeroESezioneDi(c.Nome) ? "" : " (per un codice come " + c.Nome + " non lo so)") + ". "
                : "";
            return parole + AvvisoStudenti(c);
        }

        string AvvisoStudenti(ClasseScelta c)
        {
            string file = LeMieClassi.NomeFile(c.Nome);
            int tolti = (c.Tolti == null) ? 0 : c.Tolti.Count;
            // da dove: l'elenco del personale (passo 3) o la pagina "La tua scuola"
            List<string> scuola = LeMieClassi.DallaScuola(stato);
            int dallaScuola = 0;
            if (c.Tolti != null) foreach (string e in c.Tolti) if (scuola.Contains(e)) dallaScuola++;
            int dalPasso3 = tolti - dallaScuola;
            string dove = (dallaScuola == 0) ? "dall'elenco del passo 3"
                : (dalPasso3 == 0) ? "dalla pagina \"La tua scuola\""
                : dalPasso3 + " dall'elenco del passo 3, " + dallaScuola + " dalla pagina \"La tua scuola\"";
            string delPersonale = (tolti == 0) ? "" : " " + tolti + " del personale " + (tolti == 1 ? "tolto" : "tolti") +
                                  " (" + dove + ").";
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
            // con una madre senza l'anno ("Le mie classi") la regola l'anno dopo e'
            // la stessa, e il file le darebbe gli studenti di prima
            if (c.Regola != null)
                return "Gli indirizzi degli studenti Campanella non li conserva: se " + file + " e' gia' nel progetto " +
                       "dello script, la regola li usa. Per cambiarli incollali qui di nuovo e copia di nuovo il file." +
                       (MadreSenzaAnno() ? " L'etichetta madre non ha l'anno: all'anno scolastico nuovo la regola resta " +
                                           "questa, ma gli studenti cambiano: incollali di nuovo e copia di nuovo il file." : "");
            return "Nessun indirizzo incollato: senza " + file + " nel progetto la regola prende solo i messaggi con " +
                   "la classe nell'oggetto.";
        }

        string AvvisoPiuLungo()
        {
            ClasseScelta prova = new ClasseScelta();
            prova.Nome = "Laboratorio LSA";
            prova.Indirizzi = new List<string>();
            for (int k = 0; k < 100; k++) prova.Indirizzi.Add("x");
            prova.Tolti = new List<string>(new string[] { "a", "b" });
            Classi.Add(prova);
            // quelli tolti vengono da tutte e due le parti: la frase piu' lunga
            string a = Avviso(Classi.Count - 1).Replace("(dall'elenco del passo 3)",
                "(99 dall'elenco del passo 3, 99 dalla pagina \"La tua scuola\")");
            prova.Indirizzi = null;
            prova.Regola = new Regola();
            // con la madre senza l'anno, anche se quella di adesso ce l'ha
            comeSenzaAnno = true;
            string b = Avviso(Classi.Count - 1);
            comeSenzaAnno = false;
            Classi.RemoveAt(Classi.Count - 1);
            return (Tema.AltezzaTesto(a, Tema.Normale, Larga - 242) >= Tema.AltezzaTesto(b, Tema.Normale, Larga - 242)) ? a : b;
        }

        // solo per misurare l'avviso piu' lungo (AvvisoPiuLungo)
        bool comeSenzaAnno = false;

        /// <summary>Vero se l'etichetta madre scritta non ha l'anno (quattro cifre): l'anno dopo le regole restano le stesse.</summary>
        bool MadreSenzaAnno()
        {
            return comeSenzaAnno || !Regex.IsMatch(Madre, @"\d{4}");
        }

        /// <summary>Il testo del file Classe_*.gs della classe i, con gli indirizzi incollati; "" se non ce ne sono.</summary>
        public string TestoFile(int i)
        {
            if (i < 0 || i >= Classi.Count) return "";
            ClasseScelta c = Classi[i];
            if (c.Indirizzi == null || c.Indirizzi.Count == 0) return "";
            string nome = (c.Regola != null && LeMieClassi.ClasseDi(c.Regola) != null) ? LeMieClassi.ClasseDi(c.Regola) : c.Nome;
            return LeMieClassi.FileClasse(nome, EtichettaDi(c), c.Indirizzi, DateTime.Now);
        }

        /// <summary>Il testo trascinato nella casella degli indirizzi: vale come incollato, senza passare dagli appunti.</summary>
        public void Trascina(string testo)
        {
            if (scelta < 0 || string.IsNullOrEmpty(testo)) return;
            txtIncolla.Text = (txtIncolla.Text.Trim() == "") ? testo : txtIncolla.Text + "\r\n" + testo;
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
                    Classi[i].CopiatoPer = EtichettaDi(Classi[i]);
                    ultimoCopiato = testo;
                    ultimoFile = LeMieClassi.NomeFile(Classi[i].Nome);
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
                if (c.Spuntata && c.Indirizzi != null && c.Indirizzi.Count > 0 && !CopiatoAdesso(c))
                    nonCopiati.Add(LeMieClassi.NomeFile(c.Nome));
            if (nonCopiati.Count == 0) return true;
            return Chiedi("Non hai copiato " + string.Join(", ", nonCopiati.ToArray()) + " (o l'hai copiato per un'altra " +
                "etichetta madre). Campanella non conserva gli indirizzi degli studenti: chiusa la finestra spariscono, " +
                "e per quei file andranno incollati di nuovo.\n\nChiudere lo stesso?", "File delle classi non copiati");
        }

        /// <summary>
        /// Che cosa si perde chiudendo senza "Usa queste classi" (Annulla, Esc,
        /// la X): un file copiato resterebbe nel progetto senza la sua regola,
        /// gli indirizzi incollati spariscono, le scelte fatte qui si perdono.
        /// "" se non c'e' niente da perdere.
        /// </summary>
        public string DaPerdere()
        {
            List<string> copiati = new List<string>(), incollati = new List<string>();
            bool cambiate = !string.Equals(Madre, madreIniziale, StringComparison.OrdinalIgnoreCase);
            foreach (ClasseScelta c in Classi)
            {
                if (c.Copiato) copiati.Add(LeMieClassi.NomeFile(c.Nome));
                else if (c.Indirizzi != null && c.Indirizzi.Count > 0) incollati.Add(LeMieClassi.NomeFile(c.Nome));
                if (c.SpuntaCambiata || c.OggettoCambiato || c.Provenienza == "a mano") cambiate = true;
            }
            List<string> frasi = new List<string>();
            if (copiati.Count > 0)
                frasi.Add("Hai copiato " + string.Join(", ", copiati.ToArray()) + ": se l'hai gia' incollato nel " +
                          "progetto dello script, senza \"Usa queste classi\" la sua regola non c'e' (o resta com'era).");
            if (incollati.Count > 0)
                frasi.Add("Gli indirizzi incollati per " + string.Join(", ", incollati.ToArray()) + " spariscono.");
            if (cambiate) frasi.Add("Le scelte fatte qui si perdono.");
            if (frasi.Count == 0) return "";
            return string.Join(" ", frasi.ToArray()) + "\n\nChiudere senza \"Usa queste classi\"?";
        }

        /// <summary>
        /// Vero se negli appunti c'e' ancora l'ultimo file copiato da questa
        /// finestra (con gli indirizzi degli studenti). Senza un file copiato
        /// gli appunti non si guardano nemmeno.
        /// </summary>
        public bool AppuntiDaSvuotare()
        {
            if (ultimoCopiato == null) return false;
            try { return Clipboard.ContainsText() && Clipboard.GetText() == ultimoCopiato; }
            catch (System.Runtime.InteropServices.ExternalException) { return false; }
        }

        void SvuotaAppunti()
        {
            try { Clipboard.Clear(); }
            catch (System.Runtime.InteropServices.ExternalException) { }
            ultimoCopiato = null;
        }

        /// <summary>
        /// L'etichetta madre e' cambiata (o la finestra si apre): le righe sono
        /// quelle di questa madre, con le regole che ha, le loro parole e i loro
        /// nomi (Riempi). Quello che il docente ha fatto qui resta: gli indirizzi
        /// incollati, le spunte e le parole cambiate, le classi aggiunte a mano.
        /// Le regole delle classi sotto un'altra madre sono quelle dell'anno prima.
        /// </summary>
        void CambiaMadre()
        {
            string madre = Madre;
            List<ClasseScelta> prima = new List<ClasseScelta>(Classi);
            string sceltaPrima = (scelta >= 0 && scelta < prima.Count) ? prima[scelta].Nome : null;
            Riempi(stato);
            foreach (ClasseScelta p in prima)
            {
                bool sua = p.Indirizzi != null || p.SpuntaCambiata || p.OggettoCambiato || p.Provenienza == "a mano";
                if (!sua) continue;
                int i = Indice(p.Nome);
                if (i < 0)
                {
                    p.Regola = null;
                    Classi.Add(p);
                    continue;
                }
                ClasseScelta x = Classi[i];
                x.Indirizzi = p.Indirizzi;
                x.Tolti = p.Tolti;
                x.Copiato = p.Copiato;
                x.CopiatoPer = p.CopiatoPer;
                if (p.SpuntaCambiata) { x.Spuntata = p.Spuntata; x.SpuntaCambiata = true; }
                if (p.OggettoCambiato) { x.Oggetto = p.Oggetto; x.OggettoCambiato = true; }
            }
            Ordina();
            AggiornaGriglia();
            int s = (sceltaPrima != null) ? Indice(sceltaPrima) : -1;
            Scegli(s >= 0 ? s : (Classi.Count > 0 ? 0 : -1));

            lblMadre.Text = "In Gmail: " + madre + "/" + (Classi.Count > 0 ? Classi[0].Nome : "3B") + ", " + madre + "/...";
            Vecchie = new List<Regola>();
            foreach (Regola r in stato.Regole)
                if (LeMieClassi.ClasseDi(r) != null && !LeMieClassi.SottoMadre(r, madre)) Vecchie.Add(r);
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
                // 2026-27, 2026-2027, 2026/27
                Match anno = Regex.Match(madri[0], @"\d{4}[-/]\d{2}(\d{2})?");
                di = anno.Success ? "del " + anno.Value : "di \"" + madri[0] + "\"";
            }
            else di = "di \"" + string.Join("\", \"", madri.ToArray()) + "\"";
            return "Togli le regole delle classi " + di + " (" + Vecchie.Count + ")";
        }

        /// <summary>
        /// Quello che Campanella non toglie da solo, per le classi dell'anno
        /// prima. Non il file di una classe che c'e' anche quest'anno: ha lo
        /// stesso nome (Classe_3B.gs), e cancellandolo la regola nuova
        /// perderebbe gli studenti; lo sostituisce il file nuovo. I filtri veri
        /// di Gmail delle classi cercano solo l'oggetto: si scelgono nella
        /// finestra dei filtri e li toglie EXTRA_togliFiltri. Uno con gli
        /// indirizzi degli studenti (fatto a mano) non si puo' scegliere
        /// (FiltriGmail.DiUnaClasseConIndirizzi): si toglie da Gmail.
        /// </summary>
        public string NotaVecchie()
        {
            return "Nel progetto dello script cancella tu i loro file Classe_*.gs, con gli indirizzi degli studenti, ma " +
                   "non quelli con lo stesso nome di una classe di quest'anno, che il file nuovo sostituisce: dopo \"Usa " +
                   "queste classi\" Campanella dice quali. Se avevi creato i filtri veri di Gmail togli anche i loro: " +
                   "quelli che cercano solo l'oggetto, come li crea EXTRA_creaFiltriGmail, in \"Filtri che hai " +
                   "gia' in Gmail...\" scegli \"Toglilo\" e li toglie EXTRA_togliFiltri; quelli con gli indirizzi degli studenti non si " +
                   "possono scegliere: toglili tu (Gmail -> Impostazioni -> Filtri e indirizzi bloccati).";
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

    /// <summary>
    /// Un colore degli eventi di Google Calendar (ColoriLezioni) in un
    /// quadratino: pieno del colore, con un filo intorno; "" (il colore del
    /// calendario) e' un quadratino vuoto tratteggiato. Deriva da Control, non
    /// da Panel o Label, cosi' Tema.Applica non gli rifa' i colori.
    /// </summary>
    class QuadratoColore : Control
    {
        string valore = "";

        public QuadratoColore(int x, int y, int lato)
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Location = new Point(x, y);
            Size = new Size(lato, lato);
            TabStop = false;
            AccessibleRole = AccessibleRole.Graphic;
            AccessibleName = ColoriLezioni.Nome("");
        }

        /// <summary>Il colore: da "1" a "11", oppure "" per il colore del calendario.</summary>
        public string Valore
        {
            get { return valore; }
            set
            {
                valore = ColoriLezioni.Valido(value ?? "") ? (value ?? "") : "";
                AccessibleName = ColoriLezioni.Nome(valore);
                Invalidate();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Disegna(e.Graphics, new Rectangle(0, 0, Width - 1, Height - 1), valore);
        }

        /// <summary>Il quadratino di un colore nel rettangolo r: lo usano anche le tendine e il riepilogo dei colori.</summary>
        public static void Disegna(Graphics g, Rectangle r, string valore)
        {
            string esadecimale = ColoriLezioni.Esadecimale(valore);
            if (esadecimale == "")
            {
                using (Pen p = new Pen(Tema.Tenue))
                {
                    p.DashStyle = DashStyle.Dash;
                    g.DrawRectangle(p, r);
                }
                return;
            }
            using (SolidBrush b = new SolidBrush(ColorTranslator.FromHtml(esadecimale))) g.FillRectangle(b, r);
            using (Pen p = new Pen(Tema.Tenue)) g.DrawRectangle(p, r);
        }
    }

    /// <summary>
    /// Il riepilogo dei colori delle classi accanto al bottone "Colori delle
    /// classi..." (Orari, passo 4): per ogni classe il quadratino del colore e
    /// il nome, su una riga o piu', quante ne stanno nella sua altezza; quelle
    /// che non ci stanno diventano "e altre N". Senza classi, una frase. Text
    /// dice tutto a parole (per chi legge lo schermo, e per le prove).
    /// </summary>
    class RiepilogoColori : Control
    {
        List<string> classi = new List<string>();
        Dictionary<string, string> colori = new Dictionary<string, string>();
        string messaggio = "";

        public RiepilogoColori(int x, int y, int w, int h)
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Location = new Point(x, y);
            Size = new Size(w, h);
            Font = Tema.Normale;
            TabStop = false;
            AccessibleRole = AccessibleRole.StaticText;
        }

        /// <summary>Mostra i colori di queste classi, oppure, se non ce ne sono, il messaggio.</summary>
        public void Mostra(List<string> classi, Dictionary<string, string> colori, string messaggio)
        {
            this.classi = ColoriLezioni.Ordinate(classi);
            this.colori = new Dictionary<string, string>(colori ?? new Dictionary<string, string>());
            this.messaggio = messaggio ?? "";
            Text = (this.classi.Count > 0) ? "Colori: " + ColoriLezioni.Riassunto(this.colori, this.classi) : this.messaggio;
            AccessibleName = Text;
            Invalidate();
        }

        /// <summary>Quante classi si vedono: le altre sono in "e altre N".</summary>
        public int Visibili
        {
            get { string resto; return Posti(out resto).Count; }
        }

        int AltezzaRiga { get { return Font.Height + 4; } }

        /// <summary>
        /// Dove va ogni classe che ci sta, riga per riga; resto e' "e altre N"
        /// se non ci stanno tutte (sull'ultima riga c'e' sempre il posto per lui).
        /// </summary>
        List<Rectangle> Posti(out string resto)
        {
            List<Rectangle> fuori = new List<Rectangle>();
            resto = "";
            int alta = AltezzaRiga, lato = Font.Height - 5;
            int righe = Math.Max(1, Height / alta);
            int x = 0, r = 0;
            for (int i = 0; i < classi.Count; i++)
            {
                int w = lato + 5 + TextRenderer.MeasureText(classi[i], Font).Width + 10;
                if (x > 0 && x + w > Width) { r++; x = 0; }
                string dopo = (i < classi.Count - 1) ? "e altre " + (classi.Count - 1 - i) : "";
                int spazioDopo = (dopo == "") ? 0 : TextRenderer.MeasureText(dopo, Font).Width;
                if (r >= righe || (r == righe - 1 && x + w + spazioDopo > Width))
                {
                    resto = "e altre " + (classi.Count - i);
                    break;
                }
                fuori.Add(new Rectangle(x, r * alta, w, alta));
                x += w;
            }
            return fuori;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            if (classi.Count == 0)
            {
                TextRenderer.DrawText(g, messaggio, Font, ClientRectangle, Tema.Tenue,
                    TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix);
                return;
            }
            string resto;
            List<Rectangle> posti = Posti(out resto);
            int lato = Font.Height - 5;
            for (int i = 0; i < posti.Count; i++)
            {
                Rectangle p = posti[i];
                string v;
                if (!colori.TryGetValue(classi[i], out v)) v = "";
                QuadratoColore.Disegna(g, new Rectangle(p.X, p.Y + (p.Height - lato) / 2, lato, lato), v);
                TextRenderer.DrawText(g, classi[i], Font, new Rectangle(p.X + lato + 5, p.Y, p.Width - lato - 5, p.Height),
                    Tema.Testo, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine |
                    TextFormatFlags.NoPrefix);
            }
            if (resto != "")
            {
                Rectangle ultimo = posti.Count > 0 ? posti[posti.Count - 1] : new Rectangle(0, 0, 0, AltezzaRiga);
                TextRenderer.DrawText(g, resto, Font, new Point(ultimo.Right, ultimo.Top + (ultimo.Height - Font.Height) / 2),
                    Tema.Tenue, TextFormatFlags.NoPrefix);
            }
        }
    }

    /// <summary>
    /// "Colori delle classi..." (Orari, passo 4): una riga per ogni classe
    /// dell'orario del docente, con il quadratino del colore e la tendina dei
    /// colori degli eventi di Google Calendar, piu' "colore del calendario".
    /// Un colore cambiato qui e' scelto a mano, e resta; "Colori di partenza"
    /// rimette quelli che Campanella da' da sola. Lavora su una copia: con
    /// Annulla non cambia niente.
    /// </summary>
    class FormColoriClassi : Form
    {
        /// <summary>I colori delle classi (una copia), con quelli scelti qui.</summary>
        public readonly Dictionary<string, string> Colori;
        /// <summary>Le classi con il colore scelto a mano (una copia).</summary>
        public readonly List<string> AMano;
        /// <summary>Le classi della finestra, in ordine.</summary>
        public readonly List<string> Classi;

        readonly Dictionary<string, ComboBox> tendine = new Dictionary<string, ComboBox>();
        readonly Dictionary<string, QuadratoColore> quadrati = new Dictionary<string, QuadratoColore>();
        readonly Dictionary<string, Label> note = new Dictionary<string, Label>();
        // quelli delle lezioni gia' sul calendario (Stato.CalColoriScritti)
        readonly Dictionary<string, string> scritti;
        readonly Panel righe;
        bool riempiendo = false;
        const int Larga = 560;
        const int AltaRiga = 34;
        const int MassimoRighe = 12;         // oltre, le righe scorrono

        /// <summary>Una voce della tendina: il valore del colore, e il suo nome.</summary>
        class VoceColore
        {
            public string Valore = "";
            public override string ToString() { return ColoriLezioni.Nome(Valore); }
        }

        /// <param name="scritti">i colori delle classi nell'ultimo DatiOrari.gs uscito (Stato.CalColoriScritti), anche null</param>
        public FormColoriClassi(List<string> classi, Dictionary<string, string> colori, List<string> aMano,
                                Dictionary<string, string> scritti)
        {
            Classi = ColoriLezioni.Ordinate(classi);
            Colori = new Dictionary<string, string>(colori ?? new Dictionary<string, string>());
            AMano = new List<string>(aMano ?? new List<string>());
            this.scritti = new Dictionary<string, string>(scritti ?? new Dictionary<string, string>());
            ColoriLezioni.Completa(Colori, AMano, Classi, this.scritti);

            Text = "Colori delle classi";
            StartPosition = FormStartPosition.CenterParent;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            ShowInTaskbar = false;

            int y = 14;
            Label spiega = Tema.Testo1(
                "Ogni lezione sul calendario prende il colore della sua classe, nello stesso calendario. Sono i " +
                "colori degli eventi di Google Calendar, con i loro nomi. Di partenza ogni classe ne ha uno diverso, " +
                "sempre lo stesso; \"colore del calendario\" lascia alle sue lezioni quello del calendario." +
                (Classi.Contains(ColoriLezioni.Colloqui)
                    ? " I colloqui con le famiglie hanno il loro, nella riga Colloqui: di partenza uno che le classi " +
                      "non usano."
                    : ""),
                16, y, Larga, Tema.Normale, Ruolo.Tenue);
            Controls.Add(spiega);
            y += spiega.Height + 10;

            // le righe stanno in un riquadro, che scorre se le classi sono tante
            righe = new Panel();
            righe.Location = new Point(16, y);
            righe.Size = new Size(Larga, Math.Max(1, Math.Min(Classi.Count, MassimoRighe)) * AltaRiga);
            righe.AutoScroll = Classi.Count > MassimoRighe;
            Controls.Add(righe);
            int larghezzaNota = Larga - 450 - (righe.AutoScroll ? SystemInformation.VerticalScrollBarWidth + 4 : 0);
            int yr = 0;
            foreach (string k in Classi)
            {
                QuadratoColore q = new QuadratoColore(0, yr + 8, 18);
                righe.Controls.Add(q);
                Label nome = Tema.Testo1(k, 28, yr + 7, 190, Tema.Grassetto, Ruolo.Normale);
                nome.AutoEllipsis = true;
                nome.Height = Math.Min(nome.Height, AltaRiga - 8);
                righe.Controls.Add(nome);
                ComboBox cb = new ComboBox();
                cb.Location = new Point(226, yr + 3);
                cb.Width = 212;
                cb.DropDownStyle = ComboBoxStyle.DropDownList;
                cb.DrawMode = DrawMode.OwnerDrawFixed;
                cb.Font = Tema.Normale;
                cb.ItemHeight = Tema.Normale.Height + 5;
                cb.MaxDropDownItems = 12;
                cb.Items.Add(new VoceColore());
                for (int i = 0; i < ColoriLezioni.Tavolozza.GetLength(0); i++)
                {
                    VoceColore v = new VoceColore();
                    v.Valore = ColoriLezioni.Tavolozza[i, 0];
                    cb.Items.Add(v);
                }
                cb.DrawItem += DisegnaVoce;
                string classe = k;
                cb.SelectedIndexChanged += delegate { if (!riempiendo) Scegli(classe, ValoreDi(cb)); };
                cb.AccessibleName = "Colore di " + k;
                righe.Controls.Add(cb);
                Label nota = Tema.Testo1("", 450, yr + 9, larghezzaNota, Tema.Piccolo, Ruolo.Tenue);
                nota.Height = Tema.AltezzaTesto("scelto da te", Tema.Piccolo, larghezzaNota);
                righe.Controls.Add(nota);
                quadrati[k] = q;
                tendine[k] = cb;
                note[k] = nota;
                yr += AltaRiga;
            }
            y += righe.Height + 10;

            Label dopo = Tema.Testo1(
                "Poi rigenera DatiOrari.gs e incollalo: ORARI_4_calendario e ORARI_5_cambioOrario danno i colori " +
                "alle lezioni che mettono, ORARI_6_coloraLezioni a quelle gia' sul calendario.",
                16, y, Larga, Tema.Normale, Ruolo.Tenue);
            Controls.Add(dopo);
            y += dopo.Height + 12;

            Controls.Add(Tema.Bottone("Colori di partenza", 16, y + 2, 170, delegate { DiPartenza(); }));
            Button ok = Tema.BottonePrincipale("Usa questi colori", 16 + Larga - 180, y, 180, null);
            ok.DialogResult = DialogResult.OK;
            Controls.Add(ok);
            Button ann = Tema.Bottone("Annulla", 16 + Larga - 180 - 98, y + 2, 90, null);
            ann.DialogResult = DialogResult.Cancel;
            Controls.Add(ann);
            CancelButton = ann;
            ClientSize = new Size(16 + Larga + 16, y + 34 + 16);

            Aggiorna();
            Tema.Applica(this);
        }

        /// <summary>Il riquadro delle righe (per le prove).</summary>
        public Panel Righe { get { return righe; } }

        static string ValoreDi(ComboBox cb)
        {
            VoceColore v = cb.SelectedItem as VoceColore;
            return (v != null) ? v.Valore : "";
        }

        /// <summary>
        /// Sceglie a mano il colore di una classe ("" = il colore del
        /// calendario). Una classe che aveva lo stesso colore da Campanella ne
        /// prende subito un altro, se ce n'e' uno libero (ColoriLezioni.Completa):
        /// la finestra mostra gia' i colori che "Usa questi colori" dara', e chi
        /// le vuole uguali sceglie a mano anche l'altra.
        /// </summary>
        public void Scegli(string classe, string valore)
        {
            string v = valore ?? "";
            if (!Classi.Contains(classe) || !ColoriLezioni.Valido(v)) return;
            Colori[classe] = v;
            if (!AMano.Contains(classe)) AMano.Add(classe);
            ColoriLezioni.Completa(Colori, AMano, Classi, scritti);
            Aggiorna();
        }

        /// <summary>"Colori di partenza": tutte le classi tornano ai colori che Campanella da' da sola.</summary>
        public void DiPartenza()
        {
            ColoriLezioni.DiPartenza(Colori, AMano, Classi);
            Aggiorna();
        }

        void Aggiorna()
        {
            riempiendo = true;
            try
            {
                foreach (string k in Classi)
                {
                    string v;
                    if (!Colori.TryGetValue(k, out v)) v = "";
                    quadrati[k].Valore = v;
                    ComboBox cb = tendine[k];
                    for (int i = 0; i < cb.Items.Count; i++)
                        if (((VoceColore)cb.Items[i]).Valore == v) { cb.SelectedIndex = i; break; }
                    note[k].Text = AMano.Contains(k) ? "scelto da te" : "";
                }
            }
            finally { riempiendo = false; }
        }

        /// <summary>Una voce della tendina: il quadratino del colore e il nome.</summary>
        static void DisegnaVoce(object o, DrawItemEventArgs e)
        {
            ComboBox cb = o as ComboBox;
            if (cb == null || e.Index < 0 || e.Index >= cb.Items.Count) return;
            VoceColore v = (VoceColore)cb.Items[e.Index];
            bool evidenziata = (e.State & DrawItemState.Selected) != 0 && (e.State & DrawItemState.ComboBoxEdit) == 0;
            using (SolidBrush fondo = new SolidBrush(evidenziata ? Tema.AccentoSfondo : Tema.Campo))
                e.Graphics.FillRectangle(fondo, e.Bounds);
            int lato = Math.Max(8, e.Bounds.Height - 8);
            QuadratoColore.Disegna(e.Graphics, new Rectangle(e.Bounds.X + 4, e.Bounds.Y + (e.Bounds.Height - lato) / 2, lato, lato),
                                   v.Valore);
            Rectangle testo = new Rectangle(e.Bounds.X + lato + 12, e.Bounds.Y, Math.Max(1, e.Bounds.Width - lato - 12),
                                            e.Bounds.Height);
            TextRenderer.DrawText(e.Graphics, v.ToString(), cb.Font, testo, Tema.Testo,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine |
                TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis);
        }
    }
}
