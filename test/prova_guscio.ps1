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
        obbligatori, e il numero dei passi non e' scritto a mano.

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

Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
