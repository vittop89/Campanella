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

# Le impostazioni: quelle vere se ci sono, cosi' guardo le pagine come le vedo io
$tStato = $asm.GetType('Campanella.Stato')
$FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$stato = $tStato.GetMethod('Carica', $FS).Invoke($null, @())

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

        if ($Immagini) {
            $bmp = New-Object System.Drawing.Bitmap($guscio.Width, $guscio.Height)
            $guscio.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $guscio.Width, $guscio.Height)))
            $file = Join-Path $cartella ("{0:00}-{1}.png" -f ($i * 10 + $p), ($nome -replace '[^A-Za-z0-9]+', '-'))
            $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Dispose()
        }
    }
}

if ($Immagini) { Write-Host "`nImmagini in: $cartella" -ForegroundColor Cyan }
$guscio.Close()
$guscio.Dispose()

if ($script:fallimenti -eq 0) { Write-Host "`nNessuna sovrapposizione: le pagine stanno in piedi." -ForegroundColor Green }
else { Write-Host "`nPROBLEMI DI DISPOSIZIONE: $script:fallimenti" -ForegroundColor Red; exit 1 }
