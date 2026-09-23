<#
    firma.ps1 - firma digitalmente l'eseguibile con un certificato locale

    Uso:
        .\strumenti\firma.ps1 -File '.\dist\Campanella.exe'
        .\strumenti\firma.ps1 -File '.\dist\Campanella.exe' -SenzaAttendibilita

    COSA FA
      Crea (una volta sola) un certificato di firma del codice intestato a
      "Campanella" (il valore di -Nome) e lo usa per firmare l'eseguibile,
      con una marca temporale se un server di marche risponde.

    COSA INSTALLA SUL COMPUTER, E DOVE RESTA
      - Il certificato con la sua chiave privata va in Cert:\CurrentUser\My
        (certificati personali di questo utente). La chiave e' creata NON
        esportabile: serve a firmare da questo profilo, ma non si copia
        altrove. I certificati creati da versioni precedenti di questo
        script hanno la chiave esportabile: per sostituirlo, cancellalo da
        certmgr.msc (Personale > Certificati) e rilancia.
      - Salvo -SenzaAttendibilita, una copia del solo certificato pubblico
        va anche in Cert:\CurrentUser\Root (Autorita' di certificazione
        radice attendibili) e in Cert:\CurrentUser\TrustedPublisher (Autori
        attendibili). Da quel momento, per questo utente, Windows considera
        attendibile QUALUNQUE programma firmato con quel certificato. Prima
        di aggiungerlo a Root Windows chiede conferma con una sua finestra.
      - Tutto resta installato finche' non lo togli tu: da certmgr.msc,
        oppure con Remove-Item Cert:\CurrentUser\<negozio>\<impronta> per
        ciascuno dei tre negozi.

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
    # non aggiunge il certificato a Root e TrustedPublisher (vedi sopra): la
    # firma si mette lo stesso, semplicemente questo computer non la
    # riconosce come attendibile
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
                -KeyExportPolicy NonExportable `
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

# la firma e' nostra se il file porta il nostro certificato: lo stato resta
# diverso da Valid quando il certificato non e' fra quelli attendibili
function FirmatoDaNoi($e) {
    return ($e -and $e.SignerCertificate -and $e.SignerCertificate.Thumbprint -eq $cert.Thumbprint)
}

$esito = $null
$conMarca = $false
foreach ($m in $marcatori) {
    try {
        $esito = Set-AuthenticodeSignature -FilePath $File -Certificate $cert `
                     -HashAlgorithm SHA256 -TimestampServer $m -ErrorAction Stop
        # la marca c'e' anche quando il certificato non e' attendibile (stato
        # UnknownError): basta quella, rifirmare la toglierebbe
        if ((FirmatoDaNoi $esito) -and $esito.TimeStamperCertificate) { $conMarca = $true; break }
    } catch {
        Write-Host "  marca temporale non raggiungibile: $m" -ForegroundColor DarkGray
    }
}

# senza internet firmo comunque, ma senza marca temporale
if (-not $conMarca) {
    Write-Host "  nessun server di marche temporali ha risposto: firmo senza marca" -ForegroundColor Yellow
    $esito = Set-AuthenticodeSignature -FilePath $File -Certificate $cert -HashAlgorithm SHA256
}

if ($esito.Status -eq 'Valid' -and (FirmatoDaNoi $esito)) {
    Write-Host "Firmato: $File" -ForegroundColor Green
} elseif ((FirmatoDaNoi $esito) -and
          ($esito.Status -eq 'UnknownError' -or $esito.Status -eq 'NotTrusted' -or -not $attendibile)) {
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
# build.ps1 guarda il codice d'uscita: 0 solo se la firma c'e'
exit 0
