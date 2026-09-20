// ===========================================================================
//  Consenso.cs - le condizioni d'uso, da accettare una volta
//
//  Compare al primo avvio e ogni volta che il testo cambia (fa fede la
//  costante Versione). Chi non accetta non entra: e' l'unico punto in cui
//  l'applicazione si impunta, e riguarda dati di altre persone.
//
//  Lo stesso testo lo mostra anche l'installer, prima di copiare qualsiasi
//  cosa: chi installa e chi usa devono averlo letto entrambi.
// ===========================================================================

using System;
using System.Drawing;
using System.Windows.Forms;

namespace Campanella
{
    static class Consenso
    {
        /// <summary>Cambiala quando cambia il testo: il consenso viene richiesto di nuovo.</summary>
        public const int Versione = 3;

        public const string Titolo = "Condizioni d'uso di Campanella";

        public static readonly string Testo =
"CAMPANELLA - CONDIZIONI D'USO\r\n" +
"Da leggere una volta. E' corto apposta.\r\n" +
"\r\n" +
"\r\n" +
"1. CHE COS'E'\r\n" +
"\r\n" +
"Campanella e' uno strumento personale che prepara testo: il codice di script\r\n" +
"Google da incollare nel tuo account, le cartelle di un anno scolastico, le\r\n" +
"email degli orari (che arrivano solo a te) e il tuo orario sul calendario.\r\n" +
"Non tocca la tua posta, il tuo calendario ne' il tuo Drive di sua iniziativa:\r\n" +
"sei sempre tu a premere Esegui. Non manda dati a nessuno, non raccoglie\r\n" +
"statistiche, non ha bisogno di un account. Si collega a internet solo se sei\r\n" +
"tu a chiederlo: per cercare aggiornamenti o per scaricare rizzo-pii.\r\n" +
"\r\n" +
"Per i moduli Google prepara un secondo script, da incollare dentro il modulo:\r\n" +
"ogni anno crea il foglio delle risposte, ci collega il modulo e a fine anno\r\n" +
"lo chiude. E' un progetto a parte, con permessi suoi, e anche quello lo fai\r\n" +
"partire tu. Non manda email, non condivide niente, non cancella niente: le\r\n" +
"risposte degli anni scorsi le toglie dal modulo solo se glielo chiedi, e solo\r\n" +
"dopo aver controllato che stanno gia' in un foglio vecchio.\r\n" +
"\r\n" +
"Funziona su Windows con un account Google Workspace (Gmail, Drive,\r\n" +
"Calendar): con Microsoft 365 non fa niente. L'elenco del personale si puo'\r\n" +
"leggere dal registro ClasseViva di Spaggiari; con altri registri (Argo,\r\n" +
"Axios, Nuvola...) va incollato a mano o chiesto in segreteria. Il tabellone\r\n" +
"degli orari e' quello di Orario Facile, o una tabella docente/giorno/ora.\r\n" +
"\r\n" +
"\r\n" +
"2. I DATI CHE TRATTERAI NON SONO TUOI\r\n" +
"\r\n" +
"Nomi, indirizzi di servizio, orari, corrispondenza con colleghi e famiglie\r\n" +
"sono dati personali di cui il titolare del trattamento e' la scuola, non tu.\r\n" +
"L'esenzione per uso domestico del GDPR non copre l'attivita' professionale.\r\n" +
"\r\n" +
"In concreto:\r\n" +
"\r\n" +
"  - L'elenco del personale e gli orari con i cognomi restano sul computer\r\n" +
"    dove usi Campanella. Dalle Impostazioni puoi tenerli in un file dentro\r\n" +
"    il Drive della scuola invece che accanto al programma: e' la scelta\r\n" +
"    consigliata, perche' cosi' restano nell'account istituzionale.\r\n" +
"\r\n" +
"  - Meglio NON portare sul computer personale la posta e i documenti di\r\n" +
"    servizio. Se ti servono davvero, prendine il meno possibile.\r\n" +
"\r\n" +
"  - Lascia sempre fuori i dati degli studenti: certificazioni, PDP e PEI,\r\n" +
"    relazioni cliniche, segnalazioni. Sono categorie particolari di dati\r\n" +
"    (art. 9 GDPR) e non vanno copiate in locale.\r\n" +
"\r\n" +
"  - Le risposte ai tuoi moduli Google sono dati di studenti e famiglie.\r\n" +
"    Restano nel modulo e nel foglio dentro il Drive della scuola; il foglio\r\n" +
"    che lo script crea e' tuo e non lo vede nessun altro finche' non lo\r\n" +
"    condividi tu. Anche i fogli degli anni passati non scadono da soli.\r\n" +
"\r\n" +
"  - Cancella quello che non ti serve piu': un file sul disco non scade\r\n" +
"    da solo.\r\n" +
"\r\n" +
"  - Se il computer non e' solo tuo, o non e' cifrato, il problema si\r\n" +
"    moltiplica. Una chiavetta smarrita e' una violazione di dati da\r\n" +
"    notificare.\r\n" +
"\r\n" +
"\r\n" +
"3. INTELLIGENZA ARTIFICIALE: PRIMA SI ANONIMIZZA\r\n" +
"\r\n" +
"Quando incolli un documento in ChatGPT, Claude, Gemini o simili, quel testo\r\n" +
"esce dal tuo computer e finisce su server che non controlli, dove puo'\r\n" +
"essere conservato. Se contiene dati personali di terzi, e' un trasferimento\r\n" +
"a un soggetto esterno che, per un'iniziativa personale, non ha una base\r\n" +
"giuridica.\r\n" +
"\r\n" +
"Per questo Campanella include lo strumento Privacy: togli i dati personali\r\n" +
"in locale, dai all'assistente solo i segnaposto, e rimetti i nomi veri nella\r\n" +
"risposta quando torna.\r\n" +
"\r\n" +
"Due cose che restano vere anche cosi':\r\n" +
"\r\n" +
"  - Nessun riconoscitore automatico prende il 100%. Rileggi il testo pulito\r\n" +
"    prima di incollarlo: la responsabilita' del controllo finale e' tua.\r\n" +
"\r\n" +
"  - Anonimizzare non basta sempre. In una classe di venti persone il\r\n" +
"    contesto reidentifica: \"la collega di sostegno della 3B\" non contiene\r\n" +
"    nomi e identifica benissimo.\r\n" +
"\r\n" +
"\r\n" +
"4. QUELLO CHE DECIDI TU\r\n" +
"\r\n" +
"L'applicazione ti mostra sempre prima cosa sta per succedere, parte in\r\n" +
"modalita' prova e non scrive mai a nessun altro: le email degli orari\r\n" +
"arrivano soltanto a te. Ma le decisioni restano tue: cosa tenere sul\r\n" +
"computer, cosa incollare in un assistente, per quanto conservare.\r\n" +
"\r\n" +
"Sei tu a dover rispettare il GDPR, il regolamento del tuo istituto e le\r\n" +
"indicazioni del Responsabile della protezione dei dati (DPO). La legge non\r\n" +
"ti obbliga a chiedere un permesso per riordinare la tua posta dentro\r\n" +
"l'account della scuola, ma le istruzioni del tuo istituto possono farlo:\r\n" +
"Campanella ti da' una nota tecnica e un modello di email per avvisare\r\n" +
"dirigenza e DPO, se vuoi o se serve.\r\n" +
"\r\n" +
"\r\n" +
"5. NESSUNA GARANZIA, NESSUNA RESPONSABILITA' DELL'AUTORE\r\n" +
"\r\n" +
"Il programma e' distribuito gratuitamente e \"cosi' com'e'\" (as is), senza\r\n" +
"garanzie di alcun tipo, esplicite o implicite, comprese quelle di\r\n" +
"commerciabilita', idoneita' a uno scopo particolare e assenza di difetti.\r\n" +
"\r\n" +
"Nei limiti consentiti dalla legge, l'autore non risponde di alcun danno\r\n" +
"diretto o indiretto derivante dall'uso o dal mancato funzionamento del\r\n" +
"programma: perdita o divulgazione di dati, email mandate per errore,\r\n" +
"sanzioni, contestazioni disciplinari, danni a terzi. L'uso e' a tuo rischio\r\n" +
"e sotto la tua esclusiva responsabilita'.\r\n" +
"\r\n" +
"Questo testo non e' un parere legale e non sostituisce il regolamento della\r\n" +
"tua scuola ne' il parere del DPO.\r\n" +
"\r\n" +
"\r\n" +
"6. SOFTWARE DI ALTRI\r\n" +
"\r\n" +
"L'anonimizzazione la fa rizzo-pii (licenza MIT, Rizzo AI Academy), un\r\n" +
"programma separato che scarichi e installi tu. Gli script girano dentro\r\n" +
"Google Apps Script. Valgono le licenze e i termini d'uso di quei progetti.\r\n" +
"Campanella non ha alcun rapporto con Google, con il Gruppo Spaggiari Parma\r\n" +
"ne' con gli altri marchi citati.\r\n" +
"\r\n" +
"Campanella e' distribuita con licenza MIT: il codice si puo' leggere,\r\n" +
"modificare e ridistribuire, mantenendo questa esclusione di responsabilita'.\r\n" +
"\r\n" +
"\r\n" +
"7. IN DUE RIGHE\r\n" +
"\r\n" +
"Tieni fuori dal computer i dati che non ti servono. Se li dai a un'IA,\r\n" +
"anonimizzali prima e rileggi. Il programma e' senza garanzie e quello che\r\n" +
"ci fai e' responsabilita' tua.\r\n";

        /// <summary>
        /// Mostra le condizioni se non sono ancora state accettate.
        /// Torna false se l'utente rifiuta: in quel caso l'applicazione si chiude.
        /// </summary>
        public static bool Richiedi(IWin32Window padre, Stato s)
        {
            if (s.ConsensoVersione >= Versione) return true;

            using (FormConsenso f = new FormConsenso())
            {
                DialogResult r = (padre == null) ? f.ShowDialog() : f.ShowDialog(padre);
                if (r != DialogResult.OK) return false;
                s.ConsensoVersione = Versione;
                s.ConsensoData = DateTime.Now.ToString("yyyy-MM-dd HH:mm");
                s.Salva();
                return true;
            }
        }
    }

    class FormConsenso : Form
    {
        CheckBox chkDati, chkResponsabilita;
        Button btnAccetto;

        public FormConsenso()
        {
            Text = Consenso.Titolo;
            Size = new Size(820, 720);
            MinimumSize = new Size(700, 560);
            StartPosition = FormStartPosition.CenterScreen;
            Font = Tema.Normale;
            MinimizeBox = false;
            MaximizeBox = false;
            ShowInTaskbar = true;

            Label titolo = Tema.Testo1("Prima di cominciare", 24, 18, 0, Tema.Sezione, Ruolo.Sezione);
            Controls.Add(titolo);
            Label sotto = Tema.Testo1(
                "Campanella lavora su dati di altre persone: colleghi, studenti, famiglie. " +
                "Queste righe dicono cosa comporta. Servono due spunte per andare avanti.",
                26, 52, 740, Tema.Normale, Ruolo.Tenue);
            sotto.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            Controls.Add(sotto);

            TextBox t = new TextBox();
            t.Location = new Point(24, 96);
            t.Size = new Size(756, 440);
            t.Multiline = true;
            t.ReadOnly = true;
            t.ScrollBars = ScrollBars.Vertical;
            t.Font = Tema.Mono;
            t.Tag = Ruolo.Codice;
            t.Text = Consenso.Testo;
            t.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            t.Select(0, 0);
            Controls.Add(t);
            // senza questo il riquadro si apre gia' scorso, perche' il fuoco
            // passa al primo controllo e trascina il testo con se'
            Shown += delegate { t.Select(0, 0); t.ScrollToCaret(); chkDati.Focus(); };

            chkDati = Tema.Spunta(
                "Ho letto le avvertenze sui dati della scuola e sull'intelligenza artificiale.",
                24, 550, Ruolo.Normale);
            chkDati.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            chkDati.CheckedChanged += delegate { Aggiorna(); };
            Controls.Add(chkDati);

            chkResponsabilita = Tema.Spunta(
                "Accetto che il programma sia senza garanzie e che l'autore non risponda dell'uso che ne faccio.",
                24, 578, Ruolo.Normale);
            chkResponsabilita.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            chkResponsabilita.CheckedChanged += delegate { Aggiorna(); };
            Controls.Add(chkResponsabilita);

            btnAccetto = Tema.BottonePrincipale("Accetto e continuo", 560, 618, 220, null);
            btnAccetto.DialogResult = DialogResult.OK;
            btnAccetto.Enabled = false;
            btnAccetto.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            Controls.Add(btnAccetto);

            Button esci = Tema.Bottone("Non accetto", 440, 620, 110, null);
            esci.DialogResult = DialogResult.Cancel;
            esci.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
            Controls.Add(esci);
            CancelButton = esci;

            Label nota = Tema.Testo1("Senza le due spunte il programma non parte.",
                                     24, 624, 400, Tema.Piccolo, Ruolo.Tenue);
            nota.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            Controls.Add(nota);

            Tema.Applica(this);
            Aggiorna();
        }

        void Aggiorna()
        {
            bool pronto = chkDati.Checked && chkResponsabilita.Checked;
            btnAccetto.Enabled = pronto;
            // un bottone piatto disabilitato resta colorato: lo spengo a mano
            btnAccetto.BackColor = pronto ? Tema.Accento : Tema.Mescola(Tema.Scheda, Tema.Tenue, 0.25);
            btnAccetto.ForeColor = pronto ? Tema.AccentoTesto : Tema.Tenue;
        }
    }
}
