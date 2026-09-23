<#
    prova_cartelle.ps1 - le cartelle dell'anno, dalla parte di Campanella

        .\test\prova_cartelle.ps1

    Carica dist\Campanella.exe come assembly e fa girare il generatore vero
    delle cartelle dell'anno su un Drive FINTO, creato in una cartella
    temporanea: non tocca mai il Drive vero del computer.
    Esce con codice 1 se una prova fallisce.
#>
$ErrorActionPreference = 'Stop'
$qui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$radice = Split-Path -Parent $qui
$exe    = Join-Path $radice 'dist\Campanella.exe'
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$FS  = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$tG  = $asm.GetType('Campanella.PaginaCartelle')

$script:fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}
function Lista([string[]]$voci) {
    $l = [System.Collections.Generic.List[string]]::new()
    foreach ($v in $voci) { $l.Add($v) }
    return ,$l
}
function Genera([string]$drive, [string]$classi, [string[]]$gruppi, [string[]]$struttura, [string]$extra) {
    $registro = [System.Collections.Generic.List[string]]::new()
    $argomenti = New-Object 'object[]' 7
    $argomenti[0] = '2026-27'
    $argomenti[1] = $drive
    $argomenti[2] = $classi
    $argomenti[3] = Lista $gruppi
    $argomenti[4] = Lista $struttura
    $argomenti[5] = $extra
    $argomenti[6] = $registro
    return $tG.GetMethod('GeneraAnno', $FS).Invoke($null, $argomenti)
}

# il Drive finto: una cartella temporanea che si chiama come la corsia di prova
$finto = Join-Path $env:TEMP ('cartelle-prova-' + [Guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Force $finto | Out-Null
    $anno = Join-Path $finto 'A.S. 2026-27'

    # --- 1. le classi: una per riga, il punto e virgola solo fra le materie -----
    Write-Host "`nLE CLASSI" -ForegroundColor Cyan
    $classi = "1A: Matematica; Fisica`r`n2B-Ls: Matematica, Fisica`r`n4Ar`r`n3C; 3D"
    $r = Genera $finto $classi @() @('CLASSI') ''
    Verifica "1A ha Matematica e Fisica"                 ((Test-Path (Join-Path $anno 'CLASSI\1A\Matematica')) -and (Test-Path (Join-Path $anno 'CLASSI\1A\Fisica')))
    Verifica "nessuna classe 'Fisica'"                   (-not (Test-Path (Join-Path $anno 'CLASSI\Fisica')))
    Verifica "le materie finiscono anche nei recuperi"   (Test-Path (Join-Path $anno 'RECUPERI\PENTAMESTRE\1A\Fisica'))
    Verifica "2B-Ls con la virgola come prima"           (Test-Path (Join-Path $anno 'CLASSI\2B-Ls\Fisica'))
    Verifica "4Ar senza materie"                         (Test-Path (Join-Path $anno 'CLASSI\4Ar'))
    Verifica "'3C; 3D' su una riga: nessuna cartella"    (-not (Test-Path (Join-Path $anno 'CLASSI\3C; 3D')) -and -not (Test-Path (Join-Path $anno 'CLASSI\3D')))
    Verifica "e lo segnala fra i problemi"               (($r.Errori | Where-Object { $_ -like '*3C; 3D*' }).Count -eq 1)
}
finally { Remove-Item -Recurse -Force $finto -ErrorAction SilentlyContinue }

if ($script:fallimenti -eq 0) { Write-Host "`nTutte le prove superate." -ForegroundColor Green }
else { Write-Host "`nPROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
