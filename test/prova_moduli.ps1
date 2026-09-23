<#
    prova_moduli.ps1 - lo script dei moduli Google, dalla parte di Campanella

        .\test\prova_moduli.ps1

    Carica dist\Campanella.exe come assembly e chiama il generatore vero
    (ScriptModuli, in src\Moduli.cs): scrive il codice nelle due versioni, con
    e senza Drive, e lo fa girare nel banco di prova test\mock_moduli.js.
    Controlla anche le proposte (cartella, nome del foglio), i controlli sui
    campi, il manifest e il riconoscimento del foglio gia' presente sul PC.
    Gli script generati vanno in una cartella temporanea, cancellata alla
    fine: nella copia di lavoro non resta niente. I due banchi girano anche
    con il PC in un altro fuso orario.
#>
$ErrorActionPreference = 'Stop'
$qui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$radice = Split-Path -Parent $qui
$exe    = Join-Path $radice 'dist\Campanella.exe'
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$FS  = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$tS  = $asm.GetType('Campanella.ScriptModuli')
$tP  = $asm.GetType('Campanella.ParametriModulo')

$script:fallimenti = 0
function Verifica($testo, $ok) {
    if ($ok) { Write-Host "  OK      $testo" }
    else { Write-Host "  FALLITO $testo" -ForegroundColor Red; $script:fallimenti++ }
}
function Chiama($nome, [object[]]$argomenti, [Type[]]$tipi) {
    $m = if ($tipi) { $tS.GetMethod($nome, $FS, $null, $tipi, $null) } else { $tS.GetMethod($nome, $FS) }
    for ($i = 0; $i -lt $argomenti.Count; $i++) {
        if ($argomenti[$i] -is [psobject] -and $null -ne $argomenti[$i].PSObject.BaseObject) {
            $argomenti[$i] = $argomenti[$i].PSObject.BaseObject
        }
    }
    return $m.Invoke($null, $argomenti)
}
function Parametri([bool]$drive) {
    $p = [Activator]::CreateInstance($tP)
    $p.Modulo = 'Recuperi'
    $p.Anno = 'auto'
    $p.CartellaFoglio = 'RECUPERI'
    $p.NomeFoglio = 'Risposte Recuperi - A.S. {anno}'
    $p.Chiusura = '31/08'
    $p.UsaDrive = $drive
    return $p
}
function Scrivi($percorso, $testo) {
    [System.IO.File]::WriteAllText($percorso, $testo, (New-Object System.Text.UTF8Encoding($false)))
}

# gli script generati: in una cartella temporanea, non dentro test\
$uscita = Join-Path ([System.IO.Path]::GetTempPath()) ("campanella-prova-moduli-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $uscita | Out-Null
try {   # fino in fondo: la cartella temporanea se ne va anche se una prova si rompe

# --- 1. il codice generato, nelle due versioni, dentro il banco di prova -------
Write-Host "`nIL CODICE GENERATO" -ForegroundColor Cyan
$conDrive = Chiama 'Codice' @((Parametri $true)) @($tP)
$senza    = Chiama 'Codice' @((Parametri $false)) @($tP)
$f1 = Join-Path $uscita 'Moduli_prova.gs'
$f2 = Join-Path $uscita 'Moduli_senzadrive_prova.gs'
Scrivi $f1 $conDrive
Scrivi $f2 $senza

Verifica "la versione con Drive usa DriveApp"                   ($conDrive.Contains('DriveApp.getRootFolder'))
Verifica "la versione senza Drive non lo nomina da nessuna parte" (-not $senza.Contains('DriveApp'))
Verifica "e lo dice nell'intestazione"                           ($senza.Contains('il permesso per Drive non viene chiesto') -and $senza.Contains('nella cartella dell''anno lo sposti tu'))
Verifica "nella versione senza Drive usaDrive e' false"          ($senza -match 'usaDrive:\s+false')
Verifica "la configurazione d'esempio e' stata sostituita"       (($conDrive -split 'var MODULO = ').Count -eq 2 -and $conDrive.Contains('per il modulo "Recuperi"'))
Verifica "righe a capo di Windows, per gli appunti"              ($conDrive.Contains("`r`n") -and -not ($conDrive -replace "`r`n", '').Contains("`n"))

foreach ($f in @($f1, $f2)) {
    & node (Join-Path $qui 'mock_moduli.js') $f | Out-Host
    Verifica "il banco di prova accetta $(Split-Path -Leaf $f)" ($LASTEXITCODE -eq 0)
}

# --- 2. nomi difficili: virgolette, barre, apostrofi -----------------------------
Write-Host "`nNOMI DIFFICILI" -ForegroundColor Cyan
$p = Parametri $true
$p.Modulo = 'Verifica "finale" */ dell''anno'
$p.NomeFoglio = 'Risposte "3A\B" d''esame - A.S. {anno}'
$p.CartellaFoglio = 'RECUPERI\TRIMESTRE'
$f3 = Join-Path $uscita 'Moduli_nomi_prova.gs'
Scrivi $f3 (Chiama 'Codice' @($p) @($tP))
$js = "const vm=require('vm'),fs=require('fs');const s={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),s);process.stdout.write(JSON.stringify(s.MODULO));"
$letta = (& node -e $js $f3) | ConvertFrom-Json
Verifica "lo script si carica anche con virgolette e barre nei nomi" ($LASTEXITCODE -eq 0 -and $null -ne $letta)
Verifica "il nome del foglio arriva identico"            ($letta.nomeFoglio -eq 'Risposte "3A\B" d''esame - A.S. {anno}')
Verifica "la sottocartella usa la barra dritta"          ($letta.cartellaFoglio -eq 'RECUPERI/TRIMESTRE')
Verifica "l'anno automatico resta 'auto'"                ($letta.anno -eq 'auto')

# il nome del modulo finisce in un commento // : Windows ammette U+2028 e U+2029 nei nomi dei
# file, e per JavaScript chiudono la riga come un a capo. Il resto del nome diventerebbe codice
$p5 = Parametri $true
$p5.Modulo = 'Recuperi' + [char]0x2028 + 'iniettato = 1;' + [char]0x2029 + 'altro = 2;' + "`r`n" + 'ancora = 3; //'
$f5 = Join-Path $uscita 'Moduli_acapo_prova.gs'
$codice5 = Chiama 'Codice' @($p5) @($tP)
Scrivi $f5 $codice5
$js5 = "const vm=require('vm'),fs=require('fs');const s={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),s);" +
       "process.stdout.write(String(s.iniettato===undefined&&s.altro===undefined&&s.ancora===undefined&&!!s.MODULO));"
$esito5 = (& node -e $js5 $f5)
Verifica "a capo nel nome del modulo (anche U+2028 e U+2029): lo script si carica e il nome non diventa codice" ($LASTEXITCODE -eq 0 -and $esito5 -eq 'true')
$rigaNome = @($codice5 -split "`r`n" | Where-Object { $_.Contains('per il modulo') })
Verifica "e il nome resta su una riga sola, nel commento" ($rigaNome.Count -eq 1 -and $rigaNome[0].StartsWith('// >>> CONFIGURAZIONE >>>') -and $rigaNome[0].Contains('"Recuperi iniettato = 1; altro = 2; ancora = 3; //"') -and $codice5.IndexOfAny([char[]]@([char]0x2028, [char]0x2029)) -lt 0)

# --- 3. proposte e controlli --------------------------------------------------------
Write-Host "`nPROPOSTE E CONTROLLI" -ForegroundColor Cyan
$cartelle = New-Object 'System.Collections.Generic.List[string]'
@('CLASSI', 'Verifiche e valutazione', 'RECUPERI\TRIMESTRE', 'RECUPERI\PENTAMESTRE') | ForEach-Object { $cartelle.Add($_) }
$tipiProposta = @([string], [System.Collections.Generic.IList[string]])
Verifica "Recuperi.gform -> RECUPERI" ((Chiama 'CartellaProposta' @('MODELLI\Verifiche e valutazione\Recuperi.gform', $cartelle) $tipiProposta) -eq 'RECUPERI')
Verifica "Sondaggio.gform in MODELLI\Verifiche e valutazione -> quella cartella" ((Chiama 'CartellaProposta' @('MODELLI\Verifiche e valutazione\Sondaggio.gform', $cartelle) $tipiProposta) -eq 'Verifiche e valutazione')
Verifica "un modulo che non somiglia a niente -> la cartella dell'anno" ((Chiama 'CartellaProposta' @('Uscite.gform', $cartelle) $tipiProposta) -eq '')
Verifica "nome del modulo dal percorso"  ((Chiama 'NomeModulo' @('MODELLI\Verifiche e valutazione\Recuperi.gform')) -eq 'Recuperi')
Verifica "nome del foglio proposto"      ((Chiama 'NomeFoglioProposto' @('Recuperi')) -eq 'Risposte Recuperi - A.S. {anno}')
Verifica "31/08 va bene"                 ((Chiama 'ControllaChiusura' @('31/08')) -eq '')
Verifica "31/02 no"                      ((Chiama 'ControllaChiusura' @('31/02')) -ne '')
Verifica "29/02 no (non c'e' tutti gli anni), come negli script" ((Chiama 'ControllaChiusura' @('29/02')).Contains('tutti gli anni'))
Verifica "e nemmeno in un anno bisestile"  ($null -eq (Chiama 'DataChiusura' @('29/02', '2027-28')))
Verifica "'fine agosto' no"              ((Chiama 'ControllaChiusura' @('fine agosto')) -ne '')
Verifica "anno 2026-27 va bene, 2026-28 no" (((Chiama 'ControllaAnno' @('2026-27')) -eq '') -and ((Chiama 'ControllaAnno' @('2026-28')) -ne ''))
$d = Chiama 'DataChiusura' @('31/08', '2026-27')
Verifica "31/08 del 2026-27 e' il 31 agosto 2027" ($d -eq [datetime]'2027-08-31')
$d2 = Chiama 'DataChiusura' @('31/12', '2026-27')
Verifica "31/12 del 2026-27 e' nel 2026"          ($d2 -eq [datetime]'2026-12-31')

$manifest = (Chiama 'Manifest' @((Parametri $true))) | ConvertFrom-Json
$manifestSenza = (Chiama 'Manifest' @((Parametri $false))) | ConvertFrom-Json
Verifica "il manifest e' JSON valido, con il fuso italiano" ($manifest.timeZone -eq 'Europe/Rome')
Verifica "chiede solo il modulo corrente, non tutti i moduli" ($manifest.oauthScopes -contains 'https://www.googleapis.com/auth/forms.currentonly' -and -not ($manifest.oauthScopes -contains 'https://www.googleapis.com/auth/forms'))
Verifica "Drive solo nella versione con Drive" (($manifest.oauthScopes -contains 'https://www.googleapis.com/auth/drive') -and -not ($manifestSenza.oauthScopes -contains 'https://www.googleapis.com/auth/drive'))

Verifica "il fuso del manifest e' quello di partenza di Campanella" ($manifest.timeZone -eq $tS.GetField('FusoDiDefault').GetValue($null))
Verifica "il modulo si riapre sempre (l'opzione non si sceglie da Campanella)" ($conDrive -match 'riapri:\s+true' -and $null -eq $tP.GetField('Riapri'))
Verifica "cartella dell'anno e fuso non sono opzioni: nel codice ci sono quelli di partenza" (
    $null -eq $tP.GetField('CartellaAnno') -and $null -eq $tP.GetField('FusoOrario') -and
    $conDrive -match 'cartellaAnno:\s+"A\.S\. \{anno\}"' -and $conDrive -match 'fusoOrario:\s+"Europe/Rome"')

$istr = Chiama 'Istruzioni' @((Parametri $true), '2026-27')
Verifica "le istruzioni parlano del menu sotto l'icona a puzzle" ($istr.Contains('puzzle') -and $istr.Contains('Prepara l''anno nuovo'))
$manifestAl  = $istr.IndexOf('appsscript.json')
$primaVolta  = $istr.IndexOf('MODULO_1_anteprima  e premi Esegui')
Verifica "il manifest viene prima della prima esecuzione, consigliato ma facoltativo" ($manifestAl -ge 0 -and $primaVolta -gt $manifestAl -and $istr.Contains('Consigliato, ma facoltativo'))
Verifica "e le istruzioni dicono di controllare nella finestra di Google quale permesso chiede" ($istr.Contains('lo vedi nella sua finestra'))
$pSv = Parametri $true; $pSv.Svuota = $true
Verifica "con lo svuotamento spiegano che ogni risposta viene ritrovata, e che non si annulla" ((Chiama 'Istruzioni' @($pSv, '2026-27')).Contains('una per una') -and (Chiama 'Istruzioni' @($pSv, '2026-27')).Contains('non si puo'' annullare'))
$pf = Parametri $true; $pf.Anno = '2027-28'
Verifica "con l'anno scritto a mano avvisano che va rigenerato" ((Chiama 'Istruzioni' @($pf, '2026-27')).Contains('fermo sull''anno 2027-28'))

# --- 4. un Drive finto sul disco -------------------------------------------------------
Write-Host "`nIL DRIVE SUL PC" -ForegroundColor Cyan
$finto = Join-Path ([System.IO.Path]::GetTempPath()) ("campanella-moduli-" + [Guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Force (Join-Path $finto 'MODELLI\Verifiche e valutazione') | Out-Null
    New-Item -ItemType Directory -Force (Join-Path $finto 'A.S. 2026-27\RECUPERI') | Out-Null
    Set-Content (Join-Path $finto 'MODELLI\Verifiche e valutazione\Recuperi.gform') 'x'
    Set-Content (Join-Path $finto 'Uscite.gform') 'x'
    Set-Content (Join-Path $finto 'MODELLI\Verifiche e valutazione\Griglia.gsheet') 'x'
    $trovati = Chiama 'TrovaModuli' @($finto)
    Verifica "trova i moduli in MODELLI e nella radice, non i fogli" ($trovati.Count -eq 2 -and $trovati -contains 'MODELLI\Verifiche e valutazione\Recuperi.gform' -and $trovati -contains 'Uscite.gform')
    Verifica "un Drive che non c'e' non rompe niente" ((Chiama 'TrovaModuli' @('Z:\non\esiste')).Count -eq 0)

    Verifica "il foglio dell'anno non c'e' ancora" (-not (Chiama 'FoglioSulPc' @($finto, '2026-27', (Parametri $true))))
    Set-Content (Join-Path $finto 'A.S. 2026-27\RECUPERI\Risposte Recuperi - A.S. 2026-27.gsheet') 'x'
    Verifica "adesso c'e': lo script per quest'anno ha gia' girato" (Chiama 'FoglioSulPc' @($finto, '2026-27', (Parametri $true)))
    Verifica "per l'anno dopo no" (-not (Chiama 'FoglioSulPc' @($finto, '2027-28', (Parametri $true))))
    Set-Content (Join-Path $finto 'Risposte Recuperi - A.S. 2026-27.gsheet') 'x'
    Verifica "senza Drive lo cerca nella radice" (Chiama 'FoglioSulPc' @($finto, '2026-27', (Parametri $false)))

    # --- quale dei due Drive e' quello della scuola ---------------------------
    Write-Host "`nDUE DRIVE SUL COMPUTER" -ForegroundColor Cyan
    $tSt = $asm.GetType('Campanella.Stato')
    function Esamina($percorso, $etichetta) {
        return $tSt.GetMethod('EsaminaDrive', $FS).Invoke($null, @([string]$percorso, [string]$etichetta))
    }
    $personale = Join-Path ([System.IO.Path]::GetTempPath()) ("campanella-personale-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force (Join-Path $personale 'Foto') | Out-Null
    try {
        $scuola = Esamina $finto 'mario.rossi@scuola.example - Google Drive'
        $casa   = Esamina $personale 'tizio@gmail.com - Google Drive'
        Verifica "riconosce MODELLI e le cartelle degli anni" ($scuola.ConModelli -and $scuola.ConAnni)
        Verifica "nell'altro non c'e' niente del genere"      (-not $casa.ConModelli -and -not $casa.ConAnni)
        Verifica "legge l'indirizzo dall'etichetta dell'unita'" ($scuola.Account -eq 'mario.rossi@scuola.example' -and $casa.Account -eq 'tizio@gmail.com')
        Verifica "quello della scuola vince"                  ($scuola.Punti -gt $casa.Punti)
        Verifica "un indirizzo gmail perde punti"             ($casa.Punti -lt 0)
        $anonimo = Esamina $personale ''
        Verifica "senza etichetta non penalizza nessuno"      ($anonimo.Punti -eq 0)
        $soloAnni = Esamina $finto ''
        Verifica "bastano le cartelle degli anni per vincere" ($soloAnni.Punti -gt $anonimo.Punti)
        Verifica "una cartella che non esiste non rompe"      ((Esamina 'Z:\non\esiste' '').Punti -eq 0)
        Verifica "la descrizione mostra percorso e account"   ($scuola.Descrizione().Contains($finto) -and $scuola.Descrizione().Contains('mario.rossi@scuola.example'))
    }
    finally { Remove-Item -Recurse -Force $personale -ErrorAction SilentlyContinue }
}
finally { Remove-Item -Recurse -Force $finto -ErrorAction SilentlyContinue }

# --- 5. il pannello: un foglio per piu' moduli ------------------------------------
Write-Host "`nIL PANNELLO" -ForegroundColor Cyan
$tipoLista = [System.Collections.Generic.List`1].MakeGenericType($tP)
$tipoIList = [System.Collections.Generic.IList`1].MakeGenericType($tP)
$elenco = [Activator]::CreateInstance($tipoLista)
$uno = Parametri $true
$due = [Activator]::CreateInstance($tP)
$due.Modulo = 'Uscite didattiche'
$due.Anno = 'auto'
$due.CartellaFoglio = ''
$due.NomeFoglio = 'Risposte Uscite - A.S. {anno}'
$due.Chiusura = '30/06'
$elenco.Add($uno.PSObject.BaseObject)
$elenco.Add($due.PSObject.BaseObject)
$tipiPannello = @($tipoIList)
# @($elenco) srotolerebbe la lista in piu' argomenti: l'array va costruito a mano
$argPannello = New-Object 'object[]' 1
$argPannello[0] = $elenco
$pannello = Chiama 'CodicePannello' $argPannello $tipiPannello
$fp = Join-Path $uscita 'Pannello_prova.gs'
Scrivi $fp $pannello

Verifica "il pannello non sta dentro un modulo"      (-not $pannello.Contains('FormApp.getActiveForm'))
Verifica "apre i moduli per id"                      ($pannello.Contains('FormApp.openById'))
Verifica "la configurazione e' stata sostituita"     (($pannello -split 'var PANNELLO = ').Count -eq 2)
$lettura = "const vm=require('vm'),fs=require('fs');const s={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),s);process.stdout.write(JSON.stringify(s.PANNELLO));"
$conf = (& node -e $lettura $fp) | ConvertFrom-Json
Verifica "una riga per modulo"                       ($conf.moduli.Count -eq 2)
Verifica "nomi, cartelle e chiusure delle righe"     ($conf.moduli[0].modulo -eq 'Recuperi' -and $conf.moduli[0].cartella -eq 'RECUPERI' -and $conf.moduli[1].chiusura -eq '30/06')
Verifica "le impostazioni comuni vengono dal primo"  ($conf.anno -eq 'auto' -and $conf.cartellaAnno -eq 'A.S. {anno}' -and $conf.fusoOrario -eq 'Europe/Rome')
Verifica "la scheda si chiama Moduli"                ($conf.scheda -eq 'Moduli')

& node (Join-Path $qui 'mock_pannello.js') $fp | Out-Host
Verifica "il banco di prova accetta Pannello_prova.gs" ($LASTEXITCODE -eq 0)

Verifica "il codice del foglio dice che chiede il permesso su tutti i moduli (serve openById)" ($pannello.Contains('su tutti i moduli'))
Verifica "e non c'e' un manifest da offrirgli: non restringerebbe niente" ($null -eq $tS.GetMethod('ManifestPannello', $FS))
$argIstr = New-Object 'object[]' 2
$argIstr[0] = $elenco
$argIstr[1] = '2026-27'
$istrP = Chiama 'IstruzioniPannello' $argIstr @($tipoIList, [string])
Verifica "le istruzioni avvisano del permesso piu' largo" ($istrP.Contains('TUTTI i moduli'))
Verifica "e spiegano il link giusto"                  ($istrP.Contains('/edit'))

# --- 6. i banchi non dipendono dal fuso del PC che li fa girare --------------------
Write-Host "`nALTRI FUSI ORARI" -ForegroundColor Cyan
foreach ($fuso in @('Asia/Tokyo', 'America/New_York')) {
    $primaTZ = $env:TZ
    $env:TZ = $fuso
    try {
        & node (Join-Path $qui 'mock_pannello.js') | Out-Null
        $okPannello = ($LASTEXITCODE -eq 0)
        & node (Join-Path $qui 'mock_moduli.js') | Out-Null
        $okModuli = ($LASTEXITCODE -eq 0)
    }
    finally { $env:TZ = $primaTZ }
    Verifica "i due banchi passano anche con il PC in $fuso" ($okPannello -and $okModuli)
}

}
finally { Remove-Item -Recurse -Force $uscita -ErrorAction SilentlyContinue }

if ($script:fallimenti -eq 0) { Write-Host "`nTutte le prove superate." -ForegroundColor Green }
else { Write-Host "`nPROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
