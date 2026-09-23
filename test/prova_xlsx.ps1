<#
    prova_xlsx.ps1 - il lettore dei fogli (src\Xlsx.cs e src\Testo.cs),
    senza aprire l'interfaccia.

        .\test\prova_xlsx.ps1

    Costruisce al momento, in una cartella temporanea che alla fine viene
    tolta, dei file .xlsx con la stessa griglia di test\tabellone_esempio.csv
    (stringhe condivise, stringhe nella cella, celle senza riferimento) e
    controlla che il lettore restituisca esattamente quella griglia. Prova
    anche una tabella Docente/Giorno/Ora, un foglio con riferimenti oltre i
    limiti di Excel, uno di pochi KB con mille righe che arrivano fino
    all'ultima colonna (va rifiutato, non deve prendersi centinaia di MB) e i
    CSV salvati in ANSI, UTF-8 e UTF-16.
#>
param(
    # di partenza quello compilato da build.ps1
    [string]$Exe = ''
)

$ErrorActionPreference = 'Stop'
$qui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$radice = Split-Path -Parent $qui
$exe    = $Exe
if ($exe -eq '') { $exe = Join-Path $radice 'dist\Campanella.exe' }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression
$asm   = [System.Reflection.Assembly]::LoadFrom($exe)
$FS    = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$tXlsx = $asm.GetType('Campanella.Xlsx')
$tAn   = $asm.GetType('Campanella.AnalisiOrario')

$fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}

$tmp  = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-xlsx-' + [Guid]::NewGuid().ToString('N'))
$utf8 = New-Object System.Text.UTF8Encoding($false)

# ---------------------------------------------------------------------------
#  UN .XLSX MINIMO, COSTRUITO QUI
# ---------------------------------------------------------------------------
function NomeColonna([int]$i) {
    $s = ''
    $i++
    while ($i -gt 0) {
        $resto = ($i - 1) % 26
        $s = [string][char](65 + $resto) + $s
        $i = [math]::Floor(($i - 1) / 26)
    }
    $s
}

function Xml($v) { [System.Security.SecurityElement]::Escape([string]$v) }

$NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
$RL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

# righe: array di array di stringhe. Modo: 'condivise' (con le stringhe
# spezzate in due parti, come fa Excel con la formattazione), 'inline'
# oppure 'senzarif' (nessun attributo r: la posizione dice la colonna)
function FoglioXml($righe, $modo, $condivise) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><worksheet xmlns=`"$NS`"><sheetData>")
    for ($i = 0; $i -lt $righe.Count; $i++) {
        $riga = $righe[$i]
        if ($modo -eq 'senzarif') { [void]$sb.Append('<row>') }
        else { [void]$sb.Append("<row r=`"$($i + 1)`">") }
        for ($j = 0; $j -lt $riga.Count; $j++) {
            $v = [string]$riga[$j]
            $rif = ''
            if ($modo -ne 'senzarif') { $rif = " r=`"$(NomeColonna $j)$($i + 1)`"" }
            if ($v -eq '') {
                # senza riferimenti la cella vuota tiene il posto
                if ($modo -eq 'senzarif') { [void]$sb.Append('<c/>') }
                continue
            }
            if ($v -match '^\d+$') { [void]$sb.Append("<c$rif><v>$v</v></c>"); continue }
            if ($modo -eq 'condivise') {
                $k = $condivise.IndexOf($v)
                if ($k -lt 0) { $condivise.Add($v); $k = $condivise.Count - 1 }
                [void]$sb.Append("<c$rif t=`"s`"><v>$k</v></c>")
            }
            else {
                [void]$sb.Append("<c$rif t=`"inlineStr`"><is><t xml:space=`"preserve`">$(Xml $v)</t></is></c>")
            }
        }
        [void]$sb.Append('</row>')
    }
    [void]$sb.Append('</sheetData></worksheet>')
    $sb.ToString()
}

function ScriviZip($percorso, $voci) {
    $fs = [System.IO.File]::Create($percorso)
    try {
        $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($nome in $voci.Keys) {
                $s = $zip.CreateEntry($nome).Open()
                $b = $utf8.GetBytes($voci[$nome])
                $s.Write($b, 0, $b.Length)
                $s.Dispose()
            }
        }
        finally { $zip.Dispose() }
    }
    finally { $fs.Dispose() }
}

function ScriviXlsx($nome, $righe, $modo, $foglio) {
    $condivise = New-Object 'System.Collections.Generic.List[string]'
    if (-not $foglio) { $foglio = FoglioXml $righe $modo $condivise }
    $sst = New-Object System.Text.StringBuilder
    [void]$sst.Append("<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><sst xmlns=`"$NS`" count=`"$($condivise.Count)`" uniqueCount=`"$($condivise.Count)`">")
    foreach ($v in $condivise) {
        if ($v.Length -gt 3) {
            $meta = [int]($v.Length / 2)
            [void]$sst.Append("<si><r><t xml:space=`"preserve`">$(Xml $v.Substring(0, $meta))</t></r><r><rPr><b/></rPr><t xml:space=`"preserve`">$(Xml $v.Substring($meta))</t></r></si>")
        }
        else { [void]$sst.Append("<si><t xml:space=`"preserve`">$(Xml $v)</t></si>") }
    }
    [void]$sst.Append('</sst>')

    $voci = [ordered]@{
        '[Content_Types].xml' = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><Types xmlns=`"http://schemas.openxmlformats.org/package/2006/content-types`"><Default Extension=`"rels`" ContentType=`"application/vnd.openxmlformats-package.relationships+xml`"/><Default Extension=`"xml`" ContentType=`"application/xml`"/><Override PartName=`"/xl/workbook.xml`" ContentType=`"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml`"/><Override PartName=`"/xl/worksheets/sheet1.xml`" ContentType=`"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml`"/><Override PartName=`"/xl/sharedStrings.xml`" ContentType=`"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml`"/></Types>"
        '_rels/.rels' = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><Relationships xmlns=`"http://schemas.openxmlformats.org/package/2006/relationships`"><Relationship Id=`"rId1`" Type=`"$RL/officeDocument`" Target=`"xl/workbook.xml`"/></Relationships>"
        'xl/workbook.xml' = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><workbook xmlns=`"$NS`" xmlns:r=`"$RL`"><sheets><sheet name=`"Tabellone`" sheetId=`"1`" r:id=`"rId1`"/></sheets></workbook>"
        'xl/_rels/workbook.xml.rels' = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><Relationships xmlns=`"http://schemas.openxmlformats.org/package/2006/relationships`"><Relationship Id=`"rId1`" Type=`"$RL/worksheet`" Target=`"worksheets/sheet1.xml`"/><Relationship Id=`"rId2`" Type=`"$RL/sharedStrings`" Target=`"sharedStrings.xml`"/></Relationships>"
        'xl/worksheets/sheet1.xml' = $foglio
        'xl/sharedStrings.xml' = $sst.ToString()
    }
    $p = Join-Path $tmp $nome
    ScriviZip $p $voci
    $p
}

function Leggi($percorso) {
    # la lista dei fogli torna intera: la virgola evita che PowerShell la srotoli
    , $tXlsx.GetMethod('Leggi', $FS).Invoke($null, @([string]$percorso))
}

function Analizza($foglio) {
    $tAn.GetMethod('Analizza', $FS).Invoke($null, @($foglio))
}

# la stessa griglia? confronta ogni cella, e il numero di righe
function StessaGriglia($foglio, $righe) {
    if ($foglio.NumeroRighe -ne $righe.Count) {
        Write-Host "          righe lette $($foglio.NumeroRighe), attese $($righe.Count)" -ForegroundColor Yellow
        return $false
    }
    $larghezza = [math]::Max($foglio.Colonne, ($righe | ForEach-Object { $_.Count } | Measure-Object -Maximum).Maximum)
    for ($i = 0; $i -lt $righe.Count; $i++) {
        for ($j = 0; $j -lt $larghezza; $j++) {
            $atteso = ''
            if ($j -lt $righe[$i].Count) { $atteso = [string]$righe[$i][$j] }
            if ($foglio.Cella($i, $j) -cne $atteso) {
                Write-Host "          cella ($i,$j): letta '$($foglio.Cella($i, $j))', attesa '$atteso'" -ForegroundColor Yellow
                return $false
            }
        }
    }
    $true
}

New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    # --- la griglia del CSV d'esempio, letta qui senza il lettore da provare
    $csv = Join-Path $qui 'tabellone_esempio.csv'
    $righe = @()
    foreach ($linea in [System.IO.File]::ReadAllLines($csv)) {
        $righe += , @($linea.Split(';') | ForEach-Object { $_.Trim() })
    }
    # come fa il lettore: le celle vuote in fondo alla riga non contano
    $orarioCsv = Analizza (Leggi $csv)[0]

    Write-Host "`n.XLSX COSTRUITI DALLA GRIGLIA DEL CSV D'ESEMPIO" -ForegroundColor Cyan
    foreach ($modo in @('condivise', 'inline', 'senzarif')) {
        $fogli = Leggi (ScriviXlsx "esempio_$modo.xlsx" $righe $modo $null)
        Verifica "$modo`: un foglio, con il suo nome" (($fogli.Count -eq 1) -and ($fogli[0].Nome -eq 'Tabellone'))
        Verifica "$modo`: la griglia e' identica al CSV ($($righe.Count) righe)" (StessaGriglia $fogli[0] $righe)
        $o = Analizza $fogli[0]
        Verifica "$modo`: riconosciuto come '$($o.Formato)'" ($o.Formato -eq 'tabellone docenti')
        Verifica "$modo`: stesse lezioni del CSV ($($o.Lezioni.Count))" `
            (($o.Lezioni.Count -eq $orarioCsv.Lezioni.Count) -and
             ((@($o.Docenti()) -join ',') -eq (@($orarioCsv.Docenti()) -join ',')) -and
             ((@($o.Giorni) -join ',') -eq (@($orarioCsv.Giorni) -join ',')) -and
             ($o.Periodo -eq $orarioCsv.Periodo))
        $g1 = $o.GrigliaDocente('ROSSI'); $g2 = $orarioCsv.GrigliaDocente('ROSSI')
        $uguali = $true
        for ($h = 0; $h -lt $o.OrePerGiorno; $h++) {
            for ($d = 0; $d -lt $o.Giorni.Count; $d++) { if ($g1[$h, $d] -ne $g2[$h, $d]) { $uguali = $false } }
        }
        Verifica "$modo`: l'orario di ROSSI e' lo stesso del CSV" $uguali
    }

    # --- la tabella Docente / Giorno / Ora ----------------------------------
    Write-Host "`nTABELLA DOCENTE / GIORNO / ORA IN .XLSX" -ForegroundColor Cyan
    $tabella = @(
        @('Docente', 'Giorno', 'Ora', 'Classe'),
        @('ROSSI', 'Lunedi', '1', '1A'),
        @('ROSSI', 'Lunedi', '2', '1A'),
        @('ROSSI', 'Mercoledi', '3', '2B'),
        @('VERDI', 'Martedi', '1', '3C'),
        @('VERDI', 'Venerdi', '4', 'D')
    )
    $fogli = Leggi (ScriviXlsx 'tabella.xlsx' $tabella 'condivise' $null)
    Verifica "la griglia e' quella scritta" (StessaGriglia $fogli[0] $tabella)
    $o = Analizza $fogli[0]
    Verifica "riconosciuta come '$($o.Formato)'" ($o.Formato -eq 'tabella Docente / Giorno / Ora')
    Verifica "cinque lezioni, quattro ore, giorni $(@($o.Giorni) -join ' ')" `
        (($o.Lezioni.Count -eq 5) -and ($o.OrePerGiorno -eq 4) -and ((@($o.IndiciGiorni) -join ',') -eq '0,1,2,4'))
    $g = $o.GrigliaDocente('ROSSI')
    Verifica "ROSSI ha 2B il mercoledi' alla 3a ora" ($g[2, $o.Colonna(2)] -eq '2B')
    $g = $o.GrigliaDocente('VERDI')
    $cella = $g[3, $o.Colonna(4)]
    Verifica "VERDI e' a disposizione il venerdi' alla 4a ora" ($o.EDisposizione($cella))

    # --- riferimenti insoliti e oltre i limiti di Excel (A-65) --------------
    Write-Host "`nRIFERIMENTI INSOLITI E OLTRE I LIMITI" -ForegroundColor Cyan
    $foglio = "<?xml version=`"1.0`" encoding=`"UTF-8`"?><worksheet xmlns=`"$NS`"><sheetData>" +
        '<row r="1"><c r="A1" t="inlineStr"><is><t>uno</t></is></c>' +
        '<c r="XFE1" t="inlineStr"><is><t>oltre XFD</t></is></c>' +
        '<c r="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1" t="inlineStr"><is><t>colonna assurda</t></is></c></row>' +
        '<row r="2000000"><c r="A2000000" t="inlineStr"><is><t>troppo in basso</t></is></c></row>' +
        '<row r="2"><c t="inlineStr"><is><t>senza r</t></is></c><c/><c t="inlineStr"><is><t>terza</t></is></c></row>' +
        '<row r="3"><c r="B3"><v>7</v></c><c><v>8</v></c></row>' +
        '</sheetData></worksheet>'
    $cronometro = [System.Diagnostics.Stopwatch]::StartNew()
    $fogli = Leggi (ScriviXlsx 'limiti.xlsx' $null $null $foglio)
    $cronometro.Stop()
    $f = $fogli[0]
    Verifica "le celle oltre i limiti non contano ($($f.NumeroRighe) righe, $($f.Colonne) colonne)" `
        (($f.NumeroRighe -eq 3) -and ($f.Colonne -eq 3))
    Verifica "la cella normale c'e'" ($f.Cella(0, 0) -eq 'uno')
    Verifica "celle senza riferimento: prendono il posto dopo la precedente" `
        (($f.Cella(1, 0) -eq 'senza r') -and ($f.Cella(1, 1) -eq '') -and ($f.Cella(1, 2) -eq 'terza'))
    Verifica "dopo una cella con riferimento, quella senza e' la successiva" `
        (($f.Cella(2, 1) -eq '7') -and ($f.Cella(2, 2) -eq '8'))
    Verifica "si legge in fretta ($($cronometro.ElapsedMilliseconds) ms)" ($cronometro.ElapsedMilliseconds -lt 5000)
    Verifica "IndiceColonna('XFD1') = 16383, oltre -1" `
        (($tXlsx.GetMethod('IndiceColonna', $FS).Invoke($null, @('XFD1')) -eq 16383) -and
         ($tXlsx.GetMethod('IndiceColonna', $FS).Invoke($null, @('XFE1')) -eq -1))

    # --- tante righe con una cella in XFD: dentro i limiti, ma sparse -------
    # Ogni riga con una cella nell'ultima colonna tiene in memoria 16384
    # celle: mille righe cosi' stanno in pochi KB e chiedevano 125 MB.
    Write-Host "`nCELLE SPARSE FINO ALL'ULTIMA COLONNA" -ForegroundColor Cyan
    function FoglioSparso([int]$righe) {
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append("<?xml version=`"1.0`" encoding=`"UTF-8`"?><worksheet xmlns=`"$NS`"><sheetData>")
        for ($k = 1; $k -le $righe; $k++) { [void]$sb.Append("<row r=`"$k`"><c r=`"XFD$k`"><v>1</v></c></row>") }
        [void]$sb.Append('</sheetData></worksheet>')
        $sb.ToString()
    }
    $sparso = ScriviXlsx 'sparso.xlsx' $null $null (FoglioSparso 1000)
    $kb = [math]::Round((Get-Item -LiteralPath $sparso).Length / 1024.0, 1)
    $errore = $null
    $letti = $null
    [GC]::Collect()
    $memoriaPrima = [GC]::GetTotalMemory($true)
    $cronometro = [System.Diagnostics.Stopwatch]::StartNew()
    try { $letti = Leggi $sparso } catch { $errore = $_.Exception }
    $cronometro.Stop()
    # quello che resta in memoria con il risultato ancora in mano
    $mb = [math]::Round(([GC]::GetTotalMemory($true) - $memoriaPrima) / 1MB, 1)
    $letti = $null
    while ($errore -ne $null -and $errore.InnerException -ne $null) { $errore = $errore.InnerException }
    $messaggio = ''
    if ($errore -ne $null) { $messaggio = ($errore.Message -split "`n")[0] }
    Verifica "un file di $kb KB con 1000 righe fino a XFD viene rifiutato ($mb MB in memoria)" ($errore -ne $null)
    Verifica "con un messaggio chiaro: '$messaggio'" ($messaggio -match "troppo grande")
    Verifica "e in fretta ($($cronometro.ElapsedMilliseconds) ms)" ($cronometro.ElapsedMilliseconds -lt 5000)
    # un foglio vero ha qualche cella lontana, non migliaia di righe cosi'
    $f = (Leggi (ScriviXlsx 'sparso-poco.xlsx' $null $null (FoglioSparso 50)))[0]
    Verifica "cinquanta righe fino a XFD si leggono ancora" (
        ($f.NumeroRighe -eq 50) -and ($f.Colonne -eq 16384) -and ($f.Cella(49, 16383) -eq '1'))

    # --- CSV in ANSI, UTF-8, UTF-16 (A-60) ----------------------------------
    Write-Host "`nCSV IN ANSI, UTF-8 E UTF-16" -ForegroundColor Cyan
    $Ii = [string][char]0xCC      # I con l'accento grave
    $Oo = [string][char]0xD2      # O con l'accento grave
    $ee = [string][char]0xE8      # e con l'accento grave
    $cognome = 'NICOL' + $Oo + ' ROSSI'
    $linee = @(
        'Orario dal 14 settembre 2026;;;;;;;;;;',
        (';LUNED' + $Ii + ';;MARTED' + $Ii + ';;MERCOLED' + $Ii + ';;GIOVED' + $Ii + ';;VENERD' + $Ii + ';'),
        ';1;2;1;2;1;2;1;2;1;2',
        ($cognome + ';1A;;2B;;;;;;;'),
        ('VERDI;;1A;;;;;3C;;;')
    )
    $testo = ($linee -join "`r`n") + "`r`n"
    $codifiche = [ordered]@{
        'ANSI (Windows-1252)' = [System.Text.Encoding]::GetEncoding(1252).GetBytes($testo)
        'UTF-8 senza BOM'     = $utf8.GetBytes($testo)
        'UTF-8 con BOM'       = (New-Object System.Text.UTF8Encoding($true)).GetPreamble() + $utf8.GetBytes($testo)
        'UTF-16 con BOM'      = [System.Text.Encoding]::Unicode.GetPreamble() + [System.Text.Encoding]::Unicode.GetBytes($testo)
    }
    $k = 0
    foreach ($nome in $codifiche.Keys) {
        $k++
        $p = Join-Path $tmp "codifica$k.csv"
        [System.IO.File]::WriteAllBytes($p, [byte[]]$codifiche[$nome])
        $f = (Leggi $p)[0]
        Verifica "$nome`: il cognome accentato resta intatto" ($f.Cella(3, 0) -ceq $cognome)
        Verifica "$nome`: il giorno accentato resta intatto" ($f.Cella(1, 1) -ceq ('LUNED' + $Ii))
        $o = Analizza $f
        Verifica "$nome`: tabellone riconosciuto, cinque giorni" (($o.Formato -eq 'tabellone docenti') -and ($o.Giorni.Count -eq 5))
        Verifica "$nome`: il docente c'e' con il suo nome" (@($o.Docenti()) -ccontains $cognome)
    }
    # "Apri un file..." della finestra che incolla l'elenco del personale:
    # lo stesso CSV in ANSI leggeva i cognomi accentati come U+FFFD
    $tIncolla = $asm.GetType('Campanella.FormIncolla')
    $mCaricaFile = $tIncolla.GetMethod('CaricaFile')
    Verifica "la finestra dell'elenco sa leggere un file" ($mCaricaFile -ne $null)
    if ($mCaricaFile -ne $null) {
        $ansi = Join-Path $tmp 'elenco-ansi.csv'
        [System.IO.File]::WriteAllBytes($ansi, [byte[]]$codifiche['ANSI (Windows-1252)'])
        $incolla = [Activator]::CreateInstance($tIncolla, @([string]''))
        try {
            $mCaricaFile.Invoke($incolla, @([string]$ansi)) | Out-Null
            Verifica "la finestra dell'elenco legge il CSV in ANSI senza rovinare i cognomi" (
                $incolla.Testo.Contains($cognome) -and -not $incolla.Testo.Contains([string][char]0xFFFD))
        } finally { $incolla.Dispose() }
    }

    $tTesto = $asm.GetType('Campanella.Testo')
    $dec = $tTesto.GetMethod('Decodifica', $FS)
    Verifica "un UTF-8 valido non viene preso per ANSI" `
        ($dec.Invoke($null, @(, [byte[]]$utf8.GetBytes('perch' + $ee))) -ceq ('perch' + $ee))
    Verifica "un file vuoto da' un testo vuoto" ($dec.Invoke($null, @(, [byte[]]@())) -eq '')
}
finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

if ($fallimenti -eq 0) { Write-Host "`nTutte le prove superate." -ForegroundColor Green }
else { Write-Host "`nPROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
