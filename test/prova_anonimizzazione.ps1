<#
    prova_anonimizzazione.ps1 - verifica il client di rizzo-pii dentro
    Campanella (JSON, multipart, intestazioni, ripristino) contro il finto
    servizio di test\finto_rizzo.py. Verifica anche che:
      - un indirizzo fuori dal computer venga rifiutato subito;
      - una risposta senza il testo anonimizzato sia un errore, non un file vuoto;
      - una copia pulita non finisca mai sopra l'originale;
      - uno scarico troncato o con l'impronta sbagliata non lasci file;
      - il confronto delle versioni di "Cerca aggiornamenti" sia giusto.
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
$tmpPrima = $env:TMP
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

    # un TXT salvato in ANSI (Windows-1252), come fa il Blocco note di una
    # volta o Excel: letto come UTF-8 le lettere accentate diventavano U+FFFD
    $accentato = 'Colloquio con Anna Verdi: la citt' + [char]0xE0 + ' ' + [char]0xE8 + ' lontana, perch' + [char]0xE9 + ' no.'
    $ansi = Join-Path $temp 'nota-ansi.txt'
    [System.IO.File]::WriteAllBytes($ansi, [System.Text.Encoding]::GetEncoding(1252).GetBytes($accentato))
    $e7 = $a.Anonimizza($ansi, (Join-Path $uscita 'nota-ansi.txt'))
    $pulitoAnsi = if ($e7.Fatto) { [System.IO.File]::ReadAllText((Join-Path $uscita 'nota-ansi.txt')) } else { '' }
    Verifica 'il TXT in ANSI viene trattato'       $e7.Fatto
    Verifica 'il TXT in ANSI perde il nome'        ($e7.Fatto -and -not $pulitoAnsi.Contains('Anna Verdi'))
    Verifica 'il TXT in ANSI tiene le lettere accentate' `
        ($pulitoAnsi.Contains('citt' + [char]0xE0 + ' ' + [char]0xE8) -and $pulitoAnsi.Contains('perch' + [char]0xE9) -and
         -not $pulitoAnsi.Contains([string][char]0xFFFD))

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

    Write-Host "`n=== SCARICO DELL'INSTALLER ===" -ForegroundColor Cyan
    # Scarica scrive nella cartella temporanea di Windows: qui la faccio
    # puntare a una sottocartella della prova
    $scarichi = Join-Path $temp 'scarichi'
    New-Item -ItemType Directory -Path $scarichi | Out-Null
    $env:TMP = $scarichi
    $ag = $asm.GetType('Campanella.Aggiornamenti')
    $scarica = $ag.GetMethod('Scarica', [type[]]@([string], [string], [long], [string], [Func[int,long,long,bool]]))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $giusta = (($sha.ComputeHash((New-Object byte[] 1000000)) | ForEach-Object { $_.ToString('x2') }) -join '')
    $sbagliata = ('0' * 64)

    function Scarico($percorso, $nome, [long]$attesi, $impronta, $avanzamento) {
        $argScarico = [object[]]@("http://127.0.0.1:$Porta$percorso", $nome, $attesi, $impronta, $avanzamento)
        try { return @{ File = $scarica.Invoke($null, $argScarico); Errore = $null } }
        catch {
            $interna = $_.Exception
            while ($interna.InnerException) { $interna = $interna.InnerException }
            return @{ File = $null; Errore = $interna.Message }
        }
    }
    function Rimasti() { @(Get-ChildItem -LiteralPath $scarichi -File).Count }

    $r1 = Scarico '/scarico/intero' 'intero.exe' 1000000 $giusta $null
    Verifica 'un file intero e giusto arriva'      ($r1.Errore -eq $null -and $r1.File -and (Test-Path $r1.File))
    Verifica '... con tutti i suoi byte'           ($r1.File -and (Get-Item $r1.File).Length -eq 1000000)
    if ($r1.File) { Remove-Item $r1.File -Force }

    $r2 = Scarico '/scarico/troncato' 'troncato.exe' 1000000 $giusta $null
    Write-Host "  troncato: $($r2.Errore)"
    Verifica 'uno scarico troncato e'' un errore'  ($r2.Errore -ne $null -and $r2.File -eq $null)
    Verifica '... e non lascia file'               ((Rimasti) -eq 0)

    $r3 = Scarico '/scarico/troncato' 'troncato2.exe' 0 '' $null
    Verifica 'troncato anche senza dimensione e impronta da GitHub' ($r3.Errore -ne $null -and (Rimasti) -eq 0)

    $r4 = Scarico '/scarico/intero' 'impronta.exe' 1000000 $sbagliata $null
    Write-Host "  impronta sbagliata: $($r4.Errore)"
    Verifica "l'impronta sbagliata e' un errore"   ($r4.Errore -ne $null -and (Rimasti) -eq 0)

    $r5 = Scarico '/scarico/intero' 'dimensione.exe' 999999 '' $null
    Verifica 'la dimensione sbagliata e'' un errore' ($r5.Errore -ne $null -and (Rimasti) -eq 0)

    $ferma = [Func[int,long,long,bool]]{ param($pc, $fatti, $tot) $false }
    $r6 = Scarico '/scarico/intero' 'fermato.exe' 1000000 $giusta $ferma
    Verifica 'fermato: nessun file e nessun errore' ($r6.Errore -eq $null -and $r6.File -eq $null -and (Rimasti) -eq 0)

    # un file grande su una rete lenta: un punto percentuale ogni sei secondi e
    # mezzo. Chi lo ferma (anche la chiusura di Campanella, che aspetta al
    # massimo tre secondi) aspettava il punto dopo: adesso la domanda "vado
    # avanti?" arriva almeno ogni mezzo secondo
    $script:chiamate = 0
    $fermaAllaSeconda = [Func[int,long,long,bool]]{ param($pc, $fatti, $tot) $script:chiamate++; $script:chiamate -lt 2 }
    $cronometro = [System.Diagnostics.Stopwatch]::StartNew()
    $r7 = Scarico '/scarico/lento' 'lento.exe' 0 '' $fermaAllaSeconda
    $cronometro.Stop()
    Verifica "su una rete lenta si ferma in fretta ($($cronometro.ElapsedMilliseconds) ms)" (
        $r7.Errore -eq $null -and $r7.File -eq $null -and $cronometro.ElapsedMilliseconds -lt 3000)
    Verifica '... e non lascia file'               ((Rimasti) -eq 0)

    # una rete ferma: il server manda un pezzo e poi tace, e la lettura resta
    # bloccata. La domanda "vado avanti?" non arriva piu', e "Ferma lo
    # scarico" (o Esci nell'installer C#) aspettava i due minuti del timeout.
    # Adesso chi ferma chiude anche la connessione: lo scarico finisce subito
    # e il file a meta' se ne va
    Add-Type -TypeDefinition @'
public static class AiutoProvaScarico
{
    public static object Risultato;
    public static string Errore;

    /// <summary>Chiama azione fra ms millisecondi da un altro thread: come chi
    /// preme "Ferma lo scarico" mentre lo scarico aspetta la rete.</summary>
    public static void Fra(int ms, System.Action azione)
    {
        System.Threading.Thread t = new System.Threading.Thread(delegate()
        {
            System.Threading.Thread.Sleep(ms);
            azione();
        });
        t.IsBackground = true;
        t.Start();
    }

    /// <summary>Uno scarico su un altro thread, come quello delle Impostazioni.</summary>
    public static System.Threading.Thread InBackground(System.Reflection.MethodInfo m, object[] argomenti)
    {
        Risultato = null;
        Errore = null;
        System.Threading.Thread t = new System.Threading.Thread(delegate()
        {
            try { Risultato = m.Invoke(null, argomenti); }
            catch (System.Exception ex) { Errore = ex.GetBaseException().Message; }
        });
        t.IsBackground = true;
        t.Start();
        return t;
    }
}
'@
    $FI = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'
    $tFermo = $asm.GetType('Campanella.FermoScarico')
    $scaricaFermabile = $null
    if ($tFermo -ne $null) {
        $scaricaFermabile = $ag.GetMethod('Scarica', [type[]]@([string], [string], [long], [string],
                                                               [Func[int,long,long,bool]], $tFermo))
    }
    Verifica 'lo scarico si puo'' fermare da un altro thread' ($scaricaFermabile -ne $null)
    if ($scaricaFermabile -ne $null) {
        $fermo = [Activator]::CreateInstance($tFermo)
        [AiutoProvaScarico]::Fra(500, [Delegate]::CreateDelegate([Action], $fermo, 'Ferma'))
        $r8 = @{ File = $null; Errore = $null }
        $cronometro = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $r8.File = $scaricaFermabile.Invoke($null, [object[]]@(
                "http://127.0.0.1:$Porta/scarico/fermo", 'fermo.exe', [long]0, '', $null, $fermo))
        } catch { $r8.Errore = $_.Exception.GetBaseException().Message }
        $cronometro.Stop()
        Verifica "su una rete ferma si ferma subito ($($cronometro.ElapsedMilliseconds) ms, fermato a 500)" (
            $r8.Errore -eq $null -and $r8.File -eq $null -and $cronometro.ElapsedMilliseconds -lt 2000)
        Verifica '... e non lascia file'               ((Rimasti) -eq 0)

        # fermato prima ancora di partire: la richiesta non parte nemmeno
        $fermo = [Activator]::CreateInstance($tFermo)
        $fermo.Ferma()
        $r9 = @{ File = $null; Errore = $null }
        try {
            $r9.File = $scaricaFermabile.Invoke($null, [object[]]@(
                "http://127.0.0.1:$Porta/scarico/intero", 'prima.exe', [long]1000000, $giusta, $null, $fermo))
        } catch { $r9.Errore = $_.Exception.GetBaseException().Message }
        Verifica 'fermato prima di partire: niente file e nessun errore' (
            $r9.Errore -eq $null -and $r9.File -eq $null -and (Rimasti) -eq 0)

        # "Ferma lo scarico" e la chiusura di Campanella passano da
        # FermaScarico delle Impostazioni, che aspetta lo scarico al massimo
        # tre secondi: su una rete ferma finivano tutti, e il thread (in
        # background) moriva con il programma lasciando il file a meta'
        $tImp = $asm.GetType('Campanella.PaginaImpostazioni')
        $imp = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($tImp)
        [GC]::SuppressFinalize($imp)     # un controllo mai costruito: niente pulizia alla fine
        $fermo = [Activator]::CreateInstance($tFermo)
        $thread = [AiutoProvaScarico]::InBackground($scaricaFermabile, [object[]]@(
            "http://127.0.0.1:$Porta/scarico/fermo", 'impostazioni.exe', [long]0, '', $null, $fermo))
        $tImp.GetField('fermo', $FI).SetValue($imp, $fermo)
        $tImp.GetField('lavoro', $FI).SetValue($imp, $thread)
        $tImp.GetField('scaricando', $FI).SetValue($imp, $true)
        Start-Sleep -Milliseconds 600     # arriva il primo pezzo, poi la rete tace
        $cronometro = [System.Diagnostics.Stopwatch]::StartNew()
        [void]$tImp.GetMethod('FermaScarico').Invoke($imp, @([int]3000))
        $cronometro.Stop()
        Verifica "Impostazioni ferma lo scarico su una rete ferma ($($cronometro.ElapsedMilliseconds) ms)" (
            $cronometro.ElapsedMilliseconds -lt 2000 -and -not $thread.IsAlive)
        Verifica '... come un annullamento, non un errore' (
            [AiutoProvaScarico]::Errore -eq $null -and [AiutoProvaScarico]::Risultato -eq $null)
        Verifica '... e non lascia file'               ((Rimasti) -eq 0)
    }
    $env:TMP = $tmpPrima

    Write-Host "`n=== VERSIONI (Cerca aggiornamenti) ===" -ForegroundColor Cyan
    $piuRecente = $ag.GetMethod('PiuRecente')
    $versioni = @(
        @('1.4.7',   '1.4.6', $true),
        @('v1.4.7',  '1.4.6', $true),
        @('1.4.10',  '1.4.9', $true),
        @('1.5',     '1.4.6', $true),
        @('2.0.0',   '1.4.6', $true),
        @('1.4.6',   '1.4.6', $false),
        @('v1.4.6',  '1.4.6', $false),
        @('1.4.6.0', '1.4.6', $false),
        @('1.4.5',   '1.4.6', $false),
        @('1.4.9',   '1.4.10', $false),
        @('',        '1.4.6', $false),
        @('ultima',  '1.4.6', $false)
    )
    foreach ($v in $versioni) {
        $esito = $piuRecente.Invoke($null, [object[]]@($v[0], $v[1]))
        Verifica ("{0,-9} rispetto a {1,-7} -> {2}" -f "'$($v[0])'", $v[1], $(if ($v[2]) { 'piu'' recente' } else { 'no' })) `
            ($esito -eq $v[2])
    }

    Write-Host "`n=== PASSO 2 DELLA PRIVACY: RISPOSTE CHE ARRIVANO DOPO ===" -ForegroundColor Cyan
    # La pulizia e il controllo di rizzo-pii girano fuori dal thread della
    # finestra, e la risposta arriva dopo. Una risposta vecchia non deve
    # coprire quello che l'utente ha fatto nel frattempo: "Svuota tutto"
    # riportava in memoria il dizionario dei nomi veri, e un controllo vecchio
    # copriva quello nuovo. La pagina si costruisce senza finestra, sopra uno
    # Stato vuoto (niente Carica, niente file) e un guscio mai costruito.
    $FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
    $FI = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'
    $tStato = $asm.GetType('Campanella.Stato')
    $tStato.GetField('CartellaDiProva', $FS).SetValue($null, [string](Join-Path $temp 'stato'))
    $stato = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($tStato)
    $tStato.GetField('AnonIndirizzo').SetValue($stato, "http://127.0.0.1:$Porta")
    $tGuscio = $asm.GetType('Campanella.Guscio')
    $guscio = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($tGuscio)
    [GC]::SuppressFinalize($guscio)     # una finestra mai costruita: niente pulizia alla fine
    $tGuscio.GetField('S').SetValue($guscio, $stato)
    $tGuscio.GetField('lblStato', $FI).SetValue($guscio, (New-Object System.Windows.Forms.Label))
    $tPrivacy = $asm.GetType('Campanella.PaginaPrivacy')
    $privacy = [Activator]::CreateInstance($tPrivacy, [object[]]@($guscio))
    try {
        [void]$privacy.Handle       # le risposte arrivano con BeginInvoke: serve la maniglia, non la finestra
        function CampoP($nome) { return $tPrivacy.GetField($nome, $FI).GetValue($privacy) }
        function ChiamaP($nome) { [void]$tPrivacy.GetMethod($nome, $FI).Invoke($privacy, @()) }
        # fa arrivare le risposte finche' fatto non e' vero, o per ms millisecondi
        function Pompa([int]$ms, [scriptblock]$fatto) {
            $fine = [DateTime]::Now.AddMilliseconds($ms)
            while ([DateTime]::Now -lt $fine) {
                [System.Windows.Forms.Application]::DoEvents()
                if ($fatto -ne $null -and (& $fatto)) { return }
                Start-Sleep -Milliseconds 20
            }
        }
        $testoPrivacy = 'Colloquio con Mario Rossi, scrivere a mario.rossi@scuola.example.'

        (CampoP 'txtOriginale').Text = $testoPrivacy
        ChiamaP 'Pulisci'
        Pompa 10000 { -not (CampoP 'pulendo') }
        Verifica 'il testo viene ripulito'                ((CampoP 'txtAnonimo').Text -like '*`[FULLNAME_1`]*')
        Verifica '... e il dizionario resta in memoria'   ((CampoP 'dizionario').Count -eq 2)

        (CampoP 'txtOriginale').Text = $testoPrivacy
        ChiamaP 'Pulisci'
        ChiamaP 'Svuota'           # prima che arrivi la risposta di rizzo-pii
        Pompa 10000 { -not (CampoP 'pulendo') }
        Write-Host "  dopo Svuota: testo pulito '$((CampoP 'txtAnonimo').Text)', dizionario $((CampoP 'dizionario').Count) voci"
        Verifica 'Svuota durante la pulizia: il testo pulito non torna' ((CampoP 'txtAnonimo').Text -eq '')
        Verifica '... e nemmeno il dizionario dei nomi veri'           ((CampoP 'dizionario').Count -eq 0)
        Verifica '... ne'' il riepilogo'                              ((CampoP 'lblTrovati').Text -eq '')
        Verifica '... e si puo'' ripulire un altro testo'             ((CampoP 'btnPulisci').Enabled)

        # il primo controllo e' lento e dice "sta caricando"; il secondo, sul
        # servizio giusto, risponde subito "pronto". Vale l'ultimo chiesto
        $stato.AnonIndirizzo = "http://127.0.0.1:$Porta/lento"
        ChiamaP 'ControllaRizzo'
        $stato.AnonIndirizzo = "http://127.0.0.1:$Porta"
        ChiamaP 'ControllaRizzo'
        Pompa 3500 $null           # arrivano tutte e due: il lento dopo un secondo e mezzo
        Write-Host "  controllo: $((CampoP 'lblSalute2').Text -replace "`n", ' ')"
        Verifica 'un controllo vecchio non copre quello nuovo' ((CampoP 'lblSalute2').Text -like 'rizzo-pii pronto*')
    }
    finally {
        $privacy.Dispose()
        $tStato.GetField('CartellaDiProva', $FS).SetValue($null, '')
    }

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
    $env:TMP = $tmpPrima
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    if ($serverSenzaTesto -and -not $serverSenzaTesto.HasExited) { Stop-Process -Id $serverSenzaTesto.Id -Force }
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
