<#
    prova_posta.ps1 - lo strumento Posta, dalla parte di Campanella

        .\test\prova_posta.ps1

    Carica dist\Campanella.exe come assembly e chiama il generatore vero
    (GeneratorePosta, in src\GeneratorePosta.cs) con uno Stato inventato:
    scrive Configurazione.gs in una cartella temporanea e ci fa girare il
    banco test\mock_apps_script.js, che usa lo script vero della posta. Cosi'
    una chiave rinominata da una parte sola si vede subito. Controlla anche
    che la configurazione generata sia quella d'esempio che il banco usa da
    solo, e che nomi strani non possano uscire da stringhe e commenti;
    l'impronta della configurazione e le regole che si doppiano con le
    sottoetichette dei ruoli, e che l'anteprima dello script veda le stesse;
    i colori delle etichette (la tavolozza di Gmail, i colori di partenza,
    le sfumature dei ruoli) e che arrivino giusti nella configurazione.

    Nessun dato vero: lo Stato non passa dal costruttore (che cercherebbe il
    Drive del PC), Drive e cartella dei dati sono una cartella temporanea, e
    persone e indirizzi sono inventati.
#>
$ErrorActionPreference = 'Stop'
$qui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$radice = Split-Path -Parent $qui
$exe    = Join-Path $radice 'dist\Campanella.exe'
if (-not (Test-Path $exe)) { throw "Manca $exe`: compila prima con .\build.ps1" }
# un exe piu' vecchio dei sorgenti proverebbe il codice di prima
foreach ($f in @('src\GeneratorePosta.cs', 'src\PaginaPosta.cs', 'src\Dialoghi.cs', 'src\Guscio.cs',
                 'src\risorse\Organizzazione_Gmail.gs', 'src\risorse\estensione_personale\manifest.json')) {
    if ((Get-Item (Join-Path $radice $f)).LastWriteTimeUtc -gt (Get-Item $exe).LastWriteTimeUtc) {
        throw "$f e' piu' recente di dist\Campanella.exe: ricompila con .\build.ps1"
    }
}
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$FS  = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$FI  = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'
$tStato    = $asm.GetType('Campanella.Stato')
$tPersona  = $asm.GetType('Campanella.Persona')
$tGen      = $asm.GetType('Campanella.GeneratorePosta')

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
function Scrivi($percorso, $testo) {
    [System.IO.File]::WriteAllText($percorso, $testo, (New-Object System.Text.UTF8Encoding($false)))
}

$temporanea = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-posta-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporanea | Out-Null

# ---------------------------------------------------------------------------
#  LO STATO INVENTATO
#  GetUninitializedObject salta il costruttore: "new Stato()" cerca il Drive
#  vero del PC. Qui ogni campo che il generatore legge si imposta a mano.
# ---------------------------------------------------------------------------
function Imposta($s, $campo, $valore) { $tStato.GetField($campo, $FI).SetValue($s, $valore) }
# la virgola impedisce a PowerShell di srotolare le liste (una vuota diventerebbe $null)
function Leggi($s, $campo) { return ,($tStato.GetField($campo, $FI).GetValue($s)) }
$tListaPersone = [type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tPersona)

function NuovoStato {
    $s = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($tStato)
    Imposta $s 'Drive' $temporanea
    Imposta $s 'CartellaDati' $temporanea
    Imposta $s 'DatiNelDrive' $false
    Imposta $s 'Dominio' 'scuola-esempio.edu.it'
    Imposta $s 'Prefisso' 'Scuola'
    Imposta $s 'EtichettaPerRuolo' $true
    Imposta $s 'Dirigenza' 'preside@scuola-esempio.edu.it'
    Imposta $s 'Segreteria' 'segreteria@scuola-esempio.edu.it'
    Imposta $s 'Registro' '@spaggiari.eu'
    $tStato.GetField('Personale', $FI).SetValue($s, [Activator]::CreateInstance($tListaPersone))
    $tStato.GetField('Regole', $FI).SetValue($s, $tStato.GetMethod('RegoleDiDefault', $FS).Invoke($null, @()))
    Imposta $s 'Prova' $true
    Imposta $s 'Report' $true
    Imposta $s 'EscludiInviata' $true
    Imposta $s 'Periodo' ([int]0)
    Imposta $s 'Ore' ([int]1)
    return $s
}
function AggiungiPersona($s, $nome, $ruolo, $mail, [bool]$incluso) {
    $p = [Activator]::CreateInstance($tPersona)
    $tPersona.GetField('Nome', $FI).SetValue($p, $nome)
    $tPersona.GetField('Ruolo', $FI).SetValue($p, $ruolo)
    $tPersona.GetField('Email', $FI).SetValue($p, $mail)
    $tPersona.GetField('Incluso', $FI).SetValue($p, $incluso)
    (Leggi $s 'Personale').Add($p)
}
function Genera($s, [bool]$prova) {
    $m = $tGen.GetMethod('Configurazione', $FS)
    return $m.Invoke($null, @($s, $prova, [datetime]'2026-09-23T10:00:00'))
}

# lettore della configurazione generata, fuori da qualunque servizio Google
$leggiJs = Join-Path $temporanea 'leggi_configurazione.js'
Scrivi $leggiJs @'
const vm = require('vm'), fs = require('fs');
const contesto = {};
vm.runInNewContext(fs.readFileSync(process.argv[2], 'utf8'), contesto);
const globali = Object.keys(contesto).filter(k => k !== 'CONFIG');
process.stdout.write(JSON.stringify({ CONFIG: contesto.CONFIG, altri: globali }));
'@
# confronto fra due configurazioni: tutto tranne le note e l'impronta (che
# nell'esempio e' inventata), a chiavi ordinate
$confrontaJs = Join-Path $temporanea 'confronta.js'
Scrivi $confrontaJs @'
const vm = require('vm'), fs = require('fs');
function carica(f) { const c = {}; vm.runInNewContext(fs.readFileSync(f, 'utf8'), c); return c.CONFIG; }
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => k !== 'nota' && k !== 'impronta').sort()
      .map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
const a = canonico(carica(process.argv[2])), b = canonico(carica(process.argv[3]));
process.stdout.write(a === b ? 'uguali' : 'diversi\n' + a + '\n' + b);
'@
# PASSO_1_anteprima del motore vero su una configurazione, con una casella
# finta e vuota: basta a leggere impronta e doppioni, che vengono da CONFIG
$anteprimaJs = Join-Path $temporanea 'anteprima.js'
Scrivi $anteprimaJs @'
const vm = require('vm'), fs = require('fs');
const contesto = vm.createContext({
  GmailApp: { search: () => [], getUserLabelByName: () => null },
  PropertiesService: { getUserProperties: () => ({ getProperty: () => null }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'docente@scuola.example' }) },
  Logger: { log: () => {} }
});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), contesto, { filename: 'Configurazione.gs' });
vm.runInContext(fs.readFileSync(process.argv[3], 'utf8'), contesto, { filename: 'Organizzazione_Gmail.gs' });
process.stdout.write(contesto.PASSO_1_anteprima());
'@
$motore = Join-Path $radice 'src\risorse\Organizzazione_Gmail.gs'
function LeggiConfigurazione($file) { return ((& node $leggiJs $file) | ConvertFrom-Json) }

try {
    # -----------------------------------------------------------------------
    Intestazione 'LA CONFIGURAZIONE GENERATA, NEL BANCO DELLO SCRIPT VERO'
    $s = NuovoStato
    AggiungiPersona $s 'ROSSI MARIO' 'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO' 'mario.rossi@scuola-esempio.edu.it' $true
    AggiungiPersona $s 'DE LUCA ANNA' 'ASSISTENTE AMMINISTRATIVO' 'anna.deluca@scuola-esempio.edu.it' $true
    AggiungiPersona $s 'ALUNNO ESCLUSO' 'Studente' 'studente.escluso@scuola-esempio.edu.it' $false
    $testo = Genera $s $true
    $file = Join-Path $temporanea 'Configurazione.gs'
    Scrivi $file $testo

    Verifica "l'intestazione dice la versione di Campanella" ($testo -match 'dall''applicazione Campanella \d+\.\d+\.\d+\.')
    Verifica "chi non ha la spunta non c'e'" (-not $testo.Contains('studente.escluso@'))
    $letta = LeggiConfigurazione $file
    Verifica "si carica e definisce solo CONFIG" ($null -ne $letta.CONFIG -and $letta.altri.Count -eq 0)
    Verifica "parte in modalita' prova" ($letta.CONFIG.provaSenzaModifiche -eq $true)

    $esito = (& node $confrontaJs $file (Join-Path $qui 'Configurazione_esempio.gs')) -join "`n"
    Verifica "e' la stessa configurazione d'esempio su cui gira il banco" ($esito -eq 'uguali')
    if ($esito -ne 'uguali') { Write-Host $esito }

    $banco = & node (Join-Path $qui 'mock_apps_script.js') $file 2>&1
    $esitoBanco = $LASTEXITCODE
    if ($esitoBanco -ne 0) { $banco | Out-Host }
    Verifica "il banco dello script vero passa con la configurazione generata ($(@($banco -match '^\s+OK ').Count) controlli)" ($esitoBanco -eq 0)

    # -----------------------------------------------------------------------
    Intestazione 'LE OPZIONI ARRIVANO NELLE CHIAVI GIUSTE'
    Imposta $s 'Periodo' ([int]2)
    Imposta $s 'Ore' ([int]3)
    Imposta $s 'Report' $false
    Imposta $s 'EscludiInviata' $false
    $file2 = Join-Path $temporanea 'Configurazione_vera.gs'
    Scrivi $file2 (Genera $s $false)
    $c = (LeggiConfigurazione $file2).CONFIG
    Verifica "senza prova: provaSenzaModifiche false" ($c.provaSenzaModifiche -eq $false)
    Verifica "ultimi 24 mesi" ($c.soloUltimiMesi -eq 24)
    Verifica "ogni 3 ore" ($c.ogniQuanteOre -eq 3)
    Verifica "niente riepilogo, e anche la posta inviata" ($c.inviaReport -eq $false -and $c.escludiPostaInviata -eq $false)
    Verifica "i gruppi per ruolo" ($c.gruppi.Docenti[0] -eq 'mario.rossi@scuola-esempio.edu.it' -and
                                   $c.gruppi.Amministrativi[0] -eq 'anna.deluca@scuola-esempio.edu.it')
    Verifica "0 = tutta la posta"   ((& { Imposta $s 'Periodo' ([int]0); ((Genera $s $true) -match 'soloUltimiMesi:\s+0,') }))

    # -----------------------------------------------------------------------
    Intestazione 'SENZA ELENCO DEL PERSONALE'
    $vuoto = NuovoStato
    $file3 = Join-Path $temporanea 'Configurazione_vuota.gs'
    Scrivi $file3 (Genera $vuoto $true)
    $c = (LeggiConfigurazione $file3).CONFIG
    $colleghi = @($c.regole | Where-Object { $_.etichetta -eq 'Colleghi' })[0]
    Verifica "personale vuoto" ($c.personale.Count -eq 0)
    Verifica "e la regola Colleghi spenta, non su tutta la casella" ($colleghi.attiva -eq $false)
    Verifica "niente sottoetichette dei ruoli" (@($c.regole | Where-Object { $_.etichetta -like 'Colleghi/*' }).Count -eq 0)

    # -----------------------------------------------------------------------
    Intestazione 'L''IMPRONTA DELLA CONFIGURAZIONE'
    # PASSO_1_anteprima la stampa e il passo 5 mostra quella di adesso: una
    # configurazione incollata prima di spegnere una regola si riconosce
    $mImpronta = $tGen.GetMethod('Impronta', $FS)
    Verifica "il generatore calcola l'impronta" ($null -ne $mImpronta)
    if ($null -ne $mImpronta) {
        function Impronta($stato) { return [string]$mImpronta.Invoke($null, @($stato)) }
        $imp = Impronta $s
        Verifica "otto cifre esadecimali ($imp)" ($imp -cmatch '^[0-9A-F]{8}$')
        $riga = 'impronta: "' + $imp + '",'
        Verifica "la configurazione la scrive, con e senza modalita' prova" (
            (Genera $s $true).Contains($riga) -and (Genera $s $false).Contains($riga))
        $altroGiorno = $tGen.GetMethod('Configurazione', $FS).Invoke($null, @($s, $true, [datetime]'2027-01-15T08:30:00'))
        Verifica "la data non conta" ($altroGiorno.Contains($riga))
        Verifica "e l'esempio del banco ha la stessa riga, con un'impronta inventata" (
            (Get-Content -Raw (Join-Path $qui 'Configurazione_esempio.gs')) -match '(?m)^  impronta: "[0-9A-F]{8}",')
        $regoleS = Leggi $s 'Regole'
        $regoleS[2].Attiva = $false
        $spenta = Impronta $s
        Verifica "una regola spenta la cambia ($spenta)" ($spenta -cmatch '^[0-9A-F]{8}$' -and $spenta -ne $imp)
        $regoleS[2].Attiva = $true
        Verifica "riaccesa torna quella di prima" ((Impronta $s) -eq $imp)
        Imposta $s 'Dirigenza' 'vicepreside@scuola-esempio.edu.it'
        Verifica "anche un indirizzo cambiato" ((Impronta $s) -ne $imp)
        Imposta $s 'Dirigenza' 'preside@scuola-esempio.edu.it'
        # nome e ruolo accanto a ogni indirizzo sono commenti: non cambiano
        # quello che fa lo script, quindi nemmeno l'impronta
        $rossi = (Leggi $s 'Personale')[0]
        $tPersona.GetField('Nome', $FI).SetValue($rossi, 'ROSSI MARIO LUIGI')
        Verifica "un nome scritto in un altro modo non la cambia" ((Impronta $s) -eq $imp)
        $tPersona.GetField('Nome', $FI).SetValue($rossi, 'ROSSI MARIO')
        $tPersona.GetField('Ruolo', $FI).SetValue($rossi, 'DOCENTE')
        Verifica "nemmeno un ruolo scritto in un altro modo, ma sempre fra i Docenti" ((Impronta $s) -eq $imp)
        $tPersona.GetField('Ruolo', $FI).SetValue($rossi, 'ASSISTENTE TECNICO')
        Verifica "un ruolo di un altro gruppo si' (cambiano i gruppi)" ((Impronta $s) -ne $imp)
        $tPersona.GetField('Ruolo', $FI).SetValue($rossi, 'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO')
        $tPersona.GetField('Email', $FI).SetValue($rossi, 'mario.rossi2@scuola-esempio.edu.it')
        Verifica "e l'indirizzo di una persona anche" ((Impronta $s) -ne $imp)
        $tPersona.GetField('Email', $FI).SetValue($rossi, 'mario.rossi@scuola-esempio.edu.it')
        Verifica "rimesso tutto com'era, torna quella di prima" ((Impronta $s) -eq $imp)
    }

    # -----------------------------------------------------------------------
    Intestazione 'LA DIRIGENZA DEL PASSO 2 E LA SOTTOETICHETTA Colleghi/Dirigenza'
    # Al passo 4, con le sottoetichette dei ruoli: una regola accesa con i
    # mittenti di un ruolo mette la sua etichetta agli stessi messaggi
    $d = NuovoStato
    Imposta $d 'Dominio' 'scuola.example'
    Imposta $d 'Prefisso' ''
    Imposta $d 'Dirigenza' 'Preside@scuola.example'
    Imposta $d 'Segreteria' 'segreteria@scuola.example'
    AggiungiPersona $d 'GRIGI SARA' 'DIRIGENTE SCOLASTICO' 'preside@scuola.example' $true
    AggiungiPersona $d 'BIANCHI ANNA' 'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO' 'anna.bianchi@scuola.example' $true
    AggiungiPersona $d 'VERDI CARLO' 'ASSISTENTE AMMINISTRATIVO' 'carlo.verdi@scuola.example' $true
    $mDoppi = $tGen.GetMethod('DoppioniConIRuoli', $FS)
    Verifica "il generatore trova le regole doppie di una sottoetichetta" ($null -ne $mDoppi)
    if ($null -ne $mDoppi) {
        function Doppi($stato) { return ,@($mDoppi.Invoke($null, @($stato))) }
        $h = Doppi $d
        Verifica "Dirigenza del passo 2 uguale al ruolo Dirigenza: un avviso, con regola e sottoetichetta" (
            $h.Count -eq 1 -and $h[0].StartsWith('Dirigenza e Colleghi/Dirigenza: stessi mittenti, ogni messaggio prende tutte e due.') -and
            $h[0].Contains('togli la spunta a Dirigenza (la sottoetichetta per ruolo resta)'))
        if ($h.Count -gt 0) { Write-Host "          $($h[0])" }
        Imposta $d 'Prefisso' 'Scuola'
        $h = Doppi $d
        Verifica "con il gruppo i nomi sono quelli dell'elenco del passo 4" (
            $h.Count -eq 1 -and $h[0].StartsWith('Scuola/Dirigenza e Scuola/Colleghi/Dirigenza: '))
        Imposta $d 'Prefisso' ''
        Imposta $d 'EtichettaPerRuolo' $false
        Verifica "senza sottoetichette dei ruoli niente avviso" ((Doppi $d).Count -eq 0)
        Imposta $d 'EtichettaPerRuolo' $true
        $regoleD = Leggi $d 'Regole'
        $regoleD[0].Attiva = $false
        Verifica "con la regola Dirigenza spenta niente avviso" ((Doppi $d).Count -eq 0)
        $regoleD[0].Attiva = $true
        Imposta $d 'Dirigenza' "preside@scuola.example`r`nvicepreside@scuola.example"
        Verifica "con un indirizzo in piu' del ruolo non e' un doppione" ((Doppi $d).Count -eq 0)
        Imposta $d 'Dirigenza' 'preside@scuola.example'
        AggiungiPersona $d 'NERI ELENA' 'DIRIGENTE SCOLASTICO' 'reggente@scuola.example' $true
        $h = Doppi $d
        Verifica "con una parte del ruolo lo dice: tutti anche in Colleghi/Dirigenza" (
            $h.Count -eq 1 -and $h[0].StartsWith('Dirigenza e Colleghi/Dirigenza: i mittenti di Dirigenza sono tutti anche in Colleghi/Dirigenza'))
        $soloPreside = NuovoStato
        Imposta $soloPreside 'Dominio' 'scuola.example'
        Imposta $soloPreside 'Dirigenza' ''
        Imposta $soloPreside 'Segreteria' 'segreteria@scuola.example'
        AggiungiPersona $soloPreside 'GRIGI SARA' 'DIRIGENTE SCOLASTICO' 'preside@scuola.example' $true
        Verifica "la regola Colleghi, madre delle sottoetichette, non conta mai" ((Doppi $soloPreside).Count -eq 0)
    }

    # -----------------------------------------------------------------------
    Intestazione 'L''ANTEPRIMA DELLO SCRIPT VEDE LE STESSE COSE'
    # la configurazione generata, nel motore vero: la stessa impronta del
    # passo 5, e lo stesso doppione che il passo 4 segnala
    $e = NuovoStato
    Imposta $e 'Dominio' 'scuola.example'
    Imposta $e 'Prefisso' ''
    Imposta $e 'Dirigenza' 'Preside@scuola.example'
    Imposta $e 'Segreteria' 'segreteria@scuola.example'
    AggiungiPersona $e 'GRIGI SARA' 'DIRIGENTE SCOLASTICO' 'preside@scuola.example' $true
    AggiungiPersona $e 'BIANCHI ANNA' 'DOCENTE' 'anna.bianchi@scuola.example' $true
    $fileE = Join-Path $temporanea 'Configurazione_doppioni.gs'
    Scrivi $fileE (Genera $e $true)
    $uscita = (& node $anteprimaJs $fileE $motore) -join "`n"
    $piatta = $uscita -replace '\s+', ' '
    $impE = if ($null -ne $mImpronta) { [string]$mImpronta.Invoke($null, @($e)) } else { '(nessuna)' }
    Verifica "PASSO_1_anteprima stampa l'impronta che il passo 5 mostra ($impE)" (
        $uscita.Contains("`nConfigurazione: impronta $impE`n"))
    Verifica "e trova lo stesso doppione" (
        $piatta.Contains('- Dirigenza e Colleghi/Dirigenza: stessi mittenti, ogni messaggio prende tutte e due.'))
    # la casella qui e' vuota: il consiglio sugli indirizzi va anche sotto i
    # domini di partenza (Sindacati), come dicono CHANGELOG e ISTRUZIONI
    $righeE = $uscita -split "`n"
    $iSind = [array]::FindIndex($righeE, [Predicate[string]]{ param($r) $r -match '^  Sindacati ' })
    Verifica "il consiglio sugli indirizzi anche sotto i domini di partenza (Sindacati)" (
        $iSind -ge 0 -and $righeE[$iSind + 1].Trim().StartsWith('nessun messaggio da questi mittenti: controlla gli indirizzi'))

    # -----------------------------------------------------------------------
    Intestazione 'I COLORI DELLE ETICHETTE'
    # la tavolozza (ColoriEtichette, in Stato.cs) e quello che il generatore
    # ne scrive: il colore di ogni regola e quello dei blocchi dei ruoli
    $tColori = $asm.GetType('Campanella.ColoriEtichette')
    Verifica "c'e' la tavolozza dei colori (ColoriEtichette)" ($null -ne $tColori)
    if ($null -ne $tColori) {
        function Colori($metodo, $argomenti) { return $tColori.GetMethod($metodo, $FS).Invoke($null, $argomenti) }
        $ammessiCs = @($tColori.GetField('Ammessi', $FS).GetValue($null))
        $blocco = [regex]::Match((Get-Content -Raw $motore), '(?s)var _COLORI_GMAIL = \[(.*?)\];').Groups[1].Value
        $ammessiGs = @([regex]::Matches($blocco, "'(#[0-9a-f]{6})'") | ForEach-Object { $_.Groups[1].Value })
        Verifica "Campanella e lo script accettano gli stessi colori di Gmail ($($ammessiCs.Count))" (
            $ammessiCs.Count -eq 102 -and (($ammessiCs | Sort-Object) -join ',') -eq (($ammessiGs | Sort-Object) -join ','))
        Verifica "valido: sfondo e testo dalla tavolozza di Gmail" ([bool](Colori 'Valido' @([string]'#16a766/#000000')))
        Verifica "non valido: un valore fuori tavolozza, un colore solo, parole, niente" (
            -not (Colori 'Valido' @([string]'#123456/#ffffff')) -and -not (Colori 'Valido' @([string]'#16a766')) -and
            -not (Colori 'Valido' @([string]'verde/nero')) -and -not (Colori 'Valido' @([string]'')))
        Verifica "Pulito sistema maiuscole e spazi, e fa di un colore sbagliato nessun colore" (
            (Colori 'Pulito' @([string]' #16A766 / #000000 ')) -eq '#16a766/#000000' -and
            (Colori 'Pulito' @([string]'#123456/#ffffff')) -eq '' -and (Colori 'Pulito' @($null)) -eq '')
        $tavolozza = @(Colori 'Tavolozza' @())
        $male = @($tavolozza | Where-Object {
            $p = ([string]$_).Split('/')
            -not (Colori 'Valido' @([string]$_)) -or (Colori 'Contrasto' @([string]$p[0], [string]$p[1])) -lt 4.5 })
        Verifica "la tavolozza del passo 4 ($($tavolozza.Count) colori): tutti ammessi da Gmail, con un testo che si legge" (
            $tavolozza.Count -ge 60 -and $male.Count -eq 0 -and (@($tavolozza | Sort-Object -Unique)).Count -eq $tavolozza.Count)

        # le regole di partenza: un colore ciascuna, tutti diversi, anche dalle
        # sfumature che le sottoetichette dei ruoli prendono da Colleghi
        $partenza = $tStato.GetMethod('RegoleDiDefault', $FS).Invoke($null, @())
        $categorie = @($tStato.GetField('Categorie', $FS).GetValue($null))
        $colleghi = [string](@($partenza | Where-Object { $_.Etichetta -eq 'Colleghi' })[0].Colore)
        $ruoli = @($categorie | ForEach-Object { [string](Colori 'DelRuolo' @($colleghi, [string]$_, $null)) })
        $fuori = @($partenza | Where-Object { $tavolozza -notcontains [string]$_.Colore } | ForEach-Object { $_.Etichetta })
        $sfondi = @($partenza | ForEach-Object { ([string]$_.Colore).Split('/')[0] }) + @($ruoli | ForEach-Object { $_.Split('/')[0] })
        Verifica "ogni regola di partenza ha un colore della tavolozza$(if ($fuori.Count) { ' (non: ' + ($fuori -join ', ') + ')' })" (
            $partenza.Count -ge 12 -and $fuori.Count -eq 0)
        Verifica "e nessuno si ripete, sottoetichette dei ruoli comprese ($($sfondi.Count) colori)" (
            (@($sfondi | Sort-Object -Unique)).Count -eq $sfondi.Count -and $sfondi -notcontains '')
        Verifica "le sottoetichette: sfumature del blu di Colleghi, dalla piu' chiara, nell'ordine delle categorie" (
            ($ruoli -join ' ') -eq '#c9daf8/#000000 #a4c2f4/#000000 #6d9eeb/#000000 #3c78d8/#000000 #285bac/#ffffff')
        # qualunque colore abbia Colleghi, anche uno di una tinta con poche
        # sfumature (gli azzurri ne hanno tre): un colore diverso per ogni ruolo
        $ripetuti = @()
        foreach ($tinta in $tColori.GetField('Tinte', $FS).GetValue($null)) {
            foreach ($sf in $tinta) {
                $c = [string](Colori 'Coppia' @([string]$sf))
                $r = @($categorie | ForEach-Object { [string](Colori 'DelRuolo' @($c, [string]$_, $null)) })
                $buoni = @($r | Where-Object { $_ -ne $c -and (Colori 'Valido' @([string]$_)) } | Sort-Object -Unique)
                if ($buoni.Count -ne $categorie.Count) { $ripetuti += "$sf ($($r -join ' '))" }
            }
        }
        Verifica "per ogni colore di Colleghi, $($categorie.Count) sfumature diverse per i ruoli$(if ($ripetuti.Count) { ': no con ' + ($ripetuti -join ', ') })" (
            $ripetuti.Count -eq 0)
        $azzurri = @($categorie | ForEach-Object { [string](Colori 'DelRuolo' @([string]'#2da2bb/#000000', [string]$_, $null)) })
        Verifica "con Colleghi azzurro: prima le altre due sfumature azzurre, poi i blu piu' chiari" (
            ($azzurri -join ' ') -eq '#98d7e4/#000000 #0d3b44/#ffffff #c9daf8/#000000 #a4c2f4/#000000 #6d9eeb/#000000')

        function ColoriNellaConfigurazione($stato) {
            $f = Join-Path $temporanea 'Configurazione_colori.gs'
            Scrivi $f (Genera $stato $true)
            $mappa = @{}
            foreach ($r in (LeggiConfigurazione $f).CONFIG.regole) {
                $mappa[$r.etichetta] = if ($r.colore) { $r.colore.sfondo + '/' + $r.colore.testo } else { '' }
            }
            return $mappa
        }
        $k = NuovoStato
        AggiungiPersona $k 'ROSSI MARIO' 'DOCENTE' 'mario.rossi@scuola-esempio.edu.it' $true
        AggiungiPersona $k 'DE LUCA ANNA' 'ASSISTENTE AMMINISTRATIVO' 'anna.deluca@scuola-esempio.edu.it' $true
        $testoK = Genera $k $true
        Verifica "nella configurazione il colore e' { sfondo, testo }" (
            $testoK.Contains('      colore:    { sfondo: "#cc3a21", testo: "#ffffff" },'))
        $m = ColoriNellaConfigurazione $k
        Verifica "ogni regola porta il suo colore" (
            $m['Dirigenza'] -eq '#cc3a21/#ffffff' -and $m['Colleghi'] -eq '#4a86e8/#000000' -and $m['Newsletter'] -eq '#999999/#000000')
        Verifica "e le sottoetichette dei ruoli le sfumature di Colleghi" (
            $m['Colleghi/Docenti'] -eq '#a4c2f4/#000000' -and $m['Colleghi/Amministrativi'] -eq '#6d9eeb/#000000')
        $regoleK = Leggi $k 'Regole'
        $colleghiK = @($regoleK | Where-Object { $_.Etichetta -eq 'Colleghi' })[0]
        $colleghiK.Colore = '#a479e2/#000000'
        $m = ColoriNellaConfigurazione $k
        Verifica "cambiando il colore di Colleghi le sottoetichette lo seguono (viola)" (
            $m['Colleghi'] -eq '#a479e2/#000000' -and $m['Colleghi/Docenti'] -eq '#d0bcf1/#000000' -and
            $m['Colleghi/Amministrativi'] -eq '#b694e8/#000000')
        Imposta $k 'ColoriRuoli' (New-Object 'System.Collections.Generic.Dictionary[string,string]')
        $ruoliK = Leggi $k 'ColoriRuoli'
        $ruoliK['Docenti'] = '#fb4c2f/#000000'
        $ruoliK['Amministrativi'] = ''
        $m = ColoriNellaConfigurazione $k
        Verifica "un colore scelto a mano per un ruolo vince sulla sfumatura" ($m['Colleghi/Docenti'] -eq '#fb4c2f/#000000')
        Verifica "e nessun colore scelto a mano: il blocco resta senza colore" ($m['Colleghi/Amministrativi'] -eq '')
        [void]$ruoliK.Remove('Amministrativi')
        $colleghiK.Colore = ''
        $m = ColoriNellaConfigurazione $k
        Verifica "Colleghi senza colore: sottoetichette senza colore, tranne quella scelta a mano" (
            $m['Colleghi'] -eq '' -and $m['Colleghi/Amministrativi'] -eq '' -and $m['Colleghi/Docenti'] -eq '#fb4c2f/#000000')
        $colleghiK.Colore = '#4a86e8/#000000'
        $regoleK[2].Colore = '#123456/#ffffff'
        Verifica "un colore fuori tavolozza (scritto a mano) non arriva allo script" ((ColoriNellaConfigurazione $k)['Circolari'] -eq '')
        $regoleK[2].Colore = $null
        Verifica "nemmeno un colore mai scelto" ((ColoriNellaConfigurazione $k)['Circolari'] -eq '')

        # i colori sono nella configurazione: cambiarli cambia l'impronta
        $regoleK[2].Colore = '#fad165/#000000'
        $prima = [string]$mImpronta.Invoke($null, @($k))
        $regoleK[2].Colore = '#fcda83/#000000'
        Verifica "il colore di una regola cambia l'impronta" (([string]$mImpronta.Invoke($null, @($k))) -ne $prima)
        $regoleK[2].Colore = '#fad165/#000000'
        Verifica "rimesso com'era, torna quella di prima" (([string]$mImpronta.Invoke($null, @($k))) -eq $prima)
        $ruoliK['Docenti'] = '#e66550/#000000'
        Verifica "anche il colore di una sottoetichetta" (([string]$mImpronta.Invoke($null, @($k))) -ne $prima)
        $ruoliK['Docenti'] = '#fb4c2f/#000000'
        $ruoliK['Tecnici'] = '#cc3a21/#ffffff'
        Verifica "ma non quello di un ruolo che nell'elenco non c'e' (nessuna sottoetichetta)" (
            ([string]$mImpronta.Invoke($null, @($k))) -eq $prima)
        $colleghiK.Colore = '#16a766/#000000'
        Verifica "e il colore di Colleghi, che muove anche le sfumature" (([string]$mImpronta.Invoke($null, @($k))) -ne $prima)

        # il riepilogo del passo 5 conta le etichette colorate: regole accese e sottoetichette
        $colleghiK.Colore = '#4a86e8/#000000'
        $n = [int]$tGen.GetMethod('EtichetteColorate', $FS).Invoke($null, @($k))
        $accese = @($regoleK | Where-Object { $_.Attiva -and [string]$_.Colore -ne '' }).Count
        Verifica "il riepilogo conta regole accese e sottoetichette colorate ($n)" ($n -eq $accese + 2)
        # ma solo le regole che escono accese: senza indirizzi di Dirigenza e
        # Segreteria e senza elenco del personale, quelle regole e Colleghi sono
        # spuntate ma la configurazione le scrive spente, e l'anteprima non le conta
        $v = NuovoStato
        Imposta $v 'Dirigenza' ''
        Imposta $v 'Segreteria' ''
        $fileV = Join-Path $temporanea 'Configurazione_spente.gs'
        Scrivi $fileV (Genera $v $true)
        $conColore = @((LeggiConfigurazione $fileV).CONFIG.regole | Where-Object { $_.attiva -and $_.colore }).Count
        $nV = [int]$tGen.GetMethod('EtichetteColorate', $FS).Invoke($null, @($v))
        $rigaV = @(((& node $anteprimaJs $fileV $motore) -join "`n") -split "`n" | Where-Object { $_.StartsWith('Colori: ') })
        Verifica "e solo le regole che la configurazione scrive accese ($nV; accese con un colore: $conColore)" (
            $conColore -gt 0 -and $nV -eq $conColore -and $rigaV.Count -eq 1 -and
            $rigaV[0] -eq "Colori: $conColore etichette con un colore, ma senza il servizio Gmail API non si possono applicare.")
    }

    # -----------------------------------------------------------------------
    Intestazione 'I FILTRI CHE HAI GIA'' IN GMAIL: IL FILE ESPORTATO'
    # un'esportazione inventata, con la forma di quelle vere (Gmail ->
    # Impostazioni -> Filtri e indirizzi bloccati -> Esporta): etichette
    # inventate, indirizzi @scuola.example
    $tFiltri = $asm.GetType('Campanella.FiltriGmail')
    $tDaTogliere = $asm.GetType('Campanella.FiltroDaTogliere')
    Verifica "c'e' il lettore dei filtri esportati da Gmail (FiltriGmail)" ($null -ne $tFiltri -and $null -ne $tDaTogliere)
    if ($null -ne $tFiltri -and $null -ne $tDaTogliere) {
        $esempioXml = Join-Path $qui 'filtri_gmail_esempio.xml'
        $mLeggi = $tFiltri.GetMethod('Leggi', $FS, $null, [Type[]]@([string]), $null)
        function LeggiFiltri($testo) { return ,@($mLeggi.Invoke($null, @([string]$testo))) }
        function ErroreDi($testo) {
            try { [void](LeggiFiltri $testo); return '' } catch { return $_.Exception.GetBaseException().Message }
        }
        # "Etichetta{chiave=valore,...}" con le chiavi in ordine
        function Descrivi($f) {
            $coppie = @($f.Criteri.Keys | Sort-Object { $_ } -CaseSensitive | ForEach-Object { "$_=" + $f.Criteri[$_] })
            return $f.Etichetta + '{' + ($coppie -join ',') + '}'
        }
        $filtri = @($tFiltri.GetMethod('LeggiFile', $FS).Invoke($null, @([string]$esempioXml)))
        $etichette = @($filtri | ForEach-Object { $_.Etichetta })
        Verifica "legge tutti i filtri del file, nell'ordine ($($filtri.Count))" (
            $filtri.Count -eq 14 -and $etichette[0] -eq 'Colleghi' -and $etichette[13] -eq 'Colleghi/Docenti')
        Verifica "i criteri con i nomi del servizio Gmail API: hasTheWord -> query" (
            (Descrivi $filtri[0]) -eq 'Colleghi{query=from:(anna.bianchi@scuola.example OR carlo.verdi@scuola.example)}')
        Verifica "sizeOperator e sizeUnit senza size non sono un criterio, e non sono 'altro'" ($filtri[0].Altre.Count -eq 0)
        Verifica "doesNotHaveTheWord -> negatedQuery, e i si'/no" (
            (Descrivi $filtri[5]) -eq 'Progetti Erasmus{excludeChats=true,hasAttachment=true,negatedQuery=bozza,to=erasmus@scuola.example}')
        Verifica "la dimensione in byte, come la vuole Gmail: 5 MB piu' grande" (
            (Descrivi $filtri[8]) -eq 'Allegati grandi{size=5242880,sizeComparison=larger}')
        Verifica "virgolette e barre arrivano tali e quali" (
            $filtri[12].Etichetta -eq 'Riunioni "urgenti"' -and $filtri[12].Criteri['query'] -eq '"consiglio di classe" OR riunione \ verbale')
        Verifica "un filtro senza etichetta si legge lo stesso" ($filtri[6].Etichetta -eq '' -and $filtri[6].Criteri['from'] -eq 'notifiche@servizio.example')
        Verifica "una proprieta' che Campanella non conosce resta, con il suo valore" (
            $filtri[7].Altre.Count -eq 1 -and $filtri[7].Altre[0].Key -eq 'nuovaOpzione' -and $filtri[7].Altre[0].Value -eq 'si' -and
            (Descrivi $filtri[7]) -eq 'Sindacato{query=assemblea}')
        # nuovaOpzione non e' un'azione (non comincia per "should"): potrebbe
        # essere un criterio nuovo di Gmail, e senza quello lo script
        # toglierebbe un altro filtro, Sindacato{query=assemblea}
        Verifica "e siccome potrebbe essere un criterio, quel filtro non si puo' togliere" (
            $filtri[7].CriteriIncompleti -and $null -eq $filtri[7].GetType().GetMethod('DaTogliere').Invoke($filtri[7], @()))
        Verifica "un'azione che Campanella non conosce (should...) invece si mostra, e il filtro si puo' togliere" (
            -not $filtri[8].CriteriIncompleti -and @($filtri[8].AltreAzioni | Where-Object { $_ -match 'shouldNuovaAzione' }).Count -eq 1 -and
            $null -ne $filtri[8].GetType().GetMethod('DaTogliere').Invoke($filtri[8], @()))
        # un criterio che non si legge: il filtro resta nell'elenco, ma non
        # diventa mai una voce con un criterio in meno
        function UnFiltro($proprieta) {
            $p = ($proprieta.GetEnumerator() | ForEach-Object {
                "<apps:property name='$($_.Key)' value='$([System.Security.SecurityElement]::Escape([string]$_.Value))'/>" }) -join ''
            $f = LeggiFiltri ("<?xml version='1.0'?><feed xmlns='http://www.w3.org/2005/Atom' " +
                "xmlns:apps='http://schemas.google.com/apps/2006'><entry>$p</entry></feed>")
            return $f[0]
        }
        $conSi = UnFiltro ([ordered]@{ hasTheWord = 'verbale'; hasAttachment = 'yes'; label = 'Allegati' })
        $conUnita = UnFiltro ([ordered]@{ hasTheWord = 'verbale'; size = '5'; sizeUnit = 's_sgb'; label = 'Allegati' })
        $conOperatore = UnFiltro ([ordered]@{ hasTheWord = 'verbale'; size = '5'; sizeOperator = 's_circa'; label = 'Allegati' })
        $conNuovo = UnFiltro ([ordered]@{ hasTheWord = 'verbale'; nuovoCriterio = 'x'; label = 'Allegati' })
        $ripetuto = LeggiFiltri ("<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'><entry>" +
            "<apps:property name='from' value='a@scuola.example'/><apps:property name='from' value='b@scuola.example'/>" +
            "<apps:property name='label' value='Allegati'/></entry></feed>")
        $semplice = UnFiltro ([ordered]@{ hasTheWord = 'verbale'; label = 'Allegati' })
        $storti = @()
        foreach ($coppia in @(@('hasAttachment=yes', $conSi), @('sizeUnit sconosciuta', $conUnita), @('sizeOperator sconosciuto', $conOperatore),
                              @('nuovoCriterio', $conNuovo), @('from ripetuto', $ripetuto[0]))) {
            $f = $coppia[1]
            if (-not $f.CriteriIncompleti -or $null -ne $f.GetType().GetMethod('DaTogliere').Invoke($f, @())) { $storti += $coppia[0] }
        }
        Verifica "hasAttachment='yes', una dimensione che non si legge, un criterio nuovo, un criterio ripetuto: non si tolgono$(if ($storti.Count) { ' (no: ' + ($storti -join ', ') + ')' })" (
            $storti.Count -eq 0)
        Verifica "e lo stesso filtro senza quel criterio si' (Allegati, con le parole verbale)" (
            $null -ne $semplice.GetType().GetMethod('DaTogliere').Invoke($semplice, @()))
        $mAzioni = $tFiltri.GetMethod('DescriviAzioni', $FS)
        $mCriteri = $tFiltri.GetMethod('DescriviCriteri', $FS)
        $azioni = @($filtri | ForEach-Object { [string]$mAzioni.Invoke($null, @($_.PSObject.BaseObject)) })
        Write-Host "          $($azioni[10])  |  $($azioni[11])  |  $($azioni[6])"
        Verifica "le azioni dette a parole: archivia" ($azioni[1] -match 'archivia' -and $azioni[0] -eq '')
        Verifica "e le altre: stella, importante, inoltro, categoria, spam, cestino, letto" (
            $azioni[10] -match 'stella' -and $azioni[10] -match 'importante' -and $azioni[10] -match 'inoltra a vice@scuola\.example' -and
            $azioni[11] -match 'Promozioni' -and $azioni[11] -match 'spam' -and $azioni[6] -match 'cestino' -and $azioni[6] -match 'letto')
        $criteriErasmus = [string]$mCriteri.Invoke($null, @($filtri[5].Criteri))
        Verifica "e i criteri detti a parole ($criteriErasmus)" (
            $criteriErasmus -match 'a: erasmus@scuola\.example' -and $criteriErasmus -match 'senza le parole: bozza' -and
            $criteriErasmus -match 'con allegato' -and [string]$mCriteri.Invoke($null, @($filtri[8].Criteri)) -match '5 MB')
        $da = $filtri[1].GetType().GetMethod('DaTogliere').Invoke($filtri[1], @())
        Verifica "un filtro diventa la voce da togliere: etichetta e criteri" (
            $null -ne $da -and $da.Etichetta -eq 'Circolari' -and $da.Criteri.Count -eq 1 -and $da.Criteri['subject'] -eq 'circolare')
        Verifica "uno senza etichetta no" ($null -eq $filtri[6].GetType().GetMethod('DaTogliere').Invoke($filtri[6], @()))

        # un file sbagliato: un messaggio chiaro, in italiano
        $vuoto = ErroreDi ''
        $troncato = ErroreDi "<?xml version='1.0'?><feed xmlns='http://www.w3.org/2005/Atom'><entry><apps:property"
        $altroXml = ErroreDi '<html><body>Filtri</body></html>'
        $conEntita = ErroreDi ("<?xml version='1.0'?><!DOCTYPE feed [<!ENTITY x SYSTEM 'file:///c:/windows/win.ini'>]>" +
                               "<feed xmlns='http://www.w3.org/2005/Atom'><entry><x>&x;</x></entry></feed>")
        Write-Host "          $vuoto"
        Write-Host "          $troncato"
        Write-Host "          $altroXml"
        Verifica "un file vuoto lo dice" ($vuoto -match '^Il file e'' vuoto')
        Verifica "un file rovinato o a meta' lo dice, e dice di esportarlo di nuovo" (
            $troncato -match '^Il file non si legge' -and $troncato -match 'Esporta di nuovo')
        Verifica "un XML qualsiasi non e' un'esportazione dei filtri" ($altroXml -match 'non e'' l''esportazione dei filtri di Gmail')
        Verifica "un file con un DOCTYPE (e un'entita' esterna) non si apre" ($conEntita -match '^Il file non si legge')
        $senzaFiltri = LeggiFiltri "<?xml version='1.0'?><feed xmlns='http://www.w3.org/2005/Atom'><title>Mail Filters</title></feed>"
        Verifica "un'esportazione senza filtri e' vuota, non un errore" ($senzaFiltri.Count -eq 0 -and (ErroreDi "<feed xmlns='http://www.w3.org/2005/Atom'/>") -eq '')
        # un feed Atom qualsiasi (un blog, delle notizie) ha delle voci, ma non filtri
        $blog = ErroreDi ("<?xml version='1.0'?><feed xmlns='http://www.w3.org/2005/Atom'><title>Notizie</title>" +
            "<entry><title>Uno</title><content>testo</content></entry><entry><title>Due</title></entry></feed>")
        Verifica "un altro feed Atom, con voci che non sono filtri, non e' un'esportazione dei filtri" (
            $blog -match 'non e'' l''esportazione dei filtri di Gmail')
        $altroSpazio = ErroreDi ("<feed xmlns='http://www.w3.org/2005/Atom'><entry>" +
            "<z:property xmlns:z='urn:altro' name='from' value='x@scuola.example'/></entry></feed>")
        $senzaAtom = ErroreDi ("<feed xmlns:apps='http://schemas.google.com/apps/2006'><entry>" +
            "<apps:property name='from' value='x@scuola.example'/><apps:property name='label' value='X'/></entry></feed>")
        Verifica "e nemmeno proprieta' di un altro spazio dei nomi, o un feed che non e' Atom" (
            $altroSpazio -match 'non e'' l''esportazione dei filtri di Gmail' -and $senzaAtom -match 'non e'' l''esportazione dei filtri di Gmail')

        # -------------------------------------------------------------------
        Intestazione 'I FILTRI CHE HAI GIA'' IN GMAIL: UGUALI, SIMILI O TUOI'
        # Confronta ha piu' forme: qui quella con l'etichetta sola
        $mConfronta = $tFiltri.GetMethod('Confronta', $FS, $null, [Type[]]@([string], $tStato), $null)
        $c4 = NuovoStato
        Imposta $c4 'Dominio' 'scuola.example'
        Imposta $c4 'Prefisso' ''
        Imposta $c4 'Dirigenza' 'preside@scuola.example'
        Imposta $c4 'Segreteria' 'segreteria@scuola.example'
        AggiungiPersona $c4 'BIANCHI ANNA' 'DOCENTE' 'anna.bianchi@scuola.example' $true
        AggiungiPersona $c4 'VERDI CARLO' 'ASSISTENTE AMMINISTRATIVO' 'carlo.verdi@scuola.example' $true
        function Somiglia($etichetta, $stato) {
            $x = $mConfronta.Invoke($null, @([string]$etichetta, $stato))
            return $x.Tipo + '|' + $x.Regola
        }
        $attese = @(
            'uguale|Colleghi', 'uguale|Circolari', 'simile|Genitori', 'simile|Studenti', 'tuo|', 'tuo|', 'senza|',
            'simile|Sindacati', 'tuo|', 'simile|Registro elettronico', 'uguale|Dirigenza', 'uguale|Newsletter', 'tuo|',
            'uguale|Colleghi/Docenti')
        $diversi = @()
        for ($i = 0; $i -lt $filtri.Count; $i++) {
            $e = Somiglia $filtri[$i].Etichetta $c4
            if ($e -ne $attese[$i]) { $diversi += "$($filtri[$i].Etichetta): $e invece di $($attese[$i])" }
        }
        Verifica "uguale all'etichetta di una regola accesa, simile per una parola o un sinonimo, o tuo$(if ($diversi.Count) { ': no ' + ($diversi -join '; ') })" (
            $diversi.Count -eq 0)
        $famiglie = $mConfronta.Invoke($null, @([string]'Famiglie', $c4))
        $alunni = $mConfronta.Invoke($null, @([string]'Alunni', $c4))
        Verifica "a parole: '$($famiglie.Testo())', '$($alunni.Testo())'" (
            $famiglie.Testo() -eq 'simile a Genitori (regola spenta)' -and $alunni.Testo() -eq 'simile a Studenti' -and
            ($mConfronta.Invoke($null, @([string]'Circolari', $c4))).Testo() -eq 'uguale a una regola di Campanella (Circolari)')
        Verifica "senza badare alle maiuscole, e una parola al plurale e' la stessa (Circolare, Sindacato)" (
            (Somiglia 'circolari' $c4) -eq 'uguale|Circolari' -and (Somiglia 'Circolare urgente' $c4) -eq 'simile|Circolari')
        Verifica "le parole corte e quelle generiche non bastano (Ora, Varie)" (
            (Somiglia 'Ora' $c4) -eq 'tuo|' -and (Somiglia 'Varie' $c4) -eq 'tuo|')
        # uguali a meno dell'ultima lettera, e lunghe uguali o una lettera in
        # piu': non basta che una cominci come l'altra
        $parolePerse = @('Circolo didattico', 'Sindaco', 'Registrazioni', 'Segreto') | Where-Object { (Somiglia $_ $c4) -ne 'tuo|' }
        Verifica "Circolo, Sindaco, Registrazioni e Segreto non somigliano a Circolari, Sindacati, Registro e Segreteria$(if (@($parolePerse).Count) { ': no ' + (@($parolePerse) -join ', ') })" (
            @($parolePerse).Count -eq 0)
        Verifica "ma circolare e circolari, sindacato e sindacati si'" (
            (Somiglia 'Circolare' $c4) -eq 'simile|Circolari' -and (Somiglia 'Sindacato' $c4) -eq 'simile|Sindacati')
        Imposta $c4 'Prefisso' 'Scuola'
        Verifica "con il gruppo: uguale solo il nome intero, Scuola/Colleghi; Colleghi da solo e' simile" (
            (Somiglia 'Scuola/Colleghi' $c4) -eq 'uguale|Scuola/Colleghi' -and (Somiglia 'Colleghi' $c4) -eq 'simile|Scuola/Colleghi' -and
            (Somiglia 'scuola/colleghi/docenti' $c4) -eq 'uguale|Scuola/Colleghi/Docenti')
        Imposta $c4 'Prefisso' ''
        $senzaPersone = NuovoStato
        Imposta $senzaPersone 'Prefisso' ''
        Verifica "una regola spuntata ma spenta nella configurazione (Colleghi senza elenco) non e' uguale" (
            (Somiglia 'Colleghi' $senzaPersone) -eq 'simile|Colleghi' -and
            ($mConfronta.Invoke($null, @([string]'Colleghi', $senzaPersone))).Testo() -eq 'simile a Colleghi (regola spenta)')

        # -------------------------------------------------------------------
        Intestazione 'I FILTRI CHE HAI GIA'' IN GMAIL: QUALI PARTONO SPUNTATI'
        # uguale a una regola si', ma solo se il filtro non fa altro: chi lo
        # toglie perderebbe anche l'inoltro, la stella, lo spam...
        $tFiltroGmail = $asm.GetType('Campanella.FiltroGmail')
        $mConfrontaF = $tFiltri.GetMethod('Confronta', $FS, $null, [Type[]]@($tFiltroGmail, $tStato), $null)
        $mDiPartenza = $tFiltri.GetMethod('DiPartenza', $FS)
        Verifica "c'e' il confronto di un filtro intero, e la scelta di quelli spuntati di partenza" (
            $null -ne $mConfrontaF -and $null -ne $mDiPartenza)
        if ($null -ne $mConfrontaF -and $null -ne $mDiPartenza) {
            # BaseObject: dentro ForEach-Object il filtro arriva avvolto da PowerShell
            function Confronto($f, $stato) { return $mConfrontaF.Invoke($null, @($f.PSObject.BaseObject, $stato.PSObject.BaseObject)) }
            function Partenza($f, $stato) {
                $x = Confronto $f $stato
                return $x.Tipo + '|' + [bool]$mDiPartenza.Invoke($null, @($f.PSObject.BaseObject, $x))
            }
            $partenze = @($filtri | ForEach-Object { Partenza $_ $c4 })
            # Dirigenza ha proprio i criteri del filtro che Campanella crea per
            # quella regola (da: preside@scuola.example), ma inoltra e mette la stella
            $attesePartenza = @(
                'uguale|True', 'uguale|True', 'simile|False', 'simile|False', 'tuo|False', 'tuo|False', 'senza|False',
                'noncapito|False', 'tuo|False', 'simile|False', 'campanella|False', 'uguale|False', 'tuo|False', 'uguale|True')
            $diverse = @()
            for ($i = 0; $i -lt $filtri.Count; $i++) {
                if ($partenze[$i] -ne $attesePartenza[$i]) { $diverse += "$($filtri[$i].Etichetta): $($partenze[$i]) invece di $($attesePartenza[$i])" }
            }
            Verifica "spuntati di partenza: Colleghi, Circolari (archivia) e Colleghi/Docenti; non Dirigenza (inoltra) ne' Newsletter (spam, categoria)$(if ($diverse.Count) { ': no ' + ($diverse -join '; ') })" (
                $diverse.Count -eq 0)
            $inoltra = UnFiltro ([ordered]@{ subject = 'circolare'; label = 'Circolari'; forwardTo = 'vice@scuola.example' })
            $testoInoltra = (Confronto $inoltra $c4).Testo()
            Verifica "uguale ma inoltra: non spuntato, e il suggerimento dice perche' ('$testoInoltra')" (
                (Partenza $inoltra $c4) -eq 'uguale|False' -and
                $testoInoltra -match '^uguale a una regola di Campanella \(Circolari\), ma fa anche altro \(inoltra a vice@scuola\.example\)' -and
                $testoInoltra -match 'toglilo solo se non ti serve')
            $dirigenza = (Confronto $filtri[10] $c4).Testo()
            Verifica "e cosi' anche per Dirigenza: '$dirigenza'" (
                $dirigenza -match '^come quelli creati da Campanella per Dirigenza' -and $dirigenza -match 'inoltra a vice@scuola\.example')
            Verifica "un filtro con un criterio che non si capisce lo dice: '$((Confronto $filtri[7] $c4).Testo())'" (
                (Confronto $filtri[7] $c4).Testo() -eq "ha un criterio che Campanella non capisce: resta com'e'")
            $cestino = UnFiltro ([ordered]@{ subject = 'circolare'; label = 'Circolari'; shouldTrash = 'true' })
            Verifica "anche un filtro uguale che elimina non parte spuntato" ((Partenza $cestino $c4) -eq 'uguale|False')
        }

        # -------------------------------------------------------------------
        Intestazione 'I FILTRI CHE HA CREATO CAMPANELLA (EXTRA_creaFiltriGmail)'
        # Uno Stato con il gruppo, i ruoli e piu' di 20 colleghi: i filtri
        # che il C# si aspetta da EXTRA_creaFiltriGmail devono essere proprio
        # quelli che calcola lo script vero, e letti da un'esportazione di
        # Gmail sono "creati da Campanella", mai spuntati di partenza
        $c5 = NuovoStato
        Imposta $c5 'Dominio' 'scuola.example'
        Imposta $c5 'Dirigenza' 'preside@scuola.example'
        Imposta $c5 'Segreteria' "segreteria@scuola.example`r`nprotocollo@scuola.example"
        for ($k = 1; $k -le 23; $k++) {
            AggiungiPersona $c5 ('DOCENTE ' + $k) 'DOCENTE' ('docente' + $k.ToString('00') + '@scuola.example') $true
        }
        AggiungiPersona $c5 'AMMINISTRATIVA UNA' 'ASSISTENTE AMMINISTRATIVO' 'amministrativa1@scuola.example' $true
        $fileC5 = Join-Path $temporanea 'Configurazione_campanella.gs'
        Scrivi $fileC5 (Genera $c5 $false)
        $filtriJs = Join-Path $temporanea 'filtri_di_campanella.js'
        Scrivi $filtriJs @'
const vm = require('vm'), fs = require('fs');
const contesto = vm.createContext({});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), contesto, { filename: 'Configurazione.gs' });
vm.runInContext(fs.readFileSync(process.argv[3], 'utf8'), contesto, { filename: 'Organizzazione_Gmail.gs' });
const cfg = contesto.CONFIG, filtri = [];
contesto._regoleAttive_(cfg).forEach(r => {
  if (r.escludiEtichette && r.escludiEtichette.length) return;       // restano allo script
  contesto._criteriFiltro_(cfg, r).forEach(c => {
    const nome = contesto._etichettaCompleta_(cfg, r);
    const chiave = nome.trim().toLowerCase() + Object.keys(c).sort()
      .map(k => '\n' + k + '=' + String(c[k] === true ? 'true' : c[k]).replace(/\s+/g, ' ').trim()).join('');
    filtri.push({ etichetta: nome, criteri: c, chiave, archivia: !!r.archivia, letti: !!r.segnaComeLette });
  });
});
process.stdout.write(JSON.stringify({ filtri, perQuery: contesto._INDIRIZZI_PER_QUERY }));
'@
        $delloScript = (& node $filtriJs $fileC5 $motore) | ConvertFrom-Json
        $mFiltriDiCampanella = $tFiltri.GetMethod('FiltriDiCampanella', $FS)
        Verifica "c'e' il calcolo dei filtri che crea Campanella" ($null -ne $mFiltriDiCampanella)
        if ($null -ne $mFiltriDiCampanella) {
            $delC = @($mFiltriDiCampanella.Invoke($null, @($c5)) | ForEach-Object { $_.Chiave() })
            $chiaviJs = @($delloScript.filtri | ForEach-Object { $_.chiave })
            $colleghiJs = @($delloScript.filtri | Where-Object { $_.etichetta -eq 'Scuola/Colleghi' })
            Verifica "gli stessi filtri dello script vero ($($chiaviJs.Count), in $(@($delloScript.filtri | ForEach-Object { $_.etichetta } | Select-Object -Unique).Count) etichette)" (
                $chiaviJs.Count -ge 8 -and (($delC | Sort-Object) -join "`n|") -eq (($chiaviJs | Sort-Object) -join "`n|"))
            Verifica "con 24 colleghi, due filtri per Colleghi: ogni $($delloScript.perQuery) mittenti, come nello script" (
                $colleghiJs.Count -eq 2 -and $delloScript.perQuery -eq $tFiltri.GetField('IndirizziPerFiltro', $FS).GetValue($null))
        }
        # l'esportazione di quei filtri, come la scrive Gmail: query ->
        # hasTheWord, le regole che archiviano con shouldArchive, e le
        # proprieta' della dimensione che Gmail mette sempre
        $nomiExport = @{ from = 'from'; to = 'to'; subject = 'subject'; query = 'hasTheWord' }
        $voci = foreach ($f in $delloScript.filtri) {
            $p = @()
            foreach ($k in $f.criteri.PSObject.Properties) {
                $p += "<apps:property name='$($nomiExport[$k.Name])' value='$([System.Security.SecurityElement]::Escape([string]$k.Value))'/>"
            }
            $p += "<apps:property name='label' value='$([System.Security.SecurityElement]::Escape($f.etichetta))'/>"
            if ($f.archivia) { $p += "<apps:property name='shouldArchive' value='true'/>" }
            if ($f.letti) { $p += "<apps:property name='shouldMarkAsRead' value='true'/>" }
            $p += "<apps:property name='sizeOperator' value='s_sl'/><apps:property name='sizeUnit' value='s_smb'/>"
            '<entry><category term=''filter''></category><title>Mail Filter</title>' + ($p -join '') + '</entry>'
        }
        $esportazione = "<?xml version='1.0' encoding='UTF-8'?><feed xmlns='http://www.w3.org/2005/Atom' " +
            "xmlns:apps='http://schemas.google.com/apps/2006'><title>Mail Filters</title>" + ($voci -join '') + '</feed>'
        $diCampanella = LeggiFiltri $esportazione
        if ($null -ne $mConfrontaF -and $null -ne $mDiPartenza) {
            $partenzeC = @($diCampanella | ForEach-Object { Partenza $_ $c5 })
            $nonCampanella = @($partenzeC | Where-Object { $_ -ne 'campanella|False' })
            Verifica "letti dall'esportazione sono tutti 'creati da Campanella', e nessuno parte spuntato ($($diCampanella.Count))$(if ($nonCampanella.Count) { ': no ' + ($nonCampanella -join ', ') })" (
                $diCampanella.Count -eq @($delloScript.filtri).Count -and $nonCampanella.Count -eq 0)
            $testoC = (Confronto $diCampanella[0] $c5).Testo()
            Verifica "e il suggerimento lo dice: '$testoC'" (
                $testoC -match '^creato da Campanella per Scuola/' -and $testoC -match 'EXTRA_creaFiltriGmail' -and
                $testoC -match "toglilo solo se non vuoi piu' i filtri veri")
            # lo stesso nome ma altri criteri: un filtro vecchio, anche di una
            # versione di prima di Campanella, e parte spuntato
            $vecchioC = UnFiltro ([ordered]@{ subject = 'circolare'; label = 'Scuola/Circolari' })
            Verifica "con la stessa etichetta ma altri criteri e' uguale, e parte spuntato" ((Partenza $vecchioC $c5) -eq 'uguale|True')
        }

        # -------------------------------------------------------------------
        Intestazione 'I FILTRI DA TOGLIERE NELLA CONFIGURAZIONE'
        $tListaFiltri = [type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tDaTogliere)
        function Scegli($stato, $quali) {
            $lista = [Activator]::CreateInstance($tListaFiltri)
            foreach ($f in $quali) { $lista.Add($f.GetType().GetMethod('DaTogliere').Invoke($f, @())) }
            Imposta $stato 'FiltriDaTogliere' $lista
        }
        $g = NuovoStato
        Imposta $g 'Prefisso' ''
        AggiungiPersona $g 'BIANCHI ANNA' 'DOCENTE' 'anna.bianchi@scuola.example' $true
        $senzaFiltri = Genera $g $true
        Verifica "senza filtri scelti la configurazione non ne parla" (-not $senzaFiltri.Contains('filtriDaTogliere'))
        $impSenza = [string]$mImpronta.Invoke($null, @($g))
        Scegli $g @($filtri[0], $filtri[5], $filtri[8], $filtri[12])
        $testoF = Genera $g $true
        $fileF = Join-Path $temporanea 'Configurazione_filtri.gs'
        Scrivi $fileF $testoF
        $lettaF = LeggiConfigurazione $fileF
        $voci = @($lettaF.CONFIG.filtriDaTogliere)
        Verifica "la configurazione si carica e definisce solo CONFIG" ($null -ne $lettaF.CONFIG -and $lettaF.altri.Count -eq 0)
        Verifica "con i filtri scelti, uno per voce: etichetta e criteri" (
            $voci.Count -eq 4 -and $voci[0].etichetta -eq 'Colleghi' -and
            $voci[0].criteri.query -eq 'from:(anna.bianchi@scuola.example OR carlo.verdi@scuola.example)')
        Verifica "i si'/no come veri booleani, gli altri come testo" (
            $voci[1].criteri.hasAttachment -is [bool] -and $voci[1].criteri.hasAttachment -and $voci[1].criteri.excludeChats -eq $true -and
            $voci[1].criteri.to -eq 'erasmus@scuola.example' -and $voci[1].criteri.negatedQuery -eq 'bozza')
        Verifica "la dimensione come numero, con il confronto" (
            $voci[2].criteri.size -eq 5242880 -and $voci[2].criteri.size -isnot [string] -and $voci[2].criteri.sizeComparison -eq 'larger')
        Verifica "virgolette e barre arrivano identiche" (
            $voci[3].etichetta -eq 'Riunioni "urgenti"' -and $voci[3].criteri.query -eq '"consiglio di classe" OR riunione \ verbale')
        $impCon = [string]$mImpronta.Invoke($null, @($g))
        Verifica "i filtri scelti cambiano l'impronta" ($impCon -ne $impSenza -and $testoF.Contains('impronta: "' + $impCon + '"') -and
            (Genera $g $false).Contains('impronta: "' + $impCon + '"'))
        $listaG = Leggi $g 'FiltriDaTogliere'
        $togliUno = $listaG[3]
        $listaG.RemoveAt(3)
        Verifica "anche uno solo in meno" (([string]$mImpronta.Invoke($null, @($g))) -ne $impCon)
        $listaG.Add($togliUno)
        Verifica "rimesso, torna quella di prima" (([string]$mImpronta.Invoke($null, @($g))) -eq $impCon)
        Imposta $g 'FiltriDaTogliere' $null
        Verifica "e senza elenco (null) la configurazione e' quella senza filtri" ((Genera $g $true) -eq $senzaFiltri)

        # lo script vero, con la configurazione generata: toglie proprio quei
        # filtri, e non uno uguale con un criterio in piu'. Cosi' un nome di
        # criterio scritto diverso da una parte sola si vede subito
        $togliJs = Join-Path $temporanea 'togli.js'
        Scrivi $togliJs @'
const vm = require('vm'), fs = require('fs');
const etichette = [], filtri = [], tolti = [], proprieta = {};
const contesto = vm.createContext({
  GmailApp: { search: () => [], getUserLabelByName: () => null },
  PropertiesService: { getUserProperties: () => ({ getProperty: k => proprieta[k] || null, setProperty: (k, v) => { proprieta[k] = v; } }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'docente@scuola.example' }), getScriptTimeZone: () => 'Europe/Rome' },
  Utilities: { formatDate: () => '20260923' },
  LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  MailApp: { sendEmail: () => {} },
  Logger: { log: () => {} },
  Gmail: { Users: {
    Labels: { list: () => ({ labels: etichette }) },
    Settings: { Filters: {
      list: () => ({ filter: JSON.parse(JSON.stringify(filtri)) }),
      remove: (u, id) => { tolti.push(id); filtri.splice(filtri.findIndex(f => f.id === id), 1); }
    } }
  } }
});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), contesto, { filename: 'Configurazione.gs' });
vm.runInContext(fs.readFileSync(process.argv[3], 'utf8'), contesto, { filename: 'Organizzazione_Gmail.gs' });
contesto.CONFIG.provaSenzaModifiche = false;
contesto.CONFIG.filtriDaTogliere.forEach((v, i) => {
  etichette.push({ id: 'Label_' + i, name: v.etichetta, type: 'user' });
  filtri.push({ id: 'F' + i, criteria: JSON.parse(JSON.stringify(v.criteri)), action: { addLabelIds: ['Label_' + i] } });
});
filtri.push({ id: 'INPIU', criteria: Object.assign({ hasAttachment: true }, contesto.CONFIG.filtriDaTogliere[0].criteri),
              action: { addLabelIds: ['Label_0'] } });
const anteprima = contesto.PASSO_1_anteprima();
contesto.EXTRA_togliFiltri();
process.stdout.write(JSON.stringify({ tolti, restano: filtri.map(f => f.id),
  riga: anteprima.split('\n').filter(r => r.indexOf('da togliere') >= 0) }));
'@
        Scegli $g @($filtri[0], $filtri[5], $filtri[8], $filtri[12])
        Scrivi $fileF (Genera $g $false)
        $esitoTogli = (& node $togliJs $fileF $motore) | ConvertFrom-Json
        Verifica "lo script toglie i quattro filtri scelti ($(@($esitoTogli.tolti) -join ', '))" (
            (@($esitoTogli.tolti) -join ',') -eq 'F0,F1,F2,F3')
        Verifica "e non quello con un criterio in piu'" ((@($esitoTogli.restano) -join ',') -eq 'INPIU')
        Verifica "PASSO_1_anteprima dice quanti sono e con quale funzione si tolgono" (
            @($esitoTogli.riga).Count -eq 1 -and $esitoTogli.riga[0] -eq '4 filtri di Gmail da togliere: esegui EXTRA_togliFiltri (serve il servizio Gmail API).')

        # -------------------------------------------------------------------
        Intestazione 'LA FINESTRA DEI FILTRI, COSTRUITA E MAI MOSTRATA'
        # La finestra del passo 4 si costruisce senza aprirla: bastano Carica,
        # le spunte e la scelta, e non serve lo schermo
        $tFF = $asm.GetType('Campanella.FormFiltriGmail')
        $FIn = [System.Reflection.BindingFlags]'NonPublic,Instance'
        function NuovaFinestra($stato) { return [Activator]::CreateInstance($tFF, @($stato.PSObject.BaseObject)) }
        function Scelte($ff) { return (@($ff.SceltiAdesso() | ForEach-Object { $_.Etichetta }) -join ',') }
        # la virgola: la lista arriva a Carica cosi' com'e', non srotolata
        function Esempio { return ,($tFiltri.GetMethod('LeggiFile', $FS).Invoke($null, @([string]$esempioXml))) }

        # i filtri creati da Campanella (qui sopra) non partono spuntati
        if ($null -ne $esportazione) {
            $ffC = NuovaFinestra $c5
            $ffC.Carica($mLeggi.Invoke($null, @([string]$esportazione)))
            $esitoC = $tFF.GetField('lblEsito', $FIn).GetValue($ffC).Text
            Verifica "i filtri creati da Campanella non partono spuntati ('$esitoC')" (
                (Scelte $ffC) -eq '' -and $esitoC -match 'creati da Campanella')
            $ffC.Dispose()
        }

        # riordinata con un clic sull'intestazione, ogni spunta resta al suo filtro
        $ffO = NuovaFinestra $c4
        $ffO.Carica((Esempio))
        $gr = $tFF.GetField('griglia', $FIn).GetValue($ffO)
        $primaO = Scelte $ffO
        $gr.Sort($gr.Columns[1], [System.ComponentModel.ListSortDirection]::Descending)
        $dopoO = Scelte $ffO
        $aVista = (@($gr.Rows | Where-Object { $_.Cells[0].Value -eq $true } | ForEach-Object { [string]$_.Cells[1].Value }) | Sort-Object) -join ','
        Verifica "riordinata per etichetta, la scelta resta la stessa ($primaO), e si vede sulle righe giuste" (
            $primaO -ne '' -and $dopoO -eq $primaO -and $aVista -eq ((@($primaO -split ',') | Sort-Object) -join ','))
        $ffO.Spunta(4, $true)
        $rigaViaggi = @($gr.Rows | Where-Object { [string]$_.Cells[1].Value -eq 'Viaggi' })[0]
        Verifica "spuntare un filtro dall'elenco spunta la sua riga, dovunque sia finita" (
            $rigaViaggi.Cells[0].Value -eq $true -and (Scelte $ffO) -match 'Viaggi')
        # un clic sulla spunta di una riga della griglia (la quarta, che nel file
        # e' un'altra): e' il filtro di quella riga
        $quarta = [string]$gr.Rows[3].Cells[1].Value
        $primaDelClic = @($ffO.SceltiAdesso() | Where-Object { $_.Etichetta -eq $quarta }).Count
        $gr.Rows[3].Cells[0].Value = $true
        Verifica "la spunta messa sulla quarta riga della griglia ($quarta) sceglie proprio quel filtro" (
            $primaDelClic -eq 0 -and @($ffO.SceltiAdesso() | Where-Object { $_.Etichetta -eq $quarta }).Count -eq 1)
        $gr.CurrentCell = $gr.Rows[1].Cells[1]
        $dettaglio = $tFF.GetField('txtDettaglio', $FIn).GetValue($ffO).Text
        Verifica "e il dettaglio sotto la griglia e' quello della riga scelta ($([string]$gr.Rows[1].Cells[1].Value))" (
            $dettaglio -match ('^Etichetta: ' + [regex]::Escape([string]$gr.Rows[1].Cells[1].Value) + '\r?\n'))
        $ffO.Dispose()

        # un secondo file che non ha un filtro scelto prima: la scelta resta, in fondo
        $s6 = NuovoStato
        Imposta $s6 'Prefisso' ''
        $scelti6 = [Activator]::CreateInstance($tListaFiltri)
        $viaggi6 = [Activator]::CreateInstance($tDaTogliere)
        $viaggi6.Etichetta = 'Viaggi'
        $viaggi6.Criteri['query'] = '{prenotazione biglietto}'
        $scelti6.Add($viaggi6)
        Imposta $s6 'FiltriDaTogliere' $scelti6
        $ff6 = NuovaFinestra $s6
        $ff6.Carica((Esempio))
        $conViaggi = Scelte $ff6
        $ff6.Carica($mLeggi.Invoke($null, @([string]("<feed xmlns='http://www.w3.org/2005/Atom' " +
            "xmlns:apps='http://schemas.google.com/apps/2006'><entry><apps:property name='from' value='gite@scuola.example'/>" +
            "<apps:property name='label' value='Gite'/></entry></feed>"))))
        $esito6 = $tFF.GetField('lblEsito', $FIn).GetValue($ff6).Text
        Verifica "aprendo un altro file che non ha Viaggi, scelto prima, Viaggi resta scelto ('$esito6')" (
            $conViaggi -match 'Viaggi' -and (Scelte $ff6) -eq 'Viaggi' -and
            $esito6 -match "^Nel file c'e' 1 filtro: 1 tuo\." -and $esito6 -match "In fondo, 1 scelto prima che nel file non c'e'\.")
        $ff6.Dispose()
    }

    # -----------------------------------------------------------------------
    Intestazione 'LE MIE CLASSI: I NOMI E LE PAROLE DELL''OGGETTO'
    # Posta, passo 4, "Le mie classi...": una regola per classe. Gmail cerca
    # parole intere: 3B, "3 B" (dovrebbe prendere anche 3^B e la B dopo il segno di grado) e III B
    $tClassi = $asm.GetType('Campanella.LeMieClassi')
    $tScelta = $asm.GetType('Campanella.ClasseScelta')
    $tFC = $asm.GetType('Campanella.FormClassi')
    Verifica "ci sono LeMieClassi, ClasseScelta e la finestra FormClassi" ($null -ne $tClassi -and $null -ne $tScelta -and $null -ne $tFC)
    if ($null -ne $tClassi -and $null -ne $tScelta -and $null -ne $tFC) {
        function MC($nome) { return $tClassi.GetMethod($nome, $FS) }
        function Varianti($c) { return (@((MC 'Varianti').Invoke($null, @([string]$c))) -join '|') }
        function ChiaveClasse($c) { return [string](MC 'Chiave').Invoke($null, @([string]$c)) }
        function NomeClasse($c) { return [string](MC 'Nome').Invoke($null, @([string]$c)) }
        $grado = [string][char]0x00B0
        $attese = [ordered]@{
            '3B' = '3B|3 B|III B'; '3^B' = '3B|3 B|III B'; ('3' + $grado + 'B') = '3B|3 B|III B'; ' 3 b ' = '3B|3 B|III B'
            '3B LSA' = '3B|3 B|III B'; '2B-Ls' = '2B|2 B|II B'; '4Ar' = '4AR|4 AR|IV AR'
            # una sezione che e' una parola ("1 a 10", "classi 1 e 2", "dal 5 al 10"): niente forme con lo spazio da sole
            '3A' = '3A|classe 3 A|classe III A'; '1E' = '1E|classe 1 E|classe I E'; '2I' = '2I|classe 2 I|classe II I'
            '4O' = '4O|classe 4 O|classe IV O'; '5AL' = '5AL|classe 5 AL|classe V AL'
            # un codice che non e' numero e sezione: nessuna parola, le scrive il docente
            'A5' = ''; '1A2' = ''; '10A' = ''; 'B' = ''; 'D.' = ''
        }
        $storte = @()
        foreach ($k in $attese.Keys) { if ((Varianti $k) -ne $attese[$k]) { $storte += "$k -> $(Varianti $k)" } }
        Verifica "le parole di partenza: 3B, ""3 B"", III B; per 3B LSA le stesse; con A, E, I, O ""classe 3 A""; un codice che non e' numero e sezione nessuna$(if ($storte.Count) { ': no ' + ($storte -join '; ') })" (
            $storte.Count -eq 0)
        Verifica "3B, 3 B, 3^B e 3$($grado)B sono la stessa classe; 3B LSA, 3B ITE e 3BL sono altre" (
            (ChiaveClasse '3B') -eq (ChiaveClasse '3 B') -and (ChiaveClasse '3^B') -eq (ChiaveClasse '3b') -and
            (ChiaveClasse ('3' + $grado + 'B')) -eq (ChiaveClasse '3B') -and (ChiaveClasse '3B LSA') -ne (ChiaveClasse '3B') -and
            (ChiaveClasse '3B LSA') -ne (ChiaveClasse '3B ITE') -and (ChiaveClasse '3BL') -ne (ChiaveClasse '3B'))
        Verifica "3B LSA, 3B-LSA, 3b_lsa e 3 B lsa sono la stessa classe" (
            (ChiaveClasse '3B-LSA') -eq (ChiaveClasse '3B LSA') -and (ChiaveClasse '3b_lsa') -eq (ChiaveClasse '3B LSA') -and
            (ChiaveClasse '3 B lsa') -eq (ChiaveClasse '3B LSA'))
        $senzaDoppi = @((MC 'SenzaDoppioni').Invoke($null, @(,[string[]]@('3B LSA', '3B ITE', '1A AFM', '1A CAT', '3B', '3 B')))) -join '|'
        Verifica "le classi con lo stesso numero e la stessa sezione restano diverse ($senzaDoppi)" (
            $senzaDoppi -eq '1A AFM|1A CAT|3B|3B ITE|3B LSA')
        $separa = [ordered]@{ '3A/3B' = '3A|3B'; '3A-3B' = '3A|3B'; '3A 3B' = '3A|3B'; '3A + 3B' = '3A|3B'; '2B-Ls' = '2B-Ls';
                              '3B LSA' = '3B LSA'; '3A/B' = '3A/B'; 'A5 AF' = 'A5 AF'; '4A-4B LSA' = '4A|4B LSA'; '5 A 5 B' = '5 A|5 B'
                              # un numero e una parola non sono una classe: la cella resta una
                              '3B 2 gruppi' = '3B 2 gruppi'; '1A 2 ore' = '1A 2 ore'; ('4A 2' + $grado + 'gr') = ('4A 2' + $grado + 'gr')
                              '2C 3 Ore' = '2C 3 Ore'; '1A 2ore' = '1A 2ore'; '3B 5per' = '3B 5per'
                              # le sezioni attaccate al numero, anche lunghe o con l'indirizzo: sono classi
                              '5AINF/5BINF' = '5AINF|5BINF'; '3ACAT 3BCAT' = '3ACAT|3BCAT'; '5AAFM-5BAFM' = '5AAFM|5BAFM'
                              '3AS-3bs' = '3AS|3bs'; '3BS-3Cs' = '3BS|3Cs'; '4AINF-4BINF LAB' = '4AINF|4BINF LAB'
                              '3as 3bs' = '3as|3bs'
                              # due lettere minuscole accanto a una classe di una lettera sola: un gruppo, non una classe
                              '4A 2gr' = '4A 2gr'; '3A 1gr' = '3A 1gr'; '4A 2sq' = '4A 2sq'
                              # i gruppi anche in maiuscolo, o accanto a una sezione di due lettere: non hanno la
                              # forma della prima classe (le chiavi sono diverse: la tabella non bada alle maiuscole)
                              '4C 2GR' = '4C 2GR'; '4A 1SQ' = '4A 1SQ'; '3A 1SQ' = '3A 1SQ'; '4AS 2gr' = '4AS 2gr'
                              '3BS 1gr' = '3BS 1gr'; '4BS 2GR' = '4BS 2GR'
                              # la sezione attaccata con le maiuscole miste, con la stessa forma: due classi
                              '5Cinf/5Dinf' = '5Cinf|5Dinf'; '3Ccat 3Dcat' = '3Ccat|3Dcat'; '3AS/3BS' = '3AS|3BS' }
        $storteS = @()
        foreach ($k in $separa.Keys) {
            $pezzi = @((MC 'Separa').Invoke($null, @([string]$k))) -join '|'
            if ($pezzi -ne $separa[$k]) { $storteS += "$k -> $pezzi" }
        }
        Verifica "una cella con due classi (3A/3B, 3A-3B, 3A 3B) sono due classi, 2B-Ls e 3B LSA una$(if ($storteS.Count) { ': no ' + ($storteS -join '; ') })" (
            $storteS.Count -eq 0)
        Verifica "e nel nome non restano barre, che in Gmail farebbero un'etichetta dentro l'altra (3A/B -> $(NomeClasse '3A/B'))" (
            (NomeClasse '3A/B') -eq '3A-B' -and (NomeClasse '3B\LSA') -eq '3B-LSA' -and (NomeClasse 'Recupero/Mat') -eq 'Recupero-Mat')
        Verifica "il nome come lo scrive Campanella: 3^b -> 3B, 3b LSA -> 3B LSA, A5 resta A5" (
            (NomeClasse '3^b') -eq '3B' -and (NomeClasse ' 3b  LSA ') -eq '3B LSA' -and (NomeClasse 'A5') -eq 'A5')

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: GLI INDIRIZZI INCOLLATI'
        $dominioStudenti = 'studenti.scuola-esempio.edu.it'
        $incollato = "Anna Rossi <Anna.Rossi@$dominioStudenti>, luca.verdi@$dominioStudenti;`r`n" +
                     "MARIO.BIANCHI@$dominioStudenti`t""Sara Neri"" <sara.neri@$dominioStudenti>  " +
                     "anna.rossi@$dominioStudenti, prof.rossi@scuola-esempio.edu.it; preside@scuola-esempio.edu.it " +
                     "non-e-un-indirizzo, @solodominio, a@b"
        $letti = (MC 'Indirizzi').Invoke($null, @([string]$incollato))
        Verifica "solo gli indirizzi (anche nella forma Nome <indirizzo>), minuscoli, senza doppioni ($($letti.Count))" (
            ($letti -join ',') -eq ("anna.rossi@$dominioStudenti,luca.verdi@$dominioStudenti,mario.bianchi@$dominioStudenti," +
                                    "sara.neri@$dominioStudenti,prof.rossi@scuola-esempio.edu.it,preside@scuola-esempio.edu.it"))
        # l'apostrofo nel nome utente (D'Amico, Dell'Orto): Google Workspace lo ammette
        $conApostrofo = "Sara D'Amico <d'amico.sara@$dominioStudenti>, 'o'neil@$dominioStudenti', " +
                        "dell'orto.luca@$dominioStudenti; `"bianchi@$dominioStudenti`""
        $lettiA = @((MC 'Indirizzi').Invoke($null, @([string]$conApostrofo))) -join ','
        Verifica "gli indirizzi con l'apostrofo si leggono interi, senza gli apici intorno ($lettiA)" (
            $lettiA -eq ("d'amico.sara@$dominioStudenti,o'neil@$dominioStudenti,dell'orto.luca@$dominioStudenti," +
                         "bianchi@$dominioStudenti"))
        # quello che sta attaccato davanti non e' dell'indirizzo: un collegamento
        # con ?email=, una riga con le colonne separate da | o da ;
        $attaccati = "https://x.example/u/0/?email=anna@$dominioStudenti&x=1`r`nRossi|luca@$dominioStudenti`r`n" +
                     "Verdi;Mario;mario@$dominioStudenti`r`nmailto:sara@$dominioStudenti`r`n``neri@$dominioStudenti```r`n" +
                     "#bianchi@$dominioStudenti, =rosa.neri@$dominioStudenti"
        $lettiB = @((MC 'Indirizzi').Invoke($null, @([string]$attaccati))) -join ','
        Verifica "e senza quello che ci sta attaccato davanti ($lettiB)" (
            $lettiB -eq ("anna@$dominioStudenti,luca@$dominioStudenti,mario@$dominioStudenti,sara@$dominioStudenti," +
                         "neri@$dominioStudenti,bianchi@$dominioStudenti,rosa.neri@$dominioStudenti"))
        $sp = NuovoStato
        AggiungiPersona $sp 'ROSSI PAOLO' 'DOCENTE' 'Prof.Rossi@scuola-esempio.edu.it' $true
        $tolti = New-Object 'System.Collections.Generic.List[string]'
        $restano = (MC 'TogliPersonale').Invoke($null, @($letti.PSObject.BaseObject, $sp.PSObject.BaseObject, $tolti.PSObject.BaseObject))
        Verifica "gli indirizzi del personale (e della dirigenza) si tolgono, e si sa quali" (
            $restano.Count -eq 4 -and ($tolti -join ',') -eq 'prof.rossi@scuola-esempio.edu.it,preside@scuola-esempio.edu.it' -and
            -not ($restano -contains 'preside@scuola-esempio.edu.it'))
        # nell'elenco del passo 3 senza spunta ci sono anche gli studenti (ruolo
        # Studente, o presi dalla casella senza ruolo): quelli restano studenti
        AggiungiPersona $sp 'VERDI LUCA' 'Studente' "luca.verdi@$dominioStudenti" $false
        AggiungiPersona $sp '' '' "anna.rossi@$dominioStudenti" $false
        $tolti = New-Object 'System.Collections.Generic.List[string]'
        $restano = @((MC 'TogliPersonale').Invoke($null, @($letti.PSObject.BaseObject, $sp.PSObject.BaseObject, $tolti.PSObject.BaseObject)))
        Verifica "chi nell'elenco del passo 3 e' senza spunta (studenti, indirizzi presi dalla casella) non si toglie ($($restano.Count))" (
            $restano.Count -eq 4 -and ($restano -contains "luca.verdi@$dominioStudenti") -and ($restano -contains "anna.rossi@$dominioStudenti") -and
            ($tolti -join ',') -eq 'prof.rossi@scuola-esempio.edu.it,preside@scuola-esempio.edu.it')
        Verifica "piu' di $([int]$tClassi.GetField('TroppiStudenti', $FS).GetValue($null)) indirizzi sembrano piu' di una classe" (
            [int]$tClassi.GetField('TroppiStudenti', $FS).GetValue($null) -eq 40)

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: IL FILE Classe_3B.gs'
        $nomiFile = [ordered]@{ '3B' = 'Classe_3B.gs'; '3B LSA' = 'Classe_3B_LSA.gs'; '2B-Ls' = 'Classe_2B_Ls.gs'; 'IV A' = 'Classe_IV_A.gs' }
        $fileJs = Join-Path $temporanea 'file_classe.js'
        Scrivi $fileJs @'
const vm = require('vm'), fs = require('fs');
const c = vm.createContext({});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), c, { filename: 'Organizzazione_Gmail.gs' });
process.stdout.write(JSON.stringify({ nomi: process.argv.slice(3).map(n => c._fileClasse_(n)) }));
'@
        $delMotore = @(((& node $fileJs $motore @($nomiFile.Keys)) | ConvertFrom-Json).nomi)
        $delC = @($nomiFile.Keys | ForEach-Object { [string](MC 'NomeFile').Invoke($null, @([string]$_)) })
        Verifica "il nome del file e' quello che lo script cerca ($($delC -join ', '))" (
            ($delC -join '|') -eq (@($nomiFile.Values) -join '|') -and ($delMotore -join '|') -eq ($delC -join '|'))
        $studenti = New-Object 'System.Collections.Generic.List[string]'
        for ($k = 1; $k -le 25; $k++) { $studenti.Add(('studente{0:00}.terzab@{1}' -f $k, $dominioStudenti)) }
        $quarta = New-Object 'System.Collections.Generic.List[string]'
        $quarta.Add("studente.quartaa@$dominioStudenti")
        $mFile = MC 'FileClasse'
        $quando = [datetime]'2026-09-24T10:00:00'
        $testo3B = [string]$mFile.Invoke($null, @([string]'3B', [string]'Classi 2026-27/3B', $studenti.PSObject.BaseObject, $quando))
        $testo4A = [string]$mFile.Invoke($null, @([string]'4A', [string]'Classi 2026-27/4A', $quarta.PSObject.BaseObject, $quando))
        $file3B = Join-Path $temporanea 'Classe_3B.gs'
        $file4A = Join-Path $temporanea 'Classe_4A.gs'
        Scrivi $file3B $testo3B
        Scrivi $file4A $testo4A
        Verifica "l'intestazione dice di chi sono, che Campanella non ne tiene copia, come aggiornarli e di cancellarlo a fine anno" (
            $testo3B -match 'studenti della 3B' -and $testo3B -match 'Campanella non ne tiene copia' -and
            $testo3B -match 'incollali di nuovo' -and $testo3B -match 'fine anno' -and $testo3B -match 'cancella')
        $sommaJs = Join-Path $temporanea 'somma_classi.js'
        Scrivi $sommaJs @'
const vm = require('vm'), fs = require('fs');
const c = vm.createContext({});
for (const f of process.argv.slice(2)) vm.runInContext(fs.readFileSync(f, 'utf8'), c, { filename: f });
const fuori = {};
for (const k of Object.keys(c.CLASSI_STUDENTI || {}).sort()) {
  fuori[k] = c.CLASSI_STUDENTI[k].etichetta + ':' + c.CLASSI_STUDENTI[k].indirizzi.length;
}
process.stdout.write(JSON.stringify({ classi: fuori, globali: Object.keys(c).sort() }));
'@
        $unoPoi = (& node $sommaJs $file3B $file4A) | ConvertFrom-Json
        $poiUno = (& node $sommaJs $file4A $file3B) | ConvertFrom-Json
        Verifica "due file nello stesso progetto si sommano, in tutti e due gli ordini, e definiscono solo CLASSI_STUDENTI" (
            $unoPoi.classi.'3B' -eq 'Classi 2026-27/3B:25' -and $unoPoi.classi.'4A' -eq 'Classi 2026-27/4A:1' -and
            $poiUno.classi.'3B' -eq 'Classi 2026-27/3B:25' -and $poiUno.classi.'4A' -eq 'Classi 2026-27/4A:1' -and
            ($unoPoi.globali -join ',') -eq 'CLASSI_STUDENTI')
        Verifica "e ognuno dice per quale regola vale, solo per quella etichetta, e quando e' stato copiato" (
            $testo3B.Contains('etichetta: "Classi 2026-27/3B",') -and $testo3B.Contains('copiato: "2026-09-24",') -and
            $testo3B -match 'Valgono solo per' -and
            $testo3B -match 'non li mette nei filtri di Gmail')

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: DA DOVE VENGONO'
        # lo Stato vero, con CartellaDiProva: Salva scrive solo qui dentro
        $salvati = Join-Path $temporanea 'salvati'
        New-Item -ItemType Directory -Path $salvati | Out-Null
        $tStato.GetField('CartellaDiProva', $FS).SetValue($null, $salvati)
        $s7 = $tStato.GetMethod('Carica', $FS).Invoke($null, @())
        Imposta $s7 'Dominio' 'scuola-esempio.edu.it'
        Imposta $s7 'Prefisso' ''
        Imposta $s7 'Anno' '2026-27'
        Imposta $s7 'CalDocente' 'Rossi'
        Imposta $s7 'Classi' "1A: Matematica, Fisica`r`n3 B: Fisica`r`n4Ar`r`n"
        Imposta $s7 'Dirigenza' 'preside@scuola-esempio.edu.it'
        AggiungiPersona $s7 'ROSSI PAOLO' 'DOCENTE' 'prof.rossi@scuola-esempio.edu.it' $true
        $tLezione = $asm.GetType('Campanella.Lezione')
        foreach ($l in @(@('ROSSI', 0, 1, '3B'), @('ROSSI', 1, 2, '3^B'), @('ROSSI', 2, 3, 'D'), @('ROSSI', 3, 1, '5AL'),
                         @('BIANCHI', 0, 2, '1C'))) {
            $x = [Activator]::CreateInstance($tLezione)
            $tLezione.GetField('Docente').SetValue($x, $l[0])
            $tLezione.GetField('Giorno').SetValue($x, [int]$l[1])
            $tLezione.GetField('Ora').SetValue($x, [int]$l[2])
            $tLezione.GetField('Classe').SetValue($x, $l[3])
            (Leggi $s7 'Lezioni').Add($x)
        }
        $trovate = @((MC 'DaLezioniECartelle').Invoke($null, @($s7.PSObject.BaseObject)))
        Verifica "dalle lezioni del docente (senza le ore a disposizione) e da Cartelle, senza doppioni ($($trovate -join ', '))" (
            ($trovate -join '|') -eq '1A|3B|4AR|5AL')
        Verifica "l'etichetta madre di partenza e' Classi e l'anno" ([string](MC 'MadreDiPartenza').Invoke($null, @($s7.PSObject.BaseObject)) -eq 'Classi 2026-27')
        $vuoto7 = $tStato.GetMethod('Carica', $FS).Invoke($null, @())
        Verifica "senza orario ne' Cartelle nessuna classe" (@((MC 'DaLezioniECartelle').Invoke($null, @($vuoto7.PSObject.BaseObject))).Count -eq 0)
        # una lezione di due classi insieme, e in Cartelle la stessa classe con l'articolazione
        $s7b = $tStato.GetMethod('Carica', $FS).Invoke($null, @())
        Imposta $s7b 'CalDocente' 'Rossi'
        Imposta $s7b 'Classi' "2C LSA: Fisica`r`n"
        $x = [Activator]::CreateInstance($tLezione)
        $tLezione.GetField('Docente').SetValue($x, 'ROSSI')
        $tLezione.GetField('Classe').SetValue($x, '2C/2D')
        (Leggi $s7b 'Lezioni').Add($x)
        $trovate7b = @((MC 'DaLezioniECartelle').Invoke($null, @($s7b.PSObject.BaseObject))) -join '|'
        Verifica "la lezione 2C/2D sono due classi, e la 2C LSA di Cartelle una terza ($trovate7b)" ($trovate7b -eq '2C|2C LSA|2D')

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: LA FINESTRA, COSTRUITA E MAI MOSTRATA'
        function NuovaFC($stato) { return [Activator]::CreateInstance($tFC, @($stato.PSObject.BaseObject)) }
        function Righe($fc) { return @($fc.Classi | ForEach-Object { $_.Nome + $(if ($_.Spuntata) { '+' } else { '-' }) }) -join ',' }
        function Indice($fc, $nome) { for ($i = 0; $i -lt $fc.Classi.Count; $i++) { if ($fc.Classi[$i].Nome -eq $nome) { return $i } }; return -1 }
        $fc = NuovaFC $s7
        Verifica "parte dalle classi trovate, tutte spuntate ($(Righe $fc)), con la madre di partenza" (
            (Righe $fc) -eq '1A+,3B+,4AR+,5AL+' -and $fc.Madre -eq 'Classi 2026-27')
        Verifica "e le parole dell'oggetto di partenza (3B: $($fc.Classi[1].Oggetto))" ($fc.Classi[1].Oggetto -eq '3B, 3 B, III B')
        $fcS = NuovaFC $s7b
        Verifica "2C e 2C LSA sono due righe, e la finestra lo dice: cercano le stesse parole ($($fcS.AvvisoSimili()))" (
            (Righe $fcS) -eq '2C+,2C LSA+,2D+' -and $fcS.AvvisoSimili() -match '2C e 2C LSA' -and
            $fcS.AvvisoSimili() -match "togli la spunta" -and $fc.AvvisoSimili() -eq '')
        [void]$fcS.Aggiungi('2C ITE')
        Verifica "e la 2C ITE aggiunta a mano e' un'altra riga ($(Righe $fcS))" ((Righe $fcS) -eq '2C+,2C ITE+,2C LSA+,2D+')
        $fcS.Dispose()
        # i codici che non sono numero e sezione (A5, AF: gruppi, laboratori) non partono spuntati, e senza parole
        $s7c = $tStato.GetMethod('Carica', $FS).Invoke($null, @())
        Imposta $s7c 'Classi' "A5`r`n3B`r`nAF"
        $fcA = NuovaFC $s7c
        $iA5 = Indice $fcA 'A5'
        Verifica "A5 e AF non partono spuntate e senza parole dell'oggetto, la 3B si' ($(Righe $fcA))" (
            (Righe $fcA) -eq '3B+,A5-,AF-' -and $fcA.Classi[$iA5].Oggetto -eq '' -and $fcA.Classi[0].Oggetto -eq '3B, 3 B, III B')
        Verifica "e chiedono di scrivere come compaiono nell'oggetto ('$($fcA.Avviso($iA5))')" ($fcA.Avviso($iA5) -match 'scrivi tu')
        $iB = $fcA.Aggiungi('B')
        Verifica "una aggiunta a mano e' spuntata, ma anche lei senza parole ($(Righe $fcA))" (
            (Righe $fcA) -eq '3B+,A5-,AF-,B+' -and $fcA.Classi[$iB].Oggetto -eq '')
        $fcA.Dispose()
        $i3B = Indice $fc '3B'
        $incolla3B = ($studenti -join ', ') + ", PROF.ROSSI@scuola-esempio.edu.it, " + $studenti[0].ToUpperInvariant()
        $fc.Incolla($i3B, $incolla3B)
        $avviso = $fc.Avviso($i3B)
        Verifica "incollati: 25 indirizzi, e uno del personale tolto, detto ('$avviso')" (
            $fc.Classi[$i3B].Indirizzi.Count -eq 25 -and $avviso -match '25 indirizzi' -and $avviso -match '1 del personale' -and
            $avviso -match "dall'elenco del passo 3" -and -not ($avviso -match 'prof\.rossi'))
        $fc.Incolla($i3B, $incolla3B + ', preside@scuola-esempio.edu.it')
        $avviso = $fc.Avviso($i3B)
        Verifica "e dice da dove vengono quelli tolti: il passo 3 e la pagina La tua scuola ('$avviso')" (
            $avviso -match '2 del personale tolti' -and $avviso -match "1 dall'elenco del passo 3" -and
            $avviso -match '1 dalla pagina "La tua scuola"')
        $fc.Incolla($i3B, $incolla3B)
        $tanti = @(for ($k = 1; $k -le 45; $k++) { "alunno$k@$dominioStudenti" }) -join "`r`n"
        $i1A = Indice $fc '1A'
        $fc.Incolla($i1A, $tanti)
        Verifica "oltre 40 indirizzi lo dice: sembra piu' di una classe ('$($fc.Avviso($i1A))')" ($fc.Avviso($i1A) -match "sembra piu' di una classe")
        $fc.Incolla($i1A, '')
        Verifica "e incollando niente la classe torna senza indirizzi" ($null -eq $fc.Classi[$i1A].Indirizzi -or $fc.Classi[$i1A].Indirizzi.Count -eq 0)
        $testoFile = $fc.TestoFile($i3B)
        Verifica "il file Classe_3B.gs ha i 25 studenti, e non il collega" (
            @($studenti | Where-Object { -not $testoFile.Contains('"' + $_ + '"') }).Count -eq 0 -and -not ($testoFile -match 'prof\.rossi'))
        Verifica "una classe senza indirizzi incollati non ha file" ($fc.TestoFile($i1A) -eq '')
        [void]$fc.Aggiungi('2c')
        Verifica "una classe aggiunta a mano ($(Righe $fc)), e una che c'e' gia' non si ripete" (
            (Righe $fc) -eq '1A+,2C+,3B+,4AR+,5AL+' -and $fc.Aggiungi('3^B') -eq (Indice $fc '3B') -and $fc.Classi.Count -eq 5)
        # la riga del campo A di Classroom scritta in "Aggiungi una classe" o
        # nell'etichetta madre: gli indirizzi (e i nomi) degli studenti non
        # diventano una classe, una regola o un'etichetta di Gmail
        $rigaA = "Mario Rossi <mario.rossi@$dominioStudenti>, Luca Bianchi <luca.bianchi@$dominioStudenti>"
        $avvisoA = [string](MC 'AvvisoIndirizziNelNome').Invoke($null, @([string]$rigaA))
        Verifica "degli indirizzi scritti come nome di una classe non la aggiungono, e il bottone lo dice ('$avvisoA')" (
            $fc.Aggiungi($rigaA) -eq -1 -and (Righe $fc) -eq '1A+,2C+,3B+,4AR+,5AL+' -and $avvisoA -match 'casella sotto' -and
            [string](MC 'AvvisoIndirizziNelNome').Invoke($null, @([string]'3B')) -eq '')
        $fc.Madre = "Classi mario.rossi@$dominioStudenti"
        Verifica "e scritti nell'etichetta madre si tolgono, tutto il testo: torna la madre di partenza ($($fc.Madre))" (
            $fc.Madre -eq 'Classi 2026-27' -and (Righe $fc) -eq '1A+,2C+,3B+,4AR+,5AL+' -and
            [string](MC 'Madre').Invoke($null, @([string]"Mario Rossi <mario.rossi@$dominioStudenti>")) -eq 'Classi')
        # e se arrivano lo stesso fra le classi scelte, Applica non ne fa una regola
        $conIndirizzi = [Activator]::CreateInstance($tScelta)
        $conIndirizzi.Nome = $rigaA
        $conIndirizzi.Spuntata = $true
        $fc.Classi.Add($conIndirizzi)
        $fc.Classi[(Indice $fc '4AR')].Spuntata = $false
        $fc.Classi[(Indice $fc '2C')].Spuntata = $false
        $regolePrima = (Leggi $s7 'Regole').Count
        $esito = [string](MC 'Applica').Invoke($null, @($s7.PSObject.BaseObject, [string]$fc.Madre, $fc.Classi.PSObject.BaseObject, [bool]$fc.TogliVecchie))
        $fc.Dispose()
        $regole7 = Leggi $s7 'Regole'
        $delleClassi = @($regole7 | Where-Object { $_.Sorgente -eq 'classe' })
        $r3B = @($delleClassi | Where-Object { $_.Etichetta -eq 'Classi 2026-27/3B' })[0]
        Verifica "una regola per classe spuntata, in fondo: $(@($delleClassi | ForEach-Object { $_.Etichetta }) -join ', ') ('$esito')" (
            $delleClassi.Count -eq 3 -and $regole7.Count -eq $regolePrima + 3 -and
            (@($regole7 | Select-Object -Last 3 | ForEach-Object { $_.Etichetta }) -join '|') -eq 'Classi 2026-27/1A|Classi 2026-27/3B|Classi 2026-27/5AL')
        Verifica "la regola della 3B: le parole, il solo segnaposto fra i mittenti, basta uno dei due" (
            $null -ne $r3B -and ($r3B.Oggetto -join '|') -eq '3B|3 B|III B' -and ($r3B.Da -join '|') -eq '@CLASSE:3B@' -and
            $r3B.UnoQualsiasi -and $r3B.Attiva -and -not $r3B.Archivia -and $r3B.EscludiEtichette.Count -eq 0 -and
            $r3B.Descrizione -match '3B nell''oggetto' -and $r3B.Descrizione -match 'studenti della 3B')
        $sfondi = @($delleClassi | ForEach-Object { ([string]$_.Colore).Split('/')[0] })
        Verifica "colori: sfumature diverse del verde acqua, che le regole accese non usano ($($sfondi -join ' '))" (
            ($sfondi -join '|') -eq '#c6f3de|#a0eac9|#68dfa9')
        Verifica "nel riepilogo niente indirizzi" (-not ($esito -match '@'))
        # dopo "Usa queste classi": la configurazione di nuovo e, con lo script
        # della posta di una versione di prima (che non conosce le classi), anche il codice
        $vPosta = [string]$asm.GetType('Campanella.Guscio').GetMethod('VersioneScript', $FS).Invoke($null, @([string]'Organizzazione_Gmail.gs'))
        $dopoClassi = [string](MC 'DopoLeClassi').Invoke($null, @([string]$vPosta))
        Verifica "dopo 'Usa queste classi' dice di copiare la configurazione e, se PASSO_1_anteprima non scrive $vPosta, di reincollare il codice ('$dopoClassi')" (
            $vPosta -ne '' -and [IO.File]::ReadAllText($motore).Contains("var _POSTA_VERSIONE         = '$vPosta'") -and
            $dopoClassi -match 'configurazione \(passo 5\)' -and $dopoClassi.Contains("posta $vPosta") -and
            $dopoClassi -match 'reincolla anche il codice' -and $dopoClassi -match 'PASSO_1_anteprima')
        Verifica "e nessuna regola con gli indirizzi scritti come nome di una classe" (
            @($regole7 | Where-Object { ([string]$_.Etichetta).Contains('@') -or (($_.Da -join ' ') -match 'mario\.rossi') }).Count -eq 0)

        # gli indirizzi degli studenti non si conservano: ne' nei file salvati ne' in Configurazione.gs
        Imposta $s7 'DatiNelDrive' $true
        $datiDrive = Join-Path $salvati 'drive\Campanella'
        New-Item -ItemType Directory -Path $datiDrive | Out-Null
        Imposta $s7 'CartellaDati' $datiDrive
        $s7.Salva()
        Verifica "Salva riesce ($($s7.UltimoErrore))" ($s7.UltimoErrore -eq '')
        $salvatiTesto = @(Get-ChildItem -Path $salvati -Recurse -File | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName) }) -join "`n"
        $conf7 = Genera $s7 $false
        $incollati = @($studenti) + @("alunno1@$dominioStudenti", "mario.rossi@$dominioStudenti")
        Verifica "nei file salvati (campanella.json e i dati nel Drive) nessuno degli indirizzi incollati" (
            $salvatiTesto.Contains('@CLASSE:3B@') -and @($incollati | Where-Object { $salvatiTesto.ToLowerInvariant().Contains($_) }).Count -eq 0)
        Verifica "e nemmeno in Configurazione.gs, che ha il segnaposto e unoQualsiasi" (
            $conf7.Contains('da:        ["@CLASSE:3B@"],') -and $conf7.Contains('unoQualsiasi: true,') -and
            @($incollati | Where-Object { $conf7.ToLowerInvariant().Contains($_) }).Count -eq 0)
        Verifica "li ha solo il file Classe_3B.gs" ($testoFile.Contains($studenti[24]))

        # riaperta: gli indirizzi non ci sono piu', e lo dice
        $fc2 = NuovaFC $s7
        $j3B = Indice $fc2 '3B'
        Verifica "riaperta, le classi con la regola sono spuntate ($(Righe $fc2))" ((Righe $fc2) -eq '1A+,3B+,4AR-,5AL+')
        Verifica "e dice che gli indirizzi non sono conservati: si incollano di nuovo ('$($fc2.Avviso($j3B))')" (
            ($null -eq $fc2.Classi[$j3B].Indirizzi) -and $fc2.Avviso($j3B) -match 'non li conserva' -and $fc2.Avviso($j3B) -match 'Classe_3B\.gs' -and
            $fc2.TestoFile($j3B) -eq '')
        Verifica "con l'anno nell'etichetta madre non parla dell'anno dopo" (-not ($fc2.Avviso($j3B) -match "non ha l'anno"))
        $colore3B = $r3B.Colore
        $fc2.Classi[$j3B].Oggetto = '3B, III B, terza B'
        $fc2.Classi[(Indice $fc2 '1A')].Spuntata = $false
        $esito2 = [string](MC 'Applica').Invoke($null, @($s7.PSObject.BaseObject, [string]$fc2.Madre, $fc2.Classi.PSObject.BaseObject, [bool]$fc2.TogliVecchie))
        Verifica "togliendo una classe l'esito ricorda di cancellare il suo file dal progetto ('$esito2')" (
            $esito2 -match '1 tolta' -and $esito2 -match 'cancella Classe_1A\.gs')
        $fc2.Dispose()
        $delleClassi = @((Leggi $s7 'Regole') | Where-Object { $_.Sorgente -eq 'classe' })
        $r3B = @($delleClassi | Where-Object { $_.Etichetta -eq 'Classi 2026-27/3B' })[0]
        Verifica "aggiornata: la 3B ha le parole nuove e tiene il suo colore; la 1A tolta non ha piu' la regola" (
            $delleClassi.Count -eq 2 -and ($r3B.Oggetto -join '|') -eq '3B|III B|terza B' -and $r3B.Colore -eq $colore3B -and
            @($delleClassi | Where-Object { $_.Etichetta -eq 'Classi 2026-27/1A' }).Count -eq 0)

        # le parole dell'oggetto: una con la virgola, scritta in "Modifica", resta intera;
        # gli indirizzi incollati nella colonna per sbaglio non diventano parole
        $r3B.Oggetto.Add('Scrutinio 3B, primo periodo')
        $fcP = NuovaFC $s7
        $kP = Indice $fcP '3B'
        Verifica "una parola con la virgola si vede fra virgolette ($($fcP.Classi[$kP].Oggetto))" (
            $fcP.Classi[$kP].Oggetto -eq '3B, III B, terza B, "Scrutinio 3B, primo periodo"')
        [void](MC 'Applica').Invoke($null, @($s7.PSObject.BaseObject, [string]$fcP.Madre, $fcP.Classi.PSObject.BaseObject, $false))
        Verifica "e con ""Usa queste classi"" resta intera, senza la cella toccata ($($r3B.Oggetto -join '|'))" (
            ($r3B.Oggetto -join '|') -eq '3B|III B|terza B|Scrutinio 3B, primo periodo')
        $avvisoP = $fcP.CambiaOggetto($kP, $fcP.Classi[$kP].Oggetto + ", anna.rossi@studenti.scuola-esempio.edu.it; luca.verdi@studenti.scuola-esempio.edu.it")
        Verifica "e anche toccata; gli indirizzi incollati nella colonna vanno via, e lo dice ('$avvisoP')" (
            $fcP.Classi[$kP].Oggetto -eq '3B, III B, terza B, "Scrutinio 3B, primo periodo"' -and
            $avvisoP -match '2 indirizzi' -and $avvisoP -match 'casella')
        $fcP.Classi[$kP].Oggetto = $fcP.Classi[$kP].Oggetto + ', mario.bianchi@studenti.scuola-esempio.edu.it'
        [void](MC 'Applica').Invoke($null, @($s7.PSObject.BaseObject, [string]$fcP.Madre, $fcP.Classi.PSObject.BaseObject, $false))
        $fcP.Dispose()
        Verifica "e un indirizzo arrivato fino a ""Usa queste classi"" non entra nella regola ($($r3B.Oggetto -join '|'))" (
            ($r3B.Oggetto -join '|') -eq '3B|III B|terza B|Scrutinio 3B, primo periodo')
        [void]$r3B.Oggetto.Remove('Scrutinio 3B, primo periodo')

        # l'anno dopo: le regole dell'anno prima si tolgono solo se lo chiedi
        Imposta $s7 'Anno' '2027-28'
        $fc3 = NuovaFC $s7
        Verifica "l'anno dopo la madre e' Classi 2027-28, e le regole del 2026-27 sono 'vecchie' (2), da non togliere di partenza" (
            $fc3.Madre -eq 'Classi 2027-28' -and $fc3.Vecchie.Count -eq 2 -and -not $fc3.TogliVecchie -and
            $fc3.TestoVecchie() -match 'del 2026-27 \(2\)')
        Verifica "e ricorda di cancellare i file Classe_*.gs dal progetto (l'app non puo')" ($fc3.NotaVecchie() -match 'Classe_\*\.gs')
        # la 3B dell'anno prima e quella nuova hanno lo stesso file: cancellandolo
        # la regola nuova perderebbe gli studenti appena copiati
        Verifica "ma non quelli con lo stesso nome di una classe di quest'anno, che il file nuovo sostituisce ('$($fc3.NotaVecchie())')" (
            $fc3.NotaVecchie() -match "non quelli con lo stesso nome di una classe di quest'anno" -and
            $fc3.NotaVecchie() -match 'Usa queste classi')
        [void](MC 'Applica').Invoke($null, @($s7.PSObject.BaseObject, [string]$fc3.Madre, $fc3.Classi.PSObject.BaseObject, $false))
        $etichette7 = @((Leggi $s7 'Regole') | Where-Object { $_.Sorgente -eq 'classe' } | ForEach-Object { $_.Etichetta })
        Verifica "senza la spunta restano anche quelle del 2026-27 ($($etichette7 -join ', '))" (
            @($etichette7 | Where-Object { $_ -like 'Classi 2026-27/*' }).Count -eq 2 -and
            @($etichette7 | Where-Object { $_ -like 'Classi 2027-28/*' }).Count -eq 4)
        $fc3.TogliVecchie = $true
        [void](MC 'Applica').Invoke($null, @($s7.PSObject.BaseObject, [string]$fc3.Madre, $fc3.Classi.PSObject.BaseObject, [bool]$fc3.TogliVecchie))
        $fc3.Dispose()
        $etichette7 = @((Leggi $s7 'Regole') | Where-Object { $_.Sorgente -eq 'classe' } | ForEach-Object { $_.Etichetta })
        Verifica "con la spunta si tolgono ($($etichette7 -join ', '))" (
            @($etichette7 | Where-Object { $_ -like 'Classi 2026-27/*' }).Count -eq 0 -and $etichette7.Count -eq 4)

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: L''ETICHETTA MADRE SCELTA A MANO'
        # La madre si puo' cambiare: riaprendo la finestra deve tornare quella
        # delle regole che ci sono, con le loro parole, e cambiandola nella
        # finestra le righe devono seguire le regole di quella madre
        $s10 = NuovoStato
        Imposta $s10 'Prefisso' ''
        Imposta $s10 'Anno' '2026-27'
        Imposta $s10 'Classi' "3B`r`n"
        $fcM = NuovaFC $s10
        $fcM.Madre = 'Le mie classi'
        $iM = Indice $fcM '3B'
        [void]$fcM.CambiaOggetto($iM, '3B, terza B')
        [void]$fcM.Aggiungi('2C')
        [void](MC 'Applica').Invoke($null, @($s10.PSObject.BaseObject, [string]$fcM.Madre, $fcM.Classi.PSObject.BaseObject, $false))
        $fcM.Dispose()
        $fcM = NuovaFC $s10
        $iM = Indice $fcM '3B'
        Verifica "riaperta, la madre e' quella delle regole ($($fcM.Madre)), con le loro parole, e niente 'anno prima'" (
            $fcM.Madre -eq 'Le mie classi' -and $fcM.Classi[$iM].Oggetto -eq '3B, terza B' -and $fcM.Vecchie.Count -eq 0 -and
            (Righe $fcM) -eq '2C+,3B+')
        # l'anno dopo le regole sotto "Le mie classi" restano le stesse, e il
        # file della classe darebbe gli studenti di prima: lo dice la finestra
        Verifica "senza l'anno nella madre, l'avviso di una classe con la regola dice di copiare di nuovo il file l'anno dopo ('$($fcM.Avviso($iM))')" (
            $fcM.Avviso($iM) -match "L'etichetta madre non ha l'anno" -and
            $fcM.Avviso($iM) -match "all'anno scolastico nuovo la regola resta questa, ma gli studenti cambiano")
        [void](MC 'Applica').Invoke($null, @($s10.PSObject.BaseObject, [string]$fcM.Madre, $fcM.Classi.PSObject.BaseObject, $false))
        $regole10 = @((Leggi $s10 'Regole') | Where-Object { $_.Sorgente -eq 'classe' })
        Verifica "e ""Usa queste classi"" non fa doppioni ne' perde le parole ($(@($regole10 | ForEach-Object { $_.Etichetta + '=' + ($_.Oggetto -join '|') }) -join ', '))" (
            $regole10.Count -eq 2 -and @($regole10 | Where-Object { $_.Etichetta -eq 'Le mie classi/3B' -and ($_.Oggetto -join '|') -eq '3B|terza B' }).Count -eq 1)
        # nella finestra: un'altra madre, poi di nuovo quella; gli indirizzi incollati restano
        $fcM.Incolla($iM, 'uno@studenti.scuola-esempio.edu.it, due@studenti.scuola-esempio.edu.it')
        $fcM.Madre = 'Classi 2026-27'
        $righeAltra = Righe $fcM
        $fcM.Madre = 'Le mie classi'
        $iM = Indice $fcM '3B'
        Verifica "cambiando madre le righe seguono le sue regole ($righeAltra, poi $(Righe $fcM)), e gli indirizzi incollati restano" (
            $righeAltra -eq '3B+' -and (Righe $fcM) -eq '2C+,3B+' -and $fcM.Classi[$iM].Oggetto -eq '3B, terza B' -and
            $fcM.Classi[$iM].Indirizzi.Count -eq 2)
        # un file copiato vale per l'etichetta di allora
        $fcM.Classi[$iM].Copiato = $true
        $fcM.Classi[$iM].CopiatoPer = 'Le mie classi/3B'
        $copiatoPrima = $fcM.CopiatoAdesso($iM)
        $fcM.Madre = 'Classi 2026-27'
        $iM2 = Indice $fcM '3B'
        Verifica "un file copiato per un'altra madre e' da copiare di nuovo" ($copiatoPrima -and -not $fcM.CopiatoAdesso($iM2))
        Verifica "e chiudendo senza ""Usa queste classi"" la finestra dice che cosa si perde ('$($fcM.DaPerdere())')" (
            $fcM.DaPerdere() -match 'Classe_3B\.gs' -and $fcM.DaPerdere() -match 'Usa queste classi')
        $fcM.Dispose()
        $fcN = NuovaFC $s10
        Verifica "appena aperta invece non c'e' niente da perdere" ($fcN.DaPerdere() -eq '')
        $fcN.Dispose()
        # l'anno con quattro cifre: la madre di un altro anno non e' quella di partenza
        $scelte4A = [Activator]::CreateInstance([type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tScelta))
        $c4A = [Activator]::CreateInstance($tScelta)
        $c4A.Nome = '4A'
        $c4A.Oggetto = '4A'
        $scelte4A.Add($c4A)
        [void](MC 'Applica').Invoke($null, @($s10.PSObject.BaseObject, 'Classi 2026-2027', $scelte4A.PSObject.BaseObject, $true))
        Imposta $s10 'Anno' '2027-2028'
        $fcY = NuovaFC $s10
        Verifica "l'anno dopo, con l'anno scritto con quattro cifre: madre nuova e 'Togli le regole delle classi del 2026-2027' ($($fcY.TestoVecchie()))" (
            $fcY.Madre -eq 'Classi 2027-2028' -and $fcY.TestoVecchie() -eq 'Togli le regole delle classi del 2026-2027 (1)')
        $fcY.Dispose()

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: GLI APPUNTI E LA BOZZA'
        $fcG = NuovaFC $s7
        $txtI = $tFC.GetField('txtIncolla', $FI).GetValue($fcG)
        $aiutoI = [string]$tFC.GetField('AiutoIndirizzi', $FS).GetValue($null)
        Verifica "l'aiuto dice di eliminare il messaggio di Classroom (se no resta una bozza) e della cronologia degli appunti" (
            $aiutoI -match 'cestino' -and $aiutoI -match 'bozze' -and $aiutoI -match 'Win\+V' -and $aiutoI -match 'trascin')
        Verifica "la casella degli indirizzi accetta il testo trascinato, che non passa dagli appunti" ($txtI.AllowDrop)
        $fcG.Trascina('tre@studenti.scuola-esempio.edu.it')
        Verifica "e il testo trascinato vale come incollato" ($fcG.Classi[0].Indirizzi.Count -eq 1)
        Verifica "senza un file copiato, chiudendo non tocca gli appunti" (-not $fcG.AppuntiDaSvuotare())
        $fcG.Dispose()

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: LA CONFIGURAZIONE E L''IMPRONTA'
        $senza = NuovoStato
        AggiungiPersona $senza 'ROSSI MARIO' 'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO' 'mario.rossi@scuola-esempio.edu.it' $true
        AggiungiPersona $senza 'DE LUCA ANNA' 'ASSISTENTE AMMINISTRATIVO' 'anna.deluca@scuola-esempio.edu.it' $true
        $confSenza = Genera $senza $true
        Verifica "senza classi la configurazione non ha unoQualsiasi, ne' il suo commento" (
            -not $confSenza.Contains('unoQualsiasi') -and -not $confSenza.Contains('@CLASSE:'))
        if ($null -ne $mImpronta) {
            Verifica "e l'impronta e' quella della 1.5.3 (E9111A66)" (([string]$mImpronta.Invoke($null, @($senza.PSObject.BaseObject))) -eq 'E9111A66')
        }
        $conClasse = NuovoStato
        $classe = [Activator]::CreateInstance($asm.GetType('Campanella.Regola'))
        $classe.Etichetta = 'Classi 2026-27/3B'
        $classe.Sorgente = 'classe'
        $classe.Da.Add('@CLASSE:3B@')
        foreach ($p in @('3B', '3 B', 'III B')) { $classe.Oggetto.Add($p) }
        $classe.UnoQualsiasi = $true
        (Leggi $conClasse 'Regole').Add($classe)
        $fileC = Join-Path $temporanea 'Configurazione_classe.gs'
        Scrivi $fileC (Genera $conClasse $false)
        $cc = (LeggiConfigurazione $fileC).CONFIG
        $letta = @($cc.regole | Where-Object { $_.etichetta -eq 'Classi 2026-27/3B' })[0]
        Verifica "con una classe: unoQualsiasi true, il segnaposto, le parole" (
            $letta.unoQualsiasi -eq $true -and ($letta.da -join '|') -eq '@CLASSE:3B@' -and ($letta.oggetto -join '|') -eq '3B|3 B|III B')
        Verifica "e le altre regole senza unoQualsiasi" (@($cc.regole | Where-Object { $null -ne $_.unoQualsiasi }).Count -eq 1)
        $classe.UnoQualsiasi = $false
        $impSenzaUno = [string]$mImpronta.Invoke($null, @($conClasse))
        $classe.UnoQualsiasi = $true
        Verifica "unoQualsiasi cambia l'impronta" (([string]$mImpronta.Invoke($null, @($conClasse))) -ne $impSenzaUno)

        # il motore vero con la configurazione generata, con e senza il file della classe
        $anteprimaClassiJs = Join-Path $temporanea 'anteprima_classi.js'
        Scrivi $anteprimaClassiJs @'
const vm = require('vm'), fs = require('fs');
const contesto = vm.createContext({
  GmailApp: { search: () => [], getUserLabelByName: () => null },
  PropertiesService: { getUserProperties: () => ({ getProperty: () => null }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'docente@scuola.example' }) },
  Logger: { log: () => {} }
});
const [conf, motore, ...classi] = process.argv.slice(2);
vm.runInContext(fs.readFileSync(conf, 'utf8'), contesto, { filename: 'Configurazione.gs' });
for (const f of classi) vm.runInContext(fs.readFileSync(f, 'utf8'), contesto, { filename: f });
vm.runInContext(fs.readFileSync(motore, 'utf8'), contesto, { filename: 'Organizzazione_Gmail.gs' });
const regola = contesto.CONFIG.regole.find(r => r.unoQualsiasi);
process.stdout.write(JSON.stringify({ anteprima: contesto.PASSO_1_anteprima(),
  ricerche: contesto._queryDellaRegola_(contesto.CONFIG, regola).length }));
'@
        $senzaFile = (& node $anteprimaClassiJs $fileC $motore) | ConvertFrom-Json
        $conFile = (& node $anteprimaClassiJs $fileC $motore $file3B $file4A) | ConvertFrom-Json
        Verifica "nel motore, senza il file: una ricerca (l'oggetto), e l'anteprima dice che manca Classe_3B.gs" (
            $senzaFile.ricerche -eq 1 -and ($senzaFile.anteprima -replace '\s+', ' ').Contains('manca il file Classe_3B.gs: conta solo l''oggetto'))
        Verifica "con i file: tre ricerche, e l'anteprima dice 25 indirizzi e nessuno di loro" (
            $conFile.ricerche -eq 3 -and ($conFile.anteprima -replace '\s+', ' ').Contains('studenti della 3B: 25 indirizzi, dal file Classe_3B.gs') -and
            @($studenti | Where-Object { $conFile.anteprima.Contains($_) }).Count -eq 0)

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: I FILTRI DI GMAIL'
        # Per una classe i filtri veri di Gmail cercano solo l'oggetto: gli
        # studenti nei filtri resterebbero nelle impostazioni dell'account anche
        # cancellando il file. FiltriDiCampanella, che non conosce gli studenti,
        # e' quindi proprio quello dello script, con il file e senza. Un filtro
        # con gli studenti (fatto a mano, o da una versione di prova) nella
        # finestra non si puo' spuntare: non finisce ne' nello Stato ne' in
        # Configurazione.gs.
        $filtriClassiJs = Join-Path $temporanea 'filtri_classi.js'
        Scrivi $filtriClassiJs @'
const vm = require('vm'), fs = require('fs');
const contesto = vm.createContext({});
const [conf, motore, ...classi] = process.argv.slice(2);
vm.runInContext(fs.readFileSync(conf, 'utf8'), contesto, { filename: 'Configurazione.gs' });
for (const f of classi) vm.runInContext(fs.readFileSync(f, 'utf8'), contesto, { filename: f });
vm.runInContext(fs.readFileSync(motore, 'utf8'), contesto, { filename: 'Organizzazione_Gmail.gs' });
const cfg = contesto.CONFIG, filtri = [];
contesto._regoleAttive_(cfg).forEach(r => {
  if (r.escludiEtichette && r.escludiEtichette.length) return;
  contesto._criteriFiltro_(cfg, r).forEach(c => {
    const nome = contesto._etichettaCompleta_(cfg, r);
    const chiave = nome.trim().toLowerCase() + Object.keys(c).sort()
      .map(k => '\n' + k + '=' + String(c[k] === true ? 'true' : c[k]).replace(/\s+/g, ' ').trim()).join('');
    filtri.push({ etichetta: nome, criteri: c, chiave });
  });
});
process.stdout.write(JSON.stringify({ filtri: filtri }));
'@
        $tFiltriG = $asm.GetType('Campanella.FiltriGmail')
        $mDiC = $tFiltriG.GetMethod('FiltriDiCampanella', $FS)
        $delCsharp = @($mDiC.Invoke($null, @($conClasse.PSObject.BaseObject)) | ForEach-Object { $_.Chiave() } | Sort-Object)
        $motoreSenza = @(((& node $filtriClassiJs $fileC $motore) | ConvertFrom-Json).filtri)
        $motoreCon = @(((& node $filtriClassiJs $fileC $motore $file3B) | ConvertFrom-Json).filtri)
        Verifica "senza il file, i filtri del C# sono proprio quelli dello script ($($motoreSenza.Count))" (
            ($delCsharp -join "`n|") -eq (@($motoreSenza | ForEach-Object { $_.chiave } | Sort-Object) -join "`n|"))
        Verifica "e con il file anche: gli studenti non vanno nei filtri, e il C# e lo script sono uguali ($($motoreCon.Count))" (
            ($delCsharp -join "`n|") -eq (@($motoreCon | ForEach-Object { $_.chiave } | Sort-Object) -join "`n|") -and
            -not ((ConvertTo-Json -InputObject $motoreCon -Depth 5) -match 'terzab'))
        # l'esportazione di Gmail con quei filtri, e due con gli studenti della 3B
        # fatti a mano (o da una versione di prova)
        $nomiExp = @{ from = 'from'; subject = 'subject'; query = 'hasTheWord' }
        $conStudenti = @($motoreCon) + @(
            @{ etichetta = 'Scuola/Classi 2026-27/3B'; criteri = [pscustomobject]@{ from = (@($studenti)[0..19] -join ' OR ') } },
            @{ etichetta = 'Scuola/Classi 2026-27/3B'; criteri = [pscustomobject]@{ from = (@($studenti)[20..24] -join ' OR ') } })
        $vociC = foreach ($f in $conStudenti) {
            $p = @()
            foreach ($k in $f.criteri.PSObject.Properties) {
                $p += "<apps:property name='$($nomiExp[$k.Name])' value='$([System.Security.SecurityElement]::Escape([string]$k.Value))'/>"
            }
            $p += "<apps:property name='label' value='$([System.Security.SecurityElement]::Escape($f.etichetta))'/>"
            '<entry><category term=''filter''></category><title>Mail Filter</title>' + ($p -join '') + '</entry>'
        }
        # e un filtro di una classe dell'anno prima, le cui regole non ci sono piu'
        $vociC += "<entry><category term='filter'></category><title>Mail Filter</title><apps:property name='from' " +
                  "value='vecchio.studente@$dominioStudenti'/><apps:property name='label' value='Classi 2025-26/3B'/></entry>"
        $espC = "<?xml version='1.0' encoding='UTF-8'?><feed xmlns='http://www.w3.org/2005/Atom' " +
                "xmlns:apps='http://schemas.google.com/apps/2006'><title>Mail Filters</title>" + ($vociC -join '') + '</feed>'
        $lettiC = @($tFiltriG.GetMethod('Leggi', $FS, $null, [Type[]]@([string]), $null).Invoke($null, @([string]$espC)))
        $mConfrontaC = $tFiltriG.GetMethod('Confronta', $FS, $null, [Type[]]@($asm.GetType('Campanella.FiltroGmail'), $tStato), $null)
        $mPartenzaC = $tFiltriG.GetMethod('DiPartenza', $FS)
        $tipi = @($lettiC | ForEach-Object {
            $x = $mConfrontaC.Invoke($null, @($_.PSObject.BaseObject, $conClasse))
            $_.Etichetta + '=' + $x.Tipo + '|' + [bool]$mPartenzaC.Invoke($null, @($_.PSObject.BaseObject, $x)) })
        $classiT = @($tipi | Where-Object { $_ -like '*Classi 202*' })
        Verifica "i filtri delle classi non partono mai spuntati; quelli con gli studenti sono 'di una classe' ($($classiT -join '; '))" (
            ($classiT -join ';') -eq ('Scuola/Classi 2026-27/3B=campanella|False;Scuola/Classi 2026-27/3B=classe|False;' +
                                      'Scuola/Classi 2026-27/3B=classe|False;Classi 2025-26/3B=classe|False'))
        $ffC = [Activator]::CreateInstance($asm.GetType('Campanella.FormFiltriGmail'), @($conClasse.PSObject.BaseObject))
        $ffC.Carica($lettiC)
        for ($i = 0; $i -lt $lettiC.Count; $i++) { $ffC.Spunta($i, $true) }
        $sceltiC = @($ffC.SceltiAdesso())
        $conIndirizzi = @($sceltiC | Where-Object { (@($_.Criteri.Values) -join ' ') -match '@' -and $_.Etichetta -like '*Classi 202*' })
        Verifica "nella finestra, nemmeno spuntandoli a mano, i filtri con gli studenti non si scelgono (scelti: $($sceltiC.Count))" (
            $conIndirizzi.Count -eq 0 -and @($sceltiC | Where-Object { $_.Etichetta -eq 'Scuola/Classi 2026-27/3B' }).Count -eq 1)
        $ffC.Dispose()

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: I FILTRI CON GLI STUDENTI, SOTTO QUALUNQUE ETICHETTA MADRE'
        # L'etichetta madre si scrive a mano, e l'anno di Cartelle e' testo
        # libero: un filtro con gli studenti si riconosce anche quando le regole
        # delle classi non ci sono piu' (tolte a fine anno) o stanno sotto
        # un'altra madre. Campanella si ricorda le madri usate per le classi
        # (solo i nomi); e ogni etichetta che sembra di una classe (3B, 3B LSA)
        # o sta sotto una madre con "classi" nel nome vale come classe.
        $s8 = NuovoStato
        Imposta $s8 'Prefisso' ''
        Imposta $s8 'Anno' '2026-2027'
        function Classi8([string[]]$nomi) {
            $l = [Activator]::CreateInstance([type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tScelta))
            foreach ($n in $nomi) {
                $c = [Activator]::CreateInstance($tScelta)
                $c.Nome = $n
                $c.Oggetto = $n
                $l.Add($c)
            }
            return ,$l
        }
        # a fine agosto, senza l'anno di Cartelle, la madre e' gia' dell'anno che
        # comincia, come per lo script (un file Classe_*.gs copiato ad agosto e'
        # dell'anno nuovo): le regole fatte il 28 agosto il 24 settembre si
        # ritrovano, e quelle dell'anno prima sono le vecchie
        $mAl = MC 'MadreDiPartenzaAl'
        function MadreIl($st, [string]$giorno) {
            if ($null -eq $mAl) { return '(manca MadreDiPartenzaAl)' }
            return [string]$mAl.Invoke($null, @($st.PSObject.BaseObject, [datetime]$giorno))
        }
        $sAgo = NuovoStato
        Imposta $sAgo 'Prefisso' ''
        Imposta $sAgo 'Anno' ''
        [void](MC 'Applica').Invoke($null, @($sAgo.PSObject.BaseObject, 'Classi 2025-26', (Classi8 @('3B')).PSObject.BaseObject, $false))
        $madre28 = MadreIl $sAgo '2026-08-28'
        [void](MC 'Applica').Invoke($null, @($sAgo.PSObject.BaseObject, $madre28, (Classi8 @('4A')).PSObject.BaseObject, $true))
        $madre24 = MadreIl $sAgo '2026-09-24'
        $madre31 = MadreIl $sAgo '2026-07-31'
        $regoleAgo = @((Leggi $sAgo 'Regole') | Where-Object { $_.Sorgente -eq 'classe' } | ForEach-Object { $_.Etichetta }) -join ','
        Verifica "senza l'anno di Cartelle, il 28 agosto la madre e' gia' dell'anno che comincia ($madre28), il 24 settembre la stessa ($madre24): le regole di agosto si ritrovano ($regoleAgo)" (
            $madre28 -eq 'Classi 2026-27' -and $madre24 -eq 'Classi 2026-27' -and $madre31 -eq 'Classi 2025-26' -and
            $regoleAgo -eq 'Classi 2026-27/4A' -and [string](MC 'AnnoDelleClassi').Invoke($null, @([datetime]'2026-08-01')) -eq '2026-27')
        $madrePartenza = [string](MC 'MadreDiPartenza').Invoke($null, @($s8.PSObject.BaseObject))
        foreach ($m in @($madrePartenza, 'Le mie classi', 'Corsi')) {
            $nomi = if ($m -eq 'Corsi') { @('Potenziamento') } else { @('3B') }
            [void](MC 'Applica').Invoke($null, @($s8.PSObject.BaseObject, [string]$m, (Classi8 $nomi).PSObject.BaseObject, $false))
        }
        # l'anno dopo: tolte tutte le regole delle classi degli anni prima
        [void](MC 'Applica').Invoke($null, @($s8.PSObject.BaseObject, 'Classi 2027-2028', (Classi8 @()).PSObject.BaseObject, $true))
        Verifica "le regole delle classi di prima sono tolte ($madrePartenza, Le mie classi, Corsi)" (
            @((Leggi $s8 'Regole') | Where-Object { $_.Sorgente -eq 'classe' }).Count -eq 0)
        $alunni = 'anna.rossi@studenti.scuola-esempio.edu.it OR luca.verdi@studenti.scuola-esempio.edu.it'
        $etichetteStudenti = @('Classi/3B', 'Le mie classi 2026-27/3B', 'Classi 2026-2027/3B', 'Classi 2026/27/3B',
                               'Classi a.s. 2026-27/3B', 'Classi  2026-27/3B', 'Le mie classi/3B', 'Terze/3B LSA',
                               'Corsi/Potenziamento', '3B', 'Scuola/Le mie Classi/Terze/Potenziamento')
        $voci8 = @($etichetteStudenti | ForEach-Object {
            "<entry><category term='filter'></category><title>Mail Filter</title><apps:property name='from' " +
            "value='$alunni'/><apps:property name='label' value='$_'/></entry>" })
        # un filtro tuo, con gli indirizzi delle famiglie: quello si sceglie
        $voci8 += "<entry><category term='filter'></category><title>Mail Filter</title><apps:property name='from' " +
                  "value='genitori@famiglie.example'/><apps:property name='label' value='Famiglie'/></entry>"
        $esp8 = "<?xml version='1.0' encoding='UTF-8'?><feed xmlns='http://www.w3.org/2005/Atom' " +
                "xmlns:apps='http://schemas.google.com/apps/2006'><title>Mail Filters</title>" + ($voci8 -join '') + '</feed>'
        $letti8 = @($tFiltriG.GetMethod('Leggi', $FS, $null, [Type[]]@([string]), $null).Invoke($null, @([string]$esp8)))
        $tipi8 = @($letti8 | ForEach-Object { $_.Etichetta + '=' + $mConfrontaC.Invoke($null, @($_.PSObject.BaseObject, $s8)).Tipo })
        $nonClasse = @($tipi8 | Select-Object -First $etichetteStudenti.Count | Where-Object { $_ -notlike '*=classe' })
        Verifica "senza piu' le regole delle classi, i filtri con gli studenti sono 'di una classe' sotto ogni madre, quello delle famiglie no ($($tipi8[-1]))$(if ($nonClasse.Count) { ': no ' + ($nonClasse -join '; ') })" (
            $nonClasse.Count -eq 0 -and $tipi8[-1] -ne 'Famiglie=classe')
        $ff8 = [Activator]::CreateInstance($asm.GetType('Campanella.FormFiltriGmail'), @($s8.PSObject.BaseObject))
        $ff8.Carica($letti8)
        for ($i = 0; $i -lt $letti8.Count; $i++) { $ff8.Spunta($i, $true) }
        $scelti8 = @($ff8.SceltiAdesso())
        $ff8.Dispose()
        Verifica "spuntandoli tutti si sceglie solo quello delle famiglie ($(@($scelti8 | ForEach-Object { $_.Etichetta }) -join ', '))" (
            $scelti8.Count -eq 1 -and $scelti8[0].Etichetta -eq 'Famiglie')
        $lista8 = [Activator]::CreateInstance([type]::GetType('System.Collections.Generic.List`1').MakeGenericType(
            $asm.GetType('Campanella.FiltroDaTogliere')))
        foreach ($x in $scelti8) { $lista8.Add($x) }
        Imposta $s8 'FiltriDaTogliere' $lista8
        $conf8 = Genera $s8 $false
        Verifica "e nella configurazione non c'e' nessuno studente" (-not $conf8.Contains('studenti.scuola-esempio'))
        # la madre cambiata a meta' anno: la regola c'e', sotto "Classi 2026-27"
        $s9 = NuovoStato
        Imposta $s9 'Prefisso' ''
        [void](MC 'Applica').Invoke($null, @($s9.PSObject.BaseObject, 'Classi 2026-27', (Classi8 @('3B')).PSObject.BaseObject, $false))
        $vecchiaMadre = @($letti8 | Where-Object { $_.Etichetta -eq 'Terze/3B LSA' -or $_.Etichetta -eq 'Le mie classi/3B' })
        $tipi9 = @($vecchiaMadre | ForEach-Object { $mConfrontaC.Invoke($null, @($_.PSObject.BaseObject, $s9)).Tipo })
        Verifica "con la regola sotto un'altra madre, gli stessi filtri sono 'di una classe', non 'simili' ($($tipi9 -join ', '))" (
            ($tipi9 -join ',') -eq 'classe,classe')

        # le etichette tue con un numero, o con "Classico": non sono classi. "classi"
        # conta come parola intera, e dopo numero e sezione c'e' al massimo
        # un'articolazione (LSA, L.S.A.), non "per mille" o "Praga"
        function Esportazione([string[]]$etichette, [string]$da) {
            $v = @($etichette | ForEach-Object {
                "<entry><category term='filter'></category><title>Mail Filter</title><apps:property name='from' " +
                "value='$da'/><apps:property name='label' value='$_'/></entry>" })
            $x = "<?xml version='1.0' encoding='UTF-8'?><feed xmlns='http://www.w3.org/2005/Atom' " +
                 "xmlns:apps='http://schemas.google.com/apps/2006'><title>Mail Filters</title>" + ($v -join '') + '</feed>'
            return @($tFiltriG.GetMethod('Leggi', $FS, $null, [Type[]]@([string]), $null).Invoke($null, @([string]$x)))
        }
        $s11 = NuovoStato
        Imposta $s11 'Prefisso' ''
        $tue = @('Amministrazione/5 per mille', 'Liceo Classico/Open day', 'Gite/5A Praga', 'Sindacato/1 Maggio',
                 'Classici/Letture', 'Viaggi/Parigi', 'Corsi/3 ore', 'Gite/2 giorni', 'Gite/5AINF Praga', 'Corsi/3B 2 gruppi',
                 'Corsi/2gr', 'Gite/5Ainf Praga', 'Archivio/Anno 2025-26', 'Scadenze/2026-27', 'Sindacato/1Maggio',
                 'Corsi/Ore 2025-26')
        $tipi11 = @(Esportazione $tue 'agenzia@viaggi.example' | ForEach-Object {
            $_.Etichetta + '=' + $mConfrontaC.Invoke($null, @($_.PSObject.BaseObject, $s11)).Tipo })
        Verifica "le etichette tue con un numero o con 'Classico' non sembrano di una classe ($($tipi11 -join ', '))" (
            @($tipi11 | Where-Object { $_ -like '*=classe' }).Count -eq 0)
        $delleClassi11 = @('Terze/3B', 'Terze/3 B', 'Terze/3b', 'Terze/3B LSA', 'Terze/3B-LSA', 'Terze/3B (L.S.A.)', 'Terze/III B',
                           'Terze/5AL', 'Le mie Classi/Potenziamento', 'CLASSI/Recupero', 'Classi2026/Recupero', '3B',
                           # le classi dei tecnici, con la sezione attaccata lunga
                           '5AINF', 'Scuola/5AINF', 'Mie/5AINF', 'Terze/3ACAT', 'Scuola/4BAFM', 'Terze/3BLSA', 'Quarte/4AINF LAB',
                           # con le maiuscole miste, con "Classe" o altre parole prima, con l'anno dopo
                           'Scuola/5Ainf', 'Terze/3Acat', 'Scuola/Classe 3B', 'Inglese 3B', 'Scuola/Consiglio di classe 3B LSA',
                           'Scuola/Classe III B', '3B 2025-26', 'Terze/3B (2025-26)', 'Terze/3B a.s. 2025-2026', 'Scuola/Classe 3B 2025-26')
        $tipi11c = @(Esportazione $delleClassi11 $alunni | ForEach-Object {
            $_.Etichetta + '=' + $mConfrontaC.Invoke($null, @($_.PSObject.BaseObject, $s11)).Tipo })
        Verifica "e quelle delle classi si' ($(@($tipi11c | Where-Object { $_ -notlike '*=classe' }) -join ', '))" (
            @($tipi11c | Where-Object { $_ -notlike '*=classe' }).Count -eq 0)
        # un'etichetta come Progetti/2FA sembra comunque quella di una classe: il
        # suggerimento non dice che gli indirizzi sono di studenti
        $dueFA = @(Esportazione @('Progetti/2FA') 'sicurezza@servizi.example')[0]
        $x2FA = $mConfrontaC.Invoke($null, @($dueFA.PSObject.BaseObject, $s11))
        Verifica "per un filtro che sembra di una classe il suggerimento non da' per certo che siano studenti ('$($x2FA.Testo())')" (
            $x2FA.Tipo -eq 'classe' -and $x2FA.Testo() -match '^sembra di una classe e cerca degli indirizzi' -and
            -not ($x2FA.Testo() -match 'indirizzi degli studenti'))

        # un filtro con gli studenti scelto PRIMA (con la 1.5.3, o prima di creare
        # le classi sotto quella madre) non resta scelto: ne' nella finestra, ne'
        # nella configurazione, ne' nello Stato
        $tFDT = $asm.GetType('Campanella.FiltroDaTogliere')
        $tListaFDT = [type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tFDT)
        $s12 = NuovoStato
        Imposta $s12 'Prefisso' ''
        [void](MC 'Applica').Invoke($null, @($s12.PSObject.BaseObject, 'Corsi', (Classi8 @('Potenziamento')).PSObject.BaseObject, $false))
        $conStudenti12 = @($letti8 | Where-Object { $_.Etichetta -eq 'Corsi/Potenziamento' })[0]
        $famiglie12 = @($letti8 | Where-Object { $_.Etichetta -eq 'Famiglie' })[0]
        $prima12 = [Activator]::CreateInstance($tListaFDT)
        $prima12.Add($conStudenti12.DaTogliere())
        $prima12.Add($famiglie12.DaTogliere())
        Imposta $s12 'FiltriDaTogliere' $prima12
        $ff12 = [Activator]::CreateInstance($asm.GetType('Campanella.FormFiltriGmail'), @($s12.PSObject.BaseObject))
        $lblE12 = $asm.GetType('Campanella.FormFiltriGmail').GetField('lblEsito', $FI).GetValue($ff12)
        $scelti12 = @($ff12.SceltiAdesso() | ForEach-Object { $_.Etichetta }) -join ', '
        $esito12 = [string]$lblE12.Text
        Verifica "appena aperta la finestra, quello con gli studenti scelto prima non e' scelto ($scelti12), e lo dice ('$esito12')" (
            $scelti12 -eq 'Famiglie' -and $esito12 -match "1 filtro scelto prima sembra di una classe e cerca degli indirizzi")
        $ff12.Carica($letti8)
        $scelti12 = @($ff12.SceltiAdesso() | ForEach-Object { $_.Etichetta }) -join ', '
        $esito12 = [string]$lblE12.Text
        Verifica "aperto il file, nemmeno ($scelti12), e non dice che nel file non c'e' ('$esito12')" (
            $scelti12 -eq 'Famiglie' -and $esito12 -match "1 filtro scelto prima sembra di una classe" -and
            -not ($esito12 -match "nel file non c'e'"))
        $ff12.Dispose()
        $conf12 = Genera $s12 $false
        Verifica "nella configurazione c'e' solo quello delle famiglie ($([int]$tGen.GetMethod('FiltriDaTogliere', $FS).Invoke($null, @($s12.PSObject.BaseObject))))" (
            -not $conf12.Contains('studenti.scuola-esempio') -and $conf12.Contains('genitori@famiglie.example') -and
            [int]$tGen.GetMethod('FiltriDaTogliere', $FS).Invoke($null, @($s12.PSObject.BaseObject)) -eq 1)
        $mTogliC = $tFiltriG.GetMethod('TogliQuelliDelleClassi', $FS)
        $tolti12 = if ($null -ne $mTogliC) { [int]$mTogliC.Invoke($null, @($s12.PSObject.BaseObject)) } else { -1 }
        Verifica "e dallo Stato (all'avvio) si tolgono, cosi' non restano nel file dei dati ($tolti12)" (
            $tolti12 -eq 1 -and (@((Leggi $s12 'FiltriDaTogliere') | ForEach-Object { $_.Etichetta }) -join ',') -eq 'Famiglie')
        # anche quelli delle classi dei tecnici (5AINF, 3ACAT, 4BAFM), con gli studenti fra i mittenti
        $s14 = NuovoStato
        Imposta $s14 'Prefisso' ''
        $prima14 = [Activator]::CreateInstance($tListaFDT)
        foreach ($f in @(Esportazione @('3B', '5AINF', '3ACAT', 'Scuola/4BAFM') $alunni)) { $prima14.Add($f.DaTogliere()) }
        $prima14.Add($famiglie12.DaTogliere())
        Imposta $s14 'FiltriDaTogliere' $prima14
        $tolti14 = if ($null -ne $mTogliC) { [int]$mTogliC.Invoke($null, @($s14.PSObject.BaseObject)) } else { -1 }
        $conf14 = Genera $s14 $false
        Verifica "e quelli delle classi dei tecnici (5AINF, 3ACAT, Scuola/4BAFM) come quello della 3B ($tolti14 su 4)" (
            $tolti14 -eq 4 -and (@((Leggi $s14 'FiltriDaTogliere') | ForEach-Object { $_.Etichetta }) -join ',') -eq 'Famiglie' -and
            -not $conf14.Contains('studenti.scuola-esempio'))
        # e quelli con la classe scritta in un altro modo: con "Classe" o una materia
        # prima, con l'anno dopo, con le maiuscole miste
        $s15 = NuovoStato
        Imposta $s15 'Prefisso' ''
        $prima15 = [Activator]::CreateInstance($tListaFDT)
        $etichette15 = @('Scuola/Classe 3B', 'Inglese 3B', '3B 2025-26', 'Scuola/5Ainf')
        foreach ($f in @(Esportazione $etichette15 $alunni)) { $prima15.Add($f.DaTogliere()) }
        $prima15.Add($famiglie12.DaTogliere())
        Imposta $s15 'FiltriDaTogliere' $prima15
        $tolti15 = if ($null -ne $mTogliC) { [int]$mTogliC.Invoke($null, @($s15.PSObject.BaseObject)) } else { -1 }
        $conf15 = Genera $s15 $false
        Verifica "e quelli di $($etichette15 -join ', ') ($tolti15 su 4): gli studenti non restano ne' nello Stato ne' nella configurazione" (
            $tolti15 -eq 4 -and (@((Leggi $s15 'FiltriDaTogliere') | ForEach-Object { $_.Etichetta }) -join ',') -eq 'Famiglie' -and
            -not $conf15.Contains('studenti.scuola-esempio'))
        $guscioCs = Get-Content -Raw (Join-Path $radice 'src\Guscio.cs')
        Verifica "all'avvio Campanella li toglie subito dopo aver letto le impostazioni, e si ricorda quanti" (
            [regex]::IsMatch($guscioCs, 'Stato s = Stato\.Carica\(\);\s+s\.FiltriClassiToltiAllAvvio = FiltriGmail\.TogliQuelliDelleClassi\(s\);'))
        # e lo dice: la finestra dei filtri, aperta dopo l'avvio, conta anche
        # quelli tolti all'avvio, che nello Stato non ci sono piu'
        $campoTolti = $tStato.GetField('FiltriClassiToltiAllAvvio', $FI)
        if ($null -ne $campoTolti) { $campoTolti.SetValue($s12.PSObject.BaseObject, $tolti12) }
        $ff12b = [Activator]::CreateInstance($asm.GetType('Campanella.FormFiltriGmail'), @($s12.PSObject.BaseObject))
        $esito12b = [string]$asm.GetType('Campanella.FormFiltriGmail').GetField('lblEsito', $FI).GetValue($ff12b).Text
        $ff12b.Dispose()
        Verifica "la finestra dei filtri aperta dopo l'avvio dice quello tolto all'avvio ('$esito12b')" (
            $null -ne $campoTolti -and $esito12b -match "1 filtro scelto prima sembra di una classe e cerca degli indirizzi")
        # il numero non si salva: al prossimo avvio non c'e' piu' niente da togliere, e niente da dire
        $statoCs = Get-Content -Raw (Join-Path $radice 'src\Stato.cs')
        Verifica "e il numero non va nei file delle impostazioni e dei dati (Stato.cs lo nomina solo dove lo dichiara)" (
            ([regex]::Matches($statoCs, 'FiltriClassiToltiAllAvvio')).Count -eq 1 -and
            [regex]::IsMatch($statoCs, 'public int FiltriClassiToltiAllAvvio = 0;'))
        # scelto prima, e le classi create dopo sotto quella madre: li toglie "Usa queste classi", e lo dice
        $s13 = NuovoStato
        Imposta $s13 'Prefisso' ''
        $prima13 = [Activator]::CreateInstance($tListaFDT)
        $prima13.Add($conStudenti12.DaTogliere())
        $prima13.Add($famiglie12.DaTogliere())
        Imposta $s13 'FiltriDaTogliere' $prima13
        $esito13 = [string](MC 'Applica').Invoke($null, @($s13.PSObject.BaseObject, 'Corsi', (Classi8 @('Potenziamento')).PSObject.BaseObject, $false))
        Verifica "creando le classi sotto la sua madre, 'Usa queste classi' lo toglie dai filtri da togliere e lo dice ('$esito13')" (
            (@((Leggi $s13 'FiltriDaTogliere') | ForEach-Object { $_.Etichetta }) -join ',') -eq 'Famiglie' -and
            $esito13 -match "1 filtro di Gmail scelto prima sembra di una classe" -and -not ($esito13 -match 'studenti\.scuola'))

        # -------------------------------------------------------------------
        Intestazione 'LE MIE CLASSI: LA REGOLA DI UNA CLASSE NELLA SUA FINESTRA'
        # "Modifica" al passo 4: la spunta "basta uno dei due" e, al posto dei
        # mittenti, il segnaposto della classe, che non si cambia da li'
        $tFR = $asm.GetType('Campanella.FormRegola')
        $FIn2 = [System.Reflection.BindingFlags]'NonPublic,Instance'
        $chkUnoF = $tFR.GetField('chkUno', $FIn2)
        Verifica "la finestra della regola ha la spunta 'Basta uno dei due'" ($null -ne $chkUnoF)
        if ($null -ne $chkUnoF) {
            $fr = [Activator]::CreateInstance($tFR, @($classe.PSObject.BaseObject))
            $spunta = $chkUnoF.GetValue($fr)
            $txtDaF = [string]$tFR.GetField('txtDa', $FIn2).GetValue($fr).Text
            Verifica "per una classe e' spuntata, dice che cosa vuol dire, e i mittenti sono il segnaposto, da non toccare" (
                $spunta.Checked -and $spunta.Text -eq "Basta uno dei due: l'oggetto oppure i mittenti" -and
                $txtDaF.StartsWith('@CLASSE:3B@') -and $txtDaF.Contains('Classe_3B.gs') -and
                $tFR.GetField('txtDa', $FIn2).GetValue($fr).ReadOnly)
            $elimina = @($fr.Controls | Where-Object { $_ -is [System.Windows.Forms.Button] -and $_.Text -eq 'Elimina regola' })
            Verifica "e si puo' eliminare, come le regole tue" ($elimina.Count -eq 1)
            $spunta.Checked = $false
            $composta = $tFR.GetMethod('Componi', $FIn2).Invoke($fr, @())
            Verifica "tolta la spunta, la regola ha i criteri insieme; il segnaposto resta" (
                -not $composta.UnoQualsiasi -and ($composta.Da -join '|') -eq '@CLASSE:3B@' -and $composta.Sorgente -eq 'classe')
            $tFR.GetField('txtOggetto', $FIn2).GetValue($fr).Text = "3B`r`nanna.rossi@studenti.scuola-esempio.edu.it`r`nIII B"
            $composta = $tFR.GetMethod('Componi', $FIn2).Invoke($fr, @())
            Verifica "e per una classe un indirizzo scritto fra le parole dell'oggetto non entra ($($composta.Oggetto -join '|'))" (
                ($composta.Oggetto -join '|') -eq '3B|III B')
            $fr.Dispose()
            $nuovaR = [Activator]::CreateInstance($tFR, @($null))
            $chkUnoF.GetValue($nuovaR).Checked = $true
            $tFR.GetField('txtDa', $FIn2).GetValue($nuovaR).Text = "a@scuola-esempio.edu.it"
            $tFR.GetField('txtOggetto', $FIn2).GetValue($nuovaR).Text = "verbale"
            $composta = $tFR.GetMethod('Componi', $FIn2).Invoke($nuovaR, @())
            Verifica "in una regola nuova la spunta parte tolta, e messa vale" (
                $composta.UnoQualsiasi -and ($composta.Da -join '|') -eq 'a@scuola-esempio.edu.it')
            $nuovaR.Dispose()
        }

        # gli indirizzi si copiano fuori dalla cronologia degli appunti, e non si salvano su file
        $dialoghi = Get-Content -Raw (Join-Path $radice 'src\Dialoghi.cs')
        $inizioFC = $dialoghi.IndexOf('class FormClassi')
        $fineFC = $dialoghi.IndexOf("`n    class ", $inizioFC + 10)
        $testoFC = if ($inizioFC -ge 0 -and $fineFC -gt $inizioFC) { $dialoghi.Substring($inizioFC, $fineFC - $inizioFC) } else { '' }
        Verifica "la finestra delle classi copia con Guscio.MettiNegliAppunti, senza Clipboard.SetText ne' file su disco" (
            $testoFC -ne '' -and $testoFC.Contains('Guscio.MettiNegliAppunti(') -and -not $testoFC.Contains('Clipboard.Set') -and
            -not $testoFC.Contains('SaveFileDialog') -and -not ($testoFC -match 'File\.(Write|Append|Create)'))
    }

    # -----------------------------------------------------------------------
    Intestazione 'NOMI STRANI: NIENTE ESCE DA STRINGHE E COMMENTI'
    $strano = NuovoStato
    $a_capo = [string][char]0x2028
    AggiungiPersona $strano ('ROSSI */ MARIO' + $a_capo + 'var INIETTATO = 1;') 'DOCENTE' 'mario.rossi@scuola-esempio.edu.it' $true
    AggiungiPersona $strano ("BIANCHI`nvar INIETTATO2 = 2;") "ASSISTENTE`r`nAMMINISTRATIVO" 'anna.bianchi@scuola-esempio.edu.it' $true
    $regole = Leggi $strano 'Regole'
    $regole[2].Etichetta = 'Circolari "urgenti" \ tutte'
    $regole[2].Descrizione = "prima riga`n*/ var INIETTATO3 = 3; /*"
    $file4 = Join-Path $temporanea 'Configurazione_strana.gs'
    Scrivi $file4 (Genera $strano $true)
    $letta = LeggiConfigurazione $file4
    Verifica "si carica lo stesso, e definisce solo CONFIG" ($null -ne $letta.CONFIG -and $letta.altri.Count -eq 0)
    Verifica "l'etichetta con virgolette e barre arriva identica" (
        @($letta.CONFIG.regole | Where-Object { $_.etichetta -eq 'Circolari "urgenti" \ tutte' }).Count -eq 1)
    Verifica "i due indirizzi ci sono" ($letta.CONFIG.personale.Count -eq 2)

    # -----------------------------------------------------------------------
    Intestazione 'LE PAROLE DELL''OGGETTO DI UNA REGOLA'
    $mSpezza = $asm.GetType('Campanella.FormRegola').GetMethod('Spezza', $FS)
    $parole = $mSpezza.Invoke($null, @([string]"(urgente)`r`nverbale`r`n`r`n(urgente)`r`n  consiglio di classe  "))
    Verifica "una parola fra parentesi resta, una volta sola" (
        $parole.Count -eq 3 -and $parole[0] -eq '(urgente)' -and $parole[1] -eq 'verbale' -and
        $parole[2] -eq 'consiglio di classe')
    $avviso = $mSpezza.Invoke($null, @([string]'(i mittenti di questa regola si scrivono nella pagina "La tua scuola")'))
    Verifica "l'avviso al posto dei mittenti non diventa un mittente" ($avviso.Count -eq 0)

    # -----------------------------------------------------------------------
    Intestazione 'GLI INDIRIZZI DEI COLLEGHI: NIENTE CRONOLOGIE'
    # gli appunti veri non si toccano: si guarda l'oggetto che Campanella ci metterebbe
    $dati = $asm.GetType('Campanella.Guscio').GetMethod('PerGliAppunti', $FS).Invoke($null, @([string]'a@scuola-esempio.edu.it, b@scuola-esempio.edu.it'))
    $formati = $dati.GetFormats()
    Verifica "il testo c'e'" ($dati.GetData([System.Windows.Forms.DataFormats]::UnicodeText) -eq 'a@scuola-esempio.edu.it, b@scuola-esempio.edu.it')
    Verifica "fuori dai programmi che guardano gli appunti" ($formati -contains 'ExcludeClipboardContentFromMonitorProcessing')
    foreach ($f in @('CanIncludeInClipboardHistory', 'CanUploadToCloudClipboard')) {
        $v = $dati.GetData($f)
        $byte = if ($v -is [System.IO.MemoryStream]) { $v.ToArray() } else { $null }
        Verifica "$f = 0 (un DWORD a zero)" ($null -ne $byte -and $byte.Length -eq 4 -and ($byte | Where-Object { $_ -ne 0 }).Count -eq 0)
    }
    # e come lo vedrebbe Windows: la stessa strada (IDataObject, HGLOBAL) che
    # usa il sistema quando Campanella lascia il testo negli appunti
    Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class ComeLoVedeWindows
{
    [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
    [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
    [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr h);
    [DllImport("ole32.dll")] static extern void ReleaseStgMedium(ref STGMEDIUM m);

    // i byte che Windows riceve per quel formato quando rende gli appunti
    public static byte[] Byte(object dati, string formato)
    {
        IDataObject com = (IDataObject)dati;
        FORMATETC fe = new FORMATETC();
        fe.cfFormat = unchecked((short)(ushort)System.Windows.Forms.DataFormats.GetFormat(formato).Id);
        fe.dwAspect = DVASPECT.DVASPECT_CONTENT;
        fe.lindex = -1;
        fe.tymed = TYMED.TYMED_HGLOBAL;
        STGMEDIUM m;
        com.GetData(ref fe, out m);
        if (m.tymed != TYMED.TYMED_HGLOBAL || m.unionmember == IntPtr.Zero) return null;
        try
        {
            IntPtr p = GlobalLock(m.unionmember);
            int n = (int)GlobalSize(m.unionmember).ToUInt64();
            byte[] b = new byte[n];
            Marshal.Copy(p, b, 0, n);
            GlobalUnlock(m.unionmember);
            return b;
        }
        finally { ReleaseStgMedium(ref m); }
    }
}
'@
    foreach ($f in @('ExcludeClipboardContentFromMonitorProcessing', 'CanIncludeInClipboardHistory', 'CanUploadToCloudClipboard')) {
        $b = [ComeLoVedeWindows]::Byte($dati, $f)
        Verifica "per Windows $f e' un DWORD che vale 0" (
            $null -ne $b -and $b.Length -ge 4 -and [BitConverter]::ToInt32($b, 0) -eq 0)
    }
    $url = $tGen.GetMethod('NuovoMessaggioGmail', $FS).Invoke($null, @([string]'io@scuola-esempio.edu.it'))
    Verifica "il collegamento a Gmail porta solo il tuo account" (
        $url -eq 'https://mail.google.com/mail/?view=cm&fs=1&authuser=io%40scuola-esempio.edu.it')
    $senza = $tGen.GetMethod('NuovoMessaggioGmail', $FS).Invoke($null, @([string]''))
    Verifica "e senza account nemmeno quello" ($senza -eq 'https://mail.google.com/mail/?view=cm&fs=1')
    $pagina = Get-Content -Raw (Join-Path $radice 'src\PaginaPosta.cs')
    Verifica "nessun indirizzo nei collegamenti: niente bcc=, cc= o to= nel codice della pagina" (
        -not ($pagina -match '[&?](bcc|cc|to)='))
    Verifica "e niente Clipboard.SetText, che finirebbe nella cronologia" (-not $pagina.Contains('Clipboard.SetText'))

    # -----------------------------------------------------------------------
    Intestazione 'L''ESTENSIONE PORTA LA VERSIONE DI CAMPANELLA'
    $versione = $asm.GetType('Campanella.Aggiornamenti').GetField('VersioneCampanella', $FS).GetValue($null)
    $risorsa = $asm.GetType('Campanella.Guscio').GetMethod('LeggiRisorsa', $FS).Invoke($null, @([string]'estensione_manifest.json'))
    $scritto = $tGen.GetMethod('ManifestEstensione', $FS).Invoke($null, @([string]$risorsa, [string]$versione)) | ConvertFrom-Json
    $originale = $risorsa | ConvertFrom-Json
    Verifica "il manifest scritto ha la versione dell'app ($versione)" ($scritto.version -eq $versione)
    Verifica "e per Chrome e' una versione valida" ($scritto.version -match '^\d{1,5}(\.\d{1,5}){0,3}$')
    Verifica "il resto non cambia" ($scritto.name -eq $originale.name -and
        (@($scritto.permissions) -join ',') -eq (@($originale.permissions) -join ','))
    Verifica "ed e' quello che scrive il pulsante Estensione..." (
        $pagina.Contains('GeneratorePosta.ManifestEstensione(testo, Aggiornamenti.VersioneCampanella)'))

    # -----------------------------------------------------------------------
    Intestazione 'UNA SOLA FUNZIONE DI ESCAPE PER JAVASCRIPT'
    $pagina = Get-Content -Raw (Join-Path $radice 'src\PaginaPosta.cs')
    $generatore = Get-Content -Raw (Join-Path $radice 'src\GeneratorePosta.cs')
    Verifica "PaginaPosta non ha piu' una sua copia di Js()" (-not ($pagina -match 'static\s+string\s+Js\s*\('))
    Verifica "il generatore usa quella di AnalisiOrario" (
        $generatore.Contains('AnalisiOrario.Js(') -and -not ($generatore -match 'static\s+string\s+Js\s*\('))
}
finally {
    Remove-Item -Recurse -Force $temporanea
}

# ---------------------------------------------------------------------------
Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
