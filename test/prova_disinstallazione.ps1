<#
    prova_disinstallazione.ps1 - la disinstallazione toglie solo quello che
    deve, e le impostazioni solo se l'utente lo chiede

        .\test\prova_disinstallazione.ps1

    Compila i sorgenti dell'installer C# (src-installer\Installa.cs e i
    quattro file di src che usa) come libreria, in una cartella temporanea,
    e fa girare Disinstallatore.TogliFile su cartelle finte, anche queste
    temporanee: nessuna installazione vera viene toccata, e non serve
    dist\Campanella.exe. Poi confronta i file delle impostazioni che toglie
    l'installer C# con quelli che toglie installer\Campanella.iss.

    Esce con 1 se una prova fallisce.
#>
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'Compilatore C# non trovato: manca il .NET Framework 4.x.' }

$script:fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}

$prova = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-prova-disinstallazione-' + (Get-Random))
New-Item -ItemType Directory -Force $prova | Out-Null
try {
    # --- l'installer come libreria --------------------------------------------
    $dll = Join-Path $prova 'Installa.dll'
    $sorgenti = @(
        (Join-Path $radice 'src-installer\Installa.cs')
        (Join-Path $radice 'src\Tema.cs')
        (Join-Path $radice 'src\Consenso.cs')
        (Join-Path $radice 'src\Stato.cs')
        (Join-Path $radice 'src\Aggiornamenti.cs')
    )
    $uscita = & $csc /nologo /target:library /codepage:65001 "/out:$dll" `
        /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll `
        /r:System.Web.Extensions.dll $sorgenti 2>&1
    if ($LASTEXITCODE -ne 0) { $uscita | ForEach-Object { Write-Host $_ }; throw "Compilazione dell'installer fallita." }
    Add-Type -AssemblyName System.Windows.Forms
    # dai byte, non dal file: cosi' la cartella temporanea si cancella alla fine
    $asm = [System.Reflection.Assembly]::Load([System.IO.File]::ReadAllBytes($dll))
    $FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
    $tDis = $asm.GetType('Campanella.Disinstallatore')
    $mTogli = $tDis.GetMethod('TogliFile', $FS)
    $impostazioni = @($tDis.GetField('FileImpostazioni', $FS).GetValue($null))
    $documenti = @($asm.GetType('Campanella.ProgrammaInstallazione').GetField('Documenti', $FS).GetValue($null)) + 'PRIVACY.txt'

    # una cartella come la lascia l'installazione, dopo qualche giorno d'uso
    function Cartella($nome, [switch]$ConTmp, [switch]$ConAltro) {
        $c = Join-Path $prova $nome
        New-Item -ItemType Directory -Force (Join-Path $c 'documenti') | Out-Null
        foreach ($f in @('Campanella.exe', 'ISTRUZIONI - Campanella.txt', 'PRIVACY.md',
                         'Disinstalla Campanella.exe', 'campanella.json', 'struttura.json')) {
            Set-Content -LiteralPath (Join-Path $c $f) -Value 'prova'
        }
        foreach ($d in $documenti) { Set-Content -LiteralPath (Join-Path $c "documenti\$d") -Value 'prova' }
        # lasciato da un salvataggio interrotto a meta'
        if ($ConTmp) { Set-Content -LiteralPath (Join-Path $c 'campanella.json.tmp') -Value '{"classi":"1A"}' }
        if ($ConAltro) { Set-Content -LiteralPath (Join-Path $c 'appunti miei.txt') -Value 'non e'' dell''installazione' }
        return $c
    }
    function Togli($cartella, $ancheImpostazioni) {
        $problemi = New-Object 'System.Collections.Generic.List[string]'
        $mTogli.Invoke($null, [object[]]@([string]$cartella, [bool]$ancheImpostazioni, $problemi.PSObject.BaseObject)) | Out-Null
        return ,$problemi
    }
    function Resta($cartella, $nome) { return Test-Path -LiteralPath (Join-Path $cartella $nome) }

    Write-Host "`n=== CON LE IMPOSTAZIONI ===" -ForegroundColor Cyan
    Verifica "le impostazioni da togliere comprendono campanella.json.tmp" ($impostazioni -contains 'campanella.json.tmp')
    $c = Cartella 'tutto' -ConTmp
    $p = Togli $c $true
    Verifica "nessun problema" ($p.Count -eq 0)
    Verifica "via campanella.json" (-not (Resta $c 'campanella.json'))
    Verifica "via anche campanella.json.tmp, che ha gli stessi dati" (-not (Resta $c 'campanella.json.tmp'))
    Verifica "e la cartella, rimasta vuota" (-not (Test-Path -LiteralPath $c))

    $c = Cartella 'con-altro' -ConTmp -ConAltro
    $p = Togli $c $true
    Verifica "un file che non e' dell'installazione resta" ((Resta $c 'appunti miei.txt') -and $p.Count -eq 0)
    Verifica "e tutto il resto se ne va" (@(Get-ChildItem -LiteralPath $c -Recurse -File).Count -eq 1)

    Write-Host "`n=== SENZA LE IMPOSTAZIONI ===" -ForegroundColor Cyan
    $c = Cartella 'senza' -ConTmp
    $p = Togli $c $false
    Verifica "via il programma" (-not (Resta $c 'Campanella.exe') -and -not (Resta $c 'Disinstalla Campanella.exe'))
    Verifica "le impostazioni restano, .tmp compreso" (
        (Resta $c 'campanella.json') -and (Resta $c 'campanella.json.tmp') -and (Resta $c 'struttura.json'))

    Write-Host "`n=== INNO SETUP TOGLIE GLI STESSI FILE ===" -ForegroundColor Cyan
    $iss = [System.IO.File]::ReadAllText((Join-Path $radice 'installer\Campanella.iss'))
    $blocco = [regex]::Match($iss, '(?s)procedure CurUninstallStepChanged.*?\bend;\s*\bend;')
    Verifica "c'e' la disinstallazione di Inno Setup" $blocco.Success
    $daInno = @([regex]::Matches($blocco.Value, "DeleteFile\(ExpandConstant\('\{app\}\\([^']+)'\)\)") |
                ForEach-Object { $_.Groups[1].Value } | Sort-Object)
    $daCs = @($impostazioni | Sort-Object)
    Write-Host "  Inno: $($daInno -join ', ')"
    Write-Host "  C#:   $($daCs -join ', ')"
    Verifica "Inno Setup e l'installer C# tolgono le stesse impostazioni" (($daInno -join '|') -eq ($daCs -join '|'))
}
finally {
    Remove-Item -Recurse -Force -LiteralPath $prova -ErrorAction SilentlyContinue
}

Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
