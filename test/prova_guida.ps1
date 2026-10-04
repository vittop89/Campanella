<#
    prova_guida.ps1 - le guide passo passo (l'ultimo passo di Posta,
    Cartelle, Orari e Privacy) e il loro PDF

        .\test\prova_guida.ps1

    Carica Campanella.exe per riflessione, come prova_guscio.ps1:

      - il formato delle guide (GuidaLetta): titoli, paragrafi che
        continuano sulla riga dopo, passi numerati, punti, riquadri
        "Attenzione" e "Consiglio", il grassetto fra ** (e un ** rimasto
        aperto, che resta com'e');
      - le quattro guide ci sono fra le risorse, hanno il titolo e le
        sezioni, sono scritte come il resto del programma (accenti con
        l'apostrofo, niente caratteri fuori dall'ASCII), non hanno ** rimasti
        aperti, e non hanno indirizzi email veri;
      - ogni funzione di uno script che una guida nomina esiste davvero, e
        ogni funzione che si esegue a mano (PASSO_, EXTRA_, ANNULLA_, ORARI_,
        MODULO_, PANNELLO_) e' spiegata nella guida del suo strumento: una
        funzione nuova senza guida, o una tolta che la guida nomina ancora,
        fa fallire la prova;
      - nella pagina (senza mostrare la finestra): la guida intera nella
        casella, "Vai a" con una voce per sezione che porta al suo titolo, il
        nome proposto per il PDF, e cambiando tema la guida si ricolora;
      - il PDF di ogni guida: comincia e finisce come un PDF, la tabella dei
        riferimenti punta davvero a ogni oggetto, le lunghezze dei contenuti
        sono giuste, le pagine sono quante ne dice, ogni riga sta dentro i
        margini, il titolo c'e', e lo stesso testo da' sempre lo stesso file;
        una parola piu' lunga di una riga si spezza, e le lettere accentate e
        le parentesi si scrivono come vuole il PDF.
#>
$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = Join-Path $radice 'dist\Campanella.exe'
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)

$script:fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}
function Intestazione($t) {
    Write-Host ""
    Write-Host ("=" * 72)
    Write-Host " $t"
    Write-Host ("=" * 72)
}

$tGuida = $asm.GetType('Campanella.GuidaLetta')
$tPdf = $asm.GetType('Campanella.PdfGuida')
$tGuscio = $asm.GetType('Campanella.Guscio')
$FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
if ($null -eq $tGuida -or $null -eq $tPdf) { Write-Host "Mancano GuidaLetta o PdfGuida" -ForegroundColor Red; exit 1 }
function Leggi([string]$t) { $tGuida.GetMethod('Leggi', $FS).Invoke($null, @($t)) }
function Pdf($g, [string]$piede) { [byte[]]$tPdf.GetMethod('Crea', $FS).Invoke($null, @($g, $piede)) }
function Risorsa([string]$n) { [string]$tGuscio.GetMethod('LeggiRisorsa', $FS).Invoke($null, @($n)) }
function Tipi($g) { (@($g.Blocchi | ForEach-Object { $_.Tipo.ToString() }) -join ',') }

# --- il formato --------------------------------------------------------------
Intestazione "IL FORMATO DELLE GUIDE"
$esempio = @"
# Guida di prova

Un paragrafo che comincia qui
e continua sulla riga dopo.

## Prima sezione
### Una sottosezione
1. Apri **Campanella**.
2. Premi **Avanti**:
   la riga rientrata continua il passo.
- un punto
  che continua
- un altro punto
! Attenzione a questo,
  anche qui.
? Un consiglio.
10. Un passo con il numero a due cifre.
Testo con un ** rimasto aperto.
"@
$g = Leggi $esempio
Verifica "i blocchi nell'ordine giusto ($(Tipi $g))" (
    (Tipi $g) -eq 'Titolo,Paragrafo,Sezione,Sottosezione,Passo,Passo,Punto,Punto,Attenzione,Consiglio,Passo' -and
    $g.Titolo -eq 'Guida di prova')
Verifica "le righe che continuano si uniscono al loro blocco" (
    $g.Blocchi[1].Testo -eq 'Un paragrafo che comincia qui e continua sulla riga dopo.' -and
    $g.Blocchi[5].Testo -eq 'Premi **Avanti**: la riga rientrata continua il passo.' -and
    $g.Blocchi[6].Testo -eq 'un punto che continua' -and $g.Blocchi[8].Testo -eq 'Attenzione a questo, anche qui.')
Verifica "i passi tengono il loro numero (anche 10.)" (
    $g.Blocchi[4].Numero -eq '1.' -and $g.Blocchi[5].Numero -eq '2.' -and $g.Blocchi[10].Numero -eq '10.')
Verifica "una riga senza segni dopo un passo lo continua (non e' un paragrafo nuovo)" (
    $g.Blocchi[10].Testo -eq 'Un passo con il numero a due cifre. Testo con un ** rimasto aperto.')
$pezzi = @($tGuida.GetMethod('Pezzi', $FS).Invoke($null, @('Apri **Campanella** e poi **Avanti** con un ** solo')))
Verifica "il grassetto fra ** ($(@($pezzi | ForEach-Object { if ($_.Grassetto) { '[' + $_.Testo + ']' } else { $_.Testo } }) -join ''))" (
    $pezzi.Count -eq 5 -and $pezzi[1].Testo -eq 'Campanella' -and $pezzi[1].Grassetto -and
    $pezzi[3].Testo -eq 'Avanti' -and $pezzi[3].Grassetto -and -not $pezzi[2].Grassetto -and
    $pezzi[4].Testo -eq ' con un ** solo' -and -not $pezzi[4].Grassetto)
$tutto = @($tGuida.GetMethod('Pezzi', $FS).Invoke($null, @('prima **dentro** dopo ** fine')))
Verifica "  ...e un ** senza chiusura resta scritto, non in grassetto" (
    $tutto.Count -eq 3 -and $tutto[2].Testo -eq ' dopo ** fine' -and -not $tutto[2].Grassetto)

# --- le quattro guide ----------------------------------------------------------
Intestazione "LE QUATTRO GUIDE"
$guide = [ordered]@{
    'Posta'    = @{ File = 'Guida_Posta.txt';    Script = @('Organizzazione_Gmail.gs') }
    'Cartelle' = @{ File = 'Guida_Cartelle.txt'; Script = @('Moduli.gs', 'Pannello.gs') }
    'Orari'    = @{ File = 'Guida_Orari.txt';    Script = @('Orari.gs') }
    'Privacy'  = @{ File = 'Guida_Privacy.txt';  Script = @() }
}
$tuttiGliScript = @('Organizzazione_Gmail.gs', 'Orari.gs', 'Moduli.gs', 'Pannello.gs')
$funzioniDi = @{}
foreach ($s in $tuttiGliScript) {
    $funzioniDi[$s] = @([regex]::Matches((Risorsa $s), '(?m)^function ([A-Za-z][A-Za-z0-9_]*)\(') | ForEach-Object { $_.Groups[1].Value })
}
$tutteLeFunzioni = @($funzioniDi.Values | ForEach-Object { $_ })
$lette = @{}
foreach ($nome in $guide.Keys) {
    $file = $guide[$nome].File
    $testo = Risorsa $file
    Verifica "$nome : la guida $file c'e' fra le risorse ($($testo.Length) caratteri)" ($testo.Length -gt 3000)
    if ($testo.Length -eq 0) { continue }
    $gl = Leggi $testo
    $lette[$nome] = $gl
    $sezioni = @($gl.Blocchi | Where-Object { $_.Tipo.ToString() -eq 'Sezione' })
    $passi = @($gl.Blocchi | Where-Object { $_.Tipo.ToString() -eq 'Passo' })
    Verifica "$nome : ha il titolo ('$($gl.Titolo)'), un titolo solo, almeno 4 sezioni ($($sezioni.Count)) e dei passi ($($passi.Count))" (
        $gl.Titolo -ne '' -and @($gl.Blocchi | Where-Object { $_.Tipo.ToString() -eq 'Titolo' }).Count -eq 1 -and
        $gl.Blocchi[0].Tipo.ToString() -eq 'Titolo' -and $sezioni.Count -ge 4 -and $passi.Count -ge 20)
    $fuoriAscii = @([regex]::Matches($testo, '[^\x09\x0A\x0D\x20-\x7E]') | ForEach-Object { $_.Value } | Sort-Object -Unique)
    Verifica "$nome : scritta come il programma, senza lettere accentate ne' altri caratteri fuori dall'ASCII ($($fuoriAscii -join ' '))" (
        $fuoriAscii.Count -eq 0)
    $aperti = @($gl.Blocchi | Where-Object { ([regex]::Matches($_.Testo, '\*\*')).Count % 2 -ne 0 } | ForEach-Object { $_.Testo.Substring(0, [Math]::Min(60, $_.Testo.Length)) })
    Verifica "$nome : nessun ** rimasto aperto ($($aperti -join ' | '))" ($aperti.Count -eq 0)
    $email = @([regex]::Matches($testo, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}') | ForEach-Object { $_.Value } |
               Where-Object { $_ -notmatch '\.example$' -and $_ -ne 'codice@istruzione.it' })
    Verifica "$nome : nessun indirizzo email vero (solo .example, e codice@istruzione.it come nel programma) ($($email -join ', '))" ($email.Count -eq 0)
    # le funzioni nominate esistono
    $nominate = @([regex]::Matches($testo, '\b(?:PASSO|EXTRA|ANNULLA|ORARI|MODULO|PANNELLO)_[A-Za-z0-9_]+') | ForEach-Object { $_.Value } | Sort-Object -Unique)
    # "PASSO_3" da solo, come lo scrivono i messaggi dello script, vale se c'e' una PASSO_3_...
    $inventate = @($nominate | Where-Object { $n = $_; $tutteLeFunzioni -notcontains $n -and
        @($tutteLeFunzioni | Where-Object { $_.StartsWith($n + '_') }).Count -eq 0 })
    Verifica "$nome : ogni funzione nominata ($($nominate.Count)) esiste in uno script ($($inventate -join ', '))" ($inventate.Count -eq 0)
    # e quelle che si eseguono a mano ci sono tutte
    $daSpiegare = @()
    foreach ($s in $guide[$nome].Script) {
        $daSpiegare += @($funzioniDi[$s] | Where-Object {
            $_ -match '^(?:PASSO|EXTRA|ANNULLA|ORARI|MODULO|PANNELLO)_' -and $_ -notmatch '_chiusura$' -and $_ -notmatch '^MODULO_menu_' })
    }
    $mancano = @($daSpiegare | Where-Object { $nominate -notcontains $_ })
    Verifica "$nome : spiega tutte le funzioni dei suoi script che si eseguono a mano ($($daSpiegare.Count); mancano: $($mancano -join ', '))" (
        $mancano.Count -eq 0)
}

# --- il PDF ----------------------------------------------------------------------
Intestazione "IL PDF"
$latin1 = [System.Text.Encoding]::GetEncoding(28591)
function ControllaPdf([byte[]]$b, [string]$dove) {
    $t = $latin1.GetString($b)
    $ok = $t.StartsWith("%PDF-1.4`n") -and $t.EndsWith("%%EOF`n")
    $m = [regex]::Match($t, "startxref`n(\d+)`n%%EOF`n$")
    $xref = if ($m.Success) { [int]$m.Groups[1].Value } else { -1 }
    $ok = $ok -and $xref -gt 0 -and $t.Substring($xref, 4) -eq 'xref'
    # ogni voce della tabella punta al suo oggetto
    $voci = [regex]::Matches($t.Substring([Math]::Max(0, $xref)), '(\d{10}) 00000 n ')
    $i = 0; $sbagliate = 0
    foreach ($v in $voci) {
        $i++
        $pos = [int]$v.Groups[1].Value
        if (-not $t.Substring($pos).StartsWith("$i 0 obj`n")) { $sbagliate++ }
    }
    # le lunghezze dei contenuti
    $flussi = [regex]::Matches($t, "<< /Length (\d+) >>`nstream`n")
    $lunghezzeSbagliate = 0
    foreach ($f in $flussi) {
        $da = $f.Index + $f.Length
        $n = [int]$f.Groups[1].Value
        if ($t.Substring($da + $n, 9) -ne 'endstream') { $lunghezzeSbagliate++ }
    }
    $pagine = [regex]::Matches($t, '/Type /Page /Parent').Count
    $conta = [regex]::Match($t, '/Count (\d+)')
    # ogni pezzo di testo comincia dentro i margini (62 a sinistra, 595-62 a destra)
    $fuori = 0
    foreach ($tm in [regex]::Matches($t, '1 0 0 1 ([0-9.]+) ([0-9.]+) Tm')) {
        $x = [double]::Parse($tm.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
        $y = [double]::Parse($tm.Groups[2].Value, [Globalization.CultureInfo]::InvariantCulture)
        if ($x -lt 60 -or $x -gt 534 -or $y -lt 25 -or $y -gt 790) { $fuori++ }
    }
    Verifica "$dove : un PDF intero ($($b.Length) byte), $($voci.Count) oggetti tutti al loro posto, lunghezze giuste, $pagine pagine come dice /Count, testo dentro i margini" (
        $ok -and $voci.Count -gt 6 -and $sbagliate -eq 0 -and $flussi.Count -eq $pagine -and $lunghezzeSbagliate -eq 0 -and
        $conta.Success -and [int]$conta.Groups[1].Value -eq $pagine -and $pagine -ge 1 -and $fuori -eq 0)
    return $t
}
foreach ($nome in $lette.Keys) {
    $b = Pdf $lette[$nome] "Campanella - $nome"
    $t = ControllaPdf $b "PDF $nome"
    $pagine = [regex]::Matches($t, '/Type /Page /Parent').Count
    Verifica "PDF $nome : il titolo c'e', e in fondo 'pagina $pagine di $pagine'" (
        $t.Contains('(' + $lette[$nome].Titolo + ')') -and $t.Contains("(pagina $pagine di $pagine)"))
    $ancora = Pdf $lette[$nome] "Campanella - $nome"
    Verifica "PDF $nome : lo stesso testo da' lo stesso file" ([Convert]::ToBase64String($b) -eq [Convert]::ToBase64String($ancora))
}
$lungo = Leggi ("# Prova (con parentesi) e \barra`n`nPerche' cosi' ""citato"" e Citta con l'accento: citt" + [char]0xE0 + " e " + [char]0x20AC + ".`n`n" +
                 ('X' * 400) + "`n`n" + ((1..400 | ForEach-Object { "parola$_" }) -join ' '))
$tl = ControllaPdf (Pdf $lungo 'Campanella - prova') 'PDF con una parola lunghissima e tante pagine'
Verifica "  ...le parentesi e la barra con la barra davanti, la a accentata e l'euro in WinAnsi (\340 e \200)" (
    $tl.Contains('(Prova \(con parentesi\) e \\barra)') -and $tl.Contains('citt\340 e \200.'))
$righeX = [regex]::Matches($tl, '\((X+)\) Tj')
Verifica "  ...e la parola di 400 lettere va su piu' righe ($($righeX.Count)), senza perdere lettere" (
    $righeX.Count -ge 2 -and (($righeX | ForEach-Object { $_.Groups[1].Value.Length } | Measure-Object -Sum).Sum) -eq 400)

# --- la guida nella pagina ------------------------------------------------------
Intestazione "LA GUIDA NELLA PAGINA"
$tPan = $asm.GetType('Campanella.PannelloGuida')
$tTema = $asm.GetType('Campanella.Tema')
$tTema.GetMethod('Imposta', $FS).Invoke($null, @($true))
$f = New-Object System.Windows.Forms.Form
$f.ShowInTaskbar = $false
$f.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$f.Location = New-Object System.Drawing.Point(-4000, -4000)
$f.Size = New-Object System.Drawing.Size(1000, 760)
$pan = [Activator]::CreateInstance($tPan, @('Guida_Orari.txt', 'Orari'))
$pan.Dock = [System.Windows.Forms.DockStyle]::Fill
$f.Controls.Add($pan)
# la finestra non si mostra (la prova gira anche nella CI): bastano i suoi handle
$null = $f.Handle; $null = $pan.Handle; $null = $pan.Casella.Handle
[System.Windows.Forms.Application]::DoEvents()
$sez = @($pan.Guida.Blocchi | Where-Object { $_.Tipo.ToString() -eq 'Sezione' -or $_.Tipo.ToString() -eq 'Sottosezione' })
Verifica "la casella ha la guida intera ($($pan.Casella.TextLength) caratteri) e 'Vai a' una voce per sezione ($($pan.VaiAQui.Items.Count))" (
    $pan.Casella.Text.StartsWith($pan.Guida.Titolo) -and $pan.VaiAQui.Items.Count -eq $sez.Count -and $sez.Count -gt 0 -and
    $pan.Casella.ReadOnly)
Verifica "il PDF si propone come '$($pan.NomeFilePdf())'" ($pan.NomeFilePdf() -eq "Campanella - $($pan.Guida.Titolo).pdf")
$pan.VaiAQui.SelectedIndex = $pan.VaiAQui.Items.Count - 1
[System.Windows.Forms.Application]::DoEvents()
$ultima = [string]$pan.VaiAQui.Items[$pan.VaiAQui.Items.Count - 1]
Verifica "'Vai a' l'ultima sezione porta il cursore al suo titolo" (
    $pan.Casella.Text.Substring($pan.Casella.SelectionStart).StartsWith($ultima.Trim()))
$prima = $pan.Casella.BackColor
$tTema.GetMethod('Imposta', $FS).Invoke($null, @($false))
$tTema.GetMethod('Applica', $FS).Invoke($null, [object[]]@($f.PSObject.BaseObject))
[System.Windows.Forms.Application]::DoEvents()
Verifica "cambiando tema la guida si ricolora (sfondo da $prima a $($pan.Casella.BackColor)) e resta intera" (
    $pan.Casella.BackColor -ne $prima -and $pan.Casella.Text.StartsWith($pan.Guida.Titolo) -and
    $pan.VaiAQui.Items.Count -eq $sez.Count)
$f.Close(); $f.Dispose()

Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove delle guide superate." -ForegroundColor Green; exit 0 }
Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red
exit 1
