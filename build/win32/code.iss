#define RootLicenseFileName FileExists(RepoDir + '\LICENSE.rtf') ? 'LICENSE.rtf' : 'LICENSE.txt'
#define LocalizedLanguageFile(Language = "") \
    DirExists(RepoDir + "\licenses") && Language != "" \
      ? ('; LicenseFile: "' + RepoDir + '\licenses\LICENSE-' + Language + '.rtf"') \
      : '; LicenseFile: "' + RepoDir + '\' + RootLicenseFileName + '"'

[Setup]
AppId={#AppId}
AppName={#NameLong}
AppVerName={#NameVersion}
AppPublisher=Microsoft Corporation
AppPublisherURL=https://code.visualstudio.com/
AppSupportURL=https://code.visualstudio.com/
AppUpdatesURL=https://code.visualstudio.com/
DefaultGroupName={#NameLong}
AllowNoIcons=yes
OutputDir={#OutputDir}
OutputBaseFilename=VSCodeSetup
Compression=lzma
SolidCompression=yes
AppMutex={code:GetAppMutex}
SetupMutex={#AppMutex}setup
WizardImageFile="{#RepoDir}\resources\win32\inno-big-100.bmp,{#RepoDir}\resources\win32\inno-big-125.bmp,{#RepoDir}\resources\win32\inno-big-150.bmp,{#RepoDir}\resources\win32\inno-big-175.bmp,{#RepoDir}\resources\win32\inno-big-200.bmp,{#RepoDir}\resources\win32\inno-big-225.bmp,{#RepoDir}\resources\win32\inno-big-250.bmp"
WizardSmallImageFile="{#RepoDir}\resources\win32\inno-small-100.bmp,{#RepoDir}\resources\win32\inno-small-125.bmp,{#RepoDir}\resources\win32\inno-small-150.bmp,{#RepoDir}\resources\win32\inno-small-175.bmp,{#RepoDir}\resources\win32\inno-small-200.bmp,{#RepoDir}\resources\win32\inno-small-225.bmp,{#RepoDir}\resources\win32\inno-small-250.bmp"
SetupIconFile={#RepoDir}\resources\win32\code.ico
UninstallDisplayIcon={app}\{#ExeBasename}.exe
ChangesEnvironment=true
ChangesAssociations=true
MinVersion=10.0
SourceDir={#SourceDir}
AppVersion={#Version}
VersionInfoVersion={#RawVersion}
ShowLanguageDialog=auto
ArchitecturesAllowed={#ArchitecturesAllowed}
ArchitecturesInstallIn64BitMode={#ArchitecturesInstallIn64BitMode}
WizardStyle=modern

// We've seen an uptick on broken installations from updates which were unable
// to shutdown VS Code. We rely on the fact that the update signals
// that VS Code is ready to be shutdown, so we're good to use `force` here.
CloseApplications=force

#ifdef Sign
SignTool=esrp
#endif

#if "user" == InstallTarget
DefaultDirName={userpf}\{#DirName}
PrivilegesRequired=lowest
#else
DefaultDirName={pf}\{#DirName}
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl,{#RepoDir}\build\win32\i18n\messages.en.isl" {#LocalizedLanguageFile}
Name: "german"; MessagesFile: "compiler:Languages\German.isl,{#RepoDir}\build\win32\i18n\messages.de.isl" {#LocalizedLanguageFile("deu")}
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl,{#RepoDir}\build\win32\i18n\messages.es.isl" {#LocalizedLanguageFile("esp")}
Name: "french"; MessagesFile: "compiler:Languages\French.isl,{#RepoDir}\build\win32\i18n\messages.fr.isl" {#LocalizedLanguageFile("fra")}
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl,{#RepoDir}\build\win32\i18n\messages.it.isl" {#LocalizedLanguageFile("ita")}
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl,{#RepoDir}\build\win32\i18n\messages.ja.isl" {#LocalizedLanguageFile("jpn")}
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl,{#RepoDir}\build\win32\i18n\messages.ru.isl" {#LocalizedLanguageFile("rus")}
Name: "korean"; MessagesFile: "{#RepoDir}\build\win32\i18n\Default.ko.isl,{#RepoDir}\build\win32\i18n\messages.ko.isl" {#LocalizedLanguageFile("kor")}
Name: "simplifiedChinese"; MessagesFile: "{#RepoDir}\build\win32\i18n\Default.zh-cn.isl,{#RepoDir}\build\win32\i18n\messages.zh-cn.isl" {#LocalizedLanguageFile("chs")}
Name: "traditionalChinese"; MessagesFile: "{#RepoDir}\build\win32\i18n\Default.zh-tw.isl,{#RepoDir}\build\win32\i18n\messages.zh-tw.isl" {#LocalizedLanguageFile("cht")}
Name: "brazilianPortuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl,{#RepoDir}\build\win32\i18n\messages.pt-br.isl" {#LocalizedLanguageFile("ptb")}
Name: "hungarian"; MessagesFile: "{#RepoDir}\build\win32\i18n\Default.hu.isl,{#RepoDir}\build\win32\i18n\messages.hu.isl" {#LocalizedLanguageFile("hun")}
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl,{#RepoDir}\build\win32\i18n\messages.tr.isl" {#LocalizedLanguageFile("trk")}

[InstallDelete]
Type: filesandordirs; Name: "{app}\{#VersionedResourcesFolder}\resources\app\out"; Check: IsNotBackgroundUpdate
Type: filesandordirs; Name: "{app}\{#VersionedResourcesFolder}\resources\app\plugins"; Check: IsNotBackgroundUpdate
Type: filesandordirs; Name: "{app}\{#VersionedResourcesFolder}\resources\app\extensions"; Check: IsNotBackgroundUpdate
Type: filesandordirs; Name: "{app}\{#VersionedResourcesFolder}\resources\app\node_modules"; Check: IsNotBackgroundUpdate
Type: filesandordirs; Name: "{app}\{#VersionedResourcesFolder}\resources\app\node_modules.asar.unpacked"; Check: IsNotBackgroundUpdate
Type: files; Name: "{app}\{#VersionedResourcesFolder}\resources\app\node_modules.asar"; Check: IsNotBackgroundUpdate
Type: files; Name: "{app}\{#VersionedResourcesFolder}\resources\app\Credits_45.0.2454.85.html"; Check: IsNotBackgroundUpdate

[UninstallDelete]
Type: filesandordirs; Name: "{app}\_"
Type: filesandordirs; Name: "{app}\bin"
Type: files; Name: "{app}\old_*"
Type: files; Name: "{app}\new_*"
Type: files; Name: "{app}\updating_version"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 0,6.1
Name: "addcontextmenufiles"; Description: "{cm:AddContextMenuFiles,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked
Name: "addcontextmenufolders"; Description: "{cm:AddContextMenuFolders,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked; Check: not (IsWindows11OrLater and QualityIsInsiders)
Name: "associatewithfiles"; Description: "{cm:AssociateWithFiles,{#NameShort}}"; GroupDescription: "{cm:Other}"
Name: "addtopath"; Description: "{cm:AddToPath}"; GroupDescription: "{cm:Other}"
Name: "runcode"; Description: "{cm:RunAfter,{#NameShort}}"; GroupDescription: "{cm:Other}"; Check: WizardSilent

[Dirs]
Name: "{app}"; AfterInstall: DisableAppDirInheritance

[Files]
Source: "*"; Excludes: "\CodeSignSummary*.md,\tools,\tools\*,\policies,\policies\*,\appx,\appx\*,\resources\app\product.json,\{#ExeBasename}.exe,\{#ExeBasename}.VisualElementsManifest.xml,\bin,\bin\*"; DestDir: "{code:GetDestDir}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ExeBasename}.exe"; DestDir: "{code:GetDestDir}"; DestName: "{code:GetExeBasename}"; Flags: ignoreversion
Source: "{#ExeBasename}.VisualElementsManifest.xml"; DestDir: "{code:GetDestDir}"; DestName: "{code:GetVisualElementsManifest}"; Flags: ignoreversion
Source: "tools\*"; DestDir: "{code:GetDestDir}\{#VersionedResourcesFolder}\tools"; Flags: ignoreversion
Source: "policies\*"; DestDir: "{code:GetDestDir}\{#VersionedResourcesFolder}\policies"; Flags: ignoreversion skipifsourcedoesntexist
Source: "bin\{#TunnelApplicationName}.exe"; DestDir: "{code:GetDestDir}\bin"; DestName: "{code:GetBinDirTunnelApplicationFilename}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "bin\{#ApplicationName}.cmd"; DestDir: "{code:GetDestDir}\bin"; DestName: "{code:GetBinDirApplicationCmdFilename}"; Flags: ignoreversion
Source: "bin\{#ApplicationName}"; DestDir: "{code:GetDestDir}\bin"; DestName: "{code:GetBinDirApplicationFilename}"; Flags: ignoreversion
Source: "{#ProductJsonPath}"; DestDir: "{code:GetDestDir}\{#VersionedResourcesFolder}\resources\app"; Flags: ignoreversion
#ifdef AppxPackageName
#if "user" == InstallTarget
Source: "appx\{#AppxPackage}"; DestDir: "{code:GetDestDir}\{#VersionedResourcesFolder}\appx"; BeforeInstall: RemoveAppxPackage; Flags: ignoreversion; Check: IsWindows11OrLater
Source: "appx\{#AppxPackageDll}"; DestDir: "{code:GetDestDir}\{#VersionedResourcesFolder}\appx"; AfterInstall: AddAppxPackage; Flags: ignoreversion; Check: IsWindows11OrLater
#endif
#endif

[Icons]
Name: "{group}\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; AppUserModelID: "{#AppUserId}"
Name: "{autodesktop}\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; Tasks: desktopicon; AppUserModelID: "{#AppUserId}"
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; Tasks: quicklaunchicon; AppUserModelID: "{#AppUserId}"

[Run]
Filename: "{app}\{#ExeBasename}.exe"; Description: "{cm:LaunchProgram,{#NameLong}}"; Tasks: runcode; Flags: nowait postinstall; Check: ShouldRunAfterUpdate
Filename: "{app}\{#ExeBasename}.exe"; Description: "{cm:LaunchProgram,{#NameLong}}"; Flags: nowait postinstall; Check: WizardNotSilent

[Registry]
#if "user" == InstallTarget
#define SoftwareClassesRootKey "HKCU"
#else
#define SoftwareClassesRootKey "HKLM"
#endif

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ascx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ascx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ascx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ascx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ASCX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ascx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ascx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\xml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ascx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ascx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.asp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.asp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.asp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.asp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ASP}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.asp"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.asp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.asp\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.asp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.aspx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.aspx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.aspx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.aspx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ASPX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.aspx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.aspx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.aspx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.aspx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bash\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bash\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bash"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bash_login\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bash_login\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bash_login"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_login"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash Login}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_login"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_login\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_login\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_login\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bash_logout\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bash_logout\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bash_logout"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_logout"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash Logout}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_logout"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_logout\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_logout\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_logout\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bash_profile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bash_profile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bash_profile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_profile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash Profile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_profile"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_profile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_profile\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bash_profile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bashrc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bashrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bashrc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bashrc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash RC}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bashrc"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bashrc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bashrc\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bashrc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bib\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bib\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bib"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bib"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,BibTeX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bib"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bib\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bib\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bib\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bowerrc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.bowerrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bowerrc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bowerrc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bower RC}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bowerrc"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bowerrc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\bower.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bowerrc\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.bowerrc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.c++\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.c++\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.c++"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c++"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c++"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c++\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\cpp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c++\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.c\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.c\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.c"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\c.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.c\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cc"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\cpp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cc\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cfg\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cfg\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cfg"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cfg"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Configuration}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cfg"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cfg\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\config.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cfg\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cfg\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cjs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cjs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cjs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cjs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JavaScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cjs"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cjs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\javascript.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cjs\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cjs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.clj\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.clj\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.clj"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clj"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Clojure}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clj"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clj\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clj\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clj\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cljs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cljs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cljs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ClojureScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljs"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljs\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cljx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cljx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cljx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CLJX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cljx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.clojure\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.clojure\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.clojure"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clojure"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Clojure}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clojure"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clojure\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clojure\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.clojure\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cls\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cls\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cls"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cls"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,LaTeX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cls"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cls\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cls\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cls\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.code-workspace\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.code-workspace\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.code-workspace"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.code-workspace"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Code Workspace}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.code-workspace"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.code-workspace\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.code-workspace\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.code-workspace\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cmake\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cmake\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cmake"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cmake"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CMake}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cmake"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cmake\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cmake\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cmake\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.coffee\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.coffee\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.coffee"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.coffee"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CoffeeScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.coffee"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.coffee\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.coffee\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.coffee\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.config\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.config\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.config"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.config"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Configuration}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.config"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.config\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\config.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.config\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.config\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.containerfile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.containerfile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.containerfile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.containerfile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Containerfile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.containerfile"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.containerfile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.containerfile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cpp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cpp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cpp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cpp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cpp"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cpp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\cpp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cpp\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cpp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C#}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cs"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\csharp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cs\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cshtml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cshtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cshtml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cshtml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CSHTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cshtml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cshtml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cshtml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cshtml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.csproj\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.csproj\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.csproj"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csproj"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C# Project}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csproj"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csproj\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\xml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csproj\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csproj\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.css\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.css\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.css"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.css"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CSS}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.css"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.css\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\css.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.css\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.css\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.csv\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.csv\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.csv"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csv"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Comma Separated Values}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csv"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csv\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csv\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csv\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.csx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.csx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.csx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C# Script}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\csharp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.csx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ctp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ctp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ctp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ctp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CakePHP Template}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ctp"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ctp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ctp\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ctp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cxx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.cxx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cxx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cxx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cxx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cxx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\cpp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cxx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.cxx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.dart\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.dart\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.dart"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dart"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Dart}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dart"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dart\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dart\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dart\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.diff\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.diff\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.diff"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.diff"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Diff}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.diff"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.diff\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.diff\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.diff\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.dockerfile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.dockerfile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.dockerfile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dockerfile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Dockerfile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dockerfile"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dockerfile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dockerfile\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dockerfile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.dot\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.dot\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.dot"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dot"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Dot}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dot"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dot\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dot\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dot\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.dtd\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.dtd\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.dtd"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dtd"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Document Type Definition}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dtd"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dtd\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\xml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dtd\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.dtd\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.editorconfig\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.editorconfig\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.editorconfig"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.editorconfig"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Editor Config}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.editorconfig"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.editorconfig\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\config.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.editorconfig\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.editorconfig\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.edn\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.edn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.edn"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.edn"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Extensible Data Notation}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.edn"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.edn\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.edn\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.edn\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.erb\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.erb\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.erb"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.erb"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Ruby}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.erb"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.erb\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\ruby.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.erb\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.erb\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.eyaml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.eyaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.eyaml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyaml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Hiera Eyaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyaml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyaml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\yaml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyaml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyaml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.eyml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.eyml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.eyml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Hiera Eyaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\yaml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.eyml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.fs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.fs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.fs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,F#}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fs"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fs\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.fsi\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.fsi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.fsi"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsi"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,F# Signature}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsi"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsi\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsi\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsi\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.fsscript\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.fsscript\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.fsscript"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsscript"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,F# Script}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsscript"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsscript\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsscript\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsscript\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.fsx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.fsx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.fsx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,F# Script}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.fsx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gemspec\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gemspec\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gemspec"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gemspec"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Gemspec}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gemspec"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gemspec\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\ruby.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gemspec\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gemspec\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gitattributes\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gitattributes\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gitattributes"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitattributes"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Git Attributes}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitattributes"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitattributes"; ValueType: string; ValueName: "AlwaysShowExt"; ValueData: ""; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitattributes\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\config.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitattributes\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitattributes\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gitconfig\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gitconfig\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gitconfig"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitconfig"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Git Config}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitconfig"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitconfig"; ValueType: string; ValueName: "AlwaysShowExt"; ValueData: ""; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitconfig\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\config.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitconfig\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitconfig\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gitignore\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gitignore\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gitignore"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitignore"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Git Ignore}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitignore"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitignore"; ValueType: string; ValueName: "AlwaysShowExt"; ValueData: ""; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitignore\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\config.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitignore\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gitignore\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.go\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.go\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.go"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.go"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Go}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.go"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.go\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\go.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.go\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.go\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gradle\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.gradle\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gradle"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gradle"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Gradle}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gradle"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gradle\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gradle\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.gradle\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.groovy\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.groovy\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.groovy"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.groovy"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Groovy}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.groovy"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.groovy\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.groovy\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.groovy\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.h\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.h\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.h"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\c.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.handlebars\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.handlebars\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.handlebars"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.handlebars"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Handlebars}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.handlebars"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.handlebars\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.handlebars\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.handlebars\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.hbs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.hbs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.hbs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hbs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Handlebars}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hbs"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hbs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hbs\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hbs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.h++\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.h++\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.h++"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h++"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++ Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h++"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h++\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\cpp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.h++\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.hh\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.hh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.hh"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hh"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++ Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hh"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hh\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\cpp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hh\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hh\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.hpp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.hpp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.hpp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hpp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++ Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hpp"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hpp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\cpp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hpp\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hpp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.htm\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.htm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.htm"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.htm"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,HTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.htm"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.htm\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.htm\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.htm\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.html\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.html\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.html"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.html"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,HTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.html"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.html\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.html\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.html\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.hxx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.hxx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.hxx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hxx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++ Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hxx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hxx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\cpp.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hxx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.hxx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ini\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ini\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ini"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ini"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,INI}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ini"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ini\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\config.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ini\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ini\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ipynb\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ipynb\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ipynb"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ipynb"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Jupyter}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ipynb"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ipynb\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ipynb\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ipynb\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jade\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jade\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jade"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jade"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Jade}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jade"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jade\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\jade.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jade\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jade\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jav\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jav\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jav"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jav"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Java}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jav"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jav\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\java.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jav\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jav\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.java\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.java\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.java"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.java"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Java}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.java"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.java\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\java.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.java\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.java\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.js\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.js\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.js"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.js"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JavaScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.js"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.js\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\javascript.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.js\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.js\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jsx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jsx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jsx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JavaScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\react.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jscsrc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jscsrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jscsrc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jscsrc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JSCS RC}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jscsrc"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jscsrc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\javascript.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jscsrc\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jscsrc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jshintrc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jshintrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jshintrc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshintrc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JSHint RC}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshintrc"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshintrc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\javascript.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshintrc\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshintrc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jshtm\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jshtm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jshtm"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshtm"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JavaScript HTML Template}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshtm"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshtm\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshtm\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jshtm\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.json\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.json\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.json"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.json"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JSON}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.json"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.json\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\json.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.json\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.json\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jsp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.jsp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jsp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Java Server Pages}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsp"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsp\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.jsp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.less\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.less\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.less"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.less"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,LESS}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.less"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.less\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\less.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.less\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.less\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.log\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.log\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.log"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.log"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Log file}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.log"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.log\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.log\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.log\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.lua\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.lua\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.lua"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.lua"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Lua}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.lua"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.lua\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.lua\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.lua\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.m\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.m\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.m"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.m"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Objective C}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.m"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.m\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.m\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.m\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.makefile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.makefile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.makefile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.makefile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Makefile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.makefile"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.makefile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.makefile\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.makefile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.markdown\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.markdown\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.markdown"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.markdown"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.markdown"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.markdown\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.markdown\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.markdown\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.md"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.md"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.md"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.md\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.md\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.md\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdoc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdoc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdoc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdoc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,MDoc}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdoc"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdoc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdoc\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdoc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdown\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdown\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdown"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdown"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdown"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdown\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdown\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdown\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdtext\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdtext\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdtext"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtext"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtext"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtext\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtext\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtext\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdtxt\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdtxt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdtxt"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtxt"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtxt"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtxt\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtxt\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdtxt\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdwn\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mdwn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdwn"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdwn"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdwn"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdwn\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdwn\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mdwn\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mk\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mk\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mk"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mk"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Makefile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mk"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mk\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mk\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mk\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mkd\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mkd\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mkd"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkd"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkd"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkd\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkd\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkd\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mkdn\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mkdn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mkdn"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkdn"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkdn"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkdn\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\markdown.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkdn\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mkdn\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,OCaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mli\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mli\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mli"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mli"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,OCaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mli"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mli\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mli\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mli\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mjs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.mjs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mjs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mjs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JavaScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mjs"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mjs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\javascript.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mjs\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.mjs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.npmignore\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.npmignore\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.npmignore"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.npmignore"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,NPM Ignore}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.npmignore"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.npmignore"; ValueType: string; ValueName: "AlwaysShowExt"; ValueData: ""; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.npmignore\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.npmignore\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.npmignore\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.php\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.php\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.php"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.php"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PHP}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.php"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.php\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\php.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.php\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.php\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.phtml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.phtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.phtml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.phtml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PHP HTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.phtml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.phtml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.phtml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.phtml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pl\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pl\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pl"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pl6\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pl6\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pl6"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl6"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl 6}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl6"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl6\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl6\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pl6\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.plist\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.plist\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.plist"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.plist"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Properties file}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.plist"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.plist\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.plist\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.plist\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pm\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pm"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl Module}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pm6\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pm6\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pm6"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm6"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl 6 Module}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm6"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm6\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm6\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pm6\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pod\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pod\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pod"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pod"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl POD}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pod"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pod\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pod\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pod\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pp"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pp\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.profile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.profile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.profile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.profile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Profile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.profile"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.profile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.profile\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.profile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.properties\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.properties\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.properties"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.properties"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Properties}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.properties"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.properties\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.properties\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.properties\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ps1\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ps1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ps1"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ps1"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PowerShell}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ps1"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ps1\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\powershell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ps1\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ps1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.psd1\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.psd1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.psd1"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psd1"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PowerShell Module Manifest}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psd1"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psd1\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\powershell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psd1\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psd1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.psgi\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.psgi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.psgi"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psgi"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl CGI}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psgi"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psgi\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psgi\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psgi\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.psm1\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.psm1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.psm1"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psm1"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PowerShell Module}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psm1"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psm1\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\powershell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psm1\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.psm1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.py\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.py\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.py"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.py"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Python}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.py"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.py\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\python.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.py\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.py\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pyi\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.pyi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pyi"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pyi"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Python}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pyi"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pyi\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\python.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pyi\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.pyi\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.r\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.r\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.r"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.r"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,R}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.r"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.r\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.r\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.r\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rb\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rb\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rb"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rb"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Ruby}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rb"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rb\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\ruby.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rb\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rb\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rhistory\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rhistory\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rhistory"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rhistory"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,R History}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rhistory"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rhistory\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rhistory\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rhistory\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rprofile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rprofile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rprofile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rprofile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,R Profile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rprofile"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rprofile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rprofile\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rprofile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Rust}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rs"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rs\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rst\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rst\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rst"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rst"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Restructured Text}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rst"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rst\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rst\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rst\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rt\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.rt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rt"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rt"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Rich Text}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rt"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rt\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rt\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.rt\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.sass\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.sass\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.sass"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sass"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Sass}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sass"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sass\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\sass.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sass\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sass\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.scss\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.scss\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.scss"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.scss"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Sass}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.scss"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.scss\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\sass.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.scss\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.scss\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.sh\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.sh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.sh"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sh"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SH}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sh"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sh\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sh\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sh\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.shtml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.shtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.shtml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.shtml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SHTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.shtml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.shtml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.shtml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.shtml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.sql\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.sql\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.sql"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sql"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SQL}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sql"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sql\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\sql.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sql\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.sql\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.svg\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.svg\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.svg"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.svg"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SVG}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.svg"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.svg\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.svg\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.svg\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.t\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.t\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.t"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.t"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.t"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.t\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.t\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.t\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.tex\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.tex\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.tex"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tex"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,LaTeX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tex"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tex\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tex\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tex\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ts\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.ts\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ts"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ts"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,TypeScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ts"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ts\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\typescript.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ts\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.ts\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.toml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.toml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.toml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.toml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Toml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.toml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.toml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.toml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.toml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.tsx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.tsx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.tsx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tsx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,TypeScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tsx"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tsx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\react.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tsx\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.tsx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.txt\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.txt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.txt"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.txt"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Text}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.txt"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.txt\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.txt\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.txt\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.vb\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.vb\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.vb"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vb"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Visual Basic}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vb"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vb\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vb\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vb\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.vue\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.vue\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.vue"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vue"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,VUE}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vue"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vue\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\vue.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vue\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.vue\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.wxi\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.wxi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.wxi"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxi"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,WiX Include}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxi"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxi\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxi\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxi\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.wxl\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.wxl\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.wxl"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxl"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,WiX Localization}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxl"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxl\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxl\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxl\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.wxs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.wxs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.wxs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,WiX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxs"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxs\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.wxs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.xaml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.xaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.xaml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xaml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,XAML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xaml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xaml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\xml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xaml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xaml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.xhtml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.xhtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.xhtml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xhtml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,HTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xhtml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xhtml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\html.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xhtml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xhtml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.xml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.xml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.xml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,XML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\xml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.xml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.yaml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.yaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.yaml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yaml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Yaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yaml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yaml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\yaml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yaml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yaml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.yml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.yml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.yml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Yaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yml"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\yaml.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yml\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.yml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.zsh\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\.zsh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.zsh"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.zsh"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ZSH}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.zsh"; ValueType: string; ValueName: "AppUserModelID"; ValueData: "{#AppUserId}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.zsh\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\shell.ico"; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.zsh\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""; Tasks: associatewithfiles
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}.zsh\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}SourceFile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,{#NameLong}}"; Flags: uninsdeletekey
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}SourceFile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}SourceFile\shell\open"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"""
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}SourceFile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\Applications\{#ExeBasename}.exe"; ValueType: none; ValueName: ""; Flags: uninsdeletekey
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\Applications\{#ExeBasename}.exe\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#VersionedResourcesFolder}\resources\app\resources\win32\default.ico"
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\Applications\{#ExeBasename}.exe\shell\open"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#ExeBasename}.exe"""
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\Applications\{#ExeBasename}.exe\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""

Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\{#RegValueName}ContextMenu"; ValueType: expandsz; ValueName: "Title"; ValueData: "{cm:OpenWithCodeContextMenu,{#ShellNameShort}}"; Tasks: addcontextmenufiles; Flags: uninsdeletekey; Check: IsWindows11OrLater and QualityIsInsiders
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\*\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "{cm:OpenWithCodeContextMenu,{#ShellNameShort}}"; Tasks: addcontextmenufiles; Flags: uninsdeletekey; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\*\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufiles; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\*\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: addcontextmenufiles; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\directory\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "{cm:OpenWithCodeContextMenu,{#ShellNameShort}}"; Tasks: addcontextmenufolders; Flags: uninsdeletekey; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\directory\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufolders; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\directory\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufolders; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\directory\background\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "{cm:OpenWithCodeContextMenu,{#ShellNameShort}}"; Tasks: addcontextmenufolders; Flags: uninsdeletekey; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\directory\background\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufolders; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\directory\background\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufolders; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\Drive\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "{cm:OpenWithCodeContextMenu,{#ShellNameShort}}"; Tasks: addcontextmenufolders; Flags: uninsdeletekey; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\Drive\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufolders; Check: not (IsWindows11OrLater and QualityIsInsiders)
Root: {#SoftwareClassesRootKey}; Subkey: "Software\Classes\Drive\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufolders; Check: not (IsWindows11OrLater and QualityIsInsiders)

; Environment
#if "user" == InstallTarget
#define EnvironmentRootKey "HKCU"
#define EnvironmentKey "Environment"
#define Uninstall64RootKey "HKCU64"
#define Uninstall32RootKey "HKCU32"
#else
#define EnvironmentRootKey "HKLM"
#define EnvironmentKey "System\CurrentControlSet\Control\Session Manager\Environment"
#define Uninstall64RootKey "HKLM64"
#define Uninstall32RootKey "HKLM32"
#endif

Root: {#EnvironmentRootKey}; Subkey: "{#EnvironmentKey}"; ValueType: expandsz; ValueName: "Path"; ValueData: "{code:AddToPath|{app}\bin}"; Tasks: addtopath; Check: NeedsAddToPath(ExpandConstant('{app}\bin'))

[Code]
function IsBackgroundUpdate(): Boolean;
begin
  Result := ExpandConstant('{param:update|false}') <> 'false';
end;

function IsNotBackgroundUpdate(): Boolean;
begin
  Result := not IsBackgroundUpdate();
end;

// Don't allow installing conflicting architectures
function InitializeSetup(): Boolean;
var
  RegKey: String;
  ThisArch: String;
  AltArch: String;
begin
  Result := True;

  #if "user" == InstallTarget
    if not WizardSilent() and IsAdmin() then begin
      if MsgBox('This User Installer is not meant to be run as an Administrator. If you would like to install VS Code for all users in this system, download the System Installer instead from https://code.visualstudio.com. Are you sure you want to continue?', mbError, MB_OKCANCEL) = IDCANCEL then begin
        Result := False;
      end;
    end;
  #endif

  #if "user" == InstallTarget
    #if "arm64" == Arch
      #define IncompatibleArchRootKey "HKLM32"
    #else
      #define IncompatibleArchRootKey "HKLM64"
    #endif

    if Result and not WizardSilent() then begin
      RegKey := 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\' + copy('{#IncompatibleTargetAppId}', 2, 38) + '_is1';

      if RegKeyExists({#IncompatibleArchRootKey}, RegKey) then begin
        if MsgBox('{#NameShort} is already installed on this system for all users. We recommend first uninstalling that version before installing this one. Are you sure you want to continue the installation?', mbConfirmation, MB_YESNO) = IDNO then begin
          Result := False;
        end;
      end;
    end;
  #endif

end;

function WizardNotSilent(): Boolean;
begin
  Result := not WizardSilent();
end;

// Updates

var
	ShouldRestartTunnelService: Boolean;

function StopTunnelOtherProcesses(): Boolean;
var
	WaitCounter: Integer;
	TaskKilled: Integer;
begin
	Log('Stopping all tunnel services (at ' + ExpandConstant('"{app}\bin\{#TunnelApplicationName}.exe"') + ')');
	ShellExec('', 'powershell.exe', '-Command "Get-WmiObject Win32_Process | Where-Object { $_.ExecutablePath -eq ' + ExpandConstant('''{app}\bin\{#TunnelApplicationName}.exe''') + ' } | Select @{Name=''Id''; Expression={$_.ProcessId}} | Stop-Process -Force"', '', SW_HIDE, ewWaitUntilTerminated, TaskKilled)

	WaitCounter := 10;
	while (WaitCounter > 0) and CheckForMutexes('{#TunnelMutex}') do
	begin
		Log('Tunnel process is is still running, waiting');
		Sleep(500);
		WaitCounter := WaitCounter - 1
	end;

	if CheckForMutexes('{#TunnelMutex}') then
		begin
			Log('Unable to stop tunnel processes');
			Result := False;
		end
	else
		Result := True;
end;

procedure StopTunnelServiceIfNeeded();
var
	StopServiceResultCode: Integer;
	WaitCounter: Integer;
begin
  ShouldRestartTunnelService := False;
 	if CheckForMutexes('{#TunnelServiceMutex}') then begin
		// stop the tunnel service
		Log('Stopping the tunnel service using ' + ExpandConstant('"{app}\bin\{#ApplicationName}.cmd"'));
		ShellExec('', ExpandConstant('"{app}\bin\{#ApplicationName}.cmd"'), 'tunnel service uninstall', '', SW_HIDE, ewWaitUntilTerminated, StopServiceResultCode);

		Log('Stopping the tunnel service completed with result code ' + IntToStr(StopServiceResultCode));

		WaitCounter := 10;
		while (WaitCounter > 0) and CheckForMutexes('{#TunnelServiceMutex}') do
		begin
			Log('Tunnel service is still running, waiting');
			Sleep(500);
			WaitCounter := WaitCounter - 1
		end;
		if CheckForMutexes('{#TunnelServiceMutex}') then
			Log('Unable to stop tunnel service')
		else
			ShouldRestartTunnelService := True;
	end
end;


// called before the wizard checks for running application
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  if IsNotBackgroundUpdate() then
    StopTunnelServiceIfNeeded();

  if IsNotBackgroundUpdate() and not StopTunnelOtherProcesses() then
     Result := '{#NameShort} is still running a tunnel process. Please stop the tunnel before installing.'
  else
  	Result := '';
end;

// VS Code will create a flag file before the update starts (/update=C:\foo\bar)
// - if the file exists at this point, the user quit Code before the update finished, so don't start Code after update
// - otherwise, the user has accepted to apply the update and Code should start
function LockFileExists(): Boolean;
begin
  Result := FileExists(ExpandConstant('{param:update}'))
end;

// Check if VS Code created a session-end flag file to indicate OS is shutting down
// This prevents calling inno_updater.exe during system shutdown
function SessionEndFileExists(): Boolean;
begin
  Result := FileExists(ExpandConstant('{param:sessionend}'))
end;

function ShouldRunAfterUpdate(): Boolean;
begin
  if IsBackgroundUpdate() then
    Result := not LockFileExists()
  else
    Result := True;
end;

function IsWindows11OrLater(): Boolean;
begin
  Result := (GetWindowsVersion >= $0A0055F0);
end;

function GetAppMutex(Value: string): string;
begin
  if IsBackgroundUpdate() then
    Result := ''
  else
    Result := '{#AppMutex}';
end;

function GetDestDir(Value: string): string;
begin
  Result := ExpandConstant('{app}');
end;

function GetVisualElementsManifest(Value: string): string;
begin
  if IsBackgroundUpdate() then
    Result := ExpandConstant('new_{#ExeBasename}.VisualElementsManifest.xml')
  else
    Result := ExpandConstant('{#ExeBasename}.VisualElementsManifest.xml');
end;

function GetExeBasename(Value: string): string;
begin
  if IsBackgroundUpdate() then
    Result := ExpandConstant('new_{#ExeBasename}.exe')
  else
    Result := ExpandConstant('{#ExeBasename}.exe');
end;

function GetBinDirTunnelApplicationFilename(Value: string): string;
begin
  if IsBackgroundUpdate() then
    Result := ExpandConstant('new_{#TunnelApplicationName}.exe')
  else
    Result := ExpandConstant('{#TunnelApplicationName}.exe');
end;

function GetBinDirApplicationFilename(Value: string): string;
begin
  if IsBackgroundUpdate() then
    Result := ExpandConstant('new_{#ApplicationName}')
  else
    Result := ExpandConstant('{#ApplicationName}');
end;

function GetBinDirApplicationCmdFilename(Value: string): string;
begin
  if IsBackgroundUpdate() then
    Result := ExpandConstant('new_{#ApplicationName}.cmd')
  else
    Result := ExpandConstant('{#ApplicationName}.cmd');
end;

function BoolToStr(Value: Boolean): String;
begin
  if Value then
    Result := 'true'
  else
    Result := 'false';
end;

function QualityIsInsiders(): boolean;
begin
  if '{#Quality}' = 'insider' then
    Result := True
  else
    Result := False;
end;

#ifdef AppxPackageName
var
  AppxPackageFullname: String;

procedure ExecAndGetFirstLineLog(const S: String; const Error, FirstLine: Boolean);
begin
  if not Error and (AppxPackageFullname = '') and (Trim(S) <> '') then
    AppxPackageFullname := S;
  Log(S);
end;

function AppxPackageInstalled(const name: String; var ResultCode: Integer): Boolean;
begin
  AppxPackageFullname := '';
  try
    Log('Get-AppxPackage for package with name: ' + name);
    ExecAndLogOutput('powershell.exe', '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command ' + AddQuotes('Get-AppxPackage -Name ''' + name + ''' | Select-Object -ExpandProperty PackageFullName'), '', SW_HIDE, ewWaitUntilTerminated, ResultCode, @ExecAndGetFirstLineLog);
  except
    Log(GetExceptionMessage);
  end;
  if (AppxPackageFullname <> '') then
    Result := True
  else
    Result := False
end;

procedure AddAppxPackage();
var
  AddAppxPackageResultCode: Integer;
begin
  if not AppxPackageInstalled(ExpandConstant('{#AppxPackageName}'), AddAppxPackageResultCode) then begin
    Log('Installing appx ' + AppxPackageFullname + ' ...');
    ShellExec('', 'powershell.exe', '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command ' + AddQuotes('Add-AppxPackage -Path ''' + ExpandConstant('{app}\{#VersionedResourcesFolder}\appx\{#AppxPackage}') + ''' -ExternalLocation ''' + ExpandConstant('{app}\{#VersionedResourcesFolder}\appx') + ''''), '', SW_HIDE, ewWaitUntilTerminated, AddAppxPackageResultCode);
    Log('Add-AppxPackage complete.');
  end;
end;

procedure RemoveAppxPackage();
var
  RemoveAppxPackageResultCode: Integer;
begin
  // Remove the old context menu package
  // Following condition can be removed after two versions.
  if QualityIsInsiders() and AppxPackageInstalled('Microsoft.VSCodeInsiders', RemoveAppxPackageResultCode) then begin
    Log('Deleting old appx ' + AppxPackageFullname + ' installation...');
    ShellExec('', 'powershell.exe', '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command ' + AddQuotes('Remove-AppxPackage -Package ''' + AppxPackageFullname + ''''), '', SW_HIDE, ewWaitUntilTerminated, RemoveAppxPackageResultCode);
    DeleteFile(ExpandConstant('{app}\appx\code_insiders_explorer_{#Arch}.appx'));
    DeleteFile(ExpandConstant('{app}\appx\code_insiders_explorer_command.dll'));
  end;
  if AppxPackageInstalled(ExpandConstant('{#AppxPackageName}'), RemoveAppxPackageResultCode) then begin
    Log('Removing current ' + AppxPackageFullname + ' appx installation...');
    ShellExec('', 'powershell.exe', '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command ' + AddQuotes('Remove-AppxPackage -Package ''' + AppxPackageFullname + ''''), '', SW_HIDE, ewWaitUntilTerminated, RemoveAppxPackageResultCode);
    Log('Remove-AppxPackage for current appx installation complete.');
  end;
end;
#endif

procedure CurStepChanged(CurStep: TSetupStep);
var
  UpdateResultCode: Integer;
	StartServiceResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
#ifdef AppxPackageName
    // Remove the old context menu registry keys for insiders
    if QualityIsInsiders() and WizardIsTaskSelected('addcontextmenufiles') then begin
      RegDeleteKeyIncludingSubkeys({#EnvironmentRootKey}, 'Software\Classes\*\shell\{#RegValueName}');
      RegDeleteKeyIncludingSubkeys({#EnvironmentRootKey}, 'Software\Classes\directory\shell\{#RegValueName}');
      RegDeleteKeyIncludingSubkeys({#EnvironmentRootKey}, 'Software\Classes\directory\background\shell\{#RegValueName}');
      RegDeleteKeyIncludingSubkeys({#EnvironmentRootKey}, 'Software\Classes\Drive\shell\{#RegValueName}');
    end;
#endif

    if IsBackgroundUpdate() then
    begin
      SaveStringToFile(ExpandConstant('{app}\updating_version'), {#Commit}, False);
      CreateMutex('{#AppMutex}-ready');

      Log('Checking whether application is still running...');
      while (CheckForMutexes('{#AppMutex}')) do
      begin
        Sleep(1000)
      end;
      Log('Application appears not to be running.');

      StopTunnelServiceIfNeeded();

      if not SessionEndFileExists() then begin
        Exec(ExpandConstant('{app}\{#VersionedResourcesFolder}\tools\inno_updater.exe'), ExpandConstant('"{app}\{#ExeBasename}.exe" ' + BoolToStr(LockFileExists()) + ' "{cm:UpdatingVisualStudioCode}" "{#VersionedResourcesFolder}"'), '', SW_SHOW, ewWaitUntilTerminated, UpdateResultCode);
        DeleteFile(ExpandConstant('{app}\updating_version'));
      end else begin
        Log('Skipping inno_updater.exe call because OS session is ending');
      end;
    end else begin
      Log('Invoking inno_updater to remove previous installation folder');
      Exec(ExpandConstant('{app}\{#VersionedResourcesFolder}\tools\inno_updater.exe'), ExpandConstant('"--remove" "{app}\{#ExeBasename}.exe" "{#VersionedResourcesFolder}"'), '', SW_SHOW, ewWaitUntilTerminated, UpdateResultCode);
      Log('inno_updater completed gc successfully');
    end;

    if ShouldRestartTunnelService then
    begin
      // start the tunnel service
      Log('Restarting the tunnel service...');
      ShellExec('', ExpandConstant('"{app}\bin\{#ApplicationName}.cmd"'), 'tunnel service install', '', SW_HIDE, ewWaitUntilTerminated, StartServiceResultCode);
      Log('Starting the tunnel service completed with result code ' + IntToStr(StartServiceResultCode));
      ShouldRestartTunnelService := False
    end;
  end;
end;

// https://stackoverflow.com/a/23838239/261019
procedure Explode(var Dest: TArrayOfString; Text: String; Separator: String);
var
  i, p: Integer;
begin
  i := 0;
  repeat
    SetArrayLength(Dest, i+1);
    p := Pos(Separator,Text);
    if p > 0 then begin
      Dest[i] := Copy(Text, 1, p-1);
      Text := Copy(Text, p + Length(Separator), Length(Text));
      i := i + 1;
    end else begin
      Dest[i] := Text;
      Text := '';
    end;
  until Length(Text)=0;
end;

function NeedsAddToPath(VSCode: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue({#EnvironmentRootKey}, '{#EnvironmentKey}', 'Path', OrigPath)
  then begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + VSCode + ';', ';' + OrigPath + ';') = 0;
end;

function AddToPath(VSCode: string): string;
var
  OrigPath: string;
begin
  RegQueryStringValue({#EnvironmentRootKey}, '{#EnvironmentKey}', 'Path', OrigPath)

  if (Length(OrigPath) > 0) and (OrigPath[Length(OrigPath)] = ';') then
    Result := OrigPath + VSCode
  else
    Result := OrigPath + ';' + VSCode
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Path: string;
  VSCodePath: string;
  Parts: TArrayOfString;
  NewPath: string;
  i: Integer;
begin
  if not CurUninstallStep = usUninstall then begin
    exit;
  end;
#ifdef AppxPackageName
  #if "user" == InstallTarget
    RemoveAppxPackage();
  #endif
#endif
  if not RegQueryStringValue({#EnvironmentRootKey}, '{#EnvironmentKey}', 'Path', Path)
  then begin
    exit;
  end;
  NewPath := '';
  VSCodePath := ExpandConstant('{app}\bin')
  Explode(Parts, Path, ';');
  for i:=0 to GetArrayLength(Parts)-1 do begin
    if CompareText(Parts[i], VSCodePath) <> 0 then begin
      NewPath := NewPath + Parts[i];

      if i < GetArrayLength(Parts) - 1 then begin
        NewPath := NewPath + ';';
      end;
    end;
  end;
  RegWriteExpandStringValue({#EnvironmentRootKey}, '{#EnvironmentKey}', 'Path', NewPath);
end;

#ifdef Debug
  #expr SaveToFile(AddBackslash(SourcePath) + "code-processed.iss")
#endif

// https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/icacls
// https://docs.microsoft.com/en-US/windows/security/identity-protection/access-control/security-identifiers
procedure DisableAppDirInheritance();
var
  ResultCode: Integer;
  Permissions: string;
begin
  Permissions := '/grant:r "*S-1-5-18:(OI)(CI)F" /grant:r "*S-1-5-32-544:(OI)(CI)F" /grant:r "*S-1-5-11:(OI)(CI)RX" /grant:r "*S-1-5-32-545:(OI)(CI)RX"';

  #if "user" == InstallTarget
    Permissions := Permissions + Format(' /grant:r "*S-1-3-0:(OI)(CI)F" /grant:r "%s:(OI)(CI)F"', [GetUserNameString()]);
  #endif

  Exec(ExpandConstant('{sys}\icacls.exe'), ExpandConstant('"{app}" /inheritancelevel:r ') + Permissions, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
