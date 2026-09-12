<#
    genera_dati_prova.ps1 - crea test\DatiOrari_prova.gs partendo dal file
    orario vero (cognomi veri: il file resta fuori dal repository), con la
    parte del calendario per il primo docente del tabellone.

        .\test\genera_dati_prova.ps1 ; node test\mock_orari.js test\DatiOrari_prova.gs
#>
param(
    # di partenza il tabellone inventato; passa il tuo .xlsx per generare i dati veri
    [string]$File = (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'tabellone_esempio.csv')
)

$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = Join-Path $radice 'dist\Campanella.exe'
Add-Type -AssemblyName System.Windows.Forms
$asm = [System.Reflection.Assembly]::LoadFrom($exe)

$FS = [System.Reflection.BindingFlags]'Public,NonPublic,Static'
$fogli = $asm.GetType('Campanella.Xlsx').GetMethod('Leggi', $FS).Invoke($null, @([string]$File))
$o = $asm.GetType('Campanella.AnalisiOrario').GetMethod('Analizza', $FS).Invoke($null, @($fogli[0]))

$stato = [Activator]::CreateInstance($asm.GetType('Campanella.Stato'))
$stato.OggettoOrari = 'Orario {docente}'
$stato.OggettoOrariClasse = 'Orario classe {classe}'
$stato.NotaOrari = 'Orario provvisorio: eventuali variazioni vengono comunicate per circolare.'
$stato.CalDocente = $o.Docenti()[0]
$stato.CalNome = 'Orario di prova'
$stato.CalInizio = '2026-09-14'
$stato.CalFine = '2027-06-10'
$stato.CalPrimaOra = '08:00'
$stato.CalMinutiOra = 60
$stato.CalOreInizio = '08:00, 09:00, 10:00, 11:10, 12:10, 13:10'

# PowerShell incarta gli oggetti in PSObject: la reflection vuole quelli veri
$argomenti = New-Object 'object[]' 3
$argomenti[0] = $o.PSObject.BaseObject
$argomenti[1] = $stato.PSObject.BaseObject
$argomenti[2] = $true
$gs = $asm.GetType('Campanella.AnalisiOrario').GetMethod('GeneraDatiGs', $FS).Invoke($null, $argomenti)

$out = Join-Path $radice 'test\DatiOrari_prova.gs'
[System.IO.File]::WriteAllText($out, $gs, (New-Object System.Text.UTF8Encoding($false)))
$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "Scritto $out  ($kb KB)  -  $($o.Docenti().Count) docenti, $($o.Classi().Count) classi" -ForegroundColor Green
