<#
    filtri_a_caso.ps1 - i filtri di Gmail scelti a caso, fino al motore vero

        .\test\filtri_a_caso.ps1                      500 scenari, con il seme fisso
        .\test\filtri_a_caso.ps1 -Scenari 2000        di piu'
        .\test\filtri_a_caso.ps1 -Solo 17,230         solo quelli, raccontati per intero
        .\test\filtri_a_caso.ps1 -Seme 7              un altro giro (sempre lo stesso con lo stesso seme)

    La promessa della finestra "Filtri che hai gia' in Gmail..." (Posta,
    passo 4): nessun filtro va fra quelli da togliere se, tolto, anche un
    solo suo messaggio perde l'etichetta, l'archiviazione o il segna come
    letto che il filtro gli dava. Qui non a casi, ma a classi: ogni scenario
    e' inventato a caso, con un seme fisso (lo stesso seme da' sempre gli
    stessi scenari): le regole di partenza, a volte spente, riordinate, con
    dei mittenti in piu', una regola Portali e la sua gemella; da 2 a 6
    filtri con etichette uguali, simili o diverse da quelle delle regole,
    mittenti presi da un piccolo insieme di domini, indirizzi e parole che si
    sovrappongono, a volte con delle esclusioni (-from: con parole, parti
    locali, indirizzi, domini, nomi), che archiviano o segnano come letti a
    caso, qualcuno con la stella, qualcuno due volte; a volte delle voci
    scelte prima (anche come le salvava la 1.6.0, senza la regola e senza
    le azioni). Poi la finestra vera, costruita e mai mostrata, con le
    proposte di partenza (e ogni tanto un'altra scelta della tendina),
    FiltriGmail.Applica come dopo "Usa questa scelta", la configurazione
    (GeneratorePosta.Configurazione), e test\filtri_a_caso.js la prova nel
    motore vero: quali filtri toglie EXTRA_togliFiltri e, su una casella
    finta, se i messaggi di ognuno hanno ancora quello che il filtro dava
    (l'etichetta della regola che lo sostituisce). Non contano, come dice la
    finestra, i "Toglilo" senza regola scelti apposta, e i messaggi che la
    regola non prende perche' le regole, da sole (la stessa casella senza
    nessun filtro), gli danno l'etichetta di una regola che lei esclude (i
    colleghi per Studenti, la casella della scuola per Ministero e USR): non
    se gliela mette solo un filtro rimasto in Gmail, ne' se le regole
    escluse prendono tutti i messaggi di un mittente del filtro.

    Lo lancia test\prova_posta.ps1. Serve dist\Campanella.exe (.\build.ps1)
    e Node. Nessun dato vero: domini .example, e dei domini istituzionali
    delle regole di partenza con indirizzi di servizio.
    Esce con 1 se anche un solo scenario rompe la promessa.
#>
param(
    [int]$Scenari = 500,
    [int]$Seme = 20260926,
    # solo questi scenari (i numeri che stampa), raccontati per intero; anche separati da virgole
    [string[]]$Solo = @()
)
$ErrorActionPreference = 'Stop'
$qui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$radice = Split-Path -Parent $qui
$exe    = Join-Path $radice 'dist\Campanella.exe'
$motore = Join-Path $radice 'src\risorse\Organizzazione_Gmail.gs'
if (-not (Test-Path $exe)) { throw "Manca $exe`: compila prima con .\build.ps1" }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web.Extensions
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$FS  = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$FI  = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'
$tStato    = $asm.GetType('Campanella.Stato')
$tPersona  = $asm.GetType('Campanella.Persona')
$tRegola   = $asm.GetType('Campanella.Regola')
$tGen      = $asm.GetType('Campanella.GeneratorePosta')
$tFiltri   = $asm.GetType('Campanella.FiltriGmail')
$tFF       = $asm.GetType('Campanella.FormFiltriGmail')
$tVoce     = $asm.GetType('Campanella.FiltroDaTogliere')
$mLeggi    = $tFiltri.GetMethod('Leggi', $FS, $null, [Type[]]@([string]), $null)
$mApplica  = $tFiltri.GetMethod('Applica', $FS)
$mAncora   = $tFiltri.GetMethod('AncoraSostituito', $FS)
$mConf     = $tGen.GetMethod('Configurazione', $FS)
$tListaPersone = [type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tPersona)
$tListaVoci    = [type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tVoce)
$json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = [int]::MaxValue
function J($testo) { return $json.Serialize([string]$testo) }

$temporanea = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-filtri-a-caso-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporanea | Out-Null

# ---------------------------------------------------------------------------
#  LA CASELLA FINTA E I PEZZI DEI FILTRI
#  I mittenti si sovrappongono: lo stesso nome in due domini, un dominio e
#  un suo sottodominio, un indirizzo con "esami" nel dominio, la casella
#  della scuola @istruzione.it. I pezzi dei filtri vengono da li'.
# ---------------------------------------------------------------------------
$messaggi = @(
    @('comunicati@sindacato-uno.example', 'Sindacato Uno', 'Assemblea sindacale'),
    @('mario.rossi@sindacato-uno.example', 'Mario Rossi'),
    @('news@mail.sindacato-uno.example', 'Sindacato Uno'),
    @('esiti@esami.sindacato-uno.example', 'Sindacato Uno'),
    @('info@sindacato-due.example', 'Sindacato Due'),
    @('mario.rossi@sindacato-due.example', 'Mario Rossi'),
    @('newsletter@flcgil.it', 'Sindacato'),
    @('comunicazioni@istruzione.it', 'Ministero'),
    @('casella@istruzione.it', 'Istituto'),
    @('usr.regione@istruzione.gov.it', 'USR'),
    @('ufficio@mim.gov.it', 'MIM'),
    @('noreply@spaggiari.eu', 'ClasseViva'),
    @('avvisi@portaleargo.it', 'Argo'),
    @('info@nuvola.example', 'Nuvola'),
    @('preside@scuola.example', 'Dirigente'),
    @('vicepreside@scuola.example', 'Vicepreside'),
    @('segreteria@scuola.example', 'Segreteria'),
    @('anna.bianchi@scuola.example', 'Anna Bianchi', 'Assemblea di classe'),
    @('alunno.uno@scuola.example', 'Alunno Uno'),
    @('avvisi@portale-uno.example', 'Portale Uno'),
    @('esiti@esami.portale-uno.example', 'Portale Uno'),
    @('info@portale-due.example', 'Portale Due', 'Assemblea dei genitori'),
    @('mario.rossi@portale-due.example', 'Mario Rossi'),
    @('mamma.rossi@famiglie.example', 'Famiglia Rossi'),
    @('papa.verdi@famiglie.example', 'Famiglia Verdi'))
# chi manda un filtro: domini con e senza chiocciola, sottodomini, indirizzi,
# parti locali e parole
$mittenti = @(
    '@sindacato-uno.example', 'sindacato-uno.example', '@mail.sindacato-uno.example', 'mail.sindacato-uno.example',
    'comunicati@sindacato-uno.example', 'mario.rossi@sindacato-uno.example', '@sindacato-due.example',
    'sindacato-due.example', '@flcgil.it', 'newsletter@flcgil.it', '@istruzione.it', 'istruzione.it',
    'istruzione.gov.it', '@mim.gov.it', 'casella@istruzione.it', 'comunicazioni@istruzione.it', '@spaggiari.eu',
    'spaggiari.eu', 'portaleargo.it', 'nuvola', '@scuola.example', 'preside@scuola.example',
    'vicepreside@scuola.example', 'segreteria@scuola.example', 'anna.bianchi@scuola.example',
    'alunno.uno@scuola.example', '@portale-uno.example', 'portale-uno.example', 'avvisi@portale-uno.example',
    'portale-due.example', '@portale-due.example', 'esami.portale-uno.example', '@famiglie.example',
    'famiglie.example', 'mamma.rossi@famiglie.example', 'mario.rossi', 'esami')
# che cosa segue -from: in un'esclusione
$esclusioni = @(
    'esami', 'mario.rossi', 'mario.rossi@', 'mario.rossi@sindacato', 'rossi', 'news@mail.sindacato-uno.example',
    'casella@istruzione.it', '@sindacato-due.example', '"Mario Rossi"', 'avvisi@portale-uno.example',
    'portale-due.example', '@portale-uno.example', 'comunicati@sindacato-uno.example', 'mamma.rossi@famiglie.example',
    '@mail.sindacato-uno.example', 'sindacato-uno.example', 'info@portale-due.example')
$etichette = @('Sindacati', 'Sindacati', 'Ministero e USR', 'Registro elettronico', 'Dirigenza', 'Segreteria', 'Studenti',
               'Colleghi', 'Colleghi/Docenti', 'Genitori', 'Sindacato', 'Famiglie', 'Portali', 'Portali', 'Gare', 'Newsletter',
               'Circolari')

# ---------------------------------------------------------------------------
#  UNO SCENARIO
# ---------------------------------------------------------------------------
function Imposta($s, $campo, $valore) { $tStato.GetField($campo, $FI).SetValue($s, $valore) }
function Leggi($s, $campo) { return ,($tStato.GetField($campo, $FI).GetValue($s)) }
function ACaso($caso, [double]$p) { return $caso.NextDouble() -lt $p }
function Uno($caso, $elenco) { return $elenco[$caso.Next($elenco.Count)] }
function Alcuni($caso, $elenco, [int]$quanti) {
    $fuori = New-Object System.Collections.Generic.List[string]
    for ($k = 0; $k -lt 20 -and $fuori.Count -lt $quanti; $k++) {
        $x = Uno $caso $elenco
        if (-not $fuori.Contains($x)) { $fuori.Add($x) }
    }
    return ,$fuori.ToArray()
}
function Regola($s, $etichetta) { return @((Leggi $s 'Regole') | Where-Object { $_.Etichetta -eq $etichetta })[0] }
function NuovaRegola($etichetta, $da, [bool]$archivia, [bool]$letti, $query) {
    $r = [Activator]::CreateInstance($tRegola)
    $r.Etichetta = $etichetta
    foreach ($d in $da) { $r.Da.Add($d) }
    $r.Archivia = $archivia
    $r.SegnaComeLette = $letti
    $r.QueryLibera = $query
    $r.Colore = '#e07798/#000000'
    return $r
}

function NuovoStato($caso, $altro) {
    $s = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($tStato)
    Imposta $s 'Drive' $temporanea
    Imposta $s 'CartellaDati' $temporanea
    Imposta $s 'DatiNelDrive' $false
    Imposta $s 'Dominio' 'scuola.example'
    Imposta $s 'Prefisso' $(if (ACaso $caso 0.8) { 'Scuola' } else { '' })
    Imposta $s 'EtichettaPerRuolo' (ACaso $caso 0.1)
    Imposta $s 'Dirigenza' 'preside@scuola.example'
    Imposta $s 'Segreteria' "segreteria@scuola.example`r`ncasella@istruzione.it"
    Imposta $s 'Registro' '@spaggiari.eu'
    Imposta $s 'Prova' $false
    Imposta $s 'Report' $false
    Imposta $s 'EscludiInviata' $true
    Imposta $s 'Periodo' ([int]0)
    Imposta $s 'Ore' ([int]1)
    Imposta $s 'ColoriRuoli' (New-Object 'System.Collections.Generic.Dictionary[string,string]')
    Imposta $s 'MadriClassi' (New-Object 'System.Collections.Generic.List[string]')
    Imposta $s 'FiltriDaTogliere' ([Activator]::CreateInstance($tListaVoci))
    $personale = [Activator]::CreateInstance($tListaPersone)
    if (ACaso $caso 0.8) {
        $p = [Activator]::CreateInstance($tPersona)
        $p.Nome = 'BIANCHI ANNA'; $p.Ruolo = 'DOCENTE'; $p.Email = 'anna.bianchi@scuola.example'; $p.Incluso = $true
        $personale.Add($p)
    }
    $tStato.GetField('Personale', $FI).SetValue($s, $personale)
    $regole = $tStato.GetMethod('RegoleDiDefault', $FS).Invoke($null, @())
    $tStato.GetField('Regole', $FI).SetValue($s, $regole)

    # le regole come le ha cambiate il docente
    $sind = Regola $s 'Sindacati'
    if (ACaso $caso 0.6) { $sind.Da.Add('@sindacato-uno.example') }
    if (ACaso $caso 0.3) { $sind.Da.Add('sindacato-due.example') }
    if (ACaso $caso 0.15) { $sind.Archivia = $false }
    if (ACaso $caso 0.15) { $sind.SegnaComeLette = $true }
    if (ACaso $caso 0.1) { $sind.QueryLibera = '-from:esami' }
    # una riga dei mittenti con due indirizzi (l'editor della 1.6.0 la teneva
    # cosi'), a volte un nome fra virgolette
    if (ACaso $altro 0.15) {
        $sind.Da.Add((Uno $altro @('@sindacato-uno.example sindacato-due.example', 'comunicati@sindacato-uno.example, @flcgil.it',
                                   '@mail.sindacato-uno.example;newsletter@flcgil.it', 'mario.rossi@sindacato-due.example info@sindacato-due.example')))
    }
    if (ACaso $altro 0.05) { $sind.Da.Add('"Sindacato Uno"') }
    if (ACaso $caso 0.3) {
        $gen = Regola $s 'Genitori'
        $gen.Da.Add('@famiglie.example')
        $gen.Attiva = (ACaso $caso 0.5)
    }
    if (ACaso $caso 0.2) { Imposta $s 'Registro' "@spaggiari.eu`r`nnuvola" }
    if (ACaso $caso 0.4) {
        $portali = NuovaRegola 'Portali' (Alcuni $caso @('portale-uno.example', '@portale-uno.example', 'avvisi@portale-uno.example', 'portale-due.example') (1 + $caso.Next(2))) (ACaso $caso 0.5) (ACaso $caso 0.3) $(if (ACaso $caso 0.2) { '-from:esami' } else { '' })
        if (ACaso $altro 0.15) { $portali.Da.Add('info@portale-due.example, mario.rossi@portale-due.example') }
        $regole.Add($portali)
        if (ACaso $caso 0.35) {
            $regole.Add((NuovaRegola 'Portali' (Alcuni $caso @('info@portale-due.example', 'esami.portale-uno.example', 'mario.rossi@portale-due.example') 1) (ACaso $caso 0.5) (ACaso $caso 0.3) ''))
        }
    }
    foreach ($e in @('Dirigenza', 'Segreteria', 'Registro elettronico', 'Colleghi', 'Studenti', 'Ministero e USR', 'Sindacati')) {
        if (ACaso $caso 0.08) { (Regola $s $e).Attiva = $false }
    }
    if (ACaso $caso 0.3) {
        $i = $caso.Next($regole.Count); $j = $caso.Next($regole.Count)
        $x = $regole[$i]; $regole[$i] = $regole[$j]; $regole[$j] = $x
    }
    if (ACaso $caso 0.1) {
        $min = Regola $s 'Ministero e USR'
        [void]$regole.Remove($min); $regole.Insert(0, $min)
    }
    return $s
}

function UnFiltro($caso, [string]$prefisso) {
    $e = Uno $caso $etichette
    if ($prefisso -ne '' -and (ACaso $caso 0.85)) { $e = $prefisso + '/' + $e }
    if (ACaso $caso 0.1) { $e = $e.ToLowerInvariant() }
    $prop = [ordered]@{}
    $da = Alcuni $caso $mittenti (1 + $caso.Next(3))
    $quante = if (ACaso $caso 0.55) { 0 } elseif (ACaso $caso 0.75) { 1 } else { 2 }
    $tolti = Alcuni $caso $esclusioni $quante
    $escl = @($tolti | ForEach-Object { '-from:' + $_ })
    $forma = $caso.Next(10)
    if ($forma -le 4) {
        $prop['from'] = ($da -join ' OR ')
        if ($escl.Count) { $prop['hasTheWord'] = ($escl -join ' ') }
    } elseif ($forma -le 7) {
        $prop['hasTheWord'] = ($(if ($da.Count -eq 1) { 'from:' + $da[0] } else { 'from:(' + ($da -join ' OR ') + ')' }) + ' ' + ($escl -join ' ')).Trim()
    } elseif ($forma -eq 8) {
        $prop['from'] = $(if ($da.Count -eq 1) { $da[0] } else { '{' + ($da -join ' ') + '}' })
    } elseif (ACaso $caso 0.5) {
        # non solo mittenti: con l'oggetto
        $prop['from'] = ($da -join ' OR ')
        $prop['subject'] = 'assemblea'
    } else {
        $prop['hasTheWord'] = ('subject:assemblea ' + ($escl -join ' ')).Trim()
    }
    if (ACaso $caso 0.4) { $prop['shouldArchive'] = 'true' }
    if (ACaso $caso 0.25) { $prop['shouldMarkAsRead'] = 'true' }
    if (ACaso $caso 0.1) { $prop['shouldStar'] = 'true' }
    return @{ etichetta = $e; prop = $prop }
}

function Esporta($filtri) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("<?xml version='1.0' encoding='UTF-8'?><feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'><title>Mail Filters</title>")
    foreach ($f in $filtri) {
        [void]$sb.Append("<entry><category term='filter'></category><title>Mail Filter</title><content></content>")
        foreach ($k in $f.prop.Keys) { [void]$sb.Append("<apps:property name='$k' value='" + [System.Security.SecurityElement]::Escape([string]$f.prop[$k]) + "'/>") }
        [void]$sb.Append("<apps:property name='label' value='" + [System.Security.SecurityElement]::Escape($f.etichetta) + "'/></entry>")
    }
    [void]$sb.Append('</feed>')
    return $sb.ToString()
}

function Descrivi($s) {
    $sb = New-Object System.Text.StringBuilder
    $persone = @((Leggi $s 'Personale') | ForEach-Object { $_.Email }) -join ', '
    [void]$sb.AppendLine("gruppo: '" + (Leggi $s 'Prefisso') + "'; personale: " + $persone +
                         $(if (Leggi $s 'EtichettaPerRuolo') { '; con le sottoetichette dei ruoli' } else { '' }))
    [void]$sb.AppendLine('La tua scuola: Dirigenza=' + ((Leggi $s 'Dirigenza') -replace "`r`n", ' ') + '; Segreteria=' +
                         ((Leggi $s 'Segreteria') -replace "`r`n", ' ') + '; Registro=' + ((Leggi $s 'Registro') -replace "`r`n", ' '))
    foreach ($r in (Leggi $s 'Regole')) {
        [void]$sb.AppendLine('  regola ' + $r.Etichetta + $(if (-not $r.Attiva) { ' (spenta)' } else { '' }) +
            $(if ($r.Da.Count) { ' da=' + ($r.Da -join ',') } else { '' }) + $(if ($r.QueryLibera) { " query='" + $r.QueryLibera + "'" } else { '' }) +
            $(if ($r.EscludiEtichette.Count) { ' escl=' + ($r.EscludiEtichette -join ',') } else { '' }) +
            $(if ($r.Archivia) { ' archivia' } else { '' }) + $(if ($r.SegnaComeLette) { ' letti' } else { '' }))
    }
    return $sb.ToString()
}

$scenariJson = New-Object System.Collections.Generic.List[string]
$Solo = @($Solo | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' } | ForEach-Object { [int]$_ })
$quali = if ($Solo.Count) { $Solo } else { 0..($Scenari - 1) }
$inizio = Get-Date
$conPrima = 0; $sceltiACaso = 0; $totaleFiltri = 0; $senzaFile = 0; $riaperti = 0
$fRighe = $tFF.GetField('righe', $FI)
# quello che la finestra sbaglia da sola, senza il motore: una scelta fatta a
# mano che cambia aprendo di nuovo lo stesso file
$finestraStorta = New-Object System.Collections.Generic.List[string]
foreach ($n in $quali) {
    # ogni scenario ha il suo seme, dal seme e dal suo numero: lo stesso scenario
    # si rifa' da solo (-Solo), e due semi vicini non danno gli stessi scenari
    $semeScenario = [int](([long]$Seme * 1000003 + [long]$n * 7919) % 2147483647)
    $caso = New-Object System.Random $semeScenario
    # le forme aggiunte dopo (righe dei mittenti con due indirizzi...) hanno il
    # loro generatore: gli scenari di prima restano quelli
    $altro = New-Object System.Random ([int](([long]$semeScenario * 31 + 17) % 2147483647))
    $s = NuovoStato $caso $altro
    $prefisso = [string](Leggi $s 'Prefisso')
    $filtri = @()
    $quanti = 2 + $caso.Next(5)
    for ($k = 0; $k -lt $quanti; $k++) {
        if ($k -gt 0 -and (ACaso $caso 0.1)) {
            # lo stesso filtro due volte, a volte con altre azioni
            $f = $filtri[$caso.Next($filtri.Count)]
            $copia = @{ etichetta = $f.etichetta; prop = [ordered]@{} }
            foreach ($c in $f.prop.Keys) { if (-not $c.StartsWith('should')) { $copia.prop[$c] = $f.prop[$c] } }
            foreach ($c in $f.prop.Keys) { if ($c.StartsWith('should') -and (ACaso $caso 0.7)) { $copia.prop[$c] = $f.prop[$c] } }
            if (ACaso $caso 0.2) { $copia.prop['shouldArchive'] = 'true' }
            $filtri += ,$copia
        } else { $filtri += ,(UnFiltro $caso $prefisso) }
    }
    $totaleFiltri += $filtri.Count
    $xml = Esporta $filtri
    $lista = $mLeggi.Invoke($null, @([string]$xml))

    # le voci scelte prima: come la 1.6.0 (senza la regola e le azioni), con
    # la regola che le sostituiva, o "Toglilo" e basta
    $esplicite = New-Object System.Collections.Generic.List[string]
    $prima = @()
    if (ACaso $caso 0.25) {
        $conPrima++
        foreach ($f in @($lista | Where-Object { $null -ne $_.DaTogliere() } | Select-Object -First (1 + $caso.Next(2)))) {
            if (-not (ACaso $caso 0.7)) { continue }
            $v = $f.DaTogliere()
            $tipo = $caso.Next(10)
            if ($tipo -le 4) { $v.Regola = ''; $v.Archivia = $null; $v.SegnaLetto = $null; $prima += '1.6.0' }
            elseif ($tipo -le 7) {
                $regoleS = Leggi $s 'Regole'
                $v.Regola = $(if (ACaso $caso 0.5) { $regoleS[$caso.Next($regoleS.Count)].Etichetta } else { ($f.Etichetta -split '/')[-1] })
                $prima += 'regola ' + $v.Regola
            } else { $v.Regola = ''; $esplicite.Add($v.Chiave()); $prima += 'toglilo' }
            (Leggi $s 'FiltriDaTogliere').Add($v)
        }
    }
    $racconto = New-Object System.Text.StringBuilder
    [void]$racconto.Append((Descrivi $s))
    if ($prima.Count) { [void]$racconto.AppendLine('scelti prima: ' + ($prima -join '; ')) }

    # senza il file: con le voci scelte prima con la 1.6.0 (o "Toglilo" e
    # basta), a volte la configurazione copiata cosi' com'e', a volte la
    # finestra senza il file, con qualche scelta a mano, e "Usa questa scelta".
    # Non con le voci inventate con una regola: la finestra le fa con il file,
    # e le ricontrolla con gli altri filtri
    $modo = 'file'
    if ($prima.Count -and @($prima | Where-Object { $_ -like 'regola *' }).Count -eq 0) {
        $x = $altro.NextDouble()
        if ($x -lt 0.3) { $modo = 'configurazione' } elseif ($x -lt 0.6) { $modo = 'senza file' }
    }
    if ($modo -ne 'file') { $senzaFile++; [void]$racconto.AppendLine('modo: ' + $modo) }

    # la finestra vera, costruita e mai mostrata
    $ff = [Activator]::CreateInstance($tFF, @($s.PSObject.BaseObject))
    if ($modo -eq 'senza file') {
        $vociPrima = Leggi $s 'FiltriDaTogliere'
        for ($i = 0; $i -lt $vociPrima.Count; $i++) {
            $proposta = $ff.Scelta($i).Testo
            $scelte = $ff.Scelte($i)
            if ($scelte.Count -ge 2 -and (ACaso $altro 0.3)) {
                $c = $scelte[$altro.Next($scelte.Count)]
                $ff.Scegli($i, $c)
                $sceltiACaso++
                if ($c.Azione -eq 'togli' -and $null -eq $c.Regola) { $esplicite.Add($vociPrima[$i].Chiave()) }
            }
            [void]$racconto.AppendLine('  riga ' + $i + ' (scelta prima): ' + $vociPrima[$i].Etichetta + '   proposta: ' + $proposta +
                $(if ($ff.Scelta($i).Testo -ne $proposta) { '   scelta: ' + $ff.Scelta($i).Testo } else { '' }))
        }
    }
    if ($modo -eq 'file') { $ff.Carica($lista) }
    for ($i = 0; $modo -eq 'file' -and $i -lt $lista.Count; $i++) {
        $proposta = $ff.Scelta($i).Testo
        $scelte = $ff.Scelte($i)
        if ($scelte.Count -ge 2 -and (ACaso $caso 0.2)) {
            $c = $scelte[$caso.Next($scelte.Count)]
            $ff.Scegli($i, $c)
            $sceltiACaso++
            # "Toglilo" senza regola, scelto apposta: il filtro va via e basta
            $v = $lista[$i].DaTogliere()
            if ($null -ne $v -and $c.Azione -eq 'togli' -and $null -eq $c.Regola) { $esplicite.Add($v.Chiave()) }
        }
        $f = $lista[$i]
        [void]$racconto.AppendLine('  filtro ' + $i + ': ' + $f.Etichetta + ' {' + (($f.Criteri.Keys | ForEach-Object { $_ + '=' + $f.Criteri[$_] }) -join '; ') + '}' +
            $(if ($f.Archivia) { ' archivia' } else { '' }) + $(if ($f.SegnaLetto) { ' letti' } else { '' }) +
            $(if ($f.AltreAzioni.Count) { ' +' + ($f.AltreAzioni -join ',') } else { '' }))
        [void]$racconto.AppendLine('      proposta: ' + $proposta + $(if ($ff.Scelta($i).Testo -ne $proposta) { '   scelta: ' + $ff.Scelta($i).Testo } else { '' }))
    }
    # a volte lo stesso file aperto di nuovo nella stessa finestra ("Apri il
    # file..." una seconda volta, con i filtri letti di nuovo): le scelte fatte
    # a mano restano, e ogni tanto se ne fa un'altra
    if ($modo -eq 'file' -and (ACaso $altro 0.2)) {
        $riaperti++
        $comeErano = @($fRighe.GetValue($ff) | ForEach-Object { @{ aMano = [bool]$_.AMano; testo = [string]$_.Scelta.Testo } })
        $lista = $mLeggi.Invoke($null, @([string]$xml))
        $ff.Carica($lista)
        $comeSono = @($fRighe.GetValue($ff))
        for ($i = 0; $i -lt $lista.Count; $i++) {
            if ($comeErano[$i].aMano -and $comeSono[$i].Scelta.Testo -ne $comeErano[$i].testo) {
                $finestraStorta.Add("scenario ${n}, filtro ${i}: scelto a mano '" + $comeErano[$i].testo + "', aperto di nuovo '" + $comeSono[$i].Scelta.Testo + "'")
            }
            $scelte = $ff.Scelte($i)
            if ($scelte.Count -ge 2 -and (ACaso $altro 0.1)) {
                $c = $scelte[$altro.Next($scelte.Count)]
                $ff.Scegli($i, $c)
                $sceltiACaso++
                $v = $lista[$i].DaTogliere()
                if ($null -ne $v -and $c.Azione -eq 'togli' -and $null -eq $c.Regola) { $esplicite.Add($v.Chiave()) }
            }
        }
        [void]$racconto.AppendLine('aperto di nuovo lo stesso file: ' + ((0..($lista.Count - 1) | ForEach-Object { $ff.Scelta($_).Testo }) -join '; '))
    }
    $fatte = $ff.FatteAdesso()
    $ff.Dispose()
    if ($modo -ne 'configurazione') {
        $esito = [string]$mApplica.Invoke($null, @($s.PSObject.BaseObject, $fatte))
        [void]$racconto.AppendLine('Applica: ' + ($esito -replace '\r?\n', ' '))
    }
    $voci = @{}
    foreach ($v in (Leggi $s 'FiltriDaTogliere')) {
        if ($null -eq $v) { continue }
        $voci[$v.Chiave()] = $v
        [void]$racconto.AppendLine('  da togliere: ' + $v.Etichetta + " regola='" + $v.Regola + "' archivia=" + $v.Archivia + ' letti=' + $v.SegnaLetto +
            ' sostituito=' + $mAncora.Invoke($null, @($v, $s)))
    }
    $configurazione = [string]$mConf.Invoke($null, @($s.PSObject.BaseObject, $false, [datetime]'2026-09-26T10:00:00'))

    $fj = New-Object System.Collections.Generic.List[string]
    foreach ($f in $lista) {
        $criteri = ($f.Criteri.Keys | ForEach-Object { (J $_) + ':' + (J $f.Criteri[$_]) }) -join ','
        $v = $f.DaTogliere()
        $chiave = if ($null -eq $v) { '' } else { $v.Chiave() }
        $regola = if ($chiave -ne '' -and $voci.ContainsKey($chiave)) { [string]$voci[$chiave].Regola } else { '' }
        $esplicito = ($chiave -ne '' -and $esplicite.Contains($chiave) -and $regola -eq '')
        $fj.Add('{"etichetta":' + (J $f.Etichetta) + ',"criteri":{' + $criteri + '},"archivia":' + $(if ($f.Archivia) { 'true' } else { 'false' }) +
                ',"letti":' + $(if ($f.SegnaLetto) { 'true' } else { 'false' }) + ',"regola":' + (J $regola) +
                ',"esplicito":' + $(if ($esplicito) { 'true' } else { 'false' }) + '}')
    }
    $scenariJson.Add('{"nome":' + (J $n) + ',"configurazione":' + (J $configurazione) + ',"racconto":' + (J $racconto.ToString()) +
                     ',"filtri":[' + ($fj -join ',') + ']}')
    if ($Solo.Count) { Write-Host "--- scenario $n"; Write-Host $racconto.ToString() }
}
$mj = ($messaggi | ForEach-Object { '{"da":' + (J $_[0]) + ',"nome":' + (J $_[1]) + $(if ($_.Count -gt 2) { ',"oggetto":' + (J $_[2]) } else { '' }) + '}' }) -join ','
$file = Join-Path $temporanea 'scenari.json'
[System.IO.File]::WriteAllText($file, '{"messaggi":[' + $mj + '],"scenari":[' + ($scenariJson -join ',') + ']}', (New-Object System.Text.UTF8Encoding($false)))
$preparati = [math]::Round(((Get-Date) - $inizio).TotalSeconds, 1)
Write-Host ("Seme {0}: {1} scenari ({2} filtri, {3} con delle voci scelte prima, {4} senza il file, {5} con il file aperto di nuovo; {6} scelte a caso nella tendina) preparati in {7} s" -f
    $Seme, $quali.Count, $totaleFiltri, $conPrima, $senzaFile, $riaperti, $sceltiACaso, $preparati)
foreach ($x in $finestraStorta) { Write-Host "FINESTRA: $x" }
try {
    & node (Join-Path $qui 'filtri_a_caso.js') $file $motore
    $codice = $LASTEXITCODE
} finally {
    Remove-Item $temporanea -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host ("In tutto {0} s" -f [math]::Round(((Get-Date) - $inizio).TotalSeconds, 1))
if ($finestraStorta.Count -gt 0) {
    Write-Host ("Scelte a mano cambiate aprendo di nuovo il file: {0}" -f $finestraStorta.Count)
    exit 1
}
exit $codice
