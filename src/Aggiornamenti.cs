// ===========================================================================
//  Aggiornamenti.cs - controllo versioni e installazione di rizzo-pii
//
//  L'applicazione non si collega a internet da sola: queste funzioni partono
//  solo quando l'utente preme un pulsante. Chiedono a GitHub qual e' l'ultima
//  versione pubblicata e, se serve, scaricano l'installer di rizzo-pii
//  (circa 1,2 GB) e lo avviano.
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
        public const string VersioneCampanella = "1.3.1";
        const string ApiRizzo = "https://api.github.com/repos/Rizzo-AI-Academy/rizzo-pii/releases/latest";
        public const string PaginaRizzo = "https://github.com/Rizzo-AI-Academy/rizzo-pii/releases/latest";

        /// <summary>Chiede a GitHub l'ultimo rilascio di rizzo-pii.</summary>
        public static Rilascio UltimoRizzoPii()
        {
            Rilascio r = new Rilascio();
            try
            {
                ServicePointManager.SecurityProtocol =
                    SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;

                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(ApiRizzo);
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
                Dictionary<string, object> d = ser.DeserializeObject(corpo) as Dictionary<string, object>;
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
                        r.FileWindows = Stato.Str(a, "browser_download_url", "");
                        try { r.ByteWindows = Convert.ToInt64(a["size"]); } catch { }
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
        /// Scarica l'installer nella cartella temporanea. Chiama avanzamento
        /// con la percentuale; se torna false lo scarico si ferma.
        /// </summary>
        public static string Scarica(string indirizzo, string nomeFile,
                                     Func<int, long, long, bool> avanzamento)
        {
            string destinazione = Path.Combine(Path.GetTempPath(), nomeFile);
            ServicePointManager.SecurityProtocol =
                SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;

            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(indirizzo);
            req.UserAgent = "Campanella/" + VersioneCampanella;
            req.Timeout = 30000;
            req.ReadWriteTimeout = 120000;

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (Stream sorgente = resp.GetResponseStream())
            using (FileStream fs = new FileStream(destinazione, FileMode.Create, FileAccess.Write))
            {
                long totale = resp.ContentLength;
                long fatti = 0;
                byte[] buffer = new byte[128 * 1024];
                int letti;
                int ultimaPercentuale = -1;

                while ((letti = sorgente.Read(buffer, 0, buffer.Length)) > 0)
                {
                    fs.Write(buffer, 0, letti);
                    fatti += letti;
                    int percentuale = (totale > 0) ? (int)(fatti * 100 / totale) : 0;
                    if (avanzamento != null && percentuale != ultimaPercentuale)
                    {
                        ultimaPercentuale = percentuale;
                        if (!avanzamento(percentuale, fatti, totale))
                        {
                            fs.Close();
                            try { File.Delete(destinazione); } catch { }
                            return null;      // fermato dall'utente
                        }
                    }
                }
            }
            return destinazione;
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
