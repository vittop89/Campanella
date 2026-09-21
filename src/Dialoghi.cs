// ===========================================================================
//  Dialoghi.cs - le finestrelle di servizio
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Text;
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
                    try { txt.Text = System.IO.File.ReadAllText(d.FileName, Encoding.UTF8); }
                    catch (Exception ex)
                    {
                        MessageBox.Show(this, "Non riesco a leggere il file:\n\n" + ex.Message,
                            "Errore", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
            });
            file.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            Controls.Add(file);

            Tema.Applica(this);
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
        CheckBox chkArchivia, chkLette;
        public Regola Risultato;
        public bool Elimina = false;
        Regola originale;

        public FormRegola(Regola daModificare)
        {
            originale = daModificare;
            Text = (daModificare == null) ? "Nuova regola" : "Modifica la regola";
            Size = new Size(620, 580);
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
            y += 98;

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

            if (daModificare != null && daModificare.Sorgente == "")
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
                el.ForeColor = Tema.Rosso;
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

                if (daModificare.Sorgente != "")
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
            if (r.Descrizione == "") r.Descrizione = "Regola personalizzata.";

            r.Oggetto = Spezza(txtOggetto.Text);
            if (originale == null || originale.Sorgente == "") r.Da = Spezza(txtDa.Text);
            return r;
        }

        static List<string> Spezza(string testo)
        {
            List<string> fuori = new List<string>();
            if (string.IsNullOrEmpty(testo)) return fuori;
            foreach (string riga in testo.Replace("\r\n", "\n").Split('\n'))
            {
                string s = riga.Trim();
                if (s == "" || s.StartsWith("(")) continue;
                if (!fuori.Contains(s)) fuori.Add(s);
            }
            return fuori;
        }
    }
}
