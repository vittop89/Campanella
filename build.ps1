<#
    build.ps1 - compila Campanella

    Uso:
        .\build.ps1                 compila l'app e l'installer in .\dist
        .\build.ps1 -SenzaInstaller solo l'applicazione (piu' veloce, per le prove)
        .\build.ps1 -Firma          compila e firma con il certificato locale
        .\build.ps1 -Pubblica -Produzione 'D:\Campanella'
                                    compila, firma e copia nella cartella indicata

    -Firma e -Pubblica usano strumenti\firma.ps1, che la prima volta crea un
    certificato nei certificati di questo utente e lo rende attendibile per
    lui (leggi la sua intestazione). L'exe viene firmato prima di essere
    messo dentro l'installer, e se una firma non riesce ci si ferma: niente
    file non firmati in produzione.

    Non serve Visual Studio: usa il compilatore C# incluso in Windows
    (.NET Framework 4.x). Attenzione: e' il compilatore di C# 5, quindi
    niente interpolazione $"...", niente ?. e niente nameof.

    Dentro l'eseguibile finiscono, come risorse incorporate:
      - gli script Apps Script e la funzione per la Console (src\risorse);
      - i tre file dell'estensione per Chrome (src\risorse\estensione_personale);
      - i documenti per dirigenza e DPO (docs) e PRIVACY.md, cosi' ci sono
        anche quando l'applicazione e' copiata a mano senza installer.
#>
param(
    [switch]$Firma,
    [switch]$Pubblica,
    [switch]$SenzaInstaller,
    # la cartella in cui -Pubblica copia i file: nessun valore predefinito
    [string]$Produzione = ''
)

$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent $MyInvocation.MyCommand.Path

# prima di compilare e soprattutto prima di firmare, che installa un certificato
if ($Pubblica) {
    if ($Produzione.Trim() -eq '') {
        throw "Con -Pubblica serve -Produzione, la cartella in cui copiare i file: per esempio  .\build.ps1 -Pubblica -Produzione 'D:\Campanella'"
    }
    if (-not [IO.Path]::IsPathRooted($Produzione)) {
        throw "-Produzione deve essere un percorso completo, con l'unita': $Produzione"
    }
    $unita = [IO.Path]::GetPathRoot($Produzione)
    if (-not (Test-Path -LiteralPath $unita)) { throw "L'unita' di -Produzione non c'e': $unita" }
    if (Test-Path -LiteralPath $Produzione -PathType Leaf) { throw "-Produzione e' un file, non una cartella: $Produzione" }
} elseif ($Produzione -ne '') {
    Write-Warning "-Produzione serve solo con -Pubblica: la ignoro."
}

function Firma($file) {
    & (Join-Path $radice 'strumenti\firma.ps1') -File $file -Nome 'Campanella'
    if ($LASTEXITCODE -ne 0) { throw "Firma di $file non riuscita (codice $LASTEXITCODE): mi fermo." }
}
$src    = Join-Path $radice 'src'
$dist   = Join-Path $radice 'dist'
$exe    = Join-Path $dist 'Campanella.exe'

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'Compilatore C# non trovato: manca il .NET Framework 4.x.' }

if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

# --- risorse condivise fra applicazione e installer -------------------------
# nome della risorsa -> file su disco. I nomi dei documenti sono quelli con cui
# vengono scritti nella cartella "documenti": devono coincidere con Guscio.Doc*
# e con ProgrammaInstallazione.Documenti.
$documenti = [ordered]@{
    'Nota tecnica per dirigente e DPO.txt' = (Join-Path $radice 'docs\Nota-tecnica-DS-DPO.md')
    'Email per dirigente e DPO.txt'        = (Join-Path $radice 'docs\Email-DS-DPO.md')
    'GDPR - cosa vale per un docente.txt'  = (Join-Path $radice 'docs\GDPR-e-DPO.md')
}
$privacy    = Join-Path $radice 'PRIVACY.md'
$istruzioni = Join-Path $radice 'ISTRUZIONI - Campanella.txt'
foreach ($f in @($privacy, $istruzioni) + @($documenti.Values)) {
    if (-not (Test-Path $f)) { throw "Manca $f" }
}

Write-Host 'Compilo...' -ForegroundColor Cyan

$sorgenti = Get-ChildItem -Path $src -Filter *.cs -File | ForEach-Object { $_.FullName }
$risorse  = @(
    'Organizzazione_Gmail.gs'
    'estrai_personale_spaggiari.js'
    'Orari.gs'
    # l'intestazione di Calendario.gs, la versione solo calendario di Orari.gs (SoloCalendario.cs)
    'Calendario_intestazione.txt'
    'Moduli.gs'
    'Pannello.gs'
)
$estensione = @('manifest.json', 'popup.html', 'popup.js')

$argomenti = @(
    '/nologo'
    '/target:winexe'
    '/optimize+'
    '/codepage:65001'
    "/out:$exe"
    "/win32manifest:$(Join-Path $src 'app.manifest')"
    '/r:System.dll'
    '/r:System.Core.dll'
    '/r:System.Drawing.dll'
    '/r:System.Windows.Forms.dll'
    '/r:System.Web.Extensions.dll'
    '/r:System.Xml.dll'
    '/r:System.IO.Compression.dll'
    '/r:System.IO.Compression.FileSystem.dll'
)
foreach ($r in $risorse) {
    $argomenti += "/resource:$(Join-Path $src "risorse\$r"),$r"
}
foreach ($e in $estensione) {
    $argomenti += "/resource:$(Join-Path $src "risorse\estensione_personale\$e"),estensione_$e"
}
foreach ($nome in $documenti.Keys) {
    $argomenti += "/resource:$($documenti[$nome]),$nome"
}
$argomenti += "/resource:$privacy,PRIVACY.txt"
$argomenti += $sorgenti

& $csc $argomenti
if ($LASTEXITCODE -ne 0) { throw "Compilazione fallita (codice $LASTEXITCODE)." }

$dim = [math]::Round((Get-Item $exe).Length / 1KB, 1)
Write-Host "OK  ->  $exe  ($dim KB)" -ForegroundColor Green

# l'exe si firma adesso, prima che l'installer ne prenda una copia
if ($Firma -or $Pubblica) { Firma $exe }

# le istruzioni stanno nel repository: in dist ne va una copia per chi
# distribuisce l'eseguibile senza installer
Copy-Item $istruzioni -Destination $dist -Force

# --- installer -------------------------------------------------------------
# Un secondo eseguibile che si porta dentro il primo come risorsa. Installa
# nel profilo dell'utente, quindi niente diritti di amministratore e niente UAC.
$setup = Join-Path $dist 'Installa Campanella.exe'
if (-not $SenzaInstaller) {
    Write-Host "Preparo l'installer..." -ForegroundColor Cyan

    # l'installer usa soltanto questi file dell'applicazione
    $sorgentiSetup = @(
        (Join-Path $radice 'src-installer\Installa.cs')
        (Join-Path $src 'Tema.cs')
        (Join-Path $src 'Consenso.cs')
        (Join-Path $src 'Stato.cs')
        (Join-Path $src 'Aggiornamenti.cs')
    )

    $argSetup = @(
        '/nologo'
        '/target:winexe'
        '/optimize+'
        '/codepage:65001'
        "/out:$setup"
        "/win32manifest:$(Join-Path $radice 'src-installer\app.manifest')"
        '/r:System.dll'
        '/r:System.Core.dll'
        '/r:System.Drawing.dll'
        '/r:System.Windows.Forms.dll'
        '/r:System.Web.Extensions.dll'
        "/resource:$exe,Campanella.exe"
        "/resource:$istruzioni,ISTRUZIONI - Campanella.txt"
        "/resource:$privacy,PRIVACY.md"
    )
    foreach ($nome in $documenti.Keys) {
        $argSetup += "/resource:$($documenti[$nome]),$nome"
    }
    $argSetup += $sorgentiSetup

    & $csc $argSetup
    if ($LASTEXITCODE -ne 0) { throw "Compilazione dell'installer fallita (codice $LASTEXITCODE)." }

    $dimSetup = [math]::Round((Get-Item $setup).Length / 1KB, 1)
    Write-Host "OK  ->  $setup  ($dimSetup KB)" -ForegroundColor Green

    if ($Firma -or $Pubblica) { Firma $setup }
}

if ($Pubblica) {
    if (-not (Test-Path $Produzione)) { New-Item -ItemType Directory -Path $Produzione | Out-Null }
    Copy-Item $exe -Destination $Produzione -Force
    # solo l'installer compilato (e firmato) adesso, non uno vecchio rimasto in dist
    if (-not $SenzaInstaller) { Copy-Item $setup -Destination $Produzione -Force }
    Copy-Item $istruzioni -Destination $Produzione -Force
    # PRIVACY.md sta accanto all'exe: chi apre la cartella lo trova subito
    Copy-Item $privacy -Destination $Produzione -Force
    # la struttura delle cartelle e' per utente: se in dist ce n'e' una, la porto con me
    $struttura = Join-Path $dist 'struttura.json'
    if (Test-Path $struttura) { Copy-Item $struttura -Destination $Produzione -Force }
    Write-Host "Pubblicato in: $Produzione" -ForegroundColor Green
    Get-ChildItem $Produzione | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}} | Format-Table -AutoSize
}
