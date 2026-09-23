<#
    prova_personale.ps1 - l'elenco del personale: come si legge e come si divide

        .\test\prova_personale.ps1

    Due cose, che poi sono quelle che si rompono:

      - "Incolla elenco" deve capire tutti i formati che girano davvero: il
        blocco copiato dalla console di ClasseViva (raggruppato per ruolo),
        il TSV dell'estensione, il CSV scaricato dal registro o riesportato
        da Campanella, un elenco secco di indirizzi;
      - i ruoli del registro, che sono lunghi e tanti, devono finire nelle
        cinque categorie con cui Campanella etichetta la posta.
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
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host ("=" * 72)
}

$tStato = $asm.GetType('Campanella.Stato')
$tPosta = $asm.GetType('Campanella.PaginaPosta')
$tPersona = $asm.GetType('Campanella.Persona')
$FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$FI = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'

$mAnalizza = $tPosta.GetMethod('AnalizzaElenco', $FS)
$mCategoria = $tStato.GetMethod('CategoriaRuolo', $FS)

function Leggi($p, $campo) { return $tPersona.GetField($campo, $FI).GetValue($p) }
function Analizza($testo) { return $mAnalizza.Invoke($null, @([string]$testo)) }
function Categoria($ruolo) { return $mCategoria.Invoke($null, @([string]$ruolo)) }

# Uno Stato senza costruttore: "new Stato()" cerca il Drive vero del PC, e
# una prova non deve nemmeno guardarci. Il Drive e la cartella dei dati sono
# una cartella temporanea, e l'elenco del personale parte vuoto.
$temporanea = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-posta-personale-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporanea | Out-Null
$tListaPersone = [type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tPersona)
function NuovoStato {
    $s = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($tStato)
    $tStato.GetField('Drive', $FI).SetValue($s, $temporanea)
    $tStato.GetField('CartellaDati', $FI).SetValue($s, $temporanea)
    $tStato.GetField('DatiNelDrive', $FI).SetValue($s, $false)
    $tStato.GetField('Dominio', $FI).SetValue($s, '')
    $tStato.GetField('Personale', $FI).SetValue($s, [Activator]::CreateInstance($tListaPersone))
    return $s
}

# ---------------------------------------------------------------------------
Intestazione 'I RUOLI VERI DEL REGISTRO, RADUNATI IN CATEGORIE'
$attesi = @{
    'ASSISTENTE AMMINISTRATIVO'                     = 'Amministrativi'
    'DIRETTORE SGA'                                 = 'Amministrativi'
    'ASSISTENTE TECNICO'                            = 'Tecnici'
    'COLLABORATORE SCOLASTICO'                      = 'Collaboratori'
    'DIRIGENTE SCOLASTICO'                          = 'Dirigenza'
    'DOCENTE DI RELIGIONE'                          = 'Docenti'
    'DOCENTE DIPLOMATO SCUOLA SECONDARIA II GRADO'  = 'Docenti'
    'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO'   = 'Docenti'
}
foreach ($r in $attesi.Keys) {
    Verifica "$r -> $($attesi[$r])" ((Categoria $r) -eq $attesi[$r])
}
Verifica "il maiuscolo non conta" ((Categoria 'Docente laureato scuola secondaria II grado') -eq 'Docenti')

# le stesse categorie le calcolano anche l'estensione e la funzione da console,
# ognuna con la sua copia: test/invarianti_script.js le fa girare su una
# pagina finta, e qui si confrontano con quelle del C#
$js = (& node (Join-Path $radice 'test\invarianti_script.js') --categorie) | ConvertFrom-Json
Verifica "estensione e funzione da console rispondono" ($LASTEXITCODE -eq 0 -and $js.ruoli.Count -ge 15)
$diverse = @()
for ($i = 0; $i -lt $js.ruoli.Count; $i++) {
    $cs = Categoria $js.ruoli[$i]
    if ($js.estensione[$i] -ne $cs -or $js.console[$i] -ne $cs) {
        $diverse += "$($js.ruoli[$i]): C# '$cs', estensione '$($js.estensione[$i])', console '$($js.console[$i])'"
    }
}
Verifica "C#, estensione e funzione da console danno la stessa categoria a ogni ruolo ($($js.ruoli.Count))" ($diverse.Count -eq 0)
$diverse | ForEach-Object { Write-Host "          $_" }
Verifica "un ruolo che non conosco non inventa categorie" ((Categoria 'Ruolo non specificato') -eq '')
Verifica "gli studenti non sono una categoria del personale" ((Categoria 'Studente') -eq '')

# ---------------------------------------------------------------------------
Intestazione 'IL BLOCCO COPIATO DALLA CONSOLE (raggruppato per ruolo)'
$console = @"
SUDDIVISIONE PER RUOLO
ASSISTENTE AMMINISTRATIVO  (2)
   BIANCHI ANNA, ROSSI MARIO
COLLABORATORE SCOLASTICO  (1)
   VERDI GIUSEPPE
DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO  (1)
   NERI LUCIA
"@
$p = Analizza $console
Verifica "quattro persone" ($p.Count -eq 4)
Verifica "il ruolo del gruppo resta attaccato a chi viene dopo" (
    (Leggi $p[0] 'Ruolo') -like 'Assistente Amministrativo*' -and
    (Leggi $p[3] 'Ruolo') -like 'Docente Laureato*')
$nomi = @($p | ForEach-Object { Leggi $_ 'Nome' })
Verifica "la riga del titolo non diventa una persona" ($nomi -notcontains 'SUDDIVISIONE PER RUOLO')

# ---------------------------------------------------------------------------
Intestazione 'IL TSV DELL"ESTENSIONE, ADESSO CON LA CATEGORIA'
$tsv = "NOMINATIVO`tRUOLO`tEMAIL`tCATEGORIA`n" +
       "ROSSI MARIO`tASSISTENTE AMMINISTRATIVO`tm.rossi@scuola.edu.it`tAmministrativi`n" +
       "NERI LUCIA`tDOCENTE LAUREATO SCUOLA SECONDARIA II GRADO`tl.neri@scuola.edu.it`tDocenti"
$p = Analizza $tsv
Verifica "due persone" ($p.Count -eq 2)
Verifica "nome, ruolo e indirizzo al posto giusto" (
    (Leggi $p[0] 'Nome') -eq 'ROSSI MARIO' -and
    (Leggi $p[0] 'Email') -eq 'm.rossi@scuola.edu.it' -and
    (Leggi $p[0] 'Ruolo') -like 'Assistente Amministrativo*')
Verifica "la quarta colonna non rompe niente" ((Leggi $p[1] 'Email') -eq 'l.neri@scuola.edu.it')

# ---------------------------------------------------------------------------
Intestazione 'IL CSV, QUELLO SCARICATO DAL REGISTRO'
$csv = @"
"NOMINATIVO";"RUOLO";"EMAIL";"CATEGORIA"
"ROSSI MARIO";"ASSISTENTE AMMINISTRATIVO";"m.rossi@scuola.edu.it";"Amministrativi"
"D'AMICO ""PINO"" ANNA";"COLLABORATORE SCOLASTICO";"a.damico@scuola.edu.it";"Collaboratori"
"VERDI GIUSEPPE";"DOCENTE DI RELIGIONE";"";""
"@
$p = Analizza $csv
Verifica "tre persone" ($p.Count -eq 3)
Verifica "il ruolo non si perde per strada" ((Leggi $p[0] 'Ruolo') -like 'Assistente Amministrativo*')
# le virgolette doppiate del CSV non devono spezzare il campo; dentro al nome
# poi spariscono, come in tutti gli altri formati (servono solo a delimitare)
Verifica "le virgolette doppiate non spezzano il campo" (
    (Leggi $p[1] 'Nome') -eq 'D''AMICO PINO ANNA' -and
    (Leggi $p[1] 'Email') -eq 'a.damico@scuola.edu.it' -and
    (Leggi $p[1] 'Ruolo') -like 'Collaboratore Scolastico*')
Verifica "chi non ha indirizzo resta in elenco col suo ruolo" (
    (Leggi $p[2] 'Email') -eq '' -and (Leggi $p[2] 'Ruolo') -like 'Docente Di Religione*')

# ---------------------------------------------------------------------------
Intestazione 'GLI ELENCHI SECCHI DI INDIRIZZI NON DEVONO DIVENTARE CSV'
$p = Analizza "a.uno@scuola.edu.it; b.due@scuola.edu.it; c.tre@scuola.edu.it"
Verifica "tre indirizzi, non una riga sola" ($p.Count -eq 3)
Verifica "sono gli indirizzi giusti" ((Leggi $p[1] 'Email') -eq 'b.due@scuola.edu.it')

$p = Analizza "Mario Rossi <m.rossi@scuola.edu.it>"
Verifica "nome e indirizzo fra parentesi angolari" (
    (Leggi $p[0] 'Email') -eq 'm.rossi@scuola.edu.it' -and (Leggi $p[0] 'Nome') -eq 'Mario Rossi')
Verifica "un indirizzo della rubrica parte con la spunta" ((Leggi $p[0] 'Incluso') -eq $true)

# ---------------------------------------------------------------------------
Intestazione 'GLI INDIRIZZI PRESI DALLA CASELLA PARTONO SENZA SPUNTA'
# l'email di EXTRA_elencaIndirizziScuola: indirizzo, nome, quanti messaggi.
# Dentro ci sono anche gli studenti, e senza un ruolo nessuno puo' dire chi e' chi.
$casella = "INDIRIZZO`tNOME`tN. MESSAGGI`n" +
           "mario.rossi@scuola.edu.it`tMario Rossi`t41`n" +
           "studente.uno@scuola.edu.it`t`t3"
$p = Analizza $casella
Verifica "due righe, l'intestazione salta" ($p.Count -eq 2)
Verifica "nessuna parte con la spunta" (
    (Leggi $p[0] 'Incluso') -eq $false -and (Leggi $p[1] 'Incluso') -eq $false)
Verifica "il nome resta, senza il numero dei messaggi" ((Leggi $p[0] 'Nome') -eq 'Mario Rossi')
# copiata dal browser, a volte le tabulazioni diventano spazi
$p = Analizza "mario.rossi@scuola.edu.it   Mario Rossi   41"
Verifica "anche con gli spazi al posto delle tabulazioni" (
    $p.Count -eq 1 -and (Leggi $p[0] 'Incluso') -eq $false -and (Leggi $p[0] 'Nome') -eq 'Mario Rossi' -and
    (Leggi $p[0] 'Email') -eq 'mario.rossi@scuola.edu.it')
# chi arriva dal registro, con il suo ruolo, parte con la spunta come prima
$p = Analizza "ROSSI MARIO`tDOCENTE LAUREATO SCUOLA SECONDARIA II GRADO`tm.rossi@scuola.edu.it"
Verifica "chi ha un ruolo del personale parte con la spunta" ((Leggi $p[0] 'Incluso') -eq $true)

# ---------------------------------------------------------------------------
Intestazione 'DALL"ELENCO AI GRUPPI CHE FINISCONO IN GMAIL'
$stato = NuovoStato
$personale = $tStato.GetField('Personale', $FI).GetValue($stato)
foreach ($riga in @(
    @('ROSSI MARIO',   'ASSISTENTE AMMINISTRATIVO',                    'm.rossi@scuola.edu.it'),
    @('BIANCHI ANNA',  'DIRETTORE SGA',                                'a.bianchi@scuola.edu.it'),
    @('NERI LUCIA',    'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO',  'l.neri@scuola.edu.it'),
    @('GIALLI PIERO',  'DOCENTE DI RELIGIONE',                         'p.gialli@scuola.edu.it'),
    @('VERDI GIUSEPPE','COLLABORATORE SCOLASTICO',                     'g.verdi@scuola.edu.it'),
    @('BLU CARLA',     'ASSISTENTE TECNICO',                           'c.blu@scuola.edu.it'),
    @('GRIGI SARA',    'DIRIGENTE SCOLASTICO',                         's.grigi@scuola.edu.it'),
    @('VIOLA TIZIO',   'Ruolo non specificato',                        't.viola@scuola.edu.it'))) {
    $persona = [Activator]::CreateInstance($tPersona)
    $tPersona.GetField('Nome', $FI).SetValue($persona, $riga[0])
    $tPersona.GetField('Ruolo', $FI).SetValue($persona, $riga[1])
    $tPersona.GetField('Email', $FI).SetValue($persona, $riga[2])
    $personale.Add($persona)
}
$gruppi = $tStato.GetMethod('GruppiPerRuolo', $FI).Invoke($stato, @())
Verifica "cinque categorie" ($gruppi.Count -eq 5)
Verifica "il DSGA sta con gli amministrativi" ($gruppi['Amministrativi'].Count -eq 2)
Verifica "religione e' docenza" ($gruppi['Docenti'].Count -eq 2)
Verifica "un tecnico" ($gruppi['Tecnici'].Count -eq 1)
Verifica "un collaboratore" ($gruppi['Collaboratori'].Count -eq 1)
Verifica "il dirigente da solo" ($gruppi['Dirigenza'][0] -eq 's.grigi@scuola.edu.it')
$tutti = @($gruppi.Values | ForEach-Object { $_ })
Verifica "chi non ha ruolo non finisce in nessun gruppo" ($tutti -notcontains 't.viola@scuola.edu.it')

$escluso = $personale[2]
$tPersona.GetField('Incluso', $FI).SetValue($escluso, $false)
$gruppi = $tStato.GetMethod('GruppiPerRuolo', $FI).Invoke($stato, @())
Verifica "chi togli dalla tabella sparisce anche dai gruppi" ($gruppi['Docenti'].Count -eq 1)

# ---------------------------------------------------------------------------
Intestazione 'CHI PUO'' ESSERE QUESTO INDIRIZZO'
$mStessa = $tStato.GetMethod('StessaPersona', $FS)
function Stessa($nome, $ind) { return $mStessa.Invoke($null, @([string]$nome, [string]$ind)) }
Verifica "ROSSI MARIO <- mario.rossi@"      (Stessa 'ROSSI MARIO' 'mario.rossi@s.it')
Verifica "ROSSI MARIO <- m.rossi@"          (Stessa 'ROSSI MARIO' 'm.rossi@s.it')
Verifica "ROSSI MARIO <- rossi.mario@"      (Stessa 'ROSSI MARIO' 'rossi.mario@s.it')
Verifica "ROSSI MARIO <- mariorossi@"       (Stessa 'ROSSI MARIO' 'mariorossi@s.it')
Verifica "ROSSI MARIO <- rossi.m@"          (Stessa 'ROSSI MARIO' 'rossi.m@s.it')
Verifica "ROSSI ANNA NON e' m.rossi@"  (-not (Stessa 'ROSSI ANNA' 'm.rossi@s.it'))
Verifica "ROSSI MARIO NON e' m.rossini@" (-not (Stessa 'ROSSI MARIO' 'm.rossini@s.it'))
Verifica "ROSSI MARIO NON e' segreteria@" (-not (Stessa 'ROSSI MARIO' 'segreteria@s.it'))
Verifica "i cognomi composti: DE LUCA ANNA <- anna.deluca@" (Stessa 'DE LUCA ANNA' 'anna.deluca@s.it')
Verifica "e anche DE LUCA ANNA <- a.de.luca@"              (Stessa 'DE LUCA ANNA' 'a.de.luca@s.it')
Verifica "gli accenti non contano: NICOLO' <- nicolo.b@"   (Stessa "NICOLO' BIANCHI" 'nicolo.b@s.it')
Verifica "le cifre in coda non contano: m.rossi2@"         (Stessa 'ROSSI MARIO' 'm.rossi2@s.it')

# ---------------------------------------------------------------------------
Intestazione 'IL CONFRONTO CON GLI INDIRIZZI VERI DELLA CASELLA'
$stato2 = NuovoStato
$tStato.GetField('Dominio', $FI).SetValue($stato2, 'scuola.edu.it')
$elenco = $tStato.GetField('Personale', $FI).GetValue($stato2)
function Aggiungi($lista, $nome, $ruolo, $mail) {
    $x = [Activator]::CreateInstance($tPersona)
    $tPersona.GetField('Nome', $FI).SetValue($x, $nome)
    $tPersona.GetField('Ruolo', $FI).SetValue($x, $ruolo)
    $tPersona.GetField('Email', $FI).SetValue($x, $mail)
    $lista.Add($x)
    return $x
}
# l'elenco di ClasseViva, con gli indirizzi costruiti con lo schema sbagliato
$pRossi   = Aggiungi $elenco 'ROSSI MARIO'   'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO' 'm.rossi@scuola.edu.it'
$pBianchi = Aggiungi $elenco 'BIANCHI ANNA'  'ASSISTENTE AMMINISTRATIVO'                   'a.bianchi@scuola.edu.it'
$pVerdi   = Aggiungi $elenco 'VERDI GIUSEPPE' 'COLLABORATORE SCOLASTICO'                   'g.verdi@scuola.edu.it'
$pNeri    = Aggiungi $elenco 'NERI LUCIA'    'DOCENTE DI RELIGIONE'                        ''

# quello che la casella ha visto davvero
$tLista = [type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tPersona)
$veri = [Activator]::CreateInstance($tLista)
Aggiungi $veri 'Mario Rossi'    '' 'mario.rossi@scuola.edu.it'    | Out-Null
Aggiungi $veri 'Anna Bianchi'   '' 'a.bianchi@scuola.edu.it'      | Out-Null
Aggiungi $veri 'Lucia Neri'     '' 'lucia.neri@scuola.edu.it'     | Out-Null
Aggiungi $veri 'Segreteria'     '' 'segreteria@scuola.edu.it'     | Out-Null

# @(...) srotolerebbe la lista in tanti argomenti: l'array va costruito a mano
$arg = New-Object object[] 1
$arg[0] = $veri
$esito = $tStato.GetMethod('ConfrontaConLaCasella', $FI).Invoke($stato2, $arg)
$tEsito = $esito.GetType()
function Campo($o, $c) { return $o.GetType().GetField($c, $FI).GetValue($o) }

Verifica "l'indirizzo gia' giusto viene confermato" ((Campo $esito 'Confermati') -eq 1)
Verifica "quello sbagliato viene corretto"          ((Campo $esito 'Corretti') -eq 2)
Verifica "m.rossi diventa mario.rossi" (
    ($tPersona.GetField('Email', $FI).GetValue($pRossi)) -eq 'mario.rossi@scuola.edu.it')
Verifica "chi non aveva indirizzo lo prende"  (
    ($tPersona.GetField('Email', $FI).GetValue($pNeri)) -eq 'lucia.neri@scuola.edu.it')
Verifica "chi e' confermato resta com'era" (
    ($tPersona.GetField('Email', $FI).GetValue($pBianchi)) -eq 'a.bianchi@scuola.edu.it')
Verifica "chi non si e' mai visto viene segnalato"  ((Campo $esito 'NonTrovati') -eq 1)
Verifica "e il suo indirizzo non viene toccato" (
    ($tPersona.GetField('Email', $FI).GetValue($pVerdi)) -eq 'g.verdi@scuola.edu.it')
Verifica "chi e' stato visto risulta verificato" (
    ($tPersona.GetField('Verificato', $FI).GetValue($pRossi)) -eq $true -and
    ($tPersona.GetField('Verificato', $FI).GetValue($pVerdi)) -eq $false)
Verifica "il resoconto elenca i cambiamenti" ((Campo $esito 'Cambiati').Count -eq 2)
Verifica "e quelli da guardare a mano"       ((Campo $esito 'Mancanti').Count -eq 1)
Verifica "la segreteria non viene attaccata a nessuno" (
    @($elenco | ForEach-Object { $tPersona.GetField('Email', $FI).GetValue($_) }) -notcontains 'segreteria@scuola.edu.it')

# due omonimi: meglio non scegliere a caso
$stato3 = NuovoStato
$elenco3 = $tStato.GetField('Personale', $FI).GetValue($stato3)
$amb = Aggiungi $elenco3 'ROSSI MARIO' 'DOCENTE' ''
$veri3 = [Activator]::CreateInstance($tLista)
Aggiungi $veri3 '' '' 'm.rossi@scuola.edu.it'     | Out-Null
Aggiungi $veri3 '' '' 'mario.rossi@scuola.edu.it' | Out-Null
$arg3 = New-Object object[] 1
$arg3[0] = $veri3
$esito3 = $tStato.GetMethod('ConfrontaConLaCasella', $FI).Invoke($stato3, $arg3)
Verifica "due indirizzi possibili: non sceglie" ((Campo $esito3 'Ambigui') -eq 1)
Verifica "e lascia la casella vuota com'era" (
    ($tPersona.GetField('Email', $FI).GetValue($amb)) -eq '')

Remove-Item -Recurse -Force $temporanea

# ---------------------------------------------------------------------------
Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
