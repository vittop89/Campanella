<#
    firma.ps1 - firma digitalmente l'eseguibile con un certificato locale

    Uso:
        .\strumenti\firma.ps1 -File '.\dist\Organizzazione_Gmail.exe'

    COSA FA
      Crea (una volta sola) un certificato di firma del codice intestato a
      "Organizzazione Gmail", lo mette fra i certificati attendibili DI QUESTO
      UTENTE e lo usa per firmare l'eseguibile.

    COSA OTTIENI
      Su questo computer Windows smette di dire "Autore sconosciuto" e non
      blocca piu' l'avvio. Il file resta identificabile e, se qualcuno lo
      modifica, la firma salta.

    COSA NON OTTIENI
      Su un computer diverso il certificato non e' conosciuto, quindi
      SmartScreen puo' comunque avvisare la prima volta (si passa con
      "Ulteriori informazioni" -> "Esegui comunque"). Per evitarlo ovunque
      servirebbe un certificato a pagamento di una autorita' riconosciuta:
      per un uso interno alla scuola non ne vale la pena.

    Non serve essere amministratore: si lavora solo nei certificati
    dell'utente corrente.
#>
param(
    [Parameter(Mandatory = $true)][string]$File,
    [string]$Nome = 'Campanella',
    [int]$AnniValidita = 3,
    # salta l'aggiunta alle Autorita' radice, che fa comparire una finestra di
    # Windows: la firma si mette lo stesso, semplicemente non e' ancora
    # riconosciuta come attendibile
    [switch]$SenzaAttendibilita
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $File)) { throw "File non trovato: $File" }

$soggetto = "CN=$Nome"

# --- 1. cerco un certificato gia' pronto -----------------------------------
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
        Where-Object { $_.Subject -eq $soggetto -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1

# --- 2. altrimenti lo creo --------------------------------------------------
if (-not $cert) {
    Write-Host "Creo il certificato '$Nome'..." -ForegroundColor Cyan
    $cert = New-SelfSignedCertificate `
                -Type CodeSigningCert `
                -Subject $soggetto `
                -KeyUsage DigitalSignature `
                -KeyLength 2048 `
                -KeyAlgorithm RSA `
                -HashAlgorithm SHA256 `
                -CertStoreLocation Cert:\CurrentUser\My `
                -NotAfter (Get-Date).AddYears($AnniValidita)
} else {
    Write-Host "Uso il certificato gia' presente (scade il $($cert.NotAfter.ToString('dd/MM/yyyy')))." -ForegroundColor DarkGray
}

# --- 2bis. lo rendo attendibile per questo utente ---------------------------
# Senza questo passaggio la firma risulterebbe valida ma emessa da
# un'autorita' sconosciuta, e Windows continuerebbe a diffidare.
$attendibile = -not $SenzaAttendibilita
$negozi = if ($SenzaAttendibilita) { @() } else { @('Root', 'TrustedPublisher') }
foreach ($negozio in $negozi) {
    $gia = Get-ChildItem "Cert:\CurrentUser\$negozio" |
           Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
    if ($gia) { continue }
    try {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($negozio, 'CurrentUser')
        $store.Open('ReadWrite')
        # l'array di byte va passato come argomento singolo, altrimenti PowerShell
        # lo srotola in centinaia di argomenti
        $pubblico = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([byte[]]$cert.RawData)
        $store.Add($pubblico)
        $store.Close()
        Write-Host "  aggiunto a CurrentUser\$negozio" -ForegroundColor DarkGray
    } catch {
        # aggiungere alle Autorita' radice fa comparire una finestra di Windows:
        # se la si rifiuta la firma si mette lo stesso, semplicemente non e'
        # ancora riconosciuta come attendibile su questo computer
        $attendibile = $false
        Write-Host "  non aggiunto a CurrentUser\$negozio ($($_.Exception.Message.Trim()))" -ForegroundColor Yellow
    }
}

# --- 3. firmo ---------------------------------------------------------------
$marcatori = @(
    'http://timestamp.digicert.com',
    'http://timestamp.sectigo.com',
    'http://timestamp.globalsign.com/tsa/r6advanced1'
)

$esito = $null
foreach ($m in $marcatori) {
    try {
        $esito = Set-AuthenticodeSignature -FilePath $File -Certificate $cert `
                     -HashAlgorithm SHA256 -TimestampServer $m -ErrorAction Stop
        if ($esito.Status -eq 'Valid') { break }
    } catch {
        Write-Host "  marca temporale non raggiungibile: $m" -ForegroundColor DarkGray
    }
}

# senza internet firmo comunque, ma senza marca temporale
if (-not $esito -or $esito.Status -ne 'Valid') {
    $esito = Set-AuthenticodeSignature -FilePath $File -Certificate $cert -HashAlgorithm SHA256
}

if ($esito.Status -eq 'Valid') {
    Write-Host "Firmato: $File" -ForegroundColor Green
} elseif ($esito.Status -eq 'UnknownError' -or $esito.Status -eq 'NotTrusted' -or -not $attendibile) {
    Write-Host "Firmato: $File" -ForegroundColor Green
    Write-Host "Il certificato non e' fra quelli attendibili di questo utente, quindi" -ForegroundColor Yellow
    Write-Host "Windows continuera' a mostrare 'Autore sconosciuto'. Per accettarlo:" -ForegroundColor Yellow
    Write-Host "  tasto destro sull'exe -> Proprieta' -> Firme digitali -> Dettagli" -ForegroundColor Yellow
    Write-Host "  -> Visualizza certificato -> Installa certificato -> Utente corrente" -ForegroundColor Yellow
    Write-Host "  -> Autorita' di certificazione radice attendibili." -ForegroundColor Yellow
} else {
    Write-Warning "Firma non riuscita: $($esito.Status) - $($esito.StatusMessage)"
    exit 1
}
