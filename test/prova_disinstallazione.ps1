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

    Prova anche quali cartelle il disinstallatore accetta (anche senza
    Campanella.exe, purche' ci sia lui) e cosa fa con l'installazione Inno
    nella stessa cartella. Le chiavi del registro sono finte, sotto
    HKEY_CURRENT_USER\Software\CampanellaProva, e alla fine si cancellano:
    quelle vere di Campanella e di Inno non vengono ne' lette ne' toccate.

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
# le chiavi finte del registro: tutte qui sotto, cancellate alla fine
$radiceChiavi = 'Software\CampanellaProva'
$chiaviProva = 'HKCU:\' + $radiceChiavi
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
    function Togli($cartella, $ancheImpostazioni, [switch]$SoloDisinstallatore) {
        $problemi = New-Object 'System.Collections.Generic.List[string]'
        $mTogli.Invoke($null, [object[]]@([string]$cartella, [bool]$ancheImpostazioni,
                                          [bool]$SoloDisinstallatore, $problemi.PSObject.BaseObject)) | Out-Null
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

    Write-Host "`n=== QUALI CARTELLE ACCETTA ===" -ForegroundColor Cyan
    # Campanella.exe puo' mancare: l'ha tolto la disinstallazione Inno nella
    # stessa cartella, o l'antivirus. Rifiutando anche la cartella del
    # disinstallatore stesso, la sua voce fra le app installate non si
    # toglieva piu'
    $mDelDis = $tDis.GetMethod('CartellaDelDisinstallatore', $FS)
    $mDaTogliere = $tDis.GetMethod('CartellaDaTogliere', $FS)
    Verifica "c'e' il controllo della cartella del disinstallatore" ($mDelDis -ne $null -and $mDaTogliere -ne $null)
    if ($mDelDis -ne $null -and $mDaTogliere -ne $null) {
        function DelDis($c) { return $mDelDis.Invoke($null, [object[]]@([string]$c)) }
        function DaTogliere($c, $registrata) { return $mDaTogliere.Invoke($null, [object[]]@([string]$c, [string]$registrata)) }

        $soloDis = Join-Path $prova 'solo disinstallatore'
        New-Item -ItemType Directory -Force $soloDis | Out-Null
        Set-Content -LiteralPath (Join-Path $soloDis 'Disinstalla Campanella.exe') -Value 'prova'
        Set-Content -LiteralPath (Join-Path $soloDis 'campanella.json') -Value '{}'
        $soloExe = Join-Path $prova 'solo programma'
        New-Item -ItemType Directory -Force $soloExe | Out-Null
        Set-Content -LiteralPath (Join-Path $soloExe 'Campanella.exe') -Value 'prova'
        $estranea = Join-Path $prova 'cartella qualunque'
        New-Item -ItemType Directory -Force $estranea | Out-Null
        Set-Content -LiteralPath (Join-Path $estranea 'appunti miei.txt') -Value 'prova'

        Verifica "senza Campanella.exe, ma con il disinstallatore: accettata" (DelDis $soloDis)
        Verifica "con Campanella.exe: accettata" (DelDis $soloExe)
        Verifica "senza nessuno dei due: rifiutata" (-not (DelDis $estranea))
        Verifica "una cartella che non c'e': rifiutata" (-not (DelDis (Join-Path $prova 'non esiste')))
        # /rimuovi prende la cartella dalla riga di comando: con il solo
        # disinstallatore deve anche essere quella scritta nel registro
        # dall'installazione. Con Campanella.exe va bene come prima, anche
        # senza la voce (tolta da una disinstallazione precedente)
        Verifica "/rimuovi: solo il disinstallatore, ma e' la cartella registrata (scritta in un altro modo)" (
            DaTogliere $soloDis ($soloDis.ToUpperInvariant() + '\'))
        Verifica "/rimuovi: solo il disinstallatore, senza niente nel registro: rifiutata" (-not (DaTogliere $soloDis ''))
        Verifica "/rimuovi: solo il disinstallatore, registrata un'altra cartella: rifiutata" (-not (DaTogliere $soloDis $soloExe))
        Verifica "/rimuovi: con Campanella.exe, accettata come prima" (DaTogliere $soloExe '')
        Verifica "/rimuovi: registrata ma senza Campanella ne' disinstallatore, rifiutata" (-not (DaTogliere $estranea $estranea))
    }

    Write-Host "`n=== LA VOCE FRA LE APP INSTALLATE ===" -ForegroundColor Cyan
    # Una cartella rifiutata lasciava la chiave di disinstallazione: la voce
    # restava per sempre. Adesso si toglie, se punta proprio a quella cartella
    $mRegistrata = $tDis.GetMethod('CartellaRegistrata', $FS)
    $mTogliChiave = $tDis.GetMethod('TogliChiave', $FS)
    Verifica "c'e' la pulizia della chiave" ($mRegistrata -ne $null -and $mTogliChiave -ne $null)
    if ($mRegistrata -ne $null -and $mTogliChiave -ne $null) {
        $chiave = $radiceChiavi + '\Uninstall\Campanella'
        New-Item -Path ('HKCU:\' + $chiave) -Force | Out-Null
        Set-ItemProperty -Path ('HKCU:\' + $chiave) -Name 'InstallLocation' -Value $soloDis
        Set-ItemProperty -Path ('HKCU:\' + $chiave) -Name 'DisplayName' -Value 'Campanella (prova)'
        Verifica "legge la cartella registrata" (($mRegistrata.Invoke($null, [object[]]@($chiave))) -eq $soloDis)
        Verifica "una chiave che non c'e' non dice niente" (
            ($mRegistrata.Invoke($null, [object[]]@($radiceChiavi + '\Non esiste'))) -eq '')
        $tolta = $mTogliChiave.Invoke($null, [object[]]@($chiave, [string]$estranea))
        Verifica "punta a un'altra cartella: la chiave resta" ((-not $tolta) -and (Test-Path ('HKCU:\' + $chiave)))
        $tolta = $mTogliChiave.Invoke($null, [object[]]@($chiave, [string]($soloDis + '\')))
        Verifica "punta a questa cartella: la chiave se ne va" ($tolta -and -not (Test-Path ('HKCU:\' + $chiave)))
    }

    Write-Host "`n=== INNO NELLA STESSA CARTELLA ===" -ForegroundColor Cyan
    # Con l'installazione Inno nella stessa cartella, programma, istruzioni,
    # documenti e impostazioni sono anche suoi: il disinstallatore C# toglieva
    # Campanella.exe e la voce Inno restava con un programma che non c'era piu'
    $mCartelleInno = $tDis.GetMethod('CartelleInno', $FS)
    $mInnoQui = $tDis.GetMethod('InnoQui', $FS)
    Verifica "c'e' il controllo della cartella di Inno" ($mCartelleInno -ne $null -and $mInnoQui -ne $null)
    if ($mCartelleInno -ne $null -and $mInnoQui -ne $null) {
        $chiaveInno = $radiceChiavi + '\Uninstall\Inno_is1'
        function CartelleInno { return ,($mCartelleInno.Invoke($null, [object[]]@($chiaveInno))) }
        function InnoQui($elenco, $cartella) {
            $l = New-Object 'System.Collections.Generic.List[string]'
            foreach ($e in $elenco) { $l.Add([string]$e) }
            return $mInnoQui.Invoke($null, [object[]]@($l.PSObject.BaseObject, [string]$cartella))
        }
        Verifica "senza la chiave di Inno: nessuna installazione Inno" ((CartelleInno).Count -eq 0)
        $c = Cartella 'con inno'
        foreach ($f in @('unins000.exe', 'unins000.dat', 'LICENSE.txt')) {
            Set-Content -LiteralPath (Join-Path $c $f) -Value 'di Inno'
        }
        New-Item -Path ('HKCU:\' + $chiaveInno) -Force | Out-Null
        Set-ItemProperty -Path ('HKCU:\' + $chiaveInno) -Name 'InstallLocation' -Value ($c + '\')
        $letta = CartelleInno
        Verifica "legge InstallLocation di Inno (con la barra in fondo)" ($letta.Count -eq 1 -and (InnoQui $letta $c))
        Set-ItemProperty -Path ('HKCU:\' + $chiaveInno) -Name 'Inno Setup: App Path' -Value $c
        $letta = CartelleInno
        Verifica "legge 'Inno Setup: App Path'" ($letta.Count -eq 1 -and $letta[0] -eq $c)
        Verifica "Inno in un'altra cartella: non e' qui" (-not (InnoQui @($estranea) $c))
        Verifica "nessuna installazione Inno: non e' qui" (-not (InnoQui @() $c))
        Verifica "una chiave Inno che non dice dove: nel dubbio e' qui" (InnoQui @('') $c)

        $p = Togli $c $true -SoloDisinstallatore
        Verifica "nessun problema" ($p.Count -eq 0)
        Verifica "via Disinstalla Campanella.exe" (-not (Resta $c 'Disinstalla Campanella.exe'))
        Verifica "Campanella.exe, istruzioni e PRIVACY.md restano" (
            (Resta $c 'Campanella.exe') -and (Resta $c 'ISTRUZIONI - Campanella.txt') -and (Resta $c 'PRIVACY.md'))
        Verifica "le impostazioni restano, anche chiedendo di toglierle" (
            (Resta $c 'campanella.json') -and (Resta $c 'struttura.json'))
        Verifica "i documenti restano" (@($documenti | Where-Object { -not (Resta $c "documenti\$_") }).Count -eq 0)
        Verifica "e i file di Inno pure" ((Resta $c 'unins000.exe') -and (Resta $c 'unins000.dat') -and (Resta $c 'LICENSE.txt'))
    }

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
    Remove-Item -Recurse -Force -LiteralPath $chiaviProva -ErrorAction SilentlyContinue
}

Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
