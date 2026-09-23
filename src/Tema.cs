// ===========================================================================
//  Tema.cs - colori, caratteri e fabbriche di controlli
//
//  Il tema scuro e' quello di partenza; quello chiaro si sceglie dalle
//  impostazioni. WinForms non ha un supporto nativo ai temi: i colori sono
//  variabili statiche e Tema.Applica() ripassa l'albero dei controlli
//  ricolorandoli in base al loro "ruolo" (la proprieta' Tag).
//
//  Due cose che WinForms non fa da solo e che qui si fanno a mano:
//    - il bordo delle caselle di testo (Windows lo disegna con i colori di
//      sistema, e nel tema scuro spuntava chiaro a tratti): CasellaTema lo
//      ridisegna nel colore del tema;
//    - le barre di scorrimento (sempre chiare): con il tema scuro si chiede
//      a Windows 10/11 la versione scura, la stessa di Esplora file.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Campanella
{
    /// <summary>Ruoli assegnati alla Tag dei controlli, per ricolorarli.</summary>
    static class Ruolo
    {
        public const string Titolo      = "titolo";
        public const string Sezione     = "sezione";
        public const string Sottotitolo = "sottotitolo";
        public const string Normale     = "normale";
        public const string Tenue       = "tenue";
        public const string Accento     = "accento";
        public const string Avviso      = "avviso";
        public const string Buono       = "buono";
        public const string Scheda      = "scheda";
        public const string Barra       = "barra";
        public const string Principale  = "principale";   // bottone pieno
        public const string Secondario  = "secondario";   // bottone contornato
        public const string Codice      = "codice";
        public const string Numero      = "numero";       // pallino numerato
        public const string Aiuto       = "aiuto";        // il "?" tondo che apre la spiegazione
    }

    static class Tema
    {
        public static bool Scuro = true;

        // ---- tavolozza corrente -------------------------------------------
        public static Color Sfondo, Pannello, Scheda, Bordo, Campo, CampoBordo;
        public static Color Testo, Tenue, Accento, AccentoSfondo, AccentoTesto;
        public static Color Verde, Ambra, Rosso;

        public static readonly Font Normale   = new Font("Segoe UI", 9.75f);
        public static readonly Font Piccolo   = new Font("Segoe UI", 8.75f);
        public static readonly Font Grassetto = new Font("Segoe UI", 9.75f, FontStyle.Bold);
        public static readonly Font PiccoloGrassetto = new Font("Segoe UI", 8.75f, FontStyle.Bold);
        public static readonly Font Titolo    = new Font("Segoe UI", 16f, FontStyle.Bold);
        public static readonly Font Sezione   = new Font("Segoe UI", 13.5f, FontStyle.Bold);
        public static readonly Font Sottosezione = new Font("Segoe UI", 11f, FontStyle.Bold);
        public static readonly Font Mono      = new Font("Consolas", 9.5f);

        static Tema() { Imposta(true); }

        public static void Imposta(bool scuro)
        {
            Scuro = scuro;
            if (scuro)
            {
                Sfondo        = Rgb(0x16, 0x18, 0x1D);
                Pannello      = Rgb(0x1C, 0x1F, 0x26);
                Scheda        = Rgb(0x21, 0x25, 0x2D);
                Bordo         = Rgb(0x2E, 0x33, 0x40);
                Campo         = Rgb(0x14, 0x16, 0x1B);
                CampoBordo    = Rgb(0x39, 0x40, 0x4F);
                Testo         = Rgb(0xE4, 0xE7, 0xEC);
                Tenue         = Rgb(0x9A, 0xA1, 0xAD);
                Accento       = Rgb(0x7A, 0xA2, 0xF7);
                AccentoSfondo = Rgb(0x25, 0x2E, 0x42);
                AccentoTesto  = Rgb(0x11, 0x14, 0x1A);
                Verde         = Rgb(0x7B, 0xD8, 0x8F);
                Ambra         = Rgb(0xE3, 0xB3, 0x41);
                Rosso         = Rgb(0xF0, 0x71, 0x78);
            }
            else
            {
                Sfondo        = Rgb(0xF6, 0xF8, 0xFB);
                Pannello      = Color.White;
                Scheda        = Color.White;
                Bordo         = Rgb(0xDA, 0xE0, 0xE8);
                Campo         = Color.White;
                CampoBordo    = Rgb(0xC4, 0xCC, 0xD8);
                Testo         = Rgb(0x20, 0x21, 0x24);
                Tenue         = Rgb(0x5F, 0x63, 0x68);
                Accento       = Rgb(0x1A, 0x73, 0xE8);
                AccentoSfondo = Rgb(0xE8, 0xF0, 0xFE);
                AccentoTesto  = Color.White;
                Verde         = Rgb(0x18, 0x80, 0x38);
                Ambra         = Rgb(0xB4, 0x5F, 0x06);
                Rosso         = Rgb(0xC5, 0x22, 0x1F);
            }
        }

        static Color Rgb(int r, int g, int b) { return Color.FromArgb(r, g, b); }

        // ===================================================================
        //  APPLICAZIONE DEL TEMA A UN ALBERO DI CONTROLLI
        // ===================================================================
        public static void Applica(Control radice)
        {
            if (radice == null) return;
            Colora(radice);
            foreach (Control c in radice.Controls) Applica(c);
            radice.Invalidate();
        }

        static void Colora(Control c)
        {
            string ruolo = c.Tag as string;

            // --- prima il tipo di controllo -------------------------------
            if (c is Form)
            {
                c.BackColor = Sfondo;
                c.ForeColor = Testo;
            }
            else if (c is TextBox)
            {
                TextBox t = (TextBox)c;
                if (ruolo == Ruolo.Tenue || ruolo == Ruolo.Sottotitolo)
                {
                    // testo di sola lettura usato come paragrafo
                    t.BackColor = t.Parent != null ? t.Parent.BackColor : Sfondo;
                    t.ForeColor = Tenue;
                }
                else if (ruolo == Ruolo.Normale && t.ReadOnly && t.BorderStyle == BorderStyle.None)
                {
                    t.BackColor = t.Parent != null ? t.Parent.BackColor : Sfondo;
                    t.ForeColor = Testo;
                }
                else
                {
                    t.BackColor = Campo;
                    t.ForeColor = Testo;
                }
                if (t.Multiline) Scorrimento(t);
            }
            else if (c is ComboBox)
            {
                ComboBox cb = (ComboBox)c;
                cb.FlatStyle = FlatStyle.Flat;
                cb.BackColor = Campo;
                cb.ForeColor = Testo;
            }
            else if (c is CheckedListBox)
            {
                c.BackColor = Campo;
                c.ForeColor = Testo;
                ((CheckedListBox)c).BorderStyle = BorderStyle.FixedSingle;
                Scorrimento(c);
            }
            else if (c is ListBox)
            {
                c.BackColor = Campo;
                c.ForeColor = Testo;
                Scorrimento(c);
            }
            else if (c is NumericUpDown)
            {
                c.BackColor = Campo;
                c.ForeColor = Testo;
            }
            else if (c is DataGridView)
            {
                DataGridView g = (DataGridView)c;
                g.BackgroundColor = Campo;
                g.GridColor = Bordo;
                g.DefaultCellStyle.BackColor = Campo;
                g.DefaultCellStyle.ForeColor = Testo;
                g.DefaultCellStyle.SelectionBackColor = AccentoSfondo;
                g.DefaultCellStyle.SelectionForeColor = Testo;
                g.ColumnHeadersDefaultCellStyle.BackColor = Scheda;
                g.ColumnHeadersDefaultCellStyle.ForeColor = Testo;
                g.ColumnHeadersDefaultCellStyle.SelectionBackColor = Scheda;
                g.ColumnHeadersDefaultCellStyle.SelectionForeColor = Testo;
                g.EnableHeadersVisualStyles = false;
                g.ForeColor = Testo;
                // le barre della griglia sono controlli figli, non parte della finestra
                foreach (Control figlio in g.Controls)
                    if (figlio is ScrollBar) Scorrimento(figlio);
            }
            else if (c is Button)
            {
                Button b = (Button)c;
                b.FlatStyle = FlatStyle.Flat;
                b.UseVisualStyleBackColor = false;
                if (ruolo == Ruolo.Principale)
                {
                    b.BackColor = Accento;
                    b.ForeColor = AccentoTesto;
                    b.FlatAppearance.BorderSize = 0;
                    b.FlatAppearance.MouseOverBackColor = Mescola(Accento, Testo, 0.15);
                }
                else if (ruolo == Ruolo.Barra)
                {
                    b.BackColor = Pannello;
                    b.ForeColor = Testo;
                    b.FlatAppearance.BorderSize = 0;
                    b.FlatAppearance.MouseOverBackColor = Mescola(Pannello, Accento, 0.18);
                }
                else
                {
                    b.BackColor = Scheda;
                    b.ForeColor = Testo;
                    b.FlatAppearance.BorderSize = 1;
                    b.FlatAppearance.BorderColor = CampoBordo;
                    b.FlatAppearance.MouseOverBackColor = Mescola(Scheda, Accento, 0.16);
                }
                // Un bottone spento: WinForms ne ingrigisce il testo ma lascia lo
                // sfondo, e quello principale restava pieno di colore, uguale a
                // quando funziona. Spento deve sembrare spento.
                if (!b.Enabled && ruolo != Ruolo.Barra)
                {
                    b.BackColor = Pannello;
                    b.ForeColor = Tenue;
                    b.FlatAppearance.BorderSize = 1;
                    b.FlatAppearance.BorderColor = Bordo;
                }
            }
            else if (c is CheckBox || c is RadioButton)
            {
                c.BackColor = Color.Transparent;
                c.ForeColor = (ruolo == Ruolo.Avviso) ? Ambra
                            : (ruolo == Ruolo.Buono) ? Verde
                            : (ruolo == Ruolo.Tenue) ? Tenue : Testo;
            }
            else if (c is GroupBox)
            {
                c.BackColor = Color.Transparent;
                c.ForeColor = Testo;
            }
            else if (c is Label)
            {
                c.BackColor = Color.Transparent;
                if (ruolo == Ruolo.Numero)
                {
                    c.BackColor = Accento;
                    c.ForeColor = AccentoTesto;
                }
                else if (ruolo == Ruolo.Titolo || ruolo == Ruolo.Sezione) c.ForeColor = Testo;
                else if (ruolo == Ruolo.Aiuto) c.ForeColor = Tenue;
                else if (ruolo == Ruolo.Sottotitolo || ruolo == Ruolo.Tenue) c.ForeColor = Tenue;
                else if (ruolo == Ruolo.Accento) c.ForeColor = Accento;
                else if (ruolo == Ruolo.Avviso) c.ForeColor = Ambra;
                else if (ruolo == Ruolo.Buono) c.ForeColor = Verde;
                else c.ForeColor = Testo;
            }
            else if (c is FlowLayoutPanel || c is TableLayoutPanel)
            {
                c.BackColor = Sfondo;
                c.ForeColor = Testo;
                if (((ScrollableControl)c).AutoScroll) Scorrimento(c);
            }
            else if (c is Panel)
            {
                if (ruolo == Ruolo.Scheda) c.BackColor = Scheda;
                else if (ruolo == Ruolo.Barra) c.BackColor = Pannello;
                else c.BackColor = Sfondo;
                c.ForeColor = Testo;
                if (((Panel)c).AutoScroll) Scorrimento(c);
            }

            if (ruolo == Ruolo.Codice)
            {
                c.BackColor = Campo;
                c.ForeColor = Testo;
            }
        }

        public static Color Mescola(Color a, Color b, double quanto)
        {
            return Color.FromArgb(
                (int)(a.R + (b.R - a.R) * quanto),
                (int)(a.G + (b.G - a.G) * quanto),
                (int)(a.B + (b.B - a.B) * quanto));
        }

        // ===================================================================
        //  BARRE DI SCORRIMENTO
        //  Windows 10 (dal 1809) e 11 hanno una versione scura delle barre,
        //  quella di Esplora file: si chiede con SetWindowTheme. Su Windows
        //  piu' vecchi la chiamata non fa niente e le barre restano chiare.
        // ===================================================================
        [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
        static extern int SetWindowTheme(IntPtr hWnd, string app, string idList);

        [DllImport("user32.dll")]
        static extern bool SetWindowPos(IntPtr hWnd, IntPtr dopo, int x, int y, int cx, int cy, uint flags);

        const uint SWP_FRAMECHANGED = 0x0020, SWP_NOMOVE = 0x0002, SWP_NOSIZE = 0x0001,
                   SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010;

        static readonly HashSet<Control> inAttesaDiHandle = new HashSet<Control>();

        static void Scorrimento(Control c)
        {
            if (c.IsHandleCreated) { ScorrimentoAdesso(c); return; }
            if (inAttesaDiHandle.Contains(c)) return;
            inAttesaDiHandle.Add(c);
            c.HandleCreated += delegate { ScorrimentoAdesso(c); };
            c.Disposed += delegate { inAttesaDiHandle.Remove(c); };
        }

        static void ScorrimentoAdesso(Control c)
        {
            try
            {
                SetWindowTheme(c.Handle, Scuro ? "DarkMode_Explorer" : "Explorer", null);
                SetWindowPos(c.Handle, IntPtr.Zero, 0, 0, 0, 0,
                             SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
            }
            catch (Exception) { /* Windows senza uxtheme, o senza tema scuro: pazienza */ }
        }

        // ===================================================================
        //  FABBRICHE DI CONTROLLI
        // ===================================================================
        public static Label Testo1(string testo, int x, int y, int larghezza, Font f, string ruolo)
        {
            Label l = new Label();
            l.Text = testo;
            l.Location = new Point(x, y);
            l.Font = f;
            l.Tag = ruolo;
            if (larghezza > 0)
            {
                l.AutoSize = false;
                l.Width = larghezza;
                l.Height = AltezzaTesto(testo, f, larghezza);
            }
            else l.AutoSize = true;
            return l;
        }

        /// <summary>
        /// Il "?" dentro un cerchio: un clic e si apre la spiegazione, in una
        /// bolla a tema. Serve a togliere dalle pagine i paragrafi lunghi, che
        /// le riempiono e finiscono per non essere letti.
        /// </summary>
        public static Label Aiuto(int x, int y, string titolo, string testo)
        {
            Label l = new Label();
            l.Text = "";
            l.Location = new Point(x, y);
            l.Size = new Size(17, 17);
            l.Tag = Ruolo.Aiuto;
            l.Cursor = Cursors.Hand;
            l.BackColor = Color.Transparent;
            l.Paint += delegate(object s, PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                Rectangle r = new Rectangle(0, 0, l.Width - 1, l.Height - 1);
                using (Pen p = new Pen(l.ForeColor)) e.Graphics.DrawEllipse(p, r);
                TextRenderer.DrawText(e.Graphics, "?", PiccoloGrassetto, r, l.ForeColor,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            };
            l.Click += delegate { Bolla.Mostra(l, titolo, testo); };
            return l;
        }

        /// <summary>
        /// Un titolo in grassetto con il "?" subito dopo: il modo normale di
        /// mettere una spiegazione lunga senza farla stare sulla pagina.
        /// </summary>
        public static Label TitoloAiuto(Control dove, string testo, int x, int y,
                                        string titolo, string spiegazione)
        {
            return RigaAiuto(dove, testo, x, y, Grassetto, Ruolo.Normale, titolo, spiegazione);
        }

        /// <summary>
        /// Una riga di testo con il "?" attaccato subito dopo: il "?" lontano
        /// dalla frase a cui si riferisce non si capisce a cosa serva.
        /// </summary>
        public static Label RigaAiuto(Control dove, string testo, int x, int y, Font f,
                                      string ruolo, string titolo, string spiegazione)
        {
            Label l = Testo1(testo, x, y, 0, f, ruolo);
            dove.Controls.Add(l);
            Size s = TextRenderer.MeasureText(testo, f);
            dove.Controls.Add(Aiuto(x + s.Width + 8, y + 2, titolo, spiegazione));
            return l;
        }

        public static int AltezzaTesto(string testo, Font f, int larghezza)
        {
            // TextRenderer misura come disegna la Label (GDI), a differenza di
            // Graphics.MeasureString che usa GDI+ e sbaglia di una riga
            Size s = TextRenderer.MeasureText(testo, f,
                        new Size(larghezza, int.MaxValue), TextFormatFlags.WordBreak);
            return s.Height + 6;
        }

        public static Button Bottone(string testo, int x, int y, int w, EventHandler click)
        {
            Button b = new Button();
            b.Text = testo;
            b.Location = new Point(x, y);
            b.Size = new Size(w, 30);
            b.Font = Normale;
            b.Tag = Ruolo.Secondario;
            b.Cursor = Cursors.Hand;
            if (click != null) b.Click += click;
            // acceso o spento cambia i colori: vanno rifatti ogni volta
            b.EnabledChanged += delegate { Colora(b); b.Invalidate(); };
            // Spento, WinForms il testo lo disegna da se', ignorando ForeColor: con
            // lo sfondo scuro diventava nero su quasi nero. Lo ridisegno io, nel
            // grigio del tema. Paint arriva dopo il disegno di WinForms, quindi sopra.
            b.Paint += delegate(object s, PaintEventArgs e)
            {
                if (b.Enabled || (b.Tag as string) == Ruolo.Barra) return;
                int bordo = b.FlatAppearance.BorderSize;
                Rectangle r = new Rectangle(bordo, bordo, b.Width - 2 * bordo, b.Height - 2 * bordo);
                using (SolidBrush fondo = new SolidBrush(b.BackColor)) e.Graphics.FillRectangle(fondo, r);
                TextRenderer.DrawText(e.Graphics, b.Text, b.Font, r, Tenue,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter |
                    TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix);
            };
            return b;
        }

        public static Button BottonePrincipale(string testo, int x, int y, int w, EventHandler click)
        {
            Button b = Bottone(testo, x, y, w, click);
            b.Height = 34;
            b.Font = Grassetto;
            b.Tag = Ruolo.Principale;
            return b;
        }

        public static CasellaTema Casella(int x, int y, int w)
        {
            CasellaTema t = new CasellaTema();
            t.Location = new Point(x, y);
            t.Width = w;
            t.Font = Normale;
            t.BorderStyle = BorderStyle.FixedSingle;
            return t;
        }

        public static CasellaTema Casella(int x, int y, int w, string segnaposto)
        {
            CasellaTema t = Casella(x, y, w);
            t.Segnaposto = segnaposto;
            return t;
        }

        public static CasellaTema CasellaMulti(int x, int y, int w, int h)
        {
            CasellaTema t = Casella(x, y, w);
            t.Size = new Size(w, h);
            t.Multiline = true;
            t.AcceptsReturn = true;
            t.ScrollBars = ScrollBars.Vertical;
            return t;
        }

        public static CasellaTema CasellaMulti(int x, int y, int w, int h, string segnaposto)
        {
            CasellaTema t = CasellaMulti(x, y, w, h);
            t.Segnaposto = segnaposto;
            return t;
        }

        /// <summary>Casella di sola lettura usata come paragrafo che va a capo.</summary>
        public static TextBox Paragrafo(int x, int y, int w, int h, string ruolo)
        {
            TextBox t = new TextBox();
            t.Location = new Point(x, y);
            t.Size = new Size(w, h);
            t.Multiline = true;
            t.ReadOnly = true;
            t.BorderStyle = BorderStyle.None;
            t.Font = Normale;
            t.TabStop = false;
            t.Tag = ruolo;
            return t;
        }

        /// <summary>Riquadro di testo a sola lettura, per registri e anteprime.</summary>
        public static CasellaTema Registro(int x, int y, int w, int h, bool aCapo)
        {
            CasellaTema t = new CasellaTema();
            t.Location = new Point(x, y);
            t.Size = new Size(w, h);
            t.Multiline = true;
            t.ReadOnly = true;
            t.ScrollBars = aCapo ? ScrollBars.Vertical : ScrollBars.Both;
            t.WordWrap = aCapo;
            t.Font = Mono;
            t.Tag = Ruolo.Codice;
            t.BorderStyle = BorderStyle.FixedSingle;
            return t;
        }

        public static GroupBox Gruppo(string titolo, int x, int y, int w, int h)
        {
            GroupBox g = new GroupBox();
            g.Text = titolo;
            g.Location = new Point(x, y);
            g.Size = new Size(w, h);
            g.Font = Grassetto;
            return g;
        }

        public static CheckBox Spunta(string testo, int x, int y, string ruolo)
        {
            CheckBox c = new CheckBox();
            c.Text = testo;
            c.Location = new Point(x, y);
            c.AutoSize = true;
            c.Font = Normale;
            c.Tag = ruolo;
            c.Cursor = Cursors.Hand;
            return c;
        }

        /// <summary>Una spunta con il "?" subito dopo, al posto della riga di spiegazione.</summary>
        public static CheckBox SpuntaAiuto(Control dove, string testo, int x, int y,
                                           string titolo, string spiegazione)
        {
            CheckBox c = Spunta(testo, x, y, Ruolo.Normale);
            dove.Controls.Add(c);
            dove.Controls.Add(Aiuto(x + c.PreferredSize.Width + 8, y + 3, titolo, spiegazione));
            return c;
        }

        /// <summary>Riquadro con bordo: titolo + testo che va a capo.</summary>
        public static Panel Scheda1(string titolo, string testo, int x, int y, int w)
        {
            Panel c = new Panel();
            c.Tag = Ruolo.Scheda;
            c.Location = new Point(x, y);
            c.Width = w;

            Label lt = Testo1(titolo, 16, 12, w - 32, Grassetto, Ruolo.Accento);
            Label lc = Testo1(testo, 16, 12 + lt.Height + 2, w - 32, Normale, Ruolo.Normale);
            c.Height = 12 + lt.Height + 2 + lc.Height + 14;
            c.Controls.Add(lt);
            c.Controls.Add(lc);
            Contorna(c);
            return c;
        }

        /// <summary>
        /// La stessa scheda, con il "?" in cima a destra: il testo breve resta
        /// sulla pagina, il resto sta nella bolla.
        /// </summary>
        public static Panel Scheda1(string titolo, string testo, int x, int y, int w,
                                    string titoloAiuto, string spiegazione)
        {
            Panel c = Scheda1(titolo, testo, x, y, w);
            c.Controls.Add(Aiuto(w - 34, 14, titoloAiuto, spiegazione));
            return c;
        }

        /// <summary>Disegna un bordo sottile attorno al pannello, seguendo il tema.</summary>
        public static void Contorna(Panel p)
        {
            p.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen pn = new Pen(Bordo))
                    e.Graphics.DrawRectangle(pn, 0, 0, p.Width - 1, p.Height - 1);
            };
        }

        public static void LineaSotto(Control c)
        {
            c.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(Bordo))
                    e.Graphics.DrawLine(p, 0, c.Height - 1, c.Width, c.Height - 1);
            };
        }

        public static void LineaSopra(Control c)
        {
            c.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(Bordo))
                    e.Graphics.DrawLine(p, 0, 0, c.Width, 0);
            };
        }

        public static void LineaDestra(Control c)
        {
            c.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(Bordo))
                    e.Graphics.DrawLine(p, c.Width - 1, 0, c.Width - 1, c.Height);
            };
        }
    }

    // =======================================================================
    //  CASELLA DI TESTO CHE SEGUE IL TEMA
    //
    //  Windows disegna il bordo di una TextBox con i colori di sistema, fuori
    //  dall'area che WinForms ci lascia dipingere: nel tema scuro compariva
    //  un filo chiaro, a tratti, attorno alle caselle. Qui il bordo viene
    //  ridisegnato nel colore del tema (accento quando la casella ha il
    //  fuoco), e se la casella e' vuota mostra un testo di esempio in grigio.
    // =======================================================================
    class CasellaTema : TextBox
    {
        [DllImport("user32.dll")] static extern IntPtr GetWindowDC(IntPtr hWnd);
        [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        const int WM_SETFOCUS = 0x0007, WM_KILLFOCUS = 0x0008, WM_PAINT = 0x000F,
                  WM_NCPAINT = 0x0085, WM_SIZE = 0x0005, WM_VSCROLL = 0x0115,
                  WM_HSCROLL = 0x0114, WM_MOUSEWHEEL = 0x020A;

        string segnaposto = "";

        /// <summary>Testo di esempio mostrato in grigio finche' la casella e' vuota.</summary>
        public string Segnaposto
        {
            get { return segnaposto; }
            set { segnaposto = value ?? ""; Invalidate(); }
        }

        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            switch (m.Msg)
            {
                case WM_NCPAINT:
                case WM_SETFOCUS:
                case WM_KILLFOCUS:
                case WM_SIZE:
                case WM_VSCROLL:
                case WM_HSCROLL:
                case WM_MOUSEWHEEL:
                    DisegnaBordo();
                    break;
                case WM_PAINT:
                    DisegnaSegnaposto();
                    break;
            }
        }

        protected override void OnTextChanged(EventArgs e)
        {
            base.OnTextChanged(e);
            if (segnaposto != "" && Text.Length <= 1) Invalidate();
        }

        protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
        protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }

        void DisegnaBordo()
        {
            if (BorderStyle != BorderStyle.FixedSingle || !IsHandleCreated) return;
            IntPtr hdc = GetWindowDC(Handle);
            if (hdc == IntPtr.Zero) return;
            try
            {
                using (Graphics g = Graphics.FromHdc(hdc))
                using (Pen p = new Pen(Focused && !ReadOnly ? Tema.Accento : Tema.CampoBordo))
                    g.DrawRectangle(p, 0, 0, Width - 1, Height - 1);
            }
            catch (Exception) { /* casella in chiusura: il bordo torna al prossimo WM_NCPAINT */ }
            finally { ReleaseDC(Handle, hdc); }
        }

        void DisegnaSegnaposto()
        {
            if (segnaposto == "" || Text.Length > 0 || Focused || !IsHandleCreated) return;
            try
            {
                using (Graphics g = Graphics.FromHwnd(Handle))
                {
                    Rectangle r = ClientRectangle;
                    r.Inflate(-3, -1);
                    TextFormatFlags f = TextFormatFlags.Top | TextFormatFlags.Left |
                                        TextFormatFlags.NoPrefix |
                                        (Multiline ? TextFormatFlags.WordBreak
                                                   : TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
                    TextRenderer.DrawText(g, segnaposto, Font, r, Tema.Tenue, f);
                }
            }
            catch (Exception) { /* solo il testo d'esempio: meglio non vederlo che far cadere la pagina */ }
        }
    }

    // =======================================================================
    //  PANNELLO CON DOPPIO BUFFER
    //  Un Panel normale ridisegna un pezzo alla volta e, se dentro ci sono
    //  molti bottoni, si vede lo sfarfallio. Questo prepara il disegno fuori
    //  schermo e lo mostra tutto insieme.
    // =======================================================================
    class PannelloLiscio : Panel
    {
        public PannelloLiscio()
        {
            DoubleBuffered = true;
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.UserPaint, true);
            UpdateStyles();
        }

        protected override CreateParams CreateParams
        {
            get
            {
                // WS_EX_COMPOSITED: Windows compone i figli in un colpo solo
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x02000000;
                return cp;
            }
        }
    }
    /// <summary>
    /// La spiegazione che si apre dal "?" tondo: una finestrella senza bordi,
    /// nei colori del tema, che si chiude appena clicchi altrove o premi Esc.
    /// Una alla volta: aprendone un'altra la precedente sparisce.
    /// </summary>
    class Bolla : Form
    {
        static Bolla aperta;

        public static void Mostra(Control accanto, string titolo, string testo)
        {
            Chiudi();
            if (accanto == null) return;
            Bolla b = new Bolla(titolo, testo);
            Form padre = accanto.FindForm();

            // sotto al "?", ma dentro lo schermo
            Point p = accanto.PointToScreen(new Point(0, accanto.Height + 6));
            Rectangle schermo = Screen.FromControl(accanto).WorkingArea;
            if (p.X + b.Width > schermo.Right - 8) p.X = schermo.Right - 8 - b.Width;
            if (p.X < schermo.Left + 8) p.X = schermo.Left + 8;
            if (p.Y + b.Height > schermo.Bottom - 8)
                p.Y = accanto.PointToScreen(Point.Empty).Y - b.Height - 6;
            b.Location = p;

            aperta = b;
            if (padre != null) b.Show(padre); else b.Show();
        }

        public static void Chiudi()
        {
            if (aperta != null && !aperta.IsDisposed) aperta.Close();
            aperta = null;
        }

        Bolla(string titolo, string testo)
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Font = Tema.Normale;
            BackColor = Tema.Scheda;

            int larghezza = 420, margine = 16;
            int y = margine;
            if (!string.IsNullOrEmpty(titolo))
            {
                Label lt = Tema.Testo1(titolo, margine, y, larghezza - 2 * margine, Tema.Grassetto, Ruolo.Accento);
                Controls.Add(lt);
                y += lt.Height + 6;
            }
            Label lc = Tema.Testo1(testo, margine, y, larghezza - 2 * margine, Tema.Normale, Ruolo.Normale);
            Controls.Add(lc);
            y += lc.Height + margine;

            Size = new Size(larghezza, y);
            Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(Tema.Accento))
                    e.Graphics.DrawRectangle(p, 0, 0, Width - 1, Height - 1);
            };
            Click += delegate { Close(); };
            foreach (Control c in Controls) c.Click += delegate { Close(); };
            Deactivate += delegate { Close(); };
            KeyPreview = true;
            KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Escape) Close(); };
            Tema.Applica(this);
            BackColor = Tema.Scheda;
        }
    }

}
