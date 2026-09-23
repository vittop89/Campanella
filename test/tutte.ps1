<#
    tutte.ps1 - lancia una dopo l'altra le prove che girano nella CI e alla
    fine dice quali sono passate e quali no.

        .\test\tutte.ps1                                  le prove della CI
        .\test\tutte.ps1 -ConGrafica                      piu' le due che aprono finestre
        .\test\tutte.ps1 -Solo prova_versioni,mock_orari  solo quelle indicate

    Prima serve .\build.ps1: le prove PowerShell usano dist\Campanella.exe, e
    se l'exe manca o e' piu' vecchio dei sorgenti non partono (risultano
    fallite, con il motivo). Servono anche Node (18 o successivo) e Python 3,
    per prova_anonimizzazione.ps1.

    Una prova dell'elenco che manca e' un fallimento, non si salta.
    prova_installer.ps1 non c'e' mai: installa e disinstalla davvero, e va
    lanciata a mano su un computer senza Campanella.

    Esce con 1 se anche una sola prova fallisce, con 0 se passano tutte.
#>
param(
    # nomi delle prove, con o senza estensione, anche separati da virgole
    [string[]]$Solo = @(),
    # aggiunge prova_disposizione.ps1 e prova_solalettura.ps1, che aprono finestre
    [switch]$ConGrafica
)
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cartellaProve = Join-Path $radice 'test'

# --- le prove della CI, nell'ordine in cui girano ---------------------------
$elenco = @(
    'mock_apps_script.js'
    'mock_orari.js'
    'mock_moduli.js'
    'mock_pannello.js'
    'prova_gemelli.js'
    'nomi_funzioni.js'
    'invarianti_script.js'
    'prova_orario.ps1'
    'prova_xlsx.ps1'
    'prova_moduli.ps1'
    'prova_personale.ps1'
    'prova_stato.ps1'
    'prova_posta.ps1'
    'prova_cartelle.ps1'
    'prova_versioni.ps1'
    'prova_anonimizzazione.ps1'
)
# aprono finestre sullo schermo: solo con -ConGrafica, mai nella CI
$conFinestre = @('prova_disposizione.ps1', 'prova_solalettura.ps1')
# non usano l'eseguibile compilato (prova_versioni lo usa solo se c'e')
$senzaExe = @('prova_versioni.ps1')

$tutte = @($elenco)
if ($ConGrafica) { $tutte += $conFinestre }

# --- la scelta di -Solo ---------------------------------------------------------
$scelte = @($Solo | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
if ($scelte.Count -gt 0) {
    $daFare = @()
    foreach ($s in $scelte) {
        $nome = @(($elenco + $conFinestre) | Where-Object { $_ -eq $s -or [IO.Path]::GetFileNameWithoutExtension($_) -eq $s })
        if ($nome.Count -eq 0) {
            Write-Host "Non conosco la prova '$s'. Quelle che so lanciare:" -ForegroundColor Red
            ($elenco + $conFinestre) | ForEach-Object { Write-Host "  $_" }
            exit 1
        }
        if ($daFare -notcontains $nome[0]) { $daFare += $nome[0] }
    }
} else {
    $daFare = $tutte
}

# --- l'eseguibile deve essere compilato dai sorgenti di adesso -----------------
$exe = Join-Path $radice 'dist\Campanella.exe'
$exeVecchio = ''
if (-not (Test-Path -LiteralPath $exe)) {
    $exeVecchio = 'manca dist\Campanella.exe: compila con .\build.ps1'
} else {
    $sorgenti = @(Get-ChildItem -LiteralPath (Join-Path $radice 'src') -Recurse -File) +
                @(Get-ChildItem -LiteralPath (Join-Path $radice 'docs') -Filter *.md -File) +
                @(Get-Item -LiteralPath (Join-Path $radice 'PRIVACY.md'))
    $recente = $sorgenti | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($recente.LastWriteTime -gt (Get-Item -LiteralPath $exe).LastWriteTime) {
        $exeVecchio = "dist\Campanella.exe e' piu' vecchio di $($recente.Name): ricompila con .\build.ps1"
    }
}

function Esegui([string]$nome) {
    $percorso = Join-Path $cartellaProve $nome
    if (-not (Test-Path -LiteralPath $percorso)) { return 'manca il file test\' + $nome }
    if ($nome -like '*.ps1' -and $senzaExe -notcontains $nome -and $exeVecchio -ne '') { return $exeVecchio }
    # le prove scrivono anche su stderr: qui conta solo il codice d'uscita.
    # Out-Host: quello che stampano va sullo schermo, non nel valore della funzione
    $ErrorActionPreference = 'Continue'
    Push-Location $radice
    try {
        if ($nome -like '*.js') {
            if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return 'node non trovato' }
            & node $percorso | Out-Host
        } else {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $percorso | Out-Host
        }
        if ($LASTEXITCODE -ne 0) { return "uscita con codice $LASTEXITCODE" }
        return ''
    } catch {
        return "non partita: $($_.Exception.Message)"
    } finally {
        Pop-Location
    }
}

$esiti = @()
foreach ($nome in $daFare) {
    Write-Host "`n############ $nome ############" -ForegroundColor Cyan
    $partenza = Get-Date
    $motivo = Esegui $nome
    $secondi = [math]::Round(((Get-Date) - $partenza).TotalSeconds, 1)
    if ($motivo -ne '') {
        Write-Host "FALLITA: $nome ($motivo)" -ForegroundColor Red
        # nei log di GitHub Actions diventa un'annotazione in cima all'esecuzione
        if ($env:GITHUB_ACTIONS -eq 'true') { Write-Host "::error title=Prova fallita::$nome - $motivo" }
    }
    $esiti += New-Object PSObject -Property @{ Nome = $nome; Motivo = $motivo; Secondi = $secondi }
}

Write-Host "`n=== RIEPILOGO ===" -ForegroundColor Cyan
foreach ($e in $esiti) {
    if ($e.Motivo -eq '') { Write-Host ("  OK       {0,-28} {1,6} s" -f $e.Nome, $e.Secondi) }
    else { Write-Host ("  FALLITA  {0,-28} {1}" -f $e.Nome, $e.Motivo) -ForegroundColor Red }
}
$fallite = @($esiti | Where-Object { $_.Motivo -ne '' }).Count
Write-Host ""
if ($fallite -eq 0) {
    Write-Host "Tutte le $($esiti.Count) prove superate." -ForegroundColor Green
    exit 0
}
Write-Host "PROVE FALLITE: $fallite su $($esiti.Count)" -ForegroundColor Red
exit 1
