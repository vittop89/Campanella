// ===========================================================================
//  PaginaPrivacy.cs - le regole, e gli strumenti per rispettarle
//
//  Passo 1: cosa si puo' e cosa non si puo' fare con i dati della scuola sul
//           proprio computer e dentro un assistente come ChatGPT o Claude.
//  Passo 2: incolli un testo, lo ripulisci, lo dai all'IA, e rimetti i nomi
//           veri nella risposta. Il dizionario resta qui.
//  Passo 3: trascini dei file e ne ottieni una copia senza dati personali.
//
//  Il riconoscimento lo fa rizzo-pii in locale: vedi Anonimizzatore.cs.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace Campanella
{
    class PaginaPrivacy : Pagina
    {
        static readonly string[] NomiPassi =
        {
            "1  Le regole",
            "2  Testo per l'IA",
            "3  File da ripulire"
        };

        Panel[] pagine;
        int passo = 0;

        // passo 1
        CheckBox chkLetto;

        // passo 2
        TextBox txtOriginale, txtAnonimo, txtRisposta, txtRipristinato;
        Label lblTrovati, lblSalute2;
        CheckBox chkReversibile;
        Button btnPulisci;
        bool pulendo = false;
        Dictionary<string, string> dizionario = new Dictionary<string, string>();

        // passo 3
        ListBox elencoFile;
        TextBox txtDestinazione3, log3;
        Label lblRiepilogo3, lblZona;
        Panel zonaTrascina;
        Button btnAvvia3, btnFerma3;
        Thread lavoro;
        volatile bool interrompi = false;

        public PaginaPrivacy(Guscio g) : base(g)
        {
            pagine = new Panel[NomiPassi.Length];
            pagine[0] = PaginaRegole();
            pagine[1] = PaginaTesto();
            pagine[2] = PaginaFile();
            foreach (Panel p in pagine)
            {
                p.Dock = DockStyle.Fill;
                p.Visible = false;
                p.AutoScroll = true;
                Controls.Add(p);
            }
            pagine[0].Visible = true;
        }

        public override string Nome { get { return "Privacy"; } }
        public override string[] Passi { get { return NomiPassi; } }

        /// <summary>Vero mentre un elenco di file e' in lavorazione (passo 3):
        /// chiudendo la finestra si interromperebbe a meta'.</summary>
        public bool LavoroInCorso { get { return lavoro != null && lavoro.IsAlive; } }

        /// <summary>Chiudendo la finestra: dopo il file in corso non ne comincia altri.</summary>
        public void Ferma() { interrompi = true; }

        public override int Passo
        {
            get { return passo; }
            set
            {
                if (value < 0 || value >= pagine.Length) return;
                passo = value;
                for (int i = 0; i < pagine.Length; i++) pagine[i].Visible = (i == passo);
            }
        }

        public override void Entra()
        {
            chkLetto.Checked = S.PrivacyLetta;
            chkReversibile.Checked = S.AnonReversibileTesto;
            if (txtDestinazione3.Text == "")
                txtDestinazione3.Text = (S.AnonDestinazione != "")
                    ? S.AnonDestinazione
                    : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                                   "Anonimizzati");
            Tema.Applica(this);
        }

        public override void Esce()
        {
            S.PrivacyLetta = chkLetto.Checked;
            S.AnonReversibileTesto = chkReversibile.Checked;
        }

        // ===================================================================
        //  PASSO 1 - LE REGOLE
        // ===================================================================
        Panel PaginaRegole()
        {
            Panel p = NuovaPagina("Dati della scuola, computer, intelligenza artificiale");
            int y = 46;

            p.Controls.Add(Tema.Testo1(
                "Queste non sono formalita': sono le tre o quattro cose che, se le sbagli, " +
                "creano un problema vero. Leggile una volta, poi gli strumenti dei passi 2 e 3 " +
                "ti aiutano a rispettarle.",
                0, y, 880, Tema.Normale, Ruolo.Tenue));
            y += 44;

            string[,] regole =
            {
                { "Il titolare dei dati e' la scuola, non tu",
                  "Nomi, indirizzi di servizio, orari, valutazioni, corrispondenza con le " +
                  "famiglie: sono dati personali di cui la scuola e' titolare del trattamento. " +
                  "Tu li usi per ragioni di servizio. L'esenzione \"uso domestico\" del GDPR non " +
                  "copre l'attivita' professionale: quello che fai con questi dati resta dentro " +
                  "il perimetro della scuola, anche quando lo fai dal computer di casa." },

                { "Campanella lavora dentro l'account della scuola: tienicela",
                  "Gli script girano nel tuo account Google istituzionale e non mandano niente " +
                  "fuori. Quello che puo' uscire e' cio' che copi tu sul computer: l'elenco del " +
                  "personale e gli orari con i cognomi. Dalle Impostazioni puoi tenerli in un " +
                  "file dentro il Drive della scuola invece che accanto al programma: cosi' " +
                  "restano nel perimetro dell'istituto e non finiscono su una chiavetta." },

                { "I dati degli studenti stanno fuori dal computer",
                  "Certificazioni, PDP e PEI, relazioni cliniche, segnalazioni: sono categorie " +
                  "particolari di dati (art. 9 GDPR). Non copiarle in locale e non darle a " +
                  "nessun assistente, nemmeno anonimizzate: il rischio di riconoscere comunque la " +
                  "persona, in una classe di venti, e' alto." },

                { "All'IA si da' solo testo gia' ripulito",
                  "Quando incolli un documento in ChatGPT, Claude o Gemini, quel testo esce dal " +
                  "tuo computer e finisce su server che non controlli, dove puo' essere " +
                  "conservato. Il passo 2 di questa pagina serve esattamente a questo: togli i " +
                  "dati personali prima, incolli il testo con i segnaposto, e rimetti i nomi veri " +
                  "nella risposta quando torna. Il dizionario dei nomi non esce mai da qui." },

                { "Meno dati tieni, meglio stai",
                  "Un file sul computer non scade da solo. Decidi tu per quanto tenerlo e " +
                  "cancellalo quando non serve piu'. Vale anche per le copie anonimizzate: " +
                  "se non le usi, non tenerle." },

                { "Campanella non scrive a nessun altro: gli orari arrivano solo a te",
                  "Mandare a tutti i colleghi qualcosa per iniziativa personale, anche se utile, " +
                  "e' un invio massivo: se un giorno vuoi farlo, prima parlane con la dirigenza o " +
                  "la segreteria. Lo strumento Orari non lo fa: ti manda l'orario di ogni docente " +
                  "nella tua casella, e nei dati che genera non c'e' nessun indirizzo." },

                { "Dove chiedere quando non sei sicuro",
                  "Ogni istituto ha un Responsabile della protezione dei dati (DPO): e' la " +
                  "persona giusta a cui fare la domanda, e una email di tre righe risolve dubbi " +
                  "che altrimenti restano li' per mesi. Quello che leggi qui e' un promemoria " +
                  "pratico, non un parere legale." }
            };

            for (int i = 0; i < regole.GetLength(0); i++)
            {
                Panel c = Tema.Scheda1(regole[i, 0], regole[i, 1], 0, y, 880);
                p.Controls.Add(c);
                y += c.Height + 10;
            }

            y += 6;
            Panel dpo = Tema.Scheda1("Devo avvisare la dirigenza o il DPO?",
                "Per riordinare la propria posta dentro l'account della scuola non c'e' un obbligo " +
                "di legge di chiedere un permesso: il GDPR mette gli obblighi in capo alla scuola, " +
                "e tu tratti quei dati come persona autorizzata, seguendo le sue istruzioni. Sono " +
                "proprio le istruzioni della scuola (regolamento, circolari sull'uso degli " +
                "strumenti) a dire se serve un'autorizzazione. Una comunicazione di cortesia " +
                "toglie ogni dubbio: qui sotto trovi una nota tecnica che descrive cosa fa " +
                "l'applicazione, un modello di email e la spiegazione con i riferimenti di legge.",
                0, y, 880);
            p.Controls.Add(dpo);
            y += dpo.Height + 8;

            p.Controls.Add(Tema.Bottone("Nota tecnica per dirigente e DPO", 0, y, 260,
                delegate { Guscio.ApriDocumento(Guscio.DocNotaTecnica); }));
            p.Controls.Add(Tema.Bottone("Modello di email", 272, y, 160,
                delegate { Guscio.ApriDocumento(Guscio.DocEmail); }));
            p.Controls.Add(Tema.Bottone("Cosa dice il GDPR", 444, y, 170,
                delegate { Guscio.ApriDocumento(Guscio.DocGdpr); }));
            p.Controls.Add(Tema.Bottone("Note complete sulla privacy", 626, y, 230,
                delegate { Guscio.ApriDocumento(Guscio.DocPrivacy); }));
            y += 46;

            chkLetto = Tema.Spunta("Ho letto: mi ricordo come funziona", 0, y, Ruolo.Buono);
            chkLetto.Font = Tema.Grassetto;
            p.Controls.Add(chkLetto);
            y += 40;
            p.Controls.Add(Tema.Testo1("", 0, y, 10, Tema.Piccolo, Ruolo.Tenue));   // margine in fondo
            return p;
        }

        // ===================================================================
        //  PASSO 2 - TESTO PER L'IA
        // ===================================================================
        Panel PaginaTesto()
        {
            Panel p = NuovaPagina("Prepara un testo da dare all'intelligenza artificiale");
            int y = 46;

            Tema.RigaAiuto(p,
                "Incolla il testo com'e', premi \"Togli i dati personali\" e usa il risultato.",
                0, y, Tema.Normale, Ruolo.Tenue, "Come si usa",
                "1. Incolla qui il testo com'e' e premi \"Togli i dati personali\".\r\n\r\n" +
                "2. Copia il risultato e incollalo nell'assistente.\r\n\r\n" +
                "3. Quando ti risponde, incolla la risposta in basso e premi \"Rimetti i nomi " +
                "veri\".\r\n\r\n" +
                "La corrispondenza fra segnaposto e nomi veri resta su questo computer e non " +
                "viene mai spedita da nessuna parte.");
            y += 40;

            p.Controls.Add(Tema.Bottone("Controlla rizzo-pii", 0, y, 170, delegate
            {
                Anonimizzatore a = Servizio();
                lblSalute2.Text = "Controllo rizzo-pii su " + a.Indirizzo + "...";
                lblSalute2.Tag = Ruolo.Tenue;
                Tema.Applica(lblSalute2);
                // la rete fuori dal thread dell'interfaccia: la pagina non si blocca
                ThreadPool.QueueUserWorkItem(delegate
                {
                    SaluteAnonimizzatore s = a.Salute();
                    SulThread(delegate
                    {
                        lblSalute2.Text = s.Messaggio;
                        lblSalute2.Tag = s.Pronto ? Ruolo.Buono : Ruolo.Avviso;
                        Tema.Applica(lblSalute2);
                    });
                });
            }));
            chkReversibile = Tema.Spunta("Tieni il dizionario, cosi' posso ripristinare la risposta",
                                         186, y + 6, Ruolo.Normale);
            chkReversibile.Checked = true;
            p.Controls.Add(chkReversibile);
            y += 34;

            lblSalute2 = Tema.Testo1("", 0, y, 880, Tema.Piccolo, Ruolo.Tenue);
            lblSalute2.Height = 34;
            p.Controls.Add(lblSalute2);
            y += 38;

            p.Controls.Add(Tema.Testo1("Testo originale", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            p.Controls.Add(Tema.Testo1("Testo da dare all'IA", 450, y, 0, Tema.Grassetto, Ruolo.Normale));
            y += 22;

            txtOriginale = Tema.CasellaMulti(0, y, 430, 230);
            txtOriginale.Font = Tema.Mono;
            p.Controls.Add(txtOriginale);

            txtAnonimo = Tema.CasellaMulti(450, y, 430, 230);
            txtAnonimo.Font = Tema.Mono;
            txtAnonimo.ReadOnly = true;
            txtAnonimo.Tag = Ruolo.Codice;
            p.Controls.Add(txtAnonimo);
            y += 240;

            btnPulisci = Tema.BottonePrincipale("Togli i dati personali", 0, y, 200,
                delegate { Pulisci(); });
            p.Controls.Add(btnPulisci);
            p.Controls.Add(Tema.Bottone("Incolla dagli appunti", 210, y + 2, 170, delegate
            {
                try { if (Clipboard.ContainsText()) txtOriginale.Text = Clipboard.GetText(); }
                catch { }
            }));
            p.Controls.Add(Tema.Bottone("Copia il testo pulito", 450, y + 2, 200, delegate
            {
                if (txtAnonimo.Text.Trim() == "") { Guscio.Stato1("Non c'e' ancora niente da copiare.", Tema.Ambra); return; }
                Guscio.Copia(txtAnonimo.Text, "Testo pulito copiato: adesso puoi incollarlo nell'IA.");
            }));
            p.Controls.Add(Tema.Bottone("Svuota tutto", 660, y + 2, 130, delegate
            {
                txtOriginale.Clear(); txtAnonimo.Clear();
                txtRisposta.Clear(); txtRipristinato.Clear();
                dizionario.Clear();
                lblTrovati.Text = "";
                Tema.Applica(lblTrovati);
            }));
            y += 42;

            lblTrovati = Tema.Testo1("", 0, y, 880, Tema.Normale, Ruolo.Normale);
            lblTrovati.Height = 40;
            p.Controls.Add(lblTrovati);
            y += 48;

            p.Controls.Add(Tema.Testo1("Risposta dell'IA (con i segnaposto)", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            p.Controls.Add(Tema.Testo1("Risposta con i nomi veri", 450, y, 0, Tema.Grassetto, Ruolo.Normale));
            y += 22;

            txtRisposta = Tema.CasellaMulti(0, y, 430, 180);
            txtRisposta.Font = Tema.Mono;
            p.Controls.Add(txtRisposta);

            txtRipristinato = Tema.CasellaMulti(450, y, 430, 180);
            txtRipristinato.Font = Tema.Mono;
            txtRipristinato.ReadOnly = true;
            txtRipristinato.Tag = Ruolo.Codice;
            p.Controls.Add(txtRipristinato);
            y += 190;

            p.Controls.Add(Tema.BottonePrincipale("Rimetti i nomi veri", 0, y, 200,
                delegate { Rimetti(); }));
            p.Controls.Add(Tema.Bottone("Copia la risposta", 450, y + 2, 200, delegate
            {
                if (txtRipristinato.Text.Trim() == "") { Guscio.Stato1("Non c'e' ancora niente da copiare.", Tema.Ambra); return; }
                Guscio.Copia(txtRipristinato.Text, "Risposta copiata.");
            }));
            y += 46;

            p.Controls.Add(Tema.Testo1(
                "Il controllo finale resta tuo: rileggi il testo pulito prima di incollarlo. " +
                "Nessun riconoscitore prende il 100%, e un dettaglio che identifica una persona " +
                "puo' non essere un nome (\"la collega di sostegno della 3B\" identifica benissimo).",
                0, y, 880, Tema.Piccolo, Ruolo.Avviso));
            return p;
        }

        Anonimizzatore Servizio()
        {
            Anonimizzatore a = new Anonimizzatore();
            a.Indirizzo = (S.AnonIndirizzo != "" ? S.AnonIndirizzo : Stato.AnonIndirizzoDiDefault)
                          .Trim().TrimEnd('/');
            return a;
        }

        /// <summary>Esegue sul thread dell'interfaccia, se la pagina c'e' ancora.</summary>
        void SulThread(MethodInvoker m)
        {
            try { if (IsHandleCreated && !IsDisposed) BeginInvoke(m); }
            catch (InvalidOperationException) { }     // finestra chiusa nel frattempo
        }

        /// <summary>
        /// Toglie i dati personali dal testo. Controllo e anonimizzazione
        /// girano fuori dal thread dell'interfaccia (su un testo lungo la CPU
        /// ci mette anche minuti): la finestra resta viva, e il pulsante resta
        /// spento finche' non torna la risposta.
        /// </summary>
        void Pulisci()
        {
            if (pulendo) return;
            string testo = txtOriginale.Text;
            if (testo.Trim() == "")
            {
                MessageBox.Show(this, "Incolla prima il testo da ripulire.", "Niente da fare",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            Anonimizzatore a = Servizio();
            a.ConDizionario = chkReversibile.Checked;
            bool reversibile = a.ConDizionario;

            pulendo = true;
            btnPulisci.Enabled = false;
            Cursor = Cursors.WaitCursor;
            lblTrovati.Text = "Sto ripulendo il testo con rizzo-pii...";
            lblTrovati.Tag = Ruolo.Tenue;
            Tema.Applica(lblTrovati);

            ThreadPool.QueueUserWorkItem(delegate
            {
                SaluteAnonimizzatore s = a.Salute();
                string pulito = null, errore = null;
                int entita = 0;
                Dictionary<string, string> diz = null;
                Dictionary<string, int> perTipo = null;
                if (s.Pronto)
                {
                    try { pulito = a.TestoAnonimo(testo, out entita, out diz, out perTipo); }
                    catch (Exception ex) { errore = Anonimizzatore.Spiega(ex); }
                }

                SulThread(delegate
                {
                    pulendo = false;
                    btnPulisci.Enabled = true;
                    Cursor = Cursors.Default;
                    lblTrovati.Text = "";
                    lblTrovati.Tag = Ruolo.Normale;
                    Tema.Applica(lblTrovati);

                    if (!s.Pronto)
                    {
                        lblSalute2.Text = s.Messaggio;
                        lblSalute2.Tag = Ruolo.Avviso;
                        Tema.Applica(lblSalute2);
                        MessageBox.Show(this, s.Messaggio, "rizzo-pii non e' pronto",
                            MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }
                    if (errore != null)
                    {
                        MessageBox.Show(this, errore, "Non ci sono riuscito",
                            MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }

                    dizionario = diz;
                    txtAnonimo.Text = pulito;

                    List<string> pezzi = new List<string>();
                    foreach (KeyValuePair<string, int> kv in perTipo)
                        pezzi.Add(kv.Value + " " + kv.Key.ToLowerInvariant());

                    lblTrovati.Text = (entita == 0)
                        ? "Non ho trovato dati personali. Rileggi comunque: potrebbe esserci qualcosa " +
                          "che identifica una persona senza essere un nome."
                        : "Tolti " + entita + " dati personali" +
                          (pezzi.Count > 0 ? ":  " + string.Join(",  ", pezzi.ToArray()) : "") +
                          (reversibile
                            ? ".   Dizionario tenuto in memoria: " + dizionario.Count + " voci."
                            : ".   Nessun dizionario: l'operazione non e' reversibile.");
                    lblTrovati.Tag = (entita == 0) ? Ruolo.Avviso : Ruolo.Buono;
                    Tema.Applica(lblTrovati);
                    Guscio.Stato1("Testo ripulito: " + entita + " dati personali tolti.");
                });
            });
        }

        void Rimetti()
        {
            if (dizionario.Count == 0)
            {
                MessageBox.Show(this,
                    "Non ho nessun dizionario da usare.\n\n" +
                    "Serve aver ripulito un testo in questa stessa sessione, con la spunta " +
                    "\"Tieni il dizionario\" attiva.",
                    "Niente dizionario", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            int rimessi;
            txtRipristinato.Text = Anonimizzatore.Ripristina(txtRisposta.Text, dizionario, out rimessi);
            Guscio.Stato1("Rimessi " + rimessi + " valori veri su " + dizionario.Count + " del dizionario.");
        }

        // ===================================================================
        //  PASSO 3 - FILE
        // ===================================================================
        Panel PaginaFile()
        {
            Panel p = NuovaPagina("Ripulisci dei file");
            int y = 46;

            p.Controls.Add(Tema.Testo1(
                "Trascina qui i file da ripulire, oppure scegli con Sfoglia. Di ognuno viene " +
                "fatta una copia senza dati personali nella cartella di destinazione: " +
                "l'originale non viene toccato.",
                0, y, 880, Tema.Normale, Ruolo.Tenue));
            y += 44;

            zonaTrascina = new Panel();
            zonaTrascina.Location = new Point(0, y);
            zonaTrascina.Size = new Size(880, 92);
            zonaTrascina.Tag = Ruolo.Scheda;
            zonaTrascina.AllowDrop = true;
            Tema.Contorna(zonaTrascina);
            lblZona = Tema.Testo1("Trascina qui i file  (" + Anonimizzatore.Formati() + ")",
                                  0, 34, 880, Tema.Sottosezione, Ruolo.Accento);
            lblZona.TextAlign = ContentAlignment.MiddleCenter;
            lblZona.Height = 24;
            zonaTrascina.Controls.Add(lblZona);

            DragEventHandler entra = delegate (object mitt, DragEventArgs e)
            {
                if (e.Data.GetDataPresent(DataFormats.FileDrop))
                {
                    e.Effect = DragDropEffects.Copy;
                    zonaTrascina.BackColor = Tema.AccentoSfondo;
                }
            };
            DragEventHandler lascia = delegate (object mitt, DragEventArgs e)
            {
                zonaTrascina.BackColor = Tema.Scheda;
                if (!e.Data.GetDataPresent(DataFormats.FileDrop)) return;
                AggiungiFile((string[])e.Data.GetData(DataFormats.FileDrop));
            };
            zonaTrascina.DragEnter += entra;
            zonaTrascina.DragDrop += lascia;
            zonaTrascina.DragLeave += delegate { zonaTrascina.BackColor = Tema.Scheda; };
            lblZona.AllowDrop = true;
            lblZona.DragEnter += entra;
            lblZona.DragDrop += lascia;
            p.Controls.Add(zonaTrascina);
            y += 104;

            p.Controls.Add(Tema.Bottone("Sfoglia...", 0, y, 130, delegate
            {
                using (OpenFileDialog d = new OpenFileDialog())
                {
                    d.Multiselect = true;
                    d.Filter = Anonimizzatore.FiltroFile();
                    if (d.ShowDialog(this) == DialogResult.OK) AggiungiFile(d.FileNames);
                }
            }));
            p.Controls.Add(Tema.Bottone("Aggiungi una cartella...", 140, y, 200, delegate
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    d.Description = "Scegli la cartella: prendo tutti i file, anche nelle sottocartelle";
                    if (d.ShowDialog(this) != DialogResult.OK) return;
                    AggiungiFile(FileDellaCartella(d.SelectedPath));
                }
            }));
            p.Controls.Add(Tema.Bottone("Togli i selezionati", 350, y, 170, delegate
            {
                List<int> indici = new List<int>();
                foreach (int i in elencoFile.SelectedIndices) indici.Add(i);
                indici.Sort();
                for (int i = indici.Count - 1; i >= 0; i--) elencoFile.Items.RemoveAt(indici[i]);
                AggiornaConteggio3();
            }));
            p.Controls.Add(Tema.Bottone("Svuota l'elenco", 530, y, 150, delegate
            {
                elencoFile.Items.Clear();
                AggiornaConteggio3();
            }));
            y += 40;

            elencoFile = new ListBox();
            elencoFile.Location = new Point(0, y);
            elencoFile.Size = new Size(880, 160);
            elencoFile.Font = Tema.Piccolo;
            elencoFile.SelectionMode = SelectionMode.MultiExtended;
            elencoFile.HorizontalScrollbar = true;
            p.Controls.Add(elencoFile);
            y += 170;

            p.Controls.Add(Tema.Testo1("Dove mettere le copie pulite", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtDestinazione3 = Tema.Casella(0, y + 24, 720, "una cartella per le copie pulite");
            p.Controls.Add(txtDestinazione3);
            p.Controls.Add(Tema.Bottone("Sfoglia...", 732, y + 23, 120, delegate
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    if (Directory.Exists(txtDestinazione3.Text)) d.SelectedPath = txtDestinazione3.Text;
                    if (d.ShowDialog(this) == DialogResult.OK) txtDestinazione3.Text = d.SelectedPath;
                }
            }));
            y += 62;

            btnAvvia3 = Tema.BottonePrincipale("Ripulisci i file", 0, y, 180, delegate { Avvia3(); });
            p.Controls.Add(btnAvvia3);
            btnFerma3 = Tema.Bottone("Ferma", 192, y + 2, 120, delegate { interrompi = true; });
            btnFerma3.Enabled = false;
            p.Controls.Add(btnFerma3);
            p.Controls.Add(Tema.Bottone("Apri la cartella", 324, y + 2, 160, delegate
            {
                if (Directory.Exists(txtDestinazione3.Text)) Guscio.Apri(txtDestinazione3.Text);
            }));
            y += 44;

            lblRiepilogo3 = Tema.Testo1("", 0, y, 880, Tema.Grassetto, Ruolo.Normale);
            lblRiepilogo3.Height = 22;
            p.Controls.Add(lblRiepilogo3);
            y += 28;

            log3 = Tema.Registro(0, y, 880, 180, true);
            p.Controls.Add(log3);
            return p;
        }

        void AggiungiFile(string[] percorsi)
        {
            int aggiunti = 0;
            foreach (string f in percorsi)
            {
                if (Directory.Exists(f))
                {
                    AggiungiFile(FileDellaCartella(f));
                    continue;
                }
                if (!File.Exists(f)) continue;
                if (elencoFile.Items.Contains(f)) continue;
                elencoFile.Items.Add(f);
                aggiunti++;
            }
            AggiornaConteggio3();
            if (aggiunti > 0) Guscio.Stato1("Aggiunti " + aggiunti + " file.");
        }

        /// <summary>I file di una cartella e delle sottocartelle, senza quelli di
        /// lavoro: a mezza sincronizzazione, aperti da Word, nascosti.</summary>
        static string[] FileDellaCartella(string cartella)
        {
            List<string> fuori = new List<string>();
            foreach (string f in Directory.GetFiles(cartella, "*", SearchOption.AllDirectories))
                if (!Anonimizzatore.Temporaneo(f)) fuori.Add(f);
            return fuori.ToArray();
        }

        void AggiornaConteggio3()
        {
            int trattabili = 0;
            foreach (object o in elencoFile.Items)
                if (Anonimizzatore.Trattabile(Convert.ToString(o))) trattabili++;
            int totale = elencoFile.Items.Count;
            lblRiepilogo3.Text = (totale == 0)
                ? ""
                : "In elenco: " + totale + "   ·   che so trattare: " + trattabili +
                  (trattabili < totale
                    ? "   ·   " + (totale - trattabili) + " di formato non gestito (verranno saltati)"
                    : "");
            lblRiepilogo3.Tag = (trattabili < totale) ? Ruolo.Avviso : Ruolo.Normale;
            Tema.Applica(lblRiepilogo3);
        }

        void Scrivi3(string riga)
        {
            if (log3.InvokeRequired) { log3.BeginInvoke((MethodInvoker)delegate { Scrivi3(riga); }); return; }
            log3.AppendText(riga + "\r\n");
            log3.SelectionStart = log3.TextLength;
            log3.ScrollToCaret();
        }

        void Bottoni3(bool inCorso)
        {
            if (btnAvvia3.InvokeRequired)
            {
                btnAvvia3.BeginInvoke((MethodInvoker)delegate { Bottoni3(inCorso); });
                return;
            }
            btnAvvia3.Enabled = !inCorso;
            btnFerma3.Enabled = inCorso;
        }

        void Avvia3()
        {
            if (lavoro != null && lavoro.IsAlive) return;
            if (elencoFile.Items.Count == 0)
            {
                MessageBox.Show(this, "Trascina qui almeno un file.", "Elenco vuoto",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            string destinazione = txtDestinazione3.Text.Trim();
            if (destinazione == "")
            {
                MessageBox.Show(this, "Scegli dove mettere le copie pulite.", "Manca la cartella",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            List<string> file = new List<string>();
            foreach (object o in elencoFile.Items) file.Add(Convert.ToString(o));

            // le copie pulite nella cartella degli originali finirebbero sopra di loro
            string stessa = Anonimizzatore.CartellaDiOrigine(file, destinazione);
            if (stessa != null)
            {
                MessageBox.Show(this,
                    "La cartella per le copie pulite e' la stessa in cui sta uno dei file da " +
                    "ripulire:\n\n" + stessa + "\n\n" +
                    "Le copie finirebbero sopra gli originali. Scegli un'altra cartella, per " +
                    "esempio una sottocartella \"Anonimizzati\".",
                    "Cartella da cambiare", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            Anonimizzatore a = Servizio();
            a.ConDizionario = false;      // sui file l'anonimizzazione e' definitiva

            log3.Clear();
            interrompi = false;
            Bottoni3(true);
            S.AnonDestinazione = destinazione;

            lavoro = new Thread(delegate () { Lavora3(a, file, destinazione); });
            lavoro.IsBackground = true;
            lavoro.Start();
        }

        void Lavora3(Anonimizzatore a, List<string> file, string destinazione)
        {
            int fatti = 0, saltati = 0, entita = 0;
            try
            {
                // il controllo di rizzo-pii sta qui, fuori dal thread dell'interfaccia
                Scrivi3("Controllo rizzo-pii su " + a.Indirizzo + "...");
                SaluteAnonimizzatore s = a.Salute();
                if (!s.Pronto)
                {
                    Scrivi3("rizzo-pii non e' pronto: non ho toccato nessun file.");
                    SulThread(delegate
                    {
                        MessageBox.Show(this, s.Messaggio, "rizzo-pii non e' pronto",
                            MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    });
                    return;
                }

                Directory.CreateDirectory(destinazione);
                Scrivi3("File da trattare: " + file.Count);
                Scrivi3("");

                // nomi tutti diversi: due file omonimi di cartelle diverse non
                // finiscono uno sull'altro
                string[] nomi = Anonimizzatore.NomiDiUscita(file);
                for (int i = 0; i < file.Count; i++)
                {
                    if (interrompi) { Scrivi3(""); Scrivi3("Fermato da te."); break; }

                    string f = file[i], nome = nomi[i];
                    EsitoFile e = a.Anonimizza(f, Path.Combine(destinazione, nome));
                    if (e.Fatto)
                    {
                        fatti++;
                        entita += e.Entita;
                        Scrivi3("  ok    " + nome + "   (" + e.Entita + " dati tolti)" +
                                (e.Nota != "" ? "   ATTENZIONE: " + e.Nota : ""));
                    }
                    else
                    {
                        saltati++;
                        Scrivi3("  no    " + nome + "   " + e.Nota);
                    }
                }

                Scrivi3("");
                Scrivi3("=== FINE ===");
                Scrivi3("Ripuliti ......... " + fatti);
                Scrivi3("Dati tolti ....... " + entita);
                Scrivi3("Saltati .......... " + saltati);
                Scrivi3("");
                Scrivi3("Copie pulite in: " + destinazione);
            }
            catch (Exception ex)
            {
                Scrivi3("ERRORE: " + Anonimizzatore.Spiega(ex));
            }
            finally { Bottoni3(false); }
        }

        Panel NuovaPagina(string titolo)
        {
            Panel p = new Panel();
            p.AutoScroll = true;
            p.Controls.Add(Tema.Testo1(titolo, 0, 6, 0, Tema.Sezione, Ruolo.Sezione));
            return p;
        }
    }
}
