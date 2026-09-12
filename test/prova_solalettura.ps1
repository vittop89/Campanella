<#
    prova_solalettura.ps1 - mette Campanella in una cartella dove non si puo'
    scrivere e controlla che lo dica, invece di perdere le impostazioni in
    silenzio.

        .\test\prova_solalettura.ps1
#>
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe    = Join-Path $radice 'dist\Campanella.exe'
$dove   = Join-Path $env:TEMP ('campanella-sololettura-' + (Get-Random))
$utente = "$env:USERDOMAIN\$env:USERNAME"

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public class S {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(P cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, P cb, IntPtr l);
  public static List<string> Finestre(uint pid) {
    var o = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint p2; GetWindowThreadProcessId(h, out p2);
      if (p2 != pid || !IsWindowVisible(h)) return true;
      var sb = new StringBuilder(300); GetWindowText(h, sb, 300);
      if (sb.Length > 0) o.Add(sb.ToString());
      return true;
    }, IntPtr.Zero);
    return o;
  }
  public static string Testo(uint pid) {
    var tutto = new StringBuilder();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint p2; GetWindowThreadProcessId(h, out p2);
      if (p2 != pid || !IsWindowVisible(h)) return true;
      EnumChildWindows(h, delegate(IntPtr c, IntPtr l2) {
        var sb = new StringBuilder(1000); GetWindowText(c, sb, 1000);
        tutto.Append(sb.ToString()).Append("\n");
        return true;
      }, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
    return tutto.ToString();
  }
}
"@

$fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}

New-Item -ItemType Directory -Path $dove | Out-Null
Copy-Item $exe -Destination $dove
$p = $null
try {
    Write-Host "Tolgo il permesso di scrittura a $dove" -ForegroundColor Cyan
    icacls $dove /deny "${utente}:(WD,AD)" /t | Out-Null

    # controllo che il divieto sia davvero attivo
    $davvero = $false
    try { [System.IO.File]::WriteAllText((Join-Path $dove 'x.tmp'), 'x') }
    catch { $davvero = $true }
    Verifica "la cartella e' davvero in sola lettura" $davvero

    $p = Start-Process (Join-Path $dove 'Campanella.exe') -PassThru
    Start-Sleep -Seconds 4

    $titoli = [S]::Finestre([uint32]$p.Id)
    $testo  = [S]::Testo([uint32]$p.Id)
    Write-Host "  finestre aperte: $($titoli -join ' | ')"

    Verifica "avvisa che non puo' salvare" `
        ($titoli -contains 'Le impostazioni non si possono salvare')
    Verifica "spiega che le impostazioni andranno perse" ($testo -match 'andra.{0,3} perso')
    Verifica "dice cosa fare"                            ($testo -match 'copia Campanella|installala')
    Verifica "l'applicazione non e' morta"               (-not $p.HasExited)
}
finally {
    if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 600
    icacls $dove /remove:d "$utente" /t 2>&1 | Out-Null
    Remove-Item $dove -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
