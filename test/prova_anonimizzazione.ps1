<#
    prova_anonimizzazione.ps1 - verifica il client di rizzo-pii dentro
    Campanella (JSON, multipart, intestazioni, ripristino) contro il finto
    servizio di test\finto_rizzo.py. Verifica anche che:
      - un indirizzo fuori dal computer venga rifiutato subito;
      - una risposta senza il testo anonimizzato sia un errore, non un file vuoto;
      - una copia pulita non finisca mai sopra l'originale.
    Tutto in una cartella temporanea; nessuna connessione fuori dal computer.

        .\test\prova_anonimizzazione.ps1
#>
param([int]$Porta = 5099)

$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = Join-Path $radice 'dist\Campanella.exe'
$temp = Join-Path $env:TEMP 'campanella_anon'
Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $temp | Out-Null
$PortaSenzaTesto = $Porta + 1

Write-Host "Avvio il finto rizzo-pii sulle porte $Porta e $PortaSenzaTesto..." -ForegroundColor Cyan
$server = Start-Process -FilePath 'python' `
    -ArgumentList @((Join-Path $radice 'test\finto_rizzo.py'), $Porta) `
    -PassThru -WindowStyle Hidden
# lo stesso servizio, ma con le risposte di /analyze senza "anonymized_text"
$serverSenzaTesto = Start-Process -FilePath 'python' `
    -ArgumentList @((Join-Path $radice 'test\finto_rizzo.py'), $PortaSenzaTesto, '--senza-testo') `
    -PassThru -WindowStyle Hidden

function Aspetta($porta) {
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $r = Invoke-WebRequest "http://127.0.0.1:$porta/health" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { return $true }
        } catch { Start-Sleep -Milliseconds 250 }
    }
    return $false
}

try {
    if (-not (Aspetta $Porta)) { throw "il finto servizio non e' partito" }
    if (-not (Aspetta $PortaSenzaTesto)) { throw "il finto servizio senza testo non e' partito" }

    Add-Type -AssemblyName System.Windows.Forms
    $asm = [System.Reflection.Assembly]::LoadFrom($exe)
    $t = $asm.GetType('Campanella.Anonimizzatore')
    $a = [Activator]::CreateInstance($t)
    $a.Indirizzo = "http://127.0.0.1:$Porta"
    $a.ConDizionario = $true

    $fallimenti = 0
    function Verifica($testo, $ok) {
        if ($ok) { Write-Host "  OK      $testo" }
        else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
    }

    Write-Host "`n=== SALUTE ===" -ForegroundColor Cyan
    $s = $a.Salute()
    Write-Host "  $($s.Messaggio)"
    Verifica 'vede il servizio pronto'          $s.Pronto
    Verifica 'legge il nome del modello'        ($s.Modello -like '*rizzo-pii*')
    Verifica 'legge il numero di categorie'     ($s.Categorie -eq 22)

    Write-Host "`n=== TESTO ===" -ForegroundColor Cyan
    $originale = @"
Gentile Mario Rossi,
la informiamo che la pratica di Mario Rossi (CF RSSMRA85M01H501Z) e' stata
protocollata. Per contatti: mario.rossi@scuola-esempio.edu.it oppure
347 1234567. Il rimborso andra' su IT60X0542811101000000123456.
Cordiali saluti, Anna Verdi
"@
    $entita = 0
    $dizionario = $null
    $perTipo = $null
    $argomenti = New-Object 'object[]' 4
    $argomenti[0] = $originale
    $anonimo = $t.GetMethod('TestoAnonimo', [type[]]@([string], [int].MakeByRefType(),
        [System.Collections.Generic.Dictionary[string,string]].MakeByRefType(),
        [System.Collections.Generic.Dictionary[string,int]].MakeByRefType())).Invoke($a, $argomenti)
    $entita = $argomenti[1]; $dizionario = $argomenti[2]; $perTipo = $argomenti[3]

    Write-Host "--- testo anonimizzato ---"
    Write-Host $anonimo
    Write-Host "--- dizionario ($($dizionario.Count) voci) ---"
    foreach ($k in $dizionario.Keys) { Write-Host ("   {0,-14} -> {1}" -f $k, $dizionario[$k]) }

    Verifica 'trova dei dati personali'            ($entita -ge 5)
    Verifica 'il nome sparisce'                    (-not $anonimo.Contains('Mario Rossi'))
    Verifica 'il codice fiscale sparisce'          (-not $anonimo.Contains('RSSMRA85M01H501Z'))
    Verifica "l'indirizzo email sparisce"          (-not $anonimo.Contains('@scuola-esempio.edu.it'))
    Verifica "l'IBAN sparisce"                     (-not $anonimo.Contains('IT60X0542811101000000123456'))
    Verifica 'lo stesso nome ha lo stesso segnaposto' `
        (([regex]::Matches($anonimo, '\[FULLNAME_1\]')).Count -eq 2)
    Verifica 'il testo attorno resta leggibile'    ($anonimo.Contains('e'' stata') -and $anonimo.Contains('Cordiali saluti'))
    Verifica 'il dizionario ha le voci'            ($dizionario.Count -ge 5)
    Verifica 'conta per tipo'                      ($perTipo.Count -ge 4)

    Write-Host "`n=== RIPRISTINO ===" -ForegroundColor Cyan
    $risposta = "Ho letto la pratica di [FULLNAME_1]: scrivi a [EMAIL_1] entro venerdi'."
    $rimessi = 0
    $arg2 = New-Object 'object[]' 3
    $arg2[0] = $risposta
    $arg2[1] = $dizionario
    $ripristinato = $t.GetMethod('Ripristina').Invoke($null, $arg2)
    $rimessi = $arg2[2]
    Write-Host "  $ripristinato"
    Verifica 'rimette il nome vero'                $ripristinato.Contains('Mario Rossi')
    Verifica "rimette l'indirizzo vero"            $ripristinato.Contains('mario.rossi@scuola-esempio.edu.it')
    Verifica 'non lascia segnaposto'               (-not ($ripristinato -match '\[[A-Z]+_\d+\]'))

    Write-Host "`n=== FILE ===" -ForegroundColor Cyan
    $txt = Join-Path $temp 'nota.txt'
    [System.IO.File]::WriteAllText($txt, "Colloquio con Anna Verdi, tel. 347 1234567.", (New-Object System.Text.UTF8Encoding($false)))
    $pdf = Join-Path $temp 'circolare.pdf'
    [System.IO.File]::WriteAllText($pdf, "%PDF-1.4`nCircolare per Luigi Bianchi, CF RSSMRA85M01H501Z", (New-Object System.Text.UTF8Encoding($false)))
    $docx = Join-Path $temp 'modulo.docx'
    [System.IO.File]::WriteAllText($docx, "finto docx", (New-Object System.Text.UTF8Encoding($false)))

    $uscita = Join-Path $temp 'puliti'
    $e1 = $a.Anonimizza($txt, (Join-Path $uscita 'nota.txt'))
    $e2 = $a.Anonimizza($pdf, (Join-Path $uscita 'circolare.pdf'))
    $e3 = $a.Anonimizza($docx, (Join-Path $uscita 'modulo.docx'))

    Verifica 'il TXT viene trattato'               $e1.Fatto
    Verifica 'il TXT perde il nome' `
        (-not ([System.IO.File]::ReadAllText((Join-Path $uscita 'nota.txt')).Contains('Anna Verdi')))
    Verifica 'il PDF viene trattato'               $e2.Fatto
    Verifica 'il PDF torna con le redazioni contate' ($e2.Entita -ge 2)
    Verifica 'il docx viene saltato, non rovinato' ($e3.Saltato -and -not (Test-Path (Join-Path $uscita 'modulo.docx')))
    Verifica 'il motivo del salto e'' spiegato'    ($e3.Nota -like '*docx*')
    Verifica 'il salto elenca i formati veri'      ($e3.Nota -like '*PDF, TXT, MD, CSV, HTM, HTML*')
    Verifica "l'originale non viene toccato" `
        ([System.IO.File]::ReadAllText($txt).Contains('Anna Verdi'))

    Write-Host "`n=== ORIGINALI AL SICURO ===" -ForegroundColor Cyan
    function Impronta($f) { (Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash }
    $primaTxt = Impronta $txt
    $primaPdf = Impronta $pdf
    $e4 = $a.Anonimizza($txt, $txt)
    $e5 = $a.Anonimizza($pdf, (Join-Path $temp '.\CIRCOLARE.PDF'))
    Verifica 'origine uguale a destinazione: saltato'  ($e4.Saltato -and -not $e4.Fatto)
    Verifica "l'impronta del TXT non cambia"           ((Impronta $txt) -eq $primaTxt)
    Verifica 'lo stesso file scritto in un altro modo' ($e5.Saltato -and ((Impronta $pdf) -eq $primaPdf))
    Verifica 'il motivo e'' detto'                     ($e4.Nota -like '*sopra l''originale*')

    $lista = [System.Collections.Generic.List[string]]::new()
    $lista.Add($txt); $lista.Add((Join-Path $temp 'sotto\altro.md'))
    $vietata = $t.GetMethod('CartellaDiOrigine')
    Verifica 'riconosce la cartella di un originale' `
        ($vietata.Invoke($null, [object[]]@($lista, "$temp\")) -eq $temp)
    Verifica 'e anche quella di un file in una sottocartella' `
        ($vietata.Invoke($null, [object[]]@($lista, [string](Join-Path $temp 'SOTTO'))) -ne $null)
    Verifica 'una cartella diversa va bene' `
        ($vietata.Invoke($null, [object[]]@($lista, [string]$uscita)) -eq $null)

    $omonimi = [System.Collections.Generic.List[string]]::new()
    foreach ($f in @('a\verbale.pdf', 'b\verbale.pdf', 'c\verbale (2).pdf', 'd\VERBALE.PDF', 'e\nota.txt')) {
        $omonimi.Add((Join-Path $temp $f))
    }
    $nomi = $t.GetMethod('NomiDiUscita').Invoke($null, [object[]]@(, $omonimi))
    Write-Host "  nomi delle copie: $($nomi -join ' | ')"
    $diversi = @($nomi | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
    Verifica 'omonimi di cartelle diverse: nomi tutti diversi' ($diversi.Count -eq 5)
    Verifica 'il primo tiene il suo nome'                     ($nomi[0] -eq 'verbale.pdf')
    Verifica 'un "(2)" vero non viene coperto da un doppione' ($nomi[2] -eq 'verbale (2).pdf')
    Verifica 'un nome senza doppioni resta com''e'''          ($nomi[4] -eq 'nota.txt')

    Write-Host "`n=== RISPOSTA SENZA TESTO ANONIMIZZATO ===" -ForegroundColor Cyan
    $c = [Activator]::CreateInstance($t)
    $c.Indirizzo = "http://127.0.0.1:$PortaSenzaTesto"
    $uscita2 = Join-Path $temp 'puliti2'
    $e6 = $c.Anonimizza($txt, (Join-Path $uscita2 'nota.txt'))
    Write-Host "  $($e6.Nota)"
    Verifica 'il file non risulta ripulito'        (-not $e6.Fatto -and $e6.Saltato)
    Verifica 'nessuna copia vuota scritta'         (-not (Test-Path (Join-Path $uscita2 'nota.txt')))
    $lanciata = $false
    try {
        $argTesto = New-Object 'object[]' 2
        $argTesto[0] = 'Colloquio con Anna Verdi.'
        [void]$t.GetMethod('TestoAnonimo', [type[]]@([string], [int].MakeByRefType())).Invoke($c, $argTesto)
    } catch { $lanciata = $true }
    Verifica 'il testo senza risposta e'' un errore' $lanciata

    Write-Host "`n=== SOLO SU QUESTO COMPUTER ===" -ForegroundColor Cyan
    $locale = $t.GetMethod('IndirizzoLocale')
    $casi = [ordered]@{
        'http://127.0.0.1:5005'            = $true
        'http://localhost:5005'            = $true
        'https://LOCALHOST:5005'           = $true
        'http://127.8.9.10:5005'           = $true
        'http://[::1]:5005'                = $true
        'http://192.0.2.1:5005'            = $false
        'http://localhost.example.org:5005'= $false
        'http://127.0.0.1.example.org'     = $false
        'http://127.0.0.1:5005@192.0.2.1'  = $false
        'ftp://127.0.0.1:5005'             = $false
        '127.0.0.1:5005'                   = $false
        ''                                 = $false
    }
    foreach ($k in $casi.Keys) {
        $ok = ($locale.Invoke($null, [object[]]@($k)) -eq $casi[$k])
        Verifica ("{0,-36} {1}" -f "'$k'", $(if ($casi[$k]) { 'accettato' } else { 'rifiutato' })) $ok
    }

    # un indirizzo riservato alla documentazione: nessuno risponde, e con il
    # vecchio codice la salute aspettava fino al timeout
    $d = [Activator]::CreateInstance($t)
    $d.Indirizzo = 'http://192.0.2.1:5005'
    $d.TimeoutMs = 2000        # col vecchio codice qui partiva davvero una connessione
    $cronometro = [System.Diagnostics.Stopwatch]::StartNew()
    $s3 = $d.Salute()
    $cronometro.Stop()
    Write-Host "  risposta in $($cronometro.ElapsedMilliseconds) ms: $($s3.Messaggio -replace "`n", ' ')"
    Verifica 'non e'' pronto'                        (-not $s3.Pronto)
    Verifica 'lo dice in meno di un secondo'         ($cronometro.ElapsedMilliseconds -lt 1000)
    Verifica 'spiega che deve stare sul computer'    ($s3.Messaggio -like '*questo computer*')
    $lanciata = $false
    $cronometro = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $argTesto = New-Object 'object[]' 2
        $argTesto[0] = 'Colloquio con Anna Verdi.'
        [void]$t.GetMethod('TestoAnonimo', [type[]]@([string], [int].MakeByRefType())).Invoke($d, $argTesto)
    } catch { $lanciata = $true }
    $cronometro.Stop()
    Verifica 'il testo non parte verso fuori'        ($lanciata -and $cronometro.ElapsedMilliseconds -lt 1000)
    $uscita3 = Join-Path $temp 'puliti3'
    $cronometro = [System.Diagnostics.Stopwatch]::StartNew()
    $e7 = $d.Anonimizza($pdf, (Join-Path $uscita3 'circolare.pdf'))
    $cronometro.Stop()
    Verifica 'il file non parte verso fuori' `
        ($e7.Saltato -and $cronometro.ElapsedMilliseconds -lt 1000 -and
         -not (Test-Path (Join-Path $uscita3 'circolare.pdf')))

    Write-Host "`n=== SERVIZIO SPENTO ===" -ForegroundColor Cyan
    # una porta dove non c'e' davvero nessuno: se ne cerco una fissa, basta un
    # avanzo di una prova precedente per far fallire questa senza colpa
    $spenta = 5090
    while (Get-NetTCPConnection -LocalPort $spenta -State Listen -ErrorAction SilentlyContinue) {
        $spenta++
    }
    $b = [Activator]::CreateInstance($t)
    $b.Indirizzo = "http://127.0.0.1:$spenta"
    $s2 = $b.Salute()
    Verifica 'si accorge che non risponde'         (-not $s2.Pronto)
    Verifica 'lo dice in italiano comprensibile'   ($s2.Messaggio -like '*Non trovo rizzo-pii*')

    Write-Host ""
    if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
    else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
}
finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    if ($serverSenzaTesto -and -not $serverSenzaTesto.HasExited) { Stop-Process -Id $serverSenzaTesto.Id -Force }
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
