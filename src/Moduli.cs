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
