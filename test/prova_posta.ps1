<#
    prova_posta.ps1 - lo strumento Posta, dalla parte di Campanella

        .\test\prova_posta.ps1

    Carica dist\Campanella.exe come assembly e chiama il generatore vero
    (GeneratorePosta, in src\GeneratorePosta.cs) con uno Stato inventato:
    scrive Configurazione.gs in una cartella temporanea e ci fa girare il
    banco test\mock_apps_script.js, che usa lo script vero della posta. Cosi'
    una chiave rinominata da una parte sola si vede subito. Controlla anche
    che la configurazione generata sia quella d'esempio che il banco usa da
    solo, e che nomi strani non possano uscire da stringhe e commenti;
    l'impronta della configurazione e le regole che si doppiano con le
    sottoetichette dei ruoli, e che l'anteprima dello script veda le stesse.

    Nessun dato vero: lo Stato non passa dal costruttore (che cercherebbe il
    Drive del PC), Drive e cartella dei dati sono una cartella temporanea, e
    persone e indirizzi sono inventati.
#>
$ErrorActionPreference = 'Stop'
$qui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$radice = Split-Path -Parent $qui
$exe    = Join-Path $radice 'dist\Campanella.exe'
if (-not (Test-Path $exe)) { throw "Manca $exe`: compila prima con .\build.ps1" }
# un exe piu' vecchio dei sorgenti proverebbe il codice di prima
foreach ($f in @('src\GeneratorePosta.cs', 'src\PaginaPosta.cs', 'src\Dialoghi.cs', 'src\Guscio.cs',
                 'src\risorse\Organizzazione_Gmail.gs', 'src\risorse\estensione_personale\manifest.json')) {
    if ((Get-Item (Join-Path $radice $f)).LastWriteTimeUtc -gt (Get-Item $exe).LastWriteTimeUtc) {
        throw "$f e' piu' recente di dist\Campanella.exe: ricompila con .\build.ps1"
    }
}
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)
$FS  = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$FI  = [System.Reflection.BindingFlags]'Public,NonPublic,Instance'
$tStato    = $asm.GetType('Campanella.Stato')
$tPersona  = $asm.GetType('Campanella.Persona')
$tGen      = $asm.GetType('Campanella.GeneratorePosta')

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
function Scrivi($percorso, $testo) {
    [System.IO.File]::WriteAllText($percorso, $testo, (New-Object System.Text.UTF8Encoding($false)))
}

$temporanea = Join-Path ([System.IO.Path]::GetTempPath()) ('campanella-posta-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporanea | Out-Null

# ---------------------------------------------------------------------------
#  LO STATO INVENTATO
#  GetUninitializedObject salta il costruttore: "new Stato()" cerca il Drive
#  vero del PC. Qui ogni campo che il generatore legge si imposta a mano.
# ---------------------------------------------------------------------------
function Imposta($s, $campo, $valore) { $tStato.GetField($campo, $FI).SetValue($s, $valore) }
# la virgola impedisce a PowerShell di srotolare le liste (una vuota diventerebbe $null)
function Leggi($s, $campo) { return ,($tStato.GetField($campo, $FI).GetValue($s)) }
$tListaPersone = [type]::GetType('System.Collections.Generic.List`1').MakeGenericType($tPersona)

function NuovoStato {
    $s = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject($tStato)
    Imposta $s 'Drive' $temporanea
    Imposta $s 'CartellaDati' $temporanea
    Imposta $s 'DatiNelDrive' $false
    Imposta $s 'Dominio' 'scuola-esempio.edu.it'
    Imposta $s 'Prefisso' 'Scuola'
    Imposta $s 'EtichettaPerRuolo' $true
    Imposta $s 'Dirigenza' 'preside@scuola-esempio.edu.it'
    Imposta $s 'Segreteria' 'segreteria@scuola-esempio.edu.it'
    Imposta $s 'Registro' '@spaggiari.eu'
    $tStato.GetField('Personale', $FI).SetValue($s, [Activator]::CreateInstance($tListaPersone))
    $tStato.GetField('Regole', $FI).SetValue($s, $tStato.GetMethod('RegoleDiDefault', $FS).Invoke($null, @()))
    Imposta $s 'Prova' $true
    Imposta $s 'Report' $true
    Imposta $s 'EscludiInviata' $true
    Imposta $s 'Periodo' ([int]0)
    Imposta $s 'Ore' ([int]1)
    return $s
}
function AggiungiPersona($s, $nome, $ruolo, $mail, [bool]$incluso) {
    $p = [Activator]::CreateInstance($tPersona)
    $tPersona.GetField('Nome', $FI).SetValue($p, $nome)
    $tPersona.GetField('Ruolo', $FI).SetValue($p, $ruolo)
    $tPersona.GetField('Email', $FI).SetValue($p, $mail)
    $tPersona.GetField('Incluso', $FI).SetValue($p, $incluso)
    (Leggi $s 'Personale').Add($p)
}
function Genera($s, [bool]$prova) {
    $m = $tGen.GetMethod('Configurazione', $FS)
    return $m.Invoke($null, @($s, $prova, [datetime]'2026-09-23T10:00:00'))
}

# lettore della configurazione generata, fuori da qualunque servizio Google
$leggiJs = Join-Path $temporanea 'leggi_configurazione.js'
Scrivi $leggiJs @'
const vm = require('vm'), fs = require('fs');
const contesto = {};
vm.runInNewContext(fs.readFileSync(process.argv[2], 'utf8'), contesto);
const globali = Object.keys(contesto).filter(k => k !== 'CONFIG');
process.stdout.write(JSON.stringify({ CONFIG: contesto.CONFIG, altri: globali }));
'@
# confronto fra due configurazioni: tutto tranne le note e l'impronta (che
# nell'esempio e' inventata), a chiavi ordinate
$confrontaJs = Join-Path $temporanea 'confronta.js'
Scrivi $confrontaJs @'
const vm = require('vm'), fs = require('fs');
function carica(f) { const c = {}; vm.runInNewContext(fs.readFileSync(f, 'utf8'), c); return c.CONFIG; }
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => k !== 'nota' && k !== 'impronta').sort()
      .map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
const a = canonico(carica(process.argv[2])), b = canonico(carica(process.argv[3]));
process.stdout.write(a === b ? 'uguali' : 'diversi\n' + a + '\n' + b);
'@
# PASSO_1_anteprima del motore vero su una configurazione, con una casella
# finta e vuota: basta a leggere impronta e doppioni, che vengono da CONFIG
$anteprimaJs = Join-Path $temporanea 'anteprima.js'
Scrivi $anteprimaJs @'
const vm = require('vm'), fs = require('fs');
const contesto = vm.createContext({
  GmailApp: { search: () => [], getUserLabelByName: () => null },
  PropertiesService: { getUserProperties: () => ({ getProperty: () => null }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'docente@scuola.example' }) },
  Logger: { log: () => {} }
});
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), contesto, { filename: 'Configurazione.gs' });
vm.runInContext(fs.readFileSync(process.argv[3], 'utf8'), contesto, { filename: 'Organizzazione_Gmail.gs' });
process.stdout.write(contesto.PASSO_1_anteprima());
'@
$motore = Join-Path $radice 'src\risorse\Organizzazione_Gmail.gs'
function LeggiConfigurazione($file) { return ((& node $leggiJs $file) | ConvertFrom-Json) }

try {
    # -----------------------------------------------------------------------
    Intestazione 'LA CONFIGURAZIONE GENERATA, NEL BANCO DELLO SCRIPT VERO'
    $s = NuovoStato
    AggiungiPersona $s 'ROSSI MARIO' 'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO' 'mario.rossi@scuola-esempio.edu.it' $true
    AggiungiPersona $s 'DE LUCA ANNA' 'ASSISTENTE AMMINISTRATIVO' 'anna.deluca@scuola-esempio.edu.it' $true
    AggiungiPersona $s 'ALUNNO ESCLUSO' 'Studente' 'studente.escluso@scuola-esempio.edu.it' $false
    $testo = Genera $s $true
    $file = Join-Path $temporanea 'Configurazione.gs'
    Scrivi $file $testo

    Verifica "l'intestazione dice la versione di Campanella" ($testo -match 'dall''applicazione Campanella \d+\.\d+\.\d+\.')
    Verifica "chi non ha la spunta non c'e'" (-not $testo.Contains('studente.escluso@'))
    $letta = LeggiConfigurazione $file
    Verifica "si carica e definisce solo CONFIG" ($null -ne $letta.CONFIG -and $letta.altri.Count -eq 0)
    Verifica "parte in modalita' prova" ($letta.CONFIG.provaSenzaModifiche -eq $true)

    $esito = (& node $confrontaJs $file (Join-Path $qui 'Configurazione_esempio.gs')) -join "`n"
    Verifica "e' la stessa configurazione d'esempio su cui gira il banco" ($esito -eq 'uguali')
    if ($esito -ne 'uguali') { Write-Host $esito }

    $banco = & node (Join-Path $qui 'mock_apps_script.js') $file 2>&1
    $esitoBanco = $LASTEXITCODE
    if ($esitoBanco -ne 0) { $banco | Out-Host }
    Verifica "il banco dello script vero passa con la configurazione generata ($(@($banco -match '^\s+OK ').Count) controlli)" ($esitoBanco -eq 0)

    # -----------------------------------------------------------------------
    Intestazione 'LE OPZIONI ARRIVANO NELLE CHIAVI GIUSTE'
    Imposta $s 'Periodo' ([int]2)
    Imposta $s 'Ore' ([int]3)
    Imposta $s 'Report' $false
    Imposta $s 'EscludiInviata' $false
    $file2 = Join-Path $temporanea 'Configurazione_vera.gs'
    Scrivi $file2 (Genera $s $false)
    $c = (LeggiConfigurazione $file2).CONFIG
    Verifica "senza prova: provaSenzaModifiche false" ($c.provaSenzaModifiche -eq $false)
    Verifica "ultimi 24 mesi" ($c.soloUltimiMesi -eq 24)
    Verifica "ogni 3 ore" ($c.ogniQuanteOre -eq 3)
    Verifica "niente riepilogo, e anche la posta inviata" ($c.inviaReport -eq $false -and $c.escludiPostaInviata -eq $false)
    Verifica "i gruppi per ruolo" ($c.gruppi.Docenti[0] -eq 'mario.rossi@scuola-esempio.edu.it' -and
                                   $c.gruppi.Amministrativi[0] -eq 'anna.deluca@scuola-esempio.edu.it')
    Verifica "0 = tutta la posta"   ((& { Imposta $s 'Periodo' ([int]0); ((Genera $s $true) -match 'soloUltimiMesi:\s+0,') }))

    # -----------------------------------------------------------------------
    Intestazione 'SENZA ELENCO DEL PERSONALE'
    $vuoto = NuovoStato
    $file3 = Join-Path $temporanea 'Configurazione_vuota.gs'
    Scrivi $file3 (Genera $vuoto $true)
    $c = (LeggiConfigurazione $file3).CONFIG
    $colleghi = @($c.regole | Where-Object { $_.etichetta -eq 'Colleghi' })[0]
    Verifica "personale vuoto" ($c.personale.Count -eq 0)
    Verifica "e la regola Colleghi spenta, non su tutta la casella" ($colleghi.attiva -eq $false)
    Verifica "niente sottoetichette dei ruoli" (@($c.regole | Where-Object { $_.etichetta -like 'Colleghi/*' }).Count -eq 0)

    # -----------------------------------------------------------------------
    Intestazione 'L''IMPRONTA DELLA CONFIGURAZIONE'
    # PASSO_1_anteprima la stampa e il passo 5 mostra quella di adesso: una
    # configurazione incollata prima di spegnere una regola si riconosce
    $mImpronta = $tGen.GetMethod('Impronta', $FS)
    Verifica "il generatore calcola l'impronta" ($null -ne $mImpronta)
    if ($null -ne $mImpronta) {
        function Impronta($stato) { return [string]$mImpronta.Invoke($null, @($stato)) }
        $imp = Impronta $s
        Verifica "otto cifre esadecimali ($imp)" ($imp -cmatch '^[0-9A-F]{8}$')
        $riga = 'impronta: "' + $imp + '",'
        Verifica "la configurazione la scrive, con e senza modalita' prova" (
            (Genera $s $true).Contains($riga) -and (Genera $s $false).Contains($riga))
        $altroGiorno = $tGen.GetMethod('Configurazione', $FS).Invoke($null, @($s, $true, [datetime]'2027-01-15T08:30:00'))
        Verifica "la data non conta" ($altroGiorno.Contains($riga))
        Verifica "e l'esempio del banco ha la stessa riga, con un'impronta inventata" (
            (Get-Content -Raw (Join-Path $qui 'Configurazione_esempio.gs')) -match '(?m)^  impronta: "[0-9A-F]{8}",')
        $regoleS = Leggi $s 'Regole'
        $regoleS[2].Attiva = $false
        $spenta = Impronta $s
        Verifica "una regola spenta la cambia ($spenta)" ($spenta -cmatch '^[0-9A-F]{8}$' -and $spenta -ne $imp)
        $regoleS[2].Attiva = $true
        Verifica "riaccesa torna quella di prima" ((Impronta $s) -eq $imp)
        Imposta $s 'Dirigenza' 'vicepreside@scuola-esempio.edu.it'
        Verifica "anche un indirizzo cambiato" ((Impronta $s) -ne $imp)
        Imposta $s 'Dirigenza' 'preside@scuola-esempio.edu.it'
    }

    # -----------------------------------------------------------------------
    Intestazione 'LA DIRIGENZA DEL PASSO 2 E LA SOTTOETICHETTA Colleghi/Dirigenza'
    # Al passo 4, con le sottoetichette dei ruoli: una regola accesa con i
    # mittenti di un ruolo mette la sua etichetta agli stessi messaggi
    $d = NuovoStato
    Imposta $d 'Dominio' 'scuola.example'
    Imposta $d 'Prefisso' ''
    Imposta $d 'Dirigenza' 'Preside@scuola.example'
    Imposta $d 'Segreteria' 'segreteria@scuola.example'
    AggiungiPersona $d 'GRIGI SARA' 'DIRIGENTE SCOLASTICO' 'preside@scuola.example' $true
    AggiungiPersona $d 'BIANCHI ANNA' 'DOCENTE LAUREATO SCUOLA SECONDARIA II GRADO' 'anna.bianchi@scuola.example' $true
    AggiungiPersona $d 'VERDI CARLO' 'ASSISTENTE AMMINISTRATIVO' 'carlo.verdi@scuola.example' $true
    $mDoppi = $tGen.GetMethod('DoppioniConIRuoli', $FS)
    Verifica "il generatore trova le regole doppie di una sottoetichetta" ($null -ne $mDoppi)
    if ($null -ne $mDoppi) {
        function Doppi($stato) { return ,@($mDoppi.Invoke($null, @($stato))) }
        $h = Doppi $d
        Verifica "Dirigenza del passo 2 uguale al ruolo Dirigenza: un avviso, con regola e sottoetichetta" (
            $h.Count -eq 1 -and $h[0].StartsWith('Dirigenza e Colleghi/Dirigenza: stessi mittenti, ogni messaggio prende tutte e due.') -and
            $h[0].Contains('togli la spunta a Dirigenza (la sottoetichetta per ruolo resta)'))
        if ($h.Count -gt 0) { Write-Host "          $($h[0])" }
        Imposta $d 'Prefisso' 'Scuola'
        $h = Doppi $d
        Verifica "con il gruppo i nomi sono quelli dell'elenco del passo 4" (
            $h.Count -eq 1 -and $h[0].StartsWith('Scuola/Dirigenza e Scuola/Colleghi/Dirigenza: '))
        Imposta $d 'Prefisso' ''
        Imposta $d 'EtichettaPerRuolo' $false
        Verifica "senza sottoetichette dei ruoli niente avviso" ((Doppi $d).Count -eq 0)
        Imposta $d 'EtichettaPerRuolo' $true
        $regoleD = Leggi $d 'Regole'
        $regoleD[0].Attiva = $false
        Verifica "con la regola Dirigenza spenta niente avviso" ((Doppi $d).Count -eq 0)
        $regoleD[0].Attiva = $true
        Imposta $d 'Dirigenza' "preside@scuola.example`r`nvicepreside@scuola.example"
        Verifica "con un indirizzo in piu' del ruolo non e' un doppione" ((Doppi $d).Count -eq 0)
        Imposta $d 'Dirigenza' 'preside@scuola.example'
        AggiungiPersona $d 'NERI ELENA' 'DIRIGENTE SCOLASTICO' 'reggente@scuola.example' $true
        $h = Doppi $d
        Verifica "con una parte del ruolo lo dice: tutti anche in Colleghi/Dirigenza" (
            $h.Count -eq 1 -and $h[0].StartsWith('Dirigenza e Colleghi/Dirigenza: i mittenti di Dirigenza sono tutti anche in Colleghi/Dirigenza'))
        $soloPreside = NuovoStato
        Imposta $soloPreside 'Dominio' 'scuola.example'
        Imposta $soloPreside 'Dirigenza' ''
        Imposta $soloPreside 'Segreteria' 'segreteria@scuola.example'
        AggiungiPersona $soloPreside 'GRIGI SARA' 'DIRIGENTE SCOLASTICO' 'preside@scuola.example' $true
        Verifica "la regola Colleghi, madre delle sottoetichette, non conta mai" ((Doppi $soloPreside).Count -eq 0)
    }

    # -----------------------------------------------------------------------
    Intestazione 'L''ANTEPRIMA DELLO SCRIPT VEDE LE STESSE COSE'
    # la configurazione generata, nel motore vero: la stessa impronta del
    # passo 5, e lo stesso doppione che il passo 4 segnala
    $e = NuovoStato
    Imposta $e 'Dominio' 'scuola.example'
    Imposta $e 'Prefisso' ''
    Imposta $e 'Dirigenza' 'Preside@scuola.example'
    Imposta $e 'Segreteria' 'segreteria@scuola.example'
    AggiungiPersona $e 'GRIGI SARA' 'DIRIGENTE SCOLASTICO' 'preside@scuola.example' $true
    AggiungiPersona $e 'BIANCHI ANNA' 'DOCENTE' 'anna.bianchi@scuola.example' $true
    $fileE = Join-Path $temporanea 'Configurazione_doppioni.gs'
    Scrivi $fileE (Genera $e $true)
    $uscita = (& node $anteprimaJs $fileE $motore) -join "`n"
    $piatta = $uscita -replace '\s+', ' '
    $impE = if ($null -ne $mImpronta) { [string]$mImpronta.Invoke($null, @($e)) } else { '(nessuna)' }
    Verifica "PASSO_1_anteprima stampa l'impronta che il passo 5 mostra ($impE)" (
        $uscita.Contains("`nConfigurazione: impronta $impE`n"))
    Verifica "e trova lo stesso doppione" (
        $piatta.Contains('- Dirigenza e Colleghi/Dirigenza: stessi mittenti, ogni messaggio prende tutte e due.'))

    # -----------------------------------------------------------------------
    Intestazione 'NOMI STRANI: NIENTE ESCE DA STRINGHE E COMMENTI'
    $strano = NuovoStato
    $a_capo = [string][char]0x2028
    AggiungiPersona $strano ('ROSSI */ MARIO' + $a_capo + 'var INIETTATO = 1;') 'DOCENTE' 'mario.rossi@scuola-esempio.edu.it' $true
    AggiungiPersona $strano ("BIANCHI`nvar INIETTATO2 = 2;") "ASSISTENTE`r`nAMMINISTRATIVO" 'anna.bianchi@scuola-esempio.edu.it' $true
    $regole = Leggi $strano 'Regole'
    $regole[2].Etichetta = 'Circolari "urgenti" \ tutte'
    $regole[2].Descrizione = "prima riga`n*/ var INIETTATO3 = 3; /*"
    $file4 = Join-Path $temporanea 'Configurazione_strana.gs'
    Scrivi $file4 (Genera $strano $true)
    $letta = LeggiConfigurazione $file4
    Verifica "si carica lo stesso, e definisce solo CONFIG" ($null -ne $letta.CONFIG -and $letta.altri.Count -eq 0)
    Verifica "l'etichetta con virgolette e barre arriva identica" (
        @($letta.CONFIG.regole | Where-Object { $_.etichetta -eq 'Circolari "urgenti" \ tutte' }).Count -eq 1)
    Verifica "i due indirizzi ci sono" ($letta.CONFIG.personale.Count -eq 2)

    # -----------------------------------------------------------------------
    Intestazione 'LE PAROLE DELL''OGGETTO DI UNA REGOLA'
    $mSpezza = $asm.GetType('Campanella.FormRegola').GetMethod('Spezza', $FS)
    $parole = $mSpezza.Invoke($null, @([string]"(urgente)`r`nverbale`r`n`r`n(urgente)`r`n  consiglio di classe  "))
    Verifica "una parola fra parentesi resta, una volta sola" (
        $parole.Count -eq 3 -and $parole[0] -eq '(urgente)' -and $parole[1] -eq 'verbale' -and
        $parole[2] -eq 'consiglio di classe')
    $avviso = $mSpezza.Invoke($null, @([string]'(i mittenti di questa regola si scrivono nella pagina "La tua scuola")'))
    Verifica "l'avviso al posto dei mittenti non diventa un mittente" ($avviso.Count -eq 0)

    # -----------------------------------------------------------------------
    Intestazione 'GLI INDIRIZZI DEI COLLEGHI: NIENTE CRONOLOGIE'
    # gli appunti veri non si toccano: si guarda l'oggetto che Campanella ci metterebbe
    $dati = $asm.GetType('Campanella.Guscio').GetMethod('PerGliAppunti', $FS).Invoke($null, @([string]'a@scuola-esempio.edu.it, b@scuola-esempio.edu.it'))
    $formati = $dati.GetFormats()
    Verifica "il testo c'e'" ($dati.GetData([System.Windows.Forms.DataFormats]::UnicodeText) -eq 'a@scuola-esempio.edu.it, b@scuola-esempio.edu.it')
    Verifica "fuori dai programmi che guardano gli appunti" ($formati -contains 'ExcludeClipboardContentFromMonitorProcessing')
    foreach ($f in @('CanIncludeInClipboardHistory', 'CanUploadToCloudClipboard')) {
        $v = $dati.GetData($f)
        $byte = if ($v -is [System.IO.MemoryStream]) { $v.ToArray() } else { $null }
        Verifica "$f = 0 (un DWORD a zero)" ($null -ne $byte -and $byte.Length -eq 4 -and ($byte | Where-Object { $_ -ne 0 }).Count -eq 0)
    }
    # e come lo vedrebbe Windows: la stessa strada (IDataObject, HGLOBAL) che
    # usa il sistema quando Campanella lascia il testo negli appunti
    Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class ComeLoVedeWindows
{
    [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
    [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
    [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr h);
    [DllImport("ole32.dll")] static extern void ReleaseStgMedium(ref STGMEDIUM m);

    // i byte che Windows riceve per quel formato quando rende gli appunti
    public static byte[] Byte(object dati, string formato)
    {
        IDataObject com = (IDataObject)dati;
        FORMATETC fe = new FORMATETC();
        fe.cfFormat = unchecked((short)(ushort)System.Windows.Forms.DataFormats.GetFormat(formato).Id);
        fe.dwAspect = DVASPECT.DVASPECT_CONTENT;
        fe.lindex = -1;
        fe.tymed = TYMED.TYMED_HGLOBAL;
        STGMEDIUM m;
        com.GetData(ref fe, out m);
        if (m.tymed != TYMED.TYMED_HGLOBAL || m.unionmember == IntPtr.Zero) return null;
        try
        {
            IntPtr p = GlobalLock(m.unionmember);
            int n = (int)GlobalSize(m.unionmember).ToUInt64();
            byte[] b = new byte[n];
            Marshal.Copy(p, b, 0, n);
            GlobalUnlock(m.unionmember);
            return b;
        }
        finally { ReleaseStgMedium(ref m); }
    }
}
'@
    foreach ($f in @('ExcludeClipboardContentFromMonitorProcessing', 'CanIncludeInClipboardHistory', 'CanUploadToCloudClipboard')) {
        $b = [ComeLoVedeWindows]::Byte($dati, $f)
        Verifica "per Windows $f e' un DWORD che vale 0" (
            $null -ne $b -and $b.Length -ge 4 -and [BitConverter]::ToInt32($b, 0) -eq 0)
    }
    $url = $tGen.GetMethod('NuovoMessaggioGmail', $FS).Invoke($null, @([string]'io@scuola-esempio.edu.it'))
    Verifica "il collegamento a Gmail porta solo il tuo account" (
        $url -eq 'https://mail.google.com/mail/?view=cm&fs=1&authuser=io%40scuola-esempio.edu.it')
    $senza = $tGen.GetMethod('NuovoMessaggioGmail', $FS).Invoke($null, @([string]''))
    Verifica "e senza account nemmeno quello" ($senza -eq 'https://mail.google.com/mail/?view=cm&fs=1')
    $pagina = Get-Content -Raw (Join-Path $radice 'src\PaginaPosta.cs')
    Verifica "nessun indirizzo nei collegamenti: niente bcc=, cc= o to= nel codice della pagina" (
        -not ($pagina -match '[&?](bcc|cc|to)='))
    Verifica "e niente Clipboard.SetText, che finirebbe nella cronologia" (-not $pagina.Contains('Clipboard.SetText'))

    # -----------------------------------------------------------------------
    Intestazione 'L''ESTENSIONE PORTA LA VERSIONE DI CAMPANELLA'
    $versione = $asm.GetType('Campanella.Aggiornamenti').GetField('VersioneCampanella', $FS).GetValue($null)
    $risorsa = $asm.GetType('Campanella.Guscio').GetMethod('LeggiRisorsa', $FS).Invoke($null, @([string]'estensione_manifest.json'))
    $scritto = $tGen.GetMethod('ManifestEstensione', $FS).Invoke($null, @([string]$risorsa, [string]$versione)) | ConvertFrom-Json
    $originale = $risorsa | ConvertFrom-Json
    Verifica "il manifest scritto ha la versione dell'app ($versione)" ($scritto.version -eq $versione)
    Verifica "e per Chrome e' una versione valida" ($scritto.version -match '^\d{1,5}(\.\d{1,5}){0,3}$')
    Verifica "il resto non cambia" ($scritto.name -eq $originale.name -and
        (@($scritto.permissions) -join ',') -eq (@($originale.permissions) -join ','))
    Verifica "ed e' quello che scrive il pulsante Estensione..." (
        $pagina.Contains('GeneratorePosta.ManifestEstensione(testo, Aggiornamenti.VersioneCampanella)'))

    # -----------------------------------------------------------------------
    Intestazione 'UNA SOLA FUNZIONE DI ESCAPE PER JAVASCRIPT'
    $pagina = Get-Content -Raw (Join-Path $radice 'src\PaginaPosta.cs')
    $generatore = Get-Content -Raw (Join-Path $radice 'src\GeneratorePosta.cs')
    Verifica "PaginaPosta non ha piu' una sua copia di Js()" (-not ($pagina -match 'static\s+string\s+Js\s*\('))
    Verifica "il generatore usa quella di AnalisiOrario" (
        $generatore.Contains('AnalisiOrario.Js(') -and -not ($generatore -match 'static\s+string\s+Js\s*\('))
}
finally {
    Remove-Item -Recurse -Force $temporanea
}

# ---------------------------------------------------------------------------
Write-Host ""
if ($script:fallimenti -eq 0) { Write-Host "Tutte le prove superate." -ForegroundColor Green }
else { Write-Host "PROVE FALLITE: $script:fallimenti" -ForegroundColor Red; exit 1 }
