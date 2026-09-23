<#
    prova_cartelle.ps1 - le cartelle dell'anno, dalla parte di Campanella

        .\test\prova_cartelle.ps1

    Carica dist\Campanella.exe come assembly e fa girare il generatore vero
    delle cartelle dell'anno (GeneratoreAnno, in src\GeneratoreAnno.cs) su un
    Drive FINTO, creato in una cartella temporanea: non tocca mai il Drive
    vero del computer. Controlla le classi, i conti di cio' che crea e di cio'
    che trova gia' pronto, e le note che l'utente ha modificato.
    Esce con codice 1 se una prova fallisce.
#>
$ErrorActionPreference = 'Stop'
$qui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$radice = Split-Path -Parent $qui
$exe    = Join-Path $radice 'dist\Campanella.exe'
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$FS  = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$tG  = $asm.GetType('Campanella.GeneratoreAnno')

$script:fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}
function Lista([string[]]$voci) {
    $l = [System.Collections.Generic.List[string]]::new()
    foreach ($v in $voci) { $l.Add($v) }
    return ,$l
}
function Genera([string]$drive, [string]$classi, [string[]]$gruppi, [string[]]$struttura, [string]$extra) {
    $g = [Activator]::CreateInstance($tG)
    $argomenti = New-Object 'object[]' 6
    $argomenti[0] = '2026-27'
    $argomenti[1] = $drive
    $argomenti[2] = $classi
    $argomenti[3] = Lista $gruppi
    $argomenti[4] = Lista $struttura
    $argomenti[5] = $extra
    return $tG.GetMethod('Genera').Invoke($g, $argomenti)
}
function Scrivi($percorso, $testo) {
    New-Item -ItemType Directory -Force (Split-Path -Parent $percorso) | Out-Null
    [System.IO.File]::WriteAllText($percorso, $testo, (New-Object System.Text.UTF8Encoding($true)))
}
function Leggi($percorso) { return [System.IO.File]::ReadAllText($percorso) }

# il Drive finto: una cartella temporanea, mai il Drive vero
$finto = Join-Path $env:TEMP ('cartelle-prova-' + [Guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Force $finto | Out-Null
    $anno    = Join-Path $finto 'A.S. 2026-27'
    $modelli = Join-Path $finto 'MODELLI'
    Scrivi (Join-Path $modelli 'PER CLASSE\Griglia.docx') 'griglia'
    Scrivi (Join-Path $modelli 'PER CLASSE\Scheda.gdoc') '{}'
    Scrivi (Join-Path $modelli 'Verifiche\Compito.docx') 'compito'
    Scrivi (Join-Path $modelli 'Verifiche\Traccia.gdoc') '{}'
    Scrivi (Join-Path $modelli 'Verifiche\Recuperi.gform') '{}'
    Scrivi (Join-Path $modelli 'Verifiche\Archivio\Vecchio.docx') 'vecchio'
    Scrivi (Join-Path $modelli 'Verifiche\Archivio\Foglio.gsheet') '{}'
    Scrivi (Join-Path $modelli 'Altro\Lettera.gdoc') '{}'

    $classi    = "1A: Matematica; Fisica`r`n2B-Ls: Matematica, Fisica`r`n4Ar`r`n3C; 3D"
    $struttura = @('CLASSI', 'RECUPERI\TRIMESTRE', 'Da stampare')
    $gruppi    = @('Verifiche', 'Altro')

    # --- 1. le classi: una per riga, il punto e virgola solo fra le materie -----
    Write-Host "`nLE CLASSI" -ForegroundColor Cyan
    $r1 = Genera $finto $classi $gruppi $struttura 'Progetti, PCTO'
    Verifica "1A ha Matematica e Fisica"                 ((Test-Path (Join-Path $anno 'CLASSI\1A\Matematica')) -and (Test-Path (Join-Path $anno 'CLASSI\1A\Fisica')))
    Verifica "nessuna classe 'Fisica'"                   (-not (Test-Path (Join-Path $anno 'CLASSI\Fisica')))
    Verifica "le materie finiscono anche nei recuperi"   (Test-Path (Join-Path $anno 'RECUPERI\PENTAMESTRE\1A\Fisica'))
    Verifica "2B-Ls con la virgola come prima"           (Test-Path (Join-Path $anno 'CLASSI\2B-Ls\Fisica'))
    Verifica "4Ar senza materie"                         (Test-Path (Join-Path $anno 'CLASSI\4Ar'))
    Verifica "'3C; 3D' su una riga: nessuna cartella"    (-not (Test-Path (Join-Path $anno 'CLASSI\3C; 3D')) -and -not (Test-Path (Join-Path $anno 'CLASSI\3D')))
    Verifica "e lo segnala fra i problemi"               (($r1.Errori | Where-Object { $_ -like '*3C; 3D*' }).Count -eq 1)
    Verifica "nessun altro problema"                     ($r1.Errori.Count -eq 1)

    # --- 2. i modelli e le note ---------------------------------------------------
    Write-Host "`nI MODELLI" -ForegroundColor Cyan
    $notaVerifiche = Join-Path $anno 'Verifiche\DUPLICA IN GOOGLE DOCS - Verifiche.txt'
    $notaAltro     = Join-Path $anno 'Altro\DUPLICA IN GOOGLE DOCS - Altro.txt'
    Verifica "i modelli per classe hanno il nome della classe in coda" (Test-Path (Join-Path $anno 'CLASSI\1A\Griglia 1A.docx'))
    Verifica "e per i documenti Google c'e' la nota della classe"      (Test-Path (Join-Path $anno 'CLASSI\4Ar\DUPLICA IN GOOGLE DOCS - 4Ar.txt'))
    Verifica "i file del gruppo sono copiati, sottocartelle comprese"  ((Test-Path (Join-Path $anno 'Verifiche\Compito.docx')) -and (Test-Path (Join-Path $anno 'Verifiche\Archivio\Vecchio.docx')))
    Verifica "i documenti Google no: restano nella nota del gruppo"    (-not (Test-Path (Join-Path $anno 'Verifiche\Traccia.gdoc')) -and (Leggi $notaVerifiche).Contains('- Traccia.gdoc') -and (Leggi $notaVerifiche).Contains('- Archivio\Foglio.gsheet'))
    Verifica "i moduli hanno la loro riga nella nota"                  ((Leggi $notaVerifiche).Contains('- Recuperi.gform') -and (Leggi $notaVerifiche).Contains('NON vanno duplicati'))
    $intatta = $tG.GetMethod('NotaIntatta', $FS)
    Verifica "la nota porta il codice di Campanella"                   ($intatta.Invoke($null, @([string](Leggi $notaAltro))))

    # --- 3. i conti: creati e gia' presenti -----------------------------------------
    Write-Host "`nI CONTI" -ForegroundColor Cyan
    Verifica "primo giro: tutto creato adesso ($($r1.Creati))"  ($r1.Creati -gt 20 -and $r1.GiaPresenti -eq 0)

    # l'utente scrive nella nota del gruppo: il secondo giro non deve toccarla
    $mia = (Leggi $notaVerifiche) + "`r`nTraccia duplicata il 3/9 - M.R.`r`n"
    Scrivi $notaVerifiche $mia
    Verifica "una nota modificata a mano non e' piu' intatta"  (-not $intatta.Invoke($null, @([string]$mia)))
    $r2 = Genera $finto $classi $gruppi $struttura 'Progetti, PCTO'
    Verifica "secondo giro: niente di nuovo ($($r2.Creati))"             ($r2.Creati -eq 0)
    Verifica "e tutto contato come gia' presente ($($r2.GiaPresenti))"   ($r2.GiaPresenti -eq $r1.Creati)
    Verifica "la nota modificata dall'utente e' rimasta com'era"         ((Leggi $notaVerifiche) -eq $mia)
    Verifica "e il registro lo dice"                                     (($r2.Registro | Where-Object { $_ -like "*l'hai modificata tu*" }).Count -eq 1)

    # --- 4. MODELLI cambia: la nota intatta si aggiorna, quella modificata no -----
    Write-Host "`nNOTE E MODELLI NUOVI" -ForegroundColor Cyan
    Scrivi (Join-Path $modelli 'Altro\Circolare.gdoc') '{}'
    Scrivi (Join-Path $modelli 'Verifiche\Nuova.gdoc') '{}'
    # una nota delle versioni precedenti, senza codice: uguale a quella di adesso
    Scrivi (Join-Path $modelli 'Vecchia\Avviso.gdoc') '{}'
    $notaVecchia = Join-Path $anno 'Vecchia\DUPLICA IN GOOGLE DOCS - Vecchia.txt'
    Scrivi $notaVecchia ("Duplicare in Google Drive (tasto destro -> Crea una copia) questi file:`r`n" +
                         "(i documenti Google non si possono copiare come file normali)`r`n`r`n- Avviso.gdoc`r`n")
    $r3 = Genera $finto $classi @('Verifiche', 'Altro', 'Vecchia') $struttura 'Progetti, PCTO'
    Verifica "la nota intatta nomina il documento nuovo"                 ((Leggi $notaAltro).Contains('- Circolare.gdoc') -and $intatta.Invoke($null, @([string](Leggi $notaAltro))))
    Verifica "quella modificata resta dell'utente"                       ((Leggi $notaVerifiche) -eq $mia)
    Verifica "e il registro dice cosa non nomina"                        (($r3.Registro | Where-Object { $_ -like '*Non nomina: Nuova.gdoc*' }).Count -eq 1)
    Verifica "la nota senza codice delle versioni precedenti lo riceve"  ($intatta.Invoke($null, @([string](Leggi $notaVecchia))) -and (Leggi $notaVecchia).Contains('- Avviso.gdoc'))
    Verifica "creato solo l'aggiornamento della nota ($($r3.Creati))"    ($r3.Creati -eq 1)

    # --- 5. il Drive va sempre dato: nessun ripiego sul Drive vero ------------------
    Write-Host "`nIL DRIVE" -ForegroundColor Cyan
    $messaggio = ''
    try { Genera '' $classi @() @('CLASSI') '' | Out-Null }
    catch { $messaggio = $_.Exception.InnerException.Message }
    Verifica "senza percorso del Drive si ferma e lo dice" ($messaggio -like '*Manca il percorso*')
}
finally { Remove-Item -Recurse -Force $finto -ErrorAction SilentlyContinue }

if ($script:fallimenti -eq 0) { Write-Host "`nTutte le prove superate." -ForegroundColor Green }
else { Write-Host "`nPROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
