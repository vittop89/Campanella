<#
    prova_orario.ps1 - controlla il lettore .xlsx/.csv e il riconoscimento del
    tabellone, senza aprire l'interfaccia.

        .\test\prova_orario.ps1                       # tabellone inventato (test\tabellone_esempio.csv)
        .\test\prova_orario.ps1 "H:\...\orario.xlsx"  # un tabellone vero

    I controlli sono scritti in modo da valere per tutti e due: contano
    minimi, non numeri esatti.
#>
param(
    [string]$File = (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'tabellone_esempio.csv')
)

$ErrorActionPreference = 'Stop'
$exe = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'dist\Campanella.exe'
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)

$tXlsx = $asm.GetType('Campanella.Xlsx')
$tAn   = $asm.GetType('Campanella.AnalisiOrario')
$FS    = [System.Reflection.BindingFlags]'Public,NonPublic,Static'

Write-Host "File: $File" -ForegroundColor Cyan
$fogli = $tXlsx.GetMethod('Leggi', $FS).Invoke($null, @([string]$File))
Write-Host ("Fogli: {0}" -f $fogli.Count)
foreach ($f in $fogli) { Write-Host ("  '{0}'  righe={1} colonne={2}" -f $f.Nome, $f.NumeroRighe, $f.Colonne) }

$o = $tAn.GetMethod('Analizza', $FS).Invoke($null, @($fogli[0]))
Write-Host "`nFormato ....... $($o.Formato)"          -ForegroundColor Green
Write-Host "Titolo ........ $($o.Titolo)"
Write-Host "Periodo ....... $($o.Periodo)"
Write-Host "Giorni ........ $($o.Giorni -join ' ')"
Write-Host "Ore/giorno .... $($o.OrePerGiorno)"
Write-Host "Lezioni ....... $($o.Lezioni.Count)"

$docenti = $o.Docenti()
$classi  = $o.Classi()
Write-Host "Docenti ....... $($docenti.Count)"
Write-Host "Classi ........ $($classi.Count)  ->  $($classi -join ', ')"
foreach ($a in $o.Avvisi) { Write-Host "AVVISO: $a" -ForegroundColor Yellow }

function Stampa($titolo, $griglia) {
    Write-Host "`n$titolo" -ForegroundColor Cyan
    $intest = 'Ora  '
    foreach ($g in $o.Giorni) { $intest += ('{0,-12}' -f $g) }
    Write-Host $intest
    for ($h = 0; $h -lt $o.OrePerGiorno; $h++) {
        $riga = '{0,-5}' -f ($h + 1)
        for ($d = 0; $d -lt $o.Giorni.Count; $d++) {
            $v = $griglia[$h, $d]
            if ([string]::IsNullOrEmpty($v)) { $v = '-' }
            $riga += ('{0,-12}' -f $v)
        }
        Write-Host $riga
    }
}

Stampa "ORARIO DI $($docenti[0])  ($($o.OreDi($docenti[0])) ore)" $o.GrigliaDocente($docenti[0])
if ($docenti.Count -gt 1) {
    Stampa "ORARIO DI $($docenti[1])  ($($o.OreDi($docenti[1])) ore)" $o.GrigliaDocente($docenti[1])
}
Stampa "ORARIO DELLA CLASSE $($classi[0])" $o.GrigliaClasse($classi[0])

# --- controlli ------------------------------------------------------------
Write-Host "`nCONTROLLI" -ForegroundColor Cyan
$fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}
Verifica "riconosce il formato"                ($o.Formato -ne 'non riconosciuto')
Verifica "trova almeno 5 docenti"              ($docenti.Count -ge 5)
Verifica "almeno cinque giorni"                ($o.Giorni.Count -ge 5)
Verifica "almeno sei ore al giorno"            ($o.OrePerGiorno -ge 6)
Verifica "legge il periodo"                    (-not [string]::IsNullOrEmpty($o.Periodo))
Verifica "nessun docente si chiama LUN/MAR"    (-not ($docenti | Where-Object { $_ -in @('LUN','MAR','MER','GIO','VEN') }))
Verifica "niente righe di copyright"           (-not ($docenti | Where-Object { $_ -like '*opyright*' }))
Verifica "le classi hanno nomi corti"          (-not ($classi | Where-Object { $_.Length -gt 12 }))
Verifica "'D' non e' finito tra le classi"     (-not ($classi -contains 'D'))
$senzaNulla = $docenti | Where-Object {
    $g = $o.GrigliaDocente($_)
    $vuoto = $true
    for ($h = 0; $h -lt $o.OrePerGiorno; $h++) {
        for ($d = 0; $d -lt $o.Giorni.Count; $d++) { if ($g[$h, $d]) { $vuoto = $false } }
    }
    $vuoto
}
Verifica "ogni docente ha almeno una casella"  ($senzaNulla.Count -eq 0)
$soloDisposizione = $docenti | Where-Object { $o.OreDi($_) -eq 0 }
Write-Host ("  nota    docenti con sole ore a disposizione: {0}" -f $soloDisposizione.Count)

# coerenza incrociata: una cella dell'orario di classe deve tornare in quello del docente
$classe = $classi[0]
$gc = $o.GrigliaClasse($classe)
$trovata = $false
for ($h = 0; $h -lt $o.OrePerGiorno -and -not $trovata; $h++) {
    for ($d = 0; $d -lt $o.Giorni.Count -and -not $trovata; $d++) {
        $doc = $gc[$h, $d]
        if ([string]::IsNullOrEmpty($doc) -or $doc.Contains('+')) { continue }
        $gd = $o.GrigliaDocente($doc)
        Verifica "coerenza: $doc ha $classe il $($o.Giorni[$d]) alla $($h+1)a ora" ($gd[$h, $d] -eq $classe)
        $trovata = $true
    }
}

if ($fallimenti -eq 0) { Write-Host "`nTutte le prove superate." -ForegroundColor Green }
else { Write-Host "`nPROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
