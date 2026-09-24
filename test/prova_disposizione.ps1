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
    Verifica "con il file: i suoi 14 filtri, e in fondo quello scelto prima che non c'e'" (
        $gr.Rows.Count -eq 15 -and $ff.Spuntata(14) -and [string]$gr.Rows[14].Cells[4].Value -match "^scelto prima: nel file non c'e'")
    # partono spuntati quelli uguali a una regola che non fanno altro
    # (FiltriGmail.DiPartenza): non quelli che inoltrano, eliminano..., ne'
    # quelli creati da Campanella
    $mConfronta = $tFG.GetMethod('Confronta', $FS, $null, [Type[]]@($asm.GetType('Campanella.FiltroGmail'), $tStato), $null)
    $mDiPartenza = $tFG.GetMethod('DiPartenza', $FS)
    $storte = @(); $spuntati = 0
    for ($i = 0; $i -lt 14; $i++) {
        $x = $mConfronta.Invoke($null, @($filtriEs[$i], $stato.PSObject.BaseObject))
        $diPartenza = [bool]$mDiPartenza.Invoke($null, @($filtriEs[$i], $x))
        if ($diPartenza) { $spuntati++ }
        if ($ff.Spuntata($i) -ne $diPartenza) { $storte += $filtriEs[$i].Etichetta }
    }
    Verifica "partono spuntati proprio i filtri uguali a una regola che non fanno altro ($spuntati)$(if ($storte.Count) { ': no ' + ($storte -join ', ') })" (
        $storte.Count -eq 0 -and $spuntati -ge 2 -and $spuntati -lt 14)
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
    $tStato.GetField('FiltriDaTogliere', $FI).SetValue($stato, [Activator]::CreateInstance([System.Collections.Generic.List`1].MakeGenericType($tDT)))
    $posta.GetType().GetMethod('AggiornaFiltriDaTogliere', $FIp).Invoke($posta, @()) | Out-Null
    Verifica "e senza filtri lo dice" ($lblF.Text -eq 'Nessun filtro di Gmail da togliere.')
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
    foreach ($c in @('CalDocente', 'CalNome', 'CalSospensioni', 'CalValidoDal')) { $tStato.GetField($c, $FI).SetValue($stato, '') }
    $tPO.GetMethod('MostraCalendario', $FIp).Invoke($orari, @()) | Out-Null
}

if ($Immagini) { Write-Host "`nImmagini in: $cartella" -ForegroundColor Cyan }
# Dispose senza Close: Close salverebbe le impostazioni, e qui dentro
# PowerShell "accanto al programma" vuol dire accanto a powershell.exe
$guscio.Hide()
$guscio.Dispose()
Remove-Item $prova -Recurse -Force -ErrorAction SilentlyContinue

if ($script:fallimenti -eq 0) { Write-Host "`nNessuna sovrapposizione: le pagine stanno in piedi." -ForegroundColor Green }
else { Write-Host "`nPROBLEMI DI DISPOSIZIONE: $script:fallimenti" -ForegroundColor Red; exit 1 }
