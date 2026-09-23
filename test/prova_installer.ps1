<#
    prova_installer.ps1 - installa Campanella in una cartella temporanea
    guidando la finestra, controlla il risultato, poi disinstalla e controlla
    che resti solo quello che deve restare.

        .\test\prova_installer.ps1

    Si rifiuta di partire se sul computer c'e' gia' Campanella (installata
    con Inno o con l'installer C#, o anche solo il suo gruppo nel menu Start
    o il collegamento sulla scrivania): installando e disinstallando
    toccherebbe l'installazione vera. Va lanciata su un computer, o con un
    utente di Windows, senza Campanella.

    Le finestre le comanda premendo i pulsanti (BM_CLICK), non con SendKeys:
    quelle dipendono da chi ha il fuoco, e basta muovere il mouse per far
    fallire la prova senza che ci sia niente di rotto. Non usa pause fisse:
    aspetta che succeda quello che deve succedere, con un tempo massimo.
#>
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$setup  = Join-Path $radice 'dist\Installa Campanella.exe'
$app    = Join-Path $radice 'dist\Campanella.exe'
$dove   = Join-Path $env:TEMP ('campanella-prova-' + (Get-Random))
$inizio = Get-Date

# --- mai sul computer di chi usa Campanella davvero -------------------------
$menu     = Join-Path ([Environment]::GetFolderPath('Programs')) 'Campanella'
$lnkScr   = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Campanella.lnk'
$chiave   = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Campanella'
$chiaveInno = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{6B2C0F4E-3A1D-4C8B-9E57-2D1F7A0C5B31}_is1'
$trovate = @()
if (Test-Path -LiteralPath $chiaveInno) { $trovate += "Campanella installata con Inno ($chiaveInno)" }
if (Test-Path -LiteralPath $chiave) { $trovate += "Campanella installata con l'installer C# ($chiave)" }
$cartellaVera = Join-Path $env:LOCALAPPDATA 'Programs\Campanella'
if (Test-Path -LiteralPath $cartellaVera) { $trovate += "la cartella $cartellaVera" }
if (Test-Path -LiteralPath $menu) { $trovate += "il gruppo del menu Start $menu" }
if (Test-Path -LiteralPath $lnkScr) { $trovate += "il collegamento $lnkScr" }
if ($trovate.Count -gt 0) {
    Write-Host "Su questo computer c'e' gia' Campanella:" -ForegroundColor Red
    foreach ($t in $trovate) { Write-Host "  - $t" -ForegroundColor Red }
    Write-Host "La prova installa e disinstalla: toccherebbe l'installazione vera, quindi non parto." -ForegroundColor Red
    Write-Host "Lanciala su un computer, o con un utente di Windows, dove Campanella non c'e'." -ForegroundColor Red
    exit 1
}
foreach ($f in @($setup, $app)) {
    if (-not (Test-Path -LiteralPath $f)) { throw "Manca $f`: compila prima con .\build.ps1" }
}

# la versione del consenso che l'installer deve registrare
$sorgenteConsenso = [IO.File]::ReadAllText((Join-Path $radice 'src\Consenso.cs'))
if ($sorgenteConsenso -notmatch 'public const int Versione\s*=\s*(\d+)\s*;') { throw 'Consenso.Versione non trovata' }
$versioneConsenso = $Matches[1]

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public class U {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(P cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, P cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);

  public static IntPtr Trova(IntPtr padre, string testo) {
    IntPtr trovato = IntPtr.Zero;
    EnumChildWindows(padre, delegate(IntPtr h, IntPtr l) {
      StringBuilder t = new StringBuilder(600); GetWindowText(h, t, 600);
      if (t.ToString() == testo) { trovato = h; return false; }
      return true;
    }, IntPtr.Zero);
    return trovato;
  }

  public static List<IntPtr> Classe(IntPtr padre, string classe) {
    List<IntPtr> o = new List<IntPtr>();
    EnumChildWindows(padre, delegate(IntPtr h, IntPtr l) {
      StringBuilder c = new StringBuilder(128); GetClassName(h, c, 128);
      if (c.ToString().ToUpperInvariant().Contains(classe.ToUpperInvariant())) o.Add(h);
      return true;
    }, IntPtr.Zero);
    return o;
  }

  // Una finestra di dialogo visibile del processo dato con un pulsante della
  // risposta voluta: "si" (vale anche OK) oppure "no". Torna finestra e
  // pulsante, o null. Il testo vero e' "&Si" con la i accentata: normalizzo
  // togliendo ampersand e accenti, invece di indovinare la scrittura esatta.
  public static IntPtr[] Dialogo(int pid, string risposta) {
    IntPtr[] trovato = null;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint altro; GetWindowThreadProcessId(h, out altro);
      if (altro != (uint)pid || !IsWindowVisible(h)) return true;
      EnumChildWindows(h, delegate(IntPtr c, IntPtr l2) {
        StringBuilder cl = new StringBuilder(64); GetClassName(c, cl, 64);
        if (cl.ToString() != "Button") return true;
        StringBuilder t = new StringBuilder(64); GetWindowText(c, t, 64);
        string n = Normalizza(t.ToString());
        bool giusto = (risposta == "no") ? (n == "no") : (n == "si" || n == "ok");
        if (giusto) { trovato = new IntPtr[] { h, c }; return false; }
        return true;
      }, IntPtr.Zero);
      return trovato == null;
    }, IntPtr.Zero);
    return trovato;
  }

  static string Normalizza(string s) {
    StringBuilder sb = new StringBuilder();
    foreach (char ch in s.ToLowerInvariant()) {
      if (ch == '&') continue;
      if (ch == (char)236 || ch == (char)237) { sb.Append('i'); continue; }
      if (char.IsLetter(ch)) sb.Append(ch);
    }
    return sb.ToString();
  }

  public static void Click(IntPtr h) { SendMessage(h, 0x00F5, IntPtr.Zero, IntPtr.Zero); }
  public static void Testo(IntPtr h, string s) { SendMessage(h, 0x000C, IntPtr.Zero, s); }
  public static string Leggi(IntPtr h) {
    StringBuilder t = new StringBuilder(4000); GetWindowText(h, t, 4000); return t.ToString();
  }
}
"@

$fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}
# aspetta che la condizione diventi vera, al massimo per i secondi dati
function Aspetta([scriptblock]$condizione, [int]$secondi) {
    $fine = (Get-Date).AddSeconds($secondi)
    do {
        if (& $condizione) { return $true }
        Start-Sleep -Milliseconds 150
    } while ((Get-Date) -lt $fine)
    return [bool](& $condizione)
}
function Premi($h, $nome) {
    $b = [U]::Trova($h, $nome)
    if ($b -eq [IntPtr]::Zero) { throw "non trovo il comando '$nome'" }
    [U]::Click($b)
}
# Risponde alla prima finestra di dialogo dei processi del disinstallatore
# che ha il pulsante voluto, e aspetta che quella finestra se ne vada: cosi'
# la risposta successiva non finisce per sbaglio sulla finestra di prima.
function Rispondi([string]$risposta, [int]$secondi, [string]$processi = '*isinstalla*') {
    $script:trovato = $null
    $ok = Aspetta {
        foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like $processi })) {
            $d = [U]::Dialogo($proc.Id, $risposta)
            if ($d) { $script:trovato = $d; return $true }
        }
        return $false
    } $secondi
    if (-not $ok) { return $false }
    [U]::Click($script:trovato[1])
    $finestra = $script:trovato[0]
    [void](Aspetta { -not [U]::IsWindow($finestra) -or -not [U]::IsWindowVisible($finestra) } 10)
    return $true
}
function Disinstallatori() { @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*isinstalla*' }) }

Write-Host "Installo in $dove" -ForegroundColor Cyan
$p = Start-Process $setup -PassThru
$h = [IntPtr]::Zero
$pronta = Aspetta {
    $p.Refresh()
    $script:h = $p.MainWindowHandle
    ($script:h -ne [IntPtr]::Zero) -and ([U]::Trova($script:h, 'Accetto e continuo') -ne [IntPtr]::Zero)
} 30
if (-not $pronta) { throw "l'installer non ha aperto la finestra" }
[U]::SetForegroundWindow($h) | Out-Null

# --- pagina 1: condizioni -------------------------------------------------
$accetto = [U]::Trova($h, 'Accetto e continuo')
Verifica "il pulsante e' spento senza le spunte" (-not [U]::IsWindowEnabled($accetto))
Premi $h 'Ho letto le avvertenze sui dati della scuola e sull''intelligenza artificiale.'
Verifica "con una spunta sola resta spento" (-not [U]::IsWindowEnabled($accetto))
Premi $h 'Accetto che il programma sia senza garanzie e che l''autore non risponda dell''uso che ne faccio.'
Verifica "con le due spunte si accende" (Aspetta { [U]::IsWindowEnabled($accetto) } 5)
Premi $h 'Accetto e continuo'

# --- pagina 2: opzioni ----------------------------------------------------
# i controlli delle pagine nascoste prendono un handle solo quando compaiono
$cartellaBox = [IntPtr]::Zero
$comparsa = Aspetta {
    $caselle = @([U]::Classe($h, 'EDIT'))
    $script:cartellaBox = $caselle | Where-Object { [U]::Leggi($_) -like '*Programs*Campanella*' } | Select-Object -First 1
    [bool]$script:cartellaBox
} 10
Verifica "la pagina delle opzioni e' comparsa" $comparsa
if (-not $comparsa) { throw "non trovo la casella della cartella: non installo nella cartella predefinita" }
[U]::Testo($cartellaBox, $dove)
if ([U]::Leggi($cartellaBox) -ne $dove) {
    Stop-Process -Id $p.Id -Force
    throw "non riesco a scrivere la cartella della prova: non installo nella cartella predefinita"
}
Premi $h 'Metti un collegamento sulla scrivania'      # tolgo: non sporco la scrivania
Premi $h 'Avvia Campanella quando ha finito'          # tolgo: non voglio aprirla
Premi $h 'Installa'

# --- pagina 3: attendo la fine del lavoro -----------------------------------
$finito = Aspetta {
    $b = [U]::Trova($h, 'Fine')
    ($b -ne [IntPtr]::Zero) -and [U]::IsWindowEnabled($b)
} 60
Verifica "l'installazione arriva in fondo" $finito

Write-Host "`n=== DOPO L'INSTALLAZIONE ===" -ForegroundColor Cyan
Get-ChildItem $dove -ErrorAction SilentlyContinue |
    Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}} | Format-Table -AutoSize

Verifica "copia l'applicazione"        (Test-Path (Join-Path $dove 'Campanella.exe'))
Verifica "copia le istruzioni"         (Test-Path (Join-Path $dove 'ISTRUZIONI - Campanella.txt'))
Verifica "copia le note sulla privacy" (Test-Path (Join-Path $dove 'PRIVACY.md'))
Verifica "copia il disinstallatore"    (Test-Path (Join-Path $dove 'Disinstalla Campanella.exe'))
Verifica "scrive le impostazioni"      (Test-Path (Join-Path $dove 'campanella.json'))

$json = Get-Content (Join-Path $dove 'campanella.json') -Raw -ErrorAction SilentlyContinue
Verifica "il consenso risulta dato, versione $versioneConsenso" ($json -match ('"consensoVersione":\s*' + $versioneConsenso + '\s*[,}]'))
Verifica "copia i documenti per dirigenza e DPO" (Test-Path (Join-Path $dove 'documenti\Nota tecnica per dirigente e DPO.txt'))

Verifica "crea il gruppo nel menu Start"    (Test-Path $menu)
Verifica "crea il collegamento principale"  (Test-Path (Join-Path $menu 'Campanella.lnk'))
Verifica "crea il collegamento per disinstallare" (Test-Path (Join-Path $menu 'Disinstalla Campanella.lnk'))
Verifica "NON crea quello sulla scrivania (tolto)" (-not (Test-Path $lnkScr))

Verifica "si registra fra i programmi installati" (Test-Path $chiave)
if (Test-Path $chiave) {
    $r = Get-ItemProperty $chiave
    Write-Host "  DisplayName='$($r.DisplayName)'  Version=$($r.DisplayVersion)  Publisher='$($r.Publisher)'"
    Verifica "il percorso di disinstallazione punta alla cartella giusta" `
        ($r.UninstallString -like "*$dove*")
}

# la finestra dell'installer e' ancora aperta sulla pagina finale
if (-not $p.HasExited) {
    try { Premi $h 'Fine' } catch { }
    if (-not (Aspetta { $p.HasExited } 5)) { Stop-Process -Id $p.Id -Force }
}

# --- disinstallazione, tenendo le impostazioni ------------------------------
Write-Host "`n=== DISINSTALLAZIONE (impostazioni: No) ===" -ForegroundColor Cyan
# due file che l'installazione non ha messo: devono restare
Set-Content -LiteralPath (Join-Path $dove 'struttura.json') -Value '{"prova":true}'
Set-Content -LiteralPath (Join-Path $dove 'mio-file.txt') -Value 'un file mio'
Start-Process (Join-Path $dove 'Disinstalla Campanella.exe') -ArgumentList ('/' + 'disinstalla') | Out-Null

Verifica "chiede conferma prima di togliere"    (Rispondi 'si' 15)
Verifica "chiede se cancellare le impostazioni" (Rispondi 'no' 15)
Verifica "a lavoro finito lo dice"              (Rispondi 'si' 20)
Verifica "il disinstallatore si chiude"         (Aspetta { (Disinstallatori).Count -eq 0 } 15)

Verifica "toglie l'applicazione"           (-not (Test-Path (Join-Path $dove 'Campanella.exe')))
Verifica "toglie il disinstallatore"       (-not (Test-Path (Join-Path $dove 'Disinstalla Campanella.exe')))
Verifica "toglie i documenti che ha messo" (-not (Test-Path (Join-Path $dove 'documenti\Nota tecnica per dirigente e DPO.txt')))
Verifica "tiene campanella.json"           (Test-Path (Join-Path $dove 'campanella.json'))
Verifica "tiene struttura.json"            (Test-Path (Join-Path $dove 'struttura.json'))
Verifica "non tocca un file che non e' suo" (Test-Path (Join-Path $dove 'mio-file.txt'))
Verifica "toglie il gruppo dal menu Start" (-not (Test-Path $menu))
Verifica "toglie la voce dal registro"     (-not (Test-Path $chiave))

# --- disinstallazione di tutto -----------------------------------------------
# rimetto l'applicazione e il disinstallatore (l'installer stesso) nella cartella
Write-Host "`n=== DISINSTALLAZIONE (impostazioni: Si) ===" -ForegroundColor Cyan
Copy-Item -LiteralPath $app -Destination (Join-Path $dove 'Campanella.exe') -Force
Copy-Item -LiteralPath $setup -Destination (Join-Path $dove 'Disinstalla Campanella.exe') -Force
Start-Process (Join-Path $dove 'Disinstalla Campanella.exe') -ArgumentList ('/' + 'disinstalla') | Out-Null

Verifica "chiede conferma prima di togliere"    (Rispondi 'si' 15)
Verifica "chiede se cancellare le impostazioni" (Rispondi 'si' 15)
Verifica "a lavoro finito lo dice"              (Rispondi 'si' 20)
Verifica "il disinstallatore si chiude"         (Aspetta { (Disinstallatori).Count -eq 0 } 15)

Verifica "toglie campanella.json"           (-not (Test-Path (Join-Path $dove 'campanella.json')))
Verifica "toglie struttura.json"            (-not (Test-Path (Join-Path $dove 'struttura.json')))
Verifica "anche cosi' non tocca il file suo" (Test-Path (Join-Path $dove 'mio-file.txt'))

# --- una cartella che non e' di Campanella -----------------------------------
Write-Host "`n=== CARTELLA SENZA CAMPANELLA ===" -ForegroundColor Cyan
$altra = Join-Path $env:TEMP ('campanella-prova-altra-' + (Get-Random))
New-Item -ItemType Directory -Path $altra | Out-Null
Set-Content -LiteralPath (Join-Path $altra 'tienimi.txt') -Value 'da non toccare'
Set-Content -LiteralPath (Join-Path $altra 'PRIVACY.md') -Value 'ha il nome di un file dell''installazione'
$copia = Join-Path $env:TEMP ('prova-disinstalla-' + (Get-Random) + '.exe')
Copy-Item -LiteralPath $setup -Destination $copia
Start-Process $copia -ArgumentList ('/rimuovi "' + $altra + '"') | Out-Null
Verifica "avvisa che non e' una cartella di Campanella" (Rispondi 'si' 20)
Verifica "e si chiude"                                  (Aspetta { (Disinstallatori).Count -eq 0 } 15)
Verifica "non tocca niente"                             ((Test-Path (Join-Path $altra 'tienimi.txt')) -and (Test-Path (Join-Path $altra 'PRIVACY.md')))

# pulizia: la prova e' partita senza Campanella sul computer, quindi quello
# che resta l'ha creato lei
Remove-Item -LiteralPath $dove -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $altra -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $copia -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $menu -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $chiave -Recurse -Force -ErrorAction SilentlyContinue
# le copie temporanee che il disinstallatore fa di se' stesso
Get-ChildItem -LiteralPath $env:TEMP -Filter 'campanella-disinstalla-*.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $inizio } | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
