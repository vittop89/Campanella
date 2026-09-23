// ===========================================================================
//  Guscio.cs - la finestra che tiene insieme gli strumenti
//
//     Posta     riordina la casella con le etichette
//     Cartelle  crea la struttura del nuovo anno scolastico nel Drive
//     Orari     manda a te stesso l'orario di ogni docente e mette il tuo
//               su Google Calendar
//     Privacy   le regole, e gli strumenti per togliere i dati personali
//
//  Ogni strumento e' una Pagina; alcune hanno dei passi, che compaiono
//  rientrati nella barra di sinistra. La barra si costruisce una volta sola:
//  cambiando pagina si spostano e si mostrano i bottoni gia' fatti, che e'
//  il motivo per cui non sfarfalla piu'.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("Campanella")]
[assembly: AssemblyDescription("Gli strumenti della scuola in un posto solo: posta, cartelle, orari, privacy")]
[assembly: AssemblyProduct("Campanella")]
[assembly: AssemblyCompany("Vittorio Pantaleo")]
[assembly: AssemblyCopyright("Licenza MIT")]
[assembly: AssemblyVersion("1.4.6.0")]
[assembly: AssemblyFileVersion("1.4.6.0")]

namespace Campanella
{
    static class Programma
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Un errore che nessuno ha previsto non deve aprire la finestra di
            // .NET, con la traccia dello stack e "Continua": basta dire cosa e'
            // successo, in italiano, e se il programma puo' andare avanti.
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object o, System.Threading.ThreadExceptionEventArgs e)
            {
                MostraImprevisto(e.Exception, false);
            };
            AppDomain.CurrentDomain.UnhandledException += delegate(object o, UnhandledExceptionEventArgs e)
            {
                MostraImprevisto(e.ExceptionObject as Exception, e.IsTerminating);
            };

            try
            {
                Stato s = Stato.Carica();
                Tema.Imposta(s.TemaScuro);

                // Se la cartella e' in sola lettura (chiavetta protetta, cartella
                // di rete senza permessi) e' meglio saperlo adesso che dopo
                // un'ora di lavoro: qui si salva accanto all'eseguibile.
                string perche;
                if (!Stato.CartellaScrivibile(out perche))
                {
                    MessageBox.Show(
                        "Non riesco a scrivere nella cartella dove si trova Campanella:\n\n" +
                        Path.GetDirectoryName(Application.ExecutablePath) + "\n\n" +
                        "Motivo: " + perche + "\n\n" +
                        "Il programma funziona lo stesso, ma quello che imposti " +
                        "(elenco del personale, regole, orari) andra' perso quando lo chiudi, " +
                        "e le condizioni d'uso ti verranno richieste tutte le volte.\n\n" +
                        "Per tenere le impostazioni, copia Campanella in una cartella dove " +
                        "puoi scrivere: per esempio in Documenti, oppure installala.",
                        "Le impostazioni non si possono salvare",
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }

                // le condizioni d'uso vengono prima di tutto: riguardano dati
                // di altre persone, non e' una formalita' da rimandare
                if (!Consenso.Richiedi(null, s)) return;

                if (s.DatiNelDrive && s.DatiNonTrovati)
                {
                    MessageBox.Show(
                        "I dati personali (elenco del personale, indirizzi, orari) dovrebbero " +
                        "stare in\n\n" + s.PercorsoDati() + "\n\n" +
                        "ma il file non c'e': il Drive non ha ancora sincronizzato, oppure la " +
                        "cartella e' cambiata. Per ora risultano vuoti.\n\n" +
                        "Se il Drive sta ancora scaricando, chiudi e riapri Campanella fra " +
                        "qualche minuto. Se invece hai spostato la cartella, sistemala in " +
                        "Impostazioni.",
                        "Non trovo il file dei dati", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }

                Application.Run(new Guscio(s));
            }
            catch (Exception ex)
            {
                MessageBox.Show("Errore imprevisto:\n\n" + ex.Message,
                    "Campanella", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static bool mostrandoImprevisto = false;

        /// <summary>
        /// Il messaggio breve di un errore imprevisto. Uno alla volta: un errore
        /// che si ripete (per esempio mentre si ridisegna una pagina) non deve
        /// aprire una finestra sopra l'altra.
        /// </summary>
        static void MostraImprevisto(Exception ex, bool chiude)
        {
            if (mostrandoImprevisto) return;
            mostrandoImprevisto = true;
            try
            {
                MessageBox.Show(TestoImprevisto(ex, chiude), "Campanella", MessageBoxButtons.OK,
                    chiude ? MessageBoxIcon.Error : MessageBoxIcon.Warning);
            }
            catch (Exception) { /* senza finestre (Windows in chiusura) non c'e' altro modo di dirlo */ }
            finally { mostrandoImprevisto = false; }
        }

        static string TestoImprevisto(Exception ex, bool chiude)
        {
            string motivo = (ex != null && !string.IsNullOrEmpty(ex.Message)) ? ex.Message : "motivo sconosciuto";
            return "Qualcosa non e' andato come previsto:\n\n" + motivo + "\n\n" +
                   (chiude
                        ? "Campanella deve chiudersi: quello che hai cambiato da quando l'hai " +
                          "aperta potrebbe non essere salvato."
                        : "Puoi continuare a lavorare. Se qualcosa non risponde, chiudi e riapri Campanella.");
        }
    }

    // =======================================================================
    //  PAGINA
    // =======================================================================
    abstract class Pagina : Panel
    {
        protected Guscio Guscio;
        protected Stato S { get { return Guscio.S; } }

        protected Pagina(Guscio g)
        {
            Guscio = g;
            Dock = DockStyle.Fill;
            Visible = false;
            AutoScroll = true;
        }

        public abstract string Nome { get; }
        public virtual string[] Passi { get { return new string[0]; } }
        public virtual int Passo { get { return 0; } set { } }
        public virtual void Entra() { }
        public virtual void Esce() { }
    }

    // =======================================================================
    //  FINESTRA PRINCIPALE
    // =======================================================================
    class Guscio : Form
    {
        public Stato S;

        Panel contenuto, laterale, testata, piede;
        Label lblTitolo, lblSottotitolo, lblStato;
        Button btnTema, btnIndietro, btnAvanti;

        List<Pagina> pagine = new List<Pagina>();

        /// <summary>Un bottone della barra laterale: uno strumento, o un suo passo.</summary>
        class VoceMenu
        {
            public Button Bottone;
            public int Pagina;
            public int Passo;        // -1 = la voce e' lo strumento
            public bool Piccola;
        }
        List<VoceMenu> voci = new List<VoceMenu>();
        int pagina = 0;

        public Guscio(Stato stato)
        {
            S = stato;
            Tema.Imposta(S.TemaScuro);

            Text = "Campanella";
            Size = new Size(1240, 880);
            MinimumSize = new Size(1080, 700);
            StartPosition = FormStartPosition.CenterScreen;
            Font = Tema.Normale;

            CostruisciTestata();
            CostruisciPiede();
            CostruisciLaterale();

            contenuto = new Panel();
            contenuto.Dock = DockStyle.Fill;
            contenuto.Padding = new Padding(26, 16, 26, 8);
            Controls.Add(contenuto);
            contenuto.BringToFront();

            pagine.Add(new PaginaHome(this));
            pagine.Add(new PaginaPosta(this));
            pagine.Add(new PaginaCartelle(this));
            pagine.Add(new PaginaOrari(this));
            pagine.Add(new PaginaPrivacy(this));
            pagine.Add(new PaginaImpostazioni(this));

            foreach (Pagina p in pagine) contenuto.Controls.Add(p);

            CostruisciMenu();
            Tema.Applica(this);
            VaiA(0, 0);

            FormClosing += delegate { SalvaTutto(); };
        }

        public void SalvaTutto()
        {
            foreach (Pagina p in pagine) p.Esce();
            S.TemaScuro = Tema.Scuro;
            S.Salva();
        }

        // -------------------------------------------------------------------
        void CostruisciTestata()
        {
            testata = new Panel();
            testata.Dock = DockStyle.Top;
            testata.Height = 78;
            testata.Tag = Ruolo.Barra;
            Tema.LineaSotto(testata);

            lblTitolo = Tema.Testo1("Campanella", 26, 14, 0, Tema.Titolo, Ruolo.Titolo);
            lblSottotitolo = Tema.Testo1("Gli strumenti della scuola in un posto solo.",
                                         28, 46, 0, Tema.Normale, Ruolo.Sottotitolo);
            testata.Controls.Add(lblTitolo);
            testata.Controls.Add(lblSottotitolo);

            btnTema = Tema.Bottone("Tema chiaro", 0, 22, 150, delegate { CambiaTema(); });
            btnTema.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            testata.Resize += delegate { btnTema.Location = new Point(testata.Width - 176, 22); };
            testata.Controls.Add(btnTema);

            Controls.Add(testata);
        }

        void CostruisciPiede()
        {
            piede = new Panel();
            piede.Dock = DockStyle.Bottom;
            piede.Height = 58;
            piede.Tag = Ruolo.Barra;
            Tema.LineaSopra(piede);

            btnAvanti = Tema.BottonePrincipale("Avanti  >", 0, 12, 130, delegate { Avanti(); });
            btnAvanti.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnIndietro = Tema.Bottone("<  Indietro", 0, 14, 120,
                delegate { VaiA(pagina, PaginaCorrente.Passo - 1); });
            btnIndietro.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            piede.Resize += delegate { DisponiPiede(); };

            lblStato = Tema.Testo1("", 26, 20, 0, Tema.Piccolo, Ruolo.Buono);
            piede.Controls.Add(lblStato);
            piede.Controls.Add(btnIndietro);
            piede.Controls.Add(btnAvanti);
            Controls.Add(piede);
        }

        void CostruisciLaterale()
        {
            laterale = new PannelloLiscio();
            laterale.Dock = DockStyle.Left;
            laterale.Width = 246;
            laterale.Tag = Ruolo.Barra;
            laterale.AutoScroll = true;
            Tema.LineaDestra(laterale);
            Controls.Add(laterale);
        }

        Pagina PaginaCorrente { get { return pagine[pagina]; } }

        // -------------------------------------------------------------------
        //  LA BARRA LATERALE
        //  Tutti i bottoni nascono qui, una volta. Poi si spostano e basta.
        // -------------------------------------------------------------------
        void CostruisciMenu()
        {
            laterale.SuspendLayout();
            for (int i = 0; i < pagine.Count; i++)
            {
                Pagina p = pagine[i];
                Button b = VoceBottone(p.Nome, 212, 40, false);
                int indice = i;
                b.Click += delegate { VaiA(indice, 0); };
                laterale.Controls.Add(b);
                VoceMenu v = new VoceMenu();
                v.Bottone = b; v.Pagina = i; v.Passo = -1; v.Piccola = false;
                voci.Add(v);

                for (int k = 0; k < p.Passi.Length; k++)
                {
                    Button sb = VoceBottone(p.Passi[k], 198, 30, true);
                    sb.Visible = false;
                    int ip = i, ik = k;
                    sb.Click += delegate { VaiA(ip, ik); };
                    laterale.Controls.Add(sb);
                    VoceMenu vs = new VoceMenu();
                    vs.Bottone = sb; vs.Pagina = i; vs.Passo = k; vs.Piccola = true;
                    voci.Add(vs);
                }
            }
            laterale.ResumeLayout();
        }

        Button VoceBottone(string testo, int w, int h, bool piccola)
        {
            Button b = new Button();
            b.Text = testo;
            b.Size = new Size(w, h);
            b.TextAlign = ContentAlignment.MiddleLeft;
            b.Padding = new Padding(piccola ? 14 : 12, 0, 0, 0);
            b.Font = piccola ? Tema.Piccolo : Tema.Normale;
            b.Tag = Ruolo.Barra;
            b.Cursor = Cursors.Hand;
            b.TabStop = false;
            return b;
        }

        /// <summary>Mostra i passi dello strumento corrente e sistema le posizioni.</summary>
        void DisponiMenu()
        {
            laterale.SuspendLayout();
            int y = 14;
            bool passiMostrati = false;
            foreach (VoceMenu v in voci)
            {
                if (v.Passo < 0)
                {
                    if (passiMostrati) { y += 8; passiMostrati = false; }
                    v.Bottone.Location = new Point(12, y);
                    y += 42;
                }
                else
                {
                    bool mostra = (v.Pagina == pagina);
                    if (mostra)
                    {
                        v.Bottone.Location = new Point(26, y);
                        y += 31;
                        passiMostrati = true;
                    }
                    v.Bottone.Visible = mostra;
                }
            }
            laterale.ResumeLayout();
        }

        void AggiornaMenu()
        {
            foreach (VoceMenu v in voci)
            {
                bool selezionata = (v.Pagina == pagina) &&
                                   (v.Passo == -1
                                        ? PaginaCorrente.Passi.Length == 0
                                        : v.Passo == PaginaCorrente.Passo);
                bool stessoStrumento = (v.Pagina == pagina && v.Passo == -1);
                bool evidenza = selezionata || stessoStrumento;

                Button b = v.Bottone;
                b.BackColor = selezionata ? Tema.AccentoSfondo
                            : stessoStrumento ? Tema.Mescola(Tema.Pannello, Tema.Accento, 0.08)
                            : Tema.Pannello;
                b.ForeColor = evidenza ? Tema.Accento : Tema.Testo;
                Font f = v.Piccola ? (evidenza ? Tema.PiccoloGrassetto : Tema.Piccolo)
                                   : (evidenza ? Tema.Grassetto : Tema.Normale);
                if (!ReferenceEquals(b.Font, f)) b.Font = f;
            }
        }

        // -------------------------------------------------------------------
        public void VaiA(int indicePagina, int passo)
        {
            if (indicePagina < 0 || indicePagina >= pagine.Count) return;
            bool cambiaStrumento = (indicePagina != pagina);
            if (cambiaStrumento) pagine[pagina].Esce();

            pagina = indicePagina;
            Pagina p = pagine[pagina];

            if (p.Passi.Length > 0)
            {
                if (passo < 0) passo = 0;
                if (passo >= p.Passi.Length) passo = p.Passi.Length - 1;
                p.Passo = passo;
            }

            contenuto.SuspendLayout();
            for (int i = 0; i < pagine.Count; i++) pagine[i].Visible = (i == pagina);
            contenuto.ResumeLayout();
            p.Entra();

            DisponiMenu();
            AggiornaMenu();

            // All'ultimo passo "Avanti" porta allo strumento dopo, e lo dice; se
            // dopo non ce n'e' uno con dei passi (dopo Privacy vengono solo le
            // Impostazioni) si spegne. Prima restava identico e non faceva niente.
            bool conPassi = p.Passi.Length > 0;
            bool ultimo = conPassi && p.Passo >= p.Passi.Length - 1;
            int seguente = ultimo ? PaginaSeguente() : -1;
            btnIndietro.Visible = conPassi;
            btnAvanti.Visible = conPassi;
            btnIndietro.Enabled = conPassi && p.Passo > 0;
            btnAvanti.Text = (seguente >= 0) ? "Vai a " + pagine[seguente].Nome + "  >" : "Avanti  >";
            btnAvanti.Enabled = conPassi && (!ultimo || seguente >= 0);
            DisponiPiede();
            Stato1("");
        }

        /// <summary>Il primo strumento dopo questo che ha dei passi, oppure -1.</summary>
        int PaginaSeguente()
        {
            for (int i = pagina + 1; i < pagine.Count; i++)
                if (pagine[i].Passi.Length > 0) return i;
            return -1;
        }

        void Avanti()
        {
            Pagina p = PaginaCorrente;
            if (p.Passi.Length > 0 && p.Passo >= p.Passi.Length - 1)
            {
                int s = PaginaSeguente();
                if (s >= 0) VaiA(s, 0);
                return;
            }
            VaiA(pagina, p.Passo + 1);
        }

        /// <summary>I bottoni in basso a destra: "Avanti" si allarga quando dice dove porta.</summary>
        void DisponiPiede()
        {
            int largo = TextRenderer.MeasureText(btnAvanti.Text, btnAvanti.Font).Width + 40;
            btnAvanti.Width = Math.Max(130, largo);
            btnAvanti.Location = new Point(piede.Width - 26 - btnAvanti.Width, 12);
            btnIndietro.Location = new Point(btnAvanti.Left - 18 - btnIndietro.Width, 14);
        }

        /// <summary>
        /// Va a una pagina e a un suo passo, scelti per quello che sono e non per
        /// la posizione nel menu: riordinare gli strumenti non deve rompere i
        /// bottoni che portano dall'uno all'altro. Per esempio
        /// Guscio.VaiAPagina(this, 1) dal primo passo di una pagina.
        /// </summary>
        public void VaiAPagina(Pagina p, int passo)
        {
            int i = pagine.IndexOf(p);
            if (i < 0) throw new ArgumentException("La pagina non e' nel menu.");
            VaiA(i, passo);
        }

        /// <summary>La pagina di quel tipo, per esempio typeof(PaginaPosta).</summary>
        public void VaiAPagina(Type tipo, int passo)
        {
            foreach (Pagina p in pagine)
                if (p.GetType() == tipo) { VaiAPagina(p, passo); return; }
            throw new ArgumentException("Non c'e' la pagina " + (tipo != null ? tipo.Name : "(nessuna)") + ".");
        }

        /// <summary>
        /// Lo strumento con quel nome esatto (maiuscole e spazi a parte), al primo
        /// passo. Prima bastava un pezzo del nome, e "Impostazioni" contiene
        /// "posta": un nome sbagliato adesso si vede subito, invece di portare
        /// altrove in silenzio.
        /// </summary>
        public void VaiAStrumento(string nome)
        {
            string cercato = (nome ?? "").Trim();
            foreach (Pagina p in pagine)
                if (string.Equals(p.Nome, cercato, StringComparison.OrdinalIgnoreCase))
                { VaiAPagina(p, 0); return; }
            throw new ArgumentException("Non c'e' uno strumento che si chiama \"" + nome + "\".");
        }

        public void Stato1(string testo) { Stato1(testo, Tema.Verde); }

        public void Stato1(string testo, Color colore)
        {
            lblStato.Text = testo;
            lblStato.ForeColor = colore;
        }

        void CambiaTema()
        {
            Tema.Imposta(!Tema.Scuro);
            S.TemaScuro = Tema.Scuro;
            Tema.Applica(this);
            AggiornaMenu();
            AggiornaBottoneTema();
            Refresh();
        }

        public void AggiornaBottoneTema()
        {
            btnTema.Text = Tema.Scuro ? "Tema chiaro" : "Tema scuro";
        }

        // ===================================================================
        //  SERVIZI CONDIVISI
        // ===================================================================
        public void Copia(string testo, string messaggio)
        {
            for (int tentativo = 0; tentativo < 3; tentativo++)
            {
                try { Clipboard.SetText(testo); Stato1(messaggio); return; }
                catch { System.Threading.Thread.Sleep(120); }
            }
            MessageBox.Show(this,
                "Windows non mi ha lasciato usare gli appunti: di solito e' un altro " +
                "programma che li tiene occupati per un istante.\n\nRiprova.",
                "Appunti occupati", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        public static void Apri(string cosa)
        {
            try { Process.Start(cosa); }
            catch (Exception ex)
            {
                MessageBox.Show("Non riesco ad aprire:\n" + cosa + "\n\n" + ex.Message,
                    "Errore", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        public static string LeggiRisorsa(string nome)
        {
            try
            {
                Assembly a = Assembly.GetExecutingAssembly();
                using (Stream s = a.GetManifestResourceStream(nome))
                {
                    if (s == null) return "";
                    using (StreamReader r = new StreamReader(s, Encoding.UTF8)) return r.ReadToEnd();
                }
            }
            catch { return ""; }
        }

        // -------------------------------------------------------------------
        //  I DOCUMENTI PER LA DIRIGENZA E IL DPO
        //  Stanno dentro l'eseguibile: cosi' ci sono anche quando Campanella
        //  e' copiata a mano senza installer. Vengono scritti nella cartella
        //  "documenti" accanto al programma e aperti con l'editor di testo.
        // -------------------------------------------------------------------
        public const string DocNotaTecnica = "Nota tecnica per dirigente e DPO.txt";
        public const string DocEmail       = "Email per dirigente e DPO.txt";
        public const string DocGdpr        = "GDPR - cosa vale per un docente.txt";
        public const string DocPrivacy     = "PRIVACY.txt";

        public static string CartellaDocumenti()
        {
            string cartella = "";
            try
            {
                cartella = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "documenti");
                Directory.CreateDirectory(cartella);
                string prova;
                if (!Stato.Scrivibile(cartella, out prova)) throw new Exception(prova);
            }
            catch
            {
                cartella = Path.Combine(Path.GetTempPath(), "Campanella", "documenti");
                Directory.CreateDirectory(cartella);
            }
            return cartella;
        }

        /// <summary>Scrive il documento incorporato nella cartella "documenti" e lo apre.</summary>
        public static void ApriDocumento(string nome)
        {
            string testo = LeggiRisorsa(nome);
            if (testo == "")
            {
                MessageBox.Show("Il documento \"" + nome + "\" non e' dentro questa copia di " +
                    "Campanella: ricompila l'applicazione.", "Documento mancante",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try
            {
                string percorso = Path.Combine(CartellaDocumenti(), nome);
                File.WriteAllText(percorso, testo.Replace("\r\n", "\n").Replace("\n", "\r\n"),
                                  new UTF8Encoding(true));
                Apri(percorso);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Non riesco a scrivere il documento:\n\n" + ex.Message,
                    "Errore", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    // =======================================================================
    //  PAGINA INIZIALE
    // =======================================================================
    class PaginaHome : Pagina
    {
        Label lblRiepilogo;
        Panel[] schede = new Panel[4];
        Label[] statoStrumento = new Label[4];

        public PaginaHome(Guscio g) : base(g) { Costruisci(); }

        public override string Nome { get { return "Inizio"; } }

        void Costruisci()
        {
            int y = 8;
            Controls.Add(Tema.Testo1("Da dove vuoi cominciare?", 0, y, 0, Tema.Sezione, Ruolo.Sezione));
            y += 40;

            string[,] voci =
            {
                { "Posta", "Riordina la casella di Gmail in etichette: dirigenza, segreteria, " +
                           "circolari, colleghi, studenti. Una volta sola, poi va avanti da sola.",
                           "Apri Posta" },
                { "Cartelle", "Crea nel Drive la struttura del nuovo anno scolastico: le classi, " +
                              "le materie, i recuperi, e ci copia dentro i modelli. Per i moduli " +
                              "Google scrive lo script che da' a ognuno il suo foglio delle risposte.",
                              "Apri Cartelle" },
                { "Orari", "Legge il tabellone degli orari da un file Excel, ti manda l'orario di " +
                           "ogni docente (tutto nella tua casella, per ritrovarlo in Gmail) e mette " +
                           "il tuo su Google Calendar.",
                           "Apri Orari" },
                { "Privacy", "Le regole su dati della scuola e intelligenza artificiale, gli " +
                             "strumenti per togliere i dati personali, e i documenti per " +
                             "dirigenza e DPO.",
                             "Apri Privacy" }
            };

            // ogni scheda porta alla sua pagina, cercata per tipo e non per nome
            Type[] pagineDelleSchede = { typeof(PaginaPosta), typeof(PaginaCartelle),
                                         typeof(PaginaOrari), typeof(PaginaPrivacy) };

            // due colonne per due righe: sta comodo anche in una finestra piccola
            int larghezza = 440, altezza = 196, colonne = 2;
            for (int i = 0; i < 4; i++)
            {
                int x = (i % colonne) * (larghezza + 16);
                int riga = i / colonne;

                Panel c = new Panel();
                c.Tag = Ruolo.Scheda;
                c.Location = new Point(x, y + riga * (altezza + 16));
                c.Size = new Size(larghezza, altezza);
                Tema.Contorna(c);

                Label t = Tema.Testo1(voci[i, 0], 18, 14, larghezza - 36, Tema.Sottosezione, Ruolo.Accento);
                c.Controls.Add(t);
                Label d = Tema.Testo1(voci[i, 1], 18, 42, larghezza - 36, Tema.Normale, Ruolo.Normale);
                c.Controls.Add(d);

                statoStrumento[i] = Tema.Testo1("", 18, 108, larghezza - 36, Tema.Piccolo, Ruolo.Tenue);
                statoStrumento[i].Height = 34;
                c.Controls.Add(statoStrumento[i]);

                Type bersaglio = pagineDelleSchede[i];
                Button b = Tema.BottonePrincipale(voci[i, 2], 18, altezza - 50, 170,
                    delegate { Guscio.VaiAPagina(bersaglio, 0); });
                c.Controls.Add(b);

                Controls.Add(c);
                schede[i] = c;
            }

            y += 2 * (altezza + 16) + 8;
            lblRiepilogo = Tema.Testo1("", 0, y, 896, Tema.Normale, Ruolo.Tenue);
            lblRiepilogo.Height = 66;
            Controls.Add(lblRiepilogo);

            y += 74;
            Controls.Add(Tema.Testo1(
                "Niente di quello che fai qui tocca la posta, il calendario o il Drive da solo: " +
                "l'applicazione prepara testo e cartelle, e ti dice sempre prima cosa sta per succedere.",
                0, y, 896, Tema.Piccolo, Ruolo.Tenue));
        }

        public override void Entra()
        {
            Guscio.AggiornaBottoneTema();

            StatoPosta sp = StatoPosta.Verifica(S);
            statoStrumento[0].Text = sp.Fatto
                ? "Gia' fatto - " + sp.Dettaglio
                : "Da fare - " + sp.Dettaglio;
            statoStrumento[0].Tag = sp.Fatto ? Ruolo.Buono : Ruolo.Tenue;

            bool driveOk = Directory.Exists(S.Drive);
            if (!driveOk)
            {
                statoStrumento[1].Text = "Attenzione: non trovo " + S.Drive;
                statoStrumento[1].Tag = Ruolo.Avviso;
            }
            else
            {
                // dal primo settembre l'anno e' quello nuovo: qui si vede subito cosa resta da fare
                string anno = (S.Anno != "") ? S.Anno : Stato.AnnoScolastico(DateTime.Now);
                bool cartelle = Directory.Exists(Path.Combine(S.Drive.TrimEnd('\\'), "A.S. " + anno));
                string riga = "A.S. " + anno + ": " + (cartelle ? "le cartelle ci sono" : "cartelle da creare");
                bool daFare = !cartelle;
                // due account Google sul computer = due "Il mio Drive": se stiamo
                // guardando quello sbagliato, tutto il resto direbbe "da fare"
                DriveTrovato questo = Stato.EsaminaDrive(S.Drive, "");
                if (!questo.ConModelli && !questo.ConAnni)
                {
                    foreach (DriveTrovato d in Stato.DriviPossibili())
                    {
                        if (string.Equals(d.Percorso, S.Drive, StringComparison.OrdinalIgnoreCase)) continue;
                        if (!d.ConModelli && !d.ConAnni) continue;
                        statoStrumento[1].Text = "Sto guardando " + S.Drive + ", dove non c'e' MODELLI.\r\n" +
                            "Il Drive della scuola sembra " + d.Percorso + ": apri Cartelle e cambialo.";
                        statoStrumento[1].Tag = Ruolo.Avviso;
                        Tema.Applica(this);
                        return;
                    }
                }
                if (S.ModuloFoglio.Trim() != "")
                {
                    ParametriModulo pm = new ParametriModulo();
                    pm.CartellaFoglio = S.ModuloCartella;
                    pm.NomeFoglio = S.ModuloFoglio;
                    pm.UsaDrive = S.ModuloDrive;
                    bool foglio = ScriptModuli.FoglioSulPc(S.Drive, anno, pm);
                    riga += foglio ? "   ·   foglio del modulo: c'e'"
                                   : "   ·   foglio del modulo: da preparare (passo 2)";
                    if (!foglio) daFare = true;
                }
                statoStrumento[1].Text = riga;
                statoStrumento[1].Tag = daFare ? Ruolo.Avviso : Ruolo.Buono;
            }

            statoStrumento[2].Text = (S.Lezioni.Count > 0)
                ? S.Lezioni.Count + " ore caricate, " + ContaDocenti() + " docenti" +
                  (S.CalDocente != "" ? "   ·   calendario di " + S.CalDocente : "")
                : "Nessun orario caricato";

            statoStrumento[3].Text = S.PrivacyLetta
                ? "Regole lette. Serve rizzo-pii avviato per anonimizzare."
                : "Da leggere prima di dare documenti della scuola a un'IA";
            statoStrumento[3].Tag = S.PrivacyLetta ? Ruolo.Tenue : Ruolo.Avviso;

            int conMail = 0;
            foreach (Persona p in S.Personale) if (p.Incluso && p.Email != "") conMail++;
            lblRiepilogo.Text =
                "Elenco del personale: " + S.Personale.Count + " persone, " + conMail +
                " con indirizzo.   ·   Dominio: " +
                (S.DominioPulito() == "" ? "non impostato" : S.DominioPulito()) + "\n" +
                "Impostazioni in " + Stato.Percorso() + "\n" +
                "Dati di altre persone (personale, indirizzi, orari): " +
                (S.DatiNelDrive ? "nel Drive, in " + S.PercorsoDati()
                                : "accanto al programma, nello stesso file. Si possono spostare nel Drive dalle Impostazioni.");

            Tema.Applica(this);
        }

        int ContaDocenti()
        {
            List<string> d = new List<string>();
            foreach (Lezione l in S.Lezioni) if (!d.Contains(l.Docente)) d.Add(l.Docente);
            return d.Count;
        }
    }

    // =======================================================================
    //  IMPOSTAZIONI
    // =======================================================================
    class PaginaImpostazioni : Pagina
    {
        RadioButton rbScuro, rbChiaro, rbDatiLocali, rbDatiDrive;
        TextBox txtCodice, txtCartellaDati, txtAnon;
        Label lblEsito, lblComponenti, lblAggiornamenti, lblConsenso, lblScrittura, lblDati;
        Button btnCerca, btnInstalla, btnSfogliaDati, btnApplicaDati;
        ProgressBar barra;
        Rilascio ultimoRilascio;
        System.Threading.Thread lavoro;
        volatile bool interrompi = false;
        bool zitto = false;

        public PaginaImpostazioni(Guscio g) : base(g) { Costruisci(); }

        public override string Nome { get { return "Impostazioni"; } }

        void Costruisci()
        {
            int y = 8;
            Controls.Add(Tema.Testo1("Impostazioni", 0, y, 0, Tema.Sezione, Ruolo.Sezione));
            y += 46;

            // ---- aspetto ----------------------------------------------------
            Controls.Add(Tema.Testo1("Aspetto", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            y += 26;
            rbScuro = new RadioButton();
            rbScuro.Text = "Tema scuro  (quello di partenza)";
            rbScuro.Location = new Point(0, y);
            rbScuro.AutoSize = true;
            rbScuro.CheckedChanged += delegate { if (rbScuro.Checked) ApplicaTema(true); };
            Controls.Add(rbScuro);
            y += 26;
            rbChiaro = new RadioButton();
            rbChiaro.Text = "Tema chiaro";
            rbChiaro.Location = new Point(0, y);
            rbChiaro.AutoSize = true;
            rbChiaro.CheckedChanged += delegate { if (rbChiaro.Checked) ApplicaTema(false); };
            Controls.Add(rbChiaro);
            y += 44;

            // ---- dove stanno i dati di altre persone ------------------------
            Tema.TitoloAiuto(this, "Dove tenere i dati di altre persone", 0, y,
                "Dove tenere i dati di altre persone",
                "L'elenco del personale, gli indirizzi di dirigenza e segreteria e gli orari " +
                "con i cognomi sono dati personali di colleghi.\r\n\r\n" +
                "Tenendoli in un file dentro il Drive della scuola restano nell'account " +
                "istituzionale, si ritrovano su tutti i computer che sincronizzano quel Drive, " +
                "e nel file accanto al programma non ne resta traccia.");
            y += 30;
            rbDatiLocali = new RadioButton();
            rbDatiLocali.Text = "Accanto al programma, in campanella.json";
            rbDatiLocali.Location = new Point(0, y);
            rbDatiLocali.AutoSize = true;
            rbDatiLocali.CheckedChanged += delegate { if (!zitto) AbilitaDati(); };
            Controls.Add(rbDatiLocali);
            y += 26;
            rbDatiDrive = new RadioButton();
            rbDatiDrive.Text = "In un file dentro il Drive  (campanella-dati.json nella cartella qui sotto)";
            rbDatiDrive.Location = new Point(0, y);
            rbDatiDrive.AutoSize = true;
            rbDatiDrive.CheckedChanged += delegate { if (!zitto) AbilitaDati(); };
            Controls.Add(rbDatiDrive);
            y += 30;
            txtCartellaDati = Tema.Casella(0, y, 560, "per esempio  H:\\Il mio Drive\\Campanella");
            Controls.Add(txtCartellaDati);
            btnSfogliaDati = Tema.Bottone("Sfoglia...", 572, y - 1, 110, delegate
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    d.Description = "Scegli la cartella del Drive dove tenere campanella-dati.json";
                    if (Directory.Exists(txtCartellaDati.Text)) d.SelectedPath = txtCartellaDati.Text;
                    else if (Directory.Exists(S.Drive)) d.SelectedPath = S.Drive;
                    if (d.ShowDialog(this) == DialogResult.OK) txtCartellaDati.Text = d.SelectedPath;
                }
            });
            Controls.Add(btnSfogliaDati);
            btnApplicaDati = Tema.BottonePrincipale("Applica", 694, y - 3, 120, delegate { ApplicaDati(); });
            Controls.Add(btnApplicaDati);
            y += 40;
            lblDati = Tema.Testo1("", 0, y, 860, Tema.Piccolo, Ruolo.Tenue);
            lblDati.Height = 40;
            Controls.Add(lblDati);
            y += 52;

            // ---- stato del riordino -----------------------------------------
            Tema.TitoloAiuto(this, "Il riordino della posta risulta gia' fatto?", 0, y,
                "La conferma dal tuo account",
                "Di norma l'applicazione lo capisce da sola dalle spunte dell'installazione.\r\n\r\n" +
                "Se vuoi la conferma dal tuo account, nell'editor dello script esegui la " +
                "funzione EXTRA_codiceStato e incolla qui sotto la riga che stampa: e' un " +
                "codice come CMP1-20260910-9-1-2431 e non contiene nessun dato personale.");
            y += 34;

            txtCodice = Tema.Casella(0, y, 320, "CMP1-...");
            Controls.Add(txtCodice);
            Controls.Add(Tema.Bottone("Verifica", 332, y - 1, 120, delegate { Verifica(); }));
            Controls.Add(Tema.Bottone("Cancella", 462, y - 1, 120, delegate
            {
                txtCodice.Text = "";
                S.CodiceStatoPosta = "";
                lblEsito.Text = "Codice cancellato.";
                lblEsito.Tag = Ruolo.Tenue;
                Tema.Applica(lblEsito);
            }));
            y += 40;
            lblEsito = Tema.Testo1("", 0, y, 860, Tema.Normale, Ruolo.Tenue);
            lblEsito.Height = 40;     // nasce vuota: senza questo l'esito (fino a due righe) resta tagliato
            Controls.Add(lblEsito);
            y += 44;

            // ---- componenti ---------------------------------------------------
            Tema.TitoloAiuto(this, "rizzo-pii e aggiornamenti", 0, y,
                "rizzo-pii e aggiornamenti",
                "rizzo-pii e' il programma che riconosce i dati personali per lo strumento " +
                "Privacy: gira sul tuo computer, all'indirizzo qui sotto.\r\n\r\n" +
                "L'applicazione non si collega a internet da sola: il controllo degli " +
                "aggiornamenti parte solo quando premi il pulsante.");
            y += 30;

            Controls.Add(Tema.Testo1("Indirizzo del servizio", 0, y + 5, 0, Tema.Normale, Ruolo.Tenue));
            txtAnon = Tema.Casella(150, y, 260, "http://127.0.0.1:5005");
            txtAnon.TextChanged += delegate { S.AnonIndirizzo = txtAnon.Text.Trim(); };
            Controls.Add(txtAnon);
            Controls.Add(Tema.Testo1("Cambialo solo se hai messo rizzo-pii su un'altra porta.",
                                     422, y + 5, 420, Tema.Piccolo, Ruolo.Tenue));
            y += 40;

            lblComponenti = Tema.Testo1("", 0, y, 860, Tema.Normale, Ruolo.Normale);
            lblComponenti.Height = 56;
            Controls.Add(lblComponenti);
            y += 62;

            Controls.Add(Tema.Bottone("Controlla rizzo-pii", 0, y, 180,
                delegate { ControllaComponenti(); }));
            btnCerca = Tema.Bottone("Cerca aggiornamenti", 192, y, 200,
                delegate { CercaAggiornamenti(); });
            Controls.Add(btnCerca);
            btnInstalla = Tema.BottonePrincipale("Scarica e installa rizzo-pii", 404, y - 2, 250,
                delegate { InstallaRizzo(); });
            btnInstalla.Visible = false;
            Controls.Add(btnInstalla);
            Controls.Add(Tema.Bottone("Apri la pagina", 666, y, 140,
                delegate { Guscio.Apri(Aggiornamenti.PaginaRizzo); }));
            y += 40;

            barra = new ProgressBar();
            barra.Location = new Point(0, y);
            barra.Size = new Size(660, 16);
            barra.Visible = false;
            Controls.Add(barra);
            lblAggiornamenti = Tema.Testo1("", 0, y + 22, 860, Tema.Piccolo, Ruolo.Tenue);
            lblAggiornamenti.Height = 40;
            Controls.Add(lblAggiornamenti);
            y += 74;

            // ---- documenti ----------------------------------------------------
            Controls.Add(Tema.Testo1("Documenti per la dirigenza e il DPO", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            y += 26;
            Controls.Add(Tema.Testo1(
                "Una nota tecnica che descrive cosa fa l'applicazione, un modello di email da " +
                "mandare al dirigente e al responsabile della protezione dei dati, e una " +
                "spiegazione di cosa vale per un docente. Vengono salvati nella cartella " +
                "\"documenti\" accanto al programma.",
                0, y, 860, Tema.Piccolo, Ruolo.Tenue));
            y += 44;
            Controls.Add(Tema.Bottone("Nota tecnica", 0, y, 160, delegate { Guscio.ApriDocumento(Guscio.DocNotaTecnica); }));
            Controls.Add(Tema.Bottone("Modello di email", 172, y, 160, delegate { Guscio.ApriDocumento(Guscio.DocEmail); }));
            Controls.Add(Tema.Bottone("Cosa dice il GDPR", 344, y, 170, delegate { Guscio.ApriDocumento(Guscio.DocGdpr); }));
            Controls.Add(Tema.Bottone("Note sulla privacy", 526, y, 170, delegate { Guscio.ApriDocumento(Guscio.DocPrivacy); }));
            y += 48;

            // ---- condizioni ---------------------------------------------------
            Controls.Add(Tema.Testo1("Condizioni d'uso", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            y += 26;
            lblConsenso = Tema.Testo1("", 0, y, 560, Tema.Piccolo, Ruolo.Tenue);
            lblConsenso.Height = 20;
            Controls.Add(lblConsenso);
            Controls.Add(Tema.Bottone("Rileggile", 580, y - 6, 130, delegate
            {
                using (FormConsenso f = new FormConsenso()) f.ShowDialog(this);
            }));
            y += 48;

            // ---- file e cartelle ----------------------------------------------
            Controls.Add(Tema.Testo1("File e cartelle", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            y += 28;
            Controls.Add(Tema.Bottone("Apri la cartella dell'applicazione", 0, y, 260,
                delegate { Guscio.Apri(Path.GetDirectoryName(Application.ExecutablePath)); }));
            Controls.Add(Tema.Bottone("Apri il file delle impostazioni", 270, y, 240,
                delegate
                {
                    S.Salva();
                    Guscio.Apri(Stato.Percorso());
                }));
            y += 44;
            Controls.Add(Tema.Testo1(
                "Le impostazioni stanno in " + Stato.Percorso() + ". " +
                "Se lo cancelli, l'applicazione riparte dai valori di partenza.",
                0, y, 860, Tema.Piccolo, Ruolo.Tenue));
            y += 40;

            lblScrittura = Tema.Testo1("", 0, y, 860, Tema.Piccolo, Ruolo.Tenue);
            lblScrittura.Height = 48;   // l'avviso "non si puo' scrivere" e' di tre righe
            Controls.Add(lblScrittura);
        }

        // -------------------------------------------------------------------
        //  DATI NEL DRIVE
        // -------------------------------------------------------------------
        void MostraDati()
        {
            zitto = true;
            rbDatiLocali.Checked = !S.DatiNelDrive;
            rbDatiDrive.Checked = S.DatiNelDrive;
            zitto = false;
            txtCartellaDati.Text = (S.CartellaDati != "") ? S.CartellaDati : S.CartellaDatiDiDefault();
            AbilitaDati();

            if (S.DatiNelDrive)
            {
                bool ce = File.Exists(S.PercorsoDati());
                lblDati.Text = ce
                    ? "I dati stanno in " + S.PercorsoDati() + " e vengono ricaricati a ogni avvio."
                    : "I dati dovrebbero stare in " + S.PercorsoDati() + " ma il file non c'e' " +
                      "(Drive non sincronizzato o cartella cambiata).";
                lblDati.Tag = ce ? Ruolo.Buono : Ruolo.Avviso;
            }
            else
            {
                lblDati.Text = "Adesso i dati stanno nel file delle impostazioni, accanto al programma.";
                lblDati.Tag = Ruolo.Tenue;
            }
            Tema.Applica(lblDati);
        }

        void AbilitaDati()
        {
            bool drive = rbDatiDrive.Checked;
            txtCartellaDati.Enabled = drive;
            btnSfogliaDati.Enabled = drive;
        }

        void ApplicaDati()
        {
            bool nelDrive = rbDatiDrive.Checked;
            string cartella = txtCartellaDati.Text.Trim();

            if (nelDrive)
            {
                if (cartella == "") cartella = S.CartellaDatiDiDefault();
                string radice = "";
                try { radice = Path.GetDirectoryName(cartella.TrimEnd('\\')); } catch { }
                if (string.IsNullOrEmpty(radice) || !Directory.Exists(radice))
                {
                    MessageBox.Show(this,
                        "Non trovo la cartella del Drive che contiene\n\n" + cartella + "\n\n" +
                        "Controlla che Google Drive per desktop sia avviato e che il percorso sia giusto.",
                        "Cartella non trovata", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                string perche;
                try { Directory.CreateDirectory(cartella); } catch { }
                if (!Stato.Scrivibile(cartella, out perche))
                {
                    MessageBox.Show(this, "In quella cartella non riesco a scrivere: " + perche,
                        "Cartella non scrivibile", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (!S.DatiNelDrive && MessageBox.Show(this,
                        "Sposto l'elenco del personale, gli indirizzi e gli orari in\n\n" +
                        Path.Combine(cartella, Stato.NomeFileDati) + "\n\n" +
                        "e li tolgo dal file accanto al programma. Il Drive li sincronizzera' " +
                        "nell'account della scuola.\n\nProcedo?",
                        "Spostare i dati nel Drive?", MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question) != DialogResult.Yes) return;
            }
            else if (S.DatiNelDrive)
            {
                if (MessageBox.Show(this,
                        "Riporto i dati nel file accanto al programma e tolgo il file dal Drive.\n\n" +
                        "Procedo?", "Riportare i dati qui?", MessageBoxButtons.YesNo,
                        MessageBoxIcon.Question) != DialogResult.Yes) return;
            }

            Guscio.SalvaTutto();      // raccoglie quello che sta nelle altre pagine
            string errore;
            if (S.SpostaDati(nelDrive, cartella, out errore))
                Guscio.Stato1(nelDrive ? "Dati spostati nel Drive." : "Dati riportati accanto al programma.");
            else
                MessageBox.Show(this, "Qualcosa non e' andato: " + errore, "Attenzione",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            MostraDati();
        }

        /// <summary>Dice se le impostazioni si riescono davvero a salvare li' dove sta l'exe.</summary>
        void ControllaScrittura()
        {
            string perche;
            if (Stato.CartellaScrivibile(out perche))
            {
                lblScrittura.Text = "Le impostazioni si salvano regolarmente in questa cartella." +
                    (S.UltimoErrore != "" ? "  Ultimo problema: " + S.UltimoErrore : "");
                lblScrittura.Tag = (S.UltimoErrore != "") ? Ruolo.Avviso : Ruolo.Buono;
            }
            else
            {
                lblScrittura.Text =
                    "ATTENZIONE: in questa cartella non si puo' scrivere (" + perche + "). " +
                    "Quello che imposti andra' perso alla chiusura. Copia Campanella dove hai " +
                    "i permessi, oppure installala.";
                lblScrittura.Tag = Ruolo.Avviso;
            }
            Tema.Applica(lblScrittura);
        }

        void ApplicaTema(bool scuro)
        {
            if (Tema.Scuro == scuro) return;
            Tema.Imposta(scuro);
            S.TemaScuro = scuro;
            Tema.Applica(FindForm());
            Guscio.AggiornaBottoneTema();
            FindForm().Refresh();
        }

        void Verifica()
        {
            StatoPosta r = StatoPosta.LeggiCodice(txtCodice.Text, S.PrefissoPulito());
            if (r == null)
            {
                lblEsito.Text = "Non ho riconosciuto il codice. Deve essere una riga sola, " +
                                "nella forma CMP1-20260910-9-1-2431.";
                lblEsito.Tag = Ruolo.Avviso;
            }
            else if (r.Incerto)
            {
                // Senza gruppo il codice conta anche le etichette dell'utente: non
                // lo tengo, cosi' la pagina iniziale non dice "Gia' fatto" per
                // questo, neanche se poi il gruppo cambia.
                S.CodiceStatoPosta = "";
                lblEsito.Text = "Non basta a confermarlo: " + r.Dettaglio;
                lblEsito.Tag = Ruolo.Avviso;
            }
            else
            {
                S.CodiceStatoPosta = txtCodice.Text.Trim();
                lblEsito.Text = (r.Fatto ? "Confermato: " : "Risulta incompleto: ") + r.Dettaglio;
                lblEsito.Tag = r.Fatto ? Ruolo.Buono : Ruolo.Avviso;
            }
            Tema.Applica(lblEsito);
        }

        public override void Entra()
        {
            rbScuro.Checked = Tema.Scuro;
            rbChiaro.Checked = !Tema.Scuro;
            txtCodice.Text = S.CodiceStatoPosta;
            txtAnon.Text = S.AnonIndirizzo;
            lblConsenso.Text = (S.ConsensoVersione > 0)
                ? "Accettate il " + S.ConsensoData + "  (versione " + S.ConsensoVersione + ")"
                : "Non risultano accettate.";
            MostraDati();
            ControllaComponenti();
            ControllaScrittura();
            Tema.Applica(this);
        }

        // ===================================================================
        //  COMPONENTI E AGGIORNAMENTI
        // ===================================================================
        Anonimizzatore Servizio()
        {
            Anonimizzatore a = new Anonimizzatore();
            a.Indirizzo = (S.AnonIndirizzo != "" ? S.AnonIndirizzo : "http://127.0.0.1:5005")
                          .Trim().TrimEnd('/');
            return a;
        }

        void ControllaComponenti()
        {
            Anonimizzatore a = Servizio();
            SaluteAnonimizzatore s = a.Salute();

            string riga = "Campanella " + Aggiornamenti.VersioneCampanella + "\r\n";
            riga += s.Pronto
                ? "rizzo-pii " + (s.Versione != "" ? s.Versione : "(versione non dichiarata)") +
                  " - in ascolto su " + a.Indirizzo + ", modello " + s.Modello + " su " + s.Dispositivo
                : "rizzo-pii non risponde su " + a.Indirizzo +
                  ". Senza di lui l'anonimizzazione non funziona: installalo o avvialo.";
            lblComponenti.Text = riga;
            lblComponenti.Tag = s.Pronto ? Ruolo.Buono : Ruolo.Avviso;
            Tema.Applica(lblComponenti);
        }

        void Messaggio(string testo, string ruolo)
        {
            if (lblAggiornamenti.InvokeRequired)
            {
                lblAggiornamenti.BeginInvoke((MethodInvoker)delegate { Messaggio(testo, ruolo); });
                return;
            }
            lblAggiornamenti.Text = testo;
            lblAggiornamenti.Tag = ruolo;
            Tema.Applica(lblAggiornamenti);
        }

        void CercaAggiornamenti()
        {
            if (lavoro != null && lavoro.IsAlive) return;
            Messaggio("Chiedo a GitHub...", Ruolo.Tenue);
            btnCerca.Enabled = false;

            lavoro = new System.Threading.Thread(delegate ()
            {
                Rilascio r = Aggiornamenti.UltimoRizzoPii();
                BeginInvoke((MethodInvoker)delegate
                {
                    btnCerca.Enabled = true;
                    ultimoRilascio = r;
                    if (!r.Trovato) { Messaggio(r.Messaggio, Ruolo.Avviso); return; }

                    SaluteAnonimizzatore s = Servizio().Salute();

                    if (!s.Pronto)
                    {
                        Messaggio("rizzo-pii non risulta installato o avviato. " + r.Messaggio +
                                  "  Puoi scaricarlo da qui.", Ruolo.Avviso);
                        btnInstalla.Visible = (r.FileWindows != "");
                        btnInstalla.Text = "Scarica e installa rizzo-pii  (" + r.PesoLeggibile + ")";
                    }
                    else if (Aggiornamenti.Confronta(r.Versione, s.Versione) > 0)
                    {
                        Messaggio("C'e' una versione piu' recente di rizzo-pii: hai la " +
                                  s.Versione + ", l'ultima e' la " + r.Versione + ".", Ruolo.Avviso);
                        btnInstalla.Visible = (r.FileWindows != "");
                        btnInstalla.Text = "Aggiorna rizzo-pii  (" + r.PesoLeggibile + ")";
                    }
                    else
                    {
                        Messaggio("rizzo-pii e' aggiornato: hai la " + s.Versione +
                                  ", l'ultima pubblicata e' la " + r.Versione + ".", Ruolo.Buono);
                        btnInstalla.Visible = false;
                    }
                    Tema.Applica(btnInstalla);
                });
            });
            lavoro.IsBackground = true;
            lavoro.Start();
        }

        void InstallaRizzo()
        {
            if (ultimoRilascio == null || ultimoRilascio.FileWindows == "") return;
            if (lavoro != null && lavoro.IsAlive) return;

            string domanda =
                "Sto per scaricare da GitHub l'installer di rizzo-pii " + ultimoRilascio.Versione +
                " (" + ultimoRilascio.PesoLeggibile + ").\r\n\r\n" +
                "E' grande perche' contiene il modello che riconosce i dati personali: e' quello " +
                "che permette di lavorare senza mandare niente in rete.\r\n\r\n" +
                "Quando ha finito parte l'installazione, che gestisce rizzo-pii per conto suo.\r\n\r\n" +
                "Procedo?";
            if (MessageBox.Show(this, domanda, "Scaricare rizzo-pii?",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

            interrompi = false;
            btnInstalla.Enabled = false;
            btnCerca.Enabled = false;
            barra.Visible = true;
            barra.Value = 0;

            string url = ultimoRilascio.FileWindows;
            string nome = "Rizzo-PII-Setup.exe";
            try { nome = Path.GetFileName(new Uri(url).LocalPath); } catch { }

            lavoro = new System.Threading.Thread(delegate ()
            {
                string file = null;
                string errore = null;
                try
                {
                    file = Aggiornamenti.Scarica(url, nome, delegate (int pc, long fatti, long tot)
                    {
                        BeginInvoke((MethodInvoker)delegate
                        {
                            barra.Value = Math.Max(0, Math.Min(100, pc));
                            Messaggio("Scaricato " + Math.Round(fatti / 1024.0 / 1024.0) + " MB su " +
                                      Math.Round(tot / 1024.0 / 1024.0) + " MB  (" + pc + "%)",
                                      Ruolo.Tenue);
                        });
                        return !interrompi;
                    });
                }
                catch (Exception ex) { errore = ex.Message; }

                BeginInvoke((MethodInvoker)delegate
                {
                    barra.Visible = false;
                    btnInstalla.Enabled = true;
                    btnCerca.Enabled = true;

                    if (errore != null)
                    {
                        Messaggio("Scarico non riuscito: " + errore +
                                  "  Puoi sempre prenderlo a mano dalla pagina di rizzo-pii.",
                                  Ruolo.Avviso);
                        return;
                    }
                    if (file == null) { Messaggio("Scarico annullato.", Ruolo.Tenue); return; }

                    Messaggio("Scaricato. Avvio l'installazione: da qui in poi comanda " +
                              "l'installer di rizzo-pii.", Ruolo.Buono);
                    try { Aggiornamenti.Avvia(file); }
                    catch (Exception ex)
                    {
                        Messaggio("Non riesco ad avviarlo: " + ex.Message + "  Il file e' in " + file,
                                  Ruolo.Avviso);
                    }
                });
            });
            lavoro.IsBackground = true;
            lavoro.Start();
        }
    }
}
