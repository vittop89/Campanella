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
                bool condizioniChieste = s.ConsensoVersione < Consenso.Versione;
                if (!Consenso.Richiedi(null, s)) return;

                foreach (string[] avviso in AvvisiDiAvvio(s, condizioniChieste))
                    MessageBox.Show(avviso[1], avviso[0], MessageBoxButtons.OK, MessageBoxIcon.Warning);

                Application.Run(new Guscio(s));
            }
            catch (Exception ex)
            {
                MessageBox.Show("Errore imprevisto:\n\n" + ex.Message,
                    "Campanella", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        /// <summary>
        /// Gli avvisi dell'avvio sui file che non si sono potuti usare, come
        /// { titolo, testo }. Quei file non vengono sovrascritti, e senza un avviso
        /// lo si scopriva solo chiudendo. condizioniChieste: le condizioni d'uso
        /// sono appena state accettate, e il salvataggio di quel momento ha gia'
        /// detto cosa ha lasciato com'era (Stato.DaAvvisare).
        /// </summary>
        static List<string[]> AvvisiDiAvvio(Stato s, bool condizioniChieste)
        {
            List<string[]> avvisi = new List<string[]>();
            if (!condizioniChieste && s.ErroreImpostazioni != "")
            {
                avvisi.Add(new string[] { "Le impostazioni non si possono salvare",
                    "Il file delle impostazioni\n\n" + Stato.Percorso() + "\n\n" + s.ErroreImpostazioni + ".\n\n" +
                    "Per non perdere quello che contiene non lo sovrascrivo: quello che cambi " +
                    "adesso non verra' salvato.\n\n" +
                    "Se quel file non ti serve piu', cancellalo e riapri Campanella: ripartira' " +
                    "dai valori di partenza." });
            }
            if (s.DatiNelDrive && s.DatiNonTrovati)
            {
                avvisi.Add(new string[] { "Non trovo il file dei dati",
                    "I dati personali (elenco del personale, indirizzi, orari) dovrebbero " +
                    "stare in\n\n" + s.PercorsoDati() + "\n\n" +
                    "ma il file non c'e': il Drive non ha ancora sincronizzato, oppure la " +
                    "cartella e' cambiata. Per ora risultano vuoti.\n\n" +
                    "Se il Drive sta ancora scaricando, chiudi e riapri Campanella fra " +
                    "qualche minuto. Se invece hai spostato la cartella, sistemala in " +
                    "Impostazioni." });
            }
            else if (!condizioniChieste && s.DatiNelDrive && s.ErroreDati != "")
            {
                avvisi.Add(new string[] { "Il file dei dati non si puo' usare",
                    "Il file dei dati personali\n\n" + s.PercorsoDati() + "\n\n" + s.ErroreDati + ".\n\n" +
                    "Per non perdere quello che contiene non lo sovrascrivo: le modifiche " +
                    "all'elenco del personale, agli indirizzi e agli orari non verranno salvate.\n\n" +
                    "Se il Drive sta ancora scaricando, chiudi e riapri Campanella fra qualche " +
                    "minuto. Se il file si e' rovinato, puoi recuperarne una versione precedente " +
                    "dalla cronologia del Drive; oppure, in Impostazioni, premi Applica accanto " +
                    "alla cartella dei dati per scegliere se usarlo o sostituirlo." });
            }
            return avvisi;
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

        /// <summary>Il pannello di un passo, con il suo titolo in alto.</summary>
        protected Panel NuovaPagina(string titolo)
        {
            Panel p = new Panel();
            p.AutoScroll = true;
            p.Controls.Add(Tema.Testo1(titolo, 0, 6, 0, Tema.Sezione, Ruolo.Sezione));
            return p;
        }

        // Molte pagine si riempiono dallo Stato solo in Entra: finche' non sono
        // state aperte i loro controlli sono vuoti, ed Esce() li scriverebbe
        // nello Stato al posto dei dati veri. Chiudendo Campanella senza passare
        // da Orari si salvava un orario vuoto, e da Cartelle le classi vuote.
        bool aperta = false;

        /// <summary>Vero dalla prima volta che la pagina e' stata aperta (e riempita dallo Stato).</summary>
        public bool Aperta { get { return aperta; } }

        /// <summary>Il guscio apre la pagina: Entra() la riempie, e da qui in poi Esce() conta.</summary>
        public void Apri()
        {
            Entra();
            aperta = true;
        }

        /// <summary>Rimette nello Stato quello che c'e' nella pagina, ma solo se e' stata aperta.</summary>
        public void RaccogliSeAperta()
        {
            if (aperta) Esce();
        }
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

            FinestraDiChiusura = MostraFinestraDiChiusura;
            FormClosing += delegate(object o, FormClosingEventArgs e)
            {
                // niente finestre allo spegnimento del computer, che una
                // finestra fermerebbe
                bool siPuoChiedere = e.CloseReason != CloseReason.WindowsShutDown &&
                                     e.CloseReason != CloseReason.TaskManagerClosing;
                // un lavoro a meta' (cartelle, pulizia dei file, scarico) prima si
                // interrompeva in silenzio: adesso si chiede, e "No" lascia la
                // finestra aperta senza salvare niente
                List<string> lavori = LavoriInCorso();
                if (lavori.Count > 0 && siPuoChiedere && !FinestraDiChiusura(
                        "Sta ancora andando avanti " + string.Join(" e ", lavori.ToArray()) + ".\n\n" +
                        "Se chiudi adesso si ferma a meta', e quello che manca andra' rifatto. " +
                        "I file originali non vengono toccati.\n\nChiudo lo stesso?",
                        "Chiudere Campanella?", true))
                {
                    e.Cancel = true;
                    return;
                }
                SalvaTutto();
                // il file dei dati nel Drive l'ha cambiato un altro computer, e qui ci
                // sono modifiche: chiudendo vanno perse. "No" lascia la finestra aperta
                // (e i lavori in corso) sulle Impostazioni, dove Applica puo' ancora
                // sostituire quel file
                if (S.ModificheInConflitto && siPuoChiedere && !FinestraDiChiusura(S.DaAvvisare + "\n\n" +
                        "Chiudo lo stesso? Le modifiche di adesso andranno perse.\n\n" +
                        "No = Campanella resta aperta, sulle Impostazioni.",
                        "Chiudere Campanella?", true))
                {
                    e.Cancel = true;
                    foreach (Pagina p in pagine)
                    {
                        PaginaImpostazioni impostazioni = p as PaginaImpostazioni;
                        if (impostazioni == null) continue;
                        VaiAPagina(impostazioni, 0);
                        impostazioni.MostraSezioneDati();
                    }
                    Stato1("Per tenere le modifiche di adesso, premi Applica accanto alla cartella dei dati.",
                           Tema.Ambra);
                    return;
                }
                FermaLavori();
                // un file lasciato com'era per non rovinarlo, o un Drive che non
                // c'era: va detto adesso, dopo sarebbe troppo tardi. Dopo la domanda
                // qui sopra no: diceva gia' tutto
                if (S.DaAvvisare != "" && siPuoChiedere && !S.ModificheInConflitto)
                    FinestraDiChiusura(S.DaAvvisare, "Non tutto e' stato salvato", false);
            };
        }

        /// <summary>
        /// Le finestre della chiusura: (testo, titolo, domanda) e torna vero per
        /// chiudere. Una domanda Si'/No parte da No; altrimenti e' un avviso con OK.
        /// Le prove la sostituiscono con una funzione che risponde senza aprire niente.
        /// </summary>
        internal Func<string, string, bool, bool> FinestraDiChiusura;

        bool MostraFinestraDiChiusura(string testo, string titolo, bool domanda)
        {
            if (!domanda)
            {
                MessageBox.Show(this, testo, titolo, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return true;
            }
            return MessageBox.Show(this, testo, titolo, MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2) == DialogResult.Yes;
        }

        /// <summary>
        /// I lavori che chiudendo adesso si fermerebbero a meta', detti come in
        /// una frase. Vuoto se non ce n'e' nessuno.
        /// </summary>
        public List<string> LavoriInCorso()
        {
            List<string> lavori = new List<string>();
            foreach (Pagina p in pagine)
            {
                PaginaCartelle cartelle = p as PaginaCartelle;
                if (cartelle != null && cartelle.InCorso()) lavori.Add("la creazione delle cartelle dell'anno");
                PaginaPrivacy privacy = p as PaginaPrivacy;
                if (privacy != null && privacy.LavoroInCorso) lavori.Add("la pulizia dei file (Privacy)");
                PaginaImpostazioni impostazioni = p as PaginaImpostazioni;
                if (impostazioni != null && impostazioni.LavoroInCorso) lavori.Add("lo scarico di rizzo-pii");
            }
            return lavori;
        }

        /// <summary>
        /// Prima di chiudere: la pulizia dei file non ne comincia altri, e lo
        /// scarico di rizzo-pii ha tre secondi al massimo per togliere il file a
        /// meta'. Le cartelle finiscono il file che stanno copiando: lo chiede
        /// la pagina stessa quando la finestra sparisce.
        /// </summary>
        void FermaLavori()
        {
            foreach (Pagina p in pagine)
            {
                PaginaPrivacy privacy = p as PaginaPrivacy;
                if (privacy != null) privacy.Ferma();
                PaginaImpostazioni impostazioni = p as PaginaImpostazioni;
                if (impostazioni != null) impostazioni.FermaScarico(3000);
            }
        }

        public void SalvaTutto()
        {
            // una pagina mai aperta non ha niente di nuovo: i suoi controlli vuoti
            // non devono prendere il posto di quello che c'e' nello Stato
            foreach (Pagina p in pagine) p.RaccogliSeAperta();
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
            if (cambiaStrumento) pagine[pagina].RaccogliSeAperta();

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
            p.Apri();

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
            // anche il ruolo, non solo il colore: cambiando tema l'avviso ambra
            // tornava verde, il colore del ruolo con cui la riga e' nata
            lblStato.Tag = Tema.RuoloDi(colore);
            lblStato.ForeColor = colore;
        }

        void CambiaTema() { ImpostaTema(!Tema.Scuro); }

        /// <summary>
        /// Cambia il tema a tutta la finestra, da qualunque parte lo si chieda
        /// (il bottone in alto o le Impostazioni). Applica rimette i colori di
        /// base, quindi dopo va ridipinta la voce scelta del menu: dalle
        /// Impostazioni prima restava spenta.
        /// </summary>
        public void ImpostaTema(bool scuro)
        {
            Tema.Imposta(scuro);
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
        /// <summary>
        /// Il testo per gli appunti, con i formati che chiedono a Windows di non
        /// tenerlo nella cronologia degli appunti (Win+V) e di non mandarlo agli
        /// altri dispositivi: Campanella copia indirizzi e nomi di colleghi, o
        /// codice da incollare una volta sola.
        /// </summary>
        public static DataObject PerGliAppunti(string testo)
        {
            DataObject d = new DataObject();
            d.SetData(DataFormats.UnicodeText, false, testo ?? "");
            d.SetData("ExcludeClipboardContentFromMonitorProcessing", false, new MemoryStream(BitConverter.GetBytes(0)));
            d.SetData("CanIncludeInClipboardHistory", false, new MemoryStream(BitConverter.GetBytes(0)));
            d.SetData("CanUploadToCloudClipboard", false, new MemoryStream(BitConverter.GetBytes(0)));
            return d;
        }

        /// <summary>Mette il testo negli appunti, fuori da cronologia e sincronizzazione. Se non ci riesce, eccezione.</summary>
        public static void MettiNegliAppunti(string testo)
        {
            Clipboard.SetDataObject(PerGliAppunti(testo), true);
        }

        public void Copia(string testo, string messaggio)
        {
            for (int tentativo = 0; tentativo < 3; tentativo++)
            {
                try { MettiNegliAppunti(testo); Stato1(messaggio); return; }
                // gli appunti occupati da un altro programma: si riprova fra un attimo
                catch (System.Runtime.InteropServices.ExternalException) { System.Threading.Thread.Sleep(120); }
            }
            MessageBox.Show(this,
                "Windows non mi ha lasciato usare gli appunti: di solito e' un altro " +
                "programma che li tiene occupati per un istante.\n\nRiprova.",
                "Appunti occupati", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        /// <summary>
        /// Scrive il file scelto con "Salva su file...". Se non ci riesce (file
        /// aperto in Excel, cartella protetta, disco pieno) lo dice con un
        /// messaggio breve, invece della finestra d'errore di .NET, e torna false.
        /// </summary>
        public static bool SalvaFile(IWin32Window padre, string percorso, string testo, Encoding codifica)
        {
            string errore = ScriviFile(percorso, testo, codifica);
            if (errore == "") return true;
            MessageBox.Show(padre, "Non sono riuscito a salvare il file\n\n" + percorso + "\n\n" + errore,
                "File non salvato", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        /// <summary>Scrive il file: vuoto se ci e' riuscito, altrimenti il motivo.</summary>
        public static string ScriviFile(string percorso, string testo, Encoding codifica)
        {
            try
            {
                File.WriteAllText(percorso, testo ?? "", codifica);
                return "";
            }
            catch (Exception ex) { return ex.Message; }
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
            catch (Exception) { return ""; }     // illeggibile vale come mancante: chi chiama lo dice
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
            catch (Exception)
            {
                // accanto al programma non si scrive (cartella protetta, chiavetta
                // in sola lettura): si ripiega sulla cartella temporanea
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
}
