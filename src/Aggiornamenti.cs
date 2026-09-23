// ===========================================================================
//  Aggiornamenti.cs - controllo versioni e installazione di rizzo-pii
//
//  L'applicazione non si collega a internet da sola: queste funzioni partono
//  solo quando l'utente preme un pulsante. Chiedono a GitHub qual e' l'ultima
//  versione pubblicata di Campanella e di rizzo-pii e, se serve, scaricano
//  l'installer di rizzo-pii (circa 1,2 GB), ne controllano dimensione e
//  impronta, e lo avviano. Di Campanella non scaricano niente: dicono solo
//  che c'e' una versione nuova e dove prenderla.
//
//  Perche' non e' dentro Campanella: rizzo-pii porta con se' PyTorch e un
//  modello da 1,2 GB. Metterlo nell'installer significherebbe un file da
//  scaricare comunque, ma senza poterlo aggiornare per conto suo.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Campanella
{
    class Rilascio
    {
        public bool Trovato = false;
        public string Versione = "";
        public string Nome = "";
        public string Indirizzo = "";       // pagina del rilascio
        public string FileWindows = "";     // link diretto all'installer
        public long ByteWindows = 0;
        public string Sha256Windows = "";   // impronta dell'installer, se GitHub la dichiara
        public string Messaggio = "";

        public string PesoLeggibile
        {
            get
            {
                if (ByteWindows <= 0) return "";
                return Math.Round(ByteWindows / 1024.0 / 1024.0, 0) + " MB";
            }
        }
    }

    static class Aggiornamenti
    {
        public const string VersioneCampanella = "1.4.6";
        const string ApiRizzo = "https://api.github.com/repos/Rizzo-AI-Academy/rizzo-pii/releases/latest";
        public const string PaginaRizzo = "https://github.com/Rizzo-AI-Academy/rizzo-pii/releases/latest";
        // si scarica solo un file pubblicato fra i rilasci di rizzo-pii, in https
        const string ScaricoRizzo = "https://github.com/Rizzo-AI-Academy/rizzo-pii/releases/download/";
        const string ApiCampanella = "https://api.github.com/repos/vittop89/Campanella/releases/latest";
        public const string PaginaCampanella = "https://github.com/vittop89/Campanella/releases";

        /// <summary>Solo TLS 1.2, assegnato e non aggiunto con |=, che
        /// lascerebbe acceso anche SSL 3. Va detto a mano perche' l'exe non
        /// dichiara un framework di destinazione; GitHub non accetta di meno.</summary>
        static void ProtocolliSicuri()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        }

        /// <summary>Una domanda all'API di GitHub. Null se la risposta non e' un oggetto JSON.</summary>
        static Dictionary<string, object> ChiediAGitHub(string api)
        {
            ProtocolliSicuri();
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(api);
            req.Method = "GET";
            req.UserAgent = "Campanella/" + VersioneCampanella;
            req.Accept = "application/vnd.github+json";
            req.Timeout = 15000;
            req.ReadWriteTimeout = 15000;

            string corpo;
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                corpo = sr.ReadToEnd();

            JavaScriptSerializer ser = new JavaScriptSerializer();
            ser.MaxJsonLength = 40 * 1024 * 1024;
            return ser.DeserializeObject(corpo) as Dictionary<string, object>;
        }

        /// <summary>
        /// Chiede a GitHub l'ultimo rilascio di Campanella. Parte solo quando
        /// l'utente preme "Cerca aggiornamenti" e non scarica niente: chi lo
        /// chiama confronta la versione con PiuRecente e, se serve, rimanda
        /// alla pagina dei rilasci.
        /// </summary>
        public static Rilascio UltimoCampanella()
        {
            Rilascio r = new Rilascio();
            try
            {
                Dictionary<string, object> d = ChiediAGitHub(ApiCampanella);
                if (d == null) { r.Messaggio = "Risposta di GitHub non comprensibile."; return r; }

                r.Versione = Stato.Str(d, "tag_name", "").TrimStart('v', 'V');
                r.Nome = Stato.Str(d, "name", "");
                r.Indirizzo = PaginaCampanella;
                r.Trovato = (Numeri(r.Versione).Length > 0);
                r.Messaggio = r.Trovato
                    ? "Ultima versione pubblicata di Campanella: " + r.Versione
                    : "Non sono riuscito a leggere il numero di versione di Campanella.";
            }
            catch (Exception ex)
            {
                r.Messaggio = "Non riesco a chiedere a GitHub: " + ex.Message;
            }
            return r;
        }

        /// <summary>
        /// Vero se la versione pubblicata e' piu' recente di quella in uso.
        /// Accetta anche il nome del tag ("v1.4.7"); una versione vuota o
        /// senza numeri non e' mai piu' recente.
        /// </summary>
        public static bool PiuRecente(string pubblicata, string inUso)
        {
            if (Numeri(pubblicata).Length == 0) return false;
            return Confronta(pubblicata, inUso) > 0;
        }

        /// <summary>Chiede a GitHub l'ultimo rilascio di rizzo-pii.</summary>
        public static Rilascio UltimoRizzoPii()
        {
            Rilascio r = new Rilascio();
            try
            {
                Dictionary<string, object> d = ChiediAGitHub(ApiRizzo);
                if (d == null) { r.Messaggio = "Risposta di GitHub non comprensibile."; return r; }

                r.Versione = Stato.Str(d, "tag_name", "").TrimStart('v', 'V');
                r.Nome = Stato.Str(d, "name", "");
                r.Indirizzo = Stato.Str(d, "html_url", PaginaRizzo);

                object[] assets = d.ContainsKey("assets") ? d["assets"] as object[] : null;
                if (assets != null)
                {
                    foreach (object o in assets)
                    {
                        Dictionary<string, object> a = o as Dictionary<string, object>;
                        if (a == null) continue;
                        string nome = Stato.Str(a, "name", "");
                        if (nome.IndexOf("Windows", StringComparison.OrdinalIgnoreCase) < 0) continue;
                        if (!nome.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) continue;
                        string url = Stato.Str(a, "browser_download_url", "");
                        if (!url.StartsWith(ScaricoRizzo, StringComparison.Ordinal)) continue;
                        r.FileWindows = url;
                        try { r.ByteWindows = Convert.ToInt64(a["size"]); } catch { }
                        // "sha256:<64 cifre esadecimali>", da quando GitHub lo pubblica
                        string digest = Stato.Str(a, "digest", "").Trim();
                        if (digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase))
                            r.Sha256Windows = digest.Substring(7).Trim().ToLowerInvariant();
                        break;
                    }
                }

                r.Trovato = (r.Versione != "");
                r.Messaggio = r.Trovato
                    ? "Ultima versione pubblicata: " + r.Versione +
                      (r.PesoLeggibile != "" ? "  (installer Windows, " + r.PesoLeggibile + ")" : "")
                    : "Non sono riuscito a leggere il numero di versione.";
            }
            catch (Exception ex)
            {
                r.Messaggio = "Non riesco a chiedere a GitHub: " + ex.Message +
                              "\nControlla il collegamento a internet, oppure apri la pagina a mano.";
            }
            return r;
        }

        /// <summary>Confronta due versioni tipo "2.0.0". Torna &gt;0 se a e' piu' recente.</summary>
        public static int Confronta(string a, string b)
        {
            string[] pa = Numeri(a), pb = Numeri(b);
            int n = Math.Max(pa.Length, pb.Length);
            for (int i = 0; i < n; i++)
            {
                int va = (i < pa.Length) ? Intero(pa[i]) : 0;
                int vb = (i < pb.Length) ? Intero(pb[i]) : 0;
                if (va != vb) return va - vb;
            }
            return 0;
        }

        static string[] Numeri(string v)
        {
            return Regex.Replace(v ?? "", "[^0-9.]", "").Split(new char[] { '.' },
                                 StringSplitOptions.RemoveEmptyEntries);
        }

        static int Intero(string s)
        {
            int n;
            return int.TryParse(s, out n) ? n : 0;
        }

        /// <summary>
        /// Scarica l'installer nella cartella temporanea e controlla che sia
        /// intero prima di consegnarlo: i byte devono essere quanti ne
        /// dichiara il server e quanti ne annuncia GitHub (attesi, se maggiore
        /// di zero), e l'impronta SHA-256 deve essere quella pubblicata
        /// (sha256, se non e' vuota). Se qualcosa non torna, o lo scarico
        /// fallisce, il file a meta' viene cancellato e parte un'eccezione:
        /// un installer incompleto non si avvia. Chiama avanzamento con la
        /// percentuale, quando cambia e comunque almeno ogni mezzo secondo (la
        /// stessa percentuale puo' tornare piu' volte); se torna false lo scarico
        /// si ferma, il file viene cancellato e torna null.
        /// </summary>
        public static string Scarica(string indirizzo, string nomeFile, long attesi, string sha256,
                                     Func<int, long, long, bool> avanzamento)
        {
            string destinazione = Path.Combine(Path.GetTempPath(), Path.GetFileName(nomeFile));
            ProtocolliSicuri();

            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(indirizzo);
            req.UserAgent = "Campanella/" + VersioneCampanella;
            req.Timeout = 30000;
            req.ReadWriteTimeout = 120000;

            bool creato = false, consegnato = false;
            try
            {
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (Stream sorgente = resp.GetResponseStream())
                {
                    creato = true;      // da qui in poi un file a meta' va tolto
                    using (FileStream fs = new FileStream(destinazione, FileMode.Create, FileAccess.Write))
                    using (SHA256 impronta = SHA256.Create())
                    {
                        long dichiarati = resp.ContentLength;      // -1 se il server non lo dice
                        long totale = (attesi > 0) ? attesi : dichiarati;
                        long fatti = 0;
                        byte[] buffer = new byte[128 * 1024];
                        int letti;
                        int ultimaPercentuale = -1;
                        int ultimaChiamata = Environment.TickCount;

                        while ((letti = sorgente.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            fs.Write(buffer, 0, letti);
                            impronta.TransformBlock(buffer, 0, letti, null, 0);
                            fatti += letti;
                            if (totale > 0 && fatti > totale)
                                throw new IOException("Il server manda piu' byte dei " + totale +
                                                      " annunciati: ho cancellato il file.");
                            int percentuale = (totale > 0) ? (int)(fatti * 100 / totale) : 0;
                            // anche senza un punto in piu', ogni mezzo secondo: con un file
                            // di 1,3 GB e una rete lenta un punto e' una decina di secondi,
                            // e tanto aspettava chi lo ferma (anche chiudendo Campanella)
                            bool tempo = unchecked(Environment.TickCount - ultimaChiamata) >= 500;
                            if (avanzamento != null && (percentuale != ultimaPercentuale || tempo))
                            {
                                ultimaPercentuale = percentuale;
                                ultimaChiamata = Environment.TickCount;
                                if (!avanzamento(percentuale, fatti, totale))
                                    return null;      // fermato dall'utente: il file lo toglie finally
                            }
                        }
                        impronta.TransformFinalBlock(new byte[0], 0, 0);

                        if (dichiarati >= 0 && fatti != dichiarati)
                            throw new IOException("Lo scarico si e' interrotto a meta' (" + fatti +
                                                  " byte su " + dichiarati + "): ho cancellato il file.");
                        if (attesi > 0 && fatti != attesi)
                            throw new IOException("Il file scaricato non ha la dimensione annunciata da " +
                                                  "GitHub (" + fatti + " byte invece di " + attesi +
                                                  "): ho cancellato il file.");
                        string calcolata = Esadecimale(impronta.Hash);
                        if (!string.IsNullOrEmpty(sha256) &&
                            !string.Equals(calcolata, sha256.Trim(), StringComparison.OrdinalIgnoreCase))
                            throw new IOException("L'impronta SHA-256 del file scaricato non e' quella " +
                                                  "pubblicata su GitHub: ho cancellato il file senza avviarlo.");
                    }
                }
                consegnato = true;
                return destinazione;
            }
            finally
            {
                if (creato && !consegnato) { try { File.Delete(destinazione); } catch { } }
            }
        }

        static string Esadecimale(byte[] dati)
        {
            StringBuilder sb = new StringBuilder(dati.Length * 2);
            foreach (byte b in dati) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        /// <summary>Avvia l'installer scaricato e torna subito: e' lui a parlare con l'utente.</summary>
        public static void Avvia(string percorso)
        {
            ProcessStartInfo psi = new ProcessStartInfo(percorso);
            psi.UseShellExecute = true;
            Process.Start(psi);
        }
    }
}
