<#
    prova_guscio.ps1 - le parti della finestra principale che si provano
    senza aprire finestre

        .\test\prova_guscio.ps1

    Carica Campanella.exe per riflessione, come prova_personale.ps1:

      - il messaggio di un errore imprevisto: breve, in italiano, senza la
        traccia dello stack che mostrerebbe .NET;
      - il codice CMP1 che lo script della Posta stampa: un codice incollato
        male non fa cadere il programma, e senza gruppo per le etichette non
        basta a dire "Gia' fatto" (conta anche le etichette dell'utente);
      - le spunte dell'installazione guidata: servono tutti i passi
        obbligatori, e il numero dei passi non e' scritto a mano;
      - chiudere Campanella senza aprire Orari, Cartelle o Privacy non
        cancella l'orario, le classi, il modulo o le regole lette: la
        finestra si costruisce senza mostrarla e salva in una cartella
        temporanea.

    Uno Stato si crea senza costruttore, oppure con Carica dopo aver messo
    Stato.CartellaDiProva su una cartella temporanea: cosi' non guarda il
    Drive vero e non tocca le impostazioni vere.
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

# ---------------------------------------------------------------------------
Intestazione "IL CODICE DI STATO DELLA POSTA (CMP1)"
$tSP = $asm.GetType('Campanella.StatoPosta')
$tStato = $asm.GetType('Campanella.Stato')
$mLeggi = $tSP.GetMethod('LeggiCodice', $FS)
$mVerifica = $tSP.GetMethod('Verifica', $FS)
function Campo($o, $nome) { return $o.GetType().GetField($nome, $FI).GetValue($o) }
function Leggi($codice, $prefisso) {
    try { return $mLeggi.Invoke($null, @($codice, $prefisso)) }
    catch { Write-Host "    eccezione: $($_.Exception.GetBaseException().Message)"; return 'eccezione' }
}

$r = Leggi 'CMP1-20260910-9-1-2431' 'Scuola'
Verifica "con il gruppo: il codice conferma il riordino" (
    $r -ne $null -and $r -ne 'eccezione' -and (Campo $r 'Fatto') -and -not (Campo $r 'Incerto') -and
    (Campo $r 'Etichette') -eq 9 -and (Campo $r 'Conversazioni') -eq 2431 -and (Campo $r 'Automazione'))
$r = Leggi 'CMP1-20260910-9-1-2431' ''
Verifica "senza gruppo: riconosciuto, ma non basta a dire fatto" (
    $r -ne $null -and $r -ne 'eccezione' -and -not (Campo $r 'Fatto') -and (Campo $r 'Incerto'))
$r = Leggi '  cmp1-20260910-9-1-2431  ' 'Scuola'
Verifica "minuscole e spazi attorno vanno bene" ($r -ne $null -and $r -ne 'eccezione' -and (Campo $r 'Fatto'))
$r = Leggi 'CMP1-20260910-0-0-0' 'Scuola'
Verifica "zero etichette: riconosciuto, non fatto" ($r -ne $null -and $r -ne 'eccezione' -and -not (Campo $r 'Fatto'))
$r = Leggi 'CMP2-20270115-9-1-2431-X7' 'Scuola'
Verifica "una versione nuova con un campo in piu' si legge" (
    $r -ne $null -and $r -ne 'eccezione' -and (Campo $r 'Versione') -eq 2 -and (Campo $r 'Fatto'))

$arabo = [string][char]0x0669          # la cifra 9 araba: \d la prendeva, int.Parse no
$largo = [string][char]0xFF19          # la cifra 9 a tutta larghezza
foreach ($caso in @(
        @('un numero troppo lungo',      'CMP1-20260910-99999999999-1-5'),
        @('una cifra non ASCII',         ('CMP1-20260910-' + $arabo + '-1-5')),
        @('una cifra a tutta larghezza', ('CMP1-20260910-9-1-' + $largo)),
        @('una data impossibile',        'CMP1-20261399-9-1-5'),
        @('una versione zero',           'CMP0-20260910-9-1-5'),
        @('due righe',                   "CMP1-20260910-9-1-5`nCMP1-20260910-9-1-5"),
        @('un testo qualsiasi',          'non so'),
        @('niente',                      ''))) {
    $r = Leggi $caso[1] 'Scuola'
    Verifica "$($caso[0]): 'non riconosciuto', senza eccezione" ($r -eq $null)
}
$r = Leggi $null 'Scuola'
Verifica "null: 'non riconosciuto'" ($r -eq $null)

# ---------------------------------------------------------------------------
Intestazione "LE SPUNTE DELL'INSTALLAZIONE GUIDATA"
# Uno Stato senza costruttore: niente Drive vero, solo i campi che servono
$tRegola = $asm.GetType('Campanella.Regola')
function NuovoStato($spunte, $codice, $prefisso) {
    $s = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($tStato)
    $cartella = Join-Path ([System.IO.Path]::GetTempPath()) 'campanella-guscio-nessuna'
    $tStato.GetField('Drive', $FI).SetValue($s, $cartella)
    $tStato.GetField('CartellaDati', $FI).SetValue($s, $cartella)
    $tStato.GetField('DatiNelDrive', $FI).SetValue($s, $false)
    $lista = New-Object 'System.Collections.Generic.List[bool]'
    foreach ($b in $spunte) { $lista.Add([bool]$b) }
    $tStato.GetField('SpunteInstallazione', $FI).SetValue($s, $lista)
    $tStato.GetField('Regole', $FI).SetValue($s,
        [Activator]::CreateInstance([System.Collections.Generic.List`1].MakeGenericType($tRegola)))
    $tStato.GetField('CodiceStatoPosta', $FI).SetValue($s, [string]$codice)
    $tStato.GetField('Prefisso', $FI).SetValue($s, [string]$prefisso)
    return $s
}
function StatoDi($s) { return $mVerifica.Invoke($null, @($s)) }

$sette = @(1, 1, 1, 1, 1, 1, 1, 0)
$r = StatoDi (NuovoStato $sette '' '')
Verifica "i sette passi obbligatori: fatto" ((Campo $r 'Fatto') -and (Campo $r 'Dettaglio') -match '7 passi su 8')
$r = StatoDi (NuovoStato @(1, 1, 0, 1, 1, 1, 1, 1) '' '')
Verifica "sette spunte ma il passo 3 manca: non fatto" (-not (Campo $r 'Fatto'))
Verifica "e dice quale manca" ((Campo $r 'Dettaglio') -match 'manca il passo 3')
$r = StatoDi (NuovoStato @(1, 1, 1, 1, 1, 1, 1, 1, 0) '' '')
Verifica "il numero dei passi viene dalle spunte salvate (9), non e' copiato a mano" (
    (Campo $r 'Fatto') -and (Campo $r 'Dettaglio') -match 'su 9')
$r = StatoDi (NuovoStato @() '' '')
Verifica "nessuna spunta: da fare" (-not (Campo $r 'Fatto') -and (Campo $r 'Dettaglio') -match 'Non risulta')
$r = StatoDi (NuovoStato @(1, 0, 0, 0, 0, 0, 0, 0) '' '')
Verifica "una spunta sola: 'passo' al singolare" ((Campo $r 'Dettaglio') -match 'spuntato 1 passo su 8')

Intestazione "IL CODICE E LE SPUNTE INSIEME"
$r = StatoDi (NuovoStato @() 'CMP1-20260910-14-0-230' '')
Verifica "senza gruppo il codice da solo non dice 'Gia' fatto'" (-not (Campo $r 'Fatto'))
$r = StatoDi (NuovoStato $sette 'CMP1-20260910-14-0-230' '')
Verifica "senza gruppo contano le spunte" ((Campo $r 'Fatto') -and (Campo $r 'Come') -match 'spunte')
$r = StatoDi (NuovoStato @() 'CMP1-20260910-14-0-230' ' Scuola/ ')
Verifica "con il gruppo il codice basta" ((Campo $r 'Fatto') -and (Campo $r 'Come') -match 'codice')
$r = StatoDi (NuovoStato @() 'CMP1-20260910-99999999999-1-5' 'Scuola')
Verifica "un codice salvato male non fa cadere la pagina iniziale" ($r -ne $null -and -not (Campo $r 'Fatto'))

# ---------------------------------------------------------------------------
Intestazione "CHIUDERE SENZA APRIRE LE PAGINE NON CANCELLA NIENTE"
# Alla chiusura il guscio chiede a ogni pagina di rimettere nello Stato quello
# che ha nei controlli. Orari, Cartelle e Privacy si riempiono dallo Stato solo
# quando si aprono: chiudendo Campanella senza esserci passati si salvavano i
# loro controlli vuoti, cioe' un orario vuoto, le classi e il modulo cancellati,
# le regole della privacy "non lette". La finestra si costruisce ma non si
# mostra, e campanella.json sta in una cartella temporanea (Stato.CartellaDiProva):
# niente Drive vero, niente impostazioni vere.
$tGuscio = $asm.GetType('Campanella.Guscio')
$tConsenso = $asm.GetType('Campanella.Consenso')
$cartellaSalva = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-prova-guscio-salva-' + (Get-Random))
New-Item -ItemType Directory -Force $cartellaSalva | Out-Null
$campoProva = $tStato.GetField('CartellaDiProva', $FS)
$campoProva.SetValue($null, $cartellaSalva)
$driveFinto = Join-Path $cartellaSalva 'Drive finto che non esiste'
$jsonSalva = Join-Path $cartellaSalva 'campanella.json'

function ScriviPartenza {
    $d = @{
        formato = 1; temaScuro = $true
        consensoVersione = [int]$tConsenso.GetField('Versione', $FS).GetValue($null)
        consensoData = '2026-09-01'
        datiNelDrive = $false
        drive = $driveFinto; anno = '2030/2031'
        classi = "1A`n2B"; cartelleExtra = 'Progetti, PCTO'
        moduloPercorso = (Join-Path $driveFinto 'MODELLI\Modulo di prova.gform')
        moduloCartella = 'CLASSI'; moduloFoglio = 'Risposte di prova'
        moduloChiusura = '30/06'; moduloChiudi = $false; moduloSvuota = $true; moduloDrive = $false
        fileOrari = (Join-Path $cartellaSalva 'tabellone di prova.xlsx')
        oggettoOrari = 'Orario di prova'; notaOrari = 'nota di prova'; inviaOrariClassi = $true
        privacyLetta = $true; anonReversibileTesto = $false
        anonDestinazione = (Join-Path $cartellaSalva 'anonimizzati')
        prefisso = 'Scuola'; dominio = 'scuola.example'
        calDocente = 'ROSSI MARIO'; calNome = 'Orario di prova'
        personale = @(@{ nome = 'ROSSI MARIO'; ruolo = 'Docente'; email = 'mario.rossi@scuola.example'; incluso = $true; verificato = $false })
        lezioni = @(@{ d = 'ROSSI MARIO'; g = 0; o = 1; c = '1A' }, @{ d = 'ROSSI MARIO'; g = 1; o = 2; c = '2B' },
                    @{ d = 'VERDI ANNA'; g = 2; o = 3; c = '2B' })
        orariGiorni = @(0, 1, 2); orariOre = 6; orariPeriodo = 'dal 15 settembre'
    }
    [System.IO.File]::WriteAllText($jsonSalva, ($d | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
}

$mCarica = $tStato.GetMethod('Carica', $FS)
function Rileggi { return $mCarica.Invoke($null, @()) }
function ControllaRimasto($s, $come) {
    Verifica "$come : l'orario c'e' ancora (3 ore)" ((Campo $s 'Lezioni').Count -eq 3)
    Verifica "$come : le colonne dell'orario ci sono ancora" ((Campo $s 'GiorniOrari').Count -eq 3)
    Verifica "$come : il file dell'orario e' ricordato" ((Campo $s 'FileOrari') -like '*tabellone di prova.xlsx')
    Verifica "$come : l'oggetto delle email degli orari c'e' ancora" ((Campo $s 'OggettoOrari') -eq 'Orario di prova')
    Verifica "$come : il Drive scelto c'e' ancora" ((Campo $s 'Drive') -eq $driveFinto)
    Verifica "$come : l'anno scelto c'e' ancora" ((Campo $s 'Anno') -eq '2030/2031')
    Verifica "$come : le classi ci sono ancora" ((Campo $s 'Classi') -eq "1A`n2B")
    Verifica "$come : le cartelle in piu' ci sono ancora" ((Campo $s 'CartelleExtra') -eq 'Progetti, PCTO')
    Verifica "$come : il modulo scelto c'e' ancora" ((Campo $s 'ModuloPercorso') -like '*Modulo di prova.gform')
    Verifica "$come : il foglio del modulo c'e' ancora" ((Campo $s 'ModuloFoglio') -eq 'Risposte di prova')
    Verifica "$come : le scelte del modulo ci sono ancora" (
        (Campo $s 'ModuloChiusura') -eq '30/06' -and -not (Campo $s 'ModuloChiudi') -and
        (Campo $s 'ModuloSvuota') -and -not (Campo $s 'ModuloDrive'))
    Verifica "$come : le regole della privacy restano lette" ((Campo $s 'PrivacyLetta') -eq $true)
    Verifica "$come : la scelta sul dizionario resta com'era" ((Campo $s 'AnonReversibileTesto') -eq $false)
    Verifica "$come : l'elenco del personale c'e' ancora" ((Campo $s 'Personale').Count -eq 1)
    Verifica "$come : il calendario e' ancora di ROSSI MARIO" ((Campo $s 'CalDocente') -eq 'ROSSI MARIO')
}

$tDriveTrovato = $asm.GetType('Campanella.DriveTrovato')
function NuovoGuscio($s) {
    $g = [Activator]::CreateInstance($tGuscio, @($s.PSObject.BaseObject))
    # Cartelle confronta il Drive con quelli del computer: le do un elenco
    # finto, cosi' non guarda i Drive veri
    foreach ($p in $tGuscio.GetField('pagine', $FI).GetValue($g)) {
        if ($p.GetType().Name -ne 'PaginaCartelle') { continue }
        $lista = [Activator]::CreateInstance([System.Collections.Generic.List`1].MakeGenericType($tDriveTrovato))
        $d = [Activator]::CreateInstance($tDriveTrovato)
        $tDriveTrovato.GetField('Percorso').SetValue($d, [string]$driveFinto)
        $lista.Add($d)
        $p.GetType().GetField('drivi', $FI).SetValue($p, $lista)
    }
    return $g
}
function SalvaTutto($g) { $tGuscio.GetMethod('SalvaTutto').Invoke($g, @()) | Out-Null }

try {
    # 1. aperta e chiusa subito: si vede solo la pagina iniziale
    ScriviPartenza
    $s = Rileggi
    Verifica "i dati di partenza si leggono" ((Campo $s 'Lezioni').Count -eq 3 -and (Campo $s 'Classi') -eq "1A`n2B")
    $g = NuovoGuscio $s
    SalvaTutto $g
    $g.Dispose()
    ControllaRimasto (Rileggi) 'chiusa senza aprire niente'

    # 2. tutte le pagine aperte una volta, senza toccare niente
    ScriviPartenza
    $g = NuovoGuscio (Rileggi)
    $pagine = $tGuscio.GetField('pagine', $FI).GetValue($g)
    $mVaiA = $tGuscio.GetMethod('VaiA')
    for ($i = 0; $i -lt $pagine.Count; $i++) { $mVaiA.Invoke($g, @([int]$i, [int]0)) | Out-Null }
    $mVaiA.Invoke($g, @([int]0, [int]0)) | Out-Null
    SalvaTutto $g
    $g.Dispose()
    ControllaRimasto (Rileggi) 'dopo aver aperto ogni pagina'

    # 3. in Orari un foglio non riconosciuto (orario vuoto): quello di prima resta
    ScriviPartenza
    $g = NuovoGuscio (Rileggi)
    $pagine = $tGuscio.GetField('pagine', $FI).GetValue($g)
    $orari = $null
    for ($i = 0; $i -lt $pagine.Count; $i++) { if ($pagine[$i].GetType().Name -eq 'PaginaOrari') { $orari = $i } }
    $mVaiA.Invoke($g, @([int]$orari, [int]0)) | Out-Null
    $tRisultato = $asm.GetType('Campanella.RisultatoOrario')
    $pagine[$orari].GetType().GetField('orario', $FI).SetValue($pagine[$orari], [Activator]::CreateInstance($tRisultato))
    $mVaiA.Invoke($g, @([int]0, [int]0)) | Out-Null
    SalvaTutto $g
    $g.Dispose()
    Verifica "un foglio non riconosciuto non cancella l'orario salvato" ((Campo (Rileggi) 'Lezioni').Count -eq 3)
}
catch {
    Verifica "la finestra si costruisce e salva senza errori ($($_.Exception.GetBaseException().Message))" $false
}
finally {
    $campoProva.SetValue($null, '')
    Remove-Item -Recurse -Force -LiteralPath $cartellaSalva -ErrorAction SilentlyContinue
}

Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
