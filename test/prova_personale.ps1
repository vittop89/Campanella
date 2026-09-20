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

# ---------------------------------------------------------------------------
Intestazione 'DALL"ELENCO AI GRUPPI CHE FINISCONO IN GMAIL'
$stato = [Activator]::CreateInstance($tStato)
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
Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
