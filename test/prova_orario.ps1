<#
    prova_orario.ps1 - controlla il lettore .xlsx/.csv e il riconoscimento del
    tabellone, senza aprire l'interfaccia.

        .\test\prova_orario.ps1                       # tabellone inventato (test\tabellone_esempio.csv)
        .\test\prova_orario.ps1 "H:\...\orario.xlsx"  # un tabellone vero

    I controlli sono scritti in modo da valere per tutti e due: contano
    minimi, non numeri esatti.

    Poi prova il generatore di DatiOrari.gs con tabelloni inventati, scritti
    in una cartella temporanea che alla fine viene tolta (anche i colori delle
    classi: quelli di partenza, che restano gli stessi, e quelli scelti a mano).
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
    # la 1.4.x salvava la tabella Docente/Giorno/Ora senza lunedi' con i giorni
    # compattati (martedi' = 0): da qui non si capisce, e la pagina invita a
    # ricaricare il file una volta (A-59)
    Verifica "  ...con l'invito a ricaricare il file dell'orario" (
        @($dopo.Avvisi).Count -eq 1 -and $dopo.Avvisi[0] -match "ricarica una volta il file dell'orario")
    $ancora = DaJson (JsonDati $dopo)
    Verifica "  ...che resta anche dopo un altro riavvio, finche' il file non si ricarica" (
        @($ancora.Avvisi).Count -eq 1 -and (@($ancora.IndiciGiorni) -join ',') -eq '1,3' -and
        ((Cella $ancora 'ROSSI' 2 3) -eq '2B'))
    $nuovo = DaJson (JsonDati (AnalizzaFile $File))
    Verifica "i dati salvati da questa versione non invitano a ricaricare niente" (@($nuovo.Avvisi).Count -eq 0)

    # --- i giorni senza lezione: le righe scritte dal docente ---------------
    Write-Host "`nI GIORNI SENZA LEZIONE: LE RIGHE" -ForegroundColor Cyan
    $tCal = $asm.GetType('Campanella.Calendario')
    $IC = [Globalization.CultureInfo]::InvariantCulture
    function DataIso($s) { [DateTime]::ParseExact($s, 'yyyy-MM-dd', $IC) }
    function Giorno($d) { $d.ToString('yyyy-MM-dd', $IC) }
    # Calendario.Leggi(testo, inizio del periodo, out non capite): la lista vera
    # resta nella tabella (dentro un array PowerShell la srotolerebbe)
    function LeggiRighe($testo, $inizio) {
        $a = New-Object 'object[]' 3
        $a[0] = [string]$testo
        $a[1] = DataIso $inizio
        $a[2] = $null
        $lista = $tCal.GetMethod('Leggi', $FS).Invoke($null, $a)
        @{ Lista = $lista; Righe = @($lista | ForEach-Object { (Giorno $_.Dal) + '..' + (Giorno $_.Al) + ' ' + $_.Nome }); NonCapite = @($a[2]) }
    }
    # Calendario.LeggiRighe(testo, inizio del periodo): come e' stata letta ogni riga
    function Lette($testo, $inizio) {
        $m = $tCal.GetMethod('LeggiRighe', $FS)
        if ($null -eq $m) { throw 'manca Calendario.LeggiRighe' }
        return $m.Invoke($null, @([string]$testo, (DataIso $inizio)))
    }
    Verifica "c'e' Calendario, con Leggi, Festivita, Pasqua, ConFeste e PianoDelDocente" (
        $null -ne $tCal -and $null -ne $tCal.GetMethod('Leggi', $FS) -and $null -ne $tCal.GetMethod('Festivita', $FS) -and
        $null -ne $tCal.GetMethod('Pasqua', $FS) -and $null -ne $tCal.GetMethod('ConFeste', $FS) -and
        $null -ne $tCal.GetMethod('PianoDelDocente', $FS))
    if ($null -ne $tCal) {
        $trattino = [string][char]0x2013
        $capite = @(
            @('01/11/2026 Tutti i Santi', '2026-11-01..2026-11-01 Tutti i Santi'),
            @('1/11/2026', '2026-11-01..2026-11-01 '),
            @('2026-11-01', '2026-11-01..2026-11-01 '),
            @('23/12/2026-06/01/2027 Vacanze di Natale', '2026-12-23..2027-01-06 Vacanze di Natale'),
            @('23/12/2026 - 06/01/2027', '2026-12-23..2027-01-06 '),
            @('dal 23/12/2026 al 06/01/2027 Vacanze', '2026-12-23..2027-01-06 Vacanze'),
            @('Dal 2/11/2026 al 3/11/2026 Ponte', '2026-11-02..2026-11-03 Ponte'),
            @('8/12/26 Immacolata', '2026-12-08..2026-12-08 Immacolata'),
            @('2026-12-23 - 2027-01-06 Natale', '2026-12-23..2027-01-06 Natale'),
            @("23/12/2026 $trattino 06/01/2027 Natale", '2026-12-23..2027-01-06 Natale'),
            @('01/11 Tutti i Santi', '2026-11-01..2026-11-01 Tutti i Santi'),
            @('23/12-06/01 Natale', '2026-12-23..2027-01-06 Natale'),
            @('29/3 Pasquetta', '2027-03-29..2027-03-29 Pasquetta'),
            @('  04/10/2026:  San Francesco  ', '2026-10-04..2026-10-04 San Francesco'),
            # le righe delle circolari finiscono spesso con il punto: il periodo resta intero
            @('dal 23/12/2026 al 06/01/2027.', '2026-12-23..2027-01-06 '),
            @('23/12/2026-06/01/2027.', '2026-12-23..2027-01-06 '),
            @('23/12/2026 - 06/01/2027.', '2026-12-23..2027-01-06 '),
            @('23/12/2026-06/01/2027; Natale', '2026-12-23..2027-01-06 Natale'),
            @('dal 23/12/2026 fino al 06/01/2027 Natale', '2026-12-23..2027-01-06 Natale'),
            @('01/11/2026.', '2026-11-01..2026-11-01 '),
            # un'ora scritta con il punto nel nome non e' una data
            @('01/12/2026 assemblea alle 10.30', '2026-12-01..2026-12-01 assemblea alle 10.30'),
            @('25/04/2027 - 25 aprile', '2027-04-25..2027-04-25 25 aprile'),
            # un giorno a parole dentro il periodo della riga, o un numero che non e' una data, va bene
            @('01/05/2027 Festa del Lavoro, 1 maggio', '2027-05-01..2027-05-01 Festa del Lavoro, 1 maggio'),
            @('23/12/2026-06/01/2027 Natale (dal 23 dicembre al 6 gennaio)',
              '2026-12-23..2027-01-06 Natale (dal 23 dicembre al 6 gennaio)'),
            @('15/10/2026 3 ore di assemblea', '2026-10-15..2026-10-15 3 ore di assemblea'),
            @('16/11/2026 2 settimane dopo il ponte', '2026-11-16..2026-11-16 2 settimane dopo il ponte'),
            @('04/10/2026 San Francesco, il 4 ottobre', '2026-10-04..2026-10-04 San Francesco, il 4 ottobre'),
            @('20/11/2026 sciopero, adesione al 50%', '2026-11-20..2026-11-20 sciopero, adesione al 50%'),
            @("12/03/2027 prove al 2$([char]0xB0) piano", "2027-03-12..2027-03-12 prove al 2$([char]0xB0) piano"),
            @('13/03/2027 uscita dalle 10.30, anche il 3,5 per cento', '2027-03-13..2027-03-13 uscita dalle 10.30, anche il 3,5 per cento'),
            # il mese scritto una volta sola: le forme di periodo piu' comuni delle circolari
            @('23-31/12/2026', '2026-12-23..2026-12-31 '),
            @('23 - 31/12/2026 Vacanze', '2026-12-23..2026-12-31 Vacanze'),
            @('7 e 8/12/2026 ponte', '2026-12-07..2026-12-08 ponte'),
            @('dal 23 al 31/12/2026 Vacanze', '2026-12-23..2026-12-31 Vacanze'),
            @('dal 23 fino al 31/12 Vacanze', '2026-12-23..2026-12-31 Vacanze'),
            @('1-3/11 ponte', '2026-11-01..2026-11-03 ponte'),
            @('23/12-06/01/2027 Natale', '2026-12-23..2027-01-06 Natale'),
            # senza anno la prima data prende quello della seconda, non dell'anno scolastico
            @('23/12-06/01/2026 Natale di prima', '2025-12-23..2026-01-06 Natale di prima'),
            @('23/12/2025-06/01 Natale di prima', '2025-12-23..2026-01-06 Natale di prima'),
            @('7-8 dicembre 2026 ponte', '2026-12-07..2026-12-08 ponte'),
            @('7 e 8 dic. ponte', '2026-12-07..2026-12-08 ponte'),
            @("dal 7 all'8 dicembre ponte", '2026-12-07..2026-12-08 ponte'),
            @('dal 23 al 31 dicembre 2026 Vacanze', '2026-12-23..2026-12-31 Vacanze'),
            @('8 dicembre 2026 Immacolata', '2026-12-08..2026-12-08 Immacolata'),
            @("1$([char]0xB0) maggio Festa del Lavoro", '2027-05-01..2027-05-01 Festa del Lavoro'),
            # giuste anche con i numeri nel nome: i giorni della riga, o un numero che non e' un giorno
            @('03/10/2026-04/10/2026 Elezioni del 3 e 4 ottobre', '2026-10-03..2026-10-04 Elezioni del 3 e 4 ottobre'),
            @('10/02/2027 Chiusura per il 2 turno elettorale', '2027-02-10..2027-02-10 Chiusura per il 2 turno elettorale'),
            # la data con il punto e un'ora nel nome; una durata che torna con le date; "al" che non e' una fine
            @('07.12 uscita alle 12.10', '2026-12-07..2026-12-07 uscita alle 12.10'),
            @('23/12/2026-06/01/2027 Natale (15 giorni)', '2026-12-23..2027-01-06 Natale (15 giorni)'),
            @('05/05/2027 gita al museo', '2027-05-05..2027-05-05 gita al museo'),
            # un giorno solo con un nome qualunque, e un periodo che parla di vacanze o di rientro: niente da guardare
            @('07/12/2026 ponte', '2026-12-07..2026-12-07 ponte'),
            # la durata in lettere che torna con le date, e un giorno della settimana solo
            @('07/12/2026-08/12/2026 ponte di due giorni', '2026-12-07..2026-12-08 ponte di due giorni'),
            @('07/12/2026 ponte di un giorno', '2026-12-07..2026-12-07 ponte di un giorno'),
            @('22/02/2027-23/02/2027 carnevale lunedi e martedi', '2027-02-22..2027-02-23 carnevale lunedi e martedi'),
            @("29/03/2027 Lunedi' dell'Angelo", "2027-03-29..2027-03-29 Lunedi' dell'Angelo"),
            @('07/12/2026 ponte, sei ore in meno', '2026-12-07..2026-12-07 ponte, sei ore in meno'),
            # un giorno di vacanza, al singolare, e' proprio un giorno
            @('02/11/2026 ponte, giorno di vacanza', '2026-11-02..2026-11-02 ponte, giorno di vacanza'),
            @('23/12/2026-06/01/2027 Vacanze natalizie', '2026-12-23..2027-01-06 Vacanze natalizie'),
            @('dal 1 al 6/04/2027 vacanze pasquali, rientro dopo Pasquetta', '2027-04-01..2027-04-06 vacanze pasquali, rientro dopo Pasquetta')
        )
        foreach ($c in $capite) {
            $r = LeggiRighe $c[0] '2026-09-14'
            $l = @(Lette $c[0] '2026-09-14')
            Verifica "'$($c[0].Trim())' -> $($c[1])" ($r.Righe.Count -eq 1 -and $r.Righe[0] -eq $c[1] -and $r.NonCapite.Count -eq 0 -and
                $l.Count -eq 1 -and $l[0].Avviso -eq '')
        }
        # un numero nel nome che potrebbe essere un giorno: la riga vale per il
        # giorno scritto con la data, ma non passa inosservata. Resta capita, con
        # l'avviso, e la pagina la mostra da controllare
        $avvisoNumero = [string]$tCal.GetField('AvvisoNumero', $FS).GetValue($null)
        $conAvviso = @(
            @('07/12/2026 ponte 7-8', '2026-12-07..2026-12-07 ponte 7-8'),
            @('07/12/2026 ponte 7 e 8', '2026-12-07..2026-12-07 ponte 7 e 8'),
            @('07/12/2026 ponte (7 e 8)', '2026-12-07..2026-12-07 ponte (7 e 8)'),
            @('07/12/2026 ponte e 8', '2026-12-07..2026-12-07 ponte e 8'),
            @('07/12/2026 ponte + 8', '2026-12-07..2026-12-07 ponte + 8'),
            @('07/12/2026 ponte fino a 8', '2026-12-07..2026-12-07 ponte fino a 8'),
            @('07/12/2026 ponte fino al giorno 8', '2026-12-07..2026-12-07 ponte fino al giorno 8'),
            @('23/12/2026 vacanze di Natale fino al giorno 6', '2026-12-23..2026-12-23 vacanze di Natale fino al giorno 6'),
            @("07/12/2026 ponte, anche martedi' 8", "2026-12-07..2026-12-07 ponte, anche martedi' 8"),
            @("07/12/2026 ponte, anche l'8", "2026-12-07..2026-12-07 ponte, anche l'8"),
            @('07/12/2026 ponte (e il 9)', '2026-12-07..2026-12-07 ponte (e il 9)'),
            @('23/12/2026 Natale, fino al 6', '2026-12-23..2026-12-23 Natale, fino al 6'),
            # un giorno con il punto e senza anno, in una riga con la data con le barre
            @('07/12/2026 ponte, 8.12 Immacolata', '2026-12-07..2026-12-07 ponte, 8.12 Immacolata')
        )
        Verifica "c'e' l'avviso per un numero nel nome ('$avvisoNumero')" ($avvisoNumero -match "numero" -and $avvisoNumero -match 'controlla')
        foreach ($c in $conAvviso) {
            $r = LeggiRighe $c[0] '2026-09-14'
            $l = @(Lette $c[0] '2026-09-14')
            Verifica "'$($c[0])' -> $($c[1]), da controllare" ($r.Righe.Count -eq 1 -and $r.Righe[0] -eq $c[1] -and $r.NonCapite.Count -eq 0 -and
                $l.Count -eq 1 -and $l[0].Avviso -eq $avvisoNumero)
        }
        # la fine di un periodo a parole in una riga di un giorno solo, o quanti
        # giorni dura, che non torna con le date: capita come scritta, con l'avviso
        $avvisoDurata = [string]$tCal.GetField('AvvisoDurata', $FS).GetValue($null)
        $conDurata = @(
            @("23/12/2026 Vacanze di Natale fino all'Epifania", "2026-12-23..2026-12-23 Vacanze di Natale fino all'Epifania"),
            @("23/12/2026 Vacanze di Natale, all'Epifania", "2026-12-23..2026-12-23 Vacanze di Natale, all'Epifania"),
            @('07/12/2026 ponte di 2 giorni', '2026-12-07..2026-12-07 ponte di 2 giorni'),
            @('23/12/2026 vacanze di Natale (15 giorni)', '2026-12-23..2026-12-23 vacanze di Natale (15 giorni)'),
            @('07/12/2026 ponte 2gg', '2026-12-07..2026-12-07 ponte 2gg'),
            @("07/12/2026 ponte sino al lunedi'", "2026-12-07..2026-12-07 ponte sino al lunedi'"),
            @('07/12/2026-08/12/2026 ponte di 3 giorni', '2026-12-07..2026-12-08 ponte di 3 giorni'),
            # la durata in lettere, e due giorni della settimana in un giorno solo
            @('07/12/2026 ponte di due giorni', '2026-12-07..2026-12-07 ponte di due giorni'),
            @('07/12/2026-08/12/2026 ponte di tre giorni', '2026-12-07..2026-12-08 ponte di tre giorni'),
            @('23/12/2026 Natale, quindici gg', '2026-12-23..2026-12-23 Natale, quindici gg'),
            @('22/02/2027 carnevale lunedi e martedi', '2027-02-22..2027-02-22 carnevale lunedi e martedi'),
            @("22/02/2027 carnevale lunedi' e martedi'", "2027-02-22..2027-02-22 carnevale lunedi' e martedi'"),
            @("22/02/2027 carnevale luned$([char]0xEC) e Marted$([char]0xEC)", "2027-02-22..2027-02-22 carnevale luned$([char]0xEC) e Marted$([char]0xEC)")
        )
        Verifica "c'e' l'avviso per una fine o una durata nel nome ('$avvisoDurata')" ($avvisoDurata -match 'fine' -and $avvisoDurata -match 'durata')
        foreach ($c in $conDurata) {
            $r = LeggiRighe $c[0] '2026-09-14'
            $l = @(Lette $c[0] '2026-09-14')
            Verifica "'$($c[0])' -> $($c[1]), da controllare$(if ($l.Count -eq 1 -and $l[0].Avviso -ne $avvisoDurata) { ' (invece: ' + $l[0].Avviso + $l[0].Motivo + ')' })" (
                $r.Righe.Count -eq 1 -and $r.Righe[0] -eq $c[1] -and $r.NonCapite.Count -eq 0 -and
                $l.Count -eq 1 -and $l[0].Avviso -eq $avvisoDurata)
        }
        # un giorno solo che parla del confine di un periodo o di un giorno di
        # lezione: il primo o l'ultimo giorno scritto al posto del periodo, o un
        # giorno in cui si fa lezione. Capita come scritta, con l'avviso
        $campoConfine = $tCal.GetField('AvvisoConfine', $FS)
        $avvisoConfine = if ($null -ne $campoConfine) { [string]$campoConfine.GetValue($null) } else { '(manca Calendario.AvvisoConfine)' }
        $conConfine = @(
            @('14/09/2026 Inizio delle lezioni', '2026-09-14..2026-09-14 Inizio delle lezioni'),
            @('23/12/2026 Vacanze natalizie', '2026-12-23..2026-12-23 Vacanze natalizie'),
            @('01/04/2027 Vacanze pasquali', '2027-04-01..2027-04-01 Vacanze pasquali'),
            @('23/12/2026 inizio vacanze', '2026-12-23..2026-12-23 inizio vacanze'),
            @('06/01/2027 fine vacanze', '2027-01-06..2027-01-06 fine vacanze'),
            @('07/01/2027 Ripresa delle lezioni', '2027-01-07..2027-01-07 Ripresa delle lezioni'),
            @('07/04/2027 Rientro dalle vacanze pasquali', '2027-04-07..2027-04-07 Rientro dalle vacanze pasquali'),
            @('10/06/2027 Termine delle lezioni', '2027-06-10..2027-06-10 Termine delle lezioni'),
            @('- 14 settembre 2026: inizio delle lezioni', '2026-09-14..2026-09-14 inizio delle lezioni'),
            @('07/01/2027 riprendono le lezioni', '2027-01-07..2027-01-07 riprendono le lezioni')
        )
        Verifica "c'e' l'avviso per un giorno che sembra il confine di un periodo o un giorno di lezione ('$avvisoConfine')" (
            $avvisoConfine -match "l'inizio o la fine di un periodo" -and $avvisoConfine -match 'giorni di lezione non vanno qui' -and
            $avvisoConfine -match '23/12/2026-06/01/2027')
        foreach ($c in $conConfine) {
            $r = LeggiRighe $c[0] '2026-09-14'
            $l = @(Lette $c[0] '2026-09-14')
            Verifica "'$($c[0])' -> $($c[1]), da controllare$(if ($l.Count -eq 1 -and $l[0].Avviso -ne $avvisoConfine) { ' (invece: ''' + $l[0].Avviso + $l[0].Motivo + ''')' })" (
                $r.Righe.Count -eq 1 -and $r.Righe[0] -eq $c[1] -and $r.NonCapite.Count -eq 0 -and
                $l.Count -eq 1 -and $l[0].Avviso -eq $avvisoConfine)
        }
        # un periodo scritto in un altro modo, o due giorni sulla stessa riga: la
        # riga non si capisce, e lo dice. Mai un giorno solo con il resto nel nome
        $cifreLarghe = [string][char]0xFF10 + [char]0xFF11 + '/11/2026 cifre a larghezza piena'
        $cifreArabe = '0' + [char]0x0661 + '/11/2026 una cifra araba'
        $nonCapite = @('31/02/2027 Carnevale', '06/01/2027-23/12/2026 al contrario', 'Natale', '1/11/202 anno di tre cifre', '32/01/2027',
                       'dal 23/12/2026 a 06/01/2027 Natale', '23/12/2026 / 06/01/2027 Natale', '07/12/2026, 08/12/2026 ponte',
                       '07/12/2026 e 08/12/2026 ponte', '2026-11-01-03 ponte', 'dal 23/12 fino a 06/01 Natale',
                       $cifreLarghe, $cifreArabe,
                       # la seconda data a parole, o solo il giorno: la fine del periodo non e' una data che capisco
                       'dal 23/12/2026 al 6 gennaio 2027 Vacanze di Natale', '23/12/2026 - 6 gennaio 2027',
                       "23/12/2026 $trattino 6 gen. 2027 Natale", '01/11/2026 - 03', '2026-11-01 - 03', 'dal 02/11/2026 al 3',
                       'dal 02/11/2026 fino al 3 Ponte', "dal 02/11/2026 all'8 Ponte", '07/12/2026 e 8 dicembre ponte',
                       '01/11/2026 Tutti i Santi e ponte fino al 2 novembre', '01/11/2026, 2 ponte',
                       # il mese una volta sola, ma con "e" due giorni lontani, al contrario o impossibili
                       '7 e 9/12/2026 ponte', '31-23/12/2026', '30-31/11/2026', '7 e 8/13/2026', '7-8 dicembre 2026 e 9 dicembre',
                       # "dal" e una data sola: la fine manca, o e' a parole
                       "dal 23 dicembre 2026 all'Epifania", "dal 23/12/2026 all'Epifania Vacanze di Natale",
                       'dal 23/12/2026 fino a Epifania', 'dal 23/12/2026 Vacanze di Natale',
                       # con la data della riga con il punto, un altro giorno con il punto nel nome
                       '7.12 ponte, 8.12 Immacolata', '07.12 ponte - 08.12 Immacolata')
        foreach ($n in $nonCapite) {
            try { $r = LeggiRighe $n '2026-09-14'; $l = @(Lette $n '2026-09-14') }
            catch { Verifica "'$n' non si capisce, e lo dice (invece: $($_.Exception.InnerException.GetType().Name))" $false; continue }
            Verifica "'$n' non si capisce, e lo dice ($(if ($l.Count) { $l[0].Motivo }))" (
                $r.Righe.Count -eq 0 -and $r.NonCapite.Count -eq 1 -and $r.NonCapite[0] -eq $n -and $l.Count -eq 1 -and
                $null -eq $l[0].Giorni -and $l[0].Motivo -ne '')
        }
        # come la pagina le mostra, una per riga scritta: il periodo capito con i
        # giorni della settimana, e quelle da guardare con il perche'
        $mDescrivi = $tCal.GetMethod('Descrivi', $FS)
        $mGuardare = $tCal.GetMethod('DaGuardare', $FS)
        $scritte = "# le date della circolare`r`n`r`n07/12/2026 ponte e martedi' 8`r`n01/11/2026 - 03`r`n23-31/12/2026 Vacanze`r`n01/11/2025 Tutti i Santi"
        $mostrate = @(Lette $scritte '2026-09-14' | ForEach-Object {
            [string]$mDescrivi.Invoke($null, @($_.PSObject.BaseObject, (DataIso '2026-09-14'), (DataIso '2027-06-10'))) })
        $daGuardare = @(Lette $scritte '2026-09-14' | ForEach-Object {
            [bool]$mGuardare.Invoke($null, @($_.PSObject.BaseObject, (DataIso '2026-09-14'), (DataIso '2027-06-10'))) }) -join ','
        $attese = @("riga 3: dal lun 07/12/2026 al lun 07/12/2026 (1 giorno) ponte e martedi' 8   <- $avvisoNumero",
                    'riga 4: non capita: la fine del periodo va scritta come data, come 01/11/2026-03/11/2026 o 1-3/11/2026',
                    'riga 5: dal mer 23/12/2026 al gio 31/12/2026 (9 giorni) Vacanze',
                    "riga 6: dal sab 01/11/2025 al sab 01/11/2025 (1 giorno) Tutti i Santi   <- fuori dal periodo: controlla l'anno")
        Verifica "ogni riga come la mostra la pagina, con il suo numero, i giorni della settimana e quelle da guardare ($($mostrate -join ' | '))" (
            ($mostrate -join '|') -eq ($attese -join '|') -and $daGuardare -eq 'True,True,False,True')
        # gli a capo che non sono \r o \n (incollati da un PDF o da una pagina web)
        foreach ($acapo in @([char]0x2028, [char]0x2029, [char]0x0B, [char]0x0C, [char]0x85)) {
            $r = LeggiRighe ("01/11/2026 Tutti i Santi" + $acapo + "08/12/2026 Immacolata") '2026-09-14'
            Verifica ("con l'a capo U+{0:X4} fra due righe, due giorni" -f [int]$acapo) (
                ($r.Righe -join '|') -eq '2026-11-01..2026-11-01 Tutti i Santi|2026-12-08..2026-12-08 Immacolata' -and $r.NonCapite.Count -eq 0)
        }
        $daControllare = @($conAvviso + $conDurata + $conConfine)
        $tutto = (@('', '# le vacanze della regione') + @($capite | ForEach-Object { $_[0] }) + @('   ', '  # anche con spazi prima') +
                  @($daControllare | ForEach-Object { $_[0] }) + $nonCapite) -join "`r`n"
        $r = LeggiRighe $tutto '2026-09-14'
        $l = @(Lette $tutto '2026-09-14')
        Verifica "tutte insieme: $($capite.Count + $daControllare.Count) capite nell'ordine ($($daControllare.Count) da controllare), le vuote e le note con # ignorate, $($nonCapite.Count) non capite" (
            ($r.Righe -join '|') -eq (@($capite + $daControllare | ForEach-Object { $_[1] }) -join '|') -and
            ($r.NonCapite -join '|') -eq ($nonCapite -join '|') -and
            @($l | Where-Object { $_.Avviso -ne '' }).Count -eq $daControllare.Count -and
            $l.Count -eq ($capite.Count + $daControllare.Count + $nonCapite.Count) -and $l[0].Numero -eq 3)
        $r = LeggiRighe "01/11 Tutti i Santi`n29/03 Pasquetta" '2027-01-10'
        Verifica "senza anno, con il periodo che comincia a gennaio: novembre e' dell'anno prima" (
            ($r.Righe -join '|') -eq '2026-11-01..2026-11-01 Tutti i Santi|2027-03-29..2027-03-29 Pasquetta')
        $r = LeggiRighe "01/11 Tutti i Santi`n29/03 Pasquetta" '2026-08-28'
        Verifica "e con il periodo che comincia a fine agosto: e' l'anno che comincia a settembre" (
            ($r.Righe -join '|') -eq '2026-11-01..2026-11-01 Tutti i Santi|2027-03-29..2027-03-29 Pasquetta')

        # --- le feste nazionali ---------------------------------------------
        Write-Host "`nI GIORNI SENZA LEZIONE: LE FESTE NAZIONALI" -ForegroundColor Cyan
        function Feste($da, $a) {
            $b = New-Object 'object[]' 2
            $b[0] = DataIso $da
            $b[1] = DataIso $a
            @($tCal.GetMethod('Festivita', $FS).Invoke($null, $b) | ForEach-Object { (Giorno $_.Dal) + ' ' + $_.Nome })
        }
        function Pasqua([int]$anno) { Giorno ($tCal.GetMethod('Pasqua', $FS).Invoke($null, @($anno))) }
        $f = Feste '2026-09-01' '2027-08-31'
        Verifica "anno 2026/27: dodici feste, nell'ordine ($(@($f | ForEach-Object { $_.Substring(0, 10) }) -join ' '))" (
            (@($f | ForEach-Object { $_.Substring(0, 10) }) -join ' ') -eq
            '2026-10-04 2026-11-01 2026-12-08 2026-12-25 2026-12-26 2027-01-01 2027-01-06 2027-03-28 2027-03-29 2027-04-25 2027-05-01 2027-06-02')
        Verifica "con i loro nomi" (
            $f -contains "2026-10-04 San Francesco d'Assisi e Santa Caterina da Siena" -and $f -contains '2026-11-01 Tutti i Santi' -and
            $f -contains '2026-12-08 Immacolata' -and $f -contains '2027-03-28 Pasqua' -and
            $f -contains "2027-03-29 Lunedi' dell'Angelo" -and $f -contains '2027-04-25 Festa della Liberazione' -and
            $f -contains '2027-05-01 Festa del Lavoro' -and $f -contains '2027-06-02 Festa della Repubblica' -and
            $f -contains '2027-01-06 Epifania' -and $f -contains '2026-12-26 Santo Stefano')
        $f = Feste '2027-09-01' '2028-08-31'
        Verifica "anno 2027/28: Pasqua il 16 aprile 2028 e Pasquetta il 17, e il 4 ottobre c'e'" (
            $f -contains '2028-04-16 Pasqua' -and $f -contains "2028-04-17 Lunedi' dell'Angelo" -and
            @($f | Where-Object { $_ -like '2027-10-04 *' }).Count -eq 1 -and $f.Count -eq 12)
        $f = Feste '2025-09-01' '2026-08-31'
        Verifica "anno 2025/26: Pasqua il 5 aprile 2026, e il 4 ottobre 2025 non e' festa (lo e' dal 2026)" (
            $f -contains '2026-04-05 Pasqua' -and @($f | Where-Object { $_ -like '2025-10-04 *' }).Count -eq 0 -and $f.Count -eq 11)
        $pasque = @{ 2019 = '2019-04-21'; 2025 = '2025-04-20'; 2026 = '2026-04-05'; 2027 = '2027-03-28'; 2028 = '2028-04-16'; 2038 = '2038-04-25'; 2285 = '2285-03-22' }
        $sbagliate = @($pasque.Keys | Where-Object { (Pasqua $_) -ne $pasque[$_] } | ForEach-Object { "$_ -> $(Pasqua $_)" })
        Verifica "Pasqua giusta anche negli anni limite (la piu' tardi e la piu' presto)$(if ($sbagliate.Count) { ': no ' + ($sbagliate -join ', ') })" ($sbagliate.Count -eq 0)
        $f = Feste '2026-11-01' '2026-12-08'
        Verifica "il primo e l'ultimo giorno del periodo sono compresi" (($f -join '|') -eq '2026-11-01 Tutti i Santi|2026-12-08 Immacolata')

        # "Aggiungi le feste nazionali": in fondo, solo quelle non coperte da una riga
        function ConFeste($testo, $da, $a) {
            $b = New-Object 'object[]' 4
            $b[0] = [string]$testo
            $b[1] = DataIso $da
            $b[2] = DataIso $a
            $b[3] = 0
            $nuovo = $tCal.GetMethod('ConFeste', $FS).Invoke($null, $b)
            @{ Testo = [string]$nuovo; Aggiunte = [int]$b[3] }
        }
        $prima = "23/12/2026-06/01/2027 Natale`r`n01/11/2026 Tutti i Santi"
        $cf = ConFeste $prima '2026-09-14' '2027-06-10'
        $righeNuove = @($cf.Testo -split "`r`n")
        Verifica "aggiunge le 7 feste del periodo non coperte da una riga ($($cf.Aggiunte))" ($cf.Aggiunte -eq 7 -and $righeNuove.Count -eq 9)
        Verifica "in fondo, dopo le righe che c'erano" ($cf.Testo.StartsWith($prima + "`r`n") -and
            $righeNuove[2] -eq "04/10/2026 San Francesco d'Assisi e Santa Caterina da Siena" -and
            $righeNuove[3] -eq '08/12/2026 Immacolata' -and $righeNuove[8] -eq '02/06/2027 Festa della Repubblica')
        $r = LeggiRighe $cf.Testo '2026-09-14'
        Verifica "e le righe aggiunte si rileggono" ($r.Righe.Count -eq 9 -and $r.NonCapite.Count -eq 0)
        $ancora = ConFeste $cf.Testo '2026-09-14' '2027-06-10'
        Verifica "una seconda volta non aggiunge niente" ($ancora.Aggiunte -eq 0 -and $ancora.Testo -eq $cf.Testo)
        $vuoto = ConFeste '' '2026-09-14' '2027-06-10'
        Verifica "partendo da vuoto le mette tutte e dodici, senza righe vuote" ($vuoto.Aggiunte -eq 12 -and @($vuoto.Testo -split "`r`n").Count -eq 12)
        # un periodo con il punto in fondo copre le feste che contiene
        $natale = ConFeste 'dal 23/12/2026 al 06/01/2027.' '2026-09-14' '2027-06-10'
        Verifica "le vacanze di Natale scritte con il punto in fondo coprono Natale, Santo Stefano, Capodanno ed Epifania" (
            $natale.Aggiunte -eq 8 -and
            -not (@($natale.Testo -split "`r`n" | Select-Object -Skip 1) -match '25/12/2026|26/12/2026|01/01/2027|06/01/2027'))
        # Pasqua (o Pasquetta) il 25 aprile: una riga sola per quel giorno, con i due nomi
        $f = Feste '2037-09-01' '2038-08-31'
        Verifica "anno 2037/38: Pasqua il 25 aprile 2038, e le feste in ordine di data" (
            $f -contains '2038-04-25 Pasqua' -and
            (@($f | ForEach-Object { $_.Substring(0, 10) }) -join ' ') -eq (@($f | ForEach-Object { $_.Substring(0, 10) } | Sort-Object) -join ' '))
        $doppia = ConFeste '' '2037-09-01' '2038-08-31'
        $righe2038 = @($doppia.Testo -split "`r`n")
        Verifica "Pasqua il 25 aprile: una riga sola, '25/04/2038 Pasqua e Festa della Liberazione' ($($doppia.Aggiunte) aggiunte)" (
            @($righe2038 | Where-Object { $_ -like '25/04/2038*' }).Count -eq 1 -and
            $righe2038 -contains '25/04/2038 Pasqua e Festa della Liberazione' -and $doppia.Aggiunte -eq 11 -and $righe2038.Count -eq 11)
        $doppia = ConFeste '' '2010-09-01' '2011-08-31'
        Verifica "e Pasquetta il 25 aprile (2011): '25/04/2011 Lunedi' dell'Angelo e Festa della Liberazione'" (
            @($doppia.Testo -split "`r`n" | Where-Object { $_ -like '25/04/2011*' }).Count -eq 1 -and
            ($doppia.Testo -split "`r`n") -contains "25/04/2011 Lunedi' dell'Angelo e Festa della Liberazione")

        # --- le righe fuori dal periodo (un anno sbagliato) si contano a parte
        $fp = LeggiRighe "01/11/2025 Tutti i Santi`n08/12/2026 Immacolata`n2027-06-11 dopo la fine`n2026-09-14 il primo giorno" '2026-09-14'
        $b = New-Object 'object[]' 3
        $b[0] = $fp.Lista
        $b[1] = DataIso '2026-09-14'
        $b[2] = DataIso '2027-06-10'
        $mFuori = $tCal.GetMethod('FuoriPeriodo', $FS)
        $fuori = if ($null -ne $mFuori) { @($mFuori.Invoke($null, $b) | ForEach-Object { Giorno $_.Dal }) } else { @('(manca Calendario.FuoriPeriodo)') }
        Verifica "le righe fuori dal periodo sono quelle prima dell'inizio e dopo la fine ($($fuori -join ', '))" (
            ($fuori -join ',') -eq '2025-11-01,2027-06-11')

        # --- la fine di partenza del periodo: il 10 giugno dell'anno scolastico,
        # con luglio e agosto che contano gia' per l'anno che parte a settembre
        # (la stessa regola delle righe senza anno), e mai prima di oggi
        $mFine = $asm.GetType('Campanella.PaginaOrari').GetMethod('FineLezioni', $FS)
        foreach ($c in @(@('2026-08-20', '2027-06-10'), @('2026-07-01', '2027-06-10'), @('2026-09-24', '2027-06-10'),
                         @('2027-01-15', '2027-06-10'), @('2027-06-10', '2027-06-10'), @('2027-06-20', '2028-06-10'))) {
            $fl = Giorno ($mFine.Invoke($null, @((DataIso $c[0]))))
            Verifica "oggi $($c[0]): la fine proposta e' il $($c[1]) ($fl)" ($fl -eq $c[1])
        }

        # --- la guida del passo 4 dice di reincollare il codice degli orari di
        # una versione di prima, che non conosce i giorni senza lezione: con la
        # versione che l'anteprima stampa, quella del codice di adesso
        $vOrari = [string]$asm.GetType('Campanella.Guscio').GetMethod('VersioneScript', $FS).Invoke($null, @([string]'Orari.gs'))
        $vSorgente = [regex]::Match([IO.File]::ReadAllText((Join-Path (Split-Path -Parent $qui) 'src\risorse\Orari.gs')),
                                    "var _ORARI_VERSIONE\s*=\s*'([0-9.]+)'").Groups[1].Value
        $pagina4 = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($asm.GetType('Campanella.PaginaOrari'))
        $guida4 = [string]$asm.GetType('Campanella.PaginaOrari').GetMethod('IstruzioniCalendario',
            [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($pagina4, @())
        Verifica "la guida del passo 4 dice di reincollare il codice se ORARI_1_anteprima non scrive la versione di adesso ($vOrari)" (
            $vOrari -ne '' -and $vOrari -eq $vSorgente -and $guida4.Contains("""Orari.gs versione $vOrari""") -and
            $guida4 -match 'reincolla il codice' -and $guida4 -match 'giorni senza lezione, che finirebbero')
        # le righe da guardare: la guida, l'aiuto della casella e le istruzioni
        # nominano anche un giorno che sembra il confine di un periodo
        $paginaOrariCs = [IO.File]::ReadAllText((Join-Path (Split-Path -Parent $qui) 'src\PaginaOrari.cs'))
        $istruzioni = [IO.File]::ReadAllText((Join-Path (Split-Path -Parent $qui) 'ISTRUZIONI - Campanella.txt'))
        Verifica "guida del passo 4, aiuto dei giorni senza lezione e istruzioni dicono del giorno che sembra l'inizio o la fine di un periodo" (
            (($guida4 -replace '\s+', ' ') -match "sembra l'inizio o la fine di un periodo, o un giorno di lezione") -and
            (($guida4 -replace '\s+', ' ') -match '23/12/2026 Vacanze natalizie" e'' solo il 23') -and
            $paginaOrariCs.Contains("che sembra l'inizio o la fine di un periodo, o un giorno di lezione (\""23/12/2026 Vacanze") -and
            (($istruzioni -replace '\s+', ' ') -match "sembra l'inizio o la fine di un periodo, o un giorno di lezione"))

        # --- il piano: una serie per ogni tratto di settimane senza interruzioni
        Write-Host "`nI GIORNI SENZA LEZIONE: IL PIANO DEL CALENDARIO" -ForegroundColor Cyan
        $oPiano = AnalizzaFile (ScriviCsv 'piano.csv' @(
            'Orario dal 1/3;;;;;;',
            ';LUN;;MAR;;MER;',
            ';1;2;1;2;1;2',
            'ROSSI;1A;1A;;;2B;',
            'VERDI;;;3C;;;'))
        function Piano($docente, $da, $a, $testo) {
            $sosp = LeggiRighe $testo $da
            $b = New-Object 'object[]' 5
            $b[0] = $oPiano.PSObject.BaseObject
            $b[1] = [string]$docente
            $b[2] = DataIso $da
            $b[3] = DataIso $a
            $b[4] = $sosp.Lista
            $p = $tCal.GetMethod('PianoDelDocente', $FS).Invoke($null, $b)
            @{ Serie = @($p.Serie | ForEach-Object { $_.Blocco.Testo + ' ' + (Giorno $_.Dal) + '..' + (Giorno $_.Al) + ' (' + $_.Lezioni + ')' });
               Saltate = $p.Saltate; Lezioni = $p.Lezioni; Fuori = $p.BlocchiFuori }
        }
        $p = Piano 'ROSSI' '2027-03-01' '2027-04-14' '29/03/2027 Pasquetta'
        Verifica "Pasquetta spezza il blocco del lunedi' in due serie e lascia intero quello del mercoledi' ($($p.Serie -join ', '))" (
            ($p.Serie -join '|') -eq '1A 2027-03-01..2027-03-22 (4)|1A 2027-04-05..2027-04-12 (2)|2B 2027-03-03..2027-04-14 (7)')
        Verifica "tre serie, una lezione saltata, 13 messe" ($p.Saltate -eq 1 -and $p.Lezioni -eq 13 -and $p.Fuori -eq 0)
        $p = Piano 'ROSSI' '2027-03-01' '2027-04-14' 'dal 24/03/2027 al 06/04/2027 Vacanze di Pasqua'
        Verifica "le vacanze lunghe tolgono due settimane al lunedi' e due al mercoledi' ($($p.Serie -join ', '))" (
            ($p.Serie -join '|') -eq '1A 2027-03-01..2027-03-22 (4)|1A 2027-04-12..2027-04-12 (1)|2B 2027-03-03..2027-03-17 (3)|2B 2027-04-07..2027-04-14 (2)' -and
            $p.Saltate -eq 4)
        $p = Piano 'ROSSI' '2027-03-01' '2027-04-14' "dal 01/03/2027 al 14/04/2027 Tutto chiuso"
        Verifica "un periodo tutto chiuso: nessuna serie, tutte le lezioni saltate" ($p.Serie.Count -eq 0 -and $p.Saltate -eq 14 -and $p.Lezioni -eq 0)
        $p = Piano 'ROSSI' '2027-03-02' '2027-03-02' ''
        Verifica "un periodo di un martedi' non contiene ne' il lunedi' ne' il mercoledi'" ($p.Serie.Count -eq 0 -and $p.Fuori -eq 2)
        $p = Piano 'VERDI' '2027-03-01' '2027-03-31' '# niente'
        Verifica "senza giorni senza lezione: una serie per blocco, fino all'ultima settimana" (($p.Serie -join '|') -eq '3C 2027-03-02..2027-03-30 (5)' -and $p.Saltate -eq 0)
    }

    # --- DatiOrari.gs porta i giorni senza lezione e la data del cambio -----
    Write-Host "`nDATIORARI.GS: GIORNI SENZA LEZIONE E CAMBIO D'ORARIO" -ForegroundColor Cyan
    $leggiCal = Join-Path $tmp 'leggi_calendario.js'
    [System.IO.File]::WriteAllText($leggiCal, @'
// carica DatiOrari.gs e stampa la parte del calendario che serve alla prova
const fs = require('fs');
const vm = require('vm');
const contesto = vm.createContext({});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), contesto);
const c = contesto.ORARI && contesto.ORARI.calendario;
console.log(JSON.stringify({
  sospensioni: c && Array.isArray(c.sospensioni) ? c.sospensioni : null,
  validoDal: c && typeof c.validoDal === 'string' ? c.validoDal : null
}));
'@, $utf8)
    function CalendarioGenerato($s) {
        $gs = GeneraDati (AnalizzaFile $File) $s $false
        $f = Join-Path $tmp 'DatiOrari_calendario.gs'
        [System.IO.File]::WriteAllText($f, $gs, $utf8)
        $esito = & node $leggiCal $f
        if ($LASTEXITCODE -ne 0 -or -not $esito) { return $null }
        ($esito | Select-Object -Last 1) | ConvertFrom-Json
    }
    $s = NuovoStato
    $s.CalDocente = [string]($o.Docenti() | Select-Object -First 1)
    $s.CalInizio = '2026-09-14'
    $s.CalFine = '2027-06-10'
    $s.CalSospensioni = "01/11 Tutti i Santi`r`n# una nota`r`n23/12-06/01 Vacanze di ""Natale"" \ prova`r`nquesta no`r`n31/02/2027 nemmeno questa`r`n29/03/2027"
    $s.CalValidoDal = '2026-10-05'
    $r = CalendarioGenerato $s
    Verifica "DatiOrari.gs si carica e ha sospensioni e validoDal" ($null -ne $r -and $null -ne $r.sospensioni -and $null -ne $r.validoDal)
    if ($null -ne $r -and $null -ne $r.sospensioni) {
        $sosp = @($r.sospensioni | ForEach-Object { $_.dal + '..' + $_.al + ' ' + $_.nome })
        Verifica "solo le righe capite, come date aaaa-mm-gg ($($sosp -join ' | '))" (
            ($sosp -join '|') -eq ('2026-11-01..2026-11-01 Tutti i Santi|2026-12-23..2027-01-06 Vacanze di "Natale" \ prova|' +
                                   '2027-03-29..2027-03-29 '))
        Verifica "la data del cambio d'orario" ($r.validoDal -eq '2026-10-05')
    }
    # l'intestazione dice che cosa c'e': anche i giorni senza lezione, con il
    # nome scritto dal docente (testo libero: un permesso, il nome di un collega)
    $intestazione = [regex]::Replace((GeneraDati (AnalizzaFile $File) $s $false).Split(@('*/'), 2, [StringSplitOptions]::None)[0],
                                     '\s+', ' ')
    Verifica "l'intestazione di DatiOrari.gs nomina anche i giorni senza lezione, con il nome che hai scritto" (
        $intestazione -match 'cognomi, classi e ore' -and $intestazione -match 'i giorni senza lezione, con il nome che hai scritto')
    $s.CalSospensioni = ''
    $s.CalValidoDal = ''
    $r = CalendarioGenerato $s
    Verifica "senza giorni senza lezione e senza cambio: un elenco vuoto e validoDal vuoto" (
        $null -ne $r -and $null -ne $r.sospensioni -and @($r.sospensioni).Count -eq 0 -and $r.validoDal -eq '')

    # --- i colori delle classi: di partenza, e poi sempre gli stessi ---------
    # Ogni classe dell'orario del docente ha il colore delle sue lezioni sul
    # calendario (CalendarApp.EventColor, da "1" a "11"). Di partenza lo da'
    # Campanella, nell'ordine fisso, e la classe lo tiene: una classe nuova
    # non cambia quelli delle altre. Uno scelto a mano resta.
    Write-Host "`nDATIORARI.GS: I COLORI DELLE CLASSI" -ForegroundColor Cyan
    $tCL = $asm.GetType('Campanella.ColoriLezioni')
    Verifica "c'e' ColoriLezioni, con Completa, DiPartenza, Nome e Esadecimale" (
        $null -ne $tCL -and $null -ne $tCL.GetMethod('Completa', $FS) -and $null -ne $tCL.GetMethod('DiPartenza', $FS) -and
        $null -ne $tCL.GetMethod('Nome', $FS) -and $null -ne $tCL.GetMethod('Esadecimale', $FS))
    if ($null -ne $tCL) {
        $leggiColori = Join-Path $tmp 'leggi_colori.js'
        [System.IO.File]::WriteAllText($leggiColori, @'
// carica DatiOrari.gs e stampa i colori delle classi, nell'ordine in cui sono scritti
const fs = require('fs');
const vm = require('vm');
const contesto = vm.createContext({});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), contesto);
const c = contesto.ORARI && contesto.ORARI.calendario;
console.log(JSON.stringify(c && c.colori && typeof c.colori === 'object' ? c.colori : null));
'@, $utf8)
        function ColoriGenerati($o, $s) {
            $f = Join-Path $tmp 'DatiOrari_colori.gs'
            [System.IO.File]::WriteAllText($f, (GeneraDati $o $s $false), $utf8)
            $esito = & node $leggiColori $f
            if ($LASTEXITCODE -ne 0 -or -not $esito) { return '(DatiOrari.gs non si carica)' }
            [string]($esito | Select-Object -Last 1)
        }
        function Completa($colori, $aMano, [string[]]$classi) {
            $lista = New-Object 'System.Collections.Generic.List[string]'
            foreach ($k in $classi) { $lista.Add($k) }
            $a = New-Object 'object[]' 3
            $a[0] = $colori.PSObject.BaseObject
            $a[1] = $aMano.PSObject.BaseObject
            $a[2] = $lista.PSObject.BaseObject
            $tCL.GetMethod('Completa', $FS).Invoke($null, $a)
        }
        function Nome([string]$v) { $tCL.GetMethod('Nome', $FS).Invoke($null, @($v)) }
        # ROSSI ha sei classi, con le ore "D" (a disposizione); VERDI un'altra orario
        $oc = AnalizzaFile (ScriviCsv 'colori.csv' @(
            'Orario dal 14/09;;;;;;;;;;;;',
            ';LUN;;;MAR;;;MER;;;GIO;;',
            ';1;2;3;1;2;3;1;2;3;1;2;3',
            'ROSSI;2B;2B;10A;D;3B LSA;;1A;;D;2A;;',
            'VERDI;1A;;;2B;;;;;;;3B LSA;'))
        $s = NuovoStato
        $s.CalDocente = 'ROSSI'
        $s.CalInizio = '2026-09-14'
        $s.CalFine = '2027-06-10'
        $primo = ColoriGenerati $oc $s
        $partenza = '{"1A":"11","2A":"9","2B":"10","3B LSA":"6","10A":"3","A disposizione":"8"}'
        Verifica "di partenza ogni classe ha un colore diverso, nell'ordine fisso (1A Pomodoro, 2A Mirtillo, 2B Basilico, 3B LSA Mandarino, 10A Vinaccia), le ore a disposizione Grafite: $primo" (
            $primo -eq $partenza)
        Verifica "  ...e i colori dati restano nelle impostazioni, nessuno scelto a mano" (
            $s.CalColori.Count -eq 6 -and $s.CalColori['10A'] -eq '3' -and $s.CalColoriAMano.Count -eq 0)
        Verifica "rigenerato, DatiOrari.gs ha gli stessi colori" ((ColoriGenerati $oc $s) -eq $partenza)
        # una classe nuova nell'orario (un cambio d'orario): le altre tengono il loro colore
        $l = [Activator]::CreateInstance($asm.GetType('Campanella.Lezione'))
        $l.Docente = 'ROSSI'; $l.Giorno = 3; $l.Ora = 3; $l.Classe = '4C'
        $oc.Lezioni.Add($l)
        $conNuova = ColoriGenerati $oc $s
        Verifica "una classe nuova prende un colore che le altre non hanno (Pavone), e le altre tengono il loro: $conNuova" (
            $conNuova -eq '{"1A":"11","2A":"9","2B":"10","3B LSA":"6","4C":"7","10A":"3","A disposizione":"8"}')
        # scelti a mano: 2B con il colore del calendario, 2A con lo stesso colore di 1A
        $s.CalColori['2B'] = ''
        $s.CalColori['2A'] = '11'
        $s.CalColoriAMano.Add('2B')
        $s.CalColoriAMano.Add('2A')
        $aMano = ColoriGenerati $oc $s
        Verifica "i colori scelti a mano restano: 2B (colore del calendario) non e' in DatiOrari.gs, 2A e' Pomodoro; 1A, che aveva lo stesso, prende quello lasciato da 2A: $aMano" (
            $aMano -eq '{"1A":"9","2A":"11","3B LSA":"6","4C":"7","10A":"3","A disposizione":"8"}')
        Verifica "  ...e rigenerato non cambia piu'" ((ColoriGenerati $oc $s) -eq $aMano)
        # "Colori di partenza": dimentica le scelte, e da' i colori come la prima volta
        $lista = New-Object 'System.Collections.Generic.List[string]'
        foreach ($k in @('1A', '2A', '2B', '3B LSA', '4C', '10A', 'A disposizione')) { $lista.Add($k) }
        $a = New-Object 'object[]' 3
        $a[0] = $s.CalColori.PSObject.BaseObject; $a[1] = $s.CalColoriAMano.PSObject.BaseObject; $a[2] = $lista.PSObject.BaseObject
        $tCL.GetMethod('DiPartenza', $FS).Invoke($null, $a) | Out-Null
        Verifica "i colori di partenza dimenticano le scelte a mano e rifanno l'ordine fisso" (
            $s.CalColoriAMano.Count -eq 0 -and
            (ColoriGenerati $oc $s) -eq '{"1A":"11","2A":"9","2B":"10","3B LSA":"6","4C":"3","10A":"7","A disposizione":"8"}')
        # due classi con lo stesso colore dato da Campanella (mentre si scriveva il
        # nome di un altro docente): la seconda ne prende uno libero, la prima lo tiene
        $colori = New-Object 'System.Collections.Generic.Dictionary[string,string]'
        $colori['1A'] = '11'; $colori['2A'] = '11'; $colori['2B'] = '9'
        $vuota = New-Object 'System.Collections.Generic.List[string]'
        [void](Completa $colori $vuota @('2A', '1A', '2B'))
        Verifica "due classi con lo stesso colore di partenza: la prima lo tiene, la seconda ne prende uno libero ($($colori['1A']), $($colori['2A']), $($colori['2B']))" (
            $colori['1A'] -eq '11' -and $colori['2A'] -eq '10' -and $colori['2B'] -eq '9')
        $scelte = New-Object 'System.Collections.Generic.List[string]'
        $scelte.Add('2A')
        $colori['2A'] = '11'
        [void](Completa $colori $scelte @('1A', '2A', '2B'))
        Verifica "  ...ma un colore scelto a mano resta anche se e' di un'altra classe: cambia quella con il colore di partenza ($($colori['1A']), $($colori['2A']))" (
            $colori['2A'] -eq '11' -and $colori['1A'] -ne '11' -and $colori['1A'] -ne '9')
        $scelte.Add('1A')
        $colori['1A'] = '11'
        [void](Completa $colori $scelte @('1A', '2A', '2B'))
        Verifica "  ...e due scelte a mano uguali restano tutte e due" ($colori['1A'] -eq '11' -and $colori['2A'] -eq '11')
        # piu' classi che colori: le prime undici tutte diverse, le altre il meno usato; poi fermo
        $colori = New-Object 'System.Collections.Generic.Dictionary[string,string]'
        $tante = @(1..13 | ForEach-Object { "$($_)A" })
        [void](Completa $colori $vuota $tante)
        $prime = @($tante[0..10] | ForEach-Object { $colori[$_] })
        $prima = ($tante | ForEach-Object { $colori[$_] }) -join ','
        $cambiate = Completa $colori $vuota $tante
        Verifica "con 13 classi le prime 11 hanno tutti i colori, le altre due quelli meno usati, e rifatto non cambia ($prima)" (
            @($prime | Sort-Object -Unique).Count -eq 11 -and $colori['12A'] -ne '' -and $colori['13A'] -ne '' -and
            -not $cambiate -and (($tante | ForEach-Object { $colori[$_] }) -join ',') -eq $prima)
        Verifica "i nomi dei colori sono quelli di Google Calendar in italiano" (
            (Nome '11') -eq 'Pomodoro' -and (Nome '9') -eq 'Mirtillo' -and (Nome '10') -eq 'Basilico' -and
            (Nome '8') -eq 'Grafite' -and (Nome '1') -eq 'Lavanda' -and (Nome '') -eq 'colore del calendario' -and
            $tCL.GetMethod('Esadecimale', $FS).Invoke($null, @('9')) -eq '#3f51b5')
        # l'ordine delle classi e' lo stesso qui (la finestra dei colori, il
        # riepilogo) e in Orari.gs (l'anteprima e i messaggi)
        $esempio = @('10A', '2B', 'A disposizione', '1a', '3B LSA', '2A', 'B1', '003C', 'b0')
        $lista = New-Object 'System.Collections.Generic.List[string]'
        foreach ($k in $esempio) { $lista.Add($k) }
        $ordineCs = ($tCL.GetMethod('Ordinate', $FS).Invoke($null, @(, $lista.PSObject.BaseObject))) -join '|'
        $ordina = Join-Path $tmp 'ordina_classi.js'
        [System.IO.File]::WriteAllText($ordina, @'
// ordina le classi con _orariOrdineClassi_ di Orari.gs
const fs = require('fs');
const vm = require('vm');
const contesto = vm.createContext({});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), contesto);
console.log(fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(x => x).sort(contesto._orariOrdineClassi_).join('|'));
'@, $utf8)
        $elenco = Join-Path $tmp 'classi.txt'
        [System.IO.File]::WriteAllText($elenco, ($esempio -join "`n"), $utf8)
        $ordineJs = [string](& node $ordina (Join-Path (Split-Path -Parent $qui) 'src\risorse\Orari.gs') $elenco | Select-Object -Last 1)
        Verifica "le classi sono nello stesso ordine qui e in Orari.gs ($ordineCs)" (
            $ordineCs -eq $ordineJs -and $ordineCs -eq '1a|2A|2B|003C|3B LSA|10A|b0|B1|A disposizione')
        # senza docente: nessun colore, e DatiOrari.gs non ha il calendario
        $s2 = NuovoStato
        Verifica "senza il docente del calendario i colori non si toccano" (
            (ColoriGenerati $oc $s2) -eq 'null' -and $s2.CalColori.Count -eq 0)
    }

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
    # il calendario per il primo docente con lezioni il lunedi' e il mercoledi':
    # il banco vuole vedere Pasquetta spezzare un blocco del lunedi' e non uno
    # del mercoledi'. Se non c'e', il primo con almeno un'ora di lezione
    function HaLezioni($docente, $giorno) {
        $colonna = $o.Colonna($giorno)
        if ($colonna -lt 0) { return $false }
        $g = $o.GrigliaDocente($docente)
        for ($h = 0; $h -lt $o.OrePerGiorno; $h++) { if ($g[$h, $colonna]) { return $true } }
        return $false
    }
    $conLunMer = [string]($o.Docenti() | Where-Object { (HaLezioni $_ 0) -and (HaLezioni $_ 2) } | Select-Object -First 1)
    if ($conLunMer -eq '') { $conLunMer = [string]($o.Docenti() | Where-Object { $o.OreDi($_) -gt 0 } | Select-Object -First 1) }
    $s.CalDocente = $conLunMer
    $s.CalNome = 'Orario di prova'
    $s.CalInizio = '2026-09-14'
    $s.CalFine = '2027-06-10'
    $s.CalPrimaOra = '08:00'
    $s.CalMinutiOra = 60
    $s.CalOreInizio = '08:00, 09:00, 10:00, 11:10, 12:10, 13:10'
    $s.CalColore = 'BLUE'
    # i giorni senza lezione come li scriverebbe un docente, con una riga che
    # non si capisce (resta fuori da DatiOrari.gs), e un cambio d'orario
    $s.CalSospensioni = @(
        '# giorni senza lezione di prova',
        '01/11 Tutti i Santi',
        '07/12/2026 Ponte',
        '08/12/2026 Immacolata',
        'dal 23/12/2026 al 06/01/2027 Vacanze di Natale',
        '15/02/2027-16/02/2027 Carnevale',
        '28/03/2027 Pasqua',
        "29/03/2027 Lunedi' dell'Angelo",
        '25/04/2027 Festa della Liberazione',
        '01/05/2027 Festa del Lavoro',
        '02/06/2027 Festa della Repubblica',
        'questa riga non si capisce') -join "`r`n"
    $s.CalValidoDal = '2026-10-05'
    $generato = Join-Path $tmp 'DatiOrari_generato.gs'
    [System.IO.File]::WriteAllText($generato, (GeneraDati $o $s $true), $utf8)
    Write-Host "  (calendario di $($s.CalDocente), cambio d'orario dal $($s.CalValidoDal))"
    $uscita = & node (Join-Path $qui 'mock_orari.js') $generato
    $esitoBanco = $LASTEXITCODE
    $uscita | Where-Object { $_ -match 'FALLITO|PROVE FALLITE|Tutte le prove' } | ForEach-Object { Write-Host "          $_" }
    Verifica "mock_orari.js passa con i dati scritti dal generatore ($(@($uscita | Where-Object { $_ -match '^\s+OK ' }).Count) controlli)" ($esitoBanco -eq 0)

    # la regola "D", la fusione delle ore in blocchi e il piano del calendario
    # (tratti di settimane fra i giorni senza lezione) sono scritti due volte,
    # qui (per il riepilogo del passo 4) e in Orari.gs: devono dare lo stesso.
    # Il banco stampa i numeri dello script: quelli di ORARI_4_calendario e
    # quelli che l'anteprima dice per ORARI_5_cambioOrario
    $nBlocchiJs = -1; $nSerieJs = -1; $nSaltateJs = -1; $nSerieCambioJs = -1; $nSaltateCambioJs = -1
    $riga = [string]($uscita | Where-Object { $_ -match '^\s*PIANO: ' } | Select-Object -First 1)
    if ($riga -match 'PIANO: (\d+) blocchi, (\d+) serie, (\d+) lezioni saltate') {
        $nBlocchiJs = [int]$Matches[1]; $nSerieJs = [int]$Matches[2]; $nSaltateJs = [int]$Matches[3]
    }
    $riga = [string]($uscita | Where-Object { $_ -match '^\s*PIANO DAL CAMBIO: ' } | Select-Object -First 1)
    if ($riga -match 'PIANO DAL CAMBIO: (\d+) serie, (\d+) lezioni saltate') {
        $nSerieCambioJs = [int]$Matches[1]; $nSaltateCambioJs = [int]$Matches[2]
    }
    $a = New-Object 'object[]' 2
    $a[0] = $o.GrigliaDocente($s.CalDocente)
    $a[1] = $o.PSObject.BaseObject
    $nCs = $tAn.GetMethod('Blocchi', $FS).Invoke($null, $a).Count
    Verifica "i blocchi del calendario sono gli stessi qui e in Orari.gs ($nCs e $nBlocchiJs)" ($nCs -eq $nBlocchiJs)
    if ($null -ne $tCal) {
        $sospCs = LeggiRighe $s.CalSospensioni $s.CalInizio
        function PianoCs($dal) {
            $b = New-Object 'object[]' 5
            $b[0] = $o.PSObject.BaseObject
            $b[1] = [string]$s.CalDocente
            $b[2] = DataIso $dal
            $b[3] = DataIso $s.CalFine
            $b[4] = $sospCs.Lista
            $tCal.GetMethod('PianoDelDocente', $FS).Invoke($null, $b)
        }
        $pCs = PianoCs $s.CalInizio
        Verifica "le serie e le lezioni saltate sono le stesse qui e in Orari.gs ($($pCs.Serie.Count) e $nSerieJs serie, $($pCs.Saltate) e $nSaltateJs saltate)" (
            $pCs.Serie.Count -eq $nSerieJs -and $pCs.Saltate -eq $nSaltateJs -and $nSaltateJs -gt 0)
        $pCambio = PianoCs $s.CalValidoDal
        Verifica "e anche dal cambio d'orario ($($pCambio.Serie.Count) e $nSerieCambioJs serie, $($pCambio.Saltate) e $nSaltateCambioJs saltate)" (
            $pCambio.Serie.Count -eq $nSerieCambioJs -and $pCambio.Saltate -eq $nSaltateCambioJs)
    }
}
finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

if ($fallimenti -eq 0) { Write-Host "`nTutte le prove superate." -ForegroundColor Green }
else { Write-Host "`nPROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
