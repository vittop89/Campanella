// ===========================================================================
//  Installa.cs - installer e disinstallatore di Campanella
//
//  Un solo eseguibile, con dentro l'applicazione come risorsa. Installa in
//  %LOCALAPPDATA%\Programs\Campanella, quindi senza chiedere i diritti di
//  amministratore: niente UAC, niente "chiedi all'assistenza".
//
//  Fa quattro cose:
//    1. mostra le condizioni d'uso e le fa accettare;
//    2. copia i file e crea i collegamenti;
//    3. si registra fra i programmi installati, cosi' si disinstalla dalle
//       Impostazioni di Windows come qualunque altro;
//    4. se lo chiedi, scarica e avvia l'installer di rizzo-pii.
//
//  Disinstallazione: "Disinstalla Campanella.exe" e' una copia di questo
//  stesso file. Siccome un programma non puo' cancellare se stesso mentre
//  gira, si ricopia nella cartella temporanea e da li' fa pulizia.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Installazione di Campanella")]
[assembly: AssemblyDescription("Installa Campanella: posta, cartelle, orari, privacy")]
[assembly: AssemblyProduct("Campanella")]
[assembly: AssemblyCompany("Vittorio Pantaleo")]
[assembly: AssemblyCopyright("Licenza MIT")]
[assembly: AssemblyVersion("1.2.0.0")]
[assembly: AssemblyFileVersion("1.2.0.0")]

namespace Campanella
{
    static class ProgrammaInstallazione
    {
        public const string Nome = "Campanella";
        public const string ChiaveRegistro =
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Campanella";

        /// <summary>I documenti per dirigenza e DPO: risorsa incorporata = nome del file.</summary>
        public static readonly string[] Documenti =
        {
            "Nota tecnica per dirigente e DPO.txt",
            "Email per dirigente e DPO.txt",
            "GDPR - cosa vale per un docente.txt"
        };

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Tema.Imposta(true);

            try
            {
                if (args.Length >= 1 && args[0] == "/rimuovi")
                {
                    // seconda fase della disinstallazione: giro dalla cartella
                    // temporanea, quindi posso cancellare tutto il resto
                    string cartella = (args.Length >= 2) ? args[1] : "";
                    bool ancheImpostazioni = (args.Length >= 3 && args[2] == "/tutto");
                    Disinstallatore.Rimuovi(cartella, ancheImpostazioni);
                    return;
                }

                if (args.Length >= 1 && args[0] == "/disinstalla")
                {
                    Disinstallatore.Chiedi();
                    return;
                }

                Application.Run(new FormInstalla());
            }
            catch (Exception ex)
            {
                MessageBox.Show("Errore imprevisto:\n\n" + ex.Message,
                    "Installazione di Campanella", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public static string CartellaPredefinita()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", Nome);
        }
    }

    // =======================================================================
    //  LA FINESTRA
    // =======================================================================
    class FormInstalla : Form
    {
        Panel pagina1, pagina2, pagina3;
        int passo = 0;

        // condizioni
        CheckBox chkDati, chkResponsabilita;

        // opzioni
        TextBox txtCartella;
        CheckBox chkMenu, chkScrivania, chkRizzo, chkAvvia, chkDocumenti;
        Label lblSpazio;

        // avanzamento
        TextBox log;
        ProgressBar barra;
        Label lblTitolo3;

        Button btnAvanti, btnIndietro, btnEsci;
        Thread lavoro;
        volatile bool interrompi = false;
        string cartellaInstallata = "";

        public FormInstalla()
        {
            Text = "Installazione di Campanella";
            Size = new Size(840, 700);
            MinimumSize = new Size(760, 620);
            StartPosition = FormStartPosition.CenterScreen;
            Font = Tema.Normale;
            MaximizeBox = false;

            Panel testata = new Panel();
            testata.Dock = DockStyle.Top;
            testata.Height = 76;
            testata.Tag = Ruolo.Barra;
            Tema.LineaSotto(testata);
            testata.Controls.Add(Tema.Testo1("Campanella", 24, 14, 0, Tema.Titolo, Ruolo.Titolo));
            testata.Controls.Add(Tema.Testo1(
                "Posta, cartelle, orari e privacy: gli strumenti della scuola in un posto solo.",
                26, 46, 700, Tema.Normale, Ruolo.Sottotitolo));
            Controls.Add(testata);

            Panel piede = new Panel();
            piede.Dock = DockStyle.Bottom;
            piede.Height = 62;
            piede.Tag = Ruolo.Barra;
            Tema.LineaSopra(piede);

            btnAvanti = Tema.BottonePrincipale("Avanti", 0, 14, 170, delegate { Avanti(); });
            btnAvanti.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnIndietro = Tema.Bottone("Indietro", 0, 16, 110, delegate { VaiA(passo - 1); });
            btnIndietro.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnEsci = Tema.Bottone("Esci", 24, 16, 100, delegate { Chiudi(); });
            piede.Resize += delegate
            {
                btnAvanti.Location = new Point(piede.Width - 194, 14);
                btnIndietro.Location = new Point(piede.Width - 312, 16);
            };
            piede.Controls.Add(btnEsci);
            piede.Controls.Add(btnIndietro);
            piede.Controls.Add(btnAvanti);
            Controls.Add(piede);

            Panel contenuto = new Panel();
            contenuto.Dock = DockStyle.Fill;
            contenuto.Padding = new Padding(24, 14, 24, 8);
            Controls.Add(contenuto);
            contenuto.BringToFront();

            pagina1 = CostruisciCondizioni();
            pagina2 = CostruisciOpzioni();
            pagina3 = CostruisciAvanzamento();
            foreach (Panel p in new Panel[] { pagina1, pagina2, pagina3 })
            {
                p.Dock = DockStyle.Fill;
                p.Visible = false;
                p.AutoScroll = true;
                contenuto.Controls.Add(p);
            }

            Tema.Applica(this);
            VaiA(0);
            FormClosing += delegate (object s, FormClosingEventArgs e)
            {
                if (lavoro != null && lavoro.IsAlive)
                {
                    if (MessageBox.Show(this, "L'installazione e' in corso. Vuoi interromperla?",
                            "Interrompere?", MessageBoxButtons.YesNo,
                            MessageBoxIcon.Question) != DialogResult.Yes)
                    { e.Cancel = true; return; }
                    interrompi = true;
                }
            };
        }

        // -------------------------------------------------------------------
        Panel CostruisciCondizioni()
        {
            Panel p = new Panel();
            p.Controls.Add(Tema.Testo1("Prima di installare", 0, 4, 0, Tema.Sezione, Ruolo.Sezione));
            p.Controls.Add(Tema.Testo1(
                "Campanella lavora su dati di altre persone: colleghi, studenti, famiglie. " +
                "Queste righe dicono cosa comporta. Servono due spunte per andare avanti.",
                0, 38, 760, Tema.Normale, Ruolo.Tenue));

            TextBox t = new TextBox();
            t.Location = new Point(0, 82);
            t.Size = new Size(768, 350);
            t.Multiline = true;
            t.ReadOnly = true;
            t.ScrollBars = ScrollBars.Vertical;
            t.Font = Tema.Mono;
            t.Tag = Ruolo.Codice;
            t.Text = Consenso.Testo;
            t.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            p.Controls.Add(t);
            Shown += delegate { t.Select(0, 0); t.ScrollToCaret(); };

            chkDati = Tema.Spunta(
                "Ho letto le avvertenze sui dati della scuola e sull'intelligenza artificiale.",
                0, 446, Ruolo.Normale);
            chkDati.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            chkDati.CheckedChanged += delegate { AggiornaBottoni(); };
            p.Controls.Add(chkDati);

            chkResponsabilita = Tema.Spunta(
                "Accetto che il programma sia senza garanzie e che l'autore non risponda dell'uso che ne faccio.",
                0, 474, Ruolo.Normale);
            chkResponsabilita.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            chkResponsabilita.CheckedChanged += delegate { AggiornaBottoni(); };
            p.Controls.Add(chkResponsabilita);
            return p;
        }

        Panel CostruisciOpzioni()
        {
            Panel p = new Panel();
            int y = 4;
            p.Controls.Add(Tema.Testo1("Dove e come", 0, y, 0, Tema.Sezione, Ruolo.Sezione));
            y += 44;

            p.Controls.Add(Tema.Testo1("Cartella di installazione", 0, y, 0, Tema.Grassetto, Ruolo.Normale));
            txtCartella = Tema.Casella(0, y + 24, 620);
            txtCartella.Text = ProgrammaInstallazione.CartellaPredefinita();
            p.Controls.Add(txtCartella);
            p.Controls.Add(Tema.Bottone("Sfoglia...", 632, y + 23, 130, delegate
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    d.Description = "Scegli dove installare Campanella";
                    if (d.ShowDialog(this) == DialogResult.OK)
                        txtCartella.Text = Path.Combine(d.SelectedPath, ProgrammaInstallazione.Nome);
                }
            }));
            y += 56;
            p.Controls.Add(Tema.Testo1(
                "E' una cartella dentro il tuo profilo: non servono i diritti di amministratore " +
                "e Windows non chiede niente.",
                0, y, 760, Tema.Piccolo, Ruolo.Tenue));
            y += 44;

            chkMenu = Tema.Spunta("Metti Campanella nel menu Start", 0, y, Ruolo.Normale);
            chkMenu.Checked = true;
            p.Controls.Add(chkMenu);
            y += 28;
            chkScrivania = Tema.Spunta("Metti un collegamento sulla scrivania", 0, y, Ruolo.Normale);
            chkScrivania.Checked = true;
            p.Controls.Add(chkScrivania);
            y += 40;

            Panel scheda = Tema.Scheda1("L'anonimizzazione richiede rizzo-pii",
                "Per togliere i dati personali da un testo o da un file serve rizzo-pii: un " +
                "programma italiano gratuito e open source che riconosce 22 categorie di dati " +
                "personali e gira sul tuo computer, senza collegamento. E' un pacchetto grosso " +
                "(circa 1,2 GB) perche' contiene il modello. Se spunti la casella lo scarico da " +
                "GitHub e avvio la sua installazione appena finita questa; altrimenti puoi farlo " +
                "quando vuoi da Campanella, in Impostazioni.",
                0, y, 768);
            p.Controls.Add(scheda);
            y += scheda.Height + 12;

            chkRizzo = Tema.Spunta("Scarica e installa anche rizzo-pii  (serve internet)", 0, y, Ruolo.Normale);
            p.Controls.Add(chkRizzo);
            y += 30;

            lblSpazio = Tema.Testo1("", 0, y, 760, Tema.Piccolo, Ruolo.Tenue);
            lblSpazio.Height = 34;
            p.Controls.Add(lblSpazio);
            y += 42;

            Panel dpo = Tema.Scheda1("Dirigenza e responsabile della protezione dei dati (DPO)",
                "Campanella lavora su dati di colleghi (l'elenco del personale, gli orari) dentro " +
                "il tuo account della scuola. La legge non ti chiede un permesso per riordinare la " +
                "tua posta, ma il regolamento del tuo istituto potrebbe chiedere di avvisare o di " +
                "farti autorizzare per gli script. Per questo l'installazione mette nella cartella " +
                "\"documenti\" una nota tecnica che descrive cosa fa l'applicazione, un modello " +
                "di email per dirigente e DPO e una spiegazione con i riferimenti di legge: " +
                "li ritrovi anche in Campanella, pagina Privacy.",
                0, y, 768);
            p.Controls.Add(dpo);
            y += dpo.Height + 10;

            chkDocumenti = Tema.Spunta("Copia i documenti per dirigenza e DPO nella cartella \"documenti\"",
                                       0, y, Ruolo.Normale);
            chkDocumenti.Checked = true;
            p.Controls.Add(chkDocumenti);
            y += 30;

            chkAvvia = Tema.Spunta("Avvia Campanella quando ha finito", 0, y, Ruolo.Normale);
            chkAvvia.Checked = true;
            p.Controls.Add(chkAvvia);
            y += 30;
            p.Controls.Add(Tema.Testo1("", 0, y, 10, Tema.Piccolo, Ruolo.Tenue));   // margine in fondo
            return p;
        }

        Panel CostruisciAvanzamento()
        {
            Panel p = new Panel();
            lblTitolo3 = Tema.Testo1("Installazione in corso", 0, 4, 0, Tema.Sezione, Ruolo.Sezione);
            p.Controls.Add(lblTitolo3);

            barra = new ProgressBar();
            barra.Location = new Point(0, 48);
            barra.Size = new Size(768, 18);
            barra.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            p.Controls.Add(barra);

            log = new TextBox();
            log.Location = new Point(0, 78);
            log.Size = new Size(768, 400);
            log.Multiline = true;
            log.ReadOnly = true;
            log.ScrollBars = ScrollBars.Vertical;
            log.Font = Tema.Mono;
            log.Tag = Ruolo.Codice;
            log.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            p.Controls.Add(log);
            return p;
        }

        // -------------------------------------------------------------------
        void VaiA(int n)
        {
            passo = Math.Max(0, Math.Min(2, n));
            pagina1.Visible = (passo == 0);
            pagina2.Visible = (passo == 1);
            pagina3.Visible = (passo == 2);
            btnIndietro.Visible = (passo == 1);
            AggiornaBottoni();
            if (passo == 1) AggiornaSpazio();
        }

        void AggiornaBottoni()
        {
            if (passo == 0)
            {
                bool ok = chkDati.Checked && chkResponsabilita.Checked;
                btnAvanti.Text = "Accetto e continuo";
                btnAvanti.Enabled = ok;
                btnAvanti.BackColor = ok ? Tema.Accento : Tema.Mescola(Tema.Scheda, Tema.Tenue, 0.25);
                btnAvanti.ForeColor = ok ? Tema.AccentoTesto : Tema.Tenue;
            }
            else if (passo == 1)
            {
                btnAvanti.Text = "Installa";
                btnAvanti.Enabled = true;
                btnAvanti.BackColor = Tema.Accento;
                btnAvanti.ForeColor = Tema.AccentoTesto;
            }
            else
            {
                btnAvanti.Text = "Fine";
                btnAvanti.Enabled = (lavoro == null || !lavoro.IsAlive);
                btnAvanti.BackColor = btnAvanti.Enabled
                    ? Tema.Accento : Tema.Mescola(Tema.Scheda, Tema.Tenue, 0.25);
                btnAvanti.ForeColor = btnAvanti.Enabled ? Tema.AccentoTesto : Tema.Tenue;
            }
        }

        void AggiornaSpazio()
        {
            try
            {
                string radice = Path.GetPathRoot(txtCartella.Text.Trim());
                DriveInfo d = new DriveInfo(radice);
                long liberi = d.AvailableFreeSpace / 1024 / 1024;
                lblSpazio.Text = "Campanella occupa meno di 1 MB. Spazio libero su " + radice +
                                 ": " + liberi + " MB." +
                                 (chkRizzo.Checked ? "  rizzo-pii ne chiede circa 3000 fra scarico e installazione." : "");
                lblSpazio.Tag = (chkRizzo.Checked && liberi < 4000) ? Ruolo.Avviso : Ruolo.Tenue;
            }
            catch { lblSpazio.Text = ""; }
            Tema.Applica(lblSpazio);
        }

        void Chiudi()
        {
            if (lavoro != null && lavoro.IsAlive) { interrompi = true; return; }
            Close();
        }

        void Avanti()
        {
            if (passo == 0) { VaiA(1); return; }
            if (passo == 1) { Installa(); return; }
            if (chkAvvia.Checked && cartellaInstallata != "")
            {
                string exe = Path.Combine(cartellaInstallata, "Campanella.exe");
                if (File.Exists(exe))
                {
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo(exe);
                        psi.WorkingDirectory = cartellaInstallata;
                        psi.UseShellExecute = true;
                        Process.Start(psi);
                    }
                    catch { }
                }
            }
            Close();
        }

        // -------------------------------------------------------------------
        void Scrivi(string riga)
        {
            if (log.InvokeRequired) { log.BeginInvoke((MethodInvoker)delegate { Scrivi(riga); }); return; }
            log.AppendText(riga + "\r\n");
            log.SelectionStart = log.TextLength;
            log.ScrollToCaret();
        }

        void Avanzamento(int percentuale)
        {
            if (barra.InvokeRequired)
            {
                barra.BeginInvoke((MethodInvoker)delegate { Avanzamento(percentuale); });
                return;
            }
            barra.Value = Math.Max(0, Math.Min(100, percentuale));
        }

        void Installa()
        {
            string cartella = txtCartella.Text.Trim();
            if (cartella == "")
            {
                MessageBox.Show(this, "Scegli una cartella.", "Manca la cartella",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            VaiA(2);
            interrompi = false;
            AggiornaBottoni();

            bool menu = chkMenu.Checked, scrivania = chkScrivania.Checked, rizzo = chkRizzo.Checked;
            bool documenti = chkDocumenti.Checked;
            lavoro = new Thread(delegate () { Lavora(cartella, menu, scrivania, rizzo, documenti); });
            lavoro.IsBackground = true;
            lavoro.Start();
        }

        void Lavora(string cartella, bool menu, bool scrivania, bool rizzo, bool documenti)
        {
            try
            {
                Scrivi("Cartella: " + cartella);
                Directory.CreateDirectory(cartella);
                Avanzamento(10);

                string[] risorse = { "Campanella.exe", "ISTRUZIONI - Campanella.txt", "PRIVACY.md" };
                foreach (string r in risorse)
                {
                    byte[] dati = Risorse.Leggi(r);
                    if (dati == null) { Scrivi("  manca la risorsa " + r + ": salto"); continue; }
                    string destinazione = Path.Combine(cartella, r);
                    ScriviFile(destinazione, dati);
                    Scrivi("  copiato  " + r + "   (" + Math.Round(dati.Length / 1024.0) + " KB)");
                }
                Avanzamento(30);

                if (documenti)
                {
                    string cartellaDoc = Path.Combine(cartella, "documenti");
                    Directory.CreateDirectory(cartellaDoc);
                    foreach (string nome in ProgrammaInstallazione.Documenti)
                    {
                        byte[] dati = Risorse.Leggi(nome);
                        if (dati == null) { Scrivi("  manca il documento " + nome + ": salto"); continue; }
                        ScriviFile(Path.Combine(cartellaDoc, nome), dati);
                        Scrivi("  copiato  documenti\\" + nome);
                    }
                }
                Avanzamento(40);

                // il disinstallatore e' una copia di questo stesso programma
                string disinstalla = Path.Combine(cartella, "Disinstalla Campanella.exe");
                ScriviFile(disinstalla, File.ReadAllBytes(Application.ExecutablePath));
                Scrivi("  copiato  Disinstalla Campanella.exe");
                Avanzamento(50);

                // il consenso e' gia' stato dato qui: non lo richiedo all'avvio
                string config = Path.Combine(cartella, Stato.NomeFile);
                if (!File.Exists(config))
                {
                    File.WriteAllText(config,
                        "{\"consensoVersione\":" + Consenso.Versione +
                        ",\"consensoData\":\"" + DateTime.Now.ToString("yyyy-MM-dd HH:mm") +
                        "\",\"temaScuro\":true}",
                        new UTF8Encoding(false));
                    Scrivi("  scritto  " + Stato.NomeFile + " (condizioni gia' accettate)");
                }
                Avanzamento(60);

                string exe = Path.Combine(cartella, "Campanella.exe");
                if (menu)
                {
                    string cartellaMenu = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Campanella");
                    Directory.CreateDirectory(cartellaMenu);
                    Scorciatoie.Crea(Path.Combine(cartellaMenu, "Campanella.lnk"), exe, cartella,
                                     "Posta, cartelle, orari e privacy");
                    Scorciatoie.Crea(Path.Combine(cartellaMenu, "Istruzioni.lnk"),
                                     Path.Combine(cartella, "ISTRUZIONI - Campanella.txt"), cartella,
                                     "Come si usa Campanella");
                    Scorciatoie.Crea(Path.Combine(cartellaMenu, "Disinstalla Campanella.lnk"),
                                     disinstalla, cartella, "Toglie Campanella dal computer",
                                     "/disinstalla");
                    Scrivi("  creato   il gruppo nel menu Start");
                }
                if (scrivania)
                {
                    string scr = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    Scorciatoie.Crea(Path.Combine(scr, "Campanella.lnk"), exe, cartella,
                                     "Posta, cartelle, orari e privacy");
                    Scrivi("  creato   il collegamento sulla scrivania");
                }
                Avanzamento(70);

                Registra(cartella, disinstalla, exe);
                Scrivi("  registrato fra i programmi installati");
                Avanzamento(rizzo ? 75 : 100);

                if (rizzo && !interrompi)
                {
                    Scrivi("");
                    Scrivi("Cerco l'ultima versione di rizzo-pii...");
                    Rilascio r = Aggiornamenti.UltimoRizzoPii();
                    if (!r.Trovato || r.FileWindows == "")
                    {
                        Scrivi("  non ci sono riuscito: " + r.Messaggio);
                        Scrivi("  potrai installarlo dopo, da Campanella > Impostazioni.");
                    }
                    else
                    {
                        Scrivi("  versione " + r.Versione + ", " + r.PesoLeggibile + ". Scarico...");
                        string file = Aggiornamenti.Scarica(r.FileWindows, "Rizzo-PII-Setup.exe",
                            delegate (int pc, long fatti, long tot)
                            {
                                Avanzamento(75 + pc / 4);
                                if (pc % 5 == 0)
                                    Scrivi("    " + Math.Round(fatti / 1048576.0) + " / " +
                                           Math.Round(tot / 1048576.0) + " MB  (" + pc + "%)");
                                return !interrompi;
                            });
                        if (file == null) Scrivi("  scarico interrotto.");
                        else
                        {
                            Scrivi("  scaricato. Avvio l'installazione di rizzo-pii.");
                            Aggiornamenti.Avvia(file);
                        }
                    }
                }

                Avanzamento(100);
                cartellaInstallata = cartella;
                Scrivi("");
                Scrivi("=== FATTO ===");
                Scrivi("Campanella e' installata in " + cartella);
                Scrivi("La trovi nel menu Start. Per toglierla: Impostazioni di Windows >");
                Scrivi("App > App installate > Campanella, oppure il collegamento");
                Scrivi("\"Disinstalla Campanella\".");
                if (documenti)
                {
                    Scrivi("");
                    Scrivi("I documenti per dirigenza e DPO stanno in " + Path.Combine(cartella, "documenti"));
                    Scrivi("(nota tecnica, modello di email, spiegazione del GDPR).");
                }
                Titolo3("Installazione completata");
            }
            catch (Exception ex)
            {
                Scrivi("");
                Scrivi("ERRORE: " + ex.Message);
                Scrivi("Niente e' andato perso: puoi richiudere e riprovare.");
                Titolo3("Installazione non riuscita");
            }
            finally
            {
                if (btnAvanti.InvokeRequired) btnAvanti.BeginInvoke((MethodInvoker)AggiornaBottoni);
                else AggiornaBottoni();
            }
        }

        void Titolo3(string testo)
        {
            if (lblTitolo3.InvokeRequired)
            {
                lblTitolo3.BeginInvoke((MethodInvoker)delegate { Titolo3(testo); });
                return;
            }
            lblTitolo3.Text = testo;
        }

        static void ScriviFile(string percorso, byte[] dati)
        {
            // se il file e' in uso, provo qualche volta prima di arrendermi
            for (int tentativo = 0; ; tentativo++)
            {
                try { File.WriteAllBytes(percorso, dati); return; }
                catch (IOException)
                {
                    if (tentativo >= 5) throw;
                    Thread.Sleep(400);
                }
            }
        }

        static void Registra(string cartella, string disinstalla, string exe)
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(ProgrammaInstallazione.ChiaveRegistro))
            {
                if (k == null) return;
                k.SetValue("DisplayName", "Campanella");
                k.SetValue("DisplayVersion", Aggiornamenti.VersioneCampanella);
                k.SetValue("Publisher", "Vittorio Pantaleo");
                k.SetValue("InstallLocation", cartella);
                k.SetValue("DisplayIcon", exe);
                k.SetValue("UninstallString", "\"" + disinstalla + "\" /disinstalla");
                k.SetValue("QuietUninstallString", "\"" + disinstalla + "\" /disinstalla");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                k.SetValue("EstimatedSize", 1024, RegistryValueKind.DWord);   // in KB
                k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
            }
        }
    }

    // =======================================================================
    //  RISORSE INCORPORATE
    // =======================================================================
    static class Risorse
    {
        public static byte[] Leggi(string nome)
        {
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(nome))
                {
                    if (s == null) return null;
                    using (MemoryStream m = new MemoryStream())
                    {
                        s.CopyTo(m);
                        return m.ToArray();
                    }
                }
            }
            catch { return null; }
        }
    }

    // =======================================================================
    //  COLLEGAMENTI (.lnk)
    // =======================================================================
    static class Scorciatoie
    {
        /// <summary>
        /// Crea un .lnk senza librerie esterne, chiedendo a Windows Script Host.
        /// </summary>
        public static void Crea(string percorsoLnk, string bersaglio, string cartellaDiLavoro,
                                string descrizione)
        {
            Crea(percorsoLnk, bersaglio, cartellaDiLavoro, descrizione, null);
        }

        public static void Crea(string percorsoLnk, string bersaglio, string cartellaDiLavoro,
                                string descrizione, string argomenti)
        {
            Type tipo = Type.GetTypeFromProgID("WScript.Shell");
            if (tipo == null) return;
            object shell = Activator.CreateInstance(tipo);
            try
            {
                object lnk = tipo.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod,
                                               null, shell, new object[] { percorsoLnk });
                Type tl = lnk.GetType();
                tl.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk,
                                new object[] { bersaglio });
                tl.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk,
                                new object[] { cartellaDiLavoro });
                tl.InvokeMember("Description", BindingFlags.SetProperty, null, lnk,
                                new object[] { descrizione });
                if (argomenti != null)
                    tl.InvokeMember("Arguments", BindingFlags.SetProperty, null, lnk,
                                    new object[] { argomenti });
                tl.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
            }
            finally
            {
                try { System.Runtime.InteropServices.Marshal.ReleaseComObject(shell); } catch { }
            }
        }
    }

    // =======================================================================
    //  DISINSTALLAZIONE
    // =======================================================================
    static class Disinstallatore
    {
        public static void Chiedi()
        {
            string cartella = Path.GetDirectoryName(Application.ExecutablePath);

            DialogResult r = MessageBox.Show(
                "Vuoi togliere Campanella da questo computer?\n\n" +
                "Cartella: " + cartella + "\n\n" +
                "Gli script che hai gia' incollato dentro il tuo account Google restano dove " +
                "sono e continuano a funzionare: quelli si spengono da li', con le funzioni " +
                "ANNULLA_...",
                "Disinstalla Campanella", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (r != DialogResult.Yes) return;

            DialogResult impostazioni = MessageBox.Show(
                "Vuoi cancellare anche le tue impostazioni?\n\n" +
                "Sono l'elenco del personale, le regole delle etichette, gli orari caricati: " +
                "il file campanella.json.\n\n" +
                "Scegli No se pensi di reinstallare: le ritroverai tutte.",
                "E le impostazioni?", MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            // non posso cancellare me stesso mentre giro: mi sposto nel temporaneo
            string copia = Path.Combine(Path.GetTempPath(),
                                        "campanella-disinstalla-" + Guid.NewGuid().ToString("N") + ".exe");
            File.Copy(Application.ExecutablePath, copia, true);

            ProcessStartInfo psi = new ProcessStartInfo(copia);
            psi.Arguments = "/rimuovi \"" + cartella + "\"" +
                            (impostazioni == DialogResult.Yes ? " /tutto" : "");
            psi.UseShellExecute = true;
            Process.Start(psi);
        }

        public static void Rimuovi(string cartella, bool ancheImpostazioni)
        {
            if (cartella == "" || !Directory.Exists(cartella)) return;

            // aspetto che il disinstallatore originale abbia chiuso
            Thread.Sleep(1200);

            List<string> problemi = new List<string>();

            foreach (string f in Directory.GetFiles(cartella))
            {
                string nome = Path.GetFileName(f);
                if (!ancheImpostazioni &&
                    nome.Equals(Stato.NomeFile, StringComparison.OrdinalIgnoreCase)) continue;
                Prova(delegate { File.Delete(f); }, problemi, nome);
            }

            // i documenti per dirigenza e DPO: sono copie dell'installer, si rifanno
            Prova(delegate
            {
                string doc = Path.Combine(cartella, "documenti");
                if (Directory.Exists(doc)) Directory.Delete(doc, true);
            }, problemi, "documenti");

            Prova(delegate
            {
                string menu = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Campanella");
                if (Directory.Exists(menu)) Directory.Delete(menu, true);
            }, problemi, "menu Start");

            Prova(delegate
            {
                string lnk = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "Campanella.lnk");
                if (File.Exists(lnk)) File.Delete(lnk);
            }, problemi, "collegamento sulla scrivania");

            Prova(delegate
            {
                Registry.CurrentUser.DeleteSubKeyTree(ProgrammaInstallazione.ChiaveRegistro, false);
            }, problemi, "registro");

            Prova(delegate
            {
                if (Directory.GetFileSystemEntries(cartella).Length == 0) Directory.Delete(cartella);
            }, problemi, "cartella");

            string messaggio = (problemi.Count == 0)
                ? "Campanella e' stata tolta dal computer." +
                  (ancheImpostazioni ? "" : "\n\nLe impostazioni sono rimaste in:\n" + cartella)
                : "Campanella e' stata tolta, ma qualcosa non si e' lasciato cancellare:\n\n  " +
                  string.Join("\n  ", problemi.ToArray()) +
                  "\n\nDi solito basta chiudere tutto e ripassare a mano da:\n" + cartella;

            MessageBox.Show(messaggio, "Disinstallazione", MessageBoxButtons.OK,
                            problemi.Count == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        static void Prova(MethodInvoker azione, List<string> problemi, string cosa)
        {
            try { azione(); }
            catch (Exception ex) { problemi.Add(cosa + " (" + ex.Message + ")"); }
        }
    }
}
