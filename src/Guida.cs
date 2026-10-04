// ============================================================================
//  LE GUIDE PASSO PASSO
//  Ogni strumento (Posta, Cartelle, Orari, Privacy) ha come ultimo passo una
//  guida per chi col computer non ha dimestichezza: che cosa fare, un passo
//  alla volta, nei vari casi e per ogni funzione dei suoi script. Il testo sta
//  in src/risorse/Guida_*.txt, scritto in un formato semplice (GuidaLetta); qui
//  si legge, si mostra nella pagina (PannelloGuida) e si salva in PDF
//  (PdfGuida, senza librerie: i caratteri standard di ogni lettore PDF).
// ============================================================================
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace Campanella
{
    /// <summary>Che cosa e' un pezzo della guida.</summary>
    enum TipoBlocco { Titolo, Sezione, Sottosezione, Paragrafo, Passo, Punto, Attenzione, Consiglio }

    /// <summary>Un pezzo della guida: un titolo, un paragrafo, un passo numerato, un punto, un riquadro.</summary>
    class BloccoGuida
    {
        public TipoBlocco Tipo;
        /// <summary>Il numero di un passo, come e' scritto ("1.").</summary>
        public string Numero = "";
        /// <summary>Il testo, con **grassetto** dentro.</summary>
        public string Testo = "";
    }

    /// <summary>Un pezzo di riga, in grassetto o no.</summary>
    class PezzoTesto
    {
        public string Testo = "";
        public bool Grassetto;
    }

    /// <summary>
    /// Una guida letta dal suo testo. Il formato, una riga alla volta:
    ///   # Titolo                     il titolo della guida (uno solo, in cima)
    ///   ## Sezione / ### Sottosezione
    ///   1. testo                     un passo numerato (continua sulle righe che cominciano con spazi)
    ///   - testo                      un punto di un elenco (idem)
    ///   ! testo                      il riquadro "Attenzione" (idem)
    ///   ? testo                      il riquadro "Consiglio" (idem)
    ///   altre righe                  un paragrafo; una riga vuota lo chiude
    /// Dentro una riga, **parole** sono in grassetto.
    /// </summary>
    class GuidaLetta
    {
        public string Titolo = "";
        public readonly List<BloccoGuida> Blocchi = new List<BloccoGuida>();

        public static GuidaLetta Leggi(string testo)
        {
            GuidaLetta g = new GuidaLetta();
            BloccoGuida aperto = null;
            foreach (string grezza in (testo ?? "").Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
            {
                string riga = grezza.TrimEnd();
                string t = riga.TrimStart();
                if (t == "") { aperto = null; continue; }
                BloccoGuida b = null;
                if (t.StartsWith("### ")) b = Nuovo(TipoBlocco.Sottosezione, t.Substring(4));
                else if (t.StartsWith("## ")) b = Nuovo(TipoBlocco.Sezione, t.Substring(3));
                else if (t.StartsWith("# ")) b = Nuovo(TipoBlocco.Titolo, t.Substring(2));
                else if (t.StartsWith("- ") && riga == t) b = Nuovo(TipoBlocco.Punto, t.Substring(2));
                else if (t.StartsWith("! ") && riga == t) b = Nuovo(TipoBlocco.Attenzione, t.Substring(2));
                else if (t.StartsWith("? ") && riga == t) b = Nuovo(TipoBlocco.Consiglio, t.Substring(2));
                else if (riga == t)
                {
                    int p = 0;
                    while (p < t.Length && char.IsDigit(t[p])) p++;
                    if (p > 0 && p < t.Length - 1 && t[p] == '.' && t[p + 1] == ' ')
                    {
                        b = Nuovo(TipoBlocco.Passo, t.Substring(p + 2));
                        b.Numero = t.Substring(0, p + 1);
                    }
                }
                if (b != null)
                {
                    if (b.Tipo == TipoBlocco.Titolo && g.Titolo == "") g.Titolo = b.Testo;
                    g.Blocchi.Add(b);
                    // i titoli stanno su una riga: quella dopo comincia un paragrafo
                    aperto = (b.Tipo == TipoBlocco.Titolo || b.Tipo == TipoBlocco.Sezione ||
                              b.Tipo == TipoBlocco.Sottosezione) ? null : b;
                    continue;
                }
                // una riga che continua quella prima (anche rientrata), o un paragrafo nuovo
                if (aperto != null) aperto.Testo += " " + t;
                else
                {
                    aperto = Nuovo(TipoBlocco.Paragrafo, t);
                    g.Blocchi.Add(aperto);
                }
            }
            return g;
        }

        static BloccoGuida Nuovo(TipoBlocco tipo, string testo)
        {
            BloccoGuida b = new BloccoGuida();
            b.Tipo = tipo;
            b.Testo = testo.Trim();
            return b;
        }

        /// <summary>La guida di uno strumento, dalle risorse ("Guida_Posta.txt").</summary>
        public static GuidaLetta DallaRisorsa(string nome)
        {
            return Leggi(Guscio.LeggiRisorsa(nome));
        }

        /// <summary>I pezzi di un testo: fuori e dentro i ** (un ** senza l'altro resta com'e').</summary>
        public static List<PezzoTesto> Pezzi(string testo)
        {
            List<PezzoTesto> fuori = new List<PezzoTesto>();
            string t = testo ?? "";
            int i = 0;
            bool grassetto = false;
            while (i < t.Length)
            {
                int j = t.IndexOf("**", i, StringComparison.Ordinal);
                // l'ultimo ** aperto senza chiusura: il resto e' testo normale, asterischi compresi
                if (j < 0 || (!grassetto && t.IndexOf("**", j + 2, StringComparison.Ordinal) < 0))
                {
                    Aggiungi(fuori, (grassetto ? "**" : "") + t.Substring(i), false);
                    break;
                }
                Aggiungi(fuori, t.Substring(i, j - i), grassetto);
                grassetto = !grassetto;
                i = j + 2;
            }
            return fuori;
        }

        static void Aggiungi(List<PezzoTesto> pezzi, string testo, bool grassetto)
        {
            if (testo == "") return;
            PezzoTesto p = new PezzoTesto();
            p.Testo = testo;
            p.Grassetto = grassetto;
            pezzi.Add(p);
        }

        /// <summary>Il testo senza i ** (per l'indice e per le prove).</summary>
        public static string Semplice(string testo)
        {
            StringBuilder sb = new StringBuilder();
            foreach (PezzoTesto p in Pezzi(testo)) sb.Append(p.Testo);
            return sb.ToString();
        }
    }

    // =======================================================================
    //  LA GUIDA NELLA PAGINA
    // =======================================================================
    /// <summary>
    /// L'ultimo passo di uno strumento: la guida da leggere, con "Vai a" per
    /// saltare a una sezione e "Salva in PDF..." per tenerla o stamparla.
    /// Il testo sta in una casella di sola lettura che va a capo da sola e si
    /// puo' copiare; cambiando tema si ricolora.
    /// </summary>
    class PannelloGuida : Panel
    {
        readonly string risorsa, strumento;
        readonly GuidaLetta guida;
        readonly RichTextBox testo;
        readonly ComboBox cmbVaiA;
        readonly Button btnPdf;
        readonly Label spiega, lblVaiA;
        readonly List<int> inizioSezioni = new List<int>();
        Color sfondoRiempito = Color.Empty;
        // vero mentre Riempi cambia "Vai a": la guida non deve saltare
        bool riempiendo = false;

        /// <param name="risorsa">il file della guida fra le risorse ("Guida_Posta.txt")</param>
        /// <param name="strumento">il nome dello strumento, per il file PDF ("Posta")</param>
        public PannelloGuida(string risorsa, string strumento)
        {
            this.risorsa = risorsa;
            this.strumento = strumento;
            guida = GuidaLetta.DallaRisorsa(risorsa);

            Size = new Size(880, 560);
            spiega = Tema.Testo1(
                "Tutto quello che serve, un passo alla volta: che cosa fare la prima volta, che cosa fa ogni " +
                "funzione degli script e che cosa fare nei casi che capitano. Puoi salvarla in PDF per leggerla " +
                "con calma o stamparla.", 0, 0, 640, Tema.Normale, Ruolo.Tenue);
            Controls.Add(spiega);
            btnPdf = Tema.BottonePrincipale("Salva in PDF...", 700, 0, 170, delegate { SalvaPdf(); });
            btnPdf.AccessibleName = "Salva la guida in PDF";
            Controls.Add(btnPdf);

            lblVaiA = Tema.Testo1("Vai a", 0, 0, 0, Tema.Normale, Ruolo.Normale);
            Controls.Add(lblVaiA);
            cmbVaiA = new ComboBox();
            cmbVaiA.Width = 460;
            cmbVaiA.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbVaiA.Font = Tema.Normale;
            cmbVaiA.MaxDropDownItems = 20;
            cmbVaiA.AccessibleName = "Vai a una sezione della guida";
            cmbVaiA.SelectedIndexChanged += delegate { if (!riempiendo) VaiA(cmbVaiA.SelectedIndex); };
            Controls.Add(cmbVaiA);

            testo = new RichTextBox();
            testo.ReadOnly = true;
            testo.BorderStyle = BorderStyle.None;
            testo.DetectUrls = false;
            testo.ScrollBars = RichTextBoxScrollBars.Vertical;
            testo.WordWrap = true;
            testo.ShortcutsEnabled = true;
            testo.AccessibleName = "Guida: " + guida.Titolo;
            Controls.Add(testo);
            Disponi();
            Resize += delegate { Disponi(); };
        }

        /// <summary>La spiegazione a sinistra del bottone, sotto "Vai a", e la guida in tutto il resto.</summary>
        void Disponi()
        {
            int w = Math.Max(420, ClientSize.Width);
            btnPdf.Location = new Point(w - btnPdf.Width, 0);
            spiega.Width = Math.Max(200, btnPdf.Left - 20);
            spiega.Height = Tema.AltezzaTesto(spiega.Text, spiega.Font, spiega.Width);
            int y = Math.Max(spiega.Bottom, btnPdf.Bottom) + 12;
            lblVaiA.Location = new Point(0, y + 4);
            cmbVaiA.Location = new Point(56, y);
            cmbVaiA.Width = Math.Min(460, w - 56);
            y = cmbVaiA.Bottom + 10;
            testo.Bounds = new Rectangle(0, y, w, Math.Max(120, ClientSize.Height - y));
        }

        /// <summary>La guida letta (per le prove).</summary>
        public GuidaLetta Guida { get { return guida; } }
        /// <summary>La casella del testo (per le prove).</summary>
        public RichTextBox Casella { get { return testo; } }
        /// <summary>"Vai a" (per le prove).</summary>
        public ComboBox VaiAQui { get { return cmbVaiA; } }

        /// <summary>Il tema e' cambiato (Tema.Applica da' allo sfondo il colore nuovo): la guida si ricolora.</summary>
        protected override void OnBackColorChanged(EventArgs e)
        {
            base.OnBackColorChanged(e);
            if (BackColor != sfondoRiempito) Riempi();
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            if (sfondoRiempito == Color.Empty) Riempi();
        }

        static readonly Font FTitolo = new Font("Segoe UI", 17f, FontStyle.Bold);
        static readonly Font FSezione = new Font("Segoe UI", 14f, FontStyle.Bold);
        static readonly Font FSotto = new Font("Segoe UI", 11.5f, FontStyle.Bold);
        static readonly Font FTesto = new Font("Segoe UI", 10.5f);
        static readonly Font FGrassetto = new Font("Segoe UI", 10.5f, FontStyle.Bold);
        static readonly Font FSpazio = new Font("Segoe UI", 4f);

        /// <summary>Scrive la guida nella casella, con i colori del tema di adesso.</summary>
        public void Riempi()
        {
            sfondoRiempito = BackColor;
            testo.BackColor = Tema.Sfondo;
            int primo = testo.IsHandleCreated ? testo.GetCharIndexFromPosition(new Point(4, 4)) : 0;
            testo.SuspendLayout();
            testo.Clear();
            inizioSezioni.Clear();
            List<string> voci = new List<string>();
            Color ambraSfondo = Tema.Mescola(Tema.Sfondo, Tema.Ambra, 0.16);
            Color verdeSfondo = Tema.Mescola(Tema.Sfondo, Tema.Verde, 0.14);
            BloccoGuida prima = null;
            foreach (BloccoGuida b in guida.Blocchi)
            {
                // un po' di spazio fra i pezzi: piu' prima di una sezione, niente fra passi e punti di fila
                bool diFila = prima != null && prima.Tipo == b.Tipo && (b.Tipo == TipoBlocco.Passo || b.Tipo == TipoBlocco.Punto);
                if (prima != null && !diFila)
                    Scrivi(b.Tipo == TipoBlocco.Sezione ? "\n\n" : "\n", FSpazio, Tema.Testo, Color.Empty, 0, 0);
                switch (b.Tipo)
                {
                    case TipoBlocco.Titolo:
                        Scrivi(GuidaLetta.Semplice(b.Testo) + "\n", FTitolo, Tema.Testo, Color.Empty, 0, 0);
                        break;
                    case TipoBlocco.Sezione:
                        inizioSezioni.Add(testo.TextLength);
                        voci.Add(GuidaLetta.Semplice(b.Testo));
                        Scrivi(GuidaLetta.Semplice(b.Testo) + "\n", FSezione, Tema.Accento, Color.Empty, 0, 0);
                        break;
                    case TipoBlocco.Sottosezione:
                        inizioSezioni.Add(testo.TextLength);
                        voci.Add("     " + GuidaLetta.Semplice(b.Testo));
                        Scrivi(GuidaLetta.Semplice(b.Testo) + "\n", FSotto, Tema.Testo, Color.Empty, 0, 0);
                        break;
                    case TipoBlocco.Paragrafo:
                        Riga("", b.Testo, Tema.Testo, Color.Empty, 0, 0);
                        break;
                    case TipoBlocco.Passo:
                        Riga(b.Numero + "\t", b.Testo, Tema.Testo, Color.Empty, 8, 30);
                        break;
                    case TipoBlocco.Punto:
                        Riga("•\t", b.Testo, Tema.Testo, Color.Empty, 8, 22);
                        break;
                    case TipoBlocco.Attenzione:
                        Riga("Attenzione: ", b.Testo, Tema.Testo, ambraSfondo, 8, 0);
                        break;
                    case TipoBlocco.Consiglio:
                        Riga("Consiglio: ", b.Testo, Tema.Testo, verdeSfondo, 8, 0);
                        break;
                }
                prima = b;
            }
            testo.Select(0, 0);
            testo.ResumeLayout();
            riempiendo = true;
            try
            {
                int scelta = cmbVaiA.SelectedIndex;
                cmbVaiA.BeginUpdate();
                cmbVaiA.Items.Clear();
                foreach (string v in voci) cmbVaiA.Items.Add(v);
                cmbVaiA.EndUpdate();
                // "Vai a" mostra una sezione anche prima della prima scelta
                if (cmbVaiA.Items.Count > 0) cmbVaiA.SelectedIndex = (scelta >= 0 && scelta < cmbVaiA.Items.Count) ? scelta : 0;
            }
            finally { riempiendo = false; }
            // dopo un cambio di tema si resta dove si era
            if (primo > 0 && primo < testo.TextLength)
            {
                testo.Select(primo, 0);
                testo.ScrollToCaret();
            }
        }

        /// <summary>Una riga della guida: l'inizio (numero, pallino, "Attenzione:") in grassetto, poi il testo con i suoi grassetti.</summary>
        void Riga(string inizio, string t, Color colore, Color sfondo, int rientro, int appeso)
        {
            Color c = Tema.Testo;
            if (inizio == "Attenzione: ") c = Tema.Ambra;
            else if (inizio == "Consiglio: ") c = Tema.Verde;
            else if (inizio != "") c = Tema.Accento;
            if (inizio != "") Scrivi(inizio, FGrassetto, c, sfondo, rientro, appeso);
            foreach (PezzoTesto p in GuidaLetta.Pezzi(t))
                Scrivi(p.Testo, p.Grassetto ? FGrassetto : FTesto, colore, sfondo, rientro, appeso);
            Scrivi("\n", FTesto, colore, sfondo, rientro, appeso);
        }

        void Scrivi(string s, Font f, Color colore, Color sfondo, int rientro, int appeso)
        {
            testo.SelectionStart = testo.TextLength;
            testo.SelectionLength = 0;
            testo.SelectionFont = f;
            testo.SelectionColor = colore;
            testo.SelectionBackColor = (sfondo == Color.Empty) ? Tema.Sfondo : sfondo;
            testo.SelectionIndent = rientro;
            testo.SelectionHangingIndent = appeso;
            testo.SelectionTabs = appeso > 0 ? new int[] { rientro + appeso } : new int[0];
            testo.AppendText(s);
        }

        void VaiA(int i)
        {
            if (i < 0 || i >= inizioSezioni.Count) return;
            // in fondo e poi alla sezione: cosi' la sezione finisce in cima alla casella
            testo.Select(testo.TextLength, 0);
            testo.ScrollToCaret();
            testo.Select(inizioSezioni[i], 0);
            testo.ScrollToCaret();
            testo.Focus();
        }

        /// <summary>Il nome proposto per il PDF: "Campanella - Guida alla Posta.pdf".</summary>
        public string NomeFilePdf()
        {
            string t = guida.Titolo != "" ? guida.Titolo : "Guida " + strumento;
            foreach (char c in Path.GetInvalidFileNameChars()) t = t.Replace(c, '-');
            return "Campanella - " + t + ".pdf";
        }

        void SalvaPdf()
        {
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.Title = "Salva la guida in PDF";
                d.Filter = "Documento PDF (*.pdf)|*.pdf";
                d.FileName = NomeFilePdf();
                d.InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                d.OverwritePrompt = true;
                if (d.ShowDialog(FindForm()) != DialogResult.OK) return;
                try
                {
                    File.WriteAllBytes(d.FileName, PdfGuida.Crea(guida, "Campanella - " + strumento));
                }
                catch (Exception ex)
                {
                    MessageBox.Show(FindForm(), "Non riesco a salvare il PDF:\n" + d.FileName + "\n\n" + ex.Message +
                                    "\n\nProva in un'altra cartella, per esempio Documenti.", "Guida in PDF",
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (MessageBox.Show(FindForm(), "La guida e' salvata in:\n" + d.FileName + "\n\nLa apro adesso?",
                                    "Guida in PDF", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    Guscio.Apri(d.FileName);
            }
        }
    }

    // =======================================================================
    //  LA GUIDA IN PDF
    // =======================================================================
    /// <summary>
    /// La guida in un PDF A4, scritto a mano: Helvetica e Helvetica-Bold, che
    /// ogni lettore PDF ha, con la codifica di Windows (WinAnsi), quindi
    /// niente da incorporare. Titoli, paragrafi che vanno a capo, passi
    /// numerati e punti con il rientro, riquadri colorati per "Attenzione" e
    /// "Consiglio", un titolo non resta da solo in fondo a una pagina, e in
    /// fondo a ogni pagina il nome della guida e "pagina N di M". Lo stesso
    /// testo da' sempre lo stesso file (niente data dentro).
    /// </summary>
    static class PdfGuida
    {
        const float Larga = 595.28f, Alta = 841.89f;
        const float Sinistra = 62f, Destra = 62f, Sopra = 64f, Sotto = 70f;
        static readonly Encoding WinAnsi = Encoding.GetEncoding(1252);

        // le larghezze dei caratteri (millesimi della dimensione) dalle metriche
        // Adobe di Helvetica e Helvetica-Bold, da 32 a 126; i caratteri oltre
        // sono nel metodo Larghezza
        static readonly int[] Normale =
        {
            278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
            556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
            1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
            667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
            333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
            556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
        };
        static readonly int[] Grassetto =
        {
            278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
            556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
            975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
            667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
            333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
            611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
        };

        /// <summary>La larghezza di un carattere in millesimi; le lettere accentate come la loro lettera.</summary>
        static int Larghezza(char c, bool grassetto)
        {
            int[] t = grassetto ? Grassetto : Normale;
            if (c >= 32 && c <= 126) return t[c - 32];
            switch (c)
            {
                case '•': return 350;                       // pallino
                case '–': return 556;                       // trattino medio
                case '—': case '…': case '‰': return 1000;
                case '‘': case '’': return grassetto ? 278 : 222;
                case '“': case '”': return grassetto ? 500 : 333;
                case '«': case '»': case '€': return 556;
                case '°': return 400;
                case ' ': return 278;
            }
            string senza = SenzaAccento(c);
            if (senza.Length == 1 && senza[0] >= 32 && senza[0] <= 126) return t[senza[0] - 32];
            return 556;
        }

        static string SenzaAccento(char c)
        {
            string d = c.ToString().Normalize(NormalizationForm.FormD);
            StringBuilder sb = new StringBuilder();
            foreach (char x in d)
                if (CharUnicodeInfo.GetUnicodeCategory(x) != UnicodeCategory.NonSpacingMark) sb.Append(x);
            return sb.ToString();
        }

        /// <summary>Un carattere che WinAnsi non ha diventa la sua lettera senza accento, o "?".</summary>
        static string Scrivibile(string s)
        {
            StringBuilder sb = new StringBuilder();
            foreach (char c in s ?? "")
            {
                if (c == '\t') { sb.Append(' '); continue; }
                string uno = c.ToString();
                if (WinAnsi.GetString(WinAnsi.GetBytes(uno)) == uno) { sb.Append(c); continue; }
                string senza = SenzaAccento(c);
                sb.Append(senza != "" && WinAnsi.GetString(WinAnsi.GetBytes(senza)) == senza ? senza : "?");
            }
            return sb.ToString();
        }

        static float Misura(string s, bool grassetto, float corpo)
        {
            int m = 0;
            foreach (char c in s) m += Larghezza(c, grassetto);
            return m * corpo / 1000f;
        }

        /// <summary>Una parola da mettere in riga, con il suo carattere.</summary>
        class Parola
        {
            public string Testo;
            public bool Grassetto;
            public bool SpazioPrima;
        }

        /// <summary>Un pezzo di riga gia' a posto: dove comincia, il testo, il carattere.</summary>
        class Pezzo
        {
            public float X;
            public string Testo;
            public bool Grassetto;
        }

        /// <summary>Una riga di una pagina: i suoi pezzi, il corpo, il colore, e a che altezza sta la sua base.</summary>
        class Riga
        {
            public List<Pezzo> Pezzi = new List<Pezzo>();
            public float Corpo, Interlinea;
            public string Colore = "0.13 0.13 0.13";
        }

        /// <summary>Le parole di un testo con i suoi grassetti (e un inizio in grassetto, come "1." o "Attenzione:").</summary>
        static List<Parola> Parole(string inizio, string testo, bool tuttoGrassetto)
        {
            List<Parola> fuori = new List<Parola>();
            List<PezzoTesto> pezzi = new List<PezzoTesto>();
            if (inizio != "")
            {
                PezzoTesto p = new PezzoTesto();
                p.Testo = inizio + " ";
                p.Grassetto = true;
                pezzi.Add(p);
            }
            pezzi.AddRange(GuidaLetta.Pezzi(testo));
            bool spazio = false;
            foreach (PezzoTesto p in pezzi)
            {
                string t = Scrivibile(p.Testo);
                int i = 0;
                while (i < t.Length)
                {
                    if (t[i] == ' ') { spazio = true; i++; continue; }
                    int j = t.IndexOf(' ', i);
                    if (j < 0) j = t.Length;
                    Parola w = new Parola();
                    w.Testo = t.Substring(i, j - i);
                    w.Grassetto = p.Grassetto || tuttoGrassetto;
                    w.SpazioPrima = spazio && fuori.Count > 0;
                    fuori.Add(w);
                    spazio = false;
                    i = j;
                }
            }
            return fuori;
        }

        /// <summary>Le righe di un testo: cominciano tutte da x0 e sono larghe al massimo larga.</summary>
        static List<Riga> VaACapo(List<Parola> parole, float corpo, float interlinea, float x0, float larga)
        {
            List<Riga> righe = new List<Riga>();
            Riga r = NuovaRiga(righe, corpo, interlinea);
            float x = 0;
            foreach (Parola w in parole)
            {
                string t = w.Testo;
                float sp = (w.SpazioPrima && r.Pezzi.Count > 0) ? Misura(" ", w.Grassetto, corpo) : 0;
                float lw = Misura(t, w.Grassetto, corpo);
                if (r.Pezzi.Count > 0 && x + sp + lw > larga)
                {
                    r = NuovaRiga(righe, corpo, interlinea);
                    x = 0; sp = 0;
                }
                // una parola piu' lunga di una riga intera si spezza
                while (lw > larga && t.Length > 1)
                {
                    int n = t.Length - 1;
                    while (n > 1 && Misura(t.Substring(0, n), w.Grassetto, corpo) > larga) n--;
                    MettiInRiga(r, x0, t.Substring(0, n), w.Grassetto, false);
                    t = t.Substring(n);
                    lw = Misura(t, w.Grassetto, corpo);
                    r = NuovaRiga(righe, corpo, interlinea);
                    x = 0;
                }
                MettiInRiga(r, x0 + x + sp, t, w.Grassetto, sp > 0);
                x += sp + lw;
            }
            return righe;
        }

        static Riga NuovaRiga(List<Riga> righe, float corpo, float interlinea)
        {
            Riga r = new Riga();
            r.Corpo = corpo;
            r.Interlinea = interlinea;
            righe.Add(r);
            return r;
        }

        /// <summary>
        /// Una parola in fondo alla riga: con lo stesso carattere del pezzo
        /// prima ci si aggiunge (con lo spazio), se no e' un pezzo nuovo che
        /// comincia in x.
        /// </summary>
        static void MettiInRiga(Riga r, float x, string t, bool grassetto, bool spazio)
        {
            Pezzo ultimo = r.Pezzi.Count > 0 ? r.Pezzi[r.Pezzi.Count - 1] : null;
            if (ultimo != null && ultimo.Grassetto == grassetto)
            {
                ultimo.Testo += (spazio ? " " : "") + t;
                return;
            }
            Pezzo p = new Pezzo();
            p.X = x;
            p.Testo = t;
            p.Grassetto = grassetto;
            r.Pezzi.Add(p);
        }

        /// <summary>Un pezzo della guida pronto da impaginare: le sue righe, lo spazio prima e dopo, un riquadro.</summary>
        class Pacco
        {
            public List<Riga> Righe = new List<Riga>();
            public float Prima, Dopo;
            public string Riquadro = "";     // colore di fondo del riquadro, "" se non ce l'ha
            public string Barra = "";        // colore della barra a sinistra del riquadro
            public bool TieniColDopo;        // un titolo: non resta da solo in fondo alla pagina
            public float Altezza()
            {
                float h = 0;
                foreach (Riga r in Righe) h += r.Interlinea;
                return h;
            }
        }

        /// <summary>Il PDF della guida; piede e' il nome in fondo a ogni pagina ("Campanella - Posta").</summary>
        public static byte[] Crea(GuidaLetta g, string piede)
        {
            float larga = Larga - Sinistra - Destra;
            List<Pacco> pacchi = new List<Pacco>();
            BloccoGuida prima = null;
            foreach (BloccoGuida b in g.Blocchi)
            {
                Pacco p = new Pacco();
                bool diFila = prima != null && prima.Tipo == b.Tipo && (b.Tipo == TipoBlocco.Passo || b.Tipo == TipoBlocco.Punto);
                switch (b.Tipo)
                {
                    case TipoBlocco.Titolo:
                        p.Righe = VaACapo(Parole("", b.Testo, true), 21f, 27f, Sinistra, larga);
                        p.Dopo = 10f; p.TieniColDopo = true;
                        foreach (Riga r in p.Righe) r.Colore = "0.08 0.08 0.08";
                        break;
                    case TipoBlocco.Sezione:
                        p.Righe = VaACapo(Parole("", b.Testo, true), 15f, 20f, Sinistra, larga);
                        p.Prima = 16f; p.Dopo = 4f; p.TieniColDopo = true;
                        foreach (Riga r in p.Righe) r.Colore = "0.10 0.30 0.60";
                        break;
                    case TipoBlocco.Sottosezione:
                        p.Righe = VaACapo(Parole("", b.Testo, true), 12.5f, 17f, Sinistra, larga);
                        p.Prima = 10f; p.Dopo = 2f; p.TieniColDopo = true;
                        break;
                    case TipoBlocco.Paragrafo:
                        p.Righe = VaACapo(Parole("", b.Testo, false), 11f, 15.5f, Sinistra, larga);
                        p.Prima = 5f;
                        break;
                    case TipoBlocco.Passo:
                    {
                        float rientro = 24f;
                        p.Righe = VaACapo(Parole("", b.Testo, false), 11f, 15.5f, Sinistra + rientro, larga - rientro);
                        Pezzo n = new Pezzo();
                        n.X = Sinistra + 4; n.Testo = Scrivibile(b.Numero); n.Grassetto = true;
                        p.Righe[0].Pezzi.Insert(0, n);
                        p.Prima = diFila ? 3f : 6f;
                        break;
                    }
                    case TipoBlocco.Punto:
                    {
                        float rientro = 20f;
                        p.Righe = VaACapo(Parole("", b.Testo, false), 11f, 15.5f, Sinistra + rientro, larga - rientro);
                        Pezzo n = new Pezzo();
                        n.X = Sinistra + 6; n.Testo = "•"; n.Grassetto = true;
                        p.Righe[0].Pezzi.Insert(0, n);
                        p.Prima = diFila ? 2f : 5f;
                        break;
                    }
                    case TipoBlocco.Attenzione:
                    case TipoBlocco.Consiglio:
                    {
                        bool att = b.Tipo == TipoBlocco.Attenzione;
                        float dentro = 14f;
                        p.Righe = VaACapo(Parole(att ? "Attenzione:" : "Consiglio:", b.Testo, false), 11f, 15.5f,
                                          Sinistra + dentro, larga - 2 * dentro);
                        p.Prima = 9f; p.Dopo = 4f;
                        p.Riquadro = att ? "1 0.95 0.84" : "0.90 0.97 0.91";
                        p.Barra = att ? "0.85 0.55 0.05" : "0.20 0.60 0.30";
                        break;
                    }
                }
                pacchi.Add(p);
                prima = b;
            }

            // le pagine: ogni pacco dove c'e' posto
            List<StringBuilder> pagine = new List<StringBuilder>();
            StringBuilder pg = null;
            float y = 0;
            float fondo = Sotto;
            for (int i = 0; i < pacchi.Count; i++)
            {
                Pacco p = pacchi[i];
                float serve = p.Prima + Math.Min(p.Altezza(), 3 * 15.5f);
                if (p.TieniColDopo && i + 1 < pacchi.Count)
                    serve += pacchi[i + 1].Prima + Math.Min(pacchi[i + 1].Altezza(), 2 * 15.5f) + p.Altezza();
                if (pg == null || y - serve < fondo)
                {
                    pg = new StringBuilder();
                    pagine.Add(pg);
                    y = Alta - Sopra;
                }
                else y -= p.Prima;
                // le righe: un riquadro che passa alla pagina dopo si chiude e si riapre
                int k = 0;
                while (k < p.Righe.Count)
                {
                    int da = k;
                    float h = 0;
                    while (k < p.Righe.Count && (y - h - p.Righe[k].Interlinea >= fondo || k == da))
                    {
                        h += p.Righe[k].Interlinea;
                        k++;
                    }
                    if (p.Riquadro != "")
                    {
                        float pad = 6f;
                        pg.Append(p.Riquadro).Append(" rg ")
                          .Append(N(Sinistra)).Append(' ').Append(N(y - h - pad)).Append(' ')
                          .Append(N(larga)).Append(' ').Append(N(h + 2 * pad - 2)).Append(" re f\n");
                        pg.Append(p.Barra).Append(" rg ")
                          .Append(N(Sinistra)).Append(' ').Append(N(y - h - pad)).Append(' ')
                          .Append("3.5 ").Append(N(h + 2 * pad - 2)).Append(" re f\n");
                    }
                    float base1 = y;
                    for (int r = da; r < k; r++)
                    {
                        Riga riga = p.Righe[r];
                        base1 -= riga.Interlinea;
                        float linea = base1 + (riga.Interlinea - riga.Corpo) * 0.35f;
                        Testo(pg, riga, linea);
                    }
                    y -= h;
                    if (k < p.Righe.Count)
                    {
                        pg = new StringBuilder();
                        pagine.Add(pg);
                        y = Alta - Sopra;
                    }
                }
                y -= p.Dopo;
            }
            if (pagine.Count == 0) pagine.Add(new StringBuilder());

            // il piede di ogni pagina
            for (int i = 0; i < pagine.Count; i++)
            {
                StringBuilder s = pagine[i];
                s.Append("0.75 0.75 0.75 RG 0.6 w ").Append(N(Sinistra)).Append(' ').Append(N(Sotto - 26))
                 .Append(" m ").Append(N(Larga - Destra)).Append(' ').Append(N(Sotto - 26)).Append(" l S\n");
                Riga sx = new Riga();
                sx.Corpo = 8.5f; sx.Colore = "0.45 0.45 0.45";
                Pezzo a = new Pezzo();
                a.X = Sinistra; a.Testo = Scrivibile(piede + (g.Titolo != "" ? " - " + g.Titolo : ""));
                sx.Pezzi.Add(a);
                string num = "pagina " + (i + 1) + " di " + pagine.Count;
                Pezzo b = new Pezzo();
                b.X = Larga - Destra - Misura(num, false, 8.5f); b.Testo = num;
                sx.Pezzi.Add(b);
                Testo(s, sx, Sotto - 40);
            }
            return Scrivi(pagine, g.Titolo);
        }

        /// <summary>Una riga di testo alla sua base: ogni pezzo al suo posto, con il suo carattere.</summary>
        static void Testo(StringBuilder s, Riga r, float y)
        {
            if (r.Pezzi.Count == 0) return;
            s.Append(r.Colore).Append(" rg BT\n");
            foreach (Pezzo p in r.Pezzi)
            {
                s.Append(p.Grassetto ? "/F2 " : "/F1 ").Append(N(r.Corpo)).Append(" Tf ")
                 .Append("1 0 0 1 ").Append(N(p.X)).Append(' ').Append(N(y)).Append(" Tm ")
                 .Append(Stringa(p.Testo)).Append(" Tj\n");
            }
            s.Append("ET\n");
        }

        static string N(float f)
        {
            return Math.Round(f, 2).ToString("0.##", CultureInfo.InvariantCulture);
        }

        /// <summary>Una stringa PDF fra parentesi, in WinAnsi: fuori dall'ASCII e le parentesi con \ e il codice ottale.</summary>
        static string Stringa(string t)
        {
            StringBuilder sb = new StringBuilder("(");
            foreach (byte b in WinAnsi.GetBytes(t))
            {
                if (b == (byte)'(' || b == (byte)')' || b == (byte)'\\') sb.Append('\\').Append((char)b);
                else if (b < 32 || b > 126) sb.Append('\\').Append(Convert.ToString(b, 8).PadLeft(3, '0'));
                else sb.Append((char)b);
            }
            return sb.Append(')').ToString();
        }

        /// <summary>Il file: catalogo, pagine, i due caratteri, le informazioni, e la tabella dei riferimenti.</summary>
        static byte[] Scrivi(List<StringBuilder> pagine, string titolo)
        {
            List<string> oggetti = new List<string>();
            int n = pagine.Count;
            // 1 catalogo, 2 pagine, 3 e 4 caratteri, 5 informazioni, poi pagina e contenuto per ogni pagina
            StringBuilder figli = new StringBuilder();
            for (int i = 0; i < n; i++) figli.Append(6 + 2 * i).Append(" 0 R ");
            oggetti.Add("<< /Type /Catalog /Pages 2 0 R >>");
            oggetti.Add("<< /Type /Pages /Kids [ " + figli + "] /Count " + n + " >>");
            oggetti.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
            oggetti.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
            oggetti.Add("<< /Title " + Stringa(Scrivibile(titolo)) + " /Creator (Campanella) /Producer (Campanella) >>");
            for (int i = 0; i < n; i++)
            {
                oggetti.Add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + N(Larga) + " " + N(Alta) + "] " +
                            "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (7 + 2 * i) + " 0 R >>");
                string c = pagine[i].ToString();
                oggetti.Add("<< /Length " + Encoding.ASCII.GetByteCount(c) + " >>\nstream\n" + c + "endstream");
            }
            MemoryStream ms = new MemoryStream();
            List<long> posti = new List<long>();
            Metti(ms, "%PDF-1.4\n%âãÏÓ\n");
            for (int i = 0; i < oggetti.Count; i++)
            {
                posti.Add(ms.Length);
                Metti(ms, (i + 1) + " 0 obj\n" + oggetti[i] + "\nendobj\n");
            }
            long xref = ms.Length;
            StringBuilder x = new StringBuilder();
            x.Append("xref\n0 ").Append(oggetti.Count + 1).Append("\n0000000000 65535 f \n");
            foreach (long p in posti) x.Append(p.ToString("0000000000")).Append(" 00000 n \n");
            x.Append("trailer\n<< /Size ").Append(oggetti.Count + 1).Append(" /Root 1 0 R /Info 5 0 R >>\n")
             .Append("startxref\n").Append(xref).Append("\n%%EOF\n");
            Metti(ms, x.ToString());
            return ms.ToArray();
        }

        /// <summary>Testo nel file, un byte per carattere (il contenuto e' gia' tutto ASCII).</summary>
        static void Metti(MemoryStream ms, string s)
        {
            byte[] b = Encoding.GetEncoding(28591).GetBytes(s);
            ms.Write(b, 0, b.Length);
        }
    }
}
