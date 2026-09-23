<#
    prova_versioni.ps1 - controlla che i numeri e i testi che vanno cambiati
    insieme lo siano davvero. Legge soltanto: non compila e non scrive niente.

        .\test\prova_versioni.ps1

    Va lanciata prima di creare il tag di un rilascio; la lancia anche il
    flusso di rilascio, prima di compilare. Controlla:
      - Consenso.Versione (src\Consenso.cs) e #define ConsensoVersione
        (installer\Campanella.iss);
      - Consenso.Testo e installer\CONDIZIONI-it.txt, a meno di spazi, a capo
        e lettere accentate (nel sorgente C# sono scritte con l'apostrofo);
      - l'impronta delle condizioni, italiane e inglesi, per ogni versione del
        consenso: un testo cambiato senza alzare la versione fa fallire la
        prova, perche' chi l'ha gia' accettato non lo rileggerebbe;
      - la versione del prodotto nei punti in cui e' scritta a mano;
      - la costante di versione degli script Google cambiati dall'ultimo
        rilascio (serve git con i tag: senza, il controllo viene saltato);
      - i nomi dei documenti per dirigente e DPO in build.ps1, Guscio.cs,
        Installa.cs e Campanella.iss;
      - se dist\Campanella.exe e' gia' compilato, che la finestra delle
        condizioni chieda due spunte e che "Rileggile" la apra in sola
        lettura (la costruisce senza mostrarla).
#>
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# ---------------------------------------------------------------------------
#  LE IMPRONTE DELLE CONDIZIONI, UNA RIGA PER VERSIONE DEL CONSENSO
#  SHA-256 del testo normalizzato (vedi Normalizza). Quando il testo cambia:
#  alza Consenso.Versione e #define ConsensoVersione, poi aggiungi qui la riga
#  nuova con le impronte che questa prova stampa. Le righe vecchie restano:
#  dicono che cosa e' stato accettato con ogni versione.
# ---------------------------------------------------------------------------
$impronte = @(
    @{ Versione = 3; It = 'caf164d52155ca76b9fbbd8bd9a3499356d5af54e46de5c107deccbb36638cf1'; En = 'f4dfeefe0d7450120dd2e8c2eb7247ec7c7ab96293f613adddb780a4377c3286' }
    @{ Versione = 4; It = '4b3cd7cb31e21d2604a9acdea7b2d6f83c6a8f8a3d8a137629a4ecdb60505bcd'; En = 'db08ae9098b4056ba84e0cd1c30a3ca09a077b066d8ed829a63a7e1d0de38db4' }
)

# Gli script Google con una costante di versione che l'anteprima stampa: se
# uno di questi cambia dall'ultimo rilascio, la costante deve esserci e dire
# la versione del prodotto. Gli altri script vengono controllati solo se
# hanno una costante (var _QUALCOSA_VERSIONE = '...').
$costanti = [ordered]@{
    'Moduli.gs'               = '_MODULO_VERSIONE'
    'Pannello.gs'             = '_PAN_VERSIONE'
    'Organizzazione_Gmail.gs' = '_POSTA_VERSIONE'
    'Orari.gs'                = '_ORARI_VERSIONE'
}

$fallimenti = 0
function Verifica($testo, $ok, $spiegazione) {
    if ($ok) { Write-Host "  OK      $testo" }
    else {
        Write-Host "  FALLITO $testo" -ForegroundColor Red
        if ($spiegazione) { Write-Host "          $spiegazione" -ForegroundColor Yellow }
        $script:fallimenti++
    }
}

function Leggi($relativo) {
    $p = Join-Path $radice $relativo
    if (-not (Test-Path -LiteralPath $p)) { throw "Manca $relativo" }
    return [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
}

function Cerca($testo, $modello, $cosa) {
    $m = [regex]::Match($testo, $modello)
    if (-not $m.Success) { throw "Non trovo $cosa" }
    return $m.Groups[1].Value
}

# Spazi e a capo contano come uno spazio solo; le vocali accentate diventano
# vocale e apostrofo, come nel sorgente C#, che resta ASCII.
$accenti = @(
    @(0x00E0, "a'"), @(0x00E8, "e'"), @(0x00E9, "e'"), @(0x00EC, "i'"), @(0x00F2, "o'"), @(0x00F9, "u'"),
    @(0x00C0, "A'"), @(0x00C8, "E'"), @(0x00C9, "E'"), @(0x00CC, "I'"), @(0x00D2, "O'"), @(0x00D9, "U'")
)
function Normalizza([string]$t) {
    $t = $t.TrimStart([char]0xFEFF)
    foreach ($a in $accenti) { $t = $t.Replace([string][char]$a[0], $a[1]) }
    return ([regex]::Replace($t, '\s+', ' ')).Trim()
}

function Impronta([string]$t) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $byte = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($t))
        return (($byte | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally { $sha.Dispose() }
}

# Il testo di una stringa C# scritta come somma di letterali "..." + "...".
function TestoCSharp([string]$sorgente, [string]$dichiarazione) {
    $inizio = $sorgente.IndexOf($dichiarazione)
    if ($inizio -lt 0) { throw "Non trovo $dichiarazione" }
    $pos = $sorgente.IndexOf('=', $inizio) + 1
    $letterale = New-Object Text.RegularExpressions.Regex('\G(?:\s|\+)*"((?:[^"\\]|\\.)*)"')
    $sb = New-Object Text.StringBuilder
    while ($true) {
        $m = $letterale.Match($sorgente, $pos)
        if (-not $m.Success) { break }
        [void]$sb.Append($m.Groups[1].Value)
        $pos = $m.Index + $m.Length
    }
    if (-not [regex]::IsMatch($sorgente.Substring($pos), '^\s*;')) {
        throw "$dichiarazione non e' fatta solo di letterali: non so leggerla"
    }
    # le sequenze di escape: \r \n \t diventano spazi (poi si normalizza), le altre il carattere
    return [regex]::Replace($sb.ToString(), '\\(.)', {
        param($e)
        $c = $e.Groups[1].Value
        if ($c -ceq 'r' -or $c -ceq 'n' -or $c -ceq 't') { ' ' } else { $c }
    })
}

function PrimaDifferenza([string]$a, [string]$b) {
    $n = [Math]::Min($a.Length, $b.Length)
    $i = 0
    while ($i -lt $n -and $a[$i] -eq $b[$i]) { $i++ }
    $da = [Math]::Max(0, $i - 30)
    return "dal carattere $i`n            sorgente: ..." + $a.Substring($da, [Math]::Min(70, $a.Length - $da)) +
           "`n            file:     ..." + $b.Substring($da, [Math]::Min(70, $b.Length - $da))
}

$consenso = Leggi 'src\Consenso.cs'
$iss      = Leggi 'installer\Campanella.iss'
$guscio   = Leggi 'src\Guscio.cs'
$installa = Leggi 'src-installer\Installa.cs'
$aggiorna = Leggi 'src\Aggiornamenti.cs'
$build    = Leggi 'build.ps1'

# ===========================================================================
Write-Host "`n=== CONSENSO ===" -ForegroundColor Cyan
$versione = [int](Cerca $consenso 'public const int Versione\s*=\s*(\d+)\s*;' 'Consenso.Versione in src\Consenso.cs')
$versioneIss = [int](Cerca $iss '(?m)^#define\s+ConsensoVersione\s+"?(\d+)"?' '#define ConsensoVersione in installer\Campanella.iss')
Write-Host "  Consenso.Versione = $versione, #define ConsensoVersione = $versioneIss"
Verifica "l'installer Inno registra la stessa versione del consenso che chiede l'app" ($versione -eq $versioneIss) `
    "cambia insieme src\Consenso.cs e installer\Campanella.iss"

$testo = Normalizza (TestoCSharp $consenso 'public static readonly string Testo')
$it    = Normalizza (Leggi 'installer\CONDIZIONI-it.txt')
$en    = Normalizza (Leggi 'installer\CONDIZIONI-en.txt')
$uguali = ($testo -ceq $it)
Verifica "Consenso.Testo e installer\CONDIZIONI-it.txt dicono le stesse cose" $uguali `
    $(if (-not $uguali) { 'differiscono ' + (PrimaDifferenza $testo $it) })

$impIt = Impronta $it
$impEn = Impronta $en
Write-Host "  impronta delle condizioni italiane: $impIt"
Write-Host "  impronta delle condizioni inglesi:  $impEn"
$riga = $impronte | Where-Object { $_.Versione -eq $versione } | Select-Object -First 1
$daAggiungere = "@{ Versione = $versione; It = '$impIt'; En = '$impEn' }"
Verifica "le impronte della versione $versione sono nella tabella di questa prova" ($null -ne $riga) `
    "aggiungi alla tabella delle impronte di test\prova_versioni.ps1:  $daAggiungere"
if ($riga) {
    Verifica "il testo italiano e' quello della versione $versione" ($riga.It -eq $impIt) `
        "il testo e' cambiato: alza Consenso.Versione e #define ConsensoVersione, poi aggiungi  @{ Versione = $($versione + 1); It = '$impIt'; En = '...' }"
    Verifica "il testo inglese e' quello della versione $versione" ($riga.En -eq $impEn) `
        "il testo inglese e' cambiato: alza la versione del consenso anche per lui"
}
$precedente = $impronte | Where-Object { $_.Versione -lt $versione } | Sort-Object { $_.Versione } | Select-Object -Last 1
if ($riga -and $precedente) {
    $cambiaIt = ($riga.It -ne $precedente.It)
    $cambiaEn = ($riga.En -ne $precedente.En)
    Verifica "dalla versione $($precedente.Versione) alla $versione sono cambiate tutte e due le lingue" ($cambiaIt -eq $cambiaEn) `
        "e' cambiato il testo $(if ($cambiaIt) { 'italiano' } else { 'inglese' }) ma non l'altro: aggiorna anche l'altro file delle condizioni"
}
$doppie = @($impronte | Group-Object { $_.Versione } | Where-Object { $_.Count -gt 1 })
Verifica "nella tabella delle impronte ogni versione compare una volta sola" ($doppie.Count -eq 0)

# ===========================================================================
Write-Host "`n=== VERSIONE DEL PRODOTTO ===" -ForegroundColor Cyan
$app = Cerca $guscio '\[assembly:\s*AssemblyVersion\("(\d+\.\d+\.\d+)\.0"\)\]' 'AssemblyVersion("x.y.z.0") in src\Guscio.cs'
Write-Host "  versione dell'app (AssemblyVersion di src\Guscio.cs): $app"
$punti = [ordered]@{
    'AssemblyFileVersion in src\Guscio.cs'            = (Cerca $guscio '\[assembly:\s*AssemblyFileVersion\("([\d.]+)"\)\]' 'AssemblyFileVersion in src\Guscio.cs')
    'AssemblyVersion in src-installer\Installa.cs'     = (Cerca $installa '\[assembly:\s*AssemblyVersion\("([\d.]+)"\)\]' 'AssemblyVersion in src-installer\Installa.cs')
    'AssemblyFileVersion in src-installer\Installa.cs' = (Cerca $installa '\[assembly:\s*AssemblyFileVersion\("([\d.]+)"\)\]' 'AssemblyFileVersion in src-installer\Installa.cs')
    'VersioneCampanella in src\Aggiornamenti.cs'      = (Cerca $aggiorna 'VersioneCampanella\s*=\s*"([\d.]+)"' 'VersioneCampanella in src\Aggiornamenti.cs')
    'MyAppVersion in installer\Campanella.iss'        = (Cerca $iss '(?m)^#define\s+MyAppVersion\s+"([\d.]+)"' 'MyAppVersion in installer\Campanella.iss')
}
foreach ($k in $punti.Keys) {
    $v = $punti[$k]
    $atteso = if ($k -like 'Assembly*') { "$app.0" } else { $app }
    Verifica "$k = $v" ($v -eq $atteso) "deve dire $atteso"
}

# ===========================================================================
Write-Host "`n=== SCRIPT GOOGLE ===" -ForegroundColor Cyan
$gs = @(Get-ChildItem (Join-Path $radice 'src\risorse') -Filter *.gs -File)
$modelloCostante = "(?m)^\s*var\s+(_[A-Z]+_VERSIONE)\s*=\s*'([^']*)'"
foreach ($f in $gs) {
    foreach ($m in [regex]::Matches([IO.File]::ReadAllText($f.FullName), $modelloCostante)) {
        $v = $m.Groups[2].Value
        $valida = $v -match '^\d+\.\d+\.\d+$'
        Verifica "$($f.Name): $($m.Groups[1].Value) = '$v' non va oltre la versione dell'app" `
            ($valida -and ([version]$v -le [version]$app)) "deve essere al massimo $app"
    }
}

function DaGit {
    # git scrive gli errori su stderr: con 'Stop' Windows PowerShell li
    # trasformerebbe in eccezioni, qui invece contano solo i codici d'uscita
    $vecchia = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $righe = @(& git -C $radice @args 2>$null)
        return New-Object PSObject -Property @{ Codice = $LASTEXITCODE; Righe = $righe }
    } finally { $ErrorActionPreference = $vecchia }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  SALTATO git non c'e': non so quali script sono cambiati dall'ultimo rilascio" -ForegroundColor DarkGray
} else {
    # l'ultimo rilascio: il tag piu' vicino, ma non quello della versione in
    # preparazione (nel flusso di rilascio il tag punta proprio a questo commit)
    $tag = DaGit describe --tags --abbrev=0
    if ($tag.Codice -eq 0 -and $tag.Righe.Count -gt 0 -and $tag.Righe[0] -eq "v$app") {
        $tag = DaGit describe --tags --abbrev=0 "v$app^"
    }
    if ($tag.Codice -ne 0 -or $tag.Righe.Count -eq 0) {
        Write-Host "  SALTATO nessun tag raggiungibile (copia senza storia?): non so quali script sono cambiati" -ForegroundColor DarkGray
    } else {
        $base = [string]$tag.Righe[0]
        $diff = DaGit diff --name-only $base -- src/risorse
        if ($diff.Codice -ne 0) { throw "git diff $base non riuscito (codice $($diff.Codice))" }
        $cambiati = @($diff.Righe | Where-Object { $_ -match '^src/risorse/[^/]+\.gs$' } | ForEach-Object { Split-Path -Leaf $_ })
        Write-Host "  ultimo rilascio: $base; script cambiati da allora: $(if ($cambiati.Count) { $cambiati -join ', ' } else { 'nessuno' })"
        foreach ($nome in $cambiati) {
            $percorso = Join-Path $radice ('src\risorse\' + $nome)
            if (-not (Test-Path -LiteralPath $percorso)) { continue }   # tolto
            $contenuto = [IO.File]::ReadAllText($percorso)
            $trovate = @([regex]::Matches($contenuto, $modelloCostante))
            if ($costanti.Contains($nome)) {
                $trovate = @($trovate | Where-Object { $_.Groups[1].Value -eq $costanti[$nome] })
                Verifica "$nome e' cambiato e ha ancora la costante $($costanti[$nome])" ($trovate.Count -eq 1)
            } elseif ($trovate.Count -eq 0) {
                Write-Host "  AVVISO  $nome e' cambiato dall'ultimo rilascio ma non ha una costante di versione" -ForegroundColor Yellow
            }
            foreach ($m in $trovate) {
                Verifica "$nome e' cambiato: $($m.Groups[1].Value) dice la versione dell'app ($app)" ($m.Groups[2].Value -eq $app) `
                    "chi incolla lo script deve poter riconoscere quello nuovo: scrivi '$app'"
            }
        }
    }
}

# ===========================================================================
Write-Host "`n=== DOCUMENTI PER DIRIGENTE E DPO ===" -ForegroundColor Cyan
function Elenco($coppie) { return (($coppie | Sort-Object) -join ' | ') }

$daBuild = @([regex]::Matches($build, '''([^'']+\.txt)''\s*=\s*\(Join-Path\s+\$radice\s+''(docs\\[^'']+)''\)') |
             ForEach-Object { $_.Groups[2].Value + ' -> ' + $_.Groups[1].Value })
$daIss   = @([regex]::Matches($iss, '(?m)^Source:\s*"\.\.\\(docs\\[^"]+)";.*DestName:\s*"([^"]+)"') |
             ForEach-Object { $_.Groups[1].Value + ' -> ' + $_.Groups[2].Value })
$nomiGuscio = @([regex]::Matches($guscio, 'public const string Doc(?:NotaTecnica|Email|Gdpr)\s*=\s*"([^"]+)"') |
                ForEach-Object { $_.Groups[1].Value })
$blocco = Cerca $installa '(?s)public static readonly string\[\] Documenti\s*=\s*\{(.*?)\}' 'ProgrammaInstallazione.Documenti in src-installer\Installa.cs'
$nomiInstalla = @([regex]::Matches($blocco, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
$nomiBuild = @($daBuild | ForEach-Object { ($_ -split ' -> ')[1] })

Write-Host "  build.ps1: $(Elenco $daBuild)"
Verifica "build.ps1 incorpora tre documenti" ($daBuild.Count -eq 3)
Verifica "installer\Campanella.iss copia gli stessi file con gli stessi nomi" ((Elenco $daIss) -eq (Elenco $daBuild)) `
    "Campanella.iss: $(Elenco $daIss)"
Verifica "Guscio.Doc* usa gli stessi nomi" ((Elenco $nomiGuscio) -eq (Elenco $nomiBuild)) "Guscio.cs: $(Elenco $nomiGuscio)"
Verifica "ProgrammaInstallazione.Documenti usa gli stessi nomi" ((Elenco $nomiInstalla) -eq (Elenco $nomiBuild)) `
    "Installa.cs: $(Elenco $nomiInstalla)"
$privacyGuscio = Cerca $guscio 'public const string DocPrivacy\s*=\s*"([^"]+)"' 'Guscio.DocPrivacy'
$privacyBuild  = Cerca $build '/resource:\$privacy,([^"]+)"' 'la risorsa di PRIVACY.md dell''app in build.ps1'
Verifica "PRIVACY.md e' incorporato con il nome che Guscio.DocPrivacy cerca ($privacyGuscio)" ($privacyBuild -eq $privacyGuscio)

# ===========================================================================
Write-Host "`n=== WINDOWS SUPPORTATI ===" -ForegroundColor Cyan
# L'app, l'installer C# e quello di Inno Setup dicono la stessa cosa: Windows
# 10 e 11, gli unici su cui Campanella e' provata (un solo supportedOS, lo
# stesso per tutti e due).
$win10 = '{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}'
foreach ($m in @('src\app.manifest', 'src-installer\app.manifest')) {
    $ids = @([regex]::Matches((Leggi $m), 'supportedOS\s+Id="([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    Verifica "$m dichiara solo Windows 10 e 11 (supportedOS: $($ids -join ', '))" ($ids.Count -eq 1 -and $ids[0] -eq $win10)
}
Verifica "installer\Campanella.iss chiede almeno Windows 10" ($iss -match '(?m)^MinVersion=10\.0\s*$')

# ===========================================================================
#  La finestra delle condizioni: questa parte usa l'eseguibile compilato, e
#  si salta quando manca (il flusso di rilascio lancia la prova prima di
#  compilare). Costruisce le finestre senza mostrarle.
Write-Host "`n=== FINESTRA DELLE CONDIZIONI ===" -ForegroundColor Cyan
$exe = Join-Path $radice 'dist\Campanella.exe'
$sorgente = Join-Path $radice 'src\Consenso.cs'
if (-not (Test-Path -LiteralPath $exe) -or
    (Get-Item -LiteralPath $exe).LastWriteTime -lt (Get-Item -LiteralPath $sorgente).LastWriteTime) {
    Write-Host "  SALTATO dist\Campanella.exe manca o e' piu' vecchio di src\Consenso.cs (compila con build.ps1)" -ForegroundColor DarkGray
} else {
    Add-Type -AssemblyName System.Windows.Forms
    $tipo = [Reflection.Assembly]::LoadFrom($exe).GetType('Campanella.FormConsenso')
    function Controlli($padre) { foreach ($c in $padre.Controls) { $c; Controlli $c } }

    $f = $tipo.GetConstructor([Type]::EmptyTypes).Invoke(@())
    try {
        $tutti = @(Controlli $f)
        Verifica "per accettare servono due spunte" (@($tutti | Where-Object { $_ -is [Windows.Forms.CheckBox] }).Count -eq 2)
        $accetto = $tutti | Where-Object { $_ -is [Windows.Forms.Button] -and $_.Text -eq 'Accetto e continuo' } | Select-Object -First 1
        Verifica "senza spunte 'Accetto e continuo' e' spento" ($null -ne $accetto -and -not $accetto.Enabled)
    } finally { $f.Dispose() }

    $costruttore = $tipo.GetConstructor([Type[]]@([bool]))
    Verifica "la finestra si apre anche in sola lettura (per 'Rileggile')" ($null -ne $costruttore)
    if ($costruttore) {
        $f = $costruttore.Invoke(@($true))
        try {
            $tutti = @(Controlli $f)
            $bottoni = @($tutti | Where-Object { $_ -is [Windows.Forms.Button] } | ForEach-Object { $_.Text })
            Verifica "in sola lettura non ci sono spunte" (@($tutti | Where-Object { $_ -is [Windows.Forms.CheckBox] }).Count -eq 0)
            Verifica "in sola lettura c'e' solo 'Chiudi' (bottoni: $($bottoni -join ', '))" `
                ($bottoni.Count -eq 1 -and $bottoni[0] -eq 'Chiudi' -and $null -ne $f.CancelButton)
        } finally { $f.Dispose() }
    }
    # oggi sta in Guscio.cs; cerco in tutti i sorgenti, se la pagina si sposta
    $tuttiSorgenti = (Get-ChildItem (Join-Path $radice 'src') -Filter *.cs -File |
                      ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n"
    Verifica "'Rileggile' apre la finestra in sola lettura" ($tuttiSorgenti -match 'new FormConsenso\(true\)')
}

Write-Host ""
if ($fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $fallimenti" -ForegroundColor Red; exit 1 }
