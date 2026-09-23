<#
    prova_stato.ps1 - i salvataggi non distruggono i dati dell'utente

        .\test\prova_stato.ps1
        .\test\prova_stato.ps1 -Stato C:\altrove\Stato.cs   (un'altra versione, per vederla fallire)

    Compila un piccolo programma ospite insieme a src\Stato.cs e lo fa girare
    in cartelle temporanee, una per caso: campanella.json sta accanto alla
    copia dell'ospite, e il "Drive" e' una cartella finta li' dentro. Nessuna
    prova tocca il Drive vero, la cartella del programma o le impostazioni
    vere: e' la regola per tutte le prove che creano uno Stato.

    Ogni caso scrive i file di partenza, chiama Carica, Salva o SpostaDati
    come fa l'applicazione, e guarda che cosa e' rimasto sul disco.
#>
param([string]$Stato = '')

$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if ($Stato -eq '') { $Stato = Join-Path $radice 'src\Stato.cs' }
if (-not (Test-Path $Stato)) { throw "Manca $Stato" }

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'Compilatore C# non trovato: manca il .NET Framework 4.x.' }

# ---------------------------------------------------------------------------
#  Il programma ospite. Usa solo quello che c'era gia' in Stato (Carica,
#  Salva, SpostaDati a tre argomenti, i campi): il resto lo cerca per nome,
#  cosi' si compila anche con una versione vecchia e li' i controlli falliscono.
# ---------------------------------------------------------------------------
$ospite = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using Campanella;

static class ProvaStato
{
    static string Base;
    static int fallimenti = 0;
    static JavaScriptSerializer ser = new JavaScriptSerializer();
    static UTF8Encoding utf8 = new UTF8Encoding(false);

    static int Main(string[] args)
    {
        Base = Path.GetDirectoryName(Path.GetFullPath(Assembly.GetExecutingAssembly().Location));
        // con la cartella di prova Stato non va nemmeno a cercare il Drive vero
        FieldInfo prova = typeof(Stato).GetField("CartellaDiProva", BindingFlags.Public | BindingFlags.Static);
        if (prova != null) prova.SetValue(null, Base);

        string caso = (args.Length > 0) ? args[0] : "";
        try
        {
            switch (caso)
            {
                case "nuovo": Nuovo(); break;
                case "andata-e-ritorno": AndataERitorno(); break;
                default: Console.WriteLine("  caso sconosciuto: " + caso); return 99;
            }
        }
        catch (Exception ex)
        {
            Verifica("il caso gira fino in fondo (" + ex.GetType().Name + ": " + ex.Message + ")", false);
        }
        return fallimenti;
    }

    // ===================================================================
    //  I CASI
    // ===================================================================

    // A-52, A-15: uno Stato nuovo non punta al Drive del computer
    static void Nuovo()
    {
        Stato s = new Stato();
        Verifica("new Stato() lascia vuoto il Drive: non cerca le unita'", s.Drive == "");
        s.Drive = Finto();
        Verifica("Percorso() sta nella cartella di prova", Stato.Percorso() == Impostazioni());
        Stato c = Stato.Carica();
        Verifica("senza campanella.json, nella cartella di prova, Carica non cerca il Drive", c.Drive == "");
    }

    // quello che si salva si rilegge uguale
    static void AndataERitorno()
    {
        ScriviImpostazioni(false, "", null);
        Stato s = Carica();
        s.TemaScuro = false;
        s.Dominio = "scuola.example";
        s.Dirigenza = "dirigente@scuola.example";
        s.Personale.Add(NuovaPersona("ROSSI MARIO", "mario.rossi@scuola.example"));
        s.CalNome = "Orario Rossi";
        s.Salva();
        Verifica("Salva riesce", s.UltimoErrore == "");
        Stato t = Carica();
        Verifica("si rilegge uguale", !t.TemaScuro && t.Dominio == "scuola.example" &&
            t.Dirigenza == "dirigente@scuola.example" && t.Personale.Count == 1 &&
            t.Personale[0].Email == "mario.rossi@scuola.example" && t.CalNome == "Orario Rossi" &&
            t.Drive == Finto());
    }

    // ===================================================================
    //  ATTREZZI
    // ===================================================================
    static void Verifica(string testo, bool ok)
    {
        if (ok) Console.WriteLine("  OK      " + testo);
        else { Console.WriteLine("  FALLITO " + testo); fallimenti++; }
    }

    static string Impostazioni() { return Path.Combine(Base, "campanella.json"); }
    static string Finto() { return Path.Combine(Base, "drive"); }
    static string FileDati(string cartella) { return Path.Combine(cartella, "campanella-dati.json"); }

    static string Cartella(string nome)
    {
        string c = Path.Combine(Finto(), nome);
        Directory.CreateDirectory(c);
        return c;
    }

    static void Scrivi(string p, string testo) { File.WriteAllText(p, testo, utf8); }
    static string Leggi(string p) { return File.Exists(p) ? File.ReadAllText(p, Encoding.UTF8) : null; }
    static string ToJson(object o) { return ser.Serialize(o); }

    static Dictionary<string, object> Json(string p)
    {
        try { return ser.DeserializeObject(Leggi(p)) as Dictionary<string, object> ?? new Dictionary<string, object>(); }
        catch { return new Dictionary<string, object>(); }
    }

    static bool Pieno(string s) { return !string.IsNullOrEmpty(s); }

    static string Str(Dictionary<string, object> d, string k)
    {
        return (d.ContainsKey(k) && d[k] != null) ? Convert.ToString(d[k]) : null;
    }

    static bool Vero(Dictionary<string, object> d, string k)
    {
        return d.ContainsKey(k) && d[k] is bool && (bool)d[k];
    }

    static int Numero(Dictionary<string, object> d, string k)
    {
        try { return d.ContainsKey(k) ? Convert.ToInt32(d[k]) : -1; } catch { return -1; }
    }

    static Dictionary<string, object> Persona(string nome, string email)
    {
        Dictionary<string, object> p = new Dictionary<string, object>();
        p["nome"] = nome; p["ruolo"] = "DOCENTE"; p["email"] = email; p["incluso"] = true;
        return p;
    }

    static Persona NuovaPersona(string nome, string email)
    {
        Persona p = new Persona();
        p.Nome = nome; p.Ruolo = "DOCENTE"; p.Email = email;
        return p;
    }

    static object[] Elenco(params Dictionary<string, object>[] persone) { return persone; }

    static Dictionary<string, object> DatiCon(params Dictionary<string, object>[] persone)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["personale"] = persone;
        return d;
    }

    static List<string> Nomi(Dictionary<string, object> d)
    {
        List<string> fuori = new List<string>();
        object[] a = d.ContainsKey("personale") ? d["personale"] as object[] : null;
        if (a == null) return fuori;
        foreach (object o in a)
        {
            Dictionary<string, object> p = o as Dictionary<string, object>;
            if (p != null && p.ContainsKey("nome")) fuori.Add(Convert.ToString(p["nome"]));
        }
        return fuori;
    }

    // accanto all'ospite solo quello che ci si aspetta: niente .bak, niente .tmp
    static bool SoloAttesi()
    {
        foreach (string f in Directory.GetFiles(Base))
        {
            string n = Path.GetFileName(f).ToLowerInvariant();
            if (n != "provastato.exe" && n != "campanella.json") { Console.WriteLine("          (in piu': " + n + ")"); return false; }
        }
        return true;
    }

    // campanella.json di partenza: il Drive e' sempre quello finto
    static void ScriviImpostazioni(bool nelDrive, string cartellaDati, Dictionary<string, object> altro)
    {
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["consensoVersione"] = 3;
        r["drive"] = Finto();
        r["datiNelDrive"] = nelDrive;
        r["cartellaDati"] = cartellaDati ?? "";
        if (altro != null) foreach (KeyValuePair<string, object> kv in altro) r[kv.Key] = kv.Value;
        Scrivi(Impostazioni(), ToJson(r));
    }

    // la regola delle prove: appena creato, lo Stato guarda solo il Drive finto
    static Stato Carica()
    {
        Stato s = Stato.Carica();
        s.Drive = Finto();
        return s;
    }

    static string Testo(object o, string nome)
    {
        FieldInfo f = o.GetType().GetField(nome, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        if (f == null) { Verifica("Stato ha il campo " + nome, false); return null; }
        object v = f.GetValue(o);
        return (v == null) ? "" : v.ToString();
    }

    static object Chiama(object o, string nome, object[] argomenti)
    {
        foreach (MethodInfo m in o.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
            if (m.Name == nome && m.GetParameters().Length == argomenti.Length) return m.Invoke(o, argomenti);
        Verifica("Stato ha il metodo " + nome + " con " + argomenti.Length + " argomenti", false);
        return null;
    }
}
'@

$casi = @(
    'nuovo'
    'andata-e-ritorno'
)

$base = Join-Path $env:TEMP ('campanella-prova-stato-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $base | Out-Null
$fallimenti = 0
try {
    $sorgente = Join-Path $base 'ProvaStato.cs'
    [System.IO.File]::WriteAllText($sorgente, $ospite, (New-Object System.Text.UTF8Encoding($false)))
    $exe = Join-Path $base 'ProvaStato.exe'
    Write-Host "Compilo l'ospite con $Stato" -ForegroundColor Cyan
    & $csc /nologo /target:exe /codepage:65001 "/out:$exe" /r:System.dll /r:System.Core.dll `
        /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll $Stato $sorgente
    if ($LASTEXITCODE -ne 0) { throw "Compilazione dell'ospite fallita (codice $LASTEXITCODE)." }

    foreach ($caso in $casi) {
        Write-Host "`n$($caso.ToUpperInvariant())" -ForegroundColor Cyan
        $dove = Join-Path $base $caso
        New-Item -ItemType Directory -Path $dove | Out-Null
        Copy-Item $exe -Destination $dove
        $uscita = & (Join-Path $dove 'ProvaStato.exe') $caso
        $codice = $LASTEXITCODE
        foreach ($riga in $uscita) {
            if ($riga -like '  FALLITO*') { Write-Host $riga -ForegroundColor Red } else { Write-Host $riga }
        }
        if ($codice -gt 0 -and $codice -lt 1000) { $fallimenti += $codice }
        elseif ($codice -ne 0) { Write-Host "  FALLITO l'ospite si e' fermato (codice $codice)" -ForegroundColor Red; $fallimenti++ }
    }
}
finally {
    Remove-Item $base -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
