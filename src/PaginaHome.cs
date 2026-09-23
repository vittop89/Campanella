// ===========================================================================
//  PaginaHome.cs - la pagina iniziale: lo stato di ogni strumento
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Campanella
{
    // =======================================================================
    //  PAGINA INIZIALE
    // =======================================================================
    class PaginaHome : Pagina
    {
        Label lblRiepilogo;
        Panel[] schede = new Panel[4];
        Label[] statoStrumento = new Label[4];

        /// <summary>
        /// I Drive del computer con cui confrontare quello scelto; null = cercarli
        /// davvero. Serve alle prove, che ci mettono cartelle finte invece di
        /// guardare i Drive veri.
        /// </summary>
        List<DriveTrovato> driviDiProva = null;

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
                string altroDrive = "";
                if (!questo.ConModelli && !questo.ConAnni)
                {
                    foreach (DriveTrovato d in (driviDiProva != null ? driviDiProva : Stato.DriviPossibili()))
                    {
                        if (string.Equals(d.Percorso, S.Drive, StringComparison.OrdinalIgnoreCase)) continue;
                        if (!d.ConModelli && !d.ConAnni) continue;
                        altroDrive = d.Percorso;
                        break;
                    }
                }
                // Qui prima c'era un return: le schede Orari e Privacy e il
                // riepilogo restavano vuoti o vecchi proprio in questo caso.
                if (altroDrive != "")
                {
                    statoStrumento[1].Text = "Sto guardando " + S.Drive + ", dove non c'e' MODELLI.\r\n" +
                        "Il Drive della scuola sembra " + altroDrive + ": apri Cartelle e cambialo.";
                    statoStrumento[1].Tag = Ruolo.Avviso;
                }
                else
                {
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
}
