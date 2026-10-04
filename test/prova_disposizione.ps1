<#
    prova_disposizione.ps1 - guarda le pagine, non solo il codice

        .\test\prova_disposizione.ps1              controlla e basta
        .\test\prova_disposizione.ps1 -Immagini    salva anche i PNG in %TEMP%

    Costruisce la finestra vera (senza mostrarla), va su ogni pagina e ogni
    passo, e cerca i guai di disposizione che si vedono a occhio ma che
    leggendo il codice sfuggono:

      - due controlli che si sovrappongono (il caso che ha rotto il passo 4
        della Posta: una spiegazione lunga finita sopra al riquadro accanto);
      - roba che esce dalla pagina a destra;
      - etichette piu' alte dello spazio che hanno.

    Con -Immagini salva una fotografia di ogni pagina: serve a guardarle
    davvero, invece di fidarsi.
#>
param([switch]$Immagini)

$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = Join-Path $radice 'dist\Campanella.exe'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$asm = [System.Reflection.Assembly]::LoadFrom($exe)

$script:fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}

# Le impostazioni: mai quelle vere, e mai il Drive vero. Lo Stato nasce con
# il Drive vuoto e lo metto su cartelle finte in %TEMP%. Il Drive finto ha
# MODELLI e un modulo, cosi' ne' la pagina iniziale ne' Cartelle vanno a
# cercare negli altri Drive del computer.
$tStato = $asm.GetType('Campanella.Stato')
$FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$FI = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'
$prova = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-guscio-disposizione-' + (Get-Random))
$driveFinto = Join-Path $prova 'Il mio Drive'
New-Item -ItemType Directory -Force (Join-Path $driveFinto 'MODELLI') | Out-Null
# campanella.json, e la prova di scrittura delle Impostazioni, nella cartella
# della prova: altrimenti "accanto al programma" e' accanto a powershell.exe
$tStato.GetField('CartellaDiProva', $FS).SetValue($null, $prova)
Set-Content -Path (Join-Path $driveFinto 'MODELLI\Modulo di prova.gform') -Value '{}'
$stato = [Activator]::CreateInstance($tStato)
$tStato.GetField('Drive', $FI).SetValue($stato, $driveFinto)
$tStato.GetField('CartellaDati', $FI).SetValue($stato, (Join-Path $prova 'dati'))
$tStato.GetField('DatiNelDrive', $FI).SetValue($stato, $false)
$tStato.GetField('AnonDestinazione', $FI).SetValue($stato, (Join-Path $prova 'anonimizzati'))

$tGuscio = $asm.GetType('Campanella.Guscio')
$guscio = [Activator]::CreateInstance($tGuscio, @($stato.PSObject.BaseObject))
$guscio.Size = New-Object System.Drawing.Size(1240, 880)
# la finestra va mostrata, altrimenti i controlli non si disegnano: la metto
# fuori dallo schermo, cosi' non compare davanti a chi sta lavorando
$guscio.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$guscio.Location = New-Object System.Drawing.Point(-4000, -4000)
$guscio.ShowInTaskbar = $false
$guscio.Show()
[System.Windows.Forms.Application]::DoEvents()

$cartella = Join-Path ([System.IO.Path]::GetTempPath()) 'campanella-pagine'
if ($Immagini) { New-Item -ItemType Directory -Force $cartella | Out-Null }

# --- i controlli che contano: quelli visibili con una posizione ------------
function Figli($contenitore) {
    $fuori = New-Object System.Collections.ArrayList
    foreach ($c in $contenitore.Controls) { if ($c.Visible) { [void]$fuori.Add($c) } }
    return $fuori
}

function Rettangolo($c) {
    return New-Object System.Drawing.Rectangle($c.Left, $c.Top, $c.Width, $c.Height)
}

# Due controlli possono stare uno sopra l'altro solo se uno e' il contenitore
# dell'altro; fra fratelli, sovrapporsi vuol dire testo illeggibile.
function ControllaPannello($pannello, $dove) {
    $figli = Figli $pannello
    for ($i = 0; $i -lt $figli.Count; $i++) {
        for ($k = $i + 1; $k -lt $figli.Count; $k++) {
            $a = $figli[$i]; $b = $figli[$k]
            $ra = Rettangolo $a; $rb = Rettangolo $b
            if ($ra.IntersectsWith($rb)) {
                $ia = [System.Drawing.Rectangle]::Intersect($ra, $rb)
                # qualche pixel di sfioramento non da' fastidio
                if ($ia.Width -gt 3 -and $ia.Height -gt 3) {
                    $ta = if ($a.Text) { $a.Text } else { $a.GetType().Name }
                    $tb = if ($b.Text) { $b.Text } else { $b.GetType().Name }
                    $ta = ($ta -replace '\s+', ' ')
                    $tb = ($tb -replace '\s+', ' ')
                    if ($ta.Length -gt 46) { $ta = $ta.Substring(0, 46) + '...' }
                    if ($tb.Length -gt 46) { $tb = $tb.Substring(0, 46) + '...' }
                    Verifica "$dove : '$ta' non si sovrappone a '$tb'" $false
                }
            }
        }
        # niente deve uscire a destra dalla pagina
        $c = $figli[$i]
        if ($c.Right -gt $pannello.ClientSize.Width + 4 -and $pannello.ClientSize.Width -gt 100) {
            $t = ($c.Text -replace '\s+', ' ')
            if ($t.Length -gt 40) { $t = $t.Substring(0, 40) + '...' }
            Verifica "$dove : '$t' resta dentro la pagina (destra $($c.Right) > $($pannello.ClientSize.Width))" $false
        }
        # un'etichetta che nasce vuota e si riempie dopo: se le hanno lasciato
        # l'altezza del testo vuoto, il testo che arrivera' sara' tagliato
        if ($figli[$i] -is [System.Windows.Forms.Label] -and -not $figli[$i].AutoSize -and
            -not $figli[$i].Text -and $figli[$i].Width -gt 40 -and $figli[$i].Height -lt 16) {
            Verifica "$dove : etichetta vuota larga $($figli[$i].Width) ha un'altezza utile (ha $($figli[$i].Height))" $false
        }
        # un'etichetta che non ci sta nella sua altezza viene tagliata
        if ($figli[$i] -is [System.Windows.Forms.Label] -and -not $figli[$i].AutoSize -and $figli[$i].Text) {
            $serve = [System.Windows.Forms.TextRenderer]::MeasureText(
                $figli[$i].Text, $figli[$i].Font,
                (New-Object System.Drawing.Size($figli[$i].Width, [int]::MaxValue)),
                [System.Windows.Forms.TextFormatFlags]::WordBreak).Height
            if ($serve -gt $figli[$i].Height + 2) {
                $t = ($figli[$i].Text -replace '\s+', ' ')
                if ($t.Length -gt 40) { $t = $t.Substring(0, 40) + '...' }
                Verifica "$dove : '$t' ci sta nella sua altezza (serve $serve, ha $($figli[$i].Height))" $false
            }
        }
    }
}

# --- i "?" tondi: si aprono, e la spiegazione ci sta dentro ---------------
function RaccogliAiuti($contenitore, $fuori) {
    foreach ($c in $contenitore.Controls) {
        if (-not $c.Visible) { continue }
        if (($c.Tag -is [string]) -and $c.Tag -eq 'aiuto') { [void]$fuori.Add($c) }
        RaccogliAiuti $c $fuori
    }
}

$onClick = [System.Windows.Forms.Control].GetMethod('OnClick',
                [System.Reflection.BindingFlags]'NonPublic,Instance')

function ControllaAiuti($pannello, $dove) {
    $aiuti = New-Object System.Collections.ArrayList
    RaccogliAiuti $pannello $aiuti
    $n = 0
    foreach ($a in $aiuti) {
        $n++
        $onClick.Invoke($a, @([System.EventArgs]::Empty)) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        $bolla = $null
        foreach ($f in [System.Windows.Forms.Application]::OpenForms) {
            if ($f.GetType().Name -eq 'Bolla') { $bolla = $f }
        }
        if ($bolla -eq $null) { Verifica "$dove : il ? numero $n apre la spiegazione" $false; continue }
        # dentro la bolla valgono le stesse regole: niente testo tagliato
        ControllaPannello $bolla "$dove - bolla $n"
        $bolla.Close()
        [System.Windows.Forms.Application]::DoEvents()
    }
    if ($aiuti.Count -eq 1) { Write-Host "  OK      $dove : la spiegazione si apre" }
    elseif ($aiuti.Count -gt 1) { Write-Host "  OK      $dove : $($aiuti.Count) spiegazioni si aprono" }
}

# --- giro tutte le pagine e tutti i passi ---------------------------------
$campoPagine = $tGuscio.GetField('pagine', [System.Reflection.BindingFlags]'NonPublic,Instance')
$pagine = $campoPagine.GetValue($guscio)
$metodoVaiA = $tGuscio.GetMethod('VaiA')

# Cartelle confronta il Drive scelto con quelli del computer: le do un elenco
# con il solo Drive finto, cosi' non va a guardare quelli veri
$tDriveTrovato = $asm.GetType('Campanella.DriveTrovato')
function ElencoDrivi($percorsi) {
    $lista = [Activator]::CreateInstance([System.Collections.Generic.List`1].MakeGenericType($tDriveTrovato))
    foreach ($p in $percorsi) {
        $d = [Activator]::CreateInstance($tDriveTrovato)
        $tDriveTrovato.GetField('Percorso').SetValue($d, [string]$p)
        $tDriveTrovato.GetField('ConModelli').SetValue($d, (Test-Path (Join-Path $p 'MODELLI')))
        $tDriveTrovato.GetField('Punti').SetValue($d, 4)
        $lista.Add($d)
    }
    return ,$lista
}
foreach ($pg in $pagine) {
    if ($pg.GetType().Name -eq 'PaginaCartelle') {
        $pg.GetType().GetField('drivi', $FI).SetValue($pg, (ElencoDrivi @($driveFinto)))
    }
}

# --- i bottoni in basso: Avanti deve dire la verita' ------------------------
# All'ultimo passo di uno strumento "Avanti" restava blu e non faceva niente.
# Adesso porta allo strumento dopo (e lo scrive), oppure si spegne e si vede.
$FIp = [System.Reflection.BindingFlags]'NonPublic,Instance'
$btnAvanti = $tGuscio.GetField('btnAvanti', $FIp).GetValue($guscio)
$btnIndietro = $tGuscio.GetField('btnIndietro', $FIp).GetValue($guscio)
$tTema = $asm.GetType('Campanella.Tema')
$accento = $tTema.GetField('Accento', [System.Reflection.BindingFlags]'Public,Static').GetValue($null)

# Il contrasto fra il testo di un bottone e il suo sfondo, come lo misura il
# WCAG. Spento, WinForms disegnava il testo quasi dello stesso colore dello
# sfondo scuro: guardare BackColor non basta, bisogna guardare i pixel.
function Luminanza($c) {
    $canali = @($c.R, $c.G, $c.B) | ForEach-Object {
        $x = $_ / 255.0
        if ($x -le 0.03928) { $x / 12.92 } else { [Math]::Pow(($x + 0.055) / 1.055, 2.4) }
    }
    return 0.2126 * $canali[0] + 0.7152 * $canali[1] + 0.0722 * $canali[2]
}
function ContrastoTesto($bottone) {
    $bmp = New-Object System.Drawing.Bitmap($bottone.Width, $bottone.Height)
    $bottone.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $bottone.Width, $bottone.Height)))
    $lf = Luminanza $bottone.BackColor
    $massimo = 1.0
    for ($x = 4; $x -lt $bmp.Width - 4; $x++) {
        for ($y = 4; $y -lt $bmp.Height - 4; $y++) {
            $lp = Luminanza $bmp.GetPixel($x, $y)
            $k = ([Math]::Max($lp, $lf) + 0.05) / ([Math]::Min($lp, $lf) + 0.05)
            if ($k -gt $massimo) { $massimo = $k }
        }
    }
    $bmp.Dispose()
    return $massimo
}

function Seguente($i) {
    for ($k = $i + 1; $k -lt $pagine.Count; $k++) { if ($pagine[$k].Passi.Count -gt 0) { return $k } }
    return -1
}

function ControllaNavigazione($i, $p, $quanti, $dove) {
    $errori = 0
    $ultimo = ($p -eq $quanti - 1)
    if (-not $ultimo) {
        if (-not ($btnAvanti.Enabled -and $btnAvanti.Text -like 'Avanti*')) {
            Verifica "$dove : Avanti acceso (e' '$($btnAvanti.Text)', acceso=$($btnAvanti.Enabled))" $false; $errori++
        }
    } else {
        $s = Seguente $i
        if ($s -ge 0) {
            $dove2 = $pagine[$s].Nome
            if (-not ($btnAvanti.Enabled -and $btnAvanti.Text -like "*$dove2*")) {
                Verifica "$dove : all'ultimo passo Avanti porta a $dove2 (e' '$($btnAvanti.Text)')" $false; $errori++
            }
        } else {
            if ($btnAvanti.Enabled) { Verifica "$dove : dopo non c'e' niente, Avanti spento" $false; $errori++ }
            elseif ($btnAvanti.BackColor.ToArgb() -eq $accento.ToArgb()) {
                Verifica "$dove : Avanti spento ma colorato come acceso" $false; $errori++
            }
            else {
                $k = ContrastoTesto $btnAvanti
                if ($k -lt 3.0) { Verifica "$dove : Avanti spento si legge (contrasto $([Math]::Round($k,1)), serve 3)" $false; $errori++ }
            }
        }
    }
    if ($p -eq 0 -and $btnIndietro.Enabled) { Verifica "$dove : al primo passo Indietro spento" $false; $errori++ }
    $serve = [System.Windows.Forms.TextRenderer]::MeasureText($btnAvanti.Text, $btnAvanti.Font).Width
    if ($serve + 10 -gt $btnAvanti.Width) {
        Verifica "$dove : il testo di Avanti ci sta (serve $serve, largo $($btnAvanti.Width))" $false; $errori++
    }
    if ($btnIndietro.Right -gt $btnAvanti.Left) {
        Verifica "$dove : Indietro e Avanti non si sovrappongono" $false; $errori++
    }
    return $errori
}

Write-Host "`nLE PAGINE" -ForegroundColor Cyan
for ($i = 0; $i -lt $pagine.Count; $i++) {
    $pagina = $pagine[$i]
    $passi = $pagina.Passi
    $quanti = [Math]::Max(1, $passi.Count)
    for ($p = 0; $p -lt $quanti; $p++) {
        $metodoVaiA.Invoke($guscio, @([int]$i, [int]$p)) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 120
        [System.Windows.Forms.Application]::DoEvents()
        $nome = $pagina.Nome
        if ($passi.Count -gt 0) { $nome += ' / ' + ($passi[$p] -replace '\s+', ' ') }

        # il pannello del passo, se la pagina ne ha; altrimenti la pagina stessa
        $bersaglio = $pagina
        foreach ($c in $pagina.Controls) {
            if ($c.Visible -and $c -is [System.Windows.Forms.Panel] -and $c.Dock -eq [System.Windows.Forms.DockStyle]::Fill) { $bersaglio = $c }
        }
        ControllaPannello $bersaglio $nome
        ControllaAiuti $bersaglio $nome
        if ($passi.Count -gt 0) {
            $e = ControllaNavigazione $i $p $passi.Count $nome
            if ($p -eq $passi.Count - 1 -and $e -eq 0) {
                Write-Host "  OK      $($pagina.Nome) : all'ultimo passo il bottone dice '$($btnAvanti.Text.Trim())'$(if (-not $btnAvanti.Enabled) { ' (spento)' })"
            }
        }

        if ($Immagini) {
            $bmp = New-Object System.Drawing.Bitmap($guscio.Width, $guscio.Height)
            $guscio.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $guscio.Width, $guscio.Height)))
            $file = Join-Path $cartella ("{0:00}-{1}.png" -f ($i * 10 + $p), ($nome -replace '[^A-Za-z0-9]+', '-'))
            $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Dispose()
        }
    }
}

# --- e il clic: dall'ultimo passo della Posta si arriva al primo delle Cartelle ---
Write-Host "`nIL CLIC SU AVANTI" -ForegroundColor Cyan
$iPosta = -1
for ($k = 0; $k -lt $pagine.Count; $k++) { if ($pagine[$k].Nome -eq 'Posta') { $iPosta = $k } }
$metodoVaiA.Invoke($guscio, @([int]$iPosta, [int]($pagine[$iPosta].Passi.Count - 1))) | Out-Null
[System.Windows.Forms.Application]::DoEvents()
$tGuscio.GetMethod('Avanti', $FIp).Invoke($guscio, @()) | Out-Null
[System.Windows.Forms.Application]::DoEvents()
$ora = $tGuscio.GetField('pagina', $FIp).GetValue($guscio)
Verifica "dall'ultimo passo della Posta si passa a $($pagine[$iPosta + 1].Nome), dal primo passo" (
    $ora -eq $iPosta + 1 -and $pagine[$ora].Passo -eq 0)
$metodoVaiA.Invoke($guscio, @([int]$iPosta, [int]0)) | Out-Null
$tGuscio.GetMethod('Avanti', $FIp).Invoke($guscio, @()) | Out-Null
Verifica "a meta' strada Avanti resta nello stesso strumento" (
    $tGuscio.GetField('pagina', $FIp).GetValue($guscio) -eq $iPosta -and $pagine[$iPosta].Passo -eq 1)

# --- si va a una pagina, non a una posizione nel menu -------------------------
# "Cominciamo" chiamava VaiA(1, 1) e VaiAStrumento cercava un pezzo del nome:
# "Impostazioni" contiene "posta". Riordinare le pagine rompeva i bottoni.
Write-Host "`nLA NAVIGAZIONE" -ForegroundColor Cyan
function PaginaOra { return $pagine[$tGuscio.GetField('pagina', $FIp).GetValue($guscio)] }
$mPerTipo = $tGuscio.GetMethod('VaiAPagina', [Type[]]@([System.Type], [int]))
$mPerPagina = $tGuscio.GetMethod('VaiAPagina', [Type[]]@($asm.GetType('Campanella.Pagina'), [int]))
$mStrumento = $tGuscio.GetMethod('VaiAStrumento', [Type[]]@([string]))
Verifica "si puo' andare a una pagina per tipo e per pagina" ($mPerTipo -ne $null -and $mPerPagina -ne $null)
if ($mPerTipo -ne $null -and $mPerPagina -ne $null) {
    $mPerTipo.Invoke($guscio, @($asm.GetType('Campanella.PaginaImpostazioni'), [int]0)) | Out-Null
    Verifica "per tipo: PaginaImpostazioni porta alle Impostazioni" ((PaginaOra).Nome -eq 'Impostazioni')
    $mPerPagina.Invoke($guscio, @($pagine[$iPosta], [int]1)) | Out-Null
    Verifica "per pagina: la Posta, al secondo passo" ((PaginaOra).Nome -eq 'Posta' -and $pagine[$iPosta].Passo -eq 1)
}
$mStrumento.Invoke($guscio, @(' posta ')) | Out-Null
Verifica "per nome, maiuscole e spazi a parte: 'posta' porta alla Posta" ((PaginaOra).Nome -eq 'Posta')
$errore = $null
try { $mStrumento.Invoke($guscio, @('Imposta')) | Out-Null }
catch { $errore = $_.Exception.GetBaseException() }
Verifica "un pezzo di nome non basta: 'Imposta' non porta alle Impostazioni" ((PaginaOra).Nome -eq 'Posta')
Verifica "e il nome sbagliato si vede subito (eccezione)" ($errore -is [System.ArgumentException])
# le schede della pagina iniziale portano ognuna alla sua pagina
foreach ($nome in @('Posta', 'Cartelle', 'Orari', 'Privacy')) {
    $metodoVaiA.Invoke($guscio, @([int]0, [int]0)) | Out-Null
    $bottone = $null
    foreach ($c in $pagine[0].Controls) {
        foreach ($d in $c.Controls) { if ($d -is [System.Windows.Forms.Button] -and $d.Text -eq "Apri $nome") { $bottone = $d } }
    }
    if ($bottone -eq $null) { Verifica "la pagina iniziale ha il bottone 'Apri $nome'" $false; continue }
    $onClick.Invoke($bottone, @([System.EventArgs]::Empty)) | Out-Null
    Verifica "'Apri $nome' porta a $nome" ((PaginaOra).Nome -eq $nome)
}

# --- la pagina iniziale quando il Drive scelto non e' quello della scuola ------
# Con un altro Drive che ha MODELLI, Entra usciva prima di aggiornare le schede
# Orari e Privacy e il riepilogo. I Drive sono finti: senza l'elenco di prova
# la pagina andrebbe a guardare quelli veri, e allora la prova non si fa.
Write-Host "`nLA PAGINA INIZIALE CON UN ALTRO DRIVE" -ForegroundColor Cyan
$home1 = $pagine[0]
$campoDrivi = $home1.GetType().GetField('driviDiProva', $FI)
Verifica "la pagina iniziale accetta un elenco di Drive di prova" ($campoDrivi -ne $null)
if ($campoDrivi -ne $null) {
    $vuoto = Join-Path $prova 'Personale\Il mio Drive'
    $scuola = Join-Path $prova 'Scuola\Il mio Drive'
    New-Item -ItemType Directory -Force $vuoto | Out-Null
    New-Item -ItemType Directory -Force (Join-Path $scuola 'MODELLI') | Out-Null
    $campoDrivi.SetValue($home1, (ElencoDrivi @($vuoto, $scuola)))
    # prima si arriva alla pagina iniziale: uscendo, Privacy rimette PrivacyLetta
    $metodoVaiA.Invoke($guscio, @([int]0, [int]0)) | Out-Null
    $tStato.GetField('Drive', $FI).SetValue($stato, $vuoto)
    $tStato.GetField('PrivacyLetta', $FI).SetValue($stato, $true)
    $tStato.GetField('Dominio', $FI).SetValue($stato, 'scuola.example')
    $metodoVaiA.Invoke($guscio, @([int]0, [int]0)) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $schede = $home1.GetType().GetField('statoStrumento', $FI).GetValue($home1)
    $riepilogo = $home1.GetType().GetField('lblRiepilogo', $FI).GetValue($home1)
    Verifica "la scheda Cartelle suggerisce l'altro Drive" ($schede[1].Text -like "*$scuola*")
    Verifica "la scheda Privacy e' aggiornata lo stesso" ($schede[3].Text -match 'Regole lette')
    Verifica "il riepilogo e' aggiornato lo stesso" ($riepilogo.Text -match 'scuola\.example')
    ControllaPannello $home1 'Inizio con un altro Drive'
    # tutto come prima
    $tStato.GetField('Drive', $FI).SetValue($stato, $driveFinto)
    $tStato.GetField('PrivacyLetta', $FI).SetValue($stato, $false)
    $tStato.GetField('Dominio', $FI).SetValue($stato, '')
    $campoDrivi.SetValue($home1, $null)
    $metodoVaiA.Invoke($guscio, @([int]0, [int]0)) | Out-Null
}

# --- un bottone spento si legge, in tutti e due i temi -----------------------
Write-Host "`nI BOTTONI SPENTI" -ForegroundColor Cyan
$iPrivacy = -1
for ($k = 0; $k -lt $pagine.Count; $k++) { if ($pagine[$k].Nome -eq 'Privacy') { $iPrivacy = $k } }
$mImposta = $tTema.GetMethod('Imposta', [System.Reflection.BindingFlags]'Public,Static')
$mApplica = $tTema.GetMethod('Applica', [System.Reflection.BindingFlags]'Public,Static')
$scuroPrima = $tTema.GetField('Scuro', [System.Reflection.BindingFlags]'Public,Static').GetValue($null)
foreach ($scuro in @($true, $false)) {
    $mImposta.Invoke($null, @([bool]$scuro)) | Out-Null
    $mApplica.Invoke($null, @($guscio)) | Out-Null
    $metodoVaiA.Invoke($guscio, @([int]$iPrivacy, [int]($pagine[$iPrivacy].Passi.Count - 1))) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $tema = if ($scuro) { 'scuro' } else { 'chiaro' }
    $kA = ContrastoTesto $btnAvanti
    Verifica "tema $tema : Avanti spento si legge (contrasto $([Math]::Round($kA,1)))" (-not $btnAvanti.Enabled -and $kA -ge 3.0)
    $metodoVaiA.Invoke($guscio, @([int]$iPrivacy, [int]0)) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $kI = ContrastoTesto $btnIndietro
    Verifica "tema $tema : Indietro spento si legge (contrasto $([Math]::Round($kI,1)))" (-not $btnIndietro.Enabled -and $kI -ge 3.0)
}
$mImposta.Invoke($null, @([bool]$scuroPrima)) | Out-Null
$mApplica.Invoke($null, @($guscio)) | Out-Null

# --- i colori che dicono qualcosa restano dopo Applica e dopo il cambio di tema -
# Tema.Applica ricolora secondo il ruolo nella Tag: un colore messo a mano
# spariva ("Elimina regola" non era rosso, l'avviso ambra tornava verde), e
# il cambio di tema dalle Impostazioni lasciava spenta la voce del menu.
Write-Host "`nI COLORI DOPO IL CAMBIO DI TEMA" -ForegroundColor Cyan
$FSpub = [System.Reflection.BindingFlags]'Public,Static'
function ColoreTema($nome) { return $tTema.GetField($nome, $FSpub).GetValue($null).ToArgb() }
function Scuro { return $tTema.GetField('Scuro', $FSpub).GetValue($null) }

$tRegola = $asm.GetType('Campanella.Regola')
$regola = [Activator]::CreateInstance($tRegola)
$tRegola.GetField('Etichetta').SetValue($regola, 'Etichetta di prova')
$formRegola = [Activator]::CreateInstance($asm.GetType('Campanella.FormRegola'), @($regola))
$elimina = $null
foreach ($c in $formRegola.Controls) { if ($c -is [System.Windows.Forms.Button] -and $c.Text -eq 'Elimina regola') { $elimina = $c } }
Verifica "'Elimina regola' e' rosso" ($elimina -ne $null -and $elimina.ForeColor.ToArgb() -eq (ColoreTema 'Rosso'))
$mImposta.Invoke($null, @([bool](-not $scuroPrima))) | Out-Null
$mApplica.Invoke($null, @($formRegola)) | Out-Null
Verifica "e resta rosso nell'altro tema" ($elimina -ne $null -and $elimina.ForeColor.ToArgb() -eq (ColoreTema 'Rosso'))
$mImposta.Invoke($null, @([bool]$scuroPrima)) | Out-Null
$formRegola.Dispose()

$lblStato = $tGuscio.GetField('lblStato', $FIp).GetValue($guscio)
$mStato1 = $tGuscio.GetMethod('Stato1', [Type[]]@([string], [System.Drawing.Color]))
$mCambia = $tGuscio.GetMethod('CambiaTema', $FIp)
$mStato1.Invoke($guscio, @('Avviso di prova', $tTema.GetField('Ambra', $FSpub).GetValue($null))) | Out-Null
$mCambia.Invoke($guscio, @()) | Out-Null
Verifica "la riga di stato ambra resta ambra dopo il cambio di tema" ($lblStato.ForeColor.ToArgb() -eq (ColoreTema 'Ambra'))
$mCambia.Invoke($guscio, @()) | Out-Null
Verifica "e anche tornando al tema di prima" ($lblStato.ForeColor.ToArgb() -eq (ColoreTema 'Ambra'))

$iImp = -1
for ($k = 0; $k -lt $pagine.Count; $k++) { if ($pagine[$k].Nome -eq 'Impostazioni') { $iImp = $k } }
$metodoVaiA.Invoke($guscio, @([int]$iImp, [int]0)) | Out-Null
$piede = $tGuscio.GetField('piede', $FIp).GetValue($guscio)
Verifica "senza i passi (Impostazioni) la riga di stato prende tutto il piede ($($lblStato.Bounds))" (
    -not $btnAvanti.Visible -and -not $lblStato.AutoSize -and $lblStato.Left -eq 26 -and $lblStato.Right -eq $piede.Width - 26)
$vocImp = $null
foreach ($v in $tGuscio.GetField('voci', $FIp).GetValue($guscio)) {
    if ($v.GetType().GetField('Pagina').GetValue($v) -eq $iImp -and $v.GetType().GetField('Passo').GetValue($v) -eq -1) {
        $vocImp = $v.GetType().GetField('Bottone').GetValue($v)
    }
}
$mApplicaTema = $pagine[$iImp].GetType().GetMethod('ApplicaTema', $FIp)
$mApplicaTema.Invoke($pagine[$iImp], @([bool](-not (Scuro)))) | Out-Null
Verifica "dalle Impostazioni il menu si ricolora: la voce scelta resta evidenziata" (
    $vocImp -ne $null -and $vocImp.BackColor.ToArgb() -eq (ColoreTema 'AccentoSfondo'))
$mApplicaTema.Invoke($pagine[$iImp], @([bool]$scuroPrima)) | Out-Null
Verifica "e anche tornando al tema di prima" (
    $vocImp -ne $null -and $vocImp.BackColor.ToArgb() -eq (ColoreTema 'AccentoSfondo'))

# --- i colori delle etichette: il passo 4 con Colleghi, e la finestra dei colori ---
# Con le sottoetichette dei ruoli accese, accanto al colore di Colleghi compare
# un quadratino per ruolo: anche cosi' il passo 4 deve stare in piedi. La
# finestra dei colori si apre fuori dallo schermo, come la finestra principale.
Write-Host "`nI COLORI DELLE ETICHETTE" -ForegroundColor Cyan
$tPersona = $asm.GetType('Campanella.Persona')
$personale = $tStato.GetField('Personale', $FI).GetValue($stato)
$ruoliProva = @(@('GRIGI SARA', 'DIRIGENTE SCOLASTICO'), @('ROSSI MARIO', 'DOCENTE'),
                @('NERI ANNA', 'ASSISTENTE AMMINISTRATIVO'), @('BLU CARLA', 'ASSISTENTE TECNICO'),
                @('VERDI LUCA', 'COLLABORATORE SCOLASTICO'))
foreach ($r in $ruoliProva) {
    $p = [Activator]::CreateInstance($tPersona)
    $tPersona.GetField('Nome').SetValue($p, $r[0])
    $tPersona.GetField('Ruolo').SetValue($p, $r[1])
    $tPersona.GetField('Email').SetValue($p, ($r[0].ToLowerInvariant() -replace ' ', '.') + '@scuola.example')
    $personale.GetType().GetMethod('Add').Invoke($personale, @($p)) | Out-Null
}
$tStato.GetField('EtichettaPerRuolo', $FI).SetValue($stato, $true)
$posta = $pagine[$iPosta]
$metodoVaiA.Invoke($guscio, @([int]$iPosta, [int]3)) | Out-Null
[System.Windows.Forms.Application]::DoEvents()
$clb = $posta.GetType().GetField('clbRegole', $FIp).GetValue($posta)
$campioneRegola = $posta.GetType().GetField('campioneRegola', $FIp).GetValue($posta)
$mini = $posta.GetType().GetField('miniRuoli', $FIp).GetValue($posta)
$regoleStato = $tStato.GetField('Regole', $FI).GetValue($stato)
$iColleghi = -1
for ($k = 0; $k -lt $regoleStato.Count; $k++) { if ($regoleStato[$k].Etichetta -eq 'Colleghi') { $iColleghi = $k } }
Verifica "il passo 4 ha il campione del colore e i quadratini dei ruoli" ($campioneRegola -ne $null -and $mini -ne $null -and $iColleghi -ge 0)
if ($campioneRegola -ne $null -and $mini -ne $null -and $iColleghi -ge 0) {
    $clb.SelectedIndex = 0
    [System.Windows.Forms.Application]::DoEvents()
    $visibili = @($mini | Where-Object { $_.Visible }).Count
    Verifica "Dirigenza: il campione ha il suo colore, e niente quadratini" (
        $campioneRegola.Colore -eq '#cc3a21/#ffffff' -and $campioneRegola.Text -eq 'Dirigenza' -and $visibili -eq 0)
    $clb.SelectedIndex = $iColleghi
    [System.Windows.Forms.Application]::DoEvents()
    $colori = @($mini | Where-Object { $_.Visible } | ForEach-Object { $_.Colore })
    Verifica "Colleghi: il suo blu, e un quadratino per ruolo con la sua sfumatura" (
        $campioneRegola.Colore -eq '#4a86e8/#000000' -and $colori.Count -eq 5 -and
        ($colori -join ' ') -eq '#c9daf8/#000000 #a4c2f4/#000000 #6d9eeb/#000000 #3c78d8/#000000 #285bac/#ffffff')
    # il campione si disegna davvero nel suo colore (in memoria, non sullo schermo)
    $bmp = New-Object System.Drawing.Bitmap($campioneRegola.Width, $campioneRegola.Height)
    $campioneRegola.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $campioneRegola.Width, $campioneRegola.Height)))
    $pixel = $bmp.GetPixel(6, [int]($campioneRegola.Height / 2))
    $bmp.Dispose()
    Verifica "e si disegna nel suo colore ($('#{0:x2}{1:x2}{2:x2}' -f $pixel.R, $pixel.G, $pixel.B))" (
        $pixel.R -eq 0x4a -and $pixel.G -eq 0x86 -and $pixel.B -eq 0xe8)
    # un filo intorno a ogni campione: senza, le sfumature chiare sparivano
    # nella pagina del tema chiaro e quelle scure in quella dello scuro, e i
    # quadratini dei ruoli non hanno nemmeno la scritta. Il filo e' il primo
    # pixel dentro il margine di 3 lasciato al bordo della scelta.
    function Contrasto($a, $b) {
        $la = Luminanza $a; $lb = Luminanza $b
        return ([Math]::Max($la, $lb) + 0.05) / ([Math]::Min($la, $lb) + 0.05)
    }
    $quadratino = @($mini | Where-Object { $_.Visible })[0]
    $coloreQuadratino = $quadratino.Colore
    $deboli = @()
    foreach ($scuroQui in @($false, $true)) {
        $mImposta.Invoke($null, @([bool]$scuroQui)) | Out-Null
        $paginaQui = $tTema.GetField('Sfondo', [System.Reflection.BindingFlags]'Public,Static').GetValue($null)
        foreach ($c in @('#c9daf8/#000000', '#fef1d1/#000000', '#efefef/#000000', '#000000/#ffffff', '#0d3b44/#ffffff', '#41236d/#ffffff')) {
            $quadratino.Colore = $c
            $bmp = New-Object System.Drawing.Bitmap($quadratino.Width, $quadratino.Height)
            $quadratino.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $quadratino.Width, $quadratino.Height)))
            $filo = $bmp.GetPixel(3, [int]($quadratino.Height / 2))
            $bmp.Dispose()
            $k = Contrasto $filo $paginaQui
            if ($k -lt 3.0) { $deboli += "$c tema $(if ($scuroQui) { 'scuro' } else { 'chiaro' }) ($([Math]::Round($k, 2)))" }
        }
    }
    $mImposta.Invoke($null, @([bool]$scuroPrima)) | Out-Null
    $quadratino.Colore = $coloreQuadratino
    Verifica "il bordo dei campioni si vede sulla pagina, chiari e scuri, in tutti e due i temi$(if ($deboli.Count) { ': no ' + ($deboli -join ', ') })" (
        $deboli.Count -eq 0)
    $pannello4 = $null
    foreach ($c in $posta.Controls) {
        if ($c.Visible -and $c -is [System.Windows.Forms.Panel] -and $c.Dock -eq [System.Windows.Forms.DockStyle]::Fill) { $pannello4 = $c }
    }
    ControllaPannello $pannello4 'Posta / 4 con Colleghi e i ruoli'
    ControllaAiuti $pannello4 'Posta / 4 con Colleghi e i ruoli'

    # la descrizione della regola scelta ci sta tutta nel suo riquadro, che
    # non ha la barra per scorrere: l'ultima riga e' quella dei mittenti, e con
    # il riquadro troppo basso spariva (Registro elettronico). Anche con gli
    # elenchi di Dirigenza e Segreteria lunghi fino al taglio dei 150 caratteri.
    $txtDescr = $posta.GetType().GetField('txtDescrizioneRegola', $FIp).GetValue($posta)
    $lunga = (1..12 | ForEach-Object { "collaboratore$_@scuola.example" }) -join "`r`n"
    $tagliate = @()
    foreach ($elenchi in @(@('', ''), @($lunga, $lunga))) {
        $tStato.GetField('Dirigenza', $FI).SetValue($stato, $elenchi[0])
        $tStato.GetField('Segreteria', $FI).SetValue($stato, $elenchi[1])
        for ($k = 0; $k -lt $regoleStato.Count; $k++) {
            $clb.SelectedIndex = $k
            [System.Windows.Forms.Application]::DoEvents()
            $testoD = $txtDescr.Text.TrimEnd()
            if ($testoD -eq '') { continue }
            $fondo = $txtDescr.GetPositionFromCharIndex($testoD.Length - 1).Y + $txtDescr.Font.Height
            if ($fondo -gt $txtDescr.ClientSize.Height -and $txtDescr.ScrollBars -eq [System.Windows.Forms.ScrollBars]::None) {
                $tagliate += "$($regoleStato[$k].Etichetta) ($fondo > $($txtDescr.ClientSize.Height))"
            }
        }
    }
    $tStato.GetField('Dirigenza', $FI).SetValue($stato, '')
    $tStato.GetField('Segreteria', $FI).SetValue($stato, '')
    $clb.SelectedIndex = $iColleghi
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "la descrizione di ogni regola ci sta nel riquadro, mittenti compresi$(if ($tagliate.Count) { ': no ' + ($tagliate -join ', ') })" (
        $tagliate.Count -eq 0)
    # una regola nata da un filtro di Gmail, con tanti mittenti e una ricerca
    # lunga, non ci sta: allora, e solo allora, il riquadro ha la barra per
    # scorrere; le regole di partenza no (qui sopra)
    $lungaR = [Activator]::CreateInstance($asm.GetType('Campanella.Regola'))
    $lungaR.Etichetta = 'Notifiche Google'
    $lungaR.Descrizione = 'Da un filtro di Gmail: la stessa etichetta e la stessa ricerca, e archivia.'
    foreach ($m in (1..14 | ForEach-Object { "notifiche$_@servizio-lungo.example" })) { $lungaR.Da.Add($m) }
    $lungaR.QueryLibera = '-from:classroom.google.com -from:registro-uno.example -from:istruzione.it -from:"NOME ESEMPIO"'
    $regoleStato.Add($lungaR)
    $posta.GetType().GetMethod('AggiornaElencoRegole', $FIp).Invoke($posta, @([int]($regoleStato.Count - 1))) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $conBarra = $txtDescr.ScrollBars
    $clb.SelectedIndex = 0
    [System.Windows.Forms.Application]::DoEvents()
    $senzaBarra = $txtDescr.ScrollBars
    [void]$regoleStato.Remove($lungaR)
    $posta.GetType().GetMethod('AggiornaElencoRegole', $FIp).Invoke($posta, @([int]$iColleghi)) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "una regola lunga, nata da un filtro di Gmail, ha la barra per scorrere ($conBarra); le altre no ($senzaBarra)" (
        $conBarra -eq [System.Windows.Forms.ScrollBars]::Vertical -and $senzaBarra -eq [System.Windows.Forms.ScrollBars]::None)

    # la finestra dei colori di Colleghi, con le cinque sottoetichette
    $tForm = $asm.GetType('Campanella.FormColore')
    $categorie = New-Object 'System.Collections.Generic.List[string]'
    $categorie.AddRange([string[]]@('Dirigenza', 'Docenti', 'Amministrativi', 'Tecnici', 'Collaboratori'))
    $scelti = New-Object 'System.Collections.Generic.Dictionary[string,string]'
    $scelti['Tecnici'] = ''
    # BaseObject: dentro un array PowerShell passerebbe l'involucro, e il costruttore non si trova
    $f = [Activator]::CreateInstance($tForm, @([string]'Colleghi', [string]'#4a86e8/#000000',
        $categorie.PSObject.BaseObject, $scelti.PSObject.BaseObject, $null))
    $f.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $f.Location = New-Object System.Drawing.Point(-4000, -4000)
    $f.Show()
    [System.Windows.Forms.Application]::DoEvents()
    ControllaPannello $f 'Colore di Colleghi'
    $FIf = [System.Reflection.BindingFlags]'NonPublic,Instance'
    $tavolozzaF = $tForm.GetField('tavolozza', $FIf).GetValue($f)
    $chips = $tForm.GetField('campioniRuoli', $FIf).GetValue($f)
    function Clic($c) { $onClick.Invoke($c, @([System.EventArgs]::Empty)) | Out-Null; [System.Windows.Forms.Application]::DoEvents() }
    function Campione($colore) { return @($tavolozzaF | Where-Object { $_.Colore -eq $colore })[0] }
    Verifica "la finestra mostra la tavolozza ($($tavolozzaF.Count)) e i cinque ruoli" ($tavolozzaF.Count -ge 60 -and $chips.Count -eq 5)
    Verifica "Tecnici, scelto a mano senza colore, resta senza; gli altri hanno le sfumature" (
        $chips['Tecnici'].Colore -eq '' -and $chips['Docenti'].Colore -eq '#a4c2f4/#000000')
    Clic (Campione '#16a766/#000000')
    Verifica "un clic sul verde: Colleghi e' verde, e i ruoli lo seguono (tranne Tecnici)" (
        $f.Colore -eq '#16a766/#000000' -and $chips['Docenti'].Colore -eq '#89d3b2/#000000' -and $chips['Tecnici'].Colore -eq '')
    Clic $chips['Docenti']
    Clic (Campione '#fb4c2f/#000000')
    Verifica "clic su Docenti e poi sul rosso: solo Docenti e' rosso, Colleghi resta verde" (
        $f.ColoriRuoli['Docenti'] -eq '#fb4c2f/#000000' -and $f.Colore -eq '#16a766/#000000' -and
        $chips['Docenti'].Colore -eq '#fb4c2f/#000000')
    ControllaPannello $f 'Colore di Colleghi, con un ruolo scelto'
    $segui = $tForm.GetField('btnSegui', $FIf).GetValue($f)
    Verifica "per un ruolo scelto a mano si puo' tornare alla sfumatura" ($segui.Visible -and $segui.Enabled)
    Clic $segui
    Verifica "e allora segue di nuovo Colleghi" (-not $f.ColoriRuoli.ContainsKey('Docenti') -and $chips['Docenti'].Colore -eq '#89d3b2/#000000')
    Clic ($tForm.GetField('nessuno', $FIf).GetValue($f))
    Verifica "nessun colore per Docenti si ricorda come scelta (vuota)" (
        $f.ColoriRuoli.ContainsKey('Docenti') -and $f.ColoriRuoli['Docenti'] -eq '' -and $f.Colore -eq '#16a766/#000000')
    $f.Close()
    $f.Dispose()

    # e per una regola qualunque: niente ruoli, niente "Segui"
    $g = [Activator]::CreateInstance($tForm, @([string]'Circolari', [string]'#fad165/#000000', $null, $null, $null))
    $g.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $g.Location = New-Object System.Drawing.Point(-4000, -4000)
    $g.Show()
    [System.Windows.Forms.Application]::DoEvents()
    ControllaPannello $g 'Colore di Circolari'
    Verifica "per Circolari niente ruoli e niente 'Segui'" (
        $tForm.GetField('campioniRuoli', $FIf).GetValue($g).Count -eq 0 -and -not $tForm.GetField('btnSegui', $FIf).GetValue($g).Visible)
    $g.Close()
    $g.Dispose()
}

# --- i filtri che hai gia' in Gmail: la finestra del passo 4 --------------------
# L'esportazione inventata di test\filtri_gmail_esempio.xml, con lo Stato di qui
# (i ruoli appena aggiunti): la finestra sta in piedi prima e dopo aver aperto
# il file, partono spuntati proprio i filtri uguali a una regola, e quello scelto
# prima che nel file non c'e' resta in fondo, spuntato.
Write-Host "`nI FILTRI CHE HAI GIA' IN GMAIL" -ForegroundColor Cyan
$tFF = $asm.GetType('Campanella.FormFiltriGmail')
$tFG = $asm.GetType('Campanella.FiltriGmail')
$tDT = $asm.GetType('Campanella.FiltroDaTogliere')
Verifica "c'e' la finestra dei filtri che hai gia' in Gmail" ($null -ne $tFF -and $null -ne $tFG -and $null -ne $tDT)
if ($null -ne $tFF -and $null -ne $tFG -and $null -ne $tDT) {
    $FIf = [System.Reflection.BindingFlags]'NonPublic,Instance'
    $filtriEs = $tFG.GetMethod('LeggiFile', $FS).Invoke($null, @([string](Join-Path $radice 'test\filtri_gmail_esempio.xml')))
    $sceltiPrima = [Activator]::CreateInstance([System.Collections.Generic.List`1].MakeGenericType($tDT))
    $vecchio = [Activator]::CreateInstance($tDT)
    $tDT.GetField('Etichetta').SetValue($vecchio, 'Vecchia')
    $criteriVecchio = $tDT.GetField('Criteri').GetValue($vecchio)
    $criteriVecchio['from'] = 'vecchio@scuola.example'
    # scelto con questa versione, "Toglilo" e basta (uno della 1.6.0, senza le
    # azioni, senza una regola che lo sostituisce resterebbe)
    $tDT.GetField('Archivia').SetValue($vecchio, [System.Nullable[bool]]$false)
    $tDT.GetField('SegnaLetto').SetValue($vecchio, [System.Nullable[bool]]$false)
    $sceltiPrima.Add($vecchio)
    $tStato.GetField('FiltriDaTogliere', $FI).SetValue($stato, $sceltiPrima)
    $ff = [Activator]::CreateInstance($tFF, @($stato.PSObject.BaseObject))
    $ff.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $ff.Location = New-Object System.Drawing.Point(-4000, -4000)
    $ff.Show()
    [System.Windows.Forms.Application]::DoEvents()
    ControllaPannello $ff "Filtri che hai gia' in Gmail, senza file"
    $gr = $tFF.GetField('griglia', $FIf).GetValue($ff)
    Verifica "senza file ci sono i filtri scelti prima, spuntati" ($gr.Rows.Count -eq 1 -and $ff.Spuntata(0) -and
        [string]$gr.Rows[0].Cells[1].Value -eq 'Vecchia')

    $ff.Carica($filtriEs)
    [System.Windows.Forms.Application]::DoEvents()
    ControllaPannello $ff "Filtri che hai gia' in Gmail, con il file"
    $gr.CurrentCell = $gr.Rows[14].Cells[1]
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "con il file: i suoi 14 filtri, e in fondo quello scelto prima che non c'e'" (
        $gr.Rows.Count -eq 15 -and $ff.Spuntata(14) -and
        $tFF.GetField('txtDettaglio', $FIf).GetValue($ff).Text -match "Suggerimento: scelto prima: nel file non c'e'")
    # ogni filtro parte con la sua proposta (FiltriGmail.Proposta): si tolgono
    # quelli uguali a una regola che non fanno altro, diventano regole i tuoi,
    # si uniscono i simili; restano quelli che inoltrano, eliminano..., e
    # quelli creati da Campanella. Una che con gli altri filtri non si puo'
    # fare (la riga dice perche': PercheResta) parte lasciata
    $mConfronta = $tFG.GetMethod('Confronta', $FS, $null, [Type[]]@($asm.GetType('Campanella.FiltroGmail'), $tStato), $null)
    $mScelteF = $tFG.GetMethod('Scelte', $FS)
    $mPropostaF = $tFG.GetMethod('Proposta', $FS)
    $righeFF = $tFF.GetField('righe', $FIf).GetValue($ff)
    $storte = @(); $spuntati = 0
    for ($i = 0; $i -lt 14; $i++) {
        $x = $mConfronta.Invoke($null, @($filtriEs[$i], $stato.PSObject.BaseObject))
        $sc = $mScelteF.Invoke($null, @($filtriEs[$i], $x, $stato.PSObject.BaseObject))
        $proposta = $mPropostaF.Invoke($null, @($sc, $filtriEs[$i], $x, $stato.PSObject.BaseObject, $false))
        $perche = [string]$righeFF[$i].GetType().GetField('PercheResta').GetValue($righeFF[$i])
        if ($perche -ne '') { $proposta = $sc[0] }
        if ($proposta.TogliIlFiltro) { $spuntati++ }
        if ($ff.Spuntata($i) -ne $proposta.TogliIlFiltro -or [string]$gr.Rows[$i].Cells[0].Value -ne $proposta.Testo) {
            $storte += $filtriEs[$i].Etichetta
        }
    }
    Verifica "ogni filtro parte con la sua proposta, e si tolgono proprio quelli ($spuntati)$(if ($storte.Count) { ': no ' + ($storte -join ', ') })" (
        $storte.Count -eq 0 -and $spuntati -ge 1 -and $spuntati -lt 14)
    # i tuoi con delle parole (Viaggi, Progetti Erasmus, Riunioni "urgenti") restano:
    # resta in Gmail il filtro senza etichetta che manda nel cestino, che puo'
    # prendere gli stessi messaggi, e nel cestino la regola non li cercherebbe
    $perCestino = @(@(4, 5, 12) | Where-Object {
        [string]$righeFF[$_].GetType().GetField('PercheResta').GetValue($righeFF[$_]) -match 'cestino' -and -not $ff.Spuntata($_) })
    Verifica "i tuoi filtri con delle parole restano per quello che manda nel cestino, e la riga dice perche' ($($perCestino.Count))" (
        $perCestino.Count -eq 3)
    Verifica "un filtro senza etichetta non si puo' spuntare" (
        [string]$gr.Rows[6].Cells[1].Value -eq '(nessuna)' -and $gr.Rows[6].Cells[0].ReadOnly -and -not $ff.Spuntata(6))
    $ff.Spunta(6, $true)
    Verifica "nemmeno chiedendolo" (-not $ff.Spuntata(6))
    $ff.Spunta(4, $true)
    $scelti = @($ff.SceltiAdesso())
    $viaggi = @($scelti | Where-Object { $_.Etichetta -eq 'Viaggi' })
    Verifica "un filtro tuo spuntato a mano va fra quelli da togliere, con i suoi criteri" (
        $viaggi.Count -eq 1 -and $viaggi[0].Criteri['query'] -eq '{prenotazione biglietto}' -and $viaggi[0].Criteri.Count -eq 1)
    Verifica "e quello scelto prima resta scelto" (@($scelti | Where-Object { $_.Etichetta -eq 'Vecchia' }).Count -eq 1)
    # due filtri uguali: per lo script sono la stessa voce, e si spuntano insieme
    $filtriEs.Add($filtriEs[4])
    $ff.Carica($filtriEs)
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "aprendo di nuovo il file le spunte restano, anche sul filtro uguale" (
        $gr.Rows.Count -eq 16 -and $ff.Spuntata(4) -and $ff.Spuntata(14) -and $ff.Spuntata(15))
    $ff.Spunta(14, $false)
    Verifica "tolta la spunta a uno, la perde anche l'altro, e la voce va via" (
        -not $ff.Spuntata(4) -and @($ff.SceltiAdesso() | Where-Object { $_.Etichetta -eq 'Viaggi' }).Count -eq 0)
    $gr.CurrentCell = $gr.Rows[10].Cells[1]
    [System.Windows.Forms.Application]::DoEvents()
    $dettaglio = $tFF.GetField('txtDettaglio', $FIf).GetValue($ff).Text
    Verifica "sotto la griglia tutto il filtro scelto, anche quello che fa" (
        $dettaglio -match 'Etichetta: Dirigenza' -and $dettaglio -match 'inoltra a vice@scuola\.example')
    ControllaPannello $ff "Filtri che hai gia' in Gmail, con il file aperto due volte"
    $ff.Close()
    $ff.Dispose()

    # i casi veri (resi anonimi) di test\filtri_gmail_riorganizza.xml: regole
    # nuove e mittenti da unire, con le tendine e le ricerche lunghe; la
    # finestra sta in piedi e il dettaglio di Famiglie (Genitori spenta) ci sta.
    # Come nel caso vero, la casella della scuola e' in Segreteria: il filtro
    # del ministero la esclude, e unito a Ministero e USR non le toglie niente
    $tStato.GetField('Segreteria', $FI).SetValue($stato, 'casella@istruzione.it')
    $filtriR = $tFG.GetMethod('LeggiFile', $FS).Invoke($null, @([string](Join-Path $radice 'test\filtri_gmail_riorganizza.xml')))
    $ffR = [Activator]::CreateInstance($tFF, @($stato.PSObject.BaseObject))
    $ffR.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $ffR.Location = New-Object System.Drawing.Point(-4000, -4000)
    $ffR.Show()
    $ffR.Carica($filtriR)
    [System.Windows.Forms.Application]::DoEvents()
    $grR = $tFF.GetField('griglia', $FIf).GetValue($ffR)
    $grR.CurrentCell = $grR.Rows[13].Cells[1]
    [System.Windows.Forms.Application]::DoEvents()
    $detR = $tFF.GetField('txtDettaglio', $FIf).GetValue($ffR)
    $fondoR = $detR.GetPositionFromCharIndex($detR.Text.Length - 1).Y + $detR.Font.Height
    Verifica "con i casi veri: le proposte nella colonna 'Che cosa fare', e il dettaglio di Famiglie si legge (con la barra se serve)" (
        [string]$grR.Rows[13].Cells[0].Value -eq 'Unisci a Genitori (la accendo)' -and [string]$grR.Rows[4].Cells[0].Value -eq 'Unisci a Ministero e USR' -and
        ($fondoR -le $detR.ClientSize.Height -or $detR.ScrollBars -ne [System.Windows.Forms.ScrollBars]::None))
    ControllaPannello $ffR "Filtri che hai gia' in Gmail, i casi veri"
    $ffR.Close()
    $ffR.Dispose()
    $tStato.GetField('Segreteria', $FI).SetValue($stato, '')

    # il passo 4 dice quanti ce ne sono da togliere
    $lblF = $posta.GetType().GetField('lblFiltri', $FIp).GetValue($posta)
    $posta.GetType().GetMethod('AggiornaFiltriDaTogliere', $FIp).Invoke($posta, @()) | Out-Null
    Verifica "il passo 4 dice quanti filtri ci sono da togliere ('$($lblF.Text)')" (
        $lblF.Text -eq '1 filtro di Gmail da togliere: li toglie EXTRA_togliFiltri.')
    $metodoVaiA.Invoke($guscio, @([int]$iPosta, [int]3)) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $pannelloF = $null
    foreach ($c in $posta.Controls) {
        if ($c.Visible -and $c -is [System.Windows.Forms.Panel] -and $c.Dock -eq [System.Windows.Forms.DockStyle]::Fill) { $pannelloF = $c }
    }
    ControllaPannello $pannelloF 'Posta / 4 con un filtro da togliere'
    # i filtri tolti dalla scelta all'avvio (sembrano di una classe e cercano
    # degli indirizzi): il passo 4 lo dice, in ambra, e ci sta
    $campoTolti = $tStato.GetField('FiltriClassiToltiAllAvvio', $FI)
    $campoTolti.SetValue($stato, 12)
    $posta.GetType().GetMethod('AggiornaFiltriDaTogliere', $FIp).Invoke($posta, @()) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "il passo 4 dice anche i filtri tolti dalla scelta all'avvio ('$($lblF.Text)')" (
        $lblF.Text -match "^1 filtro di Gmail da togliere: li toglie EXTRA_togliFiltri\. All'avvio ho tolto dalla scelta 12 filtri che sembrano di una classe" -and
        $lblF.ForeColor.ToArgb() -eq (ColoreTema 'Ambra'))
    ControllaPannello $pannelloF 'Posta / 4 con i filtri tolti all''avvio'
    $campoTolti.SetValue($stato, 0)
    # un filtro scelto la cui regola non c'e' piu': resta in Gmail, e il passo 4 lo dice, in ambra, e ci sta
    $sceltoF = @($tStato.GetField('FiltriDaTogliere', $FI).GetValue($stato))[0]
    $sceltoF.Regola = 'Una regola che non c''e'''
    $posta.GetType().GetMethod('AggiornaFiltriDaTogliere', $FIp).Invoke($posta, @()) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "il passo 4 dice il filtro scelto che resta, senza la sua regola ('$($lblF.Text)')" (
        $lblF.Text -match "^Nessun filtro di Gmail da togliere\. 1 filtro scelto resta in Gmail: la regola che lo sostituiva non c'e' piu'" -and
        $lblF.ForeColor.ToArgb() -eq (ColoreTema 'Ambra'))
    ControllaPannello $pannelloF 'Posta / 4 con un filtro senza la sua regola'
    # un filtro unito a una regola con un'altra etichetta (Famiglie a Genitori):
    # la sua etichetta e' rimasta, e il riquadro "Etichette rimaste dai filtri
    # uniti" la mostra con la sua spunta, e ci sta; tolta la spunta, il docente
    # non la vuole unire (Stato.EtichetteDaNonUnire)
    $regoleD = $tStato.GetField('Regole', $FI).GetValue($stato)
    $genD = @($regoleD | Where-Object { $_.Etichetta -eq 'Genitori' })[0]
    $genAttiva = $genD.Attiva
    $genD.Attiva = $true
    $genD.Da.Add('@famiglie.example')
    $etichettaPrima = $sceltoF.Etichetta
    $tDT.GetField('Etichetta').SetValue($sceltoF, 'Famiglie')
    $sceltoF.Criteri.Clear()
    $sceltoF.Criteri['from'] = '@famiglie.example'
    $sceltoF.Regola = 'Genitori'
    $tDT.GetField('Gruppo').SetValue($sceltoF, [string]$stato.PrefissoPulito())
    $sceltoF.StessaEtichettaInGmail = $false
    $posta.GetType().GetMethod('AggiornaFiltriDaTogliere', $FIp).Invoke($posta, @()) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $grpEt = $posta.GetType().GetField('grpEtichette', $FIp).GetValue($posta)
    $clbEt = $posta.GetType().GetField('clbEtichette', $FIp).GetValue($posta)
    Verifica "il passo 4 mostra l'etichetta rimasta dal filtro unito, spuntata ($(@($clbEt.Items) -join ', '))" (
        $grpEt.Visible -and $clbEt.Items.Count -eq 1 -and [string]$clbEt.Items[0] -eq ('Famiglie ' + [char]0x2192 + ' Genitori') -and
        $clbEt.GetItemChecked(0))
    ControllaPannello $pannelloF 'Posta / 4 con un''etichetta rimasta da un filtro unito'
    $clbEt.SetItemChecked(0, $false)
    $nonUnire = $tStato.GetField('EtichetteDaNonUnire', $FI).GetValue($stato)
    Verifica "tolta la spunta, il docente non la vuole unire" (@($nonUnire) -contains 'Famiglie')
    $clbEt.SetItemChecked(0, $true)
    Verifica "rimessa, si unisce di nuovo" (-not (@($nonUnire) -contains 'Famiglie'))
    # "Gia' cancellata": spento finche' non selezioni una coppia; premuto, la
    # coppia sparisce (Stato.EtichetteGiaCancellate)
    $btnGia = $posta.GetType().GetField('btnGiaCancellata', $FIp).GetValue($posta)
    Verifica "c'e' il bottone 'Gia'' cancellata', spento finche' non selezioni una coppia" ($null -ne $btnGia -and -not $btnGia.Enabled)
    $clbEt.SelectedIndex = 0
    Verifica "selezionata la coppia, si accende" ($btnGia.Enabled)
    $btnGia.PerformClick()
    [System.Windows.Forms.Application]::DoEvents()
    $giaC = $tStato.GetField('EtichetteGiaCancellate', $FI).GetValue($stato)
    Verifica "premuto: la coppia sparisce, e senza coppie anche il riquadro ($(@($giaC) -join ','))" (
        @($giaC) -contains 'Famiglie' -and $clbEt.Items.Count -eq 0 -and -not $clbEt.Parent.Visible)
    $giaC.Clear()
    $posta.GetType().GetMethod('AggiornaFiltriDaTogliere', $FIp).Invoke($posta, @()) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    # scelto prima della 1.6.2: da controllare, senza spunta, e non si spunta
    $sceltoF.StessaEtichettaInGmail = $null
    $posta.GetType().GetMethod('AggiornaFiltriDaTogliere', $FIp).Invoke($posta, @()) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $clbEt.SetItemChecked(0, $true)
    Verifica "una coppia di un filtro scelto prima della 1.6.2 e' da controllare: senza spunta, e non si spunta ($($clbEt.Items[0]))" (
        $clbEt.Items.Count -eq 1 -and [string]$clbEt.Items[0] -match 'riapri il file dei filtri' -and -not $clbEt.GetItemChecked(0))
    # il riepilogo rilegge le spunte delle regole: quella di Genitori, accesa
    # qui sopra, dev'essere spuntata anche nell'elenco
    $clbGen = $posta.GetType().GetField('clbRegole', $FIp).GetValue($posta)
    $iGen = $regoleD.IndexOf($genD)
    $spuntaGen = $clbGen.GetItemChecked($iGen)
    $clbGen.SetItemChecked($iGen, $true)
    $riepC = [string]$posta.GetType().GetMethod('RiepilogoEtichette', $FIp).Invoke($posta, @())
    $clbGen.SetItemChecked($iGen, $spuntaGen)
    $genD.Attiva = $true
    Verifica "il riepilogo del passo 5 la dice da controllare, anche fra le cose da sistemare, e non da unire ($((($riepC -split "`n") | Where-Object { $_ -match 'controllare|unire' }) -join ' / '))" (
        $riepC -match "Etichette da controllare \.+ 1 \(non si uniscono finche' non riapri il file dei filtri: passo 4\)" -and
        $riepC -match "Un'etichetta rimasta dai filtri uniti e' da controllare: riapri il file in" -and
        $riepC -notmatch 'Etichette rimaste da unire')
    # la riga in basso dice che cosa fare, intera e a sinistra dei bottoni,
    # anche con la finestra piu' stretta: lunga, prima passava sotto i bottoni
    foreach ($larga in @(1080, 1240)) {
        $guscio.Size = New-Object System.Drawing.Size($larga, 880)
        [System.Windows.Forms.Application]::DoEvents()
        $rS = $lblStato.Bounds
        $altaS = [System.Windows.Forms.TextRenderer]::MeasureText($lblStato.Text, $lblStato.Font,
                     (New-Object System.Drawing.Size($rS.Width, [int]::MaxValue)),
                     [System.Windows.Forms.TextFormatFlags]'WordBreak, TextBoxControl').Height
        Verifica "larga $larga : la riga in basso dice di riaprire il file, ci sta intera ($altaS px su $($rS.Height)) e non tocca i bottoni ($rS, Indietro da $($btnIndietro.Left))" (
            $lblStato.Text -match '^Per unire Famiglie riapri il file in "Filtri che hai gia'' in Gmail\.\.\." e premi "Usa questa scelta"' -and
            $btnIndietro.Visible -and $btnAvanti.Visible -and $rS.Right -lt $btnIndietro.Left -and
            $rS.Top -ge 0 -and $rS.Bottom -le $piede.Height -and $altaS -le $rS.Height)
    }
    $guscio.Size = New-Object System.Drawing.Size(1240, 880)
    [System.Windows.Forms.Application]::DoEvents()
    ControllaPannello $pannelloF 'Posta / 4 con un''etichetta rimasta da controllare'
    $sceltoF.StessaEtichettaInGmail = $null
    [void]$genD.Da.Remove('@famiglie.example')
    $genD.Attiva = $genAttiva
    $tDT.GetField('Etichetta').SetValue($sceltoF, $etichettaPrima)
    $sceltoF.Criteri.Clear()
    $sceltoF.Criteri['from'] = 'vecchio@scuola.example'
    $sceltoF.Regola = ''
    $tStato.GetField('FiltriDaTogliere', $FI).SetValue($stato, [Activator]::CreateInstance([System.Collections.Generic.List`1].MakeGenericType($tDT)))
    $posta.GetType().GetMethod('AggiornaFiltriDaTogliere', $FIp).Invoke($posta, @()) | Out-Null
    Verifica "e senza filtri lo dice" ($lblF.Text -eq 'Nessun filtro di Gmail da togliere.')

    # la casella della scuola in Segreteria e una Ministero e USR salvata
    # prima, senza esclusioni: l'avviso ambra con il suo bottone, sotto quello
    # dei doppioni dei ruoli, ci sta; il bottone lo fa sparire
    $txtSeg = $posta.GetType().GetField('txtSegreteria', $FIp).GetValue($posta)
    $segPrima = $txtSeg.Text
    $txtSeg.Text = "segreteria@scuola.example`r`ncasella@istruzione.it"
    $regoleP = $tStato.GetField('Regole', $FI).GetValue($stato)
    $minP = @($regoleP | Where-Object { $_.Etichetta -eq 'Ministero e USR' })[0]
    $escludePrima = @($minP.EscludiEtichette)
    $minP.EscludiEtichette.Clear()
    $posta.GetType().GetMethod('AggiornaElencoRegole', $FIp).Invoke($posta, @([int]0)) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $lblCas = $posta.GetType().GetField('lblCasella', $FIp).GetValue($posta)
    $btnCas = $posta.GetType().GetField('btnCasella', $FIp).GetValue($posta)
    $lblDop = $posta.GetType().GetField('lblDoppioni', $FIp).GetValue($posta)
    Verifica "l'avviso della casella della scuola c'e', con il bottone, sotto quello dei doppioni ('$($lblCas.Text.Substring(0, [Math]::Min(60, $lblCas.Text.Length)))...')" (
        $lblCas.Visible -and $btnCas.Visible -and $lblCas.Text -match 'casella@istruzione\.it' -and
        $lblCas.ForeColor.ToArgb() -eq (ColoreTema 'Ambra') -and $btnCas.Top -ge $lblCas.Bottom -and
        (-not $lblDop.Visible -or $lblCas.Top -ge $lblDop.Bottom))
    ControllaPannello $pannelloF 'Posta / 4 con l''avviso della casella della scuola'
    $onClickCas = [System.Windows.Forms.Control].GetMethod('OnClick', [System.Reflection.BindingFlags]'NonPublic,Instance')
    $onClickCas.Invoke($btnCas, @([System.EventArgs]::Empty)) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "il bottone fa escludere Dirigenza e Segreteria, e l'avviso sparisce" (
        -not $lblCas.Visible -and -not $btnCas.Visible -and (@($minP.EscludiEtichette) -join ',') -eq 'Dirigenza,Segreteria')
    $minP.EscludiEtichette.Clear()
    foreach ($e in $escludePrima) { $minP.EscludiEtichette.Add($e) }
    $txtSeg.Text = $segPrima
    $posta.GetType().GetMethod('AggiornaElencoRegole', $FIp).Invoke($posta, @([int]0)) | Out-Null
}
# --- le mie classi: il bottone del passo 4 e la sua finestra --------------------
# Il bottone sta accanto a "Filtri che hai gia' in Gmail...", con il suo "?",
# dentro la colonna delle regole. La finestra sta in piedi senza classi (dice
# dove prenderle), con le classi, gli indirizzi incollati e le regole dell'anno
# prima; i suoi "?" si aprono.
Write-Host "`nLE MIE CLASSI" -ForegroundColor Cyan
$metodoVaiA.Invoke($guscio, @([int]$iPosta, [int]3)) | Out-Null
[System.Windows.Forms.Application]::DoEvents()
$pannello4 = $null
foreach ($c in $posta.Controls) {
    if ($c.Visible -and $c -is [System.Windows.Forms.Panel] -and $c.Dock -eq [System.Windows.Forms.DockStyle]::Fill) { $pannello4 = $c }
}
$btnClassi = @($pannello4.Controls | Where-Object { $_ -is [System.Windows.Forms.Button] -and $_.Text -eq 'Le mie classi...' })
$btnFiltri = @($pannello4.Controls | Where-Object { $_ -is [System.Windows.Forms.Button] -and $_.Text -eq "Filtri che hai gia' in Gmail..." })
$clbR = $posta.GetType().GetField('clbRegole', $FIp).GetValue($posta)
$aiutoClassi = @($pannello4.Controls | Where-Object { ($_.Tag -is [string]) -and $_.Tag -eq 'aiuto' -and $btnClassi.Count -eq 1 -and
    $_.Left -gt $btnClassi[0].Right -and $_.Left -lt $btnClassi[0].Right + 20 -and [Math]::Abs($_.Top - $btnClassi[0].Top) -lt 12 })
Verifica "il passo 4 ha il bottone 'Le mie classi...', accanto ai filtri, con il suo '?', dentro la colonna delle regole" (
    $btnClassi.Count -eq 1 -and $btnFiltri.Count -eq 1 -and $btnClassi[0].Top -eq $btnFiltri[0].Top -and
    $btnClassi[0].Left -gt $btnFiltri[0].Right -and $aiutoClassi.Count -eq 1 -and $aiutoClassi[0].Right -le $clbR.Right + 12)
ControllaPannello $pannello4 'Posta / 4 con il bottone delle classi'

$tFC = $asm.GetType('Campanella.FormClassi')
Verifica "c'e' la finestra delle classi" ($null -ne $tFC)
if ($null -ne $tFC) {
    # chiudendo, la finestra chiede se perdere quello che c'e' (gli indirizzi
    # incollati) e se svuotare gli appunti: qui si risponde "si'" senza finestre
    $sempreSi = [Func[string, string, bool]]{ param($testo, $titolo) $script:domandeFC += $titolo; return $true }
    $script:domandeFC = @()
    function MostraFC() {
        $f = [Activator]::CreateInstance($tFC, @($stato.PSObject.BaseObject))
        $f.Chiedi = $sempreSi
        $f.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
        $f.Location = New-Object System.Drawing.Point(-4000, -4000)
        $f.Show()
        [System.Windows.Forms.Application]::DoEvents()
        return $f
    }
    $classiPrima = $tStato.GetField('Classi', $FI).GetValue($stato)
    $tStato.GetField('Classi', $FI).SetValue($stato, '')
    $fv = MostraFC
    $lblDaDove = $tFC.GetField('lblDaDove', $FIp).GetValue($fv)
    Verifica "senza classi dice dove prenderle ('$($lblDaDove.Text.Substring(0, 40))...')" (
        $lblDaDove.Visible -and $lblDaDove.Text -match '^Non ho trovato classi' -and $lblDaDove.Text -match 'Orari' -and
        $lblDaDove.Text -match 'Cartelle')
    ControllaPannello $fv 'Le mie classi, senza classi'
    $fv.Close(); $fv.Dispose()

    # con le classi di Cartelle, una regola dell'anno prima e gli indirizzi incollati
    $tStato.GetField('Classi', $FI).SetValue($stato, "1A: Matematica`r`n3B LSA: Fisica`r`n5AL")
    $regoleD = $tStato.GetField('Regole', $FI).GetValue($stato)
    $vecchia = [Activator]::CreateInstance($asm.GetType('Campanella.Regola'))
    $vecchia.Etichetta = 'Classi 2025-26/2B'
    $vecchia.Sorgente = 'classe'
    $vecchia.Da.Add('@CLASSE:2B@')
    $vecchia.UnoQualsiasi = $true
    $regoleD.Add($vecchia)
    $fc = MostraFC
    $fc.Incolla(1, ((1..45 | ForEach-Object { "studente$_@studenti.scuola.example" }) -join ', ') + ', rossi.mario@scuola.example')
    $fc.Scegli(1)
    [System.Windows.Forms.Application]::DoEvents()
    $avvisoFC = $tFC.GetField('lblAvviso', $FIp).GetValue($fc)
    $chkV = $tFC.GetField('chkVecchie', $FIp).GetValue($fc)
    Verifica "con le classi, gli indirizzi incollati e l'anno prima: tutto quello che serve si vede" (
        $fc.Classi.Count -eq 3 -and $avvisoFC.Text -match "sembra piu' di una classe" -and $avvisoFC.Text -match '1 del personale' -and
        $chkV.Visible -and $chkV.Text -match 'del 2025-26 \(1\)' -and -not $chkV.Checked)
    ControllaPannello $fc 'Le mie classi, con classi e indirizzi'
    ControllaAiuti $fc 'Le mie classi'
    $fc.Close(); $fc.Dispose()
    Verifica "chiusa con gli indirizzi incollati e non copiati, ha chiesto prima di chiudere ($($script:domandeFC -join ', '))" (
        ($script:domandeFC -join '|') -eq 'Chiudere senza usare le classi?')
    [void]$regoleD.Remove($vecchia)

    # la madre senza l'anno: l'avviso di una classe che ha gia' la regola dice
    # anche che l'anno dopo il file va copiato di nuovo, e ci sta
    $senzaAnno = [Activator]::CreateInstance($asm.GetType('Campanella.Regola'))
    $senzaAnno.Etichetta = 'Le mie classi/3B LSA'
    $senzaAnno.Sorgente = 'classe'
    $senzaAnno.Da.Add('@CLASSE:3B LSA@')
    $senzaAnno.UnoQualsiasi = $true
    $regoleD.Add($senzaAnno)
    # $fsa e non $fs: PowerShell non bada alle maiuscole, e $fs cambierebbe le
    # BindingFlags $FS che servono piu' sotto (il passo 4 degli Orari)
    $fsa = MostraFC
    $iS = -1
    for ($k = 0; $k -lt $fsa.Classi.Count; $k++) { if ($fsa.Classi[$k].Nome -eq '3B LSA') { $iS = $k } }
    $fsa.Scegli($iS)
    [System.Windows.Forms.Application]::DoEvents()
    $avvisoS = $tFC.GetField('lblAvviso', $FIp).GetValue($fsa)
    Verifica "con la madre senza l'anno l'avviso della classe con la regola lo dice" (
        $fsa.Madre -eq 'Le mie classi' -and $iS -ge 0 -and $avvisoS.Text -match "non ha l'anno")
    ControllaPannello $fsa "Le mie classi, madre senza l'anno"
    $fsa.Close(); $fsa.Dispose()
    [void]$regoleD.Remove($senzaAnno)
    $tStato.GetField('Classi', $FI).SetValue($stato, $classiPrima)
}

# --- la finestra della regola di Segreteria: "Apri La tua scuola" ---------------
# Per Dirigenza, Segreteria e Registro elettronico la casella dei mittenti ha
# solo l'avviso che si scrivono nella pagina "La tua scuola", e accanto c'e'
# il bottone che ci porta. La finestra sta in piedi, con l'avviso che si legge
# tutto nella casella piu' stretta; premuto il bottone, la Posta e' a "La tua
# scuola" con il cursore nella casella della Segreteria. La finestra della
# regola si apre fuori dallo schermo, come quella principale.
Write-Host "`nLA FINESTRA DELLA REGOLA DI SEGRETERIA" -ForegroundColor Cyan
$tFRd = $asm.GetType('Campanella.FormRegola')
$regoleS = $tStato.GetField('Regole', $FI).GetValue($stato)
$iSeg = -1
for ($k = 0; $k -lt $regoleS.Count; $k++) { if ($regoleS[$k].Etichetta -eq 'Segreteria') { $iSeg = $k } }
$metodoVaiA.Invoke($guscio, @([int]$iPosta, [int]3)) | Out-Null
[System.Windows.Forms.Application]::DoEvents()
$frS = [Activator]::CreateInstance($tFRd, @($regoleS[$iSeg].PSObject.BaseObject))
$frS.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$frS.Location = New-Object System.Drawing.Point(-4000, -4000)
$frS.ShowInTaskbar = $false
$frS.Show()
[System.Windows.Forms.Application]::DoEvents()
$btnS = @($frS.Controls | Where-Object { $_ -is [System.Windows.Forms.Button] -and $_.Text -eq 'Apri La tua scuola' })
$txtDaS = $tFRd.GetField('txtDa', $FIp).GetValue($frS)
$fondoDa = $txtDaS.GetPositionFromCharIndex($txtDaS.Text.Length - 1).Y + $txtDaS.Font.Height
$serveB = [System.Windows.Forms.TextRenderer]::MeasureText($btnS[0].Text, $btnS[0].Font).Width
Verifica "la regola di Segreteria ha 'Apri La tua scuola' accanto ai mittenti, dentro la finestra, e l'avviso si legge tutto" (
    $btnS.Count -eq 1 -and $btnS[0].Top -eq $txtDaS.Top -and $btnS[0].Left -ge $txtDaS.Right -and
    $btnS[0].Right -le $frS.ClientSize.Width - 8 -and $btnS[0].Width -ge $serveB + 12 -and $fondoDa -le $txtDaS.ClientSize.Height)
ControllaPannello $frS 'La regola di Segreteria'
$onClick.Invoke($btnS[0], @([System.EventArgs]::Empty)) | Out-Null
$esitoS = $frS.DialogResult
$doveS = $frS.ApriLaTuaScuola
$frS.Close()
[System.Windows.Forms.Application]::DoEvents()
$posta.GetType().GetMethod('DopoLaRegola', $FIp).Invoke($posta, @([int]$iSeg, $frS, $esitoS)) | Out-Null
[System.Windows.Forms.Application]::DoEvents()
$txtSegS = $posta.GetType().GetField('txtSegreteria', $FIp).GetValue($posta)
Verifica "premuto: la Posta e' a 'La tua scuola', con il cursore nella casella della Segreteria ($esitoS, $doveS)" (
    $esitoS -eq [System.Windows.Forms.DialogResult]::Cancel -and $doveS -eq 'segreteria' -and $posta.Passo -eq 1 -and
    $txtSegS.Visible -and [object]::ReferenceEquals($guscio.ActiveControl, $txtSegS))
$frS.Dispose()

# tutto come prima
$personale.GetType().GetMethod('Clear').Invoke($personale, @()) | Out-Null
$tStato.GetField('EtichettaPerRuolo', $FI).SetValue($stato, $false)

# --- Orari, passo 4: i giorni senza lezione e il cambio d'orario ---------------
# Con un orario vero (il tabellone d'esempio), il tuo nome, giorni senza
# lezione che contengono anche righe lunghe che non si capiscono, e il cambio
# d'orario acceso: il riepilogo e' al suo massimo, e la pagina deve stare in
# piedi lo stesso. Poi la spunta accende e spegne la data, e il bottone delle
# feste le aggiunge una volta sola.
Write-Host "`nORARI, PASSO 4: GIORNI SENZA LEZIONE E CAMBIO D'ORARIO" -ForegroundColor Cyan
$iOrari = -1
for ($k = 0; $k -lt $pagine.Count; $k++) { if ($pagine[$k].Nome -eq 'Orari') { $iOrari = $k } }
$orari = $pagine[$iOrari]
$tPO = $orari.GetType()
$campiNuovi = @('txtSospensioni', 'chkValidoDal', 'dtValidoDal', 'lblCalRiepilogo')
$mancanti = @($campiNuovi | Where-Object { $null -eq $tPO.GetField($_, $FIp) })
Verifica "il passo 4 ha la casella dei giorni senza lezione, la spunta e la data del cambio d'orario$(if ($mancanti.Count) { ' (mancano: ' + ($mancanti -join ', ') + ')' })" (
    $mancanti.Count -eq 0 -and $null -ne $tStato.GetField('CalSospensioni', $FI))
if ($mancanti.Count -eq 0 -and $null -ne $tStato.GetField('CalSospensioni', $FI)) {
    $tX = $asm.GetType('Campanella.Xlsx')
    $tA = $asm.GetType('Campanella.AnalisiOrario')
    $fogliProva = $tX.GetMethod('Leggi', $FS).Invoke($null, @([string](Join-Path $radice 'test\tabellone_esempio.csv')))
    $tPO.GetField('orario', $FIp).SetValue($orari, $tA.GetMethod('Analizza', $FS).Invoke($null, @($fogliProva[0])))
    $sospProva = @(
        '# le date della circolare',
        '01/11 Tutti i Santi',
        'dal 23/12/2026 al 06/01/2027 Vacanze di Natale',
        "29/03/2027 Lunedi' dell'Angelo",
        'una riga lunga che non e'' una data e che il riepilogo deve mostrare senza uscire dal suo spazio, anche se e'' molto lunga',
        '31/02/2027 Carnevale inventato, con un giorno che non esiste e un nome lungo lungo lungo',
        'e un''altra ancora') -join "`r`n"
    foreach ($c in @(@('CalDocente', 'ROSSI'), @('CalNome', 'Orario ROSSI'), @('CalInizio', '2026-09-14'),
                     @('CalFine', '2027-06-10'), @('CalSospensioni', $sospProva), @('CalValidoDal', '2026-10-05'))) {
        $tStato.GetField($c[0], $FI).SetValue($stato, [string]$c[1])
    }
    $tPO.GetMethod('MostraCalendario', $FIp).Invoke($orari, @()) | Out-Null
    $metodoVaiA.Invoke($guscio, @([int]$iOrari, [int]3)) | Out-Null
    [System.Windows.Forms.Application]::DoEvents()
    $txtSosp = $tPO.GetField('txtSospensioni', $FIp).GetValue($orari)
    $chkCambio = $tPO.GetField('chkValidoDal', $FIp).GetValue($orari)
    $dtCambio = $tPO.GetField('dtValidoDal', $FIp).GetValue($orari)
    $lblRiep = $tPO.GetField('lblCalRiepilogo', $FIp).GetValue($orari)
    Verifica "la casella va a capo e ha la barra per scorrere, e mostra i giorni salvati" (
        $txtSosp.Multiline -and $txtSosp.ScrollBars -eq [System.Windows.Forms.ScrollBars]::Vertical -and
        $txtSosp.Text -eq $sospProva)
    Verifica "il cambio d'orario salvato: spunta accesa e data del 5 ottobre" (
        $chkCambio.Checked -and $dtCambio.Enabled -and $dtCambio.Value.ToString('yyyy-MM-dd') -eq '2026-10-05')
    $testoRiep = ($lblRiep.Text -replace '\s+', ' ')
    Write-Host "          riepilogo: $testoRiep"
    Verifica "il riepilogo dice quante serie e quante lezioni saltate" ($lblRiep.Text -match '\d+ serie' -and $lblRiep.Text -match '\d+ lezioni saltate')
    Verifica "e le righe che non capisce, come avviso" ($lblRiep.Text -match 'non capit' -and [string]$lblRiep.Tag -eq 'avviso')
    Verifica "e il cambio d'orario con ORARI_5_cambioOrario" ($lblRiep.Text -match 'ORARI_5_cambioOrario')
    $pannelloOrari = $null
    foreach ($c in $orari.Controls) {
        if ($c.Visible -and $c -is [System.Windows.Forms.Panel] -and $c.Dock -eq [System.Windows.Forms.DockStyle]::Fill) { $pannelloOrari = $c }
    }
    ControllaPannello $pannelloOrari 'Orari / 4 con giorni senza lezione e cambio d''orario'
    ControllaAiuti $pannelloOrari 'Orari / 4 con giorni senza lezione e cambio d''orario'
    # dove metti l'orario: di partenza nell'account della scuola, con i dati di
    # tutto il tabellone; in un altro account il menu da' Calendario.gs e i dati
    # del solo docente, con le istruzioni per quell'account, e la pagina sta in
    # piedi lo stesso. La scelta va nelle impostazioni
    $campoScuola = $tPO.GetField('rbScuola', $FIp)
    $campoAltro = $tPO.GetField('rbAltroAccount', $FIp)
    $rbScuola = if ($null -ne $campoScuola) { $campoScuola.GetValue($orari) } else { $null }
    $rbAltro = if ($null -ne $campoAltro) { $campoAltro.GetValue($orari) } else { $null }
    $cmb4 = $tPO.GetField('cmbCosaVedere4', $FIp).GetValue($orari)
    $txt4 = $tPO.GetField('txtAnteprima4', $FIp).GetValue($orari)
    $cmbNome4 = $tPO.GetField('cmbDocente', $FIp).GetValue($orari)
    function Voci4 { @($cmb4.Items | ForEach-Object { [string]$_ }) }
    Verifica "il passo 4 chiede dove metti l'orario: di partenza nell'account della scuola, con i dati di tutto il tabellone ($((Voci4) -join ' | '))" (
        $null -ne $rbScuola -and $null -ne $rbAltro -and $rbScuola.Visible -and $rbAltro.Visible -and $rbScuola.Checked -and
        -not $rbAltro.Checked -and $rbScuola.Text -match "nell'account della scuola, nello stesso progetto della Posta" -and
        $rbAltro.Text -match 'in un altro account Google, per esempio il tuo personale' -and
        (Voci4).Count -eq 2 -and (Voci4)[0] -match 'DatiOrari\.gs' -and $rbAltro.Bottom -le $cmbNome4.Top - 20)
    if ($null -ne $rbAltro) {
        $rbAltro.Checked = $true
        [System.Windows.Forms.Application]::DoEvents()
        $voci = Voci4
        Verifica "con un altro account il menu da' il codice solo calendario, i dati del solo docente e le istruzioni, e la scelta va nelle impostazioni ($($voci -join ' | '))" (
            [bool]$tStato.GetField('CalAltroAccount', $FI).GetValue($stato) -and $voci.Count -eq 3 -and
            $voci[0] -eq '1. Codice solo calendario (Calendario.gs)' -and $voci[1] -eq '2. Dati del tuo orario (DatiOrari.gs, solo il tuo)' -and
            $voci[2] -eq '3. Cosa fare, passo per passo' -and $cmb4.SelectedIndex -eq 2)
        $larghe = @($voci | Where-Object { [System.Windows.Forms.TextRenderer]::MeasureText($_, $cmb4.Font).Width -gt $cmb4.Width - 24 })
        Verifica "  ...ogni voce ci sta nel menu$(if ($larghe.Count) { ' (non ci sta: ' + ($larghe -join ', ') + ')' })" ($larghe.Count -eq 0)
        $guida = ($txt4.Text -replace '\s+', ' ')
        Verifica "  ...le istruzioni sono quelle per l'altro account" (
            $guida -match 'IN UN ALTRO ACCOUNT' -and $guida -match "Apri script\.google\.com CON QUELL'ACCOUNT" -and $guida -match 'Nuovo progetto')
        $cmb4.SelectedIndex = 0
        [System.Windows.Forms.Application]::DoEvents()
        Verifica "  ...la prima voce mostra Calendario.gs, senza le email" (
            $txt4.Text.StartsWith('/**') -and $txt4.Text -match 'Calendario\.gs versione' -and $txt4.Text -notmatch 'MailApp|GmailApp|ORARI_2_invia')
        $cmb4.SelectedIndex = 1
        [System.Windows.Forms.Application]::DoEvents()
        $altriDoc = @($tPO.GetField('orario', $FIp).GetValue($orari).Docenti() | Where-Object { $_ -ne 'ROSSI' })
        $conAltri = @($altriDoc | Where-Object { $txt4.Text -cmatch ('(?<![A-Za-z])' + [regex]::Escape($_) + '(?![A-Za-z])') })
        Verifica "  ...la seconda i dati del solo docente: ROSSI, nessuno degli altri $($altriDoc.Count) docenti del tabellone$(if ($conAltri.Count) { ' (ci sono: ' + ($conAltri -join ', ') + ')' })" (
            $txt4.Text -match 'DATI DEL TUO ORARIO' -and $txt4.Text -cmatch '"ROSSI"' -and $altriDoc.Count -ge 4 -and $conAltri.Count -eq 0)
        ControllaPannello $pannelloOrari 'Orari / 4 con l''orario in un altro account'
        ControllaAiuti $pannelloOrari 'Orari / 4 con l''orario in un altro account'
        if ($Immagini) {
            $bmp = New-Object System.Drawing.Bitmap($guscio.Width, $guscio.Height)
            $guscio.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $guscio.Width, $guscio.Height)))
            $bmp.Save((Join-Path $cartella '37-Orari-4-altro-account.png'), [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Dispose()
        }
        $rbScuola.Checked = $true
        [System.Windows.Forms.Application]::DoEvents()
        Verifica "tornato all'account della scuola, il menu e le istruzioni tornano com'erano" (
            -not [bool]$tStato.GetField('CalAltroAccount', $FI).GetValue($stato) -and (Voci4).Count -eq 2 -and $cmb4.SelectedIndex -eq 1 -and
            $txt4.Text -notmatch 'IN UN ALTRO ACCOUNT' -and $txt4.Text -match 'PASSO PER PASSO')
    }
    # i colori delle classi: il bottone, e accanto le classi di ROSSI con il loro
    # colore, che restano nelle impostazioni
    $campoBtnColori = $tPO.GetField('btnColori', $FIp)
    $campoRiepColori = $tPO.GetField('riepilogoColori', $FIp)
    $btnColori = if ($null -ne $campoBtnColori) { $campoBtnColori.GetValue($orari) } else { $null }
    $riepColori = if ($null -ne $campoRiepColori) { $campoRiepColori.GetValue($orari) } else { $null }
    $classiRossi = @($tA.GetMethod('ClassiDelCalendario', $FS, $null, [Type[]]@($asm.GetType('Campanella.RisultatoOrario'), [string]), $null).Invoke($null, @($tPO.GetField('orario', $FIp).GetValue($orari), [string]'ROSSI')))
    $senzaColore = @($classiRossi | Where-Object { $null -ne $riepColori -and $riepColori.Text -notlike "*$_ *" })
    Verifica "accanto a 'Titoli e colori delle lezioni...' ci sono le $($classiRossi.Count) classi di ROSSI con il loro colore, tutte visibili ($(if ($riepColori) { $riepColori.Text }))" (
        $null -ne $btnColori -and $btnColori.Visible -and $btnColori.Text -eq 'Titoli e colori delle lezioni...' -and
        $null -ne $riepColori -and $riepColori.Visible -and $classiRossi.Count -gt 1 -and $riepColori.Text -like 'Colori: *' -and
        $senzaColore.Count -eq 0 -and $riepColori.Visibili -eq $classiRossi.Count -and
        $riepColori.Bottom -le $txtSosp.Top -and $riepColori.Left -gt $btnColori.Right)
    # il riepilogo li calcola su una copia: scrivendo il nome ('B' e' BIANCHI,
    # per prefisso) le impostazioni non cambiano. I colori restano quando
    # DatiOrari.gs esce da Campanella, copiato o salvato (DatiOrariDaDare)
    $cmbDoc = $tPO.GetField('cmbDocente', $FIp).GetValue($orari)
    # il nome del calendario segue il nome del docente solo se era quello
    # proposto: uno scritto a mano (anche "Orario ...") resta, se no lo
    # script creerebbe un calendario nuovo
    $txtCalNomeT = $tPO.GetField('txtCalNome', $FIp).GetValue($orari)
    $nomePrima = $txtCalNomeT.Text
    $cmbDoc.Text = 'BIANCHI'
    [System.Windows.Forms.Application]::DoEvents()
    $seguito = $txtCalNomeT.Text
    $txtCalNomeT.Text = 'Orario mio di prova'
    $cmbDoc.Text = 'ROSSI'
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "il nome del calendario proposto segue il nome ('$nomePrima' -> '$seguito'); uno scritto a mano, anche 'Orario ...', resta ('$($txtCalNomeT.Text)')" (
        $seguito -eq 'Orario BIANCHI' -and $txtCalNomeT.Text -eq 'Orario mio di prova')
    $txtCalNomeT.Text = $nomePrima
    $cmbDoc.Text = 'B'
    [System.Windows.Forms.Application]::DoEvents()
    $cmbDoc.Text = 'ROSSI'
    [System.Windows.Forms.Application]::DoEvents()
    $coloriStato = $tStato.GetField('CalColori', $FI).GetValue($stato)
    $primaDiCopiare = if ($null -ne $coloriStato) { $coloriStato.Count } else { -1 }
    $metodoDaDare = $tPO.GetMethod('DatiOrariDaDare', $FIp)
    $datiDaDare = if ($null -ne $metodoDaDare) { [string]$metodoDaDare.Invoke($orari, @()) } else { '' }
    $coloriStato = $tStato.GetField('CalColori', $FI).GetValue($stato)
    $campoScritti = $tStato.GetField('CalColoriScritti', $FI)
    $scrittiStato = if ($null -ne $campoScritti) { $campoScritti.GetValue($stato) } else { $null }
    Verifica "  ...che scrivendo il nome (con 'B' e' BIANCHI) non restano nelle impostazioni ($primaDiCopiare), e con DatiOrari.gs copiato o salvato si': quelli delle classi di ROSSI, sul calendario ($(if ($coloriStato) { @($coloriStato.Keys) -join ', ' }))" (
        $primaDiCopiare -eq 0 -and $datiDaDare -match 'colori:' -and $null -ne $scrittiStato -and
        $coloriStato.Count -eq $classiRossi.Count -and $scrittiStato.Count -eq $classiRossi.Count -and
        @($classiRossi | Where-Object { -not $coloriStato.ContainsKey($_) -or -not $scrittiStato.ContainsKey($_) }).Count -eq 0)
    if ($null -ne $riepColori) {
        # con tante classi, quelle che non ci stanno diventano "e altre N"
        $tante = New-Object 'System.Collections.Generic.List[string]'
        foreach ($i in 1..30) { $tante.Add("$($i)B LSA") }
        $vuoti = New-Object 'System.Collections.Generic.Dictionary[string,string]'
        $prova = [Activator]::CreateInstance($riepColori.GetType(), @([int]0, [int]0, [int]$riepColori.Width, [int]$riepColori.Height))
        $prova.Mostra($tante, $vuoti, '')
        Verifica "  ...con 30 classi se ne vedono $($prova.Visibili), le altre sono 'e altre N'" (
            $prova.Visibili -gt 3 -and $prova.Visibili -lt 30 -and $prova.Text -like '*30B LSA colore del calendario')
        $prova.Dispose()
    }
    # sotto la casella, come ha letto ogni riga: una per riga scritta (le note
    # no), con i giorni della settimana, e in ambra quelle da guardare
    $campoLette = $tPO.GetField('lstLette', $FIp)
    $lstLette = if ($null -ne $campoLette) { $campoLette.GetValue($orari) } else { $null }
    $voci = @(if ($null -ne $lstLette) { $lstLette.Items | ForEach-Object { $_.ToString() } })
    Verifica "sotto la casella c'e' come ha letto ogni riga, una per riga scritta ($($voci.Count): $($voci -join ' | '))" (
        $null -ne $lstLette -and $voci.Count -eq 6 -and
        $voci[0] -eq 'riga 2: dal dom 01/11/2026 al dom 01/11/2026 (1 giorno) Tutti i Santi' -and
        $voci[1] -eq 'riga 3: dal mer 23/12/2026 al mer 06/01/2027 (15 giorni) Vacanze di Natale' -and
        $voci[3] -match '^riga 5: non capita: ' -and $lstLette.Top -ge $txtSosp.Bottom -and $lstLette.Bottom -le $chkCambio.Top)
    if ($null -ne $lstLette) {
        $inAmbra = @($lstLette.Items | Where-Object { $_.DaGuardare }).Count
        Verifica "in ambra quelle da guardare: le tre non capite ($inAmbra)" ($inAmbra -eq 3)
        # si aggiorna mentre si scrive: un giorno solo con il resto nel nome si vede subito
        $txtSosp.Text = $sospProva + "`r`n07/12/2026 ponte 7-8"
        [System.Windows.Forms.Application]::DoEvents()
        $ultima = [string]$lstLette.Items[$lstLette.Items.Count - 1]
        Verifica "scrivendo una riga la lista la mostra subito, da guardare ('$ultima')" (
            $ultima -match '^riga 8: dal lun 07/12/2026 al lun 07/12/2026 \(1 giorno\) ponte 7-8   <- nel motivo c''e'' un numero' -and
            $lstLette.Items[$lstLette.Items.Count - 1].DaGuardare)
        Verifica "e il riepilogo lo dice in ambra" ($lblRiep.Text -match 'un numero' -and [string]$lblRiep.Tag -eq 'avviso')
        # un giorno che sembra l'inizio di un periodo: in ambra anche lui, e il riepilogo lo conta
        $txtSosp.Text = $sospProva + "`r`n07/12/2026 ponte 7-8`r`n23/12/2026 Vacanze natalizie"
        [System.Windows.Forms.Application]::DoEvents()
        $ultima = [string]$lstLette.Items[$lstLette.Items.Count - 1]
        Verifica "un giorno solo che sembra l'inizio di un periodo e' da guardare ('$ultima'), e il riepilogo conta le due righe" (
            $ultima -match "^riga 9: dal mer 23/12/2026 al mer 23/12/2026 \(1 giorno\) Vacanze natalizie   <- sembra l'inizio o la fine di un periodo" -and
            $lstLette.Items[$lstLette.Items.Count - 1].DaGuardare -and ($lblRiep.Text -replace '\s+', ' ') -match '2 righe hanno nel motivo' -and
            ($lblRiep.Text -replace '\s+', ' ') -match "l'inizio o la fine di un periodo scritti come un giorno solo" -and
            [string]$lblRiep.Tag -eq 'avviso')
        # scrivendo in fondo, la lista scorre fino alla riga che si sta scrivendo
        $txtSosp.SelectionStart = $txtSosp.TextLength
        $tPO.GetMethod('AggiornaCalendario', $FIp).Invoke($orari, @()) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        $visibili = [math]::Floor($lstLette.ClientSize.Height / $lstLette.ItemHeight)
        Verifica "e scorre fino alla riga che si sta scrivendo (dalla $($lstLette.TopIndex + 1)a, $visibili visibili su $($lstLette.Items.Count))" (
            $visibili -ge 4 -and $lstLette.TopIndex + $visibili -ge $lstLette.Items.Count -and $lstLette.TopIndex -gt 0)
        $txtSosp.SelectionStart = 0
        $tPO.GetMethod('AggiornaCalendario', $FIp).Invoke($orari, @()) | Out-Null
        Verifica "  ...e torna in cima con il cursore in cima" ($lstLette.TopIndex -eq 0)
        ControllaPannello $pannelloOrari 'Orari / 4 con una riga da controllare'
        if ($Immagini) {
            $bmp = New-Object System.Drawing.Bitmap($guscio.Width, $guscio.Height)
            $guscio.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $guscio.Width, $guscio.Height)))
            $bmp.Save((Join-Path $cartella '35-Orari-4-come-ho-letto-le-righe.png'), [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Dispose()
        }
        $txtSosp.Text = $sospProva
        [System.Windows.Forms.Application]::DoEvents()
    }
    # i colloqui con le famiglie: sotto i giorni senza lezione, la casella, il
    # bottone per importarli da un file e la lista di come ho letto ogni riga
    # (in ambra quelle da guardare), sopra il cambio d'orario. Il riepilogo li
    # conta, e i colori hanno anche la riga Colloqui
    $campoColl = $tPO.GetField('txtColloqui', $FIp)
    $campoLstColl = $tPO.GetField('lstColloqui', $FIp)
    $txtColl = if ($null -ne $campoColl) { $campoColl.GetValue($orari) } else { $null }
    $lstColl = if ($null -ne $campoLstColl) { $campoLstColl.GetValue($orari) } else { $null }
    $btnImporta = $null
    foreach ($c in $pannelloOrari.Controls) { if ($c -is [System.Windows.Forms.Button] -and $c.Text -eq 'Importa da un file...') { $btnImporta = $c } }
    Verifica "sotto i giorni senza lezione ci sono i colloqui: la casella, 'Importa da un file...' accanto e la lista, sopra il cambio d'orario" (
        $null -ne $txtColl -and $null -ne $lstColl -and $null -ne $btnImporta -and $txtColl.Multiline -and
        $txtColl.Top -ge $lstLette.Bottom -and $btnImporta.Left -gt $txtColl.Right -and $btnImporta.Top -ge $lstLette.Bottom -and
        $lstColl.Top -ge $txtColl.Bottom -and $lstColl.Bottom -le $chkCambio.Top)
    if ($null -ne $txtColl -and $null -ne $lstColl) {
        $collProva = @(
            '# i miei colloqui (link inventati)',
            'ogni giovedi 10:10-11:10 Ricevimento https://meet.google.com/abc-defg-hij',
            '15/12/2026 15:00-18:00 Colloqui generali https://meet.google.com/kmn-pqrs-tuv',
            '16/12/2026 Colloqui senza ora',
            'ogni domenica 9-10',
            'questa riga non si capisce, e il riepilogo deve restare nel suo spazio anche se e'' molto lunga lunga lunga',
            'niente colloqui dal 14/12/2026 al 09/01/2027') -join "`r`n"
        $txtColl.Text = $collProva
        [System.Windows.Forms.Application]::DoEvents()
        $vociColl = @($lstColl.Items | ForEach-Object { $_.ToString() })
        Verifica "la lista dice come ha letto ogni riga dei colloqui ($($vociColl.Count): $($vociColl -join ' | '))" (
            $vociColl.Count -eq 6 -and
            $vociColl[0] -eq "riga 2: ogni giovedi' 10:10-11:10, Ricevimento, per tutto il periodo, con il link del Meet" -and
            $vociColl[1] -eq 'riga 3: mar 15/12/2026 15:00-18:00, Colloqui generali, con il link del Meet' -and
            $vociColl[4] -match '^riga 6: non capita: ' -and
            $vociColl[5] -eq 'riga 7: niente colloqui dal lun 14/12/2026 al sab 09/01/2027 (27 giorni)')
        $collInAmbra = @($lstColl.Items | Where-Object { $_.DaGuardare }).Count
        Verifica "in ambra quelle da guardare: senza ora, di domenica, non capita ($collInAmbra)" ($collInAmbra -eq 3)
        $testoRiepK = ($lblRiep.Text -replace '\s+', ' ')
        Write-Host "          riepilogo: $testoRiepK"
        Verifica "il riepilogo conta i colloqui e le righe da guardare" (
            $testoRiepK -match 'Colloqui con le famiglie: 2 ricevimenti settimanali \(\d+ serie, \d+ incontri\) e 1 giornata' -and
            $testoRiepK -match '3 righe dei colloqui sono da guardare' -and [string]$lblRiep.Tag -eq 'avviso')
        Verifica "e nei colori delle classi c'e' anche quello dei colloqui, dopo le classi ($(if ($riepColori) { $riepColori.Text }))" (
            $null -ne $riepColori -and $riepColori.Text -match 'Colloqui \S' -and
            $riepColori.Text.IndexOf('Colloqui') -gt $riepColori.Text.IndexOf($classiRossi[$classiRossi.Count - 1]))
        Verifica "i colloqui vanno nelle impostazioni come testo dei dati personali (CalColloqui)" (
            [string]$tStato.GetField('CalColloqui', $FI).GetValue($stato) -eq $collProva)
        ControllaPannello $pannelloOrari 'Orari / 4 con i colloqui'
        ControllaAiuti $pannelloOrari 'Orari / 4 con i colloqui'
        # "Importa da un file...": le righe del file in fondo alla casella, e la barra lo dice
        $tCollK = $asm.GetType('Campanella.Colloqui')
        $argImp = New-Object 'object[]' 4
        $argImp[0] = [string](Join-Path $radice 'test\colloqui_esempio.csv')
        $argImp[1] = [DateTime]::new(2026, 9, 14)
        $argImp[2] = 0
        $argImp[3] = ''
        $righeImp = $tCollK.GetMethod('Importa', $FS).Invoke($null, $argImp)
        $tPO.GetMethod('AggiungiColloqui', $FIp).Invoke($orari, @($righeImp, [string]'colloqui_esempio.csv', [int]$argImp[2])) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        # due righe del file (il ricevimento del giovedi' e la giornata del 15/12) sono gia' nella casella
        Verifica "importate le righe di test\colloqui_esempio.csv in fondo alla casella, senza quelle che c'erano gia', e la barra dice quante, quelle gia' scritte e quella saltata ($($lblStato.Text))" (
            $txtColl.Text.StartsWith($collProva) -and $txtColl.Text.EndsWith('ogni martedi 15:00-16:00 Ricevimento pomeridiano') -and
            $lblStato.Text -match 'Importate 2 righe da colloqui_esempio\.csv' -and
            $lblStato.Text -match "2 righe erano gia' nella casella" -and $lblStato.Text -match 'saltata' -and
            @($lstColl.Items).Count -eq 8)
        $primaDiNuovo = $txtColl.Text
        $tPO.GetMethod('AggiungiColloqui', $FIp).Invoke($orari, @($righeImp, [string]'colloqui_esempio.csv', [int]$argImp[2])) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        Verifica "importato di nuovo, lo stesso file non aggiunge niente, e la barra lo dice ($($lblStato.Text))" (
            $txtColl.Text -eq $primaDiNuovo -and $lblStato.Text -match "sono gia' tutte nella casella" -and
            @($lstColl.Items).Count -eq 8)
        ControllaPannello $pannelloOrari 'Orari / 4 con i colloqui importati'
        if ($Immagini) {
            $bmp = New-Object System.Drawing.Bitmap($guscio.Width, $guscio.Height)
            $guscio.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $guscio.Width, $guscio.Height)))
            $bmp.Save((Join-Path $cartella '38-Orari-4-colloqui.png'), [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Dispose()
        }
        $txtColl.Text = ''
        [System.Windows.Forms.Application]::DoEvents()
        Verifica "senza colloqui la lista lo dice, e il riepilogo non li nomina" (
            @($lstColl.Items).Count -eq 1 -and ([string]$lstColl.Items[0]) -match '^Nessun colloquio' -and
            $lblRiep.Text -notmatch 'Colloqui con le famiglie')
    }
    if ($Immagini) {
        $bmp = New-Object System.Drawing.Bitmap($guscio.Width, $guscio.Height)
        $guscio.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $guscio.Width, $guscio.Height)))
        $bmp.Save((Join-Path $cartella '34-Orari-4-giorni-senza-lezione-e-cambio.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    }
    $chkCambio.Checked = $false
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "tolta la spunta, la data si spegne e il cambio non c'e' piu'" (
        -not $dtCambio.Enabled -and [string]$tStato.GetField('CalValidoDal', $FI).GetValue($stato) -eq '' -and
        $lblRiep.Text -notmatch 'ORARI_5_cambioOrario')
    $chkCambio.Checked = $true
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "rimessa, la data si riaccende e torna nelle impostazioni" (
        $dtCambio.Enabled -and [string]$tStato.GetField('CalValidoDal', $FI).GetValue($stato) -eq '2026-10-05')
    $btnFeste = $null
    foreach ($c in $pannelloOrari.Controls) { if ($c -is [System.Windows.Forms.Button] -and $c.Text -eq 'Aggiungi le feste nazionali') { $btnFeste = $c } }
    Verifica "c'e' il bottone 'Aggiungi le feste nazionali'" ($null -ne $btnFeste)
    if ($null -ne $btnFeste) {
        $onClick.Invoke($btnFeste, @([System.EventArgs]::Empty)) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        $dopoFeste = $txtSosp.Text
        Verifica "il bottone aggiunge in fondo le feste che mancano, e lascia le righe scritte" (
            $dopoFeste.StartsWith($sospProva) -and $dopoFeste -match '08/12/2026 Immacolata' -and
            $dopoFeste -match '02/06/2027 Festa della Repubblica' -and
            ([regex]::Matches($dopoFeste, 'Tutti i Santi')).Count -eq 1 -and
            [string]$tStato.GetField('CalSospensioni', $FI).GetValue($stato) -eq $dopoFeste)
        $onClick.Invoke($btnFeste, @([System.EventArgs]::Empty)) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        Verifica "premuto di nuovo non aggiunge niente" ($txtSosp.Text -eq $dopoFeste)
        ControllaPannello $pannelloOrari 'Orari / 4 dopo le feste nazionali'

        # con la fine prima dell'inizio non dice che le feste ci sono gia' tutte
        $dtFinePO = $tPO.GetField('dtFine', $FIp).GetValue($orari)
        $fineGiusta = $dtFinePO.Value
        $txtSosp.Text = ''
        $dtFinePO.Value = [DateTime]::new(2026, 6, 10)
        [System.Windows.Forms.Application]::DoEvents()
        $onClick.Invoke($btnFeste, @([System.EventArgs]::Empty)) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        Verifica "con la fine prima dell'inizio il bottone non aggiunge niente e dice perche' ($($lblStato.Text))" (
            $txtSosp.Text -eq '' -and $lblStato.Text -match 'fine viene prima' -and $lblStato.Text -notmatch 'ci sono gia')
        $dtFinePO.Value = $fineGiusta
    }
    # una riga con l'anno sbagliato: fuori dal periodo, contata a parte e segnalata
    $txtSosp.Text = "01/11/2025 Tutti i Santi`r`n08/12/2026 Immacolata"
    [System.Windows.Forms.Application]::DoEvents()
    $testoRiep = ($lblRiep.Text -replace '\s+', ' ')
    Write-Host "          riepilogo: $testoRiep"
    Verifica "una riga fuori dal periodo non si conta fra i giorni senza lezione, e il riepilogo lo dice in ambra" (
        $lblRiep.Text -match 'per 1 giorno o periodo senza lezione' -and $lblRiep.Text -match 'fuori dal periodo' -and
        $lblRiep.Text -match '01/11/2025' -and [string]$lblRiep.Tag -eq 'avviso')
    ControllaPannello $pannelloOrari 'Orari / 4 con una riga fuori dal periodo'
    # tutto come prima
    foreach ($c in @('CalDocente', 'CalNome', 'CalSospensioni', 'CalColloqui', 'CalValidoDal')) { $tStato.GetField($c, $FI).SetValue($stato, '') }
    $tPO.GetMethod('MostraCalendario', $FIp).Invoke($orari, @()) | Out-Null
}

# --- Orari, passo 4: titoli e colori delle lezioni, sul tabellone ----------------
# Il tabellone dell'orario con ogni ora del colore del suo titolo, la legenda
# dei titoli, e sotto il titolo e la tendina del colore delle ore scelte: i
# colori di partenza, quello scelto a mano che resta, "colore del calendario"
# e "Colori di partenza"; il titolo di partenza e' la classe.
Write-Host "`nORARI, PASSO 4: TITOLI E COLORI DELLE LEZIONI, SUL TABELLONE" -ForegroundColor Cyan
$tFCC = $asm.GetType('Campanella.FormColoriClassi')
$tOra = $asm.GetType('Campanella.OraDelCalendario')
Verifica "c'e' la finestra dei titoli e dei colori delle lezioni" ($null -ne $tFCC -and $null -ne $tOra)
if ($null -ne $tFCC -and $null -ne $tOra) {
    function ListaOre($ore) {
        $lo = [Activator]::CreateInstance([System.Collections.Generic.List`1].MakeGenericType($tOra))
        foreach ($x in $ore) {
            $o = [Activator]::CreateInstance($tOra); $o.Giorno = $x[0]; $o.Ora = $x[1]; $o.Classe = $x[2]
            $lo.Add($o)
        }
        return , $lo
    }
    function Dizionario($h) {
        $d = New-Object 'System.Collections.Generic.Dictionary[string,string]'
        foreach ($k in $h.Keys) { $d[$k] = $h[$k] }
        return , $d
    }
    function Mostra($f) {
        $f.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
        $f.Location = New-Object System.Drawing.Point(-4000, -4000)
        $f.Show()
        [System.Windows.Forms.Application]::DoEvents()
        return $f
    }
    # un'ora per classe, il lunedi', nell'ordine scritto; "Colloqui" fra le
    # classi vuol dire che ci sono i colloqui (la loro voce nella legenda)
    function FinestraColori([string[]]$classi, $colori, [string[]]$aMano, $scritti = @{}, $titoli = @{}) {
        $ore = @(); $i = 0
        foreach ($k in $classi) { if ($k -ne 'Colloqui') { $i++; $ore += , @('LUN', $i, $k) } }
        $la = New-Object 'System.Collections.Generic.List[string]'
        foreach ($k in $aMano) { $la.Add($k) }
        $a = New-Object 'object[]' 6
        $a[0] = (ListaOre $ore).PSObject.BaseObject; $a[1] = [bool]($classi -contains 'Colloqui')
        $a[2] = (Dizionario $colori).PSObject.BaseObject; $a[3] = $la.PSObject.BaseObject
        $a[4] = (Dizionario $scritti).PSObject.BaseObject; $a[5] = (Dizionario $titoli).PSObject.BaseObject
        return Mostra ([Activator]::CreateInstance($tFCC, $a))
    }
    # la chiave dell'ora di una classe (la prima che ha)
    function Riga($f, [string]$classe) {
        @($f.Ore | Where-Object { $_.Classe -eq $classe } | ForEach-Object { $_.Chiave() })[0]
    }
    function ColoriDi($f) { ($f.Classi | ForEach-Object { "$_=$($f.Colori[$_])" }) -join ',' }
    function Voce($f, [string]$titolo) { @($f.Legenda.Items | Where-Object { $_.Titolo -eq $titolo })[0] }
    function Colore($f, [string]$classe) { $f.Colori[$f.TitoloDi((Riga $f $classe))] }

    $fc = FinestraColori @('3B LSA', '1A', '2B', 'A disposizione', '10A') @{ '2B' = '5' } @('2B')
    ControllaPannello $fc 'Titoli e colori delle lezioni'
    Verifica "il tabellone ha le 5 ore, la legenda un titolo per classe in ordine, la tendina 11 colori e 'colore del calendario' ($(ColoriDi $fc))" (
        ($fc.Classi -join ',') -eq '1A,2B,3B LSA,10A,A disposizione' -and $fc.Tabellone.InOrdine().Count -eq 5 -and
        $fc.Legenda.Items.Count -eq 5 -and $fc.Tendina.Items.Count -eq 12 -and
        $fc.Tendina.Items[0].ToString() -eq 'colore del calendario' -and $fc.Tendina.Items[1].ToString() -eq 'Pomodoro')
    Verifica "senza ore scelte titolo e colore sono spenti, e la frase dice come sceglierle" (
        -not $fc.CasellaTitolo.Enabled -and -not $fc.Tendina.Enabled -and $fc.Scelta.Text -match 'Ctrl\+clic')
    Verifica "2B, scelto a mano, resta Banana; le altre hanno i colori di partenza, le ore a disposizione Grafite; la legenda lo dice ($((Voce $fc '2B').ToString()))" (
        (ColoriDi $fc) -eq '1A=11,2B=5,3B LSA=9,10A=10,A disposizione=8' -and
        (Voce $fc '2B').ToString() -eq '2B: Banana, 1 ora, scelto da te' -and (Voce $fc '1A').ToString() -eq '1A: Pomodoro, 1 ora')
    # un clic su una cella: la sceglie, il titolo di partenza e' la classe
    $c3 = $fc.Tabellone.Cella((Riga $fc '3B LSA'))
    $giu = New-Object System.Windows.Forms.MouseEventArgs([System.Windows.Forms.MouseButtons]::Left, 1, ($c3.X + 10), ($c3.Y + 10), 0)
    $fc.Tabellone.GetType().GetMethod('OnMouseDown', [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($fc.Tabellone, [object[]]@($giu.PSObject.BaseObject))
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "un clic sulla cella di 3B LSA la sceglie: il titolo e' la classe, il colore il suo, la legenda la mostra ($($fc.Scelta.Text))" (
        $fc.Tabellone.Scelte.Count -eq 1 -and $fc.Tabellone.Scelte[0] -eq (Riga $fc '3B LSA') -and
        $fc.CasellaTitolo.Enabled -and $fc.CasellaTitolo.Text -eq '3B LSA' -and $fc.Tendina.SelectedItem.ToString() -eq 'Mirtillo' -and
        $fc.Legenda.SelectedItem.Titolo -eq '3B LSA' -and $fc.Scelta.Text -match '3B LSA')
    $fc.Tendina.SelectedIndex = 1
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "scelto Pomodoro dalla tendina per 3B LSA: e' suo, scelto a mano, e la legenda lo dice" (
        $fc.Colori['3B LSA'] -eq '11' -and $fc.AMano.Contains('3B LSA') -and
        (Voce $fc '3B LSA').ToString() -eq '3B LSA: Pomodoro, 1 ora, scelto da te')
    Verifica "  ...e la 1A, che aveva Pomodoro da Campanella, ne ha subito un altro ($(ColoriDi $fc))" (
        $fc.Colori['1A'] -ne '11' -and $fc.Colori['1A'] -ne '' -and (Voce $fc '1A').Valore -eq $fc.Colori['1A'] -and
        -not (Voce $fc '1A').AMano)
    $fc.Scegli('1A', '')
    Verifica "'colore del calendario' per 1A si ricorda come scelta" (
        $fc.Colori['1A'] -eq '' -and $fc.AMano.Contains('1A') -and (Voce $fc '1A').ToString() -eq '1A: colore del calendario, 1 ora, scelto da te')
    $fc.DiPartenza()
    Verifica "'Colori di partenza' dimentica le scelte e rifa' i colori di partenza ($(ColoriDi $fc))" (
        $fc.AMano.Count -eq 0 -and (ColoriDi $fc) -eq '1A=11,2B=9,3B LSA=10,10A=6,A disposizione=8')
    # il titolo: scritto per le ore scelte, prendono il colore del titolo; due
    # ore con lo stesso titolo hanno lo stesso colore; uguale alla classe, nessun titolo
    $fc.ScegliOre((Riga $fc '10A')); $fc.ApplicaTitolo('2B')
    $fc.ScegliOre((Riga $fc '1A')); $fc.CasellaTitolo.Text = '1A - MAT'; $fc.ScriviTitolo()
    $fc.ScegliOre((Riga $fc '3B LSA')); $fc.ApplicaTitolo('3B LSA')
    Verifica "scritti i titoli, la finestra li tiene ($(@($fc.TitoliOre.Keys | ForEach-Object { $_ + '=' + $fc.TitoliOre[$_] }) -join '; ')), sono le voci della legenda, e senza la spunta 1A - MAT tiene il Pomodoro della 1A ($(ColoriDi $fc))" (
        $fc.TitoliOre.Count -eq 2 -and $fc.TitoliOre[(Riga $fc '1A')] -eq '1A - MAT' -and
        ($fc.Classi -join ',') -eq '1A - MAT,2B,3B LSA,A disposizione' -and $fc.Colori['1A - MAT'] -eq '11' -and -not $fc.ColoreNuovoPerTitolo -and
        (Colore $fc '10A') -eq $fc.Colori['2B'] -and $fc.Legenda.Items.Count -eq 4 -and
        (Voce $fc '2B').ToString() -match '^2B: .*, 2 ore$')
    $fc.ScegliTitolo('2B')
    Verifica "un clic sulla legenda di 2B sceglie le sue due ore (2B e 10A con il titolo 2B), e la nota lo dice ($($fc.Scelta.Text))" (
        $fc.Tabellone.Scelte.Count -eq 2 -and $fc.Tabellone.Scelte.Contains((Riga $fc '10A')) -and
        $fc.CasellaTitolo.Text -eq '2B' -and $fc.Scelta.Text -match '2 ore scelte')
    $fc.ScegliOre((Riga $fc '10A'))
    $fc.Tendina.SelectedIndex = 3
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "  ...e il colore scelto per una cella va a tutte le ore con lo stesso titolo" (
        $fc.Colori['2B'] -eq $fc.Tendina.SelectedItem.Valore -and (Colore $fc '2B') -eq (Colore $fc '10A'))
    # piu' ore scelte con titoli diversi: la casella e' vuota, e uscirne non
    # cambia niente; un titolo scritto va a tutte
    $fc.ScegliOre((Riga $fc '1A'), (Riga $fc '3B LSA'))
    $fc.ScriviTitolo()
    Verifica "due ore con titoli diversi: casella vuota, e uscirne non tocca i titoli" (
        $fc.CasellaTitolo.Text -eq '' -and $fc.TitoliOre[(Riga $fc '1A')] -eq '1A - MAT' -and $fc.Classi.Contains('3B LSA'))
    $fc.ApplicaTitolo('Recupero')
    Verifica "  ...e un titolo scritto va a tutte e due, con un colore solo" (
        $fc.TitoliOre[(Riga $fc '1A')] -eq 'Recupero' -and $fc.TitoliOre[(Riga $fc '3B LSA')] -eq 'Recupero' -and
        (Colore $fc '1A') -eq (Colore $fc '3B LSA') -and (Voce $fc 'Recupero').QuanteOre -eq 2)
    $fc.ScegliOre((Riga $fc '3B LSA')); $fc.ApplicaTitolo('')
    Verifica "'Rimetti la classe': l'ora torna alla sua classe" (
        -not $fc.TitoliOre.ContainsKey((Riga $fc '3B LSA')) -and $fc.TitoloDi((Riga $fc '3B LSA')) -eq '3B LSA')
    $fc.ScegliOre((Riga $fc '1A')); $fc.ApplicaTitolo('1A - FIS')
    $fc.Conferma()
    Verifica "confermato, restano i colori dei titoli di adesso, non di quelli scritti a meta' ($(@($fc.Colori.Keys) -join ','))" (
        -not $fc.Colori.ContainsKey('1A - MAT') -and -not $fc.Colori.ContainsKey('Recupero') -and
        $fc.Colori.ContainsKey('1A - FIS') -and $fc.Colori.ContainsKey('2B'))
    $fc.Close(); $fc.Dispose()
    # un colore scelto uguale a quello che un altro titolo ha da Campanella:
    # quello ne prende subito un altro, e la finestra mostra gia' i colori che
    # "Usa questi titoli e colori" dara' (rifatti, non cambiano piu')
    $fsc = FinestraColori @('1A', '2A', '3A') @{ '1A' = '11'; '2A' = '9'; '3A' = '10' } @() @{ '1A' = '11'; '2A' = '9'; '3A' = '10' }
    $fsc.Scegli('2A', '11')
    $rifatti = New-Object 'System.Collections.Generic.Dictionary[string,string]'
    foreach ($k in $fsc.Colori.Keys) { $rifatti[$k] = $fsc.Colori[$k] }
    $vuotiS = New-Object 'System.Collections.Generic.Dictionary[string,string]'
    $cambiaAncora = $asm.GetType('Campanella.ColoriLezioni').GetMethod('Completa', $FS).Invoke($null,
        @($rifatti.PSObject.BaseObject, $fsc.AMano, $fsc.Classi, $vuotiS.PSObject.BaseObject))
    Verifica "scelto per la 2A il Pomodoro della 1A: la finestra mostra subito la 1A con un altro colore ($(ColoriDi $fsc)), e sono quelli che restano" (
        (ColoriDi $fsc) -eq '1A=9,2A=11,3A=10' -and (Voce $fsc '1A').Valore -eq '9' -and
        (Voce $fsc '2A').Valore -eq '11' -and @($fsc.AMano).Count -eq 1 -and -not $cambiaAncora)
    $fsc.Scegli('1A', '11')
    Verifica "  ...e scelto Pomodoro anche per la 1A, tutte e due restano Pomodoro ($(ColoriDi $fsc))" (
        (ColoriDi $fsc) -eq '1A=11,2A=11,3A=10' -and (Voce $fsc '1A').Valore -eq '11')
    $fsc.Close(); $fsc.Dispose()
    # con i colloqui: la loro voce dopo tutte nella legenda, di partenza con un
    # colore che le lezioni non usano; scelta, si cambia solo il colore
    $fk = FinestraColori @('Colloqui', '2B', 'A disposizione', '1A') @{} @()
    $spiegaK = @($fk.Controls | Where-Object { $_ -is [System.Windows.Forms.Label] -and $_.Text -match 'colloqui con le famiglie' })
    $coloriClassiK = @($fk.Classi | Where-Object { $_ -ne 'Colloqui' } | ForEach-Object { $fk.Colori[$_] })
    Verifica "con i colloqui la legenda ha la loro voce dopo tutte, con un colore che le lezioni non usano, e la finestra lo spiega ($(ColoriDi $fk))" (
        ($fk.Classi -join ',') -eq '1A,2B,A disposizione,Colloqui' -and $fk.Colori['Colloqui'] -ne '' -and
        $coloriClassiK -notcontains $fk.Colori['Colloqui'] -and $spiegaK.Count -eq 1 -and
        $fk.Legenda.Items[3].Titolo -eq 'Colloqui' -and $fk.Legenda.Items[3].ToString() -match '^Colloqui con le famiglie: ')
    $fk.ScegliTitolo('Colloqui')
    $fk.Tendina.SelectedIndex = 2
    [System.Windows.Forms.Application]::DoEvents()
    Verifica "  ...scelti i colloqui dalla legenda, il titolo e' spento e la tendina cambia il loro colore" (
        -not $fk.CasellaTitolo.Enabled -and $fk.Tendina.Enabled -and $fk.Tabellone.Scelte.Count -eq 0 -and
        $fk.Colori['Colloqui'] -eq $fk.Tendina.Items[2].Valore -and $fk.AMano.Contains('Colloqui'))
    ControllaPannello $fk 'Titoli e colori delle lezioni, con i colloqui'
    $fk.Close(); $fk.Dispose()
    # tante ore: le celle si abbassano, la finestra resta dentro lo schermo
    $molte = @(1..16 | ForEach-Object { "$($_)A" })
    $fm = FinestraColori $molte @{} @()
    ControllaPannello $fm 'Titoli e colori delle lezioni, 16 ore'
    Verifica "con 16 ore la finestra resta dentro lo schermo (alta $($fm.Height)), con 11 colori diversi" (
        $fm.Height -lt 820 -and @($fm.Classi | ForEach-Object { $fm.Colori[$_] } | Sort-Object -Unique).Count -eq 11)
    $fm.Close(); $fm.Dispose()
    # una settimana vera: sei giorni da sei ore, con i giorni del tabellone
    # anche senza lezioni; un clic sul giorno sceglie la colonna, Ctrl+clic
    # su un'ora la riga in piu'
    $ore = @(@('Lunedi''', 1, 'S3 B'), @('Lunedi''', 2, 'S2 B'), @('Lunedi''', 3, 'S2 B'), @('Martedi''', 4, 'A5 AR'),
             @('Mercoledi''', 1, 'S2 B'), @('Mercoledi''', 5, 'A disposizione'), @('Giovedi''', 2, 'S3 B'),
             @('Giovedi''', 3, 'A5 AR'), @('Sabato', 6, 'S2 B'))
    $giorni = New-Object 'System.Collections.Generic.List[string]'
    foreach ($g in @('Lunedi''', 'Martedi''', 'Mercoledi''', 'Giovedi''', 'Venerdi''', 'Sabato')) { $giorni.Add($g) }
    $a = New-Object 'object[]' 8
    $a[0] = (ListaOre $ore).PSObject.BaseObject; $a[1] = $giorni.PSObject.BaseObject; $a[2] = 6; $a[3] = $false
    $a[4] = (Dizionario @{}).PSObject.BaseObject; $a[5] = (New-Object 'System.Collections.Generic.List[string]').PSObject.BaseObject
    $a[6] = (Dizionario @{}).PSObject.BaseObject; $a[7] = (Dizionario @{ 'Lunedi''|3|S2 B' = '2B - FIS' }).PSObject.BaseObject
    $fw = Mostra ([Activator]::CreateInstance($tFCC, $a))
    ControllaPannello $fw 'Titoli e colori delle lezioni, una settimana'
    $tab = $fw.Tabellone
    $ven = $tab.Cella('Venerdi''|1|x')
    Verifica "la settimana: sei colonne (anche il venerdi' senza lezioni), il titolo scelto prima e' tenuto, il tabellone sta nella finestra ($($tab.Width)x$($tab.Height))" (
        $tab.InOrdine().Count -eq 9 -and $ven.IsEmpty -and $fw.TitoloDi('Lunedi''|3|S2 B') -eq '2B - FIS' -and
        $fw.TitoloDi('Lunedi''|2|S2 B') -eq 'S2 B' -and ($fw.Classi -join ',') -eq '2B - FIS,A5 AR,S2 B,S3 B,A disposizione' -and
        $tab.Right -le $fw.ClientSize.Width -and $tab.Width -gt 600)
    $FIm = [System.Reflection.BindingFlags]'NonPublic,Instance'
    $giuM = New-Object System.Windows.Forms.MouseEventArgs([System.Windows.Forms.MouseButtons]::Left, 1,
        ($tab.Cella('Mercoledi''|1|S2 B').X + 10), 5, 0)
    $tab.GetType().GetMethod('OnMouseDown', $FIm).Invoke($tab, [object[]]@($giuM.PSObject.BaseObject))
    Verifica "un clic sul mercoledi' sceglie le sue due ore" (
        $tab.Scelte.Count -eq 2 -and $tab.Scelte.Contains('Mercoledi''|1|S2 B') -and $tab.Scelte.Contains('Mercoledi''|5|A disposizione'))
    $tab.GetType().GetMethod('OnKeyDown', $FIm).Invoke($tab, [object[]]@([System.Windows.Forms.KeyEventArgs]::new([System.Windows.Forms.Keys]::Right)))
    Verifica "  ...e la freccia a destra sceglie l'ora accanto, giovedi' 1a, che e' vuota: nessuna" ($tab.Scelte.Count -eq 0)
    $tab.GetType().GetMethod('OnKeyDown', $FIm).Invoke($tab, [object[]]@([System.Windows.Forms.KeyEventArgs]::new([System.Windows.Forms.Keys]::Down)))
    Verifica "  ...e la freccia in giu' giovedi' 2a, S3 B" ($tab.Scelte.Count -eq 1 -and $tab.Scelte[0] -eq 'Giovedi''|2|S3 B')
    # di partenza un titolo nuovo tiene il colore delle sue ore; con la spunta ne prende uno suo
    $coloreS2 = $fw.Colori['S2 B']
    $fw.ScegliOre('Lunedi''|2|S2 B'); $fw.ApplicaTitolo('2B - MAT')
    Verifica "senza la spunta, 2B - MAT scritto per un'ora di S2 B tiene il suo colore, e le altre ore di S2 B anche: tutti e due scelti a mano ($(ColoriDi $fw))" (
        -not $fw.ColoreNuovoPerTitolo -and $fw.Colori['2B - MAT'] -eq $coloreS2 -and $fw.Colori['S2 B'] -eq $coloreS2 -and
        $fw.AMano.Contains('2B - MAT') -and $fw.AMano.Contains('S2 B'))
    $chk = @($fw.Controls | Where-Object { $_ -is [System.Windows.Forms.CheckBox] })[0]
    $chk.Checked = $true
    $coloreS3 = $fw.Colori['S3 B']
    $fw.ScegliOre('Giovedi''|2|S3 B'); $fw.ApplicaTitolo('3B - LAB')
    Verifica "con la spunta, 3B - LAB scritto per un'ora di S3 B prende un colore che nessun altro titolo usa, e S3 B tiene il suo ($(ColoriDi $fw))" (
        $fw.ColoreNuovoPerTitolo -and $fw.Colori['3B - LAB'] -ne $coloreS3 -and $fw.Colori['S3 B'] -eq $coloreS3 -and
        @($fw.Classi | Where-Object { $_ -ne '3B - LAB' } | ForEach-Object { $fw.Colori[$_] }) -notcontains $fw.Colori['3B - LAB'])
    $fw.ApplicaTitolo('')
    $fw.ScegliTitolo('S2 B'); $fw.ApplicaTitolo('2B - MAT')
    Verifica "scelte le ore di S2 B dalla legenda e scritto 2B - MAT: lo prendono le tre ore ancora S2 B, non quella 2B - FIS ($(ColoriDi $fw))" (
        ($fw.Classi -join ',') -eq '2B - FIS,2B - MAT,A5 AR,S3 B,A disposizione' -and (Voce $fw '2B - MAT').QuanteOre -eq 3 -and
        $fw.TitoloDi('Lunedi''|3|S2 B') -eq '2B - FIS' -and $fw.Colori['2B - MAT'] -ne $fw.Colori['2B - FIS'])
    if ($Immagini) {
        $fw.ScegliOre('Lunedi''|2|S2 B')
        [System.Windows.Forms.Application]::DoEvents()
        $bmp = New-Object System.Drawing.Bitmap($fw.Width, $fw.Height)
        $fw.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $fw.Width, $fw.Height)))
        $bmp.Save((Join-Path $cartella '36-Orari-4-titoli-e-colori.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    }
    $fw.Close(); $fw.Dispose()
}

if ($Immagini) { Write-Host "`nImmagini in: $cartella" -ForegroundColor Cyan }
# Dispose senza Close: Close salverebbe le impostazioni, e qui dentro
# PowerShell "accanto al programma" vuol dire accanto a powershell.exe
$guscio.Hide()
$guscio.Dispose()
Remove-Item $prova -Recurse -Force -ErrorAction SilentlyContinue

if ($script:fallimenti -eq 0) { Write-Host "`nNessuna sovrapposizione: le pagine stanno in piedi." -ForegroundColor Green }
else { Write-Host "`nPROBLEMI DI DISPOSIZIONE: $script:fallimenti" -ForegroundColor Red; exit 1 }
