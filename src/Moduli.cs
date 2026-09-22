// ===========================================================================
//  Moduli.cs - lo script che ogni anno da' a un modulo Google il suo foglio
//
//  Un modulo Google (.gform) sul PC e' solo un segnaposto: non si puo' leggere
//  ne' copiare come un file, e il foglio delle risposte va creato e collegato
//  dentro l'account. Qui si scrive il codice Apps Script che lo fa, a partire
//  da quello che il docente ha scelto in Cartelle. Il motore e' la risorsa
//  Moduli.gs; questo file ci mette la configurazione e, se il docente vuole
//  fare a meno del permesso per Drive, toglie la parte che lo chiede.
//
//  Tutto statico e senza interfaccia: si prova da test\prova_moduli.ps1.
// ===========================================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace Campanella
{
    /// <summary>Le scelte del docente per lo script di un modulo.</summary>
    class ParametriModulo
    {
        public string Modulo = "";                   // nome del modulo, senza estensione
        public string Anno = "auto";                 // "auto" oppure 2026-27
        public string CartellaAnno = "A.S. {anno}";  // come la crea lo strumento Cartelle
        public string CartellaFoglio = "";           // dentro la cartella dell'anno; vuoto = la cartella dell'anno
        public string NomeFoglio = "";               // puo' contenere {anno}
        public string Chiusura = "31/08";            // giorno/mese; vuoto = nessuna chiusura
        public bool Riapri = true;
        public bool Svuota = false;
        public bool UsaDrive = true;
        public string FusoOrario = "Europe/Rome";
    }

    static class ScriptModuli
    {
        public const string Risorsa = "Moduli.gs";
        public const string ChiusuraDiDefault = "31/08";

        const string InizioConfig = "// >>> CONFIGURAZIONE >>>";
        const string FineConfig = "// <<< CONFIGURAZIONE <<<";
        const string InizioDrive = "// [DRIVE >>>";
        const string FineDrive = "// <<< DRIVE]";

        // ===================================================================
        //  I MODULI CHE CI SONO
        // ===================================================================
        /// <summary>
        /// I moduli Google dentro MODELLI (a qualunque profondita') e nella radice
        /// del Drive, come percorsi relativi al Drive. Non li apre: non si puo',
        /// Drive per desktop li espone come segnaposto senza contenuto.
        /// </summary>
        public static List<string> TrovaModuli(string drive)
        {
            List<string> fuori = new List<string>();
            string radice = (drive ?? "").Trim().TrimEnd('\\');
            if (radice == "" || !Directory.Exists(radice)) return fuori;
            try
            {
                string modelli = Path.Combine(radice, "MODELLI");
                if (Directory.Exists(modelli))
                    foreach (string f in Directory.GetFiles(modelli, "*.gform", SearchOption.AllDirectories))
                        fuori.Add(f.Substring(radice.Length).TrimStart('\\'));
                foreach (string f in Directory.GetFiles(radice, "*.gform", SearchOption.TopDirectoryOnly))
                    fuori.Add(f.Substring(radice.Length).TrimStart('\\'));
            }
            catch { /* una cartella illeggibile non deve fermare la pagina */ }
            fuori.Sort(StringComparer.OrdinalIgnoreCase);
            return fuori;
        }

        /// <summary>"MODELLI\Verifiche\Recuperi.gform" diventa "Recuperi".</summary>
        public static string NomeModulo(string percorso)
        {
            string p = (percorso ?? "").Trim();
            if (p == "") return "";
            try
            {
                if (p.EndsWith(".gform", StringComparison.OrdinalIgnoreCase))
                    return Path.GetFileNameWithoutExtension(p);
                return (p.IndexOf('\\') >= 0) ? Path.GetFileName(p) : p;
            }
            catch { return p; }                      // caratteri che Windows non accetta in un percorso
        }

        public static string NomeFoglioProposto(string modulo)
        {
            string m = (modulo ?? "").Trim();
            return (m == "") ? "Risposte - A.S. {anno}" : "Risposte " + m + " - A.S. {anno}";
        }

        /// <summary>
        /// Dove mettere il foglio, fra le cartelle dell'anno: quella che si chiama
        /// come il modulo (Recuperi -> RECUPERI), altrimenti il gruppo di MODELLI in
        /// cui il modulo sta, se fra le cartelle dell'anno c'e'. Vuoto = la cartella
        /// dell'anno.
        /// </summary>
        public static string CartellaProposta(string percorsoModulo, IList<string> cartelleAnno)
        {
            string nome = Piatto(NomeModulo(percorsoModulo));
            List<string> primi = new List<string>();
            if (cartelleAnno != null)
                foreach (string c in cartelleAnno)
                {
                    string primo = (c ?? "").Split('\\', '/')[0].Trim();
                    if (primo != "" && !primi.Contains(primo)) primi.Add(primo);
                }
            if (nome != "")
                foreach (string c in primi)
                    if (Piatto(c) == nome) return c;

            string[] pezzi = (percorsoModulo ?? "").Split('\\');
            if (pezzi.Length >= 3 && pezzi[0].Equals("MODELLI", StringComparison.OrdinalIgnoreCase))
                foreach (string c in primi)
                    if (Piatto(c) == Piatto(pezzi[1])) return c;
            return "";
        }

        static string Piatto(string s)
        {
            return Stato.SenzaAccenti((s ?? "").Trim()).ToLowerInvariant();
        }

        // ===================================================================
        //  CONTROLLI
        // ===================================================================
        /// <summary>Vuoto se va bene, altrimenti cosa non va nel giorno di chiusura.</summary>
        public static string ControllaChiusura(string chiusura)
        {
            string c = (chiusura ?? "").Replace(" ", "");
            if (c == "") return "";
            Match m = Regex.Match(c, @"^(\d{1,2})/(\d{1,2})$");
            if (!m.Success) return "Il giorno di chiusura si scrive giorno/mese, per esempio 31/08.";
            int giorno = int.Parse(m.Groups[1].Value), mese = int.Parse(m.Groups[2].Value);
            // il 29 febbraio non c'e' tutti gli anni: meglio non programmarci una chiusura
            if (mese < 1 || mese > 12 || giorno < 1 || giorno > DateTime.DaysInMonth(2027, mese))
                return "Il giorno di chiusura " + c + " non esiste (o non c'e' tutti gli anni).";
            return "";
        }

        /// <summary>Vuoto se va bene: "auto" oppure 2026-27, con le due cifre giuste.</summary>
        public static string ControllaAnno(string anno)
        {
            string a = (anno ?? "").Replace(" ", "");
            if (a == "" || a.Equals("auto", StringComparison.OrdinalIgnoreCase)) return "";
            Match m = Regex.Match(a, @"^(\d{4})-(\d{2})$");
            if (!m.Success || (int.Parse(m.Groups[1].Value) + 1) % 100 != int.Parse(m.Groups[2].Value))
                return "L'anno scolastico si scrive 2026-27.";
            return "";
        }

        public static string ControllaNome(string nome, string cosa)
        {
            string n = (nome ?? "").Trim();
            if (n == "") return "Manca " + cosa + ".";
            if (n.IndexOfAny(new char[] { '\r', '\n', '\t' }) >= 0) return "Una riga sola per " + cosa + ".";
            return "";
        }

        /// <summary>Il giorno di chiusura dentro l'anno scolastico, come lo calcola lo script.</summary>
        public static DateTime? DataChiusura(string chiusura, string annoScolastico)
        {
            if ((chiusura ?? "").Trim() == "" || ControllaChiusura(chiusura) != "") return null;
            string a = (annoScolastico ?? "").Replace(" ", "");
            if (a.Length < 4 || a.Equals("auto", StringComparison.OrdinalIgnoreCase) || ControllaAnno(a) != "") return null;
            string[] p = chiusura.Replace(" ", "").Split('/');
            int giorno = int.Parse(p[0]), mese = int.Parse(p[1]);
            int inizio = int.Parse(a.Substring(0, 4));
            int anno = (mese >= 9) ? inizio : inizio + 1;
            if (giorno > DateTime.DaysInMonth(anno, mese)) return null;
            return new DateTime(anno, mese, giorno);
        }

        /// <summary>
        /// Il foglio dell'anno c'e' gia'? Drive per desktop mostra i fogli Google come file
        /// .gsheet: se c'e' quello con il nome giusto, lo script per quest'anno ha gia' girato.
        /// </summary>
        public static bool FoglioSulPc(string drive, string annoScolastico, ParametriModulo p)
        {
            try
            {
                string radice = (drive ?? "").Trim().TrimEnd('\\');
                if (radice == "" || (p.NomeFoglio ?? "").Trim() == "") return false;
                string nome = p.NomeFoglio.Trim().Replace("{anno}", annoScolastico) + ".gsheet";
                if (nome.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return false;
                string cartella = radice;
                if (p.UsaDrive)
                {
                    cartella = Path.Combine(radice, (p.CartellaAnno ?? "A.S. {anno}").Replace("{anno}", annoScolastico));
                    string sotto = (p.CartellaFoglio ?? "").Trim().Replace('/', '\\').Trim('\\');
                    if (sotto != "") cartella = Path.Combine(cartella, sotto);
                }
                return File.Exists(Path.Combine(cartella, nome));
            }
            catch { return false; }
        }

        // ===================================================================
        //  IL CODICE
        // ===================================================================
        public static string Configurazione(ParametriModulo p)
        {
            string anno = (p.Anno ?? "").Replace(" ", "");
            if (anno == "" || anno.Equals("auto", StringComparison.OrdinalIgnoreCase)) anno = "auto";
            string cartella = (p.CartellaFoglio ?? "").Trim().Replace('\\', '/').Trim('/');
            string fuso = ((p.FusoOrario ?? "").Trim() == "") ? "Europe/Rome" : p.FusoOrario.Trim();

            StringBuilder sb = new StringBuilder();
            sb.Append(InizioConfig).Append("  (scritta da Campanella");
            if ((p.Modulo ?? "").Trim() != "")
                sb.Append(" per il modulo \"").Append(p.Modulo.Trim().Replace("\"", "'").Replace("*/", "* /")).Append("\"");
            sb.AppendLine(")");
            sb.AppendLine("var MODULO = {");
            Riga(sb, "anno", Testo(anno),
                 anno == "auto" ? "dal primo settembre passa da solo all'anno nuovo"
                                : "anno fisso: per l'anno dopo rigenera lo script, o scrivi \"auto\"");
            Riga(sb, "cartellaAnno", Testo(p.CartellaAnno), "nella radice di \"Il mio Drive\"");
            Riga(sb, "cartellaFoglio", Testo(cartella), "dentro la cartella dell'anno; \"\" = nella cartella dell'anno");
            Riga(sb, "nomeFoglio", Testo((p.NomeFoglio ?? "").Trim()), "");
            Riga(sb, "chiusura", Testo((p.Chiusura ?? "").Replace(" ", "")), "giorno/mese; \"\" = nessuna chiusura automatica");
            Riga(sb, "riapri", p.Riapri ? "true" : "false", "riapre il modulo alle risposte");
            Riga(sb, "svuotaRisposte", p.Svuota ? "true" : "false",
                 "toglie dal modulo le risposte degli anni scorsi, solo se gia' al sicuro in un foglio");
            Riga(sb, "fusoOrario", Testo(fuso), "");
            sb.AppendLine("  usaDrive:       " + (p.UsaDrive ? "true" : "false"));
            sb.AppendLine("};");
            sb.Append(FineConfig);
            return sb.ToString();
        }

        static void Riga(StringBuilder sb, string chiave, string valore, string commento)
        {
            string inizio = "  " + (chiave + ":").PadRight(16) + valore + ",";
            sb.AppendLine(commento == "" ? inizio : inizio.PadRight(58) + " // " + commento);
        }

        static string Testo(string s) { return "\"" + AnalisiOrario.Js(s ?? "") + "\""; }

        public static string Codice(ParametriModulo p)
        {
            return Codice(Guscio.LeggiRisorsa(Risorsa), p);
        }

        /// <summary>Il motore con la configurazione del docente al posto di quella d'esempio.</summary>
        public static string Codice(string motore, ParametriModulo p)
        {
            string testo = (motore ?? "").Replace("\r\n", "\n");
            int a = testo.IndexOf(InizioConfig, StringComparison.Ordinal);
            int b = testo.IndexOf(FineConfig, StringComparison.Ordinal);
            if (a < 0 || b < a) throw new Exception("Nel motore " + Risorsa + " manca il blocco della configurazione.");
            testo = testo.Substring(0, a) + Configurazione(p).Replace("\r\n", "\n") +
                    testo.Substring(b + FineConfig.Length);

            if (!p.UsaDrive) testo = SenzaDrive(testo);
            return testo.Replace("\n", "\r\n");
        }

        /// <summary>
        /// Toglie la parte che usa Drive. Google decide i permessi leggendo il
        /// codice (commenti compresi): finche' quella parte c'e', il permesso per
        /// Drive viene chiesto anche se non viene mai usata.
        /// </summary>
        static string SenzaDrive(string testo)
        {
            int a = testo.IndexOf(InizioDrive, StringComparison.Ordinal);
            int b = testo.IndexOf(FineDrive, StringComparison.Ordinal);
            if (a < 0 || b < a) throw new Exception("Nel motore " + Risorsa + " manca il blocco di Drive.");
            testo = testo.Substring(0, a).TrimEnd('\n') + "\n" + testo.Substring(b + FineDrive.Length).TrimStart('\n');

            testo = testo.Replace(
                " *    - lo mette nella cartella dell'anno, dentro \"Il mio Drive\";\n",
                " *    - lo lascia nella radice di \"Il mio Drive\": nella cartella dell'anno lo sposti tu;\n");
            testo = testo.Replace(
                " *    Drive ........ trovare o creare la cartella dell'anno e metterci il foglio\n",
                " *    (il permesso per Drive non viene chiesto: questa versione ne fa a meno)\n");
            if (testo.IndexOf("DriveApp", StringComparison.Ordinal) >= 0)
                throw new Exception("La versione senza Drive nomina ancora DriveApp: Google chiederebbe lo stesso il permesso.");
            return testo;
        }

        // ===================================================================
        //  IL PANNELLO: UN FOGLIO PER PIU' MODULI
        // ===================================================================
        public const string RisorsaPannello = "Pannello.gs";

        /// <summary>
        /// Il codice del foglio di controllo: una riga per modulo. Le impostazioni
        /// comuni (anno, cartella dell'anno, fuso) vengono dal primo, il resto
        /// finisce nelle righe.
        /// </summary>
        public static string CodicePannello(IList<ParametriModulo> moduli)
        {
            return CodicePannello(Guscio.LeggiRisorsa(RisorsaPannello), moduli);
        }

        public static string CodicePannello(string motore, IList<ParametriModulo> moduli)
        {
            if (moduli == null || moduli.Count == 0) throw new Exception("Non c'e' nessun modulo da mettere nel foglio.");
            string testo = (motore ?? "").Replace("\r\n", "\n");
            int a = testo.IndexOf(InizioConfig, StringComparison.Ordinal);
            int b = testo.IndexOf(FineConfig, StringComparison.Ordinal);
            if (a < 0 || b < a) throw new Exception("Nel motore " + RisorsaPannello + " manca il blocco della configurazione.");

            ParametriModulo primo = moduli[0];
            string fuso = ((primo.FusoOrario ?? "").Trim() == "") ? "Europe/Rome" : primo.FusoOrario.Trim();
            string anno = (primo.Anno ?? "").Replace(" ", "");
            if (anno == "" || anno.Equals("auto", StringComparison.OrdinalIgnoreCase)) anno = "auto";

            StringBuilder sb = new StringBuilder();
            sb.Append(InizioConfig).AppendLine("  (scritta da Campanella: Cartelle, passo 2)");
            sb.AppendLine("var PANNELLO = {");
            Riga(sb, "anno", Testo(anno),
                 anno == "auto" ? "dal primo settembre passa da solo all'anno nuovo" : "anno fisso");
            Riga(sb, "cartellaAnno", Testo(primo.CartellaAnno), "nella radice di \"Il mio Drive\"");
            Riga(sb, "chiusura", Testo((primo.Chiusura ?? "").Replace(" ", "")), "giorno/mese proposto alle righe di partenza; quelle che aggiungi tu solo se lo scrivi in Chiusura");
            Riga(sb, "fusoOrario", Testo(fuso), "");
            Riga(sb, "scheda", Testo("Moduli"), "la scheda di questo foglio con l'elenco");
            sb.AppendLine("  moduli: [                                      // le righe di partenza: poi comanda la scheda");
            for (int i = 0; i < moduli.Count; i++)
            {
                ParametriModulo p = moduli[i];
                sb.Append("    { modulo: ").Append(Testo((p.Modulo ?? "").Trim()))
                  .Append(", cartella: ").Append(Testo((p.CartellaFoglio ?? "").Trim().Replace('\\', '/').Trim('/')))
                  .Append(", foglio: ").Append(Testo((p.NomeFoglio ?? "").Trim()))
                  .Append(", chiusura: ").Append(Testo((p.Chiusura ?? "").Replace(" ", "")))
                  .Append(", svuota: ").Append(p.Svuota ? "true" : "false")
                  .AppendLine(i < moduli.Count - 1 ? " }," : " }");
            }
            sb.AppendLine("  ]");
            sb.AppendLine("};");
            sb.Append(FineConfig);

            testo = testo.Substring(0, a) + sb.ToString().Replace("\r\n", "\n") +
                    testo.Substring(b + FineConfig.Length);
            return testo.Replace("\n", "\r\n");
        }

        public static string ManifestPannello(ParametriModulo p)
        {
            string fuso = ((p.FusoOrario ?? "").Trim() == "") ? "Europe/Rome" : p.FusoOrario.Trim();
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("  \"timeZone\": \"" + AnalisiOrario.Js(fuso) + "\",");
            sb.AppendLine("  \"exceptionLogging\": \"STACKDRIVER\",");
            sb.AppendLine("  \"runtimeVersion\": \"V8\",");
            sb.AppendLine("  \"oauthScopes\": [");
            sb.AppendLine("    \"https://www.googleapis.com/auth/forms\",");
            sb.AppendLine("    \"https://www.googleapis.com/auth/spreadsheets\",");
            sb.AppendLine("    \"https://www.googleapis.com/auth/drive\",");
            sb.AppendLine("    \"https://www.googleapis.com/auth/script.scriptapp\"");
            sb.AppendLine("  ]");
            sb.AppendLine("}");
            return sb.ToString();
        }

        public static string IstruzioniPannello(IList<ParametriModulo> moduli, string annoAdesso)
        {
            int quanti = (moduli == null) ? 0 : moduli.Count;
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("UN FOGLIO SOLO PER TUTTI I MODULI, PASSO PER PASSO");
            sb.AppendLine("==================================================");
            sb.AppendLine();
            sb.AppendLine("A COSA SERVE, E QUANDO CONVIENE");
            sb.AppendLine("-------------------------------");
            sb.AppendLine("Invece di incollare uno script dentro ogni modulo, tieni un foglio Google con");
            sb.AppendLine("una riga per modulo: da li' prepari l'anno nuovo per tutti insieme e vedi a");
            sb.AppendLine("colpo d'occhio quali sono a posto.");
            sb.AppendLine();
            sb.AppendLine("Con un modulo solo conviene l'altra strada (voce 1 del menu): quello script sta");
            sb.AppendLine("dentro il modulo e chiede il permesso su quel modulo soltanto. Il pannello");
            sb.AppendLine("invece lavora su moduli che stanno fuori dal foglio, quindi Google gli chiede");
            sb.AppendLine("il permesso su TUTTI i moduli del tuo account. Lo script apre solo quelli che");
            sb.AppendLine("elenchi nella scheda, e il codice e' li' da leggere, ma il permesso e' quello:");
            sb.AppendLine("con pochi moduli il gioco non vale la candela.");
            sb.AppendLine();
            sb.AppendLine("PRIMA VOLTA");
            sb.AppendLine("-----------");
            sb.AppendLine("0.  Usa una finestra del browser in cui sei entrato SOLO con l'account della");
            sb.AppendLine("    scuola. Con due account aperti insieme Apps Script si confonde.");
            sb.AppendLine();
            sb.AppendLine("1.  Vai su drive.google.com e crea un foglio Google nuovo. Chiamalo per esempio");
            sb.AppendLine("    \"Campanella - Moduli\" e mettilo dove lo ritrovi (non dentro la cartella");
            sb.AppendLine("    dell'anno: questo foglio serve tutti gli anni).");
            sb.AppendLine();
            sb.AppendLine("2.  Nel foglio: menu Estensioni -> Apps Script. Si apre l'editor in una scheda");
            sb.AppendLine("    nuova. In  Codice.gs  cancella tutto e incolla \"Il codice del foglio di");
            sb.AppendLine("    controllo\" (qui, voce 4 del menu). Salva con Ctrl+S e dai un nome al");
            sb.AppendLine("    progetto, per esempio Campanella - Moduli.");
            sb.AppendLine();
            sb.AppendLine("3.  Scegli la funzione  PANNELLO_1_preparaIlFoglio  e premi Esegui. La prima");
            sb.AppendLine("    volta Google chiede le autorizzazioni: LASCIA TUTTE LE SPUNTE e consenti.");
            sb.AppendLine("    Torna al foglio: c'e' una scheda \"Moduli\" con le colonne pronte" +
                          (quanti > 0 ? " e " + (quanti == 1 ? "una riga" : quanti + " righe") + "." : "."));
            sb.AppendLine("    Ogni intestazione ha una nota che spiega la colonna (il triangolino).");
            sb.AppendLine("    Accanto c'e' la scheda \"Istruzioni\": i passi principali, cosa fare ogni");
            sb.AppendLine("    anno e durante l'anno, e cosa vuol dire ogni colonna. Resta nel foglio,");
            sb.AppendLine("    cosi' fra un anno non devi tornare qui. La scheda vuota \"Foglio1\" che");
            sb.AppendLine("    Google mette nei fogli nuovi la toglie lo script.");
            sb.AppendLine();
            sb.AppendLine("4.  Il link di ogni modulo. Due modi:");
            sb.AppendLine("      - dal menu Campanella -> \"Trova i moduli nel Drive\": li cerca dal nome");
            sb.AppendLine("        e riempie lui la colonna (se ce ne sono due con lo stesso nome te lo");
            sb.AppendLine("        dice e non sceglie a caso);");
            sb.AppendLine("      - oppure apri il modulo PER MODIFICARLO e copia il link dalla barra del");
            sb.AppendLine("        browser: finisce per /edit. Il link che dai agli studenti NON va bene:");
            sb.AppendLine("        e' un altro indirizzo e il foglio te lo dice.");
            sb.AppendLine();
            sb.AppendLine("5.  Controlla le righe: cartella, nome del foglio, giorno di chiusura, e le due");
            sb.AppendLine("    caselle. \"Attivo\" spento salta la riga; \"Svuota\" toglie dal modulo le");
            sb.AppendLine("    risposte degli anni scorsi, ma solo dopo aver controllato che stanno gia'");
            sb.AppendLine("    tutte in un foglio vecchio.");
            sb.AppendLine();
            sb.AppendLine("6.  Menu Campanella -> \"Anteprima\": dice cosa farebbe, senza fare niente.");
            sb.AppendLine("    Poi \"Prepara l'anno nuovo\". Nelle colonne Stato, Foglio dell'anno e");
            sb.AppendLine("    Ultima esecuzione trovi com'e' andata, riga per riga. In qualunque");
            sb.AppendLine("    momento, \"Controlla com'e' messo adesso\" rilegge la situazione vera.");
            sb.AppendLine();
            sb.AppendLine("OGNI ANNO, DAL PRIMO SETTEMBRE");
            sb.AppendLine("------------------------------");
            string annoFisso = (quanti > 0) ? (moduli[0].Anno ?? "").Replace(" ", "") : "";
            if (annoFisso.Equals("auto", StringComparison.OrdinalIgnoreCase)) annoFisso = "";
            if (annoFisso == "")
            {
                sb.AppendLine("Apri questo foglio e fai \"Prepara l'anno nuovo\". L'anno lo calcola da solo");
                sb.AppendLine("(adesso " + annoAdesso + "). Non serve reincollare il codice.");
            }
            else
            {
                sb.AppendLine("Attenzione: questo codice ha l'anno FISSO, " + annoFisso + ", perche' in Cartelle");
                sb.AppendLine("hai scritto un anno diverso da quello in corso. L'anno dopo NON cambia da");
                sb.AppendLine("solo: rigenera il codice da qui e incollalo di nuovo (oppure nel codice");
                sb.AppendLine("scrivi  anno: 'auto'), poi \"Prepara l'anno nuovo\".");
            }
            sb.AppendLine();
            sb.AppendLine("IL FOGLIO NON SI AGGIORNA DA SOLO");
            sb.AppendLine("---------------------------------");
            sb.AppendLine("Le righe le comandi tu, e solo quelle che ci sono vengono guardate.");
            sb.AppendLine("  - Un modulo nuovo: aggiungi una riga in fondo con il nome (e il giorno in");
            sb.AppendLine("    \"Chiusura\", se deve chiudersi da solo), poi \"Trova i moduli nel Drive\" (o");
            sb.AppendLine("    incolla il link), controlla cartella e nome del foglio e rifai \"Prepara");
            sb.AppendLine("    l'anno nuovo\". La spunta \"Attivo\" la mette lo script: una riga nuova");
            sb.AppendLine("    parte accesa. Le righe gia' pronte quest'anno non vengono ricollegate, e");
            sb.AppendLine("    un modulo gia' chiuso (dalla sua chiusura o a mano) resta chiuso.");
            sb.AppendLine("  - Un modulo che non ti serve piu': togli la spunta \"Attivo\". La riga resta");
            sb.AppendLine("    li' con la sua storia e viene saltata. Cancellare la riga si puo', ma");
            sb.AppendLine("    cosi' perdi il link al foglio delle risposte di quell'anno.");
            sb.AppendLine("  - Le colonne Stato, Foglio dell'anno e Ultima esecuzione sono un diario:");
            sb.AppendLine("    dicono com'e' andata l'ultima volta che hai eseguito qualcosa. Se cambi");
            sb.AppendLine("    qualcosa a mano in Google Moduli, restano indietro finche' non fai");
            sb.AppendLine("    \"Controlla com'e' messo adesso\", che rilegge tutto e riscrive le righe.");
            sb.AppendLine("    Quel comando legge e basta: non tocca niente.");
            sb.AppendLine();
            sb.AppendLine("SE UN MODULO HA GIA' LO SCRIPT DENTRO DI SE'");
            sb.AppendLine("--------------------------------------------");
            sb.AppendLine("Capita se prima avevi usato l'altra strada (voce 1 del menu di Campanella).");
            sb.AppendLine("I due script non si vedono fra loro: uno vive nel modulo, l'altro qui.");
            sb.AppendLine("Comandarne uno solo e' la regola; averli tutti e due non rompe niente, ma il");
            sb.AppendLine("modulo verrebbe chiuso due volte a fine anno e, se cartella o nome del foglio");
            sb.AppendLine("non coincidono, ti ritroveresti due fogli per lo stesso anno.");
            sb.AppendLine();
            sb.AppendLine("Per passare il comando a questo foglio, in tre mosse:");
            sb.AppendLine("  1. apri il modulo, menu Campanella -> \"Passa il comando al foglio di");
            sb.AppendLine("     controllo\": toglie solo la chiusura programmata da li'. Il foglio delle");
            sb.AppendLine("     risposte resta collegato e il modulo non cambia;");
            sb.AppendLine("  2. nella riga di questo foglio scrivi la STESSA cartella e lo STESSO nome");
            sb.AppendLine("     del foglio che usava prima (li vedi nel modulo, scheda Risposte);");
            sb.AppendLine("  3. \"Prepara l'anno nuovo\". Riconosce il foglio gia' collegato e lo adotta:");
            sb.AppendLine("     non ne crea un altro e non ricollega niente.");
            sb.AppendLine();
            sb.AppendLine("Se invece preferisci tenere lo script dentro quel modulo, basta togliere la");
            sb.AppendLine("spunta \"Attivo\" alla sua riga qui: il foglio lo salta e non lo tocca.");
            sb.AppendLine();
            sb.AppendLine("ATTENZIONE se hai cancellato il codice dentro il modulo. Cancellare il codice");
            sb.AppendLine("NON toglie la chiusura che quello script aveva gia' programmato: resta li',");
            sb.AppendLine("e quando scatta non trova piu' la funzione da chiamare. Non combina danni,");
            sb.AppendLine("ma ti arriva una email di errore da Google. Toglila a mano: apri il modulo,");
            sb.AppendLine("tre puntini -> Apps Script, nella colonna di sinistra l'icona dell'orologio");
            sb.AppendLine("(Attivazioni / Triggers), e cancella la riga di MODULO_chiusura. Il foglio");
            sb.AppendLine("delle risposte resta collegato: e' quello che serve perche' il pannello lo");
            sb.AppendLine("riconosca.");
            sb.AppendLine();
            sb.AppendLine("LE ATTIVAZIONI: CHI E' CHI");
            sb.AppendLine("--------------------------");
            sb.AppendLine("Nell'editor di Apps Script, l'icona dell'orologio (Attivazioni) mostra SOLO");
            sb.AppendLine("le attivazioni del progetto che stai guardando, non tutte quelle del tuo");
            sb.AppendLine("account. Prima di cancellarne una, guarda il nome della funzione:");
            sb.AppendLine("  PANNELLO_chiusura ......... e' di questo foglio. Se la togli, le chiusure");
            sb.AppendLine("                              di fine anno non scattano piu': si rimettono");
            sb.AppendLine("                              con \"Prepara l'anno nuovo\".");
            sb.AppendLine("  MODULO_chiusura ........... e' dello script dentro un modulo. Si toglie");
            sb.AppendLine("                              quando quel modulo passa sotto questo foglio.");
            sb.AppendLine("  smistaNuoviMessaggi ....... e' dello strumento Posta: etichetta la posta");
            sb.AppendLine("                              nuova ogni ora. Si rimette con");
            sb.AppendLine("                              PASSO_4_attivaAutomazione.");
            sb.AppendLine("  PASSO_3_riordinaPosta... .. sempre Posta: riprende il riordino quando");
            sb.AppendLine("                              finisce il tempo. Si ricrea da sola.");
            sb.AppendLine("  ORARI_2_invia ............. strumento Orari: riprende l'invio. Idem.");
            sb.AppendLine();
            sb.AppendLine("SE UN MODULO SPARISCE DURANTE L'ANNO");
            sb.AppendLine("------------------------------------");
            sb.AppendLine("Se lo butti nel cestino o lo cancelli, lo script non si blocca: la sua riga");
            sb.AppendLine("dice \"non lo trovo\" oppure \"e' nel cestino del Drive\", le altre vengono");
            sb.AppendLine("preparate lo stesso, e la chiusura programmata per quel modulo viene tolta.");
            sb.AppendLine("Il foglio delle risposte NON sparisce con il modulo: resta nel Drive con");
            sb.AppendLine("tutto quello che era arrivato fino a quel momento. Togli la spunta \"Attivo\"");
            sb.AppendLine("alla riga e sei a posto.");
            sb.AppendLine();
            sb.AppendLine("LE CHIUSURE");
            sb.AppendLine("-----------");
            sb.AppendLine("Lo script programma una chiusura per ogni data diversa che trova nelle righe.");
            sb.AppendLine("Quando arriva il giorno, chiude i moduli scaduti e scollega i loro fogli; gli");
            sb.AppendLine("altri restano aperti. Tutto questo gira a nome tuo, anche se il modulo ha altri");
            sb.AppendLine("editor: i fogli nascono nel TUO Drive.");
            sb.AppendLine();
            sb.AppendLine("SE QUALCOSA NON VA");
            sb.AppendLine("------------------");
            sb.AppendLine("Ogni problema resta nella sua riga, nella colonna Stato, e le altre righe");
            sb.AppendLine("vengono preparate lo stesso.");
            sb.AppendLine("\"Questa app e' bloccata\": la scuola limita i permessi degli script. Il");
            sb.AppendLine("pannello ne chiede di piu' dello script dentro il modulo: se la scuola blocca,");
            sb.AppendLine("la strada piu' facile e' tornare a quello (voce 1 e 2 del menu).");
            sb.AppendLine("Per tornare indietro: menu Campanella -> \"Annulla\". Toglie le chiusure");
            sb.AppendLine("programmate e scollega i fogli. Non cancella niente.");
            return sb.ToString();
        }

        /// <summary>
        /// Facoltativo: il file appsscript.json con l'elenco esatto dei permessi.
        /// Senza, Google li ricava dal codice e sceglie quelli larghi (tutti i
        /// moduli dell'account); con questo, lo script puo' toccare solo il
        /// modulo in cui si trova.
        /// </summary>
        public static string Manifest(ParametriModulo p)
        {
            string fuso = ((p.FusoOrario ?? "").Trim() == "") ? "Europe/Rome" : p.FusoOrario.Trim();
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("  \"timeZone\": \"" + AnalisiOrario.Js(fuso) + "\",");
            sb.AppendLine("  \"exceptionLogging\": \"STACKDRIVER\",");
            sb.AppendLine("  \"runtimeVersion\": \"V8\",");
            sb.AppendLine("  \"oauthScopes\": [");
            sb.AppendLine("    \"https://www.googleapis.com/auth/forms.currentonly\",");
            sb.AppendLine("    \"https://www.googleapis.com/auth/spreadsheets\",");
            if (p.UsaDrive) sb.AppendLine("    \"https://www.googleapis.com/auth/drive\",");
            sb.AppendLine("    \"https://www.googleapis.com/auth/script.scriptapp\"");
            sb.AppendLine("  ]");
            sb.AppendLine("}");
            return sb.ToString();
        }

        // ===================================================================
        //  LE ISTRUZIONI
        // ===================================================================
        public static string Istruzioni(ParametriModulo p, string annoAdesso)
        {
            string nome = (p.Modulo ?? "").Trim();
            string modulo = (nome == "") ? "il modulo" : "il modulo \"" + nome + "\"";
            string annoScritto = (p.Anno ?? "").Replace(" ", "");
            bool fisso = annoScritto != "" && !annoScritto.Equals("auto", StringComparison.OrdinalIgnoreCase);

            StringBuilder sb = new StringBuilder();
            sb.AppendLine("IL FOGLIO DELLE RISPOSTE DELL'ANNO NUOVO, PASSO PER PASSO");
            sb.AppendLine("==========================================================");
            sb.AppendLine();
            sb.AppendLine("PRIMA VOLTA  (una volta sola per ogni modulo)");
            sb.AppendLine("---------------------------------------------");
            sb.AppendLine("0.  Usa una finestra del browser in cui sei entrato SOLO con l'account della");
            sb.AppendLine("    scuola (una finestra in incognito va bene). Con due account aperti insieme");
            sb.AppendLine("    Apps Script si confonde: l'editor non si apre, o i permessi girano a vuoto.");
            sb.AppendLine();
            if (p.UsaDrive)
            {
                sb.AppendLine("1.  Crea prima le cartelle dell'anno (passo 1) e aspetta che Google Drive le");
                sb.AppendLine("    abbia caricate: in Esplora file la cartella dell'anno ha il segno di");
                sb.AppendLine("    spunta verde. Se lo script gira prima, le cartelle le crea lui e poi il PC");
                sb.AppendLine("    carica le sue: te ne ritrovi due con lo stesso nome (sul PC la seconda");
                sb.AppendLine("    compare con \"(1)\" in coda).");
            }
            else
            {
                sb.AppendLine("1.  Hai scelto di fare a meno del permesso per Drive: il foglio nascera'");
                sb.AppendLine("    nella radice di \"Il mio Drive\" e lo sposterai tu nella cartella dell'anno.");
            }
            sb.AppendLine();
            sb.AppendLine("2.  Apri " + modulo + " in Google Moduli, per modificarlo (non il link che dai");
            sb.AppendLine("    agli studenti). In alto a destra: i tre puntini -> \"Apps Script\" (in alcune");
            sb.AppendLine("    versioni si chiama \"Editor di script\"). Si apre l'editor, in una scheda nuova.");
            sb.AppendLine("    Se la voce non c'e', la scuola ha spento Apps Script: serve l'amministratore.");
            sb.AppendLine();
            sb.AppendLine("3.  Nel file  Codice.gs  cancella tutto quello che c'e' e incolla \"Il codice da");
            sb.AppendLine("    incollare nel modulo\" (qui, voce 1 del menu). Salva con Ctrl+S.");
            sb.AppendLine("    In alto, al posto di \"Progetto senza titolo\", dagli un nome: per esempio");
            sb.AppendLine("    Campanella - " + (nome == "" ? "modulo" : nome) + ".");
            sb.AppendLine();
            sb.AppendLine("4.  Nella barra in alto scegli la funzione  MODULO_1_anteprima  e premi Esegui.");
            sb.AppendLine("    La prima volta Google chiede le autorizzazioni: scegli il tuo account e");
            sb.AppendLine("    LASCIA TUTTE LE SPUNTE, poi Consenti. I permessi che chiede:");
            sb.AppendLine("      - Moduli: leggere e collegare il modulo;");
            sb.AppendLine("      - Fogli:  creare il foglio delle risposte;");
            if (p.UsaDrive)
                sb.AppendLine("      - Drive:  trovare o creare la cartella dell'anno e metterci il foglio;");
            sb.AppendLine("      - attivita' programmate: la chiusura di fine anno.");
            sb.AppendLine("    Se togli una spunta lo script se ne accorge e si ferma: la chiusura gira da");
            sb.AppendLine("    sola fra un anno, e senza un permesso fallirebbe senza che nessuno lo veda.");
            sb.AppendLine("    Con un account personale (non della scuola) compare anche \"Google non ha");
            sb.AppendLine("    verificato questa app\": Avanzate -> Apri ... (non sicura). Vuol dire solo");
            sb.AppendLine("    che lo script e' tuo e Google non l'ha esaminato.");
            sb.AppendLine("    E' un progetto a parte da quello della posta: i permessi non si sommano.");
            sb.AppendLine();
            sb.AppendLine("5.  Leggi il \"Registro di esecuzione\" in basso: dice cosa farebbe, senza fare");
            sb.AppendLine("    niente. Controlla l'anno, la cartella e il nome del foglio.");
            sb.AppendLine();
            sb.AppendLine("6.  Scegli  MODULO_2_prepara  ed Esegui. Crea il foglio, lo collega al modulo,");
            sb.AppendLine("    riapre il modulo se era chiuso e programma la chiusura.");
            sb.AppendLine();
            sb.AppendLine("7.  Controlla: nel modulo, scheda Risposte -> \"Visualizza in Fogli\" apre il");
            sb.AppendLine("    foglio nuovo. Dopo qualche minuto lo vedi anche sul PC, nella cartella, e");
            sb.AppendLine("    qui sopra la riga di riepilogo diventa verde.");
            sb.AppendLine();
            sb.AppendLine("OGNI ANNO, DAL PRIMO SETTEMBRE");
            sb.AppendLine("------------------------------");
            if (fisso)
            {
                sb.AppendLine("Questo script e' fermo sull'anno " + annoScritto + " perche' lo hai scritto a mano nel passo 1.");
                sb.AppendLine("L'anno dopo torna qui, rigenera il codice e incollalo al posto di questo;");
                sb.AppendLine("oppure nel codice cambia  anno: \"" + annoScritto + "\"  in  anno: \"auto\".");
            }
            else
            {
                sb.AppendLine("Non serve reincollare niente. Apri il modulo per modificarlo, aspetta qualche");
                sb.AppendLine("secondo: fra le icone in alto c'e' quella a forma di pezzo di puzzle");
                sb.AppendLine("(Componenti aggiuntivi), con dentro Campanella -> \"Prepara l'anno nuovo\".");
                sb.AppendLine("Se non compare, ricarica la pagina. L'anno lo calcola da solo (adesso " + annoAdesso + "),");
                sb.AppendLine("te lo mostra e chiede conferma. In alternativa: dall'editor, MODULO_2_prepara.");
                sb.AppendLine("Il codice va rigenerato e reincollato solo se cambi i nomi delle cartelle o");
                sb.AppendLine("del foglio, o quando una nuova versione di Campanella lo dice.");
            }
            sb.AppendLine("Lo fa sempre la stessa persona: la chiusura programmata e il foglio");
            sb.AppendLine("appartengono a chi ha eseguito lo script. Se il modulo ha altri editor e il");
            sb.AppendLine("menu lo usa un collega, foglio e cartelle nascono nel SUO Drive.");
            sb.AppendLine();
            sb.AppendLine("LE RISPOSTE DEGLI ANNI SCORSI");
            sb.AppendLine("-----------------------------");
            sb.AppendLine("Le risposte restano dentro il modulo anche dopo che il foglio e' stato");
            sb.AppendLine("scollegato: quando colleghi un foglio nuovo, Google ce le ricopia tutte.");
            if (p.Svuota)
            {
                sb.AppendLine("Hai scelto di svuotare il modulo: lo script lo fa solo se trova un foglio");
                sb.AppendLine("degli anni scorsi che le contiene gia' tutte. Se non lo trova non tocca");
                sb.AppendLine("niente e te lo dice. Togliere le risposte dal modulo non si puo' annullare:");
                sb.AppendLine("nel foglio vecchio pero' restano.");
            }
            else
            {
                sb.AppendLine("Non hai chiesto di svuotare il modulo: il foglio nuovo comincera' con le");
                sb.AppendLine("risposte vecchie in cima. L'anteprima dice quante sono.");
            }
            sb.AppendLine();
            sb.AppendLine("SE UN GIORNO PASSI AL FOGLIO DI CONTROLLO");
            sb.AppendLine("-----------------------------------------");
            sb.AppendLine("Con piu' moduli si puo' preferire il foglio unico (voci 4 e 5 del menu in");
            sb.AppendLine("Campanella). I due script non si vedono fra loro: se tutti e due seguono lo");
            sb.AppendLine("stesso modulo, a fine anno lo chiudono due volte. Prima di mettere questo");
            sb.AppendLine("modulo nel foglio, apri qui il menu Campanella -> \"Passa il comando al foglio");
            sb.AppendLine("di controllo\": toglie la chiusura programmata da qui e lascia tutto il resto");
            sb.AppendLine("com'e'. Poi nella riga del foglio scrivi la stessa cartella e lo stesso nome,");
            sb.AppendLine("cosi' riconosce il foglio delle risposte gia' collegato e non ne crea un altro.");
            sb.AppendLine("Cancellare il codice da qui NON basta: la chiusura gia' programmata resta e,");
            sb.AppendLine("quando scatta, non trova piu' la funzione, quindi Google ti manda una email");
            sb.AppendLine("di errore. Se l'hai gia' cancellato, togli la chiusura a mano: nell'editor,");
            sb.AppendLine("colonna di sinistra, l'icona dell'orologio (Attivazioni), cancella la riga di");
            sb.AppendLine("MODULO_chiusura.");
            sb.AppendLine();
            sb.AppendLine("PER CHIEDERE MENO PERMESSI  (facoltativo)");
            sb.AppendLine("-----------------------------------------");
            sb.AppendLine("Google ricava i permessi dal codice e sceglie quelli larghi: \"tutti i tuoi");
            sb.AppendLine("moduli\". Si puo' restringere a \"solo questo modulo\": nell'editor, rotellina");
            sb.AppendLine("(Impostazioni progetto) -> spunta \"Mostra il file manifest appsscript.json\";");
            sb.AppendLine("torna all'editor, apri  appsscript.json  e sostituisci tutto con la voce 3 del");
            sb.AppendLine("menu qui sopra. Salva e riesegui MODULO_1_anteprima. Se poi compare un errore");
            sb.AppendLine("di permessi, togli dal file le righe di \"oauthScopes\" e torna come prima.");
            sb.AppendLine();
            sb.AppendLine("SE QUALCOSA NON VA");
            sb.AppendLine("------------------");
            sb.AppendLine("\"Questa app e' bloccata\" / \"Accesso bloccato: l'amministratore del tuo istituto");
            sb.AppendLine("deve esaminare...\": la scuola limita i permessi degli script. Dipende da chi");
            sb.AppendLine("amministra Google Workspace (Console di amministrazione -> Sicurezza ->");
            sb.AppendLine("Controlli API: \"Considera attendibili le app interne\"; e il personale va");
            sb.AppendLine("indicato come maggiorenne, altrimenti vale il blocco pensato per gli studenti).");
            if (p.UsaDrive)
            {
                sb.AppendLine("\"Access denied: DriveApp\" / \"The domain policy has disabled third-party Drive");
                sb.AppendLine("apps\": la scuola ha spento l'accesso a Drive per gli script. Togli la spunta");
                sb.AppendLine("\"metti il foglio nella cartella dell'anno\", rigenera e reincolla: quella");
                sb.AppendLine("versione Drive non lo usa, e il foglio lo sposti tu.");
            }
            sb.AppendLine("Due cartelle con lo stesso nome: lo script e' girato prima che il PC caricasse");
            sb.AppendLine("la sua. Sposta il foglio in quella giusta e butta quella vuota.");
            sb.AppendLine("Il modulo non e' pubblicato: lo script non lo pubblica al posto tuo. Fallo tu");
            sb.AppendLine("da Google Moduli quando e' pronto.");
            sb.AppendLine("Per tornare indietro:  MODULO_ANNULLA  toglie la chiusura programmata e");
            sb.AppendLine("scollega il foglio. Non cancella niente: foglio e cartelle restano dove sono.");
            return sb.ToString();
        }
    }
}
