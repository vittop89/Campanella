// ===========================================================================
//  Xlsx.cs - lettore minimo di fogli Excel (.xlsx) e di file CSV
//
//  Un file .xlsx e' un archivio ZIP di documenti XML. Qui se ne legge quel
//  poco che serve: i nomi dei fogli, le stringhe condivise e le celle.
//  Niente formule, niente formati, niente date: tutto torna come testo,
//  che e' esattamente cio' che serve a un orario scolastico.
//
//  Nessuna libreria esterna: solo System.IO.Compression, presente nel
//  .NET Framework installato con Windows.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Xml;

namespace Campanella
{
    class FoglioExcel
    {
        public string Nome = "";
        public List<string[]> Righe = new List<string[]>();
        public int Colonne = 0;

        public int NumeroRighe { get { return Righe.Count; } }

        public string Cella(int riga, int colonna)
        {
            if (riga < 0 || riga >= Righe.Count) return "";
            string[] r = Righe[riga];
            if (r == null || colonna < 0 || colonna >= r.Length) return "";
            return r[colonna] ?? "";
        }

        static readonly string[] RigaVuota = new string[0];

        public void Metti(int riga, int colonna, string valore)
        {
            // le righe saltate restano vuote, tutte con lo stesso array
            while (Righe.Count <= riga) Righe.Add(RigaVuota);
            string[] r = Righe[riga];
            if (r.Length <= colonna)
            {
                string[] nuovo = new string[colonna + 1];
                Array.Copy(r, nuovo, r.Length);
                r = nuovo;
                Righe[riga] = r;
            }
            r[colonna] = valore;
            if (colonna + 1 > Colonne) Colonne = colonna + 1;
        }

        /// <summary>Toglie le righe completamente vuote in fondo.</summary>
        public void Compatta()
        {
            while (Righe.Count > 0)
            {
                bool vuota = true;
                foreach (string c in Righe[Righe.Count - 1])
                    if (!string.IsNullOrEmpty(c) && c.Trim() != "") { vuota = false; break; }
                if (!vuota) break;
                Righe.RemoveAt(Righe.Count - 1);
            }
        }
    }

    static class Xlsx
    {
        // i limiti di un foglio di Excel (fino alla riga 1048576 e alla colonna
        // XFD): oltre, un file di pochi byte farebbe allocare centinaia di MB
        public const int MaxRighe = 1048576;
        public const int MaxColonne = 16384;

        // ===================================================================
        //  LETTURA
        // ===================================================================
        public static List<FoglioExcel> Leggi(string percorso)
        {
            string est = Path.GetExtension(percorso ?? "").ToLowerInvariant();
            if (est == ".csv" || est == ".txt" || est == ".tsv")
            {
                List<FoglioExcel> uno = new List<FoglioExcel>();
                uno.Add(LeggiCsv(percorso));
                return uno;
            }
            if (est == ".xls")
                throw new Exception(
                    "Il formato .xls (Excel 97-2003) non si puo' leggere.\n\n" +
                    "Apri il file e salvalo come .xlsx (File -> Salva con nome -> " +
                    "Cartella di lavoro di Excel), oppure esportalo in CSV.");

            List<FoglioExcel> fogli = new List<FoglioExcel>();
            using (FileStream fs = new FileStream(percorso, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (ZipArchive zip = new ZipArchive(fs, ZipArchiveMode.Read))
            {
                List<string> condivise = LeggiStringheCondivise(zip);
                Dictionary<string, string> relazioni = LeggiRelazioni(zip);

                foreach (KeyValuePair<string, string> f in LeggiElencoFogli(zip))
                {
                    string bersaglio = relazioni.ContainsKey(f.Value) ? relazioni[f.Value] : null;
                    if (bersaglio == null) continue;
                    ZipArchiveEntry voce = TrovaVoce(zip, "xl/" + bersaglio.TrimStart('/'))
                                        ?? TrovaVoce(zip, bersaglio.TrimStart('/'));
                    if (voce == null) continue;

                    FoglioExcel foglio = LeggiFoglio(voce, condivise);
                    foglio.Nome = f.Key;
                    foglio.Compatta();
                    fogli.Add(foglio);
                }

                // qualche generatore non dichiara le relazioni: ripiego sui nomi
                if (fogli.Count == 0)
                {
                    foreach (ZipArchiveEntry voce in zip.Entries)
                    {
                        if (!voce.FullName.StartsWith("xl/worksheets/sheet")) continue;
                        if (!voce.FullName.EndsWith(".xml")) continue;
                        FoglioExcel foglio = LeggiFoglio(voce, condivise);
                        foglio.Nome = Path.GetFileNameWithoutExtension(voce.Name);
                        foglio.Compatta();
                        fogli.Add(foglio);
                    }
                }
            }
            if (fogli.Count == 0) throw new Exception("Nel file non c'e' nessun foglio leggibile.");
            return fogli;
        }

        static ZipArchiveEntry TrovaVoce(ZipArchive zip, string nome)
        {
            foreach (ZipArchiveEntry e in zip.Entries)
                if (string.Equals(e.FullName, nome, StringComparison.OrdinalIgnoreCase)) return e;
            return null;
        }

        static List<string> LeggiStringheCondivise(ZipArchive zip)
        {
            List<string> fuori = new List<string>();
            ZipArchiveEntry e = TrovaVoce(zip, "xl/sharedStrings.xml");
            if (e == null) return fuori;

            using (Stream s = e.Open())
            using (XmlReader r = XmlReader.Create(s, ImpostazioniXml()))
            {
                while (r.Read())
                {
                    if (r.NodeType != XmlNodeType.Element || r.LocalName != "si") continue;
                    if (r.IsEmptyElement) { fuori.Add(""); continue; }

                    // ReadSubtree confina la lettura dentro <si>: senza, la
                    // ReadElementContentAsString supererebbe il </si> e
                    // l'elenco resterebbe vuoto
                    StringBuilder testo = new StringBuilder();
                    using (XmlReader dentro = r.ReadSubtree())
                    {
                        dentro.Read();
                        while (dentro.Read())
                        {
                            if (dentro.NodeType == XmlNodeType.Element && dentro.LocalName == "t")
                                testo.Append(dentro.ReadElementContentAsString());
                        }
                    }
                    fuori.Add(testo.ToString());
                }
            }
            return fuori;
        }

        /// <summary>id della relazione -> percorso del foglio.</summary>
        static Dictionary<string, string> LeggiRelazioni(ZipArchive zip)
        {
            Dictionary<string, string> fuori = new Dictionary<string, string>();
            ZipArchiveEntry e = TrovaVoce(zip, "xl/_rels/workbook.xml.rels");
            if (e == null) return fuori;
            using (Stream s = e.Open())
            using (XmlReader r = XmlReader.Create(s, ImpostazioniXml()))
            {
                while (r.Read())
                {
                    if (r.NodeType != XmlNodeType.Element || r.LocalName != "Relationship") continue;
                    string id = r.GetAttribute("Id");
                    string bersaglio = r.GetAttribute("Target");
                    if (id != null && bersaglio != null) fuori[id] = bersaglio;
                }
            }
            return fuori;
        }

        /// <summary>nome del foglio -> id della relazione, nell'ordine del file.</summary>
        static List<KeyValuePair<string, string>> LeggiElencoFogli(ZipArchive zip)
        {
            List<KeyValuePair<string, string>> fuori = new List<KeyValuePair<string, string>>();
            ZipArchiveEntry e = TrovaVoce(zip, "xl/workbook.xml");
            if (e == null) return fuori;
            using (Stream s = e.Open())
            using (XmlReader r = XmlReader.Create(s, ImpostazioniXml()))
            {
                while (r.Read())
                {
                    if (r.NodeType != XmlNodeType.Element || r.LocalName != "sheet") continue;
                    string nome = r.GetAttribute("name") ?? "Foglio";
                    string id = r.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
                             ?? r.GetAttribute("r:id");
                    if (id != null) fuori.Add(new KeyValuePair<string, string>(nome, id));
                }
            }
            return fuori;
        }

        static FoglioExcel LeggiFoglio(ZipArchiveEntry voce, List<string> condivise)
        {
            FoglioExcel f = new FoglioExcel();
            using (Stream s = voce.Open())
            using (XmlReader r = XmlReader.Create(s, ImpostazioniXml()))
            {
                int riga = -1, colonnaPrima = -1;
                while (r.Read())
                {
                    if (r.NodeType == XmlNodeType.Element && r.LocalName == "row")
                    {
                        string n = r.GetAttribute("r");
                        int numero;
                        riga = (n != null && int.TryParse(n, NumberStyles.Integer, CultureInfo.InvariantCulture, out numero))
                             ? numero - 1 : riga + 1;
                        colonnaPrima = -1;
                    }
                    else if (r.NodeType == XmlNodeType.Element && r.LocalName == "c")
                    {
                        string rif = r.GetAttribute("r");
                        string tipo = r.GetAttribute("t");
                        // senza "r" la cella e' quella dopo la precedente della
                        // riga: lo standard lo ammette, e alcuni programmi lo fanno
                        int colonna = (rif != null) ? IndiceColonna(rif) : colonnaPrima + 1;
                        colonnaPrima = colonna;
                        if (colonna < 0 || colonna >= MaxColonne || riga >= MaxRighe) continue;
                        if (r.IsEmptyElement) continue;

                        string valore;
                        using (XmlReader dentro = r.ReadSubtree())
                        {
                            dentro.Read();
                            valore = LeggiValoreCella(dentro, tipo, condivise);
                        }
                        if (valore != "") f.Metti(riga < 0 ? 0 : riga, colonna, valore);
                    }
                }
            }
            return f;
        }

        /// <summary>Legge il contenuto di una cella: il reader e' gia' confinato al suo &lt;c&gt;.</summary>
        static string LeggiValoreCella(XmlReader r, string tipo, List<string> condivise)
        {
            string valore = "";
            while (r.Read())
            {
                if (r.NodeType != XmlNodeType.Element) continue;

                if (r.LocalName == "v")
                {
                    string grezzo = r.ReadElementContentAsString();
                    if (tipo == "s")
                    {
                        int indice;
                        if (int.TryParse(grezzo, NumberStyles.Integer, CultureInfo.InvariantCulture, out indice) &&
                            indice >= 0 && indice < condivise.Count)
                            valore = condivise[indice];
                    }
                    else if (tipo == "b") valore = (grezzo == "1") ? "VERO" : "FALSO";
                    else valore = grezzo;
                }
                else if (r.LocalName == "t")
                {
                    // stringa scritta dentro la cella (inlineStr)
                    valore += r.ReadElementContentAsString();
                }
            }
            return (valore ?? "").Trim();
        }

        /// <summary>"AP69" -> 41 (indice della colonna, base zero); -1 oltre la colonna XFD.</summary>
        public static int IndiceColonna(string riferimento)
        {
            int n = 0, i = 0;
            while (i < riferimento.Length)
            {
                char c = char.ToUpperInvariant(riferimento[i]);
                if (c < 'A' || c > 'Z') break;
                n = n * 26 + (c - 'A' + 1);
                if (n > MaxColonne) return -1;
                i++;
            }
            return n - 1;
        }

        static XmlReaderSettings ImpostazioniXml()
        {
            XmlReaderSettings x = new XmlReaderSettings();
            x.IgnoreComments = true;
            x.IgnoreWhitespace = true;
            x.IgnoreProcessingInstructions = true;
            x.DtdProcessing = DtdProcessing.Prohibit;   // niente entita' esterne
            x.XmlResolver = null;
            return x;
        }

        // ===================================================================
        //  CSV / TSV
        // ===================================================================
        public static FoglioExcel LeggiCsv(string percorso)
        {
            FoglioExcel f = new FoglioExcel();
            f.Nome = Path.GetFileNameWithoutExtension(percorso);
            // BOM, poi UTF-8, poi Windows-1252: Excel salva i CSV anche in "ANSI"
            string testo = Testo.LeggiFile(percorso);

            char separatore = SeparatoreProbabile(testo);
            int riga = 0, colonna = 0;
            bool traVirgolette = false;
            StringBuilder cella = new StringBuilder();

            for (int i = 0; i < testo.Length; i++)
            {
                char c = testo[i];
                if (traVirgolette)
                {
                    if (c == '"')
                    {
                        if (i + 1 < testo.Length && testo[i + 1] == '"') { cella.Append('"'); i++; }
                        else traVirgolette = false;
                    }
                    else cella.Append(c);
                    continue;
                }
                if (c == '"') { traVirgolette = true; }
                else if (c == separatore) { f.Metti(riga, colonna++, cella.ToString().Trim()); cella.Length = 0; }
                else if (c == '\n')
                {
                    f.Metti(riga, colonna, cella.ToString().Trim());
                    cella.Length = 0; colonna = 0; riga++;
                }
                else if (c != '\r') cella.Append(c);
            }
            if (cella.Length > 0) f.Metti(riga, colonna, cella.ToString().Trim());
            f.Compatta();
            return f;
        }

        static char SeparatoreProbabile(string testo)
        {
            string campione = testo.Length > 4000 ? testo.Substring(0, 4000) : testo;
            int puntoVirgola = 0, virgola = 0, tab = 0;
            foreach (char c in campione)
            {
                if (c == ';') puntoVirgola++;
                else if (c == ',') virgola++;
                else if (c == '\t') tab++;
            }
            if (tab >= puntoVirgola && tab >= virgola && tab > 0) return '\t';
            return (puntoVirgola >= virgola) ? ';' : ',';
        }
    }
}
