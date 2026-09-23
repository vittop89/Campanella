<#
    prova_orario.ps1 - controlla il lettore .xlsx/.csv e il riconoscimento del
    tabellone, senza aprire l'interfaccia.

        .\test\prova_orario.ps1                       # tabellone inventato (test\tabellone_esempio.csv)
        .\test\prova_orario.ps1 "H:\...\orario.xlsx"  # un tabellone vero

    I controlli sono scritti in modo da valere per tutti e due: contano
    minimi, non numeri esatti.

    Poi prova il generatore di DatiOrari.gs con tabelloni inventati, scritti
    in una cartella temporanea che alla fine viene tolta.
#>
param(
    [string]$File = (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'tabellone_esempio.csv'),
    # di partenza quello compilato da build.ps1
    [string]$Exe = ''
)

$ErrorActionPreference = 'Stop'
$qui = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = $Exe
if ($exe -eq '') { $exe = Join-Path (Split-Path -Parent $qui) 'dist\Campanella.exe' }
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
# un docente con la riga vuota resta in elenco (e' un docente senza ore, non un errore)
Write-Host ("  nota    docenti senza nessuna casella: {0}" -f $senzaNulla.Count)
Verifica "i docenti senza caselle sono pochi rispetto al totale" ($senzaNulla.Count * 3 -le $docenti.Count)
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

# ---------------------------------------------------------------------------
#  DA QUI IN POI: tabelloni inventati, in una cartella temporanea
# ---------------------------------------------------------------------------
$tmp  = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-orario-' + [Guid]::NewGuid().ToString('N'))
$utf8 = New-Object System.Text.UTF8Encoding($false)

function NuovoStato {
    # new Stato() punta di partenza al Drive vero del PC: lo porto subito
    # nella cartella temporanea, e con i dati accanto non scrive nel Drive
    $s = [Activator]::CreateInstance($asm.GetType('Campanella.Stato'))
    $s.Drive = $tmp
    $s.CartellaDati = $tmp
    $s.DatiNelDrive = $false
    $s
}

function AnalizzaFile($percorso) {
    $f = $tXlsx.GetMethod('Leggi', $FS).Invoke($null, @([string]$percorso))
    $tAn.GetMethod('Analizza', $FS).Invoke($null, @($f[0]))
}

function GeneraDati($o, $s, [bool]$classi) {
    # PowerShell incarta gli oggetti in PSObject: la reflection vuole quelli veri
    $a = New-Object 'object[]' 3
    $a[0] = $o.PSObject.BaseObject
    $a[1] = $s.PSObject.BaseObject
    $a[2] = $classi
    $tAn.GetMethod('GeneraDatiGs', $FS).Invoke($null, $a)
}

function ScriviCsv($nome, $righe) {
    $p = Join-Path $tmp $nome
    [System.IO.File]::WriteAllText($p, ($righe -join "`r`n"), $utf8)
    $p
}

New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    # --- una cella del tabellone non deve diventare codice (A-2) -----------
    Write-Host "`nDATIORARI.GS: IL PERIODO RESTA UN COMMENTO" -ForegroundColor Cyan
    $verificaVm = Join-Path $tmp 'verifica_vm.js'
    [System.IO.File]::WriteAllText($verificaVm, @'
// carica DatiOrari.gs in un contesto vuoto: deve nascere soltanto ORARI,
// con il periodo scritto com'era nel tabellone
const fs = require('fs');
const vm = require('vm');
const contesto = vm.createContext({});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), contesto);
const atteso = fs.readFileSync(process.argv[3], 'utf8');
console.log(JSON.stringify({
  nomi: Object.keys(contesto),
  periodo: !!contesto.ORARI && contesto.ORARI.periodo === atteso
}));
'@, $utf8)

    $l = [string][char]0x2028
    $p = [string][char]0x2029
    $periodi = @(
        'Orario dal 14/09 */ var INIETTATO = 1; /* fine',
        ('Orario dal 14/09' + $l + '*/ INIETTATO = 2; //' + $p + 'INIETTATO = 3; /*'),
        'Orario dal 14/09 **/ INIETTATO = 4; /*'
    )
    $n = 0
    foreach ($periodo in $periodi) {
        $n++
        $csv = ScriviCsv "iniettato$n.csv" @(
            'TABELLONE DOCENTI;;;;;;',
            ('"' + $periodo + '";;;;;;'),
            ';LUN;;MAR;;MER;',
            ';1;2;1;2;1;2',
            'ROSSI;1A;1A;;2B;3C;',
            'VERDI;;2B;1A;;;3C'
        )
        $o = AnalizzaFile $csv
        $s = NuovoStato
        $s.CalDocente = 'ROSSI'
        $gs = GeneraDati $o $s $true
        $fileGs = Join-Path $tmp "DatiOrari_iniettato$n.gs"
        $fileAtteso = Join-Path $tmp "periodo$n.txt"
        [System.IO.File]::WriteAllText($fileGs, $gs, $utf8)
        [System.IO.File]::WriteAllText($fileAtteso, $periodo, $utf8)
        Verifica "caso $n`: il periodo e' letto dalla cella" ($o.Periodo -eq $periodo)
        $esito = & node $verificaVm $fileGs $fileAtteso
        if ($LASTEXITCODE -ne 0 -or -not $esito) {
            Verifica "caso $n`: DatiOrari.gs si carica senza errori" $false
            continue
        }
        $r = ($esito | Select-Object -Last 1) | ConvertFrom-Json
        Verifica "caso $n`: nel contesto nasce soltanto ORARI ($(@($r.nomi) -join ', '))" ((@($r.nomi) -join ',') -eq 'ORARI')
        Verifica "caso $n`: il periodo resta intatto nei dati" ($r.periodo -eq $true)
    }
}
finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

if ($fallimenti -eq 0) { Write-Host "`nTutte le prove superate." -ForegroundColor Green }
else { Write-Host "`nPROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
