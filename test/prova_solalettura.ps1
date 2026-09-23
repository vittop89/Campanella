<#
    prova_solalettura.ps1 - mette Campanella in una cartella dove non si puo'
    scrivere e controlla che lo dica, invece di perdere le impostazioni in
    silenzio.

        .\test\prova_solalettura.ps1

    Una volta, alla prima esecuzione, si e' aperta la finestra delle
    condizioni invece dell'avviso: Campanella era riuscita a scrivere nella
    cartella. Il divieto passava da icacls con il nome "DOMINIO\utente", con
    l'esito buttato via, e l'unico controllo era una scrittura fatta da questa
    stessa prova: se il nome non corrispondeva all'account che lancia il
    programma, o se a questa prova la scrittura era negata per un altro
    motivo, il controllo passava lo stesso e il divieto non c'era. Adesso il
    divieto e' messo sul SID dell'account e riletto dalla cartella; e invece
    di una pausa fissa si aspetta che compaia una finestra, dicendo quale.
#>
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe    = Join-Path $radice 'dist\Campanella.exe'
$dove   = Join-Path $env:TEMP ('campanella-guscio-sololettura-' + (Get-Random))
$sid    = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$titoloAvviso     = 'Le impostazioni non si possono salvare'
$titoloCondizioni = "Condizioni d'uso di Campanella"

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

# Aspetta che la condizione sia vera, al massimo $secondi. Restituisce
# l'ultimo valore della condizione (vuoto se il tempo e' scaduto).
function Attendi($secondi, [scriptblock]$condizione) {
    $fine = [DateTime]::Now.AddSeconds($secondi)
    do {
        $r = & $condizione
        if ($r) { return $r }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::Now -lt $fine)
    return $null
}

# Il divieto di scrivere, sul SID dell'account (niente nomi da risolvere):
# niente file nuovi e niente cartelle nuove, anche per quello che c'e' dentro.
$diritti = [System.Security.AccessControl.FileSystemRights]'WriteData, AppendData'
$eredita = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$divieto = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, $diritti, $eredita,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Deny)
$sezioni = [System.Security.AccessControl.AccessControlSections]::Access

New-Item -ItemType Directory -Path $dove | Out-Null
Copy-Item $exe -Destination $dove
# un campanella.json che dice gia' dov'e' il Drive (una cartella finta che non
# c'e'): senza, all'avvio Campanella cercherebbe i Drive veri del computer
$finto = (@{ drive = (Join-Path $dove 'Drive finto') } | ConvertTo-Json)
[System.IO.File]::WriteAllText((Join-Path $dove 'campanella.json'), $finto, (New-Object System.Text.UTF8Encoding($false)))
$p = $null
$divietoMesso = $false
try {
    Write-Host "Tolgo il permesso di scrittura a $dove" -ForegroundColor Cyan
    $acl = [System.IO.Directory]::GetAccessControl($dove, $sezioni)
    $acl.AddAccessRule($divieto)
    [System.IO.Directory]::SetAccessControl($dove, $acl)
    $divietoMesso = $true

    # il divieto si rilegge dalla cartella: non basta che questa prova non
    # riesca a scrivere, potrebbe non riuscirci per un altro motivo
    $trovato = $false
    $regole = [System.IO.Directory]::GetAccessControl($dove, $sezioni).GetAccessRules(
        $true, $false, [System.Security.Principal.SecurityIdentifier])
    foreach ($r in $regole) {
        if ($r.AccessControlType -eq 'Deny' -and $r.IdentityReference -eq $sid -and
            ([int]($r.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::WriteData) -ne 0)) {
            $trovato = $true
        }
    }
    Verifica "il divieto di scrittura c'e', per l'account che lancia il programma" $trovato

    $davvero = $false
    try { [System.IO.File]::WriteAllText((Join-Path $dove 'x.tmp'), 'x') }
    catch { $davvero = $true }
    Verifica "la cartella e' davvero in sola lettura" $davvero

    $p = Start-Process (Join-Path $dove 'Campanella.exe') -PassThru

    # si aspetta la prima finestra con un titolo: l'avviso, oppure (ed e' lo
    # sbaglio da riconoscere) direttamente le condizioni d'uso
    $titoli = Attendi 30 {
        if ($p.HasExited) { return @('(programma chiuso)') }
        $t = [S]::Finestre([uint32]$p.Id)
        if ($t -contains $titoloAvviso -or $t -contains $titoloCondizioni) { return $t }
        return $null
    }
    # il testo si legge subito, mentre l'avviso e' aperto
    $testo = if ($p.HasExited) { '' } else { [S]::Testo([uint32]$p.Id) }
    Write-Host "  finestre aperte: $($titoli -join ' | ')"

    if (-not $titoli) {
        Verifica "entro 30 secondi compare una finestra" $false
    }
    elseif (($titoli -contains $titoloCondizioni) -and -not ($titoli -contains $titoloAvviso)) {
        Write-Host ("  Sono comparse le condizioni senza l'avviso: Campanella e' riuscita a " +
                    "scrivere nella cartella, oppure l'avviso e' stato chiuso da un tasto " +
                    "premuto mentre la prova girava.") -ForegroundColor Yellow
    }
    Verifica "avvisa che non puo' salvare"                ($titoli -contains $titoloAvviso)
    Verifica "l'avviso viene prima delle condizioni"      (-not ($titoli -contains $titoloCondizioni))
    Verifica "spiega che le impostazioni andranno perse" ($testo -match 'andra.{0,3} perso')
    Verifica "dice cosa fare"                            ($testo -match 'copia Campanella|installala')
    Verifica "l'applicazione non e' morta"               (-not $p.HasExited)
}
finally {
    if ($p -and -not $p.HasExited) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        $p.WaitForExit(10000) | Out-Null
    }
    if ($divietoMesso) {
        $acl = [System.IO.Directory]::GetAccessControl($dove, $sezioni)
        $acl.RemoveAccessRuleSpecific($divieto)
        [System.IO.Directory]::SetAccessControl($dove, $acl)
    }
    # l'exe appena chiuso puo' restare bloccato per un attimo
    Attendi 10 {
        Remove-Item $dove -Recurse -Force -ErrorAction SilentlyContinue
        return -not (Test-Path $dove)
    } | Out-Null
    if (Test-Path $dove) { Write-Host "  (non riesco a togliere $dove)" -ForegroundColor Yellow }
}

Write-Host ""
if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
