// ===========================================================================
//  PaginaImpostazioni.cs - tema, dati nel Drive, rizzo-pii e aggiornamenti
// ===========================================================================

using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Campanella
{
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
        volatile bool scaricando = false;
        FermoScarico fermo;                  // chiude la connessione anche se la rete e' ferma
        int giroSalute = 0;                  // l'ultimo controllo di rizzo-pii chiesto
        Label lblCampanella;                 // c'e' una Campanella piu' nuova?
        Button btnRilasci;
        bool zitto = false;

        public PaginaImpostazioni(Guscio g) : base(g) { Costruisci(); }

        /// <summary>Vero mentre si scarica rizzo-pii: chiudendo la finestra lo
        /// scarico si interromperebbe a meta'.</summary>
        public bool LavoroInCorso { get { return scaricando; } }

        /// <summary>
        /// Chiudendo la finestra: ferma lo scarico e aspetta al massimo quei
        /// millisecondi che tolga da %TEMP% il file a meta'. Il thread e' in
        /// background: senza aspettare moriva con il programma, e l'installer
        /// incompleto restava li'.
        /// </summary>
        public void FermaScarico(int millisecondi)
        {
            if (!scaricando) return;
            Ferma();
            System.Threading.Thread t = lavoro;
            if (t != null && t.IsAlive) t.Join(millisecondi);
        }

        /// <summary>Ferma lo scarico: alza la bandierina e chiude la
        /// connessione, cosi' si ferma subito anche su una rete che non manda
        /// piu' niente, e il file a meta' viene tolto.</summary>
        void Ferma()
        {
            interrompi = true;
            FermoScarico f = fermo;
            if (f != null) f.Ferma();
        }

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
                "codice come CMP1-20260910-9-1-2431-S10500 e non contiene nessun dato personale.");
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
                "Privacy: gira sul tuo computer, all'indirizzo qui sotto. Un indirizzo che " +
                "porta fuori dal computer viene rifiutato.\r\n\r\n" +
                "L'applicazione non si collega a internet da sola: il controllo degli " +
                "aggiornamenti parte solo quando premi il pulsante, e chiede a GitHub " +
                "l'ultima versione di Campanella e di rizzo-pii. Campanella nuova non viene " +
                "scaricata: ti dice solo dove prenderla.");
            y += 30;

            Controls.Add(Tema.Testo1("Indirizzo del servizio", 0, y + 5, 0, Tema.Normale, Ruolo.Tenue));
            txtAnon = Tema.Casella(150, y, 260, Stato.AnonIndirizzoDiDefault);
            txtAnon.TextChanged += delegate { S.AnonIndirizzo = txtAnon.Text.Trim(); };
            Controls.Add(txtAnon);
            Controls.Add(Tema.Testo1("Cambialo solo se hai messo rizzo-pii su un'altra porta: " +
                                     "deve restare su questo computer.",
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
            y += 66;

            // l'avviso di una Campanella nuova: solo dopo "Cerca aggiornamenti"
            lblCampanella = Tema.Testo1("", 0, y + 4, 650, Tema.Piccolo, Ruolo.Tenue);
            lblCampanella.Height = 36;
            Controls.Add(lblCampanella);
            btnRilasci = Tema.Bottone("Pagina dei rilasci", 666, y, 160,
                delegate { Guscio.Apri(Aggiornamenti.PaginaCampanella); });
            btnRilasci.Visible = false;
            Controls.Add(btnRilasci);
            y += 48;

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
                // sola lettura: le condizioni sono gia' accettate, qui non si decide niente
                using (FormConsenso f = new FormConsenso(true)) f.ShowDialog(this);
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
                string file = S.PercorsoDati();
                bool ce = File.Exists(file);
                bool letto = ce && S.DatiGiaLetti(file);
                lblDati.Text = letto
                    ? "I dati stanno in " + file + " e vengono ricaricati a ogni avvio."
                    : ce
                    ? "Non sovrascrivo " + file + ": " +
                      (S.ErroreDati != "" ? S.ErroreDati : "e' comparso dopo l'avvio e non l'ho letto") +
                      ". Premi Applica per scegliere se usarlo o sostituirlo."
                    : "I dati dovrebbero stare in " + file + " ma il file non c'e' " +
                      "(Drive non sincronizzato o cartella cambiata).";
                lblDati.Tag = letto ? Ruolo.Buono : Ruolo.Avviso;
            }
            else
            {
                lblDati.Text = "Adesso i dati stanno nel file delle impostazioni, accanto al programma.";
                lblDati.Tag = Ruolo.Tenue;
            }
            Tema.Applica(lblDati);
        }

        /// <summary>
        /// Porta in vista la parte dei dati nel Drive, con Applica: sta in cima alla
        /// pagina. Ci arriva la chiusura quando un altro computer ha cambiato il file.
        /// </summary>
        public void MostraSezioneDati()
        {
            AutoScrollPosition = new Point(0, 0);
            btnApplicaDati.Focus();
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
            bool sostituisci = false, usaQuello = false;

            if (nelDrive)
            {
                if (cartella == "") cartella = S.CartellaDatiDiDefault();
                string radice = "";
                // un percorso non valido lascia la radice vuota: qui sotto si dice che non c'e'
                try { radice = Path.GetDirectoryName(cartella.TrimEnd('\\')); } catch (Exception) { }
                if (string.IsNullOrEmpty(radice) || !Directory.Exists(radice))
                {
                    MessageBox.Show(this,
                        "Non trovo la cartella del Drive che contiene\n\n" + cartella + "\n\n" +
                        "Controlla che Google Drive per desktop sia avviato e che il percorso sia giusto.",
                        "Cartella non trovata", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                string perche;
                // se non si crea, Scrivibile qui sotto lo dice con il motivo
                try { Directory.CreateDirectory(cartella); } catch (Exception) { }
                if (!Stato.Scrivibile(cartella, out perche))
                {
                    MessageBox.Show(this, "In quella cartella non riesco a scrivere: " + perche,
                        "Cartella non scrivibile", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                string file = Path.Combine(cartella, Stato.NomeFileDati);
                bool stesso = S.DatiNelDrive && Stato.StessoPercorso(file, S.PercorsoDati());
                if (File.Exists(file) && !S.DatiGiaLetti(file))
                {
                    // un file dei dati che qui non e' stato letto (un altro computer,
                    // il Drive appena sincronizzato): non lo sostituisco senza chiedere
                    DialogResult d = MessageBox.Show(this,
                        "In\n\n" + file + "\n\nc'e' gia' un file dei dati, forse scritto da Campanella " +
                        "su un altro computer.\n\n" +
                        "Si' = uso quel file: Campanella si riapre con l'elenco del personale, gli " +
                        "indirizzi e gli orari che ci sono dentro, al posto di quelli che vedi adesso.\n\n" +
                        "No = non lo uso, e decido se sostituirlo.",
                        "Il file dei dati c'e' gia'", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
                    if (d == DialogResult.Yes) usaQuello = true;
                    else if (d == DialogResult.No && MessageBox.Show(this,
                            "Sostituisco il file del Drive con i dati che vedi adesso?\n\n" +
                            "Quello che c'e' dentro andra' perso: resta solo nella cronologia delle " +
                            "versioni del Drive.",
                            "Sostituire il file dei dati?", MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
                            MessageBoxDefaultButton.Button2) == DialogResult.Yes) sostituisci = true;
                    else return;
                }
                else if (stesso && !File.Exists(file))
                {
                    if (MessageBox.Show(this,
                            "Nel Drive non c'e' ancora il file dei dati:\n\n" + file + "\n\n" +
                            "Se il Drive sta ancora sincronizzando, rispondi No e riapri Campanella " +
                            "fra qualche minuto.\n\nNe creo uno con i dati che vedi adesso?",
                            "Creare il file dei dati?", MessageBoxButtons.YesNo, MessageBoxIcon.Question,
                            MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
                }
                else if (!stesso && MessageBox.Show(this,
                        "Sposto l'elenco del personale, gli indirizzi e gli orari in\n\n" + file + "\n\n" +
                        "e li tolgo " + (S.DatiNelDrive ? "da\n\n" + S.PercorsoDati() + "\n\n"
                                                        : "dal file accanto al programma. ") +
                        "Il Drive li sincronizzera' nell'account della scuola.\n\nProcedo?",
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
            if (usaQuello)
            {
                // le pagine hanno ancora i dati di prima: il file del Drive si
                // legge riaprendo, e fino ad allora non si scrive
                if (S.UsaDatiDelDrive(cartella, out errore))
                {
                    MessageBox.Show(this, "Campanella si riapre per leggere i dati da\n\n" +
                        Path.Combine(cartella, Stato.NomeFileDati), "Dati dal Drive",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    Application.Restart();
                    return;
                }
                MessageBox.Show(this, "Qualcosa non e' andato: " + errore, "Attenzione",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            else if (S.SpostaDati(nelDrive, cartella, sostituisci, out errore))
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
            Guscio.ImpostaTema(scuro);
        }

        void Verifica()
        {
            StatoPosta r = StatoPosta.LeggiCodice(txtCodice.Text, S.PrefissoPulito());
            if (r == null)
            {
                lblEsito.Text = "Non ho riconosciuto il codice. Deve essere una riga sola, " +
                                "nella forma CMP1-20260910-9-1-2431-S10500.";
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

        static string RigaCampanella()
        {
            return "Campanella " + Aggiornamenti.VersioneCampanella +
                   "  (provata con rizzo-pii " + Anonimizzatore.VersioneRizzoProvata + ")\r\n";
        }

        /// <summary>Chiede a rizzo-pii se c'e'. La domanda gira fuori dal thread
        /// dell'interfaccia: con rizzo-pii spento la risposta arriva dopo un paio
        /// di secondi, e le Impostazioni non devono bloccarsi.</summary>
        void ControllaComponenti()
        {
            Anonimizzatore a = Servizio();
            int giro = ++giroSalute;
            lblComponenti.Text = RigaCampanella() + "Controllo rizzo-pii su " + a.Indirizzo + "...";
            lblComponenti.Tag = Ruolo.Tenue;
            Tema.Applica(lblComponenti);

            System.Threading.ThreadPool.QueueUserWorkItem(delegate
            {
                SaluteAnonimizzatore s = a.Salute();
                SulThread(delegate
                {
                    if (giro != giroSalute) return;     // nel frattempo ne e' partito un altro
                    string riga = RigaCampanella();
                    if (s.Pronto)
                        riga += "rizzo-pii " + (s.Versione != "" ? s.Versione : "(versione non dichiarata)") +
                                " - in ascolto su " + a.Indirizzo + ", modello " + s.Modello + " su " + s.Dispositivo;
                    else if (!Anonimizzatore.IndirizzoLocale(a.Indirizzo))
                        riga += "\"" + a.Indirizzo + "\" non e' su questo computer: non lo uso. " +
                                "rizzo-pii deve girare qui (localhost o 127.0.0.1): correggilo qui sopra.";
                    else
                        riga += "rizzo-pii non risponde su " + a.Indirizzo +
                                ". Senza di lui l'anonimizzazione non funziona: installalo o avvialo.";
                    lblComponenti.Text = riga;
                    lblComponenti.Tag = s.Pronto ? Ruolo.Buono : Ruolo.Avviso;
                    Tema.Applica(lblComponenti);
                });
            });
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
            Anonimizzatore a = Servizio();

            // tutta la rete qui dentro, anche la domanda a rizzo-pii
            lavoro = new System.Threading.Thread(delegate ()
            {
                Rilascio c = Aggiornamenti.UltimoCampanella();
                Rilascio r = Aggiornamenti.UltimoRizzoPii();
                SaluteAnonimizzatore s = r.Trovato ? a.Salute() : null;
                SulThread(delegate
                {
                    btnCerca.Enabled = true;
                    MostraCampanella(c);
                    ultimoRilascio = r;
                    if (!r.Trovato) { Messaggio(r.Messaggio, Ruolo.Avviso); return; }

                    // una versione di rizzo-pii piu' nuova di quella provata si puo'
                    // installare, ma e' giusto dirlo prima
                    string provata = Aggiornamenti.PiuRecente(r.Versione, Anonimizzatore.VersioneRizzoProvata)
                        ? "  Campanella e' provata con la " + Anonimizzatore.VersioneRizzoProvata +
                          ": con la " + r.Versione + " qualcosa potrebbe non andare."
                        : "";

                    if (!s.Pronto)
                    {
                        Messaggio("rizzo-pii non risulta installato o avviato. " + r.Messaggio +
                                  "  Puoi scaricarlo da qui." + provata, Ruolo.Avviso);
                        btnInstalla.Visible = (r.FileWindows != "");
                        btnInstalla.Text = "Scarica e installa rizzo-pii  (" + r.PesoLeggibile + ")";
                    }
                    else if (Aggiornamenti.Confronta(r.Versione, s.Versione) > 0)
                    {
                        Messaggio("C'e' una versione piu' recente di rizzo-pii: hai la " +
                                  s.Versione + ", l'ultima e' la " + r.Versione + "." + provata, Ruolo.Avviso);
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

        /// <summary>Dice se c'e' una Campanella piu' nuova. Non scarica niente:
        /// rimanda alla pagina dei rilasci.</summary>
        void MostraCampanella(Rilascio c)
        {
            string mia = Aggiornamenti.VersioneCampanella;
            bool nuova = c.Trovato && Aggiornamenti.PiuRecente(c.Versione, mia);
            if (!c.Trovato)
                lblCampanella.Text = "Non sono riuscito a controllare la versione di Campanella. " +
                                     c.Messaggio;
            else if (nuova)
                lblCampanella.Text = "E' uscita Campanella " + c.Versione + ": tu hai la " + mia + ". " +
                                     "Scaricala dalla pagina dei rilasci, dove trovi anche le novita'.";
            else
                lblCampanella.Text = "Campanella e' aggiornata: hai la " + mia +
                                     ", l'ultima pubblicata e' la " + c.Versione + ".";
            lblCampanella.Tag = (c.Trovato && !nuova) ? Ruolo.Buono : Ruolo.Avviso;
            btnRilasci.Visible = nuova || !c.Trovato;
            Tema.Applica(lblCampanella);
            Tema.Applica(btnRilasci);
        }

        void InstallaRizzo()
        {
            // durante lo scarico lo stesso pulsante lo ferma
            if (scaricando)
            {
                Ferma();
                btnInstalla.Enabled = false;
                Messaggio("Fermo lo scarico...", Ruolo.Tenue);
                return;
            }
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
            FermoScarico questo = new FermoScarico();
            fermo = questo;
            scaricando = true;
            string testoBottone = btnInstalla.Text;
            btnInstalla.Text = "Ferma lo scarico";
            btnCerca.Enabled = false;
            barra.Visible = true;
            barra.Value = 0;

            string url = ultimoRilascio.FileWindows;
            long attesi = ultimoRilascio.ByteWindows;
            string sha256 = ultimoRilascio.Sha256Windows;
            string nome = "Rizzo-PII-Setup.exe";
            // un indirizzo che non si scompone lascia il nome di partenza
            try { nome = Path.GetFileName(new Uri(url).LocalPath); } catch (Exception) { }

            lavoro = new System.Threading.Thread(delegate ()
            {
                string file = null;
                string errore = null;
                try
                {
                    // dimensione e impronta controllate: un file a meta' viene
                    // cancellato e non parte
                    file = Aggiornamenti.Scarica(url, nome, attesi, sha256, delegate (int pc, long fatti, long tot)
                    {
                        SulThread(delegate
                        {
                            barra.Value = Math.Max(0, Math.Min(100, pc));
                            Messaggio("Scaricato " + Math.Round(fatti / 1024.0 / 1024.0) + " MB su " +
                                      Math.Round(tot / 1024.0 / 1024.0) + " MB  (" + pc + "%)",
                                      Ruolo.Tenue);
                        });
                        return !interrompi;
                    }, questo);
                }
                catch (Exception ex) { errore = ex.Message; }

                SulThread(delegate
                {
                    scaricando = false;
                    barra.Visible = false;
                    btnInstalla.Text = testoBottone;
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
