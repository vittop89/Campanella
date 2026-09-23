// ===========================================================================
//  GeneratoreAnno.cs - le cartelle del nuovo anno scolastico, sul disco
//
//  Il lavoro vero della pagina Cartelle (passo 1), tenuto fuori dalla
//  pagina: niente finestre, cosi' si prova da solo (test\prova_cartelle.ps1)
//  su un Drive finto dentro una cartella temporanea.
//
//  Regola di fondo: non sovrascrive e non cancella mai niente. Cartelle e
//  file che ci sono gia' restano come sono, e il conto li tiene a parte
//  ("gia' presenti") da quelli creati adesso.
//
//  L'unica eccezione e' la nota "DUPLICA IN GOOGLE DOCS" di un gruppo di
//  modelli: quando in MODELLI cambiano i documenti da duplicare la riscrive,
//  ma solo se e' ancora come l'ha scritta Campanella (lo dice il codice
//  nell'ultima riga). Se l'hai modificata tu, resta la tua.
//
//  Tutto finisce dentro "A.S. <anno>": le voci di struttura.json, le classi,
//  le materie e le cartelle in piu' sono controllate prima (niente percorsi
//  assoluti, niente "..", niente caratteri o nomi che Windows non accetta).
// ===========================================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Campanella
{
    class RisultatoGenerazione
    {
        public string Cartella = "";
        /// <summary>Cartelle create, file copiati e note scritte in questo giro.</summary>
        public int Creati = 0;
        /// <summary>Quelli che c'erano gia': lasciati come sono.</summary>
        public int GiaPresenti = 0;
        public List<string> Errori = new List<string>();
        /// <summary>Le righe di "Cosa sta succedendo", nell'ordine.</summary>
        public List<string> Registro = new List<string>();
    }

    /// <summary>Una cartella fissa dell'anno, come la scrive struttura.json.</summary>
    class VoceStruttura { public string Nome = ""; public bool Spuntata = true; }

    class GeneratoreAnno
    {
        /// <summary>La sottocartella di MODELLI i cui file vanno dentro ogni classe.</summary>
        public const string CartellaPerClasse = "PER CLASSE";

        /// <summary>L'inizio dell'ultima riga delle note scritte da Campanella.</summary>
        const string FirmaNota = "(Nota scritta da Campanella, codice ";

        /// <summary>
        /// Chiamata per ogni riga del registro mentre il lavoro va avanti, dal
        /// thread che lavora. Puo' restare null.
        /// </summary>
        public Action<string> Avanzamento;

        /// <summary>
        /// Messo a true da un altro thread (la finestra che si chiude): il lavoro
        /// finisce il file che sta copiando e si ferma prima del successivo.
        /// </summary>
        public volatile bool Interrompi;

        static readonly string[] NomiRiservati =
        {
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
        };

        RisultatoGenerazione res;
        string cartellaAnno = "";
        // le cartelle gia' contate in questo giro: ognuna conta una volta sola,
        // fra quelle create o fra quelle che c'erano gia'
        Dictionary<string, bool> contate = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);

        // ===================================================================
        /// <summary>
        /// Crea "A.S. &lt;anno&gt;" dentro drive, con le cartelle fisse, quelle in
        /// piu', le classi con le materie e i recuperi, e ci copia i modelli dei
        /// gruppi scelti. Il percorso del Drive va sempre dato: qui non si
        /// indovina niente.
        /// </summary>
        public RisultatoGenerazione Genera(string anno, string drive, string classiText,
            List<string> gruppi, List<string> struttura, string extraText)
        {
            res = new RisultatoGenerazione();
            contate = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            anno = (anno ?? "").Trim();
            if (anno == "") throw new Exception("Manca l'anno scolastico (per esempio 2026-27).");
            string radice = (drive ?? "").Trim().TrimEnd('\\');
            if (radice == "") throw new Exception("Manca il percorso di \"Il mio Drive\".");
            if (radice.EndsWith(":")) radice += "\\";
            if (!Directory.Exists(radice)) throw new Exception("Percorso non trovato: " + radice);

            string modelli = Path.Combine(radice, "MODELLI");
            bool conModelli = Directory.Exists(modelli);
            if (!conModelli)
                Riga("Nota: non c'e' la cartella MODELLI in " + radice + ": creo solo le cartelle.");
            List<string> perClasse = new List<string>();
            if (conModelli)
            {
                try { perClasse = ModelliPerClasse(modelli); }
                catch (Exception ex) { Errore("Non riesco a leggere MODELLI\\" + CartellaPerClasse + ": " + ex.Message); }
            }
            if (perClasse.Count > 0)
                Riga("Modelli da copiare in ogni classe: " + perClasse.Count);

            // una classe per riga: il punto e virgola separa solo le materie
            // ("1A: Matematica; Fisica"), mai le classi
            List<string> classi = new List<string>();
            foreach (string riga in (classiText ?? "").Split(new char[] { '\r', '\n' }))
            {
                string r = riga.Trim();
                if (r != "") classi.Add(r);
            }
            if (classi.Count == 0)
                throw new Exception("Scrivi almeno una classe (per esempio  1A: Matematica, Fisica).");

            string problemaAnno = ControllaNome("A.S. " + anno);
            if (problemaAnno != "") throw new Exception("Anno scolastico non valido [" + anno + "]: " + problemaAnno);
            string target = Path.Combine(radice, "A.S. " + anno);
            res.Cartella = target;
            cartellaAnno = target;
            if (Directory.Exists(target))
            {
                Riga("La cartella esiste gia': aggiungo solo cio' che manca.");
                res.GiaPresenti++;
            }
            else
            {
                // senza la cartella dell'anno non c'e' altro da fare: se non si
                // crea, l'eccezione ferma tutto e la pagina la mostra
                Directory.CreateDirectory(target);
                res.Creati++;
            }

            foreach (string d in (struttura ?? new List<string>()))
            {
                string problema = ControllaVoce(d);
                if (problema != "") { Errore("Cartella dell'anno non valida [" + d + "]: " + problema); continue; }
                Cartella(Path.Combine(target, NormalizzaVoce(d)));
            }
            Riga("Struttura: " + target);

            if (extraText != null && extraText.Trim() != "")
            {
                foreach (string e in extraText.Split(new char[] { ',', ';', '\n', '\r' }))
                {
                    string ee = e.Trim();
                    if (ee == "") continue;
                    string problema = ControllaNome(ee);
                    if (problema != "")
                    {
                        Errore("Cartella in piu' non valida [" + ee + "]: " + problema);
                        continue;
                    }
                    if (Cartella(Path.Combine(target, ee))) Riga("Cartella in piu': " + ee);
                }
            }

            foreach (string c in classi)
            {
                Fermati();
                UnaClasse(c, target, perClasse);
            }

            if (conModelli && gruppi != null)
            {
                foreach (string nome in gruppi)
                {
                    Fermati();
                    if (nome.Equals(CartellaPerClasse, StringComparison.OrdinalIgnoreCase)) continue;
                    try { UnGruppo(nome, modelli, target, perClasse); }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception ex) { Errore("Modelli di " + nome + ": " + ex.Message); }
                }
            }
            return res;
        }

        // -------------------------------------------------------------------
        void UnaClasse(string c, string target, List<string> perClasse)
        {
            string nomeClasse = c;
            List<string> materie = new List<string>();
            List<string> sembranoClassi = new List<string>();
            int idx = c.IndexOf(':');
            if (idx > 0)
            {
                nomeClasse = c.Substring(0, idx).Trim();
                // con la 1.4.x il punto e virgola separava le classi, e
                // "1A: Matematica; 2B" erano due classi: un pezzo dopo il punto e
                // virgola fatto come una classe (2B, 4Ar, 2B-Ls) non diventa una
                // materia della 1A
                string resto = c.Substring(idx + 1);
                bool conPuntoEVirgola = resto.IndexOf(';') >= 0;
                foreach (string pezzo in resto.Split(';'))
                {
                    if (conPuntoEVirgola && Regex.IsMatch(pezzo.Trim(), @"^\d+\s*[A-Za-z]"))
                    {
                        sembranoClassi.Add(pezzo.Trim());
                        continue;
                    }
                    foreach (string m in pezzo.Split(','))
                    {
                        string mm = m.Trim();
                        if (mm != "") materie.Add(mm);
                    }
                }
            }
            string problema = ControllaNome(nomeClasse);
            if (problema != "")
            {
                Errore("Classe non valida: [" + c + "]: " + problema);
                return;
            }
            // "1A; 2B" o "1A, 2B" su una riga sola: sono due classi scritte di
            // seguito, non una classe con quel nome. Meglio dirlo che creare
            // nel Drive una cartella "1A; 2B" che poi resta li'.
            if (nomeClasse.IndexOfAny(new char[] { ';', ',' }) >= 0)
            {
                Errore("Classe non valida: [" + c + "]: una classe per riga, le materie dopo i due punti");
                return;
            }
            foreach (string s in sembranoClassi)
                Errore("Materia non valida in [" + c + "]: " + s +
                       " (sembra una classe: una classe per riga, le materie dopo i due punti)");

            string dirClasse = Path.Combine(target, "CLASSI", nomeClasse);
            string trimestre = Path.Combine(target, "RECUPERI", "TRIMESTRE", nomeClasse);
            string pentamestre = Path.Combine(target, "RECUPERI", "PENTAMESTRE", nomeClasse);
            if (!Cartella(dirClasse)) return;
            Cartella(trimestre);
            Cartella(pentamestre);

            string elenco = "";
            foreach (string m in materie)
            {
                string problemaMateria = ControllaNome(m);
                if (problemaMateria != "")
                {
                    Errore("Materia non valida in [" + c + "]: " + m + " (" + problemaMateria + ")");
                    continue;
                }
                Cartella(Path.Combine(dirClasse, m));
                Cartella(Path.Combine(trimestre, m));
                Cartella(Path.Combine(pentamestre, m));
                if (elenco != "") elenco += ", ";
                elenco += m;
            }

            // i modelli "per classe": ogni file entra nella cartella della classe
            // con il nome della classe in coda. I documenti Google non si copiano
            // come file normali: per quelli resta una nota con cosa duplicare.
            List<string> daDuplicare = new List<string>();
            foreach (string src in perClasse)
            {
                if (EFileGoogle(src)) { daDuplicare.Add(Path.GetFileName(src)); continue; }
                string dest = Path.Combine(dirClasse,
                    Path.GetFileNameWithoutExtension(src) + " " + nomeClasse + Path.GetExtension(src));
                if (CopiaFile(src, dest, "Classe " + nomeClasse + ", " + Path.GetFileName(src)))
                    Riga("  classe " + nomeClasse + ": copiato " + Path.GetFileName(dest));
            }
            if (daDuplicare.Count > 0)
            {
                string percorsoNota = Path.Combine(dirClasse, "DUPLICA IN GOOGLE DOCS - " + nomeClasse + ".txt");
                if (File.Exists(percorsoNota)) res.GiaPresenti++;
                else
                {
                    List<string> righe = new List<string>();
                    righe.Add("Per la classe " + nomeClasse + ": duplicare in Google Drive (tasto destro ->");
                    righe.Add("Crea una copia) questi documenti di MODELLI\\" + CartellaPerClasse +
                              " e aggiungere \"" + nomeClasse + "\" al nome:");
                    righe.Add("");
                    foreach (string g in daDuplicare) righe.Add("- " + g);
                    try
                    {
                        File.WriteAllLines(percorsoNota, righe.ToArray(), Encoding.UTF8);
                        res.Creati++;
                    }
                    catch (Exception ex)
                    {
                        Errore("Classe " + nomeClasse + ", nota dei documenti da duplicare: " + ex.Message);
                    }
                }
            }

            Riga("Classe: " + nomeClasse + (elenco != "" ? " -> " + elenco : ""));
        }

        // -------------------------------------------------------------------
        void UnGruppo(string nome, string modelli, string target, List<string> perClasse)
        {
            string g = Path.Combine(modelli, nome);
            if (!Directory.Exists(g)) { Errore("Modello non trovato: " + g); return; }
            string dest = Path.Combine(target, nome);
            List<string> google = new List<string>();

            foreach (string f in Directory.GetFiles(g))
            {
                if (EFileGoogle(f)) { google.Add(Path.GetFileName(f)); continue; }
                if (perClasse.Contains(f)) continue;     // gia' copiato dentro ogni classe
                if (!Cartella(dest)) return;
                string df = Path.Combine(dest, Path.GetFileName(f));
                if (CopiaFile(f, df, "Copia di " + nome + "\\" + Path.GetFileName(f)))
                    Riga("  copiato: " + nome + "\\" + Path.GetFileName(f));
            }

            foreach (string sd in Directory.GetDirectories(g))
            {
                // la cartella del gruppo si conta qui, non fra gli elementi della sottocartella
                if (!Cartella(dest)) return;
                int prima = res.Creati;
                CopiaCartella(sd, Path.Combine(dest, Path.GetFileName(sd)), google,
                              Path.GetFileName(sd) + "\\");
                if (res.Creati > prima)
                    Riga("  copiato: " + nome + "\\" + Path.GetFileName(sd) + "\\  (" +
                         (res.Creati - prima) + " elementi nuovi)");
            }

            if (google.Count == 0) return;

            // i moduli non si duplicano: restano in MODELLI e ogni anno ricevono un
            // foglio delle risposte nuovo (passo 2). Gli altri documenti si copiano a mano.
            List<string> documenti = new List<string>(), moduli = new List<string>();
            foreach (string gf in google)
            {
                if (gf.EndsWith(".gform", StringComparison.OrdinalIgnoreCase)) moduli.Add(gf);
                else documenti.Add(gf);
            }
            if (!Cartella(dest)) return;
            List<string> righe = new List<string>();
            if (documenti.Count > 0)
            {
                righe.Add("Duplicare in Google Drive (tasto destro -> Crea una copia) questi file:");
                righe.Add("(i documenti Google non si possono copiare come file normali)");
                righe.Add("");
                foreach (string gf in documenti) righe.Add("- " + gf);
            }
            if (moduli.Count > 0)
            {
                if (righe.Count > 0) righe.Add("");
                righe.Add("Moduli Google: NON vanno duplicati. Il modulo resta in MODELLI\\" + nome + " e ogni");
                righe.Add("anno riceve un foglio delle risposte nuovo, con lo script che si prepara in");
                righe.Add("Campanella -> Cartelle -> passo 2 (\"I moduli Google\"):");
                righe.Add("");
                foreach (string gf in moduli) righe.Add("- " + gf);
            }
            NotaDelGruppo(Path.Combine(dest, "DUPLICA IN GOOGLE DOCS - " + nome + ".txt"), righe, google);
            if (documenti.Count > 0)
                Riga("  " + documenti.Count + " documenti Google da duplicare a mano (vedi la nota)");
            if (moduli.Count > 0)
                Riga("  " + moduli.Count + " moduli Google: per il foglio delle risposte c'e' il passo 2");
        }

        /// <summary>
        /// Scrive la nota di un gruppo se non c'e', o se e' ancora come l'ha
        /// scritta Campanella e l'elenco e' cambiato. Una nota modificata a mano
        /// resta com'e': al massimo il registro dice cosa non nomina.
        /// </summary>
        void NotaDelGruppo(string percorso, List<string> righe, List<string> nomi)
        {
            string corpo = string.Join("\r\n", righe.ToArray());
            string nuovo = TestoNota(corpo);
            string nomeNota = Path.GetFileName(percorso);
            if (!File.Exists(percorso))
            {
                if (ScriviNota(percorso, nuovo)) res.Creati++;
                return;
            }

            string vecchio;
            try { vecchio = File.ReadAllText(percorso, Encoding.UTF8); }
            catch (Exception ex) { Errore("Non riesco a leggere " + nomeNota + ": " + ex.Message); return; }

            if (Normale(vecchio) == Normale(nuovo)) { res.GiaPresenti++; return; }

            // una nota delle versioni precedenti, senza codice, identica a quella
            // di adesso: e' di Campanella, le aggiungo solo il codice
            if (Normale(vecchio) == Normale(corpo))
            {
                ScriviNota(percorso, nuovo);
                res.GiaPresenti++;
                return;
            }

            if (NotaIntatta(vecchio))
            {
                if (ScriviNota(percorso, nuovo))
                {
                    res.Creati++;
                    Riga("  nota aggiornata: " + nomeNota);
                }
                return;
            }

            res.GiaPresenti++;
            List<string> mancanti = new List<string>();
            foreach (string n in nomi)
                if (vecchio.IndexOf(n, StringComparison.OrdinalIgnoreCase) < 0) mancanti.Add(n);
            Riga("  la nota \"" + nomeNota + "\" l'hai modificata tu: la lascio com'e'" +
                 (mancanti.Count > 0 ? ". Non nomina: " + string.Join(", ", mancanti.ToArray()) : "."));
        }

        bool ScriviNota(string percorso, string testo)
        {
            try
            {
                File.WriteAllText(percorso, testo, Encoding.UTF8);
                return true;
            }
            catch (Exception ex)
            {
                Errore("Non riesco a scrivere " + Path.GetFileName(percorso) + ": " + ex.Message);
                return false;
            }
        }

        /// <summary>Il testo della nota, con in fondo il codice che dice se qualcuno l'ha toccata.</summary>
        public static string TestoNota(string corpo)
        {
            return corpo + "\r\n\r\n" + FirmaNota + Impronta(corpo) +
                   ": se la modifichi, Campanella la lascia com'e'.)\r\n";
        }

        /// <summary>
        /// Vero se la nota e' ancora come l'ha scritta Campanella: l'ultima riga
        /// porta il codice del testo che la precede.
        /// </summary>
        public static bool NotaIntatta(string testo)
        {
            string t = Normale(testo);
            int i = t.LastIndexOf('\n');
            if (i < 0) return false;
            Match m = Regex.Match(t.Substring(i + 1), "^" + Regex.Escape(FirmaNota) + "([0-9a-f]{8})");
            return m.Success && m.Groups[1].Value == Impronta(t.Substring(0, i));
        }

        static string Normale(string testo)
        {
            return (testo ?? "").Replace("\r\n", "\n").TrimEnd();
        }

        static string Impronta(string testo)
        {
            using (SHA1 sha = SHA1.Create())
            {
                byte[] h = sha.ComputeHash(Encoding.UTF8.GetBytes(Normale(testo)));
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < 4; i++) sb.Append(h[i].ToString("x2"));
                return sb.ToString();
            }
        }

        // -------------------------------------------------------------------
        /// <summary>
        /// Crea la cartella se manca e la conta, con le cartelle madri che
        /// mancano: ognuna una volta sola per giro. Falso se non c'e' e non si
        /// riesce a crearla (il motivo va fra gli errori).
        /// </summary>
        bool Cartella(string percorso)
        {
            try
            {
                // i controlli sui nomi bastano gia'; questo e' l'ultimo argine
                if (!Dentro(percorso))
                {
                    Errore("Cartella fuori da \"" + Path.GetFileName(cartellaAnno) + "\", non la creo: " + percorso);
                    return false;
                }
                // si scende dalla cartella dell'anno un pezzo alla volta: cosi'
                // anche le madri create di passaggio (RECUPERI\PENTAMESTRE per la
                // prima classe) finiscono nel conto
                string d = Path.GetFullPath(cartellaAnno).TrimEnd('\\');
                string resto = Path.GetFullPath(percorso).Substring(d.Length + 1);
                foreach (string parte in resto.Split(new char[] { '\\' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    d = Path.Combine(d, parte);
                    if (contate.ContainsKey(d)) continue;
                    if (Directory.Exists(d)) res.GiaPresenti++;
                    else
                    {
                        Directory.CreateDirectory(d);
                        res.Creati++;
                    }
                    contate[d] = true;
                }
                return true;
            }
            catch (Exception ex)
            {
                Errore("Non riesco a creare la cartella " + percorso + ": " + ex.Message);
                return false;
            }
        }

        /// <summary>Vero se il percorso sta dentro la cartella dell'anno.</summary>
        bool Dentro(string percorso)
        {
            string dentro = Path.GetFullPath(cartellaAnno).TrimEnd('\\') + "\\";
            return Path.GetFullPath(percorso).StartsWith(dentro, StringComparison.OrdinalIgnoreCase);
        }

        // ===================================================================
        //  NOMI E STRUTTURA.JSON
        // ===================================================================
        /// <summary>
        /// Vuoto se il nome va bene per una cartella sola (una classe, una
        /// materia, una cartella in piu'), altrimenti il perche' no.
        /// </summary>
        public static string ControllaNome(string nome)
        {
            string n = (nome ?? "").Trim();
            if (n == "") return "il nome e' vuoto";
            if (n == "." || n == "..")
                return "\"" + n + "\" non e' un nome di cartella: tutto deve restare dentro \"A.S. <anno>\"";
            if (n.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                return "contiene un carattere che Windows non accetta nei nomi ( \\ / : * ? \" < > | )";
            if (n.EndsWith(".")) return "finisce con un punto, che Windows toglierebbe";
            string prima = n.Split('.')[0].Trim().ToUpperInvariant();
            if (Array.IndexOf(NomiRiservati, prima) >= 0) return "\"" + n + "\" e' un nome riservato di Windows";
            return "";
        }

        /// <summary>
        /// Vuoto se la voce (anche su piu' livelli, "RECUPERI\TRIMESTRE") resta
        /// dentro "A.S. &lt;anno&gt;", altrimenti il perche' no.
        /// </summary>
        public static string ControllaVoce(string voce)
        {
            string v = (voce ?? "").Trim();
            if (v == "") return "il nome e' vuoto";
            if (v.StartsWith("\\") || v.StartsWith("/") || v.IndexOf(':') >= 0)
                return "e' un percorso assoluto: ogni cartella va dentro \"A.S. <anno>\"";
            foreach (string parte in v.Split('\\', '/'))
            {
                if (parte.Trim() == "") continue;
                string problema = ControllaNome(parte);
                if (problema != "") return problema;
            }
            return "";
        }

        /// <summary>"RECUPERI/ TRIMESTRE\" diventa "RECUPERI\TRIMESTRE".</summary>
        public static string NormalizzaVoce(string voce)
        {
            List<string> parti = new List<string>();
            foreach (string parte in (voce ?? "").Split('\\', '/'))
                if (parte.Trim() != "") parti.Add(parte.Trim());
            return string.Join("\\", parti.ToArray());
        }

        /// <summary>
        /// Le cartelle fisse scritte in struttura.json. Null se il file non c'e'
        /// oppure non si puo' usare: in quel caso errori dice perche'. Le voci
        /// che uscirebbero da "A.S. &lt;anno&gt;" restano fuori e finiscono in errori.
        /// </summary>
        public static List<VoceStruttura> LeggiStruttura(string percorso, List<string> errori)
        {
            if (!File.Exists(percorso)) return null;
            object letto;
            try { letto = new JavaScriptSerializer().DeserializeObject(File.ReadAllText(percorso, Encoding.UTF8)); }
            catch (Exception ex)
            {
                errori.Add("il file non si legge (" + ex.Message + ")");
                return null;
            }
            Dictionary<string, object> radice = letto as Dictionary<string, object>;
            object[] elenco = (radice != null && radice.ContainsKey("cartelle")) ? radice["cartelle"] as object[] : null;
            if (elenco == null)
            {
                errori.Add("manca l'elenco \"cartelle\": [ { \"nome\": \"...\", \"spuntata\": true } ]");
                return null;
            }

            List<VoceStruttura> voci = new List<VoceStruttura>();
            for (int i = 0; i < elenco.Length; i++)
            {
                Dictionary<string, object> d = elenco[i] as Dictionary<string, object>;
                if (d == null)
                {
                    errori.Add("voce " + (i + 1) + ": non e' nella forma { \"nome\": \"...\", \"spuntata\": true }");
                    continue;
                }
                object o;
                string nome = (d.TryGetValue("nome", out o) && o != null) ? Convert.ToString(o) : "";
                if (nome.Trim() == "") continue;
                string problema = ControllaVoce(nome);
                if (problema != "")
                {
                    errori.Add("voce " + (i + 1) + " [" + nome + "]: " + problema);
                    continue;
                }
                VoceStruttura v = new VoceStruttura();
                v.Nome = NormalizzaVoce(nome);
                if (d.TryGetValue("spuntata", out o) && o != null)
                {
                    try { v.Spuntata = Convert.ToBoolean(o); }
                    catch (FormatException) { }
                    catch (InvalidCastException) { }
                }
                voci.Add(v);
            }
            return (voci.Count > 0) ? voci : null;
        }

        /// <summary>Copia un file se manca e lo conta. Vero solo se l'ha copiato adesso.</summary>
        bool CopiaFile(string origine, string destinazione, string etichetta)
        {
            Fermati();
            if (File.Exists(destinazione)) { res.GiaPresenti++; return false; }
            try
            {
                File.Copy(origine, destinazione, false);
                res.Creati++;
                return true;
            }
            catch (Exception ex)
            {
                Errore(etichetta + ": " + ex.Message);
                return false;
            }
        }

        void CopiaCartella(string origine, string destinazione, List<string> google, string prefisso)
        {
            if (!Cartella(destinazione)) return;
            string[] file, sottocartelle;
            try
            {
                file = Directory.GetFiles(origine);
                sottocartelle = Directory.GetDirectories(origine);
            }
            catch (Exception ex)
            {
                Errore("Non riesco a leggere " + origine + ": " + ex.Message);
                return;
            }
            foreach (string f in file)
            {
                if (EFileGoogle(f)) { google.Add(prefisso + Path.GetFileName(f)); continue; }
                CopiaFile(f, Path.Combine(destinazione, Path.GetFileName(f)),
                          "Copia di " + prefisso + Path.GetFileName(f));
            }
            foreach (string sd in sottocartelle)
                CopiaCartella(sd, Path.Combine(destinazione, Path.GetFileName(sd)), google,
                              prefisso + Path.GetFileName(sd) + "\\");
        }

        void Fermati()
        {
            if (Interrompi) throw new OperationCanceledException("Interrotto prima della fine.");
        }

        void Riga(string r)
        {
            res.Registro.Add(r);
            Action<string> a = Avanzamento;
            if (a != null) a(r);
        }

        void Errore(string e) { res.Errori.Add(e); }

        // -------------------------------------------------------------------
        /// <summary>
        /// I file da copiare dentro ogni classe: tutto cio' che sta in
        /// MODELLI\PER CLASSE. Per chi viene dalle versioni precedenti valgono
        /// ancora i file "Modulo di controllo - segni.*" nella radice di MODELLI
        /// o in "Verifiche e valutazione".
        /// </summary>
        static List<string> ModelliPerClasse(string modelli)
        {
            List<string> fuori = new List<string>();
            string cartella = Path.Combine(modelli, CartellaPerClasse);
            if (Directory.Exists(cartella))
            {
                string[] file = Directory.GetFiles(cartella);
                Array.Sort(file);
                foreach (string f in file)
                    if (!Path.GetFileName(f).StartsWith("~$")) fuori.Add(f);
            }
            string[] basi =
            {
                Path.Combine(modelli, "Modulo di controllo - segni"),
                Path.Combine(modelli, "Verifiche e valutazione", "Modulo di controllo - segni")
            };
            foreach (string b in basi)
                foreach (string est in new string[] { ".xlsx", ".docx", ".xls", ".doc", ".gsheet", ".gdoc" })
                    if (File.Exists(b + est) && !fuori.Contains(b + est)) fuori.Add(b + est);
            return fuori;
        }

        static bool EFileGoogle(string percorso)
        {
            string e = Path.GetExtension(percorso).ToLowerInvariant();
            return e == ".gdoc" || e == ".gsheet" || e == ".gslides" ||
                   e == ".gdraw" || e == ".gform" || e == ".gsite";
        }
    }
}
