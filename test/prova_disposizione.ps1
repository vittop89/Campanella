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

# Le impostazioni: mai quelle vere, e mai il Drive vero. Oggi "new Stato()"
# punta da solo al Drive del computer: lo sposto subito su cartelle finte in
# %TEMP%. Il Drive finto ha MODELLI e un modulo, cosi' ne' la pagina iniziale
# ne' Cartelle vanno a cercare negli altri Drive del computer.
$tStato = $asm.GetType('Campanella.Stato')
$FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$FI = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'
$prova = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-guscio-disposizione-' + (Get-Random))
$driveFinto = Join-Path $prova 'Il mio Drive'
New-Item -ItemType Directory -Force (Join-Path $driveFinto 'MODELLI') | Out-Null
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

if ($Immagini) { Write-Host "`nImmagini in: $cartella" -ForegroundColor Cyan }
# Dispose senza Close: Close salverebbe le impostazioni, e qui dentro
# PowerShell "accanto al programma" vuol dire accanto a powershell.exe
$guscio.Hide()
$guscio.Dispose()
Remove-Item $prova -Recurse -Force -ErrorAction SilentlyContinue

if ($script:fallimenti -eq 0) { Write-Host "`nNessuna sovrapposizione: le pagine stanno in piedi." -ForegroundColor Green }
else { Write-Host "`nPROBLEMI DI DISPOSIZIONE: $script:fallimenti" -ForegroundColor Red; exit 1 }
