<#
    prova_installer.ps1 - installa Campanella in una cartella temporanea
    guidando la finestra, controlla il risultato, poi disinstalla e controlla
    che non resti niente.

        .\test\prova_installer.ps1

    Le finestre le comanda premendo i pulsanti (BM_CLICK), non con SendKeys:
    quelle dipendono da chi ha il fuoco, e basta muovere il mouse per far
    fallire la prova senza che ci sia niente di rotto.
#>
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$setup  = Join-Path $radice 'dist\Installa Campanella.exe'
$dove   = Join-Path $env:TEMP ('campanella-prova-' + (Get-Random))

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

  // Il pulsante di conferma di una finestra di dialogo del processo dato.
  // Il testo vero e' "&Si" con la i accentata: normalizzo togliendo ampersand
  // e accenti, invece di indovinare la scrittura esatta.
  public static IntPtr PulsanteConferma(int pid) {
    IntPtr trovato = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint altro; GetWindowThreadProcessId(h, out altro);
      if (altro != (uint)pid || !IsWindowVisible(h)) return true;
      EnumChildWindows(h, delegate(IntPtr c, IntPtr l2) {
        StringBuilder cl = new StringBuilder(64); GetClassName(c, cl, 64);
        if (cl.ToString() != "Button") return true;
        StringBuilder t = new StringBuilder(64); GetWindowText(c, t, 64);
        string n = Normalizza(t.ToString());
        if (n == "si" || n == "ok") { trovato = c; return false; }
        return true;
      }, IntPtr.Zero);
      return trovato == IntPtr.Zero;
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
function Premi($h, $nome) {
    $b = [U]::Trova($h, $nome)
    if ($b -eq [IntPtr]::Zero) { throw "non trovo il comando '$nome'" }
    [U]::Click($b)
    Start-Sleep -Milliseconds 700
}
function ConfermaDialogo([int]$secondi) {
    for ($k = 0; $k -lt ($secondi * 4); $k++) {
        Start-Sleep -Milliseconds 250
        foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue |
                            Where-Object { $_.ProcessName -like '*isinstalla*' })) {
            $b = [U]::PulsanteConferma($proc.Id)
            if ($b -ne [IntPtr]::Zero) {
                [U]::Click($b)
                Start-Sleep -Milliseconds 700
                return $true
            }
        }
    }
    return $false
}

Write-Host "Installo in $dove" -ForegroundColor Cyan
$p = Start-Process $setup -PassThru
Start-Sleep -Seconds 3
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "l'installer non ha aperto la finestra" }
[U]::SetForegroundWindow($h) | Out-Null

# --- pagina 1: condizioni -------------------------------------------------
$accetto = [U]::Trova($h, 'Accetto e continuo')
Verifica "il pulsante e' bloccato senza le spunte" (-not [System.Windows.Forms.Control]::FromHandle($accetto))
Premi $h 'Ho letto le avvertenze sui dati della scuola e sull''intelligenza artificiale.'
Premi $h 'Accetto che il programma sia senza garanzie e che l''autore non risponda dell''uso che ne faccio.'
Premi $h 'Accetto e continuo'

# --- pagina 2: opzioni ----------------------------------------------------
# i controlli delle pagine nascoste prendono un handle solo quando compaiono:
# adesso che siamo alla pagina 2 la casella della cartella esiste
$caselle = @([U]::Classe($h, 'EDIT'))
Verifica "la pagina delle opzioni e' comparsa" ($caselle.Count -ge 2)
$cartellaBox = $caselle | Where-Object { [U]::Leggi($_) -like '*Programs*Campanella*' } | Select-Object -First 1
if (-not $cartellaBox) { $cartellaBox = $caselle[$caselle.Count - 1] }
[U]::Testo($cartellaBox, $dove)
Start-Sleep -Milliseconds 300
Premi $h 'Metti un collegamento sulla scrivania'      # tolgo: non sporco la scrivania
Premi $h 'Avvia Campanella quando ha finito'          # tolgo: non voglio aprirla
Premi $h 'Installa'

# --- pagina 3: attendo ----------------------------------------------------
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path (Join-Path $dove 'Campanella.exe')) { break }
}
Start-Sleep -Seconds 2

Write-Host "`n=== DOPO L'INSTALLAZIONE ===" -ForegroundColor Cyan
Get-ChildItem $dove -ErrorAction SilentlyContinue |
    Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}} | Format-Table -AutoSize

Verifica "copia l'applicazione"        (Test-Path (Join-Path $dove 'Campanella.exe'))
Verifica "copia le istruzioni"         (Test-Path (Join-Path $dove 'ISTRUZIONI - Campanella.txt'))
Verifica "copia le note sulla privacy" (Test-Path (Join-Path $dove 'PRIVACY.md'))
Verifica "copia il disinstallatore"    (Test-Path (Join-Path $dove 'Disinstalla Campanella.exe'))
Verifica "scrive le impostazioni"      (Test-Path (Join-Path $dove 'campanella.json'))

$json = Get-Content (Join-Path $dove 'campanella.json') -Raw -ErrorAction SilentlyContinue
Verifica "il consenso risulta gia' dato" ($json -match '"consensoVersione":\s*[1-9]\d*')
Verifica "copia i documenti per dirigenza e DPO" (Test-Path (Join-Path $dove 'documenti\Nota tecnica per dirigente e DPO.txt'))

$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Campanella'
Verifica "crea il gruppo nel menu Start"    (Test-Path $menu)
Verifica "crea il collegamento principale"  (Test-Path (Join-Path $menu 'Campanella.lnk'))
Verifica "crea il collegamento per disinstallare" (Test-Path (Join-Path $menu 'Disinstalla Campanella.lnk'))
Verifica "NON crea quello sulla scrivania (tolto)" `
    (-not (Test-Path (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Campanella.lnk')))

$chiave = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Campanella'
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
    Start-Sleep -Seconds 1
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
}

# --- disinstallazione ------------------------------------------------------
Write-Host "`n=== DISINSTALLAZIONE ===" -ForegroundColor Cyan
$argomento = '/' + 'disinstalla'
Start-Process (Join-Path $dove 'Disinstalla Campanella.exe') -ArgumentList $argomento | Out-Null

Verifica "chiede conferma prima di togliere"    (ConfermaDialogo 10)
Verifica "chiede se cancellare le impostazioni" (ConfermaDialogo 10)
Start-Sleep -Seconds 3
ConfermaDialogo 12 | Out-Null      # il messaggio finale della fase di rimozione
Start-Sleep -Seconds 2

Verifica "toglie la cartella"              (-not (Test-Path (Join-Path $dove 'Campanella.exe')))
Verifica "toglie il gruppo dal menu Start" (-not (Test-Path $menu))
Verifica "toglie la voce dal registro"     (-not (Test-Path $chiave))

# pulizia di sicurezza, se qualcosa fosse rimasto
Remove-Item $dove -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $menu -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $chiave -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
