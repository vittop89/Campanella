; ===========================================================================
;  Campanella.iss - installer con Inno Setup 6 (https://jrsoftware.org/isinfo.php)
;
;  Per-utente, senza diritti di amministratore, italiano e inglese con scelta
;  all'avvio. Le condizioni d'uso vengono mostrate nella lingua scelta e vanno
;  accettate; il consenso viene registrato in campanella.json cosi' il
;  programma non lo richiede al primo avvio.
;
;  Si compila dopo  .\build.ps1 -SenzaInstaller  con:
;      "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\Campanella.iss
;
;  Firma: non viene fatta qui. Nel flusso di rilascio (.github\workflows\
;  release.yml) Campanella.exe viene firmato da SignPath PRIMA di comporre
;  l'installer, e l'installer viene firmato DOPO. In locale si puo' usare
;  strumenti\firma.ps1 sul file prodotto.
;
;  rizzo-pii non viene scaricato dall'installer: si installa da Campanella >
;  Impostazioni, che chiede a GitHub l'ultima versione.
; ===========================================================================

#define MyAppName        "Campanella"
#define MyAppVersion     "1.4.6"
#define MyAppPublisher   "Vittorio Pantaleo"
#define MyAppURL         "https://github.com/vittop89/Campanella"
#define MyAppExeName     "Campanella.exe"
; deve coincidere con Consenso.Versione in src\Consenso.cs (lo controlla
; test\prova_versioni.ps1, anche nel flusso di rilascio)
#define ConsensoVersione "4"

[Setup]
AppId={{6B2C0F4E-3A1D-4C8B-9E57-2D1F7A0C5B31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; solo per l'utente corrente: nessuna finestra che proponga di installare
; per tutti gli utenti (servirebbero i diritti di amministratore)
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=Installa-Campanella
SetupIconFile=
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
; risorsa di versione: SignPath controlla nome e versione del prodotto di ogni
; file firmato (vedi signpath-artifact-configuration.xml)
VersionInfoVersion={#MyAppVersion}.0
VersionInfoTextVersion={#MyAppVersion}.0
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}.0
VersionInfoProductTextVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoCopyright=Licenza MIT
VersionInfoDescription=Installazione di Campanella
MinVersion=6.1sp1

[Languages]
Name: "it"; MessagesFile: "compiler:Languages\Italian.isl"; LicenseFile: "CONDIZIONI-it.txt"
Name: "en"; MessagesFile: "compiler:Default.isl";           LicenseFile: "CONDIZIONI-en.txt"

[CustomMessages]
it.Documenti=Copia i documenti per dirigenza e DPO nella cartella "documenti"
en.Documenti=Also copy the documents for the principal and the DPO into the "documenti" folder
it.GruppoDocumenti=Documenti
en.GruppoDocumenti=Documents
it.Istruzioni=Istruzioni
en.Istruzioni=Instructions
it.DomandaImpostazioni=Vuoi cancellare anche le impostazioni (campanella.json, struttura.json)?%n%nScegli No se pensi di reinstallare: le ritroverai tutte.
en.DomandaImpostazioni=Do you also want to delete your settings (campanella.json, struttura.json)?%n%nChoose No if you plan to reinstall: you will find them all again.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "documenti";   Description: "{cm:Documenti}";         GroupDescription: "{cm:GruppoDocumenti}"

[Files]
Source: "..\dist\{#MyAppExeName}";        DestDir: "{app}"; Flags: ignoreversion
Source: "..\ISTRUZIONI - Campanella.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\PRIVACY.md";                  DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE";                     DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
; i documenti per dirigenza e DPO: stessi nomi con cui li scrive l'applicazione
Source: "..\docs\Nota-tecnica-DS-DPO.md"; DestDir: "{app}\documenti"; DestName: "Nota tecnica per dirigente e DPO.txt"; Tasks: documenti; Flags: ignoreversion
Source: "..\docs\Email-DS-DPO.md";        DestDir: "{app}\documenti"; DestName: "Email per dirigente e DPO.txt";        Tasks: documenti; Flags: ignoreversion
Source: "..\docs\GDPR-e-DPO.md";          DestDir: "{app}\documenti"; DestName: "GDPR - cosa vale per un docente.txt";  Tasks: documenti; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}";                     Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\{cm:Istruzioni}";                  Filename: "{app}\ISTRUZIONI - Campanella.txt"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}";               Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; i documenti sono copie: si rifanno. Le impostazioni no: si chiede (vedi [Code])
Type: filesandordirs; Name: "{app}\documenti"

[Code]
// Il consenso e' stato dato nel wizard (pagina della licenza): lo registro
// come fa l'installer C#, cosi' Campanella non lo richiede al primo avvio.
// Non tocco un campanella.json gia' esistente: contiene le impostazioni.
// Con /SILENT o /VERYSILENT la pagina della licenza non compare, quindi
// nessuno ha accettato niente: non registro nulla, e le condizioni le
// chiede Campanella al primo avvio.
procedure CurStepChanged(CurStep: TSetupStep);
var
  Percorso, Contenuto: String;
begin
  if (CurStep = ssPostInstall) and not WizardSilent then
  begin
    Percorso := ExpandConstant('{app}\campanella.json');
    if not FileExists(Percorso) then
    begin
      Contenuto := '{"consensoVersione":' + '{#ConsensoVersione}' +
                   ',"consensoData":"' + GetDateTimeString('yyyy-mm-dd hh:nn', '-', ':') +
                   '","temaScuro":true}';
      SaveStringToFile(Percorso, Contenuto, False);
    end;
  end;
end;

// Alla disinstallazione chiedo se togliere anche le impostazioni: sono
// l'elenco del personale, le regole, gli orari. Il file dei dati nel Drive
// (campanella-dati.json) non viene mai toccato: sta fuori da {app}.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if MsgBox(CustomMessage('DomandaImpostazioni'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      DeleteFile(ExpandConstant('{app}\campanella.json'));
      DeleteFile(ExpandConstant('{app}\struttura.json'));
      RemoveDir(ExpandConstant('{app}'));
    end;
  end;
end;
