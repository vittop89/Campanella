<#
    prova_guscio.ps1 - le parti della finestra principale che si provano
    senza aprire finestre

        .\test\prova_guscio.ps1

    Carica Campanella.exe per riflessione, come prova_personale.ps1:

      - il messaggio di un errore imprevisto: breve, in italiano, senza la
        traccia dello stack che mostrerebbe .NET.

    Nessuna prova crea uno Stato con il costruttore: oggi "new Stato()"
    guarda da solo il Drive vero del computer.
#>
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = Join-Path $radice 'dist\Campanella.exe'
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)

$script:fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}
function Intestazione($t) {
    Write-Host ""
    Write-Host ("=" * 72)
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host ("=" * 72)
}

$FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$FI = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'

# ---------------------------------------------------------------------------
Intestazione "UN ERRORE IMPREVISTO: MESSAGGIO BREVE, NON LA FINESTRA DI .NET"
$tProgramma = $asm.GetType('Campanella.Programma')
$mTesto = $tProgramma.GetMethod('TestoImprevisto', $FS)
Verifica "c'e' un messaggio preparato per gli errori imprevisti" ($mTesto -ne $null)
if ($mTesto -ne $null) {
    $errore = $null
    try { [System.IO.File]::ReadAllText('Z:\non\esiste\campanella-prova.txt') | Out-Null }
    catch { $errore = $_.Exception.GetBaseException() }
    $continua = $mTesto.Invoke($null, @($errore, $false))
    $chiude = $mTesto.Invoke($null, @($errore, $true))
    Verifica "dice cosa e' successo" ($continua.Contains($errore.Message))
    Verifica "niente traccia dello stack" (-not ($continua -match '\bat \w+\.' -or $continua -match 'System\.IO'))
    Verifica "e' breve (meno di 400 caratteri)" ($continua.Length -lt 400)
    Verifica "se si continua, lo dice" ($continua -match 'continuare')
    Verifica "se il programma deve chiudersi, lo dice" ($chiude -match 'chiudersi')
    $senza = $mTesto.Invoke($null, @($null, $false))
    Verifica "senza eccezione non cade" ($senza -match 'sconosciuto')
}

Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
