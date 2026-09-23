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

    # --- le lezioni sotto il giorno giusto, anche dopo un riavvio (A-59, A-64)
    Write-Host "`nGIORNI E PERIODO, ANCHE DOPO UN RIAVVIO" -ForegroundColor Cyan
    $tStato = $asm.GetType('Campanella.Stato')
    $tRis   = $asm.GetType('Campanella.RisultatoOrario')
    $IS     = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'
    Add-Type -AssemblyName System.Web.Extensions
    $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer

    # come alla chiusura e alla riapertura: l'orario va nello stato, i dati
    # diventano JSON e tornano indietro, e la pagina ricostruisce l'orario
    function JsonDati($o) {
        $s = NuovoStato
        $o.SalvaIn($s.PSObject.BaseObject)
        $ser.Serialize($tStato.GetMethod('Dati', $IS).Invoke($s.PSObject.BaseObject, $null))
    }
    function DaJson($json) {
        $s = NuovoStato
        $a = New-Object 'object[]' 1
        $a[0] = $ser.DeserializeObject($json)
        [void]$tStato.GetMethod('LeggiDati', $IS).Invoke($s.PSObject.BaseObject, $a)
        $b = New-Object 'object[]' 1
        $b[0] = $s.PSObject.BaseObject
        $tRis.GetMethod('Ripristina', $FS).Invoke($null, $b)
    }
    function SenzaDataETitolo($gs) {
        ($gs -split "`n" | Where-Object { $_ -notmatch 'generati il|^\s*titolo:' }) -join "`n"
    }
    function Cella($o, $docente, $ora, $giorno) {
        $c = $o.Colonna($giorno)
        if ($c -lt 0) { return '(manca la colonna)' }
        $g = $o.GrigliaDocente($docente)
        [string]$g[($ora - 1), $c]
    }

    $casi = @(
        @{ Nome = 'tabellone senza lunedi'; Righe = @(
            'Orario dal 15/09;;;;;;;;;;',
            ';MAR;;MER;;GIO;;VEN;;SAB;',
            ';1;2;1;2;1;2;1;2;1;2',
            'ROSSI;1A;;;2B;;;;;;5E',
            'VERDI;;1A;3C;;;;2B;;4D;') ;
           Giorni = '1,2,3,4,5'; Attese = @(@('ROSSI', 1, 1, '1A'), @('ROSSI', 2, 2, '2B'), @('ROSSI', 2, 5, '5E'), @('VERDI', 1, 5, '4D')) },
        @{ Nome = 'tabellone senza mercoledi'; Righe = @(
            'Orario dal 15/09;;;;;;;;',
            ';LUN;;MAR;;GIO;;VEN;',
            ';1;2;1;2;1;2;1;2',
            'ROSSI;1A;;;2B;3C;;;4D',
            'VERDI;;1A;;;;3C;2B;') ;
           Giorni = '0,1,3,4'; Attese = @(@('ROSSI', 1, 3, '3C'), @('ROSSI', 2, 4, '4D'), @('VERDI', 2, 3, '3C'), @('VERDI', 1, 4, '2B')) },
        # il sabato e la terza ora ci sono ma sono vuoti: tornano solo se salvati
        @{ Nome = 'tabellone con sabato e terza ora vuoti'; Righe = @(
            'Orario dal 15/09;;;;;;;;;;;;',
            ';LUN;;;MAR;;;MER;;;SAB;;',
            ';1;2;3;1;2;3;1;2;3;1;2;3',
            'ROSSI;1A;2B;;;1A;;3C;;;;;',
            'VERDI;;;;2B;;;;3C;;;;') ;
           Giorni = '0,1,2,5'; Attese = @(@('ROSSI', 2, 0, '2B'), @('ROSSI', 1, 2, '3C'), @('VERDI', 1, 1, '2B'), @('VERDI', 2, 2, '3C')) },
        @{ Nome = 'tabella Docente/Giorno/Ora senza lunedi'; Righe = @(
            'Docente;Giorno;Ora;Classe;Materia;Aula',
            'ROSSI;Martedi;1;1A;Matematica;Aula 12',
            'ROSSI;Giovedi;2;2B;Matematica;Aula 12',
            'VERDI;Mercoledi;1;3C;Storia;Laboratorio',
            'VERDI;Venerdi;3;1A;Storia;Aula 7') ;
           Giorni = '1,2,3,4'; Attese = @(@('ROSSI', 1, 1, '1A'), @('ROSSI', 2, 3, '2B'), @('VERDI', 1, 2, '3C'), @('VERDI', 3, 4, '1A')) }
    )
    $k = 0
    foreach ($caso in $casi) {
        $k++
        $o = AnalizzaFile (ScriviCsv "giorni$k.csv" $caso.Righe)
        Verifica "$($caso.Nome): colonne $(@($o.IndiciGiorni) -join ',')" ((@($o.IndiciGiorni) -join ',') -eq $caso.Giorni)
        $json = JsonDati $o
        $dopo = DaJson $json
        foreach ($a in $caso.Attese) {
            $nome = $o.Giorni[$o.Colonna($a[2])]
            Verifica "$($caso.Nome): $($a[0]) ha $($a[3]) $nome alla $($a[1])a ora" ((Cella $o $a[0] $a[1] $a[2]) -eq $a[3])
            Verifica "  ...e anche dopo un riavvio" ((Cella $dopo $a[0] $a[1] $a[2]) -eq $a[3])
        }
        Verifica "$($caso.Nome): dopo un riavvio stessi giorni" ((@($dopo.Giorni) -join ',') -eq (@($o.Giorni) -join ','))
        $s = NuovoStato
        $s.CalDocente = 'ROSSI'
        Verifica "$($caso.Nome): dopo un riavvio DatiOrari.gs e' lo stesso" `
            ((SenzaDataETitolo (GeneraDati $o $s $true)) -eq (SenzaDataETitolo (GeneraDati $dopo $s $true)))
        if ($caso.Righe[0] -like 'Docente*') {
            $lezioni = $ser.Serialize($ser.DeserializeObject($json)['lezioni'])
            Verifica "$($caso.Nome): materia e aula non finiscono nei dati salvati" `
                ($lezioni -cnotmatch 'Matematica|Storia|Aula 12|Laboratorio|"m":|"a":')
        }
    }

    # il tabellone scelto (di partenza quello d'esempio): periodo e dati uguali dopo un riavvio
    $o = AnalizzaFile $File
    $dopo = DaJson (JsonDati $o)
    Verifica "il periodo resta dopo un riavvio ($($dopo.Periodo))" (($dopo.Periodo -eq $o.Periodo) -and ($o.Periodo -ne ''))
    $s = NuovoStato
    $s.CalDocente = $o.Docenti()[0]
    Verifica "il tabellone scelto da' lo stesso DatiOrari.gs dopo un riavvio" `
        ((SenzaDataETitolo (GeneraDati $o $s $true)) -eq (SenzaDataETitolo (GeneraDati $dopo $s $true)))

    # un file dei dati di una versione precedente: niente colonne, materia e aula
    $vecchio = '{"lezioni":[{"d":"ROSSI","g":1,"o":1,"c":"1A","m":"Matematica","a":"Aula 12"},' +
               '{"d":"ROSSI","g":3,"o":2,"c":"2B","m":"","a":""}]}'
    $dopo = DaJson $vecchio
    Verifica "i dati di una versione precedente si leggono ($($dopo.Lezioni.Count) lezioni)" ($dopo.Lezioni.Count -eq 2)
    Verifica "  ...con le colonne ricavate dai giorni ($(@($dopo.Giorni) -join ' '))" ((@($dopo.IndiciGiorni) -join ',') -eq '1,3')
    Verifica "  ...e ogni lezione sotto il suo giorno" (((Cella $dopo 'ROSSI' 1 1) -eq '1A') -and ((Cella $dopo 'ROSSI' 2 3) -eq '2B'))

    # --- il generatore vero davanti al banco di Orari.gs (A-13) -------------
    # i banchi girano di solito su DatiOrari_esempio.gs, scritto a mano: qui
    # il file lo scrive GeneraDatiGs, cosi' un nome cambiato da una parte
    # sola non passa inosservato
    Write-Host "`nDATIORARI.GS DEL GENERATORE VERO NEL BANCO DI ORARI.GS" -ForegroundColor Cyan
    $o = AnalizzaFile $File
    $s = NuovoStato
    $s.OggettoOrari = 'Orario {docente}'
    $s.OggettoOrariClasse = 'Orario classe {classe}'
    $s.NotaOrari = 'Orario provvisorio: eventuali variazioni vengono comunicate per circolare.'
    # il calendario per il primo docente con almeno un'ora di lezione
    $s.CalDocente = [string]($o.Docenti() | Where-Object { $o.OreDi($_) -gt 0 } | Select-Object -First 1)
    $s.CalNome = 'Orario di prova'
    $s.CalInizio = '2026-09-14'
    $s.CalFine = '2027-06-10'
    $s.CalPrimaOra = '08:00'
    $s.CalMinutiOra = 60
    $s.CalOreInizio = '08:00, 09:00, 10:00, 11:10, 12:10, 13:10'
    $s.CalColore = 'BLUE'
    $generato = Join-Path $tmp 'DatiOrari_generato.gs'
    [System.IO.File]::WriteAllText($generato, (GeneraDati $o $s $true), $utf8)
    $uscita = & node (Join-Path $qui 'mock_orari.js') $generato
    $esitoBanco = $LASTEXITCODE
    $uscita | Where-Object { $_ -match 'FALLITO|PROVE FALLITE|Tutte le prove' } | ForEach-Object { Write-Host "          $_" }
    Verifica "mock_orari.js passa con i dati scritti dal generatore ($(@($uscita | Where-Object { $_ -match '^\s+OK ' }).Count) controlli)" ($esitoBanco -eq 0)
}
finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

if ($fallimenti -eq 0) { Write-Host "`nTutte le prove superate." -ForegroundColor Green }
else { Write-Host "`nPROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
